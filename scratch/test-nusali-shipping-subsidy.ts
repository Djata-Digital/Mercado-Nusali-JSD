/**
 * SUBSÍDIO GLOBAL DE FRETE DA NUSALI (percentagem sobre o saldo do cliente depois da política do vendedor) — motor, cotação, pedido, contabilização,
 * reembolso, API do Super Admin, histórico, conflito de permissões do vendedor e transição segura. Postgres 17 DESCARTAVEL. Nunca produção.
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
import os from 'os';
import path from 'path';
import http from 'http';
import { spawnSync } from 'child_process';
import express from 'express';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import { orders, orderItems, purchaseGroups, payments, paymentAttempts, escrowAccounts, refunds, storeShippingPolicies, platformSettings, auditLogs, coupons } from '../src/db/schema.js';
import { apiRouter } from '../src/server/api.js';
import { OrderService } from '../src/server/modules/orders/orderService.js';
import { PaymentService } from '../src/server/modules/payments/paymentService.js';
import { processRefund } from '../src/server/modules/payments/refundService.js';
import { getJwtAccessSecret } from '../src/server/modules/auth/jwtConfig.js';
import { resolveCartShippingPreview } from '../src/server/modules/shipping/shippingPreviewService.js';
import { resolveShippingPayerPolicy, ShippingCalculatorService, parseNusaliSubsidySetting, readNusaliSubsidySetting } from '../src/server/modules/shipping/shippingCalculatorService.js';
import { buildDeliveryConfirmedEntries } from '../src/server/modules/ledger/deliveryConfirmedEntries.js';
import { planSubsidyTransition, applySubsidyTransition, rollbackSubsidyTransition } from '../src/server/modules/shipping/shippingSubsidyTransition.js';
import { applyNusaliSubsidy, simulateShippingSplit, splitIsExact, validateNusaliPercent, toCents } from '../src/utils/shippingSubsidyMath.js';
import { describeServiceOptionPrice } from '../src/utils/shippingDisplay.js';
import { setupCheckoutKit } from './checkoutTestKit.js';

if (!['localhost', '127.0.0.1'].includes(new URL(testDbUrl).hostname)) throw new Error('Somente banco local descartavel.');
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 700)}`); };
const fmt = (n: number) => `${n} XOF`;

async function main() {
  // ================= 1. aritmética pura (a mesma do servidor e da simulação do painel)
  const costs = [0.01, 0.5, 1, 33.33, 100, 333.33, 999.99, 1000, 1234.56];
  const sellerPcts = [0, 25, 33.33, 50, 100];
  const nusaliPcts = [0, 0.01, 12.5, 20, 33.33, 50, 75, 99.99, 100];
  let exact = true, sellerStable = true, monotonic = true, bounded = true;
  for (const c of costs) for (const sp of sellerPcts) {
    let lastNusali = -1;
    const base = simulateShippingSplit(c, sp, 0);
    for (const np of nusaliPcts) {
      const s = simulateShippingSplit(c, sp, np);
      if (!splitIsExact(s)) exact = false;
      if (toCents(s.seller) !== toCents(base.seller)) sellerStable = false;
      if (toCents(s.nusali) < lastNusali) monotonic = false;
      lastNusali = toCents(s.nusali);
      if (s.nusali > base.buyer + 1e-9 || s.buyer < 0 || s.nusali < 0) bounded = false;
    }
  }
  report('M1 aritmética: cliente + vendedor + Nusali = custo real, ao centavo, para 405 combinações de custo × % vendedor × % Nusali (incl. decimais)', exact);
  report('M2 a parcela do VENDEDOR é idêntica com ou sem subsídio da Nusali (o vendedor nunca paga mais); a da Nusali só cresce com a %', sellerStable && monotonic);
  report('M3 a Nusali nunca assume mais do que o saldo do cliente, e ninguém fica com valor negativo', bounded);
  const ex = simulateShippingSplit(1000, 50, 50);
  report('M4 exemplo aprovado: frete 1000, vendedor 50%, Nusali 50% do saldo → vendedor 500, Nusali 250, cliente 250', ex.seller === 500 && ex.nusali === 250 && ex.buyer === 250, ex);
  report('M5 0% é ZERO (nunca 100%); 100% zera o saldo do cliente; 0% com saldo 0 não cria subsídio', applyNusaliSubsidy(1000, 0).nusaliShare === 0 && applyNusaliSubsidy(1000, 0).buyerPays === 1000 && applyNusaliSubsidy(1000, 100).buyerPays === 0 && applyNusaliSubsidy(0, 50).nusaliShare === 0);
  report('M6 percentagens inválidas são recusadas (negativa, >100, NaN, Infinity, texto, nulo, boolean, >2 casas) e a conta trata-as como 0%, nunca 100%', [-1, 100.01, NaN, Infinity, '20', null, undefined, true, 1.234].every((v) => !('value' in validateNusaliPercent(v))) && [-5, 150, NaN, 12.345].every((p) => applyNusaliSubsidy(1000, p as number).nusaliShare === 0) && 'value' in validateNusaliPercent(0) && 'value' in validateNusaliPercent(100) && 'value' in validateNusaliPercent(12.5));
  report('M7 setting guardado inválido/ausente/desligado vira "desligado, 0%" (nunca 100%)', [undefined, null, 'x', 5, {}, { enabled: true }, { enabled: 'sim', percent: 50 }, { enabled: true, percent: '50' }, { enabled: true, percent: 150 }, { enabled: true, percent: -1 }, { enabled: false, percent: 50 }].every((v) => { const p = parseNusaliSubsidySetting(v); return p.enabled === false; }) && parseNusaliSubsidySetting({ enabled: false, percent: 50 }).enabled === false && parseNusaliSubsidySetting({ enabled: true, percent: 20 }).percent === 20);

  // ================= banco descartável
  const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false }, max: 10 });
  const db = drizzle(pool, { schema });
  const kit = await setupCheckoutKit(db, 'ns');
  await kit.setFlag('multiSellerCheckoutEnabled', true);
  const bissau = await kit.sector('Bissau');
  const allSectors: any[] = (await db.select().from(schema.shippingSectors)).filter((x: any) => x.countryCode === 'GW' && x.id !== bissau.id).sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
  let nextSector = 0;
  const std = await kit.service('STANDARD');
  const SUBSIDY_KEY = 'shippingNusaliSubsidy', MODE_KEY = 'defaultShippingPolicyMode';
  const setSubsidy = async (v: any) => { if (v === null) await db.delete(platformSettings).where(eq(platformSettings.key, SUBSIDY_KEY)); else await kit.setFlag(SUBSIDY_KEY, v); };
  const setMode = async (m: string | null) => { if (m === null) await db.delete(platformSettings).where(eq(platformSettings.key, MODE_KEY)); else await kit.setFlag(MODE_KEY, m); };
  const on = (p: number) => ({ enabled: true, percent: p });

  /** loja com tarifa STANDARD de `cost` para Bissau (origem própria) */
  const shop = async (label: string, cost = 1000, price = 5000) => {
    const sector = allSectors[nextSector++];
    const seller = await kit.makeSeller(label);
    const store = await kit.makeStore(seller, label, sector.id);
    const product = await kit.makeProduct(seller, store.storeId, `P ${label}`, 0.3, price);
    await kit.insertInventory({ sellerId: seller.sellerId, productId: product.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: store.floc.id, quantityOnHand: 100 });
    await kit.insertRate((await kit.route(sector.id, bissau.id)).id, std.id, cost, { min: 0, max: 10 });
    return { seller, store, product };
  };
  const policyRow = async (s: { seller: any; store: any }, row: Record<string, any>) => {
    await db.delete(storeShippingPolicies).where(eq(storeShippingPolicies.storeId, s.store.storeId));
    await db.insert(storeShippingPolicies).values({ id: kit.uid('pol'), storeId: s.store.storeId, sellerId: s.seller.sellerId, isActive: true, ...row } as any);
  };
  const policy = (s: { seller: any; store: any }, cost = 1000) => resolveShippingPayerPolicy(cost, { storeId: s.store.storeId, sellerId: s.seller.sellerId }, db);
  const quote = async (productIds: string[], serviceCode = 'STANDARD') =>
    resolveCartShippingPreview({ destinationShippingSectorId: bissau.id, serviceCode, items: productIds.map((id) => ({ productId: id, variantId: null, quantity: 1 })) }, db) as Promise<any>;
  const place = async (productIds: string[], expected: number | null, extra: Record<string, any> = {}) => {
    const buyer = await kit.makeBuyer(bissau.id);
    for (const id of productIds) await kit.addToCart(buyer.cartId, id, 1, 5000);
    try { return { ok: true as const, buyer, value: await OrderService.createOrderFromCart({ userId: buyer.buyerId, addressId: buyer.addressId, paymentMethod: 'pix', shippingSelection: { serviceCode: 'STANDARD', expectedShippingChargedToBuyer: expected }, ...extra } as any, db) as any }; }
    catch (e: any) { return { ok: false as const, buyer, error: e }; }
  };
  const orderRow = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0];

  // ================= 2. motor com políticas reais do vendedor (custo 1000)
  await setMode(null); await setSubsidy(null);
  const sNone = await shop('semPolitica'), sSub = await shop('sub50'), sFree = await shop('gratisVendedor'), sCp = await shop('clientePaga');
  await policyRow(sSub, { mode: 'SELLER_SUBSIDIZED', sellerSubsidyPercent: '50' });
  await policyRow(sFree, { mode: 'SELLER_FREE_SHIPPING' });
  await policyRow(sCp, { mode: 'CUSTOMER_PAYS' });
  const expectBuyer = (resid: number, p: number) => 1000 * 0 + applyNusaliSubsidy(resid, p).buyerPays;
  let okNone = true, okSub = true, okFree = true, okCp = true, sellerSame = true, info: any[] = [];
  for (const p of [0, 20, 50, 75, 100]) {
    await setSubsidy(on(p));
    const a = await policy(sNone), b = await policy(sSub), c = await policy(sFree), d = await policy(sCp);
    const sum = (r: any) => toCents(r.shippingChargedToBuyer) + toCents(r.shippingSellerSubsidy) + toCents(r.shippingMarketplaceSubsidy) === 100000;
    okNone = okNone && sum(a) && a.shippingChargedToBuyer === expectBuyer(1000, p) && a.shippingMarketplaceSubsidy === 1000 - expectBuyer(1000, p) && a.shippingSellerSubsidy === 0;
    okSub = okSub && sum(b) && b.shippingSellerSubsidy === 500 && b.shippingChargedToBuyer === expectBuyer(500, p) && b.shippingMarketplaceSubsidy === 500 - expectBuyer(500, p);
    okFree = okFree && sum(c) && c.shippingSellerSubsidy === 1000 && c.shippingChargedToBuyer === 0 && c.shippingMarketplaceSubsidy === 0;
    okCp = okCp && sum(d) && d.shippingChargedToBuyer === expectBuyer(1000, p) && d.shippingSellerSubsidy === 0;
    sellerSame = sellerSame && b.shippingSellerSubsidy === 500 && c.shippingSellerSubsidy === 1000;
    info.push([p, a.shippingChargedToBuyer, b.shippingChargedToBuyer, b.shippingMarketplaceSubsidy]);
  }
  report('E1 loja SEM política (cliente paga): 0%→1000/0, 20%→800/200, 50%→500/500, 75%→250/750, 100%→0/1000 (cliente/Nusali), vendedor 0', okNone, info);
  report('E2 vendedor assume 50% + Nusali sobre o SALDO de 500: 0%→cliente 500; 20%→400 (Nusali 100); 50%→250 (Nusali 250, o exemplo aprovado); 75%→125; 100%→0; vendedor sempre 500', okSub, info);
  report('E3 vendedor assume 100%: saldo 0 ⇒ Nusali 0 e cliente 0 em QUALQUER percentagem; vendedor continua com 1000 (o vendedor não paga a mais nem a menos)', okFree);
  report('E4 CUSTOMER_PAYS explícito do vendedor: a Nusali subsidia o saldo (a política do vendedor não impede o subsídio da plataforma), vendedor 0', okCp);
  report('E5 a parcela do vendedor é IDÊNTICA em 0%, 20%, 50%, 75% e 100% (o subsídio da Nusali nunca aumenta o custo do vendedor)', sellerSame);
  const r3 = await (async () => { await setSubsidy(on(50)); return policy(sSub); })();
  report('E6 pagador e modo registados: política do vendedor + Nusali = "shared", percentagem aplicada = 50', r3.shippingPayer === 'shared' && r3.nusaliSubsidyPercent === 50 && r3.policyMode === 'SELLER_SUBSIDIZED', r3);

  // ================= 3. padrão 0%, desligado, inválido
  await setSubsidy(null);
  const d0 = await policy(sNone);
  report('D1 sem configuração: padrão 0% — cliente paga 1000, Nusali 0 (a Nusali NÃO assume automaticamente o frete)', d0.shippingChargedToBuyer === 1000 && d0.shippingMarketplaceSubsidy === 0 && d0.nusaliSubsidyPercent === 0);
  await setSubsidy({ enabled: false, percent: 75 });
  const d1 = await policy(sNone);
  await setSubsidy({ enabled: true, percent: 0 });
  const d2 = await policy(sNone);
  report('D2 desativado com 75% guardado = sem subsídio; ativo com 0% = sem subsídio (0% NUNCA vira 100%)', d1.shippingChargedToBuyer === 1000 && d1.shippingMarketplaceSubsidy === 0 && d2.shippingChargedToBuyer === 1000 && d2.shippingMarketplaceSubsidy === 0);
  let badOk = true;
  for (const bad of ['lixo', 5, { enabled: true, percent: 'abc' }, { enabled: true, percent: -20 }, { enabled: true, percent: 250 }, { enabled: 'true', percent: 50 }, { percent: 50 }]) {
    await setSubsidy(bad);
    const r = await policy(sNone);
    if (r.shippingChargedToBuyer !== 1000 || r.shippingMarketplaceSubsidy !== 0) badOk = false;
  }
  report('D3 valor corrompido no banco (texto, número solto, % negativa/>100/texto, enabled não booleano): o cliente paga o saldo inteiro — falha para o lado seguro, nunca 100% da Nusali', badOk);

  // ================= 4. modo legado em produção (MARKETPLACE_FREE_SHIPPING) e a transição
  await setSubsidy(on(50)); await setMode('MARKETPLACE_FREE_SHIPPING');
  const l1 = await policy(sNone);
  report('L1 com o modo legado ativo (configuração atual de produção) a Nusali assume 100% e a percentagem NÃO se soma (sem subsídio duplicado)', l1.shippingChargedToBuyer === 0 && l1.shippingMarketplaceSubsidy === 1000 && l1.nusaliSubsidyPercent === 0, l1);
  const l2 = await policy(sSub);
  report('L2 loja COM política própria (vendedor 50%) ignora o padrão legado: vendedor 500 + Nusali 50% do saldo; só lojas sem política seguem o legado', l2.shippingSellerSubsidy === 500 && l2.shippingMarketplaceSubsidy === 250 && l2.shippingChargedToBuyer === 250, l2);
  await setMode('CUSTOMER_PAYS');
  const l3 = await policy(sNone);
  report('L3 depois de desativar o modo legado (padrão CUSTOMER_PAYS) a percentagem passa a valer: cliente 500, Nusali 500', l3.shippingChargedToBuyer === 500 && l3.shippingMarketplaceSubsidy === 500, l3);

  // ================= 5. cotação (checkout) e pedido
  await setMode(null); await setSubsidy(on(50));
  const qNone = await quote([sNone.product.id]);
  const optNone = qNone.services.find((o: any) => o.code === 'STANDARD');
  report('Q1 a cotação do checkout/página do produto usa o MESMO motor: cliente 500, custo 1000, Nusali 500 ("coberto pela Nusali"), nota "Frete com subsídio da Nusali"', optNone.shippingChargedToBuyer === 500 && optNone.shippingCost === 1000 && optNone.shippingMarketplaceSubsidy === 500 && optNone.shippingCoveredBy === 'marketplace' && describeServiceOptionPrice(optNone, fmt).note === 'Frete com subsídio da Nusali' && describeServiceOptionPrice(optNone, fmt).kind === 'paid', optNone);
  const qSub = await quote([sSub.product.id]);
  const optSub = qSub.services.find((o: any) => o.code === 'STANDARD');
  report('Q2 cotação com vendedor 50% + Nusali 50% do saldo: cliente 250, vendedor 500, Nusali 250 ("coberto por ambos")', optSub.shippingChargedToBuyer === 250 && optSub.shippingMarketplaceSubsidy === 250 && optSub.shippingSellerSubsidy === 750 /* campo legado = vendedor + Nusali */ && optSub.shippingCoveredBy === 'shared', optSub);
  const placed = await place([sNone.product.id], 500);
  if (!placed.ok) report('O1 pedido criado', false, placed.error?.message); else {
    const o = await orderRow(placed.value.orders[0].id);
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id));
    report('O1 pedido: cliente paga 500, custo real 1000, subsídio Nusali 500, vendedor 0; total = subtotal + 500; itens somam o custo real 1000', Number(o.shippingFee) === 500 && Number(o.shippingCost) === 1000 && Number(o.shippingMarketplaceSubsidy) === 500 && Number(o.shippingSellerSubsidy) === 0 && Number(o.totalAmount) === Number(o.subtotal) + 500 && Math.round(items.reduce((s: number, i: any) => s + Number(i.shippingAmount), 0) * 100) === 100000, o);
    report('O2 snapshot da política no pedido: shippingPolicyModeAtCheckout = "CUSTOMER_PAYS+NUSALI_50PCT" e pagador "shared" (cliente e Nusali dividem)', o.shippingPolicyModeAtCheckout === 'CUSTOMER_PAYS+NUSALI_50PCT' && o.shippingPayer === 'shared', { m: o.shippingPolicyModeAtCheckout, p: o.shippingPayer });
    const before = JSON.stringify(await orderRow(o.id));
    await setSubsidy(on(20)); await setMode('CUSTOMER_PAYS');
    report('O3 mudar a percentagem DEPOIS não recalcula o pedido existente (linha idêntica, frete 500 e snapshot 50%)', JSON.stringify(await orderRow(o.id)) === before);
    const stale = await place([sNone.product.id], 500);
    report('O4 o cliente confirmou 500 e a configuração mudou para 20% (cliente passa a pagar 800): 409 SHIPPING_QUOTE_CHANGED com o valor atual — o servidor revalida na criação', !stale.ok && (stale as any).error?.code === 'SHIPPING_QUOTE_CHANGED' && (stale as any).error?.details?.currentShippingChargedToBuyer === 800, (stale as any).error?.details);
    const again = await place([sNone.product.id], 800);
    report('O5 reconfirmado o novo valor (800), o pedido é criado com Nusali 200 e snapshot 20%', again.ok && Number((await orderRow(again.value.orders[0].id)).shippingFee) === 800 && (await orderRow(again.value.orders[0].id)).shippingPolicyModeAtCheckout === 'CUSTOMER_PAYS+NUSALI_20PCT', again.ok ? 'ok' : (again as any).error?.message);
  }

  // ================= 6. contabilização, Escrow e reembolso (percentagem 50%)
  await setSubsidy(on(50));
  const acc = await place([sNone.product.id], 500);
  if (!acc.ok) report('F1 pedido para contabilização', false, acc.error?.message); else {
    const orderId = acc.value.orders[0].id, groupId = acc.value.purchaseGroup.id;
    const [pg0] = await db.select().from(purchaseGroups).where(eq(purchaseGroups.id, groupId));
    const payId = kit.uid('pay_group'), ext = kit.uid('EXT');
    await db.insert(payments).values({ id: payId, orderId: null, purchaseGroupId: groupId, settlementRole: 'candidate', buyerId: acc.buyer.buyerId, amount: String(pg0.totalAmount), currency: 'XOF', provider: 'asaas', method: 'pix', status: 'pending', idempotencyKey: `asaas_pix_group:${groupId}:${payId}`, transactionRef: ext, createdAt: new Date(), updatedAt: new Date() } as any);
    await db.insert(paymentAttempts).values({ id: kit.uid('att'), paymentId: payId, provider: 'asaas', status: 'reserved', createdAt: new Date() } as any);
    await PaymentService.confirmPurchaseGroupPayment(groupId, payId, { provider: 'asaas', transactionRef: ext, receivedValue: Number(pg0.totalAmount) });
    const o = await orderRow(orderId);
    const [esc] = await db.select().from(escrowAccounts).where(eq(escrowAccounts.orderId, orderId));
    report('F1 Escrow retém exatamente o que o cliente pagou (produtos + 500 de frete), SEM incluir a parcela da Nusali; líquido do vendedor não desconta frete', !!esc && Number(esc.amount) === Number(o.totalAmount) && Number(o.totalAmount) === Number(o.subtotal) + 500 && Number(o.sellerNetAmount) === Number(o.subtotal) - Number(o.marketplaceCommission), { esc: esc?.amount, total: o.totalAmount });
    const built = buildDeliveryConfirmedEntries({ id: o.id, buyerId: o.buyerId, sellerId: o.sellerId, storeId: o.storeId, countryCode: o.countryCode, currency: o.currency, totalAmount: o.totalAmount, marketplaceCommission: o.marketplaceCommission, sellerNetAmount: o.sellerNetAmount, discountAmount: o.discountAmount, shippingChargedToBuyer: o.shippingChargedToBuyer, shippingSellerSubsidy: o.shippingSellerSubsidy, shippingMarketplaceSubsidy: o.shippingMarketplaceSubsidy, customsDuty: o.customsDuty });
    const entries = built.status === 'OK' ? built.entries : [];
    const nusaliDebit = entries.filter((e) => e.accountCode === 'SHIPPING_SUBSIDY_NUSALI' && e.direction === 'DEBIT').reduce((s, e) => s + toCents(Number(e.amount)), 0);
    const sum = (dir: string) => entries.filter((e) => e.direction === dir).reduce((s, e) => s + toCents(Number(e.amount)), 0);
    report('F2 lançamentos contabilísticos da entrega: gerados (não ignorados), débito SHIPPING_SUBSIDY_NUSALI = 500 e débitos = créditos (a decomposição fecha com o total pago)', built.status === 'OK' && nusaliDebit === 50000 && sum('DEBIT') === sum('CREDIT'), { status: built.status, nusaliDebit });
    const rf: any = await processRefund({ orderId, amount: Number(o.totalAmount), reason: 'teste subsídio', idempotencyKey: `sub_${orderId}` }, db).then((v) => ({ ok: true, v }), (e) => ({ ok: false, e }));
    const [escA] = await db.select().from(escrowAccounts).where(eq(escrowAccounts.orderId, orderId));
    const rfRows = await db.select().from(refunds).where(eq(refunds.orderId, orderId));
    report('F3 reembolso integral devolve ao cliente exatamente o que ele pagou (total do pedido, sem a parcela da Nusali), reverte o Escrow e não altera o snapshot do frete do pedido', rf.ok && rfRows.length === 1 && Number(rfRows[0].amount) === Number(o.totalAmount) && escA.status === 'refunded' && Number((await orderRow(orderId)).shippingMarketplaceSubsidy) === 500, rf.ok ? { rows: rfRows.map((r: any) => r.amount), esc: escA.status } : String(rf.e?.message));
  }

  // ================= 7. cupons (só desconto de produtos) e várias lojas
  const sCoupon = await shop('cupom', 1000, 5000);
  await setSubsidy(on(50));
  await db.insert(coupons).values({ id: kit.uid('coup'), code: 'PCT10', title: 'Teste', sellerId: sCoupon.seller.sellerId, storeId: sCoupon.store.storeId, discountType: 'PERCENTAGE', discountValue: '10', currency: 'XOF', minimumSpend: '0.00', maxDiscount: null, usageLimit: null, usageLimitPerUser: null, usageCount: 0, isActive: true, createdAt: new Date(), updatedAt: new Date() } as any);
  const withCp = await place([sCoupon.product.id], 500, { storeCoupons: [{ storeId: sCoupon.store.storeId, code: 'PCT10' }] });
  const noCp = await place([sCoupon.product.id], 500);
  if (!withCp.ok || !noCp.ok) report('C1 pedidos com e sem cupom', false, [(withCp as any).error?.message, (noCp as any).error?.message]); else {
    const a = await orderRow(withCp.value.orders[0].id), b = await orderRow(noCp.value.orders[0].id);
    report('C1 cupom do vendedor (10% nos produtos) NÃO altera o frete nem o subsídio: frete 500 / Nusali 500 iguais com e sem cupom; o desconto só reduz os produtos', Number(a.shippingFee) === Number(b.shippingFee) && Number(a.shippingMarketplaceSubsidy) === Number(b.shippingMarketplaceSubsidy) && Number(a.discountAmount) === 500 && Number(b.discountAmount) === 0 && Number(a.totalAmount) === Number(a.subtotal) - 500 + 500, { a: [a.shippingFee, a.discountAmount, a.totalAmount], b: [b.shippingFee, b.totalAmount] });
    report('C2 o subsídio da Nusali nunca entra no desconto nem na base da comissão (comissão igual calculada só sobre produtos − cupom); o líquido do vendedor não muda com a percentagem', Number(a.commissionBase) === Number(a.subtotal) - 500 && Number(a.sellerNetAmount) === Number(a.subtotal) - 500 - Number(a.marketplaceCommission), a);
  }
  // várias lojas no mesmo carrinho
  const m1 = await shop('multi1', 1000), m2 = await shop('multi2', 1000), m3 = await shop('multi3', 1000);
  await policyRow(m1, { mode: 'SELLER_FREE_SHIPPING' });
  await policyRow(m2, { mode: 'SELLER_SUBSIDIZED', sellerSubsidyPercent: '50' });
  await setSubsidy(on(20));
  const mq = await quote([m1.product.id, m2.product.id, m3.product.id]);
  const mopt = mq.services.find((o: any) => o.code === 'STANDARD');
  // m1: vendedor 1000 → cliente 0; m2: vendedor 500, saldo 500, Nusali 100, cliente 400; m3: sem política, Nusali 200, cliente 800
  report('X1 três lojas no carrinho (vendedor 100% / vendedor 50% / sem política) com Nusali 20%: cliente 0 + 400 + 800 = 1200; Nusali 0 + 100 + 200 = 300; vendedores 1000 + 500 + 0', mopt.available && mopt.shippingChargedToBuyer === 1200 && mopt.shippingMarketplaceSubsidy === 300 && mopt.shippingCost === 3000, mopt);
  const mp = await place([m1.product.id, m2.product.id, m3.product.id], 1200);
  if (!mp.ok) report('X2 pedido com 3 lojas', false, mp.error?.message); else {
    const rows = await Promise.all(mp.value.orders.map((o: any) => orderRow(o.id)));
    const grp = (await db.select().from(purchaseGroups).where(eq(purchaseGroups.id, mp.value.purchaseGroup.id)))[0];
    report('X2 pedido com 3 lojas: cada pedido guarda a sua repartição, soma do cliente = 1200, soma da Nusali = 300, e o total do grupo = soma dos totais', rows.length === 3 && rows.reduce((s: number, r: any) => s + Number(r.shippingFee), 0) === 1200 && rows.reduce((s: number, r: any) => s + Number(r.shippingMarketplaceSubsidy), 0) === 300 && rows.reduce((s: number, r: any) => s + Number(r.shippingSellerSubsidy), 0) === 1500 && Math.abs(Number(grp.totalAmount) - rows.reduce((s: number, r: any) => s + Number(r.totalAmount), 0)) < 0.005, rows.map((r: any) => [r.shippingFee, r.shippingSellerSubsidy, r.shippingMarketplaceSubsidy]));
  }
  // arredondamento com decimais
  const dec = await shop('decimais', 333.33);
  await setSubsidy(on(33.33));
  const pd = await policy(dec, 333.33);
  const want = applyNusaliSubsidy(333.33, 33.33);
  report('R1 arredondamento: custo 333,33 com 33,33% — cliente + Nusali = 333,33 exatos em centavos e igual à conta da simulação', toCents(pd.shippingChargedToBuyer) + toCents(pd.shippingMarketplaceSubsidy) === 33333 && pd.shippingChargedToBuyer === want.buyerPays && pd.shippingMarketplaceSubsidy === want.nusaliShare, pd);

  // ================= 8. API do Super Admin
  const app = express(); app.use(express.json()); app.use('/api/v1', apiRouter);
  const server = http.createServer(app); await new Promise<void>((res) => server.listen(0, res));
  const base = `http://localhost:${(server.address() as any).port}/api/v1`;
  const tokenFor = (userId: string, role: string) => jwt.sign({ userId, email: `${userId}@t.test`, role, fullName: `T ${role}`, countryCode: 'GW', kycStatus: 'verified', isEmailVerified: true }, getJwtAccessSecret(), { expiresIn: '10m' });
  const gaId = await kit.makeUser('GLOBAL_ADMIN');
  const ga = tokenFor(gaId, 'GLOBAL_ADMIN');
  const call = async (method: string, p: string, tok: string | null, body?: any) => {
    const r = await fetch(`${base}${p}`, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, json: await r.json().catch(() => null) as any };
  };
  await setSubsidy(null); await setMode('MARKETPLACE_FREE_SHIPPING');
  const g0 = await call('GET', '/admin/shipping-subsidy', ga);
  report('A1 GET /admin/shipping-subsidy mostra a configuração atual: desligado 0%, modo legado MARKETPLACE_FREE_SHIPPING e o efeito real ("modo legado ativo: a Nusali assume 100%")', g0.status === 200 && g0.json.data.enabled === false && g0.json.data.percent === 0 && g0.json.data.legacyDefaultMode === 'MARKETPLACE_FREE_SHIPPING' && g0.json.data.effective.kind === 'LEGACY_FREE', g0.json);
  const sellerTok = tokenFor(await kit.makeUser('SELLER'), 'SELLER'), buyerTok = tokenFor(await kit.makeUser('BUYER'), 'BUYER'), adminTok = tokenFor(await kit.makeUser('ADMIN'), 'ADMIN');
  const perm = await Promise.all([null, buyerTok, sellerTok, adminTok].map((t) => call('GET', '/admin/shipping-subsidy', t)));
  const permPut = await Promise.all([null, buyerTok, sellerTok, adminTok].map((t) => call('PUT', '/admin/shipping-subsidy', t, { enabled: true, percent: 50, confirmImpact: true })));
  const permHist = await Promise.all([null, buyerTok, sellerTok, adminTok].map((t) => call('GET', '/admin/shipping-subsidy/history', t)));
  report('A2 permissões: só o Super Admin (GLOBAL_ADMIN) lê, altera e vê o histórico — sem login 401; comprador, vendedor e até ADMIN comum 403; nada é gravado', [perm, permPut, permHist].every((arr) => arr[0].status === 401 && arr.slice(1).every((r) => r.status === 403)) && !(await db.select().from(platformSettings).where(eq(platformSettings.key, SUBSIDY_KEY))).length, [perm.map((r) => r.status), permPut.map((r) => r.status), permHist.map((r) => r.status)]);
  const bad: Array<[string, any]> = [
    ['sem confirmar o impacto', { enabled: true, percent: 20 }],
    ['confirmImpact falso', { enabled: true, percent: 20, confirmImpact: false }],
    ['percentagem negativa', { enabled: true, percent: -1, confirmImpact: true }],
    ['percentagem > 100', { enabled: true, percent: 100.5, confirmImpact: true }],
    ['percentagem em texto', { enabled: true, percent: '20', confirmImpact: true }],
    ['percentagem NaN/null', { enabled: true, percent: null, confirmImpact: true }],
    ['mais de 2 casas decimais', { enabled: true, percent: 12.345, confirmImpact: true }],
    ['enabled não booleano', { enabled: 'sim', percent: 20, confirmImpact: true }],
    ['disableLegacyFreeMode não booleano', { enabled: true, percent: 20, confirmImpact: true, disableLegacyFreeMode: 'x' }],
    ['expected inválido', { enabled: true, percent: 20, confirmImpact: true, expected: { enabled: 'x', percent: 3 } }],
  ];
  let badAll = true; const badInfo: any[] = [];
  for (const [name, body] of bad) { const r = await call('PUT', '/admin/shipping-subsidy', ga, body); if (r.status !== 400) { badAll = false; badInfo.push([name, r.status]); } }
  const cfgAfterBad = await readNusaliSubsidySetting(db);
  report('A3 validação no servidor: 10 pedidos inválidos devolvem 400 e NADA é gravado', badAll && cfgAfterBad.enabled === false && cfgAfterBad.percent === 0 && !(await db.select().from(platformSettings).where(eq(platformSettings.key, SUBSIDY_KEY))).length, badInfo);
  const put1 = await call('PUT', '/admin/shipping-subsidy', ga, { enabled: true, percent: 20, confirmImpact: true, disableLegacyFreeMode: true, expected: { enabled: false, percent: 0 } });
  const cfg1 = await readNusaliSubsidySetting(db);
  report('A4 guardar com confirmação: ativo 20% e modo legado desativado (CUSTOMER_PAYS); resposta traz o valor anterior e o efeito novo', put1.status === 200 && cfg1.enabled && cfg1.percent === 20 && put1.json.data.legacyModeChanged === true && put1.json.data.previous.legacyDefaultMode === 'MARKETPLACE_FREE_SHIPPING' && put1.json.data.legacyDefaultMode === 'CUSTOMER_PAYS' && put1.json.data.effective.kind === 'PERCENT', put1.json);
  const stalePut = await call('PUT', '/admin/shipping-subsidy', ga, { enabled: true, percent: 50, confirmImpact: true, expected: { enabled: false, percent: 0 } });
  report('A5 dois administradores: quem edita com valores desatualizados recebe 409 CONFIG_CHANGED e nada é sobrescrito (continua 20%)', stalePut.status === 409 && stalePut.json.error.code === 'CONFIG_CHANGED' && (await readNusaliSubsidySetting(db)).percent === 20, stalePut.json);
  const decPut = await call('PUT', '/admin/shipping-subsidy', ga, { enabled: true, percent: 12.5, confirmImpact: true, expected: { enabled: true, percent: 20 } });
  const offPut = await call('PUT', '/admin/shipping-subsidy', ga, { enabled: false, percent: 12.5, confirmImpact: true });
  report('A6 decimais aceites (12,5%) e desativar mantém o valor mas sem efeito; cliente volta a pagar tudo com o subsídio desligado', decPut.status === 200 && offPut.status === 200 && (await readNusaliSubsidySetting(db)).enabled === false && (await policy(sNone)).shippingChargedToBuyer === 1000, [decPut.status, offPut.status]);
  const legacyAgain = await call('PUT', '/admin/shipping-subsidy', ga, { enabled: true, percent: 10, confirmImpact: true, disableLegacyFreeMode: true });
  report('A7 pedir para desativar o modo legado quando ele já não está ativo: 409 LEGACY_MODE_NOT_ACTIVE (sem efeito colateral)', legacyAgain.status === 409 && legacyAgain.json.error.code === 'LEGACY_MODE_NOT_ACTIVE' && (await readNusaliSubsidySetting(db)).enabled === false);
  const hist = await call('GET', '/admin/shipping-subsidy/history', ga);
  const h = hist.json?.data || [];
  report('A8 histórico: 3 alterações (mais recente primeiro) com utilizador, data, valor anterior e novo; a primeira mostra o modo legado desativado', hist.status === 200 && h.length === 3 && h[0].before.enabled === true && h[0].after.enabled === false && h[1].before.percent === 20 && h[1].after.percent === 12.5 && h[2].before.percent === 0 && h[2].after.percent === 20 && h[2].before.legacyDefaultMode === 'MARKETPLACE_FREE_SHIPPING' && h[2].after.legacyDefaultMode === 'CUSTOMER_PAYS' && h[2].legacyModeChanged === true && h.every((x: any) => x.user.id === gaId && !!x.user.name && !!x.createdAt), h.map((x: any) => [x.before?.percent, x.after?.percent, x.user.name]));
  const audits = (await db.select().from(auditLogs)).filter((a: any) => a.action === 'admin.shipping_subsidy.updated');
  report('A9 a auditoria é gravada na MESMA transação da alteração: uma linha por alteração aceite, nenhuma para pedidos recusados', audits.length === 3, audits.length);
  const generic1 = await call('POST', '/admin/settings', ga, { defaultShippingPolicyMode: 'SELLER_FREE_SHIPPING' });
  const generic2 = await call('POST', '/admin/settings', ga, { defaultShippingPolicyMode: 'NUSALI_50' });
  const generic3 = await call('POST', '/admin/settings', ga, { shippingNusaliSubsidy: { enabled: true, percent: 100 } });
  const generic4 = await call('POST', '/admin/settings', ga, { defaultShippingPolicyMode: 'CUSTOMER_PAYS', platformName: 'Mercado Nusali' });
  report('A10 POST /admin/settings (genérico) agora valida o frete: padrão SELLER_FREE_SHIPPING (imporia custo ao vendedor) e texto inválido → 400; a percentagem só pelo endpoint dedicado → 400; valores válidos continuam a funcionar', generic1.status === 400 && generic2.status === 400 && generic3.status === 400 && generic4.status === 200 && (await readNusaliSubsidySetting(db)).percent === 12.5, [generic1.status, generic2.status, generic3.status, generic4.status]);

  // ================= 9. vendedores preservados + conflito de permissões
  const pRowsBefore = JSON.stringify((await db.select().from(storeShippingPolicies)).sort((a: any, b: any) => a.id.localeCompare(b.id)));
  await call('PUT', '/admin/shipping-subsidy', ga, { enabled: true, percent: 40, confirmImpact: true });
  report('V1 alterar o subsídio da Nusali NÃO muda nenhuma política de vendedor (todas as linhas de store_shipping_policies idênticas)', JSON.stringify((await db.select().from(storeShippingPolicies)).sort((a: any, b: any) => a.id.localeCompare(b.id))) === pRowsBefore);
  const target = await shop('adminGeridas');
  const sellerJwt = tokenFor(target.seller.userId, 'SELLER');
  const sellerPost = (body: any) => call('POST', '/seller/shipping-policy', sellerJwt, { storeId: target.store.storeId, ...body });
  const capRejected = await call('POST', `/admin/stores/${target.store.storeId}/shipping-policy`, ga, { mode: 'MARKETPLACE_FREE_SHIPPING', marketplaceSubsidyPercent: 30 });
  report('V2 a configuração administrativa não pode empurrar custo ao vendedor: modo legado por loja COM teto é recusado (400 MARKETPLACE_CAP_SHIFTS_COST_TO_SELLER)', capRejected.status === 400 && capRejected.json.error.code === 'MARKETPLACE_CAP_SHIFTS_COST_TO_SELLER' && !(await db.select().from(storeShippingPolicies).where(eq(storeShippingPolicies.storeId, target.store.storeId))).length, capRejected.json);
  const seller400 = await sellerPost({ mode: 'MARKETPLACE_FREE_SHIPPING' });
  report('V3 o vendedor continua sem poder ESCOLHER o frete grátis da Nusali (400 INVALID_SELLER_SHIPPING_MODE)', seller400.status === 400 && seller400.json.error.code === 'INVALID_SELLER_SHIPPING_MODE');
  const adminSet = await call('POST', `/admin/stores/${target.store.storeId}/shipping-policy`, ga, { mode: 'MARKETPLACE_FREE_SHIPPING' });
  const rowBefore = JSON.stringify((await db.select().from(storeShippingPolicies).where(eq(storeShippingPolicies.storeId, target.store.storeId)))[0]);
  const sellerNoop = await sellerPost({ mode: 'MARKETPLACE_FREE_SHIPPING' });
  report('V4 CONFLITO CORRIGIDO: loja com política definida pelo administrador — o vendedor reenviar o mesmo modo (o que o ecrã dele faz em cada "Salvar") já não dá 400: é um no-op e a linha não muda', adminSet.status === 200 && sellerNoop.status === 200 && JSON.stringify((await db.select().from(storeShippingPolicies).where(eq(storeShippingPolicies.storeId, target.store.storeId)))[0]) === rowBefore, [adminSet.status, sellerNoop.status]);
  const sellerChange = await sellerPost({ mode: 'SELLER_SUBSIDIZED', subsidyType: 'PERCENT', sellerSubsidyPercent: 30 });
  const sellerRow = (await db.select().from(storeShippingPolicies).where(eq(storeShippingPolicies.storeId, target.store.storeId)))[0];
  report('V5 o vendedor mantém o controlo da PRÓPRIA política: pode mudar para o modo dele (SELLER_SUBSIDIZED 30%) mesmo numa loja que o administrador tinha posto no modo legado', sellerChange.status === 200 && sellerRow.mode === 'SELLER_SUBSIDIZED' && Number(sellerRow.sellerSubsidyPercent) === 30, sellerRow);
  const pAfter = await policy(target);
  report('V6 depois disso o motor aplica vendedor 30% + Nusali 40% do saldo (700 × 40% = 280) e o vendedor continua com exatamente 300', pAfter.shippingSellerSubsidy === 300 && pAfter.shippingMarketplaceSubsidy === 280 && pAfter.shippingChargedToBuyer === 420, pAfter);
  server.close();

  // ================= 10. transição segura (módulo e script) — NUNCA toca em pedidos
  await setSubsidy(null); await setMode('MARKETPLACE_FREE_SHIPPING');
  const ordersBefore = JSON.stringify((await db.select().from(orders)).sort((a: any, b: any) => a.id.localeCompare(b.id)));
  const plan = await planSubsidyTransition(db);
  report('T1 plano (só leitura): mostra o modo legado → CUSTOMER_PAYS, 0%, avisa o efeito e quantos pedidos existem (não recalculados); nada é escrito', plan.changes.length >= 1 && plan.current.legacyDefaultMode === 'MARKETPLACE_FREE_SHIPPING' && plan.existingOrders > 0 && (await readNusaliSubsidySetting(db)).enabled === false && (await db.select().from(platformSettings).where(eq(platformSettings.key, MODE_KEY)))[0].valueJson === 'MARKETPLACE_FREE_SHIPPING', plan);
  const cliEnv = { ...process.env, DATABASE_URL: testDbUrl, REDIS_URL: '' };
  const runCli = (args: string[], extra: Record<string, string> = {}) => spawnSync('npx', ['tsx', 'scripts/transition-shipping-subsidy.ts', ...args], { env: { ...cliEnv, ...extra }, encoding: 'utf8', shell: true, timeout: 120000 });
  const modeNow = async () => (await db.select().from(platformSettings).where(eq(platformSettings.key, MODE_KEY)))[0]?.valueJson;
  const cli1 = runCli([]);
  report('T2 script sem --apply é só plano: imprime o estado atual e "nada foi escrito"; o modo legado continua', /MODO PLANO: nada foi escrito/.test(cli1.stdout) && (await modeNow()) === 'MARKETPLACE_FREE_SHIPPING', cli1.stdout + cli1.stderr);
  const cli2 = runCli(['--apply', '--expect-legacy-mode', 'MARKETPLACE_FREE_SHIPPING']);
  report('T3 --apply sem a variável de confirmação é recusado e nada muda', cli2.status !== 0 && /recusado/.test(cli2.stderr) && (await modeNow()) === 'MARKETPLACE_FREE_SHIPPING');
  const cli3 = runCli(['--apply', '--expect-legacy-mode', 'CUSTOMER_PAYS'], { SHIPPING_SUBSIDY_TRANSITION_CONFIRM: 'YES' });
  const cli3b = runCli(['--apply'], { SHIPPING_SUBSIDY_TRANSITION_CONFIRM: 'YES' });
  report('T4 o valor ANTERIOR tem de ser o esperado: modo esperado errado ou ausente → recusado, nada muda', cli3.status !== 0 && cli3b.status !== 0 && /recusado/.test(cli3.stderr + cli3b.stderr) && (await modeNow()) === 'MARKETPLACE_FREE_SHIPPING');
  const rbFile = path.join(os.tmpdir(), `subsidy-rollback-${Date.now()}.json`);
  const cli4 = runCli(['--apply', '--expect-legacy-mode', 'MARKETPLACE_FREE_SHIPPING', '--rollback-file', rbFile], { SHIPPING_SUBSIDY_TRANSITION_CONFIRM: 'YES' });
  const snap = fs.existsSync(rbFile) ? JSON.parse(fs.readFileSync(rbFile, 'utf8')) : null;
  report('T5 aplicar (autorizado): grava PRIMEIRO o ficheiro de reversão com o valor anterior, depois muda para CUSTOMER_PAYS + 0% desligado; pedidos antes = depois', cli4.status === 0 && snap?.legacyDefaultMode === 'MARKETPLACE_FREE_SHIPPING' && (await modeNow()) === 'CUSTOMER_PAYS' && (await readNusaliSubsidySetting(db)).percent === 0 && /pedidos antes\/depois[^\n]*: (\d+) \/ \1/.test(cli4.stdout), cli4.stdout + cli4.stderr);
  const ordersMid = JSON.stringify((await db.select().from(orders)).sort((a: any, b: any) => a.id.localeCompare(b.id)));
  report('T6 os pedidos existentes ficam BYTE A BYTE iguais depois da transição (o frete foi congelado na criação; nenhum recálculo)', ordersMid === ordersBefore);
  const qAfter = await policy(sNone);
  report('T7 depois da transição o cliente paga o frete de lojas sem política (Nusali 0%): 1000', qAfter.shippingChargedToBuyer === 1000 && qAfter.shippingMarketplaceSubsidy === 0, qAfter);
  const cli5 = runCli(['--rollback', rbFile], { SHIPPING_SUBSIDY_TRANSITION_CONFIRM: 'YES' });
  report('T8 reversão exata: o modo padrão volta a MARKETPLACE_FREE_SHIPPING e a configuração à anterior; pedidos continuam idênticos', cli5.status === 0 && (await modeNow()) === 'MARKETPLACE_FREE_SHIPPING' && (await readNusaliSubsidySetting(db)).enabled === false && JSON.stringify((await db.select().from(orders)).sort((a: any, b: any) => a.id.localeCompare(b.id))) === ordersBefore, cli5.stdout + cli5.stderr);
  const cli6 = runCli(['--rollback', rbFile], { SHIPPING_SUBSIDY_TRANSITION_CONFIRM: 'YES' });
  report('T9 a reversão é repetível (idempotente) e sem a confirmação é recusada', cli6.status === 0 && runCli(['--rollback', rbFile]).status !== 0);
  const ap2 = await applySubsidyTransition(db);
  const rb2 = await rollbackSubsidyTransition(db, ap2.snapshot);
  report('T10 módulo: aplicar devolve o instantâneo anterior e reverter o repõe; auditoria registada (3 linhas de script: aplicar/reverter via CLI + módulo)', ap2.snapshot.legacyDefaultMode === 'MARKETPLACE_FREE_SHIPPING' && rb2.after.legacyDefaultMode === 'MARKETPLACE_FREE_SHIPPING' && ap2.ordersBefore === ap2.ordersAfter && (await db.select().from(auditLogs)).filter((a: any) => a.action === 'admin.shipping_subsidy.updated' && a.actorUserId === null).length >= 4);

  // ================= 11. campanhas futuras: sem incompatibilidade
  const engine = fs.readFileSync('src/server/modules/shipping/shippingCalculatorService.ts', 'utf8');
  const campaignsBefore = (await db.select().from(schema.shippingSubsidyCampaigns)).length;
  report('K1 compatível com campanhas futuras: o motor não toca em shipping_subsidy_campaigns, a camada da Nusali incide só sobre o saldo do cliente (mesmo modelo BUYER_ONLY da campanha), o pedido guarda modo+% em shippingPolicyModeAtCheckout e as colunas de campanha continuam livres', !/from\(shippingSubsidyCampaigns|import[^;]*[Cc]ampaign/.test(engine) && /applyNusaliSubsidy\(shippingChargedToBuyer/.test(engine) && campaignsBefore === 0 && (await db.select().from(orders).where(sql`shipping_campaign_id is not null`)).length === 0);

  console.log(`\n${passed}/${total} passaram`);
  await pool.end();
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
