import React, { useState, useEffect } from 'react';
import { ShieldCheck, AlertCircle, Lock, MessageSquare, CheckCircle2, Clock, Send, ArrowRight, DollarSign, FileText, RefreshCw } from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext';
import { useOrders } from '../hooks/useOrders';
import { formatCurrency } from '../utils/currencyUtils';
import { BuyerService, BuyerDispute } from '../services/buyerService';

export const DisputesEscrowView: React.FC = () => {
  const { selectedCurrency, showToast } = usePreferences();
  const { data: orders = [] } = useOrders();

  const [disputes, setDisputes] = useState<BuyerDispute[]>([]);
  const [selectedDisputeId, setSelectedDisputeId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  // Form state for new dispute
  const [isOpeningForm, setIsOpeningForm] = useState(false);
  // Fase M1-A (B5) — REMOVIDO o fallback fixo 'NSL-8941203' (pedido
  // fictício que nunca existiu de verdade). `orders` vem de um hook
  // assíncrono (useOrders) — no primeiro render ele quase sempre ainda
  // está vazio, então o valor inicial tem que ser vazio também; o efeito
  // abaixo preenche com o pedido real assim que a lista carregar. Nenhuma
  // chamada a createDispute pode acontecer com targetOrderId vazio (guarda
  // no submit do botão E no início de handleCreateDispute).
  const [targetOrderId, setTargetOrderId] = useState('');
  // Fase M1-C (achado M1-A #1, correção incidental autorizada) — o valor
  // inicial não correspondia a NENHUMA <option> real do select abaixo
  // ("Produto divergente ou com avaria" nunca existiu como opção); agora é
  // literalmente a primeira option real, então o valor pré-selecionado
  // sempre corresponde ao que o <select> mostra.
  const [reason, setReason] = useState('Produto divergente ou com defeito de fábrica');
  const [description, setDescription] = useState('');
  const [isCreatingDispute, setIsCreatingDispute] = useState(false);

  // Preenche targetOrderId com um pedido REAL assim que `orders` carregar —
  // nunca sobrescreve uma escolha que o comprador já tenha feito no <select>.
  useEffect(() => {
    if (!targetOrderId && orders.length > 0) {
      setTargetOrderId(orders[0].id);
    }
  }, [orders, targetOrderId]);

  const loadDisputes = async () => {
    setIsLoading(true);
    try {
      const res = await BuyerService.getDisputes();
      if (res.success && Array.isArray(res.data)) {
        setDisputes(res.data);
        if (res.data.length > 0 && !selectedDisputeId) {
          setSelectedDisputeId(res.data[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load disputes:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDisputes();
  }, []);

  const activeDispute = disputes.find((d: any) => d.id === selectedDisputeId) || disputes[0];

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed || !activeDispute) return;

    setIsSendingMessage(true);
    try {
      const res = await BuyerService.sendDisputeMessage(activeDispute.id, trimmed);
      if (res.success && res.data) {
        // Fase M1-C — atualização imutável (nunca mais mutar
        // activeDispute.messages diretamente): garante que o React
        // re-renderize a partir da mensagem REALMENTE persistida
        // (res.data), nunca de um objeto local otimista.
        const persisted = res.data;
        setDisputes(prev => prev.map(d => (
          d.id === activeDispute.id ? { ...d, messages: [...(d.messages || []), persisted] } : d
        )));
        setChatInput('');
        showToast('Mensagem enviada na sala de mediação!');
      } else {
        // Nunca mostra toast de sucesso quando a persistência falha.
        showToast(res.message || 'Erro ao enviar mensagem.');
      }
    } catch {
      showToast('Falha na comunicação com o servidor.');
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleCreateDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    // Fase M1-A (B5) — guarda de segurança: nunca chamar createDispute sem
    // um pedido real selecionado (defesa em profundidade além do botão
    // desabilitado abaixo, para o caso de submit disparado por outro meio,
    // ex.: Enter em algum campo).
    if (!targetOrderId) return;
    if (!description.trim()) return;

    setIsCreatingDispute(true);
    try {
      const res = await BuyerService.createDispute({
        orderId: targetOrderId,
        reason,
        description: description.trim(),
      });

      if (res.success && res.data) {
        setDisputes(prev => [res.data, ...prev]);
        setSelectedDisputeId(res.data.id);
        setIsOpeningForm(false);
        setDescription('');
        showToast('Disputa aberta com sucesso! Fundos mantidos em custódia Escrow.');
      } else {
        showToast(res.message || 'Erro ao abrir disputa.');
      }
    } catch {
      showToast('Erro de comunicação com o servidor.');
    } finally {
      setIsCreatingDispute(false);
    }
  };

  const handleConfirmOrderReceipt = async (orderId: string) => {
    try {
      const res = await BuyerService.confirmOrderDelivery(orderId);
      if (res.success) {
        showToast('Recebimento confirmado! Fundos liberados e cashback creditado na carteira.');
        loadDisputes();
      }
    } catch {
      showToast('Falha ao confirmar recebimento.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Escrow Header */}
      <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 text-white rounded-2xl p-6 md:p-8 mb-8 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-yellow-400/20 text-yellow-300 rounded-full text-xs font-bold border border-yellow-400/30">
              <ShieldCheck className="w-3.5 h-3.5" /> Proteção Total ao Comprador Nusali
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">
              Garantia Escrow & Mediação de Disputas
            </h1>
            <p className="text-xs md:text-sm text-gray-300 leading-relaxed">
              Seu dinheiro permanece 100% protegido em custódia até que você confirme que recebeu o produto em perfeitas condições. Em caso de divergência ou avaria, nossa equipe media a devolução do valor.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => setIsOpeningForm(true)}
              className="bg-red-600 hover:bg-red-700 text-white px-5 py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition cursor-pointer"
            >
              <AlertCircle className="w-4 h-4" /> Abrir Nova Disputa
            </button>
          </div>
        </div>
      </div>

      {/* New Dispute Modal Form */}
      {isOpeningForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-600" /> Abrir Disputa / Bloqueio Escrow
              </h3>
              <button
                onClick={() => setIsOpeningForm(false)}
                className="text-gray-400 hover:text-gray-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateDispute} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Selecione o Pedido em Conflito</label>
                <select
                  value={targetOrderId}
                  onChange={(e) => setTargetOrderId(e.target.value)}
                  disabled={orders.length === 0}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-800 focus:ring-2 focus:ring-red-500 focus:outline-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {orders.length === 0 ? (
                    <option value="">Carregando seus pedidos...</option>
                  ) : (
                    orders.map((o: any) => (
                      <option key={o.id} value={o.id}>
                        Pedido #{o.id} - {formatCurrency(o.totalAmount ?? o.total ?? 0, selectedCurrency)}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Motivo da Reclamação</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-800 focus:ring-2 focus:ring-red-500 focus:outline-hidden"
                >
                  <option value="Produto divergente ou com defeito de fábrica">Produto divergente ou com defeito de fábrica</option>
                  <option value="Pedido não entregue no prazo estipulado">Pedido não entregue no prazo estipulado</option>
                  <option value="Embalagem violada ou item faltante">Embalagem violada ou item faltante</option>
                  <option value="Outros problemas com o vendedor">Outros problemas com o vendedor</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Descrição do Problema</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Explique detalhadamente o ocorrido com o produto ou entrega..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-800 focus:ring-2 focus:ring-red-500 focus:outline-hidden resize-none"
                  required
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsOpeningForm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreatingDispute || !targetOrderId}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreatingDispute ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Confirmar Abertura'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main Grid: Disputes List + Selected Dispute Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left List of Disputes */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-2xs space-y-3">
          <h2 className="text-sm font-black text-gray-900 px-2 flex items-center justify-between">
            <span>Disputas Ativas ({disputes.length})</span>
          </h2>

          <div className="space-y-2">
            {disputes.length === 0 ? (
              <div className="text-center py-12 text-gray-400 space-y-2">
                <ShieldCheck className="w-10 h-10 mx-auto text-emerald-500 opacity-60" />
                <p className="text-xs font-medium">Nenhuma disputa aberta no momento.</p>
                <p className="text-[10px] text-gray-400">Todos os seus pedidos estão protegidos pelo Escrow.</p>
              </div>
            ) : (
              disputes.map((d: any) => (
                <div
                  key={d.id}
                  onClick={() => setSelectedDisputeId(d.id)}
                  className={`p-3.5 rounded-xl border transition cursor-pointer space-y-2 ${
                    selectedDisputeId === d.id
                      ? 'border-indigo-600 bg-indigo-50/40 shadow-xs ring-1 ring-indigo-600'
                      : 'border-gray-100 hover:border-gray-200 bg-gray-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-black text-indigo-700">
                      #{d.orderNumber || d.orderId}
                    </span>
                    <span className="text-[10px] bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full">
                      {d.status === 'in_mediation' ? 'Em Mediação' : 'Aberta'}
                    </span>
                  </div>

                  <h3 className="text-xs font-bold text-gray-900 line-clamp-1">
                    {d.productTitle}
                  </h3>

                  <div className="flex items-center justify-between text-[11px] text-gray-500 pt-1 border-t border-gray-200/60">
                    <span>{d.date}</span>
                    <span className="font-extrabold text-gray-900">
                      {formatCurrency(d.claimAmount, d.currency || selectedCurrency)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Active Dispute Room */}
        <div className="lg:col-span-2 space-y-6">
          {activeDispute ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs space-y-6">
              {/* Dispute Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-gray-400">DISPUTA #{activeDispute.id}</span>
                    <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
                      Escrow Bloqueado
                    </span>
                  </div>
                  <h2 className="text-base font-black text-gray-900 mt-1">{activeDispute.productTitle}</h2>
                  <p className="text-xs text-gray-500">Vendido por: <strong className="text-gray-700">{activeDispute.sellerName}</strong></p>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-right shrink-0">
                  <span className="text-[10px] font-bold text-emerald-800 block">Valor Protegido sob Custódia:</span>
                  {/* Fase M1-A (B1) — escrowAmount é o dinheiro REALMENTE em
                      custódia agora (nunca claimAmount, que é só o valor
                      alegado pelo comprador). `null` acontece quando o
                      escrow já foi liberado/estornado — nesse caso não há
                      mais nada "protegido" para este pedido, e mostrar
                      R$0,00 seria repetir o mesmo bug que estamos
                      corrigindo (pareceria que o valor sumiu/é zero, não
                      que ele já não está mais em custódia). */}
                  {activeDispute.escrowAmount !== null && activeDispute.escrowAmount !== undefined ? (
                    <span className="text-base font-black text-emerald-700">
                      {formatCurrency(activeDispute.escrowAmount, activeDispute.escrowCurrency || activeDispute.currency || selectedCurrency)}
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-gray-500">
                      Escrow já {activeDispute.escrowStatus === 'refunded' ? 'estornado' : activeDispute.escrowStatus === 'released' ? 'liberado' : 'não encontrado'}
                    </span>
                  )}
                </div>
              </div>

              {/* Dispute Reason Box */}
              <div className="bg-red-50/60 border border-red-200 p-4 rounded-xl space-y-1">
                <span className="text-[11px] font-bold text-red-800">Motivo: {activeDispute.reason}</span>
                <p className="text-xs text-gray-700 leading-relaxed">{activeDispute.description}</p>
              </div>

              {/* Mediation Messages Log */}
              <div className="space-y-3">
                <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4 text-indigo-600" /> Sala de Mediação e Conversa
                </h3>

                <div className="bg-gray-50 rounded-xl p-4 max-h-72 overflow-y-auto space-y-3 border border-gray-100">
                  {/* Fase M1-C — shape REAL de dispute_messages
                      (senderRole/message/createdAt); nunca mais o mock
                      {sender, senderName, text, timestamp}. */}
                  {activeDispute.messages && activeDispute.messages.map((m) => (
                    <div
                      key={m.id}
                      className={`p-3 rounded-xl max-w-md text-xs space-y-1 ${
                        m.senderRole === 'buyer'
                          ? 'bg-blue-600 text-white ml-auto'
                          : m.senderRole === 'mediator' || m.senderRole === 'admin'
                          ? 'bg-indigo-900 text-yellow-300 mx-auto border border-yellow-400/40 text-center'
                          : 'bg-white text-gray-800 border border-gray-200 mr-auto'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 text-[10px] opacity-80 font-semibold">
                        <span>
                          {m.senderRole === 'buyer' ? 'Você' : m.senderRole === 'seller' ? (activeDispute.sellerName || 'Vendedor') : 'Mediação Nusali'}
                        </span>
                        <span>{new Date(m.createdAt).toLocaleString('pt-BR')}</span>
                      </div>
                      <p className="leading-relaxed">{m.message}</p>
                    </div>
                  ))}
                </div>

                {/* Message Input */}
                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Adicionar resposta para a mediação..."
                    className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-xs text-gray-800 focus:ring-2 focus:ring-indigo-600 focus:outline-hidden"
                  />
                  <button
                    type="submit"
                    disabled={isSendingMessage}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    {isSendingMessage ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span>Enviar</span>
                  </button>
                </form>
              </div>

              {/* Actions Footer */}
              <div className="pt-4 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <span className="text-gray-500 text-[11px]">
                  Caso o problema tenha sido sanado, você pode confirmar o recebimento e liberar os fundos ao vendedor.
                </span>

                <button
                  onClick={() => handleConfirmOrderReceipt(activeDispute.orderId)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shadow-xs"
                >
                  <CheckCircle2 className="w-4 h-4" /> Aceitar Acordo & Liberar Escrow
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
              <ShieldCheck className="w-12 h-12 mx-auto mb-2 text-emerald-500 opacity-60" />
              <p className="text-sm font-bold text-gray-700">Selecione uma disputa para ver a sala de mediação.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
