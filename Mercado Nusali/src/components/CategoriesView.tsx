import React, { useState } from 'react';
import {
  Smartphone,
  Shirt,
  Home,
  Laptop,
  Sparkles,
  ShoppingBag,
  Car,
  Tv,
  Gamepad2,
  Watch,
  HeartPulse,
  Dumbbell,
  Search,
  ArrowRight,
  Globe,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { useMarketplace } from '../context/MarketplaceContext';
import { useCategories } from '../hooks/useProducts';

export const CategoriesView: React.FC = () => {
  const { selectCategory, products } = useMarketplace();
  const { data: realCategories = [], isLoading } = useCategories();
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedMainGroup, setSelectedMainGroup] = useState<string | null>(null);

  const categoryIcons: Record<string, React.ReactNode> = {
    eletronicos: <Smartphone className="w-6 h-6 text-emerald-600" />,
    moda: <Shirt className="w-6 h-6 text-pink-600" />,
    casa: <Home className="w-6 h-6 text-amber-600" />,
    informatica: <Laptop className="w-6 h-6 text-blue-600" />,
    beleza: <Sparkles className="w-6 h-6 text-purple-600" />,
    esportes: <Dumbbell className="w-6 h-6 text-orange-600" />,
    automotivo: <Car className="w-6 h-6 text-red-600" />,
    games: <Gamepad2 className="w-6 h-6 text-indigo-600" />,
  };

  const activeCategories = (realCategories || []).filter((c: any) => c.isActive !== false);

  const filteredCategories = activeCategories.filter((cat: any) =>
    cat.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
    cat.slug?.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fadeIn">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-950 via-emerald-900 to-teal-900 text-white rounded-2xl p-6 sm:p-10 mb-8 shadow-xl relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 bg-yellow-400 text-blue-950 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider mb-3">
            <Globe className="w-3.5 h-3.5" /> Catálogo Global Mercado Nusali
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">
            Explore por Categorias
          </h1>
          <p className="text-gray-200 text-sm sm:text-base leading-relaxed mb-6">
            Encontre milhares de produtos com garantia Nusali Proteção Escrow, frete internacional rápido e opções de pagamento locais (Orange Money, PIX, MB WAY e Cartão).
          </p>

          {/* Internal Category Search */}
          <div className="relative max-w-md">
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filtrar categorias por nome ou palavra-chave..."
              className="w-full pl-10 pr-4 py-3 bg-white text-gray-900 placeholder-gray-400 rounded-xl text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-yellow-400 shadow-md"
            />
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-3.5" />
          </div>
        </div>

        {/* Decorative background shapes */}
        <div className="absolute right-0 top-0 bottom-0 opacity-10 pointer-events-none hidden lg:flex items-center pr-12">
          <Globe className="w-96 h-96 text-white" />
        </div>
      </div>

      {/* Main Categories Grid */}
      <div className="mb-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center justify-between">
          <span>Todas as Categorias ({filteredCategories.length})</span>
          <span className="text-xs text-gray-500 font-normal">Clique para ver os produtos</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredCategories.map((cat) => {
            const count = products.filter(p => p.category.toLowerCase().includes(cat.slug)).length || cat.itemCount;
            return (
              <div
                key={cat.id}
                onClick={() => selectCategory(cat.slug)}
                className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs hover:shadow-lg hover:border-emerald-500 transition duration-200 cursor-pointer group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-gray-50 rounded-xl group-hover:bg-emerald-50 transition">
                      {categoryIcons[cat.slug] || <ShoppingBag className="w-6 h-6 text-emerald-600" />}
                    </div>
                    <span className="text-xs font-bold bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full group-hover:bg-emerald-100 group-hover:text-emerald-800 transition">
                      {count} itens
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-gray-900 group-hover:text-emerald-700 transition mb-2">
                    {cat.name}
                  </h3>
                  <p className="text-xs text-gray-500 leading-relaxed mb-4 line-clamp-2">
                    {cat.description || 'Confira as melhores ofertas nacionais e importadas nesta categoria.'}
                  </p>
                </div>

                <div className="pt-4 border-t border-gray-100 flex items-center justify-between text-xs font-bold text-emerald-700 group-hover:translate-x-1 transition">
                  <span>Ver Ofertas</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Regional Specialties Section */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 sm:p-8 mb-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-1.5 text-emerald-800 text-xs font-black uppercase tracking-wider mb-2">
              <ShieldCheck className="w-4 h-4 text-emerald-700" /> Corredores Internacionais Nusali
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">
              Compre Direto dos Polos Comerciais Globais
            </h3>
            <p className="text-sm text-gray-600 max-w-2xl">
              Os vendedores do Mercado Nusali operam nos principais centros de fornecimento na Guiné-Bissau, Brasil, Portugal e China, com desembaraço aduaneiro integrado.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => selectCategory('eletronicos')}
              className="bg-white hover:bg-emerald-600 hover:text-white text-emerald-900 border border-emerald-300 font-bold px-4 py-2.5 rounded-xl text-xs transition shadow-2xs flex items-center gap-2"
            >
              <span>🇬🇼 Eletrônicos em Bissau</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => selectCategory('moda')}
              className="bg-white hover:bg-emerald-600 hover:text-white text-emerald-900 border border-emerald-300 font-bold px-4 py-2.5 rounded-xl text-xs transition shadow-2xs flex items-center gap-2"
            >
              <span>🇧🇷 Modas do Brasil</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => selectCategory('informatica')}
              className="bg-white hover:bg-emerald-600 hover:text-white text-emerald-900 border border-emerald-300 font-bold px-4 py-2.5 rounded-xl text-xs transition shadow-2xs flex items-center gap-2"
            >
              <span>🇵🇹 Tecnologia de Lisboa</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
