/**
 * E9 — VALIDAÇÃO FINAL INTEGRADA (staging LOCAL isolado). Um único banco com o ESQUEMA de produção (restaurado do backup, só esquema, + 0043 e 0044) e dados FICTÍCIOS; serviços reais, apiRouter
 * real, nenhum provedor de pagamento (confirmações por serviço). Encadeia: pedido individual e grupo multi-vendedor, cupom financiado pelo vendedor, liberação de Escrow, reembolso antes/depois
 * da liberação, reversão de frete, chargeback + decisão + teto N, retenção/liberação, saques (solicitação, aprovação, falha, devolução), outbox/worker/falha/recuperação/reconciliação,
 * integridade das partidas, consistência ledger × carteiras e permissões. Nunca produção.
 */
import { ledgerTestDbUrl } from './support/ledgerE2Env.js';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import express from 'express';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import { purchaseGroups, payments, paymentAttempts } from '../src/db/schema.js';
import { apiRouter } from '../src/server/api.js';
import { OrderService } from '../src/server/modules/orders/orderService.js';
import { PaymentService } from '../src/server/modules/payments/paymentService.js';
import { processRefund } from '../src/server/modules/payments/refundService.js';
import { observeChargeback } from '../src/server/modules/payments/chargebackService.js';
import { FinancialLedgerService } from '../src/server/modules/ledger/financialLedgerService.js';
import { runLedgerOutboxOnce } from '../src/server/modules/ledger/outbox/outboxService.js';
import { runLedgerReconciliation } from '../src/server/modules/ledger/outbox/reconciliationService.js';
import { getJwtAccessSecret } from '../src/server/modules/auth/jwtConfig.js';
import { resolveCartShippingPreview } from '../src/server/modules/shipping/shippingPreviewService.js';
import { setupCheckoutKit } from './support/checkoutTestKit.js';
import { requestSellerPayout } from '../src/server/modules/wallet/payoutService.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)).slice(0, 900)}`); };
const pgErr = (code: string) => Object.assign(new Error('simulated'), { cause: { code } });
const BASE = '/api/v1/admin/ledger';

async function main() {
  const pool = new pg.Pool({ connectionString: ledgerTestDbUrl, ssl: { rejectUnauthorized: false }, max: 20 });
  const db = drizzle(pool, { schema });
  const q = async (sqlText: string, p: any[] = []) => (await pool.query(sqlText, p)).rows;
  const apply = async (file: string) => { for (const stmt of fs.readFileSync(path.join(root, 'drizzle', file), 'utf8').split('--> statement-breakpoint')) if (stmt.trim()) await pool.query(stmt); };
  if (!(await q(`select to_regclass('public.ledger_outbox_events') t`))[0].t) await apply('0039_ledger_outbox.sql');
  if (!(await q(`select 1 from pg_constraint where conname='ledger_transactions_type_check' and pg_get_constraintdef(oid) like '%REFUND_PROCESSED%'`)).length) await apply('0040_ledger_refunds.sql');
  if (!(await q(`select to_regclass('public.shipping_cost_reversals') t`))[0].t) await apply('0041_ledger_shipping_reversal.sql');
  if (!(await q(`select to_regclass('public.chargeback_allocations') t`))[0].t) await apply('0042_ledger_chargebacks.sql');
  if (!(await q(`select to_regclass('public.wallet_holds') t`))[0].t) await apply('0043_ledger_wallet_holds.sql');
  if (!(await q(`select 1 from pg_constraint where conname='ledger_outbox_events_subject_check'`)).length) await apply('0044_ledger_payout_events.sql');

  const kit = await setupCheckoutKit(db, 'e6');
  await kit.setFlag('multiSellerCheckoutEnabled', true); await kit.setFlag('defaultShippingPolicyMode', 'CUSTOMER_PAYS');
  await kit.setFlag('shippingNusaliSubsidy', { enabled: false, percent: 0, rules: { 'GW:STANDARD': { enabled: true, percent: 50 } } });
  const bissau = await kit.sector('Bissau'); const std = await kit.service('STANDARD');
  const sectors: any[] = (await db.select().from(schema.shippingSectors)).filter((x: any) => x.countryCode === 'GW' && x.id !== bissau.id).sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
  let ns = 0;
  const shop = async (label: string) => {
    const sector = sectors[ns++ % sectors.length]; const seller = await kit.makeSeller(label); const store = await kit.makeStore(seller, label, sector.id);
    const product = await kit.makeProduct(seller, store.storeId, `P ${label}`, 0.3, 5000);
    await kit.insertInventory({ sellerId: seller.sellerId, productId: product.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: store.floc.id, quantityOnHand: 5000 });
    await kit.insertRate((await kit.route(sector.id, bissau.id)).id, std.id, 1000, { min: 0, max: 10 });
    return { seller, store, product, price: 5000 };
  };
  const place = async (shopX: any) => {
    const buyer = await kit.makeBuyer(bissau.id); await kit.addToCart(buyer.cartId, shopX.product.id, 1, shopX.price);
    const qq: any = await resolveCartShippingPreview({ destinationShippingSectorId: bissau.id, serviceCode: 'STANDARD', items: [{ productId: shopX.product.id, variantId: null, quantity: 1 }] }, db);
    const opt = qq.services?.find((o: any) => o.code === 'STANDARD') ?? qq;
    const v: any = await OrderService.createOrderFromCart({ userId: buyer.buyerId, addressId: buyer.addressId, paymentMethod: 'pix', shippingSelection: { serviceCode: 'STANDARD', expectedShippingChargedToBuyer: opt.shippingChargedToBuyer } } as any, db);
    return { buyer, orderId: v.orders[0].id as string, groupId: v.purchaseGroup.id as string };
  };
  const pay = async (pl: any) => {
    const [g] = await db.select().from(purchaseGroups).where(eq(purchaseGroups.id, pl.groupId));
    const payId = kit.uid('pay_group'), ext = kit.uid('EXT');
    await db.insert(payments).values({ id: payId, orderId: null, purchaseGroupId: pl.groupId, settlementRole: 'candidate', buyerId: pl.buyer.buyerId, amount: String(g.totalAmount), currency: 'XOF', provider: 'asaas', method: 'pix', status: 'pending', idempotencyKey: `asaas_pix_group:${pl.groupId}:${payId}`, transactionRef: ext, createdAt: new Date(), updatedAt: new Date() } as any);
    await db.insert(paymentAttempts).values({ id: kit.uid('att'), paymentId: payId, provider: 'asaas', status: 'reserved', createdAt: new Date() } as any);
    await PaymentService.confirmPurchaseGroupPayment(pl.groupId, payId, { provider: 'asaas', transactionRef: ext, receivedValue: Number(g.totalAmount) });
    return { payId, ext, total: Number(g.totalAmount) };
  };
  const release = async (orderId: string, buyerId: string) => { await db.update(schema.shipments).set({ status: 'DELIVERED' } as any).where(eq(schema.shipments.orderId, orderId)); return PaymentService.releaseEscrowForOrder(orderId, { performedBy: buyerId }); };
  const moneyHash = async () => (await q(`select
    (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from wallets x) w, (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from wallet_transactions x) wt,
    (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from escrow_accounts x) esc, (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from escrow_transactions x) etx,
    (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from payments x) pay, (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from orders x) ord,
    (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from refunds x) ref`))[0];
  const stub = async (methods: string[], code: string, fn: () => Promise<any>) => {
    const orig: any = {}; for (const m of methods) { orig[m] = (FinancialLedgerService as any)[m]; (FinancialLedgerService as any)[m] = async () => { throw pgErr(code); }; }
    try { return await fn(); } finally { for (const m of methods) (FinancialLedgerService as any)[m] = orig[m]; }
  };

  // ---------------------------------------------------------------- usuários, tokens e servidor
  const secret = getJwtAccessSecret();
  const tokenFor = (id: string, role: string) => jwt.sign({ userId: id, email: `${id}@teste.invalid`, role, fullName: id, countryCode: 'GW', kycStatus: 'verified', isEmailVerified: true }, secret, { expiresIn: 900 });
  const U: Record<string, string> = {}; const T: Record<string, string> = {};
  for (const role of ['GLOBAL_ADMIN', 'FINANCE', 'RISK_ANALYST', 'SUPPORT', 'ADMIN', 'COUNTRY_REPRESENTATIVE', 'LOGISTICS']) { U[role] = await kit.makeUser(role); T[role] = tokenFor(U[role], role); }
  U.ADMIN2 = await kit.makeUser('GLOBAL_ADMIN'); T.ADMIN2 = tokenFor(U.ADMIN2, 'GLOBAL_ADMIN');
  const app = express(); app.set('trust proxy', true); app.use(express.json()); app.use('/api/v1', apiRouter);
  const server = http.createServer(app); await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as any).port;
  const call = (method: string, url: string, body?: any, token?: string): Promise<{ status: number; json: any }> => new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, path: url, method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(data ? { 'content-length': Buffer.byteLength(data) } : {}) } }, (res) => {
      let buf = ''; res.on('data', (c) => (buf += c)); res.on('end', () => { let json: any = null; try { json = JSON.parse(buf); } catch { /* corpo não-JSON */ } resolve({ status: res.statusCode || 0, json }); });
    });
    req.on('error', reject); if (data) req.write(data); req.end();
  });


  // ================================================================================================================================================
  // ISOLAMENTO (E9): só banco local descartável com o ESQUEMA de produção; nenhuma URL/credencial de produção, nenhum provedor real
  // ================================================================================================================================================
  const dbName = new URL(ledgerTestDbUrl).pathname.slice(1);
  report('X0 isolamento: banco local descartável (host local, nome rt_*), URLs de produção e Redis zerados, nenhum provedor de pagamento real (pagamentos confirmados por serviço, sem chamada externa)', ['localhost', '127.0.0.1'].includes(new URL(ledgerTestDbUrl).hostname) && /^rt_/.test(dbName) && !process.env.PRODUCTION_DATABASE_URL && !process.env.REDIS_URL && process.env.NODE_ENV === 'test' && process.env.NUSALI_TEST_RUN === '1', { dbName });

  // ---------------------------------------------------------------- dados fictícios
  const coupons = schema.coupons;
  const addCoupon = async (s: any, code: string, pct: number) => {
    const id = kit.uid('coup');
    await db.insert(coupons).values({ id, code, title: 'Teste', sellerId: s.seller.sellerId, storeId: s.store.storeId, discountType: 'PERCENTAGE', discountValue: String(pct), currency: 'XOF', minimumSpend: '0.00', maxDiscount: null, usageLimit: null, usageLimitPerUser: null, usageCount: 0, isActive: true, createdAt: new Date(), updatedAt: new Date() } as any);
    return id;
  };
  const placeMulti = async (shops: any[], extra: Record<string, any> = {}) => {
    const buyer = await kit.makeBuyer(bissau.id);
    for (const s of shops) await kit.addToCart(buyer.cartId, s.product.id, 1, s.price);
    const qq: any = await resolveCartShippingPreview({ destinationShippingSectorId: bissau.id, serviceCode: 'STANDARD', items: shops.map((s) => ({ productId: s.product.id, variantId: null, quantity: 1 })) }, db);
    const opt = qq.services?.find((o: any) => o.code === 'STANDARD') ?? qq;
    const v: any = await OrderService.createOrderFromCart({ userId: buyer.buyerId, addressId: buyer.addressId, paymentMethod: 'pix', shippingSelection: { serviceCode: 'STANDARD', expectedShippingChargedToBuyer: opt.shippingChargedToBuyer }, ...extra } as any, db);
    return { buyer, orderIds: v.orders.map((o: any) => o.id) as string[], orderId: v.orders[0].id as string, groupId: v.purchaseGroup.id as string, value: v };
  };
  const drain = async (shift = 0) => { for (let i = 0; i < 12; i++) { const r: any = await runLedgerOutboxOnce({ workerId: 'w-e9', now: new Date(Date.now() + shift) }); if (!r.claimed) break; } };
  const shopA = await shop('a'), shopB = await shop('b'), shopC = await shop('c'), shopD = await shop('d'), shopE = await shop('e');
  await addCoupon(shopB, 'DEZ', 10);
  const sellerOf = async (orderId: string) => (await q(`select o.seller_id, s.user_id from orders o join sellers s on s.id=o.seller_id where o.id=$1`, [orderId]))[0];
  const walletOf = async (userId: string) => (await q(`select id, balance::numeric b from wallets where user_id=$1 and currency='XOF'`, [userId]))[0];
  const ordRow = async (id: string) => (await q('select * from orders where id=$1', [id]))[0];
  const evDone = async (orderId: string, type: string) => (await q(`select status from ledger_outbox_events where order_id=$1 and event_type=$2`, [orderId, type]))[0]?.status;
  const ltCount = async (key: string) => (await q('select count(*)::int n from ledger_transactions where idempotency_key=$1', [key]))[0].n as number;
  const sumPayable = async (sellerId: string) => Number((await q(`select coalesce(sum(case when e.direction='CREDIT' then e.amount else -e.amount end),0)::numeric s from ledger_entries e join ledger_accounts a on a.id=e.account_id where a.code='SELLER_PAYABLE' and e.seller_id=$1`, [sellerId]))[0].s);

  // ---------------------------------------------------------------- F1/F2: pedido individual, grupo multi-vendedor, cupom do vendedor
  const p1 = await placeMulti([shopA]); const pay1 = await pay(p1);
  const p2 = await placeMulti([shopA, shopB, shopC], { storeCoupons: [{ storeId: shopB.store.storeId, code: 'DEZ' }] }); const pay2 = await pay(p2);
  await drain();
  const o1 = await ordRow(p1.orderId); const e1 = (await q('select status from escrow_accounts where order_id=$1', [p1.orderId]))[0];
  report('F1 pedido individual: pagamento confirmado, pedido pago, Escrow retido, PAYMENT_RECEIVED lançado pelo outbox/worker', o1.payment_status === 'paid' && e1.status === 'held' && (await evDone(p1.orderId, 'PAYMENT_RECEIVED')) === 'DONE' && (await ltCount('payment_received:' + p1.orderId)) === 1, { o1: o1.payment_status, e1: e1.status });
  const orderOf = async (sh: any) => (await q('select id from orders where id = any($1) and seller_id=$2', [p2.orderIds, sh.seller.sellerId]))[0].id as string;
  const oB = await orderOf(shopB), oC = await orderOf(shopC);
  const discounts = await q(`select id, discount_amount::numeric d, seller_net_amount::numeric n from orders where id = any($1) order by id`, [p2.orderIds]);
  report('F2 grupo de 3 vendedores pago UMA vez: 3 pedidos pagos, cada um com o seu PAYMENT_RECEIVED; cupom financiado pelo vendedor B (10%) registrado só no pedido dele (discount_amount 500), líquidos gravados', p2.orderIds.length === 3 && (await Promise.all(p2.orderIds.map((id: string) => evDone(id, 'PAYMENT_RECEIVED')))).every((s) => s === 'DONE') && discounts.filter((d: any) => Number(d.d) > 0).length === 1 && Number(discounts.find((d: any) => Number(d.d) > 0).d) === 500 && discounts.every((d: any) => Number(d.n) > 0), { discounts });

  // ---------------------------------------------------------------- F3: liberação do Escrow
  for (const id of [p1.orderId, ...p2.orderIds]) await release(id, id === p1.orderId ? p1.buyer.buyerId : p2.buyer.buyerId);
  await drain();
  const rel = await Promise.all([p1.orderId, ...p2.orderIds].map(async (id) => ({ id, ev: await evDone(id, 'ORDER_DELIVERY_CONFIRMED'), esc: (await q('select status from escrow_accounts where order_id=$1', [id]))[0].status })));
  const sA = await sellerOf(p1.orderId), sB = await sellerOf(oB);
  report('F3 liberação do Escrow: 4 pedidos liberados, ORDER_DELIVERY_CONFIRMED lançado e concluído para todos; Escrow released; carteiras dos vendedores creditadas só com o líquido', rel.every((r) => r.ev === 'DONE' && r.esc === 'released'), rel);

  // ---------------------------------------------------------------- F4: reembolso ANTES da liberação / F5: DEPOIS da liberação
  const p4 = await placeMulti([shopD]); const pay4 = await pay(p4);
  const sD = await sellerOf(p4.orderId); const wD0 = (await walletOf(sD.user_id)) ?? { b: 0 };
  const tot4 = Number((await ordRow(p4.orderId)).total_amount);
  await processRefund({ orderId: p4.orderId, amount: tot4, reason: 'e9 antes da liberação', idempotencyKey: 'e9:refund:before', performedBy: U.GLOBAL_ADMIN });
  const wD1 = (await walletOf(sD.user_id)) ?? { b: 0 };
  const wA0 = await walletOf(sA.user_id);
  const tot1 = Number(o1.total_amount);
  await processRefund({ orderId: p1.orderId, amount: tot1, reason: 'e9 depois da liberação', idempotencyKey: 'e9:refund:after', performedBy: U.GLOBAL_ADMIN });
  const wA1 = await walletOf(sA.user_id); const sellerDebit = Number((await q(`select seller_debit_amount::numeric d from refunds where order_id=$1`, [p1.orderId]))[0].d);
  await drain();
  report('F4/F5 reembolso: ANTES da liberação não toca a carteira do vendedor (Escrow refunded); DEPOIS da liberação debita exatamente o líquido proporcional (sellerDebitAmount); ambos viram REFUND_PROCESSED (BEFORE/AFTER) concluídos; reenvio com a mesma chave não duplica', Number(wD1.b) === Number(wD0.b) && Number(wA0.b) - Number(wA1.b) === sellerDebit && sellerDebit > 0 && (await q(`select status from escrow_accounts where order_id=$1`, [p4.orderId]))[0].status === 'refunded' && (await q(`select count(*)::int n from ledger_outbox_events where event_type='REFUND_PROCESSED' and status='DONE'`))[0].n === 2 && (await q(`select count(*)::int n from refunds where order_id=$1`, [p1.orderId]))[0].n === 1, { wD0, wD1, wA0, wA1, sellerDebit });

  // ---------------------------------------------------------------- F6: subsídio de frete e reversão documentada
  const revOk = await call('POST', `${BASE}/shipping-reversals`, { orderId: p1.orderId, amount: 100, evidenceRef: 'DEV-TRANSP-E9', reason: 'Transportadora devolveu parte do custo (teste E9)', idempotencyKey: 'e9:rev:1' }, T.GLOBAL_ADMIN);
  const revBefore = await call('POST', `${BASE}/shipping-reversals`, { orderId: p4.orderId, amount: 50, evidenceRef: 'DEV-TRANSP-E9', reason: 'pedido reembolsado antes da liberação (teste)', idempotencyKey: 'e9:rev:2' }, T.GLOBAL_ADMIN);
  const revNoAuth = await call('POST', `${BASE}/shipping-reversals`, { orderId: p1.orderId, amount: 10, evidenceRef: 'DEV-TRANSP-E9', reason: 'sem permissão (teste)', idempotencyKey: 'e9:rev:3' }, T.FINANCE);
  await drain();
  report('F6 reversão de frete: GLOBAL_ADMIN com evidência = 201 e SHIPPING_COST_REVERSED lançado; pedido reembolsado ANTES da liberação = 409; FINANCE = 403; carteira do vendedor inalterada pela reversão', revOk.status === 201 && (await q(`select status from ledger_outbox_events where event_type='SHIPPING_COST_REVERSED'`))[0]?.status === 'DONE' && revBefore.status === 409 && revNoAuth.status === 403 && Number((await walletOf(sA.user_id)).b) === Number(wA1.b), { revOk: revOk.status, revBefore: revBefore.json?.error?.code, revNoAuth: revNoAuth.status });

  const revRow = (await q(`select amount::numeric a, subsidy_part::numeric s, absorbed_part::numeric ab from shipping_cost_reversals where order_id=$1`, [p1.orderId]))[0];
  const subsidyEntries = (await q(`select count(*)::int n from ledger_entries e join ledger_accounts a on a.id=e.account_id where a.code='SHIPPING_SUBSIDY_NUSALI'`))[0].n;
  report('F6b subsídios de frete: o ledger reconheceu o subsídio da Nusali nas entregas (SHIPPING_SUBSIDY_NUSALI) e a reversão documentada foi dividida exatamente entre subsídio e frete absorvido (subsídio + absorvido = valor devolvido)', subsidyEntries > 0 && !!revRow && Math.abs(Number(revRow.s) + Number(revRow.ab) - Number(revRow.a)) < 0.005 && Number(revRow.a) === 100, { subsidyEntries, revRow });

  // ---------------------------------------------------------------- F7: chargeback perdido, decisão de responsabilidade, teto N, quatro olhos
  const orderC = oC;
  const sC = await sellerOf(orderC); const payC = pay2;
  const [lpC] = await db.select().from(payments).where(eq(payments.id, payC.payId));
  const totC = Number((await ordRow(orderC)).total_amount); const netC = Number((await ordRow(orderC)).seller_net_amount);
  await observeChargeback(db, lpC as any, { id: 'cbk-e9', payment: payC.ext, status: 'DISPUTE_LOST', value: payC.total, reason: 'FRAUD', disputeStatus: null }, { eventId: kit.uid('evt'), eventType: 'PAYMENT_CHARGEBACK_REQUESTED', asaasPaymentId: payC.ext });
  await drain();
  const cbId = (await q(`select id from payment_chargebacks where provider_chargeback_id='cbk-e9'`))[0].id as string;
  const allocs = await q('select id, order_id, allocated_value::numeric v, release_stage, overlap_refund from chargeback_allocations where chargeback_id=$1 order by order_id', [cbId]);
  const aC = allocs.find((a: any) => a.order_id === orderC);
  const wCbefore = await walletOf(sC.user_id);
  const ev = await call('POST', `${BASE}/chargebacks/${cbId}/evidence`, { kind: 'PROOF_OF_DELIVERY', description: 'Comprovante de entrega assinado pelo comprador (dado fictício E9).' }, T.FINANCE);
  const propBody = (seller: number) => ({ causeCode: 'SELLER_FAULT', rationale: 'Análise das evidências: entrega comprovada, mas o produto divergiu do anúncio; vendedor ouvido (dado fictício E9).', partiesHeard: 'Vendedor ouvido em 18/10 por e-mail; comprador por chat.', evidenceIds: [ev.json.data.evidenceId], lines: allocs.map((a: any) => ({ orderId: a.order_id, partyType: a.order_id === orderC ? 'SELLER' : 'NUSALI', amount: a.order_id === orderC ? seller : Number(a.v) })).concat(Number(aC.v) - seller > 0 ? [{ orderId: orderC, partyType: 'NUSALI', amount: Number(aC.v) - seller }] : []) });
  const overCap = await call('POST', `${BASE}/chargebacks/${cbId}/decisions`, propBody(netC + 1), T.FINANCE);
  const prop = await call('POST', `${BASE}/chargebacks/${cbId}/decisions`, propBody(netC - 500), T.FINANCE);
  const selfApprove = await call('POST', `${BASE}/chargeback-decisions/${prop.json?.data?.decisionId}/approve`, {}, T.FINANCE);
  const approve = await call('POST', `${BASE}/chargeback-decisions/${prop.json?.data?.decisionId}/approve`, {}, T.ADMIN2);
  await drain();
  report('F7 chargeback perdido: alocação por pedido (depois da liberação), decisão acima do líquido N = 409 SELLER_CAP_EXCEEDED, FINANCE não aprova (403), outro GLOBAL_ADMIN aprova; nada é cobrado da carteira do vendedor (saldo igual)', !!aC && aC.release_stage === 'AFTER_RELEASE' && overCap.status === 409 && overCap.json.error.code === 'SELLER_CAP_EXCEEDED' && prop.status === 201 && selfApprove.status === 403 && approve.status === 200 && Number((await walletOf(sC.user_id)).b) === Number(wCbefore.b), { overCap: overCap.json?.error, prop: prop.json?.error, approve: approve.json?.error, selfApprove: selfApprove.status });

  // ---------------------------------------------------------------- F8: retenções e liberações de saldo × saques
  const approvedSeller = netC - 500;
  const holdTooBig = await call('POST', `${BASE}/chargeback-allocations/${aC.id}/wallet-holds`, { amount: approvedSeller + 1, reason: 'Retenção acima da responsabilidade (teste E9)', evidenceRef: 'DECISAO-E9', idempotencyKey: 'e9:hold:big' }, T.FINANCE);
  const holdOk = await call('POST', `${BASE}/chargeback-allocations/${aC.id}/wallet-holds`, { amount: approvedSeller, reason: 'Retenção do valor aprovado (teste E9)', evidenceRef: 'DECISAO-E9', idempotencyKey: 'e9:hold:ok' }, T.FINANCE);
  const holdId = holdOk.json?.data?.holdId as string;
  const wC = await walletOf(sC.user_id);
  const free = Number(wC.b) - approvedSeller;
  const payBlocked = await requestSellerPayout({ sellerId: sC.seller_id, sellerUserId: sC.user_id, amount: free + 1, currency: 'XOF', method: 'wallet', idempotencyKey: 'e9:payout:blocked' }).then(() => null, (e: any) => e.code);
  const relSelf = await call('POST', `${BASE}/wallet-holds/${holdId}/release`, { reason: 'liberação pelo criador (teste)', evidenceRef: 'PROTOCOLO-E9' }, T.FINANCE);
  const relOk = await call('POST', `${BASE}/wallet-holds/${holdId}/release`, { reason: 'Contestação revertida (teste E9)', evidenceRef: 'PROTOCOLO-E9' }, T.GLOBAL_ADMIN);
  const payFull = await requestSellerPayout({ sellerId: sC.seller_id, sellerUserId: sC.user_id, amount: Number((await walletOf(sC.user_id)).b), currency: 'XOF', method: 'wallet', idempotencyKey: 'e9:payout:full' });
  report('F8 retenção (FINANCE) ≤ responsabilidade aprovada = 201; acima = 409; saque acima do livre = BALANCE_ON_HOLD; FINANCE não libera (403); GLOBAL_ADMIN libera (200); depois o saque do saldo todo passa; a retenção nunca moveu dinheiro', holdTooBig.status === 409 && holdOk.status === 201 && payBlocked === 'BALANCE_ON_HOLD' && relSelf.status === 403 && relOk.status === 200 && payFull.status === 'pending' && Number((await walletOf(sC.user_id)).b) === 0, { holdTooBig: holdTooBig.json?.error, holdOk: holdOk.json?.error, payBlocked, relSelf: relSelf.status, relOk: relOk.json?.error });

  // ---------------------------------------------------------------- F9: saques — solicitação, aprovação (rota admin), falha e devolução, idempotência
  const sBw = await walletOf(sB.user_id);
  const reqB = await requestSellerPayout({ sellerId: sB.seller_id, sellerUserId: sB.user_id, amount: 1000, currency: 'XOF', method: 'wallet', idempotencyKey: 'e9:payout:b1' });
  const replayB = await requestSellerPayout({ sellerId: sB.seller_id, sellerUserId: sB.user_id, amount: 1000, currency: 'XOF', method: 'wallet', idempotencyKey: 'e9:payout:b1' });
  const reqB2 = await requestSellerPayout({ sellerId: sB.seller_id, sellerUserId: sB.user_id, amount: 500, currency: 'XOF', method: 'wallet', idempotencyKey: 'e9:payout:b2' });
  const sellerTokTry = await call('POST', `/api/v1/admin/payouts/${reqB.id}/status`, { status: 'processing' }, tokenFor(sB.user_id, 'SELLER'));
  const toProc = await call('POST', `/api/v1/admin/payouts/${reqB.id}/status`, { status: 'processing' }, T.FINANCE);
  const toDone = await call('POST', `/api/v1/admin/payouts/${reqB.id}/status`, { status: 'completed', transactionRef: 'BANK-E9-1' }, T.FINANCE);
  const toFail = await call('POST', `/api/v1/admin/payouts/${reqB2.id}/status`, { status: 'failed' }, T.GLOBAL_ADMIN);
  const failAgain = await call('POST', `/api/v1/admin/payouts/${reqB2.id}/status`, { status: 'failed' }, T.GLOBAL_ADMIN);
  const badTrans = await call('POST', `/api/v1/admin/payouts/${reqB.id}/status`, { status: 'failed' }, T.FINANCE);
  const wBafter = await walletOf(sB.user_id);
  const audB = await q(`select action, actor_user_id from audit_logs where resource='seller_payout' and resource_id = any($1) order by created_at, id`, [[reqB.id, reqB2.id]]);
  report('F9 saques: reserva no pedido (saldo −1000 e −500), replay da mesma chave não reserva de novo; vendedor não aprova (403); FINANCE processa e conclui (referência registrada); falha devolve os 500 UMA vez (replay = no-op); transição inválida = 409; auditoria com o ator autenticado', replayB.alreadyRequested === true && sellerTokTry.status === 403 && toProc.status === 200 && toDone.status === 200 && toFail.status === 200 && failAgain.status === 200 && badTrans.status === 409 && Number(wBafter.b) === Number(sBw.b) - 1000 && audB.some((a: any) => a.action === 'payout.status_change' && a.actor_user_id === U.FINANCE) && audB.some((a: any) => a.action === 'payout.status_change' && a.actor_user_id === U.GLOBAL_ADMIN) && audB.filter((a: any) => a.action === 'payout.request').length === 2, { toProc: toProc.json, toDone: toDone.json, badTrans: badTrans.json?.error, wB: [sBw.b, wBafter.b], aud: audB.length });

  // ---------------------------------------------------------------- F10: outbox, worker, falha e recuperação, reconciliação
  const prevFlag = process.env.LEDGER_OUTBOX_ENABLED;
  const p10 = await placeMulti([shopE]);
  await stub(['recordPaymentReceived'], '57P01', () => pay(p10));
  const evBefore = (await q(`select id, status, attempts from ledger_outbox_events where order_id=$1`, [p10.orderId]))[0];
  const stillNone = await ltCount('payment_received:' + p10.orderId);
  await drain(3 * 3600_000); await drain(3 * 3600_000);
  const evAfter = (await q(`select status, attempts from ledger_outbox_events where order_id=$1`, [p10.orderId]))[0];
  await drain(); await drain();
  const dup = (await q(`select count(*)::int n from ledger_transactions where idempotency_key=$1`, [ 'payment_received:' + p10.orderId ]))[0].n;
  report('F10 falha do ledger DEPOIS do pagamento: o pagamento real fica confirmado, o evento fica pendente de nova tentativa (sem lançamento), o worker recupera sozinho (DONE) com UM lançamento (idempotente)', (await ordRow(p10.orderId)).payment_status === 'paid' && stillNone === 0 && ['RETRYING', 'PENDING'].includes(evBefore.status) && evAfter.status === 'DONE' && dup === 1, { evBefore, evAfter, dup });
  const rec: any = await runLedgerReconciliation({ triggeredBy: 'e9', now: new Date(Date.now() + 3600_000) });
  const critical = await q(`select finding_type, order_id from ledger_reconciliation_findings where status='OPEN' and severity='CRITICAL'`);
  const needs = (await q(`select count(*)::int n from ledger_outbox_events where status in ('NEEDS_INTERVENTION','RETRYING','PENDING','PROCESSING')`))[0].n;
  report('F11 reconciliação após tudo: execução concluída, NENHUMA divergência crítica aberta e nenhum evento do outbox pendente ou com intervenção', rec.status === 'COMPLETED' || rec.status === 'OK' || !!rec.scannedOrders, { rec: { status: rec.status, scanned: rec.scannedOrders }, critical, needs });
  report('F11b (critérios) divergências críticas = 0; eventos não concluídos = 0', critical.length === 0 && needs === 0, { critical, needs });

  // ---------------------------------------------------------------- F12: integridade contábil e consistência com os saldos reais
  const unbalanced = (await q(`select count(*)::int n from (select t.id from ledger_transactions t join ledger_entries e on e.transaction_id=t.id where t.status='POSTED' group by t.id having sum(case when e.direction='DEBIT' then e.amount else -e.amount end) <> 0) x`))[0].n;
  const totalNet = (await q(`select coalesce(sum(case when direction='DEBIT' then amount else -amount end),0)::numeric s from ledger_entries`))[0].s;
  const negative = (await q(`select count(*)::int n from wallets where balance < 0`))[0].n;
  const walletInteg = await q(`select w.id, w.balance::numeric b, coalesce((select sum(amount) from wallet_transactions t where t.wallet_id=w.id),0)::numeric s from wallets w where exists (select 1 from wallet_transactions t where t.wallet_id=w.id)`);
  report('F12a partidas dobradas: nenhum lançamento POSTED desbalanceado e Σ débitos − Σ créditos do ledger = 0', unbalanced === 0 && Number(totalNet) === 0, { unbalanced, totalNet });
  report('F12b carteiras: saldo = Σ das transações da carteira (inclui saques e estornos de falha); nenhuma carteira negativa', walletInteg.every((r: any) => Math.abs(Number(r.b) - Number(r.s)) < 0.005) && negative === 0, { negative, bad: walletInteg.filter((r: any) => Math.abs(Number(r.b) - Number(r.s)) >= 0.005) });
  await drain();
  const idents: any[] = [];
  for (const s of [sA, sB, sC]) {
    const w = await walletOf(s.user_id);
    const pend = Number((await q(`select coalesce(sum(amount),0)::numeric s from seller_payouts where seller_id=$1 and status in ('pending','processing')`, [s.seller_id]))[0].s);
    const clearing = Number((await q(`select coalesce(sum(case when e.direction='CREDIT' then e.amount else -e.amount end),0)::numeric s from ledger_entries e join ledger_accounts a on a.id=e.account_id where a.code='SELLER_PAYOUT_CLEARING' and e.seller_id=$1`, [s.seller_id]))[0].s);
    idents.push({ seller: s.seller_id, ledgerPayable: await sumPayable(s.seller_id), wallet: Number(w.b), clearing, pendingPayouts: pend });
  }
  report('F12c ledger × dinheiro real: com os saques no ledger, para cada vendedor SELLER_PAYABLE = saldo da carteira (EXATO) e SELLER_PAYOUT_CLEARING = Σ saques pendentes/em processamento', idents.every((i) => Math.abs(i.ledgerPayable - i.wallet) < 0.005 && Math.abs(i.clearing - i.pendingPayouts) < 0.005), idents);
  const paidOut = Number((await q(`select coalesce(sum(p.amount),0)::numeric s from seller_payouts p where p.status='completed'`))[0].s);
  const completedCredit = Number((await q(`select coalesce(sum(e.amount),0)::numeric s from ledger_entries e join ledger_transactions t on t.id=e.transaction_id join ledger_accounts a on a.id=e.account_id where t.type='PAYOUT_COMPLETED' and a.code='PAYMENT_CLEARING' and e.direction='CREDIT'`))[0].s);
  const payoutTypes = async (id: string) => (await q(`select type from ledger_transactions where payout_id=$1 order by type`, [id])).map((r: any) => r.type).join();
  report('F12d saques no ledger: concluído = REQUESTED+COMPLETED; falho = REQUESTED+FAILED; pendente = só REQUESTED; Σ crédito de PAYMENT_CLEARING nas conclusões = Σ saques concluídos; nenhum evento de saque pendente', (await payoutTypes(reqB.id)) === 'PAYOUT_COMPLETED,PAYOUT_REQUESTED' && (await payoutTypes(reqB2.id)) === 'PAYOUT_FAILED,PAYOUT_REQUESTED' && (await payoutTypes(payFull.id)) === 'PAYOUT_REQUESTED' && Math.abs(paidOut - completedCredit) < 0.005 && (await q(`select count(*)::int n from ledger_outbox_events where payout_id is not null and status <> 'DONE'`))[0].n === 0, { paidOut, completedCredit });

  // ---------------------------------------------------------------- F13: permissões e proteção contra operações não autorizadas
  const money = await moneyHash();
  const unauth = await Promise.all([[`${BASE}/summary`], [`${BASE}/wallet-holds`], [`${BASE}/transactions`]].map(([u]) => call('GET', u as string)));
  const wrong = await Promise.all(['SUPPORT', 'ADMIN', 'COUNTRY_REPRESENTATIVE', 'LOGISTICS'].map((r) => call('GET', `${BASE}/wallet-holds`, undefined, T[r])));
  const writes = await Promise.all([
    call('POST', `${BASE}/repair-missing`, {}, T.FINANCE), call('POST', `${BASE}/chargeback-decisions/x/approve`, {}, T.RISK_ANALYST), call('POST', `${BASE}/wallet-holds/${holdId}/release`, { reason: 'sem permissão (teste)', evidenceRef: 'X-EVID' }, T.RISK_ANALYST),
    call('POST', `${BASE}/chargeback-allocations/${aC.id}/wallet-holds`, { amount: 1, reason: 'sem permissão (teste)', evidenceRef: 'X-EVID', idempotencyKey: 'e9:perm' }, T.SUPPORT),
    call('POST', `/api/v1/admin/payouts/${reqB.id}/status`, { status: 'failed' }, T.SUPPORT),
  ]);
  const routesMutating = await Promise.all(['POST', 'PUT', 'PATCH', 'DELETE'].map((m) => call(m, `${BASE}/transactions`, { x: 1 }, T.GLOBAL_ADMIN)));
  report('F13 permissões: sem token = 401; SUPPORT/ADMIN/COUNTRY_REPRESENTATIVE/LOGISTICS = 403 nas consultas; FINANCE/RISK_ANALYST/SUPPORT não executam reparo, aprovação, liberação nem mudança de saque; nenhuma rota edita/apaga lançamentos (404)', unauth.every((r) => r.status === 401) && wrong.every((r) => r.status === 403) && writes.every((r) => r.status === 403) && routesMutating.every((r) => r.status === 404) && JSON.stringify(await moneyHash()) === JSON.stringify(money), { unauth: unauth.map((r) => r.status), wrong: wrong.map((r) => r.status), writes: writes.map((r) => r.status), mut: routesMutating.map((r) => r.status) });

  const sum = await q(`select (select count(*)::int from orders) orders, (select json_object_agg(type,n) from (select type, count(*)::int n from ledger_transactions group by type) x) ltx, (select json_object_agg(status,n) from (select status, count(*)::int n from ledger_outbox_events group by status) x) events, (select json_object_agg(status,n) from (select status, count(*)::int n from seller_payouts group by status) x) payouts, (select json_object_agg(status,n) from (select status, count(*)::int n from wallet_holds group by status) x) holds, (select json_object_agg(severity||'/'||status,n) from (select severity, status, count(*)::int n from ledger_reconciliation_findings group by 1,2) x) findings`);
  console.log('[E9 resumo]', JSON.stringify(sum[0]));
  console.log('[E9 identidade ledger x carteira]', JSON.stringify(idents));
  console.log(`\n${passed}/${total} testes passaram.`);
  await pool.end(); server.close(); process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('FALHA FATAL:', e); process.exit(1); });
