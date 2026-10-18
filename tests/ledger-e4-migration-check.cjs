// Verificação da migração 0041 (reversão do custo de frete) em banco DESCARTÁVEL (rodar pelo executor seguro; o banco deve estar no nível ANTERIOR à 0039, ex.: cópia do phase3_tmpl ou restauração do dump de produção; o migrador oficial aplica as pendentes até a 0041): estrutura → rollback → reaplicação → trava do rollback com dados.
const path = require('path'); const fs = require('fs');
const root = path.resolve(__dirname, '..');
// Esta verificação cobre a 0041 isoladamente: o migrador oficial roda sobre uma CÓPIA da pasta de migrações limitada até a 0041 (as posteriores têm verificação própria).
const os = require('os');
const migDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-upto-0041-'));
fs.mkdirSync(path.join(migDir, 'meta'));
{ const j = JSON.parse(fs.readFileSync(path.join(root, 'drizzle/meta/_journal.json'), 'utf8')); j.entries = j.entries.filter((e) => e.idx <= 41);
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
  const hasTable = async () => (await q(`select to_regclass('public.shipping_cost_reversals') t`))[0].t !== null;
  const journal = JSON.parse(fs.readFileSync(path.join(root, 'drizzle/meta/_journal.json'), 'utf8'));
  const when = journal.entries.find((e) => e.tag === '0041_ledger_shipping_reversal').when;
  // O banco-modelo de testes já contém a tabela da 0038 (criada por helper), mas sem o registro; marcamos a 0038 como aplicada.
  if ((await q(`select count(*)::int n from information_schema.tables where table_name='shipping_route_service_lead_times'`))[0].n === 1 && (await q(`select count(*)::int n from drizzle.__drizzle_migrations where created_at = 1792078942635`))[0].n === 0) {
    await q(`insert into drizzle.__drizzle_migrations (hash, created_at) values ('test-fixture-0038-already-applied', 1792078942635)`);
  }
  const before = await mig();
  chk('antes: tabela nova ausente', !(await hasTable()));
  await migrate(drizzle(pool), { migrationsFolder: migDir });
  const after = await mig();
  chk(`migrador oficial aplicou as migrações pendentes (${before} -> ${after}); a última é a 0041`, after > before && (await q(`select count(*)::int n from drizzle.__drizzle_migrations where created_at = ${when}`))[0].n === 1, { before, after });
  chk('tabela shipping_cost_reversals criada, com o índice único de idempotência e o CHECK de partes (subsídio + absorvido = valor)', (await hasTable()) && (await q(`select indexname from pg_indexes where tablename='shipping_cost_reversals'`)).some((r) => r.indexname === 'shipping_cost_reversals_idempotency_uq') && /subsidy_part/.test(await def('shipping_cost_reversals_amount_check')));
  chk('CHECKs de tipo do ledger e do outbox aceitam SHIPPING_COST_REVERSED (e mantêm REFUND_PROCESSED e os anteriores)', /SHIPPING_COST_REVERSED/.test(await def('ledger_transactions_type_check')) && /REFUND_PROCESSED/.test(await def('ledger_transactions_type_check')) && /SHIPPING_COST_REVERSED/.test(await def('ledger_outbox_events_type_check')));
  chk('trigger de imutabilidade criado (UPDATE/DELETE) e os triggers do ledger (8) e do outbox (4) intactos', (await q(`select count(*)::int n from pg_trigger where tgname='nusali_shipping_reversal_trg_immutable' and tgenabled='O'`))[0].n === 1 && (await q(`select count(*)::int n from pg_trigger where tgname like 'nusali_ledger_trg_%'`))[0].n === 8 && (await q(`select count(*)::int n from pg_trigger where tgname like 'nusali_outbox_trg_%'`))[0].n === 4);

  // rollback (sem dados)
  const down = fs.readFileSync(path.join(root, 'drizzle/rollback/0041_ledger_shipping_reversal.down.sql'), 'utf8');
  const runDown = async () => { const c = await pool.connect(); try { await c.query('BEGIN'); await c.query(down); await c.query('COMMIT'); return null; } catch (e) { await c.query('ROLLBACK'); return e.message; } finally { c.release(); } };
  const e0 = await runDown();
  chk('rollback 0041 sem dados: remove a tabela e a função, restaura os 2 CHECKs e remove o registro da migração', e0 === null && !(await hasTable()) && !/SHIPPING_COST_REVERSED/.test(await def('ledger_transactions_type_check')) && !/SHIPPING_COST_REVERSED/.test(await def('ledger_outbox_events_type_check')) && /REFUND_PROCESSED/.test(await def('ledger_transactions_type_check')) && (await mig()) === after - 1 && (await q(`select count(*)::int n from pg_proc where proname='nusali_shipping_reversal_immutable'`))[0].n === 0, e0);
  chk('rollback NÃO tocou nos triggers do ledger nem do outbox', (await q(`select count(*)::int n from pg_trigger where tgname like 'nusali_ledger_trg_%'`))[0].n === 8 && (await q(`select count(*)::int n from pg_trigger where tgname like 'nusali_outbox_trg_%'`))[0].n === 4);
  await migrate(drizzle(pool), { migrationsFolder: migDir });
  chk('reaplicação após o rollback funciona', (await hasTable()) && (await mig()) === after && /SHIPPING_COST_REVERSED/.test(await def('ledger_transactions_type_check')));

  // com dados que dependem do novo tipo: o rollback é BLOQUEADO e nada muda
  await q(`insert into users (id,email,password_hash,full_name,role,country_code,created_at,updated_at) values ('usr_mig_chk4','mig4@t.test','x','M','BUYER','GW',now(),now())`);
  { // pedido mínimo: preenche automaticamente toda coluna NOT NULL sem default
    const cols = await q(`select column_name, data_type from information_schema.columns where table_name='orders' and is_nullable='NO' and column_default is null`);
    const val = { id: "'ord_mig_chk4'", order_number: "'MIG-4'", buyer_id: "'usr_mig_chk4'", status: "'processing'", payment_status: "'paid'", escrow_status: "'held'", currency: "'XOF'" };
    const dflt = (t) => (/char|text/.test(t) ? "'x'" : /numeric|integer|double|real/.test(t) ? '0' : /json/.test(t) ? "'{}'::jsonb" : /timestamp/.test(t) ? 'now()' : /bool/.test(t) ? 'false' : 'null');
    await q(`insert into orders (${cols.map((c) => c.column_name).join(',')}) values (${cols.map((c) => val[c.column_name] ?? dflt(c.data_type)).join(',')})`);
  }
  await q(`insert into ledger_outbox_events (id,event_type,idempotency_key,order_id,snapshot_json,snapshot_hash,occurred_at) values ('lob_mig_s','SHIPPING_COST_REVERSED','shipping_cost_reversed:scr_chk','ord_mig_chk4','{}',repeat('a',64),now())`);
  const e1 = await runDown();
  chk('rollback 0041 BLOQUEIA (sem alterar nada) quando já existem eventos/lançamentos do novo tipo', /bloqueado/.test(e1 || '') && (await hasTable()) && (await mig()) === after && /SHIPPING_COST_REVERSED/.test(await def('ledger_transactions_type_check')), e1);
  let badType = null; try { await q(`insert into ledger_outbox_events (id,event_type,idempotency_key,order_id,snapshot_json,snapshot_hash,occurred_at) values ('lob_mig_x','QUALQUER','k_x4','ord_mig_chk4','{}',repeat('a',64),now())`); } catch (e) { badType = e.code; }
  chk('tipo de evento fora do catálogo continua recusado no outbox (CHECK)', badType === '23514', badType);
  let badParts = null; try { await q(`insert into shipping_cost_reversals (id,order_id,refund_id,amount,currency,subsidy_part,absorbed_part,evidence_ref,reason,performed_by,idempotency_key) values ('scr_x','ord_mig_chk4','ref_x',10,'XOF',1,1,'e','r','usr_mig_chk4','k')`); } catch (e) { badParts = e.code; }
  chk('reversão com partes que não somam o valor é recusada (CHECK/FK) — nada inconsistente entra', ['23514', '23503'].includes(badParts), badParts);
  await pool.end();
  console.log(bad ? `\n${bad} FALHA(S)` : '\nMIGRAÇÃO 0041 VERIFICADA'); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(1); });
