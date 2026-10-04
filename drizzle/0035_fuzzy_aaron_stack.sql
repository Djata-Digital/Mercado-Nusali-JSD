CREATE TABLE "banners" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"title" varchar(120) NOT NULL,
	"subtitle" varchar(300),
	"tag_text" varchar(40),
	"badge_text" varchar(60),
	"cta_label" varchar(40),
	"cta_type" varchar(20),
	"cta_target" varchar(500),
	"desktop_image_url" text,
	"desktop_image_key" varchar(500),
	"mobile_image_url" text,
	"mobile_image_key" varchar(500),
	"bg_style" varchar(20) DEFAULT 'blue' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"starts_at" timestamp,
	"ends_at" timestamp,
	"country_code" varchar(10),
	"created_by" varchar(255),
	"updated_by" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "banners_status_check" CHECK ("banners"."status" IN ('draft','active','inactive')),
	CONSTRAINT "banners_cta_type_check" CHECK ("banners"."cta_type" IS NULL OR "banners"."cta_type" IN ('internal','external')),
	CONSTRAINT "banners_cta_complete_check" CHECK (("banners"."cta_label" IS NULL AND "banners"."cta_type" IS NULL AND "banners"."cta_target" IS NULL) OR ("banners"."cta_label" IS NOT NULL AND "banners"."cta_type" IS NOT NULL AND "banners"."cta_target" IS NOT NULL)),
	CONSTRAINT "banners_bg_style_check" CHECK ("banners"."bg_style" IN ('blue','emerald','slate')),
	CONSTRAINT "banners_dates_check" CHECK ("banners"."starts_at" IS NULL OR "banners"."ends_at" IS NULL OR "banners"."starts_at" < "banners"."ends_at"),
	CONSTRAINT "banners_image_pair_check" CHECK ((("banners"."desktop_image_url" IS NULL) = ("banners"."desktop_image_key" IS NULL)) AND (("banners"."mobile_image_url" IS NULL) = ("banners"."mobile_image_key" IS NULL)))
);
--> statement-breakpoint
ALTER TABLE "banners" ADD CONSTRAINT "banners_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "banners" ADD CONSTRAINT "banners_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "banners" ADD CONSTRAINT "banners_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "banners_status_order_idx" ON "banners" USING btree ("status","sort_order");--> statement-breakpoint
CREATE INDEX "banners_period_idx" ON "banners" USING btree ("starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "banners_country_idx" ON "banners" USING btree ("country_code");