export interface AsaasConfig {
  environment: string;
  baseUrl: string;
  apiKey: string;
  userAgent: string;
}

export function getAsaasConfig(): AsaasConfig {
  const environment = process.env.ASAAS_ENVIRONMENT || 'sandbox';
  const baseUrl = (process.env.ASAAS_BASE_URL || 'https://api-sandbox.asaas.com/v3').replace(/\/+$/, '');
  const apiKey = process.env.ASAAS_API_KEY || '';
  const userAgent = process.env.ASAAS_USER_AGENT || 'MercadoNusali/1.0 (Node.js; sandbox)';

  return {
    environment,
    baseUrl,
    apiKey,
    userAgent,
  };
}

export function validateAsaasConfig(): AsaasConfig {
  const config = getAsaasConfig();
  if (!config.apiKey || !config.apiKey.trim()) {
    const err: any = new Error('ASAAS_NOT_CONFIGURED: ASAAS_API_KEY não está configurada nas variáveis de ambiente (.env).');
    err.code = 'ASAAS_NOT_CONFIGURED';
    throw err;
  }
  return config;
}
