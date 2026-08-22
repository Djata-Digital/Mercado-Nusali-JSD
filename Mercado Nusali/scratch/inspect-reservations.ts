import 'dotenv/config';
import { getDb, getDbPool } from '../src/db/index.js';
import { stockReservations, orderItems } from '../src/db/schema.js';
import { isNotNull, isNull } from 'drizzle-orm';

async function main() {
  const db = getDb();
  if (!db) return;

  const resWithInv = await db.select().from(stockReservations).where(isNotNull(stockReservations.inventoryId));
  const resAll = await db.select().from(stockReservations);
  const itemsAll = await db.select().from(orderItems);
  const itemsNullInv = await db.select().from(orderItems).where(isNull(orderItems.inventoryId));

  console.log('TOTAL ORDER ITEMS:', itemsAll.length);
  console.log('ORDER ITEMS WITH NULL INVENTORY_ID:', itemsNullInv.length);
  console.log('TOTAL STOCK RESERVATIONS:', resAll.length);
  console.log('STOCK RESERVATIONS WITH NON-NULL INVENTORY_ID:', resWithInv.length);
  console.log('ALL RESERVATIONS:', JSON.stringify(resAll, null, 2));

  await getDbPool()?.end();
}

main();
