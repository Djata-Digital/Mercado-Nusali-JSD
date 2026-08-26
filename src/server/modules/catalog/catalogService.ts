import { getDb } from '../../../db/index.js';
import { products, categories, brands, productVariants, productImages, productAttributes, reviews, sellers, stores } from '../../../db/schema.js';
import { getCache, setCache, delCache } from '../../../db/redis.js';
import { eq, and, ilike, or, gte, lte, desc, asc, sql } from 'drizzle-orm';
import { logger } from '../../infra/logger.js';

export interface ProductQueryFilters {
  q?: string;
  category?: string;
  country?: string;
  storeId?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  freeShipping?: boolean;
  full?: boolean;
  sort?: 'price_asc' | 'price_desc' | 'rating_desc' | 'sales_desc' | 'newest';
  page?: number;
  limit?: number;
}

export class CatalogService {
  static async getProducts(filters: ProductQueryFilters) {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 24));
    const offset = (page - 1) * limit;

    const cacheKey = `catalog:products:${JSON.stringify({ ...filters, page, limit })}`;
    const cached = await getCache<any>(cacheKey);
    if (cached) {
      return cached;
    }

    const db = getDb();
    if (!db) {
      // Return empty or cached structure
      return {
        products: [],
        pagination: { total: 0, page, limit, totalPages: 0 },
      };
    }

    const conditions = [eq(products.isActive, true)];

    if (filters.q) {
      const searchTerm = `%${filters.q.trim()}%`;
      conditions.push(or(ilike(products.title, searchTerm), ilike(products.description, searchTerm), ilike(products.brand, searchTerm))!);
    }

    if (filters.category && filters.category !== 'all') {
      conditions.push(eq(products.categoryId, filters.category));
    }

    if (filters.country && filters.country !== 'ALL') {
      conditions.push(eq(products.countryCode, filters.country.toUpperCase()));
    }

    // Fase "Lojas oficiais reais": relacionamento real produto↔loja — nunca
    // heurística de texto no nome do seller.
    if (filters.storeId) {
      conditions.push(eq(products.storeId, filters.storeId));
    }

    if (filters.brand) {
      conditions.push(ilike(products.brand, filters.brand));
    }

    if (filters.minPrice !== undefined && !isNaN(filters.minPrice)) {
      conditions.push(gte(products.price, String(filters.minPrice)));
    }

    if (filters.maxPrice !== undefined && !isNaN(filters.maxPrice)) {
      conditions.push(lte(products.price, String(filters.maxPrice)));
    }

    if (filters.freeShipping !== undefined) {
      conditions.push(eq(products.freeShipping, filters.freeShipping));
    }

    if (filters.full !== undefined) {
      conditions.push(eq(products.full, filters.full));
    }

    let orderByClause: any = desc(products.createdAt);
    if (filters.sort === 'price_asc') {
      orderByClause = asc(products.price);
    } else if (filters.sort === 'price_desc') {
      orderByClause = desc(products.price);
    } else if (filters.sort === 'rating_desc') {
      orderByClause = desc(products.rating);
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

    const [items, totalResult] = await Promise.all([
      db.select().from(products).where(whereClause).orderBy(orderByClause).limit(limit).offset(offset),
      db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(products)
        .where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;
    const totalPages = Math.ceil(total / limit);

    const result = {
      products: items.map((p) => ({
        ...p,
        price: Number(p.price),
        originalPrice: p.originalPrice ? Number(p.originalPrice) : undefined,
        rating: Number(p.rating || 5.0),
        stock: Number(p.stock),
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    };

    // Cache catalog result for 60 seconds
    await setCache(cacheKey, result, 60);

    return result;
  }

  static async getProductById(id: string) {
    const cacheKey = `product:${id}`;
    const cached = await getCache<any>(cacheKey);
    if (cached) return cached;

    const db = getDb();
    if (!db) return null;

    const [productRes, variantsRes, imagesRes, reviewsRes, attrRes] = await Promise.all([
      db.select().from(products).where(eq(products.id, id)).limit(1),
      db.select().from(productVariants).where(eq(productVariants.productId, id)),
      db.select().from(productImages).where(eq(productImages.productId, id)),
      db.select().from(reviews).where(eq(reviews.productId, id)).orderBy(desc(reviews.createdAt)).limit(10),
      db.select().from(productAttributes).where(eq(productAttributes.productId, id)),
    ]);

    if (productRes.length === 0) return null;

    const p = productRes[0];
    const dbSpecsMap: Record<string, string> = {};
    attrRes.forEach((a) => {
      dbSpecsMap[a.name] = a.value;
    });

    const combinedSpecs = {
      ...dbSpecsMap,
      ...(p.attributesJson as Record<string, string>),
    };

    const imageUrlList = imagesRes.map((img) => img.imageUrl).filter(Boolean);
    const coverImageObj = imagesRes.find((img) => img.isCover);
    const mainImage = coverImageObj?.imageUrl || (imageUrlList.length > 0 ? imageUrlList[0] : p.image);

    let sellerInfo: any = null;
    if (p.sellerId) {
      const sellerRows = await db.select().from(sellers).where(eq(sellers.id, p.sellerId)).limit(1);
      if (sellerRows.length > 0) {
        const sel = sellerRows[0];
        const storeRows = await db.select().from(stores).where(eq(stores.sellerId, sel.id)).limit(1);
        const st = storeRows[0];
        sellerInfo = {
          id: sel.id,
          name: st?.name || sel.companyName || 'Vendedor',
          country: st?.countryCode || sel.countryCode || (p.currency === 'BRL' ? 'BR' : 'GW'),
          isOfficialStore: false,
          reputationLevel: st?.rating && Number(st.rating) >= 4.8 ? 'platinum' : 'silver',
        };
      }
    }

    const resolvedCountry = p.countryCode || sellerInfo?.country || (p.currency === 'BRL' ? 'BR' : '');

    const fullProduct = {
      ...p,
      image: mainImage,
      price: Number(p.price),
      currency: p.currency || (resolvedCountry === 'BR' ? 'BRL' : 'XOF'),
      countryCode: resolvedCountry,
      originCountry: resolvedCountry,
      seller: sellerInfo || (p as any).seller,
      originalPrice: p.originalPrice ? Number(p.originalPrice) : undefined,
      rating: p.rating !== null && p.rating !== undefined ? Number(p.rating) : 0,
      stock: Number(p.stock),
      specs: combinedSpecs,
      attributesJson: combinedSpecs,
      variants: variantsRes.map((v) => ({
        ...v,
        price: Number(v.price),
        stock: Number(v.stock),
      })),
      images: imageUrlList.length > 0 ? imageUrlList : (p.image ? [p.image] : []),
      galleryImages: imageUrlList.length > 0 ? imageUrlList : (p.image ? [p.image] : []),
      productImages: imagesRes,
      recentReviews: reviewsRes,
    };

    await setCache(cacheKey, fullProduct, 120);
    return fullProduct;
  }

  static async invalidateProductCache(id?: string) {
    if (id) {
      await delCache(`product:${id}`);
    }
    // Invalidate main catalog pages
    await delCache('catalog:categories');
    logger.info({ id }, 'Product cache invalidated');
  }

  static async getCategories() {
    const cached = await getCache<any>('catalog:categories');
    if (cached) return cached;

    const db = getDb();
    if (!db) return [];

    const cats = await db.select().from(categories).where(eq(categories.isActive, true)).orderBy(asc(categories.displayOrder));
    await setCache('catalog:categories', cats, 3600);
    return cats;
  }

  static async getBrands() {
    const db = getDb();
    if (!db) return [];
    return db.select().from(brands).where(eq(brands.isActive, true)).orderBy(asc(brands.name));
  }
}
