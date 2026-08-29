/**
 * Elegibilidade geográfica de produtos — fonte única de verdade sobre se um
 * produto pode ser vendido/entregue para um determinado país de destino.
 *
 * Regra de negócio aprovada:
 *   NACIONAL (default): só disponível no próprio countryCode (país de origem).
 *   INTERNACIONAL: só disponível nos países explicitamente listados pelo
 *     vendedor em targetCountriesJson — NUNCA "todos os países" implícito.
 *
 * Usado em: catálogo (GET /products, GET /products/:id), carrinho
 * (POST /cart/items) e checkout (OrderService.createOrderFromCart) — o
 * checkout é o portão que realmente não pode ser contornado pelo frontend.
 */

export interface EligibilityProductInput {
  countryCode?: string | null;
  publishingScope?: string | null;
  targetCountriesJson?: unknown;
}

export type EligibilityScope = 'national' | 'international';

export function normalizePublishingScope(raw: unknown): EligibilityScope {
  return String(raw || 'national').toLowerCase() === 'international' ? 'international' : 'national';
}

export function getTargetCountriesList(targetCountriesJson: unknown): string[] {
  if (!Array.isArray(targetCountriesJson)) return [];
  return targetCountriesJson.map((c) => String(c).toUpperCase()).filter(Boolean);
}

/**
 * Retorna true somente se o produto puder ser legitimamente vendido/entregue
 * para `destinationCountry`. Sem destino conhecido, retorna false (nunca
 * assume disponibilidade por omissão) — quem chama decide se, na ausência de
 * destino, deve pular a validação (ex.: carrinho sem endereço ainda) ou
 * bloquear (ex.: checkout, onde o destino é sempre conhecido).
 */
export function isProductAvailableForCountry(
  product: EligibilityProductInput,
  destinationCountry: string | null | undefined
): boolean {
  if (!destinationCountry) return false;
  const dest = destinationCountry.toUpperCase();
  const origin = String(product.countryCode || '').toUpperCase();
  const scope = normalizePublishingScope(product.publishingScope);

  if (scope === 'international') {
    return getTargetCountriesList(product.targetCountriesJson).includes(dest);
  }
  return Boolean(origin) && dest === origin;
}

export function eligibilityReason(
  product: EligibilityProductInput,
  destinationCountry: string | null | undefined
): string {
  const scope = normalizePublishingScope(product.publishingScope);
  if (!destinationCountry) return 'Destino de entrega não informado.';
  if (scope === 'national') {
    return `Venda nacional — entrega disponível somente em ${String(product.countryCode || '').toUpperCase()}.`;
  }
  return `Venda internacional — entrega disponível somente nos países autorizados pelo vendedor (${getTargetCountriesList(product.targetCountriesJson).join(', ') || 'nenhum configurado'}).`;
}
