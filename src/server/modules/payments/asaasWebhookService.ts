import { getDb } from '../../../db/index.js';
import { payments, orders, paymentWebhookEvents } from '../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { PaymentService } from './paymentService.js';
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
   */
  static async processWebhook(tokenHeader: string | undefined, payload: AsaasWebhookPayload) {
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

    const db = getDb();
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
        logger.info(
          { eventId, eventType, asaasPaymentId, processed: ev.processed },
          '[Asaas Webhook] Requisição concorrente ou duplicada detectada via UNIQUE constraint (idempotente).'
        );
        return {
          success: true,
          duplicate: true,
          message: ev.processed
            ? 'Evento já processado anteriormente.'
            : 'Evento em processamento por requisição concorrente.',
        };
      }
      throw insertErr;
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
        await PaymentService.confirmOrderPayment(order.id, {
          provider: 'asaas',
          transactionRef: asaasPaymentId,
          performedBy: 'asaas_webhook',
        });

        logger.info({ orderId: order.id, asaasPaymentId, amount: expectedTotal }, '[Asaas Webhook] PAYMENT_RECEIVED processado com sucesso. Pedido confirmado e Escrow retido em garantia (HELD).');
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
        await db
          .update(payments)
          .set({ status: 'refunded', updatedAt: new Date() })
          .where(eq(payments.id, localPayment.id));
        logger.warn({ orderId: order.id, asaasPaymentId }, '[Asaas Webhook] Evento PAYMENT_REFUNDED recebido e registrado para conciliação.');
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
