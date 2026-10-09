-- FASE 8C.3 — papel DEDICADO e temporário para a carga da matriz de atributos: CRIA ou RENOVA (sem DROP). Execute no SQL Editor.
-- Se o papel já existe (ex.: expirado), só a senha, o prazo e os privilégios exatos são refeitos.
-- 1) TROQUE a senha abaixo por uma senha longa e aleatória gerada por você (não a compartilhe em chat nem em arquivos).
-- 2) O prazo (VALID UNTIL) começa agora; o banco recusa novas conexões depois dele.
DO $$
DECLARE
  v_until text := (now() + interval '3 hours')::text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'attr_loader_8c3') THEN
    EXECUTE format(
      'CREATE ROLE attr_loader_8c3 LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT 2 VALID UNTIL %L',
      '<<DEFINA-AQUI-UMA-SENHA-LONGA-E-ALEATORIA>>', v_until);
  ELSE
    EXECUTE format(
      'ALTER ROLE attr_loader_8c3 WITH LOGIN PASSWORD %L NOINHERIT CONNECTION LIMIT 2 VALID UNTIL %L',
      '<<DEFINA-AQUI-UMA-SENHA-LONGA-E-ALEATORIA>>', v_until);
  END IF;
END $$;
ALTER ROLE attr_loader_8c3 SET statement_timeout = '60s';
ALTER ROLE attr_loader_8c3 SET idle_in_transaction_session_timeout = '30s';
-- privilégios EXATOS: zera tudo em public e concede de novo só o mínimo
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM attr_loader_8c3;
REVOKE ALL ON SCHEMA public FROM attr_loader_8c3;
GRANT USAGE ON SCHEMA public TO attr_loader_8c3;
GRANT SELECT ON public.categories, public.category_attributes, public.product_attribute_values, public.product_attributes, public.products TO attr_loader_8c3;
GRANT INSERT, DELETE ON public.category_attributes TO attr_loader_8c3;
GRANT INSERT ON public.audit_logs TO attr_loader_8c3;
