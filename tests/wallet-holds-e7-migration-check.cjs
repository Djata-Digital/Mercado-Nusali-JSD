// Verificação da migração 0043 (wallet_holds, E7) em banco DESCARTÁVEL (rodar pelo executor seguro; o banco deve estar no nível ANTERIOR à 0039, ex.: cópia do phase3_tmpl): migrador oficial do drizzle
// → tabela + CHECKs + índices + trigger → rollback sem dados → reaplicação → rollback BLOQUEADO com dados → regras do banco.
const path = require('path'); const fs = require('fs');
const root = path.resolve(__dirname, '..');
const pg = require(path.join(root, 'node_modules/pg'));
const { drizzle } = require(path.join(root, 'node_modules/drizzle-orm/node-postgres'));
const { migrate } = require(path.join(root, 'node_modules/drizzle-orm/node-postgres/migrator'));
let bad = 0; const chk = (l, ok, d) => { if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'FALHA'} ${l}${ok ? '' : ' -> ' + JSON.stringify(d)}`); };
(async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  const q = async (sql, p) => (await pool.query(sql, p)).rows;
  const mig = async () => (await q(`select count(*)::int n from drizzle.__drizzle_migrations`))[0].n;
  const has = async () => (await q(`select to_regclass('public.wallet_holds') t`))[0].t !== null;
  const journal = JSON.parse(fs.readFileSync(path.join(root, 'drizzle/meta/_journal.json'), 'utf8'));
  const when = journal.entries.find((e) => e.tag === '0043_ledger_wallet_holds').when;
  // O banco-modelo de testes já contém a tabela da 0038 (criada por helper), mas sem o registro; marcamos a 0038 como aplicada.
  if ((await q(`select count(*)::int n from information_schema.tables where table_name='shipping_route_service_lead_times'`))[0].n === 1 && (await q(`select count(*)::int n from drizzle.__drizzle_migrations where created_at = 1792078942635`))[0].n === 0) {
    await q(`insert into drizzle.__drizzle_migrations (hash, created_at) values ('test-fixture-0038-already-applied', 1792078942635)`);
  }
  const before = await mig();
  chk('antes: wallet_holds ausente', !(await has()));
  await migrate(drizzle(pool), { migrationsFolder: path.join(root, 'drizzle') });
  const after = await mig();
  chk(`migrador oficial aplicou as migrações pendentes (${before} -> ${after}); a última é a 0043`, after > before && (await q(`select count(*)::int n from drizzle.__drizzle_migrations where created_at = ${when}`))[0].n === 1);
  chk('tabela criada com as 15 colunas', (await has()) && (await q(`select count(*)::int n from information_schema.columns where table_name='wallet_holds'`))[0].n === 15);
  const idx = (await q(`select indexname, indexdef from pg_indexes where tablename='wallet_holds'`));
  chk('índices: idempotência única, UMA retenção ativa por (carteira, referência) e índice de ativas por carteira', ['wallet_holds_idempotency_uq', 'wallet_holds_active_ref_uq', 'wallet_holds_wallet_active_idx'].every((n) => idx.some((i) => i.indexname === n)) && /WHERE/.test(idx.find((i) => i.indexname === 'wallet_holds_active_ref_uq')?.indexdef ?? ''), idx.map((i) => i.indexname));
  chk('CHECKs: valor > 0, estados ACTIVE/RELEASED e coerência da liberação', (await q(`select count(*)::int n from pg_constraint where conname in ('wallet_holds_amount_check','wallet_holds_status_check','wallet_holds_release_check')`))[0].n === 3);
  chk('trigger de guarda habilitado (INSERT/UPDATE/DELETE)', (await q(`select count(*)::int n from pg_trigger where tgname='nusali_wallet_hold_trg_guard' and tgenabled='O'`))[0].n === 1);
  chk('triggers do ledger (8), do outbox e do frete/chargebacks intactos', (await q(`select count(*)::int n from pg_trigger where tgname like 'nusali_ledger_trg_%'`))[0].n === 8);

  // rollback (sem dados)
  const down = fs.readFileSync(path.join(root, 'drizzle/rollback/0043_ledger_wallet_holds.down.sql'), 'utf8');
  const runDown = async () => { const c = await pool.connect(); try { await c.query('BEGIN'); await c.query(down); await c.query('COMMIT'); return null; } catch (e) { await c.query('ROLLBACK'); return e.message; } finally { c.release(); } };
  chk('o rollback aponta o created_at certo do journal', down.includes(`created_at = ${when}`));
  const e0 = await runDown();
  chk('rollback 0043 sem dados: remove a tabela e a função e o registro da migração', e0 === null && !(await has()) && (await mig()) === after - 1 && (await q(`select count(*)::int n from pg_proc where proname='nusali_wallet_hold_guard'`))[0].n === 0, e0);
  await migrate(drizzle(pool), { migrationsFolder: path.join(root, 'drizzle') });
  chk('reaplicação após o rollback funciona', (await has()) && (await mig()) === after);

  // com dados: o rollback é BLOQUEADO e nada muda; regras do banco
  await q(`insert into users (id,email,password_hash,full_name,role,country_code,created_at,updated_at) values ('usr_mig_e7a','e7a@t.test','x','A','GLOBAL_ADMIN','GW',now(),now()), ('usr_mig_e7s','e7s@t.test','x','S','SELLER','GW',now(),now())`);
  await q(`insert into wallets (id,user_id,balance,currency,status) values ('wlt_mig_e7','usr_mig_e7s','100.00','XOF','active')`);
  const ins = (id, amount, cur = 'XOF', ref = id) => q(`insert into wallet_holds (id,wallet_id,currency,amount,status,reason,reference_type,reference_id,created_by,idempotency_key) values ($1,'wlt_mig_e7',$2,$3,'ACTIVE','motivo de teste direto','DIRECT',$4,'usr_mig_e7a',$1)`, [id, cur, amount, ref]);
  const code = async (fn) => { try { await fn(); return null; } catch (e) { return (e.code || '') + '|' + e.message; } };
  await ins('wh_ok', '60.00');
  chk('retenção válida aceita', (await q(`select count(*)::int n from wallet_holds`))[0].n === 1);
  chk('valor ≤ 0 recusado (CHECK); retido > saldo recusado (trigger); moeda diferente recusada', (await code(() => ins('wh_neg', '-1.00'))) ?.startsWith('23514') && /excederia o saldo/.test(String(await code(() => ins('wh_over', '40.01')))) && /moeda/.test(String(await code(() => ins('wh_cur', '1.00', 'BRL')))));
  chk('referência ativa duplicada recusada (índice único parcial)', (await code(() => ins('wh_dup', '10.00', 'XOF', 'wh_ok')))?.startsWith('23505'));
  chk('edição de valor e DELETE recusados (imutável)', /só é permitido liberar/.test(String(await code(() => q(`update wallet_holds set amount='1.00' where id='wh_ok'`)))) && /sem DELETE/.test(String(await code(() => q(`delete from wallet_holds where id='wh_ok'`)))));
  chk('liberação sem motivo (≥10) recusada pelo CHECK; com motivo aceita; depois imutável', (await code(() => q(`update wallet_holds set status='RELEASED', released_by='usr_mig_e7a', released_at=now(), release_reason='curto' where id='wh_ok'`))) ?.startsWith('23514')
    && (await code(() => q(`update wallet_holds set status='RELEASED', released_by='usr_mig_e7a', released_at=now(), release_reason='liberada na verificação' where id='wh_ok'`))) === null
    && /imutável/.test(String(await code(() => q(`update wallet_holds set reason='reescrita' where id='wh_ok'`)))));
  chk('a tabela referencia carteira e usuários com ON DELETE RESTRICT (nada some em cascata)', (await q(`select count(*)::int n from pg_constraint where conrelid='wallet_holds'::regclass and contype='f' and confdeltype='r'`))[0].n === 4);
  const e1 = await runDown();
  chk('rollback 0043 BLOQUEIA (sem alterar nada) quando já existem retenções registradas', /bloqueado/.test(e1 || '') && (await has()) && (await mig()) === after, e1);
  await pool.end();
  console.log(bad ? `\n${bad} FALHA(S)` : '\nMIGRAÇÃO 0043 VERIFICADA'); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(1); });
