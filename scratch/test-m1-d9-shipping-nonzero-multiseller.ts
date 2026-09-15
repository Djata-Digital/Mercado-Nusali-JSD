/**
 * FASE M1-D9 — Regressão específica: frete > 0 no checkout multi-seller.
 *
 * Motivação (diagnóstico "R$45 -> R$60" em staging): test-m1-d4-e2e-
 * multiseller.ts sempre usou shipping_rates.price = '0.00', então a
 * divergência frontend-vs-backend (frete calculado 1x para o carrinho
 * inteiro vs. 1x POR VENDEDOR, somado) ficava matematicamente invisível
 * (1×0 == N×0). Este arquivo NÃO altera o fixture do D4 (script novo e
 * isolado, para não fragilizar os 88 asserts existentes) — usa uma tarifa
 * de frete FLAT de R$15,00 (BR->BR, 0-999kg) e prova, no BACKEND (a
 * autoridade financeira — nunca o frontend), que:
 *
 *   1 seller  -> total = subtotal + 1x frete
 *   2 sellers -> group.totalAmount = SUM(child.totalAmount), cada child com
 *                SEU PRÓPRIO frete cheio (nunca dividido)
 *   3 sellers -> shipping total = SOMA das 3 entregas independentes
 *
 * Docker isolado, SSL, chain real 0000..0023, multiSellerCheckoutEnabled=
 * true SOMENTE neste banco descartável. Provider Asaas mockado (mesmo
 * padrão de test-m1-d4-e2e-multiseller.ts) — nenhuma chamada de rede real.
 */
import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';

const testDbUrl = assertLedgerTestDatabaseGuard();
process.env.DATABASE_URL = testDbUrl;
process.env.ASAAS_WEBHOOK_AUTH_TOKEN = 'd9_fake_webhook_token';
process.env.ASAAS_API_KEY = '$aact_hmlg_D9_FAKE_KEY';
process.env.ASAAS_ENVIRONMENT = 'sandbox';
process.env.ASAAS_BASE_URL = 'https://api-sandbox.asaas.com/v3';

import 'dotenv/config';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import {
  users, sellers, sellerProfiles, stores, categories, addresses, carts, cartItems, countries,
  orders, purchaseGroups, shippingRates, platformSettings, payments, paymentAllocations,
} from '../src/db/schema.js';
import { ProductCreationService } from '../src/server/modules/catalog/productCreationService.js';
import { OrderService } from '../src/server/modules/orders/orderService.js';
import { PaymentService } from '../src/server/modules/payments/paymentService.js';
import { AsaasWebhookService } from '../src/server/modules/payments/asaasWebhookService.js';
import { AsaasPaymentProvider } from '../src/server/modules/payments/providers/asaasPaymentProvider.js';
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
const uid = (p: string) => `${p}_m1d9_${Date.now()}_${++seq}_${Math.random().toString(36).slice(2, 6)}`;

// Mesmo padrão de mock do provider já usado em test-m1-d4 — nunca toca rede real.
(AsaasPaymentProvider.prototype as any).initiatePurchaseGroupPayment = async function (req: any) {
  return { outcome: 'succeeded', transactionRef: `asaas_${req.localPaymentId}`, qrCodeUrl: 'data:image/png;base64,MOCK', pixCopiaECola: '00020101MOCK', rawResponse: { id: `asaas_${req.localPaymentId}` } };
};
(globalThis as any).fetch = async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });

const SHIPPING_FEE = 15.00; // R$15,00 flat — o mesmo valor do bug reportado em staging

async function seed() {
  await db.insert(countries).values([{ id: 'BR', code: 'BR', name: 'Brasil', flag: '🇧🇷', currency: 'BRL', currencySymbol: 'R$', phonePrefix: '+55', isActive: true, createdAt: new Date() }]).onConflictDoNothing();
  // Frete FLAT != 0.00 (diferente de test-m1-d4, de propósito) — cobre
  // qualquer peso de 0 a 999kg, então cada vendedor sozinho já bate nela.
  await db.insert(shippingRates).values({ id: uid('rate'), originCountry: 'BR', destinationCountry: 'BR', minWeightKg: '0.000', maxWeightKg: '999.000', price: String(SHIPPING_FEE.toFixed(2)), currency: 'BRL', estimatedMinDays: 2, estimatedMaxDays: 5, serviceType: 'standard', isActive: true, createdAt: new Date(), updatedAt: new Date() });
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
  await db.insert(schema.wallets).values({ id: uid('wal'), userId, balance: '0.00', currency: 'BRL', status: 'active', createdAt: new Date(), updatedAt: new Date() });
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
async function addToCart(buyerId: string, productId: string, unitPrice: string, qty = 1) {
  let cart = (await db.select().from(carts).where(eq(carts.userId, buyerId)).limit(1))[0];
  if (!cart) {
    const cartId = uid('cart');
    await db.insert(carts).values({ id: cartId, userId: buyerId, currency: 'BRL', countryCode: 'BR', createdAt: new Date(), updatedAt: new Date() });
    cart = (await db.select().from(carts).where(eq(carts.id, cartId)).limit(1))[0];
  }
  await db.insert(cartItems).values({ id: uid('ci'), cartId: cart.id, productId, quantity: qty, unitPrice, createdAt: new Date(), updatedAt: new Date() });
}
async function setFlag(v: boolean) {
  await db.insert(platformSettings).values({ key: 'multiSellerCheckoutEnabled', valueJson: v, updatedAt: new Date() }).onConflictDoUpdate({ target: platformSettings.key, set: { valueJson: v, updatedAt: new Date() } });
}
async function webhookGroupPaid(groupId: string, value: number) {
  return AsaasWebhookService.processWebhook(TOKEN, {
    id: uid('evt'),
    event: 'PAYMENT_RECEIVED',
    payment: { id: uid('asaas_pay'), value, status: 'RECEIVED', externalReference: groupId },
  });
}
async function runGroupCheckout(buyer: string, addr: string, items: { productId: string; price: string }[]) {
  for (const it of items) await addToCart(buyer, it.productId, it.price, 1);
  const created: any = await OrderService.createOrderFromCart({ userId: buyer, addressId: addr, paymentMethod: 'pix', currency: 'BRL', countryCode: 'BR' } as any, db);
  return created;
}
async function runSingleSellerCheckout(buyer: string, addr: string, items: { productId: string; price: string }[]) {
  for (const it of items) await addToCart(buyer, it.productId, it.price, 1);
  const created: any = await OrderService.createOrderFromCart({ userId: buyer, addressId: addr, paymentMethod: 'pix', currency: 'BRL', countryCode: 'BR' } as any, db);
  return created;
}
const round2 = (n: number) => Math.round(n * 100) / 100;

async function main() {
  console.log(`=== M1-D9 — regressão de frete > 0 no multi-seller (R$${SHIPPING_FEE.toFixed(2)} flat) ===\n`);
  await seed();

  const A = await makeSellerFull('Alfa');
  const B = await makeSellerFull('Beta');
  const C = await makeSellerFull('Gama');
  const pA = await makeProduct(A.userId, A.storeId, A.catId, 'ProdutoStagingA', 12);
  const pB = await makeProduct(B.userId, B.storeId, B.catId, 'ProdutoStagingB', 18);
  const pC = await makeProduct(C.userId, C.storeId, C.catId, 'ProdutoStagingC', 20);

  // ==========================================================================
  // D9.1 — 1 SELLER, flag OFF (caminho legado) — frete cobrado 1 única vez.
  //   produto 12,00 + frete 15,00 = 27,00
  // ==========================================================================
  await setFlag(false);
  {
    const { buyer, addr } = await newBuyer();
    const created: any = await runSingleSellerCheckout(buyer, addr, [{ productId: pA.id, price: '12.00' }]);
    report('D9.1 — 1 seller (legacy): mode=legacy', created.mode === 'legacy', { mode: created.mode });
    report('D9.1 — 1 seller: subtotal=12.00', Number(created.subtotal) === 12);
    report('D9.1 — 1 seller: shippingFee=15.00 (1x, nunca 0 nem duplicado)', round2(Number(created.shippingFee)) === SHIPPING_FEE, { shippingFee: created.shippingFee });
    report('D9.1 — 1 seller: total=27.00 (12 produto + 15 frete)', round2(Number(created.totalAmount)) === 27.00, { total: created.totalAmount });
  }

  // ==========================================================================
  // D9.2 — 1 SELLER, flag ON (caminho novo, mas 1 vendedor só) — MESMO
  //   resultado do legado: purchase_group de 1 child, frete 1x.
  // ==========================================================================
  await setFlag(true);
  {
    const { buyer, addr } = await newBuyer();
    const created: any = await runGroupCheckout(buyer, addr, [{ productId: pA.id, price: '12.00' }]);
    report('D9.2 — 1 seller (flag ON): mode=purchase_group', created.mode === 'purchase_group', { mode: created.mode });
    const grp = (await db.select().from(purchaseGroups).where(eq(purchaseGroups.id, created.purchaseGroup.id)))[0];
    report('D9.2 — 1 seller: purchase_group.totalAmount=27.00', round2(Number(grp.totalAmount)) === 27.00, { total: grp.totalAmount });
    const child = created.orders[0];
    report('D9.2 — 1 seller: child.shippingFee=15.00, child.totalAmount=27.00', round2(Number(child.shippingFee)) === SHIPPING_FEE && round2(Number(child.totalAmount)) === 27.00);
  }

  // ==========================================================================
  // D9.3 — 2 SELLERS — o cenário exato do bug de staging.
  //   A: subtotal 12,00 + frete 15,00 = 27,00
  //   B: subtotal 18,00 + frete 15,00 = 33,00
  //   group.totalAmount = 60,00 (NUNCA 45,00 — frete não é dividido/único)
  //   payment primary.amount = 60,00 ; SUM(allocations) = 60,00
  // ==========================================================================
  {
    const { buyer, addr } = await newBuyer();
    const created: any = await runGroupCheckout(buyer, addr, [
      { productId: pA.id, price: '12.00' },
      { productId: pB.id, price: '18.00' },
    ]);
    const gid = created.purchaseGroup.id;
    const grp = (await db.select().from(purchaseGroups).where(eq(purchaseGroups.id, gid)))[0];
    const children = await db.select().from(orders).where(eq(orders.purchaseGroupId, gid));
    const childA = children.find((o) => o.sellerId === A.sellerId)!;
    const childB = children.find((o) => o.sellerId === B.sellerId)!;

    report('D9.3 — 2 sellers: exatamente 2 child orders', children.length === 2);
    report('D9.3 — child A: subtotal=12.00, shippingFee=15.00, total=27.00', Number(childA.subtotal) === 12 && round2(Number(childA.shippingFee)) === SHIPPING_FEE && round2(Number(childA.totalAmount)) === 27.00, { subtotal: childA.subtotal, shippingFee: childA.shippingFee, total: childA.totalAmount });
    report('D9.3 — child B: subtotal=18.00, shippingFee=15.00, total=33.00', Number(childB.subtotal) === 18 && round2(Number(childB.shippingFee)) === SHIPPING_FEE && round2(Number(childB.totalAmount)) === 33.00, { subtotal: childB.subtotal, shippingFee: childB.shippingFee, total: childB.totalAmount });
    report('D9.3 — purchase_group.totalAmount = 60.00 (30 produtos + 30 frete — NUNCA 45.00)', round2(Number(grp.totalAmount)) === 60.00, { total: grp.totalAmount });
    report('D9.3 — SUM(child.shippingFee) = 30.00 (2x15, nunca 15 único)', round2(Number(childA.shippingFee) + Number(childB.shippingFee)) === 30.00);

    // paga o group inteiro e confirma via webhook (mesmo caminho de D4)
    await PaymentService.initiatePurchaseGroupPayment({ purchaseGroupId: gid, buyerId: buyer, method: 'pix', provider: 'asaas' } as any);
    await webhookGroupPaid(gid, Number(grp.totalAmount));

    const primary = (await db.select().from(payments).where(and(eq(payments.purchaseGroupId, gid), eq(payments.settlementRole, 'primary'))))[0];
    report('D9.3 — payment primary.amount = 60.00 (o mesmo valor que vai ao Asaas)', round2(Number(primary.amount)) === 60.00, { amount: primary.amount });

    const allocs = await db.select().from(paymentAllocations).where(eq(paymentAllocations.purchaseGroupId, gid));
    const allocSum = allocs.reduce((s, a) => s + Number(a.amount), 0);
    report('D9.3 — SUM(payment_allocations.amount) = 60.00', round2(allocSum) === 60.00, { allocSum, n: allocs.length });
    report('D9.3 — 1 allocation por child (2 total)', allocs.length === 2);
  }

  // ==========================================================================
  // D9.4 — 3 SELLERS — shipping total = SOMA das 3 entregas independentes.
  //   A:12+15=27  B:18+15=33  C:20+15=35  produtos=50  frete=45  total=95
  // ==========================================================================
  {
    const { buyer, addr } = await newBuyer();
    const created: any = await runGroupCheckout(buyer, addr, [
      { productId: pA.id, price: '12.00' },
      { productId: pB.id, price: '18.00' },
      { productId: pC.id, price: '20.00' },
    ]);
    const gid = created.purchaseGroup.id;
    const grp = (await db.select().from(purchaseGroups).where(eq(purchaseGroups.id, gid)))[0];
    const children = await db.select().from(orders).where(eq(orders.purchaseGroupId, gid));
    report('D9.4 — 3 sellers: exatamente 3 child orders', children.length === 3);

    const shippingSum = round2(children.reduce((s, o) => s + Number(o.shippingFee), 0));
    const subtotalSum = round2(children.reduce((s, o) => s + Number(o.subtotal), 0));
    report('D9.4 — SUM(shippingFee) = 45.00 (3 x 15.00, uma entrega por vendedor)', shippingSum === 45.00, { shippingSum });
    report('D9.4 — SUM(subtotal) = 50.00 (12+18+20)', subtotalSum === 50.00, { subtotalSum });
    report('D9.4 — purchase_group.totalAmount = 95.00 (50 produtos + 45 frete)', round2(Number(grp.totalAmount)) === 95.00, { total: grp.totalAmount });
    report('D9.4 — group.totalAmount == SUM(child.totalAmount)', round2(Number(grp.totalAmount)) === round2(children.reduce((s, o) => s + Number(o.totalAmount), 0)));
  }

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
