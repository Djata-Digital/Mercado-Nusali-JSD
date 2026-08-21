import React, { useState } from 'react';
import { CreditCard, DollarSign, ShieldAlert, CheckCircle, RefreshCw, Filter, Search } from 'lucide-react';
import { mockAdminPaymentsList, AdminPaymentRecord } from '../../data/mockAdminPayments';

interface AdminPaymentsManagerProps {
  showToast: (msg: string) => void;
}

export const AdminPaymentsManager: React.FC<AdminPaymentsManagerProps> = ({ showToast }) => {
  const [payments, setPayments] = useState<AdminPaymentRecord[]>(mockAdminPaymentsList);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-purple-600" />
            Nusali Pay - Gestão Transacional & Gateways
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Monitoramento das integrações Orange Money, MTN, PIX, Multicaixa, MB WAY e Carteiras Digitais.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase font-black text-[10px]">
                <th className="p-3">Ref Transação / Data</th>
                <th className="p-3">Pedido</th>
                <th className="p-3">Comprador ➔ Vendedor</th>
                <th className="p-3">Gateway / Meio</th>
                <th className="p-3">Valor / Taxa</th>
                <th className="p-3">Risco</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payments.map(p => (
                <tr key={p.id} className="hover:bg-gray-50/50">
                  <td className="p-3 font-extrabold text-gray-900">
                    {p.transactionRef}
                    <span className="block text-[10px] text-gray-400 font-normal">{p.date}</span>
                  </td>
                  <td className="p-3 font-bold text-purple-700">{p.orderId}</td>
                  <td className="p-3 font-bold text-gray-800">{p.buyerName} ➔ {p.sellerName}</td>
                  <td className="p-3 font-bold text-gray-700">{p.method} ({p.country})</td>
                  <td className="p-3 font-black text-emerald-700">
                    {p.amountFormatted}
                    <span className="block text-[10px] text-gray-400 font-normal">Taxa: {p.feeAmountFormatted}</span>
                  </td>
                  <td className="p-3">
                    <span className={`font-bold ${p.riskLevel === 'alto' ? 'text-red-600' : 'text-emerald-600'}`}>
                      {p.riskLevel.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      p.status === 'pago' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {p.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => showToast(`Estorno manual acionado para transação ${p.transactionRef}`)}
                      className="px-2 py-1 bg-red-50 text-red-600 font-bold rounded-lg hover:bg-red-100"
                    >
                      Estornar
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
