# 04 — Herança, overrides e desativações

> Matriz de atributos **v1-2026-10-08** — proposta para revisão (Fase 8A). **Nada foi aplicado em produção.**
> Gerado por `scripts/attribute-matrix/generate.ts` a partir de `src/data/attributeMatrix/`.

## Atributos compartilhados definidos na categoria principal

### Alimentos Frescos e Bebidas  `alimentos-frescos-e-bebidas` — herdado por 11 subcategorias

- `unidade_venda` — Vendido por (seleção, spec)
- `origem_produto` — Origem (seleção, spec)

### Bebês e Crianças  `bebes-e-criancas` — herdado por 10 subcategorias

- `faixa_idade` — Idade recomendada (seleção, spec)

### Beleza e Cuidados Pessoais  `beleza-e-cuidados-pessoais` — herdado por 10 subcategorias

- `publico_alvo` — Público (seleção, spec)
- `validade_info` — Validade (se aplicável) (texto, spec)

### Bolsas, Malas e Acessórios  `bolsas-malas-e-acessorios` — herdado por 10 subcategorias

- `cor` — Cor (seleção, eixo, obrigatório)
- `material` — Material (seleção, spec)

### Brinquedos e Jogos  `brinquedos-e-jogos` — herdado por 10 subcategorias

- `faixa_idade` — Idade recomendada (seleção, spec, obrigatório)
- `alimentacao` — Funciona com (seleção, spec)

### Calçados  `calcados` — herdado por 9 subcategorias

- `cor` — Cor (seleção, eixo, obrigatório)
- `tamanho` — Numeração (seleção, eixo, obrigatório)
- `material_cabedal` — Material do cabedal (seleção, spec)
- `tipo_solado` — Solado (seleção, spec)

### Casa, Móveis e Decoração  `casa-moveis-e-decoracao` — herdado por 11 subcategorias

- `cor` — Cor (seleção, eixo)

### Cozinha e Utilidades Domésticas  `cozinha-e-utilidades-domesticas` — herdado por 9 subcategorias

- `cor` — Cor (seleção, eixo)
- `material_utensilio` — Material (seleção, spec)

### Eletrodomésticos  `eletrodomesticos` — herdado por 11 subcategorias

- `cor` — Cor (seleção, eixo)
- `voltagem` — Voltagem (seleção, eixo)
- `potencia_w` — Potência (número, spec)

### Festas e Eventos  `festas-e-eventos` — herdado por 10 subcategorias

- `cor` — Cor (seleção, eixo)

### Moda Feminina  `moda-feminina` — herdado por 10 subcategorias

- `cor` — Cor (seleção, eixo, obrigatório)
- `tamanho` — Tamanho (seleção, eixo, obrigatório)
- `material` — Material principal (seleção, spec)
- `ocasiao` — Ocasião (múltipla, spec)

### Moda Masculina  `moda-masculina` — herdado por 10 subcategorias

- `cor` — Cor (seleção, eixo, obrigatório)
- `tamanho` — Tamanho (seleção, eixo, obrigatório)
- `material` — Material principal (seleção, spec)
- `ocasiao` — Ocasião (múltipla, spec)

### Pet Shop e Animais  `pet-shop-e-animais` — herdado por 9 subcategorias

- `animal` — Para (seleção, spec)

### Produtos Tradicionais e Artesanato  `produtos-tradicionais-e-artesanato` — herdado por 10 subcategorias

- `origem_etnia` — Origem/Tradição (seleção, spec)
- `feito_a_mao` — Feito à mão (sim/não, spec)

### Supermercado e Mercearia  `supermercado-e-mercearia` — herdado por 11 subcategorias

- `origem_produto` — Origem (seleção, spec)
- `validade_info` — Validade (texto, spec)

## Overrides (substituição explícita do herdado)

| Categoria | Código | O que muda | Motivo |
|---|---|---|---|
| `moda-feminina-roupas-tradicionais-africanas` | `material` | {"options":["Bazin","Wax (tecido africano)","Capulana","Pano de pinti","Algodão","Seda","Misto"]} | Override do material do root com tecidos africanos (Bazin, Wax, Capulana, Pano de pinti). |
| `moda-feminina-roupas-intimas` | `material` | {"options":["Algodão","Poliéster","Renda","Seda","Malha","Misto"]} |  |
| `moda-masculina-roupas-tradicionais-africanas` | `material` | {"options":["Bazin","Wax (tecido africano)","Capulana","Pano de pinti","Algodão","Seda","Misto"]} |  |
| `moda-masculina-roupa-intima` | `material` | {"options":["Algodão","Poliéster","Malha","Misto"]} |  |
| `calcados-calcados-infantis` | `tamanho` | {"options":["17","18","19","20","21","22","23","24","25","26","27","28","29","30","31","32","33","34","35","36"]} | Override da numeração: números infantis (17-34) em vez dos adultos. |
| `bolsas-malas-e-acessorios-joias-e-bijuterias` | `material` | {"options":["Ouro","Prata","Aço inoxidável","Folheado a ouro","Bijuteria (metal)","Pérolas","Contas/missangas","Outro"]} |  |
| `pet-shop-e-animais-gaiolas` | `animal` | {"options":["Aves","Roedores","Vários"]} |  |

## Desativações (atributo herdado que NÃO se aplica à subcategoria)

| Categoria | Códigos desativados |
|---|---|
| `eletrodomesticos-pecas-e-acessorios` | `voltagem`, `potencia_w` |
| `calcados-acessorios-para-calcados` | `tamanho`, `material_cabedal`, `tipo_solado` |
| `bolsas-malas-e-acessorios-acessorios-de-cabelo` | `material` |
| `beleza-e-cuidados-pessoais-equipamentos-de-salao` | `publico_alvo`, `validade_info` |
| `cozinha-e-utilidades-domesticas-utensilios-de-limpeza` | `material_utensilio` |
| `supermercado-e-mercearia-produtos-de-limpeza` | `origem_produto` |
| `supermercado-e-mercearia-produtos-de-higiene-domestica` | `origem_produto` |
| `alimentos-frescos-e-bebidas-agua-mineral` | `unidade_venda`, `origem_produto` |
| `alimentos-frescos-e-bebidas-sumos-e-refrigerantes` | `unidade_venda`, `origem_produto` |
| `alimentos-frescos-e-bebidas-bebidas-nao-alcoolicas` | `unidade_venda`, `origem_produto` |
| `bebes-e-criancas-roupas-para-bebes` | `faixa_idade` |
| `bebes-e-criancas-fraldas` | `faixa_idade` |
| `bebes-e-criancas-alimentacao-infantil` | `faixa_idade` |
| `bebes-e-criancas-acessorios-para-maternidade` | `faixa_idade` |
| `brinquedos-e-jogos-bonecas` | `alimentacao` |
| `brinquedos-e-jogos-brinquedos-educativos` | `alimentacao` |
| `brinquedos-e-jogos-jogos-de-tabuleiro` | `alimentacao` |
| `brinquedos-e-jogos-quebra-cabecas` | `alimentacao` |
| `brinquedos-e-jogos-bicicletas-infantis` | `alimentacao` |
| `brinquedos-e-jogos-pelucias` | `alimentacao` |
| `brinquedos-e-jogos-brinquedos-de-exterior` | `alimentacao` |
| `brinquedos-e-jogos-jogos-tradicionais` | `alimentacao` |
| `pet-shop-e-animais-racoes-para-caes` | `animal` |
| `pet-shop-e-animais-racoes-para-gatos` | `animal` |
| `pet-shop-e-animais-aquarios` | `animal` |
| `festas-e-eventos-equipamentos-de-som` | `cor` |
| `festas-e-eventos-iluminacao-para-eventos` | `cor` |

## Resultado da verificação de conflitos

- Conflitos de herança (código herdado redefinido sem override): **0**
- Conflitos com descendentes: **0**
- Overrides/desativações inválidos: **0**
- Códigos repetidos na mesma categoria: **0**
- Códigos com tipo/unidade/função inconsistentes entre categorias: **0**
- Nomes repetidos no mesmo caminho: **0**
