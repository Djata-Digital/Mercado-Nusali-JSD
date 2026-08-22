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

        -- 4. ADD SHIPPING & FINANCIAL MODULE TABLES AND COLUMNS (MIGRATION 0009)
        CREATE TABLE IF NOT EXISTS "store_shipping_policies" (
          "id" varchar(255) PRIMARY KEY NOT NULL,
          "store_id" varchar(255) NOT NULL REFERENCES "stores"("id") ON DELETE cascade,
          "seller_id" varchar(255) NOT NULL REFERENCES "sellers"("id") ON DELETE cascade,
          "mode" varchar(50) DEFAULT 'CUSTOMER_PAYS' NOT NULL,
          "is_active" boolean DEFAULT true NOT NULL,
          "free_shipping_min_order" numeric(12, 2),
          "seller_subsidy_max_amount" numeric(12, 2),
          "seller_subsidy_percent" numeric(5, 2),
          "allowed_countries_json" jsonb,
          "allowed_regions_json" jsonb,
          "allowed_cities_json" jsonb,
          "created_at" timestamp DEFAULT now() NOT NULL,
          "updated_at" timestamp DEFAULT now() NOT NULL
        );

        CREATE TABLE IF NOT EXISTS "shipping_zones" (
          "id" varchar(255) PRIMARY KEY NOT NULL,
          "country_code" varchar(10) NOT NULL,
          "name" varchar(255) NOT NULL,
          "region_code" varchar(50),
          "city" varchar(255),
          "postal_code_pattern" varchar(100),
          "is_active" boolean DEFAULT true NOT NULL,
          "created_at" timestamp DEFAULT now() NOT NULL,
          "updated_at" timestamp DEFAULT now() NOT NULL
        );

        CREATE TABLE IF NOT EXISTS "shipping_rates" (
          "id" varchar(255) PRIMARY KEY NOT NULL,
          "zone_id" varchar(255) REFERENCES "shipping_zones"("id") ON DELETE cascade,
          "origin_country" varchar(10) NOT NULL,
          "origin_region" varchar(50),
          "destination_country" varchar(10) NOT NULL,
          "destination_region" varchar(50),
          "min_weight_kg" numeric(8, 3) DEFAULT '0.000' NOT NULL,
          "max_weight_kg" numeric(8, 3) DEFAULT '999.000' NOT NULL,
          "price" numeric(12, 2) NOT NULL,
          "currency" varchar(10) NOT NULL,
          "estimated_min_days" integer DEFAULT 1 NOT NULL,
          "estimated_max_days" integer DEFAULT 5 NOT NULL,
          "carrier_id" varchar(255),
          "service_type" varchar(100) DEFAULT 'standard' NOT NULL,
          "is_active" boolean DEFAULT true NOT NULL,
          "created_at" timestamp DEFAULT now() NOT NULL,
          "updated_at" timestamp DEFAULT now() NOT NULL
        );

        ALTER TABLE "shipping_rates" ALTER COLUMN "currency" DROP DEFAULT;

        ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_cost" numeric(12, 2);
        ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_charged_to_buyer" numeric(12, 2);
        ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_seller_subsidy" numeric(12, 2);
        ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_marketplace_subsidy" numeric(12, 2);
        ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_payer" varchar(50);
        ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_rate_source" varchar(100);
        ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_rate_id" varchar(255);
        ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "commission_rate_snapshot" numeric(5, 2);
        ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "commission_base" numeric(12, 2);
        ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "marketplace_commission" numeric(12, 2);
        ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "seller_net_amount" numeric(12, 2);

        -- 5. ALIGN SHIPMENTS LOGISTICS COLUMNS (MIGRATION 0010)
        ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "order_item_id" varchar(255);
        ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "seller_id" varchar(255);
        ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "buyer_id" varchar(255);
        ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "fulfillment_mode" varchar(50) DEFAULT 'SELLER_FULFILLMENT' NOT NULL;
        ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "origin_warehouse_id" varchar(255);
        ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "origin_country" varchar(10);
        ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "destination_country" varchar(10);
        ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "recipient_name" varchar(255);
        ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "recipient_address_json" jsonb;
        ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "sender_name" varchar(255);
        ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "sender_address_json" jsonb;
        ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "shipping_label_url" text;
        ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "estimated_delivery_date" varchar(100);
        ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "shipped_at" timestamp;
        ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "delivered_at" timestamp;
        ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "received_by" varchar(255);
        ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "failure_reason" text;
        ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "notes" text;

        ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "shipment_id" varchar(255);
        ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "fulfillment_mode" varchar(50) DEFAULT 'SELLER_FULFILLMENT' NOT NULL;

        ALTER TABLE "tracking_events" ADD COLUMN IF NOT EXISTS "performed_by" varchar(255);

        CREATE TABLE IF NOT EXISTS "proof_of_delivery" (
          "id" varchar(255) PRIMARY KEY NOT NULL,
          "shipment_id" varchar(255) NOT NULL REFERENCES "shipments"("id") ON DELETE cascade,
          "received_by" varchar(255) NOT NULL,
          "delivered_at" timestamp DEFAULT now() NOT NULL,
          "proof_type" varchar(50) DEFAULT 'BUYER_CONFIRMATION' NOT NULL,
          "proof_url" text,
          "notes" text,
          "created_at" timestamp DEFAULT now() NOT NULL
        );

        ALTER TABLE "proof_of_delivery" ADD COLUMN IF NOT EXISTS "shipment_id" varchar(255);
        ALTER TABLE "proof_of_delivery" ADD COLUMN IF NOT EXISTS "received_by" varchar(255);
        ALTER TABLE "proof_of_delivery" ADD COLUMN IF NOT EXISTS "delivered_at" timestamp DEFAULT now();
        ALTER TABLE "proof_of_delivery" ADD COLUMN IF NOT EXISTS "proof_type" varchar(50) DEFAULT 'BUYER_CONFIRMATION';
        ALTER TABLE "proof_of_delivery" ADD COLUMN IF NOT EXISTS "proof_url" text;
        ALTER TABLE "proof_of_delivery" ADD COLUMN IF NOT EXISTS "notes" text;
        ALTER TABLE "proof_of_delivery" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();

        DO $$ BEGIN
          ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE set null ON UPDATE no action;
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;

        DO $$ BEGIN
          ALTER TABLE "shipments" ADD CONSTRAINT "shipments_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE set null ON UPDATE no action;
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;

        DO $$ BEGIN
          ALTER TABLE "shipments" ADD CONSTRAINT "shipments_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;

        DO $$ BEGIN
          ALTER TABLE "shipments" ADD CONSTRAINT "shipments_origin_warehouse_id_warehouses_id_fk" FOREIGN KEY ("origin_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE set null ON UPDATE no action;
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;

        DO $$ BEGIN
          ALTER TABLE "tracking_events" ADD CONSTRAINT "tracking_events_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;

        DO $$ BEGIN
          ALTER TABLE "proof_of_delivery" ADD CONSTRAINT "proof_of_delivery_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;

        CREATE INDEX IF NOT EXISTS "shipments_order_idx" ON "shipments" ("order_id");
        CREATE INDEX IF NOT EXISTS "shipments_status_idx" ON "shipments" ("status");
        CREATE INDEX IF NOT EXISTS "shipments_seller_idx" ON "shipments" ("seller_id");
        CREATE INDEX IF NOT EXISTS "shipments_buyer_idx" ON "shipments" ("buyer_id");
        CREATE INDEX IF NOT EXISTS "tracking_events_shipment_time_idx" ON "tracking_events" ("shipment_id", "event_time");
        CREATE INDEX IF NOT EXISTS "proof_of_delivery_shipment_idx" ON "proof_of_delivery" ("shipment_id");
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
