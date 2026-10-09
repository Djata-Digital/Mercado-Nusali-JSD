/**
 * ATRIBUTOS FASE 3 — validação PURA dos valores de atributos de um produto (sem banco, sem rede).
 *
 * Entrada: as definições EFETIVAS da categoria (resultado de resolveEffectiveAttributes) e o mapa de valores que o cliente envia
 * ({ [código ou nome]: valor }). Saída: valores normalizados e tipados, prontos para product_attribute_values, mais a "visão legada"
 * (texto) usada pelas tabelas/colunas antigas e pelo frontend atual durante a transição.
 *
 * Regras centrais:
 *  - `false` e `0` são valores válidos e preenchidos; só ausente, null, "" e lista vazia contam como vazio.
 *  - Só atributos EFETIVOS da categoria (herança + substituição explícita + "desativar aqui") aceitam valor.
 *  - Eixos de variante (role = variant_axis) não têm valor no produto: pertencem às variantes (Fase 7). Não são exigidos aqui.
 *  - Uma mesma definição recebida por duas chaves (código e nome) só passa se os valores forem iguais depois de normalizados.
 *  - Chaves que não são atributo (rótulos gerais legados como Marca/Peso, ou chaves desconhecidas) NUNCA viram valor tipado:
 *    voltam em `passthrough` para que a camada de compatibilidade as mantenha como antes; `strictUnknown` as recusa.
 */
import { ATTRIBUTE_LIMITS, RESERVED_ATTRIBUTE_CODES } from './attributeRules.js';
import { isOtherOption, normalizeOtherDetail, otherDetailMessage, splitOtherValue } from './attributeOther.js';

export const PRODUCT_ATTRIBUTES_INVALID = 'PRODUCT_ATTRIBUTES_INVALID';

/** Limites de entrada (defesa contra payload abusivo; bem acima de qualquer produto real). */
export const PRODUCT_ATTRIBUTE_INPUT_LIMITS = {
  maxKeys: 100,
  maxKeyLength: 100,
  defaultTextLength: 255,
  passthroughValueLength: 2000,
  numberStorageDecimals: 6, // numeric(18,6)
} as const;

export type ValidationErrorCode =
  | 'REQUIRED'
  | 'INVALID_TYPE'
  | 'INVALID_NUMBER'
  | 'OUT_OF_RANGE'
  | 'TOO_MANY_DECIMALS'
  | 'TOO_LONG'
  | 'INVALID_OPTION'
  | 'OTHER_DETAIL_REQUIRED'
  | 'MULTIPLE_VALUES'
  | 'INVALID_BOOLEAN'
  | 'CONFLICTING_VALUES'
  | 'UNKNOWN_ATTRIBUTE'
  | 'INVALID_INPUT';

export interface AttributeValueError {
  code: ValidationErrorCode;
  /** Código do atributo (ou a chave enviada, quando não há atributo). */
  field: string;
  attributeId?: string;
  message: string;
  hint?: string;
}

/** Subconjunto das definições efetivas de que o validador precisa (aceita a linha serializada de resolveEffectiveAttributes). */
export interface AttributeDefinitionLike {
  id: string;
  code: string;
  name: string;
  type: string;
  role?: string | null;
  isRequired?: boolean | null;
  isActive?: boolean | null;
  optionsJson?: unknown;
  unit?: string | null;
  minValue?: number | string | null;
  maxValue?: number | string | null;
  maxLength?: number | null;
  decimals?: number | null;
}

export interface NormalizedAttributeValue {
  attributeId: string;
  code: string;
  name: string;
  type: 'text' | 'number' | 'select' | 'multiselect' | 'boolean';
  /** text */
  valueText?: string;
  /** number, como texto decimal canônico (sem zeros à direita) */
  valueNumber?: string;
  /** boolean */
  valueBool?: boolean;
  /** select (1 item) / multiselect (≥1 itens, sem repetição, na ordem das opções da definição) */
  options?: string[];
  /** select na opção "Outro": a especificação informada (2ª linha do atributo em product_attribute_values, value_text). */
  otherDetail?: string;
  /** Representação em texto no formato legado ("Sim"/"Não", opções separadas por ", "). */
  legacyText: string;
}

export interface ValidationResult {
  values: NormalizedAttributeValue[];
  errors: AttributeValueError[];
  /** Chaves/valores que não pertencem a um atributo da categoria (rótulos gerais legados e desconhecidos). */
  passthrough: Record<string, string>;
  /** Subconjunto de `passthrough` formado por chaves realmente desconhecidas (não reservadas) — só para aviso/estrito. */
  unknownKeys: string[];
}

export interface ValidateOptions {
  /** Recusa chaves desconhecidas (não reservadas). Padrão: aceita e devolve em `passthrough` (compatibilidade de transição). */
  strictUnknown?: boolean;
  /** Nome da categoria, só para mensagens ("...obrigatório para a categoria X"). */
  categoryName?: string;
}

// --------------------------------------------------------------------------------------------------------------------------------
// Normalização de chaves e textos
// --------------------------------------------------------------------------------------------------------------------------------

/** minúsculas, sem acento, sem espaços nas pontas, símbolos viram "_" (mesma ideia de deriveAttributeCode). */
export function normalizeLookupKey(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Comparação de opções: sem caixa, sem acento, espaços colapsados. */
function optionKey(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.every((x) => isEmptyValue(x));
  if (typeof v === 'number') return Number.isNaN(v);
  return false; // boolean (inclusive false), número 0 e objetos NÃO são vazios
}

function definitionOptions(def: AttributeDefinitionLike): string[] {
  const raw = def.optionsJson;
  if (!Array.isArray(raw)) return [];
  return raw.map((o) => (typeof o === 'string' ? o : o && typeof o === 'object' ? String((o as any).label ?? (o as any).value ?? '') : String(o ?? ''))).filter((s) => s.trim() !== '');
}

function toFiniteNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// --------------------------------------------------------------------------------------------------------------------------------
// Validação por tipo
// --------------------------------------------------------------------------------------------------------------------------------

// (sem strictNullChecks no projeto, a união discriminada não estreita: tipo achatado)
interface Outcome { ok: boolean; value?: NormalizedAttributeValue; error?: AttributeValueError }

function fail(def: AttributeDefinitionLike, code: ValidationErrorCode, message: string, hint?: string): Outcome {
  return { ok: false, error: { code, field: def.code, attributeId: def.id, message, hint } };
}

function base(def: AttributeDefinitionLike, type: NormalizedAttributeValue['type'], legacyText: string): NormalizedAttributeValue {
  return { attributeId: def.id, code: def.code, name: def.name, type, legacyText };
}

function validateText(def: AttributeDefinitionLike, raw: unknown): Outcome {
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    return fail(def, 'INVALID_TYPE', `O atributo "${def.name}" deve ser um texto.`, 'Envie um texto simples.');
  }
  if (typeof raw === 'number' && !Number.isFinite(raw)) return fail(def, 'INVALID_TYPE', `O atributo "${def.name}" deve ser um texto.`);
  const text = String(raw).replace(/\r\n?/g, '\n').trim();
  const limit = Math.min(def.maxLength && def.maxLength > 0 ? def.maxLength : PRODUCT_ATTRIBUTE_INPUT_LIMITS.defaultTextLength, ATTRIBUTE_LIMITS.maxLengthCap);
  if (text.length > limit) {
    return fail(def, 'TOO_LONG', `O atributo "${def.name}" aceita no máximo ${limit} caracteres (recebeu ${text.length}).`, 'Encurte o texto.');
  }
  return { ok: true, value: { ...base(def, 'text', text), valueText: text } };
}

function validateNumber(def: AttributeDefinitionLike, raw: unknown): Outcome {
  let canonical: string;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return fail(def, 'INVALID_NUMBER', `O atributo "${def.name}" deve conter um número válido.`);
    canonical = String(raw);
    // números JS muito pequenos/grandes viram notação científica ("1e-7"): converte para decimal plano
    if (/e/i.test(canonical)) canonical = raw.toFixed(PRODUCT_ATTRIBUTE_INPUT_LIMITS.numberStorageDecimals + 2);
  } else if (typeof raw === 'string') {
    const s = raw.trim().replace(/\s+/g, '');
    // um único separador decimal (vírgula ou ponto); sem milhar, sem notação científica
    if (!/^[+-]?\d+([.,]\d+)?$/.test(s)) {
      return fail(def, 'INVALID_NUMBER', `O atributo "${def.name}" deve conter apenas um número válido.`, 'Use apenas dígitos e, se precisar, uma vírgula ou ponto decimal (ex.: 12,5).');
    }
    canonical = s.replace(',', '.').replace(/^\+/, '');
  } else {
    return fail(def, 'INVALID_TYPE', `O atributo "${def.name}" deve ser um número.`);
  }

  const n = Number(canonical);
  if (!Number.isFinite(n) || Math.abs(n) >= ATTRIBUTE_LIMITS.numericAbs) {
    return fail(def, 'OUT_OF_RANGE', `O valor de "${def.name}" está fora do intervalo suportado.`);
  }

  const maxDecimals = def.decimals !== null && def.decimals !== undefined ? def.decimals : PRODUCT_ATTRIBUTE_INPUT_LIMITS.numberStorageDecimals;
  const [intPart, fracPartRaw = ''] = canonical.replace(/^-/, '').split('.');
  const fracPart = fracPartRaw.replace(/0+$/, '');
  if (fracPart.length > maxDecimals) {
    return fail(def, 'TOO_MANY_DECIMALS', maxDecimals === 0
      ? `O atributo "${def.name}" aceita apenas números inteiros.`
      : `O atributo "${def.name}" aceita no máximo ${maxDecimals} ${maxDecimals === 1 ? 'casa decimal' : 'casas decimais'}.`, 'Reduza as casas decimais.');
  }

  const min = toFiniteNumber(def.minValue);
  const max = toFiniteNumber(def.maxValue);
  const unit = def.unit ? ` ${def.unit}` : '';
  if (min !== null && n < min) return fail(def, 'OUT_OF_RANGE', `O valor de "${def.name}" deve ser no mínimo ${min}${unit}.`);
  if (max !== null && n > max) return fail(def, 'OUT_OF_RANGE', `O valor de "${def.name}" deve ser no máximo ${max}${unit}.`);

  // forma canônica: sem sinal em zero, sem zeros à direita ("12.50" -> "12.5", "-0" -> "0")
  const negative = n < 0 && (Number(intPart) !== 0 || fracPart !== '');
  const normalized = `${negative ? '-' : ''}${intPart.replace(/^0+(?=\d)/, '')}${fracPart ? `.${fracPart}` : ''}`;
  return { ok: true, value: { ...base(def, 'number', normalized), valueNumber: normalized } };
}

const TRUE_WORDS = new Set(['true', 'sim', 's', 'yes', 'y', '1', 'verdadeiro']);
const FALSE_WORDS = new Set(['false', 'nao', 'n', 'no', '0', 'falso']);

function validateBoolean(def: AttributeDefinitionLike, raw: unknown): Outcome {
  let b: boolean | null = null;
  if (typeof raw === 'boolean') b = raw;
  else if (typeof raw === 'number') b = raw === 1 ? true : raw === 0 ? false : null;
  else if (typeof raw === 'string') {
    const k = normalizeLookupKey(raw);
    if (TRUE_WORDS.has(k)) b = true;
    else if (FALSE_WORDS.has(k)) b = false;
  }
  if (b === null) {
    return fail(def, 'INVALID_BOOLEAN', `O atributo "${def.name}" deve ser Sim ou Não.`, 'Use Sim/Não (ou true/false).');
  }
  return { ok: true, value: { ...base(def, 'boolean', b ? 'Sim' : 'Não'), valueBool: b } };
}

export function matchOption(options: string[], raw: unknown): string | null {
  const key = optionKey(raw);
  if (key === '') return null;
  // exato primeiro (preserva a grafia da definição), depois sem caixa/acento
  const exact = options.find((o) => o === String(raw).trim());
  if (exact !== undefined) return exact;
  return options.find((o) => optionKey(o) === key) ?? null;
}

/** Mesma frase do validador antigo (o assistente do vendedor mostra só a mensagem): lista as opções permitidas. */
function optionsSentence(options: string[]): string {
  return options.length ? ` Opções permitidas: ${options.join(', ')}.` : ' Este atributo não tem opções cadastradas.';
}

function validateSelect(def: AttributeDefinitionLike, raw: unknown, opts: ValidateValueOptions = {}): Outcome {
  const options = definitionOptions(def);
  let candidate: unknown = raw;
  if (Array.isArray(raw)) {
    const filled = raw.filter((x) => !isEmptyValue(x));
    if (filled.length > 1) return fail(def, 'MULTIPLE_VALUES', `O atributo "${def.name}" aceita apenas uma opção.`, 'Escolha uma única opção.');
    candidate = filled[0];
  }
  if (typeof candidate !== 'string' && typeof candidate !== 'number') {
    return fail(def, 'INVALID_TYPE', `O atributo "${def.name}" deve ser uma das opções permitidas.`, options.length ? `Opções: ${options.join(', ')}.` : undefined);
  }
  // FASE 8C.1: "Outro: especificação" (opção da família Outro + detalhe). Eixos de variante nunca usam este formato.
  const composite = def.role === 'variant_axis' ? null : splitOtherValue(options, candidate, matchOption);
  const chosen = composite ? composite.option : matchOption(options, candidate);
  if (chosen === null) {
    return fail(def, 'INVALID_OPTION', `Valor inválido "${String(candidate).trim()}" para o atributo "${def.name}".${optionsSentence(options)}`, 'Escolha uma das opções da lista.');
  }
  if (def.role !== 'variant_axis' && isOtherOption(chosen)) {
    if (composite) {
      const d = normalizeOtherDetail(composite.detail, chosen);
      if (!d.ok) return fail(def, 'OTHER_DETAIL_REQUIRED', otherDetailMessage(def.name, d.reason), 'Escolha "Outro" e escreva qual é (2 a 80 caracteres).');
      return { ok: true, value: { ...base(def, 'select', d.value!), options: [chosen], otherDetail: d.value } };
    }
    // valor antigo "Outro" sem especificação: só aceito quando NÃO está sendo alterado (compatibilidade com produtos históricos)
    if (!opts.allowBareOther) return fail(def, 'OTHER_DETAIL_REQUIRED', otherDetailMessage(def.name, 'EMPTY'), 'Escolha "Outro" e escreva qual é (2 a 80 caracteres).');
  }
  return { ok: true, value: { ...base(def, 'select', chosen), options: [chosen] } };
}

function validateMultiselect(def: AttributeDefinitionLike, raw: unknown): Outcome {
  const options = definitionOptions(def);
  let items: unknown[];
  if (Array.isArray(raw)) items = raw;
  else if (typeof raw === 'string') items = raw.split(','); // formato legado "A, B"; opções não podem conter vírgula (regra da definição)
  else if (typeof raw === 'number') items = [raw];
  else return fail(def, 'INVALID_TYPE', `O atributo "${def.name}" deve ser uma lista de opções.`, options.length ? `Opções: ${options.join(', ')}.` : undefined);

  const picked = new Set<string>();
  const invalid: string[] = [];
  for (const item of items) {
    if (isEmptyValue(item)) continue;
    if (typeof item !== 'string' && typeof item !== 'number') {
      invalid.push(String(item));
      continue;
    }
    const chosen = matchOption(options, item);
    if (chosen === null) invalid.push(String(item).trim());
    else picked.add(chosen);
  }
  if (invalid.length > 0) {
    return fail(def, 'INVALID_OPTION', `Valor inválido "${invalid.join(', ')}" para o atributo "${def.name}".${optionsSentence(options)}`, 'Escolha apenas opções da lista.');
  }
  // ordem da definição: o resultado não depende da ordem em que o cliente enviou
  const ordered = options.filter((o) => picked.has(o));
  return { ok: true, value: { ...base(def, 'multiselect', ordered.join(', ')), options: ordered } };
}

/** Valida UM valor (já sabido como não vazio) contra a definição. Exportado para testes. */
export interface ValidateValueOptions {
  /** Aceita a opção "Outro" SEM especificação (valores já gravados, não alterados, e texto legado). Padrão: false para valores novos. */
  allowBareOther?: boolean;
}

export function validateAttributeValue(def: AttributeDefinitionLike, raw: unknown, opts: ValidateValueOptions = {}): Outcome {
  switch (def.type) {
    case 'text': return validateText(def, raw);
    case 'number': return validateNumber(def, raw);
    case 'boolean': return validateBoolean(def, raw);
    case 'select': return validateSelect(def, raw, opts);
    case 'multiselect': return validateMultiselect(def, raw);
    default: return fail(def, 'INVALID_TYPE', `O atributo "${def.name}" tem um tipo desconhecido ("${def.type}").`);
  }
}

function sameNormalizedValue(a: NormalizedAttributeValue, b: NormalizedAttributeValue): boolean {
  return a.type === b.type && a.legacyText === b.legacyText;
}

// --------------------------------------------------------------------------------------------------------------------------------
// Validação do mapa completo
// --------------------------------------------------------------------------------------------------------------------------------

export function validateProductAttributes(
  definitions: AttributeDefinitionLike[],
  input: unknown,
  options: ValidateOptions = {},
): ValidationResult {
  const result: ValidationResult = { values: [], errors: [], passthrough: {}, unknownKeys: [] };

  if (input !== undefined && input !== null && (typeof input !== 'object' || Array.isArray(input))) {
    result.errors.push({ code: 'INVALID_INPUT', field: 'specs', message: 'Os atributos do produto devem ser enviados como um objeto { código: valor }.' });
    return result;
  }
  const map = (input ?? {}) as Record<string, unknown>;
  const keys = Object.keys(map);
  if (keys.length > PRODUCT_ATTRIBUTE_INPUT_LIMITS.maxKeys) {
    result.errors.push({ code: 'INVALID_INPUT', field: 'specs', message: `Atributos demais: o máximo é ${PRODUCT_ATTRIBUTE_INPUT_LIMITS.maxKeys} por produto.` });
    return result;
  }

  // Só especificações ativas recebem valor; eixos de variante ficam de fora (pertencem às variantes).
  const specDefs = definitions.filter((d) => d.isActive !== false && (d.role ?? 'spec') === 'spec');
  const axisDefs = definitions.filter((d) => d.isActive !== false && (d.role ?? 'spec') === 'variant_axis');
  const byCode = new Map<string, AttributeDefinitionLike>();
  const byName = new Map<string, AttributeDefinitionLike>();
  for (const d of specDefs) {
    byCode.set(normalizeLookupKey(d.code), d);
    const nk = normalizeLookupKey(d.name);
    if (nk && !byName.has(nk)) byName.set(nk, d);
  }
  const axisKeys = new Set<string>();
  for (const d of axisDefs) {
    axisKeys.add(normalizeLookupKey(d.code));
    axisKeys.add(normalizeLookupKey(d.name));
  }

  const resolved = new Map<string, NormalizedAttributeValue>(); // attributeId -> valor
  const conflicted = new Set<string>();

  for (const rawKey of keys) {
    const value = map[rawKey];
    const lookup = normalizeLookupKey(rawKey);

    if (rawKey.length > PRODUCT_ATTRIBUTE_INPUT_LIMITS.maxKeyLength) {
      result.errors.push({ code: 'INVALID_INPUT', field: rawKey.slice(0, 40), message: `Nome de atributo longo demais (máximo ${PRODUCT_ATTRIBUTE_INPUT_LIMITS.maxKeyLength} caracteres).` });
      continue;
    }

    // código tem prioridade sobre nome ao localizar a definição
    const def = byCode.get(lookup) ?? byName.get(lookup);
    if (def) {
      if (isEmptyValue(value)) continue; // vazio = ausente; "obrigatório" é checado depois
      const outcome = validateAttributeValue(def, value);
      if (!outcome.ok) {
        result.errors.push(outcome.error!);
        conflicted.add(def.id);
        continue;
      }
      const previous = resolved.get(def.id);
      if (previous && !sameNormalizedValue(previous, outcome.value!)) {
        result.errors.push({
          code: 'CONFLICTING_VALUES',
          field: def.code,
          attributeId: def.id,
          message: `O atributo "${def.name}" foi enviado mais de uma vez com valores diferentes ("${previous.legacyText}" e "${outcome.value.legacyText}").`,
          hint: 'Envie cada atributo uma só vez.',
        });
        conflicted.add(def.id);
        continue;
      }
      resolved.set(def.id, outcome.value!);
      continue;
    }

    // Não é atributo da categoria. Eixos de variante, rótulos gerais legados (Marca, Peso…) e chaves desconhecidas seguem como
    // texto legado, sem valor tipado.
    if (isEmptyValue(value)) continue;
    const isAxis = axisKeys.has(lookup);
    const isReserved = RESERVED_ATTRIBUTE_CODES.has(lookup);
    if (!isAxis && !isReserved) {
      result.unknownKeys.push(rawKey);
      if (options.strictUnknown) {
        result.errors.push({
          code: 'UNKNOWN_ATTRIBUTE',
          field: rawKey,
          message: `"${rawKey}" não é um atributo desta categoria.`,
          hint: 'Remova o campo ou peça ao administrador para cadastrá-lo na categoria.',
        });
        continue;
      }
    }
    const legacy = legacyPassthroughText(value);
    if (legacy === null) {
      result.errors.push({ code: 'INVALID_INPUT', field: rawKey, message: `O valor de "${rawKey}" não é um texto, número ou Sim/Não válido.` });
      continue;
    }
    if (legacy.length > PRODUCT_ATTRIBUTE_INPUT_LIMITS.passthroughValueLength) {
      result.errors.push({ code: 'TOO_LONG', field: rawKey, message: `O valor de "${rawKey}" excede ${PRODUCT_ATTRIBUTE_INPUT_LIMITS.passthroughValueLength} caracteres.` });
      continue;
    }
    result.passthrough[rawKey] = legacy;
  }

  // Obrigatórios: só especificações ativas. `false` e `0` contam como preenchidos (estão em `resolved`).
  for (const def of specDefs) {
    if (def.isRequired && !resolved.has(def.id) && !conflicted.has(def.id)) {
      result.errors.push({
        code: 'REQUIRED',
        field: def.code,
        attributeId: def.id,
        message: `O atributo "${def.name}" é de preenchimento obrigatório${options.categoryName ? ` para a categoria "${options.categoryName}"` : ''}.`,
        hint: def.type === 'boolean' ? 'Escolha Sim ou Não.' : def.type === 'select' || def.type === 'multiselect' ? 'Escolha uma opção.' : 'Preencha este campo.',
      });
    }
  }

  // ordem estável: a das definições
  result.values = specDefs.map((d) => resolved.get(d.id)).filter((v): v is NormalizedAttributeValue => Boolean(v));
  return result;
}

/** Texto legado de um valor que não é atributo da categoria; null quando não for escalar/lista de escalares. */
function legacyPassthroughText(value: unknown): string | null {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (const item of value) {
      if (isEmptyValue(item)) continue;
      const t = legacyPassthroughText(item);
      if (t === null) return null;
      parts.push(t);
    }
    return parts.join(', ');
  }
  return null;
}

// --------------------------------------------------------------------------------------------------------------------------------
// Erro tipado para as rotas
// --------------------------------------------------------------------------------------------------------------------------------

export class ProductAttributeValidationError extends Error {
  readonly status = 400;
  readonly code = PRODUCT_ATTRIBUTES_INVALID;
  constructor(public readonly details: AttributeValueError[]) {
    const first = details[0];
    const extra = details.length > 1 ? ` (e mais ${details.length - 1} problema${details.length - 1 > 1 ? 's' : ''})` : '';
    const head = first ? first.message : 'Atributos inválidos.';
    super(extra ? `${head.replace(/.$/, '')}${extra}.` : head);
    this.name = 'ProductAttributeValidationError';
  }
}
