CREATE TABLE "shipping_route_service_lead_times" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"route_id" varchar(255) NOT NULL,
	"service_id" varchar(255) NOT NULL,
	"min_days" integer NOT NULL,
	"max_days" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_lead_times_min_check" CHECK ("shipping_route_service_lead_times"."min_days" >= 1),
	CONSTRAINT "shipping_lead_times_max_check" CHECK ("shipping_route_service_lead_times"."max_days" >= "shipping_route_service_lead_times"."min_days" AND "shipping_route_service_lead_times"."max_days" <= 365)
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "delivery_estimate_min_days" integer;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "delivery_estimate_max_days" integer;--> statement-breakpoint
ALTER TABLE "shipping_route_service_lead_times" ADD CONSTRAINT "shipping_route_service_lead_times_route_id_shipping_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."shipping_routes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_route_service_lead_times" ADD CONSTRAINT "shipping_route_service_lead_times_service_id_shipping_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."shipping_services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_lead_times_route_service_uq" ON "shipping_route_service_lead_times" USING btree ("route_id","service_id");--> statement-breakpoint
CREATE INDEX "shipping_lead_times_service_idx" ON "shipping_route_service_lead_times" USING btree ("service_id");