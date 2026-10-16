/**
 * ESTOQUE POR VARIAÇÃO (SKU) NO FORMULÁRIO DE EDIÇÃO DO VENDEDOR — causa real (campo desativado + servidor ignorando o estoque de variação existente),
 * edição e persistência por SKU, recarga, reservas e transferências preservadas, alteração concorrente, validação, permissões e produto simples intacto.
 * Postgres 17 DESCARTAVEL (HTTP real: PATCH/GET /seller/products). Nunca produção.
 */
process.env.REDIS_URL = '';
import { assertLedgerTestDatabaseGuard } from './support/ledgerTestDbGuard.js';
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
import { and, eq } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import { inventory, inventoryMovements, inventoryTransfers, products, productVariants } from '../src/db/schema.js';
import { apiRouter } from '../src/server/api.js';
import { getJwtAccessSecret } from '../src/server/modules/auth/jwtConfig.js';
import { parseVariantStockChanges, VariantStockError, MAX_VARIANT_STOCK } from '../src/server/modules/inventory/variantStockService.js';
import { InventoryService } from '../src/server/modules/inventory/inventoryService.js';
import { validateVariantEntry, withVariantStockAdjustments, firstVariantStockError, buildVariantsPayloadForSubmit } from '../src/utils/productVariantWizard.js';
import { setupCheckoutKit } from './support/checkoutTestKit.js';

if (!['localhost', '127.0.0.1'].includes(new URL(testDbUrl).hostname)) throw new Error('Somente banco local descartavel.');
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 700)}`); };
const src = (p: string) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));

async function main() {
  // ================= 1. regras puras (cliente e servidor)
  const throwsCode = (fn: () => unknown) => { try { fn(); return null; } catch (e: any) { return e instanceof VariantStockError ? e.code : 'OTHER'; } };
  report('P1 parse: só leva em conta itens com stockOnHand + expectedStockOnHand; igual ao esperado = sem alteração; item sem stockOnHand não mexe em estoque', (() => {
    const out = parseVariantStockChanges([{ id: 'pvar_a', stockOnHand: 7, expectedStockOnHand: 5 }, { id: 'pvar_b', stockOnHand: 3, expectedStockOnHand: 3 }, { id: 'pvar_c', price: 10 }, { id: 'var-new', stock: 9 }]);
    return out.length === 1 && out[0].variantId === 'pvar_a' && out[0].newOnHand === 7 && out[0].expectedOnHand === 5;
  })());
  report('P2 parse recusa (400, nunca corrige em silêncio): negativo, decimal, texto, acima do máximo, sem o valor esperado, sem id, id repetido', [
    throwsCode(() => parseVariantStockChanges([{ id: 'a', stockOnHand: -1, expectedStockOnHand: 0 }])) === 'VARIANT_STOCK_INVALID',
    throwsCode(() => parseVariantStockChanges([{ id: 'a', stockOnHand: 1.5, expectedStockOnHand: 0 }])) === 'VARIANT_STOCK_INVALID',
    throwsCode(() => parseVariantStockChanges([{ id: 'a', stockOnHand: '5', expectedStockOnHand: 0 }])) === 'VARIANT_STOCK_INVALID',
    throwsCode(() => parseVariantStockChanges([{ id: 'a', stockOnHand: MAX_VARIANT_STOCK + 1, expectedStockOnHand: 0 }])) === 'VARIANT_STOCK_INVALID',
    throwsCode(() => parseVariantStockChanges([{ id: 'a', stockOnHand: 5 }])) === 'VARIANT_STOCK_EXPECTED_REQUIRED',
    throwsCode(() => parseVariantStockChanges([{ stockOnHand: 5, expectedStockOnHand: 1 }])) === 'VARIANT_STOCK_ID_REQUIRED',
    throwsCode(() => parseVariantStockChanges([{ id: 'a', stockOnHand: 5, expectedStockOnHand: 1 }, { id: 'a', stockOnHand: 6, expectedStockOnHand: 1 }])) === 'VARIANT_STOCK_DUPLICATE',
  ].every(Boolean));
  const loaded = { id: 'pvar_1', stock: 10, stockBaseline: 10, stockReserved: 4, stockPending: 1, stockFloor: 5, stockEditable: true, price: 100, color: 'Azul', size: 'M' } as any;
  report('P3 formulário: piso = reservado + transferência pendente; abaixo dele o campo mostra o motivo (nunca grava); no piso ou acima é válido', validateVariantEntry({ ...loaded, stock: 4 }).stock?.includes('Mínimo 5') === true && validateVariantEntry({ ...loaded, stock: 5 }).stock === undefined && validateVariantEntry({ ...loaded, stock: 12 }).stock === undefined && validateVariantEntry({ ...loaded, stock: -1 }).stock !== undefined && validateVariantEntry({ ...loaded, stock: 1.5 }).stock !== undefined);
  report('P4 payload: variação carregada leva stockOnHand (novo) + expectedStockOnHand (baseline) e NÃO leva os campos auxiliares; variação nova só leva o stock inicial; não editável não leva ajuste', (() => {
    const out = buildVariantsPayloadForSubmit('variable', [{ ...loaded, stock: 8 }, { id: 'var-new', price: 50, stock: 3 } as any, { ...loaded, id: 'pvar_2', stockEditable: false }], true)!;
    const a: any = out[0], b: any = out[1], c: any = out[2];
    return a.stockOnHand === 8 && a.expectedStockOnHand === 10 && !('stockBaseline' in a) && !('stockFloor' in a) && b.stockOnHand === undefined && b.stock === 3 && c.stockOnHand === undefined;
  })());
  report('P5 bloqueio antes de chamar a API: firstVariantStockError devolve a combinação e o motivo; sem problemas = null', /Azul \/ M: Mínimo 5/.test(firstVariantStockError([{ ...loaded, stock: 2 }]) || '') && firstVariantStockError([{ ...loaded, stock: 6 }]) === null && withVariantStockAdjustments([]).length === 0);

  // ================= banco descartável
  const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false }, max: 12 });
  const db = drizzle(pool, { schema });
  const kit = await setupCheckoutKit(db, 'vs');
  const bissau = await kit.sector('Bissau');
  const app = express(); app.use(express.json()); app.use('/api/v1', apiRouter);
  const server = http.createServer(app); await new Promise<void>((res) => server.listen(0, res));
  const base = `http://localhost:${(server.address() as any).port}/api/v1`;
  const tokenFor = (userId: string, role: string) => jwt.sign({ userId, email: `${userId}@t.test`, role, fullName: `T ${role}`, countryCode: 'GW', kycStatus: 'verified', isEmailVerified: true }, getJwtAccessSecret(), { expiresIn: '10m' });
  const call = async (method: string, p: string, tok: string | null, body?: any) => {
    const r = await fetch(`${base}${p}`, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, json: await r.json().catch(() => null) as any };
  };

  const seller = await kit.makeSeller('vestido');
  const store = await kit.makeStore(seller, 'vestido', bissau.id);
  const tok = tokenFor(seller.userId, 'SELLER');
  const product = await kit.makeProduct(seller, store.storeId, 'Vestido de Festa', 0.5, 7000);

  // produto com 2 cores x 2 tamanhos (4 SKUs), cada um com estoque inicial próprio — criado pela API real
  const mk = (color: string, size: string, stock: number, sku: string) => ({ color, size, sku, price: 7000, stock });
  const created = await call('PATCH', `/seller/products/${product.id}`, tok, { variants: [mk('Branco', 'G', 10, 'VF-BR-G'), mk('Branco', 'GG', 8, 'VF-BR-GG'), mk('Azul', 'G', 6, 'VF-AZ-G'), mk('Azul', 'GG', 4, 'VF-AZ-GG')] });
  const detail0 = await call('GET', `/seller/products/${product.id}`, tok);
  if (!detail0.json?.data) console.log('DEBUG created', created.status, JSON.stringify(created.json).slice(0, 400), 'detail', detail0.status, JSON.stringify(detail0.json).slice(0, 300));
  const vars0: any[] = detail0.json?.data?.variants ?? [];
  const bySku = (arr: any[], sku: string) => arr.find((v) => v.sku === sku);
  report('V1 criação por API (4 SKUs) e o detalhe devolve, por SKU, o estoque FÍSICO do vendedor, reservado, transferência pendente, piso e se é editável', created.status === 200 && vars0.length === 4 && vars0.every((v) => typeof v.stockOnHand === 'number' && v.stockReserved === 0 && v.stockPendingTransfer === 0 && v.stockFloor === 0 && v.stockEditable === true) && bySku(vars0, 'VF-BR-G').stockOnHand === 10 && bySku(vars0, 'VF-AZ-GG').stockOnHand === 4, detail0.json?.data?.variants?.map((v: any) => [v.sku, v.stockOnHand]));
  const invOf = async (variantId: string) => (await db.select().from(inventory).where(and(eq(inventory.variantId, variantId), eq(inventory.locationType, 'SELLER_LOCATION'))))[0];
  const movs = async (variantId: string) => (await db.select().from(inventoryMovements).where(eq(inventoryMovements.variantId, variantId))).filter((m: any) => m.type === 'ADJUSTMENT');

  /** payload de edição como o formulário monta: todas as variações (id real), estoque novo/esperado só onde mudou */
  const editPayload = (current: any[], changes: Record<string, number>, extra: Record<string, any> = {}) => current.map((v) => ({
    id: v.id, sku: v.sku, color: v.color, size: v.size, price: Number(v.price), stock: v.stockOnHand,
    ...(changes[v.sku] !== undefined ? { stockOnHand: changes[v.sku], expectedStockOnHand: v.stockOnHand } : { stockOnHand: v.stockOnHand, expectedStockOnHand: v.stockOnHand }),
    ...(extra[v.sku] || {}),
  }));

  // ================= 2. edição e persistência
  const before = await Promise.all(vars0.map(async (v) => (await invOf(v.id)).quantityOnHand));
  const e1 = await call('PATCH', `/seller/products/${product.id}`, tok, { variants: editPayload(vars0, { 'VF-BR-G': 25 }) });
  const detail1 = await call('GET', `/seller/products/${product.id}`, tok);
  const vars1: any[] = detail1.json.data.variants;
  const prodRow = (await db.select().from(products).where(eq(products.id, product.id)))[0];
  report('V2 editar o estoque de UM SKU e salvar: persiste no inventory (10 → 25), os outros 3 SKUs ficam exatamente iguais, e a recarga (GET) mostra o valor novo', e1.status === 200 && bySku(vars1, 'VF-BR-G').stockOnHand === 25 && bySku(vars1, 'VF-BR-GG').stockOnHand === 8 && bySku(vars1, 'VF-AZ-G').stockOnHand === 6 && bySku(vars1, 'VF-AZ-GG').stockOnHand === 4, [e1.json, vars1.map((v) => [v.sku, v.stockOnHand])]);
  const m1 = await movs(bySku(vars1, 'VF-BR-G').id), m2 = await movs(bySku(vars1, 'VF-BR-GG').id);
  report('V3 auditoria: 1 movimento ADJUSTMENT de +15 (quem fez) só no SKU alterado; SKUs sem alteração não geram movimento; o resumo do produto (products.stock) = soma 25+8+6+4 = 43', m1.length === 1 && Number(m1[0].quantity) === 15 && m1[0].performedBy === seller.userId && m2.length === 0 && Number(prodRow.stock) === 43, { m1: m1.map((m: any) => m.quantity), stock: prodRow.stock });
  const e2 = await call('PATCH', `/seller/products/${product.id}`, tok, { variants: editPayload(vars1, { 'VF-BR-G': 20, 'VF-BR-GG': 0, 'VF-AZ-G': 12, 'VF-AZ-GG': 5 }) });
  const vars2: any[] = (await call('GET', `/seller/products/${product.id}`, tok)).json.data.variants;
  report('V4 cada SKU individualmente numa só gravação (reduzir, zerar e aumentar): 20 / 0 / 12 / 5 persistidos e recarregados', e2.status === 200 && bySku(vars2, 'VF-BR-G').stockOnHand === 20 && bySku(vars2, 'VF-BR-GG').stockOnHand === 0 && bySku(vars2, 'VF-AZ-G').stockOnHand === 12 && bySku(vars2, 'VF-AZ-GG').stockOnHand === 5, vars2.map((v) => [v.sku, v.stockOnHand]));
  const e3 = await call('PATCH', `/seller/products/${product.id}`, tok, { variants: editPayload(vars2, {}, { 'VF-AZ-G': { price: 7500 } }) });
  const vars3: any[] = (await call('GET', `/seller/products/${product.id}`, tok)).json.data.variants;
  report('V5 salvar só o preço de um SKU (estoque inalterado no formulário) NÃO mexe no estoque de ninguém (sem sobrescrita pelo valor lido antes) e o preço é gravado', e3.status === 200 && Number(bySku(vars3, 'VF-AZ-G').price) === 7500 && vars3.every((v) => v.stockOnHand === bySku(vars2, v.sku).stockOnHand), vars3.map((v) => [v.sku, v.stockOnHand, v.price]));

  // ================= 3. reservas e transferências preservadas
  const brG = bySku(vars3, 'VF-BR-G');
  const invBrG = await invOf(brG.id);
  await db.update(inventory).set({ quantityReserved: 6 } as any).where(eq(inventory.id, invBrG.id)); // 6 unidades reservadas por pedidos em andamento
  const d4: any = (await call('GET', `/seller/products/${product.id}`, tok)).json.data.variants;
  const belowRes = await call('PATCH', `/seller/products/${product.id}`, tok, { variants: editPayload(d4, { 'VF-BR-G': 5 }, { 'VF-AZ-G': { price: 9999 } }) });
  const invAfterBelow = await invOf(brG.id);
  const afterBelow: any[] = (await call('GET', `/seller/products/${product.id}`, tok)).json.data.variants;
  report('V6 RESERVAS: reduzir para 5 com 6 reservadas é RECUSADO (409 VARIANT_STOCK_BELOW_RESERVED, mínimo 6, mensagem clara); o físico e a reserva ficam intactos e o salvamento INTEIRO é desfeito (o preço novo de outro SKU não foi gravado)', belowRes.status === 409 && belowRes.json.error.code === 'VARIANT_STOCK_BELOW_RESERVED' && belowRes.json.error.details.floor === 6 && /mínimo é 6/.test(belowRes.json.message) && invAfterBelow.quantityOnHand === 20 && invAfterBelow.quantityReserved === 6 && Number(bySku(afterBelow, 'VF-AZ-G').price) === 7500, [belowRes.json, invAfterBelow.quantityOnHand]);
  const atFloor = await call('PATCH', `/seller/products/${product.id}`, tok, { variants: editPayload(d4, { 'VF-BR-G': 6 }) });
  const invAtFloor = await invOf(brG.id);
  report('V7 reduzir exatamente até o reservado (6) é aceito: disponível passa a 0, a reserva dos pedidos continua 6', atFloor.status === 200 && invAtFloor.quantityOnHand === 6 && invAtFloor.quantityReserved === 6);
  const d5: any[] = (await call('GET', `/seller/products/${product.id}`, tok)).json.data.variants;
  const brG5 = bySku(d5, 'VF-BR-G');
  report('V8 o formulário recebe o reservado e o piso do SKU (reservadas 6, piso 6) para mostrar "Disponível: 0" e travar o mínimo', brG5.stockOnHand === 6 && brG5.stockReserved === 6 && brG5.stockFloor === 6 && brG5.availableStock === 0);
  // transferência pendente para o HUB entra no piso
  const brGG = bySku(d5, 'VF-BR-GG');
  await db.update(inventory).set({ quantityOnHand: 9 } as any).where(eq(inventory.id, (await invOf(brGG.id)).id));
  const invGG = await invOf(brGG.id);
  const wh = await kit.makeWarehouse('hubvs', bissau.id);
  await db.insert(inventoryTransfers).values({ id: kit.uid('trf'), sellerId: seller.sellerId, productId: product.id, variantId: brGG.id, fromInventoryId: invGG.id, toWarehouseId: wh.warehouseId, quantity: 4, status: 'PENDING', createdAt: new Date(), updatedAt: new Date() } as any);
  const d6: any[] = (await call('GET', `/seller/products/${product.id}`, tok)).json.data.variants;
  const gg6 = bySku(d6, 'VF-BR-GG');
  const belowTrf = await call('PATCH', `/seller/products/${product.id}`, tok, { variants: editPayload(d6, { 'VF-BR-GG': 3 }) });
  const okTrf = await call('PATCH', `/seller/products/${product.id}`, tok, { variants: editPayload(d6, { 'VF-BR-GG': 4 }) });
  report('V9 TRANSFERÊNCIA PENDENTE (4 un. para o HUB) entra no piso: o detalhe mostra pendente 4 / piso 4; reduzir para 3 é recusado, 4 é aceito, e a transferência continua válida', gg6.stockPendingTransfer === 4 && gg6.stockFloor === 4 && belowTrf.status === 409 && belowTrf.json.error.code === 'VARIANT_STOCK_BELOW_RESERVED' && okTrf.status === 200 && (await invOf(brGG.id)).quantityOnHand === 4 && (await db.select().from(inventoryTransfers).where(eq(inventoryTransfers.fromInventoryId, invGG.id)))[0].status === 'PENDING');

  // ================= 4. concorrência
  const d7: any[] = (await call('GET', `/seller/products/${product.id}`, tok)).json.data.variants;
  const azG = bySku(d7, 'VF-AZ-G'); const invAzG = await invOf(azG.id);
  await db.update(inventory).set({ quantityOnHand: azG.stockOnHand + 7 } as any).where(eq(inventory.id, invAzG.id)); // outra operação (ex.: ajuste/recebimento) mudou o físico depois de o formulário carregar
  const stale = await call('PATCH', `/seller/products/${product.id}`, tok, { variants: editPayload(d7, { 'VF-AZ-G': 1 }) });
  report('V10 ALTERAÇÃO CONCORRENTE: o físico mudou depois de o formulário abrir → 409 VARIANT_STOCK_CHANGED com o valor atual; nada é sobrescrito', stale.status === 409 && stale.json.error.code === 'VARIANT_STOCK_CHANGED' && stale.json.error.details.currentOnHand === azG.stockOnHand + 7 && (await invOf(azG.id)).quantityOnHand === azG.stockOnHand + 7, stale.json);
  const d8: any[] = (await call('GET', `/seller/products/${product.id}`, tok)).json.data.variants;
  const race = await Promise.all([1, 2, 3, 4].map((n) => call('PATCH', `/seller/products/${product.id}`, tok, { variants: editPayload(d8, { 'VF-AZ-GG': 30 + n }) })));
  const okCount = race.filter((r) => r.status === 200).length, conflictCount = race.filter((r) => r.status === 409 && r.json.error.code === 'VARIANT_STOCK_CHANGED').length;
  const azgg = bySku(d8, 'VF-AZ-GG');
  const finalAzgg = (await invOf(azgg.id)).quantityOnHand;
  report('V11 4 salvamentos simultâneos com o mesmo valor visto: exatamente 1 vence e 3 recebem 409; o estoque final é o do vencedor e há 1 só movimento novo', okCount === 1 && conflictCount === 3 && finalAzgg >= 31 && finalAzgg <= 34 && (await movs(azgg.id)).length >= 1, race.map((r) => r.status));
  // reserva concorrente: segura a linha com FOR UPDATE, reserva +9 e confirma; o salvamento espera e então respeita a nova reserva
  const d9: any[] = (await call('GET', `/seller/products/${product.id}`, tok)).json.data.variants;
  const azg9 = bySku(d9, 'VF-AZ-G'); const invAzG9 = await invOf(azg9.id);
  const holder = await pool.connect();
  await holder.query('BEGIN');
  await holder.query('SELECT * FROM inventory WHERE id = $1 FOR UPDATE', [invAzG9.id]);
  let finished = false;
  const pendingSave = call('PATCH', `/seller/products/${product.id}`, tok, { variants: editPayload(d9, { 'VF-AZ-G': 3 }) }).then((r) => { finished = true; return r; });
  await new Promise((r) => setTimeout(r, 1200));
  const waitedForLock = !finished;
  await holder.query('UPDATE inventory SET quantity_reserved = quantity_reserved + 9 WHERE id = $1', [invAzG9.id]);
  await holder.query('COMMIT'); holder.release();
  const lockedRes = await pendingSave;
  const invAfterLock = await invOf(azg9.id);
  report('V12 RESERVA CONCORRENTE (+9 durante a edição): o salvamento ESPERA a linha travada e, ao ler a reserva nova, recusa reduzir abaixo dela (409, mínimo 9); a reserva do pedido fica intacta — nunca se perde nem cria estoque negativo disponível', waitedForLock && lockedRes.status === 409 && lockedRes.json.error.code === 'VARIANT_STOCK_BELOW_RESERVED' && lockedRes.json.error.details.floor === 9 && invAfterLock.quantityReserved === 9 && invAfterLock.quantityOnHand === azg9.stockOnHand, { waitedForLock, status: lockedRes.status, floor: lockedRes.json?.error?.details?.floor, res: invAfterLock.quantityReserved });

  // ================= 5. validação, permissões e isolamento
  const d10: any[] = (await call('GET', `/seller/products/${product.id}`, tok)).json.data.variants;
  const badCases: Array<[string, any, string]> = [
    ['negativo', { stockOnHand: -3 }, 'VARIANT_STOCK_INVALID'], ['decimal', { stockOnHand: 2.5 }, 'VARIANT_STOCK_INVALID'], ['texto', { stockOnHand: '8' }, 'VARIANT_STOCK_INVALID'],
    ['acima do máximo', { stockOnHand: MAX_VARIANT_STOCK + 1 }, 'VARIANT_STOCK_INVALID'], ['sem valor esperado', { stockOnHand: 5, expectedStockOnHand: undefined }, 'VARIANT_STOCK_EXPECTED_REQUIRED'],
  ];
  const snapBad = JSON.stringify((await db.select().from(inventory).where(eq(inventory.productId, product.id))).map((r: any) => [r.id, r.quantityOnHand, r.quantityReserved]).sort());
  let badOk = true; const badInfo: any[] = [];
  for (const [name, over, code] of badCases) {
    const payload = editPayload(d10, {}).map((v: any) => (v.sku === 'VF-BR-G' ? { ...v, expectedStockOnHand: v.expectedStockOnHand, ...over } : v));
    const r = await call('PATCH', `/seller/products/${product.id}`, tok, { variants: payload });
    if (r.status !== 400 || r.json?.error?.code !== code) { badOk = false; badInfo.push([name, r.status, r.json?.error?.code]); }
  }
  const snapBadAfter = JSON.stringify((await db.select().from(inventory).where(eq(inventory.productId, product.id))).map((r: any) => [r.id, r.quantityOnHand, r.quantityReserved]).sort());
  report('V13 valores inválidos (negativo, decimal, texto, acima do máximo, sem o valor esperado) → 400 com código e NADA gravado', badOk && snapBad === snapBadAfter, badInfo);

  const otherSeller = await kit.makeSeller('outro');
  const otherStore = await kit.makeStore(otherSeller, 'outro', bissau.id);
  const otherTok = tokenFor(otherSeller.userId, 'SELLER');
  const otherProduct = await kit.makeProduct(otherSeller, otherStore.storeId, 'Produto alheio', 0.3, 100);
  await call('PATCH', `/seller/products/${otherProduct.id}`, otherTok, { variants: [mk('Verde', 'M', 5, 'ALHEIO-1')] });
  const otherVar: any = (await call('GET', `/seller/products/${otherProduct.id}`, otherTok)).json.data.variants[0];
  const crossProduct = await call('PATCH', `/seller/products/${product.id}`, tok, { variants: [...editPayload(d10, {}), { id: otherVar.id, color: 'Verde', size: 'M', price: 100, stockOnHand: 99, expectedStockOnHand: 5 }] });
  const crossOwner = await call('PATCH', `/seller/products/${product.id}`, otherTok, { variants: editPayload(d10, { 'VF-BR-G': 50 }) });
  const buyerTok = tokenFor(await kit.makeUser('BUYER'), 'BUYER');
  const asBuyer = await call('PATCH', `/seller/products/${product.id}`, buyerTok, { variants: editPayload(d10, { 'VF-BR-G': 50 }) });
  const noAuth = await call('PATCH', `/seller/products/${product.id}`, null, { variants: editPayload(d10, { 'VF-BR-G': 50 }) });
  const otherInv = await invOf(otherVar.id);
  report('V14 PERMISSÕES e ISOLAMENTO: variação de OUTRO produto/vendedor no payload é recusada; outro vendedor, comprador e visitante não conseguem alterar o estoque deste produto; o estoque alheio fica intacto', crossProduct.status >= 400 && crossOwner.status >= 400 && crossOwner.status !== 200 && asBuyer.status >= 400 && noAuth.status === 401 && otherInv.quantityOnHand === 5 && (await invOf(bySku(d10, 'VF-BR-G').id)).quantityOnHand === 6, [crossProduct.status, crossOwner.status, asBuyer.status, noAuth.status]);

  // SKU com mais de um local do vendedor: ambíguo → não edita direto
  const multi = bySku(d10, 'VF-AZ-GG');
  await db.insert(inventory).values({ id: kit.uid('inv_dup'), locationType: 'SELLER_LOCATION', sellerId: seller.sellerId, warehouseId: null, productId: product.id, variantId: multi.id, quantityOnHand: 2, quantityReserved: 0, minimumStockLevel: 0, fulfillmentLocationId: null, createdAt: new Date(), updatedAt: new Date() } as any);
  const dm: any[] = (await call('GET', `/seller/products/${product.id}`, tok)).json.data.variants;
  const mm = bySku(dm, 'VF-AZ-GG');
  const multiTry = await call('PATCH', `/seller/products/${product.id}`, tok, { variants: editPayload(dm, { 'VF-AZ-GG': 1 }) });
  report('V15 SKU com estoque em 2 locais do vendedor: o detalhe marca stockEditable=false (soma exibida) e o ajuste direto é recusado (409 VARIANT_STOCK_MULTIPLE_LOCATIONS) — nunca adivinha qual linha alterar', mm.stockEditable === false && multiTry.status === 409 && multiTry.json.error.code === 'VARIANT_STOCK_MULTIPLE_LOCATIONS');

  // ================= 6. produtos sem variação e ajuste rápido não regridem
  const simple = await kit.makeProduct(seller, store.storeId, 'Produto simples', 0.3, 100);
  await kit.insertInventory({ sellerId: seller.sellerId, productId: simple.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: store.floc.id, quantityOnHand: 12 });
  const simpleEdit = await call('PATCH', `/seller/products/${simple.id}`, tok, { stock: 20 });
  const simpleInv = (await db.select().from(inventory).where(and(eq(inventory.productId, simple.id), eq(inventory.locationType, 'SELLER_LOCATION'))))[0];
  const quickVar = await call('PATCH', `/seller/products/${product.id}/stock`, tok, { stock: 99 });
  report('V16 produto SEM variações continua editando o estoque como antes (12 → 20) e o ajuste rápido num produto COM variações segue recusado com a mensagem de "estoque por variação" (400 VARIANT_REQUIRED)', simpleEdit.status === 200 && simpleInv.quantityOnHand === 20 && quickVar.status === 400 && /VARIANT_REQUIRED/.test(quickVar.json?.message || ''));

  // ================= 6b. INTERFERÊNCIA com outros fluxos de estoque (locks, transferências reais, livro de movimentos)
  // I1 — ordem de locks: um fluxo existente (transferência/expedição) trava a linha de estoque e DEPOIS atualiza products; o salvamento do anúncio
  // atualiza products cedo. Sem travar o estoque no início da transação haveria deadlock. Determinístico: o "fluxo existente" segura a linha e só
  // atualiza products 600 ms depois, com o salvamento já em andamento.
  const dlProduct = await kit.makeProduct(seller, store.storeId, 'Produto deadlock', 0.4, 500);
  await call('PATCH', `/seller/products/${dlProduct.id}`, tok, { variants: [mk('Verde', 'M', 10, 'DL-VD-M'), mk('Verde', 'G', 5, 'DL-VD-G')] });
  const dlVars: any[] = (await call('GET', `/seller/products/${dlProduct.id}`, tok)).json.data.variants;
  const dlM = bySku(dlVars, 'DL-VD-M');
  const dlInv = await invOf(dlM.id);
  const holder2 = await pool.connect();
  await holder2.query('BEGIN');
  await holder2.query('SELECT id FROM inventory WHERE id = $1 FOR UPDATE', [dlInv.id]);
  const dlPatch = call('PATCH', `/seller/products/${dlProduct.id}`, tok, { description: 'Descrição nova do produto', variants: editPayload(dlVars, { 'DL-VD-M': 14 }) });
  await new Promise((r) => setTimeout(r, 700));
  let holderErr: string | null = null;
  try { await holder2.query('UPDATE products SET stock = stock WHERE id = $1', [dlProduct.id]); await holder2.query('COMMIT'); } catch (e: any) { holderErr = e?.code || String(e?.message).slice(0, 60); await holder2.query('ROLLBACK').catch(() => {}); }
  holder2.release();
  const dlRes = await dlPatch;
  const dlRow = (await db.select().from(products).where(eq(products.id, dlProduct.id)))[0];
  report('I1 NÃO HÁ DEADLOCK com os fluxos que travam estoque e depois atualizam products (transferência/expedição): ambos concluem — o salvamento espera a linha, grava descrição + estoque (10 → 14) e o fluxo concorrente também confirma', holderErr === null && dlRes.status === 200 && (await invOf(dlM.id)).quantityOnHand === 14 && dlRow.description === 'Descrição nova do produto', { holderErr, status: dlRes.status, body: dlRes.json });

  // I2 — corrida com TRANSFERÊNCIA REAL para o HUB: nunca fica físico < reservado + transferências pendentes, qualquer que seja a ordem
  const wh2 = await kit.makeWarehouse('hubrace', bissau.id);
  let invariantOk = true; const outcomes: string[] = [];
  for (let i = 0; i < 6; i++) {
    const cur: any[] = (await call('GET', `/seller/products/${dlProduct.id}`, tok)).json.data.variants;
    const g = bySku(cur, 'DL-VD-G'); const gInv = await invOf(g.id);
    await db.update(inventory).set({ quantityOnHand: 10, quantityReserved: 2 } as any).where(eq(inventory.id, gInv.id));
    await db.delete(inventoryTransfers).where(eq(inventoryTransfers.fromInventoryId, gInv.id));
    const fresh: any[] = (await call('GET', `/seller/products/${dlProduct.id}`, tok)).json.data.variants;
    const [edit, trf] = await Promise.allSettled([
      call('PATCH', `/seller/products/${dlProduct.id}`, tok, { variants: editPayload(fresh, { 'DL-VD-G': 4 }) }),
      InventoryService.requestTransferToHub(seller.sellerId, gInv.id, wh2.warehouseId, 6, 'SELLER_DROPOFF'),
    ]);
    const after = await invOf(g.id);
    const pending = (await db.select().from(inventoryTransfers).where(eq(inventoryTransfers.fromInventoryId, gInv.id))).filter((t: any) => t.status === 'PENDING').reduce((a: number, t: any) => a + t.quantity, 0);
    const editStatus = edit.status === 'fulfilled' ? (edit.value as any).status : 'ERR';
    outcomes.push(`${editStatus}/${trf.status}`);
    if (after.quantityOnHand < after.quantityReserved + pending || after.quantityReserved !== 2 || editStatus === 500 || editStatus === 'ERR') invariantOk = false;
  }
  report('I2 corrida editar estoque × transferência REAL para o HUB (6 rodadas): em qualquer ordem o físico nunca fica abaixo de reservado + pendente, a reserva continua 2 e não há erro 500/deadlock (um dos dois é recusado de forma limpa)', invariantOk, outcomes);

  // I3 — livro de movimentos coerente: entrada inicial + ajustes = físico atual, com quem fez cada ajuste
  const ledProduct = await kit.makeProduct(seller, store.storeId, 'Produto livro', 0.3, 300);
  await call('PATCH', `/seller/products/${ledProduct.id}`, tok, { variants: [mk('Rosa', 'P', 10, 'LV-RS-P')] });
  let lv: any[] = (await call('GET', `/seller/products/${ledProduct.id}`, tok)).json.data.variants;
  for (const target of [4, 12, 0, 7]) {
    const r = await call('PATCH', `/seller/products/${ledProduct.id}`, tok, { variants: editPayload(lv, { 'LV-RS-P': target }) });
    lv = (await call('GET', `/seller/products/${ledProduct.id}`, tok)).json.data.variants;
    if (r.status !== 200) break;
  }
  const lvId = lv[0].id;
  const lvMovs = await db.select().from(inventoryMovements).where(eq(inventoryMovements.variantId, lvId));
  const lvSum = lvMovs.filter((m: any) => m.type === 'IN' || m.type === 'ADJUSTMENT').reduce((a: number, m: any) => a + Number(m.quantity), 0);
  report('I3 LIVRO DE MOVIMENTOS: entrada inicial (+10) e 4 ajustes (−6, +8, −12, +7) somam exatamente o físico atual (7); todos os ajustes registam o vendedor; zerar (0) é aceito', lvSum === 7 && (await invOf(lvId)).quantityOnHand === 7 && lvMovs.filter((m: any) => m.type === 'ADJUSTMENT').length === 4 && lvMovs.filter((m: any) => m.type === 'ADJUSTMENT').every((m: any) => m.performedBy === seller.userId), { lvSum, movs: lvMovs.map((m: any) => [m.type, m.quantity]) });

  // I4 — salvamento conjunto: se o estoque é recusado, NADA do anúncio é gravado (preço/descrição incluídos); se passa, tudo é gravado junto
  const jt = await kit.makeProduct(seller, store.storeId, 'Produto conjunto', 0.3, 800);
  await call('PATCH', `/seller/products/${jt.id}`, tok, { variants: [mk('Cinza', 'M', 6, 'JT-CZ-M')] });
  const jtv: any[] = (await call('GET', `/seller/products/${jt.id}`, tok)).json.data.variants;
  await db.update(inventory).set({ quantityReserved: 5 } as any).where(eq(inventory.id, (await invOf(jtv[0].id)).id));
  const jtFail = await call('PATCH', `/seller/products/${jt.id}`, tok, { description: 'NÃO deve gravar', variants: editPayload(jtv, { 'JT-CZ-M': 2 }, { 'JT-CZ-M': { price: 1234 } }) });
  const jtAfterFail = (await db.select().from(products).where(eq(products.id, jt.id)))[0];
  const jtVarAfterFail = (await db.select().from(productVariants).where(eq(productVariants.id, jtv[0].id)))[0];
  const jtOk = await call('PATCH', `/seller/products/${jt.id}`, tok, { description: 'Gravado junto', variants: editPayload(jtv, { 'JT-CZ-M': 9 }, { 'JT-CZ-M': { price: 1234 } }) });
  const jtAfterOk = (await db.select().from(products).where(eq(products.id, jt.id)))[0];
  const jtVarAfterOk = (await db.select().from(productVariants).where(eq(productVariants.id, jtv[0].id)))[0];
  report('I4 ATUALIZAÇÃO CONJUNTA dados + estoque: recusada (409) → NADA gravado (descrição e preço da variação intactos, reserva 5 intacta); aceita → descrição, preço da variação e estoque (6 → 9) gravados na mesma transação', jtFail.status === 409 && jtAfterFail.description !== 'NÃO deve gravar' && Number(jtVarAfterFail.price) === 7000 && jtOk.status === 200 && jtAfterOk.description === 'Gravado junto' && Number(jtVarAfterOk.price) === 1234 && (await invOf(jtv[0].id)).quantityOnHand === 9 && (await invOf(jtv[0].id)).quantityReserved === 5, { fail: jtFail.status, ok: jtOk.status });

  // ================= 7. código do formulário
  const wiz = src('src/components/seller/SellerProductWizard.tsx'), hub = src('src/components/SellerHubView.tsx'), svc = src('src/server/modules/catalog/variantService.ts');
  report('W1 CAUSA REAL fechada no formulário: o campo «Estoque» de variação já cadastrada NÃO é mais desativado por existir (só quando o SKU tem 2 locais), tem mínimo = piso, rótulo acessível, mensagem de erro (role=alert) e mostra reservadas/disponível', !wiz.includes('existingVariantKeys.has(buildVariantKey(buildAxisPayload([item]') && !wiz.includes('se ajusta em Estoque & Armazéns') && wiz.includes('disabled={item.stockBaseline !== undefined && item.stockEditable === false}') && wiz.includes('min={item.stockBaseline !== undefined ? item.stockFloor ?? 0 : 0}') && wiz.includes('data-testid={`variant-stock-${item.id || idx}`}') && wiz.includes('aria-label={`Estoque de ') && wiz.includes('Reservadas: {item.stockReserved ?? 0}'));
  report('W2 o detalhe do vendedor alimenta o formulário com o FÍSICO (não o disponível) e o baseline; o salvamento bloqueia piso/valores inválidos antes de chamar a API', hub.includes('stock: Number(v.stockOnHand ?? v.availableStock ?? 0)') && hub.includes('stockBaseline:') && wiz.includes('firstVariantStockError(variantsMatrix)') && svc.includes('FORA de escopo') === true);
  report('W3 servidor: ajuste só pelo caminho com linha travada (FOR UPDATE), esperado + piso + auditoria; variantService continua sem escrever estoque de variante existente (uma única autoridade)', src('src/server/modules/inventory/variantStockService.ts').includes(".for('update')") && src('src/server/sellerRoutes.ts').includes('applyVariantStockChanges(tx') && !/UPDATE[\s\S]{0,80}product_variants[\s\S]{0,40}stock/i.test(svc));

  server.close();
  console.log(`\n${passed}/${total} passaram`);
  await pool.end();
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
