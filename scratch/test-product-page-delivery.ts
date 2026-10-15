/**
 * PÁGINA DO PRODUTO / CARRINHO / CHECKOUT — informação logística coerente. Reproduz o cenário de produção (produto com variações, loja em Bissau,
 * destino Bissau, tarifas Economy 100 / Standard 200 / Express 300, prazos, política PADRÃO da plataforma) e garante: a cotação por serviço (a MESMA
 * do carrinho e do checkout) traz preço, custo, quem custeia e prazo; "GRÁTIS" só com custo real > 0 coberto por política (nunca por ausência de
 * dado); sem tarifa/estoque/endereço a cotação NÃO traz preço; o serviço escolhido no pedido é revalidado no servidor. Postgres 17 DESCARTAVEL.
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
import { orders, orderItems, productVariants, storeShippingPolicies, shippingRouteServiceLeadTimes, platformSettings } from '../src/db/schema.js';
import { apiRouter } from '../src/server/api.js';
import { OrderService } from '../src/server/modules/orders/orderService.js';
import { resolveCartShippingPreview } from '../src/server/modules/shipping/shippingPreviewService.js';
import { describeServiceOptionPrice } from '../src/utils/shippingDisplay.js';
import { setupCheckoutKit } from './checkoutTestKit.js';

if (!['localhost', '127.0.0.1'].includes(new URL(testDbUrl).hostname)) throw new Error('Somente banco local descartavel.');
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 700)}`); };
const fmt = (n: number) => `${n} XOF`;

async function main() {
  const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false }, max: 10 });
  const db = drizzle(pool, { schema });
  const kit = await setupCheckoutKit(db, 'pp');
  const bissau = await kit.sector('Bissau');
  const eco = await kit.service('ECONOMY'), std = await kit.service('STANDARD'), exp = await kit.service('EXPRESS');
  const setDefaultPolicy = async (mode: string | null) => {
    if (mode === null) await db.delete(platformSettings).where(eq(platformSettings.key, 'defaultShippingPolicyMode'));
    else await kit.setFlag('defaultShippingPolicyMode', mode);
  };

  /** produto com variações, loja operando em Bissau (origem) e destino Bissau — como em produção */
  const route = await kit.route(bissau.id, bissau.id);
  const seller = await kit.makeSeller('vestido');
  const store = await kit.makeStore(seller, 'vestido', bissau.id);
  const product = await kit.makeProduct(seller, store.storeId, 'Vestido de Festa', 0.5, 7000);
  const variantId = kit.uid('pvar');
  await db.insert(productVariants).values({ id: variantId, productId: product.id, title: 'Azul / G', sku: `VEST-${variantId}`, price: '7000', stock: 50, isActive: true } as any);
  await kit.insertInventory({ sellerId: seller.sellerId, productId: product.id, variantId, locationType: 'SELLER_LOCATION', fulfillmentLocationId: store.floc.id, quantityOnHand: 50 });
  await kit.insertRate(route.id, eco.id, 100, { min: 0, max: 10 });
  await kit.insertRate(route.id, std.id, 200, { min: 0, max: 10 });
  await kit.insertRate(route.id, exp.id, 300, { min: 0, max: 10 });
  const lt = async (serviceId: string, a: number, b: number) => db.insert(shippingRouteServiceLeadTimes).values({ id: kit.uid('lt'), routeId: route.id, serviceId, minDays: a, maxDays: b } as any);
  await lt(eco.id, 2, 3); await lt(std.id, 1, 2); await lt(exp.id, 1, 1);

  const quote = async (o: { productId?: string; variantId?: string | null; sector?: string | null; serviceCode?: string | null; quantity?: number } = {}) =>
    resolveCartShippingPreview({ destinationShippingSectorId: o.sector === undefined ? bissau.id : o.sector, serviceCode: o.serviceCode ?? null, items: [{ productId: o.productId ?? product.id, variantId: o.variantId === undefined ? variantId : o.variantId, quantity: o.quantity ?? 1 }] }, db) as Promise<any>;
  const opt = (r: any, code: string) => (r.services || []).find((x: any) => x.code === code);
  const price = (o: any) => describeServiceOptionPrice(o, fmt);

  // ---------- 1. cenário de produção: política PADRÃO da plataforma = MARKETPLACE_FREE_SHIPPING (sem política da loja)
  await setDefaultPolicy('MARKETPLACE_FREE_SHIPPING');
  const r1 = await quote();
  report('P1 a cotação da página do produto traz os TRÊS serviços disponíveis com preço, custo real e prazo (a mesma resposta do carrinho/checkout)', r1.available === true && ['ECONOMY', 'STANDARD', 'EXPRESS'].every((c) => opt(r1, c)?.available === true) && [100, 200, 300].every((v, i) => opt(r1, ['ECONOMY', 'STANDARD', 'EXPRESS'][i]).shippingCost === v), r1.services);
  report('P2 com a política padrão MARKETPLACE_FREE_SHIPPING: comprador paga 0, custo real 100/200/300 e quem custeia é a NUSALI (nunca o vendedor)', ['ECONOMY', 'STANDARD', 'EXPRESS'].every((c) => opt(r1, c).shippingChargedToBuyer === 0 && opt(r1, c).shippingCoveredBy === 'marketplace' && opt(r1, c).shippingMarketplaceSubsidy === opt(r1, c).shippingCost), r1.services.map((s: any) => [s.code, s.shippingChargedToBuyer, s.shippingCoveredBy]));
  report('P3 prazos estimados cadastrados chegam em cada serviço (Economy 2–3, Standard 1–2, Express 1–1)', JSON.stringify([opt(r1, 'ECONOMY').leadTime, opt(r1, 'STANDARD').leadTime, opt(r1, 'EXPRESS').leadTime]) === JSON.stringify([{ minDays: 2, maxDays: 3 }, { minDays: 1, maxDays: 2 }, { minDays: 1, maxDays: 1 }]));
  const p2 = price(opt(r1, 'ECONOMY'));
  report('P4 a apresentação diz GRÁTIS apenas porque o servidor confirmou custo 100 coberto pela política, e informa "Frete custeado pela Nusali"', p2.kind === 'free_by_policy' && p2.text === 'GRÁTIS' && p2.note === 'Frete custeado pela Nusali', p2);

  // ---------- 2. política da loja e outras políticas
  await db.insert(storeShippingPolicies).values({ id: kit.uid('pol'), storeId: store.storeId, sellerId: seller.sellerId, mode: 'SELLER_FREE_SHIPPING', isActive: true } as any);
  const r2 = await quote();
  report('P5 política da LOJA SELLER_FREE_SHIPPING: comprador paga 0 e quem custeia é o VENDEDOR (precedência da loja sobre o padrão da plataforma)', opt(r2, 'STANDARD').shippingChargedToBuyer === 0 && opt(r2, 'STANDARD').shippingCoveredBy === 'seller' && price(opt(r2, 'STANDARD')).note === 'Frete custeado pelo vendedor', opt(r2, 'STANDARD'));
  await db.delete(storeShippingPolicies).where(eq(storeShippingPolicies.storeId, store.storeId));
  await db.insert(storeShippingPolicies).values({ id: kit.uid('pol'), storeId: store.storeId, sellerId: seller.sellerId, mode: 'SELLER_SUBSIDIZED', sellerSubsidyPercent: '50', isActive: true } as any);
  const r3 = await quote();
  report('P6 subsídio parcial (SELLER_SUBSIDIZED 50%): o comprador paga a parte dele (Standard 100 de 200), NUNCA "GRÁTIS", e o servidor diz que o vendedor custeia o resto', opt(r3, 'STANDARD').shippingChargedToBuyer === 100 && opt(r3, 'STANDARD').shippingCost === 200 && price(opt(r3, 'STANDARD')).kind === 'paid' && price(opt(r3, 'STANDARD')).text === '100 XOF', opt(r3, 'STANDARD'));
  await db.delete(storeShippingPolicies).where(eq(storeShippingPolicies.storeId, store.storeId));
  await setDefaultPolicy('CUSTOMER_PAYS');
  const r4 = await quote();
  report('P7 política CUSTOMER_PAYS: comprador paga o valor da tarifa (100/200/300), sem nota de quem custeia e NADA é GRÁTIS', [['ECONOMY', 100], ['STANDARD', 200], ['EXPRESS', 300]].every(([c, v]) => opt(r4, c as string).shippingChargedToBuyer === v && price(opt(r4, c as string)).kind === 'paid' && price(opt(r4, c as string)).note === null) && opt(r4, 'ECONOMY').shippingCoveredBy === null, r4.services.map((s: any) => [s.code, s.shippingChargedToBuyer]));
  await setDefaultPolicy(null);
  const r5 = await quote();
  report('P8 SEM política em lugar nenhum, o padrão seguro é o comprador pagar (nunca frete grátis por omissão)', opt(r5, 'STANDARD').shippingChargedToBuyer === 200 && price(opt(r5, 'STANDARD')).kind === 'paid', opt(r5, 'STANDARD'));

  // ---------- 3. tarifa zero explícita, sem tarifa, sem estoque, sem endereço
  const zRoute = await kit.route(bissau.id, bissau.id);
  report('P9 (controle) a rota usada é a Bissau → Bissau', zRoute.id === route.id);
  const oZ = await (async () => { const sl = await kit.makeSeller('zero'); const st = await kit.makeStore(sl, 'zero', (await kit.sector('Bafatá')).id); const pr = await kit.makeProduct(sl, st.storeId, 'Produto tarifa zero', 0.3, 100); await kit.insertInventory({ sellerId: sl.sellerId, productId: pr.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: st.floc.id, quantityOnHand: 10 }); return pr; })();
  const rtZ = await kit.route((await kit.sector('Bafatá')).id, bissau.id);
  await kit.insertRate(rtZ.id, std.id, 0, { min: 0, max: 10 });
  const rZ = await quote({ productId: oZ.id, variantId: null });
  report('P10 tarifa ZERO explícita (sem subsídio): "Sem custo de frete" — e não "GRÁTIS" por oferta; sem nota de quem custeia', opt(rZ, 'STANDARD').shippingCost === 0 && opt(rZ, 'STANDARD').shippingChargedToBuyer === 0 && price(opt(rZ, 'STANDARD')).kind === 'no_cost' && price(opt(rZ, 'STANDARD')).text === 'Sem custo de frete', price(opt(rZ, 'STANDARD')));
  report('P11 serviços SEM tarifa nessa rota aparecem indisponíveis, sem preço (Economy e Express do produto de tarifa zero)', opt(rZ, 'ECONOMY').available === false && opt(rZ, 'ECONOMY').shippingChargedToBuyer === undefined && price(opt(rZ, 'ECONOMY')).text === 'Indisponível' && opt(rZ, 'EXPRESS').available === false, opt(rZ, 'ECONOMY'));

  const oN = await (async () => { const sl = await kit.makeSeller('semtarifa'); const st = await kit.makeStore(sl, 'semtarifa', (await kit.sector('Cacheu')).id); const pr = await kit.makeProduct(sl, st.storeId, 'Produto sem tarifa', 0.3, 100); await kit.insertInventory({ sellerId: sl.sellerId, productId: pr.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: st.floc.id, quantityOnHand: 10 }); return pr; })();
  const rN = await quote({ productId: oN.id, variantId: null });
  report('P12 SEM tarifa para a rota: entrega indisponível (code de tarifa), nenhum serviço disponível, e NENHUM preço nem "GRÁTIS" é devolvido', rN.available === false && rN.code === 'SHIPPING_RATE_NOT_AVAILABLE' && (rN.services || []).every((s: any) => s.available === false && s.shippingChargedToBuyer === undefined && s.shippingCost === undefined) && rN.shippingChargedToBuyer === undefined, rN);
  const rS = await quote({ variantId: 'pvar_inexistente' });
  report('P13 variação sem estoque/inexistente: entrega indisponível sem preço (nunca frete grátis)', rS.available !== true && rS.shippingChargedToBuyer === undefined, rS);
  const rA = await quote({ sector: null });
  report('P14 sem endereço/setor de entrega: DELIVERY_SECTOR_REQUIRED ("Frete a calcular"), sem preço', rA.available === false && rA.code === 'DELIVERY_SECTOR_REQUIRED' && rA.shippingChargedToBuyer === undefined, rA);
  report('P15 as funções de apresentação nunca produzem GRÁTIS com valor ausente/inválido (undefined, null, NaN, texto, negativo)', [undefined, null, NaN, 'x', -1].every((bad) => price({ available: true, shippingChargedToBuyer: bad as any, shippingCost: 100 }).text !== 'GRÁTIS' && price({ available: true, shippingChargedToBuyer: 0, shippingCost: bad as any }).text !== 'GRÁTIS') && price({ available: true }).text === 'Frete a calcular');

  // ---------- 4. prazo ausente = a confirmar (sem inventar)
  const oL = await (async () => { const sl = await kit.makeSeller('semprazo'); const st = await kit.makeStore(sl, 'semprazo', (await kit.sector('Safim')).id); const pr = await kit.makeProduct(sl, st.storeId, 'Produto sem prazo', 0.3, 100); await kit.insertInventory({ sellerId: sl.sellerId, productId: pr.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: st.floc.id, quantityOnHand: 10 }); return pr; })();
  await kit.insertRate((await kit.route((await kit.sector('Safim')).id, bissau.id)).id, std.id, 150, { min: 0, max: 10 });
  const rL = await quote({ productId: oL.id, variantId: null });
  report('P16 serviço com tarifa mas SEM prazo cadastrado: leadTime null ("Prazo a confirmar"), nunca um prazo inventado', opt(rL, 'STANDARD').available === true && opt(rL, 'STANDARD').leadTime === null, opt(rL, 'STANDARD'));

  // ---------- 5. escolha do serviço no pedido: revalidada no servidor (política padrão = Nusali custeia)
  await setDefaultPolicy('MARKETPLACE_FREE_SHIPPING');
  const place = async (serviceCode: string, expected: number | null) => {
    const buyer = await kit.makeBuyer(bissau.id);
    await kit.addToCart(buyer.cartId, product.id, 1, 7000, variantId);
    try { return { ok: true as const, value: await OrderService.createOrderFromCart({ userId: buyer.buyerId, addressId: buyer.addressId, paymentMethod: 'pix', shippingSelection: { serviceCode, expectedShippingChargedToBuyer: expected } } as any, db) as any }; }
    catch (e: any) { return { ok: false as const, error: e }; }
  };
  const o1 = await place('EXPRESS', 0);
  if (!o1.ok) report('P17 pedido com Express escolhido', false, o1.error?.message); else {
    const [ord] = await db.select().from(orders).where(eq(orders.id, o1.value.orders[0].id));
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, ord.id));
    report('P17 pedido com EXPRESS escolhido: comprador paga 0, custo real 300 e subsídio da Nusali 300 gravados; item com serviço EXPRESS e prazo 1–1 (snapshot); total = subtotal', Number(ord.shippingFee) === 0 && Number(ord.shippingCost) === 300 && Number(ord.shippingMarketplaceSubsidy) === 300 && Number(ord.totalAmount) === Number(ord.subtotal) && items.every((i: any) => i.shippingServiceCode === 'EXPRESS' && i.deliveryEstimateMinDays === 1 && i.deliveryEstimateMaxDays === 1), { fee: ord.shippingFee, cost: ord.shippingCost, mk: ord.shippingMarketplaceSubsidy });
  }
  const o2 = await place('STANDARD', 200);
  report('P18 o valor "visto" pelo cliente é só conferido: confirmar 200 quando o servidor cobra 0 → 409 SHIPPING_QUOTE_CHANGED e nenhum pedido', !o2.ok && (o2 as any).error?.code === 'SHIPPING_QUOTE_CHANGED' && (o2 as any).error?.httpStatus === 409, (o2 as any).error?.code);
  const o3 = await place('ECONOMY', null);
  report('P19 sem a confirmação do valor o servidor ainda decide o preço (rotas HTTP exigem; aqui o serviço direto): pedido com ECONOMY cobra 0 / custo 100 conforme a política', o3.ok && Number((await db.select().from(orders).where(eq(orders.id, o3.value.orders[0].id)))[0].shippingCost) === 100, o3.ok ? 'ok' : (o3 as any).error?.message);
  await setDefaultPolicy('CUSTOMER_PAYS');
  const o4 = await place('STANDARD', 0);
  report('P20 com CUSTOMER_PAYS o mesmo "0 visto" é recusado (o servidor cobra 200): nunca um frete grátis indevido num pedido', !o4.ok && (o4 as any).error?.code === 'SHIPPING_QUOTE_CHANGED' && (o4 as any).error?.details?.currentShippingChargedToBuyer === 200, (o4 as any).error?.details);
  const o5 = await place('STANDARD', 200);
  report('P21 com CUSTOMER_PAYS e o valor correto confirmado (200) o pedido é criado cobrando 200', o5.ok && Number(o5.value.orders[0].shippingFee) === 200, o5.ok ? 'ok' : (o5 as any).error?.message);

  // ---------- 6. API HTTP pública da cotação (usada pela página do produto, carrinho e checkout)
  const app = express(); app.use(express.json()); app.use('/api/v1', apiRouter);
  const server = http.createServer(app); await new Promise<void>((res) => server.listen(0, res));
  const base = `http://localhost:${(server.address() as any).port}/api/v1`;
  await setDefaultPolicy('MARKETPLACE_FREE_SHIPPING');
  const hr = await fetch(`${base}/shipping/preview-cart`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ destinationShippingSectorId: bissau.id, items: [{ productId: product.id, variantId, quantity: 1 }] }) });
  const hj: any = await hr.json();
  report('P22 POST /shipping/preview-cart devolve, por serviço, preço pós-política, custo, quem custeia e prazo — tudo o que a página do produto precisa', hr.status === 200 && hj.data.services.length === 3 && hj.data.services.every((s: any) => typeof s.shippingChargedToBuyer === 'number' && typeof s.shippingCost === 'number' && 'leadTime' in s && s.shippingCoveredBy === 'marketplace'), hj.data?.services?.[0]);
  server.close();

  console.log(`\n${passed}/${total} passaram`);
  await pool.end();
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
