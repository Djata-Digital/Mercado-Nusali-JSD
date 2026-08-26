/**
 * Fase "Países operacionais dinâmicos" — resolução de moeda por país
 * compartilhada entre PreferencesContext, MarketplaceContext e demais
 * consumidores. A lista de países operacionais REAIS (GET /api/v1/countries)
 * é sempre a autoridade; um mapa/config hardcoded (legado) só serve de
 * fallback de exibição enquanto os dados reais ainda não carregaram — nunca
 * decide se um país existe.
 */
export interface MinimalOperationalCountry {
  code: string;
  currency: string;
}

export function resolveCurrencyForCountry(
  code: string,
  operationalCountries: MinimalOperationalCountry[] | undefined | null,
  legacyFallbackMap: Record<string, string>
): string | undefined {
  const real = operationalCountries?.find((c) => c.code === code);
  if (real) return real.currency;
  return legacyFallbackMap[code];
}
