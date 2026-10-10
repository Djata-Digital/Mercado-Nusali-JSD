import React, { useMemo, useState, useEffect } from 'react';
import { useSearchParams, useNavigate, useParams, Link } from 'react-router-dom';
import { useCategories, useCatalogSearch, useCatalogFacets } from '../hooks/useProducts';
import { CatalogFacetsPanel } from './CatalogFacetsPanel';
import { countActiveAttributeFilters, type AttributeFilters } from '../utils/attributeFilters';
import { buildCatalogParams, buildFacetParams, hasActiveCatalogFilters, type CatalogUiState } from '../utils/catalogQuery';
import { getDescendantIds, getDirectChildren, getCategoryPath, isCategoryIndexable } from '../utils/categoryUtils';
import { usePageSeo } from '../hooks/usePageSeo';
import { pageTitle, toMetaDescription, SEO_SITE_NAME, ROBOTS_NOINDEX, ROBOTS_NOINDEX_FOLLOW } from '../utils/seoRoutes';
import { ProductCard } from './ProductCard';
import { SlidersHorizontal, ArrowUpDown, X, Check, Sparkles, HelpCircle, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import { ProductCondition, FilterState, Product } from '../types';
import { searchProductsIntelligent, getSynonymsForTerm } from '../utils/searchEngine';
import { usePreferences } from '../context/PreferencesContext';

const PAGE_SIZE = 24;

/** Números de página a mostrar: primeira, última e a janela ao redor da atual (null = reticências). */
export function pageWindow(current: number, total: number): Array<number | null> {
  const set = new Set<number>([1, total, current - 1, current, current + 1].filter((n) => n >= 1 && n <= total));
  const sorted = Array.from(set).sort((a, b) => a - b);
  const out: Array<number | null> = [];
  sorted.forEach((n, i) => { if (i > 0 && n - sorted[i - 1] > 1) out.push(null); out.push(n); });
  return out;
}

export const SearchResultsView: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryParam = searchParams.get('q') || '';
  // FASE D16-G1 — corrige o gap encontrado em D16-G0: useProducts() era
  // chamado SEM filtro nenhum, então a queryKey do React Query nunca incluía
  // país nenhum — trocar destino OU filtro de origem no header não refazia
  // a busca (cache preso no primeiro país visto). Passar ambos aqui, mesmo
  // padrão já usado em HomePage.tsx. `/categories/:slug` reaproveita este
  // MESMO componente (ver App.tsx) — corrige os dois de uma vez.
  const { selectedCountry, catalogOriginFilter } = usePreferences();

  // `/categories/:slug`: o slug (ou o id — Header/CategoryCarousel navegam com `cat.slug || cat.id`) define o ESCOPO do
  // catálogo. A categoria vem da tabela real (GET /categories, só ativas) e inclui as subcategorias (parentId), pois os
  // produtos ficam nas folhas (ex.: Banana/Manga dentro de Frutas). Os produtos vêm do filtro EXISTENTE do backend
  // (GET /products?category=<id>, igualdade exata em products.categoryId, elegibilidade por país mantida), uma consulta por
  // categoria do escopo. Slug desconhecido ou falha de carregamento NUNCA caem no catálogo completo.
  const { slug: categoryRouteSlug } = useParams<{ slug: string }>();
  const categoryMode = !!categoryRouteSlug;
  const { data: rawCategories = [], isPending: categoriesPending, isError: categoriesError } = useCategories();
  const categoryScope = useMemo(() => {
    if (!categoryRouteSlug) return null;
    const list = (rawCategories as any[]).filter((c) => c && c.isActive !== false);
    const category = list.find((c) => c.slug === categoryRouteSlug || c.id === categoryRouteSlug);
    if (!category) return null;
    return { category, all: list, ids: [category.id, ...getDescendantIds(category.id, list)] as string[] };
  }, [categoryRouteSlug, rawCategories]);
  // Subcategoria: "Calças - Moda Feminina" (nomes se repetem entre departamentos; mesmo texto do servidor).
  const categoryPath = categoryScope ? getCategoryPath(categoryScope.category.id, categoryScope.all) : [];
  const parentCategoryName = categoryPath.length > 1 ? categoryPath[categoryPath.length - 2].name : null;
  const categoryTitleName = categoryScope ? (parentCategoryName ? `${categoryScope.category.name} - ${parentCategoryName}` : categoryScope.category.name) : '';
  const categoryDescName = categoryScope ? (parentCategoryName ? `${categoryScope.category.name} (${parentCategoryName})` : categoryScope.category.name) : '';

  // Fase M1-D2.6 — removidos `brand: ''` e `officialStoresOnly: false`: não
  // existem em FilterState (src/types.ts) e este componente nunca os LÊ em
  // lugar nenhum (a filtragem aqui é 100% client-side sobre os campos reais:
  // category/condition/priceMin/priceMax/freeShippingOnly/fullOnly/
  // arrivesTomorrowOnly/sellerPlatinumOnly/sortBy). Eram campos de estado
  // mortos. Nenhum seletor de UI os alimentava.
  const [filterState, setFilterState] = useState<FilterState>({
    query: queryParam,
    category: '',
    priceMin: undefined,
    priceMax: undefined,
    condition: 'all',
    freeShippingOnly: false,
    fullOnly: false,
    arrivesTomorrowOnly: false,
    sellerPlatinumOnly: false,
    // Campo obrigatório de FilterState que este literal omitia (mascarado
    // pelos erros de excess-property `brand`/`officialStoresOnly` antes).
    internationalOnly: false,
    sortBy: 'relevance',
  });

  // Sync state when URL search param updates
  useEffect(() => {
    setFilterState(prev => ({ ...prev, query: queryParam }));
  }, [queryParam]);

  // P3: filtros/ordem/pesquisa/atributos/marca vivem aqui e SEMPRE voltam para a página 1 (nunca fica numa página que não existe mais)
  const [brand, setBrand] = useState<string | undefined>(undefined);
  const [attrs, setAttrs] = useState<AttributeFilters>({});
  const [page, setPage] = useState(1);
  const updateFilterState = (patch: Partial<FilterState>) => {
    setFilterState((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };
  // trocar de categoria (ou voltar à busca geral) descarta filtros que só valiam na anterior
  useEffect(() => {
    setAttrs({});
    setBrand(undefined);
    setPage(1);
  }, [categoryRouteSlug]);

  const resetFilters = () => {
    setFilterState({
      query: '',
      category: '',
      priceMin: undefined,
      priceMax: undefined,
      condition: 'all',
      freeShippingOnly: false,
      fullOnly: false,
      arrivesTomorrowOnly: false,
      sellerPlatinumOnly: false,
      internationalOnly: false,
      sortBy: 'relevance',
    });
    setBrand(undefined);
    setAttrs({});
    setPage(1);
    setSearchParams({});
  };

  // P3 — filtros, pesquisa (título, marca, descrição, categoria e valores das características), ordenação e paginação no SERVIDOR.
  const uiState: CatalogUiState = {
    query: filterState.query,
    categoryTree: categoryScope?.category?.id,
    brand,
    condition: filterState.condition === 'novo' || filterState.condition === 'usado' ? filterState.condition : 'all',
    priceMin: filterState.priceMin,
    priceMax: filterState.priceMax,
    sortBy: filterState.sortBy,
    attrs,
    page,
  };
  const catalogCtx = { country: selectedCountry, originCountryFilter: catalogOriginFilter, limit: PAGE_SIZE };
  const listParams = useMemo(() => buildCatalogParams(uiState, catalogCtx), [filterState, brand, attrs, page, categoryScope, selectedCountry, catalogOriginFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  const facetParams = useMemo(() => buildFacetParams(uiState, catalogCtx), [filterState, brand, attrs, categoryScope, selectedCountry, catalogOriginFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  const queriesEnabled = !categoryMode || !!categoryScope; // página de categoria só consulta depois de resolver a categoria
  const catalog = useCatalogSearch(listParams, queriesEnabled);
  const facets = useCatalogFacets(facetParams, queriesEnabled);

  // Sem nenhum resultado para o texto: a busca aproximada de sempre (sinônimos, tolerância ortográfica, "você quis dizer") sobre os
  // produtos dos mesmos filtros, sem o texto — preserva a "Busca Inteligente" quando o servidor não acha nada.
  const queryText = filterState.query.trim();
  const serverEmpty = !!catalog.data && !catalog.isFetching && catalog.data.pagination.total === 0 && queryText !== '';
  const fallbackParams = useMemo(() => buildCatalogParams({ ...uiState, query: '', page: 1 }, { ...catalogCtx, limit: 100 }), [filterState, brand, attrs, categoryScope, selectedCountry, catalogOriginFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  const fallback = useCatalogSearch(fallbackParams, queriesEnabled && serverEmpty);
  const fuzzy = useMemo(
    () => (serverEmpty && fallback.data ? searchProductsIntelligent(fallback.data.items, filterState.query) : null),
    [serverEmpty, fallback.data, filterState.query]
  );

  const displayProducts: Product[] = fuzzy ? fuzzy.results : catalog.data?.items ?? [];
  const totalFound = fuzzy ? fuzzy.results.length : catalog.data?.pagination.total ?? 0;
  const totalPages = fuzzy ? 1 : catalog.data?.pagination.totalPages ?? 1;
  const activeFilters = hasActiveCatalogFilters(uiState);
  const searchEngineResult = { suggestedCorrection: fuzzy?.suggestedCorrection ?? null };

  // Detected related terms for informational badge
  const relatedSynonyms = useMemo(() => {
    if (!filterState.query.trim()) return [];
    return getSynonymsForTerm(filterState.query).filter(
      s => s.toLowerCase() !== filterState.query.toLowerCase().trim()
    ).slice(0, 4);
  }, [filterState.query]);

  // C3.2 — metadados reais da categoria; slug inexistente/inativo => noindex e sem canonical (enquanto carrega: estado pendente).
  usePageSeo(
    !categoryMode
      ? null
      : categoryScope?.category
        ? {
            title: pageTitle(categoryTitleName),
            description: `Veja os produtos de ${categoryDescName} no ${SEO_SITE_NAME}, marketplace de compra e venda online.`,
            canonicalPath: `/categories/${encodeURIComponent(categoryScope.category.slug || categoryScope.category.id)}`,
            // Mesma regra do servidor: subcategoria sem produto público => noindex, follow (continua navegável).
            robots: isCategoryIndexable(
              categoryScope.category,
              categoryScope.all,
              categoryScope.category.hasPublicProducts ?? (catalog.data?.pagination.total ?? 0) > 0
            )
              ? undefined
              : ROBOTS_NOINDEX_FOLLOW,
          }
        : categoriesPending
          ? null
          : { title: pageTitle('Categoria não encontrada'), canonicalPath: null, robots: ROBOTS_NOINDEX }
  );

  const handleApplyCorrection = (correction: string) => {
    setSearchParams({ q: correction });
    updateFilterState({ query: correction });
  };

  // Estados da página de categoria (nunca mostram o catálogo completo no lugar da categoria pedida).
  if (categoryMode && (categoriesPending || (categoryScope && catalog.isPending))) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 flex items-center justify-center gap-2 text-sm text-gray-500" role="status">
        <Loader2 className="w-5 h-5 animate-spin text-emerald-600" /> Carregando categoria…
      </div>
    );
  }
  if (categoryMode && (categoriesError || !categoryScope || (catalog.isError && !catalog.data))) {
    const loadFailed = categoriesError || (catalog.isError && !catalog.data);
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="bg-white p-12 text-center rounded-2xl border border-gray-200 space-y-4 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h1 className="text-base font-bold text-gray-800">
            {loadFailed ? 'Não foi possível carregar esta categoria agora' : 'Categoria não encontrada'}
          </h1>
          <p className="text-gray-500 text-xs max-w-md mx-auto">
            {loadFailed ? 'Tente novamente em instantes ou navegue pelas outras categorias.' : 'Esta categoria não existe ou não está mais disponível.'}
          </p>
          <Link
            to="/categories"
            className="inline-block bg-emerald-600 text-white font-bold px-5 py-2.5 rounded-xl text-xs hover:bg-emerald-700 transition shadow-sm"
          >
            Ver todas as categorias
          </Link>
        </div>
      </div>
    );
  }
  const categoryName: string | null = categoryScope?.category?.name || null;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Search Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-gray-900">
              {filterState.query
                ? `Resultados para "${filterState.query}"${categoryName ? ` em ${categoryName}` : ''}`
                : (categoryName || 'Todos os Produtos e Ofertas')}
            </h1>
            {filterState.query && (
              <span className="hidden sm:inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[11px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                <Sparkles className="w-3 h-3" /> Busca Inteligente CPLP
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {totalFound} {totalFound === 1 ? 'produto encontrado' : 'produtos encontrados'}
          </p>
        </div>

        {/* Sort Controls */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-700 flex items-center gap-1">
            <ArrowUpDown className="w-3.5 h-3.5" /> Ordenar por:
          </label>
          <select
            value={filterState.sortBy}
            onChange={(e) => updateFilterState({ sortBy: e.target.value as any })}
            className="bg-gray-50 border border-gray-300 text-gray-800 text-xs rounded-lg px-3 py-1.5 font-medium focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
          >
            <option value="relevance">Mais relevantes</option>
            <option value="price_asc">Menor preço</option>
            <option value="price_desc">Maior preço</option>
            <option value="sales">Mais vendidos</option>
            <option value="rating">Melhor avaliação</option>
          </select>
        </div>
      </div>

      {/* Navegação da taxonomia: caminho (departamento > subcategoria) e subcategorias diretas da categoria atual */}
      {categoryMode && categoryScope && (() => {
        const path = getCategoryPath(categoryScope.category.id, categoryScope.all);
        const children = getDirectChildren(categoryScope.category.id, categoryScope.all);
        if (path.length <= 1 && children.length === 0) return null;
        return (
          <nav aria-label="Navegação de categorias" className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs space-y-3">
            {path.length > 1 && (
              <ol className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                <li><Link to="/categories" className="hover:text-emerald-700 hover:underline">Categorias</Link></li>
                {path.map((p, idx) => (
                  <li key={p.id} className="flex items-center gap-1.5">
                    <span aria-hidden="true">/</span>
                    {idx === path.length - 1 ? (
                      <span aria-current="page" className="font-bold text-gray-800">{p.name}</span>
                    ) : (
                      <Link to={`/categories/${p.slug || p.id}`} className="hover:text-emerald-700 hover:underline">{p.name}</Link>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {children.length > 0 && (
              <div>
                <h2 className="text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-2">Subcategorias de {categoryScope.category.name}</h2>
                <ul className="flex flex-wrap gap-2">
                  {children.map((c: any) => (
                    <li key={c.id}>
                      <Link
                        to={`/categories/${c.slug || c.id}`}
                        className="inline-block px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-emerald-50 hover:border-emerald-300 text-xs font-semibold text-gray-800 hover:text-emerald-800 transition"
                      >
                        {c.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </nav>
        );
      })()}

      {/* "Did You Mean" / Typo Correction Banner */}
      {searchEngineResult.suggestedCorrection && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-200/70 flex items-center justify-center shrink-0">
              <HelpCircle className="w-4 h-4 text-amber-800" />
            </div>
            <div>
              <p className="text-xs text-amber-800">
                Você quis dizer: <strong className="font-extrabold underline cursor-pointer hover:text-amber-950" onClick={() => handleApplyCorrection(searchEngineResult.suggestedCorrection!)}>{searchEngineResult.suggestedCorrection}</strong>?
              </p>
              <p className="text-[11px] text-amber-700 mt-0.5">
                Exibindo resultados aproximados com tolerância ortográfica e equivalência semântica.
              </p>
            </div>
          </div>
          <button
            onClick={() => handleApplyCorrection(searchEngineResult.suggestedCorrection!)}
            className="self-start sm:self-auto flex items-center gap-1.5 bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs px-3.5 py-1.5 rounded-xl transition shadow-xs"
          >
            <span>Buscar "{searchEngineResult.suggestedCorrection}"</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Semantic / Synonyms Contextual Badge */}
      {filterState.query && relatedSynonyms.length > 0 && (
        <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl px-4 py-2.5 flex flex-wrap items-center gap-2 text-xs text-emerald-900">
          <span className="font-bold flex items-center gap-1.5 text-emerald-800">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            Termos relacionados incluídos:
          </span>
          {relatedSynonyms.map((syn, idx) => (
            <button
              key={idx}
              onClick={() => handleApplyCorrection(syn)}
              className="bg-white hover:bg-emerald-100/60 border border-emerald-200 text-emerald-800 text-xs px-2.5 py-0.5 rounded-lg font-medium transition cursor-pointer"
            >
              {syn}
            </button>
          ))}
        </div>
      )}

      {/* Grid Layout: Left Sidebar Filters + Right Product Results */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sidebar Filters (3 cols) */}
        <div className="lg:col-span-3 space-y-6 bg-white p-5 rounded-2xl border border-gray-200 shadow-xs h-fit">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-emerald-600" /> Filtros
            </h2>
            <button
              onClick={resetFilters}
              className="text-xs text-emerald-600 hover:underline font-semibold"
            >
              Limpar todos
            </button>
          </div>

          {/* Filtros de envio (frete grátis / chega amanhã / FULL) ocultos: o frete e a entrega ainda estão em preparação. */}

          {/* P3 — condição, preço, marca e características (isFilterable) da categoria: só opções com resultado, contagens da busca atual */}
          <CatalogFacetsPanel
            facets={facets.data}
            isLoading={facets.isFetching && !facets.data}
            isError={facets.isError && !facets.data}
            onRetry={() => facets.refetch()}
            showAttributes={categoryMode}
            selection={{ brand, condition: uiState.condition ?? 'all', priceMin: filterState.priceMin, priceMax: filterState.priceMax, attrs }}
            onBrand={(b) => { setBrand(b); setPage(1); }}
            onCondition={(c) => updateFilterState({ condition: c })}
            onPrice={(min, max) => updateFilterState({ priceMin: min, priceMax: max })}
            onAttrs={(next) => { setAttrs(next); setPage(1); }}
          />
          {countActiveAttributeFilters(attrs) > 0 && (
            <p className="text-[11px] text-gray-500 font-medium" data-testid="active-attr-count">{countActiveAttributeFilters(attrs)} característica(s) filtrada(s)</p>
          )}

          {/* Filtro por nível de vendedor removido: a Nusali ainda não tem níveis de vendedor (sellerPlatinumOnly fica sempre false). */}
        </div>

        {/* Product Results Grid (9 cols) */}
        <div className="lg:col-span-9">
          {catalog.isError && !catalog.data ? (
            <div role="alert" className="bg-white p-12 text-center rounded-2xl border border-gray-200 space-y-3 shadow-xs">
              <h3 className="text-base font-bold text-gray-800">Não foi possível carregar os produtos agora</h3>
              <p className="text-gray-500 text-xs">Tente novamente em instantes.</p>
              <button onClick={() => catalog.refetch()} className="bg-emerald-600 text-white font-bold px-5 py-2.5 rounded-xl text-xs hover:bg-emerald-700 transition shadow-sm">Tentar novamente</button>
            </div>
          ) : catalog.isPending ? (
            <div className="p-12 flex items-center justify-center gap-2 text-sm text-gray-500" role="status"><Loader2 className="w-5 h-5 animate-spin text-emerald-600" /> Carregando produtos…</div>
          ) : displayProducts.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-gray-200 space-y-4 shadow-xs">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-gray-800">
                {categoryMode && totalFound === 0 && !activeFilters && !filterState.query
                  ? `Ainda não há produtos em ${categoryName}`
                  : !categoryMode && totalFound === 0 && !activeFilters && !filterState.query
                    ? 'Ainda não há produtos publicados'
                    : filterState.query
                      ? `Nenhum produto encontrado para "${filterState.query}"`
                      : 'Nenhum produto corresponde aos filtros selecionados'}
              </h3>
              <p className="text-gray-500 text-xs max-w-md mx-auto">
                {activeFilters
                  ? 'Remova alguns filtros ou limpe todos para ver mais produtos.'
                  : categoryMode && !filterState.query
                  ? 'Volte em breve ou explore os outros produtos do catálogo.'
                  : !categoryMode && totalFound === 0 && !filterState.query
                    ? 'Os primeiros produtos do Mercado Nusali serão publicados em breve.'
                    : 'Tente buscar por outro produto, categoria ou palavra-chave.'}
              </p>
              {activeFilters ? (
                <button
                  onClick={resetFilters}
                  className="bg-emerald-600 text-white font-bold px-5 py-2.5 rounded-xl text-xs hover:bg-emerald-700 transition shadow-sm"
                >
                  Limpar filtros
                </button>
              ) : !categoryMode && totalFound === 0 && !filterState.query ? (
                <button
                  onClick={() => navigate('/')}
                  className="bg-emerald-600 text-white font-bold px-5 py-2.5 rounded-xl text-xs hover:bg-emerald-700 transition shadow-sm"
                >
                  Voltar para o início
                </button>
              ) : (
                <button
                  onClick={categoryMode ? () => navigate('/products') : resetFilters}
                  className="bg-emerald-600 text-white font-bold px-5 py-2.5 rounded-xl text-xs hover:bg-emerald-700 transition shadow-sm"
                >
                  Ver todos os produtos do catálogo
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 transition-opacity ${catalog.isFetching ? 'opacity-60' : ''}`} aria-busy={catalog.isFetching ? 'true' : undefined}>
                {displayProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
              {totalPages > 1 && (
                <nav aria-label="Paginação dos resultados" data-testid="catalog-pagination" className="flex flex-wrap items-center justify-center gap-2 text-xs">
                  <button type="button" disabled={page <= 1} onClick={() => { setPage(page - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white font-semibold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed">Anterior</button>
                  {pageWindow(page, totalPages).map((n, i) => n === null
                    ? <span key={`gap-${i}`} className="px-1 text-gray-400" aria-hidden="true">…</span>
                    : <button key={n} type="button" aria-current={n === page ? 'page' : undefined} onClick={() => { setPage(n); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className={`min-w-8 px-2.5 py-1.5 rounded-lg border font-semibold cursor-pointer ${n === page ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 border-gray-300 hover:border-emerald-400'}`}>{n}</button>)}
                  <button type="button" disabled={page >= totalPages} onClick={() => { setPage(page + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white font-semibold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed">Próxima</button>
                  <span className="w-full text-center text-[11px] text-gray-500">Página {page} de {totalPages}</span>
                </nav>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
