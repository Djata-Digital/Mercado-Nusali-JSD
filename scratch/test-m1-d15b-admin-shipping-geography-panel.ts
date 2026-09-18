/**
 * FASE M1-D15-B — painel administrativo de rotas/tarifas sobre a fundação
 * D15-A (shipping_regions/sectors/routes/services/route_rates).
 *
 * Prova, via HTTP real (express + adminRouter + JWT, mesmo padrão de
 * test-m1-d13/d14/d15a) contra Postgres Docker isolado (chain completa de
 * migrations, incluindo 0024, NUNCA staging/produção):
 *
 *   - os endpoints D15-A reutilizados (regions/sectors/routes/routes/:id/
 *     rates) + o único endpoint novo desta fase (GET /shipping/services);
 *   - paginação real (nunca as 1.521 de uma vez);
 *   - filtros por setor/serviço/"sem tarifa";
 *   - validações de tarifa continuam sendo autoridade EXCLUSIVA do backend
 *     D15-A (overlap, peso, valor negativo) — este teste só prova que o
 *     painel admin CHAMA essas mesmas validações, nunca duplica a lógica;
 *   - desativar rota/tarifa nunca apaga fisicamente;
 *   - seller e buyer NUNCA acessam os endpoints /admin/shipping/*;
 *   - nenhuma tabela financeira e nenhum shipping legado é tocado.
 *
 * NÃO integra ao checkout, NÃO cria pedido/pagamento/escrow/wallet/refund,
 * NÃO altera shipping_rates/shipping_zones/store_shipping_policies.
 */
import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';

const testDbUrl = assertLedgerTestDatabaseGuard();
process.env.DATABASE_URL = testDbUrl;

import 'dotenv/config';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and, sql } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import {
  users, countries, shippingRegions, shippingSectors, shippingRoutes, shippingServices, shippingRouteRates,
  shippingRates, shippingZones, storeShippingPolicies,
  orders, payments, escrowAccounts, wallets, walletTransactions, refunds, disputes,
} from '../src/db/schema.js';
import { getJwtAccessSecret } from '../src/server/modules/auth/jwtConfig.js';
import { adminRouter } from '../src/server/adminRoutes.js';
import { seedGuineaBissauShippingGeography, toShippingCode } from '../src/server/modules/shipping/shippingGeographyService.js';

const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false } });
const db = drizzle(pool, { schema });

let passed = 0, total = 0;
function report(label: string, ok: boolean, detail?: any) {
  total++; if (ok) passed++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${detail !== undefined ? ' -> ' + JSON.stringify(detail) : ''}`);
}
let seq = 0;
const uid = (p: string) => `${p}_m1d15b_${Date.now()}_${++seq}_${Math.random().toString(36).slice(2, 6)}`;

function signToken(user: { id: string; role: string; fullName: string }) {
  return jwt.sign(
    { userId: user.id, email: `${user.id}@t.test`, role: user.role, fullName: user.fullName, countryCode: 'GW', kycStatus: 'unverified', isEmailVerified: true },
    getJwtAccessSecret(),
    { expiresIn: '1h' }
  );
}
function buildServer() {
  const app = express();
  app.use(express.json());
  app.use('/admin', adminRouter);
  return http.createServer(app);
}
async function startServer(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  return `http://127.0.0.1:${address.port}`;
}
async function api(baseUrl: string, token: string | null, method: string, path: string, body?: any) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

async function main() {
  await db.insert(countries).values([
    { id: 'GW', code: 'GW', name: 'Guiné-Bissau', flag: '🇬🇼', currency: 'XOF', currencySymbol: 'CFA', phonePrefix: '+245', isActive: true, createdAt: new Date() },
  ]).onConflictDoNothing();

  // "Sujeira" de referência do sistema legado + tabelas financeiras — para
  // provar depois que o painel admin D15-B nunca as toca (itens 20-21).
  const legacyZoneId = uid('zone');
  await db.insert(shippingZones).values({ id: legacyZoneId, countryCode: 'GW', name: 'Zona Legada D15B', isActive: true, createdAt: new Date(), updatedAt: new Date() } as any);
  const legacyRateId = uid('legacyrate');
  await db.insert(shippingRates).values({
    id: legacyRateId, zoneId: legacyZoneId, originCountry: 'GW', destinationCountry: 'GW',
    minWeightKg: '0', maxWeightKg: '10', price: '999.00', currency: 'XOF', isActive: true, createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const [legacyBefore] = await Promise.all([db.select().from(shippingRates).where(eq(shippingRates.id, legacyRateId)).limit(1)]);
  const [zonesCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(shippingZones);
  const [policiesCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(storeShippingPolicies);
  const [ordersCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(orders);
  const [paymentsCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(payments);
  const [escrowCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(escrowAccounts);
  const [walletTxCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(walletTransactions);
  const [refundsCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(refunds);
  const [disputesCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(disputes);

  // Fundação D15-A (real, mesma função — nunca SQL manual paralelo).
  await seedGuineaBissauShippingGeography(db);

  const adminUserId = uid('usr_admin');
  await db.insert(users).values({
    id: adminUserId, email: `${adminUserId}@t.test`, passwordHash: 'x', fullName: 'Admin D15B',
    phone: '', role: 'ADMIN', countryCode: 'GW', kycStatus: 'verified', riskScore: 'baixo',
    isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const adminToken = signToken({ id: adminUserId, role: 'ADMIN', fullName: 'Admin D15B' });

  const sellerUserId = uid('usr_seller');
  await db.insert(users).values({
    id: sellerUserId, email: `${sellerUserId}@t.test`, passwordHash: 'x', fullName: 'Seller D15B',
    phone: '', role: 'SELLER', countryCode: 'GW', kycStatus: 'verified', riskScore: 'baixo',
    isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const sellerToken = signToken({ id: sellerUserId, role: 'SELLER', fullName: 'Seller D15B' });

  const buyerUserId = uid('usr_buyer');
  await db.insert(users).values({
    id: buyerUserId, email: `${buyerUserId}@t.test`, passwordHash: 'x', fullName: 'Buyer D15B',
    phone: '', role: 'BUYER', countryCode: 'GW', kycStatus: 'verified', riskScore: 'baixo',
    isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const buyerToken = signToken({ id: buyerUserId, role: 'BUYER', fullName: 'Buyer D15B' });

  const server = buildServer();
  const baseUrl = await startServer(server);

  try {
    // =========================================================================
    // 1-3. Admin carrega GW: regiões e setores
    // =========================================================================
    const regionsRes = await api(baseUrl, adminToken, 'GET', '/admin/shipping/regions?country=GW');
    report('1. Admin carrega GW -> 200', regionsRes.status === 200);
    report('2. Recebe 9 regiões', (regionsRes.body.data as any[]).length === 9, (regionsRes.body.data as any[]).length);

    const sectorsRes = await api(baseUrl, adminToken, 'GET', '/admin/shipping/sectors?country=GW');
    report('3. Recebe 39 setores', (sectorsRes.body.data as any[]).length === 39, (sectorsRes.body.data as any[]).length);

    const servicesRes = await api(baseUrl, adminToken, 'GET', '/admin/shipping/services?country=GW');
    report('Endpoint novo GET /admin/shipping/services retorna STANDARD/ECONOMY/EXPRESS', (servicesRes.body.data as any[]).map((s: any) => s.code).sort().join(',') === 'ECONOMY,EXPRESS,STANDARD');
    const standardService = (servicesRes.body.data as any[]).find((s: any) => s.code === 'STANDARD');

    // =========================================================================
    // 4-5. Rotas paginadas, total = 1521
    // =========================================================================
    const page1 = await api(baseUrl, adminToken, 'GET', '/admin/shipping/routes?country=GW&limit=20&page=1');
    report('4. Rotas são paginadas (nunca 1.521 de uma vez)', (page1.body.data as any[]).length <= 20);
    report('5. pagination.total = 1521', page1.body.pagination?.total === 1521, page1.body.pagination);

    // =========================================================================
    // 6-8. Filtros por setor de origem/destino + Bissau->Gabú aparece
    // =========================================================================
    const bissauCode = toShippingCode('Bissau');
    const gabuCode = toShippingCode('Gabú');
    const [bissauSector] = await db.select().from(shippingSectors).where(and(eq(shippingSectors.countryCode, 'GW'), eq(shippingSectors.code, bissauCode))).limit(1);
    const [gabuSector] = await db.select().from(shippingSectors).where(and(eq(shippingSectors.countryCode, 'GW'), eq(shippingSectors.code, gabuCode))).limit(1);

    const filterOrigin = await api(baseUrl, adminToken, 'GET', `/admin/shipping/routes?country=GW&originSector=${bissauSector.id}&limit=50`);
    report('6. Filtro Bissau origem funciona (39 rotas, uma por destino)', filterOrigin.body.pagination?.total === 39, filterOrigin.body.pagination);

    const filterDestination = await api(baseUrl, adminToken, 'GET', `/admin/shipping/routes?country=GW&destinationSector=${gabuSector.id}&limit=50`);
    report('7. Filtro Gabú destino funciona (39 rotas, uma por origem)', filterDestination.body.pagination?.total === 39, filterDestination.body.pagination);

    const bissauToGabuRow = (filterOrigin.body.data as any[]).find((r: any) => r.destinationSectorId === gabuSector.id);
    report('8. Bissau -> Gabú aparece na listagem, com nomes de setor resolvidos', !!bissauToGabuRow && bissauToGabuRow.originSectorName === 'Bissau' && bissauToGabuRow.destinationSectorName === 'Gabú', bissauToGabuRow);
    const routeId = bissauToGabuRow.id;

    // =========================================================================
    // 9. Inicialmente sem tarifa
    // =========================================================================
    report('9. Rota inicialmente sem tarifa configurada (configuredServiceCodes vazio)', (bissauToGabuRow.configuredServiceCodes || []).length === 0, bissauToGabuRow.configuredServiceCodes);
    const detailBefore = await api(baseUrl, adminToken, 'GET', `/admin/shipping/routes/${routeId}`);
    report('Detalhe da rota devolve os 3 serviços do país (mesmo sem tarifa)', (detailBefore.body.data.services as any[]).length === 3);
    report('Detalhe da rota devolve rates=[] inicialmente', (detailBefore.body.data.rates as any[]).length === 0);

    // =========================================================================
    // 10-11. Criar tarifa de teste (Docker isolado) + aparece na rota
    // =========================================================================
    const createRate = await api(baseUrl, adminToken, 'POST', '/admin/shipping/rates', {
      routeId, serviceId: standardService.id, minWeightKg: 0, maxWeightKg: 1, amount: 1500, currency: 'XOF',
    });
    report('10. Tarifa de teste criada em Docker isolado -> 201', createRate.status === 201, createRate.body);
    const rateId = createRate.body?.data?.id;

    const listAfterRate = await api(baseUrl, adminToken, 'GET', `/admin/shipping/routes?country=GW&originSector=${bissauSector.id}&destinationSector=${gabuSector.id}`);
    const rowAfterRate = (listAfterRate.body.data as any[])[0];
    report('11. Tarifa aparece na listagem de rotas (configuredServiceCodes inclui STANDARD)', (rowAfterRate.configuredServiceCodes || []).includes('STANDARD'), rowAfterRate.configuredServiceCodes);

    const detailAfterRate = await api(baseUrl, adminToken, 'GET', `/admin/shipping/routes/${routeId}`);
    const rateInDetail = (detailAfterRate.body.data.rates as any[])[0];
    report('11b. Tarifa aparece no detalhe da rota com serviceCode resolvido', rateInDetail && rateInDetail.serviceCode === 'STANDARD', rateInDetail);

    // =========================================================================
    // 12-14. Validações — autoridade do backend D15-A, painel só repassa
    // =========================================================================
    const overlap = await api(baseUrl, adminToken, 'POST', '/admin/shipping/rates', {
      routeId, serviceId: standardService.id, minWeightKg: 0.5, maxWeightKg: 2, amount: 999, currency: 'XOF',
    });
    report('12. Overlap rejeitado pelo painel (repassa o erro do backend D15-A)', overlap.status === 400 && /RATE_OVERLAP/.test(overlap.body?.error?.message || ''), overlap.body);

    const negativeAmount = await api(baseUrl, adminToken, 'POST', '/admin/shipping/rates', {
      routeId, serviceId: standardService.id, minWeightKg: 3, maxWeightKg: 5, amount: -50, currency: 'XOF',
    });
    report('13. Valor negativo rejeitado', negativeAmount.status === 400 && /AMOUNT_INVALID/.test(negativeAmount.body?.error?.message || ''), negativeAmount.body);

    const badRange = await api(baseUrl, adminToken, 'POST', '/admin/shipping/rates', {
      routeId, serviceId: standardService.id, minWeightKg: 5, maxWeightKg: 5, amount: 100, currency: 'XOF',
    });
    report('14. maxWeight <= minWeight rejeitado', badRange.status === 400 && /MAX_WEIGHT_INVALID/.test(badRange.body?.error?.message || ''), badRange.body);

    // =========================================================================
    // 15-16. Desativar/reativar rota preserva a linha
    // =========================================================================
    const deactivateRoute = await api(baseUrl, adminToken, 'PATCH', `/admin/shipping/routes/${routeId}`, { isActive: false });
    report('15a. PATCH desativar rota -> 200', deactivateRoute.status === 200);
    const [routeRowInactive] = await db.select().from(shippingRoutes).where(eq(shippingRoutes.id, routeId)).limit(1);
    report('15b. Rota continua existindo na tabela, isActive=false', !!routeRowInactive && routeRowInactive.isActive === false);
    const rateStillThere = await db.select().from(shippingRouteRates).where(eq(shippingRouteRates.id, rateId)).limit(1);
    report('15c. Tarifa da rota desativada continua existindo', rateStillThere.length === 1);

    const reactivateRoute = await api(baseUrl, adminToken, 'PATCH', `/admin/shipping/routes/${routeId}`, { isActive: true });
    report('16. Reativar rota funciona -> 200, isActive=true', reactivateRoute.status === 200 && reactivateRoute.body.data.isActive === true, reactivateRoute.body.data);

    // =========================================================================
    // 17. Desativar tarifa preserva a linha
    // =========================================================================
    const deactivateRate = await api(baseUrl, adminToken, 'PATCH', `/admin/shipping/rates/${rateId}`, { isActive: false });
    report('17a. PATCH desativar tarifa -> 200', deactivateRate.status === 200);
    const [rateRowInactive] = await db.select().from(shippingRouteRates).where(eq(shippingRouteRates.id, rateId)).limit(1);
    report('17b. Tarifa continua existindo na tabela, isActive=false', !!rateRowInactive && rateRowInactive.isActive === false);

    // =========================================================================
    // 18-19. Seller e Buyer NUNCA acessam /admin/shipping/*
    // =========================================================================
    const sellerTryRegions = await api(baseUrl, sellerToken, 'GET', '/admin/shipping/regions?country=GW');
    report('18. Seller NÃO acessa GET /admin/shipping/regions (401/403)', sellerTryRegions.status === 401 || sellerTryRegions.status === 403, sellerTryRegions.status);
    const sellerTryCreateRate = await api(baseUrl, sellerToken, 'POST', '/admin/shipping/rates', { routeId, serviceId: standardService.id, minWeightKg: 0, maxWeightKg: 1, amount: 10, currency: 'XOF' });
    report('18b. Seller NÃO consegue criar tarifa (401/403)', sellerTryCreateRate.status === 401 || sellerTryCreateRate.status === 403, sellerTryCreateRate.status);

    const buyerTryRegions = await api(baseUrl, buyerToken, 'GET', '/admin/shipping/regions?country=GW');
    report('19. Buyer NÃO acessa GET /admin/shipping/regions (401/403)', buyerTryRegions.status === 401 || buyerTryRegions.status === 403, buyerTryRegions.status);
    const buyerTryRoutes = await api(baseUrl, buyerToken, 'GET', '/admin/shipping/routes?country=GW');
    report('19b. Buyer NÃO acessa GET /admin/shipping/routes (401/403)', buyerTryRoutes.status === 401 || buyerTryRoutes.status === 403, buyerTryRoutes.status);
    const noTokenTry = await api(baseUrl, null, 'GET', '/admin/shipping/regions?country=GW');
    report('19c. Sem token nenhum -> 401', noTokenTry.status === 401, noTokenTry.status);
  } finally {
    server.close();
  }

  // =========================================================================
  // 20. Nenhuma tabela financeira mudou
  // =========================================================================
  const [ordersCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(orders);
  const [paymentsCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(payments);
  const [escrowCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(escrowAccounts);
  const [walletTxCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(walletTransactions);
  const [refundsCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(refunds);
  const [disputesCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(disputes);
  report('20. Nenhuma tabela financeira mudou (orders/payments/escrow/wallet_tx/refunds/disputes)',
    ordersCountAfter.c === ordersCountBefore.c && paymentsCountAfter.c === paymentsCountBefore.c &&
    escrowCountAfter.c === escrowCountBefore.c && walletTxCountAfter.c === walletTxCountBefore.c &&
    refundsCountAfter.c === refundsCountBefore.c && disputesCountAfter.c === disputesCountBefore.c);

  // =========================================================================
  // 21. Shipping legado não muda
  // =========================================================================
  const [legacyAfter] = await db.select().from(shippingRates).where(eq(shippingRates.id, legacyRateId)).limit(1);
  const [zonesCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(shippingZones);
  const [policiesCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(storeShippingPolicies);
  report('21. shipping_rates/shipping_zones/store_shipping_policies legados inalterados',
    JSON.stringify(legacyBefore[0]) === JSON.stringify(legacyAfter) && zonesCountBefore.c === zonesCountAfter.c && policiesCountBefore.c === policiesCountAfter.c);

  await pool.end();

  console.log(`\n${passed}/${total} testes passaram.`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((e) => {
  console.error('\n[ERRO FATAL]', e instanceof Error ? e.message : e);
  process.exit(1);
});
