# 08 — Diagnóstico: produto simples convertido em variável mantém o estoque simples contabilizado

> Fase 8A — diagnóstico e **proposta**. Nada foi corrigido em produção; nada foi publicado. O protótipo da correção foi aplicado **somente** numa cópia local de trabalho, validado em PostgreSQL 17 descartável e **revertido**; ele está guardado como `stock-conversion-fix.patch` (aplica limpo sobre `53f126d`).

## 1. Resumo

Quando um vendedor converte um produto **simples** (com estoque próprio) em produto **com variações**, a linha de estoque do produto simples (`inventory.variant_id IS NULL`) **não é aposentada**. As variações ganham as suas próprias linhas, e todo o sistema que soma "o estoque do produto" passa a contar as **duas** coisas. Além de inflar o total mostrado, essa linha órfã continua **comprável** por quem consegue pôr o produto no carrinho **sem escolher variação**.

Produção hoje: **0 produtos** → nenhum dado afetado. O defeito aparece assim que um vendedor real converter um anúncio (a conversão é possível pelo assistente desde as fases de variações).

## 2. Reprodução (PostgreSQL 17 descartável, `scratch/test-stock-conversion-8a.ts`)

Produto simples com estoque **10**, convertido por `PATCH /seller/products/:id` com 2 variações (estoque 4 e 2):

| Observação | Esperado | Observado (53f126d) |
|---|---|---|
| Linhas de `inventory` | variações (4, 2) + linha do produto simples **aposentada** | `[produto simples: 10]`, `[M: 2]`, `[P: 4]` — a linha simples continua com **10** |
| Total vendável do produto (`computeLiveStockAndSales`) | 6 | **16** |
| `stock` no detalhe público (`GET /products/:id`) | 6 | **16** |
| `availableStock` na lista do vendedor | 6 | **16** |
| `products.stock` (coluna-resumo) | 6 | 10 (desatualizada) |
| `POST /cart/items` **sem** `variantId` num produto com variações | 400 `VARIANT_REQUIRED` | **200** (aceita; a rota em lote já exigia) |
| Checkout de linha **sem variante** num produto com variações | recusa | **cria o pedido e reserva a linha do produto simples** (`reserved = 2`) |
| Conversão com pedido aberto (3 un. reservadas) | reserva preservada, disponível 0 | reserva preservada, mas a linha segue com 10 e soma 13 disponíveis no total |
| Voltar a simples (`variants: []`) e informar estoque 7 | total 7 | 5 (7 − 2 reservados pelo teste anterior); com a correção: 7 |

Resultado do teste contra o código atual: **6 de 14 passam** (as 8 falhas são a prova do defeito). Contra o protótipo da correção: **14 de 14**.

## 3. Origem exata (três camadas)

1. **Escrita — `syncVariantsForProduct` (`variantService.ts`)** cria uma linha de `inventory` por variação nova, mas **não trata a linha do produto simples**. O próprio `ProductCreationService` documenta o invariante violado: *"a linha de inventory do produto (variantId=null) NUNCA é criada quando há variações, porque `computeLiveStockAndSales` soma todas as linhas do `productId`"*. A conversão posterior quebra esse invariante.
2. **Leitura — `computeLiveStockAndSales` (`catalogService.ts`) e `InventoryService.syncProductStockSummary`** somam **todas** as linhas de `inventory` do produto: linha simples + variações (+ variações desativadas, parte já corrigida na Fase 7).
3. **Entrada — `addSingleCartLine` (rota unitária do carrinho) e `OrderService.createOrderFromCart`** não exigem variação num produto que tem variações ativas. O resolvedor de candidatos de estoque filtra `variant_id IS NULL` e **encontra** a linha órfã, então o pedido é aceito e reserva estoque "do produto simples" de um produto que o vendedor já considera variável.

## 4. O que NÃO é afetado (verificado)

- Compra **normal** de uma variação (com `variantId`): reserva na linha da **variação**, nunca na órfã (teste S9).
- Produto que **nasce** variável: nunca tem linha simples (teste S7).
- Pagamentos, escrow, comissões, carteiras: nenhum código desses módulos participa do defeito nem da correção.
- Pedidos já feitos: nenhum é alterado (a correção só atua na conversão, no carrinho e na leitura).

## 5. Correção proposta (5 arquivos, **sem migração**)

| Arquivo | Mudança |
|---|---|
| `inventoryService.ts` | `retireProductLevelStockForVariants(tx, …)`: quando o produto passa a ter variação ativa, a linha do produto simples (`SELLER_LOCATION`) é **aposentada sem ser apagada** — `quantityOnHand` cai para o já **reservado** (disponível 0) e a baixa é registrada como `ADJUSTMENT` auditável ("Estoque do produto simples substituído pelo estoque por variação"). **Idempotente.** Se houver estoque do produto **no HUB sem variação**, a conversão é **bloqueada** com mensagem clara (esse estoque pertence à operação do armazém). `syncProductStockSummary` passa a somar só o vendável (variações ativas, ou a linha simples quando não há variações). |
| `variantService.ts` | chama a aposentadoria no fim do sync, **na mesma transação** da conversão. |
| `catalogService.ts` | `computeLiveStockAndSales` ignora a linha sem variante enquanto houver variação ativa (defesa também para dados anteriores à correção). |
| `buyerRoutes.ts` | `addSingleCartLine`: `VARIANT_REQUIRED` (400) em **qualquer** porta de entrada do carrinho. |
| `orderService.ts` | checkout recusa linha sem variação de produto com variações ativas (`VARIANT_REQUIRED`) — cobre carrinhos antigos. |

**Histórico e integridade financeira:** nada é apagado; movimentos originais (`IN 10`) ficam; o ajuste é um movimento novo, assinado (`performed_by`), com o motivo. Reservas de pedidos em andamento são **preservadas** (a linha antiga fica com `onHand = reservado`). Nenhuma tabela de pagamentos/escrow/pedidos é escrita.

## 6. Riscos e mitigação

| Risco | Avaliação | Mitigação |
|---|---|---|
| **Estoque residual após cancelamento** de um pedido que estava reservando a linha antiga: ao liberar a reserva, `onHand` (3) > `reservado` (0) e a linha volta a ter unidades "invisíveis" (o total ignora a linha; o checkout recusa sem variação). | Médio-baixo (só em conversões com pedido aberto) | Chamar a aposentadoria também no caminho de **liberação/cancelamento** quando o produto tiver variações ativas (1 chamada; coberta por teste novo) e exibir a linha órfã no gerenciador de estoque. Incluir na implementação 8B. |
| **Ordem de locks** (produto → inventário na conversão; o checkout trava inventário em ordem global) | Baixo | A conversão trava a linha do produto e depois as linhas de inventário do **mesmo produto**; o checkout trava inventário e só **lê** produto. Testar em staging com concorrência (teste de corrida já existe para variações). |
| **Bloqueio por estoque no HUB sem variação** impede converter | Baixo (HUB é raro) | Mensagem orienta transferir/ajustar em Estoque & Armazéns antes. |
| **Carrinhos antigos** com linha sem variação ficam inválidos no checkout | Baixo | Mensagem pede escolher variação; carrinho continua legível. |
| **`products.stock` muda de significado** (passa a ser o vendável) | Baixo | É o que a coluna já pretendia ser ("resumo"); nenhum fluxo financeiro lê essa coluna. |
| **Dados existentes** | Nenhum em produção (0 produtos) | Se houver ambientes com dados, rodar um relatório read-only de "produtos com variação ativa e linha simples com estoque > reservado" antes de aplicar. |

## 7. Testes

- `scratch/test-stock-conversion-8a.ts` — 14 verificações (regressão do cenário): total, linha aposentada, histórico, `VARIANT_REQUIRED` no carrinho e no checkout, reserva preservada, ida e volta, idempotência, produto que nasce variável, estoque 0, compra da variação.
- Com o protótipo aplicado: 14/14 e **todas** as suítes existentes seguem verdes (Fases 3, 6, 7, checkout e carrinho: 46/46, 9/9, 57/57, 7/7, 58/58, 8/8, 36/36, 27/27, 12/12, 21/21).

## 8. Decisão pedida

Aprovar (ou ajustar) a correção para implementação na **Fase 8B/8C** (código + deploy, sem migração), incluindo o refinamento do cancelamento. Até lá, o risco prático é **nulo** (0 produtos); a recomendação é corrigir **antes** de o primeiro vendedor real converter um anúncio.
