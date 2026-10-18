/**
 * LEDGER SOMBRA — E4: REVERSÃO DO CUSTO DE FRETE (subsídio da Nusali + frete absorvido) quando houve reembolso. Postgres DESCARTAVEL com os serviços reais (pedido →
 * pagamento → liberação → reembolso → reversão registrada → outbox → ledger). Prova: por padrão NADA é revertido (o subsídio e o frete absorvido continuam custo da
 * Nusali); só um registro auditado e com evidência, num pedido reembolsado DEPOIS da liberação, reverte a parcela efetivamente devolvida — com divisão exata e acumulada;
 * reembolso antes da liberação nunca tem o que reverter; idempotência, concorrência, falha/recuperação, reconciliação; e nenhum saldo real muda. Nunca produção.
 */
import { ledgerTestDbUrl } from './support/ledgerE2Env.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import { purchaseGroups, payments, paymentAttempts } from '../src/db/schema.js';
import { OrderService } from '../src/server/modules/orders/orderService.js';
import { PaymentService } from '../src/server/modules/payments/paymentService.js';
import { processRefund } from '../src/server/modules/payments/refundService.js';
import { FinancialLedgerService } from '../src/server/modules/ledger/financialLedgerService.js';
import { allocateReversalParts, buildShippingCostReversalEntries, shippingCostCapacity } from '../src/server/modules/ledger/shippingReversalEntries.js';
import { recordShippingCostReversal, ShippingReversalError } from '../src/server/modules/ledger/shippingReversalService.js';
import { runLedgerOutboxOnce } from '../src/server/modules/ledger/outbox/outboxService.js';
import { runLedgerReconciliation, repairMissingEvents, evaluateOrder } from '../src/server/modules/ledger/outbox/reconciliationService.js';
import { resolveCartShippingPreview } from '../src/server/modules/shipping/shippingPreviewService.js';
import { setupCheckoutKit } from './support/checkoutTestKit.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)).slice(0, 900)}`); };
const c = (n: any) => Math.round(Number(n) * 100);
const pgErr = (code: string, msg = 'simulated') => Object.assign(new Error(msg), { cause: { code } });
const OUTBOX_TABLE = 'ledger_outbox_events';
const M = (s: string) => BigInt(Math.round(Number(s) * 1_000_000));

async function main() {
  const pool = new pg.Pool({ connectionString: ledgerTestDbUrl, ssl: { rejectUnauthorized: false }, max: 20 });
  const db = drizzle(pool, { schema });
  const q = async (sqlText: string, p: any[] = []) => (await pool.query(sqlText, p)).rows;

  // migrações 0039, 0040 e 0041 (as MESMAS do repositório) aplicadas no banco descartável se ainda não existirem
  const apply = async (file: string) => { for (const stmt of fs.readFileSync(path.join(root, 'drizzle', file), 'utf8').split('--> statement-breakpoint')) if (stmt.trim()) await pool.query(stmt); };
  if (!(await q(`select to_regclass('public.ledger_outbox_events') t`))[0].t) await apply('0039_ledger_outbox.sql');
  if (!(await q(`select 1 from pg_constraint where conname='ledger_transactions_type_check' and pg_get_constraintdef(oid) like '%REFUND_PROCESSED%'`)).length) await apply('0040_ledger_refunds.sql');
  if (!(await q(`select to_regclass('public.shipping_cost_reversals') t`))[0].t) await apply('0041_ledger_shipping_reversal.sql');

  const kit = await setupCheckoutKit(db, 'e4');
  await kit.setFlag('multiSellerCheckoutEnabled', true); await kit.setFlag('defaultShippingPolicyMode', 'CUSTOMER_PAYS');
  const setSubsidy = (percent: number) => kit.setFlag('shippingNusaliSubsidy', { enabled: false, percent: 0, rules: { 'GW:STANDARD': { enabled: true, percent } } });
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
  const place = async (shops: any[]) => {
    const buyer = await kit.makeBuyer(bissau.id); for (const s of shops) await kit.addToCart(buyer.cartId, s.product.id, 1, s.price);
    const qq: any = await resolveCartShippingPreview({ destinationShippingSectorId: bissau.id, serviceCode: 'STANDARD', items: shops.map((s) => ({ productId: s.product.id, variantId: null, quantity: 1 })) }, db);
    const opt = qq.services?.find((o: any) => o.code === 'STANDARD') ?? qq;
    const v: any = await OrderService.createOrderFromCart({ userId: buyer.buyerId, addressId: buyer.addressId, paymentMethod: 'pix', shippingSelection: { serviceCode: 'STANDARD', expectedShippingChargedToBuyer: opt.shippingChargedToBuyer } } as any, db);
    return { buyer, value: v, orderIds: v.orders.map((o: any) => o.id) as string[] };
  };
  const newPay = async (placed: any) => {
    const groupId = placed.value.purchaseGroup.id; const [g] = await db.select().from(purchaseGroups).where(eq(purchaseGroups.id, groupId));
    const payId = kit.uid('pay_group'), ext = kit.uid('EXT');
    await db.insert(payments).values({ id: payId, orderId: null, purchaseGroupId: groupId, settlementRole: 'candidate', buyerId: placed.buyer.buyerId, amount: String(g.totalAmount), currency: 'XOF', provider: 'asaas', method: 'pix', status: 'pending', idempotencyKey: `asaas_pix_group:${groupId}:${payId}`, transactionRef: ext, createdAt: new Date(), updatedAt: new Date() } as any);
    await db.insert(paymentAttempts).values({ id: kit.uid('att'), paymentId: payId, provider: 'asaas', status: 'reserved', createdAt: new Date() } as any);
    return { groupId, payId, ext, total: Number(g.totalAmount) };
  };
  const pay = async (placed: any) => { const p = await newPay(placed); await PaymentService.confirmPurchaseGroupPayment(p.groupId, p.payId, { provider: 'asaas', transactionRef: p.ext, receivedValue: p.total }); return p; };
  const release = async (orderId: string, buyerId: string) => { await db.update(schema.shipments).set({ status: 'DELIVERED' } as any).where(eq(schema.shipments.orderId, orderId)); return PaymentService.releaseEscrowForOrder(orderId, { performedBy: buyerId }); };
  const orderRow = async (id: string) => (await q('select * from orders where id=$1', [id]))[0];
  const refundAll = async (orderId: string, key: string) => processRefund({ orderId, amount: Number((await orderRow(orderId)).total_amount), reason: 'teste E4', idempotencyKey: key, performedBy: admin });
  /** pedido pago, liberado (ou não) e reembolsado por inteiro */
  const scenario = async (shopX: any, percent: number, afterRelease: boolean, key: string) => {
    await setSubsidy(percent);
    const p = await place([shopX]); const oid = p.orderIds[0]; await pay(p);
    if (afterRelease) await release(oid, p.buyer.buyerId);
    const ref = await refundAll(oid, key);
    return { oid, buyerId: p.buyer.buyerId, ref, row: await orderRow(oid) };
  };
  const bal = async (orderId: string) => {
    const e = await q(`select a.code, e.direction, e.amount::numeric as amount from ledger_entries e join ledger_transactions t on t.id=e.transaction_id join ledger_accounts a on a.id=e.account_id where t.order_id=$1`, [orderId]);
    const b: Record<string, number> = {}; for (const r of e) b[r.code] = (b[r.code] || 0) + (r.direction === 'CREDIT' ? 1 : -1) * c(r.amount); return b;
  };
  const types = async (orderId: string) => (await q('select type from ledger_transactions where order_id=$1 order by type', [orderId])).map((r: any) => r.type).join();
  const revEvents = async (reversalId: string) => q(`select id, status, attempts, last_error_code, ledger_transaction_id, snapshot_json from ledger_outbox_events where idempotency_key=$1`, [`shipping_cost_reversed:${reversalId}`]);
  const revTx = async (reversalId: string) => (await q(`select count(*)::int n from ledger_transactions where idempotency_key=$1`, [`shipping_cost_reversed:${reversalId}`]))[0].n;
  const revEntries = async (reversalId: string) => (await q(`select a.code, e.direction, e.amount::numeric as amount from ledger_entries e join ledger_transactions t on t.id=e.transaction_id join ledger_accounts a on a.id=e.account_id where t.idempotency_key=$1`, [`shipping_cost_reversed:${reversalId}`])).map((r: any) => `${r.code}:${r.direction}:${c(r.amount)}`).sort().join();
  const moneyHash = async () => (await q(`select
    (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from wallets x) w, (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from wallet_transactions x) wt,
    (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from escrow_accounts x) esc, (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from escrow_transactions x) etx,
    (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from payments x) pay, (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from orders x) ord,
    (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from refunds x) ref`))[0];
  const stubMany = async (methods: string[], code: string | null, fn: () => Promise<any>) => {
    const orig: any = {}; for (const m of methods) { orig[m] = (FinancialLedgerService as any)[m]; (FinancialLedgerService as any)[m] = async () => { throw code ? pgErr(code, 'conexão perdida (simulada)') : new Error('ledger down (simulado)'); }; }
    try { return await fn(); } finally { for (const m of methods) (FinancialLedgerService as any)[m] = orig[m]; }
  };
  const rec = (oid: string, amount: string | number, key: string, over: Partial<Parameters<typeof recordShippingCostReversal>[0]> = {}) =>
    recordShippingCostReversal({ orderId: oid, amount, evidenceRef: 'PROTOCOLO-TRANSP-123', reason: 'transportadora devolveu parte do custo de frete', actorUserId: admin, idempotencyKey: key, ...over });
  const errCode = async (fn: () => Promise<any>) => { try { await fn(); return null; } catch (e: any) { return e instanceof ShippingReversalError ? e.code : `OUTRO:${e.message}`; } };

  const shopA = await shop('a'), shopB = await shop('b'), shopC = await shop('c'), shopD = await shop('d');

  // ================================================================================================================================================
  // A) funções puras
  // ================================================================================================================================================
  const K = M('1000'); const Ms = M('500');
  const a1a = allocateReversalParts({ cost: K, subsidy: Ms, alreadyReversed: 0n, amount: M('400') });
  const a1b = allocateReversalParts({ cost: K, subsidy: Ms, alreadyReversed: M('400'), amount: M('600') });
  report('A1 alocação cumulativa (K=1000, subsídio=500): 400 → 200/200; depois 600 → 300/300; a soma reverte EXATAMENTE o subsídio (500) e o frete absorvido (500)', a1a.subsidyPart === M('200') && a1a.absorbedPart === M('200') && a1b.subsidyPart === M('300') && a1b.absorbedPart === M('300'), { a1a, a1b });
  const K3 = M('1000'); const Ms3 = M('333.33'); let al = 0n; let sSum = 0n; let aSum = 0n;
  for (const x of ['333.33', '333.33', '333.34']) { const p = allocateReversalParts({ cost: K3, subsidy: Ms3, alreadyReversed: al, amount: M(x) }); al += M(x); sSum += p.subsidyPart; aSum += p.absorbedPart; }
  report('A2 divisão com centavos quebrados (K=1000, subsídio=333,33; 3 reversões): sem sobra nem falta — soma do subsídio = 333,33 e do absorvido = 666,67', sSum === Ms3 && aSum === M('666.67') && sSum + aSum === K3, { sSum, aSum });
  let al2 = 0n; let sSum2 = 0n; let aSum2 = 0n;
  for (let i = 0; i < 100; i++) { const p = allocateReversalParts({ cost: K3, subsidy: Ms3, alreadyReversed: al2, amount: M('10') }); al2 += M('10'); sSum2 += p.subsidyPart; aSum2 += p.absorbedPart; }
  report('A2b 100 reversões de 10 (K=1000, subsídio=333,33): a alocação CUMULATIVA fecha exato (subsídio 333,33 + absorvido 666,67); arredondar cada reversão isoladamente derivaria centavos (100 × 3,33 = 333,00)', sSum2 === Ms3 && aSum2 === M('666.67'), { sSum2, aSum2 });
  const a3 = allocateReversalParts({ cost: M('1000'), subsidy: 0n, alreadyReversed: 0n, amount: M('300') });
  const a4 = allocateReversalParts({ cost: M('1000'), subsidy: M('1000'), alreadyReversed: 0n, amount: M('300') });
  report('A3 sem subsídio: tudo vai para o frete absorvido; A4 subsídio integral: tudo vai para o subsídio', a3.subsidyPart === 0n && a3.absorbedPart === M('300') && a4.subsidyPart === M('300') && a4.absorbedPart === 0n, { a3, a4 });
  const ord = { id: 'o1', buyerId: 'b', sellerId: 's', storeId: 'st', countryCode: 'GW', currency: 'XOF', shippingChargedToBuyer: '500.00', shippingSellerSubsidy: null, shippingMarketplaceSubsidy: '500.00' };
  const ok = buildShippingCostReversalEntries(ord, { id: 'r', amount: '400.00', currency: 'XOF', subsidyPart: '200.00', absorbedPart: '200.00' });
  const bad = [
    buildShippingCostReversalEntries(ord, { id: 'r', amount: '1200.00', currency: 'XOF', subsidyPart: '500.00', absorbedPart: '700.00' }),
    buildShippingCostReversalEntries(ord, { id: 'r', amount: '400.00', currency: 'XOF', subsidyPart: '100.00', absorbedPart: '200.00' }),
    buildShippingCostReversalEntries(ord, { id: 'r', amount: '400.00', currency: 'EUR', subsidyPart: '200.00', absorbedPart: '200.00' }),
    buildShippingCostReversalEntries(ord, { id: 'r', amount: '400.00', currency: 'XOF', subsidyPart: '600.00', absorbedPart: '-200.00' }),
    buildShippingCostReversalEntries({ ...ord, shippingChargedToBuyer: null, shippingMarketplaceSubsidy: null }, { id: 'r', amount: '10.00', currency: 'XOF', subsidyPart: '0.00', absorbedPart: '10.00' }),
  ];
  report('A5 construtor: D SHIPPING_PAYABLE = C subsídio + C absorvido; entradas inválidas (acima do custo, partes que não somam, moeda, parte negativa, pedido sem custo de frete) nunca viram lançamento',
    ok.status === 'OK' && ok.entries.length === 3 && shippingCostCapacity(ord).cost === M('1000') && bad.every((b) => b.status === 'SKIPPED'), { ok: ok.status, bad: bad.map((b: any) => b.status) });

  // ================================================================================================================================================
  // B) reembolso ANTES da liberação: nada a reverter
  // ================================================================================================================================================
  const sB1 = await scenario(shopC, 50, false, 'refund:e4:b1');
  const eB1 = await errCode(() => rec(sB1.oid, '100', 'rev:e4:b1'));
  report('B1 reembolso ANTES da liberação: a entrega nunca foi contabilizada, então o subsídio nunca foi reconhecido (nenhuma conta de subsídio/frete no ledger do pedido) — a reversão é recusada (REFUNDED_BEFORE_RELEASE), sem registro nem evento', eB1 === 'REFUNDED_BEFORE_RELEASE' && (await q('select count(*)::int n from shipping_cost_reversals where order_id=$1', [sB1.oid]))[0].n === 0 && !('SHIPPING_SUBSIDY_NUSALI' in (await bal(sB1.oid))) && !('SHIPPING_PAYABLE' in (await bal(sB1.oid))) && (await types(sB1.oid)) === 'PAYMENT_RECEIVED,REFUND_PROCESSED', { eB1, t: await types(sB1.oid) });

  // ================================================================================================================================================
  // C) reembolso DEPOIS da liberação, subsídio de 50% (Sb=500, Ms=500, K=1000)
  // ================================================================================================================================================
  const sC = await scenario(shopA, 50, true, 'refund:e4:c1');
  const b0 = await bal(sC.oid);
  report('C0 SEM nenhum registro, tudo permanece custo da Nusali: subsídio 500 (despesa) + frete absorvido 500 = 1000 = o frete a pagar (SHIPPING_PAYABLE 1000); nada é revertido por "padrão"', b0.SHIPPING_SUBSIDY_NUSALI === -50000 && b0.REFUND_ABSORBED_SHIPPING === -50000 && b0.SHIPPING_PAYABLE === 100000 && (await q('select count(*)::int n from ledger_transactions where type=$1 and order_id=$2', ['SHIPPING_COST_REVERSED', sC.oid]))[0].n === 0, b0);
  const moneyBefore = await moneyHash();
  const r1 = await rec(sC.oid, '400', 'rev:e4:c1');
  const ev1 = await revEvents(r1.reversalId); const bC1 = await bal(sC.oid);
  report('C1 reversão de 400 registrada: 1 evento DONE ligado ao lançamento; D SHIPPING_PAYABLE 400 / C subsídio 200 / C absorvido 200; saldos: frete a pagar 600, subsídio 300, absorvido 300', r1.alreadyRecorded === false && r1.subsidyPart === '200.00' && r1.absorbedPart === '200.00' && ev1.length === 1 && ev1[0].status === 'DONE' && (await revEntries(r1.reversalId)) === 'REFUND_ABSORBED_SHIPPING:CREDIT:20000,SHIPPING_PAYABLE:DEBIT:40000,SHIPPING_SUBSIDY_NUSALI:CREDIT:20000' && bC1.SHIPPING_PAYABLE === 60000 && bC1.SHIPPING_SUBSIDY_NUSALI === -30000 && bC1.REFUND_ABSORBED_SHIPPING === -30000, { ev1, bC1 });
  const r2 = await rec(sC.oid, '600', 'rev:e4:c2'); const bC2 = await bal(sC.oid);
  report('C2 segunda reversão (600, total = custo de frete): divisão cumulativa exata 300/300; subsídio, frete absorvido e frete a pagar ZERAM — a Nusali não arca com o custo que foi devolvido', r2.subsidyPart === '300.00' && r2.absorbedPart === '300.00' && bC2.SHIPPING_PAYABLE === 0 && (bC2.SHIPPING_SUBSIDY_NUSALI ?? 0) === 0 && (bC2.REFUND_ABSORBED_SHIPPING ?? 0) === 0 && (await revEvents(r2.reversalId))[0].status === 'DONE', bC2);
  const eC3 = await errCode(() => rec(sC.oid, '0.01', 'rev:e4:c3'));
  report('C3 acima do custo de frete já revertido por inteiro: recusado (EXCEEDS_SHIPPING_COST); nada novo gravado', eC3 === 'EXCEEDS_SHIPPING_COST' && (await q('select count(*)::int n from shipping_cost_reversals where order_id=$1', [sC.oid]))[0].n === 2, eC3);
  const moneyAfter = await moneyHash();
  report('C4 DINHEIRO REAL intacto: carteiras, Escrow, pagamentos, pedidos e reembolsos têm hash idêntico antes/depois de registrar e lançar as reversões', JSON.stringify(moneyBefore) === JSON.stringify(moneyAfter), { moneyBefore, moneyAfter });
  const sumAll = (await q(`select coalesce(sum(case when direction='DEBIT' then amount else -amount end),0)::numeric as s from ledger_entries`))[0].s;
  report('C5 a soma de TODAS as linhas do ledger (débitos − créditos) continua zero', Number(sumAll) === 0, sumAll);

  // ================================================================================================================================================
  // D) subsídio integral e ausência de subsídio
  // ================================================================================================================================================
  const sD1 = await scenario(shopB, 100, true, 'refund:e4:d1'); const rowD1 = sD1.row;
  const bD1a = await bal(sD1.oid);
  const rD1 = await rec(sD1.oid, '1000', 'rev:e4:d1'); const bD1b = await bal(sD1.oid);
  report('D1 subsídio INTEGRAL (comprador não paga frete; Sb=0, Ms=1000): a reversão de 1000 vai toda para o subsídio; não existia frete absorvido; tudo zera', Number(rowD1.shipping_charged_to_buyer) === 0 && Number(rowD1.shipping_marketplace_subsidy) === 1000 && bD1a.SHIPPING_SUBSIDY_NUSALI === -100000 && !('REFUND_ABSORBED_SHIPPING' in bD1a) && rD1.subsidyPart === '1000.00' && rD1.absorbedPart === '0.00' && bD1b.SHIPPING_PAYABLE === 0 && (bD1b.SHIPPING_SUBSIDY_NUSALI ?? 0) === 0 && !('REFUND_ABSORBED_SHIPPING' in bD1b) && (await revEntries(rD1.reversalId)) === 'SHIPPING_PAYABLE:DEBIT:100000,SHIPPING_SUBSIDY_NUSALI:CREDIT:100000', { bD1a, bD1b, rD1 });
  const sD2 = await scenario(shopD, 0, true, 'refund:e4:d2'); const rowD2 = sD2.row;
  const rD2 = await rec(sD2.oid, '300', 'rev:e4:d2'); const bD2 = await bal(sD2.oid);
  report('D2 SEM subsídio (Ms=0; comprador pagou 1000 de frete): a reversão de 300 vai toda para o frete absorvido (nenhuma linha de subsídio); saldos: absorvido 700, frete a pagar 700', Number(rowD2.shipping_marketplace_subsidy ?? 0) === 0 && Number(rowD2.shipping_charged_to_buyer) === 1000 && rD2.subsidyPart === '0.00' && rD2.absorbedPart === '300.00' && (await revEntries(rD2.reversalId)) === 'REFUND_ABSORBED_SHIPPING:CREDIT:30000,SHIPPING_PAYABLE:DEBIT:30000' && bD2.REFUND_ABSORBED_SHIPPING === -70000 && bD2.SHIPPING_PAYABLE === 70000 && !('SHIPPING_SUBSIDY_NUSALI' in bD2), { bD2, rD2 });

  // ================================================================================================================================================
  // E) validações e autorização
  // ================================================================================================================================================
  const sE = await scenario(shopA, 50, true, 'refund:e4:e1');
  const held = await place([shopA]); const oHeld = held.orderIds[0]; await setSubsidy(50); await pay(held);
  const checks = {
    naoAdmin: await errCode(() => rec(sE.oid, '10', 'rev:e4:e1', { actorUserId: plain })),
    semEvidencia: await errCode(() => rec(sE.oid, '10', 'rev:e4:e2', { evidenceRef: '   ' })),
    motivoCurto: await errCode(() => rec(sE.oid, '10', 'rev:e4:e3', { reason: 'curto' })),
    valorZero: await errCode(() => rec(sE.oid, '0', 'rev:e4:e4')),
    tresCasas: await errCode(() => rec(sE.oid, '10.005', 'rev:e4:e5')),
    semChave: await errCode(() => rec(sE.oid, '10', '')),
    naoReembolsado: await errCode(() => rec(oHeld, '10', 'rev:e4:e6')),
    pedidoInexistente: await errCode(() => rec('ord_inexistente', '10', 'rev:e4:e7')),
  };
  report('E1 recusas: não-admin, sem evidência, motivo curto, valor 0, mais de 2 casas, sem chave, pedido sem reembolso concluído, pedido inexistente — cada uma com seu código e SEM gravar nada', JSON.stringify(checks) === JSON.stringify({ naoAdmin: 'FORBIDDEN', semEvidencia: 'EVIDENCE_REQUIRED', motivoCurto: 'REASON_REQUIRED', valorZero: 'INVALID_AMOUNT', tresCasas: 'INVALID_AMOUNT', semChave: 'IDEMPOTENCY_KEY_REQUIRED', naoReembolsado: 'ORDER_NOT_REFUNDED', pedidoInexistente: 'ORDER_NOT_FOUND' }) && (await q('select count(*)::int n from shipping_cost_reversals where order_id=$1', [sE.oid]))[0].n === 0, checks);
  let trgUpd: any = null, trgDel: any = null; const anyRev = (await q('select id from shipping_cost_reversals limit 1'))[0].id;
  try { await pool.query(`update shipping_cost_reversals set evidence_ref='alterada' where id=$1`, [anyRev]); } catch (e: any) { trgUpd = e.message; }
  try { await pool.query(`delete from shipping_cost_reversals where id=$1`, [anyRev]); } catch (e: any) { trgDel = e.message; }
  report('E2 o registro da reversão é IMUTÁVEL no banco (UPDATE e DELETE recusados) e a ação fica na auditoria (audit_logs) com evidência e justificativa', /imutável/.test(trgUpd || '') && /imutável/.test(trgDel || '') && (await q(`select count(*)::int n from audit_logs where action='ledger.shipping_reversal.record'`))[0].n >= 4, { trgUpd, trgDel });

  // ================================================================================================================================================
  // F) idempotência e concorrência
  // ================================================================================================================================================
  const sF = await scenario(shopB, 50, true, 'refund:e4:f1');
  const par = await Promise.all([1, 2, 3, 4, 5].map(() => rec(sF.oid, '250', 'rev:e4:f1').catch((e: any) => ({ err: e.code ?? e.message }))));
  const seq = await rec(sF.oid, '250', 'rev:e4:f1');
  const ids = new Set([...par.map((r: any) => r.reversalId), seq.reversalId]);
  const conflict = await errCode(() => rec(sF.oid, '260', 'rev:e4:f1'));
  report('F1 o MESMO registro repetido (5 simultâneos + 1 sequencial, mesma idempotencyKey): 1 só reversão, 1 evento, 1 lançamento; a mesma chave com outro valor é recusada (IDEMPOTENCY_CONFLICT)', par.every((r: any) => !r.err) && ids.size === 1 && (await q('select count(*)::int n from shipping_cost_reversals where order_id=$1', [sF.oid]))[0].n === 1 && (await revEvents(seq.reversalId)).length === 1 && (await revTx(seq.reversalId)) === 1 && conflict === 'IDEMPOTENCY_CONFLICT', { par, conflict });
  // 6 workers concorrentes sobre um evento pendente
  const sF2 = await scenario(shopC, 50, true, 'refund:e4:f2');
  const rF2 = await stubMany(['recordShippingCostReversed'], '57P01', () => rec(sF2.oid, '100', 'rev:e4:f2'));
  const evF2 = (await revEvents(rF2.reversalId))[0];
  await q(`update ledger_outbox_events set next_attempt_at = now() - interval '1 minute' where id=$1`, [evF2.id]);
  const runs = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => runLedgerOutboxOnce({ workerId: `w${i}`, eventIds: [evF2.id] })));
  report('F2 evento pendente + 6 workers simultâneos: reclamado por exatamente 1; fica DONE com 1 lançamento', evF2.status === 'RETRYING' && runs.reduce((s, r) => s + r.claimed, 0) === 1 && (await revEvents(rF2.reversalId))[0].status === 'DONE' && (await revTx(rF2.reversalId)) === 1, { runs: runs.map((r) => r.claimed) });
  const dir = await Promise.all(Array.from({ length: 6 }, () => FinancialLedgerService.recordShippingCostReversed({ reversalId: rF2.reversalId })));
  report('F3 6 chamadas paralelas ao lançamento da mesma reversão: todas posted (1 nova + replays), 1 lançamento só', dir.every((r) => r.posted) && (await revTx(rF2.reversalId)) === 1, dir.map((r) => r.idempotentReplay));

  // ================================================================================================================================================
  // G) falha e recuperação
  // ================================================================================================================================================
  const sG = await scenario(shopD, 50, true, 'refund:e4:g1');
  const m0 = await moneyHash();
  const rG = await stubMany(['recordShippingCostReversed'], '57P01', () => rec(sG.oid, '500', 'rev:e4:g1'));
  const evG = await revEvents(rG.reversalId); const m1 = await moneyHash();
  const wk = await runLedgerOutboxOnce({ workerId: 'w-late', now: new Date(Date.now() + 3600_000) });
  const evGb = await revEvents(rG.reversalId); const m2 = await moneyHash();
  report('G1 ledger fora do ar após o registro: reversão gravada, evento RETRYING (tentativa 1), nenhum lançamento; o worker recupera → DONE com 1 lançamento; dinheiro real IDÊNTICO antes/depois de tudo', evG[0].status === 'RETRYING' && evG[0].attempts === 1 && evG[0].last_error_code === 'PG_57P01' && (await revTx(rG.reversalId)) === 1 && wk.claimed >= 1 && evGb[0].status === 'DONE' && JSON.stringify(m0) === JSON.stringify(m1) && JSON.stringify(m1) === JSON.stringify(m2), { evG, evGb });
  // evento perdido (outbox indisponível + lançamento direto fora) → reconciliação + reparo manual; e reentrega do registro recria o evento
  const sG2 = await scenario(shopA, 50, true, 'refund:e4:g2');
  await pool.query(`alter table ${OUTBOX_TABLE} rename to ${OUTBOX_TABLE}_hidden`);
  let rG2: any; try { rG2 = await stubMany(['recordShippingCostReversed'], null, () => rec(sG2.oid, '200', 'rev:e4:g2')); } finally { await pool.query(`alter table ${OUTBOX_TABLE}_hidden rename to ${OUTBOX_TABLE}`); }
  const lost = (await revEvents(rG2.reversalId)).length;
  const recG = await runLedgerReconciliation({ triggeredBy: 'e4-test', now: new Date(Date.now() + 3600_000) });
  const fG = await q(`select finding_type, severity from ledger_reconciliation_findings where order_id=$1 and status<>'RESOLVED' and finding_type like 'SHIPPING_REVERSAL%'`, [sG2.oid]);
  report('G2 evento da reversão perdido (outbox indisponível + ledger direto fora): reversão e dinheiro corretos, 0 eventos e 0 lançamentos; a reconciliação acusa SHIPPING_REVERSAL_LEDGER_MISSING_NO_EVENT (CRITICAL)', lost === 0 && (await revTx(rG2.reversalId)) === 0 && recG.status === 'OK' && fG.some((x: any) => x.finding_type === 'SHIPPING_REVERSAL_LEDGER_MISSING_NO_EVENT' && x.severity === 'CRITICAL'), { fG });
  const dry = await repairMissingEvents({ actorUserId: admin, dryRun: true });
  const app = await repairMissingEvents({ actorUserId: admin, dryRun: false });
  await runLedgerOutboxOnce({ workerId: 'w-repair' });
  report('G3 reparo MANUAL e auditado: o dry-run lista a reversão (SHIPPING_COST_REVERSED) sem escrever; o --apply cria o evento; o worker lança (DONE, 1 lançamento)', dry.candidates.some((x: any) => x.reversalId === rG2.reversalId && x.eventType === 'SHIPPING_COST_REVERSED') && dry.enqueued === 0 && app.enqueued >= 1 && (await revEvents(rG2.reversalId))[0]?.status === 'DONE' && (await revTx(rG2.reversalId)) === 1, { dry: dry.candidates.length, app });
  const sG3 = await scenario(shopB, 50, true, 'refund:e4:g3');
  await pool.query(`alter table ${OUTBOX_TABLE} rename to ${OUTBOX_TABLE}_hidden`);
  let rG3: any; try { rG3 = await stubMany(['recordShippingCostReversed'], null, () => rec(sG3.oid, '100', 'rev:e4:g3')); } finally { await pool.query(`alter table ${OUTBOX_TABLE}_hidden rename to ${OUTBOX_TABLE}`); }
  const again = await rec(sG3.oid, '100', 'rev:e4:g3');
  report('G4 reentrega do MESMO registro (mesma chave) recria o evento perdido → DONE; continua 1 reversão e 1 lançamento', again.alreadyRecorded === true && again.reversalId === rG3.reversalId && (await revEvents(rG3.reversalId))[0]?.status === 'DONE' && (await revTx(rG3.reversalId)) === 1, again);
  // pré-requisitos: o reembolso nunca foi lançado (ledger fora do ar na época) → a reversão garante PR → DC → REFUND antes
  const prevFlag = process.env.LEDGER_OUTBOX_ENABLED; process.env.LEDGER_OUTBOX_ENABLED = 'false';
  let sG5: any;
  try {
    await setSubsidy(50); const p5 = await place([shopC]); const o5 = p5.orderIds[0];
    await stubMany(['recordPaymentReceived', 'recordDeliveryConfirmed', 'recordRefundProcessed'], '57P01', async () => { await pay(p5); await release(o5, p5.buyer.buyerId); await refundAll(o5, 'refund:e4:g5'); });
    sG5 = { oid: o5 };
  } finally { process.env.LEDGER_OUTBOX_ENABLED = prevFlag; }
  const pre5 = await types(sG5.oid);
  const rG5 = await rec(sG5.oid, '1000', 'rev:e4:g5');
  report('G5 pagamento, liberação e reembolso nunca lançados (ledger fora do ar na época): ao registrar a reversão, o ledger garante PR → DC → REFUND → REVERSÃO, tudo zerado (frete a pagar, subsídio, absorvido)', pre5 === '' && (await types(sG5.oid)) === 'ORDER_DELIVERY_CONFIRMED,PAYMENT_RECEIVED,REFUND_PROCESSED,SHIPPING_COST_REVERSED' && (await revEvents(rG5.reversalId))[0].status === 'DONE' && (await bal(sG5.oid)).SHIPPING_PAYABLE === 0 && ((await bal(sG5.oid)).SHIPPING_SUBSIDY_NUSALI ?? 0) === 0, { pre5, t: await types(sG5.oid) });
  // divergência: o snapshot de frete do pedido muda depois de enfileirado => intervenção, nada lançado
  const sG6 = await scenario(shopD, 50, true, 'refund:e4:g6');
  const rG6 = await stubMany(['recordShippingCostReversed'], '57P01', () => rec(sG6.oid, '100', 'rev:e4:g6'));
  await q(`update orders set shipping_marketplace_subsidy = shipping_marketplace_subsidy + 1 where id=$1`, [sG6.oid]);
  const evG6 = (await revEvents(rG6.reversalId))[0]; await q(`update ledger_outbox_events set next_attempt_at = now() - interval '1 minute' where id=$1`, [evG6.id]);
  await runLedgerOutboxOnce({ workerId: 'w-g6', eventIds: [evG6.id] });
  const evG6b = (await revEvents(rG6.reversalId))[0];
  report('G6 snapshot do pedido alterado depois de enfileirado: o hash não confere => NEEDS_INTERVENTION (SNAPSHOT_DIVERGED), nenhum lançamento e nada recalculado', evG6b.status === 'NEEDS_INTERVENTION' && evG6b.last_error_code === 'SNAPSHOT_DIVERGED' && (await revTx(rG6.reversalId)) === 0, evG6b);
  await q(`update orders set shipping_marketplace_subsidy = shipping_marketplace_subsidy - 1 where id=$1`, [sG6.oid]);

  // ================================================================================================================================================
  // H) outbox desligado e cutoff
  // ================================================================================================================================================
  const sH = await scenario(shopA, 50, true, 'refund:e4:h1');
  process.env.LEDGER_OUTBOX_ENABLED = 'false';
  let rH: any; try { rH = await rec(sH.oid, '700', 'rev:e4:h1'); } finally { process.env.LEDGER_OUTBOX_ENABLED = prevFlag; }
  report('H1 outbox DESLIGADO: a reversão é lançada direto (sem evento no outbox), com os mesmos valores (D frete a pagar 700 / C subsídio 350 / C absorvido 350)', (await revEvents(rH.reversalId)).length === 0 && (await revTx(rH.reversalId)) === 1 && (await revEntries(rH.reversalId)) === 'REFUND_ABSORBED_SHIPPING:CREDIT:35000,SHIPPING_PAYABLE:DEBIT:70000,SHIPPING_SUBSIDY_NUSALI:CREDIT:35000', await revEntries(rH.reversalId));
  const sH2 = await scenario(shopB, 50, true, 'refund:e4:h2');
  await q(`update orders set created_at = '2025-06-01 10:00:00' where id=$1`, [sH2.oid]);
  const rH2 = await rec(sH2.oid, '100', 'rev:e4:h2'); const dH2 = await FinancialLedgerService.recordShippingCostReversed({ reversalId: rH2.reversalId });
  report('H2 pedido ANTERIOR ao cutoff: o registro real existe, mas nenhum evento é criado e o serviço devolve LEGACY_ORDER — nada é lançado', (await revEvents(rH2.reversalId)).length === 0 && dH2.reason === 'LEGACY_ORDER' && (await revTx(rH2.reversalId)) === 0, dH2);

  // ================================================================================================================================================
  // I) reconciliação
  // ================================================================================================================================================
  const recI = await runLedgerReconciliation({ triggeredBy: 'e4-final', now: new Date() });
  const open = await q(`select finding_type, severity, order_id from ledger_reconciliation_findings where status<>'RESOLVED' and (finding_type like 'SHIPPING_REVERSAL%' or finding_type in ('ESCROW_BALANCE_MISMATCH','DELIVERY_LEDGERED_WITHOUT_RELEASE','REFUND_AMOUNT_MISMATCH'))`);
  report('I1 reconciliação sobre todos os cenários (recuperados): o único achado aberto de reversão é o do evento DIVERGENTE do G6 (CRITICAL) — a divergência fica visível, não é corrigida em silêncio', recI.status === 'OK' && open.length === 1 && open[0].order_id === sG6.oid && open[0].finding_type === 'SHIPPING_REVERSAL_EVENT_NEEDS_INTERVENTION' && open[0].severity === 'CRITICAL', open);
  const snap = { id: 'o9', buyerId: 'b', sellerId: 's', storeId: 'st', countryCode: 'GW', currency: 'XOF', totalAmount: '5500.00', subtotal: null, commissionBase: null, marketplaceCommission: '500.00', sellerNetAmount: '4500.00', discountAmount: null, shippingChargedToBuyer: '500.00', shippingSellerSubsidy: null, shippingMarketplaceSubsidy: '500.00', customsDuty: null };
  const view = (reversals: any[], escrowStatus = 'refunded', releasedAt: Date | null = new Date()) => ({
    order: { id: 'o9', currency: 'XOF', totalAmount: '5500.00', escrowStatus, createdAt: new Date(), escrowCreatedAt: new Date(), escrowReleasedAt: releasedAt, updatedAt: new Date(), snapshot: snap },
    prTx: null, dcTx: null, prEvent: null, dcEvent: null, prEntries: [], dcEntries: [], refunds: [], reversals,
  });
  const goodE = [{ code: 'SHIPPING_PAYABLE', direction: 'DEBIT' as const, amount: '400.00' }, { code: 'SHIPPING_SUBSIDY_NUSALI', direction: 'CREDIT' as const, amount: '200.00' }, { code: 'REFUND_ABSORBED_SHIPPING', direction: 'CREDIT' as const, amount: '200.00' }];
  const rv = (over: any = {}) => ({ id: 'x1', amount: '400.00', currency: 'XOF', subsidyPart: '200.00', absorbedPart: '200.00', createdAt: new Date(Date.now() - 3600_000), tx: { id: 'xt', status: 'POSTED' }, event: null, entries: goodE, ...over });
  const fOk = evaluateOrder(view([rv()]) as any, new Date(), 15).filter((x) => x.type.startsWith('SHIPPING_REVERSAL'));
  const fBad = evaluateOrder(view([rv({ entries: [{ code: 'SHIPPING_PAYABLE', direction: 'DEBIT', amount: '400.00' }, { code: 'REFUND_ABSORBED_SHIPPING', direction: 'CREDIT', amount: '400.00' }] })]) as any, new Date(), 15);
  const fExceed = evaluateOrder(view([rv({ id: 'x1', amount: '700.00', subsidyPart: '350.00', absorbedPart: '350.00' }), rv({ id: 'x2', amount: '400.00' })]) as any, new Date(), 15);
  const fCtx = evaluateOrder(view([rv()], 'released', null) as any, new Date(), 15);
  report('I2 avaliação pura: reversão correta = nenhum achado; lançamento com divisão errada = SHIPPING_REVERSAL_AMOUNT_MISMATCH; soma acima do custo = SHIPPING_REVERSAL_EXCEEDS_COST; reversão em pedido não reembolsado depois da liberação = SHIPPING_REVERSAL_INVALID_CONTEXT (todos CRITICAL)',
    fOk.length === 0 && fBad.some((x) => x.type === 'SHIPPING_REVERSAL_AMOUNT_MISMATCH' && x.severity === 'CRITICAL') && fExceed.some((x) => x.type === 'SHIPPING_REVERSAL_EXCEEDS_COST' && x.severity === 'CRITICAL') && fCtx.some((x) => x.type === 'SHIPPING_REVERSAL_INVALID_CONTEXT' && x.severity === 'CRITICAL'), { fOk, fBad: fBad.map((x) => x.type), fExceed: fExceed.map((x) => x.type), fCtx: fCtx.map((x) => x.type) });

  // ================================================================================================================================================
  // J) defesa em profundidade: uma reversão inserida DIRETO no banco (contornando o serviço) num pedido reembolsado ANTES da liberação
  // ================================================================================================================================================
  const refB1 = (await q('select id from refunds where order_id=$1', [sB1.oid]))[0].id;
  await q(`insert into shipping_cost_reversals (id,order_id,refund_id,amount,currency,subsidy_part,absorbed_part,evidence_ref,reason,performed_by,idempotency_key) values ('scr_bypass',$1,$2,100,'XOF',50,50,'evidencia-bypass','inserida direto no banco',$3,'rev:e4:bypass')`, [sB1.oid, refB1, admin]);
  const dJ = await FinancialLedgerService.recordShippingCostReversed({ reversalId: 'scr_bypass' });
  const recJ = await runLedgerReconciliation({ triggeredBy: 'e4-bypass', now: new Date() });
  const fJ = await q(`select finding_type, severity from ledger_reconciliation_findings where order_id=$1 and status<>'RESOLVED' and finding_type like 'SHIPPING_REVERSAL%'`, [sB1.oid]);
  report('J1 reversão inserida direto no banco para pedido reembolsado ANTES da liberação: o lançamento recusa (SHIPPING_REVERSAL_NOT_ELIGIBLE, nada lançado) e a reconciliação acusa SHIPPING_REVERSAL_INVALID_CONTEXT (CRITICAL)', dJ.skipped === true && dJ.reason === 'SHIPPING_REVERSAL_NOT_ELIGIBLE' && (await revTx('scr_bypass')) === 0 && recJ.status === 'OK' && fJ.some((x: any) => x.finding_type === 'SHIPPING_REVERSAL_INVALID_CONTEXT' && x.severity === 'CRITICAL'), { dJ, fJ });

  await pool.end();
  console.log(`\n${passed}/${total} testes passaram.`);
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
