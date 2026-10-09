# 07 — Análise das regras de atributos (Fases 8B/8C.1, matriz v2)

> Decisões de política e limitações conhecidas. Nada aqui foi aplicado em produção.

## 1. Política de atributos obrigatórios

**Estado real da matriz v2** (292 subcategorias, atributos efetivos, herança incluída):

| Especificações obrigatórias por subcategoria | Subcategorias |
|---|---|
| 0 | 57 |
| 1 | 214 |
| 2 | 20 |
| 3 | 1 |

Eixos de variante obrigatórios: no máximo 2 por subcategoria (Cor e Tamanho/Capacidade). Média de 3,66 atributos efetivos por subcategoria; máximo de 8 especificações.

**Regras de política (validadas por código a cada geração da matriz):**

1. No máximo **3** especificações obrigatórias e **2** eixos obrigatórios por subcategoria.
2. Só é obrigatório o que o vendedor sabe sem pesquisar e que muda a decisão de compra (quase sempre "Tipo", Armazenamento, Sistema operativo).
3. **Todo select obrigatório oferece uma saída** ("Outro" / "Não se aplica"). Sem isso o vendedor cujo produto não está na lista fica impedido de anunciar. Exceção declarada com `closed: true` em 5 listas fechadas por natureza (nº de portas, faixa de idade, nível de ensino, conservação de carnes e de peixes). Regra do validador: `obrigatorio-sem-saida`.
4. Informação difícil de obter ficou **opcional** na v2: Memória RAM de smartphones, Disciplina e Área de livros escolares/universitários.

**O limite deve ser imposto no serviço administrativo?** Recomendação: **não como bloqueio**.

- Hoje a produção tem 0 definições, então impor o limite não quebraria nada existente — mas o serviço é usado por administradores para configurar categorias legítimas que podem precisar de mais campos obrigatórios (ex.: bens regulados). Um bloqueio global trocaria uma política de governança por uma restrição técnica.
- Alternativa proposta (não implementada, sem migração): o painel admin exibir um **aviso não bloqueante** quando uma categoria passar de 3 obrigatórias ("muitos campos obrigatórios reduzem anúncios"). Pode entrar numa fase de UX.
- Enquanto isso, o limite é garantido para a matriz oficial pelo validador (22 + 23 testes) e pelo carregador, que se recusa a aplicar uma matriz com erros.

## 2. Origem dos atributos (`source`)

- A carga grava `source='seed'`; o painel grava `admin`. O valor é decidido **no servidor**: `createAttribute(db, categoryId, raw, opts)`; as rotas HTTP não passam `opts`, e `raw.source` é ignorado.
- Provado por teste HTTP (12/12): `source` no corpo de POST/PATCH/desativação (inclusive `Source`, `SOURCE`, `origin`) não altera a origem; valor desconhecido em `opts` cai em `admin`; o CHECK do banco só aceita `admin|seed`.
- Editar um atributo da carga pelo painel mantém `source='seed'` e preenche `admin_modified_at`. O carregador usa isso para **detectar deriva** e para **nunca reverter** uma linha editada.
- Sem migração: o CHECK `category_attributes_source_check` já aceitava `seed` desde a Fase 1.

## 3. Opções contendo vírgula

**O que o modelo representa hoje:**

| Camada | Comporta vírgula na opção? |
|---|---|
| Definição (`category_attributes.options_json`, array JSON) | Sim, tecnicamente |
| Valor tipado (`product_attribute_values.option_value`, **uma linha por opção**) | Sim |
| Validação de entrada de multisseleção quando chega como **texto** ("A, B") | **Não**: o texto é separado por vírgula |
| Espelho legado `product_attributes.value` (opções unidas por ", ") | **Não** |
| Cálculo de "opções em uso" (`usedOptions`) e exibição | **Não**: separam por vírgula |

Por isso a regra da definição proíbe vírgula (`validateOptionList`). A matriz v2 tem **0** opções com vírgula (teste D5); ela escreve "1,5 m" como "1.5 m" ou "1 a 2 m".

**Solução estruturada compatível com os registros existentes (proposta, não implementada):**

1. Tratar **arrays como formato canônico** e aceitar texto separado por vírgula só para linhas legadas.
2. `usedOptions` ler apenas `product_attribute_values.option_value` para linhas tipadas (e separar texto só nas linhas legadas).
3. Espelho legado gravar um separador que não ocorra nas opções (ex.: ` | `) ou JSON, mantendo leitura do formato antigo.
4. Só então relaxar `validateOptionList` (em `select`, que nunca é separado, antes de `multiselect`).

Requer 4 alterações com testes de ida e volta; **não é necessária para a carga** e não deve ser feita no mesmo passo. Registros existentes (0 em produção) não são afetados.

## 4. Exibir na ficha × filtrar × eixo de variante

| Conceito | Onde é definido | O que significa | Observação |
|---|---|---|---|
| **Exibir na ficha técnica** | `role='spec'` + `display_group` | O valor aparece na ficha pública do produto, com o nome amigável e a unidade, agrupado | Todo atributo de especificação com valor aparece; **não existe flag própria de visibilidade** — esconder = desativar (override inativo) ou deixar sem valor |
| **Permitir filtro** | `is_filterable` | O atributo pode virar filtro de busca (select, multiselect, number, boolean). Texto livre nunca filtra | Na v2: 696 de 806 definições são filtráveis; 0 texto filtrável |
| **Eixo de variante** | `role='variant_axis'` | O valor **muda entre variações** do mesmo anúncio (cor, tamanho, capacidade) e compõe a identidade da variação (`variant_key`) | Não aparece no formulário geral; o assistente suporta 2 dimensões variáveis (Cor × Tamanho|Capacidade); outros eixos valem um valor por anúncio |

Não foi adicionada coluna de visibilidade: a necessidade não foi demonstrada (desativar por override já cobre "não se aplica aqui").

## 5. "Outro" no formulário do vendedor (atualizado na Fase 8C.1)

Ao escolher "Outro/Outra/Outros/Outras" num select, o formulário mostra o campo obrigatório **"Especifique sua opção"** e a ficha pública exibe a especificação ("Material: Fibra de bambu"). A especificação fica no próprio atributo (segunda linha em `value_text`), sem alterar o esquema. Regras, armazenamento, compatibilidade com valores antigos e testes: `12-other-option-structured.md`. Em atributos opcionais a regra é a mesma ("Outro" sem dizer o quê não informa nada); "Não se aplica" não exige especificação.

## 6. Limitações conhecidas

1. Assistente: no máximo duas dimensões que variam (Cor × Tamanho|Capacidade). Subcategorias que gostariam de uma 3ª (ex.: Tamanho **e** Capacidade) estão em `05-variant-axes.md`; os demais eixos valem um valor por anúncio.
2. A especificação de "Outro" tem 2 a 80 caracteres e fica fora dos filtros (o filtro enxerga só a opção "Outro").
3. Vírgula em opções não é suportada (ver §3).
4. Não há flag de visibilidade por atributo (ver §4).
5. Regulados (73 subcategorias) só com relatório de revisão, sem bloqueio (`08-regulatory-review.md`).
6. Comissão não configurada em produção (`09-commissions.md`): a primeira venda seria bloqueada.
7. Reverter a migração 0037 fica bloqueado enquanto existir qualquer `variant_key` preenchida (Fase 7).
8. O carregador só escreve em PostgreSQL **local**; a escrita remota está desligada no código.
9. Nomes de categoria repetidos em ramos diferentes foram apenas relatados (`06-conflicts-and-gaps.md`).
