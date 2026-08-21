import React, { useState, useEffect } from 'react';
import { Building2, Sparkles, Plus, X, Loader2, Check, AlertTriangle } from 'lucide-react';
import { AdminService } from '../../services/adminService';

interface AdminStoresManagerProps {
  showToast: (msg: string) => void;
}

export const AdminStoresManager: React.FC<AdminStoresManagerProps> = ({ showToast }) => {
  const [stores, setStores] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStores = async () => {
    setIsLoading(true);
    try {
      const res = await AdminService.getStores();
      if (res.success && res.data) {
        setStores(res.data);
      }
    } catch {
      showToast('Erro ao carregar lojas.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStores();
  }, []);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [warningStore, setWarningStore] = useState<any | null>(null);
  const [warningReason, setWarningReason] = useState('');

  // Form for New Store
  const [name, setName] = useState('');
  const [seller, setSeller] = useState('');
  const [country, setCountry] = useState('GW');
  const [category, setCategory] = useState('Eletrônicos & Tecnologia');

  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Por favor, informe o nome da loja.');
      return;
    }

    try {
      showToast(`Solicitada abertura da loja oficial "${name}".`);
      setIsAddModalOpen(false);
      setName('');
      setSeller('');
      fetchStores();
    } catch {
      showToast('Erro ao criar loja.');
    }
  };

  const toggleHighlight = (store: any) => {
    const nextState = !store.highlighted;
    showToast(nextState ? `Loja "${store.name}" destacada.` : `Destaque removido da loja "${store.name}".`);
  };

  const handleSendWarning = (e: React.FormEvent) => {
    e.preventDefault();
    if (!warningStore) return;

    showToast(`Advertência formal enviada à loja "${warningStore.name}": ${warningReason || 'Violação de termos'}`);
    setWarningStore(null);
    setWarningReason('');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-purple-600" />
            Gestão & Moderação de Lojas Oficiais
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Supervisão de lojas parceiras, vitrines em destaque na Home e aplicação de advertências disciplinares.
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-md cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Credenciar Nova Loja Oficial
        </button>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-600 mb-2" />
          Carregando lojas...
        </div>
      ) : stores.length === 0 ? (
        <div className="p-12 text-center text-gray-500 font-bold bg-white rounded-2xl border border-gray-200">
          Nenhuma loja encontrada
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {stores.map(s => (
            <div key={s.id} className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5 space-y-4 hover:border-purple-300 transition">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 block">{s.countryCode || 'GW'}</span>
                  <h3 className="font-extrabold text-sm text-gray-900">{s.name}</h3>
                  <p className="text-xs text-purple-700 font-bold">Slug: /{s.slug}</p>
                </div>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                  s.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  {String(s.status || 'Ativa').toUpperCase()}
                </span>
              </div>

              <div className="space-y-1.5 text-xs bg-gray-50 p-3 rounded-xl">
                <div className="flex justify-between text-gray-600">
                  <span>Descrição:</span>
                  <strong className="text-gray-900 truncate max-w-[150px]">{s.description || 'Sem descrição'}</strong>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Avaliação:</span>
                  <strong className="text-gray-900">⭐ {s.rating || '5.0'}</strong>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between text-xs border-t border-gray-100">
                <button
                  onClick={() => toggleHighlight(s)}
                  className="font-bold flex items-center gap-1 cursor-pointer text-purple-600 hover:text-purple-800"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Destacar na Home
                </button>
                <button
                  onClick={() => { setWarningStore(s); setWarningReason(''); }}
                  className="text-amber-600 hover:text-amber-800 font-bold cursor-pointer"
                >
                  Advertência
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Credenciar Nova Loja */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-purple-600" /> Credenciar Nova Loja Oficial
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStore} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Nome Comercial da Loja:</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Guiné Bissau Megastore"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Responsável / Proprietário:</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Suleimane Embaló"
                  value={seller}
                  onChange={e => setSeller(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">País:</label>
                  <select
                    value={country}
                    onChange={e => setCountry(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                  >
                    <option value="GW">🇬🇼 Guiné-Bissau</option>
                    <option value="BR">🇧🇷 Brasil</option>
                    <option value="PT">🇵🇹 Portugal</option>
                    <option value="AO">🇦🇴 Angola</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Categoria:</label>
                  <input
                    type="text"
                    required
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 font-bold text-gray-700 rounded-xl hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-xl shadow-md flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" /> Criar Loja
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Advertência */}
      {warningStore && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" /> Advertência Formal - {warningStore.name}
              </h3>
              <button onClick={() => setWarningStore(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSendWarning} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Motivo da Advertência Disciplinar:</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Ex: Atraso recorrente nos despachos para o HUB Bandim Bissau..."
                  value={warningReason}
                  onChange={e => setWarningReason(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                />
              </div>

              <div className="pt-3 border-t border-gray-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setWarningStore(null)}
                  className="px-4 py-2 border border-gray-300 font-bold text-gray-700 rounded-xl hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-extrabold rounded-xl shadow-md"
                >
                  Enviar Notificação
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
