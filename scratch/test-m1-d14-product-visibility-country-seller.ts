/**
 * FASE M1-D14 — regressão dos dois bugs de visibilidade de produto
 * encontrados no E2E de staging:
 *
 *   1) COMPRADOR/HOME: HomePage.tsx chamava useProducts() SEM nenhum filtro
 *      — a queryKey do React Query nunca incluía o país selecionado, então
 *      a lista de produtos era buscada UMA VEZ (com o país que estivesse em
 *      vigor no primeiro mount) e nunca era refeita ao trocar de país.
 *      Corrigido: useProducts({ country: selectedCountry }) — a queryKey
 *      passa a incluir o país (força refetch a cada troca) e o backend
 *      recebe o destino explícito, sem depender só do header.
 *   2) Bug cosmético: Header.tsx mostrava "Bissau" (cidade fixa) junto do
 *      país real selecionado (ex.: "Bissau, Brasil") — removido, mostra só
 *      o país real.
 *   3) VENDEDOR: investigado e CONFIRMADO CORRETO por arquitetura — este
 *      teste prova empiricamente que GET /seller/products nunca aplica o
 *      filtro geográfico/isActive do catálogo público (por design), então
 *      Seller A/B sempre veem seus próprios produtos independente de
 *      disponibilidade pública. Nenhuma mudança de código foi necessária
 *      do lado do vendedor.
 *
 * Este arquivo prova, via HTTP real (express + http.createServer + JWT
 * real quando aplicável) contra Postgres Docker isolado (chain completa de
 * migrations, NUNCA staging/produção), que a regra de elegibilidade
 * geográfica (productEligibilityService.ts / catalogService.ts) continua
 * intacta e que o novo parâmetro `country` funciona ponta-a-ponta.
 *
 * NÃO toca comissão/checkout/escrow/wallet/refund — só leitura de catálogo
 * (GET /products, GET /admin/categories, GET /seller/products).
 */
import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';

const testDbUrl = assertLedgerTestDatabaseGuard();
process.env.DATABASE_URL = testDbUrl;

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import { users, sellers, stores, categories, products, inventory } from '../src/db/schema.js';
import { getJwtAccessSecret } from '../src/server/modules/auth/jwtConfig.js';
import { getProductsHandler } from '../src/server/modules/catalog/catalogRoutes.js';
import { adminRouter } from '../src/server/adminRoutes.js';
import { sellerRouter } from '../src/server/sellerRoutes.js';

const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false } });
const db = drizzle(pool, { schema });

let passed = 0, total = 0;
function report(label: string, ok: boolean, detail?: any) {
  total++; if (ok) passed++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${detail !== undefined ? ' -> ' + JSON.stringify(detail) : ''}`);
}
let seq = 0;
const uid = (p: string) => `${p}_m1d14_${Date.now()}_${++seq}_${Math.random().toString(36).slice(2, 6)}`;

function signToken(user: { id: string; role: string; fullName: string }) {
  return jwt.sign(
    { userId: user.id, email: `${user.id}@t.test`, role: user.role, fullName: user.fullName, countryCode: 'BR', kycStatus: 'unverified', isEmailVerified: true },
    getJwtAccessSecret(),
    { expiresIn: '1h' }
  );
}
function buildServer() {
  const app = express();
  app.use(express.json());
  app.get('/products', getProductsHandler);
  app.use('/admin', adminRouter);
  app.use('/seller', sellerRouter);
  return http.createServer(app);
}
async function startServer(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  return `http://127.0.0.1:${address.port}`;
}
async function getProductsAs(baseUrl: string, country?: string) {
  const url = country ? `${baseUrl}/products?country=${country}` : `${baseUrl}/products`;
  const res = await fetch(url);
  return { status: res.status, body: await res.json() };
}
async function getSellerProducts(baseUrl: string, token: string) {
  const res = await fetch(`${baseUrl}/seller/products`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, body: await res.json() };
}
async function getAdminCategories(baseUrl: string, token: string) {
  const res = await fetch(`${baseUrl}/admin/categories`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, body: await res.json() };
}

async function makeSellerWithProduct(opts: {
  label: string; countryCode: string; categoryId: string; isActive: boolean; title: string;
}) {
  const userId = uid(`usr_${opts.label}`);
  await db.insert(users).values({
    id: userId, email: `${userId}@t.test`, passwordHash: 'x', fullName: `Seller ${opts.label}`,
    phone: '11999999999', role: 'SELLER', countryCode: opts.countryCode, kycStatus: 'verified', riskScore: 'baixo',
    isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const sellerId = uid(`seller_${opts.label}`);
  await db.insert(sellers).values({
    id: sellerId, userId, companyName: `Loja ${opts.label}`, tradingName: `Loja ${opts.label}`,
    taxId: '00000000000', phone: '11999999999', countryCode: opts.countryCode, status: 'active',
    createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const storeId = uid(`store_${opts.label}`);
  await db.insert(stores).values({
    id: storeId, sellerId, name: `Loja ${opts.label}`, slug: `loja-${opts.label.toLowerCase()}-${storeId}`,
    countryCode: opts.countryCode, status: 'active', createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const productId = uid(`prod_${opts.label}`);
  await db.insert(products).values({
    id: productId, title: opts.title, price: '10.00', image: 'x.jpg',
    sellerId, storeId, categoryId: opts.categoryId, currency: opts.countryCode === 'BR' ? 'BRL' : 'XOF',
    countryCode: opts.countryCode, publishingScope: 'national', isActive: opts.isActive, status: 'active',
    stock: 100, createdAt: new Date(), updatedAt: new Date(),
  } as any);
  await db.insert(inventory).values({
    id: uid(`inv_${opts.label}`), locationType: 'SELLER_LOCATION', sellerId, productId,
    quantityOnHand: 100, quantityReserved: 0, createdAt: new Date(), updatedAt: new Date(),
  } as any);
  return { userId, sellerId, storeId, productId, token: signToken({ id: userId, role: 'SELLER', fullName: `Seller ${opts.label}` }) };
}

async function main() {
  await db.insert(schema.countries).values([
    { id: 'BR', code: 'BR', name: 'Brasil', flag: '🇧🇷', currency: 'BRL', currencySymbol: 'R$', phonePrefix: '+55', isActive: true, createdAt: new Date() },
    { id: 'GW', code: 'GW', name: 'Guiné-Bissau', flag: '🇬🇼', currency: 'XOF', currencySymbol: 'CFA', phonePrefix: '+245', isActive: true, createdAt: new Date() },
  ]).onConflictDoNothing();

  const catId = uid('cat_staging');
  await db.insert(categories).values({
    id: catId, name: `Staging Tests D14 ${catId}`, slug: `staging-tests-d14-${catId}`,
    icon: 'Tag', isActive: true, displayOrder: 0, createdAt: new Date(),
  } as any);

  // Réplica das condições reais de staging: Produto A e B, BR, national, ativos.
  const a = await makeSellerWithProduct({ label: 'A', countryCode: 'BR', categoryId: catId, isActive: true, title: 'Produto Staging A (D14)' });
  const b = await makeSellerWithProduct({ label: 'B', countryCode: 'BR', categoryId: catId, isActive: true, title: 'Produto Staging B (D14)' });
  // Produto INATIVO na mesma categoria/país — nunca deve aparecer publicamente.
  const inactive = await makeSellerWithProduct({ label: 'Inativo', countryCode: 'BR', categoryId: catId, isActive: false, title: 'Produto Inativo (D14)' });
  // Produto de OUTRO país (GW) na mesma categoria — nunca deve vazar para destino BR.
  const other = await makeSellerWithProduct({ label: 'GW', countryCode: 'GW', categoryId: catId, isActive: true, title: 'Produto GW (D14)' });

  const server = buildServer();
  const baseUrl = await startServer(server);

  try {
    // =========================================================================
    // COMPRADOR — destino BR (mesma chamada que HomePage.tsx faz agora)
    // =========================================================================
    const resBR = await getProductsAs(baseUrl, 'BR');
    const idsBR = (resBR.body.data as any[]).map((p) => p.id);
    report('1. destino=BR: Produto A aparece', idsBR.includes(a.productId));
    report('1. destino=BR: Produto B aparece', idsBR.includes(b.productId));
    report('2. destino=BR: produto INATIVO não aparece', !idsBR.includes(inactive.productId));
    report('5. destino=BR: produto de OUTRO país (GW) não vaza', !idsBR.includes(other.productId));

    // =========================================================================
    // COMPRADOR — destino GW: produtos nacionais BR não devem aparecer
    // =========================================================================
    const resGW = await getProductsAs(baseUrl, 'GW');
    const idsGW = (resGW.body.data as any[]).map((p) => p.id);
    report('4. destino=GW: Produto A (nacional BR) NÃO aparece', !idsGW.includes(a.productId));
    report('4. destino=GW: Produto B (nacional BR) NÃO aparece', !idsGW.includes(b.productId));
    report('4. destino=GW: Produto GW (nacional GW) aparece', idsGW.includes(other.productId));

    // =========================================================================
    // 3/4. "Trocar país refaz a listagem": no nível HTTP isso significa que
    // BR e GW devem devolver conjuntos DIFERENTES (nunca o mesmo resultado
    // cacheado/ignorado) — já provado pelos dois blocos acima, mas reforça
    // explicitamente a comparação.
    // =========================================================================
    report('3/4. BR e GW retornam conjuntos diferentes (troca de país realmente muda o resultado)',
      JSON.stringify(idsBR.sort()) !== JSON.stringify(idsGW.sort()));

    // =========================================================================
    // Guarda estática: HomePage.tsx precisa continuar passando `country` para
    // useProducts() — se alguém reverter para useProducts() sem args, este
    // teste falha mesmo sem precisar de um runner de React/DOM.
    // =========================================================================
    const homePageSrc = fs.readFileSync(path.resolve('src/pages/HomePage.tsx'), 'utf-8');
    report('Guarda estática: HomePage.tsx passa country para useProducts (nunca useProducts() sem args)',
      /useProducts\(\s*\{\s*country:\s*selectedCountry\s*\}\s*\)/.test(homePageSrc));
    report('Guarda estática: Header.tsx não usa mais "Bissau" hardcoded',
      !fs.readFileSync(path.resolve('src/components/Header.tsx'), 'utf-8').includes("'Bissau'"));

    // =========================================================================
    // VENDEDOR — GET /seller/products NUNCA aplica o filtro geográfico/
    // isActive do catálogo público (política atual, confirmada, não alterada)
    // =========================================================================
    const sellerAProducts = await getSellerProducts(baseUrl, a.token);
    const sellerAIds = (sellerAProducts.body.data as any[]).map((p: any) => p.id);
    report('6. Seller A vê o Produto A no painel privado', sellerAIds.includes(a.productId));
    report('Seller A NÃO vê o produto de Seller B (isolamento por sellerId)', !sellerAIds.includes(b.productId));

    const sellerBProducts = await getSellerProducts(baseUrl, b.token);
    const sellerBIds = (sellerBProducts.body.data as any[]).map((p: any) => p.id);
    report('6. Seller B vê o Produto B no painel privado', sellerBIds.includes(b.productId));

    // Item 7: o vendedor não perde acesso administrativo ao próprio produto
    // por causa do país/disponibilidade pública — o "Seller Inativo" (isActive
    // false, invisível no catálogo) e o "Seller GW" (país diferente do
    // exemplo BR) continuam aparecendo no PRÓPRIO painel de quem os criou.
    const sellerInactiveProducts = await getSellerProducts(baseUrl, inactive.token);
    const sellerInactiveIds = (sellerInactiveProducts.body.data as any[]).map((p: any) => p.id);
    report('7. Seller continua vendo produto INATIVO (isActive=false) no próprio painel — política atual, não alterada',
      sellerInactiveIds.includes(inactive.productId));

    const sellerOtherProducts = await getSellerProducts(baseUrl, other.token);
    const sellerOtherIds = (sellerOtherProducts.body.data as any[]).map((p: any) => p.id);
    report('7. Seller continua vendo produto de OUTRO país no próprio painel — sem filtro geográfico no endpoint privado',
      sellerOtherIds.includes(other.productId));

    // =========================================================================
    // ADMIN — continua vendo os produtos (contagem por categoria, sempre
    // incondicional — não foi alterado nesta correção)
    // =========================================================================
    const adminUserId = uid('usr_admin');
    await db.insert(users).values({
      id: adminUserId, email: `${adminUserId}@t.test`, passwordHash: 'x', fullName: 'Admin D14',
      phone: '', role: 'ADMIN', countryCode: 'BR', kycStatus: 'verified', riskScore: 'baixo',
      isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date(),
    } as any);
    const adminToken = signToken({ id: adminUserId, role: 'ADMIN', fullName: 'Admin D14' });
    const adminCatsRes = await getAdminCategories(baseUrl, adminToken);
    const adminCat = (adminCatsRes.body.data as any[]).find((c: any) => c.id === catId);
    report('8. Admin continua vendo a contagem de TODOS os 4 produtos (ativos e inativos, qualquer país)',
      adminCat && adminCat.prods === 4, adminCat?.prods);

    // =========================================================================
    // Nenhuma regra financeira alterada: nenhuma linha em orders/escrow/wallet
    // foi criada por este teste (só leitura de catálogo).
    // =========================================================================
    const ordersCount = await db.select().from(schema.orders);
    report('8b. Nenhum pedido/dado financeiro foi criado por este teste (só leitura de catálogo)', ordersCount.length === 0);
  } finally {
    server.close();
    await pool.end();
  }

  console.log(`\n${passed}/${total} testes passaram.`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
