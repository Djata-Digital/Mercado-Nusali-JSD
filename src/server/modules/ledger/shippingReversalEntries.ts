/**
 * LEDGER SOMBRA — E4: construção PURA (sem I/O) da reversão do custo de frete de um pedido reembolsado DEPOIS da liberação do Escrow.
 *
 * Contexto contábil (valores sempre dos snapshots do pedido, nunca recalculados):
 *  - Na entrega (ORDER_DELIVERY_CONFIRMED) a Nusali reconheceu o subsídio como custo (D SHIPPING_SUBSIDY_NUSALI Ms) e o frete total a pagar (C SHIPPING_PAYABLE K = Sb+Ss+Ms).
 *  - No reembolso pós-liberação (E3) a Nusali absorveu o que o comprador pagou de frete (D REFUND_ABSORBED_SHIPPING Sb+Ss).
 *  => por padrão TODO o custo de frete (K) permanece custo da Nusali. NÃO se presume que um reembolso recupera o frete.
 *  - Só quando existe um registro EXPLÍCITO e com evidência de que parte do custo foi efetivamente devolvida (x ≤ K) o ledger reverte essa parcela:
 *        D SHIPPING_PAYABLE x         C SHIPPING_SUBSIDY_NUSALI s      C REFUND_ABSORBED_SHIPPING a      (s + a = x)
 *    A divisão s/a é a ALOCAÇÃO CUMULATIVA exata: subsídio revertido = round(Σx × Ms / K) − (já revertido), arredondado a centavos; Σ de todas as reversões = K
 *    reverte exatamente Ms de subsídio e Sb+Ss de frete absorvido, sem sobra nem falta de centavos.
 *  - Reembolso ANTES da liberação: a entrega nunca foi contabilizada, logo não há subsídio nem frete a reverter (nada a fazer; a reversão é recusada).
 */
import { fromMicros, netBalanceByCurrency, toMicros } from './decimal.js';
import type { DraftEntry } from './deliveryConfirmedEntries.js';
import type { LedgerSkipReason } from './types.js';

const CENT = 10000n; // 1 centavo em micros (6 casas)
const roundCents = (micros: bigint) => ((micros + CENT / 2n) / CENT) * CENT;

export interface OrderForShippingReversal {
  id: string; buyerId: string; sellerId: string | null; storeId: string | null; countryCode: string | null; currency: string;
  shippingChargedToBuyer: string | null; shippingSellerSubsidy: string | null; shippingMarketplaceSubsidy: string | null;
}

/** Custo total de frete do pedido (K = Sb + Ss + Ms) e a parcela de subsídio da Nusali (Ms), em micros, a partir do snapshot. */
export function shippingCostCapacity(order: Pick<OrderForShippingReversal, 'shippingChargedToBuyer' | 'shippingSellerSubsidy' | 'shippingMarketplaceSubsidy'>): { cost: bigint; subsidy: bigint } {
  const sb = order.shippingChargedToBuyer ? toMicros(order.shippingChargedToBuyer) : 0n;
  const ss = order.shippingSellerSubsidy ? toMicros(order.shippingSellerSubsidy) : 0n;
  const ms = order.shippingMarketplaceSubsidy ? toMicros(order.shippingMarketplaceSubsidy) : 0n;
  return { cost: sb + ss + ms, subsidy: ms };
}

/** Divide `amount` entre reversão do subsídio da Nusali e do frete absorvido, por alocação cumulativa (ver cabeçalho). Tudo em micros. */
export function allocateReversalParts(input: { cost: bigint; subsidy: bigint; alreadyReversed: bigint; amount: bigint }): { subsidyPart: bigint; absorbedPart: bigint } {
  const { cost, subsidy, alreadyReversed, amount } = input;
  if (cost <= 0n) throw new Error('SHIPPING_REVERSAL_NO_COST: pedido sem custo de frete.');
  if (amount <= 0n) throw new Error('SHIPPING_REVERSAL_INVALID_AMOUNT');
  if (alreadyReversed < 0n || alreadyReversed + amount > cost) throw new Error('SHIPPING_REVERSAL_EXCEEDS_COST');
  const cum = (c: bigint) => roundCents((c * subsidy) / cost);
  const subsidyPart = cum(alreadyReversed + amount) - cum(alreadyReversed);
  return { subsidyPart, absorbedPart: amount - subsidyPart };
}

export interface ReversalForEntries { id: string; amount: string; currency: string; subsidyPart: string; absorbedPart: string }
export type ReversalBuildResult = { status: 'OK'; entries: DraftEntry[] } | { status: 'SKIPPED'; reason: LedgerSkipReason; detail?: string };

export function buildShippingCostReversalEntries(order: OrderForShippingReversal, reversal: ReversalForEntries): ReversalBuildResult {
  const skip = (detail: string): ReversalBuildResult => ({ status: 'SKIPPED', reason: 'INVALID_SNAPSHOT', detail });
  if (reversal.currency !== order.currency) return skip(`moeda da reversão (${reversal.currency}) difere da do pedido (${order.currency}).`);
  const amount = toMicros(reversal.amount); const sPart = toMicros(reversal.subsidyPart); const aPart = toMicros(reversal.absorbedPart);
  if (amount <= 0n || sPart < 0n || aPart < 0n || sPart + aPart !== amount) return skip('partes da reversão não somam o valor (ou valor inválido).');
  const cap = shippingCostCapacity(order);
  if (cap.cost <= 0n) return skip('pedido sem custo de frete no snapshot.');
  if (amount > cap.cost) return skip(`reversão (${reversal.amount}) maior que o custo de frete do pedido (${fromMicros(cap.cost)}).`);
  if (sPart > cap.subsidy) return skip(`parcela de subsídio (${reversal.subsidyPart}) maior que o subsídio do pedido (${fromMicros(cap.subsidy)}).`);

  const common = { orderId: order.id, buyerId: order.buyerId, sellerId: order.sellerId ?? null, storeId: order.storeId ?? null, countryCode: order.countryCode ?? null, referenceType: 'shipping_cost_reversal' as const, referenceId: reversal.id };
  const entries: DraftEntry[] = [
    { accountCode: 'SHIPPING_PAYABLE', ownerType: 'PLATFORM', ownerId: null, direction: 'DEBIT', amount: reversal.amount, currency: order.currency, dimensions: { component: 'SHIPPING', reversal: true }, ...common },
  ];
  if (sPart > 0n) entries.push({ accountCode: 'SHIPPING_SUBSIDY_NUSALI', ownerType: 'PLATFORM', ownerId: null, direction: 'CREDIT', amount: fromMicros(sPart), currency: order.currency, dimensions: { component: 'SHIPPING', subsidySource: 'NUSALI', reversal: true }, ...common });
  if (aPart > 0n) entries.push({ accountCode: 'REFUND_ABSORBED_SHIPPING', ownerType: 'PLATFORM', ownerId: null, direction: 'CREDIT', amount: fromMicros(aPart), currency: order.currency, dimensions: { component: 'SHIPPING', part: 'ABSORBED', reversal: true }, ...common });
  const net = netBalanceByCurrency(entries);
  if (net.size !== 1 || net.get(order.currency) !== 0n) return skip('reversão não fecha.');
  return { status: 'OK', entries };
}
