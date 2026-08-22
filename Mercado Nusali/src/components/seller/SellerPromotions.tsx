import React, { useState } from 'react';
import { Tag, Plus, CheckCircle2, Clock, Trash2, Edit2, Sparkles, AlertCircle } from 'lucide-react';

interface SellerPromotionsProps {
  showToast: (msg: string) => void;
}

export const SellerPromotions: React.FC<SellerPromotionsProps> = ({ showToast }) => {
  const [promos, setPromos] = useState<any[]>([]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPromoName, setNewPromoName] = useState('');
  const [newDiscountPct, setNewDiscountPct] = useState(10);

  const handleCreatePromo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPromoName.trim()) return;
    const newP = {
      id: `PROMO-${Math.floor(100 + Math.random() * 900)}`,
      name: newPromoName.trim(),
      discountPct: newDiscountPct,
      startDate: 'Amanhã',
      endDate: 'Em 7 dias',
      status: 'Ativa',
      itemsCount: 5
    };
    setPromos([...promos, newP]);
    setNewPromoName('');
    setShowCreateModal(false);
    showToast(`Promoção "${newP.name}" criada e ativada no catálogo!`);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Tag className="w-6 h-6 text-emerald-600" />
            Promoções & Ofertas do Vendedor
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Crie descontos temporários para destacar seus anúncios na busca e aumentar as conversões.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-md transition flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Criar Nova Promoção
        </button>
      </div>

      {promos.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
          <Tag className="w-12 h-12 mx-auto mb-3 text-gray-300 stroke-1" />
          <p className="font-bold text-sm text-gray-600">Nenhuma promoção ou oferta cadastrada na sua loja.</p>
          <p className="text-xs text-gray-400 mt-1">Clique no botão acima para lançar a primeira promoção com porcentagem de desconto.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {promos.map(p => (
          <div key={p.id} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="bg-emerald-100 text-emerald-800 font-black text-[10px] px-2.5 py-1 rounded-full uppercase">
                {p.status}
              </span>
              <span className="text-xs font-bold text-gray-400">{p.id}</span>
            </div>
            <h3 className="text-base font-extrabold text-gray-900">{p.name}</h3>
            <p className="text-xs text-gray-600">
              Desconto: <strong className="text-emerald-700 font-black text-sm">{p.discountPct}% OFF</strong> em {p.itemsCount} produtos selecionados.
            </p>
            <p className="text-[10px] text-gray-400">Vigência: {p.startDate} até {p.endDate}</p>
          </div>
        ))}
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={handleCreatePromo} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 border border-gray-200 shadow-2xl">
            <h3 className="text-base font-black text-gray-900">Cadastrar Promoção Própria</h3>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-700">Nome da Promoção:</label>
              <input
                type="text"
                required
                value={newPromoName}
                onChange={(e) => setNewPromoName(e.target.value)}
                placeholder="Ex: Semana de Ofertas de Eletrônicos"
                className="w-full p-2.5 border border-gray-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-700">Porcentagem de Desconto (%):</label>
              <input
                type="number"
                min={5}
                max={80}
                value={newDiscountPct}
                onChange={(e) => setNewDiscountPct(Number(e.target.value))}
                className="w-full p-2.5 border border-gray-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setShowCreateModal(false)} className="w-1/2 bg-gray-100 py-2.5 rounded-xl text-xs font-bold">
                Cancelar
              </button>
              <button type="submit" className="w-1/2 bg-emerald-600 text-white py-2.5 rounded-xl text-xs font-extrabold shadow-md">
                Salvar e Ativar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
