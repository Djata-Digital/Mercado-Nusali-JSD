/**
 * EDITAR TARIFA (painel Rotas & Tarifas por Setor) — PATCH /admin/shipping/rates/:id: edição válida no MESMO registro (sem duplicar),
 * faixas sobrepostas rejeitadas, vigência e limites validados, identidade (rota/serviço/moeda) imutável, permissões, auditoria,
 * pedidos anteriores intactos (snapshot, Escrow), checkout usa o novo valor e exige nova confirmação, concorrência com o checkout
 * (FOR SHARE x FOR UPDATE) e entre administradores. Postgres 17 DESCARTAVEL. Nunca produção.
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
import {
  orders, orderItems, purchaseGroups, stockReservations, shippingRouteRates, auditLogs, payments, paymentAttempts, escrowAccounts,
} from '../src/db/schema.js';
import { apiRouter } from '../src/server/api.js';
import { OrderService } from '../src/server/modules/orders/orderService.js';
import { PaymentService } from '../src/server/modules/payments/paymentService.js';
import { getJwtAccessSecret } from '../src/server/modules/auth/jwtConfig.js';
import { resolveCartShippingPreview } from '../src/server/modules/shipping/shippingPreviewService.js';
import { lockAndVerifyRates } from '../src/server/modules/shipping/shippingQuoteGuard.js';
import { setupCheckoutKit } from './checkoutTestKit.js';

if (!['localhost', '127.0.0.1'].includes(new URL(testDbUrl).hostname)) throw new Error('Somente banco local descartavel.');
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 700)}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false }, max: 10 });
  const db = drizzle(pool, { schema });
  const kit = await setupCheckoutKit(db, 'er');
  await kit.setFlag('multiSellerCheckoutEnabled', true);
  const bissau = await kit.sector('Bissau');
  const allSectors: any[] = await db.select().from(schema.shippingSectors);
  const sectors = allSectors.filter((x) => x.countryCode === 'GW' && x.id !== bissau.id).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  let next = 0;
  const std = await kit.service('STANDARD'), exp = await kit.service('EXPRESS');

  const app = express(); app.use(express.json()); app.use('/api/v1', apiRouter);
  const server = http.createServer(app); await new Promise<void>((res) => server.listen(0, res));
  const base = `http://localhost:${(server.address() as any).port}/api/v1`;
  const tokenFor = (userId: string, role: string) => jwt.sign({ userId, email: `${userId}@t.test`, role, fullName: `Teste ${role}`, countryCode: 'GW', kycStatus: 'verified', isEmailVerified: true }, getJwtAccessSecret(), { expiresIn: '10m' });
  const adminId = await kit.makeUser('ADMIN');
  const adminTok = tokenFor(adminId, 'ADMIN');
  const call = async (method: string, path: string, token: string | null, body?: any) => {
    const r = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, json: await r.json().catch(() => null) as any };
  };
  const patch = (id: string, body: any, tok: string | null = adminTok) => call('PATCH', `/admin/shipping/rates/${id}`, tok, body);
  const rateRow = async (id: string) => (await db.select().from(shippingRouteRates).where(eq(shippingRouteRates.id, id)))[0];
  const errMsg = (r: any) => String(r.json?.error?.message || r.json?.message || '');

  /** origem própria por cenário (tarifas isoladas) */
  const origin = async (label: string, weightKg = 0.3, price = 100) => {
    const sector = sectors[next++];
    const seller = await kit.makeSeller(label);
    const store = await kit.makeStore(seller, label, sector.id);
    const product = await kit.makeProduct(seller, store.storeId, `P ${label}`, weightKg, price);
    await kit.insertInventory({ sellerId: seller.sellerId, productId: product.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: store.floc.id, quantityOnHand: 50 });
    const route = await kit.route(sector.id, bissau.id);
    return { sector, seller, store, product, route };
  };
  const prevFee = async (productId: string, serviceCode = 'STANDARD') => {
    const r: any = await resolveCartShippingPreview({ destinationShippingSectorId: bissau.id, serviceCode, items: [{ productId, variantId: null, quantity: 1 }] }, db);
    return r.available ? Number(r.shippingChargedToBuyer) : null;
  };
  const counts = async () => JSON.stringify([(await db.select().from(orders)).length, (await db.select().from(purchaseGroups)).length, (await db.select().from(stockReservations)).length]);
  const place = async (productId: string, expected: number | null, serviceCode = 'STANDARD') => {
    const buyer = await kit.makeBuyer(bissau.id);
    await kit.addToCart(buyer.cartId, productId, 1);
    try {
      return { ok: true as const, buyer, value: await OrderService.createOrderFromCart({ userId: buyer.buyerId, addressId: buyer.addressId, paymentMethod: 'pix', shippingSelection: { serviceCode, expectedShippingChargedToBuyer: expected } } as any, db) as any };
    } catch (e: any) { return { ok: false as const, buyer, error: e }; }
  };

  // ---------- 1. edição válida: mesmo registro, sem duplicar
  const o1 = await origin('edit');
  const rA = await kit.insertRate(o1.route.id, std.id, 1500, { min: 0, max: 1 });
  await kit.insertRate(o1.route.id, std.id, 2500, { min: 1, max: 5 });
  const exA = await kit.insertRate(o1.route.id, exp.id, 3000, { min: 0, max: 1 });
  const beforeA = await rateRow(rA);
  const totalRates = async () => (await db.select().from(shippingRouteRates)).length;
  const nBefore = await totalRates();
  await sleep(20);
  const from = new Date(Date.now() + 86_400_000).toISOString(), until = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const r1 = await patch(rA, { amount: 1800, minWeightKg: 0, maxWeightKg: 0.8, validFrom: from, validUntil: until });
  const afterA = await rateRow(rA);
  report('E1 edição válida: 200, mesmo id, preço/faixa/vigência atualizados e createdAt preservado; nenhuma tarifa criada ou apagada', r1.status === 200 && r1.json.success === true && r1.json.data.id === rA && Number(afterA.amount) === 1800 && Number(afterA.maxWeightKg) === 0.8 && afterA.validFrom && afterA.validUntil && afterA.createdAt.getTime() === beforeA.createdAt.getTime() && afterA.updatedAt.getTime() > beforeA.updatedAt.getTime() && (await totalRates()) === nBefore, { status: r1.status, afterA });
  report('E2 vigência gravada exatamente como enviada (instante UTC) e rota/serviço/moeda inalterados', afterA.validFrom.toISOString() === from && afterA.validUntil.toISOString() === until && afterA.routeId === beforeA.routeId && afterA.serviceId === beforeA.serviceId && afterA.currency === 'XOF', afterA);
  const same = await patch(rA, { amount: 1800, minWeightKg: 0, maxWeightKg: 0.8 });
  report('E3 reenviar os mesmos valores é idempotente (200, sem erro de sobreposição consigo mesma)', same.status === 200 && Number((await rateRow(rA)).amount) === 1800, same);

  // ---------- 2. faixas sobrepostas
  const beforeOv = await rateRow(rA);
  const ov1 = await patch(rA, { maxWeightKg: 3 }); // [0,3) invade [1,5) do mesmo serviço/rota
  report('E4 faixa sobreposta a outra tarifa ATIVA do mesmo serviço e rota: 400 RATE_OVERLAP e o registro não muda', ov1.status === 400 && /RATE_OVERLAP/.test(errMsg(ov1)) && Number((await rateRow(rA)).maxWeightKg) === Number(beforeOv.maxWeightKg), { ov1: errMsg(ov1) });
  const edge = await patch(rA, { maxWeightKg: 1 }); // [0,1) encosta em [1,5): não sobrepõe ([min,max))
  report('E5 faixas adjacentes [0,1) e [1,5) não sobrepõem (máximo exclusivo): 200', edge.status === 200 && Number((await rateRow(rA)).maxWeightKg) === 1, errMsg(edge));
  const otherSvc = await patch(exA, { minWeightKg: 0, maxWeightKg: 5 }); // mesmo intervalo em OUTRO serviço da mesma rota: permitido
  report('E6 a mesma faixa em OUTRO serviço da mesma rota é permitida', otherSvc.status === 200, errMsg(otherSvc));
  const periodOk = await patch(rA, { maxWeightKg: 3, validFrom: from, validUntil: until }); // [0,3) com vigência futura vs. a [1,5) sem prazo → sobrepõe período
  report('E7 sobreposição de peso E de período (uma delas sem prazo) é rejeitada', periodOk.status === 400 && /RATE_OVERLAP/.test(errMsg(periodOk)), errMsg(periodOk));
  const rB = (await db.select().from(shippingRouteRates).where(eq(shippingRouteRates.routeId, o1.route.id))).find((r: any) => Number(r.minWeightKg) === 1 && r.serviceId === std.id)!;
  await patch(rB.id, { validFrom: new Date(Date.now() + 60 * 86_400_000).toISOString() }); // [1,5) só vale daqui a 60 dias
  const disjoint = await patch(rA, { maxWeightKg: 3, validFrom: from, validUntil: until });
  report('E8 mesma faixa de peso em períodos de vigência DISJUNTOS é permitida', disjoint.status === 200, errMsg(disjoint));

  // ---------- 3. valores inválidos nunca gravam
  const snap = JSON.stringify(await rateRow(rA));
  const bad: Array<[string, any, RegExp]> = [
    ['peso mínimo negativo', { minWeightKg: -1 }, /MIN_WEIGHT_INVALID/],
    ['máximo <= mínimo', { minWeightKg: 2, maxWeightKg: 2 }, /MAX_WEIGHT_INVALID/],
    ['valor negativo', { amount: -5 }, /AMOUNT_INVALID/],
    ['valor não numérico', { amount: 'abc' }, /AMOUNT_INVALID/],
    ['valor acima do limite da coluna', { amount: 1e12 }, /AMOUNT_INVALID/],
    ['peso máximo acima do limite da coluna', { maxWeightKg: 1e7 }, /MAX_WEIGHT_INVALID/],
    ['fim da vigência antes do início', { validFrom: until, validUntil: from }, /VALIDITY_INVALID/],
    ['data inválida', { validFrom: 'não-é-data' }, /VALIDITY_INVALID/],
  ];
  for (const [name, body, re] of bad) {
    const r = await patch(rA, body);
    report(`E9 ${name}: 400 e nada é gravado`, r.status === 400 && re.test(errMsg(r)) && JSON.stringify(await rateRow(rA)) === snap, { status: r.status, msg: errMsg(r) });
  }
  const postBad = await call('POST', '/admin/shipping/rates', adminTok, { routeId: o1.route.id, serviceId: std.id, minWeightKg: 10, maxWeightKg: 11, amount: 10, currency: 'XOF', validFrom: until, validUntil: from });
  report('E10 a criação também rejeita vigência invertida (mesma validação)', postBad.status === 400 && /VALIDITY_INVALID/.test(errMsg(postBad)), errMsg(postBad));

  // ---------- 4. identidade imutável / inexistente / inativa
  const otherRoute = await kit.route(sectors[next++].id, bissau.id);
  const i1 = await patch(rA, { routeId: otherRoute.id });
  const i2 = await patch(rA, { serviceId: exp.id });
  const i3 = await patch(rA, { currency: 'BRL' });
  const iSame = await patch(rA, { routeId: o1.route.id, serviceId: std.id, currency: 'xof', amount: 1900 });
  report('E11 rota, serviço e moeda NÃO mudam numa edição (400 RATE_IDENTITY_IMMUTABLE); reenviar os mesmos é aceito', [i1, i2, i3].every((r) => r.status === 400 && /RATE_IDENTITY_IMMUTABLE/.test(errMsg(r))) && iSame.status === 200, [i1.status, i2.status, i3.status, iSame.status]);
  const nf = await patch('shprate_inexistente', { amount: 1 });
  report('E12 tarifa inexistente: 404', nf.status === 404, nf);
  const o2 = await origin('inativa');
  const act = await kit.insertRate(o2.route.id, std.id, 1000, { min: 0, max: 5 });
  const inact = await kit.insertRate(o2.route.id, std.id, 900, { min: 1, max: 3, isActive: false });
  const editInactive = await patch(inact, { amount: 950 }); // sobrepõe a ativa, mas continua inativa: livre
  const reactivate = await patch(inact, { isActive: true });
  report('E13 editar tarifa INATIVA que sobrepõe uma ativa é livre; reativá-la sobreposta é rejeitado', editInactive.status === 200 && reactivate.status === 400 && /RATE_OVERLAP/.test(errMsg(reactivate)) && (await rateRow(inact)).isActive === false, { e: editInactive.status, r: errMsg(reactivate) });
  void act;

  // ---------- 5. permissões
  const sellerTok = tokenFor(await kit.makeUser('SELLER'), 'SELLER'), buyerTok = tokenFor(await kit.makeUser('BUYER'), 'BUYER');
  const whTok = tokenFor(await kit.makeUser('WAREHOUSE_MANAGER'), 'WAREHOUSE_MANAGER');
  const snapP = JSON.stringify(await rateRow(rA));
  const p0 = await patch(rA, { amount: 5 }, null), p1 = await patch(rA, { amount: 5 }, buyerTok), p2 = await patch(rA, { amount: 5 }, sellerTok), p3 = await patch(rA, { amount: 5 }, whTok);
  report('E14 sem login 401; comprador, vendedor e operador de armazém 403; nada é gravado', p0.status === 401 && p1.status === 403 && p2.status === 403 && p3.status === 403 && JSON.stringify(await rateRow(rA)) === snapP, [p0.status, p1.status, p2.status, p3.status]);
  const gaTok = tokenFor(await kit.makeUser('GLOBAL_ADMIN'), 'GLOBAL_ADMIN');
  const okGA = await patch(rA, { amount: 1950 }, gaTok);
  report('E15 Administração Global e Administração podem editar (200)', okGA.status === 200 && Number((await rateRow(rA)).amount) === 1950, okGA.status);

  // ---------- 6. auditoria
  const audits = (await db.select().from(auditLogs).where(eq(auditLogs.resourceId, rA))).filter((a: any) => a.action === 'admin.shipping_route_rate.updated');
  const lastAudit: any = audits.sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  report('E16 cada edição gera auditoria com o estado ANTES e DEPOIS (ator = administrador)', audits.length >= 2 && !!lastAudit?.detailsJson?.before && !!lastAudit?.detailsJson?.after && Number(lastAudit.detailsJson.before.amount) !== Number(lastAudit.detailsJson.after.amount) && !!lastAudit.actorUserId, lastAudit?.detailsJson);

  // ---------- 7. pedidos anteriores NÃO mudam; checkout usa o novo valor
  const o3 = await origin('historico');
  const rH = await kit.insertRate(o3.route.id, std.id, 1500, { min: 0, max: 5 });
  const seenH = await prevFee(o3.product.id);
  const placed = await place(o3.product.id, seenH);
  if (!placed.ok) report('E17 pedido de referência criado', false, placed.error?.message); else {
    const orderId = placed.value.orders[0].id, groupId = placed.value.purchaseGroup.id;
    const payId = kit.uid('pay_group'), ext = kit.uid('EXT');
    const [pg0] = await db.select().from(purchaseGroups).where(eq(purchaseGroups.id, groupId));
    await db.insert(payments).values({ id: payId, orderId: null, purchaseGroupId: groupId, settlementRole: 'candidate', buyerId: placed.buyer.buyerId, amount: String(pg0.totalAmount), currency: 'XOF', provider: 'asaas', method: 'pix', status: 'pending', idempotencyKey: `asaas_pix_group:${groupId}:${payId}`, transactionRef: ext, createdAt: new Date(), updatedAt: new Date() } as any);
    await db.insert(paymentAttempts).values({ id: kit.uid('att'), paymentId: payId, provider: 'asaas', status: 'reserved', createdAt: new Date() } as any);
    await PaymentService.confirmPurchaseGroupPayment(groupId, payId, { provider: 'asaas', transactionRef: ext, receivedValue: Number(pg0.totalAmount) });
    const snapshot = async () => JSON.stringify({
      o: (await db.select().from(orders).where(eq(orders.id, orderId)))[0],
      i: (await db.select().from(orderItems).where(eq(orderItems.orderId, orderId))).map((x: any) => [x.id, x.shippingAmount, x.shippingRateId, x.shippingServiceCode, x.totalWeightKg]),
      g: (await db.select().from(purchaseGroups).where(eq(purchaseGroups.id, groupId)))[0],
      e: (await db.select().from(escrowAccounts).where(eq(escrowAccounts.orderId, orderId))).map((x: any) => [x.amount, x.status]),
    });
    const before = await snapshot();
    const edit = await patch(rH, { amount: 2200, minWeightKg: 0, maxWeightKg: 2 });
    report('E17 editar a tarifa (1500 → 2200) NÃO altera o pedido já feito: frete, totais, itens (snapshot e rateId), grupo e Escrow idênticos', edit.status === 200 && (await snapshot()) === before && placed.value.orders[0].shippingFee === 1500, { status: edit.status });
    const [itH] = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    report('E18 o item do pedido antigo continua apontando para a MESMA tarifa (id preservado) e guarda o valor cobrado na época (1500)', itH.shippingRateId === rH && Number(itH.shippingAmount) === 1500 && Number((await rateRow(rH)).amount) === 2200, itH);
    const newFee = await prevFee(o3.product.id);
    report('E19 a próxima cotação já usa o novo valor (2200)', newFee === 2200, newFee);
    const second = await place(o3.product.id, newFee);
    report('E20 um novo pedido cobra o novo valor (2200) e o antigo continua com 1500', second.ok && Number((await db.select().from(orders).where(eq(orders.id, second.value.orders[0].id)))[0].shippingFee) === 2200 && Number((await db.select().from(orders).where(eq(orders.id, orderId)))[0].shippingFee) === 1500, second.ok ? 'ok' : second.error?.message);
  }

  // ---------- 8. concorrência com o checkout
  const o4 = await origin('conc');
  const rC = await kit.insertRate(o4.route.id, std.id, 1500, { min: 0, max: 5 });
  const seenC = await prevFee(o4.product.id);
  const buyerC = await kit.makeBuyer(bissau.id); await kit.addToCart(buyerC.cartId, o4.product.id, 1);
  const beforeC = await counts();
  await patch(rC, { amount: 1700 }); // o administrador edita DEPOIS de o cliente ver 1500
  let stale: any = null;
  try { await OrderService.createOrderFromCart({ userId: buyerC.buyerId, addressId: buyerC.addressId, paymentMethod: 'pix', shippingSelection: { serviceCode: 'STANDARD', expectedShippingChargedToBuyer: seenC } } as any, db); } catch (e) { stale = e; }
  report('E21 tarifa editada durante a compra: o pedido com o valor antigo (1500) é recusado com 409 SHIPPING_QUOTE_CHANGED (anterior 1500, atual 1700); nada criado, carrinho intacto', stale?.code === 'SHIPPING_QUOTE_CHANGED' && stale.httpStatus === 409 && stale.details?.currentShippingChargedToBuyer === 1700 && (await counts()) === beforeC && (await db.select().from(schema.cartItems).where(eq(schema.cartItems.cartId, buyerC.cartId))).length === 1, stale?.details);
  const reconf = await OrderService.createOrderFromCart({ userId: buyerC.buyerId, addressId: buyerC.addressId, paymentMethod: 'pix', shippingSelection: { serviceCode: 'STANDARD', expectedShippingChargedToBuyer: 1700 } } as any, db) as any;
  report('E22 depois de o cliente confirmar o novo valor (1700) o pedido é criado cobrando 1700', Number((await db.select().from(orders).where(eq(orders.id, reconf.orders[0].id)))[0].shippingFee) === 1700);

  // trava real: transação de checkout aberta (FOR SHARE) → a edição ESPERA; só grava depois do commit
  const o5 = await origin('trava');
  const rT = await kit.insertRate(o5.route.id, std.id, 1000, { min: 0, max: 5 });
  const holder = await pool.connect();
  await holder.query('BEGIN');
  await lockAndVerifyRates(drizzle(holder as any, { schema }), [{ rateId: rT, amount: 1000, weightKg: 0.3, currency: 'XOF' }], 'STANDARD');
  let patchDone = false;
  const pending = patch(rT, { amount: 1234 }).then((r) => { patchDone = true; return r; });
  await sleep(900);
  const mid = Number((await rateRow(rT)).amount);
  report('E23 enquanto o checkout segura a tarifa (transação aberta), a edição fica em espera e o valor cobrado não muda no meio do pedido', !patchDone && mid === 1000, { patchDone, mid });
  await holder.query('COMMIT'); holder.release();
  const done = await pending;
  report('E24 terminado o pedido, a edição conclui (200) e o novo valor passa a valer', done.status === 200 && Number((await rateRow(rT)).amount) === 1234, done.status);

  // dois administradores editando faixas da mesma rota+serviço ao mesmo tempo: nunca terminam sobrepostas
  const rounds: any[] = [];
  for (let k = 0; k < 6; k++) {
    const o6 = await origin(`admins${k}`);
    const r1c = await kit.insertRate(o6.route.id, std.id, 100, { min: 0, max: 1 });
    const r2c = await kit.insertRate(o6.route.id, std.id, 200, { min: 2, max: 3 });
    const [pa, pb] = await Promise.all([patch(r1c, { maxWeightKg: 1.5 }), patch(r2c, { minWeightKg: 1.2 })]);
    const rows = (await db.select().from(shippingRouteRates).where(eq(shippingRouteRates.routeId, o6.route.id))).filter((r: any) => r.serviceId === std.id).map((r: any) => [Number(r.minWeightKg), Number(r.maxWeightKg)]).sort((x, y) => x[0] - y[0]);
    rounds.push({ s: [pa.status, pb.status].sort().join(), overlapping: rows.some((x, i) => rows.some((y, j) => i !== j && x[0] < y[1] && y[0] < x[1])) });
  }
  report('E25 6 rodadas de duas edições simultâneas que se sobreporiam: em TODAS exatamente uma é aceita e as faixas finais NÃO se sobrepõem', rounds.every((r) => r.s === '200,400' && !r.overlapping), rounds);

  server.close();
  console.log(`\n${passed}/${total} passaram`);
  await pool.end();
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
