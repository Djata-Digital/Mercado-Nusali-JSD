import React, { useState } from 'react';
import {
  HelpCircle,
  Search,
  ShieldCheck,
  Truck,
  CreditCard,
  RotateCcw,
  UserCheck,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  FileText,
  PhoneCall,
  Sparkles,
} from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext';
import { BuyerNavHeader } from './BuyerNavHeader';

export const HelpCenterView: React.FC = () => {
  const { showToast } = usePreferences();
  const setIsAiAssistantOpen = (open: boolean) => {};

  const [searchTerm, setSearchTerm] = useState('');
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const faqs = [
    {
      q: 'Como funciona a Garantia de Proteção Escrow no Mercado Nusali?',
      a: 'Quando você realiza uma compra, o pagamento fica mantido em retenção custodiada com total segurança pelo sistema Escrow. O valor só é liberado para o vendedor após você confirmar o recebimento do produto em mãos e atestar sua qualidade.',
    },
    {
      q: 'Quais moedas e métodos de pagamento são aceitos no meu país?',
      a: 'O Mercado Nusali aceita moedas locais e regionais como Francos CFA (XOF), Reais (BRL), Euros (EUR), Meticais (MZN) e Escudos (CVE). Os métodos incluem Orange Money, MTN Mobile Money, PIX, MB WAY e Cartões Visa/Mastercard.',
    },
    {
      q: 'Como funciona a entrega internacional e taxas aduaneiras?',
      a: 'Nossos vendedores cadastram produtos com cálculo automático de impostos de importação quando aplicável. Todos os envios acompanham código de rastreamento internacional pela rede Nusali Express e parceiros locais.',
    },
    {
      q: 'O que fazer se o produto chegar com defeito ou não for entregue?',
      a: 'Você pode abrir uma Disputa na aba "Minhas Compras" a qualquer momento dentro do prazo de garantia. O valor permanece retido e nossa equipe administrativa analisa as evidências para emitir o reembolso integral via Nusali Pay.',
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
            Pesquise suas dúvidas sobre entregas, pagamentos Orange Money/PIX, garantia Escrow ou fale com a nossa IA.
          </p>

          <div className="relative max-w-lg mx-auto">
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Digite sua dúvida (ex: reembolso, rastreio, Orange Money)..."
              className="w-full pl-10 pr-4 py-3 bg-white text-gray-900 placeholder-gray-400 rounded-xl text-xs sm:text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-yellow-400 shadow-md"
            />
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-3.5" />
          </div>
        </div>
      </div>

      {/* Topic Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
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

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs hover:border-emerald-500 transition cursor-pointer group text-center">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-800 rounded-2xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-xs text-gray-900 mb-1">Proteção Escrow</h3>
          <p className="text-[10px] text-gray-500">Garantia do dinheiro retido</p>
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
            <RotateCcw className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-xs text-gray-900 mb-1">Devoluções</h3>
          <p className="text-[10px] text-gray-500">Trocas e estorno de valores</p>
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
