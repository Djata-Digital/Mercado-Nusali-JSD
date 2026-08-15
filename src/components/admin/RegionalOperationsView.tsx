import React, { useState } from 'react';
import { MapPin, Users, Store, Truck, ShoppingBag, Clock, DollarSign, CheckCircle2 } from 'lucide-react';
import { mockRegionsList } from '../../data/mockRegions';

interface RegionalOperationsViewProps {
  showToast: (msg: string) => void;
}

export const RegionalOperationsView: React.FC<RegionalOperationsViewProps> = ({ showToast }) => {
  const [selectedRegionId, setSelectedRegionId] = useState('REG-GW-01'); // Bissau
  const regionData = mockRegionsList.find(r => r.id === selectedRegionId) || mockRegionsList[0];

  return (
    <div className="space-y-6">
      {/* Header Selector */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-mono uppercase block mb-1">
            Módulo de Supervisão Regional
          </span>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <MapPin className="w-6 h-6 text-emerald-600" /> Painel Regional: {regionData.name}
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Supervisão direta do Supervisor Regional <strong>{regionData.supervisorName}</strong> para acompanhamento dos vendedores e rotas da região.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-500">Selecionar Região:</span>
          <select
            value={selectedRegionId}
            onChange={(e) => setSelectedRegionId(e.target.value)}
            className="p-2 border border-gray-300 rounded-xl text-xs font-extrabold bg-white"
          >
            {mockRegionsList.map(r => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.countryCode})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
          <span className="text-[10px] font-bold text-gray-400 uppercase block">Vendedores Locais</span>
          <p className="text-2xl font-black text-gray-900 mt-1">{regionData.activeSellers} Vendedores</p>
          <span className="text-xs text-emerald-700 font-bold mt-1 block">{regionData.activeStores} Lojas cadastradas</span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
          <span className="text-[10px] font-bold text-gray-400 uppercase block">Volume de Pedidos</span>
          <p className="text-2xl font-black text-emerald-700 mt-1">{regionData.monthlyOrders} / mês</p>
          <span className="text-xs text-gray-500 font-bold mt-1 block">Prazo Cobertura: {regionData.deliveryCoverageDays}</span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
          <span className="text-[10px] font-bold text-gray-400 uppercase block">Tarifa Base Frete</span>
          <p className="text-2xl font-black text-emerald-700 mt-1">{regionData.freightBaseRate}</p>
          <span className="text-xs text-gray-500 font-bold mt-1 block">Calculada por zona</span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
          <span className="text-[10px] font-bold text-gray-400 uppercase block">Supervisor Responsável</span>
          <p className="text-lg font-black text-gray-900 mt-1">{regionData.supervisorName}</p>
          <span className="text-[10px] text-gray-400 block mt-1">{regionData.supervisorEmail}</span>
        </div>
      </div>

      {/* Cities list */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
        <h3 className="font-extrabold text-sm text-gray-900">
          Cidades, Bairros e Setores de {regionData.name} ({regionData.cities.length})
        </h3>
        <div className="flex flex-wrap gap-2">
          {regionData.cities.map((city, idx) => (
            <span key={idx} className="bg-emerald-50 text-emerald-900 font-bold px-3 py-1.5 rounded-xl text-xs border border-emerald-100">
              📍 {city}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
