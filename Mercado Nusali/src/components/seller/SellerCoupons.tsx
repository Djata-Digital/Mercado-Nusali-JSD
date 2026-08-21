import React, { useState } from 'react';
import { Gift, Plus, Copy, CheckCircle2, Clock, Trash2, Tag } from 'lucide-react';

interface SellerCouponsProps {
  showToast: (msg: string) => void;
}

export const SellerCoupons: React.FC<SellerCouponsProps> = ({ showToast }) => {
  const [coupons, setCoupons] = useState<any[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [code, setCode] = useState('');
  const [discountVal, setDiscountVal] = useState('15% OFF');

  const handleCreateCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    const newC = {
      id: `CUP-${coupons.length + 1}`,
      code: code.trim().toUpperCase(),
      discount: discountVal,
      minSpend: 'R$ 50',
      uses: '0 / 100',
      status: 'Ativo'
    };
    setCoupons([...coupons, newC]);
    setCode('');
    setShowModal(false);
    showToast(`Cupom de desconto ${newC.code} criado com sucesso!`);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Gift className="w-6 h-6 text-emerald-600" />
            Cupons do Vendedor
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Crie códigos promocionais personalizados para fidelizar clientes e incentivar compras de maior valor.
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-md transition flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Criar Novo Cupom
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] font-bold border-b border-gray-200">
              <tr>
                <th className="p-3">Código Cupom</th>
                <th className="p-3">Desconto</th>
                <th className="p-3">Compra Mínima</th>
                <th className="p-3">Usos / Limite</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 font-medium">
              {coupons.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-400">
                    Nenhum cupom de desconto criado para sua loja no momento.
                  </td>
                </tr>
              ) : (
                coupons.map(c => (
                <tr key={c.id}>
                  <td className="p-3 font-mono font-black text-emerald-800 text-sm">{c.code}</td>
                  <td className="p-3 font-bold text-gray-900">{c.discount}</td>
                  <td className="p-3 text-gray-600">{c.minSpend}</td>
                  <td className="p-3 text-gray-700">{c.uses}</td>
                  <td className="p-3">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                      c.status === 'Ativo' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => showToast(`Código ${c.code} copiado para a área de transferência!`)}
                      className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"
                      title="Copiar Código"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={handleCreateCoupon} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 border border-gray-200 shadow-2xl">
            <h3 className="text-base font-black text-gray-900">Novo Cupom de Desconto</h3>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-700">Código do Cupom:</label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Ex: NUSALI15"
                className="w-full p-2.5 border border-gray-300 rounded-xl font-mono uppercase text-xs font-bold focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-700">Desconto Oferecido:</label>
              <input
                type="text"
                value={discountVal}
                onChange={(e) => setDiscountVal(e.target.value)}
                placeholder="Ex: 15% OFF ou R$ 30 OFF"
                className="w-full p-2.5 border border-gray-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="w-1/2 bg-gray-100 py-2.5 rounded-xl text-xs font-bold">
                Cancelar
              </button>
              <button type="submit" className="w-1/2 bg-emerald-600 text-white py-2.5 rounded-xl text-xs font-extrabold shadow-md">
                Criar Cupom
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
