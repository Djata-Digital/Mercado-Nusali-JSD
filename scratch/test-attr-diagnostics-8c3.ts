/**
 * FASE 8C.3 — diagnostico SEGURO de falhas do pre-voo (safeError.ts + sonda de conexao do carregador). Cada falha precisa mostrar a causa
 * real (SQLSTATE / rede / mensagem do pooler) sem expor senha, URL nem parametros. PostgreSQL 17 DESCARTAVEL. Nunca producao.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import pg from 'pg';
import { describeError, errorChain, redact, secretsFromUrl } from '../scripts/attribute-matrix/safeError.js';
import { LIMITED_WRITER_ROLE, createRoleSql } from '../scripts/attribute-matrix/limitedWriter.js';

let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: unknown) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 600)}`); };

// ---- A. puro
const drizzleLike = (cause: any) => Object.assign(new Error('Failed query: SELECT column_name\nFROM information_schema.columns\nWHERE table_name = \'category_attributes\'\nparams: '), { cause });
const pgErr = (code: string, message: string, extra: any = {}) => Object.assign(new Error(message), { code, severity: 'FATAL', ...extra });
const SECRET = 'S3nh@:/#segredo';
const url = `postgresql://attr_loader_8c3.abcdefghijkl:${encodeURIComponent(SECRET)}@aws-1-eu-west-3.pooler.supabase.com:5432/postgres`;
const sec = secretsFromUrl(url);
const d1 = describeError(drizzleLike(pgErr('28P01', 'password authentication failed for user "attr_loader_8c3.abcdefghijkl"')), sec);
report('A1 a causa escondida atras de "Failed query" aparece (SQLSTATE 28P01, mensagem e dica) e os params da consulta nao vazam', /[28P01]/.test(d1) && /password authentication failed/.test(d1) && /dica: Senha recusada/.test(d1) && !/params:/.test(d1), d1);
report('A2 o sufixo do projeto do pooler e mascarado (attr_loader_8c3.<ref>), a senha e a URL nunca aparecem', !d1.includes('abcdefghijkl') && !d1.includes(SECRET) && !d1.includes(encodeURIComponent(SECRET)) && /attr_loader_8c3\.<ref>/.test(d1), d1);
const d2 = describeError(drizzleLike(pgErr('XX000', 'Tenant or user not found')), sec);
report('A3 "Tenant or user not found" do pooler vira dica sobre o formato do usuario (papel.<ref>)', /Tenant or user not found/.test(d2) && /attr_loader_8c3\.<ref-do-projeto>/.test(d2), d2);
const agg: any = new AggregateError([Object.assign(new Error('connect ECONNREFUSED 10.1.2.3:5432'), { code: 'ECONNREFUSED', syscall: 'connect', address: '10.1.2.3', port: 5432 })], 'rede');
const d3 = describeError(agg, sec);
report('A4 AggregateError de rede: ECONNREFUSED com dica e IP parcialmente mascarado', /\[ECONNREFUSED\]/.test(d3) && /Falha de rede/.test(d3) && !d3.includes('10.1.2.3'), d3);
report('A5 erro simples sem causa: so a primeira linha; mensagem com URL/senha embutidas e redigida', (() => { const e = new Error(`falhou ${url} senha=abc123 e ${SECRET}`); const t = describeError(e, sec); return !t.includes(SECRET) && !t.includes('abc123') && !t.includes('aws-1-eu-west-3') ; })());
report('A6 errorChain segue cause ate o fim sem laco infinito', (() => { const a: any = new Error('a'); const b: any = new Error('b'); a.cause = b; b.cause = a; return errorChain(a).length === 2; })());
report('A7 redact oculta postgres:// em qualquer texto', !redact('x postgres://u:p@h:5432/db y').includes('u:p@'));

// ---- B. CLI real contra falhas reais
const HOST = 'localhost:55434', DB = 'p8c3_diag', PASS = 'Senha!de:teste/8c3#longa';
const encPass = encodeURIComponent(PASS);
const mk = (u: string, pw: string, db = DB, host = HOST) => `postgresql://${u}:${encodeURIComponent(pw)}@${host}/${db}`;
function cli(urlEnv: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, ATTR_LOAD_DATABASE_URL: urlEnv, ATTR_LOAD_FORCE_REMOTE_RULES: '1', NODE_ENV: 'test' };
  const r = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/attribute-matrix/load.ts', 'plan', '--allow-remote-read'], { env, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 300000 });
  const out = (r.stdout || '') + (r.stderr || '');
  let json: any = null; try { json = JSON.parse((r.stdout || r.stderr).slice((r.stdout || r.stderr).indexOf('{'))); } catch { /* */ }
  return { code: r.status, json, out, why: String(json?.stoppedBecause ?? json?.refused ?? '') };
}
const leaks = (o: string, extra: string[] = []) => [PASS, encPass, 'postgresql://', 'postgres://attr', ...extra].filter((s) => o.includes(s));

async function main() {
  const admin = new pg.Pool({ connectionString: 'postgres://postgres:postgres@localhost:55434/postgres', max: 1 });
  await admin.query(`DROP DATABASE IF EXISTS ${DB}`); await admin.query(`CREATE DATABASE ${DB} TEMPLATE phase3_tmpl`);
  await admin.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${LIMITED_WRITER_ROLE}') THEN EXECUTE 'DROP OWNED BY ${LIMITED_WRITER_ROLE}'; EXECUTE 'DROP ROLE ${LIMITED_WRITER_ROLE}'; END IF; END $$;`).catch(() => undefined);
  const su = new pg.Pool({ connectionString: `postgres://postgres:postgres@${HOST}/${DB}`, max: 1 });
  const inv = JSON.parse(fs.readFileSync('docs/attribute-matrix/v1/categories.inventory.raw.json', 'utf8'));
  for (const c of inv.categories.filter((x: any) => !x.parent_id)) await su.query('INSERT INTO categories (id,name,slug,icon,display_order,is_active,created_at) VALUES ($1,$2,$3,$4,$5,$6,now())', [c.id, c.name, c.slug, c.icon, c.display_order ?? 0, c.is_active]);
  for (const c of inv.categories.filter((x: any) => x.parent_id)) await su.query('INSERT INTO categories (id,name,slug,icon,parent_id,display_order,is_active,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now())', [c.id, c.name, c.slug, c.icon, c.parent_id, c.display_order ?? 0, c.is_active]);
  await su.query(createRoleSql().replace('<<DEFINA-AQUI-UMA-SENHA-LONGA-E-ALEATORIA>>', PASS.replace(/'/g, "''")));
  const good = mk(LIMITED_WRITER_ROLE, PASS);

  const ok = cli(good);
  report('B1 caminho feliz: plan como o papel (senha com caracteres especiais) => ok, sem vazamento', ok.code === 0 && ok.json?.ok === true && leaks(ok.out).length === 0, ok.why);
  const wrongPw = cli(mk(LIMITED_WRITER_ROLE, 'senha-errada-XYZ#1'));
  report('B2 senha errada: CONNECTION_FAILED com [28P01] "password authentication failed" e dica; nem a senha digitada nem a URL aparecem', wrongPw.code !== 0 && /CONNECTION_FAILED/.test(wrongPw.why) && /\[28P01\]/.test(wrongPw.why) && /password authentication failed/.test(wrongPw.why) && leaks(wrongPw.out, ['senha-errada-XYZ']).length === 0, wrongPw.why.slice(0, 300));
  const noDb = cli(mk(LIMITED_WRITER_ROLE, PASS, 'banco_que_nao_existe'));
  report('B3 banco inexistente: [3D000] com dica', /\[3D000\]/.test(noDb.why) && /Banco inexistente/.test(noDb.why) && leaks(noDb.out).length === 0, noDb.why.slice(0, 300));
  const noHost = cli(mk(LIMITED_WRITER_ROLE, PASS, DB, 'localhost:59999'));
  report('B4 porta fechada: [ECONNREFUSED] com dica de rede', /ECONNREFUSED/.test(noHost.why) && /Falha de rede/.test(noHost.why) && leaks(noHost.out).length === 0, noHost.why.slice(0, 300));
  const noUser = cli(mk('papel_que_nao_existe', PASS));
  report('B5 usuario inexistente: causa de autenticacao visivel (SQLSTATE) sem vazar a senha', /CONNECTION_FAILED/.test(noUser.why) && /\[28/.test(noUser.why) && leaks(noUser.out).length === 0, noUser.why.slice(0, 300));
  // conecta, mas a consulta do pre-voo falha por permissao (nao e problema de conexao)
  await su.query(`REVOKE SELECT ON public.categories FROM ${LIMITED_WRITER_ROLE}`);
  const perm = cli(good);
  report('B6 consulta do pre-voo falha por permissao: aparece o SQLSTATE [42501] e "permission denied for table categories" (e nao "Failed query" cego); sem params/credenciais', perm.code !== 0 && /\[42501\]/.test(perm.why) && /permission denied for table categories/.test(perm.why) && !/params:/.test(perm.why) && leaks(perm.out).length === 0, perm.why.slice(0, 400));
  await su.query(`GRANT SELECT ON public.categories TO ${LIMITED_WRITER_ROLE}`);
  const again = cli(good);
  report('B7 reconcedido o SELECT, o pre-voo volta a passar (nenhum privilegio extra foi necessario)', again.code === 0 && again.json?.ok === true, again.why);
  await su.query(`ALTER ROLE ${LIMITED_WRITER_ROLE} VALID UNTIL '2020-01-01'`);
  const exp = cli(good);
  report('B8 papel com prazo vencido: o banco recusa e o relatorio mostra [28P01] com dica', /CONNECTION_FAILED/.test(exp.why) && /\[28P01\]/.test(exp.why) && leaks(exp.out).length === 0, exp.why.slice(0, 300));

  await su.end(); await admin.query(`DROP DATABASE IF EXISTS ${DB}`); await admin.query(`DROP ROLE IF EXISTS ${LIMITED_WRITER_ROLE}`).catch(() => undefined); await admin.end();
  console.log(`\n=== RESULTADO: ${passed}/${total} ===`);
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
