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

const COLUMN_AXIS_CODES = new Set(['cor', 'color', 'tamanho', 'size', 'capacidade', 'capacity']);
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

/** Valor textual (não vazio) de uma chave de product_variants.attributes_json, ou undefined (objetos/listas não contam). */
export function jsonAxisValue(v: ProductVariant, key: string): string | undefined {
  const json = v.attributesJson && typeof v.attributesJson === 'object' ? (v.attributesJson as Record<string, unknown>) : null;
  const raw = json ? json[key] : undefined;
  if (raw === undefined || raw === null || typeof raw === 'object') return undefined;
  const t = String(raw).trim();
  return t === '' ? undefined : t;
}

/** Chaves de attributes_json que são eixos de variação (não repetem cor/tamanho/capacidade), na ordem em que aparecem; `preferred` (códigos dos eixos da categoria) vem primeiro. */
export function jsonAxisKeys(variants: ProductVariant[] | undefined | null, preferred: string[] = []): string[] {
  const seen: string[] = [];
  for (const v of getActiveVariants(variants)) {
    const json = v.attributesJson && typeof v.attributesJson === 'object' ? (v.attributesJson as Record<string, unknown>) : {};
    for (const k of Object.keys(json)) {
      if (COLUMN_AXIS_CODES.has(norm(k)) || seen.includes(k)) continue;
      if (jsonAxisValue(v, k) !== undefined) seen.push(k);
    }
  }
  const rank = (k: string) => { const i = preferred.findIndex((p) => norm(p) === norm(k)); return i < 0 ? Number.MAX_SAFE_INTEGER : i; };
  return [...seen].sort((a, b) => rank(a) - rank(b));
}

/**
 * Eixo (em attributes_json) que faz de "segunda dimensão" para o comprador — ex.: Voltagem. Só existe quando NENHUMA variante ativa tem
 * tamanho nem capacidade (Tamanho/Capacidade continuam sendo a 2ª dimensão de sempre). Os demais eixos de attributes_json são "extras".
 */
export function secondaryJsonKey(variants: ProductVariant[] | undefined | null, preferred: string[] = []): string | undefined {
  const active = getActiveVariants(variants);
  if (active.some((v) => !!(v.size || v.capacity))) return undefined;
  return jsonAxisKeys(active, preferred)[0];
}

/** Valor da segunda dimensão de uma variante: size, senão capacity, senão o eixo de attributes_json (`jsonKey`, ver secondaryJsonKey). */
export function secondaryAxisValue(v: ProductVariant, jsonKey?: string): string | undefined {
  return v.size || v.capacity || (jsonKey ? jsonAxisValue(v, jsonKey) : undefined) || undefined;
}

/** O produto tem alguma segunda dimensão real (tamanho, capacidade ou um eixo de attributes_json como Voltagem)? */
export function hasSecondaryAxis(variants: ProductVariant[] | undefined | null, preferred: string[] = []): boolean {
  const active = getActiveVariants(variants);
  const jk = secondaryJsonKey(active, preferred);
  return active.some((v) => !!secondaryAxisValue(v, jk));
}

/**
 * Tamanhos/capacidades REALMENTE existentes numa cor (ou entre todas as
 * variantes ativas, se `color` for null — produto sem eixo de cor). Nunca
 * inventa uma combinação cartesiana que não existe de verdade em
 * product.variants.
 */
export function getSizesForColor(variants: ProductVariant[] | undefined | null, color: string | null, preferredJson: string[] = []): string[] {
  const active = getActiveVariants(variants);
  const jk = secondaryJsonKey(active, preferredJson);
  const pool = color ? active.filter((v) => v.color === color) : active;
  const seen = new Set<string>();
  const order: string[] = [];
  for (const v of pool) {
    const val = secondaryAxisValue(v, jk);
    if (val && !seen.has(val)) {
      seen.add(val);
      order.push(val);
    }
  }
  return order;
}

export interface VariantSelection {
  color?: string | null;
  /** Valor da segunda dimensão (tamanho, capacidade ou o eixo de attributes_json, ex.: Voltagem). */
  size?: string | null;
  /** Eixos adicionais em attributes_json (código -> valor escolhido), além da segunda dimensão. */
  extras?: Record<string, string | null | undefined>;
  /** Códigos dos eixos da categoria, na ordem de definição (desempata qual eixo de attributes_json é a segunda dimensão). */
  preferredJson?: string[];
}

/** Eixos extras (attributes_json) com valor em alguma variante ativa, fora o que já é a segunda dimensão. */
export function extraAxisKeys(variants: ProductVariant[] | undefined | null, preferredJson: string[] = []): string[] {
  const jk = secondaryJsonKey(variants, preferredJson);
  return jsonAxisKeys(variants, preferredJson).filter((k) => k !== jk);
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

  const jk = secondaryJsonKey(active, selection.preferredJson);
  const hasColors = active.some((v) => !!v.color);
  const hasSecondary = active.some((v) => !!secondaryAxisValue(v, jk));

  let pool = active;
  if (hasColors) {
    if (!selection.color) return null;
    pool = pool.filter((v) => v.color === selection.color);
  }
  if (hasSecondary) {
    if (!selection.size) {
      return pool.length === 1 ? pool[0] : null;
    }
    pool = pool.filter((v) => secondaryAxisValue(v, jk) === selection.size);
  }
  // Eixos adicionais (attributes_json): só filtram quando o comprador escolheu um valor; sem escolha, só resolve se sobrar uma variante.
  for (const [key, value] of Object.entries(selection.extras ?? {})) {
    if (value) pool = pool.filter((v) => jsonAxisValue(v, key) === value);
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
  selection: VariantSelection,
  /** Nome REAL da segunda dimensão ("Voltagem", "Capacidade"…) e dos eixos extras, para a mensagem; sem eles, "tamanho". */
  secondLabel?: string,
  extraLabels?: Record<string, string>
): string | null {
  const active = getActiveVariants(variants);
  if (active.length === 0) return null; // produto simples — nada a bloquear aqui

  const resolved = resolveSelectedVariant(variants, selection);
  if (resolved) {
    return isVariantAvailable(resolved) ? null : 'Esta variação está sem estoque no momento.';
  }

  const jk = secondaryJsonKey(active, selection.preferredJson);
  const hasColors = active.some((v) => !!v.color);
  const hasSecondary = active.some((v) => !!secondaryAxisValue(v, jk));
  if (hasColors && !selection.color) return 'Selecione uma cor.';
  if (hasSecondary && !selection.size) return secondLabel ? `Selecione a opção de ${secondLabel}.` : 'Selecione um tamanho.';
  for (const key of extraAxisKeys(active, selection.preferredJson)) {
    const distinct = new Set(active.map((v) => jsonAxisValue(v, key)).filter(Boolean));
    if (distinct.size > 1 && !selection.extras?.[key]) return `Selecione a opção de ${extraLabels?.[key] ?? key}.`;
  }
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
