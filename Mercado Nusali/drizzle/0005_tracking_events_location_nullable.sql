-- Non-destructive migration to drop NOT NULL constraint on tracking_events.location
BEGIN;

ALTER TABLE "tracking_events" ALTER COLUMN "location" DROP NOT NULL;

COMMIT;
