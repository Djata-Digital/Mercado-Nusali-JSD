# Matriz de atributos — Mercado Nusali — v1-2026-10-08 (Fase 8A)

Proposta **revisável e versionada**, ainda **não aplicada**. Nada foi gravado em produção.

| Arquivo | Conteúdo |
|---|---|
| `01-category-inventory.md` | inventário das 322 categorias reais (30 + 292), lido em leitura-apenas |
| `02-attribute-definitions.md` | definições propostas (806) |
| `03-effective-by-category.md` | atributos efetivos por categoria (herança resolvida) |
| `04-inheritance-overrides.md` | herança, 7 overrides e 34 desativações |
| `05-variant-axes.md` | eixos de variante por subcategoria + limite de 2 dimensões e onde uma 3ª seria desejável |
| `06-conflicts-and-gaps.md` | conflitos, lacunas e duplicações com campos gerais |
| `07-validation-results.md` | resultados de todos os testes |
| `08-stock-conversion-diagnosis.md` | diagnóstico do estoque na conversão simples → variável + proposta |
| `09-production-application-plan.md` | plano futuro de aplicação em produção |
| `matrix.json`, `operations.json`, `summary.json`, `validation.issues.json`, `categories.inventory*.json` | dados legíveis por máquina |
| `stock-conversion-fix.patch` | protótipo da correção de estoque (não aplicado) |

Código-fonte da matriz: `src/data/attributeMatrix/` · gerador/aplicador: `scripts/attribute-matrix/` · testes: `scratch/test-attr-matrix-8a.ts`, `scratch/test-attr-matrix-validator-8a.ts`, `scratch/test-stock-conversion-8a.ts`.

Regenerar os documentos: `npx tsx scripts/attribute-matrix/generate.ts`.
