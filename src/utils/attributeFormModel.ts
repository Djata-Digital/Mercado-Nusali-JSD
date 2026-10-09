/**
 * ATRIBUTOS FASE 5 — modelo PURO do formulário dinâmico de atributos do assistente de cadastro (sem React, sem rede).
 *
 * Estado de cada campo por tipo:
 *   text -> string | number -> string (o que a pessoa digita; vírgula decimal aceita) | select -> string
 *   multiselect -> string[] | boolean -> 'true' | 'false' | '' (vazio = ainda não escolheu; "Não" é 'false', NUNCA vazio)
 *
 * A validação usa as MESMAS regras do servidor (attributeValidator), então o que o formulário aceita é o que o backend aceita
 * e as mensagens são as mesmas. 0 e false são valores válidos.
 */
import { normalizeLookupKey, validateAttributeValue, type AttributeDefinitionLike } from './attributeValidator';
import { RESERVED_ATTRIBUTE_CODES, ATTRIBUTE_LIMITS } from './attributeRules';

export interface FormAttribute extends AttributeDefinitionLike {
  placeholder?: string | null;
  helpText?: string | null;
  displayGroup?: string | null;
  sortOrder?: number | null;
  inheritedFrom?: string | null;
  isInherited?: boolean;
  isOverride?: boolean;
}

export type FormValue = string | string[];
export type FormValues = Record<string, FormValue>;

export interface AttributeGroup {
  name: string;
  fields: FormAttribute[];
}

const DEFAULT_GROUP = 'Características';
const OTHER_GROUP = 'Outras características';
export const DEFAULT_TEXT_LENGTH = 255;

/** Campos gerais que o assistente já pergunta em outro lugar: um atributo com esse nome/código seria um campo duplicado. */
function isGeneralDuplicate(def: { code?: unknown; name?: unknown }): boolean {
  return RESERVED_ATTRIBUTE_CODES.has(normalizeLookupKey(def.code)) || RESERVED_ATTRIBUTE_CODES.has(normalizeLookupKey(def.name));
}

export interface SelectedAttributes {
  /** Especificações que o vendedor preenche no produto (função "spec", ativas, sem duplicar campo geral). */
  fields: FormAttribute[];
  /** Eixos de variante (Cor, Tamanho, Capacidade…): pertencem às variantes, nunca ao formulário geral. */
  axes: FormAttribute[];
  /** Atributos escondidos por duplicarem Marca/Modelo/Condição/Garantia/Peso/Dimensões/Armazém. */
  duplicates: FormAttribute[];
}

export function selectFormAttributes(defs: unknown): SelectedAttributes {
  const list: FormAttribute[] = Array.isArray(defs) ? (defs as FormAttribute[]) : [];
  const out: SelectedAttributes = { fields: [], axes: [], duplicates: [] };
  for (const d of list) {
    if (!d || d.isActive === false || !d.code) continue;
    if ((d.role ?? 'spec') === 'variant_axis') out.axes.push(d);
    else if (isGeneralDuplicate(d)) out.duplicates.push(d);
    else out.fields.push(d);
  }
  return out;
}

const cmp = (a: FormAttribute, b: FormAttribute) =>
  (a.isRequired === b.isRequired ? 0 : a.isRequired ? -1 : 1) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.name).localeCompare(String(b.name), 'pt-BR');

/** Grupos de apresentação: obrigatórios primeiro dentro do grupo, depois ordem de exibição e nome; grupos nomeados antes do sem grupo. */
export function groupFormAttributes(fields: FormAttribute[]): AttributeGroup[] {
  const named = new Map<string, FormAttribute[]>();
  const ungrouped: FormAttribute[] = [];
  for (const f of [...fields].sort(cmp)) {
    const g = String(f.displayGroup ?? '').trim();
    if (g) (named.get(g) ?? named.set(g, []).get(g)!).push(f);
    else ungrouped.push(f);
  }
  const groups: AttributeGroup[] = [...named.entries()].map(([name, list]) => ({ name, fields: list }));
  groups.sort((a, b) => (a.fields[0].isRequired === b.fields[0].isRequired ? 0 : a.fields[0].isRequired ? -1 : 1));
  if (ungrouped.length > 0) groups.push({ name: named.size > 0 ? OTHER_GROUP : DEFAULT_GROUP, fields: ungrouped });
  return groups;
}

export function emptyValueFor(def: FormAttribute): FormValue {
  return def.type === 'multiselect' ? [] : '';
}

/** Vazio = não preenchido. "0", 0 e 'false' ("Não") contam como preenchidos. */
export function isEmptyFormValue(v: FormValue | undefined | null): boolean {
  if (v === undefined || v === null) return true;
  if (Array.isArray(v)) return v.length === 0;
  return String(v).trim() === '';
}

/** Valor do formulário -> valor aceito pelo validador (booleano de verdade, lista de opções, texto). */
function toValidatorInput(def: FormAttribute, v: FormValue): unknown {
  if (def.type === 'boolean') return v === 'true' ? true : v === 'false' ? false : v;
  return v;
}

/** Mensagem de erro do campo (mesmas regras/mensagens do servidor) ou null. */
export function validateFormField(def: FormAttribute, v: FormValue | undefined): string | null {
  if (isEmptyFormValue(v)) return def.isRequired ? `O campo "${def.name}" é obrigatório.` : null;
  const r = validateAttributeValue(def, toValidatorInput(def, v as FormValue));
  return r.ok ? null : r.error!.message;
}

/** Valida todos os campos; devolve só os que têm erro, por CÓDIGO. */
export function validateFormFields(fields: FormAttribute[], values: FormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const msg = validateFormField(f, values[f.code]);
    if (msg) errors[f.code] = msg;
  }
  return errors;
}

/**
 * Payload tipado para `specs`: texto, número (JS number; 0 preservado), booleano de verdade (false preservado), opção e lista.
 * Campos vazios ficam de fora. Só códigos de atributos efetivos — nenhuma chave desconhecida (compatível com PRODUCT_ATTRIBUTES_STRICT=1).
 */
export function buildAttributeSpecs(fields: FormAttribute[], values: FormValues): Record<string, string | number | boolean | string[]> {
  const out: Record<string, string | number | boolean | string[]> = {};
  for (const f of fields) {
    const v = values[f.code];
    if (isEmptyFormValue(v)) continue;
    const r = validateAttributeValue(f, toValidatorInput(f, v as FormValue));
    if (!r.ok) continue; // submissão já foi bloqueada pela validação; nunca envia valor inválido
    const n = r.value!;
    out[f.code] = n.type === 'number' ? Number(n.valueNumber)
      : n.type === 'boolean' ? Boolean(n.valueBool)
      : n.type === 'multiselect' ? n.options!
      : n.type === 'select' ? n.options![0]
      : n.valueText!;
  }
  return out;
}

/** Mantém só os valores de campos que continuam existindo (troca de subcategoria: Cor herdada fica, o resto sai). */
export function reconcileValues(fields: FormAttribute[], values: FormValues): { values: FormValues; dropped: string[] } {
  const next: FormValues = {};
  const dropped: string[] = [];
  const byCode = new Map(fields.map((f) => [f.code, f]));
  for (const [code, v] of Object.entries(values)) {
    const f = byCode.get(code);
    if (!f) { if (!isEmptyFormValue(v)) dropped.push(code); continue; }
    // opção que deixou de existir (substituição com outra lista) também é descartada
    if (f.type === 'select' && typeof v === 'string' && v !== '' && Array.isArray(f.optionsJson) && !(f.optionsJson as unknown[]).map(String).includes(v)) { dropped.push(code); continue; }
    if (f.type === 'multiselect' && Array.isArray(v) && Array.isArray(f.optionsJson)) {
      const allowed = (f.optionsJson as unknown[]).map(String);
      const kept = v.filter((x) => allowed.includes(x));
      if (kept.length !== v.length) dropped.push(code);
      next[code] = kept;
      continue;
    }
    next[code] = v;
  }
  return { values: next, dropped };
}

/** Valores iniciais para EDIÇÃO: prefere os valores tipados do backend; senão lê o mapa legado por código ou nome. */
export function initialValuesFromProduct(fields: FormAttribute[], product: any): FormValues {
  const out: FormValues = {};
  const typed: any[] = Array.isArray(product?.attributeValues) ? product.attributeValues : [];
  const specs: Record<string, unknown> = product?.specs && typeof product.specs === 'object' ? product.specs : product?.attributesJson && typeof product.attributesJson === 'object' ? product.attributesJson : {};
  const specByKey = new Map(Object.entries(specs).map(([k, v]) => [normalizeLookupKey(k), v]));
  for (const f of fields) {
    const t = typed.find((x) => x.code === f.code);
    let raw: unknown = t ? t.value : specByKey.get(normalizeLookupKey(f.code)) ?? specByKey.get(normalizeLookupKey(f.name));
    if (raw === undefined || raw === null) continue;
    if (f.type === 'boolean') out[f.code] = raw === true || raw === 'Sim' || raw === 'true' ? 'true' : raw === false || raw === 'Não' || raw === 'Nao' || raw === 'false' ? 'false' : '';
    else if (f.type === 'multiselect') out[f.code] = Array.isArray(raw) ? raw.map(String) : String(raw).split(',').map((s) => s.trim()).filter(Boolean);
    else out[f.code] = typeof raw === 'number' ? String(raw).replace('.', ',') : String(raw);
  }
  return out;
}

/** Valores de saída de listas ("Outro", "Não se aplica"...): o atributo guarda só a opção; o detalhe vai no título/descrição do anúncio. */
export const ESCAPE_OPTION_PATTERN = /^(outro|outra|outros|outras|n[ãa]o se aplica)(\b|$)/i;

/** Dica exibida quando o vendedor escolhe "Outro" num select: não há campo de complemento (evita guardar texto livre em atributo filtrável). */
export function escapeOptionHint(def: Pick<FormAttribute, 'type'>, value: FormValue | undefined): string | null {
  if (def.type !== 'select' || typeof value !== 'string') return null;
  return ESCAPE_OPTION_PATTERN.test(value.trim()) ? 'Diga o que é no título ou na descrição do anúncio, para o comprador entender.' : null;
}

/** Dica de limites para exibir sob o campo: "0 a 1024 GB · sem casas decimais" / "até 100 caracteres". */
export function describeLimits(def: FormAttribute): string | null {
  const parts: string[] = [];
  if (def.type === 'number') {
    const min = def.minValue === null || def.minValue === undefined || def.minValue === '' ? null : Number(def.minValue);
    const max = def.maxValue === null || def.maxValue === undefined || def.maxValue === '' ? null : Number(def.maxValue);
    const unit = def.unit ? ` ${def.unit}` : '';
    if (min !== null && max !== null) parts.push(`de ${fmt(min)} a ${fmt(max)}${unit}`);
    else if (min !== null) parts.push(`mínimo ${fmt(min)}${unit}`);
    else if (max !== null) parts.push(`máximo ${fmt(max)}${unit}`);
    if (def.decimals === 0) parts.push('somente números inteiros');
    else if (def.decimals) parts.push(`até ${def.decimals} casa${def.decimals > 1 ? 's' : ''} ${def.decimals > 1 ? 'decimais' : 'decimal'}`);
  } else if (def.type === 'text') {
    parts.push(`até ${Math.min(def.maxLength && def.maxLength > 0 ? def.maxLength : DEFAULT_TEXT_LENGTH, ATTRIBUTE_LIMITS.maxLengthCap)} caracteres`);
  }
  return parts.length ? parts.join(' · ') : null;
}
const fmt = (n: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 }).format(n);

// ---------------------------------------------------------------- erros do servidor

export interface SubmitError {
  message: string;
  code?: string;
  /** Corpo `error.details` cru (ex.: lista `removed` do 409 de confirmação de perda). */
  details?: any;
  /** Erros por campo devolvidos pelo backend (PRODUCT_ATTRIBUTES_INVALID.details). */
  fieldErrors: Record<string, string>;
}

/** Extrai mensagem/código/erros por campo de um erro do axios (ou de um Error já normalizado pelo painel). */
export function extractSubmitError(err: any): SubmitError {
  const data = err?.response?.data ?? err?.data ?? null;
  const detailsRaw = data?.error?.details ?? err?.details ?? [];
  const fieldErrors: Record<string, string> = {};
  if (Array.isArray(detailsRaw)) {
    for (const d of detailsRaw) if (d && typeof d.field === 'string' && typeof d.message === 'string' && !(d.field in fieldErrors)) fieldErrors[d.field] = d.message;
  }
  const message = data?.message || data?.error?.message || (typeof err?.message === 'string' && !/^Request failed with status code/.test(err.message) ? err.message : '') || 'Não foi possível cadastrar o produto.';
  return { message, code: data?.error?.code ?? err?.code, details: data?.error?.details, fieldErrors };
}

// ---------------------------------------------------------------- edição (Fase 6)

const normForCompare = (v: FormValue | undefined): string =>
  Array.isArray(v) ? JSON.stringify([...v].map(String).sort()) : JSON.stringify(String(v ?? '').trim());

/**
 * Diferença entre o que o produto tinha (`original`) e o formulário agora, no formato do PATCH (`attributeUpdates`):
 *   valor novo/alterado => valor tipado (0 e false preservados) | esvaziado => null | igual => ausente (o servidor preserva).
 * Só olha campos EFETIVOS atuais; valores de atributos que deixaram de existir (troca de categoria) não são enviados — o servidor
 * os remove somente com a confirmação explícita.
 */
export function buildAttributePatch(fields: FormAttribute[], original: FormValues, current: FormValues): Record<string, string | number | boolean | string[] | null> {
  const typedNow = buildAttributeSpecs(fields, current);
  const patch: Record<string, string | number | boolean | string[] | null> = {};
  for (const f of fields) {
    const was = original[f.code];
    const now = current[f.code];
    const wasEmpty = isEmptyFormValue(was);
    const nowEmpty = isEmptyFormValue(now);
    if (nowEmpty) { if (!wasEmpty) patch[f.code] = null; continue; }
    if (wasEmpty || normForCompare(was) !== normForCompare(now)) {
      if (f.code in typedNow) patch[f.code] = typedNow[f.code];
    }
  }
  return patch;
}

/** Valores do produto que deixam de existir/valer ao trocar para `newFields` (nomes, usando as definições ANTERIORES). */
export function removedByCategoryChange(originalFields: FormAttribute[], newFields: FormAttribute[], originalValues: FormValues): string[] {
  const { dropped } = reconcileValues(newFields, originalValues);
  return dropped.map((code) => originalFields.find((f) => f.code === code)?.name || code);
}
