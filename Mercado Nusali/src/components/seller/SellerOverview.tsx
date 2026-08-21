import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  DollarSign,
  Lock,
  Wallet,
  ShoppingBag,
  Package,
  AlertTriangle,
  RotateCcw,
  Star,
  Users,
  Eye,
  MessageSquare,
  HelpCircle,
  Calendar,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  BadgeCheck,
  Building2,
  Globe,
  Filter,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { CurrencyCode } from '../../types';
import { formatCurrency } from '../../utils/currencyUtils';
import { SellerService } from '../../services/sellerService';

interface SellerOverviewProps {
  selectedCurrency: CurrencyCode;
  selectedStoreName: string;
  onNavigateSection: (section: any) => void;
}

export const SellerOverview: React.FC<SellerOverviewProps> = ({
  selectedCurrency,
  selectedStoreName,
  onNavigateSection,
}) => {
  const [period, setPeriod] = useState<'today' | '7days' | '30days' | '90days'>('30days');
  const [loading, setLoading] = useState(true);
  const [overviewData, setOverviewData] = useState<any>(null);
  const [analyticsData, setAnalyticsData] = useState<any>(null);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      const [resOverview, resAnalytics] = await Promise.all([
        SellerService.getOverview(),
        SellerService.getAnalytics(period),
      ]);

      if (resOverview.success && resOverview.data) {
        setOverviewData(resOverview.data);
      }
      if (resAnalytics.success && resAnalytics.data) {
        setAnalyticsData(resAnalytics.data);
      }
    } catch (err) {
      console.error('Error fetching seller overview:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, [period]);

  const grossRevenue = analyticsData?.grossRevenue ?? overviewData?.metrics?.grossRevenue ?? 0;
  const netRevenue = analyticsData?.netRevenue ?? overviewData?.metrics?.netRevenue ?? 0;
  const availableBalance = overviewData?.balances?.available ?? 0;
  const escrowBalance = overviewData?.balances?.retained ?? 0;
  const pendingRelease = overviewData?.balances?.future ?? 0;

  const salesHistory = overviewData?.salesHistory || [];

  const countryOrders = overviewData?.countryOrders || [];

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Top Header & Period Selector */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-gray-900">Visão Geral da Operação</h1>
            <span className="bg-emerald-100 text-emerald-800 text-xs font-black px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-emerald-300">
              <BadgeCheck className="w-3.5 h-3.5 text-emerald-700" /> VENDEDOR PLATINUM
            </span>
            {loading && <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Acompanhe suas vendas locais e internacionais na loja <span className="font-bold text-gray-900">{selectedStoreName}</span>.
          </p>
        </div>

        {/* Period Selector Buttons & Refresh */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            onClick={fetchOverview}
            disabled={loading}
            className="p-2 text-gray-500 hover:text-emerald-600 bg-gray-100 rounded-xl transition"
            title="Atualizar dados"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-xl border border-gray-200 text-xs font-bold w-full md:w-auto overflow-x-auto">
            {(['today', '7days', '30days', '90days'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-2 rounded-lg transition whitespace-nowrap ${
                  period === p ? 'bg-emerald-600 text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {p === 'today' ? 'Hoje' : p === '7days' ? '7 dias' : p === '30days' ? '30 dias' : '90 dias'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Primary Financial & Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => onNavigateSection('sales')}
          className="bg-gradient-to-br from-emerald-900 to-teal-950 text-white p-6 rounded-2xl shadow-md cursor-pointer hover:scale-[1.01] transition"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-emerald-200 uppercase">Receita Bruta</span>
            <div className="p-2 bg-white/10 rounded-xl text-yellow-300">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <h2 className="text-2xl font-black text-white">{formatCurrency(grossRevenue, selectedCurrency)}</h2>
          <span className="text-[11px] text-emerald-300 mt-2 block font-semibold flex items-center gap-1">
            <ArrowUpRight className="w-3.5 h-3.5 text-yellow-300" /> Receita Líquida: {formatCurrency(netRevenue, selectedCurrency)}
          </span>
        </div>

        <div
          onClick={() => onNavigateSection('financial')}
          className="bg-white p-6 rounded-2xl border border-gray-200 shadow-2xs hover:border-emerald-500 transition cursor-pointer"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-gray-500 uppercase">Saldo Disponível</span>
            <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <h2 className="text-2xl font-black text-emerald-700">{formatCurrency(availableBalance, selectedCurrency)}</h2>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNavigateSection('payouts');
            }}
            className="mt-2 text-xs font-bold text-emerald-800 hover:underline flex items-center gap-1"
          >
            Solicitar Saque Instantâneo <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div
          onClick={() => onNavigateSection('financial')}
          className="bg-white p-6 rounded-2xl border border-gray-200 shadow-2xs hover:border-emerald-500 transition cursor-pointer"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-gray-500 uppercase">Retido em Escrow</span>
            <div className="p-2 bg-blue-50 text-blue-700 rounded-xl">
              <Lock className="w-5 h-5" />
            </div>
          </div>
          <h2 className="text-2xl font-black text-blue-900">{formatCurrency(escrowBalance, selectedCurrency)}</h2>
          <span className="text-[11px] text-gray-500 mt-2 block font-semibold">
            Proteção garantida até a entrega do pedido
          </span>
        </div>

        <div
          onClick={() => onNavigateSection('orders')}
          className="bg-white p-6 rounded-2xl border border-gray-200 shadow-2xs hover:border-emerald-500 transition cursor-pointer"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-gray-500 uppercase">Aguardando Liberação</span>
            <div className="p-2 bg-amber-50 text-amber-700 rounded-xl">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <h2 className="text-2xl font-black text-amber-700">{formatCurrency(pendingRelease, selectedCurrency)}</h2>
          <span className="text-[11px] text-gray-500 mt-2 block font-semibold">
            Liberação prevista em 24h a 48h
          </span>
        </div>
      </div>

      {/* Orders Status Grid */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs">
        <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-4">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-emerald-700" /> Status Operacional de Pedidos
          </h2>
          <button
            onClick={() => onNavigateSection('orders')}
            className="text-xs font-bold text-emerald-700 hover:underline flex items-center gap-1"
          >
            Ver Todos os Pedidos <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-center">
          <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
            <span className="text-lg font-black text-gray-900 block">{overviewData?.metrics?.pendingOrders ?? 0}</span>
            <span className="text-[11px] font-bold text-amber-600 block">Pendentes</span>
          </div>
          <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
            <span className="text-lg font-black text-gray-900 block">{overviewData?.metrics?.paidOrders ?? 0}</span>
            <span className="text-[11px] font-bold text-emerald-600 block">Pagos</span>
          </div>
          <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
            <span className="text-lg font-black text-gray-900 block">{overviewData?.metrics?.preparingOrders ?? 0}</span>
            <span className="text-[11px] font-bold text-blue-600 block">Preparação</span>
          </div>
          <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
            <span className="text-lg font-black text-gray-900 block">{overviewData?.metrics?.shippedOrders ?? 0}</span>
            <span className="text-[11px] font-bold text-purple-600 block">Enviados</span>
          </div>
          <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
            <span className="text-lg font-black text-gray-900 block">{overviewData?.metrics?.deliveredOrders ?? 0}</span>
            <span className="text-[11px] font-bold text-teal-600 block">Entregues</span>
          </div>
          <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
            <span className="text-lg font-black text-gray-900 block">{overviewData?.metrics?.returnOrders ?? 0}</span>
            <span className="text-[11px] font-bold text-red-600 block">Devoluções</span>
          </div>
          <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
            <span className="text-lg font-black text-gray-900 block">{overviewData?.metrics?.disputeOrders ?? 0}</span>
            <span className="text-[11px] font-bold text-red-700 block">Disputas</span>
          </div>
        </div>
      </div>

      {/* Recharts Analytics Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Sales Trend Bar Chart */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs">
          <h3 className="font-bold text-sm text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-700" /> Desempenho de Vendas por Período
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesHistory}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(val: any) => [formatCurrency(val, selectedCurrency), 'Receita']}
                />
                <Area type="monotone" dataKey="receita" stroke="#059669" fill="#059669" fillOpacity={0.15} strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Currency & International Orders Chart */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs">
          <h3 className="font-bold text-sm text-gray-900 mb-4 flex items-center gap-2">
            <Globe className="w-4 h-4 text-blue-700" /> Vendas por País do Comprador
          </h3>
          <div className="space-y-4">
            {countryOrders.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <Globe className="w-8 h-8 mx-auto mb-2 text-gray-300 stroke-1" />
                <p className="font-bold text-xs text-gray-500">Nenhum pedido internacional ou local registrado.</p>
              </div>
            ) : (
              countryOrders.map((co: any, idx: number) => (
                <div key={idx} className="p-3 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between text-xs font-bold">
                  <span className="text-gray-900">{co.country}</span>
                  <div className="text-right">
                    <span className="text-gray-900 block">{co.valor}</span>
                    <span className="text-[10px] text-gray-500 font-mono">{co.pedidos} pedidos</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Secondary Metrics & Conversion Indicators */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs">
          <span className="text-[10px] font-bold text-gray-400 block uppercase">Avaliação Média</span>
          <span className="text-xl font-black text-amber-500 flex items-center gap-1 mt-1">
            {overviewData?.metrics?.averageRating ? overviewData.metrics.averageRating : '0.0'} <Star className="w-4 h-4 fill-amber-500" />
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs">
          <span className="text-[10px] font-bold text-gray-400 block uppercase">Produtos Ativos</span>
          <span className="text-xl font-black text-gray-900 mt-1 block">
            {overviewData?.metrics?.totalProducts ?? 0}
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs">
          <span className="text-[10px] font-bold text-gray-400 block uppercase">Taxa de Conversão</span>
          <span className="text-xl font-black text-emerald-700 mt-1 block">
            {analyticsData?.conversionRate ? `${analyticsData.conversionRate}%` : '0.0%'}
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs">
          <span className="text-[10px] font-bold text-gray-400 block uppercase">Visitas Únicas</span>
          <span className="text-xl font-black text-gray-900 mt-1 block">
            {analyticsData?.viewsCount ? analyticsData.viewsCount.toLocaleString() : '0'}
          </span>
        </div>

        <div
          onClick={() => onNavigateSection('questions')}
          className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs cursor-pointer hover:border-emerald-500"
        >
          <span className="text-[10px] font-bold text-gray-400 block uppercase">Perguntas Pendentes</span>
          <span className="text-xl font-black text-amber-600 mt-1 block">
            {overviewData?.metrics?.pendingQuestions ?? 0}
          </span>
        </div>

        <div
          onClick={() => onNavigateSection('messages')}
          className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs cursor-pointer hover:border-emerald-500"
        >
          <span className="text-[10px] font-bold text-gray-400 block uppercase">Mensagens SAC</span>
          <span className="text-xl font-black text-blue-600 mt-1 block">
            {overviewData?.metrics?.unreadMessages ?? 0}
          </span>
        </div>
      </div>
    </div>
  );
};
