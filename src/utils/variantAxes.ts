/**
 * ATRIBUTOS FASE 7 — eixos de variante (PURO: sem banco, sem rede; usado pelo servidor e pelo assistente do vendedor).
 *
 * Um eixo é um atributo da categoria com role = 'variant_axis' (Cor, Tamanho, Capacidade, ...), com herança, substituição e
 * desativação como qualquer atributo. O valor de cada eixo mora na PRÓPRIA variante:
 *   cor / color        -> product_variants.color
 *   tamanho / size     -> product_variants.size
 *   capacidade / capacity -> product_variants.capacity
 *   qualquer outro eixo -> product_variants.attributes_json[código]
 * A identidade da combinação (`variant_key`) é calculada de TODOS esses valores — eixos da categoria ou valores livres — para que
 * a unicidade por produto valha também para variantes livres (categoria sem eixos).
 */
import { normalizeLookupKey, validateAttributeValue, type AttributeDefinitionLike } from './attributeValidator';

export type AxisColumn = 'color' | 'size' | 'capacity';

const COLUMN_BY_CODE: Record<string, AxisColumn> = {
  cor: 'color', color: 'color',
  tamanho: 'size', size: 'size',
  capacidade: 'capacity', capacity: 'capacity',
};
/** Nome canônico (na chave) de cada coluna. */
const KEY_NAME: Record<AxisColumn, string> = { color: 'cor', size: 'tamanho', capacity: 'capacidade' };

/** Para onde vai o valor de um eixo: uma coluna fixa da variante ou o mapa attributes_json. */
export function axisTarget(code: string): { column: AxisColumn } | { json: string } {
  const column = COLUMN_BY_CODE[normalizeLookupKey(code)];
  return column ? { column } : { json: code };
}

export interface VariantIdentityInput {
  id?: string | null;
  sku?: string | null;
  title?: string | null;
  color?: string | null;
  size?: string | null;
  capacity?: string | null;
  attributesJson?: Record<string, any> | null;
  [k: string]: any;
}

const clean = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
};

const valueKey = (v: string) => normalizeLookupKey(v);

/**
 * Chave de identidade da combinação ("cor=preto|tamanho=p|voltagem=110v"): ordenada, sem acento/caixa, só valores preenchidos.
 * Sem nenhum valor => null (variante sem identidade não participa da unicidade, como as variantes livres de antes).
 */
export function buildVariantKey(v: VariantIdentityInput): string | null {
  const parts: Array<[string, string]> = [];
  for (const col of ['color', 'size', 'capacity'] as AxisColumn[]) {
    const val = clean(v[col]);
    if (val) parts.push([KEY_NAME[col], valueKey(val)]);
  }
  const json = v.attributesJson && typeof v.attributesJson === 'object' ? v.attributesJson : {};
  for (const [k, raw] of Object.entries(json)) {
    if (COLUMN_BY_CODE[normalizeLookupKey(k)]) continue; // eixo que mora em coluna não se repete no mapa
    const val = clean(Array.isArray(raw) ? raw.join(',') : typeof raw === 'object' ? null : raw);
    if (val) parts.push([normalizeLookupKey(k), valueKey(val)]);
  }
  if (parts.length === 0) return null;
  parts.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  return parts.map(([k, val]) => `${k}=${val}`).join('|');
}

export type VariantAxisErrorCode = 'AXIS_REQUIRED' | 'AXIS_INVALID' | 'DUPLICATE_COMBINATION';

export interface VariantAxisError {
  code: VariantAxisErrorCode;
  /** Posição da variante no payload (0-based). */
  variantIndex: number;
  /** Referência legível da variante (SKU, senão "Cor / Tamanho"). */
  variantLabel: string;
  /** Código do eixo (quando o erro é de um eixo). */
  axis?: string;
  message: string;
}

export interface NormalizedVariant<T extends VariantIdentityInput = VariantIdentityInput> {
  variant: T;
  key: string | null;
}

export interface AxisValidationResult<T extends VariantIdentityInput> {
  errors: VariantAxisError[];
  /** Variantes com os valores dos eixos canonizados (grafia da opção) e a chave de identidade. */
  items: Array<NormalizedVariant<T>>;
}

export function variantLabel(v: VariantIdentityInput): string {
  const sku = clean(v.sku);
  if (sku) return sku;
  const parts = [clean(v.color), clean(v.size), clean(v.capacity)].filter(Boolean);
  return parts.length ? parts.join(' / ') : clean(v.title) || 'Variação';
}

/** Eixos ATIVOS da lista de atributos efetivos (herança/substituição/desativação já resolvidas pelo resolvedor). */
export function activeAxes(defs: unknown): AttributeDefinitionLike[] {
  return (Array.isArray(defs) ? defs : []).filter((d: any) => d && d.role === 'variant_axis' && d.isActive !== false) as AttributeDefinitionLike[];
}

function readAxisValue(v: VariantIdentityInput, code: string): unknown {
  const t = axisTarget(code);
  if ('column' in t) return v[t.column];
  const json = v.attributesJson && typeof v.attributesJson === 'object' ? v.attributesJson : {};
  return json[t.json];
}

function writeAxisValue<T extends VariantIdentityInput>(v: T, code: string, value: string): T {
  const t = axisTarget(code);
  if ('column' in t) return { ...v, [t.column]: value };
  return { ...v, attributesJson: { ...(v.attributesJson && typeof v.attributesJson === 'object' ? v.attributesJson : {}), [t.json]: value } };
}

/**
 * Valida as variantes contra os eixos da categoria e entre si:
 *   - eixo obrigatório sem valor => AXIS_REQUIRED; valor fora das opções / inválido para o tipo => AXIS_INVALID (mesmas regras de
 *     attributeValidator; a grafia da opção da definição é a gravada);
 *   - valores livres que NÃO são eixo da categoria continuam aceitos (compatibilidade com variantes livres);
 *   - duas variantes com a mesma identidade => DUPLICATE_COMBINATION (inclusive sem eixos definidos).
 */
export function validateVariantAxes<T extends VariantIdentityInput>(axes: AttributeDefinitionLike[], variants: T[]): AxisValidationResult<T> {
  const errors: VariantAxisError[] = [];
  const items: Array<NormalizedVariant<T>> = [];

  variants.forEach((original, index) => {
    let v: T = { ...original };
    const label = variantLabel(original);
    for (const axis of axes) {
      const raw = readAxisValue(v, axis.code);
      const empty = raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');
      if (empty) {
        if (axis.isRequired) errors.push({ code: 'AXIS_REQUIRED', variantIndex: index, variantLabel: label, axis: axis.code, message: `A variação "${label}" precisa do valor de "${axis.name}".` });
        continue;
      }
      const r = validateAttributeValue(axis, raw);
      if (!r.ok) {
        errors.push({ code: 'AXIS_INVALID', variantIndex: index, variantLabel: label, axis: axis.code, message: `Variação "${label}": ${r.error!.message}` });
        continue;
      }
      const n = r.value!;
      const canonical = n.type === 'number' ? n.valueNumber! : n.type === 'select' ? n.options![0] : n.type === 'text' ? n.valueText! : String(raw).trim();
      v = writeAxisValue(v, axis.code, canonical);
    }
    items.push({ variant: v, key: buildVariantKey(v) });
  });

  const seen = new Map<string, number>();
  items.forEach((it, index) => {
    if (!it.key) return;
    const first = seen.get(it.key);
    if (first === undefined) { seen.set(it.key, index); return; }
    errors.push({
      code: 'DUPLICATE_COMBINATION',
      variantIndex: index,
      variantLabel: variantLabel(it.variant),
      message: `A combinação "${variantLabel(it.variant)}" repete a de "${variantLabel(items[first].variant)}". Cada combinação de variação só pode existir uma vez no produto.`,
    });
  });
  return { errors, items };
}

/** Eixos agrupados para a interface do assistente: Cor, a segunda dimensão (Tamanho ou Capacidade) e os demais. */
export function planAxisUi(axes: AttributeDefinitionLike[]): {
  colorAxis?: AttributeDefinitionLike;
  secondAxis?: AttributeDefinitionLike;
  secondColumn: 'size' | 'capacity';
  extraAxes: AttributeDefinitionLike[];
} {
  const colorAxis = axes.find((a) => 'column' in axisTarget(a.code) && (axisTarget(a.code) as any).column === 'color');
  const sizeAxis = axes.find((a) => (axisTarget(a.code) as any).column === 'size');
  const capacityAxis = axes.find((a) => (axisTarget(a.code) as any).column === 'capacity');
  const secondAxis = sizeAxis ?? capacityAxis;
  const secondColumn: 'size' | 'capacity' = secondAxis && secondAxis === capacityAxis ? 'capacity' : 'size';
  const extraAxes = axes.filter((a) => a !== colorAxis && a !== secondAxis);
  return { colorAxis, secondAxis, secondColumn, extraAxes };
}
