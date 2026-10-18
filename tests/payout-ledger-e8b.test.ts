/**
 * E8b — SAQUES NO LEDGER SOMBRA (PAYOUT_REQUESTED / PAYOUT_COMPLETED / PAYOUT_FAILED) pelo outbox, worker, reconciliação e reparo EXISTENTES. Postgres DESCARTÁVEL, serviços reais.
 * Prova: lançamentos corretos e balanceados; conclusão só com o saque concluído; falha reverte a solicitação; idempotência/replay/concorrência; falha após o commit e recuperação;
 * ordem fora de sequência; snapshot divergente; sem backfill (cutoff); reconciliação + reparo manual; nenhum dinheiro real movido pelos lançamentos; conciliação com carteira e saques.
 */
import { ledgerTestDbUrl } from './support/ledgerE2Env.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/db/schema.js';
import { users, sellers, wallets, countries } from '../src/db/schema.js';
import { requestSellerPayout, processPayoutStatusChange } from '../src/server/modules/wallet/payoutService.js';
import { FinancialLedgerService } from '../src/server/modules/ledger/financialLedgerService.js';
import { buildPayoutEntries, evaluatePayout, payoutKey, type PayoutLedgerView } from '../src/server/modules/ledger/payoutLedger.js';
import { runLedgerOutboxOnce } from '../src/server/modules/ledger/outbox/outboxService.js';
import { runLedgerReconciliation, repairMissingEvents } from '../src/server/modules/ledger/outbox/reconciliationService.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)).slice(0, 600)}`); };
let seq = 0; const uid = (p: string) => `${p}_e8b_${Date.now()}_${++seq}_${Math.random().toString(36).slice(2, 6)}`;
const pgErr = (code: string) => Object.assign(new Error('simulated'), { cause: { code } });

async function main() {
  const pool = new pg.Pool({ connectionString: ledgerTestDbUrl, ssl: false, max: 20 });
  const db: any = drizzle(pool, { schema });
  const q = async (s: string, p: any[] = []) => (await pool.query(s, p)).rows;
  const apply = async (file: string) => { for (const stmt of fs.readFileSync(path.join(root, 'drizzle', file), 'utf8').split('--> statement-breakpoint')) if (stmt.trim()) await pool.query(stmt); };
  if (!(await q(`select to_regclass('public.wallet_holds') t`))[0].t) await apply('0043_ledger_wallet_holds.sql');
  if (!(await q(`select 1 from pg_constraint where conname='ledger_outbox_events_subject_check'`)).length) await apply('0044_ledger_payout_events.sql');
  await db.insert(countries).values([{ id: 'GW', code: 'GW', name: 'Guiné-Bissau', flag: 'x', currency: 'XOF', currencySymbol: 'CFA', phonePrefix: '+245', isActive: true, createdAt: new Date() }]).onConflictDoNothing();
  const mkUser = async (role: string) => { const id = uid('usr'); await db.insert(users).values({ id, email: `${id}@t.test`, passwordHash: 'x', fullName: `T ${id}`, phone: '', role, countryCode: 'GW', kycStatus: 'verified', riskScore: 'baixo', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date() }); return id; };
  const mkSeller = async (balance: string) => {
    const userId = await mkUser('SELLER'); const sellerId = uid('sel'); const walletId = uid('wal');
    await db.insert(sellers).values({ id: sellerId, userId, companyName: sellerId, tradingName: sellerId, taxId: `TAX${sellerId}`, phone: '0', countryCode: 'GW', status: 'active', createdAt: new Date(), updatedAt: new Date() });
    await db.insert(wallets).values({ id: walletId, userId, currency: 'XOF', balance, cashbackBalance: '0.00', pendingBalance: '0.00', status: 'active', createdAt: new Date(), updatedAt: new Date() });
    return { userId, sellerId, walletId };
  };
  const ADMIN = await mkUser('GLOBAL_ADMIN'); const FIN = await mkUser('FINANCE');
  const req = (s: any, amount: number, key?: string) => requestSellerPayout({ sellerId: s.sellerId, sellerUserId: s.userId, amount, currency: 'XOF', method: 'wallet', idempotencyKey: key ?? uid('pk') });
  const err = async (fn: () => Promise<any>): Promise<any> => { try { await fn(); return null; } catch (e: any) { return e; } };
  const drain = async (shift = 0) => { for (let i = 0; i < 10; i++) { const r: any = await runLedgerOutboxOnce({ workerId: 'w-e8b', now: new Date(Date.now() + shift) }); if (!r.claimed) break; } };
  const txs = async (payoutId: string) => q(`select id, type, status, seller_id, payout_id, order_id from ledger_transactions where payout_id=$1 order by occurred_at, created_at, type`, [payoutId]);
  const evs = async (payoutId: string) => q(`select id, event_type, status, attempts, ledger_transaction_id, order_id, payout_id, last_error_code from ledger_outbox_events where payout_id=$1 order by created_at, event_type`, [payoutId]);
  const net = async (code: string, sellerId: string | null) => Number((await q(`select coalesce(sum(case when e.direction='CREDIT' then e.amount else -e.amount end),0)::numeric n from ledger_entries e join ledger_accounts a on a.id=e.account_id where a.code=$1 and ($2::text is null or e.seller_id=$2)`, [code, sellerId]))[0].n);
  const money = async () => (await q(`select (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from wallets x) w, (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from wallet_transactions x) wt, (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from seller_payouts x) po`))[0];
  const bal = async (s: any) => Number((await q('select balance::numeric b from wallets where id=$1', [s.walletId]))[0].b);

  // ---------------------------------------------------------------- L1 puro: lançamentos, chaves, avaliação
  const P = { id: 'po1', sellerId: 'sel1', amount: '100.00', currency: 'XOF' };
  const eq = (t: any) => { const b: any = buildPayoutEntries(P, t); return b.status === 'OK' ? b.entries.map((e: any) => `${e.direction[0]} ${e.accountCode} ${e.ownerType} ${e.amount}`).join(' | ') : b; };
  const balanced = (t: any) => { const b: any = buildPayoutEntries(P, t); const d = b.entries.filter((e: any) => e.direction === 'DEBIT').reduce((a: number, e: any) => a + Number(e.amount), 0); const c = b.entries.filter((e: any) => e.direction === 'CREDIT').reduce((a: number, e: any) => a + Number(e.amount), 0); return d === c && d === 100; };
  report('L1 lançamentos puros: SOLICITAÇÃO D SELLER_PAYABLE / C SELLER_PAYOUT_CLEARING; CONCLUSÃO D SELLER_PAYOUT_CLEARING / C PAYMENT_CLEARING (dinheiro saindo, como o reembolso); FALHA D SELLER_PAYOUT_CLEARING / C SELLER_PAYABLE; todos balanceados; valor inválido = SKIPPED',
    eq('PAYOUT_REQUESTED') === 'D SELLER_PAYABLE SELLER 100.00 | C SELLER_PAYOUT_CLEARING SELLER 100.00' && eq('PAYOUT_COMPLETED') === 'D SELLER_PAYOUT_CLEARING SELLER 100.00 | C PAYMENT_CLEARING PLATFORM 100.00' && eq('PAYOUT_FAILED') === 'D SELLER_PAYOUT_CLEARING SELLER 100.00 | C SELLER_PAYABLE SELLER 100.00'
    && ['PAYOUT_REQUESTED', 'PAYOUT_COMPLETED', 'PAYOUT_FAILED'].every(balanced) && (buildPayoutEntries({ ...P, amount: '0' }, 'PAYOUT_REQUESTED') as any).status === 'SKIPPED' && (buildPayoutEntries({ ...P, amount: 'x' }, 'PAYOUT_REQUESTED') as any).status === 'SKIPPED'
    && payoutKey('PAYOUT_REQUESTED', 'a') === 'payout_requested:a' && payoutKey('PAYOUT_COMPLETED', 'a') === 'payout_completed:a' && payoutKey('PAYOUT_FAILED', 'a') === 'payout_failed:a', { r: eq('PAYOUT_REQUESTED'), c: eq('PAYOUT_COMPLETED'), f: eq('PAYOUT_FAILED') });
  const now0 = new Date(); const old = new Date(now0.getTime() - 3 * 3600_000);
  const view = (over: Partial<PayoutLedgerView> & { status?: string }): PayoutLedgerView => ({ payout: { id: 'po1', sellerId: 'sel1', amount: '100.00', currency: 'XOF', status: over.status ?? 'pending', createdAt: old, processedAt: null }, requested: { tx: null, event: null, entries: [] }, completed: { tx: null, event: null, entries: [] }, failed: { tx: null, event: null, entries: [] }, ...over });
  const f1 = evaluatePayout(view({}), now0, 15); const f2 = evaluatePayout(view({ status: 'pending', completed: { tx: { id: 't', status: 'POSTED' }, event: null, entries: [] } }), now0, 15);
  const f3 = evaluatePayout(view({ status: 'completed', failed: { tx: { id: 'f', status: 'POSTED' }, event: null, entries: [] }, completed: { tx: { id: 'c', status: 'POSTED' }, event: null, entries: [] } }), now0, 15);
  report('L1b avaliação pura: saque sem lançamento nem evento há 3 h = CRÍTICO; lançamento de CONCLUSÃO com o saque pendente = CRÍTICO (estado antecipado); conclusão e falha juntas = CRÍTICO', f1.some((x) => x.type === 'PAYOUT_REQUESTED_LEDGER_MISSING_NO_EVENT' && x.severity === 'CRITICAL') && f2.some((x) => x.type === 'PAYOUT_COMPLETED_LEDGER_STATE_MISMATCH' && x.severity === 'CRITICAL') && f3.some((x) => x.type === 'PAYOUT_CONFLICTING_OUTCOMES'), { f1, f2, f3 });

  // ---------------------------------------------------------------- L2 solicitação → evento → lançamento
  const s1 = await mkSeller('1000.00'); const m0 = await money();
  const r1 = await req(s1, 100, 'k-l2');
  const e1 = await evs(r1.id); const t1 = await txs(r1.id);
  const ent1 = await q(`select a.code, e.direction, e.amount::numeric a, e.seller_id, e.order_id from ledger_entries e join ledger_accounts a on a.id=e.account_id join ledger_transactions t on t.id=e.transaction_id where t.payout_id=$1 order by e.line_number`, [r1.id]);
  report('L2 solicitação: saldo reservado (1000→900) e, na mesma operação, evento PAYOUT_REQUESTED sem order_id (payout_id) → DONE → lançamento POSTED balanceado D SELLER_PAYABLE 100 / C SELLER_PAYOUT_CLEARING 100 do vendedor', (await bal(s1)) === 900 && e1.length === 1 && e1[0].event_type === 'PAYOUT_REQUESTED' && e1[0].order_id === null && e1[0].payout_id === r1.id && e1[0].status === 'DONE' && t1.length === 1 && t1[0].type === 'PAYOUT_REQUESTED' && t1[0].status === 'POSTED' && t1[0].payout_id === r1.id && e1[0].ledger_transaction_id === t1[0].id
    && ent1.length === 2 && ent1[0].code === 'SELLER_PAYABLE' && ent1[0].direction === 'DEBIT' && ent1[1].code === 'SELLER_PAYOUT_CLEARING' && ent1[1].direction === 'CREDIT' && ent1.every((e: any) => Number(e.a) === 100 && e.seller_id === s1.sellerId && e.order_id === null), { e1, t1, ent1 });
  // ---------------------------------------------------------------- L3 idempotência / concorrência / reentrega
  const replay = await req(s1, 100, 'k-l2');
  await drain(); await drain();
  const par = await Promise.all(Array.from({ length: 8 }, () => req(s1, 50, 'k-l3')));
  await drain();
  const parId = par[0].id;
  report('L3 repetir a solicitação (mesma chave) e 8 em paralelo: UM evento e UM lançamento por saque (chaves únicas), reentrega do worker não duplica; saldo debitado uma vez (900→850)', replay.alreadyRequested === true && (await evs(r1.id)).length === 1 && (await txs(r1.id)).length === 1 && new Set(par.map((x: any) => x.id)).size === 1 && (await evs(parId)).length === 1 && (await txs(parId)).length === 1 && (await bal(s1)) === 850, { n: (await txs(parId)).length, b: await bal(s1) });
  const direct = await FinancialLedgerService.recordPayoutRequested({ payoutId: r1.id });
  report('L3b lançamento direto repetido = replay idempotente (mesma transação, nada gravado de novo)', direct.posted === true && direct.idempotentReplay === true && direct.transactionId === t1[0].id, direct);

  // ---------------------------------------------------------------- L4 conclusão: só quando o saque está concluído
  const pre = await FinancialLedgerService.recordPayoutCompleted({ payoutId: r1.id });
  await processPayoutStatusChange(r1.id, 'processing', { actorUserId: FIN });
  const midTxs = (await txs(r1.id)).map((t: any) => t.type);
  const midEvs = (await evs(r1.id)).map((e: any) => e.event_type);
  const preB = await FinancialLedgerService.recordPayoutCompleted({ payoutId: r1.id });
  const preF = await FinancialLedgerService.recordPayoutFailed({ payoutId: r1.id });
  await processPayoutStatusChange(r1.id, 'completed', { transactionRef: 'BANK-E8B-1', actorUserId: FIN });
  await drain();
  const doneTxs = await txs(r1.id);
  const entC = await q(`select a.code, e.direction from ledger_entries e join ledger_accounts a on a.id=e.account_id join ledger_transactions t on t.id=e.transaction_id where t.payout_id=$1 and t.type='PAYOUT_COMPLETED' order by e.line_number`, [r1.id]);
  report('L4 a CONCLUSÃO só é lançada com o saque concluído: com o saque pendente/em processamento o lançamento direto é recusado (PAYOUT_STATE_MISMATCH) e nenhum evento de conclusão existe; ao concluir (mesma transação do estado) nasce PAYOUT_COMPLETED: D SELLER_PAYOUT_CLEARING / C PAYMENT_CLEARING', (pre as any).reason === 'PAYOUT_STATE_MISMATCH' && (preB as any).reason === 'PAYOUT_STATE_MISMATCH' && (preF as any).reason === 'PAYOUT_STATE_MISMATCH' && midTxs.join() === 'PAYOUT_REQUESTED' && midEvs.join() === 'PAYOUT_REQUESTED' && doneTxs.map((t: any) => t.type).sort().join() === 'PAYOUT_COMPLETED,PAYOUT_REQUESTED' && entC.map((e: any) => `${e.direction[0]} ${e.code}`).join('|') === 'D SELLER_PAYOUT_CLEARING|C PAYMENT_CLEARING', { pre, preB, midTxs, midEvs, doneTxs });
  const failAfterDone = await err(() => processPayoutStatusChange(r1.id, 'failed', { actorUserId: FIN }));
  const stateFailed = await FinancialLedgerService.recordPayoutFailed({ payoutId: r1.id });
  report('L4b saque concluído nunca recebe lançamento de falha (transição recusada; lançamento direto = PAYOUT_STATE_MISMATCH); conclusão e falha são exclusivas', failAfterDone?.code === 'PAYOUT_INVALID_TRANSITION' && (stateFailed as any).reason === 'PAYOUT_STATE_MISMATCH' && (await txs(r1.id)).length === 2, { stateFailed });

  // ---------------------------------------------------------------- L5 falha: reverte a solicitação
  const s2 = await mkSeller('500.00'); const rf = await req(s2, 200); await processPayoutStatusChange(rf.id, 'processing', { actorUserId: FIN });
  await processPayoutStatusChange(rf.id, 'failed', { actorUserId: FIN }); await drain();
  const ftx = (await txs(rf.id)).map((t: any) => t.type).sort().join();
  report('L5 falha: PAYOUT_FAILED reverte a solicitação (D SELLER_PAYOUT_CLEARING / C SELLER_PAYABLE): SELLER_PAYOUT_CLEARING e SELLER_PAYABLE do vendedor voltam a zero; a carteira devolveu os 200 (500)', ftx === 'PAYOUT_FAILED,PAYOUT_REQUESTED' && (await net('SELLER_PAYOUT_CLEARING', s2.sellerId)) === 0 && (await net('SELLER_PAYABLE', s2.sellerId)) === 0 && (await bal(s2)) === 500, { ftx, c: await net('SELLER_PAYOUT_CLEARING', s2.sellerId), p: await net('SELLER_PAYABLE', s2.sellerId) });
  const failedPar = await Promise.all(Array.from({ length: 4 }, () => processPayoutStatusChange(rf.id, 'failed', { actorUserId: FIN })));
  await drain();
  report('L5b "failed" repetido/paralelo: continua UM lançamento de falha (e uma devolução)', (await txs(rf.id)).filter((t: any) => t.type === 'PAYOUT_FAILED').length === 1 && (await bal(s2)) === 500 && failedPar.every((r: any) => r.success === true), { n: (await txs(rf.id)).length });

  // ---------------------------------------------------------------- L6 corrida completed × failed
  let ok6 = 0; const anomalies: any[] = [];
  for (let i = 0; i < 6; i++) {
    const s = await mkSeller('300.00'); const p = await req(s, 100); await processPayoutStatusChange(p.id, 'processing', { actorUserId: FIN });
    await Promise.all([processPayoutStatusChange(p.id, 'completed', { transactionRef: 'RACE-L6', actorUserId: FIN }).catch(() => 0), processPayoutStatusChange(p.id, 'failed', { actorUserId: ADMIN }).catch(() => 0)]);
    await drain();
    const st = (await q('select status from seller_payouts where id=$1', [p.id]))[0].status; const types = (await txs(p.id)).map((t: any) => t.type).sort().join();
    const good = st === 'completed' ? types === 'PAYOUT_COMPLETED,PAYOUT_REQUESTED' && (await net('SELLER_PAYOUT_CLEARING', s.sellerId)) === 0 && (await bal(s)) === 200 : types === 'PAYOUT_FAILED,PAYOUT_REQUESTED' && (await net('SELLER_PAYOUT_CLEARING', s.sellerId)) === 0 && (await bal(s)) === 300;
    good ? ok6++ : anomalies.push({ st, types });
  }
  report('L6 corrida completed × failed (6 saques): o lançamento SEMPRE acompanha o estado que venceu (concluído = conclusão; falho = falha), nunca os dois; compensação do vendedor zerada e carteira coerente', ok6 === 6, { ok6, anomalies });

  // ---------------------------------------------------------------- L7 falha APÓS o commit e recuperação; ordem fora de sequência
  const origPost = (FinancialLedgerService as any).postTransaction;
  const ledgerDown = () => { (FinancialLedgerService as any).postTransaction = async () => { throw pgErr('57P01'); }; };
  const ledgerUp = () => { (FinancialLedgerService as any).postTransaction = origPost; };
  const s3 = await mkSeller('400.00');
  let r7: any;
  ledgerDown();
  try {
    r7 = await req(s3, 120);                                           // o ledger "cai" depois do commit: a reserva real fica
    await processPayoutStatusChange(r7.id, 'processing', { actorUserId: FIN });
    await processPayoutStatusChange(r7.id, 'completed', { transactionRef: 'L7-REF', actorUserId: FIN });
    await drain();
  } finally { ledgerUp(); }
  const before = { txs: (await txs(r7.id)).length, evs: (await evs(r7.id)).map((e: any) => `${e.event_type}:${e.status}`) };
  // FORA DE ORDEM: só o evento de CONCLUSÃO é processado primeiro => o pré-requisito (solicitação) é lançado antes dele
  const compEv = (await evs(r7.id)).find((e: any) => e.event_type === 'PAYOUT_COMPLETED');
  await runLedgerOutboxOnce({ workerId: 'w-e8b-ooo', now: new Date(Date.now() + 3 * 3600_000), eventIds: [compEv.id] });
  const afterOoo = (await q(`select type from ledger_transactions where payout_id=$1 order by created_at, id`, [r7.id])).map((x: any) => x.type).join();
  await drain(3 * 3600_000); await drain(3 * 3600_000);
  const evAfter = (await evs(r7.id)).map((e: any) => `${e.event_type}:${e.status}`).sort().join();
  const reqEv = (await evs(r7.id)).find((e: any) => e.event_type === 'PAYOUT_REQUESTED'); const reqTx = (await txs(r7.id)).find((t: any) => t.type === 'PAYOUT_REQUESTED');
  report('L7 o ledger cai DEPOIS do commit: reserva e conclusão reais ficam (saldo 280, saque concluído), NADA é lançado e os eventos ficam no outbox em nova tentativa; ao voltar, tudo termina DONE com UM lançamento por tipo', (await bal(s3)) === 280 && (await q('select status from seller_payouts where id=$1', [r7.id]))[0].status === 'completed' && before.txs === 0 && before.evs.length === 2 && before.evs.every((e: string) => /RETRYING|PENDING/.test(e)) && evAfter === 'PAYOUT_COMPLETED:DONE,PAYOUT_REQUESTED:DONE' && (await txs(r7.id)).length === 2, { before, afterOoo, evAfter });
  report('L7b ordem fora de sequência: com o evento de CONCLUSÃO processado antes, a SOLICITAÇÃO é lançada primeiro (pré-requisito idempotente) e depois a conclusão; o evento de solicitação, ao chegar, vira replay do MESMO lançamento (sem duplicar)', afterOoo === 'PAYOUT_REQUESTED,PAYOUT_COMPLETED' && reqEv.status === 'DONE' && reqEv.ledger_transaction_id === reqTx.id, { afterOoo, reqEv, reqTx });

  // ---------------------------------------------------------------- L8 snapshot divergente
  const s4 = await mkSeller('300.00');
  let r8: any; ledgerDown(); try { r8 = await req(s4, 90); } finally { ledgerUp(); }
  await pool.query(`update seller_payouts set amount='91.00' where id=$1`, [r8.id]);
  await drain(3 * 3600_000);
  const e8 = (await evs(r8.id))[0];
  report('L8 se o saque mudar depois do enfileiramento, o evento vai a NEEDS_INTERVENTION (SNAPSHOT_DIVERGED) e NADA é lançado', e8.status === 'NEEDS_INTERVENTION' && e8.last_error_code === 'SNAPSHOT_DIVERGED' && (await txs(r8.id)).length === 0, e8);

  // ---------------------------------------------------------------- L9 cutoff: sem backfill de saques anteriores
  const s5 = await mkSeller('300.00'); const oldId = uid('payout');
  await pool.query(`insert into seller_payouts (id, seller_id, amount, currency, method, status, created_at, idempotency_key) values ($1,$2,'50.00','XOF','wallet','completed','2025-06-01 10:00:00',$3)`, [oldId, s5.sellerId, uid('ik')]);
  const rLegacy = await FinancialLedgerService.recordPayoutRequested({ payoutId: oldId });
  const rLegacyC = await FinancialLedgerService.recordPayoutCompleted({ payoutId: oldId });
  const rec9: any = await runLedgerReconciliation({ triggeredBy: 'e8b', now: new Date(Date.now() + 3 * 3600_000) });
  const dry9: any = await repairMissingEvents({ actorUserId: ADMIN, dryRun: true });
  report('L9 saque criado ANTES do cutoff: sem lançamento (LEGACY_ORDER), sem achado na reconciliação e fora do reparo — nenhum backfill automático', (rLegacy as any).reason === 'LEGACY_ORDER' && (rLegacyC as any).reason === 'LEGACY_ORDER' && (await txs(oldId)).length === 0 && !(await q(`select 1 from ledger_reconciliation_findings where fingerprint like $1`, [`%:payout:${oldId}`])).length && !dry9.candidates.some((c: any) => c.payoutId === oldId), { rLegacy, rec9: rec9.status });

  // ---------------------------------------------------------------- L10 reconciliação + reparo manual de eventos de saque ausentes
  const s6 = await mkSeller('300.00'); const lostId = uid('payout');
  await pool.query(`insert into seller_payouts (id, seller_id, amount, currency, method, status, created_at, processed_at, transaction_ref, idempotency_key) values ($1,$2,'70.00','XOF','wallet','completed', now(), now(), 'REF-LOST', $3)`, [lostId, s6.sellerId, uid('ik')]);
  const recA: any = await runLedgerReconciliation({ triggeredBy: 'e8b', now: new Date(Date.now() + 3 * 3600_000) });
  const finds = await q(`select finding_type, severity, order_id from ledger_reconciliation_findings where fingerprint like $1 and status='OPEN' order by finding_type`, [`%:payout:${lostId}`]);
  const dry: any = await repairMissingEvents({ actorUserId: ADMIN, dryRun: true });
  const cands = dry.candidates.filter((c: any) => c.payoutId === lostId).map((c: any) => c.eventType).sort().join();
  const noRole = await err(() => repairMissingEvents({ actorUserId: FIN, dryRun: false }));
  const applied: any = await repairMissingEvents({ actorUserId: ADMIN, dryRun: false });
  await drain();
  const recB: any = await runLedgerReconciliation({ triggeredBy: 'e8b', now: new Date(Date.now() + 3 * 3600_000) });
  const still = await q(`select finding_type from ledger_reconciliation_findings where fingerprint like $1 and status='OPEN'`, [`%:payout:${lostId}`]);
  report('L10 reconciliação acha o saque concluído SEM lançamento nem evento (solicitação e conclusão, CRÍTICO, sem order_id); reparo manual: simulação lista os 2 eventos, só GLOBAL_ADMIN aplica, o worker lança e a divergência é RESOLVIDA; o saque concluído mantém a hora do fato', finds.length === 2 && finds.every((f: any) => f.severity === 'CRITICAL' && f.order_id === null) && cands === 'PAYOUT_COMPLETED,PAYOUT_REQUESTED' && noRole?.code === 'FORBIDDEN' && applied.enqueued >= 2 && (await txs(lostId)).map((t: any) => t.type).sort().join() === 'PAYOUT_COMPLETED,PAYOUT_REQUESTED' && still.length === 0 && recB.status !== 'DISABLED', { finds, cands, noRole: noRole?.code, applied: applied.enqueued, still });

  // ---------------------------------------------------------------- L11 dinheiro real, imutabilidade, balanceamento e conciliação
  const mBefore = await money();
  await drain(); await runLedgerReconciliation({ triggeredBy: 'e8b-2', now: new Date(Date.now() + 3 * 3600_000) }); await repairMissingEvents({ actorUserId: ADMIN, dryRun: false }); await drain();
  const mAfter = await money();
  report('L11 os lançamentos/worker/reconciliação/reparo NÃO movem dinheiro real: carteiras, transações da carteira e saques com hash idêntico', JSON.stringify(mBefore) === JSON.stringify(mAfter), { mBefore, mAfter });
  const upd = await err(() => pool.query(`update ledger_outbox_events set payout_id='outro' where payout_id is not null and id=(select id from ledger_outbox_events where payout_id is not null limit 1)`));
  const noSubject = await err(() => pool.query(`insert into ledger_outbox_events (id, event_type, idempotency_key, order_id, payout_id, snapshot_json, snapshot_hash, occurred_at) values ('lob_nosubj','PAYOUT_REQUESTED','k-nosubj',null,null,'{}',repeat('a',64),now())`));
  const badType = await err(() => pool.query(`insert into ledger_outbox_events (id, event_type, idempotency_key, order_id, payout_id, snapshot_json, snapshot_hash, occurred_at) values ('lob_badtype','PAYOUT_QUALQUER','k-badtype',null,'${r1.id}','{}',repeat('a',64),now())`));
  report('L11b banco: o assunto do evento (payout_id) é imutável; evento sem pedido E sem saque é recusado (CHECK); tipo fora do catálogo continua recusado', /imutáveis/.test(String(upd?.message)) && /subject_check/.test(String(noSubject?.message)) && /type_check/.test(String(badType?.message)), { upd: upd?.message, noSubject: noSubject?.message, badType: badType?.message });
  const unb = (await q(`select count(*)::int n from (select t.id from ledger_transactions t join ledger_entries e on e.transaction_id=t.id where t.status='POSTED' group by t.id having sum(case when e.direction='DEBIT' then e.amount else -e.amount end) <> 0) x`))[0].n;
  const sellersAll = await q(`select distinct seller_id from ledger_transactions where type like 'PAYOUT_%'`);
  const idents: any[] = [];
  for (const { seller_id } of sellersAll) {
    const pend = Number((await q(`select coalesce(sum(amount),0)::numeric s from seller_payouts where seller_id=$1 and status in ('pending','processing') and created_at >= '2026-01-01'`, [seller_id]))[0].s);
    const notFailed = Number((await q(`select coalesce(sum(amount),0)::numeric s from seller_payouts where seller_id=$1 and status <> 'failed' and created_at >= '2026-01-01'`, [seller_id]))[0].s);
    idents.push({ seller_id, clearing: await net('SELLER_PAYOUT_CLEARING', seller_id), pend, payableDebit: -(await net('SELLER_PAYABLE', seller_id)), notFailed });
  }
  const paymentClearingCredit = await net('PAYMENT_CLEARING', null); // crédito − débito (aqui só há saídas de caixa)
  const completedSum = Number((await q(`select coalesce(sum(amount),0)::numeric s from seller_payouts where status='completed' and created_at >= '2026-01-01' and id in (select payout_id from ledger_transactions where type='PAYOUT_COMPLETED')`))[0].s);
  report('L12 conciliação: todos os lançamentos POSTED balanceados; por vendedor SELLER_PAYOUT_CLEARING = Σ saques pendentes/em processamento e SELLER_PAYABLE debitado = Σ saques não falhados; PAYMENT_CLEARING creditado = Σ saques concluídos lançados', unb === 0 && idents.length >= 5 && idents.every((i: any) => Math.abs(i.clearing - i.pend) < 0.005 && Math.abs(i.payableDebit - i.notFailed) < 0.005) && Math.abs(paymentClearingCredit - completedSum) < 0.005, { unb, idents, paymentClearingCredit, completedSum });

  console.log(`\n${passed}/${total} testes passaram.`);
  await pool.end(); process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('FALHA FATAL:', e); process.exit(1); });
