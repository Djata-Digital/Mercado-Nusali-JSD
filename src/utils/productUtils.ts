import { Product } from '../types';

export function normalizeProduct(p: any): Product {
  if (!p) {
    return {
      id: '',
      title: 'Produto não encontrado',
      price: 0,
      currency: 'XOF',
      installmentsMax: 1,
      installmentsInterestFree: false,
      image: '',
      galleryImages: [],
      category: 'Geral',
      categorySlug: 'geral',
      condition: 'novo',
      brand: '',
      model: '',
      rating: 0,
      reviewsCount: 0,
      seller: {
        id: '',
        name: 'Vendedor',
        reputationLevel: 'silver' as any,
        reputationScore: 0,
        salesCount: 0,
        location: { city: '', state: '' },
        goodService: false,
        onTimeDelivery: false,
      },
      shipping: {
        freeShipping: false,
        arrivesTomorrow: false,
        shippingPrice: 0,
        fullFulfilled: false,
        originCountry: 'GW' as any,
      },
      stock: 0,
      salesCount: 0,
      description: '',
      specs: {},
      questions: [],
      reviews: [],
    };
  }

  const rawPrice = typeof p.price === 'number' ? p.price : parseFloat(p.price) || 0;

  // Extract images
  let galleryImages: string[] = [];
  if (Array.isArray(p.galleryImages) && p.galleryImages.length > 0) {
    galleryImages = p.galleryImages.map((img: any) => typeof img === 'string' ? img : (img?.imageUrl || ''));
  } else if (Array.isArray(p.images) && p.images.length > 0) {
    galleryImages = p.images.map((img: any) => typeof img === 'string' ? img : (img?.imageUrl || ''));
  } else if (p.image || p.imageUrl) {
    galleryImages = [p.image || p.imageUrl];
  }
  galleryImages = galleryImages.filter(Boolean);

  const mainImage = p.image || p.imageUrl || (galleryImages.length > 0 ? galleryImages[0] : '');

  // Correção pré-piloto (condição opcional): condição real e opcional —
  // NUNCA um fallback para 'novo' nem 'usado'. Sem valor real (null/vazio),
  // fica undefined ("não se aplica"), e a UI simplesmente não mostra nada.
  const rawCond = String(p.condition ?? '').toLowerCase().trim();
  let normalizedCondition: 'novo' | 'usado' | 'recondicionado' | undefined;
  if (rawCond === 'new' || rawCond === 'novo') normalizedCondition = 'novo';
  else if (rawCond === 'used' || rawCond === 'usado') normalizedCondition = 'usado';
  else if (rawCond === 'refurbished' || rawCond === 'recondicionado') normalizedCondition = 'recondicionado';
  else normalizedCondition = undefined;

  // Normalize origin country
  const resolvedOriginCountry = (p.originCountry || p.shipping?.originCountry || p.seller?.country || p.countryCode || (p.currency === 'BRL' ? 'BR' : '')) as any;

  // Correção pré-piloto (preço promocional): preço anterior só é real quando
  // maior que o preço atual — nunca uma promoção falsa. O percentual é
  // sempre CALCULADO a partir desses dois valores reais (nunca um campo
  // solto que possa ficar dessincronizado se um dos dois mudar depois).
  const resolvedOriginalPrice = p.originalPrice ? Number(p.originalPrice) : undefined;
  const hasRealPromo = resolvedOriginalPrice !== undefined && resolvedOriginalPrice > rawPrice;

  return {
    id: String(p.id || ''),
    title: String(p.title || p.name || ''),
    price: rawPrice,
    currency: p.currency || (resolvedOriginCountry === 'BR' ? 'BRL' : 'XOF'),
    originalPrice: hasRealPromo ? resolvedOriginalPrice : undefined,
    discountPercentage: hasRealPromo ? Math.round(((resolvedOriginalPrice! - rawPrice) / resolvedOriginalPrice!) * 100) : undefined,
    installmentsMax: p.installmentsMax ? Number(p.installmentsMax) : 1,
    installmentsInterestFree: Boolean(p.installmentsInterestFree),
    image: mainImage,
    galleryImages: galleryImages.length > 0 ? galleryImages : (mainImage ? [mainImage] : []),
    videos: Array.isArray(p.videos) ? p.videos : (p.videoUrl ? [{ url: p.videoUrl, title: 'Vídeo Demonstrativo', duration: '', type: 'mp4' }] : []),
    videoUrl: p.videoUrl || (Array.isArray(p.videos) && p.videos[0] ? (typeof p.videos[0] === 'string' ? p.videos[0] : p.videos[0].url) : undefined),
    shortVideo: p.shortVideo || (p.videoUrl ? { url: p.videoUrl, title: 'Vídeo Demonstrativo', duration: '' } : undefined),
    category: p.category || 'Geral',
    categorySlug: p.categorySlug || 'geral',
    condition: normalizedCondition,
    brand: p.brand || '',
    model: p.model || '',
    rating: typeof p.rating === 'number' ? p.rating : 0,
    reviewsCount: typeof p.reviewsCount === 'number' ? p.reviewsCount : 0,
    seller: {
      id: p.seller?.id || p.sellerId || '',
      name: p.seller?.name || p.sellerName || p.storeName || 'Vendedor',
      reputationLevel: (p.seller?.reputationLevel || 'silver') as any,
      reputationScore: typeof p.seller?.reputationScore === 'number' ? p.seller.reputationScore : 0,
      salesCount: typeof p.seller?.salesCount === 'number' ? p.seller.salesCount : 0,
      isOfficialStore: Boolean(p.seller?.isOfficialStore),
      location: p.seller?.location || { city: p.seller?.city || '', state: p.seller?.state || '' },
      goodService: Boolean(p.seller?.goodService),
      onTimeDelivery: Boolean(p.seller?.onTimeDelivery),
      country: (p.seller?.country || resolvedOriginCountry) as any,
      kycStatus: p.seller?.kycStatus || '',
    },
    storeId: p.storeId || p.seller?.storeId || '',
    storeName: p.storeName || p.seller?.name || '',
    isDigitalProduct: Boolean(p.isDigitalProduct),
    // Fase "Comissão percentual + logística real": peso/dimensões reais só
    // vêm de campos estruturados de verdade — nunca de p.specs (texto livre
    // digitado pelo vendedor em outro contexto) nem de um número inventado.
    // A fonte "achatada" (weightKg/dimensionsCm) é usada quando já vem assim
    // de rotas que já normalizam (ex.: painel do vendedor); a fonte "crua"
    // products.shippingJson é usada quando o objeto vem direto do banco
    // (ex.: GET /products/:id público) — mesma coluna, dois formatos de
    // resposta possíveis.
    weightKg: typeof p.weightKg === 'number' && p.weightKg > 0
      ? p.weightKg
      : (p.shippingJson && typeof p.shippingJson === 'object' && Number(p.shippingJson.weightKg) > 0
        ? Number(p.shippingJson.weightKg)
        : undefined),
    dimensionsCm: p.dimensionsCm
      || (p.shippingJson && typeof p.shippingJson === 'object' && p.shippingJson.lengthCm && p.shippingJson.widthCm && p.shippingJson.heightCm
        ? { length: Number(p.shippingJson.lengthCm), width: Number(p.shippingJson.widthCm), height: Number(p.shippingJson.heightCm) }
        : undefined),
    // Melhoria pré-piloto (elegibilidade por país): publishingScope/targetCountries
    // agora são dados REAIS vindos do backend (products.publishing_scope /
    // target_countries_json) — antes eram campos puramente decorativos, nunca
    // persistidos. targetCountriesJson é o nome da coluna real; targetCountries
    // continua aceito para compatibilidade com fontes já normalizadas.
    publishingScope: p.publishingScope || (p.shipping?.isInternational ? 'international' : 'national'),
    targetCountries: Array.isArray(p.targetCountries)
      ? p.targetCountries
      : (Array.isArray(p.targetCountriesJson) ? p.targetCountriesJson : (p.shipping?.targetCountries || [])),
    originCountry: resolvedOriginCountry,
    // Elegibilidade calculada pelo backend para um destinationCountry específico
    // (GET /products/:id?destinationCountry=...) — nunca calculada no frontend,
    // só repassada. undefined quando o backend não recebeu destino nenhum.
    availableForCountry: p.availableForCountry,
    unavailabilityReason: p.unavailabilityReason,
    productKits: Array.isArray(p.productKits) ? p.productKits : [],
    availableColors: Array.isArray(p.availableColors) ? p.availableColors : [],
    availableSizes: Array.isArray(p.availableSizes) ? p.availableSizes : [],
    variants: Array.isArray(p.variants) ? p.variants : [],
    shipping: {
      freeShipping: Boolean(p.shipping?.freeShipping ?? p.freeShipping),
      arrivesTomorrow: Boolean(p.shipping?.arrivesTomorrow ?? p.arrivesTomorrow),
      shippingPrice: typeof p.shipping?.shippingPrice === 'number' ? p.shipping.shippingPrice : (p.freeShipping ? 0 : 0),
      fullFulfilled: Boolean(p.shipping?.fullFulfilled ?? p.full),
      isInternational: Boolean(p.shipping?.isInternational ?? (p.publishingScope === 'international')),
      originCountry: p.shipping?.originCountry || resolvedOriginCountry,
      originCity: p.shipping?.originCity || p.seller?.location?.city || '',
      targetCountries: p.shipping?.targetCountries || p.targetCountries || [],
      warehouseName: p.shipping?.warehouseName || '',
      estimatedDays: typeof p.shipping?.estimatedDays === 'number' ? p.shipping.estimatedDays : undefined,
      customsDutyEstimate: typeof p.shipping?.customsDutyEstimate === 'number' ? p.shipping.customsDutyEstimate : 0,
    },
    stock: typeof p.stock === 'number' ? p.stock : 0,
    salesCount: typeof p.salesCount === 'number' ? p.salesCount : 0,
    description: p.description || '',
    specs: p.specs || {},
    questions: Array.isArray(p.questions) ? p.questions : [],
    reviews: Array.isArray(p.reviews) ? p.reviews : [],
    featured: Boolean(p.featured),
    offerOfDay: Boolean(p.offerOfDay),
    createdAt: p.createdAt || new Date().toISOString(),
  };
}
