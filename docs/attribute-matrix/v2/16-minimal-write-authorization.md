# 16 — Autorização mínima para a carga (Fase 8C.3) — estado e runbook

> **Nenhuma escrita em produção foi feita.** Este documento descreve o mecanismo mínimo (substitui o desenho de bilhetes Ed25519 do doc 15), o que já está pronto e testado, o que falta e o que **bloqueia** a execução.

## 1. Mecanismo mínimo (uma operação administrativa)
Em vez de assinaturas, o limite é imposto **pelo próprio banco**, com um papel dedicado e temporário que **você** cria:

| Requisito pedido | Como é atendido |
|---|---|
| Credenciais com privilégios mínimos | Papel `attr_loader_8c3`: `INSERT`+`DELETE` em `category_attributes`, `INSERT` em `audit_logs`, `SELECT` só em `categories`, `category_attributes`, `product_attribute_values`, `product_attributes`, `products`. **Nada mais.** Sem superusuário, sem criar papel/banco, sem herdar de outros papéis |
| Prazo curto | `VALID UNTIL` = agora + 3 h, **imposto pelo banco** (depois disso nem conecta); `CONNECTION LIMIT 2`; `statement_timeout 60s` |
| Alvo de banco exato | `--allow-target "host:porta/banco"` precisa coincidir com a URL |
| Hash fixo da matriz | `--expect-hash` (já existe) |
| Confirmação explícita | `--confirm "APLICAR … EM <alvo>"` (já existe) |
| Limite de operações | `--max-operations N` obrigatório (piloto 100; restante 747) |
| Auditoria | `window_opened` antes da 1ª escrita (sem ela, nada é escrito), `batch_applied` por lote, `window_closed` ao final |
| Bloqueio padrão | Qualquer outra credencial (inclusive a do app) continua recusada: `PRODUCTION_TARGET_REFUSED` / `REMOTE_WRITE_DISABLED`. Sem o papel, nada muda |
| Revogação | `limited-role.revoke.sql`: derruba conexões, remove privilégios e **apaga o papel**; idempotente |
| Verificação da sessão | Antes de qualquer escrita, o carregador confere **no banco** o papel exato, o prazo (≤ 3 h), os atributos do papel e os **privilégios efetivos** lidos do catálogo (qualquer escrita fora de `category_attributes`/`audit_logs` → recusa) |

Arquivos (já no repositório): `scripts/attribute-matrix/limitedWriter.ts` (SQL + verificação da sessão), `docs/attribute-matrix/v2/ops/limited-role.create.sql` e `limited-role.revoke.sql` (a senha é um **marcador**: você define a sua; nunca a compartilhe).

## 2. O que foi testado (PostgreSQL 17 descartável, `scratch/test-attr-limited-role-8c3.ts` — **31/31**)
- A **carga completa funciona só com esse papel**: dry-run 847/0 deriva; piloto de 100 (lotes de 50) → exatamente 100 linhas `seed`; restante → 747; total 847; verificação das 322 categorias sem divergência; reversão completa; auditoria gravada.
- **O papel não consegue** (17 tentativas, todas `permission denied`): escrever em produtos, pedidos, estoque, categorias/comissões, vendedores, configurações, escrow/pagamentos, alterar ou apagar auditoria existente, `UPDATE`/`TRUNCATE` em atributos, criar tabelas; nem ler usuários e pagamentos.
- **Desvios do papel recusados pela verificação** (cada um testado): `UPDATE` em produtos, `INSERT` em pedidos, `UPDATE` de uma coluna (comissão), `DELETE` em auditoria, `TRUNCATE`, falta de `INSERT` em auditoria, sem prazo (`infinity`), prazo de 2 dias, superusuário, `CREATEROLE`, `BYPASSRLS`, membro de outro papel, `CREATE` no schema e no banco; credencial de superusuário/outro nome; prazo vencido (o banco recusa a conexão).
- **Revogação**: conexão aberta derrubada, papel removido (0 restantes), nova conexão recusada; repetir é seguro; os atributos já carregados permanecem.

## 3. O que falta e por que está BLOQUEADO
1. **Ligação (wiring) do carregador ao papel — NÃO aplicada.** Exige alterar `scripts/attribute-matrix/loaderSafety.ts` (a recusa de alvo remoto/produção passa a ter uma única exceção: usuário `attr_loader_8c3` + `--allow-target` + `--max-operations`), `scripts/attribute-matrix/load.ts` (verificação da sessão, abertura/fechamento da janela de auditoria, limite de operações) e `scripts/attribute-matrix/applyEngine.ts` (teto de remoções na reversão). O mecanismo de permissões do ambiente **negou duas vezes** essas edições por tocarem nas proteções do carregador. Não contornei. É preciso que o responsável autorize explicitamente essa edição (ou a aplique), junto com os testes das recusas (`T7`, `T9`, `T9b` continuam valendo, pois outras credenciais seguem recusadas) e a mutação.
2. **Backup do Supabase — NÃO VERIFICADO.** Sem acesso ao painel. Confirmar data/hora, escopo (projeto/banco), método e disponibilidade da restauração (PITR ou backup diário) e tirar um backup manual se necessário.
3. **`PRODUCT_ATTRIBUTES_STRICT` no Render — NÃO VERIFICADO.** Sem acesso ao painel. Confirmar que não existe ou está desligada (não afeta a carga, mas é um gate).
4. **Autorização expressa para o primeiro lote real** — não dada (este pedido autoriza a preparação).

## 4. Runbook (somente depois de 1–4 resolvidos)
1. Você, no SQL Editor do Supabase como administrador: abrir `limited-role.create.sql`, **trocar o marcador de senha por uma senha longa e aleatória sua** e executar. Anotar o horário (o prazo é de 3 h).
2. Você monta a URL do papel (usuário `attr_loader_8c3.<ref-do-projeto>` no pooler) e a coloca **apenas** na variável `ATTR_LOAD_DATABASE_URL` do shell que roda o carregador (não em arquivo, não em chat).
3. Repetir o `plan --allow-remote-read` (hash `05b3b649e91b…`, 847 a criar, 0 deriva).
4. **Piloto**: `apply --expect-hash <hash> --confirm "<frase>" --allow-target "<host:porta/banco>" --max-operations 100 --batch-size 50`; checar com `scratch/p8c2_monitor.cjs` (100 linhas `seed`, 2 lotes auditados, 0 valores/produtos) e a API (health, categorias).
5. **Restante**: mesmo comando com `--max-operations 747`; verificação final automática das 322 categorias + `verify` + `scratch/p8c2_prod_audit.cjs` (847 `seed`, 806/7/34, 0 produtos, 38 migrações).
6. **Encerramento**: executar `limited-role.revoke.sql`; conferir `papeis_restantes = 0`; limpar `ATTR_LOAD_DATABASE_URL`; confirmar que uma tentativa de conexão com o papel falha; guardar o diário JSONL e os relatórios; registrar o fim da janela.
7. Se algo falhar em qualquer ponto: parar, `rollback-plan`/`rollback` (mesmas travas) e revogar o papel.

## 5. Limitações
- O papel limita o que **este** caminho consegue fazer; a credencial administrativa do app (em `DATABASE_URL`) continua existindo e é recusada pelo carregador, mas não é tecnicamente "trancada" pelo banco — a barreira para ela é o próprio carregador e o processo.
- O prazo do papel é do banco; o fechamento da janela na auditoria é melhor-esforço (a revogação do papel é a garantia real).
