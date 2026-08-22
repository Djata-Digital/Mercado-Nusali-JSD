import { getDbPool, runRuntimeSchemaAlign } from '../src/db/index.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkStores() {
  await runRuntimeSchemaAlign();
  const pool = getDbPool();
  if (!pool) {
    console.error('Failed to initialize DB pool. Check DATABASE_URL.');
    process.exit(1);
  }

  try {
    console.log('--- 1. INFORMATION_SCHEMA COLUMNS FOR "stores" ---');
    const cols = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'stores'
      ORDER BY ordinal_position;
    `);
    console.table(cols.rows);

    console.log('\n--- 2. EXECUTING FULL DRIZZLE SELECT QUERY ---');
    try {
      const fullQuery = await pool.query(`
        SELECT "id", "seller_id", "name", "slug", "country_code", "description", "logo_url", "banner_url", "rating", "followers_count", "status", "category_id", "address_json", "business_hours_json", "created_at", "updated_at" 
        FROM "stores";
      `);
      console.log('Full query SUCCESS! Total rows:', fullQuery.rows.length);
    } catch (err: any) {
      console.error('EXACT POSTGRESQL ERROR:');
      console.error('  Code:', err.code);
      console.error('  Message:', err.message);
      console.error('  Detail:', err.detail);
      console.error('  Hint:', err.hint);
      console.error('  Column:', err.column);
      console.error('  Table:', err.table);
    }

  } catch (err: any) {
    console.error('DB Error:', err.message);
  } finally {
    await pool.end();
  }
}

checkStores();
