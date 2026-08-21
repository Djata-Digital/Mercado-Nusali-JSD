import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Send, Bot, User } from 'lucide-react';
import { useProducts } from '../hooks/useProducts';
import { NusaliLogo } from './NusaliLogo';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

export const AIAssistantModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { data: products = [] } = useProducts();
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'm1',
      sender: 'assistant',
      text: 'Olá! Sou o Nusali Assistente, seu consultor pessoal de compras no Mercado Nusali. 💛\n\nComo posso ajudar você hoje? Posso sugerir as melhores ofertas, comparar smartphones, explicar o frete FULL ou indicar presentes!',
      timestamp: 'Agora',
    },
  ]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-5 right-5 z-40 bg-gradient-to-r from-blue-900 via-indigo-900 to-emerald-900 text-white font-bold px-4 py-2.5 rounded-full shadow-2xl hover:scale-105 transition flex items-center gap-2 text-xs border border-blue-400 animate-bounce cursor-pointer"
        title="Nusali AI Assistant"
      >
        <NusaliLogo variant="emblem" size={20} />
        <span>Nusali AI</span>
      </button>
    );
  }


  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsgText = input.trim();
    const userMsg: Message = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: userMsgText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/gemini/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userMsgText,
          currentProducts: products.map((p) => ({
            id: p.id,
            title: p.title,
            price: p.price,
            brand: p.brand,
            rating: p.rating,
            freeShipping: p.shipping?.freeShipping ?? false,
            full: p.shipping?.fullFulfilled ?? false,
          })),
        }),
      });

      const data = await response.json();
      const botMsg: Message = {
        id: `b-${Date.now()}`,
        sender: 'assistant',
        text: data.reply || 'Desculpe, não consegui entender a pergunta no momento.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          id: `b-${Date.now()}`,
          sender: 'assistant',
          text: 'Tive um pequeno problema de conexão com a IA, mas você pode navegar normalmente pelas categorias e ofertas do dia!',
          timestamp: 'Agora',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-fadeIn">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl h-[580px] flex flex-col overflow-hidden border border-gray-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-emerald-900 text-white p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1 bg-white rounded-full shadow-xs">
              <NusaliLogo variant="emblem" size={28} />
            </div>
            <div>
              <h3 className="font-extrabold text-base tracking-tight leading-none">Nusali Assistente</h3>
              <p className="text-[11px] text-blue-200 font-medium mt-0.5">
                Inteligência Artificial Oficial do Mercado Nusali
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsOpen(false)}
            className="text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Suggestion Chips */}
        <div className="bg-gray-50 border-b border-gray-200 p-2.5 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0 text-xs">
          <button
            onClick={() => setInput('Qual o melhor celular para fotos?')}
            className="px-2.5 py-1 bg-white border border-gray-300 rounded-full text-gray-700 hover:border-purple-600 hover:text-purple-700 font-medium shrink-0 transition"
          >
            📱 Melhor celular p/ fotos
          </button>
          <button
            onClick={() => setInput('Quais produtos têm frete grátis FULL?')}
            className="px-2.5 py-1 bg-white border border-gray-300 rounded-full text-gray-700 hover:border-purple-600 hover:text-purple-700 font-medium shrink-0 transition"
          >
            ⚡ Ofertas Frete Grátis
          </button>
          <button
            onClick={() => setInput('Como funciona a devolução grátis?')}
            className="px-2.5 py-1 bg-white border border-gray-300 rounded-full text-gray-700 hover:border-purple-600 hover:text-purple-700 font-medium shrink-0 transition"
          >
            🛡️ Dúvidas de garantia
          </button>
        </div>

        {/* Chat Body */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-gray-50/50">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start gap-2.5 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                  msg.sender === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-purple-600 text-yellow-300 font-bold'
                }`}
              >
                {msg.sender === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              <div
                className={`p-3.5 rounded-2xl max-w-[85%] text-xs leading-relaxed space-y-1 ${
                  msg.sender === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-none'
                    : 'bg-white border border-gray-200 text-gray-800 shadow-xs rounded-tl-none whitespace-pre-line'
                }`}
              >
                <p>{msg.text}</p>
                <span
                  className={`text-[9px] block text-right font-medium ${
                    msg.sender === 'user' ? 'text-blue-100' : 'text-gray-400'
                  }`}
                >
                  {msg.timestamp}
                </span>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-purple-700 font-semibold bg-purple-50 p-3 rounded-xl border border-purple-100 w-fit">
              <Sparkles className="w-4 h-4 animate-spin text-purple-600" />
              <span>O Nusali Assistente está analisando o catálogo...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Chat Footer */}
        <form onSubmit={handleSend} className="p-3 bg-white border-t border-gray-200 flex gap-2 shrink-0">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Digite sua dúvida ou produto desejado..."
            className="flex-1 px-4 py-2.5 text-xs border border-gray-300 rounded-full focus:outline-hidden focus:ring-2 focus:ring-purple-500"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-purple-600 hover:bg-purple-700 text-white p-2.5 rounded-full shadow-md transition disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
