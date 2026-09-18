/**
 * FASE D16-C2 — lógica pura por trás da experiência real de variantes na
 * página pública do produto (comprador). Espelha o mesmo espírito de
 * src/utils/productVariantWizard.ts (lado vendedor, D16-B1): nada aqui toca
 * rede/DOM, só transforma o array real `product.variants[]` que o backend
 * já devolve (catalogService.getProductById) — nenhum contrato novo, nenhum
 * campo fantasma (`availableColors`/`availableSizes`) usado como fonte.
 *
 * Extraído para módulo isolado para poder ser testado sem renderizar React.
 */
import type { ProductVariant } from '../types';

/** Ausência de isActive = ativa, por compatibilidade com dados antigos. */
export function getActiveVariants(variants: ProductVariant[] | undefined | null): ProductVariant[] {
  if (!Array.isArray(variants)) return [];
  return variants.filter((v) => v.isActive !== false);
}

export interface BuyerColorGroup {
  color: string;
  /** Sempre variant.imageUrl (nunca variant.image, que só existe em mock). */
  imageUrl?: string;
  variants: ProductVariant[];
}

/**
 * Agrupa as variantes ATIVAS por cor — uma thumbnail por cor, nunca uma por
 * combinação. A imagem do grupo é a primeira imageUrl não-vazia encontrada
 * entre as variantes daquela cor (todas compartilham a mesma, gravada pelo
 * D16-B1 via propagateColorImage — nunca duplicada aqui).
 */
export function groupActiveVariantsByColor(variants: ProductVariant[] | undefined | null): BuyerColorGroup[] {
  const active = getActiveVariants(variants);
  const order: string[] = [];
  const map = new Map<string, BuyerColorGroup>();
  for (const v of active) {
    if (!v.color) continue;
    let group = map.get(v.color);
    if (!group) {
      group = { color: v.color, imageUrl: v.imageUrl || undefined, variants: [] };
      map.set(v.color, group);
      order.push(v.color);
    } else if (!group.imageUrl && v.imageUrl) {
      group.imageUrl = v.imageUrl;
    }
    group.variants.push(v);
  }
  return order.map((c) => map.get(c)!);
}

/** Valor do eixo secundário de uma variante — size OU capacity, nunca os dois ao mesmo tempo nesta rodada (D16-C2 não generaliza atributos). */
function secondaryAxisValue(v: ProductVariant): string | undefined {
  return v.size || v.capacity || undefined;
}

/**
 * Tamanhos/capacidades REALMENTE existentes numa cor (ou entre todas as
 * variantes ativas, se `color` for null — produto sem eixo de cor). Nunca
 * inventa uma combinação cartesiana que não existe de verdade em
 * product.variants.
 */
export function getSizesForColor(variants: ProductVariant[] | undefined | null, color: string | null): string[] {
  const active = getActiveVariants(variants);
  const pool = color ? active.filter((v) => v.color === color) : active;
  const seen = new Set<string>();
  const order: string[] = [];
  for (const v of pool) {
    const val = secondaryAxisValue(v);
    if (val && !seen.has(val)) {
      seen.add(val);
      order.push(val);
    }
  }
  return order;
}

export interface VariantSelection {
  color?: string | null;
  size?: string | null;
}

/**
 * Resolve a variante concreta a partir da seleção do comprador — NUNCA o
 * fallback silencioso `variants[0]`. Só resolve sozinha quando a escolha é
 * inequívoca:
 *   - existe exatamente 1 variante ativa no total; ou
 *   - depois de aplicar cor (se o produto tem eixo de cor) e tamanho (se
 *     tem eixo de tamanho/capacidade), sobra exatamente 1 candidata.
 * Em qualquer outro caso (ainda falta escolher algo, ou a combinação não
 * existe de verdade), retorna null — nunca "adivinha".
 */
export function resolveSelectedVariant(
  variants: ProductVariant[] | undefined | null,
  selection: VariantSelection
): ProductVariant | null {
  const active = getActiveVariants(variants);
  if (active.length === 0) return null;
  if (active.length === 1) return active[0];

  const hasColors = active.some((v) => !!v.color);
  const hasSecondaryAxis = active.some((v) => !!secondaryAxisValue(v));

  let pool = active;
  if (hasColors) {
    if (!selection.color) return null;
    pool = pool.filter((v) => v.color === selection.color);
  }
  if (hasSecondaryAxis) {
    if (!selection.size) {
      return pool.length === 1 ? pool[0] : null;
    }
    pool = pool.filter((v) => secondaryAxisValue(v) === selection.size);
  }
  return pool.length === 1 ? pool[0] : null;
}

export interface BuyerPriceDisplay {
  mode: 'from' | 'selected';
  /** Preço a mostrar: da variante selecionada, ou o menor entre as ativas quando ainda não há seleção. null só se nenhuma variante ativa tiver preço válido. */
  price: number | null;
  /** Só presente quando > price da MESMA variante — nunca um riscado "genérico". */
  originalPrice?: number;
  minPrice: number | null;
  maxPrice: number | null;
}

/**
 * Sem variante selecionada: "a partir de" (o menor preço entre as ativas).
 * Com variante selecionada: preço/riscado exclusivamente dessa variante —
 * nunca product.price como autoridade depois da seleção.
 */
export function computeBuyerPriceDisplay(
  variants: ProductVariant[] | undefined | null,
  selectedVariant: ProductVariant | null
): BuyerPriceDisplay {
  const active = getActiveVariants(variants);
  const validPrices = active
    .map((v) => v.price)
    .filter((p): p is number => typeof p === 'number' && !isNaN(p) && p > 0);
  const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : null;
  const maxPrice = validPrices.length > 0 ? Math.max(...validPrices) : null;

  if (selectedVariant && typeof selectedVariant.price === 'number' && !isNaN(selectedVariant.price)) {
    const originalPrice =
      typeof selectedVariant.originalPrice === 'number' &&
      !isNaN(selectedVariant.originalPrice) &&
      selectedVariant.originalPrice > selectedVariant.price
        ? selectedVariant.originalPrice
        : undefined;
    return { mode: 'selected', price: selectedVariant.price, originalPrice, minPrice, maxPrice };
  }

  return { mode: 'from', price: minPrice, minPrice, maxPrice };
}

/** Fonte real de disponibilidade: availableStock (inventory), NUNCA a coluna stock legada. Ausente = trata como indisponível (nunca "sem limite"). */
export function isVariantAvailable(variant: ProductVariant | null | undefined): boolean {
  if (!variant) return false;
  return (variant.availableStock ?? 0) > 0;
}

/** Quantidade máxima permitida para a variante selecionada. */
export function getVariantMaxQuantity(variant: ProductVariant | null | undefined): number {
  if (!variant) return 0;
  return Math.max(0, variant.availableStock ?? 0);
}

/**
 * Mensagem amigável de bloqueio, ou null quando é seguro prosseguir
 * (produto simples, ou variante concreta e disponível já resolvida).
 * Usado para impedir a chamada de rede — nunca deixa a requisição sair sem
 * uma variante válida quando o produto tem variantes.
 */
export function getSelectionGuardMessage(
  variants: ProductVariant[] | undefined | null,
  selection: VariantSelection
): string | null {
  const active = getActiveVariants(variants);
  if (active.length === 0) return null; // produto simples — nada a bloquear aqui

  const resolved = resolveSelectedVariant(variants, selection);
  if (resolved) {
    return isVariantAvailable(resolved) ? null : 'Esta variação está sem estoque no momento.';
  }

  const hasColors = active.some((v) => !!v.color);
  const hasSecondaryAxis = active.some((v) => !!secondaryAxisValue(v));
  if (hasColors && !selection.color) return 'Selecione uma cor.';
  if (hasSecondaryAxis && !selection.size) return 'Selecione um tamanho.';
  return 'Selecione uma variação válida antes de continuar.';
}

/**
 * FASE D16-D2 — compra multi-variante estilo Alibaba: quantidades
 * independentes por variante (Record<variantId, quantity>), em vez de uma
 * única quantidade para a variante "selecionada". Puro — nunca acessa
 * rede/estado, só resume o que já está em `variants[]` + o mapa de
 * quantidades escolhidas pelo comprador.
 */
export interface MultiVariantSummary {
  totalUnits: number;
  /** Quantas variantes DISTINTAS têm quantidade > 0 (nunca conta uma variante com qty=0). */
  selectedVariantCount: number;
  /** Σ variant.price * quantity — NUNCA product.price, sempre o preço REAL de cada variante. */
  subtotal: number;
  /** Uma entrada por variante com quantidade > 0 — pronta para virar `items[]` do batch. */
  lines: Array<{ variantId: string; variant: ProductVariant; quantity: number; lineTotal: number }>;
}

/**
 * FASE D16-D3 — galeria PERSISTENTE: todas as imagens gerais do produto MAIS
 * a imagem de cada cor real ficam sempre visíveis, independente de qual cor
 * está selecionada no momento. Antes, trocar de cor RECONSTRUÍA a lista
 * (só a imagem da cor ativa + gerais), fazendo as outras cores "sumirem" da
 * galeria — esta função corrige isso na fonte, de forma pura.
 *
 * Fonte de dados (nunca outra): `productImages` (product.galleryImages) para
 * as gerais, `variants[].imageUrl` para as de cor — nunca
 * `availableColors`/`variant.image` (mock-only) nem `variants[0]`.
 */
export interface GalleryMediaItem {
  url: string;
  type: 'image';
  source: 'general' | 'variant';
  /**
   * Cor associada a esta imagem, só quando o vínculo é INEQUÍVOCO (uma
   * única cor real usa esta URL entre as variantes ativas). Ambígua (2+
   * cores compartilhando a mesma URL) ou sem eixo de cor -> undefined,
   * nunca uma adivinhação.
   */
  color?: string;
}

export function buildPersistentProductGallery(
  productImages: string[] | undefined | null,
  variants: ProductVariant[] | undefined | null
): GalleryMediaItem[] {
  const result: GalleryMediaItem[] = [];
  const seenUrls = new Set<string>();

  // 1. Imagens gerais do produto, na ordem existente — sempre primeiro.
  (productImages || []).forEach((url) => {
    if (!url || seenUrls.has(url)) return;
    seenUrls.add(url);
    result.push({ url, type: 'image', source: 'general' });
  });

  // 2. Imagens de variante — uma miniatura por URL única, associada à cor
  // só quando exatamente 1 cor real usa aquela URL.
  const active = getActiveVariants(variants);
  const colorsByUrl = new Map<string, Set<string>>();
  active.forEach((v) => {
    if (!v.imageUrl) return;
    if (!colorsByUrl.has(v.imageUrl)) colorsByUrl.set(v.imageUrl, new Set());
    if (v.color) colorsByUrl.get(v.imageUrl)!.add(v.color);
  });

  active.forEach((v) => {
    const url = v.imageUrl;
    if (!url || seenUrls.has(url)) return;
    seenUrls.add(url);
    const colors = colorsByUrl.get(url);
    const unambiguousColor = colors && colors.size === 1 ? Array.from(colors)[0] : undefined;
    result.push({ url, type: 'image', source: 'variant', color: unambiguousColor });
  });

  return result;
}

export function computeMultiVariantSummary(
  variants: ProductVariant[] | undefined | null,
  variantQuantities: Record<string, number> | undefined | null
): MultiVariantSummary {
  const active = getActiveVariants(variants);
  const qtyMap = variantQuantities || {};

  let totalUnits = 0;
  let selectedVariantCount = 0;
  let subtotal = 0;
  const lines: MultiVariantSummary['lines'] = [];

  for (const v of active) {
    const qty = Math.max(0, Math.floor(Number(qtyMap[v.id]) || 0));
    if (qty <= 0) continue;
    const price = typeof v.price === 'number' && !isNaN(v.price) ? v.price : 0;
    const lineTotal = price * qty;
    totalUnits += qty;
    selectedVariantCount += 1;
    subtotal += lineTotal;
    lines.push({ variantId: v.id, variant: v, quantity: qty, lineTotal });
  }

  return { totalUnits, selectedVariantCount, subtotal, lines };
}
