ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "publishing_scope" varchar(20) NOT NULL DEFAULT 'national';
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "target_countries_json" jsonb;
