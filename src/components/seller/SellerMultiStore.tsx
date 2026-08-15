import React, { useState } from 'react';
import {
  Store,
  PlusCircle,
  Edit2,
  ExternalLink,
  MapPin,
  Globe,
  Phone,
  Mail,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Shield,
  CreditCard,
  X,
  Save,
} from 'lucide-react';
import { SellerStoreData } from '../../data/mockSellerData';
import { CountryCode, CurrencyCode } from '../../types';
import { countriesConfig } from '../../utils/currencyUtils';

interface SellerMultiStoreProps {
  stores: SellerStoreData[];
  selectedStoreId: string;
  onSelectStore: (id: string) => void;
  onAddStore: (store: SellerStoreData) => void;
  onUpdateStore: (store: SellerStoreData) => void;
  showToast: (msg: string) => void;
  openPublicStoreView?: (slug: string) => void;
}

export const SellerMultiStore: React.FC<SellerMultiStoreProps> = ({
  stores,
  selectedStoreId,
  onSelectStore,
  onAddStore,
  onUpdateStore,
  showToast,
  openPublicStoreView,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<SellerStoreData | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Eletrônicos e Tecnologia');
  const [country, setCountry] = useState<CountryCode>('GW');
  const [city, setCity] = useState('Bissau');
  const [address, setAddress] = useState('Avenida Amílcar Cabral, 140');
  const [phone, setPhone] = useState('+245 955123456');
  const [email, setEmail] = useState('loja@nusali.gw');
  const [logo, setLogo] = useState('https://images.unsplash.com/photo-1531297484001-80022131f5a1?auto=format&fit=crop&w=300&q=80');
  const [banner, setBanner] = useState('https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1200&q=80');
  const [openingHours, setOpeningHours] = useState('Seg - Sáb: 08:00 - 19:00');

  const handleOpenCreateModal = () => {
    setEditingStore(null);
    setName('');
    setDescription('');
    setCategory('Eletrônicos e Tecnologia');
    setCountry('GW');
    setCity('Bissau');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (store: SellerStoreData) => {
    setEditingStore(store);
    setName(store.name);
    setDescription(store.description);
    setCategory(store.category);
    setCountry(store.country);
    setCity(store.city);
    setAddress(store.address);
    setPhone(store.phone);
    setEmail(store.email);
    setLogo(store.logo);
    setBanner(store.banner);
    setOpeningHours(store.openingHours);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (editingStore) {
      const updated: SellerStoreData = {
        ...editingStore,
        name,
        description,
        category,
        country,
        city,
        address,
        phone,
        email,
        logo,
        banner,
        openingHours,
      };
      onUpdateStore(updated);
      showToast(`Loja "${name}" atualizada com sucesso!`);
    } else {
      const newStore: SellerStoreData = {
        id: `store-${Date.now()}`,
        name,
        slug: name.toLowerCase().replace(/\s+/g, '-'),
        logo,
        banner,
        description,
        category,
        country,
        city,
        address,
        phone,
        email,
        openingHours,
        exchangePolicy: 'Troca garantida em até 14 dias.',
        warrantyPolicy: '12 Meses de garantia legal.',
        returnPolicy: 'Devolução sem custos em até 7 dias.',
        status: 'active',
        isOfficial: true,
        rating: 5.0,
        followersCount: 1,
        salesCount: 0,
        acceptedCurrencies: ['XOF', 'EUR', 'USD'],
        acceptedPayments: ['Orange Money', 'MTN Money', 'Nusali Pay'],
        shippingMethods: ['Nusali Express Local'],
      };
      onAddStore(newStore);
      showToast(`Nova loja "${name}" criada e ativada!`);
    }

    setIsModalOpen(false);
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <Store className="w-6 h-6 text-emerald-700" /> Gerenciamento de Lojas (Multiloja)
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Crie e gerencie múltiplas lojas físicas e virtuais com estoques, moedas e políticas independentes.
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition flex items-center gap-2 shadow-xs shrink-0"
        >
          <PlusCircle className="w-4 h-4" /> Cadastrar Nova Loja
        </button>
      </div>

      {/* Stores Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {stores.map((s) => {
          const isSelected = s.id === selectedStoreId;
          const countryConf = countriesConfig[s.country] || countriesConfig.GW;

          return (
            <div
              key={s.id}
              className={`bg-white rounded-2xl border overflow-hidden transition shadow-2xs ${
                isSelected ? 'border-2 border-emerald-600 ring-2 ring-emerald-500/20' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {/* Store Banner */}
              <div className="h-28 bg-gray-100 relative">
                <img src={s.banner} alt="" className="w-full h-full object-cover" />
                <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-xs text-white text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
                  <span>{countryConf.flag}</span> {countryConf.name}
                </div>
                {isSelected && (
                  <div className="absolute top-3 left-3 bg-emerald-600 text-white text-[10px] font-black px-2.5 py-1 rounded-full shadow-md">
                    LOJA ATIVA NO PAINEL
                  </div>
                )}
              </div>

              {/* Store Content */}
              <div className="p-5 space-y-4">
                <div className="flex items-start gap-3 -mt-10">
                  <img
                    src={s.logo}
                    alt=""
                    className="w-16 h-16 rounded-2xl object-cover border-2 border-white shadow-md bg-white shrink-0"
                  />
                  <div className="mt-8">
                    <h3 className="font-bold text-sm text-gray-900">{s.name}</h3>
                    <p className="text-[11px] text-gray-500 font-medium">{s.category}</p>
                  </div>
                </div>

                <p className="text-xs text-gray-600 line-clamp-2">{s.description}</p>

                <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-600 bg-gray-50 p-3 rounded-xl border border-gray-100 font-medium">
                  <div className="flex items-center gap-1.5 truncate">
                    <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span className="truncate">{s.city}, {s.address}</span>
                  </div>
                  <div className="flex items-center gap-1.5 truncate">
                    <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span className="truncate">{s.phone}</span>
                  </div>
                  <div className="flex items-center gap-1.5 truncate">
                    <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span className="truncate">{s.openingHours}</span>
                  </div>
                  <div className="flex items-center gap-1.5 truncate">
                    <Shield className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="truncate font-bold text-emerald-800">
                      {s.salesCount} vendas • Nota {s.rating}
                    </span>
                  </div>
                </div>

                {/* Actions Bar */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
                  {!isSelected ? (
                    <button
                      onClick={() => {
                        onSelectStore(s.id);
                        showToast(`Loja alternada para: ${s.name}`);
                      }}
                      className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold px-3 py-2 rounded-xl text-xs transition"
                    >
                      Selecionar esta Loja
                    </button>
                  ) : (
                    <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> Loja em Uso
                    </span>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenEditModal(s)}
                      className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition text-xs font-bold flex items-center gap-1"
                      title="Editar Loja"
                    >
                      <Edit2 className="w-3.5 h-3.5" /> Editar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Form for Create / Edit Store */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-bold text-base text-gray-900 flex items-center gap-2">
                <Store className="w-5 h-5 text-emerald-700" />
                {editingStore ? `Editar Loja: ${editingStore.name}` : 'Cadastrar Nova Loja Comercial'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs font-medium">
              <div>
                <label className="block text-gray-700 font-bold mb-1">Nome da Loja *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: AgroNusali Export Bissau"
                  required
                  className="w-full p-2.5 border border-gray-300 rounded-xl focus:border-emerald-600 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 font-bold mb-1">Categoria Principal *</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl bg-white"
                  >
                    <option value="Eletrônicos e Tecnologia">Eletrônicos e Tecnologia</option>
                    <option value="Agronegócio & Exportação">Agronegócio & Exportação</option>
                    <option value="Moda & Calçados">Moda & Calçados</option>
                    <option value="Supermercado & Alimentos">Supermercado & Alimentos</option>
                    <option value="Casa & Decoração">Casa & Decoração</option>
                  </select>
                </div>

                <div>
                  <label className="block text-gray-700 font-bold mb-1">País Sede da Loja *</label>
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value as CountryCode)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl bg-white"
                  >
                    {(Object.keys(countriesConfig) as CountryCode[]).map((c) => (
                      <option key={c} value={c}>
                        {countriesConfig[c].flag} {countriesConfig[c].name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 font-bold mb-1">Cidade *</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    required
                    className="w-full p-2.5 border border-gray-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-bold mb-1">Telefone da Loja *</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    className="w-full p-2.5 border border-gray-300 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-700 font-bold mb-1">Descrição Comercial</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full p-2.5 border border-gray-300 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 font-bold mb-1">URL da Logo</label>
                  <input
                    type="text"
                    value={logo}
                    onChange={(e) => setLogo(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl text-slate-600 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-bold mb-1">URL do Banner</label>
                  <input
                    type="text"
                    value={banner}
                    onChange={(e) => setBanner(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl text-slate-600 font-mono"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-xl text-gray-700 font-bold hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-2 shadow-xs"
                >
                  <Save className="w-4 h-4" /> {editingStore ? 'Salvar Alterações' : 'Criar Loja Agora'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
