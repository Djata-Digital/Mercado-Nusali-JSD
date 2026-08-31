import { getDb } from '../../../db/index.js';
import {
  shipments,
  shippingLabels,
  trackingEvents,
  proofOfDelivery,
  orderItems,
  orders,
  sellers,
  sellerProfiles,
  stores,
  addresses,
  warehouses,
  users,
  products,
  stockReservations,
  inventory,
  inventoryMovements,
  auditLogs,
  carriers,
} from '../../../db/schema.js';
import { PaymentService } from '../payments/paymentService.js';
import { eq, and, desc, ne, or, sql } from 'drizzle-orm';
import { logger } from '../../infra/logger.js';
import { broadcastToUser, broadcastAdminEvent } from '../../infra/websocket.js';
import { InventoryService } from '../inventory/inventoryService.js';
import { syncOrderFulfillmentStatus } from '../orders/orderService.js';

export interface CreateShipmentOptions {
  carrier?: string | null;
  trackingNumber?: string | null;
  estimatedDeliveryDate?: string | null;
  notes?: string | null;
}

export class ShipmentService {
  /**
   * Creates or gets a shipment for an order_item when it reaches ready_to_ship.
   * Initial status MUST be READY_TO_SHIP with shippedAt = null.
   * Does NOT deduct stock inventory at this stage.
   */
  static async createOrGetShipmentForOrderItem(
    tx: any,
    orderItemId: string,
    performedBy: string,
    options?: CreateShipmentOptions
  ) {
    // Correção crítica (idempotência sob concorrência — Fase 1 operacional):
    // o "if (item.shipmentId) return existing" abaixo, sozinho, é um
    // check-then-act clássico — duas transações concorrentes podem ler
    // shipmentId=NULL antes de qualquer uma escrever, e ambas criariam um
    // shipment (shipments.id é gerado, sem UNIQUE em order_item_id hoje).
    // pg_advisory_xact_lock(hashtext(orderItemId)) serializa QUALQUER
    // chamada concorrente para o MESMO order_item — a segunda só prossegue
    // depois que a primeira já commitou (ou fez rollback), e nesse ponto o
    // "if (item.shipmentId)" enxerga o valor real e correto. Mesmo padrão
    // já usado em PaymentService (idempotência de payment por orderId) —
    // nenhuma migration necessária, lock é só de sessão/transação.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${orderItemId}))`);

    // 1. Fetch Order Item
    const items = await tx.select().from(orderItems).where(eq(orderItems.id, orderItemId)).limit(1);
    if (items.length === 0) throw new Error(`ORDER_ITEM_NOT_FOUND: Item "${orderItemId}" não encontrado.`);
    const item = items[0];

    // Check if shipment already exists for this item
    if (item.shipmentId) {
      const existingShipment = await tx.select().from(shipments).where(eq(shipments.id, item.shipmentId)).limit(1);
      if (existingShipment.length > 0) {
        return existingShipment[0];
      }
    }

    // 2. Fetch Parent Order
    const ordRows = await tx.select().from(orders).where(eq(orders.id, item.orderId)).limit(1);
    if (ordRows.length === 0) throw new Error(`ORDER_NOT_FOUND: Pedido "${item.orderId}" não encontrado.`);
    const ord = ordRows[0];

    // Check payment state - MUST be paid
    if (ord.paymentStatus !== 'paid') {
      throw new Error('PAYMENT_NOT_CONFIRMED: O pedido ainda não possui pagamento confirmado.');
    }

    // 3. Fetch Buyer
    const buyerRows = await tx.select().from(users).where(eq(users.id, ord.buyerId)).limit(1);
    const buyer = buyerRows[0];

    // 4. Determine Origin Sender Details
    let senderName = '';
    let senderAddressJson: any = {};
    let originWarehouseId: string | null = null;
    let originCountry = '';

    if (item.fulfillmentMode === 'NUSALI_FULFILLMENT') {
      if (!item.warehouseId) {
        throw new Error('WAREHOUSE_NOT_FOUND: Armazém do HUB não identificado para o item de fulfillment.');
      }
      const whRows = await tx.select().from(warehouses).where(eq(warehouses.id, item.warehouseId)).limit(1);
      if (whRows.length === 0) {
        throw new Error(`WAREHOUSE_NOT_FOUND: Armazém do HUB "${item.warehouseId}" não foi encontrado.`);
      }

      const wh = whRows[0];
      originWarehouseId = wh.id;
      senderName = `HUB Nusali - ${wh.name}`;
      const whAddr = typeof wh.addressJson === 'string' ? JSON.parse(wh.addressJson) : (wh.addressJson || {});

      const street = wh.address || whAddr.street || whAddr.address;
      const city = wh.city || whAddr.city;
      const countryCode = wh.countryCode || whAddr.countryCode;

      if (!street || !city || !countryCode) {
        throw new Error(`WAREHOUSE_ADDRESS_INCOMPLETE: O endereço do armazém HUB "${wh.name}" está incompleto (rua, cidade ou país ausentes).`);
      }

      originCountry = countryCode.toUpperCase();
      senderAddressJson = {
        name: wh.name,
        street,
        number: whAddr.number || '',
        complement: whAddr.complement || '',
        neighborhood: whAddr.neighborhood || '',
        city,
        state: wh.region || whAddr.state || '',
        postalCode: whAddr.postalCode || wh.postalCode || '',
        countryCode: originCountry,
        phone: wh.phone || whAddr.phone || '',
      };
    } else {
      // SELLER_FULFILLMENT: Extract complete real store/seller origin address (Requirement 2)
      if (!item.sellerId) {
        throw new Error('SELLER_NOT_FOUND: Vendedor do item não identificado.');
      }

      const [sellerRows, storeRows, profileRows] = await Promise.all([
        tx.select().from(sellers).where(eq(sellers.id, item.sellerId)).limit(1),
        tx.select().from(stores).where(eq(stores.sellerId, item.sellerId)).limit(1),
        tx.select().from(sellerProfiles).where(eq(sellerProfiles.sellerId, item.sellerId)).limit(1),
      ]);

      const sel = sellerRows[0];
      const store = storeRows[0];
      const profile = profileRows[0];

      // Priority 1: Store operational address (store.addressJson)
      let storeAddr: any = null;
      if (store?.addressJson) {
        storeAddr = typeof store.addressJson === 'string' ? JSON.parse(store.addressJson) : store.addressJson;
      }

      // Priority 2: Operational address types (business, pickup, store, commercial, or non-personal default)
      let addrRow: any = null;
      if (sel?.userId) {
        const userAddrs = await tx.select().from(addresses).where(eq(addresses.userId, sel.userId));
        if (userAddrs.length > 0) {
          addrRow =
            userAddrs.find((a: any) => a.addressType === 'business') ||
            userAddrs.find((a: any) => a.addressType === 'pickup') ||
            userAddrs.find((a: any) => a.addressType === 'store') ||
            userAddrs.find((a: any) => a.addressType === 'commercial') ||
            userAddrs.find((a: any) => a.isDefault && a.addressType !== 'personal' && a.addressType !== 'shipping');
        }
      }

      const storeName = store?.name || sel?.companyName || profile?.legalName;
      const contactName = sel?.companyName || profile?.legalName || storeName;
      const phone = sel?.phone || store?.phone || addrRow?.phone;

      // Resolve address components using prioritized operational sources
      const street = storeAddr?.street || storeAddr?.address || addrRow?.street || sel?.address;
      const number = storeAddr?.number || addrRow?.number || '';
      const complement = storeAddr?.complement || addrRow?.complement || '';
      const neighborhood = storeAddr?.neighborhood || addrRow?.neighborhood || '';
      const city = storeAddr?.city || addrRow?.city || sel?.city;
      const state = storeAddr?.state || addrRow?.state || sel?.region;
      const postalCode = storeAddr?.postalCode || storeAddr?.zipCode || addrRow?.zipCode;
      const countryCode = storeAddr?.countryCode || addrRow?.countryCode || sel?.countryCode;

      if (!street || !street.trim() || !city || !city.trim() || !countryCode || !countryCode.trim()) {
        throw new Error(
          `SELLER_ORIGIN_ADDRESS_INCOMPLETE: O vendedor "${storeName || item.sellerId}" não possui o endereço de origem operacional completo cadastrado (rua, cidade ou país ausente). Atualize o endereço da loja antes de gerar a etiqueta.`
        );
      }

      senderName = storeName;
      originCountry = countryCode.trim().toUpperCase();
      senderAddressJson = {
        storeName,
        contactName,
        phone,
        street: street.trim(),
        number: number ? String(number).trim() : '',
        complement: complement ? String(complement).trim() : '',
        neighborhood: neighborhood ? String(neighborhood).trim() : '',
        city: city.trim(),
        state: state ? String(state).trim() : '',
        postalCode: postalCode ? String(postalCode).trim() : '',
        countryCode: originCountry,
      };
    }

    // 5. Persistent Tracking Code (NSL-{ORIGIN_COUNTRY}-{YYYYMMDD}-{UNIQUE})
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    const trackingNumber = options?.trackingNumber || `NSL-${originCountry}-${dateStr}-${randomSuffix}`;
    const carrier = options?.carrier || null;

    // 6. Recipient Details & Strict Validation strictly from Order Address Snapshot (Requirement 3: NO buyer.fullName fallback)
    const recipientAddr = (ord.shippingAddressJson as any) || {};

    // Validate Recipient Name strictly from snapshot
    const recipientName = recipientAddr.recipientName || recipientAddr.fullName || null;
    if (!recipientName || !recipientName.trim()) {
      throw new Error('RECIPIENT_NAME_REQUIRED: É necessário informar o nome do destinatário no endereço de entrega do pedido.');
    }

    // Extract address fields from snapshot
    const destStreet = recipientAddr.street || recipientAddr.address || null;
    const destCity = recipientAddr.city || null;
    const destCountry = recipientAddr.countryCode || recipientAddr.country || null;

    // Validate Recipient Address (Requirements 2 & 4)
    if (!destStreet || !destStreet.trim() || !destCity || !destCity.trim() || !destCountry || !destCountry.trim()) {
      throw new Error(
        'RECIPIENT_ADDRESS_INCOMPLETE: O endereço de entrega do destinatário está incompleto (rua, cidade ou país de destino ausentes).'
      );
    }

    const destinationCountry = destCountry.trim().toUpperCase();

    const recipientAddressJson = {
      recipientName: recipientName.trim(),
      phone: recipientAddr.phone || buyer?.phone || null,
      street: destStreet.trim(),
      number: recipientAddr.number || null,
      complement: recipientAddr.complement || null,
      neighborhood: recipientAddr.neighborhood || null,
      city: destCity.trim(),
      state: recipientAddr.state || recipientAddr.region || null,
      postalCode: recipientAddr.zipCode || recipientAddr.postalCode || null,
      countryCode: destinationCountry,
    };

    // 7. Insert Shipment Record with initial status = READY_TO_SHIP
    const shipmentId = `shp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await tx.insert(shipments).values({
      id: shipmentId,
      orderId: ord.id,
      orderItemId: item.id,
      sellerId: item.sellerId,
      buyerId: ord.buyerId,
      fulfillmentMode: item.fulfillmentMode,
      carrier: carrier,
      trackingNumber,
      serviceType: 'standard',
      status: 'READY_TO_SHIP',
      originWarehouseId,
      originCountry,
      destinationCountry,
      recipientName: recipientAddressJson.recipientName,
      recipientAddressJson,
      senderName,
      senderAddressJson,
      estimatedDeliveryDate: options?.estimatedDeliveryDate || null,
      shippedAt: null, // ONLY set upon physical dispatch
      notes: options?.notes || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 8. Link Shipment to Order Item
    await tx.update(orderItems).set({ shipmentId }).where(eq(orderItems.id, item.id));

    // 9. Idempotent Shipping Label creation
    const existingLabel = await tx.select().from(shippingLabels).where(eq(shippingLabels.shipmentId, shipmentId)).limit(1);
    if (existingLabel.length === 0) {
      await tx.insert(shippingLabels).values({
        id: `lbl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        shipmentId,
        trackingCode: trackingNumber,
        qrCodeData: `/tracking/${trackingNumber}`,
        format: 'a6',
        createdAt: new Date(),
      });
    }

    // 10. Log Initial READY_TO_SHIP Tracking Event
    await tx.insert(trackingEvents).values({
      id: `tke_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      shipmentId,
      status: 'READY_TO_SHIP',
      description: item.fulfillmentMode === 'NUSALI_FULFILLMENT'
        ? `Pacote separado no ${senderName} e pronto para expedição.`
        : `Pacote embalado pelo vendedor (${senderName}) e pronto para expedição.`,
      location: senderAddressJson.city || null,
      performedBy,
      eventTime: new Date(),
      createdAt: new Date(),
    });

    // Log Audit
    await tx.insert(auditLogs).values({
      id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      actorUserId: performedBy,
      action: 'SHIPMENT_READY',
      resource: 'shipments',
      resourceId: shipmentId,
      detailsJson: { trackingNumber, orderItemId: item.id, fulfillmentMode: item.fulfillmentMode },
      createdAt: new Date(),
    });

    logger.info({ shipmentId, trackingNumber, orderItemId: item.id }, 'Shipment created with status READY_TO_SHIP');

    const createdShipment = (await tx.select().from(shipments).where(eq(shipments.id, shipmentId)).limit(1))[0];

    broadcastToUser(ord.buyerId, {
      type: 'SHIPMENT_READY_TO_SHIP',
      shipmentId,
      trackingNumber,
      orderId: ord.id,
    });

    return createdShipment;
  }

  /**
   * Correção crítica (Fase 1 operacional — etiqueta bloqueada): pós-
   * processamento logístico do pagamento. Chamado DEPOIS que
   * confirmOrderPayment já commitou a transação financeira (nunca de
   * dentro dela) — uma falha aqui NUNCA reverte nem invalida pagamento,
   * escrow ou pedido, que já estão persistidos e corretos quando esta
   * função roda.
   *
   * Para cada order_item pago (não cancelado) do pedido, garante um
   * shipment + shippingLabel — reaproveitando 100% de
   * createOrGetShipmentForOrderItem (idempotente, com advisory lock por
   * order_item). Cada item roda na SUA PRÓPRIA transação: uma falha num
   * item (ex.: endereço do vendedor incompleto) nunca impede os demais
   * itens do mesmo pedido, e nunca precisa de fila (BullMQ) — uma nova
   * chamada desta mesma função (retry, ou reconciliação futura) completa o
   * que faltou, sem duplicar o que já existe.
   *
   * NÃO marca nada como despachado/enviado — o shipment nasce em
   * READY_TO_SHIP, shippedAt=null, e order_items.status não é tocado aqui.
   */
  static async ensureFulfillmentCreated(orderId: string, performedBy?: string, executor?: any) {
    const db = executor ?? getDb();
    if (!db) {
      logger.error({ orderId }, 'FULFILLMENT_CREATION_FAILED: banco de dados indisponível');
      return { orderId, succeeded: [] as string[], failed: [] as { orderItemId: string; error: string }[] };
    }

    const ordRows = await db.select({ id: orders.id, paymentStatus: orders.paymentStatus, buyerId: orders.buyerId }).from(orders).where(eq(orders.id, orderId)).limit(1);
    const ord = ordRows[0];
    if (!ord) {
      logger.error({ orderId }, 'FULFILLMENT_CREATION_FAILED: pedido não encontrado');
      return { orderId, succeeded: [], failed: [] };
    }
    if (ord.paymentStatus !== 'paid') {
      // Nunca cria shipment para pedido não pago — chamado defensivamente
      // (ex.: reconciliação futura pode iterar pedidos indiscriminadamente).
      return { orderId, succeeded: [], failed: [] };
    }

    const items = await db
      .select({ id: orderItems.id, status: orderItems.status, shipmentId: orderItems.shipmentId })
      .from(orderItems)
      .where(and(eq(orderItems.orderId, orderId), ne(orderItems.status, 'cancelled')));

    const succeeded: string[] = [];
    const failed: { orderItemId: string; error: string }[] = [];

    logger.info({ orderId, itemCount: items.length }, 'FULFILLMENT_ENSURE_STARTED');

    for (const item of items) {
      try {
        const alreadyHad = Boolean(item.shipmentId);
        const shp = await db.transaction(async (tx: any) => {
          return this.createOrGetShipmentForOrderItem(tx, item.id, performedBy || ord.buyerId);
        });
        succeeded.push(item.id);
        logger.info(
          { orderId, orderItemId: item.id, shipmentId: shp.id, reused: alreadyHad },
          alreadyHad ? 'FULFILLMENT_ALREADY_EXISTED' : 'FULFILLMENT_CREATED'
        );
      } catch (err: any) {
        failed.push({ orderItemId: item.id, error: err?.message || String(err) });
        logger.error(
          { orderId, orderItemId: item.id, error: err?.message },
          'FULFILLMENT_CREATION_FAILED'
        );
      }
    }

    logger.info({ orderId, succeededCount: succeeded.length, failedCount: failed.length }, 'FULFILLMENT_ENSURE_COMPLETED');

    return { orderId, succeeded, failed };
  }

  /**
   * Executes physical dispatch (READY_TO_SHIP -> SHIPPED).
   * Deducts inventory ONCE using exact inventoryId and validates stock availability.
   */
  static async executePhysicalDispatch(
    tx: any,
    orderItemId: string,
    performedBy: string,
    options?: { carrier?: string; trackingNumber?: string }
  ) {
    // 1. Fetch Order Item
    const items = await tx.select().from(orderItems).where(eq(orderItems.id, orderItemId)).limit(1);
    if (items.length === 0) throw new Error(`ORDER_ITEM_NOT_FOUND: Item "${orderItemId}" não encontrado.`);
    const item = items[0];

    // Ensure shipment exists in READY_TO_SHIP state
    const shp = await this.createOrGetShipmentForOrderItem(tx, item.id, performedBy, options);

    // If shipment is already SHIPPED or beyond, return early (idempotent physical dispatch)
    if (shp.status !== 'READY_TO_SHIP' && shp.status !== 'ready_to_ship') {
      logger.info({ shipmentId: shp.id, currentStatus: shp.status }, 'Shipment already physically dispatched (idempotent call)');
      return shp;
    }

    // 2. Strict InventoryId Validation (Requirement 6: INVENTORY EXATA)
    const targetInventoryId = item.inventoryId;
    if (!targetInventoryId) {
      throw new Error(`INVENTORY_NOT_INITIALIZED: O item de pedido "${item.id}" não possui alocação de estoque (inventoryId) associada.`);
    }

    const invRows = await tx.select().from(inventory).where(eq(inventory.id, targetInventoryId)).limit(1);
    if (invRows.length === 0) {
      throw new Error(`INVENTORY_NOT_FOUND: Estoque com ID "${targetInventoryId}" não foi encontrado.`);
    }

    const inv = invRows[0];
    const qty = item.quantity;

    // 3. Exact Stock Availability Validation (Requirement 5: NO Math.max masking)
    const currentOnHand = Number(inv.quantityOnHand);
    const currentReserved = Number(inv.quantityReserved);

    if (currentOnHand < qty || currentReserved < qty) {
      throw new Error(
        `STOCK_STATE_INCONSISTENT: Estoque físico (${currentOnHand}) ou reservado (${currentReserved}) insuficiente no local para o despacho de ${qty} un.`
      );
    }

    const newOnHand = currentOnHand - qty;
    const newReserved = currentReserved - qty;

    await tx.update(inventory).set({
      quantityOnHand: newOnHand,
      quantityReserved: newReserved,
      updatedAt: new Date(),
    }).where(eq(inventory.id, inv.id));
    logger.info({ orderId: item.orderId, productId: item.productId, quantity: qty, newOnHand, newReserved }, 'STOCK_DECREMENTED');

    await tx.insert(inventoryMovements).values({
      id: `mov_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      warehouseId: inv.warehouseId,
      productId: item.productId,
      variantId: item.variantId,
      type: 'OUT',
      quantity: -qty,
      reason: `FULFILLMENT_DISPATCH: Despacho físico do item ${item.id} do pedido ${item.orderId}`,
      referenceId: item.orderId,
      performedBy,
      createdAt: new Date(),
    });

    // Mark stock reservation confirmed
    const resConditions = [
      eq(stockReservations.orderId, item.orderId),
      eq(stockReservations.productId, item.productId),
      eq(stockReservations.inventoryId, targetInventoryId),
    ];
    await tx.update(stockReservations).set({ status: 'confirmed' }).where(and(...resConditions));
    logger.info({ orderId: item.orderId, productId: item.productId, inventoryId: targetInventoryId }, 'STOCK_RESERVATION_FINALIZED');

    // Sync stock summary
    await InventoryService.syncProductStockSummary(item.productId, tx);

    // 4. Update Shipment -> SHIPPED, shippedAt = now()
    await tx.update(shipments).set({
      status: 'SHIPPED',
      carrier: options?.carrier || shp.carrier || null,
      shippedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(shipments.id, shp.id));

    // 5. Update order_item -> shipped
    await tx.update(orderItems).set({ status: 'shipped' }).where(eq(orderItems.id, item.id));

    // 6. Insert SHIPPED Tracking Event
    await tx.insert(trackingEvents).values({
      id: `tke_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      shipmentId: shp.id,
      status: 'SHIPPED',
      description: item.fulfillmentMode === 'NUSALI_FULFILLMENT'
        ? `Pacote despachado fisicamente do HUB e em trânsito.`
        : `Pacote despachado fisicamente pelo vendedor e entregue à logística.`,
      location: shp.senderAddressJson?.city || null,
      performedBy,
      eventTime: new Date(),
      createdAt: new Date(),
    });

    // Log Audit
    await tx.insert(auditLogs).values({
      id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      actorUserId: performedBy,
      action: 'SHIPMENT_SHIPPED',
      resource: 'shipments',
      resourceId: shp.id,
      detailsJson: { trackingNumber: shp.trackingNumber, orderItemId: item.id },
      createdAt: new Date(),
    });

    // Sync parent order fulfillment status
    await syncOrderFulfillmentStatus(item.orderId, tx);

    const updatedShipment = (await tx.select().from(shipments).where(eq(shipments.id, shp.id)).limit(1))[0];
    return updatedShipment;
  }

  /**
   * Central Shipment Status Transition Validator & Update Handler.
   */
  static async updateShipmentStatus(
    shipmentId: string,
    newStatus: string,
    options: { performedBy: string; location?: string; description?: string; failureReason?: string; receivedBy?: string }
  ) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível.');

    return await db.transaction(async (tx) => {
      const shpRows = await tx.select().from(shipments).where(eq(shipments.id, shipmentId)).limit(1);
      if (shpRows.length === 0) throw new Error('Envio não encontrado.');
      const shp = shpRows[0];

      const currentStatusUpper = (shp.status || '').toUpperCase();
      const newStatusUpper = (newStatus || '').toUpperCase();

      // Requirement 17: Idempotency check. If already in target status, return cleanly
      if (currentStatusUpper === newStatusUpper) {
        logger.info({ shipmentId, status: newStatusUpper }, 'Shipment status update is idempotent (same status)');
        return {
          success: true,
          message: `Envio já está no status ${newStatusUpper}.`,
          shipmentId: shp.id,
          status: newStatusUpper,
          alreadyInState: true,
        };
      }

      // Requirement 11: Valid Transitions Matrix
      const validTransitions: Record<string, string[]> = {
        READY_TO_SHIP: ['SHIPPED', 'CANCELLED'],
        SHIPPED: ['IN_TRANSIT', 'DELIVERY_FAILED', 'CANCELLED'],
        IN_TRANSIT: ['OUT_FOR_DELIVERY', 'DELIVERY_FAILED', 'RETURNING'],
        OUT_FOR_DELIVERY: ['DELIVERED', 'DELIVERY_FAILED', 'RETURNING'],
        DELIVERY_FAILED: ['OUT_FOR_DELIVERY', 'RETURNING', 'CANCELLED'],
        RETURNING: ['RETURNED'],
        DELIVERED: [], // Terminal
        RETURNED: [],  // Terminal
        CANCELLED: [], // Terminal
      };

      const allowed = validTransitions[currentStatusUpper] || [];
      if (!allowed.includes(newStatusUpper)) {
        throw new Error(
          `TRANSICAO_INVALIDA: Não é permitido mudar o status do envio de "${currentStatusUpper}" para "${newStatusUpper}". Transições permitidas: ${allowed.join(', ') || 'Nenhuma (Status Terminal)'}.`
        );
      }

      // Requirement 30: Require explicit reason for DELIVERY_FAILED
      if (newStatusUpper === 'DELIVERY_FAILED') {
        const validReasons = ['RECIPIENT_ABSENT', 'ADDRESS_NOT_FOUND', 'RECIPIENT_REFUSED', 'OTHER'];
        const reasonCode = (options.failureReason || '').toUpperCase();
        if (!options.failureReason || (!validReasons.includes(reasonCode) && !options.description)) {
          throw new Error(
            'DELIVERY_FAILED_REASON_REQUIRED: É obrigatório selecionar um motivo válido para a falha na entrega (RECIPIENT_ABSENT, ADDRESS_NOT_FOUND, RECIPIENT_REFUSED ou OTHER com justificativa).'
          );
        }
      }

      const updateData: any = {
        status: newStatusUpper,
        updatedAt: new Date(),
      };

      if (newStatusUpper === 'SHIPPED' && !shp.shippedAt) {
        updateData.shippedAt = new Date();
      }

      if (newStatusUpper === 'DELIVERED') {
        updateData.deliveredAt = new Date();
        if (options.receivedBy) {
          updateData.receivedBy = options.receivedBy;
        }
      }
      if (options.failureReason) {
        updateData.failureReason = options.failureReason;
      }

      await tx.update(shipments).set(updateData).where(eq(shipments.id, shp.id));

      // Standard status descriptions
      let descText = options.description;
      if (!descText) {
        switch (newStatusUpper) {
          case 'SHIPPED':
            descText = 'Pacote despachado fisicamente para transporte.';
            break;
          case 'IN_TRANSIT':
            descText = 'Em transporte no centro logístico.';
            break;
          case 'OUT_FOR_DELIVERY':
            descText = 'Saiu para entrega ao endereço do destinatário.';
            break;
          case 'DELIVERED':
            descText = options.receivedBy
              ? `Entregue com sucesso a ${options.receivedBy}.`
              : 'Entregue com sucesso no destino.';
            break;
          case 'DELIVERY_FAILED':
            descText = `Tentativa de entrega não concluída: ${options.failureReason || 'Motivo informado pelo agente'}.`;
            break;
          case 'RETURNING':
            descText = 'Em rota de devolução à origem.';
            break;
          case 'RETURNED':
            descText = 'Pacote devolvido à origem.';
            break;
          default:
            descText = `Status do envio atualizado para ${newStatusUpper}.`;
        }
      }

      const locationText = options.location || shp.senderAddressJson?.city || null;

      // Record exactly 1 tracking event per transition
      await tx.insert(trackingEvents).values({
        id: `tke_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        shipmentId: shp.id,
        status: newStatusUpper,
        description: descText,
        location: locationText,
        performedBy: options.performedBy,
        eventTime: new Date(),
        createdAt: new Date(),
      });

      // Requirement 15: If operator delivers, require real receivedBy name
      if (newStatusUpper === 'DELIVERED') {
        if (!options.receivedBy) {
          throw new Error('RECEIVER_NAME_REQUIRED: É necessário informar o nome do recebedor para confirmar a entrega.');
        }

        await tx.insert(proofOfDelivery).values({
          id: `pod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          shipmentId: shp.id,
          receivedBy: options.receivedBy,
          deliveredAt: new Date(),
          proofType: 'OPERATOR_CONFIRMATION',
          notes: options.description || null,
          createdAt: new Date(),
        });
      }

      // Log audit
      await tx.insert(auditLogs).values({
        id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        actorUserId: options.performedBy,
        action: `SHIPMENT_${newStatusUpper}`,
        resource: 'shipments',
        resourceId: shp.id,
        detailsJson: { trackingNumber: shp.trackingNumber, newStatus: newStatusUpper, location: locationText },
        createdAt: new Date(),
      });

      broadcastToUser(shp.buyerId || '', {
        type: 'SHIPMENT_STATUS_UPDATED',
        shipmentId: shp.id,
        status: newStatusUpper,
        trackingNumber: shp.trackingNumber,
      });

      broadcastAdminEvent({
        type: 'LOGISTICS_SHIPMENT_UPDATED',
        shipmentId: shp.id,
        status: newStatusUpper,
      });

      return {
        success: true,
        message: `Status do envio atualizado para ${newStatusUpper}.`,
        shipmentId: shp.id,
        status: newStatusUpper,
      };
    });
  }

  /**
   * Confirms delivery by buyer for a specific shipment or whole order.
   * Does NOT alter shipment logistics status.
   * Requires all non-cancelled shipments to already be DELIVERED before releasing escrow.
   */
  static async confirmDeliveryByBuyer(orderId: string, buyerId: string, shipmentId?: string) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível.');

    return await db.transaction(async (tx) => {
      // 1. Verify order existence & ownership
      const ordRows = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (ordRows.length === 0) {
        throw new Error('ORDER_NOT_FOUND: Pedido não encontrado.');
      }
      const ord = ordRows[0];
      if (ord.buyerId !== buyerId) {
        throw new Error('UNAUTHORIZED: Você não é o comprador deste pedido.');
      }

      // 2. Validate real buyer fullName (Requirement 1: Mandatory real fullName for BUYER_CONFIRMATION)
      const buyerUser = (await tx.select().from(users).where(eq(users.id, buyerId)).limit(1))[0];
      const realBuyerName = buyerUser?.fullName ? buyerUser.fullName.trim() : '';

      if (!realBuyerName) {
        throw new Error(
          'BUYER_NAME_REQUIRED_FOR_DELIVERY_CONFIRMATION: Para confirmar o recebimento, é necessário ter o seu nome completo cadastrado no perfil.'
        );
      }

      // 3. If shipmentId is provided, verify it is already DELIVERED
      if (shipmentId) {
        const shpRows = await tx
          .select()
          .from(shipments)
          .where(and(eq(shipments.id, shipmentId), eq(shipments.orderId, orderId)))
          .limit(1);

        if (shpRows.length === 0) {
          throw new Error('SHIPMENT_NOT_FOUND: Envio não encontrado.');
        }

        if ((shpRows[0].status || '').toUpperCase() !== 'DELIVERED') {
          throw new Error('SHIPMENT_NOT_DELIVERED: O envio ainda não foi marcado como entregue pela operação logística.');
        }
      }

      // 4. Fetch all non-cancelled shipments for the order
      const nonCancelledShipments = await tx
        .select()
        .from(shipments)
        .where(and(eq(shipments.orderId, orderId), ne(shipments.status, 'CANCELLED')));

      if (nonCancelledShipments.length === 0) {
        throw new Error('ORDER_NOT_FULLY_DELIVERED: Não é possível confirmar o recebimento pois o pedido não possui envios registrados.');
      }

      const undelivered = nonCancelledShipments.filter(s => (s.status || '').toUpperCase() !== 'DELIVERED');
      if (undelivered.length > 0) {
        throw new Error('ORDER_NOT_FULLY_DELIVERED: Não é possível confirmar o recebimento pois nem todos os pacotes do pedido foram entregues.');
      }

      // 5. Idempotent proof_of_delivery insertion (Requirement 3: Check BUYER_CONFIRMATION uniqueness)
      for (const shp of nonCancelledShipments) {
        const existingPod = await tx
          .select()
          .from(proofOfDelivery)
          .where(and(eq(proofOfDelivery.shipmentId, shp.id), eq(proofOfDelivery.proofType, 'BUYER_CONFIRMATION')))
          .limit(1);

        if (existingPod.length === 0) {
          await tx.insert(proofOfDelivery).values({
            id: `pod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            shipmentId: shp.id,
            receivedBy: realBuyerName,
            deliveredAt: shp.deliveredAt || new Date(),
            proofType: 'BUYER_CONFIRMATION',
            notes: 'Recebimento confirmado pelo comprador.',
            createdAt: new Date(),
          });
        }
      }

      // 6. Release Escrow inside the SAME atomic transaction (Requirement 2)
      const escrowResult = await PaymentService.releaseEscrowForOrder(
        orderId,
        {
          performedBy: buyerId,
          reason: 'ENTREGA_CONFIRMADA_PELO_COMPRADOR: O comprador confirmou o recebimento de todos os pacotes.',
        },
        tx
      );

      // 7. Log Audit
      await tx.insert(auditLogs).values({
        id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        actorUserId: buyerId,
        action: 'BUYER_CONFIRMED_DELIVERY',
        resource: 'orders',
        resourceId: orderId,
        detailsJson: { orderId, buyerId, shipmentId: shipmentId || null },
        createdAt: new Date(),
      });

      return {
        success: true,
        message: 'Recebimento de todos os pacotes confirmado com sucesso! O pagamento foi liberado ao vendedor.',
        data: escrowResult.data,
      };
    });
  }

  /**
   * Fetches public tracking details without exposing full private address.
   */
  static async getPublicTracking(trackingNumber: string) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível.');

    const shpRows = await db.select().from(shipments).where(eq(shipments.trackingNumber, trackingNumber)).limit(1);
    if (shpRows.length === 0) throw new Error('CÓDIGO DE RASTREIO NÃO ENCONTRADO.');
    const shp = shpRows[0];

    const events = await db
      .select()
      .from(trackingEvents)
      .where(eq(trackingEvents.shipmentId, shp.id))
      .orderBy(desc(trackingEvents.eventTime));

    const itemRows = shp.orderItemId
      ? await db.select().from(orderItems).where(eq(orderItems.id, shp.orderItemId)).limit(1)
      : [];

    const recipientAddr = (shp.recipientAddressJson as any) || {};

    return {
      trackingNumber: shp.trackingNumber,
      status: shp.status,
      carrier: shp.carrier || null,
      fulfillmentMode: shp.fulfillmentMode,
      productTitle: itemRows.length > 0 ? itemRows[0].productTitle : null,
      quantity: itemRows.length > 0 ? itemRows[0].quantity : 1,
      originCity: shp.senderAddressJson?.city || null,
      originCountry: shp.originCountry || null,
      destinationCity: recipientAddr.city || null,
      destinationCountry: shp.destinationCountry || null,
      shippedAt: shp.shippedAt,
      deliveredAt: shp.deliveredAt,
      timeline: events.map(e => ({
        status: e.status,
        description: e.description,
        location: e.location,
        eventTime: e.eventTime,
      })),
    };
  }

  /**
   * Fetches shipment details with real tracking events for admin/staff.
   */
  static async getShipmentWithEvents(shipmentId: string) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível.');

    const shpRows = await db.select().from(shipments).where(eq(shipments.id, shipmentId)).limit(1);
    if (shpRows.length === 0) throw new Error('Envio não encontrado.');
    const shp = shpRows[0];

    const events = await db
      .select()
      .from(trackingEvents)
      .where(eq(trackingEvents.shipmentId, shp.id))
      .orderBy(desc(trackingEvents.eventTime));

    const labels = await db
      .select()
      .from(shippingLabels)
      .where(eq(shippingLabels.shipmentId, shp.id))
      .limit(1);

    const pods = await db
      .select()
      .from(proofOfDelivery)
      .where(eq(proofOfDelivery.shipmentId, shp.id));

    // Fase "Transportadoras Persistentes": nome real da transportadora
    // quando o shipment já tem carrierId — nunca inventa, e nunca apaga o
    // texto livre histórico (shp.carrier) quando não há carrierId ainda.
    let carrierName: string | null = null;
    if (shp.carrierId) {
      const carrierRows = await db.select().from(carriers).where(eq(carriers.id, shp.carrierId)).limit(1);
      carrierName = carrierRows[0]?.name || null;
    }

    return {
      ...shp,
      carrierName: carrierName || shp.carrier || null,
      trackingEvents: events,
      shippingLabel: labels.length > 0 ? labels[0] : null,
      proofOfDelivery: pods,
    };
  }

  /**
   * Associa uma transportadora persistente (carriers.id) a um shipment já
   * existente — fase "Transportadoras Persistentes", item 7. Só aceita
   * carrier com status ACTIVE (uma vez atribuída, se a carrier for
   * desativada depois, o shipment continua referenciando-a normalmente —
   * a checagem de ACTIVE só vale no momento da atribuição). Nunca decide
   * fulfillmentMode a partir do carrier (item 8 — são conceitos
   * independentes: fulfillment = quem prepara/coleta, carrier = quem
   * transporta).
   */
  static async assignCarrierToShipment(shipmentId: string, carrierId: string, performedBy: string) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível.');

    const shpRows = await db.select().from(shipments).where(eq(shipments.id, shipmentId)).limit(1);
    if (shpRows.length === 0) throw new Error('SHIPMENT_NOT_FOUND: Envio não encontrado.');

    const carrierRows = await db.select().from(carriers).where(eq(carriers.id, carrierId)).limit(1);
    if (carrierRows.length === 0) throw new Error('CARRIER_NOT_FOUND: Transportadora não encontrada.');
    const carrier = carrierRows[0];
    if (carrier.status !== 'ACTIVE') {
      throw new Error('CARRIER_INACTIVE: Esta transportadora está inativa e não pode ser atribuída a novos envios.');
    }

    await db.update(shipments).set({ carrierId, updatedAt: new Date() }).where(eq(shipments.id, shipmentId));

    await db.insert(trackingEvents).values({
      id: `tke_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      shipmentId,
      status: shpRows[0].status,
      description: `Transportadora definida: ${carrier.name}.`,
      location: null,
      performedBy,
      eventTime: new Date(),
      createdAt: new Date(),
    });

    return { shipmentId, carrierId, carrierName: carrier.name };
  }
}
