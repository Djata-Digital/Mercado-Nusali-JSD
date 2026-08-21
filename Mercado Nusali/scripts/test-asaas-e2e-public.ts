import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { getDb } from '../src/db/index.js';
import { users, userProfiles, sellers, orders, payments, paymentAttempts, paymentCustomers, escrowAccounts, escrowTransactions, orderStatusHistory, paymentWebhookEvents } from '../src/db/schema.js';
import { AsaasClient } from '../src/server/modules/payments/clients/asaasClient.js';
import { validateAsaasConfig } from '../src/server/modules/payments/config/asaasConfig.js';
import { eq, and } from 'drizzle-orm';

/**
 * Generates a mathematically valid 11-digit CPF for Sandbox testing.
 */
function generateValidTestCpf(): string {
  const num = Array.from({ length: 9 }, () => Math.floor(Math.random() * 9));
  
  let d1 = 0;
  for (let i = 0; i < 9; i++) d1 += num[i] * (10 - i);
  d1 = 11 - (d1 % 11);
  if (d1 >= 10) d1 = 0;

  let d2 = 0;
  for (let i = 0; i < 9; i++) d2 += num[i] * (11 - i);
  d2 += d1 * 2;
  d2 = 11 - (d2 % 11);
  if (d2 >= 10) d2 = 0;

  return `${num.join('')}${d1}${d2}`;
}

async function runAsaasE2EPublicTest() {
  console.log('====================================================');
  console.log('ASAAS SANDBOX E2E TEST (SANDBOX ONLY)');
  console.log('====================================================\n');

  console.log('⚠️ IMPORTANTE: O DATABASE_URL local deve apontar para o mesmo banco de dados PostgreSQL utilizado pela API pública.\n');

  // 1. SAFETY & ENVIRONMENT CHECKS
  const asaasConfig = validateAsaasConfig();
  if (asaasConfig.environment !== 'sandbox') {
    console.error('❌ ABORTANDO: O teste E2E só pode ser executado em ambiente Sandbox (ASAAS_ENVIRONMENT=sandbox).');
    process.exit(1);
  }

  if (!asaasConfig.baseUrl.includes('api-sandbox.asaas.com')) {
    console.error('❌ ABORTANDO: ASAAS_BASE_URL aponta para Produção ou URL inválida! O teste E2E é restrito ao Sandbox (api-sandbox.asaas.com).');
    process.exit(1);
  }

  const apiBaseUrl = (process.env.E2E_API_BASE_URL || 'https://api.mercado.nusali.com').replace(/\/+$/, '');
  const isLocalhost = apiBaseUrl.includes('localhost') || apiBaseUrl.includes('127.0.0.1');

  if (!isLocalhost && !apiBaseUrl.startsWith('https://')) {
    console.error('❌ ABORTANDO: E2E_API_BASE_URL deve utilizar HTTPS em modo público.');
    process.exit(1);
  }

  console.log(`- Modo: SANDBOX ONLY`);
  console.log(`- API Base URL: ${apiBaseUrl}`);
  console.log(`- Asaas Base URL: ${asaasConfig.baseUrl}`);
  console.log(`- Asaas Environment: ${asaasConfig.environment}\n`);

  const db = getDb();
  if (!db) {
    throw new Error('Banco de dados indisponível para o teste E2E.');
  }

  const timestamp = Date.now();
  const testBuyerId = 'usr_e2e_buyer_sandbox';
  const testSellerId = 'sel_e2e_sandbox';
  const testSellerUserId = 'usr_e2e_seller_user';
  const testOrderId = `ord_e2e_brl_${timestamp}`;
  const testBuyerPassword = 'SenhaTesteE2E123!';
  const validSandboxCpf = generateValidTestCpf();

  // 2. PREPARE CONTROLLED SEED DATA (BUYER, SELLER, ORDER)
  console.log('📦 Preparando dados de teste controlados (Buyer, Seller, Order)...');

  const passwordHash = await bcrypt.hash(testBuyerPassword, 10);

  // Ensure Buyer User exists & Profile exists with hardening
  const existingBuyer = await db.select().from(users).where(eq(users.id, testBuyerId)).limit(1);
  if (existingBuyer.length === 0) {
    await db.insert(users).values({
      id: testBuyerId,
      email: 'e2e_buyer_sandbox@nusali.test',
      passwordHash,
      role: 'BUYER',
      fullName: 'Comprador E2E Sandbox',
      phone: null,
      countryCode: 'BR',
      isEmailVerified: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(userProfiles).values({
      id: `prf_${testBuyerId}`,
      userId: testBuyerId,
      taxId: validSandboxCpf, // Valid mathematical CPF generated dynamically
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  } else {
    // Update password hash and clear phone for existing buyer user
    await db.update(users).set({ passwordHash, phone: null }).where(eq(users.id, testBuyerId));

    // Hardened profile check: create profile if missing, otherwise update taxId
    const existingProfile = await db.select().from(userProfiles).where(eq(userProfiles.userId, testBuyerId)).limit(1);
    if (existingProfile.length === 0) {
      await db.insert(userProfiles).values({
        id: `prf_${testBuyerId}`,
        userId: testBuyerId,
        taxId: validSandboxCpf,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } else {
      await db.update(userProfiles).set({ taxId: validSandboxCpf }).where(eq(userProfiles.userId, testBuyerId));
    }
  }

  // Ensure Seller User & Seller exist
  const existingSellerUser = await db.select().from(users).where(eq(users.id, testSellerUserId)).limit(1);
  if (existingSellerUser.length === 0) {
    await db.insert(users).values({
      id: testSellerUserId,
      email: 'e2e_seller_sandbox@nusali.test',
      passwordHash,
      role: 'SELLER',
      fullName: 'Vendedor E2E Sandbox',
      phone: '+5511999999999',
      countryCode: 'BR',
      isEmailVerified: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  const existingSeller = await db.select().from(sellers).where(eq(sellers.id, testSellerId)).limit(1);
  if (existingSeller.length === 0) {
    await db.insert(sellers).values({
      id: testSellerId,
      userId: testSellerUserId,
      companyName: 'Loja E2E Sandbox',
      tradingName: 'Loja E2E Sandbox',
      taxId: '00000000000191',
      phone: '+5511999999999',
      status: 'APPROVED',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // Create Controlled Order BRL
  const testTotalAmount = '5.00';
  await db.insert(orders).values({
    id: testOrderId,
    orderNumber: `NUS-E2E-${timestamp}`,
    buyerId: testBuyerId,
    sellerId: testSellerId,
    subtotal: '5.00',
    shippingFee: '0.00',
    totalAmount: testTotalAmount,
    currency: 'BRL',
    status: 'pending_payment',
    paymentMethod: 'pix',
    paymentStatus: 'pending',
    escrowStatus: 'pending',
    shippingAddressJson: { street: 'Av Paulista 1000', city: 'São Paulo', state: 'SP', zipCode: '01310100', country: 'BR' },
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log(`✅ Pedido de teste criado: ID=${testOrderId}, Total=R$ ${testTotalAmount} BRL\n`);

  // 3. LOGIN VIA PUBLIC API TO OBTAIN JWT TOKEN & VERIFY DATABASE ALIGNMENT
  console.log(`🔑 Efetuando LOGIN via API PÚBLICA: POST ${apiBaseUrl}/api/v1/auth/login...`);
  const loginResponse = await fetch(`${apiBaseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'e2e_buyer_sandbox@nusali.test',
      password: testBuyerPassword,
    }),
  });

  const loginResData: any = await loginResponse.json();

  if (!loginResponse.ok || !loginResData.success || !loginResData.data?.token) {
    console.error('❌ E2E_DATABASE_MISMATCH: O login na API pública falhou.', loginResData);
    const err: any = new Error(
      'E2E_DATABASE_MISMATCH: O login na API pública falhou. Verifique se o DATABASE_URL local e a API PÚBLICA apontam para a mesma instância do banco de dados (Supabase/PostgreSQL).'
    );
    err.code = 'E2E_DATABASE_MISMATCH';
    throw err;
  }

  const returnedUser = loginResData.data?.user;
  if (!returnedUser || (returnedUser.id !== testBuyerId && returnedUser.email !== 'e2e_buyer_sandbox@nusali.test')) {
    console.error('❌ E2E_DATABASE_MISMATCH: O login na API pública retornou um usuário diferente:', returnedUser);
    const err: any = new Error(
      'E2E_DATABASE_MISMATCH: O login na API pública retornou um usuário diferente. Verifique se o DATABASE_URL local e a API PÚBLICA apontam para a mesma instância do banco de dados (Supabase/PostgreSQL).'
    );
    err.code = 'E2E_DATABASE_MISMATCH';
    throw err;
  }

  const buyerToken = loginResData.data?.token;
  console.log('✅ Token JWT de comprador emitido com sucesso pela API pública (Banco de dados alinhado).\n');

  // 4. INITIATE PAYMENT VIA PUBLIC API
  console.log(`🚀 Iniciando pagamento via API PÚBLICA: POST ${apiBaseUrl}/api/v1/payments/initiate...`);
  const initResponse = await fetch(`${apiBaseUrl}/api/v1/payments/initiate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${buyerToken}`,
    },
    body: JSON.stringify({
      orderId: testOrderId,
      method: 'pix',
      provider: 'asaas',
    }),
  });

  const initStatus = initResponse.status;
  const initResData: any = await initResponse.json();

  if (!initResponse.ok || !initResData.success) {
    console.error('❌ Falha ao iniciar pagamento na API pública:', initResData);
    throw new Error(`API de pagamento retornou erro HTTP ${initStatus}`);
  }

  const paymentResult = initResData.data;

  // Correct parsing according to PaymentService.initiatePayment response structure
  const providerPaymentId = paymentResult.providerPaymentId;
  const pixPayload = paymentResult.pix?.payload;

  if (paymentResult.provider !== 'asaas') {
    throw new Error(`TESTE E2E FALHOU: Provider incorreto na resposta (${paymentResult.provider}, esperado: asaas).`);
  }
  if (paymentResult.status !== 'pending') {
    throw new Error(`TESTE E2E FALHOU: Status incorreto na resposta (${paymentResult.status}, esperado: pending).`);
  }
  if (paymentResult.currency !== 'BRL') {
    throw new Error(`TESTE E2E FALHOU: Moeda incorreta na resposta (${paymentResult.currency}, esperado: BRL).`);
  }
  if (Number(paymentResult.amount) !== 5) {
    throw new Error(`TESTE E2E FALHOU: Valor incorreto na resposta (${paymentResult.amount}, esperado: 5).`);
  }
  if (!providerPaymentId) {
    throw new Error('TESTE E2E FALHOU: providerPaymentId não retornado na resposta da API.');
  }
  if (!pixPayload) {
    throw new Error('TESTE E2E FALHOU: pix.payload não retornado na resposta da API.');
  }

  console.log('✅ Resposta da API Pública de Pagamento validada com sucesso:');
  console.log(`   - Provider: ${paymentResult.provider}`);
  console.log(`   - Status Local: ${paymentResult.status}`);
  console.log(`   - Moeda: ${paymentResult.currency}`);
  console.log(`   - Valor: R$ ${paymentResult.amount}`);
  console.log(`   - Asaas Payment ID: ${providerPaymentId}`);
  console.log(`   - PIX Copy & Paste: ${pixPayload.substring(0, 35)}...\n`);

  // 5. VERIFY CHARGE IN ASAAS SANDBOX API
  console.log(`🔍 Verificando cobrança diretamente na API Sandbox do Asaas (GET /payments/${providerPaymentId})...`);
  const asaasCharge = await AsaasClient.request(`/payments/${providerPaymentId}`);
  console.log('✅ Cobrança verificada no Asaas Sandbox:');
  console.log(`   - Asaas ID: ${asaasCharge.id}`);
  console.log(`   - Billing Type: ${asaasCharge.billingType}`);
  console.log(`   - Valor: R$ ${asaasCharge.value}`);
  console.log(`   - Status Asaas Inicial: ${asaasCharge.status}`);
  console.log(`   - Referência Externa: ${asaasCharge.externalReference}\n`);

  if (asaasCharge.externalReference !== testOrderId) {
    throw new Error('TESTE E2E FALHOU: externalReference no Asaas não corresponde ao orderId local.');
  }

  // 6. CONFIRM PAYMENT IN ASAAS SANDBOX USING OFFICIAL SANDBOX ENDPOINT
  console.log(`⚡ Confirmando pagamento no Asaas Sandbox via endpoint oficial (POST /sandbox/payment/${providerPaymentId}/confirm)...`);
  try {
    await AsaasClient.request(`/sandbox/payment/${providerPaymentId}/confirm`, {
      method: 'POST',
    });
    console.log('✅ Confirmação enviada com sucesso para o Asaas Sandbox.');
    console.log('📡 O Asaas Sandbox irá disparar o Webhook REAL via internet para https://api.mercado.nusali.com/api/v1/webhooks/asaas...\n');
  } catch (simErr: any) {
    console.warn('⚠️ Falha ao acionar confirmação Sandbox:', simErr.message);
    console.log('\n====================================================');
    console.log('MANUAL INSTRUCTION FOR SANDBOX');
    console.log('====================================================');
    console.log(`Acesse o painel do Asaas Sandbox e confirme o pagamento para o ID: ${providerPaymentId}`);
    console.log('====================================================\n');
  }

  // 7. CONTROLLED POLLING FOR REAL WEBHOOK PROCESSING
  console.log('⏳ Aguardando a chegada e processamento do Webhook REAL enviado pelo Asaas...');
  console.log('   (Polling periódico de até 90 segundos na API/banco de dados Nusali...)\n');

  const maxAttempts = 30;
  const pollIntervalMs = 3000;
  let webhookReceivedAndProcessed = false;
  let updatedOrder: any = null;
  let updatedPayment: any = null;
  let escrowAcc: any = null;
  let webhookEventRecord: any = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    process.stdout.write(`   [Tentativa ${attempt}/${maxAttempts}] Verificando status do pedido e webhook... `);

    const orderRows = await db.select().from(orders).where(eq(orders.id, testOrderId)).limit(1);
    const paymentRows = await db.select().from(payments).where(eq(payments.orderId, testOrderId)).limit(1);
    const webhookRows = await db.select().from(paymentWebhookEvents).where(
      and(eq(paymentWebhookEvents.provider, 'asaas'), eq(paymentWebhookEvents.eventType, 'PAYMENT_RECEIVED'))
    ).limit(20);

    const matchingWebhook = webhookRows.find((w: any) => {
      const pId = w.payloadJson?.payment?.id || w.payloadJson?.id;
      const extRef = w.payloadJson?.payment?.externalReference;
      return (
        w.provider === 'asaas' &&
        w.eventType === 'PAYMENT_RECEIVED' &&
        w.processed === true &&
        (pId === providerPaymentId || extRef === testOrderId)
      );
    });

    if (orderRows.length > 0 && orderRows[0].paymentStatus === 'paid' && matchingWebhook) {
      updatedOrder = orderRows[0];
      updatedPayment = paymentRows[0];
      webhookEventRecord = matchingWebhook;
      webhookReceivedAndProcessed = true;
      console.log('✅ CONFIRMADO (Pedido pago + Webhook REAL comprovado)!');
      break;
    } else {
      console.log('Aguardando...');
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  // HARD REQUIREMENT: E2E_WEBHOOK_NOT_CONFIRMED check
  if (!webhookReceivedAndProcessed || !webhookEventRecord) {
    console.error('❌ E2E_WEBHOOK_NOT_CONFIRMED: O webhook real PAYMENT_RECEIVED não foi recebido ou processado.');
    const err: any = new Error(
      'E2E_WEBHOOK_NOT_CONFIRMED: O pedido não pôde ser verificado via webhook real do Asaas (PAYMENT_RECEIVED não registrado/processado).'
    );
    err.code = 'E2E_WEBHOOK_NOT_CONFIRMED';
    throw err;
  }

  if (
    webhookEventRecord.provider !== 'asaas' ||
    webhookEventRecord.eventType !== 'PAYMENT_RECEIVED' ||
    webhookEventRecord.processed !== true
  ) {
    console.error('❌ E2E_WEBHOOK_NOT_CONFIRMED: Evento webhook retornado não atende aos requisitos de validação.');
    const err: any = new Error(
      'E2E_WEBHOOK_NOT_CONFIRMED: O evento de webhook encontrado não cumpre provider=asaas, eventType=PAYMENT_RECEIVED ou processed=true.'
    );
    err.code = 'E2E_WEBHOOK_NOT_CONFIRMED';
    throw err;
  }

  // 8. VERIFY FINANCIAL & ESCROW STATE IN DATABASE
  console.log('\n--- VERIFICAÇÃO DO ESTADO FINANCEIRO & ESCROW ---');
  console.log(`- Order paymentStatus: ${updatedOrder.paymentStatus} (esperado: paid)`);
  console.log(`- Order status: ${updatedOrder.status} (esperado: processing)`);
  console.log(`- Order escrowStatus: ${updatedOrder.escrowStatus} (esperado: held)`);
  console.log(`- Local Payment status: ${updatedPayment?.status} (esperado: completed ou paid)`);

  if (updatedOrder.paymentStatus !== 'paid' || updatedOrder.escrowStatus !== 'held') {
    throw new Error('TESTE E2E FALHOU: Estado do pedido incorreto após recebimento do webhook.');
  }

  const escrowAccs = await db.select().from(escrowAccounts).where(eq(escrowAccounts.orderId, testOrderId));
  if (escrowAccs.length !== 1) {
    throw new Error(`TESTE E2E FALHOU: Esperava exatamente 1 conta de escrow, encontrada(s) ${escrowAccs.length}`);
  }
  escrowAcc = escrowAccs[0];

  console.log(`- Escrow Account status: ${escrowAcc.status} (esperado: held)`);
  console.log(`- Escrow Account amount: R$ ${escrowAcc.amount} ${escrowAcc.currency} (esperado: 5.00 BRL)`);

  if (escrowAcc.status !== 'held' || Number(escrowAcc.amount) !== 5) {
    throw new Error('TESTE E2E FALHOU: Saldo Escrow não retido em garantia (HELD) com R$ 5,00.');
  }

  const escrowTxs = await db.select().from(escrowTransactions).where(eq(escrowTransactions.escrowAccountId, escrowAcc.id));
  if (escrowTxs.length !== 1) {
    throw new Error(`TESTE E2E FALHOU: Esperava exatamente 1 lançamento em escrow_transactions, encontrados ${escrowTxs.length}`);
  }

  const escrowTx = escrowTxs[0];
  console.log(`- Escrow Transaction type: ${escrowTx.type} (esperado: HOLD)`);
  console.log(`- Escrow Transaction amount: R$ ${escrowTx.amount}`);

  if (escrowTx.type !== 'HOLD' || Number(escrowTx.amount) !== 5) {
    throw new Error('TESTE E2E FALHOU: Lançamento em escrow_transactions incorreto.');
  }

  console.log(`- Webhook Event Record ID: ${webhookEventRecord.id}`);
  console.log(`- Webhook Event Provider: ${webhookEventRecord.provider}`);
  console.log(`- Webhook Event Type: ${webhookEventRecord.eventType}`);
  console.log(`- Webhook Event Processed: ${webhookEventRecord.processed} (esperado: true)`);

  console.log('\n====================================================');
  console.log('E2E SANDBOX RECORDS PRESERVED FOR INSPECTION');
  console.log('====================================================');
  console.log('Os registros deste teste foram mantidos intencionalmente no banco de dados.');
  console.log('IDs criados para conferência manual:');
  console.log(`  • users (Buyer ID):          ${testBuyerId}`);
  console.log(`  • sellers (Seller ID):        ${testSellerId}`);
  console.log(`  • orders (Order ID):          ${testOrderId}`);
  console.log(`  • payments (Local Payment ID): ${updatedPayment?.id}`);
  console.log(`  • Asaas Provider Payment ID:  ${providerPaymentId}`);
  console.log(`  • payment_webhook_events ID:  ${webhookEventRecord.id}`);
  console.log(`  • escrow_accounts ID:         ${escrowAcc.id}`);
  console.log(`  • escrow_transactions ID:      ${escrowTx.id}`);
  console.log('====================================================\n');
}

runAsaasE2EPublicTest().catch((err) => {
  console.error('❌ TESTE E2E ASAAS FALHOU:', err);
  process.exit(1);
});
