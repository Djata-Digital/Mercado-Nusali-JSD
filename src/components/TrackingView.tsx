import React from 'react';
import {
  Truck,
  CheckCircle2,
  Clock,
  MapPin,
  ArrowLeft,
  Copy,
  Globe,
  ShieldCheck,
  Building2,
  PhoneCall,
  Package,
} from 'lucide-react';
import { useMarketplace } from '../context/MarketplaceContext';
import { countriesConfig } from '../utils/currencyUtils';

export const TrackingView: React.FC = () => {
  const { activeOrder, setActiveView, showToast } = useMarketplace();

  if (!activeOrder) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <Truck className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Nenhum rastreamento ativo</h2>
        <p className="text-xs text-gray-500 mb-6">Acesse "Minhas Compras" e clique em Rastrear no pedido desejado.</p>
        <button
          onClick={() => setActiveView('my_orders')}
          className="bg-emerald-600 text-white font-bold px-6 py-2.5 rounded-xl text-xs hover:bg-emerald-700 transition"
        >
          Ir para Minhas Compras
        </button>
      </div>
    );
  }

  const originCountry = countriesConfig[activeOrder.originCountry || 'GW'] || countriesConfig.GW;
  const destinationCountry = countriesConfig[activeOrder.destinationCountry || activeOrder.deliveryAddress.country] || countriesConfig.GW;

  const copyTrackingCode = () => {
    navigator.clipboard.writeText(activeOrder.trackingCode || 'GW8941203892NSL');
    showToast('Código de rastreio copiado para a área de transferência!');
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fadeIn">
      {/* Navigation */}
      <button
        onClick={() => setActiveView('order_detail')}
        className="flex items-center gap-2 text-xs font-bold text-gray-600 hover:text-emerald-700 mb-6 transition"
      >
        <ArrowLeft className="w-4 h-4" /> Voltar aos Detalhes do Pedido #{activeOrder.id}
      </button>

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-950 via-emerald-900 to-teal-900 text-white rounded-2xl p-6 sm:p-8 mb-8 shadow-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 bg-yellow-400 text-blue-950 px-3 py-1 rounded-full text-xs font-black uppercase mb-3">
              <Truck className="w-3.5 h-3.5" /> Rastreamento em Tempo Real
            </div>
            <h1 className="text-2xl sm:text-3xl font-black">
              {activeOrder.estimatedDelivery || 'Entrega a caminho'}
            </h1>
            <p className="text-xs text-gray-200 mt-1">
              Transportadora: <span className="font-bold text-yellow-300">{activeOrder.carrierName}</span>
            </p>
          </div>

          <div className="bg-white/10 p-4 rounded-xl border border-white/20 backdrop-blur-xs text-xs font-mono w-full md:w-auto">
            <span className="block text-[10px] text-gray-300 font-sans uppercase font-bold">Código de Rastreamento</span>
            <div className="flex items-center gap-3 mt-1">
              <span className="font-bold text-yellow-300 text-sm tracking-wider">{activeOrder.trackingCode || 'GW8941203892NSL'}</span>
              <button
                onClick={copyTrackingCode}
                className="p-1.5 bg-white/20 hover:bg-white/30 rounded text-white transition"
                title="Copiar Código"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Route Visualizer Card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs mb-8">
        <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-6">
          <div className="flex items-center gap-2">
            <span className="text-xl">{originCountry.flag}</span>
            <div>
              <span className="text-[10px] font-bold text-gray-400 block uppercase">Origem</span>
              <span className="text-xs font-bold text-gray-900">{originCountry.name}</span>
            </div>
          </div>

          <div className="flex-1 max-w-xs mx-6 hidden sm:block">
            <div className="relative flex items-center justify-between">
              <div className="w-full bg-emerald-200 h-1.5 rounded-full relative overflow-hidden">
                <div className="bg-emerald-600 h-full w-3/4 animate-pulse" />
              </div>
              <Truck className="w-5 h-5 text-emerald-700 absolute left-2/3 -top-2 animate-bounce" />
            </div>
            <span className="text-[10px] text-center block text-gray-400 mt-2 font-medium">Corredor Logístico Nusali</span>
          </div>

          <div className="flex items-center gap-2 text-right">
            <div>
              <span className="text-[10px] font-bold text-gray-400 block uppercase">Destino</span>
              <span className="text-xs font-bold text-gray-900">{destinationCountry.name}</span>
            </div>
            <span className="text-xl">{destinationCountry.flag}</span>
          </div>
        </div>

        {/* Tracking Timeline Steps */}
        <div className="space-y-6 relative pl-6 border-l-2 border-emerald-200 ml-4 py-2">
          {activeOrder.trackingSteps?.map((step, idx) => (
            <div key={idx} className="relative group">
              {/* Dot icon */}
              <div
                className={`absolute -left-[31px] top-0.5 w-6 h-6 rounded-full flex items-center justify-center border-2 ${
                  step.completed
                    ? 'bg-emerald-600 border-white text-white shadow-xs'
                    : 'bg-white border-gray-300 text-gray-400'
                }`}
              >
                {step.completed ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
              </div>

              <div className="bg-gray-50 group-hover:bg-emerald-50/50 p-4 rounded-xl border border-gray-200 transition">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                  <h3 className={`text-sm font-bold ${step.completed ? 'text-gray-900' : 'text-gray-500'}`}>
                    {step.title}
                  </h3>
                  <span className="text-[11px] font-mono font-medium text-gray-500 bg-white px-2 py-0.5 rounded border border-gray-200">
                    {step.timestamp}
                  </span>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Support / Carrier Info */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-600 text-white rounded-xl shadow-xs">
            <PhoneCall className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-gray-900">Dúvidas sobre o desembaraço ou localização?</h4>
            <p className="text-xs text-gray-600">Nossa central de suporte logístico acompanha o pacote 24/7.</p>
          </div>
        </div>

        <button
          onClick={() => setActiveView('messages')}
          className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition shadow-xs whitespace-nowrap"
        >
          Falar com Atendimento Logístico
        </button>
      </div>
    </div>
  );
};
