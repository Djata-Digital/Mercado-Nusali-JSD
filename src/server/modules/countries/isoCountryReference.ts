/**
 * ISO/metadata REFERENCE catalog — used ONLY to validate the "Adicionar Novo País" admin form
 * (code / currency / phone prefix consistency) before it is written to the real `countries` table.
 *
 * This is NOT an operational data source. It never feeds the registration screen, the checkout,
 * catalog, or any customer-facing flow. The single source of truth for which countries the
 * Mercado Nusali actually operates in remains the `countries` table in PostgreSQL
 * (see countriesRoutes.ts for the public endpoint and adminRoutes.ts for admin CRUD).
 *
 * Values below are real-world ISO 3166-1 alpha-2 codes, ISO 4217 currency codes and E.164 phone
 * prefixes — kept intentionally small (CPLP + immediate West-African neighbors relevant to this
 * marketplace's expansion), not an exhaustive world list.
 */
export interface IsoCountryReferenceEntry {
  code: string;
  name: string;
  currency: string;
  phonePrefix: string;
}

export const ISO_COUNTRY_REFERENCE: IsoCountryReferenceEntry[] = [
  { code: 'GW', name: 'Guiné-Bissau', currency: 'XOF', phonePrefix: '+245' },
  { code: 'BR', name: 'Brasil', currency: 'BRL', phonePrefix: '+55' },
  { code: 'PT', name: 'Portugal', currency: 'EUR', phonePrefix: '+351' },
  { code: 'AO', name: 'Angola', currency: 'AOA', phonePrefix: '+244' },
  { code: 'CV', name: 'Cabo Verde', currency: 'CVE', phonePrefix: '+238' },
  { code: 'MZ', name: 'Moçambique', currency: 'MZN', phonePrefix: '+258' },
  { code: 'ST', name: 'São Tomé e Príncipe', currency: 'STN', phonePrefix: '+239' },
  { code: 'TL', name: 'Timor-Leste', currency: 'USD', phonePrefix: '+670' },
  { code: 'GM', name: 'Gâmbia', currency: 'GMD', phonePrefix: '+220' },
  { code: 'SN', name: 'Senegal', currency: 'XOF', phonePrefix: '+221' },
  { code: 'GN', name: 'Guiné-Conacri', currency: 'GNF', phonePrefix: '+224' },
  { code: 'ML', name: 'Mali', currency: 'XOF', phonePrefix: '+223' },
  { code: 'MR', name: 'Mauritânia', currency: 'MRU', phonePrefix: '+222' },
  { code: 'BJ', name: 'Benin', currency: 'XOF', phonePrefix: '+229' },
  { code: 'US', name: 'Estados Unidos', currency: 'USD', phonePrefix: '+1' },
];

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

export interface CountryValidationInput {
  code?: string;
  name?: string;
  currency?: string;
  phonePrefix?: string;
}

export interface CountryValidationResult {
  ok: boolean;
  message?: string;
  matchedReference?: IsoCountryReferenceEntry;
}

/**
 * Cross-checks a new/edited country submission against the known ISO reference.
 * - If the submitted `code` OR `name` matches a known reference entry, every other
 *   field must match that same entry (catches "Gâmbia" + code BJ, or code GM + currency XOF, etc).
 * - If nothing in the reference matches (a genuinely new country for this catalog),
 *   only basic structural checks are enforced so legitimate new countries are not blocked.
 */
export function validateCountryAgainstReference(input: CountryValidationInput): CountryValidationResult {
  const code = String(input.code || '').trim().toUpperCase();
  const name = String(input.name || '').trim();
  const currency = String(input.currency || '').trim().toUpperCase();
  const phonePrefix = String(input.phonePrefix || '').trim();

  // Basic structural validation (applies regardless of reference match)
  if (!/^[A-Z]{2}$/.test(code)) {
    return { ok: false, message: `Código de país inválido ("${code}"). Use o código ISO 3166-1 alpha-2 de 2 letras (ex.: GM, SN, GW).` };
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    return { ok: false, message: `Código de moeda inválido ("${currency}"). Use o código ISO 4217 de 3 letras (ex.: XOF, BRL, GMD).` };
  }
  if (!/^\+\d{1,4}$/.test(phonePrefix)) {
    return { ok: false, message: `DDI inválido ("${phonePrefix}"). Use o formato internacional (ex.: +245, +220).` };
  }

  const byCode = ISO_COUNTRY_REFERENCE.find((r) => r.code === code);
  const byName = ISO_COUNTRY_REFERENCE.find((r) => normalize(r.name) === normalize(name));
  const reference = byCode || byName;

  if (!reference) {
    // Not in our curated reference — allow (this is a validation aid, not an exhaustive allowlist),
    // structural checks above already ran.
    return { ok: true };
  }

  const mismatches: string[] = [];
  if (byName && byName.code !== code) {
    mismatches.push(`"${name}" corresponde ao código ISO "${byName.code}", não "${code}"`);
  }
  if (byCode && normalize(byCode.name) !== normalize(name)) {
    mismatches.push(`o código "${code}" corresponde a "${byCode.name}", não a "${name}"`);
  }
  if (reference.currency !== currency) {
    mismatches.push(`a moeda oficial de ${reference.name} é "${reference.currency}", não "${currency}"`);
  }
  if (reference.phonePrefix !== phonePrefix) {
    mismatches.push(`o DDI de ${reference.name} é "${reference.phonePrefix}", não "${phonePrefix}"`);
  }

  if (mismatches.length > 0) {
    return {
      ok: false,
      message: `Combinação de país inválida: ${mismatches.join('; ')}.`,
      matchedReference: reference,
    };
  }

  return { ok: true, matchedReference: reference };
}
