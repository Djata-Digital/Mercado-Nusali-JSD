import { getDb } from '../../../db/index.js';
import {
  products,
  categories,
  categoryAttributes,
  productAttributes,
  productImages,
  sellers,
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
  image: string;
  countryCode?: string;
  freeShipping?: boolean;
  full?: boolean;
  specs?: Record<string, any>;
  attributesJson?: Record<string, any>;
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
  static async createProduct(userId: string, input: CreateProductInput) {
    const db = getDb();
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

    if (!input.countryCode || !String(input.countryCode).trim()) {
      throw new Error('PRODUCT_COUNTRY_REQUIRED: O código do país de origem (countryCode) é obrigatório para cadastrar o produto.');
    }
    if (!input.currency || !String(input.currency).trim()) {
      throw new Error('PRODUCT_CURRENCY_REQUIRED: A moeda (currency) é obrigatória para cadastrar o produto.');
    }

    // 5. Build clean, non-fictional product entity
    const productId = `prod_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const cleanBrand = input.brand?.trim() || null;
    const cleanCountry = String(input.countryCode).trim().toUpperCase();
    const cleanCurrency = String(input.currency).trim().toUpperCase();

    const stockVal = input.stock;
    if (stockVal === undefined || stockVal === null || String(stockVal).trim() === '' || isNaN(Number(stockVal)) || Number(stockVal) < 0) {
      throw new Error('A quantidade de estoque deve ser um número inteiro maior ou igual a 0.');
    }
    const cleanStock = Math.floor(Number(stockVal));

    const newProduct = {
      id: productId,
      title: input.title.trim(),
      price: String(priceNum),
      currency: cleanCurrency,
      description: input.description?.trim() || '',
      categoryId: foundCat.id,
      brand: cleanBrand,
      sellerId: seller.id, // REAL seller.id from sellers table
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
