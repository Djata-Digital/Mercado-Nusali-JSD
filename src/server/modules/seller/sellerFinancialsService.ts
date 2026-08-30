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
import { orderItems, orders, escrowAccounts, wallets, walletTransactions, shipments, users } from '../../../db/schema.js';
import { eq, and, desc, inArray, ne } from 'drizzle-orm';
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
  shippingCost: number | null;
  shippingChargedToBuyer: number | null;
  shippingSellerSubsidy: number | null;
  shippingMarketplaceSubsidy: number | null;
  shippingAddressJson: any;
  createdAt: Date;
  // Correção crítica (Fase 1 operacional — etiqueta bloqueada): dados do
  // shipment já criado para este item (null antes de ensureFulfillmentCreated
  // rodar, ou para itens legados anteriores a esta correção).
  shipmentId: string | null;
  shipmentStatus: string | null;
  trackingNumber: string | null;
}

/**
 * Correção crítica (Fase 1 operacional — fluxo SELLER_FULFILLMENT vs
 * NUSALI_FULFILLMENT): rótulo operacional único, ciente do modo de
 * fulfillment e do status real do shipment — nunca inventa evento, só
 * traduz o que já está persistido (order_items.status + shipments.status).
 * Reaproveitado por /seller/orders (exibição) — mapOperationalStatus acima
 * continua existindo, inalterado, para os filtros de aba
 * (todos/preparação/enviados/entregues), que não precisam mudar.
 */
export function deriveOperationalLabel(
  fulfillmentMode: string,
  paymentStatus: string,
  itemStatus: string,
  shipmentStatus: string | null
): string {
  if (paymentStatus !== 'paid') return 'Aguardando pagamento';
  if (itemStatus === 'cancelled') return 'Cancelado';

  switch (shipmentStatus) {
    case 'DELIVERED': return 'Entregue';
    case 'DELIVERY_FAILED': return 'Falha na entrega';
    case 'RETURNING': return 'Em devolução';
    case 'RETURNED': return 'Devolvido';
    case 'OUT_FOR_DELIVERY': return 'Saiu para entrega';
    case 'IN_TRANSIT': return 'Em trânsito';
    case 'SHIPPED': return fulfillmentMode === 'NUSALI_FULFILLMENT' ? 'Despachado pelo HUB Nusali' : 'Coletado pela transportadora';
    default: break;
  }

  if (itemStatus === 'ready_to_ship') {
    return fulfillmentMode === 'NUSALI_FULFILLMENT' ? 'Preparado — aguardando coleta da transportadora' : 'Pronto para coleta';
  }
  if (itemStatus === 'preparing' || itemStatus === 'pending_preparation') {
    return fulfillmentMode === 'NUSALI_FULFILLMENT' ? 'Em separação no HUB Nusali' : 'Venda confirmada — aguardando preparação';
  }
  return 'Venda confirmada';
}

/**
 * Ação disponível para o VENDEDOR sobre este item (nunca para itens no
 * HUB — o seller não interfere fisicamente no que está em NUSALI_FULFILLMENT).
 * 'mark_ready_for_pickup' = o único botão físico do seller: embalar e
 * avisar que está pronto para a coleta da logística (nunca "marcar
 * enviado" — quem coleta/despacha é a transportadora/logística).
 */
export function sellerAvailableAction(fulfillmentMode: string, paymentStatus: string, itemStatus: string): 'mark_ready_for_pickup' | null {
  if (fulfillmentMode === 'NUSALI_FULFILLMENT') return null;
  if (paymentStatus !== 'paid') return null;
  if (itemStatus === 'pending_preparation' || itemStatus === 'preparing') return 'mark_ready_for_pickup';
  return null;
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

  // Correção crítica (fluxo NUSALI_FULFILLMENT — Fase 1 operacional): o
  // filtro `fulfillmentMode = 'SELLER_FULFILLMENT'` excluía TODO item cujo
  // estoque está no HUB Nusali — o vendedor nunca via essas vendas em
  // /seller/orders, /seller/overview nem /seller/analytics, mesmo sendo
  // produto/venda dele. order_items.sellerId já identifica corretamente o
  // dono da venda independente de ONDE o estoque fisicamente está — o
  // vendedor deve ver os dois modos (só não pode AGIR fisicamente sobre o
  // que está no HUB; isso é decidido na UI/rota de ação, não aqui na leitura).
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
      shippingCost: orders.shippingCost,
      shippingChargedToBuyer: orders.shippingChargedToBuyer,
      shippingSellerSubsidy: orders.shippingSellerSubsidy,
      shippingMarketplaceSubsidy: orders.shippingMarketplaceSubsidy,
      shippingAddressJson: orders.shippingAddressJson,
      createdAt: orders.createdAt,
      shipmentId: orderItems.shipmentId,
      shipmentStatus: shipments.status,
      trackingNumber: shipments.trackingNumber,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .leftJoin(shipments, eq(orderItems.shipmentId, shipments.id))
    .where(eq(orderItems.sellerId, sellerId))
    .orderBy(desc(orders.createdAt));

  return rows.map((r: any) => ({
    ...r,
    unitPrice: Number(r.unitPrice),
    subtotal: Number(r.subtotal),
    totalAmount: Number(r.totalAmount),
    sellerNetAmount: r.sellerNetAmount !== null && r.sellerNetAmount !== undefined ? Number(r.sellerNetAmount) : null,
    marketplaceCommission: r.marketplaceCommission !== null && r.marketplaceCommission !== undefined ? Number(r.marketplaceCommission) : null,
    commissionRateSnapshot: r.commissionRateSnapshot !== null && r.commissionRateSnapshot !== undefined ? Number(r.commissionRateSnapshot) : null,
    shippingCost: r.shippingCost !== null && r.shippingCost !== undefined ? Number(r.shippingCost) : null,
    shippingChargedToBuyer: r.shippingChargedToBuyer !== null && r.shippingChargedToBuyer !== undefined ? Number(r.shippingChargedToBuyer) : null,
    shippingSellerSubsidy: r.shippingSellerSubsidy !== null && r.shippingSellerSubsidy !== undefined ? Number(r.shippingSellerSubsidy) : null,
    shippingMarketplaceSubsidy: r.shippingMarketplaceSubsidy !== null && r.shippingMarketplaceSubsidy !== undefined ? Number(r.shippingMarketplaceSubsidy) : null,
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
  // Correção crítica (Fase 1 operacional — Desempenho de Vendas zerado):
  // unidades e ticket médio reais, derivados dos mesmos pedidos pagos.
  unitsSold: number;
  averageTicket: number;
}

export interface SellerSalesHistoryPoint { date: string; grossRevenue: number; orders: number }
export interface SellerCountrySales { country: string; grossRevenue: number; orders: number }
export interface SellerTopProduct { productId: string; productTitle: string; unitsSold: number; grossRevenue: number }

export interface SellerOverviewResult {
  currency: string;
  metrics: SellerOverviewMetrics;
  balances: { available: number; retained: number; future: number; currency: string };
  recentOrders: SellerOrderRow[];
  // Todos derivados dos MESMOS pedidos reais acima — nunca inventados,
  // nunca uma segunda fonte. Vazios quando não há pedido pago no período,
  // nunca preenchidos com dado fictício.
  salesHistory: SellerSalesHistoryPoint[];
  salesByCountry: SellerCountrySales[];
  topProducts: SellerTopProduct[];
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

  // A partir daqui, tudo é derivado dos MESMOS pedidos pagos já calculados
  // acima (paidOrders/curRows) — nunca uma segunda consulta/fonte.
  const paidOrderIds = new Set(paidOrders.map((o) => o.orderId));
  // curRows tem uma linha por order_item — necessário para unidades/produto
  // (distinctOrders perde granularidade de item quando um pedido tem mais
  // de um produto deste vendedor).
  const paidItemRows = curRows.filter((r) => paidOrderIds.has(r.orderId));

  const unitsSold = paidItemRows.reduce((sum, r) => sum + (r.quantity || 0), 0);
  const averageTicket = paidOrders.length > 0 ? Math.round((grossRevenue / paidOrders.length) * 100) / 100 : 0;

  const salesHistoryMap = new Map<string, { grossRevenue: number; orders: number }>();
  for (const o of paidOrders) {
    const day = o.createdAt.toISOString().slice(0, 10);
    const acc = salesHistoryMap.get(day) || { grossRevenue: 0, orders: 0 };
    acc.grossRevenue += o.totalAmount;
    acc.orders += 1;
    salesHistoryMap.set(day, acc);
  }
  const salesHistory: SellerSalesHistoryPoint[] = Array.from(salesHistoryMap.entries())
    .map(([date, v]) => ({ date, grossRevenue: v.grossRevenue, orders: v.orders }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const countryMap = new Map<string, { grossRevenue: number; orders: number }>();
  for (const o of paidOrders) {
    const addr = (o.shippingAddressJson as any) || {};
    const country = addr.countryCode || addr.country || 'Não informado';
    const acc = countryMap.get(country) || { grossRevenue: 0, orders: 0 };
    acc.grossRevenue += o.totalAmount;
    acc.orders += 1;
    countryMap.set(country, acc);
  }
  const salesByCountry: SellerCountrySales[] = Array.from(countryMap.entries())
    .map(([country, v]) => ({ country, grossRevenue: v.grossRevenue, orders: v.orders }))
    .sort((a, b) => b.grossRevenue - a.grossRevenue);

  const productMap = new Map<string, { productTitle: string; unitsSold: number; grossRevenue: number }>();
  for (const r of paidItemRows) {
    const acc = productMap.get(r.productId) || { productTitle: r.productTitle, unitsSold: 0, grossRevenue: 0 };
    acc.unitsSold += r.quantity || 0;
    acc.grossRevenue += r.subtotal;
    productMap.set(r.productId, acc);
  }
  const topProducts: SellerTopProduct[] = Array.from(productMap.entries())
    .map(([productId, v]) => ({ productId, ...v }))
    .sort((a, b) => b.unitsSold - a.unitsSold)
    .slice(0, 10);

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
      unitsSold,
      averageTicket,
    },
    balances: {
      available: wallet.available,
      retained: wallet.retained,
      future: wallet.pendingRelease,
      currency: cur,
    },
    recentOrders: distinctOrders.slice(0, 5),
    salesHistory,
    salesByCountry,
    topProducts,
  };
}

export interface SellerCustomer {
  buyerId: string;
  displayName: string;
  country: string;
  totalOrders: number;
  totalSpent: number;
  currency: string;
  lastPurchaseAt: string;
}

/**
 * Correção crítica (Fase 1 operacional — "Meus Clientes" vazio): GET
 * /seller/customers. Deriva clientes EXCLUSIVAMENTE de pedidos reais do
 * vendedor — nunca um cadastro de cliente separado, nunca dado fake.
 *
 * Regra documentada (mesma semântica de "venda paga" usada em todo o
 * resto do painel — nunca uma segunda regra divergente):
 *   - pending_payment NUNCA cria "cliente" — comprador que nunca pagou não
 *     é cliente da loja ainda.
 *   - cancelled/refunded (SOLD_ORDER_STATUSES_EXCLUDED) são EXCLUÍDOS de
 *     totalOrders/totalSpent, pela mesma razão que não contam como "vendido"
 *     no catálogo nem como receita no Overview — não é venda efetiva.
 *   - Múltiplas moedas: se o comprador já comprou em BRL e XOF do mesmo
 *     seller, isso gera DUAS linhas de cliente (uma por moeda) — nunca soma
 *     valores de moedas diferentes num único totalSpent.
 *
 * PRIVACIDADE: retorna só buyerId, nome (necessário operacionalmente — o
 * vendedor precisa saber quem comprou, como em qualquer painel de vendas),
 * país e agregados. NUNCA e-mail, telefone, CPF/documento ou endereço
 * completo — esses continuam restritos à tela de pedido específico
 * (GET /seller/orders já traz endereço de entrega só por pedido).
 */
export async function computeSellerCustomers(sellerId: string, executor?: any): Promise<SellerCustomer[]> {
  const db = executor ?? getDb();
  if (!db) return [];

  const allRows = await getSellerOrderRows(sellerId, executor);

  const byOrder = new Map<string, SellerOrderRow>();
  for (const r of allRows) {
    if (!byOrder.has(r.orderId)) byOrder.set(r.orderId, r);
  }
  const qualifyingOrders = Array.from(byOrder.values()).filter(
    (o) => o.paymentStatus === 'paid' && !SOLD_ORDER_STATUSES_EXCLUDED.includes(o.orderStatus)
  );

  if (qualifyingOrders.length === 0) return [];

  const buyerIds = Array.from(new Set(qualifyingOrders.map((o) => o.buyerId)));
  const buyerRows = await db.select({ id: users.id, fullName: users.fullName, countryCode: users.countryCode }).from(users).where(inArray(users.id, buyerIds));
  const buyerMap = new Map(buyerRows.map((b: any) => [b.id, b]));

  // Chave (buyerId + currency): nunca soma moedas diferentes no mesmo cliente.
  const grouped = new Map<string, { buyerId: string; currency: string; totalOrders: number; totalSpent: number; lastPurchaseAt: Date }>();
  for (const o of qualifyingOrders) {
    const key = `${o.buyerId}:${o.currency}`;
    const acc = grouped.get(key) || { buyerId: o.buyerId, currency: o.currency, totalOrders: 0, totalSpent: 0, lastPurchaseAt: o.createdAt };
    acc.totalOrders += 1;
    acc.totalSpent += o.totalAmount;
    if (o.createdAt > acc.lastPurchaseAt) acc.lastPurchaseAt = o.createdAt;
    grouped.set(key, acc);
  }

  return Array.from(grouped.values())
    .map((g) => {
      const buyer: any = buyerMap.get(g.buyerId);
      return {
        buyerId: g.buyerId,
        displayName: buyer?.fullName || 'Comprador',
        country: buyer?.countryCode || 'Não informado',
        totalOrders: g.totalOrders,
        totalSpent: g.totalSpent,
        currency: g.currency,
        lastPurchaseAt: g.lastPurchaseAt.toISOString(),
      };
    })
    .sort((a, b) => b.totalSpent - a.totalSpent);
}
