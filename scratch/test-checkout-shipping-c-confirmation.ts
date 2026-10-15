/**
 * ETAPA C — confirmação do valor do frete e validação transacional no backend: o total que o cliente viu é comparado com o que o servidor
 * calcula DENTRO da transação; tarifa alterada/desativada antes de confirmar → 409 sem nenhum pedido/reserva/grupo e carrinho intacto;
 * tarifas travadas (FOR SHARE) durante a criação; envio duplicado concorrente → um único pedido; preço do cliente nunca é autoridade;
 * rotas HTTP exigem serviço + confirmação; total/Escrow/reembolso coerentes. Postgres 17 DESCARTAVEL. Nunca produção.
 */
process.env.REDIS_URL = '';
import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';
const testDbUrl = assertLedgerTestDatabaseGuard();
process.env.DATABASE_URL = testDbUrl;
process.env.NODE_ENV = 'test';
process.env.SKIP_RUNTIME_ALIGN = 'true';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test_fixture_jwt_secret_never_real_0123456789';
process.env.ASAAS_WEBHOOK_AUTH_TOKEN = process.env.ASAAS_WEBHOOK_AUTH_TOKEN || 'test_webhook_token_fixture';
import 'dotenv/config';
import fs from 'fs';
import http from 'http';
import express from 'express';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import {
  orders, orderItems, purchaseGroups, stockReservations, shippingRouteRates, storeShippingPolicies, cartItems, payments, paymentAttempts,
  escrowAccounts, refunds,
} from '../src/db/schema.js';
import { apiRouter } from '../src/server/api.js';
import { OrderService } from '../src/server/modules/orders/orderService.js';
import { getJwtAccessSecret } from '../src/server/modules/auth/jwtConfig.js';
import { resolveCartShippingPreview } from '../src/server/modules/shipping/shippingPreviewService.js';
import { lockAndVerifyRates, assertShippingQuoteMatches } from '../src/server/modules/shipping/shippingQuoteGuard.js';
import { PaymentService } from '../src/server/modules/payments/paymentService.js';
import { processRefund } from '../src/server/modules/payments/refundService.js';
import { setupCheckoutKit } from './checkoutTestKit.js';

if (!['localhost', '127.0.0.1'].includes(new URL(testDbUrl).hostname)) throw new Error('Somente banco local descartavel.');
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 700)}`); };
const codeOf = (e: any) => e?.code || e?.name || String(e?.message || e).slice(0, 80);

async function main() {
  const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false }, max: 10 });
  const db = drizzle(pool, { schema });
  const kit = await setupCheckoutKit(db, 'ec');
  await kit.setFlag('multiSellerCheckoutEnabled', true);
  const bissau = await kit.sector('Bissau'), gabu = await kit.sector('Gabú'), bafata = await kit.sector('Bafatá'), cacheu = await kit.sector('Cacheu'), safim = await kit.sector('Safim');
  const eco = await kit.service('ECONOMY'), std = await kit.service('STANDARD'), exp = await kit.service('EXPRESS');
  const R = async (o: string, d: string) => kit.route(o, d);

  const origin = async (label: string, sectorId: string, weightKg = 0.3, stock = 20, price = 100) => {
    const seller = await kit.makeSeller(label);
    const store = await kit.makeStore(seller, label, sectorId);
    const product = await kit.makeProduct(seller, store.storeId, `P ${label}`, weightKg, price);
    await kit.insertInventory({ sellerId: seller.sellerId, productId: product.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: store.floc.id, quantityOnHand: stock });
    return { seller, store, product };
  };
  const prevFee = async (productIds: string[], serviceCode: string) => {
    const r: any = await resolveCartShippingPreview({ destinationShippingSectorId: bissau.id, serviceCode, items: productIds.map((id) => ({ productId: id, variantId: null, quantity: 1 })) }, db);
    return r.available ? Number(r.shippingChargedToBuyer) : null;
  };
  const counts = async () => JSON.stringify([(await db.select().from(orders)).length, (await db.select().from(purchaseGroups)).length, (await db.select().from(stockReservations)).length]);
  const setRate = async (rateId: string, set: Record<string, any>) => db.update(shippingRouteRates).set({ ...set, updatedAt: new Date() } as any).where(eq(shippingRouteRates.id, rateId));
  const newCart = async (productIds: string[]) => {
    const buyer = await kit.makeBuyer(bissau.id);
    for (const pid of productIds) await kit.addToCart(buyer.cartId, pid, 1);
    return buyer;
  };
  const place = async (buyer: any, serviceCode: string | null, expected: number | null | undefined) =>
    OrderService.createOrderFromCart({
      userId: buyer.buyerId, addressId: buyer.addressId, paymentMethod: 'pix',
      shippingSelection: serviceCode ? { serviceCode, expectedShippingChargedToBuyer: expected ?? null } : null,
    } as any, db) as Promise<any>;
  const attempt = async (fn: () => Promise<any>) => { try { return { ok: true as const, value: await fn() }; } catch (e: any) { return { ok: false as const, error: e }; } };
  const cartCount = async (cartId: string) => (await db.select().from(cartItems).where(eq(cartItems.cartId, cartId))).length;

  // ---------- 1. valor conferido: igual → cria
  const o1 = await origin('conf', gabu.id);
  const r1 = await R(gabu.id, bissau.id);
  const rate1 = await kit.insertRate(r1.id, std.id, 1500);
  await kit.insertRate(r1.id, exp.id, 3000);
  const b1 = await newCart([o1.product.id]);
  const seen1 = await prevFee([o1.product.id], 'STANDARD');
  const ok1 = await attempt(() => place(b1, 'STANDARD', seen1));
  const [ord1] = ok1.ok ? await db.select().from(orders).where(eq(orders.id, ok1.value.orders[0].id)) : [null as any];
  report('C1 valor confirmado == valor do servidor: pedido criado com o frete visto (1500) e total = subtotal + frete', ok1.ok && seen1 === 1500 && Number(ord1.shippingFee) === 1500 && Number(ord1.totalAmount) === Number(ord1.subtotal) + 1500, ok1.ok ? ord1 : codeOf((ok1 as any).error));

  // ---------- 2. tarifa alterada ANTES de confirmar
  const o2 = await origin('mudou', cacheu.id);
  const r2 = await R(cacheu.id, bissau.id);
  const rate2 = await kit.insertRate(r2.id, std.id, 1500);
  const b2 = await newCart([o2.product.id]);
  const seen2 = await prevFee([o2.product.id], 'STANDARD');
  await setRate(rate2, { amount: '1800' }); // o administrador altera a tarifa depois de o cliente ver 1500
  const before2 = await counts();
  const f2 = await attempt(() => place(b2, 'STANDARD', seen2));
  const e2: any = (f2 as any).error;
  report('C2 tarifa mudou (1500→1800) antes de confirmar: 409 SHIPPING_QUOTE_CHANGED com valor anterior e novo, em XOF', !f2.ok && e2.code === 'SHIPPING_QUOTE_CHANGED' && e2.httpStatus === 409 && e2.details?.previousShippingChargedToBuyer === 1500 && e2.details?.currentShippingChargedToBuyer === 1800 && e2.details?.currency === 'XOF' && e2.details?.serviceCode === 'STANDARD', e2?.details ?? e2);
  report('C3 falha na conferência: NENHUM pedido, grupo ou reserva criado, e o carrinho continua intacto', (await counts()) === before2 && (await cartCount(b2.cartId)) === 1);
  const again2 = await attempt(() => place(b2, 'STANDARD', 1800));
  const [ord2] = again2.ok ? await db.select().from(orders).where(eq(orders.id, again2.value.orders[0].id)) : [null as any];
  report('C4 depois de o cliente confirmar o novo valor (1800), o pedido é criado cobrando 1800', again2.ok && Number(ord2.shippingFee) === 1800 && Number(ord2.totalAmount) === Number(ord2.subtotal) + 1800, again2.ok ? ord2 : codeOf((again2 as any).error));

  // ---------- 3. tarifa desativada / vencida / faixa de peso alterada
  const o3 = await origin('inativa', safim.id);
  const rate3 = await kit.insertRate((await R(safim.id, bissau.id)).id, std.id, 1400);
  const b3 = await newCart([o3.product.id]);
  const seen3 = await prevFee([o3.product.id], 'STANDARD');
  await setRate(rate3, { isActive: false });
  const before3 = await counts();
  const f3 = await attempt(() => place(b3, 'STANDARD', seen3));
  report('C5 tarifa desativada antes de confirmar: 409 SHIPPING_SERVICE_UNAVAILABLE (nunca outro serviço), nada criado, carrinho intacto', !f3.ok && (f3 as any).error.code === 'SHIPPING_SERVICE_UNAVAILABLE' && (f3 as any).error.httpStatus === 409 && (await counts()) === before3 && (await cartCount(b3.cartId)) === 1, codeOf((f3 as any).error));

  await setRate(rate3, { isActive: true, validUntil: new Date(Date.now() - 60_000) });
  const f3b = await attempt(() => place(b3, 'STANDARD', seen3));
  report('C6 tarifa vencida (validUntil no passado): 409 SHIPPING_SERVICE_UNAVAILABLE, nada criado', !f3b.ok && (f3b as any).error.code === 'SHIPPING_SERVICE_UNAVAILABLE' && (await counts()) === before3, codeOf((f3b as any).error));

  await setRate(rate3, { validUntil: null, minWeightKg: '1', maxWeightKg: '5' }); // faixa já não cobre 0,3 kg
  const f3c = await attempt(() => place(b3, 'STANDARD', seen3));
  report('C7 faixa de peso alterada (não cobre mais o peso): 409 indisponível, nada criado', !f3c.ok && (f3c as any).error.code === 'SHIPPING_SERVICE_UNAVAILABLE' && (await counts()) === before3, codeOf((f3c as any).error));

  // ---------- 4. guarda: travamento FOR SHARE das tarifas e conferência
  const o4 = await origin('lock', bafata.id);
  const rate4 = await kit.insertRate((await R(bafata.id, bissau.id)).id, std.id, 1000);
  const c4 = await pool.connect();
  const edit = await pool.connect();
  try {
    await c4.query('BEGIN');
    const txShim = drizzle(c4 as any, { schema });
    await lockAndVerifyRates(txShim, [{ rateId: rate4, amount: 1000, weightKg: 0.3, currency: 'XOF' }], 'STANDARD');
    await edit.query("SET lock_timeout = '600ms'");
    let blocked = false;
    try { await edit.query('UPDATE shipping_route_rates SET amount = 9999 WHERE id = $1', [rate4]); } catch (e: any) { blocked = /lock timeout|could not obtain lock/i.test(String(e?.message)); }
    report('C8 enquanto o pedido está em criação a tarifa usada está travada (FOR SHARE): a edição administrativa concorrente espera/é bloqueada', blocked);
    await c4.query('COMMIT');
    await edit.query('UPDATE shipping_route_rates SET amount = 1000 WHERE id = $1', [rate4]);
    report('C9 depois do commit/rollback a tarifa volta a poder ser editada', true);
  } finally { c4.release(); edit.release(); }
  const cG = await pool.connect();
  try {
    await cG.query('BEGIN');
    const shim = drizzle(cG as any, { schema });
    const dChanged = await attempt(() => lockAndVerifyRates(shim, [{ rateId: rate4, amount: 900, weightKg: 0.3, currency: 'XOF' }], 'STANDARD'));
    report('C10 valor da tarifa travada diferente do cotado: SHIPPING_QUOTE_CHANGED', !dChanged.ok && (dChanged as any).error.code === 'SHIPPING_QUOTE_CHANGED');
    const dMissing = await attempt(() => lockAndVerifyRates(shim, [{ rateId: 'rate_inexistente', amount: 1000, weightKg: 0.3, currency: 'XOF' }], 'STANDARD'));
    report('C11 tarifa removida/inexistente: SHIPPING_SERVICE_UNAVAILABLE', !dMissing.ok && (dMissing as any).error.code === 'SHIPPING_SERVICE_UNAVAILABLE');
    const dCur = await attempt(() => lockAndVerifyRates(shim, [{ rateId: rate4, amount: 1000, weightKg: 0.3, currency: 'BRL' }], 'STANDARD'));
    report('C12 moeda diferente da tarifa: indisponível (nunca converte)', !dCur.ok && (dCur as any).error.code === 'SHIPPING_SERVICE_UNAVAILABLE');
    await cG.query('ROLLBACK');
  } finally { cG.release(); }
  report('C13 assertShippingQuoteMatches: igual passa; diferente lança 409; ausente (null) não valida', (() => {
    try { assertShippingQuoteMatches(1500, 1500, { serviceCode: 'STANDARD', currency: 'XOF' }); assertShippingQuoteMatches(null, 99, { serviceCode: 'STANDARD', currency: 'XOF' }); } catch { return false; }
    try { assertShippingQuoteMatches(1500, 1500.01, { serviceCode: 'STANDARD', currency: 'XOF' }); return false; } catch (e: any) { return e.code === 'SHIPPING_QUOTE_CHANGED' && e.httpStatus === 409; }
  })());

  // ---------- 5. vários produtos na mesma origem e vários vendedores
  const o5a = await origin('multA', gabu.id);
  const o5b = await origin('multB', cacheu.id);
  const seen5 = (await prevFee([o5a.product.id, o5b.product.id], 'STANDARD'));
  const b5 = await newCart([o5a.product.id, o5b.product.id]);
  const rateGabu = (await db.select().from(shippingRouteRates).where(eq(shippingRouteRates.routeId, r1.id))).find((r: any) => r.serviceId === std.id)!;
  await setRate(rateGabu.id, { amount: '1700' }); // muda a tarifa de UM dos vendedores
  const before5 = await counts();
  const f5 = await attempt(() => place(b5, 'STANDARD', seen5));
  report('C14 carrinho com 2 vendedores: tarifa de um mudou → 409 e NENHUM dos pedidos é criado (sem pedido parcial)', !f5.ok && (f5 as any).error.code === 'SHIPPING_QUOTE_CHANGED' && (await counts()) === before5 && (await cartCount(b5.cartId)) === 2, codeOf((f5 as any).error));
  const seen5b = await prevFee([o5a.product.id, o5b.product.id], 'STANDARD');
  const ok5 = await attempt(() => place(b5, 'STANDARD', seen5b));
  const grp5 = ok5.ok ? (await db.select().from(purchaseGroups).where(eq(purchaseGroups.id, ok5.value.purchaseGroup.id)))[0] : null;
  const ords5 = ok5.ok ? await Promise.all(ok5.value.orders.map(async (o: any) => (await db.select().from(orders).where(eq(orders.id, o.id)))[0])) : [];
  report('C15 reconfirmado o novo total: dois pedidos; soma dos fretes = valor confirmado; total do grupo = soma dos pedidos', ok5.ok && ords5.length === 2 && ords5.reduce((s: number, o: any) => s + Number(o.shippingFee), 0) === seen5b && Math.abs(Number(grp5.totalAmount) - ords5.reduce((s: number, o: any) => s + Number(o.totalAmount), 0)) < 0.005, ok5.ok ? { seen5b, fees: ords5.map((o: any) => o.shippingFee) } : codeOf((ok5 as any).error));

  const o5c = await origin('mesma', gabu.id); // mesma origem (Gabú) do o5a: dois produtos, uma origem
  const seen5c = await prevFee([o5a.product.id, o5c.product.id], 'STANDARD');
  const b5c = await newCart([o5a.product.id, o5c.product.id]);
  const ok5c = await attempt(() => place(b5c, 'STANDARD', seen5c));
  report('C16 dois produtos na mesma origem (vendedores diferentes): frete confirmado == soma cobrada nos pedidos', ok5c.ok && (await Promise.all(ok5c.value.orders.map(async (o: any) => Number((await db.select().from(orders).where(eq(orders.id, o.id)))[0].shippingFee)))).reduce((a: number, b: number) => a + b, 0) === seen5c, ok5c.ok ? seen5c : codeOf((ok5c as any).error));

  // ---------- 6. frete subsidiado: confirmação compara o que o CLIENTE paga
  const o6 = await origin('subs', gabu.id, 0.3, 20, 20000);
  await db.insert(storeShippingPolicies).values({ id: kit.uid('pol'), storeId: o6.store.storeId, sellerId: o6.seller.sellerId, mode: 'SELLER_FREE_SHIPPING', isActive: true } as any);
  const b6 = await newCart([o6.product.id]);
  const seen6 = await prevFee([o6.product.id], 'STANDARD');
  const ok6 = await attempt(() => place(b6, 'STANDARD', seen6));
  const [ord6] = ok6.ok ? await db.select().from(orders).where(eq(orders.id, ok6.value.orders[0].id)) : [null as any];
  report('C17 frete grátis por política: confirmado 0, cobrado 0, custo real e subsídio do vendedor registrados; total = subtotal', ok6.ok && seen6 === 0 && Number(ord6.shippingFee) === 0 && Number(ord6.shippingCost) > 0 && Number(ord6.shippingSellerSubsidy) === Number(ord6.shippingCost) && Number(ord6.totalAmount) === Number(ord6.subtotal), ok6.ok ? ord6 : codeOf((ok6 as any).error));

  // ---------- 7. envio duplicado concorrente
  const o7 = await origin('dup', gabu.id);
  const b7 = await newCart([o7.product.id]);
  const seen7 = await prevFee([o7.product.id], 'STANDARD');
  const before7 = (await db.select().from(orders)).length;
  const dup = await Promise.all([attempt(() => place(b7, 'STANDARD', seen7)), attempt(() => place(b7, 'STANDARD', seen7)), attempt(() => place(b7, 'STANDARD', seen7))]);
  const created = (await db.select().from(orders)).length - before7;
  const groups7 = (await db.select().from(purchaseGroups).where(eq(purchaseGroups.buyerId, b7.buyerId))).length;
  const reservations7 = (await db.select().from(stockReservations).where(eq(stockReservations.productId, o7.product.id))).length;
  report('C18 3 envios simultâneos do mesmo carrinho: exatamente 1 sucesso, 1 pedido, 1 grupo e 1 reserva — sem duplicidade nem cobrança dupla', dup.filter((d) => d.ok).length === 1 && created === 1 && groups7 === 1 && reservations7 === 1, { ok: dup.map((d) => d.ok), created, groups7, reservations7 });

  // ---------- 8. HTTP: serviço + confirmação obrigatórios; preço do cliente nunca é autoridade
  const app = express(); app.use(express.json()); app.use('/api/v1', apiRouter);
  const server = http.createServer(app); await new Promise<void>((res) => server.listen(0, res));
  const base = `http://localhost:${(server.address() as any).port}/api/v1`;
  const tokenFor = (buyerId: string) => jwt.sign({ userId: buyerId, email: `${buyerId}@t.test`, role: 'BUYER', fullName: 'Comprador Teste', countryCode: 'GW', kycStatus: 'verified', isEmailVerified: true }, getJwtAccessSecret(), { expiresIn: '10m' });
  const httpPost = async (path: string, buyer: any, body: any) => {
    const r = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenFor(buyer.buyerId)}` }, body: JSON.stringify({ addressId: buyer.addressId, paymentMethod: 'pix', ...body }) });
    return { status: r.status, json: await r.json() as any };
  };
  const o8 = await origin('http', gabu.id);
  const b8 = await newCart([o8.product.id]);
  const before8 = await counts();
  for (const path of ['/orders', '/buyer/orders']) {
    const noSvc = await httpPost(path, b8, {});
    report(`C19 POST ${path} sem serviço escolhido: 400 SHIPPING_SERVICE_REQUIRED e nada criado`, noSvc.status === 400 && noSvc.json?.error?.code === 'SHIPPING_SERVICE_REQUIRED' && (await counts()) === before8, noSvc);
    const noConf = await httpPost(path, b8, { shippingServiceCode: 'STANDARD' });
    report(`C20 POST ${path} sem confirmar o valor do frete: 400 SHIPPING_CONFIRMATION_REQUIRED e nada criado`, noConf.status === 400 && noConf.json?.error?.code === 'SHIPPING_CONFIRMATION_REQUIRED' && (await counts()) === before8, noConf);
    const badSvc = await httpPost(path, b8, { shippingServiceCode: 'x;drop', expectedShippingChargedToBuyer: 1500 });
    report(`C21 POST ${path} com serviço malformado: 400 SHIPPING_SERVICE_INVALID`, badSvc.status === 400 && badSvc.json?.error?.code === 'SHIPPING_SERVICE_INVALID', badSvc);
    const badAmt = await httpPost(path, b8, { shippingServiceCode: 'STANDARD', expectedShippingChargedToBuyer: -5 });
    report(`C22 POST ${path} com valor de confirmação inválido: 400 SHIPPING_CONFIRMATION_INVALID`, badAmt.status === 400 && badAmt.json?.error?.code === 'SHIPPING_CONFIRMATION_INVALID', badAmt);
    const stale = await httpPost(path, b8, { shippingServiceCode: 'STANDARD', expectedShippingChargedToBuyer: 1 });
    report(`C23 POST ${path} com valor desatualizado: 409 SHIPPING_QUOTE_CHANGED com valor anterior e novo, nada criado`, stale.status === 409 && stale.json?.error?.code === 'SHIPPING_QUOTE_CHANGED' && stale.json.error.details?.currentShippingChargedToBuyer === 1700 && (await counts()) === before8, stale);
  }
  // preço enviado pelo cliente (campos de preço/total/frete) nunca é usado: só o código do serviço + o valor a confirmar
  const forged = await httpPost('/orders', b8, { shippingServiceCode: 'STANDARD', expectedShippingChargedToBuyer: 1700, shippingFee: 1, shippingAmount: 1, shippingCost: 1, shippingChargedToBuyer: 1, totalAmount: 1, subtotal: 1, price: 1 });
  const [ord8] = forged.status === 201 ? await db.select().from(orders).where(eq(orders.id, forged.json.data.orders[0].id)) : [null as any];
  report('C24 preço/total/frete forjados no corpo da requisição são ignorados: o pedido cobra a tarifa do servidor (1700) e o total real', forged.status === 201 && Number(ord8.shippingFee) === 1700 && Number(ord8.totalAmount) === Number(ord8.subtotal) + 1700, forged.status === 201 ? ord8 : forged);
  server.close();

  // ---------- 9. total / Escrow / reembolso coerentes com o frete cobrado
  const o9 = await origin('escrow', gabu.id);
  const b9 = await newCart([o9.product.id]);
  const seen9 = await prevFee([o9.product.id], 'EXPRESS');
  const ok9 = await attempt(() => place(b9, 'EXPRESS', seen9));
  if (!ok9.ok) { report('C25 pedido para Escrow criado', false, codeOf((ok9 as any).error)); } else {
    const groupId = ok9.value.purchaseGroup.id, orderId = ok9.value.orders[0].id;
    const [pg0] = await db.select().from(purchaseGroups).where(eq(purchaseGroups.id, groupId));
    const [od0] = await db.select().from(orders).where(eq(orders.id, orderId));
    report('C25 total do grupo = total do pedido = subtotal + frete Express (3000); sellerNet não inclui frete', Number(pg0.totalAmount) === Number(od0.totalAmount) && Number(od0.totalAmount) === Number(od0.subtotal) + 3000 && Number(od0.sellerNetAmount) <= Number(od0.subtotal), { pg: pg0.totalAmount, od: od0.totalAmount, net: od0.sellerNetAmount });
    const paymentId = kit.uid('pay_group'), asaasId = kit.uid('EXT');
    await db.insert(payments).values({ id: paymentId, orderId: null, purchaseGroupId: groupId, settlementRole: 'candidate', buyerId: b9.buyerId, amount: String(pg0.totalAmount), currency: 'XOF', provider: 'asaas', method: 'pix', status: 'pending', idempotencyKey: `asaas_pix_group:${groupId}:${paymentId}`, transactionRef: asaasId, createdAt: new Date(), updatedAt: new Date() } as any);
    await db.insert(paymentAttempts).values({ id: kit.uid('att'), paymentId, provider: 'asaas', status: 'reserved', createdAt: new Date() } as any);
    const wh: any = await attempt(() => PaymentService.confirmPurchaseGroupPayment(groupId, paymentId, { provider: 'asaas', transactionRef: asaasId, receivedValue: Number(pg0.totalAmount) }));
    const [esc] = await db.select().from(escrowAccounts).where(eq(escrowAccounts.orderId, orderId));
    report('C26 pagamento confirmado: Escrow retém exatamente o total do pedido (produtos + frete cobrado)', wh.ok && !!esc && esc.status === 'held' && Number(esc.amount) === Number(od0.totalAmount), { wh, esc });
    const rf: any = await attempt(() => processRefund({ orderId, amount: Number(od0.totalAmount), reason: 'teste etapa C', idempotencyKey: `etc_${orderId}` }, db));
    const [escAfter] = await db.select().from(escrowAccounts).where(eq(escrowAccounts.orderId, orderId));
    const rfRows = await db.select().from(refunds).where(eq(refunds.orderId, orderId));
    report('C27 reembolso integral devolve o total pago (inclui o frete cobrado) e reverte o Escrow', rf.ok && rfRows.length === 1 && Number(rfRows[0].amount) === Number(od0.totalAmount) && escAfter.status === 'refunded', rf.ok ? { rows: rfRows.map((r: any) => [r.amount, r.status]), esc: escAfter.status } : codeOf(rf.error));
  }

  // ---------- 10. travas de código (defesa contra regressão)
  const svc = fs.readFileSync('src/server/modules/orders/orderService.ts', 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
  const iLock = svc.indexOf(".from(carts).where(eq(carts.userId, userId)).limit(1).for('update')");
  const iGuard = svc.indexOf('await lockAndVerifyRates(');
  const iMatch = svc.indexOf('assertShippingQuoteMatches(');
  const iGroup = svc.indexOf('await tx.insert(purchaseGroups)');
  report('C28 carrinho travado (FOR UPDATE) no início da transação; tarifas travadas e total conferido ANTES de inserir purchase_group/pedidos', iLock > 0 && iGuard > 0 && iMatch > iGuard && iGroup > iMatch, { iLock, iGuard, iMatch, iGroup });
  const routes = [fs.readFileSync('src/server/buyerRoutes.ts', 'utf8'), fs.readFileSync('src/server/modules/orders/orderRoutes.ts', 'utf8')];
  report('C29 as duas rotas de criação de pedido exigem serviço + confirmação (required: true) e nenhuma aceita preço do cliente', routes.every((s) => s.includes('parseShippingSelection(req.body, { required: true })') && !/req\.body[^;]*shippingFee|req\.body[^;]*totalAmount/.test(s)));
  const co = fs.readFileSync('src/components/CheckoutView.tsx', 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
  report('C30 checkout: SHIPPING_QUOTE_CHANGED mantém o serviço, recota e exige nova confirmação (não limpa a escolha, não reenvia sozinho)', /code === 'SHIPPING_QUOTE_CHANGED'\) \{[\s\S]{0,400}setQuoteVersion\(\(v\) => v \+ 1\);\s*\}/.test(co) && !/SHIPPING_QUOTE_CHANGED'\) \{[^}]*chooseService\(null\)/.test(co));

  console.log(`\n${passed}/${total} passaram`);
  await pool.end();
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
