import React from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from '../components/Header';
import { AIAssistantModal } from '../components/AIAssistantModal';
import { NusaliLogo } from '../components/NusaliLogo';
import { usePreferences } from '../context/PreferencesContext';
import { CheckCircle2, ShieldCheck, Lock, Truck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const PublicLayout: React.FC = () => {
  const { toastMessage } = usePreferences();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col font-sans text-gray-900 antialiased selection:bg-yellow-300">
      <Header />

      <main className="flex-1 pb-12">
        <Outlet />
      </main>

      <AIAssistantModal />

      {toastMessage && (
        <div className="fixed bottom-20 right-4 z-50 bg-gray-900 text-white px-4 py-3 rounded-lg shadow-2xl flex items-center gap-2.5 text-xs font-bold border border-gray-700 animate-fadeIn transition transform">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      <footer className="bg-white border-t border-gray-200 mt-auto text-xs text-gray-600">
        <div className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="space-y-3">
            <NusaliLogo size="md" variant="horizontal" />
            <p className="text-xs leading-relaxed text-gray-500">
              O marketplace internacional conectando Guiné-Bissau, Brasil, Portugal e África Ocidental. Produtos garantidos com Proteção Escrow e logística cross-border.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-gray-900 text-sm">Plataforma Internacional</h4>
            <ul className="space-y-1">
              <li>
                <button onClick={() => navigate('/stores')} className="hover:text-emerald-700 font-medium">
                  Lojas Oficiais
                </button>
              </li>
              <li>
                <button onClick={() => navigate('/seller/kyc')} className="hover:text-emerald-700 font-medium">
                  Verificação de Vendedores (KYC)
                </button>
              </li>
              <li>
                <button onClick={() => navigate('/disputes')} className="hover:text-emerald-700 font-medium">
                  Disputas & Proteção Escrow
                </button>
              </li>
              <li>
                <button onClick={() => navigate('/admin')} className="hover:text-emerald-700 font-medium">
                  Painel Administrativo
                </button>
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-gray-900 text-sm">Segurança e Pagamentos</h4>
            <ul className="space-y-1">
              <li className="flex items-center gap-1.5 text-gray-700 font-medium">
                <ShieldCheck className="w-4 h-4 text-emerald-600" /> Selo Vendedor Verificado
              </li>
              <li className="flex items-center gap-1.5 text-gray-700 font-medium">
                <Lock className="w-4 h-4 text-emerald-600" /> Retenção de Custódia Escrow
              </li>
              <li className="flex items-center gap-1.5 text-gray-700 font-medium">
                <Truck className="w-4 h-4 text-emerald-600" /> Logistics HUB Bissau / Lisboa / SP
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-gray-900 text-sm">Atendimento Nusali AI</h4>
            <p className="text-gray-500">
              Precisa de suporte em Bissau ou no exterior? Utilize o assistente de inteligência artificial Nusali AI disponível 24h.
            </p>
          </div>
        </div>

        <div className="bg-gray-100 py-4 text-center border-t border-gray-200 text-[11px] text-gray-500">
          <p>© 2026 Mercado Nusali - Plataforma de Marketplace Internacional. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
};
