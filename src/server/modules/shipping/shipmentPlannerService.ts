/**
 * Planejamento das EXPEDIÇÕES de um carrinho para UM serviço de entrega escolhido (Economy/Standard/Express...).
 *
 * Recebe, por linha do carrinho, a melhor origem já escolhida pelo F4 PARA O SERVIÇO PEDIDO (candidate com a cotação F3 da linha) e
 * devolve as expedições com o valor de cada uma e a repartição por linha. É o ÚNICO ponto que decide o frete de uma expedição, usado
 * IGUALMENTE pelo preview (cotação mostrada ao cliente) e pela criação do pedido (valor cobrado) — assim o que se mostra é o que se cobra.
 *
 * CONSOLIDAÇÃO DE PESO: as linhas do MESMO grupo de pedido (vendedor + loja comercial) que saem do MESMO local de expedição para o MESMO
 * destino e serviço formam UMA expedição (um volume físico): o peso é somado e a tarifa é a da faixa do peso TOTAL (F3), e o valor da
 * expedição é repartido entre as linhas por peso (maior resto) — a soma por linha é exatamente o valor da expedição. Linhas de locais
 * diferentes (ou vendedores/lojas diferentes) nunca se juntam. Se o peso total não tem faixa de tarifa, o serviço fica indisponível para
 * o carrinho — o frete nunca é "partido" artificialmente em tarifas por linha para contornar a faixa.
 *
 * Só reaproveita o motor existente (F3/F4); não cria tabela, regra de preço nem tarifa. A escolha da origem de cada linha (F4) não é
 * reotimizada para consolidar: continua a de menor custo por linha.
 */
import type { FulfillmentCandidate } from './fulfillmentCandidateResolverService.js';
import { resolveSectorShippingQuote } from './sectorShippingResolverService.js';

export interface PlanInputItem {
  /** identifica a linha do carrinho dentro desta chamada */
  key: string;
  /** grupo do pedido (vendedor + loja comercial): expedições nunca se misturam entre grupos */
  groupKey: string;
  candidate: FulfillmentCandidate;
}

export interface PlannedShipment {
  key: string;
  groupKey: string;
  fulfillmentLocationId: string;
  originSectorId: string;
  routeId: string;
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  rateId: string;
  weightBand: { minWeightKg: number; maxWeightKg: number };
  totalWeightKg: number;
  amount: number;
  currency: string;
  itemKeys: string[];
}

export interface ShipmentPlan {
  shipments: PlannedShipment[];
  /** valor do frete atribuído a cada linha (a soma por expedição é exatamente o valor da expedição) */
  amountByItemKey: Map<string, number>;
  shipmentByItemKey: Map<string, PlannedShipment>;
}

export type ShipmentPlanResult =
  | { ok: true; plan: ShipmentPlan }
  | { ok: false; code: string; message: string; itemKeys?: string[] };

export interface PlanShipmentsInput {
  countryCode: string;
  destinationSectorId: string;
  /** serviço escolhido (código); null = sem escolha (compatibilidade interna: cada linha com o seu melhor serviço) */
  serviceCode: string | null;
  items: PlanInputItem[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Uma expedição por linha (cada linha cotada sozinha, como sempre foi). */
function planPerItem(items: PlanInputItem[]): ShipmentPlan {
  const shipments: PlannedShipment[] = [];
  const amountByItemKey = new Map<string, number>();
  const shipmentByItemKey = new Map<string, PlannedShipment>();
  for (const it of items) {
    const c = it.candidate;
    const shipment: PlannedShipment = {
      key: `ship:${it.key}`,
      groupKey: it.groupKey,
      fulfillmentLocationId: c.fulfillmentLocationId,
      originSectorId: c.originShippingSectorId,
      routeId: c.routeId,
      serviceId: c.serviceId,
      serviceCode: c.serviceCode,
      serviceName: c.serviceName,
      rateId: c.rateId,
      weightBand: c.weightBand,
      totalWeightKg: c.totalWeightKg,
      amount: round2(c.shippingAmount),
      currency: c.currency,
      itemKeys: [it.key],
    };
    shipments.push(shipment);
    amountByItemKey.set(it.key, shipment.amount);
    shipmentByItemKey.set(it.key, shipment);
  }
  return { shipments, amountByItemKey, shipmentByItemKey };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Reparte `totalAmount` pelas linhas proporcionalmente ao peso, em centésimos, pelo método do maior resto (soma exata, determinístico). */
export function allocateByWeight(totalAmount: number, weights: number[]): number[] {
  const totalCents = Math.round(totalAmount * 100);
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (!(sumW > 0)) {
    const even = Math.floor(totalCents / weights.length);
    const out = weights.map(() => even);
    for (let i = 0; i < totalCents - even * weights.length; i++) out[i] += 1;
    return out.map((c) => c / 100);
  }
  const raw = weights.map((w) => (totalCents * w) / sumW);
  const floors = raw.map((r) => Math.floor(r));
  let left = totalCents - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => (b.frac - a.frac) || (a.i - b.i));
  for (let k = 0; left > 0 && k < order.length; k++, left--) floors[order[k].i] += 1;
  return floors.map((c) => c / 100);
}

export async function planShipments(db: any, input: PlanShipmentsInput): Promise<ShipmentPlanResult> {
  if (input.items.length === 0) return { ok: false, code: 'CART_ITEMS_REQUIRED', message: 'O carrinho está vazio.' };

  const buckets = new Map<string, PlanInputItem[]>();
  for (const it of input.items) {
    const c = it.candidate;
    const k = [it.groupKey, c.fulfillmentLocationId, c.routeId, c.serviceId].join('|');
    const b = buckets.get(k);
    if (b) b.push(it); else buckets.set(k, [it]);
  }

  const shipments: PlannedShipment[] = [];
  const amountByItemKey = new Map<string, number>();
  const shipmentByItemKey = new Map<string, PlannedShipment>();
  let seq = 0;
  for (const bucket of buckets.values()) {
    if (bucket.length === 1) {
      const single = planPerItem(bucket);
      single.shipments.forEach((s) => shipments.push(s));
      single.amountByItemKey.forEach((v, k) => amountByItemKey.set(k, v));
      single.shipmentByItemKey.forEach((v, k) => shipmentByItemKey.set(k, v));
      continue;
    }
    const c = bucket[0].candidate;
    const totalWeightKg = round3(bucket.reduce((s, it) => s + it.candidate.totalWeightKg, 0));
    const q = await resolveSectorShippingQuote({
      countryCode: input.countryCode,
      originSectorId: c.originShippingSectorId,
      destinationSectorId: input.destinationSectorId,
      weightKg: totalWeightKg,
      serviceCode: c.serviceCode,
    }, db);
    const quote = q.ok ? q.quotes.find((x) => x.serviceId === c.serviceId) : undefined;
    if (!quote) {
      return {
        ok: false,
        code: 'SHIPPING_RATE_NOT_AVAILABLE',
        message: `Não há tarifa de frete para o peso total deste envio (${totalWeightKg} kg) no serviço escolhido.`,
        itemKeys: bucket.map((it) => it.key),
      };
    }
    if (String(quote.currency).toUpperCase() !== String(c.currency).toUpperCase()) {
      return { ok: false, code: 'SHIPPING_CURRENCY_MISMATCH', message: 'A moeda da tarifa de frete não corresponde à moeda do mercado.', itemKeys: bucket.map((it) => it.key) };
    }
    const shipment: PlannedShipment = {
      key: `ship:${++seq}:${bucket.map((it) => it.key).join('+')}`,
      groupKey: bucket[0].groupKey,
      fulfillmentLocationId: c.fulfillmentLocationId,
      originSectorId: c.originShippingSectorId,
      routeId: quote.routeId,
      serviceId: quote.serviceId,
      serviceCode: quote.serviceCode,
      serviceName: quote.serviceName,
      rateId: quote.rateId,
      weightBand: quote.weightBand,
      totalWeightKg,
      amount: round2(quote.amount),
      currency: quote.currency,
      itemKeys: bucket.map((it) => it.key),
    };
    const parts = allocateByWeight(shipment.amount, bucket.map((it) => it.candidate.totalWeightKg));
    bucket.forEach((it, i) => { amountByItemKey.set(it.key, parts[i]); shipmentByItemKey.set(it.key, shipment); });
    shipments.push(shipment);
  }
  return { ok: true, plan: { shipments, amountByItemKey, shipmentByItemKey } };
}

/** Soma do frete (custo real) por grupo de pedido. */
export function rawCostByGroup(plan: ShipmentPlan): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of plan.shipments) out.set(s.groupKey, round2((out.get(s.groupKey) ?? 0) + s.amount));
  return out;
}
