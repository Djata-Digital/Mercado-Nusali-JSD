/**
 * EDIÇÃO DO ESTOQUE FÍSICO DE UMA VARIAÇÃO (SKU) PELO VENDEDOR — dentro da transação do salvamento do anúncio.
 *
 * Por que existe: `syncVariantsForProduct` nunca ajusta o estoque de uma variação JÁ cadastrada (decisão antiga: "fora de escopo"), o formulário
 * desativava o campo «Estoque» dessas variações e nenhuma outra tela edita a quantidade por variação — o vendedor não tinha como corrigir o estoque
 * de um SKU. Aqui o ajuste é feito com as mesmas garantias do resto do inventário:
 *   - `inventory` continua sendo a ÚNICA fonte de verdade; `product_variants.stock` nunca é escrito;
 *   - a linha SELLER_LOCATION da variação é travada (`FOR UPDATE`, o mesmo lock das reservas e transferências) antes de decidir;
 *   - o valor que o vendedor viu (`expectedOnHand`) tem de ser o atual: se uma venda/transferência mudou o físico enquanto editava, é recusado (409)
 *     e nada é gravado — nunca sobrescreve em silêncio;
 *   - o novo físico nunca fica abaixo do RESERVADO por pedidos em andamento nem das transferências PENDENTES para o HUB (pedidos e reservas
 *     existentes nunca são comprometidos);
 *   - cada ajuste gera um movimento ADJUSTMENT auditável (quem, quando, quanto) e o resumo `products.stock` é recalculado.
 * Só o estoque do PRÓPRIO vendedor (SELLER_LOCATION) é editável aqui; estoque em HUB pertence à operação do armazém.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { inventory, inventoryMovements, inventoryTransfers, productVariants } from '../../../db/schema.js';
import { InventoryService } from './inventoryService.js';

export const MAX_VARIANT_STOCK = 1_000_000;

export class VariantStockError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'VariantStockError';
  }
}

export interface VariantStockChange {
  variantId: string;
  /** novo estoque FÍSICO no local do vendedor */
  newOnHand: number;
  /** estoque físico que o vendedor viu ao abrir a edição (proteção contra alteração concorrente) */
  expectedOnHand: number;
}

export interface VariantStockSnapshot {
  variantId: string;
  /** físico no local do vendedor */
  onHand: number;
  /** reservado por pedidos em andamento */
  reserved: number;
  /** transferências PENDENTES para o HUB (ainda não retiradas) */
  pendingTransfer: number;
  /** menor valor de físico permitido = reservado + transferências pendentes */
  floor: number;
  /** disponível para venda neste local = físico − reservado − pendente */
  available: number;
  /** false quando há mais de um local do vendedor para o SKU (ambíguo) — o formulário mostra o valor, mas não deixa editar */
  editable: boolean;
}

const isIntInRange = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_VARIANT_STOCK;

/**
 * Extrai do payload `variants` APENAS os ajustes de estoque pedidos para variações já cadastradas: itens com `stockOnHand` e `expectedStockOnHand`.
 * Item sem `stockOnHand` não toca em estoque. Valor igual ao esperado = sem alteração (ignorado). Entrada inválida → erro 400 (nada é corrigido
 * em silêncio). Puro (sem banco).
 */
export function parseVariantStockChanges(variants: unknown): VariantStockChange[] {
  if (!Array.isArray(variants)) return [];
  const out: VariantStockChange[] = [];
  const seen = new Set<string>();
  for (const raw of variants) {
    if (!raw || typeof raw !== 'object') continue;
    const v = raw as Record<string, unknown>;
    if (v.stockOnHand === undefined || v.stockOnHand === null) continue;
    const id = typeof v.id === 'string' ? v.id.trim() : '';
    if (!id) throw new VariantStockError(400, 'VARIANT_STOCK_ID_REQUIRED', 'O ajuste de estoque precisa identificar a variação.');
    if (seen.has(id)) throw new VariantStockError(400, 'VARIANT_STOCK_DUPLICATE', 'A mesma variação aparece mais de uma vez no ajuste de estoque.');
    seen.add(id);
    if (!isIntInRange(v.stockOnHand)) {
      throw new VariantStockError(400, 'VARIANT_STOCK_INVALID', `Estoque inválido: informe um número inteiro entre 0 e ${MAX_VARIANT_STOCK.toLocaleString('pt-PT')}.`, { variantId: id });
    }
    if (!isIntInRange(v.expectedStockOnHand)) {
      throw new VariantStockError(400, 'VARIANT_STOCK_EXPECTED_REQUIRED', 'Faltou o estoque que você viu ao abrir a edição. Recarregue a página e tente de novo.', { variantId: id });
    }
    if (v.stockOnHand === v.expectedStockOnHand) continue;
    out.push({ variantId: id, newOnHand: v.stockOnHand, expectedOnHand: v.expectedStockOnHand });
  }
  return out;
}

async function pendingTransferQuantity(executor: any, inventoryId: string): Promise<number> {
  const rows = await executor
    .select({ qty: inventoryTransfers.quantity })
    .from(inventoryTransfers)
    .where(and(eq(inventoryTransfers.fromInventoryId, inventoryId), eq(inventoryTransfers.status, 'PENDING')));
  return rows.reduce((s: number, r: any) => s + (Number(r.qty) || 0), 0);
}

/** Leitura (sem travar) do estoque FÍSICO do vendedor por variação, para o formulário de edição. */
export async function loadVariantStockSnapshots(executor: any, sellerId: string, variantIds: string[]): Promise<Map<string, VariantStockSnapshot>> {
  const result = new Map<string, VariantStockSnapshot>();
  if (variantIds.length === 0) return result;
  const rows: any[] = await executor
    .select()
    .from(inventory)
    .where(and(inArray(inventory.variantId, variantIds), eq(inventory.locationType, 'SELLER_LOCATION'), eq(inventory.sellerId, sellerId)));
  const byVariant = new Map<string, any[]>();
  for (const r of rows) {
    const list = byVariant.get(r.variantId) ?? [];
    list.push(r);
    byVariant.set(r.variantId, list);
  }
  for (const id of variantIds) {
    const list = byVariant.get(id) ?? [];
    let onHand = 0, reserved = 0, pending = 0;
    for (const r of list) {
      onHand += Number(r.quantityOnHand) || 0;
      reserved += Number(r.quantityReserved) || 0;
      pending += await pendingTransferQuantity(executor, r.id);
    }
    const floor = reserved + pending;
    result.set(id, { variantId: id, onHand, reserved, pendingTransfer: pending, floor, available: Math.max(0, onHand - floor), editable: list.length <= 1 });
  }
  return result;
}

/**
 * Aplica os ajustes (já validados por parseVariantStockChanges) DENTRO da transação `tx` do chamador. Qualquer erro desfaz o salvamento inteiro do anúncio.
 * Ordem determinística por variação (evita deadlock entre dois salvamentos).
 */
export async function applyVariantStockChanges(
  tx: any,
  params: { productId: string; sellerId: string; actingUserId?: string | null; changes: VariantStockChange[] },
): Promise<Array<{ variantId: string; from: number; to: number }>> {
  const { productId, sellerId, actingUserId, changes } = params;
  if (changes.length === 0) return [];

  const ids = changes.map((c) => c.variantId);
  const variantRows: any[] = await tx.select({ id: productVariants.id, title: productVariants.title }).from(productVariants)
    .where(and(eq(productVariants.productId, productId), inArray(productVariants.id, ids)));
  const titleById = new Map(variantRows.map((r) => [r.id, r.title as string]));
  for (const id of ids) {
    if (!titleById.has(id)) throw new VariantStockError(404, 'VARIANT_NOT_FOUND', 'Uma das variações do ajuste de estoque não pertence a este produto.', { variantId: id });
  }

  const applied: Array<{ variantId: string; from: number; to: number }> = [];
  for (const change of [...changes].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
    const label = titleById.get(change.variantId) || 'variação';
    const rows: any[] = await tx.select().from(inventory)
      .where(and(eq(inventory.productId, productId), eq(inventory.variantId, change.variantId), eq(inventory.locationType, 'SELLER_LOCATION'), eq(inventory.sellerId, sellerId)))
      .for('update');

    if (rows.length > 1) {
      throw new VariantStockError(409, 'VARIANT_STOCK_MULTIPLE_LOCATIONS', `A variação "${label}" tem estoque em mais de um local do vendedor; o ajuste direto não é seguro. Use o ajuste por local.`, { variantId: change.variantId });
    }

    if (rows.length === 0) {
      // linha ausente (anomalia: toda variação criada pelo sistema tem uma): só aceita partir de zero e herda a origem física de um irmão
      if (change.expectedOnHand !== 0) {
        throw new VariantStockError(409, 'VARIANT_STOCK_CHANGED', `O estoque de "${label}" mudou enquanto você editava. Recarregue a página e confira os valores atuais.`, { variantId: change.variantId, currentOnHand: 0 });
      }
      const [sibling] = await tx.select({ loc: inventory.fulfillmentLocationId }).from(inventory)
        .where(and(eq(inventory.productId, productId), eq(inventory.locationType, 'SELLER_LOCATION'), eq(inventory.sellerId, sellerId), sql`${inventory.fulfillmentLocationId} IS NOT NULL`)).limit(1);
      const invId = `inv_seller_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await tx.insert(inventory).values({
        id: invId, locationType: 'SELLER_LOCATION', sellerId, warehouseId: null, productId, variantId: change.variantId,
        quantityOnHand: change.newOnHand, quantityReserved: 0, minimumStockLevel: 0, fulfillmentLocationId: sibling?.loc ?? null,
        createdAt: new Date(), updatedAt: new Date(),
      });
      await tx.insert(inventoryMovements).values({
        id: `mov_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, inventoryId: invId, warehouseId: null, productId, variantId: change.variantId,
        type: 'ADJUSTMENT', quantity: change.newOnHand, reason: `Estoque da variação definido pelo vendedor (novo: ${change.newOnHand})`, performedBy: actingUserId || null, createdAt: new Date(),
      });
      applied.push({ variantId: change.variantId, from: 0, to: change.newOnHand });
      continue;
    }

    const row = rows[0];
    const current = Number(row.quantityOnHand) || 0;
    const reserved = Number(row.quantityReserved) || 0;
    if (current !== change.expectedOnHand) {
      throw new VariantStockError(409, 'VARIANT_STOCK_CHANGED', `O estoque de "${label}" mudou enquanto você editava (agora: ${current}). Recarregue a página e confira os valores atuais antes de ajustar.`, { variantId: change.variantId, expectedOnHand: change.expectedOnHand, currentOnHand: current, reserved });
    }
    const pending = await pendingTransferQuantity(tx, row.id);
    const floor = reserved + pending;
    if (change.newOnHand < floor) {
      const parts = [`${reserved} reservada(s) por pedidos em andamento`];
      if (pending > 0) parts.push(`${pending} em transferência pendente para o HUB`);
      throw new VariantStockError(409, 'VARIANT_STOCK_BELOW_RESERVED', `Não é possível reduzir o estoque de "${label}" para ${change.newOnHand}: há ${parts.join(' e ')}. O mínimo é ${floor}.`, { variantId: change.variantId, requested: change.newOnHand, reserved, pendingTransfer: pending, floor });
    }

    await tx.update(inventory).set({ quantityOnHand: change.newOnHand, updatedAt: new Date() }).where(eq(inventory.id, row.id));
    await tx.insert(inventoryMovements).values({
      id: `mov_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, inventoryId: row.id, warehouseId: row.warehouseId || null, productId, variantId: change.variantId,
      type: 'ADJUSTMENT', quantity: change.newOnHand - current, reason: `Ajuste de estoque da variação pelo vendedor (de ${current} para ${change.newOnHand})`,
      performedBy: actingUserId || null, createdAt: new Date(),
    });
    applied.push({ variantId: change.variantId, from: current, to: change.newOnHand });
  }

  await InventoryService.syncProductStockSummary(productId, tx);
  return applied;
}
