/**
 * FASE D17-B1 — testes focados do motor determinístico de recomendações
 * (GET /api/v1/products/:id/recommendations).
 *
 * Testes HTTP reais contra Postgres Docker isolado com SSL (NUNCA Supabase).
 * REDIS_URL forçado para o fallback em memória já existente em
 * src/db/redis.ts (getRedisClient retorna null para 'redis://localhost:6379'
 * ou ausência de REDIS_URL) — nenhum Redis novo, nenhuma cache nova, só o
 * mesmo mecanismo de cache de sempre, isolado neste processo de teste.
 */
process.env.REDIS_URL = 'redis://localhost:6379';

import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';

const testDbUrl = assertLedgerTestDatabaseGuard();
process.env.SKIP_RUNTIME_ALIGN = 'true';
process.env.DATABASE_URL = testDbUrl;
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test_fixture_jwt_secret_never_real_0123456789';

import 'dotenv/config';
import http from 'http';
import express from 'express';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import { users, categories, stores, sellers, sellerProfiles, products } from '../src/db/schema.js';
import { apiRouter } from '../src/server/api.js';

const pool = new pg.Pool({ connectionString: testDbUrl, ssl: false });
const db = drizzle(pool, { schema });

let passed = 0;
let total = 0;
function report(label: string, ok: boolean, detail?: any) {
  total++;
  if (ok) passed++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${detail !== undefined ? ' -> ' + JSON.stringify(detail) : ''}`);
}

let seq = 0;
function uid(prefix: string) {
  seq += 1;
  return `${prefix}_d17b1_${Date.now()}_${seq}_${Math.random().toString(36).slice(2, 6)}`;
}

async function makeUser(role: string, countryCode: string) {
  const id = uid('usr');
  await db.insert(users).values({
    id, email: `${id}@example.com`, passwordHash: 'x', fullName: `Teste ${id}`,
    phone: '', role, countryCode, kycStatus: 'verified', riskScore: 'baixo',
    isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date(),
  });
  return id;
}

function tokenFor(userId: string, role: string) {
  return jwt.sign(
    { userId, email: `${userId}@example.com`, role, fullName: 'Teste', countryCode: 'GW', kycStatus: 'verified', isEmailVerified: true },
    process.env.JWT_ACCESS_SECRET!
  );
}

async function makeStore(countryCode: string) {
  const sellerUser = await makeUser('SELLER', countryCode);
  const sellerId = uid('sel');
  await db.insert(sellers).values({
    id: sellerId, userId: sellerUser, companyName: 'Loja D17B1', tradingName: 'Loja D17B1', taxId: 'T', phone: '11988887777',
    countryCode, status: 'active', createdAt: new Date(), updatedAt: new Date(),
  } as any);
  await db.insert(sellerProfiles).values({ id: uid('sp'), sellerId, verifiedAt: new Date(), createdAt: new Date(), updatedAt: new Date() });
  const storeId = uid('str');
  await db.insert(stores).values({
    id: storeId, sellerId, name: 'Loja D17B1', slug: storeId, countryCode, status: 'active',
    addressJson: { street: 'Rua', number: '1', city: 'Bissau', state: '', countryCode, phone: '11999999999' },
    createdAt: new Date(), updatedAt: new Date(),
  });
  return storeId;
}

async function insertProduct(opts: {
  categoryId?: string | null;
  storeId?: string | null;
  countryCode?: string;
  isActive?: boolean;
  publishingScope?: string;
  targetCountriesJson?: string[];
  title?: string;
}) {
  const id = uid('prod');
  await db.insert(products).values({
    id,
    title: opts.title || `Produto ${id}`,
    price: '50.00',
    currency: 'XOF',
    image: 'https://example.com/x.jpg',
    categoryId: opts.categoryId ?? null,
    storeId: opts.storeId ?? null,
    countryCode: opts.countryCode ?? 'GW',
    isActive: opts.isActive ?? true,
    publishingScope: opts.publishingScope ?? 'national',
    targetCountriesJson: opts.targetCountriesJson ?? null,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any);
  return id;
}

async function main() {
  await db.insert(schema.countries).values([
    { id: 'GW', code: 'GW', name: 'Guiné-Bissau', flag: '🇬🇼', currency: 'XOF', currencySymbol: 'CFA', phonePrefix: '+245', isActive: true, createdAt: new Date() },
    { id: 'BR', code: 'BR', name: 'Brasil', flag: '🇧🇷', currency: 'BRL', currencySymbol: 'R$', phonePrefix: '+55', isActive: true, createdAt: new Date() },
  ]).onConflictDoNothing();

  const catA = uid('cat');
  await db.insert(categories).values({ id: catA, name: 'Categoria A', slug: catA, isActive: true, createdAt: new Date() });
  const catB = uid('cat');
  await db.insert(categories).values({ id: catB, name: 'Categoria B', slug: catB, isActive: true, createdAt: new Date() });

  const storeX = await makeStore('GW');
  const storeY = await makeStore('GW');

  // Produto base: categoria A, loja X, destino GW nacional.
  const baseId = await insertProduct({ categoryId: catA, storeId: storeX, countryCode: 'GW', title: 'Calcinha Love' });

  // 14 produtos elegíveis na MESMA categoria (catA), lojas variadas, para
  // testar o limite de 12 por seção e sobra determinística p/ youMayAlsoLike.
  const relatedCandidates: string[] = [];
  for (let i = 0; i < 14; i++) {
    relatedCandidates.push(await insertProduct({ categoryId: catA, storeId: storeY, countryCode: 'GW', title: `Related ${i}` }));
  }

  // Produtos da MESMA loja (storeX), categoria DIFERENTE (catB) — para provar
  // sameStoreProducts de forma isolada do sinal de categoria.
  const sameStoreCandidates: string[] = [];
  for (let i = 0; i < 3; i++) {
    sameStoreCandidates.push(await insertProduct({ categoryId: catB, storeId: storeX, countryCode: 'GW', title: `SameStore ${i}` }));
  }

  // Produto INELEGÍVEL para destino GW (nacional, origem BR) — nunca deve
  // aparecer em nenhuma seção quando o destino é GW (buyer comum).
  const ineligibleId = await insertProduct({ categoryId: catA, storeId: storeY, countryCode: 'BR', title: 'Ineligible BR' });

  // Produto INATIVO na mesma categoria — nunca deve aparecer.
  const inactiveId = await insertProduct({ categoryId: catA, storeId: storeY, countryCode: 'GW', isActive: false, title: 'Inactive' });

  // Produto internacional, origem BR, elegível para destino GW (targetCountriesJson
  // inclui GW) — usado para testar originCountryFilter de forma independente
  // da elegibilidade de destino.
  const originTestId = await insertProduct({
    categoryId: catA, storeId: storeY, countryCode: 'BR', publishingScope: 'international', targetCountriesJson: ['GW'], title: 'Origin Test BR->GW',
  });

  // Produto SEM storeId (edge case do PASSO 10.8).
  const noStoreProductCategory = catA;
  const noStoreId = await insertProduct({ categoryId: noStoreProductCategory, storeId: null, countryCode: 'GW', title: 'Produto Sem Loja' });

  const app = express();
  app.use(express.json());
  app.use('/api/v1', apiRouter);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const base = `http://localhost:${port}/api/v1`;

  const getJson = async (path: string, opts?: { destinationCountry?: string; headerCountry?: string; originCountryFilter?: string; token?: string }) => {
    const params = new URLSearchParams();
    if (opts?.destinationCountry) params.set('destinationCountry', opts.destinationCountry);
    if (opts?.originCountryFilter) params.set('originCountryFilter', opts.originCountryFilter);
    const qs = params.toString();
    const headers: Record<string, string> = {};
    if (opts?.headerCountry) headers['X-Country-Code'] = opts.headerCountry;
    if (opts?.token) headers['Authorization'] = `Bearer ${opts.token}`;
    const res = await fetch(`${base}${path}${qs ? '?' + qs : ''}`, { headers });
    return { status: res.status, json: await res.json() };
  };

  const adminToken = tokenFor(await makeUser('GLOBAL_ADMIN_USER', 'GW'), 'GLOBAL_ADMIN');

  // ==========================================================================
  // 1/2/3/4/5/7 — Buyer comum, destino GW explícito.
  // ==========================================================================
  const r1 = await getJson(`/products/${baseId}/recommendations`, { destinationCountry: 'GW' });
  report('1. status 200', r1.status === 200, r1.status);
  const data1 = r1.json.data;
  const allIds1 = [...data1.relatedProducts, ...data1.sameStoreProducts, ...data1.youMayAlsoLike].map((p: any) => p.id);

  report('2. Produto atual (baseId) NUNCA aparece em nenhuma seção', !allIds1.includes(baseId), { baseId, allIds1 });
  report('3. relatedProducts só contém produtos da MESMA categoria (catA)', data1.relatedProducts.every((p: any) => p.categoryId === catA));
  report('4. sameStoreProducts só contém produtos da MESMA loja (storeX)', data1.sameStoreProducts.every((p: any) => p.storeId === storeX));
  report('5. Produto inelegível (destino BR, nacional) NÃO aparece com destino GW', !allIds1.includes(ineligibleId));
  report('6. Produto INATIVO não aparece em nenhuma seção', !allIds1.includes(inactiveId));
  const idSet1 = new Set(allIds1);
  report('7. Nenhuma duplicação entre as 3 seções (todos os ids são únicos)', idSet1.size === allIds1.length, { total: allIds1.length, unicos: idSet1.size });
  report('8. relatedProducts respeita limite máximo de 12', data1.relatedProducts.length <= 12 && data1.relatedProducts.length === 12, data1.relatedProducts.length);
  report('9. sameStoreProducts respeita limite máximo de 12', data1.sameStoreProducts.length <= 12);
  report('10. youMayAlsoLike respeita limite máximo de 12', data1.youMayAlsoLike.length <= 12);
  // Com 14 candidatos de categoria (16 incluindo originTest/noStore, que também
  // são catA+GW-elegíveis) e limite de 12 em relatedProducts, deve sobrar
  // material determinístico (sem fallback) para youMayAlsoLike.
  report('11. youMayAlsoLike tem pelo menos 1 produto (sobra determinística da categoria, sem fallback)', data1.youMayAlsoLike.length > 0, data1.youMayAlsoLike.length);
  report('12. Produto internacional elegível (origin BR, destino GW) aparece quando SEM originCountryFilter', allIds1.includes(originTestId));

  // ==========================================================================
  // 13 — originCountryFilter=GW deve EXCLUIR o produto de origem BR
  // (mesmo continuando elegível para o destino).
  // ==========================================================================
  const r2 = await getJson(`/products/${baseId}/recommendations`, { destinationCountry: 'GW', originCountryFilter: 'GW' });
  const allIds2 = [...r2.json.data.relatedProducts, ...r2.json.data.sameStoreProducts, ...r2.json.data.youMayAlsoLike].map((p: any) => p.id);
  report('13. originCountryFilter=GW exclui produto de origem BR (mesmo elegível para o destino)', !allIds2.includes(originTestId));

  // ==========================================================================
  // 14 — originCountryFilter=BR deve INCLUIR o produto de origem BR (ainda
  // dentro da folga de 12, dado o volume de candidatos criado).
  // ==========================================================================
  const r3 = await getJson(`/products/${baseId}/recommendations`, { destinationCountry: 'GW', originCountryFilter: 'BR' });
  const allIds3 = [...r3.json.data.relatedProducts, ...r3.json.data.sameStoreProducts, ...r3.json.data.youMayAlsoLike].map((p: any) => p.id);
  report('14. originCountryFilter=BR inclui produto de origem BR (elegível) e exclui os de origem GW', allIds3.includes(originTestId) && !allIds3.includes(relatedCandidates[0]));

  // ==========================================================================
  // 15 — destino resolvido via header X-Country-Code (sem query param
  // explícito) — mesmo mecanismo já usado por GET /products.
  // ==========================================================================
  const r4 = await getJson(`/products/${baseId}/recommendations`, { headerCountry: 'GW' });
  const allIds4 = [...r4.json.data.relatedProducts, ...r4.json.data.sameStoreProducts, ...r4.json.data.youMayAlsoLike].map((p: any) => p.id);
  report('15. Destino resolvido via header X-Country-Code (sem query) continua excluindo o inelegível', !allIds4.includes(ineligibleId));

  // ==========================================================================
  // 16 — destino BR: agora o produto GW-nacional (ex.: relatedCandidates[0])
  // deve ficar inelegível, e o produto antes "ineligible" (nacional BR) passa
  // a ser elegível — prova que a regra é real, não hardcoded para GW.
  // ==========================================================================
  const r5 = await getJson(`/products/${baseId}/recommendations`, { destinationCountry: 'BR' });
  const allIds5 = [...r5.json.data.relatedProducts, ...r5.json.data.sameStoreProducts, ...r5.json.data.youMayAlsoLike].map((p: any) => p.id);
  report('16. Com destino BR, produtos nacionais GW ficam inelegíveis (regra real, não fixa)', !allIds5.includes(relatedCandidates[0]));

  // ==========================================================================
  // 17 — (atualizado: catálogo por país de entrega) GLOBAL_ADMIN navegando o catálogo público vê o MESMO que o cliente: o produto
  // inelegível por destino NÃO aparece. A visão administrativa por origem só vale com originCountryFilter explícito (ver 18).
  // ==========================================================================
  const r6 = await getJson(`/products/${baseId}/recommendations`, { token: adminToken, destinationCountry: 'GW' });
  const allIds6 = [...r6.json.data.relatedProducts, ...r6.json.data.sameStoreProducts, ...r6.json.data.youMayAlsoLike].map((p: any) => p.id);
  report('17. GLOBAL_ADMIN sem origem explícita: mesma regra do cliente — produto inelegível por destino NÃO aparece', !allIds6.includes(ineligibleId) && allIds6.length > 0);
  const r6b = await getJson(`/products/${baseId}/recommendations`, { token: adminToken, originCountryFilter: 'BR' });
  const allIds6b = [...r6b.json.data.relatedProducts, ...r6b.json.data.sameStoreProducts, ...r6b.json.data.youMayAlsoLike].map((p: any) => p.id);
  report('17a. GLOBAL_ADMIN com origem explícita (BR): visão administrativa preservada — produto de origem BR aparece mesmo sem elegibilidade de destino', allIds6b.includes(ineligibleId), allIds6b.length);
  report('17b. GLOBAL_ADMIN: produto inativo continua excluído (isActive nunca é pulado)', !allIds6.includes(inactiveId) && !allIds6b.includes(inactiveId));

  const r7 = await getJson(`/products/${baseId}/recommendations`, { token: adminToken, originCountryFilter: 'GW' });
  const allIds7 = [...r7.json.data.relatedProducts, ...r7.json.data.sameStoreProducts, ...r7.json.data.youMayAlsoLike].map((p: any) => p.id);
  report('18. GLOBAL_ADMIN: originCountryFilter continua sendo a restrição real (exclui origem BR)', !allIds7.includes(originTestId) && !allIds7.includes(ineligibleId));

  // ==========================================================================
  // 19 — Produto SEM storeId. C2.2: produto só é público com loja ATIVA de vendedor ATIVO; sem loja ele não é público, então
  // não tem recomendações (404 PRODUCT_NOT_FOUND) — antes devolvia sameStoreProducts = [] (comportamento anterior à regra de visibilidade).
  // ==========================================================================
  const r8 = await getJson(`/products/${noStoreId}/recommendations`, { destinationCountry: 'GW' });
  report('19. Produto sem storeId (não público) -> 404 PRODUCT_NOT_FOUND, sem recomendações', r8.status === 404 && r8.json?.error?.code === 'PRODUCT_NOT_FOUND', r8.json);

  // ==========================================================================
  // 20 — produto inexistente -> 404 com o MESMO padrão já usado por
  // GET /products/:id.
  // ==========================================================================
  const r9 = await getJson(`/products/prod_nao_existe_123/recommendations`, { destinationCountry: 'GW' });
  report('20. Produto inexistente -> 404 PRODUCT_NOT_FOUND (mesmo padrão do catálogo)', r9.status === 404 && r9.json?.error?.code === 'PRODUCT_NOT_FOUND', r9.json);

  // ==========================================================================
  // 22 — PASSO 1 (crítico): excludeProductId precisa fazer parte da chave
  // de cache de CatalogService.getProducts(). relatedCandidates[0] e
  // relatedCandidates[1] têm EXATAMENTE a mesma categoria/destino/origem —
  // se a cache key ignorasse excludeProductId, a segunda chamada
  // reaproveitaria incorretamente a resposta cacheada da primeira (que
  // excluía relatedCandidates[0], não relatedCandidates[1]).
  // ==========================================================================
  const rCacheA = await getJson(`/products/${relatedCandidates[0]}/recommendations`, { destinationCountry: 'GW' });
  const rCacheB = await getJson(`/products/${relatedCandidates[1]}/recommendations`, { destinationCountry: 'GW' });
  const relatedIdsCacheA = rCacheA.json.data.relatedProducts.map((p: any) => p.id);
  const relatedIdsCacheB = rCacheB.json.data.relatedProducts.map((p: any) => p.id);
  report('22a. Cache key distingue excludeProductId: chamada para candidato[1] NUNCA inclui a si mesmo (não reaproveitou a resposta cacheada da chamada anterior, que excluía outro produto)', !relatedIdsCacheB.includes(relatedCandidates[1]), relatedIdsCacheB);
  report('22b. Cache key distingue excludeProductId: chamada para candidato[0] NUNCA inclui a si mesmo', !relatedIdsCacheA.includes(relatedCandidates[0]), relatedIdsCacheA);

  // ==========================================================================
  // 21 — sameStoreProducts respeita as mesmas regras normais (inelegível/
  // inativo nunca aparecem mesmo sendo da mesma loja).
  // ==========================================================================
  const ineligibleSameStoreId = await insertProduct({ categoryId: catB, storeId: storeX, countryCode: 'BR', title: 'SameStore Inelegivel' });
  const inactiveSameStoreId = await insertProduct({ categoryId: catB, storeId: storeX, countryCode: 'GW', isActive: false, title: 'SameStore Inativo' });
  const r10 = await getJson(`/products/${baseId}/recommendations`, { destinationCountry: 'GW' });
  const sameStoreIds10 = r10.json.data.sameStoreProducts.map((p: any) => p.id);
  report('21. sameStoreProducts também respeita elegibilidade de destino e isActive', !sameStoreIds10.includes(ineligibleSameStoreId) && !sameStoreIds10.includes(inactiveSameStoreId));

  // ==========================================================================
  // 23 — Regressão: GET /products (listagem normal, sem excludeProductId)
  // continua funcionando exatamente como antes — nenhum comportamento novo
  // vaza para chamadores que não passam o filtro novo.
  // ==========================================================================
  const rList = await fetch(`${base}/products?category=${catA}&country=GW&limit=100`).then((r) => r.json());
  const listIds = (rList.data || []).map((p: any) => p.id);
  report('23. GET /products (listagem normal) continua incluindo o produto base (nenhuma exclusão implícita)', listIds.includes(baseId), { count: listIds.length });

  server.close();

  console.log(`\n${passed}/${total} testes passaram.`);
  if (passed !== total) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error('FALHA FATAL:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
    process.exit(process.exitCode || 0);
  });
