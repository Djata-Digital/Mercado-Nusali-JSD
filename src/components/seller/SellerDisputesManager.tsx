import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ShieldCheck,
  Clock,
  MessageSquare,
  XCircle,
  Send,
  RefreshCw,
} from 'lucide-react';
import { CurrencyCode } from '../../types';
import { formatCurrency } from '../../utils/currencyUtils';
import { SellerService } from '../../services/sellerService';

interface SellerDisputesManagerProps {
  showToast: (msg: string) => void;
  selectedCurrency?: CurrencyCode;
}

// Correção (auditoria "painel do vendedor"): valores REAIS de
// disputes.status no schema — nunca os rótulos fictícios que existiam aqui
// antes (opened/seller_responded/under_admin_review/resolved_refunded/...).
export type DisputeStatus = 'open' | 'in_mediation' | 'resolved_buyer' | 'resolved_seller' | 'cancelled';

const STATUS_LABEL: Record<DisputeStatus, string> = {
  open: 'Aberta',
  in_mediation: 'Em mediação',
  resolved_buyer: 'Resolvida — comprador',
  resolved_seller: 'Resolvida — vendedor',
  cancelled: 'Cancelada',
};

interface DisputeMessage {
  id: string;
  senderRole: string;
  message: string;
  createdAt: string;
}

interface DisputeItem {
  id: string;
  orderId: string;
  orderNumber: string | null;
  buyerName: string | null;
  productTitle: string | null;
  productImage: string | null;
  reason: string;
  description: string;
  status: DisputeStatus;
  claimAmount: number;
  currency: string;
  resolution: string | null;
  createdAt: string;
  messages: DisputeMessage[];
}

const isActiveStatus = (status: DisputeStatus) => status === 'open' || status === 'in_mediation';

export const SellerDisputesManager: React.FC<SellerDisputesManagerProps> = ({ showToast }) => {
  const [disputesList, setDisputesList] = useState<DisputeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDispute, setSelectedDispute] = useState<DisputeItem | null>(null);
  // Fase M1-C — resposta real do vendedor.
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const openDispute = (item: DisputeItem) => {
    setReplyText('');
    setReplyError(null);
    setSelectedDispute(item);
  };

  const closeDispute = () => {
    setSelectedDispute(null);
    setReplyText('');
    setReplyError(null);
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDispute) return;
    const trimmed = replyText.trim();
    if (!trimmed) return;

    setIsSendingReply(true);
    setReplyError(null);
    try {
      const res = await SellerService.sendDisputeMessage(selectedDispute.id, trimmed);
      if (res.success && res.data) {
        const persisted = res.data as DisputeMessage;
        const disputeId = selectedDispute.id;
        setDisputesList(prev => prev.map(d => (
          d.id === disputeId ? { ...d, messages: [...d.messages, persisted] } : d
        )));
        setSelectedDispute(prev => (prev && prev.id === disputeId ? { ...prev, messages: [...prev.messages, persisted] } : prev));
        setReplyText('');
        showToast('Resposta enviada ao comprador.');
      } else {
        // Nunca mostra toast de sucesso quando a persistência falha —
        // erro fica visível inline, no formulário.
        setReplyError(res.message || 'Erro ao enviar resposta.');
      }
    } catch {
      setReplyError('Falha na comunicação com o servidor.');
    } finally {
      setIsSendingReply(false);
    }
  };

  const fetchDisputes = async () => {
    setIsLoading(true);
    try {
      const res = await SellerService.getDisputes();
      if (res.success && Array.isArray(res.data)) {
        setDisputesList(res.data as DisputeItem[]);
      }
    } catch {
      showToast('Não foi possível carregar suas disputas agora.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDisputes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeCount = disputesList.filter((d) => isActiveStatus(d.status)).length;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-red-600" />
            Central de Disputas & Proteção Escrow
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Acompanhe controvérsias com compradores. O saldo desses pedidos permanece retido em Escrow enquanto a disputa estiver aberta ou em mediação.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-red-50 border border-red-200 px-4 py-2 rounded-xl">
          <ShieldCheck className="w-5 h-5 text-red-600" />
          <div>
            <p className="text-[10px] font-bold text-red-800 uppercase">Disputas ativas</p>
            <p className="text-sm font-black text-red-900">{activeCount}</p>
          </div>
        </div>
      </div>

      {/* Disputes List Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <h2 className="text-xs font-black text-gray-900 uppercase tracking-wider">
            Disputas ({disputesList.length})
          </h2>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-gray-400 font-bold">Carregando disputas...</div>
        ) : disputesList.length === 0 ? (
          <div className="p-12 text-center text-gray-500 font-bold">
            Nenhuma disputa aberta ou sob mediação no momento.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-100 text-gray-500 uppercase text-[10px] font-bold">
                <tr>
                  <th className="p-3">Disputa / Pedido</th>
                  <th className="p-3">Comprador</th>
                  <th className="p-3">Produto</th>
                  <th className="p-3">Valor Reivindicado</th>
                  <th className="p-3">Aberta em</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-medium">
                {disputesList.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition">
                    <td className="p-3">
                      <p className="font-bold text-gray-900">{item.orderNumber || item.orderId}</p>
                      <p className="text-[10px] text-gray-400">{item.id}</p>
                    </td>
                    <td className="p-3 font-bold text-gray-800">{item.buyerName || '—'}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2 max-w-xs">
                        {item.productImage && (
                          <img src={item.productImage} alt="" className="w-8 h-8 rounded border object-cover shrink-0" />
                        )}
                        <span className="truncate text-gray-800">{item.productTitle || '—'}</span>
                      </div>
                    </td>
                    <td className="p-3 font-black text-red-600">
                      {formatCurrency(item.claimAmount, item.currency as CurrencyCode)}
                    </td>
                    <td className="p-3 text-gray-600 font-bold flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="p-3">
                      <span
                        className={`font-extrabold text-[10px] px-2.5 py-1 rounded-full uppercase border ${
                          isActiveStatus(item.status)
                            ? 'bg-amber-100 text-amber-900 border-amber-200'
                            : 'bg-gray-100 text-gray-700 border-gray-200'
                        }`}
                      >
                        {STATUS_LABEL[item.status] || item.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => openDispute(item)}
                        className="bg-gray-800 text-white font-bold px-3 py-1.5 rounded-lg hover:bg-gray-900 transition"
                      >
                        Ver detalhes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dispute Modal — somente visualização nesta etapa (ver relatório: ainda
          não existe nenhum endpoint real e seguro para o vendedor responder
          sem efeito financeiro, então nenhuma ação foi conectada). */}
      {selectedDispute && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6 border border-gray-200 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 pb-4">
              <div>
                <h3 className="text-lg font-black text-gray-900">Disputa #{selectedDispute.id}</h3>
                <p className="text-xs text-gray-500">Pedido {selectedDispute.orderNumber || selectedDispute.orderId}</p>
              </div>
              <button onClick={closeDispute} className="p-1 hover:bg-gray-100 rounded-full">
                <XCircle className="w-6 h-6 text-gray-400" />
              </button>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-black text-gray-500 uppercase">Motivo</p>
              <p className="text-sm text-gray-800">{selectedDispute.reason}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-black text-gray-500 uppercase">Descrição do comprador</p>
              <p className="text-sm text-gray-800">{selectedDispute.description}</p>
            </div>

            {/* Chat Thread — mensagens reais (dispute_messages), somente leitura */}
            <div className="space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-200 max-h-60 overflow-y-auto">
              <h4 className="text-xs font-black text-gray-500 uppercase flex items-center gap-1">
                <MessageSquare className="w-3.5 h-3.5" /> Histórico de Mensagens
              </h4>
              {selectedDispute.messages.length === 0 ? (
                <p className="text-xs text-gray-400">Nenhuma mensagem registrada ainda.</p>
              ) : (
                selectedDispute.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`p-3 rounded-lg text-xs space-y-1 ${
                      m.senderRole === 'seller' ? 'bg-emerald-50 border border-emerald-200 ml-8 text-emerald-950' : 'bg-white border border-gray-200 mr-8 text-gray-900'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span className="uppercase">{m.senderRole}</span>
                      <span className="text-[10px] text-gray-400">{new Date(m.createdAt).toLocaleString('pt-BR')}</span>
                    </div>
                    <p>{m.message}</p>
                  </div>
                ))
              )}
            </div>

            {/* Fase M1-C — resposta REAL do vendedor (antes só era possível
                ler). Só comunicação: nenhum botão de acordo/reembolso/ação
                financeira foi conectado aqui. */}
            <form onSubmit={handleSendReply} className="pt-2 border-t border-gray-200 space-y-2">
              <label className="text-xs font-black text-gray-500 uppercase">Responder ao comprador</label>
              <div className="flex gap-2">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={2}
                  placeholder="Escreva sua resposta para o comprador..."
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-800 focus:ring-2 focus:ring-emerald-600 focus:outline-hidden resize-none"
                />
                <button
                  type="submit"
                  disabled={isSendingReply || !replyText.trim()}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  {isSendingReply ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Enviar
                </button>
              </div>
              {replyError && <p className="text-[11px] text-red-600 font-semibold">{replyError}</p>}
              <p className="text-[10px] text-gray-400">
                Esta é uma mensagem de comunicação com o comprador. Propor acordo, reembolso ou qualquer ação financeira ainda não está disponível por aqui.
              </p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
