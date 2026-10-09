/**
 * FASE 8A — motor PURO da matriz: árvore de categorias, resolvedor de herança (espelho do attributeDefinitionService), validador
 * (dry-run) e compilador de operações. Sem banco: recebe o inventário de categorias lido da produção (somente leitura).
 */
import { ATTRIBUTE_LIMITS, RESERVED_ATTRIBUTE_CODES, buildAttributeDraft, validateAttributeDraft } from '../../utils/attributeRules.js';
import { normalizeLookupKey } from '../../utils/attributeValidator.js';
import { MATRIX_POLICY, type CategoryPlan, type MatrixAttribute, type MatrixOverride } from './types.js';

export interface InventoryCategory { id: string; name: string; slug: string; parent_id: string | null; is_active: boolean }

export interface TreeNode { id: string; slug: string; name: string; parentSlug: string | null; depth: number; children: string[]; active: boolean }
export type Tree = Map<string, TreeNode>;

export function buildTree(categories: InventoryCategory[]): Tree {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const tree: Tree = new Map();
  for (const c of categories) {
    const parent = c.parent_id ? byId.get(c.parent_id) : undefined;
    tree.set(c.slug, { id: c.id, slug: c.slug, name: c.name, parentSlug: parent?.slug ?? null, depth: 0, children: [], active: c.is_active });
  }
  for (const n of tree.values()) {
    if (n.parentSlug) { const p = tree.get(n.parentSlug); if (p) { p.children.push(n.slug); n.depth = p.depth + 1; } }
  }
  for (const n of tree.values()) if (n.parentSlug) n.depth = (tree.get(n.parentSlug)?.depth ?? 0) + 1;
  return tree;
}

export const chainOf = (tree: Tree, slug: string): string[] => {
  const chain: string[] = [];
  const seen = new Set<string>();
  let cur: TreeNode | undefined = tree.get(slug);
  while (cur && !seen.has(cur.slug)) { seen.add(cur.slug); chain.unshift(cur.slug); cur = cur.parentSlug ? tree.get(cur.parentSlug) : undefined; }
  return chain;
};

export const descendantsOf = (tree: Tree, slug: string): string[] => {
  const out: string[] = [];
  const queue = [...(tree.get(slug)?.children ?? [])];
  while (queue.length) { const s = queue.shift()!; out.push(s); queue.push(...(tree.get(s)?.children ?? [])); }
  return out;
};

// ---------------------------------------------------------------------------------------------------------------- issues
export type Severity = 'error' | 'warning' | 'info';
export interface Issue { severity: Severity; rule: string; category?: string; code?: string; message: string }

// ---------------------------------------------------------------------------------------------------------------- efetivos
export interface EffectiveAttribute extends MatrixAttribute {
  /** Categoria que DEFINE o atributo efetivo (ou a substituição). */
  originSlug: string;
  inherited: boolean;
  overridden: boolean;
  /** Categoria do atributo substituído, quando é override. */
  overridesSlug?: string;
}

export interface Resolution {
  effective: Map<string, EffectiveAttribute[]>;
  issues: Issue[];
}

const mergeOverride = (base: MatrixAttribute, o: MatrixOverride): MatrixAttribute => {
  const { code: _c, ...rest } = o;
  return { ...base, ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) } as MatrixAttribute;
};

/** Resolve os atributos efetivos de TODAS as categorias com as mesmas regras do serviço real (e registra conflitos). */
export function resolveMatrix(plans: CategoryPlan[], tree: Tree): Resolution {
  const issues: Issue[] = [];
  const planBySlug = new Map<string, CategoryPlan>();
  for (const p of plans) {
    if (planBySlug.has(p.slug)) issues.push({ severity: 'error', rule: 'plan-duplicado', category: p.slug, message: `Mais de um plano para a categoria "${p.slug}".` });
    planBySlug.set(p.slug, p);
  }

  const effective = new Map<string, EffectiveAttribute[]>();
  const cache = new Map<string, Map<string, EffectiveAttribute>>();
  const compute = (slug: string): Map<string, EffectiveAttribute> => {
    const hit = cache.get(slug);
    if (hit) return hit;
    const node = tree.get(slug)!;
    const inheritedMap = node.parentSlug ? compute(node.parentSlug) : new Map<string, EffectiveAttribute>();
    const map = new Map<string, EffectiveAttribute>();
    for (const [code, a] of inheritedMap) map.set(code, { ...a, inherited: true });
    const plan = planBySlug.get(slug);
    if (plan) {
      const own = new Set<string>();
      for (const d of plan.define) {
        if (own.has(d.code)) issues.push({ severity: 'error', rule: 'codigo-duplicado', category: slug, code: d.code, message: `O código "${d.code}" é definido duas vezes em "${slug}".` });
        own.add(d.code);
        if (map.has(d.code)) {
          const anc = map.get(d.code)!;
          issues.push({ severity: 'error', rule: 'conflito-heranca', category: slug, code: d.code, message: `"${d.code}" já é herdado de "${anc.originSlug}": use override explícito em "${slug}" (ou outro código).` });
          continue;
        }
        map.set(d.code, { ...d, originSlug: slug, inherited: false, overridden: false });
      }
      for (const o of plan.override) {
        const target = map.get(o.code);
        if (!target || !target.inherited) {
          issues.push({ severity: 'error', rule: 'override-invalido', category: slug, code: o.code, message: `Override de "${o.code}" em "${slug}", mas não há atributo herdado com esse código.` });
          continue;
        }
        const merged = mergeOverride(target, o);
        if (merged.type !== target.type || merged.role !== target.role) {
          issues.push({ severity: 'error', rule: 'override-invalido', category: slug, code: o.code, message: `Override de "${o.code}" não pode mudar tipo/função.` });
          continue;
        }
        map.set(o.code, { ...merged, originSlug: slug, inherited: false, overridden: true, overridesSlug: target.originSlug });
      }
      for (const code of plan.disable) {
        const target = map.get(code);
        if (!target || !target.inherited) {
          issues.push({ severity: 'error', rule: 'desativacao-invalida', category: slug, code, message: `Desativar "${code}" em "${slug}", mas não há atributo herdado com esse código.` });
          continue;
        }
        map.delete(code);
      }
    }
    cache.set(slug, map);
    return map;
  };

  for (const slug of tree.keys()) {
    const m = compute(slug);
    const list = [...m.values()].sort((a, b) => (a.required === b.required ? 0 : a.required ? -1 : 1) || a.order - b.order || a.name.localeCompare(b.name, 'pt-BR'));
    effective.set(slug, list);
  }
  return { effective, issues };
}

// ---------------------------------------------------------------------------------------------------------------- validação
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const GENERAL_NAME = /^(marca|modelo|condicao|garantia|peso\b|dimensoes|armazem|preco|estoque)/;

export interface ValidationReport {
  issues: Issue[];
  stats: Record<string, number>;
}

export function validateMatrix(plans: CategoryPlan[], tree: Tree, resolution: Resolution): ValidationReport {
  const issues: Issue[] = [...resolution.issues];
  const push = (i: Issue) => issues.push(i);
  const planBySlug = new Map(plans.map((p) => [p.slug, p]));

  // ---- cobertura
  for (const slug of tree.keys()) {
    if (!planBySlug.has(slug)) push({ severity: 'error', rule: 'cobertura', category: slug, message: `Categoria real "${slug}" sem plano na matriz.` });
  }
  for (const p of plans) {
    if (!tree.has(p.slug)) push({ severity: 'error', rule: 'categoria-inexistente', category: p.slug, message: `A matriz cita "${p.slug}", que não existe na árvore real (não inventamos categorias).` });
  }

  // ---- regras de cada definição (as MESMAS do serviço: código, tipo, opções, limites, eixo, filtrável)
  const codeFacts = new Map<string, { type: string; unit?: string; role: string; where: string[] }>();
  for (const p of plans) {
    for (const d of [...p.define]) {
      const draft = buildAttributeDraft({
        name: d.name, code: d.code, type: d.type, role: d.role, isRequired: d.required, optionsJson: d.options, unit: d.unit ?? null,
        minValue: d.min ?? null, maxValue: d.max ?? null, decimals: d.decimals ?? null, maxLength: d.maxLength ?? null,
        displayGroup: d.group ?? null, sortOrder: d.order, placeholder: d.placeholder ?? null, helpText: d.help ?? null, isFilterable: d.filterable,
      });
      for (const e of validateAttributeDraft(draft)) push({ severity: 'error', rule: 'definicao-invalida', category: p.slug, code: d.code, message: `${d.code}: ${e.message}` });

      if ((d.type === 'select' || d.type === 'multiselect') && (d.options?.length ?? 0) < 2) push({ severity: 'error', rule: 'opcoes', category: p.slug, code: d.code, message: `${d.code}: lista de opções com menos de 2 itens.` });
      if (d.options) {
        const seen = new Set<string>();
        for (const o of d.options) { const k = norm(o); if (seen.has(k)) push({ severity: 'error', rule: 'opcoes', category: p.slug, code: d.code, message: `${d.code}: opção repetida "${o}".` }); seen.add(k); }
      }
      if (d.type === 'number') {
        if (d.min !== undefined && d.max !== undefined && d.min > d.max) push({ severity: 'error', rule: 'limites', category: p.slug, code: d.code, message: `${d.code}: mínimo maior que máximo.` });
        if (d.decimals === undefined) push({ severity: 'warning', rule: 'limites', category: p.slug, code: d.code, message: `${d.code}: número sem "decimals" definido (aceitará até 6 casas).` });
        if (!d.unit) push({ severity: 'info', rule: 'unidade', category: p.slug, code: d.code, message: `${d.code}: número sem unidade (contagem?).` });
      }
      if (d.type === 'boolean' && d.required) push({ severity: 'warning', rule: 'obrigatorio', category: p.slug, code: d.code, message: `${d.code}: Sim/Não obrigatório raramente é útil.` });
      if (d.role === 'variant_axis' && d.type === 'multiselect') push({ severity: 'error', rule: 'eixo', category: p.slug, code: d.code, message: `${d.code}: eixo não pode ser multiseleção.` });

      // o assistente do vendedor ESCONDE especificações cujo NOME normalizado é um código reservado (ex.: "Comprimento", "Altura")
      if (d.role === 'spec' && RESERVED_ATTRIBUTE_CODES.has(normalizeLookupKey(d.name))) push({ severity: 'error', rule: 'nome-reservado', category: p.slug, code: d.code, message: `O nome "${d.name}" coincide com um campo geral reservado: o assistente esconderia este atributo. Use um nome mais específico.` });
      // campos gerais duplicados (por nome ou código)
      if (GENERAL_NAME.test(norm(d.name))) push({ severity: 'error', rule: 'campo-geral-duplicado', category: p.slug, code: d.code, message: `"${d.name}" repete um campo geral do produto (Marca, Modelo, Condição, Garantia, Peso, Dimensões, Armazém).` });
      if (/^(marca|modelo|condicao|garantia|peso|dimensoes|armazem)(_|$)/.test(d.code)) push({ severity: 'error', rule: 'campo-geral-duplicado', category: p.slug, code: d.code, message: `O código "${d.code}" lembra um campo geral reservado.` });

      // consistência global código -> tipo/unidade/função
      const f = codeFacts.get(d.code);
      if (!f) codeFacts.set(d.code, { type: d.type, unit: d.unit, role: d.role, where: [p.slug] });
      else {
        f.where.push(p.slug);
        if (f.type !== d.type) push({ severity: 'error', rule: 'codigo-inconsistente', category: p.slug, code: d.code, message: `"${d.code}" tem tipo ${d.type} aqui e ${f.type} noutra categoria.` });
        if (f.role !== d.role) push({ severity: 'error', rule: 'codigo-inconsistente', category: p.slug, code: d.code, message: `"${d.code}" tem função ${d.role} aqui e ${f.role} noutra categoria.` });
        if ((f.unit ?? '') !== (d.unit ?? '')) push({ severity: 'error', rule: 'unidade-inconsistente', category: p.slug, code: d.code, message: `"${d.code}" usa unidade "${d.unit ?? ''}" aqui e "${f.unit ?? ''}" noutra categoria.` });
      }
    }
    for (const o of p.override) {
      if (o.options && o.options.length < 2 && !(o.options.length === 1)) push({ severity: 'error', rule: 'opcoes', category: p.slug, code: o.code, message: `override de ${o.code}: lista vazia.` });
      if (o.options) {
        const seen = new Set<string>();
        for (const x of o.options) { const k = norm(x); if (seen.has(k)) push({ severity: 'error', rule: 'opcoes', category: p.slug, code: o.code, message: `override de ${o.code}: opção repetida "${x}".` }); seen.add(k); if (x.includes(',') || x.length > ATTRIBUTE_LIMITS.option) push({ severity: 'error', rule: 'opcoes', category: p.slug, code: o.code, message: `override de ${o.code}: opção inválida "${x}".` }); }
      }
    }
  }

  // ---- conflito com DESCENDENTES (definir num ancestral um código que uma subcategoria já usa sem override)
  for (const p of plans) {
    if (!tree.has(p.slug)) continue;
    const desc = descendantsOf(tree, p.slug);
    for (const d of p.define) {
      for (const ds of desc) {
        const dp = planBySlug.get(ds);
        if (dp?.define.some((x) => x.code === d.code)) push({ severity: 'error', rule: 'conflito-descendente', category: p.slug, code: d.code, message: `"${d.code}" definido em "${p.slug}" e também em "${ds}" sem override.` });
      }
    }
  }

  // ---- por categoria efetiva: política, nomes repetidos, eixos
  const stats: Record<string, number> = { categorias: tree.size, atributosDefinidos: plans.reduce((n, p) => n + p.define.length, 0), overrides: plans.reduce((n, p) => n + p.override.length, 0), desativacoes: plans.reduce((n, p) => n + p.disable.length, 0) };
  let withAttrs = 0, withAxes = 0;
  for (const [slug, list] of resolution.effective) {
    const node = tree.get(slug)!;
    const specs = list.filter((a) => a.role === 'spec');
    const axes = list.filter((a) => a.role === 'variant_axis');
    if (list.length > 0) withAttrs++;
    // select OBRIGATÓRIO precisa de saída ("Outro"), salvo lista fechada por natureza: senão o vendedor cujo produto não está na lista não consegue anunciar
    for (const r of specs) {
      if (r.required && r.type === 'select' && !r.closed && r.originSlug === slug && !(r.options ?? []).some((o) => /^(outro|outra|outros|outras|n[ãa]o se aplica)\b/i.test(o.trim()))) {
        push({ severity: 'error', rule: 'obrigatorio-sem-saida', category: slug, code: r.code, message: `${r.code}: select obrigatório sem opção de saída ("Outro"/"Não se aplica"). Marque closed:true só se a lista for fechada por natureza.` });
      }
    }
    if (axes.length > 0) withAxes++;
    const reqSpecs = specs.filter((a) => a.required).length;
    const reqAxes = axes.filter((a) => a.required).length;
    if (reqSpecs > MATRIX_POLICY.maxRequiredSpecs) push({ severity: 'error', rule: 'obrigatorios-excessivos', category: slug, message: `${reqSpecs} atributos obrigatórios (máximo ${MATRIX_POLICY.maxRequiredSpecs}).` });
    if (reqAxes > MATRIX_POLICY.maxRequiredAxes) push({ severity: 'error', rule: 'obrigatorios-excessivos', category: slug, message: `${reqAxes} eixos obrigatórios (máximo ${MATRIX_POLICY.maxRequiredAxes}).` });
    if (specs.length > MATRIX_POLICY.maxEffectiveSpecs) push({ severity: 'error', rule: 'campos-demais', category: slug, message: `${specs.length} especificações efetivas (máximo ${MATRIX_POLICY.maxEffectiveSpecs}).` });
    if (axes.length > MATRIX_POLICY.maxEffectiveAxes) push({ severity: 'error', rule: 'campos-demais', category: slug, message: `${axes.length} eixos efetivos (máximo ${MATRIX_POLICY.maxEffectiveAxes}).` });
    if (node.depth > 0 && list.length === 0 && !planBySlug.get(slug)?.noAttributesReason) push({ severity: 'warning', rule: 'sem-atributos', category: slug, message: 'Subcategoria sem nenhum atributo efetivo e sem justificativa.' });

    // mesmo nome com códigos diferentes no mesmo caminho (o vendedor veria dois campos iguais)
    const byName = new Map<string, string[]>();
    for (const a of list) { const k = norm(a.name); (byName.get(k) ?? byName.set(k, []).get(k)!).push(a.code); }
    for (const [k, codes] of byName) if (codes.length > 1) push({ severity: 'error', rule: 'nome-repetido', category: slug, message: `Nome "${k}" repetido nos códigos ${codes.join(', ')} (o vendedor veria dois campos iguais).` });

    // eixos x assistente
    const colorAxes = axes.filter((a) => ['cor', 'color'].includes(a.code));
    const sizeAxes = axes.filter((a) => ['tamanho', 'size'].includes(a.code));
    const capAxes = axes.filter((a) => ['capacidade', 'capacity'].includes(a.code));
    const second = sizeAxes[0] ?? capAxes[0];
    const extra = axes.filter((a) => !colorAxes.includes(a) && a !== second);
    for (const e of extra) {
      push({ severity: e.required ? 'warning' : 'info', rule: 'eixo-por-anuncio', category: slug, code: e.code, message: `Eixo "${e.name}" (${e.code}) vale UM valor por anúncio no assistente atual (não varia entre variações).` });
    }
    if (sizeAxes.length > 0 && capAxes.length > 0) push({ severity: 'warning', rule: 'terceira-dimensao', category: slug, message: 'Tem Tamanho E Capacidade: o assistente só tem 2 dimensões (Cor × Tamanho); a Capacidade vale por anúncio.' });
    if (colorAxes.length > 1 || sizeAxes.length > 1 || capAxes.length > 1) push({ severity: 'error', rule: 'eixo-duplicado', category: slug, message: 'Eixos duplicados no mesmo caminho.' });
    // cor e o mesmo código de especificação não podem coexistir (valor duplicado)
    for (const a of axes) if (specs.some((s) => s.code === a.code)) push({ severity: 'error', rule: 'eixo-e-spec', category: slug, code: a.code, message: `"${a.code}" é eixo e especificação ao mesmo tempo.` });
  }
  stats.categoriasComAtributos = withAttrs;
  stats.categoriasComEixos = withAxes;
  return { issues, stats };
}

// ---------------------------------------------------------------------------------------------------------------- compilação
export interface MatrixOperation {
  opId: string;
  kind: 'define' | 'override' | 'disable';
  categorySlug: string;
  categoryId: string;
  /** Payload no formato de createAttribute (admin). `id` e `overridesId` determinísticos => aplicação idempotente. */
  payload: Record<string, unknown>;
  depth: number;
}

export const attributeIdFor = (categorySlug: string, code: string) => `attr_nsl_${categorySlug}_${code}`.slice(0, 250);

const toPayload = (a: MatrixAttribute, categorySlug: string, extra: Record<string, unknown> = {}) => ({
  id: attributeIdFor(categorySlug, a.code),
  name: a.name,
  code: a.code,
  type: a.type,
  role: a.role,
  isRequired: a.required,
  optionsJson: a.options ?? null,
  unit: a.unit ?? null,
  minValue: a.min ?? null,
  maxValue: a.max ?? null,
  decimals: a.decimals ?? null,
  maxLength: a.maxLength ?? null,
  displayGroup: a.group ?? null,
  sortOrder: a.order,
  placeholder: a.placeholder ?? null,
  helpText: a.help ?? null,
  isFilterable: a.filterable,
  isActive: true,
  ...extra,
});

/** Operações em ORDEM DE APLICAÇÃO: raízes antes das subcategorias; dentro de cada categoria: define, override, disable. */
export function compileOperations(plans: CategoryPlan[], tree: Tree, resolution: Resolution): MatrixOperation[] {
  const ops: MatrixOperation[] = [];
  const ordered = [...plans].filter((p) => tree.has(p.slug)).sort((a, b) => tree.get(a.slug)!.depth - tree.get(b.slug)!.depth || a.slug.localeCompare(b.slug));
  for (const p of ordered) {
    const node = tree.get(p.slug)!;
    for (const d of p.define) ops.push({ opId: attributeIdFor(p.slug, d.code), kind: 'define', categorySlug: p.slug, categoryId: node.id, payload: toPayload(d, p.slug), depth: node.depth });
    for (const o of p.override) {
      // atributo herdado mais próximo = o que o resolvedor tinha ao chegar aqui (efetivo do pai)
      const parentEff = node.parentSlug ? resolution.effective.get(node.parentSlug)?.find((e) => e.code === o.code) : undefined;
      const eff = resolution.effective.get(p.slug)?.find((e) => e.code === o.code);
      if (!parentEff || !eff) continue;
      ops.push({ opId: attributeIdFor(p.slug, o.code), kind: 'override', categorySlug: p.slug, categoryId: node.id, payload: toPayload(eff, p.slug, { overridesId: attributeIdFor(parentEff.originSlug, o.code) }), depth: node.depth });
    }
    for (const code of p.disable) {
      const parentEff = node.parentSlug ? resolution.effective.get(node.parentSlug)?.find((e) => e.code === code) : undefined;
      if (!parentEff) continue;
      ops.push({ opId: attributeIdFor(p.slug, code), kind: 'disable', categorySlug: p.slug, categoryId: node.id, payload: { __disableInheritedId: attributeIdFor(parentEff.originSlug, code) }, depth: node.depth });
    }
  }
  return ops;
}
