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
	"currency" varchar(10) DEFAULT 'XOF' NOT NULL,
	"estimated_min_days" integer DEFAULT 1 NOT NULL,
	"estimated_max_days" integer DEFAULT 5 NOT NULL,
	"carrier_id" varchar(255),
	"service_type" varchar(100) DEFAULT 'standard' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

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
