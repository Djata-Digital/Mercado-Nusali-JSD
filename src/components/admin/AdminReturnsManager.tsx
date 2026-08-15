import React, { useState } from 'react';
import { RotateCcw, Truck, CheckCircle2, Search } from 'lucide-react';

interface AdminReturnsManagerProps {
  showToast: (msg: string) => void;
}

export const AdminReturnsManager: React.FC<AdminReturnsManagerProps> = ({ showToast }) => {
  const returns = [
    { id: 'RET-001', orderId: 'ORD-8810', buyer: 'Bacai Sanhá', seller: 'Moda Afro CPLP', tracking: 'RET-GW-901', status: 'Em Trânsito para HUB Bandim', date: '30/07 14:00' }
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <RotateCcw className="w-6 h-6 text-purple-600" />
            Gestão de Logística Reversa & Devoluções
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Acompanhamento das devoluções de pacotes aos HUBs centrais da Nusali Logística.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase font-black text-[10px]">
                <th className="p-3">ID Devolução</th>
                <th className="p-3">Pedido</th>
                <th className="p-3">Comprador ➔ Vendedor</th>
                <th className="p-3">Código Reverso</th>
                <th className="p-3">Status Logístico</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {returns.map(r => (
                <tr key={r.id} className="hover:bg-gray-50/50">
                  <td className="p-3 font-extrabold text-gray-900">{r.id}</td>
                  <td className="p-3 font-bold text-purple-700">{r.orderId}</td>
                  <td className="p-3 font-bold text-gray-800">{r.buyer} ➔ {r.seller}</td>
                  <td className="p-3 font-mono text-gray-700">{r.tracking}</td>
                  <td className="p-3 font-bold text-amber-700">{r.status}</td>
                  <td className="p-3 text-right">
                    <button onClick={() => showToast(`Vistoria do produto da devolução ${r.id} aprovada.`)} className="px-2 py-1 bg-emerald-50 text-emerald-700 font-bold rounded-lg">
                      Conferir no HUB
                    </button>
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
