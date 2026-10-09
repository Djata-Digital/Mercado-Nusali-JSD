-- FASE 8C.3 — REVOGAÇÃO do papel dedicado (executar ao terminar, mesmo que a operação tenha falhado).
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = 'attr_loader_8c3';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'attr_loader_8c3') THEN
    EXECUTE 'ALTER ROLE attr_loader_8c3 NOLOGIN';
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM attr_loader_8c3';
    EXECUTE 'REVOKE ALL ON SCHEMA public FROM attr_loader_8c3';
    EXECUTE 'DROP OWNED BY attr_loader_8c3';
    EXECUTE 'DROP ROLE attr_loader_8c3';
  END IF;
END $$;
-- Conferência: deve devolver 0
SELECT count(*) AS papeis_restantes FROM pg_roles WHERE rolname = 'attr_loader_8c3';
