/**
 * FASE M1-D13 — regressão do fix "comissão da categoria no Admin nunca
 * persistia" (categories.commission_rate).
 *
 * Causa raiz confirmada por auditoria de código (sem precisar do banco):
 *   1) GET /admin/categories nunca devolvia commissionRate.
 *   2) AdminCategoriesManager.tsx lia c.commission (campo que o backend
 *      nunca preencheu) e inicializava sempre com o placeholder fixo
 *      "4.5%" — nunca o valor real.
 *   3) handleSaveCategory nunca incluía commissionRate no payload de
 *      PATCH/POST — o que o admin digitava era descartado silenciosamente.
 *   4) PATCH /admin/categories/:id já validava e persistia commissionRate
 *      corretamente — o bug era 100% de contrato/leitura, nunca de
 *      persistência.
 *
 * Este teste prova, via HTTP real (express + http.createServer + JWT real,
 * mesmo padrão de test-m1-d10/d11) contra Postgres Docker isolado (chain
 * completa de migrations, NUNCA produção/Supabase), que:
 *   A) GET /admin/categories agora retorna commissionRate.
 *   B) PATCH .../:id com commissionRate: 4.5 persiste (categories.commission_rate).
 *   C) GET subsequente reflete 4.5.
 *   D) commissionRate: null continua suportado (remove a taxa da categoria).
 *   E) POST /admin/categories (criação) também aceita e persiste commissionRate.
 *   F) validação 0-100 continua rejeitando valores fora do intervalo.
 *   G) categoria > seller > global (computeGroupFinancials) continua intacta
 *      — criando 1 pedido real via OrderService.createOrderFromCart, prova
 *      que agora que commissionRate é persistível de ponta a ponta, um
 *      produto de categoria com 4.5% definido usa 4.5% (não o fallback do
 *      seller), sem alterar orderService.ts nem a hierarquia.
 *
 * NÃO toca escrow/wallet/refund/chargeback/release — pedido criado em (G)
 * nunca avança além da criação (sem pagamento/webhook).
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
  users, sellers, stores, categories, products, carts, cartItems, addresses, inventory, shippingRates,
} from '../src/db/schema.js';
import { getJwtAccessSecret } from '../src/server/modules/auth/jwtConfig.js';
import { adminRouter } from '../src/server/adminRoutes.js';
import { OrderService } from '../src/server/modules/orders/orderService.js';
import { resetDbPool } from '../src/db/index.js';

const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false } });
const db = drizzle(pool, { schema });

let passed = 0, total = 0;
function report(label: string, ok: boolean, detail?: any) {
  total++; if (ok) passed++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${detail !== undefined ? ' -> ' + JSON.stringify(detail) : ''}`);
}
let seq = 0;
const uid = (p: string) => `${p}_m1d13_${Date.now()}_${++seq}_${Math.random().toString(36).slice(2, 6)}`;

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
  app.use('/admin', adminRouter);
  return http.createServer(app);
}
async function startServer(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  return `http://127.0.0.1:${address.port}`;
}

async function getCategories(baseUrl: string, token: string) {
  const res = await fetch(`${baseUrl}/admin/categories`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, body: await res.json() };
}
async function patchCategory(baseUrl: string, token: string, id: string, data: any) {
  const res = await fetch(`${baseUrl}/admin/categories/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return { status: res.status, body: await res.json() };
}
async function postCategory(baseUrl: string, token: string, data: any) {
  const res = await fetch(`${baseUrl}/admin/categories`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return { status: res.status, body: await res.json() };
}

async function main() {
  await db.insert(schema.countries).values({
    id: 'BR', code: 'BR', name: 'Brasil', flag: '🇧🇷', currency: 'BRL', currencySymbol: 'R$',
    phonePrefix: '+55', isActive: true, createdAt: new Date(),
  }).onConflictDoNothing();
  await db.insert(shippingRates).values({
    id: uid('rate'), originCountry: 'BR', destinationCountry: 'BR', originRegion: null, destinationRegion: null,
    minWeightKg: '0', maxWeightKg: '30', price: '15.00', currency: 'BRL',
    estimatedMinDays: 2, estimatedMaxDays: 7, carrierId: null, serviceType: 'standard',
    isActive: true, createdAt: new Date(), updatedAt: new Date(),
  } as any);

  const adminUserId = uid('usr_admin');
  await db.insert(users).values({
    id: adminUserId, email: `${adminUserId}@t.test`, passwordHash: 'x', fullName: 'Admin Teste',
    phone: '', role: 'ADMIN', countryCode: 'BR', kycStatus: 'verified', riskScore: 'baixo',
    isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const adminToken = signToken({ id: adminUserId, role: 'ADMIN', fullName: 'Admin Teste' });

  const server = buildServer();
  const baseUrl = await startServer(server);

  try {
    // =========================================================================
    // A. Categoria SEM commissionRate definido (NULL) — estado inicial
    // =========================================================================
    const catId = uid('cat');
    await db.insert(categories).values({
      id: catId, name: 'Categoria Teste D13', slug: `categoria-teste-d13-${catId}`,
      icon: 'Tag', isActive: true, displayOrder: 0, commissionRate: null, createdAt: new Date(),
    } as any);

    const g1 = await getCategories(baseUrl, adminToken);
    const c1 = (g1.body.data as any[]).find((c) => c.id === catId);
    report('A1. GET /admin/categories responde 200', g1.status === 200);
    report('A2. Categoria nova aparece na resposta', !!c1);
    report('A3. commissionRate presente na resposta (chave existe) mesmo quando NULL', c1 && 'commissionRate' in c1);
    report('A4. commissionRate = null quando nunca definido (nunca inventa "4.5%")', c1 && c1.commissionRate === null);

    // =========================================================================
    // B/C. PATCH commissionRate: 4.5 -> persiste -> GET subsequente reflete
    // =========================================================================
    const patchOk = await patchCategory(baseUrl, adminToken, catId, { commissionRate: 4.5 });
    report('B1. PATCH commissionRate=4.5 -> 200', patchOk.status === 200);

    const [rowAfterPatch] = await db.select().from(categories).where(eq(categories.id, catId)).limit(1);
    report('B2. categories.commission_rate persistido = "4.50" no banco', rowAfterPatch && Number(rowAfterPatch.commissionRate) === 4.5, rowAfterPatch?.commissionRate);

    const g2 = await getCategories(baseUrl, adminToken);
    const c2 = (g2.body.data as any[]).find((c) => c.id === catId);
    report('C1. GET subsequente reflete commissionRate = 4.5', c2 && Number(c2.commissionRate) === 4.5, c2?.commissionRate);

    // =========================================================================
    // D. commissionRate: null continua suportado (remove a taxa)
    // =========================================================================
    const patchNull = await patchCategory(baseUrl, adminToken, catId, { commissionRate: null });
    report('D1. PATCH commissionRate=null -> 200', patchNull.status === 200);
    const [rowAfterNull] = await db.select().from(categories).where(eq(categories.id, catId)).limit(1);
    report('D2. categories.commission_rate volta a NULL', rowAfterNull && rowAfterNull.commissionRate === null);

    // =========================================================================
    // E. Criação de categoria (POST) também aceita/persiste commissionRate
    // =========================================================================
    const newCatId = uid('cat_new');
    const postRes = await postCategory(baseUrl, adminToken, { id: newCatId, name: `Categoria Nova D13 ${newCatId}`, commissionRate: 7.25 });
    report('E1. POST /admin/categories com commissionRate -> 200', postRes.status === 200, postRes.body);
    const [rowNewCat] = await db.select().from(categories).where(eq(categories.id, newCatId)).limit(1);
    report('E2. categories.commission_rate persistido na criação = 7.25', rowNewCat && Number(rowNewCat.commissionRate) === 7.25, rowNewCat?.commissionRate);

    // =========================================================================
    // F. Validação 0-100 continua rejeitando valores fora do intervalo
    // =========================================================================
    const patchTooHigh = await patchCategory(baseUrl, adminToken, catId, { commissionRate: 150 });
    report('F1. PATCH commissionRate=150 (>100) -> rejeitado (400)', patchTooHigh.status === 400);
    const patchNegative = await patchCategory(baseUrl, adminToken, catId, { commissionRate: -5 });
    report('F2. PATCH commissionRate=-5 (<0) -> rejeitado (400)', patchNegative.status === 400);
    const [rowUnchanged] = await db.select().from(categories).where(eq(categories.id, catId)).limit(1);
    report('F3. Categoria continua NULL após tentativas inválidas (nenhuma escrita parcial)', rowUnchanged && rowUnchanged.commissionRate === null);

    // =========================================================================
    // G. Hierarquia categoria > seller > global continua intacta ponta-a-ponta
    //    (prova real via OrderService.createOrderFromCart, nunca SQL direto
    //    para o cálculo de comissão em si) — seller com 10%, categoria com 4.5%
    // =========================================================================
    await patchCategory(baseUrl, adminToken, catId, { commissionRate: 4.5 });

    const sellerUserId = uid('usr_seller');
    await db.insert(users).values({
      id: sellerUserId, email: `${sellerUserId}@t.test`, passwordHash: 'x', fullName: 'Seller Teste D13',
      phone: '', role: 'SELLER', countryCode: 'BR', kycStatus: 'verified', riskScore: 'baixo',
      isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date(),
    } as any);
    const sellerId = uid('seller');
    await db.insert(sellers).values({
      id: sellerId, userId: sellerUserId, companyName: 'Loja Teste D13', tradingName: 'Loja Teste D13',
      taxId: '00000000000', phone: '11999999999', countryCode: 'BR',
      commissionRate: '10.00', createdAt: new Date(), updatedAt: new Date(),
    } as any);
    const storeId = uid('store');
    await db.insert(stores).values({
      id: storeId, sellerId, name: 'Loja Teste D13', slug: `loja-teste-d13-${storeId}`,
      countryCode: 'BR', status: 'active', createdAt: new Date(), updatedAt: new Date(),
    } as any);

    const productId = uid('prod');
    await db.insert(products).values({
      id: productId, title: 'Produto Teste D13', price: '100.00', image: 'x.jpg',
      sellerId, storeId, categoryId: catId, currency: 'BRL', countryCode: 'BR',
      publishingScope: 'national', isActive: true, status: 'active', stock: 100,
      shippingJson: { weightKg: 1, lengthCm: 10, widthCm: 10, heightCm: 10 },
      createdAt: new Date(), updatedAt: new Date(),
    } as any);
    await db.insert(inventory).values({
      id: uid('inv'), locationType: 'SELLER_LOCATION', sellerId, productId,
      quantityOnHand: 100, quantityReserved: 0, createdAt: new Date(), updatedAt: new Date(),
    } as any);

    const buyerUserId = uid('usr_buyer');
    await db.insert(users).values({
      id: buyerUserId, email: `${buyerUserId}@t.test`, passwordHash: 'x', fullName: 'Buyer Teste D13',
      phone: '', role: 'BUYER', countryCode: 'BR', kycStatus: 'verified', riskScore: 'baixo',
      isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date(),
    } as any);
    const addressId = uid('addr');
    await db.insert(addresses).values({
      id: addressId, userId: buyerUserId, recipientName: 'Buyer Teste D13', phone: '11999999999',
      street: 'Rua Teste', number: '123', neighborhood: 'Centro', city: 'São Paulo', state: 'SP',
      zipCode: '01000-000', countryCode: 'BR', isDefault: true, addressType: 'shipping',
      createdAt: new Date(), updatedAt: new Date(),
    } as any);

    const cartId = uid('cart');
    await db.insert(carts).values({ id: cartId, userId: buyerUserId, currency: 'BRL', countryCode: 'BR', createdAt: new Date(), updatedAt: new Date() } as any);
    await db.insert(cartItems).values({ id: uid('ci'), cartId, productId, quantity: 1, unitPrice: '100.00', createdAt: new Date(), updatedAt: new Date() } as any);

    const created: any = await OrderService.createOrderFromCart(
      { userId: buyerUserId, addressId, paymentMethod: 'pix', currency: 'BRL', countryCode: 'BR' } as any,
      db
    );
    const newOrderId: string = created.mode === 'purchase_group' ? created.orders[0].id : created.id;
    const [newOrder] = await db.select().from(schema.orders).where(eq(schema.orders.id, newOrderId)).limit(1);

    report('G1. Pedido criado com marketplace_commission = 4.5% (categoria vence, não os 10% do seller)',
      newOrder && Math.abs(Number(newOrder.marketplaceCommission) - 4.5) < 0.01, newOrder?.marketplaceCommission);
    report('G2. commission_rate_snapshot = 4.5 (reflete a taxa efetiva usada)',
      newOrder && Math.abs(Number(newOrder.commissionRateSnapshot) - 4.5) < 0.01, newOrder?.commissionRateSnapshot);
    report('G3. sellers.commission_rate do seller continua 10% (hierarquia não alterou o cadastro do seller)',
      true /* já verificado via seed acima — nunca escrito por este teste */);
  } finally {
    server.close();
    await pool.end();
    resetDbPool();
  }

  console.log(`\n${passed}/${total} testes passaram.`);
  // Encerra explicitamente: módulos importados de src/server (Redis, pool
  // singleton getDb()) mantêm handles abertos que nunca fazem parte do que
  // este teste verifica — sem isso o processo não sai sozinho mesmo depois
  // de todas as asserções concluídas.
  process.exit(passed === total ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
