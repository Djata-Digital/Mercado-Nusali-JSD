ALTER TABLE "orders"
ALTER COLUMN "payment_method" DROP NOT NULL;

--> statement-breakpoint

ALTER TABLE "orders"
ALTER COLUMN "escrow_status" SET DEFAULT 'pending';

--> statement-breakpoint

ALTER TABLE "shipments"
ALTER COLUMN "carrier" DROP NOT NULL;
