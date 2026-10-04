/**
 * Regras puras dos banners da home — SEM dependências de Node/DOM, para serem usadas
 * tanto pelo servidor (validação autoritativa) quanto pelo frontend (defesa em
 * profundidade antes de navegar para um CTA vindo da API).
 */

export const BANNER_STATUSES = ['draft', 'active', 'inactive'] as const;
export type BannerStatus = (typeof BANNER_STATUSES)[number];

export const BANNER_CTA_TYPES = ['internal', 'external'] as const;
export type BannerCtaType = (typeof BANNER_CTA_TYPES)[number];

/** Presets de cor (banner sem imagem usa só layout/cores/texto). Os ids são o contrato com o banco. */
export const BANNER_BG_STYLES = ['blue', 'emerald', 'slate'] as const;
export type BannerBgStyle = (typeof BANNER_BG_STYLES)[number];

/** Classes Tailwind literais (precisam aparecer inteiras no código-fonte para o Tailwind gerá-las). */
export const BANNER_BG_PRESETS: Record<BannerBgStyle, { label: string; bgClass: string; tagBg: string }> = {
  blue: { label: 'Azul', bgClass: 'from-blue-900 via-indigo-900 to-slate-900', tagBg: 'bg-yellow-400 text-blue-950' },
  emerald: { label: 'Verde', bgClass: 'from-emerald-950 via-teal-950 to-blue-950', tagBg: 'bg-yellow-400 text-blue-950 font-black' },
  slate: { label: 'Grafite', bgClass: 'from-slate-900 via-blue-950 to-zinc-900', tagBg: 'bg-emerald-600 text-white' },
};

export function isBannerBgStyle(value: unknown): value is BannerBgStyle {
  return typeof value === 'string' && (BANNER_BG_STYLES as readonly string[]).includes(value);
}

/** Limites de texto (iguais no banco: varchar). */
export const BANNER_TEXT_LIMITS = {
  title: 120,
  subtitle: 300,
  tagText: 40,
  badgeText: 60,
  ctaLabel: 40,
  ctaTarget: 500,
} as const;

export type CtaValidation =
  | { ok: true; value: string }
  | { ok: false; message: string };

const CONTROL_OR_SPACE = /[\u0000- \u007f-\u009f\u2028\u2029]/;

// Caminho interno: segmentos [A-Za-z0-9._~-] separados por "/", query opcional.
const INTERNAL_PATH = /^\/(?:[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*)?\/?(?:\?[A-Za-z0-9._~\-=&%+,]*)?$/;
const BLOCKED_INTERNAL_PREFIXES = ['api', 'assets'];

/**
 * Rota interna segura: começa com uma única "/", só caracteres de caminho conhecidos,
 * sem "//", "..", "\", ":" fora da query, sem esquema (javascript:, data:, http:) e sem
 * apontar para /api ou /assets (não são telas do app).
 */
export function validateInternalCta(raw: unknown): CtaValidation {
  if (typeof raw !== 'string') return { ok: false, message: 'Destino interno inválido.' };
  const value = raw.trim();
  if (!value) return { ok: false, message: 'Informe o destino do botão.' };
  if (value.length > BANNER_TEXT_LIMITS.ctaTarget) return { ok: false, message: 'Destino interno longo demais.' };
  if (CONTROL_OR_SPACE.test(value)) return { ok: false, message: 'Destino interno não pode ter espaços ou caracteres de controle.' };
  if (!value.startsWith('/') || value.startsWith('//')) return { ok: false, message: 'Destino interno deve começar com uma única "/" (ex.: /products).' };
  if (value.includes('\\')) return { ok: false, message: 'Destino interno não pode conter "\\".' };
  if (!INTERNAL_PATH.test(value)) return { ok: false, message: 'Destino interno com caracteres não permitidos.' };
  const pathOnly = value.split('?')[0];
  if (pathOnly.split('/').some((seg) => seg === '..' || seg === '.')) return { ok: false, message: 'Destino interno não pode conter "." ou "..".' };
  const first = pathOnly.split('/')[1]?.toLowerCase() || '';
  if (BLOCKED_INTERNAL_PREFIXES.includes(first)) return { ok: false, message: 'Destino interno não pode apontar para /api ou /assets.' };
  return { ok: true, value };
}

const PRIVATE_IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/**
 * Link externo: somente HTTPS, sem credenciais embutidas, sem espaços/controle, host DNS público
 * (rejeita IP literal, localhost e sufixos locais). Devolve a forma canônica (`URL.href`), a mesma
 * que o navegador usará ao abrir o link.
 */
export function validateExternalCta(raw: unknown): CtaValidation {
  if (typeof raw !== 'string') return { ok: false, message: 'Link externo inválido.' };
  const value = raw.trim();
  if (!value) return { ok: false, message: 'Informe o link do botão.' };
  if (value.length > BANNER_TEXT_LIMITS.ctaTarget) return { ok: false, message: 'Link externo longo demais.' };
  if (CONTROL_OR_SPACE.test(value)) return { ok: false, message: 'Link externo não pode ter espaços ou caracteres de controle.' };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, message: 'Link externo inválido. Use o formato https://exemplo.com/pagina.' };
  }
  if (url.protocol !== 'https:') return { ok: false, message: 'Link externo deve usar HTTPS.' };
  if (url.username || url.password) return { ok: false, message: 'Link externo não pode conter usuário ou senha.' };
  const host = url.hostname.toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return { ok: false, message: 'Link externo deve apontar para um domínio público.' };
  }
  if (host.startsWith('[') || PRIVATE_IPV4.test(host)) return { ok: false, message: 'Link externo não pode ser um endereço IP.' };
  if (!host.includes('.')) return { ok: false, message: 'Link externo deve apontar para um domínio público.' };
  return { ok: true, value: url.href };
}

export function validateBannerCta(type: unknown, target: unknown): CtaValidation {
  if (type === 'internal') return validateInternalCta(target);
  if (type === 'external') return validateExternalCta(target);
  return { ok: false, message: 'Tipo de destino inválido (use "internal" ou "external").' };
}

/** Código de país no formato ISO-3166 alpha-2 (2 letras). */
export function normalizeCountryCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) ? v : null;
}
