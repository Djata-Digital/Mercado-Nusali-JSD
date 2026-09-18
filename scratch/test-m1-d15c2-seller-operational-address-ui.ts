/**
 * FASE M1-D15-C2 — UI real de endereço/origem operacional do vendedor.
 *
 * Prova, via HTTP real (express + sellerRouter + adminRouter + JWT, mesmo
 * padrão de test-m1-d13/d14/d15a/d15b/d15c) contra Postgres Docker isolado
 * (chain completa de migrations, NUNCA staging/produção):
 *
 *   - CRUD de endereço operacional do seller (reutiliza D15-C);
 *   - isolamento entre sellers (nunca edita/associa endereço de outro);
 *   - GW+setor válido aceito, GW+setor de outro país rejeitado, BR sem
 *     setor continua funcionando;
 *   - região exibida sempre bate com a região real do setor;
 *   - trocar/remover origem preserva o endereço anterior;
 *   - stores.addressJson legado, tabelas financeiras e shipping legado
 *     nunca tocados;
 *   - os 2 endpoints novos GET /seller/shipping/regions|sectors são
 *     somente leitura (nenhum verbo de escrita registrado) e NÃO relaxam a
 *     autorização dos endpoints admin (/admin/shipping/* continua exigindo
 *     staff interno — seller continua recebendo 403 lá).
 *
 * Depois, faz uma verificação ESTÁTICA do componente novo
 * (SellerOperationalAddressManager.tsx) para confirmar o contrato do
 * frontend: envia countryCode da loja, envia shippingSectorId real, NUNCA
 * envia shippingRegionId, PATCH de operationalAddressId sempre escopado ao
 * storeId da própria loja, nunca depende de "primeiro endereço"/isDefault,
 * e mostra Região->Setor de forma dependente só quando há geografia (GW).
 *
 * NÃO conecta a checkout/shipmentService/orderService/cálculo de frete.
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
import { eq, and, sql } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import {
  users, countries, sellers, stores, addresses,
  shippingRegions, shippingSectors,
  shippingRates, shippingZones,
  orders, payments, escrowAccounts, walletTransactions, refunds,
} from '../src/db/schema.js';
import { getJwtAccessSecret } from '../src/server/modules/auth/jwtConfig.js';
import { sellerRouter } from '../src/server/sellerRoutes.js';
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
const uid = (p: string) => `${p}_m1d15c2_${Date.now()}_${++seq}_${Math.random().toString(36).slice(2, 6)}`;

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
  app.use('/seller', sellerRouter);
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
  // Uma rota não registrada (404 real do Express) devolve HTML, não JSON —
  // relevante especificamente para o item 17 (confirmar que POST/PATCH em
  // /seller/shipping/* simplesmente não existem).
  let parsed: any = {};
  try { parsed = await res.json(); } catch { parsed = {}; }
  return { status: res.status, body: parsed };
}

async function makeSeller(opts: { label: string; countryCode: string }) {
  const userId = uid(`usr_${opts.label}`);
  await db.insert(users).values({
    id: userId, email: `${userId}@t.test`, passwordHash: 'x', fullName: `Seller ${opts.label}`,
    phone: '11999999999', role: 'SELLER', countryCode: opts.countryCode, kycStatus: 'verified',
    riskScore: 'baixo', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date(),
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
    countryCode: opts.countryCode, status: 'active',
    addressJson: { phone: '11999999999', city: 'Cidade Legada', address: 'Endereço Legado addressJson', email: `${opts.label}@t.test` },
    createdAt: new Date(), updatedAt: new Date(),
  } as any);
  return { userId, sellerId, storeId, token: signToken({ id: userId, role: 'SELLER', fullName: `Seller ${opts.label}` }) };
}

async function main() {
  await db.insert(countries).values([
    { id: 'GW', code: 'GW', name: 'Guiné-Bissau', flag: '🇬🇼', currency: 'XOF', currencySymbol: 'CFA', phonePrefix: '+245', isActive: true, createdAt: new Date() },
    { id: 'BR', code: 'BR', name: 'Brasil', flag: '🇧🇷', currency: 'BRL', currencySymbol: 'R$', phonePrefix: '+55', isActive: true, createdAt: new Date() },
  ]).onConflictDoNothing();

  // Referência legado + financeiro — prova depois que nada mudou (itens 13-15).
  const legacyZoneId = uid('zone');
  await db.insert(shippingZones).values({ id: legacyZoneId, countryCode: 'GW', name: 'Zona Legada D15C2', isActive: true, createdAt: new Date(), updatedAt: new Date() } as any);
  const legacyRateId = uid('legacyrate');
  await db.insert(shippingRates).values({
    id: legacyRateId, zoneId: legacyZoneId, originCountry: 'GW', destinationCountry: 'GW',
    minWeightKg: '0', maxWeightKg: '10', price: '999.00', currency: 'XOF', isActive: true, createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const [legacyRateBefore] = await db.select().from(shippingRates).where(eq(shippingRates.id, legacyRateId)).limit(1);
  const [ordersCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(orders);
  const [paymentsCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(payments);
  const [escrowCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(escrowAccounts);
  const [walletTxCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(walletTransactions);
  const [refundsCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(refunds);

  await seedGuineaBissauShippingGeography(db);
  const bissauCode = toShippingCode('Bissau');
  const [bissauSector] = await db.select().from(shippingSectors).where(and(eq(shippingSectors.countryCode, 'GW'), eq(shippingSectors.code, bissauCode))).limit(1);
  const [bissauRegion] = await db.select().from(shippingRegions).where(eq(shippingRegions.id, bissauSector.regionId)).limit(1);

  await db.insert(shippingRegions).values({ id: 'shpreg_br_d15c2', countryCode: 'BR', name: 'Região Teste BR D15C2', code: 'TESTE_BR_D15C2', isActive: true, createdAt: new Date(), updatedAt: new Date() } as any).onConflictDoNothing();
  await db.insert(shippingSectors).values({ id: 'shpsec_br_d15c2', countryCode: 'BR', regionId: 'shpreg_br_d15c2', name: 'Setor Teste BR D15C2', code: 'TESTE_BR_D15C2', isActive: true, createdAt: new Date(), updatedAt: new Date() } as any).onConflictDoNothing();

  const sellerA = await makeSeller({ label: 'A', countryCode: 'GW' });
  const sellerB = await makeSeller({ label: 'B', countryCode: 'GW' });
  const sellerBr = await makeSeller({ label: 'BR', countryCode: 'BR' });

  const [storeALegacyBefore] = await db.select().from(stores).where(eq(stores.id, sellerA.storeId)).limit(1);

  const server = buildServer();
  const baseUrl = await startServer(server);

  try {
    // 1. Seller cria próprio endereço
    const create1 = await api(baseUrl, sellerA.token, 'POST', '/seller/addresses', {
      recipientName: 'Depósito A', street: 'Av. Amílcar Cabral', number: '10', city: 'Bissau', state: 'Bissau',
      countryCode: 'GW', phone: '245555555', shippingSectorId: bissauSector.id,
    });
    report('1. Seller cria próprio endereço operacional -> 201', create1.status === 201, create1.body);
    const addr1Id = create1.body?.data?.id;

    // 2. Lista próprios
    const list1 = await api(baseUrl, sellerA.token, 'GET', '/seller/addresses');
    report('2. Seller lista seus endereços', list1.status === 200 && (list1.body.data as any[]).some((a: any) => a.id === addr1Id));

    // 3. Edita próprio
    const edit1 = await api(baseUrl, sellerA.token, 'PATCH', `/seller/addresses/${addr1Id}`, { phone: '245999999' });
    report('3. Seller edita endereço próprio -> 200', edit1.status === 200 && edit1.body?.data?.phone === '245999999', edit1.body);

    // 4. Seller B não edita endereço de A
    const editForeign = await api(baseUrl, sellerB.token, 'PATCH', `/seller/addresses/${addr1Id}`, { phone: '245000000' });
    report('4. Seller B NÃO edita endereço de Seller A (404)', editForeign.status === 404, editForeign.body);

    // 5. Seller B não associa endereço de A à loja B
    const associateForeign = await api(baseUrl, sellerB.token, 'PATCH', `/seller/stores/${sellerB.storeId}`, { operationalAddressId: addr1Id });
    report('5. Seller B NÃO associa endereço de A à própria loja (400 ADDRESS_NOT_OWNED)', associateForeign.status === 400 && /ADDRESS_NOT_OWNED/.test(associateForeign.body?.error?.message || ''), associateForeign.body);

    // 6. GW + setor válido
    report('6. GW + setor válido já aceito no item 1', create1.status === 201);

    // 7. GW + setor de outro país rejeita
    const wrongSector = await api(baseUrl, sellerA.token, 'POST', '/seller/addresses', {
      recipientName: 'Endereço inválido', street: 'Rua X', city: 'Bissau', state: 'Bissau', countryCode: 'GW', phone: '245111111',
      shippingSectorId: 'shpsec_br_d15c2',
    });
    report('7. GW + setor de outro país rejeitado (400)', wrongSector.status === 400 && /SHIPPING_SECTOR_COUNTRY_MISMATCH/.test(wrongSector.body?.error?.message || ''), wrongSector.body);

    // 8. BR continua aceitando endereço sem shippingSectorId
    const brNoSector = await api(baseUrl, sellerBr.token, 'POST', '/seller/addresses', {
      recipientName: 'Depósito BR', street: 'Rua SP', number: '1', city: 'São Paulo', state: 'SP', countryCode: 'BR', phone: '1188888888',
    });
    report('8. BR aceita endereço sem shippingSectorId -> 201', brNoSector.status === 201 && brNoSector.body?.data?.shippingSectorId === null, brNoSector.body);

    // 9. Região exibida bate com a região real do setor
    report('9. shippingRegionId/Name do endereço criado batem com a região real de Bissau', create1.body?.data?.shippingRegionId === bissauRegion.id && create1.body?.data?.shippingRegionName === bissauRegion.name, create1.body?.data);

    // 10. Trocar operationalAddressId funciona
    const create2 = await api(baseUrl, sellerA.token, 'POST', '/seller/addresses', {
      recipientName: 'Depósito A2', street: 'Rua Gabú', number: '2', city: 'Gabú', state: 'Gabú', countryCode: 'GW', phone: '245222222',
    });
    const addr2Id = create2.body.data.id;
    const assoc1 = await api(baseUrl, sellerA.token, 'PATCH', `/seller/stores/${sellerA.storeId}`, { operationalAddressId: addr1Id });
    report('10a. Primeira associação -> 200', assoc1.status === 200);
    const assoc2 = await api(baseUrl, sellerA.token, 'PATCH', `/seller/stores/${sellerA.storeId}`, { operationalAddressId: addr2Id });
    report('10b. Trocar operationalAddressId -> 200', assoc2.status === 200);
    const [storeARow] = await db.select().from(stores).where(eq(stores.id, sellerA.storeId)).limit(1);
    report('10c. operationalAddressId persistido = addr2', storeARow.operationalAddressId === addr2Id);

    // 11. Remover com null funciona
    const removeAssoc = await api(baseUrl, sellerA.token, 'PATCH', `/seller/stores/${sellerA.storeId}`, { operationalAddressId: null });
    report('11. Remover operationalAddressId (null) -> 200', removeAssoc.status === 200);
    const [storeARowAfterRemove] = await db.select().from(stores).where(eq(stores.id, sellerA.storeId)).limit(1);
    report('11b. operationalAddressId volta a NULL', storeARowAfterRemove.operationalAddressId === null);

    // 12. Endereço anterior continua existindo após trocar origem
    const [addr1StillThere] = await db.select().from(addresses).where(eq(addresses.id, addr1Id)).limit(1);
    report('12. Endereço anterior (addr1) continua existindo após trocas de origem', !!addr1StillThere);

    // 13. stores.addressJson legado permanece intacto
    const [storeALegacyAfter] = await db.select().from(stores).where(eq(stores.id, sellerA.storeId)).limit(1);
    report('13. stores.addressJson legado permanece intacto', JSON.stringify(storeALegacyBefore.addressJson) === JSON.stringify(storeALegacyAfter.addressJson), storeALegacyAfter.addressJson);

    // 16. Nenhum endpoint admin perdeu proteção — seller continua 403 em /admin/shipping/*
    const sellerTryAdmin = await api(baseUrl, sellerA.token, 'GET', '/admin/shipping/regions?country=GW');
    report('16. Seller continua SEM acesso a /admin/shipping/regions (403) — autorização admin não foi relaxada', sellerTryAdmin.status === 401 || sellerTryAdmin.status === 403, sellerTryAdmin.status);

    // Novo endpoint de leitura funciona para o seller
    const sellerRegions = await api(baseUrl, sellerA.token, 'GET', '/seller/shipping/regions?country=GW');
    report('setup: GET /seller/shipping/regions funciona para o seller e retorna 9', sellerRegions.status === 200 && (sellerRegions.body.data as any[]).length === 9);
    const sellerSectors = await api(baseUrl, sellerA.token, 'GET', '/seller/shipping/sectors?country=GW');
    report('setup: GET /seller/shipping/sectors funciona para o seller e retorna 39', sellerSectors.status === 200 && (sellerSectors.body.data as any[]).length === 39);

    // 17. Endpoint read-only de geografia nunca permite escrita
    const tryPostRegions = await api(baseUrl, sellerA.token, 'POST', '/seller/shipping/regions', { name: 'Hack' });
    report('17. POST em /seller/shipping/regions não é uma rota registrada (404) — somente leitura', tryPostRegions.status === 404, tryPostRegions.status);
    const tryPatchSectors = await api(baseUrl, sellerA.token, 'PATCH', '/seller/shipping/sectors/whatever', { name: 'Hack' });
    report('17b. PATCH em /seller/shipping/sectors/:id não é uma rota registrada (404) — somente leitura', tryPatchSectors.status === 404, tryPatchSectors.status);
  } finally {
    server.close();
  }

  // 14. Nenhuma tabela financeira mudou
  const [ordersCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(orders);
  const [paymentsCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(payments);
  const [escrowCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(escrowAccounts);
  const [walletTxCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(walletTransactions);
  const [refundsCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(refunds);
  report('14. Nenhuma tabela financeira mudou', ordersCountAfter.c === ordersCountBefore.c && paymentsCountAfter.c === paymentsCountBefore.c
    && escrowCountAfter.c === escrowCountBefore.c && walletTxCountAfter.c === walletTxCountBefore.c && refundsCountAfter.c === refundsCountBefore.c);

  // 15. Shipping legado não muda
  const [legacyRateAfter] = await db.select().from(shippingRates).where(eq(shippingRates.id, legacyRateId)).limit(1);
  report('15. shipping_rates legado inalterado', JSON.stringify(legacyRateBefore) === JSON.stringify(legacyRateAfter));

  // =========================================================================
  // TESTE DE CONTRATO/COMPONENTE — verificação ESTÁTICA do frontend novo.
  // =========================================================================
  const componentSrc = fs.readFileSync(path.resolve('src/components/seller/SellerOperationalAddressManager.tsx'), 'utf-8');

  report('CONTRATO: envia countryCode = storeCountryCode (país da loja)', /countryCode:\s*storeCountryCode/.test(componentSrc));
  report('CONTRATO: envia shippingSectorId real do formulário', /shippingSectorId:\s*form\.shippingSectorId \|\| null/.test(componentSrc));
  report('CONTRATO: NUNCA envia shippingRegionId no payload de criação/edição', !/shippingRegionId:\s*(selectedRegionId|form\.)/.test(componentSrc));
  report('CONTRATO: PATCH operationalAddressId sempre escopado ao storeId da própria loja (prop, nunca hardcoded)', /updateStore\(storeId,/.test(componentSrc));
  report('CONTRATO: nunca seleciona origem por "addresses[0]" (primeiro endereço)', !/addresses\[0\]/.test(componentSrc));
  report('CONTRATO: nunca decide origem operacional por isDefault', !/isDefault/.test(componentSrc) || !/isDefault[\s\S]{0,40}(origin|origem)/i.test(componentSrc));
  report('CONTRATO: Região->Setor dependente, só quando hasSectorGeography (GW)', /hasSectorGeography/.test(componentSrc) && /disabled=\{!selectedRegionId\}/.test(componentSrc));

  const multiStoreSrc = fs.readFileSync(path.resolve('src/components/seller/SellerMultiStore.tsx'), 'utf-8');
  report('CONTRATO: SellerMultiStore passa storeId real (não hardcoded) para o drawer', /storeId=\{managingOriginStore\.id\}/.test(multiStoreSrc));

  await pool.end();

  console.log(`\n${passed}/${total} testes passaram.`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((e) => {
  console.error('\n[ERRO FATAL]', e instanceof Error ? e.message : e);
  process.exit(1);
});
