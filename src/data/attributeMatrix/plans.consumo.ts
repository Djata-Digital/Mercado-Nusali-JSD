/** FASE 8A — matriz: supermercado, alimentos e bebidas, bebés e crianças, brinquedos, desporto, livros, saúde, pets, festas, tradicionais, instrumentos. */
import type { CategoryPlan } from './types.js';
import { COR, TAM_BEBE_CRIANCA, axCapacidade, axCor, axTamanho, axisSel, multi, num, plan, root, sel, text, yesno } from './library.js';

/** Conteúdo líquido por embalagem — eixo "por anúncio" (2ª dimensão). Unidade do PRODUTO, nunca da caixa de envio. */
const EMB_PESO = ['100 g', '250 g', '500 g', '1 kg', '2 kg', '5 kg', '10 kg', '25 kg', '50 kg'];
const EMB_VOLUME = ['200 ml', '330 ml', '500 ml', '750 ml', '1 L', '1.5 L', '2 L', '5 L', '10 L', '20 L'];
const COR_BRINQUEDO = [...COR];

export const consumoPlans: CategoryPlan[] = [
  // ============================================================================================ SUPERMERCADO E MERCEARIA
  ...root('supermercado-e-mercearia', {
    define: [
      sel('origem_produto', 'Origem', ['Guiné-Bissau', 'Senegal', 'Gâmbia', 'Guiné-Conacri', 'Portugal', 'Brasil', 'Outro país'], { group: 'Geral' }),
      text('validade_info', 'Validade', { maxLength: 60, group: 'Segurança', placeholder: 'Ex.: 12 meses / 31-12-2027', help: 'Indique o prazo ou a data de validade impressa na embalagem.' }),
    ],
    subs: {
      'arroz-e-cereais': { define: [axTamanho('Embalagem', EMB_PESO, true, 'Quantidade que vem em cada embalagem.'), sel('tipo_cereal', 'Tipo', ['Arroz agulha', 'Arroz parboilizado', 'Arroz partido', 'Milho', 'Mil/Sorgo', 'Aveia', 'Fonio', 'Outro'], { required: true, group: 'Geral' })] },
      'farinha-e-massas': { define: [axTamanho('Embalagem', EMB_PESO, true), sel('tipo_farinha', 'Tipo', ['Farinha de trigo', 'Farinha de milho', 'Farinha de mandioca', 'Massa (esparguete)', 'Massa (outra)', 'Cuscuz', 'Outro'], { required: true, group: 'Geral' })] },
      'oleos-alimentares': { define: [axCapacidade('Volume', ['500 ml', '900 ml', '1 L', '2 L', '5 L', '20 L'], true), sel('tipo_oleo_alimentar', 'Tipo', ['Óleo vegetal', 'Óleo de palma', 'Óleo de amendoim', 'Azeite', 'Óleo de girassol', 'Manteiga/Margarina'], { required: true, group: 'Geral' })] },
      'acucar-e-sal': { define: [axTamanho('Embalagem', ['250 g', '500 g', '1 kg', '2 kg', '5 kg', '25 kg', '50 kg'], true), sel('tipo_acucar_sal', 'Tipo', ['Açúcar branco', 'Açúcar amarelo/mascavado', 'Sal fino', 'Sal grosso', 'Sal iodado', 'Adoçante'], { required: true, group: 'Geral' })] },
      'conservas-e-enlatados': { define: [axTamanho('Conteúdo da lata', ['70 g', '125 g', '170 g', '200 g', '400 g', '800 g'], false), sel('tipo_conserva', 'Tipo', ['Atum/Sardinha', 'Tomate/Concentrado', 'Feijão/Legumes', 'Salsichas/Carne', 'Frutas em calda', 'Leite condensado/creme', 'Outro'], { required: true, group: 'Geral' })] },
      'leite-e-derivados': { define: [axTamanho('Embalagem', ['200 g', '400 g', '900 g', '1 kg', '25 kg (saco)', '200 ml', '500 ml', '1 L'], true), sel('tipo_leite', 'Tipo', ['Leite em pó', 'Leite líquido (UHT)', 'Leite condensado', 'Iogurte', 'Queijo', 'Manteiga', 'Natas'], { required: true, group: 'Geral' }), sel('teor_gordura', 'Teor de gordura', ['Gordo (integral)', 'Meio-gordo', 'Magro/Desnatado'], { group: 'Geral' })] },
      'cafe-cha-e-cacau': { define: [axTamanho('Embalagem', ['50 g', '100 g', '250 g', '500 g', '1 kg', '20 saquetas', '100 saquetas'], true), sel('tipo_bebida_quente', 'Tipo', ['Café moído', 'Café solúvel', 'Chá', 'Cacau/Chocolate em pó', 'Infusões/Ervas'], { required: true, group: 'Geral' })] },
      'bolachas-e-doces': { define: [axTamanho('Embalagem', ['50 g', '100 g', '200 g', '400 g', '1 kg', 'Pacote família'], false), sel('tipo_doce', 'Tipo', ['Bolachas', 'Chocolate', 'Rebuçados/Bombons', 'Bolos', 'Cereais de pequeno-almoço', 'Mel/Doces', 'Salgados/Snacks'], { required: true, group: 'Geral' })] },
      'temperos-e-condimentos': { define: [axTamanho('Embalagem', ['10 g', '50 g', '100 g', '250 g', '500 g', '1 kg'], false), sel('tipo_tempero', 'Tipo', ['Cubos/Caldo', 'Pimenta/Malagueta', 'Especiarias', 'Molhos', 'Vinagre/Mostarda', 'Sal de tempero', 'Outro'], { required: true, group: 'Geral' })] },
      'produtos-de-limpeza': { define: [axCapacidade('Volume / peso', ['250 ml', '500 ml', '1 L', '2 L', '5 L', '500 g', '1 kg', '5 kg'], false), sel('tipo_limpeza', 'Tipo', ['Detergente de loiça', 'Detergente da roupa (sabão)', 'Lixívia/Javel', 'Desinfetante', 'Limpa-vidros', 'Amaciador', 'Insecticida', 'Outro'], { required: true, group: 'Geral' })], disable: ['origem_produto'] },
      'produtos-de-higiene-domestica': { define: [axCapacidade('Quantidade', ['1 rolo', '4 rolos', '12 rolos', '50 unidades', '100 unidades', '500 ml', '1 L'], false), sel('tipo_higiene', 'Tipo', ['Papel higiénico', 'Rolo de cozinha', 'Guardanapos', 'Sacos do lixo', 'Fósforos/Isqueiros', 'Velas', 'Outro'], { required: true, group: 'Geral' })], disable: ['origem_produto'] },
    },
  }),

  // ============================================================================================ ALIMENTOS FRESCOS E BEBIDAS
  ...root('alimentos-frescos-e-bebidas', {
    define: [
      sel('unidade_venda', 'Vendido por', ['Quilograma (kg)', 'Unidade', 'Caixa/Saco', 'Dúzia', 'Litro'], { group: 'Geral', help: 'Como o preço é calculado.' }),
      sel('origem_produto', 'Origem', ['Guiné-Bissau', 'Senegal', 'Gâmbia', 'Guiné-Conacri', 'Outro país'], { group: 'Geral' }),
    ],
    subs: {
      frutas: { define: [text('tipo_fruta', 'Fruta', { required: true, maxLength: 60, group: 'Geral', placeholder: 'Ex.: Manga, Banana, Caju' }), sel('maturacao', 'Maturação', ['Verde', 'Madura', 'Pronta a comer'], { group: 'Geral' }), yesno('organico', 'Sem agrotóxicos (orgânico)', { group: 'Geral' })] },
      'legumes-e-verduras': { define: [text('tipo_legume', 'Produto', { required: true, maxLength: 60, group: 'Geral', placeholder: 'Ex.: Tomate, Alface, Quiabo' }), yesno('organico', 'Sem agrotóxicos (orgânico)', { group: 'Geral' })] },
      tuberculos: { define: [sel('tipo_tuberculo', 'Produto', ['Mandioca', 'Batata-doce', 'Batata', 'Inhame', 'Cebola', 'Alho', 'Outro'], { required: true, group: 'Geral' })] },
      carnes: { define: [sel('tipo_carne', 'Carne', ['Frango', 'Vaca/Boi', 'Porco', 'Cabra/Carneiro', 'Caça', 'Enchidos/Fumados', 'Outra'], { required: true, group: 'Geral' }), sel('estado_conservacao', 'Conservação', ['Fresca', 'Congelada', 'Fumada/Seca'], { required: true, closed: true, group: 'Segurança' })] },
      'peixes-e-mariscos': { define: [text('tipo_peixe', 'Peixe/Marisco', { required: true, maxLength: 60, group: 'Geral', placeholder: 'Ex.: Bagre, Camarão, Ostras' }), sel('estado_conservacao', 'Conservação', ['Fresco', 'Congelado', 'Seco/Fumado', 'Salgado'], { required: true, closed: true, group: 'Segurança' })] },
      ovos: { define: [sel('tamanho_ovo', 'Tamanho', ['Pequeno', 'Médio', 'Grande', 'Extra grande'], { group: 'Geral' }), sel('quantidade_ovos', 'Quantidade', ['6', '12', '30 (cartela)', '360 (caixa)'], { group: 'Geral' })] },
      'produtos-congelados': { define: [sel('tipo_congelado', 'Tipo', ['Carne/Frango', 'Peixe/Marisco', 'Legumes', 'Batatas fritas', 'Pratos prontos', 'Gelados'], { required: true, group: 'Geral' })] },
      'agua-mineral': { define: [axCapacidade('Volume', ['330 ml', '500 ml', '1 L', '1.5 L', '5 L', '19 L (garrafão)'], true), sel('tipo_agua', 'Tipo', ['Sem gás', 'Com gás', 'Aromatizada'], { group: 'Geral' }), sel('pack', 'Embalagem de venda', ['Unidade', 'Pack de 6', 'Pack de 12', 'Pack de 24'], { group: 'Geral' })], disable: ['unidade_venda', 'origem_produto'] },
      'sumos-e-refrigerantes': { define: [axCapacidade('Volume', EMB_VOLUME.filter((o) => !['5 L', '10 L', '20 L'].includes(o)), true), sel('tipo_sumo', 'Tipo', ['Sumo de fruta', 'Néctar', 'Refrigerante', 'Bebida energética', 'Xarope/Concentrado'], { required: true, group: 'Geral' }), sel('pack', 'Embalagem de venda', ['Unidade', 'Pack de 6', 'Pack de 12', 'Pack de 24'], { group: 'Geral' })], disable: ['unidade_venda', 'origem_produto'] },
      'bebidas-nao-alcoolicas': { define: [axCapacidade('Volume', ['200 ml', '330 ml', '500 ml', '1 L', '1.5 L', '2 L'], true), sel('tipo_bebida', 'Tipo', ['Chá gelado', 'Bebida de soja/aveia', 'Malta/Cerveja sem álcool', 'Água de coco', 'Bebida láctea', 'Outra'], { required: true, group: 'Geral' })], disable: ['unidade_venda', 'origem_produto'], note: 'Bebidas alcoólicas NÃO fazem parte desta árvore: a matriz não cria atributos para elas.' },
      'produtos-alimentares-locais': { define: [text('produto_local', 'Produto', { required: true, maxLength: 80, group: 'Geral', placeholder: 'Ex.: Caju, Óleo de palma, Mel, Pimenta' }), axTamanho('Embalagem', ['100 g', '250 g', '500 g', '1 kg', '5 kg', '1 L', '5 L', 'Unidade'], false), yesno('artesanal', 'Produção artesanal/local', { group: 'Geral' })] },
    },
  }),

  // ============================================================================================ BEBÉS E CRIANÇAS
  ...root('bebes-e-criancas', {
    define: [sel('faixa_idade', 'Idade recomendada', ['0-6 meses', '6-12 meses', '1-3 anos', '3-6 anos', '6-12 anos', 'Todas as idades'], { group: 'Geral' })],
    subs: {
      'roupas-para-bebes': { define: [axCor(true), axTamanho('Tamanho', TAM_BEBE_CRIANCA, true), sel('material', 'Material', ['Algodão', 'Malha', 'Poliéster', 'Misto'], { group: 'Materiais' }), sel('tipo_roupa_bebe', 'Tipo', ['Body', 'Macacão', 'Conjunto', 'Vestido', 'Pijama', 'Casaco', 'Meias/Luvas/Gorros'], { group: 'Geral' })], disable: ['faixa_idade'] },
      fraldas: { define: [axTamanho('Tamanho da fralda', ['RN (recém-nascido)', 'P', 'M', 'G', 'XG', 'XXG'], true), sel('tipo_fralda', 'Tipo', ['Descartável', 'De pano (reutilizável)', 'Calças de treino'], { required: true, group: 'Geral' }), num('unidades_pacote', 'Unidades por pacote', { min: 1, max: 500, decimals: 0, group: 'Geral' })], disable: ['faixa_idade'] },
      'produtos-de-higiene-infantil': { define: [axCapacidade('Volume / quantidade', ['100 ml', '200 ml', '400 ml', '500 ml', '60 lenços', '120 lenços'], false), sel('tipo_higiene_infantil', 'Tipo', ['Champô/Sabonete', 'Creme/Pomada', 'Óleo/Loção', 'Toalhitas', 'Talco', 'Termómetro/Aspirador nasal', 'Outro'], { required: true, group: 'Geral' })] },
      mamadeiras: { define: [axCapacidade('Capacidade', ['120 ml', '150 ml', '240 ml', '260 ml', '330 ml'], true), sel('material', 'Material', ['Plástico (sem BPA)', 'Vidro', 'Silicone', 'Aço inoxidável'], { group: 'Materiais' }), sel('tipo_bico', 'Bico', ['Látex', 'Silicone', 'Ortodôntico'], { group: 'Geral' })] },
      'carrinhos-de-bebe': { define: [axCor(false), sel('tipo_carrinho', 'Tipo', ['Carrinho de passeio', 'Carrinho 3 em 1', 'Cadeirinha de transporte', 'Bebé conforto', 'Marsupial/Canguru'], { required: true, group: 'Geral' }), sel('faixa_peso', 'Suporta crianças até', ['Até 9 kg', 'Até 15 kg', 'Até 22 kg', 'Até 36 kg'], { group: 'Segurança' }), yesno('dobravel', 'Dobrável', { group: 'Funções' })] },
      bercos: { define: [axCor(false), sel('tipo_berco', 'Tipo', ['Berço', 'Cesto/Moisés', 'Berço de viagem', 'Cama de grade', 'Mosquiteiro'], { required: true, group: 'Geral' }), yesno('colchao_incluido', 'Colchão incluído', { group: 'Geral' })] },
      'cadeiras-infantis': { define: [axCor(false), sel('tipo_cadeira', 'Tipo', ['Cadeira de refeição', 'Cadeira para automóvel', 'Elevador de assento', 'Cadeira de descanso', 'Andarilho'], { required: true, group: 'Geral' }), sel('faixa_peso', 'Indicada para crianças de', ['0-13 kg', '9-18 kg', '15-36 kg', 'Até 25 kg'], { group: 'Segurança' })] },
      'alimentacao-infantil': { define: [axTamanho('Embalagem', ['200 g', '400 g', '800 g', '1 kg'], false), sel('tipo_alimento_infantil', 'Tipo', ['Leite em pó infantil', 'Papa/Cereal infantil', 'Papinha pronta', 'Bolachas infantis', 'Sumos infantis'], { required: true, group: 'Geral' }), sel('fase_leite', 'Fase', ['Fase 1 (0-6 meses)', 'Fase 2 (6-12 meses)', 'Fase 3 (+12 meses)'], { group: 'Geral' })], disable: ['faixa_idade'] },
      'acessorios-para-maternidade': { define: [sel('tipo_maternidade', 'Tipo', ['Bolsa maternidade', 'Bomba tira-leite', 'Almofada de amamentação', 'Cinta pós-parto', 'Sutiã de amamentação', 'Outro'], { required: true, group: 'Geral' })], disable: ['faixa_idade'] },
      'seguranca-infantil': { define: [sel('tipo_seguranca_infantil', 'Tipo', ['Protetor de tomadas', 'Barreira/Portão de segurança', 'Monitor de bebé', 'Protetor de cantos', 'Cinto de segurança'], { required: true, group: 'Geral' })] },
    },
  }),

  // ============================================================================================ BRINQUEDOS E JOGOS
  ...root('brinquedos-e-jogos', {
    define: [
      sel('faixa_idade', 'Idade recomendada', ['0-12 meses', '1-3 anos', '3-5 anos', '5-8 anos', '8-12 anos', '+12 anos', 'Todas as idades'], { required: true, closed: true, group: 'Segurança', help: 'Importante para a segurança da criança.' }),
      sel('alimentacao', 'Funciona com', ['Não precisa de pilhas', 'Pilhas', 'Bateria recarregável', 'Tomada'], { group: 'Geral' }),
    ],
    subs: {
      bonecas: { define: [axCor(false, COR_BRINQUEDO), axTamanho('Tamanho', ['Pequena (até 20 cm)', 'Média (20-40 cm)', 'Grande (mais de 40 cm)'], false)], disable: ['alimentacao'] },
      'carrinhos-de-brinquedo': { define: [sel('tipo_brinquedo_veiculo', 'Tipo', ['Carrinho de fricção', 'Controlo remoto', 'Pista/Coleção', 'Veículo de montar', 'Triciclo/Andador'], { group: 'Geral' }), axCor(false, COR_BRINQUEDO)] },
      'brinquedos-educativos': { define: [multi('habilidades', 'Desenvolve', ['Coordenação motora', 'Raciocínio', 'Matemática', 'Leitura/Letras', 'Criatividade', 'Música'], { group: 'Geral' })], disable: ['alimentacao'] },
      'jogos-de-tabuleiro': { define: [num('jogadores_min', 'Mínimo de jogadores', { min: 1, max: 20, decimals: 0, group: 'Geral' }), num('jogadores_max', 'Máximo de jogadores', { min: 1, max: 20, decimals: 0, group: 'Geral' })], disable: ['alimentacao'] },
      'quebra-cabecas': { define: [num('numero_pecas', 'Número de peças', { required: true, min: 4, max: 10000, decimals: 0, group: 'Geral', filter: true })], disable: ['alimentacao'] },
      'brinquedos-eletronicos': { define: [sel('tipo_brinquedo_eletronico', 'Tipo', ['Tablet infantil', 'Robô', 'Drone de brincar', 'Instrumento musical', 'Consola portátil', 'Outro'], { group: 'Geral' }), axCor(false, COR_BRINQUEDO)] },
      'bicicletas-infantis': { define: [axCor(false, COR_BRINQUEDO), axTamanho('Aro', ['12"', '14"', '16"', '18"', '20"', '24"'], true, 'Tamanho da roda.'), yesno('rodinhas', 'Com rodinhas de apoio', { group: 'Funções' })], disable: ['alimentacao'] },
      pelucias: { define: [axCor(false, COR_BRINQUEDO), axTamanho('Tamanho', ['Pequeno (até 25 cm)', 'Médio (25-50 cm)', 'Grande (50-100 cm)', 'Gigante (mais de 100 cm)'], false)], disable: ['alimentacao'] },
      'brinquedos-de-exterior': { define: [sel('tipo_exterior', 'Tipo', ['Escorrega/Baloiço', 'Bola/Raquetes', 'Piscina/Brinquedos de água', 'Patins/Skate', 'Tenda/Casinha', 'Outro'], { group: 'Geral' })], disable: ['alimentacao'] },
      'jogos-tradicionais': { define: [sel('tipo_jogo_tradicional', 'Jogo', ['Oril/Mancala (Ouri)', 'Damas/Xadrez', 'Dominó', 'Cartas', 'Ludo', 'Outro'], { required: true, group: 'Geral' }), sel('material', 'Material', ['Madeira', 'Plástico', 'Papel/Cartão', 'Tecido'], { group: 'Materiais' })], disable: ['alimentacao'] },
    },
  }),

  // ============================================================================================ ESPORTES E FITNESS
  ...root('esportes-e-fitness', {
    subs: {
      futebol: { define: [axTamanho('Tamanho', ['Único', 'P', 'M', 'G', 'GG', '36', '38', '40', '42', '44'], false), axCor(false), sel('tipo_futebol', 'Tipo', ['Camisola de equipa', 'Chuteiras', 'Bola', 'Caneleiras', 'Luvas de guarda-redes', 'Fato de treino', 'Outro'], { required: true, group: 'Geral' })] },
      basquetebol: { define: [axTamanho('Tamanho', ['Único', 'P', 'M', 'G', 'GG'], false), sel('tipo_basquete', 'Tipo', ['Bola', 'Camisola', 'Tabela/Cesto', 'Sapatilhas', 'Acessórios'], { required: true, group: 'Geral' })] },
      corrida: { define: [axTamanho('Tamanho', ['Único', 'P', 'M', 'G', 'GG', '38', '40', '42', '44'], false), axCor(false), sel('tipo_corrida', 'Tipo', ['Sapatilhas de corrida', 'Roupa técnica', 'Relógio/Pulseira', 'Cinto de hidratação', 'Outro'], { required: true, group: 'Geral' })] },
      ciclismo: { define: [axTamanho('Tamanho do quadro/aro', ['Aro 20', 'Aro 24', 'Aro 26', 'Aro 27.5', 'Aro 29', 'P', 'M', 'G'], false), axCor(false), sel('tipo_ciclismo', 'Tipo', ['Bicicleta', 'Capacete', 'Pneu/Câmara', 'Luzes', 'Peças/Acessórios', 'Roupa'], { required: true, group: 'Geral' }), num('numero_velocidades', 'Número de velocidades', { min: 1, max: 30, decimals: 0, group: 'Desempenho' })] },
      'equipamentos-de-ginastica': { define: [sel('tipo_ginastica', 'Tipo', ['Halteres/Pesos', 'Esteira', 'Bicicleta ergométrica', 'Banco de musculação', 'Tapete de yoga/Colchonete', 'Elásticos', 'Corda de saltar', 'Barra'], { required: true, group: 'Geral' }), num('carga_kg', 'Carga/Peso', { unit: 'kg', min: 0.5, max: 500, decimals: 1, group: 'Desempenho' }), num('carga_max_usuario_kg', 'Suporta até', { unit: 'kg', min: 30, max: 400, decimals: 0, group: 'Segurança' })] },
      'roupas-esportivas': { define: [axCor(true), axTamanho('Tamanho', ['PP', 'P', 'M', 'G', 'GG', 'XG'], true), sel('publico', 'Público', ['Masculino', 'Feminino', 'Unissex', 'Infantil'], { group: 'Geral' }), sel('tipo_roupa_esportiva', 'Tipo', ['Camiseta', 'Short', 'Leggings', 'Fato de treino', 'Camisola de equipa', 'Casaco', 'Top'], { group: 'Geral' })] },
      'bolas-e-acessorios': { define: [sel('tipo_bola', 'Esporte', ['Futebol', 'Basquetebol', 'Voleibol', 'Andebol', 'Râguebi', 'Ténis', 'Outro'], { required: true, group: 'Geral' }), sel('tamanho_bola', 'Tamanho', ['Nº 3', 'Nº 4', 'Nº 5', 'Nº 6', 'Nº 7'], { group: 'Medidas' }), axCor(false)] },
      'artes-marciais': { define: [axTamanho('Tamanho', ['Infantil', 'PP', 'P', 'M', 'G', 'GG'], false), sel('modalidade', 'Modalidade', ['Karaté', 'Judo', 'Taekwondo', 'Boxe', 'Capoeira', 'MMA/Kickboxing', 'Outra'], { required: true, group: 'Geral' }), sel('tipo_equipamento_marcial', 'Tipo', ['Quimono/Fato', 'Luvas', 'Protetores', 'Saco de pancada', 'Cinto', 'Outro'], { group: 'Geral' })] },
      camping: { define: [sel('tipo_camping', 'Tipo', ['Tenda', 'Saco-cama', 'Colchão/Esteira', 'Fogão de campista', 'Mochila de trekking', 'Lanterna', 'Cadeira/Mesa dobrável', 'Outro'], { required: true, group: 'Geral' }), num('capacidade_pessoas', 'Capacidade', { unit: 'pessoas', min: 1, max: 20, decimals: 0, group: 'Capacidade' }), axCor(false)] },
      'pesca-esportiva': { define: [sel('tipo_pesca_esportiva', 'Tipo', ['Cana de pesca', 'Carreto/Molinete', 'Linha/Fio', 'Iscas artificiais', 'Anzóis', 'Caixa/Mochila', 'Kit completo'], { required: true, group: 'Geral' }), num('comprimento_cana_m', 'Comprimento da cana', { unit: 'm', min: 0.5, max: 8, decimals: 1, group: 'Medidas' })] },
    },
  }),

  // ============================================================================================ LIVROS, PAPELARIA E EDUCAÇÃO
  ...root('livros-papelaria-e-educacao', {
    subs: {
      'livros-escolares': { define: [sel('nivel_ensino', 'Nível', ['Pré-escolar', '1º ao 4º ano', '5º ao 6º ano', '7º ao 9º ano', '10º ao 12º ano', 'Todos os níveis'], { required: true, closed: true, group: 'Geral' }), text('disciplina', 'Disciplina', { maxLength: 60, group: 'Geral', placeholder: 'Ex.: Matemática' }), text('autor', 'Autor/Editora', { maxLength: 120, group: 'Geral' }), sel('idioma_livro', 'Idioma', ['Português', 'Francês', 'Inglês', 'Crioulo', 'Outro'], { group: 'Geral' })] },
      'livros-universitarios': { define: [text('area_conhecimento', 'Área', { maxLength: 80, group: 'Geral', placeholder: 'Ex.: Direito, Medicina, Engenharia' }), text('autor', 'Autor/Editora', { maxLength: 120, group: 'Geral' }), sel('idioma_livro', 'Idioma', ['Português', 'Francês', 'Inglês', 'Outro'], { group: 'Geral' })] },
      literatura: { define: [sel('genero_literario', 'Género', ['Romance', 'Poesia', 'Conto/Crónica', 'Biografia', 'Infantil/Juvenil', 'História', 'Autoajuda', 'Outro'], { required: true, group: 'Geral' }), text('autor', 'Autor/Editora', { maxLength: 120, group: 'Geral' }), sel('idioma_livro', 'Idioma', ['Português', 'Francês', 'Inglês', 'Crioulo', 'Outro'], { group: 'Geral' }), sel('formato_livro', 'Formato', ['Brochura', 'Capa dura', 'Bolso'], { group: 'Geral' })] },
      'livros-religiosos': { define: [sel('religiao', 'Tradição', ['Cristã (Bíblia)', 'Católica', 'Islâmica (Alcorão)', 'Outra'], { required: true, group: 'Geral' }), sel('idioma_livro', 'Idioma', ['Português', 'Árabe', 'Francês', 'Inglês', 'Crioulo', 'Outro'], { group: 'Geral' }), sel('formato_livro', 'Formato', ['Brochura', 'Capa dura', 'Bolso'], { group: 'Geral' })] },
      cadernos: { define: [axCor(false), sel('tipo_caderno', 'Tipo', ['Caderno brochura', 'Caderno espiral', 'Bloco de notas', 'Agenda', 'Caderno de desenho'], { required: true, group: 'Geral' }), sel('numero_folhas', 'Folhas', ['40', '48', '60', '80', '96', '100', '200'], { group: 'Geral' }), sel('pautado', 'Pauta', ['Pautado', 'Quadriculado', 'Liso', 'Misto'], { group: 'Geral' })] },
      'canetas-e-lapis': { define: [axCor(false, ['Preto', 'Azul', 'Vermelho', 'Verde', 'Multicolorido']), sel('tipo_escrita', 'Tipo', ['Caneta esferográfica', 'Lápis', 'Marcador/Marca-texto', 'Caneta de feltro', 'Caneta de tinta permanente', 'Lapiseira', 'Estojo/Kit'], { required: true, group: 'Geral' }), num('unidades_pacote', 'Unidades por pacote', { min: 1, max: 500, decimals: 0, group: 'Geral' })] },
      'mochilas-escolares': { define: [axCor(true), sel('tipo_mochila_escolar', 'Tipo', ['Mochila', 'Mochila com rodas', 'Estojo', 'Lancheira', 'Conjunto escolar'], { required: true, group: 'Geral' }), num('capacidade_litros', 'Capacidade', { unit: 'L', min: 1, max: 60, decimals: 0, group: 'Capacidade' })] },
      'materiais-didaticos': { define: [sel('tipo_didatico', 'Tipo', ['Mapa/Cartaz', 'Quadro/Pizarra', 'Material de matemática', 'Alfabeto/Letras', 'Kit de ciências', 'Globo terrestre', 'Outro'], { required: true, group: 'Geral' }), sel('nivel_ensino', 'Nível', ['Pré-escolar', 'Ensino básico', 'Ensino secundário', 'Todos'], { group: 'Geral' })] },
      'artigos-de-escritorio': { define: [sel('tipo_artigo_escritorio', 'Tipo', ['Papel A4/Resma', 'Pastas/Arquivadores', 'Agrafadores/Furadores', 'Cola/Fita', 'Etiquetas', 'Envelopes', 'Calculadora', 'Outro'], { required: true, group: 'Geral' }), sel('formato_papel', 'Formato', ['A4', 'A3', 'A5', 'Carta/Ofício'], { group: 'Medidas' })] },
      'materiais-de-desenho': { define: [axCor(false), sel('tipo_desenho', 'Tipo', ['Lápis de cor', 'Tintas (guache/aguarela)', 'Pincéis', 'Papel de desenho', 'Tela/Cavalete', 'Régua/Esquadros', 'Kit completo'], { required: true, group: 'Geral' })] },
    },
  }),

  // ============================================================================================ SAÚDE E BEM-ESTAR
  ...root('saude-e-bem-estar', {
    subs: {
      'primeiros-socorros': { define: [sel('tipo_primeiros_socorros', 'Tipo', ['Kit de primeiros socorros', 'Ligaduras/Gazes', 'Pensos rápidos', 'Antissépticos', 'Soro fisiológico', 'Tesouras/Pinças', 'Outro'], { required: true, group: 'Geral' }), text('validade_info', 'Validade', { maxLength: 60, group: 'Segurança' })], note: 'NÃO inclui medicamentos (categoria de receita/venda restrita fora do escopo da árvore).' },
      termometros: { define: [sel('tipo_termometro', 'Tipo', ['Digital', 'Infravermelho (testa)', 'Infravermelho (ouvido)', 'De mercúrio/vidro'], { required: true, group: 'Geral' }), sel('alimentacao', 'Alimentação', ['Pilhas', 'Bateria recarregável'], { group: 'Energia' })] },
      'medidores-de-pressao': { define: [sel('tipo_medidor', 'Tipo', ['Braço', 'Pulso', 'Glicosímetro (açúcar no sangue)', 'Oxímetro', 'Balança de saúde', 'Nebulizador'], { required: true, group: 'Geral' }), sel('alimentacao', 'Alimentação', ['Pilhas', 'Tomada', 'Pilhas e tomada', 'Bateria recarregável'], { group: 'Energia' }), yesno('memoria_leituras', 'Guarda as medições', { group: 'Funções' })] },
      'produtos-ortopedicos': { define: [axTamanho('Tamanho', ['P', 'M', 'G', 'GG', 'Único'], true), sel('tipo_ortopedico', 'Tipo', ['Joelheira', 'Cinta/Faixa lombar', 'Colar cervical', 'Tala/Imobilizador', 'Palmilha ortopédica', 'Meias de compressão', 'Outro'], { required: true, group: 'Geral' }), sel('lado', 'Lado', ['Esquerdo', 'Direito', 'Universal'], { group: 'Geral' })] },
      'mobilidade-e-acessibilidade': { define: [sel('tipo_mobilidade', 'Tipo', ['Cadeira de rodas', 'Bengala', 'Muletas', 'Andarilho', 'Cadeira de banho', 'Rampa', 'Cama hospitalar'], { required: true, group: 'Geral' }), num('carga_max_usuario_kg', 'Suporta até', { unit: 'kg', min: 30, max: 300, decimals: 0, group: 'Segurança' }), yesno('dobravel', 'Dobrável', { group: 'Funções' })] },
      'mascaras-e-luvas': { define: [axTamanho('Tamanho', ['P', 'M', 'G', 'GG', 'Único'], false), sel('tipo_protecao', 'Tipo', ['Máscara cirúrgica', 'Máscara FFP2/N95', 'Máscara de pano', 'Luvas de látex', 'Luvas de nitrilo', 'Luvas de vinil'], { required: true, group: 'Geral' }), num('unidades_pacote', 'Unidades por caixa', { min: 1, max: 5000, decimals: 0, group: 'Geral' })] },
      'higiene-e-prevencao': { define: [axCapacidade('Volume', ['50 ml', '100 ml', '250 ml', '500 ml', '1 L'], false), sel('tipo_prevencao', 'Tipo', ['Álcool gel/Desinfetante de mãos', 'Sabonete antisséptico', 'Repelente', 'Mosquiteiro', 'Preservativos', 'Protetor solar', 'Outro'], { required: true, group: 'Geral' })] },
      'equipamentos-de-cuidados-pessoais': { define: [sel('tipo_cuidado_pessoal', 'Tipo', ['Massajador', 'Aparelho de nebulização', 'Humidificador', 'Almofada térmica', 'Balança corporal', 'Aparelho de vapor', 'Outro'], { required: true, group: 'Geral' }), sel('alimentacao', 'Alimentação', ['Tomada', 'Bateria recarregável', 'Pilhas'], { group: 'Energia' })] },
    },
  }),

  // ============================================================================================ PET SHOP E ANIMAIS
  ...root('pet-shop-e-animais', {
    define: [sel('animal', 'Para', ['Cães', 'Gatos', 'Aves', 'Peixes', 'Roedores', 'Vários'], { group: 'Geral' })],
    subs: {
      'racoes-para-caes': { define: [axTamanho('Embalagem', ['1 kg', '3 kg', '10 kg', '15 kg', '20 kg'], true), sel('porte', 'Porte', ['Pequeno', 'Médio', 'Grande', 'Todos'], { group: 'Geral' }), sel('fase_animal', 'Fase', ['Filhote', 'Adulto', 'Sénior'], { group: 'Geral' })], disable: ['animal'] },
      'racoes-para-gatos': { define: [axTamanho('Embalagem', ['500 g', '1 kg', '3 kg', '10 kg', '15 kg'], true), sel('fase_animal', 'Fase', ['Filhote', 'Adulto', 'Sénior'], { group: 'Geral' })], disable: ['animal'] },
      'acessorios-para-animais': { define: [axCor(false), axTamanho('Tamanho', ['P', 'M', 'G', 'GG'], false), sel('tipo_acessorio_pet', 'Tipo', ['Roupa', 'Comedouro/Bebedouro', 'Transportadora', 'Arranhador', 'Pente/Escova', 'Outro'], { required: true, group: 'Geral' })] },
      'coleiras-e-guias': { define: [axCor(false), axTamanho('Tamanho', ['P', 'M', 'G', 'GG'], true), sel('tipo_coleira', 'Tipo', ['Coleira', 'Guia', 'Peitoral', 'Coleira antipulgas', 'Focinheira'], { required: true, group: 'Geral' })] },
      'camas-para-animais': { define: [axCor(false), axTamanho('Tamanho', ['P', 'M', 'G', 'GG'], true), sel('tipo_cama_pet', 'Tipo', ['Cama', 'Almofada', 'Casinha', 'Cobertor'], { group: 'Geral' })] },
      'higiene-animal': { define: [axCapacidade('Volume', ['100 ml', '250 ml', '500 ml', '1 L'], false), sel('tipo_higiene_pet', 'Tipo', ['Champô/Sabonete', 'Antipulgas/Carrapatos', 'Escova/Pente', 'Areia/Granulado', 'Tapetes higiénicos', 'Cortador de unhas'], { required: true, group: 'Geral' })] },
      aquarios: { define: [axCapacidade('Capacidade', ['20 L', '40 L', '60 L', '100 L', '200 L', '300 L'], false), sel('tipo_aquario', 'Tipo', ['Aquário', 'Filtro/Bomba', 'Aquecedor', 'Iluminação', 'Alimento para peixes', 'Decoração', 'Kit completo'], { required: true, group: 'Geral' })], disable: ['animal'] },
      gaiolas: { define: [axTamanho('Tamanho', ['Pequena', 'Média', 'Grande', 'Extra grande'], false), sel('tipo_gaiola', 'Tipo', ['Gaiola para aves', 'Gaiola para roedores', 'Viveiro', 'Poleiro/Acessórios', 'Ninho/Capoeira'], { required: true, group: 'Geral' })], override: [{ code: 'animal', options: ['Aves', 'Roedores', 'Vários'] }] },
      'brinquedos-para-animais': { define: [axCor(false), sel('tipo_brinquedo_pet', 'Tipo', ['Bola', 'Mordedor/Osso', 'Pelúcia', 'Corda', 'Interativo', 'Arranhador'], { group: 'Geral' })] },
    },
  }),

  // ============================================================================================ FESTAS E EVENTOS
  ...root('festas-e-eventos', {
    define: [axCor(false, COR)],
    subs: {
      'decoracao-de-festas': { define: [sel('tema', 'Tema/Ocasião', ['Aniversário', 'Casamento', 'Batizado', 'Formatura', 'Natal', 'Ano novo', 'Infantil', 'Religioso', 'Outro'], { group: 'Geral' }), sel('tipo_decoracao_festa', 'Tipo', ['Faixas/Bandeiras', 'Guirlandas', 'Painéis/Backdrops', 'Centros de mesa', 'Toalhas', 'Luzes decorativas', 'Kit'], { required: true, group: 'Geral' })] },
      baloes: { define: [sel('tipo_balao', 'Tipo', ['Látex', 'Metalizado (foil)', 'Hélio/Números e letras', 'Bomba/Inflador', 'Arco/Kit'], { required: true, group: 'Geral' }), num('unidades_pacote', 'Unidades por pacote', { min: 1, max: 1000, decimals: 0, group: 'Geral' })] },
      'artigos-de-casamento': { define: [sel('tipo_casamento', 'Tipo', ['Decoração', 'Lembranças', 'Convites', 'Acessórios dos noivos', 'Almofada de alianças', 'Arranjos'], { required: true, group: 'Geral' })] },
      'artigos-de-aniversario': { define: [sel('tipo_aniversario', 'Tipo', ['Velas', 'Chapéus/Adereços', 'Pratos e copos', 'Topo de bolo', 'Piñata', 'Kit'], { required: true, group: 'Geral' }), sel('faixa_idade', 'Para', ['Criança', 'Adolescente', 'Adulto', 'Todos'], { group: 'Geral' })] },
      lembrancas: { define: [sel('tipo_lembranca', 'Tipo', ['Chaveiros', 'Caixinhas', 'Sacos/Embalagens', 'Ímanes', 'Personalizados', 'Outro'], { required: true, group: 'Geral' }), num('unidades_pacote', 'Unidades por pacote', { min: 1, max: 1000, decimals: 0, group: 'Geral' })] },
      'utensilios-descartaveis': { define: [sel('tipo_descartavel', 'Tipo', ['Pratos', 'Copos', 'Talheres', 'Guardanapos', 'Toalhas de mesa', 'Palhinhas', 'Recipientes'], { required: true, group: 'Geral' }), num('unidades_pacote', 'Unidades por pacote', { min: 1, max: 5000, decimals: 0, group: 'Geral' }), sel('material_descartavel', 'Material', ['Plástico', 'Papel/Cartão', 'Biodegradável', 'Alumínio'], { group: 'Materiais' })] },
      'equipamentos-de-som': { define: [sel('tipo_som_festa', 'Tipo', ['Coluna ativa', 'Mesa de som', 'Microfone', 'Kit DJ', 'Amplificador', 'Aluguer não incluído'], { required: true, group: 'Geral' }), num('potencia_rms_w', 'Potência (RMS)', { unit: 'W', min: 10, max: 50000, decimals: 0, group: 'Desempenho', filter: true })], disable: ['cor'] },
      'iluminacao-para-eventos': { define: [sel('tipo_luz_evento', 'Tipo', ['Projetor LED/Efeitos', 'Globo de espelhos', 'Lasers', 'Fita/Cordão de luzes', 'Holofote', 'Máquina de fumo'], { required: true, group: 'Geral' }), sel('alimentacao', 'Alimentação', ['Tomada', 'Bateria', 'Pilhas'], { group: 'Energia' })], disable: ['cor'] },
      'tendas-e-coberturas': { define: [sel('tipo_tenda', 'Tipo', ['Tenda dobrável', 'Tenda de evento', 'Toldo', 'Lona', 'Mesas e cadeiras de evento'], { required: true, group: 'Geral' }), sel('tamanho_tenda', 'Tamanho', ['2x2 m', '3x3 m', '3x6 m', '4x4 m', '5x5 m', '6x10 m', 'Outro'], { group: 'Medidas' })] },
      'artigos-religiosos-para-eventos': { define: [sel('tradicao', 'Tradição', ['Cristã/Católica', 'Islâmica', 'Tradicional africana', 'Outra'], { group: 'Geral' }), sel('tipo_religioso', 'Tipo', ['Velas/Círios', 'Terços/Tasbih', 'Roupas cerimoniais', 'Livros/Imagens', 'Decoração', 'Outro'], { required: true, group: 'Geral' })] },
    },
  }),

  // ============================================================================================ PRODUTOS TRADICIONAIS E ARTESANATO
  ...root('produtos-tradicionais-e-artesanato', {
    define: [
      sel('origem_etnia', 'Origem/Tradição', ['Guiné-Bissau (Balanta)', 'Guiné-Bissau (Fula)', 'Guiné-Bissau (Mandinga)', 'Guiné-Bissau (Manjaco)', 'Guiné-Bissau (Papel)', 'Guiné-Bissau (Bijagós)', 'Outra região da Guiné-Bissau', 'Outro país'], { group: 'Cultura', help: 'Opcional: ajuda o comprador a conhecer a origem da peça.' }),
      yesno('feito_a_mao', 'Feito à mão', { group: 'Cultura' }),
    ],
    subs: {
      'tecidos-africanos': { define: [axCor(false), axTamanho('Metragem', ['1 jarda (0.9 m)', '2 jardas', '3 jardas', '6 jardas (peça completa)', 'Corte (por metro)'], true), sel('tipo_tecido', 'Tecido', ['Bazin', 'Wax (tecido africano)', 'Capulana', 'Brocado', 'Algodão estampado', 'Renda'], { required: true, group: 'Geral' })] },
      'panos-tradicionais': { define: [axCor(false), sel('tipo_pano', 'Tipo', ['Pano de pinti', 'Pano de obra', 'Pano de lenço/cabeça', 'Pano de cintura', 'Outro'], { required: true, group: 'Geral' }), sel('tecelagem', 'Técnica', ['Tecido em tear', 'Estampado', 'Tingido (batik)', 'Bordado'], { group: 'Geral' })] },
      'artesanato-guineense': { define: [sel('tipo_artesanato', 'Tipo', ['Escultura', 'Máscara', 'Cestaria', 'Cerâmica/Barro', 'Têxtil', 'Pintura/Arte', 'Outro'], { required: true, group: 'Geral' }), sel('material_artesanato', 'Material', ['Madeira', 'Palha/Fibra', 'Barro', 'Tecido', 'Metal', 'Couro', 'Misto'], { group: 'Materiais' })] },
      'cestos-e-cestaria': { define: [axTamanho('Tamanho', ['Pequeno', 'Médio', 'Grande'], false), sel('tipo_cesto', 'Tipo', ['Cesto', 'Esteira', 'Chapéu', 'Leque', 'Bandeja', 'Outro'], { group: 'Geral' }), sel('material_artesanato', 'Material', ['Palha', 'Bambu', 'Folha de palma', 'Fibra sintética'], { group: 'Materiais' })] },
      'artigos-de-madeira': { define: [sel('tipo_madeira', 'Tipo', ['Escultura', 'Utensílio', 'Móvel pequeno', 'Instrumento', 'Joia/Acessório', 'Decoração'], { required: true, group: 'Geral' }), sel('tipo_madeira_origem', 'Madeira', ['Mogno', 'Ébano', 'Teca', 'Cajueiro', 'Outra'], { group: 'Materiais' })] },
      'bijuterias-artesanais': { define: [axCor(false), sel('tipo_bijuteria', 'Tipo', ['Colar', 'Pulseira', 'Brincos', 'Anel', 'Tornozeleira', 'Cintura'], { required: true, group: 'Geral' }), sel('material_artesanato', 'Material', ['Contas/Missangas', 'Conchas', 'Sementes', 'Metal', 'Couro/Tecido', 'Misto'], { group: 'Materiais' })] },
      'instrumentos-tradicionais': { define: [sel('tipo_instrumento_trad', 'Instrumento', ['Tambor (djembé/tamã)', 'Balafon', 'Kora', 'Chocalho/Maracas', 'Flauta', 'Outro'], { required: true, group: 'Geral' }), sel('material_artesanato', 'Material', ['Madeira e pele', 'Cabaça', 'Metal', 'Misto'], { group: 'Materiais' })] },
      'decoracao-africana': { define: [sel('tipo_decoracao_africana', 'Tipo', ['Máscara de parede', 'Estatueta', 'Quadro/Tapeçaria', 'Almofada/Capa', 'Vaso/Cesto decorativo', 'Outro'], { required: true, group: 'Geral' }), axCor(false)] },
      'produtos-culturais': { define: [sel('tipo_cultural', 'Tipo', ['Livro/Música', 'Instrumento miniatura', 'Roupa cerimonial', 'Objeto ritual (decorativo)', 'Jogo tradicional', 'Outro'], { required: true, group: 'Geral' })] },
      'lembrancas-regionais': { define: [sel('tipo_lembranca', 'Tipo', ['Chaveiro', 'Íman', 'Miniatura', 'T-shirt', 'Postal/Impresso', 'Outro'], { required: true, group: 'Geral' }), axCor(false)] },
    },
  }),

  // ============================================================================================ INSTRUMENTOS MUSICAIS
  ...root('instrumentos-musicais', {
    subs: {
      guitarras: { define: [axCor(false), sel('tipo_guitarra', 'Tipo', ['Violão acústico', 'Violão elétrico-acústico', 'Guitarra elétrica', 'Baixo', 'Ukulele', 'Cavaquinho'], { required: true, group: 'Geral' }), sel('numero_cordas', 'Cordas', ['4', '5', '6', '7', '12'], { group: 'Geral' }), yesno('canhoto', 'Para canhotos', { group: 'Geral' })] },
      'teclados-musicais': { define: [axCor(false), sel('tipo_teclado', 'Tipo', ['Teclado arranjador', 'Piano digital', 'Sintetizador', 'Controlador MIDI', 'Acordeão'], { required: true, group: 'Geral' }), sel('numero_teclas', 'Teclas', ['25', '32', '37', '49', '61', '76', '88'], { group: 'Geral' })] },
      'baterias-e-percussao': { define: [sel('tipo_percussao', 'Tipo', ['Bateria acústica', 'Bateria eletrónica', 'Djembé/Tambor', 'Congas/Bongos', 'Pratos/Hi-hat', 'Pandeiro/Chocalho', 'Baquetas'], { required: true, group: 'Geral' }), axCor(false)] },
      microfones: { define: [sel('tipo_microfone', 'Tipo', ['Dinâmico', 'Condensador', 'Sem fios', 'Lapela', 'USB'], { required: true, group: 'Geral' }), sel('ligacao', 'Ligação', ['Cabo XLR', 'Cabo P10/P2', 'USB', 'Sem fios (UHF/Bluetooth)'], { group: 'Conectividade' })] },
      'mesas-de-som': { define: [num('canais_mesa', 'Canais', { required: true, min: 2, max: 64, decimals: 0, group: 'Geral', filter: true }), yesno('efeitos_digitais', 'Com efeitos digitais', { group: 'Funções' }), yesno('interface_usb', 'Interface USB/Bluetooth', { group: 'Conectividade' })] },
      'instrumentos-tradicionais': { define: [sel('tipo_instrumento_trad', 'Instrumento', ['Tambor (djembé/tamã)', 'Balafon', 'Kora', 'Chocalho/Maracas', 'Flauta', 'Outro'], { required: true, group: 'Geral' }), sel('material_artesanato', 'Material', ['Madeira e pele', 'Cabaça', 'Metal', 'Misto'], { group: 'Materiais' })] },
      'acessorios-musicais': { define: [axCor(false), sel('tipo_acessorio_musical', 'Tipo', ['Cordas', 'Palhetas/Plectros', 'Capas/Bolsas', 'Suportes/Estantes', 'Afinadores', 'Cabos', 'Outro'], { required: true, group: 'Geral' }), text('compativel_com', 'Compatível com', { maxLength: 120, group: 'Compatibilidade' })] },
      'equipamentos-de-gravacao': { define: [sel('tipo_gravacao', 'Tipo', ['Interface de áudio', 'Gravador portátil', 'Monitores de estúdio', 'Fones de estúdio', 'Filtro anti-pop/Suporte', 'Kit de estúdio'], { required: true, group: 'Geral' }), sel('ligacao', 'Ligação', ['USB', 'USB-C', 'XLR', 'Bluetooth'], { group: 'Conectividade' })] },
    },
  }),
];
export { plan };
