import { getDb } from '../../../db/index.js';
import { inventory, inventoryMovements, stockReservations, products } from '../../../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { logger } from '../../infra/logger.js';

export class InventoryService {
  /**
   * Reserves stock for an order inside a safe transactional boundary.
   */
  static async reserveStock(orderId: string, items: Array<{ productId: string; variantId?: string; quantity: number }>) {
    const db = getDb();
    if (!db) return true;

    for (const item of items) {
      // Check current product stock
      const prodRes = await db.select().from(products).where(eq(products.id, item.productId)).limit(1);
      if (prodRes.length === 0) {
        throw new Error(`Produto não encontrado: ${item.productId}`);
      }

      const prod = prodRes[0];
      if (prod.stock < item.quantity) {
        throw new Error(`Estoque insuficiente para o produto "${prod.title}". Disponível: ${prod.stock}, Solicitado: ${item.quantity}`);
      }

      // Decrement stock and create reservation
      await db
        .update(products)
        .set({
          stock: sql`${products.stock} - ${item.quantity}`,
          updatedAt: new Date(),
        })
        .where(eq(products.id, item.productId));

      // Save reservation
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 30); // 30 minutes reservation window

      await db.insert(stockReservations).values({
        id: `res_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        orderId,
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        expiresAt,
        status: 'active',
        createdAt: new Date(),
      });

      // Record movement
      await db.insert(inventoryMovements).values({
        id: `mov_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        warehouseId: 'wh-01',
        productId: item.productId,
        variantId: item.variantId,
        type: 'RESERVATION',
        quantity: -item.quantity,
        reason: `Reserva para pedido ${orderId}`,
        referenceId: orderId,
        createdAt: new Date(),
      });
    }

    logger.info({ orderId, itemsCount: items.length }, 'Stock reserved successfully');
    return true;
  }

  /**
   * Releases stock reservations if order is cancelled or expires
   */
  static async releaseStock(orderId: string) {
    const db = getDb();
    if (!db) return;

    const reservations = await db
      .select()
      .from(stockReservations)
      .where(and(eq(stockReservations.orderId, orderId), eq(stockReservations.status, 'active')));

    for (const res of reservations) {
      await db
        .update(products)
        .set({
          stock: sql`${products.stock} + ${res.quantity}`,
          updatedAt: new Date(),
        })
        .where(eq(products.id, res.productId));

      await db.update(stockReservations).set({ status: 'released' }).where(eq(stockReservations.id, res.id));

      await db.insert(inventoryMovements).values({
        id: `mov_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        warehouseId: 'wh-01',
        productId: res.productId,
        type: 'RELEASE',
        quantity: res.quantity,
        reason: `Cancelamento/Estorno do pedido ${orderId}`,
        referenceId: orderId,
        createdAt: new Date(),
      });
    }
  }
}
