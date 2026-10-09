/** FASE 8C.1 — auditoria SOMENTE LEITURA da producao (BEGIN READ ONLY ... ROLLBACK). Nunca imprime segredos nem valores de variaveis. */
const path = require('path'); const fs = require('fs');
const root = 'C:/Users/djata/Desktop/Mercado Nusali';
require(path.join(root, 'node_modules/dotenv')).config({ path: path.join(root, '.env') });
const pg = require(path.join(root, 'node_modules/pg'));
(async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
  const c = await pool.connect();
  const out = {};
  try {
    await c.query('BEGIN READ ONLY');
    const one = async (s, p) => (await c.query(s, p)).rows;
    out.server = (await one('select version() v'))[0].v.split(' ').slice(0, 2).join(' ');
    out.readOnlySession = (await one('show transaction_read_only'))[0].transaction_read_only;
    const mig = await one('select count(*)::int n, max(created_at) last from drizzle.__drizzle_migrations');
    out.migrations = { applied: mig[0].n, lastAt: new Date(Number(mig[0].last)).toISOString() };
    const journal = JSON.parse(fs.readFileSync(path.join(root, 'drizzle/meta/_journal.json'), 'utf8'));
    out.repoJournal = { entries: journal.entries.length, last: journal.entries[journal.entries.length - 1].tag };
    out.categories = (await one('select count(*)::int total, count(*) filter (where parent_id is null)::int principais, count(*) filter (where parent_id is not null)::int subs, count(*) filter (where is_active)::int ativas, count(commission_rate)::int com_taxa from categories'))[0];
    const cols = async (t) => (await one('select column_name from information_schema.columns where table_name=$1 order by ordinal_position', [t])).map((r) => r.column_name);
    const need = {
      category_attributes: ['id', 'category_id', 'name', 'code', 'type', 'role', 'is_required', 'options_json', 'unit', 'sort_order', 'is_active', 'min_value', 'max_value', 'max_length', 'decimals', 'is_filterable', 'display_group', 'overrides_id', 'source', 'admin_modified_at', 'placeholder', 'help_text'],
      product_attribute_values: ['id', 'product_id', 'attribute_id', 'attribute_code', 'value_text', 'value_number', 'value_bool', 'option_value'],
      product_variants: ['id', 'product_id', 'sku', 'is_active', 'variant_key', 'color', 'size', 'capacity', 'attributes_json', 'price'],
      inventory: ['id', 'product_id', 'variant_id', 'quantity_on_hand', 'quantity_reserved', 'location_type', 'fulfillment_location_id'],
      inventory_movements: ['id', 'inventory_id', 'product_id', 'variant_id', 'type', 'quantity', 'reason', 'performed_by'],
      stock_reservations: ['id', 'order_id', 'inventory_id', 'product_id', 'variant_id', 'quantity', 'status', 'expires_at'],
      order_items: ['id', 'order_id', 'product_id', 'variant_id', 'inventory_id', 'quantity', 'status'],
      audit_logs: ['id', 'actor_user_id', 'action', 'resource', 'resource_id', 'details_json'],
    };
    out.schemaMissingColumns = {};
    for (const [t, list] of Object.entries(need)) { const have = await cols(t); const miss = list.filter((x) => !have.includes(x)); if (miss.length) out.schemaMissingColumns[t] = miss; }
    out.schemaCompatible = Object.keys(out.schemaMissingColumns).length === 0;
    out.sourceCheck = (await one("select pg_get_constraintdef(oid) d from pg_constraint where conname='category_attributes_source_check'"))[0]?.d ?? null;
    out.valueConstraints = (await one("select conname from pg_constraint where conrelid='product_attribute_values'::regclass order by 1")).map((r) => r.conname);
    out.valueIndexes = (await one("select indexname from pg_indexes where tablename='product_attribute_values' order by 1")).map((r) => r.indexname);
    out.counts = {};
    for (const t of ['products', 'product_variants', 'inventory', 'inventory_movements', 'stock_reservations', 'orders', 'order_items', 'sellers', 'stores', 'category_attributes', 'product_attribute_values', 'audit_logs']) out.counts[t] = (await one(`select count(*)::int n from ${t}`))[0].n;
    out.platformSettingKeys = (await one('select key from platform_settings order by 1')).map((r) => r.key);
    out.commission = { defaultSellerCommissionPercent: out.platformSettingKeys.includes('defaultSellerCommissionPercent') ? 'configurado' : 'AUSENTE', sellersComTaxa: (await one('select count(commission_rate)::int n from sellers'))[0].n, categoriasComTaxa: out.categories.com_taxa };
    out.dupSlugs = (await one('select count(*)::int n from (select slug from categories group by slug having count(*)>1) x'))[0].n;
    await c.query('ROLLBACK');
  } finally { try { await c.query('ROLLBACK'); } catch { /* */ } c.release(); await pool.end(); }
  console.log(JSON.stringify(out, null, 1));
})().catch((e) => { console.error('ERRO', e.message); process.exit(1); });
