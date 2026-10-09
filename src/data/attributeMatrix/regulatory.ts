/**
 * FASE 8B — subcategorias com POSSÍVEIS exigências regulatórias/sanitárias/de segurança, para REVISÃO do dono (e, se ele quiser, de
 * assessoria jurídica/técnica). NADA aqui bloqueia categoria, publicação ou venda: é um relatório de decisão.
 * Não é aconselhamento jurídico; as exigências reais dependem da legislação vigente na Guiné-Bissau e no país de destino.
 * Cada slug é validado contra a árvore real (teste: nenhuma categoria inventada).
 */

export type RegulatoryTopic =
  | 'sanitaria-alimentar'
  | 'saude-dispositivo-medico'
  | 'cosmeticos-higiene'
  | 'seguranca-infantil'
  | 'telecomunicacoes-aviacao'
  | 'privacidade-videovigilancia'
  | 'baterias-mercadorias-perigosas'
  | 'seguranca-eletrica'
  | 'homologacao-seguranca-individual'
  | 'quimicos-rotulagem'
  | 'fitossanitario-sementes'
  | 'racao-animal-sanidade'
  | 'materiais-preciosos'
  | 'patrimonio-cultural-fauna-flora'
  | 'objetos-cortantes';

export type RegulatoryLevel = 'atencao' | 'revisao' | 'informativo';

export interface RegulatoryEntry {
  /** slug de uma SUBCATEGORIA real */
  slug: string;
  topics: RegulatoryTopic[];
  level: RegulatoryLevel;
  why: string;
  /** o que a plataforma poderia fazer (opções para decisão — nada é aplicado) */
  options: string;
}

const r = (root: string, sub: string, topics: RegulatoryTopic[], level: RegulatoryLevel, why: string, options: string): RegulatoryEntry => ({ slug: `${root}-${sub}`, topics, level, why, options });

const ALI = 'alimentos-frescos-e-bebidas';
const SUP = 'supermercado-e-mercearia';
const SAU = 'saude-e-bem-estar';
const BEL = 'beleza-e-cuidados-pessoais';
const BEB = 'bebes-e-criancas';
const BRI = 'brinquedos-e-jogos';
const ENE = 'energia-solar-e-eletricidade';
const AUT = 'automoveis-motos-e-pecas';
const AGR = 'agricultura-e-pecuaria';
const PET = 'pet-shop-e-animais';
const IND = 'industria-comercio-e-escritorio';

const FOOD_WHY = 'Alimento/bebida: segurança alimentar, conservação (cadeia de frio), validade e rotulagem.';
const FOOD_OPT = 'Exigir (ou recomendar) data de validade e condição de conservação na ficha; termo de responsabilidade do vendedor; limitar entrega a zonas com prazo compatível.';

export const REGULATORY_ENTRIES: RegulatoryEntry[] = [
  r(ALI, 'carnes', ['sanitaria-alimentar'], 'atencao', FOOD_WHY + ' Produto perecível de risco alto.', FOOD_OPT),
  r(ALI, 'peixes-e-mariscos', ['sanitaria-alimentar'], 'atencao', FOOD_WHY + ' Produto perecível de risco alto.', FOOD_OPT),
  r(ALI, 'produtos-congelados', ['sanitaria-alimentar'], 'atencao', FOOD_WHY + ' Depende de cadeia de frio contínua até a entrega.', FOOD_OPT),
  r(ALI, 'ovos', ['sanitaria-alimentar'], 'revisao', FOOD_WHY, FOOD_OPT),
  r(ALI, 'frutas', ['sanitaria-alimentar'], 'informativo', FOOD_WHY, FOOD_OPT),
  r(ALI, 'legumes-e-verduras', ['sanitaria-alimentar'], 'informativo', FOOD_WHY, FOOD_OPT),
  r(ALI, 'tuberculos', ['sanitaria-alimentar'], 'informativo', FOOD_WHY, FOOD_OPT),
  r(ALI, 'agua-mineral', ['sanitaria-alimentar'], 'revisao', FOOD_WHY, FOOD_OPT),
  r(ALI, 'sumos-e-refrigerantes', ['sanitaria-alimentar'], 'revisao', FOOD_WHY, FOOD_OPT),
  r(ALI, 'bebidas-nao-alcoolicas', ['sanitaria-alimentar'], 'revisao', FOOD_WHY + ' A árvore NÃO tem categoria de bebidas alcoólicas.', FOOD_OPT),
  r(ALI, 'produtos-alimentares-locais', ['sanitaria-alimentar'], 'revisao', FOOD_WHY + ' Produção artesanal/local: origem e higiene variam.', FOOD_OPT),
  r(SUP, 'leite-e-derivados', ['sanitaria-alimentar'], 'revisao', FOOD_WHY, FOOD_OPT),
  r(SUP, 'conservas-e-enlatados', ['sanitaria-alimentar'], 'informativo', FOOD_WHY, FOOD_OPT),
  r(SUP, 'oleos-alimentares', ['sanitaria-alimentar'], 'informativo', FOOD_WHY, FOOD_OPT),
  r(SUP, 'produtos-de-limpeza', ['quimicos-rotulagem'], 'revisao', 'Produto químico doméstico: rotulagem de perigo e armazenamento.', 'Exigir avisos de uso na ficha; vedar envio de produtos inflamáveis em modalidades sem tratamento específico.'),
  r(SUP, 'produtos-de-higiene-domestica', ['quimicos-rotulagem'], 'informativo', 'Produto químico doméstico: rotulagem.', 'Aviso de uso na ficha.'),
  r(BEB, 'alimentacao-infantil', ['sanitaria-alimentar', 'seguranca-infantil'], 'atencao', 'Alimento para lactentes/crianças: validade, composição e faixa etária são críticas.', 'Exigir validade e faixa etária; revisão manual de anúncios novos.'),
  r(BEB, 'mamadeiras', ['seguranca-infantil'], 'revisao', 'Contato com alimento de bebê: material seguro (ex.: livre de BPA) e esterilização.', 'Campo de material e aviso de segurança na ficha.'),
  r(BEB, 'fraldas', ['cosmeticos-higiene'], 'informativo', 'Artigo de higiene infantil: tamanho/peso e validade.', 'Já coberto pelos atributos de tamanho/peso da matriz.'),
  r(BEB, 'produtos-de-higiene-infantil', ['cosmeticos-higiene', 'seguranca-infantil'], 'revisao', 'Produto aplicado em pele de bebê: composição e hipoalergenicidade.', 'Exigir lista de ingredientes/validade; revisão manual de anúncios novos.'),
  r(BEB, 'carrinhos-de-bebe', ['seguranca-infantil'], 'revisao', 'Equipamento infantil com normas de segurança (travões, estabilidade, peso máximo).', 'Peso máximo da criança já está na matriz; avaliar exigir norma/certificação.'),
  r(BEB, 'bercos', ['seguranca-infantil'], 'atencao', 'Berço: risco de asfixia/queda; espaçamento de grades e colchão adequados.', 'Avisos de segurança e idade máxima; revisão manual de anúncios novos.'),
  r(BEB, 'cadeiras-infantis', ['seguranca-infantil'], 'atencao', 'Cadeira/assento de segurança: homologação e faixa de peso são decisivas.', 'Exigir faixa de peso e norma; vedar anúncios sem esses dados (decisão do dono).'),
  r(BEB, 'seguranca-infantil', ['seguranca-infantil'], 'revisao', 'Itens de proteção de crianças.', 'Aviso de uso e faixa etária.'),
  r(BRI, 'bonecas', ['seguranca-infantil'], 'revisao', 'Brinquedo: faixa etária, peças pequenas e materiais.', 'Faixa etária já na matriz; avisar sobre peças pequenas (< 3 anos).'),
  r(BRI, 'brinquedos-educativos', ['seguranca-infantil'], 'revisao', 'Brinquedo: faixa etária, peças pequenas e materiais.', 'Idem.'),
  r(BRI, 'brinquedos-eletronicos', ['seguranca-infantil', 'seguranca-eletrica'], 'atencao', 'Brinquedo com pilhas/baterias: compartimento de baterias seguro e faixa etária.', 'Aviso de pilhas/baterias e faixa etária.'),
  r(BRI, 'bicicletas-infantis', ['seguranca-infantil'], 'revisao', 'Veículo infantil: recomendação de capacete e idade/altura.', 'Aviso de uso com proteção.'),
  r(BRI, 'brinquedos-de-exterior', ['seguranca-infantil'], 'revisao', 'Brinquedo de exterior: estabilidade e peso máximo.', 'Aviso de supervisão e peso máximo.'),
  r(BRI, 'carrinhos-de-brinquedo', ['seguranca-infantil'], 'informativo', 'Brinquedo: peças pequenas.', 'Faixa etária.'),
  r(BRI, 'pelucias', ['seguranca-infantil'], 'informativo', 'Brinquedo: enchimento e peças pequenas.', 'Faixa etária.'),
  r(SAU, 'primeiros-socorros', ['saude-dispositivo-medico'], 'revisao', 'Possível produto de saúde: evitar alegações terapêuticas; verificar registro quando aplicável.', 'Proibir alegações de cura/tratamento na descrição; revisão manual.'),
  r(SAU, 'termometros', ['saude-dispositivo-medico'], 'revisao', 'Dispositivo de medição clínica: precisão e registro.', 'Campo de tipo/precisão na ficha; sem alegações diagnósticas.'),
  r(SAU, 'medidores-de-pressao', ['saude-dispositivo-medico'], 'atencao', 'Dispositivo médico de medição: calibração/validação clínica.', 'Exigir marca/modelo e garantia; aviso "não substitui avaliação médica".'),
  r(SAU, 'produtos-ortopedicos', ['saude-dispositivo-medico'], 'revisao', 'Possível dispositivo médico de apoio.', 'Aviso de uso; sem alegações terapêuticas.'),
  r(SAU, 'mobilidade-e-acessibilidade', ['saude-dispositivo-medico'], 'informativo', 'Cadeiras de rodas/andadores: carga máxima e segurança.', 'Carga máxima na ficha.'),
  r(SAU, 'mascaras-e-luvas', ['saude-dispositivo-medico'], 'revisao', 'Equipamento de proteção: classe/nível de proteção.', 'Campo de tipo/nível; sem alegações de proteção não comprovadas.'),
  r(SAU, 'higiene-e-prevencao', ['cosmeticos-higiene'], 'revisao', 'Produtos de higiene/desinfeção: composição e alegações.', 'Lista de ingredientes/validade; sem alegações médicas.'),
  r(SAU, 'equipamentos-de-cuidados-pessoais', ['saude-dispositivo-medico', 'seguranca-eletrica'], 'informativo', 'Equipamento pessoal elétrico/saúde.', 'Voltagem/garantia.'),
  r(BEL, 'perfumes', ['cosmeticos-higiene'], 'revisao', 'Cosmético: composição (alergénios), validade e autenticidade (falsificação).', 'Exigir validade/lote; política de produtos falsificados.'),
  r(BEL, 'maquiagem', ['cosmeticos-higiene'], 'revisao', 'Cosmético: composição e validade.', 'Idem.'),
  r(BEL, 'cuidados-com-a-pele', ['cosmeticos-higiene'], 'revisao', 'Cosmético: composição, validade e alegações.', 'Idem; sem alegações médicas.'),
  r(BEL, 'produtos-capilares', ['cosmeticos-higiene'], 'revisao', 'Cosmético: composição (alisantes/tinturas) e validade.', 'Idem.'),
  r(BEL, 'higiene-pessoal', ['cosmeticos-higiene'], 'informativo', 'Higiene pessoal: validade.', 'Validade.'),
  r('celulares-e-telefones', 'radios-comunicadores', ['telecomunicacoes-aviacao'], 'atencao', 'Rádios transmissores podem exigir licença/homologação de espectro.', 'Aviso de responsabilidade do vendedor sobre licenciamento; revisão manual.'),
  r('eletronicos-tv-e-audio', 'drones', ['telecomunicacoes-aviacao', 'privacidade-videovigilancia'], 'atencao', 'Drones: regras de aviação civil/registro e privacidade.', 'Aviso de responsabilidade; revisão manual de anúncios novos.'),
  r('eletronicos-tv-e-audio', 'cameras-de-seguranca', ['privacidade-videovigilancia'], 'revisao', 'Videovigilância: regras de privacidade/uso.', 'Aviso na ficha.'),
  r('celulares-e-telefones', 'baterias-e-pecas', ['baterias-mercadorias-perigosas'], 'revisao', 'Baterias de iões de lítio: restrições de transporte.', 'Marcar como mercadoria sensível no cálculo de envio.'),
  r(ENE, 'baterias-solares', ['baterias-mercadorias-perigosas', 'seguranca-eletrica'], 'atencao', 'Baterias (chumbo/lítio): transporte, manuseio e segurança elétrica.', 'Marcar como mercadoria sensível; exigir tensão/capacidade (já na matriz).'),
  r(ENE, 'paineis-solares', ['seguranca-eletrica'], 'informativo', 'Equipamento elétrico: especificações e instalação.', 'Potência/tensão (já na matriz).'),
  r(ENE, 'inversores', ['seguranca-eletrica'], 'revisao', 'Equipamento elétrico: tensão/potência corretas.', 'Já na matriz.'),
  r(ENE, 'sistemas-de-energia-de-emergencia', ['seguranca-eletrica', 'baterias-mercadorias-perigosas'], 'revisao', 'Sistemas com baterias.', 'Idem baterias.'),
  r('ferramentas-e-maquinas', 'geradores', ['seguranca-eletrica', 'baterias-mercadorias-perigosas'], 'revisao', 'Gerador: combustível (inflamável) e segurança.', 'Aviso de combustível; envio sem combustível.'),
  r('ferramentas-e-maquinas', 'equipamentos-de-protecao', ['homologacao-seguranca-individual'], 'revisao', 'EPI: normas de proteção.', 'Campo de norma/certificação (opcional).'),
  r(IND, 'equipamentos-de-seguranca', ['homologacao-seguranca-individual'], 'revisao', 'Equipamento de segurança (ex.: extintores, EPI).', 'Campo de norma/certificação (opcional).'),
  r('calcados', 'calcados-de-seguranca', ['homologacao-seguranca-individual'], 'revisao', 'Calçado de segurança (EPI): norma e classe de proteção.', 'Campo de norma (opcional).'),
  r(AUT, 'capacetes', ['homologacao-seguranca-individual'], 'atencao', 'Capacete: homologação determina a proteção real.', 'Exigir norma/homologação na ficha (decisão do dono).'),
  r(AUT, 'pneus', ['homologacao-seguranca-individual'], 'revisao', 'Pneu: índice de carga/velocidade e data de fabrico (segurança).', 'Dimensão já na matriz; avaliar data de fabrico.'),
  r(AUT, 'baterias-automotivas', ['baterias-mercadorias-perigosas'], 'revisao', 'Bateria de chumbo-ácido: transporte e descarte.', 'Marcar como mercadoria sensível.'),
  r(AUT, 'produtos-de-limpeza-automotiva', ['quimicos-rotulagem'], 'informativo', 'Químicos automotivos: rotulagem.', 'Aviso de uso.'),
  r(AUT, 'oleos-e-lubrificantes', ['quimicos-rotulagem'], 'informativo', 'Lubrificantes: rotulagem e descarte.', 'Aviso de uso.'),
  r(AGR, 'sementes', ['fitossanitario-sementes'], 'revisao', 'Sementes: normas fitossanitárias/biodiversidade para circulação.', 'Aviso de responsabilidade; sem espécies protegidas.'),
  r(AGR, 'fertilizantes', ['fitossanitario-sementes', 'quimicos-rotulagem'], 'atencao', 'Insumo químico agrícola: rotulagem e manuseio seguro.', 'Exigir aviso de uso; revisão manual.'),
  r('jardim-e-exterior', 'plantas-e-sementes', ['fitossanitario-sementes', 'patrimonio-cultural-fauna-flora'], 'revisao', 'Plantas/sementes: fitossanidade e espécies protegidas.', 'Aviso de responsabilidade.'),
  r(AGR, 'racoes-animais', ['racao-animal-sanidade'], 'revisao', 'Ração: composição e validade.', 'Validade na ficha.'),
  r(PET, 'racoes-para-caes', ['racao-animal-sanidade'], 'informativo', 'Ração: composição e validade.', 'Validade na ficha.'),
  r(PET, 'racoes-para-gatos', ['racao-animal-sanidade'], 'informativo', 'Ração: composição e validade.', 'Validade na ficha.'),
  r(PET, 'higiene-animal', ['quimicos-rotulagem'], 'informativo', 'Produtos de higiene animal: rotulagem.', 'Aviso de uso.'),
  r('bolsas-malas-e-acessorios', 'joias-e-bijuterias', ['materiais-preciosos'], 'revisao', 'Joias: pureza de metais/pedras e prevenção a fraude.', 'Campo de material (na matriz); política de autenticidade.'),
  r('produtos-tradicionais-e-artesanato', 'artigos-de-madeira', ['patrimonio-cultural-fauna-flora'], 'revisao', 'Madeira: legalidade de exploração/espécies protegidas.', 'Aviso de responsabilidade sobre origem.'),
  r('produtos-tradicionais-e-artesanato', 'produtos-culturais', ['patrimonio-cultural-fauna-flora'], 'revisao', 'Objetos culturais: patrimônio e exportação; materiais de origem animal (ex.: marfim) proibidos.', 'Aviso de proibição de materiais de fauna protegida.'),
  r('produtos-tradicionais-e-artesanato', 'instrumentos-tradicionais', ['patrimonio-cultural-fauna-flora'], 'informativo', 'Instrumentos artesanais: materiais.', 'Aviso de materiais.'),
  r('cozinha-e-utilidades-domesticas', 'facas-e-utensilios', ['objetos-cortantes'], 'informativo', 'Objeto cortante: restrição de envio/idade na compra.', 'Aviso de manuseio.'),
];
