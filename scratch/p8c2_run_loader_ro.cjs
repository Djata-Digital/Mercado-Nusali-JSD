/** FASE 8C.2 — roda o carregador em modo SOMENTE LEITURA contra a producao (plan/verify/rollback-plan). Nunca imprime a URL. */
const path = require('path'); const cp = require('child_process');
const root = 'C:/Users/djata/Desktop/Mercado Nusali';
require(path.join(root, 'node_modules/dotenv')).config({ path: path.join(root, '.env') });
const cmd = process.argv[2];
if (!['plan', 'verify', 'rollback-plan'].includes(cmd)) { console.error('apenas plan | verify | rollback-plan (somente leitura)'); process.exit(2); }
const r = cp.spawnSync(process.execPath, ['--import', 'tsx', 'scripts/attribute-matrix/load.ts', cmd, '--allow-remote-read', ...process.argv.slice(3)], { cwd: root, env: { ...process.env, ATTR_LOAD_DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: 'test' }, encoding: 'utf8', maxBuffer: 1 << 26 });
process.stdout.write((r.stdout || '') + (r.stderr ? '\n[stderr] ' + r.stderr.slice(-600) : ''));
process.exit(r.status ?? 1);
