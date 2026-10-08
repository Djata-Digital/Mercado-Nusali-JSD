# 02 — Definições de atributos propostas (onde cada atributo é DEFINIDO)

> Matriz de atributos **v1-2026-10-08** — proposta para revisão (Fase 8A). **Nada foi aplicado em produção.**
> Gerado por `scripts/attribute-matrix/generate.ts` a partir de `src/data/attributeMatrix/`.

Total de definições: **806** · overrides: **7** · desativações: **34**.

Legenda — **papel**: spec = especificação do produto; eixo = eixo de variante (varia entre variações). **Obrig.**: obrigatório para o vendedor. **Filtro**: pode virar filtro de busca. **Visibilidade**: todos os atributos ativos aparecem na ficha pública (o esquema só tem "ativo/inativo"; não existe visibilidade por atributo).

## Celulares e Telefones › Smartphones  `celulares-e-telefones-smartphones`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo | sim |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `capacidade` | Armazenamento | seleção | eixo | sim |  | 7 opções: 16 GB / 32 GB / 64 GB / 128 GB / 256 GB / 512 GB / 1 TB |  | sim | Memória interna do telefone. |
| 30 | `sistema_operativo` | Sistema operativo | seleção | spec | sim |  | 3 opções: Android / iOS / Outro | Geral | sim |  |
| 40 | `memoria_ram` | Memória RAM | seleção | spec | sim |  | 7 opções: 2 GB / 3 GB / 4 GB / 6 GB / 8 GB / 12 GB / 16 GB | Desempenho | sim |  |
| 50 | `tamanho_ecra` | Tamanho do ecrã | número | spec |  | pol | 1 a 10 pol; 1 casa(s) | Ecrã | sim |  |
| 60 | `camara_principal` | Câmara principal | número | spec |  | MP | 0.3 a 300 MP; 1 casa(s) | Câmara |  |  |
| 70 | `bateria_mah` | Bateria | número | spec |  | mAh | 500 a 20000 mAh; inteiro | Bateria |  |  |
| 80 | `rede_movel` | Rede móvel | seleção | spec |  |  | 3 opções: 3G / 4G / 5G | Conectividade | sim |  |
| 90 | `dual_sim` | Dual SIM (2 cartões) | sim/não | spec |  |  |  | Conectividade | sim |  |
| 100 | `desbloqueado` | Desbloqueado para qualquer operadora | sim/não | spec |  |  |  | Conectividade | sim | Escolha Sim se funciona com qualquer cartão SIM. |


## Celulares e Telefones › Celulares básicos  `celulares-e-telefones-celulares-basicos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `rede_movel` | Rede móvel | seleção | spec |  |  | 3 opções: 2G / 3G / 4G | Conectividade | sim |  |
| 30 | `dual_sim` | Dual SIM (2 cartões) | sim/não | spec |  |  |  | Conectividade | sim |  |
| 40 | `bateria_mah` | Bateria | número | spec |  | mAh | 300 a 10000 mAh; inteiro | Bateria |  |  |
| 50 | `radio_fm` | Rádio FM | sim/não | spec |  |  |  | Funções | sim |  |
| 60 | `lanterna` | Lanterna | sim/não | spec |  |  |  | Funções | sim |  |


## Celulares e Telefones › Capas e películas  `celulares-e-telefones-capas-e-peliculas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tipo_acessorio` | Tipo | seleção | spec | sim |  | 6 opções: Capa rígida / Capa de silicone / Capa carteira (flip) / Película de vidro / Película de hidrogel / Outro | Geral | sim |  |
| 30 | `compativel_com` | Compatível com | texto | spec | sim |  | até 120 car. | Compatibilidade |  | Escreva o modelo do telefone para o qual serve. |


## Celulares e Telefones › Carregadores e cabos  `celulares-e-telefones-carregadores-e-cabos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tipo_acessorio` | Tipo | seleção | spec | sim |  | 6 opções: Carregador de parede / Cabo / Carregador de carro / Carregador sem fios / Carregador portátil (power bank) / Adaptador | Geral | sim |  |
| 30 | `conector` | Conector | seleção | spec |  |  | 5 opções: USB-C / Lightning / Micro-USB / USB-A / Vários | Compatibilidade | sim |  |
| 40 | `potencia_w` | Potência | número | spec |  | W | 1 a 300 W; inteiro | Desempenho | sim |  |
| 50 | `comprimento_cabo` | Comprimento do cabo | número | spec |  | m | 0.1 a 10 m; 1 casa(s) | Medidas |  |  |
| 60 | `capacidade_bateria_mah` | Capacidade do power bank | número | spec |  | mAh | 1000 a 100000 mAh; inteiro | Bateria |  | Só para carregadores portáteis. |


## Celulares e Telefones › Baterias e peças  `celulares-e-telefones-baterias-e-pecas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_acessorio` | Tipo de peça | seleção | spec | sim |  | 7 opções: Bateria / Ecrã/LCD / Conector de carga / Câmara / Altifalante / Carcaça / Outra peça | Geral | sim |  |
| 20 | `compativel_com` | Compatível com | texto | spec | sim |  | até 120 car. | Compatibilidade |  | Ex.: iPhone 11 |
| 30 | `capacidade_bateria_mah` | Capacidade (baterias) | número | spec |  | mAh | 300 a 20000 mAh; inteiro | Bateria |  |  |


## Celulares e Telefones › Smartwatches  `celulares-e-telefones-smartwatches`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo | sim |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `compativel_sistema` | Compatível com | múltipla | spec |  |  | 2 opções: Android / iOS | Compatibilidade | sim |  |
| 30 | `tamanho_ecra` | Tamanho do ecrã | número | spec |  | pol | 0.5 a 3 pol; 2 casa(s) | Ecrã |  |  |
| 40 | `monitor_cardiaco` | Monitor de batimentos cardíacos | sim/não | spec |  |  |  | Saúde | sim |  |
| 50 | `resistente_agua` | Resistente à água | sim/não | spec |  |  |  | Uso | sim |  |
| 60 | `faz_chamadas` | Faz e recebe chamadas | sim/não | spec |  |  |  | Funções | sim |  |
| 70 | `autonomia_dias` | Autonomia da bateria | número | spec |  | dias | 1 a 60 dias; inteiro | Bateria |  |  |


## Celulares e Telefones › Acessórios para celulares  `celulares-e-telefones-acessorios-para-celulares`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tipo_acessorio` | Tipo | seleção | spec | sim |  | 7 opções: Suporte / Pau de selfie / Anel/pop socket / Cartão de memória / Adaptador / Auricular com fio / Outro | Geral | sim |  |
| 30 | `compativel_com` | Compatível com | texto | spec |  |  | até 120 car. | Compatibilidade |  |  |


## Celulares e Telefones › Telefones fixos  `celulares-e-telefones-telefones-fixos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tipo_telefone` | Tipo | seleção | spec | sim |  | 3 opções: Com fio / Sem fio / Sem fio com atendedor | Geral | sim |  |
| 30 | `identificador_chamadas` | Identificador de chamadas | sim/não | spec |  |  |  | Funções | sim |  |
| 40 | `viva_voz` | Viva-voz | sim/não | spec |  |  |  | Funções | sim |  |


## Celulares e Telefones › Rádios comunicadores  `celulares-e-telefones-radios-comunicadores`

> Categoria sujeita a regras de licenciamento de frequências. A política de venda (permitida/restrita) é decisão do dono: a matriz NÃO inclui campos jurídicos.

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_radio` | Tipo | seleção | spec | sim |  | 4 opções: Walkie-talkie / Rádio VHF/UHF / Rádio CB / Rádio de bolso | Geral | sim |  |
| 20 | `alcance_km` | Alcance | número | spec |  | km | 0.1 a 100 km; 1 casa(s) | Desempenho |  |  |
| 30 | `potencia_w` | Potência | número | spec |  | W | 0.1 a 100 W; 1 casa(s) | Desempenho |  |  |
| 40 | `canais` | Número de canais | número | spec |  |  | 1 a 999; inteiro | Desempenho |  |  |


## Informática e Computadores › Notebooks  `informatica-e-computadores-notebooks`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `capacidade` | Armazenamento | seleção | eixo | sim |  | 5 opções: 128 GB / 256 GB / 512 GB / 1 TB / 2 TB |  | sim | Tamanho do disco. A memória RAM é característica do anúncio: versões com RAM diferente são anúncios separados. |
| 30 | `processador` | Processador | seleção | spec | sim |  | 10 opções: Intel Core i3 / Intel Core i5 / Intel Core i7 / Intel Core i9 / AMD Ryzen 3 / AMD Ryzen 5 / AMD Ryzen 7 / Intel Celeron/Pentium / Apple M1/M2/M3 / Outro | Desempenho | sim |  |
| 40 | `memoria_ram` | Memória RAM | seleção | spec | sim |  | 6 opções: 4 GB / 8 GB / 12 GB / 16 GB / 32 GB / 64 GB | Desempenho | sim |  |
| 50 | `tipo_armazenamento` | Tipo de armazenamento | seleção | spec |  |  | 3 opções: SSD / HD / SSD + HD | Desempenho | sim |  |
| 60 | `tamanho_ecra` | Tamanho do ecrã | número | spec |  | pol | 10 a 20 pol; 1 casa(s) | Ecrã | sim |  |
| 70 | `sistema_operativo` | Sistema operativo | seleção | spec |  |  | 4 opções: Windows / macOS / Linux / Sem sistema | Geral | sim |  |


## Informática e Computadores › Computadores de mesa  `informatica-e-computadores-computadores-de-mesa`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_computador` | Tipo | seleção | spec | sim |  | 3 opções: Torre / Tudo em um (All-in-One) / Mini PC | Geral | sim |  |
| 20 | `processador` | Processador | seleção | spec | sim |  | 9 opções: Intel Core i3 / Intel Core i5 / Intel Core i7 / Intel Core i9 / AMD Ryzen 3 / AMD Ryzen 5 / AMD Ryzen 7 / Intel Celeron/Pentium / Outro | Desempenho | sim |  |
| 30 | `memoria_ram` | Memória RAM | seleção | spec | sim |  | 5 opções: 4 GB / 8 GB / 16 GB / 32 GB / 64 GB | Desempenho | sim |  |
| 40 | `armazenamento` | Armazenamento | seleção | spec |  |  | 5 opções: 128 GB / 256 GB / 512 GB / 1 TB / 2 TB | Desempenho | sim |  |
| 50 | `sistema_operativo` | Sistema operativo | seleção | spec |  |  | 3 opções: Windows / Linux / Sem sistema | Geral | sim |  |


## Informática e Computadores › Tablets  `informatica-e-computadores-tablets`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo | sim |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `capacidade` | Armazenamento | seleção | eixo | sim |  | 7 opções: 16 GB / 32 GB / 64 GB / 128 GB / 256 GB / 512 GB / 1 TB |  | sim |  |
| 30 | `sistema_operativo` | Sistema operativo | seleção | spec | sim |  | 4 opções: Android / iPadOS / Windows / Outro | Geral | sim |  |
| 40 | `memoria_ram` | Memória RAM | seleção | spec |  |  | 7 opções: 2 GB / 3 GB / 4 GB / 6 GB / 8 GB / 12 GB / 16 GB | Desempenho | sim |  |
| 50 | `tamanho_ecra` | Tamanho do ecrã | número | spec |  | pol | 5 a 14 pol; 1 casa(s) | Ecrã | sim |  |
| 60 | `conectividade` | Conectividade | seleção | spec |  |  | 2 opções: Wi-Fi / Wi-Fi + 4G/5G | Conectividade | sim |  |


## Informática e Computadores › Monitores  `informatica-e-computadores-monitores`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tamanho_ecra` | Tamanho do ecrã | número | spec | sim | pol | 10 a 100 pol; 1 casa(s) | Ecrã | sim |  |
| 20 | `resolucao` | Resolução | seleção | spec | sim |  | 5 opções: HD (1366x768) / Full HD (1920x1080) / 2K (2560x1440) / 4K (3840x2160) / Outra | Ecrã | sim |  |
| 30 | `taxa_atualizacao_hz` | Taxa de atualização | número | spec |  | Hz | 30 a 500 Hz; inteiro | Ecrã |  |  |
| 40 | `tipo_painel` | Tipo de painel | seleção | spec |  |  | 4 opções: IPS / VA / TN / OLED | Ecrã | sim |  |
| 50 | `entradas_video` | Entradas de vídeo | múltipla | spec |  |  | 4 opções: HDMI / VGA / DisplayPort / USB-C | Conectividade | sim |  |


## Informática e Computadores › Teclados e mouses  `informatica-e-computadores-teclados-e-mouses`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tipo_periferico` | Tipo | seleção | spec | sim |  | 6 opções: Teclado / Mouse / Teclado e mouse (kit) / Mousepad / Teclado gamer / Mouse gamer | Geral | sim |  |
| 30 | `ligacao` | Ligação | seleção | spec |  |  | 3 opções: Com fio (USB) / Sem fio (receptor USB) / Bluetooth | Conectividade | sim |  |
| 40 | `layout_teclado` | Layout do teclado | seleção | spec |  |  | 4 opções: Português (PT) / Português (BR) / Francês (AZERTY) / Inglês (US) | Geral | sim | Só para teclados. |


## Informática e Computadores › Impressoras e scanners  `informatica-e-computadores-impressoras-e-scanners`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_impressora` | Tipo | seleção | spec | sim |  | 6 opções: Jato de tinta / Laser / Multifuncional / Térmica (recibos) / Matricial / Scanner | Geral | sim |  |
| 20 | `impressao_colorida` | Impressão a cores | sim/não | spec |  |  |  | Desempenho | sim |  |
| 30 | `ligacoes` | Ligações | múltipla | spec |  |  | 4 opções: USB / Wi-Fi / Rede (Ethernet) / Bluetooth | Conectividade | sim |  |
| 40 | `formato_papel` | Formato máximo do papel | seleção | spec |  |  | 3 opções: A4 / A3 / Rolo de recibo | Desempenho | sim |  |


## Informática e Computadores › Cartuchos e toners  `informatica-e-computadores-cartuchos-e-toners`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_consumivel` | Tipo | seleção | spec | sim |  | 5 opções: Cartucho de tinta / Toner / Tinta em garrafa / Fita/Ribbon / Cilindro | Geral | sim |  |
| 20 | `compativel_com` | Compatível com | texto | spec | sim |  | até 150 car. | Compatibilidade |  | Ex.: HP LaserJet 1020 |
| 30 | `cor_impressao` | Cor de impressão | seleção | spec |  |  | 5 opções: Preto / Ciano / Magenta / Amarelo / Colorido (kit) | Geral | sim |  |
| 40 | `rendimento_paginas` | Rendimento | número | spec |  | páginas | 50 a 100000 páginas; inteiro | Desempenho |  |  |


## Informática e Computadores › Discos SSD e HD  `informatica-e-computadores-discos-ssd-e-hd`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `capacidade` | Capacidade | seleção | eixo | sim |  | 9 opções: 32 GB / 64 GB / 128 GB / 256 GB / 512 GB / 1 TB / 2 TB / 4 TB / 8 TB |  | sim |  |
| 20 | `tipo_disco` | Tipo | seleção | spec | sim |  | 7 opções: SSD SATA / SSD NVMe / HD interno / HD externo / SSD externo / Pen drive / Cartão de memória | Geral | sim |  |
| 30 | `interface` | Interface | seleção | spec |  |  | 5 opções: SATA / NVMe (M.2) / USB 3.0 / USB-C / microSD/SD | Conectividade | sim |  |


## Informática e Computadores › Memórias e processadores  `informatica-e-computadores-memorias-e-processadores`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `capacidade` | Capacidade | seleção | eixo |  |  | 6 opções: 2 GB / 4 GB / 8 GB / 16 GB / 32 GB / 64 GB |  | sim | Só para memórias RAM. |
| 20 | `tipo_componente` | Tipo | seleção | spec | sim |  | 8 opções: Memória RAM DDR3 / Memória RAM DDR4 / Memória RAM DDR5 / Memória RAM para portátil / Processador / Placa-mãe / Placa de vídeo / Fonte de alimentação | Geral | sim |  |
| 30 | `compativel_com` | Compatível com | texto | spec |  |  | até 120 car. | Compatibilidade |  | Ex.: soquete LGA1155 |
| 40 | `velocidade_mhz` | Velocidade | número | spec |  | MHz | 400 a 10000 MHz; inteiro | Desempenho |  |  |


## Informática e Computadores › Redes e roteadores  `informatica-e-computadores-redes-e-roteadores`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_rede` | Tipo | seleção | spec | sim |  | 7 opções: Roteador Wi-Fi / Repetidor/Extensor / Switch / Modem 4G/5G / Antena / Placa de rede / Cabo de rede | Geral | sim |  |
| 20 | `padrao_wifi` | Padrão Wi-Fi | seleção | spec |  |  | 3 opções: Wi-Fi 4 (N) / Wi-Fi 5 (AC) / Wi-Fi 6 (AX) | Conectividade | sim |  |
| 30 | `velocidade_mbps` | Velocidade máxima | número | spec |  | Mbps | 10 a 20000 Mbps; inteiro | Desempenho |  |  |
| 40 | `portas_rede` | Portas de rede | número | spec |  |  | 1 a 48; inteiro | Conectividade |  |  |


## Informática e Computadores › Acessórios de informática  `informatica-e-computadores-acessorios-de-informatica`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tipo_acessorio` | Tipo | seleção | spec | sim |  | 8 opções: Hub USB / Webcam / Suporte para portátil / Cabo HDMI/VGA / Adaptador / Mochila/Capa para portátil / Limpeza / Outro | Geral | sim |  |
| 30 | `compativel_com` | Compatível com | texto | spec |  |  | até 120 car. | Compatibilidade |  |  |


## Eletrônicos, TV e Áudio › Televisores  `eletronicos-tv-e-audio-televisores`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tamanho_ecra` | Tamanho do ecrã | número | spec | sim | pol | 10 a 120 pol; inteiro | Ecrã | sim |  |
| 20 | `resolucao` | Resolução | seleção | spec | sim |  | 4 opções: HD / Full HD / 4K (Ultra HD) / 8K | Ecrã | sim |  |
| 30 | `tecnologia_ecra` | Tecnologia do ecrã | seleção | spec |  |  | 5 opções: LED / QLED / OLED / LCD / Plasma | Ecrã | sim |  |
| 40 | `smart_tv` | Smart TV | sim/não | spec |  |  |  | Funções | sim |  |
| 50 | `entradas_video` | Entradas | múltipla | spec |  |  | 5 opções: HDMI / USB / VGA / AV / Antena | Conectividade | sim |  |
| 60 | `receptor_digital` | Receptor digital integrado | sim/não | spec |  |  |  | Funções | sim |  |


## Eletrônicos, TV e Áudio › Projetores  `eletronicos-tv-e-audio-projetores`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `luminosidade_lumens` | Luminosidade | número | spec |  | lumens | 100 a 20000 lumens; inteiro | Imagem |  |  |
| 20 | `resolucao` | Resolução | seleção | spec |  |  | 4 opções: SVGA / HD / Full HD / 4K | Imagem | sim |  |
| 30 | `tecnologia_projecao` | Tecnologia | seleção | spec |  |  | 4 opções: LED / LCD / DLP / Laser | Imagem | sim |  |
| 40 | `entradas_video` | Entradas | múltipla | spec |  |  | 4 opções: HDMI / USB / VGA / Wi-Fi | Conectividade | sim |  |


## Eletrônicos, TV e Áudio › Caixas de som  `eletronicos-tv-e-audio-caixas-de-som`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tipo_som` | Tipo | seleção | spec | sim |  | 6 opções: Portátil Bluetooth / Torre/amplificada / Soundbar / Subwoofer / Caixa para computador / Microfone com caixa (karaoke) | Geral | sim |  |
| 30 | `potencia_rms_w` | Potência (RMS) | número | spec |  | W | 1 a 20000 W; inteiro | Desempenho | sim |  |
| 40 | `ligacoes` | Ligações | múltipla | spec |  |  | 6 opções: Bluetooth / USB / Cartão SD / Auxiliar (P2) / Rádio FM / Wi-Fi | Conectividade | sim |  |
| 50 | `alimentacao` | Alimentação | seleção | spec |  |  | 4 opções: Bateria recarregável / Tomada / Bateria e tomada / Pilhas | Energia | sim |  |


## Eletrônicos, TV e Áudio › Fones de ouvido  `eletronicos-tv-e-audio-fones-de-ouvido`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tipo_fone` | Tipo | seleção | spec | sim |  | 5 opções: Intra-auricular (earbuds) / Intra-auricular com fio / Supra-auricular (headphone) / Headset gamer / Auricular de osso | Geral | sim |  |
| 30 | `ligacao` | Ligação | seleção | spec |  |  | 3 opções: Com fio / Bluetooth / Com fio e Bluetooth | Conectividade | sim |  |
| 40 | `microfone` | Microfone integrado | sim/não | spec |  |  |  | Funções | sim |  |
| 50 | `cancelamento_ruido` | Cancelamento de ruído | sim/não | spec |  |  |  | Funções | sim |  |


## Eletrônicos, TV e Áudio › Home theater  `eletronicos-tv-e-audio-home-theater`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `canais_audio` | Canais | seleção | spec | sim |  | 4 opções: 2.0 / 2.1 / 5.1 / 7.1 | Áudio | sim |  |
| 20 | `potencia_rms_w` | Potência total (RMS) | número | spec |  | W | 10 a 20000 W; inteiro | Áudio |  |  |
| 30 | `ligacoes` | Ligações | múltipla | spec |  |  | 5 opções: HDMI / Bluetooth / USB / Óptica / Auxiliar (P2) | Conectividade | sim |  |


## Eletrônicos, TV e Áudio › Câmeras digitais  `eletronicos-tv-e-audio-cameras-digitais`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tipo_camera` | Tipo | seleção | spec | sim |  | 5 opções: Compacta / Reflex (DSLR) / Mirrorless / Ação (tipo GoPro) / Instantânea | Geral | sim |  |
| 30 | `megapixels` | Resolução | número | spec |  | MP | 1 a 200 MP; 1 casa(s) | Imagem |  |  |
| 40 | `video_max` | Vídeo máximo | seleção | spec |  |  | 4 opções: HD / Full HD / 4K / 8K | Imagem | sim |  |


## Eletrônicos, TV e Áudio › Câmeras de segurança  `eletronicos-tv-e-audio-cameras-de-seguranca`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_camera_seg` | Tipo | seleção | spec | sim |  | 5 opções: Câmara IP (Wi-Fi) / Câmara analógica (CFTV) / Câmara com painel solar / Kit de câmaras com gravador / Campainha com vídeo | Geral | sim |  |
| 20 | `resolucao` | Resolução | seleção | spec | sim |  | 4 opções: 720p (HD) / 1080p (Full HD) / 2K / 4K | Imagem | sim |  |
| 30 | `visao_noturna` | Visão noturna | sim/não | spec |  |  |  | Funções | sim |  |
| 40 | `uso_exterior` | Resistente para uso exterior | sim/não | spec |  |  |  | Uso | sim |  |
| 50 | `alimentacao` | Alimentação | seleção | spec |  |  | 4 opções: Tomada / Bateria / Painel solar / PoE (cabo de rede) | Energia | sim |  |


## Eletrônicos, TV e Áudio › Drones  `eletronicos-tv-e-audio-drones`

> Drones podem exigir autorização de uso/voo. A política de venda (permitida/restrita) é decisão do dono: a matriz NÃO inclui campos jurídicos.

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `resolucao` | Qualidade da câmara | seleção | spec |  |  | 4 opções: Sem câmara / HD / Full HD / 4K | Imagem | sim |  |
| 30 | `autonomia_min` | Autonomia de voo | número | spec |  | min | 3 a 120 min; inteiro | Desempenho |  |  |
| 40 | `alcance_m` | Alcance de controlo | número | spec |  | m | 10 a 20000 m; inteiro | Desempenho |  |  |


## Eletrônicos, TV e Áudio › Acessórios de áudio e vídeo  `eletronicos-tv-e-audio-acessorios-de-audio-e-video`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tipo_acessorio` | Tipo | seleção | spec | sim |  | 7 opções: Cabo HDMI / Cabo de áudio / Suporte de TV/parede / Antena / Receptor digital (TDT) / Microfone / Outro | Geral | sim |  |
| 30 | `compativel_com` | Compatível com | texto | spec |  |  | até 120 car. | Compatibilidade |  |  |


## Eletrônicos, TV e Áudio › Controles remotos  `eletronicos-tv-e-audio-controles-remotos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_controle` | Tipo | seleção | spec | sim |  | 3 opções: Universal / Original / Compatível | Geral | sim |  |
| 20 | `compativel_com` | Compatível com | texto | spec | sim |  | até 150 car. | Compatibilidade |  | Ex.: TV Samsung, Ar-condicionado LG |


## Eletrodomésticos  `eletrodomesticos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `voltagem` | Voltagem | seleção | eixo |  |  | 3 opções: 220V / 110V / Bivolt (110-240V) |  | sim | Tensão de funcionamento do aparelho. Na Guiné-Bissau a rede é de 220V. |
| 30 | `potencia_w` | Potência | número | spec |  | W | 1 a 20000 W; inteiro | Energia | sim |  |


## Eletrodomésticos › Geladeiras e frigoríficos  `eletrodomesticos-geladeiras-e-frigorificos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `capacidade_litros` | Capacidade total | número | spec | sim | L | 20 a 1500 L; inteiro | Capacidade | sim |  |
| 20 | `portas` | Portas | seleção | spec |  |  | 4 opções: 1 porta / 2 portas / 3 portas / Lado a lado (side by side) | Geral | sim |  |
| 30 | `frost_free` | Frost free (sem gelo acumulado) | sim/não | spec |  |  |  | Funções | sim |  |
| 40 | `classe_energetica` | Classe energética | seleção | spec |  |  | 7 opções: A / B / C / D / E / F / G | Energia | sim |  |


## Eletrodomésticos › Congeladores e arcas  `eletrodomesticos-congeladores-e-arcas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `capacidade_litros` | Capacidade total | número | spec | sim | L | 50 a 1500 L; inteiro | Capacidade | sim |  |
| 20 | `tipo_congelador` | Tipo | seleção | spec |  |  | 3 opções: Arca horizontal / Vertical / Arca com tampa dupla | Geral | sim |  |
| 30 | `classe_energetica` | Classe energética | seleção | spec |  |  | 7 opções: A / B / C / D / E / F / G | Energia | sim |  |


## Eletrodomésticos › Fogões e fornos  `eletrodomesticos-fogoes-e-fornos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_fogao` | Tipo | seleção | spec | sim |  | 6 opções: Fogão a gás / Fogão elétrico / Fogão misto / Fogão de mesa / Forno elétrico / Forno a gás | Geral | sim |  |
| 20 | `bocas` | Número de bocas | seleção | spec |  |  | 6 opções: 1 / 2 / 3 / 4 / 5 / 6 | Geral | sim |  |
| 30 | `tem_forno` | Com forno | sim/não | spec |  |  |  | Funções | sim |  |
| 40 | `acendimento_automatico` | Acendimento automático | sim/não | spec |  |  |  | Funções | sim |  |


## Eletrodomésticos › Micro-ondas  `eletrodomesticos-micro-ondas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `capacidade_litros` | Capacidade | número | spec | sim | L | 5 a 100 L; inteiro | Capacidade | sim |  |
| 20 | `com_grill` | Com grill | sim/não | spec |  |  |  | Funções | sim |  |
| 30 | `painel` | Painel | seleção | spec |  |  | 2 opções: Mecânico / Digital | Geral | sim |  |


## Eletrodomésticos › Máquinas de lavar  `eletrodomesticos-maquinas-de-lavar`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `capacidade_kg` | Capacidade de roupa | número | spec | sim | kg | 1 a 30 kg; inteiro | Capacidade | sim |  |
| 20 | `tipo_lavagem` | Tipo | seleção | spec |  |  | 4 opções: Carga frontal / Carga superior / Semiautomática (tanque duplo) / Lava e seca | Geral | sim |  |
| 30 | `seca_roupa` | Seca a roupa | sim/não | spec |  |  |  | Funções | sim |  |


## Eletrodomésticos › Ventiladores  `eletrodomesticos-ventiladores`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_ventilador` | Tipo | seleção | spec | sim |  | 7 opções: Pedestal / Mesa / Parede / Teto / Torre / Recarregável / Mini USB | Geral | sim |  |
| 20 | `diametro_cm` | Diâmetro da hélice | número | spec |  | cm | 10 a 120 cm; inteiro | Medidas |  |  |
| 30 | `velocidades` | Número de velocidades | número | spec |  |  | 1 a 12; inteiro | Funções |  |  |
| 40 | `controle_remoto` | Com controlo remoto | sim/não | spec |  |  |  | Funções | sim |  |


## Eletrodomésticos › Ar-condicionado  `eletrodomesticos-ar-condicionado`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `capacidade_btu` | Capacidade | seleção | spec | sim |  | 6 opções: 9000 BTU / 12000 BTU / 18000 BTU / 24000 BTU / 30000 BTU / 36000 BTU | Capacidade | sim |  |
| 20 | `tipo_ar` | Tipo | seleção | spec | sim |  | 5 opções: Split (parede) / Janela / Portátil / Cassete/Teto / Coluna | Geral | sim |  |
| 30 | `inverter` | Inverter (poupança de energia) | sim/não | spec |  |  |  | Energia | sim |  |
| 40 | `ciclo` | Ciclo | seleção | spec |  |  | 2 opções: Só frio / Quente e frio | Geral | sim |  |


## Eletrodomésticos › Liquidificadores  `eletrodomesticos-liquidificadores`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `capacidade_litros` | Capacidade do copo | número | spec |  | L | 0.2 a 6 L; 1 casa(s) | Capacidade |  |  |
| 20 | `velocidades` | Número de velocidades | número | spec |  |  | 1 a 12; inteiro | Funções |  |  |
| 30 | `material_copo` | Material do copo | seleção | spec |  |  | 3 opções: Vidro / Plástico / Aço inoxidável | Materiais | sim |  |


## Eletrodomésticos › Ferros de passar  `eletrodomesticos-ferros-de-passar`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_ferro` | Tipo | seleção | spec |  |  | 4 opções: A seco / A vapor / Gerador de vapor / A carvão | Geral | sim |  |
| 20 | `base_ferro` | Base | seleção | spec |  |  | 4 opções: Antiaderente / Cerâmica / Aço inoxidável / Alumínio | Materiais | sim |  |


## Eletrodomésticos › Pequenos eletrodomésticos  `eletrodomesticos-pequenos-eletrodomesticos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_pequeno` | Tipo | seleção | spec | sim |  | 10 opções: Torradeira / Cafeteira / Batedeira / Sanduicheira / Fritadeira (air fryer) / Chaleira elétrica / Panela elétrica / Arrozeira / Espremedor / Outro | Geral | sim |  |
| 20 | `capacidade_litros` | Capacidade | número | spec |  | L | 0.1 a 30 L; 1 casa(s) | Capacidade |  |  |


## Eletrodomésticos › Peças e acessórios  `eletrodomesticos-pecas-e-acessorios`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_peca` | Tipo | seleção | spec | sim |  | 8 opções: Resistência / Motor / Termóstato / Borracha/vedante / Prateleira/gaveta / Placa eletrónica / Controlo remoto / Outra peça | Geral | sim |  |
| 20 | `compativel_com` | Compatível com | texto | spec | sim |  | até 150 car. | Compatibilidade |  | Ex.: geladeira Panasonic NR-B |

- **Desativa** o herdado `voltagem` nesta categoria
- **Desativa** o herdado `potencia_w` nesta categoria

## Games e Consoles › Consoles de jogos  `games-e-consoles-consoles-de-jogos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `capacidade` | Armazenamento | seleção | eixo |  |  | 7 opções: 64 GB / 128 GB / 256 GB / 500 GB / 825 GB / 1 TB / 2 TB |  | sim |  |
| 30 | `plataforma` | Plataforma | seleção | spec | sim |  | 4 opções: PlayStation / Xbox / Nintendo / Retro/Outro | Geral | sim |  |
| 40 | `geracao_console` | Geração/versão | seleção | spec |  |  | 8 opções: PS3 / PS4 / PS5 / Xbox 360 / Xbox One / Xbox Series / Switch / Outra | Geral | sim |  |


## Games e Consoles › Jogos físicos  `games-e-consoles-jogos-fisicos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `plataforma` | Plataforma | seleção | spec | sim |  | 5 opções: PlayStation / Xbox / Nintendo / PC / Retro/Outro | Geral | sim |  |
| 20 | `titulo_jogo` | Título do jogo | texto | spec | sim |  | até 120 car. | Geral |  |  |
| 30 | `classificacao_idade` | Classificação etária | seleção | spec |  |  | 5 opções: Livre / +7 / +12 / +16 / +18 | Geral | sim |  |


## Games e Consoles › Controles  `games-e-consoles-controles`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `plataforma` | Compatível com | seleção | spec | sim |  | 6 opções: PlayStation / Xbox / Nintendo / PC / Telemóvel / Vários | Compatibilidade | sim |  |
| 30 | `ligacao` | Ligação | seleção | spec |  |  | 3 opções: Com fio / Sem fio / Com fio e sem fio | Conectividade | sim |  |


## Games e Consoles › Acessórios para consoles  `games-e-consoles-acessorios-para-consoles`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `plataforma` | Compatível com | seleção | spec | sim |  | 5 opções: PlayStation / Xbox / Nintendo / PC / Vários | Compatibilidade | sim |  |
| 30 | `tipo_acessorio` | Tipo | seleção | spec |  |  | 6 opções: Carregador/base / Cabo / Capa/estojo / Headset / Cartão de memória / Outro | Geral | sim |  |


## Games e Consoles › Equipamentos gamer  `games-e-consoles-equipamentos-gamer`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tipo_gamer` | Tipo | seleção | spec | sim |  | 7 opções: Cadeira gamer / Headset gamer / Teclado gamer / Mouse gamer / Mesa gamer / Placa de captura / Outro | Geral | sim |  |
| 30 | `iluminacao_rgb` | Iluminação RGB | sim/não | spec |  |  |  | Funções | sim |  |


## Games e Consoles › Peças para consoles  `games-e-consoles-pecas-para-consoles`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `plataforma` | Compatível com | seleção | spec | sim |  | 4 opções: PlayStation / Xbox / Nintendo / Vários | Compatibilidade | sim |  |
| 20 | `tipo_peca` | Tipo de peça | seleção | spec |  |  | 6 opções: Leitor/lente / Fonte / Ventoinha / Botões/direcionais / Carcaça / Outra peça | Geral | sim |  |


## Moda Feminina  `moda-feminina`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo | sim |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tamanho` | Tamanho | seleção | eixo | sim |  | 19 opções: Único / PP / P / M / G / GG / XG / XXG / 34 / 36 / 38 / 40 / 42 / 44 / 46 / 48 / 50 / 52 / 54 |  | sim | Escolha o tamanho de cada variação. Pode usar letras (P, M, G) ou números. |
| 30 | `material` | Material principal | seleção | spec |  |  | 11 opções: Algodão / Poliéster / Linho / Seda / Lã / Jeans / Cetim / Renda / Viscose / Malha / Misto | Materiais | sim |  |
| 40 | `ocasiao` | Ocasião | múltipla | spec |  |  | 6 opções: Casual / Trabalho / Festa e cerimónia / Desporto / Tradicional / Dia a dia | Estilo | sim |  |


## Moda Feminina › Vestidos  `moda-feminina-vestidos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `comprimento_peca` | Comprimento da peça | seleção | spec |  |  | 3 opções: Mini / Midi / Longo | Estilo | sim |  |
| 20 | `manga` | Manga | seleção | spec |  |  | 4 opções: Sem manga / Curta / 3/4 / Longa | Estilo | sim |  |


## Moda Feminina › Blusas e camisetas  `moda-feminina-blusas-e-camisetas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `manga` | Manga | seleção | spec |  |  | 4 opções: Sem manga / Curta / 3/4 / Longa | Estilo | sim |  |
| 20 | `decote` | Decote | seleção | spec |  |  | 5 opções: Redondo / Em V / Quadrado / Gola alta / Ombro a ombro | Estilo | sim |  |


## Moda Feminina › Saias  `moda-feminina-saias`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `comprimento_peca` | Comprimento da peça | seleção | spec |  |  | 3 opções: Mini / Midi / Longa | Estilo | sim |  |


## Moda Feminina › Calças  `moda-feminina-calcas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_calca` | Tipo | seleção | spec |  |  | 6 opções: Jeans / Alfaiataria / Leggings / Jogger / Cargo / Larga (pantalona) | Estilo | sim |  |
| 20 | `cintura` | Cintura | seleção | spec |  |  | 3 opções: Alta / Média / Baixa | Estilo | sim |  |


## Moda Feminina › Conjuntos  `moda-feminina-conjuntos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `numero_pecas` | Número de peças | número | spec |  |  | 2 a 6; inteiro | Geral |  |  |


## Moda Feminina › Roupas tradicionais africanas  `moda-feminina-roupas-tradicionais-africanas`

> Override do material do root com tecidos africanos (Bazin, Wax, Capulana, Pano de pinti).

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_traje` | Tipo de traje | seleção | spec |  |  | 6 opções: Vestido / Conjunto / Boubou/Bubu / Blusa e pano / Saia / Outro | Geral | sim |  |

- **Override** `material`: {"options":["Bazin","Wax (tecido africano)","Capulana","Pano de pinti","Algodão","Seda","Misto"]}

## Moda Feminina › Roupas íntimas  `moda-feminina-roupas-intimas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_intima` | Tipo | seleção | spec | sim |  | 6 opções: Sutiã / Cuecas/calcinhas / Conjunto / Cinta / Camisa de dormir / Pijama | Geral | sim |  |

- **Override** `material`: {"options":["Algodão","Poliéster","Renda","Seda","Malha","Misto"]}

## Moda Feminina › Moda praia  `moda-feminina-moda-praia`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_praia` | Tipo | seleção | spec |  |  | 5 opções: Biquíni / Fato de banho / Saída de praia / Calção/Short / Sarong | Geral | sim |  |


## Moda Feminina › Roupas esportivas  `moda-feminina-roupas-esportivas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_desporto` | Tipo | seleção | spec |  |  | 6 opções: Top / Leggings / Short / Camiseta / Conjunto / Casaco | Geral | sim |  |


## Moda Feminina › Casacos  `moda-feminina-casacos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_casaco` | Tipo | seleção | spec |  |  | 6 opções: Casaco / Blazer / Colete / Cardigan / Blusão / Impermeável | Geral | sim |  |


## Moda Masculina  `moda-masculina`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo | sim |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tamanho` | Tamanho | seleção | eixo | sim |  | 19 opções: Único / PP / P / M / G / GG / XG / XXG / 34 / 36 / 38 / 40 / 42 / 44 / 46 / 48 / 50 / 52 / 54 |  | sim | Escolha o tamanho de cada variação. Pode usar letras (P, M, G) ou números. |
| 30 | `material` | Material principal | seleção | spec |  |  | 11 opções: Algodão / Poliéster / Linho / Seda / Lã / Jeans / Cetim / Renda / Viscose / Malha / Misto | Materiais | sim |  |
| 40 | `ocasiao` | Ocasião | múltipla | spec |  |  | 6 opções: Casual / Trabalho / Festa e cerimónia / Desporto / Tradicional / Dia a dia | Estilo | sim |  |


## Moda Masculina › Camisas  `moda-masculina-camisas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `manga` | Manga | seleção | spec |  |  | 2 opções: Curta / Longa | Estilo | sim |  |
| 20 | `corte` | Corte | seleção | spec |  |  | 3 opções: Clássico / Slim / Largo | Estilo | sim |  |


## Moda Masculina › Camisetas e polos  `moda-masculina-camisetas-e-polos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_camiseta` | Tipo | seleção | spec |  |  | 4 opções: Camiseta / Polo / Regata / Manga longa | Geral | sim |  |


## Moda Masculina › Calças  `moda-masculina-calcas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_calca` | Tipo | seleção | spec |  |  | 6 opções: Jeans / Alfaiataria / Jogger / Cargo / Sarja / Fato de treino | Estilo | sim |  |


## Moda Masculina › Bermudas  `moda-masculina-bermudas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_bermuda` | Tipo | seleção | spec |  |  | 4 opções: Jeans / Sarja / Desportiva / Praia | Estilo | sim |  |


## Moda Masculina › Fatos e blazers  `moda-masculina-fatos-e-blazers`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_fato` | Tipo | seleção | spec | sim |  | 4 opções: Fato completo / Blazer / Colete / Smoking | Geral | sim |  |
| 20 | `numero_pecas` | Número de peças | número | spec |  |  | 1 a 5; inteiro | Geral |  |  |


## Moda Masculina › Roupas tradicionais africanas  `moda-masculina-roupas-tradicionais-africanas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_traje` | Tipo de traje | seleção | spec |  |  | 5 opções: Conjunto (calça e camisa) / Boubou/Bubu / Kaftan / Camisa / Outro | Geral | sim |  |

- **Override** `material`: {"options":["Bazin","Wax (tecido africano)","Capulana","Pano de pinti","Algodão","Seda","Misto"]}

## Moda Masculina › Roupa íntima  `moda-masculina-roupa-intima`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_intima` | Tipo | seleção | spec | sim |  | 5 opções: Cuecas / Boxers / Camisola interior / Meias / Pijama | Geral | sim |  |

- **Override** `material`: {"options":["Algodão","Poliéster","Malha","Misto"]}

## Moda Masculina › Roupa esportiva  `moda-masculina-roupa-esportiva`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_desporto` | Tipo | seleção | spec |  |  | 5 opções: Camiseta / Short / Fato de treino / Casaco / Camisola de equipa | Geral | sim |  |


## Moda Masculina › Casacos  `moda-masculina-casacos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_casaco` | Tipo | seleção | spec |  |  | 5 opções: Casaco / Blusão / Colete / Impermeável / Sobretudo | Geral | sim |  |


## Moda Masculina › Uniformes  `moda-masculina-uniformes`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_uniforme` | Uso do uniforme | seleção | spec | sim |  | 6 opções: Escolar / Trabalho / Segurança / Saúde / Restauração / Desporto | Geral | sim |  |


## Calçados  `calcados`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo | sim |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tamanho` | Numeração | seleção | eixo | sim |  | 13 opções: 35 / 36 / 37 / 38 / 39 / 40 / 41 / 42 / 43 / 44 / 45 / 46 / 47 |  | sim | Número do calçado de cada variação. |
| 30 | `material_cabedal` | Material do cabedal | seleção | spec |  |  | 7 opções: Couro natural / Couro sintético / Lona / Nylon / Plástico / Borracha / Outro | Materiais | sim |  |
| 40 | `tipo_solado` | Solado | seleção | spec |  |  | 4 opções: Borracha / Sintético (EVA/PU) / Couro / Madeira/Cortiça | Materiais | sim |  |


## Calçados › Sapatos masculinos  `calcados-sapatos-masculinos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_sapato` | Tipo | seleção | spec |  |  | 5 opções: Social / Casual / Mocassim / Sapatilha / Bota curta | Geral | sim |  |


## Calçados › Sapatos femininos  `calcados-sapatos-femininos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_sapato` | Tipo | seleção | spec |  |  | 6 opções: Sapatilha / Salto alto / Salto baixo / Rasteira / Plataforma / Mocassim | Geral | sim |  |
| 20 | `altura_salto` | Altura do salto | seleção | spec |  |  | 4 opções: Sem salto / Baixo (até 4 cm) / Médio (4-7 cm) / Alto (mais de 7 cm) | Medidas | sim |  |


## Calçados › Tênis  `calcados-tenis`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `uso_tenis` | Uso | seleção | spec |  |  | 6 opções: Casual / Corrida / Futebol / Basquetebol / Treino / Skate | Geral | sim |  |


## Calçados › Sandálias  `calcados-sandalias`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_sandalia` | Tipo | seleção | spec |  |  | 5 opções: Rasteira / Salto / Plataforma / Papete / Tipo chinelo | Geral | sim |  |


## Calçados › Chinelos  `calcados-chinelos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_chinelo` | Tipo | seleção | spec |  |  | 4 opções: De dedo / Slide / Casa/interior / Praia | Geral | sim |  |


## Calçados › Botas  `calcados-botas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_bota` | Tipo | seleção | spec |  |  | 5 opções: Cano curto / Cano alto / Trabalho / Chuva (borracha) / Montaria | Geral | sim |  |


## Calçados › Calçados infantis  `calcados-calcados-infantis`

> Override da numeração: números infantis (17-34) em vez dos adultos.

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `faixa_etaria` | Faixa etária | seleção | spec |  |  | 3 opções: Bebé / Criança / Júnior | Geral | sim |  |

- **Override** `tamanho`: {"options":["17","18","19","20","21","22","23","24","25","26","27","28","29","30","31","32","33","34","35","36"]}

## Calçados › Calçados de segurança  `calcados-calcados-de-seguranca`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `protecao` | Proteção | múltipla | spec | sim |  | 6 opções: Biqueira de aço / Biqueira composta / Palmilha anti-perfuração / Solado antiderrapante / Isolamento elétrico / Resistente a óleo | Segurança | sim |  |


## Calçados › Acessórios para calçados  `calcados-acessorios-para-calcados`

> Sem numeração: acessórios não têm número de calçado.

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_acessorio` | Tipo | seleção | spec | sim |  | 6 opções: Palmilha / Atacadores / Graxa/produto de limpeza / Calçadeira / Sapateira / Outro | Geral | sim |  |

- **Desativa** o herdado `tamanho` nesta categoria
- **Desativa** o herdado `material_cabedal` nesta categoria
- **Desativa** o herdado `tipo_solado` nesta categoria

## Bolsas, Malas e Acessórios  `bolsas-malas-e-acessorios`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo | sim |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `material` | Material | seleção | spec |  |  | 8 opções: Couro natural / Couro sintético / Lona / Nylon / Plástico / Palha / Borracha / Outro | Materiais | sim |  |


## Bolsas, Malas e Acessórios › Bolsas femininas  `bolsas-malas-e-acessorios-bolsas-femininas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_bolsa` | Tipo | seleção | spec |  |  | 6 opções: Tiracolo / Mão / Ombro / Tote / Clutch/Carteira de festa / Bolsa térmica | Geral | sim |  |


## Bolsas, Malas e Acessórios › Mochilas  `bolsas-malas-e-acessorios-mochilas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `capacidade_litros` | Capacidade | número | spec |  | L | 1 a 120 L; inteiro | Capacidade |  |  |
| 20 | `compartimento_portatil` | Compartimento para portátil | sim/não | spec |  |  |  | Funções | sim |  |


## Bolsas, Malas e Acessórios › Malas de viagem  `bolsas-malas-e-acessorios-malas-de-viagem`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tamanho` | Tamanho | seleção | eixo |  |  | 4 opções: Cabine (pequena) / Média / Grande / Extra grande |  | sim |  |
| 20 | `rodas` | Com rodas | sim/não | spec |  |  |  | Funções | sim |  |
| 30 | `cadeado` | Com cadeado | sim/não | spec |  |  |  | Funções | sim |  |


## Bolsas, Malas e Acessórios › Carteiras  `bolsas-malas-e-acessorios-carteiras`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_carteira` | Tipo | seleção | spec |  |  | 4 opções: Carteira masculina / Carteira feminina / Porta-cartões / Porta-moedas | Geral | sim |  |


## Bolsas, Malas e Acessórios › Cintos  `bolsas-malas-e-acessorios-cintos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tamanho` | Tamanho | seleção | eixo |  |  | 8 opções: 85 cm / 90 cm / 95 cm / 100 cm / 105 cm / 110 cm / 115 cm / 120 cm |  | sim |  |
| 20 | `tipo_cinto` | Tipo | seleção | spec |  |  | 3 opções: Social / Casual / Desportivo | Geral | sim |  |


## Bolsas, Malas e Acessórios › Bonés e chapéus  `bolsas-malas-e-acessorios-bones-e-chapeus`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tamanho` | Tamanho | seleção | eixo |  |  | 4 opções: Único (ajustável) / P / M / G |  | sim |  |
| 20 | `tipo_chapeu` | Tipo | seleção | spec |  |  | 5 opções: Boné / Chapéu / Gorro / Viseira / Turbante/lenço de cabeça | Geral | sim |  |


## Bolsas, Malas e Acessórios › Óculos de sol  `bolsas-malas-e-acessorios-oculos-de-sol`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_lente` | Tipo de lente | seleção | spec |  |  | 4 opções: Polarizada / Espelhada / Degradê / Fotocromática | Lentes | sim |  |
| 20 | `protecao_uv` | Proteção UV | sim/não | spec |  |  |  | Lentes | sim |  |


## Bolsas, Malas e Acessórios › Relógios  `bolsas-malas-e-acessorios-relogios`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_relogio` | Tipo | seleção | spec | sim |  | 4 opções: Analógico / Digital / Misto (analógico/digital) / Smartwatch | Geral | sim |  |
| 20 | `publico` | Público | seleção | spec |  |  | 4 opções: Masculino / Feminino / Unissex / Infantil | Geral | sim |  |
| 30 | `resistente_agua` | Resistente à água | sim/não | spec |  |  |  | Uso | sim |  |


## Bolsas, Malas e Acessórios › Joias e bijuterias  `bolsas-malas-e-acessorios-joias-e-bijuterias`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_joia` | Tipo | seleção | spec | sim |  | 7 opções: Colar / Brincos / Pulseira / Anel / Conjunto / Pendente / Tornozeleira | Geral | sim |  |

- **Override** `material`: {"options":["Ouro","Prata","Aço inoxidável","Folheado a ouro","Bijuteria (metal)","Pérolas","Contas/missangas","Outro"]}

## Bolsas, Malas e Acessórios › Acessórios de cabelo  `bolsas-malas-e-acessorios-acessorios-de-cabelo`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_acessorio_cabelo` | Tipo | seleção | spec |  |  | 6 opções: Elásticos / Travessas/ganchos / Faixas/bandanas / Lenços / Tiaras / Pentes | Geral | sim |  |

- **Desativa** o herdado `material` nesta categoria

## Beleza e Cuidados Pessoais  `beleza-e-cuidados-pessoais`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `publico_alvo` | Público | seleção | spec |  |  | 4 opções: Feminino / Masculino / Unissex / Infantil | Geral | sim |  |
| 20 | `validade_info` | Validade (se aplicável) | texto | spec |  |  | até 60 car. | Segurança |  | Indique o prazo de validade ou a data limite. |


## Beleza e Cuidados Pessoais › Perfumes  `beleza-e-cuidados-pessoais-perfumes`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `capacidade` | Volume | seleção | eixo | sim |  | 6 opções: 30 ml / 50 ml / 75 ml / 100 ml / 125 ml / 200 ml |  | sim | Volume do frasco. |
| 20 | `tipo_perfume` | Concentração | seleção | spec |  |  | 6 opções: Perfume (Parfum) / Eau de Parfum / Eau de Toilette / Colónia / Body splash / Óleo perfumado | Geral | sim |  |
| 30 | `familia_olfativa` | Família olfativa | seleção | spec |  |  | 6 opções: Floral / Amadeirado / Cítrico / Oriental / Fresco / Doce | Geral | sim |  |


## Beleza e Cuidados Pessoais › Maquiagem  `beleza-e-cuidados-pessoais-maquiagem`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Tom / Cor | seleção | eixo |  |  | 20 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado / Nude / Bordô / Coral |  | sim | Tom da base, batom ou sombra. |
| 20 | `tipo_maquiagem` | Tipo | seleção | spec | sim |  | 10 opções: Base / Batom / Pó compacto / Rímel / Sombra / Lápis/Delineador / Blush / Corretivo / Kit / Outro | Geral | sim |  |


## Beleza e Cuidados Pessoais › Cuidados com a pele  `beleza-e-cuidados-pessoais-cuidados-com-a-pele`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `capacidade` | Volume | seleção | eixo |  |  | 6 opções: 30 ml / 50 ml / 100 ml / 200 ml / 400 ml / 500 ml |  | sim |  |
| 20 | `tipo_cuidado` | Tipo | seleção | spec | sim |  | 8 opções: Creme hidratante / Protetor solar / Sabonete facial / Óleo / Loção corporal / Manteiga de karité / Máscara facial / Outro | Geral | sim |  |
| 30 | `tipo_pele` | Tipo de pele | múltipla | spec |  |  | 6 opções: Normal / Seca / Oleosa / Mista / Sensível / Todos | Geral | sim |  |


## Beleza e Cuidados Pessoais › Produtos capilares  `beleza-e-cuidados-pessoais-produtos-capilares`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `capacidade` | Volume | seleção | eixo |  |  | 5 opções: 100 ml / 200 ml / 300 ml / 500 ml / 1 L |  | sim |  |
| 20 | `tipo_capilar` | Tipo | seleção | spec | sim |  | 8 opções: Champô / Condicionador / Máscara/tratamento / Óleo capilar / Creme de pentear / Gel/fixador / Alisante/relaxante / Tinta de cabelo | Geral | sim |  |
| 30 | `tipo_cabelo` | Tipo de cabelo | múltipla | spec |  |  | 6 opções: Liso / Ondulado / Cacheado/crespo / Seco / Oleoso / Todos | Geral | sim |  |


## Beleza e Cuidados Pessoais › Cabelos e extensões  `beleza-e-cuidados-pessoais-cabelos-e-extensoes`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor do cabelo | seleção | eixo | sim |  | 10 opções: Preto (1) / Castanho escuro (2) / Castanho (4) / Loiro escuro (27) / Loiro (613) / Vermelho (99J) / Azul / Rosa / Misto/Ombré / Outra cor |  | sim |  |
| 20 | `tamanho` | Comprimento | seleção | eixo | sim |  | 12 opções: 8 pol / 10 pol / 12 pol / 14 pol / 16 pol / 18 pol / 20 pol / 22 pol / 24 pol / 26 pol / 28 pol / 30 pol |  | sim | Comprimento do cabelo em polegadas. |
| 30 | `tipo_cabelo_ext` | Tipo | seleção | spec | sim |  | 4 opções: Cabelo humano / Sintético / Tranças/jumbo / Mistura (humano e sintético) | Geral | sim |  |
| 40 | `textura` | Textura | seleção | spec |  |  | 4 opções: Liso / Ondulado / Cacheado / Crespo/afro | Geral | sim |  |
| 50 | `quantidade_cabelo_g` | Quantidade de cabelo | número | spec |  | g | 10 a 1000 g; inteiro | Medidas |  | Gramas de cabelo no pacote (não é o peso da embalagem de envio). |


## Beleza e Cuidados Pessoais › Perucas  `beleza-e-cuidados-pessoais-perucas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo | sim |  | 8 opções: Preto / Castanho escuro / Castanho / Loiro / Ruivo / Cinzento / Colorido / Ombré |  | sim |  |
| 20 | `tamanho` | Comprimento | seleção | eixo |  |  | 4 opções: Curto (até 25 cm) / Médio (25-45 cm) / Longo (45-70 cm) / Extra longo (mais de 70 cm) |  | sim |  |
| 30 | `tipo_cabelo_ext` | Tipo | seleção | spec | sim |  | 3 opções: Cabelo humano / Sintético / Mistura | Geral | sim |  |
| 40 | `textura` | Textura | seleção | spec |  |  | 4 opções: Liso / Ondulado / Cacheado / Crespo/afro | Geral | sim |  |
| 50 | `tipo_touca` | Touca | seleção | spec |  |  | 4 opções: Lace frontal / Full lace / Touca tradicional / Sem touca (clip) | Geral | sim |  |


## Beleza e Cuidados Pessoais › Barbearia  `beleza-e-cuidados-pessoais-barbearia`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_barbearia` | Tipo | seleção | spec | sim |  | 6 opções: Máquina de cortar / Aparador / Navalha/lâminas / Pente/escova / Produtos para barba / Capa de barbeiro | Geral | sim |  |
| 20 | `alimentacao` | Alimentação | seleção | spec |  |  | 4 opções: Com fio / Bateria recarregável / Pilhas / Não aplicável | Energia | sim |  |


## Beleza e Cuidados Pessoais › Manicure e pedicure  `beleza-e-cuidados-pessoais-manicure-e-pedicure`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor do esmalte | seleção | eixo |  |  | 19 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado / Nude / Transparente |  | sim |  |
| 20 | `tipo_unhas` | Tipo | seleção | spec | sim |  | 6 opções: Esmalte / Unhas postiças / Alicates e cortadores / Lixas / Removedor / Kit de manicure | Geral | sim |  |


## Beleza e Cuidados Pessoais › Higiene pessoal  `beleza-e-cuidados-pessoais-higiene-pessoal`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `capacidade` | Volume / quantidade | seleção | eixo |  |  | 6 opções: 50 ml / 100 ml / 200 ml / 400 ml / 500 ml / 1 L |  | sim |  |
| 20 | `tipo_higiene` | Tipo | seleção | spec | sim |  | 9 opções: Sabonete / Gel de banho / Desodorizante / Pasta de dentes / Escova de dentes / Papel higiénico / Pensos higiénicos / Lenços / Outro | Geral | sim |  |


## Beleza e Cuidados Pessoais › Equipamentos de salão  `beleza-e-cuidados-pessoais-equipamentos-de-salao`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_equipamento` | Tipo | seleção | spec | sim |  | 7 opções: Secador / Prancha/alisador / Cadeira de salão / Lavatório / Capacete de secagem / Carrinho auxiliar / Outro | Geral | sim |  |
| 20 | `potencia_w` | Potência | número | spec |  | W | 50 a 5000 W; inteiro | Energia |  |  |

- **Desativa** o herdado `publico_alvo` nesta categoria
- **Desativa** o herdado `validade_info` nesta categoria

## Casa, Móveis e Decoração  `casa-moveis-e-decoracao`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 15 opções: Branco / Preto / Cinzento / Castanho / Bege / Azul / Verde / Vermelho / Amarelo / Rosa / Dourado / Prateado / Madeira natural / Multicolorido / Transparente |  | sim | Escolha a cor de cada variação. |


## Casa, Móveis e Decoração › Sofás e poltronas  `casa-moveis-e-decoracao-sofas-e-poltronas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_sofa` | Tipo | seleção | spec | sim |  | 5 opções: Sofá / Sofá-cama / Poltrona / Puff / Chaise | Geral | sim |  |
| 20 | `lugares` | Lugares | seleção | spec |  |  | 5 opções: 1 / 2 / 3 / 4 / 5 ou mais | Medidas | sim |  |
| 30 | `material_estofo` | Estofo | seleção | spec |  |  | 5 opções: Tecido / Couro / Couro sintético / Veludo / Palha/vime | Materiais | sim |  |


## Casa, Móveis e Decoração › Mesas e cadeiras  `casa-moveis-e-decoracao-mesas-e-cadeiras`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_movel` | Tipo | seleção | spec | sim |  | 6 opções: Mesa de jantar / Mesa de centro / Mesa lateral / Cadeira / Banco/Banqueta / Conjunto mesa e cadeiras | Geral | sim |  |
| 20 | `material_movel` | Material | seleção | spec |  |  | 8 opções: Madeira maciça / MDF / Metal / Plástico / Vime/Rattan / Estofado / Vidro / Misto | Materiais | sim |  |
| 30 | `lugares_mesa` | Lugares (mesas) | número | spec |  |  | 1 a 20; inteiro | Medidas |  |  |


## Casa, Móveis e Decoração › Camas e colchões  `casa-moveis-e-decoracao-camas-e-colchoes`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tamanho` | Tamanho | seleção | eixo | sim |  | 5 opções: Solteiro (90 cm) / Solteiro grande (105 cm) / Casal (138 cm) / Queen (160 cm) / King (180 cm) |  | sim |  |
| 20 | `tipo_cama` | Tipo | seleção | spec | sim |  | 5 opções: Cama (estrutura) / Colchão / Base de cama / Berço/cama infantil / Conjunto cama e colchão | Geral | sim |  |
| 30 | `tipo_colchao` | Tipo de colchão | seleção | spec |  |  | 5 opções: Espuma / Molas ensacadas / Molas / Látex / Visco-elástico | Materiais | sim |  |


## Casa, Móveis e Decoração › Guarda-roupas  `casa-moveis-e-decoracao-guarda-roupas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `numero_portas` | Portas | seleção | spec | sim |  | 5 opções: 2 / 3 / 4 / 5 / 6 ou mais | Medidas | sim |  |
| 20 | `material_movel` | Material | seleção | spec |  |  | 8 opções: Madeira maciça / MDF / Metal / Plástico / Vime/Rattan / Estofado / Vidro / Misto | Materiais | sim |  |
| 30 | `com_espelho` | Com espelho | sim/não | spec |  |  |  | Funções | sim |  |


## Casa, Móveis e Decoração › Estantes e armários  `casa-moveis-e-decoracao-estantes-e-armarios`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_armario` | Tipo | seleção | spec | sim |  | 6 opções: Estante / Armário / Aparador / Sapateira / Móvel de TV / Prateleira | Geral | sim |  |
| 20 | `material_movel` | Material | seleção | spec |  |  | 8 opções: Madeira maciça / MDF / Metal / Plástico / Vime/Rattan / Estofado / Vidro / Misto | Materiais | sim |  |


## Casa, Móveis e Decoração › Móveis de escritório  `casa-moveis-e-decoracao-moveis-de-escritorio`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_escritorio` | Tipo | seleção | spec | sim |  | 5 opções: Secretária / Cadeira de escritório / Arquivo / Estante / Mesa de reunião | Geral | sim |  |
| 20 | `regulavel_altura` | Regulável em altura | sim/não | spec |  |  |  | Funções | sim |  |


## Casa, Móveis e Decoração › Tapetes e cortinas  `casa-moveis-e-decoracao-tapetes-e-cortinas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tamanho` | Tamanho | seleção | eixo |  |  | 4 opções: Pequeno (até 1 m²) / Médio (1-3 m²) / Grande (mais de 3 m²) / Sob medida |  | sim |  |
| 20 | `tipo_tecido_casa` | Tipo | seleção | spec | sim |  | 5 opções: Tapete / Cortina / Estore / Passadeira / Capacho | Geral | sim |  |
| 30 | `material_tecido` | Material | seleção | spec |  |  | 6 opções: Algodão / Poliéster / Sisal / Veludo / Linho / Sintético | Materiais | sim |  |


## Casa, Móveis e Decoração › Decoração  `casa-moveis-e-decoracao-decoracao`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_decoracao` | Tipo | seleção | spec |  |  | 8 opções: Quadro/Pintura / Espelho / Vaso decorativo / Relógio de parede / Estátua/Escultura / Flores artificiais / Almofadas / Outro | Geral | sim |  |


## Casa, Móveis e Decoração › Iluminação  `casa-moveis-e-decoracao-iluminacao`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `voltagem` | Voltagem | seleção | eixo |  |  | 3 opções: 220V / 110V / Bivolt (110-240V) |  | sim | Tensão de funcionamento do aparelho. Na Guiné-Bissau a rede é de 220V. |
| 20 | `tipo_luz` | Tipo | seleção | spec | sim |  | 6 opções: Lustre/Candeeiro de teto / Candeeiro de mesa / Aplique de parede / Lâmpada / Fita LED / Lanterna | Geral | sim |  |
| 30 | `tipo_lampada` | Tecnologia | seleção | spec |  |  | 4 opções: LED / Fluorescente / Incandescente / Halogéneo | Energia | sim |  |
| 40 | `potencia_w` | Potência | número | spec |  | W | 1 a 1000 W; inteiro | Energia |  |  |
| 50 | `cor_luz` | Cor da luz | seleção | spec |  |  | 4 opções: Branca fria / Branca quente / Neutra / RGB (colorida) | Energia | sim |  |


## Casa, Móveis e Decoração › Organização doméstica  `casa-moveis-e-decoracao-organizacao-domestica`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_organizacao` | Tipo | seleção | spec |  |  | 7 opções: Caixa organizadora / Cesto / Cabide / Prateleira / Gancho / Saco de vácuo / Outro | Geral | sim |  |
| 20 | `material_movel` | Material | seleção | spec |  |  | 5 opções: Plástico / Metal / Madeira / Tecido / Vime/Rattan | Materiais | sim |  |


## Casa, Móveis e Decoração › Artigos para banheiro  `casa-moveis-e-decoracao-artigos-para-banheiro`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_banheiro` | Tipo | seleção | spec | sim |  | 7 opções: Toalhas / Tapete de banho / Cortina de duche / Suporte/acessório / Espelho / Balança / Outro | Geral | sim |  |


## Cozinha e Utilidades Domésticas  `cozinha-e-utilidades-domesticas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 15 opções: Branco / Preto / Cinzento / Castanho / Bege / Azul / Verde / Vermelho / Amarelo / Rosa / Dourado / Prateado / Madeira natural / Multicolorido / Transparente |  | sim | Escolha a cor de cada variação. |
| 20 | `material_utensilio` | Material | seleção | spec |  |  | 10 opções: Aço inoxidável / Alumínio / Ferro fundido / Plástico / Vidro / Cerâmica / Porcelana / Madeira / Silicone / Barro | Materiais | sim |  |


## Cozinha e Utilidades Domésticas › Panelas  `cozinha-e-utilidades-domesticas-panelas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `capacidade` | Capacidade | seleção | eixo |  |  | 8 opções: 1 L / 2 L / 3 L / 5 L / 8 L / 10 L / 15 L / 20 L |  | sim |  |
| 20 | `tipo_panela` | Tipo | seleção | spec | sim |  | 7 opções: Panela / Caçarola / Frigideira / Panela de pressão / Caldeirão / Conjunto de panelas / Wok | Geral | sim |  |
| 30 | `antiaderente` | Antiaderente | sim/não | spec |  |  |  | Materiais | sim |  |
| 40 | `tipo_fogao_compat` | Serve para | múltipla | spec |  |  | 4 opções: Gás / Elétrico / Indução / Carvão/lenha | Uso | sim |  |


## Cozinha e Utilidades Domésticas › Pratos e tigelas  `cozinha-e-utilidades-domesticas-pratos-e-tigelas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_louca` | Tipo | seleção | spec | sim |  | 6 opções: Prato raso / Prato fundo / Tigela/bowl / Travessa / Conjunto (jogo) / Prato de sobremesa | Geral | sim |  |
| 20 | `numero_pecas` | Número de peças | número | spec |  |  | 1 a 100; inteiro | Geral |  |  |
| 30 | `micro_ondas_seguro` | Pode ir ao micro-ondas | sim/não | spec |  |  |  | Uso | sim |  |


## Cozinha e Utilidades Domésticas › Copos e canecas  `cozinha-e-utilidades-domesticas-copos-e-canecas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `capacidade` | Capacidade | seleção | eixo |  |  | 6 opções: 150 ml / 250 ml / 350 ml / 500 ml / 750 ml / 1 L |  | sim |  |
| 20 | `tipo_copo` | Tipo | seleção | spec | sim |  | 6 opções: Copo / Caneca / Chávena / Taça / Jarro / Conjunto | Geral | sim |  |
| 30 | `numero_pecas` | Número de peças | número | spec |  |  | 1 a 48; inteiro | Geral |  |  |


## Cozinha e Utilidades Domésticas › Talheres  `cozinha-e-utilidades-domesticas-talheres`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_talher` | Tipo | seleção | spec | sim |  | 6 opções: Faca / Garfo / Colher / Conjunto de talheres / Colher de pau / Pauzinhos | Geral | sim |  |
| 20 | `numero_pecas` | Número de peças | número | spec |  |  | 1 a 150; inteiro | Geral |  |  |


## Cozinha e Utilidades Domésticas › Facas e utensílios  `cozinha-e-utilidades-domesticas-facas-e-utensilios`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_utensilio` | Tipo | seleção | spec | sim |  | 8 opções: Faca de cozinha / Faca de pão / Tábua de cortar / Ralador / Descascador / Concha/espátula / Machete/catana / Conjunto | Geral | sim |  |


## Cozinha e Utilidades Domésticas › Recipientes e conservação  `cozinha-e-utilidades-domesticas-recipientes-e-conservacao`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `capacidade` | Capacidade | seleção | eixo |  |  | 7 opções: 250 ml / 500 ml / 1 L / 2 L / 5 L / 10 L / 20 L |  | sim |  |
| 20 | `tipo_recipiente` | Tipo | seleção | spec | sim |  | 7 opções: Pote hermético / Marmita/Lancheira / Balde / Bacia / Cesta / Garrafão de água / Conjunto | Geral | sim |  |
| 30 | `com_tampa` | Com tampa | sim/não | spec |  |  |  | Funções | sim |  |


## Cozinha e Utilidades Domésticas › Garrafas térmicas  `cozinha-e-utilidades-domesticas-garrafas-termicas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `capacidade` | Capacidade | seleção | eixo | sim |  | 6 opções: 350 ml / 500 ml / 750 ml / 1 L / 1.5 L / 2 L |  | sim |  |
| 20 | `tipo_termica` | Tipo | seleção | spec |  |  | 4 opções: Garrafa térmica / Copo térmico / Jarro térmico / Marmita térmica | Geral | sim |  |
| 30 | `retencao_horas` | Mantém a temperatura | número | spec |  | h | 1 a 48 h; inteiro | Desempenho |  |  |


## Cozinha e Utilidades Domésticas › Utensílios de limpeza  `cozinha-e-utilidades-domesticas-utensilios-de-limpeza`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_limpeza` | Tipo | seleção | spec | sim |  | 8 opções: Vassoura / Esfregona/mopa / Balde / Pá do lixo / Escovas / Panos / Esponjas / Outro | Geral | sim |  |

- **Desativa** o herdado `material_utensilio` nesta categoria

## Cozinha e Utilidades Domésticas › Acessórios de cozinha  `cozinha-e-utilidades-domesticas-acessorios-de-cozinha`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_acessorio` | Tipo | seleção | spec |  |  | 8 opções: Escorredor / Abridor / Funil / Balança de cozinha / Peneira / Forma/assadeira / Avental / Outro | Geral | sim |  |


## Construção e Materiais › Cimento e argamassa  `construcao-e-materiais-cimento-e-argamassa`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_cimento` | Tipo | seleção | spec | sim |  | 6 opções: Cimento Portland / Cimento branco / Argamassa / Cola para ladrilhos / Reboco / Betão pronto | Geral | sim |  |
| 20 | `tamanho` | Embalagem | seleção | eixo | sim |  | 5 opções: 5 kg / 10 kg / 25 kg / 40 kg / 50 kg |  | sim | Peso do saco. |
| 30 | `classe_resistencia` | Classe de resistência | seleção | spec |  |  | 3 opções: 32.5 / 42.5 / 52.5 | Desempenho | sim |  |


## Construção e Materiais › Ferro e aço  `construcao-e-materiais-ferro-e-aco`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_ferro` | Tipo | seleção | spec | sim |  | 7 opções: Varão/vergalhão / Perfil / Chapa / Tubo / Cantoneira / Rede/malha / Arame | Geral | sim |  |
| 20 | `espessura_mm` | Espessura/diâmetro | número | spec |  | mm | 1 a 200 mm; 1 casa(s) | Medidas |  |  |
| 30 | `comprimento_barra_m` | Comprimento da peça | número | spec |  | m | 0.5 a 24 m; 1 casa(s) | Medidas |  |  |


## Construção e Materiais › Blocos e tijolos  `construcao-e-materiais-blocos-e-tijolos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_bloco` | Tipo | seleção | spec | sim |  | 5 opções: Bloco de cimento / Tijolo furado / Tijolo maciço / Bloco estrutural / Pavê/paralelepípedo | Geral | sim |  |
| 20 | `espessura_parede` | Espessura | seleção | spec |  |  | 4 opções: 10 cm / 12 cm / 15 cm / 20 cm | Medidas | sim |  |
| 30 | `unidades_pacote` | Unidades por lote | número | spec |  |  | 1 a 10000; inteiro | Geral |  |  |


## Construção e Materiais › Areia e brita  `construcao-e-materiais-areia-e-brita`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_agregado` | Tipo | seleção | spec | sim |  | 6 opções: Areia fina / Areia grossa / Brita 1 / Brita 2 / Pó de pedra / Cascalho | Geral | sim |  |
| 20 | `unidade_venda` | Vendido por | seleção | spec |  |  | 4 opções: Saco / Metro cúbico (m³) / Camião/viagem / Tonelada | Geral | sim |  |


## Construção e Materiais › Telhas e coberturas  `construcao-e-materiais-telhas-e-coberturas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_telha` | Tipo | seleção | spec | sim |  | 5 opções: Chapa de zinco / Telha cerâmica / Telha de fibrocimento / Telha metálica / Chapa translúcida | Geral | sim |  |
| 20 | `cor` | Cor | seleção | eixo |  |  | 6 opções: Natural / Vermelho / Cinzento / Verde / Azul / Branco |  | sim | Escolha a cor de cada variação. |
| 30 | `comprimento_telha_m` | Comprimento da peça | número | spec |  | m | 0.3 a 12 m; 2 casa(s) | Medidas |  |  |
| 40 | `espessura_mm` | Espessura | número | spec |  | mm | 0.1 a 50 mm; 2 casa(s) | Medidas |  |  |


## Construção e Materiais › Portas e janelas  `construcao-e-materiais-portas-e-janelas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_porta_janela` | Tipo | seleção | spec | sim |  | 6 opções: Porta interior / Porta exterior / Porta de ferro / Janela / Portão / Grade de proteção | Geral | sim |  |
| 20 | `material_porta` | Material | seleção | spec |  |  | 5 opções: Madeira / Ferro/Aço / Alumínio / PVC / Vidro | Materiais | sim |  |
| 30 | `abertura` | Abertura | seleção | spec |  |  | 4 opções: Batente / Correr / Basculante / Oscilo-batente | Geral | sim |  |


## Construção e Materiais › Tintas e vernizes  `construcao-e-materiais-tintas-e-vernizes`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `capacidade` | Volume | seleção | eixo | sim |  | 5 opções: 0.9 L / 3.6 L / 5 L / 18 L / 20 L |  | sim |  |
| 20 | `cor` | Cor | seleção | eixo |  |  | 10 opções: Branco / Preto / Cinzento / Bege / Azul / Verde / Amarelo / Vermelho / Castanho / Outra (sob pedido) |  | sim | Escolha a cor de cada variação. |
| 30 | `tipo_tinta` | Tipo | seleção | spec | sim |  | 7 opções: Tinta acrílica / Tinta a óleo / Esmalte / Verniz / Selador/primário / Massa corrida / Spray | Geral | sim |  |
| 40 | `acabamento` | Acabamento | seleção | spec |  |  | 3 opções: Fosco / Acetinado / Brilhante | Geral | sim |  |


## Construção e Materiais › Canalização e hidráulica  `construcao-e-materiais-canalizacao-e-hidraulica`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_canalizacao` | Tipo | seleção | spec | sim |  | 8 opções: Tubo PVC / Tubo PPR / Conexões / Torneira / Válvula/registo / Depósito/Reservatório / Bomba de água / Outro | Geral | sim |  |
| 20 | `diametro_nominal` | Diâmetro | seleção | spec |  |  | 8 opções: 1/2" / 3/4" / 1" / 1 1/4" / 1 1/2" / 2" / 3" / 4" | Medidas | sim |  |


## Construção e Materiais › Materiais elétricos  `construcao-e-materiais-materiais-eletricos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_eletrico` | Tipo | seleção | spec | sim |  | 7 opções: Cabo/Fio / Tomada/Interruptor / Disjuntor/Quadro / Lâmpada / Extensão/Régua / Fita isoladora / Outro | Geral | sim |  |
| 20 | `secao_cabo` | Secção do cabo | seleção | spec |  |  | 6 opções: 1.5 mm² / 2.5 mm² / 4 mm² / 6 mm² / 10 mm² / 16 mm² | Medidas | sim |  |
| 30 | `tensao_trabalho` | Tensão | seleção | spec |  |  | 4 opções: 220V / 110V / 12V / 24V | Energia | sim |  |


## Construção e Materiais › Pisos e revestimentos  `construcao-e-materiais-pisos-e-revestimentos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_piso` | Tipo | seleção | spec | sim |  | 6 opções: Ladrilho/Cerâmica / Porcelanato / Piso vinílico / Piso laminado / Azulejo / Mosaico | Geral | sim |  |
| 20 | `formato_piso` | Formato | seleção | spec |  |  | 6 opções: 20x20 cm / 30x30 cm / 40x40 cm / 45x45 cm / 60x60 cm / 80x80 cm | Medidas | sim |  |
| 30 | `area_m2` | Cobertura por caixa | número | spec |  | m² | 0.1 a 50 m²; 2 casa(s) | Medidas |  |  |


## Construção e Materiais › Louças sanitárias  `construcao-e-materiais-loucas-sanitarias`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 4 opções: Branco / Bege / Cinzento / Preto |  | sim | Escolha a cor de cada variação. |
| 20 | `tipo_louca_sanitaria` | Tipo | seleção | spec | sim |  | 7 opções: Sanita/Retrete / Lavatório / Bidé / Cuba / Cisterna / Base de duche / Conjunto | Geral | sim |  |


## Ferramentas e Máquinas › Ferramentas manuais  `ferramentas-e-maquinas-ferramentas-manuais`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_ferramenta` | Tipo | seleção | spec | sim |  | 8 opções: Martelo / Chaves de fenda / Alicates / Chaves inglesas / Serrote / Nível/Trena / Conjunto / Outro | Geral | sim |  |
| 20 | `numero_pecas` | Número de peças (kits) | número | spec |  |  | 1 a 500; inteiro | Geral |  |  |


## Ferramentas e Máquinas › Ferramentas elétricas  `ferramentas-e-maquinas-ferramentas-eletricas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `voltagem` | Voltagem | seleção | eixo |  |  | 3 opções: 220V / 110V / Bivolt (110-240V) |  | sim | Tensão de funcionamento do aparelho. Na Guiné-Bissau a rede é de 220V. |
| 20 | `tipo_ferramenta` | Tipo | seleção | spec | sim |  | 7 opções: Rebarbadora/Esmeril / Lixadeira / Plaina / Parafusadeira / Martelo demolidor / Pistola de calor / Outro | Geral | sim |  |
| 30 | `potencia_w` | Potência | número | spec |  | W | 50 a 5000 W; inteiro | Energia | sim |  |
| 40 | `alimentacao` | Alimentação | seleção | spec |  |  | 3 opções: Com fio / Bateria / Com fio e bateria | Energia | sim |  |


## Ferramentas e Máquinas › Furadeiras  `ferramentas-e-maquinas-furadeiras`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `voltagem` | Voltagem | seleção | eixo |  |  | 3 opções: 220V / 110V / Bivolt (110-240V) |  | sim | Tensão de funcionamento do aparelho. Na Guiné-Bissau a rede é de 220V. |
| 20 | `tipo_furadeira` | Tipo | seleção | spec | sim |  | 5 opções: Furadeira simples / Furadeira de impacto / Martelo perfurador / Berbequim a bateria / Furadeira de bancada | Geral | sim |  |
| 30 | `potencia_w` | Potência | número | spec |  | W | 100 a 3000 W; inteiro | Energia | sim |  |
| 40 | `mandril` | Mandril | seleção | spec |  |  | 4 opções: 10 mm / 13 mm / 16 mm / SDS | Geral | sim |  |


## Ferramentas e Máquinas › Serras  `ferramentas-e-maquinas-serras`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `voltagem` | Voltagem | seleção | eixo |  |  | 3 opções: 220V / 110V / Bivolt (110-240V) |  | sim | Tensão de funcionamento do aparelho. Na Guiné-Bissau a rede é de 220V. |
| 20 | `tipo_serra` | Tipo | seleção | spec | sim |  | 6 opções: Serra circular / Serra tico-tico / Serra de mesa / Motosserra / Serra manual / Serra de fita | Geral | sim |  |
| 30 | `potencia_w` | Potência | número | spec |  | W | 100 a 6000 W; inteiro | Energia |  |  |
| 40 | `alimentacao` | Alimentação | seleção | spec |  |  | 4 opções: Com fio / Bateria / Gasolina / Manual | Energia | sim |  |


## Ferramentas e Máquinas › Máquinas de solda  `ferramentas-e-maquinas-maquinas-de-solda`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `voltagem` | Voltagem | seleção | eixo |  |  | 3 opções: 220V / 380V (trifásico) / Bivolt (110-240V) |  | sim | Tensão de funcionamento do aparelho. Na Guiné-Bissau a rede é de 220V. |
| 20 | `tipo_solda` | Tipo | seleção | spec | sim |  | 6 opções: Eletrodo (MMA) / MIG/MAG / TIG / Inversora / Máscara de solda / Eletrodos/arame | Geral | sim |  |
| 30 | `corrente_max_a` | Corrente máxima | número | spec |  | A | 20 a 1000 A; inteiro | Energia |  |  |


## Ferramentas e Máquinas › Compressores  `ferramentas-e-maquinas-compressores`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `voltagem` | Voltagem | seleção | eixo |  |  | 3 opções: 220V / 110V / Bivolt (110-240V) |  | sim | Tensão de funcionamento do aparelho. Na Guiné-Bissau a rede é de 220V. |
| 20 | `tipo_compressor` | Tipo | seleção | spec |  |  | 4 opções: Pistão / Parafuso / Portátil/12V / Pintura (pistola) | Geral | sim |  |
| 30 | `capacidade_litros` | Capacidade do reservatório | número | spec |  | L | 1 a 1000 L; inteiro | Capacidade | sim |  |
| 40 | `pressao_bar` | Pressão máxima | número | spec |  | bar | 1 a 40 bar; inteiro | Desempenho |  |  |


## Ferramentas e Máquinas › Geradores  `ferramentas-e-maquinas-geradores`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `voltagem` | Voltagem | seleção | eixo |  |  | 3 opções: 220V / 110V / 220V/380V (trifásico) |  | sim | Tensão de funcionamento do aparelho. Na Guiné-Bissau a rede é de 220V. |
| 20 | `combustivel` | Combustível | seleção | spec | sim |  | 5 opções: Gasolina / Gasóleo / Gás / Dual (gasolina/gás) / Solar | Geral | sim |  |
| 30 | `potencia_kva` | Potência | número | spec | sim | kVA | 0.5 a 2000 kVA; 1 casa(s) | Energia | sim |  |
| 40 | `partida` | Partida | seleção | spec |  |  | 3 opções: Manual / Elétrica / Manual e elétrica | Geral | sim |  |
| 50 | `silencioso` | Silencioso (insonorizado) | sim/não | spec |  |  |  | Geral | sim |  |


## Ferramentas e Máquinas › Equipamentos de oficina  `ferramentas-e-maquinas-equipamentos-de-oficina`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_oficina` | Tipo | seleção | spec | sim |  | 7 opções: Macaco/Elevador / Bancada / Caixa de ferramentas / Prensa/Torno / Carregador de bateria / Extrator/Saca-pinos / Outro | Geral | sim |  |
| 20 | `capacidade_carga_kg` | Capacidade de carga | número | spec |  | kg | 1 a 20000 kg; inteiro | Capacidade |  |  |


## Ferramentas e Máquinas › Equipamentos de proteção  `ferramentas-e-maquinas-equipamentos-de-protecao`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tamanho` | Tamanho | seleção | eixo |  |  | 5 opções: Único / P / M / G / GG |  | sim |  |
| 20 | `tipo_epi` | Tipo | seleção | spec | sim |  | 8 opções: Capacete / Luvas / Óculos de proteção / Máscara/Respirador / Protetor auricular / Colete refletor / Cinto de segurança / Fato/Macacão | Geral | sim |  |
| 30 | `norma` | Norma/certificação | texto | spec |  |  | até 60 car. | Segurança |  | Ex.: EN 397 |


## Ferramentas e Máquinas › Peças para máquinas  `ferramentas-e-maquinas-pecas-para-maquinas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_peca` | Tipo de peça | seleção | spec | sim |  | 7 opções: Disco/Lâmina / Broca / Correia / Rolamento / Escovas de carvão / Filtro / Outra peça | Geral | sim |  |
| 20 | `compativel_com` | Compatível com | texto | spec | sim |  | até 150 car. | Compatibilidade |  |  |


## Energia Solar e Eletricidade › Painéis solares  `energia-solar-e-eletricidade-paineis-solares`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `potencia_wp` | Potência | número | spec | sim | Wp | 5 a 800 Wp; inteiro | Energia | sim |  |
| 20 | `tipo_celula` | Tecnologia | seleção | spec |  |  | 4 opções: Monocristalino / Policristalino / Flexível / Película fina | Geral | sim |  |
| 30 | `tensao_nominal` | Tensão | seleção | spec |  |  | 5 opções: 12V / 18V / 24V / 36V / 48V | Energia | sim |  |


## Energia Solar e Eletricidade › Baterias solares  `energia-solar-e-eletricidade-baterias-solares`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `capacidade` | Capacidade | seleção | eixo | sim |  | 8 opções: 7 Ah / 12 Ah / 45 Ah / 65 Ah / 100 Ah / 150 Ah / 200 Ah / 250 Ah |  | sim |  |
| 20 | `tecnologia_bateria` | Tecnologia | seleção | spec | sim |  | 4 opções: Chumbo-ácido (gel) / Chumbo-ácido (AGM) / Chumbo-ácido (aberta) / Lítio (LiFePO4) | Geral | sim |  |
| 30 | `tensao_nominal` | Tensão | seleção | spec |  |  | 4 opções: 6V / 12V / 24V / 48V | Energia | sim |  |


## Energia Solar e Eletricidade › Inversores  `energia-solar-e-eletricidade-inversores`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `potencia_w` | Potência | número | spec | sim | W | 100 a 20000 W; inteiro | Energia | sim |  |
| 20 | `tipo_inversor` | Tipo | seleção | spec |  |  | 4 opções: Onda senoidal pura / Onda modificada / Híbrido (com carregador) / Ligado à rede (on-grid) | Geral | sim |  |
| 30 | `tensao_entrada` | Tensão de entrada | seleção | spec |  |  | 4 opções: 12V / 24V / 48V / 96V | Energia | sim |  |
| 40 | `tensao_saida` | Tensão de saída | seleção | spec |  |  | 3 opções: 220V / 110V / 220V/110V | Energia | sim |  |


## Energia Solar e Eletricidade › Controladores de carga  `energia-solar-e-eletricidade-controladores-de-carga`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_controlador` | Tipo | seleção | spec | sim |  | 2 opções: PWM / MPPT | Geral | sim |  |
| 20 | `corrente_a` | Corrente | número | spec |  | A | 5 a 200 A; inteiro | Energia | sim |  |
| 30 | `tensao_sistema` | Tensão do sistema | seleção | spec |  |  | 4 opções: 12V / 12V/24V / 12V/24V/48V / 48V | Energia | sim |  |


## Energia Solar e Eletricidade › Kits solares  `energia-solar-e-eletricidade-kits-solares`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `potencia_total_w` | Potência do kit | número | spec |  | W | 5 a 20000 W; inteiro | Energia | sim |  |
| 20 | `itens_kit` | O kit inclui | múltipla | spec | sim |  | 7 opções: Painel solar / Bateria / Inversor / Controlador de carga / Lâmpadas / Cabos / Estrutura de fixação | Geral | sim |  |
| 30 | `uso_kit` | Uso | seleção | spec |  |  | 5 opções: Iluminação doméstica / Casa completa / Bomba de água / Comércio / Carregar telemóveis | Uso | sim |  |


## Energia Solar e Eletricidade › Lâmpadas solares  `energia-solar-e-eletricidade-lampadas-solares`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_lampada_solar` | Tipo | seleção | spec | sim |  | 5 opções: Lâmpada com painel / Holofote / Poste/candeeiro de jardim / Lanterna recarregável / Kit de lâmpadas | Geral | sim |  |
| 20 | `potencia_w` | Potência | número | spec |  | W | 1 a 500 W; inteiro | Energia |  |  |
| 30 | `autonomia_horas` | Autonomia | número | spec |  | h | 1 a 72 h; inteiro | Energia |  |  |


## Energia Solar e Eletricidade › Cabos e conectores  `energia-solar-e-eletricidade-cabos-e-conectores`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_cabo` | Tipo | seleção | spec | sim |  | 6 opções: Cabo solar / Conector MC4 / Cabo de bateria / Porta-fusível / Terminal / Outro | Geral | sim |  |
| 20 | `secao_cabo` | Secção | seleção | spec |  |  | 6 opções: 2.5 mm² / 4 mm² / 6 mm² / 10 mm² / 16 mm² / 25 mm² | Medidas | sim |  |
| 30 | `comprimento_cabo` | Comprimento do cabo | número | spec |  | m | 0.5 a 500 m; 1 casa(s) | Medidas |  |  |


## Energia Solar e Eletricidade › Estabilizadores e UPS  `energia-solar-e-eletricidade-estabilizadores-e-ups`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_protecao` | Tipo | seleção | spec | sim |  | 4 opções: Estabilizador / UPS/No-break / Régua com proteção / Transformador | Geral | sim |  |
| 20 | `potencia_va` | Potência | número | spec |  | VA | 100 a 20000 VA; inteiro | Energia | sim |  |
| 30 | `tensao_entrada` | Tensão | seleção | spec |  |  | 3 opções: 220V / 110V / Bivolt | Energia | sim |  |


## Energia Solar e Eletricidade › Sistemas de energia de emergência  `energia-solar-e-eletricidade-sistemas-de-energia-de-emergencia`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_emergencia` | Tipo | seleção | spec | sim |  | 4 opções: Sistema de backup doméstico / Estação de energia portátil / Luz de emergência / Power bank grande | Geral | sim |  |
| 20 | `capacidade_wh` | Capacidade de energia | número | spec |  | Wh | 50 a 50000 Wh; inteiro | Energia | sim |  |
| 30 | `potencia_w` | Potência de saída | número | spec |  | W | 50 a 20000 W; inteiro | Energia |  |  |


## Automóveis, Motos e Peças › Peças de automóveis  `automoveis-motos-e-pecas-pecas-de-automoveis`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_peca_auto` | Tipo de peça | seleção | spec | sim |  | 9 opções: Travões / Suspensão / Motor / Filtros / Embraiagem / Elétrica/Ignição / Carroçaria / Escape / Outra peça | Geral | sim |  |
| 20 | `compativel_veiculos` | Compatível com (marca/modelo/ano) | texto | spec | sim |  | até 200 car. | Compatibilidade |  | Essencial para o comprador saber se serve. |
| 30 | `tipo_origem_peca` | Origem | seleção | spec |  |  | 3 opções: Original / Compatível/Aftermarket / Usada | Geral | sim |  |


## Automóveis, Motos e Peças › Peças de motocicletas  `automoveis-motos-e-pecas-pecas-de-motocicletas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_peca_moto` | Tipo de peça | seleção | spec | sim |  | 8 opções: Travões / Corrente e pinhões / Pneus e câmaras / Filtros / Elétrica/Ignição / Carroçaria/plásticos / Escape / Outra peça | Geral | sim |  |
| 20 | `compativel_veiculos` | Compatível com (marca/modelo/cilindrada) | texto | spec | sim |  | até 200 car. | Compatibilidade |  | Ex.: Yamaha YBR 125 |
| 30 | `tipo_origem_peca` | Origem | seleção | spec |  |  | 3 opções: Original / Compatível/Aftermarket / Usada | Geral | sim |  |


## Automóveis, Motos e Peças › Pneus  `automoveis-motos-e-pecas-pneus`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `medida_pneu` | Medida | seleção | spec | sim |  | 14 opções: 155/70 R13 / 165/70 R13 / 175/65 R14 / 185/65 R15 / 195/55 R16 / 205/55 R16 / 215/60 R16 / 225/65 R17 / 235/65 R17 / 265/65 R17 / 90/90-18 / 2.75-17 / 3.00-17 / Outra medida | Medidas | sim | Está escrita na lateral do pneu. |
| 20 | `tipo_veiculo_pneu` | Para | seleção | spec | sim |  | 5 opções: Automóvel / Camioneta/SUV / Camião / Motocicleta / Bicicleta | Geral | sim |  |
| 30 | `estado_pneu` | Estado | seleção | spec |  |  | 2 opções: Novo / Usado/meio-uso | Geral | sim |  |


## Automóveis, Motos e Peças › Baterias automotivas  `automoveis-motos-e-pecas-baterias-automotivas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `capacidade` | Capacidade | seleção | eixo | sim |  | 8 opções: 35 Ah / 45 Ah / 60 Ah / 70 Ah / 90 Ah / 100 Ah / 150 Ah / 200 Ah |  | sim |  |
| 20 | `tensao_bateria` | Tensão | seleção | spec | sim |  | 3 opções: 6V / 12V / 24V | Energia | sim |  |
| 30 | `tipo_bateria_auto` | Tipo | seleção | spec |  |  | 4 opções: Chumbo-ácido / AGM / Gel / Lítio | Geral | sim |  |


## Automóveis, Motos e Peças › Óleos e lubrificantes  `automoveis-motos-e-pecas-oleos-e-lubrificantes`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `capacidade` | Volume | seleção | eixo | sim |  | 5 opções: 500 ml / 1 L / 4 L / 5 L / 20 L |  | sim |  |
| 20 | `tipo_oleo` | Tipo | seleção | spec | sim |  | 6 opções: Óleo de motor / Óleo de caixa/transmissão / Óleo hidráulico / Líquido de travões / Aditivo/Líquido de arrefecimento / Massa lubrificante | Geral | sim |  |
| 30 | `viscosidade` | Viscosidade | seleção | spec |  |  | 8 opções: 5W-30 / 5W-40 / 10W-30 / 10W-40 / 15W-40 / 20W-50 / 75W-90 / 80W-90 | Desempenho | sim |  |
| 40 | `base_oleo` | Base | seleção | spec |  |  | 3 opções: Mineral / Semissintético / Sintético | Geral | sim |  |


## Automóveis, Motos e Peças › Acessórios automotivos  `automoveis-motos-e-pecas-acessorios-automotivos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tipo_acessorio` | Tipo | seleção | spec | sim |  | 7 opções: Capas de banco / Tapetes / Suportes/Carregadores / Alarmes/Trancas / Luzes/Lâmpadas / Organizadores / Outro | Geral | sim |  |
| 30 | `compativel_veiculos` | Compatível com | texto | spec |  |  | até 150 car. | Compatibilidade |  |  |


## Automóveis, Motos e Peças › Capacetes  `automoveis-motos-e-pecas-capacetes`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tamanho` | Tamanho | seleção | eixo | sim |  | 5 opções: P (54-55 cm) / M (56-57 cm) / G (58-59 cm) / GG (60-61 cm) / XG (62-63 cm) |  | sim |  |
| 20 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 30 | `tipo_capacete` | Tipo | seleção | spec | sim |  | 4 opções: Integral / Aberto / Modular / Cross/Off-road | Geral | sim |  |
| 40 | `viseira` | Com viseira | sim/não | spec |  |  |  | Funções | sim |  |


## Automóveis, Motos e Peças › Ferramentas automotivas  `automoveis-motos-e-pecas-ferramentas-automotivas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_ferramenta_auto` | Tipo | seleção | spec | sim |  | 7 opções: Macaco / Chave de rodas / Cabos de bateria/auxiliar / Compressor de ar / Kit de ferramentas / Scanner OBD / Outro | Geral | sim |  |


## Automóveis, Motos e Peças › Som automotivo  `automoveis-motos-e-pecas-som-automotivo`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_som_auto` | Tipo | seleção | spec | sim |  | 6 opções: Rádio/Central multimédia / Altifalantes / Subwoofer / Amplificador / Antena / Kit instalação | Geral | sim |  |
| 20 | `potencia_rms_w` | Potência (RMS) | número | spec |  | W | 5 a 5000 W; inteiro | Desempenho |  |  |
| 30 | `ligacoes` | Ligações | múltipla | spec |  |  | 5 opções: Bluetooth / USB / Cartão SD / Auxiliar (P2) / Rádio FM | Conectividade | sim |  |


## Automóveis, Motos e Peças › Produtos de limpeza automotiva  `automoveis-motos-e-pecas-produtos-de-limpeza-automotiva`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `capacidade` | Volume | seleção | eixo |  |  | 4 opções: 250 ml / 500 ml / 1 L / 5 L |  | sim |  |
| 20 | `tipo_limpeza_auto` | Tipo | seleção | spec | sim |  | 7 opções: Champô automotivo / Cera/Polimento / Limpa-vidros / Limpa-estofados / Pretinho de pneus / Panos/Flanelas / Aspirador | Geral | sim |  |


## Agricultura e Pecuária › Sementes  `agricultura-e-pecuaria-sementes`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cultura` | Cultura | seleção | spec | sim |  | 8 opções: Arroz / Milho / Feijão / Amendoim / Hortícolas / Frutíferas / Mandioca/Batata-doce / Outra | Geral | sim |  |
| 20 | `tamanho` | Embalagem | seleção | eixo | sim |  | 6 opções: 10 g / 100 g / 500 g / 1 kg / 5 kg / 25 kg |  | sim |  |
| 30 | `variedade` | Variedade | texto | spec |  |  | até 80 car. | Geral |  | Ex.: NERICA |
| 40 | `ciclo_dias` | Ciclo até à colheita | número | spec |  | dias | 20 a 400 dias; inteiro | Cultivo |  |  |


## Agricultura e Pecuária › Fertilizantes  `agricultura-e-pecuaria-fertilizantes`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tamanho` | Embalagem | seleção | eixo | sim |  | 5 opções: 1 kg / 5 kg / 10 kg / 25 kg / 50 kg |  | sim |  |
| 20 | `tipo_fertilizante` | Tipo | seleção | spec | sim |  | 7 opções: NPK / Ureia / Adubo orgânico / Calcário / Foliar / Fosfato / Outro | Geral | sim |  |
| 30 | `composicao_npk` | Composição (ex.: NPK 15-15-15) | texto | spec |  |  | até 60 car. | Geral |  |  |


## Agricultura e Pecuária › Ferramentas agrícolas  `agricultura-e-pecuaria-ferramentas-agricolas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_ferramenta_agricola` | Tipo | seleção | spec | sim |  | 8 opções: Enxada / Catana/Machete / Pá / Foice / Pulverizador manual / Carrinho de mão / Forquilha / Outro | Geral | sim |  |
| 20 | `material_cabo` | Material do cabo | seleção | spec |  |  | 4 opções: Madeira / Metal / Fibra / Plástico | Materiais | sim |  |


## Agricultura e Pecuária › Máquinas agrícolas  `agricultura-e-pecuaria-maquinas-agricolas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_maquina_agricola` | Tipo | seleção | spec | sim |  | 7 opções: Motocultivador / Debulhador/Descascador / Moinho / Pulverizador motorizado / Roçadora / Trator / Outro | Geral | sim |  |
| 20 | `combustivel` | Alimentação | seleção | spec |  |  | 4 opções: Gasolina / Gasóleo / Elétrico / Manual | Energia | sim |  |
| 30 | `potencia_cv` | Potência | número | spec |  | cv | 0.5 a 300 cv; 1 casa(s) | Energia | sim |  |


## Agricultura e Pecuária › Irrigação  `agricultura-e-pecuaria-irrigacao`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_irrigacao` | Tipo | seleção | spec | sim |  | 6 opções: Bomba de água / Mangueira / Gotejamento / Aspersor / Depósito / Painel solar para bomba | Geral | sim |  |
| 20 | `vazao_lh` | Caudal | número | spec |  | L/h | 10 a 500000 L/h; inteiro | Desempenho |  |  |
| 30 | `alimentacao` | Alimentação | seleção | spec |  |  | 4 opções: Elétrica / Solar / Gasolina/gasóleo / Manual | Energia | sim |  |


## Agricultura e Pecuária › Equipamentos para pesca  `agricultura-e-pecuaria-equipamentos-para-pesca`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_pesca` | Tipo | seleção | spec | sim |  | 7 opções: Rede / Canoa/Barco / Motor de popa / Anzóis e linhas / Boias e flutuadores / Armadilha/Covo / Colete salva-vidas | Geral | sim |  |
| 20 | `medida_pesca` | Medida/Malha | texto | spec |  |  | até 60 car. | Medidas |  | Ex.: malha 30 mm, 50 m |


## Agricultura e Pecuária › Equipamentos de pecuária  `agricultura-e-pecuaria-equipamentos-de-pecuaria`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_pecuaria` | Tipo | seleção | spec | sim |  | 7 opções: Bebedouro / Comedouro / Cerca/Arame / Incubadora / Ordenhadeira / Marcação/Brincos / Outro | Geral | sim |  |
| 20 | `animal_destino` | Animal | seleção | spec |  |  | 6 opções: Bovinos / Suínos / Aves / Caprinos/Ovinos / Peixes / Vários | Geral | sim |  |


## Agricultura e Pecuária › Rações animais  `agricultura-e-pecuaria-racoes-animais`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tamanho` | Embalagem | seleção | eixo | sim |  | 6 opções: 1 kg / 5 kg / 10 kg / 20 kg / 25 kg / 40 kg |  | sim |  |
| 20 | `animal_destino` | Animal | seleção | spec | sim |  | 8 opções: Aves/Frangos / Galinhas poedeiras / Suínos / Bovinos / Caprinos/Ovinos / Peixes / Cães / Gatos | Geral | sim |  |
| 30 | `fase_animal` | Fase | seleção | spec |  |  | 5 opções: Inicial / Crescimento / Engorda / Postura / Manutenção | Geral | sim |  |


## Agricultura e Pecuária › Produtos para horticultura  `agricultura-e-pecuaria-produtos-para-horticultura`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_horticultura` | Tipo | seleção | spec | sim |  | 6 opções: Estufa/Plástico / Substrato/Terra / Vasos e bandejas / Redes de sombra / Pesticida/Fungicida / Outro | Geral | sim |  |
| 20 | `tamanho` | Embalagem | seleção | eixo |  |  | 5 opções: 500 g / 1 kg / 5 kg / 25 kg / Unidade |  | sim |  |


## Agricultura e Pecuária › Armazenamento agrícola  `agricultura-e-pecuaria-armazenamento-agricola`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_armazenamento` | Tipo | seleção | spec | sim |  | 6 opções: Saco de ráfia / Silo/Depósito / Lona/Cobertura / Palete / Balança agrícola / Outro | Geral | sim |  |
| 20 | `capacidade_kg` | Capacidade | número | spec |  | kg | 1 a 100000 kg; inteiro | Capacidade |  |  |


## Jardim e Exterior › Plantas e sementes  `jardim-e-exterior-plantas-e-sementes`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_planta` | Tipo | seleção | spec | sim |  | 6 opções: Planta ornamental / Árvore frutífera / Planta medicinal / Sementes / Bolbos/Mudas / Relva | Geral | sim |  |
| 20 | `luz_necessaria` | Luz | seleção | spec |  |  | 3 opções: Sol pleno / Meia-sombra / Sombra | Cuidados | sim |  |


## Jardim e Exterior › Vasos  `jardim-e-exterior-vasos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 15 opções: Branco / Preto / Cinzento / Castanho / Bege / Azul / Verde / Vermelho / Amarelo / Rosa / Dourado / Prateado / Madeira natural / Multicolorido / Transparente |  | sim | Escolha a cor de cada variação. |
| 20 | `tamanho` | Tamanho | seleção | eixo |  |  | 4 opções: Pequeno / Médio / Grande / Extra grande |  | sim |  |
| 30 | `material_vaso` | Material | seleção | spec |  |  | 5 opções: Barro / Plástico / Cerâmica / Cimento / Metal | Materiais | sim |  |


## Jardim e Exterior › Ferramentas de jardinagem  `jardim-e-exterior-ferramentas-de-jardinagem`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_jardinagem` | Tipo | seleção | spec | sim |  | 7 opções: Tesoura de poda / Pá/Enxada / Ancinho / Pulverizador / Cortador de relva / Luvas / Kit | Geral | sim |  |


## Jardim e Exterior › Mangueiras  `jardim-e-exterior-mangueiras`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tamanho` | Comprimento | seleção | eixo | sim |  | 5 opções: 10 m / 15 m / 20 m / 30 m / 50 m |  | sim |  |
| 20 | `diametro_mangueira` | Diâmetro | seleção | spec |  |  | 3 opções: 1/2" / 5/8" / 3/4" | Medidas | sim |  |
| 30 | `com_acessorios` | Com pistola/conectores | sim/não | spec |  |  |  | Funções | sim |  |


## Jardim e Exterior › Mobiliário exterior  `jardim-e-exterior-mobiliario-exterior`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 15 opções: Branco / Preto / Cinzento / Castanho / Bege / Azul / Verde / Vermelho / Amarelo / Rosa / Dourado / Prateado / Madeira natural / Multicolorido / Transparente |  | sim | Escolha a cor de cada variação. |
| 20 | `tipo_exterior` | Tipo | seleção | spec | sim |  | 7 opções: Mesa / Cadeira / Conjunto / Espreguiçadeira / Rede/Hamaca / Guarda-sol / Banco | Geral | sim |  |
| 30 | `material_movel` | Material | seleção | spec |  |  | 5 opções: Plástico / Alumínio / Ferro / Madeira / Vime/Rattan sintético | Materiais | sim |  |


## Jardim e Exterior › Iluminação exterior  `jardim-e-exterior-iluminacao-exterior`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_luz` | Tipo | seleção | spec | sim |  | 6 opções: Holofote / Poste/candeeiro / Luz solar / Fita LED / Lanterna / Luz com sensor | Geral | sim |  |
| 20 | `alimentacao` | Alimentação | seleção | spec |  |  | 3 opções: Tomada / Solar / Bateria/Pilhas | Energia | sim |  |
| 30 | `potencia_w` | Potência | número | spec |  | W | 1 a 1000 W; inteiro | Energia |  |  |


## Jardim e Exterior › Cercas  `jardim-e-exterior-cercas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_cerca` | Tipo | seleção | spec | sim |  | 6 opções: Arame farpado / Rede/Tela / Painel / Cerca elétrica / Portão / Estacas/Mourões | Geral | sim |  |
| 20 | `altura_cerca_m` | Altura da cerca | número | spec |  | m | 0.3 a 6 m; 1 casa(s) | Medidas |  |  |
| 30 | `comprimento_rolo_m` | Comprimento do rolo | número | spec |  | m | 1 a 500 m; inteiro | Medidas |  |  |


## Jardim e Exterior › Equipamentos de rega  `jardim-e-exterior-equipamentos-de-rega`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_rega` | Tipo | seleção | spec | sim |  | 6 opções: Aspersor / Gotejamento / Temporizador / Bomba / Conectores / Regador | Geral | sim |  |
| 20 | `alimentacao` | Alimentação | seleção | spec |  |  | 4 opções: Manual / Elétrica / Solar / Pilhas | Energia | sim |  |


## Jardim e Exterior › Decoração de jardim  `jardim-e-exterior-decoracao-de-jardim`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 15 opções: Branco / Preto / Cinzento / Castanho / Bege / Azul / Verde / Vermelho / Amarelo / Rosa / Dourado / Prateado / Madeira natural / Multicolorido / Transparente |  | sim | Escolha a cor de cada variação. |
| 20 | `tipo_decoracao` | Tipo | seleção | spec |  |  | 7 opções: Estátua / Fonte / Lanternas / Gnomos/Figuras / Pedras decorativas / Cata-vento / Outro | Geral | sim |  |


## Indústria, Comércio e Escritório › Equipamentos comerciais  `industria-comercio-e-escritorio-equipamentos-comerciais`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_comercial` | Tipo | seleção | spec | sim |  | 7 opções: Vitrine/Expositor / Balcão / Caixa registadora/POS / Leitor de código de barras / Máquina de gelo / Frigorífico comercial / Outro | Geral | sim |  |
| 20 | `voltagem` | Voltagem | seleção | eixo |  |  | 3 opções: 220V / 110V / Bivolt (110-240V) |  | sim | Tensão de funcionamento do aparelho. Na Guiné-Bissau a rede é de 220V. |


## Indústria, Comércio e Escritório › Máquinas industriais  `industria-comercio-e-escritorio-maquinas-industriais`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_industrial` | Tipo | seleção | spec | sim |  | 7 opções: Misturadora/Betoneira / Moinho industrial / Prensa / Serra industrial / Compressor industrial / Esteira/Transportador / Outra | Geral | sim |  |
| 20 | `voltagem` | Voltagem | seleção | eixo |  |  | 3 opções: 220V / 380V (trifásico) / 110V |  | sim | Tensão de funcionamento do aparelho. Na Guiné-Bissau a rede é de 220V. |
| 30 | `potencia_kw` | Potência | número | spec |  | kW | 0.1 a 1000 kW; 1 casa(s) | Energia | sim |  |


## Indústria, Comércio e Escritório › Equipamentos para restaurantes  `industria-comercio-e-escritorio-equipamentos-para-restaurantes`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_restaurante` | Tipo | seleção | spec | sim |  | 7 opções: Fogão industrial / Fritadeira / Forno / Balcão refrigerado / Batedeira/Misturador / Bancada inox / Utensílios | Geral | sim |  |
| 20 | `fonte_energia` | Energia | seleção | spec |  |  | 3 opções: Gás / Elétrico / Gás e elétrico | Energia | sim |  |
| 30 | `voltagem` | Voltagem | seleção | eixo |  |  | 3 opções: 220V / 110V / Bivolt (110-240V) |  | sim | Tensão de funcionamento do aparelho. Na Guiné-Bissau a rede é de 220V. |


## Indústria, Comércio e Escritório › Balanças comerciais  `industria-comercio-e-escritorio-balancas-comerciais`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `capacidade_max_kg` | Capacidade máxima | número | spec | sim | kg | 0.1 a 5000 kg; 1 casa(s) | Capacidade | sim |  |
| 20 | `precisao_g` | Precisão (divisão) | número | spec |  | g | 0.01 a 1000 g; 2 casa(s) | Desempenho |  |  |
| 30 | `alimentacao` | Alimentação | seleção | spec |  |  | 3 opções: Tomada / Bateria recarregável / Tomada e bateria | Energia | sim |  |


## Indústria, Comércio e Escritório › Embalagens  `industria-comercio-e-escritorio-embalagens`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tamanho` | Tamanho | seleção | eixo |  |  | 4 opções: Pequeno / Médio / Grande / Sob medida |  | sim |  |
| 20 | `tipo_embalagem` | Tipo | seleção | spec | sim |  | 7 opções: Saco plástico / Caixa de cartão / Filme/Plástico bolha / Fita adesiva / Frasco/Pote / Saco de papel / Outro | Geral | sim |  |
| 30 | `unidades_pacote` | Unidades por pacote | número | spec |  |  | 1 a 100000; inteiro | Geral |  |  |


## Indústria, Comércio e Escritório › Máquinas de costura  `industria-comercio-e-escritorio-maquinas-de-costura`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `voltagem` | Voltagem | seleção | eixo |  |  | 3 opções: 220V / 110V / Bivolt (110-240V) |  | sim | Tensão de funcionamento do aparelho. Na Guiné-Bissau a rede é de 220V. |
| 20 | `tipo_costura` | Tipo | seleção | spec | sim |  | 5 opções: Doméstica / Industrial reta / Overlock / Pedal/Manual / Bordadeira | Geral | sim |  |
| 30 | `pontos` | Número de pontos | número | spec |  |  | 1 a 500; inteiro | Funções |  |  |


## Indústria, Comércio e Escritório › Equipamentos de escritório  `industria-comercio-e-escritorio-equipamentos-de-escritorio`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_escritorio` | Tipo | seleção | spec | sim |  | 7 opções: Fotocopiadora / Plastificadora / Fragmentadora / Calculadora / Telefone IP/PABX / Encadernadora / Outro | Geral | sim |  |
| 20 | `voltagem` | Voltagem | seleção | eixo |  |  | 3 opções: 220V / 110V / Bivolt (110-240V) |  | sim | Tensão de funcionamento do aparelho. Na Guiné-Bissau a rede é de 220V. |


## Indústria, Comércio e Escritório › Uniformes profissionais  `industria-comercio-e-escritorio-uniformes-profissionais`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tamanho` | Tamanho | seleção | eixo | sim |  | 7 opções: PP / P / M / G / GG / XG / XXG |  | sim |  |
| 30 | `tipo_uniforme` | Tipo | seleção | spec | sim |  | 7 opções: Fato-macaco / Camisa/Polo / Calça / Bata / Colete / Avental / Conjunto | Geral | sim |  |


## Indústria, Comércio e Escritório › Materiais de armazenagem  `industria-comercio-e-escritorio-materiais-de-armazenagem`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_armazenagem` | Tipo | seleção | spec | sim |  | 6 opções: Prateleira metálica / Palete / Caixa plástica / Carrinho/Porta-paletes / Armário industrial / Estante | Geral | sim |  |
| 20 | `capacidade_carga_kg` | Capacidade de carga | número | spec |  | kg | 1 a 20000 kg; inteiro | Capacidade |  |  |


## Indústria, Comércio e Escritório › Equipamentos de segurança  `industria-comercio-e-escritorio-equipamentos-de-seguranca`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_seguranca` | Tipo | seleção | spec | sim |  | 7 opções: Extintor / Alarme / Cofre / Fechadura/Cadeado / Sinalização / Kit primeiros socorros / Cerca elétrica | Geral | sim |  |
| 20 | `norma` | Norma/certificação | texto | spec |  |  | até 60 car. | Segurança |  |  |


## Supermercado e Mercearia  `supermercado-e-mercearia`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `origem_produto` | Origem | seleção | spec |  |  | 7 opções: Guiné-Bissau / Senegal / Gâmbia / Guiné-Conacri / Portugal / Brasil / Outro país | Geral | sim |  |
| 20 | `validade_info` | Validade | texto | spec |  |  | até 60 car. | Segurança |  | Indique o prazo ou a data de validade impressa na embalagem. |


## Supermercado e Mercearia › Arroz e cereais  `supermercado-e-mercearia-arroz-e-cereais`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tamanho` | Embalagem | seleção | eixo | sim |  | 9 opções: 100 g / 250 g / 500 g / 1 kg / 2 kg / 5 kg / 10 kg / 25 kg / 50 kg |  | sim | Quantidade que vem em cada embalagem. |
| 20 | `tipo_cereal` | Tipo | seleção | spec | sim |  | 8 opções: Arroz agulha / Arroz parboilizado / Arroz partido / Milho / Mil/Sorgo / Aveia / Fonio / Outro | Geral | sim |  |


## Supermercado e Mercearia › Farinha e massas  `supermercado-e-mercearia-farinha-e-massas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tamanho` | Embalagem | seleção | eixo | sim |  | 9 opções: 100 g / 250 g / 500 g / 1 kg / 2 kg / 5 kg / 10 kg / 25 kg / 50 kg |  | sim |  |
| 20 | `tipo_farinha` | Tipo | seleção | spec | sim |  | 7 opções: Farinha de trigo / Farinha de milho / Farinha de mandioca / Massa (esparguete) / Massa (outra) / Cuscuz / Outro | Geral | sim |  |


## Supermercado e Mercearia › Óleos alimentares  `supermercado-e-mercearia-oleos-alimentares`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `capacidade` | Volume | seleção | eixo | sim |  | 6 opções: 500 ml / 900 ml / 1 L / 2 L / 5 L / 20 L |  | sim |  |
| 20 | `tipo_oleo_alimentar` | Tipo | seleção | spec | sim |  | 6 opções: Óleo vegetal / Óleo de palma / Óleo de amendoim / Azeite / Óleo de girassol / Manteiga/Margarina | Geral | sim |  |


## Supermercado e Mercearia › Açúcar e sal  `supermercado-e-mercearia-acucar-e-sal`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tamanho` | Embalagem | seleção | eixo | sim |  | 7 opções: 250 g / 500 g / 1 kg / 2 kg / 5 kg / 25 kg / 50 kg |  | sim |  |
| 20 | `tipo_acucar_sal` | Tipo | seleção | spec | sim |  | 6 opções: Açúcar branco / Açúcar amarelo/mascavado / Sal fino / Sal grosso / Sal iodado / Adoçante | Geral | sim |  |


## Supermercado e Mercearia › Conservas e enlatados  `supermercado-e-mercearia-conservas-e-enlatados`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tamanho` | Conteúdo da lata | seleção | eixo |  |  | 6 opções: 70 g / 125 g / 170 g / 200 g / 400 g / 800 g |  | sim |  |
| 20 | `tipo_conserva` | Tipo | seleção | spec | sim |  | 7 opções: Atum/Sardinha / Tomate/Concentrado / Feijão/Legumes / Salsichas/Carne / Frutas em calda / Leite condensado/creme / Outro | Geral | sim |  |


## Supermercado e Mercearia › Leite e derivados  `supermercado-e-mercearia-leite-e-derivados`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tamanho` | Embalagem | seleção | eixo | sim |  | 8 opções: 200 g / 400 g / 900 g / 1 kg / 25 kg (saco) / 200 ml / 500 ml / 1 L |  | sim |  |
| 20 | `tipo_leite` | Tipo | seleção | spec | sim |  | 7 opções: Leite em pó / Leite líquido (UHT) / Leite condensado / Iogurte / Queijo / Manteiga / Natas | Geral | sim |  |
| 30 | `teor_gordura` | Teor de gordura | seleção | spec |  |  | 3 opções: Gordo (integral) / Meio-gordo / Magro/Desnatado | Geral | sim |  |


## Supermercado e Mercearia › Café, chá e cacau  `supermercado-e-mercearia-cafe-cha-e-cacau`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tamanho` | Embalagem | seleção | eixo | sim |  | 7 opções: 50 g / 100 g / 250 g / 500 g / 1 kg / 20 saquetas / 100 saquetas |  | sim |  |
| 20 | `tipo_bebida_quente` | Tipo | seleção | spec | sim |  | 5 opções: Café moído / Café solúvel / Chá / Cacau/Chocolate em pó / Infusões/Ervas | Geral | sim |  |


## Supermercado e Mercearia › Bolachas e doces  `supermercado-e-mercearia-bolachas-e-doces`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tamanho` | Embalagem | seleção | eixo |  |  | 6 opções: 50 g / 100 g / 200 g / 400 g / 1 kg / Pacote família |  | sim |  |
| 20 | `tipo_doce` | Tipo | seleção | spec | sim |  | 7 opções: Bolachas / Chocolate / Rebuçados/Bombons / Bolos / Cereais de pequeno-almoço / Mel/Doces / Salgados/Snacks | Geral | sim |  |


## Supermercado e Mercearia › Temperos e condimentos  `supermercado-e-mercearia-temperos-e-condimentos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tamanho` | Embalagem | seleção | eixo |  |  | 6 opções: 10 g / 50 g / 100 g / 250 g / 500 g / 1 kg |  | sim |  |
| 20 | `tipo_tempero` | Tipo | seleção | spec | sim |  | 7 opções: Cubos/Caldo / Pimenta/Malagueta / Especiarias / Molhos / Vinagre/Mostarda / Sal de tempero / Outro | Geral | sim |  |


## Supermercado e Mercearia › Produtos de limpeza  `supermercado-e-mercearia-produtos-de-limpeza`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `capacidade` | Volume / peso | seleção | eixo |  |  | 8 opções: 250 ml / 500 ml / 1 L / 2 L / 5 L / 500 g / 1 kg / 5 kg |  | sim |  |
| 20 | `tipo_limpeza` | Tipo | seleção | spec | sim |  | 8 opções: Detergente de loiça / Detergente da roupa (sabão) / Lixívia/Javel / Desinfetante / Limpa-vidros / Amaciador / Insecticida / Outro | Geral | sim |  |

- **Desativa** o herdado `origem_produto` nesta categoria

## Supermercado e Mercearia › Produtos de higiene doméstica  `supermercado-e-mercearia-produtos-de-higiene-domestica`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `capacidade` | Quantidade | seleção | eixo |  |  | 7 opções: 1 rolo / 4 rolos / 12 rolos / 50 unidades / 100 unidades / 500 ml / 1 L |  | sim |  |
| 20 | `tipo_higiene` | Tipo | seleção | spec | sim |  | 7 opções: Papel higiénico / Rolo de cozinha / Guardanapos / Sacos do lixo / Fósforos/Isqueiros / Velas / Outro | Geral | sim |  |

- **Desativa** o herdado `origem_produto` nesta categoria

## Alimentos Frescos e Bebidas  `alimentos-frescos-e-bebidas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `unidade_venda` | Vendido por | seleção | spec |  |  | 5 opções: Quilograma (kg) / Unidade / Caixa/Saco / Dúzia / Litro | Geral | sim | Como o preço é calculado. |
| 20 | `origem_produto` | Origem | seleção | spec |  |  | 5 opções: Guiné-Bissau / Senegal / Gâmbia / Guiné-Conacri / Outro país | Geral | sim |  |


## Alimentos Frescos e Bebidas › Frutas  `alimentos-frescos-e-bebidas-frutas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_fruta` | Fruta | texto | spec | sim |  | até 60 car. | Geral |  | Ex.: Manga, Banana, Caju |
| 20 | `maturacao` | Maturação | seleção | spec |  |  | 3 opções: Verde / Madura / Pronta a comer | Geral | sim |  |
| 30 | `organico` | Sem agrotóxicos (orgânico) | sim/não | spec |  |  |  | Geral | sim |  |


## Alimentos Frescos e Bebidas › Legumes e verduras  `alimentos-frescos-e-bebidas-legumes-e-verduras`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_legume` | Produto | texto | spec | sim |  | até 60 car. | Geral |  | Ex.: Tomate, Alface, Quiabo |
| 20 | `organico` | Sem agrotóxicos (orgânico) | sim/não | spec |  |  |  | Geral | sim |  |


## Alimentos Frescos e Bebidas › Tubérculos  `alimentos-frescos-e-bebidas-tuberculos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_tuberculo` | Produto | seleção | spec | sim |  | 7 opções: Mandioca / Batata-doce / Batata / Inhame / Cebola / Alho / Outro | Geral | sim |  |


## Alimentos Frescos e Bebidas › Carnes  `alimentos-frescos-e-bebidas-carnes`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_carne` | Carne | seleção | spec | sim |  | 7 opções: Frango / Vaca/Boi / Porco / Cabra/Carneiro / Caça / Enchidos/Fumados / Outra | Geral | sim |  |
| 20 | `estado_conservacao` | Conservação | seleção | spec | sim |  | 3 opções: Fresca / Congelada / Fumada/Seca | Segurança | sim |  |


## Alimentos Frescos e Bebidas › Peixes e mariscos  `alimentos-frescos-e-bebidas-peixes-e-mariscos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_peixe` | Peixe/Marisco | texto | spec | sim |  | até 60 car. | Geral |  | Ex.: Bagre, Camarão, Ostras |
| 20 | `estado_conservacao` | Conservação | seleção | spec | sim |  | 4 opções: Fresco / Congelado / Seco/Fumado / Salgado | Segurança | sim |  |


## Alimentos Frescos e Bebidas › Ovos  `alimentos-frescos-e-bebidas-ovos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tamanho_ovo` | Tamanho | seleção | spec |  |  | 4 opções: Pequeno / Médio / Grande / Extra grande | Geral | sim |  |
| 20 | `quantidade_ovos` | Quantidade | seleção | spec |  |  | 4 opções: 6 / 12 / 30 (cartela) / 360 (caixa) | Geral | sim |  |


## Alimentos Frescos e Bebidas › Produtos congelados  `alimentos-frescos-e-bebidas-produtos-congelados`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_congelado` | Tipo | seleção | spec | sim |  | 6 opções: Carne/Frango / Peixe/Marisco / Legumes / Batatas fritas / Pratos prontos / Gelados | Geral | sim |  |


## Alimentos Frescos e Bebidas › Água mineral  `alimentos-frescos-e-bebidas-agua-mineral`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `capacidade` | Volume | seleção | eixo | sim |  | 6 opções: 330 ml / 500 ml / 1 L / 1.5 L / 5 L / 19 L (garrafão) |  | sim |  |
| 20 | `tipo_agua` | Tipo | seleção | spec |  |  | 3 opções: Sem gás / Com gás / Aromatizada | Geral | sim |  |
| 30 | `pack` | Embalagem de venda | seleção | spec |  |  | 4 opções: Unidade / Pack de 6 / Pack de 12 / Pack de 24 | Geral | sim |  |

- **Desativa** o herdado `unidade_venda` nesta categoria
- **Desativa** o herdado `origem_produto` nesta categoria

## Alimentos Frescos e Bebidas › Sumos e refrigerantes  `alimentos-frescos-e-bebidas-sumos-e-refrigerantes`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `capacidade` | Volume | seleção | eixo | sim |  | 7 opções: 200 ml / 330 ml / 500 ml / 750 ml / 1 L / 1.5 L / 2 L |  | sim |  |
| 20 | `tipo_sumo` | Tipo | seleção | spec | sim |  | 5 opções: Sumo de fruta / Néctar / Refrigerante / Bebida energética / Xarope/Concentrado | Geral | sim |  |
| 30 | `pack` | Embalagem de venda | seleção | spec |  |  | 4 opções: Unidade / Pack de 6 / Pack de 12 / Pack de 24 | Geral | sim |  |

- **Desativa** o herdado `unidade_venda` nesta categoria
- **Desativa** o herdado `origem_produto` nesta categoria

## Alimentos Frescos e Bebidas › Bebidas não alcoólicas  `alimentos-frescos-e-bebidas-bebidas-nao-alcoolicas`

> Bebidas alcoólicas NÃO fazem parte desta árvore: a matriz não cria atributos para elas.

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `capacidade` | Volume | seleção | eixo | sim |  | 6 opções: 200 ml / 330 ml / 500 ml / 1 L / 1.5 L / 2 L |  | sim |  |
| 20 | `tipo_bebida` | Tipo | seleção | spec | sim |  | 6 opções: Chá gelado / Bebida de soja/aveia / Malta/Cerveja sem álcool / Água de coco / Bebida láctea / Outra | Geral | sim |  |

- **Desativa** o herdado `unidade_venda` nesta categoria
- **Desativa** o herdado `origem_produto` nesta categoria

## Alimentos Frescos e Bebidas › Produtos alimentares locais  `alimentos-frescos-e-bebidas-produtos-alimentares-locais`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `produto_local` | Produto | texto | spec | sim |  | até 80 car. | Geral |  | Ex.: Caju, Óleo de palma, Mel, Pimenta |
| 20 | `tamanho` | Embalagem | seleção | eixo |  |  | 8 opções: 100 g / 250 g / 500 g / 1 kg / 5 kg / 1 L / 5 L / Unidade |  | sim |  |
| 30 | `artesanal` | Produção artesanal/local | sim/não | spec |  |  |  | Geral | sim |  |


## Bebês e Crianças  `bebes-e-criancas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `faixa_idade` | Idade recomendada | seleção | spec |  |  | 6 opções: 0-6 meses / 6-12 meses / 1-3 anos / 3-6 anos / 6-12 anos / Todas as idades | Geral | sim |  |


## Bebês e Crianças › Roupas para bebês  `bebes-e-criancas-roupas-para-bebes`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo | sim |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tamanho` | Tamanho | seleção | eixo | sim |  | 18 opções: Prematuro / 0-3 meses / 3-6 meses / 6-9 meses / 9-12 meses / 12-18 meses / 18-24 meses / 2 anos / 3 anos / 4 anos / 5 anos / 6 anos / 7 anos / 8 anos / 10 anos / 12 anos / 14 anos / 16 anos |  | sim |  |
| 30 | `material` | Material | seleção | spec |  |  | 4 opções: Algodão / Malha / Poliéster / Misto | Materiais | sim |  |
| 40 | `tipo_roupa_bebe` | Tipo | seleção | spec |  |  | 7 opções: Body / Macacão / Conjunto / Vestido / Pijama / Casaco / Meias/Luvas/Gorros | Geral | sim |  |

- **Desativa** o herdado `faixa_idade` nesta categoria

## Bebês e Crianças › Fraldas  `bebes-e-criancas-fraldas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tamanho` | Tamanho da fralda | seleção | eixo | sim |  | 6 opções: RN (recém-nascido) / P / M / G / XG / XXG |  | sim |  |
| 20 | `tipo_fralda` | Tipo | seleção | spec | sim |  | 3 opções: Descartável / De pano (reutilizável) / Calças de treino | Geral | sim |  |
| 30 | `unidades_pacote` | Unidades por pacote | número | spec |  |  | 1 a 500; inteiro | Geral |  |  |

- **Desativa** o herdado `faixa_idade` nesta categoria

## Bebês e Crianças › Produtos de higiene infantil  `bebes-e-criancas-produtos-de-higiene-infantil`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `capacidade` | Volume / quantidade | seleção | eixo |  |  | 6 opções: 100 ml / 200 ml / 400 ml / 500 ml / 60 lenços / 120 lenços |  | sim |  |
| 20 | `tipo_higiene_infantil` | Tipo | seleção | spec | sim |  | 7 opções: Champô/Sabonete / Creme/Pomada / Óleo/Loção / Toalhitas / Talco / Termómetro/Aspirador nasal / Outro | Geral | sim |  |


## Bebês e Crianças › Mamadeiras  `bebes-e-criancas-mamadeiras`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `capacidade` | Capacidade | seleção | eixo | sim |  | 5 opções: 120 ml / 150 ml / 240 ml / 260 ml / 330 ml |  | sim |  |
| 20 | `material` | Material | seleção | spec |  |  | 4 opções: Plástico (sem BPA) / Vidro / Silicone / Aço inoxidável | Materiais | sim |  |
| 30 | `tipo_bico` | Bico | seleção | spec |  |  | 3 opções: Látex / Silicone / Ortodôntico | Geral | sim |  |


## Bebês e Crianças › Carrinhos de bebê  `bebes-e-criancas-carrinhos-de-bebe`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tipo_carrinho` | Tipo | seleção | spec | sim |  | 5 opções: Carrinho de passeio / Carrinho 3 em 1 / Cadeirinha de transporte / Bebé conforto / Marsupial/Canguru | Geral | sim |  |
| 30 | `faixa_peso` | Suporta crianças até | seleção | spec |  |  | 4 opções: Até 9 kg / Até 15 kg / Até 22 kg / Até 36 kg | Segurança | sim |  |
| 40 | `dobravel` | Dobrável | sim/não | spec |  |  |  | Funções | sim |  |


## Bebês e Crianças › Berços  `bebes-e-criancas-bercos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tipo_berco` | Tipo | seleção | spec | sim |  | 5 opções: Berço / Cesto/Moisés / Berço de viagem / Cama de grade / Mosquiteiro | Geral | sim |  |
| 30 | `colchao_incluido` | Colchão incluído | sim/não | spec |  |  |  | Geral | sim |  |


## Bebês e Crianças › Cadeiras infantis  `bebes-e-criancas-cadeiras-infantis`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tipo_cadeira` | Tipo | seleção | spec | sim |  | 5 opções: Cadeira de refeição / Cadeira para automóvel / Elevador de assento / Cadeira de descanso / Andarilho | Geral | sim |  |
| 30 | `faixa_peso` | Indicada para crianças de | seleção | spec |  |  | 4 opções: 0-13 kg / 9-18 kg / 15-36 kg / Até 25 kg | Segurança | sim |  |


## Bebês e Crianças › Alimentação infantil  `bebes-e-criancas-alimentacao-infantil`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tamanho` | Embalagem | seleção | eixo |  |  | 4 opções: 200 g / 400 g / 800 g / 1 kg |  | sim |  |
| 20 | `tipo_alimento_infantil` | Tipo | seleção | spec | sim |  | 5 opções: Leite em pó infantil / Papa/Cereal infantil / Papinha pronta / Bolachas infantis / Sumos infantis | Geral | sim |  |
| 30 | `fase_leite` | Fase | seleção | spec |  |  | 3 opções: Fase 1 (0-6 meses) / Fase 2 (6-12 meses) / Fase 3 (+12 meses) | Geral | sim |  |

- **Desativa** o herdado `faixa_idade` nesta categoria

## Bebês e Crianças › Acessórios para maternidade  `bebes-e-criancas-acessorios-para-maternidade`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_maternidade` | Tipo | seleção | spec | sim |  | 6 opções: Bolsa maternidade / Bomba tira-leite / Almofada de amamentação / Cinta pós-parto / Sutiã de amamentação / Outro | Geral | sim |  |

- **Desativa** o herdado `faixa_idade` nesta categoria

## Bebês e Crianças › Segurança infantil  `bebes-e-criancas-seguranca-infantil`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_seguranca_infantil` | Tipo | seleção | spec | sim |  | 5 opções: Protetor de tomadas / Barreira/Portão de segurança / Monitor de bebé / Protetor de cantos / Cinto de segurança | Geral | sim |  |


## Brinquedos e Jogos  `brinquedos-e-jogos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `faixa_idade` | Idade recomendada | seleção | spec | sim |  | 7 opções: 0-12 meses / 1-3 anos / 3-5 anos / 5-8 anos / 8-12 anos / +12 anos / Todas as idades | Segurança | sim | Importante para a segurança da criança. |
| 20 | `alimentacao` | Funciona com | seleção | spec |  |  | 4 opções: Não precisa de pilhas / Pilhas / Bateria recarregável / Tomada | Geral | sim |  |


## Brinquedos e Jogos › Bonecas  `brinquedos-e-jogos-bonecas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tamanho` | Tamanho | seleção | eixo |  |  | 3 opções: Pequena (até 20 cm) / Média (20-40 cm) / Grande (mais de 40 cm) |  | sim |  |

- **Desativa** o herdado `alimentacao` nesta categoria

## Brinquedos e Jogos › Carrinhos de brinquedo  `brinquedos-e-jogos-carrinhos-de-brinquedo`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_brinquedo_veiculo` | Tipo | seleção | spec |  |  | 5 opções: Carrinho de fricção / Controlo remoto / Pista/Coleção / Veículo de montar / Triciclo/Andador | Geral | sim |  |
| 20 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |


## Brinquedos e Jogos › Brinquedos educativos  `brinquedos-e-jogos-brinquedos-educativos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `habilidades` | Desenvolve | múltipla | spec |  |  | 6 opções: Coordenação motora / Raciocínio / Matemática / Leitura/Letras / Criatividade / Música | Geral | sim |  |

- **Desativa** o herdado `alimentacao` nesta categoria

## Brinquedos e Jogos › Jogos de tabuleiro  `brinquedos-e-jogos-jogos-de-tabuleiro`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `jogadores_min` | Mínimo de jogadores | número | spec |  |  | 1 a 20; inteiro | Geral |  |  |
| 20 | `jogadores_max` | Máximo de jogadores | número | spec |  |  | 1 a 20; inteiro | Geral |  |  |

- **Desativa** o herdado `alimentacao` nesta categoria

## Brinquedos e Jogos › Quebra-cabeças  `brinquedos-e-jogos-quebra-cabecas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `numero_pecas` | Número de peças | número | spec | sim |  | 4 a 10000; inteiro | Geral | sim |  |

- **Desativa** o herdado `alimentacao` nesta categoria

## Brinquedos e Jogos › Brinquedos eletrônicos  `brinquedos-e-jogos-brinquedos-eletronicos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_brinquedo_eletronico` | Tipo | seleção | spec |  |  | 6 opções: Tablet infantil / Robô / Drone de brincar / Instrumento musical / Consola portátil / Outro | Geral | sim |  |
| 20 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |


## Brinquedos e Jogos › Bicicletas infantis  `brinquedos-e-jogos-bicicletas-infantis`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tamanho` | Aro | seleção | eixo | sim |  | 6 opções: 12" / 14" / 16" / 18" / 20" / 24" |  | sim | Tamanho da roda. |
| 30 | `rodinhas` | Com rodinhas de apoio | sim/não | spec |  |  |  | Funções | sim |  |

- **Desativa** o herdado `alimentacao` nesta categoria

## Brinquedos e Jogos › Pelúcias  `brinquedos-e-jogos-pelucias`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tamanho` | Tamanho | seleção | eixo |  |  | 4 opções: Pequeno (até 25 cm) / Médio (25-50 cm) / Grande (50-100 cm) / Gigante (mais de 100 cm) |  | sim |  |

- **Desativa** o herdado `alimentacao` nesta categoria

## Brinquedos e Jogos › Brinquedos de exterior  `brinquedos-e-jogos-brinquedos-de-exterior`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_exterior` | Tipo | seleção | spec |  |  | 6 opções: Escorrega/Baloiço / Bola/Raquetes / Piscina/Brinquedos de água / Patins/Skate / Tenda/Casinha / Outro | Geral | sim |  |

- **Desativa** o herdado `alimentacao` nesta categoria

## Brinquedos e Jogos › Jogos tradicionais  `brinquedos-e-jogos-jogos-tradicionais`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_jogo_tradicional` | Jogo | seleção | spec | sim |  | 6 opções: Oril/Mancala (Ouri) / Damas/Xadrez / Dominó / Cartas / Ludo / Outro | Geral | sim |  |
| 20 | `material` | Material | seleção | spec |  |  | 4 opções: Madeira / Plástico / Papel/Cartão / Tecido | Materiais | sim |  |

- **Desativa** o herdado `alimentacao` nesta categoria

## Esportes e Fitness › Futebol  `esportes-e-fitness-futebol`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tamanho` | Tamanho | seleção | eixo |  |  | 10 opções: Único / P / M / G / GG / 36 / 38 / 40 / 42 / 44 |  | sim |  |
| 20 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 30 | `tipo_futebol` | Tipo | seleção | spec | sim |  | 7 opções: Camisola de equipa / Chuteiras / Bola / Caneleiras / Luvas de guarda-redes / Fato de treino / Outro | Geral | sim |  |


## Esportes e Fitness › Basquetebol  `esportes-e-fitness-basquetebol`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tamanho` | Tamanho | seleção | eixo |  |  | 5 opções: Único / P / M / G / GG |  | sim |  |
| 20 | `tipo_basquete` | Tipo | seleção | spec | sim |  | 5 opções: Bola / Camisola / Tabela/Cesto / Sapatilhas / Acessórios | Geral | sim |  |


## Esportes e Fitness › Corrida  `esportes-e-fitness-corrida`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tamanho` | Tamanho | seleção | eixo |  |  | 9 opções: Único / P / M / G / GG / 38 / 40 / 42 / 44 |  | sim |  |
| 20 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 30 | `tipo_corrida` | Tipo | seleção | spec | sim |  | 5 opções: Sapatilhas de corrida / Roupa técnica / Relógio/Pulseira / Cinto de hidratação / Outro | Geral | sim |  |


## Esportes e Fitness › Ciclismo  `esportes-e-fitness-ciclismo`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tamanho` | Tamanho do quadro/aro | seleção | eixo |  |  | 8 opções: Aro 20 / Aro 24 / Aro 26 / Aro 27.5 / Aro 29 / P / M / G |  | sim |  |
| 20 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 30 | `tipo_ciclismo` | Tipo | seleção | spec | sim |  | 6 opções: Bicicleta / Capacete / Pneu/Câmara / Luzes / Peças/Acessórios / Roupa | Geral | sim |  |
| 40 | `numero_velocidades` | Número de velocidades | número | spec |  |  | 1 a 30; inteiro | Desempenho |  |  |


## Esportes e Fitness › Equipamentos de ginástica  `esportes-e-fitness-equipamentos-de-ginastica`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_ginastica` | Tipo | seleção | spec | sim |  | 8 opções: Halteres/Pesos / Esteira / Bicicleta ergométrica / Banco de musculação / Tapete de yoga/Colchonete / Elásticos / Corda de saltar / Barra | Geral | sim |  |
| 20 | `carga_kg` | Carga/Peso | número | spec |  | kg | 0.5 a 500 kg; 1 casa(s) | Desempenho |  |  |
| 30 | `carga_max_usuario_kg` | Suporta até | número | spec |  | kg | 30 a 400 kg; inteiro | Segurança |  |  |


## Esportes e Fitness › Roupas esportivas  `esportes-e-fitness-roupas-esportivas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo | sim |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tamanho` | Tamanho | seleção | eixo | sim |  | 6 opções: PP / P / M / G / GG / XG |  | sim |  |
| 30 | `publico` | Público | seleção | spec |  |  | 4 opções: Masculino / Feminino / Unissex / Infantil | Geral | sim |  |
| 40 | `tipo_roupa_esportiva` | Tipo | seleção | spec |  |  | 7 opções: Camiseta / Short / Leggings / Fato de treino / Camisola de equipa / Casaco / Top | Geral | sim |  |


## Esportes e Fitness › Bolas e acessórios  `esportes-e-fitness-bolas-e-acessorios`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_bola` | Esporte | seleção | spec | sim |  | 7 opções: Futebol / Basquetebol / Voleibol / Andebol / Râguebi / Ténis / Outro | Geral | sim |  |
| 20 | `tamanho_bola` | Tamanho | seleção | spec |  |  | 5 opções: Nº 3 / Nº 4 / Nº 5 / Nº 6 / Nº 7 | Medidas | sim |  |
| 30 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |


## Esportes e Fitness › Artes marciais  `esportes-e-fitness-artes-marciais`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tamanho` | Tamanho | seleção | eixo |  |  | 6 opções: Infantil / PP / P / M / G / GG |  | sim |  |
| 20 | `modalidade` | Modalidade | seleção | spec | sim |  | 7 opções: Karaté / Judo / Taekwondo / Boxe / Capoeira / MMA/Kickboxing / Outra | Geral | sim |  |
| 30 | `tipo_equipamento_marcial` | Tipo | seleção | spec |  |  | 6 opções: Quimono/Fato / Luvas / Protetores / Saco de pancada / Cinto / Outro | Geral | sim |  |


## Esportes e Fitness › Camping  `esportes-e-fitness-camping`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_camping` | Tipo | seleção | spec | sim |  | 8 opções: Tenda / Saco-cama / Colchão/Esteira / Fogão de campista / Mochila de trekking / Lanterna / Cadeira/Mesa dobrável / Outro | Geral | sim |  |
| 20 | `capacidade_pessoas` | Capacidade | número | spec |  | pessoas | 1 a 20 pessoas; inteiro | Capacidade |  |  |
| 30 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |


## Esportes e Fitness › Pesca esportiva  `esportes-e-fitness-pesca-esportiva`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_pesca_esportiva` | Tipo | seleção | spec | sim |  | 7 opções: Cana de pesca / Carreto/Molinete / Linha/Fio / Iscas artificiais / Anzóis / Caixa/Mochila / Kit completo | Geral | sim |  |
| 20 | `comprimento_cana_m` | Comprimento da cana | número | spec |  | m | 0.5 a 8 m; 1 casa(s) | Medidas |  |  |


## Livros, Papelaria e Educação › Livros escolares  `livros-papelaria-e-educacao-livros-escolares`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `nivel_ensino` | Nível | seleção | spec | sim |  | 6 opções: Pré-escolar / 1º ao 4º ano / 5º ao 6º ano / 7º ao 9º ano / 10º ao 12º ano / Todos os níveis | Geral | sim |  |
| 20 | `disciplina` | Disciplina | texto | spec | sim |  | até 60 car. | Geral |  | Ex.: Matemática |
| 30 | `autor` | Autor/Editora | texto | spec |  |  | até 120 car. | Geral |  |  |
| 40 | `idioma_livro` | Idioma | seleção | spec |  |  | 5 opções: Português / Francês / Inglês / Crioulo / Outro | Geral | sim |  |


## Livros, Papelaria e Educação › Livros universitários  `livros-papelaria-e-educacao-livros-universitarios`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `area_conhecimento` | Área | texto | spec | sim |  | até 80 car. | Geral |  | Ex.: Direito, Medicina, Engenharia |
| 20 | `autor` | Autor/Editora | texto | spec |  |  | até 120 car. | Geral |  |  |
| 30 | `idioma_livro` | Idioma | seleção | spec |  |  | 4 opções: Português / Francês / Inglês / Outro | Geral | sim |  |


## Livros, Papelaria e Educação › Literatura  `livros-papelaria-e-educacao-literatura`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `genero_literario` | Género | seleção | spec | sim |  | 8 opções: Romance / Poesia / Conto/Crónica / Biografia / Infantil/Juvenil / História / Autoajuda / Outro | Geral | sim |  |
| 20 | `autor` | Autor/Editora | texto | spec |  |  | até 120 car. | Geral |  |  |
| 30 | `idioma_livro` | Idioma | seleção | spec |  |  | 5 opções: Português / Francês / Inglês / Crioulo / Outro | Geral | sim |  |
| 40 | `formato_livro` | Formato | seleção | spec |  |  | 3 opções: Brochura / Capa dura / Bolso | Geral | sim |  |


## Livros, Papelaria e Educação › Livros religiosos  `livros-papelaria-e-educacao-livros-religiosos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `religiao` | Tradição | seleção | spec | sim |  | 4 opções: Cristã (Bíblia) / Católica / Islâmica (Alcorão) / Outra | Geral | sim |  |
| 20 | `idioma_livro` | Idioma | seleção | spec |  |  | 6 opções: Português / Árabe / Francês / Inglês / Crioulo / Outro | Geral | sim |  |
| 30 | `formato_livro` | Formato | seleção | spec |  |  | 3 opções: Brochura / Capa dura / Bolso | Geral | sim |  |


## Livros, Papelaria e Educação › Cadernos  `livros-papelaria-e-educacao-cadernos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tipo_caderno` | Tipo | seleção | spec | sim |  | 5 opções: Caderno brochura / Caderno espiral / Bloco de notas / Agenda / Caderno de desenho | Geral | sim |  |
| 30 | `numero_folhas` | Folhas | seleção | spec |  |  | 7 opções: 40 / 48 / 60 / 80 / 96 / 100 / 200 | Geral | sim |  |
| 40 | `pautado` | Pauta | seleção | spec |  |  | 4 opções: Pautado / Quadriculado / Liso / Misto | Geral | sim |  |


## Livros, Papelaria e Educação › Canetas e lápis  `livros-papelaria-e-educacao-canetas-e-lapis`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 5 opções: Preto / Azul / Vermelho / Verde / Multicolorido |  | sim | Escolha a cor de cada variação. |
| 20 | `tipo_escrita` | Tipo | seleção | spec | sim |  | 7 opções: Caneta esferográfica / Lápis / Marcador/Marca-texto / Caneta de feltro / Caneta de tinta permanente / Lapiseira / Estojo/Kit | Geral | sim |  |
| 30 | `unidades_pacote` | Unidades por pacote | número | spec |  |  | 1 a 500; inteiro | Geral |  |  |


## Livros, Papelaria e Educação › Mochilas escolares  `livros-papelaria-e-educacao-mochilas-escolares`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo | sim |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tipo_mochila_escolar` | Tipo | seleção | spec | sim |  | 5 opções: Mochila / Mochila com rodas / Estojo / Lancheira / Conjunto escolar | Geral | sim |  |
| 30 | `capacidade_litros` | Capacidade | número | spec |  | L | 1 a 60 L; inteiro | Capacidade |  |  |


## Livros, Papelaria e Educação › Materiais didáticos  `livros-papelaria-e-educacao-materiais-didaticos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_didatico` | Tipo | seleção | spec | sim |  | 7 opções: Mapa/Cartaz / Quadro/Pizarra / Material de matemática / Alfabeto/Letras / Kit de ciências / Globo terrestre / Outro | Geral | sim |  |
| 20 | `nivel_ensino` | Nível | seleção | spec |  |  | 4 opções: Pré-escolar / Ensino básico / Ensino secundário / Todos | Geral | sim |  |


## Livros, Papelaria e Educação › Artigos de escritório  `livros-papelaria-e-educacao-artigos-de-escritorio`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_artigo_escritorio` | Tipo | seleção | spec | sim |  | 8 opções: Papel A4/Resma / Pastas/Arquivadores / Agrafadores/Furadores / Cola/Fita / Etiquetas / Envelopes / Calculadora / Outro | Geral | sim |  |
| 20 | `formato_papel` | Formato | seleção | spec |  |  | 4 opções: A4 / A3 / A5 / Carta/Ofício | Medidas | sim |  |


## Livros, Papelaria e Educação › Materiais de desenho  `livros-papelaria-e-educacao-materiais-de-desenho`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tipo_desenho` | Tipo | seleção | spec | sim |  | 7 opções: Lápis de cor / Tintas (guache/aguarela) / Pincéis / Papel de desenho / Tela/Cavalete / Régua/Esquadros / Kit completo | Geral | sim |  |


## Saúde e Bem-estar › Primeiros socorros  `saude-e-bem-estar-primeiros-socorros`

> NÃO inclui medicamentos (categoria de receita/venda restrita fora do escopo da árvore).

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_primeiros_socorros` | Tipo | seleção | spec | sim |  | 7 opções: Kit de primeiros socorros / Ligaduras/Gazes / Pensos rápidos / Antissépticos / Soro fisiológico / Tesouras/Pinças / Outro | Geral | sim |  |
| 20 | `validade_info` | Validade | texto | spec |  |  | até 60 car. | Segurança |  |  |


## Saúde e Bem-estar › Termômetros  `saude-e-bem-estar-termometros`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_termometro` | Tipo | seleção | spec | sim |  | 4 opções: Digital / Infravermelho (testa) / Infravermelho (ouvido) / De mercúrio/vidro | Geral | sim |  |
| 20 | `alimentacao` | Alimentação | seleção | spec |  |  | 2 opções: Pilhas / Bateria recarregável | Energia | sim |  |


## Saúde e Bem-estar › Medidores de pressão  `saude-e-bem-estar-medidores-de-pressao`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_medidor` | Tipo | seleção | spec | sim |  | 6 opções: Braço / Pulso / Glicosímetro (açúcar no sangue) / Oxímetro / Balança de saúde / Nebulizador | Geral | sim |  |
| 20 | `alimentacao` | Alimentação | seleção | spec |  |  | 4 opções: Pilhas / Tomada / Pilhas e tomada / Bateria recarregável | Energia | sim |  |
| 30 | `memoria_leituras` | Guarda as medições | sim/não | spec |  |  |  | Funções | sim |  |


## Saúde e Bem-estar › Produtos ortopédicos  `saude-e-bem-estar-produtos-ortopedicos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tamanho` | Tamanho | seleção | eixo | sim |  | 5 opções: P / M / G / GG / Único |  | sim |  |
| 20 | `tipo_ortopedico` | Tipo | seleção | spec | sim |  | 7 opções: Joelheira / Cinta/Faixa lombar / Colar cervical / Tala/Imobilizador / Palmilha ortopédica / Meias de compressão / Outro | Geral | sim |  |
| 30 | `lado` | Lado | seleção | spec |  |  | 3 opções: Esquerdo / Direito / Universal | Geral | sim |  |


## Saúde e Bem-estar › Mobilidade e acessibilidade  `saude-e-bem-estar-mobilidade-e-acessibilidade`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_mobilidade` | Tipo | seleção | spec | sim |  | 7 opções: Cadeira de rodas / Bengala / Muletas / Andarilho / Cadeira de banho / Rampa / Cama hospitalar | Geral | sim |  |
| 20 | `carga_max_usuario_kg` | Suporta até | número | spec |  | kg | 30 a 300 kg; inteiro | Segurança |  |  |
| 30 | `dobravel` | Dobrável | sim/não | spec |  |  |  | Funções | sim |  |


## Saúde e Bem-estar › Máscaras e luvas  `saude-e-bem-estar-mascaras-e-luvas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tamanho` | Tamanho | seleção | eixo |  |  | 5 opções: P / M / G / GG / Único |  | sim |  |
| 20 | `tipo_protecao` | Tipo | seleção | spec | sim |  | 6 opções: Máscara cirúrgica / Máscara FFP2/N95 / Máscara de pano / Luvas de látex / Luvas de nitrilo / Luvas de vinil | Geral | sim |  |
| 30 | `unidades_pacote` | Unidades por caixa | número | spec |  |  | 1 a 5000; inteiro | Geral |  |  |


## Saúde e Bem-estar › Higiene e prevenção  `saude-e-bem-estar-higiene-e-prevencao`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `capacidade` | Volume | seleção | eixo |  |  | 5 opções: 50 ml / 100 ml / 250 ml / 500 ml / 1 L |  | sim |  |
| 20 | `tipo_prevencao` | Tipo | seleção | spec | sim |  | 7 opções: Álcool gel/Desinfetante de mãos / Sabonete antisséptico / Repelente / Mosquiteiro / Preservativos / Protetor solar / Outro | Geral | sim |  |


## Saúde e Bem-estar › Equipamentos de cuidados pessoais  `saude-e-bem-estar-equipamentos-de-cuidados-pessoais`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_cuidado_pessoal` | Tipo | seleção | spec | sim |  | 7 opções: Massajador / Aparelho de nebulização / Humidificador / Almofada térmica / Balança corporal / Aparelho de vapor / Outro | Geral | sim |  |
| 20 | `alimentacao` | Alimentação | seleção | spec |  |  | 3 opções: Tomada / Bateria recarregável / Pilhas | Energia | sim |  |


## Pet Shop e Animais  `pet-shop-e-animais`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `animal` | Para | seleção | spec |  |  | 6 opções: Cães / Gatos / Aves / Peixes / Roedores / Vários | Geral | sim |  |


## Pet Shop e Animais › Rações para cães  `pet-shop-e-animais-racoes-para-caes`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tamanho` | Embalagem | seleção | eixo | sim |  | 5 opções: 1 kg / 3 kg / 10 kg / 15 kg / 20 kg |  | sim |  |
| 20 | `porte` | Porte | seleção | spec |  |  | 4 opções: Pequeno / Médio / Grande / Todos | Geral | sim |  |
| 30 | `fase_animal` | Fase | seleção | spec |  |  | 3 opções: Filhote / Adulto / Sénior | Geral | sim |  |

- **Desativa** o herdado `animal` nesta categoria

## Pet Shop e Animais › Rações para gatos  `pet-shop-e-animais-racoes-para-gatos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tamanho` | Embalagem | seleção | eixo | sim |  | 5 opções: 500 g / 1 kg / 3 kg / 10 kg / 15 kg |  | sim |  |
| 20 | `fase_animal` | Fase | seleção | spec |  |  | 3 opções: Filhote / Adulto / Sénior | Geral | sim |  |

- **Desativa** o herdado `animal` nesta categoria

## Pet Shop e Animais › Acessórios para animais  `pet-shop-e-animais-acessorios-para-animais`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tamanho` | Tamanho | seleção | eixo |  |  | 4 opções: P / M / G / GG |  | sim |  |
| 30 | `tipo_acessorio_pet` | Tipo | seleção | spec | sim |  | 6 opções: Roupa / Comedouro/Bebedouro / Transportadora / Arranhador / Pente/Escova / Outro | Geral | sim |  |


## Pet Shop e Animais › Coleiras e guias  `pet-shop-e-animais-coleiras-e-guias`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tamanho` | Tamanho | seleção | eixo | sim |  | 4 opções: P / M / G / GG |  | sim |  |
| 30 | `tipo_coleira` | Tipo | seleção | spec | sim |  | 5 opções: Coleira / Guia / Peitoral / Coleira antipulgas / Focinheira | Geral | sim |  |


## Pet Shop e Animais › Camas para animais  `pet-shop-e-animais-camas-para-animais`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tamanho` | Tamanho | seleção | eixo | sim |  | 4 opções: P / M / G / GG |  | sim |  |
| 30 | `tipo_cama_pet` | Tipo | seleção | spec |  |  | 4 opções: Cama / Almofada / Casinha / Cobertor | Geral | sim |  |


## Pet Shop e Animais › Higiene animal  `pet-shop-e-animais-higiene-animal`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `capacidade` | Volume | seleção | eixo |  |  | 4 opções: 100 ml / 250 ml / 500 ml / 1 L |  | sim |  |
| 20 | `tipo_higiene_pet` | Tipo | seleção | spec | sim |  | 6 opções: Champô/Sabonete / Antipulgas/Carrapatos / Escova/Pente / Areia/Granulado / Tapetes higiénicos / Cortador de unhas | Geral | sim |  |


## Pet Shop e Animais › Aquários  `pet-shop-e-animais-aquarios`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `capacidade` | Capacidade | seleção | eixo |  |  | 6 opções: 20 L / 40 L / 60 L / 100 L / 200 L / 300 L |  | sim |  |
| 20 | `tipo_aquario` | Tipo | seleção | spec | sim |  | 7 opções: Aquário / Filtro/Bomba / Aquecedor / Iluminação / Alimento para peixes / Decoração / Kit completo | Geral | sim |  |

- **Desativa** o herdado `animal` nesta categoria

## Pet Shop e Animais › Gaiolas  `pet-shop-e-animais-gaiolas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tamanho` | Tamanho | seleção | eixo |  |  | 4 opções: Pequena / Média / Grande / Extra grande |  | sim |  |
| 20 | `tipo_gaiola` | Tipo | seleção | spec | sim |  | 5 opções: Gaiola para aves / Gaiola para roedores / Viveiro / Poleiro/Acessórios / Ninho/Capoeira | Geral | sim |  |

- **Override** `animal`: {"options":["Aves","Roedores","Vários"]}

## Pet Shop e Animais › Brinquedos para animais  `pet-shop-e-animais-brinquedos-para-animais`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tipo_brinquedo_pet` | Tipo | seleção | spec |  |  | 6 opções: Bola / Mordedor/Osso / Pelúcia / Corda / Interativo / Arranhador | Geral | sim |  |


## Festas e Eventos  `festas-e-eventos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |


## Festas e Eventos › Decoração de festas  `festas-e-eventos-decoracao-de-festas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tema` | Tema/Ocasião | seleção | spec |  |  | 9 opções: Aniversário / Casamento / Batizado / Formatura / Natal / Ano novo / Infantil / Religioso / Outro | Geral | sim |  |
| 20 | `tipo_decoracao_festa` | Tipo | seleção | spec | sim |  | 7 opções: Faixas/Bandeiras / Guirlandas / Painéis/Backdrops / Centros de mesa / Toalhas / Luzes decorativas / Kit | Geral | sim |  |


## Festas e Eventos › Balões  `festas-e-eventos-baloes`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_balao` | Tipo | seleção | spec | sim |  | 5 opções: Látex / Metalizado (foil) / Hélio/Números e letras / Bomba/Inflador / Arco/Kit | Geral | sim |  |
| 20 | `unidades_pacote` | Unidades por pacote | número | spec |  |  | 1 a 1000; inteiro | Geral |  |  |


## Festas e Eventos › Artigos de casamento  `festas-e-eventos-artigos-de-casamento`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_casamento` | Tipo | seleção | spec | sim |  | 6 opções: Decoração / Lembranças / Convites / Acessórios dos noivos / Almofada de alianças / Arranjos | Geral | sim |  |


## Festas e Eventos › Artigos de aniversário  `festas-e-eventos-artigos-de-aniversario`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_aniversario` | Tipo | seleção | spec | sim |  | 6 opções: Velas / Chapéus/Adereços / Pratos e copos / Topo de bolo / Piñata / Kit | Geral | sim |  |
| 20 | `faixa_idade` | Para | seleção | spec |  |  | 4 opções: Criança / Adolescente / Adulto / Todos | Geral | sim |  |


## Festas e Eventos › Lembranças  `festas-e-eventos-lembrancas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_lembranca` | Tipo | seleção | spec | sim |  | 6 opções: Chaveiros / Caixinhas / Sacos/Embalagens / Ímanes / Personalizados / Outro | Geral | sim |  |
| 20 | `unidades_pacote` | Unidades por pacote | número | spec |  |  | 1 a 1000; inteiro | Geral |  |  |


## Festas e Eventos › Utensílios descartáveis  `festas-e-eventos-utensilios-descartaveis`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_descartavel` | Tipo | seleção | spec | sim |  | 7 opções: Pratos / Copos / Talheres / Guardanapos / Toalhas de mesa / Palhinhas / Recipientes | Geral | sim |  |
| 20 | `unidades_pacote` | Unidades por pacote | número | spec |  |  | 1 a 5000; inteiro | Geral |  |  |
| 30 | `material_descartavel` | Material | seleção | spec |  |  | 4 opções: Plástico / Papel/Cartão / Biodegradável / Alumínio | Materiais | sim |  |


## Festas e Eventos › Equipamentos de som  `festas-e-eventos-equipamentos-de-som`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_som_festa` | Tipo | seleção | spec | sim |  | 6 opções: Coluna ativa / Mesa de som / Microfone / Kit DJ / Amplificador / Aluguer não incluído | Geral | sim |  |
| 20 | `potencia_rms_w` | Potência (RMS) | número | spec |  | W | 10 a 50000 W; inteiro | Desempenho | sim |  |

- **Desativa** o herdado `cor` nesta categoria

## Festas e Eventos › Iluminação para eventos  `festas-e-eventos-iluminacao-para-eventos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_luz_evento` | Tipo | seleção | spec | sim |  | 6 opções: Projetor LED/Efeitos / Globo de espelhos / Lasers / Fita/Cordão de luzes / Holofote / Máquina de fumo | Geral | sim |  |
| 20 | `alimentacao` | Alimentação | seleção | spec |  |  | 3 opções: Tomada / Bateria / Pilhas | Energia | sim |  |

- **Desativa** o herdado `cor` nesta categoria

## Festas e Eventos › Tendas e coberturas  `festas-e-eventos-tendas-e-coberturas`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_tenda` | Tipo | seleção | spec | sim |  | 5 opções: Tenda dobrável / Tenda de evento / Toldo / Lona / Mesas e cadeiras de evento | Geral | sim |  |
| 20 | `tamanho_tenda` | Tamanho | seleção | spec |  |  | 7 opções: 2x2 m / 3x3 m / 3x6 m / 4x4 m / 5x5 m / 6x10 m / Outro | Medidas | sim |  |


## Festas e Eventos › Artigos religiosos para eventos  `festas-e-eventos-artigos-religiosos-para-eventos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tradicao` | Tradição | seleção | spec |  |  | 4 opções: Cristã/Católica / Islâmica / Tradicional africana / Outra | Geral | sim |  |
| 20 | `tipo_religioso` | Tipo | seleção | spec | sim |  | 6 opções: Velas/Círios / Terços/Tasbih / Roupas cerimoniais / Livros/Imagens / Decoração / Outro | Geral | sim |  |


## Produtos Tradicionais e Artesanato  `produtos-tradicionais-e-artesanato`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `origem_etnia` | Origem/Tradição | seleção | spec |  |  | 8 opções: Guiné-Bissau (Balanta) / Guiné-Bissau (Fula) / Guiné-Bissau (Mandinga) / Guiné-Bissau (Manjaco) / Guiné-Bissau (Papel) / Guiné-Bissau (Bijagós) / Outra região da Guiné-Bissau / Outro país | Cultura | sim | Opcional: ajuda o comprador a conhecer a origem da peça. |
| 20 | `feito_a_mao` | Feito à mão | sim/não | spec |  |  |  | Cultura | sim |  |


## Produtos Tradicionais e Artesanato › Tecidos africanos  `produtos-tradicionais-e-artesanato-tecidos-africanos`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tamanho` | Metragem | seleção | eixo | sim |  | 5 opções: 1 jarda (0.9 m) / 2 jardas / 3 jardas / 6 jardas (peça completa) / Corte (por metro) |  | sim |  |
| 30 | `tipo_tecido` | Tecido | seleção | spec | sim |  | 6 opções: Bazin / Wax (tecido africano) / Capulana / Brocado / Algodão estampado / Renda | Geral | sim |  |


## Produtos Tradicionais e Artesanato › Panos tradicionais  `produtos-tradicionais-e-artesanato-panos-tradicionais`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tipo_pano` | Tipo | seleção | spec | sim |  | 5 opções: Pano de pinti / Pano de obra / Pano de lenço/cabeça / Pano de cintura / Outro | Geral | sim |  |
| 30 | `tecelagem` | Técnica | seleção | spec |  |  | 4 opções: Tecido em tear / Estampado / Tingido (batik) / Bordado | Geral | sim |  |


## Produtos Tradicionais e Artesanato › Artesanato guineense  `produtos-tradicionais-e-artesanato-artesanato-guineense`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_artesanato` | Tipo | seleção | spec | sim |  | 7 opções: Escultura / Máscara / Cestaria / Cerâmica/Barro / Têxtil / Pintura/Arte / Outro | Geral | sim |  |
| 20 | `material_artesanato` | Material | seleção | spec |  |  | 7 opções: Madeira / Palha/Fibra / Barro / Tecido / Metal / Couro / Misto | Materiais | sim |  |


## Produtos Tradicionais e Artesanato › Cestos e cestaria  `produtos-tradicionais-e-artesanato-cestos-e-cestaria`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tamanho` | Tamanho | seleção | eixo |  |  | 3 opções: Pequeno / Médio / Grande |  | sim |  |
| 20 | `tipo_cesto` | Tipo | seleção | spec |  |  | 6 opções: Cesto / Esteira / Chapéu / Leque / Bandeja / Outro | Geral | sim |  |
| 30 | `material_artesanato` | Material | seleção | spec |  |  | 4 opções: Palha / Bambu / Folha de palma / Fibra sintética | Materiais | sim |  |


## Produtos Tradicionais e Artesanato › Artigos de madeira  `produtos-tradicionais-e-artesanato-artigos-de-madeira`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_madeira` | Tipo | seleção | spec | sim |  | 6 opções: Escultura / Utensílio / Móvel pequeno / Instrumento / Joia/Acessório / Decoração | Geral | sim |  |
| 20 | `tipo_madeira_origem` | Madeira | seleção | spec |  |  | 5 opções: Mogno / Ébano / Teca / Cajueiro / Outra | Materiais | sim |  |


## Produtos Tradicionais e Artesanato › Bijuterias artesanais  `produtos-tradicionais-e-artesanato-bijuterias-artesanais`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tipo_bijuteria` | Tipo | seleção | spec | sim |  | 6 opções: Colar / Pulseira / Brincos / Anel / Tornozeleira / Cintura | Geral | sim |  |
| 30 | `material_artesanato` | Material | seleção | spec |  |  | 6 opções: Contas/Missangas / Conchas / Sementes / Metal / Couro/Tecido / Misto | Materiais | sim |  |


## Produtos Tradicionais e Artesanato › Instrumentos tradicionais  `produtos-tradicionais-e-artesanato-instrumentos-tradicionais`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_instrumento_trad` | Instrumento | seleção | spec | sim |  | 6 opções: Tambor (djembé/tamã) / Balafon / Kora / Chocalho/Maracas / Flauta / Outro | Geral | sim |  |
| 20 | `material_artesanato` | Material | seleção | spec |  |  | 4 opções: Madeira e pele / Cabaça / Metal / Misto | Materiais | sim |  |


## Produtos Tradicionais e Artesanato › Decoração africana  `produtos-tradicionais-e-artesanato-decoracao-africana`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_decoracao_africana` | Tipo | seleção | spec | sim |  | 6 opções: Máscara de parede / Estatueta / Quadro/Tapeçaria / Almofada/Capa / Vaso/Cesto decorativo / Outro | Geral | sim |  |
| 20 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |


## Produtos Tradicionais e Artesanato › Produtos culturais  `produtos-tradicionais-e-artesanato-produtos-culturais`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_cultural` | Tipo | seleção | spec | sim |  | 6 opções: Livro/Música / Instrumento miniatura / Roupa cerimonial / Objeto ritual (decorativo) / Jogo tradicional / Outro | Geral | sim |  |


## Produtos Tradicionais e Artesanato › Lembranças regionais  `produtos-tradicionais-e-artesanato-lembrancas-regionais`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_lembranca` | Tipo | seleção | spec | sim |  | 6 opções: Chaveiro / Íman / Miniatura / T-shirt / Postal/Impresso / Outro | Geral | sim |  |
| 20 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |


## Instrumentos Musicais › Guitarras  `instrumentos-musicais-guitarras`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tipo_guitarra` | Tipo | seleção | spec | sim |  | 6 opções: Violão acústico / Violão elétrico-acústico / Guitarra elétrica / Baixo / Ukulele / Cavaquinho | Geral | sim |  |
| 30 | `numero_cordas` | Cordas | seleção | spec |  |  | 5 opções: 4 / 5 / 6 / 7 / 12 | Geral | sim |  |
| 40 | `canhoto` | Para canhotos | sim/não | spec |  |  |  | Geral | sim |  |


## Instrumentos Musicais › Teclados musicais  `instrumentos-musicais-teclados-musicais`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tipo_teclado` | Tipo | seleção | spec | sim |  | 5 opções: Teclado arranjador / Piano digital / Sintetizador / Controlador MIDI / Acordeão | Geral | sim |  |
| 30 | `numero_teclas` | Teclas | seleção | spec |  |  | 7 opções: 25 / 32 / 37 / 49 / 61 / 76 / 88 | Geral | sim |  |


## Instrumentos Musicais › Baterias e percussão  `instrumentos-musicais-baterias-e-percussao`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_percussao` | Tipo | seleção | spec | sim |  | 7 opções: Bateria acústica / Bateria eletrónica / Djembé/Tambor / Congas/Bongos / Pratos/Hi-hat / Pandeiro/Chocalho / Baquetas | Geral | sim |  |
| 20 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |


## Instrumentos Musicais › Microfones  `instrumentos-musicais-microfones`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_microfone` | Tipo | seleção | spec | sim |  | 5 opções: Dinâmico / Condensador / Sem fios / Lapela / USB | Geral | sim |  |
| 20 | `ligacao` | Ligação | seleção | spec |  |  | 4 opções: Cabo XLR / Cabo P10/P2 / USB / Sem fios (UHF/Bluetooth) | Conectividade | sim |  |


## Instrumentos Musicais › Mesas de som  `instrumentos-musicais-mesas-de-som`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `canais_mesa` | Canais | número | spec | sim |  | 2 a 64; inteiro | Geral | sim |  |
| 20 | `efeitos_digitais` | Com efeitos digitais | sim/não | spec |  |  |  | Funções | sim |  |
| 30 | `interface_usb` | Interface USB/Bluetooth | sim/não | spec |  |  |  | Conectividade | sim |  |


## Instrumentos Musicais › Instrumentos tradicionais  `instrumentos-musicais-instrumentos-tradicionais`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_instrumento_trad` | Instrumento | seleção | spec | sim |  | 6 opções: Tambor (djembé/tamã) / Balafon / Kora / Chocalho/Maracas / Flauta / Outro | Geral | sim |  |
| 20 | `material_artesanato` | Material | seleção | spec |  |  | 4 opções: Madeira e pele / Cabaça / Metal / Misto | Materiais | sim |  |


## Instrumentos Musicais › Acessórios musicais  `instrumentos-musicais-acessorios-musicais`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `cor` | Cor | seleção | eixo |  |  | 17 opções: Preto / Branco / Cinzento / Prateado / Dourado / Azul / Azul-marinho / Verde / Vermelho / Amarelo / Laranja / Rosa / Roxo / Castanho / Bege / Multicolorido / Estampado |  | sim | Escolha a cor de cada variação. |
| 20 | `tipo_acessorio_musical` | Tipo | seleção | spec | sim |  | 7 opções: Cordas / Palhetas/Plectros / Capas/Bolsas / Suportes/Estantes / Afinadores / Cabos / Outro | Geral | sim |  |
| 30 | `compativel_com` | Compatível com | texto | spec |  |  | até 120 car. | Compatibilidade |  |  |


## Instrumentos Musicais › Equipamentos de gravação  `instrumentos-musicais-equipamentos-de-gravacao`

| ord | código | nome | tipo | papel | obrig. | unidade | opções / limites | grupo | filtro | ajuda / placeholder |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `tipo_gravacao` | Tipo | seleção | spec | sim |  | 6 opções: Interface de áudio / Gravador portátil / Monitores de estúdio / Fones de estúdio / Filtro anti-pop/Suporte / Kit de estúdio | Geral | sim |  |
| 20 | `ligacao` | Ligação | seleção | spec |  |  | 4 opções: USB / USB-C / XLR / Bluetooth | Conectividade | sim |  |
