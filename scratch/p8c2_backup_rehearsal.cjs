/** FASE 8C.2 — ensaio de BACKUP (pg_dump somente leitura de tabelas nao pessoais) e RESTAURACAO em banco descartavel. Nunca imprime a URL. */
const path = require('path'); const cp = require('child_process'); const fs = require('fs');
const root = 'C:/Users/djata/Desktop/Mercado Nusali';
require(path.join(root, 'node_modules/dotenv')).config({ path: path.join(root, '.env') });
const tables = ['categories', 'category_attributes', 'product_attribute_values', 'product_attributes', 'platform_settings'];
const args = tables.flatMap((t) => ['-t', `public.${t}`]);
const sh = `pg_dump "$PGURL" --no-owner --no-privileges --data-only --column-inserts ${args.join(' ')} > /tmp/p8c2_data.sql && pg_dump "$PGURL" --no-owner --no-privileges --schema-only ${args.join(' ')} > /tmp/p8c2_schema.sql && wc -c /tmp/p8c2_data.sql /tmp/p8c2_schema.sql`;
const r = cp.spawnSync('docker', ['exec', '-e', 'PGURL', 'nusali-pg17-restore', 'sh', '-c', sh], { env: { ...process.env, PGURL: process.env.DATABASE_URL }, encoding: 'utf8' });
console.log((r.stdout || '').trim()); if (r.status !== 0) { console.log('[stderr]', String(r.stderr).replace(/postgres(ql)?:\/\/\S+/g, '<url>').slice(-500)); process.exit(1); }
for (const f of ['p8c2_data.sql', 'p8c2_schema.sql']) cp.execSync(`docker cp nusali-pg17-restore:/tmp/${f} scratch/_backup/${f}`);
console.log('copiado para scratch/_backup (ignorado pelo git)');
