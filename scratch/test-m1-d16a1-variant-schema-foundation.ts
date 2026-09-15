/**
 * FASE D16-A1 — fundação de schema para variantes de produto:
 *   - product_variants.is_active (boolean NOT NULL DEFAULT true)
 *   - order_items.compare_at_price_snapshot (numeric(12,2) NULL)
 *
 * Migration 0027, gerada pelo mecanismo real do projeto (npm run db:generate
 * / drizzle-kit). Nenhum writer de variantes, nenhum backfill de preço,
 * nenhuma mudança em inventory/checkout/shipping/fulfillment/financeiro.
 *
 * Prova, via Postgres Docker isolado (NUNCA staging/produção), dois
 * cenários independentes, cada um em seu próprio banco (mesmo servidor):
 *
 *   A) FRESH: 0000 -> 0027 (chain completa de uma vez) — confirma que a
 *      migration nova funciona do zero, sem depender de estado prévio.
 *   B) UPGRADE: 0000 -> 0026 primeiro, cria fixtures HISTÓRICAS (variante e
 *      order_item já existentes ANTES da migration 0027 existir), só então
 *      aplica 0027 — confirma que dado histórico recebe exatamente o
 *      DEFAULT esperado (is_active=true) ou permanece NULL
 *      (compare_at_price_snapshot), nunca um valor inventado/backfillado, e
 *      que nada de D15-A/B/C/C2/C3/C4 (fulfillment_locations, ausência de
 *      inventory_locations, FK/índice de inventory.fulfillment_location_id)
 *      foi tocado.
 */
import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';

const baseTestDbUrl = assertLedgerTestDatabaseGuard();

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, sql } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import {
  users, countries, sellers, stores, addresses, products, productVariants,
  inventory, orders, orderItems, shippingRates, shippingZones,
  escrowAccounts, payments, walletTransactions, refunds, fulfillmentLocations, warehouses,
} from '../src/db/schema.js';

let passed = 0, total = 0;
function report(label: string, ok: boolean, detail?: any) {
  total++; if (ok) passed++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${detail !== undefined ? ' -> ' + JSON.stringify(detail) : ''}`);
}
let seq = 0;
const uid = (p: string) => `${p}_m1d16a1_${Date.now()}_${++seq}_${Math.random().toString(36).slice(2, 6)}`;

// ----------------------------------------------------------------------------
// Infra: cria dois bancos-irmãos no MESMO servidor do LEDGER_TEST_DATABASE_URL
// (nunca staging/produção — a guarda já garante isso para o banco original;
// os dois novos nomes são só variações do mesmo host/credenciais Docker).
// ----------------------------------------------------------------------------
const freshDbName = 'nusali_d16a1_fresh';
const upgradeDbName = 'nusali_d16a1_upgrade';

function urlForDb(dbName: string): string {
  const u = new URL(baseTestDbUrl);
  u.pathname = `/${dbName}`;
  return u.toString();
}

async function recreateDatabase(adminPool: pg.Pool, dbName: string) {
  await adminPool.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`, [dbName]).catch(() => {});
  await adminPool.query(`DROP DATABASE IF EXISTS "${dbName}"`);
  await adminPool.query(`CREATE DATABASE "${dbName}"`);
}

async function main() {
  const adminPool = new pg.Pool({ connectionString: baseTestDbUrl, ssl: { rejectUnauthorized: false } });
  await recreateDatabase(adminPool, freshDbName);
  await recreateDatabase(adminPool, upgradeDbName);
  await adminPool.end();

  // ==========================================================================
  // A) FRESH — 0000 -> 0027 de uma vez só.
  // ==========================================================================
  {
    const freshUrl = urlForDb(freshDbName);
    const pool = new pg.Pool({ connectionString: freshUrl, ssl: { rejectUnauthorized: false } });
    const db = drizzle(pool, { schema });

    await migrate(db, { migrationsFolder: './drizzle' });

    const isActiveCol = await pool.query(
      `SELECT column_default, is_nullable, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='product_variants' AND column_name='is_active'`
    );
    report(
      'A1. FRESH 0000->0027: product_variants.is_active existe, NOT NULL, DEFAULT true',
      isActiveCol.rows.length === 1 && isActiveCol.rows[0].is_nullable === 'NO' && /true/i.test(String(isActiveCol.rows[0].column_default)),
      isActiveCol.rows[0]
    );

    const snapshotCol = await pool.query(
      `SELECT is_nullable, data_type, numeric_precision, numeric_scale FROM information_schema.columns WHERE table_schema='public' AND table_name='order_items' AND column_name='compare_at_price_snapshot'`
    );
    report(
      'A2. FRESH 0000->0027: order_items.compare_at_price_snapshot existe, NULLABLE, numeric(12,2)',
      snapshotCol.rows.length === 1 && snapshotCol.rows[0].is_nullable === 'YES' && snapshotCol.rows[0].numeric_precision === 12 && snapshotCol.rows[0].numeric_scale === 2,
      snapshotCol.rows[0]
    );

    const migCount = await pool.query(`SELECT count(*)::int AS c FROM drizzle.__drizzle_migrations`);
    report('A3. FRESH: 28 migrations aplicadas (0000..0027)', migCount.rows[0].c === 28, migCount.rows[0]);

    await pool.end();
  }

  // ==========================================================================
  // B) UPGRADE — 0000 -> 0026, fixtures HISTÓRICAS, depois 0027.
  // ==========================================================================
  {
    const upgradeUrl = urlForDb(upgradeDbName);
    const pool = new pg.Pool({ connectionString: upgradeUrl, ssl: { rejectUnauthorized: false } });
    const db = drizzle(pool, { schema });

    // Pasta de migrations SEM a 0027 — mesma técnica já usada em D15-C3/C4
    // para simular "staging antes desta fase".
    const scratchpadDir = path.resolve('scratch', '.tmp-d16a1-drizzle-0026-only');
    fs.rmSync(scratchpadDir, { recursive: true, force: true });
    fs.mkdirSync(path.join(scratchpadDir, 'meta'), { recursive: true });
    for (const f of fs.readdirSync('drizzle')) {
      if (f.endsWith('.sql') && f !== '0027_tranquil_guardsmen.sql') {
        fs.copyFileSync(path.join('drizzle', f), path.join(scratchpadDir, f));
      }
    }
    for (const f of fs.readdirSync('drizzle/meta')) {
      if (f !== '0027_snapshot.json') {
        fs.copyFileSync(path.join('drizzle/meta', f), path.join(scratchpadDir, 'meta', f));
      }
    }
    const journal = JSON.parse(fs.readFileSync(path.join(scratchpadDir, 'meta', '_journal.json'), 'utf-8'));
    journal.entries = journal.entries.filter((e: any) => e.tag !== '0027_tranquil_guardsmen');
    fs.writeFileSync(path.join(scratchpadDir, 'meta', '_journal.json'), JSON.stringify(journal, null, 2));

    await migrate(db, { migrationsFolder: scratchpadDir });
    fs.rmSync(scratchpadDir, { recursive: true, force: true });

    const migCountBefore = (await pool.query(`SELECT count(*)::int AS c FROM drizzle.__drizzle_migrations`)).rows[0].c;
    report('B0. UPGRADE: 27 migrations aplicadas (0000..0026), 0027 ainda pendente', migCountBefore === 27, migCountBefore);

    const preTables = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('fulfillment_locations','inventory_locations')`);
    const preTableNames = preTables.rows.map((r: any) => r.table_name);
    report('B0b. UPGRADE (pré-0027): fulfillment_locations já existe (de 0026)', preTableNames.includes('fulfillment_locations'));
    report('B0c. UPGRADE (pré-0027): inventory_locations continua ausente (de 0026)', !preTableNames.includes('inventory_locations'));

    // -------------------------------------------------------------------
    // Fixtures HISTÓRICAS — inseridas ANTES de 0027 existir no banco.
    // Nunca passamos isActive/compareAtPriceSnapshot nos .values() aqui:
    // a coluna ainda nem existe neste ponto.
    // -------------------------------------------------------------------
    await db.insert(countries).values([
      { id: 'GW', code: 'GW', name: 'Guiné-Bissau', flag: '🇬🇼', currency: 'XOF', currencySymbol: 'CFA', phonePrefix: '+245', isActive: true, createdAt: new Date() },
    ]).onConflictDoNothing();

    const legacyZoneId = uid('zone');
    await db.insert(shippingZones).values({ id: legacyZoneId, countryCode: 'GW', name: 'Zona Legada D16A1', isActive: true, createdAt: new Date(), updatedAt: new Date() } as any);
    const legacyRateId = uid('legacyrate');
    await db.insert(shippingRates).values({
      id: legacyRateId, zoneId: legacyZoneId, originCountry: 'GW', destinationCountry: 'GW',
      minWeightKg: '0', maxWeightKg: '10', price: '999.00', currency: 'XOF', isActive: true, createdAt: new Date(), updatedAt: new Date(),
    } as any);

    const userId = uid('usr');
    await db.insert(users).values({
      id: userId, email: `${userId}@t.test`, passwordHash: 'x', fullName: 'Seller D16A1',
      phone: '11999990000', role: 'SELLER', countryCode: 'GW', kycStatus: 'verified',
      riskScore: 'baixo', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date(),
    } as any);
    const sellerId = uid('seller');
    await db.insert(sellers).values({
      id: sellerId, userId, companyName: 'Loja D16A1', tradingName: 'Loja D16A1',
      taxId: '00000000000', phone: '11999990000', countryCode: 'GW', status: 'active',
      createdAt: new Date(), updatedAt: new Date(),
    } as any);
    const storeId = uid('store');
    await db.insert(stores).values({
      id: storeId, sellerId, name: 'Loja D16A1', slug: `loja-d16a1-${storeId}`,
      countryCode: 'GW', status: 'active', createdAt: new Date(), updatedAt: new Date(),
    } as any);
    const productId = uid('prod');
    await db.insert(products).values({
      id: productId, title: 'Produto D16A1', price: '10.00', image: 'x.jpg',
      sellerId, storeId, currency: 'XOF', countryCode: 'GW',
      isActive: true, status: 'active', stock: 0, createdAt: new Date(), updatedAt: new Date(),
    } as any);

    // Variante HISTÓRICA — criada ANTES de is_active existir. INSERT cru
    // (não via query builder do Drizzle): schema.ts já declara isActive
    // nesta fase, então o query builder emitiria "is_active" no INSERT
    // mesmo sem passá-lo em .values() — o que falharia contra o banco
    // ainda em 0026. Isto reproduz fielmente o INSERT que o código de
    // produção ATUAL (pré-0027) de fato gera.
    const variantId = uid('variant_historical');
    await pool.query(
      `INSERT INTO product_variants (id, product_id, title, sku, price, stock, color, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
      [variantId, productId, 'Variante Histórica', `SKU-${variantId}`, '12.00', 5, 'Preto', new Date()]
    );

    const warehouseId = uid('wh');
    await db.insert(warehouses).values({
      id: warehouseId, code: `HUB-D16A1-${warehouseId}`, name: 'HUB D16A1', countryCode: 'GW',
      city: 'Bissau', address: 'Zona Industrial', status: 'active', createdAt: new Date(),
    } as any);
    const invId = uid('inv');
    await db.insert(inventory).values({
      id: invId, locationType: 'SELLER_LOCATION', sellerId, warehouseId: null,
      productId, variantId, quantityOnHand: 10, quantityReserved: 2, minimumStockLevel: 0,
      createdAt: new Date(), updatedAt: new Date(),
    } as any);

    // Pedido + order_item HISTÓRICO — criado ANTES de compare_at_price_snapshot existir.
    const buyerId = uid('usr_buyer');
    await db.insert(users).values({
      id: buyerId, email: `${buyerId}@t.test`, passwordHash: 'x', fullName: 'Comprador D16A1',
      phone: '11999990001', role: 'BUYER', countryCode: 'GW', kycStatus: 'verified',
      riskScore: 'baixo', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date(),
    } as any);
    const orderId = uid('order');
    await db.insert(orders).values({
      id: orderId, orderNumber: `D16A1-${orderId}`, buyerId, storeId, sellerId,
      subtotal: '12.00', shippingFee: '0.00', totalAmount: '12.00', currency: 'XOF',
      status: 'paid', paymentStatus: 'paid', escrowStatus: 'held',
      shippingAddressJson: { recipientName: 'Comprador D16A1', street: 'Rua Teste', city: 'Bissau', countryCode: 'GW' },
      countryCode: 'GW', createdAt: new Date(), updatedAt: new Date(),
    } as any);
    // order_item HISTÓRICO — mesmo motivo do variant acima: INSERT cru para
    // nunca referenciar compare_at_price_snapshot antes de 0027 existir.
    const orderItemId = uid('oi_historical');
    await pool.query(
      `INSERT INTO order_items (id, order_id, product_id, variant_id, product_title, quantity, unit_price, subtotal, seller_id, store_id, inventory_id, fulfillment_mode, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [orderItemId, orderId, productId, variantId, 'Produto D16A1', 1, '12.00', '12.00', sellerId, storeId, invId, 'SELLER_FULFILLMENT', 'pending_preparation', new Date()]
    );

    // Snapshot de baseline (financeiro/shipping/contagens) ANTES de 0027.
    const [ordersCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(orders);
    const [paymentsCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(payments);
    const [escrowCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(escrowAccounts);
    const [walletTxCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(walletTransactions);
    const [refundsCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(refunds);
    const [variantsCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(productVariants);
    const [orderItemsCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(orderItems);
    const [inventoryCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(inventory);
    const [legacyRateBefore] = await db.select().from(shippingRates).where(eq(shippingRates.id, legacyRateId)).limit(1);
    const [invBeforeMigration] = await db.select().from(inventory).where(eq(inventory.id, invId)).limit(1);

    // -------------------------------------------------------------------
    // APLICA 0027 — mecanismo real, pasta ./drizzle completa do working
    // tree (0000-0026 já aplicadas, só 0027 é nova).
    // -------------------------------------------------------------------
    await migrate(db, { migrationsFolder: './drizzle' });

    const migCountAfter = (await pool.query(`SELECT count(*)::int AS c FROM drizzle.__drizzle_migrations`)).rows[0].c;
    report('UPGRADE_0026_TO_NEW_OK. Migrations 27 -> 28 (só 0027 nova aplicada)', migCountAfter === 28, { before: migCountBefore, after: migCountAfter });

    // -------------------------------------------------------------------
    // Validações pedidas.
    // -------------------------------------------------------------------
    const isActiveColUpgrade = await pool.query(
      `SELECT column_default, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='product_variants' AND column_name='is_active'`
    );
    report(
      'PRODUCT_VARIANT_IS_ACTIVE_OK. product_variants.is_active existe, NOT NULL, DEFAULT true',
      isActiveColUpgrade.rows.length === 1 && isActiveColUpgrade.rows[0].is_nullable === 'NO' && /true/i.test(String(isActiveColUpgrade.rows[0].column_default)),
      isActiveColUpgrade.rows[0]
    );

    const [variantAfter] = await db.select().from(productVariants).where(eq(productVariants.id, variantId)).limit(1);
    report(
      'HISTORICAL_VARIANT_DEFAULT_TRUE_OK. Variante histórica (criada antes de 0027) recebeu is_active=true via DEFAULT',
      (variantAfter as any).isActive === true,
      (variantAfter as any).isActive
    );

    const snapshotColUpgrade = await pool.query(
      `SELECT is_nullable, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='order_items' AND column_name='compare_at_price_snapshot'`
    );
    report(
      'ORDER_ITEM_COMPARE_AT_SNAPSHOT_OK. order_items.compare_at_price_snapshot existe e é NULLABLE',
      snapshotColUpgrade.rows.length === 1 && snapshotColUpgrade.rows[0].is_nullable === 'YES',
      snapshotColUpgrade.rows[0]
    );

    const [orderItemAfter] = await db.select().from(orderItems).where(eq(orderItems.id, orderItemId)).limit(1);
    report(
      'HISTORICAL_ORDER_ITEM_NULL_OK. order_item histórico permanece com compare_at_price_snapshot=NULL (nenhum backfill de preço)',
      (orderItemAfter as any).compareAtPriceSnapshot === null,
      (orderItemAfter as any).compareAtPriceSnapshot
    );

    // INVENTORY_UNCHANGED: coluna/FK de variantId, fulfillmentLocationId, e a
    // própria linha histórica de inventory continuam exatamente como antes.
    const invVariantColRes = await pool.query(`SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inventory' AND column_name='variant_id'`);
    const invFkRes = await pool.query(`
      SELECT confdeltype FROM pg_constraint
      WHERE conrelid = 'public.inventory'::regclass AND contype = 'f'
        AND conkey = ARRAY(SELECT attnum FROM pg_attribute WHERE attrelid = 'public.inventory'::regclass AND attname = 'variant_id')
    `);
    const fulfillmentLocationIdColRes = await pool.query(`SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='inventory' AND column_name='fulfillment_location_id'`);
    const [invAfterMigration] = await db.select().from(inventory).where(eq(inventory.id, invId)).limit(1);
    const inventoryUnchanged =
      invVariantColRes.rows.length === 1 &&
      invFkRes.rows.length === 1 && invFkRes.rows[0].confdeltype === 'n' && // set null, como já era
      fulfillmentLocationIdColRes.rows.length === 1 && fulfillmentLocationIdColRes.rows[0].is_nullable === 'YES' &&
      JSON.stringify(invBeforeMigration) === JSON.stringify(invAfterMigration);
    report('INVENTORY_UNCHANGED. inventory.variant_id/FK, fulfillment_location_id e a linha histórica continuam idênticos', inventoryUnchanged, {
      hasVariantCol: invVariantColRes.rows.length === 1,
      fkDeleteRule: invFkRes.rows[0]?.confdeltype,
      hasFulfillmentLocationCol: fulfillmentLocationIdColRes.rows.length === 1,
      rowIdentical: JSON.stringify(invBeforeMigration) === JSON.stringify(invAfterMigration),
    });

    const postTables = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('fulfillment_locations','inventory_locations')`);
    const postTableNames = postTables.rows.map((r: any) => r.table_name);
    report('fulfillment_locations continua presente (D15-C3 intocado)', postTableNames.includes('fulfillment_locations'));
    report('inventory_locations continua ausente (D15-C3 intocado)', !postTableNames.includes('inventory_locations'));

    const legacyShippingTables = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('shipping_zones','shipping_rates')`);
    report('Tabelas shipping legadas continuam presentes', legacyShippingTables.rows.length === 2, legacyShippingTables.rows.map((r: any) => r.table_name));
    const [legacyRateAfter] = await db.select().from(shippingRates).where(eq(shippingRates.id, legacyRateId)).limit(1);
    report('shipping_rates legado inalterado (linha idêntica)', JSON.stringify(legacyRateBefore) === JSON.stringify(legacyRateAfter));

    const financialTables = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('orders','payments','escrow_accounts','wallet_transactions','refunds')`);
    report('Tabelas financeiras principais continuam presentes', financialTables.rows.length === 5, financialTables.rows.map((r: any) => r.table_name));

    const [ordersCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(orders);
    const [paymentsCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(payments);
    const [escrowCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(escrowAccounts);
    const [walletTxCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(walletTransactions);
    const [refundsCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(refunds);
    const [variantsCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(productVariants);
    const [orderItemsCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(orderItems);
    const [inventoryCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(inventory);
    report(
      'Nenhuma linha histórica foi deletada (contagens idênticas antes/depois de 0027)',
      ordersCountAfter.c === ordersCountBefore.c && paymentsCountAfter.c === paymentsCountBefore.c
        && escrowCountAfter.c === escrowCountBefore.c && walletTxCountAfter.c === walletTxCountBefore.c
        && refundsCountAfter.c === refundsCountBefore.c && variantsCountAfter.c === variantsCountBefore.c
        && orderItemsCountAfter.c === orderItemsCountBefore.c && inventoryCountAfter.c === inventoryCountBefore.c,
      {
        orders: [ordersCountBefore.c, ordersCountAfter.c],
        payments: [paymentsCountBefore.c, paymentsCountAfter.c],
        escrow: [escrowCountBefore.c, escrowCountAfter.c],
        walletTx: [walletTxCountBefore.c, walletTxCountAfter.c],
        refunds: [refundsCountBefore.c, refundsCountAfter.c],
        variants: [variantsCountBefore.c, variantsCountAfter.c],
        orderItems: [orderItemsCountBefore.c, orderItemsCountAfter.c],
        inventory: [inventoryCountBefore.c, inventoryCountAfter.c],
      }
    );

    await pool.end();
  }

  console.log(`\n${passed}/${total} testes passaram.`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((e) => {
  console.error('\n[ERRO FATAL]', e instanceof Error ? e.message : e);
  if ((e as any)?.cause) console.error('[cause]', (e as any).cause.message);
  process.exit(1);
});
