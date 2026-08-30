/**
 * Correção crítica (Visão Geral do vendedor zerada / "Pedidos de Venda"
 * quebrando a página) — fonte ÚNICA e real (PostgreSQL) para tudo que
 * envolve pedidos/financeiro do vendedor autenticado. Antes desta correção,
 * GET /seller/overview e GET /seller/analytics liam de `currentSellerOrders`/
 * `currentWallet` — variáveis em memória, inicializadas vazias/zeradas e
 * NUNCA reatribuídas em lugar nenhum do código (confirmado por auditoria:
 * zero ocorrências de atribuição fora da declaração inicial). GET
 * /seller/orders e GET /seller/wallet já liam o banco real corretamente —
 * este módulo extrai essa MESMA query/cálculo para ser reaproveitada pelos
 * três endpoints, nunca uma segunda implementação divergente.
 *
 * ==========================================================================
 * SEMÂNTICA DE STATUS (documentada uma vez, usada em todo lugar):
 * ==========================================================================
 *
 * orders.paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded'
 *   -> "Pago" na UI é EXCLUSIVAMENTE paymentStatus === 'paid'. Um pedido
 *   pending_payment NUNCA é contado como pago, mesmo já tendo order_items.
 *
 * orders.status: 'pending_payment' | 'processing' | 'ready_to_ship' |
 *   'shipped' | 'in_transit' | 'delivered' | 'cancelled' | 'refund_requested'
 *   | 'refunded' | 'disputed'
 *   -> status GERAL/financeiro do pedido inteiro.
 *
 * order_items.status: 'pending_preparation' | 'preparing' | 'ready_to_ship'
 *   | 'shipped' | 'cancelled'
 *   -> status OPERACIONAL/logístico deste item, ESPECÍFICO deste vendedor
 *   (pode divergir do status geral em pedidos multi-seller). É isto que a UI
 *   deve mostrar como "Status Operacional" — nunca confundir com
 *   paymentStatus. Exemplo real e válido simultaneamente:
 *     paymentStatus = 'paid'   (Pagamento: Pago)
 *     status        = 'processing'
 *     itemStatus    = 'pending_preparation'  (Operação: Preparação)
 *
 * "Receita paga" (grossRevenue/netRevenue/paidOrders) = paymentStatus==='paid'
 *   E status NOT IN ('cancelled','refunded') — mesma regra de "vendido" já
 *   usada pelo catálogo público (ver SOLD_ORDER_STATUSES_EXCLUDED em
 *   catalogService.ts, reexportada aqui para nunca divergir).
 *
 * escrow_accounts.status: 'held' | 'released' | 'disputed' | 'refunded'
 *   (o valor 'eligible' existe no comentário do schema mas NUNCA é atribuído
 *   em nenhum lugar do código real — releaseEscrowForOrder() libera
 *   diretamente held -> released na confirmação de entrega, sem estado
 *   intermediário. Não inventamos esse estado aqui.)
 *   -> heldEscrow = soma de escrow 'held' (dinheiro comprador já pagou,
 *      ainda retido em garantia).
 *   -> pendingRelease = subconjunto do held cujo pedido já está
 *      orders.status === 'delivered' (entrega já confirmada, aguardando o
 *      processamento de liberação) — não é um saldo adicional, é um
 *      destaque informativo de QUANTO do held já deveria estar prestes a
 *      liberar. Nunca somado ao heldEscrow como dinheiro extra.
 */
import { getDb } from '../../../db/index.js';
import { orderItems, orders, escrowAccounts, wallets, walletTransactions } from '../../../db/schema.js';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { SOLD_ORDER_STATUSES_EXCLUDED } from '../catalog/catalogService.js';
import { logger } from '../../infra/logger.js';

export { SOLD_ORDER_STATUSES_EXCLUDED as SELLER_REVENUE_EXCLUDED_STATUSES };

export interface SellerOrderRow {
  orderItemId: string;
  orderId: string;
  orderNumber: string;
  buyerId: string;
  productId: string;
  productTitle: string;
  productSku: string | null;
  variantTitle: string | null;
  productImage: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  fulfillmentMode: string;
  itemStatus: string;
  orderStatus: string;
  paymentStatus: string;
  paymentMethod: string | null;
  escrowStatus: string;
  currency: string;
  totalAmount: number;
  sellerNetAmount: number | null;
  marketplaceCommission: number | null;
  commissionRateSnapshot: number | null;
  shippingSellerSubsidy: number | null;
  shippingAddressJson: any;
  createdAt: Date;
}

/** Mapeamento operacional único — reusado por /seller/orders e pelos contadores do Overview. */
export function mapOperationalStatus(orderStatus: string, paymentStatus: string, itemStatus: string): { status: string; rawStatus: string } {
  const statusMap: Record<string, string> = {
    pending_payment: 'pending_payment',
    paid: 'preparing',
    pending_preparation: 'preparing',
    preparing: 'preparing',
    ready_to_ship: 'preparing',
    shipped: 'shipped',
    delivered: 'delivered',
    cancelled: 'cancelled',
  };
  const currentStatus = itemStatus || orderStatus;
  const isPendingPayment = orderStatus === 'pending_payment' || paymentStatus === 'pending';
  const mappedStatus = isPendingPayment ? 'pending_payment' : (statusMap[currentStatus] || currentStatus);
  return { status: mappedStatus, rawStatus: currentStatus };
}

/**
 * Query real única para os pedidos de um vendedor — MESMA query que já
 * existia embutida em GET /seller/orders, agora extraída para ser
 * reaproveitada por /seller/overview e /seller/analytics também.
 */
export async function getSellerOrderRows(sellerId: string, executor?: any): Promise<SellerOrderRow[]> {
  const db = executor ?? getDb();
  if (!db) return [];

  const rows = await db
    .select({
      orderItemId: orderItems.id,
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      buyerId: orders.buyerId,
      productId: orderItems.productId,
      productTitle: orderItems.productTitle,
      productSku: orderItems.productSku,
      variantTitle: orderItems.variantTitle,
      productImage: orderItems.productImage,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
      subtotal: orderItems.subtotal,
      fulfillmentMode: orderItems.fulfillmentMode,
      itemStatus: orderItems.status,
      orderStatus: orders.status,
      paymentMethod: orders.paymentMethod,
      paymentStatus: orders.paymentStatus,
      escrowStatus: orders.escrowStatus,
      currency: orders.currency,
      totalAmount: orders.totalAmount,
      sellerNetAmount: orders.sellerNetAmount,
      marketplaceCommission: orders.marketplaceCommission,
      commissionRateSnapshot: orders.commissionRateSnapshot,
      shippingSellerSubsidy: orders.shippingSellerSubsidy,
      shippingAddressJson: orders.shippingAddressJson,
      createdAt: orders.createdAt,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(eq(orderItems.sellerId, sellerId), eq(orderItems.fulfillmentMode, 'SELLER_FULFILLMENT')))
    .orderBy(desc(orders.createdAt));

  return rows.map((r: any) => ({
    ...r,
    unitPrice: Number(r.unitPrice),
    subtotal: Number(r.subtotal),
    totalAmount: Number(r.totalAmount),
    sellerNetAmount: r.sellerNetAmount !== null && r.sellerNetAmount !== undefined ? Number(r.sellerNetAmount) : null,
    marketplaceCommission: r.marketplaceCommission !== null && r.marketplaceCommission !== undefined ? Number(r.marketplaceCommission) : null,
    commissionRateSnapshot: r.commissionRateSnapshot !== null && r.commissionRateSnapshot !== undefined ? Number(r.commissionRateSnapshot) : null,
    shippingSellerSubsidy: r.shippingSellerSubsidy !== null && r.shippingSellerSubsidy !== undefined ? Number(r.shippingSellerSubsidy) : null,
  }));
}

export interface SellerWalletSnapshot {
  currency: string;
  available: number;
  retained: number;
  pendingRelease: number;
  totalEarned: number;
  transactions: any[];
}

/**
 * MESMA função já usada por GET /seller/wallet (movida para cá para ser
 * reaproveitada também por /seller/overview) — nunca escolhe uma wallet sem
 * moeda explícita (ver correção anterior "wallet multi-moeda").
 */
export async function computeSellerWalletSnapshot(db: any, seller: { id: string; userId: string }, currency: string): Promise<SellerWalletSnapshot> {
  const cur = currency.toUpperCase();

  let walletRows = await db.select().from(wallets).where(and(eq(wallets.userId, seller.userId), eq(wallets.currency, cur))).limit(1);
  let w = walletRows[0];
  if (!w) {
    const wId = `wlt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await db.insert(wallets).values({
      id: wId,
      userId: seller.userId,
      balance: '0.00',
      cashbackBalance: '0.00',
      pendingBalance: '0.00',
      currency: cur,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();
    const createdW = await db.select().from(wallets).where(and(eq(wallets.userId, seller.userId), eq(wallets.currency, cur))).limit(1);
    w = createdW[0];
  }

  // heldEscrow: TODO escrow retido nesta moeda, independente do status de entrega.
  const heldEscrowRows = await db
    .select({ amount: escrowAccounts.amount, orderId: escrowAccounts.orderId })
    .from(escrowAccounts)
    .where(and(eq(escrowAccounts.sellerId, seller.id), eq(escrowAccounts.status, 'held'), eq(escrowAccounts.currency, cur)));
  const retainedSum = heldEscrowRows.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);

  // pendingRelease: subconjunto do held cujo PEDIDO já foi entregue (destaque
  // informativo — nunca somado por cima do heldEscrow, ver documentação no
  // topo do arquivo).
  let pendingRelease = 0;
  if (heldEscrowRows.length > 0) {
    const orderIds = heldEscrowRows.map((r: any) => r.orderId);
    const deliveredOrders = await db.select({ id: orders.id }).from(orders)
      .where(and(inArray(orders.id, orderIds), eq(orders.status, 'delivered')));
    const deliveredIdSet = new Set(deliveredOrders.map((o: any) => o.id));
    pendingRelease = heldEscrowRows
      .filter((r: any) => deliveredIdSet.has(r.orderId))
      .reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
  }

  const txs = w
    ? await db.select().from(walletTransactions).where(eq(walletTransactions.walletId, w.id)).orderBy(desc(walletTransactions.createdAt))
    : [];

  const totalEarnedSum = txs
    .filter((t: any) => (t.type === 'escrow_release' || t.type === 'deposit') && t.status === 'completed')
    .reduce((sum: number, t: any) => sum + Math.abs(Number(t.amount || 0)), 0);

  return {
    currency: cur,
    available: Number(w?.balance || 0),
    retained: retainedSum,
    pendingRelease,
    totalEarned: totalEarnedSum,
    transactions: txs.map((t: any) => ({
      id: t.id,
      type: t.type,
      title: t.title,
      date: t.createdAt,
      amount: Number(t.amount),
      currency: t.currency,
      status: t.status,
      balanceAfter: Number(t.balanceAfter),
      referenceId: t.referenceId,
      referenceType: t.referenceType,
    })),
  };
}

export interface SellerOverviewMetrics {
  grossRevenue: number;
  netRevenue: number;
  totalOrders: number;
  pendingOrders: number;
  paidOrders: number;
  preparingOrders: number;
  shippedOrders: number;
  deliveredOrders: number;
  returnOrders: number;
  disputeOrders: number;
  // Correção crítica (netRevenue nunca pode fingir "R$0" para inconsistência
  // de dados): sellerNetAmount ausente num pedido PAGO não é um valor real
  // de zero — é uma falha de dados (deveria sempre existir, calculado na
  // criação do pedido). netRevenue soma só os valores realmente presentes;
  // estes dois campos tornam a omissão visível em vez de escondida.
  financialDataComplete: boolean;
  missingSellerNetAmountCount: number;
}

export interface SellerOverviewResult {
  currency: string;
  metrics: SellerOverviewMetrics;
  balances: { available: number; retained: number; future: number; currency: string };
  recentOrders: SellerOrderRow[];
}

/**
 * Métricas reais do Overview/Analytics, SEMPRE escopadas a UMA moeda
 * explícita (nunca mistura BRL+XOF+GMD na mesma soma). `sinceDate` filtra
 * por período (usado por /seller/analytics); omitido = todo o histórico.
 *
 * Dedup por orderId: um pedido pode ter mais de um order_item deste mesmo
 * vendedor (múltiplos produtos no mesmo carrinho) — cada pedido só conta
 * UMA vez nas métricas financeiras/contadores, nunca uma vez por item.
 */
export async function computeSellerOverviewMetrics(
  seller: { id: string; userId: string },
  currency: string,
  executor?: any,
  sinceDate?: Date
): Promise<SellerOverviewResult> {
  const db = executor ?? getDb();
  const cur = currency.toUpperCase();

  const allRows = await getSellerOrderRows(seller.id, executor);
  const curRows = allRows.filter((r) => r.currency === cur && (!sinceDate || r.createdAt >= sinceDate));

  const byOrder = new Map<string, SellerOrderRow>();
  for (const r of curRows) {
    if (!byOrder.has(r.orderId)) byOrder.set(r.orderId, r);
  }
  const distinctOrders = Array.from(byOrder.values());

  const paidOrders = distinctOrders.filter((o) => o.paymentStatus === 'paid' && !SOLD_ORDER_STATUSES_EXCLUDED.includes(o.orderStatus));
  const grossRevenue = paidOrders.reduce((sum, o) => sum + o.totalAmount, 0);

  // netRevenue nunca trata sellerNetAmount ausente como 0: um pedido pago
  // SEMPRE deveria ter esse valor (calculado na criação do pedido,
  // orderService.ts) — se não tem, é inconsistência de dados, não um
  // repasse real de zero. Soma só o que realmente existe; conta e loga o
  // que falta, para nunca esconder a lacuna dentro de um número que parece
  // completo.
  const ordersMissingSellerNet = paidOrders.filter((o) => o.sellerNetAmount === null || o.sellerNetAmount === undefined);
  const netRevenue = paidOrders.reduce((sum, o) => sum + (o.sellerNetAmount ?? 0), 0);
  const missingSellerNetAmountCount = ordersMissingSellerNet.length;
  const financialDataComplete = missingSellerNetAmountCount === 0;

  if (missingSellerNetAmountCount > 0) {
    logger.warn(
      {
        sellerId: seller.id,
        currency: cur,
        missingSellerNetAmountCount,
        affectedOrderIds: ordersMissingSellerNet.map((o) => o.orderId),
      },
      'SELLER_FINANCIAL_DATA_INCOMPLETE: pedido(s) pago(s) sem sellerNetAmount — netRevenue está subcontado, não é um valor completo'
    );
  }

  const pendingOrders = distinctOrders.filter((o) => mapOperationalStatus(o.orderStatus, o.paymentStatus, o.itemStatus).status === 'pending_payment').length;
  const preparingOrders = distinctOrders.filter((o) => mapOperationalStatus(o.orderStatus, o.paymentStatus, o.itemStatus).status === 'preparing').length;
  const shippedOrders = distinctOrders.filter((o) => mapOperationalStatus(o.orderStatus, o.paymentStatus, o.itemStatus).status === 'shipped').length;
  const deliveredOrders = distinctOrders.filter((o) => mapOperationalStatus(o.orderStatus, o.paymentStatus, o.itemStatus).status === 'delivered').length;
  const returnOrders = distinctOrders.filter((o) => o.orderStatus === 'refund_requested' || o.orderStatus === 'refunded').length;
  const disputeOrders = distinctOrders.filter((o) => o.orderStatus === 'disputed').length;

  const wallet = db ? await computeSellerWalletSnapshot(db, seller, cur) : { available: 0, retained: 0, pendingRelease: 0 };

  return {
    currency: cur,
    metrics: {
      grossRevenue,
      netRevenue,
      totalOrders: distinctOrders.length,
      pendingOrders,
      paidOrders: paidOrders.length,
      preparingOrders,
      shippedOrders,
      deliveredOrders,
      returnOrders,
      disputeOrders,
      financialDataComplete,
      missingSellerNetAmountCount,
    },
    balances: {
      available: wallet.available,
      retained: wallet.retained,
      future: wallet.pendingRelease,
      currency: cur,
    },
    recentOrders: distinctOrders.slice(0, 5),
  };
}
