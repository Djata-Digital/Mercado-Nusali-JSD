import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

const { Pool } = pg;

let poolInstance: pg.Pool | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;
let isDbReachable: boolean | null = null;
let hasRunMigration = false;

export function resetDbPool() {
  if (poolInstance) {
    try { poolInstance.end().catch(() => {}); } catch {}
  }
  poolInstance = null;
  dbInstance = null;
}

export function getDbPool(): pg.Pool | null {
  if (!poolInstance) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      return null;
    }
    try {
      poolInstance = new Pool({
        connectionString,
        ssl: { rejectUnauthorized: false },
        max: 5,
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 30000,
      });
      poolInstance.on('error', (err) => {
        console.warn('[DB Pool] Transient client error:', err.message);
      });
    } catch {
      return null;
    }
  }
  return poolInstance;
}

export async function runRuntimeSchemaAlign() {
  if (hasRunMigration || process.env.SKIP_RUNTIME_ALIGN === 'true') return;
  const pool = getDbPool();
  if (!pool) return;
  try {
    const client = await pool.connect();
    try {
      await client.query(`
        -- 1. ADD COLUMNS AND DROP NOT NULL ON WAREHOUSE_ID
        ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "location_type" varchar(50) DEFAULT 'SELLER_LOCATION' NOT NULL;
        ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "seller_id" varchar(255);
        ALTER TABLE "inventory" ALTER COLUMN "warehouse_id" DROP NOT NULL;

        ALTER TABLE "inventory_movements" ADD COLUMN IF NOT EXISTS "inventory_id" varchar(255);
        ALTER TABLE "inventory_movements" ALTER COLUMN "warehouse_id" DROP NOT NULL;

        ALTER TABLE "stock_reservations" ADD COLUMN IF NOT EXISTS "inventory_id" varchar(255);
        ALTER TABLE "stock_reservations" ADD COLUMN IF NOT EXISTS "warehouse_id" varchar(255);
        ALTER TABLE "stock_reservations" ADD COLUMN IF NOT EXISTS "fulfillment_mode" varchar(50) DEFAULT 'SELLER_FULFILLMENT' NOT NULL;

        ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "inventory_id" varchar(255);
        ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "warehouse_id" varchar(255);
        ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "fulfillment_mode" varchar(50) DEFAULT 'SELLER_FULFILLMENT' NOT NULL;
        ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "status" varchar(50) DEFAULT 'pending_preparation' NOT NULL;
        ALTER TABLE "orders" ALTER COLUMN "payment_method" DROP NOT NULL;
        ALTER TABLE "orders" ALTER COLUMN "escrow_status" SET DEFAULT 'pending';
        ALTER TABLE "shipments" ALTER COLUMN "carrier" DROP NOT NULL;

        -- ADD MISSING COLUMNS FOR STORES TABLE
        ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "category_id" varchar(255);
        ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "address_json" jsonb;
        ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "business_hours_json" jsonb;

        CREATE TABLE IF NOT EXISTS "payment_customers" (
          "id" varchar(255) PRIMARY KEY NOT NULL,
          "user_id" varchar(255) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "provider" varchar(50) NOT NULL,
          "provider_customer_id" varchar(255) NOT NULL,
          "created_at" timestamp DEFAULT now() NOT NULL,
          "updated_at" timestamp DEFAULT now() NOT NULL,
          CONSTRAINT "payment_customers_user_provider_uq" UNIQUE("user_id", "provider")
        );

        CREATE TABLE IF NOT EXISTS "payment_webhook_events" (
          "id" varchar(255) PRIMARY KEY NOT NULL,
          "provider" varchar(50) NOT NULL,
          "event_type" varchar(100) NOT NULL,
          "event_id" varchar(255),
          "payload_json" jsonb NOT NULL,
          "signature" varchar(500),
          "processed" boolean DEFAULT false NOT NULL,
          "processed_at" timestamp,
          "created_at" timestamp DEFAULT now() NOT NULL,
          CONSTRAINT "payment_webhook_provider_event_uq" UNIQUE("provider", "event_id")
        );

        CREATE TABLE IF NOT EXISTS "inventory_transfers" (
          "id" varchar(255) PRIMARY KEY NOT NULL,
          "seller_id" varchar(255) NOT NULL,
          "product_id" varchar(255) NOT NULL,
          "variant_id" varchar(255),
          "from_location_type" varchar(50) DEFAULT 'SELLER_LOCATION' NOT NULL,
          "from_inventory_id" varchar(255),
          "to_warehouse_id" varchar(255) NOT NULL,
          "quantity" integer NOT NULL,
          "status" varchar(50) DEFAULT 'PENDING' NOT NULL,
          "delivery_mode" varchar(50),
          "pickup_snapshot_json" jsonb,
          "tracking_code" varchar(100),
          "created_at" timestamp DEFAULT now() NOT NULL,
          "received_at" timestamp
        );

        ALTER TABLE "inventory_transfers" ADD COLUMN IF NOT EXISTS "delivery_mode" varchar(50);
        ALTER TABLE "inventory_transfers" ADD COLUMN IF NOT EXISTS "pickup_snapshot_json" jsonb;

        -- 2. BACKFILL DATA BEFORE ADDING FK CONSTRAINTS
        UPDATE "inventory" i
        SET "seller_id" = s."id"
        FROM "sellers" s
        WHERE i."seller_id" = s."user_id";

        UPDATE "inventory" i
        SET "seller_id" = p."seller_id"
        FROM "products" p
        WHERE i."product_id" = p."id" 
          AND (i."seller_id" IS NULL OR i."seller_id" NOT IN (SELECT "id" FROM "sellers"));

        -- Structural location_type classification (NO hardcoded IDs/strings)
        UPDATE "inventory" i
        SET "location_type" = 'SELLER_LOCATION',
            "warehouse_id" = NULL
        WHERE i."warehouse_id" IS NULL OR i."warehouse_id" NOT IN (SELECT "id" FROM "warehouses");

        UPDATE "inventory" i
        SET "location_type" = 'NUSALI_HUB'
        WHERE i."warehouse_id" IS NOT NULL AND i."warehouse_id" IN (SELECT "id" FROM "warehouses");

        UPDATE "inventory_transfers" t
        SET "seller_id" = s."id"
        FROM "sellers" s
        WHERE t."seller_id" = s."user_id";

        UPDATE "inventory_transfers" t
        SET "seller_id" = p."seller_id"
        FROM "products" p
        WHERE t."product_id" = p."id" 
          AND (t."seller_id" IS NULL OR t."seller_id" NOT IN (SELECT "id" FROM "sellers"));

        -- 3. ADD FOREIGN KEY CONSTRAINTS SAFE AFTER BACKFILL
        DO $$ BEGIN
          ALTER TABLE "inventory" ADD CONSTRAINT "inventory_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE cascade ON UPDATE no action;
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;

        DO $$ BEGIN
          ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE cascade ON UPDATE no action;
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);
      hasRunMigration = true;
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn('Runtime schema alignment notice:', err);
  }
}

export async function checkDbConnection(): Promise<boolean> {
  const pool = getDbPool();
  if (!pool) return false;
  if (isDbReachable === false) return false;

  try {
    const client = await pool.connect();
    client.release();
    isDbReachable = true;
    runRuntimeSchemaAlign().catch(() => {});
    return true;
  } catch {
    isDbReachable = false;
    return false;
  }
}

export function getDb() {
  if (!dbInstance) {
    const pool = getDbPool();
    if (pool) {
      dbInstance = drizzle(pool, { schema });
      runRuntimeSchemaAlign().catch(() => {});
    }
  }
  return dbInstance;
}

export { schema };
