import React, { useState } from 'react';
import { Globe, Users, MapPin, Truck, DollarSign, ShieldAlert, BarChart3, Building2, Store } from 'lucide-react';
import { mockCountriesList } from '../../data/mockCountries';
import { mockRegionsList } from '../../data/mockRegions';

interface CountryOperationsViewProps {
  showToast: (msg: string) => void;
}

export const CountryOperationsView: React.FC<CountryOperationsViewProps> = ({ showToast }) => {
  const [selectedCountryCode, setSelectedCountryCode] = useState('GW'); // Guiné-Bissau by default
  const countryData = mockCountriesList.find(c => c.codeISO === selectedCountryCode) || mockCountriesList[0];
  const countryRegions = mockRegionsList.filter(r => r.countryCode === selectedCountryCode);
  const totalCitiesCount = countryRegions.reduce((acc, r) => acc + (r.cities?.length || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header Selector */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded font-mono uppercase block mb-1">
            Módulo de Operações Nacionais
          </span>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <span className="text-3xl">{countryData.flag}</span> Operações {countryData.name}
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Visão gerencial do Representante Nacional ({countryData.representative}) para supervisão das regiões, pagamentos e expedição.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-500">Alternar País:</span>
          <select
            value={selectedCountryCode}
            onChange={(e) => setSelectedCountryCode(e.target.value)}
            className="p-2 border border-gray-300 rounded-xl text-xs font-extrabold bg-white"
          >
            {mockCountriesList.map(c => (
              <option key={c.codeISO} value={c.codeISO}>
                {c.flag} {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
          <span className="text-[10px] font-bold text-gray-400 uppercase block">Regiões Ativas</span>
          <p className="text-2xl font-black text-gray-900 mt-1">{countryRegions.length} Regiões</p>
          <span className="text-xs text-purple-700 font-bold mt-1 block">{totalCitiesCount} Cidades/Setores</span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
          <span className="text-[10px] font-bold text-gray-400 uppercase block">Moeda Nacional & Taxa</span>
          <p className="text-2xl font-black text-purple-700 mt-1">{countryData.currency} ({countryData.currencySymbol})</p>
          <span className="text-xs text-gray-500 font-bold mt-1 block">Comissão: {countryData.commissionRate}</span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
          <span className="text-[10px] font-bold text-gray-400 uppercase block">HUB Principal</span>
          <p className="text-xl font-black text-gray-900 mt-1">{countryData.mainWarehouse || 'Não Informado'}</p>
          <span className="text-xs text-emerald-700 font-bold mt-1 block">Operação Normal</span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
          <span className="text-[10px] font-bold text-gray-400 uppercase block">Representante Responsável</span>
          <p className="text-lg font-black text-gray-900 mt-1">{countryData.representative}</p>
          <span className="text-xs text-gray-500 font-bold mt-1 block">Selo Nacional Oficial</span>
        </div>
      </div>

      {/* Regions Grid for this Country */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
        <h3 className="font-extrabold text-sm text-gray-900 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-purple-600" /> Regiões Operacionais em {countryData.name} ({countryRegions.length})
        </h3>

        {countryRegions.length === 0 ? (
          <div className="p-12 text-center text-gray-400 space-y-2">
            <MapPin className="w-10 h-10 mx-auto text-gray-300 stroke-1" />
            <p className="font-bold text-sm text-gray-600">Nenhuma região cadastrada para {countryData.name}</p>
            <p className="text-xs text-gray-400 max-w-sm mx-auto">
              Ainda não existem regiões ou setores operacionais cadastrados para este país.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {countryRegions.map(r => (
              <div key={r.id} className="bg-gray-50 p-4 rounded-xl space-y-2 text-xs border border-gray-200">
                <div className="flex justify-between items-start">
                  <span className="font-extrabold text-gray-900 text-sm">{r.name}</span>
                  <span className="text-[10px] font-extrabold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                    {r.status.toUpperCase()}
                  </span>
                </div>
                <div className="text-gray-600">
                  <span>Supervisor: <strong>{r.supervisorName}</strong></span>
                </div>
                <div className="flex justify-between text-gray-700 font-bold pt-2 border-t border-gray-200">
                  <span>{r.activeSellers} Vendedores</span>
                  <span className="text-emerald-700">{r.monthlyOrders} pedidos/mês</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
