import React, { useEffect, useState } from 'react';
import {
  TrendingUp,
  Download,
  Filter,
  Globe,
  BarChart2,
  Loader2,
} from 'lucide-react';
import { CurrencyCode } from '../../types';
import { formatCurrency } from '../../utils/currencyUtils';
import { SellerService } from '../../services/sellerService';

interface SellerSalesAnalyticsProps {
  showToast: (msg: string) => void;
  selectedCurrency?: CurrencyCode;
}

// Mapa período (UI, valores curtos) -> período aceito pelo backend
// (GET /seller/analytics). O backend não suporta "ano atual" hoje — não
// inventamos esse recorte no cliente, mantemos só os períodos reais.
const PERIOD_TO_API: Record<string, string> = {
  '7d': '7days',
  '30d': '30days',
  '90d': '90days',
};

const COUNTRY_FLAGS: Record<string, string> = {
  GW: '🇬🇼', BR: '🇧🇷', PT: '🇵🇹', AO: '🇦🇴', CV: '🇨🇻', MZ: '🇲🇿', ST: '🇸🇹', TL: '🇹🇱', GQ: '🇬🇶',
};

interface AnalyticsData {
  grossRevenue: number;
  netRevenue: number;
  totalOrders: number;
  unitsSold: number;
  averageTicket: number;
  financialDataComplete: boolean;
  missingSellerNetAmountCount: number;
  salesHistory: { date: string; grossRevenue: number; orders: number }[];
  salesByCountry: { country: string; grossRevenue: number; orders: number }[];
  topProducts: { productId: string; productTitle: string; unitsSold: number; grossRevenue: number }[];
}

const EMPTY_DATA: AnalyticsData = {
  grossRevenue: 0,
  netRevenue: 0,
  totalOrders: 0,
  unitsSold: 0,
  averageTicket: 0,
  financialDataComplete: true,
  missingSellerNetAmountCount: 0,
  salesHistory: [],
  salesByCountry: [],
  topProducts: [],
};

export const SellerSalesAnalytics: React.FC<SellerSalesAnalyticsProps> = ({ showToast, selectedCurrency = 'XOF' }) => {
  const [period, setPeriod] = useState('30d');
  const [data, setData] = useState<AnalyticsData>(EMPTY_DATA);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchAnalytics = async () => {
      setIsLoading(true);
      try {
        const apiPeriod = PERIOD_TO_API[period] || '30days';
        const res = await SellerService.getAnalytics(apiPeriod, selectedCurrency);
        if (!cancelled && res.success && res.data) {
          setData({ ...EMPTY_DATA, ...res.data });
        }
      } catch (err) {
        console.error('Error fetching seller analytics:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    fetchAnalytics();
    return () => { cancelled = true; };
  }, [period, selectedCurrency]);

  const handleExport = (format: 'csv' | 'pdf') => {
    showToast(`Exportação em .${format.toUpperCase()} ainda não está disponível.`);
  };

  const maxHistoryRevenue = Math.max(1, ...data.salesHistory.map((h) => h.grossRevenue));
  const maxCountryRevenue = Math.max(1, ...data.salesByCountry.map((c) => c.grossRevenue));

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-emerald-600" />
            Desempenho de Vendas
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Métricas reais de receita, repasse líquido, vendas por país e produtos mais vendidos.
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
          </select>
        </div>

        <span className="text-xs text-gray-500 font-medium">
          {isLoading ? 'Atualizando...' : `Moeda: ${selectedCurrency}`}
        </span>
      </div>

      {!data.financialDataComplete && (
        <div className="bg-amber-50 border border-amber-300 text-amber-800 text-xs font-semibold rounded-xl p-3">
          ⚠ {data.missingSellerNetAmountCount} pedido(s) pago(s) no período têm repasse líquido ainda não calculado
          e foram excluídos do total de Repasse Líquido abaixo para não subestimar nem inventar o valor.
        </div>
      )}

      {/* Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-gray-500 text-xs font-bold uppercase">
            <span>Receita Bruta</span>
          </div>
          <p className="text-2xl font-black text-gray-900">{formatCurrency(data.grossRevenue, selectedCurrency as CurrencyCode)}</p>
          <p className="text-[10px] text-gray-400">Total acumulado no período · {data.totalOrders} pedido(s)</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-gray-500 text-xs font-bold uppercase">
            <span>Repasse Líquido</span>
            <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded text-[10px]">Após comissão</span>
          </div>
          <p className="text-2xl font-black text-emerald-700">{formatCurrency(data.netRevenue, selectedCurrency as CurrencyCode)}</p>
          <p className="text-[10px] text-gray-400">Valor a receber deduzida a comissão Nusali</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-gray-500 text-xs font-bold uppercase">
            <span>Ticket Médio</span>
            <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded text-[10px]">Por pedido</span>
          </div>
          <p className="text-2xl font-black text-gray-900">{formatCurrency(data.averageTicket, selectedCurrency as CurrencyCode)}</p>
          <p className="text-[10px] text-gray-400">{data.unitsSold} unidade(s) vendida(s)</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-gray-500 text-xs font-bold uppercase">
            <span>Pedidos Pagos</span>
          </div>
          <p className="text-2xl font-black text-gray-900">{data.totalOrders}</p>
          <p className="text-[10px] text-gray-400">No período selecionado</p>
        </div>
      </div>

      {/* Visual Chart & Country Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bar Chart (2 cols) */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-emerald-600" /> Evolução de Vendas
            </h3>
            <span className="text-xs text-gray-500 font-bold">Volume em {selectedCurrency}</span>
          </div>

          {isLoading ? (
            <div className="h-48 flex items-center justify-center text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : data.salesHistory.length === 0 ? (
            <div className="h-48 flex items-center justify-center border-b border-gray-200 text-gray-400">
              <div className="text-center">
                <BarChart2 className="w-8 h-8 mx-auto mb-2 text-gray-300 stroke-1" />
                <p className="text-xs font-bold">Nenhum dado de vendas registrado para o período selecionado.</p>
              </div>
            </div>
          ) : (
            <div className="h-48 flex items-end gap-1.5 overflow-x-auto">
              {data.salesHistory.map((h) => (
                <div key={h.date} className="flex flex-col items-center justify-end h-full min-w-[28px]" title={`${h.date}: ${formatCurrency(h.grossRevenue, selectedCurrency as CurrencyCode)} (${h.orders} pedido(s))`}>
                  <div
                    className="w-4 bg-emerald-500 rounded-t-sm"
                    style={{ height: `${Math.max(4, (h.grossRevenue / maxHistoryRevenue) * 160)}px` }}
                  />
                  <span className="text-[8px] text-gray-400 mt-1 rotate-0">{h.date.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sales by Country Breakdown (1 col) */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-4">
          <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2">
            <Globe className="w-5 h-5 text-emerald-600" /> Vendas por País
          </h3>

          <div className="space-y-3">
            {data.salesByCountry.length === 0 ? (
              <div className="py-12 text-center text-gray-400">
                <Globe className="w-8 h-8 mx-auto mb-2 text-gray-300 stroke-1" />
                <p className="text-xs font-bold">Nenhuma venda por país.</p>
              </div>
            ) : (
              data.salesByCountry.map((item) => (
                <div key={item.country} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold text-gray-800">
                    <span>{COUNTRY_FLAGS[item.country] || '🌍'} {item.country}</span>
                    <span className="text-emerald-700">{formatCurrency(item.grossRevenue, selectedCurrency as CurrencyCode)}</span>
                  </div>
                  <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                    <div style={{ width: `${(item.grossRevenue / maxCountryRevenue) * 100}%` }} className="bg-emerald-600 h-full rounded-full" />
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
          {data.topProducts.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <p className="text-xs font-bold">Nenhum produto vendido no período.</p>
            </div>
          ) : (
            data.topProducts.map((p, idx) => (
              <div key={p.productId} className="py-3 flex items-center justify-between text-xs font-bold">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-black text-xs">
                    #{idx + 1}
                  </span>
                  <span className="text-gray-900">{p.productTitle}</span>
                </div>
                <div className="text-right">
                  <p className="text-gray-900 font-black">{formatCurrency(p.grossRevenue, selectedCurrency as CurrencyCode)}</p>
                  <p className="text-[10px] text-gray-400 font-medium">{p.unitsSold} unidades vendidas</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
