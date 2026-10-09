/** FASE 8C.2 — auditoria SOMENTE LEITURA (BEGIN READ ONLY ... ROLLBACK): categorias x inventario auditado, tabelas de atributos, atividade administrativa. */
const path = require('path'); const fs = require('fs'); const crypto = require('crypto');
const root = 'C:/Users/djata/Desktop/Mercado Nusali';
require(path.join(root, 'node_modules/dotenv')).config({ path: path.join(root, '.env') });
const pg = require(path.join(root, 'node_modules/pg'));
(async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
  const c = await pool.connect(); const out = {};
  try {
    await c.query('BEGIN READ ONLY');
    const q = async (s, p) => (await c.query(s, p)).rows;
    out.readOnly = (await q('show transaction_read_only'))[0].transaction_read_only;
    const inv = JSON.parse(fs.readFileSync(path.join(root, 'docs/attribute-matrix/v1/categories.inventory.raw.json'), 'utf8')).categories;
    const db = await q('select id,name,slug,icon,parent_id,display_order,is_active,commission_rate from categories order by id');
    const norm = (r) => JSON.stringify([r.id, r.name, r.slug, r.parent_id ?? null, Number(r.display_order ?? 0), !!r.is_active, r.commission_rate === null || r.commission_rate === undefined ? null : Number(r.commission_rate)]);
    const A = inv.map(norm).sort(), B = db.map(norm).sort();
    out.categories = { auditadas8A: A.length, producao: B.length, idenicasEmTodosOsCampos: JSON.stringify(A) === JSON.stringify(B), diferentes: A.filter((x) => !B.includes(x)).length + B.filter((x) => !A.includes(x)).length };
    out.categories.hashProducao = crypto.createHash('sha256').update(B.join('\n')).digest('hex').slice(0, 16);
    out.categories.hashAuditado = crypto.createHash('sha256').update(A.join('\n')).digest('hex').slice(0, 16);
    const cnt = async (t, w = '') => (await q(`select count(*)::int n from ${t} ${w}`))[0].n;
    out.attributeTables = { category_attributes: await cnt('category_attributes'), product_attribute_values: await cnt('product_attribute_values'), product_attributes_legado: await cnt('product_attributes'), seedRows: await cnt('category_attributes', "where source='seed'"), idsDaCarga: await cnt('category_attributes', "where id like 'attr_nsl_%'") };
    out.other = { products: await cnt('products'), variants: await cnt('product_variants'), orders: await cnt('orders'), sellers: await cnt('sellers'), users: await cnt('users') };
    const mig = (await q('select count(*)::int n, max(created_at) last from drizzle.__drizzle_migrations'))[0];
    out.migrations = { n: mig.n, lastAt: new Date(Number(mig.last)).toISOString() };
    const al = (await q('select count(*)::int n, max(created_at) last from audit_logs'))[0];
    out.audit_logs = { total: al.n, ultimo: al.last };
    out.auditPorAcaoDesde2026_10_08 = await q("select action, count(*)::int n, max(created_at) ultimo from audit_logs where created_at >= '2026-10-08T00:00:00Z' group by 1 order by 3 desc limit 15");
    out.systemAttributeMatrixRows = await cnt('audit_logs', "where action like 'system.attribute_matrix%'");
    out.platformSettings = (await q('select key, updated_at from platform_settings order by key')).map((r) => `${r.key}@${new Date(r.updated_at).toISOString().slice(0, 16)}`);
    out.activeConnections = (await q("select count(*)::int n from pg_stat_activity where datname=current_database()"))[0].n;
    await c.query('ROLLBACK');
  } finally { try { await c.query('ROLLBACK'); } catch { /* */ } c.release(); await pool.end(); }
  console.log(JSON.stringify(out, null, 1));
})().catch((e) => { console.error('ERRO', e.message); process.exit(1); });
