/**
 * FASE M1-D15-C4 — correção do bug pré-existente de liberação de reserva de
 * estoque no cancelamento (orderService.ts `cancelOrder`).
 *
 * BUG (antes desta fase): ao cancelar um pedido, o código buscava a linha
 * de `inventory` a decrementar por `productId`(+`variantId`) e usava a
 * PRIMEIRA encontrada — nunca pelo `inventoryId` exato já persistido em
 * `stockReservations.inventoryId`. Quando o mesmo produto tem mais de uma
 * linha de `inventory` (ex.: `SELLER_LOCATION` + `NUSALI_HUB`), isso podia
 * liberar a reserva na localização física ERRADA.
 *
 * CORREÇÃO: `cancelOrder` agora delega a liberação para
 * `InventoryService.releaseStock(orderId, tx)`, que já usa
 * `stockReservations.inventoryId` diretamente — sem duplicar lógica, dentro
 * da mesma transação.
 *
 * Prova, via Postgres Docker isolado (chain completa de migrations, NUNCA
 * staging/produção):
 *   - cenário mínimo: mesmo seller/produto/variante, duas linhas de
 *     inventory (A=SELLER_LOCATION, B=NUSALI_HUB), reserva criada
 *     EXPLICITAMENTE em B — cancelar o pedido decrementa B, nunca A;
 *   - reservation muda para status 'released';
 *   - idempotência: cancelar de novo (reservas já 'released') não
 *     decrementa nada de novo;
 *   - nenhuma tabela financeira/shipping/fulfillment_locations/D15-C3 é
 *     tocada.
 */
import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';

const testDbUrl = assertLedgerTestDatabaseGuard();
process.env.DATABASE_URL = testDbUrl;

import 'dotenv/config';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and, sql } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import {
  users, countries, sellers, stores, addresses, warehouses, products, productVariants,
  inventory, stockReservations, inventoryMovements, orders, orderItems,
  escrowAccounts, payments, walletTransactions, refunds, shippingRates, shippingZones,
  fulfillmentLocations,
} from '../src/db/schema.js';
import { OrderService } from '../src/server/modules/orders/orderService.js';

const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false } });
const db = drizzle(pool, { schema });

let passed = 0, total = 0;
function report(label: string, ok: boolean, detail?: any) {
  total++; if (ok) passed++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${detail !== undefined ? ' -> ' + JSON.stringify(detail) : ''}`);
}
let seq = 0;
const uid = (p: string) => `${p}_m1d15c4_${Date.now()}_${++seq}_${Math.random().toString(36).slice(2, 6)}`;

async function main() {
  await db.insert(countries).values([
    { id: 'GW', code: 'GW', name: 'Guiné-Bissau', flag: '🇬🇼', currency: 'XOF', currencySymbol: 'CFA', phonePrefix: '+245', isActive: true, createdAt: new Date() },
  ]).onConflictDoNothing();

  // "Sujeira" legado + financeiro — prova depois que nada mudou.
  const legacyZoneId = uid('zone');
  await db.insert(shippingZones).values({ id: legacyZoneId, countryCode: 'GW', name: 'Zona Legada D15C4', isActive: true, createdAt: new Date(), updatedAt: new Date() } as any);
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
  const [fulfillmentLocationsCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(fulfillmentLocations);

  // ==========================================================================
  // Fixtures: comprador, seller, produto (+variante), warehouse.
  // ==========================================================================
  const buyerId = uid('usr_buyer');
  await db.insert(users).values({
    id: buyerId, email: `${buyerId}@t.test`, passwordHash: 'x', fullName: 'Comprador D15C4',
    phone: '11999990000', role: 'BUYER', countryCode: 'GW', kycStatus: 'verified',
    riskScore: 'baixo', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date(),
  } as any);

  const sellerUserId = uid('usr_seller');
  await db.insert(users).values({
    id: sellerUserId, email: `${sellerUserId}@t.test`, passwordHash: 'x', fullName: 'Seller D15C4',
    phone: '11999990001', role: 'SELLER', countryCode: 'GW', kycStatus: 'verified',
    riskScore: 'baixo', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const sellerId = uid('seller');
  await db.insert(sellers).values({
    id: sellerId, userId: sellerUserId, companyName: 'Loja D15C4', tradingName: 'Loja D15C4',
    taxId: '00000000000', phone: '11999990001', countryCode: 'GW', status: 'active',
    createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const storeId = uid('store');
  await db.insert(stores).values({
    id: storeId, sellerId, name: 'Loja D15C4', slug: `loja-d15c4-${storeId}`,
    countryCode: 'GW', status: 'active', createdAt: new Date(), updatedAt: new Date(),
  } as any);

  const productId = uid('prod');
  await db.insert(products).values({
    id: productId, title: 'Produto D15C4', price: '10.00', image: 'x.jpg',
    sellerId, storeId, currency: 'XOF', countryCode: 'GW',
    isActive: true, status: 'active', stock: 0, createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const variantId = uid('variant');
  await db.insert(productVariants).values({
    id: variantId, productId, title: 'Único', price: '10.00', stock: 0, createdAt: new Date(), updatedAt: new Date(),
  } as any);

  const warehouseId = uid('wh');
  await db.insert(warehouses).values({
    id: warehouseId, code: `HUB-D15C4-${warehouseId}`, name: 'HUB D15C4', countryCode: 'GW',
    city: 'Bissau', address: 'Zona Industrial', status: 'active', createdAt: new Date(),
  } as any);

  // ==========================================================================
  // Cenário mínimo: DUAS linhas de inventory para o MESMO seller/produto/
  // variante. A é inserida ANTES de B — sob o bug antigo (busca por
  // productId+variantId, pega invRows[0]), o heap scan sem ORDER BY tende a
  // devolver a ordem de inserção, então o bug decrementaria A por engano.
  //   A = SELLER_LOCATION (NÃO deve mudar)
  //   B = NUSALI_HUB (É onde a reserva foi criada — DEVE mudar)
  // ==========================================================================
  const invAId = uid('inv_A_seller_location');
  await db.insert(inventory).values({
    id: invAId, locationType: 'SELLER_LOCATION', sellerId, warehouseId: null,
    productId, variantId, quantityOnHand: 10, quantityReserved: 3, minimumStockLevel: 0,
    createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const invBId = uid('inv_B_nusali_hub');
  await db.insert(inventory).values({
    id: invBId, locationType: 'NUSALI_HUB', sellerId, warehouseId,
    productId, variantId, quantityOnHand: 20, quantityReserved: 5, minimumStockLevel: 0,
    createdAt: new Date(), updatedAt: new Date(),
  } as any);

  const [invABefore] = await db.select().from(inventory).where(eq(inventory.id, invAId)).limit(1);
  const [invBBefore] = await db.select().from(inventory).where(eq(inventory.id, invBId)).limit(1);
  report('setup: inventory A (SELLER_LOCATION) criada com quantityReserved=3', invABefore.quantityReserved === 3);
  report('setup: inventory B (NUSALI_HUB) criada com quantityReserved=5', invBBefore.quantityReserved === 5);

  // ==========================================================================
  // Pedido + order_item + reserva EXPLICITAMENTE em B (inventoryId=invBId).
  // ==========================================================================
  const orderId = uid('order');
  const orderNumber = `D15C4-${orderId}`;
  await db.insert(orders).values({
    id: orderId, orderNumber, buyerId, storeId, sellerId,
    subtotal: '20.00', shippingFee: '0.00', totalAmount: '20.00', currency: 'XOF',
    status: 'paid', paymentStatus: 'paid', escrowStatus: 'held',
    shippingAddressJson: { recipientName: 'Comprador D15C4', street: 'Rua Teste', city: 'Bissau', countryCode: 'GW' },
    countryCode: 'GW', createdAt: new Date(), updatedAt: new Date(),
  } as any);

  const orderItemId = uid('oi');
  const RESERVED_QTY = 4;
  await db.insert(orderItems).values({
    id: orderItemId, orderId, productId, variantId, productTitle: 'Produto D15C4',
    quantity: RESERVED_QTY, unitPrice: '10.00', subtotal: '40.00',
    sellerId, storeId, inventoryId: invBId, warehouseId,
    fulfillmentMode: 'NUSALI_FULFILLMENT', status: 'pending_preparation', createdAt: new Date(),
  } as any);

  const reservationId = uid('sr');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await db.insert(stockReservations).values({
    id: reservationId, orderId, productId, variantId, inventoryId: invBId, warehouseId,
    fulfillmentMode: 'NUSALI_FULFILLMENT', quantity: RESERVED_QTY, expiresAt, status: 'active', createdAt: new Date(),
  } as any);

  // ==========================================================================
  // AÇÃO: cancelar o pedido.
  // ==========================================================================
  await OrderService.cancelOrder(orderId, buyerId);

  // ==========================================================================
  // Verificações centrais (regra funcional pedida).
  // ==========================================================================
  const [invAAfter] = await db.select().from(inventory).where(eq(inventory.id, invAId)).limit(1);
  const [invBAfter] = await db.select().from(inventory).where(eq(inventory.id, invBId)).limit(1);
  const [reservationAfter] = await db.select().from(stockReservations).where(eq(stockReservations.id, reservationId)).limit(1);
  const [orderAfter] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);

  report(
    '1. B (NUSALI_HUB, onde a reserva foi criada) teve quantityReserved decrementado corretamente: 5 -> 1',
    invBAfter.quantityReserved === 5 - RESERVED_QTY,
    { before: 5, after: invBAfter.quantityReserved }
  );
  report(
    '2. A (SELLER_LOCATION, localização ERRADA) permanece INALTERADO: quantityReserved continua 3',
    invAAfter.quantityReserved === 3,
    { before: 3, after: invAAfter.quantityReserved }
  );
  report(
    '3. quantityOnHand de A e B não mudou (cancelamento nunca mexe em onHand, só em reserved)',
    invAAfter.quantityOnHand === 10 && invBAfter.quantityOnHand === 20
  );
  report('4. stockReservations passou para status=released', reservationAfter.status === 'released');
  report('5. orders.status passou para cancelled', orderAfter.status === 'cancelled');

  // InventoryService.releaseStock() (a função reaproveitada pela correção)
  // grava inventoryId/warehouseId/quantidade no movimento, mas não
  // referenceId — por isso a busca é por inventoryId, o próprio campo sob
  // teste, não por referenceId (que essa função nunca populou, antes ou
  // depois desta correção).
  const releaseMovementsOnB = await db.select().from(inventoryMovements).where(and(eq(inventoryMovements.inventoryId, invBId), eq(inventoryMovements.type, 'RELEASE')));
  const releaseMovementsOnA = await db.select().from(inventoryMovements).where(and(eq(inventoryMovements.inventoryId, invAId), eq(inventoryMovements.type, 'RELEASE')));
  report(
    '6. inventoryMovements RELEASE foi registrado em B (quantidade correta) e NUNCA em A — evidência de que a localização exata foi usada',
    releaseMovementsOnB.length === 1 && releaseMovementsOnB[0].quantity === RESERVED_QTY && releaseMovementsOnA.length === 0,
    { onB: releaseMovementsOnB, onA: releaseMovementsOnA }
  );

  // ==========================================================================
  // Idempotência: cancelar de novo não deve decrementar nada outra vez
  // (mesma regra pré-existente: releaseStock só afeta reservas 'active').
  // ==========================================================================
  await OrderService.cancelOrder(orderId, buyerId);
  const [invBAfterSecondCancel] = await db.select().from(inventory).where(eq(inventory.id, invBId)).limit(1);
  const [invAAfterSecondCancel] = await db.select().from(inventory).where(eq(inventory.id, invAId)).limit(1);
  report(
    '7. Cancelar de novo (idempotente) NÃO decrementa B outra vez',
    invBAfterSecondCancel.quantityReserved === invBAfter.quantityReserved,
    { first: invBAfter.quantityReserved, second: invBAfterSecondCancel.quantityReserved }
  );
  report(
    '8. Cancelar de novo (idempotente) NÃO altera A',
    invAAfterSecondCancel.quantityReserved === 3
  );

  const releaseMovementsOnBAfterSecondCancel = await db.select().from(inventoryMovements).where(and(eq(inventoryMovements.inventoryId, invBId), eq(inventoryMovements.type, 'RELEASE')));
  report(
    '9. Nenhum novo inventoryMovements RELEASE foi criado em B na segunda chamada (idempotente)',
    releaseMovementsOnBAfterSecondCancel.length === releaseMovementsOnB.length,
    { afterFirstCancel: releaseMovementsOnB.length, afterSecondCancel: releaseMovementsOnBAfterSecondCancel.length }
  );

  // ==========================================================================
  // Guardas: nada financeiro/shipping/fulfillment_locations foi tocado.
  // ==========================================================================
  const [ordersCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(orders);
  const [paymentsCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(payments);
  const [escrowCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(escrowAccounts);
  const [walletTxCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(walletTransactions);
  const [refundsCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(refunds);
  report(
    '10. Nenhuma tabela financeira mudou de tamanho (só orders ganhou o 1 pedido de teste, esperado)',
    ordersCountAfter.c === ordersCountBefore.c + 1 && paymentsCountAfter.c === paymentsCountBefore.c
      && escrowCountAfter.c === escrowCountBefore.c && walletTxCountAfter.c === walletTxCountBefore.c && refundsCountAfter.c === refundsCountBefore.c
  );

  const [legacyRateAfter] = await db.select().from(shippingRates).where(eq(shippingRates.id, legacyRateId)).limit(1);
  report('11. shipping_rates legado inalterado', JSON.stringify(legacyRateBefore) === JSON.stringify(legacyRateAfter));

  const [fulfillmentLocationsCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(fulfillmentLocations);
  report('12. fulfillment_locations (D15-C3) não foi tocado', fulfillmentLocationsCountAfter.c === fulfillmentLocationsCountBefore.c);

  await pool.end();

  console.log(`\n${passed}/${total} testes passaram.`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((e) => {
  console.error('\n[ERRO FATAL]', e instanceof Error ? e.message : e);
  if ((e as any)?.cause) console.error('[cause]', (e as any).cause.message);
  process.exit(1);
});
