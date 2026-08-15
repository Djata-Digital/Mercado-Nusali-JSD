import React, { useState } from 'react';
import { BarChart3, Download, FileSpreadsheet, FileText, Calendar, CheckCircle2 } from 'lucide-react';

interface SellerReportsProps {
  showToast: (msg: string) => void;
}

export const SellerReports: React.FC<SellerReportsProps> = ({ showToast }) => {
  const [reportPeriod, setReportPeriod] = useState('mês_atual');

  const handleExport = (format: 'pdf' | 'csv' | 'excel', type: string) => {
    showToast(`Relatório de ${type} baixado com sucesso em .${format.toUpperCase()}!`);
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-emerald-700" /> Relatórios & Exportação
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Gere e baixe dados consolidados de vendas, comissões, faturamento fiscal e desempenho do estoque.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-2xs space-y-4 text-xs">
          <h2 className="font-bold text-sm text-gray-900 flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" /> Relatório Consolidado de Vendas & Comissões
          </h2>
          <p className="text-gray-500">Inclui lista de pedidos, taxas cobradas pelo marketplace e saldo líquido repassado em Escrow.</p>

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={() => handleExport('excel', 'Vendas')}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Baixar Excel (.xlsx)
            </button>
            <button
              onClick={() => handleExport('pdf', 'Vendas')}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5" /> Baixar PDF
            </button>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-2xs space-y-4 text-xs">
          <h2 className="font-bold text-sm text-gray-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-700" /> Relatório para Declaração Fiscal & NIF
          </h2>
          <p className="text-gray-500">Sumário anual e mensal de notas emitidas e faturamento transfronteiriço para contabilidade.</p>

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={() => handleExport('pdf', 'Fiscal')}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Baixar PDF Contábil
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
