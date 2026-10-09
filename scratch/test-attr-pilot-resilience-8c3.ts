/**
 * FASE 8C.3 — RESILIENCIA DO PILOTO: causa real do erro (SQLSTATE) e repeticao segura de falhas transitorias de conexao.
 * Reproduz, em PostgreSQL 17 DESCARTAVEL, conexoes derrubadas no meio da carga (pg_terminate_backend) e prova que: nada e duplicado,
 * o teto de operacoes e exato, erros logicos/permissao NAO sao repetidos e o erro real aparece. Nunca producao.
 */
import { spawn } from 'child_process';
import fs from 'fs';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/db/schema.js';
import { ALL_PLANS } from '../src/data/attributeMatrix/index.js';
import { buildTree, compileOperations, resolveMatrix } from '../src/data/attributeMatrix/engine.js';
import { applyOperations, type OperationLogEntry } from '../scripts/attribute-matrix/applyEngine.js';
import { INVENTORY_FILE } from '../scripts/attribute-matrix/paths.js';
import { MAX_ATTEMPTS, backoffMs, isTransient, withRetry } from '../scripts/attribute-matrix/retry.js';
import { describeError, rootCode } from '../scripts/attribute-matrix/safeError.js';
import { LIMITED_WRITER_ROLE, createRoleSql } from '../scripts/attribute-matrix/limitedWriter.js';

let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: unknown) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 600)}`); };
const HOST = 'localhost:55434', DB = 'p8c3_res', PASS = 'senha_de_teste_8c3_longa_e_aleatoria';
const url = (user: string, pw: string, db = DB) => `postgres://${user}:${pw}@${HOST}/${db}`;
const SU = url('postgres', 'postgres');
const LABEL = `localhost:55434/${DB}`;
const fast = async () => undefined; // sem espera real nos testes em processo

function cli(args: string[], env: Record<string, string | undefined>): Promise<{ code: number | null; json: any; msg: string }> {
  return new Promise((resolve) => {
    const e: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: SU, ATTR_LOAD_FORCE_REMOTE_RULES: '1', NODE_ENV: 'test', ...env };
    for (const k of Object.keys(e)) if (e[k] === undefined) delete e[k];
    const c = spawn(process.execPath, ['--import', 'tsx', 'scripts/attribute-matrix/load.ts', ...args], { env: e });
    let out = '', err = '';
    c.stdout.on('data', (d) => (out += d)); c.stderr.on('data', (d) => (err += d));
    c.on('close', (code) => {
      const txt = out.trim() || err.trim();
      let json: any = null; try { json = JSON.parse(txt.slice(txt.indexOf('{'))); } catch { /* */ }
      resolve({ code, json, msg: JSON.stringify(json ?? txt) });
    });
  });
}

async function main() {
  const admin = new pg.Pool({ connectionString: url('postgres', 'postgres', 'postgres'), max: 2 });
  await admin.query(`DROP DATABASE IF EXISTS ${DB}`); await admin.query(`CREATE DATABASE ${DB} TEMPLATE phase3_tmpl`);
  for (const r of [LIMITED_WRITER_ROLE, 'rt_nosel', 'rt_noins']) await admin.query(`DROP ROLE IF EXISTS ${r}`).catch(() => undefined);
  const su = new pg.Pool({ connectionString: SU, max: 2 });
  const inv = JSON.parse(fs.readFileSync(INVENTORY_FILE, 'utf8'));
  for (const c of inv.categories.filter((x: any) => !x.parent_id)) await su.query('INSERT INTO categories (id,name,slug,icon,display_order,is_active,created_at) VALUES ($1,$2,$3,$4,$5,$6,now())', [c.id, c.name, c.slug, c.icon, c.display_order ?? 0, c.is_active ?? true]);
  for (const c of inv.categories.filter((x: any) => x.parent_id)) await su.query('INSERT INTO categories (id,name,slug,icon,parent_id,display_order,is_active,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now())', [c.id, c.name, c.slug, c.icon, c.parent_id, c.display_order ?? 0, c.is_active ?? true]);
  const tree = buildTree(inv.categories);
  const ops = compileOperations(ALL_PLANS, tree, resolveMatrix(ALL_PLANS, tree));
  const n = async (s: string) => Number((await su.query(s)).rows[0].n);
  const attrs = () => n('SELECT count(*)::int n FROM category_attributes');
  const wipe = async () => { await su.query('DELETE FROM category_attributes'); };

  // ---- unidade: o que e transitorio
  const wrap = (cause: any) => Object.assign(new Error('Failed query: select "id" from "category_attributes" where "id" = $1\nparams: attr_nsl_x_cor'), { cause });
  report('U1 isTransient: queda de conexao (ECONNRESET, 57P01 dentro de "Failed query", "Connection terminated unexpectedly", 53300) = SIM',
    isTransient(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })) && isTransient(wrap(Object.assign(new Error('terminating connection due to administrator command'), { code: '57P01' }))) && isTransient(new Error('Connection terminated unexpectedly')) && isTransient(wrap(Object.assign(new Error('too many'), { code: '53300' }))));
  report('U2 isTransient: senha (28P01), permissao (42501), SQL (42P01), unicidade (23505), regra e erro comum = NAO',
    !isTransient(wrap(Object.assign(new Error('password authentication failed'), { code: '28P01' }))) && !isTransient(wrap(Object.assign(new Error('permission denied'), { code: '42501' }))) && !isTransient(wrap(Object.assign(new Error('relation does not exist'), { code: '42P01' }))) && !isTransient(wrap(Object.assign(new Error('duplicate key'), { code: '23505' }))) && !isTransient(new Error('Atributo invalido')));
  report('U3 rootCode/describeError: o SQLSTATE e a causa real aparecem mesmo atras de "Failed query" e sem os parametros da consulta',
    rootCode(wrap(Object.assign(new Error('permission denied for table category_attributes'), { code: '42501' }))) === '42501' && /\[42501\].*permission denied for table category_attributes/.test(describeError(wrap(Object.assign(new Error('permission denied for table category_attributes'), { code: '42501' })))) && !/attr_nsl_x_cor/.test(describeError(wrap(Object.assign(new Error('x'), { code: '42501' })))));
  let attemptsSeen = 0; const sleeps: number[] = [];
  const exhausted = await withRetry(async () => { attemptsSeen++; throw Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }); }, { sleep: async (ms) => { sleeps.push(ms); } }).then(() => null, (e) => e);
  report(`U4 withRetry desiste depois de ${MAX_ATTEMPTS} tentativas com espera crescente e devolve o ultimo erro`, attemptsSeen === MAX_ATTEMPTS && JSON.stringify(sleeps) === JSON.stringify([1, 2, 3, 4].map(backoffMs)) && exhausted?.code === 'ECONNRESET', { attemptsSeen, sleeps });
  let calls = 0;
  await withRetry(async () => { calls++; throw Object.assign(new Error('password authentication failed'), { code: '28P01' }); }, { sleep: fast }).catch(() => undefined);
  report('U5 withRetry NAO repete erro de autenticacao (1 tentativa)', calls === 1, calls);

  // ---- motor: o erro real aparece (SQLSTATE) e erros de permissao nao sao repetidos
  await su.query(`CREATE ROLE rt_nosel LOGIN PASSWORD '${PASS}'; GRANT CONNECT ON DATABASE ${DB} TO rt_nosel; GRANT USAGE ON SCHEMA public TO rt_nosel;`);
  await su.query(`CREATE ROLE rt_noins LOGIN PASSWORD '${PASS}'; GRANT CONNECT ON DATABASE ${DB} TO rt_noins; GRANT USAGE ON SCHEMA public TO rt_noins; GRANT SELECT ON ALL TABLES IN SCHEMA public TO rt_noins;`);
  const mk = (u: string, app?: string) => { const p = new pg.Pool({ connectionString: url(u, u === 'postgres' ? 'postgres' : PASS), max: 1, application_name: app }); p.on('error', () => undefined); return p; };
  {
    const p = mk('rt_nosel'); let slept = 0; const log: OperationLogEntry[] = [];
    const r = await applyOperations(drizzle(p, { schema }), ops.slice(0, 5), { dryRun: true, sleep: async () => { slept++; }, onOperation: (e) => { log.push(e); } });
    const e0 = r.errors[0];
    report('E1 papel sem SELECT em category_attributes: o erro do motor traz SQLSTATE 42501 e o texto real do PostgreSQL (nao so "Failed query"), sem parametros', r.errors.length === 1 && e0?.code === '42501' && /permission denied for table category_attributes/.test(e0.message) && !e0.message.includes((ops[0].payload as any).id) && !log.some((x) => x.action === 'retry') && slept === 0, r.errors);
    report('E2 esse erro de permissao NAO foi repetido (0 esperas, 0 retentativas) e o lote parou na primeira operacao com erro', slept === 0 && r.created + r.skipped === 0, { slept });
    await p.end();
  }
  {
    const p = mk('rt_noins'); let slept = 0; const log: OperationLogEntry[] = [];
    const r = await applyOperations(drizzle(p, { schema }), ops.slice(0, 5), { sleep: async () => { slept++; }, onOperation: (e) => { log.push(e); } });
    report('E3 papel sem INSERT: escrita falha com 42501, sem repetir, e nada e gravado', r.errors.length === 1 && r.errors[0].code === '42501' && slept === 0 && !log.some((x) => x.action === 'retry') && (await attrs()) === 0, { errors: r.errors, slept, rows: await attrs() });
    await p.end();
  }

  // ---- motor sob queda de conexoes (pg_terminate_backend a cada ~120 ms)
  const killer = (filter: string, everyMs: number) => {
    let kills = 0, busy = false;
    const t = setInterval(async () => { if (busy) return; busy = true; try { kills += Number((await admin.query(`SELECT count(*)::int n FROM (SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE ${filter} AND pid <> pg_backend_pid()) x`)).rows[0].n); } catch { /* */ } busy = false; }, everyMs);
    return { stop: () => clearInterval(t), kills: () => kills };
  };
  {
    const p = mk('postgres', 'rt_engine'); const log: OperationLogEntry[] = [];
    const k = killer(`application_name = 'rt_engine'`, 90);
    const r = await applyOperations(drizzle(p, { schema }), ops, { dryRun: true, batchSize: 1000, sleep: fast, onOperation: (e) => { log.push(e); } });
    k.stop();
    report('K1 dry-run das 847 operacoes com a conexao derrubada repetidamente: conclui sem erro, 847 a criar, 0 deriva', r.errors.length === 0 && r.created === 847 && r.drift.length === 0 && k.kills() > 0 && log.some((x) => x.action === 'retry'), { errors: r.errors.slice(0, 1), created: r.created, kills: k.kills(), retries: log.filter((x) => x.action === 'retry').length });
    await p.end();
  }
  {
    const p = mk('postgres', 'rt_engine'); const log: OperationLogEntry[] = [];
    const k = killer(`application_name = 'rt_engine'`, 90);
    const r = await applyOperations(drizzle(p, { schema }), ops, { batchSize: 50, stopAfter: 100, sleep: fast, onOperation: (e) => { log.push(e); } });
    k.stop();
    const rows = await attrs(), distinct = await n('SELECT count(DISTINCT id)::int n FROM category_attributes');
    report('K2 escrita de 100 operacoes (teto) com quedas de conexao: EXATAMENTE 100 linhas, sem duplicata, sem erro', r.errors.length === 0 && rows === 100 && distinct === 100 && r.created === 100 && r.stoppedEarly && k.kills() > 0, { errors: r.errors.slice(0, 1), rows, distinct, created: r.created, kills: k.kills() });
    report('K3 cada operacao gravada ou recuperada aparece UMA vez no diario (created+recovered = 100)', log.filter((x) => x.action === 'created' || x.action === 'recovered').length === 100, { created: log.filter((x) => x.action === 'created').length, recovered: log.filter((x) => x.action === 'recovered').length, retries: log.filter((x) => x.action === 'retry').length });
    await p.end();
  }
  {
    // retomada sem quedas: completa as 847, e uma segunda passada nao cria nada
    const p = mk('postgres'); const db = drizzle(p, { schema });
    const r1 = await applyOperations(db, ops, { batchSize: 50, sleep: fast });
    report('K4 retomada: completa a matriz (847 linhas), 747 criadas, 100 ja presentes, 0 erro, 0 deriva', r1.errors.length === 0 && r1.created === 747 && r1.drift.length === 0 && (await attrs()) === 847, { created: r1.created, skipped: r1.skipped, rows: await attrs() });
    const r2 = await applyOperations(db, ops, { batchSize: 50, sleep: fast });
    report('K5 segunda passada: 0 criadas, 847 ja presentes (idempotente)', r2.created === 0 && r2.skipped === 847 && r2.errors.length === 0, { created: r2.created, skipped: r2.skipped });
    await p.end();
  }

  // ---- escrita confirmada e conexao perdida ANTES da resposta: nao pode duplicar nem contar duas vezes
  {
    await wipe();
    const p = mk('postgres'); const real = p.query.bind(p) as any; let armed = 3, thrown = 0;
    (p as any).query = async (...a: any[]) => {
      const text = typeof a[0] === 'string' ? a[0] : a[0]?.text ?? '';
      const out = await real(...a);
      if (/^\s*insert into "category_attributes"/i.test(text) && armed > 0 && --armed === 0) { thrown++; throw Object.assign(new Error('Connection terminated unexpectedly'), { code: 'ECONNRESET' }); }
      return out;
    };
    const log: OperationLogEntry[] = [];
    const r = await applyOperations(drizzle(p, { schema }), ops.slice(0, 10), { sleep: fast, onOperation: (e) => { log.push(e); } });
    report('W1 gravacao CONFIRMADA e resposta perdida: a operacao e dada como recuperada (nao repete o INSERT), 10 linhas, 10 contadas, sem erro',
      thrown === 1 && r.errors.length === 0 && r.created === 10 && (await attrs()) === 10 && log.filter((x) => x.action === 'recovered').length === 1 && log.filter((x) => x.action === 'created').length === 9, { thrown, errors: r.errors, created: r.created, rows: await attrs(), actions: log.map((x) => x.action).join(',') });
    await p.end();
  }
  {
    await wipe();
    const p = mk('postgres'); const real = p.query.bind(p) as any; let attempts = 0; const sl: number[] = [];
    (p as any).query = async (...a: any[]) => {
      const text = typeof a[0] === 'string' ? a[0] : a[0]?.text ?? '';
      if (/from "category_attributes"/i.test(text)) { attempts++; throw Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }); }
      return real(...a);
    };
    const r = await applyOperations(drizzle(p, { schema }), ops.slice(0, 3), { dryRun: true, sleep: async (ms) => { sl.push(ms); } });
    report(`W2 rede fora do ar de forma permanente: ${MAX_ATTEMPTS} tentativas com espera crescente, depois o erro real (ECONNRESET) e parada segura`, attempts === MAX_ATTEMPTS && r.errors.length === 1 && r.errors[0].code === 'ECONNRESET' && JSON.stringify(sl) === JSON.stringify([1, 2, 3, 4].map(backoffMs)) && r.created === 0, { attempts, sl, errors: r.errors });
    await p.end();
  }

  // ---- CLI de ponta a ponta (papel dedicado + quedas de conexao), piloto de 100 operacoes em lotes de 50
  await wipe();
  await su.query(createRoleSql().replace('<<DEFINA-AQUI-UMA-SENHA-LONGA-E-ALEATORIA>>', PASS));
  const env = { ATTR_LOAD_DATABASE_URL: url(LIMITED_WRITER_ROLE, PASS) };
  const plan = await cli(['plan', '--allow-remote-read'], env);
  const hash = plan.json?.matrixHash as string, phrase = (plan.json?.result?.confirmPhrase as string) ?? '';
  const pilot = (journal: string) => ['apply', '--expect-hash', hash, '--confirm', phrase, '--allow-target', LABEL, '--max-operations', '100', '--batch-size', '50', '--journal', journal];
  const jr = (f: string) => fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  report('C0 plan conectado como o papel: ok, 847 a criar', plan.code === 0 && plan.json?.ok && plan.json.preflight.state.wouldCreate === 847, plan.msg.slice(0, 300));
  fs.mkdirSync('scratch/_res', { recursive: true });
  {
    const k = killer(`usename = '${LIMITED_WRITER_ROLE}'`, 700);
    const j = 'scratch/_res/pilot1.jsonl';
    const r = await cli(pilot(j), env);
    k.stop();
    const ev = fs.existsSync(j) ? jr(j) : [];
    report('C1 PILOTO sob quedas de conexao: ok, EXATAMENTE 100 linhas, janela aberta e FECHADA, lotes auditados, sem erro', r.code === 0 && r.json?.ok === true && (await attrs()) === 100 && (await n(`SELECT count(*)::int n FROM audit_logs WHERE action='system.attribute_matrix.window_opened'`)) === 1 && (await n(`SELECT count(*)::int n FROM audit_logs WHERE action='system.attribute_matrix.window_closed'`)) === 1 && (await n(`SELECT count(*)::int n FROM audit_logs WHERE action='system.attribute_matrix.batch_applied'`)) === 2 && !r.json?.windowCloseError, { code: r.code, msg: r.msg.slice(0, 500), kills: k.kills(), rows: await attrs() });
    report('C2 as quedas realmente aconteceram e foram absorvidas (derrubadas > 0)', k.kills() > 0, { kills: k.kills(), retries: ev.filter((x) => x.event === 'retry' || x.action === 'retry').length });
    report('C3 o diario nao contem URL, senha nem credencial', !new RegExp(`${PASS}|postgres://|postgresql://`).test(fs.readFileSync(j, 'utf8')) && !new RegExp(PASS).test(r.msg));
  }
  {
    const j = 'scratch/_res/pilot2.jsonl';
    const r = await cli(pilot(j), env);
    report('C4 retomada (mesmo comando): 100 ja presentes puladas + 100 novas = 200 linhas, sem erro, segunda janela fechada', r.code === 0 && r.json?.ok === true && (await attrs()) === 200 && (await n(`SELECT count(*)::int n FROM audit_logs WHERE action='system.attribute_matrix.window_closed'`)) === 2, { code: r.code, msg: r.msg.slice(0, 500), rows: await attrs() });
  }
  {
    // causa real na saida do CLI quando o dry-run falha: remove SELECT do papel em uma tabela lida pelo dry-run (categories) -> o erro real aparece
    await su.query(`REVOKE SELECT ON public.categories FROM ${LIMITED_WRITER_ROLE}`);
    const r = await cli(pilot('scratch/_res/pilot3.jsonl'), env);
    await su.query(`GRANT SELECT ON public.categories TO ${LIMITED_WRITER_ROLE}`);
    report('C5 falha de permissao no pre-voo: o CLI mostra o SQLSTATE 42501 e a causa real (nao so "Failed query"), sem URL nem senha, e nada e gravado alem do que ja existia',
      r.code !== 0 && /42501/.test(r.msg) && /permission denied/.test(r.msg) && !new RegExp(`${PASS}|postgres://`).test(r.msg) && (await attrs()) === 200, r.msg.slice(0, 500));
  }

  await su.end();
  fs.rmSync('scratch/_res', { recursive: true, force: true });
  await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
  for (const r of [LIMITED_WRITER_ROLE, 'rt_nosel', 'rt_noins']) await admin.query(`DROP ROLE IF EXISTS ${r}`).catch(() => undefined);
  await admin.end();
  console.log(`\n=== RESULTADO: ${passed}/${total} ===`);
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
