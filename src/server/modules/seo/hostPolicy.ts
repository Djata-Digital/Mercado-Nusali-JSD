/**
 * Política de host canônico (C3.2) — middleware de Express.
 *
 * - Só atua quando PUBLIC_APP_URL está configurada e válida (seoConfig.ts). Sem ela: NADA muda (nem redirect, nem header).
 * - Em host NÃO canônico, respostas de PÁGINA (HTML/estáticos de página) recebem `X-Robots-Tag: noindex, nofollow`. A API
 *   (/api, /ws, health) e os assets técnicos (/assets/) nunca são tratados como página.
 * - Com CANONICAL_HOST_REDIRECT_ENABLED=true: GET/HEAD de PÁGINA em host não canônico => 301 para a origem canônica,
 *   preservando caminho e query. A API em api.mercado.nusali.com continua servida normalmente (webhooks do Asaas, /ws).
 * - O host vem de `req.hostname` do Express, que SÓ considera X-Forwarded-Host de proxies confiáveis (configureTrustProxy:
 *   Render privado + Cloudflare). Nunca lemos X-Forwarded-Host/Host na mão. O destino do redirect é SEMPRE a origem
 *   canônica configurada + req.originalUrl: não existe open redirect (o host destino nunca vem da requisição).
 */
import type { Request, Response, NextFunction } from 'express';
import { getSeoConfig, type SeoConfig } from './seoConfig.js';

export type RequestPathKind = 'api' | 'asset' | 'page';

export function classifyRequestPath(pathname: string): RequestPathKind {
  const p = String(pathname || '/');
  if (p === '/api' || p.startsWith('/api/')) return 'api';
  if (p === '/ws' || p.startsWith('/ws/')) return 'api';
  if (p === '/health' || p === '/healthz' || p.startsWith('/health/')) return 'api';
  if (p.startsWith('/assets/')) return 'asset';
  return 'page';
}

export function createCanonicalHostMiddleware(getConfig: () => SeoConfig = () => getSeoConfig()) {
  return function canonicalHost(req: Request, res: Response, next: NextFunction) {
    const cfg = getConfig();
    if (!cfg.explicit) return next();

    const requestHost = String(req.hostname || '').toLowerCase();
    if (requestHost === cfg.host) return next(); // host canônico: nada a fazer

    if (classifyRequestPath(req.path) !== 'page') return next(); // API / assets técnicos: intocados

    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    if (cfg.redirectEnabled && (req.method === 'GET' || req.method === 'HEAD')) {
      return res.redirect(301, `${cfg.origin}${req.originalUrl}`);
    }
    return next();
  };
}
