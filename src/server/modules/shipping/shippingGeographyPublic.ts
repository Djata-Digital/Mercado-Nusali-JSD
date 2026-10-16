/**
 * Geografia de frete PÚBLICA (somente leitura): regiões e setores ATIVOS de um país, para o visitante escolher o destino na página do produto
 * (a cotação POST /shipping/preview-cart já é pública). Devolve só id/nome/código (e regionId nos setores) — nunca tarifas, rotas, endereços,
 * armazéns ou qualquer dado de pessoas. Mesmas colunas que GET /buyer/shipping/regions|sectors já devolvem a compradores autenticados.
 */
import { and, asc, eq } from 'drizzle-orm';
import { shippingRegions, shippingSectors } from '../../../db/schema.js';

export class PublicGeographyError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); this.name = 'PublicGeographyError'; }
}

const COUNTRY_RE = /^[A-Z]{2}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,255}$/;
export const PUBLIC_GEOGRAPHY_MAX_ROWS = 2000;

export function parsePublicCountry(raw: unknown): string {
  const country = String(raw ?? '').trim().toUpperCase();
  if (!country) throw new PublicGeographyError(400, 'COUNTRY_REQUIRED', 'country é obrigatório.');
  if (!COUNTRY_RE.test(country)) throw new PublicGeographyError(400, 'COUNTRY_INVALID', 'country deve ser um código de 2 letras (ex.: GW).');
  return country;
}

export async function listPublicRegions(db: any, countryRaw: unknown): Promise<Array<{ id: string; name: string; code: string }>> {
  const country = parsePublicCountry(countryRaw);
  return db
    .select({ id: shippingRegions.id, name: shippingRegions.name, code: shippingRegions.code })
    .from(shippingRegions)
    .where(and(eq(shippingRegions.countryCode, country), eq(shippingRegions.isActive, true)))
    .orderBy(asc(shippingRegions.name))
    .limit(PUBLIC_GEOGRAPHY_MAX_ROWS);
}

export async function listPublicSectors(db: any, countryRaw: unknown, regionRaw?: unknown): Promise<Array<{ id: string; name: string; code: string; regionId: string | null }>> {
  const country = parsePublicCountry(countryRaw);
  const conditions = [eq(shippingSectors.countryCode, country), eq(shippingSectors.isActive, true)];
  if (regionRaw !== undefined && regionRaw !== null && String(regionRaw).trim() !== '') {
    const region = String(regionRaw).trim();
    if (!ID_RE.test(region)) throw new PublicGeographyError(400, 'REGION_INVALID', 'region inválida.');
    conditions.push(eq(shippingSectors.regionId, region));
  }
  return db
    .select({ id: shippingSectors.id, name: shippingSectors.name, code: shippingSectors.code, regionId: shippingSectors.regionId })
    .from(shippingSectors)
    .where(and(...conditions))
    .orderBy(asc(shippingSectors.name))
    .limit(PUBLIC_GEOGRAPHY_MAX_ROWS);
}
