/**
 * FASE D16-H2 — quantidade digitável (Product Detail + Carrinho). Funções
 * puras (sem React/DOM/rede), compartilhadas pelos dois fluxos: o comprador
 * digita a quantidade OU usa os botões −/+, sem perder a possibilidade de um
 * dos dois. Decimal/negativo/letras nunca chegam a existir no input — são
 * filtrados na digitação (sanitizeQuantityDigits), nunca "rejeitados" depois
 * de já visíveis na tela. A confirmação (blur/Enter) só precisa then
 * resolver [vazio | dígitos] para um inteiro dentro de [min, max].
 */
import type { CartItem } from '../types';

/** Filtra a digitação para só dígitos — decimal/negativo/letras são impossíveis de digitar (nunca precisam ser corrigidos depois). Limite de 7 dígitos evita valores absurdos sem impedir quantidades reais. */
export function sanitizeQuantityDigits(raw: string): string {
  return raw.replace(/[^\d]/g, '').slice(0, 7);
}

export interface QuantityInputResolution {
  /** Valor final a aplicar — sempre um inteiro dentro de [min, max]. */
  value: number;
  /** Mensagem para o comprador quando o valor digitado precisou ser ajustado — null quando o valor foi aceito exatamente como digitado. */
  message: string | null;
}

/**
 * Resolve o texto do input (já filtrado por sanitizeQuantityDigits, mas
 * também seguro para texto cru) no momento da confirmação (blur/Enter).
 * Nunca falha silenciosamente: todo ajuste vem acompanhado de mensagem.
 *
 * @param min 0 no Product Detail (variante pode ficar não selecionada), 1 no Carrinho (item já existe).
 * @param max disponibilidade real da linha/variante (autoridade: inventory).
 */
export function resolveQuantityInputValue(rawInput: string, min: number, max: number): QuantityInputResolution {
  const digitsOnly = sanitizeQuantityDigits(rawInput);
  const effectiveMax = Number.isFinite(max) ? Math.max(0, max) : Number.MAX_SAFE_INTEGER;

  if (digitsOnly === '') {
    return { value: min, message: null };
  }

  const parsed = Number.parseInt(digitsOnly, 10);
  if (!Number.isFinite(parsed)) {
    return { value: min, message: 'Quantidade inválida.' };
  }

  if (parsed > effectiveMax) {
    return { value: effectiveMax, message: `Quantidade máxima disponível: ${effectiveMax}` };
  }
  if (parsed < min) {
    return {
      value: min,
      message: min > 0 ? `A quantidade mínima é ${min}. Para remover, use o botão de remover item.` : null,
    };
  }
  return { value: parsed, message: null };
}

/**
 * Disponibilidade real (autoridade: inventory) da LINHA específica do
 * carrinho — nunca o estoque agregado do produto quando a linha é uma
 * variante. Ordem de preferência:
 *   1. product.availableStock já resolvido pelo backend para esta linha
 *      (carrinho de usuário autenticado, GET /cart — D16-H2).
 *   2. product.variants[] com availableStock ao vivo (carrinho local/guest,
 *      onde o Product completo veio de GET /products/:id no momento do
 *      "adicionar ao carrinho").
 *   3. product.stock — produto simples, sem variantId.
 */
export function getCartItemAvailableStock(item: CartItem): number {
  const prod: any = item.product;
  if (typeof prod?.availableStock === 'number') {
    return Math.max(0, prod.availableStock);
  }
  if (item.selectedVariantSku && Array.isArray(prod?.variants)) {
    const v = prod.variants.find((v: any) => v.id === item.selectedVariantSku);
    if (v) return Math.max(0, v.availableStock ?? 0);
  }
  return Math.max(0, prod?.stock ?? 0);
}
