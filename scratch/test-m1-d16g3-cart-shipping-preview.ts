/**
 * FASE D16-G3 — Unificar prévia de frete do Carrinho/Checkout com F3/F4.
 * Testes reais contra Postgres Docker isolado (NUNCA staging/produção).
 * Mesmo padrão de fixtures do D16-G2 (test-m1-d16g2-shipping-preview.ts).
 *
 * Cenários A-T do enunciado.
 */
import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';

const testDbUrl = assertLedgerTestDatabaseGuard();
process.env.DATABASE_URL = testDbUrl;

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import {
  users, sellers, stores, categories, countries, productVariants,
  inventory, warehouses, stockReservations, inventoryMovements, orders, payments, escrowAccounts,
  shippingSectors, shippingRoutes, shippingServices, shippingRouteRates, shippingRegions,
} from '../src/db/schema.js';
import { seedGuineaBissauShippingGeography } from '../src/server/modules/shipping/shippingGeographyService.js';
import { ensureStoreFulfillmentLocation, ensureWarehouseFulfillmentLocation } from '../src/server/modules/logistics/fulfillmentLocationService.js';
import { ProductCreationService } from '../src/server/modules/catalog/productCreationService.js';
import { resolveShippingPreview, resolveCartShippingPreview } from '../src/server/modules/shipping/shippingPreviewService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const pool = new pg.Pool({ connectionString: testDbUrl, ssl: false });
const db = drizzle(pool, { schema });

let passed = 0, total = 0;
function report(label: string, ok: boolean, detail?: any) {
  total++; if (ok) passed++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${detail !== undefined ? ' -> ' + JSON.stringify(detail) : ''}`);
}
let seq = 0;
const uid = (p: string) => `${p}_g3_${Date.now()}_${++seq}_${Math.random().toString(36).slice(2, 6)}`;
const runTag = uid('run');

async function makeSeller(label: string) {
  const userId = uid(`usr_${label}`);
  await db.insert(users).values({
    id: userId, email: `${userId}@t.test`, passwordHash: 'x', fullName: `Seller ${label}`,
    phone: '11999990000', role: 'SELLER', countryCode: 'GW', kycStatus: 'verified', riskScore: 'baixo',
    isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const sellerId = uid(`seller_${label}`);
  await db.insert(sellers).values({
    id: sellerId, userId, companyName: `Loja ${label}`, tradingName: `Loja ${label}`,
    taxId: '00000000000', phone: '11999990000', countryCode: 'GW', status: 'active', createdAt: new Date(), updatedAt: new Date(),
  } as any);
  return { userId, sellerId };
}

async function makeStore(seller: { sellerId: string; userId: string }, label: string, sectorId: string) {
  const addressId = uid(`addr_${label}`);
  await db.insert(schema.addresses).values({
    id: addressId, userId: seller.userId, recipientName: `Loja ${label}`, street: `Rua ${label}`, number: '1',
    city: label, state: label, countryCode: 'GW', phone: '955000000', isDefault: false, addressType: 'business',
    shippingSectorId: sectorId, createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const storeId = uid(`store_${label}`);
  await db.insert(stores).values({
    id: storeId, sellerId: seller.sellerId, name: `Loja ${label} D16G3`, slug: `loja-${label.toLowerCase()}-${runTag}-${storeId}`,
    countryCode: 'GW', status: 'active', operationalAddressId: addressId, createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const floc = await ensureStoreFulfillmentLocation(storeId, db);
  return { storeId, floc };
}

async function makeWarehouse(label: string, sectorId: string | null) {
  const warehouseId = uid(`wh_${label}`);
  await db.insert(warehouses).values({
    id: warehouseId, code: `WH-${warehouseId}`, name: `HUB ${label} D16G3`, countryCode: 'GW', city: label,
    address: 'End. HUB', status: 'active', shippingSectorId: sectorId, createdAt: new Date(),
  } as any);
  const floc = await ensureWarehouseFulfillmentLocation(warehouseId, db);
  return { warehouseId, floc };
}

const categoryIdPromise = (async () => {
  const categoryId = uid('cat');
  await db.insert(categories).values({ id: categoryId, name: 'Categoria D16G3', slug: `cat-d16g3-${runTag}`, isActive: true, createdAt: new Date() } as any);
  return categoryId;
})();

async function makeProduct(seller: { userId: string }, storeId: string, title: string, weightKg = 0.2, opts: { variants?: any[] } = {}) {
  const categoryId = await categoryIdPromise;
  const product: any = await ProductCreationService.createProduct(seller.userId, {
    title: `${title} ${runTag}`, price: 100, image: 'x.jpg', categoryId, storeId,
    weightKg, dimensionsCm: { length: 5, width: 5, height: 5 }, stock: 0,
    variants: opts.variants as any,
  } as any, db);
  await db.delete(inventory).where(eq(inventory.productId, product.id));
  return product;
}

async function insertInventory(opts: {
  sellerId: string; productId: string; variantId?: string | null; locationType: 'SELLER_LOCATION' | 'NUSALI_HUB';
  fulfillmentLocationId: string | null; warehouseId?: string | null; quantityOnHand: number; quantityReserved?: number;
}) {
  const id = uid('inv');
  await db.insert(inventory).values({
    id, locationType: opts.locationType, sellerId: opts.sellerId, warehouseId: opts.warehouseId || null,
    productId: opts.productId, variantId: opts.variantId || null, quantityOnHand: opts.quantityOnHand,
    quantityReserved: opts.quantityReserved || 0, minimumStockLevel: 0, fulfillmentLocationId: opts.fulfillmentLocationId,
    createdAt: new Date(), updatedAt: new Date(),
  } as any);
  return id;
}

async function insertRate(routeId: string, serviceId: string, amount: number, minWeightKg = '0', maxWeightKg = '5') {
  await db.insert(shippingRouteRates).values({
    id: uid('rate'), routeId, serviceId, minWeightKg, maxWeightKg,
    amount: String(amount), currency: 'XOF', isActive: true, createdAt: new Date(), updatedAt: new Date(),
  } as any);
}

async function dbSnapshot() {
  const [invRows, resRows, movRows, ordRows, payRows, escrowRows] = await Promise.all([
    db.select().from(inventory),
    db.select().from(stockReservations),
    db.select().from(inventoryMovements),
    db.select().from(orders),
    db.select().from(payments),
    db.select().from(escrowAccounts),
  ]);
  return {
    invCount: invRows.length,
    invTotalReserved: invRows.reduce((s, r: any) => s + r.quantityReserved, 0),
    resCount: resRows.length, movCount: movRows.length, ordCount: ordRows.length,
    payCount: payRows.length, escrowCount: escrowRows.length,
  };
}

async function main() {
  await db.insert(countries).values([
    { id: 'GW', code: 'GW', name: 'Guiné-Bissau', flag: '🇬🇼', currency: 'XOF', currencySymbol: 'CFA', phonePrefix: '+245', isActive: true, createdAt: new Date() },
  ] as any).onConflictDoNothing();
  await seedGuineaBissauShippingGeography(db);

  const [bissauSector] = await db.select().from(shippingSectors).where(and(eq(shippingSectors.countryCode, 'GW'), eq(shippingSectors.name, 'Bissau')));
  const [standardSvc] = await db.select().from(shippingServices).where(and(eq(shippingServices.countryCode, 'GW'), eq(shippingServices.code, 'STANDARD')));
  const [routeBissauBissau] = await db.select().from(shippingRoutes).where(and(eq(shippingRoutes.countryCode, 'GW'), eq(shippingRoutes.originSectorId, bissauSector.id), eq(shippingRoutes.destinationSectorId, bissauSector.id)));

  // Faixa 1: 0-1kg = 200 XOF. Faixa 2: 1-5kg = 400 XOF (para o cenário B, peso maior).
  await insertRate(routeBissauBissau.id, standardSvc.id, 200, '0', '1');
  await insertRate(routeBissauBissau.id, standardSvc.id, 400, '1', '5');

  const snapBefore0 = await dbSnapshot();

  // ===========================================================================
  // A — 1 seller, 1 produto, 1 variante, qty 1, Bissau->Bissau, rate 200.
  // ===========================================================================
  const sellerA = await makeSeller('A');
  const storeA = await makeStore(sellerA, 'Bissau', bissauSector.id);
  const productA: any = await makeProduct(sellerA, storeA.storeId, 'Calcinha Love', 0.2);
  await insertInventory({ sellerId: sellerA.sellerId, productId: productA.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: storeA.floc.id, quantityOnHand: 100 });

  const resultSingleA = await resolveShippingPreview({ productId: productA.id, quantity: 1, destinationShippingSectorId: bissauSector.id }, db);
  report('S. resolveShippingPreview (Product Detail) continua funcionando via F3/F4, inalterado', resultSingleA.ok === true && (resultSingleA as any).available === true && (resultSingleA as any).shippingAmount === 200);

  const resultA = await resolveCartShippingPreview({ destinationShippingSectorId: bissauSector.id, items: [{ productId: productA.id, quantity: 1 }] }, db);
  report('A. 1 seller/1 produto/qty 1 -> preview 200 (mesmo valor do Product Detail)', resultA.ok === true && (resultA as any).available === true && (resultA as any).shippingChargedToBuyer === 200, resultA);
  report('A2. Product Detail e Cart preview retornam EXATAMENTE o mesmo valor para o mesmo item/quantidade/destino', resultA.ok === true && (resultA as any).shippingChargedToBuyer === (resultSingleA as any).shippingAmount);

  // ===========================================================================
  // B — mesma linha, quantidade maior -> peso total cruza para a faixa de
  // 1-5kg (400 XOF). 0.2kg x 6 = 1.2kg -> faixa [1,5).
  // ===========================================================================
  const resultB = await resolveCartShippingPreview({ destinationShippingSectorId: bissauSector.id, items: [{ productId: productA.id, quantity: 6 }] }, db);
  report('B. qty maior (peso total cruza para faixa 1-5kg) -> preview 400 (faixa correta segundo F3)', resultB.ok === true && (resultB as any).available === true && (resultB as any).shippingChargedToBuyer === 400, resultB);

  // ===========================================================================
  // C — 2 linhas do MESMO seller/origem -> UMA expedição (Etapa D do checkout:
  // consolidação de peso): 0,2 + 0,2 = 0,4 kg, faixa [0,1) = 200 (antes: soma
  // aditiva 200+200 = 400, que cobrava duas vezes o mesmo volume).
  // ===========================================================================
  const productA2: any = await makeProduct(sellerA, storeA.storeId, 'Produto A2', 0.2);
  await insertInventory({ sellerId: sellerA.sellerId, productId: productA2.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: storeA.floc.id, quantityOnHand: 100 });
  const resultC = await resolveCartShippingPreview({
    destinationShippingSectorId: bissauSector.id,
    items: [{ productId: productA.id, quantity: 1 }, { productId: productA2.id, quantity: 1 }],
  }, db);
  report('C. 2 linhas mesmo seller/origem (0,2+0,2 kg) -> UMA expedição consolidada: faixa do peso total = 200', resultC.ok === true && (resultC as any).available === true && (resultC as any).shippingChargedToBuyer === 200, resultC);
  report('C2. 2 linhas mesmo seller -> UM único grupo em `sellers` (mesmo sellerId)', resultC.ok === true && (resultC as any).sellers.length === 1);

  // ===========================================================================
  // D — 2 sellers -> shipping independente por seller, total = soma dos grupos.
  // ===========================================================================
  const sellerB = await makeSeller('B');
  const storeB = await makeStore(sellerB, 'BissauB', bissauSector.id);
  const productB: any = await makeProduct(sellerB, storeB.storeId, 'Produto B', 0.2);
  await insertInventory({ sellerId: sellerB.sellerId, productId: productB.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: storeB.floc.id, quantityOnHand: 100 });
  const resultD = await resolveCartShippingPreview({
    destinationShippingSectorId: bissauSector.id,
    items: [{ productId: productA.id, quantity: 1 }, { productId: productB.id, quantity: 1 }],
  }, db);
  report('D. 2 sellers (200+200) -> total 400', resultD.ok === true && (resultD as any).available === true && (resultD as any).shippingChargedToBuyer === 400, resultD);
  report('D2. 2 sellers -> DOIS grupos independentes em `sellers`', resultD.ok === true && (resultD as any).sellers.length === 2);
  report('D3. Cada grupo tem seu próprio sellerId real (do banco, não inventado)', resultD.ok === true && new Set((resultD as any).sellers.map((s: any) => s.sellerId)).size === 2 &&
    [sellerA.sellerId, sellerB.sellerId].every((id) => (resultD as any).sellers.some((s: any) => s.sellerId === id)));

  // ===========================================================================
  // E — peso da variante é autoritativo: o input NUNCA aceita weight.
  // ===========================================================================
  const shippingPreviewSrc = fs.readFileSync(path.join(ROOT, 'src/server/modules/shipping/shippingPreviewService.ts'), 'utf8');
  report('E. CartShippingPreviewLineInput NUNCA tem campo weight/weightKg (peso é sempre resolvido via F4, nunca aceito do cliente)', !/CartShippingPreviewLineInput \{[\s\S]*?weight/i.test(shippingPreviewSrc.match(/export interface CartShippingPreviewLineInput \{[\s\S]*?\}/)?.[0] || ''));
  report('E2. resolveFulfillmentCandidates é chamado SEM nenhum parâmetro de peso (peso resolvido internamente pelo F4)', /resolveFulfillmentCandidates\(\{\s*sellerId: product\.sellerId,\s*productId: input\.productId,\s*variantId: input\.variantId \|\| null,\s*quantity,\s*destinationShippingSectorId: input\.destinationShippingSectorId,\s*countryCode: sectorRow\.countryCode,\s*(serviceCode: serviceCode \|\| undefined,\s*)?\}/.test(shippingPreviewSrc));

  // ===========================================================================
  // F/G — sellerId e rate/tarifa falsos no payload são ignorados: o TYPE
  // de entrada nem aceita esses campos, e o valor real vem do banco.
  // ===========================================================================
  const cartInputBlock = shippingPreviewSrc.match(/export interface CartShippingPreviewLineInput \{[\s\S]*?\}/)?.[0] || '';
  report('F. CartShippingPreviewLineInput NUNCA aceita sellerId (só productId/variantId/quantity)', !/sellerId/.test(cartInputBlock));
  report('G. CartShippingPreviewLineInput NUNCA aceita rate/shippingAmount/price (tarifa sempre resolvida no backend)', !/rate|shippingAmount|price/i.test(cartInputBlock));
  // Prova em runtime: mesmo se alguém tentasse "forjar" via `as any`, o
  // resultado usa sellerId de productA (do banco), nunca um valor diferente.
  const forgedResult: any = await resolveCartShippingPreview({
    destinationShippingSectorId: bissauSector.id,
    items: [{ productId: productA.id, quantity: 1, sellerId: 'seller_hacker_forjado', shippingAmount: 1 } as any],
  }, db);
  report('F2. sellerId forjado no payload é ignorado — resultado usa o sellerId REAL do produto (do banco)', forgedResult.ok === true && forgedResult.available === true && forgedResult.sellers[0].sellerId === sellerA.sellerId);
  report('G2. shippingAmount forjado (1) no payload é ignorado — resultado usa a tarifa REAL (200), nunca 1', forgedResult.ok === true && forgedResult.available === true && forgedResult.shippingChargedToBuyer === 200);

  // ===========================================================================
  // H — destination sector ausente -> erro explícito, ZERO fallback legacy.
  // ===========================================================================
  const resultH = await resolveCartShippingPreview({ destinationShippingSectorId: null, items: [{ productId: productA.id, quantity: 1 }] }, db);
  report('H. destinationShippingSectorId ausente -> DELIVERY_SECTOR_REQUIRED (nunca uma tarifa legada/inventada)', resultH.ok === true && (resultH as any).available === false && (resultH as any).code === 'DELIVERY_SECTOR_REQUIRED', resultH);

  // ===========================================================================
  // I — sem rota cadastrada -> indisponível, ZERO fallback legacy.
  // ===========================================================================
  const farimRegionId = uid('region_farim');
  await db.insert(shippingRegions).values({ id: farimRegionId, countryCode: 'GW', name: 'Farim Region', code: `FARIM-${runTag}`, isActive: true, createdAt: new Date(), updatedAt: new Date() } as any);
  const farimSectorId = uid('sector_farim');
  await db.insert(shippingSectors).values({ id: farimSectorId, countryCode: 'GW', regionId: farimRegionId, name: 'Farim', code: `FARIM-${runTag}`, isActive: true, createdAt: new Date(), updatedAt: new Date() } as any);
  const sellerI = await makeSeller('I');
  const storeI = await makeStore(sellerI, 'Farim', farimSectorId);
  const productI: any = await makeProduct(sellerI, storeI.storeId, 'ProdutoI', 0.2);
  await insertInventory({ sellerId: sellerI.sellerId, productId: productI.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: storeI.floc.id, quantityOnHand: 10 });
  const resultI = await resolveCartShippingPreview({ destinationShippingSectorId: bissauSector.id, items: [{ productId: productI.id, quantity: 1 }] }, db);
  report('I. Origem Farim -> destino Bissau (sem rota) -> indisponível (SHIPPING_ROUTE_NOT_AVAILABLE), zero fallback legacy', resultI.ok === true && (resultI as any).available === false && (resultI as any).code === 'SHIPPING_ROUTE_NOT_AVAILABLE', resultI);

  // ===========================================================================
  // J — rota existe mas sem tarifa para o peso -> indisponível, zero fallback.
  // ===========================================================================
  const productJ: any = await makeProduct(sellerA, storeA.storeId, 'ProdutoJ', 50); // 50kg, fora de qualquer faixa cadastrada (0-5kg)
  await insertInventory({ sellerId: sellerA.sellerId, productId: productJ.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: storeA.floc.id, quantityOnHand: 10 });
  const resultJ = await resolveCartShippingPreview({ destinationShippingSectorId: bissauSector.id, items: [{ productId: productJ.id, quantity: 1 }] }, db);
  report('J. Peso (50kg) sem faixa cadastrada -> indisponível (SHIPPING_RATE_NOT_AVAILABLE), zero fallback legacy', resultJ.ok === true && (resultJ as any).available === false && (resultJ as any).code === 'SHIPPING_RATE_NOT_AVAILABLE', resultJ);

  // ===========================================================================
  // K — estoque de OUTRO seller nunca é candidato (mesma garantia do F4,
  // reconfirmada no contexto do preview de carrinho).
  // ===========================================================================
  const productK: any = await makeProduct(sellerB, storeB.storeId, 'ProdutoK', 0.2);
  // Nenhum inventory para productK em lugar nenhum -> deve ser indisponível
  // por falta de estoque, NUNCA "encontrar" o estoque de sellerA/productA.
  const resultK = await resolveCartShippingPreview({ destinationShippingSectorId: bissauSector.id, items: [{ productId: productK.id, quantity: 1 }] }, db);
  report('K. Produto sem NENHUM inventory próprio -> indisponível (nunca usa estoque de outro seller/produto)', resultK.ok === true && (resultK as any).available === false, resultK);

  // ===========================================================================
  // L/M/N/O/P — preview é 100% read-only: zero reserva, zero mutação de
  // estoque, zero order/payment/escrow.
  // ===========================================================================
  const snapBeforeReadOnly = await dbSnapshot();
  await resolveCartShippingPreview({ destinationShippingSectorId: bissauSector.id, items: [{ productId: productA.id, quantity: 3 }, { productId: productB.id, quantity: 2 }] }, db);
  const snapAfterReadOnly = await dbSnapshot();
  report('L. Preview não cria stock_reservations', snapBeforeReadOnly.resCount === snapAfterReadOnly.resCount);
  report('M. Preview não altera quantityReserved (inventory)', snapBeforeReadOnly.invTotalReserved === snapAfterReadOnly.invTotalReserved);
  report('M2. Preview não cria/apaga linhas de inventory', snapBeforeReadOnly.invCount === snapAfterReadOnly.invCount);
  report('N. Preview não cria orders', snapBeforeReadOnly.ordCount === snapAfterReadOnly.ordCount);
  report('O. Preview não cria payments', snapBeforeReadOnly.payCount === snapAfterReadOnly.payCount);
  report('P. Preview não cria escrow_accounts', snapBeforeReadOnly.escrowCount === snapAfterReadOnly.escrowCount);
  report('M3. Preview não cria inventory_movements', snapBeforeReadOnly.movCount === snapAfterReadOnly.movCount);

  // ===========================================================================
  // Q/R — CartView/CheckoutView não chamam mais o motor legado em runtime.
  // ===========================================================================
  const cartViewSrc = fs.readFileSync(path.join(ROOT, 'src/components/CartView.tsx'), 'utf8');
  const checkoutViewSrc = fs.readFileSync(path.join(ROOT, 'src/components/CheckoutView.tsx'), 'utf8');
  const cartViewCodeOnly = cartViewSrc.replace(/\/\/.*$/gm, '');
  const checkoutViewCodeOnly = checkoutViewSrc.replace(/\/\/.*$/gm, '');
  report('Q. CartView.tsx nunca chama calculateMultiSellerFreight em runtime (import removido)', !/import.*calculateMultiSellerFreight/.test(cartViewCodeOnly) && !/\bcalculateMultiSellerFreight\(/.test(cartViewCodeOnly));
  report('Q2. CartView.tsx chama ShippingService.getCartPreview', /ShippingService\.getCartPreview\(/.test(cartViewCodeOnly));
  report('R. CheckoutView.tsx nunca chama calculateMultiSellerFreight em runtime (import removido)', !/import.*calculateMultiSellerFreight/.test(checkoutViewCodeOnly) && !/\bcalculateMultiSellerFreight\(/.test(checkoutViewCodeOnly));
  report('R2. CheckoutView.tsx chama ShippingService.getCartPreview', /ShippingService\.getCartPreview\(/.test(checkoutViewCodeOnly));

  // ===========================================================================
  // S — Product Detail continua usando F3/F4 (já confirmado no topo, S1;
  // reconfirmando aqui via inspeção estrutural do arquivo real).
  // ===========================================================================
  const productDetailSrc = fs.readFileSync(path.join(ROOT, 'src/components/ProductDetailView.tsx'), 'utf8');
  report('S2. ProductDetailView.tsx consulta a cotação do servidor pela API por serviço (getCartPreview — atualizado: antes getPreview de um só serviço), sem motor legado de frete', /ShippingService\.getCartPreview\(/.test(productDetailSrc.replace(/\/\/.*$/gm, '')) && !/calculateFreight|shippingRates/.test(productDetailSrc));

  // ===========================================================================
  // T — F6.2/orderService.ts permanece intocado (verificação estrutural:
  // este teste nunca importa OrderService, e a garantia real de "zero diff"
  // é feita via `git diff --stat` fora deste teste, arquivo protegido).
  // ===========================================================================
  const thisTestSrc = fs.readFileSync(path.join(ROOT, 'scratch/test-m1-d16g3-cart-shipping-preview.ts'), 'utf8');
  const thisTestImports = thisTestSrc.split('\n').filter((l) => /^import /.test(l)).join('\n');
  report('T. Este teste nunca importa OrderService (F6.2 não é exercitado nem tocado por este teste)', !/OrderService/.test(thisTestImports));

  // ===========================================================================
  // SHIPPING_PAYER_POLICY — sem política configurada (nenhuma
  // store_shipping_policies nem platformSettings.defaultShippingPolicyMode),
  // o valor cobrado do comprador deve ser EXATAMENTE a soma bruta das
  // cotações F3 (CUSTOMER_PAYS, a rede de segurança final) — confirma que a
  // política É aplicada (não um bypass silencioso) e que hoje, sem config
  // especial, buyer paga a quote integral.
  // ===========================================================================
  report('SHIPPING_PAYER_POLICY. Sem política especial configurada, shippingChargedToBuyer === shippingCost (CUSTOMER_PAYS, subsídio=0)', resultA.ok === true && (resultA as any).shippingChargedToBuyer === (resultA as any).shippingCost && (resultA as any).shippingSellerSubsidy === 0);

  await pool.end();
  console.log(`\n${passed}/${total} testes passaram.`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((e) => {
  console.error('\n[ERRO FATAL]', e instanceof Error ? e.message : e);
  process.exit(1);
});
