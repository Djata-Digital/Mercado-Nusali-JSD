/**
 * E7 — RETENÇÕES DE SALDO (wallet_holds). Postgres DESCARTÁVEL, serviços reais (walletHoldService, payoutService, snapshot do vendedor). Prova:
 * disponível = total − retido; saque NUNCA usa valor retido (e retenção parcial não bloqueia o resto); retenção só do saldo livre, sem negativo, sem duplicidade ativa,
 * idempotente; concorrência (retenção × retenção, retenção × saque, idempotência paralela); liberação auditada e idempotente; imutabilidade/CHECKs/trigger no banco;
 * rastreabilidade opcional com o ledger sombra sem tratá-lo como fonte; dinheiro real intacto (a retenção não move nada); permissões provisórias (só GLOBAL_ADMIN).
 */
import { ledgerTestDbUrl } from './support/ledgerE2Env.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import { users, sellers, wallets, countries, sellerPayouts } from '../src/db/schema.js';
import { getDb } from '../src/db/index.js';
import { requestSellerPayout, processPayoutStatusChange, PayoutValidationError } from '../src/server/modules/wallet/payoutService.js';
import { placeWalletHold, releaseWalletHold, getWalletBalances, listWalletHolds, WalletHoldError } from '../src/server/modules/wallet/walletHoldService.js';
import { computeSellerWalletSnapshot } from '../src/server/modules/seller/sellerFinancialsService.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)).slice(0, 500)}`); };
let seq = 0; const uid = (p: string) => `${p}_e7_${Date.now()}_${++seq}_${Math.random().toString(36).slice(2, 6)}`;

async function main() {
  const pool = new pg.Pool({ connectionString: ledgerTestDbUrl, ssl: false, max: 20 });
  const db: any = drizzle(pool, { schema });
  const q = async (sqlText: string, p: any[] = []) => (await pool.query(sqlText, p)).rows;
  if (!(await q(`select to_regclass('public.wallet_holds') t`))[0].t) {
    for (const stmt of fs.readFileSync(path.join(root, 'drizzle', '0043_ledger_wallet_holds.sql'), 'utf8').split('--> statement-breakpoint')) if (stmt.trim()) await pool.query(stmt);
  }
  await db.insert(countries).values([{ id: 'GW', code: 'GW', name: 'Guiné-Bissau', flag: 'x', currency: 'XOF', currencySymbol: 'CFA', phonePrefix: '+245', isActive: true, createdAt: new Date() }]).onConflictDoNothing();

  const mkUser = async (role: string) => { const id = uid('usr'); await db.insert(users).values({ id, email: `${id}@t.test`, passwordHash: 'x', fullName: `T ${id}`, phone: '', role, countryCode: 'GW', kycStatus: 'verified', riskScore: 'baixo', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date() }); return id; };
  const mkSeller = async (balance: string, currency = 'XOF') => {
    const userId = await mkUser('SELLER'); const sellerId = uid('sel'); const walletId = uid('wal');
    await db.insert(sellers).values({ id: sellerId, userId, companyName: sellerId, tradingName: sellerId, taxId: `TAX${sellerId}`, phone: '0', countryCode: 'GW', status: 'active', createdAt: new Date(), updatedAt: new Date() });
    await db.insert(wallets).values({ id: walletId, userId, currency, balance, cashbackBalance: '0.00', pendingBalance: '0.00', status: 'active', createdAt: new Date(), updatedAt: new Date() });
    return { userId, sellerId, walletId };
  };
  const A1 = await mkUser('GLOBAL_ADMIN'), A2 = await mkUser('GLOBAL_ADMIN'), FIN = await mkUser('FINANCE'), SUP = await mkUser('SUPPORT');
  const hold = (s: any, amount: string | number, ref: string, key?: string, actor = A1, extra: any = {}) => placeWalletHold({ walletId: s.walletId, amount, reason: 'Chargeback perdido em análise (teste)', referenceType: 'CHARGEBACK_ALLOCATION', referenceId: ref, actorUserId: actor, idempotencyKey: key ?? uid('hk'), ...extra });
  const payout = (s: any, amount: number, key?: string) => requestSellerPayout({ sellerId: s.sellerId, sellerUserId: s.userId, amount, currency: 'XOF', method: 'wallet', idempotencyKey: key ?? uid('pk') });
  const err = async (fn: () => Promise<any>): Promise<any> => { try { await fn(); return null; } catch (e: any) { return e; } };
  const bal = async (s: any) => (await q(`select balance::text b from wallets where id=$1`, [s.walletId]))[0].b;
  const moneyHash = async () => (await q(`select (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from wallets x) w, (select md5(coalesce(string_agg(to_jsonb(x)::text,'|' order by id),'')) from wallet_transactions x) wt, (select count(*)::int from ledger_transactions) lt, (select count(*)::int from seller_payouts) po`))[0];

  // ---------------------------------------------------------------- H1 saldos: total, retido, disponível
  const s1 = await mkSeller('1000.00');
  const m0 = await moneyHash();
  const h1 = await hold(s1, '300.00', 'ALLOC-1');
  const h1b = await hold(s1, 200, 'ALLOC-2');
  const b1 = await getWalletBalances(s1.walletId);
  report('H1 saldo total 1000 / retido 500 / disponível 500 (soma de várias retenções; total intacto)', b1.total === '1000.00' && b1.held === '500.00' && b1.available === '500.00' && h1b.balances.available === '500.00', b1);
  const mHold = await moneyHash();
  report('H2 criar retenção NÃO move dinheiro: wallets, wallet_transactions, ledger e saques idênticos (a retenção só separa o saldo)', JSON.stringify(m0) === JSON.stringify(mHold), { m0, mHold });

  // ---------------------------------------------------------------- saque
  const e3 = await err(() => payout(s1, 600));
  report('H3 saque acima do DISPONÍVEL mas dentro do total é recusado (BALANCE_ON_HOLD) e nada é debitado nem criado', e3 instanceof PayoutValidationError && e3.code === 'BALANCE_ON_HOLD' && (await bal(s1)) === '1000.00' && (await q(`select count(*)::int n from seller_payouts where seller_id=$1`, [s1.sellerId]))[0].n === 0, { code: e3?.code, b: await bal(s1) });
  const p1 = await payout(s1, 500);
  report('H4 retenção parcial NÃO bloqueia tudo: o vendedor saca os 500 livres; saldo 500 (todo retido), disponível 0', p1.status === 'pending' && (await bal(s1)) === '500.00' && (await getWalletBalances(s1.walletId)).available === '0.00' && p1.newAvailableBalance === 0, { p1, b: await bal(s1) });
  const e5 = await err(() => payout(s1, 0.01));
  report('H5 com tudo retido, nem 0,01 sai (BALANCE_ON_HOLD); acima do total = INSUFFICIENT_AVAILABLE_BALANCE', e5?.code === 'BALANCE_ON_HOLD' && (await err(() => payout(s1, 5000)))?.code === 'INSUFFICIENT_AVAILABLE_BALANCE', e5?.code);
  const pReplay = await payout(s1, 500, (await q(`select idempotency_key k from seller_payouts where id=$1`, [p1.id]))[0].k);
  report('H6 idempotência do saque preservada: a mesma chave devolve o saque existente sem debitar de novo', pReplay.alreadyRequested === true && (await bal(s1)) === '500.00');

  // aprovação de saque não usa saldo retido e não depende de retenção (o valor já saiu do saldo no pedido)
  await processPayoutStatusChange(p1.id, 'processing'); await processPayoutStatusChange(p1.id, 'completed', { transactionRef: 'E7-REF-1' });
  report('H7 aprovar/concluir um saque já solicitado não toca o saldo nem as retenções (500 total, 500 retido, nada novo debitado)', (await bal(s1)) === '500.00' && (await getWalletBalances(s1.walletId)).held === '500.00' && (await q(`select status from seller_payouts where id=$1`, [p1.id]))[0].status === 'completed');

  // ---------------------------------------------------------------- criação: só o saldo livre, sem negativo, sem duplicidade
  const s2 = await mkSeller('100.00');
  const tooMuch = await err(() => hold(s2, '100.01', 'A'));
  const bad: any[] = [0, '0', -5, '-0.01', 'abc', '', '1.005', NaN, Infinity];
  const badRes = await Promise.all(bad.map((v) => err(() => hold(s2, v, `B-${String(v)}`))));
  report('H8 retenção acima do saldo (INSUFFICIENT_UNHELD_BALANCE), zero, negativa, texto, vazio, 3 casas, NaN e Infinity: todas recusadas e nada criado', tooMuch?.code === 'INSUFFICIENT_UNHELD_BALANCE' && badRes.every((e) => e instanceof WalletHoldError && e.code === 'INVALID_AMOUNT') && (await listWalletHolds({ walletId: s2.walletId })).length === 0, { tooMuch: tooMuch?.code, badRes: badRes.map((e) => e?.code) });
  await hold(s2, '60.00', 'DUP');
  const dup = await err(() => hold(s2, '10.00', 'DUP'));
  const over = await err(() => hold(s2, '40.01', 'OTHER'));
  report('H9 mesma referência ativa = DUPLICATE_ACTIVE_HOLD (outra chave); retenção que passaria do saldo livre (60 retidos + 40,01 > 100) recusada; exatamente o livre (40,00) aceita', dup?.code === 'DUPLICATE_ACTIVE_HOLD' && over?.code === 'INSUFFICIENT_UNHELD_BALANCE' && (await hold(s2, '40.00', 'EXACT')).balances.available === '0.00');
  const sNeg = await mkSeller('-50.00');
  const eNeg = await err(() => hold(sNeg, '1.00', 'DEBT'));
  report('H10 carteira com saldo negativo (dívida de reembolso) não aceita retenção: disponível nunca fica mais negativo por uma retenção', eNeg?.code === 'INSUFFICIENT_UNHELD_BALANCE');

  // ---------------------------------------------------------------- idempotência
  const s3 = await mkSeller('500.00'); const key = uid('idem');
  const r1 = await hold(s3, '100.00', 'IDEM-REF', key); const r2 = await hold(s3, '100.00', 'IDEM-REF', key);
  const conflicts = await Promise.all([err(() => hold(s3, '101.00', 'IDEM-REF', key)), err(() => hold(s3, '100.00', 'IDEM-REF-2', key))]);
  report('H11 idempotência: a mesma chave devolve a MESMA retenção (replay, sem segunda linha); outra carteira/valor/referência com a mesma chave = IDEMPOTENCY_CONFLICT', r1.holdId === r2.holdId && r2.alreadyPlaced === true && (await listWalletHolds({ walletId: s3.walletId })).length === 1 && conflicts.every((e) => e?.code === 'IDEMPOTENCY_CONFLICT'), { conflicts: conflicts.map((e) => e?.code) });
  const par = await Promise.all(Array.from({ length: 8 }, () => hold(s3, '50.00', 'PAR-REF', 'par-key-1')));
  report('H12 8 pedidos PARALELOS com a mesma chave: uma única retenção (as outras são replay)', new Set(par.map((x) => x.holdId)).size === 1 && par.filter((x) => !x.alreadyPlaced).length === 1 && (await listWalletHolds({ walletId: s3.walletId })).length === 2);

  // ---------------------------------------------------------------- concorrência
  const s4 = await mkSeller('100.00');
  const racers = await Promise.all(Array.from({ length: 6 }, (_, i) => err(() => hold(s4, '30.00', `RACE-${i}`))));
  const okN = racers.filter((e) => e === null).length;
  const b4 = await getWalletBalances(s4.walletId);
  report('H13 6 retenções de 30 em paralelo sobre 100: exatamente 3 vencem (retido 90), 3 recusadas; disponível 10, nunca negativo', okN === 3 && b4.held === '90.00' && b4.available === '10.00' && racers.filter((e) => e).every((e) => e.code === 'INSUFFICIENT_UNHELD_BALANCE'), { okN, b4, codes: racers.map((e) => e?.code) });
  const s5 = await mkSeller('100.00');
  const hp = await Promise.all([hold(s5, '60.00', 'RACE-HP').then(() => 'hold', (e) => e.code), payout(s5, 60).then(() => 'payout', (e) => e.code)]);
  const b5 = await getWalletBalances(s5.walletId);
  report('H14 retenção de 60 × saque de 60 sobre 100, em paralelo: só UM dos dois acontece (nunca ambos); disponível nunca negativo', hp.filter((x) => x === 'hold' || x === 'payout').length === 1 && Number(b5.available) >= 0 && Number(b5.available) === (hp.includes('hold') ? 40 : 40), { hp, b5 });
  const s6 = await mkSeller('100.00'); await hold(s6, '70.00', 'RACE2');
  const pp = await Promise.all(Array.from({ length: 5 }, () => payout(s6, 20).then(() => 'ok', (e) => e.code)));
  report('H15 5 saques paralelos de 20 com só 30 livres: exatamente 1 passa; os demais BALANCE_ON_HOLD; saldo final 80, retido 70', pp.filter((x) => x === 'ok').length === 1 && pp.filter((x) => x === 'BALANCE_ON_HOLD').length === 4 && (await bal(s6)) === '80.00', { pp, b: await bal(s6) });

  // ---------------------------------------------------------------- liberação
  const s7 = await mkSeller('400.00'); const hr = await hold(s7, '250.00', 'REL-1');
  const eShort = await err(() => releaseWalletHold({ holdId: hr.holdId, actorUserId: A1, reason: 'curto' }));
  const eNone = await err(() => releaseWalletHold({ holdId: 'nao-existe', actorUserId: A1, reason: 'motivo suficientemente longo' }));
  const rel = await releaseWalletHold({ holdId: hr.holdId, actorUserId: A2, reason: 'Contestação revertida a favor da loja (teste)' });
  const rel2 = await releaseWalletHold({ holdId: hr.holdId, actorUserId: A2, reason: 'Contestação revertida a favor da loja (teste)' });
  const row = (await q(`select status, released_by, released_at, release_reason from wallet_holds where id=$1`, [hr.holdId]))[0];
  report('H16 liberação: motivo curto e retenção inexistente recusados; liberar registra quem/quando/motivo; repetir é replay sem efeito; o valor volta a ser disponível', eShort?.code === 'REASON_REQUIRED' && eNone?.code === 'HOLD_NOT_FOUND' && rel.status === 'RELEASED' && rel.alreadyReleased === false && rel2.alreadyReleased === true && row.released_by === A2 && row.released_at && /revertida/.test(row.release_reason) && (await getWalletBalances(s7.walletId)).available === '400.00', { eShort: eShort?.code, rel2, row });
  const p7 = await payout(s7, 400);
  report('H17 após liberar, o saque do total passa', p7.status === 'pending' && (await bal(s7)) === '0.00');
  const reNew = await hold(await mkSeller('50.00'), '10.00', 'REL-1');
  report('H18 histórico preservado e referência reutilizável: após liberar, nova retenção da MESMA referência é aceita e a antiga continua RELEASED', reNew.status === 'ACTIVE' && (await q(`select count(*)::int n from wallet_holds where reference_id='REL-1' and status='RELEASED'`))[0].n >= 1);

  // ---------------------------------------------------------------- permissões e validações do ator
  const s8 = await mkSeller('300.00');
  const denied = await Promise.all([FIN, SUP, s8.userId, 'inexistente'].map((a) => err(() => hold(s8, '10.00', `PERM-${a}`, undefined, a))));
  const hOk = await hold(s8, '10.00', 'PERM-OK');
  const deniedRel = await Promise.all([FIN, SUP, s8.userId].map((a) => err(() => releaseWalletHold({ holdId: hOk.holdId, actorUserId: a, reason: 'tentativa sem permissão alguma' }))));
  const self = await mkSeller('300.00'); await db.update(users).set({ role: 'GLOBAL_ADMIN' }).where(eq(users.id, self.userId));
  const eSelf = await err(() => hold(self, '10.00', 'SELF', undefined, self.userId));
  report('H19 permissões (provisórias: só GLOBAL_ADMIN): FINANCE, SUPPORT, o próprio vendedor e usuário inexistente não criam nem liberam; ninguém cria retenção na própria carteira; nada foi criado/alterado', denied.every((e) => e?.code === 'FORBIDDEN') && deniedRel.every((e) => e?.code === 'FORBIDDEN') && eSelf?.code === 'FORBIDDEN' && (await listWalletHolds({ walletId: s8.walletId })).length === 1 && (await listWalletHolds({ walletId: s8.walletId, status: 'ACTIVE' })).length === 1, { denied: denied.map((e) => e?.code), deniedRel: deniedRel.map((e) => e?.code), eSelf: eSelf?.code });
  const inactive = await mkUser('GLOBAL_ADMIN'); await db.update(users).set({ isActive: false }).where(eq(users.id, inactive));
  report('H20 administrador desativado não cria retenção', (await err(() => hold(s8, '10.00', 'INACTIVE', undefined, inactive)))?.code === 'FORBIDDEN');
  const eRef = await Promise.all([err(() => hold(s8, '10.00', 'X', undefined, A1, { referenceType: 'minusculo' })), err(() => hold(s8, '10.00', '', undefined, A1)), err(() => hold(s8, '10.00', 'X', undefined, A1, { reason: 'curto' })), err(() => hold(s8, '10.00', 'X', '   ', A1))]);
  report('H21 entradas obrigatórias: tipo de referência em MAIÚSCULAS, referência, motivo ≥ 10 e idempotencyKey são exigidos', eRef.map((e) => e?.code).join(',') === 'REFERENCE_TYPE_INVALID,REFERENCE_REQUIRED,REASON_REQUIRED,IDEMPOTENCY_KEY_REQUIRED', eRef.map((e) => e?.code));

  // ---------------------------------------------------------------- auditoria e rastreabilidade com o ledger sombra
  const aud = await q(`select action, actor_user_id, details_json from audit_logs where resource='wallet_hold' and resource_id=$1 order by created_at`, [hr.holdId]);
  report('H22 auditoria: criação e liberação em audit_logs com o ator autenticado, valor, motivo, referência e saldos', aud.length === 2 && aud[0].action === 'wallet.hold.place' && aud[0].actor_user_id === A1 && aud[1].action === 'wallet.hold.release' && aud[1].actor_user_id === A2 && aud[0].details_json.amount === '250.00' && aud[0].details_json.heldBefore === '0.00' && aud[0].details_json.referenceId === 'REL-1', aud);
  await q(`insert into ledger_transactions (id, type, status, currency, idempotency_key, occurred_at) values ('ltx_e7_ref','PAYMENT_RECEIVED','DRAFT','XOF','e7-ref-key', now())`);
  const anyLt = (await q(`select id from ledger_transactions where id='ltx_e7_ref'`))[0];
  const sL = await mkSeller('200.00');
  const hl = await hold(sL, '20.00', 'LEDGER-REF', undefined, A1, { ledgerTransactionId: anyLt.id });
  report('H23 rastreabilidade: a retenção guarda a referência do lançamento do ledger sombra (só referência; o saldo continua vindo da carteira)', (await q(`select ledger_transaction_id from wallet_holds where id=$1`, [hl.holdId]))[0].ledger_transaction_id === anyLt.id);
  report('H24 referência a lançamento inexistente do ledger = LEDGER_REFERENCE_NOT_FOUND (nada criado)', (await err(() => hold(sL, '5.00', 'LEDGER-BAD', undefined, A1, { ledgerTransactionId: 'ltx_inexistente' })))?.code === 'LEDGER_REFERENCE_NOT_FOUND' && (await listWalletHolds({ walletId: sL.walletId })).length <= 1);

  // ---------------------------------------------------------------- regras no banco (defesa em profundidade)
  const s9 = await mkSeller('100.00'); const hd = await hold(s9, '40.00', 'DB-1');
  const sql1 = async (t: string, p: any[] = []) => { try { await pool.query(t, p); return null; } catch (e: any) { return String(e.message); } };
  const ins = (amount: string, extra = '') => sql1(`insert into wallet_holds (id, wallet_id, currency, amount, status, reason, reference_type, reference_id, created_by, idempotency_key) values ($1,$2,'XOF',${amount},'ACTIVE','motivo direto no banco','DIRECT',$3,$4,$5)`, [uid('wh'), s9.walletId, uid('ref'), A1, uid('ik')]);
  const dbErrs = {
    negative: await ins('-1'), zero: await ins('0'), overBalance: await ins('60.01'), exactFree: await ins('60.00'),
    update: await sql1(`update wallet_holds set amount='1.00' where id=$1`, [hd.holdId]), del: await sql1(`delete from wallet_holds where id=$1`, [hd.holdId]),
    badRelease: await sql1(`update wallet_holds set status='RELEASED' where id=$1`, [hd.holdId]),
    curr: await sql1(`insert into wallet_holds (id, wallet_id, currency, amount, status, reason, reference_type, reference_id, created_by, idempotency_key) values ($1,$2,'BRL','1.00','ACTIVE','x','DIRECT',$3,$4,$5)`, [uid('wh'), s9.walletId, uid('ref'), A1, uid('ik')]),
  };
  await releaseWalletHold({ holdId: hd.holdId, actorUserId: A1, reason: 'liberando para testar imutabilidade' });
  const afterRel = { reactivate: await sql1(`update wallet_holds set status='ACTIVE', released_by=null, released_at=null, release_reason=null where id=$1`, [hd.holdId]), del: await sql1(`delete from wallet_holds where id=$1`, [hd.holdId]), edit: await sql1(`update wallet_holds set reason='reescrito' where id=$1`, [hd.holdId]) };
  report('H25 banco: valor ≤ 0 e retido > saldo recusados; exatamente o livre aceito; moeda diferente, edição, DELETE e liberação sem motivo recusados; retenção liberada não reativa, não edita, não apaga', !!dbErrs.negative && !!dbErrs.zero && /excederia o saldo/.test(dbErrs.overBalance ?? '') && dbErrs.exactFree === null && /moeda/.test(dbErrs.curr ?? '') && !!dbErrs.update && /imutáveis|só é permitido liberar/.test(dbErrs.update ?? '') && !!dbErrs.del && !!dbErrs.badRelease && !!afterRel.reactivate && !!afterRel.del && !!afterRel.edit, { dbErrs, afterRel });

  // ---------------------------------------------------------------- interação com saldo negativo por reembolso (política existente intacta)
  const s10 = await mkSeller('100.00'); const h10 = await hold(s10, '80.00', 'REFUND-DEBT');
  await pool.query(`update wallets set balance='50.00' where id=$1`, [s10.walletId]); // o que um reembolso pós-liberação faz (débito de 50 pela política vigente)
  const b10 = await getWalletBalances(s10.walletId);
  const e10a = await err(() => payout(s10, 20)); const e10b = await err(() => payout(s10, 60));
  const still = (await q(`select status, amount::text a from wallet_holds where id=$1`, [h10.holdId]))[0];
  report('H26 reembolso que reduz o saldo abaixo do retido: disponível fica negativo (−30) e BLOQUEIA saques; a retenção continua ACTIVE com 80 (nada é consumido nem liberado automaticamente)', b10.available === '-30.00' && e10a?.code === 'BALANCE_ON_HOLD' && e10b?.code === 'INSUFFICIENT_AVAILABLE_BALANCE' && still.status === 'ACTIVE' && still.a === '80.00', { b10, a: e10a?.code, b: e10b?.code, still });

  // ---------------------------------------------------------------- saque pedido ANTES da retenção continua valendo; falha devolve ao saldo
  const s11 = await mkSeller('300.00'); const pre = await payout(s11, 200);
  const eAfter = await err(() => hold(s11, '150.00', 'AFTER-PAYOUT'));
  await hold(s11, '100.00', 'AFTER-PAYOUT-OK');
  const fail = await processPayoutStatusChange(pre.id, 'failed');
  const b11 = await getWalletBalances(s11.walletId);
  report('H27 saque já solicitado antes da retenção não é tocado: retenção acima do livre (100) é recusada; após a falha do saque o valor volta ao saldo (total 300, retido 100, livre 200)', eAfter?.code === 'INSUFFICIENT_UNHELD_BALANCE' && (fail as any).success === true && b11.total === '300.00' && b11.held === '100.00' && b11.available === '200.00', { eAfter: eAfter?.code, b11 });

  // ---------------------------------------------------------------- visão do vendedor (snapshot) e getWallet
  const gdb: any = getDb();
  const snap = await computeSellerWalletSnapshot(gdb, { id: s11.sellerId, userId: s11.userId }, 'XOF');
  report('H28 painel do vendedor: available = total − retido (200), total 300, onHold 100 (campos novos; o resto do snapshot inalterado)', snap.available === 200 && snap.total === 300 && snap.onHold === 100 && typeof snap.retained === 'number' && typeof snap.pendingRelease === 'number', snap);
  const { WalletService } = await import('../src/server/modules/wallet/walletService.js');
  const gw: any = await WalletService.getWallet(s11.userId);
  report('H29 GET /wallet: balance continua o saldo total (compatível) e traz heldBalance/availableBalance novos', gw.balance === 300 && gw.heldBalance === 100 && gw.availableBalance === 200, { b: gw.balance, h: gw.heldBalance, a: gw.availableBalance });

  // ---------------------------------------------------------------- invariantes finais
  const inv = (await q(`select (select count(*)::int from wallet_holds h join wallets w on w.id=h.wallet_id where h.status='ACTIVE' and h.currency<>w.currency) badcur,
    (select count(*)::int from (select wallet_id from wallet_holds where status='ACTIVE' group by wallet_id, reference_type, reference_id having count(*)>1) d) dups,
    (select count(*)::int from (select h.wallet_id from wallet_holds h where h.status='ACTIVE' group by h.wallet_id having sum(h.amount) > (select balance from wallets where id=h.wallet_id)) o) overheld_wallets`))[0];
  report('H30 invariantes: nenhuma moeda divergente, nenhuma referência ativa duplicada; carteiras com retido > saldo só existem pela simulação de dívida de reembolso (H26: 1)', inv.badcur === 0 && inv.dups === 0 && inv.overheld_wallets === 1, inv);
  const total0 = (await q(`select count(*)::int n from wallets where balance < 0 and id <> $1`, [sNeg.walletId]))[0].n;
  report('H31 nenhuma carteira ficou negativa por causa de saque/retenção (a única negativa é a criada de propósito em H10)', total0 === 0, total0);

  console.log(`\n${passed}/${total} testes passaram.`);
  await pool.end(); process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('FALHA FATAL:', e); process.exit(1); });
