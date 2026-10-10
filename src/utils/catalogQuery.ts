/**
 * P3 — traduz o estado da tela de busca/categoria para os parâmetros da API do catálogo (PURO). Uma única função monta os parâmetros da
 * listagem e dos facets, para os números dos filtros e a lista nunca divergirem.
 */
import { serializeAttributeFilters, type AttributeFilters } from './attributeFilters';

export type UiSort = 'relevance' | 'price_asc' | 'price_desc' | 'sales' | 'rating';

export interface CatalogUiState {
  query: string;
  /** id ou slug da categoria da página (departamento ou subcategoria): inclui as descendentes */
  categoryTree?: string;
  brand?: string;
  /** rótulos da interface */
  condition?: 'all' | 'novo' | 'usado';
  priceMin?: number;
  priceMax?: number;
  sortBy: UiSort;
  attrs: AttributeFilters;
  page: number;
}

export interface CatalogContext {
  country?: string;
  originCountryFilter?: string;
  limit?: number;
}

export const SORT_TO_API: Record<UiSort, string> = {
  relevance: 'relevance',
  price_asc: 'price_asc',
  price_desc: 'price_desc',
  sales: 'sales_desc',
  rating: 'rating_desc',
};

type Params = Record<string, string | number>;

/** Parâmetros dos filtros (sem página/ordem): usados pelos facets. Só inclui o que tem valor. */
export function buildFacetParams(state: CatalogUiState, ctx: CatalogContext = {}): Params {
  const p: Params = {};
  const q = state.query.trim();
  if (q) p.q = q;
  if (state.categoryTree) p.categoryTree = state.categoryTree;
  if (state.brand) p.brand = state.brand;
  if (state.condition && state.condition !== 'all') p.condition = state.condition;
  if (state.priceMin !== undefined && !isNaN(state.priceMin)) p.minPrice = state.priceMin;
  if (state.priceMax !== undefined && !isNaN(state.priceMax)) p.maxPrice = state.priceMax;
  // características só valem com categoria escolhida (o servidor também ignora sem ela)
  const attrs = state.categoryTree ? serializeAttributeFilters(state.attrs) : undefined;
  if (attrs) p.attrs = attrs;
  if (ctx.country) p.country = ctx.country;
  if (ctx.originCountryFilter) p.originCountryFilter = ctx.originCountryFilter;
  return p;
}

/** Parâmetros da listagem paginada e ordenada. */
export function buildCatalogParams(state: CatalogUiState, ctx: CatalogContext = {}): Params {
  const p = buildFacetParams(state, ctx);
  p.sort = SORT_TO_API[state.sortBy] ?? 'relevance';
  p.page = Math.max(1, Math.floor(state.page) || 1);
  p.limit = ctx.limit ?? 24;
  return p;
}

/** Há algum filtro além da categoria da página e da pesquisa? (para "Limpar filtros" e as mensagens de lista vazia) */
export function hasActiveCatalogFilters(state: CatalogUiState): boolean {
  return !!state.brand || (!!state.condition && state.condition !== 'all') || state.priceMin !== undefined || state.priceMax !== undefined
    || Object.keys(state.attrs ?? {}).length > 0;
}
