import 'dotenv/config';
import { getDb, getDbPool } from '../src/db/index.js';
import { users, userProfiles, orders, payments, paymentAttempts, paymentCustomers } from '../src/db/schema.js';
import { getAsaasConfig } from '../src/server/modules/payments/config/asaasConfig.js';
import { AsaasPaymentProvider, normalizeAsaasBrazilianMobilePhone } from '../src/server/modules/payments/providers/asaasPaymentProvider.js';
import { eq, and } from 'drizzle-orm';

async function runAsaasPixTests() {
  console.log('====================================================');
  console.log('ASAAS SANDBOX PIX REAL INTEGRATION SUITE [SANDBOX ONLY]');
  console.log('====================================================\n');

  // ----------------------------------------------------
  // UNIT TEST: PHONE NORMALIZATION FOR ASAAS
  // ----------------------------------------------------
  console.log('🧪 TESTE 0: Validação do Normalizador de Telefone Celular Brasileiro Asaas...');
  const t1 = normalizeAsaasBrazilianMobilePhone('+55 (47) 99376-637');
  if (t1 !== '4799376637') throw new Error(`TESTE 0 FALHOU: esperado '4799376637', obtido '${t1}'`);

  const t2 = normalizeAsaasBrazilianMobilePhone('4799376637');
  if (t2 !== '4799376637') throw new Error(`TESTE 0 FALHOU: esperado '4799376637', obtido '${t2}'`);

  const t3 = normalizeAsaasBrazilianMobilePhone('+5511999999999');
  if (t3 !== '11999999999') throw new Error(`TESTE 0 FALHOU: esperado '11999999999', obtido '${t3}'`);

  const t4 = normalizeAsaasBrazilianMobilePhone('');
  if (t4 !== null) throw new Error(`TESTE 0 FALHOU: esperado null, obtido '${t4}'`);

  const t5 = normalizeAsaasBrazilianMobilePhone(null);
  if (t5 !== null) throw new Error(`TESTE 0 FALHOU: esperado null, obtido '${t5}'`);

  const t6 = normalizeAsaasBrazilianMobilePhone('123');
  if (t6 !== null) throw new Error(`TESTE 0 FALHOU: esperado null para telefone inválido, obtido '${t6}'`);

  console.log('✅ TESTE 0: Normalização de telefone celular aprovada em todos os cenários.\n');

  const config = getAsaasConfig();
  if (!config.apiKey || !config.apiKey.trim()) {
    console.error('❌ ASAAS_NOT_CONFIGURED: ASAAS_API_KEY não está configurada no arquivo .env.');
    console.error('   Insira uma ASAAS_API_KEY válida para executar os testes reais de cobrança PIX Sandbox.\n');
    process.exit(1);
  }

  const timestamp = Date.now();
  const testBuyerBR_Id = `usr_buyer_br_${timestamp}`;
  const testBuyerGW_Id = `usr_buyer_gw_${timestamp}`;
  const testBuyerNoDoc_Id = `usr_buyer_nodoc_${timestamp}`;
  const testBuyerB_Id = `usr_buyer_b_${timestamp}`;

  const testOrderBRLId = `ord_brl_${timestamp}`;
  const testOrderXOFId = `ord_xof_${timestamp}`;

  const db = getDb();
  if (!db) {
    console.error('❌ Banco de dados indisponível para testes.');
    process.exit(1);
  }

  try {
    // ----------------------------------------------------
    // SETUP SEED DATA
    // ----------------------------------------------------
    const testName = process.env.ASAAS_TEST_CUSTOMER_NAME || 'Cliente Teste Mercado Nusali';
    const testEmail = process.env.ASAAS_TEST_CUSTOMER_EMAIL || `buyer.sandbox.${timestamp}@mercadonusali.com`;
    const testTaxId = process.env.ASAAS_TEST_CUSTOMER_CPF_CNPJ || '00000000000191'; // CNPJ Sandbox válido (Banco do Brasil)

    // 1. Buyer BR (Comprador Brasileiro com CNPJ/CPF válido)
    await db.insert(users).values({
      id: testBuyerBR_Id,
      email: testEmail,
      fullName: testName,
      role: 'BUYER',
      countryCode: 'BR',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(userProfiles).values({
      id: `prof_${testBuyerBR_Id}`,
      userId: testBuyerBR_Id,
      taxId: testTaxId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 2. Buyer BR sem documento válido (Para teste de rejeição de CPF/CNPJ brasileiro)
    await db.insert(users).values({
      id: testBuyerNoDoc_Id,
      email: `buyer.nodoc.${timestamp}@mercadonusali.com`,
      fullName: 'Comprador BR Sem Doc',
      role: 'BUYER',
      countryCode: 'BR',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(userProfiles).values({
      id: `prof_${testBuyerNoDoc_Id}`,
      userId: testBuyerNoDoc_Id,
      taxId: '11111111111', // CPF Inválido
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 3. Buyer GW (Comprador Estrangeiro da Guiné-Bissau)
    await db.insert(users).values({
      id: testBuyerGW_Id,
      email: `buyer.gw.${timestamp}@mercadonusali.com`,
      fullName: 'Amadu Djau',
      role: 'BUYER',
      countryCode: 'GW',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 4. Buyer B (Para teste de bloqueio de ownership)
    await db.insert(users).values({
      id: testBuyerB_Id,
      email: `buyer.b.${timestamp}@mercadonusali.com`,
      fullName: 'Comprador B Teste',
      role: 'BUYER',
      countryCode: 'BR',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 5. Order BRL (Total Amount = 30.00 BRL)
    await db.insert(orders).values({
      id: testOrderBRLId,
      orderNumber: `NUS-${timestamp}`,
      buyerId: testBuyerBR_Id,
      subtotal: '25.00',
      shippingFee: '5.00',
      totalAmount: '30.00',
      currency: 'BRL',
      status: 'pending_payment',
      paymentMethod: 'pix',
      paymentStatus: 'pending',
      escrowStatus: 'pending',
      shippingAddressJson: { street: 'Rua Teste', city: 'São Paulo', country: 'BR' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 6. Order XOF
    await db.insert(orders).values({
      id: testOrderXOFId,
      orderNumber: `NUS-XOF-${timestamp}`,
      buyerId: testBuyerBR_Id,
      subtotal: '5000.00',
      shippingFee: '500.00',
      totalAmount: '5500.00',
      currency: 'XOF',
      status: 'pending_payment',
      paymentMethod: 'pix',
      paymentStatus: 'pending',
      escrowStatus: 'pending',
      shippingAddressJson: { street: 'Avenida Brasil', city: 'Bissau', country: 'GW' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    console.log('✅ Seed data de teste preparado com sucesso.\n');

    const provider = new AsaasPaymentProvider();

    // ----------------------------------------------------
    // TESTE A: Conectividade Asaas Sandbox
    // ----------------------------------------------------
    console.log('--- TESTE A: Conectividade Asaas Sandbox ---');
    const conn = await provider.testConnection();
    if (!conn.success) throw new Error('TESTE A FALHOU: Falha na conexão com Asaas Sandbox.');
    console.log(`✅ [PASS] Conexão ativa com Asaas Sandbox (Status geral: ${conn.generalStatus ?? 'OK'}).\n`);

    // ----------------------------------------------------
    // TESTE B: Validação de Documento Brasileiro Inválido
    // ----------------------------------------------------
    console.log('--- TESTE B: Rejeição de Comprador BR sem CPF/CNPJ Válido ---');
    let testBBlocked = false;
    try {
      await provider.getOrCreateCustomer(testBuyerNoDoc_Id);
    } catch (err: any) {
      if (err.code === 'ASAAS_BRAZILIAN_TAX_ID_REQUIRED' || err.status === 400) {
        testBBlocked = true;
      }
    }
    if (!testBBlocked) {
      throw new Error('TESTE B FALHOU: Comprador BR com CPF inválido NÃO foi rejeitado!');
    }
    console.log(`✅ [PASS] Rejeição de comprador BR sem CPF/CNPJ válido confirmada (ASAAS_BRAZILIAN_TAX_ID_REQUIRED).\n`);

    // ----------------------------------------------------
    // TESTE C: Customer Estrangeiro (countryCode != 'BR')
    // ----------------------------------------------------
    console.log('--- TESTE C: Customer Estrangeiro (foreignCustomer = true) ---');
    const gwCustomerId = await provider.getOrCreateCustomer(testBuyerGW_Id);
    if (!gwCustomerId || !gwCustomerId.startsWith('cus_')) {
      throw new Error(`TESTE C FALHOU: Customer ID estrangeiro inválido (${gwCustomerId}).`);
    }
    console.log(`✅ [PASS] Customer estrangeiro (GW) criado com sucesso no Asaas Sandbox: ${gwCustomerId}\n`);

    // ----------------------------------------------------
    // TESTE D: Customer BR Válido & Idempotência
    // ----------------------------------------------------
    console.log('--- TESTE D: Customer BR Válido & Reutilização Idempotente ---');
    const brCustomerId1 = await provider.getOrCreateCustomer(testBuyerBR_Id);
    const brCustomerId2 = await provider.getOrCreateCustomer(testBuyerBR_Id);
    if (brCustomerId1 !== brCustomerId2) {
      throw new Error(`TESTE D FALHOU: Idempotência de customer falhou (${brCustomerId1} != ${brCustomerId2}).`);
    }
    console.log(`✅ [PASS] Customer BR criado e reutilizado de forma idempotente: ${brCustomerId1}\n`);

    // ----------------------------------------------------
    // TESTE E: Cobrança PIX Real & Isolação de Amount/Currency
    // ----------------------------------------------------
    console.log('--- TESTE E: Criar Cobrança PIX Real (Isolação de Amount sent pelo browser) ---');
    const paymentRes1 = await provider.initiatePayment({
      orderId: testOrderBRLId,
      amount: 1.00, // Browser envia 1.00, mas o pedido no banco vale 30.00
      currency: 'USD', // Browser envia USD, mas o pedido é BRL
      customerName: testName,
      customerEmail: testEmail,
      paymentMethod: 'pix',
      metadata: { buyerId: testBuyerBR_Id },
    });

    if (!paymentRes1.success || paymentRes1.status !== 'PENDING') {
      throw new Error('TESTE E FALHOU: Cobrança PIX não retornou status PENDING.');
    }

    if (paymentRes1.rawResponse?.amount !== 30 || paymentRes1.rawResponse?.currency !== 'BRL') {
      throw new Error(`TESTE E FALHOU: Amount/Currency retornados (${paymentRes1.rawResponse?.amount}, ${paymentRes1.rawResponse?.currency}) não usaram o pedido como fonte de verdade (esperado 30, BRL).`);
    }

    console.log(`✅ [PASS] Cobrança PIX criada no Sandbox usou exclusivamente os dados do ORDER (R$ 30,00 BRL):`);
    console.log(`   - Customer ID: ${brCustomerId1}`);
    console.log(`   - Asaas Payment ID: ${paymentRes1.transactionRef}`);
    console.log(`   - Amount Confirmado: R$ ${paymentRes1.rawResponse?.amount},00`);
    console.log(`   - Currency Confirmada: ${paymentRes1.rawResponse?.currency}`);
    console.log(`   - QR Code Gerado: ${paymentRes1.pixCopiaECola ? 'SIM (Copia e Cola gerado)' : 'PENDENTE'}\n`);

    // ----------------------------------------------------
    // TESTE F: Idempotência de Payment & Busca Subsequente de QR Code
    // ----------------------------------------------------
    console.log('--- TESTE F: Idempotência de Payment e Recuperação de QR Code ---');
    const paymentRes2 = await provider.initiatePayment({
      orderId: testOrderBRLId,
      amount: 30.00,
      currency: 'BRL',
      customerName: testName,
      customerEmail: testEmail,
      paymentMethod: 'pix',
      metadata: { buyerId: testBuyerBR_Id },
    });

    if (paymentRes2.transactionRef !== paymentRes1.transactionRef) {
      throw new Error(`TESTE F FALHOU: Nova chamada gerou cobrança Asaas duplicada (${paymentRes2.transactionRef} != ${paymentRes1.transactionRef}).`);
    }
    console.log(`✅ [PASS] Idempotência de cobrança confirmada: reutilizou ID Asaas ${paymentRes2.transactionRef}.\n`);

    // ----------------------------------------------------
    // TESTE G: Bloqueio de Ownership (Order de outro buyer)
    // ----------------------------------------------------
    console.log('--- TESTE G: Bloqueio de Ownership de Pedido de Outro Buyer ---');
    let testGBlocked = false;
    try {
      await provider.initiatePayment({
        orderId: testOrderBRLId,
        amount: 30.00,
        currency: 'BRL',
        customerName: 'Buyer B',
        customerEmail: 'buyer.b@mercadonusali.com',
        paymentMethod: 'pix',
        metadata: { buyerId: testBuyerB_Id },
      });
    } catch (err: any) {
      if (err.code === 'FORBIDDEN_ORDER_ACCESS' || err.status === 403) {
        testGBlocked = true;
      }
    }
    if (!testGBlocked) {
      throw new Error('TESTE G FALHOU: Tentativa de pagar pedido alheio NÃO foi bloqueada!');
    }
    console.log(`✅ [PASS] Tentativa de pagar pedido de outro comprador bloqueada com 403 FORBIDDEN_ORDER_ACCESS.\n`);

    // ----------------------------------------------------
    // TESTE H: Bloqueio de Moeda Não-BRL (Order XOF)
    // ----------------------------------------------------
    console.log('--- TESTE H: Bloqueio de Moeda Não-BRL (Order XOF) ---');
    let testHBlocked = false;
    try {
      await provider.initiatePayment({
        orderId: testOrderXOFId,
        amount: 5500.00,
        currency: 'XOF',
        customerName: testName,
        customerEmail: testEmail,
        paymentMethod: 'pix',
        metadata: { buyerId: testBuyerBR_Id },
      });
    } catch (err: any) {
      if (err.code === 'ASAAS_CURRENCY_NOT_SUPPORTED' || err.status === 400) {
        testHBlocked = true;
      }
    }
    if (!testHBlocked) {
      throw new Error('TESTE H FALHOU: Pedido em XOF não foi bloqueado!');
    }
    console.log(`✅ [PASS] Pedido em XOF rejeitado com ASAAS_CURRENCY_NOT_SUPPORTED.\n`);

    // ----------------------------------------------------
    // CLEANUP TEST DATA (LOCAL ONLY)
    // ----------------------------------------------------
    console.log('🧹 Limpando dados locais de teste...');
    const localPayList = await db.select().from(payments).where(eq(payments.orderId, testOrderBRLId));
    for (const p of localPayList) {
      await db.delete(paymentAttempts).where(eq(paymentAttempts.paymentId, p.id));
    }
    await db.delete(payments).where(eq(payments.orderId, testOrderBRLId));
    await db.delete(orders).where(eq(orders.id, testOrderBRLId));
    await db.delete(orders).where(eq(orders.id, testOrderXOFId));
    await db.delete(paymentCustomers).where(eq(paymentCustomers.userId, testBuyerBR_Id));
    await db.delete(paymentCustomers).where(eq(paymentCustomers.userId, testBuyerGW_Id));
    await db.delete(userProfiles).where(eq(userProfiles.userId, testBuyerBR_Id));
    await db.delete(userProfiles).where(eq(userProfiles.userId, testBuyerNoDoc_Id));
    await db.delete(users).where(eq(users.id, testBuyerBR_Id));
    await db.delete(users).where(eq(users.id, testBuyerGW_Id));
    await db.delete(users).where(eq(users.id, testBuyerNoDoc_Id));
    await db.delete(users).where(eq(users.id, testBuyerB_Id));

    console.log('🧹 [SANDBOX ONLY] Cleanup dos dados locais concluído.');
    console.log('   Nota: Os objetos remotos (Customers / Cobranças) criados no Asaas Sandbox permanecem no ambiente Sandbox e não foram excluídos automaticamente.\n');

    console.log('====================================================');
    console.log('ASAAS SANDBOX HARDENED PIX SUITE: ALL PASSED');
    console.log('====================================================\n');
  } catch (err: any) {
    console.error('❌ TESTE PIX ASAAS HARDENED FALHOU:', err);
    process.exit(1);
  } finally {
    await getDbPool()?.end();
  }
}

runAsaasPixTests();
