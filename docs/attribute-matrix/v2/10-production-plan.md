# 10 — Plano de aplicação em produção e estratégia de reversão (Fase 8C — NÃO autorizada)

> Esta é a proposta para a fase seguinte. Nada aqui foi executado. A Fase 8C só começa com autorização expressa do dono.

## 0. O que muda em relação ao plano da Fase 8A

O carregador agora existe e foi testado (32/32 em PostgreSQL 17 descartável): `scripts/attribute-matrix/load.ts`. Mas **a escrita em banco remoto está desligada no código** (`REMOTE_WRITE_ENABLED = false` em `loaderSafety.ts`). Executar a carga em produção exige, na 8C, uma alteração de código revisada e commitada que ligue essa chave (ou um método de execução equivalente), com a sua autorização, e **não** depende de variáveis de ambiente que alguém possa definir por engano.

## 1. Pré-requisitos (bloqueiam o início)

1. Autorização escrita da 8C, citando versão `v2-2026-10-08`, o hash da matriz (impresso por `plan`) e o commit.
2. Decisão sobre a correção de estoque (commit `4ed3e0c`): publicar **antes** de abrir vendedores (recomendado; sem migração).
3. Decisão sobre comissões (`09-commissions.md`): pelo menos o padrão global definido pelo administrador antes da primeira venda.
4. Decisão sobre as categorias em *Atenção* (`08-regulatory-review.md`).
5. Produção ainda com 0 produtos e 0 definições (se houver produtos, reavaliar antes).
6. Nenhuma migração é necessária (usa tabelas e o CHECK de origem já existentes). Confirmar por leitura o esquema com `plan`.

## 2. Sequência proposta

| Passo | Ação | Escrita? | Critério para continuar |
|---|---|---|---|
| 1 | Backup lógico (`category_attributes`, `categories`, `product_attribute_values`, `audit_logs`) + snapshot do projeto no provedor; registrar contagens | não | Backup restaurável verificado em banco descartável |
| 2 | `plan` com `--allow-remote-read`: sessão **READ ONLY imposta pelo banco** | não | Árvore 322 = 322; matriz válida; hash igual ao revisado; 847 a criar, 0 deriva |
| 3 | Revisão do relatório do passo 2 pelo dono | não | Aprovação explícita |
| 4 | Lote-piloto (`--stop-after 100`, `--batch-size 50`), depois `verify` | sim (100 linhas seed) | 0 erros, contagem = esperada, diário e auditoria gravados |
| 5 | Carga completa (retomada idempotente, lotes de 50) | sim | Validação pós-lote em todos os lotes; `verify` 322/322 sem divergência |
| 6 | Verificação funcional somente leitura: abrir o assistente em 3 subcategorias (sem criar produto); amostra de herança (Vestidos, Roupas tradicionais, Calçados) | não | Campos corretos |
| 7 | Registrar o resultado (hash, contagens, diário) e arquivar o diário | não | — |

## 3. Garantias do carregador (testadas)

- **Dry-run** sem escrita e sessão somente leitura quando o comando não escreve.
- **Verificação prévia**: esquema (colunas e CHECK `seed`), árvore de categorias idêntica ao inventário auditado (faltando/a mais/movida aborta), versão e hash da matriz, validador sem erros, correspondência com o artefato revisado (`summary.json.operationsHash`).
- **Idempotência**: cada operação tem id determinístico (`attr_nsl_<categoria>_<código>`); igual ⇒ pulada; diferente ⇒ **deriva**, relatada e nunca sobrescrita; origem diferente de `seed` ou edição posterior do admin também é deriva.
- **Lotes** com validação pós-lote (linhas `seed` no banco = anteriores + criadas) e uma linha de auditoria `system.attribute_matrix.batch_applied` por lote.
- **Diário JSONL** (append + fsync) por execução, sem segredos; **falha ao registrar interrompe** a escrita.
- **Retomada**: rodar `apply` de novo continua do ponto de parada (testado: parada em 333, retomada nas 514 restantes).
- **Travas**: alvo só por `ATTR_LOAD_DATABASE_URL`; `DATABASE_URL` nunca é usada para conectar; alvo igual a banco conhecido como produção é recusado para escrita; `NODE_ENV=production` recusa escrita; `--expect-hash` e `--confirm "<frase>"` com versão, hash, host e banco são obrigatórios.

## 4. Estratégia de reversão

1. **Antes de existir qualquer produto**: `rollback-plan` (sem escrita) e depois `rollback` (mesmas travas). Remove em ordem inversa (overrides e desativações antes dos alvos), **somente linhas `source='seed'` nunca editadas**. Se encontrar uma linha editada pelo admin depois da carga, ou de outra origem, **para** e relata — decisão humana. Gera `system.attribute_matrix.rollback` na auditoria. Testado: 847 removidas e recriadas (ciclo).
2. **Depois de existirem produtos com valores** daquele atributo: a exclusão é recusada pelo serviço (nada é forçado). As correções passam a ser **aditivas** (nova versão `v3`), não destrutivas; um atributo problemático pode ser **desativado** por override, o que preserva os valores já gravados.
3. **Restauração do backup** só para incidentes graves, porque desfaria também alterações administrativas legítimas posteriores; exige decisão do dono.
4. Mudanças de comissão não fazem parte da reversão da matriz.

## 5. Critérios de parada

Qualquer divergência de árvore · hash diferente · deriva · erro de serviço · contagem pós-lote diferente · produto inesperado. Parar, relatar, aguardar.

## 6. Riscos remanescentes

- Estoque: a correção ainda não foi publicada; produto simples convertido em variável tem o defeito até o deploy (hoje 0 produtos).
- Comissão ausente bloqueia a primeira venda.
- 73 subcategorias para decisão regulatória; 13 em *Atenção*.
- "Outro" sem campo de complemento; vírgula em opções não suportada (ver `07-rules-analysis.md`).
- Nomes de categoria repetidos em ramos distintos (relatados na 8A, não alterados).
