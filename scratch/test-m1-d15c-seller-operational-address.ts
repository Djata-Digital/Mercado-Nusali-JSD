/**
 * FASE M1-D15-C — origem operacional do seller (endereço estruturado +
 * setor de frete opcional, fundação D15-A).
 *
 * Prova, via HTTP real (express + sellerRouter + JWT, mesmo padrão de
 * test-m1-d13/d14/d15a/d15b) contra Postgres Docker isolado (chain
 * completa de migrations, incluindo 0025, NUNCA staging/produção):
 *
 *   - migration 0025 é aditiva (2 colunas nullable, 2 FKs, sem DROP/
 *     TRUNCATE/NOT NULL/backfill);
 *   - endereços/lojas pré-existentes continuam válidos sem nenhum backfill;
 *   - GET/POST/PATCH /seller/addresses (endpoints novos — nenhum existente
 *     atendia, /buyer/addresses hardcoda addressType='shipping');
 *   - isolamento entre sellers (nunca vê/edita endereço de outro);
 *   - userId sempre da sessão, nunca aceito do corpo;
 *   - validação de país endereço<->setor<->região (nunca confia no frontend);
 *   - PATCH /seller/stores/:id aceita operationalAddressId com as 6
 *     validações (validateOperationalAddressGeography);
 *   - trocar/remover origem preserva o endereço; ON DELETE SET NULL nunca
 *     deixa referência inválida;
 *   - região sempre DERIVADA do setor (nunca uma coluna paralela);
 *   - nenhuma tabela financeira, shipping legado, ou shipmentService.ts é
 *     tocada por esta fase.
 *
 * NÃO conecta a checkout/shipmentService/orderService.
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
  shippingRates, shippingZones, storeShippingPolicies,
  orders, payments, escrowAccounts, walletTransactions, refunds, disputes,
} from '../src/db/schema.js';
import { getJwtAccessSecret } from '../src/server/modules/auth/jwtConfig.js';
import { sellerRouter } from '../src/server/sellerRoutes.js';
import { seedGuineaBissauShippingGeography, toShippingCode } from '../src/server/modules/shipping/shippingGeographyService.js';

const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false } });
const db = drizzle(pool, { schema });

let passed = 0, total = 0;
function report(label: string, ok: boolean, detail?: any) {
  total++; if (ok) passed++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${detail !== undefined ? ' -> ' + JSON.stringify(detail) : ''}`);
}
let seq = 0;
const uid = (p: string) => `${p}_m1d15c_${Date.now()}_${++seq}_${Math.random().toString(36).slice(2, 6)}`;

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

async function makeSeller(opts: { label: string; countryCode: string; kycVerified?: boolean }) {
  const userId = uid(`usr_${opts.label}`);
  await db.insert(users).values({
    id: userId, email: `${userId}@t.test`, passwordHash: 'x', fullName: `Seller ${opts.label}`,
    phone: '11999999999', role: 'SELLER', countryCode: opts.countryCode, kycStatus: opts.kycVerified === false ? 'pending' : 'verified',
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
    countryCode: opts.countryCode, status: 'active', createdAt: new Date(), updatedAt: new Date(),
  } as any);
  return { userId, sellerId, storeId, token: signToken({ id: userId, role: 'SELLER', fullName: `Seller ${opts.label}` }) };
}

async function main() {
  await db.insert(countries).values([
    { id: 'GW', code: 'GW', name: 'Guiné-Bissau', flag: '🇬🇼', currency: 'XOF', currencySymbol: 'CFA', phonePrefix: '+245', isActive: true, createdAt: new Date() },
    { id: 'BR', code: 'BR', name: 'Brasil', flag: '🇧🇷', currency: 'BRL', currencySymbol: 'R$', phonePrefix: '+55', isActive: true, createdAt: new Date() },
  ]).onConflictDoNothing();

  // =========================================================================
  // "Sujeira" pré-existente — endereço e loja ANTERIORES à migration 0025,
  // sem nenhuma das colunas novas preenchidas. Prova itens 2/3.
  // =========================================================================
  const legacySellerData = await makeSeller({ label: 'Legacy', countryCode: 'BR' });
  const legacyAddressId = uid('legacyaddr');
  await db.insert(addresses).values({
    id: legacyAddressId, userId: legacySellerData.userId, recipientName: 'Endereço Legado',
    street: 'Rua Antiga', number: '100', city: 'São Paulo', state: 'SP', countryCode: 'BR',
    phone: '11888888888', isDefault: false, addressType: 'business',
    createdAt: new Date(), updatedAt: new Date(),
  } as any); // shippingSectorId omitido -> NULL
  const [legacyAddressBefore] = await db.select().from(addresses).where(eq(addresses.id, legacyAddressId)).limit(1);
  const [legacyStoreBefore] = await db.select().from(stores).where(eq(stores.id, legacySellerData.storeId)).limit(1);

  // Referência do sistema legado + tabelas financeiras — para provar depois
  // que D15-C nunca as toca (itens 20/22).
  const legacyZoneId = uid('zone');
  await db.insert(shippingZones).values({ id: legacyZoneId, countryCode: 'GW', name: 'Zona Legada D15C', isActive: true, createdAt: new Date(), updatedAt: new Date() } as any);
  const legacyRateId = uid('legacyrate');
  await db.insert(shippingRates).values({
    id: legacyRateId, zoneId: legacyZoneId, originCountry: 'GW', destinationCountry: 'GW',
    minWeightKg: '0', maxWeightKg: '10', price: '999.00', currency: 'XOF', isActive: true, createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const [legacyRateBefore] = await db.select().from(shippingRates).where(eq(shippingRates.id, legacyRateId)).limit(1);
  const [zonesCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(shippingZones);
  const [ordersCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(orders);
  const [paymentsCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(payments);
  const [escrowCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(escrowAccounts);
  const [walletTxCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(walletTransactions);
  const [refundsCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(refunds);
  const [disputesCountBefore] = await db.select({ c: sql<number>`count(*)::int` }).from(disputes);

  // Fundação D15-A real (39 setores GW).
  await seedGuineaBissauShippingGeography(db);
  const bissauCode = toShippingCode('Bissau');
  const [bissauSector] = await db.select().from(shippingSectors).where(and(eq(shippingSectors.countryCode, 'GW'), eq(shippingSectors.code, bissauCode))).limit(1);
  const [bissauRegion] = await db.select().from(shippingRegions).where(eq(shippingRegions.id, bissauSector.regionId)).limit(1);

  // Setor de outro país (BR), fora do seed real de GB — para os testes de
  // incompatibilidade de país (itens 9/10/14).
  await db.insert(shippingRegions).values({ id: 'shpreg_br_d15c', countryCode: 'BR', name: 'Região Teste BR D15C', code: 'TESTE_BR_D15C', isActive: true, createdAt: new Date(), updatedAt: new Date() } as any).onConflictDoNothing();
  await db.insert(shippingSectors).values({ id: 'shpsec_br_d15c', countryCode: 'BR', regionId: 'shpreg_br_d15c', name: 'Setor Teste BR D15C', code: 'TESTE_BR_D15C', isActive: true, createdAt: new Date(), updatedAt: new Date() } as any).onConflictDoNothing();

  const sellerA = await makeSeller({ label: 'A', countryCode: 'GW' });
  const sellerB = await makeSeller({ label: 'B', countryCode: 'GW' });
  const sellerBrOtherCountry = await makeSeller({ label: 'BROther', countryCode: 'BR' });

  const server = buildServer();
  const baseUrl = await startServer(server);

  try {
    // =========================================================================
    // 4-5. Seller cria e lista o próprio endereço business
    // =========================================================================
    const createA1 = await api(baseUrl, sellerA.token, 'POST', '/seller/addresses', {
      recipientName: 'Loja A - Depósito', street: 'Avenida Amílcar Cabral', number: '10',
      city: 'Bissau', state: 'Bissau', countryCode: 'GW', phone: '2455555555',
      shippingSectorId: bissauSector.id,
    });
    report('4. Seller A cria próprio endereço business -> 201', createA1.status === 201, createA1.body);
    report('4b. addressType retornado é "business" (controlado pelo backend)', createA1.body?.data?.addressType === 'business');
    const addressA1Id = createA1.body?.data?.id;

    const listA = await api(baseUrl, sellerA.token, 'GET', '/seller/addresses');
    report('5. Seller A lista o próprio endereço', listA.status === 200 && (listA.body.data as any[]).some((a: any) => a.id === addressA1Id));

    // =========================================================================
    // 6. Seller B não vê endereço de Seller A
    // =========================================================================
    const listB = await api(baseUrl, sellerB.token, 'GET', '/seller/addresses');
    report('6. Seller B NÃO vê endereço de Seller A', !(listB.body.data as any[]).some((a: any) => a.id === addressA1Id));

    // =========================================================================
    // 7. Seller não cria endereço para userId arbitrário (campo ignorado)
    // =========================================================================
    const createWithForeignUserId = await api(baseUrl, sellerB.token, 'POST', '/seller/addresses', {
      userId: sellerA.userId, recipientName: 'Tentativa maliciosa', street: 'Rua X', city: 'Bissau', state: 'Bissau', countryCode: 'GW', phone: '245000000',
    });
    const [insertedMalicious] = await db.select().from(addresses).where(eq(addresses.id, createWithForeignUserId.body?.data?.id || '__none__')).limit(1);
    report('7. userId do corpo é ignorado — endereço criado pertence ao Seller B (sessão), nunca ao userId enviado', createWithForeignUserId.status === 201 && insertedMalicious?.userId === sellerB.userId, insertedMalicious?.userId);

    // =========================================================================
    // 8-9. GW + setor Bissau aceita; GW + setor de outro país rejeita
    // =========================================================================
    report('8. GW + setor Bissau (mesmo país) já aceito na criação acima (item 4)', createA1.status === 201);

    const createWrongSector = await api(baseUrl, sellerA.token, 'POST', '/seller/addresses', {
      recipientName: 'Endereço inválido', street: 'Rua Y', city: 'Bissau', state: 'Bissau', countryCode: 'GW', phone: '245000000',
      shippingSectorId: 'shpsec_br_d15c',
    });
    report('9. GW + setor de outro país (BR) rejeitado (400 SHIPPING_SECTOR_COUNTRY_MISMATCH)', createWrongSector.status === 400 && /SHIPPING_SECTOR_COUNTRY_MISMATCH/.test(createWrongSector.body?.error?.message || ''), createWrongSector.body);

    // =========================================================================
    // 10. BR + shippingSectorId GW rejeita
    // =========================================================================
    const createBrWithGwSector = await api(baseUrl, sellerBrOtherCountry.token, 'POST', '/seller/addresses', {
      recipientName: 'Endereço BR com setor GW', street: 'Rua Z', city: 'São Paulo', state: 'SP', countryCode: 'BR', phone: '1199999999',
      shippingSectorId: bissauSector.id,
    });
    report('10. BR + shippingSectorId de GW rejeitado (400 SHIPPING_SECTOR_COUNTRY_MISMATCH)', createBrWithGwSector.status === 400 && /SHIPPING_SECTOR_COUNTRY_MISMATCH/.test(createBrWithGwSector.body?.error?.message || ''), createBrWithGwSector.body);

    // =========================================================================
    // 11. GW com shippingSectorId null continua válido
    // =========================================================================
    const createGwNoSector = await api(baseUrl, sellerA.token, 'POST', '/seller/addresses', {
      recipientName: 'Endereço GW sem setor', street: 'Rua Sem Setor', city: 'Bissau', state: 'Bissau', countryCode: 'GW', phone: '245111111',
    });
    report('11. GW com shippingSectorId null continua válido (opt-in, checkout ainda não exige)', createGwNoSector.status === 201 && createGwNoSector.body?.data?.shippingSectorId === null, createGwNoSector.body);

    // =========================================================================
    // 12-13. Store associa endereço próprio; não pode associar de outro seller
    // =========================================================================
    const associateOwn = await api(baseUrl, sellerA.token, 'PATCH', `/seller/stores/${sellerA.storeId}`, { operationalAddressId: addressA1Id });
    report('12. Store de Seller A associa o PRÓPRIO endereço -> 200', associateOwn.status === 200, associateOwn.body);

    const createB1 = await api(baseUrl, sellerB.token, 'POST', '/seller/addresses', {
      recipientName: 'Loja B - Depósito', street: 'Rua Gabú', number: '5', city: 'Gabú', state: 'Gabú', countryCode: 'GW', phone: '245222222',
    });
    const addressB1Id = createB1.body?.data?.id;

    const associateForeign = await api(baseUrl, sellerA.token, 'PATCH', `/seller/stores/${sellerA.storeId}`, { operationalAddressId: addressB1Id });
    report('13. Store de Seller A NÃO pode associar endereço de Seller B (400 ADDRESS_NOT_OWNED)', associateForeign.status === 400 && /ADDRESS_NOT_OWNED/.test(associateForeign.body?.error?.message || ''), associateForeign.body);

    // =========================================================================
    // 14. Store e address com países diferentes rejeitados
    // =========================================================================
    const createGwAddressForBrSeller = await api(baseUrl, sellerBrOtherCountry.token, 'POST', '/seller/addresses', {
      recipientName: 'Endereço GW de seller BR', street: 'Rua Bissau', city: 'Bissau', state: 'Bissau', countryCode: 'GW', phone: '245333333',
    });
    const gwAddressOfBrSellerId = createGwAddressForBrSeller.body?.data?.id;
    const associateCountryMismatch = await api(baseUrl, sellerBrOtherCountry.token, 'PATCH', `/seller/stores/${sellerBrOtherCountry.storeId}`, { operationalAddressId: gwAddressOfBrSellerId });
    report('14. Store (BR) + endereço (GW) rejeitados (400 ADDRESS_STORE_COUNTRY_MISMATCH)', associateCountryMismatch.status === 400 && /ADDRESS_STORE_COUNTRY_MISMATCH/.test(associateCountryMismatch.body?.error?.message || ''), associateCountryMismatch.body);

    // =========================================================================
    // 15. operationalAddressId persiste corretamente
    // =========================================================================
    const [storeARow1] = await db.select().from(stores).where(eq(stores.id, sellerA.storeId)).limit(1);
    report('15. operationalAddressId persistido corretamente no banco', storeARow1.operationalAddressId === addressA1Id, storeARow1.operationalAddressId);

    // =========================================================================
    // 16. Trocar origem operacional preserva endereço anterior
    // =========================================================================
    const gwNoSectorAddressId = createGwNoSector.body.data.id;
    const switchOrigin = await api(baseUrl, sellerA.token, 'PATCH', `/seller/stores/${sellerA.storeId}`, { operationalAddressId: gwNoSectorAddressId });
    report('16a. Trocar origem operacional -> 200', switchOrigin.status === 200);
    const [addressA1StillThere] = await db.select().from(addresses).where(eq(addresses.id, addressA1Id)).limit(1);
    report('16b. Endereço anterior (addressA1) continua existindo intacto após a troca', !!addressA1StillThere && addressA1StillThere.recipientName === 'Loja A - Depósito');

    // =========================================================================
    // 17. Remover associação (NULL) funciona
    // =========================================================================
    const removeAssociation = await api(baseUrl, sellerA.token, 'PATCH', `/seller/stores/${sellerA.storeId}`, { operationalAddressId: null });
    report('17a. PATCH operationalAddressId=null -> 200', removeAssociation.status === 200);
    const [storeARow2] = await db.select().from(stores).where(eq(stores.id, sellerA.storeId)).limit(1);
    report('17b. store.operationalAddressId volta a NULL (endereço em si não é apagado)', storeARow2.operationalAddressId === null);
    const [addressA1StillThere2] = await db.select().from(addresses).where(eq(addresses.id, addressA1Id)).limit(1);
    report('17c. Endereço continua existindo mesmo após remover a associação', !!addressA1StillThere2);

    // =========================================================================
    // 18. DELETE de address referenciado nunca deixa referência inválida
    // (ON DELETE SET NULL) — testado a nível de schema/DB, já que não existe
    // (nem foi criado) endpoint DELETE nesta fase.
    // =========================================================================
    await api(baseUrl, sellerA.token, 'PATCH', `/seller/stores/${sellerA.storeId}`, { operationalAddressId: addressA1Id });
    const [storeBeforeDelete] = await db.select().from(stores).where(eq(stores.id, sellerA.storeId)).limit(1);
    report('setup: store associado a addressA1 antes de apagar', storeBeforeDelete.operationalAddressId === addressA1Id);
    await db.delete(addresses).where(eq(addresses.id, addressA1Id));
    const [storeAfterDelete] = await db.select().from(stores).where(eq(stores.id, sellerA.storeId)).limit(1);
    report('18. ON DELETE SET NULL: apagar o endereço referenciado nunca deixa store com referência inválida', storeAfterDelete.operationalAddressId === null, storeAfterDelete.operationalAddressId);

    // =========================================================================
    // 19. Região retornada é derivada corretamente do setor
    // =========================================================================
    const listASectors = await api(baseUrl, sellerA.token, 'GET', '/seller/addresses');
    const gwNoSectorRow = (listASectors.body.data as any[]).find((a: any) => a.id === createGwNoSector.body.data.id);
    report('19. shippingRegionId/Name derivados corretamente a partir do shippingSectorId (Bissau -> Setor Autónomo de Bissau)',
      gwNoSectorRow && gwNoSectorRow.shippingSectorId === null && gwNoSectorRow.shippingRegionId === null,
      'endereço sem setor -> região null, confirmando que nunca é inventada');

    const createWithSectorAgain = await api(baseUrl, sellerA.token, 'POST', '/seller/addresses', {
      recipientName: 'Endereço com setor de novo', street: 'Rua Retest', city: 'Bissau', state: 'Bissau', countryCode: 'GW', phone: '245444444',
      shippingSectorId: bissauSector.id,
    });
    report('19b. Endereço COM setor -> shippingRegionId/Name derivados corretamente do setor (Bissau -> Setor Autónomo de Bissau)',
      createWithSectorAgain.body?.data?.shippingRegionId === bissauRegion.id && createWithSectorAgain.body?.data?.shippingRegionName === bissauRegion.name,
      createWithSectorAgain.body?.data);
  } finally {
    server.close();
  }

  // =========================================================================
  // 2-3. Endereços/lojas antigos (pré-migration) continuam válidos
  // =========================================================================
  const [legacyAddressAfter] = await db.select().from(addresses).where(eq(addresses.id, legacyAddressId)).limit(1);
  const [legacyStoreAfter] = await db.select().from(stores).where(eq(stores.id, legacySellerData.storeId)).limit(1);
  report('2. Endereço antigo (pré-D15-C) continua válido e inalterado, shippingSectorId=NULL (sem backfill)',
    JSON.stringify(legacyAddressBefore) === JSON.stringify(legacyAddressAfter) && legacyAddressAfter.shippingSectorId === null);
  report('3. Loja antiga (pré-D15-C) continua válida e inalterada, operationalAddressId=NULL (sem backfill)',
    JSON.stringify(legacyStoreBefore) === JSON.stringify(legacyStoreAfter) && legacyStoreAfter.operationalAddressId === null);

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
  // 21. shipmentService.ts não foi alterado (guarda estática — nunca
  // referencia os campos novos desta fase, prova de que D15-C não conectou
  // nada ao resolvedor de origem real ainda).
  // =========================================================================
  const shipmentServiceSrc = fs.readFileSync(path.resolve('src/server/modules/logistics/shipmentService.ts'), 'utf-8');
  report('21. shipmentService.ts nunca referencia shippingSectorId/operationalAddressId (não conectado ainda)',
    !shipmentServiceSrc.includes('shippingSectorId') && !shipmentServiceSrc.includes('operationalAddressId'));

  // =========================================================================
  // 22. Shipping legado não mudou
  // =========================================================================
  const [legacyRateAfter] = await db.select().from(shippingRates).where(eq(shippingRates.id, legacyRateId)).limit(1);
  const [zonesCountAfter] = await db.select({ c: sql<number>`count(*)::int` }).from(shippingZones);
  report('22. shipping_rates/shipping_zones legados inalterados', JSON.stringify(legacyRateBefore) === JSON.stringify(legacyRateAfter) && zonesCountBefore.c === zonesCountAfter.c);

  await pool.end();

  console.log(`\n${passed}/${total} testes passaram.`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((e) => {
  console.error('\n[ERRO FATAL]', e instanceof Error ? e.message : e);
  process.exit(1);
});
