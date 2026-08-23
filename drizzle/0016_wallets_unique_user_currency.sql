-- Fase 6 — correção do achado CRÍTICO C (escrow release / wallet multi-moeda).
-- Antes: UNIQUE(user_id) — uma única wallet por usuário, sem distinção de moeda.
-- Depois: UNIQUE(user_id, currency) — um vendedor que recebe em BRL e XOF passa
-- a ter duas linhas em wallets, nunca um saldo único somando moedas diferentes.
--
-- Aditiva e segura: não apaga nem reescreve nenhuma linha. Auditoria prévia
-- (Fase 6, item 5) confirmou 0 usuários com mais de uma wallet hoje — a troca
-- de constraint não pode falhar por conflito de dado existente.
ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "wallets_user_id_unique";

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "wallets_user_currency_uq" ON "wallets" ("user_id", "currency");
