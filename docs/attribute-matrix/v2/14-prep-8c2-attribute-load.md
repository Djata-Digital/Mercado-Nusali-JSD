# 14 — Fase 8C.2: pré-execução da carga de atributos (NADA foi escrito em produção)

> Tudo abaixo foi feito em **somente leitura** (sessões `READ ONLY` impostas pelo banco). Nenhum registro foi criado, alterado ou removido; nenhum deploy, migração, comissão ou produto. `REMOTE_WRITE_ENABLED` continua `false` no código publicado e no repositório.

## 1. Verificações (2026-10-09)

| Item | Resultado |
|---|---|
| Repositório | `main` = `origin/main` = HEAD = `19f6f27`; só a pasta `Mercado Nusali/` sem rastreio |
| Saúde | `/api/health` 200, `/api/categories` 200, `/api/products` 200 |
| Deploy ativo = `19f6f27` | **Verificado byte a byte no frontend**: o bundle público `index-CbLK62Bg.js` foi comparado com uma reconstrução local do código de `19f6f27` — a única diferença é a definição `VITE_USER_NODE_ENV:"development"` do ambiente local. O backend é construído no mesmo build/commit (não observável de fora) |
| `PRODUCT_ATTRIBUTES_STRICT` | **PENDÊNCIA**: o ambiente efetivo do Render não é legível sem credencial, e não há sondagem pública segura. Evidências indiretas: nenhuma referência no repositório, e nada nos deploys o define. Não afeta a carga (só afeta validação de chaves desconhecidas na criação de produtos, que não ocorre). Conferir no painel do Render antes da 8C.3 |
| Categorias | 322 (30 + 292), **idênticas** ao inventário auditado na 8A em todos os campos (id, nome, slug, pai, ordem, ativa, comissão); hash do conjunto igual (`84b8920494d4367f`) |
| Tabelas de atributos | `category_attributes` 0, `product_attribute_values` 0, `product_attributes` (legado) 0; nenhuma linha `seed` e nenhum id `attr_nsl_*` |
| Outros dados | 0 produtos, 0 variantes, 0 pedidos, 0 vendedores, 1 usuário |
| Migrações | 38, a última aplicada em 2026-10-08 18:12 UTC (inalterada desde as leituras anteriores) |
| Alterações administrativas desde a homologação | **nenhuma**: `audit_logs` = 586, último evento em 2026-10-04; 0 eventos desde 2026-10-08; `platform_settings` com as mesmas 3 chaves e datas antigas |
| Comissão | continua ausente (global, vendedores e categorias) — não alterada |

## 2. Dry-run final das 847 operações (contra a produção, sem escrita)
Comando: `plan --allow-remote-read` (sessão `READ ONLY`), duas execuções com o mesmo resultado:

- esquema compatível (24 colunas; CHECK de origem aceita `seed`);
- árvore: inventário 322 = banco 322, **0 faltando, 0 a mais, 0 alteradas**;
- matriz `v2-2026-10-08`: 847 operações, **0 erros e 0 avisos do validador**, hash `05b3b649e91b…ffbc8` (igual ao artefato revisado);
- estado: **847 a criar, 0 já presentes, 0 deriva, 0 de outra origem, 0 erros**;
- frase de confirmação que a 8C.3 exigirá: `APLICAR v2-2026-10-08 05b3b649e91b EM aws-1-eu-west-3.pooler.supabase.com:5432/postgres`;
- duração do dry-run: ~3 min (latência medida ao banco: 215 ms por consulta).

**Conflitos / herança / overrides / desativações:** nenhum conflito. 806 definições, 7 overrides e 34 desativações compilam sobre uma tabela vazia; os efetivos das 322 categorias já foram provados contra o serviço real (25/25 e 32/32 em PostgreSQL 17 descartável, mais o ensaio abaixo).

## 3. Backup e restauração verificável

**Escopo.** A carga só **insere** em `category_attributes` (hoje vazia) e acrescenta linhas em `audit_logs`; `categories`, `products` e demais tabelas não são tocadas. Mesmo assim, o backup cobre as tabelas de atributos e as de apoio **não pessoais**.

**Procedimento (executado em ensaio, somente leitura na produção):** `scratch/p8c2_backup_rehearsal.cjs`
1. `pg_dump` (cliente 17) de `categories`, `category_attributes`, `product_attribute_values`, `product_attributes`, `platform_settings` — dados (`--column-inserts`) e esquema, sem dono/privilégios; sem tabelas com dados pessoais (`audit_logs` e `users` ficam fora). O arquivo foi verificado: 322 linhas de categorias, nenhuma ocorrência de e-mail/senha/CPF.
2. Guardar fora do repositório (a pasta `scratch/_backup/` é ignorada pelo git), registrar o SHA-256 e copiar para um segundo local. Ensaio de hoje: `p8c2_data.sql` = `75cb09fa…`, `p8c2_schema.sql` = `d5a998c6…`.
3. **Backup do provedor** (Supabase: backup diário/PITR): **PENDÊNCIA** — não consigo ler o painel. Antes da 8C.3, o responsável deve confirmar que existe um ponto de restauração recente (ou tirar um backup manual) e anotar o horário.

**Restauração ensaiada (`scratch/p8c2_restore_check.cjs`, PostgreSQL 17 descartável com o mesmo esquema):**
- restaurar o dump (sessão com `session_replication_role = replica` para ignorar a ordem das chaves estrangeiras): 322 categorias, hash `84b8920494d4367f` **idêntico ao da produção**, 3 configurações, 0 atributos;
- o `plan` do carregador sobre a cópia restaurada: 847 a criar, 0 deriva (a cópia é equivalente à produção);
- carga completa ensaiada na cópia: 847 criadas, verificação 322/322 sem divergência;
- **restauração do backup depois da carga**: voltou a 0 atributos, 322 categorias e hash idêntico → `RESTAURACAO VERIFICADA: true`.

A reversão normal **não** é a restauração do backup, e sim `rollback` do carregador (remove só linhas `seed` não editadas — testado). O backup é o último recurso.

## 4. Plano de execução em lotes (para a 8C.3, não autorizado agora)
Pré-condições: autorização expressa; backup do provedor confirmado e dump com SHA-256 registrado; `STRICT` conferido; dry-run repetido no dia (hash e 0 deriva); janela de execução sem edições administrativas; máquina estável e sem suspensão; monitor aberto.

1. **Lote-piloto**: `apply --stop-after 100 --batch-size 50` → 2 lotes; conferir `p8c2_monitor.cjs` (100 linhas `seed`, 2 auditorias de lote), `verify` parcial não se aplica (executa só ao final). Se algo divergir: parar e `rollback`.
2. **Carga completa**: repetir `apply` (idempotente; pula as 100 existentes e cria as 747): lotes de 50 (17 no total), validação pós-lote (contagem no banco = esperada), auditoria `system.attribute_matrix.batch_applied` por lote, diário JSONL local.
3. **Verificação final automática** (322 categorias: efetivos, herança, origem) e verificação independente `verify` (somente leitura).
4. **Retomada**: qualquer queda → rodar `apply` de novo (testado: parada em 333 e retomada).
5. **Duração estimada**: ~7,5 mil consultas × 215 ms ≈ **27 min** de carga + ~5 min de verificação ≈ **35 min** (medido localmente: 8,9 consultas por operação; local 13 s).
6. **Critérios de parada**: erro de serviço, deriva, contagem pós-lote divergente, qualquer 5xx novo, ou edição administrativa concorrente.

## 5. Monitoramento e verificações após uma eventual carga
- **Durante**: `node scratch/p8c2_monitor.cjs --loop 40` (somente leitura; a cada 30 s): linhas `seed`, `admin`, overrides, valores de produto (deve seguir 0), produtos (0), lotes auditados, categorias (322), migrações (38) e HTTP `/`, `/api/health`, `/api/categories` com contagem de 5xx. Linha de base de hoje: tudo zero e 0 erros.
- **Depois**: (1) `verify` do carregador (322/322, 847 `seed`); (2) `scratch/p8c2_prod_audit.cjs` (806 definições + 7 overrides + 34 desativações = 847 `seed`, 0 `admin`, 0 produtos/valores, 322 categorias idênticas, 38 migrações, uma linha de auditoria `system.attribute_matrix.batch_applied` por lote: 2 do piloto + 17 da carga completa = 19); (3) endpoint público `GET /api/categories/<id>/attributes` em amostras (herança: Vestidos, Roupas tradicionais, Calçados, Smartphones, Panelas) comparadas com `03-effective-by-category.md`; (4) abrir o assistente de cadastro em 3 subcategorias **sem criar produto**; (5) logs do Render sem 5xx; (6) registrar hash, contagens e diário.

## 6. Reversão da carga
1. `rollback-plan` (somente leitura) → deve listar 847 removíveis e 0 bloqueios; `rollback` com a frase `REVERTER …` (mesmas travas). Para na primeira linha editada pelo admin ou de outra origem.
2. Se já existirem produtos com valores desses atributos, a exclusão é recusada pelo serviço: usar desativação por override (aditiva) e uma nova versão da matriz.
3. Restauração do backup somente por decisão do dono (desfaz também edições legítimas posteriores).

## 7. Como a escrita remota seria habilitada (IDENTIFICAÇÃO — nada foi alterado)
O carregador **roda na máquina do operador**, não no servidor: ele não está no bundle publicado (verificado), portanto habilitar a escrita **não exige deploy**. Hoje há **duas** travas independentes contra escrever na produção; a 8C.3 teria de relaxar ambas, de forma estreita e revisada:

| Arquivo | O que trava hoje | Mudança necessária (a desenhar e revisar com o dono na 8C.3) |
|---|---|---|
| `scripts/attribute-matrix/loaderSafety.ts` | constante `REMOTE_WRITE_ENABLED = false` (recusa qualquer alvo remoto) | ligar a constante **apenas numa alteração temporária local** |
| `scripts/attribute-matrix/loaderSafety.ts` | em `assertExecutionAllowed`, o alvo que coincide com um banco de produção conhecido é **sempre** recusado (`PRODUCTION_TARGET_REFUSED`), mesmo com a constante ligada | trocar a recusa incondicional por uma exceção estreita: só vale com hash da matriz, alvo exato, referência de autorização digitada e prazo de validade |
| `scripts/attribute-matrix/load.ts` | leitura dos argumentos da linha de comando | repassar a referência de autorização ao verificador |
| `scratch/test-attr-loader-8b.ts` (T7, T9, T9b) e `scratch/mutation-loader-8b.cjs` (L1, L2) | afirmam que a escrita remota e a de produção são recusadas | não rodar essas suítes na alteração temporária; rodá-las de novo ao voltar |

Eu **deliberadamente não preparei um patch pronto** que contorne as travas: isso deve ser desenhado e aprovado por você na 8C.3. As demais exigências (hash, frase com host e banco, `NODE_ENV` diferente de `production`) permanecem.

### Plano para voltar a desabilitar
1. A alteração fica numa **branch temporária local** (`ops/attribute-load-8c3`), **nunca** mesclada em `main` nem enviada ao `origin`, e é usada só durante a janela.
2. Ao terminar: apagar a branch e voltar a `main`/`feat/attribute-matrix-8b`; `git diff main -- scripts/attribute-matrix` deve ficar vazio; `grep "REMOTE_WRITE_ENABLED = false"` deve encontrar a linha; `git ls-remote origin` não deve mostrar a branch temporária.
3. Reexecutar `test-attr-loader-8b` (32/32) e `mutation-loader-8b` (9/9) para provar que as recusas voltaram.
4. Rotacionar/limpar o que foi usado na janela: o diário JSONL fica guardado fora do repositório; a variável de alvo (`ATTR_LOAD_DATABASE_URL`) é apagada do shell.
5. Registrar no relatório da 8C.3 o horário de início e fim da janela.

## 8. Classificação
**PRONTO PARA A 8C.3, COM 3 PENDÊNCIAS NÃO BLOQUEANTES** (todas fora do meu alcance técnico): (a) conferir `PRODUCT_ATTRIBUTES_STRICT` no painel do Render; (b) confirmar/tirar o backup do provedor; (c) aprovar o desenho da exceção de escrita (§7). Nada crítico divergiu: produção saudável, árvore idêntica, 847/0 deriva, restauração ensaiada.
