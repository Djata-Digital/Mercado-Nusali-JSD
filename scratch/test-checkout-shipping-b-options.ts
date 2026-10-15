/**
 * ETAPA B — cotação e escolha do serviço de entrega (Economy / Standard / Express): opções por serviço com preço real calculado pelo
 * servidor, serviços indisponíveis com motivo, serviço coerente para o carrinho inteiro, pedido criado com o serviço ESCOLHIDO (nunca
 * trocado), preview == valor cobrado, política de frete respeitada. Postgres 17 DESCARTAVEL. Nunca produção.
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
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import { orders, orderItems, purchaseGroups, stockReservations, shippingServices, storeShippingPolicies } from '../src/db/schema.js';
import { apiRouter } from '../src/server/api.js';
import { OrderService } from '../src/server/modules/orders/orderService.js';
import { resolveCartShippingPreview } from '../src/server/modules/shipping/shippingPreviewService.js';
import { mapOrderCreationError } from '../src/server/modules/shipping/checkoutShippingErrors.js';
import { setupCheckoutKit } from './checkoutTestKit.js';

if (!['localhost', '127.0.0.1'].includes(new URL(testDbUrl).hostname)) throw new Error('Somente banco local descartavel.');
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 600)}`); };

async function main() {
  const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false }, max: 10 });
  const db = drizzle(pool, { schema });
  const kit = await setupCheckoutKit(db, 'eb');
  await kit.setFlag('multiSellerCheckoutEnabled', true);
  const bissau = await kit.sector('Bissau'), gabu = await kit.sector('Gabú'), bafata = await kit.sector('Bafatá'), cacheu = await kit.sector('Cacheu'), safim = await kit.sector('Safim');
  const eco = await kit.service('ECONOMY'), std = await kit.service('STANDARD'), exp = await kit.service('EXPRESS');
  const R = async (o: string, d: string) => kit.route(o, d);

  /** origem isolada (setor próprio) para que cada cenário tenha SUAS tarifas */
  const origin = async (label: string, sectorId: string, weightKg = 0.3, stock = 20, price = 100) => {
    const seller = await kit.makeSeller(label);
    const store = await kit.makeStore(seller, label, sectorId);
    const product = await kit.makeProduct(seller, store.storeId, `P ${label}`, weightKg, price);
    await kit.insertInventory({ sellerId: seller.sellerId, productId: product.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: store.floc.id, quantityOnHand: stock });
    return { seller, store, product };
  };
  const prev = async (items: Array<{ productId: string; quantity?: number }>, serviceCode?: string) =>
    resolveCartShippingPreview({ destinationShippingSectorId: bissau.id, serviceCode: serviceCode || null, items: items.map((i) => ({ productId: i.productId, variantId: null, quantity: i.quantity ?? 1 })) }, db) as Promise<any>;
  const opt = (r: any, code: string) => (r.services || []).find((o: any) => o.code === code);

  // ---------- 1. os três serviços com tarifa
  const o1 = await origin('tres', gabu.id);
  const r1 = await R(gabu.id, bissau.id);
  await kit.insertRate(r1.id, eco.id, 800); await kit.insertRate(r1.id, std.id, 1500); await kit.insertRate(r1.id, exp.id, 3000);
  let pv = await prev([{ productId: o1.product.id }]);
  report('B1 Economy, Standard e Express disponíveis: três opções, nessa ordem, com o preço real de cada uma', pv.available === true && pv.services.map((o: any) => o.code).join() === 'ECONOMY,STANDARD,EXPRESS' && opt(pv, 'ECONOMY').shippingChargedToBuyer === 800 && opt(pv, 'STANDARD').shippingChargedToBuyer === 1500 && opt(pv, 'EXPRESS').shippingChargedToBuyer === 3000 && pv.services.every((o: any) => o.available && o.currency === 'XOF'), pv);
  report('B2 sem serviço pedido, os campos de topo são o mais barato ("a partir de"), nunca uma escolha', pv.serviceCode === 'ECONOMY' && pv.shippingChargedToBuyer === 800);
  for (const [code, amount] of [['ECONOMY', 800], ['STANDARD', 1500], ['EXPRESS', 3000]] as const) {
    const one = await prev([{ productId: o1.product.id }], code);
    report(`B3 serviço pedido ${code}: campos de topo = esse serviço (${amount}), sem trocar por outro`, one.available === true && one.serviceCode === code && one.shippingChargedToBuyer === amount, one);
  }
  const noDelay = JSON.stringify(pv);
  report('B4 nenhum prazo de entrega é inventado (a resposta não contém campos de prazo)', !/days|prazo|eta|estimated/i.test(noDelay), noDelay.slice(0, 200));

  // ---------- 2. só alguns serviços
  const o2 = await origin('doisde3', cacheu.id);
  const r2 = await R(cacheu.id, bissau.id);
  await kit.insertRate(r2.id, std.id, 1200); await kit.insertRate(r2.id, exp.id, 2500);
  pv = await prev([{ productId: o2.product.id }]);
  report('B5 Economy sem tarifa: indisponível COM motivo (sem preço); Standard e Express disponíveis', opt(pv, 'ECONOMY').available === false && opt(pv, 'ECONOMY').unavailableCode === 'SHIPPING_RATE_NOT_AVAILABLE' && !!opt(pv, 'ECONOMY').unavailableMessage && opt(pv, 'ECONOMY').shippingChargedToBuyer === undefined && opt(pv, 'STANDARD').available && opt(pv, 'EXPRESS').available, pv.services);
  report('B6 Economy indisponível: o topo "a partir de" é o Standard (mais barato DISPONÍVEL), nunca um preço de Economy', pv.serviceCode === 'STANDARD' && pv.shippingChargedToBuyer === 1200);
  const exReq = await prev([{ productId: o2.product.id }], 'ECONOMY');
  report('B7 pedir um serviço indisponível não o substitui por outro: available=false com o motivo e a lista completa', exReq.available === false && exReq.code === 'SHIPPING_RATE_NOT_AVAILABLE' && exReq.services.length === 3, exReq);

  const o3 = await origin('um', bafata.id);
  await kit.insertRate((await R(bafata.id, bissau.id)).id, exp.id, 2000);
  pv = await prev([{ productId: o3.product.id }]);
  report('B8 só UM serviço disponível (Express): uma opção disponível e duas indisponíveis', pv.available === true && pv.services.filter((o: any) => o.available).length === 1 && opt(pv, 'EXPRESS').available && pv.serviceCode === 'EXPRESS', pv.services);

  const o4 = await origin('nenhum', bissau.id);
  pv = await prev([{ productId: o4.product.id }]);
  report('B9 NENHUMA tarifa: available=false (código de tarifa), os 3 serviços listados como indisponíveis, nenhum valor', pv.available === false && pv.code === 'SHIPPING_RATE_NOT_AVAILABLE' && pv.services.length === 3 && pv.services.every((o: any) => !o.available) && pv.shippingChargedToBuyer === undefined, pv);

  // ---------- 3. serviço desativado, tarifa vencida/inativa/fora da faixa por serviço
  const o5 = await origin('mix', gabu.id, 3);
  const r5 = r1; // Gabú→Bissau já tem 3 tarifas 0–5kg; aqui o peso é 3 kg
  await db.update(shippingServices).set({ isActive: false }).where(eq(shippingServices.id, exp.id));
  pv = await prev([{ productId: o5.product.id }]);
  report('B10 serviço DESATIVADO não aparece na lista (só serviços ativos)', pv.services.map((o: any) => o.code).join() === 'ECONOMY,STANDARD', pv.services.map((o: any) => o.code));
  await db.update(shippingServices).set({ isActive: true }).where(eq(shippingServices.id, exp.id));
  const o6 = await origin('faixa', safim.id, 3);
  const r6 = await R(safim.id, bissau.id);
  await kit.insertRate(r6.id, std.id, 1100); await kit.insertRate(r6.id, exp.id, 2200);
  await kit.insertRate(r6.id, eco.id, 700, { min: 0, max: 1 }); // Economy só até 1 kg
  pv = await prev([{ productId: o6.product.id }]);
  report('B11 peso (3 kg) fora da faixa SÓ do Economy: Economy indisponível, Standard e Express seguem', opt(pv, 'ECONOMY').available === false && opt(pv, 'ECONOMY').unavailableCode === 'SHIPPING_RATE_NOT_AVAILABLE' && opt(pv, 'STANDARD').available && opt(pv, 'EXPRESS').available, pv.services);
  const o7 = await origin('vig', bafata.id);
  const r7 = await R(bafata.id, bissau.id); // já tem Express (cenário B8)
  await kit.insertRate(r7.id, std.id, 900, { validUntil: new Date(Date.now() - 3600 * 1000) });
  await kit.insertRate(r7.id, eco.id, 600, { isActive: false });
  pv = await prev([{ productId: o7.product.id }]);
  report('B12 tarifa VENCIDA (Standard) e INATIVA (Economy) → indisponíveis; Express (válida) disponível', !opt(pv, 'STANDARD').available && !opt(pv, 'ECONOMY').available && opt(pv, 'EXPRESS').available, pv.services);

  // ---------- 4. vários itens/origens: o serviço vale para o carrinho inteiro
  const oa = await origin('multA', gabu.id);   // Gabú→Bissau: ECO 800 / STD 1500 / EXP 3000 (0–5kg)
  const ob = await origin('multB', cacheu.id); // Cacheu→Bissau: STD 1200 / EXP 2500 (sem Economy)
  pv = await prev([{ productId: oa.product.id }, { productId: ob.product.id }]);
  report('B13 duas origens: Economy só existe numa → indisponível para o CARRINHO; Standard e Express = soma das duas expedições', !opt(pv, 'ECONOMY').available && opt(pv, 'STANDARD').shippingChargedToBuyer === 1500 + 1200 && opt(pv, 'EXPRESS').shippingChargedToBuyer === 3000 + 2500, pv.services);
  const oc = await origin('multC', bafata.id); // Bafatá→Bissau: só Express 2000 (e inativas)
  pv = await prev([{ productId: oa.product.id }, { productId: oc.product.id }]);
  report('B14 Standard falta numa origem, Express existe nas duas → só Express disponível para o carrinho (coerência)', !opt(pv, 'STANDARD').available && !opt(pv, 'ECONOMY').available && opt(pv, 'EXPRESS').shippingChargedToBuyer === 3000 + 2000 && pv.serviceCode === 'EXPRESS', pv.services);

  // ---------- 5. política de frete grátis do vendedor
  const of = await origin('politica', gabu.id, 0.3, 20, 20000);
  await db.insert(storeShippingPolicies).values({ id: kit.uid('pol'), storeId: of.store.storeId, sellerId: of.seller.sellerId, mode: 'SELLER_FREE_SHIPPING', isActive: true } as any);
  pv = await prev([{ productId: of.product.id }], 'STANDARD');
  report('B15 frete grátis do vendedor: cobrado 0 mas o CUSTO REAL (1500) aparece — "grátis por política", nunca confundido com indisponível', pv.available === true && pv.shippingChargedToBuyer === 0 && pv.shippingCost === 1500, pv);

  // ---------- 6. pedido com o serviço escolhido (nunca trocado) e preview == cobrado
  const placeOrder = async (productIds: string[], serviceCode: string | null) => {
    const buyer = await kit.makeBuyer(bissau.id);
    for (const pid of productIds) await kit.addToCart(buyer.cartId, pid, 1);
    const result: any = await OrderService.createOrderFromCart({
      userId: buyer.buyerId, addressId: buyer.addressId, paymentMethod: 'pix',
      shippingSelection: serviceCode ? { serviceCode } : null,
    } as any, db);
    return { buyer, result };
  };
  const o8 = await origin('pedido', gabu.id);
  for (const [code, amount] of [['ECONOMY', 800], ['STANDARD', 1500], ['EXPRESS', 3000]] as const) {
    const pvx = await prev([{ productId: o8.product.id }], code);
    const { result } = await placeOrder([o8.product.id], code);
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, result.orders[0].id));
    const [ord] = await db.select().from(orders).where(eq(orders.id, result.orders[0].id));
    report(`B16 pedido com ${code}: itens com o serviço ${code}, frete ${amount} = preview, total = subtotal + frete`, items.every((i: any) => i.shippingServiceCode === code) && Number(ord.shippingFee) === amount && pvx.shippingChargedToBuyer === Number(ord.shippingFee) && Number(ord.totalAmount) === Number(ord.subtotal) + amount, { items: items.map((i: any) => [i.shippingServiceCode, i.shippingAmount]), fee: ord.shippingFee });
  }
  // serviço escolhido indisponível: erro, mesmo havendo outro mais barato; nada criado
  const countsBefore = JSON.stringify([(await db.select().from(orders)).length, (await db.select().from(purchaseGroups)).length, (await db.select().from(stockReservations)).length]);
  const o9 = await origin('indisp', cacheu.id); // Cacheu→Bissau: sem Economy
  let err: any = null;
  const b9 = await kit.makeBuyer(bissau.id); await kit.addToCart(b9.cartId, o9.product.id, 1);
  try { await OrderService.createOrderFromCart({ userId: b9.buyerId, addressId: b9.addressId, paymentMethod: 'pix', shippingSelection: { serviceCode: 'ECONOMY' } } as any, db); } catch (e) { err = e; }
  const mapped = err ? mapOrderCreationError(err) : null;
  report('B17 serviço escolhido sem tarifa: erro SHIPPING_SERVICE_UNAVAILABLE (409) — NÃO cria pedido com outro serviço mais barato', mapped?.code === 'SHIPPING_SERVICE_UNAVAILABLE' && mapped.status === 409 && countsBefore === JSON.stringify([(await db.select().from(orders)).length, (await db.select().from(purchaseGroups)).length, (await db.select().from(stockReservations)).length]), mapped);
  const b10 = await kit.makeBuyer(bissau.id); await kit.addToCart(b10.cartId, o9.product.id, 1);
  let err2: any = null;
  try { await OrderService.createOrderFromCart({ userId: b10.buyerId, addressId: b10.addressId, paymentMethod: 'pix', shippingSelection: { serviceCode: 'inválido!' } } as any, db); } catch (e) { err2 = e; }
  report('B18 código de serviço malformado → SHIPPING_SERVICE_INVALID (400), antes de qualquer consulta', mapOrderCreationError(err2).code === 'SHIPPING_SERVICE_INVALID' && mapOrderCreationError(err2).status === 400, mapOrderCreationError(err2));

  // dois vendedores, um serviço para ambos
  const { result: multi } = await placeOrder([oa.product.id, o8.product.id], 'EXPRESS');
  const sums = await Promise.all(multi.orders.map(async (o: any) => (await db.select().from(orderItems).where(eq(orderItems.orderId, o.id))).every((i: any) => i.shippingServiceCode === 'EXPRESS')));
  report('B19 carrinho com 2 vendedores e Express: dois pedidos, todos os itens Express, frete de cada = tarifa Express da sua origem', multi.orders.length === 2 && sums.every(Boolean) && multi.orders.every((o: any) => o.shippingFee === 3000), multi.orders.map((o: any) => o.shippingFee));
  const { result: feeFree } = await placeOrder([of.product.id], 'STANDARD');
  const [ordFree] = await db.select().from(orders).where(eq(orders.id, feeFree.orders[0].id));
  report('B20 pedido com política de frete grátis: cobrado 0, custo real 1500 e subsídio do vendedor 1500 registrados; total = subtotal', Number(ordFree.shippingFee) === 0 && Number(ordFree.shippingCost) === 1500 && Number(ordFree.shippingSellerSubsidy) === 1500 && Number(ordFree.totalAmount) === Number(ordFree.subtotal), { fee: ordFree.shippingFee, cost: ordFree.shippingCost, sub: ordFree.shippingSellerSubsidy });

  // ---------- 7. HTTP: o endpoint devolve as opções e valida o serviço pedido
  const app = express(); app.use(express.json()); app.use('/api/v1', apiRouter);
  const server = http.createServer(app); await new Promise<void>((res) => server.listen(0, res));
  const base = `http://localhost:${(server.address() as any).port}/api/v1`;
  const post = async (body: any) => { const r = await fetch(`${base}/shipping/preview-cart`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json() as any }; };
  const h1 = await post({ destinationShippingSectorId: bissau.id, items: [{ productId: o1.product.id, quantity: 1 }] });
  report('B21 POST /shipping/preview-cart devolve data.services com os 3 serviços e o serviço de topo', h1.status === 200 && h1.json.data.available === true && h1.json.data.services.length === 3 && h1.json.data.serviceCode === 'ECONOMY', h1.json);
  const h2 = await post({ destinationShippingSectorId: bissau.id, serviceCode: 'express', items: [{ productId: o1.product.id, quantity: 1 }] });
  report('B22 serviceCode (minúsculas) é normalizado e o topo passa a ser o Express', h2.json.data.serviceCode === 'EXPRESS' && h2.json.data.shippingChargedToBuyer === 3000, h2.json.data);
  const h3 = await post({ destinationShippingSectorId: bissau.id, items: [{ productId: o4.product.id, quantity: 1 }] });
  report('B23 sem tarifa: success=true com available=false, código de tarifa e a lista de serviços indisponíveis (nunca 0)', h3.json.data.available === false && h3.json.data.code === 'SHIPPING_RATE_NOT_AVAILABLE' && h3.json.data.services.length === 3 && h3.json.data.shippingChargedToBuyer === undefined, h3.json.data);
  server.close();

  console.log(`\n${passed}/${total} passaram`);
  await pool.end();
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
