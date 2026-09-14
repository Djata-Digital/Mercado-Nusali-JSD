ALTER TABLE "order_items" ADD COLUMN "compare_at_price_snapshot" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;