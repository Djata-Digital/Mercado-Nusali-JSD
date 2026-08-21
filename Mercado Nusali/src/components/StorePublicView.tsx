import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Building2,
  ShieldCheck,
  Star,
  MapPin,
  MessageSquare,
  Share2,
  Heart,
  CheckCircle2,
  Package,
  Clock,
  Globe,
  Search,
  Filter,
} from 'lucide-react';
import { useProducts } from '../hooks/useProducts';
import { usePreferences } from '../context/PreferencesContext';
import { ProductCard } from './ProductCard';
import { countriesConfig } from '../utils/currencyUtils';

export const StorePublicView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: products = [] } = useProducts();
  const { showToast } = usePreferences();

  const [activeTab, setActiveTab] = useState<'catalog' | 'about' | 'reviews'>('catalog');
  const [searchFilter, setSearchFilter] = useState('');
  const [isFollowing, setIsFollowing] = useState(false);

  const mockStoreDefault = {
    id: id || 'seller_tech',
    name: 'TechStore Guiné Oficial',
    description: 'A maior distribuidora de tecnologia, iPhones e eletrônicos de Guiné-Bissau e África Ocidental.',
    rating: 4.9,
    reviewsCount: 1420,
    salesCount: 8900,
    isOfficial: true,
    joinedYear: '2021',
    country: 'GW' as const,
    bannerUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&q=80&w=1200',
    logoUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=200',
  };

  const currentStore = mockStoreDefault;
  const storeProducts = products.filter(
    (p) => p.seller?.id === currentStore.id || p.seller?.name?.toLowerCase().includes('tech') || p.seller?.name?.toLowerCase().includes('oficial')
  );

  const filteredStoreProducts = storeProducts.filter(
    (p) =>
      p.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
      p.category.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const storeCountry = countriesConfig[currentStore.country] || countriesConfig.GW;


  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-fadeIn">
      {/* Store Cover Banner */}
      <div className="relative h-48 sm:h-64 rounded-2xl overflow-hidden bg-gradient-to-r from-blue-950 via-emerald-900 to-teal-900 border border-gray-200 shadow-md mb-6">
        {currentStore.bannerUrl && (
          <img
            src={currentStore.bannerUrl}
            alt={currentStore.name}
            className="w-full h-full object-cover opacity-40"
            referrerPolicy="no-referrer"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

        {/* Store Top Action Badges */}
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <button
            onClick={() => {
              showToast('Link da loja copiado para a área de transferência!');
            }}
            className="bg-white/90 hover:bg-white text-gray-900 p-2 rounded-full shadow-md text-xs font-bold transition flex items-center gap-1.5"
            title="Compartilhar Loja"
          >
            <Share2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsFollowing(!isFollowing)}
            className={`px-4 py-2 rounded-full text-xs font-extrabold shadow-md transition flex items-center gap-1.5 ${
              isFollowing
                ? 'bg-emerald-600 text-white'
                : 'bg-yellow-400 text-blue-950 hover:bg-yellow-300'
            }`}
          >
            <Heart className={`w-4 h-4 ${isFollowing ? 'fill-white' : ''}`} />
            {isFollowing ? 'Seguindo Loja' : 'Seguir Loja'}
          </button>
        </div>
      </div>

      {/* Store Header Card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm mb-8 -mt-16 relative z-10 mx-2 sm:mx-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-black text-2xl shadow-lg border-4 border-white overflow-hidden shrink-0">
              {currentStore.logoUrl ? (
                <img src={currentStore.logoUrl} alt={currentStore.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <Building2 className="w-10 h-10" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-black text-gray-900">{currentStore.name}</h1>
                {(currentStore as any).isVerified || currentStore.isOfficial ? (
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 border border-emerald-300">
                    <ShieldCheck className="w-3 h-3 text-emerald-700" /> VENDEDOR OFICIAL VERIFICADO
                  </span>
                ) : null}
              </div>

              <p className="text-xs text-gray-600 mt-1 max-w-xl">
                {currentStore.description || 'Loja oficial parceira do Mercado Nusali com suporte Escrow e entregas internacionais.'}
              </p>

              <div className="flex items-center gap-4 mt-3 text-xs text-gray-600 flex-wrap">
                <span className="flex items-center gap-1 font-semibold text-gray-900">
                  <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                  {currentStore.rating.toFixed(1)} / 5.0 (Vendedor Líder)
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4 text-emerald-700" />
                  {storeCountry.flag} {(currentStore as any).city || 'Sede Regional'}, {storeCountry.name}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4 text-blue-700" />
                  Responde em menos de 1 hora
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <button
              onClick={() => navigate('/messages')}
              className="flex-1 md:flex-none bg-blue-950 hover:bg-blue-900 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition shadow-sm flex items-center justify-center gap-2"
            >
              <MessageSquare className="w-4 h-4 text-yellow-400" /> Falar com Vendedor
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6 flex items-center gap-8 text-sm font-bold">
        <button
          onClick={() => setActiveTab('catalog')}
          className={`pb-3 border-b-2 transition flex items-center gap-2 ${
            activeTab === 'catalog'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <Package className="w-4 h-4" /> Catálogo de Produtos ({filteredStoreProducts.length})
        </button>
        <button
          onClick={() => setActiveTab('about')}
          className={`pb-3 border-b-2 transition flex items-center gap-2 ${
            activeTab === 'about'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <Building2 className="w-4 h-4" /> Sobre a Loja & Garantias
        </button>
        <button
          onClick={() => setActiveTab('reviews')}
          className={`pb-3 border-b-2 transition flex items-center gap-2 ${
            activeTab === 'reviews'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <Star className="w-4 h-4" /> Reputação & Avaliações
        </button>
      </div>

      {/* Tab 1: Catalog */}
      {activeTab === 'catalog' && (
        <div>
          {/* Search bar inside store */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 mb-6 flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder={`Buscar dentro de ${currentStore.name}...`}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-xs font-medium focus:outline-hidden focus:border-emerald-600"
              />
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            </div>
            <span className="text-xs text-gray-500 font-medium hidden sm:inline">
              Exibindo {filteredStoreProducts.length} de {storeProducts.length} itens
            </span>
          </div>

          {filteredStoreProducts.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {filteredStoreProducts.map(product => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center my-8">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-gray-800">Nenhum produto encontrado nesta busca</h3>
              <p className="text-xs text-gray-500 mt-1">Tente ajustar o termo de pesquisa no catálogo da loja.</p>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: About */}
      {activeTab === 'about' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 space-y-6">
          <h3 className="text-xl font-bold text-gray-900">Informações Oficiais do Vendedor</h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            {currentStore.description || 'Esta loja é auditada e credenciada pela equipe do Mercado Nusali, garantindo autenticidade dos produtos, suporte pós-venda direto e conformidade tributária para envios entre países.'}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-gray-100">
            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
              <ShieldCheck className="w-6 h-6 text-emerald-700 mb-2" />
              <h4 className="font-bold text-sm text-gray-900">Proteção Escrow Ativa</h4>
              <p className="text-xs text-gray-600 mt-1">Seu pagamento fica retido até você receber e aprovar o pedido em mãos.</p>
            </div>
            <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
              <Globe className="w-6 h-6 text-blue-700 mb-2" />
              <h4 className="font-bold text-sm text-gray-900">Envios com Rastreio</h4>
              <p className="text-xs text-gray-600 mt-1">Parceria direta com operadores logísticos regionais e frota Nusali Express.</p>
            </div>
            <div className="p-4 bg-purple-50 rounded-xl border border-purple-100">
              <CheckCircle2 className="w-6 h-6 text-purple-700 mb-2" />
              <h4 className="font-bold text-sm text-gray-900">Produtos com Nota e Garantia</h4>
              <p className="text-xs text-gray-600 mt-1">Garantia legal de até 12 meses direto com a marca parceira.</p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Reviews */}
      {activeTab === 'reviews' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-8">
          <div className="flex items-center gap-4 mb-6 pb-6 border-b border-gray-100">
            <div className="text-center px-6 border-r border-gray-200">
              <div className="text-4xl font-black text-gray-900">{currentStore.rating.toFixed(1)}</div>
              <div className="flex items-center justify-center gap-1 text-amber-500 my-1">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-amber-500" />
                ))}
              </div>
              <span className="text-xs text-gray-500 font-medium">Classificação do Vendedor</span>
            </div>
            <div className="text-xs text-gray-600 space-y-1">
              <p className="font-bold text-gray-900">99% de compradores satisfeitos</p>
              <p>Entregas pontuais: 98.4%</p>
              <p>Atendimento rápido: Excelente</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-xs text-gray-900">Mariama D. (Bissau)</span>
                <span className="text-[10px] text-gray-400">Há 3 dias</span>
              </div>
              <div className="flex items-center gap-1 text-amber-500 text-xs mb-1">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-3.5 h-3.5 fill-amber-500" />
                ))}
              </div>
              <p className="text-xs text-gray-600">
                Excelente loja! Comprei e entregaram no dia seguinte em Bissau. Embalagem super bem protegida.
              </p>
            </div>

            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-xs text-gray-900">Carlos E. (Lisboa)</span>
                <span className="text-[10px] text-gray-400">Há 1 semana</span>
              </div>
              <div className="flex items-center gap-1 text-amber-500 text-xs mb-1">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-3.5 h-3.5 fill-amber-500" />
                ))}
              </div>
              <p className="text-xs text-gray-600">
                Comunicação impecável do vendedor. Produto 100% original e pagamento via MB WAY muito prático.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
