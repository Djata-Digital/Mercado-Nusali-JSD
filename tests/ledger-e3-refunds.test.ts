/**
 * LEDGER SOMBRA — E3: REEMBOLSOS NO LEDGER. Postgres DESCARTAVEL com os serviços reais (pedido → pagamento do grupo → liberação do Escrow → reembolso → outbox →
 * ledger). Prova: só reembolso CONCLUÍDO é lançado (nunca pendente/falhado), valores batem com os snapshots originais (cupom, subsídio, comissão 0%, grupo),
 * idempotência (webhook repetido, workers concorrentes, chamadas paralelas), falha/recuperação (ledger fora do ar, evento perdido, worker que cai), cutoff,
 * outbox desligado (caminho direto) e que NENHUM saldo real muda por causa do ledger/worker/reconciliação/reparo. Nunca produção.
 */
import { ledgerTestDbUrl } from './support/ledgerE2Env.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import { purchaseGroups, payments, paymentAttempts, coupons, categories } from '../src/db/schema.js';
import { OrderService } from '../src/server/modules/orders/orderService.js';
import { PaymentService } from '../src/server/modules/payments/paymentService.js';
import { processRefund, reserveOrderRefund, finalizeReservedOrderRefund, takeRefundLedgerStage, flushRefundLedgerStage } from '../src/server/modules/payments/refundService.js';
import { FinancialLedgerService } from '../src/server/modules/ledger/financialLedgerService.js';
import { buildRefundProcessedEntries } from '../src/server/modules/ledger/refundProcessedEntries.js';
import { runLedgerOutboxOnce, claimEvents, processClaimedEvent } from '../src/server/modules/ledger/outbox/outboxService.js';
import { runLedgerReconciliation, repairMissingEvents, evaluateOrder } from '../src/server/modules/ledger/outbox/reconciliationService.js';
import { resolvePolicy } from '../src/server/modules/ledger/outbox/outboxEvents.js';
import { resolveCartShippingPreview } from '../src/server/modules/shipping/shippingPreviewService.js';
import { getDb } from '../src/db/index.js';
import { setupCheckoutKit } from './support/checkoutTestKit.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 900)}`); };
const c = (n: any) => Math.round(Number(n) * 100);
const pgErr = (code: string, msg = 'simulated') => Object.assign(new Error(msg), { cause: { code } });
const OUTBOX_TABLE = 'ledger_outbox_events';

async function main() {
  const pool = new pg.Pool({ connectionString: ledgerTestDbUrl, ssl: { rejectUnauthorized: false }, max: 20 });
  const db = drizzle(pool, { schema });
  const q = async (sqlText: string, p: any[] = []) => (await pool.query(sqlText, p)).rows;

  // migrações 0039 e 0040 (as MESMAS do repositório) aplicadas no banco descartável se ainda não existirem
  if (!(await q(`select to_regclass('public.ledger_outbox_events') t`))[0].t) {
    for (const stmt of fs.readFileSync(path.join(root, 'drizzle/0039_ledger_outbox.sql'), 'utf8').split('--> statement-breakpoint')) if (stmt.trim()) await pool.query(stmt);
  }
  if (!(await q(`select 1 from pg_constraint where conname='ledger_transactions_type_check' and pg_get_constraintdef(oid) like '%REFUND_PROCESSED%'`)).length) {
    for (const stmt of fs.readFileSync(path.join(root, 'drizzle/0040_ledger_refunds.sql'), 'utf8').split('--> statement-breakpoint')) if (stmt.trim()) await pool.query(stmt);
  }

  const kit = await setupCheckoutKit(db, 'e3');
  await kit.setFlag('multiSellerCheckoutEnabled', true); await kit.setFlag('defaultShippingPolicyMode', 'CUSTOMER_PAYS');
  await kit.setFlag('shippingNusaliSubsidy', { enabled: false, percent: 0, rules: { 'GW:STANDARD': { enabled: true, percent: 50 } } });
  const bissau = await kit.sector('Bissau'); const std = await kit.service('STANDARD');
  const sectors: any[] = (await db.select().from(schema.shippingSectors)).filter((x: any) => x.countryCode === 'GW' && x.id !== bissau.id).sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
  let ns = 0;
  const admin = await kit.makeUser('GLOBAL_ADMIN');

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
  const orderRow = async (id: string) => (await q('select * from orders where id=$1', [id]))[0];
  const refundOf = async (orderId: string) => q('select * from refunds where order_id=$1 order by created_at', [orderId]);
  const rEvents = async (refundId: string) => q(`select id, event_type, status, attempts, last_error_code, ledger_transaction_id, snapshot_json, idempotency_key from ledger_outbox_events where idempotency_key=$1`, [`refund_processed:${refundId}`]);
  const allEvents = async (orderId: string) => q(`select event_type, status, attempts from ledger_outbox_events where order_id=$1 order by event_type`, [orderId]);
  const ledger = async (orderId: string) => {
    const t = await q('select id, type, status, refund_id from ledger_transactions where order_id=$1 order by type', [orderId]);
    const e = await q(`select a.code, e.direction, e.amount::numeric as amount, t.type from ledger_entries e join ledger_transactions t on t.id=e.transaction_id join ledger_accounts a on a.id=e.account_id where t.order_id=$1`, [orderId]);
    const bal: Record<string, number> = {}; for (const r of e) bal[r.code] = (bal[r.code] || 0) + (r.direction === 'CREDIT' ? 1 : -1) * c(r.amount);
    const refundEntries = e.filter((x: any) => x.type === 'REFUND_PROCESSED').map((x: any) => `${x.code}:${x.direction}:${c(x.amount)}`).sort();
    return { txs: t, types: t.map((x: any) => x.type), bal, refundEntries };
  };
  const refundTxCount = async (refundId: string) => (await q(`select count(*)::int n from ledger_transactions where idempotency_key=$1`, [`refund_processed:${refundId}`]))[0].n;
  const moneyHash = async () => (await q(`select
    (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from wallets x) w, (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from wallet_transactions x) wt,
    (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from escrow_accounts x) esc, (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from escrow_transactions x) etx,
    (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from payments x) pay, (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from orders x) ord,
    (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from refunds x) ref`))[0];
  const withStub = async (code: string | null, fn: () => Promise<any>) => {
    const orig = (FinancialLedgerService as any).recordRefundProcessed;
    (FinancialLedgerService as any).recordRefundProcessed = async () => { throw code ? pgErr(code, 'conexão perdida (simulada)') : new Error('ledger down (simulado)'); };
    try { return await fn(); } finally { (FinancialLedgerService as any).recordRefundProcessed = orig; }
  };
  const doRefund = (orderId: string, amount: number, key: string, executor?: any) => processRefund({ orderId, amount, reason: 'teste E3', idempotencyKey: key, performedBy: admin }, executor);
  const walletBalance = async (sellerId: string) => Number((await q(`select w.balance::text b from wallets w join sellers s on s.user_id=w.user_id where s.id=$1`, [sellerId]))[0]?.b ?? 0);

  const shopA = await shop('a'), shopB = await shop('b'), shopC = await shop('c'), shopD = await shop('d'); await addCoupon(shopA, 'DEZ', 10);

  // ================================================================================================================================================
  // A) construtor puro dos lançamentos
  // ================================================================================================================================================
  const O = { id: 'o1', buyerId: 'b1', sellerId: 's1', storeId: 'st1', countryCode: 'GW', currency: 'XOF', totalAmount: '5000.00', marketplaceCommission: '450.00', sellerNetAmount: '4050.00', customsDuty: null };
  const a1 = buildRefundProcessedEntries(O, { id: 'r1', amount: '5000.00', currency: 'XOF', sellerDebitAmount: null }, 'BEFORE_RELEASE');
  report('A1 antes da liberação: D BUYER_ESCROW = C PAYMENT_CLEARING = valor do reembolso (2 linhas, fecha)', a1.status === 'OK' && a1.entries.length === 2 && a1.entries.find((e) => e.accountCode === 'BUYER_ESCROW')?.direction === 'DEBIT' && a1.entries.find((e) => e.accountCode === 'PAYMENT_CLEARING')?.direction === 'CREDIT' && a1.entries.every((e) => e.amount === '5000.00'), a1);
  const a2 = buildRefundProcessedEntries(O, { id: 'r1', amount: '5000.00', currency: 'XOF', sellerDebitAmount: '4050.00' }, 'AFTER_RELEASE');
  const amt = (r: any, code: string) => r.status === 'OK' ? r.entries.filter((e: any) => e.accountCode === code).map((e: any) => `${e.direction}:${e.amount}`).join() : 'n/a';
  report('A2 depois da liberação, total: vendedor devolve 4050 (o débito da carteira), comissão 450 estornada, Nusali absorve 500 (frete), caixa C 5000', a2.status === 'OK' && amt(a2, 'SELLER_PAYABLE') === 'DEBIT:4050' && amt(a2, 'NUSALI_COMMISSION_REVENUE') === 'DEBIT:450' && amt(a2, 'REFUND_ABSORBED_SHIPPING') === 'DEBIT:500' && amt(a2, 'PAYMENT_CLEARING') === 'CREDIT:5000.00', a2);
  const a3 = buildRefundProcessedEntries({ ...O, totalAmount: '3333.00', marketplaceCommission: '333.30', sellerNetAmount: '2500.00' }, { id: 'r2', amount: '1111.00', currency: 'XOF', sellerDebitAmount: '833.33' }, 'AFTER_RELEASE');
  report('A3 depois da liberação, parcial com arredondamento: comissão proporcional em centavos (333,30×1111/3333 = 111,10), resto absorvido, tudo fecha', a3.status === 'OK' && a3.parts.commission === '111.1' && a3.parts.sellerDebit === '833.33' && a3.parts.absorbed === '166.57', a3);
  const a4a = buildRefundProcessedEntries({ ...O, marketplaceCommission: '0.00', sellerNetAmount: '4500.00' }, { id: 'r3', amount: '5000.00', currency: 'XOF', sellerDebitAmount: '4500.00' }, 'AFTER_RELEASE');
  report('A4 comissão 0%: nenhuma linha de comissão (valor zero não existe no ledger); o resto fecha', a4a.status === 'OK' && !a4a.entries.some((e) => e.accountCode === 'NUSALI_COMMISSION_REVENUE'), a4a);
  const bad = [
    buildRefundProcessedEntries(O, { id: 'r', amount: '6000.00', currency: 'XOF', sellerDebitAmount: null }, 'BEFORE_RELEASE'),
    buildRefundProcessedEntries(O, { id: 'r', amount: '5000.00', currency: 'EUR', sellerDebitAmount: null }, 'BEFORE_RELEASE'),
    buildRefundProcessedEntries(O, { id: 'r', amount: '5000.00', currency: 'XOF', sellerDebitAmount: null }, 'AFTER_RELEASE'),
    buildRefundProcessedEntries(O, { id: 'r', amount: '5000.00', currency: 'XOF', sellerDebitAmount: '9000.00' }, 'AFTER_RELEASE'),
    buildRefundProcessedEntries({ ...O, customsDuty: '10.00' }, { id: 'r', amount: '5000.00', currency: 'XOF', sellerDebitAmount: '4050.00' }, 'AFTER_RELEASE'),
    buildRefundProcessedEntries(O, { id: 'r', amount: '5000.00', currency: 'XOF', sellerDebitAmount: '4999.00' }, 'AFTER_RELEASE'),
  ];
  report('A5 entradas inválidas nunca viram lançamento: reembolso > total, moeda diferente, débito do vendedor ausente, débito > líquido, taxas alfandegárias, partes que excedem o valor', bad.every((b) => b.status === 'SKIPPED'), bad.map((b: any) => b.reason));

  // ================================================================================================================================================
  // B) fluxo normal — reembolso concluído vira evento NA transação e é lançado
  // ================================================================================================================================================
  // B1 antes da liberação
  const pB1 = await place([shopC]); const oB1 = pB1.orderIds[0]; await pay(pB1);
  const walletC0 = await walletBalance(shopC.seller.sellerId);
  const rB1 = await doRefund(oB1, Number((await orderRow(oB1)).total_amount), 'refund:b1');
  const evB1 = await rEvents(rB1.id); const lB1 = await ledger(oB1);
  const rowB1 = (await refundOf(oB1))[0];
  report('B1 reembolso ANTES da liberação: 1 evento REFUND_PROCESSED DONE ligado ao lançamento; ledger = PR + REFUND, BUYER_ESCROW e PAYMENT_CLEARING zerados; Escrow refunded; carteira do vendedor intacta', rB1.status === 'processed' && evB1.length === 1 && evB1[0].status === 'DONE' && evB1[0].ledger_transaction_id === lB1.txs.find((t: any) => t.type === 'REFUND_PROCESSED')?.id && lB1.types.join() === 'PAYMENT_RECEIVED,REFUND_PROCESSED' && lB1.bal.BUYER_ESCROW === 0 && lB1.bal.PAYMENT_CLEARING === 0 && (await orderRow(oB1)).escrow_status === 'refunded' && rowB1.status === 'processed' && (await walletBalance(shopC.seller.sellerId)) === walletC0, { evB1, lB1 });
  report('B1b o evento nasceu com o snapshot original (valor, moeda, estágio BEFORE_RELEASE) e com o refundId na chave determinística', evB1[0].snapshot_json.releaseStage === 'BEFORE_RELEASE' && evB1[0].idempotency_key === `refund_processed:${rB1.id}` && evB1[0].snapshot_json.refundAmount === String(rowB1.amount), evB1[0]);

  // B2 depois da liberação, pedido com cupom 10% + subsídio 50% (T=5000; C=450; N=4050; Sb=500; Ms=500)
  const pB2 = await place([shopA], { storeCoupons: [{ storeId: shopA.store.storeId, code: 'DEZ' }] }); const oB2 = pB2.orderIds[0]; await pay(pB2); await release(oB2, pB2.buyer.buyerId);
  const wA1 = await walletBalance(shopA.seller.sellerId); const oRowB2 = await orderRow(oB2);
  const rB2 = await doRefund(oB2, Number(oRowB2.total_amount), 'refund:b2');
  const lB2 = await ledger(oB2); const evB2 = await rEvents(rB2.id); const wA2 = await walletBalance(shopA.seller.sellerId); const refB2 = (await refundOf(oB2))[0];
  report('B2 reembolso DEPOIS da liberação (cupom 10% + subsídio 50%): lançamentos PR + DC + REFUND; vendedor devolve 4050 (= débito real da carteira), comissão 450 estornada, Nusali absorve 500; BUYER_ESCROW, SELLER_PAYABLE, COMISSÃO e CAIXA zerados', Number(oRowB2.total_amount) === 5000 && lB2.types.join() === 'ORDER_DELIVERY_CONFIRMED,PAYMENT_RECEIVED,REFUND_PROCESSED' && lB2.refundEntries.join() === 'NUSALI_COMMISSION_REVENUE:DEBIT:45000,PAYMENT_CLEARING:CREDIT:500000,REFUND_ABSORBED_SHIPPING:DEBIT:50000,SELLER_PAYABLE:DEBIT:405000' && lB2.bal.BUYER_ESCROW === 0 && lB2.bal.SELLER_PAYABLE === 0 && lB2.bal.NUSALI_COMMISSION_REVENUE === 0 && lB2.bal.PAYMENT_CLEARING === 0 && evB2[0].status === 'DONE' && evB2[0].snapshot_json.releaseStage === 'AFTER_RELEASE', { lB2, evB2: evB2.map((e: any) => e.status) });
  report('B2b o débito do vendedor no ledger é EXATAMENTE o que o reembolso real debitou da carteira (4050), e o dinheiro real é o do mecanismo existente (carteira 4050 → 0)', c(refB2.seller_debit_amount) === 405000 && c(wA1) === 405000 && c(wA2) === 0, { sd: refB2.seller_debit_amount, wA1, wA2 });
  // soma geral do ledger fecha
  const sumAll = (await q(`select coalesce(sum(case when direction='DEBIT' then amount else -amount end),0)::numeric as s from ledger_entries`))[0].s;
  report('B2c a soma de TODAS as linhas do ledger (débitos − créditos) é zero', Number(sumAll) === 0, sumAll);

  // B3 comissão 0% depois da liberação
  await db.update(categories).set({ commissionRate: '0.00' } as any);
  const pB3 = await place([shopB]); const oB3 = pB3.orderIds[0]; await pay(pB3); await release(oB3, pB3.buyer.buyerId);
  await db.update(categories).set({ commissionRate: '10.00' } as any);
  const rB3 = await doRefund(oB3, Number((await orderRow(oB3)).total_amount), 'refund:b3'); const lB3 = await ledger(oB3);
  report('B3 comissão 0% depois da liberação: reembolso lançado sem linha de comissão (DONE), contas do pedido zeradas', Number((await orderRow(oB3)).marketplace_commission) === 0 && !lB3.refundEntries.some((x: string) => x.startsWith('NUSALI_COMMISSION_REVENUE')) && (await rEvents(rB3.id))[0].status === 'DONE' && lB3.bal.SELLER_PAYABLE === 0 && lB3.bal.BUYER_ESCROW === 0 && lB3.bal.PAYMENT_CLEARING === 0, lB3);

  // B4 grupo com 3 vendedores: reembolsa só o filho B (antes da liberação); os outros ficam intactos
  const pB4 = await place([shopA, shopB, shopC]); await pay(pB4);
  const [kidA, kidB, kidC] = pB4.orderIds.map((id) => id);
  const ordersByShop = await Promise.all(pB4.orderIds.map(async (id) => ({ id, seller: (await orderRow(id)).seller_id })));
  const target = ordersByShop.find((x) => x.seller === shopB.seller.sellerId)!.id;
  const rB4 = await doRefund(target, Number((await orderRow(target)).total_amount), 'refund:b4');
  const others = pB4.orderIds.filter((id) => id !== target);
  const lOthers = await Promise.all(others.map((id) => ledger(id)));
  report('B4 grupo com 3 vendedores: o reembolso do filho do vendedor B gera 1 lançamento só dele; os outros dois seguem com PR e escrow retido (BUYER_ESCROW = total), sem lançamento de reembolso', (await rEvents(rB4.id))[0].status === 'DONE' && (await ledger(target)).bal.BUYER_ESCROW === 0 && lOthers.every((l) => l.types.join() === 'PAYMENT_RECEIVED' && l.bal.BUYER_ESCROW > 0), { target, lOthers: lOthers.map((l) => l.types) });
  void kidA; void kidB; void kidC;

  // ================================================================================================================================================
  // C) idempotência e concorrência
  // ================================================================================================================================================
  const reB2again = await Promise.all([1, 2, 3, 4, 5].map(() => doRefund(oB2, 5000, 'refund:b2').catch((e: any) => ({ err: e.message }))));
  const reB2seq = [await doRefund(oB2, 5000, 'refund:b2'), await doRefund(oB2, 5000, 'refund:b2')];
  report('C1 webhook/reentrega do MESMO reembolso (5 simultâneas + 2 sequenciais, mesma idempotencyKey): todas respondem alreadyProcessed; continua 1 reembolso, 1 evento, 1 lançamento; dinheiro real não mexe de novo', reB2again.every((r: any) => r.alreadyProcessed === true) && reB2seq.every((r: any) => r.alreadyProcessed === true) && (await refundOf(oB2)).length === 1 && (await rEvents(rB2.id)).length === 1 && (await refundTxCount(rB2.id)) === 1 && c(await walletBalance(shopA.seller.sellerId)) === 0, { reB2again, n: (await refundOf(oB2)).length });

  // C2 6 workers concorrentes sobre um evento de reembolso pendente => 1 lançamento
  const pC2 = await place([shopD]); const oC2 = pC2.orderIds[0]; await pay(pC2);
  const rC2 = await withStub('57P01', async () => doRefund(oC2, Number((await orderRow(oC2)).total_amount), 'refund:c2'));
  void rC2;
  const refC2 = (await refundOf(oC2))[0];
  const evC2a = await rEvents(refC2.id);
  await q(`update ledger_outbox_events set next_attempt_at = now() - interval '1 minute' where id=$1`, [evC2a[0].id]);
  const runs = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => runLedgerOutboxOnce({ workerId: `w${i}`, eventIds: [evC2a[0].id] })));
  const evC2b = await rEvents(refC2.id);
  report('C2 evento de reembolso RETRYING + 6 workers simultâneos: reclamado por exatamente 1; fica DONE com 1 lançamento REFUND_PROCESSED (e o PR já existente)', evC2a[0].status === 'RETRYING' && runs.reduce((s, r) => s + r.claimed, 0) === 1 && evC2b[0].status === 'DONE' && (await refundTxCount(refC2.id)) === 1, { runs: runs.map((r) => r.claimed), evC2b });
  // C3 chamadas diretas paralelas ao serviço do ledger
  const direct = await Promise.all(Array.from({ length: 8 }, () => FinancialLedgerService.recordRefundProcessed({ refundId: refC2.id })));
  report('C3 8 chamadas paralelas a recordRefundProcessed do mesmo reembolso: todas posted (1 nova + replays), 1 lançamento só', direct.every((r) => r.posted) && direct.filter((r) => !r.idempotentReplay).length <= 1 && (await refundTxCount(refC2.id)) === 1, direct.map((r) => ({ p: r.posted, rp: r.idempotentReplay })));

  // C4 transação externa (como o resolveDispute): o evento nasce na transação e é descarregado depois do commit
  const pC4 = await place([shopC]); const oC4 = pC4.orderIds[0]; await pay(pC4);
  const total4 = Number((await orderRow(oC4)).total_amount);
  let ext: any; await db.transaction(async (tx: any) => { ext = await doRefund(oC4, total4, 'refund:c4', tx); });
  const stageC4 = takeRefundLedgerStage(ext);
  const beforeFlush = await rEvents(ext.id);
  await flushRefundLedgerStage(stageC4, ext.id, true);
  report('C4 reembolso dentro de transação EXTERNA: o evento já existe e é atômico com a transação; só depois do commit é processado (DONE) — sem commit prévio nada era visível ao ledger', !!stageC4 && beforeFlush.length === 1 && ['PENDING', 'DONE'].includes(beforeFlush[0].status) && (await rEvents(ext.id))[0].status === 'DONE' && (await refundTxCount(ext.id)) === 1, { beforeFlush: beforeFlush.map((e: any) => e.status) });

  // ================================================================================================================================================
  // D) falha e recuperação
  // ================================================================================================================================================
  // D1 ledger fora do ar DEPOIS do commit do reembolso: dinheiro correto, evento RETRYING, sem lançamento; worker recupera sem mexer no dinheiro
  const pD1 = await place([shopC]); const oD1 = pD1.orderIds[0]; await pay(pD1); await release(oD1, pD1.buyer.buyerId);
  const total1 = Number((await orderRow(oD1)).total_amount);
  const rD1 = await withStub('57P01', () => doRefund(oD1, total1, 'refund:d1'));
  const evD1 = await rEvents(rD1.id); const moneyD1 = await moneyHash();
  const wD1 = await walletBalance(shopC.seller.sellerId);
  const wk = await runLedgerOutboxOnce({ workerId: 'w-late', now: new Date(Date.now() + 3600_000) });
  const evD1b = await rEvents(rD1.id); const moneyD1b = await moneyHash();
  report('D1 ledger fora do ar após o commit do reembolso: reembolso e carteira já corretos, evento RETRYING (tentativa 1) e nenhum lançamento; o worker recupera → DONE, 1 lançamento, e o dinheiro real é IDÊNTICO antes/depois do worker', rD1.status === 'processed' && evD1[0].status === 'RETRYING' && evD1[0].attempts === 1 && evD1[0].last_error_code === 'PG_57P01' && wD1 === 0 && wk.claimed >= 1 && evD1b[0].status === 'DONE' && (await refundTxCount(rD1.id)) === 1 && JSON.stringify(moneyD1) === JSON.stringify(moneyD1b), { evD1, evD1b });

  // D2 evento perdido: a tabela do outbox some durante o reembolso E o lançamento direto também falha => dinheiro correto, nada no outbox/ledger
  const pD2 = await place([shopB]); const oD2 = pD2.orderIds[0]; await pay(pD2);
  const total2 = Number((await orderRow(oD2)).total_amount);
  await pool.query(`alter table ${OUTBOX_TABLE} rename to ${OUTBOX_TABLE}_hidden`);
  let rD2: any; try { rD2 = await withStub(null, () => doRefund(oD2, total2, 'refund:d2')); } finally { await pool.query(`alter table ${OUTBOX_TABLE}_hidden rename to ${OUTBOX_TABLE}`); }
  const moneyD2 = await moneyHash();
  const recD2 = await runLedgerReconciliation({ triggeredBy: 'e3-test', now: new Date(Date.now() + 3600_000) });
  const fD2 = await q(`select finding_type, severity from ledger_reconciliation_findings where order_id=$1 and status<>'RESOLVED' and finding_type like 'REFUND%'`, [oD2]);
  report('D2 evento do reembolso perdido (outbox indisponível + ledger direto fora): reembolso e Escrow corretos, 0 eventos e 0 lançamentos; a reconciliação acha o reembolso concluído SEM evento (REFUND_LEDGER_MISSING_NO_EVENT, CRITICAL após o prazo)', rD2.status === 'processed' && (await rEvents(rD2.id)).length === 0 && (await refundTxCount(rD2.id)) === 0 && recD2.status === 'OK' && fD2.some((x: any) => x.finding_type === 'REFUND_LEDGER_MISSING_NO_EVENT' && x.severity === 'CRITICAL'), { fD2 });
  const dry = await repairMissingEvents({ actorUserId: admin, dryRun: true });
  const candD2 = dry.candidates.filter((x: any) => x.refundId === rD2.id);
  const moneyD2dry = await moneyHash();
  const app = await repairMissingEvents({ actorUserId: admin, dryRun: false });
  await runLedgerOutboxOnce({ workerId: 'w-repair' });
  const recD2b = await runLedgerReconciliation({ triggeredBy: 'e3-test2', now: new Date(Date.now() + 3600_000) });
  const fD2b = await q(`select finding_type, status from ledger_reconciliation_findings where order_id=$1 and finding_type like 'REFUND%' order by finding_type`, [oD2]);
  report('D3 reparo MANUAL e auditado: o dry-run lista o reembolso (REFUND_PROCESSED) sem escrever; o --apply cria o evento; o worker lança; a reconciliação marca o achado RESOLVED; dinheiro real intacto', candD2.length === 1 && candD2[0].eventType === 'REFUND_PROCESSED' && dry.enqueued === 0 && app.enqueued >= 1 && (await rEvents(rD2.id))[0]?.status === 'DONE' && (await refundTxCount(rD2.id)) === 1 && fD2b.every((x: any) => x.status === 'RESOLVED') && JSON.stringify(moneyD2) === JSON.stringify(moneyD2dry) && JSON.stringify(await moneyHash()) === JSON.stringify(moneyD2) && recD2b.status === 'OK', { candD2, fD2b });

  // D4 reentrega do webhook recria o evento perdido (sem reparo manual)
  const pD4 = await place([shopD]); const oD4 = pD4.orderIds[0]; await pay(pD4);
  const total4b = Number((await orderRow(oD4)).total_amount);
  await pool.query(`alter table ${OUTBOX_TABLE} rename to ${OUTBOX_TABLE}_hidden`);
  let rD4: any; try { rD4 = await withStub(null, () => doRefund(oD4, total4b, 'refund:d4')); } finally { await pool.query(`alter table ${OUTBOX_TABLE}_hidden rename to ${OUTBOX_TABLE}`); }
  const lostBefore = (await rEvents(rD4.id)).length;
  const redeliver = await doRefund(oD4, total4b, 'refund:d4');
  report('D4 reentrega do webhook do mesmo reembolso (já concluído) recria o evento que se perdeu → DONE; 1 reembolso, 1 evento, 1 lançamento; nada se perde e nada se duplica', lostBefore === 0 && redeliver.alreadyProcessed === true && (await rEvents(rD4.id))[0]?.status === 'DONE' && (await refundOf(oD4)).length === 1 && (await refundTxCount(rD4.id)) === 1, { lostBefore });

  // D5 worker que cai com o lease
  const pD5 = await place([shopC]); const oD5 = pD5.orderIds[0]; await pay(pD5);
  const rD5 = await withStub('57P01', async () => doRefund(oD5, Number((await orderRow(oD5)).total_amount), 'refund:d5'));
  const evD5 = (await rEvents(rD5.id))[0]; await q(`update ledger_outbox_events set next_attempt_at = now() - interval '1 minute' where id=$1`, [evD5.id]);
  const t0 = new Date(); const claimedA = await claimEvents(getDb() as any, { workerId: 'worker-A', limit: 5, now: t0, leaseSeconds: 300, eventIds: [evD5.id] });
  const mid = await runLedgerOutboxOnce({ workerId: 'worker-B', now: new Date(t0.getTime() + 60_000), eventIds: [evD5.id] });
  const re = await runLedgerOutboxOnce({ workerId: 'worker-B', now: new Date(t0.getTime() + 301_000 + 1000), eventIds: [evD5.id] });
  const stale = await processClaimedEvent(getDb() as any, claimedA[0], 'worker-A', new Date(), resolvePolicy());
  report('D5 reinício do worker: A reclama e "cai"; B não vê o evento durante o lease, reassume depois e conclui DONE com 1 lançamento; o retardatário A é rejeitado (LEASE_LOST)', claimedA.length === 1 && mid.claimed === 0 && re.claimed === 1 && (await rEvents(rD5.id))[0].status === 'DONE' && stale === 'LEASE_LOST' && (await refundTxCount(rD5.id)) === 1, { claimedA: claimedA.length, mid: mid.claimed, re: re.claimed, stale });

  // D6 pré-requisitos: pagamento E liberação NÃO contabilizados (ledger fora do ar na época); o reembolso posterior garante PR → DC → REFUND, nessa ordem, sem BUYER_ESCROW negativo
  const stubMany = async (methods: string[], fn: () => Promise<any>) => {
    const orig: any = {}; for (const m of methods) { orig[m] = (FinancialLedgerService as any)[m]; (FinancialLedgerService as any)[m] = async () => { throw pgErr('57P01', 'ledger fora do ar (simulado)'); }; }
    try { return await fn(); } finally { for (const m of methods) (FinancialLedgerService as any)[m] = orig[m]; }
  };
  const prevOb = process.env.LEDGER_OUTBOX_ENABLED; process.env.LEDGER_OUTBOX_ENABLED = 'false';
  const pD6 = await place([shopB]); const oD6 = pD6.orderIds[0];
  try { await stubMany(['recordPaymentReceived'], () => pay(pD6)); await stubMany(['recordPaymentReceived', 'recordDeliveryConfirmed'], () => release(oD6, pD6.buyer.buyerId)); } finally { process.env.LEDGER_OUTBOX_ENABLED = prevOb; }
  const lD6pre = await ledger(oD6);
  const rD6 = await doRefund(oD6, Number((await orderRow(oD6)).total_amount), 'refund:d6'); const lD6 = await ledger(oD6);
  report('D6 pagamento e liberação nunca foram lançados (ledger fora do ar na época): ao concluir o reembolso, o ledger garante PAYMENT_RECEIVED → ORDER_DELIVERY_CONFIRMED → REFUND_PROCESSED, tudo zerado, BUYER_ESCROW nunca negativo', lD6pre.types.length === 0 && lD6.types.join() === 'ORDER_DELIVERY_CONFIRMED,PAYMENT_RECEIVED,REFUND_PROCESSED' && lD6.bal.BUYER_ESCROW === 0 && lD6.bal.SELLER_PAYABLE === 0 && lD6.bal.PAYMENT_CLEARING === 0 && (await rEvents(rD6.id))[0].status === 'DONE', { lD6pre: lD6pre.types, lD6 });

  // D7 divergência: o reembolso mudou depois de o evento ser gravado => intervenção, nada lançado, nada corrigido em silêncio
  const pD7 = await place([shopC]); const oD7 = pD7.orderIds[0]; await pay(pD7);
  const rD7 = await withStub('57P01', async () => doRefund(oD7, Number((await orderRow(oD7)).total_amount), 'refund:d7'));
  await q(`update refunds set amount = amount - 100 where id=$1`, [rD7.id]);
  const evD7 = (await rEvents(rD7.id))[0]; await q(`update ledger_outbox_events set next_attempt_at = now() - interval '1 minute' where id=$1`, [evD7.id]);
  await runLedgerOutboxOnce({ workerId: 'w-d7', eventIds: [evD7.id] });
  const evD7b = (await rEvents(rD7.id))[0];
  report('D7 reembolso alterado depois de enfileirado: o hash do snapshot não confere => NEEDS_INTERVENTION (SNAPSHOT_DIVERGED), nenhum lançamento de reembolso e nada recalculado', evD7b.status === 'NEEDS_INTERVENTION' && evD7b.last_error_code === 'SNAPSHOT_DIVERGED' && (await refundTxCount(rD7.id)) === 0, evD7b);

  // ================================================================================================================================================
  // E) reembolso NÃO concluído nunca é lançado
  // ================================================================================================================================================
  const pE1 = await place([shopC]); const oE1 = pE1.orderIds[0]; await pay(pE1);
  const totalE = Number((await orderRow(oE1)).total_amount);
  const evBefore = (await q(`select count(*)::int n from ledger_outbox_events where event_type='REFUND_PROCESSED'`))[0].n;
  const resv: any = await reserveOrderRefund({ orderId: oE1, amount: totalE, reason: 'reserva E3', idempotencyKey: 'refund:e1', performedBy: admin });
  const stPend = (await q('select status from refunds where id=$1', [resv.id]))[0].status;
  const direct0 = await FinancialLedgerService.recordRefundProcessed({ refundId: resv.id });
  await q(`update refunds set status='provider_pending' where id=$1`, [resv.id]);
  const direct1 = await FinancialLedgerService.recordRefundProcessed({ refundId: resv.id });
  await q(`update refunds set status='failed' where id=$1`, [resv.id]);
  const direct2 = await FinancialLedgerService.recordRefundProcessed({ refundId: resv.id });
  const evNone = (await q(`select count(*)::int n from ledger_outbox_events where event_type='REFUND_PROCESSED'`))[0].n;
  report('E1 reembolso pendente / em andamento no provedor / falhado: nenhum evento no outbox e nenhum lançamento; o serviço recusa com REFUND_NOT_PROCESSED', stPend === 'pending' && [direct0, direct1, direct2].every((r) => r.skipped && r.reason === 'REFUND_NOT_PROCESSED') && evNone === evBefore && (await refundTxCount(resv.id)) === 0, { stPend, d: [direct0.reason, direct1.reason, direct2.reason] });
  // E2 o provedor confirma (DONE) => o fluxo D.5 conclui o reembolso e SÓ ENTÃO nasce o evento
  const pE2 = await place([shopD]); const oE2 = pE2.orderIds[0]; await pay(pE2); await release(oE2, pE2.buyer.buyerId);
  const totalE2 = Number((await orderRow(oE2)).total_amount);
  const resv2: any = await reserveOrderRefund({ orderId: oE2, amount: totalE2, reason: 'reserva E3 DONE', idempotencyKey: 'refund:e2', performedBy: admin });
  await q(`update refunds set status='provider_pending' where id=$1`, [resv2.id]);
  const noEv = (await rEvents(resv2.id)).length;
  const key = (await q('select provider_correlation_key k from refunds where id=$1', [resv2.id]))[0].k;
  const fin = await finalizeReservedOrderRefund(resv2.id, { dateCreated: '2026-01-01 10:00:00', status: 'DONE', value: totalE2, description: key, endToEndIdentifier: null, transactionReceiptUrl: null, refundedSplits: [] } as any);
  const evAfterFirst = (await rEvents(resv2.id)).length;
  const fin2 = await finalizeReservedOrderRefund(resv2.id, { dateCreated: '2026-01-01 10:00:00', status: 'DONE', value: totalE2, description: key, endToEndIdentifier: null, transactionReceiptUrl: null, refundedSplits: [] } as any);
  const lE2 = await ledger(oE2);
  report('E2 provedor-gerenciado: reservado/pendente não gera evento; ao concluir (DONE) o evento nasce na transação de finalização e é lançado (depois da liberação: vendedor devolve o líquido); a segunda finalização é idempotente', noEv === 0 && evAfterFirst === 1 && fin.outcome === 'FINALIZED' && fin2.outcome === 'ALREADY_TERMINAL_PROCESSED' && (await rEvents(resv2.id)).length === 1 && (await rEvents(resv2.id))[0].status === 'DONE' && (await refundTxCount(resv2.id)) === 1 && lE2.bal.SELLER_PAYABLE === 0 && lE2.bal.BUYER_ESCROW === 0, { fin: fin.outcome, fin2: fin2.outcome, lE2 });

  // ================================================================================================================================================
  // F) cutoff e outbox desligado
  // ================================================================================================================================================
  const pF1 = await place([shopC]); const oF1 = pF1.orderIds[0]; await pay(pF1);
  await q(`update orders set created_at = '2025-06-01 10:00:00' where id=$1`, [oF1]);
  const rF1 = await doRefund(oF1, Number((await orderRow(oF1)).total_amount), 'refund:f1');
  const dF1 = await FinancialLedgerService.recordRefundProcessed({ refundId: rF1.id });
  report('F1 pedido ANTERIOR ao cutoff: o reembolso real conclui, mas nenhum evento é criado e o serviço devolve LEGACY_ORDER — nada é lançado e nada entra na reconciliação', rF1.status === 'processed' && (await rEvents(rF1.id)).length === 0 && dF1.reason === 'LEGACY_ORDER' && (await refundTxCount(rF1.id)) === 0, { dF1 });
  const prevFlag = process.env.LEDGER_OUTBOX_ENABLED; process.env.LEDGER_OUTBOX_ENABLED = 'false';
  let rF2: any, oF2 = '';
  try { const pF2 = await place([shopD]); oF2 = pF2.orderIds[0]; await pay(pF2); rF2 = await doRefund(oF2, Number((await orderRow(oF2)).total_amount), 'refund:f2'); } finally { process.env.LEDGER_OUTBOX_ENABLED = prevFlag; }
  const lF2 = await ledger(oF2);
  report('F2 outbox DESLIGADO: o reembolso é lançado direto (PR + REFUND), sem nenhum evento no outbox, com os mesmos valores', (await allEvents(oF2)).length === 0 && lF2.types.join() === 'PAYMENT_RECEIVED,REFUND_PROCESSED' && lF2.bal.BUYER_ESCROW === 0 && (await refundTxCount(rF2.id)) === 1, lF2);

  // ================================================================================================================================================
  // G) reconciliação
  // ================================================================================================================================================
  const recG = await runLedgerReconciliation({ triggeredBy: 'e3-final', now: new Date() });
  const bad2 = await q(`select finding_type, severity, order_id from ledger_reconciliation_findings where status<>'RESOLVED' and (finding_type like 'REFUND%' or finding_type in ('ESCROW_BALANCE_MISMATCH','DELIVERY_LEDGERED_WITHOUT_RELEASE','DELIVERY_AMOUNT_MISMATCH','PAYMENT_AMOUNT_MISMATCH'))`);
  report('G1 reconciliação sobre todos os cenários acima (antes/depois da liberação, cupom, 0%, grupo, recuperados): nenhum achado de reembolso/saldo/valor aberto (o REFUND_NOT_LEDGERED da E2 deixou de existir)', recG.status === 'OK' && bad2.filter((x: any) => x.order_id !== oD7).length === 0 && !(recG.findingsByType['REFUND_NOT_LEDGERED']), { bad2, byType: recG.findingsByType });
  report('G1b o único achado aberto é o do evento DIVERGENTE do D7 (REFUND_EVENT_NEEDS_INTERVENTION, CRITICAL): a divergência fica visível, não é corrigida em silêncio', bad2.length === 1 && bad2[0].order_id === oD7 && bad2[0].finding_type === 'REFUND_EVENT_NEEDS_INTERVENTION' && bad2[0].severity === 'CRITICAL', bad2);
  const view = (over: any = {}) => ({
    order: { id: 'o9', currency: 'XOF', totalAmount: '5000.00', escrowStatus: 'refunded', createdAt: new Date(), escrowCreatedAt: new Date(), escrowReleasedAt: null, updatedAt: new Date(),
      snapshot: { ...O, id: 'o9', subtotal: null, commissionBase: null, discountAmount: null, shippingChargedToBuyer: null, shippingSellerSubsidy: null, shippingMarketplaceSubsidy: null } },
    prTx: { id: 'p', status: 'POSTED' }, dcTx: null, prEvent: null, dcEvent: null,
    prEntries: [{ code: 'PAYMENT_CLEARING', direction: 'DEBIT' as const, amount: '5000.00' }, { code: 'BUYER_ESCROW', direction: 'CREDIT' as const, amount: '5000.00' }], dcEntries: [], refunds: [], ...over,
  });
  const mkRef = (amount: string, entries: any[], txStatus = 'POSTED') => ({ id: 'r9', amount, currency: 'XOF', sellerDebitAmount: null, processedAt: new Date(), tx: { id: 'rt', status: txStatus }, event: null, entries });
  const full = [{ code: 'BUYER_ESCROW', direction: 'DEBIT' as const, amount: '5000.00' }, { code: 'PAYMENT_CLEARING', direction: 'CREDIT' as const, amount: '5000.00' }];
  const fOk = evaluateOrder(view({ refunds: [mkRef('5000.00', full)] }) as any, new Date(), 15);
  const fWrong = evaluateOrder(view({ refunds: [mkRef('5000.00', [{ code: 'BUYER_ESCROW', direction: 'DEBIT', amount: '4000.00' }, { code: 'PAYMENT_CLEARING', direction: 'CREDIT', amount: '4000.00' }])] }) as any, new Date(), 15);
  const partial = [{ code: 'BUYER_ESCROW', direction: 'DEBIT' as const, amount: '2000.00' }, { code: 'PAYMENT_CLEARING', direction: 'CREDIT' as const, amount: '2000.00' }];
  const fPartial = evaluateOrder(view({ refunds: [mkRef('2000.00', partial)] }) as any, new Date(), 15);
  report('G2 avaliação pura: reembolso total correto = nenhum achado; lançamento com valor divergente = REFUND_AMOUNT_MISMATCH (CRITICAL); reembolso PARCIAL antes da liberação = REFUND_PARTIAL_ESCROW_RESIDUAL (WARNING: o mecanismo real fecha o Escrow e o restante fica sem destino — o ledger mostra isso, não esconde)', fOk.length === 0 && fWrong.some((x) => x.type === 'REFUND_AMOUNT_MISMATCH' && x.severity === 'CRITICAL') && fPartial.some((x) => x.type === 'REFUND_PARTIAL_ESCROW_RESIDUAL' && x.severity === 'WARNING') && !fPartial.some((x) => x.type === 'ESCROW_BALANCE_MISMATCH'), { fOk, fWrong, fPartial });
  const fNoTx = evaluateOrder(view({ refunds: [{ ...mkRef('5000.00', []), tx: null, event: null, processedAt: new Date(Date.now() - 3600_000) }] }) as any, new Date(), 15);
  report('G3 reembolso concluído sem lançamento e sem evento há mais que o prazo = REFUND_LEDGER_MISSING_NO_EVENT (CRITICAL), sem somar ruído de saldo', fNoTx.some((x) => x.type === 'REFUND_LEDGER_MISSING_NO_EVENT' && x.severity === 'CRITICAL') && !fNoTx.some((x) => x.type === 'ESCROW_BALANCE_MISMATCH'), fNoTx);

  await pool.end();
  console.log(`\n${passed}/${total} testes passaram.`);
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
