import 'dotenv/config';
import { getDb, getDbPool } from '../src/db/index.js';
import { users, userProfiles, sellers, orders, payments, paymentAttempts, paymentCustomers, escrowAccounts, escrowTransactions, paymentWebhookEvents } from '../src/db/schema.js';
import { AsaasWebhookService } from '../src/server/modules/payments/asaasWebhookService.js';
import { eq } from 'drizzle-orm';

async function runAsaasWebhookTests() {
  console.log('====================================================');
  console.log('ASAAS WEBHOOK INTEGRATION LOCAL TEST SUITE');
  console.log('====================================================\n');

  const configuredToken = process.env.ASAAS_WEBHOOK_AUTH_TOKEN || 'asaas_webhook_secret_sandbox_12345';
  process.env.ASAAS_WEBHOOK_AUTH_TOKEN = configuredToken;

  const db = getDb();
  if (!db) {
    console.error('❌ Banco de dados indisponível para testes de webhook.');
    process.exit(1);
  }

  const timestamp = Date.now();
  const testBuyerId = `usr_wh_buyer_${timestamp}`;
  const testSellerUserId = `usr_wh_seller_${timestamp}`;
  const testSellerId = `sel_wh_${timestamp}`;
  const testOrderId = `ord_wh_brl_${timestamp}`;
  const testAsaasPayId = `pay_wh_asaas_${timestamp}`;
  const testEventId1 = `evt_wh_conf_${timestamp}`;
  const testEventId2 = `evt_wh_recv_${timestamp}`;

  try {
    // ----------------------------------------------------
    // SETUP SEED DATA
    // ----------------------------------------------------
    await db.insert(users).values({
      id: testBuyerId,
      email: `buyer.wh.${timestamp}@mercadonusali.com`,
      fullName: 'Comprador Webhook Teste',
      role: 'BUYER',
      countryCode: 'BR',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(users).values({
      id: testSellerUserId,
      email: `seller.wh.${timestamp}@mercadonusali.com`,
      fullName: 'Vendedor Webhook Teste',
      role: 'SELLER',
      countryCode: 'BR',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(sellers).values({
      id: testSellerId,
      userId: testSellerUserId,
      companyName: 'Loja Webhook Teste',
      tradingName: 'Loja Webhook Teste',
      taxId: '00000000000191',
      phone: '+5511999999999',
      status: 'APPROVED',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(orders).values({
      id: testOrderId,
      orderNumber: `NUS-WH-${timestamp}`,
      buyerId: testBuyerId,
      sellerId: testSellerId,
      subtotal: '45.00',
      shippingFee: '5.00',
      totalAmount: '50.00',
      currency: 'BRL',
      status: 'pending_payment',
      paymentMethod: 'pix',
      paymentStatus: 'pending',
      escrowStatus: 'pending',
      shippingAddressJson: { street: 'Rua Webhook', city: 'São Paulo', country: 'BR' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const localPaymentId = `pay_local_${timestamp}`;
    await db.insert(payments).values({
      id: localPaymentId,
      orderId: testOrderId,
      buyerId: testBuyerId,
      amount: '50.00',
      currency: 'BRL',
      provider: 'asaas',
      method: 'pix',
      status: 'pending',
      transactionRef: testAsaasPayId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    console.log('✅ Seed data para suíte de webhook preparado com sucesso.\n');

    // ----------------------------------------------------
    // TESTE 1: Token Inválido / Ausente -> 401
    // ----------------------------------------------------
    console.log('--- TESTE 1: Autenticação com Token Incorreto ---');
    let test1Blocked = false;
    try {
      await AsaasWebhookService.processWebhook('token_invalido_123', {
        id: `evt_invalid_${timestamp}`,
        event: 'PAYMENT_RECEIVED',
        payment: { id: testAsaasPayId, value: 50 },
      });
    } catch (err: any) {
      if (err.code === 'INVALID_ASAAS_WEBHOOK_TOKEN' || err.status === 401) {
        test1Blocked = true;
      }
    }
    if (!test1Blocked) throw new Error('TESTE 1 FALHOU: Webhook aceitou token inválido sem retornar 401!');
    console.log('✅ [PASS] Token de webhook inválido rejeitado com HTTP 401.\n');

    // ----------------------------------------------------
    // TESTE 2: Payload Inválido -> 400
    // ----------------------------------------------------
    console.log('--- TESTE 2: Rejeição de Payload Incompleto ---');
    let test2Blocked = false;
    try {
      await AsaasWebhookService.processWebhook(configuredToken, { id: 'evt_incomplete' } as any);
    } catch (err: any) {
      if (err.code === 'INVALID_WEBHOOK_PAYLOAD' || err.status === 400) {
        test2Blocked = true;
      }
    }
    if (!test2Blocked) throw new Error('TESTE 2 FALHOU: Payload sem payment.id não foi rejeitado!');
    console.log('✅ [PASS] Payload incompleto rejeitado com HTTP 400.\n');

    // ----------------------------------------------------
    // TESTE 3: Evento PAYMENT_CONFIRMED (Order continua PENDING)
    // ----------------------------------------------------
    console.log('--- TESTE 3: Evento PAYMENT_CONFIRMED (Status intermediário) ---');
    const resConf = await AsaasWebhookService.processWebhook(configuredToken, {
      id: testEventId1,
      event: 'PAYMENT_CONFIRMED',
      dateCreated: new Date().toISOString(),
      payment: {
        id: testAsaasPayId,
        customer: 'cus_wh_test',
        value: 50.00,
        billingType: 'PIX',
        status: 'CONFIRMED',
        externalReference: testOrderId,
      },
    });

    if (!resConf.success) throw new Error('TESTE 3 FALHOU: Evento PAYMENT_CONFIRMED retornou falha.');

    const orderStatePostConf = (await db.select().from(orders).where(eq(orders.id, testOrderId)))[0];
    if (orderStatePostConf.paymentStatus !== 'pending') {
      throw new Error(`TESTE 3 FALHOU: PAYMENT_CONFIRMED alterou order.paymentStatus para "${orderStatePostConf.paymentStatus}" (deveria continuar "pending").`);
    }
    console.log('✅ [PASS] Evento PAYMENT_CONFIRMED registrado com sucesso. Pedido continua com paymentStatus="pending" até o recebimento financeiro final.\n');

    // ----------------------------------------------------
    // TESTE 4: PAYMENT_RECEIVED com Amount Divergente
    // ----------------------------------------------------
    console.log('--- TESTE 4: Evento PAYMENT_RECEIVED com Valor Divergente ---');
    let test4Blocked = false;
    try {
      await AsaasWebhookService.processWebhook(configuredToken, {
        id: `evt_mismatch_${timestamp}`,
        event: 'PAYMENT_RECEIVED',
        dateCreated: new Date().toISOString(),
        payment: {
          id: testAsaasPayId,
          customer: 'cus_wh_test',
          value: 10.00, // Valor divergente do pedido (que é R$ 50,00)
          billingType: 'PIX',
          status: 'RECEIVED',
          externalReference: testOrderId,
        },
      });
    } catch (err: any) {
      if (err.code === 'ASAAS_PAYMENT_AMOUNT_MISMATCH' || err.status === 400) {
        test4Blocked = true;
      }
    }
    if (!test4Blocked) throw new Error('TESTE 4 FALHOU: Valor divergente foi aceito no webhook!');

    const orderStatePostMismatch = (await db.select().from(orders).where(eq(orders.id, testOrderId)))[0];
    if (orderStatePostMismatch.paymentStatus !== 'pending') {
      throw new Error('TESTE 4 FALHOU: Pedido foi alterado indevidamente em valor divergente.');
    }
    console.log('✅ [PASS] Webhook rejeitado com ASAAS_PAYMENT_AMOUNT_MISMATCH quando o valor pago difere do total do pedido.\n');

    // ----------------------------------------------------
    // TESTE 5: PAYMENT_RECEIVED com externalReference Divergente
    // ----------------------------------------------------
    console.log('--- TESTE 5: Evento PAYMENT_RECEIVED com Referência Externa Divergente ---');
    let test5Blocked = false;
    try {
      await AsaasWebhookService.processWebhook(configuredToken, {
        id: `evt_ref_mismatch_${timestamp}`,
        event: 'PAYMENT_RECEIVED',
        dateCreated: new Date().toISOString(),
        payment: {
          id: testAsaasPayId,
          customer: 'cus_wh_test',
          value: 50.00,
          billingType: 'PIX',
          status: 'RECEIVED',
          externalReference: 'ord_outro_pedido_123',
        },
      });
    } catch (err: any) {
      if (err.code === 'ASAAS_WEBHOOK_REFERENCE_MISMATCH' || err.status === 400) {
        test5Blocked = true;
      }
    }
    if (!test5Blocked) throw new Error('TESTE 5 FALHOU: Referência externa divergente foi aceita!');
    console.log('✅ [PASS] Webhook rejeitado com ASAAS_WEBHOOK_REFERENCE_MISMATCH quando a referência externa não bate com o pedido local.\n');

    // ----------------------------------------------------
    // TESTE 6: PAYMENT_RECEIVED Válido (Confirmação Automática Nusali)
    // ----------------------------------------------------
    console.log('--- TESTE 6: Evento PAYMENT_RECEIVED Válido (Confirmação Financeira) ---');
    const resRecv = await AsaasWebhookService.processWebhook(configuredToken, {
      id: testEventId2,
      event: 'PAYMENT_RECEIVED',
      dateCreated: new Date().toISOString(),
      payment: {
        id: testAsaasPayId,
        customer: 'cus_wh_test',
        value: 50.00,
        billingType: 'PIX',
        status: 'RECEIVED',
        externalReference: testOrderId,
      },
    });

    if (!resRecv.success) throw new Error('TESTE 6 FALHOU: PAYMENT_RECEIVED retornou erro.');

    const orderConfirmed = (await db.select().from(orders).where(eq(orders.id, testOrderId)))[0];
    if (orderConfirmed.paymentStatus !== 'paid' || orderConfirmed.escrowStatus !== 'held') {
      throw new Error(`TESTE 6 FALHOU: Estado do pedido incorreto (paymentStatus=${orderConfirmed.paymentStatus}, escrowStatus=${orderConfirmed.escrowStatus}).`);
    }

    const savedPayCompleted = (await db.select().from(payments).where(eq(payments.id, localPaymentId)))[0];
    if (savedPayCompleted.status !== 'completed' && savedPayCompleted.status !== 'paid') {
      throw new Error(`TESTE 6 FALHOU: Status do pagamento local incorreto (${savedPayCompleted.status}).`);
    }

    const escrowAcc = (await db.select().from(escrowAccounts).where(eq(escrowAccounts.orderId, testOrderId)))[0];
    if (!escrowAcc || escrowAcc.status !== 'held' || Number(escrowAcc.amount) !== 50) {
      throw new Error('TESTE 6 FALHOU: Escrow Account não foi retido em garantia (HELD) com o valor R$ 50,00.');
    }

    console.log('✅ [PASS] PAYMENT_RECEIVED confirmou o pedido: order.paymentStatus="paid", escrowStatus="held" (saldo R$ 50,00 em garantia).\n');

    // ----------------------------------------------------
    // TESTE 7: Idempotência de PAYMENT_RECEIVED Repetido
    // ----------------------------------------------------
    console.log('--- TESTE 7: Idempotência de Evento PAYMENT_RECEIVED Duplicado ---');
    const resDup = await AsaasWebhookService.processWebhook(configuredToken, {
      id: testEventId2, // Mesmo eventId
      event: 'PAYMENT_RECEIVED',
      dateCreated: new Date().toISOString(),
      payment: {
        id: testAsaasPayId,
        customer: 'cus_wh_test',
        value: 50.00,
        billingType: 'PIX',
        status: 'RECEIVED',
        externalReference: testOrderId,
      },
    });

    if (!resDup.success || !resDup.duplicate) {
      throw new Error('TESTE 7 FALHOU: Reenvio de webhook duplicado não retornou flag de duplicado idempotente.');
    }
    console.log('✅ [PASS] Evento duplicado processado com idempotência perfeita (retornou HTTP 200 sem duplicar lançamentos no ledger/escrow).\n');

    // ----------------------------------------------------
    // TESTE 8: Idempotência sob Concorrência Simultânea (Promise.all)
    // ----------------------------------------------------
    console.log('--- TESTE 8: Duas Chamadas Concorrentes Simultâneas com o Mesmo event.id ---');
    const concurrentEventId = `evt_concurrent_${timestamp}`;
    const testOrderIdConcurrent = `ord_wh_conc_${timestamp}`;
    const testAsaasPayIdConcurrent = `pay_wh_conc_${timestamp}`;
    const localPaymentIdConcurrent = `pay_local_conc_${timestamp}`;

    // Seed Order & Payment for Concurrent Test
    await db.insert(orders).values({
      id: testOrderIdConcurrent,
      orderNumber: `NUS-CONC-${timestamp}`,
      buyerId: testBuyerId,
      sellerId: testSellerId,
      subtotal: '100.00',
      shippingFee: '10.00',
      totalAmount: '110.00',
      currency: 'BRL',
      status: 'pending_payment',
      paymentMethod: 'pix',
      paymentStatus: 'pending',
      escrowStatus: 'pending',
      shippingAddressJson: { street: 'Rua Concorrente', city: 'São Paulo', country: 'BR' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(payments).values({
      id: localPaymentIdConcurrent,
      orderId: testOrderIdConcurrent,
      buyerId: testBuyerId,
      amount: '110.00',
      currency: 'BRL',
      provider: 'asaas',
      method: 'pix',
      status: 'pending',
      transactionRef: testAsaasPayIdConcurrent,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const payloadConcurrent = {
      id: concurrentEventId,
      event: 'PAYMENT_RECEIVED',
      dateCreated: new Date().toISOString(),
      payment: {
        id: testAsaasPayIdConcurrent,
        customer: 'cus_wh_test',
        value: 110.00,
        billingType: 'PIX',
        status: 'RECEIVED',
        externalReference: testOrderIdConcurrent,
      },
    };

    // Execute 2 concurrent requests simultaneously via Promise.all
    const [resConc1, resConc2] = await Promise.all([
      AsaasWebhookService.processWebhook(configuredToken, payloadConcurrent),
      AsaasWebhookService.processWebhook(configuredToken, payloadConcurrent),
    ]);

    if (!resConc1.success || !resConc2.success) {
      throw new Error('TESTE 8 FALHOU: Uma das chamadas concorrentes retornou erro (ambas deveriam retornar HTTP 200).');
    }

    const duplicates = [resConc1, resConc2].filter((r) => r.duplicate === true);
    if (duplicates.length !== 1) {
      throw new Error(`TESTE 8 FALHOU: Esperava exatamente 1 resposta marcada como duplicada/concorrente, mas obteve ${duplicates.length}.`);
    }

    // Verify database counts to ensure NO duplicate escrow or history entries
    const escrowAccsConc = await db.select().from(escrowAccounts).where(eq(escrowAccounts.orderId, testOrderIdConcurrent));
    if (escrowAccsConc.length !== 1) {
      throw new Error(`TESTE 8 FALHOU: Escrow Account duplicado criado (${escrowAccsConc.length} contas ativas, esperado 1).`);
    }

    const escrowTxCount = await db.select().from(escrowTransactions).where(eq(escrowTransactions.escrowAccountId, escrowAccsConc[0].id));
    if (escrowTxCount.length !== 1) {
      throw new Error(`TESTE 8 FALHOU: Lançamentos duplicados em escrow_transactions (${escrowTxCount.length}, esperado 1).`);
    }

    console.log('✅ [PASS] Duas chamadas concorrentes simultâneas com o mesmo event.id executaram a confirmação financeira exatamente 1 vez, sem duplicação de escrow/ledger, e a requisição concorrente respondeu HTTP 200 idempotente.\n');

    // Cleanup Concurrent Test Data
    await db.delete(escrowTransactions).where(eq(escrowTransactions.escrowAccountId, escrowAccsConc[0].id));
    await db.delete(escrowAccounts).where(eq(escrowAccounts.orderId, testOrderIdConcurrent));
    await db.delete(paymentAttempts).where(eq(paymentAttempts.paymentId, localPaymentIdConcurrent));
    await db.delete(payments).where(eq(payments.orderId, testOrderIdConcurrent));
    await db.delete(orders).where(eq(orders.id, testOrderIdConcurrent));

    // ----------------------------------------------------
    // CLEANUP TEST DATA
    // ----------------------------------------------------
    console.log('🧹 Limpando dados locais de teste...');
    const localEsc = await db.select().from(escrowAccounts).where(eq(escrowAccounts.orderId, testOrderId));
    if (localEsc.length > 0) {
      await db.delete(escrowTransactions).where(eq(escrowTransactions.escrowAccountId, localEsc[0].id));
    }
    await db.delete(escrowAccounts).where(eq(escrowAccounts.orderId, testOrderId));
    await db.delete(paymentAttempts).where(eq(paymentAttempts.paymentId, localPaymentId));
    await db.delete(payments).where(eq(payments.orderId, testOrderId));
    await db.delete(orders).where(eq(orders.id, testOrderId));
    await db.delete(sellers).where(eq(sellers.id, testSellerId));
    await db.delete(users).where(eq(users.id, testBuyerId));
    await db.delete(users).where(eq(users.id, testSellerUserId));
    await db.delete(paymentWebhookEvents).where(eq(paymentWebhookEvents.provider, 'asaas'));

    console.log('🧹 Cleanup concluído.\n');
    console.log('====================================================');
    console.log('ASAAS WEBHOOK SUITE LOCAL TESTS: ALL PASSED');
    console.log('====================================================\n');
  } catch (err: any) {
    console.error('❌ TESTE WEBHOOK ASAAS FALHOU:', err);
    process.exit(1);
  } finally {
    await getDbPool()?.end();
  }
}

runAsaasWebhookTests();
