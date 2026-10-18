-- ROLLBACK MANUAL da migração 0043_ledger_wallet_holds (o Drizzle não tem "down" automático). NÃO é executado por nenhum deploy.
-- Seguro por construção: aborta (sem alterar nada) se já existir QUALQUER retenção registrada (trilha financeira/auditoria). Se houver retenções ATIVAS, o código novo
-- as respeita; remover a tabela com retenções ativas liberaria saldo retido para saque — por isso a trava. Antes de qualquer rollback: libere as retenções pelo fluxo
-- autorizado e arquive.
-- Uso (somente após backup): psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f drizzle/rollback/0043_ledger_wallet_holds.down.sql
-- O "-1" executa tudo numa única transação. O registro da migração é removido pelo created_at do journal (ver "when" de 0043 em drizzle/meta/_journal.json).
DO $$
BEGIN
  IF (SELECT count(*) FROM wallet_holds) > 0 THEN
    RAISE EXCEPTION 'rollback 0043 bloqueado: wallet_holds contém % linhas (trilha financeira/auditoria)', (SELECT count(*) FROM wallet_holds);
  END IF;
END $$;

DROP TABLE "wallet_holds";
DROP FUNCTION nusali_wallet_hold_guard();

DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1792295139811;
