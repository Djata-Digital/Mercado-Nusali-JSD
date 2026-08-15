import React, { useState } from 'react';
import { DollarSign, TrendingUp, Wallet, ArrowDownRight, ArrowUpRight, BarChart3, PieChart, ShieldAlert } from 'lucide-react';
import { mockGlobalOverviewData, mockGmvPeriodChart, mockGmvByCountryChart, mockPaymentMethodsChart } from '../../data/mockAdminOverview';

interface AdminFinanceDashboardProps {
  showToast: (msg: string) => void;
}

export const AdminFinanceDashboard: React.FC<AdminFinanceDashboardProps> = ({ showToast }) => {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-purple-600" />
            Dashboard Financeiro & Consolidação CPLP
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Receita bruta e líquida da plataforma, saldo retido em Escrow, repasses e conciliação de moedas.
          </p>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
          <span className="text-[10px] font-bold text-gray-400 uppercase block">GMV Global Acumulado</span>
          <p className="text-2xl font-black text-gray-900 mt-1">{mockGlobalOverviewData.gmvGlobalFormatted}</p>
          <span className="text-xs font-bold text-emerald-600 flex items-center gap-1 mt-1">
            <TrendingUp className="w-3.5 h-3.5" /> +28% este mês
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
          <span className="text-[10px] font-bold text-gray-400 uppercase block">Receita Bruta Plataforma</span>
          <p className="text-2xl font-black text-purple-700 mt-1">{mockGlobalOverviewData.platformRevenueFormatted}</p>
          <span className="text-[10px] text-gray-500 block mt-1">Comissões sobre vendas</span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
          <span className="text-[10px] font-bold text-gray-400 uppercase block">Saldo Retido em Garantia (Escrow)</span>
          <p className="text-2xl font-black text-amber-600 mt-1">{mockGlobalOverviewData.escrowBalanceFormatted}</p>
          <span className="text-[10px] text-gray-500 block mt-1">Garantia Nusali Proteção</span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
          <span className="text-[10px] font-bold text-gray-400 uppercase block">Total de Repasses a Vendedores</span>
          <p className="text-2xl font-black text-emerald-700 mt-1">{mockGlobalOverviewData.payoutsFormatted}</p>
          <span className="text-[10px] text-gray-500 block mt-1">Transferências efetuadas</span>
        </div>
      </div>

      {/* GMV Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
          <h3 className="font-extrabold text-sm text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-purple-600" /> Distribuição de GMV por País
          </h3>
          <div className="space-y-3">
            {mockGmvByCountryChart.map((c, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-xs font-bold text-gray-800">
                  <span>{c.country}</span>
                  <span>{c.formatted} ({c.value}%)</span>
                </div>
                <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                  <div className="bg-purple-600 h-full rounded-full" style={{ width: `${c.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
          <h3 className="font-extrabold text-sm text-gray-900 flex items-center gap-2">
            <PieChart className="w-4 h-4 text-purple-600" /> Volume por Meio de Pagamento
          </h3>
          <div className="space-y-3">
            {mockPaymentMethodsChart.map((pm, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-xs font-bold text-gray-800">
                  <span>{pm.method}</span>
                  <span>{pm.pct}% do total</span>
                </div>
                <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                  <div className="bg-emerald-600 h-full rounded-full" style={{ width: `${pm.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
