/**
 * PRAZOS ESTIMADOS DE ENTREGA por rota + serviço (migração 0038): API admin (PUT/DELETE + detalhe da rota), validação, permissões,
 * auditoria, cotação do checkout (prazo por serviço, agregação, "a confirmar"), snapshot em order_items e ausência TOTAL de efeito
 * financeiro (preço, total, Escrow, confirmação do frete). Postgres 17 DESCARTAVEL com a 0038 aplicada. Nunca produção.
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
import { eq, and, sql } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import {
  orders, orderItems, purchaseGroups, auditLogs, payments, paymentAttempts, escrowAccounts, shippingRouteRates, shippingRouteServiceLeadTimes, countries, shippingServices,
} from '../src/db/schema.js';
import { apiRouter } from '../src/server/api.js';
import { OrderService } from '../src/server/modules/orders/orderService.js';
import { PaymentService } from '../src/server/modules/payments/paymentService.js';
import { getJwtAccessSecret } from '../src/server/modules/auth/jwtConfig.js';
import { resolveCartShippingPreview } from '../src/server/modules/shipping/shippingPreviewService.js';
import { validateLeadTimeInput, aggregateLeadTime, leadTimeKey } from '../src/server/modules/shipping/shippingLeadTimeService.js';
import { setupCheckoutKit } from './checkoutTestKit.js';

if (!['localhost', '127.0.0.1'].includes(new URL(testDbUrl).hostname)) throw new Error('Somente banco local descartavel.');
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 700)}`); };

async function main() {
  const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false }, max: 10 });
  const db = drizzle(pool, { schema });
  const kit = await setupCheckoutKit(db, 'lt');
  await kit.setFlag('multiSellerCheckoutEnabled', true);
  const bissau = await kit.sector('Bissau');
  const sectors: any[] = (await db.select().from(schema.shippingSectors)).filter((x: any) => x.countryCode === 'GW' && x.id !== bissau.id).sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
  let next = 0;
  const eco = await kit.service('ECONOMY'), std = await kit.service('STANDARD'), exp = await kit.service('EXPRESS');

  const app = express(); app.use(express.json()); app.use('/api/v1', apiRouter);
  const server = http.createServer(app); await new Promise<void>((res) => server.listen(0, res));
  const base = `http://localhost:${(server.address() as any).port}/api/v1`;
  const tokenFor = (userId: string, role: string) => jwt.sign({ userId, email: `${userId}@t.test`, role, fullName: `Teste ${role}`, countryCode: 'GW', kycStatus: 'verified', isEmailVerified: true }, getJwtAccessSecret(), { expiresIn: '10m' });
  const adminTok = tokenFor(await kit.makeUser('ADMIN'), 'ADMIN');
  const call = async (method: string, path: string, token: string | null, body?: any) => {
    const r = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, json: await r.json().catch(() => null) as any };
  };
  const put = (routeId: string, serviceId: string, body: any, tok: string | null = adminTok) => call('PUT', `/admin/shipping/routes/${routeId}/lead-times/${serviceId}`, tok, body);
  const del = (routeId: string, serviceId: string, tok: string | null = adminTok) => call('DELETE', `/admin/shipping/routes/${routeId}/lead-times/${serviceId}`, tok);
  const rows = async (routeId: string) => db.select().from(shippingRouteServiceLeadTimes).where(eq(shippingRouteServiceLeadTimes.routeId, routeId));
  const msg = (r: any) => String(r.json?.error?.message || r.json?.message || '');

  const origin = async (label: string, weightKg = 0.3, price = 100) => {
    const sector = sectors[next++];
    const seller = await kit.makeSeller(label);
    const store = await kit.makeStore(seller, label, sector.id);
    const product = await kit.makeProduct(seller, store.storeId, `P ${label}`, weightKg, price);
    await kit.insertInventory({ sellerId: seller.sellerId, productId: product.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: store.floc.id, quantityOnHand: 50 });
    const route = await kit.route(sector.id, bissau.id);
    return { sector, seller, store, product, route };
  };
  const preview = async (productIds: string[], serviceCode?: string) =>
    resolveCartShippingPreview({ destinationShippingSectorId: bissau.id, serviceCode: serviceCode || null, items: productIds.map((id) => ({ productId: id, variantId: null, quantity: 1 })) }, db) as Promise<any>;
  const opt = (r: any, code: string) => (r.services || []).find((o: any) => o.code === code);
  const place = async (productIds: string[], serviceCode: string, expected: number | null) => {
    const buyer = await kit.makeBuyer(bissau.id);
    for (const id of productIds) await kit.addToCart(buyer.cartId, id, 1);
    try { return { ok: true as const, buyer, value: await OrderService.createOrderFromCart({ userId: buyer.buyerId, addressId: buyer.addressId, paymentMethod: 'pix', shippingSelection: { serviceCode, expectedShippingChargedToBuyer: expected } } as any, db) as any }; }
    catch (e: any) { return { ok: false as const, buyer, error: e }; }
  };

  // ---------- 0. esquema (migração 0038)
  const cols: any = await db.execute(sql`select column_name, is_nullable from information_schema.columns where table_name='order_items' and column_name like 'delivery_estimate%' order by 1`);
  const idx: any = await db.execute(sql`select indexname from pg_indexes where tablename='shipping_route_service_lead_times'`);
  const chk: any = await db.execute(sql`select conname from pg_constraint where conrelid='shipping_route_service_lead_times'::regclass and contype='c'`);
  report('L1 esquema: tabela de prazos com UNIQUE(rota, serviço) e CHECKs (mín>=1, máx>=mín, máx<=365); order_items com 2 colunas de snapshot NULLABLE', (idx.rows ?? idx).some((r: any) => r.indexname === 'shipping_lead_times_route_service_uq') && (chk.rows ?? chk).length === 2 && (cols.rows ?? cols).length === 2 && (cols.rows ?? cols).every((c: any) => c.is_nullable === 'YES'), { idx: idx.rows, chk: chk.rows, cols: cols.rows });

  // ---------- 1. cadastro e edição (independente das faixas de peso)
  const o1 = await origin('prazo');
  await kit.insertRate(o1.route.id, std.id, 1500, { min: 0, max: 1 });
  await kit.insertRate(o1.route.id, std.id, 2500, { min: 1, max: 5 });
  await kit.insertRate(o1.route.id, exp.id, 3000, { min: 0, max: 5 });
  const ratesBefore = JSON.stringify((await db.select().from(shippingRouteRates).where(eq(shippingRouteRates.routeId, o1.route.id))).sort((a: any, b: any) => a.id.localeCompare(b.id)));
  const c1 = await put(o1.route.id, std.id, { minDays: 2, maxDays: 4 });
  const lt1 = (await rows(o1.route.id))[0];
  report('L2 PUT cria o prazo da rota+serviço (2 a 4 dias): 200 com id; uma só linha; as faixas de peso/tarifas ficam EXATAMENTE como estavam', c1.status === 200 && c1.json.data.minDays === 2 && c1.json.data.maxDays === 4 && (await rows(o1.route.id)).length === 1 && JSON.stringify((await db.select().from(shippingRouteRates).where(eq(shippingRouteRates.routeId, o1.route.id))).sort((a: any, b: any) => a.id.localeCompare(b.id))) === ratesBefore, c1);
  const detail = await call('GET', `/admin/shipping/routes/${o1.route.id}`, adminTok);
  report('L3 o detalhe da rota (Gerenciar Rota) devolve leadTimes por serviço, separado de rates', detail.status === 200 && Array.isArray(detail.json.data.leadTimes) && detail.json.data.leadTimes.length === 1 && detail.json.data.leadTimes[0].serviceId === std.id && detail.json.data.rates.length === 3, detail.json?.data?.leadTimes);
  await new Promise((r) => setTimeout(r, 15));
  const c2 = await put(o1.route.id, std.id, { minDays: 3, maxDays: 3 });
  const lt2 = (await rows(o1.route.id))[0];
  report('L4 PUT de novo ATUALIZA a mesma linha (id e createdAt preservados, updatedAt avança, sem duplicar); mín = máx é permitido', c2.status === 200 && (await rows(o1.route.id)).length === 1 && lt2.id === lt1.id && lt2.createdAt.getTime() === lt1.createdAt.getTime() && lt2.updatedAt.getTime() > lt1.updatedAt.getTime() && lt2.minDays === 3 && lt2.maxDays === 3, lt2);
  const dupDirect = await db.insert(shippingRouteServiceLeadTimes).values({ id: kit.uid('dup'), routeId: o1.route.id, serviceId: std.id, minDays: 1, maxDays: 2 } as any).then(() => 'inseriu', () => 'recusou');
  report('L5 o banco recusa um segundo prazo para a mesma rota+serviço (UNIQUE) e prazos inválidos (CHECK) mesmo fora da API', dupDirect === 'recusou' && await db.insert(shippingRouteServiceLeadTimes).values({ id: kit.uid('bad'), routeId: o1.route.id, serviceId: exp.id, minDays: 0, maxDays: 2 } as any).then(() => false, () => true) && await db.insert(shippingRouteServiceLeadTimes).values({ id: kit.uid('bad2'), routeId: o1.route.id, serviceId: exp.id, minDays: 5, maxDays: 2 } as any).then(() => false, () => true));
  const onlyOne = (await rows(o1.route.id)).length === 1;
  report('L6 prazo por serviço é independente: Economy/Standard/Express têm cada um o seu (Express 1 a 2 dias não altera o Standard)', (await put(o1.route.id, exp.id, { minDays: 1, maxDays: 2 })).status === 200 && (await rows(o1.route.id)).length === 2 && onlyOne && (await rows(o1.route.id)).find((r: any) => r.serviceId === std.id)!.minDays === 3);

  // ---------- 2. validação: nada inválido é gravado
  const snap = JSON.stringify(await rows(o1.route.id));
  const bad: Array<[string, any]> = [
    ['mínimo 0', { minDays: 0, maxDays: 3 }], ['negativo', { minDays: -1, maxDays: 3 }], ['mínimo maior que o máximo', { minDays: 5, maxDays: 3 }],
    ['não inteiro', { minDays: 1.5, maxDays: 3 }], ['texto', { minDays: 'abc', maxDays: 3 }], ['vazio', { minDays: '', maxDays: 3 }],
    ['ausente', {}], ['null', { minDays: null, maxDays: null }], ['acima de 365 dias', { minDays: 1, maxDays: 366 }],
  ];
  for (const [name, body] of bad) {
    const r = await put(o1.route.id, std.id, body);
    report(`L7 prazo inválido (${name}): 400 LEAD_TIME_INVALID e nada é gravado`, r.status === 400 && /LEAD_TIME_INVALID/.test(msg(r)) && JSON.stringify(await rows(o1.route.id)) === snap, { s: r.status, m: msg(r) });
  }
  report('L8 limites aceitos: 1 dia e 365 dias; números em texto ("2","4") são aceites como inteiros', (await put(o1.route.id, eco.id, { minDays: 1, maxDays: 365 })).status === 200 && (await put(o1.route.id, eco.id, { minDays: '2', maxDays: '4' })).status === 200);
  const nfR = await put('rota_inexistente', std.id, { minDays: 1, maxDays: 2 }), nfS = await put(o1.route.id, 'servico_inexistente', { minDays: 1, maxDays: 2 });
  await db.insert(countries).values({ id: 'BR', code: 'BR', name: 'Brasil', flag: 'BR', currency: 'BRL', currencySymbol: 'R$', phonePrefix: '+55', isActive: true, createdAt: new Date() } as any).onConflictDoNothing();
  const brSvc = kit.uid('svc_br');
  await db.insert(shippingServices).values({ id: brSvc, countryCode: 'BR', name: 'Standard BR', code: 'STANDARD', isActive: true } as any);
  const cross = await put(o1.route.id, brSvc, { minDays: 1, maxDays: 2 });
  report('L9 rota ou serviço inexistentes: 404; serviço de OUTRO país: 400 SERVICE_COUNTRY_MISMATCH', nfR.status === 404 && nfS.status === 404 && cross.status === 400 && /SERVICE_COUNTRY_MISMATCH/.test(msg(cross)), [nfR.status, nfS.status, cross.status, msg(cross)]);

  // ---------- 3. remover = "Prazo a confirmar"
  const rm = await del(o1.route.id, eco.id), rm2 = await del(o1.route.id, eco.id);
  report('L10 DELETE remove o prazo (volta a "a confirmar"); remover de novo dá 404; as outras rotas/serviços não são afetados', rm.status === 200 && rm2.status === 404 && (await rows(o1.route.id)).every((r: any) => r.serviceId !== eco.id) && (await rows(o1.route.id)).length === 2, [rm.status, rm2.status]);

  // ---------- 4. permissões
  const sellerTok = tokenFor(await kit.makeUser('SELLER'), 'SELLER'), buyerTok = tokenFor(await kit.makeUser('BUYER'), 'BUYER'), whTok = tokenFor(await kit.makeUser('WAREHOUSE_MANAGER'), 'WAREHOUSE_MANAGER');
  const snapP = JSON.stringify(await rows(o1.route.id));
  const ps = await Promise.all([null, buyerTok, sellerTok, whTok].map((t) => put(o1.route.id, std.id, { minDays: 9, maxDays: 9 }, t)));
  const ds = await Promise.all([null, buyerTok, sellerTok, whTok].map((t) => del(o1.route.id, std.id, t)));
  const unchanged = JSON.stringify(await rows(o1.route.id)) === snapP;
  const ga = await put(o1.route.id, std.id, { minDays: 3, maxDays: 3 }, tokenFor(await kit.makeUser('GLOBAL_ADMIN'), 'GLOBAL_ADMIN'));
  report('L11 sem login 401; comprador, vendedor e operador de armazém 403 (PUT e DELETE), nada gravado; Administração e Administração Global 200', ps[0].status === 401 && ds[0].status === 401 && [1, 2, 3].every((i) => ps[i].status === 403 && ds[i].status === 403) && unchanged && ga.status === 200, [ps.map((p) => p.status), ds.map((p) => p.status)]);

  // ---------- 5. auditoria
  const audits: any[] = (await db.select().from(auditLogs)).filter((a: any) => String(a.action).startsWith('admin.shipping_lead_time.'));
  const upd = audits.find((a) => a.action === 'admin.shipping_lead_time.upserted' && a.detailsJson?.before && a.detailsJson?.after);
  report('L12 auditoria: cada criação/edição e remoção é registrada (com antes/depois e o ator)', audits.some((a) => a.action === 'admin.shipping_lead_time.removed' && a.detailsJson?.before) && !!upd && !!upd.actorUserId, audits.map((a) => a.action));

  // ---------- 6. cotação do checkout: prazo por serviço, "a confirmar", sem inventar
  const o2 = await origin('cot');
  await kit.insertRate(o2.route.id, eco.id, 800); await kit.insertRate(o2.route.id, std.id, 1500); await kit.insertRate(o2.route.id, exp.id, 3000);
  await put(o2.route.id, std.id, { minDays: 2, maxDays: 4 }); await put(o2.route.id, exp.id, { minDays: 1, maxDays: 1 });
  const pv = await preview([o2.product.id]);
  report('L13 cada serviço devolve o SEU prazo: Standard 2–4, Express 1–1; Economy sem configuração = null ("Prazo a confirmar"), nunca um valor inventado', opt(pv, 'STANDARD').leadTime?.minDays === 2 && opt(pv, 'STANDARD').leadTime?.maxDays === 4 && opt(pv, 'EXPRESS').leadTime?.minDays === 1 && opt(pv, 'EXPRESS').leadTime?.maxDays === 1 && opt(pv, 'ECONOMY').leadTime === null, pv.services);
  const pvStd = await preview([o2.product.id], 'STANDARD');
  report('L14 serviço escolhido: o topo da resposta traz o prazo desse serviço; sem serviço escolhido nenhum prazo é imposto', pvStd.leadTime?.minDays === 2 && pvStd.leadTime?.maxDays === 4 && pvStd.serviceCode === 'STANDARD', pvStd.leadTime);
  const o3 = await origin('semprazo');
  await kit.insertRate(o3.route.id, std.id, 1000);
  const pvNone = await preview([o3.product.id], 'STANDARD');
  report('L15 rota sem nenhum prazo configurado: leadTime null e preço normal', pvNone.available === true && pvNone.leadTime === null && pvNone.shippingChargedToBuyer === 1000, pvNone);
  const pvUnavail = await preview([o3.product.id], 'ECONOMY');
  report('L16 serviço indisponível não traz prazo (nem preço)', pvUnavail.available === false && !('leadTime' in pvUnavail) && opt(pvUnavail, 'ECONOMY').leadTime === undefined, pvUnavail);

  // ---------- 7. vários volumes: do primeiro ao último; qualquer um sem prazo => "a confirmar"
  const oa = await origin('volA'), ob = await origin('volB');
  for (const o of [oa, ob]) await kit.insertRate(o.route.id, std.id, 1000);
  await put(oa.route.id, std.id, { minDays: 2, maxDays: 4 }); await put(ob.route.id, std.id, { minDays: 3, maxDays: 7 });
  const pvAB = await preview([oa.product.id, ob.product.id], 'STANDARD');
  report('L17 carrinho com 2 origens: prazo = do menor mínimo ao maior máximo (2 a 7 dias)', pvAB.leadTime?.minDays === 2 && pvAB.leadTime?.maxDays === 7 && pvAB.shippingChargedToBuyer === 2000, pvAB.leadTime);
  await del(ob.route.id, std.id);
  const pvAB2 = await preview([oa.product.id, ob.product.id], 'STANDARD');
  report('L18 se UMA das origens não tem prazo, o carrinho todo fica "a confirmar" (nunca um prazo parcial)', pvAB2.leadTime === null && pvAB2.available === true, pvAB2.leadTime);
  report('L19 funções puras: aggregateLeadTime e validateLeadTimeInput', (() => {
    const m = new Map([[leadTimeKey('r1', 's'), { minDays: 1, maxDays: 2 }], [leadTimeKey('r2', 's'), { minDays: 4, maxDays: 9 }]]);
    return aggregateLeadTime([{ routeId: 'r1', serviceId: 's' }, { routeId: 'r2', serviceId: 's' }], m)!.maxDays === 9 && aggregateLeadTime([{ routeId: 'r1', serviceId: 's' }, { routeId: 'r3', serviceId: 's' }], m) === null && aggregateLeadTime([], m) === null
      && validateLeadTimeInput(1, 2) === null && validateLeadTimeInput(0, 2) !== null && validateLeadTimeInput(3, 2) !== null && validateLeadTimeInput(1, 366) !== null && validateLeadTimeInput(1.2, 2) !== null && validateLeadTimeInput('x', 2) !== null;
  })());
  const o4 = await origin('mesmaorigem', 0.6); const p2 = await kit.makeProduct(o4.seller, o4.store.storeId, 'P2 mesma', 0.6, 100);
  await kit.insertInventory({ sellerId: o4.seller.sellerId, productId: p2.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: o4.store.floc.id, quantityOnHand: 50 });
  await kit.insertRate(o4.route.id, std.id, 1000, { min: 0, max: 5 }); await put(o4.route.id, std.id, { minDays: 5, maxDays: 6 });
  const pvC = await preview([o4.product.id, p2.id], 'STANDARD');
  report('L20 duas linhas da mesma origem (uma expedição consolidada): o prazo da rota, uma vez', pvC.leadTime?.minDays === 5 && pvC.leadTime?.maxDays === 6 && pvC.shippingChargedToBuyer === 1000, pvC);

  // ---------- 8. snapshot no pedido e histórico preservado
  const o5 = await origin('snap');
  await kit.insertRate(o5.route.id, std.id, 1500, { min: 0, max: 5 });
  await put(o5.route.id, std.id, { minDays: 2, maxDays: 4 });
  const seen = (await preview([o5.product.id], 'STANDARD')).shippingChargedToBuyer;
  const placed = await place([o5.product.id], 'STANDARD', seen);
  if (!placed.ok) report('L21 pedido criado', false, placed.error?.message); else {
    const orderId = placed.value.orders[0].id, groupId = placed.value.purchaseGroup.id;
    const itemsOf = async () => (await db.select().from(orderItems).where(eq(orderItems.orderId, orderId))).map((i: any) => [i.deliveryEstimateMinDays, i.deliveryEstimateMaxDays]);
    report('L21 o pedido guarda o prazo mostrado (2 a 4) em cada item — snapshot', JSON.stringify(await itemsOf()) === JSON.stringify([[2, 4]]), await itemsOf());
    // pagamento + escrow ANTES de editar o prazo
    const [pg0] = await db.select().from(purchaseGroups).where(eq(purchaseGroups.id, groupId));
    const payId = kit.uid('pay_group'), ext = kit.uid('EXT');
    await db.insert(payments).values({ id: payId, orderId: null, purchaseGroupId: groupId, settlementRole: 'candidate', buyerId: placed.buyer.buyerId, amount: String(pg0.totalAmount), currency: 'XOF', provider: 'asaas', method: 'pix', status: 'pending', idempotencyKey: `asaas_pix_group:${groupId}:${payId}`, transactionRef: ext, createdAt: new Date(), updatedAt: new Date() } as any);
    await db.insert(paymentAttempts).values({ id: kit.uid('att'), paymentId: payId, provider: 'asaas', status: 'reserved', createdAt: new Date() } as any);
    await PaymentService.confirmPurchaseGroupPayment(groupId, payId, { provider: 'asaas', transactionRef: ext, receivedValue: Number(pg0.totalAmount) });
    const money = async () => JSON.stringify({
      o: (await db.select().from(orders).where(eq(orders.id, orderId)))[0],
      g: (await db.select().from(purchaseGroups).where(eq(purchaseGroups.id, groupId)))[0],
      i: (await db.select().from(orderItems).where(eq(orderItems.orderId, orderId))).map((i: any) => [i.shippingAmount, i.shippingRateId, i.totalWeightKg]),
      p: (await db.select().from(payments).where(eq(payments.purchaseGroupId, groupId))).map((p: any) => [p.amount, p.status]),
      e: (await db.select().from(escrowAccounts).where(eq(escrowAccounts.orderId, orderId))).map((e: any) => [e.amount, e.status]),
    });
    const moneyBefore = await money();
    await put(o5.route.id, std.id, { minDays: 10, maxDays: 20 });
    report('L22 editar o prazo (2–4 → 10–20) NÃO muda o snapshot do pedido antigo', JSON.stringify(await itemsOf()) === JSON.stringify([[2, 4]]), await itemsOf());
    await del(o5.route.id, std.id);
    report('L23 remover o prazo também NÃO muda o snapshot do pedido antigo', JSON.stringify(await itemsOf()) === JSON.stringify([[2, 4]]));
    report('L24 nada financeiro mudou: pedido, grupo, frete, itens, pagamento e Escrow idênticos (prazo é só informação)', (await money()) === moneyBefore && Number((await db.select().from(escrowAccounts).where(eq(escrowAccounts.orderId, orderId)))[0].amount) === Number(placed.value.orders[0].totalAmount), 'diferente');
  }
  // pedido SEM prazo configurado: snapshot nulo; e prazo editado entre cotação e confirmação não exige reconfirmação
  const o6 = await origin('semsnap');
  await kit.insertRate(o6.route.id, std.id, 1200, { min: 0, max: 5 });
  const seen6 = (await preview([o6.product.id], 'STANDARD')).shippingChargedToBuyer;
  const noLead = await place([o6.product.id], 'STANDARD', seen6);
  const noLeadItems = noLead.ok ? await db.select().from(orderItems).where(eq(orderItems.orderId, noLead.value.orders[0].id)) : [];
  report('L25 sem prazo configurado: snapshot NULL (= "Prazo a confirmar"), nunca um 0 ou prazo inventado', noLead.ok && noLeadItems.length === 1 && noLeadItems[0].deliveryEstimateMinDays === null && noLeadItems[0].deliveryEstimateMaxDays === null, noLeadItems.map((i: any) => [i.deliveryEstimateMinDays, i.deliveryEstimateMaxDays]));
  const o7 = await origin('edicao');
  await kit.insertRate(o7.route.id, std.id, 1300, { min: 0, max: 5 });
  await put(o7.route.id, std.id, { minDays: 2, maxDays: 3 });
  const seen7 = (await preview([o7.product.id], 'STANDARD')).shippingChargedToBuyer;
  const buyer7 = await kit.makeBuyer(bissau.id); await kit.addToCart(buyer7.cartId, o7.product.id, 1);
  await put(o7.route.id, std.id, { minDays: 4, maxDays: 8 }); // o administrador muda o prazo DEPOIS de o cliente ver 2–3
  let r7: any, e7: any;
  try { r7 = await OrderService.createOrderFromCart({ userId: buyer7.buyerId, addressId: buyer7.addressId, paymentMethod: 'pix', shippingSelection: { serviceCode: 'STANDARD', expectedShippingChargedToBuyer: seen7 } } as any, db); } catch (e) { e7 = e; }
  const i7 = r7 ? await db.select().from(orderItems).where(eq(orderItems.orderId, r7.orders[0].id)) : [];
  report('L26 mudar só o prazo durante a compra NÃO bloqueia nem exige nova confirmação (não é preço): o pedido é criado cobrando o mesmo frete, com o prazo vigente na criação (4–8)', !e7 && r7 && Number(r7.orders[0].shippingFee) === seen7 && i7[0].deliveryEstimateMinDays === 4 && i7[0].deliveryEstimateMaxDays === 8, e7?.message ?? i7);

  // ---------- 9. o prazo nunca derruba a cotação
  const o8 = await origin('tolerante');
  await kit.insertRate(o8.route.id, std.id, 1100, { min: 0, max: 5 });
  await put(o8.route.id, std.id, { minDays: 1, maxDays: 2 });
  await db.execute(sql`alter table shipping_route_service_lead_times rename to shipping_route_service_lead_times_tmp`);
  let pvBroken: any = null;
  try { pvBroken = await preview([o8.product.id], 'STANDARD'); } finally { await db.execute(sql`alter table shipping_route_service_lead_times_tmp rename to shipping_route_service_lead_times`); }
  report('L27 se o prazo não puder ser lido, a cotação continua correta (preço 1100) e o prazo fica "a confirmar" — nunca derruba o checkout', pvBroken?.available === true && pvBroken.shippingChargedToBuyer === 1100 && pvBroken.leadTime === null, pvBroken);

  // ---------- 10. cotação e valores: o prazo não altera nenhum número
  const o9 = await origin('numeros');
  await kit.insertRate(o9.route.id, std.id, 1700, { min: 0, max: 5 });
  const a = await preview([o9.product.id], 'STANDARD');
  await put(o9.route.id, std.id, { minDays: 6, maxDays: 9 });
  const b = await preview([o9.product.id], 'STANDARD');
  const strip = (r: any) => JSON.stringify({ c: r.shippingChargedToBuyer, k: r.shippingCost, s: r.shippingSellerSubsidy, cur: r.currency, sellers: r.sellers });
  report('L28 definir um prazo não altera preço, custo, subsídio nem moeda da cotação', strip(a) === strip(b) && a.leadTime === null && b.leadTime?.minDays === 6, [strip(a), strip(b)]);

  server.close();
  console.log(`\n${passed}/${total} passaram`);
  await pool.end();
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
