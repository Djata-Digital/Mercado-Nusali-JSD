-- ============================================================================
-- FASE 5A — FUNDAÇÃO DO LEDGER FINANCEIRO (SHADOW / DUAL-WRITE)
-- Revisão pós-auditoria (hardening) — fecha os achados CRÍTICO/ALTO/MÉDIO da
-- auditoria read-only anterior antes de qualquer aplicação.
--
-- Migration ADITIVA: cria 3 tabelas novas (ledger_accounts, ledger_transactions,
-- ledger_entries), as funções/triggers de integridade que as protegem, e DOIS
-- triggers em tabelas pré-existentes (sellers, users) — só para impedir que um
-- owner de conta financeira seja apagado por baixo do ledger (item 6 do pedido de
-- hardening). Nenhuma coluna, dado ou comportamento pré-existente é alterado;
-- os dois triggers novos em sellers/users só interceptam DELETE quando existir
-- uma ledger_accounts referenciando aquela linha — não têm nenhum efeito em
-- qualquer outra operação, e são a mesma disciplina RESTRICT que o schema já usa
-- em toda outra FK para essas tabelas.
--
-- Atomicidade de aplicação: confirmado lendo o código-fonte instalado —
-- node_modules/drizzle-orm/pg-core/dialect.js:60 (`await session.transaction(...)`)
-- e node_modules/drizzle-kit/bin.cjs:78880 (importa exatamente esse `migrate` de
-- "drizzle-orm/node-postgres/migrator") — `npx drizzle-kit migrate` já executa
-- TODOS os statements desta migration dentro de uma única transação Postgres.
-- Uma falha em qualquer linha desfaz o arquivo inteiro; não é necessário (nem
-- desejável) envolver este arquivo em BEGIN/COMMIT manual.
--
-- NÃO APLICADA — aguardando autorização explícita para rodar contra o banco.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ledger_accounts
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ledger_accounts" (
  "id" varchar(255) PRIMARY KEY,
  "code" varchar(50) NOT NULL,
  "owner_type" varchar(20) NOT NULL,
  "owner_id" varchar(255),
  "currency" varchar(10) NOT NULL,
  "normal_balance" varchar(10) NOT NULL,
  "is_clearing" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "ledger_accounts_normal_balance_check" CHECK ("normal_balance" IN ('DEBIT','CREDIT')),
  CONSTRAINT "ledger_accounts_owner_type_check" CHECK ("owner_type" IN ('PLATFORM','SELLER','BUYER')),
  CONSTRAINT "ledger_accounts_owner_id_platform_check" CHECK (
    ("owner_type" = 'PLATFORM' AND "owner_id" IS NULL) OR
    ("owner_type" <> 'PLATFORM' AND "owner_id" IS NOT NULL)
  ),
  -- Catálogo fechado de contas — os 13 códigos definidos no projeto da Fase 4B e
  -- usados por src/server/modules/ledger/accounts.ts (ACCOUNT_DEFINITIONS). Um
  -- typo (ex.: "NUSALI_COMISSION_REVENUE") passa a ser rejeitado pelo banco, não
  -- silenciosamente aceito como conta nova. Expandir este catálogo no futuro é uma
  -- migration aditiva normal (ALTER TABLE ... DROP CONSTRAINT / ADD CONSTRAINT).
  CONSTRAINT "ledger_accounts_code_check" CHECK ("code" IN (
    'PAYMENT_CLEARING',
    'BUYER_ESCROW',
    'SELLER_PAYABLE',
    'SELLER_AVAILABLE',
    'SELLER_PAYOUT_CLEARING',
    'NUSALI_COMMISSION_REVENUE',
    'SHIPPING_PAYABLE',
    'SHIPPING_SUBSIDY_NUSALI',
    'TAX_PAYABLE',
    'REFUND_PAYABLE',
    'CHARGEBACK_RECEIVABLE',
    'PAYMENT_PROCESSOR_FEES',
    'NUSALI_PROMOTION_EXPENSE'
  ))
);

-- Unicidade correta com owner_id nulo: um UNIQUE comum trata cada NULL como distinto
-- (permitiria N contas PLATFORM "iguais" para o mesmo code+currency). Dois índices
-- únicos parciais resolvem isso sem precisar de um valor sentinela artificial.
CREATE UNIQUE INDEX IF NOT EXISTS "ledger_accounts_owned_uq"
  ON "ledger_accounts" ("code", "owner_type", "owner_id", "currency")
  WHERE "owner_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "ledger_accounts_platform_uq"
  ON "ledger_accounts" ("code", "owner_type", "currency")
  WHERE "owner_id" IS NULL;

-- ----------------------------------------------------------------------------
-- ledger_transactions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ledger_transactions" (
  "id" varchar(255) PRIMARY KEY,
  "type" varchar(50) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'DRAFT',
  "currency" varchar(10) NOT NULL,
  "order_id" varchar(255) REFERENCES "orders"("id") ON DELETE RESTRICT,
  "payment_id" varchar(255) REFERENCES "payments"("id") ON DELETE RESTRICT,
  "escrow_id" varchar(255) REFERENCES "escrow_accounts"("id") ON DELETE RESTRICT,
  "payout_id" varchar(255) REFERENCES "seller_payouts"("id") ON DELETE RESTRICT,
  "refund_id" varchar(255) REFERENCES "refunds"("id") ON DELETE RESTRICT,
  "dispute_id" varchar(255) REFERENCES "disputes"("id") ON DELETE RESTRICT,
  "seller_id" varchar(255) REFERENCES "sellers"("id") ON DELETE RESTRICT,
  "store_id" varchar(255) REFERENCES "stores"("id") ON DELETE RESTRICT,
  "buyer_id" varchar(255) REFERENCES "users"("id") ON DELETE RESTRICT,
  "country_code" varchar(10),
  "idempotency_key" varchar(255) NOT NULL,
  "reversal_of_transaction_id" varchar(255) REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT,
  "performed_by" varchar(255) REFERENCES "users"("id") ON DELETE SET NULL,
  "source" varchar(100),
  "reason" text,
  "correlation_id" varchar(255),
  "request_id" varchar(255),
  "metadata_json" jsonb,
  "occurred_at" timestamp NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "ledger_transactions_status_check" CHECK ("status" IN ('DRAFT','POSTED','REVERSED')),
  -- Auto-referência proibida: uma transaction nunca pode ser o estorno dela mesma.
  CONSTRAINT "ledger_transactions_reversal_not_self_check" CHECK (
    "reversal_of_transaction_id" IS NULL OR "reversal_of_transaction_id" <> "id"
  ),
  -- Catálogo fechado de tipos de evento — só os dois eventos implementados NESTA
  -- FASE (src/server/modules/ledger/financialLedgerService.ts). Os eventos do
  -- projeto da Fase 4B ainda não implementados (SELLER_BALANCE_AVAILABLE,
  -- PAYOUT_*, REFUND_*, CHARGEBACK_*, DISPUTE_*, ADJUSTMENT, REVERSAL) serão
  -- adicionados a este CHECK, um a um, nas migrations que os implementarem —
  -- nunca "pré-aprovados" agora sem o código que os usa.
  CONSTRAINT "ledger_transactions_type_check" CHECK ("type" IN (
    'PAYMENT_RECEIVED',
    'ORDER_DELIVERY_CONFIRMED'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS "ledger_transactions_idempotency_uq" ON "ledger_transactions" ("idempotency_key");
CREATE INDEX IF NOT EXISTS "ledger_transactions_order_idx" ON "ledger_transactions" ("order_id");
CREATE INDEX IF NOT EXISTS "ledger_transactions_type_status_idx" ON "ledger_transactions" ("type", "status");

-- ----------------------------------------------------------------------------
-- ledger_entries
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ledger_entries" (
  "id" varchar(255) PRIMARY KEY,
  "transaction_id" varchar(255) NOT NULL REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT,
  "account_id" varchar(255) NOT NULL REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT,
  -- Linha determinística dentro da transaction (1, 2, 3, ...), atribuída pelo
  -- FinancialLedgerService. Não impede lançamentos legítimos repetindo a mesma
  -- conta/direção com dimensões diferentes (ex.: dois créditos de SHIPPING_PAYABLE
  -- com subsidySource distinto) — só impede um retry/bug duplicar o CONJUNTO
  -- inteiro de entries de uma transaction (o line_number colidiria).
  "line_number" integer NOT NULL,
  "direction" varchar(10) NOT NULL,
  "amount" numeric(18,6) NOT NULL,
  "currency" varchar(10) NOT NULL,
  "dimensions" jsonb,
  "order_id" varchar(255) REFERENCES "orders"("id") ON DELETE RESTRICT,
  "seller_id" varchar(255) REFERENCES "sellers"("id") ON DELETE RESTRICT,
  "store_id" varchar(255) REFERENCES "stores"("id") ON DELETE RESTRICT,
  "buyer_id" varchar(255) REFERENCES "users"("id") ON DELETE RESTRICT,
  "country_code" varchar(10),
  "reference_type" varchar(100),
  "reference_id" varchar(255),
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "ledger_entries_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "ledger_entries_direction_check" CHECK ("direction" IN ('DEBIT','CREDIT')),
  CONSTRAINT "ledger_entries_line_number_check" CHECK ("line_number" > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "ledger_entries_transaction_line_uq" ON "ledger_entries" ("transaction_id", "line_number");
CREATE INDEX IF NOT EXISTS "ledger_entries_transaction_idx" ON "ledger_entries" ("transaction_id");
CREATE INDEX IF NOT EXISTS "ledger_entries_account_idx" ON "ledger_entries" ("account_id", "created_at");
CREATE INDEX IF NOT EXISTS "ledger_entries_order_idx" ON "ledger_entries" ("order_id");
CREATE INDEX IF NOT EXISTS "ledger_entries_seller_idx" ON "ledger_entries" ("seller_id", "currency");

-- ============================================================================
-- TRIGGERS DE INTEGRIDADE — nomes namespaced com "nusali_ledger_" (não havia
-- colisão real: confirmado que nenhuma migration 0000–0010 nem o código de
-- runtimeSchemaAlign em src/db/index.ts cria qualquer FUNCTION/TRIGGER hoje —
-- o prefixo é aplicado mesmo assim, por clareza e para reduzir risco futuro).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Moeda: cada entry tem que bater com a moeda da CONTA que ela toca E com a
-- moeda da TRANSACTION-pai. A segunda checagem é a correção do achado ALTO da
-- auditoria: antes só a conta era validada, então uma transaction declarada BRL
-- podia (no banco, não no app) conter entries em XOF, ou uma transaction podia
-- misturar duas moedas desde que cada uma fechasse em zero. Validando também
-- contra ledger_transactions.currency, uma transaction fica estruturalmente
-- restrita a uma única moeda — a mesma moeda declarada nela.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION nusali_ledger_enforce_entry_currency() RETURNS trigger AS $$
DECLARE
  account_currency varchar(10);
  tx_currency varchar(10);
BEGIN
  SELECT "currency" INTO account_currency FROM "ledger_accounts" WHERE "id" = NEW."account_id";
  IF account_currency IS NULL THEN
    RAISE EXCEPTION 'ledger_entries.account_id % não existe em ledger_accounts', NEW."account_id";
  END IF;
  IF NEW."currency" <> account_currency THEN
    RAISE EXCEPTION 'ledger_entries.currency (%) diverge da moeda da conta % (%)', NEW."currency", NEW."account_id", account_currency;
  END IF;

  SELECT "currency" INTO tx_currency FROM "ledger_transactions" WHERE "id" = NEW."transaction_id";
  IF tx_currency IS NULL THEN
    RAISE EXCEPTION 'ledger_entries.transaction_id % não existe em ledger_transactions', NEW."transaction_id";
  END IF;
  IF NEW."currency" <> tx_currency THEN
    RAISE EXCEPTION 'ledger_entries.currency (%) diverge da moeda da transaction % (%) — uma transaction não pode misturar moedas', NEW."currency", NEW."transaction_id", tx_currency;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS nusali_ledger_trg_entry_currency ON "ledger_entries";
CREATE TRIGGER nusali_ledger_trg_entry_currency
  BEFORE INSERT OR UPDATE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION nusali_ledger_enforce_entry_currency();

-- ----------------------------------------------------------------------------
-- 2) Ciclo de vida de ledger_entries — substitui o trigger antigo que só cobria
-- UPDATE/DELETE. Correção de DOIS achados da auditoria:
--   a) [CRÍTICO] agora também cobre INSERT: uma entry só pode ser criada quando a
--      transaction-pai está DRAFT — fecha o buraco que permitia inserir uma entry
--      nova contra uma transaction_id já POSTED, sem erro nenhum.
--   b) [bug] a versão antiga fazia `RETURN OLD` incondicional, o que — para
--      UPDATE permitido (transaction ainda DRAFT) — descartava silenciosamente a
--      alteração em vez de aplicá-la. Esta versão usa TG_OP para devolver NEW em
--      UPDATE e OLD em DELETE, como o Postgres espera de cada operação.
-- transaction_id também não pode ser trocado num UPDATE (impediria uma entry
-- "pular" de transaction, o que quebraria o balanceamento das duas).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION nusali_ledger_enforce_entry_lifecycle() RETURNS trigger AS $$
DECLARE
  parent_status varchar(20);
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT "status" INTO parent_status FROM "ledger_transactions" WHERE "id" = NEW."transaction_id";
    IF parent_status IS NULL THEN
      RAISE EXCEPTION 'ledger_entries.transaction_id % não existe em ledger_transactions', NEW."transaction_id";
    END IF;
    IF parent_status <> 'DRAFT' THEN
      RAISE EXCEPTION 'ledger_entries só podem ser inseridas em transactions DRAFT — % está %', NEW."transaction_id", parent_status;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW."transaction_id" <> OLD."transaction_id" THEN
      RAISE EXCEPTION 'ledger_entries.transaction_id não pode ser alterado (entry %)', OLD."id";
    END IF;
    SELECT "status" INTO parent_status FROM "ledger_transactions" WHERE "id" = OLD."transaction_id";
    IF parent_status <> 'DRAFT' THEN
      RAISE EXCEPTION 'ledger_entries % pertence a uma ledger_transaction % (status=%) — entries fora de DRAFT são imutáveis. Use REVERSAL/ADJUSTMENT.', OLD."id", OLD."transaction_id", parent_status;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    SELECT "status" INTO parent_status FROM "ledger_transactions" WHERE "id" = OLD."transaction_id";
    IF parent_status <> 'DRAFT' THEN
      RAISE EXCEPTION 'ledger_entries % pertence a uma ledger_transaction % (status=%) — entries fora de DRAFT são imutáveis. Use REVERSAL/ADJUSTMENT.', OLD."id", OLD."transaction_id", parent_status;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledger_entry_immutability ON "ledger_entries"; -- nome antigo, se existir de uma tentativa anterior
DROP TRIGGER IF EXISTS nusali_ledger_trg_entry_lifecycle ON "ledger_entries";
CREATE TRIGGER nusali_ledger_trg_entry_lifecycle
  BEFORE INSERT OR UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION nusali_ledger_enforce_entry_lifecycle();

-- ----------------------------------------------------------------------------
-- 3) Ciclo de vida de ledger_transactions — [CRÍTICO] fecha o achado de que
-- nenhum trigger protegia UPDATE (só DELETE de POSTED era bloqueado). Regra:
--
--   DRAFT   -> DRAFT   : livre (construção em andamento)
--   DRAFT   -> POSTED  : livre (é o "fechamento" normal feito pelo serviço)
--   DRAFT   -> REVERSED: proibido (nunca existiu POSTED para reverter)
--   POSTED  -> REVERSED: única transição permitida, e SOMENTE o status pode
--                         mudar — todo outro campo (currency, order_id,
--                         payment_id, seller_id, buyer_id, idempotency_key,
--                         amount-relacionados via entries, etc.) tem que
--                         permanecer idêntico. A lógica financeira completa de
--                         reversal (nova transaction, novos lançamentos) é de
--                         fase futura — este trigger só garante que ninguém usa
--                         UPDATE comum para adulterar uma transaction fechada.
--   POSTED  -> POSTED  : proibido (mesmo sem mudar nada — força quem quiser
--                         "tocar" a linha a passar pelo caminho de REVERSED)
--   POSTED  -> DRAFT    : proibido
--   REVERSED -> *       : proibido sempre (terminal, nunca reaberta)
--
-- DELETE físico de POSTED e de REVERSED continua proibido pelo trigger 4.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION nusali_ledger_enforce_transaction_lifecycle() RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'REVERSED' THEN
    RAISE EXCEPTION 'ledger_transaction % está REVERSED — não pode mais ser alterada de forma alguma.', OLD."id";
  END IF;

  IF OLD."status" = 'POSTED' THEN
    IF NEW."status" <> 'REVERSED' THEN
      RAISE EXCEPTION 'ledger_transaction % está POSTED — a única transição permitida é para REVERSED (via REVERSAL). Tentativa: % -> %.', OLD."id", OLD."status", NEW."status";
    END IF;
    IF NEW."type" IS DISTINCT FROM OLD."type"
      OR NEW."currency" IS DISTINCT FROM OLD."currency"
      OR NEW."order_id" IS DISTINCT FROM OLD."order_id"
      OR NEW."payment_id" IS DISTINCT FROM OLD."payment_id"
      OR NEW."escrow_id" IS DISTINCT FROM OLD."escrow_id"
      OR NEW."payout_id" IS DISTINCT FROM OLD."payout_id"
      OR NEW."refund_id" IS DISTINCT FROM OLD."refund_id"
      OR NEW."dispute_id" IS DISTINCT FROM OLD."dispute_id"
      OR NEW."seller_id" IS DISTINCT FROM OLD."seller_id"
      OR NEW."store_id" IS DISTINCT FROM OLD."store_id"
      OR NEW."buyer_id" IS DISTINCT FROM OLD."buyer_id"
      OR NEW."country_code" IS DISTINCT FROM OLD."country_code"
      OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key"
      OR NEW."occurred_at" IS DISTINCT FROM OLD."occurred_at"
    THEN
      RAISE EXCEPTION 'ledger_transaction % está POSTED — campos financeiros/de identidade são imutáveis, só o status pode virar REVERSED.', OLD."id";
    END IF;
  END IF;

  -- DRAFT -> REVERSED direto não faz sentido (nunca foi POSTED).
  IF OLD."status" = 'DRAFT' AND NEW."status" = 'REVERSED' THEN
    RAISE EXCEPTION 'ledger_transaction % está DRAFT — não pode virar REVERSED sem antes ter sido POSTED.', OLD."id";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS nusali_ledger_trg_transaction_lifecycle ON "ledger_transactions";
CREATE TRIGGER nusali_ledger_trg_transaction_lifecycle
  BEFORE UPDATE ON "ledger_transactions"
  FOR EACH ROW EXECUTE FUNCTION nusali_ledger_enforce_transaction_lifecycle();

-- ----------------------------------------------------------------------------
-- 4) Nenhuma ledger_transaction POSTED ou REVERSED pode ser fisicamente apagada.
-- (Correção: a versão anterior só protegia POSTED, não REVERSED.)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION nusali_ledger_prevent_transaction_delete() RETURNS trigger AS $$
BEGIN
  IF OLD."status" IN ('POSTED', 'REVERSED') THEN
    RAISE EXCEPTION 'ledger_transactions % está % — não pode ser apagada.', OLD."id", OLD."status";
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledger_transaction_no_delete_posted ON "ledger_transactions"; -- nome antigo, se existir
DROP TRIGGER IF EXISTS nusali_ledger_trg_prevent_transaction_delete ON "ledger_transactions";
CREATE TRIGGER nusali_ledger_trg_prevent_transaction_delete
  BEFORE DELETE ON "ledger_transactions"
  FOR EACH ROW EXECUTE FUNCTION nusali_ledger_prevent_transaction_delete();

-- ----------------------------------------------------------------------------
-- 5) Balanceamento — inalterado em essência (CONSTRAINT TRIGGER DEFERRABLE
-- INITIALLY DEFERRED, roda no COMMIT, soma por moeda). O que mudou é o que essa
-- validação agora SIGNIFICA: combinada com os triggers 1–4 acima, uma vez que
-- uma transaction chega a POSTED:
--   - nenhuma entry pode ser inserida, alterada ou apagada (trigger 2);
--   - a própria transaction só pode virar REVERSED, sem tocar em nenhum campo
--     financeiro (trigger 3);
--   - REVERSED é terminal (trigger 3 e trigger 4).
-- Ou seja, o resultado validado aqui na hora do COMMIT fica congelado para
-- sempre — não existe mais um caminho (INSERT direto de entry, UPDATE de
-- status, ou qualquer outro) capaz de desbalancear uma transaction depois dela
-- ter sido aprovada aqui.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION nusali_ledger_enforce_transaction_balance() RETURNS trigger AS $$
DECLARE
  unbalanced record;
  entry_count integer;
BEGIN
  IF NEW."status" <> 'POSTED' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO entry_count FROM "ledger_entries" WHERE "transaction_id" = NEW."id";
  IF entry_count < 2 THEN
    RAISE EXCEPTION 'ledger_transaction % está POSTED com apenas % entry(ies) — uma transaction contábil precisa de pelo menos 2', NEW."id", entry_count;
  END IF;

  FOR unbalanced IN
    SELECT
      "currency",
      SUM(CASE WHEN "direction" = 'DEBIT' THEN "amount" ELSE 0 END) AS total_debit,
      SUM(CASE WHEN "direction" = 'CREDIT' THEN "amount" ELSE 0 END) AS total_credit
    FROM "ledger_entries"
    WHERE "transaction_id" = NEW."id"
    GROUP BY "currency"
    HAVING SUM(CASE WHEN "direction" = 'DEBIT' THEN "amount" ELSE 0 END)
         <> SUM(CASE WHEN "direction" = 'CREDIT' THEN "amount" ELSE 0 END)
  LOOP
    RAISE EXCEPTION 'ledger_transaction % desbalanceada em % — débito=% crédito=%',
      NEW."id", unbalanced."currency", unbalanced.total_debit, unbalanced.total_credit;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledger_transaction_balance ON "ledger_transactions"; -- nome antigo, se existir
DROP TRIGGER IF EXISTS nusali_ledger_trg_transaction_balance ON "ledger_transactions";
CREATE CONSTRAINT TRIGGER nusali_ledger_trg_transaction_balance
  AFTER INSERT OR UPDATE ON "ledger_transactions"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION nusali_ledger_enforce_transaction_balance();

-- ----------------------------------------------------------------------------
-- 6) Integridade de owner polimórfico — [ALTO] ledger_accounts.owner_id não tem
-- FK possível (aponta para sellers.id OU users.id dependendo de owner_type).
-- Este trigger valida a existência do owner na tabela certa, e recusa qualquer
-- owner_type desconhecido em vez de assumir um comportamento não definido.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION nusali_ledger_enforce_account_owner() RETURNS trigger AS $$
BEGIN
  IF NEW."owner_type" = 'PLATFORM' THEN
    IF NEW."owner_id" IS NOT NULL THEN
      RAISE EXCEPTION 'ledger_accounts % com owner_type=PLATFORM não pode ter owner_id (%)', NEW."id", NEW."owner_id";
    END IF;

  ELSIF NEW."owner_type" = 'SELLER' THEN
    IF NEW."owner_id" IS NULL OR NOT EXISTS (SELECT 1 FROM "sellers" WHERE "id" = NEW."owner_id") THEN
      RAISE EXCEPTION 'ledger_accounts.owner_id % não existe em sellers (owner_type=SELLER, account %)', NEW."owner_id", NEW."id";
    END IF;

  ELSIF NEW."owner_type" = 'BUYER' THEN
    IF NEW."owner_id" IS NULL OR NOT EXISTS (SELECT 1 FROM "users" WHERE "id" = NEW."owner_id") THEN
      RAISE EXCEPTION 'ledger_accounts.owner_id % não existe em users (owner_type=BUYER, account %)', NEW."owner_id", NEW."id";
    END IF;

  ELSE
    -- Não deveria ser alcançável (ledger_accounts_owner_type_check já restringe
    -- os valores), mas não inventamos comportamento para um owner_type futuro
    -- desconhecido — rejeitamos explicitamente até este trigger ser atualizado.
    RAISE EXCEPTION 'ledger_accounts.owner_type % não tem validação de integridade definida — atualize nusali_ledger_enforce_account_owner() antes de usar este owner_type.', NEW."owner_type";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS nusali_ledger_trg_account_owner ON "ledger_accounts";
CREATE TRIGGER nusali_ledger_trg_account_owner
  BEFORE INSERT OR UPDATE ON "ledger_accounts"
  FOR EACH ROW EXECUTE FUNCTION nusali_ledger_enforce_account_owner();

-- ----------------------------------------------------------------------------
-- 7) Impedir apagar um seller/usuário que ainda é dono de uma conta financeira.
-- Como owner_id é polimórfico (sem FK real, item 6), um DELETE em sellers/users
-- não seria barrado por nada relacionado ao ledger sem isto — o dinheiro ficaria
-- "órfão" silenciosamente. Estes dois triggers são adicionados às tabelas
-- pré-existentes "sellers" e "users", mas só interceptam DELETE quando existe
-- de fato uma ledger_accounts apontando para a linha — mesma disciplina RESTRICT
-- que toda outra FK dessas tabelas já usa no projeto.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION nusali_ledger_prevent_seller_delete_with_account() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ledger_accounts" WHERE "owner_type" = 'SELLER' AND "owner_id" = OLD."id") THEN
    RAISE EXCEPTION 'Não é possível apagar sellers % — existe(m) ledger_accounts vinculada(s) a este vendedor.', OLD."id";
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS nusali_ledger_trg_prevent_seller_delete ON "sellers";
CREATE TRIGGER nusali_ledger_trg_prevent_seller_delete
  BEFORE DELETE ON "sellers"
  FOR EACH ROW EXECUTE FUNCTION nusali_ledger_prevent_seller_delete_with_account();

CREATE OR REPLACE FUNCTION nusali_ledger_prevent_buyer_delete_with_account() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ledger_accounts" WHERE "owner_type" = 'BUYER' AND "owner_id" = OLD."id") THEN
    RAISE EXCEPTION 'Não é possível apagar users % — existe(m) ledger_accounts vinculada(s) a este usuário (owner_type=BUYER).', OLD."id";
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS nusali_ledger_trg_prevent_buyer_delete ON "users";
CREATE TRIGGER nusali_ledger_trg_prevent_buyer_delete
  BEFORE DELETE ON "users"
  FOR EACH ROW EXECUTE FUNCTION nusali_ledger_prevent_buyer_delete_with_account();
