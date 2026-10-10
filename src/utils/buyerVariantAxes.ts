/**
 * P2 (pós-matriz v2) — eixos de variação como o COMPRADOR os vê (PURO: sem rede, sem DOM).
 *
 * O modelo de dados é o de sempre (product_variants: color / size / capacity + attributes_json para os demais eixos, ex.: Voltagem).
 * Este módulo só descobre, a partir das variantes ATIVAS reais, quais eixos existem, com o NOME REAL de cada um (definição da categoria
 * quando disponível; senão o nome canônico), e monta:
 *   - os rótulos do seletor ("Voltagem", "Capacidade"… nunca "Tamanho" fixo);
 *   - as linhas da ficha do produto (um eixo com uma única opção aparece como informação; com várias, mostra a escolhida ou as opções);
 *   - o retrato do que o comprador escolheu, para o carrinho/pedido (rótulo + valor de cada eixo).
 * A identidade da variante continua sendo o id real (product_variants.id): nada aqui decide preço, estoque ou disponibilidade.
 */
import type { ProductVariant } from '../types';
import { humanizeAttributeKey } from './attributeFormat';
import { axisTarget } from './variantAxes';
import { extraAxisKeys, getActiveVariants, jsonAxisValue, secondaryAxisValue, secondaryJsonKey } from './productVariantBuyer';

/** Definição de eixo da categoria (o que GET /categories/:id/attributes devolve para role = variant_axis). */
export interface AxisDefinition {
  code: string;
  name: string;
  role?: string | null;
  isActive?: boolean | null;
  optionsJson?: unknown;
}

export interface BuyerAxisValue { key: string; label: string; value: string }

export interface BuyerExtraAxis { key: string; label: string; values: string[] }

export interface BuyerAxes {
  /** Existe eixo de cor nas variantes ativas? */
  hasColor: boolean;
  colorLabel: string;
  /** Existe 2ª dimensão (tamanho, capacidade ou eixo de attributes_json)? */
  hasSecond: boolean;
  /** Nome REAL da 2ª dimensão. */
  secondLabel: string;
  /** 'size' | 'capacity' | código do eixo em attributes_json. */
  secondKey: string;
  /** Código (attributes_json) da 2ª dimensão quando ela NÃO é tamanho/capacidade (ex.: voltagem). */
  secondJsonKey?: string;
  /** A 2ª dimensão é o clássico Tamanho (só então faz sentido o "guia de tamanhos"). */
  secondIsSize: boolean;
  /** Eixos adicionais (attributes_json), com seus valores distintos. */
  extras: BuyerExtraAxis[];
  /** Códigos dos eixos da categoria, na ordem de definição — desempate de qual eixo de attributes_json é a 2ª dimensão. */
  preferredJson: string[];
}

const activeAxisDefs = (defs: AxisDefinition[] | null | undefined): AxisDefinition[] =>
  (Array.isArray(defs) ? defs : []).filter((d) => d && d.code && d.role === 'variant_axis' && d.isActive !== false);

function defFor(defs: AxisDefinition[], match: (t: ReturnType<typeof axisTarget>) => boolean): AxisDefinition | undefined {
  return defs.find((d) => match(axisTarget(d.code)));
}

const distinct = (values: Array<string | undefined>, order?: string[]): string[] => {
  const seen: string[] = [];
  for (const v of values) if (v && !seen.includes(v)) seen.push(v);
  if (!order || order.length === 0) return seen;
  const rank = (v: string) => { const i = order.findIndex((o) => o.trim().toLowerCase() === v.trim().toLowerCase()); return i < 0 ? Number.MAX_SAFE_INTEGER : i; };
  return [...seen].sort((a, b) => rank(a) - rank(b));
};

const optionsOf = (d?: AxisDefinition): string[] => (d && Array.isArray(d.optionsJson) ? (d.optionsJson as unknown[]).map(String) : []);

export function describeBuyerAxes(variants: ProductVariant[] | undefined | null, definitions?: AxisDefinition[] | null): BuyerAxes {
  const active = getActiveVariants(variants);
  const defs = activeAxisDefs(definitions);
  const preferredJson = defs.filter((d) => 'json' in axisTarget(d.code)).map((d) => d.code);

  const colorDef = defFor(defs, (t) => 'column' in t && t.column === 'color');
  const sizeDef = defFor(defs, (t) => 'column' in t && t.column === 'size');
  const capacityDef = defFor(defs, (t) => 'column' in t && t.column === 'capacity');
  const jsonDef = (key: string) => defs.find((d) => d.code === key || d.code.trim().toLowerCase() === key.trim().toLowerCase());

  const hasColor = active.some((v) => !!v.color);
  const anySize = active.some((v) => !!v.size);
  const anyCapacity = active.some((v) => !!v.capacity);
  const jk = secondaryJsonKey(active, preferredJson);
  const hasSecond = active.some((v) => !!secondaryAxisValue(v, jk));

  let secondLabel = '';
  let secondKey = 'size';
  if (anySize && anyCapacity) { secondLabel = `${sizeDef?.name || 'Tamanho'} / ${capacityDef?.name || 'Capacidade'}`; secondKey = 'size'; }
  else if (anySize) { secondLabel = sizeDef?.name || 'Tamanho'; secondKey = 'size'; }
  else if (anyCapacity) { secondLabel = capacityDef?.name || 'Capacidade'; secondKey = 'capacity'; }
  else if (jk) { secondLabel = jsonDef(jk)?.name || humanizeAttributeKey(jk); secondKey = jk; }

  const extras: BuyerExtraAxis[] = extraAxisKeys(active, preferredJson).map((key) => ({
    key,
    label: jsonDef(key)?.name || humanizeAttributeKey(key),
    values: distinct(active.map((v) => jsonAxisValue(v, key)), optionsOf(jsonDef(key))),
  }));

  return {
    hasColor,
    colorLabel: colorDef?.name || 'Cor',
    hasSecond,
    secondLabel,
    secondKey,
    secondJsonKey: jk,
    secondIsSize: hasSecond && anySize && !anyCapacity,
    extras,
    preferredJson,
  };
}

/** Todos os eixos de UMA variante, com rótulo real: cor, 2ª dimensão e extras (só os que têm valor). */
export function variantAxisValues(variant: ProductVariant, axes: BuyerAxes): BuyerAxisValue[] {
  const out: BuyerAxisValue[] = [];
  if (variant.color) out.push({ key: 'color', label: axes.colorLabel, value: variant.color });
  const second = secondaryAxisValue(variant, axes.secondJsonKey);
  if (second) out.push({ key: axes.secondKey, label: axes.secondLabel, value: second });
  for (const e of axes.extras) {
    const v = jsonAxisValue(variant, e.key);
    if (v) out.push({ key: e.key, label: e.label, value: v });
  }
  return out;
}

/**
 * Linhas da ficha do produto para os eixos de variação (rótulo real, nunca "Tamanho" fixo):
 *   - eixo com UMA única opção (produto simples ou variável sem escolha real) => a informação ("Voltagem: 220V");
 *   - eixo com várias opções => a opção escolhida, ou a lista das opções ainda sem escolha ("110V / 220V").
 */
export function buildAxisSpecRows(
  variants: ProductVariant[] | undefined | null,
  axes: BuyerAxes,
  selection: { color?: string | null; size?: string | null; extras?: Record<string, string | null | undefined> },
): Array<[string, string]> {
  const active = getActiveVariants(variants);
  const rows: Array<[string, string]> = [];
  const row = (label: string, values: string[], chosen?: string | null) => {
    if (values.length === 0) return;
    rows.push([label, values.length === 1 ? values[0] : chosen && values.includes(chosen) ? chosen : values.join(' / ')]);
  };
  if (axes.hasColor) row(axes.colorLabel, distinct(active.map((v) => v.color || undefined)), selection.color);
  if (axes.hasSecond) row(axes.secondLabel, distinct(active.map((v) => secondaryAxisValue(v, axes.secondJsonKey))), selection.size);
  for (const e of axes.extras) row(e.label, e.values, selection.extras?.[e.key]);
  return rows;
}

/** O que o comprador escolheu, no formato guardado no carrinho/pedido (selectedAttributes): cor, 2ª dimensão (compatível com o antigo `size`) e os eixos com rótulo. */
export function cartSelectionFor(variant: ProductVariant | null | undefined, axes: BuyerAxes): { color?: string; size?: string; axes?: BuyerAxisValue[] } {
  if (!variant) return {};
  const values = variantAxisValues(variant, axes);
  return {
    color: variant.color || undefined,
    size: secondaryAxisValue(variant, axes.secondJsonKey) || undefined,
    axes: values.length > 0 ? values : undefined,
  };
}

/** Lê o retrato guardado (selectedAttributes.axes) de um item do carrinho; ignora lixo/formatos antigos. */
export function readStoredAxes(selectedAttributes: unknown): BuyerAxisValue[] {
  const raw = selectedAttributes && typeof selectedAttributes === 'object' ? (selectedAttributes as Record<string, unknown>).axes : undefined;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
    .map((a) => ({ key: String(a.key ?? ''), label: String(a.label ?? '').trim(), value: String(a.value ?? '').trim() }))
    .filter((a) => a.label !== '' && a.value !== '');
}
