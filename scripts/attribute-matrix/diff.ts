/**
 * FASE 8B — compara duas versões da matriz (operations.json de cada uma) para rastreabilidade: o que mudou da v1 (Fase 8A) para a v2 (8B).
 * Uso: npx tsx scripts/attribute-matrix/diff.ts v1 v2   -> grava docs/attribute-matrix/<novo>/CHANGES-vs-<antigo>.md
 */
import fs from 'fs';
import path from 'path';

const [oldV, newV] = process.argv.slice(2);
if (!oldV || !newV) { console.error('Uso: diff.ts <versaoAntiga> <versaoNova>  (ex.: v1 v2)'); process.exit(2); }
const load = (v: string) => JSON.parse(fs.readFileSync(path.join('docs', 'attribute-matrix', v, 'operations.json'), 'utf8'));
const A = load(oldV), B = load(newV);
const byId = (o: any) => new Map<string, any>(o.operations.map((x: any) => [x.opId, x]));
const a = byId(A), b = byId(B);
const added = [...b.keys()].filter((k) => !a.has(k));
const removed = [...a.keys()].filter((k) => !b.has(k));
const FIELDS = ['name', 'code', 'type', 'role', 'isRequired', 'optionsJson', 'unit', 'minValue', 'maxValue', 'decimals', 'maxLength', 'displayGroup', 'sortOrder', 'isFilterable', 'isActive', 'placeholder', 'helpText'];
const changes: Array<{ opId: string; category: string; field: string; before: unknown; after: unknown }> = [];
for (const [id, op] of b) {
  const old = a.get(id);
  if (!old) continue;
  for (const f of FIELDS) {
    const x = JSON.stringify(old.payload?.[f] ?? null), y = JSON.stringify(op.payload?.[f] ?? null);
    if (x !== y) changes.push({ opId: id, category: op.categorySlug, field: f, before: old.payload?.[f] ?? null, after: op.payload?.[f] ?? null });
  }
}
const optionAdds = changes.filter((c) => c.field === 'optionsJson' && Array.isArray(c.before) && Array.isArray(c.after) && (c.after as string[]).length === (c.before as string[]).length + 1 && (c.after as string[]).slice(0, -1).join('|') === (c.before as string[]).join('|'));
const requiredOff = changes.filter((c) => c.field === 'isRequired' && c.before === true && c.after === false);
const others = changes.filter((c) => !optionAdds.includes(c) && !requiredOff.includes(c));
let md = `# Mudanças ${oldV} → ${newV}\n\n> Gerado por \`scripts/attribute-matrix/diff.ts\`. A matriz ${oldV} (Fase 8A) permanece intacta em \`docs/attribute-matrix/${oldV}/\` e no histórico do git.\n\n`;
md += `- Operações: ${A.count} → ${B.count} (novas: ${added.length}, removidas: ${removed.length}).\n- Opção de saída acrescentada a select obrigatório: **${optionAdds.length}** atributos.\n- Obrigatório → opcional: **${requiredOff.length}** atributos.\n- Outras alterações de campo: **${others.length}**.\n\n`;
md += `## Opção de saída ("${(optionAdds[0]?.after as string[] | undefined)?.slice(-1)[0] ?? 'Outro'}") acrescentada a selects obrigatórios\n\nMotivo: um select obrigatório sem saída impede o vendedor cujo produto não está na lista de anunciar. Listas fechadas por natureza (nº de portas, faixa de idade, nível de ensino, estado de conservação) ficam como estavam.\n\n`;
md += optionAdds.map((c) => `- \`${c.category}\` · ${c.opId.split('_').slice(-1)[0]}`).join('\n') + '\n\n';
md += `## Obrigatório → opcional\n\nMotivo: informação difícil de obter para muitos vendedores ou que não decide a compra sozinha; continua aparecendo na ficha quando informada.\n\n`;
md += requiredOff.map((c) => `- \`${c.category}\` · ${c.opId}`).join('\n') + '\n\n';
if (others.length) md += `## Outras alterações\n\n` + others.map((c) => `- \`${c.category}\` · ${c.field}: ${JSON.stringify(c.before)} → ${JSON.stringify(c.after)}`).join('\n') + '\n\n';
if (added.length || removed.length) md += `## Operações novas/removidas\n\n${added.map((x) => `- + ${x}`).join('\n')}\n${removed.map((x) => `- − ${x}`).join('\n')}\n`;
const out = path.join('docs', 'attribute-matrix', newV, `CHANGES-vs-${oldV}.md`);
fs.writeFileSync(out, md.replace(/\s+$/, '') + '\n');
console.log(JSON.stringify({ out, ops: [A.count, B.count], added: added.length, removed: removed.length, optionAdds: optionAdds.length, requiredOff: requiredOff.length, others: others.length }));
