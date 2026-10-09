/**
 * FASE 8C.1 - reserva anterior a conversao percorrendo o fluxo REAL (pedido, conversao, confirmacao, despacho fisico, cancelamento, expiracao, concorrencia, rollback).
 * junto com o das variantes". Postgres 17 DESCARTAVEL. Nunca producao.
 *
 * Cada `report` descreve o comportamento DESEJADO. Contra o codigo atual (53f126d) varios FALHAM — isso e a prova do defeito;
 * depois da correcao proposta (docs/attribute-matrix/v1/stock-conversion-fix.patch) todos devem passar.
 * As linhas "OBSERVADO" imprimem os numeros reais para o relatorio.
 */
process.env.REDIS_URL = '';
import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';
const testDbUrl = assertLedgerTestDatabaseGuard();
process.env.DATABASE_URL = testDbUrl;
process.env.NODE_ENV = 'test';
process.env.SKIP_RUNTIME_ALIGN = 'true';
process.env.JWT_ACCESS_SECRET = 'stock8a_access_secret_0123456789abcdef';
import 'dotenv/config';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import { users, sellers, stores, categories, countries, addresses, platformSettings, shippingSectors, shippingRoutes, shippingServices, shippingRouteRates } from '../src/db/schema.js';
import { getJwtAccessSecret } from '../src/server/modules/auth/jwtConfig.js';
import { seedGuineaBissauShippingGeography } from '../src/server/modules/shipping/shippingGeographyService.js';
import { ProductCreationService } from '../src/server/modules/catalog/productCreationService.js';
import { OrderService } from '../src/server/modules/orders/orderService.js';
import { CatalogService, computeLiveStockAndSales } from '../src/server/modules/catalog/catalogService.js';
import { sellerRouter } from '../src/server/sellerRoutes.js';
import { buyerRouter } from '../src/server/buyerRoutes.js';

if (!['localhost', '127.0.0.1'].includes(new URL(testDbUrl).hostname)) throw new Error('Somente banco local descartavel.');
const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false }, max: 6 });
const db = drizzle(pool, { schema });
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 500)}`); };
const obs = (l: string, v: unknown) => console.log(`OBSERVADO  ${l}: ${JSON.stringify(v)}`);
const q = async (s: string, p?: any[]) => (await pool.query(s, p)).rows;
let seq = 0;
const uid = (p: string) => `${p}_s8_${Date.now()}_${++seq}_${Math.random().toString(36).slice(2, 6)}`;
async function makeUser(role: string) {
  const id = uid('usr');
  await db.insert(users).values({ id, email: `${id}@t.test`, passwordHash: 'x', fullName: `T ${id}`, phone: '11999990000', role, countryCode: 'GW', kycStatus: 'verified', riskScore: 'baixo', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date() } as any);
  return id;
}
const tok = (id: string, role: string) => jwt.sign({ userId: id, email: `${id}@t.test`, role, fullName: id, countryCode: 'GW', kycStatus: 'verified', isEmailVerified: true }, getJwtAccessSecret(), { expiresIn: '1h' });

async function main() {
  await db.insert(countries).values([{ id: 'GW', code: 'GW', name: 'Guiné-Bissau', flag: 'x', currency: 'XOF', currencySymbol: 'CFA', phonePrefix: '+245', isActive: true, createdAt: new Date() }] as any).onConflictDoNothing();
  await seedGuineaBissauShippingGeography(db);
  const [bissau] = await db.select().from(shippingSectors).where(and(eq(shippingSectors.countryCode, 'GW'), eq(shippingSectors.name, 'Bissau')));
  const [svc] = await db.select().from(shippingServices).where(and(eq(shippingServices.countryCode, 'GW'), eq(shippingServices.code, 'STANDARD')));
  const [route] = await db.select().from(shippingRoutes).where(and(eq(shippingRoutes.countryCode, 'GW'), eq(shippingRoutes.originSectorId, bissau.id), eq(shippingRoutes.destinationSectorId, bissau.id)));
  await db.insert(shippingRouteRates).values({ id: uid('rate'), routeId: route.id, serviceId: svc.id, minWeightKg: '0', maxWeightKg: '5', amount: '200', currency: 'XOF', isActive: true, createdAt: new Date(), updatedAt: new Date() } as any);
  await db.insert(platformSettings).values({ key: 'multiSellerCheckoutEnabled', valueJson: true, updatedAt: new Date() } as any).onConflictDoUpdate({ target: platformSettings.key, set: { valueJson: true, updatedAt: new Date() } });
  await db.insert(categories).values({ id: 'cat_s8', name: 'Cat', slug: 'cat-s8', isActive: true, commissionRate: '10.00' as any, createdAt: new Date() } as any);

  const sellerUser = await makeUser('SELLER'); const sellerId = uid('seller');
  await db.insert(sellers).values({ id: sellerId, userId: sellerUser, companyName: 'S', tradingName: 'S', taxId: '0', phone: '1', countryCode: 'GW', status: 'active', kycStatus: 'verified', isEmailVerified: true, createdAt: new Date(), updatedAt: new Date() } as any);
  const sAddr = uid('addr');
  await db.insert(addresses).values({ id: sAddr, userId: sellerUser, recipientName: 'L', street: 'R', number: '1', city: 'Bissau', state: 'Bissau', countryCode: 'GW', phone: '955000000', isDefault: false, addressType: 'business', shippingSectorId: bissau.id, createdAt: new Date(), updatedAt: new Date() } as any);
  const storeId = uid('store');
  await db.insert(stores).values({ id: storeId, sellerId, name: 'Loja', slug: `loja-${storeId}`, countryCode: 'GW', status: 'active', operationalAddressId: sAddr, createdAt: new Date(), updatedAt: new Date() } as any);
  const buyer = await makeUser('BUYER');
  const buyerAddr = uid('addr');
  await db.insert(addresses).values({ id: buyerAddr, userId: buyer, recipientName: 'C', street: 'R', number: '1', city: 'Bissau', state: 'Bissau', countryCode: 'GW', zipCode: '', phone: '955000000', isDefault: true, addressType: 'home', shippingSectorId: bissau.id, createdAt: new Date(), updatedAt: new Date() } as any);

  const app = express(); app.use(express.json()); app.use('/seller', sellerRouter); app.use('/', buyerRouter);
  const server = http.createServer(app); await new Promise<void>((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${(server.address() as any).port}`;
  const S = tok(sellerUser, 'SELLER'), B = tok(buyer, 'BUYER');
  const call = async (method: string, path: string, who: string, body?: any) => { const r = await fetch(url + path, { method, headers: { Authorization: `Bearer ${who}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); let j: any = null; try { j = await r.json(); } catch {} return { s: r.status, j }; };

  const common = { price: 1000, image: 'x.jpg', categoryId: 'cat_s8', storeId, weightKg: 0.3, dimensionsCm: { length: 5, width: 5, height: 5 } } as any;
  const invRows = (pid: string) => q('SELECT i.id, v.sku, i.quantity_on_hand q, i.quantity_reserved r, i.variant_id IS NULL AS orphan FROM inventory i LEFT JOIN product_variants v ON v.id=i.variant_id WHERE i.product_id=$1 ORDER BY v.sku NULLS FIRST', [pid]);
  const movs = (pid: string) => q('SELECT type, quantity, reason, variant_id IS NULL AS orphan FROM inventory_movements WHERE product_id=$1 ORDER BY created_at, id', [pid]);
  const convertBody = (k: string) => ({ variants: [{ title: 'P', sku: `S8-${k}-P`, price: 1100, stock: 4, color: 'Preto', size: 'P' }, { title: 'M', sku: `S8-${k}-M`, price: 1200, stock: 2, color: 'Preto', size: 'M' }] });
  // ======================================================================================================================
  // FASE 8C.1 — reserva ANTERIOR a conversao percorrendo o fluxo REAL: pedido -> conversao -> confirmacao -> DESPACHO FISICO
  const { ShipmentService } = await import('../src/server/modules/logistics/shipmentService.js');
  const { InventoryService } = await import('../src/server/modules/inventory/inventoryService.js');
  const orphanOf = async (pid: string) => (await invRows(pid)).find((r) => r.orphan);
  const liveOf = async (pid: string) => (await computeLiveStockAndSales([pid], db)).get(pid)!;
  const sumOnHand = async (pid: string) => Number((await q('SELECT coalesce(sum(quantity_on_hand),0)::int n FROM inventory WHERE product_id=$1', [pid]))[0].n);
  const clearCarts = async () => { await q('DELETE FROM cart_items'); await q('DELETE FROM carts'); };
  const placeVariantless = async (pid: string, qty: number) => {
    await clearCarts();
    const cid = uid('cart');
    await q("INSERT INTO carts (id,user_id,currency,country_code,created_at,updated_at) VALUES ($1,$2,'XOF','GW',now(),now())", [cid, buyer]);
    await q("INSERT INTO cart_items (id,cart_id,product_id,variant_id,quantity,unit_price,created_at,updated_at) VALUES ($1,$2,$3,NULL,$4,'1000',now(),now())", [uid('ci'), cid, pid, qty]);
    return OrderService.createOrderFromCart({ userId: buyer, addressId: buyerAddr, paymentMethod: 'pix' } as any, db);
  };

  // R1-R9: pedido com 3 unidades -> conversao -> confirmacao -> despacho
  const R: any = await ProductCreationService.createProduct(sellerUser, { ...common, title: 'Reserva antiga -> despacho', stock: 10, specs: {} }, db);
  const ordR: any = await placeVariantless(R.id, 3);
  const before = await orphanOf(R.id);
  report('R1 pre-condicao: produto simples (10) com pedido de 3 unidades; reserva na linha simples (q=10, r=3)', !!ordR && before!.q === 10 && before!.r === 3, before);
  const convR = await call('PATCH', `/seller/products/${R.id}`, S, convertBody('R'));
  const afterConv = await orphanOf(R.id);
  report('R2 conversao para variavel (4+2): reserva antiga PRESERVADA (linha simples q=3, r=3), total vendavel 6', convR.s === 200 && afterConv!.q === 3 && afterConv!.r === 3 && (await liveOf(R.id)).availableStock === 6, { s: convR.s, afterConv });
  // confirmacao do pagamento (simulada por SQL; pagamentos/escrow nao sao tocados nem exercitados aqui)
  await q("UPDATE orders SET payment_status='paid', status='processing', escrow_status='held' WHERE id=$1", [ordR.id]);
  const item = (await q('SELECT id, inventory_id, quantity, status FROM order_items WHERE order_id=$1', [ordR.id]))[0];
  report('R3 o item do pedido aponta para a linha simples antiga (inventory_id) — reserva anterior a conversao', item.inventory_id === afterConv!.id && item.quantity === 3, item);
  let dispatchErr = '';
  try { await db.transaction(async (tx) => { await ShipmentService.createOrGetShipmentForOrderItem(tx, item.id, sellerUser); await ShipmentService.executePhysicalDispatch(tx, item.id, sellerUser); }); } catch (e: any) { dispatchErr = e.message; }
  const afterDisp = await orphanOf(R.id);
  const mvR = await q("SELECT type, quantity, reason FROM inventory_movements WHERE product_id=$1 AND variant_id IS NULL ORDER BY created_at, id", [R.id]);
  obs('R4 apos despacho real', { dispatchErr: dispatchErr.slice(0, 120), orphan: { q: afterDisp?.q, r: afterDisp?.r }, movimentos: mvR.map((m) => `${m.type}:${m.quantity}`) });
  report('R4 DESPACHO FISICO real do pedido anterior a conversao funciona: linha antiga baixa 3 (q=0, r=0), sem estoque negativo', !dispatchErr && afterDisp!.q === 0 && afterDisp!.r === 0, { dispatchErr, afterDisp });
  const variantsAfter = (await invRows(R.id)).filter((r) => !r.orphan).map((r) => `${r.sku}:${r.q}/${r.r}`).sort().join();
  report('R5 estoque NAO duplicado nem perdido: variantes intactas (P 4, M 2), total fisico = 6, total vendavel = 6', variantsAfter === 'S8-R-M:2/0,S8-R-P:4/0' && (await sumOnHand(R.id)) === 6 && (await liveOf(R.id)).availableStock === 6, { variantsAfter });
  report('R6 historico auditavel: IN 10 original, AJUSTE da conversao (-7) e OUT -3 do despacho, nessa ordem; reserva marcada confirmed', mvR.filter((m) => ['IN', 'ADJUSTMENT', 'OUT'].includes(m.type)).map((m) => `${m.type}:${m.quantity}`).join() === 'IN:10,ADJUSTMENT:-7,OUT:-3' && (await q("SELECT status FROM stock_reservations WHERE order_id=$1", [ordR.id]))[0].status === 'confirmed', mvR);
  let again = '';
  try { await db.transaction(async (tx) => { await ShipmentService.executePhysicalDispatch(tx, item.id, sellerUser); }); } catch (e: any) { again = e.message; }
  report('R7 repetir o despacho e idempotente (nao baixa de novo; nenhum movimento OUT novo)', !again && (await orphanOf(R.id))!.q === 0 && (await q("SELECT 1 FROM inventory_movements WHERE product_id=$1 AND type='OUT'", [R.id])).length === 1, { again });
  let blocked = '';
  try { await placeVariantless(R.id, 1); } catch (e: any) { blocked = e.message; }
  report('R8 a linha antiga NAO volta a ser vendavel: compra sem variante recusada (VARIANT_REQUIRED) e linha segue 0/0', /VARIANT_REQUIRED/.test(blocked) && (await orphanOf(R.id))!.q === 0, { blocked });
  report('R9 produto ainda vende normalmente por variante (reserva cai na linha da variante)', await (async () => {
    await clearCarts();
    const cid = uid('cart'); const vP = (await q("SELECT id FROM product_variants WHERE sku='S8-R-P'"))[0].id;
    await q("INSERT INTO carts (id,user_id,currency,country_code,created_at,updated_at) VALUES ($1,$2,'XOF','GW',now(),now())", [cid, buyer]);
    await q("INSERT INTO cart_items (id,cart_id,product_id,variant_id,quantity,unit_price,created_at,updated_at) VALUES ($1,$2,$3,$4,1,'1100',now(),now())", [uid('ci'), cid, R.id, vP]);
    const o: any = await OrderService.createOrderFromCart({ userId: buyer, addressId: buyerAddr, paymentMethod: 'pix' } as any, db);
    return !!o && (await invRows(R.id)).find((r) => r.sku === 'S8-R-P')!.r === 1 && (await orphanOf(R.id))!.r === 0;
  })());

  // C. cancelamento ANTES do despacho, depois da conversao
  const C: any = await ProductCreationService.createProduct(sellerUser, { ...common, title: 'Reserva antiga -> cancelamento', stock: 10, specs: {} }, db);
  const ordC: any = await placeVariantless(C.id, 4);
  await call('PATCH', `/seller/products/${C.id}`, S, convertBody('C'));
  await OrderService.cancelOrder(ordC.id, buyer, 'cancelado depois da conversao');
  const oc = await orphanOf(C.id);
  report('C1 cancelamento depois da conversao (antes do despacho): linha antiga 0/0, total 6, nada volta a ser vendavel; variantes intactas', oc!.q === 0 && oc!.r === 0 && (await liveOf(C.id)).availableStock === 6 && (await sumOnHand(C.id)) === 6, oc);
  report('C2 historico: RELEASE do cancelamento e AJUSTE de baixa registrados (2 ajustes: conversao + baixa)', (await q("SELECT type FROM inventory_movements WHERE product_id=$1 AND type IN ('RELEASE')", [C.id])).length === 1 && (await q("SELECT 1 FROM inventory_movements WHERE product_id=$1 AND type='ADJUSTMENT'", [C.id])).length >= 2);

  // E. expiracao do pagamento (job) depois da conversao
  const E: any = await ProductCreationService.createProduct(sellerUser, { ...common, title: 'Reserva antiga -> expiracao', stock: 10, specs: {} }, db);
  const ordE: any = await placeVariantless(E.id, 5);
  await call('PATCH', `/seller/products/${E.id}`, S, convertBody('E'));
  await q("UPDATE stock_reservations SET expires_at = now() - interval '1 hour' WHERE order_id=$1", [ordE.id]);
  const grpE = (await q('SELECT purchase_group_id g FROM orders WHERE id=$1', [ordE.id]))[0].g;
  const exp = grpE ? await OrderService.cancelExpiredPendingPaymentGroup(grpE) : await OrderService.cancelExpiredPendingPaymentOrder(ordE.id);
  const oe = await orphanOf(E.id);
  report('E1 expiracao da reserva antiga depois da conversao: pedido cancelado, linha antiga 0/0, total vendavel 6', exp.cancelled === true && oe!.q === 0 && oe!.r === 0 && (await liveOf(E.id)).availableStock === 6, { exp, oe });
  const exp2 = grpE ? await OrderService.cancelExpiredPendingPaymentGroup(grpE) : await OrderService.cancelExpiredPendingPaymentOrder(ordE.id);
  report('E2 repetir a expiracao e idempotente (nenhum ajuste novo)', exp2.cancelled === false && (await q("SELECT 1 FROM inventory_movements WHERE product_id=$1 AND type='ADJUSTMENT'", [E.id])).length === 2);

  // K. concorrencia: despacho x conversao simultaneos (a linha antiga tem que fechar em 0 e o fisico em 6)
  let raceOk = true; const notes: any[] = [];
  for (let i = 0; i < 4; i++) {
    const K: any = await ProductCreationService.createProduct(sellerUser, { ...common, title: `Corrida despacho ${i}`, stock: 10, specs: {} }, db);
    const ordK: any = await placeVariantless(K.id, 3);
    await q("UPDATE orders SET payment_status='paid', status='processing', escrow_status='held' WHERE id=$1", [ordK.id]);
    const itK = (await q('SELECT id FROM order_items WHERE order_id=$1', [ordK.id]))[0];
    await db.transaction(async (tx) => { await ShipmentService.createOrGetShipmentForOrderItem(tx, itK.id, sellerUser); });
    const [dp, cv] = await Promise.allSettled([
      db.transaction(async (tx) => { await ShipmentService.executePhysicalDispatch(tx, itK.id, sellerUser); }),
      call('PATCH', `/seller/products/${K.id}`, S, convertBody(`K${i}`)),
    ]);
    const o = (await orphanOf(K.id))!;
    const ok = dp.status === 'fulfilled' && o.q === 0 && o.r === 0 && (await sumOnHand(K.id)) === 6 && (await liveOf(K.id)).availableStock === 6 && (cv as any).value?.s === 200;
    notes.push({ i, dispatch: dp.status, conv: (cv as any).value?.s ?? 'rejected', orph: { q: o.q, r: o.r }, fisico: await sumOnHand(K.id) });
    if (!ok) raceOk = false;
  }
  obs('K1 corridas despacho x conversao', notes);
  report('K1 despacho e conversao simultaneos (4 rodadas): linha antiga sempre 0/0, estoque fisico 6, sem perda de atualizacao', raceOk, notes);

  // F. falha e rollback: conversao que falha NAO deixa a reserva antiga em estado intermediario
  const F: any = await ProductCreationService.createProduct(sellerUser, { ...common, title: 'Reserva antiga -> falha', stock: 10, specs: {} }, db);
  await placeVariantless(F.id, 2);
  const snapF = JSON.stringify(await invRows(F.id));
  const dupSku = (await q("SELECT sku FROM product_variants WHERE sku='S8-R-P'"))[0].sku;
  const badF = await call('PATCH', `/seller/products/${F.id}`, S, { variants: [{ title: 'Z', sku: dupSku, price: 1000, stock: 1, color: 'Azul', size: 'G' }] });
  report('F1 conversao que falha (SKU duplicado) desfaz tudo: linha simples intacta (q=10, r=2), nenhum ajuste, nenhuma variante', badF.s >= 400 && JSON.stringify(await invRows(F.id)) === snapF && (await q("SELECT 1 FROM inventory_movements WHERE product_id=$1 AND type='ADJUSTMENT'", [F.id])).length === 0 && (await q('SELECT 1 FROM product_variants WHERE product_id=$1', [F.id])).length === 0);
  let rolled = false;
  try { await db.transaction(async (tx) => { await InventoryService.retireProductLevelStockForVariants(tx, { productId: F.id, performedBy: sellerUser }); throw new Error('FORCA'); }); } catch (e: any) { rolled = e.message === 'FORCA'; }
  report('F2 settle/retire dentro de transacao revertida nao deixa rastro', rolled && JSON.stringify(await invRows(F.id)) === snapF);

  server.close();
  await pool.end();
  console.log(`
=== RESULTADO: ${passed}/${total} ===`);
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
