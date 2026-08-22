import { runRuntimeSchemaAlign, getDb } from '../src/db/index.js';
import { stores, inventoryTransfers } from '../src/db/schema.js';
import dotenv from 'dotenv';
import { desc } from 'drizzle-orm';

dotenv.config();

async function testEndpoints() {
  await runRuntimeSchemaAlign();
  const db = getDb();
  if (!db) {
    console.error('Database connection unavailable.');
    process.exit(1);
  }

  console.log('--- TEST 1: SELECT STORES ---');
  try {
    const storeRows = await db.select().from(stores).orderBy(desc(stores.createdAt));
    console.log('GET /admin/stores SUCCESS! Stores count:', storeRows.length);
    console.log('Sample store:', storeRows[0] || 'No stores in DB');
  } catch (err: any) {
    console.error('GET /admin/stores ERROR:', err.message);
  }

  console.log('\n--- TEST 2: SELECT INVENTORY TRANSFERS ---');
  try {
    const transfers = await db.select().from(inventoryTransfers).orderBy(desc(inventoryTransfers.createdAt));
    console.log('GET /admin/inventory/transfers SUCCESS! Transfers count:', transfers.length);
  } catch (err: any) {
    console.error('GET /admin/inventory/transfers ERROR:', err.message);
  }
}

testEndpoints();
