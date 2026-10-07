/**
 * Política de host canônico (C3.2, endurecida na C3.7C) — middleware de Express.
 *
 * FONTE DA DECISÃO (C3.7C): o Host BRUTO (`req.headers.host`) validado e normalizado por `normalizeRawHost`. Provado em
 * produção (C3.7B) que ele representa o host realmente solicitado e que `X-Forwarded-Host` NÃO o altera. `req.hostname` do
 * Express NÃO participa da decisão: ele prefere o X-Forwarded-Host enviado pelo cliente (Cloudflare e Render não o
 * sobrescrevem) e por isso é forjável. `X-Forwarded-Host` é irrelevante para canonical/noindex/redirect.
 *
 * - Só atua quando PUBLIC_APP_URL está configurada e válida (seoConfig.ts). Sem ela: NADA muda (nem redirect, nem header).
 * - Host bruto canônico: nada a fazer (nunca redireciona, nunca recebe noindex de host => sem loop, mesmo com
 *   X-Forwarded-Host forjado).
 * - Host bruto NÃO canônico (`other`) ou INVÁLIDO/ausente (`invalid`): respostas de PÁGINA recebem
 *   `X-Robots-Tag: noindex, nofollow`. A API (/api, /ws, health) e os assets técnicos (/assets/) nunca são tratados como
 *   página, em qualquer combinação de maiúsculas/minúsculas.
 * - Redirect canônico (CANONICAL_HOST_REDIRECT_ENABLED=true): só GET/HEAD, só página, só host bruto VÁLIDO e não canônico.
 *   Status = CANONICAL_HOST_REDIRECT_STATUS (default 302; 301/307/308 permitidos), SEMPRE com `Cache-Control: no-store`.
 *   Destino = origem canônica configurada (PUBLIC_APP_URL) + req.originalUrl, nunca derivado de Host nem de
 *   X-Forwarded-Host: não existe open redirect.
 * - Host INVÁLIDO (fail-safe): sem redirect (não se adivinha o host a partir de X-Forwarded-Host nem de req.hostname),
 *   mas a página recebe noindex para impedir indexação acidental; a requisição segue o fluxo normal.
 * - MODO SOMBRA (HOST_POLICY_SHADOW_MODE=true, default desligado): só emite `X-Host-Policy-Diagnostic:
 *   raw=<..>;resolved=<..>` (apenas classificações, nunca os hosts). `resolved` (req.hostname) é SOMENTE diagnóstico.
 */
import type { Request, Response, NextFunction } from 'express';
import { getSeoConfig, isHostShadowModeEnabled, DEFAULT_REDIRECT_STATUS, type SeoConfig } from './seoConfig.js';

export type RequestPathKind = 'api' | 'asset' | 'page';
export type HostClass = 'canonical' | 'other';
export type RawHostClass = HostClass | 'invalid';

export const HOST_DIAGNOSTIC_HEADER = 'X-Host-Policy-Diagnostic';

/** Classificação usada pelo handler SPA (seoRouter.ts): sensível a maiúsculas, como sempre foi. NÃO usar na política de host. */
export function classifyRequestPath(pathname: string): RequestPathKind {
  const p = String(pathname || '/');
  if (p === '/api' || p.startsWith('/api/')) return 'api';
  if (p === '/ws' || p.startsWith('/ws/')) return 'api';
  if (p === '/health' || p === '/healthz' || p.startsWith('/health/')) return 'api';
  if (p.startsWith('/assets/')) return 'asset';
  return 'page';
}

/**
 * Classificação da POLÍTICA DE HOST (C3.7C): mesma regra, porém insensível a maiúsculas — o Express roteia /API, /Ws,
 * /HEALTH sem diferenciar caixa, então a política também não pode. Só decide se o host-policy redireciona/marca; não toca
 * no roteamento. `/assets` sem barra final e `/assets/*` contam como asset.
 */
export function classifyPathForHostPolicy(pathname: string): RequestPathKind {
  const p = String(pathname || '/').toLowerCase();
  if (p === '/api' || p.startsWith('/api/')) return 'api';
  if (p === '/ws' || p.startsWith('/ws/')) return 'api';
  if (p === '/health' || p === '/healthz' || p.startsWith('/health/')) return 'api';
  if (p === '/assets' || p.startsWith('/assets/')) return 'asset';
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

/** Hostname resolvido pelo Express (forjável via X-Forwarded-Host). SOMENTE DIAGNÓSTICO: nunca entra em decisão. */
export function classifyResolvedHost(hostname: unknown, canonicalHost: string): HostClass {
  return String(hostname || '').toLowerCase() === canonicalHost ? 'canonical' : 'other';
}

/** Valor do header de diagnóstico: só classificações fixas. */
export function buildHostDiagnostic(rawHeader: unknown, hostname: unknown, canonicalHost: string): string {
  return `raw=${classifyRawHost(rawHeader, canonicalHost)};resolved=${classifyResolvedHost(hostname, canonicalHost)}`;
}

/** Caminho+query seguro para anexar à origem canônica: tem de começar por "/" (forma origin; rejeita forma absoluta). */
function safeRedirectPath(originalUrl: string): string {
  return typeof originalUrl === 'string' && originalUrl.startsWith('/') ? originalUrl : '/';
}

export function createCanonicalHostMiddleware(
  getConfig: () => SeoConfig = () => getSeoConfig(),
  isShadowEnabled: () => boolean = () => isHostShadowModeEnabled(),
) {
  return function canonicalHost(req: Request, res: Response, next: NextFunction) {
    const cfg = getConfig();

    // Modo sombra: apenas observa; não participa de nenhuma decisão abaixo e nunca pode derrubar a requisição.
    try {
      if (isShadowEnabled()) res.setHeader(HOST_DIAGNOSTIC_HEADER, buildHostDiagnostic(req.headers.host, req.hostname, cfg.host));
    } catch {
      /* diagnóstico é opcional */
    }

    if (!cfg.explicit) return next();

    // DECISÃO: só o Host bruto validado. req.hostname e X-Forwarded-Host não são lidos aqui.
    const rawClass = classifyRawHost(req.headers.host, cfg.host);
    if (rawClass === 'canonical') return next(); // host canônico: nada a fazer

    if (classifyPathForHostPolicy(req.path) !== 'page') return next(); // API / WS / health / assets técnicos: intocados

    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    if (rawClass === 'other' && cfg.redirectEnabled && (req.method === 'GET' || req.method === 'HEAD')) {
      res.setHeader('Cache-Control', 'no-store');
      return res.redirect(cfg.redirectStatus ?? DEFAULT_REDIRECT_STATUS, `${cfg.origin}${safeRedirectPath(req.originalUrl)}`);
    }
    return next(); // host inválido (fail-safe), método de escrita ou redirect desligado
  };
}
