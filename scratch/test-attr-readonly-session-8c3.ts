/**
 * FASE 8C.3 — sessao somente leitura por transacao explicita (readOnlySession.ts), compativel com poolers em modo transacao.
 * PostgreSQL 17 DESCARTAVEL. Nunca producao.
 */
import pg from 'pg';
import { spawnSync } from 'child_process';
import { beginReadOnly, endReadOnly } from '../scripts/attribute-matrix/readOnlySession.js';

let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: unknown) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 400)}`); };
const URL = 'postgres://postgres:postgres@localhost:55434/phase3_it';

async function main() {
  const pool = new pg.Pool({ connectionString: URL, max: 2 });
  // U1: transacao somente leitura de verdade
  const c = await beginReadOnly(pool as any);
  const pids = new Set<number>();
  for (let i = 0; i < 20; i++) pids.add((await c.query('select pg_backend_pid() p')).rows[0].p);
  const w = await c.query("create table if not exists _ro_probe (x int)").then(() => 'ESCREVEU').catch((e) => e.code);
  await endReadOnly(c);
  const c1b = await beginReadOnly(pool as any);
  const w2 = await c1b.query('insert into categories (id, name, slug) values (\'ro_x\', \'x\', \'ro-x\')').then(() => 'ESCREVEU').catch((e) => e.code);
  await endReadOnly(c1b);
  report('U1 BEGIN READ ONLY: 20 consultas no MESMO backend; DDL e INSERT sao recusados pelo banco (SQLSTATE 25006)', pids.size === 1 && w === '25006' && w2 === '25006', { pids: pids.size, w, w2 });
  // U2: o modo nao vaza para quem reutiliza a conexao
  const c2 = await pool.connect();
  const mode = (await c2.query('show transaction_read_only')).rows[0].transaction_read_only;
  c2.release();
  report('U2 depois de endReadOnly a conexao devolvida ao pool volta ao normal (nao fica somente leitura)', mode === 'off', mode);
  // U3: se o banco nao confirmar o modo, recusa e descarta a conexao
  const calls: string[] = []; let released: unknown = 'nao';
  const fake = { connect: async () => ({ query: async (sql: string) => { calls.push(sql); return sql.startsWith('SHOW') ? { rows: [{ transaction_read_only: 'off' }] } : { rows: [] }; }, release: (x?: any) => { released = x; } }) };
  const e3 = await beginReadOnly(fake as any).then(() => null, (e) => e);
  report('U3 pooler que ignora o modo (transaction_read_only=off): READ_ONLY_NOT_ENFORCED, ROLLBACK emitido e a conexao descartada', /READ_ONLY_NOT_ENFORCED/.test(String(e3?.message)) && calls.includes('ROLLBACK') && released === true, { calls, released, e: String(e3?.message).slice(0, 80) });
  const fake2 = { connect: async () => ({ query: async (sql: string) => { if (sql.startsWith('BEGIN')) throw new Error('boom'); return { rows: [] }; }, release: (x?: any) => { released = x; } }) };
  released = 'nao';
  const e4 = await beginReadOnly(fake2 as any).then(() => null, (e) => e);
  report('U4 falha no BEGIN: erro propagado e conexao descartada', String(e4?.message) === 'boom' && released === true);
  await pool.end();

  // U5: CLI de leitura (plan) usa a transacao somente leitura e continua funcionando; sem opcao de inicializacao
  const env = { ...process.env, ATTR_LOAD_DATABASE_URL: URL, NODE_ENV: 'test' } as NodeJS.ProcessEnv;
  const r = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/attribute-matrix/load.ts', 'plan', '--journal', 'attribute-matrix-journal/ro-test.jsonl'], { env, encoding: 'utf8', timeout: 300000 });
  const out = (r.stdout || '') + (r.stderr || '');
  report('U5 plan responde com a categoria-arvore da copia (falha esperada por arvore divergente) SEM erro de conexao/sessao: a sessao somente leitura foi aberta e confirmada', /CATEGORY_TREE_MISMATCH|"ok": true/.test(out) && !/READ_ONLY_NOT_ENFORCED|CONNECTION_FAILED/.test(out), out.slice(0, 300));
  console.log(`\n=== RESULTADO: ${passed}/${total} ===`);
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
