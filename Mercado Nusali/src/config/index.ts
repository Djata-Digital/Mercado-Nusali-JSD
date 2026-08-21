import { API_CONFIG } from './api';

export const CONFIG = {
  ...API_CONFIG,
  WEBSOCKET_URL: API_CONFIG.WS_URL,
  TIMEOUT_MS: API_CONFIG.TIMEOUT,
  DEFAULT_COUNTRY: 'GW' as const,
  DEFAULT_LANGUAGE: 'pt-GW' as const,
  DEFAULT_CURRENCY: 'XOF' as const,
};

export { API_CONFIG };

