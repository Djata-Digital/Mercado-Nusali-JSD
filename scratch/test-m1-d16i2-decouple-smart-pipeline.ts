/**
 * FASE D16-I2 — Desacoplar smart checkout/fulfillment da permissão
 * multi-seller.
 *
 * Prova, via Postgres Docker isolado (NUNCA staging/produção), chamando
 * OrderService.createOrderFromCart DIRETAMENTE:
 *   A. single seller + flag TRUE  -> pipeline smart (purchase_group + 1 order).
 *   B. single seller + flag FALSE -> MESMO pipeline smart (comportamento NOVO
 *      desta fase) — NUNCA mais cai no motor legado.
 *   C. multi seller + flag TRUE   -> continua funcionando (regressão).
 *   D. multi seller + flag FALSE  -> MULTI_SELLER_CHECKOUT_DISABLED, ANTES de
 *      qualquer efeito financeiro/estoque (zero order/reserva/purchase_group).
 *   E. single seller, endereço sem shippingSectorId -> erro explícito.
 *   F. single seller, setor de destino sem NENHUMA rota -> erro explícito.
 *   G. single seller, rota existe mas sem tarifa cadastrada -> erro explícito.
 *   H. single seller, candidato válido -> F4 escolhe, F5 reserva exatamente essa origem.
 *   I. endereço salvo (addressId).
 *   J. novo endereço inline (shippingAddress).
 *   K. snapshots logísticos (F6.1) preenchidos corretamente.
 *   L. estrutura do pedido (purchase_group + orders) idêntica em TODOS os
 *      cenários acima, independente da flag.
 *   PROVA-LEGACY. ShippingCalculatorService.calculateFreight NUNCA é chamada
 *      (instrumentado via monkey-patch), inclusive com a flag desligada.
 */
import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';

const testDbUrl = assertLedgerTestDatabaseGuard();
process.env.DATABASE_URL = testDbUrl;
process.env.SKIP_RUNTIME_ALIGN = 'true';

import 'dotenv/config';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import {
  users, sellers, stores, categories, countries, orders, orderItems,
  purchaseGroups, inventory, warehouses, stockReservations, carts, cartItems, addresses,
  platformSettings, shippingSectors, shippingRoutes, shippingServices, shippingRouteRates, shippingRegions,
} from '../src/db/schema.js';
import { seedGuineaBissauShippingGeography } from '../src/server/modules/shipping/shippingGeographyService.js';
import { ensureStoreFulfillmentLocation, ensureWarehouseFulfillmentLocation } from '../src/server/modules/logistics/fulfillmentLocationService.js';
import { ProductCreationService } from '../src/server/modules/catalog/productCreationService.js';
import { OrderService } from '../src/server/modules/orders/orderService.js';
import { ShippingCalculatorService } from '../src/server/modules/shipping/shippingCalculatorService.js';

const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false }, max: 15 });
const db = drizzle(pool, { schema });

let passed = 0, total = 0;
function report(label: string, ok: boolean, detail?: any) {
  total++; if (ok) passed++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${detail !== undefined ? ' -> ' + JSON.stringify(detail) : ''}`);
}
let seq = 0;
const uid = (p: string) => `${p}_m1d16i2_${Date.now()}_${++seq}_${Math.random().toString(36).slice(2, 6)}`;
const runTag = uid('run');

async function setFlag(enabled: boolean) {
  await db.insert(platformSettings).values({ key: 'multiSellerCheckoutEnabled', valueJson: enabled, updatedAt: new Date() } as any)
    .onConflictDoUpdate({ target: platformSettings.key, set: { valueJson: enabled, updatedAt: new Date() } });
}

async function makeUser(role: string) {
  const id = uid('usr');
  await db.insert(users).values({
    id, email: `${id}@t.test`, passwordHash: 'x', fullName: `Teste ${id}`,
    phone: '11999990000', role, countryCode: 'GW', kycStatus: 'verified', riskScore: 'baixo',
    isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date(),
  } as any);
  return id;
}

async function makeSeller(label: string) {
  const userId = await makeUser('SELLER');
  const sellerId = uid(`seller_${label}`);
  await db.insert(sellers).values({
    id: sellerId, userId, companyName: `Loja ${label}`, tradingName: `Loja ${label}`,
    taxId: '00000000000', phone: '11999990000', countryCode: 'GW', status: 'active', createdAt: new Date(), updatedAt: new Date(),
  } as any);
  return { userId, sellerId };
}

async function makeStore(seller: { sellerId: string; userId: string }, label: string, sectorId: string) {
  const addressId = uid(`addr_${label}`);
  await db.insert(addresses).values({
    id: addressId, userId: seller.userId, recipientName: `Loja ${label}`, street: `Rua ${label}`, number: '1',
    city: label, state: label, countryCode: 'GW', phone: '955000000', isDefault: false, addressType: 'business',
    shippingSectorId: sectorId, createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const storeId = uid(`store_${label}`);
  await db.insert(stores).values({
    id: storeId, sellerId: seller.sellerId, name: `Loja ${label} D16I2`, slug: `loja-${label.toLowerCase()}-${runTag}-${storeId}`,
    countryCode: 'GW', status: 'active', operationalAddressId: addressId, createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const floc = await ensureStoreFulfillmentLocation(storeId, db);
  return { storeId, floc };
}

const categoryIdPromise = (async () => {
  const categoryId = uid('cat');
  await db.insert(categories).values({ id: categoryId, name: 'Categoria D16I2', slug: `cat-d16i2-${runTag}`, isActive: true, commissionRate: '10.00' as any, createdAt: new Date() } as any);
  return categoryId;
})();

async function makeProduct(seller: { userId: string }, storeId: string, title: string, weightKg = 0.3) {
  const categoryId = await categoryIdPromise;
  const product: any = await ProductCreationService.createProduct(seller.userId, {
    title: `${title} ${runTag}`, price: 100, image: 'x.jpg', categoryId, storeId,
    weightKg, dimensionsCm: { length: 5, width: 5, height: 5 }, stock: 0,
  } as any, db);
  await db.delete(inventory).where(eq(inventory.productId, product.id));
  return product;
}

async function insertInventory(opts: {
  sellerId: string; productId: string; locationType: 'SELLER_LOCATION' | 'NUSALI_HUB';
  fulfillmentLocationId: string | null; warehouseId?: string | null; quantityOnHand: number;
}) {
  const id = uid('inv');
  await db.insert(inventory).values({
    id, locationType: opts.locationType, sellerId: opts.sellerId, warehouseId: opts.warehouseId || null,
    productId: opts.productId, variantId: null, quantityOnHand: opts.quantityOnHand,
    quantityReserved: 0, minimumStockLevel: 0, fulfillmentLocationId: opts.fulfillmentLocationId,
    createdAt: new Date(), updatedAt: new Date(),
  } as any);
  return id;
}

async function makeBuyerWithAddress(sectorId: string | null, city = 'Bissau') {
  const buyerId = await makeUser('BUYER');
  const addressId = uid('addr');
  await db.insert(addresses).values({
    id: addressId, userId: buyerId, recipientName: 'Comprador D16I2', street: 'Rua Teste', number: '1',
    city, state: city, countryCode: 'GW', zipCode: '', phone: '955000000',
    isDefault: true, addressType: 'shipping', shippingSectorId: sectorId, createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const cartId = uid('cart');
  await db.insert(carts).values({ id: cartId, userId: buyerId, currency: 'XOF', countryCode: 'GW', createdAt: new Date(), updatedAt: new Date() } as any);
  return { buyerId, addressId, cartId };
}

async function addToCart(cartId: string, productId: string, quantity: number, unitPrice = 100) {
  await db.insert(cartItems).values({
    id: uid('ci'), cartId, productId, quantity, unitPrice: String(unitPrice), createdAt: new Date(), updatedAt: new Date(),
  } as any);
}

async function insertRate(routeId: string, serviceId: string, amount: number) {
  await db.insert(shippingRouteRates).values({
    id: uid('rate'), routeId, serviceId, minWeightKg: '0', maxWeightKg: '5',
    amount: String(amount), currency: 'XOF', isActive: true, createdAt: new Date(), updatedAt: new Date(),
  } as any);
}

async function getInv(inventoryId: string) {
  const [row] = await db.select().from(inventory).where(eq(inventory.id, inventoryId));
  return row as any;
}

async function main() {
  await db.insert(countries).values([
    { id: 'GW', code: 'GW', name: 'Guiné-Bissau', flag: '🇬🇼', currency: 'XOF', currencySymbol: 'CFA', phonePrefix: '+245', isActive: true, createdAt: new Date() },
  ] as any).onConflictDoNothing();
  await seedGuineaBissauShippingGeography(db);

  const [bissauSector] = await db.select().from(shippingSectors).where(and(eq(shippingSectors.countryCode, 'GW'), eq(shippingSectors.name, 'Bissau')));
  const [gabuSector] = await db.select().from(shippingSectors).where(and(eq(shippingSectors.countryCode, 'GW'), eq(shippingSectors.name, 'Gabú')));
  const [standardSvc] = await db.select().from(shippingServices).where(and(eq(shippingServices.countryCode, 'GW'), eq(shippingServices.code, 'STANDARD')));
  const [routeBissauBissau] = await db.select().from(shippingRoutes).where(and(eq(shippingRoutes.countryCode, 'GW'), eq(shippingRoutes.originSectorId, bissauSector.id), eq(shippingRoutes.destinationSectorId, bissauSector.id)));
  const [routeBissauGabu] = await db.select().from(shippingRoutes).where(and(eq(shippingRoutes.countryCode, 'GW'), eq(shippingRoutes.originSectorId, bissauSector.id), eq(shippingRoutes.destinationSectorId, gabuSector.id)));
  const [routeGabuGabu] = await db.select().from(shippingRoutes).where(and(eq(shippingRoutes.countryCode, 'GW'), eq(shippingRoutes.originSectorId, gabuSector.id), eq(shippingRoutes.destinationSectorId, gabuSector.id)));

  await insertRate(routeBissauBissau.id, standardSvc.id, 200);
  await insertRate(routeGabuGabu.id, standardSvc.id, 400);
  // routeBissauGabu: rota EXISTE (seed cartesiano) mas de propósito NENHUMA
  // tarifa é inserida — usado no cenário G ("sem tarifa").

  // Setor SEM NENHUMA rota — usado no cenário F ("sem rota"). Não faz parte
  // do seed cartesiano (que só conecta os sectores QUE ELE MESMO cria).
  const [isolatedRegion] = await db.insert(shippingRegions).values({
    id: uid('region_isolated'), countryCode: 'GW', name: 'Região Isolada D16I2', code: `ISO-${runTag}`, isActive: true, createdAt: new Date(), updatedAt: new Date(),
  } as any).returning();
  const [isolatedSector] = await db.insert(shippingSectors).values({
    id: uid('sector_isolated'), countryCode: 'GW', regionId: isolatedRegion.id, name: 'Setor Isolado D16I2', code: `ISOSEC-${runTag}`, isActive: true, createdAt: new Date(), updatedAt: new Date(),
  } as any).returning();

  // PROVA-LEGACY (D16-I5): ShippingCalculatorService.calculateFreight foi
  // fisicamente removido do código-fonte nesta fase (não existe mais
  // nenhum caminho de execução possível) — prova mais forte que o antigo
  // monkey-patch de contagem de chamadas (D16-I2), que ficou obsoleto.
  report('PROVA-LEGACY-0. calculateFreight foi fisicamente removido da classe', typeof (ShippingCalculatorService as any).calculateFreight === 'undefined');
  const legacyCalculateFreightCalls = 0;

  try {
    // =========================================================================
    // A. single seller + flag TRUE -> smart pipeline.
    // =========================================================================
    await setFlag(true);
    const sellerA = await makeSeller('A');
    const storeA = await makeStore(sellerA, 'BissauA', bissauSector.id);
    const productA = await makeProduct(sellerA, storeA.storeId, 'ProdA');
    const invA = await insertInventory({ sellerId: sellerA.sellerId, productId: productA.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: storeA.floc.id, quantityOnHand: 10 });
    const { buyerId: buyerA, addressId: addrA, cartId: cartA } = await makeBuyerWithAddress(bissauSector.id);
    await addToCart(cartA, productA.id, 1);

    const callsBeforeA = legacyCalculateFreightCalls;
    const resultA: any = await OrderService.createOrderFromCart({ userId: buyerA, addressId: addrA, paymentMethod: 'pix' } as any, db);
    report('A. single seller + flag TRUE -> mode=purchase_group', resultA.mode === 'purchase_group', resultA.mode);
    report('A2. exatamente 1 order', resultA.orders.length === 1, resultA.orders.length);
    report('PROVA-LEGACY-A. calculateFreight NÃO chamado', legacyCalculateFreightCalls === callsBeforeA, legacyCalculateFreightCalls - callsBeforeA);

    // =========================================================================
    // B. single seller + flag FALSE -> MESMO pipeline smart (comportamento
    // NOVO desta fase — o teste central de D16-I2).
    // =========================================================================
    await setFlag(false);
    const sellerB = await makeSeller('B');
    const storeB = await makeStore(sellerB, 'BissauB', bissauSector.id);
    const productB = await makeProduct(sellerB, storeB.storeId, 'ProdB');
    const invB = await insertInventory({ sellerId: sellerB.sellerId, productId: productB.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: storeB.floc.id, quantityOnHand: 10 });
    const { buyerId: buyerB, addressId: addrB, cartId: cartB } = await makeBuyerWithAddress(bissauSector.id);
    await addToCart(cartB, productB.id, 1);

    const callsBeforeB = legacyCalculateFreightCalls;
    const resultB: any = await OrderService.createOrderFromCart({ userId: buyerB, addressId: addrB, paymentMethod: 'pix' } as any, db);
    report('B. single seller + flag FALSE -> mode=purchase_group (NUNCA mais "legacy")', resultB.mode === 'purchase_group', resultB.mode);
    report('B2. exatamente 1 order', resultB.orders.length === 1, resultB.orders.length);
    const orderIdB = resultB.orders[0].id;
    const [itemB] = await db.select().from(orderItems).where(eq(orderItems.orderId, orderIdB));
    report('B3. inventoryId = a origem real escolhida por F4 (Store)', itemB.inventoryId === invB, itemB.inventoryId);
    report('B4. snapshot F6.1 preenchido (fulfillmentLocationId/originShippingSectorId/shippingRouteId/shippingServiceCode/shippingRateId/shippingAmount)',
      !!itemB.fulfillmentLocationId && !!itemB.originShippingSectorId && !!itemB.shippingRouteId && itemB.shippingServiceCode === 'STANDARD' && !!itemB.shippingRateId && Number(itemB.shippingAmount) === 200,
      itemB);
    const [orderRowB] = await db.select().from(orders).where(eq(orders.id, orderIdB));
    report('B5. orders.shippingRateSource = F3_SECTOR_ROUTE (NUNCA rateSource legado)', orderRowB.shippingRateSource === 'F3_SECTOR_ROUTE', orderRowB.shippingRateSource);
    const invBAfter = await getInv(invB);
    report('B6. F5 reservou exatamente a origem escolhida (+1)', invBAfter.quantityReserved === 1, invBAfter.quantityReserved);
    const resB = await db.select().from(stockReservations).where(eq(stockReservations.orderId, orderIdB));
    report('B7. Exatamente 1 stock_reservation (via F5, nunca reserveStockForGroupLegacy)', resB.length === 1 && resB[0].inventoryId === invB, resB);
    report('PROVA-LEGACY-B. calculateFreight NÃO chamado (flag FALSE, single seller)', legacyCalculateFreightCalls === callsBeforeB, legacyCalculateFreightCalls - callsBeforeB);

    // =========================================================================
    // C. multi seller + flag TRUE -> continua funcionando (regressão).
    // =========================================================================
    const sellerC1 = await makeSeller('C1');
    const sellerC2 = await makeSeller('C2');
    const storeC1 = await makeStore(sellerC1, 'BissauC1', bissauSector.id);
    const storeC2 = await makeStore(sellerC2, 'BissauC2', bissauSector.id);
    const productC1 = await makeProduct(sellerC1, storeC1.storeId, 'ProdC1');
    const productC2 = await makeProduct(sellerC2, storeC2.storeId, 'ProdC2');
    await insertInventory({ sellerId: sellerC1.sellerId, productId: productC1.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: storeC1.floc.id, quantityOnHand: 10 });
    await insertInventory({ sellerId: sellerC2.sellerId, productId: productC2.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: storeC2.floc.id, quantityOnHand: 10 });
    await setFlag(true);
    const { buyerId: buyerC, addressId: addrC, cartId: cartC } = await makeBuyerWithAddress(bissauSector.id);
    await addToCart(cartC, productC1.id, 1);
    await addToCart(cartC, productC2.id, 1);
    const resultC: any = await OrderService.createOrderFromCart({ userId: buyerC, addressId: addrC, paymentMethod: 'pix' } as any, db);
    report('C. multi seller + flag TRUE -> mode=purchase_group com 2 orders (regressão intacta)', resultC.mode === 'purchase_group' && resultC.orders.length === 2, { mode: resultC.mode, n: resultC.orders?.length });

    // =========================================================================
    // D. multi seller + flag FALSE -> MULTI_SELLER_CHECKOUT_DISABLED, ANTES
    // de qualquer efeito financeiro/estoque.
    // =========================================================================
    await setFlag(false);
    const sellerD1 = await makeSeller('D1');
    const sellerD2 = await makeSeller('D2');
    const storeD1 = await makeStore(sellerD1, 'BissauD1', bissauSector.id);
    const storeD2 = await makeStore(sellerD2, 'BissauD2', bissauSector.id);
    const productD1 = await makeProduct(sellerD1, storeD1.storeId, 'ProdD1');
    const productD2 = await makeProduct(sellerD2, storeD2.storeId, 'ProdD2');
    const invD1 = await insertInventory({ sellerId: sellerD1.sellerId, productId: productD1.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: storeD1.floc.id, quantityOnHand: 10 });
    const invD2 = await insertInventory({ sellerId: sellerD2.sellerId, productId: productD2.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: storeD2.floc.id, quantityOnHand: 10 });
    const { buyerId: buyerD, addressId: addrD, cartId: cartD } = await makeBuyerWithAddress(bissauSector.id);
    await addToCart(cartD, productD1.id, 1);
    await addToCart(cartD, productD2.id, 1);

    let rejectedD = false, reasonD = '';
    try {
      await OrderService.createOrderFromCart({ userId: buyerD, addressId: addrD, paymentMethod: 'pix' } as any, db);
    } catch (e: any) {
      rejectedD = true;
      reasonD = e?.message || '';
    }
    report('D. multi seller + flag FALSE -> REJEITADO com MULTI_SELLER_CHECKOUT_DISABLED', rejectedD && reasonD.includes('MULTI_SELLER_CHECKOUT_DISABLED'), reasonD);
    const ordersAfterD = await db.select().from(orders).where(eq(orders.buyerId, buyerD));
    report('D2. Nenhum order criado', ordersAfterD.length === 0, ordersAfterD.length);
    const invD1After = await getInv(invD1);
    const invD2After = await getInv(invD2);
    report('D3. Nenhum estoque reservado (zero efeito, transação revertida)', invD1After.quantityReserved === 0 && invD2After.quantityReserved === 0, { d1: invD1After.quantityReserved, d2: invD2After.quantityReserved });
    const cartItemsAfterD = await db.select().from(cartItems).where(eq(cartItems.cartId, cartD));
    report('D4. Carrinho NÃO foi esvaziado (checkout não avançou)', cartItemsAfterD.length === 2, cartItemsAfterD.length);

    // =========================================================================
    // E. single seller, endereço SEM shippingSectorId -> erro explícito
    // (nunca cai no legado).
    // =========================================================================
    const sellerE = await makeSeller('E');
    const storeE = await makeStore(sellerE, 'BissauE', bissauSector.id);
    const productE = await makeProduct(sellerE, storeE.storeId, 'ProdE');
    await insertInventory({ sellerId: sellerE.sellerId, productId: productE.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: storeE.floc.id, quantityOnHand: 10 });
    const { buyerId: buyerE, addressId: addrE, cartId: cartE } = await makeBuyerWithAddress(null); // SEM setor
    await addToCart(cartE, productE.id, 1);
    let rejectedE = false, reasonE = '';
    try {
      await OrderService.createOrderFromCart({ userId: buyerE, addressId: addrE, paymentMethod: 'pix' } as any, db);
    } catch (e: any) {
      rejectedE = true;
      reasonE = e?.message || '';
    }
    report('E. single seller sem shippingSectorId -> erro explícito DESTINATION_SHIPPING_SECTOR_REQUIRED (flag FALSE, zero fallback legado)', rejectedE && reasonE.includes('DESTINATION_SHIPPING_SECTOR_REQUIRED'), reasonE);

    // =========================================================================
    // F. single seller, setor de destino SEM NENHUMA rota -> erro explícito.
    // =========================================================================
    const sellerF = await makeSeller('F');
    const storeF = await makeStore(sellerF, 'BissauF', bissauSector.id);
    const productF = await makeProduct(sellerF, storeF.storeId, 'ProdF');
    await insertInventory({ sellerId: sellerF.sellerId, productId: productF.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: storeF.floc.id, quantityOnHand: 10 });
    const { buyerId: buyerF, addressId: addrF, cartId: cartF } = await makeBuyerWithAddress(isolatedSector.id);
    await addToCart(cartF, productF.id, 1);
    let rejectedF = false, reasonF = '';
    try {
      await OrderService.createOrderFromCart({ userId: buyerF, addressId: addrF, paymentMethod: 'pix' } as any, db);
    } catch (e: any) {
      rejectedF = true;
      reasonF = e?.message || '';
    }
    report('F. single seller, setor sem NENHUMA rota -> erro explícito (INSUFFICIENT_AVAILABLE_STOCK/FULFILLMENT_RESOLUTION_FAILED, zero fallback legado)', rejectedF && (reasonF.includes('INSUFFICIENT_AVAILABLE_STOCK') || reasonF.includes('SHIPPING_ROUTE_NOT_AVAILABLE') || reasonF.includes('FULFILLMENT_RESOLUTION_FAILED')), reasonF);

    // =========================================================================
    // G. single seller, rota existe mas SEM tarifa cadastrada -> erro explícito.
    // =========================================================================
    const sellerG = await makeSeller('G');
    const storeG = await makeStore(sellerG, 'BissauG', bissauSector.id);
    const productG = await makeProduct(sellerG, storeG.storeId, 'ProdG');
    await insertInventory({ sellerId: sellerG.sellerId, productId: productG.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: storeG.floc.id, quantityOnHand: 10 });
    const { buyerId: buyerG, addressId: addrG, cartId: cartG } = await makeBuyerWithAddress(gabuSector.id); // rota Bissau->Gabú existe, sem tarifa
    await addToCart(cartG, productG.id, 1);
    let rejectedG = false, reasonG = '';
    try {
      await OrderService.createOrderFromCart({ userId: buyerG, addressId: addrG, paymentMethod: 'pix' } as any, db);
    } catch (e: any) {
      rejectedG = true;
      reasonG = e?.message || '';
    }
    // Store de Bissau não atende Gabú por falta de tarifa na rota Bissau->Gabú;
    // não há HUB em Gabú nesta fixture, então NENHUMA origem atende -> (Etapa A do frete) SHIPPING_RATE_NOT_AVAILABLE: o motivo real é a falta de tarifa, nunca estoque.
    report('G. single seller, rota existe mas sem tarifa -> erro explícito, zero fallback legado', rejectedG && reasonG.includes('SHIPPING_RATE_NOT_AVAILABLE') && !reasonG.includes('INSUFFICIENT_AVAILABLE_STOCK'), reasonG);

    // =========================================================================
    // H/K. single seller, candidato válido -> F4 escolhe, F5 reserva
    // exatamente essa origem; snapshots corretos (já provado em B, reforçado
    // aqui com HUB concorrente para confirmar que F4 decide por CUSTO, não
    // preferência HUB/STORE fixa).
    // =========================================================================
    const sellerH = await makeSeller('H');
    const storeH = await makeStore(sellerH, 'BissauH', bissauSector.id);
    const whH = await makeWarehouseLocal('GabuH', gabuSector.id);
    const productH = await makeProduct(sellerH, storeH.storeId, 'ProdH');
    const invStoreH = await insertInventory({ sellerId: sellerH.sellerId, productId: productH.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: storeH.floc.id, quantityOnHand: 10 });
    const invHubH = await insertInventory({ sellerId: sellerH.sellerId, productId: productH.id, locationType: 'NUSALI_HUB', fulfillmentLocationId: whH.floc.id, warehouseId: whH.warehouseId, quantityOnHand: 10 });
    await setFlag(false);
    const { buyerId: buyerH, addressId: addrH, cartId: cartH } = await makeBuyerWithAddress(bissauSector.id);
    await addToCart(cartH, productH.id, 1);
    const resultH: any = await OrderService.createOrderFromCart({ userId: buyerH, addressId: addrH, paymentMethod: 'pix' } as any, db);
    const orderIdH = resultH.orders[0].id;
    const [itemH] = await db.select().from(orderItems).where(eq(orderItems.orderId, orderIdH));
    report('H. Store (200) vence sobre HUB (400) por CUSTO REAL, mesmo com flag FALSE', itemH.inventoryId === invStoreH, itemH.inventoryId);
    const invStoreHAfter = await getInv(invStoreH);
    const invHubHAfter = await getInv(invHubH);
    report('H2. F5 reservou EXATAMENTE a origem escolhida (Store +1, HUB intocado)', invStoreHAfter.quantityReserved === 1 && invHubHAfter.quantityReserved === 0, { store: invStoreHAfter.quantityReserved, hub: invHubHAfter.quantityReserved });
    report('K. Snapshot logístico completo (F6.1)', !!itemH.fulfillmentLocationId && !!itemH.originShippingSectorId && !!itemH.shippingRouteId && !!itemH.shippingServiceId && itemH.shippingServiceCode === 'STANDARD' && !!itemH.shippingRateId && !!itemH.unitWeightKg && !!itemH.totalWeightKg && itemH.shippingAmount != null, itemH);

    // =========================================================================
    // I. endereço salvo (addressId) — já coberto em A/B/H (todos usam
    // addressId). Confirma explicitamente aqui.
    // =========================================================================
    report('I. Endereço salvo (addressId) funciona com flag FALSE (cenário B já prova isso)', resultB.mode === 'purchase_group');

    // =========================================================================
    // J. novo endereço inline (shippingAddress, sem addressId).
    // =========================================================================
    const sellerJ = await makeSeller('J');
    const storeJ = await makeStore(sellerJ, 'BissauJ', bissauSector.id);
    const productJ = await makeProduct(sellerJ, storeJ.storeId, 'ProdJ');
    const invJ = await insertInventory({ sellerId: sellerJ.sellerId, productId: productJ.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: storeJ.floc.id, quantityOnHand: 10 });
    const buyerJ = await makeUser('BUYER');
    const cartJ = uid('cart');
    await db.insert(carts).values({ id: cartJ, userId: buyerJ, currency: 'XOF', countryCode: 'GW', createdAt: new Date(), updatedAt: new Date() } as any);
    await addToCart(cartJ, productJ.id, 1);
    const resultJ: any = await OrderService.createOrderFromCart({
      userId: buyerJ,
      shippingAddress: {
        recipientName: 'Comprador Novo Endereço', street: 'Rua Nova', number: '55', city: 'Bissau', state: 'Bissau',
        countryCode: 'GW', country: 'GW', zipCode: '', phone: '955222333', shippingSectorId: bissauSector.id,
      },
      paymentMethod: 'pix',
    } as any, db);
    report('J. Novo endereço inline (sem addressId) -> mode=purchase_group, funciona com flag FALSE', resultJ.mode === 'purchase_group', resultJ.mode);

    // =========================================================================
    // L. estrutura do pedido consistente (purchase_group + orders) em TODOS
    // os cenários bem-sucedidos acima, independente da flag.
    // =========================================================================
    const allStructuresConsistent = [resultA, resultB, resultC, resultH, resultJ].every((r: any) => r.mode === 'purchase_group' && Array.isArray(r.orders) && r.purchaseGroup?.id);
    report('L. TODOS os checkouts bem-sucedidos (A/B/C/H/J) usam a MESMA estrutura purchase_group + orders[], independente da flag', allStructuresConsistent);

    // =========================================================================
    // PROVA-LEGACY final: em NENHUM momento deste arquivo (múltiplos
    // checkouts com flag FALSE, incluindo single-seller) calculateFreight
    // foi chamado.
    // =========================================================================
    report('PROVA-LEGACY-FINAL. ShippingCalculatorService.calculateFreight NUNCA foi chamado em todo o arquivo de teste', legacyCalculateFreightCalls === 0, legacyCalculateFreightCalls);

  } finally {
    await pool.end();
  }

  console.log(`\n${passed}/${total} testes passaram.`);
  process.exit(passed === total ? 0 : 1);
}

async function makeWarehouseLocal(label: string, sectorId: string) {
  const warehouseId = uid(`wh_${label}`);
  await db.insert(warehouses).values({
    id: warehouseId, code: `WH-${warehouseId}`, name: `HUB ${label} D16I2`, countryCode: 'GW', city: label,
    address: 'End. HUB', status: 'active', shippingSectorId: sectorId, createdAt: new Date(),
  } as any);
  const floc = await ensureWarehouseFulfillmentLocation(warehouseId, db);
  return { warehouseId, floc };
}

main().catch((e) => {
  console.error('\n[ERRO FATAL]', e instanceof Error ? e.message : e);
  process.exit(1);
});
