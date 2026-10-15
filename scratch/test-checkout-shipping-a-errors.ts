/**
 * ETAPA A — motivos de falha de frete distinguidos (estoque x setor de origem x peso x rota x serviço x tarifa) no PREVIEW e na CRIAÇÃO
 * do pedido, mensagens limpas/códigos estáveis nas duas rotas HTTP, e nenhum pedido parcial. Postgres 17 DESCARTAVEL. Nunca produção.
 */
process.env.REDIS_URL = '';
import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';
const testDbUrl = assertLedgerTestDatabaseGuard();
process.env.DATABASE_URL = testDbUrl;
process.env.NODE_ENV = 'test';
process.env.SKIP_RUNTIME_ALIGN = 'true';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test_fixture_jwt_secret_never_real_0123456789';
import 'dotenv/config';
import http from 'http';
import express from 'express';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import { orders, purchaseGroups, stockReservations, cartItems, shippingRoutes } from '../src/db/schema.js';
import { apiRouter } from '../src/server/api.js';
import { OrderService } from '../src/server/modules/orders/orderService.js';
import { resolveCartShippingPreview } from '../src/server/modules/shipping/shippingPreviewService.js';
import { classifyRejectedCandidates, mapOrderCreationError, CheckoutShippingError } from '../src/server/modules/shipping/checkoutShippingErrors.js';
import { setupCheckoutKit } from './checkoutTestKit.js';

if (!['localhost', '127.0.0.1'].includes(new URL(testDbUrl).hostname)) throw new Error('Somente banco local descartavel.');
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 500)}`); };

async function main() {
  const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false }, max: 10 });
  const db = drizzle(pool, { schema });
  const kit = await setupCheckoutKit(db, 'ea');
  const q = async (s: string, p?: any[]) => (await pool.query(s, p)).rows;
  await kit.setFlag('multiSellerCheckoutEnabled', true);

  const bissau = await kit.sector('Bissau'), gabu = await kit.sector('Gabú'), bafata = await kit.sector('Bafatá');
  const standard = await kit.service('STANDARD');
  const rBB = await kit.route(bissau.id, bissau.id), rGB = await kit.route(gabu.id, bissau.id);

  // ---- classificador (puro)
  const cls = (...r: string[]) => classifyRejectedCandidates(r.map((reason) => ({ reason })));
  report('A1 classificador: só estoque → estoque; tarifa + estoque → TARIFA (nunca estoque quando há problema de frete)', cls('INSUFFICIENT_AVAILABLE_STOCK') === 'PRODUCT_NOT_AVAILABLE_FOR_QUANTITY' && cls('INSUFFICIENT_AVAILABLE_STOCK', 'SHIPPING_RATE_NOT_AVAILABLE') === 'SHIPPING_RATE_NOT_AVAILABLE');
  report('A2 classificador: rota > tarifa > serviço > setor de origem > peso > origem inoperante > estoque; sem origem → estoque', cls('SHIPPING_RATE_NOT_AVAILABLE', 'ROUTE_NOT_AVAILABLE') === 'SHIPPING_ROUTE_NOT_AVAILABLE' && cls('ORIGIN_SECTOR_MISSING') === 'SHIPPING_ORIGIN_SECTOR_MISSING' && cls('WEIGHT_UNAVAILABLE') === 'SHIPPING_WEIGHT_UNAVAILABLE' && cls('WEIGHT_BAND_NOT_AVAILABLE') === 'SHIPPING_RATE_NOT_AVAILABLE' && cls('SERVICE_NOT_AVAILABLE') === 'SHIPPING_SERVICE_NOT_AVAILABLE' && cls('STORE_INACTIVE') === 'SHIPPING_ORIGIN_NOT_OPERATIONAL' && classifyRejectedCandidates([]) === 'PRODUCT_NOT_AVAILABLE_FOR_QUANTITY');

  // ---- mapeamento HTTP (puro)
  const m1 = mapOrderCreationError(new Error('DESTINATION_SHIPPING_SECTOR_REQUIRED: O endereço de entrega não tem setor.'));
  const m2 = mapOrderCreationError(new CheckoutShippingError('SHIPPING_RATE_NOT_AVAILABLE', 'Não há tarifa.', 409, { productId: 'p' }));
  const m3 = mapOrderCreationError(new Error('Estoque insuficiente para X'));
  const m4 = mapOrderCreationError(new Error('FULFILLMENT_RESERVATION_CONFLICT: RESERVATION - perdeu'));
  const m5 = mapOrderCreationError(new Error('qualquer coisa inesperada'));
  report('A3 mapeamento: prefixo "CODIGO: texto" vira código estável e o texto perde o prefixo', m1.code === 'DESTINATION_SHIPPING_SECTOR_REQUIRED' && m1.message === 'O endereço de entrega não tem setor.' && m1.status === 400, m1);
  report('A4 mapeamento: erro de frete tipado → 409 com código/detalhes; estoque legado e conflito de reserva preservados; desconhecido → ORDER_CREATION_FAILED', m2.status === 409 && m2.code === 'SHIPPING_RATE_NOT_AVAILABLE' && (m2.details as any)?.productId === 'p' && m3.code === 'INSUFFICIENT_STOCK' && m4.status === 409 && m4.code === 'FULFILLMENT_RESERVATION_CONFLICT' && m5.code === 'ORDER_CREATION_FAILED' && m5.status === 400, [m2, m3, m4, m5]);

  // ---- cenários de banco
  const counts = async () => ({
    o: (await db.select().from(orders)).length, pg: (await db.select().from(purchaseGroups)).length, rs: (await db.select().from(stockReservations)).length,
  });
  /** monta loja de origem + produto + estoque + comprador com 1 item no carrinho */
  const scenario = async (label: string, o: { originSector?: string | null; destSector?: string | null; weightKg?: number; qty?: number; stock?: number }) => {
    const seller = await kit.makeSeller(label);
    const store = await kit.makeStore(seller, label, o.originSector === null ? null : (o.originSector ?? gabu.id));
    const product = await kit.makeProduct(seller, store.storeId, `Prod ${label}`, o.weightKg ?? 0.3);
    await kit.insertInventory({ sellerId: seller.sellerId, productId: product.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: store.floc.id, quantityOnHand: o.stock ?? 10 });
    const buyer = await kit.makeBuyer(o.destSector === null ? null : (o.destSector ?? bissau.id));
    await kit.addToCart(buyer.cartId, product.id, o.qty ?? 1);
    return { seller, store, product, buyer };
  };
  const tryOrder = async (s: { buyer: { buyerId: string; addressId: string } }) => {
    const before = await counts();
    let err: any = null;
    try { await OrderService.createOrderFromCart({ userId: s.buyer.buyerId, addressId: s.buyer.addressId, paymentMethod: 'pix' } as any, db); } catch (e) { err = e; }
    const after = await counts();
    return { err, mapped: err ? mapOrderCreationError(err) : null, noPartial: JSON.stringify(before) === JSON.stringify(after) };
  };
  const preview = async (s: { product: { id: string }; buyer: any }, dest: string | null = bissau.id) =>
    resolveCartShippingPreview({ destinationShippingSectorId: dest, items: [{ productId: s.product.id, variantId: null, quantity: 1 }] }, db) as Promise<any>;

  // 1. rota sem NENHUMA tarifa
  let s = await scenario('semtarifa', {});
  let r = await tryOrder(s);
  report('B1 rota sem tarifa: código SHIPPING_RATE_NOT_AVAILABLE (não é falta de estoque), mensagem sem prefixo interno, nenhum pedido/reserva criado', r.mapped?.code === 'SHIPPING_RATE_NOT_AVAILABLE' && r.mapped.status === 409 && !/estoque/i.test(r.mapped.message) && !/^[A-Z_]{6,}:/.test(r.mapped.message) && r.noPartial, r.mapped);
  let pv = await preview(s);
  report('B2 o preview dá o MESMO motivo (tarifa) e nunca "available" com frete 0', pv.available === false && pv.code === 'SHIPPING_RATE_NOT_AVAILABLE' && pv.shippingChargedToBuyer === undefined, pv);
  report('B3 carrinho preservado depois da falha', (await db.select().from(cartItems).where(eq(cartItems.cartId, s.buyer.cartId))).length === 1);

  // 2. tarifa inativa / vencida / faixa fora do peso
  s = await scenario('inativa', {});
  await kit.insertRate(rGB.id, standard.id, 1500, { isActive: false });
  r = await tryOrder(s);
  report('B4 tarifa INATIVA → tarifa indisponível (nunca frete grátis)', r.mapped?.code === 'SHIPPING_RATE_NOT_AVAILABLE' && r.noPartial, r.mapped);
  s = await scenario('vencida', {});
  await kit.insertRate(rGB.id, standard.id, 1500, { validUntil: new Date(Date.now() - 24 * 3600 * 1000) });
  r = await tryOrder(s);
  report('B5 tarifa VENCIDA (validUntil no passado) → tarifa indisponível', r.mapped?.code === 'SHIPPING_RATE_NOT_AVAILABLE' && r.noPartial, r.mapped);
  s = await scenario('futura', {});
  await kit.insertRate(rGB.id, standard.id, 1500, { validFrom: new Date(Date.now() + 24 * 3600 * 1000) });
  r = await tryOrder(s);
  report('B6 tarifa que ainda NÃO começou (validFrom no futuro) → tarifa indisponível', r.mapped?.code === 'SHIPPING_RATE_NOT_AVAILABLE' && r.noPartial, r.mapped);
  s = await scenario('pesado', { weightKg: 3 });
  await kit.insertRate(rGB.id, standard.id, 1500, { min: 0, max: 1 });
  r = await tryOrder(s);
  pv = await preview(s);
  report('B7 peso fora da faixa (3 kg, faixa 0–1 kg) → tarifa indisponível no pedido e no preview', r.mapped?.code === 'SHIPPING_RATE_NOT_AVAILABLE' && pv.code === 'SHIPPING_RATE_NOT_AVAILABLE' && r.noPartial, [r.mapped, pv.code]);

  // 3. rota inativa
  s = await scenario('rotainativa', {});
  await kit.insertRate(rGB.id, standard.id, 1500);
  await db.update(shippingRoutes).set({ isActive: false }).where(eq(shippingRoutes.id, rGB.id));
  r = await tryOrder(s);
  pv = await preview(s);
  await db.update(shippingRoutes).set({ isActive: true }).where(eq(shippingRoutes.id, rGB.id));
  report('B8 rota INATIVA → rota indisponível (pedido e preview)', r.mapped?.code === 'SHIPPING_ROUTE_NOT_AVAILABLE' && pv.code === 'SHIPPING_ROUTE_NOT_AVAILABLE' && r.noPartial, [r.mapped, pv.code]);

  // 4. setor de origem ausente
  s = await scenario('semorigem', { originSector: null });
  await kit.insertRate(rGB.id, standard.id, 1500);
  r = await tryOrder(s);
  pv = await preview(s);
  report('B9 loja SEM setor de origem → setor de origem ausente (pedido e preview), não "estoque"', r.mapped?.code === 'SHIPPING_ORIGIN_SECTOR_MISSING' && pv.code === 'SHIPPING_ORIGIN_SECTOR_MISSING' && r.noPartial, [r.mapped, pv.code]);

  // 5. destino sem setor
  s = await scenario('semdestino', { destSector: null });
  r = await tryOrder(s);
  pv = await preview(s, null);
  report('B10 endereço de entrega SEM setor → DESTINATION_SHIPPING_SECTOR_REQUIRED (código próprio) e preview DELIVERY_SECTOR_REQUIRED', r.mapped?.code === 'DESTINATION_SHIPPING_SECTOR_REQUIRED' && pv.code === 'DELIVERY_SECTOR_REQUIRED' && r.noPartial, [r.mapped?.code, pv.code]);

  // 6. estoque insuficiente de verdade
  s = await scenario('semestoque', { stock: 0 });
  await kit.insertRate(rGB.id, standard.id, 1500);
  r = await tryOrder(s);
  pv = await preview(s);
  report('B11 estoque realmente insuficiente → motivo de estoque (código INSUFFICIENT_AVAILABLE_STOCK; preview PRODUCT_NOT_AVAILABLE_FOR_QUANTITY)', r.mapped?.code === 'INSUFFICIENT_AVAILABLE_STOCK' && pv.code === 'PRODUCT_NOT_AVAILABLE_FOR_QUANTITY' && r.noPartial, [r.mapped?.code, pv.code]);

  // 7. duas origens: uma sem estoque, outra sem tarifa → TARIFA (não estoque)
  const seller = await kit.makeSeller('duas');
  const storeNoStock = await kit.makeStore(seller, 'duasA', gabu.id);
  const storeNoRate = await kit.makeStore(seller, 'duasB', bafata.id);
  const prod = await kit.makeProduct(seller, storeNoStock.storeId, 'ProdDuas', 0.3);
  await kit.insertInventory({ sellerId: seller.sellerId, productId: prod.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: storeNoStock.floc.id, quantityOnHand: 0 });
  await kit.insertInventory({ sellerId: seller.sellerId, productId: prod.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: storeNoRate.floc.id, quantityOnHand: 10 });
  const b2 = await kit.makeBuyer(bissau.id);
  await kit.addToCart(b2.cartId, prod.id, 1);
  r = await tryOrder({ buyer: b2 });
  pv = await preview({ product: prod, buyer: b2 });
  report('B12 uma origem sem estoque e outra com estoque mas SEM tarifa → motivo TARIFA (antes dizia estoque)', r.mapped?.code === 'SHIPPING_RATE_NOT_AVAILABLE' && pv.code === 'SHIPPING_RATE_NOT_AVAILABLE', [r.mapped?.code, pv.code]);

  // ---- HTTP: as duas rotas devolvem código e texto limpos (sem pedido parcial)
  const app = express(); app.use(express.json()); app.use('/api/v1', apiRouter);
  const server = http.createServer(app); await new Promise<void>((res) => server.listen(0, res));
  const base = `http://localhost:${(server.address() as any).port}/api/v1`;
  const post = async (path: string, userId: string, body: any) => {
    const token = jwt.sign({ userId, email: `${userId}@t.test`, role: 'BUYER', fullName: 'T', countryCode: 'GW', kycStatus: 'verified', isEmailVerified: true }, process.env.JWT_ACCESS_SECRET!);
    const res = await fetch(`${base}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, json: await res.json().catch(() => null) as any };
  };
  s = await scenario('http', { originSector: bafata.id });
  const before = await counts();
  const h1 = await post('/orders', s.buyer.buyerId, { addressId: s.buyer.addressId, paymentMethod: 'pix', currency: 'XOF', countryCode: 'GW', shippingServiceCode: 'STANDARD', expectedShippingChargedToBuyer: 1500 });
  const h2 = await post('/buyer/orders', s.buyer.buyerId, { addressId: s.buyer.addressId, paymentMethod: 'pix', currency: 'XOF', countryCode: 'GW', shippingServiceCode: 'STANDARD', expectedShippingChargedToBuyer: 1500 });
  report('B13 POST /orders sem tarifa (serviço escolhido sem tarifa): 409, código SHIPPING_SERVICE_UNAVAILABLE e mensagem limpa', h1.status === 409 && h1.json?.error?.code === 'SHIPPING_SERVICE_UNAVAILABLE' && !/^[A-Z_]{6,}:/.test(h1.json?.error?.message || ''), h1);
  report('B14 POST /buyer/orders (outra entrada) devolve o mesmo código/status; nenhum pedido criado em nenhuma', h2.status === 409 && h2.json?.error?.code === 'SHIPPING_SERVICE_UNAVAILABLE' && JSON.stringify(before) === JSON.stringify(await counts()), h2);

  console.log(`\n${passed}/${total} passaram`);
  server.close(); await pool.end();
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
