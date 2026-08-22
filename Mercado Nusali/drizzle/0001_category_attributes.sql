CREATE TABLE IF NOT EXISTS "category_attributes" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"category_id" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(100) NOT NULL,
	"type" varchar(50) DEFAULT 'text' NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"options_json" jsonb,
	"placeholder" varchar(255),
	"help_text" text,
	"unit" varchar(50),
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "category_attributes" ADD CONSTRAINT "category_attributes_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "category_attributes_cat_idx" ON "category_attributes" USING btree ("category_id");
