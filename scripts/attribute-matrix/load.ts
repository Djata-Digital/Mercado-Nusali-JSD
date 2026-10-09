/**
 * FASE 8B — CARREGADOR CONTROLADO da matriz de atributos (sobre applyOperations). Preparado e testado SOMENTE em PostgreSQL local
 * descartável. Escrita em banco remoto/produção está DESLIGADA no código (ver loaderSafety.ts) e exige fase própria autorizada.
 *
 *   npx tsx scripts/attribute-matrix/load.ts <comando> [opções]
 *
 * Comandos
 *   plan           pré-voo + dry-run (nenhuma escrita). Mostra o hash da matriz e a frase de confirmação.
 *   verify         compara estado esperado x encontrado em TODAS as categorias (efetivos, herança, origem). Nenhuma escrita.
 *   apply          aplica em lotes, idempotente, com diário e auditoria. Exige --expect-hash e --confirm "<frase>".
 *   rollback-plan  mostra o que a reversão removeria (somente source='seed', nunca editado). Nenhuma escrita.
 *   rollback       reverte em ordem inversa. Mesmas travas do apply.
 *
 * Opções: --batch-size N (padrão 50) · --stop-after N (teste de queda) · --journal <arquivo.jsonl> · --report <arquivo.json>
 *         --allow-remote-read (só leitura em banco remoto, sessão READ ONLY imposta) · --expect-hash <sha256> · --confirm "<frase>"
 *
 * Ambiente: ATTR_LOAD_DATABASE_URL (única fonte do alvo; DATABASE_URL NUNCA é usada para conectar — só para RECUSAR produção).
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../../src/db/schema.js';
import { ALL_PLANS, MATRIX_VERSION } from '../../src/data/attributeMatrix/index.js';
import { buildTree, compileOperations, resolveMatrix, validateMatrix, type InventoryCategory } from '../../src/data/attributeMatrix/engine.js';
import { applyOperations, rollbackOperations, type OperationLogEntry } from './applyEngine.js';
import { verifyEffective } from './verifyEffective.js';
import { INVENTORY_FILE, outDirFor } from './paths.js';
import { LoaderSafetyError, assertExecutionAllowed, classifyTarget, expectedConfirmPhrase, hashOperations, type CommandName } from './loaderSafety.js';

const COMMANDS = new Set<CommandName>(['plan', 'verify', 'apply', 'rollback-plan', 'rollback']);

function parseArgs(argv: string[]) {
  const [command, ...rest] = argv;
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) throw new LoaderSafetyError('ARGUMENT_INVALID', `Argumento inesperado: ${a}`);
    const key = a.slice(2);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) flags[key] = true;
    else { flags[key] = next; i++; }
  }
  return { command, flags };
}

export interface LoadReport {
  command: CommandName;
  runId: string;
  matrixVersion: string;
  matrixHash: string;
  target: string;
  readOnlySession: boolean;
  preflight: Record<string, unknown>;
  result?: Record<string, unknown>;
  ok: boolean;
  stoppedBecause?: string;
}

class Journal {
  private fd: number | null = null;
  constructor(private file: string | null) {
    if (file) { fs.mkdirSync(path.dirname(file), { recursive: true }); this.fd = fs.openSync(file, 'a'); }
  }
  write(entry: Record<string, unknown>) {
    if (this.fd === null) return;
    fs.writeSync(this.fd, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
    fs.fsyncSync(this.fd);
  }
  close() { if (this.fd !== null) { fs.closeSync(this.fd); this.fd = null; } }
}

/** Pré-voo: ambiente, esquema, árvore de categorias, versão/hash/validação da matriz. Lança em qualquer divergência. */
async function preflight(db: any, inv: { categories: any[] }, summary: any) {
  const out: Record<string, unknown> = {};
  // 1. esquema: colunas e CHECK de origem aceitando 'seed'
  const cols = (await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'category_attributes'`)).rows.map((r: any) => r.column_name);
  const need = ['role', 'overrides_id', 'is_filterable', 'display_group', 'source', 'admin_modified_at', 'min_value', 'max_value', 'decimals'];
  const missing = need.filter((c) => !cols.includes(c));
  if (missing.length) throw new LoaderSafetyError('SCHEMA_MISMATCH', `category_attributes sem as colunas: ${missing.join(', ')}. O banco não está no esquema esperado.`);
  const chk = (await db.execute(sql`SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conname = 'category_attributes_source_check'`)).rows[0]?.d || '';
  if (!/seed/.test(chk)) throw new LoaderSafetyError('SCHEMA_MISMATCH', "O CHECK de origem de category_attributes não aceita 'seed'.");
  out.schema = { columns: cols.length, sourceCheck: 'ok' };

  // 2. árvore de categorias do banco == inventário auditado (nada a mais, nada a menos, nada movido/renomeado)
  const rows = (await db.execute(sql`SELECT id, slug, parent_id FROM categories`)).rows as Array<{ id: string; slug: string; parent_id: string | null }>;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const invById = new Map(inv.categories.map((c: any) => [c.id, c]));
  const missingInDb = inv.categories.filter((c: any) => !byId.has(c.id)).map((c: any) => c.slug);
  const extraInDb = rows.filter((r) => !invById.has(r.id)).map((r) => r.slug);
  const changed = inv.categories.filter((c: any) => byId.has(c.id) && (byId.get(c.id)!.slug !== c.slug || (byId.get(c.id)!.parent_id ?? null) !== (c.parent_id ?? null))).map((c: any) => c.slug);
  out.tree = { inventory: inv.categories.length, database: rows.length, missingInDb: missingInDb.length, extraInDb: extraInDb.length, changed: changed.length };
  if (missingInDb.length || extraInDb.length || changed.length) {
    throw new LoaderSafetyError('CATEGORY_TREE_MISMATCH', `A árvore de categorias do banco difere do inventário auditado (faltando ${missingInDb.length}, a mais ${extraInDb.length}, alteradas ${changed.length}). Ex.: ${[...missingInDb, ...extraInDb, ...changed].slice(0, 3).join(', ')}. Nada será aplicado.`);
  }

  // 3. matriz: validador sem erros, hash == artefato revisado
  const tree = buildTree(inv.categories as InventoryCategory[]);
  const resolution = resolveMatrix(ALL_PLANS, tree);
  const report = validateMatrix(ALL_PLANS, tree, resolution);
  const errors = report.issues.filter((i) => i.severity === 'error');
  if (errors.length) throw new LoaderSafetyError('MATRIX_INVALID', `A matriz tem ${errors.length} erro(s) de validação (ex.: ${errors[0].rule} em ${errors[0].category}).`);
  const ops = compileOperations(ALL_PLANS, tree, resolution);
  const hash = hashOperations(ops);
  if (summary?.version !== MATRIX_VERSION) throw new LoaderSafetyError('MATRIX_VERSION_MISMATCH', `Versão do código (${MATRIX_VERSION}) difere da versão revisada (${summary?.version}).`);
  if (summary?.operationsHash && summary.operationsHash !== hash) throw new LoaderSafetyError('REVIEWED_ARTIFACT_MISMATCH', 'As operações compiladas não coincidem com as do artefato revisado (summary.json). Regenerar e revisar de novo.');
  out.matrix = { version: MATRIX_VERSION, operations: ops.length, hash, validatorErrors: 0, warnings: report.issues.filter((i) => i.severity === 'warning').length };
  return { out, tree, resolution, ops, hash };
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (!command || !COMMANDS.has(command as CommandName)) throw new LoaderSafetyError('COMMAND_INVALID', `Use um dos comandos: ${[...COMMANDS].join(', ')}.`);
  const cmd = command as CommandName;
  const rawUrl = process.env.ATTR_LOAD_DATABASE_URL;
  if (!rawUrl) throw new LoaderSafetyError('TARGET_NOT_SET', 'Defina ATTR_LOAD_DATABASE_URL com o alvo (PostgreSQL local descartável). DATABASE_URL nunca é usada por este carregador.');
  const target = classifyTarget(rawUrl, process.env);

  const inv = JSON.parse(fs.readFileSync(INVENTORY_FILE, 'utf8'));
  const summary = JSON.parse(fs.readFileSync(path.join(outDirFor(MATRIX_VERSION), 'summary.json'), 'utf8'));
  const tree0 = buildTree(inv.categories);
  const ops0 = compileOperations(ALL_PLANS, tree0, resolveMatrix(ALL_PLANS, tree0));
  const hash0 = hashOperations(ops0);

  const { readOnly } = assertExecutionAllowed({
    command: cmd, target, nodeEnv: process.env.NODE_ENV, matrixVersion: MATRIX_VERSION, matrixHash: hash0,
    flags: { allowRemoteRead: flags['allow-remote-read'] === true, expectHash: typeof flags['expect-hash'] === 'string' ? (flags['expect-hash'] as string) : undefined, confirm: typeof flags['confirm'] === 'string' ? (flags['confirm'] as string) : undefined },
  });

  const runId = `run_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}_${randomBytes(3).toString('hex')}`;
  const journalFile = typeof flags['journal'] === 'string' ? (flags['journal'] as string) : (readOnly ? null : path.join('attribute-matrix-journal', `${runId}.jsonl`));
  const journal = new Journal(journalFile);
  const pool = new pg.Pool({
    connectionString: rawUrl,
    max: 2,
    // sessão SOMENTE LEITURA imposta pelo próprio banco quando o comando não escreve (qualquer escrita acidental falha no servidor)
    ...(readOnly ? { options: '-c default_transaction_read_only=on' } : {}),
    ssl: target.isLocal ? (/sslmode=disable/.test(rawUrl) ? false : { rejectUnauthorized: false }) : { rejectUnauthorized: false },
  });
  const db = drizzle(pool, { schema });
  const report: LoadReport = { command: cmd, runId, matrixVersion: MATRIX_VERSION, matrixHash: hash0, target: target.label, readOnlySession: readOnly, preflight: {}, ok: false };

  try {
    journal.write({ event: 'start', runId, command: cmd, matrixVersion: MATRIX_VERSION, matrixHash: hash0, target: target.label, readOnly });
    const pf = await preflight(db, inv, summary);
    report.preflight = pf.out;
    const idBySlug = new Map<string, string>(inv.categories.map((c: any) => [c.slug, c.id]));
    const batchSize = typeof flags['batch-size'] === 'string' ? Math.max(1, Number(flags['batch-size'])) : 50;
    const stopAfter = typeof flags['stop-after'] === 'string' ? Number(flags['stop-after']) : undefined;

    const seedCount = async () => Number((await db.execute(sql`SELECT count(*)::int AS n FROM category_attributes WHERE source = 'seed'`)).rows[0].n);
    const onOperation = (e: OperationLogEntry) => journal.write({ event: 'op', ...e });

    if (cmd === 'plan' || cmd === 'apply') {
      // estado encontrado x esperado, sem escrever (dry-run)
      const dry = await applyOperations(db, pf.ops, { dryRun: true, batchSize: 1000 });
      report.preflight.state = { wouldCreate: dry.created, alreadyPresent: dry.skipped, drift: dry.drift.length, foreign: dry.foreign.length, errors: dry.errors.length };
      if (dry.errors.length) throw new LoaderSafetyError('DRY_RUN_ERRORS', `O dry-run encontrou ${dry.errors.length} erro(s): ${dry.errors[0].message}`);
      if (dry.drift.length) {
        report.result = { drift: dry.drift.slice(0, 20) };
        throw new LoaderSafetyError('DRIFT_DETECTED', `${dry.drift.length} divergência(s) entre o banco e a matriz (ex.: ${dry.drift[0].category} / ${dry.drift[0].field}). Nada será sobrescrito: resolva manualmente.`);
      }
      if (cmd === 'plan') {
        report.result = { confirmPhrase: expectedConfirmPhrase('apply', target, MATRIX_VERSION, hash0), expectHash: hash0 };
        report.ok = true;
      } else {
        // ---- escrita em lotes (travas já verificadas acima)
        const before = await seedCount();
        let executedSoFar = 0;
        const batchErrors: string[] = [];
        const res = await applyOperations(db, pf.ops, {
          batchSize, stopAfter,
          onOperation,
          onBatch: async (b) => {
            executedSoFar += b.executed;
            const now = await seedCount();
            // validação pós-lote: linhas da carga no banco == anteriores + criadas até aqui
            if (now !== before + executedSoFar) batchErrors.push(`lote ${b.batch}: banco=${now}, esperado=${before + executedSoFar}`);
            journal.write({ event: 'batch', ...b, seedRowsInDb: now, expected: before + executedSoFar });
            await db.insert(schema.auditLogs).values({
              id: `audit_${Date.now()}_${randomBytes(3).toString('hex')}`, actorUserId: null, action: 'system.attribute_matrix.batch_applied', resource: 'category_attributes',
              resourceId: null, detailsJson: { runId, matrixVersion: MATRIX_VERSION, matrixHash: hash0, batch: b.batch, executed: b.executed, skipped: b.skipped, drift: b.drift, seedRowsInDb: now },
              ipAddress: null, userAgent: 'attribute-matrix-loader', countryCode: null, createdAt: new Date(),
            } as any);
            if (batchErrors.length) throw new LoaderSafetyError('POST_BATCH_VALIDATION_FAILED', batchErrors[0]);
          },
        });
        report.result = { created: res.created, skipped: res.skipped, drift: res.drift.length, errors: res.errors, stoppedEarly: res.stoppedEarly, batches: res.batches, seedRowsAfter: await seedCount() };
        if (res.errors.length) throw new LoaderSafetyError('APPLY_ERROR', `${res.errors[0].opId}: ${res.errors[0].message}`);
        if (!res.stoppedEarly) {
          const v = await verifyEffective(db, pf.resolution.effective, idBySlug);
          (report.result as any).verify = { checked: v.checked, mismatches: v.mismatches.length };
          if (v.mismatches.length) throw new LoaderSafetyError('POST_APPLY_VERIFY_FAILED', `${v.mismatches.length} divergência(s) nos atributos efetivos após a carga (ex.: ${v.mismatches[0].slug}/${v.mismatches[0].kind}).`);
        }
        report.ok = true;
        if (res.stoppedEarly) report.stoppedBecause = 'stop-after (parada simulada; rode apply de novo para retomar)';
      }
    } else if (cmd === 'verify') {
      const v = await verifyEffective(db, pf.resolution.effective, idBySlug);
      report.result = { checked: v.checked, mismatches: v.mismatches.slice(0, 20), mismatchCount: v.mismatches.length, seedRows: await seedCount() };
      report.ok = v.mismatches.length === 0;
    } else {
      const dryRb = cmd === 'rollback-plan';
      const rb = await rollbackOperations(db, pf.ops, { dryRun: dryRb, onOperation });
      report.result = { removed: rb.removed, wouldRemove: rb.wouldRemove, blocked: rb.blocked, notOwned: rb.notOwned.length };
      report.ok = rb.blocked.length === 0;
      if (!dryRb) await db.insert(schema.auditLogs).values({
        id: `audit_${Date.now()}_${randomBytes(3).toString('hex')}`, actorUserId: null, action: 'system.attribute_matrix.rollback', resource: 'category_attributes', resourceId: null,
        detailsJson: { runId, matrixVersion: MATRIX_VERSION, matrixHash: hash0, removed: rb.removed, blocked: rb.blocked.length }, ipAddress: null, userAgent: 'attribute-matrix-loader', countryCode: null, createdAt: new Date(),
      } as any);
    }
    journal.write({ event: 'end', ok: report.ok, result: report.result });
  } catch (e: any) {
    report.ok = false;
    report.stoppedBecause = e instanceof LoaderSafetyError ? e.message : `ERROR: ${e?.message || e}`;
    journal.write({ event: 'abort', reason: report.stoppedBecause });
  } finally {
    journal.close();
    await pool.end();
  }
  if (typeof flags['report'] === 'string') fs.writeFileSync(flags['report'] as string, JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report, null, 1));
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  // falhas de configuração/segurança antes de qualquer conexão
  console.error(JSON.stringify({ ok: false, refused: e instanceof LoaderSafetyError ? e.message : String(e?.message || e) }, null, 1));
  process.exit(2);
});
