/**
 * LEDGER SOMBRA — E2: PORTÃO DA FLAG LEDGER_OUTBOX_ENABLED. Com a flag desligada o endpoint interno, o serviço do worker, o job e o runner de linha de comando
 * NÃO podem consultar tabelas do outbox, reconciliar, criar eventos nem executar qualquer operação financeira — nem quando as tabelas da migração 0039 não
 * existem. A autenticação por INTERNAL_JOBS_SECRET é sempre obrigatória (a flag ligada nunca a dispensa). Postgres DESCARTAVEL; serviços reais; nunca produção.
 */
import { ledgerTestDbUrl } from './support/ledgerE2Env.js';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import express from 'express';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import { purchaseGroups, payments, paymentAttempts } from '../src/db/schema.js';
import { OrderService } from '../src/server/modules/orders/orderService.js';
import { PaymentService } from '../src/server/modules/payments/paymentService.js';
import { FinancialLedgerService } from '../src/server/modules/ledger/financialLedgerService.js';
import { runLedgerOutboxOnce } from '../src/server/modules/ledger/outbox/outboxService.js';
import { runLedgerShadowJobOnce } from '../src/server/modules/ledger/outbox/ledgerOutboxJob.js';
import { isOutboxEnabled } from '../src/server/modules/ledger/outbox/outboxEvents.js';
import { internalJobsRouter } from '../src/server/modules/jobs/internalJobsRoutes.js';
import { resolveCartShippingPreview } from '../src/server/modules/shipping/shippingPreviewService.js';
import { getDbPool } from '../src/db/index.js';
import { setupCheckoutKit } from './support/checkoutTestKit.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 900)}`); };
const SECRET = 'test_internal_jobs_secret_fixture_0123456789';
const OUTBOX_TABLES = ['ledger_outbox_events', 'ledger_reconciliation_runs', 'ledger_reconciliation_findings'];

async function main() {
  const pool = new pg.Pool({ connectionString: ledgerTestDbUrl, ssl: { rejectUnauthorized: false }, max: 10 });
  const db = drizzle(pool, { schema });
  const q = async (sqlText: string, p: any[] = []) => (await pool.query(sqlText, p)).rows;

  // migração 0039 (a mesma do repositório) aplicada no banco descartável se ainda não existir; depois os testes a escondem/restauram por renomeação
  if (!(await q(`select to_regclass('public.ledger_outbox_events') t`))[0].t) {
    for (const stmt of fs.readFileSync(path.join(root, 'drizzle/0039_ledger_outbox.sql'), 'utf8').split('--> statement-breakpoint')) if (stmt.trim()) await pool.query(stmt);
  }
  // migrações posteriores (0040 reembolsos, 0041 reversão de frete): a reconciliação consulta suas tabelas; aplicadas aqui se ainda não existirem
  if (!(await q(`select 1 from pg_constraint where conname='ledger_transactions_type_check' and pg_get_constraintdef(oid) like '%REFUND_PROCESSED%'`)).length) {
    for (const stmt of fs.readFileSync(path.join(root, 'drizzle/0040_ledger_refunds.sql'), 'utf8').split('--> statement-breakpoint')) if (stmt.trim()) await pool.query(stmt);
  }
  if (!(await q(`select to_regclass('public.shipping_cost_reversals') t`))[0].t) {
    for (const stmt of fs.readFileSync(path.join(root, 'drizzle/0041_ledger_shipping_reversal.sql'), 'utf8').split('--> statement-breakpoint')) if (stmt.trim()) await pool.query(stmt);
  }
  const hideTables = async () => { for (const t of OUTBOX_TABLES) await pool.query(`alter table ${t} rename to ${t}_hidden`); };
  const showTables = async () => { for (const t of OUTBOX_TABLES) await pool.query(`alter table ${t}_hidden rename to ${t}`); };
  const tablesPresent = async () => (await q(`select count(*)::int n from pg_tables where schemaname='public' and tablename = any($1)`, [OUTBOX_TABLES]))[0].n;

  const kit = await setupCheckoutKit(db, 'gate');
  await kit.setFlag('multiSellerCheckoutEnabled', true); await kit.setFlag('defaultShippingPolicyMode', 'CUSTOMER_PAYS');
  await kit.setFlag('shippingNusaliSubsidy', { enabled: false, percent: 0, rules: { 'GW:STANDARD': { enabled: true, percent: 50 } } });
  const bissau = await kit.sector('Bissau'); const std = await kit.service('STANDARD');
  const sector: any = (await db.select().from(schema.shippingSectors)).filter((x: any) => x.countryCode === 'GW' && x.id !== bissau.id).sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)))[0];
  const seller = await kit.makeSeller('gate'); const store = await kit.makeStore(seller, 'gate', sector.id);
  const product = await kit.makeProduct(seller, store.storeId, 'P gate', 0.3, 5000);
  await kit.insertInventory({ sellerId: seller.sellerId, productId: product.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: store.floc.id, quantityOnHand: 5000 });
  await kit.insertRate((await kit.route(sector.id, bissau.id)).id, std.id, 1000, { min: 0, max: 10 });

  const place = async () => {
    const buyer = await kit.makeBuyer(bissau.id); await kit.addToCart(buyer.cartId, product.id, 1, 5000);
    const qq: any = await resolveCartShippingPreview({ destinationShippingSectorId: bissau.id, serviceCode: 'STANDARD', items: [{ productId: product.id, variantId: null, quantity: 1 }] }, db);
    const opt = qq.services?.find((o: any) => o.code === 'STANDARD') ?? qq;
    const v: any = await OrderService.createOrderFromCart({ userId: buyer.buyerId, addressId: buyer.addressId, paymentMethod: 'pix', shippingSelection: { serviceCode: 'STANDARD', expectedShippingChargedToBuyer: opt.shippingChargedToBuyer } } as any, db);
    return { buyer, orderId: v.orders[0].id as string, groupId: v.purchaseGroup.id as string };
  };
  const newPay = async (placed: any) => {
    const [g] = await db.select().from(purchaseGroups).where(eq(purchaseGroups.id, placed.groupId));
    const payId = kit.uid('pay_group'), ext = kit.uid('EXT');
    await db.insert(payments).values({ id: payId, orderId: null, purchaseGroupId: placed.groupId, settlementRole: 'candidate', buyerId: placed.buyer.buyerId, amount: String(g.totalAmount), currency: 'XOF', provider: 'asaas', method: 'pix', status: 'pending', idempotencyKey: `asaas_pix_group:${placed.groupId}:${payId}`, transactionRef: ext, createdAt: new Date(), updatedAt: new Date() } as any);
    await db.insert(paymentAttempts).values({ id: kit.uid('att'), paymentId: payId, provider: 'asaas', status: 'reserved', createdAt: new Date() } as any);
    return { groupId: placed.groupId, payId, ext, total: Number(g.totalAmount) };
  };
  const confirm = (p: any) => PaymentService.confirmPurchaseGroupPayment(p.groupId, p.payId, { provider: 'asaas', transactionRef: p.ext, receivedValue: p.total });
  const withStub = async (fn: () => Promise<any>) => {
    const orig = (FinancialLedgerService as any).recordPaymentReceived;
    (FinancialLedgerService as any).recordPaymentReceived = async () => { throw Object.assign(new Error('conexão perdida (simulada)'), { cause: { code: '57P01' } }); };
    try { return await fn(); } finally { (FinancialLedgerService as any).recordPaymentReceived = orig; }
  };
  const moneyHash = async () => (await q(`select
    (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from wallets x) w, (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from wallet_transactions x) wt,
    (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from escrow_accounts x) esc, (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from escrow_transactions x) etx,
    (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from payments x) pay, (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from orders x) ord,
    (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from refunds x) ref`))[0];
  const ledgerState = async () => (await q(`select (select count(*)::int from ledger_transactions) tx, (select count(*)::int from ledger_entries) ent,
    (select md5(coalesce(string_agg(id||status,'|' order by id),'')) from ledger_transactions) h`))[0];

  // contador de acessos ao banco feitos pelos serviços da aplicação (o pool real); as consultas do próprio teste usam outro pool
  const appPool: any = getDbPool(); let appQueries = 0;
  const origQuery = appPool.query.bind(appPool), origConnect = appPool.connect.bind(appPool);
  appPool.query = (...a: any[]) => { appQueries++; return origQuery(...a); };
  appPool.connect = (...a: any[]) => { appQueries++; return origConnect(...a); };
  const measure = async <T>(fn: () => Promise<T>) => { const b = appQueries; const value = await fn(); return { value, queries: appQueries - b }; };

  // servidor HTTP real com o router real
  const app = express(); app.use(express.json()); app.use('/internal/jobs', internalJobsRouter);
  const server: http.Server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const port = (server.address() as any).port;
  const call = async (headers: Record<string, string>, body: any = {}) => {
    const r = await fetch(`http://127.0.0.1:${port}/internal/jobs/ledger-outbox`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return { status: r.status, json: await r.json().catch(() => null) as any };
  };
  const runner = (flag: string | undefined, args: string[] = []) => {
    const env: Record<string, string | undefined> = { ...process.env };
    // o executor seguro do filho não aceita DATABASE_URL já apontando para o banco de teste (parece produção): ele a recoloca sozinho
    env.DATABASE_URL = ''; env.NODE_OPTIONS = '';
    if (flag === undefined) delete env.LEDGER_OUTBOX_ENABLED; else env.LEDGER_OUTBOX_ENABLED = flag;
    const r = spawnSync(process.execPath, ['scripts/with-test-env.cjs', 'npx', 'tsx', 'scripts/run-ledger-outbox.ts', ...args], { cwd: root, env, encoding: 'utf8', timeout: 120000 });
    const out = r.stdout || ''; const NL = String.fromCharCode(10); const outLines = out.split(NL).map((l) => l.trim()); const i = outLines.lastIndexOf('{'); const j = outLines.indexOf('}', i);
    let json: any = null; try { json = JSON.parse(outLines.slice(i, j + 1).join(NL)); } catch { /* sem JSON */ }
    return { code: r.status, json, out, err: r.stderr || '' };
  };

  // ================================================================================================================================================
  // A) a regra da flag (pura): só o texto exato "true" liga
  // ================================================================================================================================================
  report('A1 só LEDGER_OUTBOX_ENABLED="true" liga; ausente, vazio, "false", "1", "TRUE", " true" = desligado',
    isOutboxEnabled({ LEDGER_OUTBOX_ENABLED: 'true' }) && [undefined, '', 'false', '1', 'TRUE', ' true', 'yes'].every((v) => !isOutboxEnabled({ LEDGER_OUTBOX_ENABLED: v })));
  const variants = ['', 'false', '1', 'TRUE', 'yes'];
  const vres = await Promise.all(variants.map((v) => runLedgerOutboxOnce({ env: { ...process.env, LEDGER_OUTBOX_ENABLED: v } })));
  report('A2 o serviço do worker recusa qualquer valor diferente de "true" (status DISABLED, motivo OUTBOX_FLAG_OFF, nada reivindicado)', vres.every((r) => r.status === 'DISABLED' && r.disabledReason === 'OUTBOX_FLAG_OFF' && r.claimed === 0 && r.swept === 0), vres);

  // ================================================================================================================================================
  // B) preparação: pedido pago com o outbox LIGADO e o ledger indisponível => evento RETRYING no banco (trabalho pendente real)
  // ================================================================================================================================================
  process.env.LEDGER_OUTBOX_ENABLED = 'true';
  const p1 = await place(); const pay1 = await newPay(p1);
  await withStub(() => confirm(pay1));
  const ev1 = (await q(`select id, status, attempts, next_attempt_at::text na, last_error_code from ledger_outbox_events where order_id=$1`, [p1.orderId]))[0];
  report('B1 preparação: pagamento confirmado com o ledger fora do ar => evento pendente de verdade (RETRYING, tentativa 1) e nenhum lançamento', ev1?.status === 'RETRYING' && ev1.attempts === 1 && (await ledgerState()).tx === 0, ev1);

  const before = { money: await moneyHash(), ledger: await ledgerState(), ev: (await q(`select id, status, attempts, next_attempt_at::text na, locked_by from ledger_outbox_events order by id`)), nOutbox: (await q(`select count(*)::int n from ledger_outbox_events`))[0].n, runs: (await q(`select count(*)::int n from ledger_reconciliation_runs`))[0].n, finds: (await q(`select count(*)::int n from ledger_reconciliation_findings`))[0].n };
  const sameState = async () => {
    const now = { money: await moneyHash(), ledger: await ledgerState(), ev: (await q(`select id, status, attempts, next_attempt_at::text na, locked_by from ledger_outbox_events order by id`)), nOutbox: (await q(`select count(*)::int n from ledger_outbox_events`))[0].n, runs: (await q(`select count(*)::int n from ledger_reconciliation_runs`))[0].n, finds: (await q(`select count(*)::int n from ledger_reconciliation_findings`))[0].n };
    return JSON.stringify(now) === JSON.stringify(before);
  };

  // ================================================================================================================================================
  // C) autenticação: sempre obrigatória, com a flag ligada ou desligada
  // ================================================================================================================================================
  delete process.env.INTERNAL_JOBS_SECRET;
  process.env.LEDGER_OUTBOX_ENABLED = 'false';
  const c1 = await call({ 'x-internal-jobs-secret': SECRET });
  report('C1 sem INTERNAL_JOBS_SECRET configurado o endpoint recusa (503), mesmo com o segredo no header e a flag desligada', c1.status === 503 && c1.json?.error?.code === 'INTERNAL_JOBS_NOT_CONFIGURED', c1);
  process.env.INTERNAL_JOBS_SECRET = SECRET;
  const c2 = await call({});
  process.env.LEDGER_OUTBOX_ENABLED = 'true';
  const c3 = await call({}); const c4 = await call({ 'x-internal-jobs-secret': 'segredo-errado-de-mesmo-tamanho-0000000' });
  report('C2 sem credencial: 401 com a flag desligada E 401 com a flag LIGADA; segredo errado com a flag ligada: 401 — a flag nunca dispensa a autenticação', c2.status === 401 && c3.status === 401 && c4.status === 401 && c3.json?.error?.code === 'INVALID_INTERNAL_JOBS_SECRET', { c2, c3, c4 });
  report('C3 as recusas não tocaram em nada (banco, ledger, outbox, dinheiro idênticos)', await sameState());

  // ================================================================================================================================================
  // D) flag DESLIGADA, tabelas PRESENTES, com trabalho pendente: nada é consultado, processado ou reconciliado
  // ================================================================================================================================================
  process.env.LEDGER_OUTBOX_ENABLED = 'false';
  const d1 = await measure(() => runLedgerOutboxOnce());
  const d2 = await measure(() => runLedgerShadowJobOnce({ reconcile: true, triggeredBy: 'test' }));
  const d3 = await measure(() => call({ 'x-internal-jobs-secret': SECRET }, { reconcile: true, batchSize: 50 }));
  report('D1 worker (serviço) com a flag desligada: DISABLED/OUTBOX_FLAG_OFF e ZERO acessos ao banco, mesmo havendo evento pendente', d1.value.status === 'DISABLED' && d1.value.disabledReason === 'OUTBOX_FLAG_OFF' && d1.queries === 0, d1);
  report('D2 job com reconcile=true e a flag desligada: DISABLED, sem métricas, sem reconciliação e ZERO acessos ao banco', d2.value.outbox.status === 'DISABLED' && d2.value.reconciliation === null && d2.value.metrics === null && d2.value.attentionRequired === false && d2.queries === 0, d2);
  report('D3 endpoint AUTENTICADO com a flag desligada (pedindo reconcile): 200 DISABLED/LEDGER_OUTBOX_DISABLED, sem reconciliação e ZERO acessos ao banco', d3.value.status === 200 && d3.value.json?.data?.status === 'DISABLED' && d3.value.json.data.reason === 'LEDGER_OUTBOX_DISABLED' && d3.value.json.data.reconciliation === null && d3.queries === 0, d3);
  const d4 = runner('false', ['--reconcile']);
  const d5 = runner(undefined);
  report('D4 runner de linha de comando com a flag desligada (explícita ou ausente), inclusive com --reconcile: exit 0 e status DISABLED', d4.code === 0 && d4.json?.status === 'DISABLED' && d5.code === 0 && d5.json?.status === 'DISABLED', { d4: { code: d4.code, json: d4.json, err: d4.err.slice(0, 300) }, d5: { code: d5.code, json: d5.json } });
  report('D5 SEM EFEITOS: o evento pendente continua RETRYING com as mesmas tentativas/horário; nenhum evento novo; nenhuma execução/achado de reconciliação; ledger e dinheiro real idênticos', await sameState());

  // ================================================================================================================================================
  // E) flag DESLIGADA e tabelas da 0039 AUSENTES (estado de produção hoje)
  // ================================================================================================================================================
  await hideTables();
  report('E0 pré-condição: as 3 tabelas da 0039 não existem', (await tablesPresent()) === 0);
  const e1 = await measure(() => runLedgerOutboxOnce());
  const e2 = await measure(() => runLedgerShadowJobOnce({ reconcile: true }));
  const e3 = await measure(() => call({ 'x-internal-jobs-secret': SECRET }, { reconcile: true }));
  const e4 = runner('false', ['--reconcile']);
  report('E1 sem tabelas e flag desligada: worker, job, endpoint autenticado e runner terminam em DISABLED, sem erro e sem nenhum acesso ao banco', e1.value.status === 'DISABLED' && e1.queries === 0 && e2.value.outbox.status === 'DISABLED' && e2.queries === 0 && e3.value.status === 200 && e3.value.json?.data?.status === 'DISABLED' && e3.queries === 0 && e4.code === 0 && e4.json?.status === 'DISABLED', { e1, e2, e3, e4: { code: e4.code, json: e4.json, err: e4.err.slice(0, 300) } });
  let controlErr: any = null;
  try { await runLedgerOutboxOnce({ env: { ...process.env, LEDGER_OUTBOX_ENABLED: 'true' } }); } catch (e: any) { controlErr = e; }
  report('E2 CONTROLE: com a flag LIGADA e as mesmas tabelas ausentes o worker falha — prova que é o portão da flag (e não a ausência de trabalho) que protege', !!controlErr, controlErr?.message);
  const e5 = await place(); const pay5 = await newPay(e5);
  await confirm(pay5);
  const o5 = (await q(`select payment_status, escrow_status from orders where id=$1`, [e5.orderId]))[0];
  const l5 = await q(`select type from ledger_transactions where order_id=$1`, [e5.orderId]);
  report('E3 comportamento da E1 preservado sem as tabelas e com a flag desligada: o pagamento confirma normalmente e o PAYMENT_RECEIVED é lançado direto no ledger (sem outbox)', o5.payment_status === 'paid' && o5.escrow_status === 'held' && l5.length === 1 && l5[0].type === 'PAYMENT_RECEIVED', { o5, l5 });
  await showTables();
  report('E4 tabelas restauradas e o outbox continua sem nenhum evento para o pedido pago pelo caminho da E1', (await tablesPresent()) === 3 && (await q(`select count(*)::int n from ledger_outbox_events where order_id=$1`, [e5.orderId]))[0].n === 0);

  // ================================================================================================================================================
  // F) flag LIGADA com configuração válida (autenticado, tabelas presentes, cutoff definido): o worker volta a funcionar
  // ================================================================================================================================================
  process.env.LEDGER_OUTBOX_ENABLED = 'true';
  const moneyF0 = await moneyHash();
  await q(`update ledger_outbox_events set next_attempt_at = now() - interval '1 minute' where id=$1`, [ev1.id]);
  const f1 = await measure(() => call({ 'x-internal-jobs-secret': SECRET }, { reconcile: true }));
  const evAfter = (await q(`select status, attempts, ledger_transaction_id from ledger_outbox_events where id=$1`, [ev1.id]))[0];
  report('F1 flag ligada + segredo válido: o endpoint processa o evento pendente (DONE com lançamento ligado) e executa a reconciliação', f1.value.status === 200 && f1.value.json?.data?.status === 'OK' && f1.value.json.data.claimed >= 1 && evAfter.status === 'DONE' && !!evAfter.ledger_transaction_id && f1.value.json.data.reconciliation !== null && f1.queries > 0, { f1: f1.value, evAfter });
  const f2 = runner('true', ['--reconcile']);
  report('F2 runner com a flag ligada: exit 0, status OK, executa a reconciliação', f2.code === 0 && f2.json?.status === 'OK' && f2.json.reconciliation !== null, { code: f2.code, json: f2.json, err: f2.err.slice(0, 300) });
  report('F3 o worker só escreve no ledger sombra: o dinheiro real (carteiras, Escrow, pagamentos, pedidos, reembolsos) é idêntico antes e depois', JSON.stringify(await moneyHash()) === JSON.stringify(moneyF0));

  server.close(); appPool.query = origQuery; appPool.connect = origConnect;
  await pool.end();
  console.log(`\n${passed}/${total} testes passaram.`);
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
