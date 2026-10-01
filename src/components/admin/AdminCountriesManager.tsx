import React, { useState, useEffect } from 'react';
import { Globe, Plus, ToggleLeft, ToggleRight, X, Check, Loader2 } from 'lucide-react';
import { AdminService } from '../../services/adminService';

// FASE D18-C4.4 — auditoria confirmou que representante/comissão/imposto/
// alfândega/regiões/limites/meios-de-pagamento/idioma/fuso/transportadoras/
// políticas por país eram TODOS literais fixos (nunca lidos do banco) e o
// "Salvar" do modal de edição só fazia setState local + toast, sem nenhuma
// chamada real ao backend. Auditoria completa do schema (countries,
// country_representatives — tabela real mas nunca usada em nenhum lugar do
// código, sellers.commissionRate — por SELLER, nunca por país,
// platformSettings.defaultSellerCommissionPercent — global, nunca por país)
// não encontrou NENHUM campo real equivalente a nenhum desses conceitos.
// Por instrução explícita do ticket, esses campos foram REMOVIDOS (não
// conectados a um conceito semanticamente diferente, nem mantidos como
// somente-leitura com dado fictício). Os únicos campos/ações reais
// (name/code/flag/currency/currencySymbol/phonePrefix/isActive via GET/POST
// /admin/countries e PATCH /admin/countries/:code/status) permanecem.
interface CountryRow {
  id: string;
  code: string;
  name: string;
  flag: string;
  currency: string;
  currencySymbol: string;
  phonePrefix: string;
  isActive: boolean;
}

interface AdminCountriesManagerProps {
  showToast: (msg: string) => void;
}

export const AdminCountriesManager: React.FC<AdminCountriesManagerProps> = ({ showToast }) => {
  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Form state for adding new country
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newFlag, setNewFlag] = useState('🌍');
  const [newCurrency, setNewCurrency] = useState('');
  const [newCurrencySymbol, setNewCurrencySymbol] = useState('');
  const [newPhoneCode, setNewPhoneCode] = useState('');

  const fetchCountries = async () => {
    setIsLoading(true);
    try {
      const res = await AdminService.getCountries();
      if (res.success && Array.isArray(res.data)) {
        setCountries(res.data.map((c: any) => ({
          id: c.id || c.code,
          code: c.code,
          name: c.name,
          flag: c.flag || '🌍',
          currency: c.currency,
          currencySymbol: c.currencySymbol,
          phonePrefix: c.phonePrefix || '+000',
          isActive: !!c.isActive,
        })));
      } else {
        setCountries([]);
      }
    } catch {
      setCountries([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCountries();
  }, []);

  const toggleStatus = async (id: string) => {
    const target = countries.find(c => c.id === id);
    if (!target) return;
    const newActive = !target.isActive;
    try {
      const res = await AdminService.toggleCountryStatus(target.code, newActive);
      setCountries(prev => prev.map(c => (c.id === id ? { ...c, isActive: newActive } : c)));
      showToast(res.message || `Status do país ${target.name} alterado com sucesso.`);
    } catch {
      showToast(`Não foi possível alterar o status do país.`);
    }
  };

  const handleAddCountry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newCode.trim()) {
      showToast('Por favor, preencha o nome e o código do país.');
      return;
    }

    try {
      const res = await AdminService.createCountry({
        name: newName,
        code: newCode.toUpperCase(),
        flag: newFlag || '🌍',
        currency: newCurrency || 'USD',
        currencySymbol: newCurrencySymbol || '$',
        phonePrefix: newPhoneCode || '+000',
      });

      if (res.success) {
        showToast(res.message || `Novo país "${newName}" adicionado com sucesso!`);
        fetchCountries();
      } else {
        showToast(res.error?.message || 'Erro ao cadastrar país.');
      }
    } catch {
      showToast('Erro ao cadastrar país.');
    }

    setIsAddModalOpen(false);
    setNewName('');
    setNewCode('');
    setNewFlag('🌍');
    setNewCurrency('');
    setNewCurrencySymbol('');
    setNewPhoneCode('');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Globe className="w-6 h-6 text-purple-600" />
            Gestão de Países & Configurações Nacionais
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Configuração de moedas, alfândegas, taxas de comissão, métodos de pagamento e limites por país CPLP.
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-md cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Adicionar Novo País
        </button>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-600 mb-2" />
          Carregando países...
        </div>
      ) : countries.length === 0 ? (
        <div className="p-12 text-center text-gray-500 font-bold bg-white rounded-2xl border border-gray-200">
          Nenhum país encontrado
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {countries.map(c => (
          <div key={c.id} className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5 space-y-4 hover:border-purple-300 transition">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{c.flag}</span>
                <div>
                  <h3 className="font-extrabold text-sm text-gray-900 flex items-center gap-2">
                    {c.name} <span className="text-xs text-gray-400 font-mono">({c.code})</span>
                  </h3>
                  <span className="text-[11px] text-gray-500">{c.currency} ({c.currencySymbol}) • {c.phonePrefix}</span>
                </div>
              </div>

              <button onClick={() => toggleStatus(c.id)}>
                {c.isActive ? (
                  <ToggleRight className="w-8 h-8 text-emerald-600 cursor-pointer" />
                ) : (
                  <ToggleLeft className="w-8 h-8 text-gray-300 cursor-pointer" />
                )}
              </button>
            </div>

            <div className="text-xs border-t border-gray-100 pt-3">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${c.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'}`}>
                {c.isActive ? 'ATIVO' : 'INATIVO'}
              </span>
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Add New Country Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-gray-200">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <Globe className="w-5 h-5 text-purple-600" /> Cadastrar Novo País
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCountry} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-gray-700 block mb-1">Nome do País:</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: São Tomé e Príncipe"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-700 block mb-1">Código ISO (2 Letras):</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: ST"
                    value={newCode}
                    onChange={e => setNewCode(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-gray-700 block mb-1">Bandeira (Emoji):</label>
                  <input
                    type="text"
                    placeholder="🇸🇹"
                    value={newFlag}
                    onChange={e => setNewFlag(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold text-center text-lg"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-700 block mb-1">Moeda (Código):</label>
                  <input
                    type="text"
                    placeholder="STN"
                    value={newCurrency}
                    onChange={e => setNewCurrency(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold uppercase"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-700 block mb-1">Símbolo:</label>
                  <input
                    type="text"
                    placeholder="Db"
                    value={newCurrencySymbol}
                    onChange={e => setNewCurrencySymbol(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">DDI (Prefixo Telefônico):</label>
                <input
                  type="text"
                  placeholder="+239"
                  value={newPhoneCode}
                  onChange={e => setNewPhoneCode(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-gray-100 font-bold text-xs rounded-xl hover:bg-gray-200 text-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 text-white font-extrabold text-xs rounded-xl hover:bg-purple-700 shadow-md flex items-center gap-1"
                >
                  <Check className="w-4 h-4" /> Cadastrar País
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
