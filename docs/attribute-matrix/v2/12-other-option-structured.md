# 12 — Opção "Outro" com especificação estruturada (Fase 8C.1)

> Implementado localmente e testado em PostgreSQL 17 descartável. **Sem migração, sem alteração de esquema.** Não publicado.

## Problema
A matriz v2 deu a 137 selects obrigatórios a saída "Outro". Mas "Outro" sozinho não informa nada ao comprador, e a Fase 8B só mostrava uma dica ao vendedor, sem coletar a especificação.

## Solução
Quando o vendedor escolhe **Outro / Outra / Outros / Outras**, o formulário mostra o campo **"Especifique sua opção"** (obrigatório, até 80 caracteres). A ficha pública mostra a especificação:

> Material: **Fibra de bambu** (e não "Material: Outro")

### Armazenamento (sem mudar o esquema)
| Dado | Onde fica |
|---|---|
| A opção (`Outro`) | `product_attribute_values.option_value` — continua sendo o valor tipado do select: filtros, "opções em uso" e a lista da definição seguem corretos |
| A especificação (`Fibra de bambu`) | **segunda linha do mesmo atributo**, em `value_text` (com `option_value` nulo) |

Por que cabe no modelo atual (confirmado também em produção, somente leitura): o índice único `(product_id, attribute_id, COALESCE(option_value,''))` permite uma linha de opção **e** uma linha de texto para o mesmo atributo, e o CHECK `num_nonnulls(value_text, value_number, value_bool, option_value) = 1` continua satisfeito em cada linha. O banco impede uma 2ª especificação. Alternativas descartadas: gravar "Outro: texto" em `option_value` (quebraria filtros e a verificação de opções em uso), ou na descrição do produto (a especificação se perderia do atributo).

### Formato de transporte
`"Outro: Fibra de bambu"` — texto simples, compatível com o payload `specs`, com `attributeUpdates` da edição e com o espelho legado. O servidor separa opção e especificação; na leitura devolve o valor composto, para que a edição reenvie sem perda.

## Regras
1. A família "Outro/Outra/Outros/Outras" **exige especificação**, em atributo **obrigatório ou opcional** ("Outro" sem dizer o quê não informa nada). "Não se aplica" não exige.
2. Especificação: 2 a 80 caracteres, com letra ou número; espaços e caracteres de controle são normalizados; não pode repetir só "outro".
3. Valores históricos "Outro" **sem** especificação continuam válidos enquanto **não forem alterados**: editar outro atributo do produto não falha e o valor é preservado; o formulário só passa a exigir se a pessoa mexer naquele campo.
4. Eixos de variante **nunca** usam o formato composto ("Outra: Verde" é recusado); a opção "Outra" de um eixo é uma opção comum. A especificação não entra na `variant_key`, portanto não cria combinações inválidas.
5. Trocar "Outro: X" por uma opção normal remove a linha de especificação (sem sobras); reenviar o mesmo valor não duplica linhas.
6. Vale para atributos **herdados** da categoria-mãe e **definidos na própria subcategoria**.

## Auditoria e legado
- A auditoria de edição registra antes/depois legíveis (`Vidro temperado` → `Metal`).
- O espelho legado (`products.attributes_json` e `product_attributes`) grava o texto da especificação (o que o comprador vê).

## Apresentação
O valor é exibido com quebra de linha segura (`break-words`, `overflow-wrap:anywhere`), para 80 caracteres em telas estreitas.

## Testes
`scratch/test-attr-other-8c1.ts`: **46/46** (validação pura; recusas no servidor para 10 formas inválidas; criação com atributo herdado e próprio; edição, idempotência e auditoria; compatibilidade com valor antigo; integridade do banco; variantes; formulário do cliente; os 137 selects da matriz v2 real). Mais: `test-attr-matrix-v2-8b` (23/23) com o campo complementar em 210 subcategorias.
