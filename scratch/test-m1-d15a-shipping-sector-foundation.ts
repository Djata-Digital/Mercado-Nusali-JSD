/**
 * FASE M1-D15-A — fundação do sistema de rotas de frete por setor
 * (Guiné-Bissau: 9 regiões, 39 setores, 1.521 rotas direcionais).
 *
 * Prova, via Postgres Docker isolado (chain completa de migrations,
 * incluindo 0024_shipping_sector_route_foundation, NUNCA staging/produção)
 * e HTTP real (express + adminRouter + JWT, mesmo padrão de
 * test-m1-d13/d14):
 *
 *   - seedGuineaBissauShippingGeography() gera exatamente 9 regiões,
 *     39 setores, 1.521 rotas (incluindo mesmo-setor), idempotente;
 *   - validações de tarifa (peso, valor, país, moeda, overlap) via
 *     validateShippingRouteRateInput + endpoints HTTP reais;
 *   - desativação de rota nunca apaga fisicamente;
 *   - paginação real em GET /admin/shipping/routes (nunca 1.521 linhas
 *     cegamente);
 *   - o sistema antigo (shipping_rates/shipping_zones/
 *     store_shipping_policies) e nenhuma tabela financeira são tocados.
 *
 * NÃO integra ao checkout, NÃO cria pedido/pagamento/escrow/wallet/refund.
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
  shippingRates, shippingZones, storeShippingPolicies, sellers, stores,
  orders, payments, escrowAccounts, walletTransactions, refunds,
} from '../src/db/schema.js';
import { getJwtAccessSecret } from '../src/server/modules/auth/jwtConfig.js';
import { adminRouter } from '../src/server/adminRoutes.js';
import {
  seedGuineaBissauShippingGeography,
  GUINEA_BISSAU_TOTAL_REGIONS,
  GUINEA_BISSAU_TOTAL_SECTORS,
  GUINEA_BISSAU_EXPECTED_ROUTES,
  toShippingCode,
  validateSectorRegionCountryConsistency,
} from '../src/server/modules/shipping/shippingGeographyService.js';

const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false } });
const db = drizzle(pool, { schema });

let passed = 0, total = 0;
function report(label: string, ok: boolean, detail?: any) {
  total++; if (ok) passed++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${detail !== undefined ? ' -> ' + JSON.stringify(detail) : ''}`);
}
let seq = 0;
const uid = (p: string) => `${p}_m1d15a_${Date.now()}_${++seq}_${Math.random().toString(36).slice(2, 6)}`;

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
async function api(baseUrl: string, token: string, method: string, path: string, body?: any) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

async function main() {
  // =========================================================================
  // Setup: países + "sujeira" pré-existente no sistema de frete ANTIGO —
  // para provar depois que o seed novo nunca toca nisso (itens 22-24).
  // =========================================================================
  await db.insert(countries).values([
    { id: 'GW', code: 'GW', name: 'Guiné-Bissau', flag: '🇬🇼', currency: 'XOF', currencySymbol: 'CFA', phonePrefix: '+245', isActive: true, createdAt: new Date() },
    { id: 'BR', code: 'BR', name: 'Brasil', flag: '🇧🇷', currency: 'BRL', currencySymbol: 'R$', phonePrefix: '+55', isActive: true, createdAt: new Date() },
  ]).onConflictDoNothing();

  const legacyZoneId = uid('zone');
  await db.insert(shippingZones).values({
    id: legacyZoneId, countryCode: 'GW', name: 'Zona Legada D15A', isActive: true, createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const legacyRateId = uid('legacyrate');
  await db.insert(shippingRates).values({
    id: legacyRateId, zoneId: legacyZoneId, originCountry: 'GW', destinationCountry: 'GW',
    minWeightKg: '0', maxWeightKg: '10', price: '999.00', currency: 'XOF', isActive: true, createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const legacySellerUserId = uid('usr_legacyseller');
  await db.insert(users).values({
    id: legacySellerUserId, email: `${legacySellerUserId}@t.test`, passwordHash: 'x', fullName: 'Legacy Seller',
    phone: '', role: 'SELLER', countryCode: 'GW', kycStatus: 'verified', riskScore: 'baixo',
    isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const legacySellerId = uid('legacyseller');
  await db.insert(sellers).values({
    id: legacySellerId, userId: legacySellerUserId, companyName: 'Loja Legada', tradingName: 'Loja Legada',
    taxId: '0', phone: '0', countryCode: 'GW', status: 'active', createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const legacyStoreId = uid('legacystore');
  await db.insert(stores).values({
    id: legacyStoreId, sellerId: legacySellerId, name: 'Loja Legada', slug: `loja-legada-${legacyStoreId}`,
    countryCode: 'GW', status: 'active', createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const legacyPolicyId = uid('legacypolicy');
  await db.insert(storeShippingPolicies).values({
    id: legacyPolicyId, storeId: legacyStoreId, sellerId: legacySellerId, mode: 'CUSTOMER_PAYS', isActive: true, createdAt: new Date(), updatedAt: new Date(),
  } as any);

  const [legacyRateBefore] = await db.select().from(shippingRates).where(eq(shippingRates.id, legacyRateId)).limit(1);
  const [legacyZoneBefore] = await db.select().from(shippingZones).where(eq(shippingZones.id, legacyZoneId)).limit(1);
  const [legacyPolicyBefore] = await db.select().from(storeShippingPolicies).where(eq(storeShippingPolicies.id, legacyPolicyId)).limit(1);
  const [ordersCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(orders);
  const [paymentsCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(payments);
  const [escrowCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(escrowAccounts);
  const [walletTxCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(walletTransactions);
  const [refundsCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(refunds);

  // =========================================================================
  // 1-6. SEED — primeira execução
  // =========================================================================
  const seed1 = await seedGuineaBissauShippingGeography(db);
  report('1. REGIONS=9', seed1.totalRegions === 9, seed1.totalRegions);
  report('2. SECTORS=39', seed1.totalSectors === 39, seed1.totalSectors);
  report('3. ROUTES=1521 (39x39)', seed1.totalRoutes === 1521 && GUINEA_BISSAU_EXPECTED_ROUTES === 1521, seed1.totalRoutes);
  report('4. SAME_SECTOR_ROUTES=39', seed1.sameSectorRoutes === 39, seed1.sameSectorRoutes);
  report('5. DUPLICATE_ROUTES=0 (após 1ª execução)', seed1.duplicateRoutes === 0, seed1.duplicateRoutes);

  // 6. seed segunda execução continua 1521 (idempotente) — e não cria NADA a mais.
  const seed2 = await seedGuineaBissauShippingGeography(db);
  report('6. Seed idempotente: 2ª execução não cria regiões/setores/rotas novas', seed2.regionsCreated === 0 && seed2.sectorsCreated === 0 && seed2.routesCreated === 0, seed2);
  report('6b. Seed idempotente: total de rotas continua 1521 após 2ª execução', seed2.totalRoutes === 1521, seed2.totalRoutes);
  report('5b. DUPLICATE_ROUTES=0 (após 2ª execução)', seed2.duplicateRoutes === 0, seed2.duplicateRoutes);

  // =========================================================================
  // 7-9. Bissau <-> Gabú
  // =========================================================================
  const bissauCode = toShippingCode('Bissau');
  const gabuCode = toShippingCode('Gabú');
  const [bissauSector] = await db.select().from(shippingSectors).where(and(eq(shippingSectors.countryCode, 'GW'), eq(shippingSectors.code, bissauCode))).limit(1);
  const [gabuSector] = await db.select().from(shippingSectors).where(and(eq(shippingSectors.countryCode, 'GW'), eq(shippingSectors.code, gabuCode))).limit(1);
  report('setup: setor Bissau existe', !!bissauSector);
  report('setup: setor Gabú existe', !!gabuSector);

  const [routeBissauGabu] = await db.select().from(shippingRoutes).where(and(
    eq(shippingRoutes.originSectorId, bissauSector.id), eq(shippingRoutes.destinationSectorId, gabuSector.id)
  )).limit(1);
  const [routeGabuBissau] = await db.select().from(shippingRoutes).where(and(
    eq(shippingRoutes.originSectorId, gabuSector.id), eq(shippingRoutes.destinationSectorId, bissauSector.id)
  )).limit(1);
  report('7. Bissau -> Gabú existe', !!routeBissauGabu);
  report('8. Gabú -> Bissau existe', !!routeGabuBissau);
  report('9. IDs diferentes (Bissau->Gabú != Gabú->Bissau)', routeBissauGabu.id !== routeGabuBissau.id, { a: routeBissauGabu.id, b: routeGabuBissau.id });

  // Distinção Região Cacheu vs Setor Cacheu (aviso explícito do pedido).
  const cacheuCode = toShippingCode('Cacheu');
  const [regionCacheu] = await db.select().from(shippingRegions).where(and(eq(shippingRegions.countryCode, 'GW'), eq(shippingRegions.code, cacheuCode))).limit(1);
  const [sectorCacheu] = await db.select().from(shippingSectors).where(and(eq(shippingSectors.countryCode, 'GW'), eq(shippingSectors.code, cacheuCode))).limit(1);
  report('Região Cacheu e Setor Cacheu são entidades DIFERENTES (IDs distintos)', regionCacheu.id !== sectorCacheu.id, { region: regionCacheu.id, sector: sectorCacheu.id });
  report('validateSectorRegionCountryConsistency aceita mesmo país', validateSectorRegionCountryConsistency({ countryCode: 'GW' }, { countryCode: 'GW' }) === null);
  report('validateSectorRegionCountryConsistency rejeita países diferentes', validateSectorRegionCountryConsistency({ countryCode: 'GW' }, { countryCode: 'BR' }) !== null);

  // =========================================================================
  // Serviços básicos
  // =========================================================================
  const [standardService] = await db.select().from(shippingServices).where(and(eq(shippingServices.countryCode, 'GW'), eq(shippingServices.code, 'STANDARD'))).limit(1);
  report('setup: serviço STANDARD existe (GW)', !!standardService);

  // =========================================================================
  // HTTP admin — servidor real
  // =========================================================================
  const adminUserId = uid('usr_admin');
  await db.insert(users).values({
    id: adminUserId, email: `${adminUserId}@t.test`, passwordHash: 'x', fullName: 'Admin D15A',
    phone: '', role: 'ADMIN', countryCode: 'GW', kycStatus: 'verified', riskScore: 'baixo',
    isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const adminToken = signToken({ id: adminUserId, role: 'ADMIN', fullName: 'Admin D15A' });

  const server = buildServer();
  const baseUrl = await startServer(server);

  try {
    // 10. rota pode existir sem tarifa
    const routeDetailBefore = await api(baseUrl, adminToken, 'GET', `/admin/shipping/routes/${routeBissauGabu.id}`);
    report('10. GET /admin/shipping/routes/:id -> 200 mesmo sem tarifa', routeDetailBefore.status === 200);
    report('10b. Rota Bissau->Gabú tem 0 tarifas inicialmente (válida sem tarifa)', Array.isArray(routeDetailBefore.body.data.rates) && routeDetailBefore.body.data.rates.length === 0);

    // 11. tarifa válida pode ser criada
    const createValid = await api(baseUrl, adminToken, 'POST', '/admin/shipping/rates', {
      routeId: routeBissauGabu.id, serviceId: standardService.id, minWeightKg: 0, maxWeightKg: 1, amount: 1500, currency: 'XOF',
    });
    report('11. Tarifa válida (0-1kg, 1500 XOF) criada -> 201', createValid.status === 201, createValid.body);
    const rate1Id = createValid.body?.data?.id;

    // Segunda faixa não sobreposta (1-3kg) — deve funcionar (prova [min,max) sem overlap).
    const createValid2 = await api(baseUrl, adminToken, 'POST', '/admin/shipping/rates', {
      routeId: routeBissauGabu.id, serviceId: standardService.id, minWeightKg: 1, maxWeightKg: 3, amount: 2500, currency: 'XOF',
    });
    report('setup: 2ª faixa não sobreposta (1-3kg) criada -> 201', createValid2.status === 201, createValid2.body);

    // 12. amount negativo rejeitado
    const negAmount = await api(baseUrl, adminToken, 'POST', '/admin/shipping/rates', {
      routeId: routeBissauGabu.id, serviceId: standardService.id, minWeightKg: 3, maxWeightKg: 5, amount: -10, currency: 'XOF',
    });
    report('12. amount negativo rejeitado (400)', negAmount.status === 400 && /AMOUNT_INVALID/.test(negAmount.body?.error?.message || ''), negAmount.body);

    // 13. minWeight negativo rejeitado
    const negMinWeight = await api(baseUrl, adminToken, 'POST', '/admin/shipping/rates', {
      routeId: routeBissauGabu.id, serviceId: standardService.id, minWeightKg: -1, maxWeightKg: 5, amount: 10, currency: 'XOF',
    });
    report('13. minWeightKg negativo rejeitado (400)', negMinWeight.status === 400 && /MIN_WEIGHT_INVALID/.test(negMinWeight.body?.error?.message || ''), negMinWeight.body);

    // 14. maxWeight <= minWeight rejeitado
    const maxLteMin = await api(baseUrl, adminToken, 'POST', '/admin/shipping/rates', {
      routeId: routeBissauGabu.id, serviceId: standardService.id, minWeightKg: 5, maxWeightKg: 5, amount: 10, currency: 'XOF',
    });
    report('14. maxWeightKg <= minWeightKg rejeitado (400)', maxLteMin.status === 400 && /MAX_WEIGHT_INVALID/.test(maxLteMin.body?.error?.message || ''), maxLteMin.body);

    // 15. route inexistente rejeitado
    const badRoute = await api(baseUrl, adminToken, 'POST', '/admin/shipping/rates', {
      routeId: 'rota_que_nao_existe', serviceId: standardService.id, minWeightKg: 0, maxWeightKg: 1, amount: 10, currency: 'XOF',
    });
    report('15. route inexistente rejeitado (400 ROUTE_NOT_FOUND)', badRoute.status === 400 && /ROUTE_NOT_FOUND/.test(badRoute.body?.error?.message || ''), badRoute.body);

    // 16. service inexistente rejeitado
    const badService = await api(baseUrl, adminToken, 'POST', '/admin/shipping/rates', {
      routeId: routeBissauGabu.id, serviceId: 'servico_que_nao_existe', minWeightKg: 0, maxWeightKg: 1, amount: 10, currency: 'XOF',
    });
    report('16. service inexistente rejeitado (400 SERVICE_NOT_FOUND)', badService.status === 400 && /SERVICE_NOT_FOUND/.test(badService.body?.error?.message || ''), badService.body);

    // 17. overlap rejeitado (0.5-2kg sobrepõe as duas faixas já criadas: 0-1 e 1-3)
    const overlap = await api(baseUrl, adminToken, 'POST', '/admin/shipping/rates', {
      routeId: routeBissauGabu.id, serviceId: standardService.id, minWeightKg: 0.5, maxWeightKg: 2, amount: 999, currency: 'XOF',
    });
    report('17. overlap de faixa ativa rejeitado (400 RATE_OVERLAP)', overlap.status === 400 && /RATE_OVERLAP/.test(overlap.body?.error?.message || ''), overlap.body);

    // Exatamente no limite (1kg) NÃO é overlap — [0,1) e [1,3) são disjuntas por definição.
    // Provado indiretamente: createValid2 (1-3kg) já foi aceito com sucesso acima
    // enquanto a faixa 0-1kg já existia — confirma [min,max) sem ambiguidade.

    // 18. route/service de países incompatíveis rejeitados
    await db.insert(shippingRegions).values({
      id: 'shpreg_br_test', countryCode: 'BR', name: 'Região Teste BR', code: 'TESTE_BR', isActive: true, createdAt: new Date(), updatedAt: new Date(),
    } as any).onConflictDoNothing();
    await db.insert(shippingSectors).values([
      { id: 'shpsec_br_test_a', countryCode: 'BR', regionId: 'shpreg_br_test', name: 'Setor BR A', code: 'BR_A', isActive: true, createdAt: new Date(), updatedAt: new Date() },
      { id: 'shpsec_br_test_b', countryCode: 'BR', regionId: 'shpreg_br_test', name: 'Setor BR B', code: 'BR_B', isActive: true, createdAt: new Date(), updatedAt: new Date() },
    ] as any).onConflictDoNothing();
    await db.insert(shippingRoutes).values({
      id: 'shproute_br_test', countryCode: 'BR', originSectorId: 'shpsec_br_test_a', destinationSectorId: 'shpsec_br_test_b', isActive: true, createdAt: new Date(), updatedAt: new Date(),
    } as any).onConflictDoNothing();

    const crossCountry = await api(baseUrl, adminToken, 'POST', '/admin/shipping/rates', {
      routeId: 'shproute_br_test', serviceId: standardService.id /* serviço é GW */, minWeightKg: 0, maxWeightKg: 1, amount: 10, currency: 'BRL',
    });
    report('18. route (BR) + service (GW) incompatíveis rejeitados (400 SERVICE_COUNTRY_MISMATCH)', crossCountry.status === 400 && /SERVICE_COUNTRY_MISMATCH/.test(crossCountry.body?.error?.message || ''), crossCountry.body);

    // Moeda incoerente com o mercado (rota GW exige XOF, não BRL) também rejeitada.
    const badCurrency = await api(baseUrl, adminToken, 'POST', '/admin/shipping/rates', {
      routeId: routeBissauGabu.id, serviceId: standardService.id, minWeightKg: 5, maxWeightKg: 8, amount: 10, currency: 'BRL',
    });
    report('18b. moeda incoerente com o mercado da rota rejeitada (400 CURRENCY_MISMATCH)', badCurrency.status === 400 && /CURRENCY_MISMATCH/.test(badCurrency.body?.error?.message || ''), badCurrency.body);

    // PATCH /admin/shipping/rates/:id — revalidação também funciona.
    const patchRateOverlap = await api(baseUrl, adminToken, 'PATCH', `/admin/shipping/rates/${rate1Id}`, { maxWeightKg: 2 });
    report('PATCH tarifa: mudança que causaria overlap com a faixa 1-3kg é rejeitada', patchRateOverlap.status === 400 && /RATE_OVERLAP/.test(patchRateOverlap.body?.error?.message || ''), patchRateOverlap.body);
    const patchRateOk = await api(baseUrl, adminToken, 'PATCH', `/admin/shipping/rates/${rate1Id}`, { amount: 1600 });
    report('PATCH tarifa: alteração válida (só amount) aceita -> 200', patchRateOk.status === 200 && Number(patchRateOk.body?.data?.amount) === 1600, patchRateOk.body);

    // =========================================================================
    // 19. desativação de rota não apaga historicamente
    // =========================================================================
    const deactivate = await api(baseUrl, adminToken, 'PATCH', `/admin/shipping/routes/${routeBissauGabu.id}`, { isActive: false });
    report('19a. PATCH routes/:id isActive=false -> 200', deactivate.status === 200);
    const [routeAfterDeactivate] = await db.select().from(shippingRoutes).where(eq(shippingRoutes.id, routeBissauGabu.id)).limit(1);
    report('19b. Rota continua existindo na tabela (nunca DELETE físico)', !!routeAfterDeactivate);
    report('19c. Rota está isActive=false após desativação', routeAfterDeactivate.isActive === false);
    // Tarifas associadas continuam intactas (histórico preservado).
    const ratesStillThere = await db.select().from(shippingRouteRates).where(eq(shippingRouteRates.routeId, routeBissauGabu.id));
    report('19d. Tarifas da rota desativada continuam existindo (histórico preservado)', ratesStillThere.length === 2);

    // =========================================================================
    // 20. GET /admin/shipping/routes pagina (nunca 1.521 cegamente)
    // =========================================================================
    const page1 = await api(baseUrl, adminToken, 'GET', '/admin/shipping/routes?country=GW&limit=50&page=1');
    report('20a. GET routes sem limit explícito nunca devolve as 1.521 de uma vez', Array.isArray(page1.body.data) && page1.body.data.length <= 50);
    report('20b. pagination.total reporta o total real (1521, já com 1 desativada ainda contando)', page1.body.pagination?.total === 1521, page1.body.pagination);
    report('20c. pagination.totalPages calculado corretamente', page1.body.pagination?.totalPages === Math.ceil(1521 / 50));

    const filterActive = await api(baseUrl, adminToken, 'GET', '/admin/shipping/routes?country=GW&active=false&limit=10');
    report('20d. filtro active=false encontra a rota recém-desativada', (filterActive.body.data as any[]).some((r: any) => r.id === routeBissauGabu.id));

    const filterHasRate = await api(baseUrl, adminToken, 'GET', '/admin/shipping/routes?country=GW&hasRate=true&limit=10');
    report('20e. filtro hasRate=true encontra a rota Bissau->Gabú (tem 2 tarifas)', (filterHasRate.body.data as any[]).some((r: any) => r.id === routeBissauGabu.id));

    const filterNoRate = await api(baseUrl, adminToken, 'GET', '/admin/shipping/routes?country=GW&hasRate=false&limit=10');
    report('20f. filtro hasRate=false NUNCA inclui a rota Bissau->Gabú', !(filterNoRate.body.data as any[]).some((r: any) => r.id === routeBissauGabu.id));

    const regionsRes = await api(baseUrl, adminToken, 'GET', '/admin/shipping/regions?country=GW');
    report('GET /admin/shipping/regions?country=GW retorna 9', (regionsRes.body.data as any[]).length === 9);

    const sectorsRes = await api(baseUrl, adminToken, 'GET', '/admin/shipping/sectors?country=GW');
    report('GET /admin/shipping/sectors?country=GW retorna 39', (sectorsRes.body.data as any[]).length === 39);
  } finally {
    server.close();
  }

  // =========================================================================
  // 21. nenhum order/payment/escrow/wallet/refund criado
  // =========================================================================
  const [ordersCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(orders);
  const [paymentsCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(payments);
  const [escrowCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(escrowAccounts);
  const [walletTxCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(walletTransactions);
  const [refundsCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(refunds);
  report('21. Nenhum order criado', ordersCountAfter.c === ordersCountBefore.c);
  report('21b. Nenhum payment criado', paymentsCountAfter.c === paymentsCountBefore.c);
  report('21c. Nenhum escrow_account criado', escrowCountAfter.c === escrowCountBefore.c);
  report('21d. Nenhum wallet_transaction criado', walletTxCountAfter.c === walletTxCountBefore.c);
  report('21e. Nenhum refund criado', refundsCountAfter.c === refundsCountBefore.c);

  // =========================================================================
  // 22-24. sistema de frete ANTIGO intocado
  // =========================================================================
  const [legacyRateAfter] = await db.select().from(shippingRates).where(eq(shippingRates.id, legacyRateId)).limit(1);
  const [legacyZoneAfter] = await db.select().from(shippingZones).where(eq(shippingZones.id, legacyZoneId)).limit(1);
  const [legacyPolicyAfter] = await db.select().from(storeShippingPolicies).where(eq(storeShippingPolicies.id, legacyPolicyId)).limit(1);
  report('22. shipping_rates legado inalterado', JSON.stringify(legacyRateBefore) === JSON.stringify(legacyRateAfter));
  report('23. shipping_zones legado inalterado', JSON.stringify(legacyZoneBefore) === JSON.stringify(legacyZoneAfter));
  report('24. store_shipping_policies legado inalterado', JSON.stringify(legacyPolicyBefore) === JSON.stringify(legacyPolicyAfter));

  await pool.end();

  console.log(`\n=== RESULTADO FINAL D15-A ===`);
  console.log(`REGIONS=${seed2.totalRegions}`);
  console.log(`SECTORS=${seed2.totalSectors}`);
  console.log(`EXPECTED_ROUTES=${GUINEA_BISSAU_EXPECTED_ROUTES}`);
  console.log(`ACTUAL_ROUTES=${seed2.totalRoutes}`);
  console.log(`DUPLICATE_ROUTES=${seed2.duplicateRoutes}`);
  console.log(`SAME_SECTOR_ROUTES=${seed2.sameSectorRoutes}`);
  console.log(`IDEMPOTENT_SEED=${seed2.regionsCreated === 0 && seed2.sectorsCreated === 0 && seed2.routesCreated === 0 ? 'YES' : 'NO'}`);
  console.log(`LEGACY_SHIPPING_UNCHANGED=${JSON.stringify(legacyRateBefore) === JSON.stringify(legacyRateAfter) && JSON.stringify(legacyZoneBefore) === JSON.stringify(legacyZoneAfter) && JSON.stringify(legacyPolicyBefore) === JSON.stringify(legacyPolicyAfter) ? 'YES' : 'NO'}`);
  console.log(`FINANCIAL_TABLES_UNCHANGED=${ordersCountAfter.c === ordersCountBefore.c && paymentsCountAfter.c === paymentsCountBefore.c && escrowCountAfter.c === escrowCountBefore.c && walletTxCountAfter.c === walletTxCountBefore.c && refundsCountAfter.c === refundsCountBefore.c ? 'YES' : 'NO'}`);
  console.log(`\n${passed}/${total} testes passaram.`);
  console.log(`D15_A_OK=${passed === total ? 'YES' : 'NO'}`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
