/**
 * Política de host canônico (C3.2) — middleware de Express.
 *
 * - Só atua quando PUBLIC_APP_URL está configurada e válida (seoConfig.ts). Sem ela: NADA muda (nem redirect, nem header).
 * - Em host NÃO canônico, respostas de PÁGINA (HTML/estáticos de página) recebem `X-Robots-Tag: noindex, nofollow`. A API
 *   (/api, /ws, health) e os assets técnicos (/assets/) nunca são tratados como página.
 * - Com CANONICAL_HOST_REDIRECT_ENABLED=true: GET/HEAD de PÁGINA em host não canônico => 301 para a origem canônica,
 *   preservando caminho e query. A API em api.mercado.nusali.com continua servida normalmente (webhooks do Asaas, /ws).
 * - O host da DECISÃO vem de `req.hostname` do Express (configureTrustProxy: Render privado + Cloudflare). ATENÇÃO (C3.7): o
 *   Express prefere X-Forwarded-Host enviado pelo cliente e nem a Cloudflare nem o Render o sobrescrevem; logo `req.hostname`
 *   é forjável. O destino do redirect é SEMPRE a origem canônica configurada + req.originalUrl: não existe open redirect
 *   (o host destino nunca vem da requisição).
 * - MODO SOMBRA (C3.7A, HOST_POLICY_SHADOW_MODE=true, default desligado): só OBSERVA. Classifica o Host bruto
 *   (`req.headers.host`) e o hostname resolvido e devolve `X-Host-Policy-Diagnostic: raw=<..>;resolved=<..>` (apenas
 *   classificações; nunca o valor dos hosts, X-Forwarded-Host ou IP). O Host bruto NUNCA entra em decisão, redirect,
 *   canonical, autenticação ou autorização nesta etapa: serve apenas para provar em produção se ele é uma fonte confiável.
 */
import type { Request, Response, NextFunction } from 'express';
import { getSeoConfig, isHostShadowModeEnabled, type SeoConfig } from './seoConfig.js';

export type RequestPathKind = 'api' | 'asset' | 'page';
export type HostClass = 'canonical' | 'other';
export type RawHostClass = HostClass | 'invalid';

export const HOST_DIAGNOSTIC_HEADER = 'X-Host-Policy-Diagnostic';

export function classifyRequestPath(pathname: string): RequestPathKind {
  const p = String(pathname || '/');
  if (p === '/api' || p.startsWith('/api/')) return 'api';
  if (p === '/ws' || p.startsWith('/ws/')) return 'api';
  if (p === '/health' || p === '/healthz' || p.startsWith('/health/')) return 'api';
  if (p.startsWith('/assets/')) return 'asset';
  return 'page';
}

const HOST_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const IPV6_RE = /^\[([0-9a-f:.]+)\](?::(\d{1,5}))?$/;

/**
 * Normaliza o valor bruto do header Host para um hostname comparável (minúsculas, sem porta). Devolve null quando o valor
 * é vazio ou malformado: credenciais (@), caminho (/), query (?), fragmento (#), contrabarra, espaços/controle, porta
 * inválida, rótulo inválido ou tamanho acima de 253. IPv6 literal mantém os colchetes. Função pura; o resultado serve
 * somente para comparação/diagnóstico, nunca para montar URL.
 */
export function normalizeRawHost(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (!v || v.length > 260) return null;
  if (/[\s\u0000-\u001f\u007f/?#@\\%]/.test(v)) return null;

  const validPort = (p: string | undefined) => p === undefined || (Number(p) >= 1 && Number(p) <= 65535);

  const v6 = IPV6_RE.exec(v);
  if (v6) return validPort(v6[2]) ? `[${v6[1]}]` : null;
  if (v.startsWith('[')) return null;

  const colon = v.indexOf(':');
  const hostPart = colon === -1 ? v : v.slice(0, colon);
  const portPart = colon === -1 ? undefined : v.slice(colon + 1);
  if (portPart !== undefined && (!/^\d{1,5}$/.test(portPart) || !validPort(portPart))) return null;

  const hostname = hostPart.endsWith('.') ? hostPart.slice(0, -1) : hostPart;
  if (!hostname || hostname.length > 253) return null;
  if (!hostname.split('.').every((label) => label.length <= 63 && HOST_LABEL_RE.test(label))) return null;
  return hostname;
}

export function classifyRawHost(rawHeader: unknown, canonicalHost: string): RawHostClass {
  const normalized = normalizeRawHost(rawHeader);
  if (normalized === null) return 'invalid';
  return normalized === canonicalHost ? 'canonical' : 'other';
}

/** Mesma comparação da decisão real (hostname resolvido pelo Express), apenas classificada. */
export function classifyResolvedHost(hostname: unknown, canonicalHost: string): HostClass {
  return String(hostname || '').toLowerCase() === canonicalHost ? 'canonical' : 'other';
}

/** Valor do header de diagnóstico: só classificações fixas. */
export function buildHostDiagnostic(rawHeader: unknown, hostname: unknown, canonicalHost: string): string {
  return `raw=${classifyRawHost(rawHeader, canonicalHost)};resolved=${classifyResolvedHost(hostname, canonicalHost)}`;
}

export function createCanonicalHostMiddleware(
  getConfig: () => SeoConfig = () => getSeoConfig(),
  isShadowEnabled: () => boolean = () => isHostShadowModeEnabled(),
) {
  return function canonicalHost(req: Request, res: Response, next: NextFunction) {
    const cfg = getConfig();

    // Modo sombra (C3.7A): apenas observa; não participa de nenhuma decisão abaixo e nunca pode derrubar a requisição.
    try {
      if (isShadowEnabled()) res.setHeader(HOST_DIAGNOSTIC_HEADER, buildHostDiagnostic(req.headers.host, req.hostname, cfg.host));
    } catch {
      /* diagnóstico é opcional */
    }

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
