import React, { useState } from 'react';
import {
  Boxes,
  Warehouse,
  PlusCircle,
  ArrowRightLeft,
  History,
  CheckCircle2,
  AlertTriangle,
  Globe,
  MapPin,
  TrendingUp,
  FileSpreadsheet,
} from 'lucide-react';
import { SellerWarehouseStock } from '../../data/mockSellerData';
import { CountryCode } from '../../types';
import { countriesConfig } from '../../utils/currencyUtils';

interface SellerStockManagerProps {
  warehouses: SellerWarehouseStock[];
  showToast: (msg: string) => void;
}

export const SellerStockManager: React.FC<SellerStockManagerProps> = ({ warehouses, showToast }) => {
  const [selectedHub, setSelectedHub] = useState<string>('all');

  const stockLogs = [
    { date: 'Hoje 11:30', type: 'Entrada Fulfill', sku: 'SAM-A55-256GB', qty: '+50 un.', hub: 'HUB Central Bissau', status: 'Concluído' },
    { date: 'Hoje 10:15', type: 'Venda Escrow', sku: 'SAM-A55-256GB', qty: '-1 un.', hub: 'HUB Central Bissau', status: 'Reservado' },
    { date: 'Ontem 17:00', type: 'Transferência Aérea', sku: 'CAJU-GW-1KG', qty: '-100 un.', hub: 'HUB Lisboa Transit', status: 'Em Trânsito' },
    { date: '28/07 14:00', type: 'Ajuste de Inventário', sku: 'ANKER-65W', qty: '+15 un.', hub: 'HUB São Paulo', status: 'Aprovado' },
  ];

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Top Header */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <Boxes className="w-6 h-6 text-emerald-700" /> Estoque & Armazéns Logísticos (Nusali HUBs)
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Controle a distribuição de mercadorias armazenadas nos HUBs de Bissau, Lisboa e São Paulo.
          </p>
        </div>

        <button
          onClick={() => showToast('Simulando envio de inventário para o HUB Bissau...')}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition flex items-center gap-2 shadow-xs shrink-0"
        >
          <PlusCircle className="w-4 h-4" /> Enviar Inventário para o HUB
        </button>
      </div>

      {/* Warehouses Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {warehouses.map((wh) => {
          const countryConf = countriesConfig[wh.country] || countriesConfig.GW;

          return (
            <div key={wh.id} className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-mono text-gray-400 block">{wh.warehouseCode}</span>
                  <h3 className="font-bold text-sm text-gray-900">{wh.warehouseName}</h3>
                </div>
                <span className="text-xl">{countryConf.flag}</span>
              </div>

              {/* Units breakdown */}
              <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 p-3 rounded-xl border border-gray-100 font-medium">
                <div>
                  <span className="text-gray-400 text-[10px] block">Unidades Disponíveis</span>
                  <span className="font-black text-emerald-700 text-sm">{wh.availableUnits} un.</span>
                </div>
                <div>
                  <span className="text-gray-400 text-[10px] block">Reservadas (Vendas)</span>
                  <span className="font-black text-blue-900 text-sm">{wh.reservedUnits} un.</span>
                </div>
                <div>
                  <span className="text-gray-400 text-[10px] block">Em Trânsito Aéreo</span>
                  <span className="font-black text-amber-700 text-sm">{wh.inTransitUnits} un.</span>
                </div>
                <div>
                  <span className="text-gray-400 text-[10px] block">Total Armazenado</span>
                  <span className="font-black text-gray-900 text-sm">{wh.totalUnits} un.</span>
                </div>
              </div>

              {/* Capacity Progress Bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-bold text-gray-500">
                  <span>Ocupação do Armazém</span>
                  <span>{wh.capacityPercentage}% Capacidade</span>
                </div>
                <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-600 h-full rounded-full transition-all"
                    style={{ width: `${wh.capacityPercentage}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Movement Logs History Table */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <History className="w-4 h-4 text-emerald-700" /> Histórico de Movimentações de Estoque
          </h2>
          <button
            onClick={() => showToast('Relatório de inventário baixado em CSV/Excel.')}
            className="text-xs font-bold text-emerald-700 hover:underline flex items-center gap-1"
          >
            <FileSpreadsheet className="w-4 h-4" /> Exportar Inventário
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase tracking-wider">
                <th className="p-3">Data/Hora</th>
                <th className="p-3">Tipo de Movimento</th>
                <th className="p-3">SKU do Produto</th>
                <th className="p-3">Quantidade</th>
                <th className="p-3">HUB Logístico</th>
                <th className="p-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium">
              {stockLogs.map((log, idx) => (
                <tr key={idx} className="hover:bg-gray-50/50">
                  <td className="p-3 font-mono text-gray-500">{log.date}</td>
                  <td className="p-3 font-bold text-gray-900">{log.type}</td>
                  <td className="p-3 font-mono text-gray-700">{log.sku}</td>
                  <td className="p-3 font-black text-gray-900">{log.qty}</td>
                  <td className="p-3 text-gray-700">{log.hub}</td>
                  <td className="p-3 text-right">
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      {log.status}
                    </span>
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
