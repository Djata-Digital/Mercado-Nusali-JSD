ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "commission_rate" numeric(5, 2);
--> statement-breakpoint
ALTER TABLE "store_shipping_policies" ADD COLUMN IF NOT EXISTS "marketplace_subsidy_max_amount" numeric(12, 2);
--> statement-breakpoint
ALTER TABLE "store_shipping_policies" ADD COLUMN IF NOT EXISTS "marketplace_subsidy_percent" numeric(5, 2);
--> statement-breakpoint
-- commission_rate já é nullable desde a migration 0000 (sem NOT NULL). O único problema
-- era o DEFAULT '8.00' técnico, que fazia todo seller novo parecer "comercialmente
-- configurado" mesmo sem nenhuma comissão negociada. DROP DEFAULT não altera nenhuma
-- linha existente — apenas faz com que futuros INSERTs que omitam a coluna resultem em NULL.
ALTER TABLE "sellers" ALTER COLUMN "commission_rate" DROP DEFAULT;
