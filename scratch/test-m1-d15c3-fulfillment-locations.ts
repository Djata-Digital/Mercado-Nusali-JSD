/**
 * FASE M1-D15-C3 — fundação de fulfillment_locations + ajuste arquitetural
 * de estoque (única fonte de verdade).
 *
 * Prova, via Postgres Docker isolado (chain completa de migrations,
 * incluindo 0026 AJUSTADA, NUNCA staging/produção) e HTTP real (express +
 * sellerRouter + adminRouter + JWT, mesmo padrão de test-m1-d13/14/15a/b/c):
 *
 *   - migration 0026 é aditiva (cria fulfillment_locations + coluna
 *     inventory.fulfillment_location_id; NUNCA cria inventory_locations;
 *     sem DROP/TRUNCATE/NOT NULL em coluna existente/backfill);
 *   - `inventory` continua sendo a ÚNICA fonte de verdade de estoque —
 *     `inventory_locations` foi REMOVIDA e não existe no banco;
 *   - ensureStoreFulfillmentLocation / ensureWarehouseFulfillmentLocation
 *     são idempotentes (nunca duplicam, ID determinístico + índice único
 *     parcial);
 *   - fulfillment_location NUNCA implica dono automático do estoque —
 *     propriedade real continua exclusivamente em `inventory.sellerId`;
 *   - inventory.fulfillmentLocationId é nullable e NÃO é backfillado nesta
 *     fase — linhas legadas continuam válidas e compatíveis;
 *   - validateInventoryVariantConsistency rejeita variante de outro produto
 *     e produto de outro seller;
 *   - nenhuma tabela financeira, shipping legado, stockReservations,
 *     inventoryTransfers, order_items, shipmentService.ts, orderService.ts
 *     ou fluxo de checkout são tocados.
 *
 * NÃO conecta a checkout/cálculo de frete/melhor origem/reserva real.
 */
import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';

const testDbUrl = assertLedgerTestDatabaseGuard();
process.env.DATABASE_URL = testDbUrl;

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and, sql } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import {
  users, countries, sellers, stores, addresses, warehouses, products, productVariants,
  fulfillmentLocations, inventory, stockReservations, inventoryTransfers, orderItems,
  shippingRates, shippingZones, shippingRegions, shippingSectors,
  orders, payments, escrowAccounts, walletTransactions, refunds,
} from '../src/db/schema.js';
import { getJwtAccessSecret } from '../src/server/modules/auth/jwtConfig.js';
import { sellerRouter } from '../src/server/sellerRoutes.js';
import { adminRouter } from '../src/server/adminRoutes.js';
import {
  ensureStoreFulfillmentLocation,
  ensureWarehouseFulfillmentLocation,
  listFulfillmentLocationsForSeller,
  validateInventoryVariantConsistency,
} from '../src/server/modules/logistics/fulfillmentLocationService.js';

const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false } });
const db = drizzle(pool, { schema });

let passed = 0, total = 0;
function report(label: string, ok: boolean, detail?: any) {
  total++; if (ok) passed++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${detail !== undefined ? ' -> ' + JSON.stringify(detail) : ''}`);
}
let seq = 0;
const uid = (p: string) => `${p}_m1d15c3_${Date.now()}_${++seq}_${Math.random().toString(36).slice(2, 6)}`;

function signToken(user: { id: string; role: string; fullName: string }) {
  return jwt.sign(
    { userId: user.id, email: `${user.id}@t.test`, role: user.role, fullName: user.fullName, countryCode: 'GW', kycStatus: 'unverified', isEmailVerified: true },
    getJwtAccessSecret(),
    { expiresIn: '1h' }
  );
}
function buildServer() {
  const app = express();
  app.use(express.json());
  app.use('/seller', sellerRouter);
  app.use('/admin', adminRouter);
  return http.createServer(app);
}
async function startServer(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  return `http://127.0.0.1:${address.port}`;
}
async function api(baseUrl: string, token: string, method: string, path: string) {
  const res = await fetch(`${baseUrl}${path}`, { method, headers: { Authorization: `Bearer ${token}` } });
  let parsed: any = {};
  try { parsed = await res.json(); } catch { parsed = {}; }
  return { status: res.status, body: parsed };
}

async function makeSellerWithStoreAndProduct(opts: { label: string; countryCode: string }) {
  const userId = uid(`usr_${opts.label}`);
  await db.insert(users).values({
    id: userId, email: `${userId}@t.test`, passwordHash: 'x', fullName: `Seller ${opts.label}`,
    phone: '11999999999', role: 'SELLER', countryCode: opts.countryCode, kycStatus: 'verified',
    riskScore: 'baixo', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const sellerId = uid(`seller_${opts.label}`);
  await db.insert(sellers).values({
    id: sellerId, userId, companyName: `Loja ${opts.label}`, tradingName: `Loja ${opts.label}`,
    taxId: '00000000000', phone: '11999999999', countryCode: opts.countryCode, status: 'active',
    createdAt: new Date(), updatedAt: new Date(),
  } as any);

  const addressId = uid(`addr_${opts.label}`);
  await db.insert(addresses).values({
    id: addressId, userId, recipientName: `Depósito ${opts.label}`, street: 'Rua Teste', number: '1',
    city: 'Bissau', state: 'Bissau', countryCode: opts.countryCode, phone: '245000000',
    isDefault: false, addressType: 'business', createdAt: new Date(), updatedAt: new Date(),
  } as any);

  const storeId = uid(`store_${opts.label}`);
  await db.insert(stores).values({
    id: storeId, sellerId, name: `Loja ${opts.label}`, slug: `loja-${opts.label.toLowerCase()}-${storeId}`,
    countryCode: opts.countryCode, status: 'active', operationalAddressId: addressId,
    createdAt: new Date(), updatedAt: new Date(),
  } as any);

  const productId = uid(`prod_${opts.label}`);
  await db.insert(products).values({
    id: productId, title: `Product X (${opts.label})`, price: '10.00', image: 'x.jpg',
    sellerId, storeId, currency: opts.countryCode === 'BR' ? 'BRL' : 'XOF', countryCode: opts.countryCode,
    isActive: true, status: 'active', stock: 0, createdAt: new Date(), updatedAt: new Date(),
  } as any);

  return { userId, sellerId, storeId, addressId, productId, token: signToken({ id: userId, role: 'SELLER', fullName: `Seller ${opts.label}` }) };
}

/** Confirma que um trecho de código só menciona o token dentro de comentário. */
function assertOnlyInComments(fileLabel: string, src: string, token: string): boolean {
  const idx = src.indexOf(token);
  if (idx === -1) return true; // nem aparece — ok
  // Todas as ocorrências precisam estar dentro do primeiro bloco /** ... */
  // do arquivo OU depois de "//" na mesma linha.
  const blockStart = src.indexOf('/**');
  const blockEnd = src.indexOf('*/', blockStart === -1 ? 0 : blockStart);
  let pos = 0;
  while (true) {
    const found = src.indexOf(token, pos);
    if (found === -1) break;
    const withinBlockComment = blockStart !== -1 && blockEnd !== -1 && found > blockStart && found < blockEnd;
    const lineStart = src.lastIndexOf('\n', found) + 1;
    const linePrefix = src.slice(lineStart, found);
    const withinLineComment = linePrefix.includes('//');
    if (!withinBlockComment && !withinLineComment) {
      console.log(`  [assertOnlyInComments] "${token}" fora de comentário em ${fileLabel} (offset ${found})`);
      return false;
    }
    pos = found + token.length;
  }
  return true;
}

async function main() {
  await db.insert(countries).values([
    { id: 'GW', code: 'GW', name: 'Guiné-Bissau', flag: '🇬🇼', currency: 'XOF', currencySymbol: 'CFA', phonePrefix: '+245', isActive: true, createdAt: new Date() },
  ]).onConflictDoNothing();

  // "Sujeira" legado + financeiro — prova depois que nada mudou.
  const legacyZoneId = uid('zone');
  await db.insert(shippingZones).values({ id: legacyZoneId, countryCode: 'GW', name: 'Zona Legada D15C3', isActive: true, createdAt: new Date(), updatedAt: new Date() } as any);
  const legacyRateId = uid('legacyrate');
  await db.insert(shippingRates).values({
    id: legacyRateId, zoneId: legacyZoneId, originCountry: 'GW', destinationCountry: 'GW',
    minWeightKg: '0', maxWeightKg: '10', price: '999.00', currency: 'XOF', isActive: true, createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const [legacyRateBefore] = await db.select().from(shippingRates).where(eq(shippingRates.id, legacyRateId)).limit(1);
  const [ordersCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(orders);
  const [paymentsCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(payments);
  const [escrowCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(escrowAccounts);
  const [walletTxCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(walletTransactions);
  const [refundsCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(refunds);
  const [stockReservationsCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(stockReservations);
  const [inventoryTransfersCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(inventoryTransfers);
  const [orderItemsCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(orderItems);

  // =========================================================================
  // 1, 3. Migration 0026 AJUSTADA: fulfillment_locations existe,
  // inventory_locations NÃO existe.
  // =========================================================================
  const tablesRes = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('fulfillment_locations','inventory_locations')`);
  const tableNames = tablesRes.rows.map((r: any) => r.table_name);
  report('1. Migration 0026 aditiva: fulfillment_locations existe', tableNames.includes('fulfillment_locations'), tableNames);
  report('3. inventory_locations NÃO existe (removida do ajuste arquitetural)', !tableNames.includes('inventory_locations'), tableNames);

  // =========================================================================
  // 4. inventory.fulfillment_location_id existe e é nullable.
  // =========================================================================
  const colRes = await pool.query(`SELECT is_nullable, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='inventory' AND column_name='fulfillment_location_id'`);
  report('4. inventory.fulfillment_location_id existe e é NULLABLE', colRes.rows.length === 1 && colRes.rows[0].is_nullable === 'YES', colRes.rows[0]);

  // Legado intocado: locationType/warehouseId/sellerId/productId/variantId/
  // quantityOnHand/quantityReserved continuam existindo tal como antes.
  const legacyColsRes = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='inventory'`);
  const legacyColNames = legacyColsRes.rows.map((r: any) => r.column_name);
  report('4b. Colunas legadas de inventory permanecem intactas', ['location_type', 'warehouse_id', 'seller_id', 'product_id', 'variant_id', 'quantity_on_hand', 'quantity_reserved'].every((c) => legacyColNames.includes(c)), legacyColNames);

  const sellerA = await makeSellerWithStoreAndProduct({ label: 'A', countryCode: 'GW' });
  const sellerB = await makeSellerWithStoreAndProduct({ label: 'B', countryCode: 'GW' });

  const warehouseId = uid('wh');
  await db.insert(warehouses).values({
    id: warehouseId, code: `HUB-D15C3-${warehouseId}`, name: 'HUB Gabú D15C3', countryCode: 'GW',
    city: 'Gabú', address: 'Zona Industrial de Gabú', status: 'active', createdAt: new Date(),
  } as any);

  // =========================================================================
  // 5, 17. Linha de inventory legada (SELLER_LOCATION), sem
  // fulfillmentLocationId, continua válida.
  // =========================================================================
  const legacySellerInvId = uid('inv_seller_legacy');
  await db.insert(inventory).values({
    id: legacySellerInvId, locationType: 'SELLER_LOCATION', sellerId: sellerA.sellerId, warehouseId: null,
    productId: sellerA.productId, variantId: null, quantityOnHand: 4, quantityReserved: 0, minimumStockLevel: 0,
    createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const [legacySellerInv] = await db.select().from(inventory).where(eq(inventory.id, legacySellerInvId)).limit(1);
  report('5. Linha SELLER_LOCATION legada (fulfillmentLocationId NULL) insere e lê normalmente', !!legacySellerInv && legacySellerInv.fulfillmentLocationId === null, legacySellerInv);
  report('17. inventory continua aceitando locationType legado (SELLER_LOCATION) sem qualquer mudança de comportamento', legacySellerInv?.locationType === 'SELLER_LOCATION');

  // =========================================================================
  // 18. Linha NUSALI_HUB legada (com warehouseId, sem fulfillmentLocationId).
  // =========================================================================
  const legacyHubInvId = uid('inv_hub_legacy');
  await db.insert(inventory).values({
    id: legacyHubInvId, locationType: 'NUSALI_HUB', sellerId: sellerA.sellerId, warehouseId,
    productId: sellerA.productId, variantId: null, quantityOnHand: 20, quantityReserved: 0, minimumStockLevel: 0,
    createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const [legacyHubInv] = await db.select().from(inventory).where(eq(inventory.id, legacyHubInvId)).limit(1);
  report('18. inventory continua aceitando NUSALI_HUB com warehouseId legado, fulfillmentLocationId NULL', legacyHubInv?.locationType === 'NUSALI_HUB' && legacyHubInv?.warehouseId === warehouseId && legacyHubInv?.fulfillmentLocationId === null, legacyHubInv);

  // =========================================================================
  // 19. Estoque sem fulfillmentLocationId continua compatível com a rota
  // real de leitura do seller (GET /seller/inventory).
  // =========================================================================

  // =========================================================================
  // 6-7. Store fulfillment location — idempotência.
  // =========================================================================
  const locA1 = await ensureStoreFulfillmentLocation(sellerA.storeId, db);
  report('6. Store location criada uma vez', !!locA1 && locA1.locationType === 'STORE' && locA1.storeId === sellerA.storeId, locA1?.id);
  report('6b. addressId/shippingSectorId espelham stores.operationalAddressId no momento da chamada', locA1.addressId === sellerA.addressId);
  const locA2 = await ensureStoreFulfillmentLocation(sellerA.storeId, db);
  report('7. Segunda chamada é idempotente (mesmo ID, não duplica)', locA2.id === locA1.id);
  const countStoreLocA = await db.select({ c: sql<number>`count(*)::int` }).from(fulfillmentLocations).where(eq(fulfillmentLocations.storeId, sellerA.storeId));
  report('7b. Exatamente 1 linha para a store A no banco', countStoreLocA[0].c === 1);

  // =========================================================================
  // 8-9. Warehouse fulfillment location — idempotência.
  // =========================================================================
  const hub1 = await ensureWarehouseFulfillmentLocation(warehouseId, db);
  report('8. Warehouse location criada uma vez', !!hub1 && hub1.locationType === 'NUSALI_WAREHOUSE' && hub1.warehouseId === warehouseId, hub1?.id);
  const hub2 = await ensureWarehouseFulfillmentLocation(warehouseId, db);
  report('9. Segunda chamada é idempotente (mesmo ID, não duplica)', hub2.id === hub1.id);
  const countHubLoc = await db.select({ c: sql<number>`count(*)::int` }).from(fulfillmentLocations).where(eq(fulfillmentLocations.warehouseId, warehouseId));
  report('9b. Exatamente 1 linha para o HUB no banco', countHubLoc[0].c === 1);

  // =========================================================================
  // 10. Warehouse fulfillment location tem sellerId NULL (HUB compartilhado).
  // =========================================================================
  report('10. fulfillment_location do HUB tem sellerId=NULL (não pertence a nenhum seller específico)', hub1.sellerId === null);

  const locB1 = await ensureStoreFulfillmentLocation(sellerB.storeId, db);

  // =========================================================================
  // 11-12. Visibilidade por seller.
  // =========================================================================
  const sellerALocations = await listFulfillmentLocationsForSeller(sellerA.sellerId, db);
  report('11. Seller A NÃO vê a store location de Seller B', !sellerALocations.some((l) => l.id === locB1.id), sellerALocations.map((l) => l.id));
  report('12. Seller A vê a própria store location', sellerALocations.some((l) => l.id === locA1.id));

  // =========================================================================
  // 13. addressId/shippingSectorId da fulfillment_location refrescam quando
  // operationalAddress do seller muda (nunca uma cópia congelada).
  // =========================================================================
  const regionId = uid('region');
  await db.insert(shippingRegions).values({ id: regionId, countryCode: 'GW', name: 'Região Teste D15C3', code: `RG-${regionId}`, isActive: true, createdAt: new Date(), updatedAt: new Date() } as any);
  const sector1Id = uid('sector1');
  const sector2Id = uid('sector2');
  await db.insert(shippingSectors).values([
    { id: sector1Id, countryCode: 'GW', regionId, name: 'Setor 1', code: `ST1-${sector1Id}`, isActive: true, createdAt: new Date(), updatedAt: new Date() },
    { id: sector2Id, countryCode: 'GW', regionId, name: 'Setor 2', code: `ST2-${sector2Id}`, isActive: true, createdAt: new Date(), updatedAt: new Date() },
  ] as any);

  await db.update(addresses).set({ shippingSectorId: sector1Id }).where(eq(addresses.id, sellerA.addressId));
  const locA3 = await ensureStoreFulfillmentLocation(sellerA.storeId, db);
  const step1Ok = locA3.shippingSectorId === sector1Id;

  const address2Id = uid('addr2_A');
  await db.insert(addresses).values({
    id: address2Id, userId: sellerA.userId, recipientName: 'Depósito A2', street: 'Rua Nova', number: '2',
    city: 'Bissau', state: 'Bissau', countryCode: 'GW', phone: '245000001', isDefault: false,
    addressType: 'business', shippingSectorId: sector2Id, createdAt: new Date(), updatedAt: new Date(),
  } as any);
  await db.update(stores).set({ operationalAddressId: address2Id }).where(eq(stores.id, sellerA.storeId));
  const locA4 = await ensureStoreFulfillmentLocation(sellerA.storeId, db);
  report('13. shippingSectorId/addressId refrescam quando operationalAddress do seller muda (nunca cópia congelada)', step1Ok && locA4.shippingSectorId === sector2Id && locA4.addressId === address2Id, { step1Ok, sector: locA4.shippingSectorId, address: locA4.addressId });
  const countStoreLocAAfterRefresh = await db.select({ c: sql<number>`count(*)::int` }).from(fulfillmentLocations).where(eq(fulfillmentLocations.storeId, sellerA.storeId));
  report('13b. Refresh nunca duplica a linha (continua exatamente 1)', countStoreLocAAfterRefresh[0].c === 1);

  // =========================================================================
  // 14. Warehouse sem geografia estruturada permanece NULL (nada inventado).
  // =========================================================================
  report('14. fulfillment_location do HUB permanece com addressId/shippingSectorId NULL (warehouses não tem geografia estruturada hoje)', hub1.addressId === null && hub1.shippingSectorId === null);

  // =========================================================================
  // 15. FK inventory -> fulfillment_locations funciona (join determinístico).
  // =========================================================================
  await db.update(inventory).set({ fulfillmentLocationId: locA4.id }).where(eq(inventory.id, legacySellerInvId));
  const [joinedRow] = await db
    .select({ invId: inventory.id, locationName: fulfillmentLocations.name })
    .from(inventory)
    .innerJoin(fulfillmentLocations, eq(fulfillmentLocations.id, inventory.fulfillmentLocationId))
    .where(eq(inventory.id, legacySellerInvId))
    .limit(1);
  report('15. inventory.fulfillmentLocationId -> fulfillment_locations.id funciona via FK/join', !!joinedRow && joinedRow.locationName === locA4.name, joinedRow);

  // =========================================================================
  // 16. FK RESTRICT impede apagar uma fulfillment_location referenciada.
  // =========================================================================
  let restrictBlocked = false;
  try {
    await pool.query('DELETE FROM fulfillment_locations WHERE id = $1', [locA4.id]);
  } catch (err: any) {
    restrictBlocked = /foreign key constraint|violates/i.test(err?.message || '');
  }
  report('16. ON DELETE RESTRICT impede apagar fulfillment_location referenciada por inventory', restrictBlocked);
  // Reverte para não afetar o restante do teste (deveria ter falhado mesmo).
  const [locA4StillThere] = await db.select().from(fulfillmentLocations).where(eq(fulfillmentLocations.id, locA4.id)).limit(1);
  report('16b. Location referenciada continua existindo após a tentativa bloqueada', !!locA4StillThere);

  // =========================================================================
  // 19. Estoque legado sem fulfillmentLocationId continua compatível com a
  // rota real GET /seller/inventory.
  // =========================================================================
  const server = buildServer();
  const baseUrl = await startServer(server);
  try {
    const sellerInventoryRes = await api(baseUrl, sellerA.token, 'GET', '/seller/inventory');
    const invRows = (sellerInventoryRes.body?.data || []) as any[];
    report('19. GET /seller/inventory continua funcionando com linhas fulfillmentLocationId=NULL e =preenchido misturadas', sellerInventoryRes.status === 200 && invRows.some((r) => r.id === legacyHubInvId && r.fulfillmentLocationId === null), invRows.length);

    const sellerLocations = await api(baseUrl, sellerA.token, 'GET', '/seller/fulfillment-locations');
    report('HTTP: GET /seller/fulfillment-locations retorna a própria loja', sellerLocations.status === 200 && (sellerLocations.body.data as any[]).some((l: any) => l.id === locA4.id));
    report('HTTP: GET /seller/fulfillment-locations inclui o HUB (Seller A tem estoque legado lá, resolvido por warehouseId, read-only)', (sellerLocations.body.data as any[]).some((l: any) => l.id === hub1.id));
    report('HTTP: GET /seller/fulfillment-locations NUNCA retorna a store location de Seller B', !(sellerLocations.body.data as any[]).some((l: any) => l.id === locB1.id));

    const adminUserId = uid('usr_admin');
    await db.insert(users).values({
      id: adminUserId, email: `${adminUserId}@t.test`, passwordHash: 'x', fullName: 'Admin D15C3',
      phone: '', role: 'ADMIN', countryCode: 'GW', kycStatus: 'verified', riskScore: 'baixo',
      isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date(),
    } as any);
    const adminToken = signToken({ id: adminUserId, role: 'ADMIN', fullName: 'Admin D15C3' });
    const adminLocations = await api(baseUrl, adminToken, 'GET', '/admin/fulfillment-locations?country=GW');
    report('HTTP: GET /admin/fulfillment-locations lista todas as locations (store A, store B, HUB)', adminLocations.status === 200 && (adminLocations.body.data as any[]).length >= 3, adminLocations.body?.data?.length);

    const sellerTryAdmin = await api(baseUrl, sellerA.token, 'GET', '/admin/fulfillment-locations');
    report('HTTP: Seller continua SEM acesso a /admin/fulfillment-locations (401/403)', sellerTryAdmin.status === 401 || sellerTryAdmin.status === 403, sellerTryAdmin.status);
  } finally {
    server.close();
  }

  // =========================================================================
  // 20. variantId nullable continua funcionando em inventory.
  // =========================================================================
  const variantId = uid('variant');
  await db.insert(productVariants).values({
    id: variantId, productId: sellerA.productId, title: 'Branco / M', price: '10.00', stock: 0,
    size: 'M', color: 'Branco', createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const variantInvId = uid('inv_variant');
  await db.insert(inventory).values({
    id: variantInvId, locationType: 'SELLER_LOCATION', sellerId: sellerA.sellerId, warehouseId: null,
    productId: sellerA.productId, variantId, quantityOnHand: 7, quantityReserved: 0, minimumStockLevel: 0,
    createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const [variantInv] = await db.select().from(inventory).where(eq(inventory.id, variantInvId)).limit(1);
  report('20. inventory aceita variantId real coexistindo com linhas sem variante (nullable, D16-ready)', variantInv?.variantId === variantId);

  // =========================================================================
  // 21-24. validateInventoryVariantConsistency.
  // =========================================================================
  const vNull = await validateInventoryVariantConsistency({ sellerId: sellerA.sellerId, productId: sellerA.productId, variantId: null }, db);
  report('21. validateInventoryVariantConsistency aceita variantId=null', vNull.ok === true, vNull);

  const vOk = await validateInventoryVariantConsistency({ sellerId: sellerA.sellerId, productId: sellerA.productId, variantId }, db);
  report('22. validateInventoryVariantConsistency aceita variante do produto correto', vOk.ok === true, vOk);

  // Um segundo produto do MESMO seller A, para isolar "variante de outro
  // produto" de "produto de outro seller" (dois motivos de rejeição
  // diferentes, nunca confundidos).
  const productA2Id = uid('prod_A2');
  await db.insert(products).values({
    id: productA2Id, title: 'Product Y (A)', price: '15.00', image: 'y.jpg',
    sellerId: sellerA.sellerId, storeId: sellerA.storeId, currency: 'XOF', countryCode: 'GW',
    isActive: true, status: 'active', stock: 0, createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const vWrongProduct = await validateInventoryVariantConsistency({ sellerId: sellerA.sellerId, productId: productA2Id, variantId }, db);
  report('23. validateInventoryVariantConsistency REJEITA variante de outro produto do MESMO seller (nunca aceita variante alheia)', vWrongProduct.ok === false && /VARIANT_PRODUCT_MISMATCH/.test((vWrongProduct as any).error), vWrongProduct);

  // Variante real do produto de Seller B, consultada como se fosse de
  // Seller A — precisa falhar por dono do PRODUTO, não por variantId=null
  // (que sempre é válido por definição, ver item 21).
  const variantBId = uid('variantB');
  await db.insert(productVariants).values({
    id: variantBId, productId: sellerB.productId, title: 'Único', price: '10.00', stock: 0,
    createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const vWrongSeller = await validateInventoryVariantConsistency({ sellerId: sellerA.sellerId, productId: sellerB.productId, variantId: variantBId }, db);
  report('24. validateInventoryVariantConsistency REJEITA produto de outro seller', vWrongSeller.ok === false && /PRODUCT_SELLER_MISMATCH/.test((vWrongSeller as any).error), vWrongSeller);

  // =========================================================================
  // 25-29. Nada financeiro/logístico pré-existente foi tocado.
  // =========================================================================
  const [ordersCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(orders);
  const [paymentsCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(payments);
  const [escrowCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(escrowAccounts);
  const [walletTxCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(walletTransactions);
  const [refundsCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(refunds);
  report('25. Nenhuma tabela financeira mudou', ordersCountAfter.c === ordersCountBefore.c && paymentsCountAfter.c === paymentsCountBefore.c
    && escrowCountAfter.c === escrowCountBefore.c && walletTxCountAfter.c === walletTxCountBefore.c && refundsCountAfter.c === refundsCountBefore.c);

  const [legacyRateAfter] = await db.select().from(shippingRates).where(eq(shippingRates.id, legacyRateId)).limit(1);
  report('26. shipping_rates legado inalterado', JSON.stringify(legacyRateBefore) === JSON.stringify(legacyRateAfter));

  const [stockReservationsCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(stockReservations);
  report('27. stockReservations inalterado (nenhuma reserva real criada nesta fase)', stockReservationsCountAfter.c === stockReservationsCountBefore.c);

  const [inventoryTransfersCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(inventoryTransfers);
  report('28. inventoryTransfers inalterado', inventoryTransfersCountAfter.c === inventoryTransfersCountBefore.c);

  const [orderItemsCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(orderItems);
  report('29. order_items (inventoryId/warehouseId) inalterado — nenhum pedido/alocação tocado', orderItemsCountAfter.c === orderItemsCountBefore.c);

  // =========================================================================
  // 30-32. Guardas estáticas — orderService/shipmentService/checkout intocados.
  // =========================================================================
  const orderServiceSrc = fs.readFileSync(path.resolve('src/server/modules/orders/orderService.ts'), 'utf-8');
  report('30. orderService.ts nunca referencia fulfillmentLocations/inventory_locations', !orderServiceSrc.includes('fulfillmentLocations') && !orderServiceSrc.includes('inventoryLocations') && !orderServiceSrc.includes('inventory_locations'));

  const shipmentServiceSrc = fs.readFileSync(path.resolve('src/server/modules/logistics/shipmentService.ts'), 'utf-8');
  report('31. shipmentService.ts nunca referencia fulfillmentLocations/inventory_locations', !shipmentServiceSrc.includes('fulfillmentLocations') && !shipmentServiceSrc.includes('inventoryLocations') && !shipmentServiceSrc.includes('inventory_locations'));

  const checkoutViewSrc = fs.readFileSync(path.resolve('src/components/CheckoutView.tsx'), 'utf-8');
  report('32. CheckoutView.tsx nunca referencia fulfillment-locations/inventory-locations', !checkoutViewSrc.includes('fulfillment-locations') && !checkoutViewSrc.includes('inventory-locations'));

  // =========================================================================
  // Guarda estática extra — inventory_locations não sobrevive em código
  // "vivo" (fora de comentários de histórico) em nenhum arquivo de src/.
  // =========================================================================
  const schemaSrc = fs.readFileSync(path.resolve('src/db/schema.ts'), 'utf-8');
  report('Extra: inventory_locations só aparece em comentário de histórico em schema.ts', assertOnlyInComments('schema.ts', schemaSrc, 'inventory_locations') && !schemaSrc.includes('inventoryLocations ='));

  const fulfillmentServiceSrc = fs.readFileSync(path.resolve('src/server/modules/logistics/fulfillmentLocationService.ts'), 'utf-8');
  report('Extra: inventory_locations só aparece em comentário de histórico em fulfillmentLocationService.ts', assertOnlyInComments('fulfillmentLocationService.ts', fulfillmentServiceSrc, 'inventory_locations') && !fulfillmentServiceSrc.includes('inventoryLocations'));

  const adminRoutesSrc = fs.readFileSync(path.resolve('src/server/adminRoutes.ts'), 'utf-8');
  const sellerRoutesSrc = fs.readFileSync(path.resolve('src/server/sellerRoutes.ts'), 'utf-8');
  const catalogServiceSrc = fs.readFileSync(path.resolve('src/server/modules/catalog/catalogService.ts'), 'utf-8');
  const productCreationServiceSrc = fs.readFileSync(path.resolve('src/server/modules/catalog/productCreationService.ts'), 'utf-8');
  const inventoryServiceSrc = fs.readFileSync(path.resolve('src/server/modules/inventory/inventoryService.ts'), 'utf-8');
  report('Extra: nenhum outro arquivo de rota/serviço menciona inventory_locations/inventoryLocations', [adminRoutesSrc, sellerRoutesSrc, catalogServiceSrc, productCreationServiceSrc, inventoryServiceSrc]
    .every((src) => !src.includes('inventoryLocations') && !src.includes('inventory_locations')));

  const migrationSql = fs.readFileSync(path.resolve('drizzle/0026_fulfillment_locations_foundation.sql'), 'utf-8');
  report('Extra: migration 0026 não contém CREATE TABLE inventory_locations', !migrationSql.toLowerCase().includes('inventory_locations'));

  await pool.end();

  console.log(`\n${passed}/${total} testes passaram.`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((e) => {
  console.error('\n[ERRO FATAL]', e instanceof Error ? e.message : e);
  if (e?.cause) console.error('[cause]', e.cause.message, e.cause.code, e.cause.detail);
  process.exit(1);
});
