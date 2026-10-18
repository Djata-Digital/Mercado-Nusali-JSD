-- ROLLBACK MANUAL da migração 0041_ledger_shipping_reversal (o Drizzle não tem "down" automático). NÃO é executado por nenhum deploy.
-- Seguro por construção: aborta (sem alterar nada) se já existir QUALQUER reversão registrada, lançamento SHIPPING_COST_REVERSED ou evento do outbox desse tipo
-- (trilha financeira imutável). Antes disso: desligue o worker/flag e arquive.
-- Uso (somente após backup): psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f drizzle/rollback/0041_ledger_shipping_reversal.down.sql
-- O "-1" executa tudo numa única transação. O registro da migração é removido pelo created_at do journal (1792281124201).
DO $$
BEGIN
  IF (SELECT count(*) FROM shipping_cost_reversals) > 0 THEN
    RAISE EXCEPTION 'rollback 0041 bloqueado: shipping_cost_reversals contém % linhas (registro financeiro imutável)', (SELECT count(*) FROM shipping_cost_reversals);
  END IF;
  IF (SELECT count(*) FROM ledger_transactions WHERE type = 'SHIPPING_COST_REVERSED') > 0 THEN
    RAISE EXCEPTION 'rollback 0041 bloqueado: existem % lançamentos SHIPPING_COST_REVERSED (imutáveis)', (SELECT count(*) FROM ledger_transactions WHERE type = 'SHIPPING_COST_REVERSED');
  END IF;
  IF (SELECT count(*) FROM ledger_outbox_events WHERE event_type = 'SHIPPING_COST_REVERSED') > 0 THEN
    RAISE EXCEPTION 'rollback 0041 bloqueado: existem % eventos SHIPPING_COST_REVERSED no outbox (trilha de auditoria)', (SELECT count(*) FROM ledger_outbox_events WHERE event_type = 'SHIPPING_COST_REVERSED');
  END IF;
END $$;

DROP TABLE "shipping_cost_reversals";
DROP FUNCTION nusali_shipping_reversal_immutable();

ALTER TABLE "ledger_outbox_events" DROP CONSTRAINT "ledger_outbox_events_type_check";
ALTER TABLE "ledger_transactions" DROP CONSTRAINT "ledger_transactions_type_check";
ALTER TABLE "ledger_outbox_events" ADD CONSTRAINT "ledger_outbox_events_type_check" CHECK ("event_type" IN ('PAYMENT_RECEIVED','ORDER_DELIVERY_CONFIRMED','REFUND_PROCESSED'));
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_type_check" CHECK ("type" IN ('PAYMENT_RECEIVED','ORDER_DELIVERY_CONFIRMED','REFUND_PROCESSED'));

DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1792281124201;
