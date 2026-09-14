/**
 * FASE D16-A2 — writer real de variantes de produto.
 *
 * Achado central da auditoria D16-A: SellerProductWizard.tsx já monta e
 * envia um array `variants` completo (título derivado de cor/tamanho, SKU,
 * preço, preço riscado, estoque inicial) tanto no POST quanto no PATCH de
 * produto, mas nada no backend jamais lia esse campo — era descartado em
 * silêncio. Este módulo é a camada que finalmente persiste isso em
 * `product_variants` e conecta o estoque inicial a `inventory`.
 *
 * Princípios (mantidos deliberadamente da auditoria):
 *   - `inventory` continua sendo a ÚNICA fonte de verdade de estoque.
 *     `product_variants.stock` NUNCA é escrito como autoridade — permanece
 *     sempre 0 (default da coluna), exatamente como já era antes desta fase
 *     para toda variante.
 *   - IDs efêmeros do frontend (`var-1`, `var-c-0`, ...) NUNCA viram PK real
 *     — toda variante nova recebe um ID gerado pelo backend.
 *   - Sync nunca deleta: variante existente ausente do novo payload é
 *     DESATIVADA (`is_active=false`), nunca apagada — preserva FKs de
 *     `inventory`/`order_items`/`cart_items` para sempre.
 *   - Edição de ESTOQUE de uma variante já existente fica FORA de escopo
 *     desta fase (ver auditoria D16-A, Fase 3): a semântica atual de edição
 *     de estoque do produto simples (`InventoryService.updateSellerStock`)
 *     já valida `quantityReserved` antes de aceitar um novo valor, e
 *     replicar isso corretamente por variante exige mais desenho do que
 *     cabe aqui. Este serviço só cria o `inventory` inicial de uma variante
 *     NOVA — nunca ajusta o estoque de uma variante que já existia.
 *   - Uma variante recebida com o MESMO ID real de uma que pertence a outro
 *     produto (ou, por extensão, a outro seller) é sempre rejeitada — nunca
 *     silenciosamente ignorada nem "adotada".
 */
import { eq } from 'drizzle-orm';
import { products, productVariants, inventory, inventoryMovements } from '../../../db/schema.js';

export interface VariantSyncInput {
  /** ID real existente (edição) OU um ID efêmero do frontend (ex.: "var-1") — nunca usado como PK novo. */
  id?: string | null;
  title?: string | null;
  sku?: string | null;
  price?: number | string | null;
  originalPrice?: number | string | null;
  /** Estoque INICIAL — só tem efeito na criação de uma variante nova (ver Fase 3 da auditoria). */
  stock?: number | string | null;
  size?: string | null;
  color?: string | null;
  capacity?: string | null;
  weight?: number | string | null;
  image?: string | null;
  imageUrl?: string | null;
  attributesJson?: Record<string, any> | null;
}

export interface VariantSyncResult {
  id: string;
  created: boolean;
  reactivated: boolean;
}

/**
 * Sincroniza TODAS as variantes de um produto a partir de um array completo
 * vindo do wizard. Sempre roda dentro do `executor` (transação) informado
 * pelo chamador — nunca abre a própria transação, para poder participar da
 * mesma unidade atômica de quem chama (criação de produto, ou o handler de
 * PATCH).
 *
 * Semântica (Fase 6 da auditoria, decisão explícita):
 *   - `variants` presente e com itens: cada item é criado (ID novo, real) ou
 *     atualizado (ID real já pertencente a este produto) — nunca deletado.
 *   - `variants` presente e VAZIO (`[]`): desativa TODAS as variantes
 *     existentes deste produto (nunca deleta).
 *   - Chamador decide não invocar esta função quando `variants` não veio no
 *     payload — "ausente" nunca é confundido com "vazio" aqui dentro.
 */
export async function syncVariantsForProduct(
  executor: any,
  params: { sellerId: string; productId: string; variants: VariantSyncInput[]; performedBy?: string | null }
): Promise<VariantSyncResult[]> {
  const db = executor;
  const { sellerId, productId, variants, performedBy } = params;
  if (!db) throw new Error('VARIANT_SYNC_DB_UNAVAILABLE: banco de dados indisponível.');

  const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!product) throw new Error(`PRODUCT_NOT_FOUND: produto "${productId}" não encontrado.`);
  if (product.sellerId !== sellerId) {
    throw new Error('PRODUCT_NOT_OWNED: este produto não pertence ao vendedor autenticado.');
  }

  const existingRows = await db.select().from(productVariants).where(eq(productVariants.productId, productId));
  const seenIds = new Set<string>();
  const results: VariantSyncResult[] = [];

  for (const v of variants) {
    // ------------------------------------------------------------------
    // Resolve se o id recebido é uma variante real deste produto, uma
    // variante real de OUTRO produto (rejeitar, nunca adotar) ou não existe
    // no banco (ephemeral do frontend, ou simplesmente ausente) — nesse
    // último caso é sempre CRIAÇÃO com um ID novo gerado aqui.
    // ------------------------------------------------------------------
    let targetRow: any | null = null;
    if (v.id) {
      const [anyRow] = await db.select().from(productVariants).where(eq(productVariants.id, String(v.id))).limit(1);
      if (anyRow) {
        if (anyRow.productId !== productId) {
          throw new Error(`VARIANT_ID_NOT_OWNED: a variante "${v.id}" pertence a outro produto — nunca é aceita neste sync.`);
        }
        targetRow = anyRow;
      }
      // Não encontrada: id efêmero do frontend (ex.: "var-1") ou id de uma
      // variante já removida — segue para o ramo de criação abaixo, e o
      // valor de v.id NUNCA é usado como PK.
    }

    // ------------------------------------------------------------------
    // Validações (Fase 4 da auditoria).
    // ------------------------------------------------------------------
    const priceProvided = v.price !== undefined && v.price !== null && String(v.price).trim() !== '';
    const priceNum = priceProvided
      ? Number(v.price)
      : (targetRow ? Number(targetRow.price) : Number(product.price));
    if (isNaN(priceNum) || priceNum < 0) {
      throw new Error(`VARIANT_PRICE_INVALID: preço inválido para a variante${v.sku ? ` "${v.sku}"` : ''} — deve ser um número maior ou igual a 0.`);
    }

    let originalPriceStr: string | null = null;
    if (v.originalPrice !== undefined && v.originalPrice !== null && String(v.originalPrice).trim() !== '') {
      const origNum = Number(v.originalPrice);
      if (isNaN(origNum)) {
        throw new Error('VARIANT_ORIGINAL_PRICE_INVALID: preço anterior da variante inválido.');
      }
      if (origNum <= priceNum) {
        throw new Error('VARIANT_ORIGINAL_PRICE_INVALID: o preço anterior da variante deve ser maior que o preço atual — do contrário não é uma promoção real.');
      }
      originalPriceStr = String(origNum);
    }

    let weightStr: string | null = null;
    if (v.weight !== undefined && v.weight !== null && String(v.weight).trim() !== '') {
      const weightNum = Number(v.weight);
      if (isNaN(weightNum) || weightNum < 0) {
        throw new Error('VARIANT_WEIGHT_INVALID: peso da variante inválido — deve ser um número maior ou igual a 0.');
      }
      weightStr = String(weightNum);
    }

    const skuClean = v.sku && String(v.sku).trim() !== '' ? String(v.sku).trim() : null;
    if (skuClean) {
      const dupRows = await db.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.sku, skuClean));
      const dup = dupRows.find((r: any) => r.id !== targetRow?.id);
      if (dup) {
        throw new Error(`VARIANT_SKU_DUPLICATE: o SKU "${skuClean}" já está em uso por outra variante.`);
      }
    }

    let stockInitial = 0;
    if (v.stock !== undefined && v.stock !== null && String(v.stock).trim() !== '') {
      const stockNum = Number(v.stock);
      if (isNaN(stockNum) || stockNum < 0 || !Number.isFinite(stockNum)) {
        throw new Error('VARIANT_STOCK_INVALID: estoque inicial da variante deve ser um número inteiro maior ou igual a 0.');
      }
      stockInitial = Math.floor(stockNum);
    }

    const sizeClean = v.size && String(v.size).trim() !== '' ? String(v.size).trim() : null;
    const colorClean = v.color && String(v.color).trim() !== '' ? String(v.color).trim() : null;
    const capacityClean = v.capacity && String(v.capacity).trim() !== '' ? String(v.capacity).trim() : null;
    const imageClean = (v.image || v.imageUrl) && String(v.image || v.imageUrl).trim() !== '' ? String(v.image || v.imageUrl).trim() : null;
    const attributesJsonClean = v.attributesJson && typeof v.attributesJson === 'object' ? v.attributesJson : null;

    // Título obrigatório na coluna (NOT NULL) — o wizard hoje não envia um
    // título por variante (ProductVariant do frontend não tem esse campo),
    // então é sempre derivado da combinação de opções reais, nunca
    // inventado sem base: cor/tamanho/capacidade escolhidos, senão o SKU,
    // senão um rótulo genérico apenas como último recurso.
    const titleClean =
      (v.title && String(v.title).trim()) ||
      [colorClean, sizeClean, capacityClean].filter(Boolean).join(' / ') ||
      skuClean ||
      'Variação';

    if (targetRow) {
      // ---- UPDATE: só campos comerciais. NUNCA productVariants.stock,
      // NUNCA inventory (estoque de variante existente é fora de escopo
      // desta fase — ver cabeçalho do arquivo). Reaparecer explicitamente
      // com o mesmo ID real reativa a variante.
      await db.update(productVariants).set({
        title: titleClean,
        sku: skuClean,
        price: String(priceNum),
        originalPrice: originalPriceStr,
        size: sizeClean,
        color: colorClean,
        capacity: capacityClean,
        weight: weightStr,
        imageUrl: imageClean,
        attributesJson: attributesJsonClean,
        isActive: true,
        updatedAt: new Date(),
      }).where(eq(productVariants.id, targetRow.id));

      results.push({ id: targetRow.id, created: false, reactivated: targetRow.isActive === false });
      seenIds.add(targetRow.id);
    } else {
      // ---- CREATE: ID novo sempre gerado aqui — o valor de v.id (efêmero
      // ou inexistente) nunca é usado como PK.
      const newId = `pvar_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      await db.insert(productVariants).values({
        id: newId,
        productId,
        title: titleClean,
        sku: skuClean,
        price: String(priceNum),
        originalPrice: originalPriceStr,
        // Legado/não-autoritativo — permanece no default da coluna (0).
        // inventory é quem manda; nunca espelhamos o valor aqui.
        size: sizeClean,
        color: colorClean,
        capacity: capacityClean,
        weight: weightStr,
        imageUrl: imageClean,
        attributesJson: attributesJsonClean,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      // Estoque inicial — mesmo padrão já usado por
      // ProductCreationService.createProduct para o produto simples (uma
      // linha SELLER_LOCATION, sempre criada, mesmo com quantidade 0).
      const invId = `inv_seller_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await db.insert(inventory).values({
        id: invId,
        locationType: 'SELLER_LOCATION',
        sellerId,
        warehouseId: null,
        productId,
        variantId: newId,
        quantityOnHand: stockInitial,
        quantityReserved: 0,
        minimumStockLevel: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await db.insert(inventoryMovements).values({
        id: `mov_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        inventoryId: invId,
        warehouseId: null,
        productId,
        variantId: newId,
        type: 'IN',
        quantity: stockInitial,
        reason: 'Estoque inicial da variante cadastrada',
        performedBy: performedBy || null,
        createdAt: new Date(),
      });

      results.push({ id: newId, created: true, reactivated: false });
      seenIds.add(newId);
    }
  }

  // ------------------------------------------------------------------
  // Variante existente que não veio no novo payload: DESATIVA, nunca
  // deleta (preserva FKs de inventory/order_items/cart_items para sempre).
  // ------------------------------------------------------------------
  for (const row of existingRows) {
    if (!seenIds.has(row.id) && row.isActive) {
      await db.update(productVariants).set({ isActive: false, updatedAt: new Date() }).where(eq(productVariants.id, row.id));
    }
  }

  return results;
}
