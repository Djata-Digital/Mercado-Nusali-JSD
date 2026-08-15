import React, { useState } from 'react';
import {
  Users as UserGroup,
  MessageSquare,
  Star,
  Mail,
  Send,
  Sparkles,
  Search,
  CheckCircle2,
  Clock,
  ThumbsUp,
} from 'lucide-react';
import { SellerQuestion, SellerCustomer } from '../../data/mockSellerData';
import { countriesConfig } from '../../utils/currencyUtils';

interface SellerCustomerRelationsProps {
  questions: SellerQuestion[];
  customers: SellerCustomer[];
  onAnswerQuestion: (id: string, text: string) => void;
  showToast: (msg: string) => void;
}

export const SellerCustomerRelations: React.FC<SellerCustomerRelationsProps> = ({
  questions,
  customers,
  onAnswerQuestion,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<'questions' | 'reviews' | 'customers' | 'messages'>('questions');
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});

  const reviews = [
    { buyer: 'Mamadou Baldé', rating: 5, comment: 'Excelente produto! Chegou em Bissau no mesmo dia via Nusali Express.', product: 'Smartphone Samsung Galaxy A55' },
    { buyer: 'João Pedro Santos', rating: 5, comment: 'A castanha de caju veio fresquíssima e embalada a vácuo em Lisboa.', product: 'Castanha de Caju Torrada 1kg' },
  ];

  const handleSendReply = (questionId: string) => {
    const text = replyTexts[questionId];
    if (!text || !text.trim()) return;

    onAnswerQuestion(questionId, text);
    showToast('Resposta enviada com sucesso ao comprador!');
    setReplyTexts({ ...replyTexts, [questionId]: '' });
  };

  const handleAiSuggestReply = (q: SellerQuestion) => {
    const aiText = `Olá ${q.buyerName}! Agradecemos o interesse no produto "${q.productTitle}". O item está disponível com envio expresso imediato via Nusali Fulfillment, nota fiscal e garantia oficial. Qualquer dúvida estamos à disposição!`;
    setReplyTexts({ ...replyTexts, [q.id]: aiText });
    showToast('Sugestão de resposta gerada pela IA Gemini!');
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <UserGroup className="w-6 h-6 text-emerald-700" /> Relacionamento com Clientes & SAC
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Responda a perguntas pré-venda, acompanhe avaliações e gerencie mensagens dos compradores.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-gray-200 p-2 shadow-2xs flex items-center gap-2 text-xs font-bold overflow-x-auto">
        <button
          onClick={() => setActiveTab('questions')}
          className={`px-4 py-2 rounded-xl transition flex items-center gap-2 ${
            activeTab === 'questions' ? 'bg-emerald-600 text-white font-black' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <MessageSquare className="w-4 h-4" /> Perguntas & Respostas
        </button>

        <button
          onClick={() => setActiveTab('reviews')}
          className={`px-4 py-2 rounded-xl transition flex items-center gap-2 ${
            activeTab === 'reviews' ? 'bg-emerald-600 text-white font-black' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Star className="w-4 h-4 text-amber-500 fill-amber-500" /> Avaliações ({reviews.length})
        </button>

        <button
          onClick={() => setActiveTab('customers')}
          className={`px-4 py-2 rounded-xl transition flex items-center gap-2 ${
            activeTab === 'customers' ? 'bg-emerald-600 text-white font-black' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <UserGroup className="w-4 h-4" /> Lista de Clientes ({customers.length})
        </button>
      </div>

      {/* Questions Tab */}
      {activeTab === 'questions' && (
        <div className="space-y-4">
          {questions.map((q) => {
            const countryConf = countriesConfig[q.buyerCountry] || countriesConfig.GW;

            return (
              <div key={q.id} className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs space-y-4 text-xs">
                {/* Product Header */}
                <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
                  <img src={q.productImage} alt="" className="w-10 h-10 rounded-xl object-contain border p-0.5 bg-white" />
                  <div className="truncate">
                    <span className="font-bold text-gray-900 block truncate">{q.productTitle}</span>
                    <span className="text-[10px] text-gray-400 font-mono">
                      Perguntado por {q.buyerName} ({countryConf.flag} {countryConf.name}) • {q.questionDate}
                    </span>
                  </div>
                </div>

                {/* Question Text */}
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-gray-800 font-medium">
                  "{q.questionText}"
                </div>

                {/* Answer or Reply Form */}
                {q.status === 'answered' ? (
                  <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900 space-y-1">
                    <span className="font-bold block text-[11px] text-emerald-800">
                      Sua Resposta ({q.answerDate}):
                    </span>
                    <p>{q.answerText}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-gray-700">Responder ao Comprador</span>
                      <button
                        onClick={() => handleAiSuggestReply(q)}
                        className="bg-purple-50 text-purple-700 hover:bg-purple-100 font-bold px-2.5 py-1 rounded-lg text-[10px] flex items-center gap-1 border border-purple-200"
                      >
                        <Sparkles className="w-3 h-3 text-purple-600" /> Sugerir Resposta com IA
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={replyTexts[q.id] || ''}
                        onChange={(e) => setReplyTexts({ ...replyTexts, [q.id]: e.target.value })}
                        placeholder="Digite sua resposta em português..."
                        className="flex-1 p-2.5 border border-gray-300 rounded-xl"
                      />
                      <button
                        onClick={() => handleSendReply(q.id)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl flex items-center gap-1 shrink-0"
                      >
                        <Send className="w-3.5 h-3.5" /> Enviar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Reviews Tab */}
      {activeTab === 'reviews' && (
        <div className="space-y-4">
          {reviews.map((r, idx) => (
            <div key={idx} className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-900">{r.buyer}</span>
                <span className="flex items-center gap-1 font-bold text-amber-500">
                  {r.rating} <Star className="w-4 h-4 fill-amber-500" />
                </span>
              </div>
              <p className="text-gray-700 font-medium">"{r.comment}"</p>
              <span className="text-[10px] text-gray-400 font-mono block">Produto: {r.product}</span>
            </div>
          ))}
        </div>
      )}

      {/* Customers List Tab */}
      {activeTab === 'customers' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs space-y-4 text-xs">
          <h2 className="font-bold text-sm text-gray-900 border-b pb-3">Carteira de Clientes Recorrentes</h2>
          <div className="divide-y divide-gray-100">
            {customers.map((c) => (
              <div key={c.id} className="py-3 flex items-center justify-between">
                <div>
                  <span className="font-bold text-gray-900 block">{c.name} ({c.country})</span>
                  <span className="text-[10px] text-gray-400 font-mono">{c.email} • {c.internalNotes}</span>
                </div>
                <div className="text-right">
                  <span className="font-black text-emerald-700 block">{c.totalOrders} pedidos</span>
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {c.loyaltyTag}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
