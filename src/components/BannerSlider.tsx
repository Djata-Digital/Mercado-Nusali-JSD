import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Truck, UserPlus, ShoppingCart, Store } from 'lucide-react';
import { MercadoNusaliLogo } from './MercadoNusaliLogo';
import { usePreferences } from '../context/PreferencesContext';
import { useActiveBanners } from '../hooks/useBanners';
import { BANNER_BG_PRESETS, validateBannerCta } from '../utils/bannerRules';
import { FALLBACK_SLIDES, resolveSlides, type BannerSlide } from '../utils/bannerSlides';

/**
 * Carrossel da home. Mostra os slides embutidos (FALLBACK_SLIDES) imediatamente e troca pelos banners
 * administrados (API) quando eles chegam; API fora do ar, timeout, resposta inválida ou lista vazia
 * mantêm os slides embutidos — a home nunca fica em branco esperando a API.
 */
export const BannerSlider: React.FC = () => {
  const { selectedCountry } = usePreferences();
  const { data } = useActiveBanners(selectedCountry);
  const slides = useMemo(() => resolveSlides(data), [data]);
  return <BannerCarousel slides={slides} />;
};

export type BannerSlidePreviewMode = 'desktop' | 'mobile';

interface BannerSlideViewProps {
  banner: BannerSlide;
  onCta?: (cta: NonNullable<BannerSlide['cta']>) => void;
  /** Só para o preview do painel: força o layout desktop/mobile (no site, o layout responde à largura da tela). */
  previewMode?: BannerSlidePreviewMode;
}

/** Um slide da home. Se a imagem falhar ao carregar, o slide continua utilizável (texto/CTA/cores), sem quebrar. */
export const BannerSlideView: React.FC<BannerSlideViewProps> = ({ banner, onCta, previewMode }) => {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    setImageFailed(false);
  }, [banner.desktopImageUrl, banner.mobileImageUrl]);

  const preset = BANNER_BG_PRESETS[banner.bgStyle];
  const hasImage = Boolean((banner.desktopImageUrl || banner.mobileImageUrl) && !imageFailed);
  const mobileLayout = previewMode === 'mobile';
  const forced = previewMode !== undefined;
  const imageSrc = mobileLayout
    ? banner.mobileImageUrl || banner.desktopImageUrl
    : forced
      ? banner.desktopImageUrl || banner.mobileImageUrl
      : banner.mobileImageUrl || banner.desktopImageUrl;

  return (
    <div
      className={`w-full shrink-0 bg-gradient-to-r ${preset.bgClass} text-white py-10 ${
        forced ? (mobileLayout ? 'px-6' : 'px-16') : 'px-6 md:px-16'
      } min-h-[260px] flex items-center justify-between relative`}
    >
      {hasImage && (
        <>
          <picture className="absolute inset-0 block">
            {!forced && banner.desktopImageUrl && banner.mobileImageUrl && (
              <source media="(min-width: 768px)" srcSet={banner.desktopImageUrl} />
            )}
            <img
              src={imageSrc || undefined}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              draggable={false}
              onError={() => setImageFailed(true)}
            />
          </picture>
          {/* leitura do texto sobre a imagem */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-transparent pointer-events-none" aria-hidden="true" />
        </>
      )}

      <div className="max-w-2xl z-10 space-y-3">
        {(banner.tag || banner.badge) && (
          <div className="flex items-center gap-2">
            {banner.tag && (
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-xs tracking-wider uppercase ${preset.tagBg}`}>
                {banner.tag}
              </span>
            )}
            {banner.badge && (
              <span className="bg-white/10 text-white/90 text-xs px-2.5 py-0.5 rounded-full backdrop-blur-xs font-medium">
                {banner.badge}
              </span>
            )}
          </div>
        )}
        <h2
          className={`${
            forced ? (mobileLayout ? 'text-2xl' : 'text-4xl') : 'text-2xl sm:text-3xl lg:text-4xl'
          } font-extrabold tracking-tight text-white leading-tight`}
        >
          {banner.title}
        </h2>
        {banner.subtitle && (
          <p className={`${forced ? 'text-sm' : 'text-sm sm:text-base'} text-gray-300 font-normal leading-relaxed`}>
            {banner.subtitle}
          </p>
        )}
        {banner.cta && (
          <div className="pt-2">
            <button
              onClick={() => onCta?.(banner.cta!)}
              className="bg-[#fff159] hover:bg-yellow-400 text-blue-950 font-extrabold px-6 py-2.5 rounded-md shadow-md hover:shadow-lg transition transform active:scale-95 text-sm"
            >
              {banner.cta.label}
            </button>
          </div>
        )}
      </div>

      {/* Decorative background visual shape with the official brand symbol (só em banner sem imagem) */}
      {!hasImage && !mobileLayout && (
        <div
          className={`${forced ? 'flex' : 'hidden md:flex'} shrink-0 items-center justify-center opacity-30 pointer-events-none pr-6`}
          aria-hidden="true"
        >
          <MercadoNusaliLogo variant="symbol" height={200} />
        </div>
      )}
    </div>
  );
};

interface BannerCarouselProps {
  slides?: BannerSlide[];
}

export const BannerCarousel: React.FC<BannerCarouselProps> = ({ slides = FALLBACK_SLIDES }) => {
  const navigate = useNavigate();
  const [currentSlide, setCurrentSlide] = useState(0);

  const count = slides.length;
  const slidesKey = slides.map((s) => s.id).join('|');

  // lista trocada (fallback → API, mudança de país): volta ao primeiro slide
  useEffect(() => {
    setCurrentSlide(0);
  }, [slidesKey]);

  useEffect(() => {
    if (count < 2) return undefined;
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % count);
    }, 5500);
    return () => clearInterval(timer);
  }, [count]);

  const runCta = (cta: NonNullable<BannerSlide['cta']>) => {
    // revalida no momento do clique (nunca navega para um destino que não passe nas regras)
    const check = validateBannerCta(cta.type, cta.target);
    if (!check.ok) return;
    if (cta.type === 'internal') navigate(check.value);
    else window.open(check.value, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="relative w-full overflow-hidden bg-slate-900 shadow-sm">
      {/* Slide Container */}
      <div
        className="flex transition-transform duration-700 ease-out"
        style={{ transform: `translateX(-${Math.min(currentSlide, count - 1) * 100}%)` }}
      >
        {slides.map((banner) => (
          <BannerSlideView key={banner.id} banner={banner} onCta={runCta} />
        ))}
      </div>

      {count > 1 && (
        <>
          {/* Navigation Arrows */}
          <button
            onClick={() => setCurrentSlide((prev) => (prev - 1 + count) % count)}
            className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white p-2 rounded-full backdrop-blur-xs transition"
            title="Slide Anterior"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => setCurrentSlide((prev) => (prev + 1) % count)}
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/70 text-white p-2 rounded-full backdrop-blur-xs transition"
            title="Próximo Slide"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* Slide Indicators */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2">
            {slides.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentSlide(idx)}
                className={`h-2 rounded-full transition-all ${
                  currentSlide === idx ? 'w-6 bg-[#fff159]' : 'w-2 bg-white/50 hover:bg-white'
                }`}
              />
            ))}
          </div>
        </>
      )}

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
