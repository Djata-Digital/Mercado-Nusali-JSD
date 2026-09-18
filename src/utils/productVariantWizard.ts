/**
 * FASE D16-B1 — lógica pura por trás do redesign em cards do wizard de
 * variantes. Nada aqui toca rede/DOM: só transforma o MESMO array plano
 * `ProductVariant[]` (variantsMatrix) que o D16-A2 já espera no payload
 * `variants[]` — o contrato de wire nunca muda, só a forma como o vendedor
 * enxerga e edita esse array na tela.
 *
 * Extraído para um módulo isolado (em vez de ficar só dentro do componente)
 * justamente para poder ser testado sem precisar renderizar React.
 */
import type { ProductVariant, ProductColor } from '../types';

export type ProductMode = 'simple' | 'variable';

/**
 * "Produto com variações" nunca é um campo salvo — é sempre inferido de
 * existir pelo menos uma variante real. Editar um produto que já tem
 * `variants` reais sempre abre em modo variable; caso contrário, simple.
 */
export function deriveProductMode(variants: ProductVariant[] | undefined | null): ProductMode {
  return Array.isArray(variants) && variants.length > 0 ? 'variable' : 'simple';
}

/**
 * Reconstrói a lista de cores a partir das VARIANTES REAIS — nunca de
 * `availableColors` (campo que o backend nunca persiste nem devolve, achado
 * central da auditoria D16-A2.5). A imagem de cada cor é a primeira
 * encontrada entre as variantes daquela cor (todas compartilham a mesma,
 * ver `propagateColorImage`).
 */
export function deriveColorsFromVariants(variants: ProductVariant[] | undefined | null): ProductColor[] {
  if (!Array.isArray(variants)) return [];
  const order: string[] = [];
  const byName = new Map<string, ProductColor>();
  for (const v of variants) {
    if (!v.color) continue;
    const existing = byName.get(v.color);
    if (!existing) {
      byName.set(v.color, { name: v.color, image: v.image || undefined });
      order.push(v.color);
    } else if (!existing.image && v.image) {
      existing.image = v.image;
    }
  }
  return order.map((name) => byName.get(name)!);
}

/** Mesma lógica do acima, para tamanhos — nunca de `availableSizes`. */
export function deriveSizesFromVariants(variants: ProductVariant[] | undefined | null): string[] {
  if (!Array.isArray(variants)) return [];
  const seen = new Set<string>();
  const order: string[] = [];
  for (const v of variants) {
    if (v.size && !seen.has(v.size)) {
      seen.add(v.size);
      order.push(v.size);
    }
  }
  return order;
}

export interface VariantGroup {
  /** null = variantes sem cor (produto só com tamanho, ou sem eixo nenhum). */
  color: string | null;
  image?: string;
  /** índice original em variantsMatrix — necessário para os handlers já existentes (handleUpdateVariantPrice(idx, ...) etc.) continuarem funcionando sem mudar de assinatura. */
  entries: Array<{ variant: ProductVariant; index: number }>;
}

/**
 * Agrupa o array plano por cor, preservando a ordem de primeira aparição —
 * é só uma projeção para renderização em cards; o array original
 * (variantsMatrix) nunca é reordenado nem mutado aqui.
 */
export function groupVariantsByColor(variants: ProductVariant[]): VariantGroup[] {
  const order: (string | null)[] = [];
  const groups = new Map<string | null, VariantGroup>();
  variants.forEach((variant, index) => {
    const key = variant.color || null;
    let group = groups.get(key);
    if (!group) {
      group = { color: key, image: variant.image, entries: [] };
      groups.set(key, group);
      order.push(key);
    } else if (!group.image && variant.image) {
      group.image = variant.image;
    }
    group.entries.push({ variant, index });
  });
  return order.map((key) => groups.get(key)!);
}

/**
 * Troca a imagem de TODAS as variantes de uma cor de uma vez — "a imagem da
 * cor", nunca uma imagem por tamanho. Retorna um array novo (nunca muta o
 * recebido), no mesmo padrão imutável já usado por handleUpdateVariantPrice
 * e afins.
 */
export function propagateColorImage(
  variants: ProductVariant[],
  colorName: string,
  imageUrl: string | undefined
): ProductVariant[] {
  return variants.map((v) => (v.color === colorName ? { ...v, image: imageUrl } : v));
}

export interface VariantsSummary {
  colorsCount: number;
  count: number;
  totalStock: number;
  minPrice: number | null;
  maxPrice: number | null;
}

/** Resumo somente-leitura mostrado no card de cima dos cards e na Etapa 4. */
export function computeVariantsSummary(variants: ProductVariant[]): VariantsSummary {
  const validPrices = variants
    .map((v) => v.price)
    .filter((p): p is number => typeof p === 'number' && !isNaN(p) && p > 0);
  const colorsCount = new Set(variants.map((v) => v.color).filter((c): c is string => !!c)).size;
  return {
    colorsCount,
    count: variants.length,
    totalStock: variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0),
    minPrice: validPrices.length > 0 ? Math.min(...validPrices) : null,
    maxPrice: validPrices.length > 0 ? Math.max(...validPrices) : null,
  };
}

export type DerivedProductPricing =
  | { price: number; originalPrice: number | undefined; stock: number }
  | { error: string };

/**
 * Deriva os 3 campos que products.* ainda exige (D16-A2 não muda) a partir
 * das variantes — nunca pede de novo ao vendedor:
 *   price = menor preço válido (>0) entre as variantes;
 *   stock = soma de todos os estoques informados;
 *   originalPrice = SÓ o da variante que determinou o menor preço, e SÓ se
 *     for realmente > price dessa mesma variante — nunca o maior riscado
 *     entre todas (isso inventaria uma promoção que não existe para o
 *     preço "a partir de" exibido).
 */
export function deriveProductLevelPricing(variants: ProductVariant[]): DerivedProductPricing {
  const withValidPrice = variants.filter(
    (v): v is ProductVariant & { price: number } => typeof v.price === 'number' && !isNaN(v.price) && v.price > 0
  );
  if (withValidPrice.length === 0) {
    return { error: 'Defina um preço válido (maior que 0) para pelo menos uma variação antes de publicar.' };
  }
  const cheapest = withValidPrice.reduce((min, v) => (v.price < min.price ? v : min), withValidPrice[0]);
  const totalStock = variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
  const originalPrice =
    typeof cheapest.originalPrice === 'number' && !isNaN(cheapest.originalPrice) && cheapest.originalPrice > cheapest.price
      ? cheapest.originalPrice
      : undefined;
  return { price: cheapest.price, originalPrice, stock: totalStock };
}

export interface VariantFieldErrors {
  price?: string;
  originalPrice?: string;
  stock?: string;
}

/** Validação por campo, para mostrar erro junto do input — nunca só depois do POST. */
export function validateVariantEntry(variant: ProductVariant): VariantFieldErrors {
  const errors: VariantFieldErrors = {};

  if (typeof variant.price !== 'number' || isNaN(variant.price) || variant.price <= 0) {
    errors.price = 'Preço deve ser maior que 0.';
  }

  if (variant.originalPrice !== undefined) {
    if (typeof variant.originalPrice !== 'number' || isNaN(variant.originalPrice)) {
      errors.originalPrice = 'Preço riscado inválido.';
    } else if (typeof variant.price === 'number' && variant.originalPrice <= variant.price) {
      errors.originalPrice = 'Preço riscado deve ser maior que o preço da variação.';
    }
  }

  if (variant.stock !== undefined && variant.stock !== null) {
    if (!Number.isInteger(variant.stock) || variant.stock < 0) {
      errors.stock = 'Estoque deve ser um número inteiro maior ou igual a 0.';
    }
  }

  return errors;
}

/**
 * Decide o valor de `variants` a enviar no payload — o único ponto de
 * contato com o contrato do D16-A2, nunca alterado:
 *   - variable: envia o array plano tal como está (mesmo formato de sempre);
 *   - simple mas o produto TINHA variantes reais ao abrir o editor: envia
 *     `[]` explicitamente — sync do D16-A2 desativa todas, nunca deleta;
 *   - simple e nunca teve variantes: omite o campo (undefined) — payload
 *     idêntico ao de um produto simples de sempre, risco zero.
 */
export function buildVariantsPayloadForSubmit(
  mode: ProductMode,
  variantsMatrix: ProductVariant[],
  hadRealVariantsOnLoad: boolean
): ProductVariant[] | undefined {
  if (mode === 'variable') return variantsMatrix;
  return hadRealVariantsOnLoad ? [] : undefined;
}
