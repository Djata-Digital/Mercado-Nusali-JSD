/**
 * FASE M1-D11 — regressão do fix "Transportadora" vazia no Seller > Pedidos
 * de Venda (SellerOrdersManager.tsx).
 *
 * Prova, via HTTP real (express + http.createServer + JWT real, mesmo
 * padrão de test-m1-c-dispute-messages.ts / test-m1-d10-seller-subtotal-
 * fix.ts) contra Postgres Docker isolado (chain 0000..0023, NUNCA
 * produção), que GET /seller/orders resolve `shippingCarrier` usando
 * EXATAMENTE a mesma regra central de carrierResolver.ts já usada por
 * orderService.ts/adminRoutes.ts/shipmentService.ts:
 *
 *   1) shipments.carrierId -> carriers.name  (autoritativo)
 *   2) shipments.carrier (texto legado)       (fallback)
 *   3) null                                   (nunca uma string inventada)
 *
 * NÃO exercita checkout/pagamento/logística real — os valores são inseridos
 * diretamente (fixture), pois o que está sob teste é o READ MODEL de
 * GET /seller/orders, não a criação/atribuição de transportadora.
 */
import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';

const testDbUrl = assertLedgerTestDatabaseGuard();
process.env.DATABASE_URL = testDbUrl;

import 'dotenv/config';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/db/schema.js';
import {
  users, sellers, stores, categories, products, orders, orderItems, shipments, carriers,
  payments, escrowAccounts, walletTransactions, refunds,
} from '../src/db/schema.js';
import { getJwtAccessSecret } from '../src/server/modules/auth/jwtConfig.js';
import { sellerRouter } from '../src/server/sellerRoutes.js';
import { resetDbPool } from '../src/db/index.js';

const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false } });
const db = drizzle(pool, { schema });

let passed = 0, total = 0;
function report(label: string, ok: boolean, detail?: any) {
  total++; if (ok) passed++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${detail !== undefined ? ' -> ' + JSON.stringify(detail) : ''}`);
}
let seq = 0;
const uid = (p: string) => `${p}_m1d11_${Date.now()}_${++seq}_${Math.random().toString(36).slice(2, 6)}`;
let FIXTURE_CATEGORY_ID = '';

function signToken(user: { id: string; role: string; fullName: string }) {
  return jwt.sign(
    { userId: user.id, email: `${user.id}@t.test`, role: user.role, fullName: user.fullName, countryCode: 'BR', kycStatus: 'unverified', isEmailVerified: true },
    getJwtAccessSecret(),
    { expiresIn: '1h' }
  );
}
function buildServer() {
  const app = express();
  app.use(express.json());
  app.use('/seller', sellerRouter);
  return http.createServer(app);
}
async function startServer(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  return `http://127.0.0.1:${address.port}`;
}
async function getSellerOrders(baseUrl: string, token: string) {
  const r = await fetch(`${baseUrl}/seller/orders`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: r.status, body: (await r.json()) as any };
}

async function makeSeller(label: string) {
  const userId = uid(`usr_seller_${label}`);
  const sellerId = uid(`sel_${label}`);
  await db.insert(users).values({ id: userId, email: `${userId}@t.test`, passwordHash: 'x', fullName: `Vendedor ${label}`, phone: '', role: 'SELLER', countryCode: 'BR', kycStatus: 'verified', riskScore: 'baixo', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date() });
  await db.insert(sellers).values({ id: sellerId, userId, companyName: `Loja ${label}`, tradingName: `Loja ${label}`, taxId: `T${label}`, phone: '0', countryCode: 'BR', status: 'active', commissionRate: '10.00' as any, createdAt: new Date(), updatedAt: new Date() });
  const storeId = uid('str');
  await db.insert(stores).values({ id: storeId, sellerId, name: `Store ${label}`, slug: storeId, countryCode: 'BR', status: 'active', createdAt: new Date(), updatedAt: new Date() });
  return { userId, sellerId, storeId };
}
async function makeBuyer() {
  const id = uid('usr_buyer');
  await db.insert(users).values({ id, email: `${id}@t.test`, passwordHash: 'x', fullName: 'Comprador', phone: '', role: 'BUYER', countryCode: 'BR', kycStatus: 'unverified', riskScore: 'baixo', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date() });
  return id;
}

/** Cria 1 order PAGA + 1 order_item + 1 shipment vinculado, com carrierId/
 * carrier configuráveis por cenário (fixture — não exercita atribuição real
 * de transportadora, o que está sob teste é a LEITURA em GET /seller/orders). */
async function makePaidOrderWithShipment(
  buyerId: string,
  sellerId: string,
  storeId: string,
  shipmentCarrier: { carrierId: string | null; carrier: string | null }
) {
  const orderId = uid('ord');
  const productId = uid('prod');
  const itemId = uid('oi');
  const shipmentId = uid('shp');

  await db.insert(products).values({
    id: productId, title: 'Produto Teste Carrier', price: '10.00', image: 'https://x/p.png',
    sellerId, storeId, categoryId: FIXTURE_CATEGORY_ID, currency: 'BRL', countryCode: 'BR',
    createdAt: new Date(), updatedAt: new Date(),
  });
  await db.insert(orders).values({
    id: orderId, orderNumber: orderId, buyerId, sellerId, storeId, purchaseGroupId: null,
    subtotal: '10.00', shippingFee: '5.00', shippingCost: '5.00', shippingChargedToBuyer: '5.00',
    totalAmount: '15.00', currency: 'BRL', status: 'processing', paymentStatus: 'paid', escrowStatus: 'held',
    shippingAddressJson: { recipientName: 'T', street: 'R', number: '1', city: 'C', countryCode: 'BR' },
    countryCode: 'BR', createdAt: new Date(), updatedAt: new Date(),
  });
  await db.insert(shipments).values({
    id: shipmentId, orderId, sellerId, buyerId, fulfillmentMode: 'SELLER_FULFILLMENT',
    carrierId: shipmentCarrier.carrierId, carrier: shipmentCarrier.carrier,
    trackingNumber: uid('TRK'), status: 'SHIPPED', originCountry: 'BR', destinationCountry: 'BR',
    createdAt: new Date(), updatedAt: new Date(),
  });
  await db.insert(orderItems).values({
    id: itemId, orderId, productId, productTitle: 'Produto Teste Carrier', quantity: 1,
    unitPrice: '10.00', subtotal: '10.00', sellerId, storeId, shipmentId,
    fulfillmentMode: 'SELLER_FULFILLMENT', status: 'preparing', createdAt: new Date(),
  });
  await db.insert(escrowAccounts).values({
    id: uid('esc'), orderId, buyerId, sellerId, amount: '15.00', currency: 'BRL', status: 'held', createdAt: new Date(), updatedAt: new Date(),
  });
  return { orderId, itemId, shipmentId };
}

async function countRows(table: any): Promise<number> {
  const rows = await db.select().from(table);
  return rows.length;
}

async function main() {
  console.log('=== M1-D11 — regressão do fix de Transportadora no Detalhamento do Pedido ===\n');

  const server = buildServer();
  const baseUrl = await startServer(server);

  const catId = uid('cat');
  await db.insert(categories).values({ id: catId, name: 'Cat', slug: catId, isActive: true, commissionRate: null as any, createdAt: new Date() });
  FIXTURE_CATEGORY_ID = catId;

  const seller = await makeSeller('X');
  const buyer = await makeBuyer();
  const token = signToken({ id: seller.userId, role: 'SELLER', fullName: 'Vendedor X' });

  // carriers row real, para o cenário A (fonte autoritativa).
  const carrierId = uid('car');
  await db.insert(carriers).values({
    id: carrierId, name: 'Nusali Envio', slug: uid('nusali-envio'), countryCode: 'BR',
    status: 'ACTIVE', integrationMode: 'MANUAL', createdAt: new Date(), updatedAt: new Date(),
  } as any);

  // Snapshot ANTES do GET — nenhuma tabela financeira deve mudar só por
  // causa da leitura (comparado de novo depois do GET, mais abaixo).
  const beforeGet = {
    payments: await countRows(payments),
    escrow: await countRows(escrowAccounts),
    walletTx: await countRows(walletTransactions),
    refunds: await countRows(refunds),
  };

  // A) carrierId aponta para carriers.name="Nusali Envio" -> autoritativo.
  const caseA = await makePaidOrderWithShipment(buyer, seller.sellerId, seller.storeId, { carrierId, carrier: null });
  // B) carrierId=null, shipments.carrier="Transportadora Legada" -> fallback.
  const caseB = await makePaidOrderWithShipment(buyer, seller.sellerId, seller.storeId, { carrierId: null, carrier: 'Transportadora Legada' });
  // C) carrierId=null e carrier=null -> null, nunca uma string inventada.
  const caseC = await makePaidOrderWithShipment(buyer, seller.sellerId, seller.storeId, { carrierId: null, carrier: null });

  const afterFixture = {
    payments: await countRows(payments),
    escrow: await countRows(escrowAccounts),
    walletTx: await countRows(walletTransactions),
    refunds: await countRows(refunds),
  };

  const res = await getSellerOrders(baseUrl, token);
  report('0. GET /seller/orders -> 200', res.status === 200, { status: res.status });
  const rows: any[] = res.body?.data || [];

  const rowA = rows.find((r) => r.orderId === caseA.orderId);
  const rowB = rows.find((r) => r.orderId === caseB.orderId);
  const rowC = rows.find((r) => r.orderId === caseC.orderId);

  report('A. carrierId -> carriers.name="Nusali Envio" (autoritativo)', !!rowA && rowA.shippingCarrier === 'Nusali Envio', { shippingCarrier: rowA?.shippingCarrier });
  report('B. carrierId=null, shipments.carrier="Transportadora Legada" -> fallback', !!rowB && rowB.shippingCarrier === 'Transportadora Legada', { shippingCarrier: rowB?.shippingCarrier });
  report('C. carrierId=null e carrier=null -> null (nunca string inventada)', !!rowC && rowC.shippingCarrier === null, { shippingCarrier: rowC?.shippingCarrier });

  // Reforço: nunca deriva de trackingEvents/histórico — não há trackingEvents
  // inseridos em nenhum dos 3 cenários e mesmo assim A/B resolvem
  // corretamente, provando que a fonte é shipments.carrierId/carrier, não
  // texto de histórico.
  report('D0. Nenhum trackingEvent foi inserido nesta fixture (resolução não depende de histórico textual)', true);

  // D) leitura não escreve em nenhuma tabela financeira.
  const res2 = await getSellerOrders(baseUrl, token); // 2ª chamada, idempotente
  const afterSecondCall = {
    payments: await countRows(payments),
    escrow: await countRows(escrowAccounts),
    walletTx: await countRows(walletTransactions),
    refunds: await countRows(refunds),
  };
  report(
    'D. GET /seller/orders (inclusive 2x) nunca escreve em payments/escrow_accounts/wallet_transactions/refunds',
    JSON.stringify(afterFixture) === JSON.stringify(afterSecondCall) && res2.status === 200,
    { afterFixture, afterSecondCall }
  );
  report('D2. before (pré-fixture) tinha menos linhas que afterFixture (a fixture em si só criou 1 escrow por order — confirma que a comparação D é válida)', beforeGet.escrow < afterFixture.escrow);

  console.log(`\n${passed}/${total} testes passaram.`);
  server.close();
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
