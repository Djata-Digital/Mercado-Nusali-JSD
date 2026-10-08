# 09 — Plano de execução futura em produção (NÃO executado)

> Só será executado com autorização explícita do dono, em fase própria (8B). Esta fase **não** escreve em produção.

## 0. Pré-requisitos (bloqueiam o início)

1. Autorização escrita da Fase 8B, com a versão exata da matriz (`v1-2026-10-08`) e o SHA do commit.
2. Decisão do dono sobre a correção de estoque (documento 08) — recomendado aplicá-la **antes** de cadastrar vendedores reais, mas ela é independente da matriz.
3. Decisão sobre os itens abertos (seção 8): origem `source` dos atributos criados, categorias reguladas, comissão.
4. Nenhuma migração é necessária para a matriz (usa `category_attributes` já existente). Confirmar `schema = 0034/0037 aplicado` (38 migrações) por leitura.

## 1. Backup e ponto de retorno

- Backup lógico antes (`pg_dump` das tabelas `category_attributes`, `categories`, `product_attribute_values`) + snapshot do projeto Supabase.
- Registrar contagens de base: 322 categorias, 0 definições, 0 valores, 0 produtos (confirmar no momento: se houver produtos, reavaliar).
- Manter `PRODUCT_ATTRIBUTES_STRICT` desligado durante a carga.

## 2. Dry-run em produção (somente leitura)

O motor `applyOperations(…, { dryRun: true })` (já pronto e testado em C1) — com um **executável fino a criar na 8B**, que não existe hoje — contra a produção em transação `READ ONLY`: relê as categorias, **compara id/slug/parentId com o inventário da matriz** (aborta se qualquer categoria divergir, aparecer ou sumir), planeja as 847 operações e confirma 0 existentes. Saída revisada pelo dono antes de continuar.

## 3. Aplicação (idempotente, em lotes)

- Lotes de 100 operações, ordem determinística (principal → filha; override depois do alvo), **uma transação por operação** pelo serviço real (`createAttribute` com id `attr_nsl_<slug>_<code>`; desativação por override inativo).
- **Idempotência:** operação cujo id já existe com a mesma definição é *pulada*; com definição diferente é *deriva* — relatada, **nunca sobrescrita**.
- **Validação após cada lote:** contagem no banco = acumulado esperado; 0 erros; 0 deriva. Falhou → para.
- **Auditoria:** o motor devolve por lote contagens e a lista de deriva/erros; o executável da 8B deve gravar esse relatório JSON (ids e hash da definição) e usar os registros de criação do serviço (data de criação das linhas).
- **Retomada segura:** reexecutar continua do ponto de parada (testado: parada em 333, retomada nas 514 restantes).

## 4. Validação pós-carga (leitura)

1. 806 definições + 7 overrides + 34 desativações = 847 linhas esperadas.
2. Para as 322 categorias, `resolveEffectiveAttributes` = efetivos previstos (mesma comparação do teste D1).
3. Amostra de herança: Vestidos (herda cor/tamanho/material), Roupas tradicionais (override de material), Calçados (eixo "Numeração").
4. Canário de leitura (`attrcanary2`) e abertura do assistente de cadastro em 3 subcategorias — **sem criar produto**.

## 5. Reversão

- Antes do primeiro produto: `rollbackOperations` remove na ordem inversa (overrides antes dos alvos). Comprovado (E3).
- Depois de haver produtos: a reversão **para** no primeiro atributo em uso (G3). Correções passam a ser aditivas (nova versão da matriz), não destrutivas.
- Obs. (Fase 7): reverter a migração 0037 fica bloqueado enquanto houver `variant_key` preenchida.

## 6. Cronograma sugerido

8B-1 revisão/ajuste da matriz pelo dono → 8B-2 dry-run em produção → 8B-3 carga em lotes + validação → 8B-4 (opcional) correção de estoque e deploy → 8B-5 teste com **um** vendedor real, fora do escopo de dados fictícios.

## 7. Critérios de parada

Qualquer divergência de categoria · contagem diferente após um lote · deriva · erro de serviço · produto inesperado em produção. Parar, relatar, aguardar.

## 8. Itens abertos para decisão do dono

1. **Comissão:** nada configurado (categoria, vendedor nem padrão da plataforma). A primeira venda seria bloqueada com `COMMISSION_NOT_CONFIGURED`. Definir antes do lançamento.
2. **Limite "máx. 3 obrigatórios"** é garantido só pelo validador da matriz, não pelo serviço.
3. `createAttribute` força `source='admin'`; a Fase 8B pode precisar de uma opção `source='matrix'` para distinguir atributos de carga dos criados à mão.
4. Opções não podem conter vírgula (limite do formato multisseleção).
5. Não existe flag de visibilidade por atributo no esquema (apenas `is_filterable`); "visibilidade" da matriz = filtrável/ficha.
6. Categorias reguladas (Drones, Rádios) têm só nota de advertência, sem bloqueio.
7. Nomes de categoria repetidos em ramos distintos (relatados em `06-conflicts-and-gaps.md`, **não alterados**).
8. 3ª dimensão de variante (ver `05-variant-axes.md`): o assistente suporta Cor × (Tamanho | Capacidade); demais eixos valem um valor por anúncio. Suporte novo exige fase própria.
