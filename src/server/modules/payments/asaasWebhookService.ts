import { getDb } from '../../../db/index.js';
import { payments, orders, paymentWebhookEvents, purchaseGroups, refunds } from '../../../db/schema.js';
import { eq, and, isNull, isNotNull, inArray } from 'drizzle-orm';
import { PaymentService } from './paymentService.js';
import { processRefund, reconcileReservedRefund, ASAAS_RECONCILIABLE_LOCAL_STATUSES } from './refundService.js';
import { observeChargeback, extractRawChargeback } from './chargebackService.js';
import { logger } from '../../infra/logger.js';
import crypto from 'crypto';

export interface AsaasWebhookPayload {
  id: string;
  event: string;
  dateCreated?: string;
  payment?: {
    id: string;
    customer?: string;
    value?: number;
    netValue?: number;
    billingType?: string;
    status?: string;
    externalReference?: string;
    confirmedDate?: string;
    paymentDate?: string;
    // Fase C5.3-C1 — sub-objeto opcional, presente quando a cobrança tem (ou
    // já teve) um chargeback associado (PaymentChargebackResponseDTO, ver
    // C5.3-A.1). Tipo deliberadamente `unknown`/`any` aqui — a sanitização
    // e validação de campos acontece exclusivamente em
    // chargebackService.ts/asaasChargeback.ts, nunca confiando no shape
    // bruto do webhook.
    chargeback?: unknown;
  };
}

export class AsaasWebhookService {
  /**
   * Safe comparison helper for webhook access tokens.
   */
  private static isTokenValid(tokenHeader: string | undefined): boolean {
    const configuredToken = process.env.ASAAS_WEBHOOK_AUTH_TOKEN;
    if (!configuredToken || !configuredToken.trim()) {
      return false;
    }
    if (!tokenHeader || !tokenHeader.trim()) {
      return false;
    }

    const headerClean = tokenHeader.trim();
    const configClean = configuredToken.trim();

    if (headerClean.length !== configClean.length) {
      return false;
    }

    try {
      return crypto.timingSafeEqual(Buffer.from(headerClean), Buffer.from(configClean));
    } catch {
      return headerClean === configClean;
    }
  }

  /**
   * Fase C5.2-D.6 — REGRA CENTRAL: o webhook NUNCA aplica refund financeiro
   * diretamente. Para um payment GROUP (PRIMARY ou SURPLUS), os eventos
   * agregados de refund (`PAYMENT_REFUND_IN_PROGRESS`/
   * `PAYMENT_PARTIALLY_REFUNDED`/`PAYMENT_REFUNDED`) servem SÓ de TRIGGER:
   * descobrem quais refunds locais provider-managed NÃO-TERMINAIS existem
   * para este payment e chamam `reconcileReservedRefund` (Fase C5.2-D.5)
   * para cada um — NUNCA inferem qual child foi refunded, NUNCA usam o
   * valor/amount do payload do webhook, NUNCA chamam POST/refundPayment. O
   * único caminho de efeito financeiro é o mesmo de sempre: GET + description
   * (`providerCorrelationKey`) + amount, dentro de `reconcileReservedRefund`.
   *
   * Cada refundId é reconciliado de forma INDEPENDENTE (seção 15 do
   * pedido): uma falha ao reconciliar RA nunca impede RB, nunca "propaga"
   * para o payment inteiro — nunca transforma o payment em failed.
   */
  private static async triggerGroupRefundReconciliation(
    db: any,
    localPayment: typeof payments.$inferSelect,
    context: { eventId: string; eventType: string; asaasPaymentId: string }
  ): Promise<void> {
    // Seção 8 — CANDIDATE nunca deveria ter refund provider-managed válido
    // (só payments 'paid' chegam a ser refunded, e candidate nunca é
    // 'paid') — fail closed, log seguro, nenhuma ação, nenhum efeito.
    if (localPayment.settlementRole === 'candidate') {
      logger.warn({ ...context, paymentId: localPayment.id }, '[Asaas Webhook] Evento de refund para payment settlementRole="candidate" — estruturalmente inesperado, nenhuma ação tomada (fail closed).');
      return;
    }

    let eligible: { id: string }[];
    if (localPayment.settlementRole === 'primary') {
      // Seção 6 — refunds de child order financiados por este PRIMARY.
      eligible = await db.select({ id: refunds.id }).from(refunds).where(and(
        eq(refunds.paymentId, localPayment.id),
        isNotNull(refunds.orderId),
        isNotNull(refunds.providerCorrelationKey),
        inArray(refunds.status, ASAAS_RECONCILIABLE_LOCAL_STATUSES as unknown as string[])
      ));
    } else if (localPayment.settlementRole === 'surplus') {
      // Seção 7/22 — só o refund do PRÓPRIO surplus, nunca de children/PRIMARY
      // (filtro estrito por paymentId, nunca por purchaseGroupId sozinho).
      eligible = await db.select({ id: refunds.id }).from(refunds).where(and(
        eq(refunds.paymentId, localPayment.id),
        isNull(refunds.orderId),
        eq(refunds.purchaseGroupId, localPayment.purchaseGroupId!),
        isNotNull(refunds.providerCorrelationKey),
        inArray(refunds.status, ASAAS_RECONCILIABLE_LOCAL_STATUSES as unknown as string[])
      ));
    } else {
      // Nunca deveria acontecer — payments_settlement_role_check só permite
      // candidate/primary/surplus. Defensivo, fail closed.
      logger.warn({ ...context, paymentId: localPayment.id, settlementRole: localPayment.settlementRole }, '[Asaas Webhook] settlementRole inesperado para reconciliação de refund — nenhuma ação tomada.');
      return;
    }

    if (eligible.length === 0) {
      // Seção 9 — evento de refund agregado sem NENHUM refund local
      // correlacionável (ex.: estorno feito diretamente no painel Asaas).
      // NUNCA inferir/criar um refund automaticamente, NUNCA usar o amount
      // do payload para "adivinhar" qual child — só diagnóstico seguro para
      // intervenção/reconciliação manual futura.
      logger.warn({ ...context, paymentId: localPayment.id, settlementRole: localPayment.settlementRole }, 'GROUP_REFUND_WEBHOOK_WITHOUT_LOCAL_INTENT');
      return;
    }

    // Seção 10/15 — permitido disparar reconciliação para TODOS os
    // elegíveis: cada `reconcileReservedRefund` faz seu próprio GET e só
    // encontra/finaliza a SUA própria correlationKey — nunca assume que o
    // evento pertence a um refund específico. Independência total: uma
    // falha aqui nunca afeta os outros refundIds da lista.
    for (const { id: refundId } of eligible) {
      try {
        const result = await reconcileReservedRefund(refundId);
        logger.info({ ...context, refundId, outcome: result.outcome, localStatus: result.localStatus, providerStatus: result.providerStatus }, '[Asaas Webhook] Reconciliação de refund disparada pelo evento agregado');
      } catch (err: any) {
        logger.error({ ...context, refundId, error: err?.message }, '[Asaas Webhook] Falha ao reconciliar refund individual — outros refunds do mesmo payment não são afetados.');
      }
    }
  }

  /**
   * Main entry point for processing incoming Asaas webhooks.
   *
   * `executor` opcional (mesmo padrão de PaymentService/payoutService/
   * refundService): permite injetar uma conexão/transação já aberta — usado
   * pelos testes reais contra Postgres Docker, nunca chamado em produção (lá
   * sempre usa getDb() como antes, comportamento idêntico ao anterior a esta
   * mudança).
   */
  static async processWebhook(tokenHeader: string | undefined, payload: AsaasWebhookPayload, executor?: any) {
    const configuredToken = process.env.ASAAS_WEBHOOK_AUTH_TOKEN;

    // 1. Token Configuration Verification
    if (!configuredToken || !configuredToken.trim()) {
      logger.error('[Asaas Webhook Error] Token de autenticação de webhook (ASAAS_WEBHOOK_AUTH_TOKEN) não configurado no servidor.');
      const err: any = new Error('Token de autenticação de webhook do Asaas não configurado no servidor.');
      err.code = 'ASAAS_WEBHOOK_NOT_CONFIGURED';
      err.status = 401;
      throw err;
    }

    // 2. Token Authentication
    if (!this.isTokenValid(tokenHeader)) {
      logger.warn('[Asaas Webhook Warning] Tentativa de acesso com token de webhook inválido ou ausente.');
      const err: any = new Error('Token de webhook Asaas inválido.');
      err.code = 'INVALID_ASAAS_WEBHOOK_TOKEN';
      err.status = 401;
      throw err;
    }

    // 3. Payload Basic Validation
    if (!payload || !payload.id || !payload.event || !payload.payment || !payload.payment.id) {
      const err: any = new Error('Payload de webhook Asaas inválido.');
      err.code = 'INVALID_WEBHOOK_PAYLOAD';
      err.status = 400;
      throw err;
    }

    const eventId = payload.id;
    const eventType = payload.event;
    const paymentData = payload.payment;
    const asaasPaymentId = paymentData.id;

    // Nunca logar CPF/token/API key — só IDs e o tipo do evento.
    logger.info({ eventId, eventType, asaasPaymentId }, 'PAYMENT_WEBHOOK_RECEIVED');

    const db = executor ?? getDb();
    if (!db) {
      const err: any = new Error('Banco de dados indisponível para processamento de webhook.');
      err.code = 'DATABASE_UNAVAILABLE';
      err.status = 500;
      throw err;
    }

    // 4. Atomic Claim & Idempotency Check via payment_webhook_events
    const webhookRecordId = `whe_asaas_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const sanitizedPayload = {
      id: payload.id,
      event: payload.event,
      dateCreated: payload.dateCreated,
      payment: {
        id: paymentData.id,
        customer: paymentData.customer,
        value: paymentData.value,
        netValue: paymentData.netValue,
        billingType: paymentData.billingType,
        status: paymentData.status,
        externalReference: paymentData.externalReference,
        confirmedDate: paymentData.confirmedDate,
        paymentDate: paymentData.paymentDate,
      },
    };

    try {
      await db.insert(paymentWebhookEvents).values({
        id: webhookRecordId,
        provider: 'asaas',
        eventType: eventType,
        eventId: eventId,
        payloadJson: sanitizedPayload,
        processed: false,
        createdAt: new Date(),
      });
    } catch (insertErr: any) {
      // ON CONFLICT / UNIQUE CONSTRAINT VIOLATION:
      // Another concurrent worker or request has already claimed this eventId.
      const existingEvents = await db
        .select()
        .from(paymentWebhookEvents)
        .where(and(eq(paymentWebhookEvents.provider, 'asaas'), eq(paymentWebhookEvents.eventId, eventId)))
        .limit(1);

      if (existingEvents.length > 0) {
        const ev = existingEvents[0];

        if (ev.processed) {
          logger.info({ eventId, eventType, asaasPaymentId }, 'PAYMENT_ALREADY_PROCESSED');
          return {
            success: true,
            duplicate: true,
            message: 'Evento já processado anteriormente.',
          };
        }

        // Correção crítica (idempotência real de retry — seção 9/10):
        // processed=false aqui significa que uma tentativa ANTERIOR para
        // este MESMO eventId (mesma entrega do Asaas, ou uma corrida
        // concorrente) nunca chegou a concluir (ex.: falha de rede/DB no
        // meio do processamento). Antes, esse caso caía no mesmo "duplicate"
        // acima e NUNCA reprocessava — um pedido pago podia ficar preso para
        // sempre se a 1ª tentativa falhasse depois de reservar o eventId.
        // Agora continua o processamento reaproveitando a MESMA linha (nunca
        // cria uma segunda) — seguro mesmo sob corrida real: confirmOrderPayment
        // é idempotente (early-return se já pago) e escrow_accounts.order_id
        // tem UNIQUE constraint, então duas tentativas verdadeiramente
        // concorrentes nunca duplicam escrow/payment, só uma delas vence.
        logger.info({ eventId, eventType, asaasPaymentId }, 'PAYMENT_ALREADY_PROCESSED (evento reservado sem conclusão anterior — reprocessando com segurança)');
      } else {
        throw insertErr;
      }
    }

    // 6. Locate Local Payment Record — por transactionRef direto (inalterado).
    const localPayments = await db
      .select()
      .from(payments)
      .where(and(eq(payments.provider, 'asaas'), eq(payments.transactionRef, asaasPaymentId)))
      .limit(1);

    // Fase C4.1 (seção 3/4/16) — RECONCILIAÇÃO: só tentada quando (a) não
    // achamos por transactionRef, (b) o evento é PAYMENT_RECEIVED (único
    // financeiramente crítico o bastante para justificar reconciliação —
    // qualquer outro evento sem match direto segue o comportamento
    // "registrado, não pertence a esta instância" de sempre) e (c)
    // externalReference aponta para um purchase_group que realmente existe.
    // A reconciliação em si (achar o candidate INEQUÍVOCO, validar
    // valor/moeda/attempt, vincular transactionRef) acontece DENTRO de
    // PaymentService.confirmPurchaseGroupPayment, sob o advisory lock do
    // group, na MESMA transação da confirmação — nunca aqui, fora de lock.
    let reconciliationGroupId: string | null = null;
    if (localPayments.length === 0 && eventType === 'PAYMENT_RECEIVED' && paymentData.externalReference) {
      const [maybeGroup] = await db.select({ id: purchaseGroups.id }).from(purchaseGroups).where(eq(purchaseGroups.id, paymentData.externalReference)).limit(1);
      if (maybeGroup) {
        reconciliationGroupId = maybeGroup.id;
      }
    }

    if (localPayments.length === 0 && !reconciliationGroupId) {
      logger.warn({ eventId, eventType, asaasPaymentId }, '[Asaas Webhook] Pagamento não encontrado na base local Mercado Nusali.');
      await db
        .update(paymentWebhookEvents)
        .set({ processed: true, processedAt: new Date() })
        .where(and(eq(paymentWebhookEvents.provider, 'asaas'), eq(paymentWebhookEvents.eventId, eventId)));

      return {
        success: true,
        message: 'Evento registrado, pagamento não pertence a esta instância.',
      };
    }

    // ==========================================================================
    // FASE C4.1 — BRANCH GROUP VIA RECONCILIAÇÃO: localPayments vazio, mas
    // externalReference resolveu um purchase_group existente. Não há UMA
    // order a validar aqui (steps 7-9 legados não se aplicam) — toda
    // correspondência/validação acontece dentro de
    // confirmPurchaseGroupPayment, sob lock, na mesma transação.
    // ==========================================================================
    if (localPayments.length === 0 && reconciliationGroupId) {
      try {
        await PaymentService.confirmPurchaseGroupPayment(reconciliationGroupId, null, {
          provider: 'asaas',
          transactionRef: asaasPaymentId,
          receivedValue: Number(paymentData.value),
          performedBy: 'asaas_webhook',
        });
        logger.info({ eventId, purchaseGroupId: reconciliationGroupId, asaasPaymentId }, 'PURCHASE_GROUP_PAYMENT_RECONCILED_AND_CONFIRMED');
      } catch (err: any) {
        if (err.code === 'PURCHASE_GROUP_PAYMENT_NO_RECONCILIABLE_CANDIDATE') {
          // FAIL CLOSED — seção 4/16: nenhum candidate inequívoco. Mesmo
          // tratamento de "pagamento não encontrado": evento registrado
          // (payload completo já persistido no passo 4) para reconciliação
          // manual futura — ZERO efeito financeiro, nenhuma linha nova
          // criada automaticamente.
          logger.warn({ eventId, purchaseGroupId: reconciliationGroupId, asaasPaymentId, error: err.message }, 'PURCHASE_GROUP_PAYMENT_RECONCILIATION_FAILED — nenhum candidate inequívoco, evento registrado para reconciliação manual');
          await db
            .update(paymentWebhookEvents)
            .set({ processed: true, processedAt: new Date() })
            .where(and(eq(paymentWebhookEvents.provider, 'asaas'), eq(paymentWebhookEvents.eventId, eventId)));
          return {
            success: true,
            message: 'Evento registrado, nenhuma tentativa local reconciliável encontrada.',
          };
        }
        logger.error({ eventId, purchaseGroupId: reconciliationGroupId, asaasPaymentId, error: err.message }, 'PURCHASE_GROUP_PAYMENT_RECONCILIATION_ERROR');
        throw err;
      }

      await db
        .update(paymentWebhookEvents)
        .set({ processed: true, processedAt: new Date() })
        .where(and(eq(paymentWebhookEvents.provider, 'asaas'), eq(paymentWebhookEvents.eventId, eventId)));

      return { success: true, message: `Webhook ${eventType} processado com sucesso (group payment reconciliado).` };
    }

    const localPayment = localPayments[0];

    // ==========================================================================
    // FASE C4.1 — BRANCH: legacy (orderId) vs group (purchaseGroupId).
    // payments_owner_exclusive_check garante que exatamente um dos dois é
    // não-nulo — os dois caminhos nunca se misturam.
    // ==========================================================================
    if (localPayment.purchaseGroupId) {
      const [group] = await db.select().from(purchaseGroups).where(eq(purchaseGroups.id, localPayment.purchaseGroupId)).limit(1);
      if (!group) {
        logger.error({ purchaseGroupId: localPayment.purchaseGroupId }, '[Asaas Webhook] Purchase_group associado ao payment não foi encontrado.');
        const err: any = new Error(`Compra ${localPayment.purchaseGroupId} não encontrada.`);
        err.code = 'PURCHASE_GROUP_NOT_FOUND';
        err.status = 404;
        throw err;
      }

      // Mesma checagem de externalReference/moeda do legacy (steps 8-9),
      // só que contra o GROUP em vez de uma order individual.
      if (paymentData.externalReference && paymentData.externalReference !== group.id) {
        logger.error({ payloadRef: paymentData.externalReference, purchaseGroupId: group.id }, '[Asaas Webhook Error] Divergência de referência externa (externalReference mismatch) — group payment.');
        await db.update(paymentWebhookEvents).set({ processed: true, processedAt: new Date() }).where(and(eq(paymentWebhookEvents.provider, 'asaas'), eq(paymentWebhookEvents.eventId, eventId)));
        const err: any = new Error(`Divergência de referência externa: ${paymentData.externalReference} !== ${group.id}.`);
        err.code = 'ASAAS_WEBHOOK_REFERENCE_MISMATCH';
        err.status = 400;
        throw err;
      }

      if (group.currency.toUpperCase() !== 'BRL') {
        logger.error({ currency: group.currency }, '[Asaas Webhook Error] Moeda incompatível para processamento Asaas PIX — group payment.');
        await db.update(paymentWebhookEvents).set({ processed: true, processedAt: new Date() }).where(and(eq(paymentWebhookEvents.provider, 'asaas'), eq(paymentWebhookEvents.eventId, eventId)));
        const err: any = new Error(`Moeda incompatível: ${group.currency} !== BRL.`);
        err.code = 'ASAAS_CURRENCY_MISMATCH';
        err.status = 400;
        throw err;
      }

      logger.info({ eventId, eventType, asaasPaymentId, purchaseGroupId: group.id }, '[Asaas Webhook] Processando evento (group payment)...');

      switch (eventType) {
        case 'PAYMENT_CREATED':
        case 'PAYMENT_UPDATED': {
          await db.update(payments).set({ updatedAt: new Date() }).where(eq(payments.id, localPayment.id));
          break;
        }

        case 'PAYMENT_CONFIRMED': {
          // Fase C5.3-C1, seção 18/20 — CONFIRMED normal (sem chargeback)
          // continua EXATAMENTE como antes. Só quando o payload traz
          // `payment.chargeback` (cenário documentado: reversão a favor do
          // lojista faz o payment voltar por CONFIRMED/RECEIVED —
          // C5.3-A.1, seção 3.4) é que observamos o objeto — nunca
          // assumindo que o evento em si significa "revertido". Erro aqui
          // propaga (nunca é engolido) para preservar retry (seção 27).
          const rawCb = extractRawChargeback(paymentData);
          if (rawCb !== undefined) {
            await observeChargeback(db, localPayment, rawCb, { eventId, eventType, asaasPaymentId });
          }
          logger.info({ purchaseGroupId: group.id, asaasPaymentId }, '[Asaas Webhook] Evento PAYMENT_CONFIRMED (group) registrado. Aguardando PAYMENT_RECEIVED para confirmação financeira.');
          break;
        }

        case 'PAYMENT_RECEIVED': {
          const rawCbReceived = extractRawChargeback(paymentData);
          if (rawCbReceived !== undefined) {
            await observeChargeback(db, localPayment, rawCbReceived, { eventId, eventType, asaasPaymentId });
          }
          try {
            await PaymentService.confirmPurchaseGroupPayment(group.id, localPayment.id, {
              provider: 'asaas',
              transactionRef: asaasPaymentId,
              receivedValue: Number(paymentData.value),
              performedBy: 'asaas_webhook',
            });
            logger.info({ purchaseGroupId: group.id, asaasPaymentId }, 'PAYMENT_POST_PROCESSING_COMPLETED (group)');
          } catch (postProcessingErr: any) {
            logger.error({ purchaseGroupId: group.id, asaasPaymentId, error: postProcessingErr?.message }, 'PAYMENT_POST_PROCESSING_FAILED (group)');
            throw postProcessingErr;
          }
          break;
        }

        case 'PAYMENT_OVERDUE': {
          await db.update(payments).set({ status: 'expired', updatedAt: new Date() }).where(eq(payments.id, localPayment.id));
          logger.info({ purchaseGroupId: group.id, asaasPaymentId }, '[Asaas Webhook] Evento PAYMENT_OVERDUE (group) processado: pagamento marcado como expirado.');
          break;
        }

        case 'PAYMENT_REFUND_IN_PROGRESS':
        case 'PAYMENT_PARTIALLY_REFUNDED':
        case 'PAYMENT_REFUNDED': {
          // Fase C5.2-D.6 — CORREÇÃO do achado da auditoria (seção 1 do
          // relatório): esta branch ANTES marcava `payments.status='refunded'`
          // incondicionalmente aqui, o que CONTRADIZ diretamente o agregado
          // já estabelecido pela Fase C5.2-D.5 (`applyOrderRefundFinancialEffects`:
          // o PRIMARY só vira 'refunded' quando TODOS os children já foram
          // refunded — nunca por um único evento agregado do webhook). Essa
          // escrita direta foi REMOVIDA — `payments.status` de um payment
          // GROUP (primary OU surplus) agora só é escrito pelos helpers de
          // efeito econômico da D.5, nunca por este webhook.
          //
          // Fase C5.3-C1, seção 19 — MUITO IMPORTANTE: a Asaas reutiliza
          // PAYMENT_REFUNDED tanto para refund voluntário QUANTO para
          // chargeback perdido (C5.3-A.1, seção 3.4/4). Se o payload traz
          // `payment.chargeback`, este evento NÃO é tratado como refund
          // voluntário — é só OBSERVADO (zero débito, zero
          // reconcileReservedRefund chamado "como se fosse" refund). Sem
          // `chargeback` no payload, o comportamento é BYTE A BYTE o mesmo
          // de D.6 (trigger de reconciliação do refund provider-managed já
          // reservado localmente).
          const rawCbRefundGroup = extractRawChargeback(paymentData);
          if (rawCbRefundGroup !== undefined) {
            await observeChargeback(db, localPayment, rawCbRefundGroup, { eventId, eventType, asaasPaymentId });
            break;
          }
          // Os três eventos abaixo NUNCA são autoridade sobre qual refund
          // individual mudou (seção 11 do pedido) — servem apenas de TRIGGER
          // para `reconcileReservedRefund`, que faz seu próprio GET +
          // correlação por description/amount. Nenhum POST é chamado a
          // partir daqui.
          await AsaasWebhookService.triggerGroupRefundReconciliation(db, localPayment, { eventId, eventType, asaasPaymentId });
          break;
        }

        case 'PAYMENT_DELETED': {
          await db.update(payments).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(payments.id, localPayment.id));
          logger.info({ purchaseGroupId: group.id, asaasPaymentId }, '[Asaas Webhook] Evento PAYMENT_DELETED (group) recebido e registrado.');
          break;
        }

        case 'PAYMENT_CHARGEBACK_REQUESTED':
        case 'PAYMENT_CHARGEBACK_DISPUTE':
        case 'PAYMENT_AWAITING_CHARGEBACK_REVERSAL': {
          // Fase C5.3-C1 — os 3 eventos passam a persistir o estado
          // observado em payment_chargebacks (identidade por
          // chargeback.id, nunca por evento/payment sozinho — C5.3-B/A.1).
          // ZERO efeito financeiro: nenhuma wallet/escrow/allocation/order/
          // payments.status é tocada aqui, em nenhum dos 3 casos.
          const rawCbGroupDedicated = extractRawChargeback(paymentData);
          if (rawCbGroupDedicated === undefined) {
            logger.warn({ purchaseGroupId: group.id, asaasPaymentId, eventId, eventType }, '[Asaas Webhook] Evento de chargeback (group) SEM objeto payment.chargeback no payload — nenhuma observação persistida.');
            break;
          }
          await observeChargeback(db, localPayment, rawCbGroupDedicated, { eventId, eventType, asaasPaymentId });
          break;
        }

        default: {
          logger.info({ eventType, eventId }, '[Asaas Webhook] Evento não mapeado (group) recebido e registrado com sucesso.');
          break;
        }
      }

      await db
        .update(paymentWebhookEvents)
        .set({ processed: true, processedAt: new Date() })
        .where(and(eq(paymentWebhookEvents.provider, 'asaas'), eq(paymentWebhookEvents.eventId, eventId)));

      return {
        success: true,
        message: `Webhook ${eventType} processado com sucesso (group payment).`,
      };
    }

    // ---- A PARTIR DAQUI: BRANCH LEGACY (localPayment.orderId != null),
    // byte a byte inalterado desde antes da Fase C4.1. ----

    // 7. Fetch Associated Order for Validations
    const localOrders = await db.select().from(orders).where(eq(orders.id, localPayment.orderId)).limit(1);
    if (localOrders.length === 0) {
      logger.error({ orderId: localPayment.orderId }, '[Asaas Webhook] Pedido associado ao pagamento não foi encontrado.');
      const err: any = new Error(`Pedido ${localPayment.orderId} não encontrado.`);
      err.code = 'ORDER_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const order = localOrders[0];

    // 8. Validate External Reference (if present in payload)
    if (paymentData.externalReference && paymentData.externalReference !== order.id) {
      logger.error({ payloadRef: paymentData.externalReference, orderId: order.id }, '[Asaas Webhook Error] Divergência de referência externa (externalReference mismatch).');
      await db
        .update(paymentWebhookEvents)
        .set({ processed: true, processedAt: new Date() })
        .where(and(eq(paymentWebhookEvents.provider, 'asaas'), eq(paymentWebhookEvents.eventId, eventId)));

      const err: any = new Error(`Divergência de referência externa: ${paymentData.externalReference} !== ${order.id}.`);
      err.code = 'ASAAS_WEBHOOK_REFERENCE_MISMATCH';
      err.status = 400;
      throw err;
    }

    // 9. Validate Currency
    if (order.currency.toUpperCase() !== 'BRL') {
      logger.error({ currency: order.currency }, '[Asaas Webhook Error] Moeda incompatível para processamento Asaas PIX.');
      await db
        .update(paymentWebhookEvents)
        .set({ processed: true, processedAt: new Date() })
        .where(and(eq(paymentWebhookEvents.provider, 'asaas'), eq(paymentWebhookEvents.eventId, eventId)));

      const err: any = new Error(`Moeda incompatível: ${order.currency} !== BRL.`);
      err.code = 'ASAAS_CURRENCY_MISMATCH';
      err.status = 400;
      throw err;
    }

    // 10. Process Event According to Type
    logger.info({ eventId, eventType, asaasPaymentId, orderId: order.id }, '[Asaas Webhook] Processando evento...');

    switch (eventType) {
      case 'PAYMENT_CREATED':
      case 'PAYMENT_UPDATED': {
        // Update local payment raw response metadata
        await db
          .update(payments)
          .set({ updatedAt: new Date() })
          .where(eq(payments.id, localPayment.id));
        break;
      }

      case 'PAYMENT_CONFIRMED': {
        // Fase C5.3-C1, seção 18/20 — igual ao branch group: sem
        // `payment.chargeback` no payload, comportamento intocado. Com
        // chargeback presente, só observa (nunca assume "revertido" pelo
        // nome do evento).
        const rawCbConfirmedLegacy = extractRawChargeback(paymentData);
        if (rawCbConfirmedLegacy !== undefined) {
          await observeChargeback(db, localPayment, rawCbConfirmedLegacy, { eventId, eventType, asaasPaymentId });
        }
        // POLICY NOTE: Asaas defines PAYMENT_CONFIRMED when payment is approved, but funds are not necessarily settled yet.
        // Nusali policy records this intermediate status and waits for PAYMENT_RECEIVED before invoking confirmOrderPayment() and Escrow Hold.
        logger.info({ orderId: order.id, asaasPaymentId }, '[Asaas Webhook] Evento PAYMENT_CONFIRMED registrado. Aguardando evento PAYMENT_RECEIVED para confirmação financeira.');
        break;
      }

      case 'PAYMENT_RECEIVED': {
        const rawCbReceivedLegacy = extractRawChargeback(paymentData);
        if (rawCbReceivedLegacy !== undefined) {
          await observeChargeback(db, localPayment, rawCbReceivedLegacy, { eventId, eventType, asaasPaymentId });
        }
        // 10.1 Validate Amount before confirming payment
        const receivedValue = Number(paymentData.value);
        const expectedTotal = Number(order.totalAmount);

        if (isNaN(receivedValue) || Math.abs(receivedValue - expectedTotal) > 0.01) {
          logger.error({ receivedValue, expectedTotal }, '[Asaas Webhook Error] Divergência de valor pago em PAYMENT_RECEIVED.');
          await db
            .update(paymentWebhookEvents)
            .set({ processed: true, processedAt: new Date() })
            .where(and(eq(paymentWebhookEvents.provider, 'asaas'), eq(paymentWebhookEvents.eventId, eventId)));

          const err: any = new Error(`Divergência de valor pago: R$ ${receivedValue} !== R$ ${expectedTotal}.`);
          err.code = 'ASAAS_PAYMENT_AMOUNT_MISMATCH';
          err.status = 400;
          throw err;
        }

        // 10.2 Invoke Centralized Confirmation Service
        // Erro aqui NÃO deve ficar silenciosamente inconsistente: o evento
        // fica marcado como processado no passo 11 mesmo em caso de falha
        // (senão o Asaas reenviaria o MESMO webhook indefinidamente contra
        // um estado que nunca vai se resolver sozinho), mas a falha real é
        // logada explicitamente para investigação/retry manual — nunca
        // engolida.
        try {
          await PaymentService.confirmOrderPayment(order.id, {
            provider: 'asaas',
            transactionRef: asaasPaymentId,
            performedBy: 'asaas_webhook',
          });
          logger.info({ orderId: order.id, asaasPaymentId, amount: expectedTotal }, 'PAYMENT_POST_PROCESSING_COMPLETED');
        } catch (postProcessingErr: any) {
          logger.error({ orderId: order.id, asaasPaymentId, error: postProcessingErr?.message }, 'PAYMENT_POST_PROCESSING_FAILED');
          throw postProcessingErr;
        }
        break;
      }

      case 'PAYMENT_OVERDUE': {
        await db
          .update(payments)
          .set({ status: 'expired', updatedAt: new Date() })
          .where(eq(payments.id, localPayment.id));
        logger.info({ orderId: order.id, asaasPaymentId }, '[Asaas Webhook] Evento PAYMENT_OVERDUE processado: pagamento marcado como expirado.');
        break;
      }

      case 'PAYMENT_REFUNDED': {
        // Fase C5.3-C1, seção 19 — MUITO IMPORTANTE: a Asaas reutiliza o
        // MESMO evento PAYMENT_REFUNDED tanto para um refund voluntário
        // (iniciado por nós/admin) quanto para um chargeback PERDIDO
        // (decisão do emissor do cartão — C5.3-A.1, seção 3.4/4). Antes de
        // qualquer coisa, checamos se o payload traz `payment.chargeback`:
        // se sim, isto NUNCA passa pelo caminho de refund voluntário
        // (processRefund) nem marca payments.status='refunded' aqui — é
        // só OBSERVADO em payment_chargebacks (zero débito, zero mutação
        // de escrow/wallet/allocation/order/payments.status). A
        // contabilização terminal do chargeback fica para uma fase futura
        // (pós-Sandbox), exatamente como já reportado em C5.3-A.
        //
        // Sem `chargeback` no payload, o comportamento é BYTE A BYTE o
        // mesmo de D.6/fases anteriores — nenhuma mudança.
        const rawCbRefundLegacy = extractRawChargeback(paymentData);
        if (rawCbRefundLegacy !== undefined) {
          await observeChargeback(db, localPayment, rawCbRefundLegacy, { eventId, eventType, asaasPaymentId });
          break;
        }

        // Fase "Refund/disputa/chargeback": antes só marcava payments.status —
        // o escrow continuava HELD ou (pior) já RELEASED sem nunca ser
        // revertido, e o vendedor nunca era debitado. Agora aciona a mesma
        // reversão real usada pelo admin. idempotencyKey usa o eventId do
        // próprio webhook Asaas — uma entrega duplicada do mesmo evento (Asaas
        // reenviar o webhook) não reverte o dinheiro duas vezes.
        try {
          // Passa o `executor` ORIGINAL (não o `db` já resolvido acima) —
          // undefined em produção, deixando processRefund abrir e gerenciar a
          // própria transação atômica (comportamento inalterado); só em teste
          // (executor = uma transação já aberta) processRefund escreve dentro
          // dela em vez de tentar getDb() de novo.
          await processRefund({
            orderId: order.id,
            amount: Number(order.totalAmount),
            reason: `Webhook Asaas PAYMENT_REFUNDED (eventId=${eventId}).`,
            idempotencyKey: `payment_refunded_webhook:${eventId}`,
            performedBy: null,
          }, executor);
          logger.info({ orderId: order.id, asaasPaymentId, eventId }, '[Asaas Webhook] PAYMENT_REFUNDED processado: escrow/wallet revertidos.');
        } catch (refundErr: any) {
          // Um refund que já tinha sido processado por outro caminho (ex.:
          // resolução de disputa) não é um erro deste webhook — só registra.
          logger.warn({ orderId: order.id, asaasPaymentId, eventId, error: refundErr?.message }, '[Asaas Webhook] PAYMENT_REFUNDED: processRefund não completou (provavelmente já revertido por outro caminho).');
        }
        await db
          .update(payments)
          .set({ status: 'refunded', updatedAt: new Date() })
          .where(eq(payments.id, localPayment.id));
        break;
      }

      case 'PAYMENT_DELETED': {
        await db
          .update(payments)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(eq(payments.id, localPayment.id));
        logger.info({ orderId: order.id, asaasPaymentId }, '[Asaas Webhook] Evento PAYMENT_DELETED recebido e registrado.');
        break;
      }

      // Fase "Chargeback Asaas real": os 3 eventos abaixo são só ESTÁGIOS
      // intermediários de uma contestação de cartão — nenhum deles, sozinho,
      // significa que o dinheiro já saiu de verdade. O único evento que
      // representa a reversão financeira final é PAYMENT_REFUNDED (tratado
      // acima) — é ele quem chama processRefund(). Os 3 abaixo só REGISTRAM a
      // ocorrência (já persistida em payment_webhook_events pelo passo 4 desta
      // função, com o payload completo) e logam para acompanhamento — nunca
      // debitam o seller, nunca criam um segundo refund. Isso é o que garante
      // "efeito financeiro único" mesmo se a sequência completa
      // REQUESTED -> DISPUTE -> AWAITING_REVERSAL -> REFUNDED chegar inteira:
      // só o último evento move dinheiro, e ele já é idempotente por eventId.
      case 'PAYMENT_CHARGEBACK_REQUESTED':
      case 'PAYMENT_CHARGEBACK_DISPUTE':
      case 'PAYMENT_AWAITING_CHARGEBACK_REVERSAL': {
        // Fase C5.3-C1 — os 3 eventos passam a persistir o estado
        // observado em payment_chargebacks (identidade por chargeback.id).
        // ZERO efeito financeiro: nenhum refund é disparado aqui, nenhuma
        // wallet/escrow/order/payments.status é tocada — só PAYMENT_REFUNDED
        // (tratado acima, com sua própria checagem de payment.chargeback)
        // pode um dia acionar contabilização terminal, e mesmo essa ainda
        // não existe nesta fase.
        const rawCbLegacyDedicated = extractRawChargeback(paymentData);
        if (rawCbLegacyDedicated === undefined) {
          logger.warn({ orderId: order.id, asaasPaymentId, eventId, eventType }, '[Asaas Webhook] Evento de chargeback SEM objeto payment.chargeback no payload — nenhuma observação persistida.');
          break;
        }
        await observeChargeback(db, localPayment, rawCbLegacyDedicated, { eventId, eventType, asaasPaymentId });
        break;
      }

      default: {
        logger.info({ eventType, eventId }, '[Asaas Webhook] Evento não mapeado recebido e registrado com sucesso.');
        break;
      }
    }

    // 11. Mark Webhook Event as Processed
    await db
      .update(paymentWebhookEvents)
      .set({ processed: true, processedAt: new Date() })
      .where(and(eq(paymentWebhookEvents.provider, 'asaas'), eq(paymentWebhookEvents.eventId, eventId)));

    return {
      success: true,
      message: `Webhook ${eventType} processado com sucesso.`,
    };
  }
}
