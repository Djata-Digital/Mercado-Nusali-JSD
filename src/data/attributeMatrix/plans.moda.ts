/** FASE 8A — matriz: moda, calçados, bolsas e acessórios, beleza. */
import type { CategoryPlan } from './types.js';
import {
  COR, MATERIAL_COURO, MATERIAL_TECIDO, MATERIAL_TECIDO_AFRICANO, NUM_CALCADO_ADULTO, NUM_CALCADO_INFANTIL, TAM_BEBE_CRIANCA, TAM_ROUPA, TAM_ROUPA_LETRAS, TAM_SUTIA,
  axCor, axCapacidade, axTamanho, axisSel, multi, num, plan, root, sel, text, yesno,
} from './library.js';

const OCASIAO = ['Casual', 'Trabalho', 'Festa e cerimónia', 'Desporto', 'Tradicional', 'Dia a dia'];
const TAM_ROUPA_AX = (help = 'Escolha o tamanho de cada variação. Pode usar letras (P, M, G) ou números.') => axTamanho('Tamanho', TAM_ROUPA, true, help);

const modaRoot = (rootSlug: string, subs: Parameters<typeof root>[1]['subs']) =>
  root(rootSlug, {
    define: [
      axCor(true),
      TAM_ROUPA_AX(),
      sel('material', 'Material principal', MATERIAL_TECIDO, { group: 'Materiais' }),
      multi('ocasiao', 'Ocasião', OCASIAO, { group: 'Estilo' }),
    ],
    subs,
  });

export const modaPlans: CategoryPlan[] = [
  // ============================================================================================ MODA FEMININA
  ...modaRoot('moda-feminina', {
    vestidos: { define: [sel('comprimento_peca', 'Comprimento da peça', ['Mini', 'Midi', 'Longo'], { group: 'Estilo' }), sel('manga', 'Manga', ['Sem manga', 'Curta', '3/4', 'Longa'], { group: 'Estilo' })] },
    'blusas-e-camisetas': { define: [sel('manga', 'Manga', ['Sem manga', 'Curta', '3/4', 'Longa'], { group: 'Estilo' }), sel('decote', 'Decote', ['Redondo', 'Em V', 'Quadrado', 'Gola alta', 'Ombro a ombro'], { group: 'Estilo' })] },
    saias: { define: [sel('comprimento_peca', 'Comprimento da peça', ['Mini', 'Midi', 'Longa'], { group: 'Estilo' })] },
    calcas: { define: [sel('tipo_calca', 'Tipo', ['Jeans', 'Alfaiataria', 'Leggings', 'Jogger', 'Cargo', 'Larga (pantalona)'], { group: 'Estilo' }), sel('cintura', 'Cintura', ['Alta', 'Média', 'Baixa'], { group: 'Estilo' })] },
    conjuntos: { define: [num('numero_pecas', 'Número de peças', { min: 2, max: 6, decimals: 0, group: 'Geral' })] },
    'roupas-tradicionais-africanas': {
      define: [sel('tipo_traje', 'Tipo de traje', ['Vestido', 'Conjunto', 'Boubou/Bubu', 'Blusa e pano', 'Saia', 'Outro'], { group: 'Geral' })],
      override: [{ code: 'material', options: MATERIAL_TECIDO_AFRICANO }],
      note: 'Override do material do root com tecidos africanos (Bazin, Wax, Capulana, Pano de pinti).',
    },
    'roupas-intimas': {
      define: [sel('tipo_intima', 'Tipo', ['Sutiã', 'Cuecas/calcinhas', 'Conjunto', 'Cinta', 'Camisa de dormir', 'Pijama'], { required: true, group: 'Geral' })],
      override: [{ code: 'material', options: ['Algodão', 'Poliéster', 'Renda', 'Seda', 'Malha', 'Misto'] }],
    },
    'moda-praia': { define: [sel('tipo_praia', 'Tipo', ['Biquíni', 'Fato de banho', 'Saída de praia', 'Calção/Short', 'Sarong'], { group: 'Geral' })] },
    'roupas-esportivas': { define: [sel('tipo_desporto', 'Tipo', ['Top', 'Leggings', 'Short', 'Camiseta', 'Conjunto', 'Casaco'], { group: 'Geral' })] },
    casacos: { define: [sel('tipo_casaco', 'Tipo', ['Casaco', 'Blazer', 'Colete', 'Cardigan', 'Blusão', 'Impermeável'], { group: 'Geral' })] },
  }),

  // ============================================================================================ MODA MASCULINA
  ...modaRoot('moda-masculina', {
    camisas: { define: [sel('manga', 'Manga', ['Curta', 'Longa'], { group: 'Estilo' }), sel('corte', 'Corte', ['Clássico', 'Slim', 'Largo'], { group: 'Estilo' })] },
    'camisetas-e-polos': { define: [sel('tipo_camiseta', 'Tipo', ['Camiseta', 'Polo', 'Regata', 'Manga longa'], { group: 'Geral' })] },
    calcas: { define: [sel('tipo_calca', 'Tipo', ['Jeans', 'Alfaiataria', 'Jogger', 'Cargo', 'Sarja', 'Fato de treino'], { group: 'Estilo' })] },
    bermudas: { define: [sel('tipo_bermuda', 'Tipo', ['Jeans', 'Sarja', 'Desportiva', 'Praia'], { group: 'Estilo' })] },
    'fatos-e-blazers': {
      define: [sel('tipo_fato', 'Tipo', ['Fato completo', 'Blazer', 'Colete', 'Smoking'], { required: true, group: 'Geral' }), num('numero_pecas', 'Número de peças', { min: 1, max: 5, decimals: 0, group: 'Geral' })],
    },
    'roupas-tradicionais-africanas': {
      define: [sel('tipo_traje', 'Tipo de traje', ['Conjunto (calça e camisa)', 'Boubou/Bubu', 'Kaftan', 'Camisa', 'Outro'], { group: 'Geral' })],
      override: [{ code: 'material', options: MATERIAL_TECIDO_AFRICANO }],
    },
    'roupa-intima': {
      define: [sel('tipo_intima', 'Tipo', ['Cuecas', 'Boxers', 'Camisola interior', 'Meias', 'Pijama'], { required: true, group: 'Geral' })],
      override: [{ code: 'material', options: ['Algodão', 'Poliéster', 'Malha', 'Misto'] }],
    },
    'roupa-esportiva': { define: [sel('tipo_desporto', 'Tipo', ['Camiseta', 'Short', 'Fato de treino', 'Casaco', 'Camisola de equipa'], { group: 'Geral' })] },
    casacos: { define: [sel('tipo_casaco', 'Tipo', ['Casaco', 'Blusão', 'Colete', 'Impermeável', 'Sobretudo'], { group: 'Geral' })] },
    uniformes: {
      define: [sel('tipo_uniforme', 'Uso do uniforme', ['Escolar', 'Trabalho', 'Segurança', 'Saúde', 'Restauração', 'Desporto'], { required: true, group: 'Geral' })],
    },
  }),

  // ============================================================================================ CALÇADOS
  ...root('calcados', {
    define: [
      axCor(true),
      axTamanho('Numeração', NUM_CALCADO_ADULTO, true, 'Número do calçado de cada variação.'),
      sel('material_cabedal', 'Material do cabedal', MATERIAL_COURO.filter((o) => ['Couro natural', 'Couro sintético', 'Lona', 'Nylon', 'Borracha', 'Plástico', 'Outro'].includes(o)), { group: 'Materiais' }),
      sel('tipo_solado', 'Solado', ['Borracha', 'Sintético (EVA/PU)', 'Couro', 'Madeira/Cortiça'], { group: 'Materiais' }),
    ],
    subs: {
      'sapatos-masculinos': { define: [sel('tipo_sapato', 'Tipo', ['Social', 'Casual', 'Mocassim', 'Sapatilha', 'Bota curta'], { group: 'Geral' })] },
      'sapatos-femininos': {
        define: [sel('tipo_sapato', 'Tipo', ['Sapatilha', 'Salto alto', 'Salto baixo', 'Rasteira', 'Plataforma', 'Mocassim'], { group: 'Geral' }), sel('altura_salto', 'Altura do salto', ['Sem salto', 'Baixo (até 4 cm)', 'Médio (4-7 cm)', 'Alto (mais de 7 cm)'], { group: 'Medidas' })],
      },
      tenis: { define: [sel('uso_tenis', 'Uso', ['Casual', 'Corrida', 'Futebol', 'Basquetebol', 'Treino', 'Skate'], { group: 'Geral' })] },
      sandalias: { define: [sel('tipo_sandalia', 'Tipo', ['Rasteira', 'Salto', 'Plataforma', 'Papete', 'Tipo chinelo'], { group: 'Geral' })] },
      chinelos: { define: [sel('tipo_chinelo', 'Tipo', ['De dedo', 'Slide', 'Casa/interior', 'Praia'], { group: 'Geral' })] },
      botas: { define: [sel('tipo_bota', 'Tipo', ['Cano curto', 'Cano alto', 'Trabalho', 'Chuva (borracha)', 'Montaria'], { group: 'Geral' })] },
      'calcados-infantis': {
        define: [sel('faixa_etaria', 'Faixa etária', ['Bebé', 'Criança', 'Júnior'], { group: 'Geral' })],
        override: [{ code: 'tamanho', options: [...NUM_CALCADO_INFANTIL, '35', '36'] }],
        note: 'Override da numeração: números infantis (17-34) em vez dos adultos.',
      },
      'calcados-de-seguranca': {
        define: [multi('protecao', 'Proteção', ['Biqueira de aço', 'Biqueira composta', 'Palmilha anti-perfuração', 'Solado antiderrapante', 'Isolamento elétrico', 'Resistente a óleo'], { required: true, group: 'Segurança' })],
      },
      'acessorios-para-calcados': {
        define: [sel('tipo_acessorio', 'Tipo', ['Palmilha', 'Atacadores', 'Graxa/produto de limpeza', 'Calçadeira', 'Sapateira', 'Outro'], { required: true, group: 'Geral' })],
        disable: ['tamanho', 'material_cabedal', 'tipo_solado'],
        note: 'Sem numeração: acessórios não têm número de calçado.',
      },
    },
  }),

  // ============================================================================================ BOLSAS, MALAS E ACESSÓRIOS
  ...root('bolsas-malas-e-acessorios', {
    define: [axCor(true), sel('material', 'Material', MATERIAL_COURO, { group: 'Materiais' })],
    subs: {
      'bolsas-femininas': { define: [sel('tipo_bolsa', 'Tipo', ['Tiracolo', 'Mão', 'Ombro', 'Tote', 'Clutch/Carteira de festa', 'Bolsa térmica'], { group: 'Geral' })] },
      mochilas: { define: [num('capacidade_litros', 'Capacidade', { unit: 'L', min: 1, max: 120, decimals: 0, group: 'Capacidade' }), yesno('compartimento_portatil', 'Compartimento para portátil', { group: 'Funções' })] },
      'malas-de-viagem': {
        define: [axTamanho('Tamanho', ['Cabine (pequena)', 'Média', 'Grande', 'Extra grande'], false), yesno('rodas', 'Com rodas', { group: 'Funções' }), yesno('cadeado', 'Com cadeado', { group: 'Funções' })],
      },
      carteiras: { define: [sel('tipo_carteira', 'Tipo', ['Carteira masculina', 'Carteira feminina', 'Porta-cartões', 'Porta-moedas'], { group: 'Geral' })] },
      cintos: {
        define: [axTamanho('Tamanho', ['85 cm', '90 cm', '95 cm', '100 cm', '105 cm', '110 cm', '115 cm', '120 cm'], false), sel('tipo_cinto', 'Tipo', ['Social', 'Casual', 'Desportivo'], { group: 'Geral' })],
      },
      'bones-e-chapeus': { define: [axTamanho('Tamanho', ['Único (ajustável)', 'P', 'M', 'G'], false), sel('tipo_chapeu', 'Tipo', ['Boné', 'Chapéu', 'Gorro', 'Viseira', 'Turbante/lenço de cabeça'], { group: 'Geral' })] },
      'oculos-de-sol': { define: [sel('tipo_lente', 'Tipo de lente', ['Polarizada', 'Espelhada', 'Degradê', 'Fotocromática'], { group: 'Lentes' }), yesno('protecao_uv', 'Proteção UV', { group: 'Lentes' })] },
      relogios: {
        define: [sel('tipo_relogio', 'Tipo', ['Analógico', 'Digital', 'Misto (analógico/digital)', 'Smartwatch'], { required: true, group: 'Geral' }), sel('publico', 'Público', ['Masculino', 'Feminino', 'Unissex', 'Infantil'], { group: 'Geral' }), yesno('resistente_agua', 'Resistente à água', { group: 'Uso' })],
      },
      'joias-e-bijuterias': {
        define: [sel('tipo_joia', 'Tipo', ['Colar', 'Brincos', 'Pulseira', 'Anel', 'Conjunto', 'Pendente', 'Tornozeleira'], { required: true, group: 'Geral' })],
        override: [{ code: 'material', options: ['Ouro', 'Prata', 'Aço inoxidável', 'Folheado a ouro', 'Bijuteria (metal)', 'Pérolas', 'Contas/missangas', 'Outro'] }],
      },
      'acessorios-de-cabelo': {
        define: [sel('tipo_acessorio_cabelo', 'Tipo', ['Elásticos', 'Travessas/ganchos', 'Faixas/bandanas', 'Lenços', 'Tiaras', 'Pentes'], { group: 'Geral' })],
        disable: ['material'],
      },
    },
  }),

  // ============================================================================================ BELEZA E CUIDADOS PESSOAIS
  ...root('beleza-e-cuidados-pessoais', {
    define: [
      sel('publico_alvo', 'Público', ['Feminino', 'Masculino', 'Unissex', 'Infantil'], { group: 'Geral' }),
      text('validade_info', 'Validade (se aplicável)', { maxLength: 60, group: 'Segurança', placeholder: 'Ex.: 24 meses após aberto', help: 'Indique o prazo de validade ou a data limite.' }),
    ],
    subs: {
      perfumes: {
        define: [axCapacidade('Volume', ['30 ml', '50 ml', '75 ml', '100 ml', '125 ml', '200 ml'], true, 'Volume do frasco.'), sel('tipo_perfume', 'Concentração', ['Perfume (Parfum)', 'Eau de Parfum', 'Eau de Toilette', 'Colónia', 'Body splash', 'Óleo perfumado'], { group: 'Geral' }), sel('familia_olfativa', 'Família olfativa', ['Floral', 'Amadeirado', 'Cítrico', 'Oriental', 'Fresco', 'Doce'], { group: 'Geral' })],
      },
      maquiagem: {
        define: [axisSel('cor', 'Tom / Cor', [...COR, 'Nude', 'Bordô', 'Coral'], { required: false, help: 'Tom da base, batom ou sombra.' }), sel('tipo_maquiagem', 'Tipo', ['Base', 'Batom', 'Pó compacto', 'Rímel', 'Sombra', 'Lápis/Delineador', 'Blush', 'Corretivo', 'Kit', 'Outro'], { required: true, group: 'Geral' })],
      },
      'cuidados-com-a-pele': {
        define: [axCapacidade('Volume', ['30 ml', '50 ml', '100 ml', '200 ml', '400 ml', '500 ml'], false), sel('tipo_cuidado', 'Tipo', ['Creme hidratante', 'Protetor solar', 'Sabonete facial', 'Óleo', 'Loção corporal', 'Manteiga de karité', 'Máscara facial', 'Outro'], { required: true, group: 'Geral' }), multi('tipo_pele', 'Tipo de pele', ['Normal', 'Seca', 'Oleosa', 'Mista', 'Sensível', 'Todos'], { group: 'Geral' })],
      },
      'produtos-capilares': {
        define: [axCapacidade('Volume', ['100 ml', '200 ml', '300 ml', '500 ml', '1 L'], false), sel('tipo_capilar', 'Tipo', ['Champô', 'Condicionador', 'Máscara/tratamento', 'Óleo capilar', 'Creme de pentear', 'Gel/fixador', 'Alisante/relaxante', 'Tinta de cabelo'], { required: true, group: 'Geral' }), multi('tipo_cabelo', 'Tipo de cabelo', ['Liso', 'Ondulado', 'Cacheado/crespo', 'Seco', 'Oleoso', 'Todos'], { group: 'Geral' })],
      },
      'cabelos-e-extensoes': {
        define: [
          axisSel('cor', 'Cor do cabelo', ['Preto (1)', 'Castanho escuro (2)', 'Castanho (4)', 'Loiro escuro (27)', 'Loiro (613)', 'Vermelho (99J)', 'Azul', 'Rosa', 'Misto/Ombré', 'Outra cor'], { required: true }),
          axTamanho('Comprimento', ['8 pol', '10 pol', '12 pol', '14 pol', '16 pol', '18 pol', '20 pol', '22 pol', '24 pol', '26 pol', '28 pol', '30 pol'], true, 'Comprimento do cabelo em polegadas.'),
          sel('tipo_cabelo_ext', 'Tipo', ['Cabelo humano', 'Sintético', 'Tranças/jumbo', 'Mistura (humano e sintético)'], { required: true, group: 'Geral' }),
          sel('textura', 'Textura', ['Liso', 'Ondulado', 'Cacheado', 'Crespo/afro'], { group: 'Geral' }),
          num('quantidade_cabelo_g', 'Quantidade de cabelo', { unit: 'g', min: 10, max: 1000, decimals: 0, group: 'Medidas', help: 'Gramas de cabelo no pacote (não é o peso da embalagem de envio).' }),
        ],
      },
      perucas: {
        define: [
          axisSel('cor', 'Cor', ['Preto', 'Castanho escuro', 'Castanho', 'Loiro', 'Ruivo', 'Cinzento', 'Colorido', 'Ombré'], { required: true }),
          axTamanho('Comprimento', ['Curto (até 25 cm)', 'Médio (25-45 cm)', 'Longo (45-70 cm)', 'Extra longo (mais de 70 cm)'], false),
          sel('tipo_cabelo_ext', 'Tipo', ['Cabelo humano', 'Sintético', 'Mistura'], { required: true, group: 'Geral' }),
          sel('textura', 'Textura', ['Liso', 'Ondulado', 'Cacheado', 'Crespo/afro'], { group: 'Geral' }),
          sel('tipo_touca', 'Touca', ['Lace frontal', 'Full lace', 'Touca tradicional', 'Sem touca (clip)'], { group: 'Geral' }),
        ],
      },
      barbearia: { define: [sel('tipo_barbearia', 'Tipo', ['Máquina de cortar', 'Aparador', 'Navalha/lâminas', 'Pente/escova', 'Produtos para barba', 'Capa de barbeiro'], { required: true, group: 'Geral' }), sel('alimentacao', 'Alimentação', ['Com fio', 'Bateria recarregável', 'Pilhas', 'Não aplicável'], { group: 'Energia' })] },
      'manicure-e-pedicure': { define: [axisSel('cor', 'Cor do esmalte', [...COR, 'Nude', 'Transparente'], { required: false }), sel('tipo_unhas', 'Tipo', ['Esmalte', 'Unhas postiças', 'Alicates e cortadores', 'Lixas', 'Removedor', 'Kit de manicure'], { required: true, group: 'Geral' })] },
      'higiene-pessoal': {
        define: [axCapacidade('Volume / quantidade', ['50 ml', '100 ml', '200 ml', '400 ml', '500 ml', '1 L'], false), sel('tipo_higiene', 'Tipo', ['Sabonete', 'Gel de banho', 'Desodorizante', 'Pasta de dentes', 'Escova de dentes', 'Papel higiénico', 'Pensos higiénicos', 'Lenços', 'Outro'], { required: true, group: 'Geral' })],
      },
      'equipamentos-de-salao': {
        define: [sel('tipo_equipamento', 'Tipo', ['Secador', 'Prancha/alisador', 'Cadeira de salão', 'Lavatório', 'Capacete de secagem', 'Carrinho auxiliar', 'Outro'], { required: true, group: 'Geral' }), num('potencia_w', 'Potência', { unit: 'W', min: 50, max: 5000, decimals: 0, group: 'Energia' })],
        disable: ['publico_alvo', 'validade_info'],
      },
    },
  }),
];
// TAM_ROUPA_LETRAS e TAM_BEBE_CRIANCA/TAM_SUTIA ficam disponíveis para os blocos seguintes (bebés/crianças)
export { TAM_BEBE_CRIANCA, TAM_ROUPA_LETRAS, TAM_SUTIA, plan };
