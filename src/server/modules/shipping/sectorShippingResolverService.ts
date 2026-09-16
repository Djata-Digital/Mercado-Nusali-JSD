/**
 * FASE D16-F3 — resolver de rota/tarifa do sistema de frete POR SETOR
 * (shipping_regions/shipping_sectors/shipping_routes/shipping_services/
 * shipping_route_rates — fundação D15-A, geografia seedada por
 * seedGuineaBissauShippingGeography em shippingGeographyService.ts).
 *
 * Puramente de LEITURA — nunca escreve nada. Reaproveita integralmente as
 * mesmas tabelas e os mesmos helpers de validação de setor já usados pelo
 * endereço operacional do seller e pelo endereço de entrega do comprador
 * (deriveShippingRegionFromSector, D15-C/D16-F2) — nenhuma segunda regra de
 * "o que é um setor válido" é inventada aqui.
 *
 * NÃO integrado ao checkout/orderService nesta fase (D16-F3 é só a engine).
 * ShippingCalculatorService/orderService.ts continuam usando exclusivamente
 * o sistema país/zona antigo (shippingRates/shippingZones) — nada aqui é
 * lido por eles ainda.
 */
import { eq, and, inArray } from 'drizzle-orm';
import { getDb } from '../../../db/index.js';
import {
  shippingRoutes,
  shippingServices,
  shippingRouteRates,
} from '../../../db/schema.js';
import { deriveShippingRegionFromSector } from './shippingGeographyService.js';

export interface SectorShippingQuoteInput {
  countryCode: string;
  originSectorId: string;
  destinationSectorId: string;
  /** kg — mesma unidade já usada em todo o resto do projeto (weightKg). */
  weightKg: number;
  /** Se informado (id OU code), resolve SOMENTE aquele serviço. */
  serviceId?: string;
  serviceCode?: string;
  /**
   * Instante usado para checar validFrom/validUntil da tarifa — nunca
   * `new Date()` direto no corpo da função, para o resolver ser testável
   * deterministicamente. Default: agora.
   */
  at?: Date;
}

export interface SectorShippingWeightBand {
  minWeightKg: number;
  maxWeightKg: number;
}

export interface SectorShippingQuote {
  countryCode: string;
  originSectorId: string;
  originSectorName: string;
  destinationSectorId: string;
  destinationSectorName: string;
  routeId: string;
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  weightKg: number;
  weightBand: SectorShippingWeightBand;
  rateId: string;
  amount: number;
  currency: string;
}

export interface SectorShippingQuoteDiagnostic {
  serviceId: string;
  serviceCode: string;
  /** SHIPPING_RATE_NOT_AVAILABLE | WEIGHT_BAND_NOT_AVAILABLE */
  reason: string;
  message: string;
}

export type SectorShippingQuoteResult =
  | { ok: true; quotes: SectorShippingQuote[]; diagnostics: SectorShippingQuoteDiagnostic[] }
  | { ok: false; code: string; message: string };

function weightInBand(weightKg: number, minWeightKg: number, maxWeightKg: number): boolean {
  // MESMA semântica já documentada e usada em todo o resto do módulo D15-A
  // (weightRangesOverlap/validateWeightRange): [min, max) — mínimo
  // inclusivo, máximo exclusivo.
  return weightKg >= minWeightKg && weightKg < maxWeightKg;
}

/** null = sem limite (mesma semântica de periodsOverlap em shippingGeographyService.ts). */
function isRateValidAt(rate: { validFrom: Date | string | null; validUntil: Date | string | null }, at: Date): boolean {
  const start = rate.validFrom ? new Date(rate.validFrom).getTime() : -Infinity;
  const end = rate.validUntil ? new Date(rate.validUntil).getTime() : Infinity;
  const t = at.getTime();
  return t >= start && t < end;
}

/**
 * Valida um setor candidato (origem OU destino) para o país informado —
 * fail-closed: setor precisa existir, estar ativo, pertencer ao país
 * informado, E ter uma região válida/ativa do MESMO país (nunca confia em
 * region vindo do chamador — sempre derivada, mesmo princípio de
 * validateAddressSectorAssignment).
 */
async function validateRouteSector(
  executor: any,
  sectorId: string,
  countryCode: string
): Promise<{ ok: true; name: string } | { ok: false }> {
  if (!sectorId) return { ok: false };
  const derived = await deriveShippingRegionFromSector(executor, sectorId);
  if (!derived) return { ok: false };
  const { sector, region } = derived;
  if (sector.isActive === false) return { ok: false };
  if (region.isActive === false) return { ok: false };
  if (sector.countryCode !== countryCode) return { ok: false };
  if (region.countryCode !== sector.countryCode) return { ok: false };
  return { ok: true, name: sector.name };
}

/**
 * Resolve uma (ou todas as) cotação(ões) de frete setorial para
 * originSectorId -> destinationSectorId (rota DIRECIONAL — nunca inverte
 * silenciosamente), por peso e, opcionalmente, um serviço específico.
 *
 * Contrato de sucesso (ok:true): SEMPRE devolve `quotes` (0, 1 ou várias,
 * ordenadas por amount ASC, depois serviceCode ASC como tie-break estável —
 * nunca a ordem natural do banco) + `diagnostics` explicando por que algum
 * serviço candidato não gerou quote (peso fora da faixa, ou nenhuma tarifa
 * cadastrada). Falhas ESTRUTURAIS (setor inválido, rota inexistente/
 * inativa, cross-country, ou um serviço ESPECÍFICO solicitado que não
 * existe/está inativo) retornam ok:false com um `code` diagnosticável.
 */
export async function resolveSectorShippingQuote(
  input: SectorShippingQuoteInput,
  executor?: any
): Promise<SectorShippingQuoteResult> {
  const db = executor ?? getDb();
  if (!db) return { ok: false, code: 'SHIPPING_RESOLVER_DB_UNAVAILABLE', message: 'Banco de dados indisponível.' };

  const countryCode = String(input.countryCode || '').trim().toUpperCase();
  if (!countryCode) {
    return { ok: false, code: 'COUNTRY_REQUIRED', message: 'countryCode é obrigatório.' };
  }

  const weightKg = Number(input.weightKg);
  if (!input.weightKg || isNaN(weightKg) || weightKg <= 0) {
    return { ok: false, code: 'WEIGHT_INVALID', message: 'weightKg deve ser um número maior que zero.' };
  }

  const at = input.at ?? new Date();

  // A. origin sector existe, ativo, do país informado, região válida/ativa.
  const originValidation = await validateRouteSector(db, input.originSectorId, countryCode);
  if (!originValidation.ok) {
    return { ok: false, code: 'ORIGIN_SECTOR_INVALID', message: `Setor de origem "${input.originSectorId}" inválido, inativo, ou fora do país "${countryCode}".` };
  }

  // B. destination sector existe, ativo, do país informado, região válida/ativa.
  const destinationValidation = await validateRouteSector(db, input.destinationSectorId, countryCode);
  if (!destinationValidation.ok) {
    return { ok: false, code: 'DESTINATION_SECTOR_INVALID', message: `Setor de destino "${input.destinationSectorId}" inválido, inativo, ou fora do país "${countryCode}".` };
  }

  // C. defesa em profundidade — mesmo os dois setores já tendo sido
  // confirmados do MESMO countryCode informado (o que por construção já
  // impede cross-country), nunca confia implicitamente nisso sem checar
  // explicitamente a rota abaixo também pelo mesmo countryCode.

  // D. rota DIRECIONAL exata origem->destino (nunca invertida/deduzida).
  // shipping_routes_country_origin_dest_uq garante no máximo 1 linha.
  const [route] = await db
    .select()
    .from(shippingRoutes)
    .where(and(
      eq(shippingRoutes.countryCode, countryCode),
      eq(shippingRoutes.originSectorId, input.originSectorId),
      eq(shippingRoutes.destinationSectorId, input.destinationSectorId),
    ))
    .limit(1);

  if (!route || route.isActive === false) {
    return { ok: false, code: 'ROUTE_NOT_AVAILABLE', message: `Não existe rota ativa de "${originValidation.name}" para "${destinationValidation.name}" em ${countryCode}.` };
  }

  // E. candidatos de serviço: um específico (id OU code), ou todos os
  // ativos do país quando nenhum for pedido.
  let candidateServices: (typeof shippingServices.$inferSelect)[];
  if (input.serviceId || input.serviceCode) {
    const conditions = [eq(shippingServices.countryCode, countryCode)];
    if (input.serviceId) conditions.push(eq(shippingServices.id, input.serviceId));
    else if (input.serviceCode) conditions.push(eq(shippingServices.code, String(input.serviceCode).toUpperCase()));
    const [service] = await db.select().from(shippingServices).where(and(...conditions)).limit(1);
    if (!service || service.isActive === false) {
      return { ok: false, code: 'SERVICE_NOT_AVAILABLE', message: `Serviço "${input.serviceId || input.serviceCode}" não encontrado, inativo, ou de outro país.` };
    }
    candidateServices = [service];
  } else {
    candidateServices = await db
      .select()
      .from(shippingServices)
      .where(and(eq(shippingServices.countryCode, countryCode), eq(shippingServices.isActive, true)));
  }

  if (candidateServices.length === 0) {
    return { ok: false, code: 'SERVICE_NOT_AVAILABLE', message: `Nenhum serviço de frete ativo cadastrado para ${countryCode}.` };
  }

  // F. UMA query só para todas as tarifas ativas da rota (evita N+1 por
  // serviço) — filtragem de peso/vigência/serviço feita em memória abaixo.
  const serviceIds = candidateServices.map((s) => s.id);
  const rateRows = await db
    .select()
    .from(shippingRouteRates)
    .where(and(
      eq(shippingRouteRates.routeId, route.id),
      inArray(shippingRouteRates.serviceId, serviceIds),
      eq(shippingRouteRates.isActive, true),
    ));

  const ratesByService = new Map<string, (typeof shippingRouteRates.$inferSelect)[]>();
  for (const r of rateRows) {
    if (!ratesByService.has(r.serviceId)) ratesByService.set(r.serviceId, []);
    ratesByService.get(r.serviceId)!.push(r);
  }

  const quotes: SectorShippingQuote[] = [];
  const diagnostics: SectorShippingQuoteDiagnostic[] = [];

  for (const service of candidateServices) {
    const allRatesForService = ratesByService.get(service.id) || [];
    if (allRatesForService.length === 0) {
      diagnostics.push({
        serviceId: service.id,
        serviceCode: service.code,
        reason: 'SHIPPING_RATE_NOT_AVAILABLE',
        message: `Nenhuma tarifa ativa cadastrada para o serviço "${service.code}" nesta rota.`,
      });
      continue;
    }

    // G. só tarifas cujo peso realmente cai na faixa [min, max) E que estão
    // vigentes no instante `at` (validFrom/validUntil).
    const matchingRates = allRatesForService.filter((r) =>
      weightInBand(weightKg, Number(r.minWeightKg), Number(r.maxWeightKg)) && isRateValidAt(r, at)
    );

    if (matchingRates.length === 0) {
      diagnostics.push({
        serviceId: service.id,
        serviceCode: service.code,
        reason: 'WEIGHT_BAND_NOT_AVAILABLE',
        message: `Nenhuma faixa de peso vigente cobre ${weightKg}kg para o serviço "${service.code}" nesta rota.`,
      });
      continue;
    }

    // H. dados inconsistentes (faixas sobrepostas para o mesmo peso, nunca
    // deveriam existir — validateShippingRouteRateInput já bloqueia isso na
    // escrita) — resolve deterministicamente (menor amount, depois id como
    // tie-break estável) em vez de falhar fechado por completo o serviço
    // inteiro; nunca escondido — reportado no próprio diagnostics.
    let chosen = matchingRates[0];
    if (matchingRates.length > 1) {
      const sorted = [...matchingRates].sort((a, b) => {
        const amountDiff = Number(a.amount) - Number(b.amount);
        if (amountDiff !== 0) return amountDiff;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
      chosen = sorted[0];
      diagnostics.push({
        serviceId: service.id,
        serviceCode: service.code,
        reason: 'WEIGHT_BAND_CONFLICT',
        message: `${matchingRates.length} tarifas ativas e vigentes cobrem ${weightKg}kg para "${service.code}" nesta rota (faixas sobrepostas) — resolvido deterministicamente pela de menor valor (rate ${chosen.id}).`,
      });
    }

    quotes.push({
      countryCode,
      originSectorId: input.originSectorId,
      originSectorName: originValidation.name,
      destinationSectorId: input.destinationSectorId,
      destinationSectorName: destinationValidation.name,
      routeId: route.id,
      serviceId: service.id,
      serviceCode: service.code,
      serviceName: service.name,
      weightKg,
      weightBand: { minWeightKg: Number(chosen.minWeightKg), maxWeightKg: Number(chosen.maxWeightKg) },
      rateId: chosen.id,
      amount: Number(chosen.amount),
      currency: chosen.currency,
    });
  }

  // I. ordenação determinística — nunca a ordem natural do banco/Map.
  quotes.sort((a, b) => {
    const amountDiff = a.amount - b.amount;
    if (amountDiff !== 0) return amountDiff;
    return a.serviceCode < b.serviceCode ? -1 : a.serviceCode > b.serviceCode ? 1 : 0;
  });

  return { ok: true, quotes, diagnostics };
}
