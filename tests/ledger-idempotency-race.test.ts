/**
 * LEDGER — corrida de idempotência na PRIMEIRA gravação. Causa: o drizzle-orm embrulha o erro do Postgres em DrizzleQueryError (SQLSTATE e constraint em
 * err.cause) e o tratador do ledger só olhava err.code; a perdedora de uma corrida lançava em vez de devolver "replay" (e os chamadores registavam ERROR).
 * Parte A: classificador puro. Parte B: Postgres DESCARTAVEL com serviços reais — concorrência na primeira confirmação, um só lançamento por pedido,
 * zero falsos erros nos logs e erros que NÃO são a corrida esperada continuam a ser propagados. Nunca produção.
 */
import { ledgerTestDbUrl } from './support/ledgerE1Env.js';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import { purchaseGroups, payments, paymentAttempts, coupons } from '../src/db/schema.js';
import { OrderService } from '../src/server/modules/orders/orderService.js';
import { PaymentService } from '../src/server/modules/payments/paymentService.js';
import { FinancialLedgerService } from '../src/server/modules/ledger/financialLedgerService.js';
import { findPgError, isUniqueViolationOf } from '../src/server/modules/ledger/pgErrors.js';
import { resolveCartShippingPreview } from '../src/server/modules/shipping/shippingPreviewService.js';
import { logger } from '../src/server/infra/logger.js';
import { setupCheckoutKit } from './support/checkoutTestKit.js';

let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 800)}`); };
const KEY = 'ledger_transactions_idempotency_uq';

/** Captura os logs de nível error/warn do logger real durante `fn` (sem silenciar nada — só observa). */
async function captureErrors<T>(fn: () => Promise<T>): Promise<{ value: T; errors: string[] }> {
  const errors: string[] = []; const l: any = logger; const orig = { error: l.error, warn: l.warn };
  const wrap = (orig: any) => function (this: any, ...a: any[]) { errors.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ').slice(0, 300)); return orig.apply(this, a); };
  l.error = wrap(orig.error); l.warn = wrap(orig.warn);
  try { return { value: await fn(), errors }; } finally { l.error = orig.error; l.warn = orig.warn; }
}
const ledgerErrors = (errs: string[]) => errs.filter((e) => /ShadowLedger|FinancialLedgerService|ledger/i.test(e));

async function main() {
  // ================= PARTE A — classificador puro
  const pgErr = (code: string, constraint?: string) => Object.assign(new Error('pg'), { code, constraint });
  const wrapped = (code: string, constraint?: string) => Object.assign(new Error('Failed query: insert …'), { name: 'DrizzleQueryError', cause: pgErr(code, constraint) });
  report('A1 erro cru do driver (err.code/err.constraint) é reconhecido', isUniqueViolationOf(pgErr('23505', KEY), KEY));
  report('A2 DrizzleQueryError (SQLSTATE e constraint em err.cause) é reconhecido — o caso real', isUniqueViolationOf(wrapped('23505', KEY), KEY) && findPgError(wrapped('23505', KEY))?.constraint === KEY);
  report('A3 embrulhado em mais de um nível (cause.cause) também é reconhecido', isUniqueViolationOf(Object.assign(new Error('x'), { cause: wrapped('23505', KEY) }), KEY));
  report('A4 violação de OUTRA constraint (mesmo 23505) NÃO é tratada como replay', !isUniqueViolationOf(wrapped('23505', 'ledger_entries_pkey'), KEY) && !isUniqueViolationOf(pgErr('23505', 'outra_uq'), KEY));
  report('A5 23505 sem nome de constraint NÃO é tratado como replay (nunca se presume)', !isUniqueViolationOf(wrapped('23505'), KEY) && !isUniqueViolationOf(pgErr('23505'), KEY));
  report('A6 outros SQLSTATE nunca são replay: deadlock 40P01, serialização 40001, falta de conexão 08006/57P01, tabela inexistente 42P01, FK 23503, NOT NULL 23502, check 23514', ['40P01', '40001', '08006', '57P01', '42P01', '23503', '23502', '23514'].every((c) => !isUniqueViolationOf(wrapped(c, KEY), KEY) && !isUniqueViolationOf(pgErr(c, KEY), KEY)));
  report('A7 entradas que não são erros do Postgres (Error comum, null, undefined, string, objeto sem code, code inválido) → falso, sem lançar', [new Error('boom'), null, undefined, 'x', {}, { code: 'ECONNRESET' }, { code: 23505 }, { cause: 'x' }].every((v) => !isUniqueViolationOf(v, KEY) && findPgError(v) === null));
  const cyc: any = new Error('c'); cyc.cause = cyc;
  report('A8 cadeia de causas cíclica não trava (limite de profundidade)', findPgError(cyc) === null);

  // ================= PARTE B — Postgres descartável
  const pool = new pg.Pool({ connectionString: ledgerTestDbUrl, ssl: { rejectUnauthorized: false }, max: 25 });
  const db = drizzle(pool, { schema });
  const kit = await setupCheckoutKit(db, 'rc');
  await kit.setFlag('multiSellerCheckoutEnabled', true); await kit.setFlag('defaultShippingPolicyMode', 'CUSTOMER_PAYS');
  await kit.setFlag('shippingNusaliSubsidy', { enabled: false, percent: 0, rules: { 'GW:STANDARD': { enabled: true, percent: 50 } } });
  const bissau = await kit.sector('Bissau'); const std = await kit.service('STANDARD');
  const sectors: any[] = (await db.select().from(schema.shippingSectors)).filter((x: any) => x.countryCode === 'GW' && x.id !== bissau.id).sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
  let ns = 0;
  const shop = async (label: string) => { const sector = sectors[ns++ % sectors.length]; const seller = await kit.makeSeller(label); const store = await kit.makeStore(seller, label, sector.id); const product = await kit.makeProduct(seller, store.storeId, `P ${label}`, 0.3, 5000); await kit.insertInventory({ sellerId: seller.sellerId, productId: product.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: store.floc.id, quantityOnHand: 1000 }); await kit.insertRate((await kit.route(sector.id, bissau.id)).id, std.id, 1000, { min: 0, max: 10 }); return { seller, store, product, price: 5000 }; };
  const mkGroup = async (n: number, couponOn = false) => {
    const shops: any[] = []; for (let i = 0; i < n; i++) shops.push(await shop(`r${ns}`));
    if (couponOn) await db.insert(coupons).values({ id: kit.uid('coup'), code: 'DEZ', title: 'T', sellerId: shops[0].seller.sellerId, storeId: shops[0].store.storeId, discountType: 'PERCENTAGE', discountValue: '10', currency: 'XOF', minimumSpend: '0.00', maxDiscount: null, usageLimit: null, usageLimitPerUser: null, usageCount: 0, isActive: true, createdAt: new Date(), updatedAt: new Date() } as any);
    const buyer = await kit.makeBuyer(bissau.id); for (const s of shops) await kit.addToCart(buyer.cartId, s.product.id, 1, 5000);
    const q: any = await resolveCartShippingPreview({ destinationShippingSectorId: bissau.id, serviceCode: 'STANDARD', items: shops.map((s) => ({ productId: s.product.id, variantId: null, quantity: 1 })) }, db);
    const opt = q.services?.find((o: any) => o.code === 'STANDARD') ?? q;
    const v: any = await OrderService.createOrderFromCart({ userId: buyer.buyerId, addressId: buyer.addressId, paymentMethod: 'pix', shippingSelection: { serviceCode: 'STANDARD', expectedShippingChargedToBuyer: opt.shippingChargedToBuyer }, ...(couponOn ? { storeCoupons: [{ storeId: shops[0].store.storeId, code: 'DEZ' }] } : {}) } as any, db);
    const groupId = v.purchaseGroup.id; const [g] = await db.select().from(purchaseGroups).where(eq(purchaseGroups.id, groupId));
    const payId = kit.uid('pay_group'), ext = kit.uid('EXT');
    await db.insert(payments).values({ id: payId, orderId: null, purchaseGroupId: groupId, settlementRole: 'candidate', buyerId: buyer.buyerId, amount: String(g.totalAmount), currency: 'XOF', provider: 'asaas', method: 'pix', status: 'pending', idempotencyKey: `asaas_pix_group:${groupId}:${payId}`, transactionRef: ext, createdAt: new Date(), updatedAt: new Date() } as any);
    await db.insert(paymentAttempts).values({ id: kit.uid('att'), paymentId: payId, provider: 'asaas', status: 'reserved', createdAt: new Date() } as any);
    return { groupId, payId, ext, total: Number(g.totalAmount), buyerId: buyer.buyerId, orderIds: v.orders.map((o: any) => o.id) as string[] };
  };
  const confirm = (g: any) => PaymentService.confirmPurchaseGroupPayment(g.groupId, g.payId, { provider: 'asaas', transactionRef: g.ext, receivedValue: g.total });
  /** confirma o pagamento SEM lançar no ledger (simula o ledger fora do ar nesse instante) — deixa o pedido pago e sem lançamento */
  const confirmWithoutLedger = async (g: any) => { const orig = FinancialLedgerService.recordPaymentReceived; (FinancialLedgerService as any).recordPaymentReceived = async () => { throw new Error('stub'); }; try { await confirm(g); } finally { (FinancialLedgerService as any).recordPaymentReceived = orig; } };
  const txOf = async (orderId: string) => (await pool.query('select id, type, status, idempotency_key from ledger_transactions where order_id=$1 order by type', [orderId])).rows;
  const entriesOf = async (txId: string) => (await pool.query('select direction, amount::text from ledger_entries where transaction_id=$1', [txId])).rows;
  const release = async (orderId: string, buyerId: string) => { await db.update(schema.shipments).set({ status: 'DELIVERED' } as any).where(eq(schema.shipments.orderId, orderId)); return PaymentService.releaseEscrowForOrder(orderId, { performedBy: buyerId }); };

  // ---- B1 PAYMENT_RECEIVED: 8 chamadas simultâneas na PRIMEIRA gravação
  const g1 = await mkGroup(1); await confirmWithoutLedger(g1); const oid1 = g1.orderIds[0];
  const pre1 = await txOf(oid1);
  const b1 = await captureErrors(() => Promise.allSettled(Array.from({ length: 8 }, () => FinancialLedgerService.recordPaymentReceived({ orderId: oid1 }))));
  const v1 = b1.value.map((r: any) => (r.status === 'fulfilled' ? r.value : null));
  const tx1 = await txOf(oid1);
  report('B1 pedido pago e SEM lançamento + 8 gravações simultâneas na primeira vez: nenhuma lança, todas devolvem posted=true, exatamente 1 transação nova (as outras 7 são replay idempotente), 2 entradas balanceadas', pre1.length === 0 && b1.value.every((r) => r.status === 'fulfilled') && v1.every((v: any) => v?.posted === true) && v1.filter((v: any) => !v.idempotentReplay).length === 1 && tx1.length === 1 && tx1[0].status === 'POSTED' && (await entriesOf(tx1[0].id)).length === 2, { pre1: pre1.length, v1, tx1 });
  report('B2 sem falsos erros: o ledger não regista NENHUM log de erro/aviso quando a operação já foi concluída pela vencedora', ledgerErrors(b1.errors).length === 0, ledgerErrors(b1.errors));

  // ---- B3 ENTREGA com cupom: 8 chamadas simultâneas na primeira vez
  const g3 = await mkGroup(1, true); await confirm(g3); const oid3 = g3.orderIds[0];
  const b3 = await captureErrors(async () => { await db.update(schema.shipments).set({ status: 'DELIVERED' } as any).where(eq(schema.shipments.orderId, oid3)); const orig = FinancialLedgerService.recordDeliveryConfirmed; (FinancialLedgerService as any).recordDeliveryConfirmed = async () => ({ posted: false, skipped: true }); try { await PaymentService.releaseEscrowForOrder(oid3, { performedBy: g3.buyerId }); } finally { (FinancialLedgerService as any).recordDeliveryConfirmed = orig; } return Promise.allSettled(Array.from({ length: 8 }, () => FinancialLedgerService.recordDeliveryConfirmed({ orderId: oid3 }))); });
  const tx3 = (await txOf(oid3)).filter((t: any) => t.type === 'ORDER_DELIVERY_CONFIRMED');
  report('B3 entrega do pedido COM cupom, 8 gravações simultâneas na primeira vez: nenhuma lança, exatamente 1 ORDER_DELIVERY_CONFIRMED, sem erros de ledger nos logs', (b3.value as any[]).every((r) => r.status === 'fulfilled' && r.value.posted === true) && tx3.length === 1 && ledgerErrors(b3.errors).length === 0, { tx3, errs: ledgerErrors(b3.errors) });

  // ---- B4 a rota real: confirmações simultâneas desde a primeira, vários grupos ao mesmo tempo
  const groups = [await mkGroup(3), await mkGroup(2), await mkGroup(3), await mkGroup(1)];
  const b4 = await captureErrors(() => Promise.allSettled(groups.flatMap((g) => Array.from({ length: 5 }, () => confirm(g)))));
  const ids = groups.flatMap((g) => g.orderIds);
  const per = (await pool.query(`select order_id, count(*)::int n from ledger_transactions where type='PAYMENT_RECEIVED' and order_id = any($1) group by order_id`, [ids])).rows;
  report('B4 20 confirmações simultâneas (4 grupos × 5, desde a primeira): nenhuma rejeitada e exatamente 1 PAYMENT_RECEIVED por pedido filho (9 pedidos)', b4.value.every((r) => r.status === 'fulfilled') && per.length === ids.length && per.every((r: any) => r.n === 1), per);
  report('B5 sem falsos erros nos logs do ledger durante essas 20 confirmações (antes da correção: dezenas de "falhou — fluxo real não afetado")', ledgerErrors(b4.errors).length === 0, ledgerErrors(b4.errors).slice(0, 3));
  const dup = (await pool.query(`select idempotency_key from ledger_transactions group by 1 having count(*) > 1`)).rows;
  const unb = (await pool.query(`select t.id from ledger_transactions t join ledger_entries e on e.transaction_id=t.id group by t.id having sum(case when e.direction='DEBIT' then e.amount else -e.amount end) <> 0`)).rows;
  report('B6 nenhuma chave duplicada e nenhuma transação desbalanceada em todo o ledger', dup.length === 0 && unb.length === 0, { dup, unb });

  // ---- B7 outros erros NÃO são escondidos: tabela de entradas indisponível (42P01) → rejeita e NADA fica gravado; depois funciona uma vez
  const g7 = await mkGroup(1); await confirmWithoutLedger(g7); const oid7 = g7.orderIds[0];
  await pool.query('ALTER TABLE ledger_entries RENAME TO ledger_entries_tmp_off');
  let err7: any = null; let errors7: string[] = [];
  try { const r = await captureErrors(() => FinancialLedgerService.recordPaymentReceived({ orderId: oid7 }).catch((e) => { err7 = e; return null; })); errors7 = r.errors; } finally { await pool.query('ALTER TABLE ledger_entries_tmp_off RENAME TO ledger_entries'); }
  report('B7 erro de banco que NÃO é a corrida esperada (tabela indisponível, 42P01) é propagado, nunca tratado como replay; a transação faz rollback (0 lançamentos)', !!err7 && findPgError(err7)?.code === '42P01' && (await txOf(oid7)).length === 0, { code: findPgError(err7)?.code, msg: String(err7?.message).slice(0, 80) });
  const ok7 = await FinancialLedgerService.recordPaymentReceived({ orderId: oid7 });
  report('B8 depois de o problema passar, a mesma operação grava normalmente e uma única vez (sem estado preso)', ok7.posted === true && !ok7.idempotentReplay && (await txOf(oid7)).length === 1);

  // ---- B9 violação de OUTRA constraint única (mesmo SQLSTATE 23505) NÃO vira replay
  const g9 = await mkGroup(1); await confirmWithoutLedger(g9); const oid9 = g9.orderIds[0];
  await pool.query(`CREATE UNIQUE INDEX tmp_lt_order_type_uq ON ledger_transactions (order_id, type)`);
  await pool.query(`INSERT INTO ledger_transactions (id, type, status, currency, order_id, idempotency_key, occurred_at, created_at) VALUES ('ltx_tmp_conflict', 'PAYMENT_RECEIVED', 'DRAFT', 'XOF', $1, 'tmp_conflict_key', now(), now())`, [oid9]);
  let err9: any = null; try { await FinancialLedgerService.recordPaymentReceived({ orderId: oid9 }); } catch (e) { err9 = e; }
  await pool.query(`DELETE FROM ledger_transactions WHERE id='ltx_tmp_conflict'`); await pool.query('DROP INDEX tmp_lt_order_type_uq');
  const info9 = findPgError(err9);
  report('B10 violação de unicidade de OUTRA constraint (23505 em tmp_lt_order_type_uq) é propagada com a constraint certa — não é confundida com a corrida de idempotência', !!err9 && info9?.code === '23505' && info9?.constraint === 'tmp_lt_order_type_uq', info9);
  const after9 = await FinancialLedgerService.recordPaymentReceived({ orderId: oid9 });
  report('B11 removida a causa, grava normalmente (1 lançamento)', after9.posted === true && (await txOf(oid9)).filter((t: any) => t.type === 'PAYMENT_RECEIVED').length === 1);

  // ---- B12 fluxo completo preservado: liberação concorrente depois dos pagamentos concorrentes, ledger fecha em 0
  const rel = await captureErrors(() => Promise.allSettled(ids.slice(0, 3).map((o, i) => release(o, groups[0].buyerId))));
  const esc0 = (await pool.query(`select coalesce(sum(case when a.code='BUYER_ESCROW' then (case when e.direction='CREDIT' then 1 else -1 end)*e.amount end),0)::numeric s from ledger_entries e join ledger_accounts a on a.id=e.account_id join ledger_transactions t on t.id=e.transaction_id where t.order_id = any($1)`, [ids.slice(0, 3)])).rows[0].s;
  report('B12 liberar os 3 pedidos do grupo 1 em paralelo: sem erros de ledger e BUYER_ESCROW de cada pedido fecha em 0 (soma 0)', rel.value.every((r) => r.status === 'fulfilled') && Number(esc0) === 0 && ledgerErrors(rel.errors).length === 0, { esc0, errs: ledgerErrors(rel.errors) });

  await pool.end();
  console.log(`\n${passed}/${total} testes passaram.`);
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
