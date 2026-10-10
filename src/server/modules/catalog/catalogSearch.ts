/**
 * P3 (pós-matriz v2) — BUSCA e FILTROS do catálogo por características. Sem tabela nova: tudo sobre product_attribute_values e as
 * definições que já existem (category_attributes), pelo MESMO resolvedor de herança/substituição/desativação.
 *
 * Como o filtro por característica respeita a matriz:
 *   1. para cada categoria do escopo resolve-se o atributo EFETIVO de cada código (resolveEffectiveAttributesBatch); só entram atributos
 *      ativos, de função "spec" e marcados como filtráveis (isFilterable) dos tipos seleção, múltipla seleção, Sim/Não e número;
 *   2. o valor só vale se estiver gravado na definição efetiva DAQUELA categoria do produto (par categoria -> atributo): valor órfão de
 *      atributo que foi substituído/desativado depois nunca filtra nem aparece nos facets;
 *   3. a consulta é um EXISTS por atributo sobre product_attribute_values (índices por atributo+opção/número/booleano já existem).
 *
 * Pesquisa textual: título, marca, descrição, NOME DA CATEGORIA e valores das características (opção e texto) de atributos ativos de
 * especificação; sem acento, com sinônimos do dicionário da busca. A relevância pesa título > marca > categoria > descrição > característica.
 */
import { and, or, sql, type SQL } from 'drizzle-orm';
import { products } from '../../../db/schema.js';
import { getSynonymsForTerm, normalizeText } from '../../../utils/searchEngine.js';
import { resolveEffectiveAttributesBatch } from './attributeDefinitionService.js';
import type { AttributeFilters } from '../../../utils/attributeFilters.js';

export const FILTERABLE_TYPES = ['select', 'multiselect', 'boolean', 'number'] as const;
export type FilterableType = (typeof FILTERABLE_TYPES)[number];

export interface FilterableAttribute {
  code: string;
  name: string;
  type: FilterableType;
  unit: string | null;
  decimals: number | null;
  displayGroup: string | null;
  sortOrder: number;
  /** opções da definição, na ordem (seleção/múltipla seleção) */
  options: string[];
  /** pares (categoria final -> id do atributo EFETIVO naquela categoria) */
  pairs: Array<{ cid: string; aid: string }>;
}
export type AttributeScope = Map<string, FilterableAttribute>;

/** Atributos filtráveis EFETIVOS para um conjunto de categorias, agrupados por código. Tipos conflitantes no mesmo código: vale o do primeiro. */
export async function buildAttributeScope(db: any, categoryIds: string[]): Promise<AttributeScope> {
  const scope: AttributeScope = new Map();
  if (categoryIds.length === 0) return scope;
  const effective = await resolveEffectiveAttributesBatch(db, categoryIds);
  for (const [cid, list] of effective) {
    for (const a of list) {
      if (a.isActive === false || !a.isFilterable || (a.role ?? 'spec') !== 'spec') continue;
      if (!(FILTERABLE_TYPES as readonly string[]).includes(a.type)) continue;
      let entry = scope.get(a.code);
      if (!entry) {
        entry = {
          code: a.code, name: a.name, type: a.type, unit: a.unit ?? null, decimals: a.decimals ?? null, displayGroup: a.displayGroup ?? null,
          sortOrder: Number(a.sortOrder ?? 0), options: Array.isArray(a.optionsJson) ? a.optionsJson.map(String) : [], pairs: [],
        };
        scope.set(a.code, entry);
      }
      if (entry.type !== a.type) continue;
      entry.pairs.push({ cid, aid: a.id });
      // categorias diferentes podem ter opções diferentes (substituição): une, mantendo a ordem da primeira
      if (Array.isArray(a.optionsJson)) for (const o of a.optionsJson.map(String)) if (!entry.options.includes(o)) entry.options.push(o);
    }
  }
  return scope;
}

const pairsSql = (pairs: Array<{ cid: string; aid: string }>): SQL => sql`jsonb_to_recordset(${JSON.stringify(pairs)}::jsonb) AS e(cid text, aid text)`;

/** Fragmento "este produto tem, na definição efetiva da sua categoria, um valor que satisfaz `predicate`" (v = product_attribute_values). */
export function attributeValueExists(attr: FilterableAttribute, predicate: SQL): SQL {
  return sql`EXISTS (
    SELECT 1 FROM product_attribute_values v
    JOIN ${pairsSql(attr.pairs)} ON e.aid = v.attribute_id
    WHERE v.product_id = ${products.id} AND e.cid = ${products.categoryId} AND ${predicate}
  )`;
}

export interface AttributeConditions {
  /** uma condição por código de atributo (para os facets poderem excluir a própria) */
  byCode: Map<string, SQL>;
  /** códigos recebidos que não valem para o escopo (inexistente, não filtrável, inativo, tipo incompatível) */
  ignored: string[];
}

export function buildAttributeConditions(filters: AttributeFilters | undefined, scope: AttributeScope): AttributeConditions {
  const byCode = new Map<string, SQL>();
  const ignored: string[] = [];
  for (const [code, value] of Object.entries(filters ?? {})) {
    const attr = scope.get(code);
    if (!attr || attr.pairs.length === 0) { ignored.push(code); continue; }
    if ((attr.type === 'select' || attr.type === 'multiselect') && Array.isArray(value) && value.length > 0) {
      byCode.set(code, attributeValueExists(attr, sql`v.option_value IN (${sql.join(value.map((o) => sql`${o}`), sql`, `)})`));
    } else if (attr.type === 'boolean' && typeof value === 'boolean') {
      byCode.set(code, attributeValueExists(attr, sql`v.value_bool = ${value}`));
    } else if (attr.type === 'number' && value && typeof value === 'object' && !Array.isArray(value)) {
      const parts: SQL[] = [];
      if (value.min !== undefined) parts.push(sql`v.value_number >= ${String(value.min)}::numeric`);
      if (value.max !== undefined) parts.push(sql`v.value_number <= ${String(value.max)}::numeric`);
      if (parts.length === 0) continue;
      byCode.set(code, attributeValueExists(attr, sql.join(parts, sql` AND `)));
    } else {
      ignored.push(code);
    }
  }
  return { byCode, ignored };
}

// ---------------------------------------------------------------- pesquisa textual

const ACCENTS_FROM = 'áàâãäéèêëíìîïóòôõöúùûüçñ';
const ACCENTS_TO = 'aaaaaeeeeiiiiooooouuuucn';
/** Texto da coluna sem acento e em minúsculas (compara com termos já normalizados por normalizeText). */
const norm = (col: SQL | any): SQL => sql`translate(lower(coalesce(${col}, '')), ${ACCENTS_FROM}, ${ACCENTS_TO})`;
const likePattern = (term: string) => `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * Uma palavra da pesquisa: a palavra digitada (vale como trecho: "cel" acha "celular") e seus sinônimos do dicionário (valem só como
 * PALAVRA INTEIRA, com 4+ letras — "ios" ou "tab" nunca casam no meio de outra palavra). Só a palavra digitada pontua na relevância.
 */
export interface SearchToken { exact: string; synonyms: string[] }

/** Termos da pesquisa (máx. 6 palavras de 2+ letras; até 5 sinônimos por palavra). */
export function parseSearchTokens(q: string | undefined | null): SearchToken[] {
  const words = normalizeText(String(q ?? '')).split(' ').filter((w) => w.length >= 2).slice(0, 6);
  return words.map((w) => ({
    exact: w,
    synonyms: Array.from(new Set(getSynonymsForTerm(w).map((s) => s.trim()).filter((s) => s && s !== w && s.length >= 4 && s.length <= 40))).slice(0, 5),
  }));
}

/** Coluna só com letras/números e espaços nas pontas (para casar palavra inteira com "% termo %"). */
const wordsNorm = (col: SQL | any): SQL => sql`(' ' || regexp_replace(${norm(col)}, '[^a-z0-9]+', ' ', 'g') || ' ')`;
const wordPattern = (term: string) => `% ${term.replace(/[\\%_]/g, (c) => `\\${c}`)} %`;

/** A coluna contém o termo digitado (trecho) ou um sinônimo (palavra inteira). `exactOnly` ignora os sinônimos (relevância). */
const tokenLike = (col: SQL | any, t: SearchToken, exactOnly = false): SQL => {
  const exact = sql`${norm(col)} LIKE ${likePattern(t.exact)}`;
  if (exactOnly || t.synonyms.length === 0) return exact;
  return sql`(${exact} OR ${wordsNorm(col)} LIKE ANY (ARRAY[${sql.join(t.synonyms.map((v) => sql`${wordPattern(v)}`), sql`, `)}]))`;
};

const attributeTextMatch = (t: SearchToken, exactOnly = false): SQL => sql`${products.id} IN (
  SELECT av.product_id FROM product_attribute_values av
  JOIN category_attributes ca ON ca.id = av.attribute_id
  WHERE ca.is_active = true AND ca.role = 'spec'
    AND (${tokenLike(sql`av.option_value`, t, exactOnly)} OR ${tokenLike(sql`av.value_text`, t, exactOnly)})
)`;

const categoryNameMatch = (t: SearchToken, exactOnly = false): SQL => sql`${products.categoryId} IN (SELECT c.id FROM categories c WHERE ${tokenLike(sql`c.name`, t, exactOnly)})`;

/** Todas as palavras precisam aparecer (E); cada palavra pode aparecer em qualquer campo ou em qualquer sinônimo (OU). */
export function textSearchCondition(tokens: SearchToken[]): SQL | undefined {
  if (tokens.length === 0) return undefined;
  const perToken = tokens.map((t) => or(
    tokenLike(products.title, t),
    tokenLike(products.brand, t),
    tokenLike(products.description, t),
    categoryNameMatch(t),
    attributeTextMatch(t),
  )!);
  return perToken.length === 1 ? perToken[0] : and(...perToken);
}

/** Pontuação de relevância (maior = melhor): título 40, marca 30, categoria 20, descrição 10, característica 6, somando por palavra. */
export function textRelevanceScore(tokens: SearchToken[]): SQL | undefined {
  if (tokens.length === 0) return undefined;
  const parts = tokens.map((t) => sql`(
    CASE WHEN ${tokenLike(products.title, t, true)} THEN 40 ELSE 0 END
    + CASE WHEN ${tokenLike(products.brand, t, true)} THEN 30 ELSE 0 END
    + CASE WHEN ${categoryNameMatch(t, true)} THEN 20 ELSE 0 END
    + CASE WHEN ${tokenLike(products.description, t, true)} THEN 10 ELSE 0 END
    + CASE WHEN ${attributeTextMatch(t, true)} THEN 6 ELSE 0 END
  )`);
  return sql.join(parts, sql` + `);
}

// ---------------------------------------------------------------- condição do produto

/** 'new' | 'used' | 'refurbished' (ou os rótulos em português da interface) -> valor gravado; desconhecido/"all" => undefined (sem filtro). */
export function normalizeConditionFilter(raw: unknown): 'new' | 'used' | 'refurbished' | undefined {
  const v = String(raw ?? '').trim().toLowerCase();
  const map: Record<string, 'new' | 'used' | 'refurbished'> = { new: 'new', novo: 'new', used: 'used', usado: 'used', refurbished: 'refurbished', recondicionado: 'refurbished' };
  return map[v];
}
