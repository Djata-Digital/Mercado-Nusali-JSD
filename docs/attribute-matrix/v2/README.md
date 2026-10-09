# Matriz de atributos — Mercado Nusali — v2-2026-10-08 (Fase 8B)

Revisão da matriz v1 (Fase 8A, preservada em `../v1/` e no commit `5868d0b`). **Nada foi aplicado em produção.**

| Arquivo | Conteúdo |
|---|---|
| `CHANGES-vs-v1.md` | o que mudou da v1 para a v2 (137 selects obrigatórios ganharam "Outro"; 3 campos viraram opcionais) |
| `01`–`06` | inventário, definições, efetivos por categoria, herança/overrides, eixos de variante, conflitos (gerados) |
| `07-rules-analysis.md` | política de obrigatórios, origem `seed`, vírgulas, ficha × filtro × eixo, "Outro", limitações |
| `08-regulatory-review.md` | 73 subcategorias para revisão regulatória (13 Atenção, 40 Revisão, 20 Informativo) |
| `09-commissions.md` | precedência real de comissões e opções para decisão |
| `10-production-plan.md` | plano da Fase 8C (não autorizada) e estratégia de reversão |
| `11-stock-conversion-fix.md` | correção do estoque simples → variável (local, não publicada) |
| `12-other-option-structured.md` | opção "Outro" com especificação estruturada (Fase 8C.1) |
| `13-homologation-and-deploy-plan.md` | auditoria somente leitura da produção e plano de deploy/reversão do código |
| `matrix.json`, `operations.json`, `summary.json` (com `operationsHash`), `validation.issues.json` | dados para máquina |

Código: `src/data/attributeMatrix/` · carregador: `scripts/attribute-matrix/load.ts` (+ `loaderSafety.ts`, `applyEngine.ts`, `verifyEffective.ts`) · testes: `scratch/test-attr-*-8b.ts`, `scratch/test-stock-conversion-8b.ts`, `scratch/mutation-*-8b.cjs`.

Regenerar: `npx tsx scripts/attribute-matrix/generate.ts` · `npx tsx scripts/attribute-matrix/diff.ts v1 v2` · `npx tsx scripts/attribute-matrix/regulatory-report.ts`.

## Resultados (PostgreSQL 17 descartável)

| Teste | Resultado |
|---|---|
| Carregador (CLI real: plan, verify, apply, rollback-plan, rollback, recusas, deriva, retomada) | 32/32 |
| Matriz v2 (regra nova, v1 preservada, diff, "Outro" ponta a ponta, 322 categorias) | 23/23 |
| Origem `source` (tentativas de falsificação via HTTP) | 12/12 |
| Matriz aplicada pelo serviço real (um produto em cada uma das 292 subcategorias) | 25/25 |
| Validador com defeitos injetados | 22/22 |
| Estoque (conversão, reservas, cancelamento, concorrência, rollback) | 31/31 (+14/14 da 8A) |
| Mutação — estoque / carregador e origem | 8/8 / 9/9 mutantes mortos |
| "Outro" estruturado (validação, armazenamento, edição, ficha, legado, variantes, formulário, 137 selects da matriz) | 46/46 |
| Reserva anterior à conversão até o despacho físico real, cancelamento, expiração, concorrência, rollback | 17/17 |
| Mutação — "Outro" e despacho | 10/10 mutantes mortos |
| Fases 3–7 e carrinho/checkout/estoque | sem regressão nova (ver relatório) |
