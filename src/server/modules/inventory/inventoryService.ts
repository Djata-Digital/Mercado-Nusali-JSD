import { getDb } from '../../../db/index.js';
import {
  inventory, inventoryMovements, stockReservations, products, warehouses, inventoryTransfers, sellers,
  productVariants, fulfillmentLocations, stores, addresses,
} from '../../../db/schema.js';
import { eq, and, sql, desc, or } from 'drizzle-orm';
import { logger } from '../../infra/logger.js';
// FASE D16-E3 — mesma função já usada por GET /seller/fulfillment-locations
// e pelos writers de inventory de D16-E2, agora também para vincular o
// inventory HUB NOVO à origem física real do warehouse de destino.
import { ensureWarehouseFulfillmentLocation } from '../logistics/fulfillmentLocationService.js';

export class InventoryService {
  /**
   * Recalculates and updates products.stock summary column based on the sum of quantityOnHand from all location inventories.
   */
  static async syncProductStockSummary(productId: string, executor?: any) {
    const db = executor || getDb();
    if (!db || !productId) return 0;

    const rows = await db
      .select({ qty: inventory.quantityOnHand })
      .from(inventory)
      .where(eq(inventory.productId, productId));

    const totalStock = rows.reduce((acc: number, r: any) => acc + (r.qty || 0), 0);

    await db
      .update(products)
      .set({
        stock: totalStock,
        updatedAt: new Date(),
      })
      .where(eq(products.id, productId));

    return totalStock;
  }

  /**
   * Updates a seller's physical stock at their SELLER_LOCATION.
   * @param sellerId Primary Key of sellers table (sellers.id).
   * @param actingUserId Optional Primary Key of users table (users.id) for audit performedBy.
   */
  static async updateSellerStock(
    productId: string,
    newStock: number,
    sellerId?: string | null,
    variantId?: string | null,
    actingUserId?: string | null,
    executor?: any
  ) {
    const db = executor || getDb();
    if (!db) throw new Error('Banco de dados indisponível.');

    const cleanStock = Math.max(0, Math.floor(Number(newStock) || 0));

    // Resolve product
    const [prod] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!prod) throw new Error(`Produto ${productId} não encontrado.`);

    // sellerId MUST be sellers.id (aligned with products.sellerId and inventory.sellerId)
    const targetSellerId = sellerId || prod.sellerId || null;

    // Query SELLER_LOCATION inventory row specifically for this product and seller
    const conditions = [
      eq(inventory.productId, productId),
      eq(inventory.locationType, 'SELLER_LOCATION'),
    ];
    if (targetSellerId) {
      conditions.push(eq(inventory.sellerId, targetSellerId));
    }
    if (variantId) {
      conditions.push(eq(inventory.variantId, variantId));
    }

    let [sellerInv] = await db
      .select()
      .from(inventory)
      .where(and(...conditions))
      .limit(1);

    if (!sellerInv) {
      // Create SELLER_LOCATION inventory row (sellerId = sellers.id)
      const newInvId = `inv_seller_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await db.insert(inventory).values({
        id: newInvId,
        locationType: 'SELLER_LOCATION',
        sellerId: targetSellerId,
        warehouseId: null,
        productId,
        variantId: variantId || null,
        quantityOnHand: cleanStock,
        quantityReserved: 0,
        minimumStockLevel: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Record movement (performedBy = users.id)
      await db.insert(inventoryMovements).values({
        id: `mov_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        inventoryId: newInvId,
        warehouseId: null,
        productId,
        variantId: variantId || null,
        type: 'ADJUSTMENT',
        quantity: cleanStock,
        reason: 'Ajuste de estoque inicial pelo vendedor',
        performedBy: actingUserId || null,
        createdAt: new Date(),
      });
    } else {
      // Validate that new stock is not less than already reserved quantity
      if (cleanStock < sellerInv.quantityReserved) {
        throw new Error(
          `Quantidade em estoque (${cleanStock}) não pode ser menor que o estoque já reservado (${sellerInv.quantityReserved}) para pedidos em andamento.`
        );
      }

      const delta = cleanStock - sellerInv.quantityOnHand;

      await db
        .update(inventory)
        .set({
          quantityOnHand: cleanStock,
          updatedAt: new Date(),
        })
        .where(eq(inventory.id, sellerInv.id));

      if (delta !== 0) {
        await db.insert(inventoryMovements).values({
          id: `mov_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          inventoryId: sellerInv.id,
          warehouseId: sellerInv.warehouseId || null,
          productId,
          variantId: variantId || null,
          type: 'ADJUSTMENT',
          quantity: delta,
          reason: `Ajuste de estoque pelo vendedor (novo: ${cleanStock})`,
          performedBy: actingUserId || null,
          createdAt: new Date(),
        });
      }
    }

    // Sync products.stock summary
    await InventoryService.syncProductStockSummary(productId, db);
    return true;
  }

  /**
   * Calculates total available stock for a product (or specific variant) across all locations (SELLER_LOCATION + NUSALI_HUB).
   */
  static async getAvailableStock(productId: string, variantId?: string | null, executor?: any) {
    const db = executor || getDb();
    if (!db) return 0;

    const conditions = [eq(inventory.productId, productId)];
    if (variantId) {
      conditions.push(eq(inventory.variantId, variantId));
    }

    const rows = await db.select().from(inventory).where(and(...conditions));
    const totalAvailable = rows.reduce(
      (acc: number, inv: any) => acc + Math.max(0, (inv.quantityOnHand || 0) - (inv.quantityReserved || 0)),
      0
    );

    return totalAvailable;
  }

  /**
   * FASE D16-E5 — reescrito para exigir uma inventory row EXATA
   * (sourceInventoryId) como origem da transferência, nunca mais
   * productId+variantId opcional resolvido por .limit(1)/find() implícito
   * (achado da auditoria D16-E5: produto variável podia transferir uma
   * variante arbitrária; fluxo multi-store podia usar a loja errada).
   *
   * Toda a cadeia de ownership/origem é revalidada aqui, nunca confiando em
   * nada vindo do frontend além do próprio ID da inventory e da quantidade/
   * destino/modalidade:
   *   inventory (sourceInventoryId) -> product -> [variant] -> fulfillment_location -> store
   * sellerId nunca é aceito do chamador remoto — vem sempre da sessão
   * autenticada resolvida pela rota (mesmo padrão já usado em todo o resto
   * do arquivo).
   *
   * pickupSnapshotJson NUNCA é mais aceito do frontend — reconstruído aqui
   * inteiramente a partir do endereço operacional REAL da store de origem
   * (stores.operationalAddressId -> addresses), a única fonte autoritativa
   * (D16-E4).
   */
  static async requestTransferToHub(
    sellerId: string,
    sourceInventoryId: string,
    toWarehouseId: string,
    quantity: number,
    deliveryMode?: string
  ) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível.');

    const qtyToTransfer = Math.floor(Number(quantity));
    if (isNaN(qtyToTransfer) || qtyToTransfer <= 0) {
      throw new Error('QUANTITY_INVALID: Quantidade de transferência inválida.');
    }

    if (!deliveryMode || (deliveryMode !== 'NUSALI_PICKUP' && deliveryMode !== 'SELLER_DROPOFF')) {
      throw new Error('INVALID_DELIVERY_MODE: Selecione uma modalidade de entrega válida (NUSALI_PICKUP ou SELLER_DROPOFF).');
    }
    const mode = deliveryMode;

    if (!sourceInventoryId || !String(sourceInventoryId).trim()) {
      throw new Error('SOURCE_INVENTORY_REQUIRED: Selecione exatamente qual estoque (produto/variante/loja) deseja transferir.');
    }

    // FASE D16-E5 (seção "concorrência") — TUDO a partir daqui roda dentro
    // de UMA transação com lock de linha na inventory de origem (mesmo
    // padrão .for('update') já usado em wallets/escrow/refunds neste
    // projeto). Duas requisições concorrentes para a MESMA sourceInventoryId
    // agora serializam: a segunda só lê a linha depois que a primeira
    // confirmar (commit) ou desistir (rollback), e por isso sempre enxerga
    // a transferência pendente que a primeira acabou de criar — nunca duas
    // reservas somadas além do disponível real.
    return await db.transaction(async (tx: any) => {
    // A. inventory existe (lock de linha — nunca lido "solto" fora da tx).
    const [sourceInv] = await tx.select().from(inventory).where(eq(inventory.id, String(sourceInventoryId))).for('update').limit(1);
    if (!sourceInv) {
      throw new Error('SOURCE_INVENTORY_NOT_FOUND: Estoque de origem não encontrado.');
    }

    // B. pertence ao seller autenticado — nunca ao seller enviado pelo corpo.
    if (sourceInv.sellerId !== sellerId) {
      throw new Error('SOURCE_INVENTORY_NOT_OWNED: Este estoque não pertence ao vendedor autenticado.');
    }

    // C. nunca transferir de um HUB (origem sempre SELLER_LOCATION).
    if (sourceInv.locationType !== 'SELLER_LOCATION') {
      throw new Error('SOURCE_INVENTORY_INVALID_LOCATION: Só é possível transferir estoque do seu estabelecimento — nunca a partir de um HUB.');
    }

    // D. produto real e do mesmo seller (defesa em profundidade — já
    // implícito por sourceInv.sellerId, mas nunca confia só nisso).
    const [prod] = await tx.select().from(products).where(eq(products.id, sourceInv.productId)).limit(1);
    if (!prod) throw new Error('PRODUCT_NOT_FOUND: Produto do estoque de origem não encontrado.');
    if (prod.sellerId !== sellerId) {
      throw new Error('PRODUCT_NOT_OWNED: Você não é o proprietário deste produto.');
    }

    // E. variantId real quando o produto for variável — nunca aceita uma
    // inventory "agregada" do produto se ele já tem variantes ativas reais
    // (a linha teria que ser de uma variante específica, D16-A2/D16-E2
    // sempre criam assim para produto variável).
    if (sourceInv.variantId) {
      const [variantRow] = await tx.select().from(productVariants).where(eq(productVariants.id, sourceInv.variantId)).limit(1);
      if (!variantRow || variantRow.productId !== sourceInv.productId) {
        throw new Error('SOURCE_INVENTORY_VARIANT_MISMATCH: A variante deste estoque não pertence ao produto correspondente.');
      }
    } else {
      const activeVariantRows = await tx
        .select({ id: productVariants.id })
        .from(productVariants)
        .where(and(eq(productVariants.productId, sourceInv.productId), eq(productVariants.isActive, true)))
        .limit(1);
      if (activeVariantRows.length > 0) {
        throw new Error('SOURCE_INVENTORY_VARIANT_REQUIRED: Este produto tem variantes ativas — selecione o estoque de uma variante específica, nunca o estoque agregado do produto.');
      }
    }

    // F/G/H/I. fulfillment location precisa existir, estar ativa, e ser do
    // tipo STORE (nunca um HUB nem uma location "solta").
    if (!sourceInv.fulfillmentLocationId) {
      throw new Error('SOURCE_INVENTORY_LOCATION_MISSING: Este estoque ainda não tem uma origem física configurada — defina a origem operacional da loja antes de transferir.');
    }
    const [floc] = await tx.select().from(fulfillmentLocations).where(eq(fulfillmentLocations.id, sourceInv.fulfillmentLocationId)).limit(1);
    if (!floc) {
      throw new Error('SOURCE_INVENTORY_LOCATION_NOT_FOUND: Origem física deste estoque não encontrada.');
    }
    if (!floc.isActive) {
      throw new Error('SOURCE_INVENTORY_LOCATION_INACTIVE: A origem física deste estoque está inativa.');
    }
    if (floc.locationType !== 'STORE' || !floc.storeId) {
      throw new Error('SOURCE_INVENTORY_LOCATION_INVALID: A origem deste estoque não é uma loja válida.');
    }

    // J/K. store precisa existir, pertencer ao MESMO seller autenticado, e
    // estar ativa — nunca a "primeira loja do seller", sempre A loja real
    // desta inventory específica (essencial agora que suportamos multi-store).
    const [store] = await tx.select().from(stores).where(eq(stores.id, floc.storeId)).limit(1);
    if (!store) {
      throw new Error('SOURCE_STORE_NOT_FOUND: Loja de origem não encontrada.');
    }
    if (store.sellerId !== sellerId) {
      throw new Error('SOURCE_STORE_NOT_OWNED: Esta loja não pertence ao vendedor autenticado.');
    }
    if (store.status !== 'active') {
      throw new Error('SOURCE_STORE_INACTIVE: A loja de origem não está ativa.');
    }

    // Endereço operacional REAL da store de origem — única fonte
    // autoritativa do snapshot de coleta (D16-E4). Nunca aceita nada vindo
    // do frontend para decidir isso.
    let operationalAddress: any = null;
    if (store.operationalAddressId) {
      const [addr] = await tx.select().from(addresses).where(eq(addresses.id, store.operationalAddressId)).limit(1);
      operationalAddress = addr || null;
    }

    if (mode === 'NUSALI_PICKUP') {
      if (!operationalAddress || !operationalAddress.street || !operationalAddress.city || !operationalAddress.countryCode || !operationalAddress.phone) {
        throw new Error('PICKUP_LOCATION_INCOMPLETE: Configure o endereço operacional completo desta loja (rua, cidade, país e telefone) antes de solicitar a coleta pela Nusali.');
      }
    }

    // Estoque disponível da linha EXATA escolhida — nunca agregado do
    // produto, nunca de outra variante/loja. Transferências pendentes
    // filtradas por ESTE MESMO fromInventoryId (mesma semântica de sempre),
    // lidas DENTRO da mesma transação/lock (nunca uma leitura "solta" que
    // outra requisição concorrente poderia invalidar depois).
    const activePendingTransfers = await tx
      .select({ qty: inventoryTransfers.quantity })
      .from(inventoryTransfers)
      .where(
        and(
          eq(inventoryTransfers.fromInventoryId, sourceInv.id),
          or(eq(inventoryTransfers.status, 'PENDING'), eq(inventoryTransfers.status, 'IN_TRANSIT'))
        )
      );

    const pendingTransferQuantity = activePendingTransfers.reduce(
      (sum: number, t: any) => sum + (Number(t.qty) || 0),
      0
    );

    const availableForTransfer = Math.max(
      0,
      sourceInv.quantityOnHand - sourceInv.quantityReserved - pendingTransferQuantity
    );

    if (availableForTransfer < qtyToTransfer) {
      throw new Error(
        `INSUFFICIENT_STOCK: Estoque disponível para transferência insuficiente (Em estoque: ${sourceInv.quantityOnHand}, Reservado pedidos: ${sourceInv.quantityReserved}, Transferências pendentes: ${pendingTransferQuantity}, Livre: ${availableForTransfer}, Solicitado: ${qtyToTransfer}).`
      );
    }

    // Verify destination warehouse — D16-E3 preservado, nada mudado aqui.
    const [wh] = await tx.select().from(warehouses).where(eq(warehouses.id, toWarehouseId)).limit(1);
    if (!wh) throw new Error(`WAREHOUSE_NOT_FOUND: Armazém/HUB "${toWarehouseId}" não encontrado.`);

    const transferId = `trf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const trackingCode = `NUS-TRF-${Date.now().toString().slice(-6)}`;

    const pickupSnapshotJson = mode === 'NUSALI_PICKUP'
      ? {
          storeName: store.name,
          contactName: null,
          phone: operationalAddress.phone,
          address: `${operationalAddress.street}, ${operationalAddress.number || 'S/N'}${operationalAddress.complement ? ' - ' + operationalAddress.complement : ''}${operationalAddress.neighborhood ? ', ' + operationalAddress.neighborhood : ''}`.trim(),
          city: operationalAddress.city,
          region: operationalAddress.state || null,
          countryCode: operationalAddress.countryCode,
        }
      : null;

    await tx.insert(inventoryTransfers).values({
      id: transferId,
      sellerId,
      // productId/variantId SEMPRE derivados da inventory real — nunca de
      // um valor comercial enviado pelo navegador.
      productId: sourceInv.productId,
      variantId: sourceInv.variantId || null,
      fromLocationType: 'SELLER_LOCATION',
      fromInventoryId: sourceInv.id,
      toWarehouseId: wh.id,
      quantity: qtyToTransfer,
      status: 'PENDING',
      deliveryMode: mode,
      pickupSnapshotJson,
      trackingCode,
      createdAt: new Date(),
    });

    return {
      transferId,
      trackingCode,
      quantity: qtyToTransfer,
      toWarehouseName: wh.name,
      status: 'PENDING',
    };
    });
  }

  /**
   * Cancels a PENDING or IN_TRANSIT transfer request.
   * Immediately releases committed pending transfer stock.
   */
  static async cancelTransferToHub(transferId: string, actingId: string, isSeller: boolean = false) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível.');

    const [trf] = await db.select().from(inventoryTransfers).where(eq(inventoryTransfers.id, transferId)).limit(1);
    if (!trf) throw new Error(`Transferência ${transferId} não encontrada.`);

    if (trf.status === 'RECEIVED') {
      throw new Error('Transferências já recebidas no HUB não podem ser canceladas.');
    }
    if (trf.status === 'CANCELLED') {
      return { success: true, message: 'Transferência já estava cancelada.' };
    }

    if (isSeller && trf.sellerId !== actingId) {
      throw new Error('FORBIDDEN: Você não tem permissão para cancelar esta transferência.');
    }

    await db
      .update(inventoryTransfers)
      .set({
        status: 'CANCELLED',
      })
      .where(eq(inventoryTransfers.id, trf.id));

    return {
      success: true,
      message: `Transferência ${trf.trackingCode || trf.id} cancelada com sucesso.`,
    };
  }

  /**
   * Marks a transfer as IN_TRANSIT. Only allowed from PENDING status.
   * Does NOT move physical stock.
   */
  static async markTransferInTransit(transferId: string, adminUserId: string) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível.');

    const [trf] = await db.select().from(inventoryTransfers).where(eq(inventoryTransfers.id, transferId)).limit(1);
    if (!trf) throw new Error(`Transferência ${transferId} não encontrada.`);

    if (trf.status !== 'PENDING') {
      throw new Error(`Apenas transferências com status "PENDING" podem ser marcadas como em trânsito (Status atual: ${trf.status}).`);
    }

    await db
      .update(inventoryTransfers)
      .set({
        status: 'IN_TRANSIT',
      })
      .where(eq(inventoryTransfers.id, trf.id));

    return {
      success: true,
      message: `Transferência ${trf.trackingCode || trf.id} marcada como em trânsito com sucesso.`,
    };
  }

  /**
   * Confirms receipt of a stock transfer by Admin/Hub staff, moving stock from seller location to Nusali HUB location.
   */
  static async confirmHubTransfer(transferId: string, adminUserId: string) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível.');

    return await db.transaction(async (tx: any) => {
      const [trf] = await tx.select().from(inventoryTransfers).where(eq(inventoryTransfers.id, transferId)).limit(1);
      if (!trf) throw new Error(`Transferência ${transferId} não encontrada.`);

      if (trf.status === 'RECEIVED') {
        throw new Error('Esta transferência já foi recebida e processada anteriormente.');
      }
      if (trf.status === 'CANCELLED') {
        throw new Error('Esta transferência foi cancelada e não pode ser recebida.');
      }

      // Find seller inventory
      const [sellerInv] = await tx
        .select()
        .from(inventory)
        .where(eq(inventory.id, trf.fromInventoryId))
        .limit(1);

      if (!sellerInv || (sellerInv.quantityOnHand - sellerInv.quantityReserved) < trf.quantity) {
        throw new Error('Estoque no estabelecimento de origem insuficiente para registrar o recebimento.');
      }

      // 1. Deduct quantity from seller location
      const newSellerOnHand = sellerInv.quantityOnHand - trf.quantity;
      await tx
        .update(inventory)
        .set({
          quantityOnHand: newSellerOnHand,
          updatedAt: new Date(),
        })
        .where(eq(inventory.id, sellerInv.id));

      // Record TRANSFER_OUT movement for seller
      await tx.insert(inventoryMovements).values({
        id: `mov_${Date.now()}_out_${Math.random().toString(36).substring(2, 5)}`,
        inventoryId: sellerInv.id,
        warehouseId: null,
        productId: trf.productId,
        variantId: trf.variantId,
        type: 'TRANSFER_OUT',
        quantity: -trf.quantity,
        reason: `Envio para HUB ${trf.toWarehouseId} (Transferência ${trf.trackingCode || trf.id})`,
        performedBy: adminUserId,
        createdAt: new Date(),
      });

      // 2. Find or create HUB inventory
      const hubConditions = [
        eq(inventory.productId, trf.productId),
        eq(inventory.locationType, 'NUSALI_HUB'),
        eq(inventory.warehouseId, trf.toWarehouseId),
      ];
      if (trf.variantId) {
        hubConditions.push(eq(inventory.variantId, trf.variantId));
      }

      let [hubInv] = await tx.select().from(inventory).where(and(...hubConditions)).limit(1);

      let targetHubInvId = hubInv?.id;
      if (!hubInv) {
        // FASE D16-E3 — inventory HUB NOVO recebe a origem física real
        // (fulfillment_locations do warehouse de destino), mesmo princípio
        // já aplicado a SELLER_LOCATION em D16-E2. Nunca faz backfill de uma
        // linha HUB já existente (ver seção 8 do enunciado) — só a criação
        // de uma linha nova participa disso, dentro da MESMA transação.
        const fulfillmentLocation = await ensureWarehouseFulfillmentLocation(trf.toWarehouseId, tx);
        targetHubInvId = `inv_hub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        await tx.insert(inventory).values({
          id: targetHubInvId,
          locationType: 'NUSALI_HUB',
          sellerId: trf.sellerId,
          warehouseId: trf.toWarehouseId,
          productId: trf.productId,
          variantId: trf.variantId || null,
          quantityOnHand: trf.quantity,
          quantityReserved: 0,
          minimumStockLevel: 0,
          fulfillmentLocationId: fulfillmentLocation?.id || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } else {
        await tx
          .update(inventory)
          .set({
            quantityOnHand: hubInv.quantityOnHand + trf.quantity,
            updatedAt: new Date(),
          })
          .where(eq(inventory.id, hubInv.id));
      }

      // Record TRANSFER_IN movement for HUB
      await tx.insert(inventoryMovements).values({
        id: `mov_${Date.now()}_in_${Math.random().toString(36).substring(2, 5)}`,
        inventoryId: targetHubInvId,
        warehouseId: trf.toWarehouseId,
        productId: trf.productId,
        variantId: trf.variantId,
        type: 'TRANSFER_IN',
        quantity: trf.quantity,
        reason: `Recebimento no HUB ${trf.toWarehouseId} (Transferência ${trf.trackingCode || trf.id})`,
        performedBy: adminUserId,
        createdAt: new Date(),
      });

      // 3. Mark transfer RECEIVED
      await tx
        .update(inventoryTransfers)
        .set({
          status: 'RECEIVED',
          receivedAt: new Date(),
        })
        .where(eq(inventoryTransfers.id, trf.id));

      // 4. Sync product stock summary
      await InventoryService.syncProductStockSummary(trf.productId, tx);

      logger.info({ transferId: trf.id, productId: trf.productId, quantity: trf.quantity }, 'Hub stock transfer confirmed');
      return true;
    });
  }

  /**
   * Releases active stock reservations for an order.
   */
  static async releaseStock(orderId: string, executor?: any) {
    const db = executor || getDb();
    if (!db) return;

    const reservations = await db
      .select()
      .from(stockReservations)
      .where(and(eq(stockReservations.orderId, orderId), eq(stockReservations.status, 'active')));

    for (const res of reservations) {
      if (res.inventoryId) {
        await db
          .update(inventory)
          .set({
            quantityReserved: sql`GREATEST(0, ${inventory.quantityReserved} - ${res.quantity})`,
            updatedAt: new Date(),
          })
          .where(eq(inventory.id, res.inventoryId));
      }

      await db.update(stockReservations).set({ status: 'released' }).where(eq(stockReservations.id, res.id));

      await db.insert(inventoryMovements).values({
        id: `mov_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        inventoryId: res.inventoryId || null,
        warehouseId: res.warehouseId || null,
        productId: res.productId,
        variantId: res.variantId || null,
        type: 'RELEASE',
        quantity: res.quantity,
        reason: `Cancelamento/Estorno do pedido ${orderId}`,
        createdAt: new Date(),
      });

      await InventoryService.syncProductStockSummary(res.productId, db);
    }
  }
}
