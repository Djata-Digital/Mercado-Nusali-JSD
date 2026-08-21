import React, { useState } from 'react';
import { ArrowDownRight, RefreshCw, CheckCircle2, Search } from 'lucide-react';

interface AdminRefundsManagerProps {
  showToast: (msg: string) => void;
}

export const AdminRefundsManager: React.FC<AdminRefundsManagerProps> = ({ showToast }) => {
  const [refunds, setRefunds] = useState<any[]>([]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <ArrowDownRight className="w-6 h-6 text-purple-600" />
            Gestão de Reembolsos & Devoluções de Saldo
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Estornos automáticos e manuais direto na conta do comprador via Orange Money, PIX ou Carteira Nusali.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
        {refunds.length === 0 ? (
          <div className="p-12 text-center text-gray-400 space-y-2">
            <ArrowDownRight className="w-10 h-10 mx-auto text-gray-300 stroke-1" />
            <p className="font-bold text-sm text-gray-600">Nenhum reembolso ou estorno registrado</p>
            <p className="text-xs text-gray-400 max-w-sm mx-auto">
              Não existem devoluções de saldo ativas ou estornos processados na plataforma até o momento.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase font-black text-[10px]">
                  <th className="p-3">ID Reembolso</th>
                  <th className="p-3">Pedido</th>
                  <th className="p-3">Comprador</th>
                  <th className="p-3">Valor</th>
                  <th className="p-3">Motivo</th>
                  <th className="p-3">Método</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {refunds.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50/50">
                    <td className="p-3 font-extrabold text-gray-900">{r.id}</td>
                    <td className="p-3 font-bold text-purple-700">{r.orderId}</td>
                    <td className="p-3 font-bold text-gray-800">{r.buyer}</td>
                    <td className="p-3 font-black text-red-600">{r.amount}</td>
                    <td className="p-3 text-gray-600">{r.reason}</td>
                    <td className="p-3 text-gray-700 font-bold">{r.method}</td>
                    <td className="p-3">
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                        {r.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
