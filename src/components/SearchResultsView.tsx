import React, { useMemo, useState, useEffect } from 'react';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { useProducts, useCategories } from '../hooks/useProducts';
import { ProductService } from '../services/productService';
import { getDescendantIds } from '../utils/categoryUtils';
import { ProductCard } from './ProductCard';
import { SlidersHorizontal, ArrowUpDown, X, Check, Sparkles, HelpCircle, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import { ProductCondition, FilterState, Product } from '../types';
import { searchProductsIntelligent, getSynonymsForTerm } from '../utils/searchEngine';
import { usePreferences } from '../context/PreferencesContext';

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
  const { data: allProducts = [] } = useProducts({ country: selectedCountry, originCountryFilter: catalogOriginFilter });

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
    return { category, ids: [category.id, ...getDescendantIds(category.id, list)] as string[] };
  }, [categoryRouteSlug, rawCategories]);
  const categoryProducts = useQueries({
    queries: (categoryScope?.ids || []).map((categoryId) => ({
      queryKey: ['products', { country: selectedCountry, originCountryFilter: catalogOriginFilter, category: categoryId }],
      queryFn: async () => (await ProductService.getProducts({ country: selectedCountry, originCountryFilter: catalogOriginFilter, category: categoryId })).data,
      staleTime: 1000 * 60 * 5,
    })),
    combine: (results) => {
      const byId = new Map<string, Product>();
      results.forEach((r) => (r.data || []).forEach((p: Product) => byId.set(p.id, p)));
      return { items: Array.from(byId.values()), pending: results.some((r) => r.isPending), error: results.some((r) => r.isError) };
    },
  });
  const products: Product[] = categoryMode ? categoryProducts.items : allProducts;

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

  const updateFilterState = (patch: Partial<FilterState>) => {
    setFilterState((prev) => ({ ...prev, ...patch }));
  };

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
    setSearchParams({});
  };

  // Perform intelligent fuzzy & semantic search
  const searchEngineResult = useMemo(() => {
    if (!filterState.query.trim()) {
      return {
        results: products,
        suggestedCorrection: null,
        synonymApplied: false,
        searchedQuery: ''
      };
    }
    return searchProductsIntelligent(products, filterState.query);
  }, [products, filterState.query]);

  // Detected related terms for informational badge
  const relatedSynonyms = useMemo(() => {
    if (!filterState.query.trim()) return [];
    return getSynonymsForTerm(filterState.query).filter(
      s => s.toLowerCase() !== filterState.query.toLowerCase().trim()
    ).slice(0, 4);
  }, [filterState.query]);

  // Apply secondary facet filters on the intelligent matched products
  const filteredProducts = useMemo(() => {
    const candidateList = searchEngineResult.results;

    return candidateList.filter((p) => {
      // Category filter
      if (filterState.category) {
        if (p.categorySlug !== filterState.category && !p.category.toLowerCase().includes(filterState.category.toLowerCase())) {
          return false;
        }
      }

      // Condition filter
      if (filterState.condition && filterState.condition !== 'all') {
        if (p.condition !== filterState.condition) return false;
      }

      // Price filter
      if (filterState.priceMin !== undefined && p.price < filterState.priceMin) return false;
      if (filterState.priceMax !== undefined && p.price > filterState.priceMax) return false;

      // Free shipping
      if (filterState.freeShippingOnly && !p.shipping?.freeShipping) return false;

      // Arrives tomorrow
      if (filterState.arrivesTomorrowOnly && !p.shipping?.arrivesTomorrow) return false;

      // FULL
      if (filterState.fullOnly && !p.shipping?.fullFulfilled) return false;

      // Seller Platinum
      if (filterState.sellerPlatinumOnly && p.seller?.reputationLevel !== 'platinum') return false;

      return true;
    }).sort((a, b) => {
      if (filterState.sortBy === 'price_asc') return a.price - b.price;
      if (filterState.sortBy === 'price_desc') return b.price - a.price;
      if (filterState.sortBy === 'sales') return b.salesCount - a.salesCount;
      if (filterState.sortBy === 'rating') return b.rating - a.rating;
      return 0; // relevance
    });
  }, [searchEngineResult.results, filterState]);

  const handleApplyCorrection = (correction: string) => {
    setSearchParams({ q: correction });
    updateFilterState({ query: correction });
  };

  // Estados da página de categoria (nunca mostram o catálogo completo no lugar da categoria pedida).
  if (categoryMode && (categoriesPending || (categoryScope && categoryProducts.pending))) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 flex items-center justify-center gap-2 text-sm text-gray-500" role="status">
        <Loader2 className="w-5 h-5 animate-spin text-emerald-600" /> Carregando categoria…
      </div>
    );
  }
  if (categoryMode && (categoriesError || !categoryScope || categoryProducts.error)) {
    const loadFailed = categoriesError || categoryProducts.error;
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
          <button
            onClick={() => navigate('/categories')}
            className="bg-emerald-600 text-white font-bold px-5 py-2.5 rounded-xl text-xs hover:bg-emerald-700 transition shadow-sm"
          >
            Ver todas as categorias
          </button>
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
            {filteredProducts.length} {filteredProducts.length === 1 ? 'produto encontrado' : 'produtos encontrados'}
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

          {/* Condition (Novo / Usado) */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Condição</h3>
            <div className="space-y-1.5 text-xs text-gray-700">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="condition"
                  checked={filterState.condition === 'all'}
                  onChange={() => updateFilterState({ condition: 'all' })}
                  className="text-emerald-600 focus:ring-emerald-500"
                />
                <span>Todos</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="condition"
                  checked={filterState.condition === 'novo'}
                  onChange={() => updateFilterState({ condition: 'novo' })}
                  className="text-emerald-600 focus:ring-emerald-500"
                />
                <span>Novo</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="condition"
                  checked={filterState.condition === 'usado'}
                  onChange={() => updateFilterState({ condition: 'usado' })}
                  className="text-emerald-600 focus:ring-emerald-500"
                />
                <span>Usado</span>
              </label>
            </div>
          </div>

          {/* Seller Reputation */}
          <div className="space-y-2 pt-3 border-t border-gray-100">
            <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Vendedor</h3>
            <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={filterState.sellerPlatinumOnly}
                onChange={(e) => updateFilterState({ sellerPlatinumOnly: e.target.checked })}
                className="w-4 h-4 text-emerald-600 rounded-xs border-gray-300 focus:ring-emerald-500"
              />
              <span className="font-semibold text-emerald-700">MercadoLíder Platinum</span>
            </label>
          </div>
        </div>

        {/* Product Results Grid (9 cols) */}
        <div className="lg:col-span-9">
          {filteredProducts.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-gray-200 space-y-4 shadow-xs">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-gray-800">
                {categoryMode && products.length === 0
                  ? `Ainda não há produtos em ${categoryName}`
                  : categoryMode && !filterState.query
                    ? 'Nenhum produto corresponde aos filtros selecionados'
                    : `Nenhum produto correspondente encontrado para "${filterState.query}"`}
              </h3>
              <p className="text-gray-500 text-xs max-w-md mx-auto">
                {categoryMode && !filterState.query
                  ? 'Volte em breve ou explore os outros produtos do catálogo.'
                  : <>Tente buscar por termos genéricos como <strong>celular</strong>, <strong>smartphone</strong>, <strong>computador</strong>, <strong>televisão</strong> ou <strong>fones de ouvido</strong>.</>}
              </p>
              <button
                onClick={categoryMode ? () => navigate('/products') : resetFilters}
                className="bg-emerald-600 text-white font-bold px-5 py-2.5 rounded-xl text-xs hover:bg-emerald-700 transition shadow-sm"
              >
                Ver todos os produtos do catálogo
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
