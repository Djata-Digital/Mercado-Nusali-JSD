import { logger } from '../../infra/logger.js';

export function getJwtAccessSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    if (!secret || !secret.trim() || secret.includes('default') || secret.includes('change_in_prod')) {
      logger.error('[FATAL SECURITY CONFIG ERROR] JWT_ACCESS_SECRET must be explicitly set to a strong secret in production environment.');
      throw new Error('Configuração de segurança fatal: JWT_ACCESS_SECRET não configurado em ambiente de produção.');
    }
    return secret;
  }

  return secret || 'nusali_jwt_secret_default_change_in_prod';
}

export function getJwtRefreshSecret(): string {
  const secret = process.env.JWT_REFRESH_SECRET;
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    if (!secret || !secret.trim() || secret.includes('default') || secret.includes('change_in_prod')) {
      logger.error('[FATAL SECURITY CONFIG ERROR] JWT_REFRESH_SECRET must be explicitly set to a strong secret in production environment.');
      throw new Error('Configuração de segurança fatal: JWT_REFRESH_SECRET não configurado em ambiente de produção.');
    }
    return secret;
  }

  return secret || 'nusali_jwt_refresh_secret_default';
}

export function validateJwtConfigInProduction() {
  if (process.env.NODE_ENV === 'production') {
    getJwtAccessSecret();
    getJwtRefreshSecret();
  }
}
