ALTER TABLE "shipments"
ALTER COLUMN "origin_country" DROP DEFAULT;

--> statement-breakpoint

ALTER TABLE "shipments"
ALTER COLUMN "destination_country" DROP DEFAULT;
