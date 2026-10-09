/**
 * ATRIBUTOS FASE 4 — ficha técnica pública de um produto (função PURA: sem banco, sem rede).
 *
 * Junta, sem duplicar:
 *   - informações gerais (Marca, Modelo, Condição, Garantia + Peso/Dimensões da embalagem), vindas dos campos do produto;
 *   - especificações técnicas agrupadas, vindas de product_attribute_values (fonte principal) e, só para produtos antigos,
 *     do formato legado — sempre com o NOME AMIGÁVEL da definição, valor formatado e unidade;
 *   - outras informações: chaves legadas sem definição, com rótulo legível.
 *
 * Regras de visibilidade/duplicação:
 *   - só atributos EFETIVOS da categoria do produto aparecem (desativados ou "desativados aqui" saem da página pública;
 *     os valores continuam gravados e visíveis no painel do vendedor);
 *   - rótulos gerais legados (Marca, Modelo, Condição, Peso, Dimensões, Garantia, Armazém) nunca entram como especificação:
 *     alimentam apenas a seção "Informações gerais" quando o campo do produto está vazio ("Armazém" é interno e não é exibido);
 *   - uma chave legada que repete um atributo tipado (mesmo código ou nome) é descartada em favor do tipado;
 *   - eixos de variante não fazem parte da ficha (pertencem às variantes).
 */
import { conditionLabel, formatAttributeDisplay, formatNumberPtBr, humanizeAttributeKey, withUnit } from '../../../utils/attributeFormat.js';
import { normalizeLookupKey, validateAttributeValue, type AttributeDefinitionLike } from './attributeValidator.js';
import type { ProductAttributeValueView } from './attributeValueService.js';

export interface SpecSource {
  categoryId: string | null;
  categoryName: string | null;
  inherited: boolean;
  /** Substitui explicitamente um atributo herdado de outra categoria. */
  overridden: boolean;
  replacesCategoryName: string | null;
}

export interface SpecItem {
  /** Código interno estável (para integrações); a interface NUNCA deve exibi-lo. */
  code: string | null;
  label: string;
  type: 'text' | 'number' | 'select' | 'multiselect' | 'boolean' | 'legacy';
  /** Valor tipado quando existe (número, booleano, opção ou lista); texto no formato legado caso contrário. */
  value: string | number | boolean | string[];
  unit: string | null;
  displayValue: string;
  source: SpecSource | null;
  /** true quando o valor veio do formato legado (produto sem linhas tipadas). */
  legacy: boolean;
}

export interface SpecGroup {
  name: string;
  items: SpecItem[];
}

export interface GeneralInfoItem {
  key: 'brand' | 'model' | 'condition' | 'warranty' | 'weight' | 'dimensions';
  label: string;
  displayValue: string;
  /** 'packaging': já exibido no bloco "Medidas & Peso da Embalagem" da página; a interface não o repete. */
  placement: 'general' | 'packaging';
}

export interface ProductSpecSheet {
  general: GeneralInfoItem[];
  groups: SpecGroup[];
  other: SpecItem[];
}

export interface SpecSheetInput {
  product: { brand?: string | null; model?: string | null; warranty?: string | null; condition?: string | null; shippingJson?: any };
  /** Atributos efetivos da categoria do produto (resolveEffectiveAttributes). */
  effective: any[];
  /** Valores tipados do produto (loadProductAttributeValues). */
  typed: ProductAttributeValueView[];
  /** Visão legada já composta (product_attributes + attributes_json); o tipado é ignorado aqui, só importam as chaves legadas. */
  legacySpecs: Record<string, unknown>;
}

const DEFAULT_GROUP = 'Especificações técnicas';
const OTHER_GROUP_WHEN_NAMED = 'Outras especificações';

function textOf(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(String).join(', ').trim();
  return String(v).trim();
}

function sourceOf(def: any): SpecSource {
  return {
    categoryId: def.originCategoryId ?? null,
    categoryName: def.originCategoryName ?? null,
    inherited: Boolean(def.isInherited),
    overridden: Boolean(def.isOverride),
    replacesCategoryName: def.overridesCategoryName ?? null,
  };
}

function cmpDef(a: any, b: any): number {
  return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.name).localeCompare(String(b.name), 'pt-BR');
}

export function buildProductSpecSheet(input: SpecSheetInput): ProductSpecSheet {
  const { product, effective, typed, legacySpecs } = input;
  const specDefs = effective.filter((d) => (d.role ?? 'spec') === 'spec' && d.isActive !== false);
  const axisKeys = new Set<string>();
  for (const d of effective) if (d.role === 'variant_axis') { axisKeys.add(normalizeLookupKey(d.code)); axisKeys.add(normalizeLookupKey(d.name)); }
  const defByCode = new Map<string, any>(specDefs.map((d) => [normalizeLookupKey(d.code), d]));
  const defByName = new Map<string, any>();
  for (const d of specDefs) { const k = normalizeLookupKey(d.name); if (k && !defByName.has(k)) defByName.set(k, d); }

  // ---- legado: separa rótulos gerais (alimentam "Informações gerais") do resto
  const legacyGeneral: Record<string, string> = {};
  const legacyRest: Array<[string, unknown]> = [];
  for (const [k, v] of Object.entries(legacySpecs || {})) {
    const nk = normalizeLookupKey(k);
    if (['marca', 'modelo', 'condicao', 'garantia', 'peso', 'dimensoes', 'armazem'].includes(nk)) {
      if (!(nk in legacyGeneral)) legacyGeneral[nk] = textOf(v);
      continue;
    }
    legacyRest.push([k, v]);
  }

  // ---- informações gerais (campos do produto vencem o legado)
  const general: GeneralInfoItem[] = [];
  const brand = textOf(product.brand) || legacyGeneral.marca;
  const model = textOf(product.model) || legacyGeneral.modelo;
  const condition = conditionLabel(product.condition) || conditionLabel(legacyGeneral.condicao);
  const warranty = textOf(product.warranty) || legacyGeneral.garantia;
  if (brand) general.push({ key: 'brand', label: 'Marca', displayValue: brand, placement: 'general' });
  if (model) general.push({ key: 'model', label: 'Modelo', displayValue: model, placement: 'general' });
  if (condition) general.push({ key: 'condition', label: 'Condição', displayValue: condition, placement: 'general' });
  if (warranty) general.push({ key: 'warranty', label: 'Garantia', displayValue: warranty, placement: 'general' });
  const ship = product.shippingJson && typeof product.shippingJson === 'object' ? product.shippingJson : null;
  const weight = ship && Number(ship.weightKg) > 0 ? withUnit(formatNumberPtBr(Number(ship.weightKg)), 'kg') : legacyGeneral.peso;
  if (weight) general.push({ key: 'weight', label: 'Peso', displayValue: weight, placement: 'packaging' });
  const dims = ship && Number(ship.lengthCm) > 0 && Number(ship.widthCm) > 0 && Number(ship.heightCm) > 0
    ? `${formatNumberPtBr(Number(ship.lengthCm))} × ${formatNumberPtBr(Number(ship.widthCm))} × ${formatNumberPtBr(Number(ship.heightCm))} cm`
    : legacyGeneral.dimensoes;
  if (dims) general.push({ key: 'dimensions', label: 'Dimensões', displayValue: dims, placement: 'packaging' });

  // ---- especificações: tipadas primeiro (fonte principal)
  type Entry = { def: any; item: SpecItem };
  const entries: Entry[] = [];
  const covered = new Set<string>(); // códigos e nomes (normalizados) já representados
  for (const t of typed) {
    const def = defByCode.get(normalizeLookupKey(t.code));
    if (!def) continue; // atributo desativado / "desativado aqui" / substituído por outro código: fora da página pública
    // select "Outro" com especificação: a ficha mostra a especificação ("Material: Fibra de bambu"), não a palavra "Outro"
    const text = t.otherDetail ? String(t.otherDetail) : formatAttributeDisplay(def.type, t.value, def.unit);
    if (text === '') continue;
    entries.push({ def, item: { code: def.code, label: def.name, type: def.type, value: t.otherDetail ? String(t.otherDetail) : t.value, unit: def.unit ?? null, displayValue: text, source: sourceOf(def), legacy: false } });
    covered.add(normalizeLookupKey(def.code));
    covered.add(normalizeLookupKey(def.name));
  }

  // ---- legado: produtos antigos (sem linhas tipadas) e chaves sem definição
  const other: SpecItem[] = [];
  // Códigos que têm valor tipado (inclusive os ocultos por estarem desativados): o espelho legado deles nunca reaparece como "outra informação".
  const typedCodes = new Set(typed.map((t) => normalizeLookupKey(t.code)));
  for (const [rawKey, rawVal] of legacyRest) {
    const nk = normalizeLookupKey(rawKey);
    const text = textOf(rawVal);
    if (!nk || text === '' || covered.has(nk) || typedCodes.has(nk) || axisKeys.has(nk)) continue;
    const def = defByCode.get(nk) ?? defByName.get(nk);
    if (def) {
      if (covered.has(normalizeLookupKey(def.code))) continue;
      // texto legado reaproveitado pelo validador: "128" vira número com unidade, "Sim" vira booleano, etc.
      const parsed = validateAttributeValue(def as AttributeDefinitionLike, rawVal, { allowBareOther: true });
      const n = parsed.ok ? parsed.value! : null;
      const value: SpecItem['value'] = n
        ? n.type === 'number' ? Number(n.valueNumber) : n.type === 'boolean' ? Boolean(n.valueBool) : n.type === 'select' || n.type === 'multiselect' ? (n.type === 'multiselect' ? n.options! : n.options![0]) : n.valueText!
        : text;
      const display = n ? formatAttributeDisplay(def.type, value, def.unit) : text;
      entries.push({ def, item: { code: def.code, label: def.name, type: def.type, value, unit: def.unit ?? null, displayValue: display, source: sourceOf(def), legacy: true } });
      covered.add(normalizeLookupKey(def.code));
      covered.add(normalizeLookupKey(def.name));
      continue;
    }
    other.push({ code: null, label: humanizeAttributeKey(rawKey), type: 'legacy', value: text, unit: null, displayValue: text, source: null, legacy: true });
  }

  // ---- agrupamento: ordem por (sortOrder, nome) dentro do grupo; grupos na ordem do primeiro item; sem grupo vai por último
  entries.sort((a, b) => cmpDef(a.def, b.def));
  const named = new Map<string, SpecItem[]>();
  const ungrouped: SpecItem[] = [];
  for (const e of entries) {
    const g = textOf(e.def.displayGroup);
    if (g) (named.get(g) ?? named.set(g, []).get(g)!).push(e.item);
    else ungrouped.push(e.item);
  }
  const groups: SpecGroup[] = [...named.entries()].map(([name, items]) => ({ name, items }));
  if (ungrouped.length > 0) groups.push({ name: named.size > 0 ? OTHER_GROUP_WHEN_NAMED : DEFAULT_GROUP, items: ungrouped });

  return { general, groups, other };
}
