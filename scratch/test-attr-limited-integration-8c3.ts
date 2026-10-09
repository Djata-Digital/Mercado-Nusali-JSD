/**
 * FASE 8C.3 — INTEGRACAO do carregador (CLI real) com o papel dedicado attr_loader_8c3. PostgreSQL 17 DESCARTAVEL.
 * O alvo local e tratado com as regras de remoto/producao (ATTR_LOAD_FORCE_REMOTE_RULES=1, que so aumenta o rigor) e a credencial de
 * superusuario faz o papel de "URL de producao conhecida" (DATABASE_URL). Nunca producao.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import pg from 'pg';
import { LIMITED_WRITER_ROLE, createRoleSql, revokeRoleSql } from '../scripts/attribute-matrix/limitedWriter.js';

let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: unknown) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 500)}`); };
const HOST = 'localhost:55434', DB = 'p8c3_int', PASS = 'senha_de_teste_8c3_longa_e_aleatoria';
const url = (user: string, pw: string, db = DB) => `postgres://${user}:${pw}@${HOST}/${db}`;
const SU = url('postgres', 'postgres');
const LABEL = `localhost:55434/${DB}`;

function cli(args: string[], env: Record<string, string | undefined>) {
  const e: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: SU, ATTR_LOAD_FORCE_REMOTE_RULES: '1', NODE_ENV: 'test', ...env };
  for (const k of Object.keys(e)) if (e[k] === undefined) delete e[k];
  const r = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/attribute-matrix/load.ts', ...args], { env: e, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 900000 });
  const txt = (r.stdout || '').trim() || (r.stderr || '').trim();
  let json: any = null; try { json = JSON.parse(txt.slice(txt.indexOf('{'))); } catch { /* */ }
  return { code: r.status, json, raw: txt.slice(-300), msg: JSON.stringify(json ?? txt) };
}

async function main() {
  const admin = new pg.Pool({ connectionString: url('postgres', 'postgres', 'postgres'), max: 1 });
  await admin.query(`DROP DATABASE IF EXISTS ${DB}`); await admin.query(`CREATE DATABASE ${DB} TEMPLATE phase3_tmpl`);
  for (const r of [LIMITED_WRITER_ROLE, 'outro_papel']) await admin.query(`DROP ROLE IF EXISTS ${r}`).catch(() => undefined);
  const su = new pg.Pool({ connectionString: SU, max: 2 });
  const inv = JSON.parse(fs.readFileSync('docs/attribute-matrix/v1/categories.inventory.raw.json', 'utf8'));
  for (const c of inv.categories.filter((x: any) => !x.parent_id)) await su.query('INSERT INTO categories (id,name,slug,icon,display_order,is_active,created_at) VALUES ($1,$2,$3,$4,$5,$6,now())', [c.id, c.name, c.slug, c.icon, c.display_order ?? 0, c.is_active]);
  for (const c of inv.categories.filter((x: any) => x.parent_id)) await su.query('INSERT INTO categories (id,name,slug,icon,parent_id,display_order,is_active,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now())', [c.id, c.name, c.slug, c.icon, c.parent_id, c.display_order ?? 0, c.is_active]);
  const dropRole = `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${LIMITED_WRITER_ROLE}') THEN EXECUTE 'DROP OWNED BY ${LIMITED_WRITER_ROLE}'; EXECUTE 'DROP ROLE ${LIMITED_WRITER_ROLE}'; END IF; END $$;`;
  const mkRole = async (mutate = '') => { await su.query(dropRole); await su.query(createRoleSql().replace('<<DEFINA-AQUI-UMA-SENHA-LONGA-E-ALEATORIA>>', PASS)); if (mutate) await su.query(mutate); };
  await mkRole();
  const n = async (s: string) => Number((await su.query(s)).rows[0].n);
  const attrs = () => n('SELECT count(*)::int n FROM category_attributes');
  const audit = (a: string) => n(`SELECT count(*)::int n FROM audit_logs WHERE action = 'system.attribute_matrix.${a}'`);
  const env = { ATTR_LOAD_DATABASE_URL: url(LIMITED_WRITER_ROLE, PASS) };
  // INT_STOP=refusals|pilot encerra mais cedo (usado pelos testes de mutacao para ganhar tempo)
  const finish = async () => {
    await su.end(); await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    for (const r of [LIMITED_WRITER_ROLE, 'outro_papel']) await admin.query(`DROP ROLE IF EXISTS ${r}`).catch(() => undefined);
    await admin.end();
    console.log(`\n=== RESULTADO: ${passed}/${total} ===`);
    process.exit(passed === total ? 0 : 1);
  };

  // ---- plano (somente leitura) conectado como o papel
  const plan = cli(['plan', '--allow-remote-read'], env);
  const hash = plan.json?.matrixHash as string;
  const phrase = (plan.json?.result?.confirmPhrase as string) ?? '';
  report('I1 plan (somente leitura) conectado como o papel: 847 a criar, 0 deriva, sessao READ ONLY, nenhuma escrita nem janela', plan.code === 0 && plan.json?.ok && plan.json.readOnlySession === true && plan.json.preflight.state.wouldCreate === 847 && plan.json.preflight.state.drift === 0 && (await attrs()) === 0 && (await audit('window_opened')) === 0, plan.raw);
  const base = (over: Partial<Record<string, string>> = {}) => {
    const a: Record<string, string | undefined> = { 'expect-hash': hash, confirm: phrase, 'allow-target': LABEL, 'max-operations': '100', 'batch-size': '50', ...over };
    return ['apply', ...Object.entries(a).filter(([, v]) => v !== undefined).flatMap(([k, v]) => [`--${k}`, v as string])];
  };
  const refused = async (label: string, r: ReturnType<typeof cli>, code: RegExp) => report(`${label} => recusado, 0 escritas, 0 janelas abertas`, r.code !== 0 && code.test(r.msg) && (await attrs()) === 0 && (await audit('window_opened')) === 0, { code: r.code, msg: r.msg.slice(0, 240) });

  // ---- bloqueio padrao: tudo que nao e o papel dedicado continua recusado
  await refused('R1 credencial de SUPERUSUARIO (a do app, igual a DATABASE_URL), todas as flags corretas', cli(base(), { ATTR_LOAD_DATABASE_URL: SU }), /PRODUCTION_TARGET_REFUSED/);
  await su.query(`CREATE ROLE outro_papel LOGIN PASSWORD '${PASS}' VALID UNTIL '${new Date(Date.now() + 3600e3).toISOString()}'`);
  await refused('R2 outro papel qualquer', cli(base(), { ATTR_LOAD_DATABASE_URL: url('outro_papel', PASS) }), /PRODUCTION_TARGET_REFUSED/);
  // ---- exigencias adicionais do caminho do papel
  await refused('R3 papel dedicado SEM --allow-target', cli(base({ 'allow-target': undefined }), env), /LIMITED_WRITER_TARGET_NOT_CONFIRMED/);
  await refused('R4 --allow-target de OUTRO banco', cli(base({ 'allow-target': 'localhost:55434/outrobanco' }), env), /LIMITED_WRITER_TARGET_NOT_CONFIRMED/);
  await refused('R5 SEM --max-operations', cli(base({ 'max-operations': undefined }), env), /MAX_OPERATIONS_REQUIRED/);
  await refused('R6 --max-operations 0', cli(base({ 'max-operations': '0' }), env), /MAX_OPERATIONS_REQUIRED/);
  await refused('R7 --max-operations 848 (maior que as 847 da matriz)', cli(base({ 'max-operations': '848' }), env), /MAX_OPERATIONS_REQUIRED/);
  await refused('R8 --max-operations "100abc" (nao numerico)', cli(base({ 'max-operations': '100abc' }), env), /MAX_OPERATIONS_REQUIRED/);
  await refused('R9 hash errado', cli(base({ 'expect-hash': 'a'.repeat(64) }), env), /MATRIX_HASH_MISMATCH/);
  await refused('R10 sem confirmacao', cli(base({ confirm: undefined }), env), /CONFIRMATION_REQUIRED/);
  await refused('R11 confirmacao de OUTRO banco', cli(base({ confirm: phrase.replace(DB, 'outrobanco') }), env), /CONFIRMATION_REQUIRED/);
  await refused('R12 NODE_ENV=production', cli(base(), { ...env, NODE_ENV: 'production' }), /NODE_ENV_PRODUCTION/);

  // ---- verificacao da SESSAO antes de qualquer escrita
  const sessionCase = async (label: string, mutate: string, code: RegExp) => { await mkRole(mutate); await refused(label, cli(base(), env), code); };
  await sessionCase('S1 papel com UPDATE em produtos', `GRANT UPDATE ON public.products TO ${LIMITED_WRITER_ROLE}`, /LIMITED_WRITER_EXCESS_PRIVILEGES/);
  await sessionCase('S2 papel com INSERT em pedidos', `GRANT INSERT ON public.orders TO ${LIMITED_WRITER_ROLE}`, /LIMITED_WRITER_EXCESS_PRIVILEGES/);
  await sessionCase('S3 papel SEM INSERT em audit_logs (nao conseguiria auditar)', `REVOKE INSERT ON public.audit_logs FROM ${LIMITED_WRITER_ROLE}`, /LIMITED_WRITER_MISSING_PRIVILEGE/);
  await sessionCase('S4 papel sem prazo (VALID UNTIL infinity)', `ALTER ROLE ${LIMITED_WRITER_ROLE} VALID UNTIL 'infinity'`, /LIMITED_WRITER_NO_EXPIRY/);
  await sessionCase('S5 papel com prazo de 2 dias', `ALTER ROLE ${LIMITED_WRITER_ROLE} VALID UNTIL '${new Date(Date.now() + 48 * 3600e3).toISOString()}'`, /LIMITED_WRITER_TTL_TOO_LONG/);
  await sessionCase('S6 papel com CREATEROLE', `ALTER ROLE ${LIMITED_WRITER_ROLE} CREATEROLE`, /LIMITED_WRITER_ROLE_TOO_POWERFUL/);
  await sessionCase('S7 papel com prazo VENCIDO (o proprio banco recusa a conexao)', `ALTER ROLE ${LIMITED_WRITER_ROLE} VALID UNTIL '2020-01-01'`, /authentica|password|ERROR|Falha|expired/i);
  await mkRole();
  if (process.env.INT_STOP === 'refusals') return finish();

  // ---- piloto de 100 operacoes (lotes de 50)
  const pilot = cli(base(), env);
  const seed = () => n("SELECT count(*)::int n FROM category_attributes WHERE source='seed'");
  report('P1 PILOTO: --max-operations 100, lotes de 50 => exatamente 100 linhas (todas seed), parada limpa, sem erro', pilot.code === 0 && pilot.json?.ok && pilot.json.result.created === 100 && pilot.json.result.stoppedEarly === true && (await attrs()) === 100 && (await seed()) === 100, pilot.raw);
  report('P2 sessao verificada e auditoria da janela: window_opened 1, batch_applied 2, window_closed 1; relatorio sem credenciais', (await audit('window_opened')) === 1 && (await audit('batch_applied')) === 2 && (await audit('window_closed')) === 1 && !pilot.msg.includes(PASS) && pilot.json?.preflight?.limitedWriter?.role === LIMITED_WRITER_ROLE && pilot.json.preflight.limitedWriter.minutesLeft > 100, pilot.json?.preflight?.limitedWriter);
  const det = (await su.query("SELECT details_json d FROM audit_logs WHERE action='system.attribute_matrix.window_opened'")).rows[0].d;
  report('P3 a linha window_opened registra alvo, hash, papel, limite e prazo (sem senha/URL)', det.target === LABEL && det.matrixHash === hash && det.role === LIMITED_WRITER_ROLE && det.maxOperations === 100 && !JSON.stringify(det).includes(PASS) && !JSON.stringify(det).includes('postgres://'), det);
  report('P4 nada fora das tabelas de atributos/auditoria mudou (categorias 322 intactas, 0 produtos, 0 pedidos)', (await n('SELECT count(*)::int n FROM categories')) === 322 && (await n('SELECT count(*)::int n FROM products')) === 0 && (await n('SELECT count(*)::int n FROM orders')) === 0);

  if (process.env.INT_STOP === 'pilot') return finish();

  // ---- retomada (restante) e idempotencia
  const rest = cli(base({ 'max-operations': '747' }), env);
  report('P5 RETOMADA: --max-operations 747 pula as 100 existentes e cria as 747 restantes; total 847; verificacao das 322 categorias sem divergencia', rest.code === 0 && rest.json?.ok && rest.json.result.created === 747 && rest.json.result.skipped === 100 && rest.json.result.verify?.checked === 322 && rest.json.result.verify?.mismatches === 0 && (await attrs()) === 847 && (await seed()) === 847, rest.raw);
  const again = cli(base({ 'max-operations': '1' }), env);
  report('P6 IDEMPOTENCIA: reexecutar nao cria nada (0 criadas, 847 puladas)', again.code === 0 && again.json?.result?.created === 0 && again.json.result.skipped === 847 && (await attrs()) === 847, again.raw);
  report('P7 auditoria completa: 3 janelas abertas e 3 fechadas; lotes auditados', (await audit('window_opened')) === 3 && (await audit('window_closed')) === 3 && (await audit('batch_applied')) >= 19, { o: await audit('window_opened'), c: await audit('window_closed'), b: await audit('batch_applied') });

  // ---- teto: uma execucao nunca passa de --max-operations
  const capDb = (await attrs());
  report('P8 (reversao com teto) rollback --max-operations 100 remove EXATAMENTE 100 e para; depois remove o restante', await (async () => {
    const phr = phrase.replace('APLICAR', 'REVERTER');
    const rb = (m: string) => cli(['rollback', '--expect-hash', hash, '--confirm', phr, '--allow-target', LABEL, '--max-operations', m], env);
    const r1 = rb('100');
    const left1 = await attrs();
    const r2 = rb('747');
    const left2 = await attrs();
    const r3 = rb('847');
    const left3 = await attrs();
    return capDb === 847 && r1.json?.result?.removed === 100 && left1 === 747 && /Limite de 100/.test(JSON.stringify(r1.json?.result?.blocked)) && left2 <= 100 && r3.json?.result?.removed === left2 && left3 === 0;
  })());
  report('P9 reversao com o papel: auditoria system.attribute_matrix.rollback nao e exigida, mas as janelas das reversoes foram abertas e fechadas', (await audit('window_opened')) === 6 && (await audit('window_closed')) === 6);

  // ---- recarga completa e depois REVOGACAO: nao ha mais acesso
  const full = cli(base({ 'max-operations': '847' }), env);
  report('P10 carga completa de uma vez com --max-operations 847 (apos a reversao): 847 criadas e verificadas', full.code === 0 && full.json?.result?.created === 847 && full.json.result.verify?.mismatches === 0, full.raw);
  await su.query(revokeRoleSql());
  const after = cli(base({ 'max-operations': '847' }), env);
  report('P11 depois da REVOGACAO o carregador nao consegue mais conectar/escrever com o papel', after.code !== 0 && after.json?.ok !== true && (await attrs()) === 847, after.msg.slice(0, 160));
  report('P12 o bloqueio padrao permanece apos a revogacao (credencial comum continua recusada)', await (async () => { const r = cli(base(), { ATTR_LOAD_DATABASE_URL: SU }); return r.code !== 0 && /PRODUCTION_TARGET_REFUSED/.test(r.msg); })());

  // ---- comando de SQL do papel
  const sqlC = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/attribute-matrix/load.ts', 'limited-role-sql'], { encoding: 'utf8' });
  const sqlR = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/attribute-matrix/load.ts', 'limited-role-sql', '--revoke'], { encoding: 'utf8' });
  const sqlBad = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/attribute-matrix/load.ts', 'limited-role-sql', '--ttl-hours', '4'], { encoding: 'utf8' });
  report('P13 "limited-role-sql" imprime criacao (com marcador de senha, prazo 3 h) e revogacao; prazo > 3 h e recusado; nao conecta a banco algum', /CREATE ROLE attr_loader_8c3/.test(sqlC.stdout) && /DEFINA-AQUI/.test(sqlC.stdout) && /DROP ROLE attr_loader_8c3/.test(sqlR.stdout) && sqlBad.status !== 0, { c: sqlC.status, r: sqlR.status, b: sqlBad.status });

  await su.end(); await admin.query(`DROP DATABASE IF EXISTS ${DB}`); for (const r of [LIMITED_WRITER_ROLE, 'outro_papel']) await admin.query(`DROP ROLE IF EXISTS ${r}`).catch(() => undefined); await admin.end();
  console.log(`\n=== RESULTADO: ${passed}/${total} ===`);
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
