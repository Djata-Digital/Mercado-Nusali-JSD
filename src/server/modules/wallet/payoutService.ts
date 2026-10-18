/**
 * Fase "Payout multi-moeda" — lógica de solicitação e processamento de saque
 * extraída de sellerRoutes.ts/adminRoutes.ts para um serviço testável (mesmo
 * padrão de PaymentService.releaseEscrowForOrder: aceita um `executor` opcional
 * para injeção de uma transação já aberta, usado pelos testes reais contra
 * Postgres Docker).
 */
import { getDb } from '../../../db/index.js';
import { sellers, wallets, walletTransactions, sellerPayouts, sellerBankAccounts, countries, auditLogs } from '../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { sumActiveHoldsMicros } from './walletHoldService.js';
import { toMicros, formatMicros } from '../ledger/decimal.js';
import { FinancialLedgerService } from '../ledger/financialLedgerService.js';
import { stagePayoutEventInTx, flushLedgerStage, type LedgerStage } from '../ledger/outbox/ledgerShadowHooks.js';
import type { PayoutEventType } from '../ledger/payoutLedger.js';
import { logger } from '../../infra/logger.js';

/**
 * E8b — pós-commit: processa o evento do saque pelo outbox (ou, com o outbox desligado, lançamento direto). NUNCA lança: o ledger sombra jamais derruba a movimentação real;
 * se falhar, o evento fica no outbox (worker) e a reconciliação enxerga a lacuna.
 */
async function flushPayoutLedger(stage: LedgerStage | undefined, type: PayoutEventType, payoutId: string): Promise<void> {
  if (!stage) return;
  try {
    await flushLedgerStage(stage, async () => {
      try {
        const fn = type === 'PAYOUT_REQUESTED' ? FinancialLedgerService.recordPayoutRequested : type === 'PAYOUT_COMPLETED' ? FinancialLedgerService.recordPayoutCompleted : FinancialLedgerService.recordPayoutFailed;
        const r = await fn.call(FinancialLedgerService, { payoutId, source: 'payout_service' });
        if (!r.posted) logger.warn({ payoutId, type, reason: r.reason, detail: r.detail }, '[ShadowLedger] lançamento do saque ignorado — fluxo real não afetado');
      } catch (err: any) {
        logger.error({ payoutId, type, error: err?.message }, '[ShadowLedger] lançamento do saque falhou — fluxo real não afetado; repetível (idempotente)');
      }
    }, true);
  } catch (err: any) {
    logger.error({ payoutId, type, error: err?.message }, '[ShadowLedger] flush do evento de saque falhou — o worker recuperará');
  }
}

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
  let stage: LedgerStage | undefined;
  const runInTx = async (tx: any) => {
    stage = undefined; // uma tentativa desfeita (corrida de idempotência) nunca deixa eventos "fantasma" para o pós-commit
    const clientIdempotencyKey = typeof input.idempotencyKey === 'string' ? input.idempotencyKey.trim() : '';
    if (!clientIdempotencyKey) {
      throw new PayoutValidationError('IDEMPOTENCY_KEY_REQUIRED', 'Informe idempotencyKey — necessária para que um reenvio da mesma solicitação não reserve saldo duas vezes.');
    }

    // Idempotência primeiro, antes de qualquer outra validação: se a chave já foi
    // usada, devolve o estado existente sem tocar em nenhum saldo.
    const existingPayout = await tx.select().from(sellerPayouts).where(eq(sellerPayouts.idempotencyKey, clientIdempotencyKey)).limit(1);
    if (existingPayout.length > 0) {
      const p = existingPayout[0];
      // E8: a chave de idempotência é global na tabela; um saque de OUTRO vendedor nunca é devolvido (vazaria valor/método/estado) — conflito genérico, sem dados.
      if (p.sellerId !== input.sellerId) {
        throw new PayoutValidationError('IDEMPOTENCY_KEY_CONFLICT', 'Esta chave de idempotência já foi usada por outra solicitação. Gere uma nova chave.', 409);
      }
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

    if (!input.amount || !Number.isFinite(input.amount) || input.amount <= 0 || Math.round(input.amount * 100) < 1) {
      throw new PayoutValidationError('INVALID_AMOUNT', 'Informe um valor válido para saque.');
    }
    // E8: no máximo 2 casas decimais — antes um valor como 10.005 debitava a carteira por um valor e registrava o saque por outro (arredondamento)
    if (Math.abs(input.amount * 100 - Math.round(input.amount * 100)) > 1e-6) {
      throw new PayoutValidationError('INVALID_AMOUNT', 'O valor do saque deve ter no máximo 2 casas decimais.');
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

    // E7 — o saque só pode usar o DISPONÍVEL = saldo da carteira − retenções ativas (wallet_holds). A carteira já está travada (FOR UPDATE acima), a MESMA trava que a
    // criação/liberação de retenções usa: saque × retenção do mesmo vendedor são serializados. Retenção NÃO muda wallets.balance; o saque debita só o valor pedido.
    const totalBalance = Number(sellerWallet.balance || 0);
    const heldMicros = await sumActiveHoldsMicros(tx, sellerWallet.id);
    const totalMicros = toMicros(String(sellerWallet.balance ?? '0'));
    const requestedMicros = toMicros(Number(input.amount).toFixed(2));
    if (requestedMicros > totalMicros - heldMicros) {
      if (heldMicros > 0n && requestedMicros <= totalMicros) {
        throw new PayoutValidationError('BALANCE_ON_HOLD', `Parte do saldo está retida por obrigação financeira em análise. Disponível para saque: ${formatMicros(totalMicros - heldMicros, 2)} ${requestedCurrency}.`, 409);
      }
      throw new PayoutValidationError('INSUFFICIENT_AVAILABLE_BALANCE', 'Saldo disponível insuficiente para solicitar o saque.', 409);
    }

    const amountStr = formatMicros(requestedMicros, 2);
    const newBalance = Number(formatMicros(totalMicros - requestedMicros, 2));
    await tx
      .update(wallets)
      .set({ balance: String(newBalance.toFixed(2)), updatedAt: new Date() })
      .where(eq(wallets.id, sellerWallet.id));

    const payoutId = `payout_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const requestedAt = new Date();
    await tx.insert(sellerPayouts).values({
      id: payoutId,
      sellerId: input.sellerId,
      amount: amountStr,
      currency: requestedCurrency,
      method: canonicalMethod,
      bankAccountId: validatedBankAccountId,
      status: 'pending',
      idempotencyKey: clientIdempotencyKey,
      createdAt: requestedAt,
    });

    await tx.insert(walletTransactions).values({
      id: `wtx_payout_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      walletId: sellerWallet.id,
      type: 'payout',
      amount: `-${amountStr}`,
      currency: requestedCurrency,
      title: `Solicitação de Saque (${canonicalMethod.toUpperCase()})`,
      referenceId: payoutId,
      referenceType: 'withdrawal',
      status: 'pending',
      balanceAfter: String(newBalance.toFixed(2)),
      idempotencyKey: `payout_request:${payoutId}`,
      createdAt: new Date(),
    });

    await tx.insert(auditLogs).values({
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, actorUserId: input.sellerUserId, action: 'payout.request', resource: 'seller_payout', resourceId: payoutId,
      detailsJson: { sellerId: input.sellerId, walletId: sellerWallet.id, amount: amountStr, currency: requestedCurrency, method: canonicalMethod, totalBefore: formatMicros(totalMicros, 2), heldAtRequest: formatMicros(heldMicros, 2) }, createdAt: new Date(),
    });

    // E8b: a solicitação (saldo já reservado acima, na MESMA transação) vira evento do outbox — idempotente, em savepoint; nunca derruba a reserva real
    stage = await stagePayoutEventInTx(tx, { eventType: 'PAYOUT_REQUESTED', payout: { id: payoutId, sellerId: input.sellerId, amount: amountStr, currency: requestedCurrency, method: canonicalMethod, createdAt: requestedAt }, occurredAt: requestedAt, source: 'payout_service' });

    return {
      id: payoutId, amount: input.amount, currency: requestedCurrency, method: canonicalMethod,
      bankAccountId: validatedBankAccountId, status: 'pending', newAvailableBalance: Number(formatMicros(toMicros(newBalance.toFixed(2)) - heldMicros, 2)),
    };
  };

  if (executor) return runInTx(executor);
  const db = getDb();
  if (!db) throw new Error('Banco de dados indisponível.');
  let result: any;
  try {
    result = await db.transaction(runInTx);
  } catch (err: any) {
    const code = err?.code ?? err?.cause?.code; const constraint = String(err?.constraint ?? err?.cause?.constraint ?? '');
    if (code === '23505' && constraint.includes('seller_payouts_idempotency_uq')) result = await db.transaction(runInTx); // a transação perdedora foi desfeita (sem débito); agora vê o saque e devolve o replay
    else throw err;
  }
  if (!result?.alreadyRequested) await flushPayoutLedger(stage, 'PAYOUT_REQUESTED', result.id);
  return result;
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
  options: { transactionRef?: string; isProduction?: boolean; actorUserId?: string | null } = {},
  executor?: any
) {
  let staged: { stage: LedgerStage | undefined; type: PayoutEventType } | undefined;
  const runInTx = async (tx: any) => {
    staged = undefined;
    // E8: trava a linha do saque — duas transições concorrentes (ex.: completed × failed) são serializadas e a segunda relê o estado já gravado
    const payoutRows = await tx.select().from(sellerPayouts).where(eq(sellerPayouts.id, payoutId)).for('update').limit(1);
    if (payoutRows.length === 0) throw new Error('Solicitação de saque não encontrada.');
    const p = payoutRows[0];
    const currentStatus = p.status as PayoutStatus;
    const audit = (from: string, to: string, extra: Record<string, unknown> = {}) => tx.insert(auditLogs).values({
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, actorUserId: options.actorUserId ?? null, action: 'payout.status_change', resource: 'seller_payout', resourceId: p.id,
      detailsJson: { from, to, amount: String(p.amount), currency: p.currency, sellerId: p.sellerId, ...extra }, createdAt: new Date(),
    });

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

      const processedAt = new Date();
      await tx.update(sellerPayouts).set({ status: 'completed', processedAt, transactionRef: ref }).where(eq(sellerPayouts.id, p.id));
      await audit(currentStatus, 'completed', { transactionRef: ref });
      // E8b: a CONCLUSÃO só vira evento na MESMA transação que grava o estado concluído (o ledger nunca registra conclusão antes do fato)
      staged = { type: 'PAYOUT_COMPLETED', stage: await stagePayoutEventInTx(tx, { eventType: 'PAYOUT_COMPLETED', payout: { id: p.id, sellerId: p.sellerId, amount: String(p.amount), currency: p.currency, method: p.method, createdAt: p.createdAt, processedAt, transactionRef: ref }, occurredAt: processedAt, source: 'payout_service' }) };

      const wtxRows = await tx.select().from(walletTransactions).where(eq(walletTransactions.referenceId, p.id)).limit(1);
      if (wtxRows.length > 0) {
        await tx.update(walletTransactions).set({ status: 'completed' }).where(eq(walletTransactions.id, wtxRows[0].id));
      }

      return { success: true, message: `Saque #${p.id} concluído com sucesso. Ref: ${ref}` };
    }

    if (status === 'processing') {
      await tx.update(sellerPayouts).set({ status: 'processing' }).where(eq(sellerPayouts.id, p.id));
      await audit(currentStatus, 'processing');
      return { success: true, message: `Saque #${p.id} alterado para em processamento.` };
    }

    if (status === 'failed') {
      const refundIdempotencyKey = `payout_refund:${p.id}`;
      const existingRefundWtx = await tx.select().from(walletTransactions).where(eq(walletTransactions.idempotencyKey, refundIdempotencyKey)).limit(1);

      await tx.update(sellerPayouts).set({ status: 'failed' }).where(eq(sellerPayouts.id, p.id));
      await audit(currentStatus, 'failed', { refundAlreadyDone: existingRefundWtx.length > 0 });
      // E8b: a FALHA (e a devolução do saldo, abaixo, na mesma transação) vira evento que reverte a solicitação no ledger
      staged = { type: 'PAYOUT_FAILED', stage: await stagePayoutEventInTx(tx, { eventType: 'PAYOUT_FAILED', payout: { id: p.id, sellerId: p.sellerId, amount: String(p.amount), currency: p.currency, method: p.method, createdAt: p.createdAt }, occurredAt: new Date(), source: 'payout_service' }) };

      if (existingRefundWtx.length > 0) {
        return { success: true, message: `Saque #${p.id} marcado como falho. Reembolso já efetuado anteriormente.`, alreadyRefunded: true };
      }

      const selRows = await tx.select().from(sellers).where(eq(sellers.id, p.sellerId)).limit(1);
      if (selRows.length === 0) {
        // E8: nunca marcar FALHO sem devolver o saldo (antes: sucesso silencioso com o dinheiro preso). Aborta a transação: nada muda e o erro é visível.
        const err: any = new Error(`PAYOUT_REFUND_SELLER_NOT_FOUND: vendedor ${p.sellerId} não encontrado — o estorno do saque ${p.id} não pode ser feito; nada foi alterado.`);
        err.code = 'PAYOUT_REFUND_SELLER_NOT_FOUND';
        throw err;
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
  const result = await db.transaction(runInTx);
  const sg = staged as { stage: LedgerStage | undefined; type: PayoutEventType } | undefined;
  if (sg) await flushPayoutLedger(sg.stage, sg.type, payoutId);
  return result;
}
