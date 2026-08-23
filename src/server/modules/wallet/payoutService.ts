/**
 * Fase "Payout multi-moeda" — lógica de solicitação e processamento de saque
 * extraída de sellerRoutes.ts/adminRoutes.ts para um serviço testável (mesmo
 * padrão de PaymentService.releaseEscrowForOrder: aceita um `executor` opcional
 * para injeção de uma transação já aberta, usado pelos testes reais contra
 * Postgres Docker).
 */
import { getDb } from '../../../db/index.js';
import { sellers, wallets, walletTransactions, sellerPayouts, sellerBankAccounts, countries } from '../../../db/schema.js';
import { eq, and } from 'drizzle-orm';

export class PayoutValidationError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'PayoutValidationError';
    this.code = code;
    this.status = status;
  }
}

const CANONICAL_METHODS = ['orange_money', 'mtn', 'pix', 'bank_transfer', 'wallet'];

export interface RequestSellerPayoutInput {
  sellerId: string;
  sellerUserId: string;
  amount: number;
  currency: unknown;
  method: string;
  bankAccountId?: string | null;
  idempotencyKey: unknown;
}

/**
 * Solicitação de saque. Regras centrais desta fase:
 *  - currency é SEMPRE obrigatória e explícita — nunca inferida da "primeira
 *    wallet encontrada" do vendedor (bug corrigido nesta fase);
 *  - a wallet usada é SEMPRE a de (sellerUserId, currency) — nunca criada aqui;
 *    pedir saque numa moeda em que o vendedor nunca recebeu nada é rejeitado;
 *  - idempotencyKey é obrigatória e fornecida pelo cliente — um retry com a
 *    mesma chave devolve a solicitação já existente, nunca reserva de novo;
 *  - moeda suportada = countries.currency (países ativos), nunca uma lista
 *    inventada aqui.
 */
export async function requestSellerPayout(input: RequestSellerPayoutInput, executor?: any) {
  const runInTx = async (tx: any) => {
    const clientIdempotencyKey = typeof input.idempotencyKey === 'string' ? input.idempotencyKey.trim() : '';
    if (!clientIdempotencyKey) {
      throw new PayoutValidationError('IDEMPOTENCY_KEY_REQUIRED', 'Informe idempotencyKey — necessária para que um reenvio da mesma solicitação não reserve saldo duas vezes.');
    }

    // Idempotência primeiro, antes de qualquer outra validação: se a chave já foi
    // usada, devolve o estado existente sem tocar em nenhum saldo.
    const existingPayout = await tx.select().from(sellerPayouts).where(eq(sellerPayouts.idempotencyKey, clientIdempotencyKey)).limit(1);
    if (existingPayout.length > 0) {
      const p = existingPayout[0];
      return {
        id: p.id, amount: Number(p.amount), currency: p.currency, method: p.method,
        bankAccountId: p.bankAccountId, status: p.status, alreadyRequested: true,
      };
    }

    const requestedCurrency = typeof input.currency === 'string' ? input.currency.trim().toUpperCase() : '';
    if (!requestedCurrency) {
      throw new PayoutValidationError('CURRENCY_REQUIRED', 'Informe a moeda (currency) do saque — não é mais inferida automaticamente da carteira do vendedor.');
    }

    const supportedCurrencyRows = await tx.selectDistinct({ currency: countries.currency }).from(countries).where(eq(countries.isActive, true));
    const supportedCurrencies = new Set(supportedCurrencyRows.map((r: any) => String(r.currency).toUpperCase()));
    if (!supportedCurrencies.has(requestedCurrency)) {
      throw new PayoutValidationError('UNSUPPORTED_CURRENCY', `Moeda "${requestedCurrency}" não é suportada. Moedas ativas: ${[...supportedCurrencies].join(', ')}.`);
    }

    const canonicalMethod = (input.method || '').toLowerCase().trim();
    if (!CANONICAL_METHODS.includes(canonicalMethod)) {
      throw new PayoutValidationError('INVALID_PAYOUT_METHOD', `Método de saque "${input.method}" é inválido. Métodos suportados: ${CANONICAL_METHODS.join(', ')}.`);
    }
    if (canonicalMethod !== 'wallet' && !input.bankAccountId) {
      throw new PayoutValidationError('BANK_ACCOUNT_REQUIRED', 'Uma conta bancária/de recebimento cadastrada é obrigatória para este método de saque.');
    }

    if (!input.amount || input.amount <= 0) {
      throw new PayoutValidationError('INVALID_AMOUNT', 'Informe um valor válido para saque.');
    }

    // Uma wallet por (userId, currency) — busca exatamente a wallet da moeda
    // pedida. Não cria wallet aqui: pedir saque de uma moeda em que o vendedor
    // nunca recebeu nada é rejeitado, não silenciosamente aceito com saldo zero.
    const walletRows = await tx
      .select()
      .from(wallets)
      .where(and(eq(wallets.userId, input.sellerUserId), eq(wallets.currency, requestedCurrency)))
      .for('update');
    const sellerWallet = walletRows[0];
    if (!sellerWallet) {
      throw new PayoutValidationError('WALLET_NOT_FOUND_FOR_CURRENCY', `Vendedor não possui carteira em ${requestedCurrency}.`, 404);
    }
    if (sellerWallet.status !== 'active') {
      throw new PayoutValidationError('WALLET_LOCKED', 'Sua carteira está inativa ou bloqueada para transações.');
    }

    let validatedBankAccountId: string | null = null;
    if (input.bankAccountId) {
      const bAccs = await tx
        .select()
        .from(sellerBankAccounts)
        .where(and(eq(sellerBankAccounts.id, input.bankAccountId), eq(sellerBankAccounts.sellerId, input.sellerId)))
        .limit(1);
      if (bAccs.length === 0) {
        throw new PayoutValidationError('INVALID_BANK_ACCOUNT', 'A conta bancária informada não foi encontrada ou não pertence ao vendedor autenticado.');
      }
      const bAcc = bAccs[0];

      if (bAcc.currency && bAcc.currency.toUpperCase() !== requestedCurrency) {
        throw new PayoutValidationError('CURRENCY_MISMATCH', `A moeda da conta cadastrada (${bAcc.currency}) difere da moeda solicitada para o saque (${requestedCurrency}).`, 409);
      }

      if (canonicalMethod === 'bank_transfer') {
        const hasAcc = Boolean(bAcc.accountNumber && bAcc.accountNumber.trim() && bAcc.accountNumber !== 'N/A');
        const hasIban = Boolean(bAcc.ibanOrRouting && bAcc.ibanOrRouting.trim());
        if (!hasAcc && !hasIban) {
          throw new PayoutValidationError('PAYOUT_DESTINATION_INCOMPATIBLE', 'A conta selecionada não possui número de conta nem IBAN/Routing para transferência bancária.');
        }
      } else if (canonicalMethod === 'pix') {
        if (!(bAcc.pixKey && bAcc.pixKey.trim())) {
          throw new PayoutValidationError('PAYOUT_DESTINATION_INCOMPATIBLE', 'A conta selecionada não possui Chave PIX cadastrada.');
        }
      } else if (canonicalMethod === 'orange_money' || canonicalMethod === 'mtn') {
        const hasMobile = Boolean(
          (bAcc.mobileMoneyNumber && bAcc.mobileMoneyNumber.trim()) ||
          (bAcc.accountNumber && bAcc.accountNumber.trim() && bAcc.accountNumber !== 'N/A')
        );
        if (!hasMobile) {
          throw new PayoutValidationError('PAYOUT_DESTINATION_INCOMPATIBLE', `A conta selecionada não possui número de celular/mobile money para ${canonicalMethod.toUpperCase()}.`);
        }
      }

      validatedBankAccountId = bAcc.id;
    }

    const availableBalance = Number(sellerWallet.balance || 0);
    if (input.amount > availableBalance) {
      throw new PayoutValidationError('INSUFFICIENT_AVAILABLE_BALANCE', 'Saldo disponível insuficiente para solicitar o saque.', 409);
    }

    const newBalance = availableBalance - input.amount;
    await tx
      .update(wallets)
      .set({ balance: String(newBalance.toFixed(2)), updatedAt: new Date() })
      .where(eq(wallets.id, sellerWallet.id));

    const payoutId = `payout_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await tx.insert(sellerPayouts).values({
      id: payoutId,
      sellerId: input.sellerId,
      amount: String(input.amount.toFixed(2)),
      currency: requestedCurrency,
      method: canonicalMethod,
      bankAccountId: validatedBankAccountId,
      status: 'pending',
      idempotencyKey: clientIdempotencyKey,
      createdAt: new Date(),
    });

    await tx.insert(walletTransactions).values({
      id: `wtx_payout_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      walletId: sellerWallet.id,
      type: 'payout',
      amount: String((-input.amount).toFixed(2)),
      currency: requestedCurrency,
      title: `Solicitação de Saque (${canonicalMethod.toUpperCase()})`,
      referenceId: payoutId,
      referenceType: 'withdrawal',
      status: 'pending',
      balanceAfter: String(newBalance.toFixed(2)),
      idempotencyKey: `payout_request:${payoutId}`,
      createdAt: new Date(),
    });

    return {
      id: payoutId, amount: input.amount, currency: requestedCurrency, method: canonicalMethod,
      bankAccountId: validatedBankAccountId, status: 'pending', newAvailableBalance: newBalance,
    };
  };

  if (executor) return runInTx(executor);
  const db = getDb();
  if (!db) throw new Error('Banco de dados indisponível.');
  return db.transaction(runInTx);
}

export type PayoutStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Transição de status administrativa. Regras desta fase:
 *  - FAILED devolve o valor exatamente à wallet (userId, payout.currency) — nunca
 *    "a primeira wallet encontrada" (bug corrigido nesta fase);
 *  - COMPLETED nunca mexe em saldo (já foi debitado na solicitação) — só
 *    finaliza o estado;
 *  - admin nunca escolhe/converte moeda — a currency vem sempre de
 *    seller_payouts.currency.
 */
export async function processPayoutStatusChange(
  payoutId: string,
  status: PayoutStatus,
  options: { transactionRef?: string; isProduction?: boolean } = {},
  executor?: any
) {
  const runInTx = async (tx: any) => {
    const payoutRows = await tx.select().from(sellerPayouts).where(eq(sellerPayouts.id, payoutId)).limit(1);
    if (payoutRows.length === 0) throw new Error('Solicitação de saque não encontrada.');
    const p = payoutRows[0];
    const currentStatus = p.status as PayoutStatus;

    if (currentStatus === status) {
      return { success: true, message: `Saque já se encontra no status "${status}".`, alreadyInState: true, status: currentStatus };
    }

    const isValidTransition =
      (currentStatus === 'pending' && (status === 'processing' || status === 'failed')) ||
      (currentStatus === 'processing' && (status === 'completed' || status === 'failed'));
    if (!isValidTransition) {
      const err: any = new Error(`PAYOUT_INVALID_TRANSITION: Transição inválida de "${currentStatus}" para "${status}".`);
      err.code = 'PAYOUT_INVALID_TRANSITION';
      throw err;
    }

    if (status === 'completed') {
      let ref = options.transactionRef;
      if (!ref) {
        if (!options.isProduction) {
          ref = `DEV_SANDBOX_TX_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        } else {
          const err: any = new Error('TRANSACTION_REF_REQUIRED: Em produção, a referência de transação real do comprovante é obrigatória.');
          err.code = 'TRANSACTION_REF_REQUIRED';
          throw err;
        }
      }

      await tx.update(sellerPayouts).set({ status: 'completed', processedAt: new Date(), transactionRef: ref }).where(eq(sellerPayouts.id, p.id));

      const wtxRows = await tx.select().from(walletTransactions).where(eq(walletTransactions.referenceId, p.id)).limit(1);
      if (wtxRows.length > 0) {
        await tx.update(walletTransactions).set({ status: 'completed' }).where(eq(walletTransactions.id, wtxRows[0].id));
      }

      return { success: true, message: `Saque #${p.id} concluído com sucesso. Ref: ${ref}` };
    }

    if (status === 'processing') {
      await tx.update(sellerPayouts).set({ status: 'processing' }).where(eq(sellerPayouts.id, p.id));
      return { success: true, message: `Saque #${p.id} alterado para em processamento.` };
    }

    if (status === 'failed') {
      const refundIdempotencyKey = `payout_refund:${p.id}`;
      const existingRefundWtx = await tx.select().from(walletTransactions).where(eq(walletTransactions.idempotencyKey, refundIdempotencyKey)).limit(1);

      await tx.update(sellerPayouts).set({ status: 'failed' }).where(eq(sellerPayouts.id, p.id));

      if (existingRefundWtx.length > 0) {
        return { success: true, message: `Saque #${p.id} marcado como falho. Reembolso já efetuado anteriormente.`, alreadyRefunded: true };
      }

      const selRows = await tx.select().from(sellers).where(eq(sellers.id, p.sellerId)).limit(1);
      if (selRows.length === 0) {
        return { success: true, message: `Saque #${p.id} marcado como falho, mas vendedor não encontrado — reembolso não realizado.` };
      }
      const sellerUserId = selRows[0].userId;

      // Sempre a wallet de (sellerUserId, p.currency) — a mesma moeda em que o
      // saque foi reservado, nunca "a primeira wallet encontrada".
      const walletRows = await tx
        .select()
        .from(wallets)
        .where(and(eq(wallets.userId, sellerUserId), eq(wallets.currency, p.currency)))
        .for('update')
        .limit(1);
      if (walletRows.length === 0) {
        throw new Error(`PAYOUT_REFUND_WALLET_NOT_FOUND: vendedor ${p.sellerId} não possui wallet em ${p.currency} para receber o estorno do saque ${p.id}.`);
      }
      const sellerWallet = walletRows[0];
      const currentBal = Number(sellerWallet.balance || 0);
      const refundAmt = Number(p.amount || 0);
      const newBal = currentBal + refundAmt;

      await tx.update(wallets).set({ balance: String(newBal.toFixed(2)), updatedAt: new Date() }).where(eq(wallets.id, sellerWallet.id));

      const wtxRows = await tx.select().from(walletTransactions).where(eq(walletTransactions.referenceId, p.id)).limit(1);
      if (wtxRows.length > 0) {
        await tx.update(walletTransactions).set({ status: 'cancelled' }).where(eq(walletTransactions.id, wtxRows[0].id));
      }

      await tx.insert(walletTransactions).values({
        id: `wtx_refund_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        walletId: sellerWallet.id,
        type: 'refund',
        amount: String(refundAmt.toFixed(2)),
        currency: p.currency,
        title: `Estorno de Saque #${p.id}`,
        referenceId: p.id,
        referenceType: 'withdrawal',
        status: 'completed',
        balanceAfter: String(newBal.toFixed(2)),
        idempotencyKey: refundIdempotencyKey,
        createdAt: new Date(),
      });

      return { success: true, message: `Saque #${p.id} marcado como falho e valor devolvido ao saldo disponível.` };
    }

    return { success: true };
  };

  if (executor) return runInTx(executor);
  const db = getDb();
  if (!db) throw new Error('Banco de dados indisponível.');
  return db.transaction(runInTx);
}
