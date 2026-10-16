/**
 * Informações do cartão de produto das listagens — puras. Nada é inventado: o desconto vem dos preços reais, a avaliação só aparece com avaliações
 * reais e a linha de entrega só afirma o que é verdade (o catálogo público já só lista produtos entregáveis ao país escolhido; o prazo e o frete reais
 * dependem do destino e aparecem na página do produto).
 */

/** Percentagem de desconto inteira calculada dos preços reais; null quando não há desconto real (preço original ausente, igual ou menor). */
export function cardDiscountPercent(price: number, originalPrice: number | null | undefined): number | null {
  if (!Number.isFinite(price) || price <= 0) return null;
  if (originalPrice === null || originalPrice === undefined || !Number.isFinite(originalPrice) || originalPrice <= price) return null;
  const pct = Math.round(((originalPrice - price) / originalPrice) * 100);
  return pct >= 1 ? pct : null;
}

/** Linha curta de entrega da listagem. Sem país conhecido não afirma nada além de "a calcular". */
export function cardDeliveryLine(countryName: string | null | undefined): string {
  const name = typeof countryName === 'string' ? countryName.trim() : '';
  return name ? `Entrega para ${name}` : 'Entrega a calcular';
}

/** Avaliação só é mostrada com avaliações reais (nota e quantidade positivas). */
export function hasRealReviews(rating: unknown, reviewsCount: unknown): boolean {
  const r = typeof rating === 'number' ? rating : Number(rating);
  const n = typeof reviewsCount === 'number' ? reviewsCount : Number(reviewsCount);
  return Number.isFinite(r) && r > 0 && Number.isFinite(n) && n > 0;
}
