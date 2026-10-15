/**
 * Planejamento das EXPEDIÇÕES de um carrinho para UM serviço de entrega escolhido (Economy/Standard/Express...).
 *
 * Recebe, por linha do carrinho, a melhor origem já escolhida pelo F4 PARA O SERVIÇO PEDIDO (candidate com a cotação F3 da linha) e
 * devolve as expedições com o valor de cada uma e a repartição por linha. É o ÚNICO ponto que decide o frete de uma expedição, usado
 * IGUALMENTE pelo preview (cotação mostrada ao cliente) e pela criação do pedido (valor cobrado) — assim o que se mostra é o que se cobra.
 *
 * Só reaproveita o motor existente (F3/F4); não cria tabela, regra de preço nem tarifa.
 */
import type { FulfillmentCandidate } from './fulfillmentCandidateResolverService.js';

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

export async function planShipments(_db: any, input: PlanShipmentsInput): Promise<ShipmentPlanResult> {
  if (input.items.length === 0) return { ok: false, code: 'CART_ITEMS_REQUIRED', message: 'O carrinho está vazio.' };
  return { ok: true, plan: planPerItem(input.items) };
}

/** Soma do frete (custo real) por grupo de pedido. */
export function rawCostByGroup(plan: ShipmentPlan): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of plan.shipments) out.set(s.groupKey, round2((out.get(s.groupKey) ?? 0) + s.amount));
  return out;
}
