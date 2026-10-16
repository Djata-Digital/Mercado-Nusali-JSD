/**
 * PROTEÇÃO CONTRA TESTE EM BANCO REAL (incidente 2026-10-16). Sem banco: tudo é função pura ou subprocesso que RECUSA antes de conectar.
 *   A) classificador (TS) + paridade com o espelho CJS    B) detecção de "processo de teste"   C) assertDatabaseAllowedForProcess
 *   D) getDbPool/getDb recusam em subprocesso (por caminho do script e por NUSALI_TEST_RUN)   E) preload: nenhuma conexão pg fora do banco validado
 *   F) executor with-test-env.cjs: aborta antes de rodar o comando   G) guarda dos testes trava o ambiente   H) auditoria estática (nada pode regredir)
 * Nenhum teste aqui abre conexão de rede com banco algum.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import {
  classifyTestDatabaseUrl, isTestProcess, assertDatabaseAllowedForProcess, TestDatabaseSafetyError, PRODUCTION_FROM_SCRIPT_TOKEN, parseDatabaseUrl,
} from '../src/db/testDatabaseSafety.js';
import { checkLedgerTestDatabaseGuard } from './support/ledgerTestDbGuard.js';

const require = createRequire(import.meta.url);
const lib = require('../scripts/lib/testDbSafety.cjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tsx = path.join(root, 'node_modules/tsx/dist/cli.mjs');
let pass = 0, fail = 0;
const report = (l: string, ok: boolean, d?: any) => { if (ok) pass++; else fail++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 600)}`); };
const src = (p: string) => fs.readFileSync(path.join(root, p), 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const PROD = 'postgresql://postgres.abc:secret@aws-0-sa-east-1.pooler.supabase.com:5432/postgres';
const LOCAL = 'postgres://postgres:postgres@localhost:55434/rt_db';
const cleanEnv = (extra: Record<string, string | undefined> = {}) => {
  const e: Record<string, string | undefined> = { ...process.env, ...extra };
  for (const k of ['NUSALI_TEST_RUN', 'NUSALI_TEST_DB_ALLOWED_URL', 'NUSALI_ALLOW_PRODUCTION_DB_FROM_SCRIPT', 'NODE_OPTIONS', 'LEDGER_TEST_DATABASE_URL', 'DATABASE_URL', 'PRODUCTION_DATABASE_URL']) if (!(k in extra)) delete e[k];
  e.SKIP_RUNTIME_ALIGN = 'true';
  return e as NodeJS.ProcessEnv;
};
const run = (args: string[], env: NodeJS.ProcessEnv) => spawnSync(process.execPath, args, { env, encoding: 'utf8', cwd: root, timeout: 60000 });

// ---------------- A) classificador
const cases: Array<[string, string | undefined, Record<string, string>, boolean]> = [
  ['local + nome descartável (rt_db)', LOCAL, {}, true],
  ['127.0.0.1 + phase3_it', 'postgres://u:p@127.0.0.1:55434/phase3_it', {}, true],
  ['incident_rehearsal', 'postgres://u:p@localhost:55434/incident_rehearsal', {}, true],
  ['IPv6 loopback', 'postgres://u:p@[::1]:5432/test_db1', {}, true],
  ['URL de PRODUÇÃO (Supabase)', PROD, {}, false],
  ['host remoto qualquer, nome descartável', 'postgres://u:p@db.example.com:5432/rt_db', {}, false],
  ['local mas banco "postgres" (padrão)', 'postgres://u:p@localhost:5432/postgres', {}, false],
  ['local mas cópia de restauração p8d_restore', 'postgres://u:p@localhost:55434/p8d_restore', {}, false],
  ['local mas nome que não parece descartável', 'postgres://u:p@localhost:55434/mercado_nusali', {}, false],
  ['URL vazia / indefinida', undefined, {}, false],
  ['URL inválida', 'isto-nao-e-url', {}, false],
  ['protocolo errado (http)', 'http://localhost/rt_db', {}, false],
  ['coincide com DATABASE_URL local de produção', LOCAL, { DATABASE_URL: LOCAL }, false],
  ['coincide com PRODUCTION_DATABASE_URL', LOCAL, { PRODUCTION_DATABASE_URL: LOCAL }, false],
  ['nome extra permitido explicitamente', 'postgres://u:p@localhost:55434/matrix8a', { NUSALI_EXTRA_DISPOSABLE_DB_NAMES: 'matrix8a' }, true],
  ['nome protegido adicional via env', 'postgres://u:p@localhost:55434/rt_keep', { NUSALI_PROTECTED_DB_NAMES: 'rt_keep' }, false],
  ['localhost mas porta/banco de prod espelhados em outra var', LOCAL, { DIRECT_URL: LOCAL }, false],
];
for (const [label, url, env, want] of cases) {
  const ts = classifyTestDatabaseUrl(url, env).status === 'OK';
  const cjs = lib.classifyTestDatabaseUrl(url, env).status === 'OK';
  report(`A  ${want ? 'aceita' : 'RECUSA'}: ${label} (TS e espelho CJS decidem igual)`, ts === want && cjs === want, { ts, cjs });
}
report('A  parse: porta padrão, banco com %-escape e usuário/senha não vazam para o resultado', (() => { const p = parseDatabaseUrl('postgres://us:pw@LOCALHOST/rt_db%5F1'); return !!p && p.host === 'localhost' && p.port === '5432' && p.database === 'rt_db_1' && !JSON.stringify(p).includes('pw'); })());
report('A  endereço do servidor: loopback/Docker privado aceitos; IP público recusado', lib.isLocalServerAddress('172.17.0.2/32') && lib.isLocalServerAddress('127.0.0.1') && lib.isLocalServerAddress('::1') && lib.isLocalServerAddress(null) && !lib.isLocalServerAddress('52.20.30.40') && !lib.isLocalServerAddress('2600:1f18::1'));

// ---------------- B) processo de teste
const procCases: Array<[string, string | undefined, Record<string, string>, boolean]> = [
  ['script em scratch/', 'C:\\app\\scratch\\x.ts', {}, true], ['script em tests/', '/app/tests/a.test.ts', {}, true], ['arquivo test-*.ts fora de scratch/tests', '/app/scripts/test-asaas-pix.ts', {}, true],
  ['*.test.ts', '/app/src/x.test.ts', {}, true], ['NUSALI_TEST_RUN=1', '/app/dist/server.cjs', { NUSALI_TEST_RUN: '1' }, true],
  ['servidor de produção (dist/server.cjs)', '/opt/render/project/src/dist/server.cjs', {}, false], ['server.ts', '/app/server.ts', {}, false], ['script operacional em scripts/', '/app/scripts/run-escrow-auto-release.ts', {}, false], ['sem argv', undefined, {}, false],
];
for (const [label, argv1, env, want] of procCases) report(`B  ${want ? 'é processo de teste' : 'NÃO é processo de teste'}: ${label}`, isTestProcess(argv1, env) === want);

// ---------------- C) assertDatabaseAllowedForProcess
const throws = (fn: () => void) => { try { fn(); return null; } catch (e: any) { return e; } };
const e1 = throws(() => assertDatabaseAllowedForProcess(PROD, {}, '/app/scratch/test-x.ts'));
report('C  teste + URL de produção => lança TestDatabaseSafetyError (código TEST_DB_SAFETY) e explica o que fazer', e1 instanceof TestDatabaseSafetyError && e1.code === 'TEST_DB_SAFETY' && /with-test-env/.test(e1.message), e1?.message);
report('C  teste + banco descartável local => passa', throws(() => assertDatabaseAllowedForProcess(LOCAL, {}, '/app/tests/a.test.ts')) === null);
report('C  servidor de produção + URL de produção => INERTE (não interfere com o app real)', throws(() => assertDatabaseAllowedForProcess(PROD, {}, '/opt/render/project/src/dist/server.cjs')) === null);
report('C  teste sem URL => lança (nunca presume)', throws(() => assertDatabaseAllowedForProcess(undefined, {}, '/app/scratch/test-x.ts')) instanceof TestDatabaseSafetyError);
report('C  script operacional que declara o token exato => permitido (com aviso), qualquer outro valor => recusado', (() => {
  const w = console.warn; let warned = false; console.warn = () => { warned = true; };
  try { const ok = throws(() => assertDatabaseAllowedForProcess(PROD, { NUSALI_ALLOW_PRODUCTION_DB_FROM_SCRIPT: PRODUCTION_FROM_SCRIPT_TOKEN }, '/app/scratch/apply-migration.ts')) === null && warned; const bad = throws(() => assertDatabaseAllowedForProcess(PROD, { NUSALI_ALLOW_PRODUCTION_DB_FROM_SCRIPT: 'sim' }, '/app/scratch/apply-migration.ts')) instanceof TestDatabaseSafetyError; return ok && bad; } finally { console.warn = w; }
})());
report('C  com NUSALI_TEST_RUN=1 o token NÃO vale (teste nunca toca banco real, nem declarando)', throws(() => assertDatabaseAllowedForProcess(PROD, { NUSALI_TEST_RUN: '1', NUSALI_ALLOW_PRODUCTION_DB_FROM_SCRIPT: PRODUCTION_FROM_SCRIPT_TOKEN }, '/app/scratch/x.ts')) instanceof TestDatabaseSafetyError);

// ---------------- D) getDb recusa em subprocesso REAL (antes de criar o pool)
const probe = path.join(root, 'tests/support/probeGetDb.ts');
const d1 = run([tsx, probe], cleanEnv({ DATABASE_URL: PROD }));
report('D  getDb(): script em tests/ com DATABASE_URL de produção => REFUSED:TEST_DB_SAFETY, pool NÃO criado (decisão pelo CAMINHO do script, sem variável)', /REFUSED:TEST_DB_SAFETY/.test(d1.stdout) && !/POOL_CREATED/.test(d1.stdout), { out: d1.stdout, err: d1.stderr.slice(0, 200) });
const d2 = run([tsx, probe], cleanEnv({ DATABASE_URL: PROD, NUSALI_TEST_RUN: '1' }));
report('D  getDb(): NUSALI_TEST_RUN=1 + produção => recusado', /REFUSED:TEST_DB_SAFETY/.test(d2.stdout));
const d3 = run([tsx, probe], cleanEnv({ DATABASE_URL: LOCAL }));
report('D  getDb(): banco descartável local => pool criado (a proteção não atrapalha o uso legítimo)', /POOL_CREATED/.test(d3.stdout), d3.stdout + d3.stderr.slice(0, 200));
const d4 = run([tsx, probe], cleanEnv({ DATABASE_URL: 'postgres://u:p@localhost:5432/postgres' }));
report('D  getDb(): localhost mas banco "postgres" => recusado', /REFUSED:TEST_DB_SAFETY/.test(d4.stdout));

// ---------------- E) preload bloqueia conexão pg direta
const preload = path.join(root, 'scripts/test-db-guard-preload.cjs');
const pgProbe = (code: string, env: NodeJS.ProcessEnv) => run(['--require', preload, '-e', code], env);
const remote = `const pg=require('pg');new pg.Client({host:'aws-0-sa-east-1.pooler.supabase.com',port:5432,database:'postgres',user:'u',password:'p'}).connect().then(()=>console.log('CONNECTED'),e=>console.log('REFUSED:'+e.code));`;
const envE = cleanEnv({ NUSALI_TEST_RUN: '1', NUSALI_TEST_DB_ALLOWED_URL: 'postgres://u:p@localhost:1/rt_db' });
const e2 = pgProbe(remote, envE);
report('E  pg.Client direto para a produção => recusado ANTES de qualquer rede (TEST_DB_SAFETY)', /REFUSED:TEST_DB_SAFETY/.test(e2.stdout) && !/CONNECTED/.test(e2.stdout), e2.stdout + e2.stderr.slice(0, 200));
const poolCode = `const pg=require('pg');const p=new pg.Pool({connectionString:${JSON.stringify(PROD)}});p.query('select 1').then(()=>console.log('QUERIED'),e=>console.log('REFUSED:'+e.code));`;
const e3 = pgProbe(poolCode, envE);
report('E  pg.Pool(connectionString de produção).query => recusado (cobre os testes que abrem Pool direto com process.env)', /REFUSED:TEST_DB_SAFETY/.test(e3.stdout) && !/QUERIED/.test(e3.stdout), e3.stdout + e3.stderr.slice(0, 200));
const e4 = pgProbe(`const pg=require('pg');new pg.Client({host:'localhost',port:1,database:'otherdb',user:'u',password:'p'}).connect().then(()=>console.log('CONNECTED'),e=>console.log('REFUSED:'+e.code));`, envE);
report('E  mesmo em localhost, OUTRO banco que não o validado => recusado', /REFUSED:TEST_DB_SAFETY/.test(e4.stdout), e4.stdout);
const e5 = pgProbe(`const pg=require('pg');new pg.Client({host:'localhost',port:1,database:'rt_db',user:'u',password:'p'}).connect().then(()=>console.log('CONNECTED'),e=>console.log('NETERR:'+e.code));`, envE);
report('E  o banco validado passa pela proteção (chega à camada de rede: ECONNREFUSED, não TEST_DB_SAFETY)', /NETERR:ECONNREFUSED/.test(e5.stdout), e5.stdout + e5.stderr.slice(0, 200));
const e6 = pgProbe(remote, cleanEnv());
report('E  sem NUSALI_TEST_RUN o preload é inerte (não interfere em processos que não são de teste)', !/REFUSED:TEST_DB_SAFETY/.test(e6.stdout));

// ---------------- F) executor with-test-env.cjs aborta ANTES de rodar o comando
const wrapper = path.join(root, 'scripts/with-test-env.cjs');
const runWrapper = (env: NodeJS.ProcessEnv) => run([wrapper, '--no-connect', 'node', 'tests/support/printLockedEnv.cjs'], env);
const f1 = runWrapper(cleanEnv());
report('F  sem LEDGER_TEST_DATABASE_URL => exit 78 e o comando NÃO roda (nunca cai para DATABASE_URL)', f1.status === 78 && !/RAN/.test(f1.stdout), { s: f1.status, o: f1.stdout });
const f2 = runWrapper(cleanEnv({ LEDGER_TEST_DATABASE_URL: PROD }));
report('F  URL de produção em LEDGER_TEST_DATABASE_URL => exit 78, comando NÃO roda', f2.status === 78 && !/RAN/.test(f2.stdout), { s: f2.status });
const f3 = runWrapper(cleanEnv({ LEDGER_TEST_DATABASE_URL: 'postgres://u:p@localhost:5432/postgres' }));
report('F  banco "postgres" local (não descartável) => exit 78', f3.status === 78 && !/RAN/.test(f3.stdout));
const f4 = runWrapper(cleanEnv({ LEDGER_TEST_DATABASE_URL: LOCAL, PRODUCTION_DATABASE_URL: LOCAL }));
report('F  mesma URL declarada como produção => exit 78', f4.status === 78 && !/RAN/.test(f4.stdout));
const f5 = runWrapper(cleanEnv({ LEDGER_TEST_DATABASE_URL: LOCAL, DATABASE_URL: PROD, PRODUCTION_DATABASE_URL: PROD, REDIS_URL: 'redis://prod' }));
report('F  URL válida: o comando roda com o ambiente TRAVADO — DATABASE_URL = banco de teste (a de produção do .env é sobrescrita), PRODUCTION_DATABASE_URL e REDIS_URL zerados, NUSALI_TEST_RUN=1', f5.status === 0 && f5.stdout.trim() === `RAN ${LOCAL}|||1|test`, { s: f5.status, o: f5.stdout, e: f5.stderr.slice(0, 200) });

// ---------------- G) guarda dos testes
const g1 = checkLedgerTestDatabaseGuard({ LEDGER_TEST_DATABASE_URL: PROD, DATABASE_URL: LOCAL });
report('G  checkLedgerTestDatabaseGuard recusa URL de produção mesmo quando diferente de DATABASE_URL (era a lacuna do incidente)', g1.status === 'REJECTED', g1);
report('G  e aceita o banco descartável', checkLedgerTestDatabaseGuard({ LEDGER_TEST_DATABASE_URL: LOCAL, DATABASE_URL: PROD }).status === 'OK');
const g2 = run([tsx, path.join(root, 'tests/support/probeGuardEnv.ts')], cleanEnv({ LEDGER_TEST_DATABASE_URL: LOCAL, DATABASE_URL: PROD, PRODUCTION_DATABASE_URL: PROD }));
let g2o: any = null; try { g2o = JSON.parse(g2.stdout.trim().split('\n').pop() || '{}'); } catch {}
report('G  assertLedgerTestDatabaseGuard() TRAVA o ambiente: DATABASE_URL passa a ser o banco de teste (antes ficava a do .env), produção zerada, NUSALI_TEST_RUN=1', g2o?.db === LOCAL && g2o?.prod === '' && g2o?.redis === '' && g2o?.t === '1', { g2o, err: g2.stderr.slice(0, 200) });

// ---------------- H) auditoria estática (impede regressão)
const indexTs = src('src/db/index.ts');
const posAssert = indexTs.indexOf('assertDatabaseAllowedForProcess(connectionString');
const posPool = indexTs.indexOf('new Pool(');
const fnStart = indexTs.indexOf('export function getDbPool');
report('H  src/db/index.ts chama assertDatabaseAllowedForProcess ANTES de criar o Pool e FORA do try que engole erros', fnStart >= 0 && posAssert > fnStart && posPool > posAssert && !indexTs.slice(fnStart, posAssert).includes('try {'));
const pkg = JSON.parse(src('package.json'));
const dbScripts = Object.entries<string>(pkg.scripts).filter(([k, v]) => /^test:/.test(k) && /ledger|variant-stock|db-safety/.test(k) && /tsx tests\//.test(v) && !/test:mobile|db-safety/.test(k));
report('H  todo script npm `test:*` que usa banco roda pelo executor seguro (with-test-env.cjs)', dbScripts.length >= 3 && dbScripts.every(([, v]) => v.split('&&').filter((x) => /tsx tests\//.test(x)).every((x) => /with-test-env\.cjs/.test(x))), dbScripts);
const testFiles = fs.readdirSync(path.join(root, 'tests')).filter((f) => /\.test\.ts$/.test(f));
const usesDb = testFiles.filter((f) => /getDb\(|new pg\.Pool|new Pool\(|setupCheckoutKit/.test(src('tests/' + f)));
const unguarded = usesDb.filter((f) => !/support\/(ledgerTestDbGuard|ledgerE1Env)/.test(src('tests/' + f)));
report('H  todo teste versionado em tests/ que toca banco importa o guarda/ambiente travado', unguarded.length === 0, unguarded);
report('H  a lista de nomes protegidos contém o banco padrão e as cópias de restauração de produção', ['postgres', 'p8d_restore', 'phase1_restore'].every((n) => src('src/db/testDatabaseSafety.ts').includes(`'${n}'`)));

console.log(`\nRESULTADO: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
