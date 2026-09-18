import { getDb } from '../../../db/index.js';
import {
  inventory, inventoryMovements, stockReservations, products, warehouses, inventoryTransfers, sellers,
  productVariants, fulfillmentLocations, stores, addresses,
} from '../../../db/schema.js';
import { eq, and, sql, desc, or, isNull } from 'drizzle-orm';
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
   * FASE D16-E6.1 — cancelamento só é permitido a partir de PENDING (a
   * mercadoria nunca saiu fisicamente da loja nesse estado — o decremento
   * físico só acontece em markTransferInTransit). A partir de IN_TRANSIT a
   * retirada física já ocorreu (onHand já decrementado), então cancelar
   * deixaria de existir um caminho de devolução nesta fase — bloqueado
   * explicitamente em vez de silenciosamente "esquecer" estoque que já
   * saiu. RECEIVED continua terminal (like antes). CANCELLED é idempotente
   * (repetir a chamada não é um erro).
   *
   * Lock (`.for('update')`) na linha da transferência: sem ele, uma
   * corrida real existiria contra markTransferInTransit/confirmHubTransfer
   * concorrentes (ex.: cancelar exatamente no instante em que a retirada
   * física é confirmada) — a leitura "solta" antiga poderia ver PENDING e
   * marcar CANCELLED depois que o estoque já tinha sido fisicamente
   * decrementado por outra transação, perdendo a rastreabilidade daquele
   * estoque. Com o lock, as duas transações serializam pela MESMA linha.
   */
  static async cancelTransferToHub(transferId: string, actingId: string, isSeller: boolean = false) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível.');

    return await db.transaction(async (tx: any) => {
      const [trf] = await tx.select().from(inventoryTransfers).where(eq(inventoryTransfers.id, transferId)).for('update').limit(1);
      if (!trf) throw new Error(`Transferência ${transferId} não encontrada.`);

      if (trf.status === 'RECEIVED') {
        throw new Error('CANNOT_CANCEL_RECEIVED: Transferências já recebidas no HUB não podem ser canceladas.');
      }
      if (trf.status === 'CANCELLED') {
        return { success: true, message: 'Transferência já estava cancelada.' };
      }
      if (trf.status === 'IN_TRANSIT') {
        throw new Error('CANNOT_CANCEL_IN_TRANSIT: A mercadoria já saiu fisicamente da loja (em trânsito) — não é possível cancelar nesta etapa.');
      }

      if (isSeller && trf.sellerId !== actingId) {
        throw new Error('FORBIDDEN: Você não tem permissão para cancelar esta transferência.');
      }

      // Só chega aqui se status === 'PENDING' — produto nunca saiu
      // fisicamente da loja, nenhuma mutação de inventory é necessária.
      await tx
        .update(inventoryTransfers)
        .set({
          status: 'CANCELLED',
        })
        .where(eq(inventoryTransfers.id, trf.id));

      return {
        success: true,
        message: `Transferência ${trf.trackingCode || trf.id} cancelada com sucesso.`,
      };
    });
  }

  /**
   * FASE D16-E6.1 — PENDING -> IN_TRANSIT agora representa a RETIRADA
   * FÍSICA real (antes era um rótulo sem efeito de estoque). Decrementa
   * fromInventory.quantityOnHand EXATAMENTE trf.quantity, dentro de uma
   * única transação com lock de linha (mesmo padrão `.for('update')` já
   * usado em requestTransferToHub) tanto na transferência quanto na
   * inventory de origem — nunca lidas "soltas" fora da tx.
   *
   * Idempotência: se a transferência já está IN_TRANSIT (ex.: duplo clique,
   * ou duas chamadas concorrentes), a segunda chamada NUNCA decrementa de
   * novo — o lock na linha da transferência serializa as duas, e a segunda
   * enxerga o status já atualizado assim que a primeira commita.
   *
   * Usa SEMPRE trf.fromInventoryId (nunca productId) para localizar a
   * origem exata — mesmo princípio de sourceInventoryId do D16-E5.
   */
  static async markTransferInTransit(transferId: string, adminUserId: string) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível.');

    return await db.transaction(async (tx: any) => {
      // A/B. localizar e travar a linha da transferência.
      const [trf] = await tx.select().from(inventoryTransfers).where(eq(inventoryTransfers.id, transferId)).for('update').limit(1);
      if (!trf) throw new Error(`Transferência ${transferId} não encontrada.`);

      // Idempotência — nunca decrementa duas vezes.
      if (trf.status === 'IN_TRANSIT') {
        return {
          success: true,
          message: `Transferência ${trf.trackingCode || trf.id} já estava em trânsito.`,
          alreadyInTransit: true,
        };
      }
      if (trf.status === 'RECEIVED') {
        throw new Error('CANNOT_MARK_IN_TRANSIT_RECEIVED: Esta transferência já foi recebida no HUB.');
      }
      if (trf.status === 'CANCELLED') {
        throw new Error('CANNOT_MARK_IN_TRANSIT_CANCELLED: Esta transferência foi cancelada.');
      }
      if (trf.status !== 'PENDING') {
        throw new Error(`Apenas transferências com status "PENDING" podem ser marcadas como em trânsito (Status atual: ${trf.status}).`);
      }

      // D/E. localizar e travar a inventory de origem EXATA (nunca por
      // productId — sempre trf.fromInventoryId).
      if (!trf.fromInventoryId) {
        throw new Error('TRANSFER_SOURCE_MISSING: Esta transferência não tem uma origem de estoque válida.');
      }
      const [sourceInv] = await tx.select().from(inventory).where(eq(inventory.id, trf.fromInventoryId)).for('update').limit(1);
      if (!sourceInv) {
        throw new Error('SOURCE_INVENTORY_NOT_FOUND: Estoque de origem desta transferência não foi encontrado.');
      }

      // F. defesa em profundidade — mesmas invariantes já validadas na
      // solicitação (D16-E5), revalidadas aqui porque o tempo passou entre
      // PENDING e a retirada física.
      if (sourceInv.sellerId !== trf.sellerId) {
        throw new Error('SOURCE_INVENTORY_OWNER_MISMATCH: A origem desta transferência não pertence mais ao vendedor esperado.');
      }
      if (sourceInv.productId !== trf.productId) {
        throw new Error('SOURCE_INVENTORY_PRODUCT_MISMATCH: A origem desta transferência não corresponde mais ao produto esperado.');
      }
      const sameVariant = trf.variantId ? sourceInv.variantId === trf.variantId : !sourceInv.variantId;
      if (!sameVariant) {
        throw new Error('SOURCE_INVENTORY_VARIANT_MISMATCH: A origem desta transferência não corresponde mais à variante esperada.');
      }
      if (sourceInv.locationType !== 'SELLER_LOCATION') {
        throw new Error('SOURCE_INVENTORY_INVALID_LOCATION: A origem desta transferência não é mais uma localização de loja válida.');
      }

      // G. disponibilidade física suficiente para a retirada.
      if ((sourceInv.quantityOnHand - sourceInv.quantityReserved) < trf.quantity) {
        throw new Error(
          `INSUFFICIENT_STOCK: Estoque físico insuficiente na origem para confirmar a retirada (Em estoque: ${sourceInv.quantityOnHand}, Reservado: ${sourceInv.quantityReserved}, Necessário: ${trf.quantity}).`
        );
      }

      // H. decrementa EXATAMENTE trf.quantity — a mercadoria saiu fisicamente da loja.
      await tx
        .update(inventory)
        .set({
          quantityOnHand: sourceInv.quantityOnHand - trf.quantity,
          updatedAt: new Date(),
        })
        .where(eq(inventory.id, sourceInv.id));

      await tx.insert(inventoryMovements).values({
        id: `mov_${Date.now()}_pickup_${Math.random().toString(36).substring(2, 5)}`,
        inventoryId: sourceInv.id,
        warehouseId: null,
        productId: trf.productId,
        variantId: trf.variantId,
        type: 'TRANSFER_OUT',
        quantity: -trf.quantity,
        reason: `Retirada física confirmada para HUB ${trf.toWarehouseId} (Transferência ${trf.trackingCode || trf.id})`,
        performedBy: adminUserId,
        createdAt: new Date(),
      });

      // I. status -> IN_TRANSIT.
      await tx
        .update(inventoryTransfers)
        .set({
          status: 'IN_TRANSIT',
        })
        .where(eq(inventoryTransfers.id, trf.id));

      await InventoryService.syncProductStockSummary(trf.productId, tx);

      return {
        success: true,
        message: `Transferência ${trf.trackingCode || trf.id} marcada como em trânsito — retirada física confirmada.`,
      };
    });
  }

  /**
   * FASE D16-E6.1 — RECEIVED não decrementa mais a loja: a retirada física
   * (decremento de fromInventory.quantityOnHand) já aconteceu em
   * markTransferInTransit (PENDING -> IN_TRANSIT). Esta função agora só
   * incrementa o HUB e marca RECEIVED — exige IN_TRANSIT explicitamente
   * (nunca aceita PENDING diretamente, que pularia a retirada física).
   *
   * Lock (`.for('update')`) na transferência E na linha HUB (existente ou
   * "nenhuma encontrada" — nesse caso não há linha para travar, mas a
   * trava na transferência já serializa duas chamadas concorrentes para o
   * MESMO transferId): sem isso, duas confirmações concorrentes da MESMA
   * transferência poderiam ambas ler status != RECEIVED antes de qualquer
   * commit e ambas incrementarem o HUB — com o lock, a segunda só lê a
   * linha depois que a primeira commitar, vendo RECEIVED e sendo rejeitada.
   */
  static async confirmHubTransfer(transferId: string, adminUserId: string) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível.');

    return await db.transaction(async (tx: any) => {
      // B. lock da transferência.
      const [trf] = await tx.select().from(inventoryTransfers).where(eq(inventoryTransfers.id, transferId)).for('update').limit(1);
      if (!trf) throw new Error(`Transferência ${transferId} não encontrada.`);

      if (trf.status === 'RECEIVED') {
        throw new Error('CANNOT_RECEIVE_ALREADY_RECEIVED: Esta transferência já foi recebida e processada anteriormente.');
      }
      if (trf.status === 'CANCELLED') {
        throw new Error('CANNOT_RECEIVE_CANCELLED: Esta transferência foi cancelada e não pode ser recebida.');
      }
      // C/D. exige IN_TRANSIT explicitamente — nunca aceita PENDING direto
      // (pular a retirada física deixaria a loja com onHand nunca
      // decrementado, mesmo com estoque já contabilizado no HUB).
      if (trf.status !== 'IN_TRANSIT') {
        throw new Error(`CANNOT_RECEIVE_NOT_IN_TRANSIT: Só é possível confirmar recebimento de transferências em trânsito (Status atual: ${trf.status}). Confirme a retirada física primeiro.`);
      }

      // F. HUB de destino — ownership explícito (produto + variante + seller
      // + warehouse + locationType), nunca dependendo apenas da invariância
      // indireta de productId ser único por seller.
      const hubConditions = [
        eq(inventory.productId, trf.productId),
        eq(inventory.locationType, 'NUSALI_HUB'),
        eq(inventory.warehouseId, trf.toWarehouseId),
        eq(inventory.sellerId, trf.sellerId),
      ];
      hubConditions.push(trf.variantId ? eq(inventory.variantId, trf.variantId) : isNull(inventory.variantId));

      // Lock da linha HUB existente (se houver) ANTES do read-modify-write —
      // impede duas transferências diferentes para o MESMO produto/variante/
      // warehouse/seller de perderem incremento uma da outra.
      let [hubInv] = await tx.select().from(inventory).where(and(...hubConditions)).for('update').limit(1);

      // Origem física correta do HUB (fulfillment_locations do warehouse de
      // destino) — resolvida sempre, mas só aplicada à linha efetivamente
      // usada/criada por ESTA transferência, nunca um backfill global de
      // inventories históricas não relacionadas.
      const fulfillmentLocation = await ensureWarehouseFulfillmentLocation(trf.toWarehouseId, tx);

      let targetHubInvId = hubInv?.id;
      if (!hubInv) {
        // FASE D16-E3 — inventory HUB NOVO recebe a origem física real.
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
            // Corrige a fulfillmentLocationId da linha TOCADA por esta
            // transferência quando ainda ausente/divergente — nunca um
            // backfill de outras linhas HUB não relacionadas.
            fulfillmentLocationId: fulfillmentLocation?.id || hubInv.fulfillmentLocationId || null,
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

      // G. Mark transfer RECEIVED
      await tx
        .update(inventoryTransfers)
        .set({
          status: 'RECEIVED',
          receivedAt: new Date(),
        })
        .where(eq(inventoryTransfers.id, trf.id));

      // Sync product stock summary (HUB mudou; loja já tinha sido
      // sincronizada em markTransferInTransit).
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
