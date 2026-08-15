import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Star, ShoppingCart, ShieldCheck, Film, Image as ImageIcon, ZoomIn, Share2, Globe, Layers, Palette } from 'lucide-react';
import { Product } from '../types';
import { useCart } from '../hooks/useCart';
import { useFavorites } from '../hooks/useFavorites';
import { ProductShareModal } from './ProductShareModal';
import { getCountryFlag, getCountryName } from '../utils/currencyUtils';

interface ProductCardProps {
  product: Product;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const navigate = useNavigate();
  const { addItem } = useCart();
  const { toggleFavorite, isFavorite } = useFavorites();
  const favorited = isFavorite(product.id);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const openProductDetail = (id: string) => {
    navigate(`/products/${id}`);
  };

  const handleQuickCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const url = `${window.location.origin}/products/${product.id}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpenShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsShareModalOpen(true);
  };

  const hasVideo = Boolean(product.videoUrl || product.shortVideo || (product.videos && product.videos.length > 0));
  const imagesCount = product.galleryImages && product.galleryImages.length > 0 ? product.galleryImages.length : 1;

  const priceValue = typeof product.price === 'number' ? product.price : parseFloat(product.price as any) || 0;
  const installmentsMax = product.installmentsMax || 1;

  const installmentAmount = (priceValue / installmentsMax).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const formattedPrice = priceValue.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const formattedOriginalPrice = product.originalPrice?.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div className="bg-white rounded-lg border border-gray-200 hover:shadow-xl transition-all duration-200 flex flex-col justify-between overflow-hidden group relative">
      {/* Top badges: Favorite button + Share button + Offer tag */}
      <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-10 pointer-events-none">
        {product.offerOfDay ? (
          <span className="bg-[#fff159] text-blue-950 font-black text-[10px] px-2 py-0.5 rounded-xs tracking-wider shadow-xs uppercase pointer-events-auto">
            Oferta do dia
          </span>
        ) : (
          <span />
        )}

        <div className="flex items-center gap-1.5 pointer-events-auto">
          {/* Quick Copy / Share Button */}
          <button
            onClick={handleOpenShare}
            className="p-1.5 bg-white/90 hover:bg-white rounded-full shadow-md text-gray-500 hover:text-blue-600 transition cursor-pointer"
            title="Partilhar ou copiar link do produto"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>

          {/* Favorite Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(product.id);
            }}
            className="p-1.5 bg-white/90 hover:bg-white rounded-full shadow-md text-gray-400 hover:text-red-500 transition cursor-pointer"
            title={favorited ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
          >
            <Heart
              className={`w-3.5 h-3.5 ${favorited ? 'fill-red-500 text-red-500' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* Product Image with Media Indicators */}
      <div
        onClick={() => openProductDetail(product.id)}
        className="cursor-pointer overflow-hidden p-4 bg-gray-50 flex items-center justify-center h-48 sm:h-52 relative group/img"
      >
        <img
          src={product.image}
          alt={product.title}
          className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />

        {/* Media Badges overlay */}
        <div className="absolute bottom-2 left-2 flex items-center gap-1.5 z-10 pointer-events-none">
          {hasVideo && (
            <span className="bg-emerald-600/90 backdrop-blur-xs text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1 shadow-xs">
              <Film className="w-2.5 h-2.5 fill-white" /> Vídeo
            </span>
          )}
          {imagesCount > 1 && (
            <span className="bg-black/60 backdrop-blur-xs text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-md flex items-center gap-1">
              <ImageIcon className="w-2.5 h-2.5" /> {imagesCount}
            </span>
          )}
        </div>

        {/* Hover zoom hint */}
        <div className="absolute top-2 right-12 opacity-0 group-hover/img:opacity-100 transition-opacity bg-white/90 text-gray-800 p-1 rounded-md shadow-xs pointer-events-none">
          <ZoomIn className="w-3.5 h-3.5 text-blue-600" />
        </div>
      </div>

      {/* Card Info */}
      <div className="p-4 flex flex-col flex-1 justify-between border-t border-gray-100">
        <div>
          {/* Title */}
          <h3
            onClick={() => openProductDetail(product.id)}
            className="text-xs sm:text-sm font-normal text-gray-800 hover:text-blue-600 line-clamp-2 cursor-pointer mb-2 leading-snug"
            title={product.title}
          >
            {product.title}
          </h3>

          {/* Price Block */}
          <div className="space-y-0.5">
            {product.originalPrice && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 line-through">
                  R$ {formattedOriginalPrice}
                </span>
                {product.discountPercentage && (
                  <span className="text-xs font-semibold text-green-600">
                    {product.discountPercentage}% OFF
                  </span>
                )}
              </div>
            )}

            <div className="flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-semibold text-gray-900 tracking-tight">
                R$ {formattedPrice}
              </span>
            </div>

            {/* Installment Badge */}
            <p className="text-[11px] text-green-700 font-medium">
              em {product.installmentsMax}x R$ {installmentAmount}{' '}
              {product.installmentsInterestFree && 'sem juros'}
            </p>
          </div>

          {/* Shipping & International Badges */}
          <div className="mt-2 space-y-1">
            {/* International Origin Badge */}
            {product.shipping?.isInternational && (
              <div className="flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50/90 px-1.5 py-0.5 rounded-md border border-indigo-200">
                <Globe className="w-3 h-3 text-indigo-600 shrink-0" />
                <span>
                  Internacional • {getCountryFlag(product.shipping?.originCountry || product.originCountry)}{' '}
                  {getCountryName(product.shipping?.originCountry || product.originCountry)}
                </span>
              </div>
            )}

            {/* Kits / Multi-pack badge if available */}
            {product.productKits && product.productKits.length > 0 && (
              <div className="flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-200">
                <Layers className="w-3 h-3 text-amber-600 shrink-0" />
                <span>Kits disponíveis (até {Math.max(...product.productKits.map(k => k.quantity))}x)</span>
              </div>
            )}

            {/* Color variations indicator */}
            {product.availableColors && product.availableColors.length > 0 && (
              <div className="flex items-center gap-1 text-[10px] text-gray-500 font-medium">
                <Palette className="w-3 h-3 text-gray-400 shrink-0" />
                <span>{product.availableColors.length} cores disponíveis</span>
              </div>
            )}

            {product.shipping?.freeShipping && (
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-green-700">
                <span>⚡ FRETE GRÁTIS</span>
                {product.shipping?.fullFulfilled && (
                  <span className="bg-green-600 text-white font-black text-[9px] px-1 py-0.2 rounded-xs uppercase tracking-wider">
                    FULL
                  </span>
                )}
              </div>
            )}

            {product.shipping?.arrivesTomorrow && !product.shipping?.isInternational && (
              <p className="text-[11px] font-semibold text-green-700">
                Chega amanhã
              </p>
            )}
            {product.shipping?.isInternational && (
              <p className="text-[10px] font-medium text-indigo-700">
                Entrega CPLP Global • {product.shipping?.estimatedDays || 8} a {(product.shipping?.estimatedDays || 8) + 4} dias
              </p>
            )}
          </div>

          {/* Seller reputation badge */}
          {product.seller?.isOfficialStore && (
            <p className="mt-2 text-[10px] text-gray-500 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-blue-600" />
              Por {product.seller?.name || 'Vendedor Oficial'}
            </p>
          )}

          {/* Star Rating */}
          <div className="mt-2 flex items-center gap-1 text-[11px] text-gray-500">
            <div className="flex items-center text-amber-400">
              <Star className="w-3 h-3 fill-amber-400" />
              <span className="ml-1 font-bold text-gray-800">{product.rating || 4.8}</span>
            </div>
            <span>({product.reviewsCount || 0})</span>
          </div>
        </div>

        {/* Quick Add to Cart Button */}
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-[10px] font-medium text-gray-400 uppercase">
            {product.condition === 'novo' ? 'Novo' : 'Usado'}
          </span>
          <button
            onClick={() => addItem(product, 1)}
            className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white px-3 py-1.5 rounded-md text-xs font-semibold transition"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>Adicionar</span>
          </button>
        </div>
      </div>

      {/* Share Modal */}
      <ProductShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        product={product}
      />
    </div>
  );
};
