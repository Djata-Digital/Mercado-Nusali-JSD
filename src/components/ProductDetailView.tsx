import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { useCountries } from '../hooks/useCountries';
import { ShippingService, ShippingPreviewData } from '../services/shippingService';
import { useAuth } from '../context/AuthContext';
import { BuyerService } from '../services/buyerService';
import { ProductMediaViewerModal, MediaItem } from './ProductMediaViewerModal';
import { ProductShareModal } from './ProductShareModal';
import { ProductKit, ProductColor, ProductVariant } from '../types';
import {
  getActiveVariants,
  groupActiveVariantsByColor,
  getSizesForColor,
  resolveSelectedVariant,
  computeBuyerPriceDisplay,
  isVariantAvailable,
  getVariantMaxQuantity,
  getSelectionGuardMessage,
  computeMultiVariantSummary,
  buildPersistentProductGallery,
} from '../utils/productVariantBuyer';

export const ProductDetailView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isValidId = Boolean(id && id !== 'undefined' && id.trim() !== '');
  const { selectedCountry, formatPrice, showToast } = usePreferences();
  const { isAuthenticated } = useAuth();
  // Melhoria pré-piloto (elegibilidade por país): passa o destino real do
  // comprador para o backend calcular disponibilidade — nunca inferida aqui.
  // Cobre acesso via URL direta a um produto que não aparece mais no
  // catálogo filtrado (seção 7): o backend continua mostrando os dados do
  // produto, só marca availableForCountry=false para travar a compra.
  const { data: fetchedProduct, isLoading, isError } = useProduct(isValidId ? id! : '', selectedCountry);
  const { data: allProducts = [] } = useProducts();
  const rawProduct = isValidId ? (fetchedProduct || allProducts.find((p) => p.id === id)) : null;
  const product = rawProduct ? normalizeProduct(rawProduct) : null;
  const isUnavailableForDestination = product?.availableForCountry === false;

  const { addItem, addItemsBatch } = useCart();
  const { toggleFavorite, isFavorite } = useFavorites();
  // Correção pré-piloto (race condition/duplicação): "Adicionar ao carrinho" e
  // "Comprar agora" navegavam ANTES do addItem() (assíncrono) terminar — a
  // tela seguinte lia o carrinho antes da mutação estar persistida no
  // backend. Agora navega só depois do await resolver com sucesso, e o botão
  // fica desabilitado/com label de carregamento enquanto a operação está em
  // andamento, para que um segundo clique (por o primeiro "parecer" ter
  // falhado) não incremente a quantidade duas vezes.
  const [cartActionPending, setCartActionPending] = useState<'add' | 'buy' | null>(null);

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

  // FASE D16-C2 — Variações reais do produto. NUNCA mais
  // product.availableColors/availableSizes como fonte (campos fantasma,
  // nunca persistidos pelo backend — achado da auditoria D16-C1). Tudo
  // derivado de product.variants, a mesma lógica pura usada pelo wizard do
  // vendedor (D16-B1), adaptada para o comprador em productVariantBuyer.ts.
  const hasRealVariants = useMemo(() => getActiveVariants(product?.variants).length > 0, [product]);

  const colorGroups = useMemo(() => groupActiveVariantsByColor(product?.variants), [product]);

  const [selectedColor, setSelectedColor] = useState<string>('');
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [selectedKit, setSelectedKit] = useState<ProductKit | null>(null);

  // FASE D16-D2 — compra multi-variante estilo Alibaba: quantidades
  // independentes por variante (chave = productVariants.id REAL), em vez de
  // uma única `quantity` para a variante "selecionada". Resetado SOMENTE
  // quando o produto muda (nunca ao trocar de cor — D16-D1, seção 6: trocar
  // Preta -> Branca -> Preta não pode apagar Preta/M=2).
  const [variantQuantities, setVariantQuantities] = useState<Record<string, number>>({});

  // Reset a seleção sempre que o produto mudar (nunca herdar seleção de um
  // produto anterior ao navegar entre páginas de produto).
  useEffect(() => {
    setSelectedColor('');
    setSelectedSize('');
    setVariantQuantities({});
  }, [product?.id]);

  const selectedColorGroup = useMemo(
    () => colorGroups.find((g) => g.color === selectedColor) || null,
    [colorGroups, selectedColor]
  );

  // Tamanhos/capacidades REAIS existentes na cor selecionada (ou entre
  // todas as variantes ativas, se o produto não tem eixo de cor) — nunca
  // uma combinação cartesiana inventada.
  const sizesForSelectedColor = useMemo(
    () => getSizesForColor(product?.variants, selectedColor || null),
    [product, selectedColor]
  );

  // Variante concreta resolvida — NUNCA um fallback silencioso para
  // variants[0]. Só resolve sozinha quando a escolha é inequívoca (ver
  // resolveSelectedVariant); em qualquer outro caso fica null até o
  // comprador escolher.
  const activeVariant = useMemo<ProductVariant | null>(
    () => resolveSelectedVariant(product?.variants, { color: selectedColor || null, size: selectedSize || null }),
    [product, selectedColor, selectedSize]
  );

  // FASE D16-D2 — este produto tem um eixo de tamanho/capacidade real
  // (independente da cor atualmente escolhida)? Se sim, a experiência de
  // quantidade vira multi-variante (linhas com [-] qty [+]); se não (produto
  // simples, ou variável só por cor, sem tamanho), o fluxo de seleção única
  // do D16-C2 continua exatamente como antes (D16-D1, seção O).
  const hasSecondaryAxisOverall = useMemo(
    () => getActiveVariants(product?.variants).some((v) => !!(v.size || v.capacity)),
    [product]
  );
  const isMultiVariantMode = hasRealVariants && hasSecondaryAxisOverall;

  // Resumo puro (productVariantBuyer.ts) — nunca product.price, sempre o
  // preço REAL de cada variante com quantidade > 0, calculado sobre TODAS as
  // cores (não só a exibida agora), exatamente como o "8 unidades
  // selecionadas" do enunciado exige.
  const multiVariantSummary = useMemo(
    () => computeMultiVariantSummary(product?.variants, variantQuantities),
    [product, variantQuantities]
  );
  // Comprar agora continua single-variant (D16-D1, seção 7/M): só pode
  // operar quando exatamente 1 variante tem quantidade > 0 — nunca
  // variants[0], nunca uma escolha ambígua entre várias.
  const buyNowSingleLine = multiVariantSummary.lines.length === 1 ? multiVariantSummary.lines[0] : null;

  // Handler for color selection (thumbnail no painel de opções, D16-C2).
  // FASE D16-D3 — a galeria agora é PERSISTENTE (todas as cores sempre
  // visíveis), então trocar de cor não "reseta" a galeria: em vez disso,
  // navega para a miniatura já existente daquela cor (item 3 do enunciado).
  const handleSelectColor = (colorName: string) => {
    setSelectedColor(colorName);
    // Trocar de cor invalida um tamanho que só existia na cor anterior.
    setSelectedSize((prev) => (getSizesForColor(product?.variants, colorName).includes(prev) ? prev : ''));
    const matchingMediaIndex = mediaItems.findIndex((m: any) => m.color === colorName);
    setSelectedMediaIndex(matchingMediaIndex >= 0 ? matchingMediaIndex : 0);
  };

  // FASE D16-D3 (itens 1/2/4 do enunciado) — clicar numa miniatura da
  // galeria lateral sempre troca a imagem principal; SÓ seleciona uma cor
  // quando aquela miniatura está vinculada de forma INEQUÍVOCA a uma cor
  // real (buildPersistentProductGallery nunca marca `color` em imagens
  // gerais nem em URLs compartilhadas por 2+ cores). Nunca apaga quantidades
  // de outras cores (não mexe em variantQuantities).
  const handleSelectMediaThumbnail = (idx: number) => {
    setSelectedMediaIndex(idx);
    const item = mediaItems[idx] as any;
    if (item?.type === 'image' && item.color && item.color !== selectedColor) {
      const colorName = item.color as string;
      setSelectedColor(colorName);
      setSelectedSize((prev) => (getSizesForColor(product?.variants, colorName).includes(prev) ? prev : ''));
    }
  };

  // Estoque: produto simples continua usando product.stock (já é live,
  // computeLiveStockAndSales); produto variável usa o estoque AO VIVO da
  // variante resolvida (inventory via availableStock, D16-C2) — nunca a
  // coluna product_variants.stock legada.
  const currentVariantStock = hasRealVariants ? getVariantMaxQuantity(activeVariant) : (product?.stock ?? 10);
  const needsVariantSelection = hasRealVariants && !activeVariant;
  const isCurrentVariationOutOfStock = hasRealVariants
    ? (!needsVariantSelection && !isVariantAvailable(activeVariant))
    : currentVariantStock <= 0;

  // Build unified media items array (images + short videos). FASE D16-D3 —
  // a parte de IMAGENS agora é PERSISTENTE: todas as imagens gerais do
  // produto + a imagem de CADA cor real ficam sempre na lista, independente
  // de qual cor está selecionada agora (buildPersistentProductGallery,
  // productVariantBuyer.ts). Nunca mais reconstruída/removida ao trocar de
  // cor — só a seleção (índice ativo) muda, nunca o conjunto.
  const mediaItems: MediaItem[] = useMemo(() => {
    if (!product) return [];

    const items: MediaItem[] = [];

    const persistentImages = buildPersistentProductGallery(product.galleryImages, product.variants);
    const uniqueImages = persistentImages.length > 0 ? persistentImages : [{ url: product.image, type: 'image' as const, source: 'general' as const }];

    uniqueImages.forEach((img, idx) => {
      items.push({
        type: 'image',
        url: img.url,
        title: `${product.title}${img.color ? ` - ${img.color}` : ''} - Foto ${idx + 1}`,
        // Campo local (fora do tipo global MediaItem) usado só para resolver
        // a cor ao clicar numa miniatura da galeria (D16-D3) — nunca enviado
        // a nenhum backend, nunca usado como variantId/SKU.
        ...(img.color ? { color: img.color } : {}),
      } as MediaItem);
    });

    // 2. Short Videos (from active variant, or base product)
    const videoSource =
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
                : uniqueImages[0]?.url || product.image,
          });
        }
      });
    } else if (product.shortVideo && product.shortVideo.url) {
      items.push({
        type: 'video',
        url: product.shortVideo.url,
        title: product.shortVideo.title || 'Vídeo Demonstrativo do Produto',
        duration: product.shortVideo.duration || '0:25',
        thumbnail: product.shortVideo.thumbnail || uniqueImages[0]?.url || product.image,
      });
    } else if (product.videoUrl) {
      items.push({
        type: 'video',
        url: product.videoUrl,
        title: 'Vídeo Demonstrativo do Produto',
        duration: '0:30',
        thumbnail: uniqueImages[0]?.url || product.image,
      });
    }

    return items;
  }, [product, activeVariant, selectedColor]);

  // Dynamic Description and Specs based on selected variant
  const activeDescription = useMemo(() => {
    if (!product) return '';
    if (activeVariant?.description) return activeVariant.description;
    return product.description;
  }, [product, activeVariant]);

  const activeSpecs = useMemo(() => {
    if (!product) return {};
    const specsMap = { ...(product.specs || {}) };
    if (selectedColor) {
      specsMap['Cor / Variação'] = selectedColor;
    }
    if (selectedSize) {
      specsMap['Tamanho / Especificação'] = selectedSize;
    }
    if (activeVariant?.specs) {
      Object.assign(specsMap, activeVariant.specs);
    }
    return specsMap;
  }, [product, selectedColor, selectedSize, activeVariant]);

  // FASE D16-G2.0.1 — bugfix de crash: hooks NUNCA podem ficar depois de um
  // early return condicionado por product/isLoading (violação das Regras
  // dos Hooks — "Rendered more hooks than during the previous render",
  // capturado pelo Error Boundary como "Algo deu errado ao carregar a
  // página"). Todos os hooks abaixo (antes existentes após os early
  // returns de isValidId/isLoading/product ausente) foram movidos para
  // ANTES deles, com segurança null-safe interna (mesmo padrão já usado
  // pelos hooks acima, ex.: `product?.variants`) em vez de depender da
  // posição do código para nunca rodar com product ainda ausente.
  const buyerPriceDisplay = useMemo(
    () => computeBuyerPriceDisplay(product?.variants, activeVariant),
    [product, activeVariant]
  );

  const [isAnsweringQuestion, setIsAnsweringQuestion] = useState(false);

  // FASE D16-G2 — a condição real de entrega (frete) precisa aparecer ANTES
  // de Comprar/Adicionar ao carrinho, não só depois de clicar em Comprar.
  // Usa o MESMO motor de decisão logística real do checkout (F4/F3 — smart
  // fulfillment, read-only, nunca reserva estoque) em vez do motor legado
  // país/zona (achado D16-G0: staging tem tarifas reais só no modelo F3 por
  // setor, então o motor legado sempre respondia SHIPPING_RATE_NOT_AVAILABLE
  // mesmo com tarifa cadastrada). destinationCountry (selectedCountry, do
  // PreferencesContext) continua sendo SOMENTE o destino real do comprador
  // — D16-G1: catalogOriginFilter nunca entra aqui, nunca é confundido com
  // destino de entrega.
  const { data: operationalCountriesForDelivery } = useCountries();

  // Setor de entrega: EXCLUSIVAMENTE do endereço padrão real do comprador
  // autenticado (fonte já usada por CheckoutView.tsx) — nunca inferido por
  // cidade/texto. Convidado (ou autenticado sem nenhum endereço com setor)
  // nunca chama o preview — mostra o estado explícito DELIVERY_SECTOR_REQUIRED
  // (seção 3 do enunciado), nunca SHIPPING_RATE_NOT_AVAILABLE.
  const { data: buyerAddresses } = useQuery({
    queryKey: ['buyer-addresses-for-shipping-preview'],
    queryFn: async () => {
      const res = await BuyerService.getAddresses();
      return res.success && Array.isArray(res.data) ? res.data : [];
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60,
  });
  const defaultDeliveryAddress = useMemo(() => {
    if (!buyerAddresses || buyerAddresses.length === 0) return null;
    return buyerAddresses.find((a: any) => a.isDefault) || buyerAddresses[0];
  }, [buyerAddresses]);
  const destinationShippingSectorId: string | null = defaultDeliveryAddress?.shippingSectorId || null;

  const [deliveryPreview, setDeliveryPreview] = useState<{
    loading: boolean;
    available: boolean;
    shippingAmount: number;
    currency: string;
    serviceCode?: string;
    serviceName?: string;
    code?: string;
    message?: string;
  } | null>(null);

  useEffect(() => {
    let isMounted = true;

    // Produto ainda não carregado (ou não encontrado) — este hook roda em
    // TODO render (regra dos hooks), mas a lógica de negócio só decide algo
    // depois que o produto real estiver disponível.
    if (!product) {
      setDeliveryPreview(null);
      return;
    }

    // Seção 4 — não calcula uma cotação definitiva enquanto o produto
    // exigir variante e nenhuma válida estiver selecionada ainda.
    if (needsVariantSelection || isUnavailableForDestination || product.availableForCountry === false) {
      setDeliveryPreview(null);
      return;
    }

    // Seção 3 — setor ausente é um estado PRÓPRIO, nunca "sem tarifa".
    // Backend também valida isto de forma independente (defesa em
    // profundidade) — aqui só evita uma requisição desnecessária.
    if (!destinationShippingSectorId) {
      setDeliveryPreview({ loading: false, available: false, shippingAmount: 0, currency: product.currency || 'XOF', code: 'DELIVERY_SECTOR_REQUIRED', message: 'Selecione um endereço de entrega para calcular o frete.' });
      return;
    }

    setDeliveryPreview((prev) => ({ ...(prev || { loading: true, available: false, shippingAmount: 0, currency: product.currency || 'XOF' }), loading: true }));

    ShippingService.getPreview({
      productId: product.id,
      variantId: activeVariant?.id || null,
      quantity,
      destinationShippingSectorId,
    }).then((res) => {
      if (!isMounted) return;
      if (res.success && res.data) {
        const data: ShippingPreviewData = res.data;
        if (data.available === true) {
          setDeliveryPreview({
            loading: false,
            available: true,
            shippingAmount: data.shippingAmount,
            currency: data.currency,
            serviceCode: data.serviceCode,
            serviceName: data.serviceName,
          });
        } else {
          const unavailableCode: string = data.code;
          const unavailableMessage: string = data.message;
          setDeliveryPreview({ loading: false, available: false, shippingAmount: 0, currency: product.currency || 'XOF', code: unavailableCode, message: unavailableMessage });
        }
      } else {
        setDeliveryPreview({ loading: false, available: false, shippingAmount: 0, currency: product.currency || 'XOF', code: res.error?.code, message: res.error?.message || 'Frete indisponível para este destino no momento.' });
      }
    });

    return () => { isMounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id, activeVariant?.id, quantity, destinationShippingSectorId, needsVariantSelection, isUnavailableForDestination]);

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

  // FASE D16-C2 — produto variável: preço SEMPRE derivado das variantes
  // reais, nunca de product.price como autoridade depois de uma seleção.
  // Sem seleção -> "a partir de" (menor preço ativo). Com seleção -> preço
  // e riscado exclusivos da variante escolhida (riscado só se > preço dela
  // mesma). Produto simples: comportamento de sempre, intocado.
  // (buyerPriceDisplay agora é calculado mais acima, junto com os demais
  // hooks — D16-G2.0.1 — mas a lógica em si é idêntica.)
  const isPriceFromRange = hasRealVariants && buyerPriceDisplay.mode === 'from';
  const activeVariantPrice = hasRealVariants ? (buyerPriceDisplay.price ?? baseProductPrice) : baseProductPrice;
  const activeVariantOriginalPrice = hasRealVariants
    ? (buyerPriceDisplay.mode === 'selected' ? buyerPriceDisplay.originalPrice : undefined)
    : product.originalPrice;

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
  const originCountry = product.originCountry || product.shipping?.originCountry || product.seller?.country || '';

  // (isAnsweringQuestion, operationalCountriesForDelivery, buyerAddresses,
  // defaultDeliveryAddress, destinationShippingSectorId, deliveryPreview e o
  // useEffect do preview de frete agora são calculados mais acima, junto
  // com os demais hooks — D16-G2.0.1 — mas a lógica em si é idêntica.)
  const deliveryDestinationCountry = operationalCountriesForDelivery?.find((c) => c.code === selectedCountry);

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

  const handleBuyNow = async () => {
    if (cartActionPending) return; // ignora clique duplicado/duplo-clique enquanto já há uma operação em andamento

    // FASE D16-D2 (D16-D1, seção 7/M) — Comprar agora continua SINGLE-
    // VARIANT mesmo com a nova seleção multi-variante: só opera quando
    // exatamente 1 variante tem quantidade > 0. Nunca escolhe variants[0]
    // nem "a primeira com qty>0 entre várias" — ambíguo demais.
    if (isMultiVariantMode) {
      if (!buyNowSingleLine) {
        showToast(
          multiVariantSummary.totalUnits === 0
            ? 'Defina a quantidade da variação desejada antes de comprar agora.'
            : 'Comprar agora funciona com apenas 1 variação por vez. Para várias, use "Adicionar ao carrinho".'
        );
        return;
      }
      setCartActionPending('buy');
      try {
        await addItem(product, buyNowSingleLine.quantity, {
          color: buyNowSingleLine.variant.color,
          size: buyNowSingleLine.variant.size || buyNowSingleLine.variant.capacity,
          unitPriceOverride: buyNowSingleLine.variant.price,
          variantId: buyNowSingleLine.variantId,
          selectedVariantSku: buyNowSingleLine.variant.sku,
          selectedVariantImage: buyNowSingleLine.variant.imageUrl || product.image,
        });
        navigate('/checkout');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (err: any) {
        showToast(err?.message || 'Não foi possível preparar a compra. Tente novamente.');
      } finally {
        setCartActionPending(null);
      }
      return;
    }

    // FASE D16-C2 — bloqueio real: produto variável nunca envia a
    // requisição sem uma variante concreta e disponível resolvida. Nunca
    // cai silenciosamente em variants[0].
    const guardMessage = getSelectionGuardMessage(product.variants, { color: selectedColor || null, size: selectedSize || null });
    if (guardMessage) {
      showToast(guardMessage);
      return;
    }
    setCartActionPending('buy');
    try {
      const buyQty = selectedKit ? selectedKit.quantity : quantity;
      await addItem(product, buyQty, {
        color: selectedColor || undefined,
        size: selectedSize || undefined,
        kit: selectedKit || undefined,
        unitPriceOverride: effectiveUnitPrice,
        // ID real da variante (pvar_*) — é isso que vira a FK no carrinho.
        // NUNCA o SKU (correção do bug que causava 500 em CART_ADD_FAILED).
        variantId: activeVariant?.id,
        selectedVariantSku: activeVariant?.sku,
        selectedVariantImage: selectedColorGroup?.imageUrl || activeVariant?.imageUrl || product.image,
      });
      // Só navega depois que o item está confirmado no backend — o checkout
      // vai buscar o carrinho real (GET /cart) e já vai encontrá-lo lá.
      navigate('/checkout');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      showToast(err?.message || 'Não foi possível preparar a compra. Tente novamente.');
    } finally {
      setCartActionPending(null);
    }
  };

  // FASE D16-D2 (D16-D1, seção L) — UM único request batch, nunca um loop
  // de N chamadas de addItem no frontend (risco de estado parcial já
  // identificado na auditoria).
  const handleAddMultiVariantToCart = async () => {
    if (cartActionPending) return;
    if (multiVariantSummary.totalUnits === 0) return;
    setCartActionPending('add');
    try {
      await addItemsBatch(
        product,
        multiVariantSummary.lines.map((l) => ({
          variantId: l.variantId,
          quantity: l.quantity,
          color: l.variant.color,
          size: l.variant.size || l.variant.capacity,
        }))
      );
      navigate('/cart');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      showToast(err?.message || 'Não foi possível adicionar as variações ao carrinho. Tente novamente.');
    } finally {
      setCartActionPending(null);
    }
  };

  const handleAddToCart = async () => {
    if (cartActionPending) return;
    if (isMultiVariantMode) {
      return handleAddMultiVariantToCart();
    }
    const guardMessage = getSelectionGuardMessage(product.variants, { color: selectedColor || null, size: selectedSize || null });
    if (guardMessage) {
      showToast(guardMessage);
      return;
    }
    setCartActionPending('add');
    try {
      const buyQty = selectedKit ? selectedKit.quantity : quantity;
      await addItem(product, buyQty, {
        color: selectedColor || undefined,
        size: selectedSize || undefined,
        kit: selectedKit || undefined,
        unitPriceOverride: effectiveUnitPrice,
        variantId: activeVariant?.id,
        selectedVariantSku: activeVariant?.sku,
        selectedVariantImage: selectedColorGroup?.imageUrl || activeVariant?.imageUrl || product.image,
      });
      navigate('/cart');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      showToast(err?.message || 'Não foi possível adicionar ao carrinho. Tente novamente.');
    } finally {
      setCartActionPending(null);
    }
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
        {originCountry ? (
          <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold px-3 py-1 rounded-full shadow-2xs">
            <span>{getCountryFlag(originCountry)}</span>
            <span>Vendido a partir de {getCountryName(originCountry)}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 text-gray-700 font-medium px-3 py-1 rounded-full shadow-2xs">
            <span>Origem não informada</span>
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
                    onClick={() => handleSelectMediaThumbnail(idx)}
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
              {/* Correção pré-piloto (condição opcional): sem condition real
                  (ex.: Manga, Banana), não mostra "Novo" nem "Usado" — só a
                  contagem de vendas, exatamente como no exemplo aprovado. */}
              {product.condition === 'novo' ? 'Novo | ' : product.condition === 'usado' ? 'Usado | ' : product.condition === 'recondicionado' ? 'Recondicionado | ' : ''}
              {product.salesCount || 0} vendidos
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
          {product.reviewsCount && product.reviewsCount > 0 ? (
            <div className="flex items-center gap-2 text-xs">
              <div className="flex items-center text-amber-400">
                <Star className="w-4 h-4 fill-amber-400" />
                <span className="ml-1 font-bold text-gray-900 text-sm">{product.rating}</span>
              </div>
              <span className="text-gray-400">({product.reviewsCount} avaliações)</span>
            </div>
          ) : (
            <div className="text-xs text-gray-400 font-medium">Sem avaliações até o momento</div>
          )}

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
              {/* FASE D16-C2 — sem variante concreta selecionada ainda,
                  nunca afirmamos "o preço é X": é sempre "a partir de". */}
              {isPriceFromRange && !selectedKit && (
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">A partir de</span>
              )}
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

            {instMax > 1 && product.installmentsMax && product.installmentsMax > 1 && (
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

          {/* 2. SELETOR DE CORES — FASE D16-C2. Derivado de product.variants
              (nunca product.availableColors, campo fantasma). Uma
              miniatura por COR real, nunca uma por combinação — a imagem é
              sempre variant.imageUrl (nunca .image, que só existe em mock). */}
          {colorGroups.length > 0 && (
            <div className="space-y-2.5 pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-800">
                  Cor: <strong className="text-gray-900 font-extrabold ml-1">{selectedColor || 'Escolha uma opção'}</strong>
                </span>
                <span className="text-gray-500 text-[11px] font-medium">{colorGroups.length} opções disponíveis</span>
              </div>

              {/* Grid de Miniaturas de Produtos (Como no Mercado Livre) */}
              <div className="flex flex-wrap gap-2.5 items-center">
                {colorGroups.map((group) => {
                  const isSelected = selectedColor === group.color;
                  const thumbImg = group.imageUrl || product.image;
                  const groupAvailable = group.variants.some((v) => (v.availableStock ?? 0) > 0);

                  return (
                    <button
                      key={group.color}
                      type="button"
                      onClick={() => handleSelectColor(group.color)}
                      title={`Selecionar cor: ${group.color}`}
                      className={`relative w-16 h-16 sm:w-18 sm:h-18 rounded-lg overflow-hidden border-2 transition-all cursor-pointer bg-white group p-0.5 shrink-0 ${
                        isSelected
                          ? 'border-blue-600 ring-2 ring-blue-500/25 shadow-xs scale-102'
                          : 'border-gray-200 hover:border-gray-400 opacity-85 hover:opacity-100'
                      } ${!groupAvailable ? 'opacity-40' : ''}`}
                    >
                      <img
                        src={thumbImg}
                        alt={group.color}
                        className="w-full h-full object-cover rounded-md group-hover:scale-105 transition-transform duration-200"
                      />

                      {/* Check badge when selected */}
                      {isSelected && (
                        <div className="absolute top-1 right-1 bg-blue-600 text-white p-0.5 rounded-full shadow-xs">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. QUANTIDADES POR TAMANHO/CAPACIDADE — FASE D16-D2 (estilo
              Alibaba). Só mostra as opções que REALMENTE existem na cor
              escolhida (nunca uma combinação cartesiana inventada); se o
              produto tem eixo de cor, espera a cor ser escolhida primeiro.
              Cada linha tem sua PRÓPRIA quantidade — trocar de cor NUNCA
              apaga a quantidade das outras cores (D16-D1, seção 6). */}
          {sizesForSelectedColor.length > 0 && (colorGroups.length === 0 || !!selectedColor) && (
            <div className="space-y-2 pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-800">
                  Tamanho{selectedColor ? ` (${selectedColor})` : ''}:
                </span>
                <span className="text-gray-500 text-[11px]">Guia de tamanhos</span>
              </div>

              <div className="flex flex-col gap-2">
                {sizesForSelectedColor.map((s, idx) => {
                  // Variante real dessa combinação (cor já escolhida + este
                  // tamanho) — nunca "qualquer variante com esse tamanho".
                  const varItem = product.variants?.find(
                    (v) =>
                      (v.size || v.capacity) === s &&
                      (!selectedColor || v.color === selectedColor) &&
                      v.isActive !== false
                  );

                  const rowMax = getVariantMaxQuantity(varItem);
                  const rowAvailable = isVariantAvailable(varItem);
                  const rowQty = varItem ? variantQuantities[varItem.id] || 0 : 0;
                  const rowPrice = varItem?.price;
                  const rowOriginalPrice = varItem?.originalPrice;

                  const applyRowQty = (nextQty: number) => {
                    if (!varItem) return;
                    const clamped = Math.max(0, Math.min(rowMax, nextQty));
                    setVariantQuantities((prev) => ({ ...prev, [varItem.id]: clamped }));
                    // Mantém imagem/preço/"Disponibilidade" (painel à direita)
                    // sincronizados com a ÚLTIMA linha tocada — nunca apaga
                    // quantidades de outras linhas/cores ao fazer isso.
                    setSelectedSize(s);
                  };

                  return (
                    <div
                      key={idx}
                      className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg border transition ${
                        !rowAvailable
                          ? 'border-gray-200 bg-gray-50 opacity-60'
                          : rowQty > 0
                          ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-500/20'
                          : 'border-gray-300 bg-white'
                      }`}
                    >
                      <div className="flex flex-col min-w-0">
                        <span className={`text-xs font-bold ${rowAvailable ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                          {s}
                        </span>
                        <span className="text-[11px] flex items-center gap-1.5 flex-wrap">
                          {rowPrice !== undefined && rowPrice > 0 && (
                            <span className="text-gray-600 font-semibold">{formatCurrency(rowPrice, productCurrency)}</span>
                          )}
                          {rowOriginalPrice !== undefined && rowPrice !== undefined && rowOriginalPrice > rowPrice && (
                            <span className="text-gray-400 line-through">{formatCurrency(rowOriginalPrice, productCurrency)}</span>
                          )}
                          {!rowAvailable ? (
                            <span className="text-red-600 font-bold">Esgotado</span>
                          ) : rowMax > 0 && rowMax <= 5 ? (
                            <span className="text-amber-600 font-semibold">{rowMax} disponível{rowMax > 1 ? 'is' : ''}</span>
                          ) : null}
                        </span>
                      </div>

                      <div className="flex items-center border border-gray-300 rounded-md overflow-hidden bg-white shrink-0">
                        <button
                          type="button"
                          disabled={!rowAvailable || rowQty <= 0}
                          onClick={() => applyRowQty(rowQty - 1)}
                          className="px-2.5 py-1 text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed font-bold cursor-pointer disabled:cursor-not-allowed"
                        >
                          -
                        </button>
                        <span className="px-3 py-1 text-xs font-bold text-gray-900 min-w-[2rem] text-center">{rowQty}</span>
                        <button
                          type="button"
                          disabled={!rowAvailable || rowQty >= rowMax}
                          onClick={() => applyRowQty(rowQty + 1)}
                          className="px-2.5 py-1 text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed font-bold cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>
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
                  {product.weightKg ? `${product.weightKg} kg` : 'Não informado'}
                </strong>
              </div>
              <div>
                Dimensões:{' '}
                <strong className="text-gray-900">
                  {product.dimensionsCm
                    ? `${product.dimensionsCm.length}×${product.dimensionsCm.width}×${product.dimensionsCm.height} cm`
                    : 'Não informado'}
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Buy Box & Seller Info (3 cols) */}
        <div className="lg:col-span-3 space-y-4">
          {/* Buy Box Card */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs space-y-4">
            {/* ENTREGA — condição real de frete, ANTES dos botões de compra.
                FASE D16-G2: usa o preview smart fulfillment (F4/F3
                read-only) em vez do motor legado — mesma decisão de origem
                que o checkout (F6.2) realmente aplicaria, sem reservar
                estoque. Nunca mostra código interno em vermelho para o
                cliente (seção 9) — só as mensagens amigáveis já resolvidas
                pelo backend. */}
            <div className="space-y-2 bg-gray-50 p-3 rounded-xl border border-gray-200">
              <div className="flex items-center gap-2 font-bold text-sm text-gray-900">
                <Truck className="w-4.5 h-4.5 text-gray-700" />
                <span>Entrega</span>
              </div>

              <div className="text-xs text-gray-700 flex items-center justify-between">
                <span className="text-gray-500">Destino:</span>
                <span className="font-bold text-gray-900 flex items-center gap-1">
                  {deliveryDestinationCountry ? `${deliveryDestinationCountry.flag} ${deliveryDestinationCountry.name}` : selectedCountry}
                </span>
              </div>

              {isUnavailableForDestination && (
                <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 font-semibold">
                  {product.unavailabilityReason || 'Este produto não está disponível para entrega no seu país.'}
                </p>
              )}

              {!isUnavailableForDestination && needsVariantSelection && (
                <p className="text-[11px] text-gray-600">Selecione as opções para calcular a entrega.</p>
              )}

              {!isUnavailableForDestination && !needsVariantSelection && deliveryPreview?.loading && (
                <p className="text-xs text-gray-500 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Calculando entrega...
                </p>
              )}

              {!isUnavailableForDestination && !needsVariantSelection && !deliveryPreview?.loading && deliveryPreview?.available && (
                <div className="text-xs flex items-center justify-between">
                  <span className="text-gray-500">
                    Frete{deliveryPreview.serviceCode ? ` (${deliveryPreview.serviceCode})` : ''}:
                  </span>
                  <span className="font-black text-emerald-700">
                    {deliveryPreview.shippingAmount > 0
                      ? formatCurrency(deliveryPreview.shippingAmount, deliveryPreview.currency as any)
                      : 'GRÁTIS'}
                  </span>
                </div>
              )}

              {!isUnavailableForDestination && !needsVariantSelection && !deliveryPreview?.loading && deliveryPreview && deliveryPreview.available === false && deliveryPreview.code === 'DELIVERY_SECTOR_REQUIRED' && (
                <p className="text-[11px] text-gray-600 bg-gray-100 border border-gray-200 rounded-lg p-2">
                  {deliveryPreview.message || 'Selecione um endereço de entrega para calcular o frete.'}
                </p>
              )}

              {!isUnavailableForDestination && !needsVariantSelection && !deliveryPreview?.loading && deliveryPreview && deliveryPreview.available === false && deliveryPreview.code !== 'DELIVERY_SECTOR_REQUIRED' && (
                <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
                  {deliveryPreview.message || 'Frete indisponível para este destino no momento.'}
                </p>
              )}
            </div>

            {/* Stock status indicator based on variation */}
            <div className="space-y-1 bg-gray-50 p-2.5 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-gray-900">Disponibilidade:</span>
                {needsVariantSelection ? (
                  <span className="text-gray-600 font-bold flex items-center gap-1">
                    <Info className="w-3.5 h-3.5" /> Selecione as opções
                  </span>
                ) : isCurrentVariationOutOfStock ? (
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

            {/* Quantity Selector if single purchase — FASE D16-D2: em modo
                multi-variante a quantidade é definida linha a linha (acima),
                nunca aqui. Produto simples/variável-só-por-cor: 100% igual
                ao D16-C2, intocado. */}
            {!selectedKit && !isMultiVariantMode && (
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-gray-700">Quantidade:</span>
                <select
                  value={quantity}
                  disabled={needsVariantSelection || isCurrentVariationOutOfStock}
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

            {/* FASE D16-D2 (D16-D1, seção 8/K) — resumo multi-variante:
                total de unidades + subtotal, calculado 100% no frontend
                (Σ variant.price * quantity, NUNCA product.price). */}
            {isMultiVariantMode && (
              <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-3 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-700 font-semibold">
                    {multiVariantSummary.totalUnits === 0
                      ? 'Nenhuma unidade selecionada'
                      : `${multiVariantSummary.totalUnits} unidade${multiVariantSummary.totalUnits > 1 ? 's' : ''} selecionada${multiVariantSummary.totalUnits > 1 ? 's' : ''}`}
                  </span>
                  {multiVariantSummary.selectedVariantCount > 0 && (
                    <span className="text-[11px] text-gray-500">
                      {multiVariantSummary.selectedVariantCount} variação{multiVariantSummary.selectedVariantCount > 1 ? 'ões' : ''}
                    </span>
                  )}
                </div>
                {multiVariantSummary.totalUnits > 0 && (
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-gray-600">Subtotal:</span>
                    <span className="text-lg font-black text-gray-900">
                      {formatPrice(multiVariantSummary.subtotal, productCurrency).formatted}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-2 pt-2">
              <button
                disabled={
                  isMultiVariantMode
                    ? !buyNowSingleLine || !product.weightKg || cartActionPending !== null || isUnavailableForDestination
                    : needsVariantSelection || isCurrentVariationOutOfStock || !product.weightKg || cartActionPending !== null || isUnavailableForDestination
                }
                onClick={handleBuyNow}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black py-3 px-4 rounded-xl shadow-xs transition transform active:scale-98 text-sm cursor-pointer"
              >
                {isMultiVariantMode
                  ? cartActionPending === 'buy'
                    ? 'Preparando compra...'
                    : isUnavailableForDestination
                    ? 'Indisponível no seu país'
                    : !product.weightKg
                    ? 'Indisponível (peso não cadastrado)'
                    : !buyNowSingleLine
                    ? multiVariantSummary.totalUnits === 0
                      ? 'Defina 1 variação para comprar'
                      : 'Só 1 variação por vez'
                    : 'Comprar agora'
                  : cartActionPending === 'buy'
                  ? 'Preparando compra...'
                  : isUnavailableForDestination
                  ? 'Indisponível no seu país'
                  : needsVariantSelection
                  ? 'Selecione as opções'
                  : isCurrentVariationOutOfStock
                  ? 'Variação Esgotada'
                  : !product.weightKg
                  ? 'Indisponível (peso não cadastrado)'
                  : selectedKit
                  ? `Comprar ${selectedKit.title}`
                  : 'Comprar agora'}
              </button>

              <button
                disabled={
                  isMultiVariantMode
                    ? multiVariantSummary.totalUnits === 0 || !product.weightKg || cartActionPending !== null || isUnavailableForDestination
                    : needsVariantSelection || isCurrentVariationOutOfStock || !product.weightKg || cartActionPending !== null || isUnavailableForDestination
                }
                onClick={handleAddToCart}
                className="w-full bg-blue-50 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed text-blue-700 font-extrabold py-3 px-4 rounded-xl transition text-sm border border-blue-200 cursor-pointer"
              >
                {isMultiVariantMode
                  ? cartActionPending === 'add'
                    ? 'Adicionando...'
                    : isUnavailableForDestination
                    ? 'Indisponível no seu país'
                    : !product.weightKg
                    ? 'Indisponível (peso não cadastrado)'
                    : multiVariantSummary.totalUnits === 0
                    ? 'Selecione as quantidades'
                    : multiVariantSummary.totalUnits === 1
                    ? 'Adicionar 1 unidade ao carrinho'
                    : `Adicionar ${multiVariantSummary.totalUnits} unidades ao carrinho`
                  : cartActionPending === 'add'
                  ? 'Adicionando...'
                  : isUnavailableForDestination
                  ? 'Indisponível no seu país'
                  : needsVariantSelection
                  ? 'Selecione as opções'
                  : 'Adicionar ao carrinho'}
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
                  {product.seller?.name || product.storeName || 'Vendedor'}
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
                  {product.seller?.salesCount ?? product.salesCount ?? 0}
                </p>
                <p>Vendas nos últimos 60 dias</p>
              </div>
              <div>
                <p className="font-extrabold text-gray-900 text-xs">
                  {product.seller?.goodService ? 'Sim' : 'Em avaliação'}
                </p>
                <p>Bom atendimento</p>
              </div>
              <div>
                <p className="font-extrabold text-gray-900 text-xs">
                  {product.seller?.onTimeDelivery ? 'No prazo' : 'Em avaliação'}
                </p>
                <p>Entrega no prazo</p>
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
