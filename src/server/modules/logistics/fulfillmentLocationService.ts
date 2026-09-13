/**
 * FASE D15-C3 — fundação de múltiplas origens físicas de estoque
 * (fulfillment_locations).
 *
 * AJUSTE ARQUITETURAL (mesma fase, antes do commit): a primeira versão desta
 * fundação incluía uma tabela `inventory_locations` paralela, com sua
 * própria quantityOnHand/quantityReserved. Auditoria identificou risco real
 * de DUAS FONTES DE VERDADE de estoque — `inventory_locations` foi REMOVIDA
 * (schema, migration 0026 e este service) antes de qualquer aplicação em
 * staging/produção. `inventory` (tabela pré-existente) continua sendo a
 * ÚNICA fonte de verdade de quantidade; ela ganhou uma coluna opcional
 * `fulfillmentLocationId` (ver src/db/schema.ts) que ainda não é populada
 * nem lida por nenhum consumidor nesta fase (nenhum backfill).
 *
 * PARALELO ao modelo atual de `inventory` (locationType/sellerId/
 * warehouseId) — nada aqui é lido por shipmentService.ts/orderService.ts/
 * checkout ainda. Nenhuma reserva real, nenhum cálculo de frete, nenhuma
 * escolha de melhor origem — só a fundação de dados e as funções
 * idempotentes de "garantir que a location existe/está atualizada".
 *
 * Separação conceitual, sempre respeitada neste arquivo:
 *   - fulfillment_locations = ONDE um estoque físico pode existir (loja OU
 *     HUB/armazém Nusali) — nunca a quem pertence, nem quanto existe.
 *   - "quanto" e "de quem" continuam exclusivamente em `inventory`
 *     (sellerId/quantityOnHand/quantityReserved), como sempre foi.
 */
import { eq, and, isNotNull } from 'drizzle-orm';
import { getDb } from '../../../db/index.js';
import {
  stores,
  sellers,
  addresses,
  warehouses,
  fulfillmentLocations,
  inventory,
  products,
  productVariants,
} from '../../../db/schema.js';

export type FulfillmentLocationRow = typeof fulfillmentLocations.$inferSelect;

function deterministicStoreLocationId(storeId: string): string {
  return `floc_store_${storeId}`;
}
function deterministicWarehouseLocationId(warehouseId: string): string {
  return `floc_wh_${warehouseId}`;
}

/**
 * Garante (cria ou atualiza) UMA fulfillment_location do tipo STORE para a
 * loja informada — nunca duplica (ID determinístico + índice único parcial
 * em store_id são as duas camadas de proteção). Sempre refresca
 * addressId/shippingSectorId/countryCode a partir do estado ATUAL de
 * stores.operationalAddressId -> addresses — nunca uma cópia congelada que
 * possa divergir silenciosamente.
 */
export async function ensureStoreFulfillmentLocation(storeId: string, executor?: any): Promise<FulfillmentLocationRow> {
  const db = executor ?? getDb();
  if (!db) throw new Error('FULFILLMENT_LOCATION_DB_UNAVAILABLE: banco de dados indisponível.');

  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) throw new Error(`STORE_NOT_FOUND: loja "${storeId}" não encontrada.`);

  const [seller] = await db.select().from(sellers).where(eq(sellers.id, store.sellerId)).limit(1);
  if (!seller) throw new Error(`SELLER_NOT_FOUND: vendedor da loja "${storeId}" não encontrado.`);

  let addressId: string | null = null;
  let shippingSectorId: string | null = null;
  if (store.operationalAddressId) {
    const [address] = await db.select().from(addresses).where(eq(addresses.id, store.operationalAddressId)).limit(1);
    if (address) {
      addressId = address.id;
      shippingSectorId = address.shippingSectorId || null;
    }
  }

  const id = deterministicStoreLocationId(storeId);
  const name = `Loja: ${store.name}`;
  const now = new Date();

  const existing = await db.select().from(fulfillmentLocations).where(eq(fulfillmentLocations.storeId, storeId)).limit(1);
  if (existing.length > 0) {
    await db.update(fulfillmentLocations).set({
      sellerId: seller.id,
      addressId,
      shippingSectorId,
      countryCode: store.countryCode,
      name,
      updatedAt: now,
    }).where(eq(fulfillmentLocations.id, existing[0].id));
  } else {
    await db.insert(fulfillmentLocations).values({
      id,
      sellerId: seller.id,
      locationType: 'STORE',
      storeId,
      warehouseId: null,
      addressId,
      countryCode: store.countryCode,
      shippingSectorId,
      name,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    } as any).onConflictDoNothing();
  }

  const [row] = await db.select().from(fulfillmentLocations).where(eq(fulfillmentLocations.storeId, storeId)).limit(1);
  return row;
}

/**
 * Garante (cria ou atualiza) UMA fulfillment_location do tipo
 * NUSALI_WAREHOUSE para o armazém informado — nunca duplica. sellerId fica
 * SEMPRE null (HUB compartilhado). addressId/shippingSectorId ficam SEMPRE
 * null nesta fase: warehouses ainda não tem addressId/shippingSectorId
 * estruturado (confirmado por auditoria — só city/address/countryCode
 * texto livre) — nada é inventado para preencher essa lacuna.
 */
export async function ensureWarehouseFulfillmentLocation(warehouseId: string, executor?: any): Promise<FulfillmentLocationRow> {
  const db = executor ?? getDb();
  if (!db) throw new Error('FULFILLMENT_LOCATION_DB_UNAVAILABLE: banco de dados indisponível.');

  const [warehouse] = await db.select().from(warehouses).where(eq(warehouses.id, warehouseId)).limit(1);
  if (!warehouse) throw new Error(`WAREHOUSE_NOT_FOUND: armazém "${warehouseId}" não encontrado.`);

  const id = deterministicWarehouseLocationId(warehouseId);
  const name = `HUB: ${warehouse.name}`;
  const now = new Date();

  const existing = await db.select().from(fulfillmentLocations).where(eq(fulfillmentLocations.warehouseId, warehouseId)).limit(1);
  if (existing.length > 0) {
    await db.update(fulfillmentLocations).set({
      countryCode: warehouse.countryCode,
      name,
      updatedAt: now,
    }).where(eq(fulfillmentLocations.id, existing[0].id));
  } else {
    await db.insert(fulfillmentLocations).values({
      id,
      sellerId: null,
      locationType: 'NUSALI_WAREHOUSE',
      storeId: null,
      warehouseId,
      addressId: null,
      countryCode: warehouse.countryCode,
      shippingSectorId: null,
      name,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    } as any).onConflictDoNothing();
  }

  const [row] = await db.select().from(fulfillmentLocations).where(eq(fulfillmentLocations.warehouseId, warehouseId)).limit(1);
  return row;
}

/**
 * Lista, para UM seller: (1) as fulfillment_locations das próprias lojas
 * (garantidas/atualizadas na hora — sempre existem, mesmo sem estoque
 * ainda) e (2) HUBs Nusali onde esse seller JÁ TEM estoque HOJE segundo o
 * modelo LEGADO (`inventory.locationType='NUSALI_HUB'` + `inventory.sellerId`
 * + `inventory.warehouseId`).
 *
 * Compatibilidade de leitura (D15-C3, ajuste arquitetural): como
 * `inventory.fulfillmentLocationId` ainda não é populado para nenhuma linha
 * existente nesta fase (nenhum backfill — ver schema.ts), resolvemos o HUB
 * correspondente por `inventory.warehouseId -> fulfillment_locations.warehouseId`
 * — um join determinístico (mesmo índice único parcial que já garante 1 hub
 * = 1 fulfillment_location), SOMENTE EM LEITURA. Nada aqui grava em
 * `inventory` nem popula `fulfillmentLocationId` — isso fica para uma fase
 * de migração controlada posterior.
 */
export async function listFulfillmentLocationsForSeller(sellerId: string, executor?: any): Promise<FulfillmentLocationRow[]> {
  const db = executor ?? getDb();
  if (!db) return [];

  const ownStores = await db.select().from(stores).where(eq(stores.sellerId, sellerId));
  const storeLocations = await Promise.all(ownStores.map((s: any) => ensureStoreFulfillmentLocation(s.id, db)));

  const hubWarehouseRows = await db
    .selectDistinct({ warehouseId: inventory.warehouseId })
    .from(inventory)
    .where(and(
      eq(inventory.sellerId, sellerId),
      eq(inventory.locationType, 'NUSALI_HUB'),
      isNotNull(inventory.warehouseId),
    ));

  const hubLocations: FulfillmentLocationRow[] = [];
  for (const r of hubWarehouseRows) {
    if (!r.warehouseId) continue;
    const [loc] = await db.select().from(fulfillmentLocations).where(eq(fulfillmentLocations.warehouseId, r.warehouseId)).limit(1);
    if (loc) hubLocations.push(loc);
  }

  return [...storeLocations.filter(Boolean), ...hubLocations];
}

export interface ValidateInventoryVariantConsistencyInput {
  sellerId: string;
  productId: string;
  variantId?: string | null;
}

/**
 * FASE D16 (preparação) — validação reutilizável de consistência
 * produto/variante/seller para qualquer escritor NOVO de `inventory` que
 * grave `variantId`. Regra: variantId==null é sempre válido; se informado,
 * a variante precisa pertencer exatamente ao productId informado (nunca
 * aceitar variante de outro produto), e o produto precisa pertencer ao
 * sellerId informado. Nenhum escritor existente de `inventory` foi
 * modificado para usar esta função nesta fase (ver relatório — D16 deve
 * adotá-la nos escritores legados); ela existe pronta para qualquer NOVO
 * write introduzido a partir de agora.
 */
export async function validateInventoryVariantConsistency(
  input: ValidateInventoryVariantConsistencyInput,
  executor?: any
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = executor ?? getDb();
  if (!db) return { ok: false, error: 'FULFILLMENT_LOCATION_DB_UNAVAILABLE: banco de dados indisponível.' };

  if (!input.variantId) {
    return { ok: true };
  }

  const [product] = await db.select().from(products).where(eq(products.id, input.productId)).limit(1);
  if (!product) {
    return { ok: false, error: `PRODUCT_NOT_FOUND: produto "${input.productId}" não encontrado.` };
  }
  if (product.sellerId !== input.sellerId) {
    return { ok: false, error: 'PRODUCT_SELLER_MISMATCH: este produto pertence a outro vendedor.' };
  }

  const [variant] = await db.select().from(productVariants).where(eq(productVariants.id, input.variantId)).limit(1);
  if (!variant) {
    return { ok: false, error: `VARIANT_NOT_FOUND: variante "${input.variantId}" não encontrada.` };
  }
  if (variant.productId !== input.productId) {
    return { ok: false, error: 'VARIANT_PRODUCT_MISMATCH: esta variante pertence a outro produto — nunca é aceita uma variante de um produto diferente do informado.' };
  }

  return { ok: true };
}
