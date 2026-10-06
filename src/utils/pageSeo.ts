/**
 * SEO no cliente (C3.2) — ÚNICO ponto que mexe em document.head para título/description/canonical/robots/Open Graph/Twitter.
 * Atualiza as MESMAS tags marcadas com data-seo que o servidor injeta (e que o index.html traz como padrão da home), então
 * não há duplicatas. Nenhum componente deve manipular document.head por conta própria.
 */
import {
  SEO_DEFAULT_ORIGIN,
  SEO_FALLBACK_IMAGE_PATH,
  SEO_SITE_NAME,
  ROBOTS_INDEX,
} from './seoRoutes';

export interface PageSeoInput {
  title: string;
  description?: string;
  /** Caminho canônico (ex.: /products/abc). null/ausente = sem canonical (página não indexável). */
  canonicalPath?: string | null;
  robots?: string;
  /** URL absoluta https da imagem social; ausente = logo oficial provisório. */
  image?: string | null;
}

function readViteEnv(key: string): string | undefined {
  try {
    const v = (import.meta as any).env?.[key];
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  } catch {
    return undefined;
  }
}

/** Origem canônica no cliente: VITE_PUBLIC_APP_URL (se válida) ou o domínio público padrão. */
export function getPublicOrigin(): string {
  const raw = readViteEnv('VITE_PUBLIC_APP_URL');
  if (raw) {
    try {
      const u = new URL(raw);
      if (u.protocol === 'https:' && !u.username && !u.password) return u.origin.toLowerCase();
    } catch {
      /* usa o padrão */
    }
  }
  return SEO_DEFAULT_ORIGIN;
}

function head(): HTMLHeadElement | null {
  return typeof document !== 'undefined' ? document.head : null;
}

function upsert(selector: string, create: () => HTMLElement, set: (el: HTMLElement) => void) {
  const h = head();
  if (!h) return;
  let el = h.querySelector<HTMLElement>(selector);
  if (!el) {
    el = create();
    el.setAttribute('data-seo', '');
    h.appendChild(el);
  }
  set(el);
}

function remove(selector: string) {
  head()?.querySelectorAll(selector).forEach((el) => el.remove());
}

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  upsert(
    `meta[${attr}="${key}"]`,
    () => {
      const m = document.createElement('meta');
      m.setAttribute(attr, key);
      return m;
    },
    (el) => el.setAttribute('content', content)
  );
}

export function applyPageSeo(input: PageSeoInput): void {
  if (typeof document === 'undefined') return;
  const origin = getPublicOrigin();
  const description = input.description || '';
  const robots = input.robots || ROBOTS_INDEX;
  const canonicalUrl = input.canonicalPath ? `${origin}${input.canonicalPath}` : null;
  const image = input.image && /^https:\/\//i.test(input.image) ? input.image : `${origin}${SEO_FALLBACK_IMAGE_PATH}`;
  const usingFallbackImage = !(input.image && /^https:\/\//i.test(input.image));

  // document.title atualiza o <title> existente (o marcado com data-seo, injetado pelo servidor/index.html) sem criar outro.
  document.title = input.title;
  if (description) setMeta('name', 'description', description);
  setMeta('name', 'robots', robots);

  if (canonicalUrl) {
    upsert('link[rel="canonical"]', () => { const l = document.createElement('link'); l.setAttribute('rel', 'canonical'); return l; }, (el) => el.setAttribute('href', canonicalUrl));
    setMeta('property', 'og:url', canonicalUrl);
  } else {
    remove('link[rel="canonical"]');
    remove('meta[property="og:url"]');
  }

  setMeta('property', 'og:type', 'website');
  setMeta('property', 'og:site_name', SEO_SITE_NAME);
  setMeta('property', 'og:title', input.title);
  if (description) setMeta('property', 'og:description', description);
  setMeta('property', 'og:image', image);
  setMeta('property', 'og:image:alt', input.title || SEO_SITE_NAME);
  setMeta('name', 'twitter:card', usingFallbackImage ? 'summary' : 'summary_large_image');
  setMeta('name', 'twitter:title', input.title);
  if (description) setMeta('name', 'twitter:description', description);
  setMeta('name', 'twitter:image', image);
}

/** JSON-LD só descreve a home; ao sair dela remove o bloco injetado. */
export function clearStructuredData(): void {
  remove('script[type="application/ld+json"][data-seo]');
}
