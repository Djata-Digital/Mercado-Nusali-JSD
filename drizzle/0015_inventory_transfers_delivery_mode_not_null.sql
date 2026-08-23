ALTER TABLE "inventory_transfers"
ALTER COLUMN "delivery_mode" SET DEFAULT 'NUSALI_PICKUP';

--> statement-breakpoint

ALTER TABLE "inventory_transfers"
ALTER COLUMN "delivery_mode" SET NOT NULL;
