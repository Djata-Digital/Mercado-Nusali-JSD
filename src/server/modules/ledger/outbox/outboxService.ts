/**
 * LEDGER SOMBRA — E2: OUTBOX TRANSACIONAL.
 *
 * Garantias (cada uma coberta por teste de integração em tests/ledger-e2-outbox.test.ts):
 *  1. Atomicidade: o evento é gravado na MESMA transação que confirma o fato financeiro (pagamento / liberação do Escrow), dentro de um SAVEPOINT — se a
 *     gravação do outbox falhar, a confirmação financeira NÃO é derrubada (o ledger sombra nunca bloqueia dinheiro real); a falha é logada e coberta por
 *     fallback direto + reconciliação. Modo estrito opcional (LEDGER_OUTBOX_STRICT=true) faz o oposto.
 *  2. Idempotência: chave determinística = a do lançamento do ledger (UNIQUE no outbox E no ledger). Enfileirar duas vezes = 1 evento; processar duas vezes = 1 lançamento.
 *  3. Recuperação: o processador reclama eventos com SELECT … FOR UPDATE SKIP LOCKED + lease; worker que cai deixa o lease expirar e outro assume. Nada se perde.
 *  4. Retry com backoff exponencial e teto; esgotadas as tentativas (ou erro permanente) => NEEDS_INTERVENTION, visível, nunca descartado.
 *  5. Snapshot: o pedido é comparado (hash) com o snapshot do enfileiramento; divergência => NEEDS_INTERVENTION, nunca "corrigida".
 *  6. Respeito ao cutoff: só enfileira com o ledger sombra ligado e pedido criado em/depois do LEDGER_SHADOW_CUTOFF_AT. Sem backfill automático.
 *  7. Nenhum saldo real é lido ou escrito aqui: só as tabelas ledger_* e audit_logs.
 */
import os from 'os';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '../../../../db/index.js';
import { ledgerOutboxEvents, orders, refunds, shippingCostReversals, users, auditLogs } from '../../../../db/schema.js';
import { logger } from '../../../infra/logger.js';
import { FinancialLedgerService, type ShadowLedgerStatus } from '../financialLedgerService.js';
import { isChargebackEvent, chargebackEventKey, loadChargebackSubject, buildChargebackEventSnapshot } from './chargebackSubjects.js';
import {
  buildOrderSnapshot, buildRefundSnapshot, buildReversalSnapshot, hashSnapshot, diffSnapshots, keyFor, refundProcessedKey, shippingCostReversedKey, classifyProcessingError, mapLedgerResult, computeBackoffSeconds, resolvePolicy,
  isOutboxEnabled, isOutboxStrict, type OutboxEventType, type OrderRowForSnapshot, type OutboxPolicy, type RefundReleaseStage,
} from './outboxEvents.js';

/** E3 — dados do reembolso CONCLUÍDO (obrigatório para eventType REFUND_PROCESSED). releaseStage é o fato "antes/depois da liberação" no momento do reembolso. */
export interface EnqueueRefundInput { id: string; paymentId: string; amount: string | number; currency: string; sellerDebitAmount: string | number | null; releaseStage: RefundReleaseStage }

/** E4 — reversão de custo de frete já REGISTRADA (obrigatório para eventType SHIPPING_COST_REVERSED). */
export interface EnqueueReversalInput { id: string; refundId: string; amount: string | number; currency: string; subsidyPart: string | number; absorbedPart: string | number }

export interface EnqueueInput {
  eventType: OutboxEventType;
  order: OrderRowForSnapshot;
  refund?: EnqueueRefundInput;
  reversal?: EnqueueReversalInput;
  /** E5 — id do assunto do evento de chargeback (alocação | `${decisão}:${alocação}` | recuperação), já gravado na transação do chamador */
  chargebackSubjectId?: string;
  paymentId?: string | null;
  purchaseGroupId?: string | null;
  /** hora do fato financeiro (confirmação do pagamento / liberação) — vira occurredAt do lançamento */
  occurredAt: Date;
  source: string;
}

export type EnqueueResult =
  | { status: 'ENQUEUED'; eventId: string }
  | { status: 'EXISTS'; eventId: string }
  | { status: 'DISABLED' | 'NOT_ELIGIBLE'; reason: string }
  | { status: 'FAILED'; reason: string };

const newId = () => `lob_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
const iso = (d: Date) => d.toISOString();

/**
 * Enfileira (idempotente) DENTRO da transação do chamador. `executor` é a transação do fluxo financeiro; a gravação roda num SAVEPOINT próprio.
 * `shadow` é injetável para teste unitário; em produção vem do FinancialLedgerService (mesma regra de elegibilidade do ledger).
 */
export async function enqueueLedgerEvent(
  executor: any,
  input: EnqueueInput,
  shadow: ShadowLedgerStatus = FinancialLedgerService.getShadowStatus(),
  env: Record<string, string | undefined> = process.env
): Promise<EnqueueResult> {
  if (!isOutboxEnabled(env)) return { status: 'DISABLED', reason: 'LEDGER_OUTBOX_ENABLED não é "true"' };
  if (!shadow.enabled || !shadow.cutoff) return { status: 'NOT_ELIGIBLE', reason: 'SHADOW_LEDGER_DISABLED' };
  const created = input.order.createdAt instanceof Date ? input.order.createdAt : new Date(input.order.createdAt);
  if (created < shadow.cutoff) return { status: 'NOT_ELIGIBLE', reason: 'LEGACY_ORDER' };

  let snapshot: Record<string, string | null>;
  let key: string;
  if (input.eventType === 'REFUND_PROCESSED') {
    if (!input.refund) return { status: 'FAILED', reason: 'REFUND_PROCESSED exige os dados do reembolso' };
    snapshot = buildRefundSnapshot(input.order, { ...input.refund, orderId: input.order.id, status: 'processed' }, input.refund.releaseStage);
    key = refundProcessedKey(input.refund.id);
  } else if (isChargebackEvent(input.eventType)) {
    if (!input.chargebackSubjectId) return { status: 'FAILED', reason: `${input.eventType} exige chargebackSubjectId` };
    const subject = await loadChargebackSubject(executor, input.eventType, input.chargebackSubjectId);
    if (!subject || subject.orderId !== input.order.id) return { status: 'FAILED', reason: 'assunto do chargeback não encontrado ou de outro pedido' };
    snapshot = buildChargebackEventSnapshot(input.order, subject);
    key = chargebackEventKey(input.eventType, input.chargebackSubjectId);
  } else if (input.eventType === 'SHIPPING_COST_REVERSED') {
    if (!input.reversal) return { status: 'FAILED', reason: 'SHIPPING_COST_REVERSED exige os dados da reversão' };
    snapshot = buildReversalSnapshot(input.order, { ...input.reversal, orderId: input.order.id });
    key = shippingCostReversedKey(input.reversal.id);
  } else {
    snapshot = buildOrderSnapshot(input.order, input.eventType);
    key = keyFor(input.eventType, input.order.id);
  }
  const policy = resolvePolicy(env);
  try {
    const rows: Array<{ id: string }> = await executor.transaction(async (sp: any) =>
      sp.insert(ledgerOutboxEvents).values({
        id: newId(), eventType: input.eventType, idempotencyKey: key, orderId: input.order.id,
        purchaseGroupId: input.purchaseGroupId ?? null, paymentId: input.paymentId ?? input.refund?.paymentId ?? null,
        status: 'PENDING', attempts: 0, maxAttempts: policy.maxAttempts, nextAttemptAt: new Date(),
        snapshotJson: snapshot, snapshotHash: hashSnapshot(snapshot), occurredAt: input.occurredAt, cutoffAt: shadow.cutoff,
        source: input.source, createdAt: new Date(), updatedAt: new Date(),
      }).onConflictDoNothing({ target: ledgerOutboxEvents.idempotencyKey }).returning({ id: ledgerOutboxEvents.id })
    );
    if (rows.length > 0) return { status: 'ENQUEUED', eventId: rows[0].id };
    const [existing] = await executor.select({ id: ledgerOutboxEvents.id }).from(ledgerOutboxEvents).where(eq(ledgerOutboxEvents.idempotencyKey, key)).limit(1);
    return existing ? { status: 'EXISTS', eventId: existing.id } : { status: 'FAILED', reason: 'conflito sem evento existente' };
  } catch (err: any) {
    logger.error({ orderId: input.order.id, eventType: input.eventType, error: err?.message, pgCode: err?.cause?.code ?? err?.code }, '[LedgerOutbox] falha ao gravar o evento no outbox');
    if (isOutboxStrict(env)) throw err;
    return { status: 'FAILED', reason: String(err?.message ?? err).slice(0, 300) };
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// Processamento
// ---------------------------------------------------------------------------------------------------------------------------------------------------------
export interface ClaimedEvent {
  id: string; eventType: OutboxEventType; idempotencyKey: string; orderId: string; attempts: number; maxAttempts: number;
  snapshotJson: Record<string, unknown>; snapshotHash: string; occurredAt: Date; source: string | null;
}

/** O driver (drizzle/pg) devolve timestamp SEM fuso como texto "YYYY-MM-DD HH:MM:SS[.ffffff]" — sempre relógio UTC neste projeto (gravamos com toISOString()). */
export const parseUtc = (v: unknown): Date => {
  if (v instanceof Date) return v;
  const s = String(v);
  return new Date(/[zZ]|[+-]\d{2}(:?\d{2})?$/.test(s) ? s.replace(' ', 'T') : `${s.replace(' ', 'T')}Z`);
};

const mapClaimed = (r: any): ClaimedEvent => ({
  id: r.id, eventType: r.event_type, idempotencyKey: r.idempotency_key, orderId: r.order_id, attempts: r.attempts, maxAttempts: r.max_attempts,
  snapshotJson: r.snapshot_json, snapshotHash: r.snapshot_hash, occurredAt: parseUtc(r.occurred_at), source: r.source,
});

const rowsOf = (res: any): any[] => (Array.isArray(res) ? res : res?.rows ?? []);

/** Marca como NEEDS_INTERVENTION o que esgotou as tentativas (inclusive worker que caiu na última tentativa). Retorna quantos. */
export async function sweepExhausted(db: any, now: Date): Promise<number> {
  const res = await db.execute(sql`
    UPDATE ledger_outbox_events
       SET status = 'NEEDS_INTERVENTION', last_error_code = 'RETRIES_EXHAUSTED',
           last_error = coalesce(last_error, 'tentativas esgotadas'), locked_by = NULL, locked_until = NULL, updated_at = ${iso(now)}::timestamp
     WHERE attempts >= max_attempts
       AND (status IN ('PENDING','RETRYING') OR (status = 'PROCESSING' AND locked_until < ${iso(now)}::timestamp))
    RETURNING id`);
  const n = rowsOf(res).length;
  if (n > 0) logger.error({ count: n, ids: rowsOf(res).map((r) => r.id) }, '[LedgerOutbox] eventos com tentativas esgotadas => NEEDS_INTERVENTION');
  return n;
}

/**
 * Reclama eventos prontos: atômico (um único UPDATE sobre um SELECT … FOR UPDATE SKIP LOCKED) — dois workers nunca recebem o mesmo evento. Reclama também
 * eventos PROCESSING cujo lease expirou (worker que caiu). A tentativa é contada no momento do claim.
 */
export async function claimEvents(db: any, opts: { workerId: string; limit: number; now: Date; leaseSeconds: number; eventIds?: string[] }): Promise<ClaimedEvent[]> {
  const until = new Date(opts.now.getTime() + opts.leaseSeconds * 1000);
  const idFilter = opts.eventIds && opts.eventIds.length ? sql`AND id IN (${sql.join(opts.eventIds.map((i) => sql`${i}`), sql`, `)})` : sql``;
  const res = await db.execute(sql`
    WITH picked AS (
      SELECT id FROM ledger_outbox_events
       WHERE attempts < max_attempts
         AND ((status IN ('PENDING','RETRYING') AND next_attempt_at <= ${iso(opts.now)}::timestamp)
              OR (status = 'PROCESSING' AND locked_until < ${iso(opts.now)}::timestamp))
         ${idFilter}
       ORDER BY next_attempt_at, created_at
       LIMIT ${opts.limit}
       FOR UPDATE SKIP LOCKED)
    UPDATE ledger_outbox_events e
       SET status = 'PROCESSING', locked_by = ${opts.workerId}, locked_until = ${iso(until)}::timestamp,
           attempts = e.attempts + 1, last_attempt_at = ${iso(opts.now)}::timestamp, updated_at = ${iso(opts.now)}::timestamp
      FROM picked WHERE e.id = picked.id
    RETURNING e.id, e.event_type, e.idempotency_key, e.order_id, e.attempts, e.max_attempts, e.snapshot_json, e.snapshot_hash, e.occurred_at, e.source`);
  return rowsOf(res).map(mapClaimed);
}

type Finalize =
  | { kind: 'DONE'; transactionId: string }
  | { kind: 'SKIPPED'; code: string; detail?: string }
  | { kind: 'NEEDS_INTERVENTION'; code: string; detail?: string }
  | { kind: 'RETRYING'; code: string; detail?: string; delaySeconds: number }
  | { kind: 'DEFER'; code: string };

/** Fecha o ciclo SÓ se ainda somos o dono do lease (um worker lento que perdeu o lease não sobrescreve o estado de quem assumiu). Retorna false se perdeu o lease. */
async function finalize(db: any, ev: ClaimedEvent, workerId: string, f: Finalize, now: Date): Promise<boolean> {
  const guard = sql`id = ${ev.id} AND locked_by = ${workerId} AND status = 'PROCESSING'`;
  const t = iso(now);
  let res: any;
  switch (f.kind) {
    case 'DONE':
      res = await db.execute(sql`UPDATE ledger_outbox_events SET status='DONE', ledger_transaction_id=${f.transactionId}, processed_at=${t}::timestamp, locked_by=NULL, locked_until=NULL, last_error=NULL, last_error_code=NULL, updated_at=${t}::timestamp WHERE ${guard} RETURNING id`); break;
    case 'SKIPPED':
      res = await db.execute(sql`UPDATE ledger_outbox_events SET status='SKIPPED', processed_at=${t}::timestamp, locked_by=NULL, locked_until=NULL, last_error_code=${f.code}, last_error=${f.detail ?? null}, updated_at=${t}::timestamp WHERE ${guard} RETURNING id`); break;
    case 'NEEDS_INTERVENTION':
      res = await db.execute(sql`UPDATE ledger_outbox_events SET status='NEEDS_INTERVENTION', locked_by=NULL, locked_until=NULL, last_error_code=${f.code}, last_error=${(f.detail ?? '').slice(0, 2000) || null}, updated_at=${t}::timestamp WHERE ${guard} RETURNING id`); break;
    case 'RETRYING': {
      const next = new Date(now.getTime() + f.delaySeconds * 1000);
      res = await db.execute(sql`UPDATE ledger_outbox_events SET status='RETRYING', next_attempt_at=${iso(next)}::timestamp, locked_by=NULL, locked_until=NULL, last_error_code=${f.code}, last_error=${(f.detail ?? '').slice(0, 2000) || null}, updated_at=${t}::timestamp WHERE ${guard} RETURNING id`); break;
    }
    case 'DEFER': // ledger desligado agora: devolve o evento sem gastar a tentativa
      res = await db.execute(sql`UPDATE ledger_outbox_events SET status='PENDING', attempts=GREATEST(attempts-1,0), next_attempt_at=${iso(new Date(now.getTime() + 600_000))}::timestamp, locked_by=NULL, locked_until=NULL, last_error_code=${f.code}, updated_at=${t}::timestamp WHERE ${guard} RETURNING id`); break;
  }
  return rowsOf(res).length > 0;
}

export type EventOutcome = 'DONE' | 'DONE_REPLAY' | 'SKIPPED' | 'RETRYING' | 'NEEDS_INTERVENTION' | 'DEFERRED' | 'LEASE_LOST';

/** Processa UM evento já reclamado. Nunca lança. */
export async function processClaimedEvent(db: any, ev: ClaimedEvent, workerId: string, now: Date, policy: OutboxPolicy): Promise<EventOutcome> {
  const log = (level: 'info' | 'warn' | 'error', msg: string, extra: Record<string, unknown> = {}) =>
    (logger as any)[level]({ outboxEventId: ev.id, orderId: ev.orderId, eventType: ev.eventType, attempt: ev.attempts, maxAttempts: ev.maxAttempts, workerId, ...extra }, `[LedgerOutbox] ${msg}`);
  const fin = async (f: Finalize, outcome: EventOutcome): Promise<EventOutcome> => ((await finalize(db, ev, workerId, f, now)) ? outcome : 'LEASE_LOST');
  try {
    // 1) snapshot: o pedido tem de ser, campo a campo, o que foi enfileirado
    const [order] = await db.select().from(orders).where(eq(orders.id, ev.orderId)).limit(1);
    if (!order) {
      log('error', 'pedido não encontrado => intervenção');
      return fin({ kind: 'NEEDS_INTERVENTION', code: 'ORDER_NOT_FOUND', detail: `pedido ${ev.orderId} não existe` }, 'NEEDS_INTERVENTION');
    }
    // REFUND_PROCESSED: além do pedido, o reembolso tem de existir, estar CONCLUÍDO e ser, campo a campo, o que foi enfileirado (o estágio vem do próprio evento)
    let refundId: string | null = null;
    let releaseStage: RefundReleaseStage | null = null;
    let reversalId: string | null = null;
    let current: Record<string, string | null>;
    let cbSubjectId: string | null = null;
    if (isChargebackEvent(ev.eventType)) {
      // E5: o assunto (alocação / decisão aprovada por alocação / recuperação) tem de existir e ser, campo a campo, o enfileirado
      const prefix = chargebackEventKey(ev.eventType, '');
      cbSubjectId = ev.idempotencyKey.startsWith(prefix) ? ev.idempotencyKey.slice(prefix.length) : null;
      const subject = cbSubjectId ? await loadChargebackSubject(db, ev.eventType, cbSubjectId) : null;
      if (!subject || subject.orderId !== ev.orderId) {
        log('error', 'assunto do chargeback ausente/incoerente => intervenção');
        return fin({ kind: 'NEEDS_INTERVENTION', code: 'CHARGEBACK_SUBJECT_NOT_FOUND', detail: `assunto ${cbSubjectId ?? '?'} não encontrado para o pedido do evento` }, 'NEEDS_INTERVENTION');
      }
      current = buildChargebackEventSnapshot(order as OrderRowForSnapshot, subject);
    } else if (ev.eventType === 'SHIPPING_COST_REVERSED') {
      // E4: a reversão registrada tem de existir e ser, campo a campo, a enfileirada (valor e divisão subsídio/absorvido)
      reversalId = typeof ev.snapshotJson.reversalId === 'string' ? ev.snapshotJson.reversalId : null;
      if (!reversalId || ev.idempotencyKey !== shippingCostReversedKey(reversalId)) {
        log('error', 'evento de reversão com snapshot/chave inválidos => intervenção');
        return fin({ kind: 'NEEDS_INTERVENTION', code: 'INVALID_EVENT_SNAPSHOT', detail: 'reversalId ausente ou chave incoerente' }, 'NEEDS_INTERVENTION');
      }
      const [rev] = await db.select().from(shippingCostReversals).where(eq(shippingCostReversals.id, reversalId)).limit(1);
      if (!rev) return fin({ kind: 'NEEDS_INTERVENTION', code: 'SHIPPING_REVERSAL_NOT_FOUND', detail: `reversão ${reversalId} não existe` }, 'NEEDS_INTERVENTION');
      current = buildReversalSnapshot(order as OrderRowForSnapshot, rev as any);
    } else if (ev.eventType === 'REFUND_PROCESSED') {
      refundId = typeof ev.snapshotJson.refundId === 'string' ? ev.snapshotJson.refundId : null;
      releaseStage = ev.snapshotJson.releaseStage === 'BEFORE_RELEASE' || ev.snapshotJson.releaseStage === 'AFTER_RELEASE' ? (ev.snapshotJson.releaseStage as RefundReleaseStage) : null;
      if (!refundId || !releaseStage || ev.idempotencyKey !== refundProcessedKey(refundId)) {
        log('error', 'evento de reembolso com snapshot/chave inválidos => intervenção');
        return fin({ kind: 'NEEDS_INTERVENTION', code: 'INVALID_EVENT_SNAPSHOT', detail: 'refundId/releaseStage ausentes ou chave incoerente' }, 'NEEDS_INTERVENTION');
      }
      const [refund] = await db.select().from(refunds).where(eq(refunds.id, refundId)).limit(1);
      if (!refund) return fin({ kind: 'NEEDS_INTERVENTION', code: 'REFUND_NOT_FOUND', detail: `reembolso ${refundId} não existe` }, 'NEEDS_INTERVENTION');
      if (refund.status !== 'processed') return fin({ kind: 'NEEDS_INTERVENTION', code: 'REFUND_NOT_PROCESSED', detail: `reembolso ${refundId} está "${refund.status}"` }, 'NEEDS_INTERVENTION');
      current = buildRefundSnapshot(order as OrderRowForSnapshot, refund as any, releaseStage);
    } else {
      current = buildOrderSnapshot(order as OrderRowForSnapshot, ev.eventType);
    }
    if (hashSnapshot(current) !== ev.snapshotHash) {
      const fields = diffSnapshots(current, ev.snapshotJson);
      log('error', 'DIVERGÊNCIA: o pedido mudou depois do enfileiramento => intervenção (nada foi lançado)', { fields });
      return fin({ kind: 'NEEDS_INTERVENTION', code: 'SNAPSHOT_DIVERGED', detail: `campos divergentes: ${fields.join(', ')}` }, 'NEEDS_INTERVENTION');
    }
    // 2) lançamento (idempotente por chave). A entrega garante antes o PAYMENT_RECEIVED do pedido (BUYER_ESCROW nunca negativo).
    const base = { orderId: ev.orderId, occurredAt: ev.occurredAt, source: 'ledger_outbox', correlationId: ev.id };
    if (isChargebackEvent(ev.eventType)) {
      const id = cbSubjectId!; const common = { occurredAt: ev.occurredAt, source: 'ledger_outbox', correlationId: ev.id };
      const call = ev.eventType === 'CHARGEBACK_CONFIRMED' ? FinancialLedgerService.recordChargebackConfirmed({ allocationId: id, ...common })
        : ev.eventType === 'CHARGEBACK_ALLOCATED' ? FinancialLedgerService.recordChargebackAllocated({ decisionId: id.split(':')[0], allocationId: id.split(':')[1], ...common })
          : FinancialLedgerService.recordChargebackRecovery({ recoveryId: id, ...common });
      const r = mapLedgerResult(await call);
      if (r.action === 'DONE') {
        log('info', r.replay ? 'chargeback já lançado (replay idempotente) => DONE' : 'chargeback lançado => DONE', { ledgerTransactionId: r.transactionId, subject: id });
        return fin({ kind: 'DONE', transactionId: r.transactionId }, r.replay ? 'DONE_REPLAY' : 'DONE');
      }
      if (r.action === 'SKIPPED') { log('info', 'ignorado por política', { reason: r.code }); return fin({ kind: 'SKIPPED', code: r.code, detail: r.detail }, 'SKIPPED'); }
      if (r.action === 'DEFER') return fin({ kind: 'DEFER', code: r.code }, 'DEFERRED');
      return await failFrom(r);
    }
    if (ev.eventType === 'SHIPPING_COST_REVERSED') {
      // recordShippingCostReversed garante PR → DC → REFUND_PROCESSED antes do próprio lançamento
      const r = mapLedgerResult(await FinancialLedgerService.recordShippingCostReversed({ reversalId: reversalId!, occurredAt: ev.occurredAt, source: 'ledger_outbox', correlationId: ev.id }));
      if (r.action === 'DONE') {
        log('info', r.replay ? 'reversão já lançada (replay idempotente) => DONE' : 'reversão lançada => DONE', { ledgerTransactionId: r.transactionId, reversalId });
        return fin({ kind: 'DONE', transactionId: r.transactionId }, r.replay ? 'DONE_REPLAY' : 'DONE');
      }
      if (r.action === 'SKIPPED') { log('info', 'ignorado por política', { reason: r.code }); return fin({ kind: 'SKIPPED', code: r.code, detail: r.detail }, 'SKIPPED'); }
      if (r.action === 'DEFER') return fin({ kind: 'DEFER', code: r.code }, 'DEFERRED');
      return await failFrom(r);
    }
    if (ev.eventType === 'REFUND_PROCESSED') {
      // recordRefundProcessed garante PAYMENT_RECEIVED (e ORDER_DELIVERY_CONFIRMED no estágio pós-liberação) antes do próprio lançamento
      const r = mapLedgerResult(await FinancialLedgerService.recordRefundProcessed({ refundId: refundId!, releaseStage: releaseStage!, occurredAt: ev.occurredAt, source: 'ledger_outbox', correlationId: ev.id }));
      if (r.action === 'DONE') {
        log('info', r.replay ? 'reembolso já lançado (replay idempotente) => DONE' : 'reembolso lançado => DONE', { ledgerTransactionId: r.transactionId, refundId });
        return fin({ kind: 'DONE', transactionId: r.transactionId }, r.replay ? 'DONE_REPLAY' : 'DONE');
      }
      if (r.action === 'SKIPPED') { log('info', 'ignorado por política', { reason: r.code }); return fin({ kind: 'SKIPPED', code: r.code, detail: r.detail }, 'SKIPPED'); }
      if (r.action === 'DEFER') return fin({ kind: 'DEFER', code: r.code }, 'DEFERRED');
      return await failFrom(r);
    }
    if (ev.eventType === 'ORDER_DELIVERY_CONFIRMED') {
      const pre = mapLedgerResult(await FinancialLedgerService.recordPaymentReceived(base));
      if (pre.action === 'DEFER') return fin({ kind: 'DEFER', code: pre.code }, 'DEFERRED');
      if (pre.action !== 'DONE' && pre.action !== 'SKIPPED') return await failFrom(pre);
      if (pre.action === 'SKIPPED') return fin({ kind: 'SKIPPED', code: pre.code, detail: pre.detail }, 'SKIPPED');
    }
    const res = mapLedgerResult(ev.eventType === 'PAYMENT_RECEIVED' ? await FinancialLedgerService.recordPaymentReceived(base) : await FinancialLedgerService.recordDeliveryConfirmed(base));
    if (res.action === 'DONE') {
      log('info', res.replay ? 'já lançado (replay idempotente) => DONE' : 'lançado => DONE', { ledgerTransactionId: res.transactionId });
      return fin({ kind: 'DONE', transactionId: res.transactionId }, res.replay ? 'DONE_REPLAY' : 'DONE');
    }
    if (res.action === 'SKIPPED') { log('info', 'ignorado por política', { reason: res.code }); return fin({ kind: 'SKIPPED', code: res.code, detail: res.detail }, 'SKIPPED'); }
    if (res.action === 'DEFER') return fin({ kind: 'DEFER', code: res.code }, 'DEFERRED');
    return await failFrom(res);
  } catch (err: any) {
    const cls = classifyProcessingError(err);
    return failure(cls.kind, cls.code, String(err?.message ?? err));
  }

  async function failFrom(r: { action: string; code?: string; detail?: string }): Promise<EventOutcome> {
    return failure(r.action === 'RETRY' ? 'TRANSIENT' : 'PERMANENT', r.code ?? 'UNKNOWN', r.detail ?? r.code ?? '');
  }
  async function failure(kind: 'TRANSIENT' | 'PERMANENT', code: string, detail: string): Promise<EventOutcome> {
    if (kind === 'PERMANENT') {
      log('error', 'falha permanente => intervenção', { code, detail: detail.slice(0, 300) });
      return fin({ kind: 'NEEDS_INTERVENTION', code, detail }, 'NEEDS_INTERVENTION');
    }
    if (ev.attempts >= ev.maxAttempts) {
      log('error', 'tentativas esgotadas => intervenção', { code, detail: detail.slice(0, 300) });
      return fin({ kind: 'NEEDS_INTERVENTION', code: 'RETRIES_EXHAUSTED', detail: `${code}: ${detail}` }, 'NEEDS_INTERVENTION');
    }
    const delay = computeBackoffSeconds(ev.attempts, policy);
    log('warn', 'falha recuperável => nova tentativa agendada', { code, detail: detail.slice(0, 300), retryInSeconds: delay });
    return fin({ kind: 'RETRYING', code, detail, delaySeconds: delay }, 'RETRYING');
  }
}

export interface OutboxRunSummary {
  status: 'OK' | 'DISABLED';
  /** presente quando status = DISABLED */
  disabledReason?: 'OUTBOX_FLAG_OFF' | 'SHADOW_LEDGER_OFF' | 'DATABASE_UNAVAILABLE';
  workerId: string;
  swept: number;
  claimed: number;
  outcomes: Record<EventOutcome, number>;
  durationMs: number;
}

export const emptyOutcomes = (): Record<EventOutcome, number> => ({ DONE: 0, DONE_REPLAY: 0, SKIPPED: 0, RETRYING: 0, NEEDS_INTERVENTION: 0, DEFERRED: 0, LEASE_LOST: 0 });
export const defaultWorkerId = () => `${os.hostname()}:${process.pid}:${Math.random().toString(36).slice(2, 7)}`;

/** Uma execução do worker: varre esgotados, reclama um lote e processa. `now` e `eventIds` injetáveis (teste / processamento imediato pós-commit). */
export async function runLedgerOutboxOnce(opts: { workerId?: string; batchSize?: number; now?: Date; eventIds?: string[]; env?: Record<string, string | undefined> } = {}): Promise<OutboxRunSummary> {
  const started = Date.now();
  const workerId = opts.workerId ?? defaultWorkerId();
  const env = opts.env ?? process.env;
  const policy = resolvePolicy(env);
  const summary: OutboxRunSummary = { status: 'OK', workerId, swept: 0, claimed: 0, outcomes: emptyOutcomes(), durationMs: 0 };
  // PORTÃO DA FLAG — antes de qualquer outra coisa (inclusive de obter o banco): com LEDGER_OUTBOX_ENABLED desligada o worker não consulta nem as tabelas do
  // outbox (que podem nem existir antes da migração 0039), não varre, não reivindica e não processa. Vale para o endpoint, o runner e qualquer outro chamador.
  if (!isOutboxEnabled(env)) { summary.status = 'DISABLED'; summary.disabledReason = 'OUTBOX_FLAG_OFF'; return summary; }
  const shadow = FinancialLedgerService.getShadowStatus();
  if (!shadow.enabled) { summary.status = 'DISABLED'; summary.disabledReason = 'SHADOW_LEDGER_OFF'; return summary; }
  const db: any = getDb();
  if (!db) { summary.status = 'DISABLED'; summary.disabledReason = 'DATABASE_UNAVAILABLE'; return summary; }
  const now = opts.now ?? new Date();
  summary.swept = await sweepExhausted(db, now);
  const events = await claimEvents(db, { workerId, limit: opts.batchSize ?? policy.batchSize, now, leaseSeconds: policy.leaseSeconds, eventIds: opts.eventIds });
  summary.claimed = events.length;
  for (const ev of events) summary.outcomes[await processClaimedEvent(db, ev, workerId, now, policy)]++;
  summary.durationMs = Date.now() - started;
  logger.info({ ...summary }, '[LedgerOutbox] execução concluída');
  return summary;
}

/** Tentativa imediata, pós-commit, dos eventos que ESTA transação acabou de enfileirar. Nunca lança (o worker recupera o que falhar). */
export async function processEventsNow(eventIds: string[]): Promise<void> {
  if (!eventIds.length) return;
  try { await runLedgerOutboxOnce({ eventIds, batchSize: eventIds.length }); }
  catch (err: any) { logger.error({ eventIds, error: err?.message }, '[LedgerOutbox] processamento imediato falhou — o worker recuperará (eventos já estão no outbox)'); }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// Recuperação manual AUDITÁVEL (somente GLOBAL_ADMIN) + métricas
// ---------------------------------------------------------------------------------------------------------------------------------------------------------
export class OutboxAdminError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.name = 'OutboxAdminError'; this.code = code; }
}

async function requireGlobalAdmin(tx: any, actorUserId: string): Promise<void> {
  const [u] = await tx.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, actorUserId)).limit(1);
  if (!u || String(u.role).toUpperCase() !== 'GLOBAL_ADMIN') throw new OutboxAdminError('FORBIDDEN', 'Somente GLOBAL_ADMIN pode intervir em eventos do outbox do ledger.');
}

const MIN_REASON = 10;
const needReason = (r: string | undefined) => { if (!r || r.trim().length < MIN_REASON) throw new OutboxAdminError('REASON_REQUIRED', `Informe uma justificativa (mínimo ${MIN_REASON} caracteres).`); return r.trim(); };

async function auditAndLoad(tx: any, eventId: string) {
  const [ev] = await tx.select().from(ledgerOutboxEvents).where(eq(ledgerOutboxEvents.id, eventId)).for('update').limit(1);
  if (!ev) throw new OutboxAdminError('NOT_FOUND', `Evento ${eventId} não encontrado.`);
  return ev;
}

/** Recoloca na fila um evento que exigiu intervenção (após corrigir a causa). Zera tentativas; o histórico do erro anterior vai para a auditoria. */
export async function requeueOutboxEvent(input: { eventId: string; actorUserId: string; reason: string }): Promise<{ eventId: string; from: string }> {
  const reason = needReason(input.reason);
  const db: any = getDb(); if (!db) throw new Error('Banco de dados indisponível.');
  return db.transaction(async (tx: any) => {
    await requireGlobalAdmin(tx, input.actorUserId);
    const ev = await auditAndLoad(tx, input.eventId);
    if (!['NEEDS_INTERVENTION', 'DISMISSED', 'SKIPPED', 'RETRYING'].includes(ev.status)) throw new OutboxAdminError('INVALID_STATE', `Evento em ${ev.status} não pode ser recolocado na fila.`);
    await tx.update(ledgerOutboxEvents).set({ status: 'PENDING', attempts: 0, nextAttemptAt: new Date(), lockedBy: null, lockedUntil: null, resolvedBy: input.actorUserId, resolutionNote: `REQUEUE: ${reason}`, updatedAt: new Date() }).where(eq(ledgerOutboxEvents.id, ev.id));
    await tx.insert(auditLogs).values({ id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, actorUserId: input.actorUserId, action: 'ledger.outbox.requeue', resource: 'ledger_outbox_event', resourceId: ev.id, detailsJson: { reason, before: { status: ev.status, attempts: ev.attempts, lastErrorCode: ev.lastErrorCode, lastError: ev.lastError }, orderId: ev.orderId, eventType: ev.eventType }, createdAt: new Date() });
    return { eventId: ev.id, from: ev.status as string };
  });
}

/** Descarta (DISMISSED) um evento que não deve ser lançado, com justificativa obrigatória. DONE nunca pode ser descartado. */
export async function dismissOutboxEvent(input: { eventId: string; actorUserId: string; reason: string }): Promise<{ eventId: string; from: string }> {
  const reason = needReason(input.reason);
  const db: any = getDb(); if (!db) throw new Error('Banco de dados indisponível.');
  return db.transaction(async (tx: any) => {
    await requireGlobalAdmin(tx, input.actorUserId);
    const ev = await auditAndLoad(tx, input.eventId);
    if (!['NEEDS_INTERVENTION', 'RETRYING', 'PENDING', 'SKIPPED'].includes(ev.status)) throw new OutboxAdminError('INVALID_STATE', `Evento em ${ev.status} não pode ser descartado.`);
    await tx.update(ledgerOutboxEvents).set({ status: 'DISMISSED', lockedBy: null, lockedUntil: null, resolvedBy: input.actorUserId, resolutionNote: `DISMISS: ${reason}`, processedAt: new Date(), updatedAt: new Date() }).where(eq(ledgerOutboxEvents.id, ev.id));
    await tx.insert(auditLogs).values({ id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, actorUserId: input.actorUserId, action: 'ledger.outbox.dismiss', resource: 'ledger_outbox_event', resourceId: ev.id, detailsJson: { reason, before: { status: ev.status, attempts: ev.attempts, lastErrorCode: ev.lastErrorCode, lastError: ev.lastError }, orderId: ev.orderId, eventType: ev.eventType }, createdAt: new Date() });
    return { eventId: ev.id, from: ev.status as string };
  });
}

export interface OutboxMetrics {
  generatedAt: string;
  byStatus: Record<string, number>;
  pending: number; retrying: number; processing: number; done: number; needsIntervention: number; skipped: number; dismissed: number;
  staleProcessing: number;
  oldestWaitingSeconds: number | null;
  doneLast24h: number;
  maxAttemptsObserved: number;
}

/** Métricas do outbox (somente leitura). */
export async function getOutboxMetrics(now: Date = new Date()): Promise<OutboxMetrics> {
  const db: any = getDb(); if (!db) throw new Error('Banco de dados indisponível.');
  const byStatus: Record<string, number> = {};
  for (const r of rowsOf(await db.execute(sql`SELECT status, count(*)::int AS n FROM ledger_outbox_events GROUP BY status`))) byStatus[r.status] = r.n;
  const t = iso(now);
  const extra = rowsOf(await db.execute(sql`
    SELECT (SELECT count(*)::int FROM ledger_outbox_events WHERE status='PROCESSING' AND locked_until < ${t}::timestamp) AS stale_processing,
           (SELECT extract(epoch FROM (${t}::timestamp - min(created_at)))::int FROM ledger_outbox_events WHERE status IN ('PENDING','RETRYING')) AS oldest_waiting,
           (SELECT count(*)::int FROM ledger_outbox_events WHERE status='DONE' AND processed_at >= ${t}::timestamp - interval '24 hours') AS done_24h,
           (SELECT coalesce(max(attempts),0)::int FROM ledger_outbox_events) AS max_attempts`))[0];
  const g = (s: string) => byStatus[s] ?? 0;
  return {
    generatedAt: t, byStatus, pending: g('PENDING'), retrying: g('RETRYING'), processing: g('PROCESSING'), done: g('DONE'), needsIntervention: g('NEEDS_INTERVENTION'),
    skipped: g('SKIPPED'), dismissed: g('DISMISSED'), staleProcessing: extra.stale_processing, oldestWaitingSeconds: extra.oldest_waiting, doneLast24h: extra.done_24h, maxAttemptsObserved: extra.max_attempts,
  };
}

