-- ROLLBACK MANUAL da migração 0040_ledger_refunds (o Drizzle não tem "down" automático). NÃO é executado por nenhum deploy.
-- Seguro por construção: aborta (sem alterar nada) se já existir QUALQUER dado que dependa dos novos valores (lançamento REFUND_PROCESSED, evento do outbox
-- REFUND_PROCESSED ou conta REFUND_ABSORBED_SHIPPING) — os lançamentos do ledger são imutáveis e nunca são apagados. Antes disso: desligue o worker/flag e arquive.
-- Uso (somente após backup): psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f drizzle/rollback/0040_ledger_refunds.down.sql
-- O "-1" executa tudo numa única transação. O registro da migração é removido pelo created_at do journal (1792203160732).
DO $$
BEGIN
  IF (SELECT count(*) FROM ledger_transactions WHERE type = 'REFUND_PROCESSED') > 0 THEN
    RAISE EXCEPTION 'rollback 0040 bloqueado: existem % lançamentos REFUND_PROCESSED (imutáveis)', (SELECT count(*) FROM ledger_transactions WHERE type = 'REFUND_PROCESSED');
  END IF;
  IF (SELECT count(*) FROM ledger_outbox_events WHERE event_type = 'REFUND_PROCESSED') > 0 THEN
    RAISE EXCEPTION 'rollback 0040 bloqueado: existem % eventos REFUND_PROCESSED no outbox (trilha de auditoria)', (SELECT count(*) FROM ledger_outbox_events WHERE event_type = 'REFUND_PROCESSED');
  END IF;
  IF (SELECT count(*) FROM ledger_accounts WHERE code = 'REFUND_ABSORBED_SHIPPING') > 0 THEN
    RAISE EXCEPTION 'rollback 0040 bloqueado: existe conta REFUND_ABSORBED_SHIPPING';
  END IF;
END $$;

ALTER TABLE "ledger_accounts" DROP CONSTRAINT "ledger_accounts_code_check";
ALTER TABLE "ledger_outbox_events" DROP CONSTRAINT "ledger_outbox_events_type_check";
ALTER TABLE "ledger_transactions" DROP CONSTRAINT "ledger_transactions_type_check";
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_code_check" CHECK ("code" IN ('PAYMENT_CLEARING','BUYER_ESCROW','SELLER_PAYABLE','SELLER_AVAILABLE','SELLER_PAYOUT_CLEARING','NUSALI_COMMISSION_REVENUE','SHIPPING_PAYABLE','SHIPPING_SUBSIDY_NUSALI','TAX_PAYABLE','REFUND_PAYABLE','CHARGEBACK_RECEIVABLE','PAYMENT_PROCESSOR_FEES','NUSALI_PROMOTION_EXPENSE'));
ALTER TABLE "ledger_outbox_events" ADD CONSTRAINT "ledger_outbox_events_type_check" CHECK ("event_type" IN ('PAYMENT_RECEIVED','ORDER_DELIVERY_CONFIRMED'));
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_type_check" CHECK ("type" IN ('PAYMENT_RECEIVED','ORDER_DELIVERY_CONFIRMED'));

DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1792203160732;
