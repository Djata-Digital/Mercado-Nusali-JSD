# 09 — Diagnóstico de comissões (Fase 8B)

> Somente leitura e análise de código. Nenhum percentual foi inventado ou configurado; nada foi alterado em produção.

## 1. Estado em produção (leitura somente-leitura em 2026-10-08)

| Nível | Estado |
|---|---|
| Padrão da plataforma (`platform_settings.defaultSellerCommissionPercent`) | **não existe** |
| Comissão por vendedor (`sellers.commission_rate`) | 0 vendedores cadastrados |
| Comissão por categoria (`categories.commission_rate`) | **nula nas 322 categorias** |

## 2. Precedência real (código do checkout, `orderService`)

Para cada item do pedido, na ordem:

1. `categories.commission_rate` **da própria categoria do produto** — a subcategoria folha; **não há herança da categoria principal**. Definir a taxa só na principal não vale para os produtos, que ficam nas subcategorias.
2. `sellers.commission_rate` do vendedor.
3. `platform_settings.defaultSellerCommissionPercent` (global).
4. Nenhuma das três → o pedido é **bloqueado** com `COMMISSION_NOT_CONFIGURED`. Não há percentual de reserva (o antigo 10% foi removido).

O cálculo é por item (`subtotal × taxa`), arredondado ao centavo, e o pedido guarda a taxa usada (`commissionRateSnapshot`); pedidos antigos nunca são recalculados. O aviso de comissão no cadastro do vendedor (Fase 7) usa a mesma cadeia, só leitura.

## 3. Interface administrativa que já existe

| Para quê | Onde |
|---|---|
| Padrão global | Painel › Configurações da plataforma (`AdminPlatformSettings`; `POST /admin/settings`, só GLOBAL_ADMIN). Mostra aviso "Nenhuma comissão default foi configurada ainda" |
| Por categoria | Painel › Categorias (`AdminCategoriesManager`; `POST/PATCH /admin/categories` com `commissionRate`; `null` remove) |
| Por vendedor | `PATCH /admin/sellers/:id/commission` (GLOBAL_ADMIN) e leitura `GET /admin/sellers/:id/commission`, que mostra os três níveis e qual vence por categoria |

## 4. Opções para decisão (sem sugerir percentuais)

| Opção | Como | Vantagens | Cuidados |
|---|---|---|---|
| **A. Só padrão global** | Definir um único percentual em Configurações | Mais simples; cobre todas as 292 subcategorias e todos os vendedores | Taxa única para tudo |
| **B. Padrão global + taxas por categoria** | Global como base; categorias com margem/risco diferentes recebem taxa própria | Flexível | Taxa de categoria vale só na folha; cadastrar nas 292 subcategorias dá trabalho (ver abaixo) |
| **C. Padrão global + exceções por vendedor** | Global; vendedores estratégicos negociados | Útil em onboarding comercial | Sobrepõe o global em todas as categorias do vendedor, mas **perde** para a taxa da categoria, se existir |

**Antes da primeira venda** é obrigatório ter no mínimo o padrão global (Opção A) ou, alternativamente, taxa em todas as categorias vendáveis. Recomendação operacional: configurar o padrão global **primeiro** (uma única ação, reversível) e só depois decidir exceções.

**Ponto de atenção:** não existe herança de taxa da categoria principal para as subcategorias. Se a Opção B for escolhida com taxas por grupo (ex.: "Eletrônicos"), será preciso aplicá-las às subcategorias; uma ferramenta de aplicação em lote com a mesma segurança do carregador pode ser proposta numa fase futura (depende da sua decisão).

## 5. Verificação sugerida depois de configurar (fase futura)

1. Painel: conferir que o aviso de padrão ausente desapareceu.
2. `GET /admin/sellers/:id/commission` de um vendedor de teste: `source` esperado.
3. Pedido de teste em **ambiente descartável** com o mesmo valor: comissão calculada e `commissionRateSnapshot` gravado. Nunca criar pedidos de teste em produção.
