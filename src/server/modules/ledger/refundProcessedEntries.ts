/**
 * LEDGER SOMBRA — E3: construção PURA (sem I/O) dos lançamentos de REFUND_PROCESSED a partir de snapshots JÁ GRAVADOS (pedido + reembolso). Nada é recalculado
 * com regras vigentes: a parte do vendedor é o `sellerDebitAmount` que o reembolso real gravou; a comissão devolvida é proporcional ao snapshot do pedido.
 *
 *  ANTES da liberação do Escrow (a Nusali ainda retinha o dinheiro; o vendedor nunca recebeu)
 *      D BUYER_ESCROW a            C PAYMENT_CLEARING a
 *  DEPOIS da liberação (o vendedor já recebeu o líquido; o comprador recebe `a` de volta)
 *      D SELLER_PAYABLE S          (o que o vendedor devolve = refunds.sellerDebitAmount, o mesmo valor debitado da carteira real)
 *      D NUSALI_COMMISSION_REVENUE Cp   (comissão estornada, proporcional: marketplaceCommission × a / totalAmount, arredondada a centavos)
 *      D REFUND_ABSORBED_SHIPPING  Ab   (o resto = a − S − Cp: a parte do frete/encargos que a Nusali absorve)
 *      C PAYMENT_CLEARING a
 * Reembolso total: S = sellerNetAmount, Cp = marketplaceCommission, Ab = frete do cliente + frete do vendedor (a identidade T = C + N + Sb + Ss).
 * Taxas alfandegárias (customsDuty > 0) num reembolso pós-liberação NÃO têm política definida => SKIPPED/INVALID_SNAPSHOT (vai a intervenção, nada é lançado).
 */
import { fromMicros, netBalanceByCurrency, toMicros } from './decimal.js';
import type { DraftEntry } from './deliveryConfirmedEntries.js';
import type { LedgerSkipReason } from './types.js';

export type ReleaseStage = 'BEFORE_RELEASE' | 'AFTER_RELEASE';

export interface OrderForRefundEntries {
  id: string; buyerId: string; sellerId: string | null; storeId: string | null; countryCode: string | null; currency: string;
  totalAmount: string; marketplaceCommission: string | null; sellerNetAmount: string | null; customsDuty: string | null;
}
export interface RefundForEntries { id: string; amount: string; currency: string; sellerDebitAmount: string | null }

export type RefundBuildResult = { status: 'OK'; entries: DraftEntry[]; parts: { sellerDebit: string; commission: string; absorbed: string } } | { status: 'SKIPPED'; reason: LedgerSkipReason; detail?: string };

const CENT = 10000n; // 1 centavo em micros (6 casas)

export function buildRefundProcessedEntries(order: OrderForRefundEntries, refund: RefundForEntries, stage: ReleaseStage): RefundBuildResult {
  const skip = (reason: LedgerSkipReason, detail: string): RefundBuildResult => ({ status: 'SKIPPED', reason, detail });
  if (!order.currency || !order.totalAmount || !refund.amount) return skip('MISSING_SNAPSHOT', 'currency/totalAmount do pedido ou amount do reembolso ausente.');
  if (refund.currency !== order.currency) return skip('INVALID_SNAPSHOT', `moeda do reembolso (${refund.currency}) difere da do pedido (${order.currency}).`);
  const currency = order.currency;
  const total = toMicros(order.totalAmount);
  const amount = toMicros(refund.amount);
  if (amount <= 0n) return skip('INVALID_SNAPSHOT', `amount do reembolso inválido (${refund.amount}).`);
  if (amount > total) return skip('INVALID_SNAPSHOT', `reembolso (${refund.amount}) maior que o total do pedido (${order.totalAmount}).`);

  const common = { orderId: order.id, buyerId: order.buyerId, countryCode: order.countryCode ?? null, referenceType: 'refund' as const, referenceId: refund.id };
  const clearing: DraftEntry = {
    accountCode: 'PAYMENT_CLEARING', ownerType: 'PLATFORM', ownerId: null, direction: 'CREDIT', amount: refund.amount, currency,
    dimensions: { component: 'REFUND', releaseStage: stage }, ...common,
  };

  if (stage === 'BEFORE_RELEASE') {
    const entries: DraftEntry[] = [
      { accountCode: 'BUYER_ESCROW', ownerType: 'PLATFORM', ownerId: null, direction: 'DEBIT', amount: refund.amount, currency, dimensions: { component: 'REFUND', releaseStage: stage }, ...common },
      clearing,
    ];
    return { status: 'OK', entries, parts: { sellerDebit: '0', commission: '0', absorbed: '0' } };
  }

  // AFTER_RELEASE
  if (!order.sellerId) return skip('MISSING_SNAPSHOT', 'sellerId ausente num reembolso pós-liberação.');
  if (order.marketplaceCommission == null || order.sellerNetAmount == null) return skip('MISSING_SNAPSHOT', 'marketplaceCommission/sellerNetAmount ausente num reembolso pós-liberação.');
  if (refund.sellerDebitAmount == null || refund.sellerDebitAmount === '') return skip('MISSING_SNAPSHOT', 'sellerDebitAmount do reembolso ausente (reembolso pós-liberação sempre grava o débito do vendedor).');
  if (order.customsDuty && toMicros(order.customsDuty) > 0n) return skip('INVALID_SNAPSHOT', 'pedido com taxas alfandegárias: política de reembolso pós-liberação não definida.');

  const commissionTotal = toMicros(order.marketplaceCommission);
  const net = toMicros(order.sellerNetAmount);
  const sellerDebit = toMicros(refund.sellerDebitAmount);
  if (commissionTotal < 0n || net <= 0n || sellerDebit < 0n) return skip('INVALID_SNAPSHOT', `valores inválidos (comissão=${order.marketplaceCommission}, líquido=${order.sellerNetAmount}, débito=${refund.sellerDebitAmount}).`);
  if (sellerDebit > net) return skip('INVALID_SNAPSHOT', `débito do vendedor (${refund.sellerDebitAmount}) maior que o líquido do pedido (${order.sellerNetAmount}).`);

  // comissão proporcional ao reembolso, arredondada a centavos (meio para cima); reembolso total => exatamente a comissão do pedido
  const rawCommission = (commissionTotal * amount) / total;
  const commission = ((rawCommission + CENT / 2n) / CENT) * CENT;
  const absorbed = amount - sellerDebit - commission;
  if (commission > commissionTotal) return skip('INVALID_SNAPSHOT', 'comissão proporcional maior que a comissão do pedido.');
  if (absorbed < 0n) return skip('INVALID_SNAPSHOT', `partes do reembolso excedem o valor devolvido (vendedor ${refund.sellerDebitAmount} + comissão ${fromMicros(commission)} > ${refund.amount}).`);

  const entries: DraftEntry[] = [];
  if (sellerDebit > 0n) {
    entries.push({
      accountCode: 'SELLER_PAYABLE', ownerType: 'SELLER', ownerId: order.sellerId, direction: 'DEBIT', amount: fromMicros(sellerDebit), currency,
      dimensions: { component: 'REFUND', releaseStage: stage, part: 'SELLER' }, sellerId: order.sellerId, storeId: order.storeId ?? null, ...common,
    });
  }
  if (commission > 0n) {
    entries.push({
      accountCode: 'NUSALI_COMMISSION_REVENUE', ownerType: 'PLATFORM', ownerId: null, direction: 'DEBIT', amount: fromMicros(commission), currency,
      dimensions: { component: 'REFUND', releaseStage: stage, part: 'COMMISSION' }, sellerId: order.sellerId, storeId: order.storeId ?? null, ...common,
    });
  }
  if (absorbed > 0n) {
    entries.push({
      accountCode: 'REFUND_ABSORBED_SHIPPING', ownerType: 'PLATFORM', ownerId: null, direction: 'DEBIT', amount: fromMicros(absorbed), currency,
      dimensions: { component: 'REFUND', releaseStage: stage, part: 'ABSORBED' }, sellerId: order.sellerId, storeId: order.storeId ?? null, ...common,
    });
  }
  entries.push(clearing);
  const net0 = netBalanceByCurrency(entries);
  if (net0.size !== 1 || net0.get(currency) !== 0n) return skip('INVALID_SNAPSHOT', 'decomposição do reembolso não fecha com o valor devolvido.');
  return { status: 'OK', entries, parts: { sellerDebit: fromMicros(sellerDebit), commission: fromMicros(commission), absorbed: fromMicros(absorbed) } };
}
