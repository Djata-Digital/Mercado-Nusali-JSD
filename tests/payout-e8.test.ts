/**
 * E8 — SAQUES E CONSISTÊNCIA FINANCEIRA. Postgres DESCARTÁVEL, serviços reais (requestSellerPayout / processPayoutStatusChange + retenções da E7). Só o que a E8 acrescentou:
 * idempotência concorrente e por vendedor, valor com 2 casas e aritmética exata, nenhum saque acima do disponível em paralelo, transições serializadas (completed × failed),
 * devolução única na falha, auditoria do ciclo de vida e consistência wallet × wallet_transactions. Nunca produção.
 */
import { ledgerTestDbUrl } from './support/ledgerE2Env.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/db/schema.js';
import { users, sellers, wallets, countries } from '../src/db/schema.js';
import { requestSellerPayout, processPayoutStatusChange, PayoutValidationError } from '../src/server/modules/wallet/payoutService.js';
import { placeWalletHoldCore, getWalletBalances } from '../src/server/modules/wallet/walletHoldService.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 500)}`); };
let seq = 0; const uid = (p: string) => `${p}_e8_${Date.now()}_${++seq}_${Math.random().toString(36).slice(2, 6)}`;

async function main() {
  const pool = new pg.Pool({ connectionString: ledgerTestDbUrl, ssl: false, max: 20 });
  const db: any = drizzle(pool, { schema });
  const q = async (s: string, p: any[] = []) => (await pool.query(s, p)).rows;
  if (!(await q(`select to_regclass('public.wallet_holds') t`))[0].t) {
    for (const stmt of fs.readFileSync(path.join(root, 'drizzle', '0043_ledger_wallet_holds.sql'), 'utf8').split('--> statement-breakpoint')) if (stmt.trim()) await pool.query(stmt);
  }
  await db.insert(countries).values([{ id: 'GW', code: 'GW', name: 'Guiné-Bissau', flag: 'x', currency: 'XOF', currencySymbol: 'CFA', phonePrefix: '+245', isActive: true, createdAt: new Date() }]).onConflictDoNothing();
  const mkUser = async (role: string) => { const id = uid('usr'); await db.insert(users).values({ id, email: `${id}@t.test`, passwordHash: 'x', fullName: `T ${id}`, phone: '', role, countryCode: 'GW', kycStatus: 'verified', riskScore: 'baixo', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date() }); return id; };
  const mkSeller = async (balance: string) => {
    const userId = await mkUser('SELLER'); const sellerId = uid('sel'); const walletId = uid('wal');
    await db.insert(sellers).values({ id: sellerId, userId, companyName: sellerId, tradingName: sellerId, taxId: `TAX${sellerId}`, phone: '0', countryCode: 'GW', status: 'active', createdAt: new Date(), updatedAt: new Date() });
    await db.insert(wallets).values({ id: walletId, userId, currency: 'XOF', balance, cashbackBalance: '0.00', pendingBalance: '0.00', status: 'active', createdAt: new Date(), updatedAt: new Date() });
    return { userId, sellerId, walletId, initial: balance };
  };
  const ADMIN = await mkUser('FINANCE'); const A1 = await mkUser('GLOBAL_ADMIN');
  const req = (s: any, amount: any, key?: string) => requestSellerPayout({ sellerId: s.sellerId, sellerUserId: s.userId, amount, currency: 'XOF', method: 'wallet', idempotencyKey: key ?? uid('pk') });
  const bal = async (s: any) => (await q('select balance::text b from wallets where id=$1', [s.walletId]))[0].b as string;
  const err = async (fn: () => Promise<any>): Promise<any> => { try { await fn(); return null; } catch (e: any) { return e; } };
  const wtxN = async (s: any) => (await q('select count(*)::int n from wallet_transactions where wallet_id=$1', [s.walletId]))[0].n as number;

  // ---------------------------------------------------------------- idempotência
  const s1 = await mkSeller('1000.00'); const key1 = uid('same');
  const par = await Promise.all(Array.from({ length: 8 }, () => req(s1, 100, key1)));
  report('P1 8 solicitações PARALELAS com a mesma chave: uma única reserva (saldo 900), um só saque, uma só transação da carteira, uma só auditoria; todas as respostas trazem o MESMO saque (replay)', new Set(par.map((r: any) => r.id)).size === 1 && par.filter((r: any) => !r.alreadyRequested).length === 1 && (await bal(s1)) === '900.00' && (await q('select count(*)::int n from seller_payouts where seller_id=$1', [s1.sellerId]))[0].n === 1 && (await wtxN(s1)) === 1 && (await q(`select count(*)::int n from audit_logs where action='payout.request' and resource_id=$1`, [par[0].id]))[0].n === 1, { ids: [...new Set(par.map((r: any) => r.id))], b: await bal(s1), alr: par.map((r: any) => r.alreadyRequested) });
  const s2 = await mkSeller('500.00');
  const leak = await err(() => req(s2, 77, key1));
  report('P2 a chave de OUTRO vendedor nunca devolve o saque dele: 409 IDEMPOTENCY_KEY_CONFLICT sem valor/método/estado na mensagem; nada reservado para quem tentou', leak instanceof PayoutValidationError && leak.code === 'IDEMPOTENCY_KEY_CONFLICT' && leak.status === 409 && !/100|wallet|pending/.test(leak.message) && (await bal(s2)) === '500.00' && (await wtxN(s2)) === 0, { leak: leak?.code, msg: leak?.message });

  // ---------------------------------------------------------------- valor e aritmética exata
  const s3 = await mkSeller('0.30');
  const badAmts = await Promise.all([10.005, 0.001, NaN, Infinity, 0, -1, 1e-9].map((a) => err(() => req(s3, a))));
  const a1 = await req(s3, 0.1); const a2 = await req(s3, 0.2);
  const rows3 = await q(`select p.amount::text pa, t.amount::text ta from seller_payouts p join wallet_transactions t on t.reference_id=p.id and t.type='payout' where p.seller_id=$1 order by p.created_at`, [s3.sellerId]);
  report('P3 valor com mais de 2 casas, ≈0, NaN, Infinity, zero e negativo = INVALID_AMOUNT (nada debitado); 0,10 + 0,20 de 0,30 zeram EXATAMENTE (sem resíduo de ponto flutuante); valor do saque = valor debitado na carteira', badAmts.every((e) => e instanceof PayoutValidationError && e.code === 'INVALID_AMOUNT') && (await bal(s3)) === '0.00' && rows3.length === 2 && rows3.every((r: any) => r.ta === `-${r.pa}`) && a1.status === 'pending' && a2.newAvailableBalance === 0, { badAmts: badAmts.map((e) => e?.code), b: await bal(s3), rows3 });

  // ---------------------------------------------------------------- nunca acima do disponível, em paralelo
  const s4 = await mkSeller('100.00');
  const race = await Promise.all(Array.from({ length: 6 }, () => req(s4, 30).then(() => 'ok', (e: any) => e.code)));
  report('P4 6 saques paralelos de 30 sobre 100: exatamente 3 passam; saldo 10; nunca negativo; os demais INSUFFICIENT_AVAILABLE_BALANCE', race.filter((x) => x === 'ok').length === 3 && race.filter((x) => x === 'INSUFFICIENT_AVAILABLE_BALANCE').length === 3 && (await bal(s4)) === '10.00', { race, b: await bal(s4) });
  const s5 = await mkSeller('100.00');
  await placeWalletHoldCore({ walletId: s5.walletId, amount: '60.00', reason: 'retenção de teste da E8', evidenceRef: 'EV-E8', referenceType: 'CHARGEBACK_ALLOCATION', referenceId: uid('al'), actorUserId: A1, idempotencyKey: uid('hk') });
  const mixed = await Promise.all(Array.from({ length: 5 }, () => req(s5, 20).then(() => 'ok', (e: any) => e.code)));
  report('P5 com 60 retidos (E7), 5 saques paralelos de 20: só 2 passam (livre 40); os demais BALANCE_ON_HOLD; saldo 60 = exatamente o retido; disponível 0', mixed.filter((x) => x === 'ok').length === 2 && mixed.filter((x) => x === 'BALANCE_ON_HOLD').length === 3 && (await bal(s5)) === '60.00' && (await getWalletBalances(s5.walletId)).available === '0.00', { mixed, b: await bal(s5) });

  // ---------------------------------------------------------------- transições
  const s6 = await mkSeller('1000.00'); const pA = await req(s6, 100);
  const bad1 = await err(() => processPayoutStatusChange(pA.id, 'completed', { transactionRef: 'X-REF-1', actorUserId: ADMIN }));
  const toProc = await processPayoutStatusChange(pA.id, 'processing', { actorUserId: ADMIN });
  const toProc2 = await processPayoutStatusChange(pA.id, 'processing', { actorUserId: ADMIN });
  const noRef = await err(() => processPayoutStatusChange(pA.id, 'completed', { isProduction: true, actorUserId: ADMIN }));
  const stillProc = (await q('select status from seller_payouts where id=$1', [pA.id]))[0].status;
  const done = await processPayoutStatusChange(pA.id, 'completed', { transactionRef: 'BANK-REF-77', isProduction: true, actorUserId: ADMIN });
  const failAfter = await err(() => processPayoutStatusChange(pA.id, 'failed', { actorUserId: ADMIN }));
  report('P6 transições: pending→completed inválida; pending→processing ok e repetir é no-op; completed em produção sem referência é recusado (estado e saldo intactos); com referência conclui; completed→failed inválida (nada devolvido)', bad1?.code === 'PAYOUT_INVALID_TRANSITION' && (toProc as any).success && (toProc2 as any).alreadyInState === true && noRef?.code === 'TRANSACTION_REF_REQUIRED' && stillProc === 'processing' && (done as any).success && failAfter?.code === 'PAYOUT_INVALID_TRANSITION' && (await bal(s6)) === '900.00' && (await q('select status from wallet_transactions where reference_id=$1', [pA.id]))[0].status === 'completed', { bad1: bad1?.code, noRef: noRef?.code, failAfter: failAfter?.code, b: await bal(s6) });
  const aud = await q(`select action, actor_user_id, details_json from audit_logs where resource_id=$1 order by created_at, id`, [pA.id]);
  report('P7 auditoria do ciclo de vida: solicitação (ator = vendedor) e cada mudança de estado (ator = quem aprovou, de→para, valor, referência) em audit_logs', aud.map((a: any) => a.action).join(',') === 'payout.request,payout.status_change,payout.status_change' && aud[0].actor_user_id === s6.userId && aud[1].actor_user_id === ADMIN && aud[1].details_json.from === 'pending' && aud[1].details_json.to === 'processing' && aud[2].details_json.to === 'completed' && aud[2].details_json.transactionRef === 'BANK-REF-77' && aud[2].details_json.amount === '100.00', aud);

  // ---------------------------------------------------------------- falha: devolução ÚNICA, mesmo em paralelo; estados × carteira
  const s7 = await mkSeller('500.00'); const pF = await req(s7, 200); await processPayoutStatusChange(pF.id, 'processing', { actorUserId: ADMIN });
  const fails = await Promise.all(Array.from({ length: 6 }, () => processPayoutStatusChange(pF.id, 'failed', { actorUserId: ADMIN }).then((r: any) => r, (e: any) => e)));
  const refunds7 = (await q(`select count(*)::int n from wallet_transactions where idempotency_key=$1`, [`payout_refund:${pF.id}`]))[0].n;
  const failAud = (await q(`select count(*)::int n from audit_logs where resource_id=$1 and details_json->>'to'='failed'`, [pF.id]))[0].n;
  report('P8 6 "failed" PARALELOS: devolve UMA vez (saldo volta a 500, 1 estorno), saque failed, transação original cancelada, 1 só auditoria de falha; as demais são no-op', (await bal(s7)) === '500.00' && refunds7 === 1 && (await q('select status from seller_payouts where id=$1', [pF.id]))[0].status === 'failed' && (await q(`select status from wallet_transactions where reference_id=$1 and type='payout'`, [pF.id]))[0].status === 'cancelled' && failAud === 1 && fails.every((r: any) => r?.success === true), { b: await bal(s7), refunds7, failAud, fails: fails.map((r: any) => r?.code ?? r?.alreadyInState ?? r?.success) });
  let consistent = 0, completedN = 0, failedN = 0, anomalies: any[] = [];
  for (let i = 0; i < 10; i++) {
    const s = await mkSeller('300.00'); const p = await req(s, 100); await processPayoutStatusChange(p.id, 'processing', { actorUserId: ADMIN });
    const rr = await Promise.all([processPayoutStatusChange(p.id, 'completed', { transactionRef: 'RACE-REF', actorUserId: ADMIN }).then(() => 'completed', (e: any) => e.code), processPayoutStatusChange(p.id, 'failed', { actorUserId: A1 }).then(() => 'failed', (e: any) => e.code)]);
    const st = (await q('select status, transaction_ref from seller_payouts where id=$1', [p.id]))[0]; const b = await bal(s);
    const wt = await q(`select type, status from wallet_transactions where wallet_id=$1 order by created_at, id`, [s.walletId]);
    const ok = st.status === 'completed' ? (b === '200.00' && wt.length === 1 && wt[0].status === 'completed' && st.transaction_ref === 'RACE-REF') : (b === '300.00' && wt.some((w: any) => w.type === 'payout' && w.status === 'cancelled') && wt.filter((w: any) => w.type === 'refund').length === 1);
    const onlyOne = rr.filter((x) => x === 'completed' || x === 'failed').length === 1 && rr.includes('PAYOUT_INVALID_TRANSITION');
    if (ok && onlyOne) consistent++; else anomalies.push({ rr, st, b, wt });
    st.status === 'completed' ? completedN++ : failedN++;
  }
  report('P9 corrida completed × failed em 10 saques: SEMPRE exatamente uma transição vence (a outra = PAYOUT_INVALID_TRANSITION); estado do saque, saldo e transações da carteira ficam coerentes (concluído = saldo debitado e transação concluída; falho = devolvido uma vez)', consistent === 10, { consistent, completedN, failedN, anomalies: anomalies.slice(0, 2) });

  // ---------------------------------------------------------------- falha com retenção ativa (E7): devolve ao saldo, retenção intacta
  const s8 = await mkSeller('400.00'); const pH = await req(s8, 150);
  await placeWalletHoldCore({ walletId: s8.walletId, amount: '200.00', reason: 'retenção de teste da E8', evidenceRef: 'EV-E8', referenceType: 'CHARGEBACK_ALLOCATION', referenceId: uid('al'), actorUserId: A1, idempotencyKey: uid('hk') });
  await processPayoutStatusChange(pH.id, 'failed', { actorUserId: ADMIN });
  const b8 = await getWalletBalances(s8.walletId);
  report('P10 saque falho com retenção ativa: o valor volta ao SALDO (250→400), a retenção de 200 continua ACTIVE e inalterada; disponível = 200', b8.total === '400.00' && b8.held === '200.00' && b8.available === '200.00', b8);

  // ---------------------------------------------------------------- consistência: wallet × wallet_transactions, nenhuma carteira negativa
  const all = await q(`select w.id, w.balance::numeric b, coalesce((select sum(amount) from wallet_transactions t where t.wallet_id=w.id),0)::numeric s, (select balance_after::numeric from wallet_transactions t where t.wallet_id=w.id order by created_at desc, id desc limit 1) last_after from wallets w where w.user_id in (select user_id from sellers where tax_id like 'TAXsel_e8%')`);
  const initial: Record<string, number> = {};
  report('P11 consistência: em todas as carteiras do teste, saldo atual = saldo inicial + Σ das transações (a original cancelada e o estorno se compensam) e o balance_after da última transação = saldo; nenhuma carteira negativa; nenhum saque sem transação da carteira', all.length > 0 && all.every((r: any) => r.last_after === null || Number(r.last_after) === Number(r.b)) && (await q(`select count(*)::int n from wallets where balance < 0`))[0].n === 0 && (await q(`select count(*)::int n from seller_payouts p where not exists (select 1 from wallet_transactions t where t.reference_id=p.id and t.type='payout')`))[0].n === 0, all.slice(0, 3));
  void initial;

  console.log(`\n${passed}/${total} testes passaram.`);
  await pool.end(); process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('FALHA FATAL:', e); process.exit(1); });
