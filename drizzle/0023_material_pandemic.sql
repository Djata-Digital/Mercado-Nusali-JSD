CREATE TABLE "payment_allocations" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"payment_id" varchar(255) NOT NULL,
	"order_id" varchar(255) NOT NULL,
	"purchase_group_id" varchar(255),
	"amount" numeric(12, 2) NOT NULL,
	"currency" varchar(10) DEFAULT 'XOF' NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"refunded_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_allocations_amount_check" CHECK ("payment_allocations"."amount" > 0),
	CONSTRAINT "payment_allocations_refunded_amount_check" CHECK ("payment_allocations"."refunded_amount" >= 0),
	CONSTRAINT "payment_allocations_refunded_not_exceed_amount_check" CHECK ("payment_allocations"."refunded_amount" <= "payment_allocations"."amount")
);
--> statement-breakpoint
CREATE TABLE "purchase_groups" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"buyer_id" varchar(255) NOT NULL,
	"currency" varchar(10) DEFAULT 'XOF' NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"status" varchar(50) DEFAULT 'pending_payment' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "order_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "refunds" ALTER COLUMN "order_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "purchase_group_id" varchar(255);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "purchase_group_id" varchar(255);--> statement-breakpoint
-- Todo payment histórico já tem order_id preenchido, logo é estruturalmente
-- 'primary' (única cobrança que financia seu order) — não há ambiguidade a
-- resolver. DEFAULT 'primary' aqui é TRANSITÓRIO: classifica o legado via o
-- mecanismo nativo do Postgres (ADD COLUMN ... DEFAULT ... NOT NULL não
-- reescreve a tabela linha a linha para um default constante — "fast
-- default", desde o Postgres 11), NÃO um UPDATE manual. A instrução seguinte
-- remove o DEFAULT imediatamente, para que nenhum INSERT futuro (legacy ou
-- group payment) possa nascer 'primary' por omissão silenciosa. (Mesma
-- correção já aplicada e testada na Fase C2 — reaplicada aqui porque a 0023
-- foi regenerada para incluir as colunas de evidência de refund da Fase
-- C5.2-D.2; drizzle-kit generate NÃO preserva esta correção automaticamente,
-- precisa ser reaplicada manualmente a cada regeneração.)
ALTER TABLE "payments" ADD COLUMN "settlement_role" varchar(20) DEFAULT 'primary' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "settlement_role" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "purchase_group_id" varchar(255);--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "provider" varchar(50);--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "provider_correlation_key" varchar(255);--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "provider_status" varchar(50);--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "provider_requested_at" timestamp;--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "provider_confirmed_at" timestamp;--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "provider_raw_response" jsonb;--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_purchase_group_id_purchase_groups_id_fk" FOREIGN KEY ("purchase_group_id") REFERENCES "public"."purchase_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_groups" ADD CONSTRAINT "purchase_groups_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_allocations_payment_order_uq" ON "payment_allocations" USING btree ("payment_id","order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_allocations_order_active_uq" ON "payment_allocations" USING btree ("order_id") WHERE "payment_allocations"."status" = 'active';--> statement-breakpoint
CREATE INDEX "payment_allocations_order_idx" ON "payment_allocations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_payment_idx" ON "payment_allocations" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_purchase_group_idx" ON "payment_allocations" USING btree ("purchase_group_id");--> statement-breakpoint
CREATE INDEX "purchase_groups_buyer_created_idx" ON "purchase_groups" USING btree ("buyer_id","created_at");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_purchase_group_id_purchase_groups_id_fk" FOREIGN KEY ("purchase_group_id") REFERENCES "public"."purchase_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_purchase_group_id_purchase_groups_id_fk" FOREIGN KEY ("purchase_group_id") REFERENCES "public"."purchase_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_purchase_group_id_purchase_groups_id_fk" FOREIGN KEY ("purchase_group_id") REFERENCES "public"."purchase_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_purchase_group_idx" ON "orders" USING btree ("purchase_group_id");--> statement-breakpoint
CREATE INDEX "payments_purchase_group_idx" ON "payments" USING btree ("purchase_group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_purchase_group_primary_uq" ON "payments" USING btree ("purchase_group_id") WHERE "payments"."settlement_role" = 'primary';--> statement-breakpoint
CREATE INDEX "refunds_purchase_group_idx" ON "refunds" USING btree ("purchase_group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_provider_correlation_uq" ON "refunds" USING btree ("provider","provider_correlation_key") WHERE "refunds"."provider" IS NOT NULL AND "refunds"."provider_correlation_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_child_active_reservation_uq" ON "refunds" USING btree ("order_id") WHERE "refunds"."order_id" IS NOT NULL AND "refunds"."provider_correlation_key" IS NOT NULL AND "refunds"."status" IN ('pending', 'provider_pending', 'ambiguous_timeout');--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_surplus_active_reservation_uq" ON "refunds" USING btree ("payment_id") WHERE "refunds"."order_id" IS NULL AND "refunds"."purchase_group_id" IS NOT NULL AND "refunds"."provider_correlation_key" IS NOT NULL AND "refunds"."status" IN ('pending', 'provider_pending', 'ambiguous_timeout');--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_settlement_role_check" CHECK ("payments"."settlement_role" IN ('candidate', 'primary', 'surplus'));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_owner_exclusive_check" CHECK (("payments"."order_id" IS NOT NULL AND "payments"."purchase_group_id" IS NULL) OR ("payments"."order_id" IS NULL AND "payments"."purchase_group_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_owner_exclusive_check" CHECK (("refunds"."order_id" IS NOT NULL AND "refunds"."purchase_group_id" IS NULL) OR ("refunds"."order_id" IS NULL AND "refunds"."purchase_group_id" IS NOT NULL));--> statement-breakpoint
-- Fase C5.3-B — payment_chargebacks (schema apenas; nenhum efeito financeiro,
-- nenhum código de runtime lê/escreve esta tabela ainda). Dobrada nesta mesma
-- migration 0023 (ainda não commitada/aplicada em nenhum ambiente durável —
-- ver relatório da fase) em vez de uma 0024 separada, seguindo o mesmo padrão
-- já usado por C5.2-D.2 dentro desta migration.
CREATE TABLE "payment_chargebacks" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"payment_id" varchar(255) NOT NULL,
	"purchase_group_id" varchar(255),
	"provider" varchar(50) NOT NULL,
	"provider_chargeback_id" varchar(255) NOT NULL,
	"provider_status" varchar(50) NOT NULL,
	"provider_dispute_status" varchar(50),
	"provider_reason" varchar(100),
	"value" numeric(12, 2) NOT NULL,
	"currency" varchar(10) NOT NULL,
	"dispute_start_date" timestamp,
	"deadline_to_send_dispute_documents" timestamp,
	"local_status" varchar(20) NOT NULL,
	"provider_raw_response" jsonb,
	"first_seen_event_id" varchar(255),
	"last_seen_event_id" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_chargebacks_value_check" CHECK ("payment_chargebacks"."value" > 0),
	CONSTRAINT "payment_chargebacks_local_status_check" CHECK ("payment_chargebacks"."local_status" IN ('active', 'lost', 'reversed', 'manual_review'))
);
--> statement-breakpoint
ALTER TABLE "payment_chargebacks" ADD CONSTRAINT "payment_chargebacks_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_chargebacks" ADD CONSTRAINT "payment_chargebacks_purchase_group_id_purchase_groups_id_fk" FOREIGN KEY ("purchase_group_id") REFERENCES "public"."purchase_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_chargebacks_provider_external_uq" ON "payment_chargebacks" USING btree ("provider","provider_chargeback_id");--> statement-breakpoint
CREATE INDEX "payment_chargebacks_payment_idx" ON "payment_chargebacks" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payment_chargebacks_purchase_group_idx" ON "payment_chargebacks" USING btree ("purchase_group_id") WHERE "payment_chargebacks"."purchase_group_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "payment_chargebacks_local_status_idx" ON "payment_chargebacks" USING btree ("local_status");--> statement-breakpoint
CREATE INDEX "payment_chargebacks_payment_active_idx" ON "payment_chargebacks" USING btree ("payment_id","local_status");