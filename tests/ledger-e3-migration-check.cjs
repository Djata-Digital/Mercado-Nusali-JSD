// Verificação da migração 0040 (reembolsos no ledger) em banco DESCARTÁVEL (rodar pelo executor seguro; o banco deve estar no nível ANTERIOR à 0039, ex.: cópia do phase3_tmpl ou restauração do dump de produção; o migrador oficial aplica 0039 e 0040, ou só a 0040 se a 0039 já estiver aplicada): migrador oficial do drizzle → CHECKs ampliados → rollback → reaplicação → trava do rollback com dados.
const path = require('path'); const fs = require('fs');
const root = path.resolve(__dirname, '..');
// Esta verificação cobre a 0040 isoladamente: o migrador oficial roda sobre uma CÓPIA da pasta de migrações limitada até a 0040 (as posteriores têm verificação própria).
const os = require('os');
const migDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-upto-0040-'));
fs.mkdirSync(path.join(migDir, 'meta'));
{ const j = JSON.parse(fs.readFileSync(path.join(root, 'drizzle/meta/_journal.json'), 'utf8')); j.entries = j.entries.filter((e) => e.idx <= 40);
  fs.writeFileSync(path.join(migDir, 'meta/_journal.json'), JSON.stringify(j));
  for (const e of j.entries) fs.copyFileSync(path.join(root, 'drizzle', e.tag + '.sql'), path.join(migDir, e.tag + '.sql')); }
const pg = require(path.join(root, 'node_modules/pg'));
const { drizzle } = require(path.join(root, 'node_modules/drizzle-orm/node-postgres'));
const { migrate } = require(path.join(root, 'node_modules/drizzle-orm/node-postgres/migrator'));
let bad = 0; const chk = (l, ok, d) => { if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'FALHA'} ${l}${ok ? '' : ' -> ' + JSON.stringify(d)}`); };
(async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  const q = async (sql, p) => (await pool.query(sql, p)).rows;
  const def = async (name) => (await q(`select pg_get_constraintdef(oid) d from pg_constraint where conname=$1`, [name]))[0]?.d ?? '';
  const mig = async () => (await q(`select count(*)::int n from drizzle.__drizzle_migrations`))[0].n;
  // O banco-modelo de testes já contém a tabela da 0038 (criada por helper), mas sem o registro; marcamos a 0038 como aplicada.
  if ((await q(`select count(*)::int n from information_schema.tables where table_name='shipping_route_service_lead_times'`))[0].n === 1 && (await q(`select count(*)::int n from drizzle.__drizzle_migrations where created_at = 1792078942635`))[0].n === 0) {
    await q(`insert into drizzle.__drizzle_migrations (hash, created_at) values ('test-fixture-0038-already-applied', 1792078942635)`);
  }
  const before = await mig();
  await migrate(drizzle(pool), { migrationsFolder: migDir });
  const after = await mig();
  chk(`migrador oficial aplicou as migrações pendentes (${before} -> ${after}); a última é a 0040`, after > before && (await q(`select count(*)::int n from drizzle.__drizzle_migrations where created_at = 1792203160732`))[0].n === 1, { before, after });
  chk('CHECK de tipos do ledger aceita REFUND_PROCESSED (e continua com os dois tipos anteriores)', /REFUND_PROCESSED/.test(await def('ledger_transactions_type_check')) && /ORDER_DELIVERY_CONFIRMED/.test(await def('ledger_transactions_type_check')) && /PAYMENT_RECEIVED/.test(await def('ledger_transactions_type_check')));
  chk('CHECK de contas do ledger aceita REFUND_ABSORBED_SHIPPING (14 códigos)', /REFUND_ABSORBED_SHIPPING/.test(await def('ledger_accounts_code_check')) && ((await def('ledger_accounts_code_check')).match(/'[A-Z_]+'/g) || []).length === 14, await def('ledger_accounts_code_check'));
  chk('CHECK de tipos do outbox aceita REFUND_PROCESSED', /REFUND_PROCESSED/.test(await def('ledger_outbox_events_type_check')));
  chk('triggers do ledger (8) e do outbox intactos', (await q(`select count(*)::int n from pg_trigger where tgname like 'nusali_ledger_trg_%'`))[0].n === 8 && (await q(`select count(*)::int n from pg_trigger where tgname like 'nusali_outbox_trg_%'`))[0].n === 4);

  // código de conta inválido continua recusado
  let badCode = null; try { await q(`insert into ledger_accounts (id,code,owner_type,owner_id,currency,normal_balance,is_clearing,created_at) values ('acc_bad','CODIGO_INVENTADO','PLATFORM',null,'XOF','DEBIT',false,now())`); } catch (e) { badCode = e.code; }
  chk('código de conta fora do catálogo continua recusado (CHECK)', badCode === '23514', badCode);

  // rollback (sem dados que dependam dos novos valores)
  const down = fs.readFileSync(path.join(root, 'drizzle/rollback/0040_ledger_refunds.down.sql'), 'utf8');
  const runDown = async () => { const c = await pool.connect(); try { await c.query('BEGIN'); await c.query(down); await c.query('COMMIT'); return null; } catch (e) { await c.query('ROLLBACK'); return e.message; } finally { c.release(); } };
  const e0 = await runDown();
  chk('rollback 0040 sem dados: restaura os 3 CHECKs originais e remove o registro da migração', e0 === null && !/REFUND_PROCESSED/.test(await def('ledger_transactions_type_check')) && !/REFUND_ABSORBED_SHIPPING/.test(await def('ledger_accounts_code_check')) && !/REFUND_PROCESSED/.test(await def('ledger_outbox_events_type_check')) && (await mig()) === after - 1, e0);
  chk('rollback NÃO tocou nas tabelas do ledger nem nos triggers', (await q(`select count(*)::int n from pg_trigger where tgname like 'nusali_ledger_trg_%'`))[0].n === 8);
  await migrate(drizzle(pool), { migrationsFolder: migDir });
  chk('reaplicação após o rollback funciona', (await mig()) === after && /REFUND_PROCESSED/.test(await def('ledger_transactions_type_check')));

  // com dados que dependem dos novos valores: o rollback é BLOQUEADO e nada muda
  await q(`insert into users (id,email,password_hash,full_name,role,country_code,created_at,updated_at) values ('usr_mig_chk3','mig3@t.test','x','M','BUYER','GW',now(),now())`);
  { // pedido mínimo: preenche automaticamente toda coluna NOT NULL sem default
    const cols = await q(`select column_name, data_type from information_schema.columns where table_name='orders' and is_nullable='NO' and column_default is null`);
    const val = { id: "'ord_mig_chk3'", order_number: "'MIG-3'", buyer_id: "'usr_mig_chk3'", status: "'processing'", payment_status: "'paid'", escrow_status: "'held'", currency: "'XOF'" };
    const dflt = (t) => (/char|text/.test(t) ? "'x'" : /numeric|integer|double|real/.test(t) ? '0' : /json/.test(t) ? "'{}'::jsonb" : /timestamp/.test(t) ? 'now()' : /bool/.test(t) ? 'false' : 'null');
    await q(`insert into orders (${cols.map((c) => c.column_name).join(',')}) values (${cols.map((c) => val[c.column_name] ?? dflt(c.data_type)).join(',')})`);
  }
  await q(`insert into ledger_accounts (id,code,owner_type,owner_id,currency,normal_balance,is_clearing,created_at) values ('REFUND_ABSORBED_SHIPPING:PLATFORM:XOF','REFUND_ABSORBED_SHIPPING','PLATFORM',null,'XOF','DEBIT',false,now())`);
  await q(`insert into ledger_outbox_events (id,event_type,idempotency_key,order_id,snapshot_json,snapshot_hash,occurred_at) values ('lob_mig_r','REFUND_PROCESSED','refund_processed:ref_chk','ord_mig_chk3','{}',repeat('a',64),now())`);
  chk('conta REFUND_ABSORBED_SHIPPING e evento REFUND_PROCESSED são aceitos pelo banco', (await q(`select count(*)::int n from ledger_outbox_events where event_type='REFUND_PROCESSED'`))[0].n === 1);
  const e1 = await runDown();
  chk('rollback 0040 BLOQUEIA (sem alterar nada) quando já existem dados que dependem dos novos valores', /bloqueado/.test(e1 || '') && /REFUND_PROCESSED/.test(await def('ledger_transactions_type_check')) && (await mig()) === after, e1);
  let badType = null; try { await q(`insert into ledger_outbox_events (id,event_type,idempotency_key,order_id,snapshot_json,snapshot_hash,occurred_at) values ('lob_mig_x','QUALQUER','k_x','ord_mig_chk3','{}',repeat('a',64),now())`); } catch (e) { badType = e.code; }
  chk('tipo de evento fora do catálogo continua recusado no outbox (CHECK)', badType === '23514', badType);
  await pool.end();
  console.log(bad ? `\n${bad} FALHA(S)` : '\nMIGRAÇÃO 0040 VERIFICADA'); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(1); });
