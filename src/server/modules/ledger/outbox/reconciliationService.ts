/**
 * LEDGER SOMBRA — E2: RECONCILIAÇÃO. Compara, para cada pedido pago em escopo (criado em/depois do cutoff), o que DEVERIA existir no ledger com o que existe, e o
 * estado do outbox. É SOMENTE LEITURA sobre ledger_*, orders, escrow e payments: nunca corrige, nunca apaga, nunca cria lançamento. Só grava as próprias
 * execuções/divergências (ledger_reconciliation_*). Divergência não desaparece em silêncio: fica OPEN (ou ACKNOWLEDGED por um humano) até deixar de existir.
 * O reparo de eventos ausentes é um comando MANUAL separado (repairMissingEvents), por padrão em dry-run, restrito a GLOBAL_ADMIN e auditado.
 */
import { eq, sql } from 'drizzle-orm';
import { getDb } from '../../../../db/index.js';
import { ledgerReconciliationRuns, ledgerReconciliationFindings, auditLogs, users } from '../../../../db/schema.js';
import { logger } from '../../../infra/logger.js';
import { FinancialLedgerService } from '../financialLedgerService.js';
import { buildDeliveryConfirmedEntries } from '../deliveryConfirmedEntries.js';
import { buildRefundProcessedEntries, type ReleaseStage } from '../refundProcessedEntries.js';
import { buildShippingCostReversalEntries, shippingCostCapacity } from '../shippingReversalEntries.js';
import { buildChargebackConfirmedEntries, buildChargebackAllocatedEntries, buildChargebackRecoveryEntries, type DecisionLineIn } from '../chargebackEntries.js';
import { toMicros } from '../decimal.js';
import { resolvePolicy } from './outboxEvents.js';
import { enqueueLedgerEvent, enqueuePayoutLedgerEvent, parseUtc, OutboxAdminError } from './outboxService.js';
import { evaluatePayout, type PayoutLedgerView, type PayoutStageView, type PEntry } from '../payoutLedger.js';

export type FindingSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export interface Finding {
  type: string; severity: FindingSeverity; detail: string; expected?: unknown; actual?: unknown; eventId?: string | null; ledgerTransactionId?: string | null;
  /** distingue achados do mesmo tipo no mesmo pedido (ex.: o id do reembolso) — entra no fingerprint */
  scope?: string;
}
export interface EntryView { code: string; direction: 'DEBIT' | 'CREDIT'; amount: string }
export interface EventView { id: string; status: string; createdAt: Date; ledgerTransactionId: string | null; lastErrorCode: string | null }
export interface TxView { id: string; status: string }
export interface OrderView {
  id: string; currency: string; totalAmount: string; escrowStatus: string | null; createdAt: Date; escrowCreatedAt: Date | null; escrowReleasedAt: Date | null; updatedAt: Date;
  snapshot: Parameters<typeof buildDeliveryConfirmedEntries>[0];
}
/** E3 — reembolso CONCLUÍDO (status 'processed') do pedido e o que o ledger/outbox têm dele. */
export interface RefundLedgerView {
  id: string; amount: string; currency: string; sellerDebitAmount: string | null; processedAt: Date; tx: TxView | null; event: EventView | null; entries: EntryView[];
}
/** E4 — reversão de custo de frete REGISTRADA (shipping_cost_reversals) e o que o ledger/outbox têm dela. */
export interface ReversalLedgerView {
  id: string; amount: string; currency: string; subsidyPart: string; absorbedPart: string; createdAt: Date; tx: TxView | null; event: EventView | null; entries: EntryView[];
}
/** E5 — alocação de chargeback PERDIDO por pedido (valor efetivamente debitado pelo provedor) e o que o ledger/outbox têm dela, das decisões e das recuperações. */
export interface ChargebackDecisionView { id: string; version: number; status: string; lines: DecisionLineIn[]; tx: TxView | null; event: EventView | null; entries: EntryView[]; createdAt: Date }
export interface ChargebackRecoveryView { id: string; kind: 'RECOVERY' | 'WRITE_OFF'; partyRef: string; amount: string; currency: string; tx: TxView | null; event: EventView | null; entries: EntryView[]; createdAt: Date }
export interface ChargebackAllocView {
  id: string; chargebackId: string; value: string; currency: string; releaseStage: 'BEFORE_RELEASE' | 'AFTER_RELEASE'; overlapRefund: boolean; createdAt: Date;
  tx: TxView | null; event: EventView | null; entries: EntryView[]; decisions: ChargebackDecisionView[]; recoveries: ChargebackRecoveryView[];
}
export interface OrderLedgerView {
  order: OrderView; prTx: TxView | null; dcTx: TxView | null; prEvent: EventView | null; dcEvent: EventView | null; prEntries: EntryView[]; dcEntries: EntryView[];
  refunds?: RefundLedgerView[];
  reversals?: ReversalLedgerView[];
  chargebacks?: ChargebackAllocView[];
}

const agg = (entries: EntryView[]): Record<string, bigint> => {
  const out: Record<string, bigint> = {};
  for (const e of entries) { const k = `${e.code}|${e.direction}`; out[k] = (out[k] ?? 0n) + toMicros(e.amount); }
  return out;
};
const sameAgg = (a: Record<string, bigint>, b: Record<string, bigint>) => { const ka = Object.keys(a).sort(), kb = Object.keys(b).sort(); return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]); };
const show = (a: Record<string, bigint>) => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.toString()]));
const minutes = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 60000;

/** PURA: avalia UM pedido e devolve as divergências. Sem I/O — testável isoladamente. */
export function evaluateOrder(v: OrderLedgerView, now: Date, staleMinutes: number): Finding[] {
  const f: Finding[] = [];
  const o = v.order;
  const total = toMicros(o.totalAmount);

  const eventCheck = (kind: 'PAYMENT' | 'DELIVERY' | 'REFUND' | 'SHIPPING_REVERSAL' | 'CHARGEBACK' | 'CHARGEBACK_ALLOCATION' | 'CHARGEBACK_RECOVERY', tx: TxView | null, ev: EventView | null, since: Date, scope?: string, key?: string) => {
    const add = (x: Finding) => f.push(scope ? { ...x, scope } : x);
    if (tx) {
      if (tx.status !== 'POSTED') add({ type: `${kind}_LEDGER_NOT_POSTED`, severity: 'CRITICAL', detail: `transação ${tx.id} está ${tx.status}`, ledgerTransactionId: tx.id, eventId: ev?.id });
      if (ev?.status === 'DONE' && ev.ledgerTransactionId && ev.ledgerTransactionId !== tx.id) add({ type: `${kind}_EVENT_LEDGER_LINK_MISMATCH`, severity: 'WARNING', detail: `evento DONE aponta para ${ev.ledgerTransactionId}, mas o lançamento é ${tx.id}`, eventId: ev.id, ledgerTransactionId: tx.id });
      else if (ev && ev.status !== 'DONE' && ev.status !== 'DISMISSED') add({ type: `${kind}_EVENT_BEHIND_LEDGER`, severity: 'INFO', detail: `lançamento existe, evento ainda ${ev.status} (vira replay idempotente)`, eventId: ev.id, ledgerTransactionId: tx.id });
      return;
    }
    // sem lançamento
    if (!ev) {
      const age = minutes(since, now);
      add({ type: `${kind}_LEDGER_MISSING_NO_EVENT`, severity: age > staleMinutes ? 'CRITICAL' : 'WARNING', detail: `sem lançamento e sem evento no outbox (há ${Math.round(age)} min)`, expected: { idempotencyKey: key ?? (kind === 'PAYMENT' ? `payment_received:${o.id}` : `order_release:${o.id}`) } });
      return;
    }
    switch (ev.status) {
      case 'PENDING': case 'RETRYING': case 'PROCESSING': {
        const age = minutes(ev.createdAt, now);
        if (age > staleMinutes) add({ type: `${kind}_EVENT_STALE`, severity: 'WARNING', detail: `evento ${ev.status} há ${Math.round(age)} min sem lançamento`, eventId: ev.id });
        break;
      }
      case 'DONE': add({ type: `${kind}_LEDGER_MISSING_AFTER_DONE`, severity: 'CRITICAL', detail: `evento ${ev.id} está DONE mas o lançamento não existe`, eventId: ev.id }); break;
      case 'NEEDS_INTERVENTION': add({ type: `${kind}_EVENT_NEEDS_INTERVENTION`, severity: 'CRITICAL', detail: `evento exige intervenção (${ev.lastErrorCode ?? 'sem código'})`, eventId: ev.id }); break;
      case 'SKIPPED': add({ type: `${kind}_EVENT_SKIPPED`, severity: 'INFO', detail: `evento ignorado por política (${ev.lastErrorCode ?? ''})`, eventId: ev.id }); break;
      case 'DISMISSED': add({ type: `${kind}_EVENT_DISMISSED_WITHOUT_LEDGER`, severity: 'WARNING', detail: 'evento descartado manualmente: o pedido segue sem lançamento (lacuna contábil reconhecida)', eventId: ev.id }); break;
    }
  };

  // --- pagamento
  eventCheck('PAYMENT', v.prTx, v.prEvent, o.escrowCreatedAt ?? o.updatedAt);
  if (v.prTx && v.prTx.status === 'POSTED') {
    const exp = { 'PAYMENT_CLEARING|DEBIT': total, 'BUYER_ESCROW|CREDIT': total };
    const got = agg(v.prEntries);
    if (!sameAgg(exp, got)) f.push({ type: 'PAYMENT_AMOUNT_MISMATCH', severity: 'CRITICAL', detail: 'lançamento do pagamento difere do total do pedido', expected: show(exp), actual: show(got), ledgerTransactionId: v.prTx.id });
  }

  // --- entrega (só depois da liberação do Escrow). E3: pedido reembolsado DEPOIS de liberado (Escrow 'refunded' com released_at) continua tendo a entrega contabilizada.
  const released = o.escrowStatus === 'released' || (o.escrowStatus === 'refunded' && o.escrowReleasedAt != null);
  if (released) {
    eventCheck('DELIVERY', v.dcTx, v.dcEvent, o.escrowReleasedAt ?? o.updatedAt);
    if (v.dcTx && v.dcTx.status === 'POSTED') {
      const built = buildDeliveryConfirmedEntries(o.snapshot);
      if (built.status !== 'OK') f.push({ type: 'DELIVERY_INVALID_SNAPSHOT', severity: 'CRITICAL', detail: `o snapshot do pedido não gera lançamento válido (${built.reason}: ${built.detail ?? ''}) mas existe lançamento`, ledgerTransactionId: v.dcTx.id });
      else {
        const exp = agg(built.entries.map((e) => ({ code: e.accountCode, direction: e.direction, amount: e.amount })));
        const got = agg(v.dcEntries);
        if (!sameAgg(exp, got)) f.push({ type: 'DELIVERY_AMOUNT_MISMATCH', severity: 'CRITICAL', detail: 'lançamento da entrega difere do snapshot do pedido', expected: show(exp), actual: show(got), ledgerTransactionId: v.dcTx.id });
      }
    }
  } else if (v.dcTx) {
    f.push({ type: 'DELIVERY_LEDGERED_WITHOUT_RELEASE', severity: 'CRITICAL', detail: `existe lançamento de entrega mas o Escrow está "${o.escrowStatus}"`, ledgerTransactionId: v.dcTx.id });
  }
  // --- reembolsos CONCLUÍDOS (E3). Reservado/pendente/falhado nunca aparecem aqui (a consulta só traz status 'processed').
  const refundsView = v.refunds ?? [];
  const stage: ReleaseStage = o.escrowReleasedAt != null ? 'AFTER_RELEASE' : 'BEFORE_RELEASE';
  for (const r of refundsView) {
    eventCheck('REFUND', r.tx, r.event, r.processedAt, r.id, `refund_processed:${r.id}`);
    if (r.tx && r.tx.status === 'POSTED') {
      const built = buildRefundProcessedEntries(o.snapshot as any, { id: r.id, amount: r.amount, currency: r.currency, sellerDebitAmount: r.sellerDebitAmount }, stage);
      if (built.status !== 'OK') f.push({ type: 'REFUND_INVALID_SNAPSHOT', severity: 'CRITICAL', detail: `reembolso ${r.id}: o snapshot não gera lançamento válido (${built.reason}: ${built.detail ?? ''}) mas existe lançamento`, ledgerTransactionId: r.tx.id, scope: r.id });
      else {
        const exp = agg(built.entries.map((e) => ({ code: e.accountCode, direction: e.direction, amount: e.amount })));
        const got = agg(r.entries);
        if (!sameAgg(exp, got)) f.push({ type: 'REFUND_AMOUNT_MISMATCH', severity: 'CRITICAL', detail: `lançamento do reembolso ${r.id} difere do reembolso concluído e do snapshot do pedido (estágio ${stage})`, expected: show(exp), actual: show(got), ledgerTransactionId: r.tx.id, scope: r.id });
      }
    }
  }

  // --- reversões de custo de frete REGISTRADAS (E4). Sem registro nada é esperado: o subsídio e o frete absorvido permanecem custo da Nusali.
  const reversalsView = v.reversals ?? [];
  if (reversalsView.length) {
    const cap = shippingCostCapacity(o.snapshot as any);
    const sum = reversalsView.reduce((acc, r) => acc + toMicros(r.amount), 0n);
    if (sum > cap.cost) f.push({ type: 'SHIPPING_REVERSAL_EXCEEDS_COST', severity: 'CRITICAL', detail: `reversões somam ${sum} micros, acima do custo de frete do pedido (${cap.cost})`, expected: cap.cost.toString(), actual: sum.toString() });
    if (!(o.escrowStatus === 'refunded' && o.escrowReleasedAt != null)) f.push({ type: 'SHIPPING_REVERSAL_INVALID_CONTEXT', severity: 'CRITICAL', detail: `existe reversão de frete, mas o pedido não foi reembolsado depois da liberação (Escrow "${o.escrowStatus}")` });
  }
  for (const r of reversalsView) {
    eventCheck('SHIPPING_REVERSAL', r.tx, r.event, r.createdAt, r.id, `shipping_cost_reversed:${r.id}`);
    if (r.tx && r.tx.status === 'POSTED') {
      const built = buildShippingCostReversalEntries(o.snapshot as any, { id: r.id, amount: r.amount, currency: r.currency, subsidyPart: r.subsidyPart, absorbedPart: r.absorbedPart });
      if (built.status !== 'OK') f.push({ type: 'SHIPPING_REVERSAL_INVALID_SNAPSHOT', severity: 'CRITICAL', detail: `reversão ${r.id}: não gera lançamento válido (${built.detail ?? ''}) mas existe lançamento`, ledgerTransactionId: r.tx.id, scope: r.id });
      else {
        const exp = agg(built.entries.map((e) => ({ code: e.accountCode, direction: e.direction, amount: e.amount })));
        const got = agg(r.entries);
        if (!sameAgg(exp, got)) f.push({ type: 'SHIPPING_REVERSAL_AMOUNT_MISMATCH', severity: 'CRITICAL', detail: `lançamento da reversão ${r.id} difere do registro imutável da reversão`, expected: show(exp), actual: show(got), ledgerTransactionId: r.tx.id, scope: r.id });
      }
    }
  }

  // --- chargebacks PERDIDOS (E5): contestação aberta nunca aparece aqui (só o valor efetivamente debitado vira alocação)
  const cbView = v.chargebacks ?? [];
  const orderForCb = { id: o.id, buyerId: (o.snapshot as any).buyerId, sellerId: (o.snapshot as any).sellerId ?? null, storeId: (o.snapshot as any).storeId ?? null, countryCode: (o.snapshot as any).countryCode ?? null, currency: o.currency, totalAmount: o.totalAmount };
  for (const a of cbView) {
    const addF = (x: Finding) => f.push({ ...x, scope: x.scope ?? a.id });
    if (a.overlapRefund || (refundsView.length > 0 && !a.overlapRefund)) {
      addF({ type: 'CHARGEBACK_REFUND_OVERLAP', severity: 'CRITICAL', detail: 'o pedido tem reembolso concluído E chargeback perdido alocado: o mesmo dinheiro seria contabilizado duas vezes — nada é lançado em duplicidade; exige revisão humana' });
    }
    if (a.overlapRefund) continue;
    eventCheck('CHARGEBACK', a.tx, a.event, a.createdAt, a.id, `chargeback_confirmed:${a.id}`);
    if (a.tx && a.tx.status === 'POSTED') {
      const built = buildChargebackConfirmedEntries(orderForCb, { id: a.id, allocatedValue: a.value, currency: a.currency, releaseStage: a.releaseStage });
      if (built.status !== 'OK') addF({ type: 'CHARGEBACK_INVALID_SNAPSHOT', severity: 'CRITICAL', detail: `alocação ${a.id}: não gera lançamento válido (${built.detail ?? ''}) mas existe lançamento`, ledgerTransactionId: a.tx.id });
      else if (!sameAgg(agg(built.entries.map((e) => ({ code: e.accountCode, direction: e.direction, amount: e.amount }))), agg(a.entries))) {
        addF({ type: 'CHARGEBACK_AMOUNT_MISMATCH', severity: 'CRITICAL', detail: `lançamento do chargeback ${a.id} difere do valor alocado`, ledgerTransactionId: a.tx.id });
      }
    }
    const ordered = [...a.decisions].sort((x, y) => x.version - y.version);
    const current = [...ordered].reverse().find((d) => d.status === 'APPROVED') ?? null;
    if (a.releaseStage === 'AFTER_RELEASE' && a.tx?.status === 'POSTED' && !current) {
      addF({ type: 'CHARGEBACK_LOSS_PENDING_DECISION', severity: 'INFO', detail: `perda de ${a.value} PENDENTE de decisão de responsabilidade (não é perda definitiva; ninguém foi responsabilizado)` });
    }
    ordered.forEach((d, i) => {
      const sc = `${a.id}:${d.id}`;
      const sumLines = d.lines.reduce((acc, l) => acc + toMicros(l.amount), 0n);
      if (sumLines !== toMicros(a.value)) addF({ type: 'CHARGEBACK_DECISION_LINES_MISMATCH', severity: 'CRITICAL', detail: `decisão v${d.version}: as linhas somam ${sumLines} micros e o valor alocado é ${a.value}`, scope: sc });
      eventCheck('CHARGEBACK_ALLOCATION', d.tx, d.event, d.createdAt, sc, `chargeback_allocated:${d.id}:${a.id}`);
      if (d.tx && d.tx.status === 'POSTED') {
        const built = buildChargebackAllocatedEntries(orderForCb, { id: a.id, allocatedValue: a.value, currency: a.currency, releaseStage: a.releaseStage }, d.lines, i > 0 ? ordered[i - 1].lines : null);
        if (built.status !== 'OK') addF({ type: 'CHARGEBACK_ALLOCATION_INVALID', severity: 'CRITICAL', detail: `decisão v${d.version}: não gera lançamento válido (${built.detail ?? ''}) mas existe lançamento`, scope: sc, ledgerTransactionId: d.tx.id });
        else if (!sameAgg(agg(built.entries.map((e) => ({ code: e.accountCode, direction: e.direction, amount: e.amount }))), agg(d.entries))) {
          addF({ type: 'CHARGEBACK_ALLOCATION_AMOUNT_MISMATCH', severity: 'CRITICAL', detail: `lançamento da decisão v${d.version} difere da divisão aprovada`, scope: sc, ledgerTransactionId: d.tx.id });
        }
      }
    });
    for (const r of a.recoveries) {
      eventCheck('CHARGEBACK_RECOVERY', r.tx, r.event, r.createdAt, r.id, r.kind === 'RECOVERY' ? `chargeback_recovery:${r.id}` : `chargeback_write_off:${r.id}`);
      if (r.tx && r.tx.status === 'POSTED') {
        const built = buildChargebackRecoveryEntries(orderForCb, r);
        if (built.status !== 'OK' || !sameAgg(agg(built.entries.map((e) => ({ code: e.accountCode, direction: e.direction, amount: e.amount }))), agg(r.entries))) {
          addF({ type: 'CHARGEBACK_RECOVERY_AMOUNT_MISMATCH', severity: 'CRITICAL', detail: `lançamento da ${r.kind === 'RECOVERY' ? 'recuperação' : 'baixa'} ${r.id} difere do registro`, scope: r.id, ledgerTransactionId: r.tx.id });
        }
      }
    }
    const thirdOwed = current ? current.lines.filter((l) => l.partyType === 'THIRD_PARTY').reduce((acc, l) => acc + toMicros(l.amount), 0n) : 0n;
    const settled = a.recoveries.reduce((acc, r) => acc + toMicros(r.amount), 0n);
    if (settled > thirdOwed) addF({ type: 'CHARGEBACK_RECOVERY_EXCEEDS_RECEIVABLE', severity: 'CRITICAL', detail: `recuperações/baixas somam ${settled} micros, acima do recebível de terceiro (${thirdOwed})`, scope: `${a.id}:recov` });
  }

  // --- saldo do BUYER_ESCROW do pedido: retido = total − reembolsos ANTES da liberação; liberado (ou reembolsado depois de liberado) = 0
  const cbBeforeLive = cbView.filter((a) => !a.overlapRefund && a.releaseStage === 'BEFORE_RELEASE');
  const refundsPosted = refundsView.every((r) => r.tx?.status === 'POSTED') && cbBeforeLive.every((a) => a.tx?.status === 'POSTED'); // o que falta já tem achado próprio; não soma ruído
  if ((released ? (v.prTx && v.dcTx) : v.prTx) && refundsPosted) {
    const bal = [...v.prEntries, ...v.dcEntries, ...refundsView.flatMap((r) => r.entries), ...cbBeforeLive.flatMap((a) => a.entries)].filter((e) => e.code === 'BUYER_ESCROW').reduce((s, e) => s + (e.direction === 'CREDIT' ? 1n : -1n) * toMicros(e.amount), 0n);
    const refundedBefore = released ? 0n : refundsView.reduce((s, r) => s + toMicros(r.amount), 0n) + cbBeforeLive.reduce((s, a) => s + toMicros(a.value), 0n);
    const want = released ? 0n : total - refundedBefore;
    if (bal !== want) {
      f.push({ type: 'ESCROW_BALANCE_MISMATCH', severity: 'CRITICAL', detail: `saldo de BUYER_ESCROW do pedido no ledger = ${bal} micros; esperado ${want} (escrow "${o.escrowStatus}")`, expected: want.toString(), actual: bal.toString() });
    }
    // Reembolso PARCIAL antes da liberação: o mecanismo real fecha o Escrow ('refunded') e o restante fica retido sem destino. O ledger mostra exatamente isso.
    if (o.escrowStatus === 'refunded' && !released && bal > 0n) {
      f.push({ type: 'REFUND_PARTIAL_ESCROW_RESIDUAL', severity: 'WARNING', detail: `Escrow fechado como "refunded" mas ${bal} micros do pedido continuam em BUYER_ESCROW (reembolso parcial antes da liberação) — saldo sem destino`, actual: bal.toString() });
    }
  }
  return f;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
/** Carrega, para os pedidos informados, as alocações de chargeback perdido com lançamentos/eventos/decisões/recuperações (somente leitura). */
async function loadChargebackViews(db: any, orderIds: string[]): Promise<Map<string, ChargebackAllocView[]>> {
  const out = new Map<string, ChargebackAllocView[]>();
  if (orderIds.length === 0) return out;
  const inList = sql.join(orderIds.map((i) => sql`${i}`), sql`, `);
  const allocs = rowsOf(await db.execute(sql`SELECT id, chargeback_id, order_id, allocated_value::text AS v, currency, release_stage, overlap_refund, created_at FROM chargeback_allocations WHERE order_id IN (${inList}) ORDER BY id`));
  if (allocs.length === 0) return out;
  const txRows = rowsOf(await db.execute(sql`SELECT id, status, idempotency_key AS k FROM ledger_transactions WHERE order_id IN (${inList}) AND type LIKE 'CHARGEBACK_%'`));
  const evRows = rowsOf(await db.execute(sql`SELECT id, status, idempotency_key AS k, created_at, ledger_transaction_id, last_error_code FROM ledger_outbox_events WHERE order_id IN (${inList}) AND event_type LIKE 'CHARGEBACK_%'`));
  const enRows = rowsOf(await db.execute(sql`SELECT t.idempotency_key AS k, a.code, e.direction, e.amount::text AS amount FROM ledger_entries e JOIN ledger_transactions t ON t.id = e.transaction_id JOIN ledger_accounts a ON a.id = e.account_id WHERE t.order_id IN (${inList}) AND t.type LIKE 'CHARGEBACK_%'`));
  const txBy = new Map<string, TxView>(txRows.map((t: any) => [t.k, { id: t.id, status: t.status }]));
  const evBy = new Map<string, EventView>(evRows.map((e: any) => [e.k, { id: e.id, status: e.status, createdAt: parseUtc(e.created_at), ledgerTransactionId: e.ledger_transaction_id ?? null, lastErrorCode: e.last_error_code ?? null }]));
  const enBy = new Map<string, EntryView[]>();
  for (const e of enRows) enBy.set(e.k, [...(enBy.get(e.k) ?? []), { code: e.code, direction: e.direction, amount: e.amount }]);
  const allocIds = allocs.map((a: any) => a.id);
  const aList = sql.join(allocIds.map((i: string) => sql`${i}`), sql`, `);
  const decRows = rowsOf(await db.execute(sql`SELECT d.id, d.chargeback_id, d.version, d.status, d.created_at, l.allocation_id, l.party_type, l.party_ref, l.amount::text AS amount FROM chargeback_decisions d JOIN chargeback_decision_lines l ON l.decision_id = d.id WHERE l.allocation_id IN (${aList}) AND d.status IN ('APPROVED','SUPERSEDED') ORDER BY d.version`));
  const recRows = rowsOf(await db.execute(sql`SELECT id, allocation_id, kind, party_ref, amount::text AS amount, currency, created_at FROM chargeback_recoveries WHERE allocation_id IN (${aList}) ORDER BY created_at, id`));
  for (const a of allocs) {
    const decisions = new Map<string, ChargebackDecisionView>();
    for (const r of decRows.filter((x: any) => x.allocation_id === a.id)) {
      const d = decisions.get(r.id) ?? { id: r.id, version: Number(r.version), status: r.status, lines: [], createdAt: parseUtc(r.created_at), tx: txBy.get(`chargeback_allocated:${r.id}:${a.id}`) ?? null, event: evBy.get(`chargeback_allocated:${r.id}:${a.id}`) ?? null, entries: enBy.get(`chargeback_allocated:${r.id}:${a.id}`) ?? [] };
      d.lines.push({ partyType: r.party_type, partyRef: r.party_ref ?? null, amount: r.amount }); decisions.set(r.id, d);
    }
    const recoveries: ChargebackRecoveryView[] = recRows.filter((x: any) => x.allocation_id === a.id).map((r: any) => {
      const key = r.kind === 'RECOVERY' ? `chargeback_recovery:${r.id}` : `chargeback_write_off:${r.id}`;
      return { id: r.id, kind: r.kind, partyRef: r.party_ref, amount: r.amount, currency: r.currency, createdAt: parseUtc(r.created_at), tx: txBy.get(key) ?? null, event: evBy.get(key) ?? null, entries: enBy.get(key) ?? [] };
    });
    const key = `chargeback_confirmed:${a.id}`;
    const view: ChargebackAllocView = { id: a.id, chargebackId: a.chargeback_id, value: a.v, currency: a.currency, releaseStage: a.release_stage, overlapRefund: !!a.overlap_refund, createdAt: parseUtc(a.created_at), tx: txBy.get(key) ?? null, event: evBy.get(key) ?? null, entries: enBy.get(key) ?? [], decisions: [...decisions.values()], recoveries };
    out.set(a.order_id, [...(out.get(a.order_id) ?? []), view]);
  }
  return out;
}

export interface ReconcileSummary {
  status: 'OK' | 'DISABLED';
  runId?: string;
  scannedOrders: number;
  truncated: boolean;
  findingsByType: Record<string, number>;
  open: { critical: number; warning: number; info: number };
  newFindings: number;
  resolvedThisRun: number;
  durationMs: number;
}

const rowsOf = (res: any): any[] => (Array.isArray(res) ? res : res?.rows ?? []);
const newId = (p: string) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

export async function runLedgerReconciliation(opts: { maxOrders?: number; pageSize?: number; now?: Date; triggeredBy?: string; env?: Record<string, string | undefined> } = {}): Promise<ReconcileSummary> {
  const started = Date.now();
  const shadow = FinancialLedgerService.getShadowStatus();
  const empty: ReconcileSummary = { status: 'DISABLED', scannedOrders: 0, truncated: false, findingsByType: {}, open: { critical: 0, warning: 0, info: 0 }, newFindings: 0, resolvedThisRun: 0, durationMs: 0 };
  if (!shadow.enabled || !shadow.cutoff) return empty;
  const db: any = getDb(); if (!db) return empty;
  const policy = resolvePolicy(opts.env ?? process.env);
  const now = opts.now ?? new Date();
  const maxOrders = opts.maxOrders ?? 20000; const pageSize = Math.min(opts.pageSize ?? 500, 2000);
  const runId = newId('lrr');
  await db.insert(ledgerReconciliationRuns).values({ id: runId, status: 'RUNNING', triggeredBy: opts.triggeredBy ?? 'system', cutoffAt: shadow.cutoff, startedAt: new Date() });

  try {
    const current = new Map<string, { f: Finding; orderId: string | null }>();
    const scanned = new Set<string>();
    let cursor = ''; let truncated = false;
    while (true) {
      const page = rowsOf(await db.execute(sql`
        SELECT o.id, o.currency, o.total_amount, o.escrow_status, o.created_at, o.updated_at, o.buyer_id, o.seller_id, o.store_id, o.country_code, o.subtotal, o.commission_base,
               o.marketplace_commission, o.seller_net_amount, o.discount_amount, o.shipping_charged_to_buyer, o.shipping_seller_subsidy, o.shipping_marketplace_subsidy, o.customs_duty,
               es.created_at AS escrow_created_at, es.released_at AS escrow_released_at,
               pr.id AS pr_id, pr.status AS pr_status, dc.id AS dc_id, dc.status AS dc_status,
               ep.id AS ep_id, ep.status AS ep_status, ep.created_at AS ep_created, ep.ledger_transaction_id AS ep_tx, ep.last_error_code AS ep_err,
               ed.id AS ed_id, ed.status AS ed_status, ed.created_at AS ed_created, ed.ledger_transaction_id AS ed_tx, ed.last_error_code AS ed_err
          FROM orders o
          LEFT JOIN escrow_accounts es ON es.order_id = o.id
          LEFT JOIN ledger_transactions pr ON pr.idempotency_key = 'payment_received:' || o.id
          LEFT JOIN ledger_transactions dc ON dc.idempotency_key = 'order_release:' || o.id
          LEFT JOIN ledger_outbox_events ep ON ep.idempotency_key = 'payment_received:' || o.id
          LEFT JOIN ledger_outbox_events ed ON ed.idempotency_key = 'order_release:' || o.id
         WHERE o.created_at >= ${shadow.cutoff.toISOString()}::timestamp AND o.payment_status = 'paid' AND o.id > ${cursor}
         ORDER BY o.id LIMIT ${pageSize}`));
      if (page.length === 0) break;
      const ids = page.map((r) => r.id);
      const entryRows = rowsOf(await db.execute(sql`
        SELECT t.idempotency_key AS k, a.code, e.direction, e.amount::text AS amount, t.order_id, t.refund_id
          FROM ledger_entries e JOIN ledger_transactions t ON t.id = e.transaction_id JOIN ledger_accounts a ON a.id = e.account_id
         WHERE t.order_id IN (${sql.join(ids.map((i: string) => sql`${i}`), sql`, `)}) AND t.type IN ('PAYMENT_RECEIVED','ORDER_DELIVERY_CONFIRMED','REFUND_PROCESSED','SHIPPING_COST_REVERSED')`));
      const byOrder = new Map<string, { pr: EntryView[]; dc: EntryView[]; rf: Map<string, EntryView[]>; sr: Map<string, EntryView[]> }>();
      for (const e of entryRows) {
        const slot = byOrder.get(e.order_id) ?? { pr: [], dc: [], rf: new Map<string, EntryView[]>(), sr: new Map<string, EntryView[]>() }; byOrder.set(e.order_id, slot);
        const view: EntryView = { code: e.code, direction: e.direction, amount: e.amount };
        if (String(e.k).startsWith('payment_received:')) slot.pr.push(view);
        else if (String(e.k).startsWith('refund_processed:')) { const rid = e.refund_id ?? String(e.k).slice('refund_processed:'.length); slot.rf.set(rid, [...(slot.rf.get(rid) ?? []), view]); }
        else if (String(e.k).startsWith('shipping_cost_reversed:')) { const sid = String(e.k).slice('shipping_cost_reversed:'.length); slot.sr.set(sid, [...(slot.sr.get(sid) ?? []), view]); }
        else slot.dc.push(view);
      }
      const reversalRows = rowsOf(await db.execute(sql`
        SELECT x.id, x.order_id, x.amount::text AS amount, x.currency, x.subsidy_part::text AS subsidy_part, x.absorbed_part::text AS absorbed_part, x.created_at,
               xt.id AS xt_id, xt.status AS xt_status,
               xe.id AS xe_id, xe.status AS xe_status, xe.created_at AS xe_created, xe.ledger_transaction_id AS xe_tx, xe.last_error_code AS xe_err
          FROM shipping_cost_reversals x
          LEFT JOIN ledger_transactions xt ON xt.idempotency_key = 'shipping_cost_reversed:' || x.id
          LEFT JOIN ledger_outbox_events xe ON xe.idempotency_key = 'shipping_cost_reversed:' || x.id
         WHERE x.order_id IN (${sql.join(ids.map((i: string) => sql`${i}`), sql`, `)})
         ORDER BY x.id`));
      const cbByOrder = await loadChargebackViews(db, ids);
      const reversalsByOrder = new Map<string, any[]>();
      for (const xr of reversalRows) reversalsByOrder.set(xr.order_id, [...(reversalsByOrder.get(xr.order_id) ?? []), xr]);
      const refundRows = rowsOf(await db.execute(sql`
        SELECT r.id, r.order_id, r.amount::text AS amount, r.currency, r.seller_debit_amount::text AS sdebit, r.created_at, r.provider_confirmed_at,
               rt.id AS rt_id, rt.status AS rt_status,
               re.id AS re_id, re.status AS re_status, re.created_at AS re_created, re.ledger_transaction_id AS re_tx, re.last_error_code AS re_err
          FROM refunds r
          LEFT JOIN ledger_transactions rt ON rt.idempotency_key = 'refund_processed:' || r.id
          LEFT JOIN ledger_outbox_events re ON re.idempotency_key = 'refund_processed:' || r.id
         WHERE r.status = 'processed' AND r.order_id IN (${sql.join(ids.map((i: string) => sql`${i}`), sql`, `)})
         ORDER BY r.id`));
      const refundsByOrder = new Map<string, any[]>();
      for (const rr of refundRows) refundsByOrder.set(rr.order_id, [...(refundsByOrder.get(rr.order_id) ?? []), rr]);
      for (const r of page) {
        if (scanned.size >= maxOrders) { truncated = true; break; }
        scanned.add(r.id);
        const ev = (id: any, st: any, created: any, tx: any, err: any): EventView | null => (id ? { id, status: st, createdAt: parseUtc(created), ledgerTransactionId: tx ?? null, lastErrorCode: err ?? null } : null);
        const view: OrderLedgerView = {
          order: {
            id: r.id, currency: r.currency, totalAmount: String(r.total_amount), escrowStatus: r.escrow_status, createdAt: parseUtc(r.created_at), updatedAt: parseUtc(r.updated_at),
            escrowCreatedAt: r.escrow_created_at ? parseUtc(r.escrow_created_at) : null, escrowReleasedAt: r.escrow_released_at ? parseUtc(r.escrow_released_at) : null,
            snapshot: {
              id: r.id, buyerId: r.buyer_id, sellerId: r.seller_id, storeId: r.store_id, countryCode: r.country_code, currency: r.currency, totalAmount: String(r.total_amount),
              subtotal: r.subtotal, commissionBase: r.commission_base, marketplaceCommission: r.marketplace_commission, sellerNetAmount: r.seller_net_amount, discountAmount: r.discount_amount,
              shippingChargedToBuyer: r.shipping_charged_to_buyer, shippingSellerSubsidy: r.shipping_seller_subsidy, shippingMarketplaceSubsidy: r.shipping_marketplace_subsidy, customsDuty: r.customs_duty,
            },
          },
          prTx: r.pr_id ? { id: r.pr_id, status: r.pr_status } : null, dcTx: r.dc_id ? { id: r.dc_id, status: r.dc_status } : null,
          prEvent: ev(r.ep_id, r.ep_status, r.ep_created, r.ep_tx, r.ep_err), dcEvent: ev(r.ed_id, r.ed_status, r.ed_created, r.ed_tx, r.ed_err),
          prEntries: byOrder.get(r.id)?.pr ?? [], dcEntries: byOrder.get(r.id)?.dc ?? [],
          refunds: (refundsByOrder.get(r.id) ?? []).map((rr): RefundLedgerView => ({
            id: rr.id, amount: String(rr.amount), currency: rr.currency, sellerDebitAmount: rr.sdebit ?? null, processedAt: parseUtc(rr.provider_confirmed_at ?? rr.created_at),
            tx: rr.rt_id ? { id: rr.rt_id, status: rr.rt_status } : null, event: ev(rr.re_id, rr.re_status, rr.re_created, rr.re_tx, rr.re_err), entries: byOrder.get(r.id)?.rf.get(rr.id) ?? [],
          })),
          chargebacks: cbByOrder.get(r.id) ?? [],
          reversals: (reversalsByOrder.get(r.id) ?? []).map((xr): ReversalLedgerView => ({
            id: xr.id, amount: String(xr.amount), currency: xr.currency, subsidyPart: String(xr.subsidy_part), absorbedPart: String(xr.absorbed_part), createdAt: parseUtc(xr.created_at),
            tx: xr.xt_id ? { id: xr.xt_id, status: xr.xt_status } : null, event: ev(xr.xe_id, xr.xe_status, xr.xe_created, xr.xe_tx, xr.xe_err), entries: byOrder.get(r.id)?.sr.get(xr.id) ?? [],
          })),
        };
        for (const f of evaluateOrder(view, now, policy.staleMinutes)) current.set(`${f.type}:${r.id}${f.scope ? `:${f.scope}` : ''}`, { f, orderId: r.id });
      }
      cursor = page[page.length - 1].id;
      if (truncated || page.length < pageSize) break;
    }

    // E5 — por chargeback (fora do escopo de pedido): perdido sem nenhum pedido alocado, ou valor do provedor diferente do alocado
    const lostRows = rowsOf(await db.execute(sql`
      SELECT c.id, c.value::text AS value, coalesce(sum(a.allocated_value), 0)::text AS alloc_sum, count(a.id)::int AS n_alloc
        FROM payment_chargebacks c LEFT JOIN chargeback_allocations a ON a.chargeback_id = c.id
       WHERE c.local_status = 'lost' AND c.created_at >= ${shadow.cutoff.toISOString()}::timestamp
       GROUP BY c.id, c.value`));
    for (const c of lostRows) {
      if (c.n_alloc === 0) current.set(`CHARGEBACK_LOST_WITHOUT_ALLOCATION:${c.id}`, { f: { type: 'CHARGEBACK_LOST_WITHOUT_ALLOCATION', severity: 'CRITICAL', detail: `chargeback ${c.id} perdido (${c.value}) sem nenhum pedido alocado — o valor debitado pelo provedor não está no ledger`, scope: c.id }, orderId: null });
      else if (toMicros(c.alloc_sum) !== toMicros(c.value)) current.set(`CHARGEBACK_VALUE_MISMATCH:${c.id}`, { f: { type: 'CHARGEBACK_VALUE_MISMATCH', severity: 'CRITICAL', detail: `valor atual do provedor (${c.value}) difere do alocado (${c.alloc_sum}) — alocações são imutáveis; revisão humana`, scope: c.id }, orderId: null });
    }

    // E8b — saques criados em/depois do cutoff (sem backfill de saques anteriores): solicitação sempre; conclusão/falha só quando o saque está nesse estado
    const payoutRows = rowsOf(await db.execute(sql`
      SELECT p.id, p.seller_id, p.amount::text AS amount, p.currency, p.status, p.created_at, p.processed_at,
             rq.id AS rq_id, rq.status AS rq_status, rqe.id AS rqe_id, rqe.status AS rqe_status, rqe.created_at AS rqe_created, rqe.ledger_transaction_id AS rqe_tx, rqe.last_error_code AS rqe_err,
             cp.id AS cp_id, cp.status AS cp_status, cpe.id AS cpe_id, cpe.status AS cpe_status, cpe.created_at AS cpe_created, cpe.ledger_transaction_id AS cpe_tx, cpe.last_error_code AS cpe_err,
             fl.id AS fl_id, fl.status AS fl_status, fle.id AS fle_id, fle.status AS fle_status, fle.created_at AS fle_created, fle.ledger_transaction_id AS fle_tx, fle.last_error_code AS fle_err
        FROM seller_payouts p
        LEFT JOIN ledger_transactions rq ON rq.idempotency_key = 'payout_requested:' || p.id LEFT JOIN ledger_outbox_events rqe ON rqe.idempotency_key = 'payout_requested:' || p.id
        LEFT JOIN ledger_transactions cp ON cp.idempotency_key = 'payout_completed:' || p.id LEFT JOIN ledger_outbox_events cpe ON cpe.idempotency_key = 'payout_completed:' || p.id
        LEFT JOIN ledger_transactions fl ON fl.idempotency_key = 'payout_failed:' || p.id LEFT JOIN ledger_outbox_events fle ON fle.idempotency_key = 'payout_failed:' || p.id
       WHERE p.created_at >= ${shadow.cutoff.toISOString()}::timestamp ORDER BY p.id LIMIT ${maxOrders}`));
    if (payoutRows.length > 0) {
      const pEntryRows = rowsOf(await db.execute(sql`
        SELECT t.idempotency_key AS k, t.payout_id, a.code, e.direction, e.amount::text AS amount
          FROM ledger_entries e JOIN ledger_transactions t ON t.id = e.transaction_id JOIN ledger_accounts a ON a.id = e.account_id
         WHERE t.payout_id IN (${sql.join(payoutRows.map((r: any) => sql`${r.id}`), sql`, `)}) AND t.type IN ('PAYOUT_REQUESTED','PAYOUT_COMPLETED','PAYOUT_FAILED')`));
      const entriesBy = new Map<string, PEntry[]>();
      for (const e of pEntryRows) { const k = String(e.k); entriesBy.set(k, [...(entriesBy.get(k) ?? []), { code: e.code, direction: e.direction, amount: e.amount }]); }
      const pev = (id: any, st: any, created: any, tx: any, err: any) => (id ? { id, status: st, createdAt: parseUtc(created), ledgerTransactionId: tx ?? null, lastErrorCode: err ?? null } : null);
      for (const r of payoutRows) {
        const stage = (prefix: string, txId: any, txSt: any, evId: any, evSt: any, evCreated: any, evTx: any, evErr: any): PayoutStageView => ({
          tx: txId ? { id: txId, status: txSt } : null, event: pev(evId, evSt, evCreated, evTx, evErr), entries: entriesBy.get(`${prefix}:${r.id}`) ?? [],
        });
        const view: PayoutLedgerView = {
          payout: { id: r.id, sellerId: r.seller_id, amount: String(r.amount), currency: r.currency, status: r.status, createdAt: parseUtc(r.created_at), processedAt: r.processed_at ? parseUtc(r.processed_at) : null },
          requested: stage('payout_requested', r.rq_id, r.rq_status, r.rqe_id, r.rqe_status, r.rqe_created, r.rqe_tx, r.rqe_err),
          completed: stage('payout_completed', r.cp_id, r.cp_status, r.cpe_id, r.cpe_status, r.cpe_created, r.cpe_tx, r.cpe_err),
          failed: stage('payout_failed', r.fl_id, r.fl_status, r.fle_id, r.fle_status, r.fle_created, r.fle_tx, r.fle_err),
        };
        for (const f of evaluatePayout(view, now, policy.staleMinutes)) current.set(`${f.type}:payout:${r.id}`, { f: f as Finding, orderId: null });
      }
    }

    // persistência: upsert por fingerprint; o que sumiu (e foi escaneado numa varredura COMPLETA) vira RESOLVED — com histórico
    const open: any[] = rowsOf(await db.execute(sql`SELECT id, fingerprint, status, order_id FROM ledger_reconciliation_findings WHERE status <> 'RESOLVED'`));
    const openByFp = new Map<string, any>(open.map((r) => [r.fingerprint, r]));
    let newFindings = 0; let resolved = 0; const t = now.toISOString();
    for (const [fp, { f, orderId }] of current) {
      const ex = openByFp.get(fp);
      if (ex) {
        await db.execute(sql`UPDATE ledger_reconciliation_findings SET seen_count = seen_count + 1, last_seen_run_id = ${runId}, last_seen_at = ${t}::timestamp, severity = ${f.severity}, detail = ${f.detail}, expected_json = ${JSON.stringify(f.expected ?? null)}::jsonb, actual_json = ${JSON.stringify(f.actual ?? null)}::jsonb WHERE id = ${ex.id}`);
      } else {
        newFindings++;
        await db.insert(ledgerReconciliationFindings).values({ id: newId('lrf'), fingerprint: fp, findingType: f.type, severity: f.severity, orderId, eventId: f.eventId ?? null, ledgerTransactionId: f.ledgerTransactionId ?? null, expectedJson: f.expected ?? null, actualJson: f.actual ?? null, detail: f.detail, status: 'OPEN', seenCount: 1, firstSeenRunId: runId, lastSeenRunId: runId, firstSeenAt: now, lastSeenAt: now });
      }
    }
    if (!truncated) {
      for (const [fp, ex] of openByFp) {
        if (current.has(fp)) continue;
        if (ex.order_id && !scanned.has(ex.order_id)) continue; // pedido fora do escopo desta varredura: não se conclui nada
        resolved++;
        await db.execute(sql`UPDATE ledger_reconciliation_findings SET status = 'RESOLVED', resolved_at = ${t}::timestamp, resolved_by_run_id = ${runId} WHERE id = ${ex.id}`);
      }
    }
    const findingsByType: Record<string, number> = {}; for (const { f } of current.values()) findingsByType[f.type] = (findingsByType[f.type] ?? 0) + 1;
    const counts = rowsOf(await db.execute(sql`SELECT severity, count(*)::int AS n FROM ledger_reconciliation_findings WHERE status <> 'RESOLVED' GROUP BY severity`));
    const sev = (s: string) => counts.find((c) => c.severity === s)?.n ?? 0;
    const summary: ReconcileSummary = { status: 'OK', runId, scannedOrders: scanned.size, truncated, findingsByType, open: { critical: sev('CRITICAL'), warning: sev('WARNING'), info: sev('INFO') }, newFindings, resolvedThisRun: resolved, durationMs: Date.now() - started };
    await db.update(ledgerReconciliationRuns).set({ status: 'COMPLETED', scannedOrders: scanned.size, openFindings: summary.open.critical + summary.open.warning + summary.open.info, summaryJson: summary as any, finishedAt: new Date() }).where(eq(ledgerReconciliationRuns.id, runId));
    const lvl = summary.open.critical > 0 ? 'error' : summary.open.warning > 0 ? 'warn' : 'info';
    (logger as any)[lvl]({ runId, ...summary }, `[LedgerReconciliation] concluída: ${summary.open.critical} críticas, ${summary.open.warning} avisos, ${summary.open.info} informativas abertas`);
    return summary;
  } catch (err: any) {
    await db.update(ledgerReconciliationRuns).set({ status: 'FAILED', errorMessage: String(err?.message ?? err).slice(0, 1000), finishedAt: new Date() }).where(eq(ledgerReconciliationRuns.id, runId)).catch(() => {});
    logger.error({ runId, error: err?.message }, '[LedgerReconciliation] falhou');
    throw err;
  }
}

/** Reconhecimento humano de uma divergência (não a resolve: ela continua visível como ACKNOWLEDGED, com autor e nota). */
export async function acknowledgeFinding(input: { findingId: string; actorUserId: string; note: string }): Promise<void> {
  if (!input.note || input.note.trim().length < 10) throw new OutboxAdminError('REASON_REQUIRED', 'Informe uma justificativa (mínimo 10 caracteres).');
  const db: any = getDb(); if (!db) throw new Error('Banco de dados indisponível.');
  await db.transaction(async (tx: any) => {
    const [u] = await tx.select({ role: users.role }).from(users).where(eq(users.id, input.actorUserId)).limit(1);
    if (!u || String(u.role).toUpperCase() !== 'GLOBAL_ADMIN') throw new OutboxAdminError('FORBIDDEN', 'Somente GLOBAL_ADMIN pode reconhecer divergências do ledger.');
    const [f] = await tx.select().from(ledgerReconciliationFindings).where(eq(ledgerReconciliationFindings.id, input.findingId)).for('update').limit(1);
    if (!f) throw new OutboxAdminError('NOT_FOUND', 'Divergência não encontrada.');
    if (f.status !== 'OPEN') throw new OutboxAdminError('INVALID_STATE', `Divergência em ${f.status}.`);
    await tx.update(ledgerReconciliationFindings).set({ status: 'ACKNOWLEDGED', acknowledgedBy: input.actorUserId, acknowledgeNote: input.note.trim() }).where(eq(ledgerReconciliationFindings.id, f.id));
    await tx.insert(auditLogs).values({ id: newId('aud'), actorUserId: input.actorUserId, action: 'ledger.reconciliation.acknowledge', resource: 'ledger_reconciliation_finding', resourceId: f.id, detailsJson: { note: input.note.trim(), findingType: f.findingType, orderId: f.orderId, severity: f.severity }, createdAt: new Date() });
  });
}

export interface RepairCandidate { orderId?: string; payoutId?: string; eventType: 'PAYMENT_RECEIVED' | 'ORDER_DELIVERY_CONFIRMED' | 'REFUND_PROCESSED' | 'SHIPPING_COST_REVERSED' | 'CHARGEBACK_CONFIRMED' | 'CHARGEBACK_ALLOCATED' | 'CHARGEBACK_RECOVERY' | 'CHARGEBACK_WRITE_OFF' | 'PAYOUT_REQUESTED' | 'PAYOUT_COMPLETED' | 'PAYOUT_FAILED'; occurredAt: Date; refundId?: string; reversalId?: string; chargebackSubjectId?: string }
export interface RepairResult { dryRun: boolean; candidates: RepairCandidate[]; enqueued: number; existing: number; failed: number }

/**
 * Cria os eventos que FALTAM (pedido em escopo, sem lançamento e sem evento) — a ÚNICA forma de "backfill", sempre manual e auditada. Respeita o cutoff
 * (enqueueLedgerEvent recusa pedido anterior). Por padrão é dry-run. A hora do evento vem do fato real (Escrow criado / liberado), nunca de "agora".
 */
export async function repairMissingEvents(input: { actorUserId: string; dryRun?: boolean; limit?: number }): Promise<RepairResult> {
  const dryRun = input.dryRun !== false;
  const db: any = getDb(); if (!db) throw new Error('Banco de dados indisponível.');
  const shadow = FinancialLedgerService.getShadowStatus();
  if (!shadow.enabled || !shadow.cutoff) return { dryRun, candidates: [], enqueued: 0, existing: 0, failed: 0 };
  const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, input.actorUserId)).limit(1);
  if (!u || String(u.role).toUpperCase() !== 'GLOBAL_ADMIN') throw new OutboxAdminError('FORBIDDEN', 'Somente GLOBAL_ADMIN pode reparar eventos do outbox do ledger.');
  const limit = Math.min(input.limit ?? 200, 1000);
  const rows = rowsOf(await db.execute(sql`
    SELECT o.id, o.escrow_status, es.created_at AS escrow_created_at, es.released_at, o.updated_at,
           (pr.id IS NULL AND ep.id IS NULL) AS miss_pr, (o.escrow_status = 'released' AND dc.id IS NULL AND ed.id IS NULL) AS miss_dc
      FROM orders o
      LEFT JOIN escrow_accounts es ON es.order_id = o.id
      LEFT JOIN ledger_transactions pr ON pr.idempotency_key = 'payment_received:' || o.id
      LEFT JOIN ledger_transactions dc ON dc.idempotency_key = 'order_release:' || o.id
      LEFT JOIN ledger_outbox_events ep ON ep.idempotency_key = 'payment_received:' || o.id
      LEFT JOIN ledger_outbox_events ed ON ed.idempotency_key = 'order_release:' || o.id
     WHERE o.created_at >= ${shadow.cutoff.toISOString()}::timestamp AND o.payment_status = 'paid'
       AND ((pr.id IS NULL AND ep.id IS NULL) OR (o.escrow_status = 'released' AND dc.id IS NULL AND ed.id IS NULL))
     ORDER BY o.id LIMIT ${limit}`));
  const candidates: RepairCandidate[] = [];
  for (const r of rows) {
    if (r.miss_pr) candidates.push({ orderId: r.id, eventType: 'PAYMENT_RECEIVED', occurredAt: parseUtc(r.escrow_created_at ?? r.updated_at) });
    if (r.miss_dc) candidates.push({ orderId: r.id, eventType: 'ORDER_DELIVERY_CONFIRMED', occurredAt: parseUtc(r.released_at ?? r.updated_at) });
  }
  // E3 — reembolsos CONCLUÍDOS, em escopo, sem lançamento e sem evento (a hora vem do fato real: confirmação do provedor / criação do reembolso)
  const refundRows = rowsOf(await db.execute(sql`
    SELECT r.id AS refund_id, r.order_id, r.created_at, r.provider_confirmed_at
      FROM refunds r
      JOIN orders o ON o.id = r.order_id
      LEFT JOIN ledger_transactions rt ON rt.idempotency_key = 'refund_processed:' || r.id
      LEFT JOIN ledger_outbox_events re ON re.idempotency_key = 'refund_processed:' || r.id
     WHERE r.status = 'processed' AND o.created_at >= ${shadow.cutoff.toISOString()}::timestamp AND o.payment_status = 'paid' AND rt.id IS NULL AND re.id IS NULL
     ORDER BY r.id LIMIT ${limit}`));
  for (const r of refundRows) candidates.push({ orderId: r.order_id, eventType: 'REFUND_PROCESSED', refundId: r.refund_id, occurredAt: parseUtc(r.provider_confirmed_at ?? r.created_at) });
  // E4 — reversões de frete REGISTRADAS, em escopo, sem lançamento e sem evento (hora = a do registro imutável)
  const reversalRows = rowsOf(await db.execute(sql`
    SELECT x.id AS reversal_id, x.order_id, x.created_at
      FROM shipping_cost_reversals x
      JOIN orders o ON o.id = x.order_id
      LEFT JOIN ledger_transactions xt ON xt.idempotency_key = 'shipping_cost_reversed:' || x.id
      LEFT JOIN ledger_outbox_events xe ON xe.idempotency_key = 'shipping_cost_reversed:' || x.id
     WHERE o.created_at >= ${shadow.cutoff.toISOString()}::timestamp AND o.payment_status = 'paid' AND xt.id IS NULL AND xe.id IS NULL
     ORDER BY x.id LIMIT ${limit}`));
  for (const x of reversalRows) candidates.push({ orderId: x.order_id, eventType: 'SHIPPING_COST_REVERSED', reversalId: x.reversal_id, occurredAt: parseUtc(x.created_at) });
  // E5 — chargebacks: alocação perdida sem evento/lançamento; decisão aprovada sem evento/lançamento; recuperação/baixa sem evento/lançamento
  const cbConf = rowsOf(await db.execute(sql`
    SELECT a.id, a.order_id, a.created_at FROM chargeback_allocations a
      JOIN orders o ON o.id = a.order_id JOIN payment_chargebacks c ON c.id = a.chargeback_id
      LEFT JOIN ledger_transactions t ON t.idempotency_key = 'chargeback_confirmed:' || a.id LEFT JOIN ledger_outbox_events e ON e.idempotency_key = 'chargeback_confirmed:' || a.id
     WHERE c.local_status = 'lost' AND a.overlap_refund = false AND o.created_at >= ${shadow.cutoff.toISOString()}::timestamp AND t.id IS NULL AND e.id IS NULL ORDER BY a.id LIMIT ${limit}`));
  for (const x of cbConf) candidates.push({ orderId: x.order_id, eventType: 'CHARGEBACK_CONFIRMED', chargebackSubjectId: x.id, occurredAt: parseUtc(x.created_at) });
  const cbAlloc = rowsOf(await db.execute(sql`
    SELECT DISTINCT d.id AS decision_id, l.allocation_id, a.order_id, d.approved_at FROM chargeback_decisions d
      JOIN chargeback_decision_lines l ON l.decision_id = d.id JOIN chargeback_allocations a ON a.id = l.allocation_id JOIN orders o ON o.id = a.order_id
      LEFT JOIN ledger_transactions t ON t.idempotency_key = 'chargeback_allocated:' || d.id || ':' || l.allocation_id LEFT JOIN ledger_outbox_events e ON e.idempotency_key = 'chargeback_allocated:' || d.id || ':' || l.allocation_id
     WHERE d.status IN ('APPROVED','SUPERSEDED') AND o.created_at >= ${shadow.cutoff.toISOString()}::timestamp AND t.id IS NULL AND e.id IS NULL ORDER BY d.id, l.allocation_id LIMIT ${limit}`));
  for (const x of cbAlloc) candidates.push({ orderId: x.order_id, eventType: 'CHARGEBACK_ALLOCATED', chargebackSubjectId: `${x.decision_id}:${x.allocation_id}`, occurredAt: parseUtc(x.approved_at) });
  const cbRec = rowsOf(await db.execute(sql`
    SELECT r.id, r.kind, a.order_id, r.created_at FROM chargeback_recoveries r JOIN chargeback_allocations a ON a.id = r.allocation_id JOIN orders o ON o.id = a.order_id
      LEFT JOIN ledger_transactions t ON t.idempotency_key = (CASE WHEN r.kind = 'RECOVERY' THEN 'chargeback_recovery:' ELSE 'chargeback_write_off:' END) || r.id
      LEFT JOIN ledger_outbox_events e ON e.idempotency_key = (CASE WHEN r.kind = 'RECOVERY' THEN 'chargeback_recovery:' ELSE 'chargeback_write_off:' END) || r.id
     WHERE o.created_at >= ${shadow.cutoff.toISOString()}::timestamp AND t.id IS NULL AND e.id IS NULL ORDER BY r.id LIMIT ${limit}`));
  for (const x of cbRec) candidates.push({ orderId: x.order_id, eventType: x.kind === 'RECOVERY' ? 'CHARGEBACK_RECOVERY' : 'CHARGEBACK_WRITE_OFF', chargebackSubjectId: x.id, occurredAt: parseUtc(x.created_at) });
  // E8b — saques em escopo (criados em/depois do cutoff) sem lançamento e sem evento: solicitação; conclusão (se concluído); falha (se falho). Hora = a do fato gravado no saque.
  const payoutRepair = rowsOf(await db.execute(sql`
    SELECT p.id, p.status, p.created_at, p.processed_at,
           (rq.id IS NULL AND rqe.id IS NULL) AS miss_rq, (p.status = 'completed' AND cp.id IS NULL AND cpe.id IS NULL) AS miss_cp, (p.status = 'failed' AND fl.id IS NULL AND fle.id IS NULL) AS miss_fl
      FROM seller_payouts p
      LEFT JOIN ledger_transactions rq ON rq.idempotency_key = 'payout_requested:' || p.id LEFT JOIN ledger_outbox_events rqe ON rqe.idempotency_key = 'payout_requested:' || p.id
      LEFT JOIN ledger_transactions cp ON cp.idempotency_key = 'payout_completed:' || p.id LEFT JOIN ledger_outbox_events cpe ON cpe.idempotency_key = 'payout_completed:' || p.id
      LEFT JOIN ledger_transactions fl ON fl.idempotency_key = 'payout_failed:' || p.id LEFT JOIN ledger_outbox_events fle ON fle.idempotency_key = 'payout_failed:' || p.id
     WHERE p.created_at >= ${shadow.cutoff.toISOString()}::timestamp
       AND ((rq.id IS NULL AND rqe.id IS NULL) OR (p.status = 'completed' AND cp.id IS NULL AND cpe.id IS NULL) OR (p.status = 'failed' AND fl.id IS NULL AND fle.id IS NULL))
     ORDER BY p.id LIMIT ${limit}`));
  for (const x of payoutRepair) {
    if (x.miss_rq) candidates.push({ payoutId: x.id, eventType: 'PAYOUT_REQUESTED', occurredAt: parseUtc(x.created_at) });
    if (x.miss_cp) candidates.push({ payoutId: x.id, eventType: 'PAYOUT_COMPLETED', occurredAt: parseUtc(x.processed_at ?? x.created_at) });
    if (x.miss_fl) candidates.push({ payoutId: x.id, eventType: 'PAYOUT_FAILED', occurredAt: parseUtc(x.created_at) });
  }
  const result: RepairResult = { dryRun, candidates, enqueued: 0, existing: 0, failed: 0 };
  if (dryRun || candidates.length === 0) return result;
  const { orders, refunds, escrowAccounts, shippingCostReversals } = await import('../../../../db/schema.js');
  for (const c of candidates) {
    if (c.payoutId) {
      const { sellerPayouts } = await import('../../../../db/schema.js');
      const [pr] = await db.select().from(sellerPayouts).where(eq(sellerPayouts.id, c.payoutId)).limit(1);
      if (!pr) { result.failed++; continue; }
      const rr = await enqueuePayoutLedgerEvent(db, { eventType: c.eventType as any, payout: { id: pr.id, sellerId: pr.sellerId, amount: String(pr.amount), currency: pr.currency, method: pr.method, createdAt: pr.createdAt, processedAt: pr.processedAt, transactionRef: pr.transactionRef }, occurredAt: c.occurredAt, source: 'reconciliation_repair' });
      if (rr.status === 'ENQUEUED') result.enqueued++; else if (rr.status === 'EXISTS') result.existing++; else result.failed++;
      continue;
    }
    const [order] = await db.select().from(orders).where(eq(orders.id, c.orderId!)).limit(1);
    let refund: any;
    let reversal: any;
    if (c.eventType === 'SHIPPING_COST_REVERSED') {
      const [rv] = await db.select().from(shippingCostReversals).where(eq(shippingCostReversals.id, c.reversalId!)).limit(1);
      if (!rv) { result.failed++; continue; }
      reversal = { id: rv.id, refundId: rv.refundId, amount: rv.amount, currency: rv.currency, subsidyPart: rv.subsidyPart, absorbedPart: rv.absorbedPart };
    }
    if (c.eventType === 'REFUND_PROCESSED') {
      const [rf] = await db.select().from(refunds).where(eq(refunds.id, c.refundId!)).limit(1);
      const [es] = await db.select({ releasedAt: escrowAccounts.releasedAt }).from(escrowAccounts).where(eq(escrowAccounts.orderId, c.orderId)).limit(1);
      if (!rf || !es) { result.failed++; continue; }
      refund = { id: rf.id, paymentId: rf.paymentId, amount: rf.amount, currency: rf.currency, sellerDebitAmount: rf.sellerDebitAmount, releaseStage: es.releasedAt ? 'AFTER_RELEASE' : 'BEFORE_RELEASE' };
    }
    const res = await enqueueLedgerEvent(db, { eventType: c.eventType, order, refund, reversal, chargebackSubjectId: c.chargebackSubjectId, occurredAt: c.occurredAt, source: 'reconciliation_repair' });
    if (res.status === 'ENQUEUED') result.enqueued++; else if (res.status === 'EXISTS') result.existing++; else result.failed++;
  }
  await db.insert(auditLogs).values({ id: newId('aud'), actorUserId: input.actorUserId, action: 'ledger.outbox.repair_missing_events', resource: 'ledger_outbox_event', resourceId: null, detailsJson: { enqueued: result.enqueued, existing: result.existing, failed: result.failed, orderIds: candidates.map((c) => `${c.eventType}:${c.chargebackSubjectId ?? c.reversalId ?? c.refundId ?? c.orderId}`).slice(0, 200) }, createdAt: new Date() });
  return result;
}

export async function getReconciliationMetrics(): Promise<{ open: { critical: number; warning: number; info: number }; acknowledged: number; byType: Record<string, number>; lastRun: any }> {
  const db: any = getDb(); if (!db) throw new Error('Banco de dados indisponível.');
  const sev = rowsOf(await db.execute(sql`SELECT severity, count(*)::int AS n FROM ledger_reconciliation_findings WHERE status = 'OPEN' GROUP BY severity`));
  const g = (s: string) => sev.find((c) => c.severity === s)?.n ?? 0;
  const ack = rowsOf(await db.execute(sql`SELECT count(*)::int AS n FROM ledger_reconciliation_findings WHERE status = 'ACKNOWLEDGED'`))[0]?.n ?? 0;
  const byType: Record<string, number> = {}; for (const r of rowsOf(await db.execute(sql`SELECT finding_type, count(*)::int AS n FROM ledger_reconciliation_findings WHERE status <> 'RESOLVED' GROUP BY finding_type`))) byType[r.finding_type] = r.n;
  const lastRun = rowsOf(await db.execute(sql`SELECT id, status, scanned_orders, open_findings, started_at, finished_at FROM ledger_reconciliation_runs ORDER BY started_at DESC LIMIT 1`))[0] ?? null;
  return { open: { critical: g('CRITICAL'), warning: g('WARNING'), info: g('INFO') }, acknowledged: ack, byType, lastRun };
}
