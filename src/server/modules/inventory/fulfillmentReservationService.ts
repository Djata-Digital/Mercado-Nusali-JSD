/**
 * FASE D16-F5 — primitiva TRANSACIONAL de reserva de estoque para UMA
 * inventory/fulfillment origin já identificada (por F4 ou qualquer outro
 * caller que já saiba EXATAMENTE qual inventoryId quer reservar).
 *
 * AUDITORIA DO MECANISMO ATUAL (antes de implementar, sem alteração):
 *   - `inventory.quantityReserved` é incrementado hoje em DOIS lugares:
 *     (1) orderService.ts (createOrderFromCart, checkout legado) — insere
 *         stock_reservations + `UPDATE inventory SET quantityReserved =
 *         quantityReserved + qty` via expressão SQL atômica, MAS SEM
 *         `.for('update')` antes — a DECISÃO de disponibilidade
 *         (`totalAvail < reqQty`) é feita sobre uma leitura solta (achado
 *         já reportado em D16-F1: risco real de oversell sob concorrência).
 *     (2) InventoryService.releaseStock (cancelamento) — decrementa via
 *         `GREATEST(0, quantityReserved - qty)`, marca a reservation como
 *         'released'. Não é reserva, é liberação — fora do escopo de F5.
 *   - `stock_reservations` é o ledger real: id, orderId (NOT NULL, FK ->
 *     orders.id ON DELETE CASCADE), productId, variantId, inventoryId,
 *     warehouseId, fulfillmentMode, quantity, expiresAt, status
 *     ('active'|'confirmed'|'released'|'expired'), createdAt. NENHUM índice
 *     único existe hoje (só índices de consulta em orderId e
 *     (expiresAt,status)) — reaproveitado integralmente, nenhuma tabela nova.
 *   - ACHADO CRÍTICO (documentado, não é bug — é uma restrição estrutural
 *     real do schema ATUAL, respeitada aqui em vez de contornada): como
 *     `stock_reservations.orderId` é NOT NULL + FK real para `orders.id`,
 *     esta primitiva EXIGE um `orderId` de um pedido JÁ EXISTENTE como
 *     input — nunca inventa/cria um pedido (isso pertenceria a F6, que vai
 *     compor "criar order" + "reservar" na MESMA transação, na ordem
 *     order-primeiro). F5 nunca cria orders.
 *   - Lock: `InventoryService.requestTransferToHub` (D16-E5) e
 *     `markTransferInTransit` (D16-E6.1) JÁ usam `.for('update')` na MESMA
 *     linha `inventory` antes de decidir/mutar — nenhum advisory lock, nenhum
 *     lock financeiro, nenhum CAS separado além do lock de linha + a própria
 *     expressão SQL atômica do UPDATE.
 *   - Checkout atual (orderService.ts) chama isso INLINE dentro de
 *     `createOrderFromCart` — nunca via uma função reutilizável. F5 não
 *     altera esse caminho (protegido nesta fase).
 *
 * NOTA DE CONCORRÊNCIA (pending transfer vs. reserva, seção 6 do
 * enunciado): `requestTransferToHub` e `markTransferInTransit` (D16-E5/
 * D16-E6.1) TAMBÉM travam a MESMA linha `inventory.id` via `.for('update')`
 * antes de ler/mutar. Como `reserveFulfillmentInventory` trava a MESMA
 * linha exata pelo MESMO mecanismo, as duas operações NUNCA correm em
 * paralelo sobre a mesma inventory — o Postgres serializa naturalmente
 * (quem pega o lock primeiro só libera no commit/rollback). Nenhuma
 * coordenação adicional foi necessária ou foi criada.
 *
 * `inventory` continua ÚNICA autoridade física — nunca
 * `product_variants.stock`. Nenhuma tabela nova. Nenhuma migration.
 *
 * NÃO decide melhor origem (isso é F4). NÃO calcula frete (F3). NÃO chama
 * PSP/payment/escrow. NÃO cria order. Recebe a inventory/location exata que
 * deve TENTAR reservar — se a disponibilidade real (sob lock) não permitir,
 * falha limpo; nunca escolhe silenciosamente outra origem.
 */
import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '../../../db/index.js';
import {
  inventory, inventoryTransfers, inventoryMovements, stockReservations,
  fulfillmentLocations, stores, warehouses,
} from '../../../db/schema.js';

export interface ReserveFulfillmentInventoryInput {
  /**
   * Pedido JÁ EXISTENTE (orders.id real) — stock_reservations.orderId é
   * NOT NULL/FK, nunca inventado aqui. F6 cria o order PRIMEIRO (mesma
   * transação) e passa o id real para esta função.
   */
  orderId: string;
  sellerId: string;
  productId: string;
  variantId?: string | null;
  inventoryId: string;
  fulfillmentLocationId: string;
  quantity: number;
  /** Minutos até a reserva expirar — default 30 (mesmo valor já usado em orderService.ts). */
  expiresInMinutes?: number;
}

export interface ReserveFulfillmentInventoryOk {
  ok: true;
  reservationId: string;
  /** true = já existia uma reserva idêntica (orderId+inventoryId) — nada foi incrementado de novo (idempotente). */
  alreadyReserved: boolean;
  inventoryId: string;
  quantityReserved: number;
  availableQuantityAfter: number;
}
export interface ReserveFulfillmentInventoryFail {
  ok: false;
  code: string;
  message: string;
}
export type ReserveFulfillmentInventoryResult = ReserveFulfillmentInventoryOk | ReserveFulfillmentInventoryFail;

/**
 * Reserva atomicamente `quantity` unidades de UMA inventory row exata.
 *
 * TRANSACTION BOUNDARY (seção 4 do enunciado):
 *   - Sem `executor`: abre sua PRÓPRIA `db.transaction()` — chamada
 *     standalone segura.
 *   - Com `executor` (uma `tx` de um `db.transaction()` externo, ex.: F6
 *     compondo order+reserva+snapshot): reaproveita o MESMO executor
 *     diretamente, NUNCA abre uma transaction aninhada.
 *
 * IDEMPOTÊNCIA (seção 11): não há índice único no schema para
 * (orderId, inventoryId) — nenhuma migration foi criada para isso nesta
 * fase (protegido). A idempotência é feita em nível de aplicação, DENTRO do
 * lock da inventory: se já existe uma stock_reservation ATIVA para este
 * MESMO (orderId, inventoryId), a chamada é um no-op seguro (nunca
 * incrementa quantityReserved de novo) — SEGURA sob concorrência porque a
 * checagem acontece depois do `.for('update')` na mesma linha, então duas
 * chamadas concorrentes para o MESMO (orderId, inventoryId) serializam pelo
 * lock, nunca correm em paralelo. Uma quantidade DIFERENTE da reserva já
 * existente é tratada como inconsistência do chamador (RESERVATION_QUANTITY_MISMATCH),
 * nunca silenciosamente sobrescrita.
 */
export async function reserveFulfillmentInventory(
  input: ReserveFulfillmentInventoryInput,
  executor?: any
): Promise<ReserveFulfillmentInventoryResult> {
  const run = async (tx: any): Promise<ReserveFulfillmentInventoryResult> => {
    // 1. Quantidade — inteiro > 0, fail closed para qualquer outro caso
    // (zero, negativo, decimal, NaN, undefined).
    const quantity = input.quantity;
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { ok: false, code: 'QUANTITY_INVALID', message: 'quantity deve ser um número inteiro maior que zero.' };
    }
    if (!input.orderId) return { ok: false, code: 'ORDER_ID_REQUIRED', message: 'orderId (de um pedido já existente) é obrigatório.' };
    if (!input.inventoryId) return { ok: false, code: 'INVENTORY_ID_REQUIRED', message: 'inventoryId é obrigatório.' };

    // 2. LOCK exato — só a linha desta inventoryId, nunca lock global nem
    // de todas as inventories do seller.
    const [inv] = await tx.select().from(inventory).where(eq(inventory.id, input.inventoryId)).for('update').limit(1);
    if (!inv) {
      return { ok: false, code: 'INVENTORY_NOT_FOUND', message: `Inventory "${input.inventoryId}" não encontrada.` };
    }

    // 3. Revalidação — NUNCA confia no que o F4 observou antes; revalida
    // tudo contra a linha REAL, sob lock.
    if (inv.sellerId !== input.sellerId) {
      return { ok: false, code: 'SELLER_MISMATCH', message: 'Esta inventory não pertence ao seller informado.' };
    }
    if (inv.productId !== input.productId) {
      return { ok: false, code: 'PRODUCT_MISMATCH', message: 'Esta inventory não corresponde ao productId informado.' };
    }
    const expectedVariantId = input.variantId || null;
    if ((inv.variantId || null) !== expectedVariantId) {
      return { ok: false, code: 'VARIANT_MISMATCH', message: 'Esta inventory não corresponde ao variantId informado.' };
    }
    if (inv.fulfillmentLocationId !== input.fulfillmentLocationId) {
      return { ok: false, code: 'FULFILLMENT_LOCATION_MISMATCH', message: 'fulfillmentLocationId informado não corresponde ao da inventory (nunca é aceita uma origem diferente da que foi travada).' };
    }

    // 4. Fulfillment location — mesma validação (intencionalmente
    // duplicada, nunca importada de fulfillmentCandidateResolverService.ts,
    // que é ARQUIVO PROTEGIDO nesta fase) de F4: existe, ativa, e
    // ownership/operacionalidade coerente com STORE ou NUSALI_WAREHOUSE.
    const [floc] = await tx.select().from(fulfillmentLocations).where(eq(fulfillmentLocations.id, input.fulfillmentLocationId)).limit(1);
    if (!floc) {
      return { ok: false, code: 'FULFILLMENT_LOCATION_NOT_FOUND', message: 'A fulfillment location informada não foi encontrada.' };
    }
    if (floc.isActive === false) {
      return { ok: false, code: 'FULFILLMENT_LOCATION_INACTIVE', message: `A fulfillment location "${floc.name}" está inativa.` };
    }
    if (inv.locationType === 'SELLER_LOCATION') {
      if (floc.locationType !== 'STORE' || !floc.storeId || floc.sellerId !== input.sellerId) {
        return { ok: false, code: 'LOCATION_OWNERSHIP_MISMATCH', message: 'A fulfillment location não é uma STORE válida deste seller.' };
      }
      const [store] = await tx.select().from(stores).where(eq(stores.id, floc.storeId)).limit(1);
      if (!store || store.sellerId !== input.sellerId) {
        return { ok: false, code: 'LOCATION_OWNERSHIP_MISMATCH', message: 'A loja desta fulfillment location não pertence ao seller informado.' };
      }
      if (store.status !== 'active') {
        return { ok: false, code: 'STORE_INACTIVE', message: `A loja "${store.name}" não está ativa (status: ${store.status}).` };
      }
    } else if (inv.locationType === 'NUSALI_HUB') {
      if (floc.locationType !== 'NUSALI_WAREHOUSE' || !floc.warehouseId) {
        return { ok: false, code: 'LOCATION_OWNERSHIP_MISMATCH', message: 'A fulfillment location não é um NUSALI_WAREHOUSE válido.' };
      }
      const [warehouse] = await tx.select().from(warehouses).where(eq(warehouses.id, floc.warehouseId)).limit(1);
      if (!warehouse) {
        return { ok: false, code: 'LOCATION_OWNERSHIP_MISMATCH', message: 'O armazém desta fulfillment location não foi encontrado.' };
      }
      if (warehouse.status !== 'active') {
        return { ok: false, code: 'WAREHOUSE_INACTIVE', message: `O armazém "${warehouse.name}" não está ativo/operacional (status: ${warehouse.status}).` };
      }
    } else {
      return { ok: false, code: 'LOCATION_OWNERSHIP_MISMATCH', message: `locationType "${inv.locationType}" desconhecido.` };
    }

    // 5. Idempotência — DENTRO do lock: mesma (orderId, inventoryId) já
    // reservada ATIVAMENTE? Nunca reserva de novo.
    const [existingReservation] = await tx
      .select()
      .from(stockReservations)
      .where(and(
        eq(stockReservations.orderId, input.orderId),
        eq(stockReservations.inventoryId, input.inventoryId),
        eq(stockReservations.status, 'active'),
      ))
      .limit(1);

    if (existingReservation) {
      if (existingReservation.quantity !== quantity) {
        return {
          ok: false,
          code: 'RESERVATION_QUANTITY_MISMATCH',
          message: `Já existe uma reserva ativa para este pedido+inventory com quantidade ${existingReservation.quantity}, diferente da solicitada agora (${quantity}). Nunca sobrescrita silenciosamente.`,
        };
      }
      const pendingNow = await sumPendingTransferQuantity(tx, input.inventoryId);
      const availableNow = Math.max(0, inv.quantityOnHand - inv.quantityReserved - pendingNow);
      return {
        ok: true,
        reservationId: existingReservation.id,
        alreadyReserved: true,
        inventoryId: inv.id,
        quantityReserved: inv.quantityReserved,
        availableQuantityAfter: availableNow,
      };
    }

    // 6. Disponibilidade REAL, recalculada AGORA, sob lock — nunca confia
    // na fotografia do F4. pendingTransferQuantity = só PENDING exato desta
    // inventoryId (D16-E6.1/E6.2) — IN_TRANSIT nunca subtraído de novo
    // (onHand já foi decrementado na retirada física).
    const pendingTransferQuantity = await sumPendingTransferQuantity(tx, input.inventoryId);
    const availableQuantity = Math.max(0, inv.quantityOnHand - inv.quantityReserved - pendingTransferQuantity);
    if (availableQuantity < quantity) {
      return {
        ok: false,
        code: 'INSUFFICIENT_AVAILABLE_STOCK',
        message: `Disponível ${availableQuantity}, solicitado ${quantity}.`,
      };
    }

    // 7. Atualização atômica — SOMENTE quantityReserved (nunca
    // quantityOnHand nesta etapa). A expressão SQL (`col + n`) é atômica
    // por si só; combinada com o `.for('update')` acima, fecha o mesmo tipo
    // de corrida documentado em D16-F1 para o checkout legado (que nunca
    // trava a linha antes de decidir).
    await tx.update(inventory).set({
      quantityReserved: sql`${inventory.quantityReserved} + ${quantity}`,
      updatedAt: new Date(),
    }).where(eq(inventory.id, inv.id));

    // 8. Ledger — MESMA transação/lock; se a criação falhar, o UPDATE acima
    // é desfeito junto (ROLLBACK da transação inteira, nunca um
    // quantityReserved órfão sem reservation correspondente).
    const reservationId = `sr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + (input.expiresInMinutes || 30));
    const fulfillmentMode = inv.locationType === 'NUSALI_HUB' ? 'NUSALI_FULFILLMENT' : 'SELLER_FULFILLMENT';

    await tx.insert(stockReservations).values({
      id: reservationId,
      orderId: input.orderId,
      productId: inv.productId,
      variantId: inv.variantId || null,
      inventoryId: inv.id,
      warehouseId: inv.warehouseId || null,
      fulfillmentMode,
      quantity,
      expiresAt,
      status: 'active',
      createdAt: new Date(),
    });

    // Mesmo padrão de auditoria já usado por TODO outro mutador de
    // inventory neste projeto (inventoryMovements) — nunca uma segunda
    // fonte de verdade de quantidade, só o registro do evento.
    await tx.insert(inventoryMovements).values({
      id: `mov_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      inventoryId: inv.id,
      warehouseId: inv.warehouseId || null,
      productId: inv.productId,
      variantId: inv.variantId || null,
      type: 'RESERVATION',
      quantity: -quantity,
      reason: `Reserva de fulfillment para o pedido ${input.orderId}`,
      referenceId: input.orderId,
      createdAt: new Date(),
    });

    return {
      ok: true,
      reservationId,
      alreadyReserved: false,
      inventoryId: inv.id,
      quantityReserved: inv.quantityReserved + quantity,
      availableQuantityAfter: availableQuantity - quantity,
    };
  };

  if (executor) {
    // B) executor externo (ex.: F6) — reaproveita DIRETAMENTE, nunca abre
    // uma transaction aninhada.
    return run(executor);
  }
  // A) sem executor — abre a PRÓPRIA transaction (chamada standalone).
  const db = getDb();
  if (!db) return { ok: false, code: 'FULFILLMENT_RESERVATION_DB_UNAVAILABLE', message: 'Banco de dados indisponível.' };
  return db.transaction(run);
}

async function sumPendingTransferQuantity(tx: any, inventoryId: string): Promise<number> {
  const rows = await tx
    .select({ qty: inventoryTransfers.quantity })
    .from(inventoryTransfers)
    .where(and(eq(inventoryTransfers.fromInventoryId, inventoryId), eq(inventoryTransfers.status, 'PENDING')));
  return rows.reduce((sum: number, r: any) => sum + (Number(r.qty) || 0), 0);
}
