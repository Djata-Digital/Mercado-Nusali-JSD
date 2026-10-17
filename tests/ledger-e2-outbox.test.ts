/**
 * LEDGER SOMBRA — E2: OUTBOX TRANSACIONAL + PROCESSADOR IDEMPOTENTE + RECONCILIAÇÃO. Postgres DESCARTAVEL com os serviços reais (pedido → pagamento do grupo →
 * liberação do Escrow → outbox → ledger). Cada falha é injetada de verdade (stub do ledger com SQLSTATE real, tabela renomeada, transação interrompida, worker
 * que "cai" com o lease vencendo). Prova também que NENHUM saldo real muda por causa do worker, da reconciliação ou do reparo. Nunca produção.
 */
import { ledgerTestDbUrl } from './support/ledgerE2Env.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import { purchaseGroups, payments, paymentAttempts, coupons, categories, orders as ordersTable } from '../src/db/schema.js';
import { OrderService } from '../src/server/modules/orders/orderService.js';
import { PaymentService } from '../src/server/modules/payments/paymentService.js';
import { FinancialLedgerService } from '../src/server/modules/ledger/financialLedgerService.js';
import { stageLedgerEventsInTx } from '../src/server/modules/ledger/outbox/ledgerShadowHooks.js';
import {
  enqueueLedgerEvent, runLedgerOutboxOnce, claimEvents, processClaimedEvent, getOutboxMetrics, requeueOutboxEvent, dismissOutboxEvent, OutboxAdminError,
} from '../src/server/modules/ledger/outbox/outboxService.js';
import { runLedgerReconciliation, repairMissingEvents, acknowledgeFinding, getReconciliationMetrics } from '../src/server/modules/ledger/outbox/reconciliationService.js';
import { computeBackoffSeconds, classifyProcessingError, resolvePolicy, buildOrderSnapshot, hashSnapshot, keyFor, mapLedgerResult } from '../src/server/modules/ledger/outbox/outboxEvents.js';
import { resolveCartShippingPreview } from '../src/server/modules/shipping/shippingPreviewService.js';
import { logger } from '../src/server/infra/logger.js';
import { getDb } from '../src/db/index.js';
import { setupCheckoutKit } from './support/checkoutTestKit.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 900)}`); };
const c = (n: any) => Math.round(Number(n) * 100);
const HOUR = 3600_000;

/** Observa (sem silenciar) os logs error/warn do logger real durante `fn`. */
async function capture<T>(fn: () => Promise<T>): Promise<{ value: T; errors: string[]; infos: any[] }> {
  const errors: string[] = []; const infos: any[] = []; const l: any = logger; const o = { error: l.error, warn: l.warn, info: l.info };
  const wrap = (orig: any, sink?: 'err') => function (this: any, ...a: any[]) { if (sink) errors.push((typeof a[1] === 'string' ? [a[1], JSON.stringify(a[0])] : a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x)))).join(' ').slice(0, 400)); else infos.push(a[0]); return orig.apply(this, a); };
  l.error = wrap(o.error, 'err'); l.warn = wrap(o.warn, 'err'); l.info = wrap(o.info);
  try { return { value: await fn(), errors, infos }; } finally { l.error = o.error; l.warn = o.warn; l.info = o.info; }
}
const outboxErrors = (e: string[]) => e.filter((x) => /LedgerOutbox|LedgerReconciliation|LedgerShadow|ShadowLedger|FinancialLedgerService/i.test(x));
const pgErr = (code: string, msg = 'simulated') => Object.assign(new Error(msg), { cause: { code } });

async function main() {
  const pool = new pg.Pool({ connectionString: ledgerTestDbUrl, ssl: { rejectUnauthorized: false }, max: 20 });
  const db = drizzle(pool, { schema });
  const q = async (sqlText: string, p: any[] = []) => (await pool.query(sqlText, p)).rows;

  // ---- migração 0039 (a mesma do repositório) aplicada no banco descartável se ainda não existir
  if (!(await q(`select to_regclass('public.ledger_outbox_events') t`))[0].t) {
    for (const stmt of fs.readFileSync(path.join(root, 'drizzle/0039_ledger_outbox.sql'), 'utf8').split('--> statement-breakpoint')) if (stmt.trim()) await pool.query(stmt);
  }
  const kit = await setupCheckoutKit(db, 'e2');
  await kit.setFlag('multiSellerCheckoutEnabled', true); await kit.setFlag('defaultShippingPolicyMode', 'CUSTOMER_PAYS');
  await kit.setFlag('shippingNusaliSubsidy', { enabled: false, percent: 0, rules: { 'GW:STANDARD': { enabled: true, percent: 50 } } });
  const bissau = await kit.sector('Bissau'); const std = await kit.service('STANDARD');
  const sectors: any[] = (await db.select().from(schema.shippingSectors)).filter((x: any) => x.countryCode === 'GW' && x.id !== bissau.id).sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
  let ns = 0;
  const admin = await kit.makeUser('GLOBAL_ADMIN'); const plain = await kit.makeUser('SUPPORT');

  const shop = async (label: string) => {
    const sector = sectors[ns++ % sectors.length]; const seller = await kit.makeSeller(label); const store = await kit.makeStore(seller, label, sector.id);
    const product = await kit.makeProduct(seller, store.storeId, `P ${label}`, 0.3, 5000);
    await kit.insertInventory({ sellerId: seller.sellerId, productId: product.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: store.floc.id, quantityOnHand: 5000 });
    await kit.insertRate((await kit.route(sector.id, bissau.id)).id, std.id, 1000, { min: 0, max: 10 });
    return { seller, store, product, price: 5000 };
  };
  const addCoupon = async (s: any, code: string, pct: number) => db.insert(coupons).values({ id: kit.uid('coup'), code, title: 'T', sellerId: s.seller.sellerId, storeId: s.store.storeId, discountType: 'PERCENTAGE', discountValue: String(pct), currency: 'XOF', minimumSpend: '0.00', maxDiscount: null, usageLimit: null, usageLimitPerUser: null, usageCount: 0, isActive: true, createdAt: new Date(), updatedAt: new Date() } as any);
  const place = async (shops: any[], extra: Record<string, any> = {}) => {
    const buyer = await kit.makeBuyer(bissau.id); for (const s of shops) await kit.addToCart(buyer.cartId, s.product.id, 1, s.price);
    const qq: any = await resolveCartShippingPreview({ destinationShippingSectorId: bissau.id, serviceCode: 'STANDARD', items: shops.map((s) => ({ productId: s.product.id, variantId: null, quantity: 1 })) }, db);
    const opt = qq.services?.find((o: any) => o.code === 'STANDARD') ?? qq;
    const v: any = await OrderService.createOrderFromCart({ userId: buyer.buyerId, addressId: buyer.addressId, paymentMethod: 'pix', shippingSelection: { serviceCode: 'STANDARD', expectedShippingChargedToBuyer: opt.shippingChargedToBuyer }, ...extra } as any, db);
    return { buyer, value: v, orderIds: v.orders.map((o: any) => o.id) as string[] };
  };
  const newPay = async (placed: any) => {
    const groupId = placed.value.purchaseGroup.id; const [g] = await db.select().from(purchaseGroups).where(eq(purchaseGroups.id, groupId));
    const payId = kit.uid('pay_group'), ext = kit.uid('EXT');
    await db.insert(payments).values({ id: payId, orderId: null, purchaseGroupId: groupId, settlementRole: 'candidate', buyerId: placed.buyer.buyerId, amount: String(g.totalAmount), currency: 'XOF', provider: 'asaas', method: 'pix', status: 'pending', idempotencyKey: `asaas_pix_group:${groupId}:${payId}`, transactionRef: ext, createdAt: new Date(), updatedAt: new Date() } as any);
    await db.insert(paymentAttempts).values({ id: kit.uid('att'), paymentId: payId, provider: 'asaas', status: 'reserved', createdAt: new Date() } as any);
    return { groupId, payId, ext, total: Number(g.totalAmount) };
  };
  const confirm = (p: any) => PaymentService.confirmPurchaseGroupPayment(p.groupId, p.payId, { provider: 'asaas', transactionRef: p.ext, receivedValue: p.total });
  const pay = async (placed: any) => { const p = await newPay(placed); await confirm(p); return p; };
  const release = async (orderId: string, buyerId: string) => { await db.update(schema.shipments).set({ status: 'DELIVERED' } as any).where(eq(schema.shipments.orderId, orderId)); return PaymentService.releaseEscrowForOrder(orderId, { performedBy: buyerId }); };
  const orderRow = async (id: string) => (await db.select().from(ordersTable).where(eq(ordersTable.id, id)))[0];
  const evs = async (orderId: string) => q(`select id, event_type, status, attempts, max_attempts, last_error_code, last_error, ledger_transaction_id, snapshot_hash, correlation_id, source, extract(epoch from (next_attempt_at - last_attempt_at))::int as delay_s from ledger_outbox_events where order_id=$1 order by event_type`, [orderId]);
  const ledger = async (orderId: string) => {
    const t = await q('select id, type, status, correlation_id from ledger_transactions where order_id=$1 order by type', [orderId]);
    const e = await q(`select a.code, e.direction, e.amount::numeric as amount from ledger_entries e join ledger_transactions t on t.id=e.transaction_id join ledger_accounts a on a.id=e.account_id where t.order_id=$1`, [orderId]);
    const bal: Record<string, number> = {}; for (const r of e) bal[r.code] = (bal[r.code] || 0) + (r.direction === 'CREDIT' ? 1 : -1) * c(r.amount);
    return { txs: t, types: t.map((x: any) => x.type), bal };
  };
  const moneyHash = async () => (await q(`select
    (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from wallets x) w, (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from wallet_transactions x) wt,
    (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from escrow_accounts x) esc, (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from escrow_transactions x) etx,
    (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from payments x) pay, (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from orders x) ord,
    (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from refunds x) ref`))[0];
  const withStub = async (code: string | null, fn: () => Promise<any>, which: Array<'recordPaymentReceived' | 'recordDeliveryConfirmed'> = ['recordPaymentReceived', 'recordDeliveryConfirmed']) => {
    const orig: any = {}; for (const w of which) { orig[w] = (FinancialLedgerService as any)[w]; (FinancialLedgerService as any)[w] = async () => { throw code ? pgErr(code, 'conexão perdida (simulada)') : new Error('ledger down (simulado)'); }; }
    try { return await fn(); } finally { for (const w of which) (FinancialLedgerService as any)[w] = orig[w]; }
  };
  /** pedido(s) PAGO(S) sem evento e sem lançamento (outbox desligado + ledger direto indisponível durante a confirmação) */
  const payQuietly = async (placed: any) => {
    const p = await newPay(placed); const prev = process.env.LEDGER_OUTBOX_ENABLED; process.env.LEDGER_OUTBOX_ENABLED = 'false';
    try { await withStub(null, () => confirm(p), ['recordPaymentReceived']); } finally { process.env.LEDGER_OUTBOX_ENABLED = prev; }
    return p;
  };
  const stage = async (orderIds: string[], type: 'PAYMENT_RECEIVED' | 'ORDER_DELIVERY_CONFIRMED' = 'PAYMENT_RECEIVED') => {
    const items = []; for (const id of orderIds) items.push({ eventType: type, order: (await orderRow(id)) as any, occurredAt: new Date(), source: 'test' });
    return db.transaction(async (tx: any) => stageLedgerEventsInTx(tx, items));
  };

  const shopA = await shop('a'), shopB = await shop('b'), shopC = await shop('c'); await addCoupon(shopA, 'DEZ', 10);

  // ================================================================================================================================================
  // A) funções puras
  // ================================================================================================================================================
  const pol = resolvePolicy({});
  const d = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => computeBackoffSeconds(n, pol, () => 0.5));
  report('A1 backoff: 30s, 120s, 480s, 1920s, 7680s→teto 21600 (6h), nunca decresce, jitter limitado a ±10%', d[0] === 30 && d[1] === 120 && d[2] === 480 && d[3] === 1920 && d[4] === 7680 && d[5] === 21600 && d[7] === 21600 && d.every((x, i) => i === 0 || x >= d[i - 1]) && computeBackoffSeconds(1, pol, () => 0) === 27 && computeBackoffSeconds(1, pol, () => 1) === 33, d);
  report('A2 classificação: 57P01/08006/40P01/ECONNRESET/timeout/desconhecido = recuperável; LEDGER_UNBALANCED, 23505 de outra constraint, 42P01 = permanente', ['57P01', '08006', '40P01', '53300'].every((cd) => classifyProcessingError(pgErr(cd)).kind === 'TRANSIENT') && classifyProcessingError(Object.assign(new Error('x'), { code: 'ECONNRESET' })).kind === 'TRANSIENT' && classifyProcessingError(new Error('Connection terminated unexpectedly')).kind === 'TRANSIENT' && classifyProcessingError(new Error('???')).kind === 'TRANSIENT' && classifyProcessingError(new Error('LEDGER_UNBALANCED: x')).kind === 'PERMANENT' && classifyProcessingError(pgErr('23505')).kind === 'PERMANENT' && classifyProcessingError(pgErr('42P01')).kind === 'PERMANENT');
  report('A3 chaves determinísticas = as do ledger; snapshot canônico e hash estável (ordem das chaves irrelevante)', keyFor('PAYMENT_RECEIVED', 'o1') === 'payment_received:o1' && keyFor('ORDER_DELIVERY_CONFIRMED', 'o1') === 'order_release:o1' && hashSnapshot({ a: '1', b: '2' }) === hashSnapshot({ b: '2', a: '1' }) && hashSnapshot({ a: '1' }) !== hashSnapshot({ a: '2' }) && hashSnapshot({ a: '1' }).length === 64);
  report('A4 mapeamento do resultado do ledger: posted/replay→DONE; LEGACY→SKIPPED; DISABLED→DEFER; INVALID/MISSING_SNAPSHOT→PERMANENT; DATABASE_UNAVAILABLE→RETRY', mapLedgerResult({ posted: true, transactionId: 't' }).action === 'DONE' && mapLedgerResult({ posted: true, transactionId: 't', idempotentReplay: true } as any).action === 'DONE' && mapLedgerResult({ posted: false, skipped: true, reason: 'LEGACY_ORDER' }).action === 'SKIPPED' && mapLedgerResult({ posted: false, skipped: true, reason: 'SHADOW_LEDGER_DISABLED' }).action === 'DEFER' && mapLedgerResult({ posted: false, skipped: true, reason: 'MISSING_SNAPSHOT' }).action === 'PERMANENT' && mapLedgerResult({ posted: false, skipped: true, reason: 'DATABASE_UNAVAILABLE' }).action === 'RETRY');

  // ================================================================================================================================================
  // B) fluxo normal pelo outbox: pedido com cupom + subsídio; grupo com vários vendedores
  // ================================================================================================================================================
  const p1 = await place([shopA], { storeCoupons: [{ storeId: shopA.store.storeId, code: 'DEZ' }] }); const oid1 = p1.orderIds[0];
  const money0 = await moneyHash();
  const pay1 = await pay(p1);
  const e1 = await evs(oid1); const l1 = await ledger(oid1);
  report('B1 pagamento: o evento PAYMENT_RECEIVED nasce NA transação do pagamento, é processado logo após o commit e termina DONE com o lançamento ligado (ledger_transaction_id, correlation_id = id do evento)', e1.length === 1 && e1[0].status === 'DONE' && e1[0].attempts === 1 && e1[0].ledger_transaction_id === l1.txs[0]?.id && l1.txs[0].correlation_id === e1[0].id && l1.types.join() === 'PAYMENT_RECEIVED' && e1[0].snapshot_hash.length === 64 && e1[0].source === 'asaas', { e1, l1 });
  await release(oid1, p1.buyer.buyerId);
  const e1b = await evs(oid1); const l1b = await ledger(oid1); const o1 = await orderRow(oid1);
  const [esc1] = await q('select status, amount::text from escrow_accounts where order_id=$1', [oid1]);
  const [sel1] = await q('select user_id from sellers where id=$1', [o1.sellerId]); const [w1] = await q('select balance::text from wallets where user_id=$1', [sel1.user_id]);
  report('B2 liberação (pedido com cupom 10% + subsídio 50%): DC DONE; ledger = comissão 450, vendedor 4050, frete 1000, subsídio 500, BUYER_ESCROW 0; dinheiro real intacto (Escrow released, carteira 4050)', e1b.map((x: any) => x.status).join() === 'DONE,DONE' && l1b.bal['NUSALI_COMMISSION_REVENUE'] === 45000 && l1b.bal['SELLER_PAYABLE'] === 405000 && l1b.bal['SHIPPING_PAYABLE'] === 100000 && l1b.bal['SHIPPING_SUBSIDY_NUSALI'] === -50000 && l1b.bal['BUYER_ESCROW'] === 0 && esc1.status === 'released' && c(w1.balance) === 405000, { e1b: e1b.map((x: any) => [x.event_type, x.status]), bal: l1b.bal, esc1, w1 });

  const g3 = await place([shopA, shopB, shopC]); const pg3 = await pay(g3);
  const e3 = await Promise.all(g3.orderIds.map(evs)); const l3 = await Promise.all(g3.orderIds.map(ledger));
  report('B3 grupo com 3 vendedores: 3 eventos (1 por pedido filho), todos DONE, 3 lançamentos independentes, cada um com o total do SEU pedido; soma = pagamento do grupo', e3.every((e: any) => e.length === 1 && e[0].status === 'DONE') && l3.every((l) => l.types.join() === 'PAYMENT_RECEIVED') && new Set(l3.map((l) => l.txs[0].id)).size === 3 && l3.reduce((s, l) => s + l.bal['BUYER_ESCROW'], 0) === Math.round(pg3.total * 100), { total: pg3.total, bal: l3.map((l) => l.bal) });

  // comissão 0% (categoria sem comissão) — o construtor não pode tentar lançar linha de valor zero
  await db.update(categories).set({ commissionRate: '0.00' } as any);
  const pz = await place([shopB]); const oz = pz.orderIds[0]; await pay(pz); await release(oz, pz.buyer.buyerId);
  await db.update(categories).set({ commissionRate: '10.00' } as any);
  const ez = await evs(oz); const lz = await ledger(oz); const ozr = await orderRow(oz);
  report('B4 comissão 0%: ambos os eventos DONE; lançamento da entrega SEM linha de comissão, BUYER_ESCROW 0, vendedor recebe o líquido integral', Number(ozr.marketplaceCommission) === 0 && ez.map((x: any) => x.status).join() === 'DONE,DONE' && lz.bal['NUSALI_COMMISSION_REVENUE'] === undefined && lz.bal['BUYER_ESCROW'] === 0 && lz.bal['SELLER_PAYABLE'] === c(ozr.sellerNetAmount), { c: ozr.marketplaceCommission, ez: ez.map((x: any) => x.status), bal: lz.bal });

  // ================================================================================================================================================
  // C) reentrega de webhook / concorrência na primeira confirmação
  // ================================================================================================================================================
  const g4 = await place([shopA, shopB, shopC]); const pay4 = await newPay(g4);
  const c4 = await capture(() => Promise.allSettled([...Array(5)].map(() => confirm(pay4))));
  const c4b = await capture(() => Promise.allSettled([...Array(3)].map(() => confirm(pay4))));
  const n4 = await q(`select count(*)::int n, count(distinct idempotency_key)::int k from ledger_outbox_events where order_id = any($1)`, [g4.orderIds]);
  const t4 = await q(`select count(*)::int n from ledger_transactions where order_id = any($1) and type='PAYMENT_RECEIVED'`, [g4.orderIds]);
  report('C1 webhook duplicado: 5 confirmações simultâneas + 3 reentregas sequenciais do mesmo pagamento => nenhuma rejeitada, 3 eventos únicos, 3 lançamentos, sem erro de ledger/outbox nos logs', c4.value.every((r: any) => r.status === 'fulfilled') && c4b.value.every((r: any) => r.status === 'fulfilled') && n4[0].n === 3 && n4[0].k === 3 && t4[0].n === 3 && outboxErrors([...c4.errors, ...c4b.errors]).length === 0, { n4, t4, errs: outboxErrors([...c4.errors, ...c4b.errors]).slice(0, 2) });
  const dupKey = await q(`select idempotency_key from ledger_outbox_events group by 1 having count(*)>1`);
  const conc = await Promise.allSettled([...Array(6)].map(() => db.transaction(async (tx: any) => enqueueLedgerEvent(tx, { eventType: 'PAYMENT_RECEIVED', order: (await orderRow(g4.orderIds[0])) as any, occurredAt: new Date(), source: 'race' }))));
  report('C2 6 enfileiramentos simultâneos do mesmo evento => nenhum erro, todos devolvem EXISTS, continua 1 linha (índice único), nenhuma chave duplicada no outbox', conc.every((r: any) => r.status === 'fulfilled' && r.value.status === 'EXISTS') && dupKey.length === 0, conc.map((r: any) => r.value ?? r.reason?.message));

  // ================================================================================================================================================
  // D) falhas e recuperação
  // ================================================================================================================================================
  // D1 — falha DEPOIS do commit do pagamento (ledger fora do ar): pagamento e Escrow intactos, evento fica RETRYING e é recuperado
  const p5 = await place([shopB]); const oid5 = p5.orderIds[0]; const pay5 = await newPay(p5);
  const cap5 = await capture(() => withStub('57P01', () => confirm(pay5), ['recordPaymentReceived']));
  const [o5] = await q(`select payment_status, escrow_status from orders where id=$1`, [oid5]); const e5 = await evs(oid5);
  report('D1 falha DEPOIS do commit do pagamento (conexão perdida no ledger): pagamento e Escrow já confirmados, evento persistido em RETRYING (tentativa 1, backoff ≈30s), nenhum lançamento — nada se perdeu', o5.payment_status === 'paid' && o5.escrow_status === 'held' && e5.length === 1 && e5[0].status === 'RETRYING' && e5[0].attempts === 1 && e5[0].last_error_code === 'PG_57P01' && e5[0].delay_s >= 27 && e5[0].delay_s <= 33 && (await ledger(oid5)).types.length === 0, { o5, e5 });
  const early = await runLedgerOutboxOnce({ workerId: 'w-early' });
  report('D2 o backoff é respeitado: um worker que roda antes do horário agendado não reclama o evento', early.claimed === 0 && (await evs(oid5))[0].status === 'RETRYING');
  const rec5 = await runLedgerOutboxOnce({ workerId: 'w-late', now: new Date(Date.now() + 10 * 60_000) });
  const e5b = await evs(oid5);
  report('D3 depois do horário, o worker recupera: evento DONE com 2 tentativas e exatamente 1 lançamento', rec5.claimed >= 1 && e5b[0].status === 'DONE' && e5b[0].attempts === 2 && (await ledger(oid5)).types.join() === 'PAYMENT_RECEIVED', { e5b });

  // D4 — falha ANTES de gravar o outbox (tabela indisponível): o pagamento NÃO é derrubado; o fallback direto lança; sem evento
  const p6 = await place([shopC]); const oid6 = p6.orderIds[0]; const pay6 = await newPay(p6);
  await pool.query('ALTER TABLE ledger_outbox_events RENAME TO ledger_outbox_events_off');
  let cap6: any; try { cap6 = await capture(() => confirm(pay6)); } finally { await pool.query('ALTER TABLE ledger_outbox_events_off RENAME TO ledger_outbox_events'); }
  const [o6] = await q(`select payment_status, escrow_status from orders where id=$1`, [oid6]);
  report('D4 falha ANTES de gravar o outbox (tabela ausente): o pagamento é confirmado do mesmo jeito (savepoint isola a falha), o erro é logado, o fallback direto da E1 lança o PAYMENT_RECEIVED e nenhum evento é criado', o6.payment_status === 'paid' && o6.escrow_status === 'held' && (await evs(oid6)).length === 0 && (await ledger(oid6)).types.join() === 'PAYMENT_RECEIVED' && cap6.errors.some((e: string) => /falha ao gravar o evento no outbox/.test(e)), { o6, errs: cap6.errors.slice(0, 2) });
  // D5 — modo ESTRITO: a mesma falha aborta a confirmação (opt-in)
  const p6s = await place([shopC]); const pay6s = await newPay(p6s); process.env.LEDGER_OUTBOX_STRICT = 'true';
  await pool.query('ALTER TABLE ledger_outbox_events RENAME TO ledger_outbox_events_off');
  let strictErr: any = null; try { await confirm(pay6s); } catch (e) { strictErr = e; } finally { await pool.query('ALTER TABLE ledger_outbox_events_off RENAME TO ledger_outbox_events'); delete process.env.LEDGER_OUTBOX_STRICT; }
  const [o6s] = await q(`select payment_status, escrow_status from orders where id=$1`, [p6s.orderIds[0]]); const [pp6s] = await q(`select status from payments where id=$1`, [pay6s.payId]);
  report('D5 modo estrito (LEDGER_OUTBOX_STRICT=true): a falha do outbox ABORTA a confirmação — pedido continua pendente, nada de Escrow; repetindo depois com a tabela de volta, confirma e enfileira normalmente', !!strictErr && o6s.payment_status !== 'paid' && pp6s.status === 'pending' && (await q(`select count(*)::int n from escrow_accounts where order_id=$1`, [p6s.orderIds[0]]))[0].n === 0, { strictErr: strictErr?.message?.slice(0, 80), o6s, pp6s });
  await confirm(pay6s);
  report('D5b …e após restaurar a tabela a mesma confirmação conclui (idempotente) e o evento é DONE', (await evs(p6s.orderIds[0]))[0]?.status === 'DONE');

  // D4b — o pior caso: pagamento confirmado, gravação do outbox falhou E o lançamento direto também => sem evento e sem lançamento
  const p6b = await place([shopA]); const oid6b = p6b.orderIds[0]; const pay6b = await newPay(p6b);
  await pool.query('ALTER TABLE ledger_outbox_events RENAME TO ledger_outbox_events_off');
  try { await withStub(null, () => confirm(pay6b), ['recordPaymentReceived']); } finally { await pool.query('ALTER TABLE ledger_outbox_events_off RENAME TO ledger_outbox_events'); }
  const [o6b] = await q(`select payment_status, escrow_status from orders where id=$1`, [oid6b]);
  const worstCase = { paid: o6b.payment_status === 'paid' && o6b.escrow_status === 'held', events: (await evs(oid6b)).length, ledger: (await ledger(oid6b)).types.length };
  const recon6b = await runLedgerReconciliation({ now: new Date(Date.now() + 2 * HOUR) });
  const f6b = await q(`select finding_type, severity from ledger_reconciliation_findings where order_id=$1 and status='OPEN'`, [oid6b]);
  await confirm(pay6b);   // reentrega do webhook do provedor (idempotente): o ramo de reentrega regrava o evento que faltava
  const heal = { events: await evs(oid6b), ledger: (await ledger(oid6b)).types };
  report('D4b PIOR CASO — pagamento confirmado, a gravação do outbox falhou E o lançamento direto também: o dinheiro real segue correto (pago/retido), sem evento e sem lançamento; o reconciliador JÁ enxerga a lacuna (sem nenhum registro prévio no outbox); a próxima reentrega do webhook recria o evento e o lançamento sai DONE — recuperação automática, sem duplicar', worstCase.paid && worstCase.events === 0 && worstCase.ledger === 0 && f6b.some((x: any) => x.finding_type === 'PAYMENT_LEDGER_MISSING_NO_EVENT') && recon6b.status === 'OK' && heal.events.length === 1 && heal.events[0].status === 'DONE' && heal.ledger.join() === 'PAYMENT_RECEIVED', { worstCase, f6b, heal });

  // D6 — falha DEPOIS de gravar o outbox e ANTES de processar (processo morre): evento PENDING, worker recupera
  const p7 = await place([shopA, shopB]); await payQuietly(p7);
  const st7 = await stage(p7.orderIds);
  const pre7 = await Promise.all(p7.orderIds.map(evs));
  const run7 = await runLedgerOutboxOnce({ workerId: 'w-restart' });
  const post7 = await Promise.all(p7.orderIds.map(evs));
  report('D6 falha DEPOIS de gravar o outbox e ANTES de processar (processo morre após o commit): 2 eventos PENDING (0 tentativas, 0 lançamentos); o worker seguinte processa ambos', st7.eventIds.length === 2 && pre7.every((e: any) => e[0].status === 'PENDING' && e[0].attempts === 0) && run7.claimed >= 2 && post7.every((e: any) => e[0].status === 'DONE' && e[0].attempts === 1) && (await Promise.all(p7.orderIds.map(ledger))).every((l) => l.types.join() === 'PAYMENT_RECEIVED'), { pre7, post7 });

  // D7 — worker que "cai" com o lease: outro assume; o retardatário não sobrescreve
  const p8 = await place([shopC]); const oid8 = p8.orderIds[0]; await payQuietly(p8); const st8 = await stage([oid8]);
  const t0 = new Date(); const claimedA = await claimEvents(getDb() as any, { workerId: 'worker-A', limit: 5, now: t0, leaseSeconds: 300, eventIds: st8.eventIds });
  const midRun = await runLedgerOutboxOnce({ workerId: 'worker-B', now: new Date(t0.getTime() + 60_000) });
  const reRun = await runLedgerOutboxOnce({ workerId: 'worker-B', now: new Date(t0.getTime() + 301_000 + 1000) });
  const e8 = await evs(oid8);
  const stale = await processClaimedEvent(getDb() as any, claimedA[0], 'worker-A', new Date(), resolvePolicy());
  const e8b = await evs(oid8);
  report('D7 reinício do worker: A reclama e "cai" (lease 300s); em 60s B não vê o evento; após o lease B reassume (tentativa 2) e conclui DONE com 1 lançamento; o retardatário A é rejeitado (LEASE_LOST) e não altera o estado', claimedA.length === 1 && midRun.claimed === 0 && reRun.claimed === 1 && e8[0].status === 'DONE' && e8[0].attempts === 2 && stale === 'LEASE_LOST' && e8b[0].status === 'DONE' && (await ledger(oid8)).types.length === 1, { e8, stale, e8b });

  // D8 — vários workers concorrentes
  const groupsFor9 = [await place([shopA, shopB, shopC]), await place([shopA, shopB, shopC]), await place([shopA, shopB, shopC])];
  for (const g of groupsFor9) await payQuietly(g);
  const ids9 = groupsFor9.flatMap((g) => g.orderIds); await stage(ids9);
  const cap9 = await capture(async () => Promise.all([...Array(6)].map(async (_, i) => { let claimed = 0; for (let k = 0; k < 8; k++) { const r = await runLedgerOutboxOnce({ workerId: `w${i}`, batchSize: 2 }); claimed += r.claimed; if (r.claimed === 0) break; } return claimed; })));
  const e9 = await q(`select status, attempts from ledger_outbox_events where order_id = any($1)`, [ids9]); const t9 = await q(`select count(*)::int n from ledger_transactions where order_id = any($1)`, [ids9]);
  report('D8 6 workers concorrentes sobre 9 eventos: todos DONE, cada um reclamado EXATAMENTE uma vez (attempts=1, soma dos claims = 9), 9 lançamentos, sem erros', e9.length === 9 && e9.every((x: any) => x.status === 'DONE' && x.attempts === 1) && cap9.value.reduce((s: number, x: number) => s + x, 0) === 9 && t9[0].n === 9 && outboxErrors(cap9.errors).length === 0, { claims: cap9.value, e9: e9.map((x: any) => x.status + x.attempts).join(), t9 });

  // D9 — falhas recuperáveis repetidas: backoff crescente, esgotamento => intervenção, recuperação manual auditada
  process.env.LEDGER_OUTBOX_MAX_ATTEMPTS = '3';
  const p10 = await place([shopB]); const oid10 = p10.orderIds[0]; await payQuietly(p10); const st10 = await stage([oid10]); delete process.env.LEDGER_OUTBOX_MAX_ATTEMPTS;
  const ev10 = (await evs(oid10))[0];
  const r1 = await withStub('40P01', () => runLedgerOutboxOnce({ workerId: 'wx', now: new Date(Date.now()) })); const x1 = (await evs(oid10))[0];
  const r2 = await withStub('40P01', () => runLedgerOutboxOnce({ workerId: 'wx', now: new Date(Date.now() + HOUR) })); const x2 = (await evs(oid10))[0];
  const r3 = await withStub('40P01', () => runLedgerOutboxOnce({ workerId: 'wx', now: new Date(Date.now() + 2 * HOUR) })); const x3 = (await evs(oid10))[0];
  report('D9 deadlock repetido (40P01), máx. 3 tentativas: 1ª ≈30s, 2ª ≈120s de espera; na 3ª o evento vai para NEEDS_INTERVENTION (RETRIES_EXHAUSTED) — visível, sem lançamento, nunca descartado', ev10.max_attempts === 3 && x1.status === 'RETRYING' && x1.delay_s >= 27 && x1.delay_s <= 33 && x2.status === 'RETRYING' && x2.delay_s >= 108 && x2.delay_s <= 132 && x3.status === 'NEEDS_INTERVENTION' && x3.last_error_code === 'RETRIES_EXHAUSTED' && x3.attempts === 3 && (await ledger(oid10)).types.length === 0, { x1, x2, x3 });
  const idle = await runLedgerOutboxOnce({ workerId: 'wy', now: new Date(Date.now() + 5 * HOUR) });
  report('D10 evento em NEEDS_INTERVENTION não é reprocessado sozinho (idle claim=0)', idle.claimed === 0 && (await evs(oid10))[0].status === 'NEEDS_INTERVENTION');
  const rq: any[] = [];
  for (const [who, reason] of [[plain, 'tentando sem permissão'], [admin, 'curto']] as Array<[string, string]>) { try { await requeueOutboxEvent({ eventId: ev10.id, actorUserId: who, reason }); rq.push('PASSOU'); } catch (e: any) { rq.push(e instanceof OutboxAdminError ? e.code : e.message); } }
  const rqOk = await requeueOutboxEvent({ eventId: ev10.id, actorUserId: admin, reason: 'banco estabilizado após o incidente de deadlock' });
  const aud = await q(`select action, details_json from audit_logs where resource='ledger_outbox_event' and resource_id=$1`, [ev10.id]);
  const fin10 = await runLedgerOutboxOnce({ workerId: 'wz' });
  report('D11 recuperação manual AUDITADA: usuário comum => FORBIDDEN; admin sem justificativa => REASON_REQUIRED; admin com justificativa => PENDING (tentativas zeradas) e audit_logs guarda o erro anterior; o worker conclui DONE', rq.join() === 'FORBIDDEN,REASON_REQUIRED' && rqOk.from === 'NEEDS_INTERVENTION' && aud.length === 1 && aud[0].details_json.before.lastErrorCode === 'RETRIES_EXHAUSTED' && aud[0].details_json.reason.includes('estabilizado') && (await evs(oid10))[0].status === 'DONE' && fin10.claimed === 1, { rq, aud, e: (await evs(oid10))[0] });

  // D12 — reprocessar o que já está DONE não faz nada
  const doneIds = (await q(`select id from ledger_outbox_events where status='DONE'`)).map((r: any) => r.id);
  const txBefore = (await q(`select count(*)::int n, md5(coalesce(string_agg(id,'|' order by id),'')) h from ledger_transactions`))[0];
  const rp1 = await runLedgerOutboxOnce({ workerId: 'w-rep1', now: new Date(Date.now() + 9 * HOUR) });
  const { processEventsNow: pnow } = await import('../src/server/modules/ledger/outbox/outboxService.js'); await pnow(doneIds);
  const txAfter = (await q(`select count(*)::int n, md5(coalesce(string_agg(id,'|' order by id),'')) h from ledger_transactions`))[0];
  let reopenDone: any = null; try { await requeueOutboxEvent({ eventId: doneIds[0], actorUserId: admin, reason: 'tentando reabrir um DONE no teste' }); } catch (e: any) { reopenDone = e.code; }
  report(`D12 REPROCESSAMENTO: ${doneIds.length} eventos DONE — outro ciclo do worker e processEventsNow sobre todos não reclamam nada (claimed=0), o ledger fica idêntico (mesmas transações) e reabrir um DONE é recusado (INVALID_STATE + gatilho)`, rp1.claimed === 0 && txBefore.n === txAfter.n && txBefore.h === txAfter.h && reopenDone === 'INVALID_STATE' && doneIds.length >= 10, { claimed: rp1.claimed, txBefore, txAfter, reopenDone, n: doneIds.length });

  // ================================================================================================================================================
  // E) eventos inválidos / snapshot
  // ================================================================================================================================================
  const p11 = await place([shopA]); const oid11 = p11.orderIds[0]; await payQuietly(p11); await stage([oid11]);
  await pool.query(`update orders set total_amount = total_amount + 1 where id=$1`, [oid11]);
  const r11 = await runLedgerOutboxOnce({ workerId: 'w-div' }); const x11 = (await evs(oid11))[0];
  await pool.query(`update orders set total_amount = total_amount - 1 where id=$1`, [oid11]);
  report('E1 o pedido mudou depois do enfileiramento (total +1): o worker NÃO lança — NEEDS_INTERVENTION (SNAPSHOT_DIVERGED) apontando o campo totalAmount; nenhum lançamento e nada "corrigido"', r11.claimed >= 1 && x11.status === 'NEEDS_INTERVENTION' && x11.last_error_code === 'SNAPSHOT_DIVERGED' && /totalAmount/.test(x11.last_error) && (await ledger(oid11)).types.length === 0, x11);
  const p12 = await place([shopB]); const oid12 = p12.orderIds[0]; await payQuietly(p12);
  await pool.query(`update orders set seller_net_amount = NULL, escrow_status='released' where id=$1`, [oid12]);
  await stage([oid12], 'ORDER_DELIVERY_CONFIRMED');
  const r12 = await runLedgerOutboxOnce({ workerId: 'w-inv' }); const x12 = await evs(oid12);
  report('E2 evento permanentemente inválido (snapshot sem líquido do vendedor): vai direto para NEEDS_INTERVENTION na 1ª tentativa (sem retry inútil), com o código do motivo; nenhum lançamento de entrega — mas o PAYMENT_RECEIVED foi garantido antes (BUYER_ESCROW nunca negativo)', r12.claimed >= 1 && x12.find((e: any) => e.event_type === 'ORDER_DELIVERY_CONFIRMED').status === 'NEEDS_INTERVENTION' && x12.find((e: any) => e.event_type === 'ORDER_DELIVERY_CONFIRMED').attempts === 1 && /SNAPSHOT/.test(x12.find((e: any) => e.event_type === 'ORDER_DELIVERY_CONFIRMED').last_error_code) && !(await ledger(oid12)).types.includes('ORDER_DELIVERY_CONFIRMED') && (await ledger(oid12)).types.includes('PAYMENT_RECEIVED'), x12);

  // ================================================================================================================================================
  // F) cutoff, flag e liberação com transação externa
  // ================================================================================================================================================
  const p13 = await place([shopC]); const oid13 = p13.orderIds[0];
  await pool.query(`update orders set created_at = '2025-12-31T10:00:00' where id=$1`, [oid13]);
  await pay(p13);
  report('F1 pedido ANTERIOR ao cutoff (31/12/2025): nenhum evento no outbox e nenhum lançamento — nenhum processamento automático de legado', (await evs(oid13)).length === 0 && (await ledger(oid13)).types.length === 0);
  const sOrder: any = await orderRow(g3.orderIds[0]);
  const before = (await q(`select count(*)::int n from ledger_outbox_events`))[0].n;
  const u1 = await enqueueLedgerEvent(db, { eventType: 'PAYMENT_RECEIVED', order: { ...sOrder, id: 'ord_unit_x', createdAt: new Date('2027-01-01') }, occurredAt: new Date(), source: 'u' }, { enabled: false, cutoff: null });
  const u2 = await enqueueLedgerEvent(db, { eventType: 'PAYMENT_RECEIVED', order: { ...sOrder, id: 'ord_unit_x', createdAt: new Date('2025-06-01') }, occurredAt: new Date(), source: 'u' }, { enabled: true, cutoff: new Date('2026-01-01') });
  const u3 = await enqueueLedgerEvent(db, { eventType: 'PAYMENT_RECEIVED', order: { ...sOrder, id: 'ord_unit_x' }, occurredAt: new Date(), source: 'u' }, { enabled: true, cutoff: new Date('2026-01-01') }, { LEDGER_OUTBOX_ENABLED: 'false' });
  report('F2 elegibilidade: ledger desligado => NOT_ELIGIBLE; pedido anterior ao cutoff => NOT_ELIGIBLE (LEGACY_ORDER); flag do outbox desligada => DISABLED; nenhuma linha gravada', u1.status === 'NOT_ELIGIBLE' && u2.status === 'NOT_ELIGIBLE' && (u2 as any).reason === 'LEGACY_ORDER' && u3.status === 'DISABLED' && (await q(`select count(*)::int n from ledger_outbox_events`))[0].n === before, { u1, u2, u3 });
  const prevFlag = process.env.LEDGER_OUTBOX_ENABLED; process.env.LEDGER_OUTBOX_ENABLED = 'false';
  const p14 = await place([shopA]); await pay(p14); process.env.LEDGER_OUTBOX_ENABLED = prevFlag;
  report('F3 com o outbox DESLIGADO o comportamento é o da E1: nenhum evento, lançamento direto pós-commit (1 PAYMENT_RECEIVED)', (await evs(p14.orderIds[0])).length === 0 && (await ledger(p14.orderIds[0])).types.join() === 'PAYMENT_RECEIVED');
  const p15 = await place([shopB]); await pay(p15); const oid15 = p15.orderIds[0];
  await db.update(schema.shipments).set({ status: 'DELIVERED' } as any).where(eq(schema.shipments.orderId, oid15));
  await db.transaction(async (tx: any) => { await PaymentService.releaseEscrowForOrder(oid15, { performedBy: p15.buyer.buyerId }, tx); });
  const x15 = await evs(oid15); const l15mid = await ledger(oid15);
  report('F4 liberação dentro de transação EXTERNA: os eventos ficam gravados com a transação e NÃO são processados antes do commit; depois do commit o worker conclui (sem lançamento prematuro, sem evento perdido)', x15.some((e: any) => e.event_type === 'ORDER_DELIVERY_CONFIRMED' && e.status === 'PENDING') && !l15mid.types.includes('ORDER_DELIVERY_CONFIRMED'), { x15: x15.map((e: any) => [e.event_type, e.status]), l15mid: l15mid.types });
  await runLedgerOutboxOnce({ workerId: 'w-ext' });
  report('F5 …e o worker lança a entrega depois do commit (DONE, BUYER_ESCROW 0)', (await evs(oid15)).every((e: any) => e.status === 'DONE') && (await ledger(oid15)).bal['BUYER_ESCROW'] === 0);

  // ================================================================================================================================================
  // G) reconciliação: ausência, inconsistência, divergência sem correção silenciosa, reparo manual
  // ================================================================================================================================================
  const future = new Date(Date.now() + 2 * HOUR);
  const p16 = await place([shopC]); const oid16 = p16.orderIds[0]; await payQuietly(p16);   // pago, sem evento e sem lançamento
  const noRowBefore = (await q(`select count(*)::int n from ledger_outbox_events where order_id=$1`, [oid16]))[0].n === 0;
  const rc1 = await runLedgerReconciliation({ now: future, triggeredBy: 'test' });
  const f16 = await q(`select finding_type, severity, status from ledger_reconciliation_findings where order_id=$1`, [oid16]);
  report('G1 reconciliação encontra o lançamento AUSENTE mesmo SEM qualquer registro prévio no outbox (0 linhas para o pedido; pedido pago, sem evento e sem lançamento): PAYMENT_LEDGER_MISSING_NO_EVENT, severidade CRITICAL, status OPEN; a execução fica registrada', noRowBefore && f16.some((x: any) => x.finding_type === 'PAYMENT_LEDGER_MISSING_NO_EVENT' && x.severity === 'CRITICAL' && x.status === 'OPEN') && rc1.status === 'OK' && rc1.open.critical >= 1 && !!rc1.runId, { f16, rc1 });
  const ledgerBeforeRepair = (await q(`select count(*)::int n from ledger_transactions`))[0].n;
  const dry = await repairMissingEvents({ actorUserId: admin }); const eventsAfterDry = (await q(`select count(*)::int n from ledger_outbox_events where order_id=$1`, [oid16]))[0].n;
  let forb: any = null; try { await repairMissingEvents({ actorUserId: plain, dryRun: false }); } catch (e: any) { forb = e.code; }
  const money1 = await moneyHash();
  const rep = await repairMissingEvents({ actorUserId: admin, dryRun: false });
  const wk = await runLedgerOutboxOnce({ workerId: 'w-repair' });
  const money2 = await moneyHash();
  report('G2 reparo MANUAL: dry-run lista o candidato sem gravar nada; usuário comum => FORBIDDEN; admin cria o evento (hora do fato = criação do Escrow) e o worker lança — o reconciliador sozinho nunca criou evento nem lançamento', dry.candidates.some((c2) => c2.orderId === oid16 && c2.eventType === 'PAYMENT_RECEIVED') && eventsAfterDry === 0 && forb === 'FORBIDDEN' && rep.enqueued >= 1 && wk.claimed >= 1 && (await ledger(oid16)).types.join() === 'PAYMENT_RECEIVED' && (await q(`select count(*)::int n from ledger_transactions`))[0].n === ledgerBeforeRepair + rep.enqueued, { dry: dry.candidates.length, forb, rep, wk: wk.claimed });
  report('G3 DINHEIRO REAL INTACTO: reparo + worker alteraram só o ledger — carteiras, transações de carteira, Escrow, pagamentos, pedidos e reembolsos com hash idêntico antes/depois', JSON.stringify(money1) === JSON.stringify(money2), { money1, money2 });
  const moneyR1 = await moneyHash(); const ledR1 = (await q(`select count(*)::int n, md5(coalesce(string_agg(id||status,'|' order by id),'')) h from ledger_transactions`))[0];
  await runLedgerReconciliation({ now: future, triggeredBy: 'test-readonly' }); await runLedgerReconciliation({ now: future, triggeredBy: 'test-readonly' });
  const moneyR2 = await moneyHash(); const ledR2 = (await q(`select count(*)::int n, md5(coalesce(string_agg(id||status,'|' order by id),'')) h from ledger_transactions`))[0];
  report('G3b a RECONCILIAÇÃO (2 execuções seguidas) não altera nada: carteiras, Escrow, pagamentos, pedidos, reembolsos e o próprio ledger com hash idêntico antes/depois — só as tabelas ledger_reconciliation_* recebem escrita', JSON.stringify(moneyR1) === JSON.stringify(moneyR2) && ledR1.n === ledR2.n && ledR1.h === ledR2.h, { moneyR1, moneyR2, ledR1, ledR2 });
  const rc2 = await runLedgerReconciliation({ now: future, triggeredBy: 'test' });
  const f16b = await q(`select status, resolved_by_run_id from ledger_reconciliation_findings where order_id=$1 and finding_type='PAYMENT_LEDGER_MISSING_NO_EVENT'`, [oid16]);
  report('G4 depois do reparo a divergência passa a RESOLVED (com o run que a viu resolvida) — o histórico permanece (a linha não é apagada)', f16b.length === 1 && f16b[0].status === 'RESOLVED' && (await q(`select count(*)::int n from ledger_reconciliation_runs where id=$1`, [f16b[0].resolved_by_run_id]))[0].n === 1 && rc2.status === 'OK', { f16b, rc2 });

  // divergência de valor: o pedido muda DEPOIS do lançamento — a reconciliação aponta, não corrige
  const oidD = g3.orderIds[1];
  const ledgerSnap = JSON.stringify(await q(`select t.id, t.status, e.amount::text, e.direction from ledger_transactions t join ledger_entries e on e.transaction_id=t.id order by t.id, e.id`));
  await pool.query(`update orders set total_amount = total_amount + 7 where id=$1`, [oidD]);
  const rd1 = await runLedgerReconciliation({ now: future }); const rd2 = await runLedgerReconciliation({ now: future });
  const fd = await q(`select id, finding_type, severity, status, seen_count, expected_json, actual_json from ledger_reconciliation_findings where order_id=$1 and finding_type='PAYMENT_AMOUNT_MISMATCH'`, [oidD]);
  const ledgerSnapAfter = JSON.stringify(await q(`select t.id, t.status, e.amount::text, e.direction from ledger_transactions t join ledger_entries e on e.transaction_id=t.id order by t.id, e.id`));
  report('G5 DIVERGÊNCIA sem correção silenciosa: total do pedido +7 depois do lançamento => PAYMENT_AMOUNT_MISMATCH CRITICAL (esperado ≠ lançado), 1 só registro visto 2 vezes (seen_count=2), ledger e pedido NÃO foram alterados pela reconciliação', fd.length === 1 && fd[0].severity === 'CRITICAL' && fd[0].status === 'OPEN' && fd[0].seen_count === 2 && !!fd[0].expected_json && !!fd[0].actual_json && ledgerSnap === ledgerSnapAfter, { fd, rd1: rd1.open });
  let ackForb: any = null; try { await acknowledgeFinding({ findingId: fd[0].id, actorUserId: plain, note: 'sem permissão alguma aqui' }); } catch (e: any) { ackForb = e.code; }
  await acknowledgeFinding({ findingId: fd[0].id, actorUserId: admin, note: 'divergência investigada: pedido editado manualmente no teste' });
  const rd3 = await runLedgerReconciliation({ now: future });
  const fd2 = await q(`select status, seen_count, acknowledged_by from ledger_reconciliation_findings where id=$1`, [fd[0].id]);
  report('G6 reconhecimento humano (só GLOBAL_ADMIN, com nota, auditado): vira ACKNOWLEDGED e continua VISÍVEL e contada nas execuções seguintes — reconhecer não é resolver', ackForb === 'FORBIDDEN' && fd2[0].status === 'ACKNOWLEDGED' && fd2[0].seen_count === 3 && fd2[0].acknowledged_by === admin && (await q(`select count(*)::int n from audit_logs where action='ledger.reconciliation.acknowledge'`))[0].n === 1, { fd2, ackForb });
  await pool.query(`update orders set total_amount = total_amount - 7 where id=$1`, [oidD]);
  const rd4 = await runLedgerReconciliation({ now: future });
  report('G7 corrigida a causa real (pedido volta ao valor), a divergência é RESOLVED pela própria varredura — nunca antes', (await q(`select status from ledger_reconciliation_findings where id=$1`, [fd[0].id]))[0].status === 'RESOLVED' && rd4.resolvedThisRun >= 1);

  // outros tipos de divergência (evento DONE sem lançamento; intervenção; evento parado; descartado)
  const p17 = await place([shopA]); await payQuietly(p17);
  await pool.query(`insert into ledger_outbox_events (id,event_type,idempotency_key,order_id,status,snapshot_json,snapshot_hash,occurred_at,created_at,updated_at,attempts) values ('lob_fake_done','PAYMENT_RECEIVED',$1,$2,'DONE','{}',repeat('c',64),now(),now(),now(),1)`, [`payment_received:${p17.orderIds[0]}`, p17.orderIds[0]]);
  const rt = await runLedgerReconciliation({ now: future });
  const ft = await q(`select finding_type, severity from ledger_reconciliation_findings where order_id=$1 and status<>'RESOLVED'`, [p17.orderIds[0]]);
  report('G8 evento DONE mas SEM lançamento => PAYMENT_LEDGER_MISSING_AFTER_DONE (CRITICAL) — o pior caso nunca passa despercebido', ft.some((x: any) => x.finding_type === 'PAYMENT_LEDGER_MISSING_AFTER_DONE' && x.severity === 'CRITICAL'), ft);
  const xi = await q(`select finding_type, severity from ledger_reconciliation_findings where order_id=$1 and status<>'RESOLVED'`, [oid11]);
  report('G9 evento em NEEDS_INTERVENTION (snapshot divergente do E1) aparece como PAYMENT_EVENT_NEEDS_INTERVENTION CRITICAL; e um evento PENDING parado há mais que o limite vira PAYMENT_EVENT_STALE WARNING', xi.some((x: any) => x.finding_type === 'PAYMENT_EVENT_NEEDS_INTERVENTION' && x.severity === 'CRITICAL'), xi);
  const p19 = await place([shopC]); await payQuietly(p19); await stage(p19.orderIds);
  await runLedgerReconciliation({ now: new Date(Date.now() + 3 * HOUR) });
  const fst = await q(`select finding_type, severity from ledger_reconciliation_findings where order_id=$1 and status<>'RESOLVED'`, [p19.orderIds[0]]);
  report('G9b evento PENDING parado há mais que o limite (15 min) sem lançamento => PAYMENT_EVENT_STALE (WARNING)', fst.some((x: any) => x.finding_type === 'PAYMENT_EVENT_STALE' && x.severity === 'WARNING'), fst);
  await runLedgerOutboxOnce({ workerId: 'w-stale' });
  const dis = await dismissOutboxEvent({ eventId: (await evs(oid11))[0].id, actorUserId: admin, reason: 'descartado no teste: pedido de fixture adulterado' });
  const rdis = await runLedgerReconciliation({ now: future });
  const fdis = await q(`select finding_type, severity from ledger_reconciliation_findings where order_id=$1 and status<>'RESOLVED'`, [oid11]);
  let doneDismiss: any = null; try { await dismissOutboxEvent({ eventId: (await evs(oid1))[0].id, actorUserId: admin, reason: 'tentando descartar um DONE' }); } catch (e: any) { doneDismiss = e.code; }
  report('G10 descartar (DISMISSED) exige admin + justificativa e é auditado; a lacuna contábil continua VISÍVEL (PAYMENT_EVENT_DISMISSED_WITHOUT_LEDGER, WARNING); evento DONE nunca pode ser descartado', dis.from === 'NEEDS_INTERVENTION' && fdis.some((x: any) => x.finding_type === 'PAYMENT_EVENT_DISMISSED_WITHOUT_LEDGER' && x.severity === 'WARNING') && doneDismiss === 'INVALID_STATE', { fdis, doneDismiss });
  report('G11 o pedido ANTERIOR ao cutoff não aparece na reconciliação (fora de escopo) e o reparo nunca o inclui', (await q(`select count(*)::int n from ledger_reconciliation_findings where order_id=$1`, [oid13]))[0].n === 0 && !(await repairMissingEvents({ actorUserId: admin })).candidates.some((x) => x.orderId === oid13));

  // ================================================================================================================================================
  // H) imutabilidade, métricas, logs estruturados
  // ================================================================================================================================================
  let delErr: any = null; try { await pool.query(`delete from ledger_outbox_events where id=$1`, [(await evs(oid1))[0].id]); } catch (e: any) { delErr = e.message; }
  let reopen: any = null; try { await pool.query(`update ledger_outbox_events set status='PENDING' where id=$1`, [(await evs(oid1))[0].id]); } catch (e: any) { reopen = e.message; }
  let dupIns: any = null; try { await pool.query(`insert into ledger_outbox_events (id,event_type,idempotency_key,order_id,snapshot_json,snapshot_hash,occurred_at) values ('lob_dup','PAYMENT_RECEIVED',$1,$2,'{}',repeat('a',64),now())`, [`payment_received:${oid1}`, oid1]); } catch (e: any) { dupIns = e.code; }
  report('H1 trilha imutável no banco: DELETE recusado, DONE não reabre, chave de idempotência duplicada recusada (23505)', /não pode ser apagado/.test(delErr || '') && /terminal/.test(reopen || '') && dupIns === '23505', { delErr, reopen, dupIns });
  const m = await getOutboxMetrics(); const rm = await getReconciliationMetrics();
  const byStatus = Object.fromEntries((await q(`select status, count(*)::int n from ledger_outbox_events group by 1`)).map((r: any) => [r.status, r.n]));
  report('H2 métricas do outbox batem com o banco (pendentes/recuperáveis/processados/intervenção/descartados) e as de reconciliação refletem as divergências abertas por severidade', m.done === (byStatus['DONE'] ?? 0) && m.needsIntervention === (byStatus['NEEDS_INTERVENTION'] ?? 0) && m.dismissed === (byStatus['DISMISSED'] ?? 0) && m.pending === (byStatus['PENDING'] ?? 0) && m.retrying === (byStatus['RETRYING'] ?? 0) && m.doneLast24h > 0 && rm.open.critical >= 1 && !!rm.lastRun, { m, rm });
  const p18 = await place([shopB]); await payQuietly(p18); const st18 = await stage(p18.orderIds);
  const cap18 = await capture(() => runLedgerOutboxOnce({ workerId: 'w-log' }));
  const lg = cap18.infos.find((x: any) => x && x.outboxEventId === st18.eventIds[0] && x.orderId === p18.orderIds[0]);
  report('H3 logs estruturados: cada evento processado registra outboxEventId, orderId, eventType, attempt, maxAttempts, workerId e o id do lançamento; a execução registra o resumo (claimed/outcomes/duração)', !!lg && lg.eventType === 'PAYMENT_RECEIVED' && lg.attempt === 1 && lg.maxAttempts === 8 && lg.workerId === 'w-log' && !!lg.ledgerTransactionId && cap18.infos.some((x: any) => x && x.workerId === 'w-log' && x.claimed === 1 && x.outcomes), { lg });

  await pool.end();
  console.log(`\n${passed}/${total} testes passaram.`);
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
