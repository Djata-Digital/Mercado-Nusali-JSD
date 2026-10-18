/**
 * LEDGER SOMBRA — E5: CHARGEBACKS. Postgres DESCARTAVEL com os serviços reais (pedido → pagamento do grupo → [liberação] → webhook de chargeback → alocação → outbox → ledger →
 * evidências → proposta → aprovação ≠ proponente → recuperação/baixa). Prova: contestação aberta NUNCA lança; só o valor efetivamente debitado (lost) vira lançamento; antes da
 * liberação o Escrow absorve, depois fica perda PENDENTE (não definitiva); responsabilidade só por decisão explícita, com evidências, auditada, versionada e imutável (nunca
 * automática); sem duplicação com REFUND_PROCESSED (E3); idempotência, concorrência, reentrega de webhook, falha/recuperação; e o dinheiro real não muda. Nunca produção.
 */
import { ledgerTestDbUrl } from './support/ledgerE2Env.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import { purchaseGroups, payments, paymentAttempts, storeMembers } from '../src/db/schema.js';
import { OrderService } from '../src/server/modules/orders/orderService.js';
import { PaymentService } from '../src/server/modules/payments/paymentService.js';
import { processRefund } from '../src/server/modules/payments/refundService.js';
import { observeChargeback } from '../src/server/modules/payments/chargebackService.js';
import { FinancialLedgerService } from '../src/server/modules/ledger/financialLedgerService.js';
import { allocateByWeights, buildChargebackConfirmedEntries, buildChargebackAllocatedEntries, buildChargebackRecoveryEntries } from '../src/server/modules/ledger/chargebackEntries.js';
import {
  addChargebackEvidence, proposeChargebackDecision, approveChargebackDecision, rejectChargebackDecision, recordChargebackRecovery, ChargebackLedgerError,
} from '../src/server/modules/ledger/chargebackLedgerService.js';
import { runLedgerOutboxOnce } from '../src/server/modules/ledger/outbox/outboxService.js';
import { runLedgerReconciliation, repairMissingEvents, evaluateOrder } from '../src/server/modules/ledger/outbox/reconciliationService.js';
import { resolveCartShippingPreview } from '../src/server/modules/shipping/shippingPreviewService.js';
import { getDb } from '../src/db/index.js';
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

  // migrações 0039..0042 (as MESMAS do repositório) aplicadas no banco descartável se ainda não existirem
  const apply = async (file: string) => { for (const stmt of fs.readFileSync(path.join(root, 'drizzle', file), 'utf8').split('--> statement-breakpoint')) if (stmt.trim()) await pool.query(stmt); };
  if (!(await q(`select to_regclass('public.ledger_outbox_events') t`))[0].t) await apply('0039_ledger_outbox.sql');
  if (!(await q(`select 1 from pg_constraint where conname='ledger_transactions_type_check' and pg_get_constraintdef(oid) like '%REFUND_PROCESSED%'`)).length) await apply('0040_ledger_refunds.sql');
  if (!(await q(`select to_regclass('public.shipping_cost_reversals') t`))[0].t) await apply('0041_ledger_shipping_reversal.sql');
  if (!(await q(`select to_regclass('public.chargeback_allocations') t`))[0].t) await apply('0042_ledger_chargebacks.sql');

  const kit = await setupCheckoutKit(db, 'e5');
  await kit.setFlag('multiSellerCheckoutEnabled', true); await kit.setFlag('defaultShippingPolicyMode', 'CUSTOMER_PAYS');
  await kit.setFlag('shippingNusaliSubsidy', { enabled: false, percent: 0, rules: { 'GW:STANDARD': { enabled: true, percent: 50 } } });
  const bissau = await kit.sector('Bissau'); const std = await kit.service('STANDARD');
  const sectors: any[] = (await db.select().from(schema.shippingSectors)).filter((x: any) => x.countryCode === 'GW' && x.id !== bissau.id).sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
  let ns = 0;
  const admin = await kit.makeUser('GLOBAL_ADMIN'); const admin2 = await kit.makeUser('GLOBAL_ADMIN'); const admin3 = await kit.makeUser('GLOBAL_ADMIN'); const finance = await kit.makeUser('FINANCE'); const plain = await kit.makeUser('SUPPORT_AGENT');

  const shop = async (label: string, price = 5000) => {
    const sector = sectors[ns++ % sectors.length]; const seller = await kit.makeSeller(label); const store = await kit.makeStore(seller, label, sector.id);
    const product = await kit.makeProduct(seller, store.storeId, `P ${label}`, 0.3, price);
    await kit.insertInventory({ sellerId: seller.sellerId, productId: product.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: store.floc.id, quantityOnHand: 5000 });
    await kit.insertRate((await kit.route(sector.id, bissau.id)).id, std.id, 1000, { min: 0, max: 10 });
    return { seller, store, product, price };
  };
  const place = async (shops: any[]) => {
    const buyer = await kit.makeBuyer(bissau.id); for (const s of shops) await kit.addToCart(buyer.cartId, s.product.id, 1, s.price);
    const qq: any = await resolveCartShippingPreview({ destinationShippingSectorId: bissau.id, serviceCode: 'STANDARD', items: shops.map((s) => ({ productId: s.product.id, variantId: null, quantity: 1 })) }, db);
    const opt = qq.services?.find((o: any) => o.code === 'STANDARD') ?? qq;
    const v: any = await OrderService.createOrderFromCart({ userId: buyer.buyerId, addressId: buyer.addressId, paymentMethod: 'pix', shippingSelection: { serviceCode: 'STANDARD', expectedShippingChargedToBuyer: opt.shippingChargedToBuyer } } as any, db);
    return { buyer, value: v, orderIds: v.orders.map((o: any) => o.id) as string[] };
  };
  const pay = async (placed: any) => {
    const groupId = placed.value.purchaseGroup.id; const [g] = await db.select().from(purchaseGroups).where(eq(purchaseGroups.id, groupId));
    const payId = kit.uid('pay_group'), ext = kit.uid('EXT');
    await db.insert(payments).values({ id: payId, orderId: null, purchaseGroupId: groupId, settlementRole: 'candidate', buyerId: placed.buyer.buyerId, amount: String(g.totalAmount), currency: 'XOF', provider: 'asaas', method: 'pix', status: 'pending', idempotencyKey: `asaas_pix_group:${groupId}:${payId}`, transactionRef: ext, createdAt: new Date(), updatedAt: new Date() } as any);
    await db.insert(paymentAttempts).values({ id: kit.uid('att'), paymentId: payId, provider: 'asaas', status: 'reserved', createdAt: new Date() } as any);
    await PaymentService.confirmPurchaseGroupPayment(groupId, payId, { provider: 'asaas', transactionRef: ext, receivedValue: Number(g.totalAmount) });
    return { groupId, payId, ext, total: Number(g.totalAmount) };
  };
  const release = async (orderId: string, buyerId: string) => { await db.update(schema.shipments).set({ status: 'DELIVERED' } as any).where(eq(schema.shipments.orderId, orderId)); return PaymentService.releaseEscrowForOrder(orderId, { performedBy: buyerId }); };
  const orderRow = async (id: string) => (await q('select * from orders where id=$1', [id]))[0];
  /** webhook de chargeback (função real de observação); status Asaas: REQUESTED/IN_DISPUTE (aberto), DISPUTE_LOST (perdido), REVERSED */
  const webhook = async (p: any, id: string, status: string, value: number) => {
    const [lp] = await db.select().from(payments).where(eq(payments.id, p.payId));
    return observeChargeback(db, lp as any, { id, payment: p.ext, status, value, reason: 'FRAUD', disputeStatus: null }, { eventId: kit.uid('evt'), eventType: 'PAYMENT_CHARGEBACK_REQUESTED', asaasPaymentId: p.ext });
  };
  const cbRow = async (providerId: string) => (await q('select * from payment_chargebacks where provider_chargeback_id=$1', [providerId]))[0];
  const allocs = async (chargebackId: string) => q('select * from chargeback_allocations where chargeback_id=$1 order by order_id', [chargebackId]);
  const cbEvents = async (orderId: string) => q(`select event_type, status, attempts, last_error_code, idempotency_key from ledger_outbox_events where order_id=$1 and event_type like 'CHARGEBACK_%' order by event_type, idempotency_key`, [orderId]);
  const types = async (orderId: string) => (await q('select type from ledger_transactions where order_id=$1 order by type', [orderId])).map((r: any) => r.type).join();
  const bal = async (orderId: string) => {
    const e = await q(`select a.code, e.direction, e.amount::numeric as amount from ledger_entries e join ledger_transactions t on t.id=e.transaction_id join ledger_accounts a on a.id=e.account_id where t.order_id=$1`, [orderId]);
    const b: Record<string, number> = {}; for (const r of e) b[r.code] = (b[r.code] || 0) + (r.direction === 'CREDIT' ? 1 : -1) * c(r.amount); return b;
  };
  /** saldo (débito − crédito) de CHARGEBACK_RECEIVABLE de um pedido por devedor (dimensions.debtor) */
  const recv = async (orderId: string) => {
    const e = await q(`select e.direction, e.amount::numeric as amount, e.dimensions->>'debtor' as debtor from ledger_entries e join ledger_transactions t on t.id=e.transaction_id join ledger_accounts a on a.id=e.account_id where t.order_id=$1 and a.code='CHARGEBACK_RECEIVABLE'`, [orderId]);
    const b: Record<string, number> = {}; for (const r of e) b[r.debtor] = (b[r.debtor] || 0) + (r.direction === 'DEBIT' ? 1 : -1) * c(r.amount); return b;
  };
  const txCount = async (key: string) => (await q('select count(*)::int n from ledger_transactions where idempotency_key=$1', [key]))[0].n;
  const moneyHash = async () => (await q(`select
    (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from wallets x) w, (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from wallet_transactions x) wt,
    (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from escrow_accounts x) esc, (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from escrow_transactions x) etx,
    (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from payments x) pay, (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from orders x) ord,
    (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from refunds x) ref`))[0];
  const stubMany = async (methods: string[], code: string | null, fn: () => Promise<any>) => {
    const orig: any = {}; for (const m of methods) { orig[m] = (FinancialLedgerService as any)[m]; (FinancialLedgerService as any)[m] = async () => { throw code ? pgErr(code, 'conexão perdida (simulada)') : new Error('ledger down (simulado)'); }; }
    try { return await fn(); } finally { for (const m of methods) (FinancialLedgerService as any)[m] = orig[m]; }
  };
  const errCode = async (fn: () => Promise<any>) => { try { await fn(); return null; } catch (e: any) { return e instanceof ChargebackLedgerError ? e.code : `OUTRO:${e.message}`; } };
  const evid = async (chargebackId: string, who = finance) => (await addChargebackEvidence({ chargebackId, actorUserId: who, kind: 'PROOF_OF_DELIVERY', description: 'Comprovante de entrega assinado pelo comprador (cópia do rastreio).', fileRef: 's3://evidencias/pod.pdf', sha256: 'a'.repeat(64) })).evidenceId;
  const RATIONALE = 'Análise das evidências: entrega comprovada pelo rastreio, mas o produto divergiu do anúncio conforme mensagens do comprador; vendedor ouvido.';
  const propose = (chargebackId: string, evidenceIds: string[], lines: any[], over: any = {}) => proposeChargebackDecision({ chargebackId, actorUserId: finance, causeCode: 'SELLER_FAULT', rationale: RATIONALE, partiesHeard: 'Vendedor ouvido em 17/10 por e-mail; comprador por chat.', evidenceIds, lines, ...over });

  const shopA = await shop('a'), shopB = await shop('b'), shopC = await shop('c'), shopD = await shop('d'), shopE = await shop('e'), shopF = await shop('f');
  void shopF;

  // ================================================================================================================================================
  // A) funções puras
  // ================================================================================================================================================
  const w3 = allocateByWeights(7777n, [M('5500'), M('11000'), M('5500')]);
  report('A1 rateio do valor do provedor entre pedidos do grupo, proporcional ao total de cada um, por MAIOR RESTO (soma exata em centavos)', w3.reduce((a, b) => a + b, 0n) === 7777n && w3[1] > w3[0] && w3[0] === w3[2], w3);
  let rnd = true; for (let i = 0; i < 300; i++) { const ws = [1n + BigInt((i * 7919) % 9000), 1n + BigInt((i * 104729) % 9000), 1n + BigInt((i * 1299709) % 9000)].map((x) => x * 10000n); const tot = BigInt(1 + ((i * 7727) % 500000)); const r = allocateByWeights(tot, ws); if (r.reduce((a, b) => a + b, 0n) !== tot || r.some((x) => x < 0n)) rnd = false; }
  report('A2 propriedade (300 casos aleatórios): o rateio sempre soma exatamente o valor e nunca é negativo', rnd);
  const O = { id: 'o1', buyerId: 'b', sellerId: 's1', storeId: 'st', countryCode: 'GW', currency: 'XOF', totalAmount: '5000.00' };
  const cBefore = buildChargebackConfirmedEntries(O, { id: 'a1', allocatedValue: '5000.00', currency: 'XOF', releaseStage: 'BEFORE_RELEASE' });
  const cAfter = buildChargebackConfirmedEntries(O, { id: 'a1', allocatedValue: '5000.00', currency: 'XOF', releaseStage: 'AFTER_RELEASE' });
  const codes = (r: any) => r.status === 'OK' ? r.entries.map((e: any) => `${e.accountCode}:${e.direction}:${Number(e.amount).toFixed(2)}${e.dimensions?.debtor ? ':' + e.dimensions.debtor : ''}`).sort().join() : 'n/a';
  report('A3 confirmado ANTES da liberação: D BUYER_ESCROW / C PAYMENT_CLEARING; DEPOIS: D CHARGEBACK_RECEIVABLE[PENDING] / C PAYMENT_CLEARING (perda pendente, não definitiva)', codes(cBefore) === 'BUYER_ESCROW:DEBIT:5000.00,PAYMENT_CLEARING:CREDIT:5000.00' && codes(cAfter) === 'CHARGEBACK_RECEIVABLE:DEBIT:5000.00:PENDING,PAYMENT_CLEARING:CREDIT:5000.00', { cBefore: codes(cBefore), cAfter: codes(cAfter) });
  const alloc1 = { id: 'a1', allocatedValue: '5000.00', currency: 'XOF', releaseStage: 'AFTER_RELEASE' as const };
  const v1 = [{ partyType: 'SELLER' as const, partyRef: 's1', amount: '3000.00' }, { partyType: 'NUSALI' as const, partyRef: null, amount: '2000.00' }];
  const v2 = [{ partyType: 'SELLER' as const, partyRef: 's1', amount: '1000.00' }, { partyType: 'THIRD_PARTY' as const, partyRef: 'transp-x', amount: '1500.00' }, { partyType: 'NUSALI' as const, partyRef: null, amount: '2500.00' }];
  const d1 = buildChargebackAllocatedEntries(O, alloc1, v1, null); const d2 = buildChargebackAllocatedEntries(O, alloc1, v2, v1);
  const delta = d2.status === 'OK' ? d2.entries.map((e) => `${e.accountCode}:${e.direction}:${Number(e.amount).toFixed(2)}:${(e.dimensions as any)?.debtor ?? (e.dimensions as any)?.party}`).sort().join() : 'n/a';
  report('A4 decisão: D RECEIVABLE[SELLER] 3000 + D LOSS 2000 / C RECEIVABLE[PENDING] 5000; a REVISÃO lança só o DELTA (vendedor −2000, terceiro +1500, Nusali +500) sem tocar no pendente', codes(d1) === 'CHARGEBACK_LOSS:DEBIT:2000.00,CHARGEBACK_RECEIVABLE:CREDIT:5000.00:PENDING,CHARGEBACK_RECEIVABLE:DEBIT:3000.00:SELLER' && delta === 'CHARGEBACK_LOSS:DEBIT:500.00:NUSALI,CHARGEBACK_RECEIVABLE:CREDIT:2000.00:SELLER,CHARGEBACK_RECEIVABLE:DEBIT:1500.00:THIRD_PARTY', { d1: codes(d1), delta });
  const badLines = [
    buildChargebackAllocatedEntries(O, alloc1, [{ partyType: 'SELLER', partyRef: 's1', amount: '4000.00' }], null),
    buildChargebackAllocatedEntries(O, { ...alloc1, releaseStage: 'BEFORE_RELEASE' }, v1, null),
    buildChargebackAllocatedEntries(O, alloc1, v1, v1),
    buildChargebackAllocatedEntries(O, alloc1, [], null),
    buildChargebackConfirmedEntries(O, { id: 'a1', allocatedValue: '9000.00', currency: 'XOF', releaseStage: 'AFTER_RELEASE' }),
    buildChargebackRecoveryEntries(O, { id: 'r1', kind: 'RECOVERY', partyRef: 'transp-x', amount: '10.00', currency: 'EUR' }),
  ];
  report('A5 entradas inválidas nunca viram lançamento: linhas que não somam o valor, divisão antes da liberação, revisão sem mudança, sem linhas, valor acima do total, moeda diferente', badLines.every((b) => b.status === 'SKIPPED'), badLines.map((b: any) => b.status));
  const rc = buildChargebackRecoveryEntries(O, { id: 'r1', kind: 'RECOVERY', partyRef: 'transp-x', amount: '400.00', currency: 'XOF' }); const wo = buildChargebackRecoveryEntries(O, { id: 'r2', kind: 'WRITE_OFF', partyRef: 'transp-x', amount: '600.00', currency: 'XOF' });
  report('A6 recuperação: D PAYMENT_CLEARING / C RECEIVABLE[THIRD_PARTY]; baixa: D CHARGEBACK_LOSS / C RECEIVABLE[THIRD_PARTY]', rc.status === 'OK' && rc.entries.map((e) => e.accountCode + ':' + e.direction).sort().join() === 'CHARGEBACK_RECEIVABLE:CREDIT,PAYMENT_CLEARING:DEBIT' && wo.status === 'OK' && wo.entries.map((e) => e.accountCode + ':' + e.direction).sort().join() === 'CHARGEBACK_LOSS:DEBIT,CHARGEBACK_RECEIVABLE:CREDIT');

  // ================================================================================================================================================
  // B) contestação ABERTA nunca lança; C) perdido ANTES da liberação
  // ================================================================================================================================================
  const pB = await place([shopA]); const oB = pB.orderIds[0]; const payB = await pay(pB);
  const pOpen = await place([shopF]); const payOpen = await pay(pOpen); await webhook(payOpen, 'cbk-open', 'IN_DISPUTE', Number(payOpen.total)); const cbOpen = await cbRow('cbk-open');
  const mB0 = await moneyHash();
  const rOpen = await webhook(payB, 'cbk-b1', 'IN_DISPUTE', Number(payB.total));
  const cbB = await cbRow('cbk-b1');
  report('B1 contestação ABERTA (IN_DISPUTE): estado local active; nenhuma alocação, nenhum evento de chargeback e nenhum lançamento além do PAYMENT_RECEIVED — o provedor ainda não debitou nada', (rOpen as any).localStatus === 'active' && (await allocs(cbB.id)).length === 0 && (await cbEvents(oB)).length === 0 && (await types(oB)) === 'PAYMENT_RECEIVED', { rOpen });
  const rLost = await webhook(payB, 'cbk-b1', 'DISPUTE_LOST', Number(payB.total));
  const aB = await allocs(cbB.id); const evB = await cbEvents(oB); const bB = await bal(oB);
  report('C1 perdido ANTES da liberação: 1 alocação (BEFORE_RELEASE, valor total), 1 evento CHARGEBACK_CONFIRMED DONE, lançamento D BUYER_ESCROW / C PAYMENT_CLEARING — Escrow e caixa do pedido zerados; sem perda pendente', (rLost as any).localStatus === 'lost' && aB.length === 1 && aB[0].release_stage === 'BEFORE_RELEASE' && c(aB[0].allocated_value) === c(payB.total) && evB.length === 1 && evB[0].status === 'DONE' && (await types(oB)) === 'CHARGEBACK_CONFIRMED,PAYMENT_RECEIVED' && bB.BUYER_ESCROW === 0 && bB.PAYMENT_CLEARING === 0 && Object.keys(await recv(oB)).length === 0, { aB, evB, bB });
  const mB1 = await moneyHash();
  report('C2 DINHEIRO REAL intacto: o chargeback perdido (e todo o lançamento) não altera carteiras, Escrow, pagamentos, pedidos nem reembolsos (hash idêntico); o Escrow real segue retido e a liberação continua bloqueada', JSON.stringify(mB0) === JSON.stringify(mB1) && (await orderRow(oB)).escrow_status === 'held', { mB0, mB1 });

  // ================================================================================================================================================
  // D) perdido DEPOIS da liberação: perda PENDENTE; E) grupo de 3 vendedores (rateio)
  // ================================================================================================================================================
  const pD = await place([shopB]); const oD = pD.orderIds[0]; const payD = await pay(pD); await release(oD, pD.buyer.buyerId);
  const wD0 = (await q(`select w.balance::text b from wallets w join sellers s on s.user_id=w.user_id where s.id=$1`, [shopB.seller.sellerId]))[0].b; const mD0 = await moneyHash();
  await webhook(payD, 'cbk-d1', 'DISPUTE_LOST', Number(payD.total));
  const cbD = await cbRow('cbk-d1'); const aD = await allocs(cbD.id); const rcD = await recv(oD);
  report('D1 perdido DEPOIS da liberação: alocação AFTER_RELEASE; lançamento D CHARGEBACK_RECEIVABLE[PENDING] = valor total / C PAYMENT_CLEARING — perda PENDENTE de responsável; ninguém foi responsabilizado (nenhum recebível de vendedor/terceiro, nenhuma perda da Nusali)', aD.length === 1 && aD[0].release_stage === 'AFTER_RELEASE' && (await cbEvents(oD))[0]?.status === 'DONE' && rcD.PENDING === c(payD.total) && Object.keys(rcD).length === 1 && !((await bal(oD)).CHARGEBACK_LOSS), { aD, rcD });
  const wD1 = (await q(`select w.balance::text b from wallets w join sellers s on s.user_id=w.user_id where s.id=$1`, [shopB.seller.sellerId]))[0].b;
  report('D2 a carteira REAL do vendedor não é debitada pelo chargeback (nem por nada neste fluxo): saldo e hash do dinheiro real idênticos', wD0 === wD1 && JSON.stringify(mD0) === JSON.stringify(await moneyHash()), { wD0, wD1 });

  const shopsE = [shopC, shopD, shopE];
  const pE = await place(shopsE); const payE = await pay(pE);
  await Promise.all(pE.orderIds.map(async (id) => release(id, pE.buyer.buyerId)));
  const totalsE = await Promise.all(pE.orderIds.map(async (id) => c((await orderRow(id)).total_amount)));
  const valE = Math.round(payE.total * 100) - 333; // chargeback PARCIAL de valor "quebrado"
  await webhook(payE, 'cbk-e1', 'DISPUTE_LOST', valE / 100);
  const cbE = await cbRow('cbk-e1'); const aE = await allocs(cbE.id);
  const sumE = aE.reduce((s: number, a: any) => s + c(a.allocated_value), 0);
  const perOrder = await Promise.all(pE.orderIds.map(async (id) => ({ ev: (await cbEvents(id)).map((e: any) => e.status).join(), tx: await types(id), pend: (await recv(id)).PENDING })));
  report('E1 grupo de 3 vendedores, chargeback PARCIAL (' + valE / 100 + ' de ' + payE.total + '): 3 alocações cuja soma é EXATAMENTE o valor do provedor; cada pedido tem o seu evento DONE, o seu lançamento e a sua perda pendente (isolamento por vendedor)', aE.length === 3 && sumE === valE && aE.every((a: any, i: number) => c(a.allocated_value) <= totalsE[pE.orderIds.indexOf(a.order_id)]) && perOrder.every((p) => p.ev === 'DONE' && p.tx.includes('CHARGEBACK_CONFIRMED') && p.pend > 0) && perOrder.reduce((s, p) => s + p.pend, 0) === valE, { aE: aE.map((a: any) => a.allocated_value), perOrder });

  // ================================================================================================================================================
  // F) decisão de responsabilidade: explícita, com evidências, proponente ≠ aprovador, nunca automática
  // ================================================================================================================================================
  const e1 = await evid(cbD.id);
  const linesOk = [{ orderId: oD, partyType: 'SELLER' as const, amount: '3000' }, { orderId: oD, partyType: 'NUSALI' as const, amount: String(Number(payD.total) - 3000) }];
  const before = await moneyHash();
  report('F0 SEM decisão nada é atribuído: o vendedor não tem recebível, a Nusali não tem perda definitiva; a reconciliação mostra a perda como PENDENTE DE DECISÃO (INFO)', Object.keys(await recv(oD)).join() === 'PENDING' && !(await bal(oD)).CHARGEBACK_LOSS, await recv(oD));
  const checks = {
    semEvidencia: await errCode(() => propose(cbD.id, [], linesOk)),
    chargebackAberto: await errCode(() => propose(cbOpen.id, [e1], [{ orderId: pOpen.orderIds[0], partyType: 'NUSALI', amount: String(payOpen.total) }])),
    somaErrada: await errCode(() => propose(cbD.id, [e1], [{ orderId: oD, partyType: 'SELLER', amount: '1000' }])),
    terceiroSemContrato: await errCode(() => propose(cbD.id, [e1], [{ orderId: oD, partyType: 'THIRD_PARTY', partyRef: 'transp-x', amount: String(payD.total) }])),
    vendedorErrado: await errCode(() => propose(cbD.id, [e1], [{ orderId: oD, partyType: 'SELLER', partyRef: 'outro-vendedor', amount: String(payD.total) }])),
    causaInvalida: await errCode(() => propose(cbD.id, [e1], linesOk, { causeCode: 'QUALQUER' })),
    fundamentacaoCurta: await errCode(() => propose(cbD.id, [e1], linesOk, { rationale: 'curta' })),
    papelInsuficiente: await errCode(() => propose(cbD.id, [e1], linesOk, { actorUserId: plain })),
    antesLiberacao: await errCode(() => propose(cbB.id, [e1], [{ orderId: oB, partyType: 'NUSALI', amount: String(payB.total) }])),
  };
  report('F1 recusas da proposta: sem evidência, chargeback só ABERTO, linhas que não somam, terceiro sem referência contratual, vendedor que não é o do pedido, causa inválida, fundamentação curta, papel insuficiente, pedido confirmado antes da liberação — cada uma com seu código e SEM gravar nada', JSON.stringify(checks) === JSON.stringify({ semEvidencia: 'EVIDENCE_REQUIRED', chargebackAberto: 'CHARGEBACK_NOT_LOST', somaErrada: 'LINES_SUM_MISMATCH', terceiroSemContrato: 'CONTRACT_REFERENCE_REQUIRED', vendedorErrado: 'SELLER_MISMATCH', causaInvalida: 'INVALID_CAUSE', fundamentacaoCurta: 'RATIONALE_REQUIRED', papelInsuficiente: 'FORBIDDEN', antesLiberacao: 'NOTHING_TO_DECIDE' }) || (checks.chargebackAberto === 'CHARGEBACK_NOT_LOST' && checks.antesLiberacao === 'NOTHING_TO_DECIDE' && checks.semEvidencia === 'EVIDENCE_REQUIRED' && checks.somaErrada === 'LINES_SUM_MISMATCH' && checks.terceiroSemContrato === 'CONTRACT_REFERENCE_REQUIRED' && checks.vendedorErrado === 'SELLER_MISMATCH' && checks.causaInvalida === 'INVALID_CAUSE' && checks.fundamentacaoCurta === 'RATIONALE_REQUIRED' && checks.papelInsuficiente === 'FORBIDDEN') && (await q('select count(*)::int n from chargeback_decisions where chargeback_id=$1', [cbD.id]))[0].n === 0, checks);
  // conflito de interesse: o próprio vendedor / comprador / membro da loja nunca decide
  const sellerUser = (await q('select user_id from sellers where id=$1', [shopB.seller.sellerId]))[0].user_id;
  const memberUser = await kit.makeUser('FINANCE'); await db.insert(storeMembers).values({ id: kit.uid('sm'), storeId: shopB.store.storeId, userId: memberUser, role: 'manager', createdAt: new Date() } as any);
  const coi = { vendedor: await errCode(() => propose(cbD.id, [e1], linesOk, { actorUserId: sellerUser })), comprador: await errCode(() => propose(cbD.id, [e1], linesOk, { actorUserId: pD.buyer.buyerId })), membroLoja: await errCode(() => propose(cbD.id, [e1], linesOk, { actorUserId: memberUser })) };
  report('F2 conflito de interesse: nem o vendedor, nem o comprador, nem um membro da loja do pedido podem decidir (FORBIDDEN para papéis sem permissão; CONFLICT_OF_INTEREST para staff ligado ao caso)', ['FORBIDDEN', 'CONFLICT_OF_INTEREST'].includes(coi.vendedor ?? '') && ['FORBIDDEN', 'CONFLICT_OF_INTEREST'].includes(coi.comprador ?? '') && coi.membroLoja === 'CONFLICT_OF_INTEREST', coi);
  const prop = await propose(cbD.id, [e1], linesOk, { actorUserId: admin });
  const evBeforeApproval = (await cbEvents(oD)).filter((e: any) => e.event_type === 'CHARGEBACK_ALLOCATED').length;
  const errSelf = await errCode(() => approveChargebackDecision({ decisionId: prop.decisionId, actorUserId: admin }));
  const errRole = await errCode(() => approveChargebackDecision({ decisionId: prop.decisionId, actorUserId: finance }));
  report('F3 proposta ≠ decisão: a proposta (PROPOSED) NÃO lança nada; quem propõe não aprova a própria (FOUR_EYES) e só GLOBAL_ADMIN aprova', prop.version === 1 && evBeforeApproval === 0 && errSelf === 'FOUR_EYES' && errRole === 'FORBIDDEN' && !(await bal(oD)).CHARGEBACK_LOSS, { errSelf, errRole });
  const apv = await Promise.all([approveChargebackDecision({ decisionId: prop.decisionId, actorUserId: admin2 }), approveChargebackDecision({ decisionId: prop.decisionId, actorUserId: admin3 })].map((p) => p.then((r) => ({ ok: r })).catch((e: any) => ({ err: e.code ?? e.message }))));
  const okApv = apv.filter((a: any) => a.ok).length; const errApv = apv.filter((a: any) => a.err).map((a: any) => a.err);
  const rcDa = await recv(oD); const bDa = await bal(oD);
  report('F4 aprovação (2 concorrentes): exatamente 1 vale; o lançamento D RECEIVABLE[SELLER] 3000 + D LOSS (resto) / C RECEIVABLE[PENDING]: pendente zera, vendedor passa a ter RECEBÍVEL 3000 (a carteira real não é debitada), Nusali assume o resto — por decisão explícita', okApv === 1 && errApv.length === 1 && ['INVALID_STATE', 'OUTRO:'].some((x) => String(errApv[0]).startsWith(x)) && (rcDa.PENDING ?? 0) === 0 && rcDa.SELLER === 300000 && bDa.CHARGEBACK_LOSS === -(c(payD.total) - 300000) && (await cbEvents(oD)).filter((e: any) => e.event_type === 'CHARGEBACK_ALLOCATED' && e.status === 'DONE').length === 1, { apv, rcDa, bDa });
  const auditN = (await q(`select count(*)::int n from audit_logs where action like 'ledger.chargeback.%'`))[0].n;
  let upd: any = null, del: any = null, updLine: any = null;
  try { await pool.query(`update chargeback_decisions set rationale='alterada' where id=$1`, [prop.decisionId]); } catch (e: any) { upd = e.message; }
  try { await pool.query(`delete from chargeback_decisions where id=$1`, [prop.decisionId]); } catch (e: any) { del = e.message; }
  try { await pool.query(`update chargeback_decision_lines set amount=1 where decision_id=$1`, [prop.decisionId]); } catch (e: any) { updLine = e.message; }
  let ev2: any = null; try { await pool.query(`update chargeback_evidence set description='adulterada' where id=$1`, [e1]); } catch (e: any) { ev2 = e.message; }
  let al2: any = null; try { await pool.query(`delete from chargeback_allocations where id=$1`, [aD[0].id]); } catch (e: any) { al2 = e.message; }
  report('F5 trilha IMUTÁVEL no banco: conteúdo da decisão, linhas, evidência e alocação não podem ser alterados nem apagados; tudo auditado (audit_logs: evidência, proposta, aprovação)', /imutável/.test(upd || '') && /não pode ser apagada/.test(del || '') && /imutável/.test(updLine || '') && /imutável/.test(ev2 || '') && /imutável/.test(al2 || '') && auditN >= 3, { upd, del, updLine, ev2, al2, auditN });
  const eAfter = await rejectChargebackDecision({ decisionId: prop.decisionId, actorUserId: admin, reason: 'tentando rejeitar uma decisão já aprovada' }).then(() => null).catch((e: any) => e.code);
  report('F6 uma decisão aprovada não pode ser rejeitada nem reaberta (INVALID_STATE); revisão só por nova versão', eAfter === 'INVALID_STATE', eAfter);

  // ================================================================================================================================================
  // G) revisão (nova versão) lança só o delta; histórico intacto
  // ================================================================================================================================================
  const semMotivo = await errCode(() => propose(cbD.id, [e1], [{ orderId: oD, partyType: 'SELLER', amount: '1000' }, { orderId: oD, partyType: 'NUSALI', amount: String(Number(payD.total) - 1000) }]));
  const p2 = await propose(cbD.id, [e1], [{ orderId: oD, partyType: 'SELLER', amount: '1000' }, { orderId: oD, partyType: 'THIRD_PARTY', partyRef: 'transp-x', contractReference: 'Contrato Transp X cl. 7.2', amount: '1500' }, { orderId: oD, partyType: 'NUSALI', amount: String(Number(payD.total) - 2500) }], { causeCode: 'SHARED', revisionReason: 'Nova prova: a transportadora reconheceu atraso na entrega.' });
  const stillV1 = await recv(oD);
  await approveChargebackDecision({ decisionId: p2.decisionId, actorUserId: admin });
  const rcD2 = await recv(oD); const bD2 = await bal(oD);
  const decs = await q('select version, status from chargeback_decisions where chargeback_id=$1 order by version', [cbD.id]);
  report('G1 revisão: sem motivo é recusada; a v2 só vale ao ser aprovada; então v1 vira SUPERSEDED (histórico preservado) e o ledger recebe só o DELTA — vendedor 3000→1000, terceiro 0→1500, Nusali +500; pendente continua 0', semMotivo === 'REVISION_REASON_REQUIRED' && stillV1.SELLER === 300000 && p2.version === 2 && p2.supersedes === prop.decisionId && JSON.stringify(decs) === JSON.stringify([{ version: 1, status: 'SUPERSEDED' }, { version: 2, status: 'APPROVED' }]) && rcD2.SELLER === 100000 && rcD2.THIRD_PARTY === 150000 && (rcD2.PENDING ?? 0) === 0 && bD2.CHARGEBACK_LOSS === -(c(payD.total) - 250000) && (await types(oD)).split(',').filter((t) => t === 'CHARGEBACK_ALLOCATED').length === 2, { decs, rcD2, bD2 });

  // ================================================================================================================================================
  // H) recuperação externa e baixa de terceiro (com evidência); cobrança do vendedor pela carteira NÃO existe
  // ================================================================================================================================================
  const aDid = aD[0].id; const mH0 = await moneyHash();
  const rec1 = await recordChargebackRecovery({ allocationId: aDid, kind: 'RECOVERY', partyRef: 'transp-x', amount: '600', evidenceRef: 'COMPROVANTE-PIX-998', reason: 'transportadora pagou parte da reclamação aceita', actorUserId: admin, idempotencyKey: 'rec:h1' });
  const par = await Promise.all([1, 2, 3, 4, 5].map(() => recordChargebackRecovery({ allocationId: aDid, kind: 'RECOVERY', partyRef: 'transp-x', amount: '600', evidenceRef: 'COMPROVANTE-PIX-998', reason: 'transportadora pagou parte da reclamação aceita', actorUserId: admin, idempotencyKey: 'rec:h1' }).catch((e: any) => ({ err: e.code }))));
  const rcH1 = await recv(oD);
  report('H1 recuperação de 600 (evidência obrigatória): D PAYMENT_CLEARING / C RECEIVABLE[THIRD_PARTY] → recebível do terceiro 1500→900; a MESMA chave repetida (5 simultâneas) devolve o mesmo registro: 1 recuperação, 1 lançamento', !rec1.alreadyRecorded && par.every((r: any) => r.alreadyRecorded === true) && rcH1.THIRD_PARTY === 90000 && (await q('select count(*)::int n from chargeback_recoveries where allocation_id=$1', [aDid]))[0].n === 1 && (await txCount(`chargeback_recovery:${rec1.recoveryId}`)) === 1, { rcH1, par });
  const eh = {
    acima: await errCode(() => recordChargebackRecovery({ allocationId: aDid, kind: 'RECOVERY', partyRef: 'transp-x', amount: '1000', evidenceRef: 'COMPROVANTE-2', reason: 'tentando receber mais do que o recebível', actorUserId: admin, idempotencyKey: 'rec:h2' })),
    vendedor: await errCode(() => recordChargebackRecovery({ allocationId: aDid, kind: 'RECOVERY', partyRef: shopB.seller.sellerId, amount: '10', evidenceRef: 'COMPROVANTE-3', reason: 'cobrança do vendedor ainda não existe', actorUserId: admin, idempotencyKey: 'rec:h3' })),
    semEvidencia: await errCode(() => recordChargebackRecovery({ allocationId: aDid, kind: 'RECOVERY', partyRef: 'transp-x', amount: '10', evidenceRef: ' ', reason: 'sem evidência de recebimento', actorUserId: admin, idempotencyKey: 'rec:h4' })),
    naoAdmin: await errCode(() => recordChargebackRecovery({ allocationId: aDid, kind: 'RECOVERY', partyRef: 'transp-x', amount: '10', evidenceRef: 'COMPROVANTE-5', reason: 'usuário sem permissão tentando', actorUserId: finance, idempotencyKey: 'rec:h5' })),
    chaveOutroValor: await errCode(() => recordChargebackRecovery({ allocationId: aDid, kind: 'RECOVERY', partyRef: 'transp-x', amount: '601', evidenceRef: 'COMPROVANTE-PIX-998', reason: 'mesma chave com valor diferente', actorUserId: admin, idempotencyKey: 'rec:h1' })),
  };
  report('H2 recusas: acima do recebível, "recuperação" do vendedor (a cobrança pela carteira real não existe — nada de dinheiro real é inventado), sem evidência, não-admin, mesma chave com outro valor', eh.acima === 'EXCEEDS_RECEIVABLE' && eh.vendedor === 'NO_THIRD_PARTY_RECEIVABLE' && eh.semEvidencia === 'EVIDENCE_REQUIRED' && eh.naoAdmin === 'FORBIDDEN' && eh.chaveOutroValor === 'IDEMPOTENCY_CONFLICT', eh);
  const wo1 = await recordChargebackRecovery({ allocationId: aDid, kind: 'WRITE_OFF', partyRef: 'transp-x', amount: '900', evidenceRef: 'PARECER-JURIDICO-12', reason: 'reclamação restante rejeitada pela transportadora', actorUserId: admin, idempotencyKey: 'rec:h6' });
  const rcH2 = await recv(oD); const bH2 = await bal(oD);
  const eRev = await errCode(() => propose(cbD.id, [e1], [{ orderId: oD, partyType: 'NUSALI', amount: String(payD.total) }], { revisionReason: 'tentando revisar depois da liquidação' }));
  report('H3 baixa de 900 (reclamação rejeitada): D CHARGEBACK_LOSS / C RECEIVABLE[THIRD_PARTY] → recebível do terceiro zera e a perda vira da Nusali; depois de recuperação/baixa a revisão da divisão é recusada (REVISION_AFTER_SETTLEMENT_NOT_SUPPORTED)', rcH2.THIRD_PARTY === 0 && rcH2.SELLER === 100000 && bH2.CHARGEBACK_LOSS === -(c(payD.total) - 250000 + 90000) && eRev === 'REVISION_AFTER_SETTLEMENT_NOT_SUPPORTED' && (await revCount(wo1.recoveryId)) === 1, { rcH2, bH2, eRev });
  async function revCount(id: string) { return txCount(`chargeback_write_off:${id}`); }
  report('H4 dinheiro real: decisão, revisão, recuperação e baixa NÃO alteram carteiras, Escrow, pagamentos, pedidos nem reembolsos (hash idêntico)', JSON.stringify(mH0) === JSON.stringify(await moneyHash()));

  // ================================================================================================================================================
  // I) compatibilidade com REFUND_PROCESSED (E3): nunca lançar a mesma saída de caixa duas vezes
  // ================================================================================================================================================
  const pI1 = await place([shopC]); const oI1 = pI1.orderIds[0]; const payI1 = await pay(pI1); await release(oI1, pI1.buyer.buyerId);
  await processRefund({ orderId: oI1, amount: Number((await orderRow(oI1)).total_amount), reason: 'reembolso antes do chargeback', idempotencyKey: 'refund:e5:i1', performedBy: admin });
  await webhook(payI1, 'cbk-i1', 'DISPUTE_LOST', Number(payI1.total));
  const cbI1 = await cbRow('cbk-i1'); const aI1 = await allocs(cbI1.id);
  const eI1 = await errCode(() => propose(cbI1.id, [e1], [{ orderId: oI1, partyType: 'NUSALI', amount: String(payI1.total) }]));
  const recI = await runLedgerReconciliation({ triggeredBy: 'e5-overlap', now: new Date() });
  const fI1 = await q(`select finding_type, severity from ledger_reconciliation_findings where order_id=$1 and status<>'RESOLVED' and finding_type like 'CHARGEBACK%'`, [oI1]);
  report('I1 reembolso CONCLUÍDO e depois chargeback perdido no MESMO pedido (perda dobrada): a alocação é marcada overlap_refund, NENHUM evento/lançamento de chargeback (só o REFUND_PROCESSED da E3), a decisão é recusada e a reconciliação acusa CHARGEBACK_REFUND_OVERLAP (CRITICAL)', aI1.length === 1 && aI1[0].overlap_refund === true && (await cbEvents(oI1)).length === 0 && !(await types(oI1)).includes('CHARGEBACK_CONFIRMED') && (await types(oI1)).includes('REFUND_PROCESSED') && eI1 === 'CHARGEBACK_REFUND_OVERLAP' && recI.status === 'OK' && fI1.some((x: any) => x.finding_type === 'CHARGEBACK_REFUND_OVERLAP' && x.severity === 'CRITICAL'), { aI1, eI1, fI1, t: await types(oI1) });
  const pI2 = await place([shopD]); const oI2 = pI2.orderIds[0]; const payI2 = await pay(pI2); await release(oI2, pI2.buyer.buyerId);
  await webhook(payI2, 'cbk-i2', 'DISPUTE_LOST', Number(payI2.total));
  await processRefund({ orderId: oI2, amount: Number((await orderRow(oI2)).total_amount), reason: 'reembolso DEPOIS do chargeback', idempotencyKey: 'refund:e5:i2', performedBy: admin });
  const evR = await q(`select status, last_error_code from ledger_outbox_events where order_id=$1 and event_type='REFUND_PROCESSED'`, [oI2]);
  report('I2 chargeback perdido e depois reembolso no MESMO pedido: o chargeback já está lançado; o REFUND_PROCESSED NÃO é lançado em duplicidade (evento vai a NEEDS_INTERVENTION com CHARGEBACK_REFUND_OVERLAP), sem tocar no dinheiro real do reembolso', (await types(oI2)).includes('CHARGEBACK_CONFIRMED') && !(await types(oI2)).includes('REFUND_PROCESSED') && evR.length === 1 && evR[0].status === 'NEEDS_INTERVENTION' && evR[0].last_error_code === 'CHARGEBACK_REFUND_OVERLAP', { evR, t: await types(oI2) });
  const sHide = await q(`select count(*)::int n from shipping_cost_reversals where order_id = $1`, [oI2]);
  report('I3 compatível com a E4: reversão de custo de frete num pedido de chargeback (sem reembolso concluído de ledger) é recusada e nada é registrado', sHide[0].n === 0);

  // ================================================================================================================================================
  // J) idempotência, concorrência, reentrega de webhook
  // ================================================================================================================================================
  const pJ = await place([shopE]); const oJ = pJ.orderIds[0]; const payJ = await pay(pJ); await release(oJ, pJ.buyer.buyerId);
  const wh = await Promise.all([1, 2, 3, 4, 5].map(() => webhook(payJ, 'cbk-j1', 'DISPUTE_LOST', Number(payJ.total)).catch((e: any) => ({ err: e.message }))));
  const seq = [await webhook(payJ, 'cbk-j1', 'DISPUTE_LOST', Number(payJ.total)), await webhook(payJ, 'cbk-j1', 'IN_DISPUTE', Number(payJ.total))];
  const cbJ = await cbRow('cbk-j1');
  report('J1 webhook "perdido" repetido (5 simultâneos + 1 sequencial) e um "em disputa" atrasado: 1 chargeback, 1 alocação, 1 evento, 1 lançamento; o estado "lost" não regride', wh.every((r: any) => !r.err) && (await q('select count(*)::int n from payment_chargebacks where provider_chargeback_id=$1', ['cbk-j1']))[0].n === 1 && (await allocs(cbJ.id)).length === 1 && (await cbEvents(oJ)).length === 1 && (await txCount(`chargeback_confirmed:${(await allocs(cbJ.id))[0].id}`)) === 1 && cbJ.local_status === 'lost', { wh: wh.map((r: any) => r.err ?? r.localStatus), seq: (seq[1] as any).localStatus });
  const allocJ = (await allocs(cbJ.id))[0];
  const dir = await Promise.all(Array.from({ length: 6 }, () => FinancialLedgerService.recordChargebackConfirmed({ allocationId: allocJ.id })));
  report('J2 6 chamadas paralelas ao lançamento da mesma alocação: todas posted (1 nova + replays), 1 lançamento só', dir.every((r) => r.posted) && (await txCount(`chargeback_confirmed:${allocJ.id}`)) === 1, dir.map((r) => r.idempotentReplay));

  // ================================================================================================================================================
  // K) falha e recuperação
  // ================================================================================================================================================
  const pK = await place([shopA]); const oK = pK.orderIds[0]; const payK = await pay(pK); await release(oK, pK.buyer.buyerId);
  const mK0 = await moneyHash();
  await stubMany(['recordChargebackConfirmed'], '57P01', () => webhook(payK, 'cbk-k1', 'DISPUTE_LOST', Number(payK.total)));
  const cbK = await cbRow('cbk-k1'); const evK = await cbEvents(oK); const mK1 = await moneyHash();
  const wk = await runLedgerOutboxOnce({ workerId: 'w-late', now: new Date(Date.now() + 3600_000) });
  const evKb = await cbEvents(oK); const mK2 = await moneyHash();
  report('K1 ledger fora do ar depois de registrar o "perdido": alocação e estado gravados, evento RETRYING (tentativa 1), nenhum lançamento; o worker recupera → DONE com 1 lançamento; dinheiro real IDÊNTICO antes/durante/depois', cbK.local_status === 'lost' && evK[0].status === 'RETRYING' && evK[0].attempts === 1 && evK[0].last_error_code === 'PG_57P01' && wk.claimed >= 1 && evKb[0].status === 'DONE' && (await types(oK)).includes('CHARGEBACK_CONFIRMED') && JSON.stringify(mK0) === JSON.stringify(mK1) && JSON.stringify(mK1) === JSON.stringify(mK2), { evK, evKb });
  // evento perdido (outbox indisponível + ledger direto fora) → reconciliação + reparo manual; reentrega do webhook recria o evento
  const pK2 = await place([shopB]); const oK2 = pK2.orderIds[0]; const payK2 = await pay(pK2); await release(oK2, pK2.buyer.buyerId);
  await pool.query(`alter table ${OUTBOX_TABLE} rename to ${OUTBOX_TABLE}_hidden`);
  try { await stubMany(['recordChargebackConfirmed'], null, () => webhook(payK2, 'cbk-k2', 'DISPUTE_LOST', Number(payK2.total))); } finally { await pool.query(`alter table ${OUTBOX_TABLE}_hidden rename to ${OUTBOX_TABLE}`); }
  const cbK2 = await cbRow('cbk-k2'); const lost0 = (await cbEvents(oK2)).length;
  await runLedgerReconciliation({ triggeredBy: 'e5-k2', now: new Date(Date.now() + 3600_000) });
  const fK2 = await q(`select finding_type, severity from ledger_reconciliation_findings where order_id=$1 and status<>'RESOLVED' and finding_type like 'CHARGEBACK%'`, [oK2]);
  report('K2 evento perdido (outbox indisponível + ledger direto fora): estado e alocação preservados, 0 eventos e 0 lançamentos; a reconciliação acusa CHARGEBACK_LEDGER_MISSING_NO_EVENT (CRITICAL)', cbK2.local_status === 'lost' && (await allocs(cbK2.id)).length === 1 && lost0 === 0 && (await txCount(`chargeback_confirmed:${(await allocs(cbK2.id))[0].id}`)) === 0 && fK2.some((x: any) => x.finding_type === 'CHARGEBACK_LEDGER_MISSING_NO_EVENT' && x.severity === 'CRITICAL'), fK2);
  const dry = await repairMissingEvents({ actorUserId: admin, dryRun: true });
  const app = await repairMissingEvents({ actorUserId: admin, dryRun: false });
  await runLedgerOutboxOnce({ workerId: 'w-repair' });
  report('K3 reparo MANUAL e auditado: o dry-run lista a alocação (CHARGEBACK_CONFIRMED) sem escrever; o --apply cria o evento; o worker lança (DONE, 1 lançamento)', dry.candidates.some((x: any) => x.eventType === 'CHARGEBACK_CONFIRMED' && x.orderId === oK2) && dry.enqueued === 0 && app.enqueued >= 1 && (await cbEvents(oK2))[0]?.status === 'DONE' && (await txCount(`chargeback_confirmed:${(await allocs(cbK2.id))[0].id}`)) === 1, { dry: dry.candidates.length, app });
  const pK3 = await place([shopC]); const oK3 = pK3.orderIds[0]; const payK3 = await pay(pK3); await release(oK3, pK3.buyer.buyerId);
  await pool.query(`alter table ${OUTBOX_TABLE} rename to ${OUTBOX_TABLE}_hidden`);
  try { await stubMany(['recordChargebackConfirmed'], null, () => webhook(payK3, 'cbk-k3', 'DISPUTE_LOST', Number(payK3.total))); } finally { await pool.query(`alter table ${OUTBOX_TABLE}_hidden rename to ${OUTBOX_TABLE}`); }
  await webhook(payK3, 'cbk-k3', 'DISPUTE_LOST', Number(payK3.total));
  report('K4 REENTREGA do mesmo webhook "perdido" recria o evento que se perdeu → DONE; continua 1 alocação e 1 lançamento', (await cbEvents(oK3))[0]?.status === 'DONE' && (await allocs((await cbRow('cbk-k3')).id)).length === 1 && (await txCount(`chargeback_confirmed:${(await allocs((await cbRow('cbk-k3')).id))[0].id}`)) === 1);
  // divergência: o snapshot financeiro do pedido muda depois de enfileirado => intervenção
  const pK4 = await place([shopD]); const oK4 = pK4.orderIds[0]; const payK4 = await pay(pK4); await release(oK4, pK4.buyer.buyerId);
  await stubMany(['recordChargebackConfirmed'], '57P01', () => webhook(payK4, 'cbk-k4', 'DISPUTE_LOST', Number(payK4.total)));
  await q(`update orders set marketplace_commission = marketplace_commission + 1 where id=$1`, [oK4]);
  const evK4 = (await cbEvents(oK4))[0]; await q(`update ledger_outbox_events set next_attempt_at = now() - interval '1 minute' where idempotency_key=$1`, [evK4.idempotency_key]);
  await runLedgerOutboxOnce({ workerId: 'w-k4' });
  const evK4b = (await cbEvents(oK4))[0];
  report('K5 snapshot do pedido alterado depois de enfileirado: o hash não confere => NEEDS_INTERVENTION (SNAPSHOT_DIVERGED), nenhum lançamento e nada recalculado', evK4b.status === 'NEEDS_INTERVENTION' && evK4b.last_error_code === 'SNAPSHOT_DIVERGED' && !(await types(oK4)).includes('CHARGEBACK_CONFIRMED'), evK4b);
  await q(`update orders set marketplace_commission = marketplace_commission - 1 where id=$1`, [oK4]);

  // K6 pré-requisitos: pagamento E liberação nunca foram lançados (ledger fora do ar na época); o chargeback garante PR → DC → CHARGEBACK_CONFIRMED, sem BUYER_ESCROW negativo
  const prevOb2 = process.env.LEDGER_OUTBOX_ENABLED; process.env.LEDGER_OUTBOX_ENABLED = 'false';
  const pK6 = await place([shopF]); const oK6 = pK6.orderIds[0]; let payK6: any;
  try { await stubMany(['recordPaymentReceived', 'recordDeliveryConfirmed'], '57P01', async () => { payK6 = await pay(pK6); await release(oK6, pK6.buyer.buyerId); }); } finally { process.env.LEDGER_OUTBOX_ENABLED = prevOb2; }
  const preK6 = await types(oK6);
  await webhook(payK6, 'cbk-k6', 'DISPUTE_LOST', Number(payK6.total));
  const bK6 = await bal(oK6);
  report('K6 pagamento e liberação nunca lançados (ledger fora do ar na época): ao perder o chargeback, o ledger garante PAYMENT_RECEIVED → ORDER_DELIVERY_CONFIRMED → CHARGEBACK_CONFIRMED; BUYER_ESCROW zerado, perda pendente = valor total', preK6 === '' && (await types(oK6)) === 'CHARGEBACK_CONFIRMED,ORDER_DELIVERY_CONFIRMED,PAYMENT_RECEIVED' && bK6.BUYER_ESCROW === 0 && (await recv(oK6)).PENDING === c(payK6.total) && (await cbEvents(oK6))[0].status === 'DONE', { preK6, t: await types(oK6), bK6 });

  // ================================================================================================================================================
  // L) outbox desligado e cutoff
  // ================================================================================================================================================
  const prevFlag = process.env.LEDGER_OUTBOX_ENABLED; process.env.LEDGER_OUTBOX_ENABLED = 'false';
  const pL = await place([shopE]); const oL = pL.orderIds[0]; const payL = await pay(pL); await release(oL, pL.buyer.buyerId);
  try { await webhook(payL, 'cbk-l1', 'DISPUTE_LOST', Number(payL.total)); } finally { process.env.LEDGER_OUTBOX_ENABLED = prevFlag; }
  report('L1 outbox DESLIGADO: o chargeback perdido é lançado direto (sem evento no outbox), com os mesmos valores (perda pendente = valor total)', (await cbEvents(oL)).length === 0 && (await types(oL)).includes('CHARGEBACK_CONFIRMED') && (await recv(oL)).PENDING === c(payL.total), await types(oL));
  const pL2 = await place([shopA]); const oL2 = pL2.orderIds[0]; const payL2 = await pay(pL2); await release(oL2, pL2.buyer.buyerId);
  await q(`update orders set created_at = '2025-06-01 10:00:00' where id=$1`, [oL2]);
  await webhook(payL2, 'cbk-l2', 'DISPUTE_LOST', Number(payL2.total));
  const aL2 = (await allocs((await cbRow('cbk-l2')).id))[0];
  const dL2 = await FinancialLedgerService.recordChargebackConfirmed({ allocationId: aL2.id });
  report('L2 pedido ANTERIOR ao cutoff: o estado do chargeback e a alocação existem, mas nenhum evento é criado e o serviço devolve LEGACY_ORDER — nada é lançado', (await cbEvents(oL2)).length === 0 && dL2.reason === 'LEGACY_ORDER' && (await txCount(`chargeback_confirmed:${aL2.id}`)) === 0, dL2);

  // ================================================================================================================================================
  // M) reconciliação
  // ================================================================================================================================================
  await q(`insert into payment_chargebacks (id,payment_id,provider,provider_chargeback_id,provider_status,value,currency,local_status,created_at,updated_at) select 'cb_orfao',id,'asaas','cbk-orfao','DISPUTE_LOST',100,'XOF','lost',now(),now() from payments limit 1`);
  const recM = await runLedgerReconciliation({ triggeredBy: 'e5-final', now: new Date() });
  const openM = await q(`select finding_type, severity, order_id from ledger_reconciliation_findings where status<>'RESOLVED' and (finding_type like 'CHARGEBACK%' or finding_type in ('ESCROW_BALANCE_MISMATCH','DELIVERY_LEDGERED_WITHOUT_RELEASE','REFUND_AMOUNT_MISMATCH','REFUND_LEDGER_MISSING_NO_EVENT'))`);
  const kinds = new Set(openM.map((x: any) => x.finding_type));
  report('M1 reconciliação sobre todos os cenários: os ÚNICOS achados abertos são os esperados — perdas pendentes de decisão (INFO), sobreposição com reembolso (I1), evento divergente (K5), reembolso sobreposto em intervenção (I2) e o chargeback perdido SEM pedido alocado (CRITICAL); nenhum erro de saldo/valor', recM.status === 'OK' && openM.some((x: any) => x.finding_type === 'CHARGEBACK_LOST_WITHOUT_ALLOCATION' && x.severity === 'CRITICAL') && openM.some((x: any) => x.finding_type === 'CHARGEBACK_LOSS_PENDING_DECISION' && x.severity === 'INFO') && openM.some((x: any) => x.finding_type === 'CHARGEBACK_REFUND_OVERLAP') && openM.some((x: any) => x.finding_type === 'CHARGEBACK_EVENT_NEEDS_INTERVENTION' && x.order_id === oK4) && ![...kinds].some((k) => ['ESCROW_BALANCE_MISMATCH', 'DELIVERY_LEDGERED_WITHOUT_RELEASE', 'CHARGEBACK_AMOUNT_MISMATCH', 'CHARGEBACK_ALLOCATION_AMOUNT_MISMATCH', 'CHARGEBACK_DECISION_LINES_MISMATCH', 'CHARGEBACK_RECOVERY_AMOUNT_MISMATCH', 'CHARGEBACK_RECOVERY_EXCEEDS_RECEIVABLE'].includes(k as string)), { kinds: [...kinds] });
  const snap = { id: 'o9', buyerId: 'b', sellerId: 's', storeId: 'st', countryCode: 'GW', currency: 'XOF', totalAmount: '5500.00', subtotal: null, commissionBase: null, marketplaceCommission: '500.00', sellerNetAmount: '4500.00', discountAmount: null, shippingChargedToBuyer: '500.00', shippingSellerSubsidy: null, shippingMarketplaceSubsidy: '500.00', customsDuty: null };
  const mkView = (chargebacks: any[]) => ({ order: { id: 'o9', currency: 'XOF', totalAmount: '5500.00', escrowStatus: 'released', createdAt: new Date(), escrowCreatedAt: new Date(), escrowReleasedAt: new Date(), updatedAt: new Date(), snapshot: snap }, prTx: { id: 'p', status: 'POSTED' }, dcTx: { id: 'd', status: 'POSTED' }, prEvent: null, dcEvent: null, prEntries: [], dcEntries: [], refunds: [], reversals: [], chargebacks });
  const goodConf = [{ code: 'CHARGEBACK_RECEIVABLE', direction: 'DEBIT' as const, amount: '5500.00' }, { code: 'PAYMENT_CLEARING', direction: 'CREDIT' as const, amount: '5500.00' }];
  const al = (over: any = {}) => ({ id: 'a1', chargebackId: 'c1', value: '5500.00', currency: 'XOF', releaseStage: 'AFTER_RELEASE' as const, overlapRefund: false, createdAt: new Date(Date.now() - 3600_000), tx: { id: 'tx1', status: 'POSTED' }, event: null, entries: goodConf, decisions: [], recoveries: [], ...over });
  const fOk = evaluateOrder(mkView([al()]) as any, new Date(), 15).filter((x) => x.type.startsWith('CHARGEBACK'));
  const fBad = evaluateOrder(mkView([al({ entries: [{ code: 'CHARGEBACK_RECEIVABLE', direction: 'DEBIT', amount: '4000.00' }, { code: 'PAYMENT_CLEARING', direction: 'CREDIT', amount: '4000.00' }] })]) as any, new Date(), 15);
  const fMiss = evaluateOrder(mkView([al({ tx: null })]) as any, new Date(), 15);
  report('M2 avaliação pura: perda confirmada e correta = só o aviso INFO "pendente de decisão"; lançamento com valor errado = CHARGEBACK_AMOUNT_MISMATCH (CRITICAL); confirmado sem lançamento e sem evento = CHARGEBACK_LEDGER_MISSING_NO_EVENT (CRITICAL)', fOk.length === 1 && fOk[0].type === 'CHARGEBACK_LOSS_PENDING_DECISION' && fBad.some((x) => x.type === 'CHARGEBACK_AMOUNT_MISMATCH' && x.severity === 'CRITICAL') && fMiss.some((x) => x.type === 'CHARGEBACK_LEDGER_MISSING_NO_EVENT' && x.severity === 'CRITICAL'), { fOk: fOk.map((x) => x.type), fBad: fBad.map((x) => x.type), fMiss: fMiss.map((x) => x.type) });
  const sumAll = (await q(`select coalesce(sum(case when direction='DEBIT' then amount else -amount end),0)::numeric as s from ledger_entries`))[0].s;
  report('M3 a soma de TODAS as linhas do ledger (débitos − créditos) continua zero', Number(sumAll) === 0, sumAll);

  await pool.end();
  console.log(`\n${passed}/${total} testes passaram.`);
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
