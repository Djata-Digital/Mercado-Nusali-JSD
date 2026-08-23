/**
 * Fase "Refund/disputa/chargeback" — fecha o caminho inverso do dinheiro.
 *
 * Auditoria (item 1 do pedido) confirmou que, antes desta fase, NENHUM código
 * escrevia na tabela `refunds`, a resolução de disputa (`/admin/disputes/:id/
 * resolve`) só mudava `disputes.status` sem mover dinheiro nenhum, e o webhook
 * Asaas `PAYMENT_REFUNDED` só atualizava `payments.status='refunded'` — em
 * nenhum dos três casos o vendedor era debitado nem o escrow era realmente
 * revertido. `processRefund()` é a única função que move dinheiro de volta;
 * dispute resolution e o webhook chamam ela, nunca duplicam a lógica.
 *
 * Regra central: toda reversão é idempotente (idempotencyKey obrigatória,
 * fornecida pelo chamador — nunca derivada de um ID recém-criado), sempre na
 * moeda do pedido (nunca escolhida por quem chama), e nunca inventa um valor
 * quando falta snapshot financeiro.
 */
import { getDb } from '../../../db/index.js';
import { orders, payments, escrowAccounts, escrowTransactions, users, sellers, wallets, walletTransactions, refunds, disputes } from '../../../db/schema.js';
import { eq, and } from 'drizzle-orm';

export class RefundValidationError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'RefundValidationError';
    this.code = code;
    this.status = status;
  }
}

export interface ProcessRefundInput {
  orderId: string;
  amount: number;
  reason: string;
  idempotencyKey: string;
  performedBy?: string | null;
}

/**
 * Reversão financeira de um pedido — cobre os dois casos do pedido (itens 3/4):
 *
 *  - escrow ainda HELD (seller nunca recebeu): marca escrow como 'refunded',
 *    impede release futuro (checado em paymentService.ts releaseEscrowForOrder),
 *    NÃO toca a wallet do seller.
 *
 *  - escrow já 'released' (seller já recebeu sellerNetAmount): debita da wallet
 *    do seller (mesma moeda do pedido) a fração proporcional de sellerNetAmount
 *    correspondente ao valor refundado — SEMPRE proporcional ao snapshot
 *    original (orders.sellerNetAmount/totalAmount), nunca recalculado com a
 *    regra de comissão atual. Frete/subsídio nunca entram nesse débito porque
 *    sellerNetAmount já é só a parte do produto (mesma exclusão já garantida na
 *    liberação do escrow). Se o saldo disponível não for suficiente, a wallet
 *    fica negativa DE PROPÓSITO — isso é a dívida/receivable do vendedor, nunca
 *    um prejuízo silenciosamente absorvido pela Nusali. `requestSellerPayout()`
 *    já rejeita qualquer novo saque enquanto o saldo disponível for insuficiente
 *    (inclusive negativo) — nenhum código novo foi necessário para "bloquear
 *    payout com dívida", é consequência direta da checagem que já existia.
 *
 * O que esta função explicitamente NÃO faz (fora do escopo desta fase):
 *  - não chama nenhuma API externa de gateway de pagamento para devolver o
 *    dinheiro ao comprador de verdade — isso é responsabilidade do provedor
 *    (Asaas etc.), fora do controle deste sistema; aqui só reconciliamos o
 *    estado interno (escrow/wallet/order) quando alguém (admin ou webhook) nos
 *    diz que um refund aconteceu ou deve acontecer;
 *  - não reverte comissão da Nusali como um valor de wallet real, porque a
 *    comissão nunca foi de fato creditada em nenhuma wallet real (achado já
 *    documentado na Fase "Escrow release") — não há saldo real para reverter;
 *    fica só como diagnóstico no ledger shadow (item 14 do pedido).
 */
export async function processRefund(input: ProcessRefundInput, executor?: any) {
  const runInTx = async (tx: any) => {
    const idempotencyKey = typeof input.idempotencyKey === 'string' ? input.idempotencyKey.trim() : '';
    if (!idempotencyKey) {
      throw new RefundValidationError('IDEMPOTENCY_KEY_REQUIRED', 'Informe idempotencyKey — necessária para que um retry/webhook duplicado não reverta o dinheiro duas vezes.');
    }

    // Idempotência primeiro: se já processamos este refund, devolve o estado
    // existente sem tocar em nenhum saldo de novo.
    const existing = await tx.select().from(refunds).where(eq(refunds.idempotencyKey, idempotencyKey)).limit(1);
    if (existing.length > 0) {
      const r = existing[0];
      return {
        id: r.id, orderId: r.orderId, amount: Number(r.amount), currency: r.currency,
        status: r.status, sellerDebitAmount: r.sellerDebitAmount !== null ? Number(r.sellerDebitAmount) : null,
        alreadyProcessed: true,
      };
    }

    if (!input.amount || input.amount <= 0) {
      throw new RefundValidationError('INVALID_AMOUNT', 'Informe um valor de refund válido.');
    }

    const orderRows = await tx.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
    if (orderRows.length === 0) {
      throw new RefundValidationError('ORDER_NOT_FOUND', `Pedido ${input.orderId} não encontrado.`, 404);
    }
    const order = orderRows[0];

    if (input.amount > Number(order.totalAmount) + 0.005) {
      throw new RefundValidationError('REFUND_EXCEEDS_ORDER_TOTAL', `Valor do refund (${input.amount}) excede o total do pedido (${order.totalAmount}).`);
    }

    const paymentRows = await tx.select().from(payments).where(eq(payments.orderId, order.id)).limit(1);
    if (paymentRows.length === 0) {
      throw new RefundValidationError('PAYMENT_NOT_FOUND', `Nenhum pagamento encontrado para o pedido ${order.id}.`, 404);
    }
    const payment = paymentRows[0];

    // Lock na conta de escrow ANTES de qualquer decisão — impede que um release
    // concorrente e este refund decidam com base no mesmo status "velho".
    const escrowRows = await tx.select().from(escrowAccounts).where(eq(escrowAccounts.orderId, order.id)).for('update').limit(1);
    if (escrowRows.length === 0) {
      throw new RefundValidationError('ESCROW_NOT_FOUND', `Conta escrow não encontrada para o pedido ${order.id}.`, 404);
    }
    const escrow = escrowRows[0];

    if (escrow.status === 'refunded') {
      // Não é a MESMA idempotencyKey (isso já teria retornado acima) — é um
      // refund DIFERENTE tentando agir sobre um escrow já revertido. Rejeitar
      // explicitamente em vez de tentar "somar" mais um refund em cima.
      throw new RefundValidationError('ESCROW_ALREADY_REFUNDED', `Escrow do pedido ${order.id} já foi revertido anteriormente.`, 409);
    }

    // A moeda é SEMPRE a do pedido — nunca escolhida por quem chama processRefund.
    const currency = order.currency;
    if (payment.currency !== currency || escrow.currency !== currency) {
      throw new RefundValidationError(
        'CURRENCY_MISMATCH',
        `Moedas divergentes entre order (${currency}), payment (${payment.currency}) e escrow (${escrow.currency}) — refund recusado.`,
        409
      );
    }

    const refundId = `ref_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const isFullRefund = Math.abs(input.amount - Number(order.totalAmount)) < 0.005;
    let sellerDebitAmount: number | null = null;

    if (escrow.status === 'held' || escrow.status === 'eligible') {
      // Seller nunca recebeu — nada a debitar. Só reverte o escrow e o pedido.
      await tx.update(escrowAccounts).set({ status: 'refunded', updatedAt: new Date() }).where(eq(escrowAccounts.id, escrow.id));
      await tx.insert(escrowTransactions).values({
        id: `etx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        escrowAccountId: escrow.id, type: 'REFUND_BUYER', amount: String(input.amount.toFixed(2)), currency,
        reason: input.reason || 'Refund antes da liberação do escrow — vendedor não chegou a receber.',
        performedBy: input.performedBy ?? null, reference: `refund_${order.id}`, createdAt: new Date(),
      });
      await tx.update(orders).set({
        escrowStatus: 'refunded',
        status: isFullRefund ? 'refunded' : order.status,
        updatedAt: new Date(),
      }).where(eq(orders.id, order.id));
      if (isFullRefund) {
        await tx.update(payments).set({ status: 'refunded', updatedAt: new Date() }).where(eq(payments.id, payment.id));
      }
    } else if (escrow.status === 'released') {
      // Seller já recebeu sellerNetAmount — precisa devolver a fração
      // proporcional, SEMPRE a partir do snapshot gravado no pedido, nunca
      // recalculado com a regra de comissão atual.
      if (order.sellerNetAmount === null || order.sellerNetAmount === undefined) {
        throw new RefundValidationError('MISSING_FINANCIAL_SNAPSHOT', `Pedido ${order.id} não tem orders.sellerNetAmount gravado — refund pós-release recusado (não inventamos o valor).`, 422);
      }
      const totalAmount = Number(order.totalAmount);
      const sellerNetAmount = Number(order.sellerNetAmount);
      const refundRatio = totalAmount > 0 ? Math.min(input.amount / totalAmount, 1) : 0;
      sellerDebitAmount = Math.round(sellerNetAmount * refundRatio * 100) / 100;

      let sellerUserId: string | null = null;
      const targetSellerId = escrow.sellerId || order.sellerId;
      if (targetSellerId) {
        const selChk = await tx.select({ userId: sellers.userId }).from(sellers).where(eq(sellers.id, targetSellerId)).limit(1);
        if (selChk.length > 0 && selChk[0].userId) sellerUserId = selChk[0].userId;
        else {
          const userChk = await tx.select({ id: users.id }).from(users).where(eq(users.id, targetSellerId)).limit(1);
          if (userChk.length > 0) sellerUserId = userChk[0].id;
        }
      }

      if (sellerDebitAmount > 0) {
        if (!sellerUserId) {
          throw new RefundValidationError('SELLER_NOT_RESOLVED', `Não foi possível identificar o usuário do vendedor do pedido ${order.id} para debitar o refund.`, 500);
        }
        const walletRows = await tx.select().from(wallets).where(and(eq(wallets.userId, sellerUserId), eq(wallets.currency, currency))).for('update').limit(1);
        if (walletRows.length === 0) {
          throw new RefundValidationError('SELLER_WALLET_NOT_FOUND', `Vendedor não possui wallet em ${currency} para debitar o refund do pedido ${order.id}.`, 500);
        }
        const sellerWallet = walletRows[0];
        const currentBalance = Number(sellerWallet.balance || 0);
        // Deliberadamente permitido ficar negativo — é a dívida/receivable do
        // vendedor, nunca um prejuízo absorvido silenciosamente pela Nusali.
        const newBalance = currentBalance - sellerDebitAmount;

        await tx.update(wallets).set({ balance: String(newBalance.toFixed(2)), updatedAt: new Date() }).where(eq(wallets.id, sellerWallet.id));

        await tx.insert(walletTransactions).values({
          id: `wtx_refund_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          walletId: sellerWallet.id, type: 'refund', amount: String((-sellerDebitAmount).toFixed(2)), currency,
          title: `Estorno por refund do pedido #${order.orderNumber || order.id}`,
          referenceId: refundId, referenceType: 'order', status: 'completed',
          balanceAfter: String(newBalance.toFixed(2)), idempotencyKey, createdAt: new Date(),
        });
      }

      await tx.update(escrowAccounts).set({ status: 'refunded', updatedAt: new Date() }).where(eq(escrowAccounts.id, escrow.id));
      await tx.insert(escrowTransactions).values({
        id: `etx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        escrowAccountId: escrow.id, type: 'REFUND_BUYER', amount: String(input.amount.toFixed(2)), currency,
        reason: input.reason || 'Refund após liberação do escrow — valor proporcional debitado do vendedor.',
        performedBy: input.performedBy ?? null, reference: `refund_${order.id}`, createdAt: new Date(),
      });
      await tx.update(orders).set({
        escrowStatus: 'refunded',
        status: isFullRefund ? 'refunded' : order.status,
        updatedAt: new Date(),
      }).where(eq(orders.id, order.id));
      if (isFullRefund) {
        await tx.update(payments).set({ status: 'refunded', updatedAt: new Date() }).where(eq(payments.id, payment.id));
      }
    } else {
      // 'disputed' ou qualquer outro estado não coberto — não inventamos comportamento.
      throw new RefundValidationError('ESCROW_STATE_NOT_SUPPORTED', `Escrow do pedido ${order.id} está em estado "${escrow.status}" — refund não implementado para este estado.`, 409);
    }

    await tx.insert(refunds).values({
      id: refundId,
      paymentId: payment.id,
      orderId: order.id,
      amount: String(input.amount.toFixed(2)),
      currency,
      reason: input.reason || null,
      status: 'processed',
      approvedBy: input.performedBy ?? null,
      sellerDebitAmount: sellerDebitAmount !== null ? String(sellerDebitAmount.toFixed(2)) : null,
      idempotencyKey,
      createdAt: new Date(),
    });

    return {
      id: refundId, orderId: order.id, amount: input.amount, currency,
      status: 'processed', sellerDebitAmount, alreadyProcessed: false,
    };
  };

  if (executor) return runInTx(executor);
  const db = getDb();
  if (!db) throw new Error('Banco de dados indisponível.');
  return db.transaction(runInTx);
}

export type DisputeResolution = 'refund_buyer' | 'seller_win';

/**
 * Resolução de disputa (item 6 do pedido). Idempotente no nível da disputa: uma
 * disputa já resolvida (resolved_buyer/resolved_seller) não é reprocessada, nem
 * BUYER_WIN nem SELLER_WIN. BUYER_WIN aciona processRefund() na MESMA
 * transação da mudança de status. SELLER_WIN nunca move dinheiro.
 */
export async function resolveDispute(
  disputeId: string,
  resolution: DisputeResolution,
  options: { performedBy?: string | null; resolutionNote?: string } = {},
  executor?: any
) {
  const runInTx = async (tx: any) => {
    const disputeRows = await tx.select().from(disputes).where(eq(disputes.id, disputeId)).for('update').limit(1);
    if (disputeRows.length === 0) {
      throw new RefundValidationError('DISPUTE_NOT_FOUND', 'Disputa não encontrada.', 404);
    }
    const dispute = disputeRows[0];

    if (dispute.status === 'resolved_buyer' || dispute.status === 'resolved_seller') {
      return { success: true, message: `Disputa #${disputeId} já estava resolvida ("${dispute.status}") — nenhuma nova ação executada.`, alreadyResolved: true, status: dispute.status };
    }

    const isBuyerWin = resolution === 'refund_buyer';
    let refundResult: any = null;
    if (isBuyerWin) {
      const refundAmount = dispute.refundAmount !== null && dispute.refundAmount !== undefined
        ? Number(dispute.refundAmount)
        : Number(dispute.claimAmount);
      refundResult = await processRefund({
        orderId: dispute.orderId,
        amount: refundAmount,
        reason: `Disputa #${dispute.id} resolvida a favor do comprador. ${options.resolutionNote || ''}`.trim(),
        idempotencyKey: `dispute_resolution:${dispute.id}`,
        performedBy: options.performedBy ?? dispute.arbitratorId ?? null,
      }, tx);
    }

    await tx.update(disputes).set({
      status: isBuyerWin ? 'resolved_buyer' : 'resolved_seller',
      resolution: options.resolutionNote || 'Resolvido pelo Administrador',
      updatedAt: new Date(),
    }).where(eq(disputes.id, dispute.id));

    return { success: true, message: `Disputa #${dispute.id} resolvida com sucesso!`, refund: refundResult, alreadyResolved: false, status: isBuyerWin ? 'resolved_buyer' : 'resolved_seller' };
  };

  if (executor) return runInTx(executor);
  const db = getDb();
  if (!db) throw new Error('Banco de dados indisponível.');
  return db.transaction(runInTx);
}
