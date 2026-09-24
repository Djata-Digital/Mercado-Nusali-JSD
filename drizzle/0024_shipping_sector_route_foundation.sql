CREATE TABLE "shipping_regions" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"country_code" varchar(10) NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(100) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipping_route_rates" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"route_id" varchar(255) NOT NULL,
	"service_id" varchar(255) NOT NULL,
	"min_weight_kg" numeric(8, 3) NOT NULL,
	"max_weight_kg" numeric(8, 3) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" varchar(10) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"valid_from" timestamp,
	"valid_until" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_route_rates_min_weight_check" CHECK ("shipping_route_rates"."min_weight_kg" >= 0),
	CONSTRAINT "shipping_route_rates_max_gt_min_check" CHECK ("shipping_route_rates"."max_weight_kg" > "shipping_route_rates"."min_weight_kg"),
	CONSTRAINT "shipping_route_rates_amount_check" CHECK ("shipping_route_rates"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "shipping_routes" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"country_code" varchar(10) NOT NULL,
	"origin_sector_id" varchar(255) NOT NULL,
	"destination_sector_id" varchar(255) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipping_sectors" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"country_code" varchar(10) NOT NULL,
	"region_id" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(100) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipping_services" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"country_code" varchar(10) NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(100) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shipping_regions" ADD CONSTRAINT "shipping_regions_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_route_rates" ADD CONSTRAINT "shipping_route_rates_route_id_shipping_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."shipping_routes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_route_rates" ADD CONSTRAINT "shipping_route_rates_service_id_shipping_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."shipping_services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_routes" ADD CONSTRAINT "shipping_routes_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_routes" ADD CONSTRAINT "shipping_routes_origin_sector_id_shipping_sectors_id_fk" FOREIGN KEY ("origin_sector_id") REFERENCES "public"."shipping_sectors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_routes" ADD CONSTRAINT "shipping_routes_destination_sector_id_shipping_sectors_id_fk" FOREIGN KEY ("destination_sector_id") REFERENCES "public"."shipping_sectors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_sectors" ADD CONSTRAINT "shipping_sectors_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_sectors" ADD CONSTRAINT "shipping_sectors_region_id_shipping_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."shipping_regions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_services" ADD CONSTRAINT "shipping_services_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_regions_country_code_uq" ON "shipping_regions" USING btree ("country_code","code");--> statement-breakpoint
CREATE INDEX "shipping_regions_country_idx" ON "shipping_regions" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "shipping_route_rates_route_idx" ON "shipping_route_rates" USING btree ("route_id");--> statement-breakpoint
CREATE INDEX "shipping_route_rates_service_idx" ON "shipping_route_rates" USING btree ("service_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_routes_country_origin_dest_uq" ON "shipping_routes" USING btree ("country_code","origin_sector_id","destination_sector_id");--> statement-breakpoint
CREATE INDEX "shipping_routes_origin_idx" ON "shipping_routes" USING btree ("origin_sector_id");--> statement-breakpoint
CREATE INDEX "shipping_routes_destination_idx" ON "shipping_routes" USING btree ("destination_sector_id");--> statement-breakpoint
CREATE INDEX "shipping_routes_country_idx" ON "shipping_routes" USING btree ("country_code");--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_sectors_country_code_uq" ON "shipping_sectors" USING btree ("country_code","code");--> statement-breakpoint
CREATE INDEX "shipping_sectors_region_idx" ON "shipping_sectors" USING btree ("region_id");--> statement-breakpoint
CREATE INDEX "shipping_sectors_country_idx" ON "shipping_sectors" USING btree ("country_code");--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_services_country_code_uq" ON "shipping_services" USING btree ("country_code","code");