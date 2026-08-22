-- Add missing category_id, address_json, business_hours_json columns to stores table
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "category_id" varchar(255);
--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "address_json" jsonb;
--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "business_hours_json" jsonb;
