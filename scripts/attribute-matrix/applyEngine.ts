/**
 * FASE 8A — motor de APLICAÇÃO da matriz (preparado e testado em Postgres descartável; NÃO é usado em produção nesta fase).
 *
 * Propriedades exigidas pelo plano da Fase 8B:
 *   - passa SEMPRE pelo serviço real (attributeDefinitionService): mesmas validações, herança e proteções do painel admin;
 *   - IDEMPOTENTE: cada operação tem id determinístico (attr_nsl_<categoria>_<código>); existente e idêntica => "skipped";
 *     existente e DIFERENTE => "drift" (relatado, nunca sobrescrito);
 *   - por LOTES, em ordem raiz -> subcategoria; cada lote só avança se o anterior terminou; parada limpa em qualquer ponto
 *     (`stopAfter`) e retomada = rodar de novo (o que já existe é pulado);
 *   - dry-run (`dryRun`) calcula o que faria sem escrever nada;
 *   - REVERSÃO: remove em ordem inversa (overrides/desativações antes dos atributos que eles apontam) e PARA se algum atributo já
 *     tiver valores de produto (o serviço recusa a exclusão).
 */
import { and, eq } from 'drizzle-orm';
import { categoryAttributes } from '../../src/db/schema.js';
import { createAttribute, deleteAttribute, disableInheritedAttribute } from '../../src/server/modules/catalog/attributeDefinitionService.js';
import type { MatrixOperation } from '../../src/data/attributeMatrix/engine.js';

export interface ApplyOptions {
  dryRun?: boolean;
  batchSize?: number;
  /** Para depois de N operações EXECUTADAS (simula falha/queda para testar a retomada). */
  stopAfter?: number;
  /** Chamado ao final de cada lote (validação pós-lote / log). */
  onBatch?: (info: { batch: number; executed: number; skipped: number; drift: number }) => void | Promise<void>;
}
export interface ApplyResult {
  total: number;
  created: number;
  skipped: number;
  drift: Array<{ opId: string; category: string; field: string; expected: unknown; actual: unknown }>;
  errors: Array<{ opId: string; category: string; code?: string; message: string }>;
  batches: number;
  stoppedEarly: boolean;
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Campos que definem a identidade comercial do atributo — comparados para detectar "drift". */
function diffAgainstRow(op: MatrixOperation, row: any): Array<{ field: string; expected: unknown; actual: unknown }> {
  const p = op.payload as any;
  const out: Array<{ field: string; expected: unknown; actual: unknown }> = [];
  const cmp = (field: string, expected: unknown, actual: unknown) => { if (!sameJson(expected, actual)) out.push({ field, expected, actual }); };
  cmp('name', p.name, row.name); cmp('code', p.code, row.code); cmp('type', p.type, row.type); cmp('role', p.role, row.role);
  cmp('isRequired', p.isRequired, row.isRequired); cmp('options', p.optionsJson, row.optionsJson ?? null); cmp('unit', p.unit, row.unit ?? null);
  cmp('min', num(p.minValue), num(row.minValue)); cmp('max', num(p.maxValue), num(row.maxValue)); cmp('decimals', p.decimals, row.decimals ?? null);
  cmp('maxLength', p.maxLength, row.maxLength ?? null); cmp('group', p.displayGroup, row.displayGroup ?? null); cmp('order', p.sortOrder, row.sortOrder);
  cmp('filterable', p.isFilterable, row.isFilterable); cmp('active', true, row.isActive);
  return out;
}

export async function applyOperations(db: any, ops: MatrixOperation[], opts: ApplyOptions = {}): Promise<ApplyResult> {
  const batchSize = opts.batchSize ?? 100;
  const res: ApplyResult = { total: ops.length, created: 0, skipped: 0, drift: [], errors: [], batches: 0, stoppedEarly: false };
  let executedTotal = 0;
  for (let i = 0; i < ops.length; i += batchSize) {
    const batch = ops.slice(i, i + batchSize);
    let executed = 0, skipped = 0, drift = 0;
    for (const op of batch) {
      try {
        if (op.kind === 'disable') {
          const inheritedId = (op.payload as any).__disableInheritedId as string;
          const [inh] = await db.select().from(categoryAttributes).where(eq(categoryAttributes.id, inheritedId)).limit(1);
          const existing = inh ? await db.select().from(categoryAttributes).where(and(eq(categoryAttributes.categoryId, op.categoryId), eq(categoryAttributes.code, inh.code))).limit(1) : [];
          if (existing.length) {
            if (existing[0].isActive === false && existing[0].overridesId === inheritedId) { skipped++; continue; }
            drift++; res.drift.push({ opId: op.opId, category: op.categorySlug, field: 'disable', expected: 'override inativo', actual: { active: existing[0].isActive, overridesId: existing[0].overridesId } });
            continue;
          }
          if (opts.dryRun) { executed++; res.created++; continue; }
          if (opts.stopAfter !== undefined && executedTotal >= opts.stopAfter) { res.stoppedEarly = true; res.batches++; return res; }
          await disableInheritedAttribute(db, op.categoryId, inheritedId);
          executed++; executedTotal++; res.created++;
          continue;
        }
        const id = (op.payload as any).id as string;
        const [row] = await db.select().from(categoryAttributes).where(eq(categoryAttributes.id, id)).limit(1);
        if (row) {
          const d = diffAgainstRow(op, row);
          if (d.length === 0) { skipped++; continue; }
          drift++;
          for (const x of d) res.drift.push({ opId: op.opId, category: op.categorySlug, ...x });
          continue;
        }
        if (opts.dryRun) { executed++; res.created++; continue; }
        if (opts.stopAfter !== undefined && executedTotal >= opts.stopAfter) { res.stoppedEarly = true; res.batches++; return res; }
        await createAttribute(db, op.categoryId, op.payload as Record<string, any>);
        executed++; executedTotal++; res.created++;
      } catch (e: any) {
        res.errors.push({ opId: op.opId, category: op.categorySlug, code: e?.code, message: e?.message || String(e) });
        // um erro PARA o lote: nada depois depende de operação que falhou (herança) — a retomada continua daqui
        res.skipped += skipped;
        res.batches++;
        return res;
      }
    }
    res.skipped += skipped;
    res.batches++;
    if (opts.onBatch) await opts.onBatch({ batch: res.batches, executed, skipped, drift });
  }
  return res;
}

export interface RollbackResult { removed: number; blocked: Array<{ opId: string; message: string }> }

/** Reversão: ordem inversa; para no primeiro atributo que já tem valores de produto (nada é forçado). */
export async function rollbackOperations(db: any, ops: MatrixOperation[]): Promise<RollbackResult> {
  const out: RollbackResult = { removed: 0, blocked: [] };
  for (const op of [...ops].reverse()) {
    let id: string | null = null;
    if (op.kind === 'disable') {
      const inheritedId = (op.payload as any).__disableInheritedId as string;
      const [inh] = await db.select().from(categoryAttributes).where(eq(categoryAttributes.id, inheritedId)).limit(1);
      if (!inh) continue;
      const [ov] = await db.select().from(categoryAttributes).where(and(eq(categoryAttributes.categoryId, op.categoryId), eq(categoryAttributes.code, inh.code))).limit(1);
      id = ov?.id ?? null;
    } else {
      id = (op.payload as any).id as string;
    }
    if (!id) continue;
    const [row] = await db.select({ id: categoryAttributes.id }).from(categoryAttributes).where(eq(categoryAttributes.id, id)).limit(1);
    if (!row) continue;
    try {
      await deleteAttribute(db, id);
      out.removed++;
    } catch (e: any) {
      out.blocked.push({ opId: op.opId, message: e?.message || String(e) });
      return out;
    }
  }
  return out;
}
