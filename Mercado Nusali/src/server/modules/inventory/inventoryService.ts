import { getDb } from '../../../db/index.js';
import { inventory, inventoryMovements, stockReservations, products, warehouses, inventoryTransfers, sellers } from '../../../db/schema.js';
import { eq, and, sql, desc, or } from 'drizzle-orm';
import { logger } from '../../infra/logger.js';

export class InventoryService {
  /**
   * Recalculates and updates products.stock summary column based on the sum of quantityOnHand from all location inventories.
   */
  static async syncProductStockSummary(productId: string, executor?: any) {
    const db = executor || getDb();
    if (!db || !productId) return 0;

    const rows = await db
      .select({ qty: inventory.quantityOnHand })
      .from(inventory)
      .where(eq(inventory.productId, productId));

    const totalStock = rows.reduce((acc: number, r: any) => acc + (r.qty || 0), 0);

    await db
      .update(products)
      .set({
        stock: totalStock,
        updatedAt: new Date(),
      })
      .where(eq(products.id, productId));

    return totalStock;
  }

  /**
   * Updates a seller's physical stock at their SELLER_LOCATION.
   * @param sellerId Primary Key of sellers table (sellers.id).
   * @param actingUserId Optional Primary Key of users table (users.id) for audit performedBy.
   */
  static async updateSellerStock(
    productId: string,
    newStock: number,
    sellerId?: string | null,
    variantId?: string | null,
    actingUserId?: string | null,
    executor?: any
  ) {
    const db = executor || getDb();
    if (!db) throw new Error('Banco de dados indisponível.');

    const cleanStock = Math.max(0, Math.floor(Number(newStock) || 0));

    // Resolve product
    const [prod] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!prod) throw new Error(`Produto ${productId} não encontrado.`);

    // sellerId MUST be sellers.id (aligned with products.sellerId and inventory.sellerId)
    const targetSellerId = sellerId || prod.sellerId || null;

    // Query SELLER_LOCATION inventory row specifically for this product and seller
    const conditions = [
      eq(inventory.productId, productId),
      eq(inventory.locationType, 'SELLER_LOCATION'),
    ];
    if (targetSellerId) {
      conditions.push(eq(inventory.sellerId, targetSellerId));
    }
    if (variantId) {
      conditions.push(eq(inventory.variantId, variantId));
    }

    let [sellerInv] = await db
      .select()
      .from(inventory)
      .where(and(...conditions))
      .limit(1);

    if (!sellerInv) {
      // Create SELLER_LOCATION inventory row (sellerId = sellers.id)
      const newInvId = `inv_seller_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await db.insert(inventory).values({
        id: newInvId,
        locationType: 'SELLER_LOCATION',
        sellerId: targetSellerId,
        warehouseId: null,
        productId,
        variantId: variantId || null,
        quantityOnHand: cleanStock,
        quantityReserved: 0,
        minimumStockLevel: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Record movement (performedBy = users.id)
      await db.insert(inventoryMovements).values({
        id: `mov_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        inventoryId: newInvId,
        warehouseId: null,
        productId,
        variantId: variantId || null,
        type: 'ADJUSTMENT',
        quantity: cleanStock,
        reason: 'Ajuste de estoque inicial pelo vendedor',
        performedBy: actingUserId || null,
        createdAt: new Date(),
      });
    } else {
      // Validate that new stock is not less than already reserved quantity
      if (cleanStock < sellerInv.quantityReserved) {
        throw new Error(
          `Quantidade em estoque (${cleanStock}) não pode ser menor que o estoque já reservado (${sellerInv.quantityReserved}) para pedidos em andamento.`
        );
      }

      const delta = cleanStock - sellerInv.quantityOnHand;

      await db
        .update(inventory)
        .set({
          quantityOnHand: cleanStock,
          updatedAt: new Date(),
        })
        .where(eq(inventory.id, sellerInv.id));

      if (delta !== 0) {
        await db.insert(inventoryMovements).values({
          id: `mov_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          inventoryId: sellerInv.id,
          warehouseId: sellerInv.warehouseId || null,
          productId,
          variantId: variantId || null,
          type: 'ADJUSTMENT',
          quantity: delta,
          reason: `Ajuste de estoque pelo vendedor (novo: ${cleanStock})`,
          performedBy: actingUserId || null,
          createdAt: new Date(),
        });
      }
    }

    // Sync products.stock summary
    await InventoryService.syncProductStockSummary(productId, db);
    return true;
  }

  /**
   * Calculates total available stock for a product (or specific variant) across all locations (SELLER_LOCATION + NUSALI_HUB).
   */
  static async getAvailableStock(productId: string, variantId?: string | null, executor?: any) {
    const db = executor || getDb();
    if (!db) return 0;

    const conditions = [eq(inventory.productId, productId)];
    if (variantId) {
      conditions.push(eq(inventory.variantId, variantId));
    }

    const rows = await db.select().from(inventory).where(and(...conditions));
    const totalAvailable = rows.reduce(
      (acc: number, inv: any) => acc + Math.max(0, (inv.quantityOnHand || 0) - (inv.quantityReserved || 0)),
      0
    );

    return totalAvailable;
  }

  /**
   * Creates a stock transfer request from a seller location to a Nusali HUB.
   * Expects sellerId (sellers.id). Does NOT deduct stock immediately; stock is transferred only on confirm.
   */
  static async requestTransferToHub(
    sellerId: string,
    productId: string,
    toWarehouseId: string,
    quantity: number,
    variantId?: string | null,
    deliveryMode?: string,
    pickupSnapshotJson?: any
  ) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível.');

    const qtyToTransfer = Math.floor(Number(quantity));
    if (isNaN(qtyToTransfer) || qtyToTransfer <= 0) {
      throw new Error('Quantidade de transferência inválida.');
    }

    if (!deliveryMode || (deliveryMode !== 'NUSALI_PICKUP' && deliveryMode !== 'SELLER_DROPOFF')) {
      throw new Error('INVALID_DELIVERY_MODE: Selecione uma modalidade de entrega válida (NUSALI_PICKUP ou SELLER_DROPOFF).');
    }
    const mode = deliveryMode;

    if (mode === 'NUSALI_PICKUP') {
      const snapAddr = pickupSnapshotJson?.address;
      const snapCity = pickupSnapshotJson?.city;
      const snapCountry = pickupSnapshotJson?.countryCode;
      const snapPhone = pickupSnapshotJson?.phone;

      if (
        !snapAddr || !String(snapAddr).trim() ||
        !snapCity || !String(snapCity).trim() ||
        !snapCountry || !String(snapCountry).trim() ||
        !snapPhone || !String(snapPhone).trim()
      ) {
        throw new Error('PICKUP_LOCATION_INCOMPLETE: Por favor, cadastre o endereço completo (rua, cidade, país) e o telefone de contato da sua loja antes de solicitar a coleta pela Nusali.');
      }
    }

    // Verify product ownership
    const [prod] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!prod) throw new Error('Produto não encontrado.');
    if (prod.sellerId !== sellerId) {
      throw new Error('PRODUCT_NOT_OWNED: Você não é o proprietário deste produto.');
    }

    // Check seller inventory and calculate pending transfers (to avoid overcommit)
    const conditions = [
      eq(inventory.productId, productId),
      eq(inventory.locationType, 'SELLER_LOCATION'),
      eq(inventory.sellerId, sellerId),
    ];
    if (variantId) {
      conditions.push(eq(inventory.variantId, variantId));
    }

    const [sellerInv] = await db
      .select()
      .from(inventory)
      .where(and(...conditions))
      .limit(1);

    if (!sellerInv) {
      throw new Error(`Estoque no seu estabelecimento não encontrado para este produto.`);
    }

    // Query active pending/in-transit transfers from this seller inventory
    const activePendingTransfers = await db
      .select({ qty: inventoryTransfers.quantity })
      .from(inventoryTransfers)
      .where(
        and(
          eq(inventoryTransfers.fromInventoryId, sellerInv.id),
          or(eq(inventoryTransfers.status, 'PENDING'), eq(inventoryTransfers.status, 'IN_TRANSIT'))
        )
      );

    const pendingTransferQuantity = activePendingTransfers.reduce(
      (sum: number, t: any) => sum + (Number(t.qty) || 0),
      0
    );

    const availableForTransfer = Math.max(
      0,
      sellerInv.quantityOnHand - sellerInv.quantityReserved - pendingTransferQuantity
    );

    if (availableForTransfer < qtyToTransfer) {
      throw new Error(
        `Estoque disponível para transferência insuficiente (Em estoque: ${sellerInv.quantityOnHand}, Reservado pedidos: ${sellerInv.quantityReserved}, Transferências pendentes: ${pendingTransferQuantity}, Livre: ${availableForTransfer}, Solicitado: ${qtyToTransfer}).`
      );
    }

    // Verify destination warehouse
    const [wh] = await db.select().from(warehouses).where(eq(warehouses.id, toWarehouseId)).limit(1);
    if (!wh) throw new Error(`Armazém/HUB target "${toWarehouseId}" não encontrado.`);

    const transferId = `trf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const trackingCode = `NUS-TRF-${Date.now().toString().slice(-6)}`;

    await db.insert(inventoryTransfers).values({
      id: transferId,
      sellerId,
      productId,
      variantId: variantId || null,
      fromLocationType: 'SELLER_LOCATION',
      fromInventoryId: sellerInv.id,
      toWarehouseId: wh.id,
      quantity: qtyToTransfer,
      status: 'PENDING',
      deliveryMode: mode,
      pickupSnapshotJson: pickupSnapshotJson || null,
      trackingCode,
      createdAt: new Date(),
    });

    return {
      transferId,
      trackingCode,
      quantity: qtyToTransfer,
      toWarehouseName: wh.name,
      status: 'PENDING',
    };
  }

  /**
   * Cancels a PENDING or IN_TRANSIT transfer request.
   * Immediately releases committed pending transfer stock.
   */
  static async cancelTransferToHub(transferId: string, actingId: string, isSeller: boolean = false) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível.');

    const [trf] = await db.select().from(inventoryTransfers).where(eq(inventoryTransfers.id, transferId)).limit(1);
    if (!trf) throw new Error(`Transferência ${transferId} não encontrada.`);

    if (trf.status === 'RECEIVED') {
      throw new Error('Transferências já recebidas no HUB não podem ser canceladas.');
    }
    if (trf.status === 'CANCELLED') {
      return { success: true, message: 'Transferência já estava cancelada.' };
    }

    if (isSeller && trf.sellerId !== actingId) {
      throw new Error('FORBIDDEN: Você não tem permissão para cancelar esta transferência.');
    }

    await db
      .update(inventoryTransfers)
      .set({
        status: 'CANCELLED',
      })
      .where(eq(inventoryTransfers.id, trf.id));

    return {
      success: true,
      message: `Transferência ${trf.trackingCode || trf.id} cancelada com sucesso.`,
    };
  }

  /**
   * Marks a transfer as IN_TRANSIT. Only allowed from PENDING status.
   * Does NOT move physical stock.
   */
  static async markTransferInTransit(transferId: string, adminUserId: string) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível.');

    const [trf] = await db.select().from(inventoryTransfers).where(eq(inventoryTransfers.id, transferId)).limit(1);
    if (!trf) throw new Error(`Transferência ${transferId} não encontrada.`);

    if (trf.status !== 'PENDING') {
      throw new Error(`Apenas transferências com status "PENDING" podem ser marcadas como em trânsito (Status atual: ${trf.status}).`);
    }

    await db
      .update(inventoryTransfers)
      .set({
        status: 'IN_TRANSIT',
      })
      .where(eq(inventoryTransfers.id, trf.id));

    return {
      success: true,
      message: `Transferência ${trf.trackingCode || trf.id} marcada como em trânsito com sucesso.`,
    };
  }

  /**
   * Confirms receipt of a stock transfer by Admin/Hub staff, moving stock from seller location to Nusali HUB location.
   */
  static async confirmHubTransfer(transferId: string, adminUserId: string) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível.');

    return await db.transaction(async (tx: any) => {
      const [trf] = await tx.select().from(inventoryTransfers).where(eq(inventoryTransfers.id, transferId)).limit(1);
      if (!trf) throw new Error(`Transferência ${transferId} não encontrada.`);

      if (trf.status === 'RECEIVED') {
        throw new Error('Esta transferência já foi recebida e processada anteriormente.');
      }
      if (trf.status === 'CANCELLED') {
        throw new Error('Esta transferência foi cancelada e não pode ser recebida.');
      }

      // Find seller inventory
      const [sellerInv] = await tx
        .select()
        .from(inventory)
        .where(eq(inventory.id, trf.fromInventoryId))
        .limit(1);

      if (!sellerInv || (sellerInv.quantityOnHand - sellerInv.quantityReserved) < trf.quantity) {
        throw new Error('Estoque no estabelecimento de origem insuficiente para registrar o recebimento.');
      }

      // 1. Deduct quantity from seller location
      const newSellerOnHand = sellerInv.quantityOnHand - trf.quantity;
      await tx
        .update(inventory)
        .set({
          quantityOnHand: newSellerOnHand,
          updatedAt: new Date(),
        })
        .where(eq(inventory.id, sellerInv.id));

      // Record TRANSFER_OUT movement for seller
      await tx.insert(inventoryMovements).values({
        id: `mov_${Date.now()}_out_${Math.random().toString(36).substring(2, 5)}`,
        inventoryId: sellerInv.id,
        warehouseId: null,
        productId: trf.productId,
        variantId: trf.variantId,
        type: 'TRANSFER_OUT',
        quantity: -trf.quantity,
        reason: `Envio para HUB ${trf.toWarehouseId} (Transferência ${trf.trackingCode || trf.id})`,
        performedBy: adminUserId,
        createdAt: new Date(),
      });

      // 2. Find or create HUB inventory
      const hubConditions = [
        eq(inventory.productId, trf.productId),
        eq(inventory.locationType, 'NUSALI_HUB'),
        eq(inventory.warehouseId, trf.toWarehouseId),
      ];
      if (trf.variantId) {
        hubConditions.push(eq(inventory.variantId, trf.variantId));
      }

      let [hubInv] = await tx.select().from(inventory).where(and(...hubConditions)).limit(1);

      let targetHubInvId = hubInv?.id;
      if (!hubInv) {
        targetHubInvId = `inv_hub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        await tx.insert(inventory).values({
          id: targetHubInvId,
          locationType: 'NUSALI_HUB',
          sellerId: trf.sellerId,
          warehouseId: trf.toWarehouseId,
          productId: trf.productId,
          variantId: trf.variantId || null,
          quantityOnHand: trf.quantity,
          quantityReserved: 0,
          minimumStockLevel: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } else {
        await tx
          .update(inventory)
          .set({
            quantityOnHand: hubInv.quantityOnHand + trf.quantity,
            updatedAt: new Date(),
          })
          .where(eq(inventory.id, hubInv.id));
      }

      // Record TRANSFER_IN movement for HUB
      await tx.insert(inventoryMovements).values({
        id: `mov_${Date.now()}_in_${Math.random().toString(36).substring(2, 5)}`,
        inventoryId: targetHubInvId,
        warehouseId: trf.toWarehouseId,
        productId: trf.productId,
        variantId: trf.variantId,
        type: 'TRANSFER_IN',
        quantity: trf.quantity,
        reason: `Recebimento no HUB ${trf.toWarehouseId} (Transferência ${trf.trackingCode || trf.id})`,
        performedBy: adminUserId,
        createdAt: new Date(),
      });

      // 3. Mark transfer RECEIVED
      await tx
        .update(inventoryTransfers)
        .set({
          status: 'RECEIVED',
          receivedAt: new Date(),
        })
        .where(eq(inventoryTransfers.id, trf.id));

      // 4. Sync product stock summary
      await InventoryService.syncProductStockSummary(trf.productId, tx);

      logger.info({ transferId: trf.id, productId: trf.productId, quantity: trf.quantity }, 'Hub stock transfer confirmed');
      return true;
    });
  }

  /**
   * Releases active stock reservations for an order.
   */
  static async releaseStock(orderId: string, executor?: any) {
    const db = executor || getDb();
    if (!db) return;

    const reservations = await db
      .select()
      .from(stockReservations)
      .where(and(eq(stockReservations.orderId, orderId), eq(stockReservations.status, 'active')));

    for (const res of reservations) {
      if (res.inventoryId) {
        await db
          .update(inventory)
          .set({
            quantityReserved: sql`GREATEST(0, ${inventory.quantityReserved} - ${res.quantity})`,
            updatedAt: new Date(),
          })
          .where(eq(inventory.id, res.inventoryId));
      }

      await db.update(stockReservations).set({ status: 'released' }).where(eq(stockReservations.id, res.id));

      await db.insert(inventoryMovements).values({
        id: `mov_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        inventoryId: res.inventoryId || null,
        warehouseId: res.warehouseId || null,
        productId: res.productId,
        variantId: res.variantId || null,
        type: 'RELEASE',
        quantity: res.quantity,
        reason: `Cancelamento/Estorno do pedido ${orderId}`,
        createdAt: new Date(),
      });

      await InventoryService.syncProductStockSummary(res.productId, db);
    }
  }
}
