import { getDb } from '../../../db/index.js';
import { users, sellers, payments, paymentAttempts, orders, escrowAccounts, escrowTransactions, orderStatusHistory, notifications, shipments, wallets, walletTransactions, ledgerEntries, ledgerAccounts } from '../../../db/schema.js';
import { syncOrderFulfillmentStatus } from '../orders/orderService.js';
import { eq, and, ne, sql } from 'drizzle-orm';
import { logger } from '../../infra/logger.js';
import { broadcastToUser, broadcastAdminEvent } from '../../infra/websocket.js';
import { AsaasPaymentProvider } from './providers/asaasPaymentProvider.js';
import { FinancialLedgerService } from '../ledger/financialLedgerService.js';

export interface InitiatePaymentDTO {
  orderId: string;
  buyerId: string;
  amount?: number;
  currency?: string;
  method: string;
  provider?: string;
  idempotencyKey?: string;
}

export interface ConfirmOrderPaymentOptions {
  provider?: string;
  transactionRef?: string;
  performedBy?: string;
}

/**
 * Erro financeiro explícito — lançado quando o pedido não tem os snapshots
 * financeiros necessários para liberar o escrow com segurança. Nunca inventamos
 * um valor nem caímos de volta para escrow.amount bruto (Fase 6, correção do
 * achado CRÍTICO B). Pedidos legado/fixture sem esse snapshot precisam de
 * tratamento manual separado — esta função não tenta adivinhar por eles.
 */
export class MissingFinancialSnapshotError extends Error {
  constructor(orderId: string, detail: string) {
    super(`MISSING_FINANCIAL_SNAPSHOT: pedido ${orderId} não pode liberar escrow — ${detail}. escrow.amount bruto nunca é usado como fallback.`);
    this.name = 'MissingFinancialSnapshotError';
  }
}

/**
 * Fonte de verdade do valor a creditar ao vendedor na liberação do escrow:
 * SEMPRE orders.sellerNetAmount — o snapshot financeiro gravado no momento da
 * criação do pedido (orderService.ts). Nunca o valor bruto do escrow (que inclui
 * frete e a comissão da Nusali) e nunca recalculado com a regra de comissão
 * vigente no momento do release — a regra pode ter mudado desde a criação do
 * pedido; usar o snapshot preserva exatamente o que foi cobrado do comprador
 * naquele momento (Fase 6, correção do achado CRÍTICO B).
 */
export function calculateSellerReleaseAmount(order: { id: string; sellerNetAmount: string | number | null | undefined }): number {
  if (order.sellerNetAmount === null || order.sellerNetAmount === undefined) {
    throw new MissingFinancialSnapshotError(order.id, 'orders.sellerNetAmount ausente');
  }
  const amount = Number(order.sellerNetAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new MissingFinancialSnapshotError(order.id, `orders.sellerNetAmount inválido (${order.sellerNetAmount})`);
  }
  return amount;
}

export class PaymentService {
  /**
   * Initiates a payment for an order.
   *
   * SECURITY (Fase 4A hardening): the amount and currency actually charged/recorded are
   * ALWAYS derived from the real `orders` row in Postgres — never from the client-supplied
   * `data.amount`/`data.currency`. If the client sends an explicit value that diverges from
   * the order, the request is rejected (not silently corrected), so a stale/buggy frontend
   * surfaces as an error instead of a hidden amount mismatch. Ownership (order.buyerId ===
   * data.buyerId), payment eligibility (not already paid, not cancelled) and idempotency
   * across concurrent initiations for the same order are enforced here, before any gateway
   * call, via a Postgres advisory lock scoped to the order id for the duration of this
   * transaction.
   */
  static async initiatePayment(data: InitiatePaymentDTO) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível.');

    if (!data.orderId || !String(data.orderId).trim()) {
      const err: any = new Error('ORDER_ID_REQUIRED: O identificador do pedido é obrigatório para iniciar um pagamento.');
      err.code = 'ORDER_ID_REQUIRED';
      err.status = 400;
      throw err;
    }
    if (!data.buyerId) {
      const err: any = new Error('UNAUTHORIZED: Comprador não identificado.');
      err.code = 'UNAUTHORIZED';
      err.status = 401;
      throw err;
    }

    return await db.transaction(async (tx) => {
      // Serialize concurrent initiate-payment calls for the SAME order. The lock is held for
      // the whole transaction (including the external gateway call below) and released
      // automatically on commit/rollback, so a second concurrent call for the same orderId
      // blocks here until the first one has fully created (or reused) its payment record.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${data.orderId}))`);

      const [order] = await tx.select().from(orders).where(eq(orders.id, data.orderId)).limit(1);
      if (!order) {
        const err: any = new Error(`Pedido "${data.orderId}" não foi encontrado.`);
        err.code = 'ORDER_NOT_FOUND';
        err.status = 404;
        throw err;
      }

      if (order.buyerId !== data.buyerId) {
        const err: any = new Error('Você não tem permissão para iniciar pagamento para este pedido.');
        err.code = 'FORBIDDEN_ORDER_ACCESS';
        err.status = 403;
        throw err;
      }

      if (order.paymentStatus === 'paid') {
        const err: any = new Error('ORDER_ALREADY_PAID: Este pedido já foi pago.');
        err.code = 'ORDER_ALREADY_PAID';
        err.status = 409;
        throw err;
      }

      if (order.status === 'cancelled') {
        const err: any = new Error('ORDER_NOT_PAYABLE: Este pedido foi cancelado e não pode mais ser pago.');
        err.code = 'ORDER_NOT_PAYABLE';
        err.status = 409;
        throw err;
      }

      // Source of truth: the real order row. Client-supplied amount/currency are only used
      // to DETECT a mismatch, never to decide what gets charged/recorded.
      const realAmount = Number(order.totalAmount);
      const realCurrency = String(order.currency).toUpperCase();

      if (data.amount !== undefined && data.amount !== null) {
        const clientAmount = Number(data.amount);
        if (isNaN(clientAmount) || Math.abs(clientAmount - realAmount) > 0.01) {
          const err: any = new Error(`PAYMENT_AMOUNT_MISMATCH: O valor informado (${data.amount}) diverge do total real do pedido (${realAmount}).`);
          err.code = 'PAYMENT_AMOUNT_MISMATCH';
          err.status = 400;
          throw err;
        }
      }
      if (data.currency && String(data.currency).trim().toUpperCase() !== realCurrency) {
        const err: any = new Error(`PAYMENT_CURRENCY_MISMATCH: A moeda informada (${data.currency}) diverge da moeda real do pedido (${realCurrency}).`);
        err.code = 'PAYMENT_CURRENCY_MISMATCH';
        err.status = 400;
        throw err;
      }

      const provider = data.provider || (data.method === 'pix' ? 'pix_engine' : data.method.includes('orange') ? 'orange_money' : 'nusali_pay');

      if (provider === 'asaas') {
        const asaasProvider = new AsaasPaymentProvider();
        const gatewayRes = await asaasProvider.initiatePayment({
          orderId: order.id,
          amount: realAmount,
          currency: realCurrency,
          customerName: '',
          customerEmail: '',
          paymentMethod: data.method,
          metadata: {
            buyerId: data.buyerId,
            idempotencyKey: data.idempotencyKey,
          },
        });

        return {
          paymentId: gatewayRes.rawResponse?.paymentId || gatewayRes.transactionRef,
          provider: 'asaas',
          providerPaymentId: gatewayRes.transactionRef,
          method: data.method,
          status: 'pending',
          amount: gatewayRes.rawResponse?.amount,
          currency: gatewayRes.rawResponse?.currency,
          pix: {
            encodedImage: gatewayRes.qrCodeUrl,
            payload: gatewayRes.pixCopiaECola,
            expirationDate: gatewayRes.rawResponse?.expirationDate,
          },
          qrCode: gatewayRes.pixCopiaECola,
          qrCodeBase64: gatewayRes.qrCodeUrl,
        };
      }

      // Non-Asaas (simulated/local) providers — idempotency by explicit key first.
      if (data.idempotencyKey) {
        const existing = await tx.select().from(payments).where(eq(payments.idempotencyKey, data.idempotencyKey)).limit(1);
        if (existing.length > 0) {
          logger.info({ key: data.idempotencyKey }, 'Returning idempotent existing payment');
          return existing[0];
        }
      }

      // Reuse an already-pending payment for this order+provider instead of creating a duplicate.
      const existingPending = await tx
        .select()
        .from(payments)
        .where(and(eq(payments.orderId, order.id), eq(payments.provider, provider), eq(payments.status, 'pending')))
        .limit(1);
      if (existingPending.length > 0) {
        logger.info({ orderId: order.id, provider }, 'Returning existing pending local payment (idempotent)');
        return existingPending[0];
      }

      const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      let qrCode: string | undefined;
      if (data.method === 'pix') {
        qrCode = `00020101021226830014BR.GOV.BCB.PIX2561pix.mercadonusali.com/qr/v2/${paymentId}520400005303986540${realAmount.toFixed(2)}5802BR5914MERCADO NUSALI6006BISSAU62070503***6304`;
      }

      await tx.insert(payments).values({
        id: paymentId,
        orderId: order.id,
        buyerId: data.buyerId,
        amount: String(realAmount),
        currency: realCurrency,
        provider,
        method: data.method,
        status: 'pending',
        idempotencyKey: data.idempotencyKey,
        qrCode,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await tx.insert(paymentAttempts).values({
        id: `att_${Date.now()}`,
        paymentId,
        provider,
        status: 'initiated',
        createdAt: new Date(),
      });

      logger.info({ paymentId, orderId: order.id, amount: realAmount, method: data.method }, 'Payment initiated');

      return {
        id: paymentId,
        orderId: order.id,
        amount: realAmount,
        currency: realCurrency,
        method: data.method,
        status: 'pending',
        qrCode,
      };
    });
  }

  /**
   * Central single source of truth for confirming an order payment.
   * Atomically updates order, payment, escrow, and audit history.
   * Fully idempotent: returns current state if payment is already confirmed.
   * Does NOT alter physical stock or stock reservations.
   */
  static async confirmOrderPayment(orderId: string, options?: ConfirmOrderPaymentOptions) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível.');

    const result = await db.transaction(async (tx) => {
      // 1. Fetch Order
      const ordRows = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      if (ordRows.length === 0) {
        throw new Error(`ORDER_NOT_FOUND: Pedido com ID "${orderId}" não foi encontrado.`);
      }

      const ord = ordRows[0];

      // Requirement 6: Strict seller verification (no dummy seller_default)
      if (!ord.sellerId) {
        throw new Error(`ORDER_SELLER_NOT_FOUND: O pedido "${ord.id}" não possui um vendedor associado para a retenção de escrow.`);
      }

      // 2. Idempotency Check: Return early if already paid
      if (ord.paymentStatus === 'paid') {
        logger.info({ orderId }, 'Payment already confirmed for order (idempotent call)');
        return {
          success: true,
          message: 'Pagamento já confirmado anteriormente.',
          data: {
            orderId: ord.id,
            orderNumber: ord.orderNumber,
            paymentStatus: 'paid',
            escrowStatus: ord.escrowStatus,
            status: ord.status,
          },
        };
      }

      const provider = options?.provider || 'DEV_SIMULATOR';
      const transactionRef = options?.transactionRef || `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      
      let performedBy: string | null = options?.performedBy || ord.buyerId;
      if (performedBy) {
        const uCheck = await tx.select().from(users).where(eq(users.id, performedBy)).limit(1);
        if (uCheck.length === 0) {
          performedBy = ord.buyerId;
        }
      }

      // 3. Payment Record Update / Insert
      const existingPayments = await tx
        .select()
        .from(payments)
        .where(eq(payments.orderId, ord.id))
        .limit(1);

      let paymentId: string;
      if (existingPayments.length > 0) {
        const pay = existingPayments[0];
        paymentId = pay.id;
        await tx
          .update(payments)
          .set({
            status: 'paid',
            provider: pay.provider || provider,
            transactionRef,
            paidAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(payments.id, pay.id));
      } else {
        paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        await tx.insert(payments).values({
          id: paymentId,
          orderId: ord.id,
          buyerId: ord.buyerId,
          amount: ord.totalAmount,
          currency: ord.currency,
          provider,
          method: ord.paymentMethod || 'DEV_SIMULATOR',
          status: 'paid',
          transactionRef,
          paidAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      await tx.insert(paymentAttempts).values({
        id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        paymentId,
        provider,
        status: 'succeeded',
        errorMessage: null,
        rawPayloadJson: { simulatedInDev: provider === 'DEV_SIMULATOR', confirmedAt: new Date().toISOString() },
        createdAt: new Date(),
      });

      // 4. Update Order Record
      const newOrderStatus = ord.status === 'pending_payment' ? 'processing' : ord.status;
      await tx
        .update(orders)
        .set({
          paymentStatus: 'paid',
          escrowStatus: 'held',
          status: newOrderStatus,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, ord.id));

      // 5. Escrow Account & Ledger
      const existingEscrow = await tx
        .select()
        .from(escrowAccounts)
        .where(eq(escrowAccounts.orderId, ord.id))
        .limit(1);

      let escrowAccountId: string;
      if (existingEscrow.length > 0) {
        escrowAccountId = existingEscrow[0].id;
        await tx
          .update(escrowAccounts)
          .set({
            status: 'held',
            updatedAt: new Date(),
          })
          .where(eq(escrowAccounts.id, escrowAccountId));
      } else {
        escrowAccountId = `esc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        await tx.insert(escrowAccounts).values({
          id: escrowAccountId,
          orderId: ord.id,
          buyerId: ord.buyerId,
          sellerId: ord.sellerId,
          amount: ord.totalAmount,
          currency: ord.currency,
          status: 'held',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      await tx.insert(escrowTransactions).values({
        id: `etx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        escrowAccountId,
        type: 'HOLD',
        amount: ord.totalAmount,
        currency: ord.currency,
        reason: provider === 'DEV_SIMULATOR'
          ? 'Pagamento simulado em ambiente de desenvolvimento. Saldo retido em garantia Escrow.'
          : 'Pagamento confirmado via gateway. Saldo retido em garantia Escrow.',
        performedBy,
        reference: transactionRef,
        createdAt: new Date(),
      });

      // Audit Log (orderStatusHistory)
      await tx.insert(orderStatusHistory).values({
        id: `osh_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        orderId: ord.id,
        previousStatus: ord.status,
        newStatus: newOrderStatus,
        reason: provider === 'DEV_SIMULATOR'
          ? 'PAYMENT_CONFIRMED: Pagamento aprovado via Simulador de Desenvolvimento.'
          : 'PAYMENT_CONFIRMED: Pagamento confirmado via gateway/webhook.',
        changedBy: performedBy,
        createdAt: new Date(),
      });

      // 6. Sync Order Fulfillment Status
      await syncOrderFulfillmentStatus(ord.id, tx);

      // 7. Notifications & WebSocket
      await tx.insert(notifications).values({
        id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        userId: ord.buyerId,
        title: 'Pagamento Aprovado com Sucesso!',
        message: `O pagamento do seu pedido foi confirmado.`,
        type: 'payment',
        link: `/buyer/orders/${ord.id}`,
        isRead: false,
        createdAt: new Date(),
      });

      broadcastToUser(ord.buyerId, {
        type: 'PAYMENT_CONFIRMED',
        paymentId,
        orderId: ord.id,
        amount: Number(ord.totalAmount),
      });

      broadcastAdminEvent({
        type: 'PAYMENT_RECEIVED',
        paymentId,
        orderId: ord.id,
        amount: Number(ord.totalAmount),
      });

      logger.info({ orderId: ord.id, provider }, 'Order payment confirmed atomically and escrow held');

      return {
        success: true,
        message: 'Pagamento confirmado e escrow ativo com sucesso!',
        data: {
          orderId: ord.id,
          orderNumber: ord.orderNumber,
          paymentStatus: 'paid',
          escrowStatus: 'held',
          status: newOrderStatus,
        },
      };
    });

    // ------------------------------------------------------------------------
    // SHADOW LEDGER (Fase 5A) — roda DEPOIS que o fluxo legado acima já commitou.
    // Nunca pode afetar o resultado real: qualquer falha aqui é só logada. O
    // FinancialLedgerService é idempotente e reconhece pedidos anteriores ao
    // cutoff (LEGACY_ORDER) e snapshots ausentes (MISSING_SNAPSHOT) sem lançar.
    // ------------------------------------------------------------------------
    try {
      const shadow = await FinancialLedgerService.recordPaymentReceived({
        orderId,
        performedBy: options?.performedBy ?? null,
        source: options?.provider || 'DEV_SIMULATOR',
      });
      if (shadow.skipped) {
        logger.info({ orderId, reason: shadow.reason, detail: shadow.detail }, '[ShadowLedger] recordPaymentReceived pulado (esperado para pedidos legados/sem snapshot)');
      } else {
        logger.info({ orderId, transactionId: shadow.transactionId }, '[ShadowLedger] recordPaymentReceived postado');
      }
    } catch (shadowErr: any) {
      logger.error({ orderId, error: shadowErr?.message }, '[ShadowLedger] recordPaymentReceived falhou — fluxo real não afetado');
    }

    return result;
  }

  /**
   * Confirms payment via payment ID (calls confirmOrderPayment).
   */
  static async confirmPayment(paymentId: string, transactionRef?: string) {
    const db = getDb();
    if (!db) return { success: true };

    const payRes = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
    if (payRes.length === 0) throw new Error('Pagamento não encontrado.');

    const payment = payRes[0];
    return await this.confirmOrderPayment(payment.orderId, { transactionRef });
  }

  /**
   * Central atomic & idempotent escrow release service.
   * Releases escrow funds upon buyer confirmation or admin release.
   */
  static async releaseEscrowForOrder(orderId: string, options?: { performedBy?: string; reason?: string }, executor?: any) {
    const runInTx = async (tx: any) => {
      const ordRows = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (ordRows.length === 0) throw new Error('Pedido não encontrado.');
      const ord = ordRows[0];

      // Idempotency: Return early if escrow is already released
      if (ord.escrowStatus === 'released') {
        logger.info({ orderId }, 'Escrow already released for order (idempotent call)');
        return {
          success: true,
          message: 'Garantia Escrow já liberada anteriormente.',
          alreadyReleased: true,
          data: {
            orderId: ord.id,
            orderNumber: ord.orderNumber,
            escrowStatus: 'released',
            status: 'delivered',
            alreadyReleased: true,
          },
        };
      }

      // Validate payment status
      if (ord.paymentStatus !== 'paid') {
        throw new Error('PAYMENT_NOT_CONFIRMED: O pagamento do pedido ainda não foi confirmado.');
      }

      // Multi-Shipment Validation: ALL non-cancelled shipments must be DELIVERED
      const nonCancelledShipments = await tx
        .select()
        .from(shipments)
        .where(and(eq(shipments.orderId, orderId), ne(shipments.status, 'CANCELLED')));

      if (nonCancelledShipments.length > 0) {
        const undelivered = nonCancelledShipments.filter(s => (s.status || '').toUpperCase() !== 'DELIVERED');
        if (undelivered.length > 0) {
          throw new Error(
            `ORDER_NOT_FULLY_DELIVERED: Não é possível confirmar o recebimento pois nem todos os pacotes do pedido foram entregues.`
          );
        }
      }

      // Check escrow account
      const escRows = await tx.select().from(escrowAccounts).where(eq(escrowAccounts.orderId, orderId)).limit(1);
      if (escRows.length === 0) {
        throw new Error('Conta Escrow não encontrada para este pedido.');
      }
      const esc = escRows[0];

      // Fase "Refund/disputa/chargeback", item 3: um refund processado antes do
      // release marca a escrow como 'refunded' — isso tem que impedir qualquer
      // release futuro, mesmo que o chamador não tenha visto o refund a tempo
      // (concorrência: releaseEscrowForOrder também trava a linha da escrow
      // mais abaixo, mas essa checagem de status já barra o caso comum antes
      // de qualquer escrita).
      if (esc.status === 'refunded' || esc.status === 'disputed') {
        throw new Error(`ESCROW_ALREADY_REVERSED: escrow do pedido ${ord.id} está em status "${esc.status}" — não pode mais ser liberada.`);
      }

      // Moeda do escrow tem que bater com a moeda do pedido — nunca creditar uma
      // wallet com um valor rotulado numa moeda diferente da que a conta
      // realmente representa (Fase 6, correção do achado CRÍTICO C). Na criação
      // do escrow (HOLD) as duas sempre vêm de ord.currency, então isto é uma
      // guarda defensiva contra corrupção de dado futura, não um caminho normal.
      if (esc.currency !== ord.currency) {
        throw new Error(
          `ESCROW_CURRENCY_MISMATCH: escrow do pedido ${ord.id} está em ${esc.currency}, mas o pedido está em ${ord.currency}. Release recusado, nenhum crédito realizado.`
        );
      }
      const releaseCurrency = esc.currency;

      let performedBy: string | null = options?.performedBy || ord.buyerId;
      if (performedBy) {
        const uCheck = await tx.select().from(users).where(eq(users.id, performedBy)).limit(1);
        if (uCheck.length === 0) performedBy = ord.buyerId;
      }

      // 1. Resolve seller user ID
      let sellerUserId: string | null = null;
      const targetSellerId = esc.sellerId || ord.sellerId;
      if (targetSellerId) {
        const selChk = await tx.select({ userId: sellers.userId }).from(sellers).where(eq(sellers.id, targetSellerId)).limit(1);
        if (selChk.length > 0 && selChk[0].userId) {
          sellerUserId = selChk[0].userId;
        } else {
          const userChk = await tx.select({ id: users.id }).from(users).where(eq(users.id, targetSellerId)).limit(1);
          if (userChk.length > 0) {
            sellerUserId = userChk[0].id;
          }
        }
      }

      // 2. Locate or create Seller Wallet (por usuário + moeda) & Credit Balance (Idempotent)
      // releaseAmount = orders.sellerNetAmount, nunca escrow.amount bruto — o bruto inclui
      // frete e a comissão da Nusali, que não pertencem à wallet do vendedor (Fase 6,
      // achados CRÍTICO B e itens 2/3 — frete e comissão nunca são creditados ao seller).
      // Lança MissingFinancialSnapshotError antes de qualquer escrita se o snapshot
      // obrigatório estiver ausente/inválido — nenhuma wallet é tocada nesse caso.
      const releaseAmount = calculateSellerReleaseAmount(ord);
      if (sellerUserId && releaseAmount > 0) {
        // Uma wallet por usuário POR MOEDA (Fase 6, achado CRÍTICO C) — nunca soma valores
        // de moedas diferentes no mesmo saldo numérico.
        let walletRows = await tx
          .select()
          .from(wallets)
          .where(and(eq(wallets.userId, sellerUserId), eq(wallets.currency, releaseCurrency)))
          .limit(1);
        let sellerWallet = walletRows[0];
        if (!sellerWallet) {
          // Race-safe wallet auto-provisioning: ON CONFLICT DO NOTHING no par (userId,
          // currency), depois re-seleciona a linha que realmente venceu, em vez de arriscar
          // erro de insert duplicado se uma liberação/payout concorrente para a mesma
          // wallet-nova rodar ao mesmo tempo.
          const wId = `wlt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          await tx
            .insert(wallets)
            .values({
              id: wId,
              userId: sellerUserId,
              balance: '0.00',
              cashbackBalance: '0.00',
              pendingBalance: '0.00',
              currency: releaseCurrency,
              status: 'active',
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .onConflictDoNothing({ target: [wallets.userId, wallets.currency] });
          const createdW = await tx
            .select()
            .from(wallets)
            .where(and(eq(wallets.userId, sellerUserId), eq(wallets.currency, releaseCurrency)))
            .limit(1);
          sellerWallet = createdW[0];
        }

        const idempotencyKey = `escrow_release:${ord.id}`;
        const existingWtx = await tx
          .select()
          .from(walletTransactions)
          .where(eq(walletTransactions.idempotencyKey, idempotencyKey))
          .limit(1);

        if (existingWtx.length === 0) {
          // Lock the wallet row for the rest of this transaction so a concurrent release/payout
          // for the same wallet cannot read the same stale balance.
          const lockedRows = await tx.select().from(wallets).where(eq(wallets.id, sellerWallet.id)).for('update');
          const lockedWallet = lockedRows[0] || sellerWallet;
          const currentBalance = Number(lockedWallet.balance || 0);
          const newBalance = currentBalance + releaseAmount;

          await tx
            .update(wallets)
            .set({
              balance: String(newBalance.toFixed(2)),
              updatedAt: new Date(),
            })
            .where(eq(wallets.id, sellerWallet.id));

          try {
            await tx.insert(walletTransactions).values({
              id: `wtx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              walletId: sellerWallet.id,
              type: 'escrow_release',
              amount: String(releaseAmount.toFixed(2)),
              currency: releaseCurrency,
              title: `Venda liberada - Pedido #${ord.orderNumber || ord.id}`,
              referenceId: ord.id,
              referenceType: 'order',
              status: 'completed',
              balanceAfter: String(newBalance.toFixed(2)),
              idempotencyKey,
              createdAt: new Date(),
            });
          } catch (wtxErr: any) {
            // Corrida: duas liberações concorrentes passaram pelo SELECT acima antes de
            // qualquer uma commitar. O índice único de idempotencyKey (Postgres) rejeita a
            // segunda — deixamos a transação inteira dar rollback (nenhum crédito parcial
            // fica de pé) e o erro sobe como está; não tentamos "engolir" silenciosamente
            // aqui porque o saldo já foi somado localmente em memória (newBalance) e não é
            // seguro assumir qual das duas deveria "vencer" sem reprocessar do zero.
            throw wtxErr;
          }
        }
      }

      // 3. Update Escrow Account
      await tx
        .update(escrowAccounts)
        .set({
          status: 'released',
          releasedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(escrowAccounts.id, esc.id));

      // 4. Update Order
      await tx
        .update(orders)
        .set({
          escrowStatus: 'released',
          status: 'delivered',
          updatedAt: new Date(),
        })
        .where(eq(orders.id, ord.id));

      // 5. Escrow Transaction Ledger
      await tx.insert(escrowTransactions).values({
        id: `etx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        escrowAccountId: esc.id,
        type: 'RELEASE_SELLER',
        amount: esc.amount,
        currency: esc.currency,
        reason: options?.reason || 'ESCROW_RELEASED: Entrega confirmada pelo comprador. Saldo liberado ao vendedor.',
        performedBy,
        reference: `rel_${ord.id}`,
        createdAt: new Date(),
      });

      // 6. Audit Log
      await tx.insert(orderStatusHistory).values({
        id: `osh_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        orderId: ord.id,
        previousStatus: ord.status,
        newStatus: 'delivered',
        reason: options?.reason || 'ESCROW_RELEASED: Entrega confirmada e saldo liberado.',
        changedBy: performedBy,
        createdAt: new Date(),
      });

      // 7. Notifications
      if (sellerUserId) {
        await tx.insert(notifications).values({
          id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          userId: sellerUserId,
          title: 'Saldo Escrow Liberado!',
          message: `O comprador confirmou o recebimento do pedido #${ord.orderNumber || ord.id}. O valor de ${esc.currency || ord.currency} ${releaseAmount.toFixed(2)} foi creditado na sua carteira.`,
          type: 'escrow',
          link: `/seller/wallet`,
          isRead: false,
          createdAt: new Date(),
        });
      }

      logger.info({ orderId: ord.id }, 'Escrow released successfully for order');

      return {
        success: true,
        message: 'Garantia Escrow liberada com sucesso!',
        data: {
          orderId: ord.id,
          orderNumber: ord.orderNumber,
          escrowStatus: 'released',
          status: 'delivered',
        },
        // Uso interno só para o diagnóstico de comparação com o ledger shadow logo abaixo
        // (Fase 6, item 9) — não faz parte do contrato público da função.
        _releasedAmount: releaseAmount,
      };
    };

    const result = executor
      ? await runInTx(executor)
      : await (async () => {
          const db = getDb();
          if (!db) throw new Error('Banco de dados indisponível.');
          return await db.transaction(runInTx);
        })();

    // ------------------------------------------------------------------------
    // SHADOW LEDGER (Fase 5A) — roda DEPOIS que o fluxo legado acima já commitou,
    // nunca afeta o resultado real. Ver nota equivalente em confirmOrderPayment.
    //
    // Fase 6, item 9: além de postar, comparamos o valor realmente liberado ao
    // vendedor no fluxo legado (orders.sellerNetAmount) contra o SELLER_PAYABLE
    // do ledger shadow para o mesmo pedido — os dois já leem do mesmo snapshot
    // (orders.sellerNetAmount), então um mismatch aqui indicaria um bug real em
    // um dos dois caminhos, nunca um comportamento esperado. Só loga um
    // diagnóstico; nunca bloqueia nem reverte o fluxo real, que já commitou.
    // ------------------------------------------------------------------------
    try {
      const shadow = await FinancialLedgerService.recordDeliveryConfirmed({
        orderId,
        performedBy: options?.performedBy ?? null,
        source: 'payment_service',
      });
      if (shadow.skipped) {
        logger.info({ orderId, reason: shadow.reason, detail: shadow.detail }, '[ShadowLedger] recordDeliveryConfirmed pulado (esperado para pedidos legados/sem snapshot)');
      } else {
        logger.info({ orderId, transactionId: shadow.transactionId }, '[ShadowLedger] recordDeliveryConfirmed postado');

        const releasedAmount = (result as any)?._releasedAmount;
        if (shadow.transactionId && typeof releasedAmount === 'number') {
          const db = getDb();
          if (db) {
            const sellerPayableRows = await db
              .select({ amount: ledgerEntries.amount })
              .from(ledgerEntries)
              .innerJoin(ledgerAccounts, eq(ledgerEntries.accountId, ledgerAccounts.id))
              .where(and(eq(ledgerEntries.transactionId, shadow.transactionId), eq(ledgerAccounts.code, 'SELLER_PAYABLE')));
            const shadowAmount = sellerPayableRows.reduce((sum, r) => sum + Number(r.amount), 0);
            if (Math.abs(shadowAmount - releasedAmount) > 0.005) {
              logger.warn(
                { orderId, releasedAmount, shadowAmount, transactionId: shadow.transactionId },
                '[ShadowLedger] MISMATCH: valor liberado no fluxo real diverge do SELLER_PAYABLE do ledger shadow — investigar (não deveria acontecer, os dois leem sellerNetAmount)'
              );
            } else {
              logger.info({ orderId, releasedAmount, shadowAmount }, '[ShadowLedger] valor liberado bate com SELLER_PAYABLE do ledger shadow');
            }
          }
        }
      }
    } catch (shadowErr: any) {
      logger.error({ orderId, error: shadowErr?.message }, '[ShadowLedger] recordDeliveryConfirmed falhou — fluxo real não afetado');
    }

    if (result && typeof result === 'object' && '_releasedAmount' in result) {
      delete (result as any)._releasedAmount;
    }
    return result;
  }
}
