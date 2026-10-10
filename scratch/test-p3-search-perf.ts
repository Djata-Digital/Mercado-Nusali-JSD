/**
 * P3 — DESEMPENHO da busca/filtros/facets com volume (Postgres 17 DESCARTAVEL): 20.000 produtos e ~100.000 valores de caracteristicas
 * (carga por SQL), medindo listagem filtrada, facets e pesquisa textual. Nunca producao.
 */
process.env.REDIS_URL = '';
import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';
const testDbUrl = assertLedgerTestDatabaseGuard();
process.env.DATABASE_URL = testDbUrl;
process.env.NODE_ENV = 'test';
process.env.SKIP_RUNTIME_ALIGN = 'true';
import 'dotenv/config';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/db/schema.js';
import { users, sellers, stores, categories, countries, addresses } from '../src/db/schema.js';
import { ProductCreationService } from '../src/server/modules/catalog/productCreationService.js';
import { createAttribute } from '../src/server/modules/catalog/attributeDefinitionService.js';
import { CatalogService } from '../src/server/modules/catalog/catalogService.js';

if (!['localhost', '127.0.0.1'].includes(new URL(testDbUrl).hostname)) throw new Error('Somente banco local descartavel.');
const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false }, max: 6 });
const db = drizzle(pool, { schema });
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 500)}`); };
const q = async (s: string, p?: any[]) => (await pool.query(s, p)).rows;
const timed = async <T,>(fn: () => Promise<T>) => { const t = Date.now(); const r = await fn(); return { r, ms: Date.now() - t }; };
const BUDGET_MS = 1500;
const N = 20000;

async function main() {
  await db.insert(countries).values([{ id: 'GW', code: 'GW', name: 'Guiné-Bissau', flag: 'x', currency: 'XOF', currencySymbol: 'CFA', phonePrefix: '+245', isActive: true, createdAt: new Date() }] as any).onConflictDoNothing();
  await db.insert(categories).values([
    { id: 'cat_eletro', name: 'Eletrônicos', slug: 'eletronicos', isActive: true, createdAt: new Date() },
    ...Array.from({ length: 12 }, (_, i) => ({ id: `cat_l${i}`, name: `Leaf ${i}`, slug: `leaf-${i}`, parentId: 'cat_eletro', isActive: true, createdAt: new Date() })),
  ] as any);
  const sist = (await createAttribute(db, 'cat_eletro', { name: 'Sistema', code: 'sistema', type: 'select', isFilterable: true, optionsJson: ['Android', 'iOS', 'Outro'], sortOrder: 1 })).attribute;
  const ram = (await createAttribute(db, 'cat_eletro', { name: 'RAM', code: 'ram', type: 'number', isFilterable: true, unit: 'GB', decimals: 0, minValue: 0, maxValue: 1024, sortOrder: 2 })).attribute;
  const agua = (await createAttribute(db, 'cat_eletro', { name: 'Agua', code: 'agua', type: 'boolean', isFilterable: true, sortOrder: 3 })).attribute;
  const conect = (await createAttribute(db, 'cat_eletro', { name: 'Conectividade', code: 'conectividade', type: 'multiselect', isFilterable: true, optionsJson: ['Wi-Fi', 'Bluetooth', '5G'], sortOrder: 4 })).attribute;
  const sellerUser = 'usr_perf';
  await db.insert(users).values({ id: sellerUser, email: 'p@t.test', passwordHash: 'x', fullName: 'p', phone: '1', role: 'SELLER', countryCode: 'GW', kycStatus: 'verified', riskScore: 'baixo', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date() } as any);
  await db.insert(sellers).values({ id: 'sel_perf', userId: sellerUser, companyName: 'S', tradingName: 'S', taxId: '0', phone: '1', countryCode: 'GW', status: 'active', kycStatus: 'verified', isEmailVerified: true, createdAt: new Date(), updatedAt: new Date() } as any);
  await db.insert(addresses).values({ id: 'ad_perf', userId: sellerUser, recipientName: 'L', street: 'R', number: '1', city: 'B', state: 'B', countryCode: 'GW', phone: '9', isDefault: false, addressType: 'business', createdAt: new Date(), updatedAt: new Date() } as any);
  await db.insert(stores).values({ id: 'st_perf', sellerId: 'sel_perf', name: 'Loja', slug: 'loja-perf', countryCode: 'GW', status: 'active', operationalAddressId: 'ad_perf', createdAt: new Date(), updatedAt: new Date() } as any);
  const seed: any = await ProductCreationService.createProduct(sellerUser, { title: 'Seed', price: 100, image: 'x.jpg', storeId: 'st_perf', weightKg: 0.3, dimensionsCm: { length: 5, width: 5, height: 5 }, stock: 5, categoryId: 'cat_l0', specs: {} }, db);

  // carga em massa por SQL: N produtos espalhados em 12 categorias finais + valores das 4 caracteristicas
  await q(`INSERT INTO products SELECT (r).* FROM (
    SELECT jsonb_populate_record(null::products, to_jsonb(p) || jsonb_build_object(
      'id', 'bulk_' || g, 'title', CASE WHEN g % 50 = 0 THEN 'Celular modelo ' || g ELSE 'Produto ' || g END, 'brand', 'Marca' || (g % 40),
      'price', (100 + (g % 900))::text, 'condition', CASE WHEN g % 7 = 0 THEN 'used' ELSE 'new' END,
      'category_id', 'cat_l' || (g % 12), 'created_at', (now() - (g || ' minutes')::interval)::text, 'description', 'descricao do produto ' || g)) AS r
    FROM products p, generate_series(1, ${N}) g WHERE p.id = $1) x`, [seed.id]);
  await q(`INSERT INTO product_attribute_values (id, product_id, attribute_id, attribute_code, option_value)
    SELECT 'v1_' || g, 'bulk_' || g, $1, 'sistema', (ARRAY['Android','iOS','Outro'])[1 + g % 3] FROM generate_series(1, ${N}) g`, [sist.id]);
  await q(`INSERT INTO product_attribute_values (id, product_id, attribute_id, attribute_code, value_number)
    SELECT 'v2_' || g, 'bulk_' || g, $1, 'ram', (2 + g % 16) FROM generate_series(1, ${N}) g`, [ram.id]);
  await q(`INSERT INTO product_attribute_values (id, product_id, attribute_id, attribute_code, value_bool)
    SELECT 'v3_' || g, 'bulk_' || g, $1, 'agua', (g % 2 = 0) FROM generate_series(1, ${N}) g`, [agua.id]);
  await q(`INSERT INTO product_attribute_values (id, product_id, attribute_id, attribute_code, option_value)
    SELECT 'v4a_' || g, 'bulk_' || g, $1, 'conectividade', 'Wi-Fi' FROM generate_series(1, ${N}) g`, [conect.id]);
  await q(`INSERT INTO product_attribute_values (id, product_id, attribute_id, attribute_code, option_value)
    SELECT 'v4b_' || g, 'bulk_' || g, $1, 'conectividade', 'Bluetooth' FROM generate_series(1, ${N}) g WHERE g % 3 = 0`, [conect.id]);
  await q('ANALYZE products'); await q('ANALYZE product_attribute_values');
  const counts = (await q('SELECT (SELECT count(*)::int FROM products) p, (SELECT count(*)::int FROM product_attribute_values) v'))[0];
  report(`P0 massa de dados: ${counts.p} produtos e ${counts.v} valores de caracteristicas`, counts.p >= N && counts.v >= N * 4, counts);

  const filt = { sistema: ['Android'], ram: { min: 8, max: 14 }, agua: true, conectividade: ['Bluetooth'] } as any;
  const L1 = await timed(() => CatalogService.getProducts({ categoryTree: 'cat_eletro', attrs: filt, limit: 24 }, db));
  report(`P1 listagem do departamento com 4 filtros de caracteristica (pagina 1): ${L1.ms} ms, ${L1.r.pagination.total} resultados`, L1.ms < BUDGET_MS && L1.r.pagination.total > 0, L1.ms);
  const ref = (await q(`SELECT count(*)::int n FROM products p WHERE p.category_id LIKE 'cat_l%' AND EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id=p.id AND v.attribute_code='sistema' AND v.option_value='Android') AND EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id=p.id AND v.attribute_code='ram' AND v.value_number BETWEEN 8 AND 14) AND EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id=p.id AND v.attribute_code='agua' AND v.value_bool) AND EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id=p.id AND v.attribute_code='conectividade' AND v.option_value='Bluetooth')`))[0].n;
  report(`P2 o total confere com a consulta de referencia independente (${ref})`, L1.r.pagination.total === ref, { got: L1.r.pagination.total, ref });
  const L2 = await timed(() => CatalogService.getProducts({ categoryTree: 'cat_l3', attrs: { sistema: ['Android'] }, sort: 'price_asc', page: 20, limit: 24 }, db));
  report(`P3 pagina profunda (20) de uma categoria final ordenada por preco: ${L2.ms} ms`, L2.ms < BUDGET_MS && L2.r.products.length > 0, L2.ms);
  const F1 = await timed(() => CatalogService.getFacets({ categoryTree: 'cat_eletro' }, db));
  report(`P4 facets do departamento (4 caracteristicas + marca/condicao/preco) sobre ${F1.r.total} produtos: ${F1.ms} ms`, F1.ms < BUDGET_MS * 2 && F1.r.attributes.length === 4 && F1.r.total === counts.p, { ms: F1.ms, attrs: F1.r.attributes.length });
  const F2 = await timed(() => CatalogService.getFacets({ categoryTree: 'cat_eletro', attrs: filt }, db));
  report(`P5 facets com 4 filtros ativos (uma consulta por grupo ativo): ${F2.ms} ms`, F2.ms < BUDGET_MS * 3 && F2.r.attributes.length === 4, F2.ms);
  const T1 = await timed(() => CatalogService.getProducts({ q: 'celular modelo', limit: 24 }, db));
  report(`P6 pesquisa textual "celular modelo" (titulo, marca, descricao, categoria e caracteristicas, com relevancia): ${T1.ms} ms, ${T1.r.pagination.total} resultados`, T1.ms < BUDGET_MS * 2 && T1.r.pagination.total >= N / 50, { ms: T1.ms, t: T1.r.pagination.total });
  const T2 = await timed(() => CatalogService.getProducts({ q: 'android', categoryTree: 'cat_eletro', attrs: { agua: true }, limit: 24 }, db));
  report(`P7 pesquisa por valor de caracteristica ("android") combinada com filtro: ${T2.ms} ms, ${T2.r.pagination.total} resultados`, T2.ms < BUDGET_MS * 2 && T2.r.pagination.total > 0, { ms: T2.ms, t: T2.r.pagination.total });
  const plan = (await q(`EXPLAIN (ANALYZE, FORMAT TEXT) SELECT p.id FROM products p WHERE p.category_id = 'cat_l3' AND EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.product_id=p.id AND v.attribute_id=$1 AND v.option_value='iOS') ORDER BY p.price LIMIT 24`, [sist.id])).map((r: any) => r['QUERY PLAN']).join('\n');
  console.log('   plano (EXISTS por atributo, categoria final):', plan.split('\n').find((l: string) => /Execution Time/.test(l)));
  report('P8 o plano usa os indices de product_attribute_values (por produto ou por atributo/opcao), nao varre a tabela inteira por produto', /product_attribute_values_(product_idx|option_idx|uq)|Hash Semi Join|Index Scan|Bitmap/.test(plan), plan.slice(0, 600));

  await pool.end();
  console.log(`\n=== RESULTADO: ${passed}/${total} ===`);
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
