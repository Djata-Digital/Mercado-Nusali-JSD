/**
 * FASE 8B — TESTE do CARREGADOR controlado (scripts/attribute-matrix/load.ts) como processo real (CLI), em PostgreSQL 17 DESCARTAVEL.
 * Nunca producao: nenhum alvo remoto real e usado (alvos "remotos" sao hosts .invalid que nunca recebem conexao — a recusa ocorre antes).
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/db/schema.js';
import { updateAttribute } from '../src/server/modules/catalog/attributeDefinitionService.js';

const ADMIN_URL = 'postgres://postgres:postgres@localhost:55434/postgres';
const urlFor = (db: string) => `postgres://postgres:postgres@localhost:55434/${db}`;
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: unknown) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 600)}`); };

function cli(args: string[], env: Record<string, string | undefined>) {
  const e: NodeJS.ProcessEnv = { ...process.env, ...env };
  for (const k of Object.keys(e)) if (e[k] === undefined) delete e[k];
  const r = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/attribute-matrix/load.ts', ...args], { env: e, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 600000 });
  let json: any = null;
  const txt = (r.stdout || '').trim() || (r.stderr || '').trim();
  const start = txt.indexOf('{');
  try { json = JSON.parse(txt.slice(start)); } catch { /* sem json */ }
  return { code: r.status, json, raw: txt.slice(-400) };
}

async function main() {
  const admin = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  const mkdb = async (name: string) => {
    await admin.query(`DROP DATABASE IF EXISTS ${name}`);
    await admin.query(`CREATE DATABASE ${name} TEMPLATE phase3_tmpl`);
    const p = new pg.Pool({ connectionString: urlFor(name), max: 2 });
    const inv = JSON.parse(fs.readFileSync('docs/attribute-matrix/v1/categories.inventory.raw.json', 'utf8'));
    for (const c of inv.categories.filter((x: any) => !x.parent_id)) await p.query('INSERT INTO categories (id,name,slug,icon,display_order,is_active,created_at) VALUES ($1,$2,$3,$4,$5,$6,now())', [c.id, c.name, c.slug, c.icon, c.display_order ?? 0, c.is_active]);
    for (const c of inv.categories.filter((x: any) => x.parent_id)) await p.query('INSERT INTO categories (id,name,slug,icon,parent_id,display_order,is_active,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now())', [c.id, c.name, c.slug, c.icon, c.parent_id, c.display_order ?? 0, c.is_active]);
    return p;
  };
  const n = async (p: pg.Pool, s: string) => Number((await p.query(s)).rows[0].n);
  const count = (p: pg.Pool) => n(p, 'SELECT count(*)::int n FROM category_attributes');

  const P1 = await mkdb('p8b_l1');
  const env1 = { ATTR_LOAD_DATABASE_URL: urlFor('p8b_l1'), NODE_ENV: 'test' };

  // ---------- plan / dry-run
  const plan = cli(['plan'], env1);
  const hash = plan.json?.matrixHash as string;
  const phrase = plan.json?.result?.confirmPhrase as string;
  report('T1 plan: pre-voo ok (esquema, arvore 322=322, matriz v2 valida), dry-run planeja 847 criacoes, sessao SOMENTE LEITURA, hash e frase de confirmacao impressos', plan.code === 0 && plan.json?.ok && plan.json.readOnlySession === true && plan.json.preflight?.state?.wouldCreate === 847 && plan.json.preflight?.tree?.database === 322 && /^[0-9a-f]{64}$/.test(hash) && /^APLICAR v2-/.test(phrase), plan.json ?? plan.raw);
  report('T1b plan NAO escreve nada (0 atributos, 0 auditoria)', (await count(P1)) === 0 && (await n(P1, "SELECT count(*)::int n FROM audit_logs WHERE action LIKE 'system.attribute_matrix%'")) === 0);

  // ---------- recusas (nada pode ser escrito)
  const refuse = async (label: string, args: string[], env: Record<string, string | undefined>, code: string) => {
    const r = cli(args, env);
    const msg = JSON.stringify(r.json ?? r.raw);
    report(label, r.code !== 0 && msg.includes(code) && (await count(P1)) === 0, { code: r.code, msg: msg.slice(0, 300) });
  };
  await refuse('T2 apply SEM --expect-hash e SEM --confirm => recusado (MATRIX_HASH_MISMATCH)', ['apply'], env1, 'MATRIX_HASH_MISMATCH');
  await refuse('T3 apply com hash INCORRETO => recusado', ['apply', '--expect-hash', 'a'.repeat(64), '--confirm', phrase], env1, 'MATRIX_HASH_MISMATCH');
  await refuse('T4 apply com hash correto e confirmacao INCORRETA => recusado (CONFIRMATION_REQUIRED)', ['apply', '--expect-hash', hash, '--confirm', phrase.replace('APLICAR', 'REVERTER')], env1, 'CONFIRMATION_REQUIRED');
  await refuse('T4b apply com hash correto e SEM confirmacao => recusado', ['apply', '--expect-hash', hash], env1, 'CONFIRMATION_REQUIRED');
  await refuse('T5 sem ATTR_LOAD_DATABASE_URL (mesmo com DATABASE_URL no ambiente) => recusado (TARGET_NOT_SET): DATABASE_URL nunca e usada', ['plan'], { ATTR_LOAD_DATABASE_URL: undefined, DATABASE_URL: urlFor('p8b_l1'), NODE_ENV: 'test' }, 'TARGET_NOT_SET');
  await refuse('T6 NODE_ENV=production + hash/confirmacao corretos => recusado (NODE_ENV_PRODUCTION)', ['apply', '--expect-hash', hash, '--confirm', phrase], { ...env1, NODE_ENV: 'production' }, 'NODE_ENV_PRODUCTION');
  const remote = 'postgres://u:p@db.remote-example.invalid:5432/mercado';
  const remotePhrase = phrase.replace(/EM .*/, 'EM db.remote-example.invalid:5432/mercado');
  await refuse('T7 escrita em alvo REMOTO com hash e confirmacao corretos => recusada (REMOTE_WRITE_DISABLED)', ['apply', '--expect-hash', hash, '--confirm', remotePhrase], { ATTR_LOAD_DATABASE_URL: remote, NODE_ENV: 'test' }, 'REMOTE_WRITE_DISABLED');
  await refuse('T8 plan em alvo remoto sem --allow-remote-read => recusado (REMOTE_READ_NOT_CONFIRMED)', ['plan'], { ATTR_LOAD_DATABASE_URL: remote, NODE_ENV: 'test' }, 'REMOTE_READ_NOT_CONFIRMED');
  await refuse('T9 alvo que coincide com o banco de "producao" conhecido do ambiente => escrita recusada (PRODUCTION_TARGET_REFUSED)', ['apply', '--expect-hash', hash, '--confirm', remotePhrase], { ATTR_LOAD_DATABASE_URL: remote, DATABASE_URL: remote, NODE_ENV: 'test' }, 'PRODUCTION_TARGET_REFUSED');
  await refuse('T9b rollback em alvo remoto => recusado', ['rollback', '--expect-hash', hash, '--confirm', remotePhrase.replace('APLICAR', 'REVERTER')], { ATTR_LOAD_DATABASE_URL: remote, NODE_ENV: 'test' }, 'REMOTE_WRITE_DISABLED');
  await refuse('T10 comando invalido => recusado', ['destroy'], env1, 'COMMAND_INVALID');

  // ---------- arvore divergente
  const P2 = await mkdb('p8b_l2');
  await P2.query("DELETE FROM categories WHERE slug = 'moda-feminina-vestidos'");
  const bad = cli(['plan'], { ATTR_LOAD_DATABASE_URL: urlFor('p8b_l2'), NODE_ENV: 'test' });
  report('T11 arvore de categorias do banco diferente do inventario auditado (1 faltando) => plan ABORTA (CATEGORY_TREE_MISMATCH)', bad.code === 1 && /CATEGORY_TREE_MISMATCH/.test(String(bad.json?.stoppedBecause)), bad.json?.stoppedBecause);
  await P2.query("INSERT INTO categories (id,name,slug,parent_id,is_active,created_at) VALUES ('cat_nova','Nova','nova-categoria-extra',NULL,true,now())");
  const bad2 = cli(['plan'], { ATTR_LOAD_DATABASE_URL: urlFor('p8b_l2'), NODE_ENV: 'test' });
  report('T11b categoria a mais no banco tambem aborta', bad2.code === 1 && /CATEGORY_TREE_MISMATCH/.test(String(bad2.json?.stoppedBecause)), bad2.json?.stoppedBecause);
  await P2.end();

  // ---------- falha parcial + retomada
  const journal = 'attribute-matrix-journal/test-8b-l1.jsonl';
  try { fs.unlinkSync(journal); } catch { /* ok */ }
  const part = cli(['apply', '--expect-hash', hash, '--confirm', phrase, '--batch-size', '100', '--stop-after', '333', '--journal', journal], env1);
  report('T12 apply com parada simulada apos 333 operacoes: estado parcial coerente (333 linhas, todas source=seed), sem erro', part.code === 0 && part.json?.result?.stoppedEarly === true && (await count(P1)) === 333 && (await n(P1, "SELECT count(*)::int n FROM category_attributes WHERE source='seed'")) === 333, part.json?.result ?? part.raw);
  const jl = fs.existsSync(journal) ? fs.readFileSync(journal, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
  report('T12b diario JSONL: cabecalho, 333 operacoes "created", lotes validados, sem segredo (so host:porta/banco)', jl[0]?.event === 'start' && jl.filter((x) => x.event === 'op' && x.action === 'created').length === 333 && jl.some((x) => x.event === 'batch') && !fs.readFileSync(journal, 'utf8').includes('postgres:postgres'), jl.slice(0, 2));
  report('T12c auditoria no banco: 1 linha system.attribute_matrix.batch_applied por lote concluido (3 lotes completos de 100)', (await n(P1, "SELECT count(*)::int n FROM audit_logs WHERE action='system.attribute_matrix.batch_applied'")) === 3);

  const resume = cli(['apply', '--expect-hash', hash, '--confirm', phrase, '--batch-size', '100', '--journal', journal], env1);
  report('T13 RETOMADA: rodar apply de novo pula as 333 existentes e cria as 514 restantes; verificacao final dos efetivos das 322 categorias sem divergencia', resume.code === 0 && resume.json?.result?.created === 514 && resume.json?.result?.skipped === 333 && (await count(P1)) === 847 && resume.json?.result?.verify?.mismatches === 0 && resume.json?.result?.verify?.checked === 322, resume.json?.result ?? resume.raw);
  const again = cli(['apply', '--expect-hash', hash, '--confirm', phrase, '--journal', journal], env1);
  report('T14 IDEMPOTENCIA: reexecutar tudo = 0 criadas, 847 puladas, 0 deriva, banco igual', again.code === 0 && again.json?.result?.created === 0 && again.json?.result?.skipped === 847 && (await count(P1)) === 847, again.json?.result ?? again.raw);
  const ver = cli(['verify'], env1);
  report('T15 verify: efetivos das 322 categorias == previstos, 847 linhas seed, sessao somente leitura', ver.code === 0 && ver.json?.result?.mismatchCount === 0 && ver.json?.result?.seedRows === 847 && ver.json?.readOnlySession === true, ver.json?.result ?? ver.raw);
  report('T15b origem: 847 linhas source=seed e nenhuma admin; 806+7+34 estrutura preservada', (await n(P1, "SELECT count(*)::int n FROM category_attributes WHERE source='seed'")) === 847 && (await n(P1, "SELECT count(*)::int n FROM category_attributes WHERE source='admin'")) === 0 && (await n(P1, 'SELECT count(*)::int n FROM category_attributes WHERE overrides_id IS NULL')) === 806);

  // ---------- deriva: alteracao administrativa posterior
  const pool = new pg.Pool({ connectionString: urlFor('p8b_l1'), max: 2 });
  const db = drizzle(pool, { schema });
  const target = (await pool.query("SELECT id, category_id FROM category_attributes WHERE id = 'attr_nsl_celulares-e-telefones-smartphones_sistema_operativo'")).rows[0];
  let editedOk = false;
  try { await updateAttribute(db, target.id, { helpText: 'Editado pelo admin depois da carga' }); editedOk = true; } catch (e: any) { console.log('edicao admin falhou', e.message); }
  const row = (await pool.query('SELECT admin_modified_at, help_text, source FROM category_attributes WHERE id=$1', [target.id])).rows[0];
  report('T16 pre-condicao: o admin edita um atributo da carga (admin_modified_at preenchido, source segue seed)', editedOk && row.admin_modified_at && row.source === 'seed' && row.help_text === 'Editado pelo admin depois da carga', row);
  const drift = cli(['plan'], env1);
  report('T16b DERIVA detectada: plan para com DRIFT_DETECTED apontando a edicao posterior, sem sobrescrever', drift.code === 1 && /DRIFT_DETECTED/.test(String(drift.json?.stoppedBecause)) && (await pool.query('SELECT help_text FROM category_attributes WHERE id=$1', [target.id])).rows[0].help_text === 'Editado pelo admin depois da carga', drift.json?.stoppedBecause);
  const drift2 = cli(['apply', '--expect-hash', hash, '--confirm', phrase, '--journal', journal], env1);
  report('T16c apply tambem recusa quando ha deriva (nada e criado/alterado)', drift2.code === 1 && /DRIFT_DETECTED/.test(String(drift2.json?.stoppedBecause)) && (await count(P1)) === 847, drift2.json?.stoppedBecause);

  // ---------- reversao segura
  const rbPlan = cli(['rollback-plan'], env1);
  report('T17 rollback-plan (sem escrita): detecta o atributo editado pelo admin como NAO revertivel e para antes dele; nada e removido', rbPlan.code === 1 && rbPlan.json?.result?.blocked?.length === 1 && /editado pelo admin/.test(JSON.stringify(rbPlan.json?.result?.blocked)) && (await count(P1)) === 847, rbPlan.json?.result ?? rbPlan.raw);
  const rbPhrase = phrase.replace('APLICAR', 'REVERTER');
  await refuse2(cli(['rollback', '--expect-hash', hash, '--confirm', phrase], env1), 'T17b rollback com frase de APLICAR (confirmacao errada) => recusado', 'CONFIRMATION_REQUIRED', await count(P1));
  const rb = cli(['rollback', '--expect-hash', hash, '--confirm', rbPhrase, '--journal', journal], env1);
  const editedStill = (await pool.query('SELECT help_text FROM category_attributes WHERE id=$1', [target.id])).rows;
  report('T18 rollback real: PARA no atributo editado pelo admin, que continua existindo com a edicao; so foram removidas linhas seed nao editadas', rb.code === 1 && editedStill.length === 1 && editedStill[0].help_text === 'Editado pelo admin depois da carga' && (await count(P1)) < 847 && (await count(P1)) > 0 && (await n(P1, "SELECT count(*)::int n FROM category_attributes WHERE source='admin'")) === 0 && rb.json?.result?.removed === 847 - (await count(P1)), { code: rb.code, removed: rb.json?.result?.removed, left: await count(P1) });

  // atributo MANUAL (source=admin) com mesmo id de operacao da carga nunca e removido
  const P3 = await mkdb('p8b_l3');
  const env3 = { ATTR_LOAD_DATABASE_URL: urlFor('p8b_l3'), NODE_ENV: 'test' };
  const phrase3 = phrase.replace('p8b_l1', 'p8b_l3'); const rbPhrase3 = phrase3.replace('APLICAR', 'REVERTER');
  const ap3 = cli(['apply', '--expect-hash', hash, '--confirm', phrase3, '--journal', 'attribute-matrix-journal/test-8b-l3.jsonl'], env3);
  report('T19 apply completo em outro banco: 847 criadas em lotes de 50 (padrao), verificacao 322/322 sem divergencia', ap3.code === 0 && ap3.json?.result?.created === 847 && ap3.json?.result?.batches === 17 && ap3.json?.result?.verify?.mismatches === 0 && (await count(P3)) === 847, ap3.json?.result ?? ap3.raw);
  await P3.query("UPDATE category_attributes SET source='admin' WHERE id='attr_nsl_celulares-e-telefones-smartphones_memoria_ram'");
  const drift3 = cli(['plan'], env3);
  report('T20 linha com id da carga mas origem "admin" => DERIVA (source), nunca tratada como da carga', drift3.code === 1 && /DRIFT_DETECTED/.test(String(drift3.json?.stoppedBecause)), drift3.json?.stoppedBecause);
  await P3.query("UPDATE category_attributes SET source='seed' WHERE id='attr_nsl_celulares-e-telefones-smartphones_memoria_ram'");
  const rb3 = cli(['rollback', '--expect-hash', hash, '--confirm', rbPhrase3, '--journal', 'attribute-matrix-journal/test-8b-l3.jsonl'], env3);
  report('T21 REVERSAO completa sem edicoes: remove as 847 em ordem inversa (overrides antes dos alvos), 0 atributos restantes, auditoria system.attribute_matrix.rollback registrada', rb3.code === 0 && rb3.json?.result?.removed === 847 && (await count(P3)) === 0 && (await n(P3, "SELECT count(*)::int n FROM audit_logs WHERE action='system.attribute_matrix.rollback'")) === 1, rb3.json?.result ?? rb3.raw);
  const re3 = cli(['apply', '--expect-hash', hash, '--confirm', phrase3, '--journal', 'attribute-matrix-journal/test-8b-l3.jsonl'], env3);
  report('T22 reaplicar depois da reversao recria as 847 (ciclo aplicar/reverter/aplicar)', re3.code === 0 && (await count(P3)) === 847, re3.json?.result ?? re3.raw);

  await pool.end(); await P1.end(); await P3.end(); await admin.end();
  console.log(`\n=== RESULTADO: ${passed}/${total} ===`);
  process.exit(passed === total ? 0 : 1);

  function refuse2(r: { code: number | null; json: any; raw: string }, label: string, code: string, rows: number) {
    report(label, r.code !== 0 && JSON.stringify(r.json ?? r.raw).includes(code) && rows === 847 - 0 || (r.code !== 0 && JSON.stringify(r.json ?? r.raw).includes(code)), r.json ?? r.raw);
  }
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
