import React, { useState } from 'react';
import {
  TrendingUp,
  DollarSign,
  ShoppingBag,
  RotateCcw,
  XCircle,
  Download,
  Filter,
  Globe,
  Store,
  BarChart2,
  PieChart,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { CurrencyCode } from '../../types';
import { formatCurrency } from '../../utils/currencyUtils';

interface SellerSalesAnalyticsProps {
  showToast: (msg: string) => void;
  selectedCurrency?: CurrencyCode;
}

export const SellerSalesAnalytics: React.FC<SellerSalesAnalyticsProps> = ({ showToast, selectedCurrency = 'XOF' }) => {
  const [period, setPeriod] = useState('30d');
  const [selectedCountry, setSelectedCountry] = useState('all');
  const [selectedCurrencyFilter, setSelectedCurrencyFilter] = useState('all');

  const handleExport = (format: 'csv' | 'pdf') => {
    showToast(`Relatório de Desempenho de Vendas exportado com sucesso no formato .${format.toUpperCase()}`);
  };

  const salesByCountry: any[] = [];
  const topProducts: any[] = [];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-emerald-600" />
            Análise Avançada de Desempenho de Vendas
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Métricas consolidadas de receita, margens de lucro estimado, vendas por país e conversão por moeda.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport('csv')}
            className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 border border-gray-300"
          >
            <Download className="w-4 h-4" /> Exportar CSV
          </button>
          <button
            onClick={() => handleExport('pdf')}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shadow-xs"
          >
            <Download className="w-4 h-4" /> Exportar PDF
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 font-bold">
            <Filter className="w-4 h-4 text-emerald-600" /> Filtros:
          </div>

          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="bg-gray-50 border border-gray-300 rounded-lg text-xs font-bold px-3 py-1.5 text-gray-800"
          >
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="90d">Últimos 90 dias</option>
            <option value="year">Ano Atual (2026)</option>
          </select>

          <select
            value={selectedCountry}
            onChange={(e) => setSelectedCountry(e.target.value)}
            className="bg-gray-50 border border-gray-300 rounded-lg text-xs font-bold px-3 py-1.5 text-gray-800"
          >
            <option value="all">Todos os Países de Venda</option>
            <option value="GW">Guiné-Bissau 🇬🇼</option>
            <option value="BR">Brasil 🇧🇷</option>
            <option value="PT">Portugal 🇵🇹</option>
            <option value="AO">Angola 🇦🇴</option>
          </select>
        </div>

        <span className="text-xs text-gray-500 font-medium">Dados atualizados em tempo real</span>
      </div>

      {/* Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-gray-500 text-xs font-bold uppercase">
            <span>Receita Bruta</span>
            <span className="text-gray-600 bg-gray-50 px-2 py-0.5 rounded text-[10px] flex items-center gap-0.5">
              0.0%
            </span>
          </div>
          <p className="text-2xl font-black text-gray-900">{formatCurrency(0, selectedCurrency as CurrencyCode)}</p>
          <p className="text-[10px] text-gray-400">Total acumulado no período</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-gray-500 text-xs font-bold uppercase">
            <span>Receita Líquida</span>
            <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded text-[10px]">Após taxas</span>
          </div>
          <p className="text-2xl font-black text-emerald-700">{formatCurrency(0, selectedCurrency as CurrencyCode)}</p>
          <p className="text-[10px] text-gray-400">Taxas e comissões deduzidas</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-gray-500 text-xs font-bold uppercase">
            <span>Ticket Médio</span>
            <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded text-[10px]">Por pedido</span>
          </div>
          <p className="text-2xl font-black text-gray-900">{formatCurrency(0, selectedCurrency as CurrencyCode)}</p>
          <p className="text-[10px] text-gray-400">0 unidades vendidas</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-gray-500 text-xs font-bold uppercase">
            <span>Lucro Estimado</span>
            <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded text-[10px]">Margem 0%</span>
          </div>
          <p className="text-2xl font-black text-emerald-900">{formatCurrency(0, selectedCurrency as CurrencyCode)}</p>
          <p className="text-[10px] text-gray-400">Lucro operacional líquido</p>
        </div>
      </div>

      {/* Visual Chart & Country Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bar Chart (2 cols) */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-emerald-600" /> Evolução de Vendas Mensais
            </h3>
            <span className="text-xs text-gray-500 font-bold">Volume em {selectedCurrency}</span>
          </div>

          <div className="h-48 flex items-center justify-center border-b border-gray-200 text-gray-400">
            <div className="text-center">
              <BarChart2 className="w-8 h-8 mx-auto mb-2 text-gray-300 stroke-1" />
              <p className="text-xs font-bold">Nenhum dado de vendas registrado para o período selecionado.</p>
            </div>
          </div>
        </div>

        {/* Sales by Country Breakdown (1 col) */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-4">
          <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
            <Globe className="w-5 h-5 text-emerald-600" /> Vendas por País
          </h3>

          <div className="space-y-3">
            {salesByCountry.length === 0 ? (
              <div className="py-12 text-center text-gray-400">
                <Globe className="w-8 h-8 mx-auto mb-2 text-gray-300 stroke-1" />
                <p className="text-xs font-bold">Nenhuma venda por país.</p>
              </div>
            ) : (
              salesByCountry.map((item, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold text-gray-800">
                    <span>{item.flag} {item.country}</span>
                    <span className="text-emerald-700">{item.share}%</span>
                  </div>
                  <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                    <div style={{ width: `${item.share}%` }} className="bg-emerald-600 h-full rounded-full" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Top Products Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
        <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">
          Produtos Mais Vendidos no Período
        </h3>

        <div className="divide-y divide-gray-100">
          {topProducts.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <p className="text-xs font-bold">Nenhum produto vendido no período.</p>
            </div>
          ) : (
            topProducts.map((p, idx) => (
              <div key={idx} className="py-3 flex items-center justify-between text-xs font-bold">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-black text-xs">
                    #{idx + 1}
                  </span>
                  <span className="text-gray-900">{p.title}</span>
                </div>
                <div className="text-right">
                  <p className="text-gray-900 font-black">{p.revenue}</p>
                  <p className="text-[10px] text-gray-400 font-medium">{p.units} unidades vendidas</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
