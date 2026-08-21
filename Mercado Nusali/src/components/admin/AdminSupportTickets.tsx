import React, { useState } from 'react';
import { LifeBuoy, MessageSquare, Clock, Send, CheckCircle2, User, AlertOctagon, X, Check } from 'lucide-react';
import { mockSupportTicketsList, SupportTicketRecord } from '../../data/mockAdminSupport';

interface AdminSupportTicketsProps {
  showToast: (msg: string) => void;
}

export const AdminSupportTickets: React.FC<AdminSupportTicketsProps> = ({ showToast }) => {
  const [tickets, setTickets] = useState<SupportTicketRecord[]>(mockSupportTicketsList);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicketRecord | null>(null);
  const [replyText, setReplyText] = useState('');

  const handleOpenTicket = (ticket: SupportTicketRecord) => {
    setSelectedTicket(ticket);
    setReplyText('');
  };

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !replyText.trim()) return;

    const newMsg = {
      id: `MSG-${Date.now()}`,
      senderName: 'Atendimento Nusali (Admin)',
      senderRole: 'Agente Suporte',
      text: replyText,
      timestamp: 'Agora mesmo'
    };

    setTickets(prev =>
      prev.map(t =>
        t.id === selectedTicket.id
          ? {
              ...t,
              status: 'resolvido',
              agentName: 'Suleimane Biai (Admin)',
              messages: [...t.messages, newMsg]
            }
          : t
      )
    );

    showToast(`Resposta enviada para o chamado ${selectedTicket.id}! Status atualizado para RESOLVIDO.`);
    setSelectedTicket(null);
    setReplyText('');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <LifeBuoy className="w-6 h-6 text-purple-600" />
            Central de Suporte & Atendimento CPLP
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Gestão de chamados de compradores, vendedores e parceiros logísticos por país.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {tickets.map(t => (
          <div key={t.id} className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4 hover:border-purple-300 transition">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-bold text-gray-400 block font-mono">Ref: {t.id} ({t.country})</span>
                <h3 className="font-extrabold text-sm text-gray-900">{t.subject}</h3>
                <p className="text-xs text-purple-700 font-bold">{t.userName} ({t.userType})</p>
              </div>

              <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${
                t.status === 'resolvido' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}>
                {t.status.toUpperCase()}
              </span>
            </div>

            <div className="bg-gray-50 p-3 rounded-xl space-y-1 text-xs border border-gray-100">
              <span className="font-bold text-gray-700 block">Última Mensagem:</span>
              <p className="text-gray-600 font-medium">"{t.messages[t.messages.length - 1].text}"</p>
            </div>

            <div className="pt-2 flex items-center justify-between text-xs border-t border-gray-100">
              <span className="text-[10px] text-gray-400">Atendente: {t.agentName || 'Não Atribuído'}</span>
              <button
                onClick={() => handleOpenTicket(t)}
                className="bg-purple-600 text-white font-extrabold text-xs px-3.5 py-1.5 rounded-xl hover:bg-purple-700 transition cursor-pointer shadow-xs"
              >
                Atender Chamado
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal Atendimento ao Chamado */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-gray-100 space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <span className="text-[10px] font-bold text-purple-700 font-mono">Chamado #{selectedTicket.id}</span>
                <h3 className="font-black text-base text-gray-900">{selectedTicket.subject}</h3>
              </div>
              <button onClick={() => setSelectedTicket(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
              {selectedTicket.messages.map((m, idx) => (
                <div key={idx} className="bg-white p-3 rounded-xl border border-gray-100 shadow-2xs space-y-1 text-xs">
                  <div className="flex justify-between items-center text-[10px]">
                    <strong className="text-purple-700">{m.senderName} ({m.senderRole})</strong>
                    <span className="text-gray-400">{m.timestamp}</span>
                  </div>
                  <p className="text-gray-800 font-medium">{m.text}</p>
                </div>
              ))}
            </div>

            <form onSubmit={handleSendReply} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Escrever Resposta Oficial do Suporte:</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Digite sua resposta..."
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setSelectedTicket(null)}
                  className="px-4 py-2 border border-gray-300 font-bold text-gray-700 rounded-xl hover:bg-gray-50"
                >
                  Fechar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-xl shadow-md flex items-center gap-1.5"
                >
                  <Send className="w-4 h-4" /> Enviar & Concluir
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
