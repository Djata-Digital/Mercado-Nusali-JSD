/**
 * ATRIBUTOS FASE 3 — armazenamento tipado dos valores de atributos de produto (tabela product_attribute_values).
 *
 * Esta é a FONTE PRINCIPAL dos valores de atributos definidos pelas categorias. Durante a transição o cadastro também continua
 * gravando a visão legada (products.attributes_json e product_attributes), na MESMA transação e a partir dos MESMOS valores já
 * normalizados, para que o frontend atual e uma eventual reversão de versão continuem funcionando. Na leitura, o valor tipado
 * vence o legado para o mesmo código; chaves que só existem no legado (rótulos gerais, produtos antigos) seguem aparecendo.
 *
 * Sem migração: usa apenas as colunas criadas em 0037.
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import { categoryAttributes, productAttributeValues, productAttributes } from '../../../db/schema.js';
import { resolveEffectiveAttributes } from './attributeDefinitionService.js';
import { composeOtherValue } from '../../../utils/attributeOther.js';
import {
  ProductAttributeValidationError,
  validateProductAttributes,
  type NormalizedAttributeValue,
  type ValidateOptions,
  type ValidationResult,
} from './attributeValidator.js';

/** Chaves desconhecidas são recusadas quando PRODUCT_ATTRIBUTES_STRICT=1 (padrão: aceitas e só guardadas na visão legada). */
export function isStrictUnknownKeysEnabled(): boolean {
  const v = String(process.env.PRODUCT_ATTRIBUTES_STRICT ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export interface PreparedProductAttributes {
  /** Valores tipados (para product_attribute_values). */
  values: NormalizedAttributeValue[];
  /** Mapa legado { chave: texto } para products.attributes_json e product_attributes — já normalizado e sem duplicidade. */
  legacySpecs: Record<string, string>;
  /** Chaves desconhecidas aceitas só na visão legada (aviso). */
  unknownKeys: string[];
}

/**
 * Valida o mapa de atributos enviado pelo cliente contra as definições efetivas da categoria. Lança
 * ProductAttributeValidationError (400, PRODUCT_ATTRIBUTES_INVALID) com TODOS os problemas encontrados.
 * Não escreve nada: é seguro chamar antes de abrir a transação.
 */
export async function prepareProductAttributes(
  db: any,
  categoryId: string,
  categoryName: string | undefined,
  input: unknown,
  options: ValidateOptions = {},
  definitions?: any[],
): Promise<PreparedProductAttributes> {
  const defs = definitions ?? (await resolveEffectiveAttributes(db, categoryId));
  const result: ValidationResult = validateProductAttributes(defs, input, {
    strictUnknown: options.strictUnknown ?? isStrictUnknownKeysEnabled(),
    categoryName: options.categoryName ?? categoryName,
  });
  if (result.errors.length > 0) throw new ProductAttributeValidationError(result.errors);

  // Visão legada: rótulos gerais/desconhecidos como vieram + valores definidos pelo código, no formato de texto de sempre.
  const legacySpecs: Record<string, string> = { ...result.passthrough };
  for (const v of result.values) legacySpecs[v.code] = v.legacyText;
  return { values: result.values, legacySpecs, unknownKeys: result.unknownKeys };
}

function newValueId(idx: number): string {
  return `pav_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`;
}

/** Linhas de product_attribute_values de um valor normalizado: 1 linha (escalar/select), 1 por opção (multiselect) e +1 de texto para select "Outro" com especificação. */
export function toValueRows(productId: string, values: NormalizedAttributeValue[], now = new Date()) {
  const rows: Array<typeof productAttributeValues.$inferInsert> = [];
  let idx = 0;
  for (const v of values) {
    const common = { productId, attributeId: v.attributeId, attributeCode: v.code, createdAt: now, updatedAt: now };
    if (v.type === 'text') rows.push({ id: newValueId(idx++), ...common, valueText: v.valueText! });
    else if (v.type === 'number') rows.push({ id: newValueId(idx++), ...common, valueNumber: v.valueNumber! });
    else if (v.type === 'boolean') rows.push({ id: newValueId(idx++), ...common, valueBool: v.valueBool! });
    else {
      for (const opt of v.options ?? []) rows.push({ id: newValueId(idx++), ...common, optionValue: opt });
      // FASE 8C.1: select na opção "Outro" guarda a especificação numa 2ª linha do MESMO atributo (value_text; option_value nulo)
      if (v.type === 'select' && v.otherDetail) rows.push({ id: newValueId(idx++), ...common, valueText: v.otherDetail });
    }
  }
  return rows;
}

/**
 * Substitui TODOS os valores tipados do produto pelos informados (apaga e insere), dentro da transação recebida.
 * Chamar sempre com `tx`: falha aqui desfaz o produto inteiro. A unicidade (produto, atributo, opção) é garantida pelo banco.
 */
export async function replaceProductAttributeValues(tx: any, productId: string, values: NormalizedAttributeValue[]): Promise<number> {
  await tx.delete(productAttributeValues).where(eq(productAttributeValues.productId, productId));
  const rows = toValueRows(productId, values);
  if (rows.length > 0) await tx.insert(productAttributeValues).values(rows);
  return rows.length;
}

/** Visão legada em product_attributes (uma linha de texto por chave), na mesma transação do produto. */
export async function writeLegacyAttributeRows(tx: any, productId: string, legacySpecs: Record<string, string>): Promise<number> {
  const now = new Date();
  const rows = Object.entries(legacySpecs)
    .filter(([, val]) => val !== undefined && val !== null && String(val).trim() !== '')
    .map(([key, val], idx) => ({
      id: `pattr_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 5)}`,
      productId,
      name: key,
      value: String(val),
      createdAt: now,
    }));
  if (rows.length > 0) await tx.insert(productAttributes).values(rows);
  return rows.length;
}

// --------------------------------------------------------------------------------------------------------------------------------
// Leitura
// --------------------------------------------------------------------------------------------------------------------------------

export interface ProductAttributeValueView {
  attributeId: string;
  code: string;
  name: string;
  type: string;
  unit: string | null;
  displayGroup: string | null;
  /** Valor tipado: texto, número, booleano (inclusive false), opção (select) ou lista de opções (multiselect). */
  value: string | number | boolean | string[];
  /** Texto pronto para exibir no formato atual ("Sim"/"Não", opções separadas por ", "). Para select "Outro": a especificação. */
  displayValue: string;
  /** select "Outro" com especificação: a opção ("Outro") e o detalhe; `value` vem composto ("Outro: Fibra de bambu") para a edição reenviar sem perdas. */
  option?: string;
  otherDetail?: string | null;
}

function formatNumberText(raw: unknown): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return String(raw ?? '');
  // numeric(18,6) volta como "12.500000": remove zeros à direita sem usar notação científica
  return String(raw).includes('.') ? String(raw).replace(/\.?0+$/, '') : String(n);
}

/** Valores tipados de vários produtos, já agrupados por produto e ordenados como o cadastro (sortOrder, nome). */
export async function loadProductAttributeValues(db: any, productIds: string[]): Promise<Map<string, ProductAttributeValueView[]>> {
  const out = new Map<string, ProductAttributeValueView[]>();
  if (productIds.length === 0) return out;
  const rows: any[] = await db
    .select({
      productId: productAttributeValues.productId,
      attributeId: productAttributeValues.attributeId,
      code: productAttributeValues.attributeCode,
      valueText: productAttributeValues.valueText,
      valueNumber: productAttributeValues.valueNumber,
      valueBool: productAttributeValues.valueBool,
      optionValue: productAttributeValues.optionValue,
      name: categoryAttributes.name,
      type: categoryAttributes.type,
      unit: categoryAttributes.unit,
      displayGroup: categoryAttributes.displayGroup,
      sortOrder: categoryAttributes.sortOrder,
      optionsJson: categoryAttributes.optionsJson,
    })
    .from(productAttributeValues)
    .innerJoin(categoryAttributes, eq(categoryAttributes.id, productAttributeValues.attributeId))
    .where(inArray(productAttributeValues.productId, productIds))
    .orderBy(asc(categoryAttributes.sortOrder), asc(categoryAttributes.name), asc(productAttributeValues.optionValue));

  const grouped = new Map<string, Map<string, any[]>>(); // produto -> atributo -> linhas
  for (const r of rows) {
    const perProduct = grouped.get(r.productId) ?? new Map<string, any[]>();
    const list = perProduct.get(r.attributeId) ?? [];
    list.push(r);
    perProduct.set(r.attributeId, list);
    grouped.set(r.productId, perProduct);
  }

  for (const [productId, perProduct] of grouped) {
    const views: ProductAttributeValueView[] = [];
    for (const list of perProduct.values()) {
      const first = list[0];
      let value: ProductAttributeValueView['value'];
      let displayValue: string;
      let other: { option: string; detail: string } | null = null;
      if (first.type === 'multiselect') {
        const order: string[] = Array.isArray(first.optionsJson) ? first.optionsJson.map(String) : [];
        const picked = list.map((r) => r.optionValue as string).filter((x) => x != null);
        const sorted = [...picked].sort((a, b) => {
          const ia = order.indexOf(a), ib = order.indexOf(b);
          return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib) || a.localeCompare(b);
        });
        value = sorted;
        displayValue = sorted.join(', ');
      } else if (first.type === 'select') {
        const optRow = list.find((r) => r.optionValue != null) ?? first;
        const detailRow = list.find((r) => r.optionValue == null && r.valueText != null && String(r.valueText).trim() !== '');
        if (detailRow) {
          other = { option: String(optRow.optionValue), detail: String(detailRow.valueText) };
          value = composeOtherValue(other.option, other.detail);
          displayValue = other.detail;
        } else {
          value = optRow.optionValue;
          displayValue = String(optRow.optionValue);
        }
      } else if (first.type === 'number') {
        displayValue = formatNumberText(first.valueNumber);
        value = Number(displayValue);
      } else if (first.type === 'boolean') {
        value = Boolean(first.valueBool);
        displayValue = first.valueBool ? 'Sim' : 'Não';
      } else {
        value = first.valueText ?? '';
        displayValue = String(first.valueText ?? '');
      }
      views.push({ attributeId: first.attributeId, code: first.code, name: first.name, type: first.type, unit: first.unit ?? null, displayGroup: first.displayGroup ?? null, value, displayValue, ...(other ? { option: other.option, otherDetail: other.detail } : {}) });
    }
    out.set(productId, views);
  }
  return out;
}

/**
 * Mapa { chave: texto } que o frontend atual consome (`specs` / `attributesJson`). Camadas, da mais fraca para a mais forte:
 * product_attributes (legado) < products.attributes_json (legado) < valores tipados (por código).
 * A ordem de precedência legado preserva o comportamento anterior (attributes_json sobre product_attributes).
 */
export function composeProductSpecs(
  legacyRows: Array<{ name: string; value: string }>,
  legacyJson: unknown,
  typed: ProductAttributeValueView[],
): Record<string, string> {
  const specs: Record<string, string> = {};
  for (const a of legacyRows) specs[a.name] = a.value;
  if (legacyJson && typeof legacyJson === 'object' && !Array.isArray(legacyJson)) {
    for (const [k, v] of Object.entries(legacyJson as Record<string, unknown>)) specs[k] = v as string;
  }
  for (const t of typed) specs[t.code] = t.displayValue;
  return specs;
}

/** Atalho de leitura para um produto: valores tipados + specs compostos. */
export async function loadProductSpecs(db: any, productId: string, legacyRows: Array<{ name: string; value: string }>, legacyJson: unknown) {
  const typed = (await loadProductAttributeValues(db, [productId])).get(productId) ?? [];
  return { attributeValues: typed, specs: composeProductSpecs(legacyRows, legacyJson, typed) };
}

/** Apenas para testes/verificação: contagem de linhas tipadas de um produto. */
export async function countProductAttributeValues(db: any, productId: string): Promise<number> {
  const rows = await db.select({ id: productAttributeValues.id }).from(productAttributeValues).where(and(eq(productAttributeValues.productId, productId)));
  return rows.length;
}
