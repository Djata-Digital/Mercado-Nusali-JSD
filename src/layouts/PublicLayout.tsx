import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import { Header } from '../components/Header';
import { AIAssistantModal } from '../components/AIAssistantModal';
import { MercadoNusaliLogo } from '../components/MercadoNusaliLogo';
import { usePreferences } from '../context/PreferencesContext';
import { SHOW_NUSALI_AI } from '../config/features';
import { CheckCircle2, ShieldCheck, Lock, Truck } from 'lucide-react';

export const PublicLayout: React.FC = () => {
  const { toastMessage } = usePreferences();

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col font-sans text-gray-900 antialiased selection:bg-yellow-300">
      <Header />

      <main className="flex-1 pb-12">
        <Outlet />
      </main>

      {SHOW_NUSALI_AI && <AIAssistantModal />}

      {toastMessage && (
        <div className="fixed bottom-20 right-4 z-50 bg-gray-900 text-white px-4 py-3 rounded-lg shadow-2xl flex items-center gap-2.5 text-xs font-bold border border-gray-700 animate-fadeIn transition transform">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      <footer className="bg-white border-t border-gray-200 mt-auto text-xs text-gray-600">
        <div className={`max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 ${SHOW_NUSALI_AI ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-6`}>
          <div className="space-y-3">
            <MercadoNusaliLogo height={128} />
            <p className="text-xs leading-relaxed text-gray-500">
              Marketplace de compra e venda online que conecta vendedores e compradores. Conheça as lojas e os produtos anunciados.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-gray-900 text-sm">Plataforma Internacional</h4>
            <ul className="space-y-1">
              <li>
                <Link to="/stores" className="hover:text-emerald-700 font-medium">
                  Lojas Oficiais
                </Link>
              </li>
              <li>
                <Link to="/categories" className="hover:text-emerald-700 font-medium">
                  Categorias
                </Link>
              </li>
              <li>
                <Link to="/products" className="hover:text-emerald-700 font-medium">
                  Todos os produtos
                </Link>
              </li>
              <li>
                <Link to="/help-center" className="hover:text-emerald-700 font-medium">
                  Central de Ajuda
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-gray-900 text-sm">Vendedores e Logística</h4>
            <ul className="space-y-1">
              <li className="flex items-center gap-1.5 text-gray-700 font-medium">
                <ShieldCheck className="w-4 h-4 text-emerald-600" /> Selo Vendedor Verificado
              </li>
              <li className="flex items-center gap-1.5 text-gray-700 font-medium">
                <Truck className="w-4 h-4 text-emerald-600" /> Logistics HUB Bissau / Lisboa / SP
              </li>
            </ul>
          </div>

          {SHOW_NUSALI_AI && (
            <div className="space-y-2">
              <h4 className="font-bold text-gray-900 text-sm">Atendimento Nusali AI</h4>
              <p className="text-gray-500">
                Precisa de suporte em Bissau ou no exterior? Utilize o assistente de inteligência artificial Nusali AI disponível 24h.
              </p>
            </div>
          )}
        </div>

        <div className="bg-gray-100 py-4 px-4 text-center border-t border-gray-200 text-[11px] text-gray-500 space-y-2">
          <nav aria-label="Documentos legais" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 font-semibold text-gray-700">
            <Link to="/termos-de-uso" className="inline-block py-2 px-1 hover:text-emerald-700 hover:underline">
              Termos de Uso
            </Link>
            <span aria-hidden="true" className="text-gray-300">|</span>
            <Link to="/politica-de-privacidade" className="inline-block py-2 px-1 hover:text-emerald-700 hover:underline">
              Política de Privacidade
            </Link>
          </nav>
          <p>© 2026 Mercado Nusali - Plataforma de Marketplace Internacional. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
};
