// Verificação da migração 0042 (chargebacks no ledger sombra) em banco DESCARTÁVEL (rodar pelo executor seguro; o banco deve estar no nível ANTERIOR à 0039, ex.: cópia do phase3_tmpl ou restauração do dump de produção; o migrador oficial aplica as pendentes até a 0042): estrutura → rollback → reaplicação → trava do rollback com dados.
const path = require('path'); const fs = require('fs');
const root = path.resolve(__dirname, '..');
const pg = require(path.join(root, 'node_modules/pg'));
const { drizzle } = require(path.join(root, 'node_modules/drizzle-orm/node-postgres'));
const { migrate } = require(path.join(root, 'node_modules/drizzle-orm/node-postgres/migrator'));
let bad = 0; const chk = (l, ok, d) => { if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'FALHA'} ${l}${ok ? '' : ' -> ' + JSON.stringify(d)}`); };
const TABLES = ['chargeback_allocations', 'chargeback_evidence', 'chargeback_decisions', 'chargeback_decision_lines', 'chargeback_recoveries'];
(async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  const q = async (sql, p) => (await pool.query(sql, p)).rows;
  const def = async (name) => (await q(`select pg_get_constraintdef(oid) d from pg_constraint where conname=$1`, [name]))[0]?.d ?? '';
  const mig = async () => (await q(`select count(*)::int n from drizzle.__drizzle_migrations`))[0].n;
  const tables = async () => (await q(`select tablename from pg_tables where schemaname='public' and tablename = any($1) order by 1`, [TABLES])).map((r) => r.tablename);
  const journal = JSON.parse(fs.readFileSync(path.join(root, 'drizzle/meta/_journal.json'), 'utf8'));
  const when = journal.entries.find((e) => e.tag === '0042_ledger_chargebacks').when;
  // O banco-modelo de testes já contém a tabela da 0038 (criada por helper), mas sem o registro; marcamos a 0038 como aplicada.
  if ((await q(`select count(*)::int n from information_schema.tables where table_name='shipping_route_service_lead_times'`))[0].n === 1 && (await q(`select count(*)::int n from drizzle.__drizzle_migrations where created_at = 1792078942635`))[0].n === 0) {
    await q(`insert into drizzle.__drizzle_migrations (hash, created_at) values ('test-fixture-0038-already-applied', 1792078942635)`);
  }
  const before = await mig();
  chk('antes: tabelas novas ausentes', (await tables()).length === 0);
  await migrate(drizzle(pool), { migrationsFolder: path.join(root, 'drizzle') });
  const after = await mig();
  chk(`migrador oficial aplicou as migrações pendentes (${before} -> ${after}); a última é a 0042`, after > before && (await q(`select count(*)::int n from drizzle.__drizzle_migrations where created_at = ${when}`))[0].n === 1, { before, after });
  chk('5 tabelas criadas (alocações, evidências, decisões, linhas, recuperações)', (await tables()).length === 5, await tables());
  const idx = (await q(`select indexname from pg_indexes where tablename = any($1)`, [TABLES])).map((r) => r.indexname);
  chk('índices únicos: alocação por (chargeback, pedido), versão da decisão, UMA decisão aprovada por chargeback, idempotência da recuperação', ['chargeback_allocations_chargeback_order_uq', 'chargeback_decisions_version_uq', 'chargeback_decisions_one_approved_uq', 'chargeback_recoveries_idempotency_uq'].every((i) => idx.includes(i)), idx);
  { const lt = await def('ledger_transactions_type_check'), ot = await def('ledger_outbox_events_type_check'); const all = ['PAYMENT_RECEIVED', 'ORDER_DELIVERY_CONFIRMED', 'REFUND_PROCESSED', 'SHIPPING_COST_REVERSED', 'CHARGEBACK_CONFIRMED', 'CHARGEBACK_ALLOCATED', 'CHARGEBACK_RECOVERY', 'CHARGEBACK_WRITE_OFF'];
    chk('CHECKs de tipo do ledger e do outbox aceitam os 4 tipos de chargeback (e mantêm os anteriores)', all.every((t) => lt.includes(t)) && all.every((t) => ot.includes(t)), { lt, ot }); }
  chk('CHECK de contas aceita CHARGEBACK_LOSS (15 códigos)', /CHARGEBACK_LOSS/.test(await def('ledger_accounts_code_check')) && ((await def('ledger_accounts_code_check')).match(/'[A-Z_]+'/g) || []).length === 15, await def('ledger_accounts_code_check'));
  chk('CHECK de quatro olhos: aprovador ≠ proponente, e causas/estados fechados', /approved_by/.test(await def('chargeback_decisions_four_eyes_check')) && /SELLER_FAULT/.test(await def('chargeback_decisions_cause_check')) && /SUPERSEDED/.test(await def('chargeback_decisions_status_check')));
  chk('triggers de imutabilidade (4) e de guarda da decisão (1) habilitados; ledger (8), outbox (4) e frete (1) intactos', (await q(`select count(*)::int n from pg_trigger where tgname like 'nusali_chargeback_trg_%' and tgenabled='O'`))[0].n === 5 && (await q(`select count(*)::int n from pg_trigger where tgname like 'nusali_ledger_trg_%'`))[0].n === 8 && (await q(`select count(*)::int n from pg_trigger where tgname like 'nusali_outbox_trg_%'`))[0].n === 4 && (await q(`select count(*)::int n from pg_trigger where tgname = 'nusali_shipping_reversal_trg_immutable'`))[0].n === 1);

  // rollback (sem dados)
  const down = fs.readFileSync(path.join(root, 'drizzle/rollback/0042_ledger_chargebacks.down.sql'), 'utf8');
  const runDown = async () => { const c = await pool.connect(); try { await c.query('BEGIN'); await c.query(down); await c.query('COMMIT'); return null; } catch (e) { await c.query('ROLLBACK'); return e.message; } finally { c.release(); } };
  const e0 = await runDown();
  chk('rollback 0042 sem dados: remove as 5 tabelas e as 2 funções, restaura os 3 CHECKs e remove o registro da migração', e0 === null && (await tables()).length === 0 && !/CHARGEBACK_LOSS/.test(await def('ledger_accounts_code_check')) && !/CHARGEBACK_/.test(await def('ledger_transactions_type_check')) && /SHIPPING_COST_REVERSED/.test(await def('ledger_transactions_type_check')) && (await mig()) === after - 1 && (await q(`select count(*)::int n from pg_proc where proname like 'nusali_chargeback_%'`))[0].n === 0, e0);
  chk('rollback NÃO tocou nos triggers do ledger, do outbox nem do frete', (await q(`select count(*)::int n from pg_trigger where tgname like 'nusali_ledger_trg_%'`))[0].n === 8 && (await q(`select count(*)::int n from pg_trigger where tgname like 'nusali_outbox_trg_%'`))[0].n === 4 && (await q(`select count(*)::int n from pg_trigger where tgname = 'nusali_shipping_reversal_trg_immutable'`))[0].n === 1);
  await migrate(drizzle(pool), { migrationsFolder: path.join(root, 'drizzle') });
  chk('reaplicação após o rollback funciona', (await tables()).length === 5 && (await mig()) === after);

  // com dados: o rollback é BLOQUEADO e nada muda
  await q(`insert into users (id,email,password_hash,full_name,role,country_code,created_at,updated_at) values ('usr_mig_chk5','mig5@t.test','x','M','BUYER','GW',now(),now())`);
  { // pedido mínimo: preenche automaticamente toda coluna NOT NULL sem default
    const cols = await q(`select column_name, data_type from information_schema.columns where table_name='orders' and is_nullable='NO' and column_default is null`);
    const val = { id: "'ord_mig_chk5'", order_number: "'MIG-5'", buyer_id: "'usr_mig_chk5'", status: "'processing'", payment_status: "'paid'", escrow_status: "'held'", currency: "'XOF'" };
    const dflt = (t) => (/char|text/.test(t) ? "'x'" : /numeric|integer|double|real/.test(t) ? '0' : /json/.test(t) ? "'{}'::jsonb" : /timestamp/.test(t) ? 'now()' : /bool/.test(t) ? 'false' : 'null');
    await q(`insert into orders (${cols.map((c) => c.column_name).join(',')}) values (${cols.map((c) => val[c.column_name] ?? dflt(c.data_type)).join(',')})`);
  }
  await q(`insert into ledger_outbox_events (id,event_type,idempotency_key,order_id,snapshot_json,snapshot_hash,occurred_at) values ('lob_mig_c','CHARGEBACK_CONFIRMED','chargeback_confirmed:cba_chk','ord_mig_chk5','{}',repeat('a',64),now())`);
  const e1 = await runDown();
  chk('rollback 0042 BLOQUEIA (sem alterar nada) quando já existem eventos/lançamentos CHARGEBACK_*', /bloqueado/.test(e1 || '') && (await tables()).length === 5 && (await mig()) === after && /CHARGEBACK_WRITE_OFF/.test(await def('ledger_transactions_type_check')), e1);
  let badType = null; try { await q(`insert into ledger_outbox_events (id,event_type,idempotency_key,order_id,snapshot_json,snapshot_hash,occurred_at) values ('lob_mig_x','QUALQUER','k_x5','ord_mig_chk5','{}',repeat('a',64),now())`); } catch (e) { badType = e.code; }
  chk('tipo de evento fora do catálogo continua recusado no outbox (CHECK)', badType === '23514', badType);
  let badAlloc = null; try { await q(`insert into chargeback_allocations (id,chargeback_id,order_id,payment_id,allocated_value,currency,order_total,release_stage) values ('cba_x','cb_x','ord_mig_chk5','pay_x',10,'XOF',5,'AFTER_RELEASE')`); } catch (e) { badAlloc = e.code; }
  chk('alocação inconsistente (valor acima do total do pedido / referências inexistentes) é recusada — nada inconsistente entra', ['23514', '23503'].includes(badAlloc), badAlloc);
  await pool.end();
  console.log(bad ? `\n${bad} FALHA(S)` : '\nMIGRAÇÃO 0042 VERIFICADA'); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(1); });
