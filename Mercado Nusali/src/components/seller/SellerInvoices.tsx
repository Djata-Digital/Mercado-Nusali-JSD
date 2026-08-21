import React, { useState } from 'react';
import {
  FileText,
  Download,
  Printer,
  AlertCircle,
  Search,
  CheckCircle2,
  DollarSign,
  Eye,
  XCircle,
  HelpCircle
} from 'lucide-react';
import { CurrencyCode } from '../../types';

interface SellerInvoicesProps {
  showToast: (msg: string) => void;
  selectedCurrency?: CurrencyCode;
}

export const SellerInvoices: React.FC<SellerInvoicesProps> = ({ showToast }) => {
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);

  const invoices: any[] = [];

  const handleDownloadPdf = (invoiceId: string) => {
    showToast(`Download do PDF simulado da Fatura #${invoiceId} concluído com sucesso.`);
  };

  const handleExportCsv = (invoiceId: string) => {
    showToast(`Detalhamento de comissões da Fatura #${invoiceId} exportado em CSV.`);
  };

  const handlePrint = (invoiceId: string) => {
    showToast(`Enviado para impressão: Fatura #${invoiceId}`);
  };

  const handleDisputeFee = (invoiceId: string) => {
    showToast(`Solicitação de contestação de cobrança enviada para análise da equipe financeira da Fatura #${invoiceId}.`);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-emerald-600" />
            Faturas, Comissões e Taxas do Vendedor
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Detalhamento de comissões de venda, custos logísticos, orçamento de publicidade e tributação internacional.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => showToast('Relatório Anual de Impostos baixado.')}
            className="bg-emerald-600 text-white font-bold text-xs px-4 py-2.5 rounded-xl hover:bg-emerald-700 transition"
          >
            Baixar Informe Fiscal (NIF)
          </button>
        </div>
      </div>

      {/* Invoices List */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <h2 className="text-xs font-black text-gray-900 uppercase tracking-wider">
            Histórico Mensal de Faturas
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-100 text-gray-500 uppercase text-[10px] font-bold">
              <tr>
                <th className="p-3">Número Fatura</th>
                <th className="p-3">Período / Mês</th>
                <th className="p-3">Vencimento</th>
                <th className="p-3">Valor Total</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 font-medium">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-400">
                    Nenhuma fatura de comissões ou mensalidades emitida até o momento.
                  </td>
                </tr>
              ) : (
                invoices.map(inv => (
                <tr key={inv.id} className="hover:bg-gray-50 transition">
                  <td className="p-3 font-bold text-gray-900">{inv.id}</td>
                  <td className="p-3 text-gray-700 font-bold">{inv.month}</td>
                  <td className="p-3 text-gray-500">{inv.dueDate}</td>
                  <td className="p-3 font-black text-gray-900">
                    {inv.currency} {inv.totalAmount.toLocaleString()}
                  </td>
                  <td className="p-3">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                      inv.status === 'Paga' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-amber-100 text-amber-800 border border-amber-200'
                    }`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="p-3 text-right space-x-1">
                    <button
                      onClick={() => setSelectedInvoice(inv)}
                      className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold px-2.5 py-1.5 rounded-lg border border-emerald-200 transition inline-flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" /> Ver Detalhes
                    </button>
                    <button
                      onClick={() => handleDownloadPdf(inv.id)}
                      className="bg-gray-100 text-gray-700 hover:bg-gray-200 font-bold px-2.5 py-1.5 rounded-lg transition inline-flex items-center gap-1"
                      title="Download PDF"
                    >
                      <Download className="w-3.5 h-3.5" /> PDF
                    </button>
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice Details Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6 border border-gray-200 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 pb-4">
              <div>
                <h3 className="text-lg font-black text-gray-900">Detalhamento da Fatura #{selectedInvoice.id}</h3>
                <p className="text-xs text-gray-500">Mês de referência: {selectedInvoice.month}</p>
              </div>
              <button onClick={() => setSelectedInvoice(null)} className="p-1 hover:bg-gray-100 rounded-full">
                <XCircle className="w-6 h-6 text-gray-400" />
              </button>
            </div>

            {/* Fee Breakdown List */}
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-3 text-xs">
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-600 font-medium">Comissão de Vendas Mercado Nusali:</span>
                <span className="font-bold text-gray-900">{selectedInvoice.currency} {selectedInvoice.breakdown.commissions.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-600 font-medium">Serviços de Logística Nusali Fulfillment:</span>
                <span className="font-bold text-gray-900">{selectedInvoice.currency} {selectedInvoice.breakdown.logistics.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-600 font-medium">Anúncios Patrocinados Nusali Ads:</span>
                <span className="font-bold text-gray-900">{selectedInvoice.currency} {selectedInvoice.breakdown.ads.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-600 font-medium">Impostos e Retenções Fiscais:</span>
                <span className="font-bold text-gray-900">{selectedInvoice.currency} {selectedInvoice.breakdown.taxes.toLocaleString()}</span>
              </div>
              <div className="flex justify-between pt-2 text-sm font-black text-emerald-950">
                <span>Valor Total da Fatura:</span>
                <span>{selectedInvoice.currency} {selectedInvoice.totalAmount.toLocaleString()}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 flex flex-wrap gap-2 justify-end">
              <button
                onClick={() => handleExportCsv(selectedInvoice.id)}
                className="bg-gray-100 text-gray-800 font-bold text-xs px-3 py-2 rounded-lg hover:bg-gray-200 flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
              <button
                onClick={() => handlePrint(selectedInvoice.id)}
                className="bg-gray-100 text-gray-800 font-bold text-xs px-3 py-2 rounded-lg hover:bg-gray-200 flex items-center gap-1"
              >
                <Printer className="w-3.5 h-3.5" /> Imprimir
              </button>
              <button
                onClick={() => handleDisputeFee(selectedInvoice.id)}
                className="bg-red-50 text-red-700 font-bold text-xs px-3 py-2 rounded-lg hover:bg-red-100 border border-red-200 flex items-center gap-1"
              >
                <AlertCircle className="w-3.5 h-3.5" /> Contestação de Taxa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
