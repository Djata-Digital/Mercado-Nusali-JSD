# 01 — Inventário das categorias reais (produção, somente leitura)

> Matriz de atributos **v2-2026-10-08** — proposta para revisão (Fases 8A/8B). **Nada foi aplicado em produção.**
> Gerado por `scripts/attribute-matrix/generate.ts` a partir de `src/data/attributeMatrix/`.

Lido em **2026-10-08T23:03:56.292Z** (banco "postgres", 38 migrações). Produção tem **0 produtos**, **0 definições de atributo**, **0 valores**, **0 marcas**.

| Total | Principais | Subcategorias | Inativas | Profundidade máxima |
|---|---|---|---|---|
| 322 | 30 | 292 | 0 | 1 |

**Verificações estruturais:** sem órfãs, sem ciclos, sem slugs repetidos, todas as ids no padrão `cat_nsl_<slug>`, subcategoria com slug `<principal>-<sub>`. Comissão por categoria: **nenhuma configurada** (todas NULL).

## Nomes iguais em categorias diferentes (ambiguidade)

Não são erros (o caminho completo os distingue, e os slugs são únicos), mas o comprador pode confundir:

- Esportes e Fitness › Roupas esportivas  |  Moda Feminina › Roupas esportivas
- Instrumentos Musicais › Instrumentos tradicionais  |  Produtos Tradicionais e Artesanato › Instrumentos tradicionais
- Moda Feminina › Calças  |  Moda Masculina › Calças
- Moda Feminina › Roupas tradicionais africanas  |  Moda Masculina › Roupas tradicionais africanas
- Moda Feminina › Casacos  |  Moda Masculina › Casacos

Observações de nomenclatura (sem alterar nada): *Moda Feminina › Roupas íntimas* × *Moda Masculina › Roupa íntima*; *Roupas esportivas* × *Roupa esportiva*; *Roupas esportivas* existe em Moda Feminina **e** em Esportes e Fitness; *Instrumentos tradicionais* existe em Instrumentos Musicais **e** em Produtos Tradicionais.

## Árvore completa

### Agricultura e Pecuária  `agricultura-e-pecuaria` — 10 subcategorias

| # | Subcategoria | slug | id |
|---|---|---|---|
| 1 | Armazenamento agrícola | `agricultura-e-pecuaria-armazenamento-agricola` | `cat_nsl_agricultura-e-pecuaria-armazenamento-agricola` |
| 2 | Equipamentos de pecuária | `agricultura-e-pecuaria-equipamentos-de-pecuaria` | `cat_nsl_agricultura-e-pecuaria-equipamentos-de-pecuaria` |
| 3 | Equipamentos para pesca | `agricultura-e-pecuaria-equipamentos-para-pesca` | `cat_nsl_agricultura-e-pecuaria-equipamentos-para-pesca` |
| 4 | Ferramentas agrícolas | `agricultura-e-pecuaria-ferramentas-agricolas` | `cat_nsl_agricultura-e-pecuaria-ferramentas-agricolas` |
| 5 | Fertilizantes | `agricultura-e-pecuaria-fertilizantes` | `cat_nsl_agricultura-e-pecuaria-fertilizantes` |
| 6 | Irrigação | `agricultura-e-pecuaria-irrigacao` | `cat_nsl_agricultura-e-pecuaria-irrigacao` |
| 7 | Máquinas agrícolas | `agricultura-e-pecuaria-maquinas-agricolas` | `cat_nsl_agricultura-e-pecuaria-maquinas-agricolas` |
| 8 | Produtos para horticultura | `agricultura-e-pecuaria-produtos-para-horticultura` | `cat_nsl_agricultura-e-pecuaria-produtos-para-horticultura` |
| 9 | Rações animais | `agricultura-e-pecuaria-racoes-animais` | `cat_nsl_agricultura-e-pecuaria-racoes-animais` |
| 10 | Sementes | `agricultura-e-pecuaria-sementes` | `cat_nsl_agricultura-e-pecuaria-sementes` |

### Alimentos Frescos e Bebidas  `alimentos-frescos-e-bebidas` — 11 subcategorias

| # | Subcategoria | slug | id |
|---|---|---|---|
| 1 | Água mineral | `alimentos-frescos-e-bebidas-agua-mineral` | `cat_nsl_alimentos-frescos-e-bebidas-agua-mineral` |
| 2 | Bebidas não alcoólicas | `alimentos-frescos-e-bebidas-bebidas-nao-alcoolicas` | `cat_nsl_alimentos-frescos-e-bebidas-bebidas-nao-alcoolicas` |
| 3 | Carnes | `alimentos-frescos-e-bebidas-carnes` | `cat_nsl_alimentos-frescos-e-bebidas-carnes` |
| 4 | Frutas | `alimentos-frescos-e-bebidas-frutas` | `cat_nsl_alimentos-frescos-e-bebidas-frutas` |
| 5 | Legumes e verduras | `alimentos-frescos-e-bebidas-legumes-e-verduras` | `cat_nsl_alimentos-frescos-e-bebidas-legumes-e-verduras` |
| 6 | Ovos | `alimentos-frescos-e-bebidas-ovos` | `cat_nsl_alimentos-frescos-e-bebidas-ovos` |
| 7 | Peixes e mariscos | `alimentos-frescos-e-bebidas-peixes-e-mariscos` | `cat_nsl_alimentos-frescos-e-bebidas-peixes-e-mariscos` |
| 8 | Produtos alimentares locais | `alimentos-frescos-e-bebidas-produtos-alimentares-locais` | `cat_nsl_alimentos-frescos-e-bebidas-produtos-alimentares-locais` |
| 9 | Produtos congelados | `alimentos-frescos-e-bebidas-produtos-congelados` | `cat_nsl_alimentos-frescos-e-bebidas-produtos-congelados` |
| 10 | Sumos e refrigerantes | `alimentos-frescos-e-bebidas-sumos-e-refrigerantes` | `cat_nsl_alimentos-frescos-e-bebidas-sumos-e-refrigerantes` |
| 11 | Tubérculos | `alimentos-frescos-e-bebidas-tuberculos` | `cat_nsl_alimentos-frescos-e-bebidas-tuberculos` |

### Automóveis, Motos e Peças  `automoveis-motos-e-pecas` — 10 subcategorias

| # | Subcategoria | slug | id |
|---|---|---|---|
| 1 | Acessórios automotivos | `automoveis-motos-e-pecas-acessorios-automotivos` | `cat_nsl_automoveis-motos-e-pecas-acessorios-automotivos` |
| 2 | Baterias automotivas | `automoveis-motos-e-pecas-baterias-automotivas` | `cat_nsl_automoveis-motos-e-pecas-baterias-automotivas` |
| 3 | Capacetes | `automoveis-motos-e-pecas-capacetes` | `cat_nsl_automoveis-motos-e-pecas-capacetes` |
| 4 | Ferramentas automotivas | `automoveis-motos-e-pecas-ferramentas-automotivas` | `cat_nsl_automoveis-motos-e-pecas-ferramentas-automotivas` |
| 5 | Óleos e lubrificantes | `automoveis-motos-e-pecas-oleos-e-lubrificantes` | `cat_nsl_automoveis-motos-e-pecas-oleos-e-lubrificantes` |
| 6 | Peças de automóveis | `automoveis-motos-e-pecas-pecas-de-automoveis` | `cat_nsl_automoveis-motos-e-pecas-pecas-de-automoveis` |
| 7 | Peças de motocicletas | `automoveis-motos-e-pecas-pecas-de-motocicletas` | `cat_nsl_automoveis-motos-e-pecas-pecas-de-motocicletas` |
| 8 | Pneus | `automoveis-motos-e-pecas-pneus` | `cat_nsl_automoveis-motos-e-pecas-pneus` |
| 9 | Produtos de limpeza automotiva | `automoveis-motos-e-pecas-produtos-de-limpeza-automotiva` | `cat_nsl_automoveis-motos-e-pecas-produtos-de-limpeza-automotiva` |
| 10 | Som automotivo | `automoveis-motos-e-pecas-som-automotivo` | `cat_nsl_automoveis-motos-e-pecas-som-automotivo` |

### Bebês e Crianças  `bebes-e-criancas` — 10 subcategorias

| # | Subcategoria | slug | id |
|---|---|---|---|
| 1 | Acessórios para maternidade | `bebes-e-criancas-acessorios-para-maternidade` | `cat_nsl_bebes-e-criancas-acessorios-para-maternidade` |
| 2 | Alimentação infantil | `bebes-e-criancas-alimentacao-infantil` | `cat_nsl_bebes-e-criancas-alimentacao-infantil` |
| 3 | Berços | `bebes-e-criancas-bercos` | `cat_nsl_bebes-e-criancas-bercos` |
| 4 | Cadeiras infantis | `bebes-e-criancas-cadeiras-infantis` | `cat_nsl_bebes-e-criancas-cadeiras-infantis` |
| 5 | Carrinhos de bebê | `bebes-e-criancas-carrinhos-de-bebe` | `cat_nsl_bebes-e-criancas-carrinhos-de-bebe` |
| 6 | Fraldas | `bebes-e-criancas-fraldas` | `cat_nsl_bebes-e-criancas-fraldas` |
| 7 | Mamadeiras | `bebes-e-criancas-mamadeiras` | `cat_nsl_bebes-e-criancas-mamadeiras` |
| 8 | Produtos de higiene infantil | `bebes-e-criancas-produtos-de-higiene-infantil` | `cat_nsl_bebes-e-criancas-produtos-de-higiene-infantil` |
| 9 | Roupas para bebês | `bebes-e-criancas-roupas-para-bebes` | `cat_nsl_bebes-e-criancas-roupas-para-bebes` |
| 10 | Segurança infantil | `bebes-e-criancas-seguranca-infantil` | `cat_nsl_bebes-e-criancas-seguranca-infantil` |

### Beleza e Cuidados Pessoais  `beleza-e-cuidados-pessoais` — 10 subcategorias

| # | Subcategoria | slug | id |
|---|---|---|---|
| 1 | Barbearia | `beleza-e-cuidados-pessoais-barbearia` | `cat_nsl_beleza-e-cuidados-pessoais-barbearia` |
| 2 | Cabelos e extensões | `beleza-e-cuidados-pessoais-cabelos-e-extensoes` | `cat_nsl_beleza-e-cuidados-pessoais-cabelos-e-extensoes` |
| 3 | Cuidados com a pele | `beleza-e-cuidados-pessoais-cuidados-com-a-pele` | `cat_nsl_beleza-e-cuidados-pessoais-cuidados-com-a-pele` |
| 4 | Equipamentos de salão | `beleza-e-cuidados-pessoais-equipamentos-de-salao` | `cat_nsl_beleza-e-cuidados-pessoais-equipamentos-de-salao` |
| 5 | Higiene pessoal | `beleza-e-cuidados-pessoais-higiene-pessoal` | `cat_nsl_beleza-e-cuidados-pessoais-higiene-pessoal` |
| 6 | Manicure e pedicure | `beleza-e-cuidados-pessoais-manicure-e-pedicure` | `cat_nsl_beleza-e-cuidados-pessoais-manicure-e-pedicure` |
| 7 | Maquiagem | `beleza-e-cuidados-pessoais-maquiagem` | `cat_nsl_beleza-e-cuidados-pessoais-maquiagem` |
| 8 | Perfumes | `beleza-e-cuidados-pessoais-perfumes` | `cat_nsl_beleza-e-cuidados-pessoais-perfumes` |
| 9 | Perucas | `beleza-e-cuidados-pessoais-perucas` | `cat_nsl_beleza-e-cuidados-pessoais-perucas` |
| 10 | Produtos capilares | `beleza-e-cuidados-pessoais-produtos-capilares` | `cat_nsl_beleza-e-cuidados-pessoais-produtos-capilares` |

### Bolsas, Malas e Acessórios  `bolsas-malas-e-acessorios` — 10 subcategorias

| # | Subcategoria | slug | id |
|---|---|---|---|
| 1 | Acessórios de cabelo | `bolsas-malas-e-acessorios-acessorios-de-cabelo` | `cat_nsl_bolsas-malas-e-acessorios-acessorios-de-cabelo` |
| 2 | Bolsas femininas | `bolsas-malas-e-acessorios-bolsas-femininas` | `cat_nsl_bolsas-malas-e-acessorios-bolsas-femininas` |
| 3 | Bonés e chapéus | `bolsas-malas-e-acessorios-bones-e-chapeus` | `cat_nsl_bolsas-malas-e-acessorios-bones-e-chapeus` |
| 4 | Carteiras | `bolsas-malas-e-acessorios-carteiras` | `cat_nsl_bolsas-malas-e-acessorios-carteiras` |
| 5 | Cintos | `bolsas-malas-e-acessorios-cintos` | `cat_nsl_bolsas-malas-e-acessorios-cintos` |
| 6 | Joias e bijuterias | `bolsas-malas-e-acessorios-joias-e-bijuterias` | `cat_nsl_bolsas-malas-e-acessorios-joias-e-bijuterias` |
| 7 | Malas de viagem | `bolsas-malas-e-acessorios-malas-de-viagem` | `cat_nsl_bolsas-malas-e-acessorios-malas-de-viagem` |
| 8 | Mochilas | `bolsas-malas-e-acessorios-mochilas` | `cat_nsl_bolsas-malas-e-acessorios-mochilas` |
| 9 | Óculos de sol | `bolsas-malas-e-acessorios-oculos-de-sol` | `cat_nsl_bolsas-malas-e-acessorios-oculos-de-sol` |
| 10 | Relógios | `bolsas-malas-e-acessorios-relogios` | `cat_nsl_bolsas-malas-e-acessorios-relogios` |

### Brinquedos e Jogos  `brinquedos-e-jogos` — 10 subcategorias

| # | Subcategoria | slug | id |
|---|---|---|---|
| 1 | Bicicletas infantis | `brinquedos-e-jogos-bicicletas-infantis` | `cat_nsl_brinquedos-e-jogos-bicicletas-infantis` |
| 2 | Bonecas | `brinquedos-e-jogos-bonecas` | `cat_nsl_brinquedos-e-jogos-bonecas` |
| 3 | Brinquedos de exterior | `brinquedos-e-jogos-brinquedos-de-exterior` | `cat_nsl_brinquedos-e-jogos-brinquedos-de-exterior` |
| 4 | Brinquedos educativos | `brinquedos-e-jogos-brinquedos-educativos` | `cat_nsl_brinquedos-e-jogos-brinquedos-educativos` |
| 5 | Brinquedos eletrônicos | `brinquedos-e-jogos-brinquedos-eletronicos` | `cat_nsl_brinquedos-e-jogos-brinquedos-eletronicos` |
| 6 | Carrinhos de brinquedo | `brinquedos-e-jogos-carrinhos-de-brinquedo` | `cat_nsl_brinquedos-e-jogos-carrinhos-de-brinquedo` |
| 7 | Jogos de tabuleiro | `brinquedos-e-jogos-jogos-de-tabuleiro` | `cat_nsl_brinquedos-e-jogos-jogos-de-tabuleiro` |
| 8 | Jogos tradicionais | `brinquedos-e-jogos-jogos-tradicionais` | `cat_nsl_brinquedos-e-jogos-jogos-tradicionais` |
| 9 | Pelúcias | `brinquedos-e-jogos-pelucias` | `cat_nsl_brinquedos-e-jogos-pelucias` |
| 10 | Quebra-cabeças | `brinquedos-e-jogos-quebra-cabecas` | `cat_nsl_brinquedos-e-jogos-quebra-cabecas` |

### Calçados  `calcados` — 9 subcategorias

| # | Subcategoria | slug | id |
|---|---|---|---|
| 1 | Acessórios para calçados | `calcados-acessorios-para-calcados` | `cat_nsl_calcados-acessorios-para-calcados` |
| 2 | Botas | `calcados-botas` | `cat_nsl_calcados-botas` |
| 3 | Calçados de segurança | `calcados-calcados-de-seguranca` | `cat_nsl_calcados-calcados-de-seguranca` |
| 4 | Calçados infantis | `calcados-calcados-infantis` | `cat_nsl_calcados-calcados-infantis` |
| 5 | Chinelos | `calcados-chinelos` | `cat_nsl_calcados-chinelos` |
| 6 | Sandálias | `calcados-sandalias` | `cat_nsl_calcados-sandalias` |
| 7 | Sapatos femininos | `calcados-sapatos-femininos` | `cat_nsl_calcados-sapatos-femininos` |
| 8 | Sapatos masculinos | `calcados-sapatos-masculinos` | `cat_nsl_calcados-sapatos-masculinos` |
| 9 | Tênis | `calcados-tenis` | `cat_nsl_calcados-tenis` |

### Casa, Móveis e Decoração  `casa-moveis-e-decoracao` — 11 subcategorias

| # | Subcategoria | slug | id |
|---|---|---|---|
| 1 | Artigos para banheiro | `casa-moveis-e-decoracao-artigos-para-banheiro` | `cat_nsl_casa-moveis-e-decoracao-artigos-para-banheiro` |
| 2 | Camas e colchões | `casa-moveis-e-decoracao-camas-e-colchoes` | `cat_nsl_casa-moveis-e-decoracao-camas-e-colchoes` |
| 3 | Decoração | `casa-moveis-e-decoracao-decoracao` | `cat_nsl_casa-moveis-e-decoracao-decoracao` |
| 4 | Estantes e armários | `casa-moveis-e-decoracao-estantes-e-armarios` | `cat_nsl_casa-moveis-e-decoracao-estantes-e-armarios` |
| 5 | Guarda-roupas | `casa-moveis-e-decoracao-guarda-roupas` | `cat_nsl_casa-moveis-e-decoracao-guarda-roupas` |
| 6 | Iluminação | `casa-moveis-e-decoracao-iluminacao` | `cat_nsl_casa-moveis-e-decoracao-iluminacao` |
| 7 | Mesas e cadeiras | `casa-moveis-e-decoracao-mesas-e-cadeiras` | `cat_nsl_casa-moveis-e-decoracao-mesas-e-cadeiras` |
| 8 | Móveis de escritório | `casa-moveis-e-decoracao-moveis-de-escritorio` | `cat_nsl_casa-moveis-e-decoracao-moveis-de-escritorio` |
| 9 | Organização doméstica | `casa-moveis-e-decoracao-organizacao-domestica` | `cat_nsl_casa-moveis-e-decoracao-organizacao-domestica` |
| 10 | Sofás e poltronas | `casa-moveis-e-decoracao-sofas-e-poltronas` | `cat_nsl_casa-moveis-e-decoracao-sofas-e-poltronas` |
| 11 | Tapetes e cortinas | `casa-moveis-e-decoracao-tapetes-e-cortinas` | `cat_nsl_casa-moveis-e-decoracao-tapetes-e-cortinas` |

### Celulares e Telefones  `celulares-e-telefones` — 9 subcategorias

| # | Subcategoria | slug | id |
|---|---|---|---|
| 1 | Acessórios para celulares | `celulares-e-telefones-acessorios-para-celulares` | `cat_nsl_celulares-e-telefones-acessorios-para-celulares` |
| 2 | Baterias e peças | `celulares-e-telefones-baterias-e-pecas` | `cat_nsl_celulares-e-telefones-baterias-e-pecas` |
| 3 | Capas e películas | `celulares-e-telefones-capas-e-peliculas` | `cat_nsl_celulares-e-telefones-capas-e-peliculas` |
| 4 | Carregadores e cabos | `celulares-e-telefones-carregadores-e-cabos` | `cat_nsl_celulares-e-telefones-carregadores-e-cabos` |
| 5 | Celulares básicos | `celulares-e-telefones-celulares-basicos` | `cat_nsl_celulares-e-telefones-celulares-basicos` |
| 6 | Rádios comunicadores | `celulares-e-telefones-radios-comunicadores` | `cat_nsl_celulares-e-telefones-radios-comunicadores` |
| 7 | Smartphones | `celulares-e-telefones-smartphones` | `cat_nsl_celulares-e-telefones-smartphones` |
| 8 | Smartwatches | `celulares-e-telefones-smartwatches` | `cat_nsl_celulares-e-telefones-smartwatches` |
| 9 | Telefones fixos | `celulares-e-telefones-telefones-fixos` | `cat_nsl_celulares-e-telefones-telefones-fixos` |

### Construção e Materiais  `construcao-e-materiais` — 11 subcategorias

| # | Subcategoria | slug | id |
|---|---|---|---|
| 1 | Areia e brita | `construcao-e-materiais-areia-e-brita` | `cat_nsl_construcao-e-materiais-areia-e-brita` |
| 2 | Blocos e tijolos | `construcao-e-materiais-blocos-e-tijolos` | `cat_nsl_construcao-e-materiais-blocos-e-tijolos` |
| 3 | Canalização e hidráulica | `construcao-e-materiais-canalizacao-e-hidraulica` | `cat_nsl_construcao-e-materiais-canalizacao-e-hidraulica` |
| 4 | Cimento e argamassa | `construcao-e-materiais-cimento-e-argamassa` | `cat_nsl_construcao-e-materiais-cimento-e-argamassa` |
| 5 | Ferro e aço | `construcao-e-materiais-ferro-e-aco` | `cat_nsl_construcao-e-materiais-ferro-e-aco` |
| 6 | Louças sanitárias | `construcao-e-materiais-loucas-sanitarias` | `cat_nsl_construcao-e-materiais-loucas-sanitarias` |
| 7 | Materiais elétricos | `construcao-e-materiais-materiais-eletricos` | `cat_nsl_construcao-e-materiais-materiais-eletricos` |
| 8 | Pisos e revestimentos | `construcao-e-materiais-pisos-e-revestimentos` | `cat_nsl_construcao-e-materiais-pisos-e-revestimentos` |
| 9 | Portas e janelas | `construcao-e-materiais-portas-e-janelas` | `cat_nsl_construcao-e-materiais-portas-e-janelas` |
| 10 | Telhas e coberturas | `construcao-e-materiais-telhas-e-coberturas` | `cat_nsl_construcao-e-materiais-telhas-e-coberturas` |
| 11 | Tintas e vernizes | `construcao-e-materiais-tintas-e-vernizes` | `cat_nsl_construcao-e-materiais-tintas-e-vernizes` |

### Cozinha e Utilidades Domésticas  `cozinha-e-utilidades-domesticas` — 9 subcategorias

| # | Subcategoria | slug | id |
|---|---|---|---|
| 1 | Acessórios de cozinha | `cozinha-e-utilidades-domesticas-acessorios-de-cozinha` | `cat_nsl_cozinha-e-utilidades-domesticas-acessorios-de-cozinha` |
| 2 | Copos e canecas | `cozinha-e-utilidades-domesticas-copos-e-canecas` | `cat_nsl_cozinha-e-utilidades-domesticas-copos-e-canecas` |
| 3 | Facas e utensílios | `cozinha-e-utilidades-domesticas-facas-e-utensilios` | `cat_nsl_cozinha-e-utilidades-domesticas-facas-e-utensilios` |
| 4 | Garrafas térmicas | `cozinha-e-utilidades-domesticas-garrafas-termicas` | `cat_nsl_cozinha-e-utilidades-domesticas-garrafas-termicas` |
| 5 | Panelas | `cozinha-e-utilidades-domesticas-panelas` | `cat_nsl_cozinha-e-utilidades-domesticas-panelas` |
| 6 | Pratos e tigelas | `cozinha-e-utilidades-domesticas-pratos-e-tigelas` | `cat_nsl_cozinha-e-utilidades-domesticas-pratos-e-tigelas` |
| 7 | Recipientes e conservação | `cozinha-e-utilidades-domesticas-recipientes-e-conservacao` | `cat_nsl_cozinha-e-utilidades-domesticas-recipientes-e-conservacao` |
| 8 | Talheres | `cozinha-e-utilidades-domesticas-talheres` | `cat_nsl_cozinha-e-utilidades-domesticas-talheres` |
| 9 | Utensílios de limpeza | `cozinha-e-utilidades-domesticas-utensilios-de-limpeza` | `cat_nsl_cozinha-e-utilidades-domesticas-utensilios-de-limpeza` |

### Eletrodomésticos  `eletrodomesticos` — 11 subcategorias

| # | Subcategoria | slug | id |
|---|---|---|---|
| 1 | Ar-condicionado | `eletrodomesticos-ar-condicionado` | `cat_nsl_eletrodomesticos-ar-condicionado` |
| 2 | Congeladores e arcas | `eletrodomesticos-congeladores-e-arcas` | `cat_nsl_eletrodomesticos-congeladores-e-arcas` |
| 3 | Ferros de passar | `eletrodomesticos-ferros-de-passar` | `cat_nsl_eletrodomesticos-ferros-de-passar` |
| 4 | Fogões e fornos | `eletrodomesticos-fogoes-e-fornos` | `cat_nsl_eletrodomesticos-fogoes-e-fornos` |
| 5 | Geladeiras e frigoríficos | `eletrodomesticos-geladeiras-e-frigorificos` | `cat_nsl_eletrodomesticos-geladeiras-e-frigorificos` |
| 6 | Liquidificadores | `eletrodomesticos-liquidificadores` | `cat_nsl_eletrodomesticos-liquidificadores` |
| 7 | Máquinas de lavar | `eletrodomesticos-maquinas-de-lavar` | `cat_nsl_eletrodomesticos-maquinas-de-lavar` |
| 8 | Micro-ondas | `eletrodomesticos-micro-ondas` | `cat_nsl_eletrodomesticos-micro-ondas` |
| 9 | Peças e acessórios | `eletrodomesticos-pecas-e-acessorios` | `cat_nsl_eletrodomesticos-pecas-e-acessorios` |
| 10 | Pequenos eletrodomésticos | `eletrodomesticos-pequenos-eletrodomesticos` | `cat_nsl_eletrodomesticos-pequenos-eletrodomesticos` |
| 11 | Ventiladores | `eletrodomesticos-ventiladores` | `cat_nsl_eletrodomesticos-ventiladores` |

### Eletrônicos, TV e Áudio  `eletronicos-tv-e-audio` — 10 subcategorias

| # | Subcategoria | slug | id |
|---|---|---|---|
| 1 | Acessórios de áudio e vídeo | `eletronicos-tv-e-audio-acessorios-de-audio-e-video` | `cat_nsl_eletronicos-tv-e-audio-acessorios-de-audio-e-video` |
| 2 | Caixas de som | `eletronicos-tv-e-audio-caixas-de-som` | `cat_nsl_eletronicos-tv-e-audio-caixas-de-som` |
| 3 | Câmeras de segurança | `eletronicos-tv-e-audio-cameras-de-seguranca` | `cat_nsl_eletronicos-tv-e-audio-cameras-de-seguranca` |
| 4 | Câmeras digitais | `eletronicos-tv-e-audio-cameras-digitais` | `cat_nsl_eletronicos-tv-e-audio-cameras-digitais` |
| 5 | Controles remotos | `eletronicos-tv-e-audio-controles-remotos` | `cat_nsl_eletronicos-tv-e-audio-controles-remotos` |
| 6 | Drones | `eletronicos-tv-e-audio-drones` | `cat_nsl_eletronicos-tv-e-audio-drones` |
| 7 | Fones de ouvido | `eletronicos-tv-e-audio-fones-de-ouvido` | `cat_nsl_eletronicos-tv-e-audio-fones-de-ouvido` |
| 8 | Home theater | `eletronicos-tv-e-audio-home-theater` | `cat_nsl_eletronicos-tv-e-audio-home-theater` |
| 9 | Projetores | `eletronicos-tv-e-audio-projetores` | `cat_nsl_eletronicos-tv-e-audio-projetores` |
| 10 | Televisores | `eletronicos-tv-e-audio-televisores` | `cat_nsl_eletronicos-tv-e-audio-televisores` |

### Energia Solar e Eletricidade  `energia-solar-e-eletricidade` — 9 subcategorias

| # | Subcategoria | slug | id |
|---|---|---|---|
| 1 | Baterias solares | `energia-solar-e-eletricidade-baterias-solares` | `cat_nsl_energia-solar-e-eletricidade-baterias-solares` |
| 2 | Cabos e conectores | `energia-solar-e-eletricidade-cabos-e-conectores` | `cat_nsl_energia-solar-e-eletricidade-cabos-e-conectores` |
| 3 | Controladores de carga | `energia-solar-e-eletricidade-controladores-de-carga` | `cat_nsl_energia-solar-e-eletricidade-controladores-de-carga` |
| 4 | Estabilizadores e UPS | `energia-solar-e-eletricidade-estabilizadores-e-ups` | `cat_nsl_energia-solar-e-eletricidade-estabilizadores-e-ups` |
| 5 | Inversores | `energia-solar-e-eletricidade-inversores` | `cat_nsl_energia-solar-e-eletricidade-inversores` |
| 6 | Kits solares | `energia-solar-e-eletricidade-kits-solares` | `cat_nsl_energia-solar-e-eletricidade-kits-solares` |
| 7 | Lâmpadas solares | `energia-solar-e-eletricidade-lampadas-solares` | `cat_nsl_energia-solar-e-eletricidade-lampadas-solares` |
| 8 | Painéis solares | `energia-solar-e-eletricidade-paineis-solares` | `cat_nsl_energia-solar-e-eletricidade-paineis-solares` |
| 9 | Sistemas de energia de emergência | `energia-solar-e-eletricidade-sistemas-de-energia-de-emergencia` | `cat_nsl_energia-solar-e-eletricidade-sistemas-de-energia-de-emergencia` |

### Esportes e Fitness  `esportes-e-fitness` — 10 subcategorias

| # | Subcategoria | slug | id |
|---|---|---|---|
| 1 | Artes marciais | `esportes-e-fitness-artes-marciais` | `cat_nsl_esportes-e-fitness-artes-marciais` |
| 2 | Basquetebol | `esportes-e-fitness-basquetebol` | `cat_nsl_esportes-e-fitness-basquetebol` |
| 3 | Bolas e acessórios | `esportes-e-fitness-bolas-e-acessorios` | `cat_nsl_esportes-e-fitness-bolas-e-acessorios` |
| 4 | Camping | `esportes-e-fitness-camping` | `cat_nsl_esportes-e-fitness-camping` |
| 5 | Ciclismo | `esportes-e-fitness-ciclismo` | `cat_nsl_esportes-e-fitness-ciclismo` |
| 6 | Corrida | `esportes-e-fitness-corrida` | `cat_nsl_esportes-e-fitness-corrida` |
| 7 | Equipamentos de ginástica | `esportes-e-fitness-equipamentos-de-ginastica` | `cat_nsl_esportes-e-fitness-equipamentos-de-ginastica` |
| 8 | Futebol | `esportes-e-fitness-futebol` | `cat_nsl_esportes-e-fitness-futebol` |
| 9 | Pesca esportiva | `esportes-e-fitness-pesca-esportiva` | `cat_nsl_esportes-e-fitness-pesca-esportiva` |
| 10 | Roupas esportivas | `esportes-e-fitness-roupas-esportivas` | `cat_nsl_esportes-e-fitness-roupas-esportivas` |

### Ferramentas e Máquinas  `ferramentas-e-maquinas` — 10 subcategorias

| # | Subcategoria | slug | id |
|---|---|---|---|
| 1 | Compressores | `ferramentas-e-maquinas-compressores` | `cat_nsl_ferramentas-e-maquinas-compressores` |
| 2 | Equipamentos de oficina | `ferramentas-e-maquinas-equipamentos-de-oficina` | `cat_nsl_ferramentas-e-maquinas-equipamentos-de-oficina` |
| 3 | Equipamentos de proteção | `ferramentas-e-maquinas-equipamentos-de-protecao` | `cat_nsl_ferramentas-e-maquinas-equipamentos-de-protecao` |
| 4 | Ferramentas elétricas | `ferramentas-e-maquinas-ferramentas-eletricas` | `cat_nsl_ferramentas-e-maquinas-ferramentas-eletricas` |
| 5 | Ferramentas manuais | `ferramentas-e-maquinas-ferramentas-manuais` | `cat_nsl_ferramentas-e-maquinas-ferramentas-manuais` |
| 6 | Furadeiras | `ferramentas-e-maquinas-furadeiras` | `cat_nsl_ferramentas-e-maquinas-furadeiras` |
| 7 | Geradores | `ferramentas-e-maquinas-geradores` | `cat_nsl_ferramentas-e-maquinas-geradores` |
| 8 | Máquinas de solda | `ferramentas-e-maquinas-maquinas-de-solda` | `cat_nsl_ferramentas-e-maquinas-maquinas-de-solda` |
| 9 | Peças para máquinas | `ferramentas-e-maquinas-pecas-para-maquinas` | `cat_nsl_ferramentas-e-maquinas-pecas-para-maquinas` |
| 10 | Serras | `ferramentas-e-maquinas-serras` | `cat_nsl_ferramentas-e-maquinas-serras` |

### Festas e Eventos  `festas-e-eventos` — 10 subcategorias

| # | Subcategoria | slug | id |
|---|---|---|---|
| 1 | Artigos de aniversário | `festas-e-eventos-artigos-de-aniversario` | `cat_nsl_festas-e-eventos-artigos-de-aniversario` |
| 2 | Artigos de casamento | `festas-e-eventos-artigos-de-casamento` | `cat_nsl_festas-e-eventos-artigos-de-casamento` |
| 3 | Artigos religiosos para eventos | `festas-e-eventos-artigos-religiosos-para-eventos` | `cat_nsl_festas-e-eventos-artigos-religiosos-para-eventos` |
| 4 | Balões | `festas-e-eventos-baloes` | `cat_nsl_festas-e-eventos-baloes` |
| 5 | Decoração de festas | `festas-e-eventos-decoracao-de-festas` | `cat_nsl_festas-e-eventos-decoracao-de-festas` |
| 6 | Equipamentos de som | `festas-e-eventos-equipamentos-de-som` | `cat_nsl_festas-e-eventos-equipamentos-de-som` |
| 7 | Iluminação para eventos | `festas-e-eventos-iluminacao-para-eventos` | `cat_nsl_festas-e-eventos-iluminacao-para-eventos` |
| 8 | Lembranças | `festas-e-eventos-lembrancas` | `cat_nsl_festas-e-eventos-lembrancas` |
| 9 | Tendas e coberturas | `festas-e-eventos-tendas-e-coberturas` | `cat_nsl_festas-e-eventos-tendas-e-coberturas` |
| 10 | Utensílios descartáveis | `festas-e-eventos-utensilios-descartaveis` | `cat_nsl_festas-e-eventos-utensilios-descartaveis` |

### Games e Consoles  `games-e-consoles` — 6 subcategorias

| # | Subcategoria | slug | id |
|---|---|---|---|
| 1 | Acessórios para consoles | `games-e-consoles-acessorios-para-consoles` | `cat_nsl_games-e-consoles-acessorios-para-consoles` |
| 2 | Consoles de jogos | `games-e-consoles-consoles-de-jogos` | `cat_nsl_games-e-consoles-consoles-de-jogos` |
| 3 | Controles | `games-e-consoles-controles` | `cat_nsl_games-e-consoles-controles` |
| 4 | Equipamentos gamer | `games-e-consoles-equipamentos-gamer` | `cat_nsl_games-e-consoles-equipamentos-gamer` |
| 5 | Jogos físicos | `games-e-consoles-jogos-fisicos` | `cat_nsl_games-e-consoles-jogos-fisicos` |
| 6 | Peças para consoles | `games-e-consoles-pecas-para-consoles` | `cat_nsl_games-e-consoles-pecas-para-consoles` |

### Indústria, Comércio e Escritório  `industria-comercio-e-escritorio` — 10 subcategorias

| # | Subcategoria | slug | id |
|---|---|---|---|
| 1 | Balanças comerciais | `industria-comercio-e-escritorio-balancas-comerciais` | `cat_nsl_industria-comercio-e-escritorio-balancas-comerciais` |
| 2 | Embalagens | `industria-comercio-e-escritorio-embalagens` | `cat_nsl_industria-comercio-e-escritorio-embalagens` |
| 3 | Equipamentos comerciais | `industria-comercio-e-escritorio-equipamentos-comerciais` | `cat_nsl_industria-comercio-e-escritorio-equipamentos-comerciais` |
| 4 | Equipamentos de escritório | `industria-comercio-e-escritorio-equipamentos-de-escritorio` | `cat_nsl_industria-comercio-e-escritorio-equipamentos-de-escritorio` |
| 5 | Equipamentos de segurança | `industria-comercio-e-escritorio-equipamentos-de-seguranca` | `cat_nsl_industria-comercio-e-escritorio-equipamentos-de-seguranca` |
| 6 | Equipamentos para restaurantes | `industria-comercio-e-escritorio-equipamentos-para-restaurantes` | `cat_nsl_industria-comercio-e-escritorio-equipamentos-para-restaurantes` |
| 7 | Máquinas de costura | `industria-comercio-e-escritorio-maquinas-de-costura` | `cat_nsl_industria-comercio-e-escritorio-maquinas-de-costura` |
| 8 | Máquinas industriais | `industria-comercio-e-escritorio-maquinas-industriais` | `cat_nsl_industria-comercio-e-escritorio-maquinas-industriais` |
| 9 | Materiais de armazenagem | `industria-comercio-e-escritorio-materiais-de-armazenagem` | `cat_nsl_industria-comercio-e-escritorio-materiais-de-armazenagem` |
| 10 | Uniformes profissionais | `industria-comercio-e-escritorio-uniformes-profissionais` | `cat_nsl_industria-comercio-e-escritorio-uniformes-profissionais` |

### Informática e Computadores  `informatica-e-computadores` — 11 subcategorias

| # | Subcategoria | slug | id |
|---|---|---|---|
| 1 | Acessórios de informática | `informatica-e-computadores-acessorios-de-informatica` | `cat_nsl_informatica-e-computadores-acessorios-de-informatica` |
| 2 | Cartuchos e toners | `informatica-e-computadores-cartuchos-e-toners` | `cat_nsl_informatica-e-computadores-cartuchos-e-toners` |
| 3 | Computadores de mesa | `informatica-e-computadores-computadores-de-mesa` | `cat_nsl_informatica-e-computadores-computadores-de-mesa` |
| 4 | Discos SSD e HD | `informatica-e-computadores-discos-ssd-e-hd` | `cat_nsl_informatica-e-computadores-discos-ssd-e-hd` |
| 5 | Impressoras e scanners | `informatica-e-computadores-impressoras-e-scanners` | `cat_nsl_informatica-e-computadores-impressoras-e-scanners` |
| 6 | Memórias e processadores | `informatica-e-computadores-memorias-e-processadores` | `cat_nsl_informatica-e-computadores-memorias-e-processadores` |
| 7 | Monitores | `informatica-e-computadores-monitores` | `cat_nsl_informatica-e-computadores-monitores` |
| 8 | Notebooks | `informatica-e-computadores-notebooks` | `cat_nsl_informatica-e-computadores-notebooks` |
| 9 | Redes e roteadores | `informatica-e-computadores-redes-e-roteadores` | `cat_nsl_informatica-e-computadores-redes-e-roteadores` |
| 10 | Tablets | `informatica-e-computadores-tablets` | `cat_nsl_informatica-e-computadores-tablets` |
| 11 | Teclados e mouses | `informatica-e-computadores-teclados-e-mouses` | `cat_nsl_informatica-e-computadores-teclados-e-mouses` |

### Instrumentos Musicais  `instrumentos-musicais` — 8 subcategorias

| # | Subcategoria | slug | id |
|---|---|---|---|
| 1 | Acessórios musicais | `instrumentos-musicais-acessorios-musicais` | `cat_nsl_instrumentos-musicais-acessorios-musicais` |
| 2 | Baterias e percussão | `instrumentos-musicais-baterias-e-percussao` | `cat_nsl_instrumentos-musicais-baterias-e-percussao` |
| 3 | Equipamentos de gravação | `instrumentos-musicais-equipamentos-de-gravacao` | `cat_nsl_instrumentos-musicais-equipamentos-de-gravacao` |
| 4 | Guitarras | `instrumentos-musicais-guitarras` | `cat_nsl_instrumentos-musicais-guitarras` |
| 5 | Instrumentos tradicionais | `instrumentos-musicais-instrumentos-tradicionais` | `cat_nsl_instrumentos-musicais-instrumentos-tradicionais` |
| 6 | Mesas de som | `instrumentos-musicais-mesas-de-som` | `cat_nsl_instrumentos-musicais-mesas-de-som` |
| 7 | Microfones | `instrumentos-musicais-microfones` | `cat_nsl_instrumentos-musicais-microfones` |
| 8 | Teclados musicais | `instrumentos-musicais-teclados-musicais` | `cat_nsl_instrumentos-musicais-teclados-musicais` |

### Jardim e Exterior  `jardim-e-exterior` — 9 subcategorias

| # | Subcategoria | slug | id |
|---|---|---|---|
| 1 | Cercas | `jardim-e-exterior-cercas` | `cat_nsl_jardim-e-exterior-cercas` |
| 2 | Decoração de jardim | `jardim-e-exterior-decoracao-de-jardim` | `cat_nsl_jardim-e-exterior-decoracao-de-jardim` |
| 3 | Equipamentos de rega | `jardim-e-exterior-equipamentos-de-rega` | `cat_nsl_jardim-e-exterior-equipamentos-de-rega` |
| 4 | Ferramentas de jardinagem | `jardim-e-exterior-ferramentas-de-jardinagem` | `cat_nsl_jardim-e-exterior-ferramentas-de-jardinagem` |
| 5 | Iluminação exterior | `jardim-e-exterior-iluminacao-exterior` | `cat_nsl_jardim-e-exterior-iluminacao-exterior` |
| 6 | Mangueiras | `jardim-e-exterior-mangueiras` | `cat_nsl_jardim-e-exterior-mangueiras` |
| 7 | Mobiliário exterior | `jardim-e-exterior-mobiliario-exterior` | `cat_nsl_jardim-e-exterior-mobiliario-exterior` |
| 8 | Plantas e sementes | `jardim-e-exterior-plantas-e-sementes` | `cat_nsl_jardim-e-exterior-plantas-e-sementes` |
| 9 | Vasos | `jardim-e-exterior-vasos` | `cat_nsl_jardim-e-exterior-vasos` |

### Livros, Papelaria e Educação  `livros-papelaria-e-educacao` — 10 subcategorias

| # | Subcategoria | slug | id |
|---|---|---|---|
| 1 | Artigos de escritório | `livros-papelaria-e-educacao-artigos-de-escritorio` | `cat_nsl_livros-papelaria-e-educacao-artigos-de-escritorio` |
| 2 | Cadernos | `livros-papelaria-e-educacao-cadernos` | `cat_nsl_livros-papelaria-e-educacao-cadernos` |
| 3 | Canetas e lápis | `livros-papelaria-e-educacao-canetas-e-lapis` | `cat_nsl_livros-papelaria-e-educacao-canetas-e-lapis` |
| 4 | Literatura | `livros-papelaria-e-educacao-literatura` | `cat_nsl_livros-papelaria-e-educacao-literatura` |
| 5 | Livros escolares | `livros-papelaria-e-educacao-livros-escolares` | `cat_nsl_livros-papelaria-e-educacao-livros-escolares` |
| 6 | Livros religiosos | `livros-papelaria-e-educacao-livros-religiosos` | `cat_nsl_livros-papelaria-e-educacao-livros-religiosos` |
| 7 | Livros universitários | `livros-papelaria-e-educacao-livros-universitarios` | `cat_nsl_livros-papelaria-e-educacao-livros-universitarios` |
| 8 | Materiais de desenho | `livros-papelaria-e-educacao-materiais-de-desenho` | `cat_nsl_livros-papelaria-e-educacao-materiais-de-desenho` |
| 9 | Materiais didáticos | `livros-papelaria-e-educacao-materiais-didaticos` | `cat_nsl_livros-papelaria-e-educacao-materiais-didaticos` |
| 10 | Mochilas escolares | `livros-papelaria-e-educacao-mochilas-escolares` | `cat_nsl_livros-papelaria-e-educacao-mochilas-escolares` |

### Moda Feminina  `moda-feminina` — 10 subcategorias

| # | Subcategoria | slug | id |
|---|---|---|---|
| 1 | Blusas e camisetas | `moda-feminina-blusas-e-camisetas` | `cat_nsl_moda-feminina-blusas-e-camisetas` |
| 2 | Calças | `moda-feminina-calcas` | `cat_nsl_moda-feminina-calcas` |
| 3 | Casacos | `moda-feminina-casacos` | `cat_nsl_moda-feminina-casacos` |
| 4 | Conjuntos | `moda-feminina-conjuntos` | `cat_nsl_moda-feminina-conjuntos` |
| 5 | Moda praia | `moda-feminina-moda-praia` | `cat_nsl_moda-feminina-moda-praia` |
| 6 | Roupas esportivas | `moda-feminina-roupas-esportivas` | `cat_nsl_moda-feminina-roupas-esportivas` |
| 7 | Roupas íntimas | `moda-feminina-roupas-intimas` | `cat_nsl_moda-feminina-roupas-intimas` |
| 8 | Roupas tradicionais africanas | `moda-feminina-roupas-tradicionais-africanas` | `cat_nsl_moda-feminina-roupas-tradicionais-africanas` |
| 9 | Saias | `moda-feminina-saias` | `cat_nsl_moda-feminina-saias` |
| 10 | Vestidos | `moda-feminina-vestidos` | `cat_nsl_moda-feminina-vestidos` |

### Moda Masculina  `moda-masculina` — 10 subcategorias

| # | Subcategoria | slug | id |
|---|---|---|---|
| 1 | Bermudas | `moda-masculina-bermudas` | `cat_nsl_moda-masculina-bermudas` |
| 2 | Calças | `moda-masculina-calcas` | `cat_nsl_moda-masculina-calcas` |
| 3 | Camisas | `moda-masculina-camisas` | `cat_nsl_moda-masculina-camisas` |
| 4 | Camisetas e polos | `moda-masculina-camisetas-e-polos` | `cat_nsl_moda-masculina-camisetas-e-polos` |
| 5 | Casacos | `moda-masculina-casacos` | `cat_nsl_moda-masculina-casacos` |
| 6 | Fatos e blazers | `moda-masculina-fatos-e-blazers` | `cat_nsl_moda-masculina-fatos-e-blazers` |
| 7 | Roupa esportiva | `moda-masculina-roupa-esportiva` | `cat_nsl_moda-masculina-roupa-esportiva` |
| 8 | Roupa íntima | `moda-masculina-roupa-intima` | `cat_nsl_moda-masculina-roupa-intima` |
| 9 | Roupas tradicionais africanas | `moda-masculina-roupas-tradicionais-africanas` | `cat_nsl_moda-masculina-roupas-tradicionais-africanas` |
| 10 | Uniformes | `moda-masculina-uniformes` | `cat_nsl_moda-masculina-uniformes` |

### Pet Shop e Animais  `pet-shop-e-animais` — 9 subcategorias

| # | Subcategoria | slug | id |
|---|---|---|---|
| 1 | Acessórios para animais | `pet-shop-e-animais-acessorios-para-animais` | `cat_nsl_pet-shop-e-animais-acessorios-para-animais` |
| 2 | Aquários | `pet-shop-e-animais-aquarios` | `cat_nsl_pet-shop-e-animais-aquarios` |
| 3 | Brinquedos para animais | `pet-shop-e-animais-brinquedos-para-animais` | `cat_nsl_pet-shop-e-animais-brinquedos-para-animais` |
| 4 | Camas para animais | `pet-shop-e-animais-camas-para-animais` | `cat_nsl_pet-shop-e-animais-camas-para-animais` |
| 5 | Coleiras e guias | `pet-shop-e-animais-coleiras-e-guias` | `cat_nsl_pet-shop-e-animais-coleiras-e-guias` |
| 6 | Gaiolas | `pet-shop-e-animais-gaiolas` | `cat_nsl_pet-shop-e-animais-gaiolas` |
| 7 | Higiene animal | `pet-shop-e-animais-higiene-animal` | `cat_nsl_pet-shop-e-animais-higiene-animal` |
| 8 | Rações para cães | `pet-shop-e-animais-racoes-para-caes` | `cat_nsl_pet-shop-e-animais-racoes-para-caes` |
| 9 | Rações para gatos | `pet-shop-e-animais-racoes-para-gatos` | `cat_nsl_pet-shop-e-animais-racoes-para-gatos` |

### Produtos Tradicionais e Artesanato  `produtos-tradicionais-e-artesanato` — 10 subcategorias

| # | Subcategoria | slug | id |
|---|---|---|---|
| 1 | Artesanato guineense | `produtos-tradicionais-e-artesanato-artesanato-guineense` | `cat_nsl_produtos-tradicionais-e-artesanato-artesanato-guineense` |
| 2 | Artigos de madeira | `produtos-tradicionais-e-artesanato-artigos-de-madeira` | `cat_nsl_produtos-tradicionais-e-artesanato-artigos-de-madeira` |
| 3 | Bijuterias artesanais | `produtos-tradicionais-e-artesanato-bijuterias-artesanais` | `cat_nsl_produtos-tradicionais-e-artesanato-bijuterias-artesanais` |
| 4 | Cestos e cestaria | `produtos-tradicionais-e-artesanato-cestos-e-cestaria` | `cat_nsl_produtos-tradicionais-e-artesanato-cestos-e-cestaria` |
| 5 | Decoração africana | `produtos-tradicionais-e-artesanato-decoracao-africana` | `cat_nsl_produtos-tradicionais-e-artesanato-decoracao-africana` |
| 6 | Instrumentos tradicionais | `produtos-tradicionais-e-artesanato-instrumentos-tradicionais` | `cat_nsl_produtos-tradicionais-e-artesanato-instrumentos-tradicionais` |
| 7 | Lembranças regionais | `produtos-tradicionais-e-artesanato-lembrancas-regionais` | `cat_nsl_produtos-tradicionais-e-artesanato-lembrancas-regionais` |
| 8 | Panos tradicionais | `produtos-tradicionais-e-artesanato-panos-tradicionais` | `cat_nsl_produtos-tradicionais-e-artesanato-panos-tradicionais` |
| 9 | Produtos culturais | `produtos-tradicionais-e-artesanato-produtos-culturais` | `cat_nsl_produtos-tradicionais-e-artesanato-produtos-culturais` |
| 10 | Tecidos africanos | `produtos-tradicionais-e-artesanato-tecidos-africanos` | `cat_nsl_produtos-tradicionais-e-artesanato-tecidos-africanos` |

### Saúde e Bem-estar  `saude-e-bem-estar` — 8 subcategorias

| # | Subcategoria | slug | id |
|---|---|---|---|
| 1 | Equipamentos de cuidados pessoais | `saude-e-bem-estar-equipamentos-de-cuidados-pessoais` | `cat_nsl_saude-e-bem-estar-equipamentos-de-cuidados-pessoais` |
| 2 | Higiene e prevenção | `saude-e-bem-estar-higiene-e-prevencao` | `cat_nsl_saude-e-bem-estar-higiene-e-prevencao` |
| 3 | Máscaras e luvas | `saude-e-bem-estar-mascaras-e-luvas` | `cat_nsl_saude-e-bem-estar-mascaras-e-luvas` |
| 4 | Medidores de pressão | `saude-e-bem-estar-medidores-de-pressao` | `cat_nsl_saude-e-bem-estar-medidores-de-pressao` |
| 5 | Mobilidade e acessibilidade | `saude-e-bem-estar-mobilidade-e-acessibilidade` | `cat_nsl_saude-e-bem-estar-mobilidade-e-acessibilidade` |
| 6 | Primeiros socorros | `saude-e-bem-estar-primeiros-socorros` | `cat_nsl_saude-e-bem-estar-primeiros-socorros` |
| 7 | Produtos ortopédicos | `saude-e-bem-estar-produtos-ortopedicos` | `cat_nsl_saude-e-bem-estar-produtos-ortopedicos` |
| 8 | Termômetros | `saude-e-bem-estar-termometros` | `cat_nsl_saude-e-bem-estar-termometros` |

### Supermercado e Mercearia  `supermercado-e-mercearia` — 11 subcategorias

| # | Subcategoria | slug | id |
|---|---|---|---|
| 1 | Açúcar e sal | `supermercado-e-mercearia-acucar-e-sal` | `cat_nsl_supermercado-e-mercearia-acucar-e-sal` |
| 2 | Arroz e cereais | `supermercado-e-mercearia-arroz-e-cereais` | `cat_nsl_supermercado-e-mercearia-arroz-e-cereais` |
| 3 | Bolachas e doces | `supermercado-e-mercearia-bolachas-e-doces` | `cat_nsl_supermercado-e-mercearia-bolachas-e-doces` |
| 4 | Café, chá e cacau | `supermercado-e-mercearia-cafe-cha-e-cacau` | `cat_nsl_supermercado-e-mercearia-cafe-cha-e-cacau` |
| 5 | Conservas e enlatados | `supermercado-e-mercearia-conservas-e-enlatados` | `cat_nsl_supermercado-e-mercearia-conservas-e-enlatados` |
| 6 | Farinha e massas | `supermercado-e-mercearia-farinha-e-massas` | `cat_nsl_supermercado-e-mercearia-farinha-e-massas` |
| 7 | Leite e derivados | `supermercado-e-mercearia-leite-e-derivados` | `cat_nsl_supermercado-e-mercearia-leite-e-derivados` |
| 8 | Óleos alimentares | `supermercado-e-mercearia-oleos-alimentares` | `cat_nsl_supermercado-e-mercearia-oleos-alimentares` |
| 9 | Produtos de higiene doméstica | `supermercado-e-mercearia-produtos-de-higiene-domestica` | `cat_nsl_supermercado-e-mercearia-produtos-de-higiene-domestica` |
| 10 | Produtos de limpeza | `supermercado-e-mercearia-produtos-de-limpeza` | `cat_nsl_supermercado-e-mercearia-produtos-de-limpeza` |
| 11 | Temperos e condimentos | `supermercado-e-mercearia-temperos-e-condimentos` | `cat_nsl_supermercado-e-mercearia-temperos-e-condimentos` |
