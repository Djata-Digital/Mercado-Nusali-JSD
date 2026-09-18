/**
 * FASE M1-D12 — regressão do fix "RELEASE_SELLER gravando bruto em vez de
 * líquido" em PaymentService.releaseEscrowForOrder (paymentService.ts).
 *
 * ANTES do fix: escrow_transactions (type='RELEASE_SELLER').amount = esc.amount
 * (o bruto retido, orders.totalAmount) — divergente de wallet_transactions
 * (type='escrow_release').amount, que sempre usou corretamente releaseAmount
 * (= orders.sellerNetAmount). DEPOIS do fix: os dois ledgers concordam.
 *
 * Cobertura (numerada conforme o pedido):
 *  1) HOLD.amount continua bruto (27.00) — NUNCA alterado por este fix.
 *  2) orders.sellerNetAmount = 10.80 (autoritativo).
 *  3) RELEASE_SELLER.amount = 10.80 após release (o fix em si).
 *  4) wallet_transactions (escrow_release).amount = 10.80 (não afetado, prova de não-regressão).
 *  5) exatamente 1 RELEASE_SELLER e 1 wallet_transaction de release.
 *  6) 2ª tentativa é idempotente (nenhuma duplicata, saldo inalterado).
 *  7) multi-seller: liberar A nunca libera B (sibling held, 0 releases).
 *  8) caminho BUYER_CONFIRMATION (finalizeDelivery source='BUYER').
 *  9) caminho AUTO (finalizeDelivery source='AUTO' — mesmo writer do
 *     escrowAutoReleaseService.ts) produz a MESMA semântica correta.
 * 10) REFUND_BUYER não é afetado pelo fix (função diferente, não tocada).
 * 11) disputa ativa continua bloqueando release (0 RELEASE_SELLER).
 *
 * Docker isolado, SSL, chain real 0000..0023, multiSellerCheckoutEnabled=
 * true SOMENTE neste banco descartável. Provider Asaas mockado — nenhuma
 * chamada de rede real.
 */
import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';

const testDbUrl = assertLedgerTestDatabaseGuard();
process.env.DATABASE_URL = testDbUrl;
process.env.ASAAS_WEBHOOK_AUTH_TOKEN = 'd12_fake_webhook_token';
process.env.ASAAS_API_KEY = '$aact_hmlg_D12_FAKE_KEY';
process.env.ASAAS_ENVIRONMENT = 'sandbox';
process.env.ASAAS_BASE_URL = 'https://api-sandbox.asaas.com/v3';

import 'dotenv/config';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import {
  users, sellers, sellerProfiles, stores, categories, addresses, carts, cartItems, countries,
  orders, purchaseGroups, shippingRates, platformSettings, payments,
  escrowAccounts, escrowTransactions, wallets, walletTransactions,
} from '../src/db/schema.js';
import { ProductCreationService } from '../src/server/modules/catalog/productCreationService.js';
import { OrderService } from '../src/server/modules/orders/orderService.js';
import { PaymentService } from '../src/server/modules/payments/paymentService.js';
import { AsaasWebhookService } from '../src/server/modules/payments/asaasWebhookService.js';
import { AsaasPaymentProvider } from '../src/server/modules/payments/providers/asaasPaymentProvider.js';
import { createBuyerDispute, resolveDispute } from '../src/server/modules/payments/refundService.js';
import { resetDbPool } from '../src/db/index.js';

const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false } });
const db = drizzle(pool, { schema });
const TOKEN = process.env.ASAAS_WEBHOOK_AUTH_TOKEN!;

let passed = 0, total = 0;
function report(label: string, ok: boolean, detail?: any) {
  total++; if (ok) passed++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${detail !== undefined ? ' -> ' + JSON.stringify(detail) : ''}`);
}
let seq = 0;
const uid = (p: string) => `${p}_m1d12_${Date.now()}_${++seq}_${Math.random().toString(36).slice(2, 6)}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

(AsaasPaymentProvider.prototype as any).initiatePurchaseGroupPayment = async function (req: any) {
  return { outcome: 'succeeded', transactionRef: `asaas_${req.localPaymentId}`, qrCodeUrl: 'data:image/png;base64,MOCK', pixCopiaECola: '00020101MOCK', rawResponse: { id: `asaas_${req.localPaymentId}` } };
};
(globalThis as any).fetch = async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });

async function seed() {
  await db.insert(countries).values([{ id: 'BR', code: 'BR', name: 'Brasil', flag: '🇧🇷', currency: 'BRL', currencySymbol: 'R$', phonePrefix: '+55', isActive: true, createdAt: new Date() }]).onConflictDoNothing();
  await db.insert(shippingRates).values({ id: uid('rate'), originCountry: 'BR', destinationCountry: 'BR', minWeightKg: '0.000', maxWeightKg: '999.000', price: '15.00', currency: 'BRL', estimatedMinDays: 2, estimatedMaxDays: 5, serviceType: 'standard', isActive: true, createdAt: new Date(), updatedAt: new Date() });
}
async function makeUser(role: string) {
  const id = uid('usr');
  await db.insert(users).values({ id, email: `${id}@t.test`, passwordHash: 'x', fullName: `U ${id}`, phone: '', role, countryCode: 'BR', kycStatus: 'verified', riskScore: 'baixo', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date() });
  return id;
}
async function makeSellerFull(label: string) {
  const userId = await makeUser('SELLER');
  const sellerId = uid('sel');
  await db.insert(sellers).values({ id: sellerId, userId, companyName: `Co ${label}`, tradingName: `Loja ${label}`, taxId: `T${label}`, phone: '0', countryCode: 'BR', status: 'active', commissionRate: '10.00' as any, createdAt: new Date(), updatedAt: new Date() });
  await db.insert(sellerProfiles).values({ id: uid('sp'), sellerId, verifiedAt: new Date(), createdAt: new Date(), updatedAt: new Date() });
  await db.insert(wallets).values({ id: uid('wal'), userId, balance: '0.00', currency: 'BRL', status: 'active', createdAt: new Date(), updatedAt: new Date() });
  const storeId = uid('str');
  await db.insert(stores).values({ id: storeId, sellerId, name: `Store ${label}`, slug: storeId, countryCode: 'BR', status: 'active', createdAt: new Date(), updatedAt: new Date() });
  const catId = uid('cat');
  await db.insert(categories).values({ id: catId, name: 'Cat', slug: catId, isActive: true, commissionRate: null as any, createdAt: new Date() });
  return { userId, sellerId, storeId, catId };
}
async function makeProduct(sellerUserId: string, storeId: string, catId: string, title: string, price: number) {
  return ProductCreationService.createProduct(sellerUserId, { title, price, categoryId: catId, image: `https://x/${title}.png`, storeId, stock: 100, weightKg: 1.0, dimensionsCm: { length: 10, width: 10, height: 10 } } as any, db);
}
async function newBuyer() {
  const buyer = await makeUser('BUYER');
  const addr = uid('addr');
  await db.insert(addresses).values({ id: addr, userId: buyer, recipientName: 'T', street: 'R', number: '1', city: 'C', state: 'ST', countryCode: 'BR', phone: '0', isDefault: true, addressType: 'shipping', createdAt: new Date(), updatedAt: new Date() });
  return { buyer, addr };
}
async function addToCart(buyerId: string, productId: string, unitPrice: string) {
  let cart = (await db.select().from(carts).where(eq(carts.userId, buyerId)).limit(1))[0];
  if (!cart) {
    const cartId = uid('cart');
    await db.insert(carts).values({ id: cartId, userId: buyerId, currency: 'BRL', countryCode: 'BR', createdAt: new Date(), updatedAt: new Date() });
    cart = (await db.select().from(carts).where(eq(carts.id, cartId)).limit(1))[0];
  }
  await db.insert(cartItems).values({ id: uid('ci'), cartId: cart.id, productId, quantity: 1, unitPrice, createdAt: new Date(), updatedAt: new Date() });
}
async function setFlag(v: boolean) {
  await db.insert(platformSettings).values({ key: 'multiSellerCheckoutEnabled', valueJson: v, updatedAt: new Date() }).onConflictDoUpdate({ target: platformSettings.key, set: { valueJson: v, updatedAt: new Date() } });
}
async function markDelivered(orderId: string, sellerId: string, buyerId: string) {
  const shipId = uid('shp');
  await db.insert(schema.shipments).values({ id: shipId, orderId, sellerId, buyerId, fulfillmentMode: 'SELLER_FULFILLMENT', trackingNumber: uid('TRK'), status: 'DELIVERED', originCountry: 'BR', destinationCountry: 'BR', deliveredAt: new Date(Date.now() - 3 * 3600 * 1000), createdAt: new Date(), updatedAt: new Date() });
  await db.insert(schema.proofOfDelivery).values({ id: uid('pod'), shipmentId: shipId, receivedBy: 'Transportadora', deliveredAt: new Date(Date.now() - 3 * 3600 * 1000), proofType: 'OPERATOR_CONFIRMATION', createdAt: new Date() });
}
async function webhookGroupPaid(groupId: string, value: number) {
  return AsaasWebhookService.processWebhook(TOKEN, { id: uid('evt'), event: 'PAYMENT_RECEIVED', payment: { id: uid('asaas_pay'), value, status: 'RECEIVED', externalReference: groupId } });
}
async function runGroupCheckout(buyer: string, addr: string, items: { productId: string; price: string }[]) {
  for (const it of items) await addToCart(buyer, it.productId, it.price);
  const created: any = await OrderService.createOrderFromCart({ userId: buyer, addressId: addr, paymentMethod: 'pix', currency: 'BRL', countryCode: 'BR' } as any, db);
  const groupId = created.purchaseGroup.id;
  await PaymentService.initiatePurchaseGroupPayment({ purchaseGroupId: groupId, buyerId: buyer, method: 'pix', provider: 'asaas' } as any);
  const groupRow = (await db.select().from(purchaseGroups).where(eq(purchaseGroups.id, groupId)))[0];
  await webhookGroupPaid(groupId, Number(groupRow.totalAmount));
  const children = await db.select().from(orders).where(eq(orders.purchaseGroupId, groupId));
  return { groupId, children };
}
/**
 * Checkout LEGACY (flag desligada só durante a criação, restaurada em
 * seguida) — usado SOMENTE no cenário 10 (REFUND_BUYER), que precisa de um
 * order SEM purchase_group_id para exercitar o caminho `processRefund`
 * síncrono de refundService.ts (o caminho de group child é assíncrono/
 * provider-managed e não é o alvo desta regressão — o alvo é provar que a
 * função processRefund, que este fix NUNCA tocou, continua gravando
 * REFUND_BUYER.amount = valor do refund, não releaseAmount). Pagamento e
 * escrow são fixture crua (mesmo padrão já usado nas provas de migration
 * legacy desta branch) — não exercita o provider Asaas real de propósito,
 * pois o que está sob teste é o ledger, não o checkout.
 */
async function runLegacyCheckout(buyer: string, addr: string, sellerObj: { sellerId: string }, productId: string, price: string) {
  await setFlag(false);
  await addToCart(buyer, productId, price);
  const created: any = await OrderService.createOrderFromCart({ userId: buyer, addressId: addr, paymentMethod: 'pix', currency: 'BRL', countryCode: 'BR' } as any, db);
  await setFlag(true);
  if (created.mode !== 'legacy') throw new Error(`runLegacyCheckout: esperado mode=legacy, veio ${created.mode}`);

  const orderId = created.id;
  await db.insert(payments).values({
    id: uid('pay'), orderId, buyerId: buyer, amount: String(created.totalAmount), currency: 'BRL',
    provider: 'asaas', method: 'pix', status: 'paid', settlementRole: 'primary',
    transactionRef: uid('asaas_leg'), idempotencyKey: uid('idem'), createdAt: new Date(), updatedAt: new Date(),
  });
  await db.update(orders).set({ paymentStatus: 'paid' }).where(eq(orders.id, orderId));

  const escrowId = uid('esc');
  await db.insert(escrowAccounts).values({ id: escrowId, orderId, buyerId: buyer, sellerId: sellerObj.sellerId, amount: String(created.totalAmount), currency: 'BRL', status: 'held', createdAt: new Date(), updatedAt: new Date() });
  await db.insert(escrowTransactions).values({ id: uid('etx'), escrowAccountId: escrowId, type: 'HOLD', amount: String(created.totalAmount), currency: 'BRL', reason: 'fixture legacy (M1-D12)', createdAt: new Date() });

  return { ...created, id: orderId };
}
async function escrowFor(orderId: string) {
  return (await db.select().from(escrowAccounts).where(eq(escrowAccounts.orderId, orderId)))[0];
}
async function escrowTxByType(escrowAccountId: string, type: string) {
  return db.select().from(escrowTransactions).where(and(eq(escrowTransactions.escrowAccountId, escrowAccountId), eq(escrowTransactions.type, type)));
}
async function walletTxByOrder(walletId: string, orderId: string) {
  return db.select().from(walletTransactions).where(and(eq(walletTransactions.walletId, walletId), eq(walletTransactions.idempotencyKey, `escrow_release:${orderId}`)));
}
async function walletOf(userId: string) {
  return (await db.select().from(wallets).where(and(eq(wallets.userId, userId), eq(wallets.currency, 'BRL'))))[0];
}

async function main() {
  console.log('=== M1-D12 — regressão RELEASE_SELLER.amount = líquido (nunca bruto) ===\n');
  await seed();
  await setFlag(true);

  const A = await makeSellerFull('Alfa');
  const B = await makeSellerFull('Beta');
  const C = await makeSellerFull('Gama');
  const D = await makeSellerFull('Delta');
  const E = await makeSellerFull('Epsilon');
  const pA = await makeProduct(A.userId, A.storeId, A.catId, 'ProdutoA', 12);
  const pB = await makeProduct(B.userId, B.storeId, B.catId, 'ProdutoB', 18);
  const pC = await makeProduct(C.userId, C.storeId, C.catId, 'ProdutoC', 12);
  const pD = await makeProduct(D.userId, D.storeId, D.catId, 'ProdutoD', 12);
  const pE = await makeProduct(E.userId, E.storeId, E.catId, 'ProdutoE', 12);

  // ==========================================================================
  // CENÁRIO 1 (itens 1,2,3,4,5,6,7,8) — 2 sellers, release de A via BUYER.
  // ==========================================================================
  const { buyer: buyer1, addr: addr1 } = await newBuyer();
  const { children: children1 } = await runGroupCheckout(buyer1, addr1, [
    { productId: pA.id, price: '12.00' },
    { productId: pB.id, price: '18.00' },
  ]);
  const childA = children1.find((o: any) => o.sellerId === A.sellerId)!;
  const childB = children1.find((o: any) => o.sellerId === B.sellerId)!;

  const escA = await escrowFor(childA.id);
  const holdA = await escrowTxByType(escA.id, 'HOLD');
  report('1. HOLD.amount = 27.00 (bruto, nunca alterado por este fix)', holdA.length === 1 && Number(holdA[0].amount) === 27.00, { amount: holdA[0]?.amount });
  report('2. orders.sellerNetAmount (child A) = 10.80', Number(childA.sellerNetAmount) === 10.80, { sellerNetAmount: childA.sellerNetAmount });

  await markDelivered(childA.id, A.sellerId, buyer1);
  const releaseRes = await PaymentService.finalizeDelivery(childA.id, { source: 'BUYER', performedBy: buyer1, buyerDisplayName: 'Comprador Teste 1' });
  report('8. finalizeDelivery(source=BUYER) retorna success=true', releaseRes.success === true);

  const relA = await escrowTxByType(escA.id, 'RELEASE_SELLER');
  report('3. RELEASE_SELLER.amount = 10.80 (líquido — O FIX; nunca 27.00 bruto)', relA.length === 1 && Number(relA[0].amount) === 10.80, { amount: relA[0]?.amount });

  const walletA = await walletOf(A.userId);
  const wtxA = await walletTxByOrder(walletA.id, childA.id);
  report('4. wallet_transactions (escrow_release).amount = 10.80 (não afetado — prova de não-regressão)', wtxA.length === 1 && Number(wtxA[0].amount) === 10.80, { amount: wtxA[0]?.amount });
  report('5. exatamente 1 RELEASE_SELLER e 1 wallet_transaction de release', relA.length === 1 && wtxA.length === 1);

  // 6) idempotência — 2ª tentativa (via finalizeDelivery de novo, o caminho real do buyer clicando 2x).
  const walBeforeRetry = Number((await walletOf(A.userId)).balance);
  let retryOutcome: any = null;
  try { retryOutcome = await PaymentService.finalizeDelivery(childA.id, { source: 'BUYER', performedBy: buyer1, buyerDisplayName: 'Comprador Teste 1' }); } catch (e: any) { retryOutcome = { error: e.message }; }
  const relA2 = await escrowTxByType(escA.id, 'RELEASE_SELLER');
  const wtxA2 = await walletTxByOrder(walletA.id, childA.id);
  const walAfterRetry = Number((await walletOf(A.userId)).balance);
  report('6. 2ª tentativa: idempotente (alreadyReleased), nenhuma 2ª RELEASE_SELLER/wallet_tx, saldo inalterado', relA2.length === 1 && wtxA2.length === 1 && walAfterRetry === walBeforeRetry, { retryOutcome, relA2: relA2.length, wtxA2: wtxA2.length, walBeforeRetry, walAfterRetry });

  // 7) sibling B — nunca tocado pela liberação de A.
  const escB = await escrowFor(childB.id);
  const relB = await escrowTxByType(escB.id, 'RELEASE_SELLER');
  const walletB = await walletOf(B.userId);
  const wtxB = walletB ? await walletTxByOrder(walletB.id, childB.id) : [];
  report('7. sibling B: escrow continua held', escB.status === 'held', { status: escB.status });
  report('7b. sibling B: RELEASE_SELLER count = 0', relB.length === 0);
  report('7c. sibling B: wallet release count = 0 (saldo = 0.00)', wtxB.length === 0 && Number(walletB?.balance ?? -1) === 0, { balance: walletB?.balance });

  // ==========================================================================
  // CENÁRIO 2 (item 9) — caminho AUTO, mesmo writer que escrowAutoReleaseService usa.
  // ==========================================================================
  const { buyer: buyer2, addr: addr2 } = await newBuyer();
  const { children: children2 } = await runGroupCheckout(buyer2, addr2, [{ productId: pC.id, price: '12.00' }]);
  const childC = children2[0];
  await markDelivered(childC.id, C.sellerId, buyer2);
  // AUTO exige escrow_accounts.releaseEligibleAt NOT NULL e <= NOW() — em
  // produção isso é calculado por shipmentService.ts na confirmação real de
  // entrega; aqui fixamos diretamente (fixture) porque o alvo desta
  // regressão é o WRITER do release, não o cálculo da janela de proteção
  // (já coberto por outras suítes).
  await db.update(escrowAccounts).set({ releaseEligibleAt: new Date(Date.now() - 3600 * 1000) }).where(eq(escrowAccounts.orderId, childC.id));
  const autoRes = await PaymentService.finalizeDelivery(childC.id, { source: 'AUTO' });
  report('9a. finalizeDelivery(source=AUTO) retorna success=true (mesmo writer do escrowAutoReleaseService.ts)', autoRes.success === true);
  const escC = await escrowFor(childC.id);
  const relC = await escrowTxByType(escC.id, 'RELEASE_SELLER');
  const walletC = await walletOf(C.userId);
  const wtxC = await walletTxByOrder(walletC.id, childC.id);
  report('9b. AUTO: RELEASE_SELLER.amount = sellerNetAmount (10.80), MESMA semântica do BUYER_CONFIRMATION', relC.length === 1 && Number(relC[0].amount) === Number(childC.sellerNetAmount) && Number(relC[0].amount) === 10.80, { amount: relC[0]?.amount, sellerNetAmount: childC.sellerNetAmount });
  report('9c. AUTO: wallet_transactions.amount = 10.80 (igual ao RELEASE_SELLER — ledgers reconciliam)', wtxC.length === 1 && Number(wtxC[0].amount) === 10.80);

  // ==========================================================================
  // CENÁRIO 3 (item 10) — REFUND_BUYER (pós-release) NÃO afetado pelo fix.
  // Função diferente (processRefund/refundService.ts) — não tocada nesta fase.
  // ==========================================================================
  const { buyer: buyer3, addr: addr3 } = await newBuyer();
  const childD: any = await runLegacyCheckout(buyer3, addr3, D, pD.id, '12.00');
  await markDelivered(childD.id, D.sellerId, buyer3);
  await PaymentService.finalizeDelivery(childD.id, { source: 'BUYER', performedBy: buyer3, buyerDisplayName: 'Comprador Teste 3' });
  const walletDAfterRelease = Number((await walletOf(D.userId)).balance);
  report('10a. pré-condição: Seller D recebeu 10.80 no release (para provar o débito proporcional depois)', walletDAfterRelease === 10.80, { walletDAfterRelease });

  const disputeD: any = await createBuyerDispute({ orderId: childD.id, buyerId: buyer3, description: 'produto com defeito', reason: 'damaged', claimAmount: 27 } as any);
  const resolveD: any = await resolveDispute(disputeD.id, 'refund_buyer', {});
  report('10b. resolveDispute executou em mode=legacy (order sem purchase_group_id, processRefund síncrono)', resolveD.success === true && resolveD.mode === 'legacy', { mode: resolveD.mode });

  const escD = await escrowFor(childD.id);
  const refundD = await db.select().from(escrowTransactions).where(and(eq(escrowTransactions.escrowAccountId, escD.id), eq(escrowTransactions.type, 'REFUND_BUYER')));
  const relDAfterRefund = await escrowTxByType(escD.id, 'RELEASE_SELLER');
  report('10c. REFUND_BUYER.amount = 27.00 (valor do refund pedido, NUNCA releaseAmount/sellerNetAmount — writer diferente, não tocado)', refundD.length === 1 && Number(refundD[0].amount) === 27.00, { amount: refundD[0]?.amount });
  report('10d. RELEASE_SELLER de D continua exatamente 1 (o refund não cria nem duplica RELEASE_SELLER)', relDAfterRefund.length === 1 && Number(relDAfterRefund[0].amount) === 10.80);
  const walletDAfterRefund = Number((await walletOf(D.userId)).balance);
  report('10e. wallet Seller D debitada proporcionalmente (10.80 - 10.80 = 0.00, refund total)', walletDAfterRefund === 0.00, { walletDAfterRefund });

  // ==========================================================================
  // CENÁRIO 4 (item 11) — disputa ATIVA bloqueia release (regressão do blocker).
  // ==========================================================================
  const { buyer: buyer4, addr: addr4 } = await newBuyer();
  const { children: children4 } = await runGroupCheckout(buyer4, addr4, [{ productId: pE.id, price: '12.00' }]);
  const childE = children4[0];
  await markDelivered(childE.id, E.sellerId, buyer4);
  await createBuyerDispute({ orderId: childE.id, buyerId: buyer4, description: 'não recebi', reason: 'not_received', claimAmount: 27 } as any);
  let blockedCode = '';
  try {
    await PaymentService.finalizeDelivery(childE.id, { source: 'BUYER', performedBy: buyer4, buyerDisplayName: 'Comprador Teste 4' });
  } catch (e: any) {
    blockedCode = String(e.message || '');
  }
  report('11a. disputa ativa bloqueia release (ESCROW_BLOCKED_BY_ACTIVE_DISPUTE)', blockedCode.includes('ESCROW_BLOCKED_BY_ACTIVE_DISPUTE'), { blockedCode: blockedCode.slice(0, 80) });
  const escE = await escrowFor(childE.id);
  const relE = await escrowTxByType(escE.id, 'RELEASE_SELLER');
  report('11b. 0 RELEASE_SELLER quando bloqueado por disputa; escrow continua held', relE.length === 0 && escE.status === 'held', { relE: relE.length, status: escE.status });

  console.log(`\n${passed}/${total} testes passaram.`);
  await pool.end();
  resetDbPool();
  if (passed !== total) process.exitCode = 1;
  process.exit(process.exitCode ?? 0);
}

main().catch(async (err) => {
  console.error('FALHA FATAL:', err);
  try { await pool.end(); } catch {}
  process.exit(1);
});
