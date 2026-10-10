/**
 * P3 — a busca, os filtros e os facets NUNCA mostram (nem contam) produto nao publicado, de loja/vendedor inativo ou fora da
 * elegibilidade por pais; o publico nao consegue ligar a visao de admin pela querystring; e a quantidade de consultas e CONSTANTE
 * (sem N+1). Postgres 17 DESCARTAVEL. Nunca producao.
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
import { parsePublicCatalogFilters } from '../src/server/modules/catalog/catalogRoutes.js';

if (!['localhost', '127.0.0.1'].includes(new URL(testDbUrl).hostname)) throw new Error('Somente banco local descartavel.');
const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false }, max: 6 });
let queries = 0;
// conta TODA consulta enviada ao banco por qualquer conexao (patch no Client do pg)
const origClientQuery = (pg.Client.prototype as any).query;
(pg.Client.prototype as any).query = function (...a: any[]) { queries++; return origClientQuery.apply(this, a); };
const origQuery = (text: string, params?: any[]) => pool.query(text, params);
const db = drizzle(pool, { schema });
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 600)}`); };
const q = async (s: string, p?: any[]) => (await origQuery(s, p)).rows;
let seq = 0;
const uid = (p: string) => `${p}_vis_${Date.now()}_${++seq}`;

async function main() {
  await db.insert(countries).values([
    { id: 'GW', code: 'GW', name: 'Guiné-Bissau', flag: 'x', currency: 'XOF', currencySymbol: 'CFA', phonePrefix: '+245', isActive: true, createdAt: new Date() },
    { id: 'BR', code: 'BR', name: 'Brasil', flag: 'x', currency: 'BRL', currencySymbol: 'R$', phonePrefix: '+55', isActive: true, createdAt: new Date() },
  ] as any).onConflictDoNothing();
  await db.insert(categories).values([
    { id: 'cat_root', name: 'Raiz', slug: 'raiz', isActive: true, createdAt: new Date() },
    { id: 'cat_leaf', name: 'Folha', slug: 'folha', parentId: 'cat_root', isActive: true, createdAt: new Date() },
  ] as any);
  await createAttribute(db, 'cat_leaf', { name: 'Tipo', code: 'tipo', type: 'select', isFilterable: true, optionsJson: ['A', 'B'], sortOrder: 1 });

  const mkSeller = async (tag: string, sellerStatus = 'active', storeStatus = 'active') => {
    const userId = uid('usr'); const sellerId = uid('sel'); const addr = uid('ad'); const storeId = uid('st');
    await db.insert(users).values({ id: userId, email: `${userId}@t.test`, passwordHash: 'x', fullName: tag, phone: '1', role: 'SELLER', countryCode: 'GW', kycStatus: 'verified', riskScore: 'baixo', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date() } as any);
    await db.insert(sellers).values({ id: sellerId, userId, companyName: tag, tradingName: tag, taxId: '0', phone: '1', countryCode: 'GW', status: 'active', kycStatus: 'verified', isEmailVerified: true, createdAt: new Date(), updatedAt: new Date() } as any);
    await db.insert(addresses).values({ id: addr, userId, recipientName: 'L', street: 'R', number: '1', city: 'B', state: 'B', countryCode: 'GW', phone: '9', isDefault: false, addressType: 'business', createdAt: new Date(), updatedAt: new Date() } as any);
    await db.insert(stores).values({ id: storeId, sellerId, name: tag, slug: `loja-${storeId}`, countryCode: 'GW', status: 'active', operationalAddressId: addr, createdAt: new Date(), updatedAt: new Date() } as any);
    // estados pedidos depois da criacao (a criacao de produto exige vendedor e loja ativos)
    return { userId, sellerId, storeId, apply: async () => { await q('UPDATE sellers SET status=$1 WHERE id=$2', [sellerStatus, sellerId]); await q('UPDATE stores SET status=$1 WHERE id=$2', [storeStatus, storeId]); } };
  };
  const ok = await mkSeller('ok'); const pausedStore = await mkSeller('lojapausada', 'active', 'paused'); const badSeller = await mkSeller('vendedorinativo', 'suspended', 'active');
  const common = (s: any) => ({ image: 'x.jpg', storeId: s.storeId, weightKg: 0.3, dimensionsCm: { length: 5, width: 5, height: 5 }, stock: 5, condition: 'new', categoryId: 'cat_leaf', price: 100 });
  const mk = async (s: any, title: string, extra: any = {}) => ((await ProductCreationService.createProduct(s.userId, { ...common(s), title, brand: 'Marca', description: 'zzbusca', specs: { tipo: 'A' }, ...extra }, db)) as any).id as string;

  const VISIVEL = await mk(ok, 'Produto visivel zzbusca');
  const PAUSADO = await mk(ok, 'Produto pausado zzbusca');
  const LOJA = await mk(pausedStore, 'Produto da loja pausada zzbusca');
  const VEND = await mk(badSeller, 'Produto de vendedor inativo zzbusca');
  const INTL_SEM_BR = await mk(ok, 'Internacional so GW zzbusca', { publishingScope: 'international', targetCountries: ['GW'] });
  const INTL_BR = await mk(ok, 'Internacional com BR zzbusca', { publishingScope: 'international', targetCountries: ['GW', 'BR'] });
  const SEM_ESTOQUE = await mk(ok, 'Produto sem estoque zzbusca', { stock: 0 });
  await q('UPDATE products SET is_active=false WHERE id=$1', [PAUSADO]);
  await pausedStore.apply(); await badSeller.apply();

  const ids = async (f: any) => (await CatalogService.getProducts({ limit: 100, ...f }, db)).products.map((p: any) => p.id) as string[];
  const facetTotal = async (f: any) => (await CatalogService.getFacets(f, db)).total;
  const hidden = [PAUSADO, LOJA, VEND];

  const variants: Array<[string, any]> = [
    ['texto', { q: 'zzbusca' }],
    ['texto + categoria', { q: 'zzbusca', categoryTree: 'cat_root' }],
    ['categoria + atributo', { categoryTree: 'cat_leaf', attrs: { tipo: ['A'] } }],
    ['categoria + marca + condicao', { categoryTree: 'folha', brand: 'Marca', condition: 'new' }],
    ['ordenacao por preco', { q: 'zzbusca', sort: 'price_asc' }],
    ['ordenacao por vendas', { q: 'zzbusca', sort: 'sales_desc' }],
  ];
  for (const [label, f] of variants) {
    const r = await ids({ ...f, country: 'GW' });
    report(`V1 ${label}: nenhum produto pausado, de loja pausada ou de vendedor inativo aparece`, hidden.every((h) => !r.includes(h)) && r.includes(VISIVEL), r.length);
  }
  const base = { country: 'GW' } as any;
  report('V2 total dos facets nunca conta os nao publicados (texto "zzbusca": visivel + intl x2 + sem estoque = 4)', (await facetTotal({ ...base, q: 'zzbusca' })) === 4, await facetTotal({ ...base, q: 'zzbusca' }));
  const fc = await CatalogService.getFacets({ ...base, categoryTree: 'cat_leaf' }, db);
  report('V3 contadores de caracteristica e marca tambem ignoram os nao publicados (tipo A = 4, marca = 4)', fc.attributes.find((a) => a.code === 'tipo')?.options?.[0]?.count === 4 && fc.brands[0]?.count === 4 && fc.total === 4, { a: fc.attributes.find((a) => a.code === 'tipo')?.options, b: fc.brands });
  const gw = await ids({ country: 'GW', q: 'zzbusca' });
  const br = await ids({ country: 'BR', q: 'zzbusca' });
  report('V4 elegibilidade por pais: destino GW ve nacionais GW e internacionais que incluem GW; destino BR so o internacional que inclui BR', gw.includes(VISIVEL) && gw.includes(INTL_SEM_BR) && gw.includes(INTL_BR) && br.length === 1 && br[0] === INTL_BR, { gw: gw.length, br });
  report('V5 a elegibilidade tambem vale para texto + filtros + facets (destino BR: total 1)', (await ids({ country: 'BR', categoryTree: 'cat_leaf', attrs: { tipo: ['A'] } })).join() === INTL_BR && (await facetTotal({ country: 'BR', q: 'zzbusca' })) === 1);
  report('V6 produto sem estoque segue a regra existente da listagem (continua listado, com estoque 0 — nada novo foi escondido nem mostrado)', gw.includes(SEM_ESTOQUE) && (await CatalogService.getProducts({ country: 'GW', q: 'sem estoque', limit: 10 }, db)).products[0]?.stock === 0);

  // querystring publica: nunca liga a visao de admin
  const fakeReq = (query: any) => ({ query, headers: {} } as any);
  const f1 = parsePublicCatalogFilters(fakeReq({ adminView: 'true', visibility: 'paused', admin: '1', q: 'zzbusca', country: 'GW' }));
  report('V7 querystring publica NAO consegue ligar adminView/visibility (ficam indefinidos): a visao de produtos pausados segue so para o admin autenticado', (f1 as any).adminView === undefined && (f1 as any).visibility === undefined, f1);
  const r7 = await ids({ ...f1, limit: 100 } as any);
  report('V8 com esses parametros hostis a lista continua publica (sem pausados)', hidden.every((h) => !r7.includes(h)));
  report('V9 visao de admin interna segue funcionando para o painel (adminView lista pausados)', (await CatalogService.getProducts({ adminView: true, q: 'zzbusca', limit: 100 }, db)).products.some((p: any) => p.id === PAUSADO));

  // consultas constantes (sem N+1): 5 produtos por pagina vs 50
  for (let i = 0; i < 45; i++) await mk(ok, `Lote ${i} zzlote`);
  const count = async (fn: () => Promise<any>) => { const a = queries; await fn(); return queries - a; };
  const small = await count(() => CatalogService.getProducts({ country: 'GW', categoryTree: 'cat_leaf', attrs: { tipo: ['A'] }, q: 'zzlote', limit: 5 }, db));
  const big = await count(() => CatalogService.getProducts({ country: 'GW', categoryTree: 'cat_leaf', attrs: { tipo: ['A'] }, q: 'zzlote', limit: 50 }, db));
  report(`Q1 listagem filtrada: numero de consultas igual para 5 e 50 produtos por pagina (${small} = ${big}) e baixo (<= 12)`, small === big && small <= 12, { small, big });
  const plain = await count(() => CatalogService.getProducts({ country: 'GW', limit: 24 }, db));
  report(`Q2 listagem comum: ${plain} consultas; a busca por caracteristicas acrescenta so ${small - plain} (arvore + definicoes)`, small - plain <= 4, { plain, small });
  const f5 = await count(() => CatalogService.getFacets({ country: 'GW', categoryTree: 'cat_leaf' }, db));
  const f50 = await count(() => CatalogService.getFacets({ country: 'GW', categoryTree: 'cat_leaf', q: 'zzlote' }, db));
  report(`Q3 facets: numero constante de consultas (${f5} sem texto, ${f50} com texto) e <= 12 independente do volume`, f5 <= 12 && f50 <= 12 && f5 === f50, { f5, f50 });

  await pool.end();
  console.log(`\n=== RESULTADO: ${passed}/${total} ===`);
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
