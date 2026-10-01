import React, { useEffect, useState } from 'react';
import { RotateCcw, CheckCircle2, RefreshCw, Search } from 'lucide-react';
import { AdminService } from '../../services/adminService';
import { formatCurrency } from '../../utils/currencyUtils';

interface AdminReturnsManagerProps {
  showToast: (msg: string) => void;
}

// FASE D18-C3.7E — conecta o painel (antes 100% mock: useState([]) nunca
// preenchido, botão "Conferir no HUB" que só chamava showToast) à API real.
// A única AÇÃO exposta aqui é o reembolso administrativo de uma devolução já
// received_inspected — reaproveitando POST /admin/returns/:id/refund
// (processRefund() existente, nenhuma lógica financeira nova). Nenhum
// redesign do painel: mesma estrutura de tabela já existente.
const STATUS_LABEL: Record<string, string> = {
  pending_approval: 'Aguardando vendedor',
  approved: 'Aprovada pelo vendedor',
  label_generated: 'Etiqueta gerada',
  item_shipped: 'Enviada pelo comprador',
  received_inspected: 'Recebida e inspecionada',
  refunded: 'Reembolsada',
  rejected: 'Rejeitada',
};

export const AdminReturnsManager: React.FC<AdminReturnsManagerProps> = ({ showToast }) => {
  const [returnsList, setReturnsList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [refundingId, setRefundingId] = useState<string | null>(null);

  const fetchReturns = async () => {
    setIsLoading(true);
    try {
      const res = await AdminService.getReturns();
      if (res.success && Array.isArray(res.data)) {
        setReturnsList(res.data);
      }
    } catch {
      showToast('Não foi possível carregar as devoluções agora.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReturns();
  }, []);

  const handleRefund = async (id: string) => {
    setRefundingId(id);
    try {
      const res = await AdminService.refundReturn(id);
      if (res.success) {
        showToast(res.data?.data?.alreadyProcessed ? 'Este reembolso já havia sido processado.' : 'Reembolso processado com sucesso.');
        fetchReturns();
      } else {
        showToast(res.error?.message || res.message || 'Não foi possível processar o reembolso.');
      }
    } catch (err: any) {
      const backendMessage = err?.response?.data?.error?.message || err?.response?.data?.message;
      showToast(backendMessage || 'Não foi possível comunicar com o servidor agora.');
    } finally {
      setRefundingId(null);
    }
  };

  const filtered = returnsList.filter((r) => {
    const term = searchTerm.toLowerCase();
    return (
      r.id.toLowerCase().includes(term) ||
      (r.buyerName || '').toLowerCase().includes(term) ||
      (r.orderNumber || '').toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <RotateCcw className="w-6 h-6 text-purple-600" />
            Devoluções
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Acompanhe as devoluções de todos os vendedores. O reembolso só pode ser processado depois que o vendedor confirmar recebimento e inspeção do produto.
          </p>
        </div>
        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por comprador, pedido..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-purple-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
        {isLoading ? (
          <div className="p-12 text-center text-gray-400 font-bold">Carregando devoluções...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400 space-y-2">
            <RotateCcw className="w-10 h-10 mx-auto text-gray-300 stroke-1" />
            <p className="font-bold text-sm text-gray-600">Nenhuma devolução encontrada</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase font-black text-[10px]">
                  <th className="p-3">ID / Pedido</th>
                  <th className="p-3">Comprador</th>
                  <th className="p-3">Valor</th>
                  <th className="p-3">Código de rastreio</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50/50">
                    <td className="p-3">
                      <p className="font-extrabold text-gray-900">{r.orderNumber || r.orderId}</p>
                      <p className="text-[10px] text-gray-400">{r.id}</p>
                    </td>
                    <td className="p-3 font-bold text-gray-800">{r.buyerName || '—'}</td>
                    <td className="p-3 font-black text-gray-900">{formatCurrency(r.amount, r.currency)}</td>
                    <td className="p-3 font-mono text-gray-700">{r.trackingCode || '—'}</td>
                    <td className="p-3 font-bold text-amber-700">{STATUS_LABEL[r.status] || r.status}</td>
                    <td className="p-3 text-right">
                      {r.status === 'received_inspected' ? (
                        <button
                          disabled={refundingId === r.id}
                          onClick={() => handleRefund(r.id)}
                          className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold rounded-lg border border-emerald-200 transition inline-flex items-center gap-1 disabled:opacity-50"
                        >
                          {refundingId === r.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                          Processar reembolso
                        </button>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
