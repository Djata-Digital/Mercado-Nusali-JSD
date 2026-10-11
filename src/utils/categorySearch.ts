/**
 * Pesquisa e navegação de categorias (PURO, sem DOM): usado pelo seletor pesquisável do cadastro de produtos.
 * Só LÊ a lista de categorias já existente (id, nome, slug, pai); não altera ids, slugs nem hierarquia.
 *
 * Regra de seleção (inalterada): só categorias FINAIS (sem subcategoria ativa) podem ser escolhidas. As que têm subcategorias aparecem
 * para explorar ("abrir"), nunca para selecionar.
 */
import { getCategoryPath, isLeafCategory, type Category } from './categoryUtils';

/** minúsculas, sem acentos e sem pontuação: "Eletrónicos & Áudio" → "eletronicos audio" */
export function normalizeSearch(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** ligações que não ajudam a achar a categoria ("casa e jardim", "artigos de festa") — ignoradas se houver outras palavras */
const FILLER = new Set(['e', 'de', 'da', 'do', 'das', 'dos', 'para', 'a', 'o', 'as', 'os', 'em']);

export function searchTokens(query: unknown): string[] {
  const all = normalizeSearch(query).split(' ').filter(Boolean);
  const meaningful = all.filter((t) => !FILLER.has(t));
  return Array.from(new Set(meaningful.length > 0 ? meaningful : all)); // palavra repetida não conta duas vezes
}

export interface CategoryEntry {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  displayOrder: number;
  /** da principal até a própria categoria */
  path: Category[];
  /** "Moda Feminina › Roupas esportivas" */
  pathLabel: string;
  isLeaf: boolean;
  /** quantas subcategorias ativas diretas */
  childCount: number;
  nName: string;
  nPath: string;
  nSlug: string;
}

export const PATH_SEPARATOR = ' › ';

export interface CategoryIndex {
  entries: CategoryEntry[];
  byId: Map<string, CategoryEntry>;
  children: Map<string | null, CategoryEntry[]>;
}

/** Monta o índice a partir da lista (use só as ativas, como o cadastro de produtos já faz). */
export function buildCategorySearchIndex(categories: Category[]): CategoryIndex {
  const list = (categories || []).filter((c) => c && c.id && c.isActive !== false);
  const ids = new Set(list.map((c) => c.id));
  const entries: CategoryEntry[] = list.map((c) => {
    const path = getCategoryPath(c.id, list);
    const childCount = list.filter((x) => x.parentId === c.id).length;
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      // pai que não existe (ou inativo) trata a categoria como principal, como já fazem as demais telas
      parentId: c.parentId && ids.has(c.parentId) ? c.parentId : null,
      displayOrder: c.displayOrder ?? 0,
      path,
      pathLabel: path.map((p) => p.name).join(PATH_SEPARATOR),
      isLeaf: isLeafCategory(c.id, list),
      childCount,
      nName: normalizeSearch(c.name),
      nPath: normalizeSearch(path.map((p) => p.name).join(' ')),
      nSlug: normalizeSearch(c.slug),
    };
  });
  const byId = new Map(entries.map((e) => [e.id, e]));
  const children = new Map<string | null, CategoryEntry[]>();
  for (const e of entries) {
    const key = e.parentId;
    if (!children.has(key)) children.set(key, []);
    children.get(key)!.push(e);
  }
  children.forEach((arr) => arr.sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name, 'pt')));
  return { entries, byId, children };
}

/** categoria pelo id, slug ou nome (o cadastro antigo guardava qualquer um deles) */
export function findCategoryEntry(index: CategoryIndex, value: unknown): CategoryEntry | null {
  const v = String(value ?? '').trim();
  if (!v) return null;
  return index.byId.get(v) ?? index.entries.find((e) => e.slug === v) ?? index.entries.find((e) => e.name === v) ?? null;
}

export interface SearchHit { entry: CategoryEntry; score: number }

function scoreEntry(e: CategoryEntry, tokens: string[], phrase: string): number {
  let score = 0;
  const nameWords = e.nName.split(' ');
  for (const t of tokens) {
    if (nameWords.some((w) => w.startsWith(t))) score += 30;
    else if (e.nName.includes(t)) score += 15;
    else if (e.nPath.includes(t)) score += 8; // está no caminho (principal/subcategoria acima)
    else if (e.nSlug.includes(t)) score += 3;
    else return -1; // todas as palavras precisam aparecer em algum lugar
  }
  if (e.nName === phrase) score += 200;
  else if (e.nName.startsWith(phrase)) score += 100;
  else if (e.nPath.includes(phrase)) score += 40; // a frase inteira (como digitada) dentro do caminho
  if (e.isLeaf) score += 5;
  return score;
}

/**
 * Pesquisa por nome, subcategoria e caminho (todas as palavras digitadas, em qualquer ordem). Ignora maiúsculas, acentos e pontuação.
 * Ordem: mais relevantes primeiro; empates pelo caminho. Consulta vazia → nenhum resultado (a tela mostra a navegação).
 */
export function searchCategories(index: CategoryIndex, query: unknown, limit = 40): { hits: SearchHit[]; total: number } {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return { hits: [], total: 0 };
  const phrase = normalizeSearch(query);
  const hits: SearchHit[] = [];
  for (const entry of index.entries) {
    const score = scoreEntry(entry, tokens, phrase);
    if (score >= 0) hits.push({ entry, score });
  }
  hits.sort((a, b) => b.score - a.score || a.entry.pathLabel.localeCompare(b.entry.pathLabel, 'pt'));
  return { hits: hits.slice(0, limit), total: hits.length };
}

/** Subcategorias diretas de uma categoria (ou as principais, com parentId null), na ordem de exibição. */
export function browseChildren(index: CategoryIndex, parentId: string | null): CategoryEntry[] {
  return index.children.get(parentId) ?? [];
}

// ======================================================================================================================
// Estado do seletor (reducer puro: teclado, abrir/fechar, explorar) — o componente só liga isto ao DOM.
// ======================================================================================================================

export interface PickerState {
  open: boolean;
  /** a pessoa digitou (o campo mostra a pesquisa; senão mostra a categoria escolhida) */
  typed: boolean;
  query: string;
  /** categoria cujo conteúdo está sendo explorado (null = principais) */
  browseId: string | null;
  /** linha ativa (-1 = nenhuma) */
  active: number;
}

export const INITIAL_PICKER_STATE: PickerState = { open: false, typed: false, query: '', browseId: null, active: -1 };

export type PickerAction =
  | { type: 'open'; selectedParentId?: string | null }
  | { type: 'close' }
  | { type: 'input'; value: string }
  | { type: 'move'; delta: number }
  | { type: 'first' }
  | { type: 'last' }
  | { type: 'drill'; id: string }
  | { type: 'up' }
  | { type: 'hover'; index: number };

export interface PickerRows { mode: 'search' | 'browse'; rows: CategoryEntry[]; total: number }

/** Linhas visíveis: resultados da pesquisa (se há texto) ou o conteúdo da categoria que está sendo explorada. */
export function pickerRows(index: CategoryIndex, state: Pick<PickerState, 'typed' | 'query' | 'browseId'>): PickerRows {
  if (state.typed && searchTokens(state.query).length > 0) {
    const { hits, total } = searchCategories(index, state.query);
    return { mode: 'search', rows: hits.map((h) => h.entry), total };
  }
  const rows = browseChildren(index, state.browseId);
  return { mode: 'browse', rows, total: rows.length };
}

export function pickerReducer(state: PickerState, action: PickerAction, index: CategoryIndex): PickerState {
  const count = () => pickerRows(index, state).rows.length;
  switch (action.type) {
    case 'open':
      // ao abrir, mostra as irmãs da categoria já escolhida (na edição, a pessoa vê onde ela está)
      return state.open ? state : { open: true, typed: false, query: '', browseId: action.selectedParentId ?? null, active: -1 };
    case 'close':
      return { ...INITIAL_PICKER_STATE };
    case 'input':
      return { ...state, open: true, typed: true, query: action.value, active: searchTokens(action.value).length > 0 ? 0 : -1 };
    case 'move': {
      const n = count();
      if (n === 0) return { ...state, open: true, active: -1 };
      const from = state.active < 0 ? (action.delta > 0 ? -1 : 0) : state.active;
      return { ...state, open: true, active: (from + action.delta + n) % n };
    }
    case 'first':
      return count() > 0 ? { ...state, active: 0 } : state;
    case 'last':
      return count() > 0 ? { ...state, active: count() - 1 } : state;
    case 'drill':
      return { ...state, open: true, typed: false, query: '', browseId: action.id, active: 0 };
    case 'up': {
      if (state.typed && state.query) return { ...state, typed: false, query: '', active: 0 };
      if (state.browseId === null) return state;
      const parent = index.byId.get(state.browseId)?.parentId ?? null;
      return { ...state, browseId: parent, active: 0 };
    }
    case 'hover':
      return { ...state, active: action.index };
    default:
      return state;
  }
}

/**
 * Texto da pesquisa a partir do que o campo passou a conter. Com uma categoria escolhida o campo mostra o caminho dela; se a pessoa
 * digita sem ter selecionado o texto (ex.: tocou de novo no campo), o que vale é só o que foi digitado, nunca "caminho + digitação".
 */
export function extractTypedQuery(next: string, shownLabel: string | null | undefined): string {
  const label = String(shownLabel ?? '');
  if (!label || !next.includes(label)) return next;
  return next.replace(label, '');
}

export type EnterResult = { kind: 'select'; id: string } | { kind: 'drill'; id: string } | { kind: 'none' };

/** 'leaf' = só categorias FINAIS são selecionáveis (cadastro de produtos); 'any' = qualquer categoria (categoria principal da loja). */
export type SelectableMode = 'leaf' | 'any';

/**
 * O que Enter faz. Modo 'leaf' (padrão, produtos): categoria FINAL → seleciona; com subcategorias → abre (nunca seleciona).
 * Modo 'any' (lojas): seleciona a linha ativa, qualquer que seja. Sem linha ativa → nada.
 */
export function resolveEnter(index: CategoryIndex, state: PickerState, mode: SelectableMode = 'leaf'): EnterResult {
  if (!state.open) return { kind: 'none' };
  const { rows } = pickerRows(index, state);
  const row = rows[state.active];
  if (!row) return { kind: 'none' };
  return row.isLeaf || mode === 'any' ? { kind: 'select', id: row.id } : { kind: 'drill', id: row.id };
}

/** → no modo 'any': abre as subcategorias da linha ativa (se tiver); senão nada. */
export function resolveOpenChildren(index: CategoryIndex, state: PickerState): EnterResult {
  if (!state.open) return { kind: 'none' };
  const row = pickerRows(index, state).rows[state.active];
  return row && !row.isLeaf ? { kind: 'drill', id: row.id } : { kind: 'none' };
}
