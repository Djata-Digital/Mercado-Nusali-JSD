/**
 * LEDGER SOMBRA — E6: API ADMINISTRATIVA (/api/v1/admin/ledger). Usa o apiRouter REAL (mesma pilha de guards do servidor) contra Postgres DESCARTAVEL com os serviços reais.
 * Prova: autorização por perfil no backend (401/403/200, papel só do JWT), consultas e filtros, NENHUMA rota que altere lançamentos, ações que só chamam os serviços
 * existentes (reparo manual, recolocar/descartar, reconhecer, evidência/proposta/aprovação/recuperação de chargeback, reversão de frete) com ator = usuário autenticado,
 * idempotência, respostas sem segredos e dinheiro real intacto. Nunca produção.
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

  // ---------------------------------------------------------------- cenário (serviços reais)
  const shopA = await shop('a'), shopB = await shop('b'), shopC = await shop('c'), shopD = await shop('d');
  // 1) pedido pago e liberado, tudo lançado (PR + DC)
  const p1 = await place(shopA); const pay1 = await pay(p1); await release(p1.orderId, p1.buyer.buyerId);
  // 2) pedido pago SEM lançamento e SEM evento (evento perdido) => candidato ao reparo manual
  const prevFlag = process.env.LEDGER_OUTBOX_ENABLED; process.env.LEDGER_OUTBOX_ENABLED = 'false';
  const p2 = await place(shopB); await stub(['recordPaymentReceived'], '57P01', () => pay(p2)); process.env.LEDGER_OUTBOX_ENABLED = prevFlag;
  // 3) evento em RETRYING (ledger fora do ar após o commit)
  const p3 = await place(shopC); await stub(['recordPaymentReceived'], '57P01', () => pay(p3));
  const ev3 = (await q(`select id from ledger_outbox_events where order_id=$1`, [p3.orderId]))[0];
  // 4) chargeback perdido DEPOIS da liberação (perda pendente) — webhook real
  const p4 = await place(shopD); const pay4 = await pay(p4); await release(p4.orderId, p4.buyer.buyerId);
  const [lp4] = await db.select().from(payments).where(eq(payments.id, pay4.payId));
  await observeChargeback(db, lp4 as any, { id: 'cbk-e6', payment: pay4.ext, status: 'DISPUTE_LOST', value: pay4.total, reason: 'FRAUD', disputeStatus: null }, { eventId: kit.uid('evt'), eventType: 'PAYMENT_CHARGEBACK_REQUESTED', asaasPaymentId: pay4.ext });
  const cb4 = (await q(`select id from payment_chargebacks where provider_chargeback_id='cbk-e6'`))[0].id;
  // 5) pedido reembolsado DEPOIS da liberação (para a reversão de frete)
  const p5 = await place(shopA); await pay(p5); await release(p5.orderId, p5.buyer.buyerId);
  await processRefund({ orderId: p5.orderId, amount: Number((await q('select total_amount from orders where id=$1', [p5.orderId]))[0].total_amount), reason: 'e6', idempotencyKey: 'refund:e6:5', performedBy: U.GLOBAL_ADMIN });
  // 6) pedido reembolsado ANTES da liberação
  const p6 = await place(shopB); await pay(p6);
  await processRefund({ orderId: p6.orderId, amount: Number((await q('select total_amount from orders where id=$1', [p6.orderId]))[0].total_amount), reason: 'e6', idempotencyKey: 'refund:e6:6', performedBy: U.GLOBAL_ADMIN });
  // 7) outro evento em RETRYING (será descartado pela API)
  const p7 = await place(shopC); await stub(['recordPaymentReceived'], '57P01', () => pay(p7));
  const ev7 = (await q(`select id from ledger_outbox_events where order_id=$1`, [p7.orderId]))[0];
  await runLedgerReconciliation({ triggeredBy: 'e6-test', now: new Date(Date.now() + 3600_000) });
  const money0 = await moneyHash();
  const ledgerRows0 = (await q(`select (select count(*)::int from ledger_transactions) t, (select count(*)::int from ledger_entries) e, (select md5(coalesce(string_agg(id||status||type,'|' order by id),'')) from ledger_transactions) h`))[0];

  // ================================================================================================================================================
  // P) permissões — validadas no backend
  // ================================================================================================================================================
  const readUrls = [`${BASE}/summary`, `${BASE}/transactions`, `${BASE}/outbox`, `${BASE}/findings`, `${BASE}/chargebacks`, `${BASE}/shipping-reversals`];
  const noToken = await Promise.all(readUrls.map((u) => call('GET', u)));
  const forged = await call('GET', `${BASE}/summary`, undefined, jwt.sign({ userId: 'x', role: 'GLOBAL_ADMIN' }, 'segredo-errado'));
  const buyerTok = tokenFor(p1.buyer.buyerId, 'BUYER'); const sellerTok = tokenFor('seller-x', 'SELLER');
  const nonStaff = await Promise.all([buyerTok, sellerTok].map((t) => call('GET', `${BASE}/summary`, undefined, t)));
  report('P1 sem token (6 rotas de leitura) = 401; token forjado (segredo errado) = 401; comprador e vendedor (não são equipe interna) = 403', noToken.every((r) => r.status === 401) && forged.status === 401 && nonStaff.every((r) => r.status === 403), { noToken: noToken.map((r) => r.status), forged: forged.status, nonStaff: nonStaff.map((r) => r.status) });
  const staffDenied = await Promise.all(['SUPPORT', 'ADMIN', 'COUNTRY_REPRESENTATIVE', 'LOGISTICS'].map((r) => call('GET', `${BASE}/transactions`, undefined, T[r])));
  const staffAllowed = await Promise.all(['GLOBAL_ADMIN', 'FINANCE', 'RISK_ANALYST'].map((r) => call('GET', `${BASE}/transactions`, undefined, T[r])));
  report('P2 leitura: GLOBAL_ADMIN, FINANCE e RISK_ANALYST = 200; SUPPORT, ADMIN, COUNTRY_REPRESENTATIVE e LOGISTICS = 403 (LEDGER_ACCESS_DENIED)', staffAllowed.every((r) => r.status === 200 && r.json.success) && staffDenied.every((r) => r.status === 403 && r.json?.error?.code === 'LEDGER_ACCESS_DENIED'), { a: staffAllowed.map((r) => r.status), d: staffDenied.map((r) => r.status) });
  const spoof = await call('GET', `${BASE}/transactions?role=GLOBAL_ADMIN&userId=${U.GLOBAL_ADMIN}`, undefined, T.SUPPORT);
  const spoofBody = await call('POST', `${BASE}/outbox/${ev3.id}/requeue`, { reason: 'tentando forjar o papel pelo corpo', role: 'GLOBAL_ADMIN', actorUserId: U.GLOBAL_ADMIN }, T.FINANCE);
  report('P3 o papel vem SÓ do JWT verificado: role/userId em query ou corpo são ignorados (SUPPORT continua 403; FINANCE não consegue recolocar evento)', spoof.status === 403 && spoofBody.status === 403 && spoofBody.json?.error?.code === 'LEDGER_ADMIN_REQUIRED', { spoof: spoof.status, spoofBody: spoofBody.status });
  const adminOps: Array<[string, string, any]> = [
    ['POST', `${BASE}/outbox/${ev3.id}/requeue`, { reason: 'motivo suficientemente longo' }], ['POST', `${BASE}/outbox/${ev3.id}/dismiss`, { reason: 'motivo suficientemente longo' }],
    ['POST', `${BASE}/repair-missing`, {}], ['POST', `${BASE}/findings/x/acknowledge`, { note: 'nota suficientemente longa' }],
    ['POST', `${BASE}/chargeback-decisions/x/approve`, {}], ['POST', `${BASE}/chargeback-decisions/x/reject`, { reason: 'motivo suficientemente longo' }],
    ['POST', `${BASE}/chargeback-allocations/x/settlements`, {}], ['POST', `${BASE}/shipping-reversals`, {}],
  ];
  const adminDenied = await Promise.all(['FINANCE', 'RISK_ANALYST', 'SUPPORT'].flatMap((r) => adminOps.map(([m, u, b]) => call(m, u, b, T[r]))));
  report('P4 as 8 ações sensíveis (recolocar, descartar, reparar, reconhecer, aprovar, rejeitar, recuperação/baixa, reversão de frete) = 403 para FINANCE, RISK_ANALYST e SUPPORT — só GLOBAL_ADMIN', adminDenied.every((r) => r.status === 403 && r.json?.error?.code === 'LEDGER_ADMIN_REQUIRED'), adminDenied.map((r) => [r.status, r.json?.error?.code]));
  const evOpen = await call('POST', `${BASE}/chargebacks/${cb4}/evidence`, { kind: 'X', description: 'tentativa de evidência por perfil sem permissão' }, T.SUPPORT);
  report('P5 evidência e proposta de chargeback exigem FINANCE/RISK_ANALYST/GLOBAL_ADMIN: SUPPORT = 403', evOpen.status === 403);

  // ================================================================================================================================================
  // Q) consultas
  // ================================================================================================================================================
  const sum = await call('GET', `${BASE}/summary`, undefined, T.FINANCE);
  report('Q1 resumo: totais de lançamentos/partidas/contas, saldo líquido do ledger = 0, lançamentos por tipo e estado, métricas do outbox e da reconciliação, chargebacks pendentes e reversões', sum.status === 200 && sum.json.data.totals.transactions > 0 && Number(sum.json.data.imbalanceNet) === 0 && Array.isArray(sum.json.data.transactionsByTypeAndStatus) && sum.json.data.outbox && sum.json.data.reconciliation && sum.json.data.chargebacks.pending_decision >= 1 && typeof sum.json.data.shippingCostReversals === 'number', sum.json);
  const list1 = await call('GET', `${BASE}/transactions?orderId=${p1.orderId}`, undefined, T.RISK_ANALYST);
  const types1 = list1.json.data.items.map((t: any) => t.type).sort().join();
  const byType = await call('GET', `${BASE}/transactions?type=ORDER_DELIVERY_CONFIRMED&limit=2`, undefined, T.FINANCE);
  const byId = await call('GET', `${BASE}/transactions?id=${encodeURIComponent('payment_received:' + p1.orderId)}`, undefined, T.FINANCE);
  const byPeriod = await call('GET', `${BASE}/transactions?from=2000-01-01&to=2000-12-31`, undefined, T.FINANCE);
  const byPeriod2 = await call('GET', `${BASE}/transactions?orderId=${p1.orderId}&from=${new Date(Date.now() - 86400_000).toISOString()}&to=${new Date(Date.now() + 86400_000).toISOString()}`, undefined, T.FINANCE);
  report('Q2 lançamentos: filtro por pedido (PR + DC do pedido liberado), por tipo (com paginação), por identificador (id ou chave de idempotência) e por período (fora do período = vazio)', types1 === 'ORDER_DELIVERY_CONFIRMED,PAYMENT_RECEIVED' && byType.json.data.items.every((t: any) => t.type === 'ORDER_DELIVERY_CONFIRMED') && byType.json.data.limit === 2 && byId.json.data.total === 1 && byPeriod.json.data.total === 0 && byPeriod2.json.data.total === 2, { types1, byId: byId.json.data.total, byPeriod: byPeriod.json.data.total, byPeriod2: byPeriod2.json.data.total });
  const txId = list1.json.data.items.find((t: any) => t.type === 'ORDER_DELIVERY_CONFIRMED').id;
  const det = await call('GET', `${BASE}/transactions/${txId}`, undefined, T.FINANCE);
  report('Q3 detalhe do lançamento com as partidas de débito e crédito (conta, parte, valor, dimensões) e o fechamento: total de débitos = total de créditos', det.status === 200 && det.json.data.entries.length >= 3 && det.json.data.totals.balanced === true && det.json.data.totals.debit === det.json.data.totals.credit && det.json.data.entries.every((e: any) => e.account_code && (e.direction === 'DEBIT' || e.direction === 'CREDIT')), det.json.data?.totals);
  const evl = await call('GET', `${BASE}/outbox?status=RETRYING`, undefined, T.FINANCE); const evd = await call('GET', `${BASE}/outbox/${ev3.id}`, undefined, T.FINANCE);
  const evt = await call('GET', `${BASE}/outbox?type=PAYMENT_RECEIVED&orderId=${p3.orderId}`, undefined, T.FINANCE);
  report('Q4 outbox: filtro por estado (RETRYING), por tipo+pedido; detalhe com tentativas, erro, snapshot e auditoria', evl.json.data.items.some((e: any) => e.id === ev3.id) && evt.json.data.total === 1 && evd.status === 200 && evd.json.data.event.status === 'RETRYING' && evd.json.data.event.attempts === 1 && evd.json.data.event.snapshot_json && Array.isArray(evd.json.data.audit), evd.json.data?.event);
  const fl = await call('GET', `${BASE}/findings?status=OPEN`, undefined, T.FINANCE);
  const fOrder = fl.json.data.items.find((f: any) => f.order_id === p2.orderId);
  const fd = fOrder ? await call('GET', `${BASE}/findings/${fOrder.id}`, undefined, T.FINANCE) : null;
  const fsev = await call('GET', `${BASE}/findings?severity=CRITICAL&type=${fOrder?.finding_type ?? 'x'}`, undefined, T.FINANCE);
  report('Q5 divergências: lista com filtros (estado, severidade, tipo) ordenada por gravidade; detalhe com o achado, o pedido, os lançamentos e eventos do pedido e a auditoria — o suficiente para investigar', !!fOrder && fd!.status === 200 && fd!.json.data.finding.id === fOrder.id && fd!.json.data.order.id === p2.orderId && Array.isArray(fd!.json.data.transactions) && Array.isArray(fd!.json.data.events) && fsev.status === 200, { fOrder, fd: fd?.status });
  const cbl = await call('GET', `${BASE}/chargebacks?localStatus=lost`, undefined, T.RISK_ANALYST); const cbd = await call('GET', `${BASE}/chargebacks/${cb4}`, undefined, T.FINANCE);
  const rawKeys = JSON.stringify(cbd.json).match(/provider_raw_response|providerRawResponse|first_seen_event|last_seen_event|password|secret|token/gi);
  report('Q6 chargebacks: lista por estado; detalhe com alocações (estágio, líquido do pedido, lançamento), evidências, decisões com linhas e recuperações — SEM o payload bruto do provedor nem ids de webhook', cbl.json.data.items.some((c: any) => c.id === cb4) && cbd.status === 200 && cbd.json.data.allocations.length === 1 && cbd.json.data.allocations[0].release_stage === 'AFTER_RELEASE' && cbd.json.data.allocations[0].seller_net_amount && cbd.json.data.allocations[0].confirmed_transaction_id && Array.isArray(cbd.json.data.evidence) && Array.isArray(cbd.json.data.decisions) && !rawKeys, { rawKeys });
  const hostile = await call('GET', `${BASE}/transactions?orderId=${encodeURIComponent("x' OR '1'='1")}&limit=99999&offset=-5&from=lixo&type=${encodeURIComponent('A;DROP TABLE ledger_entries')}`, undefined, T.FINANCE);
  report('Q7 entradas hostis: SQL injection em filtros não retorna nada nem quebra; limit absurdo é limitado a 100; offset negativo e data inválida são normalizados/ignorados', hostile.status === 200 && hostile.json.data.total === 0 && hostile.json.data.limit === 100 && hostile.json.data.offset === 0 && (await q('select count(*)::int n from ledger_entries'))[0].n === ledgerRows0.e);

  // ================================================================================================================================================
  // R) nenhuma rota altera lançamentos
  // ================================================================================================================================================
  const mut = await Promise.all([['POST', `${BASE}/transactions`], ['PUT', `${BASE}/transactions/${txId}`], ['PATCH', `${BASE}/transactions/${txId}`], ['DELETE', `${BASE}/transactions/${txId}`], ['DELETE', `${BASE}/outbox/${ev3.id}`], ['PUT', `${BASE}/chargebacks/${cb4}`], ['DELETE', `${BASE}/chargebacks/${cb4}`]].map(([m, u]) => call(m, u, { type: 'X' }, T.ADMIN2)));
  const ledgerNow = (await q(`select (select count(*)::int from ledger_transactions) t, (select count(*)::int from ledger_entries) e, (select md5(coalesce(string_agg(id||status||type,'|' order by id),'')) from ledger_transactions) h`))[0];
  report('R1 não existe NENHUMA rota para criar/editar/apagar lançamentos, eventos ou chargebacks (POST/PUT/PATCH/DELETE = 404), nem para o GLOBAL_ADMIN; o ledger permanece idêntico', mut.every((r) => r.status === 404) && JSON.stringify(ledgerNow) === JSON.stringify(ledgerRows0), { mut: mut.map((r) => r.status) });

  // ================================================================================================================================================
  // S) ações sobre o outbox / reconciliação (serviços existentes)
  // ================================================================================================================================================
  const dry = await call('POST', `${BASE}/repair-missing`, {}, T.ADMIN2);
  const cand = dry.json.data.candidates.find((c: any) => c.orderId === p2.orderId);
  const noConfirm = await call('POST', `${BASE}/repair-missing`, { apply: true }, T.ADMIN2);
  const evCountBefore = (await q('select count(*)::int n from ledger_outbox_events where order_id=$1', [p2.orderId]))[0].n;
  report('S1 reparo manual: sem apply é SIMULAÇÃO (lista o candidato e não escreve nada); apply sem confirm:true é recusado (CONFIRMATION_REQUIRED)', dry.status === 200 && dry.json.data.dryRun === true && !!cand && cand.eventType === 'PAYMENT_RECEIVED' && dry.json.data.enqueued === 0 && noConfirm.status === 400 && noConfirm.json.error.code === 'CONFIRMATION_REQUIRED' && evCountBefore === 0, { dry: dry.json.data, noConfirm: noConfirm.json });
  const applied = await Promise.all([1, 2, 3].map(() => call('POST', `${BASE}/repair-missing`, { apply: true, confirm: true }, T.ADMIN2)));
  await runLedgerOutboxOnce({ workerId: 'w-e6' });
  const applied2 = await call('POST', `${BASE}/repair-missing`, { apply: true, confirm: true }, T.ADMIN2);
  const audRepair = (await q(`select actor_user_id from audit_logs where action='ledger.outbox.repair_missing_events' order by created_at desc limit 1`))[0];
  report('S2 reparo aplicado (3 chamadas simultâneas): o evento do pedido é criado UMA vez (chave única), o worker o lança; repetir não cria mais nada; auditado com o ator autenticado — sem segunda lógica de reparo', applied.every((r) => r.status === 200) && (await q('select count(*)::int n from ledger_outbox_events where order_id=$1', [p2.orderId]))[0].n === 1 && (await q(`select status from ledger_outbox_events where order_id=$1`, [p2.orderId]))[0].status === 'DONE' && applied2.json.data.candidates.every((c: any) => c.orderId !== p2.orderId) && audRepair?.actor_user_id === U.ADMIN2, { applied: applied.map((r) => r.json.data?.enqueued), audRepair });
  const rShort = await call('POST', `${BASE}/outbox/${ev3.id}/requeue`, { reason: 'curto' }, T.ADMIN2);
  const rOk = await call('POST', `${BASE}/outbox/${ev3.id}/requeue`, { reason: 'ledger voltou; recolocando o evento na fila' }, T.ADMIN2);
  const rEv = (await q(`select status, attempts from ledger_outbox_events where id=$1`, [ev3.id]))[0];
  await runLedgerOutboxOnce({ workerId: 'w-e6b' });
  const dDone = await call('POST', `${BASE}/outbox/${ev3.id}/dismiss`, { reason: 'tentando descartar um evento já concluído' }, T.ADMIN2);
  const nf = await call('POST', `${BASE}/outbox/lob_inexistente/requeue`, { reason: 'evento inexistente para teste' }, T.ADMIN2);
  report('S3 recolocar na fila: motivo curto = 400; válido recoloca (PENDING, 0 tentativas) e o worker conclui; descartar um evento DONE = 409 (INVALID_STATE); evento inexistente = 404', rShort.status === 400 && rOk.status === 200 && rEv.status === 'PENDING' && rEv.attempts === 0 && dDone.status === 409 && nf.status === 404, { rShort: rShort.status, rOk: rOk.status, rEv, dDone: dDone.status, nf: nf.status });
  const disOk = await call('POST', `${BASE}/outbox/${ev7.id}/dismiss`, { reason: 'descartado no teste: pedido de fixture' }, T.ADMIN2);
  const disAgain = await call('POST', `${BASE}/outbox/${ev7.id}/dismiss`, { reason: 'descartado no teste: pedido de fixture' }, T.ADMIN2);
  report('S4 descartar evento: GLOBAL_ADMIN com motivo = 200 (DISMISSED, auditado); repetir = 409; a lacuna contábil continua visível para a reconciliação', disOk.status === 200 && disAgain.status === 409 && (await q(`select status from ledger_outbox_events where id=$1`, [ev7.id]))[0].status === 'DISMISSED' && (await q(`select count(*)::int n from audit_logs where action='ledger.outbox.dismiss' and resource_id=$1`, [ev7.id]))[0].n === 1, { disOk: disOk.status, disAgain: disAgain.status });
  await runLedgerReconciliation({ triggeredBy: 'e6-test2', now: new Date(Date.now() + 7200_000) });
  const open2 = (await call('GET', `${BASE}/findings?status=OPEN&orderId=${p7.orderId}`, undefined, T.FINANCE)).json.data.items[0];
  const ackShort = await call('POST', `${BASE}/findings/${open2.id}/acknowledge`, { note: 'curta' }, T.ADMIN2);
  const ackOk = await call('POST', `${BASE}/findings/${open2.id}/acknowledge`, { note: 'reconhecida: lacuna conhecida do pedido de fixture' }, T.ADMIN2);
  const ackAgain = await call('POST', `${BASE}/findings/${open2.id}/acknowledge`, { note: 'reconhecida: lacuna conhecida do pedido de fixture' }, T.ADMIN2);
  report('S5 reconhecer divergência: nota curta = 400; válida = ACKNOWLEDGED (continua VISÍVEL, com autor e nota, auditada); repetir = 409', ackShort.status === 400 && ackOk.status === 200 && ackAgain.status === 409 && (await q(`select status, acknowledged_by from ledger_reconciliation_findings where id=$1`, [open2.id]))[0].acknowledged_by === U.ADMIN2, { ackShort: ackShort.status, ackOk: ackOk.status, ackAgain: ackAgain.status });

  // ================================================================================================================================================
  // T) chargeback: evidência → proposta → aprovação (≠ proponente) → recuperação, com o teto N
  // ================================================================================================================================================
  const evR = await call('POST', `${BASE}/chargebacks/${cb4}/evidence`, { kind: 'PROOF_OF_DELIVERY', description: 'Comprovante de entrega assinado pelo comprador (cópia do rastreio).', fileRef: 's3://evidencias/pod.pdf', sha256: 'b'.repeat(64), actorUserId: U.GLOBAL_ADMIN, addedBy: U.GLOBAL_ADMIN }, T.FINANCE);
  const evRow = (await q(`select added_by, added_by_role from chargeback_evidence where id=$1`, [evR.json?.data?.evidenceId]))[0];
  const noEvidence = await call('POST', `${BASE}/chargebacks/${cb4}/evidence`, { kind: 'X', description: 'curta' }, T.FINANCE);
  report('T1 evidência (FINANCE): criada com o ator = usuário AUTENTICADO (actorUserId do corpo é ignorado) e papel registrado; descrição curta = 400', evR.status === 201 && evRow?.added_by === U.FINANCE && evRow?.added_by_role === 'FINANCE' && noEvidence.status === 400, { evR: evR.status, evRow });
  const alloc4 = (await q('select id, order_id from chargeback_allocations where chargeback_id=$1', [cb4]))[0];
  const net4 = Number((await q('select seller_net_amount from orders where id=$1', [alloc4.order_id]))[0].seller_net_amount); const tot4 = Number((await q('select total_amount from orders where id=$1', [alloc4.order_id]))[0].total_amount);
  const propBody = (seller: number) => ({ causeCode: 'SELLER_FAULT', rationale: 'Análise das evidências: entrega comprovada pelo rastreio, mas o produto divergiu do anúncio conforme mensagens do comprador; vendedor ouvido.', partiesHeard: 'Vendedor ouvido em 18/10 por e-mail; comprador por chat.', evidenceIds: [evR.json.data.evidenceId], lines: [{ orderId: alloc4.order_id, partyType: 'SELLER', amount: seller }, { orderId: alloc4.order_id, partyType: 'NUSALI', amount: tot4 - seller }] });
  const overCap = await call('POST', `${BASE}/chargebacks/${cb4}/decisions`, propBody(net4 + 1), T.FINANCE);
  const proposed = await call('POST', `${BASE}/chargebacks/${cb4}/decisions`, propBody(net4), T.FINANCE);
  const decId = proposed.json?.data?.decisionId;
  report('T2 proposta (FINANCE): acima do líquido N do vendedor = 409 SELLER_CAP_EXCEEDED; exatamente N com o restante explícito para a Nusali = 201 (PROPOSED, v1) — o teto e a fundamentação continuam sendo regras do serviço', overCap.status === 409 && overCap.json.error.code === 'SELLER_CAP_EXCEEDED' && proposed.status === 201 && proposed.json.data.version === 1 && !!decId, { overCap: overCap.json, proposed: proposed.json });
  const apvFinance = await call('POST', `${BASE}/chargeback-decisions/${decId}/approve`, {}, T.FINANCE);
  const apvs = await Promise.all([call('POST', `${BASE}/chargeback-decisions/${decId}/approve`, {}, T.GLOBAL_ADMIN), call('POST', `${BASE}/chargeback-decisions/${decId}/approve`, {}, T.ADMIN2)]);
  const okN = apvs.filter((r) => r.status === 200).length; const conflict = apvs.filter((r) => r.status === 409).length;
  const recvSeller = (await q(`select coalesce(sum(case when e.direction='DEBIT' then e.amount else -e.amount end),0)::numeric s from ledger_entries e join ledger_accounts a on a.id=e.account_id where e.order_id=$1 and a.code='CHARGEBACK_RECEIVABLE' and e.dimensions->>'debtor'='SELLER'`, [alloc4.order_id]))[0].s;
  report('T3 aprovação: FINANCE = 403; duas aprovações simultâneas de GLOBAL_ADMIN (≠ proponente) = exatamente 1 vale (200) e a outra 409; lançamento do recebível do vendedor = N; nenhuma carteira real debitada', apvFinance.status === 403 && okN === 1 && conflict === 1 && Number(recvSeller) === net4 && JSON.stringify(await moneyHash()) === JSON.stringify(money0), { apvFinance: apvFinance.status, apvs: apvs.map((r) => r.status), recvSeller });
  const selfProp = await call('POST', `${BASE}/chargebacks/${cb4}/decisions`, { ...propBody(net4), revisionReason: 'revisão de teste para o quatro olhos' }, T.GLOBAL_ADMIN);
  const selfDecId = selfProp.json?.data?.decisionId;
  const selfApprove = selfDecId ? await call('POST', `${BASE}/chargeback-decisions/${selfDecId}/approve`, {}, T.GLOBAL_ADMIN) : null;
  const rej = selfDecId ? await call('POST', `${BASE}/chargeback-decisions/${selfDecId}/reject`, { reason: 'rejeitada no teste: apenas verificação do quatro olhos' }, T.ADMIN2) : null;
  report('T4 quatro olhos pela API: o GLOBAL_ADMIN que propõe NÃO aprova a própria proposta (403 FOUR_EYES); outro GLOBAL_ADMIN rejeita (200, REJECTED) — histórico preservado', selfProp.status === 201 && selfApprove?.status === 403 && selfApprove.json.error.code === 'FOUR_EYES' && rej?.status === 200 && (await q(`select status from chargeback_decisions where id=$1`, [selfDecId]))[0].status === 'REJECTED', { selfProp: selfProp.json, selfApprove: selfApprove?.json });
  const detAfter = await call('GET', `${BASE}/chargebacks/${cb4}`, undefined, T.FINANCE);
  const setNoThird = await call('POST', `${BASE}/chargeback-allocations/${alloc4.id}/settlements`, { kind: 'RECOVERY', partyRef: 'transp-x', amount: 10, evidenceRef: 'COMPROVANTE-9', reason: 'sem recebível de terceiro na decisão', idempotencyKey: 'e6:set:1' }, T.GLOBAL_ADMIN);
  const setBadKind = await call('POST', `${BASE}/chargeback-allocations/${alloc4.id}/settlements`, { kind: 'COBRAR_VENDEDOR', partyRef: 'x', amount: 10, evidenceRef: 'COMPROVANTE-9', reason: 'tipo inválido', idempotencyKey: 'e6:set:2' }, T.GLOBAL_ADMIN);
  report('T5 detalhe após a decisão mostra v1 APPROVED com linhas e fundamentação; "recuperação" do vendedor pela API é recusada (409 NO_THIRD_PARTY_RECEIVABLE — a cobrança por carteira não existe) e tipo inválido = 400', detAfter.json.data.decisions.some((d: any) => d.status === 'APPROVED' && d.lines.length === 2 && d.rationale) && detAfter.json.data.decisions.some((d: any) => d.status === 'REJECTED') && setNoThird.status === 409 && setNoThird.json.error.code === 'NO_THIRD_PARTY_RECEIVABLE' && setBadKind.status === 400, { setNoThird: setNoThird.json, setBadKind: setBadKind.json });

  // ================================================================================================================================================
  // U) reversão de custo de frete (E4) pela API
  // ================================================================================================================================================
  const revBody = (amount: number, key: string, extra: any = {}) => ({ orderId: p5.orderId, amount, evidenceRef: 'PROTOCOLO-TRANSP-123', reason: 'transportadora devolveu parte do custo de frete', idempotencyKey: key, ...extra });
  const revNoEv = await call('POST', `${BASE}/shipping-reversals`, revBody(100, 'e6:rev:0', { evidenceRef: '' }), T.GLOBAL_ADMIN);
  const revBefore = await call('POST', `${BASE}/shipping-reversals`, { ...revBody(100, 'e6:rev:b'), orderId: p6.orderId }, T.GLOBAL_ADMIN);
  const revPar = await Promise.all([1, 2, 3].map(() => call('POST', `${BASE}/shipping-reversals`, revBody(400, 'e6:rev:1'), T.GLOBAL_ADMIN)));
  const revOver = await call('POST', `${BASE}/shipping-reversals`, revBody(5000, 'e6:rev:2'), T.GLOBAL_ADMIN);
  const created = revPar.filter((r) => r.status === 201).length; const replay = revPar.filter((r) => r.status === 200 && r.json.data.alreadyRecorded === true).length;
  await runLedgerOutboxOnce({ workerId: 'w-e6c' });
  const revList = await call('GET', `${BASE}/shipping-reversals?orderId=${p5.orderId}`, undefined, T.FINANCE);
  report('U1 reversão de frete: sem evidência = 400; pedido reembolsado ANTES da liberação = 409; 3 chamadas simultâneas com a mesma chave = 1 criada (201) + replays (200), 1 só registro e 1 lançamento; acima do custo = 409; ator = autenticado; consulta lista o registro', revNoEv.status === 400 && revBefore.status === 409 && created === 1 && replay === 2 && revOver.status === 409 && revList.json.data.total === 1 && (await q(`select count(*)::int n from ledger_transactions where type='SHIPPING_COST_REVERSED' and order_id=$1`, [p5.orderId]))[0].n === 1 && (await q(`select performed_by from shipping_cost_reversals where order_id=$1`, [p5.orderId]))[0].performed_by === U.GLOBAL_ADMIN, { revNoEv: revNoEv.json, revBefore: revBefore.json, statuses: revPar.map((r) => r.status), revOver: revOver.json });

  // ================================================================================================================================================
  // V) integridade geral
  // ================================================================================================================================================
  const final = (await q(`select (select count(*)::int from ledger_entries where false) z, coalesce(sum(case when direction='DEBIT' then amount else -amount end),0)::numeric s from ledger_entries`))[0];
  const secrets = JSON.stringify([sum.json, list1.json, det.json, evd.json, fd?.json, cbd.json, revList.json]).match(/password_hash|passwordHash|"token"|api[_-]?key|authorization|provider_raw_response|refresh/gi);
  report('V1 o ledger continua balanceado (Σ débitos − créditos = 0) e NENHUMA resposta contém segredos, hashes de senha, tokens ou payload bruto do provedor', Number(final.s) === 0 && !secrets, { secrets, s: final.s });
  const moneyEnd = await moneyHash();
  report('V2 DINHEIRO REAL intacto por todas as consultas e ações administrativas: carteiras, Escrow, pagamentos, pedidos e reembolsos têm hash idêntico', JSON.stringify(moneyEnd) === JSON.stringify(money0), { money0, moneyEnd });
  const aud = (await q(`select count(*)::int n, count(distinct actor_user_id)::int a from audit_logs where action like 'ledger.%'`))[0];
  report('V3 auditoria: as ações administrativas ficaram em audit_logs com o ator autenticado (nunca o informado no corpo)', aud.n >= 8 && aud.a >= 2, aud);

  server.close(); await pool.end();
  console.log(`\n${passed}/${total} testes passaram.`);
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
