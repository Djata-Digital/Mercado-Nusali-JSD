-- Fase "Refund/disputa/chargeback": a tabela refunds existia desde a migration
-- 0000 mas nenhum código nunca escreveu nela — nenhuma reversão financeira real
-- acontecia, só mudanças de status em disputes/payments. Esta migration adiciona
-- só o que falta para tornar refund seguro e auditável: idempotência (mesmo
-- padrão já usado em seller_payouts) e o valor exato debitado do vendedor.
ALTER TABLE "refunds" ADD COLUMN IF NOT EXISTS "seller_debit_amount" numeric(12, 2);

--> statement-breakpoint

ALTER TABLE "refunds" ADD COLUMN IF NOT EXISTS "idempotency_key" varchar(255);

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "refunds_idempotency_uq" ON "refunds" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL;
