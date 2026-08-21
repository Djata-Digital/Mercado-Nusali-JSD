-- Non-destructive migration to add status column to order_items for per-allocation tracking
BEGIN;

ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "status" varchar(50) DEFAULT 'pending_preparation' NOT NULL;

COMMIT;
