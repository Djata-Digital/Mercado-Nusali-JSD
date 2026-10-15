/**
 * País de entrega selecionado pelo cliente — regras puras de persistência (testáveis sem React).
 *
 *  - A ESCOLHA EXPLÍCITA do cliente é gravada em 'nusali_display_country' (só por setSelectedCountry) e é a ÚNICA fonte da preferência:
 *    sobrevive a navegação completa, atualização da página e novas abas, e nunca é substituída por padrão, perfil ou geolocalização.
 *  - Guiné-Bissau (GW) é só o PADRÃO INICIAL quando não existe escolha explícita; o padrão nunca é gravado como se fosse escolha.
 *  - O país do perfil só é aplicado quando NÃO há escolha explícita.
 *  - O header X-Country-Code das chamadas à API lê primeiro a escolha explícita (ver storageService.getSelectedCountry).
 */
export const EXPLICIT_COUNTRY_KEY = 'nusali_display_country';
export const EXPLICIT_CURRENCY_KEY = 'nusali_display_currency';
export const DEFAULT_DELIVERY_COUNTRY = 'GW';

type StorageLike = Pick<Storage, 'getItem'>;

const safeGet = (storage: StorageLike | undefined, key: string): string | null => {
  try { return storage ? storage.getItem(key) : null; } catch { return null; }
};

/** Escolha explícita gravada (ou null). Valores vazios/lixo contam como "sem escolha". */
export function readExplicitCountry(storage?: StorageLike): string | null {
  const v = (safeGet(storage, EXPLICIT_COUNTRY_KEY) || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) ? v : null;
}

/** País inicial da sessão: a escolha explícita; só sem ela, o padrão (Guiné-Bissau). */
export function initialCountry(storage?: StorageLike): string {
  return readExplicitCountry(storage) ?? DEFAULT_DELIVERY_COUNTRY;
}

/** Há escolha manual de país OU de moeda (qualquer uma impede que o perfil/padrão a substitua). */
export function hasManualSelection(storage?: StorageLike): boolean {
  return Boolean(safeGet(storage, EXPLICIT_COUNTRY_KEY) || safeGet(storage, EXPLICIT_CURRENCY_KEY));
}

/** País do perfil a aplicar: SÓ quando há usuário e NENHUMA escolha manual; caso contrário null (nunca substitui a escolha). */
export function profileCountryToApply(p: { hasUser: boolean; hasManualSelection: boolean; userCountry?: string | null }): string | null {
  if (!p.hasUser || p.hasManualSelection) return null;
  const c = (p.userCountry || DEFAULT_DELIVERY_COUNTRY).trim().toUpperCase();
  return c || null;
}

/** País vindo de um evento 'storage' de outra aba (a escolha explícita mudou lá); null = evento irrelevante. */
export function countryFromStorageEvent(e: { key: string | null; newValue: string | null }): string | null {
  if (e.key !== EXPLICIT_COUNTRY_KEY) return null;
  const v = (e.newValue || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) ? v : null;
}
