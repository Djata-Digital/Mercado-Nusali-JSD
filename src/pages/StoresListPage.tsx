import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ShieldCheck, ChevronRight, MapPin, Loader2, AlertCircle, Store as StoreIcon } from 'lucide-react';
import { useStores } from '../hooks/useStores';
import { useCountries } from '../hooks/useCountries';

export const StoresListPage: React.FC = () => {
  const navigate = useNavigate();
  const { data: storesList, isLoading, isError } = useStores();
  const { data: operationalCountries } = useCountries();

  const countryFor = (code: string) => operationalCountries?.find((c) => c.code === code);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
          <Building2 className="w-6 h-6 text-emerald-600" /> Lojas do Mercado Nusali
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          Compre diretamente de vendedores reais cadastrados na plataforma
        </p>
      </div>

      {isLoading && (
        <div className="py-16 flex flex-col items-center justify-center gap-3 text-gray-500">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-sm">Carregando lojas...</p>
        </div>
      )}

      {!isLoading && isError && (
        <div className="py-16 flex flex-col items-center justify-center gap-3 text-red-600 bg-red-50 border border-red-200 rounded-2xl">
          <AlertCircle className="w-8 h-8" />
          <p className="text-sm font-semibold">Não foi possível carregar as lojas no momento.</p>
          <p className="text-xs text-red-500">Tente novamente em instantes.</p>
        </div>
      )}

      {!isLoading && !isError && (!storesList || storesList.length === 0) && (
        <div className="py-16 flex flex-col items-center justify-center gap-3 text-gray-500 bg-gray-50 border border-gray-200 rounded-2xl">
          <StoreIcon className="w-8 h-8 text-gray-300" />
          <p className="text-sm font-semibold text-gray-700">Nenhuma loja disponível no momento.</p>
        </div>
      )}

      {!isLoading && !isError && storesList && storesList.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {storesList.map((store) => {
            const country = countryFor(store.countryCode);
            return (
              <div
                key={store.id}
                onClick={() => navigate(`/stores/${store.slug || store.id}`)}
                className="bg-white p-6 rounded-xl border border-gray-200 hover:border-emerald-500 hover:shadow-lg transition cursor-pointer flex flex-col justify-between group"
              >
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    {store.logoUrl ? (
                      <img
                        src={store.logoUrl}
                        alt={store.name}
                        className="w-16 h-16 rounded-xl object-cover border border-gray-200 shadow-xs group-hover:scale-105 transition"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-emerald-50 border border-gray-200 flex items-center justify-center shrink-0">
                        <Building2 className="w-7 h-7 text-emerald-600" />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-bold text-gray-900 group-hover:text-emerald-700 transition">
                          {store.name}
                        </h3>
                        {store.isVerified && <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />}
                      </div>
                      <p className="text-xs text-gray-500">{store.categoryName || 'Loja Nusali'}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end text-xs text-gray-600 pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-1 font-semibold text-gray-700">
                      <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{country ? `${country.flag} ${country.name}` : store.countryCode}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-3 border-t border-gray-100 flex items-center justify-between text-xs font-bold text-emerald-700">
                  <span>Visitar Loja</span>
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
