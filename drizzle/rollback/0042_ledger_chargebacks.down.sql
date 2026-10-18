-- ROLLBACK MANUAL da migração 0042_ledger_chargebacks (o Drizzle não tem "down" automático). NÃO é executado por nenhum deploy.
-- Seguro por construção: aborta (sem alterar nada) se existir QUALQUER dado financeiro/probatório das 5 tabelas novas, lançamento CHARGEBACK_* ou evento do outbox desses
-- tipos (registros imutáveis e trilha de auditoria). Antes disso: desligue o worker/flag e arquive.
-- Uso (somente após backup): psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f drizzle/rollback/0042_ledger_chargebacks.down.sql
-- O "-1" executa tudo numa única transação. O registro da migração é removido pelo created_at do journal (1792285692400).
DO $$
DECLARE n bigint;
BEGIN
  SELECT (SELECT count(*) FROM chargeback_allocations) + (SELECT count(*) FROM chargeback_evidence) + (SELECT count(*) FROM chargeback_decisions)
       + (SELECT count(*) FROM chargeback_decision_lines) + (SELECT count(*) FROM chargeback_recoveries) INTO n;
  IF n > 0 THEN RAISE EXCEPTION 'rollback 0042 bloqueado: as tabelas de chargeback contêm % linhas (registros imutáveis)', n; END IF;
  IF (SELECT count(*) FROM ledger_transactions WHERE type LIKE 'CHARGEBACK_%') > 0 THEN
    RAISE EXCEPTION 'rollback 0042 bloqueado: existem lançamentos CHARGEBACK_* (imutáveis)';
  END IF;
  IF (SELECT count(*) FROM ledger_outbox_events WHERE event_type LIKE 'CHARGEBACK_%') > 0 THEN
    RAISE EXCEPTION 'rollback 0042 bloqueado: existem eventos CHARGEBACK_* no outbox (trilha de auditoria)';
  END IF;
  IF (SELECT count(*) FROM ledger_accounts WHERE code = 'CHARGEBACK_LOSS') > 0 THEN
    RAISE EXCEPTION 'rollback 0042 bloqueado: existe conta CHARGEBACK_LOSS';
  END IF;
END $$;

DROP TABLE "chargeback_recoveries";
DROP TABLE "chargeback_decision_lines";
DROP TABLE "chargeback_decisions";
DROP TABLE "chargeback_evidence";
DROP TABLE "chargeback_allocations";
DROP FUNCTION nusali_chargeback_decision_guard();
DROP FUNCTION nusali_chargeback_immutable();

ALTER TABLE "ledger_accounts" DROP CONSTRAINT "ledger_accounts_code_check";
ALTER TABLE "ledger_outbox_events" DROP CONSTRAINT "ledger_outbox_events_type_check";
ALTER TABLE "ledger_transactions" DROP CONSTRAINT "ledger_transactions_type_check";
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_code_check" CHECK ("code" IN ('PAYMENT_CLEARING','BUYER_ESCROW','SELLER_PAYABLE','SELLER_AVAILABLE','SELLER_PAYOUT_CLEARING','NUSALI_COMMISSION_REVENUE','SHIPPING_PAYABLE','SHIPPING_SUBSIDY_NUSALI','TAX_PAYABLE','REFUND_PAYABLE','CHARGEBACK_RECEIVABLE','PAYMENT_PROCESSOR_FEES','NUSALI_PROMOTION_EXPENSE','REFUND_ABSORBED_SHIPPING'));
ALTER TABLE "ledger_outbox_events" ADD CONSTRAINT "ledger_outbox_events_type_check" CHECK ("event_type" IN ('PAYMENT_RECEIVED','ORDER_DELIVERY_CONFIRMED','REFUND_PROCESSED','SHIPPING_COST_REVERSED'));
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_type_check" CHECK ("type" IN ('PAYMENT_RECEIVED','ORDER_DELIVERY_CONFIRMED','REFUND_PROCESSED','SHIPPING_COST_REVERSED'));

DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1792285692400;
