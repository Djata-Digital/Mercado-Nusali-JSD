# 07 — Resultados de validação (Fase 8A)

> Todos os testes rodaram em **PostgreSQL 17 descartável** (container `nusali-pg17-restore`, porta 55434, bancos clonados do modelo `phase3_tmpl` com as 38 migrações). A produção foi acessada **somente para leitura** (`BEGIN READ ONLY … ROLLBACK`) para ler as 322 categorias. Nenhum atributo, produto, vendedor ou migração foi criado em produção.

## 1. Portões

| Portão | Resultado |
|---|---|
| `git diff --check` | limpo |
| Arquivos rastreados modificados | **0** (tudo novo e não rastreado: `docs/attribute-matrix/`, `scripts/attribute-matrix/`, `src/data/attributeMatrix/`) |
| `tsc --noEmit` | 584 erros (linha de base, **todos em `scratch/`**), **0 em `src/` e `scripts/`** |
| Validador da matriz (dry-run) | **0 erros, 0 avisos**, 48 informativos |

## 2. Dry-run da matriz (`summary.json`)

322 categorias (30 principais + 292 subcategorias) · 806 definições · 7 overrides · 34 desativações · **847 operações** · 307 categorias com atributos · 210 com eixos · média de **3,66** atributos efetivos por subcategoria · máx. 8 especificações, máx. 3 obrigatórias, máx. 2 eixos.

## 3. Suíte de aplicação em banco descartável — `test-attr-matrix-8a.ts` (25/25)

| Grupo | O que prova |
|---|---|
| A1–A2 | dry-run puro: cobertura 322/322, ordem de aplicação (principal antes da filha), ids determinísticos únicos |
| B1 | as 322 categorias **reais** (mesmos ids/slugs/parentId) importadas no banco de teste |
| C1–C3 | dry-run no banco não escreve nada; aplicação pelo **serviço real** em 9 lotes de 100, 0 erros, 0 deriva, contagem validada após cada lote; estrutura gravada (806 + 7 + 34) |
| D1–D3 | **efetivos de todas as 322 categorias** = previsão do resolvedor puro (campos, ordem, herança, origem); desativações e overrides valem só onde declarados |
| E1–E7 | **idempotência** (reaplicar = 847 puladas, 0 criadas); **deriva** (edição manual é relatada, nunca sobrescrita); **reversão** limpa; **falha no meio** (parada após 333) deixa estado parcial coerente; **retomada** conclui as 514 restantes; **conflito** com atributo manual interrompe com erro claro |
| F1–F5 | **um produto real em cada uma das 292 subcategorias** (valores tipados válidos + 2 variantes onde há eixos): 292/292; o assistente mostra todas as especificações, eixos fora do formulário geral, payload aprovado no cliente e no servidor em modo **estrito**; ficha pública com nomes amigáveis; chaves de variante únicas |
| G1–G3 | smartphone sem atributos acusa exatamente os 2 obrigatórios; categoria principal continua sem aceitar produto; com produtos, a reversão **para** no primeiro atributo em uso |

## 4. Suíte negativa do validador — `test-attr-matrix-validator-8a.ts` (22/22)

Defeitos injetados e detectados: categoria sem plano (`cobertura`), categoria inventada (`categoria-inexistente`), código herdado redefinido sem override (`conflito-heranca`), override sem herdado (`override-invalido`), desativar o que não é herdado (`desativacao-invalida`), código no pai e na filha (`conflito-descendente`), campo geral duplicado por nome (`campo-geral-duplicado`), nome que o assistente esconderia (`nome-reservado`), código reservado, obrigatórios em excesso, campos em excesso, opções repetidas, opção com vírgula, mín > máx, unidade inconsistente entre categorias, tipo inconsistente, eixo multisseleção, nome repetido no caminho, código duplicado, override em categoria principal, e determinismo da compilação.

## 5. Compatibilidade com as Fases 1–7 (suítes existentes, código atual inalterado)

Fase 7: 46/46 · Fase 7 checkout: 9/9 · Fase 6: 57/57 · Fase 3 checkout: 7/7 (e as demais suítes de carrinho/checkout/estoque do repositório seguem verdes com o protótipo aplicado).

## 6. Estoque na conversão — `test-stock-conversion-8a.ts` (14 verificações)

| Código | Resultado |
|---|---|
| **Atual (53f126d)** | **6/14** — as 8 falhas reproduzem o defeito (total 16 em vez de 6; linha simples não aposentada; carrinho unitário aceita sem variação; checkout reserva a linha órfã) |
| **Com `stock-conversion-fix.patch`** | **14/14** (aplicado, testado e **revertido**; árvore de trabalho limpa) |

## 7. O que NÃO foi feito (por determinação)

Nenhuma escrita em produção · nenhuma migração · nenhum atributo real criado · nenhum push · nenhum deploy · nenhuma correção de estoque aplicada.
