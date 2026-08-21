import React, { useState } from 'react';
import { Mail, Send, Paperclip, Search, User } from 'lucide-react';

interface SellerMessagesProps {
  showToast: (msg: string) => void;
}

export const SellerMessages: React.FC<SellerMessagesProps> = ({ showToast }) => {
  const [threads, setThreads] = useState<any[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');

  const activeThread = threads.find(t => t.id === activeThreadId) || threads[0];

  const handleSendMessage = () => {
    if (!messageInput.trim()) return;
    const newChatMsg = {
      sender: 'seller' as const,
      text: messageInput.trim(),
      date: 'Agora'
    };

    setThreads(prev => prev.map(t => t.id === activeThreadId ? {
      ...t,
      lastMessage: messageInput.trim(),
      chat: [...t.chat, newChatMsg]
    } : t));

    setMessageInput('');
    showToast('Mensagem enviada ao comprador.');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Mail className="w-6 h-6 text-emerald-600" />
            Mensagens Diretas pós-Venda
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Comunicação direta e rápida com seus compradores para alinhamento de entregas.
          </p>
        </div>
      </div>

      {threads.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
          <Mail className="w-12 h-12 mx-auto mb-3 text-gray-300 stroke-1" />
          <p className="font-bold text-sm text-gray-600">Nenhuma conversa direta aberta com compradores.</p>
          <p className="text-xs text-gray-400 mt-1">As mensagens enviadas por compradores em relação a pedidos aparecerão aqui em tempo real.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs grid grid-cols-1 md:grid-cols-3 overflow-hidden min-h-[450px]">
        {/* Threads List */}
        <div className="border-r border-gray-200 overflow-y-auto">
          <div className="p-3 border-b border-gray-100 bg-gray-50">
            <input
              type="text"
              placeholder="Buscar conversas..."
              className="w-full p-2 border border-gray-300 rounded-lg text-xs"
            />
          </div>
          <div className="divide-y divide-gray-100">
            {threads.map(t => (
              <div
                key={t.id}
                onClick={() => setActiveThreadId(t.id)}
                className={`p-3.5 cursor-pointer transition ${
                  activeThreadId === t.id ? 'bg-emerald-50 border-l-4 border-emerald-600' : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold text-xs text-gray-900">{t.buyerName}</span>
                  <span className="text-[10px] text-gray-400">{t.time}</span>
                </div>
                <p className="text-[10px] text-emerald-700 font-bold">{t.orderId}</p>
                <p className="text-xs text-gray-500 truncate mt-1">{t.lastMessage}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Chat Canvas */}
        <div className="md:col-span-2 flex flex-col justify-between bg-gray-50/50">
          {/* Header */}
          <div className="p-3 bg-white border-b border-gray-200 flex items-center justify-between">
            <div>
              <p className="font-extrabold text-xs text-gray-900">{activeThread?.buyerName}</p>
              <p className="text-[10px] text-gray-400">Referente ao Pedido #{activeThread?.orderId}</p>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="p-4 overflow-y-auto space-y-3 flex-1">
            {activeThread?.chat?.map((m: any, i: number) => (
              <div
                key={i}
                className={`max-w-xs p-3 rounded-xl text-xs space-y-1 ${
                  m.sender === 'seller' ? 'bg-emerald-600 text-white ml-auto' : 'bg-white border border-gray-200 text-gray-900 mr-auto shadow-xs'
                }`}
              >
                <p>{m.text}</p>
                <span className="text-[9px] opacity-75 block text-right">{m.date}</span>
              </div>
            ))}
          </div>

          {/* Reply Bar */}
          <div className="p-3 bg-white border-t border-gray-200 flex items-center gap-2">
            <input
              type="text"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Digite sua mensagem..."
              className="flex-1 p-2.5 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
            />
            <button
              onClick={handleSendMessage}
              className="bg-emerald-600 text-white p-2.5 rounded-xl hover:bg-emerald-700 transition"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    )}
    </div>
  );
};
