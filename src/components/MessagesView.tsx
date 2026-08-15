import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Send,
  Paperclip,
  CheckCheck,
  Building2,
  ShieldCheck,
  Bot,
  User,
  Search,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext';
import { BuyerNavHeader } from './BuyerNavHeader';
import { BuyerService, BuyerChatConversation } from '../services/buyerService';

export const MessagesView: React.FC = () => {
  const { showToast } = usePreferences();

  const [chats, setChats] = useState<BuyerChatConversation[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string>('chat-1');
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const loadChats = async () => {
    setIsLoading(true);
    try {
      const res = await BuyerService.getMessages();
      if (res.success && Array.isArray(res.data)) {
        setChats(res.data);
        if (res.data.length > 0 && !selectedChatId) {
          setSelectedChatId(res.data[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load chats:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadChats();
  }, []);

  const activeChat = chats.find(c => c.id === selectedChatId) || chats[0];

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeChat) return;

    setIsSending(true);
    const messageContent = inputText.trim();
    setInputText('');

    try {
      const res = await BuyerService.sendMessage(activeChat.id, messageContent);
      if (res.success && res.data) {
        setChats(prev => prev.map(chat => {
          if (chat.id === activeChat.id) {
            return {
              ...chat,
              lastMessage: messageContent,
              lastTime: 'Agora',
              messages: [...(chat.messages || []), res.data],
            };
          }
          return chat;
        }));
      }
    } catch {
      showToast('Erro ao enviar mensagem.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-fadeIn">
      <BuyerNavHeader />

      <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs overflow-hidden grid grid-cols-1 lg:grid-cols-3 h-[680px]">
        {/* Left Side: Conversation List */}
        <div className="border-r border-gray-200 flex flex-col h-full bg-gray-50/50">
          <div className="p-4 border-b border-gray-200 bg-white">
            <h2 className="text-base font-black text-gray-900 flex items-center gap-2 mb-3">
              <MessageSquare className="w-5 h-5 text-emerald-600" /> Mensagens & Atendimento
            </h2>
            <div className="relative">
              <input
                type="text"
                placeholder="Buscar conversas..."
                className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {chats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => setSelectedChatId(chat.id)}
                className={`p-4 flex items-start gap-3 cursor-pointer transition ${
                  selectedChatId === chat.id
                    ? 'bg-emerald-50/60 border-l-4 border-emerald-600'
                    : 'hover:bg-gray-100/70 bg-white'
                }`}
              >
                <div className="relative shrink-0">
                  <img
                    src={chat.avatar}
                    alt={chat.name}
                    className="w-11 h-11 rounded-xl object-cover border border-gray-200"
                  />
                  {chat.isOfficial && (
                    <div className="absolute -bottom-1 -right-1 bg-blue-600 text-white rounded-full p-0.5" title="Loja Oficial">
                      <ShieldCheck className="w-3 h-3" />
                    </div>
                  )}
                  {chat.isAi && (
                    <div className="absolute -bottom-1 -right-1 bg-purple-600 text-white rounded-full p-0.5" title="Assistente Virtual AI">
                      <Bot className="w-3 h-3" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <h3 className="text-xs font-bold text-gray-900 truncate">{chat.name}</h3>
                    <span className="text-[10px] text-gray-400 font-medium shrink-0">{chat.lastTime}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 truncate">{chat.lastMessage}</p>
                </div>

                {chat.unreadCount ? (
                  <span className="bg-emerald-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full shrink-0">
                    {chat.unreadCount}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Active Chat View */}
        {activeChat ? (
          <div className="lg:col-span-2 flex flex-col h-full bg-white">
            {/* Active Header */}
            <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-white">
              <div className="flex items-center gap-3">
                <img
                  src={activeChat.avatar}
                  alt={activeChat.name}
                  className="w-10 h-10 rounded-xl object-cover border border-gray-200"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-xs font-black text-gray-900">{activeChat.name}</h3>
                    {activeChat.isOfficial && (
                      <span className="bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-0.2 rounded-md border border-blue-200">
                        Vendedor Oficial
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Online agora
                  </p>
                </div>
              </div>
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50/30">
              <div className="text-center my-2">
                <span className="bg-gray-100 text-gray-500 text-[10px] font-bold px-3 py-1 rounded-full">
                  As mensagens deste chat são criptografadas e protegidas pela política Nusali
                </span>
              </div>

              {activeChat.messages && activeChat.messages.map((m: any) => (
                <div
                  key={m.id}
                  className={`flex ${m.sender === 'buyer' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-md rounded-2xl p-3.5 text-xs shadow-2xs ${
                      m.sender === 'buyer'
                        ? 'bg-emerald-600 text-white rounded-tr-xs'
                        : m.sender === 'ai'
                        ? 'bg-purple-900 text-purple-50 border border-purple-800 rounded-tl-xs'
                        : 'bg-white text-gray-800 border border-gray-200 rounded-tl-xs'
                    }`}
                  >
                    <p className="leading-relaxed">{m.text}</p>
                    <div
                      className={`text-[9px] mt-1.5 flex items-center justify-end gap-1 font-semibold ${
                        m.sender === 'buyer' ? 'text-emerald-100' : 'text-gray-400'
                      }`}
                    >
                      <span>{m.time}</span>
                      {m.sender === 'buyer' && <CheckCheck className="w-3 h-3 text-emerald-200" />}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Input Message Area */}
            <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200 flex items-center gap-2 bg-white">
              <input
                type="text"
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                placeholder="Escreva sua mensagem para o vendedor..."
                className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="submit"
                disabled={isSending || !inputText.trim()}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white p-2.5 rounded-xl transition cursor-pointer flex items-center justify-center shrink-0"
              >
                {isSending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>
          </div>
        ) : (
          <div className="lg:col-span-2 flex items-center justify-center text-gray-400 p-8">
            <p className="text-xs">Selecione uma conversa para visualizar o histórico de mensagens.</p>
          </div>
        )}
      </div>
    </div>
  );
};
