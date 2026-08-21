import React, { useState } from 'react';
import { Building2, Plus, Users, Star, MapPin, CheckCircle2, ShieldCheck, Heart, Store as StoreIcon, ArrowRight } from 'lucide-react';
import { useMarketplace } from '../context/MarketplaceContext';
import { CountryCode } from '../types';
import { countriesConfig } from '../utils/currencyUtils';

export const StoresView: React.FC = () => {
  const { stores, createNewStore, selectedCountry, products, openProductDetail } = useMarketplace();

  const [isCreating, setIsCreating] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('Bissau');
  const [country, setCountry] = useState<CountryCode>(selectedCountry);
  const [openingHours, setOpeningHours] = useState('08:00 - 18:00 (Seg a Sáb)');
  const [policies, setPolicies] = useState('Garantia de satisfação Nusali e devolução em até 7 dias.');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim()) return;

    createNewStore({
      sellerId: `sel-${Date.now()}`,
      name: storeName,
      slug: storeName.toLowerCase().replace(/\s+/g, '-'),
      logo: 'https://images.unsplash.com/photo-1531297484001-80022131f5a1?auto=format&fit=crop&w=200&q=80',
      banner: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1200&q=80',
      description,
      address,
      city,
      country,
      openingHours,
      policies,
      team: [{ id: 'usr-1', name: 'Você (Proprietário)', email: 'admin@nusali.com', role: 'owner', joinedAt: 'Hoje' }],
    });

    setIsCreating(false);
    setStoreName('');
    setDescription('');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-emerald-800 via-teal-900 to-blue-950 text-white rounded-2xl p-6 md:p-8 mb-8 shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 bg-yellow-400 text-blue-950 px-3 py-1 rounded-full text-xs font-black mb-3">
              <Building2 className="w-4 h-4" /> Multi-Store International Platform
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white">
              Lojas Oficiais & Marcas Licenciadas Nusali
            </h1>
            <p className="text-gray-200 text-sm mt-2 max-w-2xl">
              Crie e gerencie múltiplas filiais ou lojas especializadas em Guiné-Bissau, Brasil e Europa com gestão de equipe, estoque centralizado e selo de autenticidade.
            </p>
          </div>

          <button
            onClick={() => setIsCreating(!isCreating)}
            className="bg-yellow-400 hover:bg-yellow-300 text-blue-950 font-black px-5 py-3 rounded-xl shadow-lg transition flex items-center gap-2 text-sm shrink-0"
          >
            <Plus className="w-5 h-5" /> {isCreating ? 'Fechar Formulário' : 'Criar Nova Loja Oficial'}
          </button>
        </div>
      </div>

      {/* Store Creation Drawer / Form */}
      {isCreating && (
        <div className="bg-white rounded-2xl shadow-xl border border-emerald-200 p-6 md:p-8 mb-8 animate-fadeIn">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <StoreIcon className="w-5 h-5 text-emerald-600" /> Cadastrar Nova Loja
          </h2>

          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-gray-700 font-semibold mb-1">Nome Oficial da Loja</label>
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="Ex: Bissau Tech Direct"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-gray-700 font-semibold mb-1">País da Sede</label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value as CountryCode)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none font-medium"
              >
                {(Object.keys(countriesConfig) as CountryCode[]).map((c) => (
                  <option key={c} value={c}>
                    {countriesConfig[c].flag} {countriesConfig[c].name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-gray-700 font-semibold mb-1">Cidade / Província</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-gray-700 font-semibold mb-1">Endereço Físico / Showroom</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Ex: Av. Amílcar Cabral, 45"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-gray-700 font-semibold mb-1">Descrição / Biografia da Loja</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descreva os produtos comercializados, especialidades e garantias oferecidas..."
                rows={2}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-gray-700 font-semibold mb-1">Horário de Atendimento</label>
              <input
                type="text"
                value={openingHours}
                onChange={(e) => setOpeningHours(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-gray-700 font-semibold mb-1">Política de Devolução & Garantia</label>
              <input
                type="text"
                value={policies}
                onChange={(e) => setPolicies(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div className="md:col-span-2 flex justify-end gap-3 mt-2">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-100 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-md transition"
              >
                Salvar e Ativar Loja
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Stores Directory Grid */}
      <div className="space-y-8">
        {stores.map((store) => {
          const conf = countriesConfig[store.country] || countriesConfig.GW;
          return (
            <div
              key={store.id}
              className="bg-white rounded-2xl shadow-md border border-gray-200 overflow-hidden hover:shadow-lg transition"
            >
              {/* Store Banner & Logo header */}
              <div className="h-44 relative bg-gray-900">
                <img
                  src={store.banner}
                  alt={store.name}
                  className="w-full h-full object-cover opacity-80"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>

                <div className="absolute bottom-4 left-6 flex items-end gap-4 z-10">
                  <div className="w-16 h-16 rounded-2xl border-2 border-white bg-white p-1 shadow-md overflow-hidden shrink-0">
                    <img src={store.logo} alt={store.name} className="w-full h-full object-cover rounded-xl" />
                  </div>
                  <div className="text-white">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-extrabold text-white">{store.name}</h2>
                      <span className="bg-emerald-500 text-white font-bold text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Oficial
                      </span>
                    </div>
                    <p className="text-xs text-gray-300 flex items-center gap-2 mt-0.5">
                      <span>{conf.flag} {store.city}, {conf.name}</span> • <span>{store.followersCount} seguidores</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Store Body Info */}
              <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-3">
                  <p className="text-xs text-gray-700 leading-relaxed font-medium">
                    {store.description}
                  </p>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600 font-medium">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-emerald-600" /> {store.address}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-blue-600" /> {store.team?.length || 1} membros na equipe
                    </span>
                    <span className="flex items-center gap-1 font-bold text-yellow-600">
                      <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" /> {store.rating} Reputação
                    </span>
                  </div>

                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-[11px] text-gray-600">
                    <span className="font-bold text-gray-800 block mb-0.5">Políticas & Atendimento:</span>
                    {store.policies} • Horário: {store.openingHours}
                  </div>
                </div>

                {/* Team Members & Action */}
                <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-emerald-950 mb-2 flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-emerald-700" /> Equipe de Vendas
                    </h3>
                    <div className="space-y-1.5">
                      {store.team?.map((member) => (
                        <div key={member.id} className="text-[11px] flex items-center justify-between">
                          <span className="font-medium text-gray-800">{member.name}</span>
                          <span className="bg-white border border-emerald-200 text-emerald-800 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">
                            {member.role}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button className="mt-4 w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2 rounded-lg text-xs transition flex items-center justify-center gap-1.5 shadow-xs">
                    <Heart className="w-3.5 h-3.5 text-yellow-300" /> Seguir Loja Oficial
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
