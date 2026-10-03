/**
 * FASE D18-C5.2 — expiração automática de pedidos pending_payment cuja
 * reserva de estoque (stock_reservations) já venceu, sem nenhum pagamento
 * confirmado. Resolve a lacuna operacional identificada na auditoria da
 * D18-C5.1: Orange Money/TeleTaku (e qualquer outro método sem confirmação
 * automática) podiam deixar um pedido pending_payment para sempre, com
 * inventory.quantityReserved preso indefinidamente.
 *
 * ARQUITETURA — MESMO padrão já real e testado de
 * escrowAutoReleaseService.ts/refundRecoveryService.ts, nenhuma segunda
 * arquitetura de job:
 *   - este arquivo só decide QUAIS orderIds são candidatos (pré-seleção,
 *     NUNCA a decisão final) e chama
 *     OrderService.cancelExpiredPendingPaymentOrder(orderId, tx), a única
 *     função que de fato cancela — ela revalida tudo do zero sob
 *     pg_advisory_xact_lock(hashtext(orderId)), a MESMA chave já usada por
 *     PaymentService.initiatePayment/confirmOrderPayment/
 *     releaseEscrowForOrder, serializando naturalmente contra uma
 *     confirmação de pagamento concorrente para o mesmo pedido;
 *   - cada candidato é processado em sua PRÓPRIA transação, sequencialmente,
 *     com try/catch isolado — um candidato corrompido/com erro inesperado
 *     nunca aborta o lote inteiro (mesmo padrão de processOneCandidate em
 *     escrowAutoReleaseService.ts);
 *   - nenhum node-cron/setInterval/BullMQ worker novo — o gatilho periódico
 *     real é scripts/run-pending-payment-expiration.ts, pensado para o MESMO
 *     Render Cron Job já usado para o auto-release de escrow.
 *
 * PURCHASE GROUPS (D18-C7.3): a seleção por pedido abaixo continua excluindo
 * orders.purchaseGroupId preenchido (o pagamento de um purchase_group trava
 * hashtext(purchaseGroupId) e tem sua própria máquina de estados
 * candidate/primary/surplus). Esses pedidos — desde D16-I2, TODO checkout
 * novo — são tratados por findExpiredPendingPaymentGroupCandidates +
 * OrderService.cancelExpiredPendingPaymentGroup, que cancela o group inteiro
 * (todos os children) de forma atômica sob os mesmos locks de
 * confirmPurchaseGroupPayment.
 *
 * NÃO é específico de Orange Money/TeleTaku — funciona para QUALQUER pedido
 * pending_payment com reserva expirada, independente de paymentMethod (PIX
 * incluso, se algum dia ficar pending_payment além da janela de reserva —
 * nenhum comportamento do PIX foi alterado, esta é só uma seleção genérica
 * por status/pagamento/reserva, nunca um branch por método).
 */
import { getDb } from '../../../db/index.js';
import { orders, stockReservations } from '../../../db/schema.js';
import { eq, and, lte, isNull, isNotNull, asc } from 'drizzle-orm';
import { logger } from '../../infra/logger.js';
import { OrderService } from './orderService.js';
import { cancelExternalCharge } from '../payments/externalChargeCancellationService.js';

export const PENDING_PAYMENT_EXPIRATION_DEFAULT_BATCH_SIZE = 50;
export const PENDING_PAYMENT_EXPIRATION_MAX_BATCH_SIZE = 200;

export type PendingPaymentExpirationOrderStatus = 'cancelled' | 'skipped' | 'failed';

export interface PendingPaymentExpirationOrderResult {
  orderId: string;
  status: PendingPaymentExpirationOrderStatus;
  code: string;
}

export interface PendingPaymentExpirationGroupResult {
  purchaseGroupId: string;
  status: PendingPaymentExpirationOrderStatus;
  code: string;
  orderIds?: string[];
}

export interface PendingPaymentExpirationRunResult {
  status: 'completed';
  batchSize: number;
  candidateCount: number;
  results: PendingPaymentExpirationOrderResult[];
  // FASE D18-C7.3 — aditivo: purchase_groups (todo checkout novo) expirados
  // pelo MESMO job, group inteiro de cada vez.
  groupCandidateCount: number;
  groupResults: PendingPaymentExpirationGroupResult[];
}

/**
 * Pré-seleção — nunca a decisão final (a decisão real acontece dentro de
 * OrderService.cancelExpiredPendingPaymentOrder, sob lock). Filtra por
 * orders.paymentStatus/status/purchaseGroupId AQUI (não só na função de
 * cancelamento) para nunca deixar pedidos já pagos (cujo stock_reservations
 * só vira 'confirmed' no despacho físico, ver shipmentService.ts — podendo
 * ficar 'active' e "expirado" por bastante tempo depois de pago) ocuparem
 * vagas do batch à frente de candidatos genuinamente elegíveis.
 */
async function findExpiredPendingPaymentOrderCandidates(db: any, batchSize: number): Promise<string[]> {
  const rows = await db
    .selectDistinct({ orderId: orders.id, createdAt: orders.createdAt })
    .from(orders)
    .innerJoin(stockReservations, eq(stockReservations.orderId, orders.id))
    .where(and(
      eq(orders.status, 'pending_payment'),
      eq(orders.paymentStatus, 'pending'),
      isNull(orders.purchaseGroupId),
      eq(stockReservations.status, 'active'),
      lte(stockReservations.expiresAt, new Date()),
    ))
    .orderBy(asc(orders.createdAt))
    .limit(batchSize);
  return rows.map((r: any) => r.orderId);
}

/**
 * FASE D18-C7.3 — pré-seleção de purchase_groups (nunca a decisão final: a
 * decisão real, sob lock, é OrderService.cancelExpiredPendingPaymentGroup).
 */
async function findExpiredPendingPaymentGroupCandidates(db: any, batchSize: number): Promise<string[]> {
  const rows = await db
    .selectDistinct({ purchaseGroupId: orders.purchaseGroupId })
    .from(orders)
    .innerJoin(stockReservations, eq(stockReservations.orderId, orders.id))
    .where(and(
      eq(orders.status, 'pending_payment'),
      eq(orders.paymentStatus, 'pending'),
      isNotNull(orders.purchaseGroupId),
      eq(stockReservations.status, 'active'),
      lte(stockReservations.expiresAt, new Date()),
    ))
    .orderBy(asc(orders.purchaseGroupId))
    .limit(batchSize);
  return rows.map((r: any) => r.purchaseGroupId as string);
}

/** Disjuntor por execução: depois de N cancelamentos externos seguidos sem confirmação (provider fora do ar), os groups que dependem de chamada externa são adiados — nunca um job de minutos por timeout em cadeia. */
export const EXTERNAL_CANCELLATION_BREAKER_THRESHOLD = 3;
interface ExternalCancellationBreaker { consecutiveUnconfirmed: number }

/**
 * Um group por vez, com try/catch isolado (mesmo padrão dos pedidos).
 *
 * FASE D18-C7.3B — sequência (NENHUMA transação/advisory lock do Postgres
 * fica aberta durante a chamada HTTP ao provider):
 *   1. tx curta (lock do group + dos children): revalida TUDO e, se houver
 *      cobrança externa conhecida, devolve a lista SEM escrever nada;
 *   2. SEM transação: cancela cada cobrança externa e a CONFIRMA por leitura;
 *   3. tx curta (mesmos locks): revalida TUDO de novo e só então cancela o
 *      group/children e libera o estoque.
 * Qualquer cobrança paga/não confirmada => nada muda localmente (adiado para
 * a próxima execução, que é idempotente).
 */
async function processOneGroupCandidate(db: any, purchaseGroupId: string, breaker: ExternalCancellationBreaker): Promise<PendingPaymentExpirationGroupResult> {
  try {
    let result = await db.transaction((tx: any) => OrderService.cancelExpiredPendingPaymentGroup(purchaseGroupId, tx));

    if (!result.cancelled && result.code === 'PURCHASE_GROUP_EXTERNAL_CANCELLATION_REQUIRED' && result.externalPaymentsToCancel?.length) {
      if (breaker.consecutiveUnconfirmed >= EXTERNAL_CANCELLATION_BREAKER_THRESHOLD) {
        logger.info({ purchaseGroupId }, 'PENDING_PAYMENT_EXPIRATION_GROUP_SKIPPED');
        return { purchaseGroupId, status: 'skipped', code: 'PURCHASE_GROUP_EXTERNAL_PROVIDER_BREAKER_OPEN' };
      }

      const confirmedPaymentIds: string[] = [];
      for (const external of result.externalPaymentsToCancel) {
        const outcome = await cancelExternalCharge(external);
        if (outcome.outcome === 'CANCELLED_CONFIRMED') {
          breaker.consecutiveUnconfirmed = 0;
          confirmedPaymentIds.push(external.paymentId);
          continue;
        }
        if (outcome.outcome === 'PAID_OR_IN_PROGRESS') {
          breaker.consecutiveUnconfirmed = 0;
          logger.warn({ purchaseGroupId, paymentId: external.paymentId, providerStatus: outcome.providerStatus }, 'PENDING_PAYMENT_EXPIRATION_GROUP_EXTERNAL_CHARGE_PAID_OR_IN_PROGRESS');
          return { purchaseGroupId, status: 'skipped', code: 'PURCHASE_GROUP_EXTERNAL_CHARGE_PAID_OR_IN_PROGRESS' };
        }
        breaker.consecutiveUnconfirmed += 1;
        logger.warn({ purchaseGroupId, paymentId: external.paymentId, reason: outcome.reason }, 'PENDING_PAYMENT_EXPIRATION_GROUP_EXTERNAL_CANCELLATION_UNCONFIRMED');
        return { purchaseGroupId, status: 'skipped', code: 'PURCHASE_GROUP_EXTERNAL_CANCELLATION_UNCONFIRMED' };
      }

      result = await db.transaction((tx: any) =>
        OrderService.cancelExpiredPendingPaymentGroup(purchaseGroupId, tx, { externallyCancelledPaymentIds: confirmedPaymentIds })
      );
      if (!result.cancelled && result.code === 'PURCHASE_GROUP_EXTERNAL_CANCELLATION_REQUIRED') {
        // Surgiu uma cobrança nova entre o cancelamento externo e a 2ª revalidação — adia, nunca expira às cegas.
        result = { cancelled: false, code: 'PURCHASE_GROUP_PAYMENT_CHANGED_DURING_EXPIRATION' };
      }
    }

    if (!result.cancelled) {
      logger.info({ purchaseGroupId, code: result.code }, 'PENDING_PAYMENT_EXPIRATION_GROUP_SKIPPED');
      return { purchaseGroupId, status: 'skipped', code: result.code };
    }
    logger.info({ purchaseGroupId, orderCount: result.orderIds?.length ?? 0 }, 'PENDING_PAYMENT_EXPIRATION_GROUP_CANCELLED');
    return { purchaseGroupId, status: 'cancelled', code: 'CANCELLED', orderIds: result.orderIds };
  } catch (err: any) {
    logger.warn({ purchaseGroupId, error: err?.code || 'UNEXPECTED_ERROR' }, 'PENDING_PAYMENT_EXPIRATION_GROUP_FAILED');
    return { purchaseGroupId, status: 'failed', code: err?.code || 'UNEXPECTED_ERROR' };
  }
}

/**
 * Processa UM candidato de forma totalmente independente — uma falha aqui
 * nunca aborta o lote inteiro (try/catch por orderId). Cada chamada abre sua
 * PRÓPRIA transação (nunca reaproveitada entre candidatos).
 */
async function processOneCandidate(db: any, orderId: string): Promise<PendingPaymentExpirationOrderResult> {
  try {
    const result = await db.transaction((tx: any) => OrderService.cancelExpiredPendingPaymentOrder(orderId, tx));
    if (!result.cancelled) {
      logger.info({ orderId, code: result.code }, 'PENDING_PAYMENT_EXPIRATION_ORDER_SKIPPED');
      return { orderId, status: 'skipped', code: result.code };
    }
    logger.info({ orderId }, 'PENDING_PAYMENT_EXPIRATION_ORDER_CANCELLED');
    return { orderId, status: 'cancelled', code: 'CANCELLED' };
  } catch (err: any) {
    // Nunca loga a mensagem crua (pode conter detalhes internos) — só o
    // orderId, mesmo critério de escrowAutoReleaseService.ts.
    logger.warn({ orderId, error: err?.code || 'UNEXPECTED_ERROR' }, 'PENDING_PAYMENT_EXPIRATION_ORDER_FAILED');
    return { orderId, status: 'failed', code: err?.code || 'UNEXPECTED_ERROR' };
  }
}

/**
 * Ponto de entrada único do job. Chamado por: o endpoint interno protegido
 * (POST /internal/jobs/expire-pending-payments), o runner de linha de
 * comando (scripts/run-pending-payment-expiration.ts), e os testes.
 */
export async function runPendingPaymentExpirationOnce(options?: { batchSize?: number; db?: any }): Promise<PendingPaymentExpirationRunResult> {
  const db = options?.db ?? getDb();
  if (!db) throw new Error('Banco de dados indisponível.');

  logger.info({}, 'PENDING_PAYMENT_EXPIRATION_JOB_STARTED');

  const batchSize = Math.min(Math.max(Math.floor(options?.batchSize ?? PENDING_PAYMENT_EXPIRATION_DEFAULT_BATCH_SIZE), 1), PENDING_PAYMENT_EXPIRATION_MAX_BATCH_SIZE);
  const candidateOrderIds = await findExpiredPendingPaymentOrderCandidates(db, batchSize);

  logger.info({ candidateCount: candidateOrderIds.length }, 'PENDING_PAYMENT_EXPIRATION_CANDIDATES_FOUND');

  const results: PendingPaymentExpirationOrderResult[] = [];
  for (const orderId of candidateOrderIds) {
    try {
      results.push(await processOneCandidate(db, orderId));
    } catch (unexpectedErr: any) {
      logger.warn({ orderId, code: 'UNEXPECTED_ERROR' }, 'PENDING_PAYMENT_EXPIRATION_ORDER_FAILED');
      results.push({ orderId, status: 'failed', code: 'UNEXPECTED_ERROR' });
    }
  }

  const candidateGroupIds = await findExpiredPendingPaymentGroupCandidates(db, batchSize);
  logger.info({ groupCandidateCount: candidateGroupIds.length }, 'PENDING_PAYMENT_EXPIRATION_GROUP_CANDIDATES_FOUND');

  const groupResults: PendingPaymentExpirationGroupResult[] = [];
  const breaker: ExternalCancellationBreaker = { consecutiveUnconfirmed: 0 };
  for (const purchaseGroupId of candidateGroupIds) {
    try {
      groupResults.push(await processOneGroupCandidate(db, purchaseGroupId, breaker));
    } catch {
      groupResults.push({ purchaseGroupId, status: 'failed', code: 'UNEXPECTED_ERROR' });
    }
  }

  logger.info(
    {
      candidateCount: candidateOrderIds.length,
      cancelled: results.filter((r) => r.status === 'cancelled').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      failed: results.filter((r) => r.status === 'failed').length,
      groupCandidateCount: candidateGroupIds.length,
      groupsCancelled: groupResults.filter((r) => r.status === 'cancelled').length,
      groupsSkipped: groupResults.filter((r) => r.status === 'skipped').length,
      groupsFailed: groupResults.filter((r) => r.status === 'failed').length,
    },
    'PENDING_PAYMENT_EXPIRATION_JOB_COMPLETED'
  );

  return { status: 'completed', batchSize, candidateCount: candidateOrderIds.length, results, groupCandidateCount: candidateGroupIds.length, groupResults };
}
