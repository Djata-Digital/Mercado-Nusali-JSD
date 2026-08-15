import React, { useState } from 'react';
import { BarChart3, Download, Calendar, Filter } from 'lucide-react';
import { mockGmvPeriodChart } from '../../data/mockAdminOverview';

interface AdminReportsDashboardProps {
  showToast: (msg: string) => void;
}

export const AdminReportsDashboard: React.FC<AdminReportsDashboardProps> = ({ showToast }) => {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-purple-600" />
            Relatórios Avançados, Business Intelligence & Exports
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Geração de relatórios financeiros, curva de crescimento GMV, comissões de representação e exportação em CSV/PDF.
          </p>
        </div>

        <button
          onClick={() => showToast('Relatório executivo consolidado exportado em PDF.')}
          className="bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-md"
        >
          <Download className="w-4 h-4" /> Exportar Relatório Executivo
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
        <h3 className="font-extrabold text-sm text-gray-900">Evolução de GMV Mensal em Milhões XOF</h3>
        <div className="grid grid-cols-7 gap-2 items-end h-48 bg-gray-50 p-4 rounded-xl">
          {mockGmvPeriodChart.map((m, idx) => (
            <div key={idx} className="flex flex-col items-center gap-2 h-full justify-end">
              <span className="text-[10px] font-bold text-purple-700">{m.gmv}M</span>
              <div className="w-full bg-purple-600 rounded-t-lg transition-all" style={{ height: `${(m.gmv / 520) * 100}%` }} />
              <span className="text-xs font-bold text-gray-700">{m.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
