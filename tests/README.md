# Testes essenciais (versionados)

Esta pasta guarda os testes que protegem fluxos críticos e **não dependem de `scratch/`** (pasta ignorada pelo git). Os helpers compartilhados ficam em `tests/support/`
(`checkoutTestKit.ts`, `ledgerTestDbGuard.ts`); os arquivos de mesmo nome em `scratch/` apenas reexportam, para os testes antigos continuarem funcionando.

| Arquivo | O que cobre | Precisa de banco |
|---|---|---|
| `mobile-compact-listing.test.ts` | cartão compacto (sem dados fictícios), grades de 2 colunas, categorias com «Ver todas», abrir produto no topo, botão «Adicionar» (sem propagação, variações → página do produto), aviso de carrinho, ajuste rápido de estoque, escopo (nada de frete/pagamento/checkout) | não |
| `ledger-e1-coupon-and-group-payment.test.ts` | ledger (E1): pedido com cupom do vendedor é contabilizado na entrega; `PAYMENT_RECEIVED` por pedido filho de purchase_group; regras de comissão/frete/subsídio/Escrow/carteira preservadas; idempotência, concorrência, isolamento por vendedor, falha + repetição, snapshots, comparador sombra | **sim** (Postgres descartável; liga o ledger sombra por conta própria) |
| `ledger-idempotency-race.test.ts` | ledger: corrida de idempotência na PRIMEIRA gravação — erro do Postgres embrulhado pelo drizzle (`DrizzleQueryError`/`err.cause`) reconhecido só para a constraint certa; 1 lançamento por pedido sob concorrência; zero falsos erros nos logs; outros erros de banco e outras constraints continuam a ser propagados | **sim** (Postgres descartável) |
| `test-db-safety.test.ts` | a proteção acima: classificador, recusa de `getDb()`/`pg` para banco real, executor que aborta antes de rodar, guarda que trava o ambiente, auditoria estática | não |
| `seller-variant-stock.test.ts` | estoque por SKU no formulário do vendedor: edição/persistência, reservas, transferências pendentes, alteração concorrente, ordem de locks (sem deadlock), livro de movimentos, atualização conjunta, permissões, produto simples | **sim** (Postgres descartável) |

## Como rodar

```bash
npm run test:mobile            # sem banco
# banco descartável (nunca produção): docker compose -f docker-compose.dev.yml up -d  → porta de teste isolada
export LEDGER_TEST_DATABASE_URL="postgres://postgres:postgres@localhost:55434/<banco_descartavel>"
npm run test:variant-stock     # exige o banco acima (o guarda recusa qualquer outro)
npm run test:ledger-e1         # ledger E1 (exige o banco acima)
npm run test:ledger-race       # corrida de idempotência do ledger (exige o banco acima)
npm run test:essential         # todos
```

`ledgerTestDbGuard` aborta se a URL não for de um banco local descartável. Cada execução de `test:variant-stock` deve usar um banco recém-criado a partir do template (as suítes criam dados).

## Proteção contra teste em banco real (incidente 2026-10-16)

Um teste antigo carregou o `.env` (produção) e gravou dados fictícios na produção. Desde então **testes falham de forma segura**:

- **Rode testes de banco SEMPRE pelo executor**: `node scripts/with-test-env.cjs <comando>` (os scripts `npm run test:*` já fazem isso). Ele exige `LEDGER_TEST_DATABASE_URL` explícita, valida a URL (local + nome descartável + diferente de produção), **conecta e prova no servidor** que é o banco certo e trava o ambiente (`DATABASE_URL` = banco de teste; URLs de produção e Redis zerados; `NUSALI_TEST_RUN=1`; preload que recusa qualquer conexão `pg` para outro banco). Se algo não estiver provado, aborta ANTES de executar o comando.
- Mesmo sem o executor, `getDb()` recusa (`TEST_DB_SAFETY`) abrir um banco que não seja descartável local quando o processo é um teste/diagnóstico (script em `scratch/` ou `tests/`, `test-*.ts`, `*.test.ts`, ou `NUSALI_TEST_RUN=1`).
- Nomes de banco aceitos: prefixo `rt_`/`test_`/`tmp_`/`dev_` ou sufixo `_it`/`_ui`/`_co`/`_tmpl`/`_fresh`/`_upgrade`/`_rehearsal`/`_src`/`_v2`/`_stock`/`_mut*`. Outros nomes: `NUSALI_EXTRA_DISPOSABLE_DB_NAMES=nome1,nome2`. Nunca aceitos: `postgres`, `p8d_restore`, `phase1_restore`, `restore_test` (+ `NUSALI_PROTECTED_DB_NAMES`).
- Script **operacional** em `scratch/` que precisa de um banco real de propósito declara `NUSALI_ALLOW_PRODUCTION_DB_FROM_SCRIPT=I_UNDERSTAND_THIS_CAN_WRITE_TO_PRODUCTION` (gera aviso; **nunca vale** com `NUSALI_TEST_RUN=1`).
- `npm run test:db-safety` (sem banco) prova tudo isso, inclusive a recusa real em subprocessos.
