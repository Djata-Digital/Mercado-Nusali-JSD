CREATE TABLE "ledger_outbox_events" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"order_id" varchar(255) NOT NULL,
	"purchase_group_id" varchar(255),
	"payment_id" varchar(255),
	"status" varchar(30) DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 8 NOT NULL,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"locked_by" varchar(100),
	"locked_until" timestamp,
	"last_attempt_at" timestamp,
	"last_error_code" varchar(100),
	"last_error" text,
	"snapshot_json" jsonb NOT NULL,
	"snapshot_hash" varchar(64) NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"cutoff_at" timestamp,
	"source" varchar(100),
	"correlation_id" varchar(255),
	"ledger_transaction_id" varchar(255),
	"processed_at" timestamp,
	"resolved_by" varchar(255),
	"resolution_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_outbox_events_type_check" CHECK ("ledger_outbox_events"."event_type" IN ('PAYMENT_RECEIVED','ORDER_DELIVERY_CONFIRMED')),
	CONSTRAINT "ledger_outbox_events_status_check" CHECK ("ledger_outbox_events"."status" IN ('PENDING','PROCESSING','RETRYING','DONE','SKIPPED','NEEDS_INTERVENTION','DISMISSED')),
	CONSTRAINT "ledger_outbox_events_attempts_check" CHECK ("ledger_outbox_events"."attempts" >= 0 AND "ledger_outbox_events"."max_attempts" >= 1),
	CONSTRAINT "ledger_outbox_events_hash_check" CHECK (char_length("ledger_outbox_events"."snapshot_hash") = 64)
);
--> statement-breakpoint
CREATE TABLE "ledger_reconciliation_findings" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"fingerprint" varchar(255) NOT NULL,
	"finding_type" varchar(60) NOT NULL,
	"severity" varchar(20) NOT NULL,
	"order_id" varchar(255),
	"event_id" varchar(255),
	"ledger_transaction_id" varchar(255),
	"expected_json" jsonb,
	"actual_json" jsonb,
	"detail" text,
	"status" varchar(20) DEFAULT 'OPEN' NOT NULL,
	"seen_count" integer DEFAULT 1 NOT NULL,
	"first_seen_run_id" varchar(255),
	"last_seen_run_id" varchar(255),
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	"resolved_by_run_id" varchar(255),
	"acknowledged_by" varchar(255),
	"acknowledge_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_reconciliation_findings_severity_check" CHECK ("ledger_reconciliation_findings"."severity" IN ('INFO','WARNING','CRITICAL')),
	CONSTRAINT "ledger_reconciliation_findings_status_check" CHECK ("ledger_reconciliation_findings"."status" IN ('OPEN','ACKNOWLEDGED','RESOLVED'))
);
--> statement-breakpoint
CREATE TABLE "ledger_reconciliation_runs" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"status" varchar(20) DEFAULT 'RUNNING' NOT NULL,
	"triggered_by" varchar(255),
	"cutoff_at" timestamp,
	"scanned_orders" integer DEFAULT 0 NOT NULL,
	"open_findings" integer DEFAULT 0 NOT NULL,
	"summary_json" jsonb,
	"error_message" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	CONSTRAINT "ledger_reconciliation_runs_status_check" CHECK ("ledger_reconciliation_runs"."status" IN ('RUNNING','COMPLETED','FAILED'))
);
--> statement-breakpoint
ALTER TABLE "ledger_outbox_events" ADD CONSTRAINT "ledger_outbox_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_outbox_events_idempotency_uq" ON "ledger_outbox_events" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "ledger_outbox_events_claim_idx" ON "ledger_outbox_events" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "ledger_outbox_events_order_idx" ON "ledger_outbox_events" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_reconciliation_findings_open_uq" ON "ledger_reconciliation_findings" USING btree ("fingerprint") WHERE "ledger_reconciliation_findings"."status" <> 'RESOLVED';--> statement-breakpoint
CREATE INDEX "ledger_reconciliation_findings_status_idx" ON "ledger_reconciliation_findings" USING btree ("status","severity");--> statement-breakpoint
CREATE INDEX "ledger_reconciliation_findings_order_idx" ON "ledger_reconciliation_findings" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "ledger_reconciliation_runs_started_idx" ON "ledger_reconciliation_runs" USING btree ("started_at");

--> statement-breakpoint
-- ============================================================================
-- Trilha de auditoria IMUTÁVEL (mesma disciplina do ledger, migração 0011): eventos do outbox e divergências da reconciliação nunca são apagados;
-- os campos que definem O QUE foi enfileirado nunca mudam; DONE é terminal. O estado de processamento (status/tentativas/erro/lease) é o único mutável.
-- ============================================================================
CREATE OR REPLACE FUNCTION nusali_outbox_prevent_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% % não pode ser apagado (trilha de auditoria). Para descartar um evento use o estado DISMISSED com justificativa.', TG_TABLE_NAME, OLD."id";
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER nusali_outbox_trg_prevent_delete
  BEFORE DELETE ON "ledger_outbox_events"
  FOR EACH ROW EXECUTE FUNCTION nusali_outbox_prevent_delete();
--> statement-breakpoint
CREATE TRIGGER nusali_outbox_trg_findings_prevent_delete
  BEFORE DELETE ON "ledger_reconciliation_findings"
  FOR EACH ROW EXECUTE FUNCTION nusali_outbox_prevent_delete();
--> statement-breakpoint
CREATE TRIGGER nusali_outbox_trg_runs_prevent_delete
  BEFORE DELETE ON "ledger_reconciliation_runs"
  FOR EACH ROW EXECUTE FUNCTION nusali_outbox_prevent_delete();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION nusali_outbox_enforce_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW."event_type" IS DISTINCT FROM OLD."event_type"
    OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
    OR NEW."order_id" IS DISTINCT FROM OLD."order_id"
    OR NEW."snapshot_json" IS DISTINCT FROM OLD."snapshot_json"
    OR NEW."snapshot_hash" IS DISTINCT FROM OLD."snapshot_hash"
    OR NEW."occurred_at" IS DISTINCT FROM OLD."occurred_at"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
  THEN
    RAISE EXCEPTION 'ledger_outbox_events %: os campos que definem o evento (tipo, chave, pedido, snapshot, hora do evento) são imutáveis.', OLD."id";
  END IF;
  IF OLD."status" = 'DONE' AND NEW."status" <> 'DONE' THEN
    RAISE EXCEPTION 'ledger_outbox_events % está DONE (lançamento já feito) — estado terminal, não pode ser reaberto.', OLD."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER nusali_outbox_trg_enforce_immutable
  BEFORE UPDATE ON "ledger_outbox_events"
  FOR EACH ROW EXECUTE FUNCTION nusali_outbox_enforce_immutable();
