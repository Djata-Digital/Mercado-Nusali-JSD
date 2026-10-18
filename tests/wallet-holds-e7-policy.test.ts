/**
 * E7 (regras aprovadas D1–D7) — operação administrativa de RETENÇÃO DE SALDO por chargeback perdido com responsabilidade do vendedor aprovada. Usa o apiRouter REAL contra Postgres
 * DESCARTÁVEL com os serviços reais da E3–E6. Prova: papéis (D1/D2), conflito de interesse, quatro olhos, evidência obrigatória, obrigação aprovada + teto aprovado + teto N (D5),
 * saldo livre sem retenção parcial (D4), sem retenção automática, saque anterior intocado (D6), sem lançamento no ledger sombra (D7), sinalização quando a obrigação muda,
 * idade das retenções (D3), idempotência e concorrência, dinheiro real intacto. Nunca produção.
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


  // ---------------------------------------------------------------- cenário (serviços reais; chargebacks perdidos por webhook real)
  const shopA = await shop('a'), shopB = await shop('b');
  const lost = async (pl: any, p: { payId: string; ext: string; total: number }, cbId: string) => {
    const [lp] = await db.select().from(payments).where(eq(payments.id, p.payId));
    await observeChargeback(db, lp as any, { id: cbId, payment: p.ext, status: 'DISPUTE_LOST', value: p.total, reason: 'FRAUD', disputeStatus: null }, { eventId: kit.uid('evt'), eventType: 'PAYMENT_CHARGEBACK_REQUESTED', asaasPaymentId: p.ext });
    return (await q(`select id from payment_chargebacks where provider_chargeback_id=$1`, [cbId]))[0].id as string;
  };
  const p1 = await place(shopA); const pay1 = await pay(p1); await release(p1.orderId, p1.buyer.buyerId);   // pago e LIBERADO
  const p2 = await place(shopB); const pay2 = await pay(p2);                                                  // pago, NÃO liberado
  const cb1 = await lost(p1, pay1, 'cbk-e7-1'); const cb2 = await lost(p2, pay2, 'cbk-e7-2');
  const alloc1 = (await q('select id, order_id from chargeback_allocations where chargeback_id=$1', [cb1]))[0];
  const alloc2 = (await q('select id from chargeback_allocations where chargeback_id=$1', [cb2]))[0];
  const sellerUser1 = (await q(`select s.user_id from orders o join sellers s on s.id=o.seller_id where o.id=$1`, [alloc1.order_id]))[0].user_id as string;
  const wallet1 = (await q(`select id, balance::text b from wallets where user_id=$1 and currency='XOF'`, [sellerUser1]))[0];
  const sellerId1 = (await q('select seller_id from orders where id=$1', [alloc1.order_id]))[0].seller_id as string;
  const net1 = Number((await q('select seller_net_amount from orders where id=$1', [alloc1.order_id]))[0].seller_net_amount); const tot1 = Number((await q('select total_amount from orders where id=$1', [alloc1.order_id]))[0].total_amount);
  const HOLDS = `${BASE}/wallet-holds`;
  const holdBody = (amount: any, key: string, extra: any = {}) => ({ amount, reason: 'Retenção solicitada: chargeback perdido com responsabilidade do vendedor aprovada.', evidenceRef: 'DECISAO-APROVADA-E7', idempotencyKey: key, ...extra });
  const holdCount = async () => (await q(`select count(*)::int n from wallet_holds`))[0].n as number;
  const ledgerCount = async () => (await q(`select count(*)::int n from ledger_transactions`))[0].n as number;
  const balanceNow = async () => (await q(`select balance::text b from wallets where id=$1`, [wallet1.id]))[0].b as string;
  const approvedSeller = Math.max(100, net1 - 500);

  report('E1 nada é criado automaticamente: com o chargeback PERDIDO e a alocação lançada, não existe nenhuma retenção (D5: só por solicitação explícita)', (await holdCount()) === 0 && Number(wallet1.b) >= net1, { n: await holdCount(), w: wallet1.b, net1 });

  // ---------------------------------------------------------------- D5: precisa de decisão APROVADA do vendedor
  const noDecision = await call('POST', `${BASE}/chargeback-allocations/${alloc1.id}/wallet-holds`, holdBody(100, 'e7:nodec'), T.FINANCE);
  const notAfter = await call('POST', `${BASE}/chargeback-allocations/${alloc2.id}/wallet-holds`, holdBody(100, 'e7:before'), T.FINANCE);
  const missing = await call('POST', `${BASE}/chargeback-allocations/aloc-inexistente/wallet-holds`, holdBody(100, 'e7:missing'), T.FINANCE);
  report('E2 sem decisão aprovada = 409 NO_APPROVED_OBLIGATION; alocação ANTES da liberação (Escrow absorve) = 409 HOLD_NOT_ALLOWED; alocação inexistente = 404; nada criado', noDecision.status === 409 && noDecision.json.error.code === 'NO_APPROVED_OBLIGATION' && notAfter.status === 409 && notAfter.json.error.code === 'HOLD_NOT_ALLOWED' && missing.status === 404 && (await holdCount()) === 0, { a: noDecision.json?.error, b: notAfter.json?.error, c: missing.status });

  const evR = await call('POST', `${BASE}/chargebacks/${cb1}/evidence`, { kind: 'PROOF_OF_DELIVERY', description: 'Comprovante de entrega assinado pelo comprador (cópia do rastreio).' }, T.FINANCE);
  const propBody = (seller: number, extra: any = {}) => ({ causeCode: 'SELLER_FAULT', rationale: 'Análise das evidências: entrega comprovada, mas o produto divergiu do anúncio conforme mensagens do comprador; vendedor ouvido.', partiesHeard: 'Vendedor ouvido em 18/10 por e-mail; comprador por chat.', evidenceIds: [evR.json.data.evidenceId], lines: [{ orderId: alloc1.order_id, partyType: 'SELLER', amount: seller }, { orderId: alloc1.order_id, partyType: 'NUSALI', amount: tot1 - seller }], ...extra });
  const prop1 = await call('POST', `${BASE}/chargebacks/${cb1}/decisions`, propBody(approvedSeller), T.FINANCE);
  const holdBeforeApproval = await call('POST', `${BASE}/chargeback-allocations/${alloc1.id}/wallet-holds`, holdBody(100, 'e7:proposed-only'), T.FINANCE);
  const apv1 = await call('POST', `${BASE}/chargeback-decisions/${prop1.json.data.decisionId}/approve`, {}, T.ADMIN2);
  report('E3 decisão apenas PROPOSTA não autoriza retenção (409); aprovada pelo segundo Administrador Geral, também NÃO cria nenhuma retenção sozinha (0 retenções)', prop1.status === 201 && holdBeforeApproval.status === 409 && holdBeforeApproval.json.error.code === 'NO_APPROVED_OBLIGATION' && apv1.status === 200 && (await holdCount()) === 0, { prop: prop1.status, hb: holdBeforeApproval.json?.error, apv: apv1.status });

  // ---------------------------------------------------------------- D1: papéis e conflito de interesse
  const buyerAsFinance = tokenFor(p1.buyer.buyerId, 'FINANCE');
  await db.update(schema.users).set({ role: 'FINANCE' }).where(eq(schema.users.id, p1.buyer.buyerId));
  const roleCalls = await Promise.all([T.SUPPORT, T.ADMIN, T.COUNTRY_REPRESENTATIVE, T.LOGISTICS].map((t) => call('POST', `${BASE}/chargeback-allocations/${alloc1.id}/wallet-holds`, holdBody(100, `e7:role:${t.slice(-6)}`), t)));
  const coi = await call('POST', `${BASE}/chargeback-allocations/${alloc1.id}/wallet-holds`, holdBody(100, 'e7:coi'), buyerAsFinance);
  const noTok = await call('POST', `${BASE}/chargeback-allocations/${alloc1.id}/wallet-holds`, holdBody(100, 'e7:notoken'));
  report('E4 D1: SUPPORT, ADMIN, COUNTRY_REPRESENTATIVE e LOGISTICS = 403 LEDGER_ACCESS_DENIED; sem token = 401; comprador do pedido (com papel FINANCE) = 403 CONFLICT_OF_INTEREST; nada criado', roleCalls.every((r) => r.status === 403 && r.json.error.code === 'LEDGER_ACCESS_DENIED') && noTok.status === 401 && coi.status === 403 && coi.json.error.code === 'CONFLICT_OF_INTEREST' && (await holdCount()) === 0, { roles: roleCalls.map((r) => r.json?.error?.code), coi: coi.json?.error });
  await db.update(schema.users).set({ role: 'BUYER' }).where(eq(schema.users.id, p1.buyer.buyerId));

  // ---------------------------------------------------------------- validações de entrada
  const bads = await Promise.all([
    call('POST', `${BASE}/chargeback-allocations/${alloc1.id}/wallet-holds`, holdBody(100, 'e7:b1', { evidenceRef: '' }), T.FINANCE), call('POST', `${BASE}/chargeback-allocations/${alloc1.id}/wallet-holds`, holdBody(100, 'e7:b2', { reason: 'curto' }), T.FINANCE),
    call('POST', `${BASE}/chargeback-allocations/${alloc1.id}/wallet-holds`, holdBody(100, '', {}), T.FINANCE), ...[0, -5, 'abc', '1.005', ''].map((a, i) => call('POST', `${BASE}/chargeback-allocations/${alloc1.id}/wallet-holds`, holdBody(a, `e7:bad${i}`), T.FINANCE)),
  ]);
  report('E5 evidência ausente, motivo curto, chave ausente e valor 0/negativo/texto/3 casas/vazio = 400 com o código certo; nada criado', bads.map((r) => r.json?.error?.code).join(',') === 'EVIDENCE_REQUIRED,REASON_REQUIRED,IDEMPOTENCY_KEY_REQUIRED,INVALID_AMOUNT,INVALID_AMOUNT,INVALID_AMOUNT,INVALID_AMOUNT,INVALID_AMOUNT' && (await holdCount()) === 0, bads.map((r) => r.json?.error?.code));

  // ---------------------------------------------------------------- D5/D4: tetos e saldo livre
  const overApproved = await call('POST', `${BASE}/chargeback-allocations/${alloc1.id}/wallet-holds`, holdBody(approvedSeller + 0.01, 'e7:over'), T.FINANCE);
  await pool.query(`update wallets set balance=$2 where id=$1`, [wallet1.id, String(approvedSeller - 100)]);
  const noFree = await call('POST', `${BASE}/chargeback-allocations/${alloc1.id}/wallet-holds`, holdBody(approvedSeller, 'e7:nofree'), T.FINANCE);
  await pool.query(`update wallets set balance=$2 where id=$1`, [wallet1.id, wallet1.b]);
  report('E6 acima da responsabilidade aprovada = 409 EXCEEDS_APPROVED_OBLIGATION; com saldo livre menor que o pedido = 409 INSUFFICIENT_UNHELD_BALANCE (D4: nenhuma retenção parcial automática, 0 criadas)', overApproved.status === 409 && overApproved.json.error.code === 'EXCEEDS_APPROVED_OBLIGATION' && noFree.status === 409 && noFree.json.error.code === 'INSUFFICIENT_UNHELD_BALANCE' && (await holdCount()) === 0, { o: overApproved.json?.error, n: noFree.json?.error });

  // ---------------------------------------------------------------- D6: saque pedido ANTES da retenção
  const payoutBefore = await requestSellerPayout({ sellerId: sellerId1, sellerUserId: sellerUser1, amount: 100, currency: 'XOF', method: 'wallet', idempotencyKey: 'e7:payout-before' });
  const payoutRowBefore = (await q(`select md5(to_jsonb(p)::text) h from seller_payouts p where id=$1`, [payoutBefore.id]))[0].h;
  const balAfterPayout = await balanceNow();

  // ---------------------------------------------------------------- criação válida (FINANCE), rastreabilidade, idempotência, dinheiro real intacto
  const money0 = await moneyHash(); const lc0 = await ledgerCount();
  const holdAmt = approvedSeller - 300;
  const c1 = await call('POST', `${BASE}/chargeback-allocations/${alloc1.id}/wallet-holds`, holdBody(holdAmt, 'e7:h1'), T.FINANCE);
  const hold1 = c1.json?.data?.holdId as string;
  const replay = await call('POST', `${BASE}/chargeback-allocations/${alloc1.id}/wallet-holds`, holdBody(holdAmt, 'e7:h1'), T.FINANCE);
  const conflictKey = await call('POST', `${BASE}/chargeback-allocations/${alloc1.id}/wallet-holds`, holdBody(holdAmt + 1, 'e7:h1'), T.FINANCE);
  const dupRef = await call('POST', `${BASE}/chargeback-allocations/${alloc1.id}/wallet-holds`, holdBody(10, 'e7:h1-other-key'), T.FINANCE);
  const row1 = (await q(`select * from wallet_holds where id=$1`, [hold1]))[0];
  const confirmedTx = (await q(`select id from ledger_transactions where idempotency_key=$1`, ['chargeback_confirmed:' + alloc1.id]))[0]?.id;
  const aud1 = (await q(`select actor_user_id, details_json from audit_logs where resource='wallet_hold' and resource_id=$1`, [hold1]))[0];
  report('E7 FINANCE cria retenção (201): valor, ator autenticado, evidência, referência CHARGEBACK_ALLOCATION; repetir a mesma chave = 200 replay; mesma chave com outro valor = 409 IDEMPOTENCY_CONFLICT; outra chave na mesma alocação = 409 DUPLICATE_ACTIVE_HOLD', c1.status === 201 && Number(row1.amount) === holdAmt && row1.created_by === U.FINANCE && row1.evidence_ref === 'DECISAO-APROVADA-E7' && row1.reference_type === 'CHARGEBACK_ALLOCATION' && row1.reference_id === alloc1.id && replay.status === 200 && replay.json.data.alreadyPlaced === true && replay.json.data.holdId === hold1 && conflictKey.json.error.code === 'IDEMPOTENCY_CONFLICT' && dupRef.json.error.code === 'DUPLICATE_ACTIVE_HOLD' && (await holdCount()) === 1, { c1: c1.status, row1, conflictKey: conflictKey.json?.error, dupRef: dupRef.json?.error });
  report('E8 D7 + dinheiro real: reter NÃO cria lançamento no ledger sombra (só guarda a referência ao lançamento do chargeback), não muda o saldo da carteira, Escrow, pagamentos, pedidos nem reembolsos; auditoria com ator, evidência e saldos', (await ledgerCount()) === lc0 && !!confirmedTx && row1.ledger_transaction_id === confirmedTx && JSON.stringify(await moneyHash()) === JSON.stringify(money0) && aud1?.actor_user_id === U.FINANCE && aud1.details_json.evidenceRef === 'DECISAO-APROVADA-E7' && aud1.details_json.amount === Number(holdAmt).toFixed(2), { lc: await ledgerCount(), lc0, confirmedTx, ref: row1.ledger_transaction_id, aud1 });

  // saque novo respeita o retido; saque pedido antes não foi tocado
  const free = Number(balAfterPayout) - holdAmt;
  const payBlocked = await requestSellerPayout({ sellerId: sellerId1, sellerUserId: sellerUser1, amount: free + 1, currency: 'XOF', method: 'wallet', idempotencyKey: 'e7:payout-blocked' }).then(() => null, (e: any) => e.code);
  const payOk = await requestSellerPayout({ sellerId: sellerId1, sellerUserId: sellerUser1, amount: free, currency: 'XOF', method: 'wallet', idempotencyKey: 'e7:payout-free' });
  report('E9 D6: o saque pedido ANTES da retenção continua idêntico (mesma linha, mesmo saldo debitado); novo saque acima do livre = BALANCE_ON_HOLD; exatamente o livre passa', (await q(`select md5(to_jsonb(p)::text) h from seller_payouts p where id=$1`, [payoutBefore.id]))[0].h === payoutRowBefore && payBlocked === 'BALANCE_ON_HOLD' && payOk.status === 'pending' && Number(await balanceNow()) === holdAmt, { payBlocked, bal: await balanceNow(), holdAmt });

  // ---------------------------------------------------------------- D2: liberação
  const relBody = (extra: any = {}) => ({ reason: 'Chargeback revertido a favor da loja (verificação do teste).', evidenceRef: 'PROTOCOLO-REVERSAO-7', ...extra });
  const relRoles = await Promise.all([T.FINANCE, T.RISK_ANALYST, T.SUPPORT, T.ADMIN].map((t) => call('POST', `${HOLDS}/${hold1}/release`, relBody(), t)));
  const relNoEv = await call('POST', `${HOLDS}/${hold1}/release`, relBody({ evidenceRef: '' }), T.GLOBAL_ADMIN);
  const relShort = await call('POST', `${HOLDS}/${hold1}/release`, relBody({ reason: 'curto' }), T.GLOBAL_ADMIN);
  const relMissing = await call('POST', `${HOLDS}/inexistente/release`, relBody(), T.GLOBAL_ADMIN);
  report('E10 D2: FINANCE, RISK_ANALYST, SUPPORT e ADMIN não liberam (403 LEDGER_ADMIN_REQUIRED/ACCESS_DENIED); GLOBAL_ADMIN sem evidência ou com motivo curto = 400; retenção inexistente = 404; a retenção segue ACTIVE', relRoles.every((r) => r.status === 403) && relRoles.slice(0, 2).every((r) => r.json.error.code === 'LEDGER_ADMIN_REQUIRED') && relNoEv.json.error.code === 'EVIDENCE_REQUIRED' && relShort.json.error.code === 'REASON_REQUIRED' && relMissing.status === 404 && (await q(`select status from wallet_holds where id=$1`, [hold1]))[0].status === 'ACTIVE', { roles: relRoles.map((r) => r.json?.error?.code), a: relNoEv.json?.error, b: relShort.json?.error });
  const rel1 = await call('POST', `${HOLDS}/${hold1}/release`, relBody(), T.GLOBAL_ADMIN);
  const rel1b = await call('POST', `${HOLDS}/${hold1}/release`, relBody(), T.ADMIN2);
  const relRow = (await q(`select status, released_by, release_reason, release_evidence_ref from wallet_holds where id=$1`, [hold1]))[0];
  report('E11 GLOBAL_ADMIN (≠ criador) libera com motivo + evidência (200, RELEASED, auditado); repetir é replay sem efeito (alreadyReleased); saldo não muda ao liberar', rel1.status === 200 && rel1.json.data.alreadyReleased === false && rel1b.status === 200 && rel1b.json.data.alreadyReleased === true && relRow.status === 'RELEASED' && relRow.released_by === U.GLOBAL_ADMIN && relRow.release_evidence_ref === 'PROTOCOLO-REVERSAO-7' && Number(await balanceNow()) === holdAmt, { rel1: rel1.json?.error, relRow });
  // quatro olhos: GLOBAL_ADMIN cria e ele mesmo NÃO libera
  const c2 = await call('POST', `${BASE}/chargeback-allocations/${alloc1.id}/wallet-holds`, holdBody(500, 'e7:h2'), T.GLOBAL_ADMIN);
  await db.update(schema.users).set({ role: 'GLOBAL_ADMIN' }).where(eq(schema.users.id, p1.buyer.buyerId));
  const coiRel = await call('POST', `${HOLDS}/${c2.json.data.holdId}/release`, relBody(), tokenFor(p1.buyer.buyerId, 'GLOBAL_ADMIN'));
  await db.update(schema.users).set({ role: 'BUYER' }).where(eq(schema.users.id, p1.buyer.buyerId));
  report('E12b conflito de interesse na liberação: um GLOBAL_ADMIN que é o comprador do pedido NÃO libera (403 CONFLICT_OF_INTEREST); a retenção segue ACTIVE', coiRel.status === 403 && coiRel.json.error.code === 'CONFLICT_OF_INTEREST' && (await q(`select status from wallet_holds where id=$1`, [c2.json.data.holdId]))[0].status === 'ACTIVE', coiRel.json?.error);
  const selfRel = await call('POST', `${HOLDS}/${c2.json.data.holdId}/release`, relBody(), T.GLOBAL_ADMIN);
  const otherRel = await call('POST', `${HOLDS}/${c2.json.data.holdId}/release`, relBody(), T.ADMIN2);
  report('E12 quatro olhos: o GLOBAL_ADMIN que criou NÃO libera a própria retenção (403 FOUR_EYES); outro GLOBAL_ADMIN libera (200); RISK_ANALYST também pode solicitar (201)', c2.status === 201 && selfRel.status === 403 && selfRel.json.error.code === 'FOUR_EYES' && otherRel.status === 200 && (await call('POST', `${BASE}/chargeback-allocations/${alloc1.id}/wallet-holds`, holdBody(400, 'e7:h-risk'), T.RISK_ANALYST)).status === 201, { selfRel: selfRel.json?.error });
  const riskHold = (await q(`select id from wallet_holds where idempotency_key='e7:h-risk'`))[0].id as string;
  await call('POST', `${HOLDS}/${riskHold}/release`, relBody(), T.GLOBAL_ADMIN);

  // ---------------------------------------------------------------- revisão da obrigação depois da retenção: SINALIZA, não age
  const hBig = await call('POST', `${BASE}/chargeback-allocations/${alloc1.id}/wallet-holds`, holdBody(approvedSeller - 300, 'e7:h-big'), T.FINANCE);
  const bigId = hBig.json.data.holdId as string;
  const revDec = await call('POST', `${BASE}/chargebacks/${cb1}/decisions`, propBody(approvedSeller - 2000, { revisionReason: 'revisão após contra-prova do vendedor' }), T.FINANCE);
  const revApv = await call('POST', `${BASE}/chargeback-decisions/${revDec.json.data.decisionId}/approve`, {}, T.ADMIN2);
  const mBefore = await moneyHash(); const lBefore = await ledgerCount();
  const listFlag = await call('GET', `${HOLDS}?status=ACTIVE&allocationId=${alloc1.id}`, undefined, T.RISK_ANALYST);
  const det = await call('GET', `${HOLDS}/${bigId}`, undefined, T.FINANCE);
  const stillActive = (await q(`select status, amount::text a from wallet_holds where id=$1`, [bigId]))[0];
  const newOnRevised = await call('POST', `${BASE}/chargeback-allocations/${alloc1.id}/wallet-holds`, holdBody(10, 'e7:after-rev'), T.FINANCE);
  report('E13 revisão da decisão DEPOIS da retenção (seller reduzido em 2000): a retenção ativa é SINALIZADA EXCEEDS_APPROVED_OBLIGATION (lista e detalhe), continua ACTIVE com o mesmo valor, nada é liberado/reduzido/movido e nenhuma retenção nova é aceita acima do vigente', revApv.status === 200 && listFlag.json.data.items[0]?.assessment.state === 'EXCEEDS_APPROVED_OBLIGATION' && det.json.data.assessment.state === 'EXCEEDS_APPROVED_OBLIGATION' && Number(det.json.data.assessment.approvedObligation) === approvedSeller - 2000 && stillActive.status === 'ACTIVE' && Number(stillActive.a) === approvedSeller - 300 && newOnRevised.status === 409 && JSON.stringify(await moneyHash()) === JSON.stringify(mBefore) && (await ledgerCount()) === lBefore, { flag: listFlag.json?.data?.items?.[0]?.assessment, det: det.json?.data?.assessment, newOnRevised: newOnRevised.json?.error });
  // chargeback revertido / teto N reduzido: sinalizados também
  await pool.query(`update payment_chargebacks set local_status='reversed' where id=$1`, [cb1]);
  const flagRev = (await call('GET', `${HOLDS}/${bigId}`, undefined, T.FINANCE)).json.data.assessment.state;
  const newOnReversed = await call('POST', `${BASE}/chargeback-allocations/${alloc1.id}/wallet-holds`, holdBody(10, 'e7:after-reversed'), T.FINANCE);
  await pool.query(`update payment_chargebacks set local_status='lost' where id=$1`, [cb1]);
  await call('POST', `${HOLDS}/${bigId}/release`, relBody(), T.GLOBAL_ADMIN);
  const approvedRev = approvedSeller - 2000;
  await pool.query(`update orders set seller_net_amount=$2 where id=$1`, [alloc1.order_id, String(approvedRev - 100)]);
  const overNet = await call('POST', `${BASE}/chargeback-allocations/${alloc1.id}/wallet-holds`, holdBody(approvedRev, 'e7:over-net'), T.FINANCE);
  await pool.query(`update orders set seller_net_amount=$2 where id=$1`, [alloc1.order_id, String(net1)]);
  report('E14 chargeback que deixa de estar perdido: retenção sinalizada CHARGEBACK_NOT_LOST e nova recusada (409); teto líquido N do pedido reduzido: retenção dentro da responsabilidade mas acima de N = 409 EXCEEDS_ORDER_NET_CAP', flagRev === 'CHARGEBACK_NOT_LOST' && newOnReversed.status === 409 && newOnReversed.json.error.code === 'CHARGEBACK_NOT_LOST' && overNet.status === 409 && overNet.json.error.code === 'EXCEEDS_ORDER_NET_CAP', { flagRev, a: newOnReversed.json?.error, b: overNet.json?.error });

  // ---------------------------------------------------------------- D3: consulta de retenções antigas (sem alertas)
  const old = await call('POST', `${BASE}/chargeback-allocations/${alloc1.id}/wallet-holds`, holdBody(200, 'e7:h-old'), T.FINANCE);
  await pool.query(`alter table wallet_holds disable trigger nusali_wallet_hold_trg_guard`);
  await pool.query(`update wallet_holds set created_at = now() - interval '45 days' where id=$1`, [old.json.data.holdId]);
  await pool.query(`alter table wallet_holds enable trigger nusali_wallet_hold_trg_guard`);
  const aged = await call('GET', `${HOLDS}?status=ACTIVE&olderThanDays=30`, undefined, T.FINANCE);
  const youngOnly = await call('GET', `${HOLDS}?status=ACTIVE&olderThanDays=60`, undefined, T.FINANCE);
  const byOrder = await call('GET', `${HOLDS}?orderId=${alloc1.order_id}&limit=2`, undefined, T.RISK_ANALYST);
  const listDenied = await Promise.all([T.SUPPORT, T.ADMIN].map((t) => call('GET', HOLDS, undefined, t))); const listNoTok = await call('GET', HOLDS);
  report('E15 D3: idade em dias e filtro "mais antigas que N dias" (45 dias aparece em ≥30, some em ≥60) com os dados existentes; filtro por pedido e paginação; SUPPORT/ADMIN = 403 e sem token = 401; nenhuma retenção expira sozinha', aged.json.data.items.some((i: any) => i.id === old.json.data.holdId && i.assessment.ageDays >= 45) && !youngOnly.json.data.items.some((i: any) => i.id === old.json.data.holdId) && byOrder.json.data.items.length <= 2 && byOrder.json.data.total >= 3 && listDenied.every((r) => r.status === 403) && listNoTok.status === 401 && (await q(`select status from wallet_holds where id=$1`, [old.json.data.holdId]))[0].status === 'ACTIVE', { aged: aged.json?.data?.items?.map((i: any) => [i.id === old.json.data.holdId, i.assessment.ageDays]), young: youngOnly.json?.data?.items?.length, by: byOrder.json?.data?.total, byLen: byOrder.json?.data?.items?.length, denied: listDenied.map((r) => r.status), noTok: listNoTok.status });
  await call('POST', `${HOLDS}/${old.json.data.holdId}/release`, relBody(), T.GLOBAL_ADMIN);

  // ---------------------------------------------------------------- concorrência (HTTP)
  const racers = await Promise.all(Array.from({ length: 6 }, (_, i) => call('POST', `${BASE}/chargeback-allocations/${alloc1.id}/wallet-holds`, holdBody(300, `e7:race:${i}`), [T.FINANCE, T.RISK_ANALYST, T.GLOBAL_ADMIN][i % 3])));
  const racerOk = racers.filter((r) => r.status === 201).length;
  report('E16 6 pedidos paralelos de retenção (chaves e papéis diferentes) para a MESMA alocação: exatamente 1 é criada; as outras = 409 DUPLICATE_ACTIVE_HOLD', racerOk === 1 && racers.filter((r) => r.status === 409 && r.json.error.code === 'DUPLICATE_ACTIVE_HOLD').length === 5, racers.map((r) => r.json?.error?.code ?? r.status));
  const winnerHold = racers.find((r) => r.status === 201)!.json.data.holdId as string;
  const idemPar = await Promise.all(Array.from({ length: 5 }, () => call('POST', `${HOLDS}/${winnerHold}/release`, relBody(), T.ADMIN2)));
  report('E17 5 liberações paralelas da mesma retenção: exatamente 1 efetiva (alreadyReleased=false), 4 replays; uma única liberação gravada e auditada', idemPar.every((r) => r.status === 200) && idemPar.filter((r) => r.json.data.alreadyReleased === false).length === 1 && (await q(`select count(*)::int n from audit_logs where resource='wallet_hold' and resource_id=$1 and action='wallet.hold.release'`, [winnerHold]))[0].n === 1, idemPar.map((r) => r.json?.data?.alreadyReleased ?? r.json?.error?.code));
  const free2 = Number(await balanceNow());
  const mix = await Promise.all([
    call('POST', `${BASE}/chargeback-allocations/${alloc1.id}/wallet-holds`, holdBody(Math.min(approvedRev, free2) - 0, 'e7:mix:hold'), T.FINANCE).then((r) => (r.status === 201 ? 'hold' : r.json.error.code)),
    requestSellerPayout({ sellerId: sellerId1, sellerUserId: sellerUser1, amount: free2, currency: 'XOF', method: 'wallet', idempotencyKey: 'e7:mix:payout' }).then(() => 'payout', (e: any) => e.code),
  ]);
  const balMix = await q(`select balance::text b, (select coalesce(sum(amount),0)::text from wallet_holds where wallet_id=$1 and status='ACTIVE') h from wallets where id=$1`, [wallet1.id]);
  report('E18 retenção × saque do saldo todo em paralelo: nunca os dois; o disponível nunca fica negativo', mix.filter((x) => x === 'hold' || x === 'payout').length === 1 && Number(balMix[0].b) - Number(balMix[0].h) >= 0, { mix, balMix });

  // ---------------------------------------------------------------- E5/E1–E6 preservados e invariantes
  const inv = (await q(`select (select count(*)::int from ledger_transactions t where t.status='POSTED' and (select coalesce(sum(case when direction='DEBIT' then amount else -amount end),0) from ledger_entries e where e.transaction_id=t.id) <> 0) unbalanced, (select count(*)::int from wallets where balance < 0) negative`))[0];
  report('E19 invariantes: nenhum lançamento desbalanceado; nenhuma carteira negativa; as aprovações/revisões da E5 funcionaram com retenções ativas (E5 independente das retenções)', inv.unbalanced === 0 && inv.negative === 0 && revApv.status === 200, inv);

  console.log(`\n${passed}/${total} testes passaram.`);
  await pool.end(); server.close(); process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('FALHA FATAL:', e); process.exit(1); });
