# 11 — Correção do estoque na conversão simples → variável (implementada localmente, NÃO publicada)

Commits locais `4ed3e0c` (8B) e `997d61c` (8C.1: trava do despacho e testes) na branch `feat/attribute-matrix-8b`. Sem migração. Pagamentos, escrow e comissões não foram tocados. Diagnóstico original: `docs/attribute-matrix/v1/08-stock-conversion-diagnosis.md`.

## O que foi corrigido

| Requisito | Implementação |
|---|---|
| Linha simples não pode continuar vendável após a conversão | `InventoryService.retireProductLevelStockForVariants`: dentro da transação da conversão, `quantityOnHand` da linha do produto cai para o já reservado (disponível 0). Idempotente; bloqueia a conversão se houver estoque sem variação no HUB |
| Não apagar histórico; ajuste auditável | A linha continua; entra um movimento `ADJUSTMENT` com motivo e autor. O `IN` original permanece |
| Preservar reservas e movimentações | Reservas abertas ficam (`onHand = reservado`); pedidos podem ser despachados normalmente (despacho baixa `onHand` e `reservado` juntos) |
| Reserva antiga cancelada não reintroduz estoque | `InventoryService.settleRetiredProductLevelRow`, chamada por `releaseStock` (usado por cancelamento do comprador e expiração de pagamento): baixa as unidades da linha aposentada com ajuste auditável |
| Carrinho/checkout exigem variante | `POST /cart/items` (rota unitária) e `createOrderFromCart` retornam `VARIANT_REQUIRED` quando há variantes ativas |
| Variante desativada não é vendida | Carrinho: `VARIANT_INACTIVE` (já existia); checkout: agora também `VARIANT_INACTIVE`, `VARIANT_NOT_FOUND` e variante de outro produto |
| Não duplicar estoque / preservar SKU, preço, estoque das variantes | Reenviar as mesmas variantes não gera novo ajuste nem altera linhas (teste S13, S6) |
| Leitura | `computeLiveStockAndSales` e `syncProductStockSummary` ignoram a linha simples enquanto houver variante ativa |
| Ajuste de estoque pelo vendedor | `updateSellerStock` sem variante em produto variável ⇒ `VARIANT_REQUIRED`; sem `variantId` o alvo é sempre a linha simples (antes podia pegar a linha de uma variante) |
| Concorrência | 3 conversões simultâneas ⇒ exatamente 1 ajuste; checkout × conversão simultâneos mantêm `onHand == reservado` na linha aposentada |

## Testes (PostgreSQL 17 descartável)

- `test-stock-conversion-8b`: **31/31** (S1–S16: conversão, reserva anterior, cancelamento, idempotência, carrinho, checkout, variante desativada/de outro produto, ajustes, concorrência, rollback transacional, bloqueio por estoque no HUB, histórico).
- Teste de mutação: **8/8** mutantes mortos (retirada, baixa no cancelamento, VARIANT_REQUIRED no checkout e no carrinho, variante desativada, ajuste sem variante, leitura, idempotência).
- Regressão com a correção: Fase 3 (58/58, 7/7), 6 (57/57), 7 (46/46, 9/9), carrinho/corrida (12/12), quantidade/preço (27/27), variantes e transferências (33, 15, 13, 36, 36, 32, 43), reservas e checkout inteligente (39, 38), carrinho backend (8), roteamento (21), reserva/submissão (57/57), expiração (14/14).
- Falhas **anteriores** (idênticas no código-base, comparadas com `git stash`): `d18c52` (34/35, `MULTI-SELLER3`), `checkout-order-mode` (erro de import), e 3 suítes antigas que importam `shippingRates`, inexistente.

## Limitações

- Estoque do produto no HUB sem variação bloqueia a conversão (mensagem orienta transferir/ajustar antes). A resposta HTTP hoje é 500 com a mensagem; ajuste de status é cosmético.
- (Fase 8C.1) O despacho físico de um pedido reservado **antes** da conversão agora tem teste do fluxo real: `test-stock-old-reservation-8c1` (**17/17**): pedido de 3 un. → conversão → confirmação → `executePhysicalDispatch` baixa a linha antiga (0/0), variantes intactas, estoque físico 6, histórico `IN 10 → AJUSTE −7 → OUT −3`, despacho idempotente, linha antiga não vendável; cancelamento e expiração após a conversão; concorrência despacho × conversão (4 rodadas); falha com rollback.
- (Fase 8C.1) `executePhysicalDispatch` passou a travar a linha de estoque (`FOR UPDATE`) — sem isso uma conversão simultânea poderia perder a atualização; teste determinístico K2 e mutante morto.
- Não publicada: aguarda autorização.
