ALTER TABLE "seller_bank_accounts" ALTER COLUMN "bank_name" DROP NOT NULL;
ALTER TABLE "seller_bank_accounts" ALTER COLUMN "account_number" DROP NOT NULL;
ALTER TABLE "seller_bank_accounts" ADD COLUMN IF NOT EXISTS "account_type" varchar(50) DEFAULT 'bank_transfer' NOT NULL;
