import 'dotenv/config';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

async function main() {
  if (process.env.NODE_ENV !== 'production') {
    console.error('[production-migrate] failed: refusing to run — NODE_ENV is not "production"');
    process.exitCode = 1;
    return;
  }

  if (process.env.PRODUCTION_MIGRATION_CONFIRM !== 'YES') {
    console.error('[production-migrate] failed: refusing to run — PRODUCTION_MIGRATION_CONFIRM is not exactly "YES"');
    process.exitCode = 1;
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.error('[production-migrate] failed: refusing to run — DATABASE_URL is not configured');
    process.exitCode = 1;
    return;
  }

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  const db = drizzle(pool);

  console.log('[production-migrate] starting');
  try {
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('[production-migrate] migration completed');
  } catch {
    console.error('[production-migrate] failed');
    process.exitCode = 1;
  } finally {
    try {
      await pool.end();
    } finally {
      console.log('[production-migrate] database connection closed');
    }
  }
}

main();
