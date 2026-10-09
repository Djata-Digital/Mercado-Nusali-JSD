/**
 * FASE 8C.3 — verificacao do backup RESTAURADO x producao (esquema, constraints, indices, migracoes, contagens e checksum por tabela).
 * Producao: SOMENTE LEITURA (BEGIN READ ONLY). Nao imprime credenciais nem dados: apenas nomes de tabelas, contagens e hashes curtos.
 */
const path = require('path');
const root = 'C:/Users/djata/Desktop/Mercado Nusali';
require(path.join(root, 'node_modules/dotenv')).config({ path: path.join(root, '.env') });
const pg = require(path.join(root, 'node_modules/pg'));
const crypto = require('crypto');
const h = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);

const SCHEMAS = ['public', 'drizzle', 'auth', 'storage', 'realtime'];
async function schemaFacts(c) {
  const q = async (s) => (await c.query(s)).rows;
  const inList = SCHEMAS.map((s) => `'${s}'`).join(',');
  const cols = await q(`select table_schema||'.'||table_name||'.'||column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,'') as x from information_schema.columns where table_schema in (${inList}) order by 1`);
  const cons = await q(`select n.nspname||'.'||cl.relname||'.'||co.conname||':'||co.contype::text||':'||pg_get_constraintdef(co.oid) as x from pg_constraint co join pg_class cl on cl.oid=co.conrelid join pg_namespace n on n.oid=cl.relnamespace where n.nspname in (${inList}) order by 1`);
  const idx = await q(`select schemaname||'.'||indexname||':'||indexdef as x from pg_indexes where schemaname in (${inList}) order by 1`);
  const tabs = await q(`select n.nspname||'.'||c.relname as x from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and n.nspname in (${inList}) order by 1`);
  const seq = await q(`select n.nspname||'.'||c.relname as x from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='S' and n.nspname in (${inList}) order by 1`);
  const fn = await q(`select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' as x from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','drizzle') order by 1`);
  const trg = await q(`select c.relname||'.'||t.tgname as x from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname in (${inList}) order by 1`);
  const f = (rows) => ({ n: rows.length, h: h(rows.map((r) => r.x).join('\n')), list: rows.map((r) => r.x) });
  return { colunas: f(cols), constraints: f(cons), indices: f(idx), tabelas: f(tabs), sequencias: f(seq), funcoes: f(fn), gatilhos: f(trg) };
}
async function dataFacts(c, tables) {
  const out = {};
  for (const t of tables) {
    const [s, n] = t.split('.');
    const r = (await c.query(`select count(*)::int n, md5(coalesce(string_agg(x::text, '|' order by x::text collate "C"), '')) h from "${s}"."${n}" x`)).rows[0];
    out[t] = { n: r.n, h: r.h.slice(0, 10) };
  }
  return out;
}
(async () => {
  const prod = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
  const rest = new pg.Pool({ connectionString: 'postgres://postgres:postgres@localhost:55434/p8d_restore', max: 1 });
  const pc = await prod.connect(); const rc = await rest.connect();
  try {
    await pc.query('BEGIN READ ONLY ISOLATION LEVEL REPEATABLE READ');
    console.log('producao em sessao somente leitura:', (await pc.query('show transaction_read_only')).rows[0].transaction_read_only);
    const A = await schemaFacts(pc), B = await schemaFacts(rc);
    for (const k of Object.keys(A)) {
      const same = A[k].h === B[k].h;
      const missing = A[k].list.filter((x) => !B[k].list.includes(x)).slice(0, 2).map((s) => s.slice(0, 260)), extra = B[k].list.filter((x) => !A[k].list.includes(x)).slice(0, 2).map((s) => s.slice(0, 260));
      const norm = (x) => x.replace(/::character varying|::text\[\]|::text|ARRAY|[()\[\]\s]/g, '');
      const onlyCosmetic = !same && A[k].list.filter((x) => !B[k].list.includes(x)).every((x) => B[k].list.some((y) => norm(y) === norm(x)));
      const nDiff = A[k].list.filter((x) => !B[k].list.includes(x)).length;
      console.log(`ESQUEMA ${k}: producao=${A[k].n} restaurado=${B[k].n} ${same ? 'IGUAL' : onlyCosmetic ? `IGUAL SEMANTICAMENTE (${nDiff} definicoes com redacao diferente de ANY(ARRAY[...]) entre versoes do PostgreSQL; mesmo conjunto de valores)` : 'DIFERENTE nao-cosmeticas=' + JSON.stringify(A[k].list.filter((x) => !B[k].list.includes(x) && !B[k].list.some((y) => norm(y) === norm(x))).slice(0, 3).map((t) => t.slice(0, 300)))}`);
    }
    const tables = A.tabelas.list.filter((t) => t !== 'vault.secrets');
    const DA = await dataFacts(pc, tables), DB = await dataFacts(rc, tables);
    const diffs = tables.filter((t) => DA[t].n !== DB[t].n || DA[t].h !== DB[t].h);
    const totalRows = tables.reduce((s, t) => s + DA[t].n, 0);
    console.log(`DADOS: ${tables.length} tabelas, ${totalRows} linhas em producao; tabelas com contagem ou checksum diferente: ${diffs.length}`);
    for (const t of diffs) console.log(`  DIFERE ${t}: producao=${DA[t].n}/${DA[t].h} restaurado=${DB[t].n}/${DB[t].h}`);
    const nonEmpty = tables.filter((t) => DA[t].n > 0);
    console.log(`  tabelas com dados: ${nonEmpty.length}; identicas (contagem+checksum): ${nonEmpty.filter((t) => !diffs.includes(t)).length}`);
    const mp = (await pc.query('select count(*)::int n, md5(string_agg(hash||created_at::text, \'|\' order by id)) h from drizzle.__drizzle_migrations')).rows[0];
    const mr = (await rc.query('select count(*)::int n, md5(string_agg(hash||created_at::text, \'|\' order by id)) h from drizzle.__drizzle_migrations')).rows[0];
    console.log(`MIGRACOES: producao=${mp.n} restaurado=${mr.n} ${mp.h === mr.h ? 'IGUAIS (hash e data de cada uma)' : 'DIFERENTES'}`);
    const vp = (await pc.query('select count(*)::int n from vault.secrets')).rows[0].n;
    console.log(`VAULT (extensao exclusiva do Supabase): ${vp} segredo(s) em producao; nao restauravel fora do Supabase (extensao ausente)`);
    // integridade referencial no restaurado: todas as FKs existentes e validadas, sem orfaos
    const fk = (await rc.query("select count(*)::int n, count(*) filter (where not convalidated)::int nv from pg_constraint where contype='f' and connamespace in ('public'::regnamespace,'auth'::regnamespace,'storage'::regnamespace)")).rows[0];
    console.log(`FKs no restaurado: ${fk.n}, nao validadas: ${fk.nv}`);
    await pc.query('ROLLBACK');
  } finally { try { await pc.query('ROLLBACK'); } catch { /* */ } pc.release(); rc.release(); await prod.end(); await rest.end(); }
})().catch((e) => { console.error('ERRO', e.message.slice(0, 300)); process.exit(1); });
