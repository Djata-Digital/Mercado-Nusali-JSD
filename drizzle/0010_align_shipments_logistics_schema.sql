-- Migration 0010: Align Shipments, Logistics and Proof of Delivery Schema

-- 0. Remove default XOF from shipping_rates.currency
ALTER TABLE "shipping_rates" ALTER COLUMN "currency" DROP DEFAULT;

-- 1. Ensure all logistics columns in shipments table (additive & safe, no default 'GW')
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

-- 2. Ensure order_items shipment_id & fulfillment_mode reference
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "shipment_id" varchar(255);
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "fulfillment_mode" varchar(50) DEFAULT 'SELLER_FULFILLMENT' NOT NULL;

-- 3. Ensure tracking_events performed_by reference
ALTER TABLE "tracking_events" ADD COLUMN IF NOT EXISTS "performed_by" varchar(255);

-- 4. Create & align proof_of_delivery table exactly matching schema.ts
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

-- Ensure all columns on pre-existing proof_of_delivery table
ALTER TABLE "proof_of_delivery" ADD COLUMN IF NOT EXISTS "shipment_id" varchar(255);
ALTER TABLE "proof_of_delivery" ADD COLUMN IF NOT EXISTS "received_by" varchar(255);
ALTER TABLE "proof_of_delivery" ADD COLUMN IF NOT EXISTS "delivered_at" timestamp DEFAULT now();
ALTER TABLE "proof_of_delivery" ADD COLUMN IF NOT EXISTS "proof_type" varchar(50) DEFAULT 'BUYER_CONFIRMATION';
ALTER TABLE "proof_of_delivery" ADD COLUMN IF NOT EXISTS "proof_url" text;
ALTER TABLE "proof_of_delivery" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE "proof_of_delivery" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now();

-- 5. Safe Foreign Key constraints
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

-- 6. Indexes matching schema.ts
CREATE INDEX IF NOT EXISTS "shipments_order_idx" ON "shipments" ("order_id");
CREATE INDEX IF NOT EXISTS "shipments_status_idx" ON "shipments" ("status");
CREATE INDEX IF NOT EXISTS "shipments_seller_idx" ON "shipments" ("seller_id");
CREATE INDEX IF NOT EXISTS "shipments_buyer_idx" ON "shipments" ("buyer_id");
CREATE INDEX IF NOT EXISTS "tracking_events_shipment_time_idx" ON "tracking_events" ("shipment_id", "event_time");
CREATE INDEX IF NOT EXISTS "proof_of_delivery_shipment_idx" ON "proof_of_delivery" ("shipment_id");
