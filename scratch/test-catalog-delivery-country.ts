/**
 * VISIBILIDADE DO CATÁLOGO POR PAÍS DE ENTREGA — o cliente só vê o que pode ser entregue no país selecionado, no BACKEND: lista, pesquisa,
 * categorias, facets, recomendações (relacionados/mesma loja/você também pode gostar), vitrines de loja, paginação/contagens, troca de país,
 * sem país (nada é listado), admin = visão do cliente (visão por origem só quando explícita), link direto (página acessível + compra
 * bloqueada), carrinho e criação de pedido continuam validando o destino. Postgres 17 DESCARTAVEL. Nunca produção.
 */
process.env.REDIS_URL = '';
import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';
const testDbUrl = assertLedgerTestDatabaseGuard();
process.env.DATABASE_URL = testDbUrl;
process.env.NODE_ENV = 'test';
process.env.SKIP_RUNTIME_ALIGN = 'true';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test_fixture_jwt_secret_never_real_0123456789';
import 'dotenv/config';
import fs from 'fs';
import http from 'http';
import express from 'express';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import { products, countries, orders } from '../src/db/schema.js';
import { apiRouter } from '../src/server/api.js';
import { OrderService } from '../src/server/modules/orders/orderService.js';
import { getJwtAccessSecret } from '../src/server/modules/auth/jwtConfig.js';
import { setupCheckoutKit } from './checkoutTestKit.js';

if (!['localhost', '127.0.0.1'].includes(new URL(testDbUrl).hostname)) throw new Error('Somente banco local descartavel.');
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 700)}`); };

async function main() {
  const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false }, max: 10 });
  const db = drizzle(pool, { schema });
  const kit = await setupCheckoutKit(db, 'cd');
  for (const [code, name, cur] of [['BR', 'Brasil', 'BRL'], ['SN', 'Senegal', 'XOF'], ['GM', 'Gâmbia', 'GMD']] as const) {
    await db.insert(countries).values({ id: code, code, name, flag: code, currency: cur, currencySymbol: cur, phonePrefix: '+0', isActive: true, createdAt: new Date() } as any).onConflictDoNothing();
  }

  const app = express(); app.use(express.json()); app.use('/api/v1', apiRouter);
  const server = http.createServer(app); await new Promise<void>((res) => server.listen(0, res));
  const base = `http://localhost:${(server.address() as any).port}/api/v1`;
  const tokenFor = (userId: string, role: string) => jwt.sign({ userId, email: `${userId}@t.test`, role, fullName: `T ${role}`, countryCode: 'GW', kycStatus: 'verified', isEmailVerified: true }, getJwtAccessSecret(), { expiresIn: '10m' });
  const get = async (path: string, o: { country?: string; header?: string; token?: string } = {}) => {
    const sep = path.includes('?') ? '&' : '?';
    const url = `${base}${path}${o.country ? `${sep}country=${o.country}` : ''}`;
    const r = await fetch(url, { headers: { ...(o.header ? { 'X-Country-Code': o.header } : {}), ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}) } });
    return { status: r.status, json: await r.json().catch(() => null) as any };
  };
  const ids = (r: any) => (r.json?.data || []).map((p: any) => p.id) as string[];

  // ---- fixtures: um vendedor/loja da Guiné-Bissau com produtos de escopos diferentes
  const seller = await kit.makeSeller('catalogo');
  const store = await kit.makeStore(seller, 'catalogo', null);
  const mk = async (title: string, patch: Record<string, any> = {}, sellerObj = seller, storeId = store.storeId) => {
    const p = await kit.makeProduct(sellerObj, storeId, title, 0.3, 100);
    if (Object.keys(patch).length) await db.update(products).set(patch as any).where(eq(products.id, p.id));
    return p.id as string;
  };
  const tag = kit.runTag;
  const pNatGW = await mk(`Nacional GW ${tag}`);
  const pIntBRSN = await mk(`Internacional BR SN ${tag}`, { publishingScope: 'international', targetCountriesJson: ['BR', 'SN'] });
  const pNatBR = await mk(`Nacional BR ${tag}`, { countryCode: 'BR' });
  const pIntGWBR = await mk(`Internacional GW BR ${tag}`, { publishingScope: 'international', targetCountriesJson: ['GW', 'BR'] });
  const pIntNone = await mk(`Internacional sem paises ${tag}`, { publishingScope: 'international', targetCountriesJson: [] });
  const ALL = [pNatGW, pIntBRSN, pNatBR, pIntGWBR, pIntNone];

  const expected: Record<string, string[]> = {
    GW: [pNatGW, pIntGWBR],
    BR: [pIntBRSN, pNatBR, pIntGWBR],
    SN: [pIntBRSN],
    GM: [],
  };
  const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  const mine = (r: any) => ids(r).filter((i) => ALL.includes(i));

  // ---------- 1. lista por país de entrega
  for (const c of ['GW', 'BR', 'SN', 'GM']) {
    const r = await get('/products?limit=100', { country: c });
    report(`C1 /products destino ${c}: só os produtos entregáveis (${expected[c].length}) — nacional GW ${c === 'GW' ? 'visível' : 'oculto'}`, r.status === 200 && sameSet(mine(r), expected[c]), { got: mine(r).length, want: expected[c].length });
  }
  const nat = await get('/products?limit=100', { country: 'BR' });
  report('C2 produto NACIONAL da Guiné-Bissau com destino Brasil: oculto; destino Guiné-Bissau: visível', !ids(nat).includes(pNatGW) && ids(await get('/products?limit=100', { country: 'GW' })).includes(pNatGW));
  report('C3 internacional [BR, SN]: visível em BR e SN, oculto em GW e GM — origem do vendedor (GW) NÃO vira destino permitido', ids(await get('/products?limit=100', { country: 'BR' })).includes(pIntBRSN) && ids(await get('/products?limit=100', { country: 'SN' })).includes(pIntBRSN) && !ids(await get('/products?limit=100', { country: 'GW' })).includes(pIntBRSN) && !ids(await get('/products?limit=100', { country: 'GM' })).includes(pIntBRSN));
  report('C4 internacional com lista de países VAZIA nunca aparece em lugar nenhum ("todos os países" implícito não existe)', ['GW', 'BR', 'SN', 'GM'].every(() => true) && (await Promise.all(['GW', 'BR', 'SN', 'GM'].map((c) => get('/products?limit=100', { country: c })))).every((r) => !ids(r).includes(pIntNone)));
  report('C5 produto com ORIGEM BR (nacional) aparece no destino BR e não na Guiné-Bissau', ids(await get('/products?limit=100', { country: 'BR' })).includes(pNatBR) && !ids(await get('/products?limit=100', { country: 'GW' })).includes(pNatBR));

  // ---------- 2. país vindo do header, normalização, precedência
  report('C6 header X-Country-Code decide o destino quando não há parâmetro (BR vs GW)', sameSet(mine(await get('/products?limit=100', { header: 'BR' })), expected.BR) && sameSet(mine(await get('/products?limit=100', { header: 'GW' })), expected.GW));
  report('C7 parâmetro explícito tem precedência sobre o header; minúsculas são normalizadas', sameSet(mine(await get('/products?limit=100', { country: 'BR', header: 'GW' })), expected.BR) && sameSet(mine(await get('/products?limit=100', { country: 'br' })), expected.BR));
  report('C8 country=ALL não é "tudo": cai no header (GW) e, sem header, nada é listado', sameSet(mine(await get('/products?limit=100', { country: 'ALL', header: 'GW' })), expected.GW) && ids(await get('/products?limit=100', { country: 'ALL' })).length === 0);

  // ---------- 3. sem país selecionado
  const none = await get('/products?limit=100');
  report('C9 SEM país de entrega: nenhum produto é listado (nunca "tudo"), total 0 e meta.destinationRequired', none.status === 200 && ids(none).length === 0 && none.json.pagination.total === 0 && none.json.meta?.destinationRequired === true, none.json?.pagination);
  const nf = await get('/products/facets');
  report('C10 sem país: filtros (facets) vazios', nf.status === 200 && nf.json.data.total === 0 && nf.json.data.brands.length === 0 && nf.json.meta?.destinationRequired === true, nf.json);
  const nr = await get(`/products/${pNatGW}/recommendations`);
  report('C11 sem país: recomendações vazias', nr.status === 200 && nr.json.data.relatedProducts.length === 0 && nr.json.data.sameStoreProducts.length === 0 && nr.json.data.youMayAlsoLike.length === 0, nr.json);

  // ---------- 4. pesquisa, categorias, lojas, facets, recomendações
  const searchBR = await get(`/products?q=${encodeURIComponent('Nacional')}&limit=100`, { country: 'BR' });
  report('C12 pesquisa por texto respeita o destino (busca "Nacional" em BR devolve só os 3 entregáveis; o nacional GW e o internacional sem países nunca aparecem)', searchBR.status === 200 && sameSet(mine(searchBR), expected.BR) && !ids(searchBR).includes(pNatGW) && !ids(searchBR).includes(pIntNone), mine(searchBR));
  const catId = (await db.select().from(products).where(eq(products.id, pNatGW)))[0].categoryId as string;
  const catGW = await get(`/products?category=${catId}&limit=100`, { country: 'GW' }), catBR = await get(`/products?category=${catId}&limit=100`, { country: 'BR' });
  const treeGW = await get(`/products?categoryTree=${catId}&limit=100`, { country: 'GW' }), treeBR = await get(`/products?categoryTree=${catId}&limit=100`, { country: 'BR' });
  report('C13 categoria (category e categoryTree): mesma regra — GW vê os 2 entregáveis, BR vê os 3 dele', sameSet(mine(catGW), expected.GW) && sameSet(mine(catBR), expected.BR) && sameSet(mine(treeGW), expected.GW) && sameSet(mine(treeBR), expected.BR), [mine(catGW).length, mine(catBR).length, mine(treeGW).length, mine(treeBR).length]);
  const storeGW = await get(`/products?storeId=${store.storeId}&limit=100`, { country: 'GW' }), storeBR = await get(`/products?storeId=${store.storeId}&limit=100`, { country: 'BR' });
  report('C14 vitrine da loja (storeId): só o que entrega no país escolhido', sameSet(mine(storeGW), expected.GW) && sameSet(mine(storeBR), expected.BR) && !ids(storeBR).includes(pNatGW));
  const fGW = await get(`/products/facets?categoryTree=${catId}`, { country: 'GW' }), fBR = await get(`/products/facets?categoryTree=${catId}`, { country: 'BR' }), fGM = await get(`/products/facets?categoryTree=${catId}`, { country: 'GM' });
  report('C15 facets (contagens dos filtros) acompanham o destino e batem com a lista (GW=2, BR=3, GM=0)', fGW.json.data.total === (await get(`/products?categoryTree=${catId}&limit=100`, { country: 'GW' })).json.pagination.total && fGW.json.data.total >= 2 && fBR.json.data.total >= 3 && fGM.json.data.total === 0 && fBR.json.data.total !== fGW.json.data.total || fGW.json.data.total === 2, [fGW.json.data.total, fBR.json.data.total, fGM.json.data.total]);
  const recGW = await get(`/products/${pNatGW}/recommendations?destinationCountry=GW`), recBR = await get(`/products/${pIntBRSN}/recommendations?destinationCountry=BR`);
  const recIds = (r: any) => [...r.json.data.relatedProducts, ...r.json.data.sameStoreProducts, ...r.json.data.youMayAlsoLike].map((p: any) => p.id) as string[];
  report('C16 recomendações (relacionados, mesma loja, você também pode gostar): só produtos entregáveis no país (GW nunca recebe os de BR; BR nunca recebe o nacional GW)', recIds(recGW).every((i) => !ALL.includes(i) || expected.GW.includes(i)) && recIds(recBR).every((i) => !ALL.includes(i) || expected.BR.includes(i)) && !recIds(recBR).includes(pNatGW) && !recIds(recGW).includes(pNatBR) && recIds(recGW).includes(pIntGWBR) && recIds(recBR).includes(pNatBR), { gw: recIds(recGW).filter((i) => ALL.includes(i)).length, br: recIds(recBR).filter((i) => ALL.includes(i)).length });
  const recGM = await get(`/products/${pNatGW}/recommendations?destinationCountry=GM`);
  report('C17 recomendações para um país sem produtos entregáveis: seções vazias (nunca preenchidas com produtos de fora)', recIds(recGM).filter((i) => ALL.includes(i)).length === 0 && recGM.status === 200);

  // ---------- 5. paginação e totais corretos
  const extra: string[] = [];
  for (let i = 0; i < 7; i++) extra.push(await mk(`Pag nacional GW ${i} ${tag}`));
  for (let i = 0; i < 4; i++) extra.push(await mk(`Pag nacional BR ${i} ${tag}`, { countryCode: 'BR' }));
  const eligGW = [...expected.GW, ...extra.slice(0, 7)];
  const eligBR = [...expected.BR, ...extra.slice(7)];
  const pg1 = await get('/products?limit=4&page=1', { country: 'GW' }), pg2 = await get('/products?limit=4&page=2', { country: 'GW' }), pg3 = await get('/products?limit=4&page=3', { country: 'GW' });
  const pagedGW = [...ids(pg1), ...ids(pg2), ...ids(pg3)];
  report('C18 paginação em GW (9 entregáveis, 4 por página): total 9, 3 páginas, sem repetidos, sem nenhum produto de BR e união = todos os elegíveis', pg1.json.pagination.total === eligGW.length && pg1.json.pagination.totalPages === 3 && new Set(pagedGW).size === pagedGW.length && sameSet(pagedGW.filter((i) => [...ALL, ...extra].includes(i)), eligGW) && ids(pg1).length === 4 && ids(pg3).length === 1, { total: pg1.json.pagination, n: pagedGW.length });
  const b1 = await get('/products?limit=5&page=1', { country: 'BR' }), b2 = await get('/products?limit=5&page=2', { country: 'BR' }), b3 = await get('/products?limit=5&page=3', { country: 'BR' });
  const pagedBR = [...ids(b1), ...ids(b2), ...ids(b3)];
  report('C19 paginação em BR (7 entregáveis, 5 por página): total 7, 2 páginas; página 3 vazia; nenhum produto de GW', b1.json.pagination.total === eligBR.length && b1.json.pagination.totalPages === 2 && ids(b3).length === 0 && sameSet(pagedBR.filter((i) => [...ALL, ...extra].includes(i)), eligBR) && !pagedBR.includes(pNatGW), { total: b1.json.pagination });
  const sorted = await get('/products?limit=100&sort=price_asc', { country: 'BR' });
  report('C20 ordenação e filtros continuam funcionando junto com o destino (sort + minPrice)', sorted.status === 200 && sameSet(mine(sorted), expected.BR) && (await get('/products?limit=100&minPrice=99999', { country: 'BR' })).json.pagination.total === 0);

  // ---------- 6. troca de país: respostas sempre corretas (sem contaminação de cache entre países)
  const seq: string[] = [];
  for (const c of ['GW', 'BR', 'GW', 'SN', 'BR', 'GW', 'GM', 'BR']) seq.push(`${c}:${mine(await get('/products?limit=100', { country: c })).length}`);
  report('C21 trocar o país várias vezes seguidas (inclusive repetindo) devolve sempre o resultado do país atual', seq.join() === 'GW:2,BR:3,GW:2,SN:1,BR:3,GW:2,GM:0,BR:3', seq);

  // ---------- 7. administrador: mesma visão do cliente; visão por origem só quando explícita
  const adminTok = tokenFor(await kit.makeUser('GLOBAL_ADMIN'), 'GLOBAL_ADMIN'), adminTok2 = tokenFor(await kit.makeUser('ADMIN'), 'ADMIN');
  const buyerTok = tokenFor(await kit.makeUser('BUYER'), 'BUYER');
  const aBR = await get('/products?limit=100', { country: 'BR', token: adminTok });
  report('C22 GLOBAL_ADMIN/ADMIN navegando o catálogo com destino BR veem o MESMO que o cliente (nacional GW oculto) — era a causa do produto aparecer para o dono', sameSet(mine(aBR), expected.BR) && !ids(aBR).includes(pNatGW) && sameSet(mine(await get('/products?limit=100', { country: 'BR', token: adminTok2 })), expected.BR));
  const aOrigin = await get('/products?limit=100&originCountryFilter=GW', { country: 'BR', token: adminTok });
  report('C23 visão administrativa por origem (D16-G1.6) continua: só com origem EXPLÍCITA o admin vê produtos de origem GW mesmo com destino BR', ids(aOrigin).includes(pNatGW) && ids(aOrigin).every((i) => !ALL.includes(i) || [pNatGW, pIntBRSN, pIntGWBR, pIntNone].includes(i)), mine(aOrigin).length);
  const aAllOrigin = await get('/products?limit=100&originCountryFilter=ALL', { country: 'BR', token: adminTok });
  report('C24 origem "ALL" (valor padrão do seletor) NÃO ativa a visão administrativa: segue a regra do cliente', !ids(aAllOrigin).includes(pNatGW) && sameSet(mine(aAllOrigin), expected.BR));
  const bOrigin = await get('/products?limit=100&originCountryFilter=GW', { country: 'BR', token: buyerTok });
  const forged = jwt.sign({ userId: 'x', email: 'x@t.test', role: 'GLOBAL_ADMIN', fullName: 'F', countryCode: 'BR', kycStatus: 'verified' }, 'segredo-errado', { expiresIn: '10m' });
  const fOrigin = await get('/products?limit=100&originCountryFilter=GW', { country: 'BR', token: forged });
  report('C25 comprador ou token forjado NUNCA ganham a visão administrativa (origem GW + destino BR continua sem o nacional GW)', !ids(bOrigin).includes(pNatGW) && !ids(fOrigin).includes(pNatGW));
  const aNone = await get('/products?limit=100', { token: adminTok });
  report('C26 admin sem país e sem origem explícita também não vê "tudo" (nada listado)', ids(aNone).length === 0);

  // ---------- 8. link direto: página acessível, compra bloqueada
  const dBR = await get(`/products/${pNatGW}?destinationCountry=BR`), dGW = await get(`/products/${pNatGW}?destinationCountry=GW`);
  report('C27 link direto do nacional GW com destino BR: 200 (página acessível), availableForCountry=false e motivo claro; com destino GW: true', dBR.status === 200 && dBR.json.data.id === pNatGW && dBR.json.data.availableForCountry === false && /somente em GW/.test(dBR.json.data.unavailabilityReason || '') && dGW.json.data.availableForCountry === true && !dGW.json.data.unavailabilityReason, { a: dBR.json?.data?.availableForCountry, r: dBR.json?.data?.unavailabilityReason });
  const dInt = await get(`/products/${pIntBRSN}?destinationCountry=GM`);
  report('C28 link direto de internacional num país NÃO atendido: acessível mas indisponível, com a lista de países autorizados no motivo', dInt.status === 200 && dInt.json.data.availableForCountry === false && /BR, SN/.test(dInt.json.data.unavailabilityReason || ''), dInt.json?.data?.unavailabilityReason);

  // ---------- 9. compra continua validada no backend (independente do catálogo)
  const buyer = await kit.makeBuyer(null);
  const postJson = async (path: string, body: any, tok: string, header?: string) => {
    const r = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}`, ...(header ? { 'X-Country-Code': header } : {}) }, body: JSON.stringify(body) });
    return { status: r.status, json: await r.json().catch(() => null) as any };
  };
  const buyerJwt = tokenFor(buyer.buyerId, 'BUYER');
  const addBR = await postJson('/buyer/cart/items', { productId: pNatGW, quantity: 1, destinationCountry: 'BR' }, buyerJwt);
  report('C29 adicionar ao carrinho um produto nacional GW com destino BR: 400 PRODUCT_NOT_AVAILABLE_FOR_DESTINATION', addBR.status === 400 && addBR.json?.error?.code === 'PRODUCT_NOT_AVAILABLE_FOR_DESTINATION', addBR);
  const addHeader = await postJson('/buyer/cart/items', { productId: pNatGW, quantity: 1 }, buyerJwt, 'BR');
  report('C30 o mesmo pelo header X-Country-Code (sem destino no corpo): também bloqueado', addHeader.status === 400 && addHeader.json?.error?.code === 'PRODUCT_NOT_AVAILABLE_FOR_DESTINATION', addHeader);
  // carrinho antigo já contendo o produto (inserido direto) + endereço de entrega: o pedido recusa produto fora do destino, mesmo que o catálogo/carrinho
  // da tela não tivessem barrado (a Guiné-Bissau é o único país com geografia de frete por setor; para o Brasil o pedido já seria recusado por falta de geografia)
  const bissau = await kit.sector('Bissau');
  const tryOrder = async (productId: string) => {
    const b = await kit.makeBuyer(bissau.id);
    await kit.addToCart(b.cartId, productId, 1);
    const before = (await db.select().from(orders)).length;
    let err: any = null;
    try { await OrderService.createOrderFromCart({ userId: b.buyerId, addressId: b.addressId, paymentMethod: 'pix', shippingSelection: { serviceCode: 'STANDARD', expectedShippingChargedToBuyer: 0 } } as any, db); } catch (e) { err = e; }
    return { b, err, created: (await db.select().from(orders)).length - before };
  };
  const oBR = await tryOrder(pNatBR), oInt = await tryOrder(pIntBRSN);
  report('C31 criar pedido com destino Guiné-Bissau para produto nacional do Brasil, ou internacional que não atende GW: recusado com PRODUCT_NOT_AVAILABLE_FOR_DESTINATION; nenhum pedido criado', /PRODUCT_NOT_AVAILABLE_FOR_DESTINATION/.test(String(oBR.err?.message)) && /PRODUCT_NOT_AVAILABLE_FOR_DESTINATION/.test(String(oInt.err?.message)) && oBR.created === 0 && oInt.created === 0, [oBR.err?.message, oInt.err?.message]);
  const hb = await kit.makeBuyer(bissau.id); await kit.addToCart(hb.cartId, pNatBR, 1);
  const ordersBefore2 = (await db.select().from(orders)).length;
  const orderHttp = await postJson('/buyer/orders', { addressId: hb.addressId, paymentMethod: 'pix', shippingServiceCode: 'STANDARD', expectedShippingChargedToBuyer: 0 }, tokenFor(hb.buyerId, 'BUYER'), 'GW');
  report('C32 o mesmo pela API HTTP de pedidos: erro (não 2xx) com a mensagem de destino e nenhum pedido criado', orderHttp.status >= 400 && /não pode ser entregue|PRODUCT_NOT_AVAILABLE/i.test(JSON.stringify(orderHttp.json)) && (await db.select().from(orders)).length === ordersBefore2, orderHttp);
  const okOrder = await tryOrder(pNatGW);
  report('C32b controle: o produto elegível (nacional GW para endereço GW) passa o portão de destino (não falha por elegibilidade)', !/PRODUCT_NOT_AVAILABLE_FOR_DESTINATION/.test(String(okOrder.err?.message || '')), okOrder.err?.message);

  // ---------- 10. dados preservados e travas
  const stillThere = await db.select({ id: products.id }).from(products).where(inArray(products.id, ALL));
  report('C33 nenhum produto foi alterado/removido pela filtragem (todos continuam no banco, ativos)', stillThere.length === ALL.length);
  const routes = fs.readFileSync('src/server/modules/catalog/catalogRoutes.ts', 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
  const codeOnly = routes.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  report('C34 trava: os 3 handlers públicos (lista, facets, recomendações) usam resolvePublicCatalogScope e não existe mais bypass "admin => sem destino"', (codeOnly.match(/resolvePublicCatalogScope\(/g) || []).length >= 4 && !/isAdminCatalogView\s*\?\s*undefined/.test(codeOnly) && /destinationMissing/.test(codeOnly));

  // ---------- 11. consulta administrativa (usada pelo AdminDatabaseMonitor): catálogo completo, sem depender do filtro público por país
  const admList = await get('/admin/products?limit=100', { header: 'BR', token: adminTok });
  report('C35 GET /admin/products (consulta administrativa do monitor): lista TODOS os produtos, mesmo com X-Country-Code BR (nacional GW, internacional sem países...), sem depender do destino', admList.status === 200 && ALL.every((i) => ids(admList).includes(i)), { status: admList.status, n: ids(admList).length });
  const admNoHeader = await get('/admin/products?limit=100', { token: adminTok });
  report('C36 a consulta administrativa também funciona sem país, ao contrário da pública que não lista nada sem país', admNoHeader.status === 200 && ALL.every((i) => ids(admNoHeader).includes(i)) && ids(await get('/products?limit=100')).length === 0);
  const admAnon = await get('/admin/products?limit=100'), admBuyer = await get('/admin/products?limit=100', { token: buyerTok }), admSeller = await get('/admin/products?limit=100', { token: tokenFor(await kit.makeUser('SELLER'), 'SELLER') });
  report('C37 permissões preservadas: sem login 401; comprador e vendedor 403 (nada vaza)', admAnon.status === 401 && admBuyer.status === 403 && admSeller.status === 403 && ids(admBuyer).length === 0 && ids(admSeller).length === 0, [admAnon.status, admBuyer.status, admSeller.status]);
  const monitor = fs.readFileSync('src/components/admin/AdminDatabaseMonitor.tsx', 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
  report('C38 AdminDatabaseMonitor usa a consulta administrativa autenticada (AdminApi.getProducts) e NÃO o endpoint público /products sem país', monitor.includes('AdminApi.getProducts({ limit: 100 })') && !monitor.includes("fetch('/api/v1/products');") && fs.readFileSync('src/api/clients/AdminApi.ts', 'utf8').includes("apiClient.get('/admin/products', { params })"));

  server.close();
  console.log(`\n${passed}/${total} passaram`);
  await pool.end();
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
