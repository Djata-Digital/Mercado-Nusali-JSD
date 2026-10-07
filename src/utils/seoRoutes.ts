/**
 * SEO técnico (C3.2) — regras PURAS compartilhadas entre o servidor (injeção de metadados no HTML, sitemap) e o cliente
 * (título/meta durante a navegação SPA). Sem dependências de DOM, Express ou banco.
 *
 * Contrato de rotas: espelha as <Route> de src/App.tsx. O teste scratch/test-c32-seo.ts compara esta lista com o App.tsx
 * para detectar rota nova que ainda não foi classificada aqui.
 */

export const SEO_SITE_NAME = 'Mercado Nusali';
/** Origem canônica pública. Pode ser sobrescrita no servidor por PUBLIC_APP_URL (validada em seoConfig.ts). */
export const SEO_DEFAULT_ORIGIN = 'https://mercado.nusali.com';

export const SEO_HOME_TITLE = 'Mercado Nusali | Marketplace de compra e venda online';
export const SEO_HOME_DESCRIPTION =
  'O Mercado Nusali é um marketplace de compra e venda online que conecta vendedores e compradores. Conheça as lojas e os produtos anunciados.';

/** Imagem social de reserva PROVISÓRIA (logo oficial existente em public/). Trocar por uma arte 1200×630 quando houver. */
export const SEO_FALLBACK_IMAGE_PATH = '/mercado-nusali-logo.png';

/** Cor da barra do navegador (emerald-800, a mesma família verde do header). */
export const SEO_THEME_COLOR = '#065f46';

export const ROBOTS_INDEX = 'index, follow';
export const ROBOTS_NOINDEX = 'noindex, nofollow';

export type SeoRouteKind =
  | 'home'
  | 'catalog'
  | 'categories'
  | 'category'
  | 'stores'
  | 'store'
  | 'product'
  | 'help'
  | 'terms' // páginas legais institucionais (públicas, indexáveis)
  | 'privacy'
  | 'private' // área logada / transacional / auth: nunca indexar
  | 'unknown'; // rota que o React Router não conhece (cai no catch-all)

export interface SeoRouteInfo {
  kind: SeoRouteKind;
  /** id/slug do recurso (product, category, store). */
  param?: string;
  /** Nome curto para o título de páginas não indexáveis. */
  label?: string;
}

/** Rotas privadas/auth: título curto + noindex. Chave = primeiro segmento. */
const PRIVATE_LABELS: Record<string, string> = {
  search: 'Busca',
  cart: 'Carrinho',
  login: 'Entrar',
  register: 'Criar conta',
  'forgot-password': 'Recuperar senha',
  'reset-password': 'Redefinir senha',
  'verify-email': 'Verificar e-mail',
  'verify-phone': 'Verificar telefone',
  tracking: 'Rastreamento',
  checkout: 'Finalizar compra',
  orders: 'Meus pedidos',
  'purchase-groups': 'Compra',
  favorites: 'Favoritos',
  profile: 'Meu perfil',
  addresses: 'Meus endereços',
  security: 'Segurança',
  wallet: 'Carteira',
  coupons: 'Cupons',
  notifications: 'Notificações',
  messages: 'Mensagens',
  'returns-refunds': 'Devoluções',
  disputes: 'Disputas',
  seller: 'Painel do vendedor',
  admin: 'Painel administrativo',
};

/** Primeiro segmento -> quantos segmentos totais a rota aceita (o React Router tem rotas coringa só em /seller e /admin). */
const PRIVATE_MAX_SEGMENTS: Record<string, number> = {
  tracking: 2,
  orders: 3, // /orders, /orders/confirmation, /orders/:id, /orders/:id/confirmation
  'purchase-groups': 3, // /purchase-groups/:id/confirmation
  seller: Infinity,
  admin: Infinity,
};

function safeDecode(seg: string): string {
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}

/** Normaliza o pathname: sem query/hash, sem barra final, segmentos decodificados. */
export function splitPath(pathname: string): string[] {
  const clean = String(pathname || '/').split('?')[0].split('#')[0];
  return clean.split('/').filter(Boolean).map(safeDecode);
}

export function classifyPath(pathname: string): SeoRouteInfo {
  const segs = splitPath(pathname);
  if (segs.length === 0) return { kind: 'home' };
  const first = segs[0].toLowerCase();

  if (first === 'products') {
    if (segs.length === 1) return { kind: 'catalog' };
    if (segs.length === 2) return { kind: 'product', param: segs[1] };
    return { kind: 'unknown' };
  }
  if (first === 'categories') {
    if (segs.length === 1) return { kind: 'categories' };
    if (segs.length === 2) return { kind: 'category', param: segs[1] };
    return { kind: 'unknown' };
  }
  if (first === 'stores') {
    if (segs.length === 1) return { kind: 'stores' };
    if (segs.length === 2) return { kind: 'store', param: segs[1] };
    return { kind: 'unknown' };
  }
  if (first === 'help-center') return segs.length === 1 ? { kind: 'help' } : { kind: 'unknown' };
  if (first === 'termos-de-uso') return segs.length === 1 ? { kind: 'terms' } : { kind: 'unknown' };
  if (first === 'politica-de-privacidade') return segs.length === 1 ? { kind: 'privacy' } : { kind: 'unknown' };

  if (Object.prototype.hasOwnProperty.call(PRIVATE_LABELS, first)) {
    const max = PRIVATE_MAX_SEGMENTS[first] ?? 1;
    if (segs.length <= max) return { kind: 'private', label: PRIVATE_LABELS[first] };
    return { kind: 'unknown' };
  }
  return { kind: 'unknown' };
}

/** Páginas que NUNCA devem ser indexadas (a regra de produto/categoria/loja depende do recurso existir e ser público). */
export function isNoindexKind(kind: SeoRouteKind): boolean {
  return kind === 'private' || kind === 'unknown';
}

export function pageTitle(name: string): string {
  const n = String(name || '').replace(/\s+/g, ' ').trim();
  return n ? `${n} | ${SEO_SITE_NAME}` : SEO_SITE_NAME;
}

/** Texto curto e seguro para meta description: sem HTML, espaços normalizados, truncado em palavra. */
export function toMetaDescription(raw: unknown, fallback: string, max = 155): string {
  // 1) remove tags, 2) decodifica as entidades comuns (o texto sai LIMPO; o escape HTML é feito só ao emitir a tag),
  // 3) normaliza espaços.
  const text = String(raw ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return fallback;
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:!-]+$/, '')}…`;
}

export interface StaticSeo {
  title: string;
  description: string;
  /** Caminho canônico (sem origem). null = sem canonical (páginas não indexáveis / 404). */
  canonicalPath: string | null;
  robots: string;
}

/** Metadados das páginas SEM recurso dinâmico. Para product/category/store devolve o estado "pendente" (genérico). */
export function staticSeoFor(info: SeoRouteInfo, pathname: string): StaticSeo {
  switch (info.kind) {
    case 'home':
      return { title: SEO_HOME_TITLE, description: SEO_HOME_DESCRIPTION, canonicalPath: '/', robots: ROBOTS_INDEX };
    case 'catalog':
      return { title: pageTitle('Produtos'), description: 'Explore os produtos anunciados por vendedores no Mercado Nusali.', canonicalPath: '/products', robots: ROBOTS_INDEX };
    case 'categories':
      return { title: pageTitle('Categorias'), description: 'Navegue pelas categorias de produtos do Mercado Nusali.', canonicalPath: '/categories', robots: ROBOTS_INDEX };
    case 'stores':
      return { title: pageTitle('Lojas'), description: 'Conheça as lojas e os vendedores do Mercado Nusali.', canonicalPath: '/stores', robots: ROBOTS_INDEX };
    case 'help':
      return { title: pageTitle('Central de Ajuda'), description: 'Encontre respostas sobre o Mercado Nusali: cadastro, produtos e atendimento.', canonicalPath: '/help-center', robots: ROBOTS_INDEX };
    case 'terms':
      return { title: pageTitle('Termos de Uso'), description: 'Leia os Termos de Uso do Mercado Nusali: regras de cadastro, uso da plataforma por compradores e vendedores, lojas, produtos e responsabilidades.', canonicalPath: '/termos-de-uso', robots: ROBOTS_INDEX };
    case 'privacy':
      return { title: pageTitle('Política de Privacidade'), description: 'Entenda como o Mercado Nusali trata dados pessoais: quais dados são coletados, para quê, com quem são compartilhados e quais são os seus direitos.', canonicalPath: '/politica-de-privacidade', robots: ROBOTS_INDEX };
    case 'product':
    case 'category':
    case 'store':
      // Estado enquanto o recurso carrega no cliente; a própria página sobrescreve com o nome real.
      return { title: SEO_SITE_NAME, description: SEO_HOME_DESCRIPTION, canonicalPath: `/${splitPath(pathname).map(encodeURIComponent).join('/')}`, robots: ROBOTS_INDEX };
    case 'private':
      return { title: pageTitle(info.label || ''), description: SEO_HOME_DESCRIPTION, canonicalPath: null, robots: ROBOTS_NOINDEX };
    default:
      return { title: pageTitle('Página não encontrada'), description: SEO_HOME_DESCRIPTION, canonicalPath: null, robots: ROBOTS_NOINDEX };
  }
}
