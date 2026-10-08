/**
 * ATRIBUTOS FASE 6 — edição segura dos atributos de um produto já publicado (e troca de subcategoria).
 *
 * Contrato do payload (PATCH /seller/products/:id):
 * (nome distinto de `attributes`/`attributeValues`, que o GET do vendedor devolve e o assistente antigo reenvia no PATCH)
 *   attributeUpdates: { [código]: valor | null }   — mapa PARCIAL
 *     - código ausente  => não altera (valor atual preservado);
 *     - null / "" / lista vazia de multiseleção => remove, SOMENTE se o atributo for opcional (obrigatório => erro);
 *     - 0 e false são valores válidos; lista vazia em tipo que não é multiseleção é erro de tipo.
 *   categoryId: outra subcategoria FOLHA ativa => troca de categoria:
 *     - valores compatíveis são preservados (mesmo código e ainda válidos na definição nova);
 *     - incompatíveis só são removidos com confirmAttributeRemoval === true (senão 409 ATTRIBUTE_LOSS_CONFIRMATION_REQUIRED, nada gravado);
 *     - obrigatórios novos precisam estar preenchidos (valores preservados ou enviados em `attributes`).
 *
 * Tudo em UMA transação com o UPDATE do produto: atributos tipados (fonte principal), espelho legado (attributes_json e product_attributes)
 * e auditoria. Variantes, estoque, preço e imagens nunca são tocados aqui. Requisições que não trazem `attributes` nem mudam a
 * categoria não passam por este serviço (obrigatórios criados depois nunca bloqueiam preço/estoque).
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { auditLogs, categories, productAttributeValues, productAttributes, products } from '../../../db/schema.js';
import { RESERVED_ATTRIBUTE_CODES } from '../../../utils/attributeRules.js';
import { resolveEffectiveAttributes } from './attributeDefinitionService.js';
import { composeProductSpecs, loadProductAttributeValues, toValueRows } from './attributeValueService.js';
import {
  ProductAttributeValidationError,
  normalizeLookupKey,
  validateAttributeValue,
  type AttributeValueError,
  type NormalizedAttributeValue,
} from '../../../utils/attributeValidator.js';

export class ProductAttributeUpdateError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'ProductAttributeUpdateError';
  }
}

export interface RemovedAttribute { code: string; name: string; value: string; reason: string }
export interface AttributeChange { code: string; name: string; before: string | null; after: string | null }

export interface AttributeUpdatePlan {
  categoryChange: null | { fromId: string | null; fromName: string | null; toId: string; toName: string };
  finalValues: NormalizedAttributeValue[];
  /** Códigos cujas linhas tipadas são apagadas antes de inserir `finalValues` (os demais — ex.: atributo desativado — ficam como estão). */
  rewriteCodes: string[];
  /** Novo products.attributes_json (espelho legado). */
  legacyJson: Record<string, unknown>;
  /** Nomes (normalizados) das linhas de product_attributes a apagar antes de reinserir o espelho. */
  legacyDeleteKeys: string[];
  changes: AttributeChange[];
  removed: RemovedAttribute[];
  preserved: string[];
}

export interface PlanInput {
  productId: string;
  /** Linha atual de products (lida dentro da transação, com a linha travada). */
  product: { id: string; categoryId: string | null; attributesJson?: unknown };
  /** `attributes` do payload (undefined = não enviado). */
  patch?: unknown;
  /** categoryId pedido (id ou slug); undefined/igual ao atual = sem troca. */
  requestedCategory?: unknown;
  confirmRemoval?: boolean;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Resolve a categoria pedida: precisa existir, estar ativa e ser FOLHA (sem subcategoria ativa), como na criação. */
export async function resolveTargetCategory(db: any, raw: unknown): Promise<{ id: string; name: string }> {
  const key = typeof raw === 'string' ? raw.trim() : '';
  if (!key) throw new ProductAttributeUpdateError(400, 'PRODUCT_CATEGORY_INVALID', 'Informe a nova categoria do produto.');
  const rows = await db.select().from(categories).where(sql`${categories.id} = ${key} OR ${categories.slug} = ${key}`).limit(1);
  const cat = rows[0];
  if (!cat) throw new ProductAttributeUpdateError(400, 'PRODUCT_CATEGORY_INVALID', `Categoria "${key}" não encontrada.`);
  if (cat.isActive === false) throw new ProductAttributeUpdateError(400, 'PRODUCT_CATEGORY_INVALID', `A categoria "${cat.name}" está desativada.`);
  const child = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.parentId, cat.id), eq(categories.isActive, true))).limit(1);
  if (child[0]) {
    throw new ProductAttributeUpdateError(400, 'PRODUCT_CATEGORY_NOT_LEAF', `A categoria "${cat.name}" possui subcategorias. Selecione uma subcategoria mais específica.`);
  }
  return { id: cat.id, name: cat.name };
}

function isClear(def: { type: string }, v: unknown): boolean {
  if (v === null) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  if (Array.isArray(v) && v.length === 0 && def.type === 'multiselect') return true;
  return false;
}

/**
 * Monta o plano de gravação (sem escrever nada). Lança ProductAttributeValidationError (400) com todos os erros por campo,
 * ou ProductAttributeUpdateError (409 confirmação de perda / 400 categoria inválida).
 */
export async function planAttributeUpdate(db: any, input: PlanInput): Promise<AttributeUpdatePlan> {
  const { product } = input;
  if (input.patch !== undefined && !isPlainObject(input.patch)) {
    throw new ProductAttributeUpdateError(400, 'PRODUCT_ATTRIBUTES_INVALID', 'Os atributos devem ser enviados como um objeto { código: valor }.');
  }
  const patch = (input.patch ?? {}) as Record<string, unknown>;

  // ---- categoria alvo
  let categoryChange: AttributeUpdatePlan['categoryChange'] = null;
  let targetCategoryId = product.categoryId ?? '';
  if (input.requestedCategory !== undefined && input.requestedCategory !== null && String(input.requestedCategory).trim() !== '') {
    const target = await resolveTargetCategory(db, input.requestedCategory);
    if (target.id !== product.categoryId) {
      const [cur] = product.categoryId ? await db.select({ name: categories.name }).from(categories).where(eq(categories.id, product.categoryId)).limit(1) : [];
      categoryChange = { fromId: product.categoryId ?? null, fromName: cur?.name ?? null, toId: target.id, toName: target.name };
      targetCategoryId = target.id;
    }
  }

  const defs: any[] = targetCategoryId ? await resolveEffectiveAttributes(db, targetCategoryId) : [];
  const specDefs = defs.filter((d) => (d.role ?? 'spec') === 'spec' && d.isActive !== false);
  const axisKeys = new Set<string>(defs.filter((d) => d.role === 'variant_axis').flatMap((d) => [normalizeLookupKey(d.code), normalizeLookupKey(d.name)]));
  const defByCode = new Map<string, any>(specDefs.map((d) => [normalizeLookupKey(d.code), d]));
  const defByName = new Map<string, any>();
  for (const d of specDefs) { const k = normalizeLookupKey(d.name); if (k && !defByName.has(k)) defByName.set(k, d); }

  // ---- estado atual: valores tipados + (produtos antigos) texto legado reaproveitado pelo validador
  const typed = (await loadProductAttributeValues(db, [product.id])).get(product.id) ?? [];
  const legacyRows: Array<{ name: string; value: string }> = await db.select().from(productAttributes).where(eq(productAttributes.productId, product.id));
  const legacyComposed = composeProductSpecs(legacyRows, product.attributesJson, []);
  const legacyByKey = new Map<string, unknown>(Object.entries(legacyComposed).map(([k, v]) => [normalizeLookupKey(k), v]));

  type Cur = { code: string; name: string; text: string; raw: unknown; fromTyped: boolean };
  const current = new Map<string, Cur>(); // por código normalizado
  for (const t of typed) current.set(normalizeLookupKey(t.code), { code: t.code, name: t.name, text: t.displayValue, raw: t.value, fromTyped: true });
  // texto legado (produtos anteriores à Fase 3, sem linhas tipadas): considerado valor atual quando existe definição para ele — na categoria
  // nova E, numa troca de categoria, também na antiga (para que o legado da categoria antiga seja removido junto, com confirmação).
  const oldDefs: any[] = categoryChange && product.categoryId ? await resolveEffectiveAttributes(db, product.categoryId) : [];
  for (const d of [...specDefs, ...oldDefs.filter((o) => (o.role ?? 'spec') === 'spec' && o.isActive !== false)]) {
    const k = normalizeLookupKey(d.code);
    if (current.has(k)) continue;
    const lv = legacyByKey.get(k) ?? legacyByKey.get(normalizeLookupKey(d.name));
    if (lv !== undefined && String(lv).trim() !== '') current.set(k, { code: d.code, name: d.name, text: String(lv), raw: lv, fromTyped: false });
  }

  // ---- compatibilidade na troca de categoria
  const working = new Map<string, unknown>(); // código normalizado -> valor cru que o validador entende
  const removed: RemovedAttribute[] = [];
  const preserved: string[] = [];
  const staleTyped = new Set<string>(); // valores de atributos que não são efetivos (desativados) na MESMA categoria: ficam como estão
  for (const [k, cur] of current) {
    const def = defByCode.get(k);
    if (!def) {
      if (categoryChange) removed.push({ code: cur.code, name: cur.name, value: cur.text, reason: 'Não existe na nova categoria.' });
      else staleTyped.add(k);
      continue;
    }
    const r = validateAttributeValue(def, cur.raw);
    if (r.ok) { working.set(k, cur.raw); preserved.push(def.code); }
    else if (categoryChange) removed.push({ code: cur.code, name: cur.name, value: cur.text, reason: r.error!.message });
    else if (cur.fromTyped) staleTyped.add(k); // valor já gravado que a definição passou a recusar: fica como está até o vendedor corrigi-lo
  }

  // ---- aplica o patch
  const errors: AttributeValueError[] = [];
  const touched = new Set<string>();
  const seen = new Map<string, unknown>();
  for (const [rawKey, value] of Object.entries(patch)) {
    const lookup = normalizeLookupKey(rawKey);
    const def = defByCode.get(lookup) ?? defByName.get(lookup);
    if (!def) {
      if (current.has(lookup) && (value === null || (typeof value === 'string' && value.trim() === ''))) {
        // limpeza de valor de atributo desativado/inexistente: permitida
        working.delete(lookup); staleTyped.delete(lookup); touched.add(lookup);
        const idx = removed.findIndex((r) => normalizeLookupKey(r.code) === lookup);
        if (idx >= 0) removed.splice(idx, 1);
        continue;
      }
      if (current.has(lookup)) { errors.push({ code: 'INVALID_INPUT', field: rawKey, message: `O atributo "${current.get(lookup)!.name}" está desativado nesta categoria e não pode ser alterado.`, hint: 'Só é possível remover o valor antigo.' }); continue; }
      if (axisKeys.has(lookup)) { errors.push({ code: 'INVALID_INPUT', field: rawKey, message: `"${rawKey}" é uma variação do produto (cor, tamanho, capacidade) e se edita nas variações, não nas características.` }); continue; }
      if (RESERVED_ATTRIBUTE_CODES.has(lookup)) { errors.push({ code: 'INVALID_INPUT', field: rawKey, message: `"${rawKey}" é um campo geral do produto (marca, modelo, condição, garantia, peso, dimensões) e se edita no próprio campo.` }); continue; }
      errors.push({ code: 'UNKNOWN_ATTRIBUTE', field: rawKey, message: `"${rawKey}" não é uma característica desta categoria.`, hint: 'Remova o campo ou peça ao administrador para cadastrá-lo.' });
      continue;
    }
    const key = normalizeLookupKey(def.code);
    if (seen.has(key)) {
      const prev = JSON.stringify(seen.get(key)), now = JSON.stringify(value);
      if (prev !== now) errors.push({ code: 'CONFLICTING_VALUES', field: def.code, attributeId: def.id, message: `O atributo "${def.name}" foi enviado mais de uma vez com valores diferentes.` });
      continue;
    }
    seen.set(key, value);
    touched.add(key);
    if (isClear(def, value)) {
      if (def.isRequired) { errors.push({ code: 'REQUIRED', field: def.code, attributeId: def.id, message: `O atributo "${def.name}" é obrigatório e não pode ser removido.`, hint: 'Informe um valor.' }); continue; }
      working.delete(key);
      continue;
    }
    const r = validateAttributeValue(def, value);
    if (!r.ok) { errors.push(r.error!); continue; }
    working.set(key, value);
    const ri = removed.findIndex((x) => normalizeLookupKey(x.code) === key);
    if (ri >= 0) removed.splice(ri, 1); // o vendedor corrigiu o valor incompatível: nada a remover
  }

  // ---- obrigatórios sobre o resultado final
  const finalValues: NormalizedAttributeValue[] = [];
  const newRequired: Array<{ code: string; name: string }> = [];
  for (const d of specDefs) {
    const k = normalizeLookupKey(d.code);
    const v = working.get(k);
    if (v === undefined) {
      if (d.isRequired) {
        newRequired.push({ code: d.code, name: d.name });
        const incompatible = removed.find((r) => normalizeLookupKey(r.code) === k);
        if (!errors.some((e) => e.field === d.code)) errors.push({ code: 'REQUIRED', field: d.code, attributeId: d.id, message: incompatible ? `O valor atual de "${d.name}" ("${incompatible.value}") não é aceito${categoryChange ? ` em "${categoryChange.toName}"` : ''}. Escolha um novo valor.` : `O atributo "${d.name}" é de preenchimento obrigatório${categoryChange ? ` para a categoria "${categoryChange.toName}"` : ''}.`, hint: d.type === 'boolean' ? 'Escolha Sim ou Não.' : d.type === 'select' || d.type === 'multiselect' ? 'Escolha uma opção.' : 'Preencha este campo.' });
      }
      continue;
    }
    const r = validateAttributeValue(d, v);
    if (!r.ok) { if (!errors.some((e) => e.field === d.code)) errors.push(r.error!); continue; }
    finalValues.push(r.value!);
  }
  if (errors.length > 0) throw new ProductAttributeValidationError(errors);

  // ---- perda de especificações exige confirmação explícita
  if (categoryChange && removed.length > 0 && input.confirmRemoval !== true) {
    throw new ProductAttributeUpdateError(
      409,
      'ATTRIBUTE_LOSS_CONFIRMATION_REQUIRED',
      `A mudança para "${categoryChange.toName}" removerá ${removed.length === 1 ? 'a característica' : 'as características'}: ${removed.map((r) => r.name).join(', ')}. Confirme para continuar.`,
      { removed, preserved, newCategory: { id: categoryChange.toId, name: categoryChange.toName } },
    );
  }

  // ---- diferenças (auditoria) e espelho legado
  const finalByKey = new Map(finalValues.map((v) => [normalizeLookupKey(v.code), v]));
  const changes: AttributeChange[] = [];
  const keys = new Set<string>([...current.keys(), ...finalByKey.keys()]);
  for (const k of keys) {
    const before = current.get(k);
    const after = finalByKey.get(k);
    if (!before && !after) continue;
    if (before && after && before.text === after.legacyText) continue;
    if (before && !after && staleTyped.has(k)) continue;
    if (before && !after && !touched.has(k) && !categoryChange) continue;
    changes.push({ code: after?.code ?? before!.code, name: after?.name ?? before!.name, before: before ? before.text : null, after: after ? after.legacyText : null });
  }

  // códigos cujas linhas tipadas são reescritas: tudo que tem valor final + o que foi limpo/removido + o que já era tipado e agora muda
  const rewrite = new Set<string>();
  for (const v of finalValues) rewrite.add(v.code);
  for (const k of touched) { const d = defByCode.get(k); const c = current.get(k); if (d) rewrite.add(d.code); else if (c) rewrite.add(c.code); }
  for (const r of removed) rewrite.add(r.code);
  for (const [k, c] of current) if (c.fromTyped && !staleTyped.has(k)) rewrite.add(c.code);

  const legacyKeys = new Set<string>();
  for (const code of rewrite) {
    legacyKeys.add(normalizeLookupKey(code));
    const d = defByCode.get(normalizeLookupKey(code));
    if (d) legacyKeys.add(normalizeLookupKey(d.name));
    const c = current.get(normalizeLookupKey(code));
    if (c) legacyKeys.add(normalizeLookupKey(c.name));
  }
  const legacyJson: Record<string, unknown> = {};
  const oldJson = isPlainObject(product.attributesJson) ? product.attributesJson : {};
  for (const [k, v] of Object.entries(oldJson)) if (!legacyKeys.has(normalizeLookupKey(k))) legacyJson[k] = v;
  for (const v of finalValues) legacyJson[v.code] = v.legacyText;

  return { categoryChange, finalValues, rewriteCodes: [...rewrite], legacyJson, legacyDeleteKeys: [...legacyKeys], changes, removed, preserved };
}

/** Grava o plano dentro da transação recebida: valores tipados, espelho legado e (opcional) a nova categoria no produto. */
export async function applyAttributePlan(tx: any, productId: string, plan: AttributeUpdatePlan): Promise<void> {
  if (plan.rewriteCodes.length > 0) {
    await tx.delete(productAttributeValues).where(and(eq(productAttributeValues.productId, productId), inArray(productAttributeValues.attributeCode, plan.rewriteCodes)));
  }
  const rows = toValueRows(productId, plan.finalValues);
  if (rows.length > 0) await tx.insert(productAttributeValues).values(rows);

  // espelho legado (product_attributes): apaga as linhas das chaves reescritas e reinsere o valor final
  const legacyRows: Array<{ id: string; name: string }> = await tx.select({ id: productAttributes.id, name: productAttributes.name }).from(productAttributes).where(eq(productAttributes.productId, productId));
  const del = legacyRows.filter((r) => plan.legacyDeleteKeys.includes(normalizeLookupKey(r.name))).map((r) => r.id);
  if (del.length > 0) await tx.delete(productAttributes).where(inArray(productAttributes.id, del));
  const now = new Date();
  const ins = plan.finalValues.map((v, idx) => ({ id: `pattr_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 5)}`, productId, name: v.code, value: v.legacyText, createdAt: now }));
  if (ins.length > 0) await tx.insert(productAttributes).values(ins);

  await tx.update(products).set({ attributesJson: plan.legacyJson, ...(plan.categoryChange ? { categoryId: plan.categoryChange.toId } : {}), updatedAt: now }).where(eq(products.id, productId));
}

/** Auditoria na MESMA transação (se falhar, a edição inteira é desfeita). */
export async function writeAttributeAudit(tx: any, ctx: { actorUserId: string; sellerId: string; productId: string; ip?: string | null; userAgent?: string | null; countryCode?: string | null }, plan: AttributeUpdatePlan): Promise<void> {
  const action = plan.categoryChange ? 'seller.product.category_changed' : 'seller.product.attributes_updated';
  await tx.insert(auditLogs).values({
    id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    actorUserId: ctx.actorUserId,
    action,
    resource: 'products',
    resourceId: ctx.productId,
    detailsJson: {
      sellerId: ctx.sellerId,
      changes: plan.changes,
      removed: plan.removed,
      preserved: plan.preserved,
      ...(plan.categoryChange ? { category: { from: plan.categoryChange.fromId, to: plan.categoryChange.toId, fromName: plan.categoryChange.fromName, toName: plan.categoryChange.toName } } : {}),
    },
    ipAddress: ctx.ip ?? null,
    userAgent: ctx.userAgent ?? null,
    countryCode: ctx.countryCode ?? null,
    createdAt: new Date(),
  });
}
