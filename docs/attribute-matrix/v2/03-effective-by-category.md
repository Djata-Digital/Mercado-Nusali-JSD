# 03 — Atributos EFETIVOS por categoria (o que o vendedor realmente vê)

> Matriz de atributos **v2-2026-10-08** — proposta para revisão (Fases 8A/8B). **Nada foi aplicado em produção.**
> Gerado por `scripts/attribute-matrix/generate.ts` a partir de `src/data/attributeMatrix/`.

## Agricultura e Pecuária  `agricultura-e-pecuaria`

### Agricultura e Pecuária (categoria principal — sem produtos próprios)  `agricultura-e-pecuaria`

_sem atributos_

### ↳ Armazenamento agrícola  `agricultura-e-pecuaria-armazenamento-agricola`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_armazenamento` | Tipo | seleção | sim |  | próprio |
| spec | `capacidade_kg` | Capacidade | número |  | kg | próprio |

### ↳ Equipamentos de pecuária  `agricultura-e-pecuaria-equipamentos-de-pecuaria`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_pecuaria` | Tipo | seleção | sim |  | próprio |
| spec | `animal_destino` | Animal | seleção |  |  | próprio |

### ↳ Equipamentos para pesca  `agricultura-e-pecuaria-equipamentos-para-pesca`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_pesca` | Tipo | seleção | sim |  | próprio |
| spec | `medida_pesca` | Medida/Malha | texto |  |  | próprio |

### ↳ Ferramentas agrícolas  `agricultura-e-pecuaria-ferramentas-agricolas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_ferramenta_agricola` | Tipo | seleção | sim |  | próprio |
| spec | `material_cabo` | Material do cabo | seleção |  |  | próprio |

### ↳ Fertilizantes  `agricultura-e-pecuaria-fertilizantes`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `tamanho` | Embalagem | seleção | sim |  | próprio |
| spec | `tipo_fertilizante` | Tipo | seleção | sim |  | próprio |
| spec | `composicao_npk` | Composição (ex.: NPK 15-15-15) | texto |  |  | próprio |

### ↳ Irrigação  `agricultura-e-pecuaria-irrigacao`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_irrigacao` | Tipo | seleção | sim |  | próprio |
| spec | `vazao_lh` | Caudal | número |  | L/h | próprio |
| spec | `alimentacao` | Alimentação | seleção |  |  | próprio |

### ↳ Máquinas agrícolas  `agricultura-e-pecuaria-maquinas-agricolas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_maquina_agricola` | Tipo | seleção | sim |  | próprio |
| spec | `combustivel` | Alimentação | seleção |  |  | próprio |
| spec | `potencia_cv` | Potência | número |  | cv | próprio |

### ↳ Produtos para horticultura  `agricultura-e-pecuaria-produtos-para-horticultura`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_horticultura` | Tipo | seleção | sim |  | próprio |
| eixo | `tamanho` | Embalagem | seleção |  |  | próprio |

### ↳ Rações animais  `agricultura-e-pecuaria-racoes-animais`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `tamanho` | Embalagem | seleção | sim |  | próprio |
| spec | `animal_destino` | Animal | seleção | sim |  | próprio |
| spec | `fase_animal` | Fase | seleção |  |  | próprio |

### ↳ Sementes  `agricultura-e-pecuaria-sementes`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `cultura` | Cultura | seleção | sim |  | próprio |
| eixo | `tamanho` | Embalagem | seleção | sim |  | próprio |
| spec | `variedade` | Variedade | texto |  |  | próprio |
| spec | `ciclo_dias` | Ciclo até à colheita | número |  | dias | próprio |

## Alimentos Frescos e Bebidas  `alimentos-frescos-e-bebidas`

### Alimentos Frescos e Bebidas (categoria principal — sem produtos próprios)  `alimentos-frescos-e-bebidas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `unidade_venda` | Vendido por | seleção |  |  | próprio |
| spec | `origem_produto` | Origem | seleção |  |  | próprio |

### ↳ Água mineral  `alimentos-frescos-e-bebidas-agua-mineral`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `capacidade` | Volume | seleção | sim |  | próprio |
| spec | `tipo_agua` | Tipo | seleção |  |  | próprio |
| spec | `pack` | Embalagem de venda | seleção |  |  | próprio |

### ↳ Bebidas não alcoólicas  `alimentos-frescos-e-bebidas-bebidas-nao-alcoolicas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `capacidade` | Volume | seleção | sim |  | próprio |
| spec | `tipo_bebida` | Tipo | seleção | sim |  | próprio |

### ↳ Carnes  `alimentos-frescos-e-bebidas-carnes`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_carne` | Carne | seleção | sim |  | próprio |
| spec | `estado_conservacao` | Conservação | seleção | sim |  | próprio |
| spec | `unidade_venda` | Vendido por | seleção |  |  | herdado de `alimentos-frescos-e-bebidas` |
| spec | `origem_produto` | Origem | seleção |  |  | herdado de `alimentos-frescos-e-bebidas` |

### ↳ Frutas  `alimentos-frescos-e-bebidas-frutas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_fruta` | Fruta | texto | sim |  | próprio |
| spec | `unidade_venda` | Vendido por | seleção |  |  | herdado de `alimentos-frescos-e-bebidas` |
| spec | `maturacao` | Maturação | seleção |  |  | próprio |
| spec | `origem_produto` | Origem | seleção |  |  | herdado de `alimentos-frescos-e-bebidas` |
| spec | `organico` | Sem agrotóxicos (orgânico) | sim/não |  |  | próprio |

### ↳ Legumes e verduras  `alimentos-frescos-e-bebidas-legumes-e-verduras`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_legume` | Produto | texto | sim |  | próprio |
| spec | `unidade_venda` | Vendido por | seleção |  |  | herdado de `alimentos-frescos-e-bebidas` |
| spec | `origem_produto` | Origem | seleção |  |  | herdado de `alimentos-frescos-e-bebidas` |
| spec | `organico` | Sem agrotóxicos (orgânico) | sim/não |  |  | próprio |

### ↳ Ovos  `alimentos-frescos-e-bebidas-ovos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tamanho_ovo` | Tamanho | seleção |  |  | próprio |
| spec | `unidade_venda` | Vendido por | seleção |  |  | herdado de `alimentos-frescos-e-bebidas` |
| spec | `origem_produto` | Origem | seleção |  |  | herdado de `alimentos-frescos-e-bebidas` |
| spec | `quantidade_ovos` | Quantidade | seleção |  |  | próprio |

### ↳ Peixes e mariscos  `alimentos-frescos-e-bebidas-peixes-e-mariscos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_peixe` | Peixe/Marisco | texto | sim |  | próprio |
| spec | `estado_conservacao` | Conservação | seleção | sim |  | próprio |
| spec | `unidade_venda` | Vendido por | seleção |  |  | herdado de `alimentos-frescos-e-bebidas` |
| spec | `origem_produto` | Origem | seleção |  |  | herdado de `alimentos-frescos-e-bebidas` |

### ↳ Produtos alimentares locais  `alimentos-frescos-e-bebidas-produtos-alimentares-locais`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `produto_local` | Produto | texto | sim |  | próprio |
| spec | `unidade_venda` | Vendido por | seleção |  |  | herdado de `alimentos-frescos-e-bebidas` |
| eixo | `tamanho` | Embalagem | seleção |  |  | próprio |
| spec | `origem_produto` | Origem | seleção |  |  | herdado de `alimentos-frescos-e-bebidas` |
| spec | `artesanal` | Produção artesanal/local | sim/não |  |  | próprio |

### ↳ Produtos congelados  `alimentos-frescos-e-bebidas-produtos-congelados`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_congelado` | Tipo | seleção | sim |  | próprio |
| spec | `unidade_venda` | Vendido por | seleção |  |  | herdado de `alimentos-frescos-e-bebidas` |
| spec | `origem_produto` | Origem | seleção |  |  | herdado de `alimentos-frescos-e-bebidas` |

### ↳ Sumos e refrigerantes  `alimentos-frescos-e-bebidas-sumos-e-refrigerantes`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `capacidade` | Volume | seleção | sim |  | próprio |
| spec | `tipo_sumo` | Tipo | seleção | sim |  | próprio |
| spec | `pack` | Embalagem de venda | seleção |  |  | próprio |

### ↳ Tubérculos  `alimentos-frescos-e-bebidas-tuberculos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_tuberculo` | Produto | seleção | sim |  | próprio |
| spec | `unidade_venda` | Vendido por | seleção |  |  | herdado de `alimentos-frescos-e-bebidas` |
| spec | `origem_produto` | Origem | seleção |  |  | herdado de `alimentos-frescos-e-bebidas` |

## Automóveis, Motos e Peças  `automoveis-motos-e-pecas`

### Automóveis, Motos e Peças (categoria principal — sem produtos próprios)  `automoveis-motos-e-pecas`

_sem atributos_

### ↳ Acessórios automotivos  `automoveis-motos-e-pecas-acessorios-automotivos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_acessorio` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `compativel_veiculos` | Compatível com | texto |  |  | próprio |

### ↳ Baterias automotivas  `automoveis-motos-e-pecas-baterias-automotivas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `capacidade` | Capacidade | seleção | sim |  | próprio |
| spec | `tensao_bateria` | Tensão | seleção | sim |  | próprio |
| spec | `tipo_bateria_auto` | Tipo | seleção |  |  | próprio |

### ↳ Capacetes  `automoveis-motos-e-pecas-capacetes`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `tamanho` | Tamanho | seleção | sim |  | próprio |
| spec | `tipo_capacete` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `viseira` | Com viseira | sim/não |  |  | próprio |

### ↳ Ferramentas automotivas  `automoveis-motos-e-pecas-ferramentas-automotivas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_ferramenta_auto` | Tipo | seleção | sim |  | próprio |

### ↳ Óleos e lubrificantes  `automoveis-motos-e-pecas-oleos-e-lubrificantes`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `capacidade` | Volume | seleção | sim |  | próprio |
| spec | `tipo_oleo` | Tipo | seleção | sim |  | próprio |
| spec | `viscosidade` | Viscosidade | seleção |  |  | próprio |
| spec | `base_oleo` | Base | seleção |  |  | próprio |

### ↳ Peças de automóveis  `automoveis-motos-e-pecas-pecas-de-automoveis`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_peca_auto` | Tipo de peça | seleção | sim |  | próprio |
| spec | `compativel_veiculos` | Compatível com (marca/modelo/ano) | texto | sim |  | próprio |
| spec | `tipo_origem_peca` | Origem | seleção |  |  | próprio |

### ↳ Peças de motocicletas  `automoveis-motos-e-pecas-pecas-de-motocicletas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_peca_moto` | Tipo de peça | seleção | sim |  | próprio |
| spec | `compativel_veiculos` | Compatível com (marca/modelo/cilindrada) | texto | sim |  | próprio |
| spec | `tipo_origem_peca` | Origem | seleção |  |  | próprio |

### ↳ Pneus  `automoveis-motos-e-pecas-pneus`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `medida_pneu` | Medida | seleção | sim |  | próprio |
| spec | `tipo_veiculo_pneu` | Para | seleção | sim |  | próprio |
| spec | `estado_pneu` | Estado | seleção |  |  | próprio |

### ↳ Produtos de limpeza automotiva  `automoveis-motos-e-pecas-produtos-de-limpeza-automotiva`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_limpeza_auto` | Tipo | seleção | sim |  | próprio |
| eixo | `capacidade` | Volume | seleção |  |  | próprio |

### ↳ Som automotivo  `automoveis-motos-e-pecas-som-automotivo`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_som_auto` | Tipo | seleção | sim |  | próprio |
| spec | `potencia_rms_w` | Potência (RMS) | número |  | W | próprio |
| spec | `ligacoes` | Ligações | múltipla |  |  | próprio |

## Bebês e Crianças  `bebes-e-criancas`

### Bebês e Crianças (categoria principal — sem produtos próprios)  `bebes-e-criancas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `faixa_idade` | Idade recomendada | seleção |  |  | próprio |

### ↳ Acessórios para maternidade  `bebes-e-criancas-acessorios-para-maternidade`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_maternidade` | Tipo | seleção | sim |  | próprio |

### ↳ Alimentação infantil  `bebes-e-criancas-alimentacao-infantil`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_alimento_infantil` | Tipo | seleção | sim |  | próprio |
| eixo | `tamanho` | Embalagem | seleção |  |  | próprio |
| spec | `fase_leite` | Fase | seleção |  |  | próprio |

### ↳ Berços  `bebes-e-criancas-bercos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_berco` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `faixa_idade` | Idade recomendada | seleção |  |  | herdado de `bebes-e-criancas` |
| spec | `colchao_incluido` | Colchão incluído | sim/não |  |  | próprio |

### ↳ Cadeiras infantis  `bebes-e-criancas-cadeiras-infantis`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_cadeira` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `faixa_idade` | Idade recomendada | seleção |  |  | herdado de `bebes-e-criancas` |
| spec | `faixa_peso` | Indicada para crianças de | seleção |  |  | próprio |

### ↳ Carrinhos de bebê  `bebes-e-criancas-carrinhos-de-bebe`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_carrinho` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `faixa_idade` | Idade recomendada | seleção |  |  | herdado de `bebes-e-criancas` |
| spec | `faixa_peso` | Suporta crianças até | seleção |  |  | próprio |
| spec | `dobravel` | Dobrável | sim/não |  |  | próprio |

### ↳ Fraldas  `bebes-e-criancas-fraldas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `tamanho` | Tamanho da fralda | seleção | sim |  | próprio |
| spec | `tipo_fralda` | Tipo | seleção | sim |  | próprio |
| spec | `unidades_pacote` | Unidades por pacote | número |  |  | próprio |

### ↳ Mamadeiras  `bebes-e-criancas-mamadeiras`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `capacidade` | Capacidade | seleção | sim |  | próprio |
| spec | `faixa_idade` | Idade recomendada | seleção |  |  | herdado de `bebes-e-criancas` |
| spec | `material` | Material | seleção |  |  | próprio |
| spec | `tipo_bico` | Bico | seleção |  |  | próprio |

### ↳ Produtos de higiene infantil  `bebes-e-criancas-produtos-de-higiene-infantil`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_higiene_infantil` | Tipo | seleção | sim |  | próprio |
| spec | `faixa_idade` | Idade recomendada | seleção |  |  | herdado de `bebes-e-criancas` |
| eixo | `capacidade` | Volume / quantidade | seleção |  |  | próprio |

### ↳ Roupas para bebês  `bebes-e-criancas-roupas-para-bebes`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | próprio |
| eixo | `tamanho` | Tamanho | seleção | sim |  | próprio |
| spec | `material` | Material | seleção |  |  | próprio |
| spec | `tipo_roupa_bebe` | Tipo | seleção |  |  | próprio |

### ↳ Segurança infantil  `bebes-e-criancas-seguranca-infantil`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_seguranca_infantil` | Tipo | seleção | sim |  | próprio |
| spec | `faixa_idade` | Idade recomendada | seleção |  |  | herdado de `bebes-e-criancas` |

## Beleza e Cuidados Pessoais  `beleza-e-cuidados-pessoais`

### Beleza e Cuidados Pessoais (categoria principal — sem produtos próprios)  `beleza-e-cuidados-pessoais`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `publico_alvo` | Público | seleção |  |  | próprio |
| spec | `validade_info` | Validade (se aplicável) | texto |  |  | próprio |

### ↳ Barbearia  `beleza-e-cuidados-pessoais-barbearia`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_barbearia` | Tipo | seleção | sim |  | próprio |
| spec | `publico_alvo` | Público | seleção |  |  | herdado de `beleza-e-cuidados-pessoais` |
| spec | `alimentacao` | Alimentação | seleção |  |  | próprio |
| spec | `validade_info` | Validade (se aplicável) | texto |  |  | herdado de `beleza-e-cuidados-pessoais` |

### ↳ Cabelos e extensões  `beleza-e-cuidados-pessoais-cabelos-e-extensoes`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor do cabelo | seleção | sim |  | próprio |
| eixo | `tamanho` | Comprimento | seleção | sim |  | próprio |
| spec | `tipo_cabelo_ext` | Tipo | seleção | sim |  | próprio |
| spec | `publico_alvo` | Público | seleção |  |  | herdado de `beleza-e-cuidados-pessoais` |
| spec | `validade_info` | Validade (se aplicável) | texto |  |  | herdado de `beleza-e-cuidados-pessoais` |
| spec | `textura` | Textura | seleção |  |  | próprio |
| spec | `quantidade_cabelo_g` | Quantidade de cabelo | número |  | g | próprio |

### ↳ Cuidados com a pele  `beleza-e-cuidados-pessoais-cuidados-com-a-pele`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_cuidado` | Tipo | seleção | sim |  | próprio |
| spec | `publico_alvo` | Público | seleção |  |  | herdado de `beleza-e-cuidados-pessoais` |
| eixo | `capacidade` | Volume | seleção |  |  | próprio |
| spec | `validade_info` | Validade (se aplicável) | texto |  |  | herdado de `beleza-e-cuidados-pessoais` |
| spec | `tipo_pele` | Tipo de pele | múltipla |  |  | próprio |

### ↳ Equipamentos de salão  `beleza-e-cuidados-pessoais-equipamentos-de-salao`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_equipamento` | Tipo | seleção | sim |  | próprio |
| spec | `potencia_w` | Potência | número |  | W | próprio |

### ↳ Higiene pessoal  `beleza-e-cuidados-pessoais-higiene-pessoal`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_higiene` | Tipo | seleção | sim |  | próprio |
| spec | `publico_alvo` | Público | seleção |  |  | herdado de `beleza-e-cuidados-pessoais` |
| eixo | `capacidade` | Volume / quantidade | seleção |  |  | próprio |
| spec | `validade_info` | Validade (se aplicável) | texto |  |  | herdado de `beleza-e-cuidados-pessoais` |

### ↳ Manicure e pedicure  `beleza-e-cuidados-pessoais-manicure-e-pedicure`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_unhas` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor do esmalte | seleção |  |  | próprio |
| spec | `publico_alvo` | Público | seleção |  |  | herdado de `beleza-e-cuidados-pessoais` |
| spec | `validade_info` | Validade (se aplicável) | texto |  |  | herdado de `beleza-e-cuidados-pessoais` |

### ↳ Maquiagem  `beleza-e-cuidados-pessoais-maquiagem`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_maquiagem` | Tipo | seleção | sim |  | próprio |
| spec | `publico_alvo` | Público | seleção |  |  | herdado de `beleza-e-cuidados-pessoais` |
| eixo | `cor` | Tom / Cor | seleção |  |  | próprio |
| spec | `validade_info` | Validade (se aplicável) | texto |  |  | herdado de `beleza-e-cuidados-pessoais` |

### ↳ Perfumes  `beleza-e-cuidados-pessoais-perfumes`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `capacidade` | Volume | seleção | sim |  | próprio |
| spec | `publico_alvo` | Público | seleção |  |  | herdado de `beleza-e-cuidados-pessoais` |
| spec | `tipo_perfume` | Concentração | seleção |  |  | próprio |
| spec | `validade_info` | Validade (se aplicável) | texto |  |  | herdado de `beleza-e-cuidados-pessoais` |
| spec | `familia_olfativa` | Família olfativa | seleção |  |  | próprio |

### ↳ Perucas  `beleza-e-cuidados-pessoais-perucas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | próprio |
| spec | `tipo_cabelo_ext` | Tipo | seleção | sim |  | próprio |
| spec | `publico_alvo` | Público | seleção |  |  | herdado de `beleza-e-cuidados-pessoais` |
| eixo | `tamanho` | Comprimento | seleção |  |  | próprio |
| spec | `validade_info` | Validade (se aplicável) | texto |  |  | herdado de `beleza-e-cuidados-pessoais` |
| spec | `textura` | Textura | seleção |  |  | próprio |
| spec | `tipo_touca` | Touca | seleção |  |  | próprio |

### ↳ Produtos capilares  `beleza-e-cuidados-pessoais-produtos-capilares`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_capilar` | Tipo | seleção | sim |  | próprio |
| spec | `publico_alvo` | Público | seleção |  |  | herdado de `beleza-e-cuidados-pessoais` |
| eixo | `capacidade` | Volume | seleção |  |  | próprio |
| spec | `validade_info` | Validade (se aplicável) | texto |  |  | herdado de `beleza-e-cuidados-pessoais` |
| spec | `tipo_cabelo` | Tipo de cabelo | múltipla |  |  | próprio |

## Bolsas, Malas e Acessórios  `bolsas-malas-e-acessorios`

### Bolsas, Malas e Acessórios (categoria principal — sem produtos próprios)  `bolsas-malas-e-acessorios`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | próprio |
| spec | `material` | Material | seleção |  |  | próprio |

### ↳ Acessórios de cabelo  `bolsas-malas-e-acessorios-acessorios-de-cabelo`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `bolsas-malas-e-acessorios` |
| spec | `tipo_acessorio_cabelo` | Tipo | seleção |  |  | próprio |

### ↳ Bolsas femininas  `bolsas-malas-e-acessorios-bolsas-femininas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `bolsas-malas-e-acessorios` |
| spec | `tipo_bolsa` | Tipo | seleção |  |  | próprio |
| spec | `material` | Material | seleção |  |  | herdado de `bolsas-malas-e-acessorios` |

### ↳ Bonés e chapéus  `bolsas-malas-e-acessorios-bones-e-chapeus`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `bolsas-malas-e-acessorios` |
| eixo | `tamanho` | Tamanho | seleção |  |  | próprio |
| spec | `material` | Material | seleção |  |  | herdado de `bolsas-malas-e-acessorios` |
| spec | `tipo_chapeu` | Tipo | seleção |  |  | próprio |

### ↳ Carteiras  `bolsas-malas-e-acessorios-carteiras`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `bolsas-malas-e-acessorios` |
| spec | `tipo_carteira` | Tipo | seleção |  |  | próprio |
| spec | `material` | Material | seleção |  |  | herdado de `bolsas-malas-e-acessorios` |

### ↳ Cintos  `bolsas-malas-e-acessorios-cintos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `bolsas-malas-e-acessorios` |
| eixo | `tamanho` | Tamanho | seleção |  |  | próprio |
| spec | `material` | Material | seleção |  |  | herdado de `bolsas-malas-e-acessorios` |
| spec | `tipo_cinto` | Tipo | seleção |  |  | próprio |

### ↳ Joias e bijuterias  `bolsas-malas-e-acessorios-joias-e-bijuterias`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `bolsas-malas-e-acessorios` |
| spec | `tipo_joia` | Tipo | seleção | sim |  | próprio |
| spec | `material` | Material | seleção |  |  | substitui o de `bolsas-malas-e-acessorios` |

### ↳ Malas de viagem  `bolsas-malas-e-acessorios-malas-de-viagem`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `bolsas-malas-e-acessorios` |
| eixo | `tamanho` | Tamanho | seleção |  |  | próprio |
| spec | `rodas` | Com rodas | sim/não |  |  | próprio |
| spec | `material` | Material | seleção |  |  | herdado de `bolsas-malas-e-acessorios` |
| spec | `cadeado` | Com cadeado | sim/não |  |  | próprio |

### ↳ Mochilas  `bolsas-malas-e-acessorios-mochilas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `bolsas-malas-e-acessorios` |
| spec | `capacidade_litros` | Capacidade | número |  | L | próprio |
| spec | `compartimento_portatil` | Compartimento para portátil | sim/não |  |  | próprio |
| spec | `material` | Material | seleção |  |  | herdado de `bolsas-malas-e-acessorios` |

### ↳ Óculos de sol  `bolsas-malas-e-acessorios-oculos-de-sol`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `bolsas-malas-e-acessorios` |
| spec | `tipo_lente` | Tipo de lente | seleção |  |  | próprio |
| spec | `material` | Material | seleção |  |  | herdado de `bolsas-malas-e-acessorios` |
| spec | `protecao_uv` | Proteção UV | sim/não |  |  | próprio |

### ↳ Relógios  `bolsas-malas-e-acessorios-relogios`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `bolsas-malas-e-acessorios` |
| spec | `tipo_relogio` | Tipo | seleção | sim |  | próprio |
| spec | `material` | Material | seleção |  |  | herdado de `bolsas-malas-e-acessorios` |
| spec | `publico` | Público | seleção |  |  | próprio |
| spec | `resistente_agua` | Resistente à água | sim/não |  |  | próprio |

## Brinquedos e Jogos  `brinquedos-e-jogos`

### Brinquedos e Jogos (categoria principal — sem produtos próprios)  `brinquedos-e-jogos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `faixa_idade` | Idade recomendada | seleção | sim |  | próprio |
| spec | `alimentacao` | Funciona com | seleção |  |  | próprio |

### ↳ Bicicletas infantis  `brinquedos-e-jogos-bicicletas-infantis`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `faixa_idade` | Idade recomendada | seleção | sim |  | herdado de `brinquedos-e-jogos` |
| eixo | `tamanho` | Aro | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `rodinhas` | Com rodinhas de apoio | sim/não |  |  | próprio |

### ↳ Bonecas  `brinquedos-e-jogos-bonecas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `faixa_idade` | Idade recomendada | seleção | sim |  | herdado de `brinquedos-e-jogos` |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| eixo | `tamanho` | Tamanho | seleção |  |  | próprio |

### ↳ Brinquedos de exterior  `brinquedos-e-jogos-brinquedos-de-exterior`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `faixa_idade` | Idade recomendada | seleção | sim |  | herdado de `brinquedos-e-jogos` |
| spec | `tipo_exterior` | Tipo | seleção |  |  | próprio |

### ↳ Brinquedos educativos  `brinquedos-e-jogos-brinquedos-educativos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `faixa_idade` | Idade recomendada | seleção | sim |  | herdado de `brinquedos-e-jogos` |
| spec | `habilidades` | Desenvolve | múltipla |  |  | próprio |

### ↳ Brinquedos eletrônicos  `brinquedos-e-jogos-brinquedos-eletronicos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `faixa_idade` | Idade recomendada | seleção | sim |  | herdado de `brinquedos-e-jogos` |
| spec | `tipo_brinquedo_eletronico` | Tipo | seleção |  |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `alimentacao` | Funciona com | seleção |  |  | herdado de `brinquedos-e-jogos` |

### ↳ Carrinhos de brinquedo  `brinquedos-e-jogos-carrinhos-de-brinquedo`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `faixa_idade` | Idade recomendada | seleção | sim |  | herdado de `brinquedos-e-jogos` |
| spec | `tipo_brinquedo_veiculo` | Tipo | seleção |  |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `alimentacao` | Funciona com | seleção |  |  | herdado de `brinquedos-e-jogos` |

### ↳ Jogos de tabuleiro  `brinquedos-e-jogos-jogos-de-tabuleiro`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `faixa_idade` | Idade recomendada | seleção | sim |  | herdado de `brinquedos-e-jogos` |
| spec | `jogadores_min` | Mínimo de jogadores | número |  |  | próprio |
| spec | `jogadores_max` | Máximo de jogadores | número |  |  | próprio |

### ↳ Jogos tradicionais  `brinquedos-e-jogos-jogos-tradicionais`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `faixa_idade` | Idade recomendada | seleção | sim |  | herdado de `brinquedos-e-jogos` |
| spec | `tipo_jogo_tradicional` | Jogo | seleção | sim |  | próprio |
| spec | `material` | Material | seleção |  |  | próprio |

### ↳ Pelúcias  `brinquedos-e-jogos-pelucias`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `faixa_idade` | Idade recomendada | seleção | sim |  | herdado de `brinquedos-e-jogos` |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| eixo | `tamanho` | Tamanho | seleção |  |  | próprio |

### ↳ Quebra-cabeças  `brinquedos-e-jogos-quebra-cabecas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `faixa_idade` | Idade recomendada | seleção | sim |  | herdado de `brinquedos-e-jogos` |
| spec | `numero_pecas` | Número de peças | número | sim |  | próprio |

## Calçados  `calcados`

### Calçados (categoria principal — sem produtos próprios)  `calcados`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | próprio |
| eixo | `tamanho` | Numeração | seleção | sim |  | próprio |
| spec | `material_cabedal` | Material do cabedal | seleção |  |  | próprio |
| spec | `tipo_solado` | Solado | seleção |  |  | próprio |

### ↳ Acessórios para calçados  `calcados-acessorios-para-calcados`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `calcados` |
| spec | `tipo_acessorio` | Tipo | seleção | sim |  | próprio |

### ↳ Botas  `calcados-botas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `calcados` |
| eixo | `tamanho` | Numeração | seleção | sim |  | herdado de `calcados` |
| spec | `tipo_bota` | Tipo | seleção |  |  | próprio |
| spec | `material_cabedal` | Material do cabedal | seleção |  |  | herdado de `calcados` |
| spec | `tipo_solado` | Solado | seleção |  |  | herdado de `calcados` |

### ↳ Calçados de segurança  `calcados-calcados-de-seguranca`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `calcados` |
| spec | `protecao` | Proteção | múltipla | sim |  | próprio |
| eixo | `tamanho` | Numeração | seleção | sim |  | herdado de `calcados` |
| spec | `material_cabedal` | Material do cabedal | seleção |  |  | herdado de `calcados` |
| spec | `tipo_solado` | Solado | seleção |  |  | herdado de `calcados` |

### ↳ Calçados infantis  `calcados-calcados-infantis`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `calcados` |
| eixo | `tamanho` | Numeração | seleção | sim |  | substitui o de `calcados` |
| spec | `faixa_etaria` | Faixa etária | seleção |  |  | próprio |
| spec | `material_cabedal` | Material do cabedal | seleção |  |  | herdado de `calcados` |
| spec | `tipo_solado` | Solado | seleção |  |  | herdado de `calcados` |

### ↳ Chinelos  `calcados-chinelos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `calcados` |
| eixo | `tamanho` | Numeração | seleção | sim |  | herdado de `calcados` |
| spec | `tipo_chinelo` | Tipo | seleção |  |  | próprio |
| spec | `material_cabedal` | Material do cabedal | seleção |  |  | herdado de `calcados` |
| spec | `tipo_solado` | Solado | seleção |  |  | herdado de `calcados` |

### ↳ Sandálias  `calcados-sandalias`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `calcados` |
| eixo | `tamanho` | Numeração | seleção | sim |  | herdado de `calcados` |
| spec | `tipo_sandalia` | Tipo | seleção |  |  | próprio |
| spec | `material_cabedal` | Material do cabedal | seleção |  |  | herdado de `calcados` |
| spec | `tipo_solado` | Solado | seleção |  |  | herdado de `calcados` |

### ↳ Sapatos femininos  `calcados-sapatos-femininos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `calcados` |
| eixo | `tamanho` | Numeração | seleção | sim |  | herdado de `calcados` |
| spec | `tipo_sapato` | Tipo | seleção |  |  | próprio |
| spec | `altura_salto` | Altura do salto | seleção |  |  | próprio |
| spec | `material_cabedal` | Material do cabedal | seleção |  |  | herdado de `calcados` |
| spec | `tipo_solado` | Solado | seleção |  |  | herdado de `calcados` |

### ↳ Sapatos masculinos  `calcados-sapatos-masculinos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `calcados` |
| eixo | `tamanho` | Numeração | seleção | sim |  | herdado de `calcados` |
| spec | `tipo_sapato` | Tipo | seleção |  |  | próprio |
| spec | `material_cabedal` | Material do cabedal | seleção |  |  | herdado de `calcados` |
| spec | `tipo_solado` | Solado | seleção |  |  | herdado de `calcados` |

### ↳ Tênis  `calcados-tenis`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `calcados` |
| eixo | `tamanho` | Numeração | seleção | sim |  | herdado de `calcados` |
| spec | `uso_tenis` | Uso | seleção |  |  | próprio |
| spec | `material_cabedal` | Material do cabedal | seleção |  |  | herdado de `calcados` |
| spec | `tipo_solado` | Solado | seleção |  |  | herdado de `calcados` |

## Casa, Móveis e Decoração  `casa-moveis-e-decoracao`

### Casa, Móveis e Decoração (categoria principal — sem produtos próprios)  `casa-moveis-e-decoracao`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção |  |  | próprio |

### ↳ Artigos para banheiro  `casa-moveis-e-decoracao-artigos-para-banheiro`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_banheiro` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | herdado de `casa-moveis-e-decoracao` |

### ↳ Camas e colchões  `casa-moveis-e-decoracao-camas-e-colchoes`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `tamanho` | Tamanho | seleção | sim |  | próprio |
| spec | `tipo_cama` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | herdado de `casa-moveis-e-decoracao` |
| spec | `tipo_colchao` | Tipo de colchão | seleção |  |  | próprio |

### ↳ Decoração  `casa-moveis-e-decoracao-decoracao`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção |  |  | herdado de `casa-moveis-e-decoracao` |
| spec | `tipo_decoracao` | Tipo | seleção |  |  | próprio |

### ↳ Estantes e armários  `casa-moveis-e-decoracao-estantes-e-armarios`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_armario` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | herdado de `casa-moveis-e-decoracao` |
| spec | `material_movel` | Material | seleção |  |  | próprio |

### ↳ Guarda-roupas  `casa-moveis-e-decoracao-guarda-roupas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `numero_portas` | Portas | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | herdado de `casa-moveis-e-decoracao` |
| spec | `material_movel` | Material | seleção |  |  | próprio |
| spec | `com_espelho` | Com espelho | sim/não |  |  | próprio |

### ↳ Iluminação  `casa-moveis-e-decoracao-iluminacao`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_luz` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | herdado de `casa-moveis-e-decoracao` |
| eixo | `voltagem` | Voltagem | seleção |  |  | próprio |
| spec | `tipo_lampada` | Tecnologia | seleção |  |  | próprio |
| spec | `potencia_w` | Potência | número |  | W | próprio |
| spec | `cor_luz` | Cor da luz | seleção |  |  | próprio |

### ↳ Mesas e cadeiras  `casa-moveis-e-decoracao-mesas-e-cadeiras`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_movel` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | herdado de `casa-moveis-e-decoracao` |
| spec | `material_movel` | Material | seleção |  |  | próprio |
| spec | `lugares_mesa` | Lugares (mesas) | número |  |  | próprio |

### ↳ Móveis de escritório  `casa-moveis-e-decoracao-moveis-de-escritorio`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_escritorio` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | herdado de `casa-moveis-e-decoracao` |
| spec | `regulavel_altura` | Regulável em altura | sim/não |  |  | próprio |

### ↳ Organização doméstica  `casa-moveis-e-decoracao-organizacao-domestica`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção |  |  | herdado de `casa-moveis-e-decoracao` |
| spec | `tipo_organizacao` | Tipo | seleção |  |  | próprio |
| spec | `material_movel` | Material | seleção |  |  | próprio |

### ↳ Sofás e poltronas  `casa-moveis-e-decoracao-sofas-e-poltronas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_sofa` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | herdado de `casa-moveis-e-decoracao` |
| spec | `lugares` | Lugares | seleção |  |  | próprio |
| spec | `material_estofo` | Estofo | seleção |  |  | próprio |

### ↳ Tapetes e cortinas  `casa-moveis-e-decoracao-tapetes-e-cortinas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_tecido_casa` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | herdado de `casa-moveis-e-decoracao` |
| eixo | `tamanho` | Tamanho | seleção |  |  | próprio |
| spec | `material_tecido` | Material | seleção |  |  | próprio |

## Celulares e Telefones  `celulares-e-telefones`

### Celulares e Telefones (categoria principal — sem produtos próprios)  `celulares-e-telefones`

_sem atributos_

### ↳ Acessórios para celulares  `celulares-e-telefones-acessorios-para-celulares`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_acessorio` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `compativel_com` | Compatível com | texto |  |  | próprio |

### ↳ Baterias e peças  `celulares-e-telefones-baterias-e-pecas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_acessorio` | Tipo de peça | seleção | sim |  | próprio |
| spec | `compativel_com` | Compatível com | texto | sim |  | próprio |
| spec | `capacidade_bateria_mah` | Capacidade (baterias) | número |  | mAh | próprio |

### ↳ Capas e películas  `celulares-e-telefones-capas-e-peliculas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_acessorio` | Tipo | seleção | sim |  | próprio |
| spec | `compativel_com` | Compatível com | texto | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |

### ↳ Carregadores e cabos  `celulares-e-telefones-carregadores-e-cabos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_acessorio` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `conector` | Conector | seleção |  |  | próprio |
| spec | `potencia_w` | Potência | número |  | W | próprio |
| spec | `comprimento_cabo` | Comprimento do cabo | número |  | m | próprio |
| spec | `capacidade_bateria_mah` | Capacidade do power bank | número |  | mAh | próprio |

### ↳ Celulares básicos  `celulares-e-telefones-celulares-basicos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `rede_movel` | Rede móvel | seleção |  |  | próprio |
| spec | `dual_sim` | Dual SIM (2 cartões) | sim/não |  |  | próprio |
| spec | `bateria_mah` | Bateria | número |  | mAh | próprio |
| spec | `radio_fm` | Rádio FM | sim/não |  |  | próprio |
| spec | `lanterna` | Lanterna | sim/não |  |  | próprio |

### ↳ Rádios comunicadores  `celulares-e-telefones-radios-comunicadores`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_radio` | Tipo | seleção | sim |  | próprio |
| spec | `alcance_km` | Alcance | número |  | km | próprio |
| spec | `potencia_w` | Potência | número |  | W | próprio |
| spec | `canais` | Número de canais | número |  |  | próprio |

### ↳ Smartphones  `celulares-e-telefones-smartphones`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | próprio |
| eixo | `capacidade` | Armazenamento | seleção | sim |  | próprio |
| spec | `sistema_operativo` | Sistema operativo | seleção | sim |  | próprio |
| spec | `memoria_ram` | Memória RAM | seleção |  |  | próprio |
| spec | `tamanho_ecra` | Tamanho do ecrã | número |  | pol | próprio |
| spec | `camara_principal` | Câmara principal | número |  | MP | próprio |
| spec | `bateria_mah` | Bateria | número |  | mAh | próprio |
| spec | `rede_movel` | Rede móvel | seleção |  |  | próprio |
| spec | `dual_sim` | Dual SIM (2 cartões) | sim/não |  |  | próprio |
| spec | `desbloqueado` | Desbloqueado para qualquer operadora | sim/não |  |  | próprio |

### ↳ Smartwatches  `celulares-e-telefones-smartwatches`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | próprio |
| spec | `compativel_sistema` | Compatível com | múltipla |  |  | próprio |
| spec | `tamanho_ecra` | Tamanho do ecrã | número |  | pol | próprio |
| spec | `monitor_cardiaco` | Monitor de batimentos cardíacos | sim/não |  |  | próprio |
| spec | `resistente_agua` | Resistente à água | sim/não |  |  | próprio |
| spec | `faz_chamadas` | Faz e recebe chamadas | sim/não |  |  | próprio |
| spec | `autonomia_dias` | Autonomia da bateria | número |  | dias | próprio |

### ↳ Telefones fixos  `celulares-e-telefones-telefones-fixos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_telefone` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `identificador_chamadas` | Identificador de chamadas | sim/não |  |  | próprio |
| spec | `viva_voz` | Viva-voz | sim/não |  |  | próprio |

## Construção e Materiais  `construcao-e-materiais`

### Construção e Materiais (categoria principal — sem produtos próprios)  `construcao-e-materiais`

_sem atributos_

### ↳ Areia e brita  `construcao-e-materiais-areia-e-brita`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_agregado` | Tipo | seleção | sim |  | próprio |
| spec | `unidade_venda` | Vendido por | seleção |  |  | próprio |

### ↳ Blocos e tijolos  `construcao-e-materiais-blocos-e-tijolos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_bloco` | Tipo | seleção | sim |  | próprio |
| spec | `espessura_parede` | Espessura | seleção |  |  | próprio |
| spec | `unidades_pacote` | Unidades por lote | número |  |  | próprio |

### ↳ Canalização e hidráulica  `construcao-e-materiais-canalizacao-e-hidraulica`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_canalizacao` | Tipo | seleção | sim |  | próprio |
| spec | `diametro_nominal` | Diâmetro | seleção |  |  | próprio |

### ↳ Cimento e argamassa  `construcao-e-materiais-cimento-e-argamassa`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_cimento` | Tipo | seleção | sim |  | próprio |
| eixo | `tamanho` | Embalagem | seleção | sim |  | próprio |
| spec | `classe_resistencia` | Classe de resistência | seleção |  |  | próprio |

### ↳ Ferro e aço  `construcao-e-materiais-ferro-e-aco`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_ferro` | Tipo | seleção | sim |  | próprio |
| spec | `espessura_mm` | Espessura/diâmetro | número |  | mm | próprio |
| spec | `comprimento_barra_m` | Comprimento da peça | número |  | m | próprio |

### ↳ Louças sanitárias  `construcao-e-materiais-loucas-sanitarias`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_louca_sanitaria` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |

### ↳ Materiais elétricos  `construcao-e-materiais-materiais-eletricos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_eletrico` | Tipo | seleção | sim |  | próprio |
| spec | `secao_cabo` | Secção do cabo | seleção |  |  | próprio |
| spec | `tensao_trabalho` | Tensão | seleção |  |  | próprio |

### ↳ Pisos e revestimentos  `construcao-e-materiais-pisos-e-revestimentos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_piso` | Tipo | seleção | sim |  | próprio |
| spec | `formato_piso` | Formato | seleção |  |  | próprio |
| spec | `area_m2` | Cobertura por caixa | número |  | m² | próprio |

### ↳ Portas e janelas  `construcao-e-materiais-portas-e-janelas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_porta_janela` | Tipo | seleção | sim |  | próprio |
| spec | `material_porta` | Material | seleção |  |  | próprio |
| spec | `abertura` | Abertura | seleção |  |  | próprio |

### ↳ Telhas e coberturas  `construcao-e-materiais-telhas-e-coberturas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_telha` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `comprimento_telha_m` | Comprimento da peça | número |  | m | próprio |
| spec | `espessura_mm` | Espessura | número |  | mm | próprio |

### ↳ Tintas e vernizes  `construcao-e-materiais-tintas-e-vernizes`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `capacidade` | Volume | seleção | sim |  | próprio |
| spec | `tipo_tinta` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `acabamento` | Acabamento | seleção |  |  | próprio |

## Cozinha e Utilidades Domésticas  `cozinha-e-utilidades-domesticas`

### Cozinha e Utilidades Domésticas (categoria principal — sem produtos próprios)  `cozinha-e-utilidades-domesticas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `material_utensilio` | Material | seleção |  |  | próprio |

### ↳ Acessórios de cozinha  `cozinha-e-utilidades-domesticas-acessorios-de-cozinha`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção |  |  | herdado de `cozinha-e-utilidades-domesticas` |
| spec | `tipo_acessorio` | Tipo | seleção |  |  | próprio |
| spec | `material_utensilio` | Material | seleção |  |  | herdado de `cozinha-e-utilidades-domesticas` |

### ↳ Copos e canecas  `cozinha-e-utilidades-domesticas-copos-e-canecas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_copo` | Tipo | seleção | sim |  | próprio |
| eixo | `capacidade` | Capacidade | seleção |  |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | herdado de `cozinha-e-utilidades-domesticas` |
| spec | `material_utensilio` | Material | seleção |  |  | herdado de `cozinha-e-utilidades-domesticas` |
| spec | `numero_pecas` | Número de peças | número |  |  | próprio |

### ↳ Facas e utensílios  `cozinha-e-utilidades-domesticas-facas-e-utensilios`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_utensilio` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | herdado de `cozinha-e-utilidades-domesticas` |
| spec | `material_utensilio` | Material | seleção |  |  | herdado de `cozinha-e-utilidades-domesticas` |

### ↳ Garrafas térmicas  `cozinha-e-utilidades-domesticas-garrafas-termicas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `capacidade` | Capacidade | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | herdado de `cozinha-e-utilidades-domesticas` |
| spec | `material_utensilio` | Material | seleção |  |  | herdado de `cozinha-e-utilidades-domesticas` |
| spec | `tipo_termica` | Tipo | seleção |  |  | próprio |
| spec | `retencao_horas` | Mantém a temperatura | número |  | h | próprio |

### ↳ Panelas  `cozinha-e-utilidades-domesticas-panelas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_panela` | Tipo | seleção | sim |  | próprio |
| eixo | `capacidade` | Capacidade | seleção |  |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | herdado de `cozinha-e-utilidades-domesticas` |
| spec | `material_utensilio` | Material | seleção |  |  | herdado de `cozinha-e-utilidades-domesticas` |
| spec | `antiaderente` | Antiaderente | sim/não |  |  | próprio |
| spec | `tipo_fogao_compat` | Serve para | múltipla |  |  | próprio |

### ↳ Pratos e tigelas  `cozinha-e-utilidades-domesticas-pratos-e-tigelas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_louca` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | herdado de `cozinha-e-utilidades-domesticas` |
| spec | `material_utensilio` | Material | seleção |  |  | herdado de `cozinha-e-utilidades-domesticas` |
| spec | `numero_pecas` | Número de peças | número |  |  | próprio |
| spec | `micro_ondas_seguro` | Pode ir ao micro-ondas | sim/não |  |  | próprio |

### ↳ Recipientes e conservação  `cozinha-e-utilidades-domesticas-recipientes-e-conservacao`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_recipiente` | Tipo | seleção | sim |  | próprio |
| eixo | `capacidade` | Capacidade | seleção |  |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | herdado de `cozinha-e-utilidades-domesticas` |
| spec | `material_utensilio` | Material | seleção |  |  | herdado de `cozinha-e-utilidades-domesticas` |
| spec | `com_tampa` | Com tampa | sim/não |  |  | próprio |

### ↳ Talheres  `cozinha-e-utilidades-domesticas-talheres`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_talher` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | herdado de `cozinha-e-utilidades-domesticas` |
| spec | `material_utensilio` | Material | seleção |  |  | herdado de `cozinha-e-utilidades-domesticas` |
| spec | `numero_pecas` | Número de peças | número |  |  | próprio |

### ↳ Utensílios de limpeza  `cozinha-e-utilidades-domesticas-utensilios-de-limpeza`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_limpeza` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | herdado de `cozinha-e-utilidades-domesticas` |

## Eletrodomésticos  `eletrodomesticos`

### Eletrodomésticos (categoria principal — sem produtos próprios)  `eletrodomesticos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção |  |  | próprio |
| eixo | `voltagem` | Voltagem | seleção |  |  | próprio |
| spec | `potencia_w` | Potência | número |  | W | próprio |

### ↳ Ar-condicionado  `eletrodomesticos-ar-condicionado`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `capacidade_btu` | Capacidade | seleção | sim |  | próprio |
| spec | `tipo_ar` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | herdado de `eletrodomesticos` |
| eixo | `voltagem` | Voltagem | seleção |  |  | herdado de `eletrodomesticos` |
| spec | `inverter` | Inverter (poupança de energia) | sim/não |  |  | próprio |
| spec | `potencia_w` | Potência | número |  | W | herdado de `eletrodomesticos` |
| spec | `ciclo` | Ciclo | seleção |  |  | próprio |

### ↳ Congeladores e arcas  `eletrodomesticos-congeladores-e-arcas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `capacidade_litros` | Capacidade total | número | sim | L | próprio |
| eixo | `cor` | Cor | seleção |  |  | herdado de `eletrodomesticos` |
| spec | `tipo_congelador` | Tipo | seleção |  |  | próprio |
| eixo | `voltagem` | Voltagem | seleção |  |  | herdado de `eletrodomesticos` |
| spec | `classe_energetica` | Classe energética | seleção |  |  | próprio |
| spec | `potencia_w` | Potência | número |  | W | herdado de `eletrodomesticos` |

### ↳ Ferros de passar  `eletrodomesticos-ferros-de-passar`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção |  |  | herdado de `eletrodomesticos` |
| spec | `tipo_ferro` | Tipo | seleção |  |  | próprio |
| spec | `base_ferro` | Base | seleção |  |  | próprio |
| eixo | `voltagem` | Voltagem | seleção |  |  | herdado de `eletrodomesticos` |
| spec | `potencia_w` | Potência | número |  | W | herdado de `eletrodomesticos` |

### ↳ Fogões e fornos  `eletrodomesticos-fogoes-e-fornos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_fogao` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | herdado de `eletrodomesticos` |
| spec | `bocas` | Número de bocas | seleção |  |  | próprio |
| eixo | `voltagem` | Voltagem | seleção |  |  | herdado de `eletrodomesticos` |
| spec | `tem_forno` | Com forno | sim/não |  |  | próprio |
| spec | `potencia_w` | Potência | número |  | W | herdado de `eletrodomesticos` |
| spec | `acendimento_automatico` | Acendimento automático | sim/não |  |  | próprio |

### ↳ Geladeiras e frigoríficos  `eletrodomesticos-geladeiras-e-frigorificos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `capacidade_litros` | Capacidade total | número | sim | L | próprio |
| eixo | `cor` | Cor | seleção |  |  | herdado de `eletrodomesticos` |
| spec | `portas` | Portas | seleção |  |  | próprio |
| eixo | `voltagem` | Voltagem | seleção |  |  | herdado de `eletrodomesticos` |
| spec | `frost_free` | Frost free (sem gelo acumulado) | sim/não |  |  | próprio |
| spec | `potencia_w` | Potência | número |  | W | herdado de `eletrodomesticos` |
| spec | `classe_energetica` | Classe energética | seleção |  |  | próprio |

### ↳ Liquidificadores  `eletrodomesticos-liquidificadores`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `capacidade_litros` | Capacidade do copo | número |  | L | próprio |
| eixo | `cor` | Cor | seleção |  |  | herdado de `eletrodomesticos` |
| spec | `velocidades` | Número de velocidades | número |  |  | próprio |
| eixo | `voltagem` | Voltagem | seleção |  |  | herdado de `eletrodomesticos` |
| spec | `material_copo` | Material do copo | seleção |  |  | próprio |
| spec | `potencia_w` | Potência | número |  | W | herdado de `eletrodomesticos` |

### ↳ Máquinas de lavar  `eletrodomesticos-maquinas-de-lavar`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `capacidade_kg` | Capacidade de roupa | número | sim | kg | próprio |
| eixo | `cor` | Cor | seleção |  |  | herdado de `eletrodomesticos` |
| spec | `tipo_lavagem` | Tipo | seleção |  |  | próprio |
| eixo | `voltagem` | Voltagem | seleção |  |  | herdado de `eletrodomesticos` |
| spec | `potencia_w` | Potência | número |  | W | herdado de `eletrodomesticos` |
| spec | `seca_roupa` | Seca a roupa | sim/não |  |  | próprio |

### ↳ Micro-ondas  `eletrodomesticos-micro-ondas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `capacidade_litros` | Capacidade | número | sim | L | próprio |
| eixo | `cor` | Cor | seleção |  |  | herdado de `eletrodomesticos` |
| spec | `com_grill` | Com grill | sim/não |  |  | próprio |
| eixo | `voltagem` | Voltagem | seleção |  |  | herdado de `eletrodomesticos` |
| spec | `painel` | Painel | seleção |  |  | próprio |
| spec | `potencia_w` | Potência | número |  | W | herdado de `eletrodomesticos` |

### ↳ Peças e acessórios  `eletrodomesticos-pecas-e-acessorios`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_peca` | Tipo | seleção | sim |  | próprio |
| spec | `compativel_com` | Compatível com | texto | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | herdado de `eletrodomesticos` |

### ↳ Pequenos eletrodomésticos  `eletrodomesticos-pequenos-eletrodomesticos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_pequeno` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | herdado de `eletrodomesticos` |
| spec | `capacidade_litros` | Capacidade | número |  | L | próprio |
| eixo | `voltagem` | Voltagem | seleção |  |  | herdado de `eletrodomesticos` |
| spec | `potencia_w` | Potência | número |  | W | herdado de `eletrodomesticos` |

### ↳ Ventiladores  `eletrodomesticos-ventiladores`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_ventilador` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | herdado de `eletrodomesticos` |
| spec | `diametro_cm` | Diâmetro da hélice | número |  | cm | próprio |
| eixo | `voltagem` | Voltagem | seleção |  |  | herdado de `eletrodomesticos` |
| spec | `velocidades` | Número de velocidades | número |  |  | próprio |
| spec | `potencia_w` | Potência | número |  | W | herdado de `eletrodomesticos` |
| spec | `controle_remoto` | Com controlo remoto | sim/não |  |  | próprio |

## Eletrônicos, TV e Áudio  `eletronicos-tv-e-audio`

### Eletrônicos, TV e Áudio (categoria principal — sem produtos próprios)  `eletronicos-tv-e-audio`

_sem atributos_

### ↳ Acessórios de áudio e vídeo  `eletronicos-tv-e-audio-acessorios-de-audio-e-video`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_acessorio` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `compativel_com` | Compatível com | texto |  |  | próprio |

### ↳ Caixas de som  `eletronicos-tv-e-audio-caixas-de-som`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_som` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `potencia_rms_w` | Potência (RMS) | número |  | W | próprio |
| spec | `ligacoes` | Ligações | múltipla |  |  | próprio |
| spec | `alimentacao` | Alimentação | seleção |  |  | próprio |

### ↳ Câmeras de segurança  `eletronicos-tv-e-audio-cameras-de-seguranca`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_camera_seg` | Tipo | seleção | sim |  | próprio |
| spec | `resolucao` | Resolução | seleção | sim |  | próprio |
| spec | `visao_noturna` | Visão noturna | sim/não |  |  | próprio |
| spec | `uso_exterior` | Resistente para uso exterior | sim/não |  |  | próprio |
| spec | `alimentacao` | Alimentação | seleção |  |  | próprio |

### ↳ Câmeras digitais  `eletronicos-tv-e-audio-cameras-digitais`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_camera` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `megapixels` | Resolução | número |  | MP | próprio |
| spec | `video_max` | Vídeo máximo | seleção |  |  | próprio |

### ↳ Controles remotos  `eletronicos-tv-e-audio-controles-remotos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_controle` | Tipo | seleção | sim |  | próprio |
| spec | `compativel_com` | Compatível com | texto | sim |  | próprio |

### ↳ Drones  `eletronicos-tv-e-audio-drones`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `resolucao` | Qualidade da câmara | seleção |  |  | próprio |
| spec | `autonomia_min` | Autonomia de voo | número |  | min | próprio |
| spec | `alcance_m` | Alcance de controlo | número |  | m | próprio |

### ↳ Fones de ouvido  `eletronicos-tv-e-audio-fones-de-ouvido`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_fone` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `ligacao` | Ligação | seleção |  |  | próprio |
| spec | `microfone` | Microfone integrado | sim/não |  |  | próprio |
| spec | `cancelamento_ruido` | Cancelamento de ruído | sim/não |  |  | próprio |

### ↳ Home theater  `eletronicos-tv-e-audio-home-theater`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `canais_audio` | Canais | seleção | sim |  | próprio |
| spec | `potencia_rms_w` | Potência total (RMS) | número |  | W | próprio |
| spec | `ligacoes` | Ligações | múltipla |  |  | próprio |

### ↳ Projetores  `eletronicos-tv-e-audio-projetores`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `luminosidade_lumens` | Luminosidade | número |  | lumens | próprio |
| spec | `resolucao` | Resolução | seleção |  |  | próprio |
| spec | `tecnologia_projecao` | Tecnologia | seleção |  |  | próprio |
| spec | `entradas_video` | Entradas | múltipla |  |  | próprio |

### ↳ Televisores  `eletronicos-tv-e-audio-televisores`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tamanho_ecra` | Tamanho do ecrã | número | sim | pol | próprio |
| spec | `resolucao` | Resolução | seleção | sim |  | próprio |
| spec | `tecnologia_ecra` | Tecnologia do ecrã | seleção |  |  | próprio |
| spec | `smart_tv` | Smart TV | sim/não |  |  | próprio |
| spec | `entradas_video` | Entradas | múltipla |  |  | próprio |
| spec | `receptor_digital` | Receptor digital integrado | sim/não |  |  | próprio |

## Energia Solar e Eletricidade  `energia-solar-e-eletricidade`

### Energia Solar e Eletricidade (categoria principal — sem produtos próprios)  `energia-solar-e-eletricidade`

_sem atributos_

### ↳ Baterias solares  `energia-solar-e-eletricidade-baterias-solares`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `capacidade` | Capacidade | seleção | sim |  | próprio |
| spec | `tecnologia_bateria` | Tecnologia | seleção | sim |  | próprio |
| spec | `tensao_nominal` | Tensão | seleção |  |  | próprio |

### ↳ Cabos e conectores  `energia-solar-e-eletricidade-cabos-e-conectores`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_cabo` | Tipo | seleção | sim |  | próprio |
| spec | `secao_cabo` | Secção | seleção |  |  | próprio |
| spec | `comprimento_cabo` | Comprimento do cabo | número |  | m | próprio |

### ↳ Controladores de carga  `energia-solar-e-eletricidade-controladores-de-carga`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_controlador` | Tipo | seleção | sim |  | próprio |
| spec | `corrente_a` | Corrente | número |  | A | próprio |
| spec | `tensao_sistema` | Tensão do sistema | seleção |  |  | próprio |

### ↳ Estabilizadores e UPS  `energia-solar-e-eletricidade-estabilizadores-e-ups`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_protecao` | Tipo | seleção | sim |  | próprio |
| spec | `potencia_va` | Potência | número |  | VA | próprio |
| spec | `tensao_entrada` | Tensão | seleção |  |  | próprio |

### ↳ Inversores  `energia-solar-e-eletricidade-inversores`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `potencia_w` | Potência | número | sim | W | próprio |
| spec | `tipo_inversor` | Tipo | seleção |  |  | próprio |
| spec | `tensao_entrada` | Tensão de entrada | seleção |  |  | próprio |
| spec | `tensao_saida` | Tensão de saída | seleção |  |  | próprio |

### ↳ Kits solares  `energia-solar-e-eletricidade-kits-solares`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `itens_kit` | O kit inclui | múltipla | sim |  | próprio |
| spec | `potencia_total_w` | Potência do kit | número |  | W | próprio |
| spec | `uso_kit` | Uso | seleção |  |  | próprio |

### ↳ Lâmpadas solares  `energia-solar-e-eletricidade-lampadas-solares`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_lampada_solar` | Tipo | seleção | sim |  | próprio |
| spec | `potencia_w` | Potência | número |  | W | próprio |
| spec | `autonomia_horas` | Autonomia | número |  | h | próprio |

### ↳ Painéis solares  `energia-solar-e-eletricidade-paineis-solares`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `potencia_wp` | Potência | número | sim | Wp | próprio |
| spec | `tipo_celula` | Tecnologia | seleção |  |  | próprio |
| spec | `tensao_nominal` | Tensão | seleção |  |  | próprio |

### ↳ Sistemas de energia de emergência  `energia-solar-e-eletricidade-sistemas-de-energia-de-emergencia`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_emergencia` | Tipo | seleção | sim |  | próprio |
| spec | `capacidade_wh` | Capacidade de energia | número |  | Wh | próprio |
| spec | `potencia_w` | Potência de saída | número |  | W | próprio |

## Esportes e Fitness  `esportes-e-fitness`

### Esportes e Fitness (categoria principal — sem produtos próprios)  `esportes-e-fitness`

_sem atributos_

### ↳ Artes marciais  `esportes-e-fitness-artes-marciais`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `modalidade` | Modalidade | seleção | sim |  | próprio |
| eixo | `tamanho` | Tamanho | seleção |  |  | próprio |
| spec | `tipo_equipamento_marcial` | Tipo | seleção |  |  | próprio |

### ↳ Basquetebol  `esportes-e-fitness-basquetebol`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_basquete` | Tipo | seleção | sim |  | próprio |
| eixo | `tamanho` | Tamanho | seleção |  |  | próprio |

### ↳ Bolas e acessórios  `esportes-e-fitness-bolas-e-acessorios`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_bola` | Esporte | seleção | sim |  | próprio |
| spec | `tamanho_bola` | Tamanho | seleção |  |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |

### ↳ Camping  `esportes-e-fitness-camping`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_camping` | Tipo | seleção | sim |  | próprio |
| spec | `capacidade_pessoas` | Capacidade | número |  | pessoas | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |

### ↳ Ciclismo  `esportes-e-fitness-ciclismo`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_ciclismo` | Tipo | seleção | sim |  | próprio |
| eixo | `tamanho` | Tamanho do quadro/aro | seleção |  |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `numero_velocidades` | Número de velocidades | número |  |  | próprio |

### ↳ Corrida  `esportes-e-fitness-corrida`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_corrida` | Tipo | seleção | sim |  | próprio |
| eixo | `tamanho` | Tamanho | seleção |  |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |

### ↳ Equipamentos de ginástica  `esportes-e-fitness-equipamentos-de-ginastica`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_ginastica` | Tipo | seleção | sim |  | próprio |
| spec | `carga_kg` | Carga/Peso | número |  | kg | próprio |
| spec | `carga_max_usuario_kg` | Suporta até | número |  | kg | próprio |

### ↳ Futebol  `esportes-e-fitness-futebol`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_futebol` | Tipo | seleção | sim |  | próprio |
| eixo | `tamanho` | Tamanho | seleção |  |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |

### ↳ Pesca esportiva  `esportes-e-fitness-pesca-esportiva`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_pesca_esportiva` | Tipo | seleção | sim |  | próprio |
| spec | `comprimento_cana_m` | Comprimento da cana | número |  | m | próprio |

### ↳ Roupas esportivas  `esportes-e-fitness-roupas-esportivas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | próprio |
| eixo | `tamanho` | Tamanho | seleção | sim |  | próprio |
| spec | `publico` | Público | seleção |  |  | próprio |
| spec | `tipo_roupa_esportiva` | Tipo | seleção |  |  | próprio |

## Ferramentas e Máquinas  `ferramentas-e-maquinas`

### Ferramentas e Máquinas (categoria principal — sem produtos próprios)  `ferramentas-e-maquinas`

_sem atributos_

### ↳ Compressores  `ferramentas-e-maquinas-compressores`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `voltagem` | Voltagem | seleção |  |  | próprio |
| spec | `tipo_compressor` | Tipo | seleção |  |  | próprio |
| spec | `capacidade_litros` | Capacidade do reservatório | número |  | L | próprio |
| spec | `pressao_bar` | Pressão máxima | número |  | bar | próprio |

### ↳ Equipamentos de oficina  `ferramentas-e-maquinas-equipamentos-de-oficina`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_oficina` | Tipo | seleção | sim |  | próprio |
| spec | `capacidade_carga_kg` | Capacidade de carga | número |  | kg | próprio |

### ↳ Equipamentos de proteção  `ferramentas-e-maquinas-equipamentos-de-protecao`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_epi` | Tipo | seleção | sim |  | próprio |
| eixo | `tamanho` | Tamanho | seleção |  |  | próprio |
| spec | `norma` | Norma/certificação | texto |  |  | próprio |

### ↳ Ferramentas elétricas  `ferramentas-e-maquinas-ferramentas-eletricas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_ferramenta` | Tipo | seleção | sim |  | próprio |
| eixo | `voltagem` | Voltagem | seleção |  |  | próprio |
| spec | `potencia_w` | Potência | número |  | W | próprio |
| spec | `alimentacao` | Alimentação | seleção |  |  | próprio |

### ↳ Ferramentas manuais  `ferramentas-e-maquinas-ferramentas-manuais`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_ferramenta` | Tipo | seleção | sim |  | próprio |
| spec | `numero_pecas` | Número de peças (kits) | número |  |  | próprio |

### ↳ Furadeiras  `ferramentas-e-maquinas-furadeiras`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_furadeira` | Tipo | seleção | sim |  | próprio |
| eixo | `voltagem` | Voltagem | seleção |  |  | próprio |
| spec | `potencia_w` | Potência | número |  | W | próprio |
| spec | `mandril` | Mandril | seleção |  |  | próprio |

### ↳ Geradores  `ferramentas-e-maquinas-geradores`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `combustivel` | Combustível | seleção | sim |  | próprio |
| spec | `potencia_kva` | Potência | número | sim | kVA | próprio |
| eixo | `voltagem` | Voltagem | seleção |  |  | próprio |
| spec | `partida` | Partida | seleção |  |  | próprio |
| spec | `silencioso` | Silencioso (insonorizado) | sim/não |  |  | próprio |

### ↳ Máquinas de solda  `ferramentas-e-maquinas-maquinas-de-solda`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_solda` | Tipo | seleção | sim |  | próprio |
| eixo | `voltagem` | Voltagem | seleção |  |  | próprio |
| spec | `corrente_max_a` | Corrente máxima | número |  | A | próprio |

### ↳ Peças para máquinas  `ferramentas-e-maquinas-pecas-para-maquinas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_peca` | Tipo de peça | seleção | sim |  | próprio |
| spec | `compativel_com` | Compatível com | texto | sim |  | próprio |

### ↳ Serras  `ferramentas-e-maquinas-serras`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_serra` | Tipo | seleção | sim |  | próprio |
| eixo | `voltagem` | Voltagem | seleção |  |  | próprio |
| spec | `potencia_w` | Potência | número |  | W | próprio |
| spec | `alimentacao` | Alimentação | seleção |  |  | próprio |

## Festas e Eventos  `festas-e-eventos`

### Festas e Eventos (categoria principal — sem produtos próprios)  `festas-e-eventos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção |  |  | próprio |

### ↳ Artigos de aniversário  `festas-e-eventos-artigos-de-aniversario`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_aniversario` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | herdado de `festas-e-eventos` |
| spec | `faixa_idade` | Para | seleção |  |  | próprio |

### ↳ Artigos de casamento  `festas-e-eventos-artigos-de-casamento`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_casamento` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | herdado de `festas-e-eventos` |

### ↳ Artigos religiosos para eventos  `festas-e-eventos-artigos-religiosos-para-eventos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_religioso` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | herdado de `festas-e-eventos` |
| spec | `tradicao` | Tradição | seleção |  |  | próprio |

### ↳ Balões  `festas-e-eventos-baloes`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_balao` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | herdado de `festas-e-eventos` |
| spec | `unidades_pacote` | Unidades por pacote | número |  |  | próprio |

### ↳ Decoração de festas  `festas-e-eventos-decoracao-de-festas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_decoracao_festa` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | herdado de `festas-e-eventos` |
| spec | `tema` | Tema/Ocasião | seleção |  |  | próprio |

### ↳ Equipamentos de som  `festas-e-eventos-equipamentos-de-som`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_som_festa` | Tipo | seleção | sim |  | próprio |
| spec | `potencia_rms_w` | Potência (RMS) | número |  | W | próprio |

### ↳ Iluminação para eventos  `festas-e-eventos-iluminacao-para-eventos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_luz_evento` | Tipo | seleção | sim |  | próprio |
| spec | `alimentacao` | Alimentação | seleção |  |  | próprio |

### ↳ Lembranças  `festas-e-eventos-lembrancas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_lembranca` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | herdado de `festas-e-eventos` |
| spec | `unidades_pacote` | Unidades por pacote | número |  |  | próprio |

### ↳ Tendas e coberturas  `festas-e-eventos-tendas-e-coberturas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_tenda` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | herdado de `festas-e-eventos` |
| spec | `tamanho_tenda` | Tamanho | seleção |  |  | próprio |

### ↳ Utensílios descartáveis  `festas-e-eventos-utensilios-descartaveis`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_descartavel` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | herdado de `festas-e-eventos` |
| spec | `unidades_pacote` | Unidades por pacote | número |  |  | próprio |
| spec | `material_descartavel` | Material | seleção |  |  | próprio |

## Games e Consoles  `games-e-consoles`

### Games e Consoles (categoria principal — sem produtos próprios)  `games-e-consoles`

_sem atributos_

### ↳ Acessórios para consoles  `games-e-consoles-acessorios-para-consoles`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `plataforma` | Compatível com | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `tipo_acessorio` | Tipo | seleção |  |  | próprio |

### ↳ Consoles de jogos  `games-e-consoles-consoles-de-jogos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `plataforma` | Plataforma | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| eixo | `capacidade` | Armazenamento | seleção |  |  | próprio |
| spec | `geracao_console` | Geração/versão | seleção |  |  | próprio |

### ↳ Controles  `games-e-consoles-controles`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `plataforma` | Compatível com | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `ligacao` | Ligação | seleção |  |  | próprio |

### ↳ Equipamentos gamer  `games-e-consoles-equipamentos-gamer`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_gamer` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `iluminacao_rgb` | Iluminação RGB | sim/não |  |  | próprio |

### ↳ Jogos físicos  `games-e-consoles-jogos-fisicos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `plataforma` | Plataforma | seleção | sim |  | próprio |
| spec | `titulo_jogo` | Título do jogo | texto | sim |  | próprio |
| spec | `classificacao_idade` | Classificação etária | seleção |  |  | próprio |

### ↳ Peças para consoles  `games-e-consoles-pecas-para-consoles`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `plataforma` | Compatível com | seleção | sim |  | próprio |
| spec | `tipo_peca` | Tipo de peça | seleção |  |  | próprio |

## Indústria, Comércio e Escritório  `industria-comercio-e-escritorio`

### Indústria, Comércio e Escritório (categoria principal — sem produtos próprios)  `industria-comercio-e-escritorio`

_sem atributos_

### ↳ Balanças comerciais  `industria-comercio-e-escritorio-balancas-comerciais`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `capacidade_max_kg` | Capacidade máxima | número | sim | kg | próprio |
| spec | `precisao_g` | Precisão (divisão) | número |  | g | próprio |
| spec | `alimentacao` | Alimentação | seleção |  |  | próprio |

### ↳ Embalagens  `industria-comercio-e-escritorio-embalagens`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_embalagem` | Tipo | seleção | sim |  | próprio |
| eixo | `tamanho` | Tamanho | seleção |  |  | próprio |
| spec | `unidades_pacote` | Unidades por pacote | número |  |  | próprio |

### ↳ Equipamentos comerciais  `industria-comercio-e-escritorio-equipamentos-comerciais`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_comercial` | Tipo | seleção | sim |  | próprio |
| eixo | `voltagem` | Voltagem | seleção |  |  | próprio |

### ↳ Equipamentos de escritório  `industria-comercio-e-escritorio-equipamentos-de-escritorio`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_escritorio` | Tipo | seleção | sim |  | próprio |
| eixo | `voltagem` | Voltagem | seleção |  |  | próprio |

### ↳ Equipamentos de segurança  `industria-comercio-e-escritorio-equipamentos-de-seguranca`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_seguranca` | Tipo | seleção | sim |  | próprio |
| spec | `norma` | Norma/certificação | texto |  |  | próprio |

### ↳ Equipamentos para restaurantes  `industria-comercio-e-escritorio-equipamentos-para-restaurantes`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_restaurante` | Tipo | seleção | sim |  | próprio |
| spec | `fonte_energia` | Energia | seleção |  |  | próprio |
| eixo | `voltagem` | Voltagem | seleção |  |  | próprio |

### ↳ Máquinas de costura  `industria-comercio-e-escritorio-maquinas-de-costura`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_costura` | Tipo | seleção | sim |  | próprio |
| eixo | `voltagem` | Voltagem | seleção |  |  | próprio |
| spec | `pontos` | Número de pontos | número |  |  | próprio |

### ↳ Máquinas industriais  `industria-comercio-e-escritorio-maquinas-industriais`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_industrial` | Tipo | seleção | sim |  | próprio |
| eixo | `voltagem` | Voltagem | seleção |  |  | próprio |
| spec | `potencia_kw` | Potência | número |  | kW | próprio |

### ↳ Materiais de armazenagem  `industria-comercio-e-escritorio-materiais-de-armazenagem`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_armazenagem` | Tipo | seleção | sim |  | próprio |
| spec | `capacidade_carga_kg` | Capacidade de carga | número |  | kg | próprio |

### ↳ Uniformes profissionais  `industria-comercio-e-escritorio-uniformes-profissionais`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `tamanho` | Tamanho | seleção | sim |  | próprio |
| spec | `tipo_uniforme` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |

## Informática e Computadores  `informatica-e-computadores`

### Informática e Computadores (categoria principal — sem produtos próprios)  `informatica-e-computadores`

_sem atributos_

### ↳ Acessórios de informática  `informatica-e-computadores-acessorios-de-informatica`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_acessorio` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `compativel_com` | Compatível com | texto |  |  | próprio |

### ↳ Cartuchos e toners  `informatica-e-computadores-cartuchos-e-toners`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_consumivel` | Tipo | seleção | sim |  | próprio |
| spec | `compativel_com` | Compatível com | texto | sim |  | próprio |
| spec | `cor_impressao` | Cor de impressão | seleção |  |  | próprio |
| spec | `rendimento_paginas` | Rendimento | número |  | páginas | próprio |

### ↳ Computadores de mesa  `informatica-e-computadores-computadores-de-mesa`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_computador` | Tipo | seleção | sim |  | próprio |
| spec | `processador` | Processador | seleção | sim |  | próprio |
| spec | `memoria_ram` | Memória RAM | seleção | sim |  | próprio |
| spec | `armazenamento` | Armazenamento | seleção |  |  | próprio |
| spec | `sistema_operativo` | Sistema operativo | seleção |  |  | próprio |

### ↳ Discos SSD e HD  `informatica-e-computadores-discos-ssd-e-hd`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `capacidade` | Capacidade | seleção | sim |  | próprio |
| spec | `tipo_disco` | Tipo | seleção | sim |  | próprio |
| spec | `interface` | Interface | seleção |  |  | próprio |

### ↳ Impressoras e scanners  `informatica-e-computadores-impressoras-e-scanners`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_impressora` | Tipo | seleção | sim |  | próprio |
| spec | `impressao_colorida` | Impressão a cores | sim/não |  |  | próprio |
| spec | `ligacoes` | Ligações | múltipla |  |  | próprio |
| spec | `formato_papel` | Formato máximo do papel | seleção |  |  | próprio |

### ↳ Memórias e processadores  `informatica-e-computadores-memorias-e-processadores`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_componente` | Tipo | seleção | sim |  | próprio |
| eixo | `capacidade` | Capacidade | seleção |  |  | próprio |
| spec | `compativel_com` | Compatível com | texto |  |  | próprio |
| spec | `velocidade_mhz` | Velocidade | número |  | MHz | próprio |

### ↳ Monitores  `informatica-e-computadores-monitores`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tamanho_ecra` | Tamanho do ecrã | número | sim | pol | próprio |
| spec | `resolucao` | Resolução | seleção | sim |  | próprio |
| spec | `taxa_atualizacao_hz` | Taxa de atualização | número |  | Hz | próprio |
| spec | `tipo_painel` | Tipo de painel | seleção |  |  | próprio |
| spec | `entradas_video` | Entradas de vídeo | múltipla |  |  | próprio |

### ↳ Notebooks  `informatica-e-computadores-notebooks`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `capacidade` | Armazenamento | seleção | sim |  | próprio |
| spec | `processador` | Processador | seleção | sim |  | próprio |
| spec | `memoria_ram` | Memória RAM | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `tipo_armazenamento` | Tipo de armazenamento | seleção |  |  | próprio |
| spec | `tamanho_ecra` | Tamanho do ecrã | número |  | pol | próprio |
| spec | `sistema_operativo` | Sistema operativo | seleção |  |  | próprio |

### ↳ Redes e roteadores  `informatica-e-computadores-redes-e-roteadores`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_rede` | Tipo | seleção | sim |  | próprio |
| spec | `padrao_wifi` | Padrão Wi-Fi | seleção |  |  | próprio |
| spec | `velocidade_mbps` | Velocidade máxima | número |  | Mbps | próprio |
| spec | `portas_rede` | Portas de rede | número |  |  | próprio |

### ↳ Tablets  `informatica-e-computadores-tablets`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | próprio |
| eixo | `capacidade` | Armazenamento | seleção | sim |  | próprio |
| spec | `sistema_operativo` | Sistema operativo | seleção | sim |  | próprio |
| spec | `memoria_ram` | Memória RAM | seleção |  |  | próprio |
| spec | `tamanho_ecra` | Tamanho do ecrã | número |  | pol | próprio |
| spec | `conectividade` | Conectividade | seleção |  |  | próprio |

### ↳ Teclados e mouses  `informatica-e-computadores-teclados-e-mouses`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_periferico` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `ligacao` | Ligação | seleção |  |  | próprio |
| spec | `layout_teclado` | Layout do teclado | seleção |  |  | próprio |

## Instrumentos Musicais  `instrumentos-musicais`

### Instrumentos Musicais (categoria principal — sem produtos próprios)  `instrumentos-musicais`

_sem atributos_

### ↳ Acessórios musicais  `instrumentos-musicais-acessorios-musicais`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_acessorio_musical` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `compativel_com` | Compatível com | texto |  |  | próprio |

### ↳ Baterias e percussão  `instrumentos-musicais-baterias-e-percussao`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_percussao` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |

### ↳ Equipamentos de gravação  `instrumentos-musicais-equipamentos-de-gravacao`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_gravacao` | Tipo | seleção | sim |  | próprio |
| spec | `ligacao` | Ligação | seleção |  |  | próprio |

### ↳ Guitarras  `instrumentos-musicais-guitarras`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_guitarra` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `numero_cordas` | Cordas | seleção |  |  | próprio |
| spec | `canhoto` | Para canhotos | sim/não |  |  | próprio |

### ↳ Instrumentos tradicionais  `instrumentos-musicais-instrumentos-tradicionais`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_instrumento_trad` | Instrumento | seleção | sim |  | próprio |
| spec | `material_artesanato` | Material | seleção |  |  | próprio |

### ↳ Mesas de som  `instrumentos-musicais-mesas-de-som`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `canais_mesa` | Canais | número | sim |  | próprio |
| spec | `efeitos_digitais` | Com efeitos digitais | sim/não |  |  | próprio |
| spec | `interface_usb` | Interface USB/Bluetooth | sim/não |  |  | próprio |

### ↳ Microfones  `instrumentos-musicais-microfones`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_microfone` | Tipo | seleção | sim |  | próprio |
| spec | `ligacao` | Ligação | seleção |  |  | próprio |

### ↳ Teclados musicais  `instrumentos-musicais-teclados-musicais`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_teclado` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `numero_teclas` | Teclas | seleção |  |  | próprio |

## Jardim e Exterior  `jardim-e-exterior`

### Jardim e Exterior (categoria principal — sem produtos próprios)  `jardim-e-exterior`

_sem atributos_

### ↳ Cercas  `jardim-e-exterior-cercas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_cerca` | Tipo | seleção | sim |  | próprio |
| spec | `altura_cerca_m` | Altura da cerca | número |  | m | próprio |
| spec | `comprimento_rolo_m` | Comprimento do rolo | número |  | m | próprio |

### ↳ Decoração de jardim  `jardim-e-exterior-decoracao-de-jardim`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `tipo_decoracao` | Tipo | seleção |  |  | próprio |

### ↳ Equipamentos de rega  `jardim-e-exterior-equipamentos-de-rega`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_rega` | Tipo | seleção | sim |  | próprio |
| spec | `alimentacao` | Alimentação | seleção |  |  | próprio |

### ↳ Ferramentas de jardinagem  `jardim-e-exterior-ferramentas-de-jardinagem`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_jardinagem` | Tipo | seleção | sim |  | próprio |

### ↳ Iluminação exterior  `jardim-e-exterior-iluminacao-exterior`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_luz` | Tipo | seleção | sim |  | próprio |
| spec | `alimentacao` | Alimentação | seleção |  |  | próprio |
| spec | `potencia_w` | Potência | número |  | W | próprio |

### ↳ Mangueiras  `jardim-e-exterior-mangueiras`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `tamanho` | Comprimento | seleção | sim |  | próprio |
| spec | `diametro_mangueira` | Diâmetro | seleção |  |  | próprio |
| spec | `com_acessorios` | Com pistola/conectores | sim/não |  |  | próprio |

### ↳ Mobiliário exterior  `jardim-e-exterior-mobiliario-exterior`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_exterior` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `material_movel` | Material | seleção |  |  | próprio |

### ↳ Plantas e sementes  `jardim-e-exterior-plantas-e-sementes`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_planta` | Tipo | seleção | sim |  | próprio |
| spec | `luz_necessaria` | Luz | seleção |  |  | próprio |

### ↳ Vasos  `jardim-e-exterior-vasos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção |  |  | próprio |
| eixo | `tamanho` | Tamanho | seleção |  |  | próprio |
| spec | `material_vaso` | Material | seleção |  |  | próprio |

## Livros, Papelaria e Educação  `livros-papelaria-e-educacao`

### Livros, Papelaria e Educação (categoria principal — sem produtos próprios)  `livros-papelaria-e-educacao`

_sem atributos_

### ↳ Artigos de escritório  `livros-papelaria-e-educacao-artigos-de-escritorio`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_artigo_escritorio` | Tipo | seleção | sim |  | próprio |
| spec | `formato_papel` | Formato | seleção |  |  | próprio |

### ↳ Cadernos  `livros-papelaria-e-educacao-cadernos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_caderno` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `numero_folhas` | Folhas | seleção |  |  | próprio |
| spec | `pautado` | Pauta | seleção |  |  | próprio |

### ↳ Canetas e lápis  `livros-papelaria-e-educacao-canetas-e-lapis`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_escrita` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `unidades_pacote` | Unidades por pacote | número |  |  | próprio |

### ↳ Literatura  `livros-papelaria-e-educacao-literatura`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `genero_literario` | Género | seleção | sim |  | próprio |
| spec | `autor` | Autor/Editora | texto |  |  | próprio |
| spec | `idioma_livro` | Idioma | seleção |  |  | próprio |
| spec | `formato_livro` | Formato | seleção |  |  | próprio |

### ↳ Livros escolares  `livros-papelaria-e-educacao-livros-escolares`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `nivel_ensino` | Nível | seleção | sim |  | próprio |
| spec | `disciplina` | Disciplina | texto |  |  | próprio |
| spec | `autor` | Autor/Editora | texto |  |  | próprio |
| spec | `idioma_livro` | Idioma | seleção |  |  | próprio |

### ↳ Livros religiosos  `livros-papelaria-e-educacao-livros-religiosos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `religiao` | Tradição | seleção | sim |  | próprio |
| spec | `idioma_livro` | Idioma | seleção |  |  | próprio |
| spec | `formato_livro` | Formato | seleção |  |  | próprio |

### ↳ Livros universitários  `livros-papelaria-e-educacao-livros-universitarios`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `area_conhecimento` | Área | texto |  |  | próprio |
| spec | `autor` | Autor/Editora | texto |  |  | próprio |
| spec | `idioma_livro` | Idioma | seleção |  |  | próprio |

### ↳ Materiais de desenho  `livros-papelaria-e-educacao-materiais-de-desenho`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_desenho` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |

### ↳ Materiais didáticos  `livros-papelaria-e-educacao-materiais-didaticos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_didatico` | Tipo | seleção | sim |  | próprio |
| spec | `nivel_ensino` | Nível | seleção |  |  | próprio |

### ↳ Mochilas escolares  `livros-papelaria-e-educacao-mochilas-escolares`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | próprio |
| spec | `tipo_mochila_escolar` | Tipo | seleção | sim |  | próprio |
| spec | `capacidade_litros` | Capacidade | número |  | L | próprio |

## Moda Feminina  `moda-feminina`

### Moda Feminina (categoria principal — sem produtos próprios)  `moda-feminina`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | próprio |
| eixo | `tamanho` | Tamanho | seleção | sim |  | próprio |
| spec | `material` | Material principal | seleção |  |  | próprio |
| spec | `ocasiao` | Ocasião | múltipla |  |  | próprio |

### ↳ Blusas e camisetas  `moda-feminina-blusas-e-camisetas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `moda-feminina` |
| eixo | `tamanho` | Tamanho | seleção | sim |  | herdado de `moda-feminina` |
| spec | `manga` | Manga | seleção |  |  | próprio |
| spec | `decote` | Decote | seleção |  |  | próprio |
| spec | `material` | Material principal | seleção |  |  | herdado de `moda-feminina` |
| spec | `ocasiao` | Ocasião | múltipla |  |  | herdado de `moda-feminina` |

### ↳ Calças  `moda-feminina-calcas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `moda-feminina` |
| eixo | `tamanho` | Tamanho | seleção | sim |  | herdado de `moda-feminina` |
| spec | `tipo_calca` | Tipo | seleção |  |  | próprio |
| spec | `cintura` | Cintura | seleção |  |  | próprio |
| spec | `material` | Material principal | seleção |  |  | herdado de `moda-feminina` |
| spec | `ocasiao` | Ocasião | múltipla |  |  | herdado de `moda-feminina` |

### ↳ Casacos  `moda-feminina-casacos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `moda-feminina` |
| eixo | `tamanho` | Tamanho | seleção | sim |  | herdado de `moda-feminina` |
| spec | `tipo_casaco` | Tipo | seleção |  |  | próprio |
| spec | `material` | Material principal | seleção |  |  | herdado de `moda-feminina` |
| spec | `ocasiao` | Ocasião | múltipla |  |  | herdado de `moda-feminina` |

### ↳ Conjuntos  `moda-feminina-conjuntos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `moda-feminina` |
| eixo | `tamanho` | Tamanho | seleção | sim |  | herdado de `moda-feminina` |
| spec | `numero_pecas` | Número de peças | número |  |  | próprio |
| spec | `material` | Material principal | seleção |  |  | herdado de `moda-feminina` |
| spec | `ocasiao` | Ocasião | múltipla |  |  | herdado de `moda-feminina` |

### ↳ Moda praia  `moda-feminina-moda-praia`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `moda-feminina` |
| eixo | `tamanho` | Tamanho | seleção | sim |  | herdado de `moda-feminina` |
| spec | `tipo_praia` | Tipo | seleção |  |  | próprio |
| spec | `material` | Material principal | seleção |  |  | herdado de `moda-feminina` |
| spec | `ocasiao` | Ocasião | múltipla |  |  | herdado de `moda-feminina` |

### ↳ Roupas esportivas  `moda-feminina-roupas-esportivas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `moda-feminina` |
| eixo | `tamanho` | Tamanho | seleção | sim |  | herdado de `moda-feminina` |
| spec | `tipo_desporto` | Tipo | seleção |  |  | próprio |
| spec | `material` | Material principal | seleção |  |  | herdado de `moda-feminina` |
| spec | `ocasiao` | Ocasião | múltipla |  |  | herdado de `moda-feminina` |

### ↳ Roupas íntimas  `moda-feminina-roupas-intimas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `moda-feminina` |
| spec | `tipo_intima` | Tipo | seleção | sim |  | próprio |
| eixo | `tamanho` | Tamanho | seleção | sim |  | herdado de `moda-feminina` |
| spec | `material` | Material principal | seleção |  |  | substitui o de `moda-feminina` |
| spec | `ocasiao` | Ocasião | múltipla |  |  | herdado de `moda-feminina` |

### ↳ Roupas tradicionais africanas  `moda-feminina-roupas-tradicionais-africanas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `moda-feminina` |
| eixo | `tamanho` | Tamanho | seleção | sim |  | herdado de `moda-feminina` |
| spec | `tipo_traje` | Tipo de traje | seleção |  |  | próprio |
| spec | `material` | Material principal | seleção |  |  | substitui o de `moda-feminina` |
| spec | `ocasiao` | Ocasião | múltipla |  |  | herdado de `moda-feminina` |

### ↳ Saias  `moda-feminina-saias`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `moda-feminina` |
| eixo | `tamanho` | Tamanho | seleção | sim |  | herdado de `moda-feminina` |
| spec | `comprimento_peca` | Comprimento da peça | seleção |  |  | próprio |
| spec | `material` | Material principal | seleção |  |  | herdado de `moda-feminina` |
| spec | `ocasiao` | Ocasião | múltipla |  |  | herdado de `moda-feminina` |

### ↳ Vestidos  `moda-feminina-vestidos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `moda-feminina` |
| eixo | `tamanho` | Tamanho | seleção | sim |  | herdado de `moda-feminina` |
| spec | `comprimento_peca` | Comprimento da peça | seleção |  |  | próprio |
| spec | `manga` | Manga | seleção |  |  | próprio |
| spec | `material` | Material principal | seleção |  |  | herdado de `moda-feminina` |
| spec | `ocasiao` | Ocasião | múltipla |  |  | herdado de `moda-feminina` |

## Moda Masculina  `moda-masculina`

### Moda Masculina (categoria principal — sem produtos próprios)  `moda-masculina`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | próprio |
| eixo | `tamanho` | Tamanho | seleção | sim |  | próprio |
| spec | `material` | Material principal | seleção |  |  | próprio |
| spec | `ocasiao` | Ocasião | múltipla |  |  | próprio |

### ↳ Bermudas  `moda-masculina-bermudas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `moda-masculina` |
| eixo | `tamanho` | Tamanho | seleção | sim |  | herdado de `moda-masculina` |
| spec | `tipo_bermuda` | Tipo | seleção |  |  | próprio |
| spec | `material` | Material principal | seleção |  |  | herdado de `moda-masculina` |
| spec | `ocasiao` | Ocasião | múltipla |  |  | herdado de `moda-masculina` |

### ↳ Calças  `moda-masculina-calcas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `moda-masculina` |
| eixo | `tamanho` | Tamanho | seleção | sim |  | herdado de `moda-masculina` |
| spec | `tipo_calca` | Tipo | seleção |  |  | próprio |
| spec | `material` | Material principal | seleção |  |  | herdado de `moda-masculina` |
| spec | `ocasiao` | Ocasião | múltipla |  |  | herdado de `moda-masculina` |

### ↳ Camisas  `moda-masculina-camisas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `moda-masculina` |
| eixo | `tamanho` | Tamanho | seleção | sim |  | herdado de `moda-masculina` |
| spec | `manga` | Manga | seleção |  |  | próprio |
| spec | `corte` | Corte | seleção |  |  | próprio |
| spec | `material` | Material principal | seleção |  |  | herdado de `moda-masculina` |
| spec | `ocasiao` | Ocasião | múltipla |  |  | herdado de `moda-masculina` |

### ↳ Camisetas e polos  `moda-masculina-camisetas-e-polos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `moda-masculina` |
| eixo | `tamanho` | Tamanho | seleção | sim |  | herdado de `moda-masculina` |
| spec | `tipo_camiseta` | Tipo | seleção |  |  | próprio |
| spec | `material` | Material principal | seleção |  |  | herdado de `moda-masculina` |
| spec | `ocasiao` | Ocasião | múltipla |  |  | herdado de `moda-masculina` |

### ↳ Casacos  `moda-masculina-casacos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `moda-masculina` |
| eixo | `tamanho` | Tamanho | seleção | sim |  | herdado de `moda-masculina` |
| spec | `tipo_casaco` | Tipo | seleção |  |  | próprio |
| spec | `material` | Material principal | seleção |  |  | herdado de `moda-masculina` |
| spec | `ocasiao` | Ocasião | múltipla |  |  | herdado de `moda-masculina` |

### ↳ Fatos e blazers  `moda-masculina-fatos-e-blazers`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `moda-masculina` |
| spec | `tipo_fato` | Tipo | seleção | sim |  | próprio |
| eixo | `tamanho` | Tamanho | seleção | sim |  | herdado de `moda-masculina` |
| spec | `numero_pecas` | Número de peças | número |  |  | próprio |
| spec | `material` | Material principal | seleção |  |  | herdado de `moda-masculina` |
| spec | `ocasiao` | Ocasião | múltipla |  |  | herdado de `moda-masculina` |

### ↳ Roupa esportiva  `moda-masculina-roupa-esportiva`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `moda-masculina` |
| eixo | `tamanho` | Tamanho | seleção | sim |  | herdado de `moda-masculina` |
| spec | `tipo_desporto` | Tipo | seleção |  |  | próprio |
| spec | `material` | Material principal | seleção |  |  | herdado de `moda-masculina` |
| spec | `ocasiao` | Ocasião | múltipla |  |  | herdado de `moda-masculina` |

### ↳ Roupa íntima  `moda-masculina-roupa-intima`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `moda-masculina` |
| spec | `tipo_intima` | Tipo | seleção | sim |  | próprio |
| eixo | `tamanho` | Tamanho | seleção | sim |  | herdado de `moda-masculina` |
| spec | `material` | Material principal | seleção |  |  | substitui o de `moda-masculina` |
| spec | `ocasiao` | Ocasião | múltipla |  |  | herdado de `moda-masculina` |

### ↳ Roupas tradicionais africanas  `moda-masculina-roupas-tradicionais-africanas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `moda-masculina` |
| eixo | `tamanho` | Tamanho | seleção | sim |  | herdado de `moda-masculina` |
| spec | `tipo_traje` | Tipo de traje | seleção |  |  | próprio |
| spec | `material` | Material principal | seleção |  |  | substitui o de `moda-masculina` |
| spec | `ocasiao` | Ocasião | múltipla |  |  | herdado de `moda-masculina` |

### ↳ Uniformes  `moda-masculina-uniformes`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção | sim |  | herdado de `moda-masculina` |
| spec | `tipo_uniforme` | Uso do uniforme | seleção | sim |  | próprio |
| eixo | `tamanho` | Tamanho | seleção | sim |  | herdado de `moda-masculina` |
| spec | `material` | Material principal | seleção |  |  | herdado de `moda-masculina` |
| spec | `ocasiao` | Ocasião | múltipla |  |  | herdado de `moda-masculina` |

## Pet Shop e Animais  `pet-shop-e-animais`

### Pet Shop e Animais (categoria principal — sem produtos próprios)  `pet-shop-e-animais`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `animal` | Para | seleção |  |  | próprio |

### ↳ Acessórios para animais  `pet-shop-e-animais-acessorios-para-animais`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_acessorio_pet` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `animal` | Para | seleção |  |  | herdado de `pet-shop-e-animais` |
| eixo | `tamanho` | Tamanho | seleção |  |  | próprio |

### ↳ Aquários  `pet-shop-e-animais-aquarios`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_aquario` | Tipo | seleção | sim |  | próprio |
| eixo | `capacidade` | Capacidade | seleção |  |  | próprio |

### ↳ Brinquedos para animais  `pet-shop-e-animais-brinquedos-para-animais`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `animal` | Para | seleção |  |  | herdado de `pet-shop-e-animais` |
| spec | `tipo_brinquedo_pet` | Tipo | seleção |  |  | próprio |

### ↳ Camas para animais  `pet-shop-e-animais-camas-para-animais`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `tamanho` | Tamanho | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `animal` | Para | seleção |  |  | herdado de `pet-shop-e-animais` |
| spec | `tipo_cama_pet` | Tipo | seleção |  |  | próprio |

### ↳ Coleiras e guias  `pet-shop-e-animais-coleiras-e-guias`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `tamanho` | Tamanho | seleção | sim |  | próprio |
| spec | `tipo_coleira` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `animal` | Para | seleção |  |  | herdado de `pet-shop-e-animais` |

### ↳ Gaiolas  `pet-shop-e-animais-gaiolas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_gaiola` | Tipo | seleção | sim |  | próprio |
| spec | `animal` | Para | seleção |  |  | substitui o de `pet-shop-e-animais` |
| eixo | `tamanho` | Tamanho | seleção |  |  | próprio |

### ↳ Higiene animal  `pet-shop-e-animais-higiene-animal`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_higiene_pet` | Tipo | seleção | sim |  | próprio |
| spec | `animal` | Para | seleção |  |  | herdado de `pet-shop-e-animais` |
| eixo | `capacidade` | Volume | seleção |  |  | próprio |

### ↳ Rações para cães  `pet-shop-e-animais-racoes-para-caes`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `tamanho` | Embalagem | seleção | sim |  | próprio |
| spec | `porte` | Porte | seleção |  |  | próprio |
| spec | `fase_animal` | Fase | seleção |  |  | próprio |

### ↳ Rações para gatos  `pet-shop-e-animais-racoes-para-gatos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `tamanho` | Embalagem | seleção | sim |  | próprio |
| spec | `fase_animal` | Fase | seleção |  |  | próprio |

## Produtos Tradicionais e Artesanato  `produtos-tradicionais-e-artesanato`

### Produtos Tradicionais e Artesanato (categoria principal — sem produtos próprios)  `produtos-tradicionais-e-artesanato`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `origem_etnia` | Origem/Tradição | seleção |  |  | próprio |
| spec | `feito_a_mao` | Feito à mão | sim/não |  |  | próprio |

### ↳ Artesanato guineense  `produtos-tradicionais-e-artesanato-artesanato-guineense`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_artesanato` | Tipo | seleção | sim |  | próprio |
| spec | `origem_etnia` | Origem/Tradição | seleção |  |  | herdado de `produtos-tradicionais-e-artesanato` |
| spec | `feito_a_mao` | Feito à mão | sim/não |  |  | herdado de `produtos-tradicionais-e-artesanato` |
| spec | `material_artesanato` | Material | seleção |  |  | próprio |

### ↳ Artigos de madeira  `produtos-tradicionais-e-artesanato-artigos-de-madeira`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_madeira` | Tipo | seleção | sim |  | próprio |
| spec | `origem_etnia` | Origem/Tradição | seleção |  |  | herdado de `produtos-tradicionais-e-artesanato` |
| spec | `feito_a_mao` | Feito à mão | sim/não |  |  | herdado de `produtos-tradicionais-e-artesanato` |
| spec | `tipo_madeira_origem` | Madeira | seleção |  |  | próprio |

### ↳ Bijuterias artesanais  `produtos-tradicionais-e-artesanato-bijuterias-artesanais`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_bijuteria` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `origem_etnia` | Origem/Tradição | seleção |  |  | herdado de `produtos-tradicionais-e-artesanato` |
| spec | `feito_a_mao` | Feito à mão | sim/não |  |  | herdado de `produtos-tradicionais-e-artesanato` |
| spec | `material_artesanato` | Material | seleção |  |  | próprio |

### ↳ Cestos e cestaria  `produtos-tradicionais-e-artesanato-cestos-e-cestaria`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `origem_etnia` | Origem/Tradição | seleção |  |  | herdado de `produtos-tradicionais-e-artesanato` |
| eixo | `tamanho` | Tamanho | seleção |  |  | próprio |
| spec | `feito_a_mao` | Feito à mão | sim/não |  |  | herdado de `produtos-tradicionais-e-artesanato` |
| spec | `tipo_cesto` | Tipo | seleção |  |  | próprio |
| spec | `material_artesanato` | Material | seleção |  |  | próprio |

### ↳ Decoração africana  `produtos-tradicionais-e-artesanato-decoracao-africana`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_decoracao_africana` | Tipo | seleção | sim |  | próprio |
| spec | `origem_etnia` | Origem/Tradição | seleção |  |  | herdado de `produtos-tradicionais-e-artesanato` |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `feito_a_mao` | Feito à mão | sim/não |  |  | herdado de `produtos-tradicionais-e-artesanato` |

### ↳ Instrumentos tradicionais  `produtos-tradicionais-e-artesanato-instrumentos-tradicionais`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_instrumento_trad` | Instrumento | seleção | sim |  | próprio |
| spec | `origem_etnia` | Origem/Tradição | seleção |  |  | herdado de `produtos-tradicionais-e-artesanato` |
| spec | `feito_a_mao` | Feito à mão | sim/não |  |  | herdado de `produtos-tradicionais-e-artesanato` |
| spec | `material_artesanato` | Material | seleção |  |  | próprio |

### ↳ Lembranças regionais  `produtos-tradicionais-e-artesanato-lembrancas-regionais`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_lembranca` | Tipo | seleção | sim |  | próprio |
| spec | `origem_etnia` | Origem/Tradição | seleção |  |  | herdado de `produtos-tradicionais-e-artesanato` |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `feito_a_mao` | Feito à mão | sim/não |  |  | herdado de `produtos-tradicionais-e-artesanato` |

### ↳ Panos tradicionais  `produtos-tradicionais-e-artesanato-panos-tradicionais`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_pano` | Tipo | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `origem_etnia` | Origem/Tradição | seleção |  |  | herdado de `produtos-tradicionais-e-artesanato` |
| spec | `feito_a_mao` | Feito à mão | sim/não |  |  | herdado de `produtos-tradicionais-e-artesanato` |
| spec | `tecelagem` | Técnica | seleção |  |  | próprio |

### ↳ Produtos culturais  `produtos-tradicionais-e-artesanato-produtos-culturais`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_cultural` | Tipo | seleção | sim |  | próprio |
| spec | `origem_etnia` | Origem/Tradição | seleção |  |  | herdado de `produtos-tradicionais-e-artesanato` |
| spec | `feito_a_mao` | Feito à mão | sim/não |  |  | herdado de `produtos-tradicionais-e-artesanato` |

### ↳ Tecidos africanos  `produtos-tradicionais-e-artesanato-tecidos-africanos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `tamanho` | Metragem | seleção | sim |  | próprio |
| spec | `tipo_tecido` | Tecido | seleção | sim |  | próprio |
| eixo | `cor` | Cor | seleção |  |  | próprio |
| spec | `origem_etnia` | Origem/Tradição | seleção |  |  | herdado de `produtos-tradicionais-e-artesanato` |
| spec | `feito_a_mao` | Feito à mão | sim/não |  |  | herdado de `produtos-tradicionais-e-artesanato` |

## Saúde e Bem-estar  `saude-e-bem-estar`

### Saúde e Bem-estar (categoria principal — sem produtos próprios)  `saude-e-bem-estar`

_sem atributos_

### ↳ Equipamentos de cuidados pessoais  `saude-e-bem-estar-equipamentos-de-cuidados-pessoais`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_cuidado_pessoal` | Tipo | seleção | sim |  | próprio |
| spec | `alimentacao` | Alimentação | seleção |  |  | próprio |

### ↳ Higiene e prevenção  `saude-e-bem-estar-higiene-e-prevencao`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_prevencao` | Tipo | seleção | sim |  | próprio |
| eixo | `capacidade` | Volume | seleção |  |  | próprio |

### ↳ Máscaras e luvas  `saude-e-bem-estar-mascaras-e-luvas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_protecao` | Tipo | seleção | sim |  | próprio |
| eixo | `tamanho` | Tamanho | seleção |  |  | próprio |
| spec | `unidades_pacote` | Unidades por caixa | número |  |  | próprio |

### ↳ Medidores de pressão  `saude-e-bem-estar-medidores-de-pressao`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_medidor` | Tipo | seleção | sim |  | próprio |
| spec | `alimentacao` | Alimentação | seleção |  |  | próprio |
| spec | `memoria_leituras` | Guarda as medições | sim/não |  |  | próprio |

### ↳ Mobilidade e acessibilidade  `saude-e-bem-estar-mobilidade-e-acessibilidade`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_mobilidade` | Tipo | seleção | sim |  | próprio |
| spec | `carga_max_usuario_kg` | Suporta até | número |  | kg | próprio |
| spec | `dobravel` | Dobrável | sim/não |  |  | próprio |

### ↳ Primeiros socorros  `saude-e-bem-estar-primeiros-socorros`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_primeiros_socorros` | Tipo | seleção | sim |  | próprio |
| spec | `validade_info` | Validade | texto |  |  | próprio |

### ↳ Produtos ortopédicos  `saude-e-bem-estar-produtos-ortopedicos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `tamanho` | Tamanho | seleção | sim |  | próprio |
| spec | `tipo_ortopedico` | Tipo | seleção | sim |  | próprio |
| spec | `lado` | Lado | seleção |  |  | próprio |

### ↳ Termômetros  `saude-e-bem-estar-termometros`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_termometro` | Tipo | seleção | sim |  | próprio |
| spec | `alimentacao` | Alimentação | seleção |  |  | próprio |

## Supermercado e Mercearia  `supermercado-e-mercearia`

### Supermercado e Mercearia (categoria principal — sem produtos próprios)  `supermercado-e-mercearia`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `origem_produto` | Origem | seleção |  |  | próprio |
| spec | `validade_info` | Validade | texto |  |  | próprio |

### ↳ Açúcar e sal  `supermercado-e-mercearia-acucar-e-sal`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `tamanho` | Embalagem | seleção | sim |  | próprio |
| spec | `tipo_acucar_sal` | Tipo | seleção | sim |  | próprio |
| spec | `origem_produto` | Origem | seleção |  |  | herdado de `supermercado-e-mercearia` |
| spec | `validade_info` | Validade | texto |  |  | herdado de `supermercado-e-mercearia` |

### ↳ Arroz e cereais  `supermercado-e-mercearia-arroz-e-cereais`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `tamanho` | Embalagem | seleção | sim |  | próprio |
| spec | `tipo_cereal` | Tipo | seleção | sim |  | próprio |
| spec | `origem_produto` | Origem | seleção |  |  | herdado de `supermercado-e-mercearia` |
| spec | `validade_info` | Validade | texto |  |  | herdado de `supermercado-e-mercearia` |

### ↳ Bolachas e doces  `supermercado-e-mercearia-bolachas-e-doces`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_doce` | Tipo | seleção | sim |  | próprio |
| eixo | `tamanho` | Embalagem | seleção |  |  | próprio |
| spec | `origem_produto` | Origem | seleção |  |  | herdado de `supermercado-e-mercearia` |
| spec | `validade_info` | Validade | texto |  |  | herdado de `supermercado-e-mercearia` |

### ↳ Café, chá e cacau  `supermercado-e-mercearia-cafe-cha-e-cacau`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `tamanho` | Embalagem | seleção | sim |  | próprio |
| spec | `tipo_bebida_quente` | Tipo | seleção | sim |  | próprio |
| spec | `origem_produto` | Origem | seleção |  |  | herdado de `supermercado-e-mercearia` |
| spec | `validade_info` | Validade | texto |  |  | herdado de `supermercado-e-mercearia` |

### ↳ Conservas e enlatados  `supermercado-e-mercearia-conservas-e-enlatados`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_conserva` | Tipo | seleção | sim |  | próprio |
| eixo | `tamanho` | Conteúdo da lata | seleção |  |  | próprio |
| spec | `origem_produto` | Origem | seleção |  |  | herdado de `supermercado-e-mercearia` |
| spec | `validade_info` | Validade | texto |  |  | herdado de `supermercado-e-mercearia` |

### ↳ Farinha e massas  `supermercado-e-mercearia-farinha-e-massas`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `tamanho` | Embalagem | seleção | sim |  | próprio |
| spec | `tipo_farinha` | Tipo | seleção | sim |  | próprio |
| spec | `origem_produto` | Origem | seleção |  |  | herdado de `supermercado-e-mercearia` |
| spec | `validade_info` | Validade | texto |  |  | herdado de `supermercado-e-mercearia` |

### ↳ Leite e derivados  `supermercado-e-mercearia-leite-e-derivados`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `tamanho` | Embalagem | seleção | sim |  | próprio |
| spec | `tipo_leite` | Tipo | seleção | sim |  | próprio |
| spec | `origem_produto` | Origem | seleção |  |  | herdado de `supermercado-e-mercearia` |
| spec | `validade_info` | Validade | texto |  |  | herdado de `supermercado-e-mercearia` |
| spec | `teor_gordura` | Teor de gordura | seleção |  |  | próprio |

### ↳ Óleos alimentares  `supermercado-e-mercearia-oleos-alimentares`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| eixo | `capacidade` | Volume | seleção | sim |  | próprio |
| spec | `tipo_oleo_alimentar` | Tipo | seleção | sim |  | próprio |
| spec | `origem_produto` | Origem | seleção |  |  | herdado de `supermercado-e-mercearia` |
| spec | `validade_info` | Validade | texto |  |  | herdado de `supermercado-e-mercearia` |

### ↳ Produtos de higiene doméstica  `supermercado-e-mercearia-produtos-de-higiene-domestica`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_higiene` | Tipo | seleção | sim |  | próprio |
| eixo | `capacidade` | Quantidade | seleção |  |  | próprio |
| spec | `validade_info` | Validade | texto |  |  | herdado de `supermercado-e-mercearia` |

### ↳ Produtos de limpeza  `supermercado-e-mercearia-produtos-de-limpeza`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_limpeza` | Tipo | seleção | sim |  | próprio |
| eixo | `capacidade` | Volume / peso | seleção |  |  | próprio |
| spec | `validade_info` | Validade | texto |  |  | herdado de `supermercado-e-mercearia` |

### ↳ Temperos e condimentos  `supermercado-e-mercearia-temperos-e-condimentos`

| papel | código | nome | tipo | obrig. | unidade | origem |
|---|---|---|---|---|---|---|
| spec | `tipo_tempero` | Tipo | seleção | sim |  | próprio |
| eixo | `tamanho` | Embalagem | seleção |  |  | próprio |
| spec | `origem_produto` | Origem | seleção |  |  | herdado de `supermercado-e-mercearia` |
| spec | `validade_info` | Validade | texto |  |  | herdado de `supermercado-e-mercearia` |
