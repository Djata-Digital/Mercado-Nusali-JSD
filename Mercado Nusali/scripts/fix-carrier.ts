import { getDb, getDbPool } from '../src/db/index.js';
import { sql } from 'drizzle-orm';

async function fixCarrier() {
  const db = getDb();
  if (db) {
    await db.execute(sql`ALTER TABLE shipments ALTER COLUMN carrier DROP NOT NULL;`);
    console.log('ALTER TABLE shipments ALTER COLUMN carrier DROP NOT NULL SUCCESS');
  }
  await getDbPool()?.end();
}

fixCarrier().catch(console.error);
