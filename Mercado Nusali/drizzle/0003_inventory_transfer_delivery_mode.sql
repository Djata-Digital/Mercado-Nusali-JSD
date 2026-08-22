-- Non-destructive migration for inventory_transfers delivery_mode (nullable for legacy) and pickup_snapshot_json
BEGIN;

ALTER TABLE "inventory_transfers" ADD COLUMN IF NOT EXISTS "delivery_mode" varchar(50);
ALTER TABLE "inventory_transfers" ADD COLUMN IF NOT EXISTS "pickup_snapshot_json" jsonb;

COMMIT;
