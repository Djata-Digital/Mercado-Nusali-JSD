import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Heart, Star, ShoppingCart, ShieldCheck, Film, Image as ImageIcon, Share2, Globe, Layers, Palette, Truck, ListChecks, Loader2, Check } from 'lucide-react';
import { Product } from '../types';
import { CartService } from '../services/cartService';
import { emitCartUpdated } from '../services/cartEvents';
import { useFavorites } from '../hooks/useFavorites';
import { usePreferences } from '../context/PreferencesContext';
import { ProductShareModal } from './ProductShareModal';
import { getCountryFlag, getCountryName, formatCurrency } from '../utils/currencyUtils';
import { cardDiscountPercent, cardDeliveryLine, hasRealReviews } from '../utils/productCardInfo';

interface ProductCardProps {
  product: Product;
}

/**
 * Cartão de produto das listagens. No celular é COMPACTO (grade de 2 colunas, ~4 cartões por tela de conteúdo): imagem quadrada sem corte, nome em até
 * 2 linhas, preço, desconto real e uma linha curta de entrega, com o botão de compra em ícone. Elementos secundários (parcelas, kits, cores, selos,
 * reputação, avaliações) só aparecem a partir de `sm`. Nada é inventado: avaliação só com avaliações reais, desconto calculado dos preços reais, e a
 * entrega mostra apenas o que é verdade (o catálogo já só lista produtos entregáveis ao país escolhido) — nunca "frete grátis" nem prazo fictício.
 */
export const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const navigate = useNavigate();
  const { toggleFavorite, isFavorite } = useFavorites();
  const { formatPrice, selectedCountry, showToast } = usePreferences();
  const favorited = isFavorite(product.id);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  const openProductDetail = (id: string) => {
    navigate(`/products/${id}`);
  };

  const handleOpenShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsShareModalOpen(true);
  };

  const hasVideo = Boolean(product.videoUrl || product.shortVideo || (product.videos && product.videos.length > 0));
  const imagesCount = product.galleryImages && product.galleryImages.length > 0 ? product.galleryImages.length : 1;

  const priceValue = typeof product.price === 'number' ? product.price : parseFloat(product.price as any) || 0;
  const origPriceValue = product.originalPrice ? (typeof product.originalPrice === 'number' ? product.originalPrice : parseFloat(product.originalPrice as any)) : null;
  const installmentsMax = product.installmentsMax || 1;
  const productCurrency = product.currency || 'XOF';

  const priceInfo = formatPrice(priceValue, productCurrency);
  const origPriceInfo = origPriceValue ? formatPrice(origPriceValue, productCurrency) : null;
  const discount = cardDiscountPercent(priceValue, origPriceValue);
  const deliveryLine = cardDeliveryLine(getCountryName(selectedCountry) || selectedCountry);

  // FASE D16-C2.1 — produto com variantes reais ativas nunca é adicionado
  // direto daqui: o cartão não tem como saber cor/tamanho, e escolher a
  // primeira variante sozinho é exatamente o fallback silencioso que foi
  // corrigido no D16-C2. Leva ao detalhe para o comprador selecionar antes
  // de comprar.
  const isVariableProduct = Boolean(product.hasVariants);
  const buyLabel = isVariableProduct ? 'Ver opções' : 'Adicionar';

  // O clique do botão NÃO sobe para o cartão (antes, "Adicionar" também abria a página do produto). Produto com variações obrigatórias nunca é adicionado
  // daqui: leva à página do produto (no topo), onde cor/tamanho/etc. são escolhidos e validados antes de comprar. Produto simples: adiciona 1 unidade,
  // mostra o resultado real (sucesso ou a mensagem do servidor) e continua na listagem; o contador do cabeçalho se atualiza.
  const handleBuyClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isVariableProduct) {
      openProductDetail(product.id);
      return;
    }
    if (adding) return;
    setAdding(true);
    try {
      const updated = await CartService.addItem(product, 1);
      emitCartUpdated(updated);
      showToast('Produto adicionado ao carrinho.');
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 2000);
    } catch (err: any) {
      showToast(err?.message || 'Não foi possível adicionar ao carrinho. Tente novamente.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div data-testid="product-card" className="bg-white rounded-lg border border-gray-200 sm:hover:shadow-xl transition-all duration-200 flex flex-col overflow-hidden group relative h-full">
      {/* Imagem quadrada (object-contain: nunca corta o produto) com favorito/partilha e selo de oferta sobre ela */}
      <div className="relative w-full aspect-square bg-gray-50 flex items-center justify-center cursor-pointer" onClick={() => openProductDetail(product.id)}>
        {product.image ? (
          <img
            src={product.image}
            alt={product.title}
            loading="lazy"
            className="w-full h-full object-contain sm:group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400">
            <ImageIcon className="w-8 h-8" />
          </div>
        )}

        <div className="absolute top-1.5 left-1.5 right-1.5 flex items-start justify-between pointer-events-none">
          {product.offerOfDay ? (
            <span className="bg-[#fff159] text-blue-950 font-black text-[10px] px-1.5 py-0.5 rounded-xs tracking-wide shadow-xs uppercase pointer-events-auto">
              Oferta do dia
            </span>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-1 pointer-events-auto">
            {/* Partilhar: só a partir de `sm` (no celular o cartão fica enxuto; a página do produto continua com Partilhar) */}
            <button
              onClick={handleOpenShare}
              className="hidden sm:inline-flex p-1.5 bg-white/90 hover:bg-white rounded-full shadow-md text-gray-500 hover:text-blue-600 transition cursor-pointer"
              title="Partilhar ou copiar link do produto"
              aria-label="Partilhar produto"
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFavorite(product.id);
              }}
              className="inline-flex items-center justify-center w-8 h-8 sm:w-auto sm:h-auto sm:p-1.5 bg-white/90 hover:bg-white rounded-full shadow-md text-gray-400 hover:text-red-500 transition cursor-pointer"
              title={favorited ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
              aria-label={favorited ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
              aria-pressed={favorited}
            >
              <Heart className={`w-4 h-4 sm:w-3.5 sm:h-3.5 ${favorited ? 'fill-red-500 text-red-500' : ''}`} />
            </button>
          </div>
        </div>

        {/* Selos de mídia: só a partir de `sm` */}
        <div className="hidden sm:flex absolute bottom-1.5 left-1.5 items-center gap-1">
          {hasVideo && (
            <span className="bg-slate-900/90 text-amber-400 text-[10px] font-black px-1.5 py-0.5 rounded flex items-center gap-1 backdrop-blur-xs">
              <Film className="w-3 h-3 text-amber-400" />
              <span>VÍDEO</span>
            </span>
          )}
          {imagesCount > 1 && (
            <span className="bg-slate-900/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 backdrop-blur-xs">
              <ImageIcon className="w-3 h-3 text-gray-300" />
              <span>{imagesCount}</span>
            </span>
          )}
        </div>
      </div>

      <div className="p-1.5 sm:p-3 flex-1 flex flex-col gap-1 cursor-pointer" onClick={() => openProductDetail(product.id)}>
        {/* Nome: no máximo 2 linhas */}
        <h3 className="text-[13px] sm:text-sm font-normal text-gray-800 hover:text-blue-600 line-clamp-2 leading-snug">
          {/* C3.2 — link HTML real (rastreável). O clique no restante do cartão continua abrindo o produto via onClick do contêiner;
              stopPropagation evita navegar duas vezes quando o clique é no próprio link. */}
          <Link
            to={`/products/${encodeURIComponent(product.id)}`}
            title={product.title}
            onClick={(e) => e.stopPropagation()}
            className="block"
          >
            {product.title}
          </Link>
        </h3>

        {/* Preço + botão de compra (ícone no celular; texto a partir de `sm`) */}
        {/* mt-auto: o preço fica sempre no mesmo nível entre cartões da mesma linha (nomes de 1 ou 2 linhas) */}
        <div className="mt-auto flex items-end justify-between gap-1.5">
          <div className="min-w-0">
            {/* Desconto REAL (calculado dos preços; nunca inventado) — na mesma coluna do preço, sem linha extra */}
            {origPriceInfo && discount !== null && (
              <div className="flex items-center gap-1.5 text-[11px] leading-none mb-0.5" data-testid="product-card-discount">
                <span className="text-gray-400 line-through truncate">{origPriceInfo.formatted}</span>
                <span className="font-semibold text-green-600 whitespace-nowrap">{discount}% OFF</span>
              </div>
            )}
            <span className="block text-base sm:text-xl font-semibold text-gray-900 tracking-tight leading-tight" data-testid="product-card-price">
              {priceInfo.formatted}
            </span>
            {priceInfo.isConverted && (
              <span className="hidden sm:block text-[10px] text-gray-400 font-medium">Preço original: {priceInfo.originalFormatted}</span>
            )}
          </div>
          <button
            onClick={handleBuyClick}
            disabled={adding}
            className="shrink-0 inline-flex items-center justify-center gap-1.5 w-10 h-10 sm:w-auto sm:h-auto sm:px-3 sm:py-1.5 bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white disabled:opacity-60 rounded-full sm:rounded-md text-xs font-semibold transition cursor-pointer"
            title={isVariableProduct ? 'Escolher opções (cor, tamanho...) na página do produto' : 'Adicionar ao carrinho'}
            aria-label={`${isVariableProduct ? 'Escolher opções' : 'Adicionar ao carrinho'}: ${product.title}`}
            data-testid="product-card-buy"
            data-variable={isVariableProduct ? 'true' : 'false'}
          >
            {adding ? <Loader2 className="w-4 h-4 sm:w-3.5 sm:h-3.5 animate-spin" aria-hidden="true" /> : justAdded ? <Check className="w-4 h-4 sm:w-3.5 sm:h-3.5" aria-hidden="true" /> : isVariableProduct ? <ListChecks className="w-4 h-4 sm:w-3.5 sm:h-3.5" aria-hidden="true" /> : <ShoppingCart className="w-4 h-4 sm:w-3.5 sm:h-3.5" aria-hidden="true" />}
            <span className="hidden sm:inline">{justAdded ? 'Adicionado' : buyLabel}</span>
          </button>
        </div>

        {/* Entrega: uma linha curta e verdadeira */}
        <p className="flex items-center gap-1 text-[11px] text-gray-500 leading-tight truncate" data-testid="product-card-delivery">
          <Truck className="w-3 h-3 shrink-0 text-gray-400" aria-hidden="true" />
          <span className="truncate">{deliveryLine}</span>
        </p>

        {/* ===== Secundário: só a partir de `sm` ===== */}
        <div className="hidden sm:block space-y-1">
          {installmentsMax > 1 && (
            <p className="text-[11px] text-green-700 font-medium">
              em {installmentsMax}x de {formatCurrency(priceInfo.convertedAmount / installmentsMax, priceInfo.displayCurrency)}{' '}
              {product.installmentsInterestFree && 'sem juros'}
            </p>
          )}

          {product.shipping?.isInternational && (
            <div className="flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50/90 px-1.5 py-0.5 rounded-md border border-indigo-200">
              <Globe className="w-3 h-3 text-indigo-600 shrink-0" />
              <span>
                Internacional • {getCountryFlag(product.shipping?.originCountry || product.originCountry)}{' '}
                {getCountryName(product.shipping?.originCountry || product.originCountry)}
              </span>
            </div>
          )}

          {product.productKits && product.productKits.length > 0 && (
            <div className="flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-200">
              <Layers className="w-3 h-3 text-amber-600 shrink-0" />
              <span>Kits disponíveis (até {Math.max(...product.productKits.map(k => k.quantity))}x)</span>
            </div>
          )}

          {product.availableColors && product.availableColors.length > 0 && (
            <div className="flex items-center gap-1 text-[10px] text-gray-500 font-medium">
              <Palette className="w-3 h-3 text-gray-400 shrink-0" />
              <span>{product.availableColors.length} cores disponíveis</span>
            </div>
          )}

          {/* O selo "Frete Grátis" por produto, a promessa "Chega amanhã" e o prazo fictício "8 a 12 dias" foram removidos: não refletem a política real de
              frete nem a tarifa/prazo da rota (o prazo real aparece na página do produto). */}
          {product.shipping?.fullFulfilled && (
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-green-700">
              <span className="bg-green-600 text-white font-black text-[9px] px-1 py-0.2 rounded-xs uppercase tracking-wider">
                FULL
              </span>
            </div>
          )}

          {product.seller?.isOfficialStore && (
            <p className="text-[10px] text-gray-500 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-blue-600" />
              Por {product.seller?.name || 'Vendedor Oficial'}
            </p>
          )}

          {/* Avaliações: SÓ com avaliações reais (antes mostrava "0 (0)" em todo produto novo). */}
          {hasRealReviews(product.rating, product.reviewsCount) && (
            <div className="flex items-center gap-1 text-[11px] text-gray-500" data-testid="product-card-rating">
              <div className="flex items-center text-amber-400">
                <Star className="w-3 h-3 fill-amber-400" />
                <span className="ml-1 font-bold text-gray-800">{product.rating}</span>
              </div>
              <span>({product.reviewsCount})</span>
            </div>
          )}

          {/* Correção pré-piloto (condição opcional): sem condition real, não inventa "Novo"/"Usado". */}
          {(product.condition === 'novo' || product.condition === 'usado' || product.condition === 'recondicionado') && (
            <span className="block text-[10px] font-medium text-gray-400 uppercase">
              {product.condition === 'novo' ? 'Novo' : product.condition === 'usado' ? 'Usado' : 'Recondicionado'}
            </span>
          )}
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
