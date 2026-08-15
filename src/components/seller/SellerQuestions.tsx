import React, { useState } from 'react';
import { MessageSquare, Sparkles, Send, CheckCircle2, Clock } from 'lucide-react';

interface SellerQuestionsProps {
  showToast: (msg: string) => void;
  questions?: any[];
  onAnswerQuestion?: (id: string, text: string) => void;
}

export const SellerQuestions: React.FC<SellerQuestionsProps> = ({
  showToast,
  questions,
  onAnswerQuestion
}) => {
  const [localQuestions, setLocalQuestions] = useState(
    questions && questions.length > 0 ? questions : [
      {
        id: 'Q-101',
        buyerName: 'Bacai Sanhá',
        productTitle: 'Inversor Solar Híbrido 5kW 48V Off-Grid Wave',
        productImage: 'https://images.unsplash.com/photo-1509391365360-2e959784a276?auto=format&fit=crop&q=80&w=300',
        questionText: 'Boa tarde, este inversor é compatível com baterias de Lítio da marca Pylontech?',
        date: 'Hoje, 14:10',
        status: 'pending',
        answerText: null
      },
      {
        id: 'Q-102',
        buyerName: 'Soraia Ramos',
        productTitle: 'Castanha de Caju Torrada Sem Sal 1kg - Exportação',
        productImage: 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&q=80&w=300',
        questionText: 'Qual a validade do lote atual de castanha enviado para o Brasil?',
        date: 'Ontem',
        status: 'answered',
        answerText: 'Olá Soraia, a validade do lote atual é de 12 meses (Maio/2027).'
      }
    ]
  );

  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [replyInput, setReplyInput] = useState('');

  const handleAiSuggest = (questionText: string) => {
    let suggestion = 'Olá! Obrigado pelo interesse. Sim, o produto é 100% original, possui garantia oficial da loja e envio imediato via Nusali Logística.';
    if (questionText.toLowerCase().includes('bateria') || questionText.toLowerCase().includes('lítio')) {
      suggestion = 'Olá! Sim, este modelo possui comunicação CAN/RS485 nativa com baterias de Lítio Pylontech e Dyness.';
    }
    setReplyInput(suggestion);
    showToast('Sugestão gerada pelo Nusali Assistente IA!');
  };

  const handleSendAnswer = (id: string) => {
    if (!replyInput.trim()) return;
    setLocalQuestions(prev => prev.map(q => q.id === id ? {
      ...q,
      status: 'answered',
      answerText: replyInput.trim()
    } : q));

    if (onAnswerQuestion) {
      onAnswerQuestion(id, replyInput.trim());
    }

    setAnsweringId(null);
    setReplyInput('');
    showToast('Resposta enviada ao cliente com sucesso!');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-emerald-600" />
            Perguntas & Respostas dos Clientes
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Responda rápido para aumentar a taxa de conversão das vendas nos seus anúncios.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {localQuestions.map(q => (
          <div key={q.id} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-3">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
              <img src={q.productImage} alt="" className="w-10 h-10 rounded-lg object-cover border" />
              <div>
                <p className="text-xs font-black text-gray-900">{q.productTitle}</p>
                <p className="text-[10px] text-gray-400">Pergunta de {q.buyerName} • {q.date}</p>
              </div>
              <span className={`ml-auto text-[10px] font-black px-2.5 py-1 rounded-full uppercase ${
                q.status === 'pending' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'
              }`}>
                {q.status === 'pending' ? 'Pendente' : 'Respondida'}
              </span>
            </div>

            <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 text-xs font-medium text-gray-900">
              "{q.questionText}"
            </div>

            {q.answerText && (
              <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-200 text-xs text-emerald-950 font-medium">
                <span className="font-extrabold text-emerald-900 block text-[10px] uppercase">Sua Resposta:</span>
                {q.answerText}
              </div>
            )}

            {q.status === 'pending' && answeringId !== q.id && (
              <button
                onClick={() => { setAnsweringId(q.id); setReplyInput(''); }}
                className="bg-emerald-600 text-white font-bold text-xs px-4 py-2 rounded-xl hover:bg-emerald-700 transition"
              >
                Responder Pergunta
              </button>
            )}

            {answeringId === q.id && (
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <textarea
                  value={replyInput}
                  onChange={(e) => setReplyInput(e.target.value)}
                  placeholder="Escreva sua resposta..."
                  className="w-full p-3 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                  rows={2}
                />
                <div className="flex justify-between items-center">
                  <button
                    onClick={() => handleAiSuggest(q.questionText)}
                    className="bg-purple-100 text-purple-900 font-extrabold text-xs px-3 py-1.5 rounded-lg hover:bg-purple-200 flex items-center gap-1"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-purple-700" /> Gerar com IA
                  </button>
                  <div className="flex gap-2">
                    <button onClick={() => setAnsweringId(null)} className="text-xs text-gray-500 font-bold px-3 py-1.5">
                      Cancelar
                    </button>
                    <button
                      onClick={() => handleSendAnswer(q.id)}
                      className="bg-emerald-600 text-white font-bold text-xs px-4 py-1.5 rounded-lg hover:bg-emerald-700 flex items-center gap-1"
                    >
                      <Send className="w-3.5 h-3.5" /> Enviar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
