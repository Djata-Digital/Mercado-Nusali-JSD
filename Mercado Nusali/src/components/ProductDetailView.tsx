import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Heart,
  Star,
  ShieldCheck,
  Truck,
  RotateCcw,
  Zap,
  MapPin,
  CheckCircle2,
  HelpCircle,
  ThumbsUp,
  MessageSquare,
  ChevronRight,
  Share2,
  Building2,
  Award,
  ZoomIn,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Film,
  Image as ImageIcon,
  Sparkles,
  Globe,
  Gift,
  Palette,
  Scale,
  Ruler,
  Box,
  Check,
  Copy,
  AlertCircle,
  Info,
  Loader2,
  Package,
} from 'lucide-react';
import { useProduct, useProducts } from '../hooks/useProducts';
import { useCart } from '../hooks/useCart';
import { useFavorites } from '../hooks/useFavorites';
import { usePreferences } from '../context/PreferencesContext';
import { normalizeProduct } from '../utils/productUtils';
import { getCountryFlag, getCountryName, formatCurrency } from '../utils/currencyUtils';
import { ProductMediaViewerModal, MediaItem } from './ProductMediaViewerModal';
import { ProductShareModal } from './ProductShareModal';
import { ProductKit, ProductColor, ProductVariant } from '../types';

export const ProductDetailView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isValidId = Boolean(id && id !== 'undefined' && id.trim() !== '');
  const { data: fetchedProduct, isLoading, isError } = useProduct(isValidId ? id! : '');
  const { data: allProducts = [] } = useProducts();
  const rawProduct = isValidId ? (fetchedProduct || allProducts.find((p) => p.id === id)) : null;
  const product = rawProduct ? normalizeProduct(rawProduct) : null;

  const { addItem } = useCart();
  const { toggleFavorite, isFavorite } = useFavorites();
  const { selectedCountry, formatPrice } = usePreferences();

  const userLocation = { city: 'Bissau', country: selectedCountry };

  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0);
  const [isMediaViewerOpen, setIsMediaViewerOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [newQuestion, setNewQuestion] = useState('');
  const [questionSubmitted, setQuestionSubmitted] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Main video player preview state
  const [isInlineVideoPlaying, setIsInlineVideoPlaying] = useState(true);
  const [isInlineVideoMuted, setIsInlineVideoMuted] = useState(true);

  // Selected Variations (Color & Size)
  const availableColors: ProductColor[] = useMemo(() => {
    if (!product?.availableColors || product.availableColors.length === 0) return [];
    return product.availableColors.map((c) =>
      typeof c === 'string' ? { name: c, hex: '#374151' } : c
    );
  }, [product]);

  const availableSizes: string[] = useMemo(() => {
    return product?.availableSizes || [];
  }, [product]);

  const [selectedColor, setSelectedColor] = useState<string>('');
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [selectedKit, setSelectedKit] = useState<ProductKit | null>(null);

  // Initialize selected variation on product load
  useEffect(() => {
    if (product) {
      if (availableColors.length > 0 && !selectedColor) {
        setSelectedColor(availableColors[0].name);
      }
      if (availableSizes.length > 0 && !selectedSize) {
        setSelectedSize(availableSizes[0]);
      }
    }
  }, [product, availableColors, availableSizes]);

  // Active color object with specific images/videos/descriptions
  const activeColorObj = useMemo<ProductColor | null>(() => {
    if (!product || availableColors.length === 0) return null;
    if (selectedColor) {
      const found = availableColors.find(
        (c) => c.name.toLowerCase() === selectedColor.toLowerCase()
      );
      if (found) return found;
    }
    return availableColors[0] || null;
  }, [product, selectedColor, availableColors]);

  // Active variant match based on selectedColor + selectedSize
  const activeVariant = useMemo<ProductVariant | null>(() => {
    if (!product?.variants || product.variants.length === 0) return null;
    if (selectedColor && selectedSize) {
      const match = product.variants.find(
        (v) =>
          v.color?.toLowerCase() === selectedColor.toLowerCase() &&
          v.size?.toLowerCase() === selectedSize.toLowerCase()
      );
      if (match) return match;
    }
    if (selectedColor) {
      const match = product.variants.find(
        (v) => v.color?.toLowerCase() === selectedColor.toLowerCase()
      );
      if (match) return match;
    }
    if (selectedSize) {
      const match = product.variants.find(
        (v) => v.size?.toLowerCase() === selectedSize.toLowerCase()
      );
      if (match) return match;
    }
    return product.variants[0] || null;
  }, [product, selectedColor, selectedSize]);

  // Handler for color selection with media index reset
  const handleSelectColor = (colorName: string) => {
    setSelectedColor(colorName);
    setSelectedMediaIndex(0);
  };

  // Determine current active stock based on (selectedColor, selectedSize) from variants matrix
  const currentVariantStock = useMemo(() => {
    if (!product) return 0;
    if (!product.variants || product.variants.length === 0) {
      return product.stock ?? 10;
    }

    // Match both color and size
    if (selectedColor && selectedSize) {
      const match = product.variants.find(
        (v) =>
          v.color?.toLowerCase() === selectedColor.toLowerCase() &&
          v.size?.toLowerCase() === selectedSize.toLowerCase()
      );
      if (match) return match.stock;
    }

    // Match only color if no sizes
    if (selectedColor && availableSizes.length === 0) {
      const match = product.variants.find(
        (v) => v.color?.toLowerCase() === selectedColor.toLowerCase()
      );
      if (match) return match.stock;
    }

    // Match only size if no colors
    if (selectedSize && availableColors.length === 0) {
      const match = product.variants.find(
        (v) => v.size?.toLowerCase() === selectedSize.toLowerCase()
      );
      if (match) return match.stock;
    }

    return product.stock ?? 10;
  }, [product, selectedColor, selectedSize, availableColors, availableSizes]);

  const isCurrentVariationOutOfStock = currentVariantStock <= 0;

  // Build unified media items array (images + short videos) synchronized with selected color/variant
  const mediaItems: MediaItem[] = useMemo(() => {
    if (!product) return [];

    const items: MediaItem[] = [];

    // 1. Determine images for selected color variation
    let rawImages: string[] = [];
    if (activeColorObj?.galleryImages && activeColorObj.galleryImages.length > 0) {
      rawImages = activeColorObj.galleryImages;
    } else if (activeVariant?.galleryImages && activeVariant.galleryImages.length > 0) {
      rawImages = activeVariant.galleryImages;
    } else if (activeColorObj?.image) {
      rawImages = [activeColorObj.image, ...(product.galleryImages || [])];
    } else if (activeVariant?.image) {
      rawImages = [activeVariant.image, ...(product.galleryImages || [])];
    } else if (product.galleryImages && product.galleryImages.length > 0) {
      rawImages = product.galleryImages;
    } else {
      rawImages = [product.image];
    }

    // Deduplicate images while keeping order
    const uniqueImages: string[] = [];
    rawImages.forEach((img) => {
      if (img && !uniqueImages.includes(img)) {
        uniqueImages.push(img);
      }
    });

    uniqueImages.forEach((url, idx) => {
      items.push({
        type: 'image',
        url,
        title: `${product.title} - ${selectedColor ? `${selectedColor} - ` : ''}Foto ${idx + 1}`,
      });
    });

    // 2. Short Videos (from active color, active variant, or base product)
    const videoSource =
      (activeColorObj?.videos && activeColorObj.videos.length > 0 ? activeColorObj.videos : null) ||
      (activeVariant?.videos && activeVariant.videos.length > 0 ? activeVariant.videos : null) ||
      (product.videos && product.videos.length > 0 ? product.videos : null);

    if (videoSource && Array.isArray(videoSource) && videoSource.length > 0) {
      videoSource.forEach((vid: any) => {
        const vidUrl = typeof vid === 'string' ? vid : vid.url;
        if (vidUrl) {
          items.push({
            type: 'video',
            url: vidUrl,
            title:
              typeof vid === 'object' && vid.title
                ? vid.title
                : `Vídeo Demonstrativo (${selectedColor || 'Produto'})`,
            duration: typeof vid === 'object' && vid.duration ? vid.duration : '0:30',
            thumbnail:
              typeof vid === 'object' && vid.thumbnail
                ? vid.thumbnail
                : uniqueImages[0] || product.image,
          });
        }
      });
    } else if (product.shortVideo && product.shortVideo.url) {
      items.push({
        type: 'video',
        url: product.shortVideo.url,
        title: product.shortVideo.title || 'Vídeo Demonstrativo do Produto',
        duration: product.shortVideo.duration || '0:25',
        thumbnail: product.shortVideo.thumbnail || uniqueImages[0] || product.image,
      });
    } else if (product.videoUrl) {
      items.push({
        type: 'video',
        url: product.videoUrl,
        title: 'Vídeo Demonstrativo do Produto',
        duration: '0:30',
        thumbnail: uniqueImages[0] || product.image,
      });
    }

    return items;
  }, [product, activeColorObj, activeVariant, selectedColor]);

  // Dynamic Description and Specs based on selected color & variant
  const activeDescription = useMemo(() => {
    if (!product) return '';
    if (activeColorObj?.description) return activeColorObj.description;
    if (activeVariant?.description) return activeVariant.description;
    return product.description;
  }, [product, activeColorObj, activeVariant]);

  const activeSpecs = useMemo(() => {
    if (!product) return {};
    const specsMap = { ...(product.specs || {}) };
    if (selectedColor) {
      specsMap['Cor / Variação'] = selectedColor;
    }
    if (selectedSize) {
      specsMap['Tamanho / Especificação'] = selectedSize;
    }
    if (activeColorObj?.specs) {
      Object.assign(specsMap, activeColorObj.specs);
    }
    if (activeVariant?.specs) {
      Object.assign(specsMap, activeVariant.specs);
    }
    return specsMap;
  }, [product, selectedColor, selectedSize, activeColorObj, activeVariant]);

  if (!isValidId) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center space-y-4">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">URL do Produto Inválida</h2>
        <p className="text-xs text-gray-500 max-w-md mx-auto">
          O identificador do produto na URL é inválido ou está ausente.
        </p>
        <button
          onClick={() => navigate('/')}
          className="px-5 py-2.5 bg-emerald-600 text-white font-bold text-xs rounded-xl hover:bg-emerald-700 transition"
        >
          Voltar à Página Inicial
        </button>
      </div>
    );
  }

  if (isLoading && !product) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center space-y-3">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-emerald-600" />
        <p className="text-gray-500 font-medium text-xs">Carregando detalhes do produto...</p>
      </div>
    );
  }

  if (!product || isError) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center space-y-4">
        <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto">
          <Package className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Produto Não Encontrado</h2>
        <p className="text-xs text-gray-500 max-w-md mx-auto">
          O produto #{id} não foi encontrado ou não está mais disponível no catálogo.
        </p>
        <button
          onClick={() => navigate('/')}
          className="px-5 py-2.5 bg-emerald-600 text-white font-bold text-xs rounded-xl hover:bg-emerald-700 transition"
        >
          Explorar Produtos
        </button>
      </div>
    );
  }

  const favorited = isFavorite(product.id);
  const currentMedia = mediaItems[selectedMediaIndex] || mediaItems[0];
  const imagesCount = mediaItems.filter((m) => m.type === 'image').length;
  const videosCount = mediaItems.filter((m) => m.type === 'video').length;

  const baseProductPrice = typeof product.price === 'number' ? product.price : parseFloat(product.price as any) || 0;
  
  // Resolve variant specific price if seller assigned a price to this size/color combination
  const activeVariantPrice = activeVariant?.price ?? activeColorObj?.price ?? baseProductPrice;
  const activeVariantOriginalPrice = activeVariant?.originalPrice ?? activeColorObj?.originalPrice ?? product.originalPrice;

  // Price calculations considering selectedKit
  const effectiveUnitPrice = selectedKit
    ? selectedKit.unitPrice || Math.round(activeVariantPrice * (1 - selectedKit.discountPercentage / 100))
    : activeVariantPrice;

  const effectiveTotalOrderPrice = selectedKit
    ? effectiveUnitPrice * selectedKit.quantity
    : effectiveUnitPrice * quantity;

  const instMax = product.installmentsMax || 1;
  const productCurrency = product.currency || 'XOF';

  const effectiveTotalInfo = formatPrice(effectiveTotalOrderPrice, productCurrency);
  const effectiveUnitInfo = formatPrice(effectiveUnitPrice, productCurrency);
  const basePriceInfo = formatPrice(activeVariantPrice, productCurrency);
  const origPriceInfo = activeVariantOriginalPrice ? formatPrice(activeVariantOriginalPrice, productCurrency) : null;
  const installmentAmountStr = formatCurrency(effectiveTotalInfo.convertedAmount / instMax, effectiveTotalInfo.displayCurrency);

  const effectiveDiscountPercentage = activeVariantOriginalPrice && activeVariantOriginalPrice > activeVariantPrice
    ? Math.round(((activeVariantOriginalPrice - activeVariantPrice) / activeVariantOriginalPrice) * 100)
    : product.discountPercentage;

  // International Check
  const isInternational = !!(product.shipping?.isInternational || product.publishingScope === 'international');
  const originCountry = product.originCountry || product.shipping?.originCountry || 'GW';

  const [isAnsweringQuestion, setIsAnsweringQuestion] = useState(false);

  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.trim() || isAnsweringQuestion) return;

    const questionText = newQuestion.trim();
    setNewQuestion('');
    setIsAnsweringQuestion(true);

    try {
      const res = await fetch('/api/gemini/seller-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productTitle: product.title,
          productSpecs: product.specs,
          question: questionText,
        }),
      });
      const data = await res.json();
      console.log('Pergunta enviada com resposta:', data.answer);
    } catch (err) {
      console.error(err);
    } finally {
      setIsAnsweringQuestion(false);
      setQuestionSubmitted(true);
      setTimeout(() => setQuestionSubmitted(false), 3000);
    }
  };

  const handleBuyNow = () => {
    const buyQty = selectedKit ? selectedKit.quantity : quantity;
    addItem(product, buyQty, {
      color: selectedColor || undefined,
      size: selectedSize || undefined,
      kit: selectedKit || undefined,
      unitPriceOverride: effectiveUnitPrice,
      selectedVariantSku: activeVariant?.sku || product.sku,
      selectedVariantImage: activeVariant?.image || activeColorObj?.image || product.image,
    });
    navigate('/checkout');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAddToCart = () => {
    const buyQty = selectedKit ? selectedKit.quantity : quantity;
    addItem(product, buyQty, {
      color: selectedColor || undefined,
      size: selectedSize || undefined,
      kit: selectedKit || undefined,
      unitPriceOverride: effectiveUnitPrice,
      selectedVariantSku: activeVariant?.sku || product.sku,
      selectedVariantImage: activeVariant?.image || activeColorObj?.image || product.image,
    });
    navigate('/cart');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCopyDirectLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const handleOpenShareModal = () => {
    setIsShareModalOpen(true);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 animate-fadeIn">
      {/* Top Breadcrumb & International Notice Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="hover:underline cursor-pointer" onClick={() => navigate('/')}>
            Início
          </span>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="hover:underline cursor-pointer">{product.category}</span>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-gray-900 font-medium truncate max-w-[240px] sm:max-w-md">
            {product.title}
          </span>
        </div>

        {/* Origin / Scope Badge */}
        {isInternational ? (
          <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 text-indigo-900 font-bold px-3 py-1 rounded-full shadow-2xs">
            <Globe className="w-3.5 h-3.5 text-indigo-600" />
            <span>
              Produto Internacional &bull; Enviado de {getCountryFlag(originCountry)}{' '}
              {getCountryName(originCountry)}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold px-3 py-1 rounded-full shadow-2xs">
            <span>{getCountryFlag(originCountry)}</span>
            <span>Venda Nacional ({getCountryName(originCountry)})</span>
          </div>
        )}
      </div>

      {/* Main Product Layout (3 Columns on Desktop) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Gallery & Media Carousel (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex gap-3">
            {/* Thumbnails Sidebar */}
            <div className="flex flex-col gap-2 max-h-[460px] overflow-y-auto pr-1">
              {mediaItems.map((item, idx) => {
                const isSelected = selectedMediaIndex === idx;
                const isVideo = item.type === 'video';

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedMediaIndex(idx)}
                    className={`relative w-16 h-16 rounded-lg border-2 overflow-hidden shrink-0 bg-white transition cursor-pointer p-0.5 ${
                      isSelected
                        ? 'border-blue-600 ring-2 ring-blue-500/20 shadow-xs'
                        : 'border-gray-200 hover:border-gray-400 opacity-75 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={item.thumbnail || item.url}
                      alt={item.title}
                      className="w-full h-full object-cover rounded-sm"
                    />
                    {isVideo && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <Play className="w-4 h-4 text-white fill-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Active Media Display Container */}
            <div className="flex-1 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-xs h-[460px] flex items-center justify-center p-2 relative group">
              {currentMedia?.type === 'video' ? (
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 rounded-lg overflow-hidden relative">
                  <video
                    key={currentMedia.url}
                    src={currentMedia.url}
                    controls
                    autoPlay
                    loop
                    muted={isInlineVideoMuted}
                    playsInline
                    className="max-h-full max-w-full rounded-md object-contain"
                  />

                  {/* Top Video Overlay Strip */}
                  <div className="absolute top-2 inset-x-2 flex items-center justify-between bg-black/60 backdrop-blur-xs text-white text-xs px-3 py-1.5 rounded-lg border border-white/10 pointer-events-auto">
                    <span className="font-bold flex items-center gap-1.5 text-emerald-400">
                      <Film className="w-3.5 h-3.5" />
                      {currentMedia.title || 'Vídeo de Apresentação'}
                    </span>
                    <button
                      onClick={() => setIsInlineVideoMuted(!isInlineVideoMuted)}
                      className="p-1 hover:bg-white/20 rounded-md transition"
                      title={isInlineVideoMuted ? 'Ativar Áudio' : 'Mutar Áudio'}
                    >
                      {isInlineVideoMuted ? (
                        <VolumeX className="w-4 h-4 text-gray-300" />
                      ) : (
                        <Volume2 className="w-4 h-4 text-emerald-400" />
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => setIsMediaViewerOpen(true)}
                  className="w-full h-full flex items-center justify-center cursor-zoom-in relative"
                  title="Clique na imagem para ampliar e ver detalhes em alta resolução"
                >
                  <img
                    src={currentMedia?.url || product.image}
                    alt={product.title}
                    className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105"
                  />

                  {/* Floating Zoom Action Badge */}
                  <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-xs hover:bg-white text-gray-800 text-[11px] font-bold px-2.5 py-1.5 rounded-lg shadow-sm border border-gray-200 flex items-center gap-1.5 transition group-hover:shadow-md">
                    <ZoomIn className="w-3.5 h-3.5 text-blue-600" />
                    <span>Clique para Ampliar</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Media Count Summary Strip */}
          <div className="flex items-center justify-between text-xs text-gray-500 px-1">
            <div className="flex items-center gap-2 font-medium">
              <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md border border-gray-200 flex items-center gap-1 text-[11px]">
                <ImageIcon className="w-3.5 h-3.5 text-gray-600" /> {imagesCount} Fotos
              </span>
              {videosCount > 0 && (
                <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md border border-emerald-200 flex items-center gap-1 text-[11px] font-bold">
                  <Film className="w-3.5 h-3.5 text-emerald-600" /> {videosCount} Vídeo Demonstrativo
                </span>
              )}
            </div>

            <button
              onClick={() => setIsMediaViewerOpen(true)}
              className="text-blue-700 hover:text-blue-900 font-bold text-xs flex items-center gap-1 hover:underline cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" /> Abrir Galeria Completa
            </button>
          </div>
        </div>

        {/* Center Column: Details, Price, Variations & Kits (4 cols) */}
        <div className="lg:col-span-4 space-y-5">
          {/* Condition, Rating & Share */}
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              {product.condition === 'novo' ? 'Novo' : 'Usado'} | {product.salesCount}+ vendidos
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleCopyDirectLink}
                className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-[11px] font-semibold flex items-center gap-1 transition"
                title="Copiar link direto do produto"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-600 font-bold">Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-gray-600" />
                    <span>Copiar Link</span>
                  </>
                )}
              </button>
              <button
                onClick={handleOpenShareModal}
                className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md text-xs font-semibold flex items-center gap-1 transition"
                title="Partilhar"
              >
                <Share2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => toggleFavorite(product.id)}
                className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-md transition"
                title="Favoritar"
              >
                <Heart className={`w-4 h-4 ${favorited ? 'fill-red-500 text-red-500' : ''}`} />
              </button>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-xl font-bold text-gray-900 leading-snug">{product.title}</h1>

          {/* Rating */}
          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center text-amber-400">
              <Star className="w-4 h-4 fill-amber-400" />
              <span className="ml-1 font-bold text-gray-900 text-sm">{product.rating}</span>
            </div>
            <span className="text-gray-400">({product.reviewsCount} avaliações)</span>
          </div>

          {/* Price Block */}
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-2">
            {activeVariantOriginalPrice && activeVariantOriginalPrice > activeVariantPrice && !selectedKit && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400 line-through">
                  {origPriceInfo?.formatted}
                </span>
                <span className="bg-green-100 text-green-800 text-xs font-bold px-2 py-0.5 rounded-md">
                  {effectiveDiscountPercentage}% OFF
                </span>
              </div>
            )}

            {selectedKit && (
              <div className="flex items-center gap-2">
                <span className="bg-amber-100 text-amber-900 text-xs font-black px-2.5 py-0.5 rounded-md border border-amber-300">
                  {selectedKit.badge || `${selectedKit.discountPercentage}% OFF`}
                </span>
                <span className="text-xs text-gray-500 line-through">
                  {formatPrice(activeVariantPrice * selectedKit.quantity, productCurrency).formatted}
                </span>
              </div>
            )}

            <div className="flex flex-col">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-gray-900">
                  {effectiveTotalInfo.formatted}
                </span>
                {selectedKit && (
                  <span className="text-xs text-gray-600 font-medium">
                    ({effectiveUnitInfo.formatted} / cada)
                  </span>
                )}
              </div>
              {effectiveTotalInfo.isConverted && (
                <span className="text-xs text-gray-500 font-medium">
                  Preço original: {effectiveTotalInfo.originalFormatted}
                </span>
              )}
            </div>

            {instMax > 1 && (
              <p className="text-xs font-bold text-green-700">
                em {product.installmentsMax}x de {installmentAmountStr}{' '}
                {product.installmentsInterestFree && 'sem juros no cartão'}
              </p>
            )}
          </div>

          {/* 1. SELEÇÃO DE KITS DE PRODUTOS (2, 5, 10 UNIDADES) */}
          {product.productKits && product.productKits.length > 0 && (
            <div className="space-y-2.5 pt-2 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-black text-gray-900 flex items-center gap-1.5">
                  <Gift className="w-4 h-4 text-amber-600" />
                  <span>Kits e Pacotes Promocionais:</span>
                </label>
                {selectedKit && (
                  <button
                    type="button"
                    onClick={() => setSelectedKit(null)}
                    className="text-[11px] text-blue-600 font-bold hover:underline"
                  >
                    Comprar apenas 1 unidade
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* 1 Unit Default Option */}
                <button
                  type="button"
                  onClick={() => setSelectedKit(null)}
                  className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                    selectedKit === null
                      ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-500/20'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <span className="font-bold text-xs text-gray-900">1 Unidade Avulsa</span>
                  <span className="text-[11px] text-gray-500 font-medium">{basePriceInfo.formatted}</span>
                </button>

                {/* Kits Options */}
                {product.productKits.map((kit) => {
                  const isKitSelected = selectedKit?.id === kit.id;
                  const unitPrice =
                    kit.unitPrice || Math.round(activeVariantPrice * (1 - kit.discountPercentage / 100));
                  const totalKit = unitPrice * kit.quantity;

                  return (
                    <button
                      key={kit.id}
                      type="button"
                      onClick={() => setSelectedKit(kit)}
                      className={`p-2.5 rounded-xl border text-left transition relative cursor-pointer ${
                        isKitSelected
                          ? 'border-amber-600 bg-amber-50/60 ring-2 ring-amber-500/20 shadow-xs'
                          : 'border-gray-200 hover:border-amber-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-black text-xs text-gray-900">{kit.title}</span>
                        <span className="bg-amber-100 text-amber-900 text-[9px] font-black px-1.5 py-0.2 rounded-md">
                          {kit.badge || `${kit.discountPercentage}% OFF`}
                        </span>
                      </div>
                      <div className="text-[11px]">
                        <span className="font-bold text-gray-900">
                          {formatCurrency(totalKit, productCurrency)}
                        </span>
                        <span className="text-gray-500 text-[10px] ml-1">
                          ({formatCurrency(unitPrice, productCurrency)}/un.)
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. SELETOR DE CORES / VARIAÇÕES EM MINIATURAS (PADRÃO MERCADO LIVRE) */}
          {availableColors.length > 0 && (
            <div className="space-y-2.5 pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-800">
                  Cor: <strong className="text-gray-900 font-extrabold ml-1">{selectedColor || availableColors[0]?.name}</strong>
                </span>
                <span className="text-gray-500 text-[11px] font-medium">{availableColors.length} opções disponíveis</span>
              </div>

              {/* Grid de Miniaturas de Produtos (Como no Mercado Livre) */}
              <div className="flex flex-wrap gap-2.5 items-center">
                {availableColors.map((c, idx) => {
                  const isSelected = selectedColor.toLowerCase() === c.name.toLowerCase();
                  const thumbImg =
                    c.image ||
                    (c.galleryImages && c.galleryImages.length > 0 ? c.galleryImages[0] : null) ||
                    product.variants?.find((v) => v.color?.toLowerCase() === c.name.toLowerCase())?.image ||
                    product.image;

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectColor(c.name)}
                      title={`Selecionar cor: ${c.name}`}
                      className={`relative w-16 h-16 sm:w-18 sm:h-18 rounded-lg overflow-hidden border-2 transition-all cursor-pointer bg-white group p-0.5 shrink-0 ${
                        isSelected
                          ? 'border-blue-600 ring-2 ring-blue-500/25 shadow-xs scale-102'
                          : 'border-gray-200 hover:border-gray-400 opacity-85 hover:opacity-100'
                      }`}
                    >
                      <img
                        src={thumbImg}
                        alt={c.name}
                        className="w-full h-full object-cover rounded-md group-hover:scale-105 transition-transform duration-200"
                      />
                      
                      {/* Check badge when selected */}
                      {isSelected && (
                        <div className="absolute top-1 right-1 bg-blue-600 text-white p-0.5 rounded-full shadow-xs">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </div>
                      )}

                      {/* Mini color dot preview */}
                      {c.hex && (
                        <div
                          className="absolute bottom-1 left-1 w-2.5 h-2.5 rounded-full border border-white shadow-2xs"
                          style={{ backgroundColor: c.hex }}
                          title={c.name}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. SELETOR DE TAMANHOS / CAPACIDADES (PADRÃO MERCADO LIVRE) */}
          {availableSizes.length > 0 && (
            <div className="space-y-2 pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-800">
                  Tamanho: <strong className="text-gray-900 font-extrabold ml-1">{selectedSize || 'Escolha uma opção'}</strong>
                </span>
                <span className="text-gray-500 text-[11px]">Guia de tamanhos</span>
              </div>

              <div className="flex flex-wrap gap-2">
                {availableSizes.map((s, idx) => {
                  const isSelected = selectedSize.toLowerCase() === s.toLowerCase();

                  // Check stock and variant price for this specific combination
                  const varItem = product.variants?.find(
                    (v) =>
                      v.size?.toLowerCase() === s.toLowerCase() &&
                      (!selectedColor || v.color?.toLowerCase() === selectedColor.toLowerCase())
                  ) || product.variants?.find((v) => v.size?.toLowerCase() === s.toLowerCase());

                  const isSizeOutOfStock = varItem !== undefined && varItem.stock <= 0;
                  const customVariantPrice = varItem?.price;

                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={isSizeOutOfStock}
                      onClick={() => setSelectedSize(s)}
                      className={`min-w-[56px] px-3.5 py-2 rounded-lg border text-xs font-bold transition cursor-pointer text-center flex flex-col items-center justify-center ${
                        isSizeOutOfStock
                          ? 'border-gray-200 bg-gray-50 text-gray-400 line-through cursor-not-allowed opacity-60'
                          : isSelected
                          ? 'border-blue-600 bg-blue-50/70 text-blue-900 ring-2 ring-blue-500/20 shadow-2xs font-extrabold'
                          : 'border-gray-300 hover:border-gray-500 bg-white text-gray-800'
                      }`}
                    >
                      <span>{s}</span>
                      {customVariantPrice !== undefined && customVariantPrice > 0 && (
                        <span
                          className={`text-[10px] font-semibold mt-0.5 ${
                            isSelected ? 'text-blue-700 font-bold' : 'text-gray-500'
                          }`}
                        >
                          {formatCurrency(customVariantPrice, productCurrency)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. AVISO DE PRODUTO INTERNACIONAL COM PAÍS DE ORIGEM */}
          {isInternational && (
            <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-indigo-700 shrink-0" />
                <h3 className="text-xs font-black text-indigo-950 uppercase tracking-wide">
                  Compra Internacional Garantida
                </h3>
              </div>

              <p className="text-xs text-indigo-900 leading-relaxed">
                Este item é enviado diretamente do armazém parceiro em{' '}
                <strong>{getCountryFlag(originCountry)} {getCountryName(originCountry)}</strong>.
              </p>

              <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] text-indigo-950">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span>Desembaraço Aduaneiro Incluso</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span>Rastreamento em Tempo Real</span>
                </div>
              </div>
            </div>
          )}

          {/* 5. PESO E MEDIDAS DA EMBALAGEM */}
          <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 text-xs space-y-1.5">
            <div className="font-bold text-gray-800 flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-emerald-700" />
              <span>Medidas &amp; Peso da Embalagem:</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-gray-600 text-[11px]">
              <div>
                Peso:{' '}
                <strong className="text-gray-900">
                  {product.weightKg ? `${product.weightKg} kg` : product.specs?.Peso || '0.50 kg'}
                </strong>
              </div>
              <div>
                Dimensões:{' '}
                <strong className="text-gray-900">
                  {product.dimensionsCm
                    ? `${product.dimensionsCm.length}×${product.dimensionsCm.width}×${product.dimensionsCm.height} cm`
                    : product.specs?.Dimensões || '20×15×10 cm'}
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Buy Box & Seller Info (3 cols) */}
        <div className="lg:col-span-3 space-y-4">
          {/* Buy Box Card */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs space-y-4">
            {/* Shipping Calculator */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-green-700 font-bold text-sm">
                <Truck className="w-5 h-5 text-green-600" />
                <span>
                  {isInternational
                    ? 'Frete Internacional Nusali Global'
                    : 'Frete GRÁTIS Nusali Logística'}
                </span>
              </div>
              <p className="text-xs text-gray-600 pl-7">
                {isInternational ? (
                  <>
                    Envio de {getCountryFlag(originCountry)} {getCountryName(originCountry)}. Chega em{' '}
                    <strong className="text-indigo-700">8 a 14 dias</strong> em {userLocation.city}
                  </>
                ) : (
                  <>
                    Chega <strong className="text-green-700">Amanhã</strong> em {userLocation.city}
                  </>
                )}
              </p>
            </div>

            {/* Stock status indicator based on variation */}
            <div className="space-y-1 bg-gray-50 p-2.5 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-gray-900">Disponibilidade:</span>
                {isCurrentVariationOutOfStock ? (
                  <span className="text-red-600 font-bold flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> Esgotado
                  </span>
                ) : (
                  <span className="text-emerald-700 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {currentVariantStock} unidades
                  </span>
                )}
              </div>

              {(selectedColor || selectedSize) && (
                <p className="text-[11px] text-gray-500">
                  Combinação:{' '}
                  <strong>
                    {selectedColor || 'Padrão'} {selectedSize ? `/ ${selectedSize}` : ''}
                  </strong>
                </p>
              )}
            </div>

            {/* Quantity Selector if single purchase */}
            {!selectedKit && (
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-gray-700">Quantidade:</span>
                <select
                  value={quantity}
                  disabled={isCurrentVariationOutOfStock}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-md p-1.5 font-bold focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                >
                  {[1, 2, 3, 4, 5, 10]
                    .filter((n) => n <= Math.max(1, currentVariantStock))
                    .map((num) => (
                      <option key={num} value={num}>
                        {num} {num === 1 ? 'unidade' : 'unidades'}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-2 pt-2">
              <button
                disabled={isCurrentVariationOutOfStock}
                onClick={handleBuyNow}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black py-3 px-4 rounded-xl shadow-xs transition transform active:scale-98 text-sm cursor-pointer"
              >
                {isCurrentVariationOutOfStock
                  ? 'Variação Esgotada'
                  : selectedKit
                  ? `Comprar ${selectedKit.title}`
                  : 'Comprar agora'}
              </button>

              <button
                disabled={isCurrentVariationOutOfStock}
                onClick={handleAddToCart}
                className="w-full bg-blue-50 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed text-blue-700 font-extrabold py-3 px-4 rounded-xl transition text-sm border border-blue-200 cursor-pointer"
              >
                Adicionar ao carrinho
              </button>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCopyDirectLink}
                  className="w-full bg-gray-50 hover:bg-gray-100 text-gray-700 font-bold py-2 px-2 rounded-xl text-xs border border-gray-200 flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-600">Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-gray-500" />
                      <span>Copiar Link</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleOpenShareModal}
                  className="w-full bg-gray-50 hover:bg-gray-100 text-blue-700 font-bold py-2 px-2 rounded-xl text-xs border border-blue-200 flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>Partilhar</span>
                </button>
              </div>
            </div>

            {/* Trust Policies */}
            <div className="space-y-2 text-xs text-gray-600 pt-3 border-t border-gray-100">
              <div className="flex items-start gap-2">
                <RotateCcw className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p>
                  <strong className="text-blue-600 font-semibold">Devolução grátis.</strong> Você
                  tem 30 dias a partir da data de recebimento.
                </p>
              </div>
              <div className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p>
                  <strong className="text-blue-600 font-semibold">Compra Garantida Nusali.</strong>{' '}
                  Receba o produto que está esperando ou devolvemos o dinheiro.
                </p>
              </div>
            </div>
          </div>

          {/* Seller Reputation Meter Box */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs space-y-3">
            <p className="text-xs font-bold text-gray-900 uppercase tracking-wider">
              Informações sobre o vendedor
            </p>

            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-gray-700" />
              <div>
                <p className="text-xs font-bold text-gray-900">
                  {product.seller?.name || 'Loja Oficial Nusali'}
                </p>
                {product.seller?.isOfficialStore && (
                  <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.2 rounded-xs">
                    Loja Oficial Mercado Nusali
                  </span>
                )}
              </div>
            </div>

            {/* Reputation Level Indicator */}
            {product.seller?.reputationLevel === 'platinum' && (
              <div className="flex items-center gap-1.5 text-xs font-bold text-green-700 bg-green-50 p-2 rounded-md border border-green-200">
                <Award className="w-4 h-4 text-green-600 shrink-0" />
                <span>Vendedor Platinum Nusali</span>
              </div>
            )}

            {/* Color Bar Reputation Scale */}
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-gray-500">Reputação do vendedor:</p>
              <div className="grid grid-cols-5 gap-1 h-2">
                <div className="bg-red-300 rounded-l-xs" />
                <div className="bg-orange-300" />
                <div className="bg-yellow-300" />
                <div className="bg-lime-400" />
                <div className="bg-green-600 rounded-r-xs shadow-xs" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-[10px] text-gray-600 pt-2 border-t border-gray-100">
              <div>
                <p className="font-extrabold text-gray-900 text-xs">
                  {product.seller?.salesCount || 100}+
                </p>
                <p>Vendas concretizadas</p>
              </div>
              <div>
                <p className="font-extrabold text-green-700 text-xs">Excelente</p>
                <p>Bom atendimento</p>
              </div>
              <div>
                <p className="font-extrabold text-green-700 text-xs">No prazo</p>
                <p>Envio imediato</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Complete Description Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-gray-200 pb-3 flex-wrap gap-2">
          <h2 className="text-lg font-bold text-gray-900">
            Descrição do produto
          </h2>
          {selectedColor && (
            <span className="text-xs bg-blue-50 text-blue-800 font-bold px-2.5 py-1 rounded-full border border-blue-200/70 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-blue-600" />
              Exibindo detalhes da cor: <strong>{selectedColor}</strong>
            </span>
          )}
        </div>

        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
          {activeDescription}
        </p>

        {/* Specs Table */}
        {activeSpecs && Object.keys(activeSpecs).length > 0 && (
          <div className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">Especificações Técnicas Completas</h3>
              {selectedColor && (
                <span className="text-[11px] text-gray-500">
                  Valores adaptados para <strong>{selectedColor}</strong> {selectedSize ? `(${selectedSize})` : ''}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-gray-50 p-4 rounded-lg border border-gray-100 text-xs">
              {Object.entries(activeSpecs).map(([key, value]) => (
                <div
                  key={key}
                  className="flex justify-between py-1.5 border-b border-gray-200/60 last:border-none gap-2"
                >
                  <span className="font-semibold text-gray-600">{key}</span>
                  <span className="text-gray-900 text-right font-medium">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Perguntas e Respostas (Q&A Section) */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs space-y-6">
        <h2 className="text-lg font-bold text-gray-900 border-b border-gray-200 pb-3">
          Perguntas e respostas
        </h2>

        {/* Question Form */}
        <form onSubmit={handleAskQuestion} className="space-y-3">
          <label className="block text-sm font-semibold text-gray-800">
            Pergunte ao vendedor:
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              placeholder="Escreva sua dúvida aqui... Ex: Tem a pronta entrega?"
              className="flex-1 px-4 py-2.5 text-sm border border-gray-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              required
            />
            <button
              type="submit"
              disabled={isAnsweringQuestion}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2.5 rounded-md text-sm transition disabled:opacity-60 shrink-0"
            >
              {isAnsweringQuestion ? 'Vendedor respondendo...' : 'Perguntar'}
            </button>
          </div>
          {questionSubmitted && (
            <p className="text-xs text-green-700 font-semibold bg-green-50 p-2 rounded-md">
              ✓ Pergunta enviada ao vendedor!
            </p>
          )}
        </form>

        {/* Question List */}
        <div className="space-y-4 pt-2">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            Últimas perguntas feitas:
          </h3>
          {product.questions && product.questions.length > 0 ? (
            product.questions.map((q) => (
              <div key={q.id} className="space-y-1.5 text-xs border-b border-gray-100 pb-3">
                <p className="font-medium text-gray-900 flex items-center gap-2">
                  <MessageSquare className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  {q.question}
                </p>
                {q.answer && (
                  <p className="text-gray-600 pl-5 bg-gray-50 p-2 rounded-md border-l-2 border-blue-500">
                    <strong className="text-gray-800">Resposta do vendedor:</strong> {q.answer}
                  </p>
                )}
              </div>
            ))
          ) : (
            <p className="text-xs text-gray-500 italic">
              Nenhuma pergunta feita ainda. Seja o primeiro a perguntar!
            </p>
          )}
        </div>
      </div>

      {/* Opinions & Reviews */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs space-y-6">
        <h2 className="text-lg font-bold text-gray-900 border-b border-gray-200 pb-3">
          Opiniões dos compradores
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Rating Summary */}
          <div className="md:col-span-4 flex flex-col items-center justify-center p-4 bg-gray-50 rounded-lg text-center border border-gray-100">
            <span className="text-4xl font-black text-gray-900">{product.rating}</span>
            <div className="flex items-center text-amber-400 my-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star key={s} className="w-4 h-4 fill-amber-400" />
              ))}
            </div>
            <p className="text-xs text-gray-500 font-medium">
              Média baseada em {product.reviewsCount} avaliações
            </p>
          </div>

          {/* Review items */}
          <div className="md:col-span-8 space-y-4">
            {product.reviews && product.reviews.length > 0 ? (
              product.reviews.map((rev) => (
                <div key={rev.id} className="border-b border-gray-100 pb-4 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1 text-amber-400">
                      {[...Array(rev.rating)].map((_, i) => (
                        <Star key={i} className="w-3.5 h-3.5 fill-amber-400" />
                      ))}
                      <span className="font-bold text-gray-900 ml-2">{rev.title}</span>
                    </div>
                    <span className="text-gray-400 text-[11px]">{rev.date}</span>
                  </div>
                  <p className="text-xs text-gray-700 leading-relaxed">{rev.comment}</p>
                  <div className="flex items-center gap-3 text-[11px] text-gray-500 pt-1">
                    <span className="text-green-700 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-green-600" /> Compra verificada
                    </span>
                    <button className="hover:text-blue-600 flex items-center gap-1">
                      <ThumbsUp className="w-3 h-3" /> É útil ({rev.likes})
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-gray-500 italic">Nenhuma avaliação detalhada ainda.</p>
            )}
          </div>
        </div>
      </div>

      {/* Fullscreen Interactive Zoom & Media Lightbox Modal */}
      <ProductMediaViewerModal
        isOpen={isMediaViewerOpen}
        onClose={() => setIsMediaViewerOpen(false)}
        items={mediaItems}
        initialIndex={selectedMediaIndex}
        productTitle={product.title}
      />

      {/* Share & Copy Link Modal */}
      <ProductShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        product={product}
      />
    </div>
  );
};
