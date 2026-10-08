/** FASE 8A — matriz: tecnologia (celulares, informática, TV/áudio, eletrodomésticos, games). */
import type { CategoryPlan } from './types.js';
import { ARMAZENAMENTO, COR, RAM_GB, VOLTAGEM_REDE, axCapacidade, axCor, axVoltagem, multi, num, plan, root, sel, text, yesno } from './library.js';

const REDE_MOVEL = ['2G', '3G', '4G', '5G'];
const SO_MOVEL = ['Android', 'iOS', 'Outro'];

export const tecnologiaPlans: CategoryPlan[] = [
  // ============================================================================================ CELULARES E TELEFONES
  ...root('celulares-e-telefones', {
    subs: {
      smartphones: {
        define: [
          axCor(true),
          axCapacidade('Armazenamento', ARMAZENAMENTO.filter((o) => !['2 TB'].includes(o)), true, 'Memória interna do telefone.'),
          sel('sistema_operativo', 'Sistema operativo', SO_MOVEL, { required: true, group: 'Geral' }),
          sel('memoria_ram', 'Memória RAM', RAM_GB.filter((o) => !['32 GB', '64 GB'].includes(o)), { required: true, group: 'Desempenho' }),
          num('tamanho_ecra', 'Tamanho do ecrã', { unit: 'pol', min: 1, max: 10, decimals: 1, group: 'Ecrã', filter: true }),
          num('camara_principal', 'Câmara principal', { unit: 'MP', min: 0.3, max: 300, decimals: 1, group: 'Câmara' }),
          num('bateria_mah', 'Bateria', { unit: 'mAh', min: 500, max: 20000, decimals: 0, group: 'Bateria' }),
          sel('rede_movel', 'Rede móvel', ['3G', '4G', '5G'], { group: 'Conectividade' }),
          yesno('dual_sim', 'Dual SIM (2 cartões)', { group: 'Conectividade' }),
          yesno('desbloqueado', 'Desbloqueado para qualquer operadora', { group: 'Conectividade', help: 'Escolha Sim se funciona com qualquer cartão SIM.' }),
        ],
      },
      'celulares-basicos': {
        define: [
          axCor(false),
          sel('rede_movel', 'Rede móvel', ['2G', '3G', '4G'], { group: 'Conectividade' }),
          yesno('dual_sim', 'Dual SIM (2 cartões)', { group: 'Conectividade' }),
          num('bateria_mah', 'Bateria', { unit: 'mAh', min: 300, max: 10000, decimals: 0, group: 'Bateria' }),
          yesno('radio_fm', 'Rádio FM', { group: 'Funções' }),
          yesno('lanterna', 'Lanterna', { group: 'Funções' }),
        ],
      },
      'capas-e-peliculas': {
        define: [
          axCor(false),
          sel('tipo_acessorio', 'Tipo', ['Capa rígida', 'Capa de silicone', 'Capa carteira (flip)', 'Película de vidro', 'Película de hidrogel', 'Outro'], { required: true, group: 'Geral' }),
          text('compativel_com', 'Compatível com', { required: true, maxLength: 120, group: 'Compatibilidade', placeholder: 'Ex.: Samsung Galaxy A14', help: 'Escreva o modelo do telefone para o qual serve.' }),
        ],
      },
      'carregadores-e-cabos': {
        define: [
          axCor(false),
          sel('tipo_acessorio', 'Tipo', ['Carregador de parede', 'Cabo', 'Carregador de carro', 'Carregador sem fios', 'Carregador portátil (power bank)', 'Adaptador'], { required: true, group: 'Geral' }),
          sel('conector', 'Conector', ['USB-C', 'Lightning', 'Micro-USB', 'USB-A', 'Vários'], { group: 'Compatibilidade' }),
          num('potencia_w', 'Potência', { unit: 'W', min: 1, max: 300, decimals: 0, group: 'Desempenho', filter: true }),
          num('comprimento_cabo', 'Comprimento do cabo', { unit: 'm', min: 0.1, max: 10, decimals: 1, group: 'Medidas' }),
          num('capacidade_bateria_mah', 'Capacidade do power bank', { unit: 'mAh', min: 1000, max: 100000, decimals: 0, group: 'Bateria', help: 'Só para carregadores portáteis.' }),
        ],
      },
      'baterias-e-pecas': {
        define: [
          sel('tipo_acessorio', 'Tipo de peça', ['Bateria', 'Ecrã/LCD', 'Conector de carga', 'Câmara', 'Altifalante', 'Carcaça', 'Outra peça'], { required: true, group: 'Geral' }),
          text('compativel_com', 'Compatível com', { required: true, maxLength: 120, group: 'Compatibilidade', placeholder: 'Ex.: iPhone 11' }),
          num('capacidade_bateria_mah', 'Capacidade (baterias)', { unit: 'mAh', min: 300, max: 20000, decimals: 0, group: 'Bateria' }),
        ],
      },
      smartwatches: {
        define: [
          axCor(true),
          multi('compativel_sistema', 'Compatível com', ['Android', 'iOS'], { group: 'Compatibilidade' }),
          num('tamanho_ecra', 'Tamanho do ecrã', { unit: 'pol', min: 0.5, max: 3, decimals: 2, group: 'Ecrã' }),
          yesno('monitor_cardiaco', 'Monitor de batimentos cardíacos', { group: 'Saúde' }),
          yesno('resistente_agua', 'Resistente à água', { group: 'Uso' }),
          yesno('faz_chamadas', 'Faz e recebe chamadas', { group: 'Funções' }),
          num('autonomia_dias', 'Autonomia da bateria', { unit: 'dias', min: 1, max: 60, decimals: 0, group: 'Bateria' }),
        ],
      },
      'acessorios-para-celulares': {
        define: [
          axCor(false),
          sel('tipo_acessorio', 'Tipo', ['Suporte', 'Pau de selfie', 'Anel/pop socket', 'Cartão de memória', 'Adaptador', 'Auricular com fio', 'Outro'], { required: true, group: 'Geral' }),
          text('compativel_com', 'Compatível com', { maxLength: 120, group: 'Compatibilidade' }),
        ],
      },
      'telefones-fixos': {
        define: [
          axCor(false),
          sel('tipo_telefone', 'Tipo', ['Com fio', 'Sem fio', 'Sem fio com atendedor'], { required: true, group: 'Geral' }),
          yesno('identificador_chamadas', 'Identificador de chamadas', { group: 'Funções' }),
          yesno('viva_voz', 'Viva-voz', { group: 'Funções' }),
        ],
      },
      'radios-comunicadores': {
        define: [
          sel('tipo_radio', 'Tipo', ['Walkie-talkie', 'Rádio VHF/UHF', 'Rádio CB', 'Rádio de bolso'], { required: true, group: 'Geral' }),
          num('alcance_km', 'Alcance', { unit: 'km', min: 0.1, max: 100, decimals: 1, group: 'Desempenho' }),
          num('potencia_w', 'Potência', { unit: 'W', min: 0.1, max: 100, decimals: 1, group: 'Desempenho' }),
          num('canais', 'Número de canais', { min: 1, max: 999, decimals: 0, group: 'Desempenho' }),
        ],
        note: 'Categoria sujeita a regras de licenciamento de frequências. A política de venda (permitida/restrita) é decisão do dono: a matriz NÃO inclui campos jurídicos.',
      },
    },
  }),

  // ============================================================================================ INFORMÁTICA E COMPUTADORES
  ...root('informatica-e-computadores', {
    subs: {
      notebooks: {
        define: [
          axCor(false),
          axCapacidade('Armazenamento', ['128 GB', '256 GB', '512 GB', '1 TB', '2 TB'], true, 'Tamanho do disco. A memória RAM é característica do anúncio: versões com RAM diferente são anúncios separados.'),
          sel('processador', 'Processador', ['Intel Core i3', 'Intel Core i5', 'Intel Core i7', 'Intel Core i9', 'AMD Ryzen 3', 'AMD Ryzen 5', 'AMD Ryzen 7', 'Intel Celeron/Pentium', 'Apple M1/M2/M3', 'Outro'], { required: true, group: 'Desempenho' }),
          sel('memoria_ram', 'Memória RAM', ['4 GB', '8 GB', '12 GB', '16 GB', '32 GB', '64 GB'], { required: true, group: 'Desempenho' }),
          sel('tipo_armazenamento', 'Tipo de armazenamento', ['SSD', 'HD', 'SSD + HD'], { group: 'Desempenho' }),
          num('tamanho_ecra', 'Tamanho do ecrã', { unit: 'pol', min: 10, max: 20, decimals: 1, group: 'Ecrã', filter: true }),
          sel('sistema_operativo', 'Sistema operativo', ['Windows', 'macOS', 'Linux', 'Sem sistema'], { group: 'Geral' }),
        ],
      },
      'computadores-de-mesa': {
        define: [
          sel('tipo_computador', 'Tipo', ['Torre', 'Tudo em um (All-in-One)', 'Mini PC'], { required: true, group: 'Geral' }),
          sel('processador', 'Processador', ['Intel Core i3', 'Intel Core i5', 'Intel Core i7', 'Intel Core i9', 'AMD Ryzen 3', 'AMD Ryzen 5', 'AMD Ryzen 7', 'Intel Celeron/Pentium', 'Outro'], { required: true, group: 'Desempenho' }),
          sel('memoria_ram', 'Memória RAM', ['4 GB', '8 GB', '16 GB', '32 GB', '64 GB'], { required: true, group: 'Desempenho' }),
          sel('armazenamento', 'Armazenamento', ['128 GB', '256 GB', '512 GB', '1 TB', '2 TB'], { group: 'Desempenho' }),
          sel('sistema_operativo', 'Sistema operativo', ['Windows', 'Linux', 'Sem sistema'], { group: 'Geral' }),
        ],
      },
      tablets: {
        define: [
          axCor(true),
          axCapacidade('Armazenamento', ARMAZENAMENTO.filter((o) => o !== '2 TB'), true),
          sel('sistema_operativo', 'Sistema operativo', ['Android', 'iPadOS', 'Windows', 'Outro'], { required: true, group: 'Geral' }),
          sel('memoria_ram', 'Memória RAM', RAM_GB.filter((o) => !['32 GB', '64 GB'].includes(o)), { group: 'Desempenho' }),
          num('tamanho_ecra', 'Tamanho do ecrã', { unit: 'pol', min: 5, max: 14, decimals: 1, group: 'Ecrã', filter: true }),
          sel('conectividade', 'Conectividade', ['Wi-Fi', 'Wi-Fi + 4G/5G'], { group: 'Conectividade' }),
        ],
      },
      monitores: {
        define: [
          num('tamanho_ecra', 'Tamanho do ecrã', { unit: 'pol', required: true, min: 10, max: 100, decimals: 1, group: 'Ecrã', filter: true }),
          sel('resolucao', 'Resolução', ['HD (1366x768)', 'Full HD (1920x1080)', '2K (2560x1440)', '4K (3840x2160)', 'Outra'], { required: true, group: 'Ecrã' }),
          num('taxa_atualizacao_hz', 'Taxa de atualização', { unit: 'Hz', min: 30, max: 500, decimals: 0, group: 'Ecrã' }),
          sel('tipo_painel', 'Tipo de painel', ['IPS', 'VA', 'TN', 'OLED'], { group: 'Ecrã' }),
          multi('entradas_video', 'Entradas de vídeo', ['HDMI', 'VGA', 'DisplayPort', 'USB-C'], { group: 'Conectividade' }),
        ],
      },
      'teclados-e-mouses': {
        define: [
          axCor(false),
          sel('tipo_periferico', 'Tipo', ['Teclado', 'Mouse', 'Teclado e mouse (kit)', 'Mousepad', 'Teclado gamer', 'Mouse gamer'], { required: true, group: 'Geral' }),
          sel('ligacao', 'Ligação', ['Com fio (USB)', 'Sem fio (receptor USB)', 'Bluetooth'], { group: 'Conectividade' }),
          sel('layout_teclado', 'Layout do teclado', ['Português (PT)', 'Português (BR)', 'Francês (AZERTY)', 'Inglês (US)'], { group: 'Geral', help: 'Só para teclados.' }),
        ],
      },
      'impressoras-e-scanners': {
        define: [
          sel('tipo_impressora', 'Tipo', ['Jato de tinta', 'Laser', 'Multifuncional', 'Térmica (recibos)', 'Matricial', 'Scanner'], { required: true, group: 'Geral' }),
          yesno('impressao_colorida', 'Impressão a cores', { group: 'Desempenho' }),
          multi('ligacoes', 'Ligações', ['USB', 'Wi-Fi', 'Rede (Ethernet)', 'Bluetooth'], { group: 'Conectividade' }),
          sel('formato_papel', 'Formato máximo do papel', ['A4', 'A3', 'Rolo de recibo'], { group: 'Desempenho' }),
        ],
      },
      'cartuchos-e-toners': {
        define: [
          sel('tipo_consumivel', 'Tipo', ['Cartucho de tinta', 'Toner', 'Tinta em garrafa', 'Fita/Ribbon', 'Cilindro'], { required: true, group: 'Geral' }),
          text('compativel_com', 'Compatível com', { required: true, maxLength: 150, group: 'Compatibilidade', placeholder: 'Ex.: HP LaserJet 1020' }),
          sel('cor_impressao', 'Cor de impressão', ['Preto', 'Ciano', 'Magenta', 'Amarelo', 'Colorido (kit)'], { group: 'Geral' }),
          num('rendimento_paginas', 'Rendimento', { unit: 'páginas', min: 50, max: 100000, decimals: 0, group: 'Desempenho' }),
        ],
      },
      'discos-ssd-e-hd': {
        define: [
          axCapacidade('Capacidade', ['32 GB', '64 GB', '128 GB', '256 GB', '512 GB', '1 TB', '2 TB', '4 TB', '8 TB'], true),
          sel('tipo_disco', 'Tipo', ['SSD SATA', 'SSD NVMe', 'HD interno', 'HD externo', 'SSD externo', 'Pen drive', 'Cartão de memória'], { required: true, group: 'Geral' }),
          sel('interface', 'Interface', ['SATA', 'NVMe (M.2)', 'USB 3.0', 'USB-C', 'microSD/SD'], { group: 'Conectividade' }),
        ],
      },
      'memorias-e-processadores': {
        define: [
          axCapacidade('Capacidade', ['2 GB', '4 GB', '8 GB', '16 GB', '32 GB', '64 GB'], false, 'Só para memórias RAM.'),
          sel('tipo_componente', 'Tipo', ['Memória RAM DDR3', 'Memória RAM DDR4', 'Memória RAM DDR5', 'Memória RAM para portátil', 'Processador', 'Placa-mãe', 'Placa de vídeo', 'Fonte de alimentação'], { required: true, group: 'Geral' }),
          text('compativel_com', 'Compatível com', { maxLength: 120, group: 'Compatibilidade', placeholder: 'Ex.: soquete LGA1155' }),
          num('velocidade_mhz', 'Velocidade', { unit: 'MHz', min: 400, max: 10000, decimals: 0, group: 'Desempenho' }),
        ],
      },
      'redes-e-roteadores': {
        define: [
          sel('tipo_rede', 'Tipo', ['Roteador Wi-Fi', 'Repetidor/Extensor', 'Switch', 'Modem 4G/5G', 'Antena', 'Placa de rede', 'Cabo de rede'], { required: true, group: 'Geral' }),
          sel('padrao_wifi', 'Padrão Wi-Fi', ['Wi-Fi 4 (N)', 'Wi-Fi 5 (AC)', 'Wi-Fi 6 (AX)'], { group: 'Conectividade' }),
          num('velocidade_mbps', 'Velocidade máxima', { unit: 'Mbps', min: 10, max: 20000, decimals: 0, group: 'Desempenho' }),
          num('portas_rede', 'Portas de rede', { min: 1, max: 48, decimals: 0, group: 'Conectividade' }),
        ],
      },
      'acessorios-de-informatica': {
        define: [
          axCor(false),
          sel('tipo_acessorio', 'Tipo', ['Hub USB', 'Webcam', 'Suporte para portátil', 'Cabo HDMI/VGA', 'Adaptador', 'Mochila/Capa para portátil', 'Limpeza', 'Outro'], { required: true, group: 'Geral' }),
          text('compativel_com', 'Compatível com', { maxLength: 120, group: 'Compatibilidade' }),
        ],
      },
    },
  }),

  // ============================================================================================ ELETRÓNICOS, TV E ÁUDIO
  ...root('eletronicos-tv-e-audio', {
    subs: {
      televisores: {
        define: [
          num('tamanho_ecra', 'Tamanho do ecrã', { unit: 'pol', required: true, min: 10, max: 120, decimals: 0, group: 'Ecrã', filter: true }),
          sel('resolucao', 'Resolução', ['HD', 'Full HD', '4K (Ultra HD)', '8K'], { required: true, group: 'Ecrã' }),
          sel('tecnologia_ecra', 'Tecnologia do ecrã', ['LED', 'QLED', 'OLED', 'LCD', 'Plasma'], { group: 'Ecrã' }),
          yesno('smart_tv', 'Smart TV', { group: 'Funções' }),
          multi('entradas_video', 'Entradas', ['HDMI', 'USB', 'VGA', 'AV', 'Antena'], { group: 'Conectividade' }),
          yesno('receptor_digital', 'Receptor digital integrado', { group: 'Funções' }),
        ],
      },
      projetores: {
        define: [
          num('luminosidade_lumens', 'Luminosidade', { unit: 'lumens', min: 100, max: 20000, decimals: 0, group: 'Imagem' }),
          sel('resolucao', 'Resolução', ['SVGA', 'HD', 'Full HD', '4K'], { group: 'Imagem' }),
          sel('tecnologia_projecao', 'Tecnologia', ['LED', 'LCD', 'DLP', 'Laser'], { group: 'Imagem' }),
          multi('entradas_video', 'Entradas', ['HDMI', 'USB', 'VGA', 'Wi-Fi'], { group: 'Conectividade' }),
        ],
      },
      'caixas-de-som': {
        define: [
          axCor(false),
          sel('tipo_som', 'Tipo', ['Portátil Bluetooth', 'Torre/amplificada', 'Soundbar', 'Subwoofer', 'Caixa para computador', 'Microfone com caixa (karaoke)'], { required: true, group: 'Geral' }),
          num('potencia_rms_w', 'Potência (RMS)', { unit: 'W', min: 1, max: 20000, decimals: 0, group: 'Desempenho', filter: true }),
          multi('ligacoes', 'Ligações', ['Bluetooth', 'USB', 'Cartão SD', 'Auxiliar (P2)', 'Rádio FM', 'Wi-Fi'], { group: 'Conectividade' }),
          sel('alimentacao', 'Alimentação', ['Bateria recarregável', 'Tomada', 'Bateria e tomada', 'Pilhas'], { group: 'Energia' }),
        ],
      },
      'fones-de-ouvido': {
        define: [
          axCor(false),
          sel('tipo_fone', 'Tipo', ['Intra-auricular (earbuds)', 'Intra-auricular com fio', 'Supra-auricular (headphone)', 'Headset gamer', 'Auricular de osso'], { required: true, group: 'Geral' }),
          sel('ligacao', 'Ligação', ['Com fio', 'Bluetooth', 'Com fio e Bluetooth'], { group: 'Conectividade' }),
          yesno('microfone', 'Microfone integrado', { group: 'Funções' }),
          yesno('cancelamento_ruido', 'Cancelamento de ruído', { group: 'Funções' }),
        ],
      },
      'home-theater': {
        define: [
          sel('canais_audio', 'Canais', ['2.0', '2.1', '5.1', '7.1'], { required: true, group: 'Áudio' }),
          num('potencia_rms_w', 'Potência total (RMS)', { unit: 'W', min: 10, max: 20000, decimals: 0, group: 'Áudio' }),
          multi('ligacoes', 'Ligações', ['HDMI', 'Bluetooth', 'USB', 'Óptica', 'Auxiliar (P2)'], { group: 'Conectividade' }),
        ],
      },
      'cameras-digitais': {
        define: [
          axCor(false),
          sel('tipo_camera', 'Tipo', ['Compacta', 'Reflex (DSLR)', 'Mirrorless', 'Ação (tipo GoPro)', 'Instantânea'], { required: true, group: 'Geral' }),
          num('megapixels', 'Resolução', { unit: 'MP', min: 1, max: 200, decimals: 1, group: 'Imagem' }),
          sel('video_max', 'Vídeo máximo', ['HD', 'Full HD', '4K', '8K'], { group: 'Imagem' }),
        ],
      },
      'cameras-de-seguranca': {
        define: [
          sel('tipo_camera_seg', 'Tipo', ['Câmara IP (Wi-Fi)', 'Câmara analógica (CFTV)', 'Câmara com painel solar', 'Kit de câmaras com gravador', 'Campainha com vídeo'], { required: true, group: 'Geral' }),
          sel('resolucao', 'Resolução', ['720p (HD)', '1080p (Full HD)', '2K', '4K'], { required: true, group: 'Imagem' }),
          yesno('visao_noturna', 'Visão noturna', { group: 'Funções' }),
          yesno('uso_exterior', 'Resistente para uso exterior', { group: 'Uso' }),
          sel('alimentacao', 'Alimentação', ['Tomada', 'Bateria', 'Painel solar', 'PoE (cabo de rede)'], { group: 'Energia' }),
        ],
      },
      drones: {
        define: [
          axCor(false),
          sel('resolucao', 'Qualidade da câmara', ['Sem câmara', 'HD', 'Full HD', '4K'], { group: 'Imagem' }),
          num('autonomia_min', 'Autonomia de voo', { unit: 'min', min: 3, max: 120, decimals: 0, group: 'Desempenho' }),
          num('alcance_m', 'Alcance de controlo', { unit: 'm', min: 10, max: 20000, decimals: 0, group: 'Desempenho' }),
        ],
        note: 'Drones podem exigir autorização de uso/voo. A política de venda (permitida/restrita) é decisão do dono: a matriz NÃO inclui campos jurídicos.',
      },
      'acessorios-de-audio-e-video': {
        define: [
          axCor(false),
          sel('tipo_acessorio', 'Tipo', ['Cabo HDMI', 'Cabo de áudio', 'Suporte de TV/parede', 'Antena', 'Receptor digital (TDT)', 'Microfone', 'Outro'], { required: true, group: 'Geral' }),
          text('compativel_com', 'Compatível com', { maxLength: 120, group: 'Compatibilidade' }),
        ],
      },
      'controles-remotos': {
        define: [
          sel('tipo_controle', 'Tipo', ['Universal', 'Original', 'Compatível'], { required: true, group: 'Geral' }),
          text('compativel_com', 'Compatível com', { required: true, maxLength: 150, group: 'Compatibilidade', placeholder: 'Ex.: TV Samsung, Ar-condicionado LG' }),
        ],
      },
    },
  }),

  // ============================================================================================ ELETRODOMÉSTICOS
  ...root('eletrodomesticos', {
    define: [
      axCor(false),
      axVoltagem(VOLTAGEM_REDE, false),
      num('potencia_w', 'Potência', { unit: 'W', min: 1, max: 20000, decimals: 0, group: 'Energia', filter: true }),
    ],
    subs: {
      'geladeiras-e-frigorificos': {
        define: [
          num('capacidade_litros', 'Capacidade total', { unit: 'L', required: true, min: 20, max: 1500, decimals: 0, group: 'Capacidade', filter: true }),
          sel('portas', 'Portas', ['1 porta', '2 portas', '3 portas', 'Lado a lado (side by side)'], { group: 'Geral' }),
          yesno('frost_free', 'Frost free (sem gelo acumulado)', { group: 'Funções' }),
          sel('classe_energetica', 'Classe energética', ['A', 'B', 'C', 'D', 'E', 'F', 'G'], { group: 'Energia' }),
        ],
      },
      'congeladores-e-arcas': {
        define: [
          num('capacidade_litros', 'Capacidade total', { unit: 'L', required: true, min: 50, max: 1500, decimals: 0, group: 'Capacidade', filter: true }),
          sel('tipo_congelador', 'Tipo', ['Arca horizontal', 'Vertical', 'Arca com tampa dupla'], { group: 'Geral' }),
          sel('classe_energetica', 'Classe energética', ['A', 'B', 'C', 'D', 'E', 'F', 'G'], { group: 'Energia' }),
        ],
      },
      'fogoes-e-fornos': {
        define: [
          sel('tipo_fogao', 'Tipo', ['Fogão a gás', 'Fogão elétrico', 'Fogão misto', 'Fogão de mesa', 'Forno elétrico', 'Forno a gás'], { required: true, group: 'Geral' }),
          sel('bocas', 'Número de bocas', ['1', '2', '3', '4', '5', '6'], { group: 'Geral' }),
          yesno('tem_forno', 'Com forno', { group: 'Funções' }),
          yesno('acendimento_automatico', 'Acendimento automático', { group: 'Funções' }),
        ],
      },
      'micro-ondas': {
        define: [
          num('capacidade_litros', 'Capacidade', { unit: 'L', required: true, min: 5, max: 100, decimals: 0, group: 'Capacidade', filter: true }),
          yesno('com_grill', 'Com grill', { group: 'Funções' }),
          sel('painel', 'Painel', ['Mecânico', 'Digital'], { group: 'Geral' }),
        ],
      },
      'maquinas-de-lavar': {
        define: [
          num('capacidade_kg', 'Capacidade de roupa', { unit: 'kg', required: true, min: 1, max: 30, decimals: 0, group: 'Capacidade', filter: true }),
          sel('tipo_lavagem', 'Tipo', ['Carga frontal', 'Carga superior', 'Semiautomática (tanque duplo)', 'Lava e seca'], { group: 'Geral' }),
          yesno('seca_roupa', 'Seca a roupa', { group: 'Funções' }),
        ],
      },
      ventiladores: {
        define: [
          sel('tipo_ventilador', 'Tipo', ['Pedestal', 'Mesa', 'Parede', 'Teto', 'Torre', 'Recarregável', 'Mini USB'], { required: true, group: 'Geral' }),
          num('diametro_cm', 'Diâmetro da hélice', { unit: 'cm', min: 10, max: 120, decimals: 0, group: 'Medidas' }),
          num('velocidades', 'Número de velocidades', { min: 1, max: 12, decimals: 0, group: 'Funções' }),
          yesno('controle_remoto', 'Com controlo remoto', { group: 'Funções' }),
        ],
      },
      'ar-condicionado': {
        define: [
          sel('capacidade_btu', 'Capacidade', ['9000 BTU', '12000 BTU', '18000 BTU', '24000 BTU', '30000 BTU', '36000 BTU'], { required: true, group: 'Capacidade' }),
          sel('tipo_ar', 'Tipo', ['Split (parede)', 'Janela', 'Portátil', 'Cassete/Teto', 'Coluna'], { required: true, group: 'Geral' }),
          yesno('inverter', 'Inverter (poupança de energia)', { group: 'Energia' }),
          sel('ciclo', 'Ciclo', ['Só frio', 'Quente e frio'], { group: 'Geral' }),
        ],
      },
      liquidificadores: {
        define: [
          num('capacidade_litros', 'Capacidade do copo', { unit: 'L', min: 0.2, max: 6, decimals: 1, group: 'Capacidade' }),
          num('velocidades', 'Número de velocidades', { min: 1, max: 12, decimals: 0, group: 'Funções' }),
          sel('material_copo', 'Material do copo', ['Vidro', 'Plástico', 'Aço inoxidável'], { group: 'Materiais' }),
        ],
      },
      'ferros-de-passar': {
        define: [
          sel('tipo_ferro', 'Tipo', ['A seco', 'A vapor', 'Gerador de vapor', 'A carvão'], { group: 'Geral' }),
          sel('base_ferro', 'Base', ['Antiaderente', 'Cerâmica', 'Aço inoxidável', 'Alumínio'], { group: 'Materiais' }),
        ],
      },
      'pequenos-eletrodomesticos': {
        define: [
          sel('tipo_pequeno', 'Tipo', ['Torradeira', 'Cafeteira', 'Batedeira', 'Sanduicheira', 'Fritadeira (air fryer)', 'Chaleira elétrica', 'Panela elétrica', 'Arrozeira', 'Espremedor', 'Outro'], { required: true, group: 'Geral' }),
          num('capacidade_litros', 'Capacidade', { unit: 'L', min: 0.1, max: 30, decimals: 1, group: 'Capacidade' }),
        ],
      },
      'pecas-e-acessorios': {
        define: [
          sel('tipo_peca', 'Tipo', ['Resistência', 'Motor', 'Termóstato', 'Borracha/vedante', 'Prateleira/gaveta', 'Placa eletrónica', 'Controlo remoto', 'Outra peça'], { required: true, group: 'Geral' }),
          text('compativel_com', 'Compatível com', { required: true, maxLength: 150, group: 'Compatibilidade', placeholder: 'Ex.: geladeira Panasonic NR-B' }),
        ],
        disable: ['voltagem', 'potencia_w'],
      },
    },
  }),

  // ============================================================================================ GAMES E CONSOLES
  ...root('games-e-consoles', {
    subs: {
      'consoles-de-jogos': {
        define: [
          axCor(false),
          axCapacidade('Armazenamento', ['64 GB', '128 GB', '256 GB', '500 GB', '825 GB', '1 TB', '2 TB'], false),
          sel('plataforma', 'Plataforma', ['PlayStation', 'Xbox', 'Nintendo', 'Retro/Outro'], { required: true, group: 'Geral' }),
          sel('geracao_console', 'Geração/versão', ['PS3', 'PS4', 'PS5', 'Xbox 360', 'Xbox One', 'Xbox Series', 'Switch', 'Outra'], { group: 'Geral' }),
        ],
      },
      'jogos-fisicos': {
        define: [
          sel('plataforma', 'Plataforma', ['PlayStation', 'Xbox', 'Nintendo', 'PC', 'Retro/Outro'], { required: true, group: 'Geral' }),
          text('titulo_jogo', 'Título do jogo', { required: true, maxLength: 120, group: 'Geral' }),
          sel('classificacao_idade', 'Classificação etária', ['Livre', '+7', '+12', '+16', '+18'], { group: 'Geral' }),
        ],
      },
      controles: {
        define: [
          axCor(false),
          sel('plataforma', 'Compatível com', ['PlayStation', 'Xbox', 'Nintendo', 'PC', 'Telemóvel', 'Vários'], { required: true, group: 'Compatibilidade' }),
          sel('ligacao', 'Ligação', ['Com fio', 'Sem fio', 'Com fio e sem fio'], { group: 'Conectividade' }),
        ],
      },
      'acessorios-para-consoles': {
        define: [
          axCor(false),
          sel('plataforma', 'Compatível com', ['PlayStation', 'Xbox', 'Nintendo', 'PC', 'Vários'], { required: true, group: 'Compatibilidade' }),
          sel('tipo_acessorio', 'Tipo', ['Carregador/base', 'Cabo', 'Capa/estojo', 'Headset', 'Cartão de memória', 'Outro'], { group: 'Geral' }),
        ],
      },
      'equipamentos-gamer': {
        define: [
          axCor(false),
          sel('tipo_gamer', 'Tipo', ['Cadeira gamer', 'Headset gamer', 'Teclado gamer', 'Mouse gamer', 'Mesa gamer', 'Placa de captura', 'Outro'], { required: true, group: 'Geral' }),
          yesno('iluminacao_rgb', 'Iluminação RGB', { group: 'Funções' }),
        ],
      },
      'pecas-para-consoles': {
        define: [
          sel('plataforma', 'Compatível com', ['PlayStation', 'Xbox', 'Nintendo', 'Vários'], { required: true, group: 'Compatibilidade' }),
          sel('tipo_peca', 'Tipo de peça', ['Leitor/lente', 'Fonte', 'Ventoinha', 'Botões/direcionais', 'Carcaça', 'Outra peça'], { group: 'Geral' }),
        ],
      },
    },
  }),
];
// COR é reexportada para facilitar a inspeção em testes
export { COR };
