/**
 * LEDGER SOMBRA — E4: registro AUDITADO da parcela do custo de frete efetivamente devolvida à Nusali num pedido reembolsado DEPOIS da liberação do Escrow.
 *
 * REGRA (nada aqui presume que um reembolso recupera o frete): sem registro, o subsídio da Nusali e o frete absorvido continuam sendo custo da Nusali. Um registro só
 * é aceito com (a) autor GLOBAL_ADMIN, (b) referência da evidência, (c) justificativa, (d) pedido com reembolso TOTAL concluído depois da liberação (antes dela o subsídio
 * nunca foi reconhecido no ledger) e (e) valor acumulado ≤ custo de frete do pedido (snapshot). Este serviço NÃO mexe em carteiras, Escrow, pagamentos nem reembolsos:
 * grava só a reversão (imutável), a auditoria e o evento do outbox (mesma transação; savepoint). O lançamento no ledger é feito pelo worker existente.
 */
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '../../../db/index.js';
import { orders, refunds, escrowAccounts, shippingCostReversals, users, auditLogs } from '../../../db/schema.js';
import { logger } from '../../infra/logger.js';
import { FinancialLedgerService } from './financialLedgerService.js';
import { toMicros, fromMicros, formatMicros } from './decimal.js';
import { allocateReversalParts, shippingCostCapacity } from './shippingReversalEntries.js';
import { stageLedgerEventsInTx, flushLedgerStage, type LedgerStage } from './outbox/ledgerShadowHooks.js';

export class ShippingReversalError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.name = 'ShippingReversalError'; this.code = code; }
}

export interface RecordShippingCostReversalInput {
  orderId: string;
  /** valor do custo de frete EFETIVAMENTE devolvido (> 0, até centavos, na moeda do pedido) */
  amount: string | number;
  /** referência da evidência (documento, protocolo da transportadora…) — obrigatória */
  evidenceRef: string;
  reason: string;
  actorUserId: string;
  /** chave do chamador: o mesmo registro repetido nunca duplica */
  idempotencyKey: string;
}
export interface ShippingReversalResult { reversalId: string; orderId: string; refundId: string; amount: string; subsidyPart: string; absorbedPart: string; alreadyRecorded: boolean }

const newId = () => `scr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

export async function recordShippingCostReversal(input: RecordShippingCostReversalInput): Promise<ShippingReversalResult> {
  const db: any = getDb(); if (!db) throw new Error('Banco de dados indisponível.');
  const evidenceRef = String(input.evidenceRef ?? '').trim();
  const reason = String(input.reason ?? '').trim();
  const idempotencyKey = String(input.idempotencyKey ?? '').trim();
  if (evidenceRef.length < 5) throw new ShippingReversalError('EVIDENCE_REQUIRED', 'Informe a referência da evidência (mínimo 5 caracteres).');
  if (reason.length < 10) throw new ShippingReversalError('REASON_REQUIRED', 'Informe uma justificativa (mínimo 10 caracteres).');
  if (!idempotencyKey) throw new ShippingReversalError('IDEMPOTENCY_KEY_REQUIRED', 'Informe idempotencyKey.');
  let amountMicros: bigint;
  try { amountMicros = toMicros(String(input.amount)); } catch { throw new ShippingReversalError('INVALID_AMOUNT', 'Valor inválido.'); }
  if (amountMicros <= 0n || amountMicros % 10000n !== 0n) throw new ShippingReversalError('INVALID_AMOUNT', 'O valor deve ser positivo e ter no máximo 2 casas decimais.');

  let stage: LedgerStage | undefined;
  let reversalId = '';
  const result: ShippingReversalResult = await db.transaction(async (tx: any) => {
    const [actor] = await tx.select({ role: users.role }).from(users).where(eq(users.id, input.actorUserId)).limit(1);
    if (!actor || String(actor.role).toUpperCase() !== 'GLOBAL_ADMIN') throw new ShippingReversalError('FORBIDDEN', 'Somente GLOBAL_ADMIN pode registrar a reversão de custo de frete.');

    // mesmo lock por pedido que reembolso e liberação usam (serializa; nunca há outro lock tomado aqui => sem inversão de ordem)
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.orderId}))`);

    const [order] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
    if (!order) throw new ShippingReversalError('ORDER_NOT_FOUND', `Pedido ${input.orderId} não encontrado.`);

    // idempotência: o MESMO registro repetido devolve o existente (e recria o evento do ledger se ele se perdeu)
    const [existing] = await tx.select().from(shippingCostReversals).where(eq(shippingCostReversals.idempotencyKey, idempotencyKey)).limit(1);
    if (existing) {
      if (existing.orderId !== order.id || toMicros(existing.amount) !== amountMicros) throw new ShippingReversalError('IDEMPOTENCY_CONFLICT', 'A idempotencyKey já foi usada para outro pedido/valor.');
      reversalId = existing.id;
      stage = await stageLedgerEventsInTx(tx, [{
        eventType: 'SHIPPING_COST_REVERSED', order, paymentId: null, purchaseGroupId: order.purchaseGroupId ?? null,
        reversal: { id: existing.id, refundId: existing.refundId, amount: existing.amount, currency: existing.currency, subsidyPart: existing.subsidyPart, absorbedPart: existing.absorbedPart },
        occurredAt: existing.createdAt, source: 'shipping_reversal_service',
      }]);
      return { reversalId: existing.id, orderId: existing.orderId, refundId: existing.refundId, amount: String(existing.amount), subsidyPart: String(existing.subsidyPart), absorbedPart: String(existing.absorbedPart), alreadyRecorded: true };
    }

    const [escrow] = await tx.select().from(escrowAccounts).where(eq(escrowAccounts.orderId, order.id)).limit(1);
    if (!escrow || escrow.status !== 'refunded') throw new ShippingReversalError('ORDER_NOT_REFUNDED', `Pedido ${order.id} não tem reembolso concluído (Escrow "${escrow?.status ?? 'ausente'}").`);
    if (!escrow.releasedAt) throw new ShippingReversalError('REFUNDED_BEFORE_RELEASE', 'Reembolso feito ANTES da liberação: a entrega nunca foi contabilizada, então o subsídio de frete nunca foi reconhecido — não há o que reverter.');
    const processed = await tx.select().from(refunds).where(and(eq(refunds.orderId, order.id), eq(refunds.status, 'processed')));
    if (processed.length !== 1) throw new ShippingReversalError('REFUND_NOT_UNIQUE', `Esperado exatamente 1 reembolso concluído do pedido; encontrado ${processed.length}.`);
    const refund = processed[0];
    if (toMicros(refund.amount) !== toMicros(order.totalAmount)) throw new ShippingReversalError('PARTIAL_REFUND_NOT_SUPPORTED', 'Reversão de frete só é suportada após reembolso TOTAL do pedido.');
    if (refund.currency !== order.currency) throw new ShippingReversalError('CURRENCY_MISMATCH', 'Moeda do reembolso difere da do pedido.');

    const cap = shippingCostCapacity(order);
    if (cap.cost <= 0n) throw new ShippingReversalError('NO_SHIPPING_COST', 'O pedido não tem custo de frete no snapshot.');
    const prior = await tx.select({ amount: shippingCostReversals.amount }).from(shippingCostReversals).where(eq(shippingCostReversals.orderId, order.id));
    const already = prior.reduce((s: bigint, r: any) => s + toMicros(r.amount), 0n);
    if (already + amountMicros > cap.cost) throw new ShippingReversalError('EXCEEDS_SHIPPING_COST', `Reversão acumulada (${fromMicros(already + amountMicros)}) excede o custo de frete do pedido (${fromMicros(cap.cost)}).`);
    const parts = allocateReversalParts({ cost: cap.cost, subsidy: cap.subsidy, alreadyReversed: already, amount: amountMicros });

    reversalId = newId();
    const now = new Date();
    const row = { id: reversalId, orderId: order.id, refundId: refund.id, amount: formatMicros(amountMicros, 2), currency: order.currency, subsidyPart: formatMicros(parts.subsidyPart, 2), absorbedPart: formatMicros(parts.absorbedPart, 2), evidenceRef, reason, performedBy: input.actorUserId, idempotencyKey, createdAt: now };
    await tx.insert(shippingCostReversals).values(row);
    await tx.insert(auditLogs).values({
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, actorUserId: input.actorUserId, action: 'ledger.shipping_reversal.record', resource: 'shipping_cost_reversal', resourceId: reversalId,
      detailsJson: { orderId: order.id, refundId: refund.id, amount: row.amount, subsidyPart: row.subsidyPart, absorbedPart: row.absorbedPart, evidenceRef, reason, alreadyReversedBefore: fromMicros(already) }, createdAt: now,
    });
    stage = await stageLedgerEventsInTx(tx, [{
      eventType: 'SHIPPING_COST_REVERSED', order, paymentId: null, purchaseGroupId: order.purchaseGroupId ?? null,
      reversal: { id: reversalId, refundId: refund.id, amount: row.amount, currency: row.currency, subsidyPart: row.subsidyPart, absorbedPart: row.absorbedPart },
      occurredAt: now, source: 'shipping_reversal_service',
    }]);
    return { reversalId, orderId: order.id, refundId: refund.id, amount: row.amount, subsidyPart: row.subsidyPart, absorbedPart: row.absorbedPart, alreadyRecorded: false };
  });

  // pós-commit: tentativa imediata (outbox) ou, com o outbox desligado, lançamento direto best-effort. Nunca lança; o worker/reparo recupera.
  try {
    await flushLedgerStage(stage, async () => {
      try {
        const r = await FinancialLedgerService.recordShippingCostReversed({ reversalId: result.reversalId, source: 'shipping_reversal_service' });
        if (!r.posted) logger.warn({ reversalId: result.reversalId, reason: r.reason, detail: r.detail }, '[ShadowLedger] recordShippingCostReversed ignorado — fluxo real não afetado');
      } catch (err: any) {
        logger.error({ reversalId: result.reversalId, error: err?.message }, '[ShadowLedger] recordShippingCostReversed falhou — fluxo real não afetado; repetível (idempotente)');
      }
    }, true);
  } catch (err: any) {
    logger.error({ reversalId: result.reversalId, error: err?.message }, '[ShadowLedger] flush da reversão de frete falhou — o worker recuperará');
  }
  return result;
}
