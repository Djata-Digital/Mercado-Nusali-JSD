import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ShieldCheck, Star, ChevronRight, MapPin } from 'lucide-react';

export const StoresListPage: React.FC = () => {
  const navigate = useNavigate();

  const mockStoresList = [
    {
      id: 'seller_tech',
      name: 'TechStore Guiné Oficial',
      category: 'Eletrônicos & Smartphones',
      rating: 4.9,
      sales: '8.9k vendas',
      country: 'Guiné-Bissau 🇬🇼',
      isOfficial: true,
      logoUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=200',
    },
    {
      id: 'seller_fashion',
      name: 'Nusali Modas & Elegança',
      category: 'Moda, Calçados e Acessórios',
      rating: 4.8,
      sales: '4.2k vendas',
      country: 'Brasil 🇧🇷',
      isOfficial: true,
      logoUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&q=80&w=200',
    },
    {
      id: 'seller_home',
      name: 'Casa & Conforto Bissau',
      category: 'Eletrodomésticos e Decoração',
      rating: 4.7,
      sales: '2.1k vendas',
      country: 'Guiné-Bissau 🇬🇼',
      isOfficial: false,
      logoUrl: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&q=80&w=200',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
          <Building2 className="w-6 h-6 text-emerald-600" /> Lojas Oficiais e Vendedores Verificados
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          Compre diretamente das melhores marcas nacionais e internacionais com garantia de autenticidade
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mockStoresList.map((store) => (
          <div
            key={store.id}
            onClick={() => navigate(`/stores/${store.id}`)}
            className="bg-white p-6 rounded-xl border border-gray-200 hover:border-emerald-500 hover:shadow-lg transition cursor-pointer flex flex-col justify-between group"
          >
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <img
                  src={store.logoUrl}
                  alt={store.name}
                  className="w-16 h-16 rounded-xl object-cover border border-gray-200 shadow-xs group-hover:scale-105 transition"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-bold text-gray-900 group-hover:text-emerald-700 transition">
                      {store.name}
                    </h3>
                    {store.isOfficial && <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />}
                  </div>
                  <p className="text-xs text-gray-500">{store.category}</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-gray-600 pt-2 border-t border-gray-100">
                <div className="flex items-center gap-1 text-amber-500 font-bold">
                  <Star className="w-4 h-4 fill-amber-400" />
                  <span>{store.rating}</span>
                  <span className="text-gray-400 font-normal">({store.sales})</span>
                </div>
                <div className="flex items-center gap-1 font-semibold text-gray-700">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{store.country}</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-3 border-t border-gray-100 flex items-center justify-between text-xs font-bold text-emerald-700">
              <span>Visitar Loja</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
