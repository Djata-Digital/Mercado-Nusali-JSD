import React, { useState } from 'react';
import { MessageSquare, Sparkles, Send, CheckCircle2, Clock } from 'lucide-react';

interface SellerQuestionsProps {
  showToast: (msg: string) => void;
  questions?: any[];
  onAnswerQuestion?: (id: string, text: string) => Promise<void>;
}

export const SellerQuestions: React.FC<SellerQuestionsProps> = ({
  showToast,
  questions = [],
  onAnswerQuestion
}) => {
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [replyInput, setReplyInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAiSuggest = (questionText: string) => {
    let suggestion = 'Olá! Obrigado pelo interesse. Sim, o produto é 100% original, possui garantia oficial da loja e envio imediato via Nusali Logística.';
    if (questionText.toLowerCase().includes('bateria') || questionText.toLowerCase().includes('lítio')) {
      suggestion = 'Olá! Sim, este modelo possui comunicação CAN/RS485 nativa com baterias de Lítio Pylontech e Dyness.';
    }
    setReplyInput(suggestion);
    showToast('Sugestão gerada pelo Nusali Assistente IA!');
  };

  // FASE D17-C4.3 — antes, esta função atualizava o estado local como
  // "respondida" e mostrava sucesso incondicionalmente, mesmo se
  // onAnswerQuestion (POST real) falhasse. Agora aguarda o resultado real:
  // só limpa o formulário e mostra sucesso se a chamada realmente resolver;
  // em caso de erro, mantém a pergunta pendente e o formulário aberto para
  // nova tentativa, com o texto já digitado preservado.
  const handleSendAnswer = async (id: string) => {
    const text = replyInput.trim();
    if (!text || isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (onAnswerQuestion) {
        await onAnswerQuestion(id, text);
      }
      setAnsweringId(null);
      setReplyInput('');
      showToast('Resposta enviada ao cliente com sucesso!');
    } catch (err: any) {
      showToast(err?.message || 'Não foi possível enviar a resposta. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
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
        {questions.length === 0 ? (
          <div className="bg-white p-12 rounded-2xl border border-gray-200 text-center text-gray-500 font-bold">
            Nenhuma pergunta recebida
          </div>
        ) : (
          questions.map(q => {
            // Contrato real (GET /seller/questions): status é 'published'
            // (aguardando resposta) ou 'answered' (respondida) — nunca
            // 'pending'. Fail-safe: só é tratada como respondida quando o
            // status é literalmente 'answered'; qualquer outro valor
            // (incluindo um status futuro desconhecido) cai em "pendente"
            // visualmente, e o botão de responder só aparece para
            // 'published' — nunca para um status que não reconhecemos.
            const isAnswered = q.status === 'answered';
            const canAnswer = q.status === 'published';
            return (
          <div key={q.id} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-3">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
              <img src={q.productImage} alt="" className="w-10 h-10 rounded-lg object-cover border" />
              <div>
                <p className="text-xs font-black text-gray-900">{q.productTitle}</p>
                <p className="text-[10px] text-gray-400">
                  Pergunta do cliente • {q.createdAt ? new Date(q.createdAt).toLocaleDateString('pt-BR') : ''}
                </p>
              </div>
              <span className={`ml-auto text-[10px] font-black px-2.5 py-1 rounded-full uppercase ${
                isAnswered ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'
              }`}>
                {isAnswered ? 'Respondida' : 'Pendente'}
              </span>
            </div>

            <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 text-xs font-medium text-gray-900">
              "{q.question}"
            </div>

            {q.answer && (
              <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-200 text-xs text-emerald-950 font-medium">
                <span className="font-extrabold text-emerald-900 block text-[10px] uppercase">Sua Resposta:</span>
                {q.answer}
              </div>
            )}

            {canAnswer && answeringId !== q.id && (
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
                  disabled={isSubmitting}
                />
                <div className="flex justify-between items-center">
                  <button
                    onClick={() => handleAiSuggest(q.question)}
                    className="bg-purple-100 text-purple-900 font-extrabold text-xs px-3 py-1.5 rounded-lg hover:bg-purple-200 flex items-center gap-1"
                    disabled={isSubmitting}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-purple-700" /> Gerar com IA
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAnsweringId(null)}
                      className="text-xs text-gray-500 font-bold px-3 py-1.5"
                      disabled={isSubmitting}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => handleSendAnswer(q.id)}
                      className="bg-emerald-600 text-white font-bold text-xs px-4 py-1.5 rounded-lg hover:bg-emerald-700 flex items-center gap-1 disabled:opacity-60"
                      disabled={isSubmitting}
                    >
                      <Send className="w-3.5 h-3.5" /> {isSubmitting ? 'Enviando...' : 'Enviar'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
            );
          })
        )}
      </div>
    </div>
  );
};
