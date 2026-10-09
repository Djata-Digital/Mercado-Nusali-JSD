-- FASE 8C.3 — REDEFINIR SOMENTE A SENHA do papel dedicado (não altera privilégios, prazo nem limites).
-- Use uma senha de 32+ caracteres só com letras e dígitos (evite $ ' \ " : / # @ para não haver problema de aspas no SQL Editor,
-- no PowerShell nem na URL). Gere-a no gerenciador de senhas e NÃO a envie a ninguém.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'attr_loader_8c3') THEN
    RAISE EXCEPTION 'O papel attr_loader_8c3 não existe: crie-o com limited-role.create.sql.';
  END IF;
  EXECUTE format('ALTER ROLE attr_loader_8c3 PASSWORD %L', '<<DEFINA-AQUI-A-NOVA-SENHA>>');
END $$;
-- Conferência: o prazo continua o mesmo e o papel pode logar
SELECT rolname, rolcanlogin, rolvaliduntil FROM pg_roles WHERE rolname = 'attr_loader_8c3';
