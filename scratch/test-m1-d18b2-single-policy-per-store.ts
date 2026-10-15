/**
 * D18-B2 — uma única store_shipping_policy por STORE (nunca por seller).
 * HTTP real (rotas seller/admin) + constraint no Postgres Docker descartável.
 */
process.env.REDIS_URL = 'redis://localhost:6379';
import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';
const testDbUrl = assertLedgerTestDatabaseGuard();
process.env.DATABASE_URL = testDbUrl;
process.env.SKIP_RUNTIME_ALIGN = 'true';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test_fixture_jwt_secret_never_real_0123456789';

import 'dotenv/config';
import http from 'http';
import express from 'express';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import { users, sellers, stores, countries, addresses, storeShippingPolicies } from '../src/db/schema.js';
import { apiRouter } from '../src/server/api.js';

const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false }, max: 20 });
const db = drizzle(pool, { schema });
let passed = 0, total = 0;
function report(label: string, ok: boolean, detail?: any) {
  total++; if (ok) passed++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${detail !== undefined ? ' -> ' + JSON.stringify(detail) : ''}`);
}
let seq = 0;
const uid = (p: string) => `${p}_d18b2_${Date.now()}_${++seq}_${Math.random().toString(36).slice(2, 6)}`;
const runTag = uid('run');
const tokenFor = (userId: string, role: string) => jwt.sign({ userId, email: `${userId}@t.test`, role, fullName: `T ${userId}`, countryCode: 'GW', kycStatus: 'verified', isEmailVerified: true }, process.env.JWT_ACCESS_SECRET!);

async function makeUser(role: string) {
  const id = uid('usr');
  await db.insert(users).values({ id, email: `${id}@t.test`, passwordHash: 'x', fullName: `T ${id}`, phone: '11999990000', role, countryCode: 'GW', kycStatus: 'verified', riskScore: 'baixo', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date() } as any);
  return id;
}
async function makeSeller(label: string) {
  const userId = await makeUser('SELLER');
  const sellerId = uid(`seller_${label}`);
  await db.insert(sellers).values({ id: sellerId, userId, companyName: `Loja ${label}`, tradingName: `Loja ${label}`, taxId: '00000000000', phone: '11999990000', countryCode: 'GW', status: 'active', createdAt: new Date(), updatedAt: new Date() } as any);
  return { userId, sellerId, token: tokenFor(userId, 'SELLER') };
}
async function makeStore(s: { userId: string; sellerId: string }, label: string) {
  const addressId = uid('addr');
  await db.insert(addresses).values({ id: addressId, userId: s.userId, recipientName: `Loja ${label}`, street: 'Rua', number: '1', city: 'Bissau', state: 'Bissau', countryCode: 'GW', phone: '955000000', isDefault: false, addressType: 'business', createdAt: new Date(), updatedAt: new Date() } as any);
  const storeId = uid(`store_${label}`);
  await db.insert(stores).values({ id: storeId, sellerId: s.sellerId, name: `Loja ${label} D18B2`, slug: `loja-${label.toLowerCase()}-${runTag}-${storeId}`, countryCode: 'GW', status: 'active', operationalAddressId: addressId, createdAt: new Date(), updatedAt: new Date() } as any);
  return storeId;
}
const rowsFor = (storeId: string) => db.select().from(storeShippingPolicies).where(eq(storeShippingPolicies.storeId, storeId));

async function main() {
  await db.insert(countries).values([{ id: 'GW', code: 'GW', name: 'Guiné-Bissau', flag: '🇬🇼', currency: 'XOF', currencySymbol: 'CFA', phonePrefix: '+245', isActive: true, createdAt: new Date() }] as any).onConflictDoNothing();
  const app = express(); app.use(express.json()); app.use('/api/v1', apiRouter);
  const server = http.createServer(app); await new Promise<void>((r) => server.listen(0, r));
  const base = `http://localhost:${(server.address() as any).port}/api/v1`;
  const call = async (method: string, path: string, token: string, body?: any) => {
    const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
    let json: any = null; try { json = await res.json(); } catch {}
    return { status: res.status, json };
  };
  const sellerPost = (t: string, body: any) => call('POST', '/seller/shipping-policy', t, body);
  const adminToken = tokenFor(await makeUser('GLOBAL_ADMIN'), 'GLOBAL_ADMIN');
  const adminPost = (storeId: string, body: any) => call('POST', `/admin/stores/${storeId}/shipping-policy`, adminToken, body);

  // ---- constraint no banco (sem passar pelas rotas)
  const idx = await pool.query(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'store_shipping_policies'`);
  const uniqueOnStore = idx.rows.filter((r) => /UNIQUE/i.test(r.indexdef) && /\(store_id\)/.test(r.indexdef));
  const uniqueOnSeller = idx.rows.filter((r) => /UNIQUE/i.test(r.indexdef) && /seller_id/.test(r.indexdef));
  report('SCHEMA. existe UNIQUE em (store_id)', uniqueOnStore.length === 1, uniqueOnStore.map((r) => r.indexname));
  report('SCHEMA. NÃO existe UNIQUE envolvendo seller_id', uniqueOnSeller.length === 0, uniqueOnSeller.map((r) => r.indexname));

  const A = await makeSeller('A'); const storeA1 = await makeStore(A, 'A1'); const storeA2 = await makeStore(A, 'A2');
  const B = await makeSeller('B'); const storeB1 = await makeStore(B, 'B1');

  // A) primeira política para Loja A1
  const rA = await sellerPost(A.token, { storeId: storeA1, mode: 'CUSTOMER_PAYS' });
  report('A. uma política para Loja A1 -> permitido, 1 linha', rA.status === 200 && (await rowsFor(storeA1)).length === 1, { s: rA.status });

  // B) segunda política para a MESMA loja direto no banco -> rejeitada
  let dupErr: any = null;
  try {
    await pool.query(`INSERT INTO store_shipping_policies (id, store_id, seller_id, mode) VALUES ($1,$2,$3,'CUSTOMER_PAYS')`, [uid('pol_dup'), storeA1, A.sellerId]);
  } catch (e: any) { dupErr = e; }
  report('B. segunda política para a mesma loja -> banco rejeita (23505)', dupErr?.code === '23505', { code: dupErr?.code, constraint: dupErr?.constraint });
  report('B2. continua exatamente 1 linha para a loja', (await rowsFor(storeA1)).length === 1);

  // C) mesmo seller, lojas diferentes
  const rC = await sellerPost(A.token, { storeId: storeA2, mode: 'SELLER_SUBSIDIZED', subsidyType: 'PERCENT', sellerSubsidyPercent: 50 });
  const rowsA1 = await rowsFor(storeA1), rowsA2 = await rowsFor(storeA2);
  report('C. Seller A: Loja 1 (CUSTOMER_PAYS) e Loja 2 (SELLER_SUBSIDIZED 50%) coexistem', rC.status === 200 && rowsA1.length === 1 && rowsA2.length === 1 && rowsA1[0].mode === 'CUSTOMER_PAYS' && rowsA2[0].mode === 'SELLER_SUBSIDIZED' && rowsA1[0].sellerId === rowsA2[0].sellerId, { a1: rowsA1[0].mode, a2: rowsA2[0].mode });

  // D) sellers/lojas diferentes
  const rD = await sellerPost(B.token, { storeId: storeB1, mode: 'SELLER_FREE_SHIPPING' });
  report('D. Seller B / Loja B1 -> permitido', rD.status === 200 && (await rowsFor(storeB1)).length === 1);

  // E) update da existente
  const idBefore = (await rowsFor(storeA2))[0].id;
  const rE = await sellerPost(A.token, { storeId: storeA2, mode: 'SELLER_SUBSIDIZED', subsidyType: 'PERCENT', sellerSubsidyPercent: 25 });
  const rowsE = await rowsFor(storeA2);
  report('E. update da política existente -> 200, ainda 1 linha, mesma id, percentual atualizado', rE.status === 200 && rowsE.length === 1 && rowsE[0].id === idBefore && Number(rowsE[0].sellerSubsidyPercent) === 25, { id: rowsE[0]?.id === idBefore, pct: rowsE[0]?.sellerSubsidyPercent });

  // F) concorrência: várias requisições criando a política da MESMA loja nova
  let concurrentBad: any[] = [];
  const ROUNDS = 15;
  for (let i = 1; i <= ROUNDS; i++) {
    const S = await makeSeller(`F${i}`); const st = await makeStore(S, `F${i}`);
    const modes = [
      { mode: 'CUSTOMER_PAYS' },
      { mode: 'SELLER_FREE_SHIPPING' },
      { mode: 'SELLER_SUBSIDIZED', subsidyType: 'PERCENT', sellerSubsidyPercent: 30 },
      { mode: 'SELLER_SUBSIDIZED', subsidyType: 'MAX_AMOUNT', sellerSubsidyMaxAmount: 100 },
    ];
    const results = await Promise.all(modes.map((m) => sellerPost(S.token, { storeId: st, ...m })));
    const rows = await rowsFor(st);
    if (rows.length !== 1 || results.some((r) => r.status !== 200)) concurrentBad.push({ round: i, statuses: results.map((r) => r.status), rows: rows.length });
  }
  report(`F1. ${ROUNDS} rodadas × 4 POSTs seller simultâneos na MESMA loja nova: sempre 200 e exatamente 1 linha`, concurrentBad.length === 0, concurrentBad.slice(0, 3));

  let adminBad: any[] = [];
  for (let i = 1; i <= ROUNDS; i++) {
    const S = await makeSeller(`G${i}`); const st = await makeStore(S, `G${i}`);
    const results = await Promise.all([
      adminPost(st, { mode: 'MARKETPLACE_FREE_SHIPPING' }), // atualizado: modo legado só SEM teto (um teto empurraria o resto ao vendedor)
      adminPost(st, { mode: 'MARKETPLACE_FREE_SHIPPING', isActive: true }),
      sellerPost(S.token, { storeId: st, mode: 'SELLER_FREE_SHIPPING' }),
    ]);
    const rows = await rowsFor(st);
    if (rows.length !== 1 || results.some((r) => r.status !== 200)) adminBad.push({ round: i, statuses: results.map((r) => r.status), rows: rows.length });
  }
  report(`F2. ${ROUNDS} rodadas admin+admin+seller simultâneos na mesma loja: sempre 200 e exatamente 1 linha`, adminBad.length === 0, adminBad.slice(0, 3));

  // resultado determinístico em sequência (mesmo input -> mesmo estado final)
  const S2 = await makeSeller('DET'); const stDet = await makeStore(S2, 'DET');
  await sellerPost(S2.token, { storeId: stDet, mode: 'SELLER_FREE_SHIPPING' });
  await sellerPost(S2.token, { storeId: stDet, mode: 'CUSTOMER_PAYS' });
  const det = await rowsFor(stDet);
  report('F3. sequência create->update é determinística (1 linha, último valor vence)', det.length === 1 && det[0].mode === 'CUSTOMER_PAYS');

  // G) ownership
  const rG = await sellerPost(B.token, { storeId: storeA1, mode: 'SELLER_FREE_SHIPPING' });
  const a1After = await rowsFor(storeA1);
  report('G. Seller B NÃO modifica política da loja do Seller A (400) e a linha de A1 não muda', rG.status === 400 && a1After.length === 1 && a1After[0].mode === 'CUSTOMER_PAYS', { s: rG.status, mode: a1After[0]?.mode });
  const rG2 = await call('GET', `/seller/shipping-policy?storeId=${storeA1}`, B.token);
  report('G2. Seller B não lê a política de loja alheia (400)', rG2.status === 400, { s: rG2.status });

  // H) admin
  const S3 = await makeSeller('ADM'); const stAdm = await makeStore(S3, 'ADM');
  const rHcap = await adminPost(stAdm, { mode: 'MARKETPLACE_FREE_SHIPPING', marketplaceSubsidyMaxAmount: 80 });
  report('H0. (novo) admin NÃO pode criar o modo legado COM teto — passaria o restante ao vendedor: 400 e nenhuma linha criada', rHcap.status === 400 && (await rowsFor(stAdm)).length === 0, { s: rHcap.status });
  const rH1 = await adminPost(stAdm, { mode: 'MARKETPLACE_FREE_SHIPPING' });
  const h1 = await rowsFor(stAdm);
  report('H1. admin cria política (MARKETPLACE_FREE sem teto) para loja sem política', rH1.status === 200 && h1.length === 1 && h1[0].mode === 'MARKETPLACE_FREE_SHIPPING' && h1[0].marketplaceSubsidyMaxAmount === null && h1[0].sellerId === S3.sellerId, { s: rH1.status });
  const rH2 = await adminPost(stAdm, { isActive: false });
  const h2 = await rowsFor(stAdm);
  report('H2. admin atualiza SÓ o que enviou (isActive=false); modo preservado; 1 linha', rH2.status === 200 && h2.length === 1 && h2[0].isActive === false && h2[0].mode === 'MARKETPLACE_FREE_SHIPPING' && h2[0].marketplaceSubsidyMaxAmount === null);
  const rH3 = await call('POST', `/admin/stores/${stAdm}/shipping-policy`, S3.token, { mode: 'MARKETPLACE_FREE_SHIPPING' });
  report('H3. seller (não-admin) recebe 403 na rota admin', rH3.status === 403);
  const rH4 = await adminPost(stAdm, { marketplaceSubsidyPercent: 101 });
  const rH5 = await adminPost('loja_inexistente', { mode: 'CUSTOMER_PAYS' });
  report('H4. admin: percentual 101 -> 400 e loja inexistente -> 404 (validações preservadas)', rH4.status === 400 && rH5.status === 404, { pct: rH4.status, nf: rH5.status });
  const rH6 = await adminPost(stAdm, { mode: 'INVALIDO' });
  report('H5. admin: modo inválido -> 400', rH6.status === 400);
  report('H6. admin -> GET devolve a política', (await call('GET', `/admin/stores/${stAdm}/shipping-policy`, adminToken)).json?.data?.mode === 'MARKETPLACE_FREE_SHIPPING');

  // ids únicos (sem colisão por Date.now())
  const allIds = (await db.select({ id: storeShippingPolicies.id }).from(storeShippingPolicies)).map((r) => r.id);
  report('IDS. todos os ids de política são distintos', new Set(allIds).size === allIds.length, allIds.length);

  server.close(); await pool.end();
  console.log(`\n${passed}/${total} testes passaram.`);
  if (passed !== total) process.exit(1);
}
main().catch((e) => { console.error('Erro fatal:', e); process.exit(1); });
