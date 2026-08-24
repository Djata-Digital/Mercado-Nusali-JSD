import { getDb } from '../../../db/index.js';
import {
  orders,
  orderItems,
  orderStatusHistory,
  products,
  productVariants,
  inventory,
  stockReservations,
  inventoryMovements,
  warehouses,
  shipments,
  trackingEvents,
  carts,
  cartItems,
  addresses,
  sellers,
  stores,
} from '../../../db/schema.js';
import { eq, and, desc, asc, sql, inArray } from 'drizzle-orm';
import { logger } from '../../infra/logger.js';
import { broadcastToUser } from '../../infra/websocket.js';
import { ShipmentService } from '../logistics/shipmentService.js';
import { ShippingCalculatorService } from '../shipping/shippingCalculatorService.js';

export interface CreateOrderRequestDTO {
  userId: string;
  shippingAddress?: any;
  addressId?: string;
  paymentMethod: string;
  notes?: string;
  currency?: string;
  countryCode?: string;
}

export class OrderService {
  // `executor` opcional: permite testar esta função contra um Postgres
  // Docker isolado (mesmo padrão já usado em payoutService/refundService),
  // sem depender do pool singleton getDb() (SSL fixo, incompatível com
  // Docker). Em produção, executor é sempre undefined e o comportamento é
  // idêntico ao anterior.
  static async createOrderFromCart(data: CreateOrderRequestDTO, executor?: any) {
    const db = executor ?? getDb();
    if (!db) {
      throw new Error('Banco de dados indisponível.');
    }

    const { userId, paymentMethod, notes } = data;

    // 1. Resolve Shipping Address
    let targetAddress = data.shippingAddress;
    if ((!targetAddress || !targetAddress.street) && data.addressId) {
      const addrRows = await db
        .select()
        .from(addresses)
        .where(and(eq(addresses.id, data.addressId), eq(addresses.userId, userId)))
        .limit(1);
      if (addrRows.length > 0) {
        const a = addrRows[0];
        targetAddress = {
          recipientName: a.recipientName,
          street: a.street,
          number: a.number,
          complement: a.complement || '',
          neighborhood: a.neighborhood || '',
          city: a.city,
          state: a.state,
          countryCode: a.countryCode,
          country: a.countryCode,
          zipCode: a.zipCode || '',
          phone: a.phone,
        };
      }
    }

    if (!targetAddress || !targetAddress.street) {
      const defaultAddrs = await db
        .select()
        .from(addresses)
        .where(and(eq(addresses.userId, userId), eq(addresses.isDefault, true)))
        .limit(1);
      if (defaultAddrs.length > 0) {
        const a = defaultAddrs[0];
        targetAddress = {
          recipientName: a.recipientName,
          street: a.street,
          number: a.number,
          complement: a.complement || '',
          neighborhood: a.neighborhood || '',
          city: a.city,
          state: a.state,
          countryCode: a.countryCode,
          country: a.countryCode,
          zipCode: a.zipCode || '',
          phone: a.phone,
        };
      }
    }

    if (!targetAddress || !targetAddress.street || !targetAddress.recipientName) {
      throw new Error('Endereço de entrega completo é obrigatório para finalizar a compra.');
    }

    // 2. Execute Atomic Transaction
    return await db.transaction(async (tx: any) => {
      // Fetch active user cart
      const userCarts = await tx.select().from(carts).where(eq(carts.userId, userId)).limit(1);
      if (userCarts.length === 0) {
        throw new Error('Carrinho de compras não encontrado.');
      }
      const userCart = userCarts[0];

      // Fetch cart items
      const itemsInCart = await tx.select().from(cartItems).where(eq(cartItems.cartId, userCart.id));
      if (itemsInCart.length === 0) {
        throw new Error('Seu carrinho está vazio. Adicione produtos antes de finalizar o pedido.');
      }

      let realSubtotal = 0;
      const verifiedItems: Array<{
        productId: string;
        variantId: string | null;
        productTitle: string;
        productSku: string | null;
        variantTitle: string | null;
        quantity: number;
        unitPrice: number;
        subtotal: number;
        sellerId: string | null;
        storeId: string | null;
        productImage: string | null;
        attributesJson: any;
        inventoryId: string;
        warehouseId: string | null;
        fulfillmentMode: string;
        weightKg: number;
        originCountry?: string;
      }> = [];

      let primarySellerId: string | null = null;
      let primaryStoreId: string | null = null;

      const whRows: any[] = await tx.select().from(warehouses);
      const whMap = new Map<string, any>(whRows.map((w) => [w.id, w]));

      // Validate products, DB unit prices, and INVENTORY table stock
      for (const ci of itemsInCart) {
        const prodRows = await tx.select().from(products).where(eq(products.id, ci.productId)).limit(1);
        if (prodRows.length === 0) {
          throw new Error(`Produto com ID "${ci.productId}" não foi encontrado no catálogo.`);
        }
        const prod = prodRows[0];

        let unitPrice = Number(prod.price);
        let variantTitle: string | null = null;
        let variantSku: string | null = null;
        let itemWeightKg = 0;

        if ((prod as any).weight) {
          itemWeightKg = Number((prod as any).weight);
        } else if (prod.shippingJson && typeof prod.shippingJson === 'object' && (prod.shippingJson as any).weightKg) {
          itemWeightKg = Number((prod.shippingJson as any).weightKg);
        }

        if (ci.variantId) {
          const varRows = await tx.select().from(productVariants).where(eq(productVariants.id, ci.variantId)).limit(1);
          if (varRows.length > 0) {
            const v = varRows[0];
            if (v.price) unitPrice = Number(v.price);
            if (v.weight) itemWeightKg = Number(v.weight);
            variantTitle = v.title || null;
            variantSku = v.sku || null;
          }
        }

        // Requirement 1: Mandatory product weight check (NO 0.5kg fallback)
        if (!itemWeightKg || itemWeightKg <= 0) {
          throw new Error(`PRODUCT_WEIGHT_REQUIRED: O peso do produto "${prod.title}" não foi cadastrado e é obrigatório para cálculo de frete.`);
        }

        const reqQty = Number(ci.quantity) || 1;

        // Query real inventory table for this productId + strict variantId (No cross-variant fallback)
        let inventoryRows: any[];
        if (ci.variantId) {
          inventoryRows = await tx
            .select()
            .from(inventory)
            .where(and(eq(inventory.productId, ci.productId), eq(inventory.variantId, ci.variantId)));
        } else {
          inventoryRows = await tx
            .select()
            .from(inventory)
            .where(eq(inventory.productId, ci.productId));
        }

        // If no inventory record exists in PostgreSQL for this product/variant, throw explicit error
        if (inventoryRows.length === 0) {
          if (ci.variantId) {
            throw new Error(
              `INSUFFICIENT_STOCK: Estoque indisponível para a variante selecionada do produto "${prod.title}".`
            );
          }
          throw new Error(
            `INVENTORY_NOT_INITIALIZED: Estoque não inicializado no controle do armazém para o produto "${prod.title}".`
          );
        }

        // Filter candidate rows that have available stock > 0
        const candidateRows = inventoryRows.filter((inv) => inv.quantityOnHand - inv.quantityReserved > 0);

        // Sort candidates: NUSALI_HUB first (same country preference), then SELLER_LOCATION
        candidateRows.sort((a, b) => {
          if (a.locationType === 'NUSALI_HUB' && b.locationType !== 'NUSALI_HUB') return -1;
          if (a.locationType !== 'NUSALI_HUB' && b.locationType === 'NUSALI_HUB') return 1;

          if (a.locationType === 'NUSALI_HUB' && b.locationType === 'NUSALI_HUB') {
            const whA = a.warehouseId ? whMap.get(a.warehouseId) : null;
            const whB = b.warehouseId ? whMap.get(b.warehouseId) : null;
            const destCountry = targetAddress?.countryCode || targetAddress?.country || 'GW';
            const matchA = whA?.countryCode === destCountry ? 1 : 0;
            const matchB = whB?.countryCode === destCountry ? 1 : 0;
            if (matchA !== matchB) return matchB - matchA;
          }
          return 0;
        });

        // Calculate total available across candidates
        const totalAvail = candidateRows.reduce(
          (acc, inv) => acc + Math.max(0, inv.quantityOnHand - inv.quantityReserved),
          0
        );

        if (totalAvail < reqQty) {
          throw new Error(
            `INSUFFICIENT_STOCK: Estoque insuficiente no armazém para o produto "${prod.title}". Disponível: ${totalAvail}, Solicitado: ${reqQty}`
          );
        }

        // Multi-location allocation: consume NUSALI_HUB first, then SELLER_LOCATION across multiple rows if needed
        let remQty = reqQty;
        for (const inv of candidateRows) {
          const avail = Math.max(0, inv.quantityOnHand - inv.quantityReserved);
          if (avail <= 0) continue;

          const taken = Math.min(remQty, avail);
          const fulfillmentMode = inv.locationType === 'NUSALI_HUB' ? 'NUSALI_FULFILLMENT' : 'SELLER_FULFILLMENT';
          const itemSubtotal = unitPrice * taken;
          realSubtotal += itemSubtotal;

          if (!primarySellerId && prod.sellerId) primarySellerId = prod.sellerId;
          if (!primaryStoreId && prod.storeId) primaryStoreId = prod.storeId;

          verifiedItems.push({
            productId: prod.id,
            variantId: ci.variantId || null,
            productTitle: prod.title,
            productSku: variantSku || prod.id || null,
            variantTitle,
            quantity: taken,
            unitPrice,
            subtotal: itemSubtotal,
            sellerId: prod.sellerId || null,
            storeId: prod.storeId || null,
            productImage: prod.image || null,
            attributesJson: ci.selectedAttributesJson || null,
            inventoryId: inv.id,
            warehouseId: inv.warehouseId || null,
            fulfillmentMode,
            weightKg: itemWeightKg,
          });

          remQty -= taken;
          if (remQty === 0) break;
        }
      }

      let sellerCommissionRate = 10.0;
      if (primarySellerId) {
        const sellerRows = await tx.select().from(sellers).where(eq(sellers.id, primarySellerId)).limit(1);
        if (sellerRows.length > 0 && sellerRows[0].commissionRate) {
          sellerCommissionRate = Number(sellerRows[0].commissionRate);
        }
      }

      // Requirement 4: Currency is strictly required
      const currency = userCart.currency || data.currency;
      if (!currency || !currency.trim()) {
        throw new Error('SHIPPING_CURRENCY_REQUIRED: A moeda do pedido é obrigatória para o cálculo de frete.');
      }

      // Requirement 2: Determine origin from actual inventory allocation (Warehouse/Store) and detect multi-origin
      const itemOrigins = new Set<string>();
      for (const item of verifiedItems) {
        let itemOrigin: string | null = null;
        if (item.warehouseId) {
          const wh = whMap.get(item.warehouseId);
          if (wh?.countryCode) itemOrigin = wh.countryCode.toUpperCase();
        }
        if (!itemOrigin && item.storeId) {
          const stRows = await tx.select().from(stores).where(eq(stores.id, item.storeId)).limit(1);
          if (stRows.length > 0 && stRows[0].countryCode) {
            itemOrigin = stRows[0].countryCode.toUpperCase();
          }
        }
        if (!itemOrigin && item.sellerId) {
          const selRows = await tx.select().from(sellers).where(eq(sellers.id, item.sellerId)).limit(1);
          if (selRows.length > 0 && selRows[0].countryCode) {
            itemOrigin = selRows[0].countryCode.toUpperCase();
          }
        }

        if (!itemOrigin) {
          throw new Error('SHIPPING_ORIGIN_REQUIRED: Não foi possível determinar o país de origem real da mercadoria.');
        }

        item.originCountry = itemOrigin;
        itemOrigins.add(itemOrigin);
      }

      if (itemOrigins.size > 1) {
        throw new Error(
          'MULTI_ORIGIN_SHIPPING_NOT_SUPPORTED: O pedido contém produtos com expedição de múltiplos locais/países de origem diferentes.'
        );
      }

      const originCountry = Array.from(itemOrigins)[0];

      // Requirement 3: Destination Country is strictly required
      const destinationCountry = (targetAddress?.countryCode || targetAddress?.country || data.countryCode || '').trim().toUpperCase();
      if (!destinationCountry) {
        throw new Error('SHIPPING_DESTINATION_REQUIRED: O endereço de entrega não possui país de destino.');
      }

      // Requirement 6: Calculate real total weight from product/variant weight (NO 0.5kg fallback)
      const totalWeightKg = verifiedItems.reduce((acc, i) => acc + (i.weightKg * i.quantity), 0);

      // Requirement 2 & 3: Calculate freight via service & BLOCK order if freight rate unavailable
      const freightRes = await ShippingCalculatorService.calculateFreight({
        storeId: primaryStoreId || undefined,
        sellerId: primarySellerId || undefined,
        originCountry,
        destinationCountry,
        weightKg: totalWeightKg,
        currency,
        productSubtotal: realSubtotal,
      }, tx);

      if (!freightRes.available) {
        throw new Error(
          `SHIPPING_RATE_NOT_AVAILABLE: ${freightRes.errorMessage || 'Frete indisponível para esta localização. Pedido cancelado.'}`
        );
      }

      const financials = ShippingCalculatorService.calculateOrderFinancials({
        productSubtotal: realSubtotal,
        shippingCost: freightRes.shippingCost,
        shippingChargedToBuyer: freightRes.shippingChargedToBuyer,
        shippingSellerSubsidy: freightRes.shippingSellerSubsidy,
        shippingMarketplaceSubsidy: freightRes.shippingMarketplaceSubsidy,
        commissionRatePercent: sellerCommissionRate,
        customsDuty: 0,
        buyerDiscounts: 0,
      });

      // Generate Order Identifiers
      const orderId = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const orderNumber = `NSL-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

      // Insert Order Header
      await tx.insert(orders).values({
        id: orderId,
        orderNumber,
        buyerId: userId,
        sellerId: primarySellerId,
        storeId: primaryStoreId,
        subtotal: String(financials.productSubtotal),
        shippingFee: String(financials.shippingChargedToBuyer),
        shippingCost: String(financials.shippingCost),
        shippingChargedToBuyer: String(financials.shippingChargedToBuyer),
        shippingSellerSubsidy: String(financials.shippingSellerSubsidy),
        shippingMarketplaceSubsidy: String(financials.shippingMarketplaceSubsidy),
        shippingPayer: freightRes.shippingPayer,
        shippingRateSource: freightRes.rateSource,
        shippingRateId: freightRes.rateId || null,
        commissionRateSnapshot: String(financials.commissionRateSnapshot),
        commissionBase: String(financials.commissionBase),
        marketplaceCommission: String(financials.marketplaceCommission),
        sellerNetAmount: String(financials.sellerNetAmount),
        discountAmount: '0.00',
        customsDuty: '0.00',
        totalAmount: String(financials.buyerPaidTotal),
        currency,
        status: 'pending_payment',
        paymentMethod: paymentMethod || null,
        paymentStatus: 'pending',
        escrowStatus: 'pending',
        shippingAddressJson: targetAddress,
        billingAddressJson: targetAddress,
        countryCode: destinationCountry,
        notes: notes || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Insert Order Items
      for (const item of verifiedItems) {
        if (!item.inventoryId || !item.fulfillmentMode) {
          throw new Error(`ALLOCATION_FAILED: Origem de estoque (inventory_id) não alocada para o item "${item.productTitle}".`);
        }

        await tx.insert(orderItems).values({
          id: `oi_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          orderId,
          productId: item.productId,
          variantId: item.variantId,
          productTitle: item.productTitle,
          productSku: item.productSku,
          variantTitle: item.variantTitle,
          quantity: item.quantity,
          unitPrice: String(item.unitPrice),
          subtotal: String(item.subtotal),
          sellerId: item.sellerId,
          storeId: item.storeId,
          productImage: item.productImage,
          attributesJson: item.attributesJson,
          inventoryId: item.inventoryId,
          warehouseId: item.warehouseId,
          fulfillmentMode: item.fulfillmentMode,
          status: 'pending_preparation',
          createdAt: new Date(),
        });
      }

      // Insert Order Status History
      await tx.insert(orderStatusHistory).values({
        id: `osh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        orderId,
        previousStatus: null,
        newStatus: 'pending_payment',
        reason: 'Pedido criado no checkout aguardando pagamento.',
        changedBy: userId,
        createdAt: new Date(),
      });

      // Reserve Stock: Create stock_reservations, update inventory.quantityReserved, record inventoryMovements
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 30);

      for (const item of verifiedItems) {
        if (!item.inventoryId || !item.fulfillmentMode) {
          throw new Error(`RESERVATION_FAILED: Origem de estoque (inventory_id) não alocada para a reserva do item "${item.productTitle}".`);
        }

        await tx.insert(stockReservations).values({
          id: `sr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          orderId,
          productId: item.productId,
          variantId: item.variantId,
          inventoryId: item.inventoryId,
          warehouseId: item.warehouseId,
          fulfillmentMode: item.fulfillmentMode,
          quantity: item.quantity,
          expiresAt,
          status: 'active',
          createdAt: new Date(),
        });

        // 2. Increase inventory.quantityReserved (do NOT touch quantityOnHand)
        await tx
          .update(inventory)
          .set({
            quantityReserved: sql`${inventory.quantityReserved} + ${item.quantity}`,
            updatedAt: new Date(),
          })
          .where(eq(inventory.id, item.inventoryId));

        // 3. inventory_movements
        await tx.insert(inventoryMovements).values({
          id: `mov_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          inventoryId: item.inventoryId,
          warehouseId: item.warehouseId,
          productId: item.productId,
          variantId: item.variantId,
          type: 'RESERVATION',
          quantity: -item.quantity,
          reason: `Reserva para pedido ${orderNumber}`,
          referenceId: orderId,
          performedBy: userId,
          createdAt: new Date(),
        });
      }

      // Clear cart items AFTER successful commit
      await tx.delete(cartItems).where(eq(cartItems.cartId, userCart.id));

      logger.info({ orderId, orderNumber, total: financials.buyerPaidTotal }, 'Order created successfully in PostgreSQL');

      return {
        id: orderId,
        orderNumber,
        buyerId: userId,
        subtotal: financials.productSubtotal,
        shippingFee: financials.shippingChargedToBuyer,
        shippingCost: financials.shippingCost,
        shippingSellerSubsidy: financials.shippingSellerSubsidy,
        shippingMarketplaceSubsidy: financials.shippingMarketplaceSubsidy,
        marketplaceCommission: financials.marketplaceCommission,
        sellerNetAmount: financials.sellerNetAmount,
        totalAmount: financials.buyerPaidTotal,
        currency,
        status: 'pending_payment',
        paymentMethod: paymentMethod || null,
        paymentStatus: 'pending',
        escrowStatus: 'pending',
        shippingAddress: targetAddress,
        items: verifiedItems,
        createdAt: new Date().toISOString(),
      };
    });
  }

  private static async buildEnrichedOrder(db: any, ord: any) {
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, ord.id));
    const shpList = await db.select().from(shipments).where(eq(shipments.orderId, ord.id));

    const shpWithEvents = await Promise.all(
      shpList.map(async (s: any) => {
        const events = await db
          .select()
          .from(trackingEvents)
          .where(eq(trackingEvents.shipmentId, s.id))
          .orderBy(asc(trackingEvents.eventTime));
        return {
          ...s,
          trackingEvents: events,
        };
      })
    );

    const primaryShipment = shpWithEvents[0] || null;

    let derivedLogisticsStatus = (primaryShipment?.status || ord.status || 'PREPARING').toUpperCase();
    if (shpWithEvents.length > 1) {
      const statuses = shpWithEvents.map((s) => (s.status || '').toUpperCase());
      if (statuses.every((s) => s === 'DELIVERED')) {
        derivedLogisticsStatus = 'DELIVERED';
      } else if (statuses.some((s) => s === 'OUT_FOR_DELIVERY')) {
        derivedLogisticsStatus = 'OUT_FOR_DELIVERY';
      } else if (statuses.some((s) => s === 'IN_TRANSIT')) {
        derivedLogisticsStatus = 'IN_TRANSIT';
      } else if (statuses.some((s) => s === 'SHIPPED')) {
        derivedLogisticsStatus = 'SHIPPED';
      } else {
        derivedLogisticsStatus = 'READY_TO_SHIP';
      }
    }

    return {
      ...ord,
      totalAmount: Number(ord.totalAmount),
      total: Number(ord.totalAmount),
      subtotal: Number(ord.subtotal),
      shippingFee: Number(ord.shippingFee),
      shipment: primaryShipment,
      shipments: shpWithEvents,
      trackingCode: primaryShipment?.trackingNumber || ord.trackingCode || null,
      carrier: primaryShipment?.carrier || null,
      logisticsStatus: derivedLogisticsStatus,
      items: items.map((i: any) => ({
        ...i,
        unitPrice: Number(i.unitPrice),
        subtotal: Number(i.subtotal),
      })),
    };
  }

  static async getOrdersByBuyer(buyerId: string) {
    const db = getDb();
    if (!db) return [];

    const orderList = await db.select().from(orders).where(eq(orders.buyerId, buyerId)).orderBy(desc(orders.createdAt));

    const ordersWithDetails = await Promise.all(
      orderList.map((ord) => this.buildEnrichedOrder(db, ord))
    );

    return ordersWithDetails;
  }

  static async getOrderById(orderId: string) {
    const db = getDb();
    if (!db) return null;

    const orderRows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (orderRows.length === 0) return null;

    return await this.buildEnrichedOrder(db, orderRows[0]);
  }

  static async confirmDelivery(orderId: string, userId: string, shipmentId?: string) {
    await ShipmentService.confirmDeliveryByBuyer(orderId, userId, shipmentId);
    return this.getOrderById(orderId);
  }

  static async cancelOrder(orderId: string, userId: string, reason?: string) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível.');

    const ordRes = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (ordRes.length === 0) throw new Error('Pedido não encontrado.');

    const ord = ordRes[0];
    if (ord.buyerId !== userId) {
      throw new Error('Você não tem permissão para cancelar este pedido.');
    }

    if (ord.status === 'shipped' || ord.status === 'delivered') {
      throw new Error('Pedido entregue ou em transporte não pode ser cancelado.');
    }

    await db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({
          status: 'cancelled',
          escrowStatus: 'refunded',
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId));

      await tx.insert(orderStatusHistory).values({
        id: `osh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        orderId,
        previousStatus: ord.status,
        newStatus: 'cancelled',
        reason: reason || 'Pedido cancelado pelo comprador.',
        changedBy: userId,
        createdAt: new Date(),
      });

      // Release active stock reservations and decrement quantityReserved in inventory
      const activeReservations = await tx
        .select()
        .from(stockReservations)
        .where(and(eq(stockReservations.orderId, orderId), eq(stockReservations.status, 'active')));

      for (const res of activeReservations) {
        await tx
          .update(stockReservations)
          .set({ status: 'released' })
          .where(eq(stockReservations.id, res.id));

        let invRows;
        if (res.variantId) {
          invRows = await tx
            .select()
            .from(inventory)
            .where(and(eq(inventory.productId, res.productId), eq(inventory.variantId, res.variantId)));
        } else {
          invRows = await tx.select().from(inventory).where(eq(inventory.productId, res.productId));
        }

        if (invRows.length > 0) {
          const inv = invRows[0];
          await tx
            .update(inventory)
            .set({
              quantityReserved: sql`GREATEST(0, ${inventory.quantityReserved} - ${res.quantity})`,
              updatedAt: new Date(),
            })
            .where(eq(inventory.id, inv.id));

          await tx.insert(inventoryMovements).values({
            id: `mov_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            warehouseId: inv.warehouseId,
            productId: res.productId,
            variantId: res.variantId,
            type: 'RELEASE',
            quantity: res.quantity,
            reason: `Cancelamento do pedido ${ord.orderNumber}`,
            referenceId: orderId,
            performedBy: userId,
            createdAt: new Date(),
          });
        }
      }
    });

    return this.getOrderById(orderId);
  }

  static async trackOrder(orderId: string, userId: string) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível.');

    const ordRes = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (ordRes.length === 0) throw new Error('Pedido não encontrado.');

    const ord = ordRes[0];
    if (ord.buyerId !== userId) {
      throw new Error('Você não tem permissão para rastrear este pedido.');
    }

    const [history, shipmentRows, items] = await Promise.all([
      db
        .select()
        .from(orderStatusHistory)
        .where(eq(orderStatusHistory.orderId, orderId))
        .orderBy(desc(orderStatusHistory.createdAt)),
      db.select().from(shipments).where(eq(shipments.orderId, orderId)),
      db.select().from(orderItems).where(eq(orderItems.orderId, orderId)),
    ]);

    const shipmentIds = shipmentRows.map(s => s.id);
    let events: any[] = [];
    if (shipmentIds.length > 0) {
      events = await db
        .select()
        .from(trackingEvents)
        .where(inArray(trackingEvents.shipmentId, shipmentIds))
        .orderBy(desc(trackingEvents.eventTime));
    }

    const addressJson = (ord.shippingAddressJson as any) || {};
    const city = addressJson.city || null;
    const country = addressJson.country || addressJson.countryCode || null;
    const destination = city && country ? `${city}, ${country}` : city || country || null;

    const packages = shipmentRows.map(shp => {
      const shpEvents = events.filter(e => e.shipmentId === shp.id);
      const matchedItem = items.find(i => i.id === shp.orderItemId || i.shipmentId === shp.id);
      return {
        id: shp.id,
        trackingNumber: shp.trackingNumber,
        carrier: shp.carrier,
        status: shp.status,
        fulfillmentMode: shp.fulfillmentMode,
        productTitle: matchedItem?.productTitle || null,
        quantity: matchedItem?.quantity || 1,
        shippedAt: shp.shippedAt,
        deliveredAt: shp.deliveredAt,
        events: shpEvents.map(e => ({
          status: e.status,
          description: e.description,
          location: e.location,
          eventTime: e.eventTime,
        })),
      };
    });

    return {
      orderId: ord.id,
      orderNumber: ord.orderNumber,
      status: ord.status,
      destination,
      packages,
      timeline: history.map((h) => ({
        status: h.newStatus,
        reason: h.reason,
        createdAt: h.createdAt,
      })),
    };
  }

  static async syncOrderFulfillmentStatus(orderId: string, executor?: any) {
    return syncOrderFulfillmentStatus(orderId, executor);
  }
}

export async function syncOrderFulfillmentStatus(orderId: string, executor?: any) {
  const db = executor || getDb();
  if (!db) return;

  const currentOrder = await db
    .select({ id: orders.id, status: orders.status, paymentStatus: orders.paymentStatus })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (currentOrder.length === 0) return;
  const ord = currentOrder[0];

  const items = await db
    .select({ id: orderItems.id, status: orderItems.status })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  if (items.length === 0) return;

  const statuses = items.map((i) => i.status || 'pending_preparation');

  const allCancelled = statuses.every((s) => s === 'cancelled');
  const allShipped = statuses.every((s) => s === 'shipped');
  const anyShipped = statuses.some((s) => s === 'shipped');
  const nonCancelledStatuses = statuses.filter((s) => s !== 'cancelled');
  const allNonCancelledReady =
    nonCancelledStatuses.length > 0 && nonCancelledStatuses.every((s) => s === 'ready_to_ship');
  const anyPreparingOrReady = statuses.some((s) => s === 'preparing' || s === 'ready_to_ship');
  const allPending = statuses.every((s) => s === 'pending_preparation');

  let derivedStatus: string = ord.status;

  if (allCancelled) {
    derivedStatus = 'cancelled';
  } else if (ord.status === 'pending_payment' || ord.paymentStatus === 'pending') {
    derivedStatus = 'pending_payment';
  } else if (allShipped) {
    derivedStatus = 'shipped';
  } else if (anyShipped) {
    derivedStatus = 'partially_fulfilled';
  } else if (allNonCancelledReady) {
    derivedStatus = 'ready_to_ship';
  } else if (anyPreparingOrReady) {
    derivedStatus = 'processing';
  } else if (allPending) {
    if (ord.status !== 'pending_payment' && ord.status !== 'processing') {
      derivedStatus = 'processing';
    }
  }

  if (derivedStatus !== ord.status) {
    await db
      .update(orders)
      .set({
        status: derivedStatus,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));
  }
}
