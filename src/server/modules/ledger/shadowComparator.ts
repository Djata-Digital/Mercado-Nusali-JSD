/**
 * Comparador shadow (Fase 5A, seção 17) — diagnóstico read-only. Nunca corrige nada;
 * só classifica. Compara, para um pedido, o que o fluxo legado gravou (payments,
 * escrow_accounts, snapshots em orders) contra o que o ledger novo gravou em
 * paralelo (ledger_transactions/ledger_entries).
 */
import { getDb } from '../../../db/index.js';
import { orders, payments, escrowAccounts, ledgerTransactions, ledgerEntries, ledgerAccounts } from '../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { toMicros } from './decimal.js';

export type ComparisonStatus = 'MATCH' | 'MISMATCH' | 'MISSING_SNAPSHOT' | 'LEGACY_ORDER' | 'ERROR';

export interface OrderComparisonResult {
  orderId: string;
  paymentReceived: { status: ComparisonStatus; detail?: string };
  escrowHold: { status: ComparisonStatus; detail?: string };
  deliveryConfirmed: { status: ComparisonStatus; detail?: string };
}

async function compareLedgerTransaction(
  db: NonNullable<ReturnType<typeof getDb>>,
  idempotencyKey: string,
  expected: { debitAccountCode?: string; creditAccountCode?: string; amount?: string; currency?: string }
): Promise<{ status: ComparisonStatus; detail?: string }> {
  const [ltx] = await db.select().from(ledgerTransactions).where(eq(ledgerTransactions.idempotencyKey, idempotencyKey)).limit(1);
  if (!ltx) {
    return { status: 'MISSING_SNAPSHOT', detail: `Nenhuma ledger_transaction com idempotencyKey=${idempotencyKey} (shadow ainda não gravou — pedido legacy, ou evento ainda não ocorreu)` };
  }
  if (ltx.status !== 'POSTED') {
    return { status: 'MISMATCH', detail: `ledger_transaction ${ltx.id} existe mas está status=${ltx.status}, não POSTED` };
  }

  const entries = await db
    .select({ direction: ledgerEntries.direction, amount: ledgerEntries.amount, currency: ledgerEntries.currency, accountId: ledgerEntries.accountId })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.transactionId, ltx.id));

  if (expected.amount && expected.currency) {
    const expectedMicros = toMicros(expected.amount);
    const relevant = entries.filter((e) => e.currency === expected.currency);
    const sumDebit = relevant.filter((e) => e.direction === 'DEBIT').reduce((acc, e) => acc + toMicros(e.amount), 0n);
    if (sumDebit !== expectedMicros) {
      return { status: 'MISMATCH', detail: `soma de débitos no ledger (${sumDebit}) difere do valor legado esperado em micros (${expectedMicros})` };
    }
  }

  return { status: 'MATCH' };
}

/** Compara um único pedido. Nunca lança para o chamador — erros viram status ERROR. */
export async function compareOrder(orderId: string): Promise<OrderComparisonResult> {
  const db = getDb();
  if (!db) {
    return {
      orderId,
      paymentReceived: { status: 'ERROR', detail: 'Banco indisponível' },
      escrowHold: { status: 'ERROR', detail: 'Banco indisponível' },
      deliveryConfirmed: { status: 'ERROR', detail: 'Banco indisponível' },
    };
  }

  try {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) {
      return {
        orderId,
        paymentReceived: { status: 'ERROR', detail: 'Pedido não encontrado' },
        escrowHold: { status: 'ERROR', detail: 'Pedido não encontrado' },
        deliveryConfirmed: { status: 'ERROR', detail: 'Pedido não encontrado' },
      };
    }

    // ---- PAYMENT_RECEIVED vs payments legado ----
    const [legacyPayment] = await db.select().from(payments).where(eq(payments.orderId, orderId)).limit(1);
    let paymentReceived: { status: ComparisonStatus; detail?: string };
    if (!legacyPayment || legacyPayment.status !== 'paid') {
      paymentReceived = { status: 'MISSING_SNAPSHOT', detail: 'Sem payments.status=paid legado para este pedido — nada a comparar ainda' };
    } else {
      paymentReceived = await compareLedgerTransaction(db, `payment_received:${orderId}`, {
        amount: order.totalAmount,
        currency: order.currency,
      });
    }

    // ---- BUYER_ESCROW (ledger) vs escrow_accounts (legado) ----
    const [legacyEscrow] = await db.select().from(escrowAccounts).where(eq(escrowAccounts.orderId, orderId)).limit(1);
    let escrowHold: { status: ComparisonStatus; detail?: string };
    if (!legacyEscrow) {
      escrowHold = { status: 'MISSING_SNAPSHOT', detail: 'Sem escrow_accounts legado para este pedido' };
    } else {
      const [ltx] = await db.select().from(ledgerTransactions).where(eq(ledgerTransactions.idempotencyKey, `payment_received:${orderId}`)).limit(1);
      if (!ltx || ltx.status !== 'POSTED') {
        escrowHold = { status: 'MISSING_SNAPSHOT', detail: 'Ledger ainda não tem PAYMENT_RECEIVED postado para comparar com o escrow legado' };
      } else {
        const legacyMicros = toMicros(legacyEscrow.amount);
        const ledgerRows = await db
          .select({ amount: ledgerEntries.amount, direction: ledgerEntries.direction, currency: ledgerEntries.currency })
          .from(ledgerEntries)
          .innerJoin(ledgerAccounts, eq(ledgerEntries.accountId, ledgerAccounts.id))
          .where(and(eq(ledgerEntries.transactionId, ltx.id), eq(ledgerAccounts.code, 'BUYER_ESCROW')));
        const ledgerMicros = ledgerRows.filter((r) => r.direction === 'CREDIT').reduce((acc, r) => acc + toMicros(r.amount), 0n);
        escrowHold =
          ledgerMicros === legacyMicros && legacyEscrow.currency === order.currency
            ? { status: 'MATCH' }
            : { status: 'MISMATCH', detail: `escrow_accounts.amount=${legacyEscrow.amount} ${legacyEscrow.currency} vs ledger BUYER_ESCROW credit=${ledgerMicros} micros ${order.currency}` };
      }
    }

    // ---- ORDER_DELIVERY_CONFIRMED vs snapshots do pedido ----
    let deliveryConfirmed: { status: ComparisonStatus; detail?: string };
    if (order.marketplaceCommission == null || order.sellerNetAmount == null) {
      deliveryConfirmed = { status: 'MISSING_SNAPSHOT', detail: 'orders não tem marketplaceCommission/sellerNetAmount — pedido anterior ao módulo de frete/comissão (Fase 3B) ou ainda não entregue' };
    } else {
      deliveryConfirmed = await compareLedgerTransaction(db, `order_release:${orderId}`, {
        amount: order.totalAmount,
        currency: order.currency,
      });
    }

    return { orderId, paymentReceived, escrowHold, deliveryConfirmed };
  } catch (err: any) {
    const errResult = { status: 'ERROR' as ComparisonStatus, detail: err?.message };
    return { orderId, paymentReceived: errResult, escrowHold: errResult, deliveryConfirmed: errResult };
  }
}

/** Varre todos os pedidos e classifica cada um — usado para o relatório de shadow. */
export async function compareAllOrders(cutoffAt?: Date): Promise<OrderComparisonResult[]> {
  const db = getDb();
  if (!db) return [];
  const allOrders = await db.select({ id: orders.id, createdAt: orders.createdAt }).from(orders);
  const results: OrderComparisonResult[] = [];
  for (const o of allOrders) {
    if (cutoffAt && o.createdAt < cutoffAt) {
      results.push({
        orderId: o.id,
        paymentReceived: { status: 'LEGACY_ORDER' },
        escrowHold: { status: 'LEGACY_ORDER' },
        deliveryConfirmed: { status: 'LEGACY_ORDER' },
      });
      continue;
    }
    results.push(await compareOrder(o.id));
  }
  return results;
}
