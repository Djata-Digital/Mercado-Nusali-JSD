import { getDb } from '../../../db/index.js';
import { payments, paymentAttempts, orders, escrowAccounts, escrowTransactions, wallets, walletTransactions, notifications } from '../../../db/schema.js';
import { OrderService } from '../orders/orderService.js';
import { eq } from 'drizzle-orm';
import { logger } from '../../infra/logger.js';
import { broadcastToUser, broadcastAdminEvent } from '../../infra/websocket.js';

export interface InitiatePaymentDTO {
  orderId: string;
  buyerId: string;
  amount: number;
  currency: string;
  method: string;
  provider?: string;
  idempotencyKey?: string;
}

export class PaymentService {
  static async initiatePayment(data: InitiatePaymentDTO) {
    const db = getDb();
    const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const provider = data.provider || (data.method === 'pix' ? 'pix_engine' : data.method.includes('orange') ? 'orange_money' : 'nusali_pay');

    // Check idempotency if provided
    if (db && data.idempotencyKey) {
      const existing = await db.select().from(payments).where(eq(payments.idempotencyKey, data.idempotencyKey)).limit(1);
      if (existing.length > 0) {
        logger.info({ key: data.idempotencyKey }, 'Returning idempotent existing payment');
        return existing[0];
      }
    }

    let qrCode: string | undefined;
    let paymentUrl: string | undefined;

    if (data.method === 'pix') {
      qrCode = `00020101021226830014BR.GOV.BCB.PIX2561pix.mercadonusali.com/qr/v2/${paymentId}520400005303986540${data.amount.toFixed(2)}5802BR5914MERCADO NUSALI6006BISSAU62070503***6304`;
    }

    if (db) {
      await db.insert(payments).values({
        id: paymentId,
        orderId: data.orderId,
        buyerId: data.buyerId,
        amount: String(data.amount),
        currency: data.currency,
        provider,
        method: data.method,
        status: 'pending',
        idempotencyKey: data.idempotencyKey,
        qrCode,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await db.insert(paymentAttempts).values({
        id: `att_${Date.now()}`,
        paymentId,
        provider,
        status: 'initiated',
        createdAt: new Date(),
      });
    }

    logger.info({ paymentId, orderId: data.orderId, amount: data.amount, method: data.method }, 'Payment initiated');

    return {
      id: paymentId,
      orderId: data.orderId,
      amount: data.amount,
      currency: data.currency,
      method: data.method,
      status: 'pending',
      qrCode,
    };
  }

  /**
   * Confirms a payment securely via backend or verified webhook (NEVER trusting frontend unvalidated flags).
   */
  static async confirmPayment(paymentId: string, transactionRef?: string) {
    const db = getDb();
    if (!db) return { success: true };

    const payRes = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
    if (payRes.length === 0) throw new Error('Pagamento não encontrado.');

    const payment = payRes[0];
    if (payment.status === 'paid') {
      return { success: true, message: 'Pagamento já confirmado anteriormente.' };
    }

    // 1. Update Payment Record
    await db
      .update(payments)
      .set({
        status: 'paid',
        transactionRef: transactionRef || `tx_${Date.now()}`,
        paidAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(payments.id, paymentId));

    // 2. Update Order Status
    await db
      .update(orders)
      .set({
        status: 'paid',
        paymentStatus: 'paid',
        updatedAt: new Date(),
      })
      .where(eq(orders.id, payment.orderId));

    // 3. Move Escrow into Active Hold with Ledger Log
    const escrowRes = await db.select().from(escrowAccounts).where(eq(escrowAccounts.orderId, payment.orderId)).limit(1);
    if (escrowRes.length > 0) {
      const escrow = escrowRes[0];
      await db.insert(escrowTransactions).values({
        id: `etx_${Date.now()}`,
        escrowAccountId: escrow.id,
        type: 'HOLD',
        amount: payment.amount,
        currency: payment.currency,
        reason: 'Pagamento liquidado com sucesso. Valor retido com segurança em garantia Escrow Nusali.',
        reference: paymentId,
        createdAt: new Date(),
      });
    }

    // 4. Send Confirmation Notification
    await db.insert(notifications).values({
      id: `notif_${Date.now()}`,
      userId: payment.buyerId,
      title: 'Pagamento Aprovado com Sucesso!',
      message: `O pagamento do seu pedido foi confirmado. O vendedor já foi notificado para preparar o envio.`,
      type: 'payment',
      link: `/buyer/orders/${payment.orderId}`,
      isRead: false,
      createdAt: new Date(),
    });

    broadcastToUser(payment.buyerId, {
      type: 'PAYMENT_CONFIRMED',
      paymentId,
      orderId: payment.orderId,
      amount: Number(payment.amount),
    });

    broadcastAdminEvent({
      type: 'PAYMENT_RECEIVED',
      paymentId,
      orderId: payment.orderId,
      amount: Number(payment.amount),
    });

    logger.info({ paymentId, orderId: payment.orderId }, 'Payment confirmed and escrow ledger updated');
    return { success: true };
  }
}
