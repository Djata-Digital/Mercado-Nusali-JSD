/**
 * FASE D16-F4 — engine de candidatas de fulfillment + melhor origem, por
 * CUSTO DE FRETE REAL (nunca por tipo de localização).
 *
 * READ-ONLY — nunca escreve em inventory/stock_reservations/orders/
 * inventory_transfers/shipments/payments/escrow. Nenhuma reserva, nenhum
 * lock financeiro (não há nada para proteger: zero escrita). A proteção
 * concorrente de reserva fica para quando seleção+reserva forem conectadas
 * na MESMA transação (fase futura F5/F6).
 *
 * CRÍTICO (repetido do enunciado): este engine NUNCA prioriza
 * NUSALI_HUB sobre SELLER_LOCATION nem o inverso. STORE e HUB são
 * candidatas equivalentes — a única coisa que decide é custo de frete real
 * (routeId -> serviceId -> weightBand -> rate.amount), com tie-break
 * determinístico que também NUNCA usa locationType como critério (ver
 * `compareCandidates` abaixo — decisão de design explícita: mesmo a
 * ORDEM ALFABÉTICA de locationType favoreceria "NUSALI_HUB" sobre
 * "SELLER_LOCATION" por acidente, então locationType nunca entra na cadeia
 * de tie-break, mesmo como critério "neutro").
 *
 * Reaproveita integralmente (nunca duplica SQL/regra):
 *   - `inventory` como ÚNICA autoridade de estoque (nunca product_variants.stock).
 *   - `resolveSectorShippingQuote` (D16-F3) para rota/serviço/tarifa —
 *     nenhuma query a shipping_route_rates é feita aqui diretamente.
 *   - `deriveShippingRegionFromSector`/geografia de setor (D15-A/D16-F2/F3).
 *   - Mesma fórmula de `pendingTransferQuantity` já usada por
 *     GET /seller/inventory (D16-E6.1/E6.2): soma PENDING exato por
 *     fromInventoryId, nunca IN_TRANSIT (D16-E6.1 já decrementou
 *     quantityOnHand na retirada física — somar de novo seria dupla
 *     subtração).
 *
 * NÃO integrado a checkout/orderService/inventoryService nesta fase — a
 * seleção HUB>SELLER_LOCATION antiga do checkout continua intocada fora
 * deste arquivo.
 */
import { eq, and, inArray, isNull } from 'drizzle-orm';
import { getDb } from '../../../db/index.js';
import {
  inventory, inventoryTransfers, fulfillmentLocations, stores, warehouses,
  products, productVariants, countries,
} from '../../../db/schema.js';
import { resolveSectorShippingQuote, type SectorShippingQuote, type SectorShippingQuoteResult } from './sectorShippingResolverService.js';
import { deriveShippingRegionFromSector } from './shippingGeographyService.js';

export interface FulfillmentCandidateInput {
  sellerId: string;
  productId: string;
  variantId?: string | null;
  quantity: number;
  destinationShippingSectorId: string;
  countryCode: string;
  serviceId?: string;
  serviceCode?: string;
}

export interface FulfillmentCandidate {
  inventoryId: string;
  sellerId: string;
  productId: string;
  variantId: string | null;

  locationType: 'SELLER_LOCATION' | 'NUSALI_HUB';
  fulfillmentLocationId: string;
  storeId: string | null;
  warehouseId: string | null;

  originShippingSectorId: string;
  destinationShippingSectorId: string;

  quantityOnHand: number;
  quantityReserved: number;
  pendingTransferQuantity: number;
  availableQuantity: number;
  requestedQuantity: number;

  unitWeightKg: number;
  totalWeightKg: number;

  routeId: string;
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  weightBand: { minWeightKg: number; maxWeightKg: number };
  rateId: string;
  shippingAmount: number;
  currency: string;

  /** Todas as quotes válidas para esta candidate (não só a escolhida) — preservado para futura UI. */
  quotes: SectorShippingQuote[];
}

export interface RejectedFulfillmentCandidate {
  inventoryId: string;
  locationType?: string | null;
  fulfillmentLocationId?: string | null;
  reason: string;
  message: string;
}

export type FulfillmentResolutionResult =
  | { ok: true; candidates: FulfillmentCandidate[]; rejectedCandidates: RejectedFulfillmentCandidate[]; bestCandidate: FulfillmentCandidate | null }
  | { ok: false; code: string; message: string };

/**
 * Tie-break determinístico e estável entre candidates de MESMO
 * shippingAmount — NUNCA usa locationType (ver comentário do topo do
 * arquivo — mesmo em ordem alfabética isso favoreceria HUB por acidente).
 * Ordem: shippingAmount ASC -> serviceCode ASC -> fulfillmentLocationId ASC
 * -> inventoryId ASC (as duas últimas são só para estabilidade total —
 * nunca esperamos precisar chegar até elas na prática).
 */
function compareCandidates(a: FulfillmentCandidate, b: FulfillmentCandidate): number {
  if (a.shippingAmount !== b.shippingAmount) return a.shippingAmount - b.shippingAmount;
  if (a.serviceCode !== b.serviceCode) return a.serviceCode < b.serviceCode ? -1 : 1;
  if (a.fulfillmentLocationId !== b.fulfillmentLocationId) return a.fulfillmentLocationId < b.fulfillmentLocationId ? -1 : 1;
  return a.inventoryId < b.inventoryId ? -1 : a.inventoryId > b.inventoryId ? 1 : 0;
}

/**
 * Resolve TODAS as candidatas de fulfillment (STORE e HUB, sempre
 * equivalentes) para uma seller/product/variant/quantity + destino, com
 * quote de frete real por candidata, e a melhor candidata elegível — SEM
 * combinar/dividir estoque entre candidatas (sem split nesta fase: uma
 * candidata só é elegível se ela sozinha atender `quantity` inteira).
 */
export async function resolveFulfillmentCandidates(
  input: FulfillmentCandidateInput,
  executor?: any
): Promise<FulfillmentResolutionResult> {
  const db = executor ?? getDb();
  if (!db) return { ok: false, code: 'FULFILLMENT_RESOLVER_DB_UNAVAILABLE', message: 'Banco de dados indisponível.' };

  const countryCode = String(input.countryCode || '').trim().toUpperCase();
  if (!countryCode) return { ok: false, code: 'COUNTRY_REQUIRED', message: 'countryCode é obrigatório.' };
  if (!input.sellerId) return { ok: false, code: 'SELLER_REQUIRED', message: 'sellerId é obrigatório.' };
  if (!input.productId) return { ok: false, code: 'PRODUCT_REQUIRED', message: 'productId é obrigatório.' };

  const requestedQuantity = Math.floor(Number(input.quantity));
  if (!input.quantity || isNaN(requestedQuantity) || requestedQuantity <= 0) {
    return { ok: false, code: 'QUANTITY_INVALID', message: 'quantity deve ser um número inteiro maior que zero.' };
  }

  // A. destino é OBRIGATÓRIO e validado UMA vez (compartilhado por todas as
  // candidatas) — nunca city/state textual, setor é a unidade autoritativa.
  if (!input.destinationShippingSectorId) {
    return { ok: false, code: 'DESTINATION_SECTOR_MISSING', message: 'destinationShippingSectorId é obrigatório.' };
  }
  const destinationDerived = await deriveShippingRegionFromSector(db, input.destinationShippingSectorId);
  if (!destinationDerived) {
    return { ok: false, code: 'DESTINATION_SECTOR_INVALID', message: `Setor de destino "${input.destinationShippingSectorId}" não encontrado.` };
  }
  if (destinationDerived.sector.isActive === false || destinationDerived.region.isActive === false) {
    return { ok: false, code: 'DESTINATION_SECTOR_INVALID', message: `Setor de destino "${destinationDerived.sector.name}" (ou sua região) está inativo.` };
  }
  if (destinationDerived.sector.countryCode !== countryCode) {
    return { ok: false, code: 'COUNTRY_MISMATCH', message: `Setor de destino "${destinationDerived.sector.name}" pertence a "${destinationDerived.sector.countryCode}", não a "${countryCode}".` };
  }

  // Moeda esperada do mercado — mesma autoridade já usada no caminho de
  // escrita de tarifas (validateShippingRouteRateInput): countries.currency.
  const [countryRow] = await db.select().from(countries).where(eq(countries.code, countryCode)).limit(1);
  if (!countryRow) {
    return { ok: false, code: 'COUNTRY_MISMATCH', message: `País "${countryCode}" não encontrado.` };
  }
  const expectedCurrency = String(countryRow.currency).toUpperCase();

  // B. inventory — ÚNICA autoridade de estoque. Filtro EXATO: sellerId,
  // productId, variantId (ou IS NULL) — produto/variante/seller errados
  // NUNCA aparecem aqui (nem como candidate, nem como rejected — "nunca
  // candidate" é estrutural, não uma rejeição).
  const variantCondition = input.variantId ? eq(inventory.variantId, input.variantId) : isNull(inventory.variantId);
  const inventoryRows = await db
    .select()
    .from(inventory)
    .where(and(
      eq(inventory.sellerId, input.sellerId),
      eq(inventory.productId, input.productId),
      variantCondition,
    ));

  const candidates: FulfillmentCandidate[] = [];
  const rejectedCandidates: RejectedFulfillmentCandidate[] = [];

  if (inventoryRows.length === 0) {
    return { ok: true, candidates: [], rejectedCandidates: [], bestCandidate: null };
  }

  // C. peso unitário — MESMA prioridade já auditada em D16-F1
  // (orderService.ts): variant.weight, senão product.shippingJson.weightKg.
  // products.weight NÃO existe no schema (achado D16-F1 — nunca lido aqui).
  const [product] = await db.select().from(products).where(eq(products.id, input.productId)).limit(1);
  let unitWeightKg: number | null = null;
  if (product?.shippingJson && typeof product.shippingJson === 'object' && (product.shippingJson as any).weightKg) {
    const w = Number((product.shippingJson as any).weightKg);
    if (!isNaN(w) && w > 0) unitWeightKg = w;
  }
  if (input.variantId) {
    const [variant] = await db.select().from(productVariants).where(eq(productVariants.id, input.variantId)).limit(1);
    if (variant?.weight) {
      const w = Number(variant.weight);
      if (!isNaN(w) && w > 0) unitWeightKg = w;
    }
  }

  // D. pendingTransferQuantity — soma PENDING exata por fromInventoryId
  // (D16-E6.1/E6.2), nunca IN_TRANSIT (já decrementado de quantityOnHand).
  const inventoryIds = inventoryRows.map((r: any) => r.id);
  const pendingRows = await db
    .select({ fromInventoryId: inventoryTransfers.fromInventoryId, qty: inventoryTransfers.quantity })
    .from(inventoryTransfers)
    .where(and(inArray(inventoryTransfers.fromInventoryId, inventoryIds), eq(inventoryTransfers.status, 'PENDING')));
  const pendingMap = new Map<string, number>();
  for (const p of pendingRows as any[]) {
    pendingMap.set(p.fromInventoryId, (pendingMap.get(p.fromInventoryId) || 0) + (Number(p.qty) || 0));
  }

  // E. fulfillment_locations/stores/warehouses das candidatas, batched
  // (evita N+1) — nunca lido de outro seller (a query de inventory já
  // isolou sellerId; aqui só resolvemos a localização física de CADA linha
  // já pertencente a este seller).
  const flocIds = Array.from(new Set(inventoryRows.map((r: any) => r.fulfillmentLocationId).filter(Boolean))) as string[];
  const flocRows = flocIds.length > 0 ? await db.select().from(fulfillmentLocations).where(inArray(fulfillmentLocations.id, flocIds)) : [];
  const flocMap = new Map((flocRows as any[]).map((f) => [f.id, f]));

  const storeIds = Array.from(new Set((flocRows as any[]).map((f) => f.storeId).filter(Boolean))) as string[];
  const storeRows = storeIds.length > 0 ? await db.select().from(stores).where(inArray(stores.id, storeIds)) : [];
  const storeMap = new Map((storeRows as any[]).map((s) => [s.id, s]));

  const warehouseIds = Array.from(new Set((flocRows as any[]).map((f) => f.warehouseId).filter(Boolean))) as string[];
  const warehouseRows = warehouseIds.length > 0 ? await db.select().from(warehouses).where(inArray(warehouses.id, warehouseIds)) : [];
  const warehouseMap = new Map((warehouseRows as any[]).map((w) => [w.id, w]));

  for (const inv of inventoryRows as any[]) {
    const reject = (reason: string, message: string) => {
      rejectedCandidates.push({
        inventoryId: inv.id,
        locationType: inv.locationType,
        fulfillmentLocationId: inv.fulfillmentLocationId || null,
        reason,
        message,
      });
    };

    // F. fulfillment location obrigatória.
    if (!inv.fulfillmentLocationId) {
      reject('FULFILLMENT_LOCATION_MISSING', 'Esta inventory não tem uma origem física (fulfillmentLocationId) configurada.');
      continue;
    }
    const floc = flocMap.get(inv.fulfillmentLocationId);
    if (!floc) {
      reject('FULFILLMENT_LOCATION_MISSING', 'A fulfillment location referenciada não foi encontrada.');
      continue;
    }
    if (floc.isActive === false) {
      reject('FULFILLMENT_LOCATION_INACTIVE', `A fulfillment location "${floc.name}" está inativa.`);
      continue;
    }

    // G. ownership/tipo — específico por locationType (STORE vs HUB são
    // candidatas EQUIVALENTES daqui em diante; a única diferença é qual
    // entidade real (store/warehouse) valida operacionalidade).
    let store: any = null;
    let warehouse: any = null;
    if (inv.locationType === 'SELLER_LOCATION') {
      if (floc.locationType !== 'STORE' || !floc.storeId) {
        reject('LOCATION_OWNERSHIP_MISMATCH', 'Esta inventory SELLER_LOCATION não aponta para uma fulfillment location do tipo STORE.');
        continue;
      }
      if (floc.sellerId !== input.sellerId) {
        reject('LOCATION_OWNERSHIP_MISMATCH', 'A fulfillment location desta loja não pertence ao seller informado.');
        continue;
      }
      store = storeMap.get(floc.storeId);
      if (!store) {
        reject('LOCATION_OWNERSHIP_MISMATCH', 'A loja desta fulfillment location não foi encontrada.');
        continue;
      }
      if (store.sellerId !== input.sellerId) {
        reject('LOCATION_OWNERSHIP_MISMATCH', 'Esta loja não pertence ao seller informado.');
        continue;
      }
      if (store.status !== 'active') {
        reject('STORE_INACTIVE', `A loja "${store.name}" não está ativa (status: ${store.status}).`);
        continue;
      }
    } else if (inv.locationType === 'NUSALI_HUB') {
      if (floc.locationType !== 'NUSALI_WAREHOUSE' || !floc.warehouseId) {
        reject('LOCATION_OWNERSHIP_MISMATCH', 'Esta inventory NUSALI_HUB não aponta para uma fulfillment location do tipo NUSALI_WAREHOUSE.');
        continue;
      }
      warehouse = warehouseMap.get(floc.warehouseId);
      if (!warehouse) {
        reject('LOCATION_OWNERSHIP_MISMATCH', 'O armazém desta fulfillment location não foi encontrado.');
        continue;
      }
      if (warehouse.status !== 'active') {
        reject('WAREHOUSE_INACTIVE', `O armazém "${warehouse.name}" não está ativo/operacional (status: ${warehouse.status}).`);
        continue;
      }
      // inventory.sellerId já garante que este estoque HUB pertence ao
      // seller informado (filtro da query acima) — HUB nunca tem "dono"
      // próprio (compartilhado), então nenhuma checagem adicional aqui.
    } else {
      reject('LOCATION_OWNERSHIP_MISMATCH', `locationType "${inv.locationType}" desconhecido.`);
      continue;
    }

    // H. origem geográfica obrigatória.
    const originShippingSectorId = floc.shippingSectorId || null;
    if (!originShippingSectorId) {
      reject('ORIGIN_SECTOR_MISSING', 'Esta fulfillment location não tem um setor de origem (shippingSectorId) configurado.');
      continue;
    }

    // I. peso — candidate rejeitada se não houver peso válido (nunca
    // inventado silenciosamente).
    if (!unitWeightKg) {
      reject('WEIGHT_UNAVAILABLE', 'Nenhum peso válido (variant.weight ou product.shippingJson.weightKg) encontrado para calcular o frete.');
      continue;
    }
    const totalWeightKg = Math.round(unitWeightKg * requestedQuantity * 1000) / 1000;

    // J. disponibilidade — SEM split: só elegível se esta candidata SOZINHA
    // atender requestedQuantity inteira.
    const quantityOnHand = Number(inv.quantityOnHand) || 0;
    const quantityReserved = Number(inv.quantityReserved) || 0;
    const pendingTransferQuantity = pendingMap.get(inv.id) || 0;
    const availableQuantity = Math.max(0, quantityOnHand - quantityReserved - pendingTransferQuantity);
    if (availableQuantity < requestedQuantity) {
      reject('INSUFFICIENT_AVAILABLE_STOCK', `Disponível ${availableQuantity}, solicitado ${requestedQuantity} (sem combinar com outras origens nesta fase).`);
      continue;
    }

    // K. cota de frete real — reaproveita D16-F3 integralmente, nunca
    // duplica SQL de shipping_route_rates.
    const quoteResult: SectorShippingQuoteResult = await resolveSectorShippingQuote({
      countryCode,
      originSectorId: originShippingSectorId,
      destinationSectorId: input.destinationShippingSectorId,
      weightKg: totalWeightKg,
      serviceId: input.serviceId,
      serviceCode: input.serviceCode,
    }, db);

    if (quoteResult.ok === false) {
      const failureCode: string = quoteResult.code;
      const failureMessage: string = quoteResult.message;
      reject(failureCode, failureMessage);
      continue;
    }
    if (quoteResult.quotes.length === 0) {
      // F3 NÃO garante nenhuma ordem para `diagnostics` (só para `quotes`) —
      // escolher diagnostics[0] direto seria depender de ordem implícita do
      // banco (a MESMA classe de problema que D16-F3/F4 existem para
      // eliminar). Ordena aqui, deterministicamente: prioriza um
      // diagnóstico de FAIXA DE PESO (mais específico/acionável — "existe
      // tarifa mas não pra esse peso") sobre "nenhuma tarifa cadastrada",
      // depois por serviceCode ASC como tie-break estável.
      const reasonPriority: Record<string, number> = {
        WEIGHT_BAND_NOT_AVAILABLE: 0,
        WEIGHT_BAND_CONFLICT: 0,
        SHIPPING_RATE_NOT_AVAILABLE: 1,
      };
      const sortedDiagnostics = [...quoteResult.diagnostics].sort((a, b) => {
        const pa = reasonPriority[a.reason] ?? 2;
        const pb = reasonPriority[b.reason] ?? 2;
        if (pa !== pb) return pa - pb;
        return a.serviceCode < b.serviceCode ? -1 : a.serviceCode > b.serviceCode ? 1 : 0;
      });
      const primaryDiagnostic = sortedDiagnostics[0];
      reject(primaryDiagnostic?.reason || 'SHIPPING_RATE_NOT_AVAILABLE', primaryDiagnostic?.message || 'Nenhuma tarifa disponível para esta origem/destino/peso.');
      continue;
    }

    // L. melhor quote PARA ESTA candidata (já ordenada por F3: amount ASC,
    // serviceCode ASC) — nunca a ordem natural do banco.
    const chosen = quoteResult.quotes[0];

    // M. moeda — nunca comparar candidatas de moedas diferentes; exclui com
    // diagnóstico claro em vez de converter ou comparar silenciosamente.
    if (chosen.currency.toUpperCase() !== expectedCurrency) {
      reject('CURRENCY_MISMATCH', `Tarifa em "${chosen.currency}", mas o mercado "${countryCode}" opera em "${expectedCurrency}".`);
      continue;
    }

    candidates.push({
      inventoryId: inv.id,
      sellerId: inv.sellerId,
      productId: inv.productId,
      variantId: inv.variantId || null,
      locationType: inv.locationType,
      fulfillmentLocationId: floc.id,
      storeId: floc.storeId || null,
      warehouseId: floc.warehouseId || null,
      originShippingSectorId,
      destinationShippingSectorId: input.destinationShippingSectorId,
      quantityOnHand,
      quantityReserved,
      pendingTransferQuantity,
      availableQuantity,
      requestedQuantity,
      unitWeightKg,
      totalWeightKg,
      routeId: chosen.routeId,
      serviceId: chosen.serviceId,
      serviceCode: chosen.serviceCode,
      serviceName: chosen.serviceName,
      weightBand: chosen.weightBand,
      rateId: chosen.rateId,
      shippingAmount: chosen.amount,
      currency: chosen.currency,
      quotes: quoteResult.quotes,
    });
  }

  // N. ordenação determinística — NUNCA locationType, nunca a ordem natural
  // do banco/array (ver compareCandidates no topo do arquivo).
  candidates.sort(compareCandidates);
  const bestCandidate = candidates.length > 0 ? candidates[0] : null;

  return { ok: true, candidates, rejectedCandidates, bestCandidate };
}
