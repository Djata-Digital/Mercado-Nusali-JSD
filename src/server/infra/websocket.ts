import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { logger } from './logger.js';
import { getJwtAccessSecret } from '../modules/auth/jwtConfig.js';

interface AuthenticatedClient {
  ws: WebSocket;
  userId?: string;
  role?: string;
  rooms: Set<string>;
}

const clients = new Map<WebSocket, AuthenticatedClient>();

export function setupWebSocketServer(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket, req) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token') || (req.headers['sec-websocket-protocol'] as string);

    let userId: string | undefined;
    let role: string | undefined;

    if (token) {
      try {
        const secret = getJwtAccessSecret();
        const decoded = jwt.verify(token, secret) as { userId: string; role: string };
        userId = decoded.userId;
        role = decoded.role;
      } catch {
        // Unauthenticated anonymous connection
      }
    }

    const client: AuthenticatedClient = {
      ws,
      userId,
      role,
      rooms: new Set(['public']),
    };

    if (userId) {
      client.rooms.add(`user:${userId}`);
    }
    if (role === 'ADMIN') {
      client.rooms.add('admin');
    }

    clients.set(ws, client);
    logger.info({ userId, role, totalClients: clients.size }, 'WebSocket client connected');

    ws.on('message', (message: string) => {
      try {
        const parsed = JSON.parse(message.toString());
        if (parsed.type === 'SUBSCRIBE' && parsed.room) {
          client.rooms.add(parsed.room);
          ws.send(JSON.stringify({ type: 'SUBSCRIBED', room: parsed.room }));
        } else if (parsed.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
        }
      } catch {
        // ignore invalid json
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      logger.info({ userId, remainingClients: clients.size }, 'WebSocket client disconnected');
    });

    ws.on('error', (err) => {
      logger.warn({ err: err.message }, 'WebSocket client error');
    });

    // Welcome message
    ws.send(
      JSON.stringify({
        type: 'CONNECTED',
        userId: userId || 'anonymous',
        role: role || 'guest',
        timestamp: Date.now(),
      })
    );
  });

  return wss;
}

export function broadcastToRoom(room: string, payload: any) {
  const message = JSON.stringify(payload);
  for (const client of clients.values()) {
    if (client.rooms.has(room) && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  }
}

export function broadcastToUser(userId: string, payload: any) {
  broadcastToRoom(`user:${userId}`, payload);
}

export function broadcastAdminEvent(payload: any) {
  broadcastToRoom('admin', payload);
}
