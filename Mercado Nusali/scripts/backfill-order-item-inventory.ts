import 'dotenv/config';
import { getDb, getDbPool } from '../src/db/index.js';
import { orderItems, stockReservations, inventory } from '../src/db/schema.js';
import { eq, and, isNull, isNotNull } from 'drizzle-orm';

async function main() {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');

  console.log(`==================================================`);
  console.log(`ORDER ITEMS INVENTORY BACKFILL SCRIPT`);
  console.log(`MODE: ${isApply ? 'APPLY (WILL UPDATE DB)' : 'DRY-RUN (SIMULATION ONLY)'}`);
  console.log(`==================================================\n`);

  const db = getDb();
  if (!db) {
    console.error('CRITICAL: Banco de dados indisponível.');
    process.exit(1);
  }

  try {
    const allOrderItems = await db.select().from(orderItems);
    const scanned = allOrderItems.filter((item) => !item.inventoryId).length;
    const skipped = allOrderItems.length - scanned;

    let resolvedCount = 0;
    let unresolvedCount = 0;

    const resolvedItems: Array<{
      orderItemId: string;
      orderId: string;
      productId: string;
      reservationId: string;
      inventoryId: string;
      fulfillmentMode: string;
    }> = [];

    const unresolvedItems: Array<{
      orderItemId: string;
      orderId: string;
      productId: string;
      reason: string;
    }> = [];

    const itemsToBackfill = allOrderItems.filter((item) => !item.inventoryId);

    for (const item of itemsToBackfill) {
      const resConditions = [
        eq(stockReservations.orderId, item.orderId),
        eq(stockReservations.productId, item.productId),
        isNotNull(stockReservations.inventoryId),
      ];

      if (item.variantId) {
        resConditions.push(eq(stockReservations.variantId, item.variantId));
      } else {
        resConditions.push(isNull(stockReservations.variantId));
      }

      const matchingReservations = await db
        .select()
        .from(stockReservations)
        .where(and(...resConditions));

      const validReservations: typeof matchingReservations = [];

      for (const res of matchingReservations) {
        if (!res.inventoryId) continue;
        const invRows = await db
          .select()
          .from(inventory)
          .where(eq(inventory.id, res.inventoryId))
          .limit(1);

        if (invRows.length === 0) continue;
        const inv = invRows[0];

        if (inv.productId !== item.productId) continue;

        const mode = item.fulfillmentMode || res.fulfillmentMode;
        if (mode === 'SELLER_FULFILLMENT' && inv.locationType !== 'SELLER_LOCATION') continue;
        if (mode === 'NUSALI_FULFILLMENT' && inv.locationType !== 'NUSALI_HUB') continue;

        if (item.variantId && inv.variantId !== item.variantId) continue;

        validReservations.push(res);
      }

      if (validReservations.length === 1) {
        const targetRes = validReservations[0];
        resolvedCount++;
        resolvedItems.push({
          orderItemId: item.id,
          orderId: item.orderId,
          productId: item.productId,
          reservationId: targetRes.id,
          inventoryId: targetRes.inventoryId!,
          fulfillmentMode: item.fulfillmentMode || targetRes.fulfillmentMode || 'SELLER_FULFILLMENT',
        });
      } else {
        unresolvedCount++;
        unresolvedItems.push({
          orderItemId: item.id,
          orderId: item.orderId,
          productId: item.productId,
          reason:
            validReservations.length === 0
              ? 'Nenhuma reserva válida compatível encontrada.'
              : `Múltiplas reservas compatíveis encontradas (${validReservations.length}).`,
        });
      }
    }

    console.log(`--- RELATÓRIO DE VARREDURA ---`);
    console.log(`Total de order_items analisados: ${allOrderItems.length}`);
    console.log(`Skipped (já possuem inventory_id): ${skipped}`);
    console.log(`Scanned (inventory_id IS NULL): ${scanned}`);
    console.log(`Resolved (1 reserva compatível): ${resolvedCount}`);
    console.log(`Unresolved (0 ou >1 reservas): ${unresolvedCount}\n`);

    if (resolvedItems.length > 0) {
      console.log(`--- ITENS RESOLVIDOS (${isApply ? 'APLICANDO ALTERAÇÕES' : 'SIMULAÇÃO DRY-RUN'}) ---`);
      for (const resItem of resolvedItems) {
        console.log(`[RESOLVED] OrderItemId: ${resItem.orderItemId}`);
        console.log(`  -> OrderId: ${resItem.orderId}`);
        console.log(`  -> ProductId: ${resItem.productId}`);
        console.log(`  -> ReservationId: ${resItem.reservationId}`);
        console.log(`  -> InventoryId a associar: ${resItem.inventoryId}`);
        console.log(`  -> FulfillmentMode: ${resItem.fulfillmentMode}`);

        if (isApply) {
          await db
            .update(orderItems)
            .set({
              inventoryId: resItem.inventoryId,
              fulfillmentMode: resItem.fulfillmentMode,
            })
            .where(eq(orderItems.id, resItem.orderItemId));
          console.log(`  -> UPDATE realizado no banco de dados com SUCESSO.`);
        } else {
          console.log(`  -> SIMULADO (nenhuma alteração feita no banco).`);
        }
        console.log(`--------------------------------------------------`);
      }
    }

    if (unresolvedItems.length > 0) {
      console.log(`\n--- ITENS NÃO RESOLVIDOS (UNRESOLVED) ---`);
      for (const unres of unresolvedItems) {
        console.log(`[UNRESOLVED] OrderItemId: ${unres.orderItemId}`);
        console.log(`  -> OrderId: ${unres.orderId}`);
        console.log(`  -> ProductId: ${unres.productId}`);
        console.log(`  -> Motivo: ${unres.reason}`);
        console.log(`--------------------------------------------------`);
      }
    }

    console.log(`\n==================================================`);
    if (isApply) {
      console.log(`BACKFILL CONCLUÍDO COM SUCESSO E APLICADO NO BANCO.`);
    } else {
      console.log(`SIMULAÇÃO DRY-RUN CONCLUÍDA. NENHUMA ALTERAÇÃO FOI REALIZADA.`);
      console.log(`Para aplicar permanentemente no banco, execute:`);
      console.log(`  npm run orders:backfill-inventory -- --apply`);
    }
    console.log(`==================================================`);
  } catch (error) {
    console.error('Erro na execução do backfill:', error);
    process.exit(1);
  } finally {
    await getDbPool()?.end();
  }
}

main();
