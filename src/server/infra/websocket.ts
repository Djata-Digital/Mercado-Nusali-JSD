import { WebSocketServer, WebSocket, type RawData } from 'ws';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { logger } from './logger.js';
import { getJwtAccessSecret } from '../modules/auth/jwtConfig.js';
import {
  ANONYMOUS_WS_CONTEXT,
  WS_PUBLIC_ROOM,
  WS_ADMIN_ROOM,
  authorizeWebSocketSubscription,
  isPrivateRoom,
  roomsForContext,
  userRoomName,
  type WsAuthContext,
} from './wsRoomPolicy.js';

/**
 * WebSocket (WS-SEC). Conectar NÃO autoriza nada: toda conexão nasce anônima (sala `public`). A identidade só é
 * estabelecida pelo SERVIDOR, depois de uma mensagem `{type:'AUTH', token}`:
 *   1. o JWT de acesso é verificado (mesma chave e algoritmo HS256 do HTTP; assinatura e expiração);
 *   2. o usuário é carregado do BANCO e precisa existir, estar ativo e com e-mail verificado (mesmas regras do HTTP);
 *   3. o PAPEL usado é o do banco, nunca a claim do token (claim antiga/forjada não escala privilégio).
 * Nunca se confia em userId/role/sala enviados pelo cliente. O token NÃO vai na URL (ficaria em logs de proxy/CDN) e nunca é logado.
 * `SUBSCRIBE` passa SEMPRE por authorizeWebSocketSubscription (default deny, wsRoomPolicy.ts). A autorização expira junto
 * com o token: depois do `exp`, a entrega de eventos privados para o socket é cortada.
 */

export interface WsUserRecord {
  id: string;
  role: string;
  isActive: boolean;
  isEmailVerified: boolean;
}
export type WsUserLoader = (userId: string) => Promise<WsUserRecord | null>;

export interface WebSocketServerOptions {
  /** Carrega o usuário do banco. Injetável para testes; o padrão consulta a tabela users. */
  loadUser?: WsUserLoader;
}

interface WsClient {
  ws: WebSocket;
  ctx: WsAuthContext;
  /** Instante (ms) em que a autenticação expira (exp do JWT). Só existe quando autenticado. */
  authExpiresAt?: number;
  rooms: Set<string>;
  /** Janela deslizante de tentativas de AUTH (limita consulta ao banco por conexão). */
  authAttempts: number[];
}

const MAX_MESSAGE_BYTES = 16 * 1024;
const MAX_TOKEN_CHARS = 4096;
const AUTH_ATTEMPT_LIMIT = 10;
const AUTH_ATTEMPT_WINDOW_MS = 60_000;
const MAX_USER_ID_CHARS = 128;

const clients = new Map<WebSocket, WsClient>();

const defaultLoadUser: WsUserLoader = async (userId) => {
  // import dinâmico: evita ciclo de módulos e mantém este arquivo leve em testes sem banco
  const [{ getDb }, { users }, { eq }] = await Promise.all([import('../../db/index.js'), import('../../db/schema.js'), import('drizzle-orm')]);
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select({ id: users.id, role: users.role, isActive: users.isActive, isEmailVerified: users.isEmailVerified })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const row = rows[0];
  return row ? { id: row.id, role: String(row.role || ''), isActive: row.isActive !== false, isEmailVerified: row.isEmailVerified === true } : null;
};

function send(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

/** Volta o socket a anônimo: remove identidade e TODAS as salas privadas. */
function resetToAnonymous(client: WsClient) {
  client.ctx = ANONYMOUS_WS_CONTEXT;
  client.authExpiresAt = undefined;
  client.rooms = new Set([WS_PUBLIC_ROOM]);
}

/** Corta a autorização se o token já expirou. Retorna true se ainda vale (ou se nunca foi autenticado). */
function enforceAuthExpiry(client: WsClient): boolean {
  if (client.authExpiresAt !== undefined && Date.now() >= client.authExpiresAt) {
    resetToAnonymous(client);
    send(client.ws, { type: 'AUTH_EXPIRED' });
    return false;
  }
  return true;
}

async function authenticate(client: WsClient, token: unknown, loadUser: WsUserLoader): Promise<boolean> {
  // qualquer falha => anônimo (fail closed); nunca devolve detalhes nem o token
  resetToAnonymous(client);
  if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_CHARS) return false;

  let decoded: unknown;
  try {
    decoded = jwt.verify(token, getJwtAccessSecret(), { algorithms: ['HS256'] });
  } catch {
    return false;
  }
  if (!decoded || typeof decoded !== 'object') return false;
  const claims = decoded as { userId?: unknown; exp?: unknown };
  if (typeof claims.userId !== 'string' || claims.userId.length === 0 || claims.userId.length > MAX_USER_ID_CHARS) return false;
  if (typeof claims.exp !== 'number') return false;

  let user: WsUserRecord | null;
  try {
    user = await loadUser(claims.userId);
  } catch {
    return false;
  }
  if (!user || user.id !== claims.userId || user.isActive === false || user.isEmailVerified !== true) return false;

  // o cliente pode ter fechado enquanto o banco respondia
  if (client.ws.readyState !== WebSocket.OPEN) return false;

  client.ctx = { authenticated: true, userId: user.id, role: String(user.role || '').toUpperCase() };
  client.authExpiresAt = claims.exp * 1000;
  client.rooms = new Set(roomsForContext(client.ctx));
  return true;
}

function allowAuthAttempt(client: WsClient): boolean {
  const now = Date.now();
  client.authAttempts = client.authAttempts.filter((t) => now - t < AUTH_ATTEMPT_WINDOW_MS);
  if (client.authAttempts.length >= AUTH_ATTEMPT_LIMIT) return false;
  client.authAttempts.push(now);
  return true;
}

export function setupWebSocketServer(server: HttpServer, options: WebSocketServerOptions = {}) {
  const loadUser = options.loadUser ?? defaultLoadUser;
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_MESSAGE_BYTES });

  wss.on('connection', (ws: WebSocket) => {
    // Toda conexão nasce ANÔNIMA. Token em query string/subprotocolo NÃO é mais aceito (não autentica; fail closed).
    const client: WsClient = { ws, ctx: ANONYMOUS_WS_CONTEXT, rooms: new Set([WS_PUBLIC_ROOM]), authAttempts: [] };
    clients.set(ws, client);
    logger.info({ totalClients: clients.size }, 'WebSocket client connected');

    // Mensagens de uma conexão são processadas EM ORDEM (AUTH consulta o banco; um SUBSCRIBE logo depois espera o resultado).
    let queue: Promise<void> = Promise.resolve();

    const handle = async (data: RawData, isBinary: boolean) => {
      if (isBinary) return;
      let parsed: any;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return; // JSON inválido: ignorado
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;

      if (parsed.type === 'PING') {
        send(ws, { type: 'PONG', timestamp: Date.now() });
        return;
      }

      if (parsed.type === 'AUTH') {
        if (!allowAuthAttempt(client)) {
          send(ws, { type: 'AUTH_FAILED' });
          return;
        }
        const ok = await authenticate(client, parsed.token, loadUser);
        if (ok) send(ws, { type: 'AUTHENTICATED', userId: client.ctx.userId });
        else send(ws, { type: 'AUTH_FAILED' });
        return;
      }

      if (parsed.type === 'SUBSCRIBE') {
        enforceAuthExpiry(client);
        const room = parsed.room;
        if (authorizeWebSocketSubscription(client.ctx, room)) {
          client.rooms.add(room as string);
          send(ws, { type: 'SUBSCRIBED', room });
        } else {
          // resposta genérica: não ecoa a sala nem revela se o recurso existe
          send(ws, { type: 'ERROR', code: 'SUBSCRIBE_DENIED' });
          logger.warn({ userId: client.ctx.userId, authenticated: client.ctx.authenticated, room: typeof room === 'string' ? room.slice(0, 64) : typeof room }, 'WS_SUBSCRIBE_DENIED');
        }
      }
    };

    ws.on('message', (data: RawData, isBinary: boolean) => {
      queue = queue.then(() => handle(data, isBinary)).catch(() => {
        /* nunca derruba a conexão por erro de uma mensagem */
      });
    });

    ws.on('close', () => {
      clients.delete(ws);
      logger.info({ remainingClients: clients.size }, 'WebSocket client disconnected');
    });

    ws.on('error', (err) => {
      logger.warn({ err: err.message }, 'WebSocket client error');
    });

    // Boas-vindas: sempre anônimo no handshake (a identidade vem do AUTH).
    send(ws, { type: 'CONNECTED', userId: 'anonymous', role: 'guest', timestamp: Date.now() });
  });

  return wss;
}

export function broadcastToRoom(room: string, payload: any) {
  const message = JSON.stringify(payload);
  const privateRoom = isPrivateRoom(room);
  for (const client of clients.values()) {
    if (!client.rooms.has(room) || client.ws.readyState !== WebSocket.OPEN) continue;
    // sala privada: a autorização precisa ainda estar vigente (token não expirado)
    if (privateRoom && !enforceAuthExpiry(client)) continue;
    client.ws.send(message);
  }
}

export function broadcastToUser(userId: string, payload: any) {
  // ID ausente/vazio (ex.: remessa sem comprador) NÃO pode virar a sala "user:"
  if (typeof userId !== 'string' || userId.length === 0 || userId.length > MAX_USER_ID_CHARS) return;
  broadcastToRoom(userRoomName(userId), payload);
}

export function broadcastAdminEvent(payload: any) {
  broadcastToRoom(WS_ADMIN_ROOM, payload);
}
