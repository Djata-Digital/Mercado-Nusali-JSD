CREATE TABLE IF NOT EXISTS "payment_customers" (
  "id" varchar(255) PRIMARY KEY NOT NULL,
  "user_id" varchar(255) NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "provider" varchar(50) NOT NULL,
  "provider_customer_id" varchar(255) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "payment_customers_user_provider_uq" UNIQUE("user_id", "provider")
);

CREATE INDEX IF NOT EXISTS "payment_customers_user_idx" ON "payment_customers" ("user_id");
