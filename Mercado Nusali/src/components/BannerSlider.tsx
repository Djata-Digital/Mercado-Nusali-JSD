import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Zap, ShieldCheck, Truck, CreditCard } from 'lucide-react';
import { NusaliLogo } from './NusaliLogo';

export const BannerSlider: React.FC = () => {
  const navigate = useNavigate();
  const [currentSlide, setCurrentSlide] = useState(0);

  const banners = [
    {
      id: 'banner-1',
      tag: 'OFERTAS DO DIA',
      title: 'Descontos de até 60% OFF com Frete Grátis',
      subtitle: 'Aproveite as maiores ofertas em Celulares, TVs e Eletrodomésticos!',
      cta: 'Ver todas as ofertas',
      bgClass: 'from-blue-900 via-indigo-900 to-slate-900',
      tagBg: 'bg-yellow-400 text-blue-950',
      action: () => navigate('/products'),
      badge: '⚡ CHEGA AMANHÃ',
    },
    {
      id: 'banner-2',
      tag: 'BENEFÍCIO NUSALI+',
      title: 'Entretenimento, Cashback e Frete Grátis em milhares de produtos',
      subtitle: 'Assine por apenas R$ 17,90/mês e ganhe 10% de cashback no Nusali Pay',
      cta: 'Conhecer Nusali+',
      bgClass: 'from-emerald-950 via-teal-950 to-blue-950',
      tagBg: 'bg-yellow-400 text-blue-950 font-black',
      action: () => navigate('/nusali-plus'),
      badge: 'Benefícios Exclusivos',
    },
    {
      id: 'banner-3',
      tag: 'TECNOLOGIA & GAMERS',
      title: 'Consoles, Notebooks e Smartphones em até 10x sem juros',
      subtitle: 'Compre com a Compra Garantida Nusali Escrow - Seu dinheiro seguro até receber',
      cta: 'Conferir tecnologia',
      bgClass: 'from-slate-900 via-blue-950 to-zinc-900',
      tagBg: 'bg-emerald-600 text-white',
      action: () => navigate('/products?q=eletronicos'),
      badge: '⚡ FULL Entrega Expressa',
    },
  ];


  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % banners.length);
    }, 5500);
    return () => clearInterval(timer);
  }, [banners.length]);

  return (
    <div className="relative w-full overflow-hidden bg-slate-900 shadow-sm">
      {/* Slide Container */}
      <div
        className="flex transition-transform duration-700 ease-out"
        style={{ transform: `translateX(-${currentSlide * 100}%)` }}
      >
        {banners.map((banner) => (
          <div
            key={banner.id}
            className={`w-full shrink-0 bg-gradient-to-r ${banner.bgClass} text-white py-10 px-6 md:px-16 min-h-[260px] flex items-center justify-between relative`}
          >
            <div className="max-w-2xl z-10 space-y-3">
              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-xs tracking-wider uppercase ${banner.tagBg}`}>
                  {banner.tag}
                </span>
                <span className="bg-white/10 text-white/90 text-xs px-2.5 py-0.5 rounded-full backdrop-blur-xs font-medium">
                  {banner.badge}
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white leading-tight">
                {banner.title}
              </h2>
              <p className="text-sm sm:text-base text-gray-300 font-normal leading-relaxed">
                {banner.subtitle}
              </p>
              <div className="pt-2">
                <button
                  onClick={banner.action}
                  className="bg-[#fff159] hover:bg-yellow-400 text-blue-950 font-extrabold px-6 py-2.5 rounded-md shadow-md hover:shadow-lg transition transform active:scale-95 text-sm"
                >
                  {banner.cta}
                </button>
              </div>
            </div>

            {/* Decorative background visual shape with brand emblem */}
            <div className="hidden md:flex items-center justify-center opacity-30 pointer-events-none pr-6">
              <NusaliLogo variant="emblem" size={200} />
            </div>
          </div>
        ))}
      </div>

      {/* Navigation Arrows */}
      <button
        onClick={() => setCurrentSlide((prev) => (prev - 1 + banners.length) % banners.length)}
        className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white p-2 rounded-full backdrop-blur-xs transition"
        title="Slide Anterior"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button
        onClick={() => setCurrentSlide((prev) => (prev + 1) % banners.length)}
        className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white p-2 rounded-full backdrop-blur-xs transition"
        title="Próximo Slide"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      {/* Slide Indicators */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2">
        {banners.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrentSlide(idx)}
            className={`h-2 rounded-full transition-all ${
              currentSlide === idx ? 'w-6 bg-[#fff159]' : 'w-2 bg-white/50 hover:bg-white'
            }`}
          />
        ))}
      </div>

      {/* Trust Badges Strip Under Banner */}
      <div className="bg-white border-b border-gray-200 py-3 px-4 shadow-xs">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-full">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Até 10x sem juros</p>
              <p className="text-[11px] text-gray-500">Com Nusali Pay</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-50 text-green-600 rounded-full">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Frete Grátis em 24h</p>
              <p className="text-[11px] text-gray-500">Produtos com selo FULL</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-50 text-purple-600 rounded-full">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Compra Garantida</p>
              <p className="text-[11px] text-gray-500">Receba ou devolvemos dinheiro</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-50 text-yellow-700 rounded-full">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Pix com 5% de desconto</p>
              <p className="text-[11px] text-gray-500">Aprovação instantânea</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
