const isProdNode = typeof process !== 'undefined' && process.env?.NODE_ENV === 'production';

const getViteEnv = (key: string): string | undefined => {
  try {
    if (typeof process !== 'undefined' && process.env?.[key]) {
      return process.env[key];
    }
  } catch {}
  try {
    const meta = (import.meta as any).env;
    return meta ? meta[key] : undefined;
  } catch {}
  return undefined;
};

const resolveApiUrl = (): string => {
  const envBase = getViteEnv('VITE_API_BASE_URL') || getViteEnv('VITE_API_URL');

  if (envBase && typeof envBase === 'string' && envBase.trim()) {
    const cleanBase = envBase.trim().replace(/\/+$/, '');
    return cleanBase.endsWith('/api/v1') ? cleanBase : `${cleanBase}/api/v1`;
  }

  return '/api/v1';
};

const resolvePaymentEnv = (): string => {
  const env = getViteEnv('VITE_PAYMENT_ENV');
  if (env && typeof env === 'string' && env.trim()) {
    return env.trim();
  }

  let isProdVite = false;
  try {
    isProdVite = (import.meta as any).env?.PROD === true;
  } catch {}

  return (isProdNode || isProdVite) ? 'production' : 'sandbox';
};

export const API_CONFIG = {
  API_URL: resolveApiUrl(),
  UPLOAD_URL: `${resolveApiUrl()}/upload`,
  WS_URL: getViteEnv('VITE_WEBSOCKET_URL') || '/ws',
  PAYMENT_ENV: resolvePaymentEnv(),
  USE_FAKE_API: false, // Set to false: Real backend database & state engine active
  TIMEOUT: 15000,
};
