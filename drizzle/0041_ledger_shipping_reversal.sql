CREATE TABLE "shipping_cost_reversals" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"order_id" varchar(255) NOT NULL,
	"refund_id" varchar(255) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" varchar(10) NOT NULL,
	"subsidy_part" numeric(12, 2) NOT NULL,
	"absorbed_part" numeric(12, 2) NOT NULL,
	"evidence_ref" text NOT NULL,
	"reason" text NOT NULL,
	"performed_by" varchar(255) NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_cost_reversals_amount_check" CHECK ("shipping_cost_reversals"."amount" > 0 AND "shipping_cost_reversals"."subsidy_part" >= 0 AND "shipping_cost_reversals"."absorbed_part" >= 0 AND "shipping_cost_reversals"."subsidy_part" + "shipping_cost_reversals"."absorbed_part" = "shipping_cost_reversals"."amount")
);
--> statement-breakpoint
ALTER TABLE "ledger_outbox_events" DROP CONSTRAINT "ledger_outbox_events_type_check";--> statement-breakpoint
ALTER TABLE "ledger_transactions" DROP CONSTRAINT "ledger_transactions_type_check";--> statement-breakpoint
ALTER TABLE "shipping_cost_reversals" ADD CONSTRAINT "shipping_cost_reversals_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_cost_reversals" ADD CONSTRAINT "shipping_cost_reversals_refund_id_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_cost_reversals" ADD CONSTRAINT "shipping_cost_reversals_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_cost_reversals_idempotency_uq" ON "shipping_cost_reversals" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "shipping_cost_reversals_order_idx" ON "shipping_cost_reversals" USING btree ("order_id");--> statement-breakpoint
ALTER TABLE "ledger_outbox_events" ADD CONSTRAINT "ledger_outbox_events_type_check" CHECK ("ledger_outbox_events"."event_type" IN ('PAYMENT_RECEIVED','ORDER_DELIVERY_CONFIRMED','REFUND_PROCESSED','SHIPPING_COST_REVERSED'));--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_type_check" CHECK ("ledger_transactions"."type" IN ('PAYMENT_RECEIVED','ORDER_DELIVERY_CONFIRMED','REFUND_PROCESSED','SHIPPING_COST_REVERSED'));--> statement-breakpoint
CREATE OR REPLACE FUNCTION nusali_shipping_reversal_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'shipping_cost_reversals % é um registro financeiro imutável (sem UPDATE/DELETE): registre uma nova reversão, nunca altere a anterior.', OLD."id";
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER nusali_shipping_reversal_trg_immutable
  BEFORE UPDATE OR DELETE ON "shipping_cost_reversals"
  FOR EACH ROW EXECUTE FUNCTION nusali_shipping_reversal_immutable();
