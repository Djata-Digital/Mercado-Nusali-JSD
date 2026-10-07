import React from 'react';
import { Link } from 'react-router-dom';
import { BannerSlider } from '../components/BannerSlider';
import { CategoryCarousel } from '../components/CategoryCarousel';
import { ProductCard } from '../components/ProductCard';
import { useProducts } from '../hooks/useProducts';
import { usePreferences } from '../context/PreferencesContext';
import { countriesConfig } from '../utils/currencyUtils';
import { ChevronRight, Globe, PackageOpen } from 'lucide-react';

const EmptyShowcase: React.FC<{ message: string; hint?: string }> = ({ message, hint }) => (
  <div className="bg-white border border-dashed border-gray-300 rounded-2xl px-6 py-10 text-center" role="status">
    <div className="w-11 h-11 rounded-full bg-emerald-50 text-emerald-600 mx-auto mb-3 flex items-center justify-center">
      <PackageOpen className="w-5 h-5" aria-hidden="true" />
    </div>
    <p className="text-sm font-bold text-gray-800">{message}</p>
    {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
  </div>
);

export const HomePage: React.FC = () => {
  const { selectedCountry, catalogOriginFilter } = usePreferences();
  // Correção crítica (produtos somem do catálogo/home): useProducts() era
  // chamado SEM nenhum filtro, então a queryKey do React Query nunca incluía
  // o país selecionado — a lista buscava uma única vez (o país que estivesse
  // em vigor no primeiro mount) e nunca refazia a busca quando o comprador
  // trocava de país (GW<->BR etc.), mesmo com o header X-Country-Code do
  // apiClient já correto a partir daí. Passar `country` explicitamente aqui
  // faz duas coisas: (1) a queryKey (['products', filters]) passa a incluir
  // o país, então trocar país invalida o cache automaticamente e refaz a
  // busca; (2) o backend deixa de depender só do header — recebe o destino
  // explícito na querystring, igual a StorePublicView.tsx já faz com
  // storeId. Não remove nem afrouxa a regra de elegibilidade geográfica
  // (productEligibilityService.ts) — só garante que o filtro correto seja
  // reavaliado a cada troca de país.
  //
  // FASE D16-G1 — `originCountryFilter` (catalogOriginFilter do
  // PreferencesContext) é um conceito INDEPENDENTE de `country`
  // (destino/elegibilidade, selectedCountry): filtra por país de ORIGEM
  // (products.countryCode) DENTRO do universo já elegível para o destino —
  // nunca o substitui. Incluído na queryKey pelo mesmo motivo de `country`
  // acima: trocar o filtro de origem precisa invalidar o cache e refazer a
  // busca.
  const { data: products = [], isLoading, isError } = useProducts({ country: selectedCountry, originCountryFilter: catalogOriginFilter });

  const featuredProducts = products.filter((p) => p.featured || p.offerOfDay);
  // Estados vazios (soft launch, catálogo ainda sem produtos): em vez de título + espaço em branco, uma mensagem clara. Somem
  // sozinhos assim que houver produtos reais. "Ofertas do Dia" só aparece com ofertas, ou com o catálogo todo vazio (para
  // não parecer quebrada); com produtos e nenhuma oferta, a seção inteira é omitida.
  const catalogEmpty = !isLoading && products.length === 0;
  const showOffersSection = isLoading || featuredProducts.length > 0 || catalogEmpty;
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
        {showOffersSection && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
                Ofertas do Dia • {currentCountry.name} {currentCountry.flag}
              </h2>
              <span className="bg-emerald-600 text-white font-extrabold text-[10px] px-2 py-0.5 rounded-xs uppercase tracking-wider animate-pulse">
                Ofertas no Mercado Nusali
              </span>
            </div>
            <Link
              to="/products"
              className="text-xs text-blue-800 font-bold hover:underline flex items-center gap-1"
            >
              Ver todas as ofertas <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Products Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="bg-white rounded-lg h-72 animate-pulse border border-gray-200" />
              ))}
            </div>
          ) : catalogEmpty ? (
            <EmptyShowcase
              message={isError ? 'Não foi possível carregar as ofertas agora. Tente novamente em instantes.' : 'Novas ofertas serão publicadas em breve.'}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {featuredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </section>
        )}

        {/* Nusali+ Promotional Callout Card */}
        <section className="bg-gradient-to-r from-emerald-900 via-teal-950 to-blue-950 text-white rounded-2xl p-6 sm:p-8 shadow-md flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="bg-yellow-400 text-blue-950 font-black text-xs px-2.5 py-0.5 rounded-xs uppercase">
                PARA VENDEDORES
              </span>
              <span className="text-xs text-yellow-300 font-bold">Cadastro aberto</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-extrabold">
              Venda seus produtos no Mercado Nusali
            </h3>
            <p className="text-xs text-gray-300">
              Crie sua conta de vendedor, configure sua operação e publique seus produtos. As compras online para a Guiné-Bissau chegam em breve.
            </p>
          </div>

          <Link
            to="/register"
            className="inline-block bg-yellow-400 hover:bg-yellow-300 text-blue-950 font-black px-6 py-3 rounded-xl shadow-md text-sm shrink-0 transition"
          >
            Criar minha conta
          </Link>
        </section>

        {/* Todos os Produtos Catalog */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-gray-200 pb-3">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Globe className="w-5 h-5 text-emerald-600" /> Catálogo de Produtos Nacionais e Importados
            </h2>
            <span className="text-xs text-gray-500 font-medium">Compre e venda no Mercado Nusali</span>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <div key={n} className="bg-white rounded-lg h-72 animate-pulse border border-gray-200" />
              ))}
            </div>
          ) : catalogEmpty ? (
            <EmptyShowcase
              message={isError ? 'Não foi possível carregar o catálogo agora. Tente novamente em instantes.' : 'Os primeiros produtos do Mercado Nusali serão publicados em breve.'}
              hint={isError ? undefined : 'Vendedores já podem criar a conta e publicar seus produtos.'}
            />
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
