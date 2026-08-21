export const API_CONFIG = {
  API_URL: (typeof process !== 'undefined' && process.env?.VITE_API_URL) || '/api/v1',
  UPLOAD_URL: (typeof process !== 'undefined' && process.env?.VITE_UPLOAD_URL) || '/api/v1/upload',
  WS_URL: (typeof process !== 'undefined' && process.env?.VITE_WEBSOCKET_URL) || '/ws',
  USE_FAKE_API: false, // Set to false: Real backend database & state engine active
  TIMEOUT: 15000,
};

