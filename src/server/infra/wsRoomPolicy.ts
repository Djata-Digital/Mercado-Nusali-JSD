/**
 * Política CENTRAL de autorização de salas do WebSocket (WS-SEC). Funções puras, DEFAULT DENY.
 *
 * Salas REAIS do sistema (auditadas no código; só estas existem):
 *   public       automática para toda conexão; nenhum emissor publica nela.
 *   user:<id>    eventos privados de UM usuário (PAYMENT_CONFIRMED, ORDER_PAID, SHIPMENT_*). Emitida por broadcastToUser().
 *   admin        eventos administrativos/financeiros (PAYMENT_RECEIVED, LATE_PAYMENT_SURPLUS, LOGISTICS_SHIPMENT_UPDATED).
 *
 * Regras:
 *   - O contexto (userId, role) é estabelecido pelo SERVIDOR (JWT verificado + usuário carregado do banco). Nunca vem do cliente.
 *   - `user:<id>`: SOMENTE o próprio usuário (igualdade exata com o userId do servidor). Nem admin entra na sala de outro
 *     usuário: nenhum fluxo do sistema precisa disso (privilégio mínimo).
 *   - `admin`: somente GLOBAL_ADMIN ou ADMIN (os papéis que o sistema trata como administradores: requireRole / DEV_SIMULATOR).
 *     Papéis operacionais (COUNTRY_REPRESENTATIVE, REGIONAL_SUPERVISOR, FINANCE, LOGISTICS...) ficam de fora: os eventos da sala
 *     admin não são filtrados por país/escopo, então dar acesso a eles vazaria dados de outros escopos.
 *   - Comparação EXATA e sensível a maiúsculas: nada de trim, lowercase, decode ou prefixo. Tipo diferente de string => negado.
 *   - Qualquer outra sala (desconhecida, malformada, "ADMIN", " admin", "user:", "user:<outro>", seller:*, order:*...) => NEGADA.
 */

export const WS_PUBLIC_ROOM = 'public';
export const WS_ADMIN_ROOM = 'admin';

/** Papéis (maiúsculos, vindos do BANCO) autorizados a assinar a sala admin. */
export const WS_ADMIN_ROOM_ROLES: ReadonlySet<string> = new Set(['GLOBAL_ADMIN', 'ADMIN']);

export interface WsAuthContext {
  authenticated: boolean;
  /** ID do usuário verificado pelo servidor. */
  userId?: string;
  /** Papel do usuário lido do BANCO (nunca a claim do token). */
  role?: string;
}

export const ANONYMOUS_WS_CONTEXT: WsAuthContext = Object.freeze({ authenticated: false });

export function userRoomName(userId: string): string {
  return `user:${userId}`;
}

export function isWsAdminRole(role: unknown): boolean {
  return typeof role === 'string' && WS_ADMIN_ROOM_ROLES.has(role.toUpperCase());
}

function hasVerifiedIdentity(ctx: WsAuthContext | null | undefined): ctx is WsAuthContext & { userId: string } {
  return !!ctx && ctx.authenticated === true && typeof ctx.userId === 'string' && ctx.userId.length > 0;
}

/** true se a sala NÃO é a pública (tudo que não é `public` é tratado como privado). */
export function isPrivateRoom(room: string): boolean {
  return room !== WS_PUBLIC_ROOM;
}

/** Decide se o contexto pode assinar a sala. Default deny. `room` é entrada NÃO CONFIÁVEL do cliente. */
export function authorizeWebSocketSubscription(ctx: WsAuthContext | null | undefined, room: unknown): boolean {
  if (typeof room !== 'string') return false;
  if (room === WS_PUBLIC_ROOM) return true;
  if (!hasVerifiedIdentity(ctx)) return false;
  if (room === WS_ADMIN_ROOM) return isWsAdminRole(ctx.role);
  if (room === userRoomName(ctx.userId)) return true;
  return false;
}

/** Salas que o servidor concede automaticamente a uma identidade já verificada (todas derivadas de dados do servidor). */
export function roomsForContext(ctx: WsAuthContext | null | undefined): string[] {
  const rooms = [WS_PUBLIC_ROOM];
  if (!hasVerifiedIdentity(ctx)) return rooms;
  rooms.push(userRoomName(ctx.userId));
  if (isWsAdminRole(ctx.role)) rooms.push(WS_ADMIN_ROOM);
  return rooms;
}
