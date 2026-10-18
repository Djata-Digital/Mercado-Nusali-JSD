-- ROLLBACK MANUAL da migração 0044_ledger_payout_events (o Drizzle não tem "down" automático). NÃO é executado por nenhum deploy.
-- Seguro por construção: aborta (sem alterar nada) se já existir QUALQUER evento do outbox de saque ou lançamento PAYOUT_* (trilha contábil imutável).
-- Uso (somente após backup): psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f drizzle/rollback/0044_ledger_payout_events.down.sql
-- O "-1" executa tudo numa única transação. O registro da migração é removido pelo created_at do journal (1792359802041).
DO $$
BEGIN
  IF (SELECT count(*) FROM ledger_outbox_events WHERE payout_id IS NOT NULL OR order_id IS NULL OR event_type LIKE 'PAYOUT_%') > 0 THEN
    RAISE EXCEPTION 'rollback 0044 bloqueado: existem eventos do outbox de saque (trilha de auditoria)';
  END IF;
  IF (SELECT count(*) FROM ledger_transactions WHERE type LIKE 'PAYOUT_%') > 0 THEN
    RAISE EXCEPTION 'rollback 0044 bloqueado: existem % lançamentos PAYOUT_* (imutáveis)', (SELECT count(*) FROM ledger_transactions WHERE type LIKE 'PAYOUT_%');
  END IF;
END $$;

ALTER TABLE "ledger_outbox_events" DROP CONSTRAINT "ledger_outbox_events_type_check";
ALTER TABLE "ledger_transactions" DROP CONSTRAINT "ledger_transactions_type_check";
ALTER TABLE "ledger_outbox_events" DROP CONSTRAINT "ledger_outbox_events_subject_check";
DROP INDEX "ledger_outbox_events_payout_idx";
ALTER TABLE "ledger_outbox_events" DROP CONSTRAINT "ledger_outbox_events_payout_id_seller_payouts_id_fk";
ALTER TABLE "ledger_outbox_events" DROP COLUMN "payout_id";
ALTER TABLE "ledger_outbox_events" ALTER COLUMN "order_id" SET NOT NULL;
ALTER TABLE "ledger_outbox_events" ADD CONSTRAINT "ledger_outbox_events_type_check" CHECK ("event_type" IN ('PAYMENT_RECEIVED','ORDER_DELIVERY_CONFIRMED','REFUND_PROCESSED','SHIPPING_COST_REVERSED','CHARGEBACK_CONFIRMED','CHARGEBACK_ALLOCATED','CHARGEBACK_RECOVERY','CHARGEBACK_WRITE_OFF'));
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_type_check" CHECK ("type" IN ('PAYMENT_RECEIVED','ORDER_DELIVERY_CONFIRMED','REFUND_PROCESSED','SHIPPING_COST_REVERSED','CHARGEBACK_CONFIRMED','CHARGEBACK_ALLOCATED','CHARGEBACK_RECOVERY','CHARGEBACK_WRITE_OFF'));

CREATE OR REPLACE FUNCTION nusali_outbox_enforce_immutable() RETURNS trigger AS $fn$
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
$fn$ LANGUAGE plpgsql;

DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1792359802041;
