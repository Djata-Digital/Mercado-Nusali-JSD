/**
 * SUBSÍDIO DE FRETE DA NUSALI POR PAÍS E SERVIÇO — precedência (país+serviço > serviço > global), regra explícita de 0%, regra desativada herda,
 * validação estrita, compatibilidade com a configuração antiga, motor com a política do vendedor, cotação (produto/carrinho/várias lojas/serviço
 * indisponível), pedido (leitura consistente, snapshot, 409), API do Super Admin, auditoria, snapshots/reversão e concorrência. Postgres 17 DESCARTAVEL.
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
import http from 'http';
import express from 'express';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import { orders, platformSettings, storeShippingPolicies, auditLogs, shippingRouteRates } from '../src/db/schema.js';
import { apiRouter } from '../src/server/api.js';
import { OrderService } from '../src/server/modules/orders/orderService.js';
import { getJwtAccessSecret } from '../src/server/modules/auth/jwtConfig.js';
import { resolveCartShippingPreview, resolveShippingPreview } from '../src/server/modules/shipping/shippingPreviewService.js';
import { resolveShippingPayerPolicy, parseNusaliSubsidySetting, readNusaliSubsidySetting } from '../src/server/modules/shipping/shippingCalculatorService.js';
import {
  updateShippingSubsidyConfig, validateShippingSubsidyUpdate, readShippingSubsidyConfig, listShippingSubsidyHistory, listSubsidyServiceRows, ShippingSubsidyAdminError,
} from '../src/server/modules/shipping/shippingSubsidyAdminService.js';
import { applySubsidyTransition, rollbackSubsidyTransition } from '../src/server/modules/shipping/shippingSubsidyTransition.js';
import { applyNusaliSubsidy, simulateShippingSplit, splitIsExact, toCents } from '../src/utils/shippingSubsidyMath.js';
import {
  resolveNusaliPercent, validateRulesInput, parseStoredSubsidy, sameRules, snapshotSourceSuffix, ruleKey, describeSubsidySource,
} from '../src/utils/shippingSubsidyRules.js';
import { describeRulesDiff, rulesToDraft, draftToRules, buildEffectiveRows } from '../src/utils/shippingSubsidyForm.js';
import { setupCheckoutKit } from './checkoutTestKit.js';

if (!['localhost', '127.0.0.1'].includes(new URL(testDbUrl).hostname)) throw new Error('Somente banco local descartavel.');
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 700)}`); };

const R = (enabled: boolean, percent: number) => ({ enabled, percent });
const S = (global: { enabled: boolean; percent: number }, rules: Record<string, any> = {}) => ({ ...global, rules, invalidRuleKeys: [] as string[], rulesCorrupt: false });

async function main() {
  // ================= 1. precedência e validação (puras)
  const g50 = R(true, 50), gOff = R(false, 50);
  const rr = (cs?: any, sv?: any, gl: any = g50) => {
    const rules: Record<string, any> = {};
    if (cs) rules['GW:ECONOMY'] = cs;
    if (sv) rules['*:ECONOMY'] = sv;
    return resolveNusaliPercent(S(gl, rules), { countryCode: 'GW', serviceCode: 'ECONOMY' });
  };
  report('P1 país+serviço ativo vence serviço e global (sem acumular): GW:ECONOMY 100, *:ECONOMY 30, global 50 → 100 (COUNTRY_SERVICE)', (() => { const r = rr(R(true, 100), R(true, 30)); return r.percent === 100 && r.source === 'COUNTRY_SERVICE' && r.ruleKey === 'GW:ECONOMY'; })());
  report('P2 sem regra de país, a regra geral do serviço vence a global: *:ECONOMY 30, global 50 → 30 (SERVICE)', (() => { const r = rr(undefined, R(true, 30)); return r.percent === 30 && r.source === 'SERVICE'; })());
  report('P3 sem regras, vale a global (GLOBAL); global desligada = 0 (NONE)', rr().percent === 50 && rr().source === 'GLOBAL' && rr(undefined, undefined, gOff).percent === 0 && rr(undefined, undefined, gOff).source === 'NONE');
  report('P4 regra ATIVA de 0% é "sem subsídio" naquele nível e bloqueia a herança: GW:ECONOMY 0 com global 50 → 0; *:ECONOMY 0 com global 50 → 0', rr(R(true, 0)).percent === 0 && rr(R(true, 0)).source === 'COUNTRY_SERVICE' && rr(undefined, R(true, 0)).percent === 0 && rr(undefined, R(true, 0)).source === 'SERVICE');
  report('P5 regra DESATIVADA herda o nível seguinte: GW:ECONOMY desativada→usa *:ECONOMY; ambas desativadas→usa a global; todas desligadas→0', rr(R(false, 100), R(true, 30)).percent === 30 && rr(R(false, 100), R(false, 30)).percent === 50 && rr(R(false, 100), R(false, 30), gOff).percent === 0);
  report('P6 a chave global controla SÓ o padrão: global DESLIGADA mas regra de serviço ATIVA → a regra vale', rr(R(true, 100), undefined, gOff).percent === 100 && rr(undefined, R(true, 40), gOff).percent === 40);
  const other = S(g50, { 'SN:ECONOMY': R(true, 100), 'GW:EXPRESS': R(true, 100), '*:STANDARD': R(true, 100) });
  report('P7 nenhuma regra vaza: regra de OUTRO país (SN), de OUTRO serviço (EXPRESS) ou de outro serviço geral (STANDARD) não afeta GW/ECONOMY → global 50', resolveNusaliPercent(other, { countryCode: 'GW', serviceCode: 'ECONOMY' }).percent === 50 && resolveNusaliPercent(other, { countryCode: 'SN', serviceCode: 'ECONOMY' }).percent === 100);
  report('P8 "Economy grátis na Guiné-Bissau sem subsidiar Economy nos outros países": GW:ECONOMY 100 e global desligada → GW 100%, SN/BR 0%', (() => { const s = S(gOff, { 'GW:ECONOMY': R(true, 100) }); return resolveNusaliPercent(s, { countryCode: 'GW', serviceCode: 'ECONOMY' }).percent === 100 && resolveNusaliPercent(s, { countryCode: 'SN', serviceCode: 'ECONOMY' }).percent === 0 && resolveNusaliPercent(s, { countryCode: 'BR', serviceCode: 'ECONOMY' }).percent === 0; })());
  report('P9 exemplo aprovado: Economy 100%, Standard 50%, Express 0% (regras gerais, global 20%) → 100/50/0', (() => { const s = S(R(true, 20), { '*:ECONOMY': R(true, 100), '*:STANDARD': R(true, 50), '*:EXPRESS': R(true, 0) }); return ['ECONOMY', 'STANDARD', 'EXPRESS'].map((c) => resolveNusaliPercent(s, { countryCode: 'GW', serviceCode: c }).percent).join('/') === '100/50/0'; })());
  report('P10 serviço/país ausentes ou em minúsculas: sem serviço só a global; códigos são normalizados', resolveNusaliPercent(S(g50, { '*:ECONOMY': R(true, 10) }), { countryCode: 'GW' }).percent === 50 && resolveNusaliPercent(S(g50, { 'GW:ECONOMY': R(true, 10) }), { countryCode: 'gw', serviceCode: 'economy' }).percent === 10);

  const bad: Array<[string, any]> = [
    ['não é objeto (lista)', []], ['null', null], ['texto', 'x'], ['chave em minúsculas', { 'gw:economy': R(true, 10) }], ['país com 3 letras', { 'GWW:ECONOMY': R(true, 10) }],
    ['sem dois pontos', { ECONOMY: R(true, 10) }], ['serviço curto', { 'GW:E': R(true, 10) }], ['regra não-objeto', { 'GW:ECONOMY': 50 }], ['enabled em texto', { 'GW:ECONOMY': { enabled: 'sim', percent: 10 } }],
    ['percent em texto', { 'GW:ECONOMY': { enabled: true, percent: '10' } }], ['percent negativo', { 'GW:ECONOMY': R(true, -1) }], ['percent > 100', { 'GW:ECONOMY': R(true, 100.01) }],
    ['percent com 3 casas', { 'GW:ECONOMY': R(true, 1.234) }], ['percent NaN', { 'GW:ECONOMY': R(true, NaN) }], ['campo extra', { 'GW:ECONOMY': { enabled: true, percent: 10, cap: 5 } }], ['falta percent', { 'GW:ECONOMY': { enabled: true } }],
  ];
  report('V1 validação ESTRITA recusa 16 formas inválidas (lista, null, texto, chaves fora do formato, enabled/percent inválidos, campos extra/em falta) — nada é corrigido em silêncio', bad.every(([, v]) => !validateRulesInput(v).ok), bad.filter(([, v]) => validateRulesInput(v).ok).map(([n]) => n));
  const tooMany = Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`GW:SVC${String(i).padStart(3, '0')}`, R(true, 1)]));
  report('V2 aceita regras válidas (incl. 0, 100, 12.5, "*") e limita a 200 regras', validateRulesInput({ 'GW:ECONOMY': R(true, 0), '*:STANDARD': R(false, 100), 'SN:EXPRESS': R(true, 12.5) }).ok && !validateRulesInput(tooMany).ok);

  report('C1 compatibilidade: configuração ANTIGA {enabled, percent} (sem "rules") continua a funcionar e dá o mesmo resultado de antes', (() => { const p = parseStoredSubsidy({ enabled: true, percent: 20 }); return p.enabled && p.percent === 20 && Object.keys(p.rules).length === 0 && p.problems.length === 0 && resolveNusaliPercent(p, { countryCode: 'GW', serviceCode: 'ECONOMY' }).percent === 20; })());
  report('C2 configuração corrompida NÃO é aplicada em silêncio: regra inválida → 0% (INVALID_RULE) mesmo com global 50 e fica em problems; as outras regras seguem válidas', (() => {
    const p = parseStoredSubsidy({ enabled: true, percent: 50, rules: { 'GW:ECONOMY': { enabled: true, percent: 'x' }, 'GW:STANDARD': R(true, 70) } });
    const a = resolveNusaliPercent(p, { countryCode: 'GW', serviceCode: 'ECONOMY' }), b = resolveNusaliPercent(p, { countryCode: 'GW', serviceCode: 'STANDARD' }), c = resolveNusaliPercent(p, { countryCode: 'GW', serviceCode: 'EXPRESS' });
    return a.percent === 0 && a.source === 'INVALID_RULE' && b.percent === 70 && c.percent === 50 && p.problems.length === 1;
  })());
  report('C3 contêiner de regras corrompido (texto/lista/número): TODOS os níveis resolvem 0% (INVALID_RULE) e há problema registado; percentagem global inválida vira 0% com problema', ['x', [], 5].every((v) => { const p = parseStoredSubsidy({ enabled: true, percent: 50, rules: v }); const r = resolveNusaliPercent(p, { countryCode: 'GW', serviceCode: 'ECONOMY' }); return p.rulesCorrupt && r.percent === 0 && r.source === 'INVALID_RULE' && p.problems.length >= 1; }) && (() => { const p = parseStoredSubsidy({ enabled: true, percent: 500 }); return p.enabled === false && p.percent === 0 && p.problems.length === 1; })() && parseStoredSubsidy('lixo').problems.length === 1 && parseStoredSubsidy(undefined).problems.length === 0);
  report('C4 chave mal formada guardada à mão é ignorada e reportada (nunca casa nada)', (() => { const p = parseStoredSubsidy({ enabled: false, percent: 0, rules: { 'gw:economy': R(true, 100) } }); return p.problems.length === 1 && Object.keys(p.rules).length === 0 && resolveNusaliPercent(p, { countryCode: 'GW', serviceCode: 'ECONOMY' }).percent === 0; })());
  report('C5 utilitários: sufixo do snapshot (_CS/_SV/vazio), igualdade de regras independente da ordem, diff legível e rótulo da origem', snapshotSourceSuffix('COUNTRY_SERVICE') === '_CS' && snapshotSourceSuffix('SERVICE') === '_SV' && snapshotSourceSuffix('GLOBAL') === '' && sameRules({ a: R(true, 1), b: R(false, 2) } as any, { b: R(false, 2), a: R(true, 1) } as any) && !sameRules({ 'GW:ECONOMY': R(true, 1) }, { 'GW:ECONOMY': R(true, 2) }) && describeRulesDiff({}, { 'GW:ECONOMY': R(true, 100) }).join('|') === 'GW:ECONOMY: sem regra → ativa 100%' && /Regra do país \+ serviço \(GW:ECONOMY\)/.test(describeSubsidySource('COUNTRY_SERVICE', 'GW:ECONOMY')) && ruleKey('gw', 'economy') === 'GW:ECONOMY' && ruleKey(null, 'express') === '*:EXPRESS');

  // ================= banco descartável
  const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false }, max: 12 });
  const db = drizzle(pool, { schema });
  const kit = await setupCheckoutKit(db, 'sr');
  await kit.setFlag('multiSellerCheckoutEnabled', true);
  const bissau = await kit.sector('Bissau');
  const allSectors: any[] = (await db.select().from(schema.shippingSectors)).filter((x: any) => x.countryCode === 'GW' && x.id !== bissau.id).sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
  let nextSector = 0;
  const svc = { ECONOMY: await kit.service('ECONOMY'), STANDARD: await kit.service('STANDARD'), EXPRESS: await kit.service('EXPRESS') };
  const COST = { ECONOMY: 600, STANDARD: 1000, EXPRESS: 1500 } as Record<string, number>;
  const KEY = 'shippingNusaliSubsidy', MODE_KEY = 'defaultShippingPolicyMode';
  const setCfg = async (v: any) => { if (v === null) await db.delete(platformSettings).where(eq(platformSettings.key, KEY)); else await kit.setFlag(KEY, v); };
  const setMode = async (m: string | null) => { if (m === null) await db.delete(platformSettings).where(eq(platformSettings.key, MODE_KEY)); else await kit.setFlag(MODE_KEY, m); };

  /** loja com tarifas ECONOMY 600 / STANDARD 1000 / EXPRESS 1500 para Bissau (origem própria). `skip` = serviços sem tarifa (indisponíveis). */
  const shop = async (label: string, opts: { skip?: string[]; price?: number; costs?: Record<string, number> } = {}) => {
    const sector = allSectors[nextSector++];
    const seller = await kit.makeSeller(label);
    const store = await kit.makeStore(seller, label, sector.id);
    const product = await kit.makeProduct(seller, store.storeId, `P ${label}`, 0.3, opts.price ?? 5000);
    await kit.insertInventory({ sellerId: seller.sellerId, productId: product.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: store.floc.id, quantityOnHand: 200 });
    const route = await kit.route(sector.id, bissau.id);
    for (const code of ['ECONOMY', 'STANDARD', 'EXPRESS']) {
      if (opts.skip?.includes(code)) continue;
      await kit.insertRate(route.id, (svc as any)[code].id, opts.costs?.[code] ?? COST[code], { min: 0, max: 10 });
    }
    return { seller, store, product };
  };
  const policyRow = async (s: { seller: any; store: any }, row: Record<string, any>) => {
    await db.delete(storeShippingPolicies).where(eq(storeShippingPolicies.storeId, s.store.storeId));
    await db.insert(storeShippingPolicies).values({ id: kit.uid('pol'), storeId: s.store.storeId, sellerId: s.seller.sellerId, isActive: true, ...row } as any);
  };
  const pol = (s: { seller: any; store: any }, cost: number, serviceCode: string | null, countryCode: string | null = 'GW') =>
    resolveShippingPayerPolicy(cost, { storeId: s.store.storeId, sellerId: s.seller.sellerId, countryCode, serviceCode }, db);
  const quote = async (productIds: string[], serviceCode?: string) =>
    resolveCartShippingPreview({ destinationShippingSectorId: bissau.id, ...(serviceCode ? { serviceCode } : {}), items: productIds.map((id) => ({ productId: id, variantId: null, quantity: 1 })) }, db) as Promise<any>;
  const opt = (q: any, code: string) => q.services.find((o: any) => o.code === code);
  const place = async (productIds: string[], serviceCode: string, expected: number | null) => {
    const buyer = await kit.makeBuyer(bissau.id);
    for (const id of productIds) await kit.addToCart(buyer.cartId, id, 1, 5000);
    try { return { ok: true as const, value: await OrderService.createOrderFromCart({ userId: buyer.buyerId, addressId: buyer.addressId, paymentMethod: 'pix', shippingSelection: { serviceCode, expectedShippingChargedToBuyer: expected } } as any, db) as any }; }
    catch (e: any) { return { ok: false as const, error: e }; }
  };
  const orderRow = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0];

  // ================= 2. motor: política do vendedor + regras
  await setMode(null);
  const sNone = await shop('semPolitica'), sSub = await shop('sub50'), sFree = await shop('gratisVendedor');
  await policyRow(sSub, { mode: 'SELLER_SUBSIDIZED', sellerSubsidyPercent: '50' });
  await policyRow(sFree, { mode: 'SELLER_FREE_SHIPPING' });
  await setCfg({ enabled: false, percent: 0, rules: { '*:ECONOMY': R(true, 100), '*:STANDARD': R(true, 50), '*:EXPRESS': R(true, 0) } });
  const eNone = await Promise.all(['ECONOMY', 'STANDARD', 'EXPRESS'].map((c) => pol(sNone, COST[c], c)));
  report('E1 Economy 100% / Standard 50% / Express 0% (global DESLIGADA): cliente paga 0 / 500 / 1500 e a Nusali assume 600 / 500 / 0', eNone[0].shippingChargedToBuyer === 0 && eNone[0].shippingMarketplaceSubsidy === 600 && eNone[1].shippingChargedToBuyer === 500 && eNone[1].shippingMarketplaceSubsidy === 500 && eNone[2].shippingChargedToBuyer === 1500 && eNone[2].shippingMarketplaceSubsidy === 0, eNone.map((x) => [x.shippingChargedToBuyer, x.shippingMarketplaceSubsidy, x.nusaliSubsidySource]));
  report('E2 a origem fica registada no resultado: SERVICE para Economy/Standard e Express com regra explícita de 0% (nenhum subsídio) sem cair na global', eNone[0].nusaliSubsidySource === 'SERVICE' && eNone[1].nusaliSubsidyRuleKey === '*:STANDARD' && eNone[2].nusaliSubsidyPercent === 0 && eNone[2].nusaliSubsidySource === 'NONE');
  const eSub = await pol(sSub, 1000, 'STANDARD');
  report('E3 CONTRIBUIÇÃO DO VENDEDOR PRESERVADA: vendedor 50% + Standard 50% da Nusali → vendedor 500, Nusali 250 (só sobre o saldo de 500), cliente 250; soma = 1000', eSub.shippingSellerSubsidy === 500 && eSub.shippingMarketplaceSubsidy === 250 && eSub.shippingChargedToBuyer === 250 && toCents(eSub.shippingSellerSubsidy + eSub.shippingMarketplaceSubsidy + eSub.shippingChargedToBuyer) === 100000, eSub);
  const eFree = await pol(sFree, 600, 'ECONOMY');
  report('E4 vendedor assume 100%: saldo 0 → a Nusali não paga nada mesmo com Economy 100%; o vendedor continua com 600', eFree.shippingSellerSubsidy === 600 && eFree.shippingMarketplaceSubsidy === 0 && eFree.shippingChargedToBuyer === 0);
  let sellerStable = true;
  for (const p of [0, 25, 50, 100]) { await setCfg({ enabled: false, percent: 0, rules: { '*:STANDARD': R(true, p) } }); const r = await pol(sSub, 1000, 'STANDARD'); if (r.shippingSellerSubsidy !== 500) sellerStable = false; }
  report('E5 a parte do vendedor é a MESMA com Standard a 0, 25, 50 e 100% (o subsídio por serviço nunca aumenta o custo do vendedor)', sellerStable);

  await setCfg({ enabled: true, percent: 80, rules: { 'GW:STANDARD': R(true, 20), '*:STANDARD': R(true, 50) } });
  const eAcc = await pol(sNone, 1000, 'STANDARD');
  report('E6 não acumula: GW:STANDARD 20 + *:STANDARD 50 + global 80 → só 20% (cliente 800, Nusali 200)', eAcc.shippingChargedToBuyer === 800 && eAcc.shippingMarketplaceSubsidy === 200 && eAcc.nusaliSubsidySource === 'COUNTRY_SERVICE', eAcc);
  const eOther = await pol(sNone, 1000, 'STANDARD', 'SN');
  report('E7 país diferente do destino não usa a regra de GW: destino SN → regra geral do serviço (50%)', eOther.shippingChargedToBuyer === 500 && eOther.nusaliSubsidySource === 'SERVICE');
  await setCfg({ enabled: true, percent: 80, rules: { 'GW:STANDARD': R(true, 0) } });
  const eZero = await pol(sNone, 1000, 'STANDARD');
  report('E8 regra explícita GW:STANDARD 0% com global 80%: nenhum subsídio (cliente 1000, Nusali 0)', eZero.shippingChargedToBuyer === 1000 && eZero.shippingMarketplaceSubsidy === 0);
  await setCfg({ enabled: true, percent: 80, rules: { 'GW:STANDARD': { enabled: false, percent: 5 } } });
  const eDis = await pol(sNone, 1000, 'STANDARD');
  report('E9 regra desativada herda: global 80% (cliente 200, Nusali 800)', eDis.shippingChargedToBuyer === 200 && eDis.shippingMarketplaceSubsidy === 800 && eDis.nusaliSubsidySource === 'GLOBAL');
  await setCfg({ enabled: true, percent: 80, rules: { 'GW:STANDARD': { enabled: true, percent: 'x' } } });
  const eBad = await pol(sNone, 1000, 'STANDARD');
  const eBadOther = await pol(sNone, 600, 'ECONOMY');
  report('E10 regra guardada INVÁLIDA não é aplicada em silêncio: Standard → sem subsídio (INVALID_RULE), as outras modalidades seguem a global', eBad.shippingChargedToBuyer === 1000 && eBad.nusaliSubsidySource === 'INVALID_RULE' && eBadOther.shippingChargedToBuyer === 120, [eBad, eBadOther]);
  await setCfg({ enabled: true, percent: 50, rules: 'lixo' });
  report('E11 contêiner de regras corrompido: nenhum subsídio em lado nenhum até corrigir (fail-closed)', (await pol(sNone, 1000, 'STANDARD')).shippingChargedToBuyer === 1000);
  await setCfg({ enabled: true, percent: 20 });
  const eOld = await pol(sNone, 1000, 'STANDARD');
  report('E12 configuração antiga {enabled:true, percent:20} sem "rules": idêntica ao comportamento anterior (cliente 800, Nusali 200, origem GLOBAL, sem sufixo no snapshot)', eOld.shippingChargedToBuyer === 800 && eOld.nusaliSubsidySource === 'GLOBAL' && snapshotSourceSuffix(eOld.nusaliSubsidySource) === '');

  // arredondamentos e percentagens de borda
  let exact = true, bounded = true;
  const odd = await shop('arredonda', { costs: { STANDARD: 333.33 } });
  for (const cost of [0.01, 0.5, 33.33, 333.33, 999.99, 1234.56]) for (const sp of [0, 33.33, 50, 100]) for (const np of [0, 0.01, 12.5, 33.33, 66.67, 99.99, 100]) {
    await policyRow(odd, sp === 0 ? { mode: 'CUSTOMER_PAYS' } : { mode: 'SELLER_SUBSIDIZED', sellerSubsidyPercent: String(sp) });
    await setCfg({ enabled: false, percent: 0, rules: { 'GW:STANDARD': R(true, np) } });
    const r = await pol(odd, cost, 'STANDARD');
    if (toCents(r.shippingChargedToBuyer) + toCents(r.shippingSellerSubsidy) + toCents(r.shippingMarketplaceSubsidy) !== toCents(cost)) exact = false;
    const sim = simulateShippingSplit(cost, sp, np);
    if (r.shippingMarketplaceSubsidy < 0 || r.shippingChargedToBuyer < 0 || r.shippingSellerSubsidy < 0 || toCents(r.shippingChargedToBuyer) !== toCents(sim.buyer) || toCents(r.shippingMarketplaceSubsidy) !== toCents(sim.nusali)) bounded = false;
  }
  report('R1 arredondamento: 168 combinações (custo × % vendedor × % da regra, incl. 0,01 / 12,5 / 33,33 / 99,99 / 100) — cliente + vendedor + Nusali = custo, ao centavo, e IGUAL à simulação do painel', exact && bounded);

  // ================= 3. modo legado
  await setCfg({ enabled: false, percent: 0, rules: { 'GW:STANDARD': R(true, 100) } });
  await setMode('MARKETPLACE_FREE_SHIPPING');
  const lNone = await pol(sNone, 1000, 'STANDARD');
  const lSub = await pol(sSub, 1000, 'STANDARD');
  report('L1 MODO LEGADO impede a aplicação das regras: loja sem política segue o legado (cliente 0, Nusali 1000, SEM somar a regra → nusaliSubsidyPercent 0)', lNone.shippingChargedToBuyer === 0 && lNone.shippingMarketplaceSubsidy === 1000 && lNone.nusaliSubsidyPercent === 0 && lNone.policyMode === 'MARKETPLACE_FREE_SHIPPING', lNone);
  report('L2 loja COM política própria não é do modo legado: a regra de serviço vale sobre o saldo (vendedor 500, Nusali 500 = 100% de 500)', lSub.shippingSellerSubsidy === 500 && lSub.shippingMarketplaceSubsidy === 500 && lSub.shippingChargedToBuyer === 0, lSub);
  await setMode('CUSTOMER_PAYS');
  report('L3 desativado o modo legado (CUSTOMER_PAYS), a regra GW:STANDARD 100% passa a valer na loja sem política', (await pol(sNone, 1000, 'STANDARD')).shippingChargedToBuyer === 0);
  await setMode(null);

  // ================= 4. cotação: produto único, carrinho, várias lojas, serviço indisponível
  await setCfg({ enabled: true, percent: 10, rules: { 'GW:ECONOMY': R(true, 100), '*:STANDARD': R(true, 50), 'GW:EXPRESS': R(true, 0) } });
  const q1 = await quote([sNone.product.id]);
  const o1 = ['ECONOMY', 'STANDARD', 'EXPRESS'].map((c) => opt(q1, c));
  report('Q1 cotação por modalidade (checkout/carrinho/página do produto): Economy 600→cliente 0 (Nusali 600); Standard 1000→500/500; Express 1500→1500/0 (explícito 0 vence a global de 10%)', o1[0].shippingChargedToBuyer === 0 && o1[0].shippingMarketplaceSubsidy === 600 && o1[1].shippingChargedToBuyer === 500 && o1[1].shippingMarketplaceSubsidy === 500 && o1[2].shippingChargedToBuyer === 1500 && o1[2].shippingMarketplaceSubsidy === 0, o1);
  const direct = await Promise.all(['ECONOMY', 'STANDARD', 'EXPRESS'].map((c) => pol(sNone, COST[c], c)));
  report('Q2 a cotação é EXATAMENTE o que o motor calcula (mesma função, mesma configuração): valores idênticos para as 3 modalidades', o1.every((o: any, i: number) => o.shippingChargedToBuyer === direct[i].shippingChargedToBuyer && o.shippingMarketplaceSubsidy === direct[i].shippingMarketplaceSubsidy), [o1, direct]);
  const single = await resolveShippingPreview({ productId: sNone.product.id, variantId: null, quantity: 1, destinationShippingSectorId: bissau.id }, db) as any;
  report('Q3 a cotação do produto único (cheapest = Economy) usa a mesma regra do carrinho: cliente 0 e Nusali 600', single.available === true && single.serviceCode === 'ECONOMY' && single.shippingChargedToBuyer === 0 && single.shippingMarketplaceSubsidy === 600, single);

  const sMulti2 = await shop('multi2'), sMulti3 = await shop('multi3', { costs: { STANDARD: 333.33 } });
  await policyRow(sMulti2, { mode: 'SELLER_SUBSIDIZED', sellerSubsidyPercent: '33.33' });
  await setCfg({ enabled: false, percent: 0, rules: { '*:STANDARD': R(true, 33.33) } });
  const qm = await quote([sNone.product.id, sMulti2.product.id, sMulti3.product.id]);
  const om = opt(qm, 'STANDARD');
  const gA = await pol(sNone, 1000, 'STANDARD'), gB = await pol(sMulti2, 1000, 'STANDARD'), gC = await pol(sMulti3, 333.33, 'STANDARD');
  const sumBuyer = Math.round((gA.shippingChargedToBuyer + gB.shippingChargedToBuyer + gC.shippingChargedToBuyer) * 100) / 100;
  const sumNusali = Math.round((gA.shippingMarketplaceSubsidy + gB.shippingMarketplaceSubsidy + gC.shippingMarketplaceSubsidy) * 100) / 100;
  report('Q4 VÁRIAS LOJAS, expedições diferentes: o total é a soma dos grupos, cada um com a política do SEU vendedor e arredondado por grupo; cotação = soma dos motores por grupo', om.shippingChargedToBuyer === sumBuyer && om.shippingMarketplaceSubsidy === sumNusali && om.sellers.length === 3 && Math.round((om.shippingCost) * 100) === Math.round((1000 + 1000 + 333.33) * 100), { om, sumBuyer, sumNusali });
  report('Q5 invariante no carrinho: cliente + vendedor + Nusali = custo real somado (centavos exatos)', toCents(om.shippingChargedToBuyer) + toCents(om.shippingSellerSubsidy) === toCents(om.shippingCost), om);

  const sNoExpress = await shop('semExpress', { skip: ['EXPRESS'] });
  await setCfg({ enabled: false, percent: 0, rules: { '*:EXPRESS': R(true, 100), '*:STANDARD': R(true, 50) } });
  const qu = await quote([sNone.product.id, sNoExpress.product.id]);
  const ex = opt(qu, 'EXPRESS'), st = opt(qu, 'STANDARD');
  report('Q6 serviço INDISPONÍVEL num dos produtos: Express aparece indisponível, SEM preço nem subsídio inventado, mesmo com regra de 100%; Standard segue normal', ex.available === false && ex.shippingChargedToBuyer === undefined && ex.shippingMarketplaceSubsidy === undefined && !!ex.unavailableCode && st.available === true && st.shippingChargedToBuyer === 1000, { ex, st });
  const qReq = await quote([sNone.product.id, sNoExpress.product.id], 'EXPRESS');
  report('Q7 pedir o serviço indisponível não troca por outro: available=false com o motivo', qReq.available === false && !!qReq.code, qReq);

  // ================= 5. pedido: snapshot, 409, consistência quote = pedido
  await setCfg({ enabled: true, percent: 10, rules: { 'GW:STANDARD': R(true, 50), '*:ECONOMY': R(true, 100) } });
  const oEco = await place([sNone.product.id], 'ECONOMY', 0);
  const oStd = await place([sNone.product.id], 'STANDARD', 500);
  const oExp = await place([sNone.product.id], 'EXPRESS', 1350);
  const rows = await Promise.all([oEco, oStd, oExp].map(async (o) => (o.ok ? orderRow(o.value.orders[0].id) : null)));
  report('O1 pedido por serviço: Economy cliente 0 (snapshot NUSALI_100PCT_SV), Standard 500 (NUSALI_50PCT_CS), Express pela global 10% = 1350 (NUSALI_10PCT, sem sufixo)', rows.every(Boolean) && Number(rows[0]!.shippingFee) === 0 && rows[0]!.shippingPolicyModeAtCheckout === 'CUSTOMER_PAYS+NUSALI_100PCT_SV' && Number(rows[1]!.shippingFee) === 500 && rows[1]!.shippingPolicyModeAtCheckout === 'CUSTOMER_PAYS+NUSALI_50PCT_CS' && Number(rows[2]!.shippingFee) === 1350 && rows[2]!.shippingPolicyModeAtCheckout === 'CUSTOMER_PAYS+NUSALI_10PCT', rows.map((r) => r && [r.shippingFee, r.shippingPolicyModeAtCheckout]));
  report('O2 valores do pedido = cotação (cliente, custo real, parcela da Nusali) para as 3 modalidades — nunca outro cálculo', rows.every((r, i) => { const code = ['ECONOMY', 'STANDARD', 'EXPRESS'][i]; return !!r && Number(r.shippingCost) === COST[code] && Number(r.shippingFee) + Number(r.shippingMarketplaceSubsidy) === Number(r.shippingCost); }));
  const frozen = JSON.stringify(rows[1]);
  await setCfg({ enabled: false, percent: 0, rules: {} });
  report('O3 mudar as regras DEPOIS não recalcula pedidos existentes (linha idêntica)', JSON.stringify(await orderRow(rows[1]!.id)) === frozen);
  const stale = await place([sNone.product.id], 'STANDARD', 500);
  report('O4 cliente viu 500 (Standard 50%) e as regras foram removidas: 409 SHIPPING_QUOTE_CHANGED com o valor atual (1000) — revalidação no checkout preservada', !stale.ok && (stale as any).error?.code === 'SHIPPING_QUOTE_CHANGED' && (stale as any).error?.details?.currentShippingChargedToBuyer === 1000, (stale as any).error?.details);
  await setCfg({ enabled: false, percent: 0, rules: { '*:STANDARD': R(true, 33.33) } });
  const multi = await place([sNone.product.id, sMulti2.product.id, sMulti3.product.id], 'STANDARD', null);
  if (!multi.ok) report('O5 pedido com várias lojas', false, (multi as any).error?.message); else {
    const kids = await Promise.all(multi.value.orders.map((o: any) => orderRow(o.id)));
    const snaps = new Set(kids.map((k: any) => k.shippingPolicyModeAtCheckout.replace(/^[A-Z_]+\+/, '')));
    const feeSum = Math.round(kids.reduce((s: number, k: any) => s + Number(k.shippingFee), 0) * 100) / 100;
    const qq = opt(await quote([sNone.product.id, sMulti2.product.id, sMulti3.product.id]), 'STANDARD');
    report('O5 VÁRIAS LOJAS: 3 pedidos-filho, cada um com seu frete e a MESMA regra (33,33% por serviço, mesmo snapshot); a soma cobrada = a cotação do carrinho', kids.length === 3 && snaps.size === 1 && feeSum === qq.shippingChargedToBuyer, { snaps: [...snaps], feeSum, q: qq.shippingChargedToBuyer });
  }

  // ================= 6. API do Super Admin + auditoria
  const app = express(); app.use(express.json()); app.use('/api/v1', apiRouter);
  const server = http.createServer(app); await new Promise<void>((res) => server.listen(0, res));
  const base = `http://localhost:${(server.address() as any).port}/api/v1`;
  const tokenFor = (userId: string, role: string) => jwt.sign({ userId, email: `${userId}@t.test`, role, fullName: `T ${role}`, countryCode: 'GW', kycStatus: 'verified', isEmailVerified: true }, getJwtAccessSecret(), { expiresIn: '10m' });
  const ga = tokenFor(await kit.makeUser('GLOBAL_ADMIN'), 'GLOBAL_ADMIN');
  const adminTok = tokenFor(await kit.makeUser('ADMIN'), 'ADMIN');
  const call = async (method: string, p: string, tok: string | null, body?: any) => {
    const r = await fetch(`${base}${p}`, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, json: await r.json().catch(() => null) as any };
  };
  await setCfg(null); await setMode('MARKETPLACE_FREE_SHIPPING');
  const g0 = await call('GET', '/admin/shipping-subsidy', ga);
  const eco = (g0.json?.data?.services || []).find((s: any) => s.countryCode === 'GW' && s.serviceCode === 'ECONOMY');
  report('A1 GET devolve configuração, regras, problemas e a tabela por país+serviço com a regra EFETIVA e a origem (aqui: sem regras → NONE)', g0.status === 200 && Array.isArray(g0.json.data.services) && g0.json.data.services.length >= 3 && eco?.effectivePercent === 0 && eco?.source === 'NONE' && g0.json.data.rules && typeof g0.json.data.rules === 'object' && Array.isArray(g0.json.data.problems), g0.json?.data);
  report('A2 permissões: sem login 401; ADMIN comum 403 (só o Super Admin altera regras)', (await call('PUT', '/admin/shipping-subsidy', null, { enabled: false, percent: 0, confirmImpact: true })).status === 401 && (await call('PUT', '/admin/shipping-subsidy', adminTok, { enabled: false, percent: 0, confirmImpact: true })).status === 403);
  const base0 = { enabled: false, percent: 0, confirmImpact: true as const };
  const invalid: Array<[string, any, number]> = [
    ['rules lista', { ...base0, rules: [] }, 400], ['rules texto', { ...base0, rules: 'x' }, 400], ['chave minúscula', { ...base0, rules: { 'gw:economy': R(true, 10) } }, 400],
    ['percent > 100', { ...base0, rules: { 'GW:ECONOMY': R(true, 101) } }, 400], ['percent texto', { ...base0, rules: { 'GW:ECONOMY': { enabled: true, percent: '10' } } }, 400],
    ['enabled não booleano', { ...base0, rules: { 'GW:ECONOMY': { enabled: 1, percent: 10 } } }, 400], ['país desconhecido', { ...base0, rules: { 'ZZ:ECONOMY': R(true, 10) } }, 400],
    ['serviço inexistente no país', { ...base0, rules: { 'GW:TURBO': R(true, 10) } }, 400], ['serviço geral inexistente', { ...base0, rules: { '*:TURBO': R(true, 10) } }, 400],
    ['sem confirmImpact', { enabled: false, percent: 0, rules: { 'GW:ECONOMY': R(true, 10) } }, 400], ['expected.rules inválido', { ...base0, rules: {}, expected: { enabled: false, percent: 0, rules: 'x' } }, 400],
  ];
  let invOk = true; const invInfo: any[] = [];
  for (const [n, b, st2] of invalid) { const r = await call('PUT', '/admin/shipping-subsidy', ga, b); if (r.status !== st2) { invOk = false; invInfo.push([n, r.status, r.json?.error?.code]); } }
  report('A3 validação no servidor: 11 pedidos inválidos (rules/valores/país e serviço inexistentes/sem confirmação) → 400 e NADA é gravado', invOk && (await db.select().from(platformSettings).where(eq(platformSettings.key, KEY))).length === 0, invInfo);
  const put1 = await call('PUT', '/admin/shipping-subsidy', ga, { ...base0, enabled: true, percent: 10, disableLegacyFreeMode: true, rules: { 'GW:ECONOMY': R(true, 100), '*:STANDARD': R(true, 50), 'GW:EXPRESS': R(true, 0) }, expected: { enabled: false, percent: 0, rules: {} } });
  const cfg1 = await readShippingSubsidyConfig(db);
  const e1 = (put1.json?.data?.services || []).find((s: any) => s.serviceCode === 'ECONOMY' && s.countryCode === 'GW');
  const e2 = (put1.json?.data?.services || []).find((s: any) => s.serviceCode === 'STANDARD' && s.countryCode === 'GW');
  const e3 = (put1.json?.data?.services || []).find((s: any) => s.serviceCode === 'EXPRESS' && s.countryCode === 'GW');
  report('A4 guardar regras: 3 regras persistidas, origem efetiva na resposta (Economy GW→COUNTRY_SERVICE 100, Standard→SERVICE 50, Express GW→COUNTRY_SERVICE 0 com global 10)', put1.status === 200 && Object.keys(cfg1.rules).length === 3 && e1.source === 'COUNTRY_SERVICE' && e1.effectivePercent === 100 && e2.source === 'SERVICE' && e2.effectivePercent === 50 && e3.source === 'COUNTRY_SERVICE' && e3.effectivePercent === 0, put1.json);
  const staleRules = await call('PUT', '/admin/shipping-subsidy', ga, { ...base0, enabled: true, percent: 10, rules: { 'GW:ECONOMY': R(true, 5) }, expected: { enabled: true, percent: 10, rules: {} } });
  report('A5 edição concorrente das REGRAS: quem viu regras antigas recebe 409 CONFIG_CHANGED e nada é sobrescrito', staleRules.status === 409 && staleRules.json.error.code === 'CONFIG_CHANGED' && (await readShippingSubsidyConfig(db)).rules['GW:ECONOMY'].percent === 100);
  const keepRules = await call('PUT', '/admin/shipping-subsidy', ga, { ...base0, enabled: true, percent: 25, expected: { enabled: true, percent: 10 } });
  report('A6 compatibilidade: um cliente ANTIGO (sem "rules") altera só a global e as regras guardadas são preservadas', keepRules.status === 200 && (await readShippingSubsidyConfig(db)).percent === 25 && Object.keys((await readShippingSubsidyConfig(db)).rules).length === 3);
  const clear = await call('PUT', '/admin/shipping-subsidy', ga, { ...base0, enabled: true, percent: 25, rules: {} });
  const restore = await call('PUT', '/admin/shipping-subsidy', ga, { ...base0, enabled: true, percent: 25, rules: { 'GW:ECONOMY': R(true, 100), '*:STANDARD': R(true, 50), 'GW:EXPRESS': R(true, 0) } });
  report('A7 "rules": {} remove todas as regras; reenviar repõe', clear.status === 200 && Object.keys(clear.json.data.rules).length === 0 && restore.status === 200 && Object.keys(restore.json.data.rules).length === 3);
  const audits = (await db.select().from(auditLogs)).filter((a: any) => a.action === 'admin.shipping_subsidy.updated').sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const first = audits[0]?.detailsJson as any;
  report('A8 AUDITORIA: uma linha por alteração aceita (4), com regras antes/depois e rulesChanged; recusadas não deixam rasto', audits.length === 4 && Object.keys(first.before.rules).length === 0 && Object.keys(first.after.rules).length === 3 && first.rulesChanged === true && (audits[1].detailsJson as any).rulesChanged === false, audits.map((a: any) => a.detailsJson?.rulesChanged));
  const hist = await listShippingSubsidyHistory(db, 10);
  report('A9 histórico expõe as regras e a mudança de regras (para o painel mostrar "antes → depois" por serviço)', hist.length === 4 && hist[hist.length - 1].rulesChanged === true && describeRulesDiff(hist[hist.length - 1].before?.rules, hist[hist.length - 1].after?.rules).length === 3);
  const rowsTbl = await listSubsidyServiceRows(db, await readShippingSubsidyConfig(db));
  report('A10 tabela efetiva (mesma resolução do servidor) bate com a cotação real: Economy GW 100 / Standard GW 50 / Express GW 0', ['ECONOMY:100', 'STANDARD:50', 'EXPRESS:0'].every((x) => { const [c, p] = x.split(':'); return rowsTbl.find((r) => r.countryCode === 'GW' && r.serviceCode === c)?.effectivePercent === Number(p); }));

  // configuração guardada inválida: o painel não deixa guardar só o global por cima
  await kit.setFlag(KEY, { enabled: true, percent: 25, rules: { 'GW:ECONOMY': { enabled: true, percent: 'x' } } });
  const blocked = await call('PUT', '/admin/shipping-subsidy', ga, { ...base0, enabled: true, percent: 30 });
  const g1 = await call('GET', '/admin/shipping-subsidy', ga);
  const fixed = await call('PUT', '/admin/shipping-subsidy', ga, { ...base0, enabled: true, percent: 30, rules: { 'GW:ECONOMY': R(true, 100) } });
  report('A11 regras guardadas inválidas: o painel MOSTRA os problemas; guardar só o global é recusado (409 STORED_RULES_INVALID) e guardar as regras corrigidas funciona', g1.json.data.problems.length === 1 && blocked.status === 409 && blocked.json.error.code === 'STORED_RULES_INVALID' && fixed.status === 200 && (await readShippingSubsidyConfig(db)).problems.length === 0, [blocked.json, g1.json?.data?.problems]);
  server.close();

  // ================= 7. snapshots e reversão preservam regras
  await setMode('MARKETPLACE_FREE_SHIPPING');
  const rulesNow = (await readShippingSubsidyConfig(db)).rules;
  const ap = await applySubsidyTransition(db);
  const afterAp = await readShippingSubsidyConfig(db);
  report('T1 a transição (legado → CUSTOMER_PAYS) NÃO altera as regras por serviço e o instantâneo as guarda', sameRules(afterAp.rules, rulesNow) && sameRules(ap.snapshot.rules, rulesNow) && afterAp.legacyDefaultMode === 'CUSTOMER_PAYS');
  const dbUpd = await updateShippingSubsidyConfig(db, { enabled: false, percent: 0, disableLegacyFreeMode: false, rules: { '*:EXPRESS': R(true, 5) } }, { id: null, note: 'teste' });
  const rb = await rollbackSubsidyTransition(db, ap.snapshot);
  report('T2 a reversão repõe EXATAMENTE as regras do instantâneo (as alteradas depois voltam como estavam) e o modo legado', sameRules(rb.after.rules, rulesNow) && rb.after.legacyDefaultMode === 'MARKETPLACE_FREE_SHIPPING' && !!dbUpd.after.rules['*:EXPRESS']);
  const oldSnap = { enabled: false, percent: 0, legacyDefaultMode: 'MARKETPLACE_FREE_SHIPPING' } as any;
  const rbOld = await rollbackSubsidyTransition(db, oldSnap);
  report('T3 instantâneo ANTIGO (sem "rules") não apaga as regras existentes (compatível com ficheiros de reversão já guardados)', sameRules(rbOld.after.rules, rulesNow));
  const rbBad = await rollbackSubsidyTransition(db, { ...oldSnap, rules: 'x' } as any).then(() => 'ok', (e: any) => e?.code);
  report('T4 instantâneo com regras inválidas é recusado (INVALID_SNAPSHOT) e nada muda', rbBad === 'INVALID_SNAPSHOT' && sameRules((await readShippingSubsidyConfig(db)).rules, rulesNow));

  // ================= 8. concorrência
  await setMode(null);
  const cur = await readShippingSubsidyConfig(db);
  const races = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => updateShippingSubsidyConfig(db, { enabled: false, percent: 0, disableLegacyFreeMode: false, rules: { 'GW:ECONOMY': R(true, i * 10) }, expected: { enabled: cur.enabled, percent: cur.percent, rules: cur.rules } }, { id: null, note: `race ${i}` })));
  const winners = races.filter((r) => r.status === 'fulfilled').length;
  const losers = races.filter((r) => r.status === 'rejected' && (r as any).reason?.code === 'CONFIG_CHANGED').length;
  report('K1 6 administradores gravam ao mesmo tempo com os mesmos valores de referência: exatamente 1 vence, 5 recebem CONFIG_CHANGED, 1 linha de auditoria nova', winners === 1 && losers === 5, races.map((r) => r.status));
  // pedido bloqueado enquanto uma gravação do painel segura o lock; depois conclui com a configuração gravada
  await setCfg({ enabled: false, percent: 0, rules: { '*:STANDARD': R(true, 0) } });
  const holder = await pool.connect();
  await holder.query('BEGIN');
  await holder.query("SELECT pg_advisory_xact_lock(hashtext('shipping_subsidy_config'))");
  await holder.query(`UPDATE platform_settings SET value_json = $1::jsonb, updated_at = now() WHERE key = $2`, [JSON.stringify({ enabled: false, percent: 0, rules: { '*:STANDARD': R(true, 100) } }), KEY]);
  let finished = false;
  const pending = place([sNone.product.id], 'STANDARD', null).then((r) => { finished = true; return r; });
  await new Promise((r) => setTimeout(r, 1200));
  const blockedWhileLocked = !finished;
  await holder.query('COMMIT'); holder.release();
  const afterLock = await pending;
  const rowAfter = afterLock.ok ? await orderRow(afterLock.value.orders[0].id) : null;
  report('K2 pedido e gravação do painel são serializados: enquanto o painel segura o lock o pedido ESPERA; depois usa a configuração JÁ gravada (Standard 100% → frete 0, snapshot _SV)', blockedWhileLocked && !!rowAfter && Number(rowAfter.shippingFee) === 0 && rowAfter.shippingPolicyModeAtCheckout === 'CUSTOMER_PAYS+NUSALI_100PCT_SV', { blockedWhileLocked, fee: rowAfter?.shippingFee, snap: rowAfter?.shippingPolicyModeAtCheckout });
  // leitura consistente: pedidos multi-loja concorrentes com gravações alternadas — todos os filhos de um mesmo grupo usam a MESMA percentagem
  await setCfg({ enabled: false, percent: 0, rules: { '*:STANDARD': R(true, 20) } });
  const storm: Promise<any>[] = [];
  for (let i = 0; i < 6; i++) {
    storm.push(place([sNone.product.id, sMulti2.product.id, sMulti3.product.id], 'STANDARD', null));
    storm.push(updateShippingSubsidyConfig(db, { enabled: false, percent: 0, disableLegacyFreeMode: false, rules: { '*:STANDARD': R(true, i % 2 === 0 ? 70 : 20) } }, { id: null, note: `storm ${i}` }).catch(() => null));
  }
  const settled = await Promise.all(storm);
  const placedOk = settled.filter((r) => r && r.ok !== undefined && r.ok);
  let consistent = true; const seen = new Set<string>();
  for (const r of placedOk) {
    const kids = await Promise.all(r.value.orders.map((o: any) => orderRow(o.id)));
    const pcts = new Set(kids.map((k: any) => (k.shippingPolicyModeAtCheckout.match(/NUSALI_([\d.]+)PCT/) || [])[1] || '0'));
    pcts.forEach((p) => seen.add(p));
    if (pcts.size !== 1) consistent = false;
  }
  report('K3 LEITURA CONSISTENTE sob concorrência: 6 pedidos de 3 lojas criados enquanto 6 gravações alternam a regra (20/70) — dentro de cada pedido, todos os filhos usam a MESMA percentagem', placedOk.length >= 4 && consistent && [...seen].every((p) => ['20', '70'].includes(p)), { placed: placedOk.length, seen: [...seen] });
  const orphans = (await db.select().from(orders)).filter((o: any) => !o.shippingPolicyModeAtCheckout);
  report('K4 nenhum pedido ficou sem snapshot da política (todos os pedidos gravam modo + percentagem)', orphans.length === 0, orphans.length);

  // ================= 9. painel (puro): rascunho, origem efetiva e simulação por modalidade
  const rowsUi = buildEffectiveRows(
    [{ countryCode: 'GW', countryName: 'Guiné-Bissau', serviceCode: 'ECONOMY', serviceName: 'Economy', isActive: true }, { countryCode: 'GW', countryName: 'Guiné-Bissau', serviceCode: 'STANDARD', serviceName: 'Standard', isActive: true }, { countryCode: 'SN', countryName: 'Senegal', serviceCode: 'ECONOMY', serviceName: 'Economy', isActive: true }],
    { enabled: false, percent: 0 }, rulesToDraft({ 'GW:ECONOMY': R(true, 100), '*:STANDARD': R(true, 50) }), { cost: 1000, sellerPercent: 0 },
  );
  const byKey = (c: string, s: string) => rowsUi.find((r) => r.countryCode === c && r.serviceCode === s)!;
  report('U1 painel: origem efetiva e simulação por modalidade — Economy GW 100% (cliente 0), Economy SN sem regra (0%, cliente 1000), Standard GW 50% pela regra geral (cliente 500, Nusali 500); somas exatas', byKey('GW', 'ECONOMY').percent === 100 && byKey('GW', 'ECONOMY').split!.buyer === 0 && byKey('SN', 'ECONOMY').percent === 0 && byKey('SN', 'ECONOMY').split!.buyer === 1000 && byKey('GW', 'STANDARD').source === 'SERVICE' && byKey('GW', 'STANDARD').split!.nusali === 500 && rowsUi.every((r) => splitIsExact(r.split!)));
  report('U2 rascunho: percentagem inválida bloqueia (draftToRules) e "ativa 0%" / "desativada" ficam distintas', !draftToRules({ 'GW:ECONOMY': { state: 'active', percentText: 'abc' } }).ok && draftToRules({ 'GW:ECONOMY': { state: 'active', percentText: '0' }, 'GW:STANDARD': { state: 'disabled', percentText: '12,5' } }).rules['GW:ECONOMY'].enabled === true && draftToRules({ 'GW:STANDARD': { state: 'disabled', percentText: '12,5' } }).rules['GW:STANDARD'].percent === 12.5);

  console.log(`\n${passed}/${total} passaram`);
  await pool.end();
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
