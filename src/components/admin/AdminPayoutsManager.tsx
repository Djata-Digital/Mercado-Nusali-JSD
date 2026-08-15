import React, { useState } from 'react';
import { ArrowUpRight, CheckCircle, Clock, Search, ShieldAlert } from 'lucide-react';

interface AdminPayoutsManagerProps {
  showToast: (msg: string) => void;
}

export const AdminPayoutsManager: React.FC<AdminPayoutsManagerProps> = ({ showToast }) => {
  const [payouts, setPayouts] = useState([
    { id: 'PAY-101', seller: 'Carlos Biai (Bissau Tech)', amount: '12.400.000 XOF', destination: 'Orange Money (95 520 1010)', country: 'GW', status: 'Concluído', date: '31/07 10:30' },
    { id: 'PAY-102', seller: 'Soluções Agrícolas Lda', amount: '45.000.000 XOF', destination: 'Conta Bancária BAO Bissau', country: 'GW', status: 'Processando', date: '31/07 14:15' },
    { id: 'PAY-103', seller: 'Ana Paula Rocha', amount: 'R$ 18.500,00', destination: 'PIX (Chave CNPJ)', country: 'BR', status: 'Concluído', date: '30/07 16:20' }
  ]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <ArrowUpRight className="w-6 h-6 text-purple-600" />
            Gestão de Repasses & Transferências a Vendedores
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Aprovação e conciliação bancária de saques via Orange Money, PIX, MB WAY e contas bancárias locais.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase font-black text-[10px]">
                <th className="p-3">ID Saque</th>
                <th className="p-3">Vendedor</th>
                <th className="p-3">Valor</th>
                <th className="p-3">Destino Repasse</th>
                <th className="p-3">Data</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payouts.map(p => (
                <tr key={p.id} className="hover:bg-gray-50/50">
                  <td className="p-3 font-extrabold text-gray-900">{p.id}</td>
                  <td className="p-3 font-bold text-gray-800">{p.seller}</td>
                  <td className="p-3 font-black text-emerald-700">{p.amount}</td>
                  <td className="p-3 text-gray-600">{p.destination} ({p.country})</td>
                  <td className="p-3 text-gray-500">{p.date}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      p.status === 'Concluído' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {p.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => showToast(`Comprovante de repasse ${p.id} emitido.`)}
                      className="px-2.5 py-1 bg-purple-50 text-purple-700 font-bold rounded-lg hover:bg-purple-100"
                    >
                      Comprovante
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
