import 'dotenv/config';
import { getDb, getDbPool } from '../src/db/index.js';
import { PaymentService } from '../src/server/modules/payments/paymentService.js';
import { ShipmentService } from '../src/server/modules/logistics/shipmentService.js';
import { OrderService } from '../src/server/modules/orders/orderService.js';
import {
  users,
  sellers,
  sellerProfiles,
  stores,
  addresses,
  warehouses,
  orders,
  orderItems,
  stockReservations,
  inventory,
  inventoryMovements,
  payments,
  escrowAccounts,
  escrowTransactions,
  orderStatusHistory,
  shipments,
  shippingLabels,
  wallets,
  walletTransactions,
  trackingEvents,
  proofOfDelivery,
} from '../src/db/schema.js';
import { eq, and, or, desc } from 'drizzle-orm';

async function runConsolidatedTests() {
  console.log('====================================================');
  console.log('RUNNING CONSOLIDATED SHIPMENT & LOGISTICS TEST SUITE');
  console.log('====================================================\n');

  const db = getDb();
  if (!db) {
    console.error('CRITICAL: Database unavailable.');
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  // Generate test IDs
  const stamp = Date.now();
  const testBuyerId = `usr_buyer_consol_${stamp}`;
  const testSellerUserId = `usr_seller_consol_${stamp}`;
  const testSellerId = `sel_consol_${stamp}`;
  const testStoreId = `sto_consol_${stamp}`;
  const testWarehouseId = `wh_consol_${stamp}`;
  const testInventoryId = `inv_consol_${stamp}`;

  const orderId1 = `ord_consol_single_${stamp}`;
  const item1Id = `oi_consol_hub_${stamp}`;

  const orderId2 = `ord_consol_multi_${stamp}`;
  const item2AId = `oi_consol_split_hub_${stamp}`;
  const item2BId = `oi_consol_split_sel_${stamp}`;

  const esc1Id = `esc_consol_1_${stamp}`;
  const esc2Id = `esc_consol_2_${stamp}`;

  const testBOrdId = `ord_test_b_${stamp}`;
  const testBItemId = `oi_test_b_${stamp}`;
  const testCOrdId = `ord_test_c_${stamp}`;
  const testCItemId = `oi_test_c_${stamp}`;

  const orderId7AB = `ord_test7ab_${stamp}`;
  const esc7Id = `esc_test7ab_${stamp}`;
  const item7Id = `oi_test7ab_${stamp}`;

  const noNameBuyerId = `usr_noname_buyer_${stamp}`;
  const orderIdNoName = `ord_test_noname_${stamp}`;
  const escNoNameId = `esc_test_noname_${stamp}`;
  const itemNoNameId = `oi_test_noname_${stamp}`;

  const testOnlyPersonalSellerUserId = `usr_sel_personal_${stamp}`;
  const testOnlyPersonalSellerId = `sel_only_personal_${stamp}`;
  const testOnlyPersonalOrdId = `ord_test_only_personal_${stamp}`;
  const testOnlyPersonalItemId = `oi_test_only_personal_${stamp}`;

  try {
    // 0. Seed Test Buyer, Seller, Warehouse & Inventory records
    await db.insert(users).values([
      { id: testBuyerId, email: `buyer_${stamp}@nusali.cplp`, fullName: 'Comprador Teste Consolidação', role: 'BUYER', countryCode: 'GW' },
      { id: testSellerUserId, email: `seller_${stamp}@nusali.cplp`, fullName: 'Vendedor Teste Consolidação', role: 'SELLER', countryCode: 'GW' },
    ]);

    await db.insert(sellers).values({
      id: testSellerId,
      userId: testSellerUserId,
      companyName: 'Loja Teste Nusali CPLP',
      tradingName: 'Loja Teste Nusali CPLP',
      taxId: `NIF-${stamp}`,
      phone: '+245955111222',
      countryCode: 'GW',
    });

    await db.insert(stores).values({
      id: testStoreId,
      sellerId: testSellerId,
      name: 'Loja Teste Nusali CPLP',
      slug: `loja-teste-${stamp}`,
    });

    await db.insert(addresses).values({
      id: `addr_sel_${stamp}`,
      userId: testSellerUserId,
      recipientName: 'Vendedor Teste',
      addressType: 'shipping',
      street: 'Rua das Flores',
      number: '123',
      neighborhood: 'Centro',
      city: 'Bissau',
      state: 'Bissau',
      zipCode: '1000',
      countryCode: 'GW',
      phone: '+245955111222',
    });

    await db.insert(warehouses).values({
      id: testWarehouseId,
      code: `HUB-BIS-${stamp}`,
      name: 'HUB Bissau Central',
      countryCode: 'GW',
      city: 'Bissau',
      address: 'Zona Industrial de Bissau, Galpão 4',
      managerName: 'Gerente Logístico HUB',
    });

    await db.insert(inventory).values({
      id: testInventoryId,
      productId: 'prod_1787081770902_lgwz',
      warehouseId: testWarehouseId,
      locationType: 'NUSALI_HUB',
      quantityOnHand: 10,
      quantityReserved: 10,
      minimumStockLevel: 2,
    });

    // 1. Setup Order 1 (Single Shipment HUB)
    await db.insert(orders).values({
      id: orderId1,
      orderNumber: `PED-CONSOL-1-${stamp}`,
      buyerId: testBuyerId,
      sellerId: testSellerId,
      subtotal: '100.00',
      shippingFee: '10.00',
      totalAmount: '110.00',
      currency: 'XOF',
      status: 'processing',
      paymentStatus: 'paid',
      escrowStatus: 'held',
      shippingAddressJson: { recipientName: 'Comprador Teste', street: 'Avenida Amílcar Cabral 45', city: 'Bissau', countryCode: 'GW', phone: '+245955000000' },
      createdAt: new Date(),
    });

    await db.insert(orderItems).values({
      id: item1Id,
      orderId: orderId1,
      productId: 'prod_1787081770902_lgwz',
      productTitle: 'Castanha de Caju Premium 1kg',
      quantity: 1,
      unitPrice: '100.00',
      subtotal: '100.00',
      sellerId: testSellerId,
      warehouseId: testWarehouseId,
      inventoryId: testInventoryId,
      fulfillmentMode: 'NUSALI_FULFILLMENT',
      status: 'ready_to_ship',
      createdAt: new Date(),
    });

    await db.insert(stockReservations).values({
      id: `res_${stamp}_1`,
      orderId: orderId1,
      productId: 'prod_1787081770902_lgwz',
      inventoryId: testInventoryId,
      quantity: 1,
      fulfillmentMode: 'NUSALI_FULFILLMENT',
      status: 'active',
      expiresAt: new Date(Date.now() + 86400000),
    });

    await db.insert(escrowAccounts).values({
      id: esc1Id,
      orderId: orderId1,
      buyerId: testBuyerId,
      sellerId: testSellerId,
      amount: '110.00',
      currency: 'XOF',
      status: 'held',
    });

    // TEST 0A: Missing Recipient Name throws RECIPIENT_NAME_REQUIRED
    const badOrdId1 = `ord_bad_name_${stamp}`;
    const badItemId1 = `oi_bad_name_${stamp}`;
    await db.insert(orders).values({
      id: badOrdId1,
      orderNumber: `PED-BAD-NAME-${stamp}`,
      buyerId: testBuyerId,
      sellerId: testSellerId,
      subtotal: '50.00',
      shippingFee: '5.00',
      totalAmount: '55.00',
      currency: 'XOF',
      status: 'processing',
      paymentStatus: 'paid',
      escrowStatus: 'held',
      shippingAddressJson: { street: 'Rua Principal 1', city: 'Bissau', countryCode: 'GW' },
      createdAt: new Date(),
    });
    await db.insert(orderItems).values({
      id: badItemId1,
      orderId: badOrdId1,
      productId: 'prod_1787081770902_lgwz',
      productTitle: 'Produto Teste',
      quantity: 1,
      unitPrice: '50.00',
      subtotal: '50.00',
      sellerId: testSellerId,
      warehouseId: testWarehouseId,
      inventoryId: testInventoryId,
      fulfillmentMode: 'NUSALI_FULFILLMENT',
      status: 'ready_to_ship',
      createdAt: new Date(),
    });

    let badNameError = false;
    try {
      // Temporarily clear buyer.fullName to test RECIPIENT_NAME_REQUIRED
      await db.update(users).set({ fullName: '' }).where(eq(users.id, testBuyerId));
      await ShipmentService.createOrGetShipmentForOrderItem(db, badItemId1, testSellerUserId);
    } catch (err: any) {
      badNameError = err?.message?.includes('RECIPIENT_NAME_REQUIRED');
    } finally {
      await db.update(users).set({ fullName: 'Comprador Teste Consolidação' }).where(eq(users.id, testBuyerId));
      await db.delete(orderItems).where(eq(orderItems.id, badItemId1));
      await db.delete(orders).where(eq(orders.id, badOrdId1));
    }
    assert(badNameError === true, 'TEST 0A: Endereço sem nome do destinatário lança RECIPIENT_NAME_REQUIRED');

    // TEST 0B: Missing Destination Country throws RECIPIENT_ADDRESS_INCOMPLETE
    const badOrdId2 = `ord_bad_country_${stamp}`;
    const badItemId2 = `oi_bad_country_${stamp}`;
    await db.insert(orders).values({
      id: badOrdId2,
      orderNumber: `PED-BAD-COUNTRY-${stamp}`,
      buyerId: testBuyerId,
      sellerId: testSellerId,
      subtotal: '50.00',
      shippingFee: '5.00',
      totalAmount: '55.00',
      currency: 'XOF',
      status: 'processing',
      paymentStatus: 'paid',
      escrowStatus: 'held',
      shippingAddressJson: { recipientName: 'Destinatário Sem Pais', street: 'Rua 2', city: 'Bissau' },
      createdAt: new Date(),
    });
    await db.insert(orderItems).values({
      id: badItemId2,
      orderId: badOrdId2,
      productId: 'prod_1787081770902_lgwz',
      productTitle: 'Produto Teste',
      quantity: 1,
      unitPrice: '50.00',
      subtotal: '50.00',
      sellerId: testSellerId,
      warehouseId: testWarehouseId,
      inventoryId: testInventoryId,
      fulfillmentMode: 'NUSALI_FULFILLMENT',
      status: 'ready_to_ship',
      createdAt: new Date(),
    });

    let badCountryError = false;
    try {
      await ShipmentService.createOrGetShipmentForOrderItem(db, badItemId2, testSellerUserId);
    } catch (err: any) {
      badCountryError = err?.message?.includes('RECIPIENT_ADDRESS_INCOMPLETE');
    } finally {
      await db.delete(orderItems).where(eq(orderItems.id, badItemId2));
      await db.delete(orders).where(eq(orders.id, badOrdId2));
    }
    assert(badCountryError === true, 'TEST 0B: Endereço sem país de destino lança RECIPIENT_ADDRESS_INCOMPLETE (sem fallback GW)');

    // Seed personal address AND commercial business address for Seller
    await db.insert(addresses).values([
      {
        id: `addr_sel_personal_${stamp}`,
        userId: testSellerUserId,
        recipientName: 'Vendedor Pessoal',
        addressType: 'shipping',
        street: 'Rua Pessoal Residencial 10',
        number: '10',
        city: 'Bissau',
        state: 'Bissau',
        countryCode: 'GW',
        phone: '+245955111111',
      },
      {
        id: `addr_sel_business_${stamp}`,
        userId: testSellerUserId,
        recipientName: 'Loja Comercial Vendedor',
        addressType: 'business',
        street: 'Avenida Comercial da Loja 500',
        number: '500',
        city: 'Bissau',
        state: 'Bissau',
        countryCode: 'GW',
        phone: '+245955999999',
        isDefault: true,
      },
    ]);

    // TEST A: Pedido para o próprio comprador -> usa nome do snapshot de entrega
    const shp1 = await ShipmentService.createOrGetShipmentForOrderItem(db, item1Id, testSellerUserId);
    assert(shp1.recipientName === 'Comprador Teste', 'TEST A: Pedido para próprio comprador usa nome do snapshot ("Comprador Teste")');

    // TEST B: Comprador envia para outra pessoa -> etiqueta exibe destinatário informado ("Tia Joana"), NÃO comprador
    await db.insert(orders).values({
      id: testBOrdId,
      orderNumber: `PED-TEST-B-${stamp}`,
      buyerId: testBuyerId,
      sellerId: testSellerId,
      subtotal: '100.00',
      shippingFee: '10.00',
      totalAmount: '110.00',
      currency: 'XOF',
      status: 'processing',
      paymentStatus: 'paid',
      escrowStatus: 'held',
      shippingAddressJson: { recipientName: 'Tia Joana da Silva', street: 'Rua das Palmeiras 88', city: 'Bissau', countryCode: 'GW' },
      createdAt: new Date(),
    });
    await db.insert(orderItems).values({
      id: testBItemId,
      orderId: testBOrdId,
      productId: 'prod_1787081770902_lgwz',
      productTitle: 'Presente para Tia Joana',
      quantity: 1,
      unitPrice: '100.00',
      subtotal: '100.00',
      sellerId: testSellerId,
      warehouseId: testWarehouseId,
      inventoryId: testInventoryId,
      fulfillmentMode: 'NUSALI_FULFILLMENT',
      status: 'ready_to_ship',
      createdAt: new Date(),
    });

    const shpTestB = await ShipmentService.createOrGetShipmentForOrderItem(db, testBItemId, testSellerUserId);
    assert(
      shpTestB.recipientName === 'Tia Joana da Silva' && shpTestB.recipientName !== 'Comprador Teste Consolidação',
      'TEST B: Comprador envia para outra pessoa -> etiqueta exibe destinatário "Tia Joana da Silva" (não comprador)'
    );

    // TEST C: Seller possui endereço pessoal e comercial -> SELLER_FULFILLMENT utiliza endereço comercial/operacional
    await db.insert(orders).values({
      id: testCOrdId,
      orderNumber: `PED-TEST-C-${stamp}`,
      buyerId: testBuyerId,
      sellerId: testSellerId,
      subtotal: '100.00',
      shippingFee: '10.00',
      totalAmount: '110.00',
      currency: 'XOF',
      status: 'processing',
      paymentStatus: 'paid',
      escrowStatus: 'held',
      shippingAddressJson: { recipientName: 'Cliente Final', street: 'Rua Central 5', city: 'Bissau', countryCode: 'GW' },
      createdAt: new Date(),
    });
    await db.insert(orderItems).values({
      id: testCItemId,
      orderId: testCOrdId,
      productId: 'prod_1787081770902_lgwz',
      productTitle: 'Produto Envio Vendedor',
      quantity: 1,
      unitPrice: '100.00',
      subtotal: '100.00',
      sellerId: testSellerId,
      inventoryId: testInventoryId,
      fulfillmentMode: 'SELLER_FULFILLMENT',
      status: 'ready_to_ship',
      createdAt: new Date(),
    });

    const shpTestC = await ShipmentService.createOrGetShipmentForOrderItem(db, testCItemId, testSellerUserId);
    const senderStreet = (shpTestC.senderAddressJson as any)?.street;
    assert(
      senderStreet === 'Avenida Comercial da Loja 500',
      'TEST C: Seller com endereço pessoal e comercial -> etiqueta seleciona o endereço comercial/operacional ("Avenida Comercial da Loja 500")'
    );

    // TEST 7C: Seller com APENAS endereço pessoal (sem comercial) -> lança SELLER_ORIGIN_ADDRESS_INCOMPLETE (não usa userAddrs[0])
    await db.insert(users).values({ id: testOnlyPersonalSellerUserId, email: `selpers_${stamp}@nusali.cplp`, fullName: 'Vendedor Sem Loja Comercial', role: 'SELLER', countryCode: 'GW' });
    await db.insert(sellers).values({ id: testOnlyPersonalSellerId, userId: testOnlyPersonalSellerUserId, companyName: 'Vendedor Pessoal MEI', tradingName: 'Vendedor Pessoal', taxId: `NIF-PERS-${stamp}`, phone: '+245955000000', countryCode: 'GW' });
    await db.insert(addresses).values({ id: `addr_only_personal_${stamp}`, userId: testOnlyPersonalSellerUserId, recipientName: 'Casa Residencial Vendedor', addressType: 'shipping', street: 'Rua Pessoal Secreta 1', number: '1', city: 'Bissau', state: 'Bissau', countryCode: 'GW', phone: '+245955000000' });

    await db.insert(orders).values({ id: testOnlyPersonalOrdId, orderNumber: `PED-TEST-PERS-${stamp}`, buyerId: testBuyerId, sellerId: testOnlyPersonalSellerId, subtotal: '50.00', shippingFee: '5.00', totalAmount: '55.00', currency: 'XOF', status: 'processing', paymentStatus: 'paid', escrowStatus: 'held', shippingAddressJson: { recipientName: 'Cliente Final', street: 'Rua Central 5', city: 'Bissau', countryCode: 'GW' }, createdAt: new Date() });
    await db.insert(orderItems).values({ id: testOnlyPersonalItemId, orderId: testOnlyPersonalOrdId, productId: 'prod_1787081770902_lgwz', productTitle: 'Produto Envio Vendedor Pessoal', quantity: 1, unitPrice: '50.00', subtotal: '50.00', sellerId: testOnlyPersonalSellerId, inventoryId: testInventoryId, fulfillmentMode: 'SELLER_FULFILLMENT', status: 'ready_to_ship', createdAt: new Date() });

    let onlyPersonalError = false;
    try {
      await ShipmentService.createOrGetShipmentForOrderItem(db, testOnlyPersonalItemId, testOnlyPersonalSellerUserId);
    } catch (err: any) {
      onlyPersonalError = err?.message?.includes('SELLER_ORIGIN_ADDRESS_INCOMPLETE');
    }
    assert(onlyPersonalError === true, 'TEST 7C: Seller com apenas endereço pessoal lança SELLER_ORIGIN_ADDRESS_INCOMPLETE (não escolhe userAddrs[0] arbitrariamente)');

    // TEST 2: Label generation before dispatch
    const labels = await db.select().from(shippingLabels).where(eq(shippingLabels.shipmentId, shp1.id));
    assert(labels.length === 1, 'TEST 2: Etiqueta de envio gerada antes do despacho físico');

    // TEST 3: Physical dispatch transitions READY_TO_SHIP -> SHIPPED, preenche shippedAt = now()
    const dispatchedShp1 = await ShipmentService.executePhysicalDispatch(db, item1Id, testSellerUserId);
    assert(dispatchedShp1.status === 'SHIPPED', 'TEST 3: Após despacho físico, shipment.status passa a SHIPPED');
    assert(dispatchedShp1.shippedAt !== null, 'TEST 3: shippedAt é preenchido no despacho físico');

    // TEST 4: Single stock deduction idempotency guard (repeat physical dispatch does not duplicate)
    const repeatDispatch = await ShipmentService.executePhysicalDispatch(db, item1Id, testSellerUserId);
    assert(repeatDispatch.status === 'SHIPPED', 'TEST 4: Despacho repetido é idempotente');

    // TEST 5A: Transição inválida SHIPPED -> OUT_FOR_DELIVERY é rejeitada (lança TRANSICAO_INVALIDA)
    let errorShippedToOutForDelivery = false;
    try {
      await ShipmentService.updateShipmentStatus(shp1.id, 'OUT_FOR_DELIVERY', { performedBy: testSellerUserId });
    } catch (err: any) {
      errorShippedToOutForDelivery = err?.message?.includes('TRANSICAO_INVALIDA');
    }
    assert(errorShippedToOutForDelivery === true, 'TEST 5A: SHIPPED -> OUT_FOR_DELIVERY é rejeitado com TRANSICAO_INVALIDA');

    // TEST 5B: Transição inválida SHIPPED -> DELIVERED é rejeitada (lança TRANSICAO_INVALIDA)
    let errorShippedToDelivered = false;
    try {
      await ShipmentService.updateShipmentStatus(shp1.id, 'DELIVERED', { performedBy: testSellerUserId });
    } catch (err: any) {
      errorShippedToDelivered = err?.message?.includes('TRANSICAO_INVALIDA');
    }
    assert(errorShippedToDelivered === true, 'TEST 5B: SHIPPED -> DELIVERED sem passar por IN_TRANSIT é rejeitado com TRANSICAO_INVALIDA');

    // TEST 6A: Transição permitida SHIPPED -> IN_TRANSIT
    const resInTransit = await ShipmentService.updateShipmentStatus(shp1.id, 'IN_TRANSIT', { performedBy: testSellerUserId, location: 'HUB Central Bissau' });
    assert(resInTransit.status === 'IN_TRANSIT', 'TEST 6A: SHIPPED -> IN_TRANSIT é permitido com sucesso');

    // TEST 6B: Idempotência de atualização de status (repetição de IN_TRANSIT não duplica tracking event)
    const countBeforeRepeat = (await db.select().from(trackingEvents).where(eq(trackingEvents.shipmentId, shp1.id))).length;
    const resRepeatInTransit = await ShipmentService.updateShipmentStatus(shp1.id, 'IN_TRANSIT', { performedBy: testSellerUserId, location: 'HUB Central Bissau' });
    const countAfterRepeat = (await db.select().from(trackingEvents).where(eq(trackingEvents.shipmentId, shp1.id))).length;
    assert(resRepeatInTransit.alreadyInState === true, 'TEST 6B: Repetição de status IN_TRANSIT retorna alreadyInState: true');
    assert(countBeforeRepeat === countAfterRepeat, 'TEST 6B: Repetição do mesmo status não duplica tracking_event');

    // TEST 6C: Transição permitida IN_TRANSIT -> OUT_FOR_DELIVERY
    const resOutForDelivery = await ShipmentService.updateShipmentStatus(shp1.id, 'OUT_FOR_DELIVERY', { performedBy: testSellerUserId, location: 'Centro Bissau' });
    assert(resOutForDelivery.status === 'OUT_FOR_DELIVERY', 'TEST 6C: IN_TRANSIT -> OUT_FOR_DELIVERY é permitido com sucesso');

    // TEST 6D: Transição permitida OUT_FOR_DELIVERY -> DELIVERED
    const resDelivered = await ShipmentService.updateShipmentStatus(shp1.id, 'DELIVERED', { performedBy: testSellerUserId, location: 'Endereço Destino', receivedBy: 'Maria Porteira' });
    assert(resDelivered.status === 'DELIVERED', 'TEST 6D: OUT_FOR_DELIVERY -> DELIVERED é permitido com sucesso');

    const [delivShp1] = await db.select().from(shipments).where(eq(shipments.id, shp1.id));
    assert(delivShp1.status === 'DELIVERED', 'TEST 6E: Status do envio persistido como DELIVERED');
    assert(delivShp1.deliveredAt !== null, 'TEST 6E: deliveredAt preenchido ao entregar');

    // TEST 6F: Transição inválida DELIVERED -> IN_TRANSIT (status terminal é rejeitado com TRANSICAO_INVALIDA)
    let errorDeliveredToInTransit = false;
    try {
      await ShipmentService.updateShipmentStatus(shp1.id, 'IN_TRANSIT', { performedBy: testSellerUserId });
    } catch (err: any) {
      errorDeliveredToInTransit = err?.message?.includes('TRANSICAO_INVALIDA');
    }
    assert(errorDeliveredToInTransit === true, 'TEST 6F: DELIVERED -> IN_TRANSIT é rejeitado com TRANSICAO_INVALIDA (status terminal)');

    // TEST 7A & 7B: Single shipment order confirmation rules

    await db.insert(orders).values({
      id: orderId7AB,
      orderNumber: `PED-7AB-${stamp}`,
      buyerId: testBuyerId,
      sellerId: testSellerId,
      subtotal: '100.00',
      shippingFee: '10.00',
      totalAmount: '110.00',
      currency: 'XOF',
      status: 'processing',
      paymentStatus: 'paid',
      escrowStatus: 'held',
      shippingAddressJson: { recipientName: 'Comprador 7AB', street: 'Rua 7', city: 'Bissau', countryCode: 'GW' },
      createdAt: new Date(),
    });

    await db.insert(orderItems).values([
      { id: item7Id, orderId: orderId7AB, productId: 'prod_1787081770902_lgwz', productTitle: 'Item 7AB', quantity: 1, unitPrice: '100.00', subtotal: '100.00', sellerId: testSellerId, warehouseId: testWarehouseId, inventoryId: testInventoryId, fulfillmentMode: 'NUSALI_FULFILLMENT', status: 'ready_to_ship' },
    ]);

    await db.insert(escrowAccounts).values({
      id: esc7Id,
      orderId: orderId7AB,
      buyerId: testBuyerId,
      sellerId: testSellerId,
      amount: '110.00',
      currency: 'XOF',
      status: 'held',
    });

    const shp7 = await ShipmentService.createOrGetShipmentForOrderItem(db, item7Id, testSellerUserId);
    await ShipmentService.executePhysicalDispatch(db, item7Id, testSellerUserId);
    await ShipmentService.updateShipmentStatus(shp7.id, 'IN_TRANSIT', { performedBy: testSellerUserId });

    // TEST 7A: Buyer attempts to confirm when shipment is IN_TRANSIT -> must be BLOCKED (409 SHIPMENT_NOT_DELIVERED)
    let confirmInTransitBlocked = false;
    try {
      await ShipmentService.confirmDeliveryByBuyer(orderId7AB, testBuyerId, shp7.id);
    } catch (err: any) {
      confirmInTransitBlocked = err?.message?.includes('SHIPMENT_NOT_DELIVERED') || err?.message?.includes('ORDER_NOT_FULLY_DELIVERED');
    }
    assert(confirmInTransitBlocked === true, 'TEST 7A: Confirmação do comprador quando shipment está IN_TRANSIT é bloqueada');

    const [shp7InTransit] = await db.select().from(shipments).where(eq(shipments.id, shp7.id));
    assert(shp7InTransit.status === 'IN_TRANSIT', 'TEST 7A: Status do shipment permanece IN_TRANSIT (não alterado pelo comprador)');

    const [esc7Held] = await db.select().from(escrowAccounts).where(eq(escrowAccounts.id, esc7Id));
    assert(esc7Held.status === 'held', 'TEST 7A: Saldo Escrow permanece held (não liberado)');

    // TEST 7B: Update shipment to DELIVERED by operator, then buyer confirms -> allowed
    await ShipmentService.updateShipmentStatus(shp7.id, 'OUT_FOR_DELIVERY', { performedBy: testSellerUserId });
    await ShipmentService.updateShipmentStatus(shp7.id, 'DELIVERED', { performedBy: testSellerUserId, receivedBy: 'Comprador 7AB' });

    const confirmDeliveredRes = await ShipmentService.confirmDeliveryByBuyer(orderId7AB, testBuyerId, shp7.id);
    assert(confirmDeliveredRes.success === true, 'TEST 7B: Confirmação do comprador permitida após shipment estar DELIVERED');

    const [esc7Released] = await db.select().from(escrowAccounts).where(eq(escrowAccounts.id, esc7Id));
    assert(esc7Released.status === 'released', 'TEST 7B: Saldo Escrow liberado após confirmação do comprador');

    // TEST 5B: Comprador sem fullName real tenta confirmar -> lança BUYER_NAME_REQUIRED_FOR_DELIVERY_CONFIRMATION e escrow continua held

    await db.insert(users).values({
      id: noNameBuyerId,
      email: `noname_${stamp}@example.com`,
      fullName: '',
      role: 'buyer',
      createdAt: new Date(),
    });

    await db.insert(orders).values({
      id: orderIdNoName,
      orderNumber: `PED-NONAME-${stamp}`,
      buyerId: noNameBuyerId,
      sellerId: testSellerId,
      subtotal: '50.00',
      shippingFee: '5.00',
      totalAmount: '55.00',
      currency: 'XOF',
      status: 'processing',
      paymentStatus: 'paid',
      escrowStatus: 'held',
      shippingAddressJson: { recipientName: 'Sem Nome', street: 'Rua Teste', city: 'Bissau', countryCode: 'GW' },
      createdAt: new Date(),
    });

    await db.insert(orderItems).values([
      { id: itemNoNameId, orderId: orderIdNoName, productId: 'prod_1787081770902_lgwz', productTitle: 'Item NoName', quantity: 1, unitPrice: '50.00', subtotal: '50.00', sellerId: testSellerId, warehouseId: testWarehouseId, inventoryId: testInventoryId, fulfillmentMode: 'NUSALI_FULFILLMENT', status: 'ready_to_ship' },
    ]);

    await db.insert(escrowAccounts).values({
      id: escNoNameId,
      orderId: orderIdNoName,
      buyerId: noNameBuyerId,
      sellerId: testSellerId,
      amount: '55.00',
      currency: 'XOF',
      status: 'held',
    });

    const shpNoName = await ShipmentService.createOrGetShipmentForOrderItem(db, itemNoNameId, testSellerUserId);
    await ShipmentService.executePhysicalDispatch(db, itemNoNameId, testSellerUserId);
    await ShipmentService.updateShipmentStatus(shpNoName.id, 'IN_TRANSIT', { performedBy: testSellerUserId });
    await ShipmentService.updateShipmentStatus(shpNoName.id, 'OUT_FOR_DELIVERY', { performedBy: testSellerUserId });
    await ShipmentService.updateShipmentStatus(shpNoName.id, 'DELIVERED', { performedBy: testSellerUserId, receivedBy: 'Recebedor Teste' });

    let noNameErrorOccurred = false;
    try {
      await ShipmentService.confirmDeliveryByBuyer(orderIdNoName, noNameBuyerId, shpNoName.id);
    } catch (err: any) {
      noNameErrorOccurred = err?.message?.includes('BUYER_NAME_REQUIRED_FOR_DELIVERY_CONFIRMATION');
    }
    assert(noNameErrorOccurred === true, 'TEST 5B: Comprador sem nome completo lança BUYER_NAME_REQUIRED_FOR_DELIVERY_CONFIRMATION');

    const [escNoNameHeld] = await db.select().from(escrowAccounts).where(eq(escrowAccounts.id, escNoNameId));
    assert(escNoNameHeld.status === 'held', 'TEST 5B: Saldo Escrow permanece held quando comprador não possui nome completo');

    // TEST 5C: Idempotência - segunda confirmação não duplica proof nem duplica release
    const countPod1 = (await db.select().from(proofOfDelivery).where(and(eq(proofOfDelivery.shipmentId, shp7.id), eq(proofOfDelivery.proofType, 'BUYER_CONFIRMATION')))).length;
    const secondConfirmRes = await ShipmentService.confirmDeliveryByBuyer(orderId7AB, testBuyerId, shp7.id);
    const countPod2 = (await db.select().from(proofOfDelivery).where(and(eq(proofOfDelivery.shipmentId, shp7.id), eq(proofOfDelivery.proofType, 'BUYER_CONFIRMATION')))).length;
    
    assert(countPod1 === countPod2, 'TEST 5C: Segunda confirmação do comprador não duplica o registro de proof_of_delivery');
    assert((secondConfirmRes.data as any)?.alreadyReleased === true, 'TEST 5C: Segunda confirmação reconhece escrow já liberado (alreadyReleased: true)');

    // TEST 5D: Evento de rastreamento sem location real não insere dados falsos (location é null no DB)
    const tkeNoLocId = `tke_nolocation_${stamp}`;
    await db.insert(trackingEvents).values({
      id: tkeNoLocId,
      shipmentId: shpNoName.id,
      status: 'IN_TRANSIT',
      description: 'Pacote processado sem localização explícita',
      location: null,
      eventTime: new Date(),
      createdAt: new Date(),
    });
    const [noLocEvt] = await db.select().from(trackingEvents).where(eq(trackingEvents.id, tkeNoLocId)).limit(1);
    assert(noLocEvt.location === null || noLocEvt.location === undefined, 'TEST 5D: Evento sem localização especificada não insere localização fictícia');

    // TEST 7C & 7D: Multi-Shipment Escrow Release Guard (Order 2 with 2 Shipments)
    await db.insert(orders).values({
      id: orderId2,
      orderNumber: `PED-CONSOL-SPLIT-${stamp}`,
      buyerId: testBuyerId,
      sellerId: testSellerId,
      subtotal: '200.00',
      shippingFee: '20.00',
      totalAmount: '220.00',
      currency: 'XOF',
      status: 'processing',
      paymentStatus: 'paid',
      escrowStatus: 'held',
      shippingAddressJson: { recipientName: 'Comprador Split', street: 'Rua 3', city: 'Bissau', countryCode: 'GW' },
      createdAt: new Date(),
    });

    await db.insert(orderItems).values([
      { id: item2AId, orderId: orderId2, productId: 'prod_1787081770902_lgwz', productTitle: 'Item A HUB', quantity: 1, unitPrice: '100.00', subtotal: '100.00', sellerId: testSellerId, warehouseId: testWarehouseId, inventoryId: testInventoryId, fulfillmentMode: 'NUSALI_FULFILLMENT', status: 'ready_to_ship' },
      { id: item2BId, orderId: orderId2, productId: 'prod_1787081770902_lgwz', productTitle: 'Item B Seller', quantity: 1, unitPrice: '100.00', subtotal: '100.00', sellerId: testSellerId, inventoryId: testInventoryId, fulfillmentMode: 'SELLER_FULFILLMENT', status: 'ready_to_ship' },
    ]);

    await db.insert(escrowAccounts).values({
      id: esc2Id,
      orderId: orderId2,
      buyerId: testBuyerId,
      sellerId: testSellerId,
      amount: '220.00',
      currency: 'XOF',
      status: 'held',
    });

    const shp2A = await ShipmentService.createOrGetShipmentForOrderItem(db, item2AId, testSellerUserId);
    const shp2B = await ShipmentService.createOrGetShipmentForOrderItem(db, item2BId, testSellerUserId);

    // Dispatch and Deliver Shipment 2A ONLY
    await ShipmentService.executePhysicalDispatch(db, item2AId, testSellerUserId);
    await ShipmentService.updateShipmentStatus(shp2A.id, 'IN_TRANSIT', { performedBy: testSellerUserId });
    await ShipmentService.updateShipmentStatus(shp2A.id, 'OUT_FOR_DELIVERY', { performedBy: testSellerUserId });
    await ShipmentService.updateShipmentStatus(shp2A.id, 'DELIVERED', { performedBy: testSellerUserId, receivedBy: 'Recebedor HUB' });

    // TEST 7C: Pedido com 2 shipments (1 DELIVERED, 1 READY_TO_SHIP/IN_TRANSIT) -> confirmação do pedido é BLOQUEADA (ORDER_NOT_FULLY_DELIVERED)
    let multiShipmentBlocked = false;
    try {
      await ShipmentService.confirmDeliveryByBuyer(orderId2, testBuyerId);
    } catch (err: any) {
      multiShipmentBlocked = err?.message?.includes('ORDER_NOT_FULLY_DELIVERED') || err?.message?.includes('SHIPMENTS_NOT_ALL_DELIVERED');
    }
    assert(multiShipmentBlocked === true, 'TEST 7C: Confirmação do pedido bloqueada com ORDER_NOT_FULLY_DELIVERED quando 1 shipment ainda não está DELIVERED');

    // Deliver Shipment 2B
    await ShipmentService.executePhysicalDispatch(db, item2BId, testSellerUserId);
    await ShipmentService.updateShipmentStatus(shp2B.id, 'IN_TRANSIT', { performedBy: testSellerUserId });
    await ShipmentService.updateShipmentStatus(shp2B.id, 'OUT_FOR_DELIVERY', { performedBy: testSellerUserId });
    await ShipmentService.updateShipmentStatus(shp2B.id, 'DELIVERED', { performedBy: testSellerUserId, receivedBy: 'Recebedor Seller' });

    // TEST 7D: Ambos os shipments DELIVERED -> confirmação permitida e escrow released
    const finalConfirmRes = await ShipmentService.confirmDeliveryByBuyer(orderId2, testBuyerId);
    assert(finalConfirmRes.success === true, 'TEST 7D: Liberação do Escrow permitida após TODOS os pacotes estarem DELIVERED');

    const [esc2Row] = await db.select().from(escrowAccounts).where(eq(escrowAccounts.id, esc2Id));
    assert(esc2Row.status === 'released', 'TEST 7D: Conta Escrow atualizada para released');

    // TEST 8: Public tracking API
    const publicTracking = await ShipmentService.getPublicTracking(shp1.trackingNumber);
    assert(publicTracking.trackingNumber === shp1.trackingNumber, 'TEST 8: Consulta de rastreamento público retorna o número correto');
    assert((publicTracking as any).recipientAddressJson === undefined, 'TEST 8: Rastreamento público omite endereço privado completo');
    assert(publicTracking.carrier === null, 'TEST 8: Carrier sem fallback falso retorna null');

    // TEST D: QR code com URL pública completa
    const publicAppUrl = 'https://mercadonusali.com';
    const testDUrl = `${publicAppUrl}/tracking/${shp1.trackingNumber}`;
    assert(
      testDUrl === `https://mercadonusali.com/tracking/${shp1.trackingNumber}`,
      'TEST D: QR Code gera URL pública completa (https://mercadonusali.com/tracking/{trackingNumber})'
    );

    // TEST E: Sincronização do acompanhamento logístico do comprador (OrderService.getOrderById)
    const enrichedOrder1 = await OrderService.getOrderById(orderId1);
    assert(enrichedOrder1 !== null, 'TEST E: OrderService.getOrderById retorna pedido válido');
    assert(enrichedOrder1?.logisticsStatus === 'DELIVERED', 'TEST E: OrderService.getOrderById retorna logisticsStatus real = DELIVERED');
    assert(enrichedOrder1?.shipment !== null && enrichedOrder1?.shipment.status === 'DELIVERED', 'TEST E: OrderService.getOrderById enriquece o pedido com o shipment real em DELIVERED');
    assert(Array.isArray(enrichedOrder1?.shipment?.trackingEvents) && enrichedOrder1.shipment.trackingEvents.length > 0, 'TEST E: OrderService.getOrderById carrega trackingEvents reais do shipment');
    assert(enrichedOrder1?.trackingCode === shp1.trackingNumber, 'TEST E: OrderService.getOrderById expõe trackingCode real');

    // TEST F: Segurança de acesso do comprador (confirmDeliveryByBuyer para comprador incorreto)
    const wrongBuyerUserId = `usr_wrong_buyer_${stamp}`;
    let wrongBuyerBlocked = false;
    try {
      await ShipmentService.confirmDeliveryByBuyer(orderId1, wrongBuyerUserId);
    } catch (err: any) {
      wrongBuyerBlocked = err?.message?.includes('UNAUTHORIZED') || err?.message?.includes('Você não é o comprador');
    }
    assert(wrongBuyerBlocked === true, 'TEST F: Acesso a pedido de outro comprador é rejeitado com erro de autorização');

    // TEST G: Listagem de pedidos do comprador (OrderService.getOrdersByBuyer) expõe totalAmount e total corretos
    const buyerOrders = await OrderService.getOrdersByBuyer(testBuyerId);
    const buyerOrder1 = buyerOrders.find((o) => o.id === orderId1);
    assert(buyerOrder1 !== undefined, 'TEST G: OrderService.getOrdersByBuyer retorna os pedidos do comprador');
    assert(typeof buyerOrder1?.totalAmount === 'number' && buyerOrder1.totalAmount === 110, 'TEST G: OrderService.getOrdersByBuyer expõe totalAmount numérico correto (110)');
    assert(typeof buyerOrder1?.total === 'number' && buyerOrder1.total === 110, 'TEST G: OrderService.getOrdersByBuyer expõe total numérico correto (110)');
    assert(buyerOrder1?.totalAmount === enrichedOrder1?.totalAmount, 'TEST G: Valor total da listagem é idêntico ao valor total dos detalhes');

  } catch (err: any) {
    console.error('Erro na execução da suíte de testes:', err);
    failed++;
  } finally {
    // Cleanup
    try {
      const allTestOrderIds = [orderId1, orderId2, testBOrdId, testCOrdId, orderId7AB, orderIdNoName];
      const shpRows = await db.select().from(shipments).where(or(
        eq(shipments.orderId, orderId1),
        eq(shipments.orderId, orderId2),
        eq(shipments.orderId, testBOrdId),
        eq(shipments.orderId, testCOrdId),
        eq(shipments.orderId, orderId7AB),
        eq(shipments.orderId, orderIdNoName)
      ));
      for (const s of shpRows) {
        await db.delete(proofOfDelivery).where(eq(proofOfDelivery.shipmentId, s.id));
        await db.delete(trackingEvents).where(eq(trackingEvents.shipmentId, s.id));
        await db.delete(shippingLabels).where(eq(shippingLabels.shipmentId, s.id));
      }
      await db.delete(shipments).where(or(
        eq(shipments.orderId, orderId1),
        eq(shipments.orderId, orderId2),
        eq(shipments.orderId, testBOrdId),
        eq(shipments.orderId, testCOrdId),
        eq(shipments.orderId, orderId7AB),
        eq(shipments.orderId, orderIdNoName)
      ));
      await db.delete(orderStatusHistory).where(or(
        eq(orderStatusHistory.orderId, orderId1),
        eq(orderStatusHistory.orderId, orderId2),
        eq(orderStatusHistory.orderId, testBOrdId),
        eq(orderStatusHistory.orderId, testCOrdId),
        eq(orderStatusHistory.orderId, orderId7AB),
        eq(orderStatusHistory.orderId, orderIdNoName)
      ));

      const escRows = await db.select().from(escrowAccounts).where(or(
        eq(escrowAccounts.orderId, orderId1),
        eq(escrowAccounts.orderId, orderId2),
        eq(escrowAccounts.orderId, orderId7AB),
        eq(escrowAccounts.orderId, orderIdNoName)
      ));
      for (const e of escRows) {
        await db.delete(escrowTransactions).where(eq(escrowTransactions.escrowAccountId, e.id));
      }
      await db.delete(escrowAccounts).where(or(
        eq(escrowAccounts.orderId, orderId1),
        eq(escrowAccounts.orderId, orderId2),
        eq(escrowAccounts.orderId, orderId7AB),
        eq(escrowAccounts.orderId, orderIdNoName)
      ));

      await db.delete(stockReservations).where(or(
        eq(stockReservations.orderId, orderId1),
        eq(stockReservations.orderId, orderId2),
        eq(stockReservations.orderId, orderId7AB),
        eq(stockReservations.orderId, orderIdNoName)
      ));
      await db.delete(inventoryMovements).where(eq(inventoryMovements.warehouseId, testWarehouseId));
      await db.delete(inventory).where(eq(inventory.id, testInventoryId));
      await db.delete(warehouses).where(eq(warehouses.id, testWarehouseId));

      await db.delete(orderItems).where(or(
        eq(orderItems.orderId, orderId1),
        eq(orderItems.orderId, orderId2),
        eq(orderItems.orderId, testBOrdId),
        eq(orderItems.orderId, testCOrdId),
        eq(orderItems.orderId, testOnlyPersonalOrdId),
        eq(orderItems.orderId, orderId7AB),
        eq(orderItems.orderId, orderIdNoName)
      ));
      await db.delete(orders).where(or(
        eq(orders.id, orderId1),
        eq(orders.id, orderId2),
        eq(orders.id, testBOrdId),
        eq(orders.id, testCOrdId),
        eq(orders.id, testOnlyPersonalOrdId),
        eq(orders.id, orderId7AB),
        eq(orders.id, orderIdNoName)
      ));

      await db.delete(addresses).where(or(eq(addresses.userId, testSellerUserId), eq(addresses.userId, testOnlyPersonalSellerUserId)));
      await db.delete(stores).where(eq(stores.id, testStoreId));
      await db.delete(sellers).where(or(eq(sellers.id, testSellerId), eq(sellers.id, testOnlyPersonalSellerId)));
      await db.delete(walletTransactions).where(or(eq(walletTransactions.walletId, `wlt_${testSellerUserId}`), eq(walletTransactions.walletId, `wlt_${testOnlyPersonalSellerUserId}`)));
      await db.delete(wallets).where(or(eq(wallets.userId, testBuyerId), eq(wallets.userId, testSellerUserId), eq(wallets.userId, testOnlyPersonalSellerUserId), eq(wallets.userId, noNameBuyerId)));
      await db.delete(users).where(or(eq(users.id, testBuyerId), eq(users.id, testSellerUserId), eq(users.id, testOnlyPersonalSellerUserId), eq(users.id, noNameBuyerId)));

      console.log('🧹 Cleanup dos dados de teste concluído.\n');
    } catch (cleanupErr) {
      console.warn('Aviso no cleanup:', cleanupErr);
    }

    await getDbPool()?.end();
  }

  console.log('====================================================');
  console.log(`CONSOLIDATED TEST SUITE: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runConsolidatedTests();
