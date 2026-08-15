import React, { useState } from 'react';
import {
  Settings,
  HelpCircle,
  Sun,
  Moon,
  Globe,
  CreditCard,
  Truck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { SellerProfileData } from '../../data/mockSellerData';

interface SellerSettingsHelpProps {
  profile: SellerProfileData;
  onUpdateProfile: (p: SellerProfileData) => void;
  showToast: (msg: string) => void;
}

export const SellerSettingsHelp: React.FC<SellerSettingsHelpProps> = ({
  profile,
  onUpdateProfile,
  showToast,
}) => {
  const [vacationMode, setVacationMode] = useState(profile.vacationMode);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const handleToggleVacation = () => {
    const next = !vacationMode;
    setVacationMode(next);
    onUpdateProfile({ ...profile, vacationMode: next });
    showToast(next ? 'Modo Férias ATIVADO! Seus anúncios foram pausados temporariamente.' : 'Modo Férias DESATIVADO! Anúncios reativados.');
  };

  const faqs = [
    { q: 'Como funciona a proteção Escrow do Mercado Nusali?', a: 'Quando o comprador realiza o pagamento (via Orange Money, MTN, PIX ou Cartão), o valor fica custodiado em saldo seguro. Após a entrega do produto e confirmação do cliente, o saldo é liberado automaticamente na sua Carteira do Vendedor.' },
    { q: 'Quais são os prazos de saque para Orange Money?', a: 'Os saques para carteiras mobile Orange Money e MTN Mobile Money são processados em até 15 minutos, 24 horas por dia.' },
    { q: 'Como enviar mercadorias para os HUBs Nusali Fulfillment?', a: 'Acesse a aba "Estoque & Armazéns", clique em "Enviar Inventário para o HUB" e escolha se prefere coleta na sua loja em Bissau/Lisboa/São Paulo ou entrega direta na nossa central.' },
  ];

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Settings Section */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs space-y-6">
        <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
          <Settings className="w-6 h-6 text-emerald-700" /> Configurações Gerais da Loja
        </h1>

        {/* Vacation Mode Toggle Card */}
        <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 flex items-center justify-between gap-4 text-xs">
          <div>
            <h3 className="font-bold text-amber-900 text-sm flex items-center gap-2">
              <Sun className="w-4 h-4 text-amber-600" /> Modo Férias (Pausar Anúncios)
            </h3>
            <p className="text-amber-800 mt-0.5">
              Ao ativar o Modo Férias, todos os seus produtos ficarão pausados para compra sem perder relevância nas pesquisas.
            </p>
          </div>

          <button
            onClick={handleToggleVacation}
            className={`px-4 py-2 rounded-xl font-bold transition text-xs shrink-0 ${
              vacationMode ? 'bg-amber-600 text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
            }`}
          >
            {vacationMode ? 'Ativo (Loja em Férias)' : 'Ativar Modo Férias'}
          </button>
        </div>
      </div>

      {/* Seller FAQ Section */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs space-y-4 text-xs">
        <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-emerald-700" /> Perguntas Frequentes & Suporte ao Vendedor
        </h2>

        <div className="space-y-2">
          {faqs.map((f, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div key={idx} className="border border-gray-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="w-full p-3.5 bg-gray-50 hover:bg-gray-100/80 font-bold text-gray-900 text-left flex items-center justify-between transition"
                >
                  <span>{f.q}</span>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                </button>
                {isOpen && (
                  <div className="p-3.5 bg-white text-gray-700 font-medium border-t border-gray-100">
                    {f.a}
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
