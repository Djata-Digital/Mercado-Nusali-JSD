-- ROLLBACK MANUAL da migração 0038_shipping_lead_times (o Drizzle não tem "down" automático). NÃO é executado por nenhum deploy.
-- Seguro por construção: aborta (sem alterar nada) se a tabela nova ou as colunas de snapshot já contiverem DADOS, para nunca perder informação.
-- Uso (somente após backup): psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f drizzle/rollback/0038_shipping_lead_times.down.sql
-- O "-1" executa tudo numa única transação. O registro da migração é removido pelo created_at do journal (1792078942635).
DO $$
BEGIN
  IF (SELECT count(*) FROM shipping_route_service_lead_times) > 0 THEN
    RAISE EXCEPTION 'rollback 0038 bloqueado: shipping_route_service_lead_times contém % linhas', (SELECT count(*) FROM shipping_route_service_lead_times);
  END IF;
  IF (SELECT count(*) FROM order_items WHERE delivery_estimate_min_days IS NOT NULL OR delivery_estimate_max_days IS NOT NULL) > 0 THEN
    RAISE EXCEPTION 'rollback 0038 bloqueado: há itens de pedido com prazo estimado gravado (snapshot)';
  END IF;
END $$;

DROP TABLE "shipping_route_service_lead_times";

ALTER TABLE "order_items" DROP COLUMN "delivery_estimate_max_days";
ALTER TABLE "order_items" DROP COLUMN "delivery_estimate_min_days";

DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1792078942635;
