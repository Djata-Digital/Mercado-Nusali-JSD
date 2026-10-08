/**
 * Substituição controlada da taxonomia de categorias do Mercado Nusali (30 principais + 292 subcategorias = 322).
 *
 * SEGURANÇA
 *   - DRY-RUN POR PADRÃO: sem --apply roda numa transação SOMENTE LEITURA, valida todas as pré-condições e imprime o plano.
 *   - --apply exige CATEGORY_SEED_CONFIRM=YES e a URL explícita em CATEGORY_SEED_DATABASE_URL (nunca usa DATABASE_URL por engano).
 *   - Transação única (REPEATABLE READ) com LOCK nas tabelas de categorias; qualquer pré-condição ou verificação que falhe => ROLLBACK.
 *   - Remove SOMENTE as 9 categorias antigas aprovadas (por ID exato, com nome e slug conferidos) e o atributo antigo aprovado,
 *     e só se não houver produto, loja, vendedor, campanha de frete nem outro atributo apontando para elas.
 *   - Idempotente: ids determinísticos (cat_nsl_<slug>), INSERT só do que falta; reexecutar não duplica nem sobrescreve edições do admin.
 *   - Não toca em nenhuma outra tabela. Invalida o cache Redis `catalog:categories` depois do COMMIT.
 *
 * USO
 *   CATEGORY_SEED_DATABASE_URL=... npx tsx scripts/seed-categories.ts            # dry-run (leitura)
 *   CATEGORY_SEED_DATABASE_URL=... CATEGORY_SEED_CONFIRM=YES npx tsx scripts/seed-categories.ts --apply
 */
import 'dotenv/config';
import pg from 'pg';
import { buildCategoryTaxonomy, TAXONOMY_EXPECTED, TAXONOMY_ID_PREFIX } from '../src/data/categoryTaxonomy.js';

/** Manifesto das categorias antigas aprovadas para remoção (estado confirmado no diagnóstico de produção de 2026-10-08). */
export const LEGACY_CATEGORIES = [
  { id: 'cat_1787073998112_gl48', name: 'Hyundai', slug: 'yunday' },
  { id: 'cat_1787072785496_1kc9', name: 'Manga', slug: 'manga' },
  { id: 'cat_1787072841420_qupj', name: 'Banana', slug: 'banana' },
  { id: 'cat_1787367945185_79vk', name: 'Tênis masculinos', slug: 'tenis-maculinos' },
  { id: 'cat_1787072765834_uee0', name: 'Frutas', slug: 'frutas' },
  { id: 'cat_1787070933391_8ruz', name: 'Alimentos e Frutas Tropicais', slug: 'alimentos-e-frutas-tropocais' },
  { id: 'cat_1787073969210_vs5i', name: 'Automóveis', slug: 'automoveis' },
  { id: 'cat_1787072708332_7g4m', name: 'Eletrônicos', slug: 'eletronicos' },
  { id: 'cat_1787367856697_8m0l', name: 'Calçados', slug: 'calcados' },
] as const; // ordem = filhos antes dos pais
export const LEGACY_ATTRIBUTE_IDS = ['attr_1787368112726_t3cg'] as const;

/** Tabelas cujo volume muda por atividade normal (login etc.); ficam fora da comparação antes/depois. */
const VOLATILE_TABLES = new Set(['refresh_tokens', 'sessions', 'audit_logs', 'rate_limits', 'login_attempts', 'security_events']);

export interface SeedReport {
  mode: 'dry-run' | 'apply';
  ok: boolean;
  aborted?: string;
  legacyPresent: number;
  legacyDeleted: number;
  attributesDeleted: number;
  taxonomy: { roots: number; subs: number; total: number };
  inserted: number;
  alreadyPresent: number;
  categoriesBefore: number;
  categoriesAfter: number;
  tablesChanged: string[];
  notes: string[];
}

class Abort extends Error {}

async function rowCounts(c: pg.PoolClient): Promise<Record<string, number>> {
  const tables = (await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1")).rows.map((r) => r.table_name as string);
  const out: Record<string, number> = {};
  for (const t of tables) out[t] = (await c.query(`SELECT count(*)::int n FROM "${t}"`)).rows[0].n;
  return out;
}

/** Núcleo (testável): executa dentro de uma transação já aberta em `c`. Lança Abort em qualquer divergência. */
async function core(c: pg.PoolClient, apply: boolean, rep: SeedReport) {
  const nodes = buildCategoryTaxonomy();
  const roots = nodes.filter((n) => !n.parentId);
  const subs = nodes.filter((n) => n.parentId);
  rep.taxonomy = { roots: roots.length, subs: subs.length, total: nodes.length };
  if (roots.length !== TAXONOMY_EXPECTED.roots || subs.length !== TAXONOMY_EXPECTED.subcategories || nodes.length !== TAXONOMY_EXPECTED.total) throw new Abort(`taxonomia inesperada: ${roots.length}/${subs.length}/${nodes.length}`);
  if (new Set(nodes.map((n) => n.id)).size !== nodes.length || new Set(nodes.map((n) => n.slug)).size !== nodes.length) throw new Abort('taxonomia com id/slug duplicado');

  if (apply) await c.query('LOCK TABLE categories, category_attributes IN SHARE ROW EXCLUSIVE MODE');
  const before = await rowCounts(c);
  const all = (await c.query('SELECT id, name, slug, parent_id FROM categories')).rows as { id: string; name: string; slug: string; parent_id: string | null }[];
  rep.categoriesBefore = all.length;
  const byId = new Map(all.map((r) => [r.id, r]));

  // 2) categorias existentes: só legadas aprovadas e/ou nós da taxonomia (qualquer outra => divergência)
  const taxIds = new Set(nodes.map((n) => n.id));
  const legacyIds = new Set<string>(LEGACY_CATEGORIES.map((l) => l.id));
  const unexpected = all.filter((r) => !legacyIds.has(r.id) && !taxIds.has(r.id));
  if (unexpected.length) throw new Abort(`categorias inesperadas (não legadas aprovadas nem da taxonomia): ${unexpected.map((u) => u.id).join(', ')}`);
  const legacyRows = all.filter((r) => legacyIds.has(r.id));
  rep.legacyPresent = legacyRows.length;
  // 1) pré-condições de dados reais: só valem quando há categorias antigas a remover (reexecutar depois do lançamento é inofensivo).
  if (legacyRows.length) {
    for (const t of ['products', 'stores', 'sellers', 'shipping_subsidy_campaigns']) {
      if (before[t] !== 0) throw new Abort(`pré-condição falhou: ${t} tem ${before[t]} linhas (esperado 0)`);
    }
  }
  for (const l of LEGACY_CATEGORIES) {
    const r = byId.get(l.id);
    if (r && (r.name !== l.name || r.slug !== l.slug)) throw new Abort(`categoria legada ${l.id} diverge do manifesto: "${r.name}"/${r.slug}`);
  }
  // 3) dependências das legadas
  if (legacyRows.length) {
    const ids = legacyRows.map((r) => r.id);
    const dep = async (sql: string) => Number((await c.query(sql, [ids])).rows[0].n);
    if (await dep('SELECT count(*)::int n FROM products WHERE category_id = ANY($1)')) throw new Abort('há produtos em categorias legadas');
    if (await dep('SELECT count(*)::int n FROM stores WHERE category_id = ANY($1)')) throw new Abort('há lojas em categorias legadas');
    if (await dep('SELECT count(*)::int n FROM shipping_subsidy_campaigns WHERE category_id = ANY($1)')) throw new Abort('há campanhas de frete em categorias legadas');
    const attrs = (await c.query('SELECT id FROM category_attributes WHERE category_id = ANY($1)', [ids])).rows.map((r) => r.id as string);
    const extra = attrs.filter((a) => !(LEGACY_ATTRIBUTE_IDS as readonly string[]).includes(a));
    if (extra.length) throw new Abort(`atributos não aprovados em categorias legadas: ${extra.join(', ')}`);
    rep.notes.push(`atributos legados a remover: ${attrs.length}`);
    // filhos não previstos das legadas (fora do manifesto) => divergência
    const strangers = all.filter((r) => r.parent_id && legacyIds.has(r.parent_id) && !legacyIds.has(r.id));
    if (strangers.length) throw new Abort(`filhos não previstos sob categorias legadas: ${strangers.map((s) => s.id).join(', ')}`);
  }

  // 4) conflito de slug entre taxonomia e linhas que NÃO serão removidas
  const slugOwner = new Map(all.filter((r) => !legacyIds.has(r.id)).map((r) => [r.slug, r.id]));
  for (const n of nodes) {
    const owner = slugOwner.get(n.slug);
    if (owner && owner !== n.id) throw new Abort(`slug ${n.slug} já pertence a outra categoria (${owner})`);
  }
  // 5) nós da taxonomia já presentes devem coincidir (idempotência sem sobrescrever edições do admin; só estrutura é conferida)
  let already = 0;
  for (const n of nodes) {
    const r = byId.get(n.id);
    if (!r) continue;
    already++;
    if (r.slug !== n.slug || r.parent_id !== n.parentId) throw new Abort(`nó ${n.id} existente diverge da taxonomia (slug/parent)`);
  }
  rep.alreadyPresent = already;

  if (!apply) {
    rep.inserted = nodes.length - already;
    rep.legacyDeleted = legacyRows.length;
    rep.attributesDeleted = Number((await c.query('SELECT count(*)::int n FROM category_attributes WHERE id = ANY($1)', [[...LEGACY_ATTRIBUTE_IDS]])).rows[0].n);
    rep.categoriesAfter = all.length - legacyRows.length + rep.inserted;
    return;
  }

  // 6) escrita: atributo legado -> categorias legadas (filhos antes dos pais) -> taxonomia (pais antes dos filhos)
  const da = await c.query('DELETE FROM category_attributes WHERE id = ANY($1)', [[...LEGACY_ATTRIBUTE_IDS]]);
  rep.attributesDeleted = da.rowCount || 0;
  let del = 0;
  for (const l of LEGACY_CATEGORIES) {
    if (!byId.has(l.id)) continue;
    const r = await c.query('DELETE FROM categories WHERE id = $1 AND name = $2 AND slug = $3', [l.id, l.name, l.slug]);
    if (r.rowCount !== 1) throw new Abort(`DELETE de ${l.id} afetou ${r.rowCount} linhas`);
    del += 1;
  }
  rep.legacyDeleted = del;
  let ins = 0;
  for (const n of nodes) {
    if (byId.has(n.id)) continue;
    const r = await c.query(
      'INSERT INTO categories (id, name, slug, icon, parent_id, display_order, is_active) VALUES ($1,$2,$3,$4,$5,$6,true) ON CONFLICT DO NOTHING',
      [n.id, n.name, n.slug, n.icon, n.parentId, n.displayOrder]
    );
    if (r.rowCount !== 1) throw new Abort(`INSERT de ${n.id} não inseriu (conflito inesperado)`);
    ins += 1;
  }
  rep.inserted = ins;

  // 7) verificação de integridade dentro da mesma transação
  const fin = (await c.query('SELECT id, name, slug, parent_id, is_active FROM categories')).rows as { id: string; name: string; slug: string; parent_id: string | null; is_active: boolean }[];
  rep.categoriesAfter = fin.length;
  if (fin.length !== TAXONOMY_EXPECTED.total) throw new Abort(`total final ${fin.length} != ${TAXONOMY_EXPECTED.total}`);
  const finIds = new Set(fin.map((r) => r.id));
  const taxById = new Map(nodes.map((n) => [n.id, n]));
  for (const r of fin) {
    const n = taxById.get(r.id);
    if (!n) throw new Abort(`categoria fora da taxonomia após a operação: ${r.id}`);
    if (r.slug !== n.slug || r.parent_id !== n.parentId) throw new Abort(`estrutura divergente em ${r.id}`);
    if (r.parent_id && !finIds.has(r.parent_id)) throw new Abort(`categoria órfã: ${r.id}`);
    if (!r.is_active) throw new Abort(`categoria inativa inesperada: ${r.id}`);
  }
  if (new Set(fin.map((r) => r.slug)).size !== fin.length) throw new Abort('slug duplicado após a operação');
  const dupNames = new Set<string>(); const seen = new Set<string>();
  for (const r of fin) { const k = `${r.parent_id || ''}|${r.name.toLowerCase()}`; if (seen.has(k)) dupNames.add(k); seen.add(k); }
  if (dupNames.size) throw new Abort(`nome duplicado dentro do mesmo pai: ${[...dupNames].join(', ')}`);
  if (fin.filter((r) => !r.parent_id).length !== 30 || fin.filter((r) => r.parent_id).length !== 292) throw new Abort('contagem de principais/subcategorias incorreta');
  for (const r of fin.filter((x) => x.parent_id)) { if (fin.find((p) => p.id === r.parent_id)!.parent_id) throw new Abort(`profundidade > 2 em ${r.id}`); }
  const leftover = (await c.query('SELECT count(*)::int n FROM category_attributes WHERE category_id <> ALL($1)', [[...taxIds]])).rows[0].n;
  if (leftover) throw new Abort('category_attributes apontando para categoria que não existe mais na taxonomia');

  // 8) nenhuma outra tabela mudou (snapshot REPEATABLE READ: só esta transação altera linhas visíveis)
  const after = await rowCounts(c);
  const changed = Object.keys({ ...before, ...after }).filter((t) => !VOLATILE_TABLES.has(t) && before[t] !== after[t]);
  rep.tablesChanged = changed;
  const allowed = new Set(['categories', 'category_attributes']);
  const unexpectedChange = changed.filter((t) => !allowed.has(t));
  if (unexpectedChange.length) throw new Abort(`tabelas alteradas fora do escopo: ${unexpectedChange.join(', ')}`);
  if (after.categories - before.categories !== TAXONOMY_EXPECTED.total - rep.categoriesBefore) throw new Abort('variação de categories incoerente');
}

export async function runCategorySeed(pool: pg.Pool, apply: boolean): Promise<SeedReport> {
  const rep: SeedReport = { mode: apply ? 'apply' : 'dry-run', ok: false, legacyPresent: 0, legacyDeleted: 0, attributesDeleted: 0, taxonomy: { roots: 0, subs: 0, total: 0 }, inserted: 0, alreadyPresent: 0, categoriesBefore: 0, categoriesAfter: 0, tablesChanged: [], notes: [] };
  const c = await pool.connect();
  try {
    await c.query(apply ? 'BEGIN ISOLATION LEVEL REPEATABLE READ' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await core(c, apply, rep);
    if (apply) await c.query('COMMIT'); else await c.query('ROLLBACK');
    rep.ok = true;
  } catch (e: any) {
    try { await c.query('ROLLBACK'); } catch { /* ignore */ }
    rep.aborted = e instanceof Abort ? e.message : `erro: ${e?.code || ''} ${String(e?.message || e).replace(/postgres(ql)?:\/\/\S+/g, '[url]')}`;
  } finally {
    c.release();
  }
  return rep;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const url = process.env.CATEGORY_SEED_DATABASE_URL;
  if (!url) { console.error('[seed-categories] defina CATEGORY_SEED_DATABASE_URL (a URL de destino é sempre explícita)'); process.exitCode = 1; return; }
  if (apply && process.env.CATEGORY_SEED_CONFIRM !== 'YES') { console.error('[seed-categories] --apply exige CATEGORY_SEED_CONFIRM=YES'); process.exitCode = 1; return; }
  const host = new URL(url).hostname;
  const local = ['localhost', '127.0.0.1', '::1'].includes(host);
  const pool = new pg.Pool({ connectionString: url, max: 1, ...(local ? {} : { ssl: { rejectUnauthorized: false } }) });
  try {
    console.log(`[seed-categories] destino: ${local ? 'LOCAL' : '*.' + host.split('.').slice(-3).join('.')} | modo: ${apply ? 'APPLY' : 'DRY-RUN (somente leitura)'}`);
    const rep = await runCategorySeed(pool, apply);
    console.log(JSON.stringify(rep, null, 2));
    if (!rep.ok) { process.exitCode = 1; return; }
    if (apply) {
      // invalida o cache de categorias (Redis de produção, se REDIS_URL estiver configurada) DEPOIS do commit
      const { delCache, closeRedis } = await import('../src/db/redis.js');
      await delCache('catalog:categories');
      console.log('[seed-categories] cache catalog:categories invalidado');
      await closeRedis();
    }
  } finally {
    await pool.end();
  }
}

// Só executa ao ser chamado diretamente (os testes importam runCategorySeed sem disparar main).
if (/seed-categories\.(ts|js|cjs)$/.test(process.argv[1] || '')) void main();
