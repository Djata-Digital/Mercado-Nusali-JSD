/** FASE 8C.2 — monitor SOMENTE LEITURA para acompanhar uma carga futura: linhas seed, audit_logs da carga, saude e 5xx. Uso: node scratch/p8c2_monitor.cjs [--loop 20] */
const path = require('path'); const root = 'C:/Users/djata/Desktop/Mercado Nusali';
require(path.join(root, 'node_modules/dotenv')).config({ path: path.join(root, '.env') });
const pg = require(path.join(root, 'node_modules/pg'));
const loop = process.argv.includes('--loop') ? Number(process.argv[process.argv.indexOf('--loop') + 1]) : 0;
const snap = async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
  const c = await pool.connect(); let o = {};
  try {
    await c.query('BEGIN READ ONLY');
    const n = async (s) => (await c.query(s)).rows[0].n;
    o = {
      ts: new Date().toISOString().slice(11, 19),
      seed: await n("select count(*)::int n from category_attributes where source='seed'"),
      admin: await n("select count(*)::int n from category_attributes where source='admin'"),
      overrides: await n('select count(*)::int n from category_attributes where overrides_id is not null'),
      valoresDeProduto: await n('select count(*)::int n from product_attribute_values'),
      produtos: await n('select count(*)::int n from products'),
      lotesAuditados: await n("select count(*)::int n from audit_logs where action='system.attribute_matrix.batch_applied'"),
      categorias: await n('select count(*)::int n from categories'),
      migracoes: await n('select count(*)::int n from drizzle.__drizzle_migrations'),
    };
    await c.query('ROLLBACK');
  } finally { try { await c.query('ROLLBACK'); } catch { /* */ } c.release(); await pool.end(); }
  let bad = 0;
  for (const p of ['/', '/api/health', '/api/categories']) { try { const r = await fetch('https://mercado.nusali.com' + p); if (r.status >= 500) bad++; o['http' + p] = r.status; } catch { bad++; o['http' + p] = 'erro'; } }
  o.erros5xx = bad;
  console.log(JSON.stringify(o));
};
(async () => { await snap(); for (let i = 0; i < loop; i++) { await new Promise((r) => setTimeout(r, 30000)); await snap(); } })().catch((e) => { console.error('ERRO', e.message); process.exit(1); });
