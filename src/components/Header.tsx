import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Search,
  ShoppingCart,
  Heart,
  MapPin,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Menu,
  X,
  ShieldCheck,
  AlertCircle,
  LayoutDashboard,
  Building2,
  User as UserIcon,
  Wallet,
  Bell,
  PackageCheck,
  LogOut,
  KeyRound,
  Store,
  UserPlus,
  LogIn,
  Smartphone,
  Tv,
  Laptop,
  Zap,
  Activity,
  Wrench,
  Home,
  ShoppingBag,
  ArrowRight,
  Grid,
  Palette,
  Layers,
} from 'lucide-react';
import { usePreferences, HeaderThemeColor } from '../context/PreferencesContext';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../hooks/useCart';
import { useFavorites } from '../hooks/useFavorites';
import { useDisputes } from '../hooks/useDisputes';
import { useProducts, useCategories } from '../hooks/useProducts';
import { LocationModal } from './LocationModal';
import { countriesConfig } from '../utils/currencyUtils';
import { CountryCode } from '../types';
import { useCountries } from '../hooks/useCountries';
import { NusaliLogo } from './NusaliLogo';
import { searchProductsIntelligent, getSynonymsForTerm } from '../utils/searchEngine';
import { CurrencyConverterModal } from './CurrencyConverterModal';
import { CurrencyService } from '../services/currencyService';
import { Globe2 } from 'lucide-react';

const getCategoryIcon = (iconName: string, active: boolean) => {
  const iconClass = `w-4 h-4 shrink-0 transition-colors ${active ? 'text-emerald-700' : 'text-gray-500'}`;
  switch (iconName) {
    case 'Smartphone': return <Smartphone className={iconClass} />;
    case 'Tv': return <Tv className={iconClass} />;
    case 'Laptop': return <Laptop className={iconClass} />;
    case 'Zap': return <Zap className={iconClass} />;
    case 'Activity': return <Activity className={iconClass} />;
    case 'Wrench': return <Wrench className={iconClass} />;
    case 'Home': return <Home className={iconClass} />;
    default: return <ShoppingBag className={iconClass} />;
  }
};

const themeConfig: Record<
  HeaderThemeColor,
  {
    bg: string;
    logoDarkBg: boolean;
    navText: string;
    countryBtn: string;
    catBtn: string;
    catBtnOpen: string;
    addressBtn: string;
    addressSubtext: string;
    addressMaintext: string;
    badgeNusaliPay: string;
    badgeAdmin: string;
    userBtn: string;
    iconHover: string;
    borderTopNav: string;
    mobileMenu: string;
  }
> = {
  green: {
    bg: 'bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-950 text-white border-b border-emerald-800 shadow-md',
    logoDarkBg: true,
    navText: 'text-emerald-100 hover:text-white hover:bg-emerald-800/60 font-semibold',
    countryBtn: 'bg-emerald-800/80 hover:bg-emerald-800 text-white border border-emerald-700/80',
    catBtn: 'bg-yellow-400 hover:bg-yellow-300 text-emerald-950 font-black shadow-xs',
    catBtnOpen: 'bg-emerald-950 text-yellow-300 shadow-xs border border-emerald-700',
    addressBtn: 'text-emerald-100 hover:text-white hover:bg-emerald-800/60',
    addressSubtext: 'text-emerald-300',
    addressMaintext: 'text-white',
    badgeNusaliPay: 'bg-yellow-400 text-emerald-950 hover:bg-yellow-300 font-extrabold',
    badgeAdmin: 'bg-emerald-800 text-yellow-300 hover:bg-emerald-700 font-bold',
    userBtn: 'hover:bg-emerald-800/80 text-white',
    iconHover: 'hover:bg-emerald-800/80 text-emerald-100 hover:text-white',
    borderTopNav: 'border-emerald-800/70',
    mobileMenu: 'bg-emerald-950 text-white border-t border-emerald-800',
  },
};

export const Header: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedCountry, setSelectedCountry, headerTheme, setHeaderTheme } = usePreferences();
  const { user, isAuthenticated, logout, activeRole, switchActiveRole } = useAuth();
  const { totalCount: cartItemCount } = useCart();
  const { favorites } = useFavorites();
  const { data: disputes = [] } = useDisputes();
  const { data: allProducts = [] } = useProducts();

  const [searchInput, setSearchInput] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [activeCategorySlug, setActiveCategorySlug] = useState<string>('celulares-e-telefonia');
  const [isCountryMenuOpen, setIsCountryMenuOpen] = useState(false);
  const [isCurrencyConverterOpen, setIsCurrencyConverterOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const categoryMenuRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const userLocation = { city: 'Bissau', country: selectedCountry };

  const pendingDisputesCount = disputes.filter(
    (d: any) => d.status === 'opened' || d.status === 'under_admin_review'
  ).length;

  // Live intelligent fuzzy search matches
  const liveSearchResult = useMemo(() => {
    if (!searchInput.trim() || searchInput.trim().length < 2) {
      return { results: [], suggestedCorrection: null, synonymApplied: false };
    }
    return searchProductsIntelligent(allProducts, searchInput.trim(), 25);
  }, [allProducts, searchInput]);

  const liveSearchSynonyms = useMemo(() => {
    if (!searchInput.trim() || searchInput.trim().length < 2) return [];
    return getSynonymsForTerm(searchInput.trim()).filter(
      s => s.toLowerCase() !== searchInput.trim().toLowerCase()
    ).slice(0, 4);
  }, [searchInput]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (categoryMenuRef.current && !categoryMenuRef.current.contains(event.target as Node)) {
        setIsCategoryMenuOpen(false);
      }
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsCategoryMenuOpen(false);
        setIsCountryMenuOpen(false);
        setIsUserMenuOpen(false);
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleSearchSubmit = (e?: React.FormEvent, customTerm?: string) => {
    if (e) e.preventDefault();
    const term = customTerm !== undefined ? customTerm : searchInput;
    if (term.trim()) {
      setIsSearchFocused(false);
      navigate(`/products?q=${encodeURIComponent(term.trim())}`);
    }
  };

  const handleLogout = async () => {
    setIsUserMenuOpen(false);
    await logout();
    navigate('/login');
  };

  const { data: rawCategories = [] } = useCategories();
  const realCategories = useMemo(() => {
    return (rawCategories || []).filter((c: any) => c.isActive !== false);
  }, [rawCategories]);

  // Root level categories (parentId is null, undefined or empty string)
  const rootCategories = useMemo(() => {
    const roots = realCategories.filter((c: any) => !c.parentId);
    return roots.length > 0 ? roots : realCategories;
  }, [realCategories]);

  const activeCategory = useMemo(() => {
    if (!rootCategories.length) return null;
    return (
      rootCategories.find((c: any) => c.slug === activeCategorySlug || c.id === activeCategorySlug) ||
      rootCategories[0]
    );
  }, [rootCategories, activeCategorySlug]);

  // Real subcategories derived from categories table by parentId
  const activeSubcategories = useMemo(() => {
    if (!activeCategory) return [];
    return realCategories.filter(
      (c: any) => c.parentId === activeCategory.id || c.parentId === activeCategory.slug
    );
  }, [realCategories, activeCategory]);

  const activeOfferCount = useMemo(() => {
    if (!activeCategory) return null;
    if (typeof activeCategory.prods === 'number') {
      return activeCategory.prods;
    }
    if (Array.isArray(allProducts) && allProducts.length > 0) {
      return allProducts.filter(
        (p: any) =>
          p.categoryId === activeCategory.id ||
          p.categorySlug === activeCategory.slug ||
          p.category === activeCategory.name
      ).length;
    }
    return null;
  }, [activeCategory, allProducts]);

  const { data: operationalCountries, isLoading: countriesLoading, isError: countriesError } = useCountries();
  const currentCountryReal = operationalCountries?.find((c) => c.code === selectedCountry);
  // Fallback só de exibição (flag/nome/símbolo) enquanto a lista real ainda
  // não carregou — nunca decide quais países existem, só evita a UI vazia
  // durante o primeiro carregamento.
  const currentCountry = currentCountryReal || countriesConfig[selectedCountry] || { flag: '🏳️', name: selectedCountry, currency: '' };
  const curTheme = themeConfig[headerTheme] || themeConfig.green;

  return (
    <header className={`sticky top-0 z-40 transition-colors duration-300 ${curTheme.bg}`}>
      {/* Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
        {/* Top Row: Logo, Country Selector, Search, Header Color Switcher, Nusali+ Promo */}
        <div className="flex items-center justify-between gap-3">
          {/* Logo */}
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 group shrink-0 focus:outline-hidden"
            title="Mercado Nusali Início"
          >
            <NusaliLogo size="md" variant="horizontal" animated={true} darkBg={curTheme.logoDarkBg} />
          </button>

          {/* Multi-Country Selector Dropdown */}
          <div className="relative shrink-0">
            <button
              onClick={() => setIsCountryMenuOpen(!isCountryMenuOpen)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-bold text-xs shadow-2xs transition ${curTheme.countryBtn}`}
              title="Mudar país e moeda"
            >
              <span className="text-base leading-none">{currentCountry.flag}</span>
              <span className="hidden md:inline font-extrabold">{currentCountry.name}</span>
              <span className="bg-emerald-100 text-emerald-900 px-1 py-0.2 rounded text-[10px] font-black">
                {currentCountry.currency}
              </span>
              <ChevronDown className="w-3.5 h-3.5 opacity-70" />
            </button>

            {isCountryMenuOpen && (
              <div
                className="absolute left-0 mt-1 w-56 bg-white text-gray-900 rounded-lg shadow-xl border border-gray-200 py-2 z-50 animate-fadeIn"
                onMouseLeave={() => setIsCountryMenuOpen(false)}
              >
                <div className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                  Selecione o País de Operação
                </div>
                {countriesLoading && (
                  <div className="px-3.5 py-3 text-xs text-gray-500">Carregando países...</div>
                )}
                {!countriesLoading && countriesError && (
                  <div className="px-3.5 py-3 text-xs text-red-600">Não foi possível carregar os países. Tente novamente.</div>
                )}
                {!countriesLoading && !countriesError && (!operationalCountries || operationalCountries.length === 0) && (
                  <div className="px-3.5 py-3 text-xs text-amber-700">Nenhum país operacional disponível.</div>
                )}
                {!countriesLoading && !countriesError && operationalCountries?.map((conf) => (
                  <button
                    key={conf.code}
                    onClick={() => {
                      setSelectedCountry(conf.code);
                      setIsCountryMenuOpen(false);
                    }}
                    className={`w-full text-left px-3.5 py-2 text-xs flex items-center justify-between font-medium transition ${
                      selectedCountry === conf.code
                        ? 'bg-emerald-50 text-emerald-900 font-bold border-l-4 border-emerald-600'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{conf.flag}</span>
                      <span>{conf.name}</span>
                    </div>
                    <span className="text-[10px] font-black text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                      {conf.currency} ({conf.currencySymbol})
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Search Bar with Intelligent Dropdown */}
          <div ref={searchContainerRef} className="flex-1 max-w-xl relative">
            <form
              onSubmit={(e) => handleSearchSubmit(e)}
              className="relative flex items-center bg-white rounded-lg shadow-xs border border-gray-300 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-600/30 transition overflow-hidden"
            >
              <input
                type="text"
                value={searchInput}
                onFocus={() => setIsSearchFocused(true)}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  setIsSearchFocused(true);
                }}
                placeholder="Buscar produtos, marcas, celulares, notebooks..."
                className="w-full px-4 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-hidden bg-transparent"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('');
                    setIsSearchFocused(false);
                  }}
                  className="p-1.5 text-gray-400 hover:text-gray-600 mr-1 rounded-full transition"
                  title="Limpar busca"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                type="submit"
                className="px-4 py-2 border-l border-gray-200 text-gray-600 hover:text-emerald-700 hover:bg-gray-50 transition"
                title="Buscar"
              >
                <Search className="w-5 h-5" />
              </button>
            </form>

            {/* Smart Suggestions & Live Matches Dropdown */}
            {isSearchFocused && searchInput.trim().length >= 2 && (
              <div className="absolute left-0 right-0 mt-1.5 bg-white rounded-xl shadow-2xl border border-gray-200 py-3 z-50 overflow-hidden text-gray-900 animate-fadeIn">
                {/* 1. Typo correction prompt */}
                {liveSearchResult.suggestedCorrection && (
                  <div className="px-4 py-2 bg-amber-50/80 border-b border-amber-100 flex items-center justify-between gap-2 text-xs">
                    <span className="text-amber-900">
                      Você quis dizer: <strong className="font-extrabold text-amber-950 underline">{liveSearchResult.suggestedCorrection}</strong>?
                    </span>
                    <button
                      onClick={() => {
                        setSearchInput(liveSearchResult.suggestedCorrection!);
                        handleSearchSubmit(undefined, liveSearchResult.suggestedCorrection!);
                      }}
                      className="bg-amber-700 hover:bg-amber-800 text-white font-bold px-2 py-0.5 rounded text-[11px] transition"
                    >
                      Corrigir
                    </button>
                  </div>
                )}

                {/* 2. Semantic Synonyms Pills */}
                {liveSearchSynonyms.length > 0 && (
                  <div className="px-4 py-2 border-b border-gray-100">
                    <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-emerald-600" />
                      Termos & Sinônimos Relacionados
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {liveSearchSynonyms.map((syn, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setSearchInput(syn);
                            handleSearchSubmit(undefined, syn);
                          }}
                          className="bg-gray-100 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-200 border border-gray-200 text-gray-700 text-xs px-2.5 py-1 rounded-md font-medium transition flex items-center gap-1"
                        >
                          <Search className="w-3 h-3 opacity-50" />
                          <span>{syn}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Live Matching Products Preview */}
                {liveSearchResult.results.length > 0 ? (
                  <div className="py-1">
                    <div className="px-4 py-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                      <span>Produtos encontrados ({liveSearchResult.results.length})</span>
                      <span className="text-[10px] text-emerald-600 font-semibold">Busca Semântica CPLP</span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {liveSearchResult.results.slice(0, 4).map((product: any) => (
                        <button
                          key={product.id}
                          onClick={() => {
                            setIsSearchFocused(false);
                            navigate(`/products/${product.id}`);
                          }}
                          className="w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-gray-50 transition group"
                        >
                          <img
                            src={product.image || product.images?.[0] || 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&q=80&w=200'}
                            alt={product.title}
                            className="w-10 h-10 object-cover rounded-md border border-gray-200 shrink-0 group-hover:scale-105 transition"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-gray-900 truncate group-hover:text-emerald-700">
                              {product.title}
                            </p>
                            <p className="text-[11px] text-gray-500 flex items-center gap-2">
                              <span>{product.brand || product.category}</span>
                              {product.shipping?.freeShipping && (
                                <span className="text-emerald-600 font-bold text-[10px]">⚡ Frete Grátis</span>
                              )}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-xs font-extrabold text-gray-900">
                              {product.currency || 'XOF'} {Number(product.price).toLocaleString()}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="px-4 py-4 text-center text-xs text-gray-500">
                    Nenhum produto correspondente direto. Pressione Enter para buscar no catálogo geral.
                  </div>
                )}

                {/* 4. Footer View All */}
                <div className="pt-2 px-3 border-t border-gray-100">
                  <button
                    onClick={() => handleSearchSubmit()}
                    className="w-full py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 transition"
                  >
                    <span>Ver todos os resultados para "{searchInput}"</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Color Palette Badge (Tema Verde Esmeralda) */}
          <div className="hidden sm:flex items-center gap-1.5 bg-black/20 px-2.5 py-1 rounded-full border border-white/20 shrink-0 text-[10px] font-black text-white">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 border border-white/80 animate-pulse" />
            <span>Tema Verde Esmeralda</span>
          </div>

          {/* Nusali+ Promo Banner */}
          <button
            onClick={() => navigate('/nusali-plus')}
            className="hidden lg:flex items-center gap-2 bg-gradient-to-r from-emerald-900 to-blue-950 text-white px-3 py-1.5 rounded-md hover:opacity-95 transition text-xs shadow-xs shrink-0 border border-emerald-500/30"
          >
            <span className="bg-yellow-400 text-blue-950 font-black px-1.5 py-0.5 rounded-xs text-[10px] tracking-wider">
              NUSALI+
            </span>
            <span className="font-medium text-gray-100">
              Frete Grátis & Proteção Escrow
            </span>
          </button>

          {/* Mobile menu trigger */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className={`lg:hidden p-2 rounded-md transition ${curTheme.iconHover}`}
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Bottom Navigation Row */}
        <div className={`mt-2 pt-2 border-t ${curTheme.borderTopNav} flex items-center justify-between text-xs relative z-30`}>
          {/* Left Navigation: Location + Category Mega Dropdown */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Address Button */}
            <button
              onClick={() => setIsLocationOpen(true)}
              className={`flex items-center gap-1.5 py-1 px-2 rounded-md transition shrink-0 ${curTheme.addressBtn}`}
            >
              <MapPin className="w-4 h-4 text-emerald-400" />
              <div className="flex flex-col text-left">
                <span className={`text-[10px] leading-3 ${curTheme.addressSubtext}`}>Enviar para</span>
                <span className={`font-semibold leading-3 ${curTheme.addressMaintext}`}>
                  {userLocation.city}, {currentCountry.name}
                </span>
              </div>
            </button>

            {/* Categorias Mega Menu Toggle Button */}
            <div className="relative" ref={categoryMenuRef}>
              <button
                onClick={() => setIsCategoryMenuOpen(!isCategoryMenuOpen)}
                onMouseEnter={() => setIsCategoryMenuOpen(true)}
                className={`flex items-center gap-1.5 py-1 px-3 rounded-md transition cursor-pointer ${
                  isCategoryMenuOpen ? curTheme.catBtnOpen : curTheme.catBtn
                }`}
              >
                <span>Categorias</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    isCategoryMenuOpen ? 'rotate-180' : 'opacity-80'
                  }`}
                />
              </button>

              {/* Mega Menu Overlay Dropdown */}
              {isCategoryMenuOpen && (
                <>
                  {/* Darkened Backdrop for focus */}
                  <div
                    className="fixed inset-0 bg-black/40 backdrop-blur-2xs z-40 top-[115px]"
                    onClick={() => setIsCategoryMenuOpen(false)}
                  />

                  <div className="absolute left-0 top-full mt-1.5 w-[840px] max-w-[90vw] bg-white rounded-2xl shadow-2xl border border-gray-200 z-50 overflow-hidden animate-fadeIn text-gray-900">
                    <div className="flex min-h-[420px]">
                      {/* Left Column: Categories List */}
                      <div className="w-64 bg-gray-50/90 border-r border-gray-200 p-2 space-y-1 shrink-0 overflow-y-auto max-h-[480px]">
                        <div className="px-3 py-2 text-[10px] font-black text-gray-400 uppercase tracking-wider flex items-center justify-between">
                          <span>Departamentos</span>
                          <Grid className="w-3.5 h-3.5 text-gray-400" />
                        </div>
                        {rootCategories.map((cat: any) => {
                          const isActive = activeCategory?.id === cat.id || activeCategory?.slug === cat.slug;
                          return (
                            <button
                              key={cat.id}
                              onMouseEnter={() => setActiveCategorySlug(cat.slug || cat.id)}
                              onClick={() => {
                                navigate(`/categories/${cat.slug || cat.id}`);
                                setIsCategoryMenuOpen(false);
                              }}
                              className={`w-full text-left px-3 py-2.5 rounded-xl text-xs flex items-center justify-between font-semibold transition cursor-pointer ${
                                isActive
                                  ? 'bg-white text-emerald-950 font-extrabold shadow-xs border-l-4 border-emerald-600 translate-x-0.5'
                                  : 'text-gray-700 hover:bg-gray-200/60 hover:text-gray-900'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 truncate">
                                {getCategoryIcon(cat.icon || cat.iconName, isActive)}
                                <span className="truncate">{cat.name}</span>
                              </div>
                              <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-emerald-600' : 'text-gray-400'}`} />
                            </button>
                          );
                        })}
                      </div>

                      {/* Right Panel: Subcategories & Direct Links */}
                      <div className="flex-1 p-6 bg-white flex flex-col justify-between overflow-y-auto max-h-[480px]">
                        <div>
                          {/* Header of Active Category */}
                          <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-100">
                            <div>
                              <div className="text-[10px] font-extrabold text-emerald-700 uppercase tracking-widest">
                                Categoria Selecionada
                              </div>
                              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                                {activeCategory?.name}
                                {activeOfferCount !== null && activeOfferCount > 0 && (
                                  <span className="text-xs font-normal text-gray-400">
                                    ({activeOfferCount} ofertas)
                                  </span>
                                )}
                              </h3>
                            </div>

                            <button
                              onClick={() => {
                                navigate(`/categories/${activeCategory?.slug || activeCategory?.id}`);
                                setIsCategoryMenuOpen(false);
                              }}
                              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 rounded-lg text-xs font-extrabold flex items-center gap-1 transition cursor-pointer"
                            >
                              Ver todos em {activeCategory?.name} <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Subcategory Grid */}
                          {activeSubcategories.length > 0 ? (
                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                              {activeSubcategories.map((subCat: any) => (
                                <button
                                  key={subCat.id}
                                  onClick={() => {
                                    navigate(`/categories/${subCat.slug || subCat.id}`);
                                    setIsCategoryMenuOpen(false);
                                  }}
                                  className="p-3 bg-gray-50 hover:bg-emerald-50 rounded-xl border border-gray-200/80 text-left transition flex items-center justify-between group cursor-pointer"
                                >
                                  <span className="font-extrabold text-xs text-gray-900 group-hover:text-emerald-800">
                                    {subCat.name}
                                  </span>
                                  <ChevronRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-emerald-600" />
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="py-12 text-center text-gray-400 space-y-2">
                              <Layers className="w-8 h-8 mx-auto text-gray-300 stroke-1" />
                              <p className="font-bold text-xs text-gray-500">Nenhuma subcategoria cadastrada.</p>
                            </div>
                          )}
                        </div>

                        {/* Footer info in Mega Menu */}
                        <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between text-xs bg-gray-50 -mx-6 -mb-6 p-4 rounded-b-2xl">
                          <button
                            onClick={() => {
                              navigate('/categories');
                              setIsCategoryMenuOpen(false);
                            }}
                            className="font-extrabold text-blue-900 hover:text-blue-950 flex items-center gap-1.5 hover:underline"
                          >
                            <Grid className="w-4 h-4 text-emerald-700" />
                            Ver Mapa Geral do Catálogo de Categorias
                          </button>

                          <div className="flex items-center gap-1.5 text-gray-500 text-[11px] font-medium">
                            <ShieldCheck className="w-4 h-4 text-emerald-600" />
                            Proteção de compra Escrow Mercado Nusali
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right Navigation Links (Scrollable if narrow viewport) */}
          <div className="flex items-center gap-2 md:gap-3 overflow-x-auto no-scrollbar py-0.5">
            <button
              onClick={() => navigate('/categories')}
              className={`py-1 px-2 rounded-md transition shrink-0 ${curTheme.navText}`}
            >
              Explorar Catálogo
            </button>

            <button
              onClick={() => navigate('/products')}
              className={`py-1 px-2 rounded-md transition shrink-0 ${curTheme.navText}`}
            >
              Ofertas do Dia
            </button>

            <button
              onClick={() => navigate('/stores')}
              className={`py-1 px-2 rounded-md transition shrink-0 flex items-center gap-1 ${curTheme.navText}`}
            >
              <Building2 className="w-3.5 h-3.5 text-emerald-400" />
              Lojas Oficiais
            </button>

            {/* Câmbio Oficial do Dia */}
            <button
              type="button"
              onClick={() => setIsCurrencyConverterOpen(true)}
              className="py-1 px-2.5 rounded-md transition shrink-0 flex items-center gap-1.5 text-emerald-100 hover:text-white bg-emerald-800/80 hover:bg-emerald-800 border border-emerald-700/80 text-xs font-extrabold cursor-pointer"
              title="Ver Cotação e Câmbio Oficial Internacional do Dia"
            >
              <Globe2 className="w-3.5 h-3.5 text-emerald-300" />
              <span>Câmbio do Dia</span>
              <span className="bg-emerald-500/30 text-emerald-200 text-[9px] px-1 py-0.2 rounded font-black">
                Hoje
              </span>
            </button>

            <button
              onClick={() => navigate('/wallet')}
              className={`py-1 px-2 rounded-md transition shrink-0 flex items-center gap-1 ${curTheme.badgeNusaliPay}`}
            >
              <Wallet className="w-3.5 h-3.5" />
              Nusali Pay
            </button>

            <button
              onClick={() => navigate('/disputes')}
              className={`py-1 px-2 rounded-md transition shrink-0 relative flex items-center gap-1 ${curTheme.navText}`}
            >
              <AlertCircle className="w-3.5 h-3.5 text-red-400" />
              Disputas
              {pendingDisputesCount > 0 && (
                <span className="bg-red-600 text-white text-[9px] font-black px-1 rounded-full">
                  {pendingDisputesCount}
                </span>
              )}
            </button>

            {isAuthenticated && (user?.role === 'ADMIN' || user?.role === 'GLOBAL_ADMIN') && (
              <button
                onClick={() => navigate('/admin')}
                className={`py-1 px-2 rounded-md transition shrink-0 flex items-center gap-1 ${curTheme.badgeAdmin}`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                Painel Admin
              </button>
            )}
          </div>

          {/* Action Menu: User, Favorites, Cart */}
          <div className="flex items-center gap-2 shrink-0 ml-2">
            {/* Notifications */}
            {isAuthenticated && (
              <button
                onClick={() => navigate('/notifications')}
                className={`p-1.5 rounded-full transition ${curTheme.iconHover}`}
                title="Notificações"
              >
                <Bell className="w-5 h-5" />
              </button>
            )}

            {/* Minhas Compras */}
            {isAuthenticated && (
              <button
                onClick={() => navigate('/orders')}
                className={`hidden md:flex items-center gap-1 py-1 px-2 rounded-md transition ${curTheme.navText}`}
              >
                <PackageCheck className="w-4 h-4 text-emerald-300" />
                <span>Meus Pedidos</span>
              </button>
            )}

            {/* User Profile / Auth Dropdown */}
            {isAuthenticated ? (
              <div className="relative">
                <button
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className={`flex items-center gap-1.5 py-1 px-2 rounded-md transition font-bold cursor-pointer ${curTheme.userBtn}`}
                  title="Minha Conta Mercado Nusali"
                >
                  <div className="w-6 h-6 rounded-full bg-emerald-700 text-white text-[10px] font-extrabold flex items-center justify-center border border-white/20">
                    {user?.name?.slice(0, 2).toUpperCase() || 'US'}
                  </div>
                  <span className="hidden xl:inline text-xs truncate max-w-[100px]">
                    {user?.name?.split(' ')[0] || 'Minha Conta'}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 opacity-80" />
                </button>

                {/* Dropdown Menu */}
                {isUserMenuOpen && (
                  <div
                    className="absolute right-0 mt-1 w-60 bg-white text-gray-900 rounded-xl shadow-2xl border border-gray-200 py-2 z-50 animate-fadeIn text-xs"
                    onMouseLeave={() => setIsUserMenuOpen(false)}
                  >
                    <div className="px-4 py-2 border-b border-gray-100">
                      <div className="font-extrabold text-gray-900 truncate">{user?.name}</div>
                      <div className="text-[11px] text-gray-500 truncate">{user?.email}</div>
                      <div className="mt-1 flex items-center gap-1">
                        <span className="bg-blue-100 text-blue-900 text-[9px] font-black px-1.5 py-0.5 rounded">
                          {activeRole}
                        </span>
                        {user?.isVerifiedSeller && (
                          <span className="bg-emerald-100 text-emerald-800 text-[9px] font-black px-1.5 py-0.5 rounded flex items-center gap-0.5">
                            <ShieldCheck className="w-3 h-3" /> Vendedor Verificado
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        navigate('/profile');
                        setIsUserMenuOpen(false);
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-gray-50 font-medium text-gray-700 flex items-center gap-2"
                    >
                      <UserIcon className="w-4 h-4 text-gray-500" /> Meu Perfil
                    </button>

                    <button
                      onClick={() => {
                        navigate('/orders');
                        setIsUserMenuOpen(false);
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-gray-50 font-medium text-gray-700 flex items-center gap-2"
                    >
                      <PackageCheck className="w-4 h-4 text-blue-800" /> Meus Pedidos
                    </button>

                    <button
                      onClick={() => {
                        navigate('/wallet');
                        setIsUserMenuOpen(false);
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-gray-50 font-medium text-gray-700 flex items-center gap-2"
                    >
                      <Wallet className="w-4 h-4 text-emerald-700" /> Carteira Nusali Pay
                    </button>

                    <button
                      onClick={() => {
                        navigate('/security');
                        setIsUserMenuOpen(false);
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-gray-50 font-medium text-gray-700 flex items-center gap-2"
                    >
                      <KeyRound className="w-4 h-4 text-purple-700" /> Segurança da Conta
                    </button>

                    {user?.role === 'GLOBAL_ADMIN' || user?.role === 'ADMIN' ? (
                      <button
                        onClick={() => {
                          switchActiveRole('GLOBAL_ADMIN');
                          navigate('/admin');
                          setIsUserMenuOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-emerald-50 font-bold text-emerald-900 flex items-center gap-2 border-t border-gray-100 cursor-pointer"
                      >
                        <LayoutDashboard className="w-4 h-4 text-emerald-700" /> Painel Admin Global
                      </button>
                    ) : user?.role === 'SELLER' || user?.role === 'STORE_MANAGER' || user?.role === 'SELLER_STAFF' ? (
                      <button
                        onClick={() => {
                          switchActiveRole('SELLER');
                          navigate('/seller');
                          setIsUserMenuOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-emerald-50 font-bold text-emerald-900 flex items-center gap-2 border-t border-gray-100 cursor-pointer"
                      >
                        <Store className="w-4 h-4 text-emerald-700" /> Painel do Vendedor
                      </button>
                    ) : null}

                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2 hover:bg-red-50 font-bold text-red-600 flex items-center gap-2 border-t border-gray-100"
                    >
                      <LogOut className="w-4 h-4 text-red-600" /> Sair da conta
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <Link
                  to="/login"
                  className="flex items-center gap-1 py-1 px-2.5 rounded-md bg-white/90 hover:bg-white text-blue-950 font-black text-xs shadow-2xs transition"
                >
                  <LogIn className="w-3.5 h-3.5" /> Entrar
                </Link>
                <Link
                  to="/register"
                  className="hidden sm:flex items-center gap-1 py-1 px-2.5 rounded-md bg-blue-950 hover:bg-blue-900 text-white font-black text-xs shadow-2xs transition"
                >
                  <UserPlus className="w-3.5 h-3.5 text-yellow-400" /> Criar Conta
                </Link>
              </div>
            )}

            {/* Favoritos */}
            <button
              onClick={() => navigate('/favorites')}
              className={`relative p-1.5 rounded-full transition ${curTheme.iconHover}`}
              title="Favoritos"
            >
              <Heart className="w-5 h-5" />
              {favorites.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center border border-white">
                  {favorites.length}
                </span>
              )}
            </button>

            {/* Shopping Cart */}
            <button
              onClick={() => navigate('/cart')}
              className={`relative p-1.5 rounded-full transition ${curTheme.iconHover}`}
              title="Carrinho de Compras"
            >
              <ShoppingCart className="w-5 h-5" />
              {cartItemCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-emerald-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center border border-white">
                  {cartItemCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Color Palette Indicator */}
        <div className="sm:hidden mt-2 pt-1 border-t border-white/10 flex items-center justify-between text-[11px] text-white/90">
          <span className="font-bold flex items-center gap-1">
            <Palette className="w-3.5 h-3.5 text-emerald-400" /> Tema Ativo:
          </span>
          <span className="bg-emerald-500 text-white px-2 py-0.5 rounded-full font-extrabold text-[10px]">
            Verde Esmeralda
          </span>
        </div>

        {/* Mobile Dropdown Menu */}
        {isMobileMenuOpen && (
          <div className={`lg:hidden mt-2 pt-3 space-y-2 p-3 rounded-xl text-xs shadow-xl ${curTheme.mobileMenu}`}>
            {!isAuthenticated ? (
              <div className="flex gap-2 pb-2 border-b border-white/10">
                <Link
                  to="/login"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex-1 py-2 bg-white text-center rounded-lg font-extrabold text-blue-950"
                >
                  Entrar
                </Link>
                <Link
                  to="/register"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex-1 py-2 bg-yellow-400 text-center rounded-lg font-extrabold text-gray-950"
                >
                  Criar Conta
                </Link>
              </div>
            ) : (
              <div className="pb-2 border-b border-white/10 flex justify-between items-center">
                <span className="font-extrabold">{user?.name}</span>
                <button
                  onClick={handleLogout}
                  className="text-red-400 font-bold underline cursor-pointer"
                >
                  Sair
                </button>
              </div>
            )}

            <button
              onClick={() => {
                navigate('/');
                setIsMobileMenuOpen(false);
              }}
              className="w-full text-left font-medium py-1.5 border-b border-white/10"
            >
              Início
            </button>

            <button
              onClick={() => {
                navigate('/categories');
                setIsMobileMenuOpen(false);
              }}
              className="w-full text-left font-semibold py-1.5 border-b border-white/10 flex items-center gap-2"
            >
              <Grid className="w-4 h-4 text-emerald-400" /> Todas as Categorias
            </button>

            <button
              onClick={() => {
                navigate('/stores');
                setIsMobileMenuOpen(false);
              }}
              className="w-full text-left font-semibold py-1.5 border-b border-white/10 flex items-center gap-2"
            >
              <Building2 className="w-4 h-4 text-emerald-400" /> Lojas Oficiais Nusali
            </button>
            <button
              onClick={() => {
                navigate('/seller/kyc');
                setIsMobileMenuOpen(false);
              }}
              className="w-full text-left font-semibold py-1.5 border-b border-white/10 flex items-center gap-2"
            >
              <ShieldCheck className="w-4 h-4 text-blue-400" /> Verificação Vendedor (KYC)
            </button>
            <button
              onClick={() => {
                navigate('/disputes');
                setIsMobileMenuOpen(false);
              }}
              className="w-full text-left font-semibold py-1.5 border-b border-white/10 flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 text-red-400" /> Disputas & Escrow
            </button>
          </div>
        )}
      </div>

      {/* Location Modal */}
      <LocationModal isOpen={isLocationOpen} onClose={() => setIsLocationOpen(false)} />

      {/* Daily Exchange Rate & Currency Converter Modal */}
      <CurrencyConverterModal
        isOpen={isCurrencyConverterOpen}
        onClose={() => setIsCurrencyConverterOpen(false)}
      />
    </header>
  );
};
