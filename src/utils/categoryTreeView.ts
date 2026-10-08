/**
 * Visão em árvore recolhível das categorias para o painel admin (puro, sem React/rede): expansão, pesquisa com ancestrais,
 * filtros, contadores e somas de produtos por subárvore. Feito para centenas/milhares de categorias: o resultado é uma lista
 * PLANA só das linhas visíveis (o componente ainda pagina o que renderiza).
 */
import type { Category, CategoryNode } from './categoryUtils';

export type ScopeFilter = 'all' | 'roots' | 'subs';
export type StatusFilter = 'all' | 'active' | 'inactive';

/** minúsculas e sem acento (não altera o comprimento de letras já compostas, então os índices servem para destacar). */
export function foldText(value: string): string {
  let out = '';
  for (const ch of String(value ?? '')) {
    const f = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    out += f.length === ch.length ? f : ch.toLowerCase();
  }
  return out;
}

/** Intervalo [início, fim) do termo dentro do texto (ignorando caixa/acento), ou null. */
export function findMatchRange(text: string, query: string): [number, number] | null {
  const q = foldText(query.trim());
  if (!q) return null;
  const folded = foldText(text);
  if (folded.length !== text.length) return null; // sem garantia de alinhamento: não destaca
  const i = folded.indexOf(q);
  return i < 0 ? null : [i, i + q.length];
}

export interface TreeViewParams {
  expanded: ReadonlySet<string>;
  query: string;
  scope: ScopeFilter;
  status: StatusFilter;
}

export interface TreeRow {
  node: CategoryNode;
  level: number;
  /** atende pesquisa + filtros (linhas de contexto/ancestrais ficam false) */
  matched: boolean;
  hasChildren: boolean;
  /** filhos visíveis agora (aberto manualmente ou automaticamente pela pesquisa/filtro) */
  open: boolean;
  /** aberto automaticamente (ancestral de resultado): o clique não o recolhe */
  auto: boolean;
  /** total de produtos ativos da subárvore (a própria + descendentes) */
  productsTotal: number;
}

export interface TreeViewResult {
  rows: TreeRow[];
  mode: 'browse' | 'filter';
  matchedCount: number;
}

/** Soma de `prods` por subárvore (id -> total). Tolerante a `prods` ausente. */
export function subtreeProductTotals(tree: CategoryNode[]): Map<string, number> {
  const totals = new Map<string, number>();
  const walk = (n: CategoryNode): number => {
    let sum = Number(n.prods) || 0;
    for (const c of n.children) sum += walk(c);
    totals.set(n.id, sum);
    return sum;
  };
  tree.forEach(walk);
  return totals;
}

export function computeCounters(categories: Category[]) {
  const list = (categories || []).filter((c) => c && c.id);
  const ids = new Set(list.map((c) => c.id));
  const isRoot = (c: Category) => !c.parentId || !ids.has(c.parentId);
  const roots = list.filter(isRoot).length;
  return {
    roots,
    subs: list.length - roots,
    total: list.length,
    active: list.filter((c) => c.isActive !== false).length,
    inactive: list.filter((c) => c.isActive === false).length,
    activeProducts: list.reduce((s, c) => s + (Number(c.prods) || 0), 0),
  };
}

export function allParentIds(tree: CategoryNode[]): string[] {
  const out: string[] = [];
  const walk = (n: CategoryNode) => { if (n.children.length) { out.push(n.id); n.children.forEach(walk); } };
  tree.forEach(walk);
  return out;
}

export function computeTreeView(tree: CategoryNode[], p: TreeViewParams): TreeViewResult {
  const q = foldText(p.query.trim());
  // Slug só entra na busca quando o termo parece um slug (tem hífen/sublinhado): os slugs das subcategorias são prefixados pelo
  // nome do departamento, então buscar "celulares" por slug traria o departamento inteiro como ruído.
  const slugMode = /[-_]/.test(q);
  const filterMode = q !== '' || p.scope !== 'all' || p.status !== 'all';
  const totals = subtreeProductTotals(tree);

  const passesScopeStatus = (n: CategoryNode) =>
    (p.scope === 'all' || (p.scope === 'roots' ? n.level === 0 : n.level > 0)) &&
    (p.status === 'all' || (p.status === 'active' ? n.isActive !== false : n.isActive === false));
  const matches = (n: CategoryNode) =>
    passesScopeStatus(n) && (q === '' || foldText(n.name).includes(q) || (slugMode && foldText(n.slug || '').includes(q)));

  const rows: TreeRow[] = [];
  let matchedCount = 0;

  if (!filterMode) {
    const walk = (n: CategoryNode) => {
      const open = n.children.length > 0 && p.expanded.has(n.id);
      rows.push({ node: n, level: n.level, matched: true, hasChildren: n.children.length > 0, open, auto: false, productsTotal: totals.get(n.id) || 0 });
      if (open) n.children.forEach(walk);
    };
    tree.forEach(walk);
    return { rows, mode: 'browse', matchedCount: rows.length };
  }

  // modo pesquisa/filtro: árvore podada (resultados + ancestrais), caminho aberto automaticamente
  const memo = new Map<string, boolean>();
  const inSet = (n: CategoryNode): boolean => {
    const cached = memo.get(n.id);
    if (cached !== undefined) return cached;
    let v = matches(n);
    for (const c of n.children) if (inSet(c)) v = true; // sem curto-circuito: preenche o memo dos filhos
    memo.set(n.id, v);
    return v;
  };
  const walk = (n: CategoryNode) => {
    const isMatch = matches(n);
    if (isMatch) matchedCount++;
    const setChildren = n.children.filter(inSet);
    // resultado aberto manualmente: mostra também os demais filhos que passam nos filtros (contexto), sem destaque
    const manual = isMatch && p.expanded.has(n.id);
    const shown = manual ? n.children.filter((c) => inSet(c) || passesScopeStatus(c)) : setChildren;
    const auto = setChildren.length > 0;
    rows.push({ node: n, level: n.level, matched: isMatch, hasChildren: n.children.length > 0, open: shown.length > 0, auto: auto && !manual, productsTotal: totals.get(n.id) || 0 });
    shown.forEach(walk);
  };
  tree.filter(inSet).forEach(walk);
  return { rows, mode: 'filter', matchedCount };
}
