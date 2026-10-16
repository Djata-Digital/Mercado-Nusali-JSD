/**
 * GEOGRAFIA DE FRETE PÚBLICA (GET /shipping/regions|sectors) + modal de destino — o visitante escolhe Região/Setor sem login; só dados públicos
 * (id/nome/código), só ativos, validação de entrada, sem tarifas/rotas; os endpoints autenticados do comprador continuam protegidos; o modal usa os
 * endpoints públicos e mostra mensagens quando falha. Postgres 17 DESCARTAVEL.
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
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import { apiRouter } from '../src/server/api.js';
import { setupCheckoutKit } from './checkoutTestKit.js';
import { geographyLoadMessage } from '../src/utils/deliveryGeography.js';

if (!['localhost', '127.0.0.1'].includes(new URL(testDbUrl).hostname)) throw new Error('Somente banco local descartavel.');
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 600)}`); };
const src = (p: string) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));

async function main() {
  const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false }, max: 4 });
  const db = drizzle(pool, { schema });
  const kit = await setupCheckoutKit(db, 'geo');
  const app = express(); app.use(express.json()); app.use('/api/v1', apiRouter);
  const server = http.createServer(app); await new Promise<void>((res) => server.listen(0, res));
  const base = `http://localhost:${(server.address() as any).port}/api/v1`;
  const get = async (p: string, headers: Record<string, string> = {}) => { const r = await fetch(`${base}${p}`, { headers }); return { status: r.status, cache: r.headers.get('cache-control'), json: await r.json().catch(() => null) as any }; };

  const reg = await get('/shipping/regions?country=GW');
  const regionsInDb = (await db.select().from(schema.shippingRegions)).filter((r: any) => r.countryCode === 'GW' && r.isActive);
  report('G1 GET /shipping/regions?country=GW SEM login (sem Authorization): 200 com as regiões ATIVAS de GW — o 401 do visitante deixa de existir nesta consulta', reg.status === 200 && reg.json.success === true && reg.json.data.length === regionsInDb.length && reg.json.data.length > 0, reg.json);
  report('G2 só dados públicos: cada região tem EXATAMENTE id, name e code (nenhum outro campo)', reg.json.data.every((r: any) => Object.keys(r).sort().join(',') === 'code,id,name'));
  const firstRegion = reg.json.data[0];
  const sec = await get(`/shipping/sectors?country=GW&region=${encodeURIComponent(firstRegion.id)}`);
  const secAll = await get('/shipping/sectors?country=GW');
  const sectorsInDb = (await db.select().from(schema.shippingSectors)).filter((s: any) => s.countryCode === 'GW' && s.isActive);
  report('G3 setores: filtrados pela região quando informada; sem região devolve todos os ativos do país; campos EXATOS id, name, code, regionId', sec.status === 200 && sec.json.data.length > 0 && sec.json.data.every((s: any) => s.regionId === firstRegion.id) && secAll.json.data.length === sectorsInDb.length && secAll.json.data.every((s: any) => Object.keys(s).sort().join(',') === 'code,id,name,regionId'), { n: sec.json?.data?.length });
  // inativos nunca aparecem
  const victim = regionsInDb[0];
  await db.update(schema.shippingRegions).set({ isActive: false } as any).where(eq(schema.shippingRegions.id, victim.id));
  const sectorVictim = sectorsInDb[0];
  await db.update(schema.shippingSectors).set({ isActive: false } as any).where(eq(schema.shippingSectors.id, sectorVictim.id));
  const reg2 = await get('/shipping/regions?country=GW'), sec2 = await get('/shipping/sectors?country=GW');
  report('G4 região e setor INATIVOS não aparecem', !reg2.json.data.some((r: any) => r.id === victim.id) && !sec2.json.data.some((s: any) => s.id === sectorVictim.id) && reg2.json.data.length === regionsInDb.length - 1);
  const bad = await Promise.all(['', '?country=', '?country=GWW', '?country=1', '?country=G', '?country=%27%20OR%201=1', '?country=gw%00'].map((q) => get(`/shipping/regions${q}`)));
  report('G5 entrada inválida: sem país, vazio, 3 letras, número, 1 letra, injeção de SQL, byte nulo → 400 com código e mensagem (nunca 500, nunca dados)', bad.every((r) => r.status === 400 && r.json.success === false && !!r.json.error?.code && !r.json.data), bad.map((r) => [r.status, r.json?.error?.code]));
  const badRegion = await get("/shipping/sectors?country=GW&region=%27%3B%20DROP%20TABLE%20x");
  report('G6 região com caracteres perigosos é recusada (400 REGION_INVALID)', badRegion.status === 400 && badRegion.json.error.code === 'REGION_INVALID');
  const lower = await get('/shipping/regions?country=gw');
  const none = await get('/shipping/regions?country=ZZ');
  report('G7 país em minúsculas é normalizado; país sem dados devolve lista vazia (200), nunca erro nem dados de outro país', lower.status === 200 && lower.json.data.length === regionsInDb.length - 1 && none.status === 200 && none.json.data.length === 0);
  report('G8 cache curto público (5 min) — dados de geografia não sensíveis', reg.cache === 'public, max-age=300');
  const text = JSON.stringify([reg.json, sec.json, secAll.json]);
  report('G9 a resposta não contém tarifas, rotas, preços, armazéns, endereços, e-mails nem identificadores de utilizadores', !/amount|rate|route|price|warehouse|street|email|userId|sellerId|cost/i.test(text));
  const buyerAuth = await get('/buyer/shipping/regions?country=GW');
  report('G10 os endpoints do COMPRADOR continuam protegidos (401 sem login): a mudança não abriu nada que estava fechado', buyerAuth.status === 401);
  const routeCheck = await get('/shipping/preview-cart');
  report('G11 outras rotas /shipping/* inalteradas (preview-cart continua POST: GET devolve 404, não vaza nada)', routeCheck.status === 404);
  server.close();

  // ---- front-end: o modal usa os endpoints públicos e mostra mensagens
  const modal = src('src/components/DeliveryDestinationModal.tsx'), api = src('src/api/clients/ShippingApi.ts');
  report('F1 o modal busca regiões/setores pelos endpoints PÚBLICOS (ShippingApi.getRegions/getSectors → /shipping/regions|sectors), não pelos do comprador', modal.includes('ShippingApi.getRegions(selectedCountry)') && modal.includes('ShippingApi.getSectors(selectedCountry, regionId)') && !modal.includes('BuyerService.getShippingRegions') && !modal.includes('BuyerService.getShippingSectors') && api.includes("apiClient.get('/shipping/regions'") && api.includes("apiClient.get('/shipping/sectors'"));
  report('F2 falhas nunca são engolidas: não há mais .catch(() => {}) vazio na carga da geografia; erros viram mensagem (role=alert) com "Tentar novamente"', !/getRegions[\s\S]{0,300}\.catch\(\(\) => \{\}\)/.test(modal) && modal.includes('data-testid="destination-regions-error"') && modal.includes('data-testid="destination-sectors-error"') && modal.includes('Tentar novamente') && modal.includes('role="alert"'));
  report('F3 estados de carregamento e lista vazia explicados ("Carregando...", "Ainda não há regiões/setores")', modal.includes("isLoadingRegions ? 'Carregando...'") && /Ainda não há regiões/.test(geographyLoadMessage('regions', 'empty')) && /Ainda não há setores/.test(geographyLoadMessage('sectors', 'empty')));
  const err = geographyLoadMessage('regions', 'error', 'Serviço indisponível no momento.');
  const leak = geographyLoadMessage('sectors', 'error', 'select * from shipping_sectors at Object.fn (db.ts:10)');
  report('F4 mensagem de erro amigável e fixa: nunca repassa texto do servidor (SQL/stack/HTML), sempre acionável', /Não foi possível carregar as regiões/.test(err) && /tente novamente/.test(err) && !/Serviço indisponível/.test(err) && !/select|Object\.fn|db\.ts/i.test(leak) && /Não foi possível carregar os setores/.test(leak));
  report('F5 visitante (sem login) pode escolher o destino: "Outro destino" aparece sem exigir autenticação e a busca de endereços cadastrados continua só para logados', modal.includes("isAuthenticated && destination?.mode !== 'sector' ? 'saved' : 'sector'") && /if \(!isOpen \|\| !isAuthenticated\) return;/.test(modal));
  report('F6 formulário de endereço do comprador logado (AddressesView/Checkout) continua nos endpoints autenticados (inalterado)', src('src/services/buyerService.ts').includes("apiClient.get('/buyer/shipping/regions'") && src('src/components/AddressesView.tsx').includes('BuyerService.getShippingRegions'));

  console.log(`\n${passed}/${total} passaram`);
  await pool.end();
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
