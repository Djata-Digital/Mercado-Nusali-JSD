import React, { useState, useEffect } from 'react';
import {
  RotateCcw,
  Clock,
  CheckCircle2,
  XCircle,
  Package,
  RefreshCw,
} from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext';
import { useOrders } from '../hooks/useOrders';
import { BuyerNavHeader } from './BuyerNavHeader';
import { formatCurrency } from '../utils/currencyUtils';
import { BuyerService, BuyerReturn } from '../services/buyerService';

// FASE D18-C3.7A — mesma causa raiz já corrigida em CartView.tsx (D18-C3.3):
// o Axios rejeita a promise para qualquer status não-2xx, então a mensagem
// de negócio real do backend (err.response.data.error.message, já humana)
// nunca era lida pelo catch genérico desta tela — só uma string genérica
// aparecia. Extraída aqui como função própria (não a mesma de CartView.tsx,
// que é especificamente sobre cupom) porque a lógica é idêntica mas o
// domínio é diferente.
function extractApiErrorMessage(err: any): string {
  const backendMessage = err?.response?.data?.error?.message || err?.response?.data?.message;
  if (typeof backendMessage === 'string' && backendMessage.trim()) return backendMessage;
  const status = err?.response?.status;
  if (status && status >= 400 && status < 500) return 'Não foi possível processar sua solicitação de devolução.';
  return 'Não foi possível comunicar com o servidor agora. Tente novamente.';
}

// FASE D18-C3.7A/D18-C3.7B.1 — rótulos honestos para os 7 valores REAIS de
// returns.status (schema.ts). Hoje só 'pending_approval', 'approved' e
// 'rejected' são de fato alcançáveis (logística reversa e reembolso são
// fases futuras, ainda não implementadas) — os demais rótulos existem para
// quando essas fases chegarem, sem fingir que já funcionam. 'approved' e
// 'label_generated' são estados DISTINTOS: aprovado != etiqueta gerada.
const RETURN_STATUS_LABELS: Record<BuyerReturn['status'], { label: string; icon: React.ReactNode; className: string }> = {
  pending_approval: { label: 'Aguardando análise do vendedor', icon: <Clock className="w-3.5 h-3.5" />, className: 'bg-yellow-50 text-yellow-800 border-yellow-200' },
  approved: { label: 'Aprovada pelo vendedor', icon: <CheckCircle2 className="w-3.5 h-3.5" />, className: 'bg-blue-50 text-blue-800 border-blue-200' },
  label_generated: { label: 'Etiqueta de devolução gerada', icon: <Package className="w-3.5 h-3.5" />, className: 'bg-blue-50 text-blue-800 border-blue-200' },
  item_shipped: { label: 'Produto enviado de volta', icon: <Package className="w-3.5 h-3.5" />, className: 'bg-blue-50 text-blue-800 border-blue-200' },
  received_inspected: { label: 'Produto recebido e em análise', icon: <Package className="w-3.5 h-3.5" />, className: 'bg-blue-50 text-blue-800 border-blue-200' },
  refunded: { label: 'Reembolsado', icon: <CheckCircle2 className="w-3.5 h-3.5" />, className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  rejected: { label: 'Rejeitada pelo vendedor', icon: <XCircle className="w-3.5 h-3.5" />, className: 'bg-red-50 text-red-800 border-red-200' },
};

export const ReturnsRefundsView: React.FC = () => {
  const { showToast, selectedCurrency } = usePreferences();
  const { data: orders = [] } = useOrders();
  const [activeTab, setActiveTab] = useState<'requests' | 'new_request'>('requests');

  const [returnReason, setReturnReason] = useState('defective');
  const [returnDescription, setReturnDescription] = useState('');
  // Fase M1-D4 — removido o fallback fictício 'NSL-8941203' (pedido que
  // nunca existiu). Começa vazio; o comprador ESCOLHE um pedido real no
  // <select> abaixo (opção "Selecione um pedido" + guarda no submit). Nunca
  // auto-seleciona um pedido nem usa first-child.
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [activeReturns, setActiveReturns] = useState<BuyerReturn[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // FASE D18-C3.7E — código de rastreio informado pelo comprador, por return.
  const [shippedTrackingInputs, setShippedTrackingInputs] = useState<Record<string, string>>({});
  const [reportingShippedId, setReportingShippedId] = useState<string | null>(null);

  // FASE D18-C3.7A — MVP só aceita devolução de pedido ENTREGUE (mesma regra
  // real que o backend aplica) — filtrar aqui evita que o comprador escolha
  // um pedido que sabidamente será rejeitado.
  const deliverableOrders = orders.filter((o: any) => o.status === 'delivered');

  const loadReturns = async () => {
    setIsLoading(true);
    try {
      const res = await BuyerService.getReturns();
      if (res.success && Array.isArray(res.data)) {
        setActiveReturns(res.data);
      }
    } catch (err) {
      console.error('Failed to load returns:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReturns();
  }, []);

  const handleCreateReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderId) {
      showToast('Selecione o pedido que deseja devolver.');
      return;
    }
    if (!returnDescription.trim()) {
      showToast('Por favor, descreva o motivo da devolução.');
      return;
    }

    setIsSubmitting(true);
    try {
      const reasonLabel =
        returnReason === 'defective' ? 'Defeito de Fabricação'
        : returnReason === 'wrong_item' ? 'Item Incorreto'
        : 'Desistência em 7 dias';

      // FASE D18-C3.7A — só a INTENÇÃO do comprador (orderId + motivo) é
      // enviada. sellerId/amount/currency nunca são enviados — o backend
      // sempre os deriva do próprio pedido real, dentro da mesma transação
      // que o trava (nunca confiados do cliente).
      const res = await BuyerService.createReturn({
        orderId: selectedOrderId,
        reason: reasonLabel,
        description: returnDescription.trim(),
      });

      if (res.success && res.data) {
        setActiveReturns(prev => [res.data, ...prev]);
        setActiveTab('requests');
        setReturnDescription('');
        showToast('Solicitação de devolução enviada! Aguarde a análise do vendedor.');
      } else {
        showToast(res.error?.message || res.message || 'Erro ao solicitar devolução.');
      }
    } catch (err: any) {
      showToast(extractApiErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // FASE D18-C3.7E — MVP sem transportadora integrada: o código de rastreio é
  // texto livre informado pelo próprio comprador, nunca validado
  // automaticamente pela Nusali (auditado: nenhuma logística reversa real
  // existe ainda).
  const handleReportShipped = async (returnId: string) => {
    setReportingShippedId(returnId);
    try {
      const trackingCode = (shippedTrackingInputs[returnId] || '').trim();
      const res = await BuyerService.reportReturnShipped(returnId, trackingCode || undefined);
      if (res.success && res.data) {
        setActiveReturns(prev => prev.map(r => (r.id === returnId ? { ...r, ...res.data } : r)));
        showToast('Envio registrado! Aguarde a confirmação de recebimento pelo vendedor.');
      } else {
        showToast(res.error?.message || res.message || 'Erro ao registrar envio.');
      }
    } catch (err: any) {
      showToast(extractApiErrorMessage(err));
    } finally {
      setReportingShippedId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-fadeIn">
      <BuyerNavHeader />

      {/* Main Header Banner */}
      <div className="bg-gradient-to-r from-amber-950 via-slate-900 to-emerald-950 text-white rounded-2xl p-6 sm:p-8 shadow-xl mb-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black">Devoluções e Reembolsos</h1>
            <p className="text-xs text-gray-200 mt-1 max-w-xl">
              Solicite a devolução de um pedido já entregue. O vendedor analisará seu
              pedido e você poderá acompanhar o andamento aqui.
            </p>
          </div>

          {/* Tab Switcher */}
          <div className="flex bg-white/10 p-1.5 rounded-xl border border-white/20">
            <button
              onClick={() => setActiveTab('requests')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'requests' ? 'bg-yellow-400 text-amber-950' : 'text-white hover:bg-white/10'
              }`}
            >
              Minhas Solicitações
            </button>
            <button
              onClick={() => setActiveTab('new_request')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'new_request' ? 'bg-yellow-400 text-amber-950' : 'text-white hover:bg-white/10'
              }`}
            >
              Nova Devolução
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'requests' ? (
        /* List of Active Returns */
        <div className="space-y-6">
          {isLoading ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
              <RefreshCw className="w-6 h-6 mx-auto animate-spin" />
            </div>
          ) : activeReturns.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-500">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-gray-800">Nenhuma devolução em andamento</h3>
              <p className="text-xs text-gray-400 mt-1">Todos os seus pedidos estão em conformidade.</p>
            </div>
          ) : (
            activeReturns.map((ret) => {
              const statusInfo = RETURN_STATUS_LABELS[ret.status] || RETURN_STATUS_LABELS.pending_approval;
              const relatedOrder = orders.find((o: any) => o.id === ret.orderId);
              return (
                <div key={ret.id} className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-yellow-50 rounded-xl text-yellow-700">
                        <RotateCcw className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-gray-400 font-mono">PROTOCOLO #{ret.id}</span>
                        <h3 className="text-sm font-black text-gray-900">
                          Pedido #{relatedOrder?.orderNumber || ret.orderId}
                        </h3>
                      </div>
                    </div>

                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold self-start sm:self-auto border ${statusInfo.className}`}>
                      {statusInfo.icon}
                      {statusInfo.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="bg-gray-50 p-4 rounded-xl">
                      <span className="text-gray-400 block mb-1">Motivo Informado:</span>
                      <span className="font-bold text-gray-800">{ret.reason}</span>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-xl">
                      <span className="text-gray-400 block mb-1">Valor do Pedido:</span>
                      <span className="font-black text-emerald-700">
                        {formatCurrency(ret.amount, ret.currency || selectedCurrency)}
                      </span>
                    </div>
                  </div>

                  {ret.resolution && (
                    <div className="mt-4 pt-4 border-t border-gray-100 text-xs">
                      <span className="text-gray-400 block mb-1">Resposta do vendedor:</span>
                      <span className="text-gray-700">{ret.resolution}</span>
                    </div>
                  )}

                  {/* FASE D18-C3.7E — comprador informa o envio somente quando aprovada */}
                  {ret.status === 'approved' && (
                    <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
                      <p className="text-xs font-bold text-gray-700">Envie o produto de volta e informe o código de rastreio (opcional)</p>
                      <p className="text-[11px] text-gray-400">
                        Este código é informado por você — a Nusali ainda não valida automaticamente com nenhuma transportadora.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={shippedTrackingInputs[ret.id] || ''}
                          onChange={(e) => setShippedTrackingInputs(prev => ({ ...prev, [ret.id]: e.target.value }))}
                          placeholder="Código de rastreio (opcional)"
                          maxLength={100}
                          className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                        />
                        <button
                          type="button"
                          disabled={reportingShippedId === ret.id}
                          onClick={() => handleReportShipped(ret.id)}
                          className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          {reportingShippedId === ret.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Informar envio'}
                        </button>
                      </div>
                    </div>
                  )}

                  {ret.trackingCode && ret.status !== 'approved' && (
                    <div className="mt-4 pt-4 border-t border-gray-100 text-xs">
                      <span className="text-gray-400 block mb-1">Código de rastreio informado:</span>
                      <span className="font-mono font-bold text-gray-700">{ret.trackingCode}</span>
                      <p className="text-[11px] text-gray-400 mt-1">Informado por você — não validado automaticamente pela Nusali.</p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* Form Request New Return */
        <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-2xs max-w-2xl mx-auto">
          <h2 className="text-lg font-black text-gray-900 mb-2">Solicitar Devolução</h2>
          <p className="text-xs text-gray-500 mb-6">
            Só é possível solicitar devolução de pedidos já entregues.
          </p>

          <form onSubmit={handleCreateReturn} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Selecione o Pedido</label>
              <select
                value={selectedOrderId}
                onChange={e => setSelectedOrderId(e.target.value)}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              >
                <option value="">
                  {deliverableOrders.length === 0 ? 'Você não tem pedidos entregues elegíveis para devolução' : 'Selecione um pedido'}
                </option>
                {deliverableOrders.map((o: any) => (
                  <option key={o.id} value={o.id}>
                    Pedido #{o.orderNumber || o.id} - Realizado em {o.createdAt ? new Date(o.createdAt).toLocaleDateString('pt-BR') : o.date} (Total: {formatCurrency(o.totalAmount ?? o.total ?? 0, o.currency || selectedCurrency)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Motivo da Solicitação</label>
              <select
                value={returnReason}
                onChange={e => setReturnReason(e.target.value)}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              >
                <option value="defective">Produto com defeito ou avaria de fábrica</option>
                <option value="wrong_item">Recebi um item diferente do anunciado</option>
                <option value="regret">Desistência da compra (Direito de arrependimento em 7 dias)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Detalhes do Motivo</label>
              <textarea
                value={returnDescription}
                onChange={e => setReturnDescription(e.target.value)}
                rows={4}
                placeholder="Descreva detalhadamente o ocorrido com o produto..."
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                required
              />
            </div>

            <div className="pt-4 border-t border-gray-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setActiveTab('requests')}
                className="px-5 py-2.5 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black transition cursor-pointer flex items-center gap-2"
              >
                {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Enviar Solicitação'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
