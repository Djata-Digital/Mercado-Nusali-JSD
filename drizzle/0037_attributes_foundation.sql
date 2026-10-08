CREATE TABLE "product_attribute_values" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"product_id" varchar(255) NOT NULL,
	"attribute_id" varchar(255) NOT NULL,
	"attribute_code" varchar(100) NOT NULL,
	"value_text" text,
	"value_number" numeric(18, 6),
	"value_bool" boolean,
	"option_value" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_attribute_values_one_value_check" CHECK (num_nonnulls("product_attribute_values"."value_text", "product_attribute_values"."value_number", "product_attribute_values"."value_bool", "product_attribute_values"."option_value") = 1)
);
--> statement-breakpoint
ALTER TABLE "category_attributes" ADD COLUMN "role" varchar(20) DEFAULT 'spec' NOT NULL;--> statement-breakpoint
ALTER TABLE "category_attributes" ADD COLUMN "min_value" numeric(18, 6);--> statement-breakpoint
ALTER TABLE "category_attributes" ADD COLUMN "max_value" numeric(18, 6);--> statement-breakpoint
ALTER TABLE "category_attributes" ADD COLUMN "max_length" integer;--> statement-breakpoint
ALTER TABLE "category_attributes" ADD COLUMN "decimals" integer;--> statement-breakpoint
ALTER TABLE "category_attributes" ADD COLUMN "is_filterable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "category_attributes" ADD COLUMN "display_group" varchar(100);--> statement-breakpoint
ALTER TABLE "category_attributes" ADD COLUMN "overrides_id" varchar(255);--> statement-breakpoint
ALTER TABLE "category_attributes" ADD COLUMN "source" varchar(20) DEFAULT 'admin' NOT NULL;--> statement-breakpoint
ALTER TABLE "category_attributes" ADD COLUMN "admin_modified_at" timestamp;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "variant_key" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "model" varchar(255);--> statement-breakpoint
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_attribute_id_category_attributes_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "public"."category_attributes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_attribute_values_product_idx" ON "product_attribute_values" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_attribute_values_uq" ON "product_attribute_values" USING btree ("product_id","attribute_id",coalesce("option_value", ''));--> statement-breakpoint
CREATE INDEX "product_attribute_values_option_idx" ON "product_attribute_values" USING btree ("attribute_id","option_value") WHERE "product_attribute_values"."option_value" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "product_attribute_values_number_idx" ON "product_attribute_values" USING btree ("attribute_id","value_number") WHERE "product_attribute_values"."value_number" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "product_attribute_values_bool_idx" ON "product_attribute_values" USING btree ("attribute_id","value_bool") WHERE "product_attribute_values"."value_bool" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "category_attributes" ADD CONSTRAINT "category_attributes_overrides_id_category_attributes_id_fk" FOREIGN KEY ("overrides_id") REFERENCES "public"."category_attributes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "category_attributes_cat_code_uq" ON "category_attributes" USING btree ("category_id","code");--> statement-breakpoint
CREATE INDEX "category_attributes_overrides_idx" ON "category_attributes" USING btree ("overrides_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_product_key_uq" ON "product_variants" USING btree ("product_id","variant_key") WHERE "product_variants"."variant_key" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "category_attributes" ADD CONSTRAINT "category_attributes_type_check" CHECK ("category_attributes"."type" IN ('text', 'number', 'select', 'multiselect', 'boolean'));--> statement-breakpoint
ALTER TABLE "category_attributes" ADD CONSTRAINT "category_attributes_role_check" CHECK ("category_attributes"."role" IN ('spec', 'variant_axis'));--> statement-breakpoint
ALTER TABLE "category_attributes" ADD CONSTRAINT "category_attributes_source_check" CHECK ("category_attributes"."source" IN ('admin', 'seed'));--> statement-breakpoint
ALTER TABLE "category_attributes" ADD CONSTRAINT "category_attributes_range_check" CHECK ("category_attributes"."min_value" IS NULL OR "category_attributes"."max_value" IS NULL OR "category_attributes"."min_value" <= "category_attributes"."max_value");--> statement-breakpoint
ALTER TABLE "category_attributes" ADD CONSTRAINT "category_attributes_limits_check" CHECK (("category_attributes"."max_length" IS NULL OR "category_attributes"."max_length" > 0) AND ("category_attributes"."decimals" IS NULL OR ("category_attributes"."decimals" >= 0 AND "category_attributes"."decimals" <= 6)));--> statement-breakpoint
ALTER TABLE "category_attributes" ADD CONSTRAINT "category_attributes_override_self_check" CHECK ("category_attributes"."overrides_id" IS NULL OR "category_attributes"."overrides_id" <> "category_attributes"."id");