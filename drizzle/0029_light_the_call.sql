ALTER TABLE "order_items" ADD COLUMN "fulfillment_location_id" varchar(255);--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "origin_shipping_sector_id" varchar(255);--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "shipping_route_id" varchar(255);--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "shipping_service_id" varchar(255);--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "shipping_service_code" varchar(100);--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "shipping_rate_id" varchar(255);--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "unit_weight_kg" numeric(8, 3);--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "total_weight_kg" numeric(8, 3);--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "shipping_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_fulfillment_location_id_fulfillment_locations_id_fk" FOREIGN KEY ("fulfillment_location_id") REFERENCES "public"."fulfillment_locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_origin_shipping_sector_id_shipping_sectors_id_fk" FOREIGN KEY ("origin_shipping_sector_id") REFERENCES "public"."shipping_sectors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_shipping_route_id_shipping_routes_id_fk" FOREIGN KEY ("shipping_route_id") REFERENCES "public"."shipping_routes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_shipping_service_id_shipping_services_id_fk" FOREIGN KEY ("shipping_service_id") REFERENCES "public"."shipping_services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_shipping_rate_id_shipping_route_rates_id_fk" FOREIGN KEY ("shipping_rate_id") REFERENCES "public"."shipping_route_rates"("id") ON DELETE restrict ON UPDATE no action;