import { getDb } from '../../../db/index.js';
import { wallets, walletTransactions, escrowAccounts, escrowTransactions, sellerPayouts, notifications } from '../../../db/schema.js';
import { eq, desc, sql } from 'drizzle-orm';
import { logger } from '../../infra/logger.js';
import { PaymentService } from '../payments/paymentService.js';

/** True when `err` is a Postgres unique-violation (23505) on the given constraint name. */
function isUniqueViolation(err: any, constraintName?: string): boolean {
  if (!err || err.code !== '23505') return false;
  if (!constraintName) return true;
  return String(err.constraint || '').includes(constraintName);
}

export class WalletService {
  static async getWallet(userId: string) {
    const db = getDb();
    if (!db) {
      return {
        balance: 0,
        cashbackBalance: 0,
        pendingBalance: 0,
        currency: 'XOF',
        status: 'active',
        transactions: [],
      };
    }

    let walletRes = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);

    if (walletRes.length === 0) {
      const walletId = `wlt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await db.insert(wallets).values({
        id: walletId,
        userId,
        balance: '0.00',
        cashbackBalance: '0.00',
        pendingBalance: '0.00',
        currency: 'XOF',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      walletRes = await db.select().from(wallets).where(eq(wallets.id, walletId)).limit(1);
    }

    const wallet = walletRes[0];
    const txs = await db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.walletId, wallet.id))
      .orderBy(desc(walletTransactions.createdAt));

    return {
      ...wallet,
      balance: Number(wallet.balance),
      cashbackBalance: Number(wallet.cashbackBalance),
      pendingBalance: Number(wallet.pendingBalance),
      transactions: txs.map((t) => ({
        ...t,
        amount: Number(t.amount),
        balanceAfter: Number(t.balanceAfter),
      })),
    };
  }

  static async deposit(userId: string, amount: number, currency = 'XOF', method = 'pix', idempotencyKey?: string) {
    return this.depositFunds(userId, amount, currency, method, idempotencyKey);
  }

  /**
   * Credits `amount` into the user's wallet, atomically and idempotently.
   *
   * NOTE (Fase 4A): this function is no longer reachable from any public HTTP route
   * (see walletRoutes.ts — POST /wallet/deposit is disabled). It is kept, hardened, for
   * a future internal top-up flow driven by PaymentService + a confirmed provider.
   *
   * Idempotency: the `idempotencyKey` is checked FIRST, before any balance mutation, inside
   * the same transaction that later locks and updates the wallet row — so a retry with the
   * same key can never increment the balance twice. A residual race (two concurrent calls
   * with the same brand-new key) is closed by catching the `wallet_transactions` unique
   * constraint violation and replaying the already-committed result instead of erroring.
   *
   * Locking: the wallet row is read with `FOR UPDATE` so concurrent deposits/withdrawals for
   * the same wallet serialize instead of racing on a stale balance.
   */
  static async depositFunds(userId: string, amount: number, currency = 'XOF', method = 'pix', idempotencyKey?: string) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível.');

    const amt = Number(amount);
    if (!amt || !isFinite(amt) || amt <= 0) {
      throw new Error('Valor de depósito inválido.');
    }

    const runDeposit = async () => {
      return await db.transaction(async (tx) => {
        // 1. Idempotency check FIRST — before touching balance at all.
        if (idempotencyKey) {
          const existing = await tx
            .select()
            .from(walletTransactions)
            .where(eq(walletTransactions.idempotencyKey, idempotencyKey))
            .limit(1);
          if (existing.length > 0) {
            const prior = existing[0];
            logger.info({ idempotencyKey, transactionId: prior.id }, '[WalletService] depositFunds: idempotent replay, balance untouched');
            return {
              success: true,
              transactionId: prior.id,
              newBalance: Number(prior.balanceAfter),
              idempotentReplay: true,
            };
          }
        }

        // 2. Ensure a wallet row exists. Race-safe: if two first-time deposits for the same
        // brand-new user run concurrently, `ON CONFLICT DO NOTHING` on the unique `userId`
        // makes the loser's insert a silent no-op (it blocks until the winner commits, then
        // sees the conflict) instead of throwing — the re-SELECT below picks up whichever
        // wallet row actually won, with no aborted transaction and no duplicate wallet.
        const existingWallet = await tx.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
        let walletId: string;
        if (existingWallet.length === 0) {
          const candidateId = `wlt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          await tx
            .insert(wallets)
            .values({
              id: candidateId,
              userId,
              balance: '0.00',
              cashbackBalance: '0.00',
              pendingBalance: '0.00',
              currency,
              status: 'active',
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .onConflictDoNothing({ target: wallets.userId });

          const afterInsert = await tx.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
          walletId = afterInsert[0].id;
        } else {
          walletId = existingWallet[0].id;
        }

        // 3. Lock the wallet row for the rest of this transaction (SELECT ... FOR UPDATE).
        const lockedRows = await tx.select().from(wallets).where(eq(wallets.id, walletId)).for('update');
        const wallet = lockedRows[0];

        if (wallet.status !== 'active') {
          throw new Error('WALLET_LOCKED: Sua carteira está inativa ou bloqueada para transações.');
        }

        const currentBalance = Number(wallet.balance || 0);
        const newBalance = currentBalance + amt;
        const txId = `wtx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        await tx
          .update(wallets)
          .set({
            balance: String(newBalance.toFixed(2)),
            updatedAt: new Date(),
          })
          .where(eq(wallets.id, wallet.id));

        await tx.insert(walletTransactions).values({
          id: txId,
          walletId: wallet.id,
          type: 'deposit',
          amount: String(amt.toFixed(2)),
          currency,
          title: `Recarga de Carteira via ${method.toUpperCase()}`,
          status: 'completed',
          balanceAfter: String(newBalance.toFixed(2)),
          idempotencyKey: idempotencyKey || null,
          createdAt: new Date(),
        });

        return {
          success: true,
          transactionId: txId,
          newBalance,
        };
      });
    };

    try {
      return await runDeposit();
    } catch (err: any) {
      // Concurrent duplicate: another request with the SAME idempotencyKey committed first.
      // Treat as an idempotent replay instead of surfacing a raw DB error.
      if (idempotencyKey && isUniqueViolation(err, 'wallet_transactions_idempotency_uq')) {
        const existing = await db
          .select()
          .from(walletTransactions)
          .where(eq(walletTransactions.idempotencyKey, idempotencyKey))
          .limit(1);
        if (existing.length > 0) {
          const prior = existing[0];
          logger.info({ idempotencyKey, transactionId: prior.id }, '[WalletService] depositFunds: concurrent duplicate resolved as idempotent replay');
          return {
            success: true,
            transactionId: prior.id,
            newBalance: Number(prior.balanceAfter),
            idempotentReplay: true,
          };
        }
      }
      throw err;
    }
  }

  static async releaseEscrow(escrowAccountId: string, performedBy: string) {
    const db = getDb();
    if (!db) return { success: true };

    const escrowRes = await db.select().from(escrowAccounts).where(eq(escrowAccounts.id, escrowAccountId)).limit(1);
    if (escrowRes.length === 0) throw new Error('Conta escrow não encontrada.');

    const escrow = escrowRes[0];
    return PaymentService.releaseEscrowForOrder(escrow.orderId, {
      performedBy,
      reason: 'Liberação de pagamento ao vendedor após confirmação de entrega do pedido.',
    });
  }
}
