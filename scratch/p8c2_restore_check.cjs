const cp = require('child_process'); const path = require('path'); const crypto = require('crypto');
const root = 'C:/Users/djata/Desktop/Mercado Nusali';
const pg = require(path.join(root, 'node_modules/pg'));
const sh = (c) => cp.execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const DB = 'p8c2_restore';
sh(`docker exec nusali-pg17-restore psql -U postgres -c "DROP DATABASE IF EXISTS ${DB}" -c "CREATE DATABASE ${DB} TEMPLATE phase3_tmpl"`);
sh(`docker cp scratch/_backup/p8c2_data.sql nusali-pg17-restore:/tmp/p8c2_data.sql`);
const psql = (sql) => sh(`docker exec nusali-pg17-restore psql -U postgres -d ${DB} -v ON_ERROR_STOP=1 -c "${sql}"`);
const url = `postgres://postgres:postgres@localhost:55434/${DB}`;
(async () => {
  const pool = new pg.Pool({ connectionString: url, max: 2 }); const q = async (s) => (await pool.query(s)).rows;
  const state = async () => {
    const cats = await q('select id,name,slug,parent_id,display_order,is_active,commission_rate from categories order by id');
    const norm = (r) => JSON.stringify([r.id, r.name, r.slug, r.parent_id ?? null, Number(r.display_order ?? 0), !!r.is_active, r.commission_rate === null ? null : Number(r.commission_rate)]);
    return { categories: cats.length, hash: crypto.createHash('sha256').update(cats.map(norm).sort().join('\n')).digest('hex').slice(0, 16), attrs: (await q('select count(*)::int n from category_attributes'))[0].n, values: (await q('select count(*)::int n from product_attribute_values'))[0].n, settings: (await q('select count(*)::int n from platform_settings'))[0].n };
  };
  // 1. restaura os dados do backup em um banco com o mesmo esquema
  psql('TRUNCATE categories, category_attributes, product_attribute_values, product_attributes, platform_settings CASCADE');
  sh(`docker exec nusali-pg17-restore sh -c "(echo 'SET session_replication_role = replica;'; cat /tmp/p8c2_data.sql) > /tmp/p8c2_restore.sql"`); sh(`docker exec nusali-pg17-restore psql -U postgres -d ${DB} -v ON_ERROR_STOP=1 -q -f /tmp/p8c2_restore.sql`);
  const restored = await state(); console.log('restaurado do backup:', JSON.stringify(restored));
  // 2. o plano (dry-run) do carregador sobre a copia restaurada
  const plan = cp.spawnSync(process.execPath, ['--import', 'tsx', 'scripts/attribute-matrix/load.ts', 'plan'], { cwd: root, env: { ...process.env, ATTR_LOAD_DATABASE_URL: url, NODE_ENV: 'test' }, encoding: 'utf8' });
  const pj = JSON.parse(plan.stdout); console.log('plan na copia restaurada:', pj.ok, JSON.stringify(pj.preflight.state), pj.matrixHash.slice(0, 12));
  // 3. simula a carga na copia e a RESTAURACAO depois dela
  const phrase = pj.result.confirmPhrase;
  const ap = cp.spawnSync(process.execPath, ['--import', 'tsx', 'scripts/attribute-matrix/load.ts', 'apply', '--expect-hash', pj.matrixHash, '--confirm', phrase, '--journal', 'attribute-matrix-journal/rehearsal-restore.jsonl'], { cwd: root, env: { ...process.env, ATTR_LOAD_DATABASE_URL: url, NODE_ENV: 'test' }, encoding: 'utf8' });
  const aj = JSON.parse(ap.stdout); console.log('carga ensaiada na copia:', aj.ok, JSON.stringify({ created: aj.result?.created, verify: aj.result?.verify }));
  const afterLoad = await state(); console.log('apos a carga:', JSON.stringify(afterLoad));
  psql('TRUNCATE categories, category_attributes, product_attribute_values, product_attributes, platform_settings CASCADE');
  sh(`docker exec nusali-pg17-restore sh -c "(echo 'SET session_replication_role = replica;'; cat /tmp/p8c2_data.sql) > /tmp/p8c2_restore.sql"`); sh(`docker exec nusali-pg17-restore psql -U postgres -d ${DB} -v ON_ERROR_STOP=1 -q -f /tmp/p8c2_restore.sql`);
  const afterRestore = await state(); console.log('apos restaurar o backup:', JSON.stringify(afterRestore));
  console.log('RESTAURACAO VERIFICADA:', JSON.stringify(afterRestore) === JSON.stringify(restored) && afterLoad.attrs === 847 && afterRestore.attrs === 0 && restored.hash === '84b8920494d4367f');
  await pool.end();
  sh(`docker exec nusali-pg17-restore psql -U postgres -c "DROP DATABASE IF EXISTS ${DB}"`);
})().catch((e) => { console.error('ERRO', e.message.slice(0, 400)); process.exit(1); });
