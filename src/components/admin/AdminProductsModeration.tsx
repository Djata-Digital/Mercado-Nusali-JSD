import React, { useState } from 'react';
import { Package, ShieldAlert, CheckCircle, XCircle, Trash2, Search, Filter, AlertOctagon } from 'lucide-react';

interface AdminProductsModerationProps {
  showToast: (msg: string) => void;
}

export const AdminProductsModeration: React.FC<AdminProductsModerationProps> = ({ showToast }) => {
  const [products, setProducts] = useState([
    { id: 'PROD-1', title: 'Inversor Solar Híbrido 5kW 48V High Efficiency', seller: 'Energia Solar Bissau', price: '450.000 XOF', category: 'Energia Solar', status: 'Aprovado', risk: 'Baixo' },
    { id: 'PROD-2', title: 'Galaxy S23 Ultra 512GB Phantom Black', seller: 'Bissau Tech Store', price: '890.000 XOF', category: 'Smartphones', status: 'Em Análise', risk: 'Médio' },
    { id: 'PROD-3', title: 'Trator Agrícola Nusali Heavy Duty 75HP', seller: 'Soluções Agrícolas Lda', price: '12.500.000 XOF', category: 'Maquinaria', status: 'Aprovado', risk: 'Baixo' },
    { id: 'PROD-4', title: 'Réplica de Relógio Importado Luxo', seller: 'Importadora Caxito', price: '15.000 Kz', category: 'Acessórios', status: 'Denunciado', risk: 'Crítico' },
  ]);

  const handleApprove = (id: string) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, status: 'Aprovado' } : p));
    showToast(`Produto #${id} aprovado para exibição global no catálogo.`);
  };

  const handleSuspend = (id: string) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, status: 'Suspenso' } : p));
    showToast(`Produto #${id} suspenso por violação de termos.`);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Package className="w-6 h-6 text-purple-600" />
            Moderação de Produtos & Antifraude de Anúncios
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Análise de anúncios pendentes, controle de contrafação e remoção de produtos proibidos.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase font-black text-[10px]">
                <th className="p-3">Produto / Anúncio</th>
                <th className="p-3">Vendedor</th>
                <th className="p-3">Categoria</th>
                <th className="p-3">Preço</th>
                <th className="p-3">Risco IA</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {products.map(p => (
                <tr key={p.id} className="hover:bg-gray-50/50">
                  <td className="p-3">
                    <div className="font-extrabold text-gray-900">{p.title}</div>
                    <div className="text-[10px] text-gray-400">ID: {p.id}</div>
                  </td>
                  <td className="p-3 font-bold text-gray-800">{p.seller}</td>
                  <td className="p-3 text-gray-600">{p.category}</td>
                  <td className="p-3 font-black text-purple-700">{p.price}</td>
                  <td className="p-3">
                    <span className={`font-bold ${p.risk === 'Crítico' ? 'text-red-600' : 'text-emerald-600'}`}>
                      {p.risk}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      p.status === 'Aprovado' ? 'bg-emerald-100 text-emerald-800' :
                      p.status === 'Suspenso' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {p.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleApprove(p.id)}
                        className="p-1.5 hover:bg-emerald-50 text-emerald-600 rounded-lg"
                        title="Aprovar Anúncio"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleSuspend(p.id)}
                        className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg"
                        title="Suspender Anúncio"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
