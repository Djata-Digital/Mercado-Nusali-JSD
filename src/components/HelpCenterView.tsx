import React, { useState } from 'react';
import {
  HelpCircle,
  Search,
  UserPlus,
  Truck,
  CreditCard,
  Store,
  UserCheck,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  FileText,
  PhoneCall,
  Sparkles,
} from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext';
import { SHOW_NUSALI_AI } from '../config/features';
import { BuyerNavHeader } from './BuyerNavHeader';

export const HelpCenterView: React.FC = () => {
  const { showToast } = usePreferences();
  const setIsAiAssistantOpen = (open: boolean) => {};

  const [searchTerm, setSearchTerm] = useState('');
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const faqs = [
    {
      q: 'Quais moedas e métodos de pagamento são aceitos no meu país?',
      a: 'Na Guiné-Bissau, as compras online ainda não estão liberadas: estamos preparando as opções de entrega e pagamento. Você já pode criar sua conta, explorar os produtos e adicionar itens ao carrinho. Vendedores já podem se cadastrar e publicar seus produtos.',
    },
    {
      q: 'Como funciona a entrega internacional e taxas aduaneiras?',
      a: 'Nossos vendedores cadastram produtos com cálculo automático de impostos de importação quando aplicável. Todos os envios acompanham código de rastreamento internacional pela rede Nusali Express e parceiros locais.',
    },
  ];

  const filteredFaqs = faqs.filter(f =>
    f.q.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.a.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-fadeIn">
      <BuyerNavHeader />

      {/* Hero Header */}
      <div className="bg-gradient-to-r from-blue-950 via-emerald-900 to-teal-900 text-white rounded-2xl p-8 sm:p-12 shadow-xl mb-8 text-center relative overflow-hidden">
        <div className="relative z-10 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-yellow-400 text-blue-950 px-3 py-1 rounded-full text-xs font-black uppercase mb-3">
            <HelpCircle className="w-3.5 h-3.5" /> Suporte & Atendimento Nusali 24/7
          </div>
          <h1 className="text-3xl sm:text-4xl font-black mb-3">Como podemos ajudar você hoje?</h1>
          <p className="text-gray-200 text-xs sm:text-sm mb-6">
            Pesquise suas dúvidas sobre cadastro e produtos{SHOW_NUSALI_AI ? ' ou fale com a nossa IA' : ''}.
          </p>

          <div className="relative max-w-lg mx-auto">
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Digite sua dúvida (ex: cadastro, produtos, entrega)..."
              className="w-full pl-10 pr-4 py-3 bg-white text-gray-900 placeholder-gray-400 rounded-xl text-xs sm:text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-yellow-400 shadow-md"
            />
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-3.5" />
          </div>
        </div>
      </div>

      {/* Topic Cards */}
      <div className={`grid grid-cols-2 ${SHOW_NUSALI_AI ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-4 mb-8`}>
        {SHOW_NUSALI_AI && (
          <div
            onClick={() => setIsAiAssistantOpen(true)}
            className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs hover:border-emerald-500 transition cursor-pointer group text-center"
          >
            <div className="w-12 h-12 bg-purple-100 text-purple-900 rounded-2xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition">
              <Sparkles className="w-6 h-6 text-purple-700" />
            </div>
            <h3 className="font-bold text-xs text-gray-900 mb-1">Nusali AI Assistant</h3>
            <p className="text-[10px] text-gray-500">Respostas instantâneas por IA</p>
          </div>
        )}

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs hover:border-emerald-500 transition cursor-pointer group text-center">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-800 rounded-2xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition">
            <UserPlus className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-xs text-gray-900 mb-1">Conta e Cadastro</h3>
          <p className="text-[10px] text-gray-500">Crie sua conta e explore os produtos</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs hover:border-emerald-500 transition cursor-pointer group text-center">
          <div className="w-12 h-12 bg-blue-100 text-blue-900 rounded-2xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition">
            <Truck className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-xs text-gray-900 mb-1">Envios & Rastreio</h3>
          <p className="text-[10px] text-gray-500">Prazo e frete Nusali Express</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs hover:border-emerald-500 transition cursor-pointer group text-center">
          <div className="w-12 h-12 bg-amber-100 text-amber-900 rounded-2xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition">
            <Store className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-xs text-gray-900 mb-1">Vendedores</h3>
          <p className="text-[10px] text-gray-500">Cadastre-se e publique seus produtos</p>
        </div>
      </div>

      {/* Accordion FAQ */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs">
        <h2 className="text-lg font-bold text-gray-900 mb-6 pb-3 border-b border-gray-100">
          Perguntas Frequentes (FAQ)
        </h2>

        <div className="space-y-4">
          {filteredFaqs.map((faq, idx) => {
            const isOpen = openFaqIndex === idx;
            return (
              <div key={idx} className="border border-gray-200 rounded-xl overflow-hidden transition">
                <button
                  onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                  className="w-full p-4 bg-gray-50 hover:bg-gray-100 text-left font-bold text-xs text-gray-900 flex items-center justify-between gap-4 transition"
                >
                  <span>{faq.q}</span>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-emerald-700 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
                </button>

                {isOpen && (
                  <div className="p-4 bg-white text-xs text-gray-600 leading-relaxed border-t border-gray-100">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
