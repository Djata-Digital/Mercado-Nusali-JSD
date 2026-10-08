/**
 * Taxonomia oficial do Mercado Nusali: 30 categorias principais e 292 subcategorias (322 no total), aprovadas pelo proprietário.
 *
 * Esta é a ÚNICA fonte de verdade da estrutura: `scripts/seed-categories.ts` a grava no banco (dry-run por padrão, idempotente).
 * Nada aqui roda sozinho: nem o servidor nem o deploy gravam categorias.
 *
 * Regras de identidade (estáveis; não mude depois de publicadas, pois viram URLs e chaves):
 *   - slug da categoria principal  = slugify(nome)                       ex.: "moda-feminina"
 *   - slug da subcategoria         = `${slug da principal}-${slugify(nome)}`  ex.: "moda-feminina-calcas"
 *     (o prefixo garante unicidade: "Calças", "Casacos", "Roupas tradicionais africanas", "Roupas esportivas" e "Instrumentos
 *      tradicionais" aparecem em mais de uma principal e o índice de slug é único)
 *   - id                           = `cat_nsl_${slug}`  (determinístico: reexecutar nunca duplica)
 * Não existe "Atacado" (atacado/varejo são modalidades do mesmo produto). Medicamentos controlados, armas e itens ilegais não entram.
 */

export const TAXONOMY_ID_PREFIX = 'cat_nsl_';

export interface TaxonomyNode {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  icon: string;
  displayOrder: number;
}

interface TaxonomyRootSpec {
  name: string;
  /** Ícone já suportado pelo Header/Home/Categorias (Smartphone, Laptop, Tv, Zap, Activity, Wrench, Home); demais usam o padrão "Tag". */
  icon?: string;
  subs: string[];
}

export function slugifyCategoryName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

export const CATEGORY_TAXONOMY_SPEC: TaxonomyRootSpec[] = [
  { name: 'Celulares e Telefones', icon: 'Smartphone', subs: ['Smartphones', 'Celulares básicos', 'Capas e películas', 'Carregadores e cabos', 'Baterias e peças', 'Smartwatches', 'Acessórios para celulares', 'Telefones fixos', 'Rádios comunicadores'] },
  { name: 'Informática e Computadores', icon: 'Laptop', subs: ['Notebooks', 'Computadores de mesa', 'Tablets', 'Monitores', 'Teclados e mouses', 'Impressoras e scanners', 'Cartuchos e toners', 'Discos SSD e HD', 'Memórias e processadores', 'Redes e roteadores', 'Acessórios de informática'] },
  { name: 'Eletrônicos, TV e Áudio', icon: 'Tv', subs: ['Televisores', 'Projetores', 'Caixas de som', 'Fones de ouvido', 'Home theater', 'Câmeras digitais', 'Câmeras de segurança', 'Drones', 'Acessórios de áudio e vídeo', 'Controles remotos'] },
  { name: 'Eletrodomésticos', icon: 'Home', subs: ['Geladeiras e frigoríficos', 'Congeladores e arcas', 'Fogões e fornos', 'Micro-ondas', 'Máquinas de lavar', 'Ventiladores', 'Ar-condicionado', 'Liquidificadores', 'Ferros de passar', 'Pequenos eletrodomésticos', 'Peças e acessórios'] },
  { name: 'Moda Feminina', subs: ['Vestidos', 'Blusas e camisetas', 'Saias', 'Calças', 'Conjuntos', 'Roupas tradicionais africanas', 'Roupas íntimas', 'Moda praia', 'Roupas esportivas', 'Casacos'] },
  { name: 'Moda Masculina', subs: ['Camisas', 'Camisetas e polos', 'Calças', 'Bermudas', 'Fatos e blazers', 'Roupas tradicionais africanas', 'Roupa íntima', 'Roupa esportiva', 'Casacos', 'Uniformes'] },
  { name: 'Calçados', subs: ['Sapatos masculinos', 'Sapatos femininos', 'Tênis', 'Sandálias', 'Chinelos', 'Botas', 'Calçados infantis', 'Calçados de segurança', 'Acessórios para calçados'] },
  { name: 'Bolsas, Malas e Acessórios', subs: ['Bolsas femininas', 'Mochilas', 'Malas de viagem', 'Carteiras', 'Cintos', 'Bonés e chapéus', 'Óculos de sol', 'Relógios', 'Joias e bijuterias', 'Acessórios de cabelo'] },
  { name: 'Beleza e Cuidados Pessoais', subs: ['Perfumes', 'Maquiagem', 'Cuidados com a pele', 'Produtos capilares', 'Cabelos e extensões', 'Perucas', 'Barbearia', 'Manicure e pedicure', 'Higiene pessoal', 'Equipamentos de salão'] },
  { name: 'Supermercado e Mercearia', subs: ['Arroz e cereais', 'Farinha e massas', 'Óleos alimentares', 'Açúcar e sal', 'Conservas e enlatados', 'Leite e derivados', 'Café, chá e cacau', 'Bolachas e doces', 'Temperos e condimentos', 'Produtos de limpeza', 'Produtos de higiene doméstica'] },
  { name: 'Alimentos Frescos e Bebidas', subs: ['Frutas', 'Legumes e verduras', 'Tubérculos', 'Carnes', 'Peixes e mariscos', 'Ovos', 'Produtos congelados', 'Água mineral', 'Sumos e refrigerantes', 'Bebidas não alcoólicas', 'Produtos alimentares locais'] },
  { name: 'Casa, Móveis e Decoração', icon: 'Home', subs: ['Sofás e poltronas', 'Mesas e cadeiras', 'Camas e colchões', 'Guarda-roupas', 'Estantes e armários', 'Móveis de escritório', 'Tapetes e cortinas', 'Decoração', 'Iluminação', 'Organização doméstica', 'Artigos para banheiro'] },
  { name: 'Cozinha e Utilidades Domésticas', subs: ['Panelas', 'Pratos e tigelas', 'Copos e canecas', 'Talheres', 'Facas e utensílios', 'Recipientes e conservação', 'Garrafas térmicas', 'Utensílios de limpeza', 'Acessórios de cozinha'] },
  { name: 'Construção e Materiais', icon: 'Wrench', subs: ['Cimento e argamassa', 'Ferro e aço', 'Blocos e tijolos', 'Areia e brita', 'Telhas e coberturas', 'Portas e janelas', 'Tintas e vernizes', 'Canalização e hidráulica', 'Materiais elétricos', 'Pisos e revestimentos', 'Louças sanitárias'] },
  { name: 'Ferramentas e Máquinas', icon: 'Wrench', subs: ['Ferramentas manuais', 'Ferramentas elétricas', 'Furadeiras', 'Serras', 'Máquinas de solda', 'Compressores', 'Geradores', 'Equipamentos de oficina', 'Equipamentos de proteção', 'Peças para máquinas'] },
  { name: 'Energia Solar e Eletricidade', icon: 'Zap', subs: ['Painéis solares', 'Baterias solares', 'Inversores', 'Controladores de carga', 'Kits solares', 'Lâmpadas solares', 'Cabos e conectores', 'Estabilizadores e UPS', 'Sistemas de energia de emergência'] },
  { name: 'Automóveis, Motos e Peças', subs: ['Peças de automóveis', 'Peças de motocicletas', 'Pneus', 'Baterias automotivas', 'Óleos e lubrificantes', 'Acessórios automotivos', 'Capacetes', 'Ferramentas automotivas', 'Som automotivo', 'Produtos de limpeza automotiva'] },
  { name: 'Agricultura e Pecuária', subs: ['Sementes', 'Fertilizantes', 'Ferramentas agrícolas', 'Máquinas agrícolas', 'Irrigação', 'Equipamentos para pesca', 'Equipamentos de pecuária', 'Rações animais', 'Produtos para horticultura', 'Armazenamento agrícola'] },
  { name: 'Bebês e Crianças', subs: ['Roupas para bebês', 'Fraldas', 'Produtos de higiene infantil', 'Mamadeiras', 'Carrinhos de bebê', 'Berços', 'Cadeiras infantis', 'Alimentação infantil', 'Acessórios para maternidade', 'Segurança infantil'] },
  { name: 'Brinquedos e Jogos', subs: ['Bonecas', 'Carrinhos de brinquedo', 'Brinquedos educativos', 'Jogos de tabuleiro', 'Quebra-cabeças', 'Brinquedos eletrônicos', 'Bicicletas infantis', 'Pelúcias', 'Brinquedos de exterior', 'Jogos tradicionais'] },
  { name: 'Esportes e Fitness', icon: 'Activity', subs: ['Futebol', 'Basquetebol', 'Corrida', 'Ciclismo', 'Equipamentos de ginástica', 'Roupas esportivas', 'Bolas e acessórios', 'Artes marciais', 'Camping', 'Pesca esportiva'] },
  { name: 'Livros, Papelaria e Educação', subs: ['Livros escolares', 'Livros universitários', 'Literatura', 'Livros religiosos', 'Cadernos', 'Canetas e lápis', 'Mochilas escolares', 'Materiais didáticos', 'Artigos de escritório', 'Materiais de desenho'] },
  { name: 'Saúde e Bem-estar', subs: ['Primeiros socorros', 'Termômetros', 'Medidores de pressão', 'Produtos ortopédicos', 'Mobilidade e acessibilidade', 'Máscaras e luvas', 'Higiene e prevenção', 'Equipamentos de cuidados pessoais'] },
  { name: 'Pet Shop e Animais', subs: ['Rações para cães', 'Rações para gatos', 'Acessórios para animais', 'Coleiras e guias', 'Camas para animais', 'Higiene animal', 'Aquários', 'Gaiolas', 'Brinquedos para animais'] },
  { name: 'Festas e Eventos', subs: ['Decoração de festas', 'Balões', 'Artigos de casamento', 'Artigos de aniversário', 'Lembranças', 'Utensílios descartáveis', 'Equipamentos de som', 'Iluminação para eventos', 'Tendas e coberturas', 'Artigos religiosos para eventos'] },
  { name: 'Indústria, Comércio e Escritório', subs: ['Equipamentos comerciais', 'Máquinas industriais', 'Equipamentos para restaurantes', 'Balanças comerciais', 'Embalagens', 'Máquinas de costura', 'Equipamentos de escritório', 'Uniformes profissionais', 'Materiais de armazenagem', 'Equipamentos de segurança'] },
  { name: 'Produtos Tradicionais e Artesanato', subs: ['Tecidos africanos', 'Panos tradicionais', 'Artesanato guineense', 'Cestos e cestaria', 'Artigos de madeira', 'Bijuterias artesanais', 'Instrumentos tradicionais', 'Decoração africana', 'Produtos culturais', 'Lembranças regionais'] },
  { name: 'Jardim e Exterior', subs: ['Plantas e sementes', 'Vasos', 'Ferramentas de jardinagem', 'Mangueiras', 'Mobiliário exterior', 'Iluminação exterior', 'Cercas', 'Equipamentos de rega', 'Decoração de jardim'] },
  { name: 'Instrumentos Musicais', subs: ['Guitarras', 'Teclados musicais', 'Baterias e percussão', 'Microfones', 'Mesas de som', 'Instrumentos tradicionais', 'Acessórios musicais', 'Equipamentos de gravação'] },
  { name: 'Games e Consoles', subs: ['Consoles de jogos', 'Jogos físicos', 'Controles', 'Acessórios para consoles', 'Equipamentos gamer', 'Peças para consoles'] },
];

/** Lista plana (pais antes dos filhos) com ids, slugs e ordem de exibição determinísticos: 30 + 292 = 322 nós. */
export function buildCategoryTaxonomy(): TaxonomyNode[] {
  const nodes: TaxonomyNode[] = [];
  CATEGORY_TAXONOMY_SPEC.forEach((root, ri) => {
    const rootSlug = slugifyCategoryName(root.name);
    const rootId = `${TAXONOMY_ID_PREFIX}${rootSlug}`;
    nodes.push({ id: rootId, slug: rootSlug, name: root.name, parentId: null, icon: root.icon || 'Tag', displayOrder: (ri + 1) * 10 });
    root.subs.forEach((sub, si) => {
      const slug = `${rootSlug}-${slugifyCategoryName(sub)}`;
      nodes.push({ id: `${TAXONOMY_ID_PREFIX}${slug}`, slug, name: sub, parentId: rootId, icon: 'Tag', displayOrder: (si + 1) * 10 });
    });
  });
  return nodes;
}

export const TAXONOMY_EXPECTED = { roots: 30, subcategories: 292, total: 322 } as const;
