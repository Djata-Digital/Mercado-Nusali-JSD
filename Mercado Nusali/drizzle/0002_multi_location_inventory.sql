-- Non-destructive migration for multi-location inventory and transfers (Safe Order & Transactional)

BEGIN;

-- 1. ADD COLUMNS AND DROP NOT NULL ON WAREHOUSE_ID (No FK constraints yet)
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

-- Create inventory_transfers table (without FK constraints first)
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
	"tracking_code" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"received_at" timestamp
);

-- 2. BACKFILL DATA BEFORE ADDING FK CONSTRAINTS

-- 2.1. Convert inventory rows where seller_id currently holds users.id to sellers.id via sellers.user_id
UPDATE "inventory" i
SET "seller_id" = s."id"
FROM "sellers" s
WHERE i."seller_id" = s."user_id";

-- 2.2. Populate missing or invalid seller_id in inventory from products.seller_id (which is sellers.id)
UPDATE "inventory" i
SET "seller_id" = p."seller_id"
FROM "products" p
WHERE i."product_id" = p."id" 
  AND (i."seller_id" IS NULL OR i."seller_id" NOT IN (SELECT "id" FROM "sellers"));

-- 2.3. Structural location_type classification (NO hardcoded IDs/strings):
-- If warehouse_id IS NULL or points to an invalid warehouse, mark as SELLER_LOCATION and set warehouse_id = NULL.
-- If warehouse_id IS NOT NULL and exists in warehouses, mark as NUSALI_HUB.
UPDATE "inventory" i
SET "location_type" = 'SELLER_LOCATION',
    "warehouse_id" = NULL
WHERE i."warehouse_id" IS NULL OR i."warehouse_id" NOT IN (SELECT "id" FROM "warehouses");

UPDATE "inventory" i
SET "location_type" = 'NUSALI_HUB'
WHERE i."warehouse_id" IS NOT NULL AND i."warehouse_id" IN (SELECT "id" FROM "warehouses");

-- 2.4. Convert inventory_transfers rows where seller_id currently holds users.id to sellers.id via sellers.user_id
UPDATE "inventory_transfers" t
SET "seller_id" = s."id"
FROM "sellers" s
WHERE t."seller_id" = s."user_id";

-- 2.5. Populate missing seller_id in inventory_transfers from products.seller_id if needed
UPDATE "inventory_transfers" t
SET "seller_id" = p."seller_id"
FROM "products" p
WHERE t."product_id" = p."id" 
  AND (t."seller_id" IS NULL OR t."seller_id" NOT IN (SELECT "id" FROM "sellers"));

-- 3. ADD FOREIGN KEY CONSTRAINTS (Now safe because data is cleaned and aligned)

DO $$ BEGIN
  ALTER TABLE "inventory" ADD CONSTRAINT "inventory_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_inventory_id_inventory_id_fk" FOREIGN KEY ("inventory_id") REFERENCES "public"."inventory"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_inventory_id_inventory_id_fk" FOREIGN KEY ("inventory_id") REFERENCES "public"."inventory"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "order_items" ADD CONSTRAINT "order_items_inventory_id_inventory_id_fk" FOREIGN KEY ("inventory_id") REFERENCES "public"."inventory"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "order_items" ADD CONSTRAINT "order_items_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_from_inventory_id_inventory_id_fk" FOREIGN KEY ("from_inventory_id") REFERENCES "public"."inventory"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_to_warehouse_id_warehouses_id_fk" FOREIGN KEY ("to_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 4. CREATE INDEXES

CREATE INDEX IF NOT EXISTS "inventory_seller_idx" ON "inventory" USING btree ("seller_id");
CREATE INDEX IF NOT EXISTS "inventory_transfers_seller_idx" ON "inventory_transfers" USING btree ("seller_id");
CREATE INDEX IF NOT EXISTS "inventory_transfers_product_idx" ON "inventory_transfers" USING btree ("product_id");

COMMIT;
