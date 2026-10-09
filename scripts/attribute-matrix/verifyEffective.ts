/**
 * FASE 8B — verificação "estado esperado x estado encontrado": para TODAS as categorias, os atributos EFETIVOS que o serviço real devolve
 * (herança, substituição e desativação incluídas) têm de ser exatamente os que o resolvedor puro da matriz previu. Somente leitura.
 */
import { resolveEffectiveAttributes } from '../../src/server/modules/catalog/attributeDefinitionService.js';
import type { EffectiveAttribute } from '../../src/data/attributeMatrix/engine.js';

export interface EffectiveMismatch { slug: string; kind: string; detail?: unknown }

const norm = (a: any) => JSON.stringify([a.code, a.name, a.type, a.role, !!a.required, a.unit ?? null, a.options ?? null, a.min ?? null, a.max ?? null, a.decimals ?? null, a.maxLength ?? null, a.group ?? null, a.order, !!a.filterable]);
const realNorm = (a: any) => JSON.stringify([a.code, a.name, a.type, a.role, !!a.isRequired, a.unit ?? null, a.optionsJson ?? null, a.minValue ?? null, a.maxValue ?? null, a.decimals ?? null, a.maxLength ?? null, a.displayGroup ?? null, a.sortOrder, !!a.isFilterable]);

export async function verifyEffective(
  db: any,
  expected: Map<string, EffectiveAttribute[]>,
  categoryIdBySlug: Map<string, string>,
): Promise<{ checked: number; mismatches: EffectiveMismatch[] }> {
  const mismatches: EffectiveMismatch[] = [];
  let checked = 0;
  for (const [slug, list] of expected) {
    const id = categoryIdBySlug.get(slug);
    if (!id) { mismatches.push({ slug, kind: 'categoria-ausente' }); continue; }
    checked++;
    const real = await resolveEffectiveAttributes(db, id);
    const exp = list.map(norm).sort();
    const got = real.map(realNorm).sort();
    if (JSON.stringify(exp) !== JSON.stringify(got)) {
      mismatches.push({ slug, kind: 'campos', detail: { esperados: exp.length, encontrados: got.length, faltando: exp.filter((x) => !got.includes(x)).slice(0, 1), sobrando: got.filter((x) => !exp.includes(x)).slice(0, 1) } });
      continue;
    }
    if (JSON.stringify(real.map((a: any) => a.code)) !== JSON.stringify(list.map((a) => a.code))) mismatches.push({ slug, kind: 'ordem' });
    for (const a of list) {
      const r = real.find((x: any) => x.code === a.code);
      if (!r) continue;
      const ok = (r.originCategoryId ?? null) === (categoryIdBySlug.get(a.originSlug) ?? null) && Boolean(r.isInherited) === a.inherited && Boolean(r.isOverride) === a.overridden;
      if (!ok) mismatches.push({ slug, kind: 'origem', detail: { code: a.code, esperado: [a.originSlug, a.inherited, a.overridden], real: [r.originCategoryName, r.isInherited, r.isOverride] } });
    }
  }
  return { checked, mismatches };
}
