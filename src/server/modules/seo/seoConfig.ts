/**
 * Configuração do domínio público (C3.2). Duas variáveis, separadas de APP_URL de propósito (APP_URL = links de e-mail/reset;
 * estas controlam a política de host/SEO):
 *
 *   PUBLIC_APP_URL                      origem pública canônica, ex.: https://mercado.nusali.com (só origem; sem caminho)
 *   CANONICAL_HOST_REDIRECT_ENABLED     'true' liga o 301 de páginas em host não canônico. Qualquer outro valor = DESLIGADO.
 *
 * Sem PUBLIC_APP_URL: nenhum redirect e nenhum X-Robots-Tag por host (comportamento anterior), e os canonicals/sitemap usam
 * a origem padrão https://mercado.nusali.com. O redirect só liga com PUBLIC_APP_URL válida E a flag explícita.
 */
import { SEO_DEFAULT_ORIGIN } from '../../../utils/seoRoutes.js';

export interface SeoConfig {
  /** Origem usada em canonical/OG/sitemap (sempre definida). */
  origin: string;
  /** Host (sem porta) da origem canônica. */
  host: string;
  /** PUBLIC_APP_URL foi informada e é válida (liga o X-Robots-Tag por host). */
  explicit: boolean;
  /** Redirect de páginas em host não canônico ligado. */
  redirectEnabled: boolean;
}

/** Valida PUBLIC_APP_URL: https (http só para localhost fora de produção), sem credenciais/caminho/query/hash. Devolve a origem normalizada. */
export function parsePublicOrigin(raw: string | undefined | null, nodeEnv: string | undefined = process.env.NODE_ENV): string | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== '/' && url.pathname !== '') return null;
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (url.protocol === 'https:') {
    // ok
  } else if (url.protocol === 'http:' && isLocal && nodeEnv !== 'production') {
    // ok (desenvolvimento/teste local)
  } else {
    return null;
  }
  if (!url.hostname || !url.hostname.includes('.') && !isLocal) return null;
  return url.origin.toLowerCase();
}

/**
 * Modo sombra da política de host (C3.7A): só 'true' liga; ausente/false/inválido = DESLIGADO (default).
 * Só emite o header de diagnóstico X-Host-Policy-Diagnostic (classificações, nunca os hosts); não altera nenhuma decisão.
 */
export function isHostShadowModeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return String(env.HOST_POLICY_SHADOW_MODE ?? '').trim().toLowerCase() === 'true';
}

export function getSeoConfig(env: NodeJS.ProcessEnv = process.env): SeoConfig {
  const parsed = parsePublicOrigin(env.PUBLIC_APP_URL, env.NODE_ENV);
  const origin = parsed || SEO_DEFAULT_ORIGIN;
  const host = new URL(origin).hostname.toLowerCase();
  const explicit = parsed !== null;
  const redirectEnabled = explicit && String(env.CANONICAL_HOST_REDIRECT_ENABLED ?? '').trim().toLowerCase() === 'true';
  return { origin, host, explicit, redirectEnabled };
}
