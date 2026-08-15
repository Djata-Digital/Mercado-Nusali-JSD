import React, { useState } from 'react';
import {
  AlertTriangle,
  ShieldCheck,
  Clock,
  MessageSquare,
  FileCheck,
  Send,
  Paperclip,
  CheckCircle2,
  XCircle,
  Gavel,
  DollarSign,
  Search,
  ChevronRight
} from 'lucide-react';
import { CurrencyCode } from '../../types';

interface SellerDisputesManagerProps {
  showToast: (msg: string) => void;
  selectedCurrency?: CurrencyCode;
}

export type DisputeStatus = 'opened' | 'seller_responded' | 'under_admin_review' | 'resolved_refunded' | 'resolved_released' | 'closed';

interface DisputeItem {
  id: string;
  orderId: string;
  buyerName: string;
  productTitle: string;
  productImage: string;
  retainedAmount: number;
  currency: string;
  reason: string;
  responseDeadline: string;
  mediator: string;
  status: DisputeStatus;
  messages: { sender: 'buyer' | 'seller' | 'mediator'; name: string; text: string; date: string }[];
  evidenceUrls: string[];
  timeline: { title: string; date: string; done: boolean }[];
  adminDecision?: string;
}

export const SellerDisputesManager: React.FC<SellerDisputesManagerProps> = ({ showToast }) => {
  const [disputesList, setDisputesList] = useState<DisputeItem[]>([
    {
      id: 'DISP-1092',
      orderId: 'ORD-9102',
      buyerName: 'Kumba Yala',
      productTitle: 'Inversor Solar Híbrido 5kW 48V Off-Grid Wave',
      productImage: 'https://images.unsplash.com/photo-1509391365360-2e959784a276?auto=format&fit=crop&q=80&w=300',
      retainedAmount: 850000,
      currency: 'XOF',
      reason: 'Comprador alega que o aparelho não ligou após conexão.',
      responseDeadline: 'Em 24 horas',
      mediator: 'Equipe de Mediação Nusali Escrow',
      status: 'opened',
      messages: [
        { sender: 'buyer', name: 'Kumba Yala', text: 'Instalei o inversor conforme o manual mas o display não acendeu. Exijo meu dinheiro de volta!', date: '29/07/2026 10:15' }
      ],
      evidenceUrls: [
        'https://images.unsplash.com/photo-1509391365360-2e959784a276?auto=format&fit=crop&q=80&w=400'
      ],
      timeline: [
        { title: 'Disputa aberta pelo comprador', date: '29/07/2026 10:15', done: true },
        { title: 'Aguardando resposta do vendedor', date: 'Prazo: 30/07/2026', done: false },
        { title: 'Análise do mediador Nusali', date: 'Pendente', done: false },
        { title: 'Decisão e liberação de fundos', date: 'Pendente', done: false },
      ]
    },
    {
      id: 'DISP-1080',
      orderId: 'ORD-8920',
      buyerName: 'Juliana Paes',
      productTitle: 'Óleo de Palma Virgem 5L de Bafatá',
      productImage: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&q=80&w=300',
      retainedAmount: 250,
      currency: 'BRL',
      reason: 'Atraso na liberação alfandegária no aeroporto.',
      responseDeadline: 'Aguardando Comprador',
      mediator: 'Suporte Técnico Nusali',
      status: 'seller_responded',
      messages: [
        { sender: 'buyer', name: 'Juliana Paes', text: 'O rastreio diz que está preso na alfândega há 5 dias.', date: '25/07/2026' },
        { sender: 'seller', name: 'Você (Vendedor)', text: 'Encaminhamos a guia fiscal de liberação para a Receita. O item será liberado em 24h.', date: '26/07/2026' }
      ],
      evidenceUrls: [],
      timeline: [
        { title: 'Disputa aberta', date: '25/07/2026', done: true },
        { title: 'Vendedor enviou justificativa e comprovante', date: '26/07/2026', done: true },
        { title: 'Mediação aguardando confirmação de entrega', date: 'Em andamento', done: false },
      ]
    }
  ]);

  const [selectedDispute, setSelectedDispute] = useState<DisputeItem | null>(null);
  const [replyText, setReplyText] = useState('');

  const handleSendReply = () => {
    if (!replyText.trim() || !selectedDispute) return;
    const newMsg = {
      sender: 'seller' as const,
      name: 'Você (Vendedor)',
      text: replyText.trim(),
      date: 'Agora'
    };

    setDisputesList(prev => prev.map(d => d.id === selectedDispute.id ? {
      ...d,
      status: 'seller_responded' as const,
      messages: [...d.messages, newMsg]
    } : d));

    setSelectedDispute(prev => prev ? {
      ...prev,
      status: 'seller_responded',
      messages: [...prev.messages, newMsg]
    } : null);

    setReplyText('');
    showToast('Resposta enviada com sucesso ao mediador e comprador.');
  };

  const handleAction = (disputeId: string, actionName: string, newStatus: DisputeStatus) => {
    setDisputesList(prev => prev.map(d => d.id === disputeId ? { ...d, status: newStatus } : d));
    showToast(`Ação "${actionName}" executada para a disputa ${disputeId}`);
    if (selectedDispute && selectedDispute.id === disputeId) {
      setSelectedDispute(prev => prev ? { ...prev, status: newStatus } : null);
    }
  };

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
            Responda e gerencie controvérsias com compradores com retenção de saldo garantida pelo Nusali Pay.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-red-50 border border-red-200 px-4 py-2 rounded-xl">
          <ShieldCheck className="w-5 h-5 text-red-600" />
          <div>
            <p className="text-[10px] font-bold text-red-800 uppercase">Total Retido no Escrow</p>
            <p className="text-sm font-black text-red-900">
              {disputesList.length} disputas ativas
            </p>
          </div>
        </div>
      </div>

      {/* Disputes List Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <h2 className="text-xs font-black text-gray-900 uppercase tracking-wider">
            Disputas sob mediação ({disputesList.length})
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-100 text-gray-500 uppercase text-[10px] font-bold">
              <tr>
                <th className="p-3">Disputa / Pedido</th>
                <th className="p-3">Comprador</th>
                <th className="p-3">Produto</th>
                <th className="p-3">Valor Retido</th>
                <th className="p-3">Prazo Resposta</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 font-medium">
              {disputesList.map(item => (
                <tr key={item.id} className="hover:bg-gray-50 transition">
                  <td className="p-3">
                    <p className="font-bold text-gray-900">{item.id}</p>
                    <p className="text-[10px] text-gray-400">{item.orderId}</p>
                  </td>
                  <td className="p-3 font-bold text-gray-800">{item.buyerName}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2 max-w-xs">
                      <img src={item.productImage} alt="" className="w-8 h-8 rounded border object-cover shrink-0" />
                      <span className="truncate text-gray-800">{item.productTitle}</span>
                    </div>
                  </td>
                  <td className="p-3 font-black text-red-600">
                    {item.currency} {item.retainedAmount.toLocaleString()}
                  </td>
                  <td className="p-3 text-amber-700 font-bold flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> {item.responseDeadline}
                  </td>
                  <td className="p-3">
                    <span className="bg-amber-100 text-amber-900 font-extrabold text-[10px] px-2.5 py-1 rounded-full uppercase border border-amber-200">
                      {item.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => setSelectedDispute(item)}
                      className="bg-red-600 text-white font-bold px-3 py-1.5 rounded-lg hover:bg-red-700 transition"
                    >
                      Mediar Disputa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dispute Modal */}
      {selectedDispute && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6 border border-gray-200 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 pb-4">
              <div>
                <h3 className="text-lg font-black text-gray-900">Mediação de Disputa #{selectedDispute.id}</h3>
                <p className="text-xs text-gray-500">Mediador Oficial: {selectedDispute.mediator}</p>
              </div>
              <button onClick={() => setSelectedDispute(null)} className="p-1 hover:bg-gray-100 rounded-full">
                <XCircle className="w-6 h-6 text-gray-400" />
              </button>
            </div>

            {/* Chat Thread */}
            <div className="space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-200 max-h-60 overflow-y-auto">
              <h4 className="text-xs font-black text-gray-500 uppercase">Histórico de Mensagens</h4>
              {selectedDispute.messages.map((m, idx) => (
                <div key={idx} className={`p-3 rounded-lg text-xs space-y-1 ${
                  m.sender === 'seller' ? 'bg-emerald-50 border border-emerald-200 ml-8 text-emerald-950' : 'bg-white border border-gray-200 mr-8 text-gray-900'
                }`}>
                  <div className="flex items-center justify-between font-bold">
                    <span>{m.name}</span>
                    <span className="text-[10px] text-gray-400">{m.date}</span>
                  </div>
                  <p>{m.text}</p>
                </div>
              ))}
            </div>

            {/* Reply Input */}
            <div className="space-y-2">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Escreva sua resposta e argumentos com detalhes para a mediação..."
                className="w-full p-3 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500"
                rows={3}
              />
              <div className="flex justify-between items-center">
                <button
                  onClick={() => showToast('Comprovante técnico anexado à disputa')}
                  className="text-xs text-gray-600 hover:text-emerald-700 font-bold flex items-center gap-1"
                >
                  <Paperclip className="w-4 h-4" /> Anexar Prova / Nota Fiscal
                </button>
                <button
                  onClick={handleSendReply}
                  className="bg-emerald-600 text-white font-bold text-xs px-4 py-2 rounded-lg hover:bg-emerald-700 flex items-center gap-1"
                >
                  <Send className="w-4 h-4" /> Enviar Resposta
                </button>
              </div>
            </div>

            {/* Actions Bar */}
            <div className="pt-4 border-t border-gray-200 flex flex-wrap gap-2 justify-end">
              <button
                onClick={() => handleAction(selectedDispute.id, 'Propor Solução Amigável', 'seller_responded')}
                className="bg-blue-600 text-white font-bold text-xs px-4 py-2 rounded-lg hover:bg-blue-700 transition"
              >
                Propor Solução
              </button>

              <button
                onClick={() => handleAction(selectedDispute.id, 'Aceitar Reembolso', 'resolved_refunded')}
                className="bg-amber-600 text-white font-bold text-xs px-4 py-2 rounded-lg hover:bg-amber-700 transition"
              >
                Aceitar Reembolso
              </button>

              <button
                onClick={() => handleAction(selectedDispute.id, 'Recorrer à Decisão Final', 'under_admin_review')}
                className="bg-purple-600 text-white font-bold text-xs px-4 py-2 rounded-lg hover:bg-purple-700 transition"
              >
                Solicitar Arbitragem Nusali
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
