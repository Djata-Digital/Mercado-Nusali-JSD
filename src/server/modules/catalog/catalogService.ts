import { getDb } from '../../../db/index.js';
import { products, categories, brands, productVariants, productImages, productAttributes, reviews, reviewImages, sellers, stores, inventory, orderItems, orders, countries } from '../../../db/schema.js';
import { getCache, setCache, delCache } from '../../../db/redis.js';
import { eq, ne, and, ilike, or, gte, lte, desc, asc, sql, inArray, notInArray } from 'drizzle-orm';
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
// Exportado (single source of truth): reutilizado também por
// /seller/products (mesma definição de "vendido" que o catálogo público —
// nunca uma segunda regra divergente).
export const SOLD_ORDER_STATUSES_EXCLUDED = ['cancelled', 'refunded'];

// Exportado (single source of truth): GET /seller/products reaproveita esta
// MESMA função para distinguir quantityOnHand/quantityReserved/
// availableStock — nunca uma segunda fórmula de estoque disponível.
export async function computeLiveStockAndSales(productIds: string[], executor?: any): Promise<Map<string, { onHand: number | null; reserved: number | null; availableStock: number | null; salesCount: number }>> {
  // availableStock/onHand/reserved = null quando o produto não tem NENHUMA
  // linha em `inventory` (nunca deveria acontecer para produtos criados via
  // ProductCreationService, que sempre cria uma — só protege dados legados
  // fora desse caminho): o chamador deve then usar products.stock como
  // estava antes, nunca fingir "0 disponível" para um produto que na
  // verdade nunca teve controle de reserva.
  const result = new Map<string, { onHand: number | null; reserved: number | null; availableStock: number | null; salesCount: number }>();
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
    result.set(id, {
      onHand: inv ? inv.onHand : null,
      reserved: inv ? inv.reserved : null,
      availableStock,
      salesCount: salesMap.get(id) || 0,
    });
  }
  return result;
}

// FASE D16-C2 — estoque AO VIVO por variante, read-only, mesma fonte de
// verdade de sempre (`inventory`), nunca `product_variants.stock` (não-
// autoritativa desde D16-A2). Mesma fórmula de computeLiveStockAndSales
// (SUM(quantityOnHand - quantityReserved), nunca negativo), só que agrupada
// por `variantId` em vez de `productId` — nenhuma tabela nova, nenhum writer
// tocado, nenhuma mudança na semântica de reserva/liberação/despacho.
export async function computeLiveVariantStock(variantIds: string[], executor?: any): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (variantIds.length === 0) return result;

  const db = executor ?? getDb();
  if (!db) return result;

  const rows = await db
    .select({
      variantId: inventory.variantId,
      onHand: sql<string>`COALESCE(SUM(${inventory.quantityOnHand}), 0)`,
      reserved: sql<string>`COALESCE(SUM(${inventory.quantityReserved}), 0)`,
    })
    .from(inventory)
    .where(inArray(inventory.variantId, variantIds))
    .groupBy(inventory.variantId);

  for (const row of rows) {
    if (!row.variantId) continue;
    result.set(row.variantId, Math.max(0, Number(row.onHand) - Number(row.reserved)));
  }
  // Variante sem NENHUMA linha de inventory (não deveria acontecer para
  // variantes criadas via VariantService, que sempre cria uma) -> 0, nunca
  // undefined/null — o chamador precisa de um número para decidir
  // disponibilidade, e "sem controle de estoque" nunca deve significar
  // "comprável à vontade".
  for (const id of variantIds) {
    if (!result.has(id)) result.set(id, 0);
  }
  return result;
}

// FASE D17-C3 — reviews é a fonte de verdade; products.rating/reviewsCount
// são agregados MATERIALIZADOS derivados dela (nunca uma segunda fonte
// independente, nunca incrementados/decrementados manualmente — isso
// divergiria sob concorrência). Sempre recalculado do zero a partir das
// linhas reais de `reviews` com status='approved'.
//
// `executor` é OBRIGATÓRIO aqui (ao contrário de computeLiveStockAndSales/
// computeLiveVariantStock, que toleram usar o pool singleton): esta função
// SEMPRE precisa rodar dentro da MESMA transaction do INSERT da review que
// a disparou (ver POST /buyer/reviews) — nunca solta, para que review+
// agregado fiquem atomicamente consistentes.
//
// Lock FOR UPDATE na própria linha de `products` (mesmo mecanismo já usado
// em walletService.ts para depósitos concorrentes) serializa duas chamadas
// concorrentes para o MESMO productId: a segunda bloqueia até a primeira
// transação commitar (INSERT da review + UPDATE do agregado juntos), então
// sua própria leitura de `reviews` já enxerga a review da primeira chamada
// — nunca uma leitura parcial, nunca um "count=1" sobrescrevendo um
// "count=2" já commitado.
export async function recomputeProductReviewAggregates(productId: string, executor: any): Promise<{ rating: string; reviewsCount: number }> {
  await executor.select({ id: products.id }).from(products).where(eq(products.id, productId)).for('update');

  const [agg] = await executor
    .select({
      count: sql<string>`COUNT(*)`,
      avgRating: sql<string>`AVG(${reviews.rating})`,
    })
    .from(reviews)
    .where(and(eq(reviews.productId, productId), eq(reviews.status, 'approved')));

  const reviewsCount = Number(agg?.count || 0);
  // numeric(3,2) — '0.00' é um sentinela inequívoco de "sem reviews": uma
  // review real nunca produz média exatamente 0 (rating sempre 1..5), então
  // nunca há ambiguidade entre "nota zero real" e "nenhuma avaliação".
  const rating = reviewsCount > 0 ? Number(agg.avgRating).toFixed(2) : '0.00';

  await executor.update(products).set({ rating, reviewsCount, updatedAt: new Date() }).where(eq(products.id, productId));

  return { rating, reviewsCount };
}

export interface ProductQueryFilters {
  q?: string;
  category?: string;
  country?: string;
  // FASE D16-G1 — filtro OPCIONAL e ADICIONAL de país de ORIGEM
  // (products.countryCode), nunca substitui `country` (destino/elegibilidade
  // — productEligibilityService.ts). 'ALL'/undefined/vazio = sem filtro de
  // origem (mostra todas as origens já elegíveis para o destino). Ver
  // auditoria D16-G0 — o conceito de "origem" já existe no schema
  // (products.countryCode); isto só expõe um filtro adicional sobre ele.
  originCountryFilter?: string;
  storeId?: string;
  brand?: string;
  // FASE D17-B1 — usado exclusivamente por recomendações (GET /products/:id/
  // recommendations) para nunca recomendar o próprio produto que o comprador
  // já está vendo. Faz parte do objeto `filters` espalhado na cacheKey logo
  // abaixo (nenhuma mudança necessária na própria chave) — uma resposta
  // cacheada para excludeProductId=A nunca é reutilizada para B.
  excludeProductId?: string;
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

    // FASE D16-G1 — filtro ADICIONAL de país de ORIGEM (products.countryCode).
    // NUNCA substitui a condição de destino/elegibilidade acima — é sempre um
    // AND sobre ela ("de qual origem, DENTRO do que já é elegível para o meu
    // destino"). 'ALL'/ausente/vazio = nenhum filtro de origem. Country code
    // inválido (não cadastrado em `countries`) é IGNORADO silenciosamente —
    // nunca quebra a listagem nem esvazia o catálogo por um parâmetro de UI
    // malformado; equivalente a não ter passado o filtro.
    if (filters.originCountryFilter && filters.originCountryFilter.trim().toUpperCase() !== 'ALL') {
      const origin = filters.originCountryFilter.trim().toUpperCase();
      const [originCountryRow] = await db.select({ code: countries.code }).from(countries).where(eq(countries.code, origin)).limit(1);
      if (originCountryRow) {
        conditions.push(eq(products.countryCode, origin));
      }
    }

    // Fase "Lojas oficiais reais": relacionamento real produto↔loja — nunca
    // heurística de texto no nome do seller.
    if (filters.storeId) {
      conditions.push(eq(products.storeId, filters.storeId));
    }

    // FASE D17-B1 — exclui o próprio produto (recomendações nunca sugerem o
    // produto que o comprador já está vendo). Nunca afeta nenhum outro
    // chamador existente (Home/Search/Category/Store/Favorites/AIAssistant)
    // porque nenhum deles passa excludeProductId.
    if (filters.excludeProductId) {
      conditions.push(ne(products.id, filters.excludeProductId));
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

    // FASE D16-C2.1 — sinal leve "este produto tem variantes reais ativas"
    // para a listagem (ProductCard nunca escolhe variants[0] às cegas — só
    // decide, com isso, se leva ao detalhe em vez de adicionar direto).
    // Read-only, nunca traz os dados completos da variante aqui.
    const variantOwnerRows = items.length > 0
      ? await db
          .selectDistinct({ productId: productVariants.productId })
          .from(productVariants)
          .where(and(inArray(productVariants.productId, items.map((p) => p.id)), eq(productVariants.isActive, true)))
      : [];
    const hasVariantsSet = new Set(variantOwnerRows.map((r: any) => r.productId));

    const result = {
      products: items.map((p) => {
        const live = liveStockMap.get(p.id);
        return {
          ...p,
          price: Number(p.price),
          originalPrice: p.originalPrice ? Number(p.originalPrice) : undefined,
          // FASE D17-C3 — "|| 5.0" era um fallback de nota falsa (só não
          // disparava para o sentinela real '0.00', mas dispararia para
          // qualquer linha com rating NULL) — corrigido para o MESMO padrão
          // já correto usado em getProductById (0, nunca uma nota inventada).
          rating: p.rating !== null && p.rating !== undefined ? Number(p.rating) : 0,
          stock: live?.availableStock ?? Number(p.stock),
          salesCount: live?.salesCount ?? 0,
          hasVariants: hasVariantsSet.has(p.id),
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

  // FASE D17-B1 — lookup mínimo para recomendações (GET /products/:id/
  // recommendations): precisa SOMENTE de id/categoryId/storeId para montar
  // os filtros das seções, nunca variantes/imagens/reviews/estoque ao vivo
  // (isso é getProductById, para a própria página de detalhe — nunca uma
  // segunda implementação de Product Detail). Sem filtro de isActive/status:
  // mesmo critério de "existe?" já usado por getProductById (404 só quando
  // não há NENHUMA linha com esse id).
  static async getProductBaseInfo(id: string, executor?: any): Promise<{ id: string; categoryId: string | null; storeId: string | null } | null> {
    const db = executor ?? getDb();
    if (!db) return null;

    const rows = await db
      .select({ id: products.id, categoryId: products.categoryId, storeId: products.storeId })
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    return rows[0] ?? null;
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
      // Mesma regra do produto: estoque por variante também nunca pode vir
      // congelado do cache — recalculado a cada leitura, mesmo em cache hit.
      const cachedVariants: any[] = Array.isArray(cached.variants) ? cached.variants : [];
      const liveVariantStockCached = cachedVariants.length > 0
        ? await computeLiveVariantStock(cachedVariants.map((v: any) => v.id), executor)
        : new Map<string, number>();
      const withLiveStock = {
        ...cached,
        stock: liveC?.availableStock ?? Number(cached.stock),
        salesCount: liveC?.salesCount ?? 0,
        variants: cachedVariants.map((v: any) => ({
          ...v,
          availableStock: liveVariantStockCached.get(v.id) ?? 0,
        })),
      };
      return this.attachEligibility(withLiveStock, destinationCountry);
    }

    const db = executor ?? getDb();
    if (!db) return null;

    const [productRes, variantsRes, imagesRes, reviewsRes, attrRes] = await Promise.all([
      db.select().from(products).where(eq(products.id, id)).limit(1),
      db.select().from(productVariants).where(eq(productVariants.productId, id)),
      db.select().from(productImages).where(eq(productImages.productId, id)),
      // FASE D17-C2 — só reviews com status='approved' (nenhuma moderação
      // nova criada aqui, apenas respeitando o status já existente no schema).
      db.select().from(reviews).where(and(eq(reviews.productId, id), eq(reviews.status, 'approved'))).orderBy(desc(reviews.createdAt)).limit(10),
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

    // FASE D17-C7 — fotos reais da review, buscadas em uma única query
    // separada (evita N+1: 1 query para todas as reviews desta página, nunca
    // uma por review) — mesmo padrão já usado para as respostas de perguntas
    // em catalogRoutes.ts. Reviews sem foto simplesmente não aparecem no Map,
    // resultando em array vazio (nunca inventa/preenche com placeholder).
    const reviewIds = reviewsRes.map((r) => r.id);
    const reviewImagesRes = reviewIds.length > 0
      ? await db.select().from(reviewImages).where(inArray(reviewImages.reviewId, reviewIds)).orderBy(asc(reviewImages.createdAt))
      : [];
    const imagesByReviewId = new Map<string, string[]>();
    for (const img of reviewImagesRes as any[]) {
      const list = imagesByReviewId.get(img.reviewId) || [];
      list.push(img.imageUrl);
      imagesByReviewId.set(img.reviewId, list);
    }

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

    // FASE D16-C2 — estoque AO VIVO por variante (fonte: inventory, nunca
    // product_variants.stock). Read-only, calculado na leitura, nunca
    // gravado — mesmo padrão já usado para o produto inteiro logo abaixo
    // (computeLiveStockAndSales).
    const liveVariantStock = variantsRes.length > 0
      ? await computeLiveVariantStock(variantsRes.map((v) => v.id), executor ?? db)
      : new Map<string, number>();

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
      // FASE D16-C2.1 — mesmo sinal leve da listagem, calculado aqui sem
      // query extra (variantsRes já foi buscado acima).
      hasVariants: variantsRes.some((v) => v.isActive !== false),
      variants: variantsRes.map((v) => ({
        ...v,
        price: Number(v.price),
        originalPrice: v.originalPrice ? Number(v.originalPrice) : undefined,
        // Legado/não-autoritativo — nunca usar para decidir disponibilidade
        // (ver availableStock, a fonte real, logo abaixo).
        stock: Number(v.stock),
        availableStock: liveVariantStock.get(v.id) ?? 0,
      })),
      images: imageUrlList.length > 0 ? imageUrlList : (p.image ? [p.image] : []),
      galleryImages: imageUrlList.length > 0 ? imageUrlList : (p.image ? [p.image] : []),
      productImages: imagesRes,
      // FASE D17-C2 — corrige mismatch confirmado na auditoria D17-C1:
      // ProductDetailView.tsx sempre leu `product.reviews` (rev.id/rating/
      // title/comment/date/likes), mas este objeto só anexava
      // `recentReviews` (sem nenhum consumidor) — a leitura real do banco
      // nunca chegava à UI. Mapeado aqui para o formato que a UI já espera,
      // sem alterar ProductDetailView.tsx.
      reviews: reviewsRes.map((r) => ({
        id: r.id,
        rating: r.rating,
        title: r.title || '',
        comment: r.comment,
        date: r.createdAt.toLocaleDateString('pt-BR'),
        likes: r.helpfulCount || 0,
        // FASE D17-C7 — nunca undefined: review sem foto retorna [].
        images: imagesByReviewId.get(r.id) || [],
      })),
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
