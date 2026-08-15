import { getDb } from '../../../db/index.js';
import { wallets, walletTransactions, escrowAccounts, escrowTransactions, sellerPayouts, notifications } from '../../../db/schema.js';
import { eq, desc, sql } from 'drizzle-orm';
import { logger } from '../../infra/logger.js';

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
      // Create if missing
      await db.insert(wallets).values({
        id: `wal_${userId}`,
        userId,
        balance: '0.00',
        cashbackBalance: '0.00',
        pendingBalance: '0.00',
        currency: 'XOF',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      walletRes = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
    }

    const wallet = walletRes[0];
    const transactions = await db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.walletId, wallet.id))
      .orderBy(desc(walletTransactions.createdAt))
      .limit(50);

    return {
      ...wallet,
      balance: Number(wallet.balance),
      cashbackBalance: Number(wallet.cashbackBalance),
      pendingBalance: Number(wallet.pendingBalance),
      transactions: transactions.map((t) => ({
        ...t,
        amount: Number(t.amount),
        balanceAfter: Number(t.balanceAfter),
      })),
    };
  }

  static async deposit(userId: string, amount: number, currency: string, method: string, idempotencyKey?: string) {
    const db = getDb();
    if (!db) return { success: true, newBalance: amount };

    let walletRes = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
    if (walletRes.length === 0) {
      await db.insert(wallets).values({
        id: `wal_${userId}`,
        userId,
        balance: '0.00',
        currency,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      walletRes = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
    }

    const wallet = walletRes[0];
    const newBalance = Number(wallet.balance) + amount;

    await db
      .update(wallets)
      .set({
        balance: String(newBalance),
        updatedAt: new Date(),
      })
      .where(eq(wallets.id, wallet.id));

    const txId = `wtx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    await db.insert(walletTransactions).values({
      id: txId,
      walletId: wallet.id,
      type: 'deposit',
      amount: String(amount),
      currency,
      title: `Recarga de Carteira via ${method.toUpperCase()}`,
      status: 'completed',
      balanceAfter: String(newBalance),
      idempotencyKey,
      createdAt: new Date(),
    });

    return {
      success: true,
      transactionId: txId,
      newBalance,
    };
  }

  static async releaseEscrow(escrowAccountId: string, performedBy: string) {
    const db = getDb();
    if (!db) return { success: true };

    const escrowRes = await db.select().from(escrowAccounts).where(eq(escrowAccounts.id, escrowAccountId)).limit(1);
    if (escrowRes.length === 0) throw new Error('Conta escrow não encontrada.');

    const escrow = escrowRes[0];
    if (escrow.status === 'released') {
      return { success: true, message: 'Escrow já liberado anteriormente.' };
    }

    // 1. Mark escrow as released
    await db
      .update(escrowAccounts)
      .set({
        status: 'released',
        releasedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(escrowAccounts.id, escrowAccountId));

    // 2. Add ledger transaction
    await db.insert(escrowTransactions).values({
      id: `etx_${Date.now()}`,
      escrowAccountId,
      type: 'RELEASE_SELLER',
      amount: escrow.amount,
      currency: escrow.currency,
      reason: 'Liberação de pagamento ao vendedor após confirmação de entrega do pedido.',
      performedBy,
      createdAt: new Date(),
    });

    logger.info({ escrowAccountId, sellerId: escrow.sellerId, amount: escrow.amount }, 'Escrow released to seller');
    return { success: true };
  }
}
