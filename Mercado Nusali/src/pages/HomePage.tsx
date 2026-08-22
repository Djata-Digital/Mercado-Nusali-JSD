import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BannerSlider } from '../components/BannerSlider';
import { CategoryCarousel } from '../components/CategoryCarousel';
import { ProductCard } from '../components/ProductCard';
import { useProducts } from '../hooks/useProducts';
import { usePreferences } from '../context/PreferencesContext';
import { countriesConfig } from '../utils/currencyUtils';
import { ChevronRight, Globe } from 'lucide-react';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { selectedCountry } = usePreferences();
  const { data: products = [], isLoading } = useProducts();

  const featuredProducts = products.filter((p) => p.featured || p.offerOfDay);
  const currentCountry = countriesConfig[selectedCountry] || countriesConfig.GW;

  return (
    <div>
      {/* Main Campaign Banner Slider */}
      <BannerSlider />

      {/* Content Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 mt-4">
        {/* Category Carousel */}
        <CategoryCarousel />

        {/* Ofertas do Dia Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
                Ofertas do Dia • {currentCountry.name} {currentCountry.flag}
              </h2>
              <span className="bg-emerald-600 text-white font-extrabold text-[10px] px-2 py-0.5 rounded-xs uppercase tracking-wider animate-pulse">
                Até 60% OFF
              </span>
            </div>
            <button
              onClick={() => navigate('/products')}
              className="text-xs text-blue-800 font-bold hover:underline flex items-center gap-1"
            >
              Ver todas as ofertas <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Products Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="bg-white rounded-lg h-72 animate-pulse border border-gray-200" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {featuredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </section>

        {/* Nusali+ Promotional Callout Card */}
        <section className="bg-gradient-to-r from-emerald-900 via-teal-950 to-blue-950 text-white rounded-2xl p-6 sm:p-8 shadow-md flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="bg-yellow-400 text-blue-950 font-black text-xs px-2.5 py-0.5 rounded-xs uppercase">
                NUSALI+ GLOBAL
              </span>
              <span className="text-xs text-yellow-300 font-bold">Proteção Escrow & Envio Directo</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-extrabold">
              Frete Grátis ilimitado em produtos de Guiné-Bissau, Brasil e Europa
            </h3>
            <p className="text-xs text-gray-300">
              Compre com Orange Money, PIX ou Cartão com retenção 100% garantida até à confirmação de entrega.
            </p>
          </div>

          <button
            onClick={() => navigate('/nusali-plus')}
            className="bg-yellow-400 hover:bg-yellow-300 text-blue-950 font-black px-6 py-3 rounded-xl shadow-md text-sm shrink-0 transition"
          >
            Conhecer Nusali+
          </button>
        </section>

        {/* Todos os Produtos Catalog */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-gray-200 pb-3">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Globe className="w-5 h-5 text-emerald-600" /> Catálogo de Produtos Nacionais e Importados
            </h2>
            <span className="text-xs text-gray-500 font-medium">Entrega Rápida via Nusali Logistics</span>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <div key={n} className="bg-white rounded-lg h-72 animate-pulse border border-gray-200" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
