# 13 — Homologação e plano de publicação do código (Fase 8C.1)

> **Nada foi publicado.** Este documento prepara a decisão. A publicação exige autorização específica para o commit identificado no relatório final.

## 1. Auditoria da produção (somente leitura, 2026-10-09)

| Item | Resultado |
|---|---|
| Código publicado | bundle `index-DRqeJHTc.js` = commit `53f126d` (main = origin/main = `53f126d`) |
| Saúde | `GET /api/health` → 200, `environment: production`, banco conectado |
| Banco | PostgreSQL 17.6, sessão `READ ONLY` imposta (`transaction_read_only = on`) |
| Migrações | **38 aplicadas** = 38 no `_journal.json` do repositório (última `0037_attributes_foundation`) |
| Categorias | 322 (30 principais + 292 subcategorias), todas ativas, 0 slugs duplicados, 0 com taxa de comissão |
| Esquema usado pelo código novo | **compatível**: nenhuma coluna faltando em `category_attributes`, `product_attribute_values`, `product_variants`, `inventory`, `inventory_movements`, `stock_reservations`, `order_items`, `audit_logs` |
| Origem `seed` | CHECK `category_attributes_source_check` aceita `admin` e `seed` |
| "Outro" estruturado | índice `product_attribute_values_uq (product_id, attribute_id, COALESCE(option_value,''))` e CHECK `num_nonnulls(...) = 1` presentes — a 2ª linha de especificação cabe sem migração |
| Dados | 0 produtos, 0 variantes, 0 estoque, 0 reservas, 0 pedidos, 0 vendedores, 0 definições de atributos, 0 valores |
| Comissão | `defaultSellerCommissionPercent` **ausente**; 0 vendedores e 0 categorias com taxa |
| Chaves de `platform_settings` | `autoReleaseEnabled`, `defaultShippingPolicyMode`, `escrowHoldingHours` |

**Conclusão:** não há incompatibilidade entre o código local e o esquema de produção.

### Variáveis de ambiente
O código novo **não introduz nenhuma variável**. O carregador usa `ATTR_LOAD_DATABASE_URL`, mas só em execução manual local e nunca no servidor. Nomes que o servidor já usa (e que o `.env` local lista): `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `REDIS_URL`, `ASAAS_*`, `RESEND_API_KEY`, `STORAGE_*`, `INTERNAL_JOBS_SECRET`, `APP_URL`, `EMAIL_FROM`. **Não foi possível ler o estado do painel do Render** (sem credencial de API nesta sessão, e nenhum valor secreto foi consultado): confirmar manualmente no painel que o serviço está "Live" no commit `53f126d` e que `PRODUCT_ATTRIBUTES_STRICT` continua desligado.

## 2. Segurança do carregador na publicação
- Nenhum arquivo de `scripts/attribute-matrix/` ou `src/data/attributeMatrix/` é importado por `server.ts` ou por `src/server/` (busca por import: nenhuma ocorrência; o bundle do servidor também foi inspecionado).
- `package.json` não foi alterado: nenhum script `build`, `start` ou de implantação executa o carregador; o servidor não roda seed nem migração na inicialização (o `runRuntimeSchemaAlign` preexistente é idempotente e não foi tocado).
- `REMOTE_WRITE_ENABLED = false` e as recusas foram retestadas (32/32; mutação 9/9).
- Não há rota HTTP, job ou hook que dispare a matriz. Aplicar os 847 registros continua exigindo a Fase 8C.2 e uma chave no código.

## 3. Plano de deploy (a executar somente com autorização)

| # | Passo | Detalhe |
|---|---|---|
| 1 | Serviços afetados | Um único serviço Render (monólito Express + frontend Vite). Sem worker/cron novo |
| 2 | Branch de publicação | `main`, por avanço rápido (fast-forward): `main` hoje = `53f126d`, ancestral do commit a publicar |
| 3 | Commit | o HEAD homologado, identificado no relatório |
| 4 | Build | Sim: `npm run build` (vite + esbuild); já executado localmente com sucesso |
| 5 | Migração | **Nenhuma** (nenhum arquivo em `drizzle/`, `src/db/` ou `package.json` mudou desde `53f126d`) |
| 6 | Seed | **Nenhum** |
| 7 | Comando | `git update-ref refs/heads/main <NOVO> 53f126d`; `git push origin main:main`; `git push origin feat/attribute-matrix-8b`. Nunca force-push |
| 8 | Aguardar | deploy automático do Render no `main` |

### Compatibilidade entre instâncias durante o deploy
Sem mudança de esquema, instâncias antigas e novas convivem com o mesmo banco. As mudanças de API são aditivas (campos `option`/`otherDetail` nos valores). A única divergência possível na janela do deploy é entre o frontend antigo e o backend novo (ou o inverso) no uso de "Outro": hoje há **0 definições de atributos e 0 produtos** em produção, então nenhum formulário de atributos existe para ser afetado.

### Smoke tests pós-publicação (todos somente leitura; sem criar conta, produto ou pedido)
1. `GET /` → o nome do bundle muda de `index-DRqeJHTc.js`.
2. `GET /api/health` → 200, banco conectado.
3. `GET /api/categories` (ou equivalente público) → 322 categorias.
4. `GET /api/products` → lista vazia, sem erro.
5. Auditoria somente leitura repetida (`scratch/p8c1_prod_audit.cjs`): migrações 38, 322 categorias, **0 definições, 0 valores, 0 produtos**, `audit_logs` sem linhas `system.attribute_matrix.*`.
6. Logs do Render sem erros 5xx novos nos primeiros minutos.

### Reversão do código
- **Rápida (painel):** "Rollback" do Render para o deploy anterior (`53f126d`). Seguro porque não há migração.
- **Pelo git:** `git revert` dos commits publicados (novo commit, avanço rápido), nunca force-push.
- Os dados não são afetados: a produção continua com 0 produtos e 0 definições; nenhuma escrita de dados acontece no deploy.

## 4. Homologação (PostgreSQL 17 descartável)
Ver os resultados no relatório final: cadastro e edição de produtos, obrigatórios e opcionais, "Outro", variantes, estoque, reservas, carrinho, checkout, cancelamento, despacho, ficha pública, permissões e auditoria foram cobertos pelas suítes das Fases 3 a 8C.1.

## 5. Pendências que continuam fora desta fase
- Comissão não configurada: a primeira venda seria bloqueada (`09-commissions.md`).
- 73 subcategorias para revisão regulatória; 13 em *Atenção* (`08-regulatory-review.md`).
- Aplicar a matriz (847 operações) é a Fase 8C.2 — não autorizada.
