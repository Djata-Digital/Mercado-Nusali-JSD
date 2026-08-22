import React, { useState } from 'react';
import { HelpCircle, BookOpen, MessageSquare, ChevronDown, Send, FileText, PhoneCall } from 'lucide-react';

interface SellerHelpCenterProps {
  showToast: (msg: string) => void;
}

export const SellerHelpCenter: React.FC<SellerHelpCenterProps> = ({ showToast }) => {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketMsg, setTicketMsg] = useState('');

  const faqs = [
    { q: 'Como funcionam os saques para contas e carteiras mobile?', a: 'Os saques são solicitados diretamente pela sua Carteira do Vendedor. O prazo e a tarifa aplicável são exibidos antes da confirmação do saque conforme o provedor e país selecionados.' },
    { q: 'Qual o prazo para liberação do pagamento no saldo do vendedor?', a: 'O valor da venda fica em custódia (Escrow) até a confirmação de entrega pela Nusali Logística ou até 48 horas após a recepção pelo comprador.' },
    { q: 'Como cadastrar produtos para venda internacional (Cross-Border)?', a: 'No cadastro de produto, ative a chave "Venda Internacional CPLP" para disponibilizar seu anúncio no Brasil, Portugal, Angola e Guiné-Bissau com conversão automática de moedas.' },
  ];

  const handleCreateTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketSubject.trim()) return;
    showToast(`Chamado de suporte "${ticketSubject}" aberto sob o protocolo #${Math.floor(100000 + Math.random() * 900000)}.`);
    setTicketSubject('');
    setTicketMsg('');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <HelpCircle className="w-6 h-6 text-emerald-600" />
            Central de Ajuda & Suporte ao Vendedor
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Manuais de operação, FAQs de logística cross-border e atendimento prioritário da equipe Nusali.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* FAQ Section */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-4">
          <h3 className="text-sm font-black text-gray-900 uppercase flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-emerald-600" /> Perguntas Frequentes (FAQ)
          </h3>

          <div className="space-y-2">
            {faqs.map((f, i) => (
              <div key={i} className="border border-gray-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full p-3.5 text-left font-bold text-xs text-gray-900 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition"
                >
                  <span>{f.q}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && (
                  <div className="p-3.5 bg-white text-xs text-gray-600 border-t border-gray-100">
                    {f.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Support Ticket Form */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-4">
          <h3 className="text-sm font-black text-gray-900 uppercase flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-emerald-600" /> Abrir Chamado com Especialista
          </h3>

          <form onSubmit={handleCreateTicket} className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-700">Assunto do Atendimento:</label>
              <input
                type="text"
                required
                value={ticketSubject}
                onChange={(e) => setTicketSubject(e.target.value)}
                placeholder="Ex: Dúvida sobre liberação de saldo no Escrow"
                className="w-full p-2.5 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-700">Mensagem Detalhada:</label>
              <textarea
                required
                value={ticketMsg}
                onChange={(e) => setTicketMsg(e.target.value)}
                placeholder="Descreva seu problema com números de pedido se aplicável..."
                className="w-full p-2.5 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                rows={4}
              />
            </div>

            <button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs py-3 rounded-xl transition flex items-center justify-center gap-1.5 shadow-md"
            >
              <Send className="w-4 h-4" /> Enviar Chamado de Suporte
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
