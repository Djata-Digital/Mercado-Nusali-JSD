import React, { useState } from 'react';
import { Megaphone, Plus, Sparkles, Tag, Gift, Edit2, Trash2, X, Check } from 'lucide-react';

interface AdminMarketingManagerProps {
  showToast: (msg: string) => void;
}

interface CampaignItem {
  id: string;
  title: string;
  discount: string;
  banner: string;
  status: string;
}

export const AdminMarketingManager: React.FC<AdminMarketingManagerProps> = ({ showToast }) => {
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<CampaignItem | null>(null);

  const [title, setTitle] = useState('');
  const [discount, setDiscount] = useState('');
  const [banner, setBanner] = useState('Banners Home Nusali');
  const [status, setStatus] = useState('Ativa');

  const handleOpenCreate = () => {
    setEditingCampaign(null);
    setTitle('');
    setDiscount('');
    setBanner('Banners Home Nusali');
    setStatus('Ativa');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (c: CampaignItem) => {
    setEditingCampaign(c);
    setTitle(c.title);
    setDiscount(c.discount);
    setBanner(c.banner);
    setStatus(c.status);
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      showToast('Por favor, informe o título da campanha.');
      return;
    }

    if (editingCampaign) {
      setCampaigns(prev =>
        prev.map(c =>
          c.id === editingCampaign.id
            ? { ...c, title, discount: discount || 'Sem Desconto', banner, status }
            : c
        )
      );
      showToast(`Campanha "${title}" atualizada!`);
    } else {
      const newCamp: CampaignItem = {
        id: `CMP-${Date.now().toString().slice(-4)}`,
        title,
        discount: discount || 'Promocional',
        banner,
        status
      };
      setCampaigns(prev => [...prev, newCamp]);
      showToast(`Nova campanha "${title}" criada com sucesso!`);
    }

    setIsModalOpen(false);
  };

  const handleDelete = (id: string, title: string) => {
    if (confirm(`Deseja remover a campanha "${title}"?`)) {
      setCampaigns(prev => prev.filter(c => c.id !== id));
      showToast(`Campanha "${title}" removida.`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-purple-600" />
            Central de Marketing, Banners & Promoções CPLP
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Gestão de banners na Home, cupons globais de desconto e campanhas sazonais por país.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-md cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Criar Campanha
        </button>
      </div>

      {campaigns.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
          <Megaphone className="w-12 h-12 mx-auto mb-3 text-gray-300 stroke-1" />
          <p className="font-bold text-sm text-gray-600">Nenhuma campanha de marketing ou banner ativo.</p>
          <p className="text-xs text-gray-400 mt-1">Clique no botão acima para criar a primeira campanha promocional.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {campaigns.map(c => (
          <div key={c.id} className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5 space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-extrabold text-sm text-gray-900">{c.title}</h3>
                <span className="text-xs text-purple-700 font-bold">{c.discount}</span>
              </div>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                c.status === 'Ativa' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}>
                {c.status}
              </span>
            </div>
            <p className="text-xs text-gray-500 font-bold">Local de Exibição: {c.banner}</p>

            <div className="pt-2 flex items-center justify-end gap-1 border-t border-gray-100">
              <button
                onClick={() => handleOpenEdit(c)}
                className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg cursor-pointer"
                title="Editar"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleDelete(c.id, c.title)}
                className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                title="Excluir"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        </div>
      )}

      {/* Modal Criar / Editar */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-purple-600" />
                {editingCampaign ? 'Editar Campanha' : 'Criar Nova Campanha'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Título da Campanha:</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Ofertas de Primavera CPLP"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Desconto / Cupom:</label>
                <input
                  type="text"
                  placeholder="Ex: 20% OFF ou CUPOM-20"
                  value={discount}
                  onChange={e => setDiscount(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Local de Exibição do Banner:</label>
                <select
                  value={banner}
                  onChange={e => setBanner(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                >
                  <option value="Banners Home Nusali">Banners Home Nusali</option>
                  <option value="Pop-up Checkout">Pop-up Checkout</option>
                  <option value="Topo da Categoria">Topo da Categoria</option>
                  <option value="Notificação Push">Notificação Push Global</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Status:</label>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                >
                  <option value="Ativa">Ativa</option>
                  <option value="Agendada">Agendada</option>
                  <option value="Pausada">Pausada</option>
                </select>
              </div>

              <div className="pt-3 border-t border-gray-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 font-bold text-gray-700 rounded-xl hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-xl shadow-md flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" /> Salvar Campanha
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
