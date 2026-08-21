import { getDb } from '../../../db/index.js';
import { wallets, walletTransactions, escrowAccounts, escrowTransactions, sellerPayouts, notifications } from '../../../db/schema.js';
import { eq, desc, sql } from 'drizzle-orm';
import { logger } from '../../infra/logger.js';
import { PaymentService } from '../payments/paymentService.js';

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

  static async depositFunds(userId: string, amount: number, currency = 'XOF', method = 'pix', idempotencyKey?: string) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível.');

    const walletData = await this.getWallet(userId);
    const wallet = walletData as any;

    const newBalance = wallet.balance + amount;
    const txId = `wtx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    await db
      .update(wallets)
      .set({
        balance: String(newBalance),
        updatedAt: new Date(),
      })
      .where(eq(wallets.id, wallet.id));

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
    return PaymentService.releaseEscrowForOrder(escrow.orderId, {
      performedBy,
      reason: 'Liberação de pagamento ao vendedor após confirmação de entrega do pedido.',
    });
  }
}
