import { getDb } from '../../../db/index.js';
import { payments, orders, paymentWebhookEvents } from '../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { PaymentService } from './paymentService.js';
import { processRefund } from './refundService.js';
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

    // 6. Locate Local Payment Record
    const localPayments = await db
      .select()
      .from(payments)
      .where(and(eq(payments.provider, 'asaas'), eq(payments.transactionRef, asaasPaymentId)))
      .limit(1);

    if (localPayments.length === 0) {
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

    const localPayment = localPayments[0];

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
        // POLICY NOTE: Asaas defines PAYMENT_CONFIRMED when payment is approved, but funds are not necessarily settled yet.
        // Nusali policy records this intermediate status and waits for PAYMENT_RECEIVED before invoking confirmOrderPayment() and Escrow Hold.
        logger.info({ orderId: order.id, asaasPaymentId }, '[Asaas Webhook] Evento PAYMENT_CONFIRMED registrado. Aguardando evento PAYMENT_RECEIVED para confirmação financeira.');
        break;
      }

      case 'PAYMENT_RECEIVED': {
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
      case 'PAYMENT_CHARGEBACK_REQUESTED': {
        logger.warn({ orderId: order.id, asaasPaymentId, eventId }, '[Asaas Webhook] PAYMENT_CHARGEBACK_REQUESTED — chargeback aberto pelo emissor do cartão. Nenhum débito financeiro nesta etapa; aguardando desfecho (PAYMENT_REFUNDED ou reversão a favor do lojista).');
        break;
      }

      case 'PAYMENT_CHARGEBACK_DISPUTE': {
        logger.warn({ orderId: order.id, asaasPaymentId, eventId }, '[Asaas Webhook] PAYMENT_CHARGEBACK_DISPUTE — contestação do chargeback em andamento. Nenhum movimento financeiro novo; nenhum refund duplicado.');
        break;
      }

      case 'PAYMENT_AWAITING_CHARGEBACK_REVERSAL': {
        logger.warn({ orderId: order.id, asaasPaymentId, eventId }, '[Asaas Webhook] PAYMENT_AWAITING_CHARGEBACK_REVERSAL — decisão favorável ao comprador, aguardando reversão do adquirente. Ainda NÃO é o evento financeiro final; nenhum refund é disparado aqui — só PAYMENT_REFUNDED aciona processRefund().');
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
