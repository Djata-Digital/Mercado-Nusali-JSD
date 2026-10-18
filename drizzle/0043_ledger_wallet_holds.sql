CREATE TABLE "wallet_holds" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"wallet_id" varchar(255) NOT NULL,
	"currency" varchar(10) NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"reason" text NOT NULL,
	"evidence_ref" text NOT NULL,
	"reference_type" varchar(60) NOT NULL,
	"reference_id" varchar(255) NOT NULL,
	"ledger_transaction_id" varchar(255),
	"created_by" varchar(255) NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"released_by" varchar(255),
	"released_at" timestamp,
	"release_reason" text,
	"release_evidence_ref" text,
	CONSTRAINT "wallet_holds_amount_check" CHECK ("wallet_holds"."amount" > 0),
	CONSTRAINT "wallet_holds_status_check" CHECK ("wallet_holds"."status" IN ('ACTIVE','RELEASED')),
	CONSTRAINT "wallet_holds_release_check" CHECK (("wallet_holds"."status" = 'ACTIVE' AND "wallet_holds"."released_by" IS NULL AND "wallet_holds"."released_at" IS NULL AND "wallet_holds"."release_reason" IS NULL AND "wallet_holds"."release_evidence_ref" IS NULL) OR ("wallet_holds"."status" = 'RELEASED' AND "wallet_holds"."released_by" IS NOT NULL AND "wallet_holds"."released_at" IS NOT NULL AND COALESCE(length(btrim("wallet_holds"."release_reason")), 0) >= 10 AND COALESCE(length(btrim("wallet_holds"."release_evidence_ref")), 0) >= 5)),
	CONSTRAINT "wallet_holds_four_eyes_check" CHECK ("wallet_holds"."released_by" IS NULL OR "wallet_holds"."released_by" <> "wallet_holds"."created_by"),
	CONSTRAINT "wallet_holds_evidence_check" CHECK (COALESCE(length(btrim("wallet_holds"."evidence_ref")), 0) >= 5)
);
--> statement-breakpoint
ALTER TABLE "wallet_holds" ADD CONSTRAINT "wallet_holds_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_holds" ADD CONSTRAINT "wallet_holds_ledger_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("ledger_transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_holds" ADD CONSTRAINT "wallet_holds_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_holds" ADD CONSTRAINT "wallet_holds_released_by_users_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_holds_idempotency_uq" ON "wallet_holds" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_holds_active_ref_uq" ON "wallet_holds" USING btree ("wallet_id","reference_type","reference_id") WHERE "wallet_holds"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "wallet_holds_wallet_active_idx" ON "wallet_holds" USING btree ("wallet_id") WHERE "wallet_holds"."status" = 'ACTIVE';--> statement-breakpoint
CREATE OR REPLACE FUNCTION nusali_wallet_hold_guard() RETURNS trigger AS $$
DECLARE
  w_balance numeric;
  w_currency varchar;
  held numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'wallet_holds % é um registro financeiro com trilha de auditoria (sem DELETE): libere a retenção, nunca a apague.', OLD."id";
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'ACTIVE' THEN
      RAISE EXCEPTION 'wallet_holds: uma retenção nasce ACTIVE (recebido %).', NEW."status";
    END IF;
    -- trava a carteira (mesma trava do saque) e garante, também no banco, que retido ≤ saldo: o disponível nunca fica negativo por uma retenção
    SELECT "balance", "currency" INTO w_balance, w_currency FROM "wallets" WHERE "id" = NEW."wallet_id" FOR UPDATE;
    IF w_currency IS NULL THEN
      RAISE EXCEPTION 'wallet_holds: carteira % inexistente.', NEW."wallet_id";
    END IF;
    IF NEW."currency" <> w_currency THEN
      RAISE EXCEPTION 'wallet_holds: moeda da retenção (%) difere da moeda da carteira (%).', NEW."currency", w_currency;
    END IF;
    SELECT COALESCE(SUM("amount"), 0) INTO held FROM "wallet_holds" WHERE "wallet_id" = NEW."wallet_id" AND "status" = 'ACTIVE';
    IF held + NEW."amount" > w_balance THEN
      RAISE EXCEPTION 'wallet_holds: retido (% + %) excederia o saldo da carteira (%): o disponível não pode ficar negativo.', held, NEW."amount", w_balance;
    END IF;
    RETURN NEW;
  END IF;
  -- UPDATE: só ACTIVE -> RELEASED (preenchendo quem/quando/motivo); todo o resto é imutável
  IF OLD."status" <> 'ACTIVE' THEN
    RAISE EXCEPTION 'wallet_holds % já foi liberada: o histórico é imutável.', OLD."id";
  END IF;
  IF NEW."status" <> 'RELEASED'
     OR NEW."id" IS DISTINCT FROM OLD."id" OR NEW."wallet_id" IS DISTINCT FROM OLD."wallet_id" OR NEW."currency" IS DISTINCT FROM OLD."currency"
     OR NEW."amount" IS DISTINCT FROM OLD."amount" OR NEW."reason" IS DISTINCT FROM OLD."reason" OR NEW."evidence_ref" IS DISTINCT FROM OLD."evidence_ref"
     OR NEW."reference_type" IS DISTINCT FROM OLD."reference_type" OR NEW."reference_id" IS DISTINCT FROM OLD."reference_id"
     OR NEW."ledger_transaction_id" IS DISTINCT FROM OLD."ledger_transaction_id" OR NEW."created_by" IS DISTINCT FROM OLD."created_by"
     OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key" OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'wallet_holds %: só é permitido liberar (ACTIVE -> RELEASED); valor, carteira, referência e autoria são imutáveis.', OLD."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER nusali_wallet_hold_trg_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "wallet_holds"
  FOR EACH ROW EXECUTE FUNCTION nusali_wallet_hold_guard();
