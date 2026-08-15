import { getDb } from '../../../db/index.js';
import { orders, orderItems, orderStatusHistory, products, escrowAccounts, escrowTransactions, notifications } from '../../../db/schema.js';
import { InventoryService } from '../inventory/inventoryService.js';
import { eq, desc } from 'drizzle-orm';
import { logger } from '../../infra/logger.js';
import { broadcastToUser, broadcastAdminEvent } from '../../infra/websocket.js';

export interface CreateOrderDTO {
  buyerId: string;
  items: Array<{
    productId: string;
    variantId?: string;
    quantity: number;
    unitPrice: number;
    title: string;
    image?: string;
    sellerId?: string;
  }>;
  subtotal: number;
  shippingFee: number;
  discountAmount?: number;
  totalAmount: number;
  currency: string;
  paymentMethod: string;
  shippingAddress: any;
  billingAddress?: any;
  countryCode: string;
  notes?: string;
  idempotencyKey?: string;
}

export class OrderService {
  static async createOrder(data: CreateOrderDTO) {
    const db = getDb();
    const orderId = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const orderNumber = `NSL-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

    if (db) {
      // 1. Reserve stock with concurrency check
      await InventoryService.reserveStock(
        orderId,
        data.items.map((i) => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity }))
      );

      // 2. Insert Order Header Snapshot
      await db.insert(orders).values({
        id: orderId,
        orderNumber,
        buyerId: data.buyerId,
        sellerId: data.items[0]?.sellerId || 'seller-01',
        subtotal: String(data.subtotal),
        shippingFee: String(data.shippingFee),
        discountAmount: String(data.discountAmount || 0),
        totalAmount: String(data.totalAmount),
        currency: data.currency || 'XOF',
        status: 'pending_payment',
        paymentMethod: data.paymentMethod,
        paymentStatus: 'pending',
        escrowStatus: 'held',
        shippingAddressJson: data.shippingAddress,
        billingAddressJson: data.billingAddress,
        countryCode: data.countryCode || 'GW',
        notes: data.notes,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 3. Insert Order Items Snapshots
      for (const item of data.items) {
        await db.insert(orderItems).values({
          id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          orderId,
          productId: item.productId,
          variantId: item.variantId,
          productTitle: item.title,
          quantity: item.quantity,
          unitPrice: String(item.unitPrice),
          subtotal: String(item.unitPrice * item.quantity),
          sellerId: item.sellerId,
          productImage: item.image,
          createdAt: new Date(),
        });
      }

      // 4. Create Initial Order History Entry
      await db.insert(orderStatusHistory).values({
        id: `osh_${Date.now()}`,
        orderId,
        newStatus: 'pending_payment',
        reason: 'Pedido gerado pelo comprador aguardando liquidação de pagamento.',
        changedBy: data.buyerId,
        createdAt: new Date(),
      });

      // 5. Initialize Escrow Ledger Account for Order
      await db.insert(escrowAccounts).values({
        id: `esc_${orderId}`,
        orderId,
        buyerId: data.buyerId,
        sellerId: data.items[0]?.sellerId || 'seller-01',
        amount: String(data.totalAmount),
        currency: data.currency,
        status: 'held',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 6. Create Notification
      await db.insert(notifications).values({
        id: `notif_${Date.now()}`,
        userId: data.buyerId,
        title: 'Pedido Recebido com Sucesso!',
        message: `Seu pedido #${orderNumber} foi criado. Proceda com o pagamento para envio imediato.`,
        type: 'order',
        link: `/buyer/orders`,
        isRead: false,
        createdAt: new Date(),
      });
    }

    broadcastToUser(data.buyerId, {
      type: 'ORDER_CREATED',
      orderId,
      orderNumber,
      totalAmount: data.totalAmount,
    });

    broadcastAdminEvent({
      type: 'NEW_ORDER',
      orderId,
      orderNumber,
      totalAmount: data.totalAmount,
      country: data.countryCode,
    });

    logger.info({ orderId, orderNumber, total: data.totalAmount }, 'Order created successfully');

    return {
      id: orderId,
      orderNumber,
      status: 'pending_payment',
      totalAmount: data.totalAmount,
      currency: data.currency,
      paymentMethod: data.paymentMethod,
    };
  }

  static async getOrdersByBuyer(buyerId: string) {
    const db = getDb();
    if (!db) return [];

    const orderList = await db.select().from(orders).where(eq(orders.buyerId, buyerId)).orderBy(desc(orders.createdAt));

    const ordersWithItems = await Promise.all(
      orderList.map(async (ord) => {
        const items = await db.select().from(orderItems).where(eq(orderItems.orderId, ord.id));
        return {
          ...ord,
          totalAmount: Number(ord.totalAmount),
          subtotal: Number(ord.subtotal),
          shippingFee: Number(ord.shippingFee),
          items: items.map((i) => ({
            ...i,
            unitPrice: Number(i.unitPrice),
            subtotal: Number(i.subtotal),
          })),
        };
      })
    );

    return ordersWithItems;
  }

  static async getOrderById(orderId: string) {
    const db = getDb();
    if (!db) return null;

    const ordRes = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (ordRes.length === 0) return null;

    const ord = ordRes[0];
    const [items, history] = await Promise.all([
      db.select().from(orderItems).where(eq(orderItems.orderId, orderId)),
      db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, orderId)).orderBy(desc(orderStatusHistory.createdAt)),
    ]);

    return {
      ...ord,
      totalAmount: Number(ord.totalAmount),
      subtotal: Number(ord.subtotal),
      shippingFee: Number(ord.shippingFee),
      items: items.map((i) => ({
        ...i,
        unitPrice: Number(i.unitPrice),
        subtotal: Number(i.subtotal),
      })),
      history,
    };
  }

  static async updateOrderStatus(orderId: string, newStatus: string, reason?: string, changedBy?: string) {
    const db = getDb();
    if (!db) return;

    const existing = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (existing.length === 0) throw new Error('Pedido não encontrado.');

    const previousStatus = existing[0].status;

    await db
      .update(orders)
      .set({
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));

    await db.insert(orderStatusHistory).values({
      id: `osh_${Date.now()}`,
      orderId,
      previousStatus,
      newStatus,
      reason: reason || `Status atualizado para ${newStatus}`,
      changedBy: changedBy || 'system',
      createdAt: new Date(),
    });

    broadcastToUser(existing[0].buyerId, {
      type: 'ORDER_STATUS_CHANGED',
      orderId,
      orderNumber: existing[0].orderNumber,
      status: newStatus,
    });
  }
}
