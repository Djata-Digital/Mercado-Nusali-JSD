import { API_CONFIG } from '../config/api';

export type SocketEventType =
  | 'notification:new'
  | 'chat:message'
  | 'chat:typing'
  | 'order:status_update'
  | 'escrow:released'
  | 'escrow:disputed'
  | 'dispute:message'
  | 'dispute:status_update'
  | 'logistics:location_update';

export type SocketEventListener = (payload: any) => void;

export class SocketService {
  private socket: WebSocket | null = null;
  private listeners: Map<SocketEventType, Set<SocketEventListener>> = new Map();
  private isConnected: boolean = false;

  constructor() {
    // Structure prepared for WebSocket
  }

  public connect(token?: string): void {
    if (API_CONFIG.USE_FAKE_API) {
      console.log('[SocketService] Running in Fake API mode. Connection mocked.');
      this.isConnected = true;
      return;
    }

    if (this.socket) {
      return;
    }

    const wsUrl = `${API_CONFIG.WS_URL}?token=${token || ''}`;
    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.isConnected = true;
        console.log('[SocketService] WebSocket Connected to NestJS Gateway');
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const { type, payload } = data;
          if (type && this.listeners.has(type)) {
            this.listeners.get(type)?.forEach((listener) => listener(payload));
          }
        } catch (e) {
          console.error('[SocketService] Error parsing event data:', e);
        }
      };

      this.socket.onclose = () => {
        this.isConnected = false;
        this.socket = null;
        console.log('[SocketService] WebSocket Disconnected');
      };

      this.socket.onerror = (err) => {
        console.error('[SocketService] WebSocket Error:', err);
      };
    } catch (err) {
      console.warn('[SocketService] WebSocket initialization deferred:', err);
    }
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.isConnected = false;
    }
  }

  public on(event: SocketEventType, listener: SocketEventListener): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(listener);

    return () => {
      this.off(event, listener);
    };
  }

  public off(event: SocketEventType, listener: SocketEventListener): void {
    if (this.listeners.has(event)) {
      this.listeners.get(event)?.delete(listener);
    }
  }

  public emit(event: SocketEventType, payload: any): void {
    if (API_CONFIG.USE_FAKE_API) {
      console.log(`[SocketService Mock Emit] Event: ${event}`, payload);
      return;
    }

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: event, payload }));
    } else {
      console.warn('[SocketService] Cannot emit, socket is not connected');
    }
  }

  public emitNotification(payload: any) {
    this.emit('notification:new', payload);
  }

  public emitChatMessage(payload: any) {
    this.emit('chat:message', payload);
  }

  public emitOrderStatusUpdate(payload: any) {
    this.emit('order:status_update', payload);
  }

  public emitEscrowUpdate(payload: any) {
    this.emit('escrow:released', payload);
  }

  public emitDisputeMessage(payload: any) {
    this.emit('dispute:message', payload);
  }

  public emitLogisticsUpdate(payload: any) {
    this.emit('logistics:location_update', payload);
  }
}

export const socketService = new SocketService();
