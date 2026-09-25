ALTER TABLE "coupons" DROP CONSTRAINT "coupons_code_unique";--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN "seller_id" varchar(255);--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN "store_id" varchar(255);--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN "currency" varchar(10);--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN "usage_limit_per_user" integer;--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coupons_seller_idx" ON "coupons" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "coupons_store_idx" ON "coupons" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "coupons_active_idx" ON "coupons" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_seller_code_uq" ON "coupons" USING btree ("seller_id",upper("code"));--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_currency_format_check" CHECK ("coupons"."currency" IS NULL OR char_length("coupons"."currency") = 3);--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_usage_limit_per_user_check" CHECK ("coupons"."usage_limit_per_user" IS NULL OR "coupons"."usage_limit_per_user" > 0);