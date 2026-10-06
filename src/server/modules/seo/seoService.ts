/**
 * SEO no servidor (C3.2): metadados por rota (injetados no index.html), robots.txt e sitemap.xml dinâmicos.
 *
 * NÃO é SSR: o corpo da página continua sendo o SPA; só o <head> (título, description, canonical, robots, OG/Twitter, JSON-LD
 * da home) é gerado aqui, para que crawlers que não executam JS (WhatsApp, Facebook, X) e a primeira passada do Google
 * vejam metadados corretos.
 *
 * Regras de visibilidade REUTILIZADAS (nenhuma query paralela com regra própria):
 *   - produto: CatalogService.publicProductCondition() (is_active + loja ativa + vendedor ativo da loja);
 *   - loja:    eligibleStoreConditions() de storesRoutes (loja ativa + vendedor ativo);
 *   - categoria: categories.is_active.
 * Recurso inexistente/não público => HTTP 404 + noindex + SEM canonical (nunca uma página SEO válida).
 */
import { and, eq, or, desc } from 'drizzle-orm';
import { getDb } from '../../../db/index.js';
import { products, productImages, categories, stores, sellers } from '../../../db/schema.js';
import { getCache, setCache } from '../../../db/redis.js';
import { publicProductCondition } from '../catalog/catalogService.js';
import { eligibleStoreConditions } from '../stores/storesRoutes.js';
import { logger } from '../../infra/logger.js';
import {
  classifyPath,
  staticSeoFor,
  pageTitle,
  toMetaDescription,
  SEO_SITE_NAME,
  SEO_HOME_TITLE,
  SEO_HOME_DESCRIPTION,
  SEO_FALLBACK_IMAGE_PATH,
  SEO_THEME_COLOR,
  ROBOTS_INDEX,
  ROBOTS_NOINDEX,
} from '../../../utils/seoRoutes.js';
import type { SeoConfig } from './seoConfig.js';

export interface SeoPage {
  status: 200 | 404;
  title: string;
  description: string;
  /** URL canônica absoluta; null = não emitir canonical/og:url (noindex e 404). */
  canonicalUrl: string | null;
  robots: string;
  image: string | null;
  imageAlt: string | null;
  twitterCard: 'summary' | 'summary_large_image';
  jsonLd: object | null;
}

export const SITEMAP_CACHE_PREFIX = 'seo:sitemap:';
const SITEMAP_TTL_SECONDS = 300;
const SITEMAP_MAX_URLS = 50000;

// ---------------------------------------------------------------- helpers puros

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeXml(value: unknown): string {
  return escapeHtml(value);
}

/** og:image precisa ser URL absoluta https. data:/http/relativo inválido => null (o chamador usa o fallback provisório). */
export function absoluteHttpsImage(raw: unknown, origin: string): string | null {
  const v = String(raw ?? '').trim();
  if (!v) return null;
  if (/^https:\/\//i.test(v)) return v;
  if (v.startsWith('/') && !v.startsWith('//')) return `${origin}${v}`;
  return null;
}

function canonicalFor(origin: string, path: string): string {
  return `${origin}${path === '/' ? '/' : path}`;
}

function notFoundPage(label: string, origin: string): SeoPage {
  return {
    status: 404,
    title: pageTitle(label),
    description: SEO_HOME_DESCRIPTION,
    canonicalUrl: null,
    robots: ROBOTS_NOINDEX,
    image: absoluteHttpsImage(SEO_FALLBACK_IMAGE_PATH, origin),
    imageAlt: SEO_SITE_NAME,
    twitterCard: 'summary',
    jsonLd: null,
  };
}

export function homeJsonLd(origin: string): object {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', name: SEO_SITE_NAME, url: `${origin}/` },
      {
        '@type': 'Organization',
        name: SEO_SITE_NAME,
        url: `${origin}/`,
        logo: `${origin}${SEO_FALLBACK_IMAGE_PATH}`,
        parentOrganization: { '@type': 'Organization', name: 'NUSALI', url: 'https://www.nusali.com' },
      },
    ],
  };
}

// ---------------------------------------------------------------- consultas (leitura)

async function loadPublicProduct(id: string) {
  const db = getDb();
  if (!db) throw new Error('db_unavailable');
  const rows = await db
    .select({ id: products.id, title: products.title, description: products.description, image: products.image, brand: products.brand })
    .from(products)
    .where(and(eq(products.id, id), publicProductCondition()))
    .limit(1);
  if (rows.length === 0) return null;
  const p = rows[0];
  const cover = await db
    .select({ imageUrl: productImages.imageUrl })
    .from(productImages)
    .where(eq(productImages.productId, p.id))
    .orderBy(desc(productImages.isCover))
    .limit(1);
  return { ...p, coverImage: cover[0]?.imageUrl || null };
}

async function loadActiveCategory(slugOrId: string) {
  const db = getDb();
  if (!db) throw new Error('db_unavailable');
  const rows = await db
    .select({ id: categories.id, name: categories.name, slug: categories.slug })
    .from(categories)
    .where(and(or(eq(categories.slug, slugOrId), eq(categories.id, slugOrId)), eq(categories.isActive, true)))
    .limit(1);
  return rows[0] || null;
}

async function loadPublicStore(idOrSlug: string) {
  const db = getDb();
  if (!db) throw new Error('db_unavailable');
  const rows = await db
    .select({ id: stores.id, slug: stores.slug, name: stores.name, description: stores.description, logoUrl: stores.logoUrl })
    .from(stores)
    .innerJoin(sellers, eq(stores.sellerId, sellers.id))
    .where(and(or(eq(stores.id, idOrSlug), eq(stores.slug, idOrSlug)), eligibleStoreConditions()))
    .limit(1);
  return rows[0] || null;
}

// ---------------------------------------------------------------- metadados por rota

export async function buildSeoPage(pathname: string, cfg: SeoConfig): Promise<SeoPage> {
  const info = classifyPath(pathname);
  const origin = cfg.origin;
  const fallbackImage = absoluteHttpsImage(SEO_FALLBACK_IMAGE_PATH, origin);

  try {
    if (info.kind === 'product' && info.param) {
      const p = await loadPublicProduct(info.param);
      if (!p) return notFoundPage('Produto não encontrado', origin);
      const img = absoluteHttpsImage(p.coverImage, origin) || absoluteHttpsImage(p.image, origin);
      return {
        status: 200,
        title: pageTitle(p.title),
        description: toMetaDescription(p.description, `Veja ${p.title} no ${SEO_SITE_NAME}, marketplace de compra e venda online.`),
        canonicalUrl: canonicalFor(origin, `/products/${encodeURIComponent(p.id)}`),
        robots: ROBOTS_INDEX,
        image: img || fallbackImage,
        imageAlt: p.title,
        twitterCard: img ? 'summary_large_image' : 'summary',
        jsonLd: null,
      };
    }

    if (info.kind === 'category' && info.param) {
      const c = await loadActiveCategory(info.param);
      if (!c) return notFoundPage('Categoria não encontrada', origin);
      return {
        status: 200,
        title: pageTitle(c.name),
        description: `Veja os produtos de ${c.name} no ${SEO_SITE_NAME}, marketplace de compra e venda online.`,
        canonicalUrl: canonicalFor(origin, `/categories/${encodeURIComponent(c.slug || c.id)}`),
        robots: ROBOTS_INDEX,
        image: fallbackImage,
        imageAlt: SEO_SITE_NAME,
        twitterCard: 'summary',
        jsonLd: null,
      };
    }

    if (info.kind === 'store' && info.param) {
      const s = await loadPublicStore(info.param);
      if (!s) return notFoundPage('Loja não encontrada', origin);
      const logo = absoluteHttpsImage(s.logoUrl, origin);
      return {
        status: 200,
        title: pageTitle(s.name),
        description: toMetaDescription(s.description, `Conheça a loja ${s.name} no ${SEO_SITE_NAME}, marketplace de compra e venda online.`),
        canonicalUrl: canonicalFor(origin, `/stores/${encodeURIComponent(s.slug || s.id)}`),
        robots: ROBOTS_INDEX,
        image: logo || fallbackImage,
        imageAlt: s.name,
        twitterCard: 'summary',
        jsonLd: null,
      };
    }
  } catch (err: any) {
    // Falha de banco: nunca afirma que o recurso existe (sem canonical, noindex), mas não derruba a página.
    logger.warn({ err: err?.message, pathname }, 'SEO_PAGE_LOOKUP_FAILED');
    return { ...notFoundPage('Mercado Nusali', origin), status: 200 as const, title: SEO_SITE_NAME };
  }

  // páginas sem recurso dinâmico (home, catálogo, categorias, lojas, ajuda, privadas, desconhecidas)
  const st = staticSeoFor(info, pathname);
  const isUnknown = info.kind === 'unknown';
  return {
    status: isUnknown ? 404 : 200,
    title: st.title,
    description: st.description,
    canonicalUrl: st.canonicalPath ? canonicalFor(origin, st.canonicalPath) : null,
    robots: st.robots,
    image: fallbackImage,
    imageAlt: SEO_SITE_NAME,
    twitterCard: 'summary',
    jsonLd: info.kind === 'home' ? homeJsonLd(origin) : null,
  };
}

// ---------------------------------------------------------------- injeção no HTML

const SEO_TAG_RE = /<(?:meta|link)\b[^>]*\bdata-seo\b[^>]*>\s*/gi;
const SEO_BLOCK_RE = /<(title|script)\b[^>]*\bdata-seo\b[^>]*>[\s\S]*?<\/\1>\s*/gi;

export function renderSeoHead(page: SeoPage): string {
  const t: string[] = [];
  const meta = (attr: 'name' | 'property', key: string, content: string) =>
    t.push(`<meta ${attr}="${key}" content="${escapeHtml(content)}" data-seo />`);
  t.push(`<title data-seo>${escapeHtml(page.title)}</title>`);
  meta('name', 'description', page.description);
  if (page.canonicalUrl) t.push(`<link rel="canonical" href="${escapeHtml(page.canonicalUrl)}" data-seo />`);
  meta('name', 'robots', page.robots);
  meta('name', 'theme-color', SEO_THEME_COLOR);
  meta('property', 'og:type', 'website');
  meta('property', 'og:site_name', SEO_SITE_NAME);
  meta('property', 'og:title', page.title);
  meta('property', 'og:description', page.description);
  if (page.canonicalUrl) meta('property', 'og:url', page.canonicalUrl);
  if (page.image) {
    meta('property', 'og:image', page.image);
    if (page.imageAlt) meta('property', 'og:image:alt', page.imageAlt);
  }
  meta('name', 'twitter:card', page.image ? page.twitterCard : 'summary');
  meta('name', 'twitter:title', page.title);
  meta('name', 'twitter:description', page.description);
  if (page.image) meta('name', 'twitter:image', page.image);
  if (page.jsonLd) {
    const json = JSON.stringify(page.jsonLd).replace(/</g, '\\u003c');
    t.push(`<script type="application/ld+json" data-seo>${json}</script>`);
  }
  return t.join('\n    ');
}

/** Remove as tags SEO marcadas com data-seo (e o <title> marcado) do template e insere as da página antes de </head>. */
export function injectSeoHead(template: string, page: SeoPage): string {
  const stripped = template.replace(SEO_BLOCK_RE, '').replace(SEO_TAG_RE, '');
  const withoutPlainTitle = /data-seo/.test(template) ? stripped : stripped.replace(/<title>[\s\S]*?<\/title>\s*/i, '');
  const block = renderSeoHead(page);
  if (/<\/head>/i.test(withoutPlainTitle)) return withoutPlainTitle.replace(/<\/head>/i, () => `    ${block}\n  </head>`);
  return `${block}\n${withoutPlainTitle}`;
}

// ---------------------------------------------------------------- robots.txt

export function buildRobotsTxt(cfg: SeoConfig): string {
  // Sem Disallow para páginas privadas de propósito: o noindex delas precisa ser LIDO pelo crawler (meta + X-Robots-Tag).
  // robots.txt não é mecanismo de segurança. Só caminhos técnicos/API são bloqueados; assets (JS/CSS/imagens) ficam livres.
  return ['User-agent: *', 'Allow: /', 'Disallow: /api/', 'Disallow: /ws', '', `Sitemap: ${cfg.origin}/sitemap.xml`, ''].join('\n');
}

// ---------------------------------------------------------------- sitemap.xml

interface SitemapEntry {
  path: string;
  lastmod?: Date | string | null;
  changefreq?: string;
  priority?: string;
}

function fmtDate(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function renderSitemapXml(origin: string, entries: SitemapEntry[]): string {
  const body = entries
    .slice(0, SITEMAP_MAX_URLS)
    .map((e) => {
      const lm = fmtDate(e.lastmod);
      return [
        '  <url>',
        `    <loc>${escapeXml(`${origin}${e.path}`)}</loc>`,
        lm ? `    <lastmod>${lm}</lastmod>` : '',
        e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : '',
        e.priority ? `    <priority>${e.priority}</priority>` : '',
        '  </url>',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export async function buildSitemapXml(cfg: SeoConfig, opts: { useCache?: boolean } = {}): Promise<string> {
  const cacheKey = `${SITEMAP_CACHE_PREFIX}${cfg.origin}`;
  if (opts.useCache !== false) {
    const cached = await getCache<string>(cacheKey);
    if (typeof cached === 'string' && cached.startsWith('<?xml')) return cached;
  }

  const entries: SitemapEntry[] = [
    { path: '/', changefreq: 'daily', priority: '1.0' },
    { path: '/products', changefreq: 'daily', priority: '0.9' },
    { path: '/categories', changefreq: 'weekly', priority: '0.8' },
    { path: '/stores', changefreq: 'weekly', priority: '0.8' },
    { path: '/help-center', changefreq: 'monthly', priority: '0.3' },
  ];

  const db = getDb();
  if (db) {
    const cats = await db.select({ id: categories.id, slug: categories.slug }).from(categories).where(eq(categories.isActive, true));
    for (const c of cats) entries.push({ path: `/categories/${encodeURIComponent(c.slug || c.id)}`, changefreq: 'weekly', priority: '0.7' });

    const storeRows = await db
      .select({ id: stores.id, slug: stores.slug, updatedAt: stores.updatedAt })
      .from(stores)
      .innerJoin(sellers, eq(stores.sellerId, sellers.id))
      .where(eligibleStoreConditions())
      .limit(5000);
    for (const s of storeRows) entries.push({ path: `/stores/${encodeURIComponent(s.slug || s.id)}`, lastmod: s.updatedAt, changefreq: 'weekly', priority: '0.6' });

    const prodRows = await db
      .select({ id: products.id, updatedAt: products.updatedAt })
      .from(products)
      .where(publicProductCondition())
      .orderBy(desc(products.updatedAt))
      .limit(SITEMAP_MAX_URLS - entries.length);
    for (const p of prodRows) entries.push({ path: `/products/${encodeURIComponent(p.id)}`, lastmod: p.updatedAt, changefreq: 'weekly', priority: '0.8' });
  }

  const xml = renderSitemapXml(cfg.origin, entries);
  if (opts.useCache !== false) await setCache(cacheKey, xml, SITEMAP_TTL_SECONDS);
  return xml;
}
