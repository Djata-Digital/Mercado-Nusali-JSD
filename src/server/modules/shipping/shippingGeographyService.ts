/**
 * FASE D15-A — Fundação do sistema de rotas de frete por setor.
 *
 * Hierarquia: país (countries, reaproveitada) > shipping_regions >
 * shipping_sectors > shipping_routes (origem setor -> destino setor,
 * direcional) > shipping_services > shipping_route_rates (tarifa por
 * rota+serviço+faixa de peso).
 *
 * Sistema PARALELO ao modelo país/zona já existente (shippingZones/
 * shippingRates/storeShippingPolicies) — nenhuma dessas tabelas é lida ou
 * escrita por este arquivo, e o checkout (ShippingCalculatorService/
 * orderService.ts) não usa nada daqui ainda. Integração real com o
 * checkout é uma fase futura (D15-B), fora do escopo deste arquivo.
 *
 * "regions" (tabela RBAC territorial, usada por AdminRegionsManager.tsx/
 * AdminRegionalSupervisors.tsx) é um domínio DIFERENTE — nunca confundida
 * com shipping_regions aqui. "Região Cacheu" (RBAC) e "Setor Cacheu"
 * (frete) também nunca são a mesma entidade, mesmo compartilhando o nome —
 * os testes deste módulo verificam isso explicitamente.
 *
 * Semântica de faixa de peso, documentada uma única vez aqui:
 *   [minWeightKg, maxWeightKg) — mínimo inclusivo, máximo exclusivo.
 *   Um produto de exatamente 1kg pertence à faixa que o tem como MÍNIMO,
 *   nunca à faixa anterior que o teria como máximo (ex.: faixas 0-1 e 1-3:
 *   1kg cai em 1-3, nunca em 0-1).
 */
import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '../../../db/index.js';
import {
  countries,
  shippingRegions,
  shippingSectors,
  shippingRoutes,
  shippingServices,
  shippingRouteRates,
  addresses,
  stores,
  sellers,
} from '../../../db/schema.js';

export const GUINEA_BISSAU_COUNTRY_CODE = 'GW';

/**
 * Normaliza um nome para um código estável (sem acentos, maiúsculo,
 * separado por "_") — mesmo padrão já usado em outros lugares do projeto
 * para gerar slugs (ex.: adminRoutes.ts, categorias).
 */
export function toShippingCode(name: string): string {
  return name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/(^_|_$)+/g, '');
}

interface RegionSeedDef {
  name: string;
  sectors: string[];
}

// 9 divisões de primeiro nível + Setor Autónomo de Bissau (modelado como
// sua própria "região" de 1 setor só, exatamente como a lista operacional
// fornecida) = 39 setores no total.
export const GUINEA_BISSAU_REGIONS: RegionSeedDef[] = [
  { name: 'Bafatá', sectors: ['Bafatá', 'Bambadinca', 'Contuboel', 'Galomaro', 'Gã-Mamudo', 'Xitole'] },
  { name: 'Biombo', sectors: ['Prabis', 'Quinhamel', 'Safim'] },
  { name: 'Setor Autónomo de Bissau', sectors: ['Bissau'] },
  { name: 'Bolama/Bijagós', sectors: ['Bolama', 'Bubaque', 'Caravela', 'Uno'] },
  { name: 'Cacheu', sectors: ['Bigene', 'Bula', 'Cacheu', 'Caió', 'Canchungo', 'São Domingos'] },
  { name: 'Gabú', sectors: ['Gabú', 'Madina de Boé', 'Pirada', 'Pitche', 'Sonaco'] },
  { name: 'Oio', sectors: ['Bissorã', 'Farim', 'Mansabá', 'Mansoa', 'Nhacra'] },
  { name: 'Quinara', sectors: ['Buba', 'Empada', 'Fulacunda', 'Tite'] },
  { name: 'Tombali', sectors: ['Bedanda', 'Cacine', 'Catió', 'Como', 'Quebo'] },
];

export const GUINEA_BISSAU_TOTAL_SECTORS = GUINEA_BISSAU_REGIONS.reduce((acc, r) => acc + r.sectors.length, 0);
export const GUINEA_BISSAU_TOTAL_REGIONS = GUINEA_BISSAU_REGIONS.length;
export const GUINEA_BISSAU_EXPECTED_ROUTES = GUINEA_BISSAU_TOTAL_SECTORS * GUINEA_BISSAU_TOTAL_SECTORS;

// Serviços básicos — SEM nenhuma tarifa fictícia associada. Uma rota pode
// (e vai, na maioria dos casos após este seed) existir sem tarifa nenhuma.
export const BASIC_SHIPPING_SERVICES: { name: string; code: string; description?: string }[] = [
  { name: 'Standard', code: 'STANDARD', description: 'Entrega padrão.' },
  { name: 'Economy', code: 'ECONOMY', description: 'Entrega econômica, prazo mais longo.' },
  { name: 'Express', code: 'EXPRESS', description: 'Entrega expressa, prazo mais curto.' },
];

function regionId(countryCode: string, code: string): string {
  return `shpreg_${countryCode.toLowerCase()}_${code.toLowerCase()}`;
}
function sectorId(countryCode: string, code: string): string {
  return `shpsec_${countryCode.toLowerCase()}_${code.toLowerCase()}`;
}
function serviceId(countryCode: string, code: string): string {
  return `shpsvc_${countryCode.toLowerCase()}_${code.toLowerCase()}`;
}
function routeId(countryCode: string, originCode: string, destinationCode: string): string {
  return `shproute_${countryCode.toLowerCase()}_${originCode.toLowerCase()}_${destinationCode.toLowerCase()}`;
}

export interface ShippingGeographySeedResult {
  regionsCreated: number;
  sectorsCreated: number;
  servicesCreated: number;
  routesCreated: number;
  totalRegions: number;
  totalSectors: number;
  totalServices: number;
  totalRoutes: number;
  sameSectorRoutes: number;
  duplicateRoutes: number;
}

/**
 * Seed idempotente da geografia de frete da Guiné-Bissau: 9 regiões,
 * 39 setores, serviços básicos (sem tarifa nenhuma), e o produto cartesiano
 * completo de rotas (39×39 = 1.521, incluindo mesmo-setor). Rodar de novo
 * NUNCA duplica nem apaga nada — usa IDs determinísticos + ON CONFLICT DO
 * NOTHING. Nunca toca shipping_rates/shipping_zones/store_shipping_policies
 * (sistema antigo, intocado).
 */
export async function seedGuineaBissauShippingGeography(executor?: any): Promise<ShippingGeographySeedResult> {
  const db = executor ?? getDb();
  if (!db) throw new Error('SHIPPING_GEOGRAPHY_DB_UNAVAILABLE: banco de dados indisponível.');

  const [countryRow] = await db.select().from(countries).where(eq(countries.code, GUINEA_BISSAU_COUNTRY_CODE)).limit(1);
  if (!countryRow) {
    throw new Error(`SHIPPING_GEOGRAPHY_COUNTRY_MISSING: país ${GUINEA_BISSAU_COUNTRY_CODE} não existe em countries — seed abortado sem escrever nada.`);
  }

  let regionsCreated = 0;
  let sectorsCreated = 0;
  let servicesCreated = 0;
  const sectorIds: string[] = [];

  for (const regionDef of GUINEA_BISSAU_REGIONS) {
    const regionCode = toShippingCode(regionDef.name);
    const rId = regionId(GUINEA_BISSAU_COUNTRY_CODE, regionCode);

    const existingRegion = await db.select().from(shippingRegions).where(eq(shippingRegions.id, rId)).limit(1);
    if (existingRegion.length === 0) {
      await db.insert(shippingRegions).values({
        id: rId,
        countryCode: GUINEA_BISSAU_COUNTRY_CODE,
        name: regionDef.name,
        code: regionCode,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoNothing();
      regionsCreated++;
    }

    for (const sectorName of regionDef.sectors) {
      const sectorCode = toShippingCode(sectorName);
      const sId = sectorId(GUINEA_BISSAU_COUNTRY_CODE, sectorCode);
      sectorIds.push(sId);

      // Invariante de consistência (garantida por construção aqui, mas
      // validada explicitamente — nunca confiar apenas na ordem do código):
      // o setor deve pertencer ao MESMO país da região.
      const consistencyError = validateSectorRegionCountryConsistency(
        { countryCode: GUINEA_BISSAU_COUNTRY_CODE },
        { countryCode: GUINEA_BISSAU_COUNTRY_CODE }
      );
      if (consistencyError) throw new Error(consistencyError);

      const existingSector = await db.select().from(shippingSectors).where(eq(shippingSectors.id, sId)).limit(1);
      if (existingSector.length === 0) {
        await db.insert(shippingSectors).values({
          id: sId,
          countryCode: GUINEA_BISSAU_COUNTRY_CODE,
          regionId: rId,
          name: sectorName,
          code: sectorCode,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }).onConflictDoNothing();
        sectorsCreated++;
      }
    }
  }

  for (const svc of BASIC_SHIPPING_SERVICES) {
    const svcId = serviceId(GUINEA_BISSAU_COUNTRY_CODE, svc.code);
    const existing = await db.select().from(shippingServices).where(eq(shippingServices.id, svcId)).limit(1);
    if (existing.length === 0) {
      await db.insert(shippingServices).values({
        id: svcId,
        countryCode: GUINEA_BISSAU_COUNTRY_CODE,
        name: svc.name,
        code: svc.code,
        description: svc.description ?? null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoNothing();
      servicesCreated++;
    }
  }

  // Produto cartesiano origem x destino, direcional, incluindo mesmo-setor.
  // IDs determinísticos (por par de códigos) tornam o seed idempotente por
  // si só — ON CONFLICT DO NOTHING é a segunda camada de segurança (cobre
  // também a UNIQUE(countryCode, originSectorId, destinationSectorId), caso
  // algum dia os IDs deixem de ser determinísticos).
  const sectorCodesOrdered = GUINEA_BISSAU_REGIONS.flatMap((r) => r.sectors.map((s) => toShippingCode(s)));
  const routeRows: any[] = [];
  for (const originCode of sectorCodesOrdered) {
    for (const destinationCode of sectorCodesOrdered) {
      routeRows.push({
        id: routeId(GUINEA_BISSAU_COUNTRY_CODE, originCode, destinationCode),
        countryCode: GUINEA_BISSAU_COUNTRY_CODE,
        originSectorId: sectorId(GUINEA_BISSAU_COUNTRY_CODE, originCode),
        destinationSectorId: sectorId(GUINEA_BISSAU_COUNTRY_CODE, destinationCode),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  const BATCH_SIZE = 200;
  let routesCreated = 0;
  for (let i = 0; i < routeRows.length; i += BATCH_SIZE) {
    const batch = routeRows.slice(i, i + BATCH_SIZE);
    const inserted = await db.insert(shippingRoutes).values(batch).onConflictDoNothing().returning({ id: shippingRoutes.id });
    routesCreated += inserted.length;
  }

  const [{ totalRegions }] = await db
    .select({ totalRegions: sql<number>`count(*)::int` })
    .from(shippingRegions)
    .where(eq(shippingRegions.countryCode, GUINEA_BISSAU_COUNTRY_CODE));
  const [{ totalSectors }] = await db
    .select({ totalSectors: sql<number>`count(*)::int` })
    .from(shippingSectors)
    .where(eq(shippingSectors.countryCode, GUINEA_BISSAU_COUNTRY_CODE));
  const [{ totalServices }] = await db
    .select({ totalServices: sql<number>`count(*)::int` })
    .from(shippingServices)
    .where(eq(shippingServices.countryCode, GUINEA_BISSAU_COUNTRY_CODE));
  const [{ totalRoutes }] = await db
    .select({ totalRoutes: sql<number>`count(*)::int` })
    .from(shippingRoutes)
    .where(eq(shippingRoutes.countryCode, GUINEA_BISSAU_COUNTRY_CODE));
  const [{ sameSectorRoutes }] = await db
    .select({ sameSectorRoutes: sql<number>`count(*)::int` })
    .from(shippingRoutes)
    .where(and(eq(shippingRoutes.countryCode, GUINEA_BISSAU_COUNTRY_CODE), sql`${shippingRoutes.originSectorId} = ${shippingRoutes.destinationSectorId}`));
  const [{ duplicateRoutes }] = await db
    .select({ duplicateRoutes: sql<number>`count(*)::int` })
    .from(sql`(
      SELECT origin_sector_id, destination_sector_id, count(*) AS c
      FROM shipping_routes
      WHERE country_code = ${GUINEA_BISSAU_COUNTRY_CODE}
      GROUP BY origin_sector_id, destination_sector_id
      HAVING count(*) > 1
    ) dup`);

  return {
    regionsCreated,
    sectorsCreated,
    servicesCreated,
    routesCreated,
    totalRegions,
    totalSectors,
    totalServices,
    totalRoutes,
    sameSectorRoutes,
    duplicateRoutes,
  };
}

// ============================================================================
// VALIDAÇÕES — nunca confiar só no frontend. Reutilizadas pelas rotas admin
// (adminRoutes.ts) e testadas diretamente aqui.
// ============================================================================

export function validateSectorRegionCountryConsistency(
  sector: { countryCode: string },
  region: { countryCode: string }
): string | null {
  if (sector.countryCode !== region.countryCode) {
    return `SECTOR_REGION_COUNTRY_MISMATCH: o setor pertence a "${sector.countryCode}" mas a região pertence a "${region.countryCode}".`;
  }
  return null;
}

export function validateRouteSectorCountryConsistency(
  route: { countryCode: string },
  originSector: { countryCode: string },
  destinationSector: { countryCode: string }
): string | null {
  if (route.countryCode !== originSector.countryCode) {
    return `ROUTE_ORIGIN_COUNTRY_MISMATCH: a rota pertence a "${route.countryCode}" mas o setor de origem pertence a "${originSector.countryCode}".`;
  }
  if (route.countryCode !== destinationSector.countryCode) {
    return `ROUTE_DESTINATION_COUNTRY_MISMATCH: a rota pertence a "${route.countryCode}" mas o setor de destino pertence a "${destinationSector.countryCode}".`;
  }
  return null;
}

export function validateServiceRouteCountryConsistency(
  route: { countryCode: string },
  service: { countryCode: string }
): string | null {
  if (route.countryCode !== service.countryCode) {
    return `SERVICE_COUNTRY_MISMATCH: o serviço pertence a "${service.countryCode}" mas a rota pertence a "${route.countryCode}".`;
  }
  return null;
}

export interface WeightRangeInput {
  minWeightKg: number;
  maxWeightKg: number;
}

export function validateWeightRange(input: WeightRangeInput): string | null {
  const min = Number(input.minWeightKg);
  const max = Number(input.maxWeightKg);
  if (input.minWeightKg === undefined || input.minWeightKg === null || isNaN(min) || min < 0) {
    return 'MIN_WEIGHT_INVALID: minWeightKg deve ser um número maior ou igual a 0.';
  }
  if (input.maxWeightKg === undefined || input.maxWeightKg === null || isNaN(max) || max <= min) {
    return 'MAX_WEIGHT_INVALID: maxWeightKg deve ser um número maior que minWeightKg.';
  }
  return null;
}

/** Semântica [min, max) — overlap sse minA < maxB E minB < maxA. */
export function weightRangesOverlap(minA: number, maxA: number, minB: number, maxB: number): boolean {
  return minA < maxB && minB < maxA;
}

/** null = sem limite (validFrom null = -infinito, validUntil null = +infinito). */
export function periodsOverlap(
  fromA: Date | string | null | undefined,
  untilA: Date | string | null | undefined,
  fromB: Date | string | null | undefined,
  untilB: Date | string | null | undefined
): boolean {
  const startA = fromA ? new Date(fromA).getTime() : -Infinity;
  const endA = untilA ? new Date(untilA).getTime() : Infinity;
  const startB = fromB ? new Date(fromB).getTime() : -Infinity;
  const endB = untilB ? new Date(untilB).getTime() : Infinity;
  return startA < endB && startB < endA;
}

export interface ShippingRouteRateInput {
  routeId: string;
  serviceId: string;
  minWeightKg: number;
  maxWeightKg: number;
  amount: number;
  currency: string;
  validFrom?: Date | string | null;
  validUntil?: Date | string | null;
}

export type ShippingRouteRateValidationResult =
  | { error: string }
  | { ok: true; route: typeof shippingRoutes.$inferSelect; service: typeof shippingServices.$inferSelect };

/**
 * Valida uma tarifa antes de criar/atualizar — SEMPRE roda contra o banco
 * (route/service existem? mesmo país? moeda coerente com o mercado? faixa de
 * peso overlapando alguma tarifa ATIVA do mesmo route+service no mesmo
 * período de vigência?). Chamar dentro de uma transação (db.transaction) no
 * endpoint admin garante que a checagem e a escrita usam a mesma "foto" do
 * banco.
 *
 * Limitação de concorrência documentada (aceita, mesmo padrão já usado por
 * findOverlappingShippingRate para o sistema de frete antigo): duas
 * requisições concorrentes podem ambas passar nesta validação antes de
 * qualquer uma commitar, criando um overlap em condição de corrida rara.
 * Não implementamos um EXCLUDE CONSTRAINT (btree_gist) nesta fase por não
 * ser uma extensão já usada no projeto — se overlaps concorrentes se
 * tornarem um problema real em produção, essa seria a solução correta a
 * adicionar depois, não agora.
 */
export async function validateShippingRouteRateInput(
  executor: any,
  input: ShippingRouteRateInput,
  opts?: { excludeRateId?: string }
): Promise<ShippingRouteRateValidationResult> {
  const weightError = validateWeightRange(input);
  if (weightError) return { error: weightError };

  const amount = Number(input.amount);
  if (input.amount === undefined || input.amount === null || isNaN(amount) || amount < 0) {
    return { error: 'AMOUNT_INVALID: amount deve ser um número maior ou igual a 0.' };
  }

  if (!input.currency || !String(input.currency).trim()) {
    return { error: 'CURRENCY_REQUIRED: currency é obrigatória.' };
  }

  if (!input.routeId) return { error: 'ROUTE_ID_REQUIRED: routeId é obrigatório.' };
  const [route] = await executor.select().from(shippingRoutes).where(eq(shippingRoutes.id, input.routeId)).limit(1);
  if (!route) return { error: `ROUTE_NOT_FOUND: rota "${input.routeId}" não encontrada.` };

  if (!input.serviceId) return { error: 'SERVICE_ID_REQUIRED: serviceId é obrigatório.' };
  const [service] = await executor.select().from(shippingServices).where(eq(shippingServices.id, input.serviceId)).limit(1);
  if (!service) return { error: `SERVICE_NOT_FOUND: serviço "${input.serviceId}" não encontrado.` };

  const serviceCountryError = validateServiceRouteCountryConsistency(route, service);
  if (serviceCountryError) return { error: serviceCountryError };

  const [countryRow] = await executor.select().from(countries).where(eq(countries.code, route.countryCode)).limit(1);
  if (!countryRow) return { error: `COUNTRY_NOT_FOUND: país "${route.countryCode}" não encontrado.` };
  if (String(input.currency).trim().toUpperCase() !== String(countryRow.currency).toUpperCase()) {
    return {
      error: `CURRENCY_MISMATCH: a moeda "${input.currency}" não corresponde à moeda do mercado ${route.countryCode} (${countryRow.currency}).`,
    };
  }

  const existingActiveRates = await executor
    .select()
    .from(shippingRouteRates)
    .where(and(
      eq(shippingRouteRates.routeId, input.routeId),
      eq(shippingRouteRates.serviceId, input.serviceId),
      eq(shippingRouteRates.isActive, true),
    ));

  for (const existing of existingActiveRates) {
    if (opts?.excludeRateId && existing.id === opts.excludeRateId) continue;
    const overlapsWeight = weightRangesOverlap(
      Number(input.minWeightKg), Number(input.maxWeightKg),
      Number(existing.minWeightKg), Number(existing.maxWeightKg)
    );
    if (!overlapsWeight) continue;
    const overlapsPeriod = periodsOverlap(input.validFrom, input.validUntil, existing.validFrom, existing.validUntil);
    if (overlapsPeriod) {
      return {
        error: `RATE_OVERLAP: já existe uma tarifa ativa para esta rota+serviço com faixa de peso sobreposta (${existing.minWeightKg}-${existing.maxWeightKg}kg) no mesmo período de vigência.`,
      };
    }
  }

  return { ok: true, route, service };
}

// ============================================================================
// FASE D15-C — origem operacional do seller (endereço estruturado + setor de
// frete opcional). NÃO conectado ao checkout/shipmentService nesta fase —
// só schema, validação e CRUD administrável pelo próprio seller.
// ============================================================================

/**
 * Deriva região a partir do setor — NUNCA o contrário. addresses.shippingSectorId
 * é a ÚNICA fonte de verdade geográfica de frete gravada no endereço; a
 * região é sempre computada em tempo de leitura (evita a divergência
 * region=X + sector=setor-de-Y que uma coluna shippingRegionId paralela
 * permitiria). Retorna null se o setor não existir (nunca inventa região).
 */
export async function deriveShippingRegionFromSector(
  executor: any,
  shippingSectorId: string | null | undefined
): Promise<{ sector: typeof shippingSectors.$inferSelect; region: typeof shippingRegions.$inferSelect } | null> {
  if (!shippingSectorId) return null;
  const [sector] = await executor.select().from(shippingSectors).where(eq(shippingSectors.id, shippingSectorId)).limit(1);
  if (!sector) return null;
  const [region] = await executor.select().from(shippingRegions).where(eq(shippingRegions.id, sector.regionId)).limit(1);
  if (!region) return null;
  return { sector, region };
}

/**
 * Valida a atribuição de um setor de frete a UM ENDEREÇO (sem contexto de
 * loja ainda) — usada na criação/edição do endereço operacional do seller.
 * shippingSectorId null é sempre válido (opt-in — países sem geografia por
 * setor, ex.: BR, continuam funcionando). Nunca confia em regionId vindo do
 * chamador (não existe esse campo em addresses, de propósito).
 */
export async function validateAddressSectorAssignment(
  executor: any,
  input: { countryCode: string; shippingSectorId?: string | null }
): Promise<{ error: string } | { ok: true }> {
  if (!input.shippingSectorId) return { ok: true };

  const derived = await deriveShippingRegionFromSector(executor, input.shippingSectorId);
  if (!derived) {
    return { error: `SHIPPING_SECTOR_NOT_FOUND: setor "${input.shippingSectorId}" não encontrado.` };
  }
  const { sector, region } = derived;

  if (sector.isActive === false) {
    return { error: `SHIPPING_SECTOR_INACTIVE: o setor "${sector.name}" está inativo e não pode ser usado como origem operacional.` };
  }
  const addressCountry = String(input.countryCode || '').trim().toUpperCase();
  if (sector.countryCode !== addressCountry) {
    return { error: `SHIPPING_SECTOR_COUNTRY_MISMATCH: o setor "${sector.name}" pertence a "${sector.countryCode}", mas o endereço é de "${addressCountry}".` };
  }
  // Defesa em profundidade: mesmo com FK garantindo sector->region, confirma
  // explicitamente que a região herdada é do mesmo país (nunca confia em
  // nada vindo do chamador para decidir isso).
  if (region.countryCode !== sector.countryCode) {
    return { error: `SHIPPING_REGION_COUNTRY_MISMATCH: a região "${region.name}" pertence a "${region.countryCode}", mas o setor "${sector.name}" pertence a "${sector.countryCode}".` };
  }

  return { ok: true };
}

/**
 * Valida a associação COMPLETA loja -> endereço operacional
 * (stores.operationalAddressId), exatamente os 6 itens pedidos:
 *   1. address existe
 *   2. store existe
 *   3. store pertence ao seller autenticado
 *   4. address.userId === seller.userId (nunca aponta para endereço de outro usuário)
 *   5. address.countryCode === store.countryCode
 *   6. se address.shippingSectorId != null: setor existe, ativo, mesmo país do
 *      endereço, região do setor no mesmo país
 * Nunca confia em regionId vindo do frontend (nem existe esse campo aqui).
 */
export async function validateOperationalAddressGeography(
  executor: any,
  input: { addressId: string; storeId: string; sellerUserId: string }
): Promise<{ error: string } | { ok: true; address: typeof addresses.$inferSelect; store: typeof stores.$inferSelect }> {
  const [address] = await executor.select().from(addresses).where(eq(addresses.id, input.addressId)).limit(1);
  if (!address) return { error: `ADDRESS_NOT_FOUND: endereço "${input.addressId}" não encontrado.` };

  const [store] = await executor.select().from(stores).where(eq(stores.id, input.storeId)).limit(1);
  if (!store) return { error: `STORE_NOT_FOUND: loja "${input.storeId}" não encontrada.` };

  const [seller] = await executor.select().from(sellers).where(eq(sellers.id, store.sellerId)).limit(1);
  if (!seller || seller.userId !== input.sellerUserId) {
    return { error: 'STORE_NOT_OWNED: esta loja não pertence ao vendedor autenticado.' };
  }

  if (address.userId !== input.sellerUserId) {
    return { error: 'ADDRESS_NOT_OWNED: este endereço não pertence ao vendedor autenticado — não é possível associá-lo a uma loja de outro usuário.' };
  }

  if (String(address.countryCode || '').toUpperCase() !== String(store.countryCode || '').toUpperCase()) {
    return { error: `ADDRESS_STORE_COUNTRY_MISMATCH: o endereço é de "${address.countryCode}", mas a loja é de "${store.countryCode}".` };
  }

  if (address.shippingSectorId) {
    const sectorValidation = await validateAddressSectorAssignment(executor, {
      countryCode: address.countryCode,
      shippingSectorId: address.shippingSectorId,
    });
    if (!('ok' in sectorValidation)) return sectorValidation;
  }

  return { ok: true, address, store };
}
