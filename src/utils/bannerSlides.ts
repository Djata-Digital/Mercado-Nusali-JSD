import {
  isBannerBgStyle,
  validateBannerCta,
  type BannerBgStyle,
  type BannerCtaType,
} from './bannerRules';

/** Slide pronto para renderizar (vindo da API ou do fallback embutido). */
export interface BannerSlide {
  id: string;
  tag: string | null;
  badge: string | null;
  title: string;
  subtitle: string | null;
  cta: { label: string; type: BannerCtaType; target: string } | null;
  bgStyle: BannerBgStyle;
  desktopImageUrl: string | null;
  mobileImageUrl: string | null;
}

/**
 * Os 3 slides originais da home. NUNCA remover: são o fallback permanente quando a API falha, expira
 * (timeout), responde com algo inválido ou não há nenhum banner ativo. Texto/cores/CTA idênticos aos de antes.
 */
export const FALLBACK_SLIDES: BannerSlide[] = [
  {
    id: 'banner-1',
    tag: 'MERCADO NUSALI',
    badge: 'Compras online em breve',
    title: 'Explore os produtos do Mercado Nusali',
    subtitle: 'Crie sua conta, navegue pelo catálogo e monte seu carrinho. As compras online chegam em breve.',
    cta: { label: 'Ver produtos', type: 'internal', target: '/products' },
    bgStyle: 'blue',
    desktopImageUrl: null,
    mobileImageUrl: null,
  },
  {
    id: 'banner-2',
    tag: 'PARA VENDEDORES',
    badge: 'Cadastro aberto',
    title: 'Venda seus produtos no Mercado Nusali',
    subtitle: 'Crie sua conta de vendedor, configure sua operação e publique seus produtos.',
    cta: { label: 'Criar minha conta', type: 'internal', target: '/register' },
    bgStyle: 'emerald',
    desktopImageUrl: null,
    mobileImageUrl: null,
  },
  {
    id: 'banner-3',
    tag: 'EM BREVE',
    badge: 'Compras online em breve',
    title: 'Entrega e pagamento para a Guiné-Bissau',
    subtitle: 'Estamos preparando as opções de entrega e pagamento. Enquanto isso, explore o catálogo e monte seu carrinho.',
    cta: { label: 'Explorar o catálogo', type: 'internal', target: '/products' },
    bgStyle: 'slate',
    desktopImageUrl: null,
    mobileImageUrl: null,
  },
];

const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
/**
 * Imagem só se for uma URL absoluta https (nunca javascript:, data:, caminho relativo etc.). A única exceção é http em
 * loopback (localhost/127.0.0.1), que só existe em desenvolvimento local — em produção a URL é sempre https do R2.
 */
const imageUrl = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  try {
    const u = new URL(v.trim());
    const loopback = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
    return u.protocol === 'https:' || (u.protocol === 'http:' && loopback) ? u.href : null;
  } catch {
    return null;
  }
};

/**
 * Converte a resposta da API em slides. Defesa em profundidade: o servidor já valida tudo, mas aqui cada item é
 * revalidado (CTA seguro, imagem https, estilo conhecido); item sem título é descartado; CTA inválido some (o slide fica
 * sem botão em vez de apontar para um destino perigoso). Retorna [] se a resposta não for uma lista utilizável.
 */
export function slidesFromApi(data: unknown): BannerSlide[] {
  if (!Array.isArray(data)) return [];
  const slides: BannerSlide[] = [];
  for (const raw of data) {
    if (!raw || typeof raw !== 'object') continue;
    const b = raw as Record<string, unknown>;
    const id = text(b.id, 255);
    const title = text(b.title, 120);
    if (!id || !title) continue;
    let cta: BannerSlide['cta'] = null;
    const label = text(b.ctaLabel, 40);
    if (label && (b.ctaType === 'internal' || b.ctaType === 'external')) {
      const v = validateBannerCta(b.ctaType, b.ctaTarget);
      if (v.ok) cta = { label, type: b.ctaType, target: v.value };
    }
    slides.push({
      id,
      tag: text(b.tagText, 40),
      badge: text(b.badgeText, 60),
      title,
      subtitle: text(b.subtitle, 300),
      cta,
      bgStyle: isBannerBgStyle(b.bgStyle) ? b.bgStyle : 'blue',
      desktopImageUrl: imageUrl(b.desktopImageUrl),
      mobileImageUrl: imageUrl(b.mobileImageUrl),
    });
  }
  return slides;
}

/** API com banners válidos → usa a API; erro/indefinido/vazio/inválido → usa os 3 slides embutidos. */
export function resolveSlides(apiData: unknown): BannerSlide[] {
  const slides = slidesFromApi(apiData);
  return slides.length > 0 ? slides : FALLBACK_SLIDES;
}
