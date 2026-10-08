-- ROLLBACK MANUAL da migração 0037_attributes_foundation (o Drizzle não tem "down" automático). NÃO é executado por nenhum deploy.
-- Seguro por construção: aborta (sem alterar nada) se alguma estrutura nova já contiver DADOS, para nunca perder informação.
-- Uso (somente após backup): psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f drizzle/rollback/0037_attributes_foundation.down.sql
-- O "-1" executa tudo numa única transação. O registro da migração é removido pelo created_at do journal (1791483151540).
DO $$
BEGIN
  IF (SELECT count(*) FROM product_attribute_values) > 0 THEN
    RAISE EXCEPTION 'rollback 0037 bloqueado: product_attribute_values contém % linhas', (SELECT count(*) FROM product_attribute_values);
  END IF;
  IF (SELECT count(*) FROM product_variants WHERE variant_key IS NOT NULL) > 0 THEN
    RAISE EXCEPTION 'rollback 0037 bloqueado: há variantes com variant_key preenchida';
  END IF;
  IF (SELECT count(*) FROM products WHERE model IS NOT NULL) > 0 THEN
    RAISE EXCEPTION 'rollback 0037 bloqueado: há produtos com model preenchido';
  END IF;
  IF (SELECT count(*) FROM category_attributes
        WHERE role <> 'spec' OR min_value IS NOT NULL OR max_value IS NOT NULL OR max_length IS NOT NULL OR decimals IS NOT NULL
           OR is_filterable OR display_group IS NOT NULL OR overrides_id IS NOT NULL OR source <> 'admin' OR admin_modified_at IS NOT NULL) > 0 THEN
    RAISE EXCEPTION 'rollback 0037 bloqueado: category_attributes usa as colunas novas';
  END IF;
END $$;

DROP TABLE "product_attribute_values";

DROP INDEX "product_variants_product_key_uq";
ALTER TABLE "product_variants" DROP COLUMN "variant_key";
ALTER TABLE "products" DROP COLUMN "model";

ALTER TABLE "category_attributes" DROP CONSTRAINT "category_attributes_override_self_check";
ALTER TABLE "category_attributes" DROP CONSTRAINT "category_attributes_limits_check";
ALTER TABLE "category_attributes" DROP CONSTRAINT "category_attributes_range_check";
ALTER TABLE "category_attributes" DROP CONSTRAINT "category_attributes_source_check";
ALTER TABLE "category_attributes" DROP CONSTRAINT "category_attributes_role_check";
ALTER TABLE "category_attributes" DROP CONSTRAINT "category_attributes_type_check";
ALTER TABLE "category_attributes" DROP CONSTRAINT "category_attributes_overrides_id_category_attributes_id_fk";
DROP INDEX "category_attributes_overrides_idx";
DROP INDEX "category_attributes_cat_code_uq";
ALTER TABLE "category_attributes" DROP COLUMN "admin_modified_at";
ALTER TABLE "category_attributes" DROP COLUMN "source";
ALTER TABLE "category_attributes" DROP COLUMN "overrides_id";
ALTER TABLE "category_attributes" DROP COLUMN "display_group";
ALTER TABLE "category_attributes" DROP COLUMN "is_filterable";
ALTER TABLE "category_attributes" DROP COLUMN "decimals";
ALTER TABLE "category_attributes" DROP COLUMN "max_length";
ALTER TABLE "category_attributes" DROP COLUMN "max_value";
ALTER TABLE "category_attributes" DROP COLUMN "min_value";
ALTER TABLE "category_attributes" DROP COLUMN "role";

DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1791483151540;
