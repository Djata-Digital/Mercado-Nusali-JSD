/**
 * FASE 8A - DIAGNOSTICO + REGRESSAO do defeito "produto simples convertido em variavel mantem o estoque simples contabilizado
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
  // S1. conversao simples (10) -> variavel (4 + 2)
  const P1: any = await ProductCreationService.createProduct(sellerUser, { ...common, title: 'Simples->Variavel', stock: 10, specs: {} }, db);
  const conv = await call('PATCH', `/seller/products/${P1.id}`, S, convertBody('A'));
  const rows1 = await invRows(P1.id);
  const live1 = (await computeLiveStockAndSales([P1.id], db)).get(P1.id)!;
  const detail1: any = await CatalogService.getProductById(P1.id, undefined, db);
  const list1 = (await call('GET', '/seller/products', S)).j.data.find((p: any) => p.id === P1.id);
  obs('S1 inventory (sku=null => linha do produto simples)', rows1.map((r) => ({ sku: r.sku, q: r.q, r: r.r })));
  obs('S1 total do produto: computeLiveStockAndSales / detalhe publico stock / lista do vendedor available', { live: live1.availableStock, detail: detail1.stock, list: list1?.availableStock });
  obs('S1 products.stock (coluna-resumo)', (await q('SELECT stock FROM products WHERE id=$1', [P1.id]))[0].stock);
  report('S1.0 conversao aceita (200) e criou as 2 variantes', conv.s === 200 && rows1.filter((r) => r.sku).length === 2, conv.j);
  report('S1.1 o estoque TOTAL do produto soma so as variantes (4 + 2 = 6), nao 16 (10 simples + 6)', live1.availableStock === 6 && detail1.stock === 6 && list1?.availableStock === 6, { live: live1.availableStock, detail: detail1.stock, list: list1?.availableStock });
  report('S1.2 a linha do produto simples foi APOSENTADA (disponivel 0) e nao apagada: continua existindo para historico/reservas', rows1.some((r) => r.orphan) && rows1.filter((r) => r.orphan).every((r) => r.q - r.r === 0), rows1);
  const m1 = await movs(P1.id);
  report('S1.3 historico preservado: movimento inicial IN 10 do produto simples segue la e a aposentadoria entrou como AJUSTE auditavel (nada foi reescrito)', m1.some((m) => m.type === 'IN' && m.quantity === 10 && m.orphan) && m1.some((m) => m.type === 'ADJUSTMENT' && m.orphan && /varia/i.test(String(m.reason))), m1);

  // S2/S3. portas de entrada sem variacao
  const add = await call('POST', '/cart/items', B, { productId: P1.id, quantity: 1 });
  obs('S2 POST /cart/items SEM variantId num produto COM variacoes', { status: add.s, code: add.j?.error?.code });
  report('S2 adicionar ao carrinho um produto com variacoes SEM escolher a variacao => 400 VARIANT_REQUIRED (o lote ja exige; a rota unitaria nao)', add.s === 400 && add.j?.error?.code === 'VARIANT_REQUIRED', { s: add.s, j: add.j?.error });
  // linha SEM variante gravada direto no carrinho (sem passar pela API) + checkout
  await q('DELETE FROM cart_items'); await q('DELETE FROM carts');
  const cartId = uid('cart');
  await q("INSERT INTO carts (id,user_id,currency,country_code,created_at,updated_at) VALUES ($1,$2,'XOF','GW',now(),now())", [cartId, buyer]);
  await q("INSERT INTO cart_items (id,cart_id,product_id,variant_id,quantity,unit_price,created_at,updated_at) VALUES ($1,$2,$3,NULL,2,'1000',now(),now())", [uid('ci'), cartId, P1.id]);
  const before3 = JSON.stringify(await invRows(P1.id));
  let order3: any = null, err3 = '';
  try { order3 = await OrderService.createOrderFromCart({ userId: buyer, addressId: buyerAddr, paymentMethod: 'pix' } as any, db); } catch (e: any) { err3 = e.message; }
  obs('S3 checkout de linha SEM variante num produto com variacoes', { criouPedido: !!order3, erro: err3.slice(0, 120), inventoryDepois: (await invRows(P1.id)).map((r) => ({ sku: r.sku, q: r.q, r: r.r })) });
  report('S3 checkout de linha sem variante num produto com variacoes NAO cria pedido e NAO reserva a linha do produto simples', !order3 && JSON.stringify(await invRows(P1.id)) === before3, { order: !!order3, err3 });
  // limpa o pedido de teste e LIBERA a reserva que ele fez (so para nao contaminar os cenarios seguintes)
  await q('DELETE FROM stock_reservations'); await q('DELETE FROM order_items'); await q('DELETE FROM orders'); await q('DELETE FROM cart_items'); await q('DELETE FROM carts'); await q('UPDATE inventory SET quantity_reserved=0 WHERE product_id=$1', [P1.id]);

  // S4. conversao com reserva em andamento (pedido aberto do produto simples)
  const P2: any = await ProductCreationService.createProduct(sellerUser, { ...common, title: 'Simples com pedido aberto', stock: 10, specs: {} }, db);
  const cart2 = uid('cart');
  await q("INSERT INTO carts (id,user_id,currency,country_code,created_at,updated_at) VALUES ($1,$2,'XOF','GW',now(),now())", [cart2, buyer]);
  await q("INSERT INTO cart_items (id,cart_id,product_id,variant_id,quantity,unit_price,created_at,updated_at) VALUES ($1,$2,$3,NULL,3,'1000',now(),now())", [uid('ci'), cart2, P2.id]);
  let ord2: any = null, err2 = '';
  try { ord2 = await OrderService.createOrderFromCart({ userId: buyer, addressId: buyerAddr, paymentMethod: 'pix' } as any, db); } catch (e: any) { err2 = e.message; }
  const reservedBefore = (await invRows(P2.id))[0];
  const conv2 = await call('PATCH', `/seller/products/${P2.id}`, S, convertBody('B'));
  const rows2 = await invRows(P2.id);
  const orphan2 = rows2.find((r) => r.orphan)!;
  obs('S4 apos conversao com 3 unidades reservadas por pedido aberto', { antes: { q: reservedBefore?.q, r: reservedBefore?.r }, depois: rows2.map((r) => ({ sku: r.sku, q: r.q, r: r.r })), erroPedido: err2.slice(0, 80) });
  report('S4.0 pre-condicao: pedido aberto reservou 3 unidades do produto simples', !!ord2 && reservedBefore.r === 3 && conv2.s === 200, { err2, conv2: conv2.s, reservedBefore });
  report('S4.1 a reserva do pedido aberto e PRESERVADA (a linha simples fica com onHand >= reservado = 3, disponivel 0): o pedido ainda pode ser despachado/cancelado sem estoque negativo', orphan2.r === 3 && orphan2.q === 3, orphan2);
  report('S4.2 total do produto = so as variantes (6), a linha antiga nao soma', (await computeLiveStockAndSales([P2.id], db)).get(P2.id)!.availableStock === 6, (await computeLiveStockAndSales([P2.id], db)).get(P2.id));

  // S5. ida e volta (variavel -> simples)
  const back = await call('PATCH', `/seller/products/${P1.id}`, S, { variants: [] });
  const setStock = await call('PATCH', `/seller/products/${P1.id}`, S, { stock: 7 });
  const live5 = (await computeLiveStockAndSales([P1.id], db)).get(P1.id)!;
  obs('S5 variavel -> simples (variants: []) + stock 7', { back: back.s, setStock: setStock.s, total: live5.availableStock, inv: (await invRows(P1.id)).map((r) => ({ sku: r.sku, q: r.q })) });
  report('S5 voltando para simples (variantes desativadas) e informando estoque 7, o total vendavel e 7 (a linha simples volta a valer; variantes desativadas nao somam)', back.s === 200 && setStock.s === 200 && live5.availableStock === 7, live5);

  // S6/S7. idempotencia e produto ja nascido variavel
  const P3: any = await ProductCreationService.createProduct(sellerUser, { ...common, title: 'Simples 5', stock: 5, specs: {} }, db);
  await call('PATCH', `/seller/products/${P3.id}`, S, convertBody('C'));
  const adj1 = (await movs(P3.id)).filter((m) => m.type === 'ADJUSTMENT').length;
  await call('PATCH', `/seller/products/${P3.id}`, S, convertBody('C'));
  const adj2 = (await movs(P3.id)).filter((m) => m.type === 'ADJUSTMENT').length;
  report('S6 reenviar as mesmas variantes (idempotencia) NAO gera novo ajuste nem altera o estoque', adj1 === adj2 && (await computeLiveStockAndSales([P3.id], db)).get(P3.id)!.availableStock === 6, { adj1, adj2 });
  const P4: any = await ProductCreationService.createProduct(sellerUser, { ...common, title: 'Nasceu variavel', stock: 0, specs: {}, variants: convertBody('D').variants }, db);
  report('S7 produto que NASCE variavel nao ganha linha simples nem ajuste (so as 2 linhas de variante, 2 movimentos IN)', (await invRows(P4.id)).length === 2 && (await movs(P4.id)).every((m) => m.type === 'IN') && (await computeLiveStockAndSales([P4.id], db)).get(P4.id)!.availableStock === 6);

  // S8. conversao com a linha simples ja zerada (sem estoque): nada a aposentar
  const P5: any = await ProductCreationService.createProduct(sellerUser, { ...common, title: 'Simples 0', stock: 0, specs: {} }, db);
  await call('PATCH', `/seller/products/${P5.id}`, S, convertBody('E'));
  report('S8 produto simples com estoque 0 convertido: total = variantes (6) e nenhum ajuste desnecessario', (await computeLiveStockAndSales([P5.id], db)).get(P5.id)!.availableStock === 6 && (await movs(P5.id)).filter((m) => m.type === 'ADJUSTMENT').length === 0);

  // S9. compra normal da variante apos conversao continua funcionando (reserva na linha da VARIANTE)
  const vP = (await q("SELECT id FROM product_variants WHERE sku='S8-A-P'"))[0].id;
  await q('DELETE FROM cart_items'); await q('DELETE FROM carts');
  const cart9 = uid('cart');
  await q("INSERT INTO carts (id,user_id,currency,country_code,created_at,updated_at) VALUES ($1,$2,'XOF','GW',now(),now())", [cart9, buyer]);
  await call('PATCH', `/seller/products/${P1.id}`, S, convertBody('A'));
  await q("INSERT INTO cart_items (id,cart_id,product_id,variant_id,quantity,unit_price,created_at,updated_at) VALUES ($1,$2,$3,$4,1,'1100',now(),now())", [uid('ci'), cart9, P1.id, vP]);
  let ord9: any = null, err9 = '';
  try { ord9 = await OrderService.createOrderFromCart({ userId: buyer, addressId: buyerAddr, paymentMethod: 'pix' } as any, db); } catch (e: any) { err9 = e.message; }
  const rows9 = await invRows(P1.id);
  report('S9 compra da VARIANTE apos a conversao: pedido criado e a reserva cai na linha da variante (1), nunca na linha do produto simples', !!ord9 && rows9.find((r) => r.sku === 'S8-A-P')!.r === 1 && rows9.filter((r) => r.orphan).every((r) => r.r === 0), { err9, rows9 });

  server.close();
  await pool.end();
  console.log(`\n=== RESULTADO: ${passed}/${total} ===`);
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
