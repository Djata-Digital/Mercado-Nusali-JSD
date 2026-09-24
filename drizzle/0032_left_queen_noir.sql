CREATE TABLE "shipping_campaign_usages" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"campaign_id" varchar(255) NOT NULL,
	"order_id" varchar(255) NOT NULL,
	"subsidy_amount" numeric(12, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_campaign_usages_subsidy_check" CHECK ("shipping_campaign_usages"."subsidy_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "shipping_subsidy_campaigns" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"funding_mode" varchar(20) NOT NULL,
	"percentage" numeric(5, 2),
	"max_amount" numeric(12, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp,
	"ends_at" timestamp,
	"campaign_budget" numeric(12, 2),
	"spent_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"max_orders" integer,
	"orders_served" integer DEFAULT 0 NOT NULL,
	"country_code" varchar(10),
	"region_id" varchar(255),
	"sector_id" varchar(255),
	"route_id" varchar(255),
	"seller_id" varchar(255),
	"store_id" varchar(255),
	"category_id" varchar(255),
	"product_id" varchar(255),
	"created_by" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_subsidy_campaigns_funding_mode_check" CHECK ("shipping_subsidy_campaigns"."funding_mode" IN ('FULL','PERCENTAGE','MAX_AMOUNT')),
	CONSTRAINT "shipping_subsidy_campaigns_funding_fields_check" CHECK ((
      ("shipping_subsidy_campaigns"."funding_mode" = 'FULL' AND "shipping_subsidy_campaigns"."percentage" IS NULL AND "shipping_subsidy_campaigns"."max_amount" IS NULL)
      OR ("shipping_subsidy_campaigns"."funding_mode" = 'PERCENTAGE' AND "shipping_subsidy_campaigns"."percentage" IS NOT NULL AND "shipping_subsidy_campaigns"."percentage" > 0 AND "shipping_subsidy_campaigns"."percentage" <= 100 AND "shipping_subsidy_campaigns"."max_amount" IS NULL)
      OR ("shipping_subsidy_campaigns"."funding_mode" = 'MAX_AMOUNT' AND "shipping_subsidy_campaigns"."max_amount" IS NOT NULL AND "shipping_subsidy_campaigns"."max_amount" > 0 AND "shipping_subsidy_campaigns"."percentage" IS NULL)
    )),
	CONSTRAINT "shipping_subsidy_campaigns_dates_check" CHECK ("shipping_subsidy_campaigns"."starts_at" IS NULL OR "shipping_subsidy_campaigns"."ends_at" IS NULL OR "shipping_subsidy_campaigns"."starts_at" < "shipping_subsidy_campaigns"."ends_at"),
	CONSTRAINT "shipping_subsidy_campaigns_budget_check" CHECK ("shipping_subsidy_campaigns"."spent_amount" >= 0 AND ("shipping_subsidy_campaigns"."campaign_budget" IS NULL OR ("shipping_subsidy_campaigns"."campaign_budget" >= 0 AND "shipping_subsidy_campaigns"."spent_amount" <= "shipping_subsidy_campaigns"."campaign_budget"))),
	CONSTRAINT "shipping_subsidy_campaigns_orders_check" CHECK ("shipping_subsidy_campaigns"."orders_served" >= 0 AND ("shipping_subsidy_campaigns"."max_orders" IS NULL OR ("shipping_subsidy_campaigns"."max_orders" > 0 AND "shipping_subsidy_campaigns"."orders_served" <= "shipping_subsidy_campaigns"."max_orders"))),
	CONSTRAINT "shipping_subsidy_campaigns_priority_check" CHECK ("shipping_subsidy_campaigns"."priority" >= 0)
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "seller_shipping_policy_id" varchar(255);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_policy_mode_at_checkout" varchar(50);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_campaign_id" varchar(255);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_campaign_subsidy" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "shipping_campaign_usages" ADD CONSTRAINT "shipping_campaign_usages_campaign_id_shipping_subsidy_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."shipping_subsidy_campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_campaign_usages" ADD CONSTRAINT "shipping_campaign_usages_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_subsidy_campaigns" ADD CONSTRAINT "shipping_subsidy_campaigns_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_subsidy_campaigns" ADD CONSTRAINT "shipping_subsidy_campaigns_region_id_shipping_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."shipping_regions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_subsidy_campaigns" ADD CONSTRAINT "shipping_subsidy_campaigns_sector_id_shipping_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."shipping_sectors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_subsidy_campaigns" ADD CONSTRAINT "shipping_subsidy_campaigns_route_id_shipping_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."shipping_routes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_subsidy_campaigns" ADD CONSTRAINT "shipping_subsidy_campaigns_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_subsidy_campaigns" ADD CONSTRAINT "shipping_subsidy_campaigns_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_subsidy_campaigns" ADD CONSTRAINT "shipping_subsidy_campaigns_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_subsidy_campaigns" ADD CONSTRAINT "shipping_subsidy_campaigns_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_subsidy_campaigns" ADD CONSTRAINT "shipping_subsidy_campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_campaign_usages_order_uq" ON "shipping_campaign_usages" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "shipping_campaign_usages_campaign_idx" ON "shipping_campaign_usages" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "shipping_subsidy_campaigns_active_idx" ON "shipping_subsidy_campaigns" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "shipping_subsidy_campaigns_product_idx" ON "shipping_subsidy_campaigns" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "shipping_subsidy_campaigns_store_idx" ON "shipping_subsidy_campaigns" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "shipping_subsidy_campaigns_seller_idx" ON "shipping_subsidy_campaigns" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "shipping_subsidy_campaigns_route_idx" ON "shipping_subsidy_campaigns" USING btree ("route_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_seller_shipping_policy_id_store_shipping_policies_id_fk" FOREIGN KEY ("seller_shipping_policy_id") REFERENCES "public"."store_shipping_policies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_campaign_id_shipping_subsidy_campaigns_id_fk" FOREIGN KEY ("shipping_campaign_id") REFERENCES "public"."shipping_subsidy_campaigns"("id") ON DELETE restrict ON UPDATE no action;