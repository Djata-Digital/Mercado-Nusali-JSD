/**
 * FASE 8A — biblioteca de listas de opções e construtores da matriz de atributos.
 * Português europeu/africano (Guiné-Bissau): "Cinzento", "Castanho", "Ecrã", "Sumos". Opções sem vírgula, até 100 caracteres.
 */
import type { CategoryPlan, MatrixAttribute, MatrixAttributeType, MatrixOverride } from './types.js';

// ------------------------------------------------------------------------------------------------ listas de opções
export const COR = ['Preto', 'Branco', 'Cinzento', 'Prateado', 'Dourado', 'Azul', 'Azul-marinho', 'Verde', 'Vermelho', 'Amarelo', 'Laranja', 'Rosa', 'Roxo', 'Castanho', 'Bege', 'Multicolorido', 'Estampado'];
export const COR_TRANSPARENTE = [...COR, 'Transparente'];
export const SIM_NAO_NA = ['Sim', 'Não'];

export const TAM_ROUPA_LETRAS = ['Único', 'PP', 'P', 'M', 'G', 'GG', 'XG', 'XXG'];
export const TAM_ROUPA_NUMEROS = ['34', '36', '38', '40', '42', '44', '46', '48', '50', '52', '54'];
export const TAM_ROUPA = [...TAM_ROUPA_LETRAS, ...TAM_ROUPA_NUMEROS];
export const TAM_BEBE = ['Prematuro', '0-3 meses', '3-6 meses', '6-9 meses', '9-12 meses', '12-18 meses', '18-24 meses'];
export const TAM_CRIANCA = ['2 anos', '3 anos', '4 anos', '5 anos', '6 anos', '7 anos', '8 anos', '10 anos', '12 anos', '14 anos', '16 anos'];
export const TAM_BEBE_CRIANCA = [...TAM_BEBE, ...TAM_CRIANCA];
export const NUM_CALCADO_ADULTO = ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47'];
export const NUM_CALCADO_INFANTIL = ['17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34'];
export const TAM_SUTIA = ['70', '75', '80', '85', '90', '95', '100'];

export const ARMAZENAMENTO = ['16 GB', '32 GB', '64 GB', '128 GB', '256 GB', '512 GB', '1 TB', '2 TB'];
export const RAM_GB = ['2 GB', '3 GB', '4 GB', '6 GB', '8 GB', '12 GB', '16 GB', '32 GB', '64 GB'];
export const VOLTAGEM = ['220V', '110V', 'Bivolt (110-240V)', '12V', '24V'];
export const VOLTAGEM_REDE = ['220V', '110V', 'Bivolt (110-240V)'];
export const LITROS_BOTIJA = ['3 kg', '6 kg', '12.5 kg', '13 kg', '45 kg'];

export const MATERIAL_TECIDO = ['Algodão', 'Poliéster', 'Linho', 'Seda', 'Lã', 'Jeans', 'Cetim', 'Renda', 'Viscose', 'Malha', 'Misto'];
export const MATERIAL_TECIDO_AFRICANO = ['Bazin', 'Wax (tecido africano)', 'Capulana', 'Pano de pinti', 'Algodão', 'Seda', 'Misto'];
export const MATERIAL_COURO = ['Couro natural', 'Couro sintético', 'Lona', 'Nylon', 'Plástico', 'Palha', 'Borracha', 'Outro'];
export const MATERIAL_UTENSILIO = ['Aço inoxidável', 'Alumínio', 'Ferro fundido', 'Plástico', 'Vidro', 'Cerâmica', 'Porcelana', 'Madeira', 'Silicone', 'Barro'];
export const MATERIAL_MOVEL = ['Madeira maciça', 'MDF', 'Metal', 'Plástico', 'Vime/Rattan', 'Estofado', 'Vidro', 'Misto'];

// ------------------------------------------------------------------------------------------------ construtores
interface Common {
  required?: boolean;
  unit?: string;
  group?: string;
  help?: string;
  placeholder?: string;
  /** Padrão: select/multiselect/boolean filtram; number e text não. */
  filter?: boolean;
  /** select obrigatório com lista fechada por natureza: não recebe a opção de saída "Outro". */
  closed?: boolean;
}
type NoOrder = Omit<MatrixAttribute, 'order'>;

const base = (code: string, name: string, type: MatrixAttributeType, o: Common): NoOrder => ({
  code,
  name,
  type,
  role: 'spec',
  required: Boolean(o.required),
  ...(o.unit ? { unit: o.unit } : {}),
  ...(o.group ? { group: o.group } : {}),
  ...(o.help ? { help: o.help } : {}),
  ...(o.placeholder ? { placeholder: o.placeholder } : {}),
  filterable: o.filter ?? (type === 'select' || type === 'multiselect' || type === 'boolean'),
  ...(o.closed ? { closed: true } : {}),
});

export const text = (code: string, name: string, o: Common & { maxLength?: number } = {}): NoOrder => ({ ...base(code, name, 'text', { ...o, filter: false }), ...(o.maxLength ? { maxLength: o.maxLength } : {}) });
/** Opção de saída. Todo select OBRIGATÓRIO a recebe (v2): o vendedor cujo produto não está na lista não pode ficar impedido de anunciar. */
export const ESCAPE_OPTION = 'Outro';
export const hasEscapeOption = (options: readonly string[]) => options.some((x) => /^(outro|outra|outros|outras|n[ãa]o se aplica)\b/i.test(x.trim()));
export const sel = (code: string, name: string, options: string[], o: Common = {}): NoOrder => ({ ...base(code, name, 'select', o), options: o.required && !o.closed && !hasEscapeOption(options) ? [...options, ESCAPE_OPTION] : options });
export const multi = (code: string, name: string, options: string[], o: Common = {}): NoOrder => ({ ...base(code, name, 'multiselect', o), options });
export const yesno = (code: string, name: string, o: Common = {}): NoOrder => base(code, name, 'boolean', o);
export const num = (code: string, name: string, o: Common & { min?: number; max?: number; decimals?: number } = {}): NoOrder => ({
  ...base(code, name, 'number', o),
  ...(o.min !== undefined ? { min: o.min } : {}),
  ...(o.max !== undefined ? { max: o.max } : {}),
  ...(o.decimals !== undefined ? { decimals: o.decimals } : {}),
});

/** Eixo de variante. `select` (com opções), `text` (livre) ou `number`. Sempre filtrável quando é select. */
export const axisSel = (code: string, name: string, options: string[], o: Common = {}): NoOrder => ({ ...base(code, name, 'select', { ...o, filter: o.filter ?? true }), role: 'variant_axis', options });
export const axisText = (code: string, name: string, o: Common & { maxLength?: number } = {}): NoOrder => ({ ...base(code, name, 'text', { ...o, filter: false }), role: 'variant_axis', ...(o.maxLength ? { maxLength: o.maxLength } : {}) });

/** Eixos mais comuns (códigos que o assistente reconhece: cor -> Cor, tamanho -> 2ª dimensão, capacidade -> Capacidade). */
export const axCor = (required = true, options: string[] = COR, name = 'Cor'): NoOrder => axisSel('cor', name, options, { required, help: 'Escolha a cor de cada variação.' });
export const axTamanho = (name: string, options: string[], required = true, help?: string): NoOrder => axisSel('tamanho', name, options, { required, ...(help ? { help } : {}) });
export const axCapacidade = (name: string, options: string[], required = true, help?: string): NoOrder => axisSel('capacidade', name, options, { required, ...(help ? { help } : {}) });
export const axVoltagem = (options: string[] = VOLTAGEM_REDE, required = false): NoOrder => axisSel('voltagem', 'Voltagem', options, { required, help: 'Tensão de funcionamento do aparelho. Na Guiné-Bissau a rede é de 220V.' });

// ------------------------------------------------------------------------------------------------ plano
const withOrder = (list: NoOrder[]): MatrixAttribute[] => list.map((a, i) => ({ ...a, order: (i + 1) * 10 }));

export function plan(slug: string, p: { define?: NoOrder[]; override?: MatrixOverride[]; disable?: string[]; none?: string; note?: string } = {}): CategoryPlan {
  return {
    slug,
    define: withOrder(p.define ?? []),
    override: p.override ?? [],
    disable: p.disable ?? [],
    ...(p.none ? { noAttributesReason: p.none } : {}),
    ...(p.note ? { note: p.note } : {}),
  };
}

/** Raiz + subcategorias (slug de cada sub = `${raiz}-${sub}`, como na taxonomia real). */
export function root(rootSlug: string, p: { define?: NoOrder[]; note?: string; subs: Record<string, Parameters<typeof plan>[1]> }): CategoryPlan[] {
  return [
    plan(rootSlug, { define: p.define, note: p.note }),
    ...Object.entries(p.subs).map(([sub, sp]) => plan(`${rootSlug}-${sub}`, sp ?? {})),
  ];
}
