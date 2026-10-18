/**
 * LEDGER SOMBRA — E8b: SAQUES (solicitação, conclusão, falha). Funções PURAS (sem I/O): chaves, snapshot, lançamentos e avaliação de reconciliação.
 *
 * Contas (catálogo existente; nenhuma conta nova):
 *   SELLER_PAYABLE          (SELLER)   o que a Nusali deve ao vendedor — o mesmo saldo que a carteira real espelha (crédito na entrega, débito no reembolso pós-liberação)
 *   SELLER_PAYOUT_CLEARING  (SELLER)   saque SOLICITADO e ainda não concluído (em trânsito) — conta de compensação já catalogada para esta fase
 *   PAYMENT_CLEARING        (PLATFORM) o caixa que a Nusali tem a pagar/receber via provedor: DÉBITO quando o dinheiro do comprador entra (PAYMENT_RECEIVED) e CRÉDITO quando dinheiro
 *                                      SAI (reembolso ao comprador, chargeback). Concluir um saque é dinheiro saindo para o vendedor => crédito aqui, exatamente como o reembolso.
 *
 *   PAYOUT_REQUESTED  (o saldo é RESERVADO no pedido, como na carteira real)   D SELLER_PAYABLE a      C SELLER_PAYOUT_CLEARING a
 *   PAYOUT_COMPLETED  (só quando o saque está concluído de fato)               D SELLER_PAYOUT_CLEARING a   C PAYMENT_CLEARING a
 *   PAYOUT_FAILED     (o valor volta ao saldo do vendedor; reverte a solicitação)  D SELLER_PAYOUT_CLEARING a   C SELLER_PAYABLE a
 * Conciliação: SELLER_PAYABLE do vendedor = saldo da carteira (a solicitação debita os dois; a falha devolve os dois); SELLER_PAYOUT_CLEARING = Σ saques pendentes/em processamento.
 * Nada aqui lê ou escreve saldo real; os valores vêm do próprio registro do saque (cópia literal, nunca recalculado).
 */
import crypto from 'crypto';
import { toMicros } from './decimal.js';
import type { DraftEntry } from './deliveryConfirmedEntries.js';
import type { LedgerSkipReason } from './types.js';

export type PayoutEventType = 'PAYOUT_REQUESTED' | 'PAYOUT_COMPLETED' | 'PAYOUT_FAILED';
export const PAYOUT_EVENT_TYPES: readonly PayoutEventType[] = ['PAYOUT_REQUESTED', 'PAYOUT_COMPLETED', 'PAYOUT_FAILED'];
export const isPayoutEvent = (t: string): t is PayoutEventType => (PAYOUT_EVENT_TYPES as readonly string[]).includes(t);

const KEY_PREFIX: Record<PayoutEventType, string> = { PAYOUT_REQUESTED: 'payout_requested', PAYOUT_COMPLETED: 'payout_completed', PAYOUT_FAILED: 'payout_failed' };
/** Um evento (e um lançamento) por saque e por tipo; a chave é a MESMA no outbox e em ledger_transactions. */
export const payoutKey = (type: PayoutEventType, payoutId: string) => `${KEY_PREFIX[type]}:${payoutId}`;

export interface PayoutRowForSnapshot {
  id: string; sellerId: string; amount: string | number; currency: string; method: string; createdAt: Date | string;
  processedAt?: Date | string | null; transactionRef?: string | null;
}
const asStr = (v: unknown) => (v === null || v === undefined ? null : String(v));
const asIso = (v: Date | string) => (v instanceof Date ? v.toISOString() : new Date(v).toISOString());

/** Campos IMUTÁVEIS do saque (+ referência e hora da conclusão no evento de conclusão): o processador recusa se o saque divergir do enfileirado. */
export function buildPayoutSnapshot(p: PayoutRowForSnapshot, type: PayoutEventType): Record<string, string | null> {
  const base: Record<string, string | null> = {
    payoutId: p.id, sellerId: p.sellerId, amount: asStr(p.amount), currency: p.currency, method: p.method, createdAt: asIso(p.createdAt),
  };
  if (type === 'PAYOUT_COMPLETED') return { ...base, transactionRef: asStr(p.transactionRef), processedAt: p.processedAt ? asIso(p.processedAt) : null };
  return base;
}
export function hashPayoutSnapshot(snapshot: Record<string, unknown>): string {
  const canonical = JSON.stringify(Object.keys(snapshot).sort().map((k) => [k, snapshot[k]]));
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export type PayoutBuildResult = { status: 'OK'; entries: DraftEntry[] } | { status: 'SKIPPED'; reason: LedgerSkipReason; detail?: string };

export function buildPayoutEntries(p: { id: string; sellerId: string; amount: string; currency: string }, type: PayoutEventType): PayoutBuildResult {
  if (!p.sellerId || !p.currency || p.amount === null || p.amount === undefined) return { status: 'SKIPPED', reason: 'MISSING_SNAPSHOT', detail: 'sellerId/currency/amount do saque ausente.' };
  let micros: bigint; try { micros = toMicros(p.amount); } catch { return { status: 'SKIPPED', reason: 'INVALID_SNAPSHOT', detail: `valor do saque inválido (${p.amount}).` }; }
  if (micros <= 0n) return { status: 'SKIPPED', reason: 'INVALID_SNAPSHOT', detail: `valor do saque inválido (${p.amount}).` };
  const common = { sellerId: p.sellerId, referenceType: 'seller_payout' as const, referenceId: p.id };
  const line = (accountCode: DraftEntry['accountCode'], direction: 'DEBIT' | 'CREDIT', platform = false): DraftEntry => ({
    accountCode, ownerType: platform ? 'PLATFORM' : 'SELLER', ownerId: platform ? null : p.sellerId, direction, amount: p.amount, currency: p.currency,
    dimensions: { component: 'PAYOUT', payoutStage: type.replace('PAYOUT_', '') }, ...common,
  });
  if (type === 'PAYOUT_REQUESTED') return { status: 'OK', entries: [line('SELLER_PAYABLE', 'DEBIT'), line('SELLER_PAYOUT_CLEARING', 'CREDIT')] };
  if (type === 'PAYOUT_COMPLETED') return { status: 'OK', entries: [line('SELLER_PAYOUT_CLEARING', 'DEBIT'), line('PAYMENT_CLEARING', 'CREDIT', true)] };
  return { status: 'OK', entries: [line('SELLER_PAYOUT_CLEARING', 'DEBIT'), line('SELLER_PAYABLE', 'CREDIT')] };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// Reconciliação (avaliação pura) — mesmo vocabulário dos achados de pedido
// ---------------------------------------------------------------------------------------------------------------------------------------------------------
export type PayoutFindingSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export interface PayoutFinding { type: string; severity: PayoutFindingSeverity; detail: string; expected?: unknown; actual?: unknown; eventId?: string | null; ledgerTransactionId?: string | null; scope: string }
export interface PEntry { code: string; direction: 'DEBIT' | 'CREDIT'; amount: string }
export interface PEvent { id: string; status: string; createdAt: Date; ledgerTransactionId: string | null; lastErrorCode: string | null }
export interface PTx { id: string; status: string }
export interface PayoutStageView { tx: PTx | null; event: PEvent | null; entries: PEntry[] }
export interface PayoutLedgerView {
  payout: { id: string; sellerId: string; amount: string; currency: string; status: string; createdAt: Date; processedAt: Date | null };
  requested: PayoutStageView; completed: PayoutStageView; failed: PayoutStageView;
}

const agg = (entries: PEntry[]): Record<string, bigint> => { const o: Record<string, bigint> = {}; for (const e of entries) { const k = `${e.code}|${e.direction}`; o[k] = (o[k] ?? 0n) + toMicros(e.amount); } return o; };
const sameAgg = (a: Record<string, bigint>, b: Record<string, bigint>) => { const ka = Object.keys(a).sort(), kb = Object.keys(b).sort(); return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]); };
const show = (a: Record<string, bigint>) => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.toString()]));
const minutes = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 60000;

export function evaluatePayout(v: PayoutLedgerView, now: Date, staleMinutes: number): PayoutFinding[] {
  const out: PayoutFinding[] = []; const p = v.payout; const scope = p.id;
  const add = (x: Omit<PayoutFinding, 'scope'>) => out.push({ ...x, scope });
  const stageCheck = (kind: 'PAYOUT_REQUESTED' | 'PAYOUT_COMPLETED' | 'PAYOUT_FAILED', s: PayoutStageView, since: Date) => {
    if (s.tx) {
      if (s.tx.status !== 'POSTED') add({ type: `${kind}_LEDGER_NOT_POSTED`, severity: 'CRITICAL', detail: `transação ${s.tx.id} está ${s.tx.status}`, ledgerTransactionId: s.tx.id, eventId: s.event?.id });
      if (s.event?.status === 'DONE' && s.event.ledgerTransactionId && s.event.ledgerTransactionId !== s.tx.id) add({ type: `${kind}_EVENT_LEDGER_LINK_MISMATCH`, severity: 'WARNING', detail: `evento DONE aponta para ${s.event.ledgerTransactionId}, mas o lançamento é ${s.tx.id}`, eventId: s.event.id, ledgerTransactionId: s.tx.id });
      else if (s.event && s.event.status !== 'DONE' && s.event.status !== 'DISMISSED') add({ type: `${kind}_EVENT_BEHIND_LEDGER`, severity: 'INFO', detail: `lançamento existe, evento ainda ${s.event.status} (vira replay idempotente)`, eventId: s.event.id, ledgerTransactionId: s.tx.id });
      return;
    }
    if (!s.event) {
      const age = minutes(since, now);
      add({ type: `${kind}_LEDGER_MISSING_NO_EVENT`, severity: age > staleMinutes ? 'CRITICAL' : 'WARNING', detail: `sem lançamento e sem evento no outbox (há ${Math.round(age)} min)`, expected: { idempotencyKey: payoutKey(kind, p.id) } });
      return;
    }
    switch (s.event.status) {
      case 'PENDING': case 'RETRYING': case 'PROCESSING': { const age = minutes(s.event.createdAt, now); if (age > staleMinutes) add({ type: `${kind}_EVENT_STALE`, severity: 'WARNING', detail: `evento ${s.event.status} há ${Math.round(age)} min sem lançamento`, eventId: s.event.id }); break; }
      case 'DONE': add({ type: `${kind}_LEDGER_MISSING_AFTER_DONE`, severity: 'CRITICAL', detail: `evento ${s.event.id} está DONE mas o lançamento não existe`, eventId: s.event.id }); break;
      case 'NEEDS_INTERVENTION': add({ type: `${kind}_EVENT_NEEDS_INTERVENTION`, severity: 'CRITICAL', detail: `evento exige intervenção (${s.event.lastErrorCode ?? 'sem código'})`, eventId: s.event.id }); break;
      case 'SKIPPED': add({ type: `${kind}_EVENT_SKIPPED`, severity: 'INFO', detail: `evento ignorado por política (${s.event.lastErrorCode ?? ''})`, eventId: s.event.id }); break;
      case 'DISMISSED': add({ type: `${kind}_EVENT_DISMISSED_WITHOUT_LEDGER`, severity: 'WARNING', detail: 'evento descartado manualmente: o saque segue sem lançamento (lacuna contábil reconhecida)', eventId: s.event.id }); break;
    }
  };
  const amountCheck = (kind: PayoutEventType, s: PayoutStageView) => {
    if (!s.tx || s.tx.status !== 'POSTED') return;
    const built = buildPayoutEntries({ id: p.id, sellerId: p.sellerId, amount: p.amount, currency: p.currency }, kind);
    if (built.status !== 'OK') return;
    const exp = agg(built.entries.map((e) => ({ code: e.accountCode, direction: e.direction, amount: e.amount }))); const got = agg(s.entries);
    if (!sameAgg(exp, got)) add({ type: `${kind}_AMOUNT_MISMATCH`, severity: 'CRITICAL', detail: 'lançamento do saque difere do valor registrado no saque', expected: show(exp), actual: show(got), ledgerTransactionId: s.tx.id });
  };

  stageCheck('PAYOUT_REQUESTED', v.requested, p.createdAt); amountCheck('PAYOUT_REQUESTED', v.requested);
  // a conclusão/falha só é esperada quando o saque ESTÁ nesse estado; lançamento sem o estado correspondente é divergência CRÍTICA (nunca se registra conclusão antes do fato real)
  if (p.status === 'completed') { stageCheck('PAYOUT_COMPLETED', v.completed, p.processedAt ?? p.createdAt); amountCheck('PAYOUT_COMPLETED', v.completed); }
  else if (v.completed.tx) add({ type: 'PAYOUT_COMPLETED_LEDGER_STATE_MISMATCH', severity: 'CRITICAL', detail: `existe lançamento de CONCLUSÃO mas o saque está "${p.status}"`, ledgerTransactionId: v.completed.tx.id });
  if (p.status === 'failed') { stageCheck('PAYOUT_FAILED', v.failed, p.createdAt); amountCheck('PAYOUT_FAILED', v.failed); }
  else if (v.failed.tx) add({ type: 'PAYOUT_FAILED_LEDGER_STATE_MISMATCH', severity: 'CRITICAL', detail: `existe lançamento de FALHA mas o saque está "${p.status}"`, ledgerTransactionId: v.failed.tx.id });
  if (v.completed.tx && v.failed.tx) add({ type: 'PAYOUT_CONFLICTING_OUTCOMES', severity: 'CRITICAL', detail: 'o saque tem lançamento de conclusão E de falha', ledgerTransactionId: v.completed.tx.id });
  return out;
}
