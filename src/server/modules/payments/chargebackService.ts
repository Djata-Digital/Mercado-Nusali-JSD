/**
 * Fase C5.3-C1 — OBSERVAÇÃO de chargeback Asaas em `payment_chargebacks`.
 *
 * ZERO efeito financeiro. Este arquivo NUNCA:
 *   - debita/credita wallet;
 *   - muta escrow_accounts/escrow_transactions;
 *   - muta payment_allocations;
 *   - muta orders;
 *   - muta payments.status;
 *   - chama processRefund/reconcileReservedRefund/applyOrder*FinancialEffects;
 *   - faz qualquer chamada de rede (toda observação vem do payload do
 *     webhook, já autenticado e persistido em payment_webhook_events antes
 *     de chegar aqui).
 *
 * Por isso é um arquivo SEPARADO de refundService.ts (C5.3-A, seção 4:
 * chargeback não é refund — nem a entidade, nem a idempotência, nem a
 * autoridade financeira são reaproveitadas). A única coisa emprestada do
 * refund é a disciplina de campos RAW (nunca CHECK fechado em valores do
 * provider) e o padrão de sanitização em whitelist.
 */
import { paymentChargebacks, payments } from '../../../db/schema.js';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { logger } from '../../infra/logger.js';
import {
  AsaasChargeback,
  ASAAS_AMOUNT_TOLERANCE,
  LocalChargebackStatus,
  classifyChargebackStatus,
  resolveNextLocalStatus,
  sanitizeAsaasChargeback,
} from './types/asaasChargeback.js';

// ============================================================================
// Fase C5.3-C2 — AUTORIDADE DE LOCK compartilhada entre observação de
// chargeback e liberação de escrow (release blocker). ZERO efeito
// financeiro é adicionado por este bloco em si — só a serialização que
// torna o veto de release (paymentService.ts) determinístico contra uma
// observação concorrente de chargeback.
//
// Por que um NOVO nível de lock (paymentId), e não reaproveitar
// order/purchaseGroupId: a auditoria C5.3-C2 (item 13) confirmou que TODO
// pg_advisory_xact_lock existente no projeto é sobre orderId, purchaseGroupId
// ou orderItemId — nunca paymentId. A convenção global já estabelecida
// (desde C4.1) é GROUP → ORDER (grupo sempre adquirido antes de order,
// nunca o inverso — ver refundService.ts). Introduzir paymentId como um
// nível ESTRITAMENTE MAIS INTERNO (adquirido só DEPOIS de order já resolvido
// o funding payment, nunca antes) estende essa ordem sem invertê-la:
//   GROUP → ORDER → PAYMENT
// `observeChargeback` (webhook) SÓ adquire o lock de PAYMENT (nunca
// order/group) — logo não pode inverter nada. `releaseEscrowForOrder` já
// adquire ORDER primeiro (linha existente, inalterada) e só adquire PAYMENT
// depois de resolver o funding payment (também inalterado em posição
// relativa) — logo segue a mesma ordem. Nenhum caminho no projeto adquire
// PAYMENT antes de ORDER ou GROUP — sem isso, não há ciclo possível.
//
// Mesma convenção de hash já usada em todo o projeto (hashtext bare, sem
// namespace) — orderId/purchaseGroupId/orderItemId já compartilham o mesmo
// espaço de 32 bits sem incidente conhecido; manter o mesmo padrão para
// paymentId preserva consistência em vez de inventar uma convenção nova só
// para este caso (risco de colisão cruzada already-accepted, negligível).
export async function acquirePaymentChargebackAuthorityLock(tx: any, paymentId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${paymentId}))`);
}

/**
 * Estados locais que IMPEDEM release (C5.3-C2, item 8) — decisão explícita
 * do pedido, auditada contra C1 sem contradição encontrada:
 *   active         — chargeback em andamento, risco não resolvido.
 *   lost           — perda confirmada; enquanto a contabilização terminal
 *                    (C5.3-D) não existir, bloquear é a única forma de não
 *                    deixar o seller receber depois de sabermos que o
 *                    dinheiro já foi perdido.
 *   manual_review  — estado não confiável/conflitante por definição (C1) —
 *                    liberar o seller sob risco não resolvido é perigoso.
 * NÃO bloqueia:
 *   reversed       — chargeback resolvido a favor do lojista, sem débito
 *                    pendente.
 */
export const BLOCKING_CHARGEBACK_LOCAL_STATUSES: readonly LocalChargebackStatus[] = ['active', 'lost', 'manual_review'];

export class ActivePaymentChargebackError extends Error {
  code = 'ACTIVE_PAYMENT_CHARGEBACK';
  paymentId: string;
  blockingLocalStatus: LocalChargebackStatus;
  constructor(paymentId: string, blockingLocalStatus: LocalChargebackStatus) {
    // Mensagem segura (item 19 do pedido): nenhum payload bruto do provider,
    // nenhum chargeback.id, nenhum dado de cartão — só o suficiente para o
    // admin/seller entenderem POR QUE a liberação foi recusada.
    super(`ACTIVE_PAYMENT_CHARGEBACK: o pagamento financiador deste pedido possui um chargeback em andamento (estado local "${blockingLocalStatus}") — liberação de escrow bloqueada até resolução.`);
    this.name = 'ActivePaymentChargebackError';
    this.paymentId = paymentId;
    this.blockingLocalStatus = blockingLocalStatus;
  }
}

/**
 * Veto de release (C5.3-C2) — ÚNICA função econômica nova desta fase: nunca
 * debita/credita nada, só lança se houver chargeback bloqueante. Deve ser
 * chamada DENTRO da mesma transação financeira que fará o release (nunca
 * antes, nunca fora — item 10 do pedido), com `paymentId` já resolvido pela
 * autoridade existente (`resolveFundingPaymentForOrder`).
 *
 * Adquire o MESMO lock (`acquirePaymentChargebackAuthorityLock`) que
 * `observeChargeback` adquire antes de gravar um chargeback — isso é o que
 * torna a corrida release×chargeback determinística (item 11/12 do pedido):
 * quem adquirir o lock do paymentId primeiro decide a ordem; a outra parte
 * espera. Usa o índice existente `payment_chargebacks_payment_active_idx`
 * (payment_id, local_status) — nenhum scan por purchaseGroupId.
 */
export async function assertNoBlockingChargebackForPayment(tx: any, paymentId: string): Promise<void> {
  await acquirePaymentChargebackAuthorityLock(tx, paymentId);

  const blocking = await tx
    .select({ id: paymentChargebacks.id, localStatus: paymentChargebacks.localStatus })
    .from(paymentChargebacks)
    .where(and(eq(paymentChargebacks.paymentId, paymentId), inArray(paymentChargebacks.localStatus, BLOCKING_CHARGEBACK_LOCAL_STATUSES as unknown as string[])))
    .limit(1);

  if (blocking.length > 0) {
    throw new ActivePaymentChargebackError(paymentId, blocking[0].localStatus as LocalChargebackStatus);
  }
}

export interface ObserveChargebackContext {
  eventId: string;
  eventType: string;
  /** payload.payment.id do webhook — usado SÓ para validar identidade contra
   * chargeback.payment (seção 8/32 do pedido), nunca para localizar o
   * payment (isso já aconteceu antes, no chamador). */
  asaasPaymentId: string;
}

export type ObserveChargebackOutcome =
  | { outcome: 'OBSERVED'; created: boolean; chargebackRowId: string; localStatus: LocalChargebackStatus; providerStatus: string }
  | { outcome: 'SKIPPED_NO_CHARGEBACK_OBJECT' }
  | { outcome: 'SKIPPED_UNSUPPORTED_PROVIDER'; reason: string }
  | { outcome: 'SKIPPED_PAYMENT_ID_MISMATCH'; reason: string }
  | { outcome: 'SKIPPED_INVALID_VALUE'; reason: string };

/**
 * Observa (INSERT ou UPDATE) um chargeback a partir de `payment.chargeback`
 * já presente no payload de um webhook Asaas. `db` é o MESMO executor
 * (pool/drizzle instance de teste ou produção) já em uso pelo resto de
 * `asaasWebhookService.ts` — nunca já uma transação ativa nos chamadores
 * atuais. Nenhuma chamada de rede é feita (seção 27 do pedido).
 *
 * Fase C5.3-C2 — esta função agora ABRE sua PRÓPRIA transação
 * (`db.transaction`) que adquire o lock de autoridade do paymentId
 * (`acquirePaymentChargebackAuthorityLock`) ANTES de ler/gravar
 * `payment_chargebacks` — é o que torna a corrida contra
 * `assertNoBlockingChargebackForPayment` (release) determinística, nunca um
 * TOCTOU (ver chargebackService.ts, bloco de autoridade de lock no topo do
 * arquivo).
 *
 * Contrato de propagação de erro (crash safety, seção 27): qualquer erro
 * lançado aqui DEVE subir sem ser engolido pelo chamador para os eventos
 * dedicados de chargeback e para PAYMENT_REFUNDED/CONFIRMED/RECEIVED quando
 * `chargeback` está presente — isso impede que `payment_webhook_events`
 * seja marcado `processed=true` antes da observação ter de fato persistido,
 * preservando a mesma garantia de retry já usada por PAYMENT_RECEIVED.
 */
export async function observeChargeback(
  db: any,
  localPayment: typeof payments.$inferSelect,
  rawChargeback: unknown,
  context: ObserveChargebackContext
): Promise<ObserveChargebackOutcome> {
  const sanitized = sanitizeAsaasChargeback(rawChargeback);
  if (!sanitized) {
    return { outcome: 'SKIPPED_NO_CHARGEBACK_OBJECT' };
  }

  // Seção 8 — identidade: só reconhecemos chargeback de 'asaas' (o único
  // provider que este webhook processa) e só associamos ao payment cuja
  // própria referência do provider (chargeback.payment) bate com o
  // asaasPaymentId do evento — nunca por externalReference/inferência.
  if (localPayment.provider !== 'asaas') {
    const reason = `localPayment.provider="${localPayment.provider}" != "asaas" — chargeback Asaas nunca associado a um payment de outro provider.`;
    logger.error({ ...context, paymentId: localPayment.id, provider: localPayment.provider }, 'CHARGEBACK_OBSERVE_UNSUPPORTED_PROVIDER');
    return { outcome: 'SKIPPED_UNSUPPORTED_PROVIDER', reason };
  }
  if (sanitized.payment && sanitized.payment !== context.asaasPaymentId) {
    const reason = `chargeback.payment="${sanitized.payment}" != asaasPaymentId do evento="${context.asaasPaymentId}" — fail closed, nenhuma associação criada.`;
    logger.error({ ...context, paymentId: localPayment.id, chargebackPaymentField: sanitized.payment }, 'CHARGEBACK_OBSERVE_PAYMENT_ID_MISMATCH');
    return { outcome: 'SKIPPED_PAYMENT_ID_MISMATCH', reason };
  }

  // Seção 9/31 — value precisa ser > 0 (mesmo CHECK do schema) só para o
  // INSERT ser sequer possível. NUNCA substituído por payment.amount.
  const value = sanitized.value;
  if (!Number.isFinite(value) || value <= 0) {
    const reason = `chargeback.value inválido/não numérico/<=0: ${JSON.stringify(sanitized.value)} — nenhuma row criada (violaria CHECK value > 0).`;
    logger.error({ ...context, paymentId: localPayment.id, providerChargebackId: sanitized.id }, 'CHARGEBACK_OBSERVE_INVALID_VALUE');
    return { outcome: 'SKIPPED_INVALID_VALUE', reason };
  }
  if (!sanitized.id) {
    const reason = 'chargeback.id ausente/vazio — nenhuma row criada (providerChargebackId é NOT NULL).';
    logger.error({ ...context, paymentId: localPayment.id }, 'CHARGEBACK_OBSERVE_MISSING_ID');
    return { outcome: 'SKIPPED_INVALID_VALUE', reason };
  }

  // Seção 9/31 (segunda parte) — value MAIOR que o payment local não é
  // corrigido nem descartado (o CHECK só exige > 0), mas NUNCA autoriza uma
  // classificação de confiança normal: força manual_review, tanto na
  // primeira observação quanto como "candidate" da transição monotônica
  // (nunca regride um terminal já resolvido só por isso — ver
  // resolveNextLocalStatus).
  const localAmount = Number(localPayment.amount);
  const valueExceedsPayment = Number.isFinite(localAmount) && value > localAmount + ASAAS_AMOUNT_TOLERANCE;
  if (valueExceedsPayment) {
    logger.warn({ ...context, paymentId: localPayment.id, providerChargebackId: sanitized.id, chargebackValue: value, paymentAmount: localAmount }, 'CHARGEBACK_OBSERVE_VALUE_EXCEEDS_PAYMENT_AMOUNT');
  }

  // Seção 25 — settlementRole='candidate' é estado estruturalmente
  // inconsistente para um chargeback (candidate nunca chega a 'paid').
  // Persistimos para nunca perder observabilidade, mas SEMPRE manual_review.
  const settlementRoleIsCandidate = localPayment.settlementRole === 'candidate';
  if (settlementRoleIsCandidate) {
    logger.warn({ ...context, paymentId: localPayment.id, providerChargebackId: sanitized.id }, 'CHARGEBACK_OBSERVE_CANDIDATE_SETTLEMENT_ROLE');
  }

  const forceManualReview = settlementRoleIsCandidate || valueExceedsPayment;
  const candidate: LocalChargebackStatus = forceManualReview ? 'manual_review' : classifyChargebackStatus(sanitized.status);

  // providerRawResponse: whitelist EXPLÍCITA (nunca o objeto bruto, nunca o
  // webhook inteiro) — seção 7 do pedido. `creditCard` deliberadamente
  // ausente (ver asaasChargeback.ts).
  const providerRawResponse = {
    id: sanitized.id,
    payment: sanitized.payment,
    installment: sanitized.installment,
    customerAccount: sanitized.customerAccount,
    status: sanitized.status,
    reason: sanitized.reason,
    disputeStartDate: sanitized.disputeStartDate,
    value: sanitized.value,
    paymentDate: sanitized.paymentDate,
    disputeStatus: sanitized.disputeStatus,
    deadlineToSendDisputeDocuments: sanitized.deadlineToSendDisputeDocuments,
  };

  const parseDate = (v: string | null): Date | null => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  // Fase C5.3-C2 — TUDO abaixo roda dentro de UMA transação que primeiro
  // adquire o MESMO lock de autoridade (paymentId) que
  // `assertNoBlockingChargebackForPayment` (release) adquire. Isso é o que
  // torna a corrida release×chargeback determinística (item 11/12/16/17 do
  // pedido): se o release já detém o lock deste paymentId, esta transação
  // espera até o release commitar (CASO A: release legitimamente já
  // aconteceu antes do chargeback existir); se esta transação adquire o
  // lock primeiro, o release espera e encontrará a row já commitada (CASO
  // B: bloqueio efetivo). Nenhuma das duas ordens produz estado
  // intermediário inconsistente — só ordem determinística.
  return db.transaction(async (tx: any) => {
    await acquirePaymentChargebackAuthorityLock(tx, localPayment.id);

    const existingRows = await tx
      .select()
      .from(paymentChargebacks)
      .where(and(eq(paymentChargebacks.provider, 'asaas'), eq(paymentChargebacks.providerChargebackId, sanitized.id)))
      .limit(1);

    if (existingRows.length > 0) {
      const existing = existingRows[0];
      const nextLocalStatus = resolveNextLocalStatus(existing.localStatus as LocalChargebackStatus, candidate);
      await tx
        .update(paymentChargebacks)
        .set({
          // providerStatus/providerDisputeStatus/providerReason/datas/value:
          // sempre a ÚLTIMA observação bruta recebida (raw = "o que a última
          // entrega disse"), independente de localStatus regredir ou não —
          // mesma separação já usada por refunds (raw vs. interpretação
          // local, D.1/D.2). Nunca inventamos um valor "corrigido".
          providerStatus: sanitized.status,
          providerDisputeStatus: sanitized.disputeStatus,
          providerReason: sanitized.reason,
          value: String(value.toFixed(2)),
          disputeStartDate: parseDate(sanitized.disputeStartDate),
          deadlineToSendDisputeDocuments: parseDate(sanitized.deadlineToSendDisputeDocuments),
          localStatus: nextLocalStatus,
          providerRawResponse,
          lastSeenEventId: context.eventId,
          updatedAt: new Date(),
        })
        .where(eq(paymentChargebacks.id, existing.id));

      logger.info(
        { ...context, chargebackRowId: existing.id, providerChargebackId: sanitized.id, previousLocalStatus: existing.localStatus, localStatus: nextLocalStatus, providerStatus: sanitized.status },
        'CHARGEBACK_OBSERVED_UPDATED'
      );
      return { outcome: 'OBSERVED', created: false, chargebackRowId: existing.id, localStatus: nextLocalStatus, providerStatus: sanitized.status } as const;
    }

    const newId = `cb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    try {
      await tx.insert(paymentChargebacks).values({
        id: newId,
        paymentId: localPayment.id,
        purchaseGroupId: localPayment.purchaseGroupId ?? null,
        provider: 'asaas',
        providerChargebackId: sanitized.id,
        providerStatus: sanitized.status,
        providerDisputeStatus: sanitized.disputeStatus,
        providerReason: sanitized.reason,
        value: String(value.toFixed(2)),
        // currency NUNCA vem do provider (o objeto chargeback não tem esse
        // campo — C5.3-A.1) — sempre snapshot do payment financiador local
        // (seção 10 do pedido).
        currency: localPayment.currency,
        disputeStartDate: parseDate(sanitized.disputeStartDate),
        deadlineToSendDisputeDocuments: parseDate(sanitized.deadlineToSendDisputeDocuments),
        localStatus: candidate,
        providerRawResponse,
        firstSeenEventId: context.eventId,
        lastSeenEventId: context.eventId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      logger.info(
        { ...context, chargebackRowId: newId, providerChargebackId: sanitized.id, localStatus: candidate, providerStatus: sanitized.status },
        'CHARGEBACK_OBSERVED_CREATED'
      );
      return { outcome: 'OBSERVED', created: true, chargebackRowId: newId, localStatus: candidate, providerStatus: sanitized.status } as const;
    } catch (insertErr: any) {
      // Corrida real (seção 29 do pedido): duas entregas de eventos
      // DIFERENTES para o MESMO chargeback.id processadas concorrentemente —
      // payment_webhook_events já deduplica pelo MESMO eventId, mas não
      // impede que REQUESTED (evento A) e IN_DISPUTE (evento B) cheguem quase
      // simultaneamente. UNIQUE(provider, providerChargebackId) barra o
      // segundo INSERT — reaproveita o MESMO padrão de
      // insert-then-catch-conflict-then-reconsulta já usado para
      // payment_webhook_events neste mesmo módulo (asaasWebhookService.ts).
      // Sob o MESMO lock de paymentId, esta corrida é entre dois
      // chargeback.id DIFERENTES do MESMO payment — o lock não impede isso
      // (propositalmente: são identidades de chargeback distintas, não uma
      // disputa sobre a MESMA row), só serializa contra o release.
      const raceRows = await tx
        .select()
        .from(paymentChargebacks)
        .where(and(eq(paymentChargebacks.provider, 'asaas'), eq(paymentChargebacks.providerChargebackId, sanitized.id)))
        .limit(1);
      if (raceRows.length === 0) throw insertErr; // não era conflito de identidade — erro real, propaga (seção 27)

      const existing = raceRows[0];
      const nextLocalStatus = resolveNextLocalStatus(existing.localStatus as LocalChargebackStatus, candidate);
      await tx
        .update(paymentChargebacks)
        .set({
          providerStatus: sanitized.status,
          providerDisputeStatus: sanitized.disputeStatus,
          providerReason: sanitized.reason,
          value: String(value.toFixed(2)),
          disputeStartDate: parseDate(sanitized.disputeStartDate),
          deadlineToSendDisputeDocuments: parseDate(sanitized.deadlineToSendDisputeDocuments),
          localStatus: nextLocalStatus,
          providerRawResponse,
          lastSeenEventId: context.eventId,
          updatedAt: new Date(),
        })
        .where(eq(paymentChargebacks.id, existing.id));

      logger.info(
        { ...context, chargebackRowId: existing.id, providerChargebackId: sanitized.id, previousLocalStatus: existing.localStatus, localStatus: nextLocalStatus, providerStatus: sanitized.status, race: true },
        'CHARGEBACK_OBSERVED_UPDATED_AFTER_RACE'
      );
      return { outcome: 'OBSERVED', created: false, chargebackRowId: existing.id, localStatus: nextLocalStatus, providerStatus: sanitized.status } as const;
    }
  });
}

/** Helper puro (seção 6 do pedido) — extrai `payment.chargeback` do payload
 * bruto do webhook sem decidir nada; usado pelo webhook service só para
 * decidir SE deve chamar observeChargeback, nunca para classificar. */
export function extractRawChargeback(paymentData: any): unknown {
  return paymentData && typeof paymentData === 'object' ? paymentData.chargeback : undefined;
}

export type { AsaasChargeback };
