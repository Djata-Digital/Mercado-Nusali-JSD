import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Truck, UserPlus, ShoppingCart, Store } from 'lucide-react';
import { MercadoNusaliLogo } from './MercadoNusaliLogo';

export const BannerSlider: React.FC = () => {
  const navigate = useNavigate();
  const [currentSlide, setCurrentSlide] = useState(0);

  const banners = [
    {
      id: 'banner-1',
      tag: 'MERCADO NUSALI',
      title: 'Explore os produtos do Mercado Nusali',
      subtitle: 'Crie sua conta, navegue pelo catálogo e monte seu carrinho. As compras online chegam em breve.',
      cta: 'Ver produtos',
      bgClass: 'from-blue-900 via-indigo-900 to-slate-900',
      tagBg: 'bg-yellow-400 text-blue-950',
      action: () => navigate('/products'),
      badge: 'Compras online em breve',
    },
    {
      id: 'banner-2',
      tag: 'PARA VENDEDORES',
      title: 'Venda seus produtos no Mercado Nusali',
      subtitle: 'Crie sua conta de vendedor, configure sua operação e publique seus produtos.',
      cta: 'Criar minha conta',
      bgClass: 'from-emerald-950 via-teal-950 to-blue-950',
      tagBg: 'bg-yellow-400 text-blue-950 font-black',
      action: () => navigate('/register'),
      badge: 'Cadastro aberto',
    },
    {
      id: 'banner-3',
      tag: 'EM BREVE',
      title: 'Entrega e pagamento para a Guiné-Bissau',
      subtitle: 'Estamos preparando as opções de entrega e pagamento. Enquanto isso, explore o catálogo e monte seu carrinho.',
      cta: 'Explorar o catálogo',
      bgClass: 'from-slate-900 via-blue-950 to-zinc-900',
      tagBg: 'bg-emerald-600 text-white',
      action: () => navigate('/products'),
      badge: 'Compras online em breve',
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

            {/* Decorative background visual shape with the official brand symbol */}
            <div className="hidden md:flex shrink-0 items-center justify-center opacity-30 pointer-events-none pr-6" aria-hidden="true">
              <MercadoNusaliLogo variant="symbol" height={200} />
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
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Cadastro aberto</p>
              <p className="text-[11px] text-gray-500">Compradores e vendedores</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-50 text-green-600 rounded-full">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Catálogo e carrinho</p>
              <p className="text-[11px] text-gray-500">Explore e salve seus itens</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-50 text-purple-600 rounded-full">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Venda no Mercado Nusali</p>
              <p className="text-[11px] text-gray-500">Publique seus produtos</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-50 text-yellow-700 rounded-full">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Compras online em breve</p>
              <p className="text-[11px] text-gray-500">Entrega e pagamento em preparação</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
