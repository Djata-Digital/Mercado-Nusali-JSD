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
import { toMicros } from '../decimal.js';
import { resolvePolicy } from './outboxEvents.js';
import { enqueueLedgerEvent, parseUtc, OutboxAdminError } from './outboxService.js';

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
export interface OrderLedgerView {
  order: OrderView; prTx: TxView | null; dcTx: TxView | null; prEvent: EventView | null; dcEvent: EventView | null; prEntries: EntryView[]; dcEntries: EntryView[];
  refunds?: RefundLedgerView[];
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

  const eventCheck = (kind: 'PAYMENT' | 'DELIVERY' | 'REFUND', tx: TxView | null, ev: EventView | null, since: Date, scope?: string, key?: string) => {
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

  // --- saldo do BUYER_ESCROW do pedido: retido = total − reembolsos ANTES da liberação; liberado (ou reembolsado depois de liberado) = 0
  const refundsPosted = refundsView.every((r) => r.tx?.status === 'POSTED'); // reembolso sem lançamento já tem achado próprio; não soma ruído
  if ((released ? (v.prTx && v.dcTx) : v.prTx) && refundsPosted) {
    const bal = [...v.prEntries, ...v.dcEntries, ...refundsView.flatMap((r) => r.entries)].filter((e) => e.code === 'BUYER_ESCROW').reduce((s, e) => s + (e.direction === 'CREDIT' ? 1n : -1n) * toMicros(e.amount), 0n);
    const refundedBefore = released ? 0n : refundsView.reduce((s, r) => s + toMicros(r.amount), 0n);
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
         WHERE t.order_id IN (${sql.join(ids.map((i: string) => sql`${i}`), sql`, `)}) AND t.type IN ('PAYMENT_RECEIVED','ORDER_DELIVERY_CONFIRMED','REFUND_PROCESSED')`));
      const byOrder = new Map<string, { pr: EntryView[]; dc: EntryView[]; rf: Map<string, EntryView[]> }>();
      for (const e of entryRows) {
        const slot = byOrder.get(e.order_id) ?? { pr: [], dc: [], rf: new Map<string, EntryView[]>() }; byOrder.set(e.order_id, slot);
        const view: EntryView = { code: e.code, direction: e.direction, amount: e.amount };
        if (String(e.k).startsWith('payment_received:')) slot.pr.push(view);
        else if (String(e.k).startsWith('refund_processed:')) { const rid = e.refund_id ?? String(e.k).slice('refund_processed:'.length); slot.rf.set(rid, [...(slot.rf.get(rid) ?? []), view]); }
        else slot.dc.push(view);
      }
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
        };
        for (const f of evaluateOrder(view, now, policy.staleMinutes)) current.set(`${f.type}:${r.id}${f.scope ? `:${f.scope}` : ''}`, { f, orderId: r.id });
      }
      cursor = page[page.length - 1].id;
      if (truncated || page.length < pageSize) break;
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

export interface RepairCandidate { orderId: string; eventType: 'PAYMENT_RECEIVED' | 'ORDER_DELIVERY_CONFIRMED' | 'REFUND_PROCESSED'; occurredAt: Date; refundId?: string }
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
  const result: RepairResult = { dryRun, candidates, enqueued: 0, existing: 0, failed: 0 };
  if (dryRun || candidates.length === 0) return result;
  const { orders, refunds, escrowAccounts } = await import('../../../../db/schema.js');
  for (const c of candidates) {
    const [order] = await db.select().from(orders).where(eq(orders.id, c.orderId)).limit(1);
    let refund: any;
    if (c.eventType === 'REFUND_PROCESSED') {
      const [rf] = await db.select().from(refunds).where(eq(refunds.id, c.refundId!)).limit(1);
      const [es] = await db.select({ releasedAt: escrowAccounts.releasedAt }).from(escrowAccounts).where(eq(escrowAccounts.orderId, c.orderId)).limit(1);
      if (!rf || !es) { result.failed++; continue; }
      refund = { id: rf.id, paymentId: rf.paymentId, amount: rf.amount, currency: rf.currency, sellerDebitAmount: rf.sellerDebitAmount, releaseStage: es.releasedAt ? 'AFTER_RELEASE' : 'BEFORE_RELEASE' };
    }
    const res = await enqueueLedgerEvent(db, { eventType: c.eventType, order, refund, occurredAt: c.occurredAt, source: 'reconciliation_repair' });
    if (res.status === 'ENQUEUED') result.enqueued++; else if (res.status === 'EXISTS') result.existing++; else result.failed++;
  }
  await db.insert(auditLogs).values({ id: newId('aud'), actorUserId: input.actorUserId, action: 'ledger.outbox.repair_missing_events', resource: 'ledger_outbox_event', resourceId: null, detailsJson: { enqueued: result.enqueued, existing: result.existing, failed: result.failed, orderIds: candidates.map((c) => `${c.eventType}:${c.refundId ?? c.orderId}`).slice(0, 200) }, createdAt: new Date() });
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
