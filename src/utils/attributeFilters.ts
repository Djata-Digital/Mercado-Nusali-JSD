/**
 * P3 (pós-matriz v2) — filtros do comprador por característica (PURO: sem rede, sem banco; usado pelo servidor e pela tela).
 *
 * Um filtro por CÓDIGO de atributo da categoria:
 *   - seleção / múltipla seleção: lista de opções (OU entre as opções do mesmo atributo);
 *   - Sim/Não: true | false;
 *   - número: intervalo { min?, max? }.
 * Vários atributos combinam com E. Na URL/API vai como JSON compacto e canônico (\`attrs\`), com limites rígidos de tamanho.
 */
export type AttributeFilterValue = string[] | boolean | { min?: number; max?: number };
export type AttributeFilters = Record<string, AttributeFilterValue>;

export const ATTR_FILTER_LIMITS = { maxAttributes: 12, maxValuesPerAttribute: 25, maxValueLength: 100, maxJsonLength: 4000 } as const;

const CODE_RE = /^[a-z0-9][a-z0-9_]{0,63}$/;

export interface ParsedAttributeFilters { filters: AttributeFilters; errors: string[] }

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const toNumber = (v: unknown): number | undefined => {
  if (isFiniteNumber(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v.trim().replace(',', '.')))) return Number(v.trim().replace(',', '.'));
  return undefined;
};

/** Entrada solta (string JSON ou objeto) -> filtros válidos + a lista de problemas ignorados. Nunca lança. */
export function parseAttributeFilters(raw: unknown): ParsedAttributeFilters {
  const errors: string[] = [];
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    if (raw.trim() === '') return { filters: {}, errors };
    if (raw.length > ATTR_FILTER_LIMITS.maxJsonLength) return { filters: {}, errors: ['attrs muito longo'] };
    try { obj = JSON.parse(raw); } catch { return { filters: {}, errors: ['attrs não é um JSON válido'] }; }
  }
  if (obj === undefined || obj === null) return { filters: {}, errors };
  if (typeof obj !== 'object' || Array.isArray(obj)) return { filters: {}, errors: ['attrs deve ser um objeto'] };

  const filters: AttributeFilters = {};
  for (const [code, value] of Object.entries(obj as Record<string, unknown>)) {
    if (Object.keys(filters).length >= ATTR_FILTER_LIMITS.maxAttributes) { errors.push('atributos demais; o excedente foi ignorado'); break; }
    if (!CODE_RE.test(code)) { errors.push(`código inválido: ${code.slice(0, 40)}`); continue; }
    if (typeof value === 'boolean') { filters[code] = value; continue; }
    if (Array.isArray(value)) {
      const vals = Array.from(new Set(value.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter((x) => x !== '' && x.length <= ATTR_FILTER_LIMITS.maxValueLength)));
      if (vals.length > ATTR_FILTER_LIMITS.maxValuesPerAttribute) errors.push(`${code}: opções demais; o excedente foi ignorado`);
      if (vals.length > 0) filters[code] = vals.slice(0, ATTR_FILTER_LIMITS.maxValuesPerAttribute);
      continue;
    }
    if (value && typeof value === 'object') {
      const r = value as Record<string, unknown>;
      const min = r.min === undefined || r.min === null || r.min === '' ? undefined : toNumber(r.min);
      const max = r.max === undefined || r.max === null || r.max === '' ? undefined : toNumber(r.max);
      if ((r.min !== undefined && r.min !== null && r.min !== '' && min === undefined) || (r.max !== undefined && r.max !== null && r.max !== '' && max === undefined)) { errors.push(`${code}: intervalo inválido`); continue; }
      if (min !== undefined && max !== undefined && min > max) { errors.push(`${code}: mínimo maior que o máximo`); continue; }
      if (min === undefined && max === undefined) continue;
      filters[code] = { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) };
      continue;
    }
    errors.push(`${code}: valor não suportado`);
  }
  return { filters, errors };
}

/** JSON canônico (chaves e opções ordenadas): mesma busca => mesma string (URL estável e chave de cache). Vazio => undefined. */
export function serializeAttributeFilters(filters: AttributeFilters | null | undefined): string | undefined {
  const entries = Object.entries(filters ?? {}).filter(([, v]) => !isEmptyValue(v)).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  if (entries.length === 0) return undefined;
  const canon: AttributeFilters = {};
  for (const [code, v] of entries) canon[code] = Array.isArray(v) ? [...v].sort() : v;
  return JSON.stringify(canon);
}

function isEmptyValue(v: AttributeFilterValue | undefined): boolean {
  if (v === undefined || v === null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'boolean') return false;
  return v.min === undefined && v.max === undefined;
}

export function countActiveAttributeFilters(filters: AttributeFilters | null | undefined): number {
  return Object.values(filters ?? {}).filter((v) => !isEmptyValue(v)).length;
}

// ---------- operações imutáveis para a tela

/** Marca/desmarca uma opção (seleção e múltipla seleção). */
export function toggleAttributeOption(filters: AttributeFilters, code: string, option: string): AttributeFilters {
  const cur = Array.isArray(filters[code]) ? (filters[code] as string[]) : [];
  const next = cur.includes(option) ? cur.filter((o) => o !== option) : [...cur, option];
  const out = { ...filters };
  if (next.length === 0) delete out[code]; else out[code] = next;
  return out;
}

/** Sim/Não: o mesmo valor de novo limpa o filtro ("Todos"). */
export function setAttributeBoolean(filters: AttributeFilters, code: string, value: boolean | null): AttributeFilters {
  const out = { ...filters };
  if (value === null || filters[code] === value) delete out[code]; else out[code] = value;
  return out;
}

/** Intervalo numérico; ambos vazios limpa o filtro. Aceita texto digitado (vírgula decimal); inválido é ignorado. */
export function setAttributeRange(filters: AttributeFilters, code: string, min: string | number | undefined | null, max: string | number | undefined | null): AttributeFilters {
  const parsed = parseAttributeFilters({ [code]: { min: min === '' ? undefined : min, max: max === '' ? undefined : max } });
  const out = { ...filters };
  if (parsed.filters[code] === undefined) delete out[code]; else out[code] = parsed.filters[code];
  return out;
}

export function clearAttributeFilter(filters: AttributeFilters, code: string): AttributeFilters {
  const out = { ...filters };
  delete out[code];
  return out;
}

// ---------- resposta dos facets (formato compartilhado servidor <-> tela)

export interface FacetOption { value: string; count: number }

export interface AttributeFacet {
  code: string;
  name: string;
  type: 'select' | 'multiselect' | 'boolean' | 'number';
  unit: string | null;
  decimals: number | null;
  displayGroup: string | null;
  /** select / multiselect: só as opções que existem entre os produtos (count > 0), na ordem da definição. */
  options?: FacetOption[];
  /** boolean: quantos produtos com Sim / Não. */
  bool?: { yes: number; no: number };
  /** number: menor e maior valor existente. */
  range?: { min: number; max: number };
}

export interface CatalogFacets {
  total: number;
  brands: FacetOption[];
  conditions: FacetOption[];
  price: { min: number; max: number } | null;
  attributes: AttributeFacet[];
  /** códigos de atributo recebidos que não valem para esta categoria (ignorados). */
  ignoredAttributes: string[];
}
