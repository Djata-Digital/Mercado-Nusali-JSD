-- Fase "Payout multi-moeda": adiciona chave de idempotência à solicitação de
-- saque — hoje a única "proteção" (`payout_request:{payoutId}`) usava um ID
-- gerado a cada chamada, então nunca protegia nada de verdade contra um retry
-- de rede reenviando a mesma solicitação e reservando saldo duas vezes.
-- Aditiva: coluna nullable (payouts antigos nunca tiveram essa chave), índice
-- único só sobre valores não-nulos.
ALTER TABLE "seller_payouts" ADD COLUMN IF NOT EXISTS "idempotency_key" varchar(255);

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "seller_payouts_idempotency_uq" ON "seller_payouts" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL;
