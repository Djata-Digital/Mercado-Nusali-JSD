/**
 * ENDURECIMENTO DO SUBSÍDIO POR SERVIÇO (verificação final antes da publicação) —
 *  1. rate limit dos endpoints públicos de regiões/setores (infraestrutura existente, sem login);
 *  2. configuração inválida nunca vira uma cotação enganosa: o que o cliente vê é exatamente o que o pedido cobra, sem selo de subsídio;
 *  3. o país da regra é o país de DESTINO da entrega (setor), nunca o do vendedor nem o escolhido no catálogo (cabeçalho X-Country-Code);
 *  4. nada grava a configuração financeira sem ação explícita do Super Admin (leituras, pedidos recusados, outros papéis, abrir/editar o painel).
 * Postgres 17 DESCARTAVEL. Nunca produção.
 */
process.env.REDIS_URL = '';
import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';
const testDbUrl = assertLedgerTestDatabaseGuard();
process.env.DATABASE_URL = testDbUrl;
process.env.NODE_ENV = 'test';
process.env.SKIP_RUNTIME_ALIGN = 'true';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test_fixture_jwt_secret_never_real_0123456789';
process.env.ASAAS_WEBHOOK_AUTH_TOKEN = process.env.ASAAS_WEBHOOK_AUTH_TOKEN || 'test_webhook_token_fixture';
import 'dotenv/config';
import fs from 'fs';
import http from 'http';
import express from 'express';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import { orders, platformSettings, auditLogs, countries, sellers } from '../src/db/schema.js';
import { apiRouter, PUBLIC_GEOGRAPHY_RATE_LIMIT } from '../src/server/api.js';
import { OrderService } from '../src/server/modules/orders/orderService.js';
import { getJwtAccessSecret } from '../src/server/modules/auth/jwtConfig.js';
import { resolveCartShippingPreview } from '../src/server/modules/shipping/shippingPreviewService.js';
import { readShippingSubsidyConfig } from '../src/server/modules/shipping/shippingSubsidyAdminService.js';
import { __resetRateLimitMemoryForTests } from '../src/server/infra/rateLimiter.js';
import { describeServiceOptionPrice } from '../src/utils/shippingDisplay.js';
import { geographyLoadMessage } from '../src/utils/deliveryGeography.js';
import { setupCheckoutKit } from './checkoutTestKit.js';

if (!['localhost', '127.0.0.1'].includes(new URL(testDbUrl).hostname)) throw new Error('Somente banco local descartavel.');
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 700)}`); };
const src = (p: string) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const R = (enabled: boolean, percent: number) => ({ enabled, percent });
const fmt = (n: number) => `${n} XOF`;

async function main() {
  const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false }, max: 8 });
  const db = drizzle(pool, { schema });
  const kit = await setupCheckoutKit(db, 'hd');
  await kit.setFlag('multiSellerCheckoutEnabled', true);
  await db.insert(countries).values([{ id: 'SN', code: 'SN', name: 'Senegal', flag: '🇸🇳', currency: 'XOF', currencySymbol: 'CFA', phonePrefix: '+221', isActive: true, createdAt: new Date() }] as any).onConflictDoNothing();
  await db.insert(countries).values([{ id: 'BR', code: 'BR', name: 'Brasil', flag: '🇧🇷', currency: 'BRL', currencySymbol: 'R$', phonePrefix: '+55', isActive: true, createdAt: new Date() }] as any).onConflictDoNothing();
  const bissau = await kit.sector('Bissau');
  const sectors: any[] = (await db.select().from(schema.shippingSectors)).filter((x: any) => x.countryCode === 'GW' && x.id !== bissau.id).sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
  let ns = 0;
  const std = await kit.service('STANDARD');
  const KEY = 'shippingNusaliSubsidy', MODE_KEY = 'defaultShippingPolicyMode';
  const setCfg = async (v: any) => { if (v === null) await db.delete(platformSettings).where(eq(platformSettings.key, KEY)); else await kit.setFlag(KEY, v); };
  const cfgRow = async () => (await db.select().from(platformSettings).where(eq(platformSettings.key, KEY)))[0];
  await db.delete(platformSettings).where(eq(platformSettings.key, MODE_KEY));

  const shop = async (label: string, cost = 1000) => {
    const sector = sectors[ns++];
    const seller = await kit.makeSeller(label);
    const store = await kit.makeStore(seller, label, sector.id);
    const product = await kit.makeProduct(seller, store.storeId, `P ${label}`, 0.3, 5000);
    await kit.insertInventory({ sellerId: seller.sellerId, productId: product.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: store.floc.id, quantityOnHand: 100 });
    await kit.insertRate((await kit.route(sector.id, bissau.id)).id, std.id, cost, { min: 0, max: 10 });
    return { seller, store, product };
  };
  const quote = (productIds: string[]) => resolveCartShippingPreview({ destinationShippingSectorId: bissau.id, serviceCode: 'STANDARD', items: productIds.map((id) => ({ productId: id, variantId: null, quantity: 1 })) }, db) as Promise<any>;
  const place = async (productIds: string[], expected: number | null) => {
    const buyer = await kit.makeBuyer(bissau.id);
    for (const id of productIds) await kit.addToCart(buyer.cartId, id, 1, 5000);
    try { return { ok: true as const, value: await OrderService.createOrderFromCart({ userId: buyer.buyerId, addressId: buyer.addressId, paymentMethod: 'pix', shippingSelection: { serviceCode: 'STANDARD', expectedShippingChargedToBuyer: expected } } as any, db) as any }; }
    catch (e: any) { return { ok: false as const, error: e }; }
  };
  const orderRow = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0];

  const app = express(); app.use(express.json()); app.use('/api/v1', apiRouter);
  const server = http.createServer(app); await new Promise<void>((res) => server.listen(0, res));
  const base = `http://localhost:${(server.address() as any).port}/api/v1`;
  const call = async (method: string, p: string, tok: string | null, body?: any, headers: Record<string, string> = {}) => {
    const r = await fetch(`${base}${p}`, { method, headers: { 'Content-Type': 'application/json', ...headers, ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, h: r.headers, json: await r.json().catch(() => null) as any };
  };
  const tokenFor = (userId: string, role: string) => jwt.sign({ userId, email: `${userId}@t.test`, role, fullName: `T ${role}`, countryCode: 'GW', kycStatus: 'verified', isEmailVerified: true }, getJwtAccessSecret(), { expiresIn: '10m' });

  // ================= 1. rate limit dos endpoints públicos
  __resetRateLimitMemoryForTests();
  const max = PUBLIC_GEOGRAPHY_RATE_LIMIT.maxRequests;
  let okCount = 0, first429: any = null;
  for (let i = 0; i < max + 5; i++) {
    const r = await call('GET', i % 2 === 0 ? '/shipping/regions?country=GW' : '/shipping/sectors?country=GW', null);
    if (r.status === 200) okCount++; else if (!first429) first429 = r;
  }
  report(`H1 rate limit sem login: as primeiras ${max} consultas (regiões+setores partilham o contador por IP) passam e a seguinte recebe 429 RATE_LIMIT_EXCEEDED`, okCount === max && first429?.status === 429 && first429.json?.error?.code === 'RATE_LIMIT_EXCEEDED' && first429.json?.success === false, { okCount, first429: first429?.json });
  const lim = await call('GET', '/shipping/regions?country=GW', null);
  report('H2 cabeçalhos X-RateLimit-Limit/Remaining e mensagem em português; nenhuma autenticação exigida em momento algum', lim.status === 429 && lim.h.get('x-ratelimit-limit') === String(max) && lim.h.get('x-ratelimit-remaining') === '0' && /Aguarde um instante/.test(lim.json.error.message));
  const other = await call('POST', '/shipping/preview-cart', null, { items: [] });
  const buyerRoute = await call('GET', '/buyer/shipping/regions?country=GW', null);
  report('H3 o limite é só desses 2 endpoints: preview-cart e rotas do comprador não são afetados (400/401, nunca 429)', other.status === 400 && buyerRoute.status === 401);
  __resetRateLimitMemoryForTests();
  const again = await call('GET', '/shipping/regions?country=GW', null);
  report('H4 a janela é por tempo: ao zerar o contador (expiração) volta a responder 200', again.status === 200 && Array.isArray(again.json.data));
  const geoSrc = src('src/server/api.ts');
  report('H5 reutiliza a infraestrutura existente (createRateLimiter de infra/rateLimiter: Redis com fallback em memória, por IP real) nas DUAS rotas e só nelas', geoSrc.includes("import { createRateLimiter } from './infra/rateLimiter.js'") && /apiRouter\.get\('\/shipping\/regions', publicGeographyLimiter,/.test(geoSrc) && /apiRouter\.get\('\/shipping\/sectors', publicGeographyLimiter,/.test(geoSrc) && geoSrc.includes("keyPrefix: 'rl:shipping:geo:'") && (geoSrc.match(/publicGeographyLimiter/g) || []).length === 3);
  report('H6 o modal mostra mensagem própria para 429 (não "falha de conexão")', /Muitas consultas seguidas/.test(geographyLoadMessage('regions', 'error', 'RATE_LIMIT_EXCEEDED')) && /conexão/.test(geographyLoadMessage('regions', 'error', 'OUTRO')) && src('src/components/DeliveryDestinationModal.tsx').includes("(res as any)?.error?.code") && src('src/components/DeliveryDestinationModal.tsx').includes('err?.response?.data?.error?.code'));

  // ================= 2. configuração inválida não gera cotação enganosa
  const s1 = await shop('inv1'), s2 = await shop('inv2', 333.33);
  const cases: Array<[string, any]> = [
    ['regra do serviço com percentagem em texto', { enabled: true, percent: 80, rules: { 'GW:STANDARD': { enabled: true, percent: 'x' } } }],
    ['regra com percentagem > 100', { enabled: true, percent: 80, rules: { 'GW:STANDARD': { enabled: true, percent: 250 } } }],
    ['regra com enabled não booleano', { enabled: true, percent: 80, rules: { 'GW:STANDARD': { enabled: 'sim', percent: 100 } } }],
    ['regra geral do serviço inválida', { enabled: true, percent: 80, rules: { '*:STANDARD': { percent: 100 } } }],
    ['contêiner de regras corrompido (texto)', { enabled: true, percent: 80, rules: 'lixo' }],
    ['contêiner de regras corrompido (lista)', { enabled: true, percent: 80, rules: [1, 2] }],
    ['percentagem global inválida com regra válida', { enabled: true, percent: 'abc', rules: {} }],
  ];
  let allSafe = true; const info: any[] = [];
  for (const [name, cfg] of cases) {
    await setCfg(cfg);
    const q = await quote([s1.product.id, s2.product.id]);
    const o = q.services.find((x: any) => x.code === 'STANDARD');
    const price = o && o.available ? describeServiceOptionPrice(o, fmt) : null;
    const placed = await place([s1.product.id, s2.product.id], o?.shippingChargedToBuyer ?? null);
    const kids = placed.ok ? await Promise.all(placed.value.orders.map((x: any) => orderRow(x.id))) : [];
    const fee = Math.round(kids.reduce((s: number, k: any) => s + Number(k.shippingFee), 0) * 100) / 100;
    const ok = !!o && o.available === true
      // sem subsídio nenhum: o cliente paga o custo real (1333.33) e nenhum selo de subsídio/GRÁTIS aparece
      && o.shippingChargedToBuyer === 1333.33 && o.shippingMarketplaceSubsidy === 0 && o.shippingCoveredBy === null
      && price!.kind === 'paid' && !price!.note && !/GRÁTIS/.test(price!.text)
      // e o pedido cobra EXATAMENTE o cotado, sem 409
      && placed.ok && fee === 1333.33 && kids.every((k: any) => Number(k.shippingMarketplaceSubsidy) === 0 && !/NUSALI_/.test(k.shippingPolicyModeAtCheckout));
    if (!ok) { allSafe = false; info.push([name, o, price, placed.ok ? fee : (placed as any).error?.message]); }
  }
  report('X1 7 formas de configuração inválida: a cotação mostra o custo REAL (sem subsídio, sem "grátis" nem nota de subsídio) e o pedido cobra exatamente o cotado — nenhuma configuração corrompida vira desconto, nem preço diferente do mostrado', allSafe, info);
  await setCfg({ enabled: false, percent: 0, rules: { 'SN:STANDARD': { enabled: true, percent: 'x' }, 'GW:STANDARD': R(true, 50) } });
  const qIso = (await quote([s1.product.id])).services.find((x: any) => x.code === 'STANDARD');
  report('X2 regra inválida de OUTRO país (SN) não contamina o destino GW: a regra válida GW:STANDARD 50% continua a valer (cliente 500)', qIso.shippingChargedToBuyer === 500 && qIso.shippingMarketplaceSubsidy === 500);
  await setCfg({ enabled: true, percent: 80, rules: { 'GW:STANDARD': { enabled: true, percent: 'x' } } });
  const stale = await quote([s1.product.id]);
  const staleOpt = stale.services.find((x: any) => x.code === 'STANDARD');
  await setCfg({ enabled: true, percent: 80, rules: { 'GW:STANDARD': R(true, 50) } });
  const afterFix = await place([s1.product.id], staleOpt.shippingChargedToBuyer);
  report('X3 o cliente viu o preço (inválida: 1000) e a configuração foi CORRIGIDA antes de confirmar: 409 SHIPPING_QUOTE_CHANGED com o valor novo (500) — nunca cobra outro valor em silêncio', !afterFix.ok && (afterFix as any).error?.code === 'SHIPPING_QUOTE_CHANGED' && (afterFix as any).error?.details?.currentShippingChargedToBuyer === 500, (afterFix as any).error?.details);
  const ga = tokenFor(await kit.makeUser('GLOBAL_ADMIN'), 'GLOBAL_ADMIN');
  await setCfg({ enabled: true, percent: 80, rules: { 'GW:STANDARD': { enabled: true, percent: 'x' } } });
  const panel = await call('GET', '/admin/shipping-subsidy', ga);
  const eff = (panel.json.data.services || []).find((x: any) => x.countryCode === 'GW' && x.serviceCode === 'STANDARD');
  report('X4 o Super Admin VÊ o problema (problems) e a tabela do painel mostra EXATAMENTE o que o motor aplica: GW Standard = 0% com origem INVALID_RULE (nunca a global 80%), e a cotação real confirma 1000', panel.json.data.problems.length >= 1 && /inválida/.test(panel.json.data.problems[0]) && eff?.source === 'INVALID_RULE' && eff?.effectivePercent === 0 && panel.json.data.invalidRuleKeys.includes('GW:STANDARD') && (await quote([s1.product.id])).services.find((x: any) => x.code === 'STANDARD').shippingChargedToBuyer === 1000, eff);

  // ================= 3. país da regra = país de DESTINO
  await db.update(sellers).set({ countryCode: 'SN' } as any).where(eq(sellers.id, s1.seller.sellerId));
  await setCfg({ enabled: false, percent: 0, rules: { 'SN:STANDARD': R(true, 100), 'GW:STANDARD': R(true, 50), 'BR:STANDARD': R(true, 100) } });
  const viaHttp = await call('POST', '/shipping/preview-cart', null, { destinationShippingSectorId: bissau.id, serviceCode: 'STANDARD', items: [{ productId: s1.product.id, variantId: null, quantity: 1 }] }, { 'X-Country-Code': 'BR' });
  const svcHttp = viaHttp.json?.data?.services?.find((x: any) => x.code === 'STANDARD');
  report('D1 vendedor registado em SN e catálogo escolhido = BR (cabeçalho X-Country-Code): a regra aplicada é a do DESTINO (setor de Bissau, GW) = 50%, nunca a de SN (100) nem a de BR (100)', viaHttp.status === 200 && svcHttp?.shippingChargedToBuyer === 500 && svcHttp?.shippingMarketplaceSubsidy === 500, viaHttp.json);
  const placedD = await place([s1.product.id], 500);
  const rowD = placedD.ok ? await orderRow(placedD.value.orders[0].id) : null;
  report('D2 o PEDIDO usa o mesmo país de destino: cobra 500 e o snapshot é CUSTOMER_PAYS+NUSALI_50PCT_CS (regra país+serviço de GW)', placedD.ok && Number(rowD!.shippingFee) === 500 && rowD!.shippingPolicyModeAtCheckout === 'CUSTOMER_PAYS+NUSALI_50PCT_CS', rowD && [rowD.shippingFee, rowD.shippingPolicyModeAtCheckout]);
  await setCfg({ enabled: false, percent: 0, rules: { 'SN:STANDARD': R(true, 100), 'BR:STANDARD': R(true, 100) } });
  const noGw = (await quote([s1.product.id])).services.find((x: any) => x.code === 'STANDARD');
  report('D3 sem regra para o destino (GW) e com regras só para SN/BR: NENHUM subsídio (cliente 1000) — regras de outros países nunca vazam para a entrega em GW', noGw.shippingChargedToBuyer === 1000 && noGw.shippingMarketplaceSubsidy === 0);
  const pricing = src('src/server/modules/shipping/shippingPreviewService.ts'), ordSrc = src('src/server/modules/orders/orderService.ts');
  report('D4 código: cotação usa countryCode = país do SETOR de destino (sectorRow.countryCode) e o pedido usa destinationCountry (do endereço, validado contra o setor pelo F4); nenhum dos dois lê cabeçalho de catálogo nem sellers.countryCode', pricing.includes('sectorRow.countryCode, input.destinationShippingSectorId, nusaliSetting') && pricing.includes('countryCode: destSector?.countryCode ?? null') && ordSrc.includes('countryCode: destinationCountry, serviceCode: groupServiceCode') && !/x-country-code/i.test(pricing) && !/sellers?\.countryCode|seller\.countryCode/.test(src('src/server/modules/shipping/shippingCalculatorService.ts')));
  const mismatch = await (async () => {
    const buyer = await kit.makeBuyer(bissau.id);
    await kit.addToCart(buyer.cartId, s1.product.id, 1, 5000);
    await db.update(schema.addresses).set({ countryCode: 'SN' } as any).where(eq(schema.addresses.id, buyer.addressId));
    try { await OrderService.createOrderFromCart({ userId: buyer.buyerId, addressId: buyer.addressId, paymentMethod: 'pix', shippingSelection: { serviceCode: 'STANDARD', expectedShippingChargedToBuyer: 1000 } } as any, db); return 'created'; }
    catch (e: any) { return e?.code || e?.message?.slice(0, 80); }
  })();
  report('D5 endereço de outro país com setor de GW: o pedido é RECUSADO (nunca aplica regra de um país a uma entrega de outro)', mismatch !== 'created', mismatch);

  // ================= 4. nada grava sem ação explícita do Super Admin
  await setCfg({ enabled: false, percent: 0, rules: { 'GW:ECONOMY': R(true, 100) } });
  const snap = async () => JSON.stringify([await cfgRow(), (await db.select().from(auditLogs)).filter((a: any) => a.action === 'admin.shipping_subsidy.updated').length, (await db.select().from(platformSettings)).sort((a: any, b: any) => a.key.localeCompare(b.key))]);
  const before = await snap();
  const buyerTok = tokenFor(await kit.makeUser('BUYER'), 'BUYER'), sellerTok = tokenFor(await kit.makeUser('SELLER'), 'SELLER'), adminTok = tokenFor(await kit.makeUser('ADMIN'), 'ADMIN');
  for (let i = 0; i < 3; i++) { await call('GET', '/admin/shipping-subsidy', ga); await call('GET', '/admin/shipping-subsidy/history', ga); }
  report('W1 abrir o painel (GET config/histórico, repetido) NÃO grava nada: configuração, auditoria e todas as settings idênticas', (await snap()) === before);
  const refused: Array<Promise<any>> = [
    call('PUT', '/admin/shipping-subsidy', ga, { enabled: true, percent: 100, rules: { 'GW:ECONOMY': R(true, 100) } }),
    call('PUT', '/admin/shipping-subsidy', ga, { enabled: true, percent: 100, confirmImpact: false }),
    call('PUT', '/admin/shipping-subsidy', null, { enabled: true, percent: 100, confirmImpact: true }),
    call('PUT', '/admin/shipping-subsidy', buyerTok, { enabled: true, percent: 100, confirmImpact: true }),
    call('PUT', '/admin/shipping-subsidy', sellerTok, { enabled: true, percent: 100, confirmImpact: true }),
    call('PUT', '/admin/shipping-subsidy', adminTok, { enabled: true, percent: 100, confirmImpact: true }),
    call('POST', '/admin/settings', ga, { shippingNusaliSubsidy: { enabled: true, percent: 100 } }),
    call('PUT', '/admin/shipping-subsidy', ga, { enabled: true, percent: 100, confirmImpact: true, rules: { 'GW:TURBO': R(true, 5) } }),
  ];
  const refusedRes = await Promise.all(refused);
  report('W2 tentativas sem ação válida do Super Admin (sem confirmação, sem login, comprador, vendedor, ADMIN comum, endpoint genérico, regra inválida) são RECUSADAS (400/401/403) e nada é gravado', refusedRes.every((r) => [400, 401, 403].includes(r.status)) && (await snap()) === before, refusedRes.map((r) => r.status));
  const okPut = await call('PUT', '/admin/shipping-subsidy', ga, { enabled: false, percent: 0, confirmImpact: true, rules: { 'GW:ECONOMY': R(true, 100), 'GW:STANDARD': R(true, 50) } });
  report('W3 só a ação explícita (PUT com confirmImpact por GLOBAL_ADMIN) grava — e deixa exatamente 1 linha de auditoria nova', okPut.status === 200 && (await snap()) !== before && (await db.select().from(auditLogs)).filter((a: any) => a.action === 'admin.shipping_subsidy.updated').length === 1);
  // nenhum outro código de servidor grava a chave
  const writers: string[] = [];
  const walk = (dir: string) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = `${dir}/${e.name}`; if (e.isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(e.name)) { const t = src(p); if (/(insert|update|delete)\([^)]*platformSettings[\s\S]{0,400}(NUSALI_SUBSIDY_SETTING_KEY|shippingNusaliSubsidy)|NUSALI_SUBSIDY_SETTING_KEY[\s\S]{0,300}onConflictDoUpdate/.test(t)) writers.push(p); } } };
  walk('src');
  report('W4 o único código que escreve a chave do subsídio é o serviço administrativo (nenhum seed, arranque, rota de pedido, cotação ou migração a grava)', writers.length === 1 && writers[0].endsWith('shippingSubsidyAdminService.ts'), writers);
  const seedSrc = src('src/db/seed.ts');
  report('W5 seed/arranque não mencionam o subsídio; as migrações existentes também não (sem migração nova nesta mudança)', !/shippingNusaliSubsidy|NUSALI_SUBSIDY/.test(seedSrc) && !fs.readdirSync('drizzle').some((f) => f.endsWith('.sql') && /shippingNusaliSubsidy/.test(src(`drizzle/${f}`))) && fs.readdirSync('drizzle').filter((f) => f.endsWith('.sql') && !f.includes('rollback')).length === 39);
  const manager = src('src/components/admin/AdminShippingSubsidyManager.tsx');
  const putCalls = (manager.match(/AdminApi\.updateShippingSubsidy\(/g) || []).length;
  report('W6 painel: editar regras/percentagem só altera um RASCUNHO local; o único ponto que envia PUT é save(), acionado só pelo botão "Confirmar e guardar", que fica desativado até marcar "Entendo o impacto" — sem auto-guardar, sem efeito ao abrir', putCalls === 1 && /const save = async \(\) =>/.test(manager) && /onClick=\{save\} disabled=\{!understood \|\| saving\}/.test(manager) && !/useEffect\(\(\) => \{[^}]*updateShippingSubsidy/.test(manager) && manager.includes('setConfirming(true)') && !/onChange=\{[^}]*updateShippingSubsidy/.test(manager));
  const fin = await readShippingSubsidyConfig(db);
  report('W7 a política padrão de pedidos não foi tocada pelo painel nesta sequência (modo padrão continua não configurado: nenhuma transição para CUSTOMER_PAYS/legado)', fin.legacyDefaultMode === null && (await db.select().from(platformSettings).where(eq(platformSettings.key, MODE_KEY))).length === 0);

  server.close();
  console.log(`\n${passed}/${total} passaram`);
  await pool.end();
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
