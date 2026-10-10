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
import { getCategoryPath, isLeafCategory, getDirectChildren, getDescendantIds } from '../../utils/categoryUtils';
import { CategoriesApi } from '../../api/clients/CategoriesApi';
import { ProductAttributeFields, AttributeCategoryChangeNotice } from './ProductAttributeFields';
import { VariantAxesPanel } from './VariantAxesPanel';
import { planAxisUi, buildVariantKey } from '../../utils/variantAxes';
import { SellerApi } from '../../api/clients/SellerApi';
import { buildAxisPayload, effectiveSecondColumn, effectiveSecondJson, extraAxisValuesFromVariants, inferSecondJson, requiredAxesBlockingSimple, simpleModeAxesMessage, uiVariantsFromLoaded, validatePayloadAgainstAxes } from '../../utils/variantAxisWizard';
import {
  selectFormAttributes,
  validateFormFields,
  buildAttributeSpecs,
  reconcileValues,
  initialValuesFromProduct,
  extractSubmitError,
  buildAttributePatch,
  removedByCategoryChange,
  attributeLoadBlock,
  loadCategoryAttributes,
  ATTRIBUTE_LOAD_MESSAGES,
  type FormAttribute,
  type FormValue,
  type FormValues,
} from '../../utils/attributeFormModel';
import { humanizeAttributeKey } from '../../utils/attributeFormat';
import { uploadService } from '../../services/uploadService';
import {
  Product,
  ProductCondition,
  CurrencyCode,
  CountryCode,
  PublishingScope,
  ProductKit,
  ProductColor,
  ProductVariant,
} from '../../types';
import { countriesConfig, getCountryFlag, getCountryName } from '../../utils/currencyUtils';
import { useCountries } from '../../hooks/useCountries';
import {
  type ProductMode,
  deriveProductMode,
  deriveColorsFromVariants,
  deriveSizesFromVariants,
  groupVariantsByColor,
  propagateColorImage,
  computeVariantsSummary,
  deriveProductLevelPricing,
  validateVariantEntry,
  buildVariantsPayloadForSubmit,
} from '../../utils/productVariantWizard';

// Fase M1-D2.6 — payload de escrita (create/update). NÃO é um Product
// normalizado: é o formato de WIRE que o backend aceita em
// products.* — `condition` em inglês ('new'|'used'|'refurbished') ou null
// (o normalizeProduct converte para 'novo'/'usado'/'recondicionado' só na
// LEITURA), `categoryId` flat, etc. O parent
// (SellerHubView.handleAddNewProduct/handleUpdateProduct, ambos `(p: any)`)
// repassa direto para SellerService.createProduct/updateProduct.
type SellerProductWritePayload = Omit<Partial<Product>, 'condition'> & {
  // O backend aceita AMBOS os formatos em products.condition:
  // productCreationService.ts e sellerRoutes.ts (PATCH) têm o mesmo
  // conditionMap { new/novo -> new, used/usado -> used,
  // refurbished/recondicionado -> refurbished }. `null` limpa o campo.
  condition?: 'new' | 'used' | 'refurbished' | ProductCondition | null;
};

// Product.videos é `ProductVideo[] | string[]` — o primeiro elemento pode
// ser uma string (URL solta) OU um objeto. Extrai os campos com segurança
// sem assumir que é sempre objeto (normalizeProduct passa `p.videos`
// adiante como veio).
function firstVideoParts(videos: Product['videos']): { url?: string; title?: string; duration?: string } {
  const v = Array.isArray(videos) ? videos[0] : undefined;
  if (!v) return {};
  if (typeof v === 'string') return { url: v };
  return { url: v.url, title: v.title, duration: v.duration };
}

interface SellerProductWizardProps {
  initialProduct?: Product | null;
  onAddProduct: (p: SellerProductWritePayload) => Promise<any> | any;
  onUpdateProduct?: (p: SellerProductWritePayload) => Promise<any> | any;
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
  // Correção pré-piloto (condição opcional): NUNCA pré-selecionar 'novo' nem
  // 'usado' — string vazia = "não se aplica" (ex.: Manga, Banana, serviços).
  // O vendedor escolhe explicitamente, ou deixa em branco.
  const [condition, setCondition] = useState<'novo' | 'usado' | 'recondicionado' | ''>(initialProduct?.condition || '');
  const conditionLabel = (c: typeof condition): string | undefined =>
    c === 'novo' ? 'Novo' : c === 'usado' ? 'Usado' : c === 'recondicionado' ? 'Recondicionado' : undefined;

  const [dbAttributes, setDbAttributes] = useState<any[]>([]);
  const [isLoadingDbAttributes, setIsLoadingDbAttributes] = useState(false);
  // P1: falha de carregamento != categoria sem atributos. `attrLoadedFor` = categoria cujos atributos estão em `dbAttributes`.
  const [attrLoadError, setAttrLoadError] = useState(false);
  const [attrLoadedFor, setAttrLoadedFor] = useState<string | null>(null);
  const [attrReloadToken, setAttrReloadToken] = useState(0);
  // Legado: mapa de textos do produto em EDIÇÃO (rótulos gerais, chaves antigas). A criação usa os valores tipados abaixo.
  const [categorySpecs] = useState<Record<string, string>>(
    (initialProduct?.specs as Record<string, string>) || (initialProduct?.attributesJson as any) || {}
  );

  // Fase 5: atributos efetivos da subcategoria (herança, substituições e desativações já resolvidas pelo backend). Só especificações
  // (eixos de variante ficam nas etapas de variações) e sem campos que repetem Marca/Modelo/Condição/Garantia/Peso/Dimensões.
  const formFields: FormAttribute[] = React.useMemo(() => selectFormAttributes(dbAttributes).fields, [dbAttributes]);
  const [attrValues, setAttrValues] = useState<FormValues>({});
  const [attrErrors, setAttrErrors] = useState<Record<string, string>>({});
  const [droppedLabels, setDroppedLabels] = useState<string[]>([]);
  const attrValuesRef = useRef<FormValues>({});
  attrValuesRef.current = attrValues;
  const previousFieldsRef = useRef<FormAttribute[]>([]);
  // Fase 6 (edição): fotografia dos campos/valores da categoria ORIGINAL do produto — base do diff enviado ao PATCH e da lista do que
  // se perde numa troca de subcategoria.
  const originalCapturedRef = useRef(false);
  const originalFieldsRef = useRef<FormAttribute[]>([]);
  const originalValuesRef = useRef<FormValues>({});
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const [serverRemoval, setServerRemoval] = useState<{ message: string; labels: string[] } | null>(null);

  useEffect(() => {
    setServerRemoval(null);
    setConfirmRemoval(false);
    if (!category) {
      setDbAttributes([]);
      setAttrLoadError(false);
      setAttrLoadedFor(null);
      return;
    }
    let isSubscribed = true;
    setIsLoadingDbAttributes(true);
    setAttrLoadError(false);

    loadCategoryAttributes((c) => CategoriesApi.getCategoryAttributes(c), category)
      .then((res) => {
        if (isSubscribed && res.ok) {
          if (isEditing && !originalCapturedRef.current && category === (initialProduct?.categoryId ?? category)) {
            const originalFields = selectFormAttributes(res.data).fields;
            originalFieldsRef.current = originalFields;
            originalValuesRef.current = initialValuesFromProduct(originalFields, initialProduct);
            originalCapturedRef.current = true;
          }
          setDbAttributes(res.data);
          setAttrLoadedFor(category);
        } else if (isSubscribed) {
          // P1: NÃO zera os atributos (nem, por consequência, os valores já preenchidos/da edição): só marca a falha para a tela
          // mostrar o erro com "Tentar novamente" e bloquear a publicação.
          console.error('Error loading category attributes:', (res as { error?: unknown }).error);
          setAttrLoadError(true);
        }
      })
      .finally(() => {
        if (isSubscribed) setIsLoadingDbAttributes(false);
      });

    return () => {
      isSubscribed = false;
    };
  }, [category, attrReloadToken]);

  const attrBlock = attributeLoadBlock({ category, loadedFor: attrLoadedFor, loading: isLoadingDbAttributes, failed: attrLoadError });
  const retryAttributes = () => setAttrReloadToken((n) => n + 1);

  // Quando os atributos efetivos mudam (primeira carga ou troca de subcategoria): mantém o que continua válido (ex.: Cor herdada),
  // descarta o resto e avisa. Na edição, os valores atuais do produto entram uma única vez.
  useEffect(() => {
    // Na edição os valores atuais do produto entram por baixo do que a pessoa já mexeu (voltar à categoria original recupera o que
    // tinha sido descartado numa troca).
    const base: FormValues = isEditing && originalCapturedRef.current ? { ...originalValuesRef.current, ...attrValuesRef.current } : attrValuesRef.current;
    const { values, dropped } = reconcileValues(formFields, base);
    const names = dropped.map((code) => previousFieldsRef.current.find((f) => f.code === code)?.name || code);
    setAttrValues(values);
    setDroppedLabels(names);
    setAttrErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([code]) => formFields.some((f) => f.code === code))));
    previousFieldsRef.current = formFields;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formFields]);

  // Fase 7 (edição): ao escolher OUTRA categoria, prévia do servidor — comissão das vendas futuras e se as variações atuais cabem nos eixos novos.
  useEffect(() => {
    setCategoryPreview(null);
    if (!isEditing || !initialProduct?.id || !category || !currentCategoryObjId || currentCategoryObjId === initialProduct.categoryId) return;
    let alive = true;
    SellerApi.getCategoryChangePreview(String(initialProduct.id), currentCategoryObjId)
      .then((res) => { if (alive && res?.success && res.data) setCategoryPreview({ commission: res.data.commission, variants: res.data.variants }); })
      .catch(() => { /* a prévia é só um aviso; o servidor valida de qualquer forma ao salvar */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, activeCategories]);

  const handleToggleColorOption = (name: string) => {
    const idx = colors.findIndex((c) => c.name.toLowerCase() === name.toLowerCase());
    if (idx >= 0) {
      handleRemoveColor(idx);
      return;
    }
    const updated = [...colors, { name, hex: '#111827' }];
    setColors(updated);
    handleRegenerateMatrix(updated, sizes);
  };

  const handleToggleSecondOption = (value: string) => {
    const idx = sizes.findIndex((s2) => s2.toLowerCase() === value.toLowerCase());
    if (idx >= 0) {
      handleRemoveSize(idx);
      return;
    }
    handleAddSize(value);
  };

  const handleAttrChange = (code: string, value: FormValue) => {
    setAttrValues((prev) => ({ ...prev, [code]: value }));
    // a especificação de "Outro" (chave `código__outro`) limpa o erro do próprio campo
    const errKey = code.endsWith('__outro') ? code.slice(0, -'__outro'.length) : code;
    setAttrErrors((prev) => {
      if (!(errKey in prev)) return prev;
      const { [errKey]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const currentCategoryObj = React.useMemo(
    () => activeCategories.find((c: any) => c.id === category || c.slug === category || c.name === category),
    [activeCategories, category]
  );
  const categoryChanged = isEditing && !!currentCategoryObj && currentCategoryObj.id !== initialProduct?.categoryId;
  const removedLabels: string[] = React.useMemo(
    () => (categoryChanged && originalCapturedRef.current ? removedByCategoryChange(originalFieldsRef.current, formFields, originalValuesRef.current) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categoryChanged, formFields]
  );
  const displayRemoved = removedLabels.length > 0 ? removedLabels : serverRemoval?.labels ?? [];
  // características gravadas que a categoria atual já não pede (desativadas): seguem salvas, mas ficam fora da página e da edição
  const inactiveLabels: string[] =
    isEditing && !categoryChanged && originalCapturedRef.current && Array.isArray((initialProduct as any)?.attributeValues)
      ? ((initialProduct as any).attributeValues as any[])
          .filter((v) => !originalFieldsRef.current.some((f) => f.code === v.code))
          .map((v) => String(v.name || v.code))
      : [];

  /** Leva o vendedor ao primeiro campo com erro (etapa 1) e foca nele. */
  const focusFirstAttrError = (codes: string[]) => {
    setWizardStep(1);
    const target = codes[0];
    if (!target) return;
    setTimeout(() => {
      const el = document.getElementById(`attr-field-${target}`) as HTMLElement | null;
      el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      el?.focus?.();
    }, 60);
  };

  // Sem categoria pré-selecionada: com a taxonomia de ~320 categorias, a primeira da lista seria um departamento (não folha) e
  // induziria o erro. O vendedor escolhe a subcategoria específica (validação de folha no cliente e no servidor).

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

  const [targetCountries, setTargetCountries] = useState<CountryCode[]>(
    initialProduct?.targetCountries && initialProduct.targetCountries.length > 0
      ? initialProduct.targetCountries
      : initialProduct?.shipping?.targetCountries && initialProduct.shipping.targetCountries.length > 0
      ? initialProduct.shipping.targetCountries
      : []
  );

  // Países operacionais reais (GET /api/v1/countries) — nunca ALL_COUNTRY_CODES.
  const { data: operationalCountries, isLoading: countriesLoading, isError: countriesError } = useCountries();

  // Melhoria pré-piloto (elegibilidade por país): ANTES, isto preenchia
  // "todos os países operacionais" automaticamente assim que a lista
  // carregava — violava diretamente a regra "INTERNATIONAL nunca é todos os
  // países implícito". Como esse campo nunca era persistido de verdade, o
  // bug nunca teve efeito real; agora que é persistido, o vendedor precisa
  // escolher os países explicitamente (o botão "Selecionar todos" abaixo
  // continua disponível para quem realmente quiser todos, mas é uma ação
  // deliberada, não um default).

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

  // FASE D16-B1 — "produto com variações" nunca foi um campo salvo; é
  // sempre inferido de existir pelo menos uma variante REAL (nunca de
  // availableColors/availableSizes, que o backend nunca persiste — achado
  // central da auditoria D16-A2.5). Guardamos também se o produto JÁ tinha
  // variantes reais ao abrir o editor, para decidir no submit se alternar
  // para "simples" deve desativar (variants: []) ou simplesmente nunca ter
  // tido nada a desativar (variants: undefined) — ver buildVariantsPayloadForSubmit.
  const [productMode, setProductMode] = useState<ProductMode>(() => deriveProductMode(initialProduct?.variants));
  const hadRealVariantsOnLoadRef = useRef<boolean>(deriveProductMode(initialProduct?.variants) === 'variable');

  // Step 3: Variations (Colors, Sizes & Stock Matrix) and Product Kits (Bundles)
  // Reconstruídas das VARIANTES REAIS devolvidas pelo backend — nunca de
  // availableColors/availableSizes (campos fantasma, nunca persistidos).
  const [colors, setColors] = useState<ProductColor[]>(() => deriveColorsFromVariants(initialProduct?.variants));
  const [newColorName, setNewColorName] = useState('');
  const [newColorHex, setNewColorHex] = useState('#111827');
  const [newColorImage, setNewColorImage] = useState('');
  const [newColorDesc, setNewColorDesc] = useState('');
  // Upload de imagem por CARD de cor (reaproveita uploadService.uploadProduct,
  // mesma infra do upload de galeria — nunca um novo endpoint).
  const colorImageInputRef = useRef<HTMLInputElement | null>(null);
  const [editingColorImageIndex, setEditingColorImageIndex] = useState<number | null>(null);

  const [sizes, setSizes] = useState<string[]>(() => deriveSizesFromVariants(uiVariantsFromLoaded(initialProduct?.variants ?? [], inferSecondJson(initialProduct?.variants as any))));
  const [newSizeName, setNewSizeName] = useState('');

  // Stock per variant matrix
  const [variantsMatrix, setVariantsMatrix] = useState<ProductVariant[]>(() => {
    if (initialProduct?.variants && initialProduct.variants.length > 0) {
      return uiVariantsFromLoaded(initialProduct.variants, inferSecondJson(initialProduct.variants as any));
    }
    return [];
  });

  const currentCategoryObjId: string | undefined = activeCategories.find((c: any) => c.id === category || c.slug === category || c.name === category)?.id;

  // Fase 7 — eixos de variante da categoria (herança/substituição/desativação já resolvidas pelo backend) e a ponte com a matriz.
  const axes = React.useMemo(() => selectFormAttributes(dbAttributes).axes, [dbAttributes]);
  const axisUi = React.useMemo(() => planAxisUi(axes), [axes]);
  const secondColumn = effectiveSecondColumn(axes, initialProduct?.variants as any);
  // P2: 2ª dimensão guardada em attributes_json (ex.: Voltagem 110 V / 220 V, cada valor uma variação) e o nome REAL dela na tela.
  const secondJson = effectiveSecondJson(axes, initialProduct?.variants as any);
  const secondName = axisUi.secondAxis?.name || (secondJson ? humanizeAttributeKey(secondJson) : '');
  const secondHeading = secondName || 'Tamanhos / Capacidades';
  // Fase 7 (edição): combinações que JÁ existem — o estoque delas se ajusta em Estoque & Armazéns (o salvamento do anúncio não o altera).
  const existingVariantKeys = React.useMemo(() => new Set((initialProduct?.variants ?? []).map((v: any) => buildVariantKey({ color: v.color, size: v.size, capacity: v.capacity, attributesJson: v.attributesJson })).filter(Boolean) as string[]), [initialProduct]);
  const [extraAxisValues, setExtraAxisValues] = useState<Record<string, string>>({});
  const extraAxisLoadedRef = useRef(false);
  const [variantProblems, setVariantProblems] = useState<string[]>([]);
  const [categoryPreview, setCategoryPreview] = useState<{ commission: { from: { rate: number | null }; to: { rate: number | null }; changed: boolean }; variants: { compatible: boolean; issues: Array<{ message: string }> } } | null>(null);

  useEffect(() => {
    if (isEditing && !extraAxisLoadedRef.current && axisUi.extraAxes.length > 0) {
      extraAxisLoadedRef.current = true;
      setExtraAxisValues(extraAxisValuesFromVariants(axisUi.extraAxes, initialProduct?.variants as any));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [axisUi]);

  useEffect(() => {
    if (variantProblems.length > 0) setVariantProblems([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantsMatrix, extraAxisValues]);


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
      firstVideoParts(initialProduct?.videos).url ||
      ''
  );
  const [shortVideoTitle, setShortVideoTitle] = useState(
    initialProduct?.shortVideo?.title ||
      firstVideoParts(initialProduct?.videos).title ||
      'Vídeo Demonstrativo do Produto'
  );
  const [shortVideoDuration, setShortVideoDuration] = useState(
    initialProduct?.shortVideo?.duration ||
      firstVideoParts(initialProduct?.videos).duration ||
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
      setCondition(initialProduct.condition || '');

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
        setVariantsMatrix(uiVariantsFromLoaded(initialProduct.variants, inferSecondJson(initialProduct.variants as any)));
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
        firstVideoParts(initialProduct.videos).url ||
        '';
      setShortVideoUrl(existingVideo);
      setShortVideoTitle(
        initialProduct.shortVideo?.title ||
          firstVideoParts(initialProduct.videos).title ||
          'Vídeo Demonstrativo do Produto'
      );
      setShortVideoDuration(
        initialProduct.shortVideo?.duration ||
          firstVideoParts(initialProduct.videos).duration ||
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

  // FASE D16-B1 — imagem por CARD de cor. Reaproveita uploadService.uploadProduct
  // (mesma infra do upload de galeria, nenhum endpoint novo). A imagem é
  // sempre da COR, nunca de um tamanho — propagada para TODAS as variantes
  // daquela cor de uma vez (nunca pedimos imagem diferente por M/L/XL).
  const handleOpenColorImagePicker = (colorIndex: number) => {
    setEditingColorImageIndex(colorIndex);
    colorImageInputRef.current?.click();
  };

  const handleColorImageFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const colorIndex = editingColorImageIndex;
    if (colorImageInputRef.current) colorImageInputRef.current.value = '';
    setEditingColorImageIndex(null);
    if (!file || colorIndex === null || !colors[colorIndex]) return;

    const colorName = colors[colorIndex].name;
    try {
      const res = await uploadService.uploadProduct(file);
      if (res?.url) {
        setColors((prev) => prev.map((c, idx) => (idx === colorIndex ? { ...c, image: res.url } : c)));
        setVariantsMatrix((prev) => propagateColorImage(prev, colorName, res.url));
        showToast(`Imagem da cor "${colorName}" atualizada!`);
      }
    } catch (err: any) {
      showToast(`Falha no upload da imagem da cor "${colorName}": ${err?.message || 'Erro de envio'}`);
    }
  };

  const handleRemoveColorImage = (colorIndex: number) => {
    const colorName = colors[colorIndex]?.name;
    if (!colorName) return;
    setColors((prev) => prev.map((c, idx) => (idx === colorIndex ? { ...c, image: undefined } : c)));
    setVariantsMatrix((prev) => propagateColorImage(prev, colorName, undefined));
  };

  // Add/Remove Sizes
  const handleAddSize = (sizeToAdd?: string) => {
    const val = (sizeToAdd || newSizeName).trim();
    if (!val) return;
    if (sizes.includes(val)) {
      showToast(secondName ? `Esta opção de ${secondName} já foi adicionada.` : 'Este tamanho já foi adicionado.');
      return;
    }
    const updated = [...sizes, val];
    setSizes(updated);
    setNewSizeName('');
    handleRegenerateMatrix(colors, updated);
    showToast(`${secondName || 'Tamanho'} "${val}" adicionado!`);
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
            Condição: conditionLabel(condition),
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
    if (!title) {
      showToast('Por favor, preencha o título do produto.');
      return;
    }
    // FASE D16-B1 — produto variável nunca exige o preço "global" da Etapa 4
    // (ele deixou de ser autoridade nesse modo); só produto simples exige.
    if (productMode === 'simple' && !price) {
      showToast('Por favor, preencha o preço do produto.');
      return;
    }

    if (!isEditing && !selectedStore?.id) {
      showToast('Selecione uma loja antes de publicar um produto. A loja define o país de origem do produto.');
      return;
    }

    // FASE D16-B1 — price/originalPrice/stock nunca são pedidos de novo ao
    // vendedor quando o produto é variável: são SEMPRE derivados das
    // variantes reais (menor preço válido, estoque somado, riscado só da
    // variante mais barata) — nunca um valor inventado. Se nenhuma variante
    // tiver preço válido, bloqueia aqui mesmo, antes de qualquer chamada à
    // API, com uma mensagem amigável.
    let priceNum: number;
    let origPriceNum: number | undefined;
    let discPercentage: number;
    let parsedStock: number;

    if (productMode === 'variable') {
      const derivedPricing = deriveProductLevelPricing(variantsMatrix);
      if ('error' in derivedPricing) {
        showToast(derivedPricing.error);
        return;
      }
      priceNum = derivedPricing.price;
      origPriceNum = derivedPricing.originalPrice;
      parsedStock = derivedPricing.stock;
      discPercentage = origPriceNum ? Math.round(((origPriceNum - priceNum) / origPriceNum) * 100) : 0;
    } else {
      priceNum = parseFloat(price) || 0;
      // Correção pré-piloto (preço promocional): "preço anterior" NUNCA pode
      // ser inventado (era priceNum * 1.2 — um desconto de 20% fictício
      // aplicado a todo produto que o vendedor não configurasse). Sem valor
      // real informado, não existe preço anterior — undefined, não um cálculo.
      const parsedOrigPrice = originalPrice ? parseFloat(originalPrice) : undefined;
      if (parsedOrigPrice !== undefined && parsedOrigPrice <= priceNum) {
        showToast('Preço anterior precisa ser maior que o preço atual para configurar uma promoção — ele não será exibido.');
      }
      origPriceNum = parsedOrigPrice !== undefined && parsedOrigPrice > priceNum ? parsedOrigPrice : undefined;
      discPercentage = origPriceNum ? Math.round(((origPriceNum - priceNum) / origPriceNum) * 100) : 0;

      // Validate stock (Requirement 5: no fallback || 10, stock = 0 is valid)
      const parsedStockValue = parseInt(stock, 10);
      if (stock === '' || stock === undefined || stock === null || isNaN(parsedStockValue) || parsedStockValue < 0) {
        showToast('Por favor, informe uma quantidade válida de estoque (número inteiro maior ou igual a 0).');
        return;
      }
      parsedStock = parsedStockValue;
    }

    const selectedCategoryObj = activeCategories.find(
      (c: any) => c.id === category || c.slug === category || c.name === category
    );

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

    // P1: sem os atributos da categoria carregados não há como saber os obrigatórios — nunca publica/salva "às cegas".
    if (attrBlock) {
      showToast(ATTRIBUTE_LOAD_MESSAGES[attrBlock]);
      setWizardStep(1);
      setTimeout(() => document.getElementById('product-attribute-fields')?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), 60);
      return;
    }

    // Fase 5/6: valida TODOS os atributos efetivos com as mesmas regras do servidor (obrigatório, tipo, limites, opções). 0 e "Não" valem.
    // Na EDIÇÃO só valida quando a pessoa mexeu em características ou trocou de categoria — preço/estoque nunca ficam presos por um
    // obrigatório criado depois — e uma troca que perde especificações exige a confirmação explícita.
    let attributePatch: Record<string, unknown> = {};
    if (isEditing) {
      attributePatch = buildAttributePatch(formFields, originalValuesRef.current, attrValues);
    }
    const attributesDirty = isEditing ? Object.keys(attributePatch).length > 0 || categoryChanged : true;
    if (attributesDirty && formFields.length > 0) {
      const found = validateFormFields(formFields, attrValues, isEditing ? originalValuesRef.current : undefined);
      if (Object.keys(found).length > 0) {
        setAttrErrors(found);
        const firstCode = formFields.find((f) => found[f.code])?.code;
        showToast(Object.values(found)[0]);
        focusFirstAttrError(firstCode ? [firstCode] : []);
        return;
      }
    }
    if (isEditing && categoryChanged && displayRemoved.length > 0 && !confirmRemoval) {
      showToast(`Confirme a remoção das características que a nova categoria não tem: ${displayRemoved.join(', ')}.`);
      setWizardStep(1);
      setTimeout(() => document.getElementById('attr-category-change')?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), 60);
      return;
    }

    // P2: eixo obrigatório da categoria não cabe num produto simples (o valor mora na variação): uma só opção = uma variação.
    // Produto que JÁ era simples e só está sendo editado não é bloqueado (compatibilidade com o que já existe).
    if (productMode === 'simple' && (!isEditing || hadRealVariantsOnLoadRef.current)) {
      const blocking = requiredAxesBlockingSimple(axes);
      if (blocking.length > 0) {
        showToast(simpleModeAxesMessage(blocking));
        setWizardStep(3);
        return;
      }
    }

    // Fase 7: variações — eixos da categoria (obrigatório, opções) e combinação única, com as mesmas regras do servidor. A 2ª dimensão do
    // assistente grava em tamanho ou capacidade conforme o eixo; eixos extras valem para o anúncio inteiro.
    const axisPayloadMatrix = productMode === 'variable'
      ? buildAxisPayload(variantsMatrix, { secondColumn, secondJson, extraAxes: axisUi.extraAxes, extraValues: extraAxisValues })
      : variantsMatrix;
    if (productMode === 'variable') {
      const axisErrors = validatePayloadAgainstAxes(axes, axisPayloadMatrix as any[]);
      if (axisErrors.length > 0) {
        const msgs = Array.from(new Set(axisErrors.map((e) => e.message)));
        setVariantProblems(msgs);
        setWizardStep(3);
        showToast(msgs[0]);
        return;
      }
    }

    // Validate cover image (Requirement 2: no fake Unsplash fallback, mandatory image)
    if (!gallery || gallery.length === 0 || !gallery[0] || !gallery[0].trim()) {
      showToast('Por favor, adicione pelo menos uma imagem real de capa para o produto.');
      return;
    }
    const mainCoverImage = gallery[0].trim();

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
    // Melhoria pré-piloto (elegibilidade por país): nunca assumir "todos os
    // países" quando o vendedor não selecionou nenhum — isso violaria a
    // regra de negócio diretamente. Bloqueia o envio e pede seleção explícita.
    if (isInternationalProduct && targetCountries.length === 0) {
      showToast('Selecione ao menos um país de destino para venda internacional.');
      return;
    }
    const effectiveTargetCountries = isInternationalProduct ? targetCountries : [originCountry];

    if (isEditing && initialProduct && onUpdateProduct) {
      const cleanEditSpecs: Record<string, any> = {
        ...categorySpecs,
        ...initialProduct.specs,
      };
      if (brand && brand.trim()) cleanEditSpecs['Marca'] = brand.trim();
      else delete cleanEditSpecs['Marca'];
      if (model && model.trim()) cleanEditSpecs['Modelo'] = model.trim();
      else delete cleanEditSpecs['Modelo'];
      if (conditionLabel(condition)) cleanEditSpecs['Condição'] = conditionLabel(condition);
      else delete cleanEditSpecs['Condição'];
      if (parsedWeight !== undefined) cleanEditSpecs['Peso'] = `${parsedWeight} kg`;
      if (formattedDimensionsStr) cleanEditSpecs['Dimensões'] = formattedDimensionsStr;
      if (warrantyMonths && warrantyMonths.trim()) cleanEditSpecs['Garantia'] = `${warrantyMonths.trim()} Meses`;
      else delete cleanEditSpecs['Garantia'];
      if (warehouseHub && warehouseHub.trim()) cleanEditSpecs['Armazém'] = warehouseHub.trim();
      else delete cleanEditSpecs['Armazém'];

      const updatedProduct: SellerProductWritePayload = {
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
        variants: buildVariantsPayloadForSubmit(productMode, axisPayloadMatrix, hadRealVariantsOnLoadRef.current),
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
        // null explícito (não undefined) para que a limpeza de condição
        // realmente chegue ao PATCH — undefined seria descartado pelo
        // JSON.stringify e o backend nunca saberia que deve limpar o campo.
        condition: condition || null,
        brand: brand && brand.trim() ? brand.trim() : undefined,
        model: model && model.trim() ? model.trim() : undefined,
        ...(productMode === 'simple' ? { stock: parsedStock } : {}),
        description: description ? description.trim() : '',
        shipping: {
          ...initialProduct.shipping,
          isInternational: isInternationalProduct,
          originCountry,
          targetCountries: effectiveTargetCountries,
        },
        specs: cleanEditSpecs,
        // Fase 6: só o que mudou nas características (null = limpar), e a confirmação explícita de perda numa troca de categoria.
        // `attributes`/`attributeValues` vindos do GET não voltam ao servidor.
        ...({
          attributes: undefined,
          attributeValues: undefined,
          ...(Object.keys(attributePatch).length > 0 ? { attributeUpdates: attributePatch } : {}),
          ...(categoryChanged && displayRemoved.length > 0 && confirmRemoval ? { confirmAttributeRemoval: true } : {}),
        } as Record<string, unknown>),
      };

      if (onUpdateProduct) {
        try {
          await onUpdateProduct(updatedProduct);
        } catch (err: any) {
          // O painel já avisou (toast) com a mensagem do servidor; aqui o erro vai ao campo certo ou ao painel de confirmação.
          const parsed = extractSubmitError(err);
          if (parsed.code === 'VARIANT_AXES_INVALID' || parsed.code === 'VARIANT_AXES_INCOMPATIBLE') {
            const msgs = Array.isArray(parsed.details) ? Array.from(new Set<string>(parsed.details.map((d: any) => String(d.message)))) : [parsed.message];
            setVariantProblems(msgs);
            setWizardStep(3);
          } else if (parsed.code === 'ATTRIBUTE_LOSS_CONFIRMATION_REQUIRED') {
            const labels = Array.isArray(parsed.details?.removed) ? parsed.details.removed.map((r: any) => String(r.name || r.code)) : [];
            setServerRemoval({ message: parsed.message, labels });
            setConfirmRemoval(false);
            setWizardStep(1);
            setTimeout(() => document.getElementById('attr-category-change')?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), 60);
          } else {
            const known = Object.fromEntries(Object.entries(parsed.fieldErrors).filter(([code]) => formFields.some((f) => f.code === code)));
            if (Object.keys(known).length > 0) {
              setAttrErrors(known);
              focusFirstAttrError(formFields.filter((f) => known[f.code]).map((f) => f.code));
            }
          }
          return;
        }
      }
      const commissionNote = categoryChanged && categoryPreview?.commission?.changed && categoryPreview.commission.from.rate !== null && categoryPreview.commission.to.rate !== null
        ? ` Comissão das vendas futuras: ${categoryPreview.commission.from.rate}% → ${categoryPreview.commission.to.rate}% (pedidos já feitos não mudam).`
        : '';
      showToast(`Alterações do produto salvas com sucesso!${commissionNote}`);
      if (updatedProduct?.id && typeof updatedProduct.id === 'string' && updatedProduct.id !== 'undefined') {
        onOpenProductDetail(updatedProduct.id);
      }
      return;
    }

    // Valores tipados dos atributos (0 e false preservados) + rótulos gerais legados (Marca, Modelo, Condição, Peso, Dimensões,
    // Garantia, Armazém), que o backend reconhece como campos gerais e nunca como atributo — compatível com PRODUCT_ATTRIBUTES_STRICT=1.
    const cleanCreateSpecs: Record<string, any> = { ...buildAttributeSpecs(formFields, attrValues) };
    if (brand && brand.trim()) cleanCreateSpecs['Marca'] = brand.trim();
    if (model && model.trim()) cleanCreateSpecs['Modelo'] = model.trim();
    if (conditionLabel(condition)) cleanCreateSpecs['Condição'] = conditionLabel(condition);
    if (parsedWeight !== undefined) cleanCreateSpecs['Peso'] = `${parsedWeight} kg`;
    if (formattedDimensionsStr) cleanCreateSpecs['Dimensões'] = formattedDimensionsStr;
    if (warrantyMonths && warrantyMonths.trim()) cleanCreateSpecs['Garantia'] = `${warrantyMonths.trim()} Meses`;
    if (warehouseHub && warehouseHub.trim()) cleanCreateSpecs['Armazém'] = warehouseHub.trim();

    let created: any;
    try {
      created = await onAddProduct({
      title,
      price: priceNum,
      currency,
      storeId: selectedStore?.id,
      countryCode: originCountry,
      originalPrice: origPriceNum,
      // Mapeia para os valores reais aceitos pelo backend (products.condition).
      // '' (não se aplica) -> null, nunca um fallback para 'used'.
      condition: condition === 'novo' ? 'new' : condition === 'usado' ? 'used' : condition === 'recondicionado' ? 'refurbished' : null,
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
      variants: axisPayloadMatrix,
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
    } catch (err: any) {
      // O painel já mostrou o aviso do erro; aqui o servidor aponta o campo exato (PRODUCT_ATTRIBUTES_INVALID.details).
      const parsed = extractSubmitError(err);
      if (parsed.code === 'VARIANT_AXES_INVALID' || parsed.code === 'VARIANT_AXES_INCOMPATIBLE') {
        const msgs = Array.isArray(parsed.details) ? Array.from(new Set<string>(parsed.details.map((d: any) => String(d.message)))) : [parsed.message];
        setVariantProblems(msgs);
        setWizardStep(3);
        return;
      }
      const known = Object.fromEntries(Object.entries(parsed.fieldErrors).filter(([code]) => formFields.some((f) => f.code === code)));
      if (Object.keys(known).length > 0) {
        setAttrErrors(known);
        focusFirstAttrError(formFields.filter((f) => known[f.code]).map((f) => f.code));
      }
      return;
    }

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
                    <>
                      <option value="">Selecione a categoria do produto...</option>
                      {/* Só categorias FOLHA são selecionáveis (a principal vira o rótulo do grupo): com ~320 categorias,
                          agrupar por departamento evita uma lista corrida. Principal sem subcategoria continua selecionável. */}
                      {activeCategories
                        .filter((c: any) => !c.parentId)
                        .map((root: any) => {
                          const leaves = [root, ...getDescendantIds(root.id, activeCategories).map((id) => activeCategories.find((x: any) => x.id === id)!)]
                            .filter((x: any) => x && isLeafCategory(x.id, activeCategories));
                          if (leaves.length === 0) return null;
                          if (leaves.length === 1 && leaves[0].id === root.id) {
                            return (
                              <option key={root.id} value={root.id}>
                                {root.name}
                              </option>
                            );
                          }
                          return (
                            <optgroup key={root.id} label={root.name}>
                              {leaves.map((c: any) => {
                                const path = getCategoryPath(c.id, activeCategories);
                                return (
                                  <option key={c.id} value={c.id}>
                                    {path.slice(1).map((p) => p.name).join(' > ') || c.name}
                                  </option>
                                );
                              })}
                            </optgroup>
                          );
                        })}
                    </>
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
                {/* Correção pré-piloto (condição opcional): NÃO obrigatória
                    para todo tipo de produto (ex.: Manga, Banana, serviços)
                    — "Não se aplica" fica disponível e NADA vem pré-selecionado. */}
                <label className="block text-gray-800 font-bold mb-1">Condição do Produto (opcional)</label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value as any)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl bg-white font-bold"
                >
                  <option value="">Não se aplica</option>
                  <option value="novo">Novo (Lacrado de fábrica)</option>
                  <option value="usado">Usado (Excelente estado)</option>
                  <option value="recondicionado">Recondicionado</option>
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

            {/* Características da categoria (Fase 5): campos dinâmicos por tipo, agrupados, com unidade, limites e erros por campo */}
            {isEditing && categoryChanged && currentCategoryObj && (
              <AttributeCategoryChangeNotice
                fromName={getCategoryPath(initialProduct?.categoryId || '', activeCategories).map((c: any) => c.name).join(' > ') || null}
                toName={getCategoryPath(currentCategoryObj.id, activeCategories).map((c: any) => c.name).join(' > ') || currentCategoryObj.name}
                removedLabels={displayRemoved}
                confirmed={confirmRemoval}
                onConfirm={setConfirmRemoval}
                serverMessage={serverRemoval?.message ?? null}
                extraNotes={[
                  ...(categoryPreview?.commission?.changed
                    ? [categoryPreview.commission.from.rate !== null && categoryPreview.commission.to.rate !== null
                        ? `Comissão: nas vendas FUTURAS deste produto a comissão passará de ${categoryPreview.commission.from.rate}% para ${categoryPreview.commission.to.rate}%. Pedidos já realizados não mudam.`
                        : 'Comissão: a regra de comissão das vendas FUTURAS deste produto pode mudar com a nova categoria. Pedidos já realizados não mudam.']
                    : []),
                  ...(categoryPreview && !categoryPreview.variants.compatible
                    ? ['Variações: as variações atuais não cabem nos eixos da nova categoria. Ajuste-as na etapa 3 antes de salvar (estoque e SKU são preservados).']
                    : []),
                ]}
              />
            )}
            <ProductAttributeFields
              fields={formFields}
              values={attrValues}
              errors={attrErrors}
              onChange={handleAttrChange}
              isLoading={isLoadingDbAttributes}
              loadError={attrLoadError}
              onRetry={retryAttributes}
              inactiveLabels={inactiveLabels}
              needsLeafCategory={Boolean(category) && !isLeafCategory(category, activeCategories)}
              droppedLabels={isEditing && categoryChanged ? [] : droppedLabels}
            />
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
            {/* FASE D16-B1 — Tipo do produto. Nunca é um campo salvo (ver
                deriveProductMode) — só decide qual UI mostrar aqui e na
                Etapa 4. Trocar de "com variações" para "simples" nunca
                apaga o que já foi montado: só some da tela; volta a
                aparecer se o vendedor mudar de ideia antes de publicar. */}
            <div>
              <h3 className="font-bold text-gray-900 text-sm mb-2">Este produto possui variações?</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setProductMode('simple')}
                  className={`text-left p-4 rounded-2xl border-2 transition ${
                    productMode === 'simple'
                      ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-200'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <p className="font-black text-gray-900 text-sm flex items-center gap-2">
                    <Package className="w-4 h-4 text-emerald-700" /> Produto simples
                  </p>
                  <p className="text-[11px] text-gray-600 mt-1">Um único preço e estoque.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setProductMode('variable')}
                  className={`text-left p-4 rounded-2xl border-2 transition ${
                    productMode === 'variable'
                      ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-200'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <p className="font-black text-gray-900 text-sm flex items-center gap-2">
                    <Palette className="w-4 h-4 text-purple-600" /> Produto com variações
                  </p>
                  <p className="text-[11px] text-gray-600 mt-1">Cores, tamanhos, capacidades, voltagens, preços e estoques diferentes.</p>
                </button>
              </div>
              {productMode === 'simple' && (!isEditing || hadRealVariantsOnLoadRef.current) && requiredAxesBlockingSimple(axes).length > 0 && (
                <p role="note" data-testid="simple-mode-axes-note" className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] font-medium text-amber-900">
                  {simpleModeAxesMessage(requiredAxesBlockingSimple(axes))}
                </p>
              )}
            </div>

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

            {/* 2. SEÇÃO DE CORES E TAMANHOS — só em modo "com variações". */}
            {productMode === 'variable' && (
            <div className="space-y-6 pt-4 border-t border-gray-200">
              {/* Input oculto compartilhado do upload de imagem por card de
                  cor — reaproveita uploadService.uploadProduct. */}
              <input
                ref={colorImageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleColorImageFileSelected}
              />
              <VariantAxesPanel
                axes={axes}
                selectedColors={colors.map((c) => c.name)}
                selectedSeconds={sizes}
                onToggleColor={handleToggleColorOption}
                onToggleSecond={handleToggleSecondOption}
                extraValues={extraAxisValues}
                onExtraChange={(code, value) => setExtraAxisValues((prev) => ({ ...prev, [code]: value }))}
                problems={variantProblems}
              />
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
                      2. {secondHeading} ({sizes.length})
                    </h3>
                    <p className="text-[11px] text-gray-500">
                      {secondName
                        ? `Adicione cada opção de ${secondName} oferecida. O comprador escolhe uma delas; cada combinação é uma variação com preço e estoque próprios.`
                        : 'Defina os tamanhos (P, M, G / 38, 40, 42 / 128GB, 256GB).'}
                    </p>
                  </div>

                  {/* Size Presets — só para tamanho/capacidade (nunca para Voltagem ou outro eixo) */}
                  {!secondJson && (
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
                  )}
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
                    placeholder={secondJson ? `Adicionar ${secondName} (ex: 110V)` : 'Adicionar tamanho avulso (ex: 42 ou XXL)'}
                    className="p-2 border border-gray-300 rounded-xl text-xs flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddSize()}
                    className="px-3 py-2 bg-gray-800 hover:bg-gray-900 text-white font-bold rounded-xl text-xs flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> {secondName ? `Adicionar ${secondName}` : 'Adicionar Tamanho'}
                  </button>
                </div>
              </div>

              {/* 3. VARIAÇÕES DO PRODUTO — cards por cor (FASE D16-B1).
                  Substitui a antiga tabela horizontal; variantsMatrix
                  continua sendo o MESMO array plano de sempre (nunca
                  reordenado/mutado aqui) — groupVariantsByColor só projeta
                  para renderização, e os handlers de edição (handleUpdateVariant*)
                  continuam recebendo o índice ORIGINAL em variantsMatrix. */}
              <div className="space-y-4 pt-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="font-black text-gray-900 text-sm flex items-center gap-2">
                      <Boxes className="w-4 h-4 text-emerald-700" />
                      3. Variações do Produto
                    </h3>
                    <p className="text-[11px] text-gray-600">
                      Configure preço, preço riscado, estoque e SKU de cada variação — organizadas por cor.
                    </p>
                  </div>
                  {variantsMatrix.length > 0 && (
                    <button
                      type="button"
                      onClick={handleGenerateAutoSkus}
                      className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0"
                      title="Gera códigos SKU organizados para envio e separação logística"
                    >
                      🏷️ Gerar SKUs de Separação
                    </button>
                  )}
                </div>

                {variantsMatrix.length === 0 ? (
                  <div className="p-4 bg-gray-50 border border-dashed border-gray-300 rounded-xl text-center text-gray-500 text-xs">
                    Adicione ao menos uma cor ou {secondName ? secondName.toLowerCase() : 'tamanho'} acima para começar a configurar as variações.
                  </div>
                ) : (
                  <>
                    {/* Resumo — somente leitura, nunca uma segunda fonte de verdade. */}
                    {(() => {
                      const summary = computeVariantsSummary(variantsMatrix);
                      return (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-950 font-bold text-xs">
                          {summary.colorsCount > 0 && <span>{summary.colorsCount} cor(es)</span>}
                          {summary.colorsCount > 0 && <span className="text-emerald-400">•</span>}
                          <span>{summary.count} variação(ões)</span>
                          <span className="text-emerald-400">•</span>
                          <span>{summary.totalStock} un. em estoque</span>
                          {summary.minPrice !== null && (
                            <>
                              <span className="text-emerald-400">•</span>
                              <span>
                                Preço:{' '}
                                {summary.minPrice === summary.maxPrice
                                  ? `${currency} ${summary.minPrice.toLocaleString('pt-BR')}`
                                  : `${currency} ${summary.minPrice.toLocaleString('pt-BR')} – ${summary.maxPrice!.toLocaleString('pt-BR')}`}
                              </span>
                            </>
                          )}
                        </div>
                      );
                    })()}

                    {/* Cards por cor (2 colunas em telas largas, sempre 1 no mobile). */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {groupVariantsByColor(variantsMatrix).map((group) => {
                        const colorIndex = group.color ? colors.findIndex((c) => c.name === group.color) : -1;
                        const groupHasSizes = group.entries.some((e) => !!e.variant.size);
                        return (
                          <div
                            key={group.color ?? '__sem_cor__'}
                            className="p-4 bg-white border border-gray-200 rounded-2xl space-y-3 shadow-2xs"
                          >
                            {/* Header do card: imagem da cor + nome + ações de imagem */}
                            <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
                              {group.image ? (
                                <img
                                  src={group.image}
                                  alt={group.color || 'Variação'}
                                  className="w-14 h-14 rounded-xl object-cover border border-gray-200 shrink-0"
                                />
                              ) : (
                                <div className="w-14 h-14 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400 shrink-0">
                                  <ImageIcon className="w-5 h-5" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="font-black text-gray-900 text-sm truncate">{group.color || 'Padrão'}</p>
                                <p className="text-[11px] text-gray-500">{group.entries.length} variação(ões)</p>
                                {colorIndex >= 0 && (
                                  <div className="flex items-center gap-2 mt-1">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenColorImagePicker(colorIndex)}
                                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 cursor-pointer"
                                    >
                                      {group.image ? 'Alterar imagem' : 'Adicionar imagem'}
                                    </button>
                                    {group.image && (
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveColorImage(colorIndex)}
                                        className="text-[11px] font-bold text-gray-400 hover:text-red-600 cursor-pointer"
                                      >
                                        Remover imagem
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Pills informativas dos tamanhos existentes nesta cor */}
                            {groupHasSizes && (
                              <div className="flex flex-wrap gap-1.5">
                                {group.entries
                                  .filter((e) => e.variant.size)
                                  .map((e) => (
                                    <span
                                      key={e.index}
                                      className="px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-900 rounded-lg text-[11px] font-bold"
                                    >
                                      {e.variant.size}
                                    </span>
                                  ))}
                              </div>
                            )}

                            {/* Uma sub-seção por combinação concreta (= 1 product_variant real) */}
                            <div className="space-y-2">
                              {group.entries.map(({ variant: item, index: idx }) => {
                                const errors = validateVariantEntry(item);
                                return (
                                  <div key={item.id || idx} className="p-3 bg-gray-50 rounded-xl space-y-2">
                                    {item.size && <p className="font-bold text-gray-800 text-xs">{item.size}</p>}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                      <div>
                                        <label className="block text-[10px] font-bold text-gray-500 mb-0.5">Preço *</label>
                                        <input
                                          type="number"
                                          min="0"
                                          step="any"
                                          value={item.price !== undefined ? item.price : ''}
                                          onChange={(e) =>
                                            handleUpdateVariantPrice(idx, e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)
                                          }
                                          className={`w-full p-1.5 border rounded-lg font-bold text-xs bg-white focus:ring-2 focus:ring-emerald-500 ${
                                            errors.price ? 'border-red-400' : 'border-gray-300'
                                          }`}
                                        />
                                        {errors.price && <p className="text-[10px] text-red-600 mt-0.5">{errors.price}</p>}
                                      </div>
                                      <div>
                                        <label className="block text-[10px] font-bold text-gray-500 mb-0.5">Riscado</label>
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
                                          className={`w-full p-1.5 border rounded-lg text-xs bg-white ${
                                            errors.originalPrice ? 'border-red-400' : 'border-gray-300'
                                          }`}
                                        />
                                        {errors.originalPrice && <p className="text-[10px] text-red-600 mt-0.5">{errors.originalPrice}</p>}
                                      </div>
                                      <div>
                                        <label className="block text-[10px] font-bold text-gray-500 mb-0.5">Estoque</label>
                                        <input
                                          type="number"
                                          min="0"
                                          value={item.stock}
                                          disabled={isEditing && existingVariantKeys.has(buildVariantKey(buildAxisPayload([item], { secondColumn, secondJson, extraAxes: axisUi.extraAxes, extraValues: extraAxisValues })[0] as any) ?? '')}
                                          title={isEditing && existingVariantKeys.size > 0 ? 'O estoque de uma variação já cadastrada se ajusta em Estoque & Armazéns.' : undefined}
                                          onChange={(e) => handleUpdateVariantStock(idx, parseInt(e.target.value) || 0)}
                                          className={`w-full p-1.5 border rounded-lg font-bold text-xs text-center bg-white ${
                                            errors.stock ? 'border-red-400' : 'border-gray-300'
                                          }`}
                                        />
                                        {errors.stock && <p className="text-[10px] text-red-600 mt-0.5">{errors.stock}</p>}
                                      </div>
                                      <div>
                                        <label className="block text-[10px] font-bold text-gray-500 mb-0.5">SKU</label>
                                        <input
                                          type="text"
                                          placeholder="Opcional"
                                          value={item.sku || ''}
                                          onChange={(e) => handleUpdateVariantSku(idx, e.target.value)}
                                          className="w-full p-1.5 border border-gray-300 rounded-lg font-mono text-[11px] bg-white"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
            )}
          </div>
        )}

        {/* STEP 4: Price, Weight & Dimensions (Logistics) */}
        {wizardStep === 4 && (
          <div className="space-y-6 text-xs font-medium">
            {/* Moeda — sempre visível, simples ou variável. */}
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

              {/* FASE D16-B1 — Preço/Riscado/Estoque só fazem sentido como
                  inputs manuais em modo simples. Em modo variável eles já
                  vêm das variantes (ver deriveProductLevelPricing) — pedir
                  de novo aqui seria a redundância que a auditoria D16-A2.5
                  apontou (duas fontes de verdade aparentes). */}
              {productMode === 'simple' && (
                <>
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
                </>
              )}
            </div>

            {/* Resumo somente-leitura para produto variável — nunca editável
                aqui; a fonte real são as variações configuradas na Etapa 3. */}
            {productMode === 'variable' && (() => {
              const summary = computeVariantsSummary(variantsMatrix);
              return (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                  <p className="font-black text-gray-900 text-sm mb-2">Resumo das variações</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <p className="text-gray-500 font-bold">Preço</p>
                      <p className="font-black text-gray-900 text-sm">
                        {summary.minPrice === null
                          ? '—'
                          : summary.minPrice === summary.maxPrice
                            ? `${currency} ${summary.minPrice.toLocaleString('pt-BR')}`
                            : `Faixa: ${currency} ${summary.minPrice.toLocaleString('pt-BR')} – ${summary.maxPrice!.toLocaleString('pt-BR')}`}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500 font-bold">Estoque total</p>
                      <p className="font-black text-gray-900 text-sm">{summary.totalStock} unidades</p>
                    </div>
                    <div>
                      <p className="text-gray-500 font-bold">Variações</p>
                      <p className="font-black text-gray-900 text-sm">{summary.count}</p>
                    </div>
                  </div>
                  {summary.minPrice === null && (
                    <p className="text-[11px] text-amber-700 font-bold mt-2">
                      ⚠️ Nenhuma variação tem preço válido ainda — volte à Etapa 3 antes de publicar.
                    </p>
                  )}
                </div>
              );
            })()}

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
