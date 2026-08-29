-- condition já é nullable desde a migration 0000 (sem NOT NULL). O único
-- problema era o DEFAULT 'new' técnico, que fazia todo produto novo parecer
-- "configurado como novo" mesmo quando a condição não se aplica ao item
-- (ex.: Manga, Banana, serviços). DROP DEFAULT não altera nenhuma linha
-- existente — apenas faz com que futuros INSERTs que omitam a coluna
-- resultem em NULL em vez do default técnico.
ALTER TABLE "products" ALTER COLUMN "condition" DROP DEFAULT;
