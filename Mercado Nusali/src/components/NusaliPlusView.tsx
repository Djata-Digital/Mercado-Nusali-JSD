import React, { useState } from 'react';
import { Zap, Check, Film, Music, ShieldCheck, Truck, Star, Sparkles } from 'lucide-react';
import { useMarketplace } from '../context/MarketplaceContext';

export const NusaliPlusView: React.FC = () => {
  const { setActiveView } = useMarketplace();
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = () => {
    setSubscribed(true);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-950 via-teal-950 to-slate-900 text-white rounded-2xl p-8 sm:p-12 shadow-xl relative overflow-hidden space-y-6">
        <div className="max-w-2xl space-y-4 relative z-10">
          <div className="flex items-center gap-2">
            <span className="bg-[#fff159] text-emerald-950 font-black text-xs px-3 py-1 rounded-xs tracking-wider uppercase">
              O CLUBE DE BENEFÍCIOS DO MERCADO NUSALI
            </span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight">
            Assine Nusali Plus por apenas <span className="text-[#fff159]">R$ 17,90/mês</span>
          </h1>
          <p className="text-sm sm:text-base text-gray-200 leading-relaxed font-medium">
            Economize em todas as suas compras com Frete Grátis ilimitado, parceiros internacionais e 10% de cashback no Nusali Pay.
          </p>

          <div className="pt-2">
            {subscribed ? (
              <div className="bg-emerald-500 text-white font-extrabold px-6 py-3 rounded-lg shadow-md inline-flex items-center gap-2 text-sm">
                <Check className="w-5 h-5 text-white" /> Assinatura Nusali Plus Ativa com Sucesso!
              </div>
            ) : (
              <button
                onClick={handleSubscribe}
                className="bg-[#fff159] hover:bg-yellow-400 text-emerald-950 font-extrabold px-8 py-3.5 rounded-lg shadow-lg hover:shadow-xl transition transform active:scale-95 text-base flex items-center gap-2"
              >
                <Zap className="w-5 h-5 fill-emerald-950" />
                <span>Assinar Nusali Plus por R$ 17,90/mês</span>
              </button>
            )}
          </div>
        </div>

        {/* Decorative Background Icon */}
        <div className="absolute -right-10 -bottom-10 opacity-15 pointer-events-none">
          <Zap className="w-96 h-96 text-yellow-300" />
        </div>
      </div>

      {/* Benefits Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-3">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center font-bold">
            <Truck className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-gray-900">Frete Grátis Ilimitado</h3>
          <p className="text-xs text-gray-600 leading-relaxed">
            Frete grátis em milhões de produtos selecionados com selo Nusali Plus em toda a região.
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-3">
          <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-lg flex items-center justify-center font-bold">
            <Film className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-gray-900">Parceiros de Streaming</h3>
          <p className="text-xs text-gray-600 leading-relaxed">
            Acesso exclusivo a descontos e benefícios com parceiros de entretenimento globais.
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-3">
          <div className="w-12 h-12 bg-amber-50 text-amber-700 rounded-lg flex items-center justify-center font-bold">
            <Music className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-gray-900">Nusali Pay Cashback</h3>
          <p className="text-xs text-gray-600 leading-relaxed">
            Receba até 10% de cashback acumulativo em compras elegíveis direto na sua carteira digital.
          </p>
        </div>
      </div>
    </div>
  );
};
