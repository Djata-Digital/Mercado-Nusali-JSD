import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

const { Pool } = pg;

let poolInstance: pg.Pool | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;
let isDbReachable: boolean | null = null;

export function getDbPool(): pg.Pool | null {
  if (!poolInstance) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      return null;
    }
    try {
      poolInstance = new Pool({
        connectionString,
        max: 5,
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 3000,
      });
      poolInstance.on('error', (err) => {
        isDbReachable = false;
      });
    } catch {
      return null;
    }
  }
  return poolInstance;
}

export async function checkDbConnection(): Promise<boolean> {
  const pool = getDbPool();
  if (!pool) return false;
  if (isDbReachable === false) return false;

  try {
    const client = await pool.connect();
    client.release();
    isDbReachable = true;
    return true;
  } catch {
    isDbReachable = false;
    return false;
  }
}

export function getDb() {
  if (isDbReachable === false) {
    return null;
  }
  if (!dbInstance) {
    const pool = getDbPool();
    if (pool) {
      dbInstance = drizzle(pool, { schema });
    }
  }
  return dbInstance;
}

export { schema };

