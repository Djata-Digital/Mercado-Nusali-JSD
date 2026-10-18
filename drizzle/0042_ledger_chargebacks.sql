CREATE TABLE "chargeback_allocations" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"chargeback_id" varchar(255) NOT NULL,
	"order_id" varchar(255) NOT NULL,
	"payment_id" varchar(255) NOT NULL,
	"allocated_value" numeric(12, 2) NOT NULL,
	"currency" varchar(10) NOT NULL,
	"order_total" numeric(12, 2) NOT NULL,
	"release_stage" varchar(20) NOT NULL,
	"overlap_refund" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chargeback_allocations_value_check" CHECK ("chargeback_allocations"."allocated_value" > 0 AND "chargeback_allocations"."allocated_value" <= "chargeback_allocations"."order_total"),
	CONSTRAINT "chargeback_allocations_stage_check" CHECK ("chargeback_allocations"."release_stage" IN ('BEFORE_RELEASE','AFTER_RELEASE'))
);
--> statement-breakpoint
CREATE TABLE "chargeback_decision_lines" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"decision_id" varchar(255) NOT NULL,
	"allocation_id" varchar(255) NOT NULL,
	"party_type" varchar(20) NOT NULL,
	"party_ref" varchar(255),
	"contract_reference" text,
	"amount" numeric(12, 2) NOT NULL,
	CONSTRAINT "chargeback_decision_lines_amount_check" CHECK ("chargeback_decision_lines"."amount" > 0),
	CONSTRAINT "chargeback_decision_lines_party_check" CHECK ("chargeback_decision_lines"."party_type" IN ('SELLER','NUSALI','THIRD_PARTY') AND ("chargeback_decision_lines"."party_type" = 'NUSALI' OR "chargeback_decision_lines"."party_ref" IS NOT NULL) AND ("chargeback_decision_lines"."party_type" <> 'THIRD_PARTY' OR "chargeback_decision_lines"."contract_reference" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "chargeback_decisions" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"chargeback_id" varchar(255) NOT NULL,
	"version" integer NOT NULL,
	"status" varchar(20) NOT NULL,
	"cause_code" varchar(30) NOT NULL,
	"cause_detail" text,
	"rationale" text NOT NULL,
	"parties_heard" text NOT NULL,
	"contract_basis" text,
	"evidence_ids_json" jsonb NOT NULL,
	"evidence_hash" varchar(64) NOT NULL,
	"supersedes_decision_id" varchar(255),
	"revision_reason" text,
	"proposed_by" varchar(255) NOT NULL,
	"approved_by" varchar(255),
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chargeback_decisions_status_check" CHECK ("chargeback_decisions"."status" IN ('PROPOSED','APPROVED','SUPERSEDED','REJECTED')),
	CONSTRAINT "chargeback_decisions_cause_check" CHECK ("chargeback_decisions"."cause_code" IN ('SELLER_FAULT','NUSALI_FAULT','LOGISTICS_FAULT','EXTERNAL_FRAUD','SHARED','INDETERMINATE')),
	CONSTRAINT "chargeback_decisions_four_eyes_check" CHECK ("chargeback_decisions"."approved_by" IS NULL OR "chargeback_decisions"."approved_by" <> "chargeback_decisions"."proposed_by")
);
--> statement-breakpoint
CREATE TABLE "chargeback_evidence" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"chargeback_id" varchar(255) NOT NULL,
	"kind" varchar(50) NOT NULL,
	"description" text NOT NULL,
	"file_ref" text,
	"sha256" varchar(64),
	"added_by" varchar(255) NOT NULL,
	"added_by_role" varchar(50) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chargeback_evidence_sha_check" CHECK ("chargeback_evidence"."sha256" IS NULL OR length("chargeback_evidence"."sha256") = 64)
);
--> statement-breakpoint
CREATE TABLE "chargeback_recoveries" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"allocation_id" varchar(255) NOT NULL,
	"decision_id" varchar(255) NOT NULL,
	"kind" varchar(20) NOT NULL,
	"party_ref" varchar(255) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" varchar(10) NOT NULL,
	"evidence_ref" text NOT NULL,
	"reason" text NOT NULL,
	"performed_by" varchar(255) NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chargeback_recoveries_kind_check" CHECK ("chargeback_recoveries"."kind" IN ('RECOVERY','WRITE_OFF') AND "chargeback_recoveries"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "ledger_accounts" DROP CONSTRAINT "ledger_accounts_code_check";--> statement-breakpoint
ALTER TABLE "ledger_outbox_events" DROP CONSTRAINT "ledger_outbox_events_type_check";--> statement-breakpoint
ALTER TABLE "ledger_transactions" DROP CONSTRAINT "ledger_transactions_type_check";--> statement-breakpoint
ALTER TABLE "chargeback_allocations" ADD CONSTRAINT "chargeback_allocations_chargeback_id_payment_chargebacks_id_fk" FOREIGN KEY ("chargeback_id") REFERENCES "public"."payment_chargebacks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chargeback_allocations" ADD CONSTRAINT "chargeback_allocations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chargeback_allocations" ADD CONSTRAINT "chargeback_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chargeback_decision_lines" ADD CONSTRAINT "chargeback_decision_lines_decision_id_chargeback_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."chargeback_decisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chargeback_decision_lines" ADD CONSTRAINT "chargeback_decision_lines_allocation_id_chargeback_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."chargeback_allocations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chargeback_decisions" ADD CONSTRAINT "chargeback_decisions_chargeback_id_payment_chargebacks_id_fk" FOREIGN KEY ("chargeback_id") REFERENCES "public"."payment_chargebacks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chargeback_decisions" ADD CONSTRAINT "chargeback_decisions_proposed_by_users_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chargeback_decisions" ADD CONSTRAINT "chargeback_decisions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chargeback_evidence" ADD CONSTRAINT "chargeback_evidence_chargeback_id_payment_chargebacks_id_fk" FOREIGN KEY ("chargeback_id") REFERENCES "public"."payment_chargebacks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chargeback_evidence" ADD CONSTRAINT "chargeback_evidence_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chargeback_recoveries" ADD CONSTRAINT "chargeback_recoveries_allocation_id_chargeback_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."chargeback_allocations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chargeback_recoveries" ADD CONSTRAINT "chargeback_recoveries_decision_id_chargeback_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."chargeback_decisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chargeback_recoveries" ADD CONSTRAINT "chargeback_recoveries_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chargeback_allocations_chargeback_order_uq" ON "chargeback_allocations" USING btree ("chargeback_id","order_id");--> statement-breakpoint
CREATE INDEX "chargeback_allocations_order_idx" ON "chargeback_allocations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "chargeback_decision_lines_decision_idx" ON "chargeback_decision_lines" USING btree ("decision_id");--> statement-breakpoint
CREATE INDEX "chargeback_decision_lines_allocation_idx" ON "chargeback_decision_lines" USING btree ("allocation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chargeback_decisions_version_uq" ON "chargeback_decisions" USING btree ("chargeback_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "chargeback_decisions_one_approved_uq" ON "chargeback_decisions" USING btree ("chargeback_id") WHERE "chargeback_decisions"."status" = 'APPROVED';--> statement-breakpoint
CREATE INDEX "chargeback_evidence_chargeback_idx" ON "chargeback_evidence" USING btree ("chargeback_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chargeback_recoveries_idempotency_uq" ON "chargeback_recoveries" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "chargeback_recoveries_allocation_idx" ON "chargeback_recoveries" USING btree ("allocation_id");--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_code_check" CHECK ("ledger_accounts"."code" IN ('PAYMENT_CLEARING','BUYER_ESCROW','SELLER_PAYABLE','SELLER_AVAILABLE','SELLER_PAYOUT_CLEARING','NUSALI_COMMISSION_REVENUE','SHIPPING_PAYABLE','SHIPPING_SUBSIDY_NUSALI','TAX_PAYABLE','REFUND_PAYABLE','CHARGEBACK_RECEIVABLE','PAYMENT_PROCESSOR_FEES','NUSALI_PROMOTION_EXPENSE','REFUND_ABSORBED_SHIPPING','CHARGEBACK_LOSS'));--> statement-breakpoint
ALTER TABLE "ledger_outbox_events" ADD CONSTRAINT "ledger_outbox_events_type_check" CHECK ("ledger_outbox_events"."event_type" IN ('PAYMENT_RECEIVED','ORDER_DELIVERY_CONFIRMED','REFUND_PROCESSED','SHIPPING_COST_REVERSED','CHARGEBACK_CONFIRMED','CHARGEBACK_ALLOCATED','CHARGEBACK_RECOVERY','CHARGEBACK_WRITE_OFF'));--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_type_check" CHECK ("ledger_transactions"."type" IN ('PAYMENT_RECEIVED','ORDER_DELIVERY_CONFIRMED','REFUND_PROCESSED','SHIPPING_COST_REVERSED','CHARGEBACK_CONFIRMED','CHARGEBACK_ALLOCATED','CHARGEBACK_RECOVERY','CHARGEBACK_WRITE_OFF'));--> statement-breakpoint
CREATE OR REPLACE FUNCTION nusali_chargeback_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% % é um registro financeiro/probatório imutável (sem UPDATE/DELETE): registre um novo, nunca altere o anterior.', TG_TABLE_NAME, OLD."id";
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER nusali_chargeback_trg_allocations_immutable BEFORE UPDATE OR DELETE ON "chargeback_allocations" FOR EACH ROW EXECUTE FUNCTION nusali_chargeback_immutable();
--> statement-breakpoint
CREATE TRIGGER nusali_chargeback_trg_evidence_immutable BEFORE UPDATE OR DELETE ON "chargeback_evidence" FOR EACH ROW EXECUTE FUNCTION nusali_chargeback_immutable();
--> statement-breakpoint
CREATE TRIGGER nusali_chargeback_trg_lines_immutable BEFORE UPDATE OR DELETE ON "chargeback_decision_lines" FOR EACH ROW EXECUTE FUNCTION nusali_chargeback_immutable();
--> statement-breakpoint
CREATE TRIGGER nusali_chargeback_trg_recoveries_immutable BEFORE UPDATE OR DELETE ON "chargeback_recoveries" FOR EACH ROW EXECUTE FUNCTION nusali_chargeback_immutable();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION nusali_chargeback_decision_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'chargeback_decisions % não pode ser apagada: revise com uma nova versão.', OLD."id";
  END IF;
  IF NEW."chargeback_id" IS DISTINCT FROM OLD."chargeback_id" OR NEW."version" IS DISTINCT FROM OLD."version"
    OR NEW."cause_code" IS DISTINCT FROM OLD."cause_code" OR NEW."cause_detail" IS DISTINCT FROM OLD."cause_detail"
    OR NEW."rationale" IS DISTINCT FROM OLD."rationale" OR NEW."parties_heard" IS DISTINCT FROM OLD."parties_heard"
    OR NEW."contract_basis" IS DISTINCT FROM OLD."contract_basis" OR NEW."evidence_ids_json" IS DISTINCT FROM OLD."evidence_ids_json"
    OR NEW."evidence_hash" IS DISTINCT FROM OLD."evidence_hash" OR NEW."supersedes_decision_id" IS DISTINCT FROM OLD."supersedes_decision_id"
    OR NEW."revision_reason" IS DISTINCT FROM OLD."revision_reason" OR NEW."proposed_by" IS DISTINCT FROM OLD."proposed_by"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'chargeback_decisions %: o conteúdo da decisão é imutável; só o estado pode avançar (PROPOSED→APPROVED/REJECTED, APPROVED→SUPERSEDED).', OLD."id";
  END IF;
  IF NOT ((OLD."status" = 'PROPOSED' AND NEW."status" IN ('APPROVED','REJECTED'))
       OR (OLD."status" = 'APPROVED' AND NEW."status" = 'SUPERSEDED')
       OR (OLD."status" = NEW."status" AND NEW."approved_by" IS NOT DISTINCT FROM OLD."approved_by" AND NEW."approved_at" IS NOT DISTINCT FROM OLD."approved_at")) THEN
    RAISE EXCEPTION 'chargeback_decisions %: transição de estado inválida (% → %).', OLD."id", OLD."status", NEW."status";
  END IF;
  IF NEW."status" = 'APPROVED' AND OLD."status" = 'PROPOSED' AND (NEW."approved_by" IS NULL OR NEW."approved_at" IS NULL) THEN
    RAISE EXCEPTION 'chargeback_decisions %: aprovação exige approved_by e approved_at.', OLD."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER nusali_chargeback_trg_decision_guard BEFORE UPDATE OR DELETE ON "chargeback_decisions" FOR EACH ROW EXECUTE FUNCTION nusali_chargeback_decision_guard();
