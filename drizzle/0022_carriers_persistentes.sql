-- Fase "Transportadoras Persistentes" — migration mínima e revisada à mão.
--
-- IMPORTANTE (achado de auditoria, não corrigido aqui — fora de escopo):
-- `drizzle-kit generate` produziu originalmente um diff de ~330 linhas
-- tentando recriar dezenas de tabelas (category_attributes,
-- inventory_transfers, ledger_accounts/entries/transactions,
-- payment_customers, payment_webhook_events, proof_of_delivery,
-- shipping_rates, shipping_zones, store_shipping_policies) que JÁ EXISTEM
-- em produção — confirmado por leitura real (information_schema.columns /
-- pg_tables). O histórico de snapshots do drizzle (drizzle/meta) só tem
-- 0000_snapshot.json e nada entre 0001 e 0021: essas migrations foram
-- escritas à mão ao longo do projeto e aplicadas com sucesso, mas nunca
-- geraram um snapshot correspondente — então "drizzle-kit generate" as
-- enxerga como pendentes de novo. Rodar o arquivo auto-gerado como estava
-- teria FALHADO em produção (ex.: "relation category_attributes already
-- exists") ou pior. Este arquivo foi editado à mão para conter SOMENTE o
-- que é realmente novo desta fase — nada mais.
--
-- Confirmado por leitura real em produção antes de escrever este arquivo:
--   - tabela "carriers": NÃO existe.
--   - shipments.carrier_id: NÃO existe (shipments.carrier texto livre
--     continua intocado).
--   - shipping_rates.carrier_id: JÁ EXISTE como coluna solta (varchar,
--     sem FK) — as 2 linhas reais têm valor NULL, então adicionar a FK é
--     seguro (nenhuma conversão de dado).
--
-- Idempotente de propósito (IF NOT EXISTS / DO-block com EXCEPTION) — seguindo
-- o mesmo padrão de segurança já usado em runRuntimeSchemaAlign (src/db/index.ts).

CREATE TABLE IF NOT EXISTS "carriers" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"country_code" varchar(10) DEFAULT 'GW' NOT NULL,
	"status" varchar(50) DEFAULT 'ACTIVE' NOT NULL,
	"integration_mode" varchar(50) DEFAULT 'MANUAL' NOT NULL,
	"provider_key" varchar(100),
	"contact_name" varchar(255),
	"contact_phone" varchar(50),
	"contact_email" varchar(255),
	"website" text,
	"service_areas_json" jsonb,
	"metadata_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "carriers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "carriers_status_idx" ON "carriers" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "carriers_country_idx" ON "carriers" USING btree ("country_code");
--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "carrier_id" varchar(255);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "shipments" ADD CONSTRAINT "shipments_carrier_id_carriers_id_fk" FOREIGN KEY ("carrier_id") REFERENCES "public"."carriers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_carrier_id_carriers_id_fk" FOREIGN KEY ("carrier_id") REFERENCES "public"."carriers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
