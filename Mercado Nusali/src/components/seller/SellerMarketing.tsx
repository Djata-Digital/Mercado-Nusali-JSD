import React, { useState } from 'react';
import {
  Tag,
  Gift,
  Megaphone,
  Sparkles,
  PlusCircle,
  CheckCircle2,
  Calendar,
  Percent,
  X,
  TrendingUp,
} from 'lucide-react';

interface SellerMarketingProps {
  showToast: (msg: string) => void;
}

export const SellerMarketing: React.FC<SellerMarketingProps> = ({ showToast }) => {
  const [activeTab, setActiveTab] = useState<'coupons' | 'campaigns' | 'ads'>('coupons');
  const [isCouponModalOpen, setIsCouponModalOpen] = useState(false);
  const [couponCode, setCouponCode] = useState('DESCONTO10');
  const [discountPercent, setDiscountPercent] = useState('10');

  const coupons: any[] = [];
  const campaigns: any[] = [];

  const handleCreateCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    showToast(`Cupom "${couponCode}" de ${discountPercent}% criado com sucesso!`);
    setIsCouponModalOpen(false);
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <Tag className="w-6 h-6 text-emerald-700" /> Marketing, Cupons & Anúncios Patrocinados
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Aumente a visibilidade dos seus anúncios e ofereça cupons exclusivos para alavancar suas vendas.
          </p>
        </div>

        <button
          onClick={() => setIsCouponModalOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition flex items-center gap-2 shadow-xs shrink-0"
        >
          <PlusCircle className="w-4 h-4" /> Criar Novo Cupom de Desconto
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-gray-200 p-2 shadow-2xs flex items-center gap-2 text-xs font-bold">
        <button
          onClick={() => setActiveTab('coupons')}
          className={`px-4 py-2 rounded-xl transition flex items-center gap-2 ${
            activeTab === 'coupons' ? 'bg-emerald-600 text-white font-black' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Gift className="w-4 h-4" /> Cupons do Vendedor
        </button>

        <button
          onClick={() => setActiveTab('campaigns')}
          className={`px-4 py-2 rounded-xl transition flex items-center gap-2 ${
            activeTab === 'campaigns' ? 'bg-emerald-600 text-white font-black' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Megaphone className="w-4 h-4" /> Campanhas Sazonais
        </button>

        <button
          onClick={() => setActiveTab('ads')}
          className={`px-4 py-2 rounded-xl transition flex items-center gap-2 ${
            activeTab === 'ads' ? 'bg-emerald-600 text-white font-black' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-500" /> Anúncios Patrocinados
        </button>
      </div>

      {/* Active Tab Body */}
      {activeTab === 'coupons' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs space-y-4">
          <h2 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3">Seus Cupons Ativos</h2>
          {coupons.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <Gift className="w-10 h-10 mx-auto mb-2 text-gray-300 stroke-1" />
              <p className="font-bold text-sm text-gray-600">Nenhum cupom de desconto criado até o momento.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {coupons.map((c, idx) => (
                <div key={idx} className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-sm text-emerald-900 font-mono tracking-wider bg-white px-2.5 py-1 rounded-lg border border-emerald-300">
                      {c.code}
                    </span>
                    <span className="bg-emerald-600 text-white font-bold text-[10px] px-2 py-0.5 rounded-full">
                      {c.status}
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-700 font-semibold pt-1">
                    <span>Desconto: <strong>{c.discount}</strong></span>
                    <span>Usos: <strong>{c.uses} resgates</strong></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'campaigns' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs space-y-4">
          <h2 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3">Campanhas Oficiais Nusali</h2>
          {campaigns.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <Megaphone className="w-10 h-10 mx-auto mb-2 text-gray-300 stroke-1" />
              <p className="font-bold text-sm text-gray-600">Nenhuma campanha promocional ativa no momento.</p>
            </div>
          ) : (
            <div className="space-y-3 text-xs">
              {campaigns.map((camp, idx) => (
                <div key={idx} className="p-4 bg-gray-50 rounded-2xl border border-gray-200 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-gray-900">{camp.name}</h3>
                    <span className="text-gray-500 font-mono text-[11px] block mt-0.5">
                      {camp.date} • Benefício: {camp.discount}
                    </span>
                  </div>

                  <button
                    onClick={() => showToast(`Inscrição solicitada para a campanha "${camp.name}"`)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl transition text-xs"
                  >
                    Inscrever Produtos
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'ads' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500 fill-amber-500" /> Anúncios Patrocinados (Destaque na Busca)
            </h2>
          </div>

          <div className="p-8 text-center text-gray-400">
            <Sparkles className="w-10 h-10 mx-auto mb-2 text-gray-300 stroke-1" />
            <p className="font-bold text-sm text-gray-600">Nenhum anúncio patrocinado ativo.</p>
          </div>
        </div>
      )}

      {/* Create Coupon Modal */}
      {isCouponModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-6 shadow-2xl text-xs">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-bold text-base text-gray-900 flex items-center gap-2">
                <Gift className="w-5 h-5 text-emerald-700" /> Criar Cupom de Desconto
              </h3>
              <button onClick={() => setIsCouponModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCoupon} className="space-y-4">
              <div>
                <label className="block text-gray-700 font-bold mb-1">Código do Cupom *</label>
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-mono font-black uppercase text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-700 font-bold mb-1">Porcentagem de Desconto (%) *</label>
                <input
                  type="number"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                  required
                />
              </div>

              <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCouponModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-xl font-bold text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-2 shadow-xs"
                >
                  <Gift className="w-4 h-4" /> Ativar Cupom
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
