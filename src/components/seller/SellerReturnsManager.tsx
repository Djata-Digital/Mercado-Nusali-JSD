import React, { useEffect, useState } from 'react';
import {
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  Package,
  Search,
  RefreshCw,
  Eye,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';
import { CurrencyCode } from '../../types';
import { formatCurrency } from '../../utils/currencyUtils';
import { SellerService } from '../../services/sellerService';

interface SellerReturnsManagerProps {
  showToast: (msg: string) => void;
  selectedCurrency?: CurrencyCode;
}

// FASE D18-C3.7B/D18-C3.7B.1 — valores REAIS de returns.status (schema.ts),
// nunca mais os fictícios (pending/approved/in_transit/received/refunded/
// disputed) que existiam aqui antes num componente 100% mock. 'approved' é
// um status PRÓPRIO ("vendedor aceitou, nenhuma etiqueta/logística reversa
// criada ainda") — DISTINTO de 'label_generated' ("etiqueta de devolução já
// gerada"), que fica reservado para quando essa fase futura existir de
// verdade. Hoje só pending_approval, approved e rejected são de fato
// alcançáveis; os demais (label_generated/item_shipped/received_inspected/
// refunded) pertencem a fases futuras de logística/reembolso ainda não
// implementadas.
export type SellerReturnStatus = 'pending_approval' | 'approved' | 'label_generated' | 'item_shipped' | 'received_inspected' | 'refunded' | 'rejected';

const STATUS_LABEL: Record<SellerReturnStatus, string> = {
  pending_approval: 'Aguardando sua decisão',
  approved: 'Aprovada',
  label_generated: 'Etiqueta de devolução gerada',
  item_shipped: 'Produto enviado de volta',
  received_inspected: 'Produto recebido e em análise',
  refunded: 'Reembolsada',
  rejected: 'Rejeitada',
};

const STATUS_STYLE: Record<SellerReturnStatus, string> = {
  pending_approval: 'bg-amber-100 text-amber-900 border-amber-200',
  approved: 'bg-teal-100 text-teal-800 border-teal-200',
  label_generated: 'bg-blue-100 text-blue-800 border-blue-200',
  item_shipped: 'bg-blue-100 text-blue-800 border-blue-200',
  received_inspected: 'bg-blue-100 text-blue-800 border-blue-200',
  refunded: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
};

interface ReturnItem {
  id: string;
  orderId: string;
  orderNumber: string | null;
  buyerName: string | null;
  reason: string;
  amount: number;
  currency: string;
  status: SellerReturnStatus;
  trackingCode: string | null;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
}

function extractApiErrorMessage(err: any): string {
  const backendMessage = err?.response?.data?.error?.message || err?.response?.data?.message;
  if (typeof backendMessage === 'string' && backendMessage.trim()) return backendMessage;
  const status = err?.response?.status;
  if (status && status >= 400 && status < 500) return 'Não foi possível processar esta decisão.';
  return 'Não foi possível comunicar com o servidor agora. Tente novamente.';
}

export const SellerReturnsManager: React.FC<SellerReturnsManagerProps> = ({ showToast, selectedCurrency }) => {
  const [returnsList, setReturnsList] = useState<ReturnItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedReturn, setSelectedReturn] = useState<ReturnItem | null>(null);
  const [rejectionText, setRejectionText] = useState('');
  const [isDeciding, setIsDeciding] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const fetchReturns = async () => {
    setIsLoading(true);
    try {
      const res = await SellerService.getReturns();
      if (res.success && Array.isArray(res.data)) {
        setReturnsList(res.data as ReturnItem[]);
      }
    } catch {
      showToast('Não foi possível carregar suas devoluções agora.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReturns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openReturn = (item: ReturnItem) => {
    setRejectionText('');
    setDecisionError(null);
    setSelectedReturn(item);
  };

  const closeReturn = () => {
    setSelectedReturn(null);
    setRejectionText('');
    setDecisionError(null);
  };

  const handleDecision = async (decision: 'approve' | 'reject') => {
    if (!selectedReturn) return;
    if (decision === 'reject' && rejectionText.trim().length < 3) {
      setDecisionError('Informe uma justificativa com pelo menos 3 caracteres para rejeitar.');
      return;
    }

    setIsDeciding(true);
    setDecisionError(null);
    try {
      const res = await SellerService.decideReturn(selectedReturn.id, decision, decision === 'reject' ? rejectionText.trim() : undefined);
      if (res.success && res.data) {
        const persisted = res.data as Partial<ReturnItem>;
        setReturnsList((prev) => prev.map((r) => (r.id === selectedReturn.id ? { ...r, ...persisted } as ReturnItem : r)));
        showToast(decision === 'approve' ? 'Devolução aprovada.' : 'Devolução rejeitada.');
        closeReturn();
        fetchReturns();
      } else {
        setDecisionError(res.message || 'Não foi possível processar esta decisão.');
      }
    } catch (err: any) {
      setDecisionError(extractApiErrorMessage(err));
    } finally {
      setIsDeciding(false);
    }
  };

  // FASE D18-C3.7E — vendedor confirma que recebeu/inspecionou o produto
  // devolvido. Não dispara nenhum reembolso (ação exclusivamente
  // administrativa, ver painel do Admin).
  const [isConfirmingReceipt, setIsConfirmingReceipt] = useState(false);
  const handleConfirmReceived = async () => {
    if (!selectedReturn) return;
    setIsConfirmingReceipt(true);
    setDecisionError(null);
    try {
      const res = await SellerService.confirmReturnReceived(selectedReturn.id);
      if (res.success && res.data) {
        const persisted = res.data as Partial<ReturnItem>;
        setReturnsList((prev) => prev.map((r) => (r.id === selectedReturn.id ? { ...r, ...persisted } as ReturnItem : r)));
        showToast('Recebimento confirmado.');
        closeReturn();
        fetchReturns();
      } else {
        setDecisionError(res.message || 'Não foi possível confirmar o recebimento.');
      }
    } catch (err: any) {
      setDecisionError(extractApiErrorMessage(err));
    } finally {
      setIsConfirmingReceipt(false);
    }
  };

  const filteredReturns = returnsList.filter((item) => {
    const term = searchTerm.toLowerCase();
    return (
      item.id.toLowerCase().includes(term) ||
      (item.buyerName || '').toLowerCase().includes(term) ||
      item.orderId.toLowerCase().includes(term) ||
      (item.orderNumber || '').toLowerCase().includes(term)
    );
  });

  const pendingCount = returnsList.filter((r) => r.status === 'pending_approval').length;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <RotateCcw className="w-6 h-6 text-emerald-600" />
            Devoluções
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Analise solicitações de devolução dos seus compradores e decida por aprovar ou rejeitar.
          </p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-right">
          <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Aguardando sua decisão</p>
          <p className="text-lg font-black text-amber-900">{pendingCount} solicitações</p>
        </div>
      </div>

      {/* Search + Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <h2 className="text-xs font-black text-gray-900 uppercase tracking-wider">
            Devoluções ({returnsList.length})
          </h2>
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por comprador, pedido..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-gray-400 font-bold">Carregando devoluções...</div>
        ) : filteredReturns.length === 0 ? (
          <div className="p-12 text-center text-gray-500 font-bold">
            Nenhuma solicitação de devolução encontrada.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-100 text-gray-500 uppercase text-[10px] font-bold">
                <tr>
                  <th className="p-3">Pedido</th>
                  <th className="p-3">Comprador</th>
                  <th className="p-3">Motivo</th>
                  <th className="p-3">Valor</th>
                  <th className="p-3">Solicitada em</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-medium">
                {filteredReturns.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition">
                    <td className="p-3">
                      <p className="font-bold text-gray-900">{item.orderNumber || item.orderId}</p>
                      <p className="text-[10px] text-gray-400">{item.id}</p>
                    </td>
                    <td className="p-3 font-bold text-gray-800">{item.buyerName || '—'}</td>
                    <td className="p-3 max-w-xs">
                      <p className="truncate text-gray-600 italic">"{item.reason}"</p>
                    </td>
                    <td className="p-3 font-black text-gray-900">
                      {formatCurrency(item.amount, item.currency as CurrencyCode)}
                    </td>
                    <td className="p-3 text-gray-600 font-bold flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="p-3">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase border ${STATUS_STYLE[item.status] || STATUS_STYLE.pending_approval}`}>
                        {STATUS_LABEL[item.status] || item.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => openReturn(item)}
                        className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold px-3 py-1.5 rounded-lg border border-emerald-200 transition inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" /> {item.status === 'pending_approval' ? 'Analisar' : item.status === 'item_shipped' ? 'Confirmar recebimento' : 'Ver detalhes'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Return Detail Modal */}
      {selectedReturn && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 border border-gray-200 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 pb-4">
              <div>
                <h3 className="text-lg font-black text-gray-900">Devolução #{selectedReturn.id}</h3>
                <p className="text-xs text-gray-500">
                  Pedido {selectedReturn.orderNumber || selectedReturn.orderId} • {new Date(selectedReturn.createdAt).toLocaleString('pt-BR')}
                </p>
              </div>
              <button onClick={closeReturn} className="p-1 hover:bg-gray-100 rounded-full text-gray-500">
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase">Comprador</p>
                <p className="text-sm font-bold text-gray-900">{selectedReturn.buyerName || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase">Valor do pedido</p>
                <p className="text-sm font-black text-gray-900">
                  {formatCurrency(selectedReturn.amount, selectedReturn.currency as CurrencyCode)}
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-[10px] font-bold text-gray-400 uppercase">Motivo informado pelo comprador</p>
              <p className="p-3 bg-amber-50 text-amber-900 rounded-lg border border-amber-200 text-xs italic">
                "{selectedReturn.reason}"
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-[10px] font-bold text-gray-400 uppercase">Status atual</p>
              <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase border ${STATUS_STYLE[selectedReturn.status] || STATUS_STYLE.pending_approval}`}>
                {STATUS_LABEL[selectedReturn.status] || selectedReturn.status}
              </span>
            </div>

            {selectedReturn.resolution && (
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase">Resolução registrada</p>
                <p className="p-3 bg-gray-50 text-gray-800 rounded-lg border border-gray-200 text-xs">
                  {selectedReturn.resolution}
                </p>
              </div>
            )}

            {selectedReturn.status === 'pending_approval' ? (
              <div className="pt-4 border-t border-gray-200 space-y-3">
                <label className="text-[10px] font-bold text-gray-400 uppercase">
                  Justificativa (obrigatória apenas se for rejeitar)
                </label>
                <textarea
                  value={rejectionText}
                  onChange={(e) => setRejectionText(e.target.value)}
                  rows={2}
                  placeholder="Explique o motivo da rejeição, se for o caso..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-800 focus:ring-2 focus:ring-emerald-600 focus:outline-hidden resize-none"
                />
                {decisionError && <p className="text-[11px] text-red-600 font-semibold">{decisionError}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isDeciding}
                    onClick={() => handleDecision('approve')}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                  >
                    {isDeciding ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
                    Aprovar solicitação
                  </button>
                  <button
                    type="button"
                    disabled={isDeciding}
                    onClick={() => handleDecision('reject')}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-4 py-2.5 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                  >
                    {isDeciding ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ThumbsDown className="w-4 h-4" />}
                    Rejeitar solicitação
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 flex items-center gap-1">
                  <Package className="w-3 h-3" /> Aprovar registra a decisão. O reembolso é uma ação administrativa, feita somente depois que você confirmar o recebimento do produto.
                </p>
              </div>
            ) : selectedReturn.status === 'item_shipped' ? (
              <div className="pt-4 border-t border-gray-200 space-y-3">
                {selectedReturn.trackingCode && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Código de rastreio informado pelo comprador</p>
                    <p className="font-mono font-bold text-gray-800 text-sm">{selectedReturn.trackingCode}</p>
                    <p className="text-[11px] text-gray-400">Informado pelo comprador — não validado automaticamente pela Nusali.</p>
                  </div>
                )}
                {decisionError && <p className="text-[11px] text-red-600 font-semibold">{decisionError}</p>}
                <button
                  type="button"
                  disabled={isConfirmingReceipt}
                  onClick={handleConfirmReceived}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  {isConfirmingReceipt ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Confirmar recebimento
                </button>
                <p className="text-[10px] text-gray-400">Confirma apenas que o produto foi recebido e inspecionado — o reembolso é decidido separadamente pela administração.</p>
              </div>
            ) : (
              <div className="pt-4 border-t border-gray-200 space-y-2">
                {selectedReturn.trackingCode && (
                  <div className="text-xs">
                    <span className="text-gray-400 block mb-1">Código de rastreio:</span>
                    <span className="font-mono font-bold text-gray-700">{selectedReturn.trackingCode}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-gray-400" />
                  Esta devolução já foi decidida e não pode ser alterada novamente por aqui.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
