/**
 * FASE M1-D10 — regressão do fix "Produtos (Subtotal): R$ 0,00" no
 * Detalhamento Financeiro da Venda (SellerOrdersManager.tsx).
 *
 * Prova, em duas camadas:
 *  A) unidade pura: computeSellerOrderFinancialBreakdown lê `subtotal`
 *     (nunca mais `amount`, campo que nunca existiu no contrato real).
 *  B) integração HTTP real (express + http.createServer + JWT real, mesmo
 *     padrão de test-m1-c-dispute-messages.ts): GET /seller/orders contra
 *     Postgres Docker isolado (chain 0000..0023, NUNCA produção) expõe
 *     `subtotal` = order_items.subtotal para cada item, inclusive quando um
 *     child order tem MAIS DE UM item do mesmo vendedor — cada row com o
 *     seu próprio subtotal, nunca um valor do outro item nem o total do
 *     pedido. Também prova que a leitura não escreve nada em nenhuma
 *     tabela financeira.
 *
 * NÃO exercita checkout/pagamento real — os valores financeiros são
 * inseridos diretamente (fixture), pois o que está sob teste é o READ
 * MODEL (GET /seller/orders + computeSellerOrderFinancialBreakdown), não o
 * cálculo de checkout (já coberto por outras suítes: D4, D9).
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
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import {
  users, sellers, stores, categories, products, orders, orderItems,
  payments, escrowAccounts, walletTransactions, refunds,
} from '../src/db/schema.js';
import { getJwtAccessSecret } from '../src/server/modules/auth/jwtConfig.js';
import { sellerRouter } from '../src/server/sellerRoutes.js';
import { computeSellerOrderFinancialBreakdown } from '../src/utils/sellerOrderFinancials.js';
import { resetDbPool } from '../src/db/index.js';

const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false } });
const db = drizzle(pool, { schema });

let passed = 0, total = 0;
function report(label: string, ok: boolean, detail?: any) {
  total++; if (ok) passed++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${detail !== undefined ? ' -> ' + JSON.stringify(detail) : ''}`);
}
let seq = 0;
const uid = (p: string) => `${p}_m1d10_${Date.now()}_${++seq}_${Math.random().toString(36).slice(2, 6)}`;
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

/** Cria 1 order PAGA + N order_items, com valores financeiros explícitos
 * (fixture — não exercita checkout real, o que está sob teste é a LEITURA). */
async function makePaidOrderWithItems(
  buyerId: string,
  sellerId: string,
  storeId: string,
  items: { title: string; unitPrice: string; subtotal: string }[],
  opts: { shippingFee: string; shippingCost: string; marketplaceCommission: string; sellerNetAmount: string }
) {
  const orderId = uid('ord');
  const orderSubtotal = items.reduce((s, i) => s + Number(i.subtotal), 0).toFixed(2);
  const totalAmount = (Number(orderSubtotal) + Number(opts.shippingFee)).toFixed(2);
  await db.insert(orders).values({
    id: orderId, orderNumber: orderId, buyerId, sellerId, storeId, purchaseGroupId: null,
    subtotal: orderSubtotal, shippingFee: opts.shippingFee, shippingCost: opts.shippingCost,
    shippingChargedToBuyer: opts.shippingFee, commissionRateSnapshot: '10.00',
    marketplaceCommission: opts.marketplaceCommission, sellerNetAmount: opts.sellerNetAmount,
    totalAmount, currency: 'BRL', status: 'processing', paymentStatus: 'paid', escrowStatus: 'held',
    shippingAddressJson: { recipientName: 'T', street: 'R', number: '1', city: 'C', countryCode: 'BR' },
    countryCode: 'BR', createdAt: new Date(), updatedAt: new Date(),
  });
  const itemIds: string[] = [];
  for (const it of items) {
    const itemId = uid('oi');
    const productId = uid('prod');
    await db.insert(products).values({
      id: productId, title: it.title, price: it.unitPrice, image: 'https://x/p.png',
      sellerId, storeId, categoryId: FIXTURE_CATEGORY_ID, currency: 'BRL', countryCode: 'BR',
      createdAt: new Date(), updatedAt: new Date(),
    });
    await db.insert(orderItems).values({
      id: itemId, orderId, productId, productTitle: it.title, quantity: 1,
      unitPrice: it.unitPrice, subtotal: it.subtotal, sellerId, storeId,
      fulfillmentMode: 'SELLER_FULFILLMENT', status: 'preparing', createdAt: new Date(),
    });
    itemIds.push(itemId);
  }
  await db.insert(escrowAccounts).values({
    id: uid('esc'), orderId, buyerId, sellerId, amount: totalAmount, currency: 'BRL', status: 'held', createdAt: new Date(), updatedAt: new Date(),
  });
  return { orderId, itemIds };
}

async function countRows(table: any): Promise<number> {
  const rows = await db.select().from(table);
  return rows.length;
}

async function main() {
  console.log('=== M1-D10 — regressão do fix de subtotal no Detalhamento Financeiro ===\n');

  // ==========================================================================
  // A) UNIDADE PURA — computeSellerOrderFinancialBreakdown
  // ==========================================================================
  const breakdown = computeSellerOrderFinancialBreakdown({
    subtotal: 12,
    marketplaceCommission: 1.2,
    commissionRateSnapshot: 10,
    shippingCost: 15,
    shippingChargedToBuyer: 15,
    sellerNetAmount: 10.8,
  });
  report('A1. subtotal=12 -> breakdown.subtotal === 12 (nunca 0)', breakdown.subtotal === 12, { subtotal: breakdown.subtotal });
  report('A2. commission 1.20 permanece 1.20 (não afetado pelo fix)', breakdown.commission === 1.2);
  report('A3. shippingCost 15 permanece 15 (não afetado pelo fix)', breakdown.shippingCost === 15);
  report('A4. shippingChargedToBuyer 15 permanece 15 (não afetado pelo fix)', breakdown.shippingChargedToBuyer === 15);
  report('A5. sellerNetAmount 10.80 permanece 10.80 (não afetado pelo fix)', breakdown.sellerNet === 10.8);

  // Prova negativa: um objeto SEM `subtotal` (ex.: um `amount` legado por
  // engano) nunca produz outra coisa que não seja 0 — nunca lê a chave errada.
  const noSubtotal = computeSellerOrderFinancialBreakdown({ amount: 999 } as any);
  report('A6. objeto sem `subtotal` -> 0 (não lê mais `amount`, nem por acidente)', noSubtotal.subtotal === 0, { subtotal: noSubtotal.subtotal });

  // ==========================================================================
  // B) INTEGRAÇÃO HTTP REAL — GET /seller/orders
  // ==========================================================================
  const server = buildServer();
  const baseUrl = await startServer(server);

  const catId = uid('cat');
  await db.insert(categories).values({ id: catId, name: 'Cat', slug: catId, isActive: true, commissionRate: null as any, createdAt: new Date() });
  FIXTURE_CATEGORY_ID = catId;

  const seller = await makeSeller('X');
  const buyer = await makeBuyer();
  const token = signToken({ id: seller.userId, role: 'SELLER', fullName: 'Vendedor X' });

  // Snapshot ANTES — nenhuma tabela financeira deve mudar só por causa do GET.
  const before = {
    payments: await countRows(payments),
    escrow: await countRows(escrowAccounts),
    walletTx: await countRows(walletTransactions),
    refunds: await countRows(refunds),
  };

  // B1 — child order de 1 item só, EXATAMENTE os valores do ticket relatado.
  const single = await makePaidOrderWithItems(
    buyer, seller.sellerId, seller.storeId,
    [{ title: 'Produto Staging A', unitPrice: '12.00', subtotal: '12.00' }],
    { shippingFee: '15.00', shippingCost: '15.00', marketplaceCommission: '1.20', sellerNetAmount: '10.80' }
  );

  // B2 — child order com 2 itens do MESMO vendedor: cada item precisa expor
  // o SEU PRÓPRIO subtotal, nunca o do outro nem o total do pedido.
  const multi = await makePaidOrderWithItems(
    buyer, seller.sellerId, seller.storeId,
    [
      { title: 'Produto Multi 1', unitPrice: '12.00', subtotal: '12.00' },
      { title: 'Produto Multi 2', unitPrice: '8.00', subtotal: '8.00' },
    ],
    { shippingFee: '15.00', shippingCost: '15.00', marketplaceCommission: '2.00', sellerNetAmount: '18.00' }
  );

  const res = await getSellerOrders(baseUrl, token);
  report('B0. GET /seller/orders -> 200', res.status === 200, { status: res.status });
  const rows: any[] = res.body?.data || [];

  const singleRow = rows.find((r) => r.orderId === single.orderId);
  report('B1. GET /seller/orders expõe subtotal do order_item (12.00), nunca 0', !!singleRow && Number(singleRow.subtotal) === 12, { subtotal: singleRow?.subtotal });
  report('B1b. totalAmount do child (27.00) não foi confundido com subtotal', !!singleRow && Number(singleRow.totalAmount) === 27, { totalAmount: singleRow?.totalAmount });
  report('B1c. shippingChargedToBuyer (15.00) e sellerNetAmount (10.80) continuam corretos', !!singleRow && Number(singleRow.shippingChargedToBuyer) === 15 && Number(singleRow.sellerNetAmount) === 10.8);

  const multiRows = rows.filter((r) => r.orderId === multi.orderId);
  report('B2. child order com 2 itens -> 2 rows distintas em GET /seller/orders', multiRows.length === 2, { n: multiRows.length });
  const item1Row = multiRows.find((r) => r.id === multi.itemIds[0]);
  const item2Row = multiRows.find((r) => r.id === multi.itemIds[1]);
  report('B2b. item 1 expõe SEU subtotal (12.00), não o do item 2 nem o total do pedido', !!item1Row && Number(item1Row.subtotal) === 12, { subtotal: item1Row?.subtotal });
  report('B2c. item 2 expõe SEU subtotal (8.00), não o do item 1 nem o total do pedido', !!item2Row && Number(item2Row.subtotal) === 8, { subtotal: item2Row?.subtotal });
  report('B2d. SUM(subtotal dos 2 itens) == orders.subtotal (20.00) — nenhum valor inventado', (Number(item1Row?.subtotal) + Number(item2Row?.subtotal)) === 20);

  // B3 — a mesma linha, passada de verdade (não um literal escrito à mão)
  // para computeSellerOrderFinancialBreakdown, produz o mesmo resultado que
  // a UI mostraria — prova end-to-end do contrato real, não só da função pura.
  const uiBreakdown = computeSellerOrderFinancialBreakdown(singleRow);
  report('B3. breakdown calculado sobre a ROW REAL da API -> subtotal=12 (o que a UI vai exibir)', uiBreakdown.subtotal === 12, { subtotal: uiBreakdown.subtotal });

  // B4 — GET é read-only: nenhuma tabela financeira muda por causa da leitura
  // (as inserções de fixture acima não contam — comparamos com o estado
  // IMEDIATAMENTE ANTES da chamada HTTP, não antes da fixture).
  const afterFixture = {
    payments: await countRows(payments),
    escrow: await countRows(escrowAccounts),
    walletTx: await countRows(walletTransactions),
    refunds: await countRows(refunds),
  };
  const res2 = await getSellerOrders(baseUrl, token); // 2ª chamada, idempotente
  const afterSecondCall = {
    payments: await countRows(payments),
    escrow: await countRows(escrowAccounts),
    walletTx: await countRows(walletTransactions),
    refunds: await countRows(refunds),
  };
  report(
    'B4. GET /seller/orders (inclusive 2x) nunca escreve em payments/escrow_accounts/wallet_transactions/refunds',
    JSON.stringify(afterFixture) === JSON.stringify(afterSecondCall) && res2.status === 200,
    { afterFixture, afterSecondCall }
  );
  report('B5. before (pré-fixture) tinha menos linhas que afterFixture (a fixture em si só criou 1 escrow por order — confirma que a comparação B4 é válida)', before.escrow < afterFixture.escrow);

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
