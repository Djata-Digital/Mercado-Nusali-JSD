/**
 * LEDGER SOMBRA — E5: construção PURA (sem I/O) dos lançamentos de chargeback. Tudo a partir de registros JÁ GRAVADOS (alocação, decisão, linhas, recuperação, snapshot do
 * pedido); nada é recalculado com regras vigentes e NENHUMA responsabilidade é atribuída aqui: as linhas vêm de uma decisão explícita, com evidências, aprovada.
 *
 * Quatro momentos contábeis distintos (desenho F4–F10):
 *  1) CONFIRMADO (provedor debitou de fato; local_status = lost) — a contestação ABERTA nunca chega aqui:
 *       ANTES da liberação do Escrow:   D BUYER_ESCROW V                      C PAYMENT_CLEARING V      (o dinheiro retido sai; o vendedor nunca recebeu)
 *       DEPOIS da liberação:            D CHARGEBACK_RECEIVABLE[PENDING] V      C PAYMENT_CLEARING V      (perda PENDENTE de responsável — não é perda definitiva)
 *  2) ALOCADO (decisão aprovada, caso a caso) — só para perda pendente (depois da liberação):
 *                                       D RECEIVABLE[SELLER,vendedor] s ; D RECEIVABLE[THIRD_PARTY,terceiro] t ; D CHARGEBACK_LOSS n      C RECEIVABLE[PENDING] V   (s+t+n = V)
 *       Revisão (nova versão da decisão): só o DELTA entre as divisões, sem tocar no pendente.
 *  3) RECUPERAÇÃO externa recebida (terceiro):  D PAYMENT_CLEARING x   C RECEIVABLE[THIRD_PARTY] x
 *  4) BAIXA de reclamação rejeitada/prescrita:  D CHARGEBACK_LOSS x    C RECEIVABLE[THIRD_PARTY] x
 *  A cobrança do vendedor pela carteira real (débito de saldo) NÃO é feita aqui: o valor alocado ao vendedor permanece como RECEBÍVEL visível até essa etapa existir.
 */
import { fromMicros, netBalanceByCurrency, toMicros } from './decimal.js';
import type { DraftEntry } from './deliveryConfirmedEntries.js';
import type { LedgerSkipReason } from './types.js';

export type ChargebackStage = 'BEFORE_RELEASE' | 'AFTER_RELEASE';

export interface OrderForChargeback {
  id: string; buyerId: string; sellerId: string | null; storeId: string | null; countryCode: string | null; currency: string; totalAmount: string;
}
export interface AllocationForEntries { id: string; allocatedValue: string; currency: string; releaseStage: ChargebackStage }
export interface DecisionLineIn { partyType: 'SELLER' | 'NUSALI' | 'THIRD_PARTY'; partyRef: string | null; amount: string }
export interface RecoveryForEntries { id: string; kind: 'RECOVERY' | 'WRITE_OFF'; partyRef: string; amount: string; currency: string }
export type ChargebackBuildResult = { status: 'OK'; entries: DraftEntry[] } | { status: 'SKIPPED'; reason: LedgerSkipReason; detail?: string };

const skip = (detail: string): ChargebackBuildResult => ({ status: 'SKIPPED', reason: 'INVALID_SNAPSHOT', detail });

/** Rateio por pesos com MAIOR RESTO (soma exata, em centavos; micros em múltiplos de 10000). Usado para repartir o valor do provedor entre os pedidos filhos de um grupo. */
export function allocateByWeights(totalCents: bigint, weights: bigint[]): bigint[] {
  const sum = weights.reduce((a, b) => a + b, 0n);
  if (sum <= 0n || totalCents < 0n) throw new Error('CHARGEBACK_ALLOCATION_INVALID_WEIGHTS');
  const base = weights.map((w) => (totalCents * w) / sum);
  const rest = weights.map((w, i) => ({ i, r: (totalCents * w) % sum }));
  let left = totalCents - base.reduce((a, b) => a + b, 0n);
  rest.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (const x of rest) { if (left <= 0n) break; base[x.i] += 1n; left -= 1n; }
  return base;
}

const common = (order: OrderForChargeback, refType: string, refId: string) => ({
  orderId: order.id, buyerId: order.buyerId, sellerId: order.sellerId ?? null, storeId: order.storeId ?? null, countryCode: order.countryCode ?? null, referenceType: refType, referenceId: refId,
});

export function buildChargebackConfirmedEntries(order: OrderForChargeback, alloc: AllocationForEntries): ChargebackBuildResult {
  if (alloc.currency !== order.currency) return skip(`moeda da alocação (${alloc.currency}) difere da do pedido (${order.currency}).`);
  const v = toMicros(alloc.allocatedValue);
  if (v <= 0n || v > toMicros(order.totalAmount)) return skip(`valor alocado (${alloc.allocatedValue}) inválido ou maior que o total do pedido (${order.totalAmount}).`);
  const c = common(order, 'chargeback_allocation', alloc.id);
  const clearing: DraftEntry = { accountCode: 'PAYMENT_CLEARING', ownerType: 'PLATFORM', ownerId: null, direction: 'CREDIT', amount: alloc.allocatedValue, currency: order.currency, dimensions: { component: 'CHARGEBACK', releaseStage: alloc.releaseStage }, ...c };
  const debit: DraftEntry = alloc.releaseStage === 'BEFORE_RELEASE'
    ? { accountCode: 'BUYER_ESCROW', ownerType: 'PLATFORM', ownerId: null, direction: 'DEBIT', amount: alloc.allocatedValue, currency: order.currency, dimensions: { component: 'CHARGEBACK', releaseStage: alloc.releaseStage }, ...c }
    : { accountCode: 'CHARGEBACK_RECEIVABLE', ownerType: 'PLATFORM', ownerId: null, direction: 'DEBIT', amount: alloc.allocatedValue, currency: order.currency, dimensions: { component: 'CHARGEBACK', debtor: 'PENDING', releaseStage: alloc.releaseStage }, ...c };
  return { status: 'OK', entries: [debit, clearing] };
}

type Bucket = { partyType: DecisionLineIn['partyType']; partyRef: string | null };
const bucketKey = (b: Bucket) => `${b.partyType}|${b.partyRef ?? ''}`;
function sumBuckets(lines: DecisionLineIn[]): Map<string, { b: Bucket; amount: bigint }> {
  const m = new Map<string, { b: Bucket; amount: bigint }>();
  for (const l of lines) {
    const k = bucketKey(l); const cur = m.get(k) ?? { b: { partyType: l.partyType, partyRef: l.partyRef ?? null }, amount: 0n };
    cur.amount += toMicros(l.amount); m.set(k, cur);
  }
  return m;
}

/** Lançamento da DECISÃO aprovada para UMA alocação (perda pendente). `prevLines` = linhas da versão que esta substitui (revisão) ou null na primeira decisão. */
export function buildChargebackAllocatedEntries(order: OrderForChargeback, alloc: AllocationForEntries, lines: DecisionLineIn[], prevLines: DecisionLineIn[] | null): ChargebackBuildResult {
  if (alloc.releaseStage !== 'AFTER_RELEASE') return { status: 'SKIPPED', reason: 'INVALID_SNAPSHOT', detail: 'só há perda a repartir quando o chargeback foi confirmado depois da liberação do Escrow.' };
  if (alloc.currency !== order.currency) return skip('moeda da alocação difere da do pedido.');
  const v = toMicros(alloc.allocatedValue);
  const next = sumBuckets(lines);
  const nextTotal = [...next.values()].reduce((a, x) => a + x.amount, 0n);
  if (lines.length === 0 || [...next.values()].some((x) => x.amount <= 0n) || nextTotal !== v) return skip(`linhas da decisão (${fromMicros(nextTotal)}) não somam o valor alocado (${alloc.allocatedValue}).`);
  const prev = prevLines ? sumBuckets(prevLines) : null;
  if (prev && [...prev.values()].reduce((a, x) => a + x.amount, 0n) !== v) return skip('linhas da versão anterior não somam o valor alocado.');

  const c = common(order, 'chargeback_allocation', alloc.id);
  const mk = (b: Bucket, direction: 'DEBIT' | 'CREDIT', micros: bigint): DraftEntry => b.partyType === 'NUSALI'
    ? { accountCode: 'CHARGEBACK_LOSS', ownerType: 'PLATFORM', ownerId: null, direction, amount: fromMicros(micros), currency: order.currency, dimensions: { component: 'CHARGEBACK', party: 'NUSALI' }, ...c }
    : { accountCode: 'CHARGEBACK_RECEIVABLE', ownerType: 'PLATFORM', ownerId: null, direction, amount: fromMicros(micros), currency: order.currency, dimensions: { component: 'CHARGEBACK', debtor: b.partyType, partyRef: b.partyRef }, ...c };
  const entries: DraftEntry[] = [];
  if (!prev) {
    for (const { b, amount } of next.values()) entries.push(mk(b, 'DEBIT', amount));
    entries.push({ accountCode: 'CHARGEBACK_RECEIVABLE', ownerType: 'PLATFORM', ownerId: null, direction: 'CREDIT', amount: alloc.allocatedValue, currency: order.currency, dimensions: { component: 'CHARGEBACK', debtor: 'PENDING' }, ...c });
  } else {
    const keys = new Set([...next.keys(), ...prev.keys()]);
    for (const k of keys) {
      const nb = next.get(k); const pb = prev.get(k);
      const d = (nb?.amount ?? 0n) - (pb?.amount ?? 0n);
      if (d === 0n) continue;
      entries.push(mk((nb ?? pb)!.b, d > 0n ? 'DEBIT' : 'CREDIT', d > 0n ? d : -d));
    }
    if (entries.length === 0) return { status: 'SKIPPED', reason: 'INVALID_SNAPSHOT', detail: 'a revisão não altera a divisão anterior (nada a lançar).' };
  }
  const net = netBalanceByCurrency(entries);
  if (net.size !== 1 || net.get(order.currency) !== 0n) return skip('lançamento da decisão não fecha.');
  return { status: 'OK', entries };
}

export function buildChargebackRecoveryEntries(order: OrderForChargeback, rec: RecoveryForEntries): ChargebackBuildResult {
  if (rec.currency !== order.currency) return skip('moeda da recuperação difere da do pedido.');
  if (toMicros(rec.amount) <= 0n) return skip('valor inválido.');
  const c = common(order, 'chargeback_recovery', rec.id);
  const credit: DraftEntry = { accountCode: 'CHARGEBACK_RECEIVABLE', ownerType: 'PLATFORM', ownerId: null, direction: 'CREDIT', amount: rec.amount, currency: order.currency, dimensions: { component: 'CHARGEBACK', debtor: 'THIRD_PARTY', partyRef: rec.partyRef, settlement: rec.kind }, ...c };
  const debit: DraftEntry = rec.kind === 'RECOVERY'
    ? { accountCode: 'PAYMENT_CLEARING', ownerType: 'PLATFORM', ownerId: null, direction: 'DEBIT', amount: rec.amount, currency: order.currency, dimensions: { component: 'CHARGEBACK', settlement: 'RECOVERY' }, ...c }
    : { accountCode: 'CHARGEBACK_LOSS', ownerType: 'PLATFORM', ownerId: null, direction: 'DEBIT', amount: rec.amount, currency: order.currency, dimensions: { component: 'CHARGEBACK', party: 'THIRD_PARTY_WRITE_OFF', partyRef: rec.partyRef }, ...c };
  return { status: 'OK', entries: [debit, credit] };
}
