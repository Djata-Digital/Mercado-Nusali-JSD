import { getDb } from '../../../db/index.js';
import { products, categories, brands, productVariants, productImages, productAttributes, reviews, sellers, stores, inventory, orderItems, orders } from '../../../db/schema.js';
import { getCache, setCache, delCache } from '../../../db/redis.js';
import { eq, and, ilike, or, gte, lte, desc, asc, sql, inArray, notInArray } from 'drizzle-orm';
import { logger } from '../../infra/logger.js';
import { isProductAvailableForCountry, eligibilityReason } from './productEligibilityService.js';

/**
 * Correção crítica (fluxo pós-pagamento — estoque/"vendidos" nunca
 * atualizavam): products.stock é um resumo físico (soma de
 * inventory.quantityOnHand), sincronizado só no despacho físico
 * (InventoryService.syncProductStockSummary, chamado em shipmentService.ts) —
 * isso está correto/intencional (estoque só "sai" de verdade quando o pacote
 * realmente deixa o armazém). O bug real é que NENHUM lugar calculava
 * "disponível para compra" (o que reservas de pedidos pendentes/pagos já
 * consomem, mesmo antes do despacho) nem "quantos já foram vendidos" — o
 * catálogo sempre mostrava o estoque físico bruto e um contador de vendas
 * que nunca existiu (sempre 0 no frontend). Calculado em tempo de LEITURA,
 * nunca grava nada — sem risco de dupla redução, sem migration.
 */
const SOLD_ORDER_STATUSES_EXCLUDED = ['cancelled', 'refunded'];

async function computeLiveStockAndSales(productIds: string[], executor?: any): Promise<Map<string, { availableStock: number | null; salesCount: number }>> {
  // availableStock = null quando o produto não tem NENHUMA linha em
  // `inventory` (nunca deveria acontecer para produtos criados via
  // ProductCreationService, que sempre cria uma — só protege dados legados
  // fora desse caminho): o chamador deve then usar products.stock como
  // estava antes, nunca fingir "0 disponível" para um produto que na
  // verdade nunca teve controle de reserva.
  const result = new Map<string, { availableStock: number | null; salesCount: number }>();
  if (productIds.length === 0) return result;

  const db = executor ?? getDb();
  if (!db) return result;

  const [invRows, salesRows] = await Promise.all([
    db
      .select({
        productId: inventory.productId,
        onHand: sql<string>`COALESCE(SUM(${inventory.quantityOnHand}), 0)`,
        reserved: sql<string>`COALESCE(SUM(${inventory.quantityReserved}), 0)`,
      })
      .from(inventory)
      .where(inArray(inventory.productId, productIds))
      .groupBy(inventory.productId),
    // "Vendidos" = soma de order_items.quantity de pedidos realmente PAGOS,
    // excluindo cancelados/reembolsados (nunca conta pending_payment,
    // abandonado, ou pagamento falhado — esses nunca chegam a paymentStatus='paid').
    db
      .select({
        productId: orderItems.productId,
        sold: sql<string>`COALESCE(SUM(${orderItems.quantity}), 0)`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(and(
        inArray(orderItems.productId, productIds),
        eq(orders.paymentStatus, 'paid'),
        notInArray(orders.status, SOLD_ORDER_STATUSES_EXCLUDED)
      ))
      .groupBy(orderItems.productId),
  ]);

  const invMap = new Map<string, { onHand: number; reserved: number }>();
  for (const row of invRows) {
    invMap.set(row.productId, { onHand: Number(row.onHand), reserved: Number(row.reserved) });
  }
  const salesMap = new Map<string, number>();
  for (const row of salesRows) {
    salesMap.set(row.productId, Number(row.sold));
  }

  for (const id of productIds) {
    const inv = invMap.get(id);
    const availableStock = inv ? Math.max(0, inv.onHand - inv.reserved) : null;
    result.set(id, { availableStock, salesCount: salesMap.get(id) || 0 });
  }
  return result;
}

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
  // `executor` opcional: permite testar esta função contra um Postgres
  // Docker isolado (mesmo padrão já usado em orderService/payoutService),
  // sem depender do pool singleton getDb() (SSL fixo, incompatível com
  // Docker) nem do cache Redis (que mascararia mudanças recém-gravadas).
  static async getProducts(filters: ProductQueryFilters, executor?: any) {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 24));
    const offset = (page - 1) * limit;

    const cacheKey = `catalog:products:${JSON.stringify({ ...filters, page, limit })}`;
    if (!executor) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const db = executor ?? getDb();
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

    // Melhoria pré-piloto (elegibilidade por país): "country" agora é o
    // DESTINO do comprador, não mais uma igualdade ingênua com o país de
    // origem — passa a respeitar venda nacional (só o próprio país) vs.
    // internacional (só os países que o vendedor autorizou explicitamente).
    // Produtos legados (sem publishingScope definido) são 'national' por
    // default no schema, então o comportamento para eles não muda em nada.
    if (filters.country && filters.country !== 'ALL') {
      const dest = filters.country.toUpperCase();
      conditions.push(sql`(
        (${products.publishingScope} = 'national' AND ${products.countryCode} = ${dest})
        OR
        (${products.publishingScope} = 'international' AND ${products.targetCountriesJson} @> ${JSON.stringify([dest])}::jsonb)
      )`);
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

    // Correção crítica (fluxo pós-pagamento): estoque disponível (descontando
    // reservas ativas) e "vendidos" reais, calculados em lote para esta
    // página de resultados — nunca grava nada, nunca duplica cálculo.
    const liveStockMap = await computeLiveStockAndSales(items.map((p) => p.id), executor);

    const result = {
      products: items.map((p) => {
        const live = liveStockMap.get(p.id);
        return {
          ...p,
          price: Number(p.price),
          originalPrice: p.originalPrice ? Number(p.originalPrice) : undefined,
          rating: Number(p.rating || 5.0),
          stock: live?.availableStock ?? Number(p.stock),
          salesCount: live?.salesCount ?? 0,
        };
      }),
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    };

    if (!executor) {
      // Cache catalog result for 60 seconds
      await setCache(cacheKey, result, 60);
    }

    return result;
  }

  static async getProductById(id: string, destinationCountry?: string, executor?: any) {
    const cacheKey = `product:${id}`;
    const cached = executor ? null : await getCache<any>(cacheKey);
    if (cached) {
      // Elegibilidade é calculada por requisição (depende do destinationCountry
      // do chamador), nunca cacheada junto com o produto em si. Correção
      // crítica (fluxo pós-pagamento): estoque disponível e "vendidos"
      // também NUNCA podem vir do cache — um pagamento confirmado precisa
      // refletir imediatamente na página do produto, não só depois do TTL
      // do cache expirar.
      const liveCached = await computeLiveStockAndSales([id], executor);
      const liveC = liveCached.get(id);
      const withLiveStock = {
        ...cached,
        stock: liveC?.availableStock ?? Number(cached.stock),
        salesCount: liveC?.salesCount ?? 0,
      };
      return this.attachEligibility(withLiveStock, destinationCountry);
    }

    const db = executor ?? getDb();
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

    if (!executor) {
      await setCache(cacheKey, fullProduct, 120);
    }

    // Correção crítica (fluxo pós-pagamento): mesmo no caminho "sem cache",
    // o estoque/vendidos vêm da mesma computação em tempo de leitura (nunca
    // do valor bruto cacheado em fullProduct.stock).
    const liveFresh = await computeLiveStockAndSales([id], executor);
    const liveF = liveFresh.get(id);
    const productWithLiveStock = {
      ...fullProduct,
      stock: liveF?.availableStock ?? fullProduct.stock,
      salesCount: liveF?.salesCount ?? 0,
    };
    return this.attachEligibility(productWithLiveStock, destinationCountry);
  }

  /**
   * Anexa a elegibilidade geográfica ao produto SEM nunca ocultá-lo — a
   * página de produto pode continuar mostrando informações, só os botões de
   * compra é que devem ficar indisponíveis quando availableForCountry=false.
   * Sem destinationCountry (chamador não informou), não afirma nada — deixa
   * availableForCountry undefined (o chamador decide o que fazer).
   */
  static attachEligibility(product: any, destinationCountry?: string) {
    if (!destinationCountry) return product;
    const available = isProductAvailableForCountry(product, destinationCountry);
    return {
      ...product,
      availableForCountry: available,
      unavailabilityReason: available ? undefined : eligibilityReason(product, destinationCountry),
    };
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
