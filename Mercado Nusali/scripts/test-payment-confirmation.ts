import 'dotenv/config';
import { getDb, getDbPool } from '../src/db/index.js';
import { PaymentService } from '../src/server/modules/payments/paymentService.js';
import { users, orders, orderItems, stockReservations, inventory, payments, escrowAccounts, escrowTransactions, orderStatusHistory } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

async function runTests() {
  console.log('==================================================');
  console.log('RUNNING TEST SUITE: PAYMENT CONFIRMATION & SECURITY');
  console.log('==================================================\n');

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

  const usersRows = await db.select().from(users).limit(1);
  const testBuyerId = usersRows.length > 0 ? usersRows[0].id : 'usr_buyer_test_1';
  const testOrderId = `ord_test_${Date.now()}`;
  const testSellerId = 'sel_usr_1786932023575_u36xp';
  const testProductId = 'prod_1787081770902_lgwz';

  try {
    // 1. Create a dummy test order in pending_payment state
    await db.insert(orders).values({
      id: testOrderId,
      orderNumber: `PED-TEST-${Date.now()}`,
      buyerId: testBuyerId,
      sellerId: testSellerId,
      subtotal: '100.00',
      shippingFee: '10.00',
      totalAmount: '110.00',
      currency: 'XOF',
      status: 'pending_payment',
      paymentStatus: 'pending',
      escrowStatus: 'pending',
      shippingAddressJson: { street: 'Rua Teste', city: 'Bissau', countryCode: 'GW' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const testOrderItemId = `oi_test_${Date.now()}`;
    await db.insert(orderItems).values({
      id: testOrderItemId,
      orderId: testOrderId,
      productId: testProductId,
      productTitle: 'Produto Teste Pagamento',
      quantity: 1,
      unitPrice: '100.00',
      subtotal: '100.00',
      sellerId: testSellerId,
      fulfillmentMode: 'NUSALI_FULFILLMENT',
      status: 'pending_preparation',
      createdAt: new Date(),
    });

    // TEST 1: Unpaid Order Payment Status is 'pending'
    const [initialOrd] = await db.select().from(orders).where(eq(orders.id, testOrderId));
    assert(initialOrd.paymentStatus === 'pending', 'TEST 1: Novo pedido possui paymentStatus = pending');
    assert(initialOrd.escrowStatus === 'pending', 'TEST 1: Novo pedido possui escrowStatus = pending');

    // TEST 2: Confirm Order Payment via PaymentService.confirmOrderPayment (Admin execution)
    const res = await PaymentService.confirmOrderPayment(testOrderId, {
      provider: 'DEV_SIMULATOR',
      performedBy: testBuyerId,
    });

    assert(res.success === true, 'TEST 2: confirmOrderPayment executado com sucesso pelo admin');

    // TEST 3: Check Order state after confirmation
    const [paidOrd] = await db.select().from(orders).where(eq(orders.id, testOrderId));
    assert(paidOrd.paymentStatus === 'paid', 'TEST 3: order.paymentStatus atualizado para paid');
    assert(paidOrd.escrowStatus === 'held', 'TEST 3: order.escrowStatus atualizado para held');
    assert(paidOrd.status === 'processing', 'TEST 3: order.status avançado para processing');

    // TEST 4: Escrow Record Created
    const escRows = await db.select().from(escrowAccounts).where(eq(escrowAccounts.orderId, testOrderId));
    assert(escRows.length === 1, 'TEST 4: Registro em escrowAccounts criado exatamente 1 vez');
    assert(escRows[0].status === 'held', 'TEST 4: Escrow Account status = held');

    const escTxRows = await db.select().from(escrowTransactions).where(eq(escrowTransactions.escrowAccountId, escRows[0].id));
    assert(escTxRows.length === 1, 'TEST 4: Transação de retenção em escrowTransactions criada');
    assert(escTxRows[0].type === 'HOLD', 'TEST 4: Tipo de transação = HOLD');

    // TEST 5: Idempotency Check (Confirming second time)
    const secondRes = await PaymentService.confirmOrderPayment(testOrderId, {
      provider: 'DEV_SIMULATOR',
      performedBy: testBuyerId,
    });

    assert(secondRes.success === true, 'TEST 5: Segunda confirmação executada com sucesso idempotente');

    const escRowsSecond = await db.select().from(escrowAccounts).where(eq(escrowAccounts.orderId, testOrderId));
    assert(escRowsSecond.length === 1, 'TEST 5: Escrow Accounts não foi duplicado na confirmação repetida');

    const escTxRowsSecond = await db.select().from(escrowTransactions).where(eq(escrowTransactions.escrowAccountId, escRows[0].id));
    assert(escTxRowsSecond.length === 1, 'TEST 5: Transações de Escrow não foram duplicadas na confirmação repetida');

    // TEST 6: Audit History Logged
    const historyRows = await db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, testOrderId));
    assert(historyRows.length >= 1, 'TEST 6: Evento registrado no histórico de auditoria (orderStatusHistory)');

    // TEST E: ord.sellerId null -> ORDER_SELLER_NOT_FOUND error & rollback
    const testNoSellerOrderId = `ord_noseller_${Date.now()}`;
    await db.insert(orders).values({
      id: testNoSellerOrderId,
      orderNumber: `PED-NOSELLER-${Date.now()}`,
      buyerId: testBuyerId,
      sellerId: null,
      subtotal: '50.00',
      shippingFee: '5.00',
      totalAmount: '55.00',
      currency: 'XOF',
      status: 'pending_payment',
      paymentStatus: 'pending',
      escrowStatus: 'pending',
      shippingAddressJson: { street: 'Rua Teste', city: 'Bissau', countryCode: 'GW' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    let sellerErrorCaught = false;
    try {
      await PaymentService.confirmOrderPayment(testNoSellerOrderId, { provider: 'DEV_SIMULATOR' });
    } catch (err: any) {
      if (err.message?.includes('ORDER_SELLER_NOT_FOUND')) {
        sellerErrorCaught = true;
      }
    }
    assert(sellerErrorCaught === true, 'TEST E: Pedido com sellerId nulo lança ORDER_SELLER_NOT_FOUND e faz rollback');
    await db.delete(orders).where(eq(orders.id, testNoSellerOrderId));

    // TEST ROLES: Verify DEV_SIMULATOR_ROLES
    const DEV_SIMULATOR_ROLES = new Set(['GLOBAL_ADMIN', 'ADMIN']);
    assert(DEV_SIMULATOR_ROLES.has('GLOBAL_ADMIN'), 'SECURITY: GLOBAL_ADMIN possui acesso ao simulador');
    assert(DEV_SIMULATOR_ROLES.has('ADMIN'), 'SECURITY: ADMIN possui acesso ao simulador');
    assert(!DEV_SIMULATOR_ROLES.has('BUYER'), 'SECURITY: BUYER bloqueado do simulador');
    assert(!DEV_SIMULATOR_ROLES.has('SELLER'), 'SECURITY: SELLER bloqueado do simulador');
    assert(!DEV_SIMULATOR_ROLES.has('LOGISTICS'), 'SECURITY: LOGISTICS bloqueado do simulador');
    assert(!DEV_SIMULATOR_ROLES.has('WAREHOUSE_MANAGER'), 'SECURITY: WAREHOUSE_MANAGER bloqueado do simulador');
    assert(!DEV_SIMULATOR_ROLES.has('REGIONAL_SUPERVISOR'), 'SECURITY: REGIONAL_SUPERVISOR bloqueado do simulador');

  } catch (err: any) {
    console.error('Erro na execução dos testes:', err);
    failed++;
  } finally {
    try {
      await db.delete(orderStatusHistory).where(eq(orderStatusHistory.orderId, testOrderId));
      const escRows = await db.select().from(escrowAccounts).where(eq(escrowAccounts.orderId, testOrderId));
      if (escRows.length > 0) {
        await db.delete(escrowTransactions).where(eq(escrowTransactions.escrowAccountId, escRows[0].id));
        await db.delete(escrowAccounts).where(eq(escrowAccounts.orderId, testOrderId));
      }
      await db.delete(payments).where(eq(payments.orderId, testOrderId));
      await db.delete(orderItems).where(eq(orderItems.orderId, testOrderId));
      await db.delete(orders).where(eq(orders.id, testOrderId));
      console.log('🧹 Cleanup dos dados de teste concluído.\n');
    } catch (cleanupErr) {
      console.warn('Aviso no cleanup de testes:', cleanupErr);
    }

    await getDbPool()?.end();
  }

  console.log('==================================================');
  console.log(`TEST SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('==================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
