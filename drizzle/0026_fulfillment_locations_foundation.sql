CREATE TABLE "fulfillment_locations" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"seller_id" varchar(255),
	"location_type" varchar(50) NOT NULL,
	"store_id" varchar(255),
	"warehouse_id" varchar(255),
	"address_id" varchar(255),
	"country_code" varchar(10) NOT NULL,
	"shipping_sector_id" varchar(255),
	"name" varchar(255) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fulfillment_locations_type_check" CHECK ("fulfillment_locations"."location_type" IN ('STORE','NUSALI_WAREHOUSE')),
	CONSTRAINT "fulfillment_locations_store_xor_warehouse_check" CHECK (("fulfillment_locations"."location_type" = 'STORE' AND "fulfillment_locations"."store_id" IS NOT NULL AND "fulfillment_locations"."warehouse_id" IS NULL) OR ("fulfillment_locations"."location_type" = 'NUSALI_WAREHOUSE' AND "fulfillment_locations"."warehouse_id" IS NOT NULL AND "fulfillment_locations"."store_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "inventory" ADD COLUMN "fulfillment_location_id" varchar(255);
--> statement-breakpoint
ALTER TABLE "fulfillment_locations" ADD CONSTRAINT "fulfillment_locations_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_locations" ADD CONSTRAINT "fulfillment_locations_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_locations" ADD CONSTRAINT "fulfillment_locations_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_locations" ADD CONSTRAINT "fulfillment_locations_address_id_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_locations" ADD CONSTRAINT "fulfillment_locations_shipping_sector_id_shipping_sectors_id_fk" FOREIGN KEY ("shipping_sector_id") REFERENCES "public"."shipping_sectors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_fulfillment_location_id_fulfillment_locations_id_fk" FOREIGN KEY ("fulfillment_location_id") REFERENCES "public"."fulfillment_locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fulfillment_locations_store_uq" ON "fulfillment_locations" USING btree ("store_id") WHERE "fulfillment_locations"."store_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "fulfillment_locations_warehouse_uq" ON "fulfillment_locations" USING btree ("warehouse_id") WHERE "fulfillment_locations"."warehouse_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "fulfillment_locations_country_idx" ON "fulfillment_locations" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "inventory_fulfillment_location_idx" ON "inventory" USING btree ("fulfillment_location_id");
