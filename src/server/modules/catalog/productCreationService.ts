import { getDb } from '../../../db/index.js';
import {
  products,
  categories,
  categoryAttributes,
  productAttributes,
  productImages,
  sellers,
  stores,
  countries,
  inventory,
  inventoryMovements,
} from '../../../db/schema.js';
import { eq, inArray, asc, or } from 'drizzle-orm';
import { delCache } from '../../../db/redis.js';

export interface CreateProductInput {
  title: string;
  price: number | string;
  currency?: string;
  description?: string;
  categoryId: string;
  brand?: string | null;
  model?: string | null;
  stock?: number;
  weightKg?: number | string;
  dimensionsCm?: { length?: number | string; width?: number | string; height?: number | string };
  image: string;
  storeId: string;
  countryCode?: string;
  freeShipping?: boolean;
  full?: boolean;
  specs?: Record<string, any>;
  attributesJson?: Record<string, any>;
  // Melhoria pré-piloto (elegibilidade por país): o wizard já coletava isso,
  // mas nada era persistido. 'national' (default) = só o país da loja.
  // 'international' = só os países explicitamente listados em targetCountries.
  publishingScope?: 'national' | 'international';
  targetCountries?: string[];
}

/**
 * Returns effective attributes for a category by calculating ancestor hierarchy inheritance.
 */
export async function getCategoryAttributesWithInheritance(db: any, targetCategoryId: string): Promise<any[]> {
  if (!db || !targetCategoryId) return [];

  // 1. Fetch all active categories to build hierarchy chain
  const allCats = await db.select().from(categories).where(eq(categories.isActive, true));
  const catMap = new Map(allCats.map((c: any) => [c.id, c]));
  const catSlugMap = new Map(allCats.map((c: any) => [c.slug, c]));

  const targetCat: any = catMap.get(targetCategoryId) || catSlugMap.get(targetCategoryId);
  if (!targetCat) return [];

  // 2. Build chain from Root down to Target Category
  const chain: any[] = [];
  let current: any = targetCat;
  const visited = new Set<string>();

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.unshift(current);
    if (current.parentId && catMap.has(current.parentId)) {
      current = catMap.get(current.parentId);
    } else {
      break;
    }
  }

  const categoryIds = chain.map((c) => c.id);
  if (categoryIds.length === 0) return [];

  // 3. Fetch attributes for all categories in the chain
  const attrRows = await db
    .select()
    .from(categoryAttributes)
    .where(inArray(categoryAttributes.categoryId, categoryIds))
    .orderBy(asc(categoryAttributes.sortOrder), asc(categoryAttributes.name));

  // 4. Merge down (specific category attribute overrides parent with same code)
  const attributesMap = new Map<string, any>();
  chain.forEach((cat: any) => {
    const catAttrs = attrRows.filter((a: any) => a.categoryId === cat.id && a.isActive !== false);
    catAttrs.forEach((attr: any) => {
      attributesMap.set(attr.code, {
        ...attr,
        inheritedFrom: cat.id !== targetCat.id ? cat.name : undefined,
      });
    });
  });

  return Array.from(attributesMap.values()).sort((a, b) => {
    if (a.isRequired !== b.isRequired) return a.isRequired ? -1 : 1;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Single, consolidated product creation service.
 */
export class ProductCreationService {
  // `executor` opcional: permite testar esta função contra um Postgres
  // Docker isolado (mesmo padrão já usado em payoutService/refundService),
  // sem depender do pool singleton getDb() (SSL fixo, incompatível com
  // Docker). Em produção, executor é sempre undefined e o comportamento é
  // idêntico ao anterior.
  static async createProduct(userId: string, input: CreateProductInput, executor?: any) {
    const db = executor ?? getDb();
    if (!db) {
      throw new Error('Banco de dados indisponível.');
    }

    // 1. Resolve seller from authenticated userId
    const [seller] = await db.select().from(sellers).where(eq(sellers.userId, userId)).limit(1);
    if (!seller) {
      throw new Error('Vendedor não encontrado ou cadastro de vendedor incompleto.');
    }

    if (seller.status !== 'active') {
      throw new Error('🔒 Sua conta de vendedor precisa estar ativa para cadastrar produtos.');
    }

    // 1b. Resolve and validate the store — the store is the sole authority over the
    // product's operational country/origin. This also fixes the historical bug where
    // products were created with store_id = NULL (never linked to any store).
    if (!input.storeId || !String(input.storeId).trim()) {
      throw new Error('PRODUCT_STORE_REQUIRED: A loja (storeId) é obrigatória para cadastrar o produto.');
    }
    const [store] = await db.select().from(stores).where(eq(stores.id, String(input.storeId).trim())).limit(1);
    if (!store) {
      throw new Error('PRODUCT_STORE_NOT_FOUND: Loja informada não encontrada.');
    }
    if (store.sellerId !== seller.id) {
      throw new Error('PRODUCT_STORE_FORBIDDEN: Esta loja não pertence ao vendedor autenticado.');
    }
    if (store.status !== 'active') {
      throw new Error('PRODUCT_STORE_INACTIVE: A loja precisa estar ativa para cadastrar produtos.');
    }
    if (!store.countryCode || !String(store.countryCode).trim()) {
      throw new Error('PRODUCT_STORE_COUNTRY_MISSING: A loja não possui país operacional definido.');
    }
    const storeCountryCode = String(store.countryCode).trim().toUpperCase();
    const [storeCountry] = await db.select().from(countries).where(eq(countries.code, storeCountryCode)).limit(1);
    if (!storeCountry) {
      throw new Error(`PRODUCT_STORE_COUNTRY_INVALID: O país da loja ("${storeCountryCode}") não está cadastrado como país operacional do Mercado Nusali.`);
    }

    // The store is authoritative: product.countryCode/currency are always derived from it.
    // If the caller sends an explicit countryCode/currency that diverges, reject instead of
    // silently overriding — a mismatch means the client is out of sync with the real store.
    if (input.countryCode && String(input.countryCode).trim().toUpperCase() !== storeCountryCode) {
      throw new Error(`PRODUCT_COUNTRY_MISMATCH: O país informado ("${input.countryCode}") diverge do país da loja ("${storeCountryCode}"). A loja é a autoridade sobre o país de origem do produto.`);
    }
    if (input.currency && String(input.currency).trim().toUpperCase() !== storeCountry.currency) {
      throw new Error(`PRODUCT_CURRENCY_MISMATCH: A moeda informada ("${input.currency}") diverge da moeda oficial do país da loja ("${storeCountry.currency}").`);
    }

    // 2. Validate input fields
    if (!input.title || !input.title.trim()) {
      throw new Error('O título do produto é obrigatório.');
    }

    const priceNum = typeof input.price === 'number' ? input.price : parseFloat(input.price);
    if (isNaN(priceNum) || priceNum <= 0) {
      throw new Error('O preço do produto deve ser um número maior que zero.');
    }

    if (!input.image || typeof input.image !== 'string' || !input.image.trim()) {
      throw new Error('Uma imagem real de capa para o produto é obrigatória.');
    }

    const categorySearch = input.categoryId || (input as any).categorySlug || (input as any).category;
    if (!categorySearch || typeof categorySearch !== 'string') {
      throw new Error('A categoria do produto é obrigatória.');
    }

    // 3. Resolve target category in DB
    const [foundCat] = await db
      .select()
      .from(categories)
      .where(or(eq(categories.id, categorySearch), eq(categories.slug, categorySearch)))
      .limit(1);

    if (!foundCat) {
      throw new Error(`Categoria "${categorySearch}" não encontrada no banco de dados.`);
    }

    // 4. Fetch category attributes with inheritance & validate mandatory attributes
    const effectiveAttributes = await getCategoryAttributesWithInheritance(db, foundCat.id);
    const specsMap = input.specs || input.attributesJson || {};

    for (const attr of effectiveAttributes) {
      if (attr.isRequired && attr.isActive !== false) {
        const val = specsMap[attr.name] ?? specsMap[attr.code];
        if (!val || !String(val).trim()) {
          throw new Error(`O atributo "${attr.name}" é de preenchimento obrigatório para a categoria "${foundCat.name}".`);
        }
      }

      // Validate select / multiselect options if options defined
      if (attr.optionsJson && Array.isArray(attr.optionsJson) && attr.optionsJson.length > 0) {
        const val = specsMap[attr.name] ?? specsMap[attr.code];
        if (val && String(val).trim()) {
          const selectedVals = String(val).split(',').map((s) => s.trim());
          const invalid = selectedVals.filter((v) => !attr.optionsJson.includes(v));
          if (invalid.length > 0) {
            throw new Error(`Valor inválido "${invalid.join(', ')}" para o atributo "${attr.name}". Opções permitidas: ${attr.optionsJson.join(', ')}.`);
          }
        }
      }

      // Validate number type
      if (attr.type === 'number') {
        const val = specsMap[attr.name] ?? specsMap[attr.code];
        if (val && String(val).trim() && isNaN(Number(val))) {
          throw new Error(`O atributo "${attr.name}" deve conter apenas números válidos.`);
        }
      }
    }

    // 5. Build clean, non-fictional product entity
    // countryCode/currency are NOT taken from client input — they are derived from the
    // store resolved and validated in step 1b, which is the sole authority over origin.
    const productId = `prod_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const cleanBrand = input.brand?.trim() || null;
    const cleanCountry = storeCountryCode;
    const cleanCurrency = storeCountry.currency;

    const stockVal = input.stock;
    if (stockVal === undefined || stockVal === null || String(stockVal).trim() === '' || isNaN(Number(stockVal)) || Number(stockVal) < 0) {
      throw new Error('A quantidade de estoque deve ser um número inteiro maior ou igual a 0.');
    }
    const cleanStock = Math.floor(Number(stockVal));

    // BLOCKER_LAUNCH (fase "Desbloqueio do lançamento"): orderService exige
    // itemWeightKg > 0 para calcular frete no checkout, e lê esse valor de
    // products.shippingJson.weightKg — mas nenhuma rota jamais persistia
    // esse campo, então todo produto ficava impossível de comprar. Peso é
    // obrigatório na criação (arquitetura mais simples e segura: rejeitar
    // na origem, nunca inventar um fallback fictício de peso).
    const weightNum = typeof input.weightKg === 'number' ? input.weightKg : parseFloat(String(input.weightKg ?? ''));
    if (isNaN(weightNum) || weightNum <= 0) {
      throw new Error('PRODUCT_WEIGHT_REQUIRED: O peso do produto (em kg) é obrigatório e deve ser maior que zero — é necessário para o cálculo de frete.');
    }

    // Fase "Comissão percentual + logística real": dimensões reais, mesma
    // exigência do peso — nenhuma tela pode inventar "20×15×10 cm" quando o
    // vendedor não informou. Obrigatório > 0 nos três eixos.
    const toDim = (v: unknown) => (typeof v === 'number' ? v : parseFloat(String(v ?? '')));
    const lengthNum = toDim(input.dimensionsCm?.length);
    const widthNum = toDim(input.dimensionsCm?.width);
    const heightNum = toDim(input.dimensionsCm?.height);
    if ([lengthNum, widthNum, heightNum].some((n) => isNaN(n) || n <= 0)) {
      throw new Error('PRODUCT_DIMENSIONS_REQUIRED: As dimensões do produto (comprimento, largura e altura, em cm) são obrigatórias e devem ser maiores que zero — são necessárias para o cálculo de frete.');
    }

    // Elegibilidade geográfica (venda nacional vs. internacional). NACIONAL é
    // o default seguro — nenhum país é assumido além do próprio da loja.
    // INTERNACIONAL exige uma lista explícita e real de países operacionais
    // (nunca "todos os países" implícito, nunca código inventado).
    const publishingScope: 'national' | 'international' = input.publishingScope === 'international' ? 'international' : 'national';
    let targetCountriesJson: string[] | null = null;
    if (publishingScope === 'international') {
      const requested = Array.isArray(input.targetCountries)
        ? Array.from(new Set(input.targetCountries.map((c) => String(c).trim().toUpperCase()).filter(Boolean)))
        : [];
      if (requested.length === 0) {
        throw new Error('PRODUCT_TARGET_COUNTRIES_REQUIRED: Venda internacional exige ao menos um país de destino explicitamente selecionado.');
      }
      const realCountries = await db.select().from(countries).where(inArray(countries.code, requested));
      const realActiveCodes = new Set(realCountries.filter((c: any) => c.isActive).map((c: any) => c.code));
      const invalid = requested.filter((code) => !realActiveCodes.has(code));
      if (invalid.length > 0) {
        throw new Error(`PRODUCT_TARGET_COUNTRY_INVALID: País(es) de destino inválido(s) ou não operacional(is): ${invalid.join(', ')}.`);
      }
      targetCountriesJson = requested;
    }

    const newProduct = {
      id: productId,
      title: input.title.trim(),
      price: String(priceNum),
      currency: cleanCurrency,
      description: input.description?.trim() || '',
      categoryId: foundCat.id,
      brand: cleanBrand,
      sellerId: seller.id, // REAL seller.id from sellers table
      storeId: store.id, // REAL store.id — fixes historical bug where store_id was never persisted
      stock: cleanStock,
      image: input.image.trim(),
      countryCode: cleanCountry,
      freeShipping: Boolean(input.freeShipping),
      full: Boolean(input.full),
      rating: '0.00', // REAL new product rating
      reviewsCount: 0, // REAL new product reviews count
      status: 'active',
      isActive: true,
      attributesJson: specsMap,
      shippingJson: { weightKg: weightNum, lengthCm: lengthNum, widthCm: widthNum, heightCm: heightNum },
      publishingScope,
      targetCountriesJson,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // 6. DB Transaction (Product + product_attributes + product_images)
    await db.transaction(async (tx) => {
      // Insert product
      await tx.insert(products).values(newProduct as any);

      // Insert product_attributes
      const attrEntries = Object.entries(specsMap);
      if (attrEntries.length > 0) {
        const attrInserts = attrEntries
          .filter(([_, val]) => val !== undefined && val !== null && String(val).trim() !== '')
          .map(([key, val], idx) => ({
            id: `pattr_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 5)}`,
            productId,
            name: key,
            value: String(val),
            createdAt: new Date(),
          }));

        if (attrInserts.length > 0) {
          await tx.insert(productAttributes).values(attrInserts);
        }
      }

      // Insert product_images
      const rawGalleryInput = Array.isArray((input as any).galleryImages) && (input as any).galleryImages.length > 0
        ? (input as any).galleryImages
        : Array.isArray((input as any).images) && (input as any).images.length > 0
          ? (input as any).images
          : Array.isArray((input as any).gallery) && (input as any).gallery.length > 0
            ? (input as any).gallery
            : [];

      const rawGallery: string[] = [input.image, ...rawGalleryInput].filter(Boolean);

      const validUrls = Array.from(new Set(rawGallery.filter((url) => typeof url === 'string' && url.trim() !== '')));
      if (validUrls.length > 0) {
        const imageInserts = validUrls.map((url, idx) => ({
          id: `pimg_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 5)}`,
          productId,
          imageUrl: url.trim(),
          displayOrder: idx,
          isCover: idx === 0,
          createdAt: new Date(),
        }));

        await tx.insert(productImages).values(imageInserts);
      }

      // Insert initial SELLER_LOCATION inventory row (inventory.sellerId references sellers.id)
      const initialInvId = `inv_seller_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await tx.insert(inventory).values({
        id: initialInvId,
        locationType: 'SELLER_LOCATION',
        sellerId: seller.id,
        warehouseId: null,
        productId,
        variantId: null,
        quantityOnHand: cleanStock,
        quantityReserved: 0,
        minimumStockLevel: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await tx.insert(inventoryMovements).values({
        id: `mov_${Date.now()}_init_${Math.random().toString(36).substring(2, 5)}`,
        inventoryId: initialInvId,
        warehouseId: null,
        productId,
        variantId: null,
        type: 'IN',
        quantity: cleanStock,
        reason: 'Estoque inicial do produto cadastrado',
        performedBy: seller.userId || null,
        createdAt: new Date(),
      });
    });

    // 7. Invalidate caches
    await delCache('catalog:categories');
    await delCache('products_list_all');

    return {
      id: productId,
      ...newProduct,
    };
  }
}
