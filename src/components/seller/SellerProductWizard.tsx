import React, { useState, useRef, useEffect } from 'react';
import {
  PlusCircle,
  Sparkles,
  Image as ImageIcon,
  CheckCircle2,
  Package,
  Layers,
  DollarSign,
  Boxes,
  Truck,
  Shield,
  Eye,
  ChevronRight,
  ChevronLeft,
  Upload,
  X,
  Trash2,
  Video,
  Film,
  Play,
  Pause,
  Star,
  Check,
  Plus,
  RotateCw,
  Edit3,
  Save,
  Scale,
  Ruler,
  Box,
  Globe,
  Palette,
  Maximize2,
  Tag,
  Gift,
  HelpCircle,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useCategories } from '../../hooks/useProducts';
import { getCategoryPath, isLeafCategory, getDirectChildren } from '../../utils/categoryUtils';
import { CategoriesApi } from '../../api/clients/CategoriesApi';
import { uploadService } from '../../services/uploadService';
import {
  Product,
  CurrencyCode,
  CountryCode,
  PublishingScope,
  ProductKit,
  ProductColor,
  ProductVariant,
} from '../../types';
import { countriesConfig, getCountryFlag, getCountryName } from '../../utils/currencyUtils';
import { useCountries } from '../../hooks/useCountries';

interface SellerProductWizardProps {
  initialProduct?: Product | null;
  onAddProduct: (p: Omit<Product, 'id'>) => Promise<any> | any;
  onUpdateProduct?: (p: Product) => Promise<any> | any;
  onCancelEdit?: () => void;
  onOpenProductDetail: (id: string) => void;
  showToast: (msg: string) => void;
  selectedStoreName: string;
  selectedStore?: any;
  stores?: any[];
  onSelectStore?: (storeId: string) => void;
}


const COLOR_PRESETS = [
  { name: 'Preto', hex: '#111827' },
  { name: 'Branco', hex: '#f9fafb' },
  { name: 'Cinza / Titânio', hex: '#6b7280' },
  { name: 'Azul Marinho', hex: '#1e3a8a' },
  { name: 'Vermelho', hex: '#dc2626' },
  { name: 'Verde Militar', hex: '#15803d' },
  { name: 'Dourado / Gold', hex: '#eab308' },
  { name: 'Rosa / Rose', hex: '#ec4899' },
];

export const SellerProductWizard: React.FC<SellerProductWizardProps> = ({
  initialProduct,
  onAddProduct,
  onUpdateProduct,
  onCancelEdit,
  onOpenProductDetail,
  showToast,
  selectedStoreName,
  selectedStore,
  stores = [],
  onSelectStore,
}) => {
  const isEditing = !!initialProduct;
  const [wizardStep, setWizardStep] = useState(1);

  const { data: realCategories = [], isLoading: isLoadingCategories } = useCategories();
  const activeCategories = React.useMemo(() => {
    return (realCategories || []).filter((c: any) => c.isActive !== false);
  }, [realCategories]);

  // Step 1: Basic Info
  const [title, setTitle] = useState(initialProduct?.title || '');
  const [category, setCategory] = useState(initialProduct?.categoryId || initialProduct?.category || '');
  const [brand, setBrand] = useState(initialProduct?.brand || initialProduct?.specs?.Marca || '');
  const [model, setModel] = useState(initialProduct?.model || initialProduct?.specs?.Modelo || '');
  const [condition, setCondition] = useState<'novo' | 'usado'>(initialProduct?.condition || 'novo');

  const [dbAttributes, setDbAttributes] = useState<any[]>([]);
  const [isLoadingDbAttributes, setIsLoadingDbAttributes] = useState(false);
  const [categorySpecs, setCategorySpecs] = useState<Record<string, string>>(
    (initialProduct?.specs as Record<string, string>) || (initialProduct?.attributesJson as any) || {}
  );

  useEffect(() => {
    if (!category) return;
    let isSubscribed = true;
    setIsLoadingDbAttributes(true);

    CategoriesApi.getCategoryAttributes(category)
      .then((res) => {
        if (isSubscribed && res.success && Array.isArray(res.data)) {
          setDbAttributes(res.data);
        } else if (isSubscribed) {
          setDbAttributes([]);
        }
      })
      .catch((err) => {
        console.error('Error loading category attributes:', err);
        if (isSubscribed) setDbAttributes([]);
      })
      .finally(() => {
        if (isSubscribed) setIsLoadingDbAttributes(false);
      });

    return () => {
      isSubscribed = false;
    };
  }, [category]);

  const handleCategorySpecChange = (keyOrCode: string, val: string) => {
    setCategorySpecs((prev) => ({
      ...prev,
      [keyOrCode]: val,
    }));
    if (keyOrCode.toLowerCase() === 'marca' || keyOrCode.toLowerCase() === 'brand') setBrand(val);
    if (keyOrCode.toLowerCase() === 'modelo' || keyOrCode.toLowerCase() === 'model') setModel(val);
  };

  useEffect(() => {
    if (!category && activeCategories.length > 0) {
      setCategory(activeCategories[0].id);
    }
  }, [activeCategories, category]);

  // Step 2: Scope & Visibility (Nacional vs Internacional)
  const [publishingScope, setPublishingScope] = useState<PublishingScope>(
    initialProduct?.publishingScope ||
      (initialProduct?.shipping?.isInternational ? 'international' : 'national')
  );
  
  const [originCountry, setOriginCountry] = useState<CountryCode>(() => {
    if (initialProduct?.originCountry) return initialProduct.originCountry as CountryCode;
    if (initialProduct?.shipping?.originCountry) return initialProduct.shipping.originCountry as CountryCode;
    if (selectedStore?.countryCode) return selectedStore.countryCode as CountryCode;
    return '' as CountryCode;
  });

  const hasExplicitTargetCountries = Boolean(
    (initialProduct?.targetCountries && initialProduct.targetCountries.length > 0) ||
    (initialProduct?.shipping?.targetCountries && initialProduct.shipping.targetCountries.length > 0)
  );
  const [targetCountries, setTargetCountries] = useState<CountryCode[]>(
    initialProduct?.targetCountries && initialProduct.targetCountries.length > 0
      ? initialProduct.targetCountries
      : initialProduct?.shipping?.targetCountries && initialProduct.shipping.targetCountries.length > 0
      ? initialProduct.shipping.targetCountries
      : []
  );

  // Países operacionais reais (GET /api/v1/countries) — nunca ALL_COUNTRY_CODES.
  const { data: operationalCountries, isLoading: countriesLoading, isError: countriesError } = useCountries();

  // Sem alcance internacional automático inventado: só preenche "todos os
  // países" com dados REAIS assim que a lista carrega, e só quando não havia
  // seleção explícita salva (produto novo, ou sem esse campo no histórico).
  useEffect(() => {
    if (!hasExplicitTargetCountries && operationalCountries && operationalCountries.length > 0 && targetCountries.length === 0) {
      setTargetCountries(operationalCountries.map((c) => c.code));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operationalCountries]);

  // Bandeira/nome reais do país de origem (da loja) — getCountryFlag/getCountryName
  // caem para Guiné-Bissau quando o código não está no countriesConfig legado
  // (ex.: GM, SN), o que mostraria o país errado para essas lojas.
  const realOriginCountry = operationalCountries?.find((c) => c.code === originCountry);
  const originCountryFlag = realOriginCountry?.flag || getCountryFlag(originCountry);
  const originCountryName = realOriginCountry?.name || getCountryName(originCountry);

  // Requirements 1 & 2: NO 'XOF' fallback. Derive from store's countryCode or initialProduct
  const [currency, setCurrency] = useState<CurrencyCode>(() => {
    if (initialProduct?.currency) return initialProduct.currency as CurrencyCode;
    const effCountry = initialProduct?.originCountry || initialProduct?.shipping?.originCountry || selectedStore?.countryCode;
    if (effCountry && countriesConfig[effCountry as CountryCode]?.currency) {
      return countriesConfig[effCountry as CountryCode].currency as CurrencyCode;
    }
    return '' as CurrencyCode;
  });

  useEffect(() => {
    if (!isEditing) {
      if (selectedStore?.countryCode) {
        const storeCountry = selectedStore.countryCode as CountryCode;
        setOriginCountry(storeCountry);
        if (countriesConfig[storeCountry]?.currency) {
          setCurrency(countriesConfig[storeCountry].currency as CurrencyCode);
        }
      } else {
        setOriginCountry('' as CountryCode);
        setCurrency('' as CurrencyCode);
      }
    }
  }, [selectedStore, isEditing]);

  // Step 3: Variations (Colors, Sizes & Stock Matrix) and Product Kits (Bundles)
  const [colors, setColors] = useState<ProductColor[]>(() => {
    if (initialProduct?.availableColors && initialProduct.availableColors.length > 0) {
      return initialProduct.availableColors.map((c) =>
        typeof c === 'string' ? { name: c, hex: '#374151' } : c
      );
    }
    return [];
  });
  const [newColorName, setNewColorName] = useState('');
  const [newColorHex, setNewColorHex] = useState('#111827');
  const [newColorImage, setNewColorImage] = useState('');
  const [newColorDesc, setNewColorDesc] = useState('');

  const [sizes, setSizes] = useState<string[]>(
    initialProduct?.availableSizes && initialProduct.availableSizes.length > 0
      ? initialProduct.availableSizes
      : []
  );
  const [newSizeName, setNewSizeName] = useState('');

  // Stock per variant matrix
  const [variantsMatrix, setVariantsMatrix] = useState<ProductVariant[]>(() => {
    if (initialProduct?.variants && initialProduct.variants.length > 0) {
      return initialProduct.variants;
    }
    return [];
  });

  // Product Kits (Bundles)
  const [productKits, setProductKits] = useState<ProductKit[]>(() => {
    if (initialProduct?.productKits && initialProduct.productKits.length > 0) {
      return initialProduct.productKits;
    }
    return [];
  });
  const [newKitQty, setNewKitQty] = useState(2);
  const [newKitDiscount, setNewKitDiscount] = useState(10);
  const [newKitTitle, setNewKitTitle] = useState('Kit com 2 Unidades');
  const [newKitBadge, setNewKitBadge] = useState('Economize 10%');

  // Step 4: Price, Stock & Logistics
  const [price, setPrice] = useState(initialProduct?.price ? String(initialProduct.price) : '');
  const [originalPrice, setOriginalPrice] = useState(
    initialProduct?.originalPrice ? String(initialProduct.originalPrice) : ''
  );

  const [stock, setStock] = useState(
    initialProduct?.stock !== undefined && initialProduct?.stock !== null ? String(initialProduct.stock) : ''
  );
  const [warehouseHub, setWarehouseHub] = useState<string>(
    initialProduct?.specs?.Armazém || ''
  );
  const [warrantyMonths, setWarrantyMonths] = useState<string>(
    initialProduct?.specs?.Garantia ? initialProduct.specs.Garantia.replace(/\D/g, '') : ''
  );

  // Weight & Dimensions
  const [weightKg, setWeightKg] = useState(
    initialProduct?.weightKg !== undefined && initialProduct?.weightKg !== null
      ? String(initialProduct.weightKg)
      : initialProduct?.specs?.Peso
      ? initialProduct.specs.Peso.replace(/[^\d.]/g, '') || ''
      : ''
  );
  const [lengthCm, setLengthCm] = useState(
    initialProduct?.dimensionsCm?.length !== undefined && initialProduct?.dimensionsCm?.length !== null
      ? String(initialProduct.dimensionsCm.length)
      : ''
  );
  const [widthCm, setWidthCm] = useState(
    initialProduct?.dimensionsCm?.width !== undefined && initialProduct?.dimensionsCm?.width !== null
      ? String(initialProduct.dimensionsCm.width)
      : ''
  );
  const [heightCm, setHeightCm] = useState(
    initialProduct?.dimensionsCm?.height !== undefined && initialProduct?.dimensionsCm?.height !== null
      ? String(initialProduct.dimensionsCm.height)
      : ''
  );

  // Step 5: Media, Description & Gemini AI
  const [gallery, setGallery] = useState<string[]>(
    initialProduct?.galleryImages && initialProduct.galleryImages.length > 0
      ? initialProduct.galleryImages
      : initialProduct?.image
      ? [initialProduct.image]
      : []
  );
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [shortVideoUrl, setShortVideoUrl] = useState(
    initialProduct?.shortVideo?.url ||
      initialProduct?.videoUrl ||
      (initialProduct?.videos && initialProduct.videos[0]?.url) ||
      ''
  );
  const [shortVideoTitle, setShortVideoTitle] = useState(
    initialProduct?.shortVideo?.title ||
      (initialProduct?.videos && initialProduct.videos[0]?.title) ||
      'Vídeo Demonstrativo do Produto'
  );
  const [shortVideoDuration, setShortVideoDuration] = useState(
    initialProduct?.shortVideo?.duration ||
      (initialProduct?.videos && initialProduct.videos[0]?.duration) ||
      '0:25'
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  const [description, setDescription] = useState(initialProduct?.description || '');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  // Synchronize state when initialProduct changes (Edit Mode)
  useEffect(() => {
    if (initialProduct) {
      setTitle(initialProduct.title || '');
      setCategory(initialProduct.categoryId || initialProduct.category || '');
      setBrand(initialProduct.brand || initialProduct.specs?.Marca || '');
      setModel(initialProduct.model || initialProduct.specs?.Modelo || '');
      setCondition(initialProduct.condition || 'novo');

      setPublishingScope(
        initialProduct.publishingScope ||
          (initialProduct.shipping?.isInternational ? 'international' : 'national')
      );
      setOriginCountry(
        (initialProduct.originCountry || initialProduct.shipping?.originCountry || selectedStore?.countryCode || '') as CountryCode
      );
      setTargetCountries(
        initialProduct.targetCountries && initialProduct.targetCountries.length > 0
          ? initialProduct.targetCountries
          : initialProduct.shipping?.targetCountries && initialProduct.shipping.targetCountries.length > 0
          ? initialProduct.shipping.targetCountries
          : (operationalCountries?.map((c) => c.code) || [])
      );

      if (initialProduct.availableColors && initialProduct.availableColors.length > 0) {
        setColors(
          initialProduct.availableColors.map((c) =>
            typeof c === 'string' ? { name: c, hex: '#374151' } : c
          )
        );
      }
      if (initialProduct.availableSizes && initialProduct.availableSizes.length > 0) {
        setSizes(initialProduct.availableSizes);
      }
      if (initialProduct.variants && initialProduct.variants.length > 0) {
        setVariantsMatrix(initialProduct.variants);
      }
      if (initialProduct.productKits && initialProduct.productKits.length > 0) {
        setProductKits(initialProduct.productKits);
      }

      setPrice(initialProduct.price !== undefined ? String(initialProduct.price) : '');
      setOriginalPrice(initialProduct.originalPrice ? String(initialProduct.originalPrice) : '');
      setStock(initialProduct.stock !== undefined && initialProduct.stock !== null ? String(initialProduct.stock) : '');
      setWarehouseHub(initialProduct.specs?.Armazém || '');

      const existingGallery =
        initialProduct.galleryImages && initialProduct.galleryImages.length > 0
          ? initialProduct.galleryImages
          : initialProduct.image
          ? [initialProduct.image]
          : [];
      if (existingGallery.length > 0) {
        setGallery(existingGallery);
      }

      const existingVideo =
        initialProduct.shortVideo?.url ||
        initialProduct.videoUrl ||
        (initialProduct.videos && initialProduct.videos[0]?.url) ||
        '';
      setShortVideoUrl(existingVideo);
      setShortVideoTitle(
        initialProduct.shortVideo?.title ||
          (initialProduct.videos && initialProduct.videos[0]?.title) ||
          'Vídeo Demonstrativo do Produto'
      );
      setShortVideoDuration(
        initialProduct.shortVideo?.duration ||
          (initialProduct.videos && initialProduct.videos[0]?.duration) ||
          '0:25'
      );

      setDescription(initialProduct.description || '');
      const numMonths = initialProduct.specs?.Garantia?.replace(/\D/g, '');
      if (numMonths) setWarrantyMonths(numMonths);

      const initWeight = initialProduct.weightKg
        ? String(initialProduct.weightKg)
        : initialProduct.specs?.Peso
        ? initialProduct.specs.Peso.replace(/[^\d.]/g, '') || ''
        : '';
      setWeightKg(initWeight);

      const initLength = initialProduct.dimensionsCm?.length
        ? String(initialProduct.dimensionsCm.length)
        : '20';
      const initWidth = initialProduct.dimensionsCm?.width
        ? String(initialProduct.dimensionsCm.width)
        : '15';
      const initHeight = initialProduct.dimensionsCm?.height
        ? String(initialProduct.dimensionsCm.height)
        : '10';
      setLengthCm(initLength);
      setWidthCm(initWidth);
      setHeightCm(initHeight);
    }
  }, [initialProduct]);

  // Recalculate total stock from variants matrix if matrix exists
  const handleUpdateVariantStock = (index: number, newStock: number) => {
    const updated = [...variantsMatrix];
    updated[index].stock = Math.max(0, newStock);
    setVariantsMatrix(updated);
    const sum = updated.reduce((acc, curr) => acc + (curr.stock || 0), 0);
    setStock(String(sum));
  };

  const handleUpdateVariantPrice = (index: number, newPrice: number) => {
    const updated = [...variantsMatrix];
    updated[index].price = Math.max(0, newPrice);
    setVariantsMatrix(updated);
  };

  const handleUpdateVariantOriginalPrice = (index: number, newOrigPrice: number | undefined) => {
    const updated = [...variantsMatrix];
    updated[index].originalPrice = newOrigPrice !== undefined ? Math.max(0, newOrigPrice) : undefined;
    setVariantsMatrix(updated);
  };

  const handleUpdateVariantSku = (index: number, newSku: string) => {
    const updated = [...variantsMatrix];
    updated[index].sku = newSku;
    setVariantsMatrix(updated);
  };

  const handleCopyBasePriceToAllVariants = () => {
    const basePriceNum = parseFloat(price) || 0;
    const baseOrigPriceNum = parseFloat(originalPrice) || undefined;
    if (basePriceNum <= 0) {
      showToast('Defina primeiro o Preço Base do produto antes de copiar.');
      return;
    }
    const updated = variantsMatrix.map((v) => ({
      ...v,
      price: basePriceNum,
      originalPrice: baseOrigPriceNum,
    }));
    setVariantsMatrix(updated);
    showToast(`Preço base (${basePriceNum.toLocaleString('pt-BR')}) aplicado a todas as ${updated.length} variações!`);
  };

  const handleApplyPriceScaleBySizes = (percentStep: number = 15) => {
    const basePriceNum = parseFloat(price) || 0;
    if (basePriceNum <= 0) {
      showToast('Defina primeiro o Preço Base do produto antes de gerar escala.');
      return;
    }
    const updated = variantsMatrix.map((v) => {
      const sizeIndex = sizes.findIndex((s) => s.toLowerCase() === (v.size || '').toLowerCase());
      const factor = sizeIndex >= 0 ? 1 + (sizeIndex * (percentStep / 100)) : 1;
      const scaledPrice = Math.round(basePriceNum * factor);
      const baseOrigNum = parseFloat(originalPrice) || 0;
      const scaledOrig = baseOrigNum > 0 ? Math.round(baseOrigNum * factor) : undefined;
      return {
        ...v,
        price: scaledPrice,
        originalPrice: scaledOrig,
      };
    });
    setVariantsMatrix(updated);
    showToast(`Escala progressiva (+${percentStep}% por tamanho) calculada com sucesso!`);
  };

  const handleGenerateAutoSkus = () => {
    const brandPrefix = (brand || 'NUS').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'PROD';
    const modelPrefix = (model || title || 'ITEM').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'MOD';
    const updated = variantsMatrix.map((v, idx) => {
      const colorCode = (v.color || 'PAD').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
      const sizeCode = (v.size || 'UNI').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      return {
        ...v,
        sku: `${brandPrefix}-${modelPrefix}-${colorCode}-${sizeCode}-${idx + 1}`,
      };
    });
    setVariantsMatrix(updated);
    showToast('SKUs únicos de separação gerados automaticamente para todas as variações!');
  };

  // Regeneration of Matrix when colors or sizes change
  const handleRegenerateMatrix = (currentColors: ProductColor[], currentSizes: string[]) => {
    const basePriceNum = parseFloat(price) || 0;
    const baseOrigPriceNum = parseFloat(originalPrice) || undefined;
    const parsedStockNum = stock !== '' && !isNaN(parseInt(stock, 10)) ? Math.max(0, parseInt(stock, 10)) : 0;
    const brandPrefix = (brand || title || 'PROD').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'PROD';
    const modelPrefix = (model || title || 'ITEM').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'ITEM';

    const newMatrix: ProductVariant[] = [];
    if (currentColors.length === 0 && currentSizes.length === 0) {
      setVariantsMatrix([]);
      return;
    } else if (currentColors.length > 0 && currentSizes.length === 0) {
      currentColors.forEach((c, cIdx) => {
        const existing = variantsMatrix.find((v) => v.color?.toLowerCase() === c.name.toLowerCase());
        const colorCode = c.name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
        newMatrix.push({
          id: `var-c-${cIdx}`,
          color: c.name,
          image: c.image || undefined,
          stock: existing?.stock ?? (currentColors.length === 1 ? parsedStockNum : 0),
          price: existing?.price ?? (basePriceNum > 0 ? basePriceNum : undefined),
          originalPrice: existing?.originalPrice ?? baseOrigPriceNum,
          sku: existing?.sku || `${brandPrefix}-${modelPrefix}-${colorCode}-UNI`,
        });
      });
    } else if (currentColors.length === 0 && currentSizes.length > 0) {
      currentSizes.forEach((s, sIdx) => {
        const existing = variantsMatrix.find((v) => v.size?.toLowerCase() === s.toLowerCase());
        const sizeCode = s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
        newMatrix.push({
          id: `var-s-${sIdx}`,
          size: s,
          stock: existing?.stock ?? (currentSizes.length === 1 ? parsedStockNum : 0),
          price: existing?.price ?? (basePriceNum > 0 ? basePriceNum : undefined),
          originalPrice: existing?.originalPrice ?? baseOrigPriceNum,
          sku: existing?.sku || `${brandPrefix}-${modelPrefix}-PAD-${sizeCode}`,
        });
      });
    } else {
      let counter = 1;
      currentColors.forEach((c) => {
        currentSizes.forEach((s) => {
          const existing = variantsMatrix.find(
            (v) => v.color?.toLowerCase() === c.name.toLowerCase() && v.size?.toLowerCase() === s.toLowerCase()
          );
          const colorCode = c.name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
          const sizeCode = s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
          newMatrix.push({
            id: `var-${counter++}`,
            color: c.name,
            size: s,
            image: c.image || undefined,
            stock: existing?.stock ?? 0,
            price: existing?.price ?? (basePriceNum > 0 ? basePriceNum : undefined),
            originalPrice: existing?.originalPrice ?? baseOrigPriceNum,
            sku: existing?.sku || `${brandPrefix}-${modelPrefix}-${colorCode}-${sizeCode}`,
          });
        });
      });
    }
    setVariantsMatrix(newMatrix);
    if (newMatrix.length > 0) {
      const sum = newMatrix.reduce((acc, curr) => acc + (curr.stock || 0), 0);
      setStock(String(sum));
    }
  };

  // Add/Remove Colors
  const handleAddColor = () => {
    if (!newColorName.trim()) return;
    if (colors.some((c) => c.name.toLowerCase() === newColorName.trim().toLowerCase())) {
      showToast('Esta cor já foi adicionada.');
      return;
    }
    const updated = [
      ...colors,
      {
        name: newColorName.trim(),
        hex: newColorHex,
        image: newColorImage.trim() || undefined,
        description: newColorDesc.trim() || undefined,
      },
    ];
    setColors(updated);
    setNewColorName('');
    setNewColorImage('');
    setNewColorDesc('');
    handleRegenerateMatrix(updated, sizes);
    showToast(`Cor "${newColorName.trim()}" adicionada com sucesso!`);
  };

  const handleRemoveColor = (indexToRemove: number) => {
    const updated = colors.filter((_, idx) => idx !== indexToRemove);
    setColors(updated);
    handleRegenerateMatrix(updated, sizes);
  };

  // Add/Remove Sizes
  const handleAddSize = (sizeToAdd?: string) => {
    const val = (sizeToAdd || newSizeName).trim();
    if (!val) return;
    if (sizes.includes(val)) {
      showToast('Este tamanho já foi adicionado.');
      return;
    }
    const updated = [...sizes, val];
    setSizes(updated);
    setNewSizeName('');
    handleRegenerateMatrix(colors, updated);
    showToast(`Tamanho "${val}" adicionado!`);
  };

  const handleRemoveSize = (indexToRemove: number) => {
    const updated = sizes.filter((_, idx) => idx !== indexToRemove);
    setSizes(updated);
    handleRegenerateMatrix(colors, updated);
  };

  // Preset size loaders
  const handleApplySizePreset = (preset: 'clothing' | 'shoes' | 'tech') => {
    let presetSizes: string[] = [];
    if (preset === 'clothing') presetSizes = ['P', 'M', 'G', 'GG', 'XG'];
    if (preset === 'shoes') presetSizes = ['37', '38', '39', '40', '41', '42', '43', '44'];
    if (preset === 'tech') presetSizes = ['128GB', '256GB', '512GB', '1TB'];

    setSizes(presetSizes);
    handleRegenerateMatrix(colors, presetSizes);
    showToast('Grade de tamanhos aplicada com sucesso!');
  };

  // Add/Remove Kits
  const handleAddKit = (qty?: number, discount?: number, customTitle?: string, badge?: string) => {
    const quantity = qty !== undefined ? qty : newKitQty;
    const discountPercentage = discount !== undefined ? discount : newKitDiscount;
    const kitTitle = customTitle || (quantity === 10 ? 'Kit com 10 Unidades (Atacado)' : `Kit com ${quantity} Unidades`);
    const kitBadge = badge || `Economize ${discountPercentage}%`;

    if (productKits.some((k) => k.quantity === quantity)) {
      showToast(`Já existe um kit cadastrado com ${quantity} unidades.`);
      return;
    }

    const newKit: ProductKit = {
      id: `kit-${quantity}-${Date.now()}`,
      quantity,
      title: kitTitle,
      discountPercentage,
      badge: kitBadge,
    };

    setProductKits([...productKits, newKit]);
    showToast(`Kit com ${quantity} unidades adicionado!`);
  };

  const handleRemoveKit = (idToRemove: string) => {
    setProductKits(productKits.filter((k) => k.id !== idToRemove));
    showToast('Kit removido.');
  };

  // Target Countries Toggle
  const handleToggleCountry = (code: CountryCode) => {
    if (targetCountries.includes(code)) {
      if (targetCountries.length <= 1) {
        showToast('O produto precisa estar visível em ao menos 1 país.');
        return;
      }
      setTargetCountries(targetCountries.filter((c) => c !== code));
    } else {
      setTargetCountries([...targetCountries, code]);
    }
  };

  const handleSelectAllCountries = () => {
    setTargetCountries(operationalCountries?.map((c) => c.code) || []);
    showToast('Todos os países operacionais selecionados!');
  };

  // Media Handlers
  const handleAddImageUrl = () => {
    if (!newImageUrl.trim()) return;
    if (gallery.includes(newImageUrl.trim())) {
      showToast('Esta imagem já foi adicionada.');
      return;
    }
    setGallery([...gallery, newImageUrl.trim()]);
    setNewImageUrl('');
    showToast('Nova imagem adicionada à galeria!');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingImage(true);
    let uploadedCount = 0;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files.item(i);
        if (file) {
          try {
            const res = await uploadService.uploadProduct(file);
            if (res && res.url) {
              setGallery((prev) => [...prev, res.url]);
              uploadedCount++;
            }
          } catch (err: any) {
            console.error(`Erro ao fazer upload da imagem ${file.name}:`, err);
            showToast(`Falha no upload da imagem "${file.name}": ${err?.message || 'Erro de envio'}`);
          }
        }
      }

      if (uploadedCount > 0) {
        showToast(`${uploadedCount} foto(s) enviada(s) com sucesso para o armazenamento R2!`);
      }
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };



  const handleRemoveImage = (indexToRemove: number) => {
    if (gallery.length <= 1) {
      showToast('O produto precisa ter pelo menos 1 foto principal.');
      return;
    }
    setGallery(gallery.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSetPrimaryImage = (index: number) => {
    if (index === 0) return;
    const item = gallery[index];
    const newArr = [item, ...gallery.filter((_, idx) => idx !== index)];
    setGallery(newArr);
    showToast('Foto definida como Capa Principal!');
  };

  const handleGenerateAiDescription = async () => {
    if (!title.trim()) {
      showToast('Informe ao menos o título do produto para gerar com IA.');
      return;
    }

    setIsGeneratingAi(true);
    try {
      const res = await fetch('/api/gemini/seller-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          category,
          brand: brand && brand.trim() ? brand.trim() : undefined,
          specs: {
            Modelo: model && model.trim() ? model.trim() : undefined,
            Condição: condition === 'novo' ? 'Novo' : 'Usado',
            Estoque: stock !== '' ? stock : undefined,
          },
        }),
      });
      const data = await res.json();
      if (data.description) {
        setDescription(data.description);
        showToast('Descrição gerada com IA Gemini com sucesso!');
      } else {
        showToast(data.error || 'Não foi possível gerar a descrição com IA.');
      }
    } catch (err: any) {
      console.error('Erro ao gerar descrição com IA:', err);
      showToast('Falha ao conectar com o serviço de IA. Mantendo descrição atual.');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !price) {
      showToast('Por favor, preencha o título e o preço.');
      return;
    }

    if (!isEditing && !selectedStore?.id) {
      showToast('Selecione uma loja antes de publicar um produto. A loja define o país de origem do produto.');
      return;
    }

    const priceNum = parseFloat(price) || 0;
    const origPriceNum = originalPrice ? parseFloat(originalPrice) : priceNum * 1.2;
    const discPercentage = Math.round(((origPriceNum - priceNum) / origPriceNum) * 100);
    const selectedCategoryObj = activeCategories.find(
      (c: any) => c.id === category || c.slug === category || c.name === category
    ) || activeCategories[0];

    if (!selectedCategoryObj) {
      showToast('Por favor, escolha uma categoria válida cadastrada no painel Admin.');
      return;
    }

    if (!isLeafCategory(selectedCategoryObj.id, activeCategories)) {
      showToast(
        `A categoria "${selectedCategoryObj.name}" possui subcategorias. Por favor, selecione uma categoria mais específica.`
      );
      return;
    }

    // Validate mandatory category attributes from DB
    if (dbAttributes && dbAttributes.length > 0) {
      for (const attr of dbAttributes) {
        if (attr.isRequired) {
          const val = categorySpecs[attr.name] || categorySpecs[attr.code];
          if (!val || !String(val).trim()) {
            showToast(`O atributo "${attr.name}" é de preenchimento obrigatório para esta categoria.`);
            return;
          }
        }
      }
    }

    // Validate cover image (Requirement 2: no fake Unsplash fallback, mandatory image)
    if (!gallery || gallery.length === 0 || !gallery[0] || !gallery[0].trim()) {
      showToast('Por favor, adicione pelo menos uma imagem real de capa para o produto.');
      return;
    }
    const mainCoverImage = gallery[0].trim();

    // Validate stock (Requirement 5: no fallback || 10, stock = 0 is valid)
    const parsedStock = parseInt(stock, 10);
    if (stock === '' || stock === undefined || stock === null || isNaN(parsedStock) || parsedStock < 0) {
      showToast('Por favor, informe uma quantidade válida de estoque (número inteiro maior ou igual a 0).');
      return;
    }

    // BLOCKER_LAUNCH: peso é obrigatório — o backend rejeita a criação sem
    // ele (orderService precisa desse valor para calcular frete no
    // checkout), então bloqueamos aqui também para dar um erro claro antes
    // de bater na API.
    const parsedWeight = weightKg ? parseFloat(weightKg) : undefined;
    if (parsedWeight === undefined || isNaN(parsedWeight) || parsedWeight <= 0) {
      showToast('Por favor, informe o peso do produto com embalagem, em kg (obrigatório, maior que zero) — necessário para calcular o frete.');
      return;
    }
    const parsedLength = lengthCm ? parseFloat(lengthCm) : undefined;
    const parsedWidth = widthCm ? parseFloat(widthCm) : undefined;
    const parsedHeight = heightCm ? parseFloat(heightCm) : undefined;

    // Mesma exigência do peso: o backend rejeita a criação/edição sem
    // dimensões válidas (shippingCalculatorService precisa delas para o
    // peso volumétrico), então bloqueamos aqui também com um erro claro.
    const hasDimensions = parsedLength !== undefined && !isNaN(parsedLength) && parsedLength > 0
      && parsedWidth !== undefined && !isNaN(parsedWidth) && parsedWidth > 0
      && parsedHeight !== undefined && !isNaN(parsedHeight) && parsedHeight > 0;
    if (!hasDimensions) {
      showToast('Por favor, informe o comprimento, largura e altura da embalagem, em cm (todos obrigatórios, maiores que zero) — necessários para calcular o frete.');
      return;
    }
    const dimensionsObj = { length: parsedLength, width: parsedWidth, height: parsedHeight };
    const formattedDimensionsStr = hasDimensions ? `${parsedLength} × ${parsedWidth} × ${parsedHeight} cm` : undefined;

    const cleanVideoUrl = shortVideoUrl && shortVideoUrl.startsWith('http') ? shortVideoUrl.trim() : undefined;

    const isInternationalProduct = publishingScope === 'international';
    const effectiveTargetCountries = isInternationalProduct
      ? (targetCountries.length > 0 ? targetCountries : (operationalCountries?.map((c) => c.code) || []))
      : [originCountry];

    if (isEditing && initialProduct && onUpdateProduct) {
      const cleanEditSpecs: Record<string, any> = {
        ...categorySpecs,
        ...initialProduct.specs,
      };
      if (brand && brand.trim()) cleanEditSpecs['Marca'] = brand.trim();
      else delete cleanEditSpecs['Marca'];
      if (model && model.trim()) cleanEditSpecs['Modelo'] = model.trim();
      else delete cleanEditSpecs['Modelo'];
      cleanEditSpecs['Condição'] = condition === 'novo' ? 'Novo' : 'Usado';
      if (parsedWeight !== undefined) cleanEditSpecs['Peso'] = `${parsedWeight} kg`;
      if (formattedDimensionsStr) cleanEditSpecs['Dimensões'] = formattedDimensionsStr;
      if (warrantyMonths && warrantyMonths.trim()) cleanEditSpecs['Garantia'] = `${warrantyMonths.trim()} Meses`;
      else delete cleanEditSpecs['Garantia'];
      if (warehouseHub && warehouseHub.trim()) cleanEditSpecs['Armazém'] = warehouseHub.trim();
      else delete cleanEditSpecs['Armazém'];

      const updatedProduct: Product = {
        ...initialProduct,
        title,
        price: priceNum,
        currency,
        originalPrice: origPriceNum,
        discountPercentage: discPercentage > 0 ? discPercentage : undefined,
        image: mainCoverImage,
        galleryImages: gallery,
        weightKg: parsedWeight,
        dimensionsCm: dimensionsObj,
        publishingScope,
        originCountry,
        targetCountries: effectiveTargetCountries,
        productKits,
        availableColors: colors,
        availableSizes: sizes,
        variants: variantsMatrix,
        videos: cleanVideoUrl
          ? [
              {
                url: cleanVideoUrl,
                title: shortVideoTitle || 'Vídeo do Produto',
                duration: shortVideoDuration || '',
                thumbnail: mainCoverImage,
              },
            ]
          : [],
        videoUrl: cleanVideoUrl,
        shortVideo: cleanVideoUrl
          ? {
              url: cleanVideoUrl,
              title: shortVideoTitle || 'Vídeo do Produto',
              duration: shortVideoDuration || '',
              thumbnail: mainCoverImage,
            }
          : undefined,
        categoryId: selectedCategoryObj.id,
        category: selectedCategoryObj.name,
        categorySlug: selectedCategoryObj.slug,
        condition,
        brand: brand && brand.trim() ? brand.trim() : undefined,
        model: model && model.trim() ? model.trim() : undefined,
        stock: parsedStock,
        description: description ? description.trim() : '',
        shipping: {
          ...initialProduct.shipping,
          isInternational: isInternationalProduct,
          originCountry,
          targetCountries: effectiveTargetCountries,
        },
        specs: cleanEditSpecs,
      };

      if (onUpdateProduct) {
        await onUpdateProduct(updatedProduct);
      }
      showToast('Alterações do produto salvas com sucesso!');
      if (updatedProduct?.id && typeof updatedProduct.id === 'string' && updatedProduct.id !== 'undefined') {
        onOpenProductDetail(updatedProduct.id);
      }
      return;
    }

    const cleanCreateSpecs: Record<string, any> = { ...categorySpecs };
    if (brand && brand.trim()) cleanCreateSpecs['Marca'] = brand.trim();
    if (model && model.trim()) cleanCreateSpecs['Modelo'] = model.trim();
    cleanCreateSpecs['Condição'] = condition === 'novo' ? 'Novo' : 'Usado';
    if (parsedWeight !== undefined) cleanCreateSpecs['Peso'] = `${parsedWeight} kg`;
    if (formattedDimensionsStr) cleanCreateSpecs['Dimensões'] = formattedDimensionsStr;
    if (warrantyMonths && warrantyMonths.trim()) cleanCreateSpecs['Garantia'] = `${warrantyMonths.trim()} Meses`;
    if (warehouseHub && warehouseHub.trim()) cleanCreateSpecs['Armazém'] = warehouseHub.trim();

    const created = await onAddProduct({
      title,
      price: priceNum,
      currency,
      storeId: selectedStore?.id,
      countryCode: originCountry,
      originalPrice: origPriceNum,
      discountPercentage: discPercentage > 0 ? discPercentage : undefined,
      image: mainCoverImage,
      galleryImages: gallery,
      weightKg: parsedWeight,
      dimensionsCm: dimensionsObj,
      publishingScope,
      originCountry,
      targetCountries: effectiveTargetCountries,
      productKits,
      availableColors: colors,
      availableSizes: sizes,
      variants: variantsMatrix,
      videos: cleanVideoUrl
        ? [
            {
              url: cleanVideoUrl,
              title: shortVideoTitle || 'Vídeo do Produto',
              duration: shortVideoDuration || '',
              thumbnail: mainCoverImage,
            },
          ]
        : [],
      videoUrl: cleanVideoUrl,
      shortVideo: cleanVideoUrl
        ? {
            url: cleanVideoUrl,
            title: shortVideoTitle || 'Vídeo do Produto',
            duration: shortVideoDuration || '',
            thumbnail: mainCoverImage,
          }
        : undefined,
      categoryId: selectedCategoryObj.id,
      category: selectedCategoryObj.name,
      categorySlug: selectedCategoryObj.slug,
      brand: brand && brand.trim() ? brand.trim() : undefined,
      model: model && model.trim() ? model.trim() : undefined,
      stock: parsedStock,
      description: description ? description.trim() : '',
      specs: cleanCreateSpecs,
    });

    const createdProductId = created?.id || created?.data?.id;

    if (!createdProductId || typeof createdProductId !== 'string' || createdProductId === 'undefined' || createdProductId.trim() === '') {
      showToast('Não foi possível obter o ID real do produto criado. Por favor, verifique se o cadastro foi salvo.');
      return;
    }

    showToast('Produto publicado com sucesso no Mercado Nusali!');
    onOpenProductDetail(createdProductId);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn">
      {/* Top Header */}
      <div
        className={`rounded-2xl border p-6 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
          isEditing ? 'bg-amber-50/70 border-amber-300' : 'bg-white border-gray-200'
        }`}
      >
        <div>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <Edit3 className="w-6 h-6 text-amber-700 shrink-0" />
            ) : (
              <PlusCircle className="w-6 h-6 text-emerald-700 shrink-0" />
            )}
            <h1 className="text-xl font-black text-gray-900">
              {isEditing ? 'Editar Anúncio do Produto' : 'Cadastrar Novo Anúncio de Produto'}
            </h1>
            {isEditing && (
              <span className="bg-amber-200 text-amber-900 border border-amber-300 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                MODO EDIÇÃO
              </span>
            )}
          </div>
          <p className="text-xs text-gray-600 mt-1">
            {isEditing
              ? 'Todos os dados salvos foram carregados no formulário. Altere os campos desejados e mantenha os demais inalterados.'
              : 'Preencha os detalhes do produto, configure kits, variações com estoque vinculado e escopo de visibilidade.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isEditing && onCancelEdit && (
            <button
              type="button"
              onClick={onCancelEdit}
              className="px-3.5 py-1.5 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-bold rounded-xl text-xs transition cursor-pointer"
            >
              Cancelar Edição
            </button>
          )}
          <span className="bg-yellow-400 text-blue-950 font-black text-xs px-3 py-1 rounded-xl shrink-0">
            Passo {wizardStep} de 5
          </span>
        </div>
      </div>

      {/* Step Indicators */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-2xs grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs font-bold">
        {[
          { step: 1, label: '1. Dados Básicos' },
          { step: 2, label: '2. Escopo & Países' },
          { step: 3, label: '3. Cores, Tamanhos & Kits' },
          { step: 4, label: '4. Preço & Logística' },
          { step: 5, label: '5. Mídia & Publicar' },
        ].map((s) => (
          <button
            key={s.step}
            type="button"
            onClick={() => setWizardStep(s.step)}
            className={`p-2.5 rounded-xl transition cursor-pointer ${
              wizardStep === s.step
                ? 'bg-emerald-600 text-white shadow-xs font-black'
                : wizardStep > s.step
                ? 'bg-emerald-50 text-emerald-800'
                : 'bg-gray-50 text-gray-400'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Step Form Body */}
      <form onSubmit={handlePublish} className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs space-y-6">
        {/* STEP 1: Basic Info */}
        {wizardStep === 1 && (
          <div className="space-y-4 text-xs font-medium">
            <div>
              <label className="block text-gray-800 font-bold mb-1">
                Título Completo do Anúncio *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Tênis Esportivo Air Runner Respirável - Várias Cores"
                required
                className="w-full p-2.5 border border-gray-300 rounded-xl focus:border-emerald-600 focus:outline-hidden text-sm font-medium"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-800 font-bold mb-1">Categoria *</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl bg-white font-medium text-xs"
                  disabled={isLoadingCategories}
                >
                  {isLoadingCategories ? (
                    <option value="">Carregando categorias...</option>
                  ) : activeCategories.length === 0 ? (
                    <option value="">Nenhuma categoria cadastrada no Admin</option>
                  ) : (
                    activeCategories.map((c: any) => {
                      const path = getCategoryPath(c.id, activeCategories);
                      const pathLabel = path.length > 0 ? path.map((p) => p.name).join(' > ') : c.name;
                      return (
                        <option key={c.id} value={c.id}>
                          {pathLabel}
                        </option>
                      );
                    })
                  )}
                </select>
              </div>

            {/* Category Breadcrumb & Hierarchical Drill-down Picker */}
            {category && (
              <div className="space-y-2 sm:col-span-2">
                {(() => {
                  const path = getCategoryPath(category, activeCategories);
                  const isLeaf = isLeafCategory(category, activeCategories);
                  const children = getDirectChildren(category, activeCategories);

                  return (
                    <>
                      {path.length > 0 && (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1">
                          <div className="text-[10px] font-black text-emerald-800 uppercase tracking-wider">
                            Caminho da Categoria Selecionada:
                          </div>
                          <div className="flex items-center gap-1.5 font-extrabold text-xs text-emerald-950 flex-wrap">
                            {path.map((p, idx) => (
                              <React.Fragment key={p.id}>
                                {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                                <span className={idx === path.length - 1 ? 'underline decoration-emerald-500 font-black' : ''}>
                                  {p.name}
                                </span>
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      )}

                      {!isLeaf && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                          <div className="flex items-center gap-1.5 text-amber-900 text-xs font-bold">
                            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                            <span>
                              A categoria acima possui subcategorias. Por favor, escolha uma categoria folha mais específica:
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {children.map((child) => (
                              <button
                                key={child.id}
                                type="button"
                                onClick={() => setCategory(child.id)}
                                className="px-3 py-1.5 bg-white hover:bg-emerald-600 hover:text-white border border-amber-300 rounded-lg text-xs font-bold text-gray-800 transition flex items-center gap-1 cursor-pointer shadow-2xs"
                              >
                                <span>{child.name}</span>
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

              <div>
                <label className="block text-gray-800 font-bold mb-1">Condição do Produto *</label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value as any)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl bg-white font-bold"
                >
                  <option value="novo">Novo (Lacrado de fábrica)</option>
                  <option value="usado">Usado (Excelente estado)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-800 font-bold mb-1">Marca</label>
                <input
                  type="text"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="Ex: Nike, Apple, Samsung, Marca Própria..."
                  className="w-full p-2.5 border border-gray-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-gray-800 font-bold mb-1">Modelo / Linha</label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Ex: Air Runner Pro 2026"
                  className="w-full p-2.5 border border-gray-300 rounded-xl"
                />
              </div>
            </div>

            {/* Characteristics & Real Category Attributes from Supabase */}
            <div className="p-5 bg-white border border-gray-200 rounded-2xl space-y-4 shadow-2xs">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div>
                  <h4 className="font-extrabold text-sm text-gray-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    Características do produto
                  </h4>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Preencha as especificações configuradas no catálogo para aumentar a relevância do seu anúncio nas buscas.
                  </p>
                </div>
                {isLoadingDbAttributes && (
                  <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                )}
              </div>

              {isLoadingDbAttributes ? (
                <div className="p-4 text-center text-xs text-gray-400 font-medium">
                  Carregando características da categoria...
                </div>
              ) : dbAttributes.length === 0 ? (
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs text-gray-500 font-medium text-center">
                  Esta categoria não possui características específicas cadastradas no catálogo.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Sort: Mandatory attributes first, Optional after */}
                  {[...dbAttributes]
                    .sort((a, b) => (a.isRequired === b.isRequired ? (a.sortOrder - b.sortOrder) : a.isRequired ? -1 : 1))
                    .map((attr) => {
                      const valKey = attr.code || attr.name;
                      const currentValue = categorySpecs[attr.name] ?? categorySpecs[attr.code] ?? '';
                      const optionsList: string[] = Array.isArray(attr.optionsJson) ? attr.optionsJson : [];

                      return (
                        <div key={attr.id || attr.code} className="space-y-1">
                          <label className="block text-gray-900 font-extrabold text-xs flex items-center justify-between">
                            <span>
                              {attr.name}
                              {attr.isRequired && <span className="text-red-500 font-black ml-0.5">*</span>}
                            </span>
                            {attr.unit && (
                              <span className="text-[10px] bg-purple-50 text-purple-700 font-bold px-1.5 py-0.2 rounded-md">
                                {attr.unit}
                              </span>
                            )}
                          </label>

                          {attr.type === 'select' ? (
                            <select
                              value={currentValue}
                              onChange={(e) => handleCategorySpecChange(valKey, e.target.value)}
                              className="w-full p-2.5 border border-gray-300 rounded-xl bg-white text-xs font-bold text-gray-900 focus:ring-2 focus:ring-purple-500"
                            >
                              <option value="">Selecione {attr.name}...</option>
                              {optionsList.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          ) : attr.type === 'boolean' ? (
                            <select
                              value={currentValue}
                              onChange={(e) => handleCategorySpecChange(valKey, e.target.value)}
                              className="w-full p-2.5 border border-gray-300 rounded-xl bg-white text-xs font-bold text-gray-900 focus:ring-2 focus:ring-purple-500"
                            >
                              <option value="">Selecione...</option>
                              <option value="Sim">Sim</option>
                              <option value="Não">Não</option>
                            </select>
                          ) : attr.type === 'multiselect' ? (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {optionsList.map((opt) => {
                                const selectedArr = currentValue ? currentValue.split(', ') : [];
                                const isSelected = selectedArr.includes(opt);
                                return (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={() => {
                                      const next = isSelected
                                        ? selectedArr.filter((s) => s !== opt)
                                        : [...selectedArr, opt];
                                      handleCategorySpecChange(valKey, next.join(', '));
                                    }}
                                    className={`px-2.5 py-1 text-xs rounded-lg border font-bold transition cursor-pointer ${
                                      isSelected
                                        ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                                        : 'bg-white text-gray-700 border-gray-300 hover:border-purple-400'
                                    }`}
                                  >
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="relative">
                              <input
                                type={attr.type === 'number' ? 'number' : 'text'}
                                value={currentValue}
                                onChange={(e) => handleCategorySpecChange(valKey, e.target.value)}
                                placeholder={attr.placeholder || `Digite ${attr.name}`}
                                className="w-full p-2.5 border border-gray-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-purple-500 bg-white"
                              />
                            </div>
                          )}

                          {attr.helpText && (
                            <p className="text-[10px] text-gray-400 font-medium">{attr.helpText}</p>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 2: Publishing Scope & Visibility (Nacional vs Internacional) */}
        {wizardStep === 2 && (
          <div className="space-y-6 text-xs font-medium">
            <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-2xl space-y-2">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                <Globe className="w-5 h-5 text-blue-600" />
                <span>Alcance e Escopo de Publicação do Produto</span>
              </h3>
              <p className="text-gray-600 text-xs">
                Defina se este produto será vendido exclusivamente no seu mercado nacional ou exportado internacionalmente para compradores de outros países da CPLP e parceiros. Você pode alterar essa configuração a qualquer momento.
              </p>
            </div>

            {/* Scope Selector Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Option A: National */}
              <div
                onClick={() => setPublishingScope('national')}
                className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${
                  publishingScope === 'national'
                    ? 'border-emerald-600 bg-emerald-50/40 shadow-xs ring-2 ring-emerald-600/20'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-black text-sm text-gray-900 flex items-center gap-2">
                    <Package className="w-4 h-4 text-emerald-700" />
                    Venda Apenas Nacional
                  </span>
                  <input
                    type="radio"
                    checked={publishingScope === 'national'}
                    onChange={() => setPublishingScope('national')}
                    className="w-4 h-4 text-emerald-600 focus:ring-emerald-500"
                  />
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  O produto será visível e entregue apenas dentro do país de origem ({originCountryName}). Sem taxas aduaneiras internacionais.
                </p>
              </div>

              {/* Option B: International */}
              <div
                onClick={() => setPublishingScope('international')}
                className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${
                  publishingScope === 'international'
                    ? 'border-indigo-600 bg-indigo-50/40 shadow-xs ring-2 ring-indigo-600/20'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-black text-sm text-indigo-950 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-indigo-600" />
                    Venda Internacional (Cross-Border)
                  </span>
                  <input
                    type="radio"
                    checked={publishingScope === 'international'}
                    onChange={() => setPublishingScope('international')}
                    className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                  />
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  O produto será identificado como <strong>Compra Internacional</strong> pelos clientes, com exibição do país de procedência e envio via Nusali Global Transit.
                </p>
              </div>
            </div>

            {/* Country of Origin — locked to the selected store's country. The store is the
                authority over the product's operational origin; this can no longer be picked
                independently to avoid store/product country divergence (validated again on
                the backend regardless). */}
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl space-y-2">
              <label className="block text-gray-800 font-bold">
                País de Origem / Expedição do Produto
              </label>
              {originCountry ? (
                <div className="w-full sm:w-1/2 p-2.5 border border-gray-300 rounded-xl bg-gray-100 font-bold text-gray-700 flex items-center gap-2">
                  <span>{originCountryFlag}</span>
                  <span>{originCountryName} ({originCountry})</span>
                </div>
              ) : (
                <div className="w-full sm:w-1/2 p-2.5 border border-amber-300 rounded-xl bg-amber-50 font-bold text-amber-800 text-xs">
                  Selecione uma loja para definir o país de origem.
                </div>
              )}
              <p className="text-[11px] text-gray-500">
                Definido automaticamente pelo país cadastrado da sua loja ({selectedStoreName || 'loja selecionada'}) — não pode divergir dela.
                Os compradores verão a bandeira e nome deste país como a origem do produto no anúncio.
              </p>
            </div>

            {/* International Target Countries Selector */}
            {publishingScope === 'international' && (
              <div className="p-5 bg-indigo-50/40 border border-indigo-200 rounded-2xl space-y-4 animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-indigo-200/60">
                  <div>
                    <h4 className="font-black text-gray-900 text-sm flex items-center gap-2">
                      <Globe className="w-4 h-4 text-indigo-700" />
                      Países Onde o Produto Será Visível e Comercializado
                    </h4>
                    <p className="text-[11px] text-gray-600">
                      Selecione quais mercados podem buscar, visualizar e comprar este item:
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllCountries}
                      className="px-3 py-1 bg-white hover:bg-indigo-100 text-indigo-800 font-bold border border-indigo-300 rounded-lg text-[11px] transition cursor-pointer"
                    >
                      Selecionar Todos
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetCountries([originCountry])}
                      className="px-3 py-1 bg-white hover:bg-gray-100 text-gray-700 font-bold border border-gray-300 rounded-lg text-[11px] transition cursor-pointer"
                    >
                      Apenas Origem
                    </button>
                  </div>
                </div>

                {countriesLoading && (
                  <p className="text-xs text-gray-500">Carregando países operacionais...</p>
                )}
                {!countriesLoading && countriesError && (
                  <p className="text-xs text-red-600">Não foi possível carregar a lista de países. Tente novamente em instantes.</p>
                )}
                {!countriesLoading && !countriesError && (!operationalCountries || operationalCountries.length === 0) && (
                  <p className="text-xs text-amber-700">Nenhum país operacional disponível no momento.</p>
                )}

                {!countriesLoading && !countriesError && operationalCountries && operationalCountries.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {operationalCountries.map((c) => {
                    const code = c.code;
                    const isSelected = targetCountries.includes(code);
                    const isOrigin = code === originCountry;
                    return (
                      <div
                        key={code}
                        onClick={() => handleToggleCountry(code)}
                        className={`p-3 rounded-xl border-2 flex items-center justify-between cursor-pointer transition-all ${
                          isSelected
                            ? 'border-indigo-600 bg-white shadow-xs'
                            : 'border-gray-200 bg-gray-50/60 opacity-60 hover:opacity-100'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{c.flag}</span>
                          <div>
                            <p className="font-bold text-gray-900 text-xs">{c.name}</p>
                            <span className="text-[10px] text-gray-500 font-mono">{code}</span>
                          </div>
                        </div>

                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleCountry(code)}
                          className="w-4 h-4 text-indigo-600 rounded-sm focus:ring-indigo-500"
                        />
                      </div>
                    );
                  })}
                </div>
                )}

                <div className="bg-white p-3 rounded-xl border border-indigo-100 flex items-center gap-2 text-xs text-indigo-950">
                  <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>
                    Produto visível em <strong>{targetCountries.length} de {operationalCountries?.length || 0} países</strong>. Compradores desses locais verão os preços convertidos e prazos de entrega específicos.
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 3: Colors, Sizes & Linked Stock Variations + Product Kits */}
        {wizardStep === 3 && (
          <div className="space-y-8 text-xs font-medium">
            {/* 1. SEÇÃO DE KITS DE PRODUTOS (BUNDLES / LOTES) */}
            <div className="p-5 bg-amber-50/50 border border-amber-200 rounded-2xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-amber-200/60">
                <div>
                  <h3 className="font-black text-gray-900 text-sm flex items-center gap-2">
                    <Gift className="w-4.5 h-4.5 text-amber-700" />
                    Kits de Produtos (Lotes com Desconto: 2, 5, 10 Unidades)
                  </h3>
                  <p className="text-[11px] text-gray-600">
                    Permita que os compradores escolham comprar pacotes com desconto progressivo (Kit de 2, Kit de 5, Kit de 10).
                  </p>
                </div>

                {/* Quick Add Presets */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleAddKit(2, 10, 'Kit com 2 Unidades', 'Economize 10%')}
                    className="px-2.5 py-1 bg-white hover:bg-amber-100 text-amber-900 font-bold border border-amber-300 rounded-lg text-[11px] transition flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> + Kit de 2 (10% OFF)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddKit(5, 18, 'Kit com 5 Unidades', 'Mais Vendido')}
                    className="px-2.5 py-1 bg-white hover:bg-amber-100 text-amber-900 font-bold border border-amber-300 rounded-lg text-[11px] transition flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> + Kit de 5 (18% OFF)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddKit(10, 25, 'Kit com 10 Unidades (Atacado)', 'Preço de Atacado')}
                    className="px-2.5 py-1 bg-white hover:bg-amber-100 text-amber-900 font-bold border border-amber-300 rounded-lg text-[11px] transition flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> + Kit de 10 (Atacado)
                  </button>
                </div>
              </div>

              {/* Existing Kits List */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {productKits.map((kit) => (
                  <div
                    key={kit.id}
                    className="p-3.5 bg-white border border-amber-200 rounded-xl space-y-2 shadow-2xs relative group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="bg-amber-100 text-amber-900 text-[10px] font-black px-2 py-0.5 rounded-md border border-amber-300">
                        {kit.badge || `${kit.discountPercentage}% OFF`}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveKit(kit.id)}
                        className="text-gray-400 hover:text-red-600 p-1 transition"
                        title="Remover este kit"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <p className="font-bold text-gray-900 text-sm">{kit.title}</p>

                    <div className="text-[11px] text-gray-600 space-y-0.5">
                      <p>Quantidade no pacote: <strong>{kit.quantity} unidades</strong></p>
                      <p>Desconto concedido: <strong className="text-green-700">{kit.discountPercentage}% OFF</strong></p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Custom Kit Creator */}
              <div className="p-3 bg-white rounded-xl border border-amber-200 flex flex-wrap items-center gap-3">
                <span className="font-bold text-gray-800 text-xs">Adicionar Kit Customizado:</span>
                <div className="flex items-center gap-1">
                  <span className="text-gray-500">Qtd:</span>
                  <input
                    type="number"
                    min="2"
                    max="100"
                    value={newKitQty}
                    onChange={(e) => setNewKitQty(Number(e.target.value))}
                    className="w-16 p-1.5 border border-gray-300 rounded-lg text-xs font-bold"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-gray-500">Desconto (%):</span>
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={newKitDiscount}
                    onChange={(e) => setNewKitDiscount(Number(e.target.value))}
                    className="w-16 p-1.5 border border-gray-300 rounded-lg text-xs font-bold"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleAddKit()}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs flex items-center gap-1 shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar Kit
                </button>
              </div>
            </div>

            {/* 2. SEÇÃO DE CORES E TAMANHOS */}
            <div className="space-y-6 pt-4 border-t border-gray-200">
              {/* Cores Builder */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                      <Palette className="w-4 h-4 text-purple-600" />
                      1. Cores Disponíveis ({colors.length})
                    </h3>
                    <p className="text-[11px] text-gray-500">
                      Adicione as cores em que o produto é fabricado. O comprador poderá selecionar a cor desejada.
                    </p>
                  </div>
                </div>

                {/* Color pills with thumbnails */}
                <div className="flex flex-wrap gap-2.5">
                  {colors.map((c, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 p-1.5 pr-2.5 bg-white border border-gray-300 rounded-xl shadow-2xs"
                    >
                      {c.image ? (
                        <img
                          src={c.image}
                          alt={c.name}
                          className="w-7 h-7 rounded-lg object-cover border border-gray-200"
                        />
                      ) : (
                        <span
                          className="w-5 h-5 rounded-full border border-gray-400 shrink-0"
                          style={{ backgroundColor: c.hex || '#374151' }}
                        />
                      )}
                      <div>
                        <p className="font-bold text-gray-800 text-xs leading-none">{c.name}</p>
                        {c.description && (
                          <p className="text-[10px] text-gray-400 truncate max-w-[120px]">
                            {c.description}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveColor(idx)}
                        className="text-gray-400 hover:text-red-600 ml-1 cursor-pointer"
                        title="Remover cor"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add Color inputs */}
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="text"
                      value={newColorName}
                      onChange={(e) => setNewColorName(e.target.value)}
                      placeholder="Nome da cor (ex: Azul Titânio, Preto)"
                      className="p-2 border border-gray-300 rounded-xl text-xs flex-1 min-w-[150px] bg-white"
                    />
                    <div className="flex items-center gap-1 p-1 bg-white border border-gray-300 rounded-xl">
                      <input
                        type="color"
                        value={newColorHex}
                        onChange={(e) => setNewColorHex(e.target.value)}
                        className="w-7 h-7 rounded-lg cursor-pointer border-none"
                      />
                      <span className="font-mono text-[10px] text-gray-600 pr-1">{newColorHex}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="text"
                      value={newColorImage}
                      onChange={(e) => setNewColorImage(e.target.value)}
                      placeholder="URL da Foto / Miniatura da Cor (opcional)"
                      className="p-2 border border-gray-300 rounded-xl text-xs flex-1 min-w-[200px] bg-white"
                    />
                    <input
                      type="text"
                      value={newColorDesc}
                      onChange={(e) => setNewColorDesc(e.target.value)}
                      placeholder="Descrição desta cor (opcional)"
                      className="p-2 border border-gray-300 rounded-xl text-xs flex-1 min-w-[200px] bg-white"
                    />
                    <button
                      type="button"
                      onClick={handleAddColor}
                      className="px-3 py-2 bg-gray-800 hover:bg-gray-900 text-white font-bold rounded-xl text-xs flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" /> Adicionar Cor
                    </button>
                  </div>
                </div>
              </div>

              {/* Tamanhos Builder */}
              <div className="space-y-3 pt-4 border-t border-gray-100">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                      <Maximize2 className="w-4 h-4 text-blue-600" />
                      2. Tamanhos / Capacidades ({sizes.length})
                    </h3>
                    <p className="text-[11px] text-gray-500">
                      Defina os tamanhos (P, M, G / 38, 40, 42 / 128GB, 256GB).
                    </p>
                  </div>

                  {/* Size Presets */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-gray-500 font-bold">Grades Prontas:</span>
                    <button
                      type="button"
                      onClick={() => handleApplySizePreset('clothing')}
                      className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-[10px] font-bold"
                    >
                      Vestuário (P, M, G, GG)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplySizePreset('shoes')}
                      className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-[10px] font-bold"
                    >
                      Calçados (37 a 44)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplySizePreset('tech')}
                      className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-[10px] font-bold"
                    >
                      Memória (128GB a 1TB)
                    </button>
                  </div>
                </div>

                {/* Size badges */}
                <div className="flex flex-wrap gap-2">
                  {sizes.map((s, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-900 rounded-xl shadow-2xs"
                    >
                      <span className="font-bold text-xs">{s}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSize(idx)}
                        className="text-blue-400 hover:text-red-600 ml-1"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add Custom Size */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newSizeName}
                    onChange={(e) => setNewSizeName(e.target.value)}
                    placeholder="Adicionar tamanho avulso (ex: 42 ou XXL)"
                    className="p-2 border border-gray-300 rounded-xl text-xs flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddSize()}
                    className="px-3 py-2 bg-gray-800 hover:bg-gray-900 text-white font-bold rounded-xl text-xs flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar Tamanho
                  </button>
                </div>
              </div>

              {/* 3. MATRIZ DE PREÇO, SKU E ESTOQUE POR VARIAÇÃO */}
              <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-4 pt-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
                  <div>
                    <h3 className="font-black text-gray-900 text-sm flex items-center gap-2">
                      <Boxes className="w-4 h-4 text-emerald-700" />
                      3. Tabela de Preços, SKUs e Estoque por Variação ({variantsMatrix.length} Opções)
                    </h3>
                    <p className="text-[11px] text-gray-600">
                      Configure o <strong>preço específico</strong> para cada tamanho ou capacidade, código SKU de separação no armazém e unidades disponíveis.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="bg-emerald-100 text-emerald-950 font-black px-3 py-1.5 rounded-xl text-xs border border-emerald-300">
                      Estoque Total: {stock} un.
                    </div>
                  </div>
                </div>

                {/* Variant Fast Action Tools */}
                <div className="flex flex-wrap items-center gap-2 p-2.5 bg-white border border-gray-200 rounded-xl">
                  <span className="text-[11px] font-bold text-gray-500 flex items-center gap-1">
                    ⚡ Ações Rápidas:
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyBasePriceToAllVariants}
                    className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                    title="Copia o preço base geral para todas as variações da tabela"
                  >
                    💰 Copiar Preço Base ({parseFloat(price) > 0 ? parseFloat(price).toLocaleString('pt-BR') : '0'}) para Todos
                  </button>
                  {sizes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleApplyPriceScaleBySizes(15)}
                      className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                      title="Calcula preços progressivos para tamanhos maiores (+15% a cada nível)"
                    >
                      📈 Escala por Tamanho (+15%)
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleGenerateAutoSkus}
                    className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                    title="Gera códigos SKU organizados para envio e separação logística"
                  >
                    🏷️ Gerar SKUs de Separação
                  </button>
                </div>

                {/* Matrix Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <thead className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200">
                      <tr>
                        <th className="p-3">Cor</th>
                        <th className="p-3">Tamanho / Capacidade</th>
                        <th className="p-3">Preço da Variação (Moeda) *</th>
                        <th className="p-3">Preço Original (Riscado)</th>
                        <th className="p-3">SKU de Separação</th>
                        <th className="p-3 text-center">Estoque (Un.)</th>
                        <th className="p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {variantsMatrix.map((item, idx) => {
                        const basePriceNum = parseFloat(price) || 0;
                        const currentVariantPrice = item.price ?? basePriceNum;
                        const hasCustomPrice = item.price !== undefined && item.price !== basePriceNum && basePriceNum > 0;
                        const diffPct = basePriceNum > 0 && item.price !== undefined
                          ? Math.round(((item.price - basePriceNum) / basePriceNum) * 100)
                          : 0;

                        return (
                          <tr key={item.id || idx} className="hover:bg-gray-50/80 transition-colors">
                            <td className="p-3 font-bold text-gray-900 flex items-center gap-2">
                              {item.image ? (
                                <img
                                  src={item.image}
                                  alt={item.color || 'Variação'}
                                  className="w-7 h-7 rounded-lg object-cover border border-gray-200"
                                />
                              ) : (
                                <span className="w-3 h-3 rounded-full bg-gray-700 shrink-0" />
                              )}
                              <span>{item.color || 'Padrão'}</span>
                            </td>
                            <td className="p-3">
                              <span className="bg-blue-50 text-blue-900 border border-blue-200 font-black px-2 py-1 rounded-md text-xs">
                                {item.size || 'Único / Padrão'}
                              </span>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  placeholder={basePriceNum > 0 ? String(basePriceNum) : 'Preço'}
                                  value={item.price !== undefined ? item.price : ''}
                                  onChange={(e) =>
                                    handleUpdateVariantPrice(
                                      idx,
                                      e.target.value === '' ? (basePriceNum || 0) : parseFloat(e.target.value) || 0
                                    )
                                  }
                                  className={`w-28 p-1.5 border rounded-lg font-bold text-sm bg-white focus:ring-2 focus:ring-emerald-500 ${
                                    hasCustomPrice
                                      ? 'border-emerald-500 bg-emerald-50/30 text-emerald-950 font-black'
                                      : 'border-gray-300 text-gray-800'
                                  }`}
                                />
                                {hasCustomPrice && (
                                  <span
                                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                      diffPct > 0
                                        ? 'bg-purple-100 text-purple-800'
                                        : 'bg-emerald-100 text-emerald-800'
                                    }`}
                                  >
                                    {diffPct > 0 ? `+${diffPct}%` : `${diffPct}%`}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-3">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                placeholder="Opcional"
                                value={item.originalPrice !== undefined ? item.originalPrice : ''}
                                onChange={(e) =>
                                  handleUpdateVariantOriginalPrice(
                                    idx,
                                    e.target.value === '' ? undefined : parseFloat(e.target.value) || undefined
                                  )
                                }
                                className="w-24 p-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 bg-white"
                              />
                            </td>
                            <td className="p-3">
                              <input
                                type="text"
                                placeholder="SKU-VAR-001"
                                value={item.sku || ''}
                                onChange={(e) => handleUpdateVariantSku(idx, e.target.value)}
                                className="w-36 p-1.5 border border-gray-300 rounded-lg font-mono text-[11px] text-gray-700 bg-white"
                              />
                            </td>
                            <td className="p-3 text-center">
                              <input
                                type="number"
                                min="0"
                                value={item.stock}
                                onChange={(e) => handleUpdateVariantStock(idx, parseInt(e.target.value) || 0)}
                                className="w-20 p-1.5 border border-gray-300 rounded-lg font-bold text-center bg-white focus:border-emerald-600"
                              />
                            </td>
                            <td className="p-3">
                              {item.stock > 5 ? (
                                <span className="text-emerald-700 font-bold text-[11px] bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 whitespace-nowrap">
                                  ✓ Em Estoque ({item.stock})
                                </span>
                              ) : item.stock > 0 ? (
                                <span className="text-amber-700 font-bold text-[11px] bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 whitespace-nowrap">
                                  ⚠️ Poucas ({item.stock})
                                </span>
                              ) : (
                                <span className="text-red-700 font-bold text-[11px] bg-red-50 px-2 py-0.5 rounded-md border border-red-200 whitespace-nowrap">
                                  ✕ Esgotado
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Price, Weight & Dimensions (Logistics) */}
        {wizardStep === 4 && (
          <div className="space-y-6 text-xs font-medium">
            {/* Price & Stock Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-gray-800 font-bold mb-1">Moeda do Produto *</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold text-xs focus:border-emerald-600 focus:outline-hidden bg-white"
                >
                  <option value="XOF">XOF - Franco CFA (Guiné-Bissau)</option>
                  <option value="BRL">BRL - Real (Brasil)</option>
                  <option value="EUR">EUR - Euro (Portugal)</option>
                  <option value="AOA">AOA - Kwanza (Angola)</option>
                  <option value="USD">USD - Dólar (Internacional)</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-800 font-bold mb-1">Preço de Venda ({currency}) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder={currency === 'XOF' ? '5000' : '100'}
                  required
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold text-sm focus:border-emerald-600 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-gray-800 font-bold mb-1">Preço Riscado ({currency})</label>
                <input
                  type="number"
                  step="0.01"
                  value={originalPrice}
                  onChange={(e) => setOriginalPrice(e.target.value)}
                  placeholder={currency === 'XOF' ? '6000' : '120'}
                  className="w-full p-2.5 border border-gray-300 rounded-xl text-gray-400 focus:border-emerald-600 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-gray-800 font-bold mb-1">Estoque Total *</label>
                <input
                  type="number"
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  required
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold focus:border-emerald-600 focus:outline-hidden bg-gray-50"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-1 gap-4">
              <div>
                <label className="block text-gray-800 font-bold mb-1">Garantia do Fabricante (Meses)</label>
                <input
                  type="number"
                  value={warrantyMonths}
                  onChange={(e) => setWarrantyMonths(e.target.value)}
                  placeholder="Ex: 12 (Deixe em branco se não houver)"
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold focus:border-emerald-600 focus:outline-hidden"
                />
              </div>
            </div>

            {/* SEÇÃO OBRIGATÓRIA DE MEDIDAS E PESO DO PACOTE */}
            <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-2xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-emerald-200/60">
                <div>
                  <h3 className="font-bold text-gray-900 text-xs sm:text-sm flex items-center gap-1.5">
                    <Scale className="w-4 h-4 text-emerald-700" />
                    <span>Peso e Medidas da Embalagem (Para Frete &amp; Etiqueta de Envio) *</span>
                  </h3>
                  <p className="text-[11px] text-gray-600">
                    Estes dados são essenciais para emissão da etiqueta de envio, pesagem aduaneira e cálculo do transporte.
                  </p>
                </div>
                <span className="bg-emerald-700 text-white text-[10px] font-black px-2.5 py-1 rounded-lg shrink-0">
                  Consta na Etiqueta 100x150mm
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-gray-800 font-bold mb-1 flex items-center gap-1 text-[11px]">
                    <Scale className="w-3.5 h-3.5 text-emerald-700" /> Peso com Embalagem (kg) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={weightKg}
                    onChange={(e) => setWeightKg(e.target.value)}
                    placeholder="0.50"
                    required
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold bg-white focus:border-emerald-600 focus:outline-hidden"
                  />
                  <span className="text-[10px] text-gray-500 mt-0.5 block">Ex: 0.45 kg ou 1.20 kg</span>
                </div>

                <div>
                  <label className="block text-gray-800 font-bold mb-1 flex items-center gap-1 text-[11px]">
                    <Ruler className="w-3.5 h-3.5 text-blue-700" /> Comprimento (cm) *
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    value={lengthCm}
                    onChange={(e) => setLengthCm(e.target.value)}
                    placeholder="20"
                    required
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold bg-white focus:border-emerald-600 focus:outline-hidden"
                  />
                  <span className="text-[10px] text-gray-500 mt-0.5 block">Ex: 20 cm</span>
                </div>

                <div>
                  <label className="block text-gray-800 font-bold mb-1 flex items-center gap-1 text-[11px]">
                    <Ruler className="w-3.5 h-3.5 text-blue-700" /> Largura (cm) *
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    value={widthCm}
                    onChange={(e) => setWidthCm(e.target.value)}
                    placeholder="15"
                    required
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold bg-white focus:border-emerald-600 focus:outline-hidden"
                  />
                  <span className="text-[10px] text-gray-500 mt-0.5 block">Ex: 15 cm</span>
                </div>

                <div>
                  <label className="block text-gray-800 font-bold mb-1 flex items-center gap-1 text-[11px]">
                    <Box className="w-3.5 h-3.5 text-amber-700" /> Altura (cm) *
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    value={heightCm}
                    onChange={(e) => setHeightCm(e.target.value)}
                    placeholder="10"
                    required
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold bg-white focus:border-emerald-600 focus:outline-hidden"
                  />
                  <span className="text-[10px] text-gray-500 mt-0.5 block">Ex: 10 cm</span>
                </div>
              </div>

              {/* Volume preview banner */}
              <div className="bg-white p-3 rounded-xl border border-emerald-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span className="text-gray-700">
                    Dimensões Finais:{' '}
                    <strong className="text-gray-900 font-mono">
                      {lengthCm || 0} × {widthCm || 0} × {heightCm || 0} cm
                    </strong>{' '}
                    &bull; Volume:{' '}
                    <strong className="text-emerald-700 font-mono">
                      {(
                        (parseFloat(lengthCm) || 0) *
                        (parseFloat(widthCm) || 0) *
                        (parseFloat(heightCm) || 0)
                      ).toLocaleString('pt-BR')}{' '}
                      cm³
                    </strong>
                  </span>
                </div>
                <span className="text-gray-500 font-medium">
                  Peso Declarado na Etiqueta: <strong className="text-gray-900 font-mono">{weightKg ? `${weightKg} kg` : 'Peso não informado'}</strong>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: Media, Description, Gemini AI & Save */}
        {wizardStep === 5 && (
          <div className="space-y-6 text-xs font-medium">
            {/* Gallery Images */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-gray-200">
                <div>
                  <h3 className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-blue-600" /> Fotos do Produto ({gallery.length} Cadastradas)
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    A primeira foto será a capa do anúncio.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isUploadingImage}
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold px-3 py-1 rounded-lg text-[11px] flex items-center gap-1 shadow-xs cursor-pointer"
                  >
                    {isUploadingImage ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Enviando para R2...
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5" /> Enviar Fotos Reais
                      </>
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Add Image by URL */}
              <div className="flex gap-2">
                <input
                  type="url"
                  value={newImageUrl}
                  onChange={(e) => setNewImageUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddImageUrl();
                    }
                  }}
                  placeholder="Ou cole a URL direta de uma imagem (https://...)"
                  className="flex-1 p-2.5 border border-gray-300 rounded-xl text-xs"
                />
                <button
                  type="button"
                  onClick={handleAddImageUrl}
                  className="bg-gray-800 hover:bg-gray-900 text-white px-3 py-2 rounded-xl font-bold flex items-center gap-1 shrink-0"
                >
                  <Plus className="w-4 h-4" /> Adicionar Foto
                </button>
              </div>

              {/* Photos Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                {gallery.map((imgUrl, idx) => {
                  const isPrimary = idx === 0;
                  return (
                    <div
                      key={idx}
                      className={`relative group bg-gray-50 rounded-xl border-2 p-2 flex flex-col items-center justify-between transition-all ${
                        isPrimary
                          ? 'border-blue-600 bg-blue-50/30 ring-2 ring-blue-500/20'
                          : 'border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      <div className="w-full flex items-center justify-between mb-1">
                        {isPrimary ? (
                          <span className="bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-sm flex items-center gap-0.5 shadow-xs">
                            <Star className="w-2.5 h-2.5 fill-white" /> Capa
                          </span>
                        ) : (
                          <span className="bg-gray-200 text-gray-700 text-[9px] font-bold px-1.5 py-0.5 rounded-sm">
                            Foto {idx + 1}
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => handleRemoveImage(idx)}
                          className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="w-full h-24 flex items-center justify-center p-1 bg-white rounded-lg border border-gray-100 overflow-hidden mb-2">
                        <img src={imgUrl} alt={`Foto ${idx + 1}`} className="max-h-full max-w-full object-contain" />
                      </div>

                      {!isPrimary && (
                        <button
                          type="button"
                          onClick={() => handleSetPrimaryImage(idx)}
                          className="w-full py-1 text-[10px] font-bold bg-white hover:bg-blue-50 text-blue-700 border border-gray-200 hover:border-blue-300 rounded-md transition text-center"
                        >
                          Definir como Capa
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Short Video */}
            <div className="space-y-3 pt-4 border-t border-gray-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-gray-100">
                <div>
                  <h3 className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                    <Film className="w-4 h-4 text-emerald-600" /> Vídeo Curto de Demonstração / Unboxing
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Vídeos aumentam conversões e mostram detalhes reais do item aos compradores.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-lg border border-gray-200">
                    Upload de arquivo de vídeo em breve
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-8">
                  <label className="block text-gray-700 font-bold text-[11px] mb-1">URL do Vídeo</label>
                  <input
                    type="url"
                    value={shortVideoUrl}
                    onChange={(e) => setShortVideoUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full p-2.5 border border-gray-300 rounded-xl text-xs font-mono"
                  />
                </div>
                <div className="sm:col-span-4">
                  <label className="block text-gray-700 font-bold text-[11px] mb-1">Título do Vídeo</label>
                  <input
                    type="text"
                    value={shortVideoTitle}
                    onChange={(e) => setShortVideoTitle(e.target.value)}
                    placeholder="Ex: Demonstração e Detalhes"
                    className="w-full p-2.5 border border-gray-300 rounded-xl text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Description & Gemini AI */}
            <div className="space-y-4 pt-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <label className="block font-bold text-gray-900">Descrição Comercial do Produto</label>
                <button
                  type="button"
                  onClick={handleGenerateAiDescription}
                  disabled={isGeneratingAi}
                  className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold px-3 py-1.5 rounded-xl text-[11px] flex items-center gap-1.5 shadow-xs transition"
                >
                  <Sparkles className="w-3.5 h-3.5 text-yellow-300 fill-yellow-300" />
                  {isGeneratingAi ? 'Gerando com Gemini IA...' : 'Gerar com Inteligência Artificial'}
                </button>
              </div>

              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={6}
                placeholder="Descreva as principais características, vantagens, benefícios e instruções do produto..."
                className="w-full p-3 border border-gray-300 rounded-xl focus:border-emerald-600 focus:outline-hidden text-xs"
              />
            </div>
          </div>
        )}

        {/* Wizard Footer Controls */}
        <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
          <button
            type="button"
            disabled={wizardStep === 1}
            onClick={() => setWizardStep(wizardStep - 1)}
            className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-700 disabled:opacity-40 flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" /> Anterior
          </button>

          {wizardStep < 5 ? (
            <button
              type="button"
              onClick={() => setWizardStep(wizardStep + 1)}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1 transition shadow-xs cursor-pointer"
            >
              Próximo Passo <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="submit"
              className={`px-6 py-2.5 text-white font-black rounded-xl text-xs flex items-center gap-1.5 shadow-md transition cursor-pointer ${
                isEditing
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {isEditing ? (
                <>
                  <Save className="w-4 h-4" /> Salvar Alterações do Produto
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Publicar Anúncio no Mercado Nusali
                </>
              )}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
