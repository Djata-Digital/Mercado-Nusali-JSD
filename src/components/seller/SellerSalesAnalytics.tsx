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

interface SellerSalesAnalyticsProps {
  showToast: (msg: string) => void;
  selectedCurrency?: CurrencyCode;
}

export const SellerSalesAnalytics: React.FC<SellerSalesAnalyticsProps> = ({ showToast }) => {
  const [period, setPeriod] = useState('30d');
  const [selectedCountry, setSelectedCountry] = useState('all');
  const [selectedCurrencyFilter, setSelectedCurrencyFilter] = useState('all');

  const handleExport = (format: 'csv' | 'pdf') => {
    showToast(`Relatório de Desempenho de Vendas exportado com sucesso no formato .${format.toUpperCase()}`);
  };

  const salesByCountry = [
    { country: 'Guiné-Bissau (GW)', code: 'GW', flag: '🇬🇼', sales: 12500000, currency: 'XOF', share: 45 },
    { country: 'Brasil (BR)', code: 'BR', flag: '🇧🇷', sales: 45000, currency: 'BRL', share: 25 },
    { country: 'Portugal (PT)', code: 'PT', flag: '🇵🇹', sales: 18500, currency: 'EUR', share: 18 },
    { country: 'Angola (AO)', code: 'AO', flag: '🇦🇴', sales: 12000000, currency: 'AOA', share: 12 },
  ];

  const topProducts = [
    { title: 'Inversor Solar Híbrido 5kW 48V Off-Grid Wave', units: 142, revenue: '142.000.000 XOF' },
    { title: 'Castanha de Caju Torrada Sem Sal 1kg - Exportação', units: 890, revenue: '89.000 BRL' },
    { title: 'Pano de Pinte Tradicional Guineense Tecido à Mão', units: 310, revenue: '26.350 EUR' },
  ];

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
            <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded text-[10px] flex items-center gap-0.5">
              <ArrowUpRight className="w-3 h-3" /> +18.4%
            </span>
          </div>
          <p className="text-2xl font-black text-gray-900">R$ 184.250,00</p>
          <p className="text-[10px] text-gray-400">Total acumulado no período</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-gray-500 text-xs font-bold uppercase">
            <span>Receita Líquida</span>
            <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded text-[10px]">Após taxas</span>
          </div>
          <p className="text-2xl font-black text-emerald-700">R$ 162.140,00</p>
          <p className="text-[10px] text-gray-400">Taxas e comissões deduzidas</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-gray-500 text-xs font-bold uppercase">
            <span>Ticket Médio</span>
            <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded text-[10px]">Por pedido</span>
          </div>
          <p className="text-2xl font-black text-gray-900">R$ 340,50</p>
          <p className="text-[10px] text-gray-400">541 unidades vendidas</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-gray-500 text-xs font-bold uppercase">
            <span>Lucro Estimado</span>
            <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded text-[10px]">Margem 32%</span>
          </div>
          <p className="text-2xl font-black text-emerald-900">R$ 58.950,00</p>
          <p className="text-[10px] text-gray-400">Lucro operacional líquido</p>
        </div>
      </div>

      {/* Visual Chart Simulation & Country Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Simulated Bar Chart (2 cols) */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-emerald-600" /> Evolução de Vendas Mensais
            </h3>
            <span className="text-xs text-gray-500 font-bold">Volume em R$</span>
          </div>

          {/* Bar chart bars */}
          <div className="h-48 flex items-end justify-between gap-3 pt-6 px-2 border-b border-gray-200">
            {[
              { month: 'Jan', height: '40%', val: 'R$ 22k' },
              { month: 'Fev', height: '55%', val: 'R$ 31k' },
              { month: 'Mar', height: '45%', val: 'R$ 25k' },
              { month: 'Abr', height: '70%', val: 'R$ 42k' },
              { month: 'Mai', height: '60%', val: 'R$ 38k' },
              { month: 'Jun', height: '85%', val: 'R$ 52k' },
              { month: 'Jul', height: '95%', val: 'R$ 68k' },
            ].map((b, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                <span className="text-[10px] font-bold text-emerald-700 opacity-0 group-hover:opacity-100 transition">
                  {b.val}
                </span>
                <div
                  style={{ height: b.height }}
                  className="w-full bg-gradient-to-t from-emerald-600 to-teal-400 rounded-t-lg group-hover:from-emerald-500 group-hover:to-teal-300 transition shadow-xs"
                />
                <span className="text-[10px] font-bold text-gray-500">{b.month}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Sales by Country Breakdown (1 col) */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-4">
          <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
            <Globe className="w-5 h-5 text-emerald-600" /> Vendas por País
          </h3>

          <div className="space-y-3">
            {salesByCountry.map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex items-center justify-between text-xs font-bold text-gray-800">
                  <span>{item.flag} {item.country}</span>
                  <span className="text-emerald-700">{item.share}%</span>
                </div>
                <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                  <div style={{ width: `${item.share}%` }} className="bg-emerald-600 h-full rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Products Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
        <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">
          Produtos Mais Vendidos no Período
        </h3>

        <div className="divide-y divide-gray-100">
          {topProducts.map((p, idx) => (
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
          ))}
        </div>
      </div>
    </div>
  );
};
