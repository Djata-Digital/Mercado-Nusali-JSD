-- ROLLBACK MANUAL da migração 0039_ledger_outbox (o Drizzle não tem "down" automático). NÃO é executado por nenhum deploy.
-- Seguro por construção: aborta (sem alterar nada) se qualquer tabela nova contiver DADOS, para nunca perder trilha de auditoria. Para desfazer uma migração já
-- usada: exporte/arquive as linhas, desligue LEDGER_OUTBOX_ENABLED e só então remova os dados com autorização expressa.
-- Uso (somente após backup): psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f drizzle/rollback/0039_ledger_outbox.down.sql
-- O "-1" executa tudo numa única transação. O registro da migração é removido pelo created_at do journal (1792178748452).
-- Os lançamentos já feitos em ledger_transactions/ledger_entries NÃO são tocados por este rollback (são imutáveis e independentes do outbox).
DO $$
BEGIN
  IF (SELECT count(*) FROM ledger_outbox_events) > 0 THEN
    RAISE EXCEPTION 'rollback 0039 bloqueado: ledger_outbox_events contém % linhas (trilha de auditoria)', (SELECT count(*) FROM ledger_outbox_events);
  END IF;
  IF (SELECT count(*) FROM ledger_reconciliation_findings) > 0 THEN
    RAISE EXCEPTION 'rollback 0039 bloqueado: ledger_reconciliation_findings contém % linhas', (SELECT count(*) FROM ledger_reconciliation_findings);
  END IF;
  IF (SELECT count(*) FROM ledger_reconciliation_runs) > 0 THEN
    RAISE EXCEPTION 'rollback 0039 bloqueado: ledger_reconciliation_runs contém % linhas', (SELECT count(*) FROM ledger_reconciliation_runs);
  END IF;
END $$;

DROP TABLE "ledger_reconciliation_findings";
DROP TABLE "ledger_reconciliation_runs";
DROP TABLE "ledger_outbox_events";

DROP FUNCTION nusali_outbox_enforce_immutable();
DROP FUNCTION nusali_outbox_prevent_delete();

DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1792178748452;
