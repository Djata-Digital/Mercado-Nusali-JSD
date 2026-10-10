/**
 * Serviço CENTRAL das definições de atributos de categoria (Fase 2 do sistema de atributos).
 *
 * Única porta de escrita das definições (category_attributes): criação, edição, exclusão, substituição explícita de atributo herdado
 * e "desativar aqui". Também resolve os atributos EFETIVOS de uma categoria (herança) e informa o uso por produtos.
 *
 * Regras (todas no servidor; a tela só espelha):
 *   - unicidade de código por categoria (o índice único do banco é a última barreira; aqui a mensagem é clara, HTTP 409);
 *   - código estável e formato válido, códigos reservados (campos gerais do produto) recusados;
 *   - tipos permitidos, opções obrigatórias para seleção, limites numéricos coerentes;
 *   - HERANÇA SEGURA: um código já definido em um ancestral NÃO pode ser redefinido em silêncio; só por SUBSTITUIÇÃO EXPLÍCITA
 *     (overrides_id -> atributo do ancestral mais próximo, mesmo código, mesmo tipo e mesma função). Um código também não pode ser criado
 *     num ancestral se um descendente já o usa;
 *   - "desativar aqui": uma substituição inativa oculta o atributo herdado nesta categoria e abaixo, sem tocar no original;
 *   - ATRIBUTO EM USO (valores em produtos): código, tipo, função e unidade ficam travados; opções em uso não podem sair; limites só
 *     podem afrouxar; exclusão bloqueada (desative). Atributo substituído por outro não pode ser excluído nem ter código/tipo/função mudados.
 * Nada aqui toca em produtos, pedidos, pagamentos ou variantes.
 */
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { categories, categoryAttributes } from '../../../db/schema.js';
import {
  ATTRIBUTE_ROLE_LABELS,
  buildAttributeDraft,
  isLimitLoosened,
  validateAttributeDraft,
  type AttributeDraft,
  type FieldError,
} from '../../../utils/attributeRules.js';

export class AttributeDefinitionError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}
const fail = (status: number, code: string, message: string, details?: unknown) => new AttributeDefinitionError(status, code, message, details);

// ---------------------------------------------------------------- grafo de categorias

interface CatRow {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  isActive: boolean;
}
interface Graph {
  list: CatRow[];
  byId: Map<string, CatRow>;
  bySlug: Map<string, CatRow>;
}

async function loadGraph(db: any): Promise<Graph> {
  const rows: CatRow[] = await db
    .select({ id: categories.id, name: categories.name, slug: categories.slug, parentId: categories.parentId, isActive: categories.isActive })
    .from(categories);
  return { list: rows, byId: new Map(rows.map((r) => [r.id, r])), bySlug: new Map(rows.map((r) => [r.slug, r])) };
}

/** Cadeia raiz -> categoria (inclui a própria). Tolerante a ciclos. */
function chainTo(g: Graph, id: string, parentOf?: (c: CatRow) => string | null): CatRow[] {
  const chain: CatRow[] = [];
  const seen = new Set<string>();
  let cur = g.byId.get(id);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift(cur);
    const pid = parentOf ? parentOf(cur) : cur.parentId;
    cur = pid ? g.byId.get(pid) : undefined;
  }
  return chain;
}

function descendantIds(g: Graph, id: string): string[] {
  const kids = new Map<string, string[]>();
  for (const c of g.list) if (c.parentId) (kids.get(c.parentId) || kids.set(c.parentId, []).get(c.parentId)!).push(c.id);
  const out: string[] = [];
  const queue = [...(kids.get(id) || [])];
  const seen = new Set<string>([id]);
  while (queue.length) {
    const cur = queue.shift()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    out.push(cur);
    queue.push(...(kids.get(cur) || []));
  }
  return out;
}

// ---------------------------------------------------------------- serialização

/** numeric do Postgres chega como string: normaliza para número/nulo; options sempre lista de textos ou nulo. */
export function serializeAttribute(row: any) {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    ...row,
    minValue: num(row.minValue),
    maxValue: num(row.maxValue),
    optionsJson: Array.isArray(row.optionsJson) ? row.optionsJson.map(String) : row.optionsJson ?? null,
  };
}

// ---------------------------------------------------------------- herança (resolver)

/**
 * Atributos EFETIVOS de uma categoria (id ou slug): percorre a cadeia raiz -> categoria.
 *   - atributo ativo sem substituição: define/substitui o código (comportamento legado preservado para linhas antigas);
 *   - substituição explícita ATIVA: troca o atributo herdado;
 *   - substituição explícita INATIVA ("desativar aqui"): remove o código desta categoria e das abaixo;
 *   - atributo inativo sem substituição: ignorado (como antes).
 * A cadeia usa TODAS as categorias (um ancestral inativo não corta a herança). Categoria desconhecida => [].
 */
export async function resolveEffectiveAttributes(db: any, categoryIdOrSlug: string): Promise<any[]> {
  if (!db || !categoryIdOrSlug) return [];
  const g = await loadGraph(db);
  const target = g.byId.get(categoryIdOrSlug) || g.bySlug.get(categoryIdOrSlug);
  if (!target) return [];
  const chain = chainTo(g, target.id);
  const rows: any[] = await db
    .select()
    .from(categoryAttributes)
    .where(inArray(categoryAttributes.categoryId, chain.map((c) => c.id)))
    .orderBy(asc(categoryAttributes.sortOrder), asc(categoryAttributes.name));
  return resolveFromRows(g, target, chain, rows);
}

/**
 * Atributos EFETIVOS de UMA categoria a partir das linhas já carregadas (núcleo PURO do resolvedor: sem banco). É a ÚNICA implementação
 * de herança/substituição/desativação — usada pelo resolvedor de uma categoria e pelo lote do catálogo (filtros da busca).
 */
function resolveFromRows(g: Graph, target: CatRow, chain: CatRow[], rows: any[]): any[] {
  const effective = new Map<string, any>();
  const rowById = new Map<string, any>(rows.map((r) => [r.id, r]));
  // Origem sempre informada (Fase 4): categoria que DEFINE o atributo efetivo, se é herdado e, quando for uma substituição
  // explícita, de qual categoria veio o atributo substituído. inheritedFrom* continuam como antes (só quando herdado).
  const describe = (a: any, cat: CatRow) => {
    const replaced = a.overridesId ? rowById.get(a.overridesId) : undefined;
    const replacedCat = replaced ? g.byId.get(replaced.categoryId) : undefined;
    return {
      ...serializeAttribute(a),
      inheritedFrom: cat.id !== target.id ? cat.name : undefined,
      inheritedFromCategoryId: cat.id !== target.id ? cat.id : undefined,
      originCategoryId: cat.id,
      originCategoryName: cat.name,
      isInherited: cat.id !== target.id,
      isOverride: Boolean(a.overridesId),
      overridesCategoryId: replacedCat?.id,
      overridesCategoryName: replacedCat?.name,
    };
  };
  for (const cat of chain) {
    for (const a of rows.filter((r) => r.categoryId === cat.id)) {
      if (a.overridesId) {
        if (a.isActive === false) effective.delete(a.code);
        else effective.set(a.code, describe(a, cat));
        continue;
      }
      if (a.isActive === false) continue;
      effective.set(a.code, describe(a, cat));
    }
  }
  return Array.from(effective.values()).sort((a, b) => {
    if (a.isRequired !== b.isRequired) return a.isRequired ? -1 : 1;
    if ((a.sortOrder ?? 0) !== (b.sortOrder ?? 0)) return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    return String(a.name).localeCompare(String(b.name));
  });
}

/**
 * Atributos efetivos de VÁRIAS categorias de uma vez (uma consulta de categorias + uma de definições): é o que a busca do catálogo usa
 * para resolver, por categoria final, qual definição vale (herança, substituição explícita e "desativar aqui" já aplicadas).
 * Categoria desconhecida => lista vazia.
 */
export async function resolveEffectiveAttributesBatch(db: any, categoryIds: string[]): Promise<Map<string, any[]>> {
  const out = new Map<string, any[]>();
  if (!db || categoryIds.length === 0) return out;
  const g = await loadGraph(db);
  const chains = new Map<string, CatRow[]>();
  const needed = new Set<string>();
  for (const id of categoryIds) {
    const target = g.byId.get(id);
    if (!target) { out.set(id, []); continue; }
    const chain = chainTo(g, target.id);
    chains.set(id, chain);
    for (const c of chain) needed.add(c.id);
  }
  const rows: any[] = needed.size === 0 ? [] : await db
    .select()
    .from(categoryAttributes)
    .where(inArray(categoryAttributes.categoryId, Array.from(needed)))
    .orderBy(asc(categoryAttributes.sortOrder), asc(categoryAttributes.name));
  const byCategory = new Map<string, any[]>();
  for (const r of rows) (byCategory.get(r.categoryId) || byCategory.set(r.categoryId, []).get(r.categoryId)!).push(r);
  for (const [id, chain] of chains) {
    const chainRows = chain.flatMap((c) => byCategory.get(c.id) || []);
    out.set(id, resolveFromRows(g, g.byId.get(id)!, chain, chainRows));
  }
  return out;
}

/** Categoria (id ou slug) e TODAS as suas descendentes ativas. Desconhecida/inativa => lista vazia (nunca o catálogo inteiro). */
export async function categoryTreeIds(db: any, categoryIdOrSlug: string): Promise<{ rootId: string; ids: string[] } | null> {
  if (!db || !categoryIdOrSlug) return null;
  const g = await loadGraph(db);
  const root = g.byId.get(categoryIdOrSlug) || g.bySlug.get(categoryIdOrSlug);
  if (!root || root.isActive === false) return null;
  const ids = [root.id, ...descendantIds(g, root.id).filter((id) => g.byId.get(id)?.isActive !== false)];
  return { rootId: root.id, ids };
}

// ---------------------------------------------------------------- uso por produtos

export interface AttributeUsage {
  /** produtos que têm algum valor para o atributo (tabela tipada nova OU armazenamento legado por nome/código) */
  products: number;
  /** opções (select/multiselect) com ao menos um valor gravado */
  usedOptions: string[];
}

const rowsOf = (res: any): any[] => (Array.isArray(res) ? res : res?.rows ?? []);
/** Lista de textos como array SQL (via JSON: imune a vírgulas nos valores e válida mesmo vazia). */
const textArray = (items: string[]) => sql`ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(items)}::jsonb))`;

/**
 * Uso REAL de um atributo. Fontes: product_attribute_values (por attribute_id) e o armazenamento atual, que guarda o valor em
 * product_attributes sob o código OU o nome do atributo (chave de texto), restrito aos produtos da categoria do atributo e descendentes.
 */
export async function getAttributeUsage(db: any, attr: { id: string; categoryId: string; code: string; name: string; type: string }, graph?: Graph): Promise<AttributeUsage> {
  const g = graph || (await loadGraph(db));
  const scope = [attr.categoryId, ...descendantIds(g, attr.categoryId)];
  const keys = Array.from(new Set([attr.code.toLowerCase(), String(attr.name).toLowerCase()]));
  const prod = rowsOf(
    await db.execute(sql`
      SELECT count(*)::int AS n FROM (
        SELECT v.product_id FROM product_attribute_values v WHERE v.attribute_id = ${attr.id}
        UNION
        SELECT pa.product_id FROM product_attributes pa JOIN products p ON p.id = pa.product_id
          WHERE p.category_id = ANY(${textArray(scope)}) AND lower(pa.name) = ANY(${textArray(keys)})
      ) u`)
  );
  const products = Number(prod[0]?.n ?? 0);
  let usedOptions: string[] = [];
  if ((attr.type === 'select' || attr.type === 'multiselect') && products > 0) {
    const vals = rowsOf(
      await db.execute(sql`
        SELECT v.option_value AS v FROM product_attribute_values v WHERE v.attribute_id = ${attr.id} AND v.option_value IS NOT NULL
        UNION
        SELECT pa.value AS v FROM product_attributes pa JOIN products p ON p.id = pa.product_id
          WHERE p.category_id = ANY(${textArray(scope)}) AND lower(pa.name) = ANY(${textArray(keys)})
        LIMIT 5000`)
    );
    const set = new Set<string>();
    for (const r of vals) for (const piece of String(r.v ?? '').split(',')) if (piece.trim()) set.add(piece.trim());
    usedOptions = Array.from(set);
  }
  return { products, usedOptions };
}

/** Produtos existentes no escopo (categoria + descendentes), para avisar quantos ficariam incompletos ao tornar obrigatório. */
async function countScopeProducts(db: any, categoryId: string, g: Graph): Promise<number> {
  const scope = [categoryId, ...descendantIds(g, categoryId)];
  return Number(rowsOf(await db.execute(sql`SELECT count(*)::int AS n FROM products WHERE category_id = ANY(${textArray(scope)})`))[0]?.n ?? 0);
}

// ---------------------------------------------------------------- conflitos de código / herança

interface ConflictCheck {
  categoryId: string;
  code: string;
  type: string;
  role: string;
  overridesId?: string | null;
  selfId?: string;
}

/** Valida duplicidade, conflito com ancestrais (herança), com descendentes e a coerência da substituição explícita. */
async function assertNoCodeConflicts(db: any, g: Graph, c: ConflictCheck): Promise<{ nearestAncestor: any | null; warnings: string[] }> {
  const chain = chainTo(g, c.categoryId); // raiz -> categoria
  const ancestorIds = chain.slice(0, -1).map((x) => x.id);
  const descIds = descendantIds(g, c.categoryId);
  const scopeIds = [c.categoryId, ...ancestorIds, ...descIds];
  const sameCode: any[] = await db
    .select()
    .from(categoryAttributes)
    .where(and(inArray(categoryAttributes.categoryId, scopeIds), eq(categoryAttributes.code, c.code), c.selfId ? ne(categoryAttributes.id, c.selfId) : sql`true`));
  const catName = (id: string) => g.byId.get(id)?.name || id;

  const own = sameCode.find((r) => r.categoryId === c.categoryId);
  if (own) throw fail(409, 'ATTRIBUTE_CODE_DUPLICATE', `Já existe um atributo com o código "${c.code}" nesta categoria ("${own.name}"). Escolha outro código ou edite o existente.`, { field: 'code', existingId: own.id });

  // ancestral mais próximo que define o código (ordem da cadeia: o último é o mais próximo)
  const ancestorDefs = sameCode.filter((r) => ancestorIds.includes(r.categoryId)).sort((a, b) => ancestorIds.indexOf(a.categoryId) - ancestorIds.indexOf(b.categoryId));
  const nearest = ancestorDefs.length ? ancestorDefs[ancestorDefs.length - 1] : null;

  if (c.overridesId) {
    if (!nearest) throw fail(400, 'ATTRIBUTE_OVERRIDE_INVALID', 'A substituição precisa apontar para um atributo herdado de uma categoria superior com o mesmo código, e nenhum foi encontrado.', { field: 'overridesId' });
    if (nearest.id !== c.overridesId) {
      const target = ancestorDefs.find((r) => r.id === c.overridesId);
      if (!target) throw fail(400, 'ATTRIBUTE_OVERRIDE_INVALID', 'O atributo a substituir não existe em uma categoria superior ou não tem o mesmo código.', { field: 'overridesId' });
      throw fail(400, 'ATTRIBUTE_OVERRIDE_INVALID', `Substitua o atributo herdado mais próximo (de "${catName(nearest.categoryId)}"), não o de "${catName(target.categoryId)}".`, { field: 'overridesId', nearestId: nearest.id });
    }
    if (nearest.type !== c.type) throw fail(400, 'ATTRIBUTE_OVERRIDE_INVALID', `A substituição deve manter o tipo do atributo herdado (${nearest.type}). Crie um atributo novo com outro código se precisar de outro tipo.`, { field: 'type' });
    if (nearest.role !== c.role) throw fail(400, 'ATTRIBUTE_OVERRIDE_INVALID', `A substituição deve manter a função do atributo herdado (${ATTRIBUTE_ROLE_LABELS[nearest.role as 'spec'] || nearest.role}).`, { field: 'role' });
  } else if (nearest) {
    throw fail(
      409,
      'ATTRIBUTE_CODE_INHERITED_CONFLICT',
      `O código "${c.code}" já é usado pelo atributo herdado "${nearest.name}" de "${catName(nearest.categoryId)}". Para alterá-lo nesta categoria use "Substituir"; para ocultá-lo, use "Desativar aqui". Ou escolha outro código.`,
      { field: 'code', inheritedId: nearest.id, inheritedCategoryId: nearest.categoryId }
    );
  }

  const descDefs = sameCode.filter((r) => descIds.includes(r.categoryId));
  if (descDefs.length) {
    const d = descDefs[0];
    throw fail(
      409,
      'ATTRIBUTE_CODE_DESCENDANT_CONFLICT',
      `O código "${c.code}" já é usado em uma subcategoria ("${catName(d.categoryId)}"). Remova ou renomeie lá antes de defini-lo nesta categoria, para não haver dois atributos com o mesmo código no mesmo caminho.`,
      { field: 'code', descendantId: d.id, descendantCategoryId: d.categoryId }
    );
  }
  return { nearestAncestor: nearest, warnings: [] };
}

/** Avisos (não bloqueiam): outro atributo do mesmo caminho com o MESMO NOME mas código diferente (o vendedor veria dois "Cor"). */
async function duplicateNameWarnings(db: any, g: Graph, categoryId: string, name: string, code: string, selfId?: string): Promise<string[]> {
  const chain = chainTo(g, categoryId).map((c) => c.id);
  const scope = [...chain, ...descendantIds(g, categoryId)];
  const rows: any[] = await db.select().from(categoryAttributes).where(inArray(categoryAttributes.categoryId, scope));
  const key = name.trim().toLocaleLowerCase('pt-BR');
  return rows
    .filter((r) => r.id !== selfId && r.code !== code && r.isActive !== false && String(r.name).trim().toLocaleLowerCase('pt-BR') === key)
    .map((r) => `Já existe um atributo com o mesmo nome ("${r.name}", código "${r.code}") em "${g.byId.get(r.categoryId)?.name}". O vendedor poderá ver os dois campos.`);
}

// ---------------------------------------------------------------- criação

const newId = () => `attr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const SAFE_ID = /^attr_[a-zA-Z0-9_-]{3,200}$/;

function detailsFrom(errors: FieldError[]) {
  return errors.map((e) => ({ field: e.field, message: e.message }));
}

function assertDraftValid(draft: AttributeDraft) {
  const errors = validateAttributeDraft(draft);
  if (errors.length) throw fail(400, 'ATTRIBUTE_INVALID', errors[0].message, detailsFrom(errors));
}

export interface AttributeWriteResult {
  attribute: any;
  warnings: string[];
}

/**
 * Origem de um atributo gravado. É decidida SÓ pelo código do servidor (parâmetro `opts`, nunca lida do corpo da requisição): as rotas do
 * painel não passam `opts`, então tudo que vem do admin é 'admin'; a carga inicial controlada (scripts/attribute-matrix) passa 'seed'.
 * O CHECK category_attributes_source_check já aceita exatamente estes dois valores (Fase 1) — nenhuma migração.
 */
export type AttributeWriteSource = 'admin' | 'seed';
export interface AttributeWriteOptions { source?: AttributeWriteSource }

export async function createAttribute(db: any, categoryId: string, raw: Record<string, any>, opts: AttributeWriteOptions = {}): Promise<AttributeWriteResult> {
  const g = await loadGraph(db);
  const category = g.byId.get(categoryId);
  if (!category) throw fail(404, 'CATEGORY_NOT_FOUND', 'Categoria não encontrada.');

  const draft = buildAttributeDraft(raw);
  assertDraftValid(draft);

  let id = newId();
  if (raw.id !== undefined && raw.id !== null && String(raw.id).trim() !== '') {
    id = String(raw.id).trim();
    if (!SAFE_ID.test(id)) throw fail(400, 'ATTRIBUTE_INVALID', 'O ID informado é inválido (use "attr_" seguido de letras, números, "_" ou "-").', [{ field: 'id', message: 'ID inválido.' }]);
    const exists = await db.select({ id: categoryAttributes.id }).from(categoryAttributes).where(eq(categoryAttributes.id, id)).limit(1);
    if (exists.length) throw fail(409, 'ATTRIBUTE_ID_EXISTS', `Já existe um atributo com o ID "${id}".`);
  }

  const overridesId = raw.overridesId ? String(raw.overridesId) : null;
  await assertNoCodeConflicts(db, g, { categoryId, code: draft.code, type: draft.type, role: draft.role, overridesId });
  const warnings = await duplicateNameWarnings(db, g, categoryId, draft.name, draft.code);

  const now = new Date();
  const row = {
    id,
    categoryId,
    name: draft.name,
    code: draft.code,
    type: draft.type,
    role: draft.role,
    isRequired: draft.isRequired,
    optionsJson: draft.type === 'select' || draft.type === 'multiselect' ? draft.options : null,
    placeholder: draft.placeholder,
    helpText: draft.helpText,
    unit: draft.unit,
    sortOrder: draft.sortOrder,
    isActive: draft.isActive,
    minValue: draft.minValue === null ? null : String(draft.minValue),
    maxValue: draft.maxValue === null ? null : String(draft.maxValue),
    maxLength: draft.maxLength,
    decimals: draft.decimals,
    isFilterable: draft.isFilterable,
    displayGroup: draft.displayGroup,
    overridesId,
    source: opts.source === 'seed' ? 'seed' : 'admin', // nunca de raw.source: o cliente não escolhe a origem
    createdAt: now,
    updatedAt: now,
  };
  try {
    await db.insert(categoryAttributes).values(row as any);
  } catch (e: any) {
    // corrida: outro pedido criou o mesmo código entre a verificação e a gravação (índice único do banco)
    const msg = String(e?.cause?.message || e?.message || '');
    const code = e?.cause?.code || e?.code;
    if (code === '23505' || /category_attributes_cat_code_uq|duplicate key/i.test(msg)) {
      throw fail(409, 'ATTRIBUTE_CODE_DUPLICATE', `Já existe um atributo com o código "${draft.code}" nesta categoria.`, { field: 'code' });
    }
    throw e;
  }
  const [created] = await db.select().from(categoryAttributes).where(eq(categoryAttributes.id, id)).limit(1);
  return { attribute: serializeAttribute(created), warnings };
}

// ---------------------------------------------------------------- edição

export async function updateAttribute(db: any, attributeId: string, patch: Record<string, any>): Promise<AttributeWriteResult> {
  const [existing] = await db.select().from(categoryAttributes).where(eq(categoryAttributes.id, attributeId)).limit(1);
  if (!existing) throw fail(404, 'ATTRIBUTE_NOT_FOUND', 'Atributo não encontrado.');
  const g = await loadGraph(db);

  if (patch.overridesId !== undefined && (patch.overridesId || null) !== (existing.overridesId || null)) {
    throw fail(409, 'ATTRIBUTE_OVERRIDE_IMMUTABLE', 'A substituição não pode ser alterada. Exclua este atributo para restaurar a herança e crie outra substituição.', { field: 'overridesId' });
  }
  if (patch.categoryId !== undefined && patch.categoryId !== existing.categoryId) {
    throw fail(409, 'ATTRIBUTE_CATEGORY_IMMUTABLE', 'Um atributo não pode ser movido de categoria. Crie-o na categoria desejada.', { field: 'categoryId' });
  }

  // funde o corpo ao registro atual para validar o ESTADO FINAL
  const current = serializeAttribute(existing);
  // ao TROCAR o tipo (só possível sem uso), campos que não se aplicam ao novo tipo são limpos, salvo se enviados explicitamente
  if (patch.type !== undefined && patch.type !== current.type) {
    const t = String(patch.type);
    patch = { ...patch };
    if (t !== 'select' && t !== 'multiselect' && patch.options === undefined && patch.optionsJson === undefined) patch.options = [];
    if (t !== 'number') { if (patch.minValue === undefined) patch.minValue = null; if (patch.maxValue === undefined) patch.maxValue = null; if (patch.decimals === undefined) patch.decimals = null; }
    if (t !== 'text' && patch.maxLength === undefined) patch.maxLength = null;
    if (t === 'text' && patch.isFilterable === undefined) patch.isFilterable = false;
  }
  const merged: Record<string, any> = {
    name: patch.name ?? current.name,
    code: patch.code !== undefined ? patch.code : current.code,
    type: patch.type ?? current.type,
    role: patch.role ?? current.role,
    isRequired: patch.isRequired !== undefined ? patch.isRequired : current.isRequired,
    isActive: patch.isActive !== undefined ? patch.isActive : current.isActive,
    options: patch.options !== undefined ? patch.options : patch.optionsJson !== undefined ? patch.optionsJson : current.optionsJson ?? [],
    unit: patch.unit !== undefined ? patch.unit : current.unit,
    placeholder: patch.placeholder !== undefined ? patch.placeholder : current.placeholder,
    helpText: patch.helpText !== undefined ? patch.helpText : current.helpText,
    displayGroup: patch.displayGroup !== undefined ? patch.displayGroup : current.displayGroup,
    sortOrder: patch.sortOrder !== undefined ? patch.sortOrder : current.sortOrder,
    minValue: patch.minValue !== undefined ? patch.minValue : current.minValue,
    maxValue: patch.maxValue !== undefined ? patch.maxValue : current.maxValue,
    maxLength: patch.maxLength !== undefined ? patch.maxLength : current.maxLength,
    decimals: patch.decimals !== undefined ? patch.decimals : current.decimals,
    isFilterable: patch.isFilterable !== undefined ? patch.isFilterable : current.isFilterable,
  };
  const draft = buildAttributeDraft(merged);
  // código vazio no PATCH significa "manter" (não derivar do nome novo)
  if (patch.code === undefined || patch.code === null || String(patch.code).trim() === '') draft.code = current.code;
  assertDraftValid(draft);

  const usage = await getAttributeUsage(db, existing, g);
  const overriders: any[] = await db.select().from(categoryAttributes).where(eq(categoryAttributes.overridesId, existing.id));
  const catName = (id: string) => g.byId.get(id)?.name || id;
  const identityChanged: string[] = [];
  if (draft.code !== existing.code) identityChanged.push('código');
  if (draft.type !== existing.type) identityChanged.push('tipo');
  if (draft.role !== existing.role) identityChanged.push('função (especificação/eixo)');
  if ((draft.unit || null) !== (existing.unit || null)) identityChanged.push('unidade');

  if (identityChanged.length && usage.products > 0) {
    throw fail(409, 'ATTRIBUTE_IN_USE', `Este atributo já tem valores em ${usage.products} produto(s): ${identityChanged.join(', ')} não pode(m) ser alterado(s). Desative-o e crie outro atributo, se necessário.`, { field: identityChanged[0], products: usage.products });
  }
  if ((draft.code !== existing.code || draft.type !== existing.type || draft.role !== existing.role) && overriders.length) {
    throw fail(409, 'ATTRIBUTE_HAS_OVERRIDES', `Este atributo é substituído em ${overriders.length} categoria(s) (${overriders.slice(0, 3).map((o) => `"${catName(o.categoryId)}"`).join(', ')}): código, tipo e função não podem mudar.`, { overriders: overriders.map((o) => o.id) });
  }
  if (draft.code !== existing.code) {
    await assertNoCodeConflicts(db, g, { categoryId: existing.categoryId, code: draft.code, type: draft.type, role: draft.role, overridesId: existing.overridesId, selfId: existing.id });
  }
  if (existing.overridesId) {
    const [target] = await db.select().from(categoryAttributes).where(eq(categoryAttributes.id, existing.overridesId)).limit(1);
    if (target && (draft.type !== target.type || draft.role !== target.role)) {
      throw fail(400, 'ATTRIBUTE_OVERRIDE_INVALID', 'Uma substituição deve manter o tipo e a função do atributo herdado.', { field: draft.type !== target.type ? 'type' : 'role' });
    }
  }

  // opções em uso não podem sair; limites só podem afrouxar quando há valores
  if (usage.products > 0) {
    if ((existing.type === 'select' || existing.type === 'multiselect')) {
      const next = new Set(draft.options.map((o) => o.toLocaleLowerCase('pt-BR')));
      const removedInUse = usage.usedOptions.filter((o) => !next.has(o.toLocaleLowerCase('pt-BR')));
      if (removedInUse.length) {
        throw fail(409, 'ATTRIBUTE_OPTION_IN_USE', `A(s) opção(ões) ${removedInUse.slice(0, 5).map((o) => `"${o}"`).join(', ')} já está(ão) em uso por produtos e não pode(m) ser removida(s) nem renomeada(s). Adicione novas opções ou desative o atributo.`, { field: 'options', options: removedInUse });
      }
    }
    const prev = { min: current.minValue as number | null, max: current.maxValue as number | null };
    const tightened: string[] = [];
    if (!isLimitLoosened(prev.min, draft.minValue, 'min')) tightened.push('valor mínimo');
    if (!isLimitLoosened(prev.max, draft.maxValue, 'max')) tightened.push('valor máximo');
    if (!isLimitLoosened(existing.maxLength ?? null, draft.maxLength, 'max')) tightened.push('tamanho máximo');
    if (!isLimitLoosened(existing.decimals ?? null, draft.decimals, 'max')) tightened.push('casas decimais');
    if (tightened.length) throw fail(409, 'ATTRIBUTE_LIMIT_TIGHTENED', `Há ${usage.products} produto(s) com valores neste atributo: não é possível restringir ${tightened.join(', ')}. Só é possível afrouxar os limites.`, { field: 'limits', products: usage.products });
  }

  const warnings = await duplicateNameWarnings(db, g, existing.categoryId, draft.name, draft.code, existing.id);
  if (draft.isRequired && !existing.isRequired) {
    const scopeProducts = await countScopeProducts(db, existing.categoryId, g);
    const missing = Math.max(0, scopeProducts - usage.products);
    if (missing > 0) warnings.push(`${missing} produto(s) já publicado(s) nesta categoria não têm este valor e ficarão sinalizados como incompletos (nenhum produto é suspenso).`);
  }

  const now = new Date();
  const set: any = {
    name: draft.name,
    code: draft.code,
    type: draft.type,
    role: draft.role,
    isRequired: draft.isRequired,
    isActive: draft.isActive,
    optionsJson: draft.type === 'select' || draft.type === 'multiselect' ? draft.options : null,
    placeholder: draft.placeholder,
    helpText: draft.helpText,
    unit: draft.unit,
    sortOrder: draft.sortOrder,
    minValue: draft.minValue === null ? null : String(draft.minValue),
    maxValue: draft.maxValue === null ? null : String(draft.maxValue),
    maxLength: draft.maxLength,
    decimals: draft.decimals,
    isFilterable: draft.isFilterable,
    displayGroup: draft.displayGroup,
    updatedAt: now,
    adminModifiedAt: now,
  };
  try {
    await db.update(categoryAttributes).set(set).where(eq(categoryAttributes.id, attributeId));
  } catch (e: any) {
    const code = e?.cause?.code || e?.code;
    if (code === '23505') throw fail(409, 'ATTRIBUTE_CODE_DUPLICATE', `Já existe um atributo com o código "${draft.code}" nesta categoria.`, { field: 'code' });
    throw e;
  }
  const [updated] = await db.select().from(categoryAttributes).where(eq(categoryAttributes.id, attributeId)).limit(1);
  return { attribute: serializeAttribute(updated), warnings };
}

// ---------------------------------------------------------------- exclusão e "desativar aqui"

export async function deleteAttribute(db: any, attributeId: string): Promise<{ name: string; wasOverride: boolean }> {
  const [existing] = await db.select().from(categoryAttributes).where(eq(categoryAttributes.id, attributeId)).limit(1);
  if (!existing) throw fail(404, 'ATTRIBUTE_NOT_FOUND', 'Atributo não encontrado.');
  const g = await loadGraph(db);
  const overriders: any[] = await db.select().from(categoryAttributes).where(eq(categoryAttributes.overridesId, existing.id));
  if (overriders.length) {
    throw fail(409, 'ATTRIBUTE_HAS_OVERRIDES', `Este atributo é substituído em ${overriders.length} categoria(s) (${overriders.slice(0, 3).map((o) => `"${g.byId.get(o.categoryId)?.name || o.categoryId}"`).join(', ')}). Remova as substituições primeiro ou apenas desative o atributo.`, { overriders: overriders.map((o) => o.id) });
  }
  const usage = await getAttributeUsage(db, existing, g);
  if (usage.products > 0) {
    throw fail(409, 'ATTRIBUTE_IN_USE', `Este atributo tem valores em ${usage.products} produto(s) e não pode ser excluído. Desative-o para ocultá-lo sem perder os dados.`, { products: usage.products });
  }
  try {
    await db.delete(categoryAttributes).where(eq(categoryAttributes.id, attributeId));
  } catch (e: any) {
    const code = e?.cause?.code || e?.code;
    if (code === '23503') throw fail(409, 'ATTRIBUTE_IN_USE', 'Este atributo está referenciado por outros registros e não pode ser excluído. Desative-o.');
    throw e;
  }
  return { name: existing.name, wasOverride: !!existing.overridesId };
}

/** "Desativar aqui": cria, nesta categoria, uma substituição INATIVA do atributo herdado (o original não é alterado). */
export async function disableInheritedAttribute(db: any, categoryId: string, inheritedAttributeId: string, opts: AttributeWriteOptions = {}): Promise<AttributeWriteResult> {
  const g = await loadGraph(db);
  if (!g.byId.has(categoryId)) throw fail(404, 'CATEGORY_NOT_FOUND', 'Categoria não encontrada.');
  const [target] = await db.select().from(categoryAttributes).where(eq(categoryAttributes.id, inheritedAttributeId)).limit(1);
  if (!target) throw fail(404, 'ATTRIBUTE_NOT_FOUND', 'Atributo herdado não encontrado.');
  const chain = chainTo(g, categoryId);
  if (!chain.slice(0, -1).some((c) => c.id === target.categoryId)) {
    throw fail(400, 'ATTRIBUTE_OVERRIDE_INVALID', 'Só é possível desativar aqui um atributo definido em uma categoria superior.');
  }
  if (target.isActive === false && !target.overridesId) throw fail(409, 'ATTRIBUTE_ALREADY_INACTIVE', 'O atributo herdado já está inativo.');
  const result = await createAttribute(db, categoryId, {
    name: target.name,
    code: target.code,
    type: target.type,
    role: target.role,
    isRequired: false,
    isActive: false,
    options: Array.isArray(target.optionsJson) ? target.optionsJson : [],
    unit: target.unit,
    sortOrder: target.sortOrder ?? 0,
    minValue: target.minValue,
    maxValue: target.maxValue,
    maxLength: target.maxLength,
    decimals: target.decimals,
    overridesId: target.id,
  }, opts);
  return result;
}

// ---------------------------------------------------------------- leitura para o painel

/**
 * Tudo que o modal do admin precisa de uma categoria: atributos próprios (com uso e quem substituem), atributos HERDADOS com a categoria
 * de origem e o estado nesta categoria (herdado / substituído / desativado aqui) e os atributos efetivos que o vendedor verá.
 */
export async function listForCategory(db: any, categoryId: string) {
  const g = await loadGraph(db);
  const category = g.byId.get(categoryId);
  if (!category) throw fail(404, 'CATEGORY_NOT_FOUND', 'Categoria não encontrada.');
  const chain = chainTo(g, categoryId);

  const ownRows: any[] = await db.select().from(categoryAttributes).where(eq(categoryAttributes.categoryId, categoryId)).orderBy(asc(categoryAttributes.sortOrder), asc(categoryAttributes.name));
  const ids = ownRows.map((r) => r.id);
  const overriders: any[] = ids.length ? await db.select().from(categoryAttributes).where(inArray(categoryAttributes.overridesId, ids)) : [];
  const own = [];
  for (const r of ownRows) {
    const usage = await getAttributeUsage(db, r, g);
    const targetRow = r.overridesId ? await db.select().from(categoryAttributes).where(eq(categoryAttributes.id, r.overridesId)).limit(1) : [];
    own.push({
      ...serializeAttribute(r),
      usageCount: usage.products,
      usedOptions: usage.usedOptions,
      overriddenBy: overriders.filter((o) => o.overridesId === r.id).map((o) => ({ id: o.id, categoryId: o.categoryId, categoryName: g.byId.get(o.categoryId)?.name || o.categoryId })),
      overridesName: targetRow[0] ? targetRow[0].name : null,
      overridesCategoryName: targetRow[0] ? g.byId.get(targetRow[0].categoryId)?.name || null : null,
      isDisabledOverride: !!r.overridesId && r.isActive === false,
    });
  }

  const parentId = category.parentId;
  const inheritedRaw = parentId ? await resolveEffectiveAttributes(db, parentId) : [];
  const ownByCode = new Map(ownRows.map((r) => [r.code, r]));
  const inherited = inheritedRaw.map((a) => {
    const mine = ownByCode.get(a.code);
    const status = mine && mine.overridesId ? (mine.isActive === false ? 'disabled' : 'overridden') : 'inherited';
    return {
      ...a,
      originCategoryId: a.categoryId,
      originCategoryName: g.byId.get(a.categoryId)?.name || a.categoryId,
      status,
      overrideId: mine?.overridesId ? mine.id : null,
    };
  });

  const effective = await resolveEffectiveAttributes(db, categoryId);
  return {
    category: { id: category.id, name: category.name, slug: category.slug, parentId: category.parentId },
    path: chain.map((c) => ({ id: c.id, name: c.name })),
    own,
    inherited,
    effective,
  };
}

// ---------------------------------------------------------------- troca de pai (proteção da herança)

/**
 * Antes de mover uma categoria para outro pai: bloqueia se a subárvore tiver produtos (os atributos efetivos deles mudariam) ou se a
 * nova posição criar conflito de código/substituição com os novos ancestrais. Chamada pela rota PATCH /admin/categories/:id.
 */
export async function assertCategoryMoveAllowed(db: any, categoryId: string, newParentId: string | null): Promise<void> {
  const g = await loadGraph(db);
  const cat = g.byId.get(categoryId);
  if (!cat) return;
  if ((cat.parentId || null) === (newParentId || null)) return;

  const subtree = [categoryId, ...descendantIds(g, categoryId)];
  const prods = Number(rowsOf(await db.execute(sql`SELECT count(*)::int AS n FROM products WHERE category_id = ANY(${textArray(subtree)})`))[0]?.n ?? 0);
  if (prods > 0) throw fail(409, 'CATEGORY_MOVE_HAS_PRODUCTS', `Esta categoria (ou suas subcategorias) tem ${prods} produto(s): mudar o pai alteraria os atributos exigidos deles. Desative a categoria ou crie a estrutura desejada.`);

  const attrs: any[] = await db.select().from(categoryAttributes).where(inArray(categoryAttributes.categoryId, [...g.byId.keys()]));
  const parentOf = (c: CatRow) => (c.id === categoryId ? newParentId : c.parentId);
  for (const a of attrs.filter((x) => subtree.includes(x.categoryId))) {
    const chainAfter = chainTo(g, a.categoryId, parentOf);
    const ancestorIds = chainAfter.slice(0, -1).map((c) => c.id);
    const defs = attrs.filter((x) => x.code === a.code && x.id !== a.id && ancestorIds.includes(x.categoryId)).sort((p, q) => ancestorIds.indexOf(p.categoryId) - ancestorIds.indexOf(q.categoryId));
    const nearest = defs.length ? defs[defs.length - 1] : null;
    if (a.overridesId) {
      if (!nearest || nearest.id !== a.overridesId) throw fail(409, 'CATEGORY_MOVE_ATTRIBUTE_CONFLICT', `Mover esta categoria quebraria a substituição do atributo "${a.name}" (o atributo herdado deixaria de estar acima dela).`, { attributeId: a.id });
    } else if (nearest) {
      throw fail(409, 'CATEGORY_MOVE_ATTRIBUTE_CONFLICT', `Mover esta categoria geraria conflito: o atributo "${a.name}" (código "${a.code}") já existe em "${g.byId.get(nearest.categoryId)?.name}", acima da nova posição.`, { attributeId: a.id });
    }
  }
}
