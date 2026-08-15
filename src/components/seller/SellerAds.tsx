import React, { useState } from 'react';
import { Sparkles, Plus, TrendingUp, Eye, MousePointer, DollarSign, BarChart3, AlertCircle } from 'lucide-react';

interface SellerAdsProps {
  showToast: (msg: string) => void;
}

export const SellerAds: React.FC<SellerAdsProps> = ({ showToast }) => {
  const [dailyBudget, setDailyBudget] = useState(5000);
  const [adsCampaigns, setAdsCampaigns] = useState([
    { id: 'ADS-101', name: 'Campanha Autogestão Eletrônicos', status: 'Ativa', budget: '5.000 XOF/dia', impressions: '45.200', clicks: '1.850', ctr: '4.09%', roas: '8.4x', spend: '35.000 XOF', sales: '294.000 XOF' },
    { id: 'ADS-102', name: 'Anúncios Patrocinados Castanha Caju', status: 'Ativa', budget: '20 BRL/dia', impressions: '18.900', clicks: '920', ctr: '4.86%', roas: '11.2x', spend: '140 BRL', sales: '1.560 BRL' }
  ]);

  const [showModal, setShowModal] = useState(false);
  const [campaignName, setCampaignName] = useState('');

  const handleSaveBudget = () => {
    showToast(`Orçamento diário global de Nusali Ads atualizado para ${dailyBudget.toLocaleString()} XOF!`);
  };

  const handleCreateAd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignName.trim()) return;
    const newAd = {
      id: `ADS-${adsCampaigns.length + 101}`,
      name: campaignName.trim(),
      status: 'Ativa',
      budget: '3.000 XOF/dia',
      impressions: '0',
      clicks: '0',
      ctr: '0%',
      roas: '0x',
      spend: '0 XOF',
      sales: '0 XOF'
    };
    setAdsCampaigns([...adsCampaigns, newAd]);
    setCampaignName('');
    setShowModal(false);
    showToast(`Campanha de anúncios patrocinados "${newAd.name}" lançada!`);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-amber-500" />
            Nusali Ads - Anúncios Patrocinados
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Posicione seus produtos nas primeiras posições dos resultados de busca e ganhe destaque exclusivo.
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-md transition flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Criar Campanha de Anúncios
        </button>
      </div>

      {/* Daily Budget Card */}
      <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-white p-6 rounded-2xl shadow-md flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-black uppercase tracking-wider text-amber-100">Orçamento Diário de Publicidade</h3>
          <p className="text-2xl font-black">{dailyBudget.toLocaleString()} XOF / dia</p>
          <p className="text-[10px] text-amber-100">Cobrança automática via comissão sobre vendas geradas.</p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="number"
            value={dailyBudget}
            onChange={(e) => setDailyBudget(Number(e.target.value))}
            className="w-32 p-2 bg-white text-gray-900 font-bold text-xs rounded-xl border-none focus:ring-2 focus:ring-amber-300"
          />
          <button
            onClick={handleSaveBudget}
            className="bg-amber-900 hover:bg-black text-white font-extrabold text-xs px-4 py-2 rounded-xl transition"
          >
            Ajustar Teto
          </button>
        </div>
      </div>

      {/* Ads Performance List */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider">Campanhas Ativas</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-100 text-gray-500 uppercase text-[10px] font-bold">
              <tr>
                <th className="p-3">Campanha</th>
                <th className="p-3">Impressões</th>
                <th className="p-3">Cliques</th>
                <th className="p-3">CTR</th>
                <th className="p-3">ROAS</th>
                <th className="p-3">Investimento</th>
                <th className="p-3">Vendas</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 font-medium">
              {adsCampaigns.map(ad => (
                <tr key={ad.id}>
                  <td className="p-3 font-bold text-gray-900">{ad.name}</td>
                  <td className="p-3 text-gray-700">{ad.impressions}</td>
                  <td className="p-3 text-gray-700">{ad.clicks}</td>
                  <td className="p-3 font-bold text-blue-700">{ad.ctr}</td>
                  <td className="p-3 font-black text-emerald-700">{ad.roas}</td>
                  <td className="p-3 text-gray-900 font-bold">{ad.spend}</td>
                  <td className="p-3 text-emerald-800 font-black">{ad.sales}</td>
                  <td className="p-3">
                    <span className="bg-emerald-100 text-emerald-800 font-extrabold text-[10px] px-2.5 py-1 rounded-full uppercase">
                      {ad.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={handleCreateAd} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 border border-gray-200 shadow-2xl">
            <h3 className="text-base font-black text-gray-900">Nova Campanha Nusali Ads</h3>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-700">Nome da Campanha:</label>
              <input
                type="text"
                required
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="Ex: Lançamento Smartphone S23 Ultra"
                className="w-full p-2.5 border border-gray-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="w-1/2 bg-gray-100 py-2.5 rounded-xl text-xs font-bold">
                Cancelar
              </button>
              <button type="submit" className="w-1/2 bg-emerald-600 text-white py-2.5 rounded-xl text-xs font-extrabold shadow-md">
                Lançar Anúncios
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
