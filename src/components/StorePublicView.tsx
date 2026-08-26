import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Building2,
  ShieldCheck,
  MapPin,
  MessageSquare,
  Share2,
  Heart,
  CheckCircle2,
  Package,
  Globe,
  Search,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useProducts } from '../hooks/useProducts';
import { useStore } from '../hooks/useStores';
import { useCountries } from '../hooks/useCountries';
import { usePreferences } from '../context/PreferencesContext';
import { ProductCard } from './ProductCard';

export const StorePublicView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = usePreferences();

  const [activeTab, setActiveTab] = useState<'catalog' | 'about'>('catalog');
  const [searchFilter, setSearchFilter] = useState('');
  const [isFollowing, setIsFollowing] = useState(false);

  const { data: store, isLoading: storeLoading, isError: storeError } = useStore(id);
  const { data: operationalCountries } = useCountries();
  // Produtos filtrados pelo relacionamento real storeId — nunca por heurística
  // de nome do seller. Só busca depois que sabemos o ID real da loja.
  const { data: products = [], isLoading: productsLoading } = useProducts(
    store ? { storeId: store.id } : undefined
  );

  if (storeLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-24 flex flex-col items-center justify-center gap-3 text-gray-500">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p className="text-sm">Carregando loja...</p>
      </div>
    );
  }

  if (storeError || !store) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24 flex flex-col items-center justify-center gap-4 text-center">
        <AlertCircle className="w-12 h-12 text-gray-300" />
        <h1 className="text-xl font-bold text-gray-800">Loja não encontrada</h1>
        <p className="text-sm text-gray-500">
          Esta loja não existe, foi removida, ou não está disponível publicamente no momento.
        </p>
        <button
          onClick={() => navigate('/stores')}
          className="mt-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition"
        >
          Ver todas as lojas
        </button>
      </div>
    );
  }

  const storeCountry = operationalCountries?.find((c) => c.code === store.countryCode);

  const filteredStoreProducts = (products || []).filter(
    (p: any) =>
      p.title?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      p.category?.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-fadeIn">
      {/* Store Cover Banner */}
      <div className="relative h-48 sm:h-64 rounded-2xl overflow-hidden bg-gradient-to-r from-blue-950 via-emerald-900 to-teal-900 border border-gray-200 shadow-md mb-6">
        {store.bannerUrl && (
          <img
            src={store.bannerUrl}
            alt={store.name}
            className="w-full h-full object-cover opacity-40"
            referrerPolicy="no-referrer"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

        <div className="absolute top-4 right-4 flex items-center gap-2">
          <button
            onClick={() => {
              navigator.clipboard?.writeText(window.location.href).catch(() => {});
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
              {store.logoUrl ? (
                <img src={store.logoUrl} alt={store.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <Building2 className="w-10 h-10" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-black text-gray-900">{store.name}</h1>
                {store.isVerified && (
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 border border-emerald-300">
                    <ShieldCheck className="w-3 h-3 text-emerald-700" /> VENDEDOR VERIFICADO
                  </span>
                )}
              </div>

              <p className="text-xs text-gray-600 mt-1 max-w-xl">
                {store.description || 'Loja parceira do Mercado Nusali com suporte Escrow.'}
              </p>

              <div className="flex items-center gap-4 mt-3 text-xs text-gray-600 flex-wrap">
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4 text-emerald-700" />
                  {storeCountry ? `${storeCountry.flag} ${storeCountry.name}` : store.countryCode}
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
          <Building2 className="w-4 h-4" /> Sobre a Loja
        </button>
      </div>

      {/* Tab 1: Catalog */}
      {activeTab === 'catalog' && (
        <div>
          <div className="bg-white p-4 rounded-xl border border-gray-200 mb-6 flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder={`Buscar dentro de ${store.name}...`}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-xs font-medium focus:outline-hidden focus:border-emerald-600"
              />
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            </div>
            <span className="text-xs text-gray-500 font-medium hidden sm:inline">
              Exibindo {filteredStoreProducts.length} de {products?.length || 0} itens
            </span>
          </div>

          {productsLoading && (
            <div className="py-12 flex items-center justify-center gap-2 text-gray-500 text-sm">
              <Loader2 className="w-5 h-5 animate-spin" /> Carregando produtos...
            </div>
          )}

          {!productsLoading && filteredStoreProducts.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {filteredStoreProducts.map((product: any) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}

          {!productsLoading && filteredStoreProducts.length === 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center my-8">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-gray-800">
                {searchFilter ? 'Nenhum produto encontrado nesta busca' : 'Esta loja ainda não tem produtos publicados'}
              </h3>
              {searchFilter && (
                <p className="text-xs text-gray-500 mt-1">Tente ajustar o termo de pesquisa no catálogo da loja.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: About */}
      {activeTab === 'about' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 space-y-6">
          <h3 className="text-xl font-bold text-gray-900">Informações da Loja</h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            {store.description || 'Esta loja ainda não adicionou uma descrição.'}
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
              <p className="text-xs text-gray-600 mt-1">Parceria direta com operadores logísticos regionais.</p>
            </div>
            <div className="p-4 bg-purple-50 rounded-xl border border-purple-100">
              <CheckCircle2 className="w-6 h-6 text-purple-700 mb-2" />
              <h4 className="font-bold text-sm text-gray-900">Compra Protegida</h4>
              <p className="text-xs text-gray-600 mt-1">Disputas mediadas pelo Mercado Nusali em caso de problema com o pedido.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
