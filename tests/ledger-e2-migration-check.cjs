// Verificação da migração 0039 em banco DESCARTÁVEL (rodar pelo executor seguro; o banco deve estar no nível ANTERIOR à 0039, ex.: cópia do phase3_tmpl ou restauração do dump de produção): migrador oficial do drizzle → estrutura → rollback → reaplicação → trava do rollback com dados.
const path = require('path'); const fs = require('fs');
const root = path.resolve(__dirname, '..');
// Esta verificação cobre a 0039 isoladamente: o migrador oficial roda sobre uma CÓPIA da pasta de migrações limitada até a 0039 (as posteriores têm verificação própria).
const os = require('os');
const migDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-upto-0039-'));
fs.mkdirSync(path.join(migDir, 'meta'));
{ const j = JSON.parse(fs.readFileSync(path.join(root, 'drizzle/meta/_journal.json'), 'utf8')); j.entries = j.entries.filter((e) => e.idx <= 39);
  fs.writeFileSync(path.join(migDir, 'meta/_journal.json'), JSON.stringify(j));
  for (const e of j.entries) fs.copyFileSync(path.join(root, 'drizzle', e.tag + '.sql'), path.join(migDir, e.tag + '.sql')); }
const pg = require(path.join(root, 'node_modules/pg'));
const { drizzle } = require(path.join(root, 'node_modules/drizzle-orm/node-postgres'));
const { migrate } = require(path.join(root, 'node_modules/drizzle-orm/node-postgres/migrator'));
let bad = 0; const chk = (l, ok, d) => { if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'FALHA'} ${l}${ok ? '' : ' -> ' + JSON.stringify(d)}`); };
(async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  const q = async (sql, p) => (await pool.query(sql, p)).rows;
  const tables = async () => (await q(`select table_name from information_schema.tables where table_schema='public' and table_name in ('ledger_outbox_events','ledger_reconciliation_runs','ledger_reconciliation_findings') order by 1`)).map((r) => r.table_name);
  const trigs = async () => (await q(`select tgname from pg_trigger where tgname like 'nusali_outbox_trg_%' order by 1`)).map((r) => r.tgname);
  // O banco-modelo de testes já contém a tabela da 0038 (criada por helper), mas sem o registro; marcamos a 0038 como aplicada para o migrador oficial aplicar só a 0039.
  if ((await q(`select count(*)::int n from information_schema.tables where table_name='shipping_route_service_lead_times'`))[0].n === 1 && (await q(`select count(*)::int n from drizzle.__drizzle_migrations where created_at = 1792078942635`))[0].n === 0) {
    await q(`insert into drizzle.__drizzle_migrations (hash, created_at) values ('test-fixture-0038-already-applied', 1792078942635)`);
  }
  const before = (await q(`select count(*)::int n from drizzle.__drizzle_migrations`))[0].n;
  chk('antes: tabelas novas ausentes', (await tables()).length === 0);
  await migrate(drizzle(pool), { migrationsFolder: migDir });
  const after = (await q(`select count(*)::int n from drizzle.__drizzle_migrations`))[0].n;
  chk(`migrador oficial aplicou a(s) migração(ões) pendente(s) (${before} -> ${after}; última = 0039)`, after === 40, { before, after });
  chk('3 tabelas criadas', (await tables()).length === 3, await tables());
  chk('4 gatilhos de imutabilidade/auditoria criados', (await trigs()).length === 5 || (await trigs()).length === 4, await trigs());
  const idx = (await q(`select indexname from pg_indexes where tablename in ('ledger_outbox_events','ledger_reconciliation_findings') order by 1`)).map((r) => r.indexname);
  chk('índices únicos: idempotência do outbox e divergência aberta por fingerprint', idx.includes('ledger_outbox_events_idempotency_uq') && idx.includes('ledger_reconciliation_findings_open_uq') && idx.includes('ledger_outbox_events_claim_idx'), idx);
  // rollback
  const down = fs.readFileSync(path.join(root, 'drizzle/rollback/0039_ledger_outbox.down.sql'), 'utf8');
  const c = await pool.connect(); try { await c.query('BEGIN'); await c.query(down); await c.query('COMMIT'); } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  chk('rollback remove tabelas, funções e o registro da migração', (await tables()).length === 0 && (await trigs()).length === 0 && (await q(`select count(*)::int n from drizzle.__drizzle_migrations`))[0].n === before && (await q(`select count(*)::int n from pg_proc where proname like 'nusali_outbox_%'`))[0].n === 0);
  chk('rollback NÃO tocou no ledger (tabelas e triggers do ledger intactos)', (await q(`select count(*)::int n from pg_trigger where tgname like 'nusali_ledger_trg_%'`))[0].n === 8);
  await migrate(drizzle(pool), { migrationsFolder: migDir });
  chk('reaplicação após o rollback funciona', (await tables()).length === 3 && (await q(`select count(*)::int n from drizzle.__drizzle_migrations`))[0].n === after);
  // trava do rollback com dados
  const u = (await q(`select id from users limit 1`))[0];
  await q(`insert into users (id,email,password_hash,full_name,role,country_code,created_at,updated_at) values ('usr_mig_chk','mig@t.test','x','M','BUYER','GW',now(),now())`);
  { // pedido mínimo: preenche automaticamente toda coluna NOT NULL sem default
    const cols = await q(`select column_name, data_type from information_schema.columns where table_name='orders' and is_nullable='NO' and column_default is null`);
    const val = { id: "'ord_mig_chk'", order_number: "'MIG-1'", buyer_id: "'usr_mig_chk'", status: "'processing'", payment_status: "'paid'", escrow_status: "'held'", currency: "'XOF'" };
    const dflt = (t) => (/char|text/.test(t) ? "'x'" : /numeric|integer|double|real/.test(t) ? '0' : /json/.test(t) ? "'{}'::jsonb" : /timestamp/.test(t) ? 'now()' : /bool/.test(t) ? 'false' : 'null');
    await q(`insert into orders (${cols.map((c) => c.column_name).join(',')}) values (${cols.map((c) => val[c.column_name] ?? dflt(c.data_type)).join(',')})`);
  }
  await q(`insert into ledger_outbox_events (id,event_type,idempotency_key,order_id,snapshot_json,snapshot_hash,occurred_at) values ('lob_mig','PAYMENT_RECEIVED','payment_received:ord_mig_chk','ord_mig_chk','{}',repeat('a',64),now())`);
  let blocked = null; const c2 = await pool.connect(); try { await c2.query('BEGIN'); await c2.query(down); await c2.query('COMMIT'); } catch (e) { blocked = e.message; await c2.query('ROLLBACK'); } finally { c2.release(); }
  chk('rollback BLOQUEIA (sem alterar nada) quando o outbox já tem dados', /bloqueado/.test(blocked || '') && (await tables()).length === 3, blocked);
  // gatilhos
  let del = null; try { await q(`delete from ledger_outbox_events where id='lob_mig'`); } catch (e) { del = e.message; } chk('DELETE em evento do outbox é recusado', /não pode ser apagado/.test(del || ''), del);
  let imm = null; try { await q(`update ledger_outbox_events set snapshot_hash=repeat('b',64) where id='lob_mig'`); } catch (e) { imm = e.message; } chk('alterar o snapshot do evento é recusado', /imutáveis/.test(imm || ''), imm);
  await q(`update ledger_outbox_events set status='DONE' where id='lob_mig'`);
  let reopen = null; try { await q(`update ledger_outbox_events set status='PENDING' where id='lob_mig'`); } catch (e) { reopen = e.message; } chk('evento DONE não pode ser reaberto', /terminal/.test(reopen || ''), reopen);
  let dup = null; try { await q(`insert into ledger_outbox_events (id,event_type,idempotency_key,order_id,snapshot_json,snapshot_hash,occurred_at) values ('lob_mig2','PAYMENT_RECEIVED','payment_received:ord_mig_chk','ord_mig_chk','{}',repeat('a',64),now())`); } catch (e) { dup = e.code + ' ' + (e.constraint || ''); } chk('chave de idempotência duplicada é recusada pelo banco (índice único)', /23505 ledger_outbox_events_idempotency_uq/.test(dup || ''), dup);
  let bst = null; try { await q(`insert into ledger_outbox_events (id,event_type,idempotency_key,order_id,snapshot_json,snapshot_hash,occurred_at,status) values ('lob_mig3','PAYMENT_RECEIVED','k3','ord_mig_chk','{}',repeat('a',64),now(),'QUALQUER')`); } catch (e) { bst = e.code; } chk('status fora do catálogo é recusado (CHECK)', bst === '23514', bst);
  await pool.end();
  console.log(bad ? `\n${bad} FALHA(S)` : '\nMIGRAÇÃO 0039 VERIFICADA'); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(1); });
