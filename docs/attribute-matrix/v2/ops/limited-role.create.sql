-- FASE 8C.3 — papel DEDICADO e temporário para a carga da matriz de atributos. Execute como administrador do banco (SQL Editor).
-- 1) TROQUE a senha abaixo por uma senha longa e aleatória gerada por você (não a compartilhe em chat nem em arquivos).
-- 2) O prazo (VALID UNTIL) começa agora; o banco recusa novas conexões depois dele.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'attr_loader_8c3') THEN
    RAISE EXCEPTION 'O papel attr_loader_8c3 já existe: revogue-o antes (ver script de revogação).';
  END IF;
  EXECUTE format(
    'CREATE ROLE attr_loader_8c3 LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT 2 VALID UNTIL %L',
    '<<DEFINA-AQUI-UMA-SENHA-LONGA-E-ALEATORIA>>',
    (now() + interval '3 hours')::text);
END $$;
ALTER ROLE attr_loader_8c3 SET statement_timeout = '60s';
ALTER ROLE attr_loader_8c3 SET idle_in_transaction_session_timeout = '30s';
GRANT USAGE ON SCHEMA public TO attr_loader_8c3;
GRANT SELECT ON public.categories, public.category_attributes, public.product_attribute_values, public.product_attributes, public.products TO attr_loader_8c3;
GRANT INSERT, DELETE ON public.category_attributes TO attr_loader_8c3;
GRANT INSERT ON public.audit_logs TO attr_loader_8c3;
