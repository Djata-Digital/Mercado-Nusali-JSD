-- FASE 8C.3 — REVOGAÇÃO do papel dedicado (executar ao terminar, mesmo que a operação tenha falhado). Sem DROP OWNED BY.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'attr_loader_8c3') THEN
    BEGIN
      PERFORM pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = 'attr_loader_8c3';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Sem permissão para derrubar sessões abertas; elas deixam de funcionar quando o papel é desativado/removido.';
    END;
    EXECUTE 'ALTER ROLE attr_loader_8c3 NOLOGIN';
    EXECUTE 'ALTER ROLE attr_loader_8c3 VALID UNTIL ''1970-01-01''';
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM attr_loader_8c3';
    EXECUTE 'REVOKE ALL ON SCHEMA public FROM attr_loader_8c3';
    BEGIN
      EXECUTE 'DROP ROLE attr_loader_8c3';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'O papel ficou DESATIVADO (sem login e sem privilégios), mas não foi removido: %', SQLERRM;
    END;
  END IF;
END $$;
-- Conferência: papeis_restantes = 0 (removido) ou pode_logar = 0 (desativado)
SELECT (SELECT count(*) FROM pg_roles WHERE rolname = 'attr_loader_8c3') AS papeis_restantes,
       (SELECT count(*) FROM pg_roles WHERE rolname = 'attr_loader_8c3' AND rolcanlogin) AS pode_logar;
