import React, { useState } from 'react';
import { Truck, MapPin, Box, ShieldCheck, CheckCircle2, Clock, Search, AlertTriangle } from 'lucide-react';
import { mockLogisticsShipmentsList, LogisticsShipmentRecord } from '../../data/mockAdminLogistics';

interface AdminLogisticsDashboardProps {
  showToast: (msg: string) => void;
}

export const AdminLogisticsDashboard: React.FC<AdminLogisticsDashboardProps> = ({ showToast }) => {
  const [shipments, setShipments] = useState<LogisticsShipmentRecord[]>(mockLogisticsShipmentsList);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Truck className="w-6 h-6 text-purple-600" />
            Nusali Logística - Operações de Envio CPLP
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Monitoramento das entregas locais, frotas de distribuição e rotas aéreas/marítimas CPLP.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {shipments.map(s => (
          <div key={s.id} className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5 space-y-4 hover:border-purple-300 transition">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-bold text-gray-400 block font-mono">Rastreio: {s.trackingCode}</span>
                <h3 className="font-extrabold text-sm text-gray-900">{s.originCity} ➔ {s.destCity}</h3>
                <p className="text-xs text-purple-700 font-bold">{s.carrierName}</p>
              </div>

              <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${
                s.status === 'entregue' ? 'bg-emerald-100 text-emerald-800' :
                s.status === 'alfandega_destino' ? 'bg-amber-100 text-amber-800' : 'bg-purple-100 text-purple-800'
              }`}>
                {s.status.toUpperCase()}
              </span>
            </div>

            <div className="bg-gray-50 p-3 rounded-xl space-y-1 text-xs border border-gray-100">
              <div className="flex justify-between text-gray-600">
                <span>HUB de Armazenamento:</span>
                <strong className="text-gray-900">{s.warehouseName}</strong>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Remetente ➔ Destinatário:</span>
                <strong className="text-gray-900">{s.senderName} ➔ {s.recipientName}</strong>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Despacho e Previsão:</span>
                <strong className="text-emerald-700">{s.dispatchDate} • Prev: {s.estimatedDeliveryDate}</strong>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between text-xs border-t border-gray-100">
              <span className="text-[10px] text-gray-500 font-bold">Peso: {s.weightFormatted}</span>
              <button
                onClick={() => showToast(`Histórico do código ${s.trackingCode} atualizado.`)}
                className="text-purple-600 hover:text-purple-800 font-extrabold"
              >
                Atualizar Rastreamento
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
