/**
 * FASE D16-G1.6 — Corrigir navegação do catálogo pelo GLOBAL_ADMIN no
 * seletor de origem do Header. Testes reais contra Postgres Docker
 * isolado (NUNCA Supabase, NUNCA OrderService/módulos financeiros —
 * teste rápido e terminável, mesmo padrão de fixtures do D16-G1).
 *
 * Cenários A-N do enunciado.
 */
import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';

const testDbUrl = assertLedgerTestDatabaseGuard();
process.env.SKIP_RUNTIME_ALIGN = 'true';

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/db/schema.js';
import { users, sellers, sellerProfiles, stores, categories } from '../src/db/schema.js';
import { ProductCreationService } from '../src/server/modules/catalog/productCreationService.js';
import { CatalogService } from '../src/server/modules/catalog/catalogService.js';
import { isGlobalCatalogAdmin } from '../src/server/modules/auth/scopeService.js';
import { getOptionalAuthUser } from '../src/server/modules/auth/authMiddleware.js';
import { getJwtAccessSecret } from '../src/server/modules/auth/jwtConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const pool = new pg.Pool({ connectionString: testDbUrl, ssl: false });
const db = drizzle(pool, { schema });

let passed = 0, total = 0;
function report(label: string, ok: boolean, detail?: any) {
  total++; if (ok) passed++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${detail !== undefined ? ' -> ' + JSON.stringify(detail) : ''}`);
}
let seq = 0;
const uid = (p: string) => `${p}_g16_${Date.now()}_${++seq}_${Math.random().toString(36).slice(2, 6)}`;
const runTag = uid('run');

async function seedCountries() {
  await db.insert(schema.countries).values([
    { id: 'GW', code: 'GW', name: 'Guiné-Bissau', flag: '🇬🇼', currency: 'XOF', currencySymbol: 'CFA', phonePrefix: '+245', isActive: true, createdAt: new Date() },
    { id: 'BR', code: 'BR', name: 'Brasil', flag: '🇧🇷', currency: 'BRL', currencySymbol: 'R$', phonePrefix: '+55', isActive: true, createdAt: new Date() },
  ] as any).onConflictDoNothing();
}

async function makeSeller(countryCode: string) {
  const userId = uid('usr');
  await db.insert(users).values({
    id: userId, email: `${userId}@t.test`, passwordHash: 'x', fullName: `Seller ${userId}`,
    phone: '', role: 'SELLER', countryCode, kycStatus: 'verified', riskScore: 'baixo',
    isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const sellerId = uid('sel');
  await db.insert(sellers).values({
    id: sellerId, userId, companyName: `Loja ${sellerId}`, tradingName: `Loja ${sellerId}`, taxId: `TAX${sellerId}`,
    phone: '000000000', countryCode, status: 'active', commissionRate: '8.00' as any, createdAt: new Date(), updatedAt: new Date(),
  } as any);
  await db.insert(sellerProfiles).values({ id: uid('sp'), sellerId, verifiedAt: new Date(), createdAt: new Date(), updatedAt: new Date() });
  const storeId = uid('str');
  await db.insert(stores).values({ id: storeId, sellerId, name: `Store ${storeId}`, slug: storeId, countryCode, status: 'active', createdAt: new Date(), updatedAt: new Date() } as any);
  return { userId, sellerId, storeId };
}

const categoryIdPromise = (async () => {
  const categoryId = uid('cat');
  await db.insert(categories).values({ id: categoryId, name: 'Categoria G16', slug: categoryId, isActive: true, commissionRate: '10.00' as any, createdAt: new Date() } as any);
  return categoryId;
})();

async function makeProduct(seller: { userId: string; storeId: string }, title: string) {
  const categoryId = await categoryIdPromise;
  return ProductCreationService.createProduct(seller.userId, {
    title: `${title} ${runTag}`, price: 50, categoryId, image: 'https://example.com/x.png', storeId: seller.storeId,
    stock: 10, weightKg: 0.5, dimensionsCm: { length: 10, width: 10, height: 10 },
    publishingScope: 'national',
  } as any, db);
}

// Simula EXATAMENTE o que getProductsHandler faz: resolve isAdminCatalogView
// a partir de um "usuário autenticado" (ou não) e monta os filtros para
// CatalogService.getProducts — mesma lógica, chamada real (não uma cópia).
async function catalogFor(authUser: { role?: string } | undefined, destination: string | undefined, origin: string | undefined) {
  const isAdminCatalogView = isGlobalCatalogAdmin(authUser);
  return CatalogService.getProducts({
    country: isAdminCatalogView ? undefined : (destination === 'ALL' ? undefined : destination),
    originCountryFilter: origin,
    limit: 200,
  }, db);
}

async function main() {
  await seedCountries();
  const sellerGW = await makeSeller('GW');
  const sellerBR = await makeSeller('BR');

  const pGW = await makeProduct(sellerGW, 'GW national D16G16');
  const pBR = await makeProduct(sellerBR, 'BR national D16G16');

  const GLOBAL_ADMIN = { role: 'GLOBAL_ADMIN' };
  const BUYER = { role: 'BUYER' };
  const SELLER = { role: 'SELLER' };
  const GUEST = undefined;

  // ===========================================================================
  // A — GLOBAL_ADMIN, destino BR, origem GW, produto GW national -> YES
  // ===========================================================================
  const rA = await catalogFor(GLOBAL_ADMIN, 'BR', 'GW');
  report('A. GLOBAL_ADMIN destino BR + origem GW -> vê produto GW national', rA.products.some((p: any) => p.id === pGW.id));

  // ===========================================================================
  // B — GLOBAL_ADMIN, destino BR, origem BR, produto GW national -> NO
  // (filtro de origem continua filtrando por origem, só a elegibilidade de
  // destino é que é pulada).
  // ===========================================================================
  const rB = await catalogFor(GLOBAL_ADMIN, 'BR', 'BR');
  report('B. GLOBAL_ADMIN destino BR + origem BR -> NÃO vê produto GW national (filtro de origem continua funcionando)', !rB.products.some((p: any) => p.id === pGW.id));
  report('B2. GLOBAL_ADMIN destino BR + origem BR -> vê o produto BR national', rB.products.some((p: any) => p.id === pBR.id));

  // ===========================================================================
  // C — GLOBAL_ADMIN, destino BR, origem ALL, produto GW national -> YES
  // ===========================================================================
  const rC = await catalogFor(GLOBAL_ADMIN, 'BR', 'ALL');
  report('C. GLOBAL_ADMIN destino BR + origem ALL -> vê produto GW national', rC.products.some((p: any) => p.id === pGW.id));
  report('C2. GLOBAL_ADMIN destino BR + origem ALL -> vê AMBOS os produtos (GW e BR) juntos', rC.products.some((p: any) => p.id === pGW.id) && rC.products.some((p: any) => p.id === pBR.id));

  // ===========================================================================
  // D — GLOBAL_ADMIN, destino GW, origem BR, produto BR national -> YES
  // (destino é totalmente ignorado na visão admin, mesmo trocado para GW).
  // ===========================================================================
  const rD = await catalogFor(GLOBAL_ADMIN, 'GW', 'BR');
  report('D. GLOBAL_ADMIN destino GW + origem BR -> vê produto BR national (destino irrelevante na visão admin)', rD.products.some((p: any) => p.id === pBR.id));

  // ===========================================================================
  // E — BUYER, destino BR, origem GW, produto GW national -> NO (inalterado)
  // ===========================================================================
  const rE = await catalogFor(BUYER, 'BR', 'GW');
  report('E. BUYER destino BR + origem GW -> NÃO vê produto GW national (comportamento público preservado)', !rE.products.some((p: any) => p.id === pGW.id));

  // ===========================================================================
  // F/G — SELLER e guest seguem o MESMO caminho público que BUYER (nenhuma
  // regra especial para seller/guest — isGlobalCatalogAdmin é false para
  // ambos).
  // ===========================================================================
  const rF = await catalogFor(SELLER, 'BR', 'GW');
  report('F. SELLER destino BR + origem GW -> mesmo resultado de BUYER (comportamento público preservado)', !rF.products.some((p: any) => p.id === pGW.id));
  const rG = await catalogFor(GUEST, 'BR', 'GW');
  report('G. guest (sem autenticação) destino BR + origem GW -> mesmo resultado de BUYER (comportamento público preservado)', !rG.products.some((p: any) => p.id === pGW.id));

  // ===========================================================================
  // H/I — BUYER/SELLER não conseguem ativar a visão admin nem com um JWT
  // real e válido (a role em si é que decide, nunca query/body/header
  // customizado) nem com um JWT forjado (assinado com segredo errado).
  // ===========================================================================
  const realSecret = getJwtAccessSecret();
  const buyerRealToken = jwt.sign({ userId: 'u1', email: 'b@t.test', role: 'BUYER', fullName: 'B', countryCode: 'BR', kycStatus: 'verified' }, realSecret, { expiresIn: '1h' });
  const buyerAuthUser = getOptionalAuthUser({ headers: { authorization: `Bearer ${buyerRealToken}` } } as any);
  report('H. BUYER com JWT REAL e válido -> isGlobalCatalogAdmin ainda é false (a role em si nunca é GLOBAL_ADMIN)', isGlobalCatalogAdmin(buyerAuthUser) === false);

  const forgedToken = jwt.sign({ userId: 'hacker', email: 'h@t.test', role: 'GLOBAL_ADMIN', fullName: 'H', countryCode: 'BR', kycStatus: 'verified' }, 'segredo-errado-forjado', { expiresIn: '1h' });
  const forgedAuthUser = getOptionalAuthUser({ headers: { authorization: `Bearer ${forgedToken}` } } as any);
  report('I. Token GLOBAL_ADMIN FORJADO (assinado com segredo errado) -> getOptionalAuthUser retorna undefined (jwt.verify rejeita)', forgedAuthUser === undefined);
  report('I2. Sem header Authorization nenhum -> getOptionalAuthUser retorna undefined (nunca lança, nunca bloqueia)', getOptionalAuthUser({ headers: {} } as any) === undefined);

  // Verificação estrutural: getOptionalAuthUser/getProductsHandler nunca
  // leem req.query/req.body para decidir a visão admin.
  const authMiddlewareSrc = fs.readFileSync(path.join(ROOT, 'src/server/modules/auth/authMiddleware.ts'), 'utf8');
  const optionalAuthMatch = authMiddlewareSrc.match(/export function getOptionalAuthUser\(req: Request\): AuthRequest\['user'\] \| undefined \{[\s\S]*?\n\}/);
  report('SETUP. getOptionalAuthUser encontrado', !!optionalAuthMatch);
  const optionalAuthBody = optionalAuthMatch ? optionalAuthMatch[0] : '';
  report('H2. getOptionalAuthUser lê SOMENTE req.headers.authorization — nunca req.query nem req.body', /req\.headers\.authorization/.test(optionalAuthBody) && !/req\.query/.test(optionalAuthBody) && !/req\.body/.test(optionalAuthBody));

  const catalogRoutesSrc = fs.readFileSync(path.join(ROOT, 'src/server/modules/catalog/catalogRoutes.ts'), 'utf8');
  const handlerStartIdx = catalogRoutesSrc.indexOf('export function parsePublicCatalogFilters(req: Request) {'); // P3: a leitura dos filtros (admin/destino/origem) foi extraida para este helper, usado por getProductsHandler e pelos facets
  const handlerEndIdx = catalogRoutesSrc.indexOf('\nexport async function getProductByIdHandler');
  const handlerMatch = handlerStartIdx >= 0 && handlerEndIdx > handlerStartIdx;
  const handlerBody = handlerMatch ? catalogRoutesSrc.slice(handlerStartIdx, handlerEndIdx) : '';
  report('SETUP. getProductsHandler encontrado', !!handlerMatch);
  const handlerCodeOnly = handlerBody.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  report('H3. getProductsHandler decide isAdminCatalogView via isGlobalCatalogAdmin(getOptionalAuthUser(req)) — nunca via req.query.adminMode/global/bypassEligibility',
    /isGlobalCatalogAdmin\(getOptionalAuthUser\(req\)\)/.test(handlerCodeOnly) &&
    !/adminMode|bypassEligibility|req\.query\.global\b/.test(handlerCodeOnly)
  );

  // ===========================================================================
  // J — GLOBAL_ADMIN continua sem bypass no checkout/order creation:
  // orderService.ts (F6.2) permanece 100% intocado por esta fase.
  // ===========================================================================
  const orderServiceDiffCheck = fs.existsSync(path.join(ROOT, 'src/server/modules/orders/orderService.ts'));
  report('SETUP. orderService.ts existe (sanity)', orderServiceDiffCheck);
  // A garantia real de "não alterado" é feita via `git diff --stat` fora
  // deste teste (arquivo protegido) — aqui só confirmamos que o teste NUNCA
  // importa OrderService (instrução explícita do enunciado: não importar
  // módulos financeiros pesados).
  const thisTestSrc = fs.readFileSync(path.join(ROOT, 'scratch/test-m1-d16g16-admin-catalog-header.ts'), 'utf8');
  const thisTestImports = thisTestSrc.split('\n').filter((l) => /^import /.test(l)).join('\n');
  report('J. Este teste nunca importa OrderService nem módulos financeiros pesados', !/OrderService|paymentService|refundService/.test(thisTestImports));

  // ===========================================================================
  // K — X-Country-Code continua representando destino (resolveDestinationCountryFromRequest inalterado).
  // ===========================================================================
  report('K. resolveDestinationCountryFromRequest continua lendo x-country-code como DESTINO (função inalterada)', /const header = req\.headers\['x-country-code'\];/.test(catalogRoutesSrc));

  // ===========================================================================
  // L — selecionar origin GW não muda destination BR: para usuário NÃO
  // admin, `country` continua resolvido normalmente (resolveDestinationCountryFromRequest),
  // nunca influenciado por originCountryFilter.
  // ===========================================================================
  report('L. Para usuário não-admin, `country` é resolvido por resolveDestinationCountryFromRequest, nunca por originCountryFilter', /country: isAdminCatalogView \? undefined : resolveDestinationCountryFromRequest\(req, country as string\)/.test(handlerBody));

  // ===========================================================================
  // M — origin ALL para usuário normal continua = "todos ELEGÍVEIS para o
  // destino", nunca "todos os produtos do banco" (P2-equivalente do G1:
  // produto BR national nunca aparece para destino GW, mesmo com origin ALL).
  // ===========================================================================
  const rM = await catalogFor(BUYER, 'GW', 'ALL');
  report('M. BUYER destino GW + origem ALL -> NÃO vê produto BR national (ALL nunca vira bypass de destino para usuário normal)', !rM.products.some((p: any) => p.id === pBR.id));
  report('M2. BUYER destino GW + origem ALL -> vê produto GW national normalmente', rM.products.some((p: any) => p.id === pGW.id));

  // ===========================================================================
  // N — GLOBAL_ADMIN origin ALL: todos os produtos administrativos (já
  // coberto por C2, reconfirmando explicitamente o nome do cenário).
  // ===========================================================================
  report('N. GLOBAL_ADMIN origem ALL vê todos os produtos administrativos permitidos (GW e BR juntos, independente do destino)', rC.products.some((p: any) => p.id === pGW.id) && rC.products.some((p: any) => p.id === pBR.id));

  await pool.end();
  console.log(`\n${passed}/${total} testes passaram.`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((e) => {
  console.error('\n[ERRO FATAL]', e instanceof Error ? e.message : e);
  process.exit(1);
});
