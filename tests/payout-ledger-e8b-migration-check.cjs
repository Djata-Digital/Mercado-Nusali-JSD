// Verificação da migração 0044 (eventos de saque no outbox/ledger, E8b) em banco DESCARTÁVEL (rodar pelo executor seguro; o banco deve estar no nível ANTERIOR à 0039, ex.: cópia do phase3_tmpl):
// migrador oficial → colunas/constraints/índice/trigger → rollback sem dados → reaplicação → rollback BLOQUEADO com dados → regras do banco.
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
  const hasCol = async () => (await q(`select count(*)::int n from information_schema.columns where table_name='ledger_outbox_events' and column_name='payout_id'`))[0].n === 1;
  const orderNullable = async () => (await q(`select is_nullable n from information_schema.columns where table_name='ledger_outbox_events' and column_name='order_id'`))[0].n === 'YES';
  const def = async (name) => (await q(`select pg_get_constraintdef(oid) d from pg_constraint where conname=$1`, [name]))[0]?.d ?? '';
  const journal = JSON.parse(fs.readFileSync(path.join(root, 'drizzle/meta/_journal.json'), 'utf8'));
  const when = journal.entries.find((e) => e.tag === '0044_ledger_payout_events').when;
  // O banco-modelo de testes já contém a tabela da 0038 (criada por helper), mas sem o registro; marcamos a 0038 como aplicada.
  if ((await q(`select count(*)::int n from information_schema.tables where table_name='shipping_route_service_lead_times'`))[0].n === 1 && (await q(`select count(*)::int n from drizzle.__drizzle_migrations where created_at = 1792078942635`))[0].n === 0) {
    await q(`insert into drizzle.__drizzle_migrations (hash, created_at) values ('test-fixture-0038-already-applied', 1792078942635)`);
  }
  const before = await mig();
  chk('antes: ledger_outbox_events sem payout_id (ainda nem existe antes da 0039)', !(await hasCol()));
  await migrate(drizzle(pool), { migrationsFolder: path.join(root, 'drizzle') });
  const after = await mig();
  chk(`migrador oficial aplicou as migrações pendentes (${before} -> ${after}); a última é a 0044`, after > before && (await q(`select count(*)::int n from drizzle.__drizzle_migrations where created_at = ${when}`))[0].n === 1);
  chk('payout_id criado e order_id agora aceita NULL (eventos de saque não têm pedido)', (await hasCol()) && (await orderNullable()));
  chk('CHECK de assunto (pedido OU saque), FK do saque com RESTRICT e índice do saque', /payout_id IS NOT NULL/.test(await def('ledger_outbox_events_subject_check')) && (await q(`select confdeltype d from pg_constraint where conname='ledger_outbox_events_payout_id_seller_payouts_id_fk'`))[0]?.d === 'r' && (await q(`select count(*)::int n from pg_indexes where indexname='ledger_outbox_events_payout_idx'`))[0].n === 1);
  const all = ['PAYMENT_RECEIVED', 'ORDER_DELIVERY_CONFIRMED', 'REFUND_PROCESSED', 'SHIPPING_COST_REVERSED', 'CHARGEBACK_CONFIRMED', 'CHARGEBACK_ALLOCATED', 'CHARGEBACK_RECOVERY', 'CHARGEBACK_WRITE_OFF', 'PAYOUT_REQUESTED', 'PAYOUT_COMPLETED', 'PAYOUT_FAILED'];
  { const lt = await def('ledger_transactions_type_check'), ot = await def('ledger_outbox_events_type_check');
    chk('CHECKs de tipo do ledger e do outbox aceitam os 3 tipos de saque (e mantêm os anteriores)', all.every((t) => lt.includes(`'${t}'`)) && all.every((t) => ot.includes(`'${t}'`)), { lt, ot }); }
  chk('trigger de imutabilidade do outbox protege também o payout_id; triggers do ledger (8) intactos', /payout_id/.test((await q(`select prosrc from pg_proc where proname='nusali_outbox_enforce_immutable'`))[0].prosrc) && (await q(`select count(*)::int n from pg_trigger where tgname like 'nusali_ledger_trg_%'`))[0].n === 8);
  chk('contas do ledger: o CHECK de códigos já contém SELLER_PAYOUT_CLEARING (nenhuma conta nova)', /SELLER_PAYOUT_CLEARING/.test(await def('ledger_accounts_code_check')));

  const down = fs.readFileSync(path.join(root, 'drizzle/rollback/0044_ledger_payout_events.down.sql'), 'utf8');
  const runDown = async () => { const c = await pool.connect(); try { await c.query('BEGIN'); await c.query(down); await c.query('COMMIT'); return null; } catch (e) { await c.query('ROLLBACK'); return e.message; } finally { c.release(); } };
  chk('o rollback aponta o created_at certo do journal', down.includes(`created_at = ${when}`));
  const e0 = await runDown();
  chk('rollback 0044 sem dados: remove payout_id, restaura order_id NOT NULL e os CHECKs anteriores, restaura a função e remove o registro', e0 === null && !(await hasCol()) && !(await orderNullable()) && !/PAYOUT_/.test(await def('ledger_outbox_events_type_check')) && !/PAYOUT_/.test(await def('ledger_transactions_type_check')) && !/payout_id/.test((await q(`select prosrc from pg_proc where proname='nusali_outbox_enforce_immutable'`))[0].prosrc) && (await mig()) === after - 1, e0);
  await migrate(drizzle(pool), { migrationsFolder: path.join(root, 'drizzle') });
  chk('reaplicação após o rollback funciona', (await hasCol()) && (await mig()) === after);

  // com dados: regras do banco e rollback BLOQUEADO
  await q(`insert into users (id,email,password_hash,full_name,role,country_code,created_at,updated_at) values ('usr_mig_e8b','e8b@t.test','x','S','SELLER','GW',now(),now())`);
  await q(`insert into sellers (id,user_id,company_name,trading_name,tax_id,phone,country_code,status,created_at,updated_at) values ('sel_mig_e8b','usr_mig_e8b','C','T','TAX-E8B','0','GW','active',now(),now())`);
  await q(`insert into seller_payouts (id,seller_id,amount,currency,method,status,created_at) values ('po_mig_e8b','sel_mig_e8b','10.00','XOF','wallet','pending',now())`);
  const ev = (id, type, order, payout, key) => q(`insert into ledger_outbox_events (id,event_type,idempotency_key,order_id,payout_id,snapshot_json,snapshot_hash,occurred_at) values ($1,$2,$3,$4,$5,'{}',repeat('a',64),now())`, [id, type, key, order, payout]);
  const code = async (fn) => { try { await fn(); return null; } catch (e) { return (e.code || '') + '|' + e.message; } };
  chk('evento de saque (sem pedido) aceito; sem pedido E sem saque recusado (CHECK); tipo fora do catálogo recusado', (await code(() => ev('lob_mig_ok', 'PAYOUT_REQUESTED', null, 'po_mig_e8b', 'payout_requested:po_mig_e8b'))) === null && (await code(() => ev('lob_mig_ns', 'PAYOUT_REQUESTED', null, null, 'k-ns')))?.startsWith('23514') && (await code(() => ev('lob_mig_bt', 'QUALQUER', null, 'po_mig_e8b', 'k-bt')))?.startsWith('23514'));
  chk('payout_id é imutável depois de gravado; saque inexistente recusado (FK)', /imutáveis/.test(String(await code(() => q(`update ledger_outbox_events set payout_id=null where id='lob_mig_ok'`)))) && (await code(() => ev('lob_mig_fk', 'PAYOUT_FAILED', null, 'po_inexistente', 'k-fk')))?.startsWith('23503'));
  const e1 = await runDown();
  chk('rollback 0044 BLOQUEIA (sem alterar nada) quando já existem eventos de saque', /bloqueado/.test(e1 || '') && (await hasCol()) && (await mig()) === after, e1);
  await pool.end();
  console.log(bad ? `\n${bad} FALHA(S)` : '\nMIGRAÇÃO 0044 VERIFICADA'); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(1); });
