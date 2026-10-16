# Testes essenciais (versionados)

Esta pasta guarda os testes que protegem fluxos críticos e **não dependem de `scratch/`** (pasta ignorada pelo git). Os helpers compartilhados ficam em `tests/support/`
(`checkoutTestKit.ts`, `ledgerTestDbGuard.ts`); os arquivos de mesmo nome em `scratch/` apenas reexportam, para os testes antigos continuarem funcionando.

| Arquivo | O que cobre | Precisa de banco |
|---|---|---|
| `mobile-compact-listing.test.ts` | cartão compacto (sem dados fictícios), grades de 2 colunas, categorias com «Ver todas», abrir produto no topo, botão «Adicionar» (sem propagação, variações → página do produto), aviso de carrinho, ajuste rápido de estoque, escopo (nada de frete/pagamento/checkout) | não |
| `ledger-e1-coupon-and-group-payment.test.ts` | ledger (E1): pedido com cupom do vendedor é contabilizado na entrega; `PAYMENT_RECEIVED` por pedido filho de purchase_group; regras de comissão/frete/subsídio/Escrow/carteira preservadas; idempotência, concorrência, isolamento por vendedor, falha + repetição, snapshots, comparador sombra | **sim** (Postgres descartável; liga o ledger sombra por conta própria) |
| `seller-variant-stock.test.ts` | estoque por SKU no formulário do vendedor: edição/persistência, reservas, transferências pendentes, alteração concorrente, ordem de locks (sem deadlock), livro de movimentos, atualização conjunta, permissões, produto simples | **sim** (Postgres descartável) |

## Como rodar

```bash
npm run test:mobile            # sem banco
# banco descartável (nunca produção): docker compose -f docker-compose.dev.yml up -d  → porta de teste isolada
export LEDGER_TEST_DATABASE_URL="postgres://postgres:postgres@localhost:55434/<banco_descartavel>"
npm run test:variant-stock     # exige o banco acima (o guarda recusa qualquer outro)
npm run test:ledger-e1         # ledger E1 (exige o banco acima)
npm run test:essential         # todos
```

`ledgerTestDbGuard` aborta se a URL não for de um banco local descartável. Cada execução de `test:variant-stock` deve usar um banco recém-criado a partir do template (as suítes criam dados).
