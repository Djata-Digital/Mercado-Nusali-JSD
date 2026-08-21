import React, { useMemo, useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useProducts } from '../hooks/useProducts';
import { ProductCard } from './ProductCard';
import { SlidersHorizontal, ArrowUpDown, X, Check, Sparkles, HelpCircle, AlertCircle, ArrowRight } from 'lucide-react';
import { ProductCondition, FilterState } from '../types';
import { searchProductsIntelligent, getSynonymsForTerm } from '../utils/searchEngine';

export const SearchResultsView: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryParam = searchParams.get('q') || '';
  const { data: products = [] } = useProducts();

  const [filterState, setFilterState] = useState<FilterState>({
    query: queryParam,
    category: '',
    brand: '',
    priceMin: undefined,
    priceMax: undefined,
    condition: 'all',
    freeShippingOnly: false,
    fullOnly: false,
    arrivesTomorrowOnly: false,
    sellerPlatinumOnly: false,
    officialStoresOnly: false,
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
      brand: '',
      priceMin: undefined,
      priceMax: undefined,
      condition: 'all',
      freeShippingOnly: false,
      fullOnly: false,
      arrivesTomorrowOnly: false,
      sellerPlatinumOnly: false,
      officialStoresOnly: false,
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

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Search Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-gray-900">
              {filterState.query ? `Resultados para "${filterState.query}"` : 'Todos os Produtos e Ofertas'}
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

          {/* Shipping Badges Toggles */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Envio</h3>

            <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={filterState.freeShippingOnly}
                onChange={(e) => updateFilterState({ freeShippingOnly: e.target.checked })}
                className="w-4 h-4 text-emerald-600 rounded-xs border-gray-300 focus:ring-emerald-500"
              />
              <span className="font-semibold text-emerald-700">⚡ Frete Grátis</span>
            </label>

            <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={filterState.arrivesTomorrowOnly}
                onChange={(e) => updateFilterState({ arrivesTomorrowOnly: e.target.checked })}
                className="w-4 h-4 text-emerald-600 rounded-xs border-gray-300 focus:ring-emerald-500"
              />
              <span className="font-semibold text-emerald-700">⚡ Chega amanhã</span>
            </label>

            <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={filterState.fullOnly}
                onChange={(e) => updateFilterState({ fullOnly: e.target.checked })}
                className="w-4 h-4 text-emerald-600 rounded-xs border-gray-300 focus:ring-emerald-500"
              />
              <span className="font-extrabold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-xs border border-emerald-200">
                FULL
              </span>
            </label>
          </div>

          {/* Condition (Novo / Usado) */}
          <div className="space-y-2 pt-3 border-t border-gray-100">
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
                Nenhum produto correspondente encontrado para "{filterState.query}"
              </h3>
              <p className="text-gray-500 text-xs max-w-md mx-auto">
                Tente buscar por termos genéricos como <strong>celular</strong>, <strong>smartphone</strong>, <strong>computador</strong>, <strong>televisão</strong> ou <strong>fones de ouvido</strong>.
              </p>
              <button
                onClick={resetFilters}
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
