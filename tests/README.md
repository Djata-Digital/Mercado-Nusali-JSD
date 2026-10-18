# Testes essenciais (versionados)

Esta pasta guarda os testes que protegem fluxos críticos e **não dependem de `scratch/`** (pasta ignorada pelo git). Os helpers compartilhados ficam em `tests/support/`
(`checkoutTestKit.ts`, `ledgerTestDbGuard.ts`); os arquivos de mesmo nome em `scratch/` apenas reexportam, para os testes antigos continuarem funcionando.

| Arquivo | O que cobre | Precisa de banco |
|---|---|---|
| `mobile-compact-listing.test.ts` | cartão compacto (sem dados fictícios), grades de 2 colunas, categorias com «Ver todas», abrir produto no topo, botão «Adicionar» (sem propagação, variações → página do produto), aviso de carrinho, ajuste rápido de estoque, escopo (nada de frete/pagamento/checkout) | não |
| `ledger-e1-coupon-and-group-payment.test.ts` | ledger (E1): pedido com cupom do vendedor é contabilizado na entrega; `PAYMENT_RECEIVED` por pedido filho de purchase_group; regras de comissão/frete/subsídio/Escrow/carteira preservadas; idempotência, concorrência, isolamento por vendedor, falha + repetição, snapshots, comparador sombra | **sim** (Postgres descartável; liga o ledger sombra por conta própria) |
| `ledger-idempotency-race.test.ts` | ledger: corrida de idempotência na PRIMEIRA gravação — erro do Postgres embrulhado pelo drizzle (`DrizzleQueryError`/`err.cause`) reconhecido só para a constraint certa; 1 lançamento por pedido sob concorrência; zero falsos erros nos logs; outros erros de banco e outras constraints continuam a ser propagados | **sim** (Postgres descartável) |
| `test-db-safety.test.ts` | a proteção acima: classificador, recusa de `getDb()`/`pg` para banco real, executor que aborta antes de rodar, guarda que trava o ambiente, auditoria estática | não |
| `ledger-e2-outbox.test.ts` | ledger sombra E2: outbox transacional (evento gravado na transação do pagamento/liberação, em savepoint), processador idempotente (SKIP LOCKED + lease), retry com backoff, NEEDS_INTERVENTION, reinício de worker, vários workers, webhook duplicado, falha antes/depois do outbox, cutoff, snapshot, reconciliação (ausente / divergente / sem correção silenciosa), reparo manual auditado, métricas e logs, ausência de efeito no dinheiro real (47 verificações) | **sim** (Postgres descartável; aplica a migração 0039 se faltar) |
| `ledger-outbox-flag-gate.test.ts` | portão da flag `LEDGER_OUTBOX_ENABLED`: com a flag desligada endpoint interno, serviço do worker, job e runner não tocam no banco (nem com as tabelas da 0039 ausentes), não reconciliam e não alteram ledger/dinheiro; autenticação por `INTERNAL_JOBS_SECRET` sempre exigida; flag ligada continua funcionando | **sim** |
| `ledger-e3-refunds.test.ts` | ledger sombra E3: reembolso CONCLUÍDO (antes/depois da liberação; cupom+subsídio, comissão 0%, grupo de vendedores) vira evento do outbox na transação do reembolso e lançamento REFUND_PROCESSED; reembolso pendente/falhado nunca; idempotência (webhook repetido, workers e chamadas concorrentes), falha/recuperação (ledger fora do ar, evento perdido + reparo, worker que cai), cutoff, outbox desligado, reconciliação e dinheiro real intacto | **sim** |
| `ledger-e3-migration-check.cjs` | migração 0040: migrador oficial do drizzle → CHECKs ampliados → rollback → reaplicação → trava do rollback com dados (precisa de banco no nível anterior à 0039) | **sim** |
| `ledger-e4-shipping-reversal.test.ts` | ledger sombra E4: reversão do custo de frete (subsídio da Nusali + frete absorvido) só por registro auditado e com evidência num pedido reembolsado DEPOIS da liberação; antes da liberação nada a reverter; subsídio integral / parcial / ausente; alocação cumulativa exata; teto = custo de frete; idempotência, workers concorrentes, falha/recuperação (evento perdido + reparo), outbox desligado, cutoff, reconciliação e dinheiro real intacto | **sim** |
| `ledger-e4-migration-check.cjs` | migração 0041: migrador oficial do drizzle → tabela imutável + CHECKs → rollback → reaplicação → trava do rollback com dados (precisa de banco no nível anterior à 0039) | **sim** |
| `ledger-e5-chargebacks.test.ts` | ledger sombra E5: contestação aberta nunca lança; só o valor efetivamente debitado (lost) vira alocação por pedido + lançamento (antes da liberação: Escrow; depois: perda PENDENTE); responsabilidade só por decisão explícita (evidências, fundamentação, proponente ≠ aprovador, conflito de interesse, versões/revisão por delta, imutável); recuperação/baixa de terceiro; sem duplicidade com REFUND_PROCESSED; idempotência, concorrência, reentrega de webhook, falha/recuperação, reparo, cutoff, outbox desligado, reconciliação e dinheiro real intacto | **sim** |
| `ledger-e5-migration-check.cjs` | migração 0042: migrador oficial do drizzle → 5 tabelas + CHECKs + triggers → rollback → reaplicação → trava do rollback com dados (precisa de banco no nível anterior à 0039) | **sim** |
| `ledger-e6-admin-api.test.ts` | E6 (API administrativa do ledger): permissões por operação (leitura FINANCE/RISK_ANALYST/GLOBAL_ADMIN; ações sensíveis só GLOBAL_ADMIN; papel só do JWT), consultas (resumo, lançamentos com partidas, outbox, divergências, chargebacks) com filtros e entradas hostis, ausência de rotas que editem/apaguem, reparo manual (simulação / confirm / concorrência), recolocar/descartar/reconhecer, evidência/proposta/aprovação de chargeback (quatro olhos, teto N, sem débito de carteira), reversão de frete (evidência, idempotência), auditoria com o ator autenticado, sem segredos e dinheiro real intacto | **sim** |
| `ledger-e6-admin-ui.test.ts` | E6 (tela): perfis, validações e mensagens puras; cliente de API só GET/POST para /admin/ledger; ações restritas só para GLOBAL_ADMIN, quatro olhos, reparo com simulação+confirmação, motivos mínimos, nenhuma parte pré-selecionada, sem segredos e sem editar/apagar lançamentos; rotas existem no servidor | não |
| `wallet-holds-e7.test.ts` | E7 (retenções de saldo): saldo total/retido/disponível; saque nunca usa valor retido (retenção parcial não bloqueia o resto); retenção só do saldo livre, sem negativo, sem duplicidade ativa, idempotente (inclui 8 pedidos paralelos); concorrência retenção×retenção, retenção×saque e saques×retenção; liberação auditada/idempotente; permissões provisórias (só GLOBAL_ADMIN); regras no banco (CHECK, trigger, imutabilidade); rastreabilidade com o ledger sombra (só referência); dinheiro real intacto; reembolso que reduz o saldo abaixo do retido | **sim** (banco já com 0043) |
| `wallet-holds-e7-policy.test.ts` | E7 (regras aprovadas D1–D7, via apiRouter real): só FINANCE/RISK_ANALYST/GLOBAL_ADMIN solicitam, sem conflito de interesse; só GLOBAL_ADMIN ≠ criador libera, com motivo e evidência; só chargeback perdido com decisão do vendedor APROVADA (teto aprovado, teto N, saldo livre, sem retenção parcial); nada automático; saque anterior intocado; sem lançamento no ledger; sinalização quando a obrigação muda; idade/filtro de retenções antigas; idempotência e concorrência; dinheiro real intacto | **sim** (banco já com 0043) |
| `payout-e8.test.ts` | E8 (saques): idempotência concorrente e por vendedor (a chave de outro vendedor nunca devolve o saque), valor com 2 casas e aritmética exata, saques paralelos nunca acima do disponível (com retenção da E7), transições serializadas (completed × failed), devolução única na falha, auditoria do ciclo de vida e consistência wallet × transações | **sim** (banco já com 0043) |
| `e9-integrated-staging.test.ts` | E9 (validação final integrada, staging LOCAL isolado): pedido individual e grupo multi-vendedor, cupom do vendedor, Escrow, reembolso antes/depois, reversão de frete, chargeback + decisão + teto N, retenção/liberação, saques (solicitação, aprovação pela rota admin, falha, devolução), outbox/worker/falha/recuperação/reconciliação, partidas balanceadas, ledger × carteiras e permissões. Use um banco com o ESQUEMA de produção: `pg_restore --schema-only` do backup (o teste aplica 0039–0043 se faltarem) | **sim** |
| `wallet-holds-e7-migration-check.cjs` | migração 0043: migrador oficial → tabela + CHECKs + índices + trigger → rollback → reaplicação → rollback bloqueado com dados (precisa de banco no nível anterior à 0039) | **sim** |
| `ledger-e2-migration-check.cjs` | migração 0039: migrador oficial do drizzle → estrutura → rollback → reaplicação → trava do rollback com dados → gatilhos (precisa de banco no nível anterior à 0039) | **sim** |
| `seller-variant-stock.test.ts` | estoque por SKU no formulário do vendedor: edição/persistência, reservas, transferências pendentes, alteração concorrente, ordem de locks (sem deadlock), livro de movimentos, atualização conjunta, permissões, produto simples | **sim** (Postgres descartável) |

## Como rodar

```bash
npm run test:mobile            # sem banco
# banco descartável (nunca produção): docker compose -f docker-compose.dev.yml up -d  → porta de teste isolada
export LEDGER_TEST_DATABASE_URL="postgres://postgres:postgres@localhost:55434/<banco_descartavel>"
npm run test:variant-stock     # exige o banco acima (o guarda recusa qualquer outro)
npm run test:ledger-e1         # ledger E1 (exige o banco acima)
npm run test:ledger-race       # corrida de idempotência do ledger (exige o banco acima)
npm run test:ledger-e2         # outbox + reconciliação do ledger sombra (exige o banco acima)
npm run test:ledger-outbox-gate # portão da flag do outbox (exige o banco acima, já com a 0039)
npm run test:ledger-e3           # reembolsos no ledger sombra (exige o banco acima, já com a 0039)
npm run test:ledger-e3-migration  # migração 0040 (banco no nível anterior à 0039)
npm run test:ledger-e4           # reversão do custo de frete no ledger sombra (exige o banco acima, já com 0039 e 0040)
npm run test:ledger-e4-migration  # migração 0041 (banco no nível anterior à 0039)
npm run test:ledger-e5           # chargebacks no ledger sombra (exige o banco acima, já com 0039..0041)
npm run test:ledger-e5-migration  # migração 0042 (banco no nível anterior à 0039)
npm run test:ledger-e6           # API administrativa do ledger (exige o banco acima, já com 0039..0042)
npm run test:e6-ui               # tela do ledger (sem banco)
npm run test:wallet-holds       # retenções de saldo E7 (exige o banco acima, já com 0043)
npm run test:wallet-holds-policy # regras aprovadas da E7 (exige o banco acima, já com 0043)
npm run test:payout-e8            # saques E8 (exige o banco acima, já com 0043)
npm run test:e9-staging           # validação integrada E9 (banco com o esquema de produção, sem dados)
npm run test:wallet-holds-migration  # migração 0043 (banco no nível anterior à 0039)
npm run test:ledger-e2-migration  # migração 0039 (banco no nível anterior à 0039)
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
