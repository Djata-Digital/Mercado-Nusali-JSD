ALTER TABLE "ledger_outbox_events" DROP CONSTRAINT "ledger_outbox_events_type_check";--> statement-breakpoint
ALTER TABLE "ledger_transactions" DROP CONSTRAINT "ledger_transactions_type_check";--> statement-breakpoint
ALTER TABLE "ledger_outbox_events" ALTER COLUMN "order_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_outbox_events" ADD COLUMN "payout_id" varchar(255);--> statement-breakpoint
ALTER TABLE "ledger_outbox_events" ADD CONSTRAINT "ledger_outbox_events_payout_id_seller_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."seller_payouts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_outbox_events_payout_idx" ON "ledger_outbox_events" USING btree ("payout_id");--> statement-breakpoint
ALTER TABLE "ledger_outbox_events" ADD CONSTRAINT "ledger_outbox_events_subject_check" CHECK ("ledger_outbox_events"."order_id" IS NOT NULL OR "ledger_outbox_events"."payout_id" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "ledger_outbox_events" ADD CONSTRAINT "ledger_outbox_events_type_check" CHECK ("ledger_outbox_events"."event_type" IN ('PAYMENT_RECEIVED','ORDER_DELIVERY_CONFIRMED','REFUND_PROCESSED','SHIPPING_COST_REVERSED','CHARGEBACK_CONFIRMED','CHARGEBACK_ALLOCATED','CHARGEBACK_RECOVERY','CHARGEBACK_WRITE_OFF','PAYOUT_REQUESTED','PAYOUT_COMPLETED','PAYOUT_FAILED'));--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_type_check" CHECK ("ledger_transactions"."type" IN ('PAYMENT_RECEIVED','ORDER_DELIVERY_CONFIRMED','REFUND_PROCESSED','SHIPPING_COST_REVERSED','CHARGEBACK_CONFIRMED','CHARGEBACK_ALLOCATED','CHARGEBACK_RECOVERY','CHARGEBACK_WRITE_OFF','PAYOUT_REQUESTED','PAYOUT_COMPLETED','PAYOUT_FAILED'));--> statement-breakpoint
CREATE OR REPLACE FUNCTION nusali_outbox_enforce_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW."event_type" IS DISTINCT FROM OLD."event_type"
    OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
    OR NEW."order_id" IS DISTINCT FROM OLD."order_id"
    OR NEW."payout_id" IS DISTINCT FROM OLD."payout_id"
    OR NEW."snapshot_json" IS DISTINCT FROM OLD."snapshot_json"
    OR NEW."snapshot_hash" IS DISTINCT FROM OLD."snapshot_hash"
    OR NEW."occurred_at" IS DISTINCT FROM OLD."occurred_at"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
  THEN
    RAISE EXCEPTION 'ledger_outbox_events %: os campos que definem o evento (tipo, chave, pedido/saque, snapshot, hora do evento) são imutáveis.', OLD."id";
  END IF;
  IF OLD."status" = 'DONE' AND NEW."status" <> 'DONE' THEN
    RAISE EXCEPTION 'ledger_outbox_events % está DONE (lançamento já feito) — estado terminal, não pode ser reaberto.', OLD."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
