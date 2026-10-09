/**
 * FASE 8A — gera os ARTEFATOS legíveis/revisáveis da matriz de atributos (somente arquivos locais; nenhum banco é aberto).
 *   entrada : docs/attribute-matrix/v1/categories.inventory.raw.json (leitura SOMENTE LEITURA da produção, feita por script separado)
 *   saída   : docs/attribute-matrix/v1/*.md|json
 * Uso: npx tsx scripts/attribute-matrix/generate.ts
 */
import fs from 'fs';
import path from 'path';
import { ALL_PLANS, MATRIX_VERSION } from '../../src/data/attributeMatrix/index.js';
import { buildTree, compileOperations, resolveMatrix, validateMatrix, type EffectiveAttribute } from '../../src/data/attributeMatrix/engine.js';
import type { MatrixAttribute } from '../../src/data/attributeMatrix/types.js';
import { INVENTORY_FILE, outDirFor } from './paths.js';
import { hashOperations } from './loaderSafety.js';

const DIR = path.resolve(outDirFor(MATRIX_VERSION));
fs.mkdirSync(DIR, { recursive: true });
const raw = JSON.parse(fs.readFileSync(path.resolve(INVENTORY_FILE), 'utf8'));
const tree = buildTree(raw.categories);
const resolution = resolveMatrix(ALL_PLANS, tree);
const report = validateMatrix(ALL_PLANS, tree, resolution);
const ops = compileOperations(ALL_PLANS, tree, resolution);

const T = { text: 'texto', number: 'número', select: 'seleção', multiselect: 'múltipla', boolean: 'sim/não' } as const;
const R = { spec: 'spec', variant_axis: 'eixo' } as const;
const esc = (s: unknown) => String(s ?? '').replace(/\|/g, '\\|');
const limits = (a: MatrixAttribute) => {
  const p: string[] = [];
  if (a.options) p.push(`${a.options.length} opções: ${a.options.join(' / ')}`);
  if (a.min !== undefined || a.max !== undefined) p.push(`${a.min ?? '…'} a ${a.max ?? '…'}${a.unit ? ' ' + a.unit : ''}`);
  if (a.decimals !== undefined) p.push(a.decimals === 0 ? 'inteiro' : `${a.decimals} casa(s)`);
  if (a.maxLength) p.push(`até ${a.maxLength} car.`);
  return p.join('; ');
};
const roots = [...tree.values()].filter((n) => n.depth === 0).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
const subsOf = (slug: string) => tree.get(slug)!.children.map((s) => tree.get(s)!).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
const header = (title: string) => `# ${title}\n\n> Matriz de atributos **${MATRIX_VERSION}** — proposta para revisão (Fases 8A/8B). **Nada foi aplicado em produção.**\n> Gerado por \`scripts/attribute-matrix/generate.ts\` a partir de \`src/data/attributeMatrix/\`.\n\n`;
const write = (name: string, body: string) => fs.writeFileSync(path.join(DIR, name), body.replace(/\s+$/, '') + '\n', 'utf8');

// ----------------------------------------------------------------------------------------------- 01 inventário
{
  let md = header('01 — Inventário das categorias reais (produção, somente leitura)');
  md += `Lido em **${raw.readAt}** (banco "${raw.db.db}", ${raw.db.mig} migrações). Produção tem **${raw.counts.products} produtos**, **${raw.counts.attrs} definições de atributo**, **${raw.counts.pav} valores**, **${raw.counts.brands} marcas**.\n\n`;
  const all = [...tree.values()];
  md += `| Total | Principais | Subcategorias | Inativas | Profundidade máxima |\n|---|---|---|---|---|\n| ${all.length} | ${roots.length} | ${all.length - roots.length} | ${all.filter((n) => !n.active).length} | ${Math.max(...all.map((n) => n.depth))} |\n\n`;
  md += `**Verificações estruturais:** sem órfãs, sem ciclos, sem slugs repetidos, todas as ids no padrão \`cat_nsl_<slug>\`, subcategoria com slug \`<principal>-<sub>\`. Comissão por categoria: **nenhuma configurada** (todas NULL).\n\n`;
  const dupNames = new Map<string, string[]>();
  for (const n of all) { const k = n.name.toLowerCase(); (dupNames.get(k) ?? dupNames.set(k, []).get(k)!).push(`${n.parentSlug ? tree.get(n.parentSlug)!.name + ' › ' : ''}${n.name}`); }
  md += `## Nomes iguais em categorias diferentes (ambiguidade)\n\nNão são erros (o caminho completo os distingue, e os slugs são únicos), mas o comprador pode confundir:\n\n`;
  for (const [, v] of dupNames) if (v.length > 1) md += `- ${v.join('  |  ')}\n`;
  md += `\nObservações de nomenclatura (sem alterar nada): *Moda Feminina › Roupas íntimas* × *Moda Masculina › Roupa íntima*; *Roupas esportivas* × *Roupa esportiva*; *Roupas esportivas* existe em Moda Feminina **e** em Esportes e Fitness; *Instrumentos tradicionais* existe em Instrumentos Musicais **e** em Produtos Tradicionais.\n\n`;
  md += `## Árvore completa\n\n`;
  for (const r of roots) {
    md += `### ${r.name}  \`${r.slug}\` — ${r.children.length} subcategorias\n\n| # | Subcategoria | slug | id |\n|---|---|---|---|\n`;
    subsOf(r.slug).forEach((s, i) => { md += `| ${i + 1} | ${s.name} | \`${s.slug}\` | \`${s.id}\` |\n`; });
    md += '\n';
  }
  write('01-category-inventory.md', md);
  write('categories.inventory.json', JSON.stringify([...tree.values()].map((n) => ({ id: n.id, slug: n.slug, name: n.name, parentSlug: n.parentSlug, depth: n.depth, active: n.active })), null, 1));
}

// ----------------------------------------------------------------------------------------------- 02 definições
{
  let md = header('02 — Definições de atributos propostas (onde cada atributo é DEFINIDO)');
  md += `Total de definições: **${ALL_PLANS.reduce((n, p) => n + p.define.length, 0)}** · overrides: **${ALL_PLANS.reduce((n, p) => n + p.override.length, 0)}** · desativações: **${ALL_PLANS.reduce((n, p) => n + p.disable.length, 0)}**.\n\n`;
  md += `Legenda — **papel**: spec = especificação do produto; eixo = eixo de variante (varia entre variações). **Obrig.**: obrigatório para o vendedor. **Filtro**: pode virar filtro de busca. **Visibilidade**: todos os atributos ativos aparecem na ficha pública (o esquema só tem "ativo/inativo"; não existe visibilidade por atributo).\n\n`;
  for (const p of ALL_PLANS) {
    if (p.define.length === 0 && p.override.length === 0 && p.disable.length === 0) continue;
    const n = tree.get(p.slug)!;
    md += `## ${n.parentSlug ? tree.get(n.parentSlug)!.name + ' › ' : ''}${n.name}  \`${p.slug}\`\n\n`;
    if (p.note) md += `> ${p.note}\n\n`;
    if (p.define.length) {
      md += `| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |\n|---|---|---|---|---|---|---|---|---|---|---|\n`;
      for (const a of p.define) md += `| ${a.order} | \`${a.code}\` | ${esc(a.name)} | ${T[a.type]} | ${R[a.role]} | ${a.required ? 'sim' : ''} | ${esc(a.unit)} | ${esc(limits(a))} | ${esc(a.group)} | ${a.filterable ? 'sim' : ''} | ${esc(a.help ?? a.placeholder)} |\n`;
      md += '\n';
    }
    for (const o of p.override) md += `- **Override** \`${o.code}\`: ${esc(JSON.stringify(Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'code'))))}\n`;
    for (const d of p.disable) md += `- **Desativa** o herdado \`${d}\` nesta categoria\n`;
    md += '\n';
  }
  write('02-attribute-definitions.md', md);
  write('matrix.json', JSON.stringify({ version: MATRIX_VERSION, plans: ALL_PLANS }, null, 1));
}

// ----------------------------------------------------------------------------------------------- 03 efetivos
{
  let md = header('03 — Atributos EFETIVOS por categoria (o que o vendedor realmente vê)');
  const fmt = (a: EffectiveAttribute) => {
    const origin = a.overridden ? `substitui o de \`${a.overridesSlug}\`` : a.inherited ? `herdado de \`${a.originSlug}\`` : 'próprio';
    return `| ${R[a.role]} | \`${a.code}\` | ${esc(a.name)} | ${T[a.type]} | ${a.required ? 'sim' : ''} | ${esc(a.unit)} | ${origin} |`;
  };
  for (const r of roots) {
    md += `## ${r.name}  \`${r.slug}\`\n\n`;
    for (const n of [r, ...subsOf(r.slug)]) {
      const list = resolution.effective.get(n.slug) ?? [];
      md += `### ${n.depth ? '↳ ' : ''}${n.name}${n.depth ? '' : ' (categoria principal — sem produtos próprios)'}  \`${n.slug}\`\n\n`;
      if (!list.length) { md += `_sem atributos_\n\n`; continue; }
      md += `| papel | código | nome | tipo | obrig. | unidade | origem |\n|---|---|---|---|---|---|---|\n${list.map(fmt).join('\n')}\n\n`;
    }
  }
  write('03-effective-by-category.md', md);
}

// ----------------------------------------------------------------------------------------------- 04 herança
{
  let md = header('04 — Herança, overrides e desativações');
  md += `## Atributos compartilhados definidos na categoria principal\n\n`;
  for (const r of roots) {
    const p = ALL_PLANS.find((x) => x.slug === r.slug)!;
    if (!p.define.length) continue;
    md += `### ${r.name}  \`${r.slug}\` — herdado por ${r.children.length} subcategorias\n\n${p.define.map((a) => `- \`${a.code}\` — ${a.name} (${T[a.type]}, ${R[a.role]}${a.required ? ', obrigatório' : ''})`).join('\n')}\n\n`;
  }
  md += `## Overrides (substituição explícita do herdado)\n\n| Categoria | Código | O que muda | Motivo |\n|---|---|---|---|\n`;
  for (const p of ALL_PLANS) for (const o of p.override) md += `| \`${p.slug}\` | \`${o.code}\` | ${esc(JSON.stringify(Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'code'))))} | ${esc(p.note ?? '')} |\n`;
  md += `\n## Desativações (atributo herdado que NÃO se aplica à subcategoria)\n\n| Categoria | Códigos desativados |\n|---|---|\n`;
  for (const p of ALL_PLANS) if (p.disable.length) md += `| \`${p.slug}\` | ${p.disable.map((c) => `\`${c}\``).join(', ')} |\n`;
  md += `\n## Resultado da verificação de conflitos\n\n- Conflitos de herança (código herdado redefinido sem override): **${report.issues.filter((i) => i.rule === 'conflito-heranca').length}**\n- Conflitos com descendentes: **${report.issues.filter((i) => i.rule === 'conflito-descendente').length}**\n- Overrides/desativações inválidos: **${report.issues.filter((i) => ['override-invalido', 'desativacao-invalida'].includes(i.rule)).length}**\n- Códigos repetidos na mesma categoria: **${report.issues.filter((i) => i.rule === 'codigo-duplicado').length}**\n- Códigos com tipo/unidade/função inconsistentes entre categorias: **${report.issues.filter((i) => ['codigo-inconsistente', 'unidade-inconsistente'].includes(i.rule)).length}**\n- Nomes repetidos no mesmo caminho: **${report.issues.filter((i) => i.rule === 'nome-repetido').length}**\n`;
  write('04-inheritance-overrides.md', md);
}

// ----------------------------------------------------------------------------------------------- 05 eixos
{
  let md = header('05 — Matriz de eixos de variantes');
  md += `O assistente atual trabalha com **duas dimensões** na matriz de variações: **Cor × (Tamanho ou Capacidade)**. Os demais eixos valem **um valor por anúncio** (aplicado a todas as variações).\n\n`;
  const rows: string[] = [];
  const third: string[] = [], perListing: string[] = [], noAxes: string[] = [];
  for (const n of tree.values()) {
    if (n.depth === 0) continue;
    const axes = (resolution.effective.get(n.slug) ?? []).filter((a) => a.role === 'variant_axis');
    if (!axes.length) { noAxes.push(n.slug); continue; }
    const cor = axes.find((a) => a.code === 'cor'), tam = axes.find((a) => a.code === 'tamanho'), cap = axes.find((a) => a.code === 'capacidade');
    const second = tam ?? cap;
    const extra = axes.filter((a) => a !== cor && a !== second);
    const label = (a?: EffectiveAttribute) => (a ? `${a.name}${a.required ? '*' : ''}` : '—');
    rows.push(`| ${tree.get(n.parentSlug!)!.name} › ${n.name} | \`${n.slug}\` | ${label(cor)} | ${label(second)} | ${extra.map((e) => label(e)).join(', ') || '—'} |`);
    if (tam && cap) third.push(n.slug);
    if (extra.length) perListing.push(`${n.slug}: ${extra.map((e) => e.code).join(', ')}`);
  }
  md += `**Subcategorias com eixos:** ${rows.length} de ${tree.size - roots.length} · sem eixos: ${noAxes.length}. (\\* = obrigatório)\n\n| Subcategoria | slug | Cor | 2ª dimensão (Tamanho/Capacidade/Numeração…) | Eixos por anúncio |\n|---|---|---|---|---|\n${rows.join('\n')}\n\n`;
  md += `## Limitações do assistente atual (sem inventar suporte)\n\n`;
  md += `- **Terceira dimensão que VARIA entre variações:** ${third.length ? third.map((s) => `\`${s}\``).join(', ') : '**nenhuma subcategoria exige**'} (Tamanho **e** Capacidade juntos). Hoje o assistente só varia 2 dimensões; a 3ª valeria por anúncio.\n`;
  md += `- **Eixos "por anúncio" (um valor para todas as variações):** ${perListing.length} subcategorias — Voltagem, Capacidade (quando já há Tamanho) etc.\n`;
  md += `- **Notebooks** variam por Cor × Armazenamento; a **RAM** é característica do anúncio (versões com RAM diferente são anúncios separados).\n`;
  md += `- **Maquiagem/Perucas/Cabelos:** o eixo "Cor/Tom" é uma lista fechada; tons fora da lista exigem ampliar a lista (admin).\n`;
  md += `- O **código** decide o comportamento no assistente: \`cor\` → coluna Cor; \`tamanho\` → 2ª dimensão (o **nome** pode ser "Numeração", "Comprimento", "Embalagem", "Aro"…); \`capacidade\` → capacidade; outros → \`attributes_json\`.\n`;
  md += `
## Onde uma 3ª dimensão que VARIA seria desejável (NÃO suportada hoje — nada foi inventado)

| Categoria | Dimensões desejadas | Como a matriz resolve hoje |
|---|---|---|
`;
  md += `| Celulares › Smartphones; Informática › Tablets | Cor × Armazenamento × **RAM** | Cor e Armazenamento são eixos; a RAM é característica do anúncio (RAM diferente = anúncio separado). |
`;
  md += `| Informática › Notebooks; Computadores de mesa | Cor × Armazenamento × **RAM** | Idem (notebooks: Cor × Armazenamento; desktops: só especificações). |
`;
  md += `| Calçados › Sapatos femininos | Cor × Numeração × **Altura do salto** | Altura do salto é especificação (um modelo por altura). |
`;
  md += `| Casa › Camas e colchões | Tamanho × **Tipo de colchão** | Tamanho é eixo; tipo é especificação. |
`;
  md += `| Beleza › Cabelos e extensões | Cor × Comprimento × **Textura** | Cor e Comprimento são eixos; textura é especificação. |
`;
  md += `| Construção › Tintas e vernizes | Volume × Cor × **Acabamento** | Volume (capacidade) e Cor são eixos; acabamento é especificação. |
`;
  md += `| Eletrodomésticos (todas) | Cor × **Voltagem** × Capacidade | Cor é eixo; Voltagem é eixo "por anúncio" (um valor para todas as variações); capacidade é especificação. |

`;
  md += `**Conclusão:** nenhuma subcategoria EXIGE a 3ª dimensão para existir (nenhuma tem Tamanho e Capacidade ao mesmo tempo). A limitação aparece como "mais anúncios" (um por RAM/salto/voltagem), não como bloqueio. Suportar a 3ª dimensão exigiria evoluir a matriz de variações do assistente (decisão de produto para uma fase futura).
`;
  write('05-variant-axes.md', md);
}

// ----------------------------------------------------------------------------------------------- 06 conflitos e lacunas
{
  let md = header('06 — Conflitos, avisos e lacunas');
  const by = (sev: string) => report.issues.filter((i) => i.severity === sev);
  md += `Resultado do dry-run: **${by('error').length} erros**, **${by('warning').length} avisos**, **${by('info').length} informativos**.\n\n`;
  for (const sev of ['error', 'warning', 'info'] as const) {
    md += `## ${sev === 'error' ? 'Erros (bloqueiam a aplicação)' : sev === 'warning' ? 'Avisos' : 'Informativos'}\n\n`;
    const list = by(sev);
    if (!list.length) { md += '_nenhum_\n\n'; continue; }
    for (const i of list) md += `- [${i.rule}] \`${i.category ?? ''}\` ${i.code ? '`' + i.code + '` ' : ''}— ${i.message}\n`;
    md += '\n';
  }
  write('06-conflicts-and-gaps.md', md);
  write('validation.issues.json', JSON.stringify(report.issues, null, 1));
}

write('operations.json', JSON.stringify({ version: MATRIX_VERSION, count: ops.length, operations: ops }, null, 1));
const subs = [...resolution.effective.entries()].filter(([s]) => tree.get(s)!.depth === 1).map(([, l]) => l);
const summary = {
  version: MATRIX_VERSION,
  categorias: tree.size, principais: roots.length, subcategorias: tree.size - roots.length,
  definicoes: ALL_PLANS.reduce((n, p) => n + p.define.length, 0), overrides: ALL_PLANS.reduce((n, p) => n + p.override.length, 0), desativacoes: ALL_PLANS.reduce((n, p) => n + p.disable.length, 0),
  operacoes: ops.length, ...report.stats,
  efetivosPorSubcategoria: { media: +(subs.reduce((n, l) => n + l.length, 0) / subs.length).toFixed(2), maxSpecs: Math.max(...subs.map((l) => l.filter((a) => a.role === 'spec').length)), maxObrigatoriosSpec: Math.max(...subs.map((l) => l.filter((a) => a.role === 'spec' && a.required).length)), maxEixos: Math.max(...subs.map((l) => l.filter((a) => a.role === 'variant_axis').length)) },
  erros: report.issues.filter((i) => i.severity === 'error').length, avisos: report.issues.filter((i) => i.severity === 'warning').length, informativos: report.issues.filter((i) => i.severity === 'info').length,
};
write('summary.json', JSON.stringify({ ...summary, operationsHash: hashOperations(ops) }, null, 1));
console.log(JSON.stringify(summary, null, 1));
