/**
 * Regras PURAS das definições de atributos de categoria (Fase 2 do sistema de atributos).
 * Compartilhadas pelo servidor (attributeDefinitionService), pelos testes e pelo modal do admin (validação em tempo real),
 * para que a tela e a API nunca divirjam. Sem rede, sem banco, sem React.
 */

export const ATTRIBUTE_TYPES = ['text', 'number', 'select', 'multiselect', 'boolean'] as const;
export type AttributeType = (typeof ATTRIBUTE_TYPES)[number];

export const ATTRIBUTE_ROLES = ['spec', 'variant_axis'] as const;
export type AttributeRole = (typeof ATTRIBUTE_ROLES)[number];

export const ATTRIBUTE_TYPE_LABELS: Record<AttributeType, string> = {
  text: 'Texto',
  number: 'Número',
  select: 'Seleção única',
  multiselect: 'Múltipla seleção',
  boolean: 'Sim / Não',
};

export const ATTRIBUTE_ROLE_LABELS: Record<AttributeRole, string> = {
  spec: 'Especificação',
  variant_axis: 'Eixo de variante',
};

/** Um eixo de variante tem UM valor por variante: seleção única, texto curto ou número (não múltipla seleção nem Sim/Não). */
export const AXIS_ALLOWED_TYPES: readonly AttributeType[] = ['select', 'text', 'number'];
/** Tipos que podem virar filtro no catálogo (uso futuro); texto livre não filtra bem. */
export const FILTERABLE_TYPES: readonly AttributeType[] = ['select', 'multiselect', 'number', 'boolean'];

export const ATTRIBUTE_LIMITS = {
  name: 255,
  code: 64,
  option: 100,
  optionsMax: 200,
  unit: 50,
  placeholder: 255,
  helpText: 2000,
  displayGroup: 100,
  maxLengthCap: 2000,
  sortOrderAbs: 10000,
  numericAbs: 1e12,
} as const;

/** Código estável: minúsculas, começa por letra, só a-z, 0-9 e "_", 2 a 64 caracteres. */
export const ATTRIBUTE_CODE_REGEX = /^[a-z][a-z0-9_]{1,63}$/;

/**
 * Códigos reservados: já são campos GERAIS do produto (ou colunas dele). Um atributo com esses códigos duplicaria o campo geral na
 * página pública e no cadastro (o assistente do vendedor já injeta Marca, Modelo, Condição, Peso, Dimensões, Garantia e Armazém).
 */
export const RESERVED_ATTRIBUTE_CODES: ReadonlySet<string> = new Set([
  'id', 'sku', 'slug', 'status',
  'marca', 'brand', 'modelo', 'model',
  'condicao', 'condition',
  'peso', 'weight', 'dimensoes', 'dimensions', 'comprimento', 'largura', 'altura',
  'garantia', 'warranty', 'armazem', 'warehouse',
  'preco', 'price', 'preco_original', 'original_price', 'moeda', 'currency',
  'estoque', 'stock',
  'titulo', 'title', 'descricao', 'description',
  'categoria', 'category', 'loja', 'store', 'vendedor', 'seller',
  'imagem', 'image', 'imagens', 'images', 'video', 'videos',
  'frete', 'frete_gratis', 'free_shipping', 'pais', 'country',
  'avaliacao', 'rating',
]);

export interface FieldError {
  field: string;
  message: string;
}

/** Deriva um código a partir do nome (mesma base usada até aqui pelo admin): sem acento, minúsculas, "_" no lugar de símbolos. */
export function deriveAttributeCode(name: string): string {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/(^_|_$)+/g, '');
}

/** Normaliza o código informado (ou derivado do nome quando vazio). Não valida: use validateAttributeCode. */
export function normalizeAttributeCode(code: unknown, name?: unknown): string {
  const raw = typeof code === 'string' && code.trim() ? code : String(name ?? '');
  return deriveAttributeCode(raw);
}

export function validateAttributeCode(code: string): string | null {
  if (!code) return 'O código é obrigatório. Informe um código com letras minúsculas, números e "_" (ex.: memoria_ram).';
  if (!ATTRIBUTE_CODE_REGEX.test(code)) {
    if (/^[0-9_]/.test(code)) return 'O código deve começar com uma letra (ex.: memoria_ram, não 8gb_ram).';
    if (code.length < 2) return 'O código precisa ter pelo menos 2 caracteres.';
    if (code.length > ATTRIBUTE_LIMITS.code) return `O código pode ter no máximo ${ATTRIBUTE_LIMITS.code} caracteres.`;
    return 'O código deve ter apenas letras minúsculas, números e "_".';
  }
  if (RESERVED_ATTRIBUTE_CODES.has(code)) {
    return `O código "${code}" é reservado: já existe como campo geral do produto. Escolha outro código (ex.: ${code}_especifico).`;
  }
  return null;
}

/**
 * Normaliza as opções de seleção. Aceita: lista de textos, lista de objetos { label | value }, texto JSON, ou texto com uma opção por
 * linha. Devolve SEMPRE uma lista de textos (o formato atual de armazenamento; a estrutura {value,label} chega na Fase 3 sem migração
 * de dados, porque este normalizador já aceita os dois formatos). Retira espaços, remove vazias e duplicadas (sem diferenciar caixa).
 */
export function parseOptionList(raw: unknown): string[] {
  let value: unknown = raw;
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t) return [];
    try {
      const parsed = JSON.parse(t);
      value = parsed;
    } catch {
      value = t.split(/\r?\n/);
    }
  }
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const text = typeof item === 'string' ? item : item && typeof item === 'object' ? String((item as any).label ?? (item as any).value ?? '') : String(item ?? '');
    const clean = text.trim();
    if (!clean) continue;
    const key = clean.toLocaleLowerCase('pt-BR');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

/** Erros de opções (sobre a lista JÁ normalizada). */
export function validateOptionList(options: string[]): string[] {
  const errors: string[] = [];
  if (options.length > ATTRIBUTE_LIMITS.optionsMax) errors.push(`No máximo ${ATTRIBUTE_LIMITS.optionsMax} opções por atributo.`);
  const tooLong = options.filter((o) => o.length > ATTRIBUTE_LIMITS.option);
  if (tooLong.length) errors.push(`Cada opção pode ter no máximo ${ATTRIBUTE_LIMITS.option} caracteres (ex.: "${tooLong[0].slice(0, 30)}…").`);
  const withComma = options.filter((o) => o.includes(','));
  if (withComma.length) errors.push(`As opções não podem conter vírgula ("${withComma[0]}"): a múltipla seleção separa os valores por vírgula. Use "e" ou ponto e vírgula.`);
  return errors;
}

/** Rascunho já tipado (o que o serviço valida; a tela monta o mesmo formato). */
export interface AttributeDraft {
  name: string;
  code: string;
  type: string;
  role: string;
  isRequired: boolean;
  isActive: boolean;
  options: string[];
  unit: string | null;
  placeholder: string | null;
  helpText: string | null;
  displayGroup: string | null;
  sortOrder: number;
  minValue: number | null;
  maxValue: number | null;
  maxLength: number | null;
  decimals: number | null;
  isFilterable: boolean;
}

const isSelect = (t: string) => t === 'select' || t === 'multiselect';

/** Validação de CAMPOS (sem banco). Devolve todos os erros de uma vez, para a tela marcar cada campo. */
export function validateAttributeDraft(d: AttributeDraft): FieldError[] {
  const errors: FieldError[] = [];
  const add = (field: string, message: string) => errors.push({ field, message });

  const name = (d.name ?? '').trim();
  if (!name) add('name', 'O nome do atributo é obrigatório.');
  else if (name.length > ATTRIBUTE_LIMITS.name) add('name', `O nome pode ter no máximo ${ATTRIBUTE_LIMITS.name} caracteres.`);

  const codeError = validateAttributeCode(d.code);
  if (codeError) add('code', codeError);

  if (!(ATTRIBUTE_TYPES as readonly string[]).includes(d.type)) add('type', `Tipo inválido. Use: ${ATTRIBUTE_TYPES.join(', ')}.`);
  if (!(ATTRIBUTE_ROLES as readonly string[]).includes(d.role)) add('role', 'Função inválida. Use "Especificação" ou "Eixo de variante".');
  else if (d.role === 'variant_axis' && (ATTRIBUTE_TYPES as readonly string[]).includes(d.type) && !AXIS_ALLOWED_TYPES.includes(d.type as AttributeType)) {
    add('role', 'Um eixo de variante tem um único valor por variante: use seleção única, texto ou número.');
  }

  if (isSelect(d.type)) {
    if (d.options.length === 0) add('options', 'Informe ao menos uma opção para a seleção.');
    for (const msg of validateOptionList(d.options)) add('options', msg);
  } else if (d.options.length > 0) {
    add('options', 'Opções só se aplicam a seleção única e múltipla seleção.');
  }

  const finite = (n: number | null) => n === null || (Number.isFinite(n) && Math.abs(n) < ATTRIBUTE_LIMITS.numericAbs);
  if (d.type !== 'number') {
    if (d.minValue !== null) add('minValue', 'O valor mínimo só se aplica a atributos numéricos.');
    if (d.maxValue !== null) add('maxValue', 'O valor máximo só se aplica a atributos numéricos.');
    if (d.decimals !== null) add('decimals', 'As casas decimais só se aplicam a atributos numéricos.');
  } else {
    if (!finite(d.minValue)) add('minValue', 'Valor mínimo inválido.');
    if (!finite(d.maxValue)) add('maxValue', 'Valor máximo inválido.');
    if (d.minValue !== null && d.maxValue !== null && finite(d.minValue) && finite(d.maxValue) && d.minValue > d.maxValue) add('maxValue', 'O valor máximo deve ser maior ou igual ao mínimo.');
    if (d.decimals !== null && (!Number.isInteger(d.decimals) || d.decimals < 0 || d.decimals > 6)) add('decimals', 'As casas decimais devem ser um inteiro de 0 a 6.');
  }

  if (d.type !== 'text') {
    if (d.maxLength !== null) add('maxLength', 'O tamanho máximo só se aplica a atributos de texto.');
  } else if (d.maxLength !== null && (!Number.isInteger(d.maxLength) || d.maxLength < 1 || d.maxLength > ATTRIBUTE_LIMITS.maxLengthCap)) {
    add('maxLength', `O tamanho máximo deve ser um inteiro de 1 a ${ATTRIBUTE_LIMITS.maxLengthCap}.`);
  }

  if (d.isFilterable && (ATTRIBUTE_TYPES as readonly string[]).includes(d.type) && !FILTERABLE_TYPES.includes(d.type as AttributeType)) {
    add('isFilterable', 'Atributos de texto livre não podem ser usados como filtro. Use seleção, número ou Sim/Não.');
  }

  if (d.unit && d.unit.length > ATTRIBUTE_LIMITS.unit) add('unit', `A unidade pode ter no máximo ${ATTRIBUTE_LIMITS.unit} caracteres.`);
  if (d.placeholder && d.placeholder.length > ATTRIBUTE_LIMITS.placeholder) add('placeholder', `O placeholder pode ter no máximo ${ATTRIBUTE_LIMITS.placeholder} caracteres.`);
  if (d.helpText && d.helpText.length > ATTRIBUTE_LIMITS.helpText) add('helpText', `O texto de ajuda pode ter no máximo ${ATTRIBUTE_LIMITS.helpText} caracteres.`);
  if (d.displayGroup && d.displayGroup.length > ATTRIBUTE_LIMITS.displayGroup) add('displayGroup', `O grupo pode ter no máximo ${ATTRIBUTE_LIMITS.displayGroup} caracteres.`);
  if (!Number.isInteger(d.sortOrder) || Math.abs(d.sortOrder) > ATTRIBUTE_LIMITS.sortOrderAbs) add('sortOrder', `A ordem deve ser um inteiro entre -${ATTRIBUTE_LIMITS.sortOrderAbs} e ${ATTRIBUTE_LIMITS.sortOrderAbs}.`);

  return errors;
}

/** Converte "" / null / undefined em null; senão número (NaN vira NaN para a validação acusar). */
export function toNullableNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return n;
}

export function toNullableText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

/**
 * Monta o rascunho tipado a partir de um corpo de requisição/formulário (campos ausentes assumem os padrões). Usado pelo serviço e
 * pela tela. Para PATCH, o serviço funde o corpo ao registro existente ANTES de chamar esta função.
 */
export function buildAttributeDraft(input: Record<string, any>): AttributeDraft {
  const type = typeof input.type === 'string' && input.type ? input.type : 'text';
  const options = isSelect(type) || input.options !== undefined || input.optionsJson !== undefined ? parseOptionList(input.options ?? input.optionsJson) : [];
  return {
    name: String(input.name ?? '').trim(),
    code: normalizeAttributeCode(input.code, input.name),
    type,
    role: typeof input.role === 'string' && input.role ? input.role : 'spec',
    isRequired: Boolean(input.isRequired),
    isActive: input.isActive !== false,
    options,
    unit: toNullableText(input.unit),
    placeholder: toNullableText(input.placeholder),
    helpText: toNullableText(input.helpText),
    displayGroup: toNullableText(input.displayGroup),
    sortOrder: input.sortOrder === undefined || input.sortOrder === null || input.sortOrder === '' ? 0 : Number(input.sortOrder),
    minValue: toNullableNumber(input.minValue),
    maxValue: toNullableNumber(input.maxValue),
    maxLength: toNullableNumber(input.maxLength),
    decimals: toNullableNumber(input.decimals),
    isFilterable: Boolean(input.isFilterable),
  };
}

/** true se `next` AFROUXA (ou mantém) o limite de `prev`; usado para permitir mudanças compatíveis com valores já gravados. */
export function isLimitLoosened(prev: number | null, next: number | null, kind: 'min' | 'max'): boolean {
  if (prev === null) return next === null; // ter limite onde não havia é restringir
  if (next === null) return true; // remover o limite afrouxa
  return kind === 'min' ? next <= prev : next >= prev;
}
