/**
 * ETAPA D — consolidação de peso por expedição: linhas do mesmo grupo (vendedor + loja comercial) do MESMO local de expedição, destino e
 * serviço formam um volume; tarifa = faixa do peso TOTAL; valor repartido por peso (soma exata); locais/vendedores/lojas diferentes nunca
 * se juntam; peso total sem faixa → serviço indisponível (sem partir o frete); preview == pedido; snapshots coerentes; política de frete,
 * confirmação e travamento da Etapa C continuam valendo. Postgres 17 DESCARTAVEL. Nunca produção.
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
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import { orders, orderItems, purchaseGroups, stockReservations, shippingRouteRates, storeShippingPolicies } from '../src/db/schema.js';
import { OrderService } from '../src/server/modules/orders/orderService.js';
import { resolveCartShippingPreview } from '../src/server/modules/shipping/shippingPreviewService.js';
import { allocateByWeight } from '../src/server/modules/shipping/shipmentPlannerService.js';
import { setupCheckoutKit } from './checkoutTestKit.js';

if (!['localhost', '127.0.0.1'].includes(new URL(testDbUrl).hostname)) throw new Error('Somente banco local descartavel.');
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 700)}`); };
const codeOf = (e: any) => e?.code || e?.name || String(e?.message || e).slice(0, 80);
const sum = (a: number[]) => Math.round(a.reduce((x, y) => x + y, 0) * 100) / 100;

async function main() {
  const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false }, max: 10 });
  const db = drizzle(pool, { schema });
  const kit = await setupCheckoutKit(db, 'ed');
  await kit.setFlag('multiSellerCheckoutEnabled', true);
  const bissau = await kit.sector('Bissau');
  const sectors: any[] = [];
  const allSectors: any[] = await db.select().from(schema.shippingSectors);
  for (const sec of allSectors.filter((x) => x.countryCode === 'GW' && x.id !== bissau.id).sort((a, b) => String(a.name).localeCompare(String(b.name))).slice(0, 14)) sectors.push(sec);
  let nextSector = 0;
  const std = await kit.service('STANDARD'), exp = await kit.service('EXPRESS'), eco = await kit.service('ECONOMY');

  /** faixas: STANDARD [0,1)=1000 e [1,5)=1500; EXPRESS [0,1)=2000 e [1,5)=3000 — origem própria por cenário */
  const bands = async (originSectorId: string, withExpress = true) => {
    const route = await kit.route(originSectorId, bissau.id);
    const std1 = await kit.insertRate(route.id, std.id, 1000, { min: 0, max: 1 });
    const std2 = await kit.insertRate(route.id, std.id, 1500, { min: 1, max: 5 });
    if (withExpress) { await kit.insertRate(route.id, exp.id, 2000, { min: 0, max: 1 }); await kit.insertRate(route.id, exp.id, 3000, { min: 1, max: 5 }); }
    return { route, std1, std2 };
  };
  /** um vendedor/loja com N produtos (pesos dados), todos na mesma origem */
  const shop = async (label: string, weights: number[], price = 100) => {
    const sector = sectors[nextSector++];
    const seller = await kit.makeSeller(label);
    const store = await kit.makeStore(seller, label, sector.id);
    const products: any[] = [];
    for (let i = 0; i < weights.length; i++) {
      const p = await kit.makeProduct(seller, store.storeId, `P${i} ${label}`, weights[i], price);
      await kit.insertInventory({ sellerId: seller.sellerId, productId: p.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: store.floc.id, quantityOnHand: 50 });
      products.push(p);
    }
    return { sector, seller, store, products };
  };
  const prev = async (lines: Array<{ productId: string; quantity?: number }>, serviceCode: string) =>
    resolveCartShippingPreview({ destinationShippingSectorId: bissau.id, serviceCode, items: lines.map((l) => ({ productId: l.productId, variantId: null, quantity: l.quantity ?? 1 })) }, db) as Promise<any>;
  const counts = async () => JSON.stringify([(await db.select().from(orders)).length, (await db.select().from(purchaseGroups)).length, (await db.select().from(stockReservations)).length]);
  const attempt = async (fn: () => Promise<any>) => { try { return { ok: true as const, value: await fn() }; } catch (e: any) { return { ok: false as const, error: e }; } };
  const place = async (lines: Array<{ productId: string; quantity?: number }>, serviceCode: string, expected: number | null) => {
    const buyer = await kit.makeBuyer(bissau.id);
    for (const l of lines) await kit.addToCart(buyer.cartId, l.productId, l.quantity ?? 1);
    return attempt(() => OrderService.createOrderFromCart({ userId: buyer.buyerId, addressId: buyer.addressId, paymentMethod: 'pix', shippingSelection: { serviceCode, expectedShippingChargedToBuyer: expected } } as any, db));
  };
  const itemsOf = async (orderId: string) => db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const orderOf = async (orderId: string) => (await db.select().from(orders).where(eq(orders.id, orderId)))[0];

  // ---------- 1. mesma origem, dois produtos: faixa do peso total
  const s1 = await shop('mesma', [0.6, 0.6]);
  const b1 = await bands(s1.sector.id);
  const l1 = s1.products.map((p) => ({ productId: p.id }));
  const pv1 = await prev(l1, 'STANDARD');
  report('D1 dois produtos de 0,6 kg na mesma origem: UMA expedição de 1,2 kg na faixa [1,5) = 1500 (e não 2×1000 = 2000 por linha)', pv1.available === true && pv1.shippingChargedToBuyer === 1500 && pv1.shippingCost === 1500, pv1);
  const r1 = await place(l1, 'STANDARD', pv1.shippingChargedToBuyer);
  if (!r1.ok) report('D2 pedido consolidado criado', false, codeOf(r1.error)); else {
    const o = await orderOf(r1.value.orders[0].id); const items = await itemsOf(o.id);
    report('D2 pedido: frete 1500 == preview; total = subtotal + 1500; custo real 1500', Number(o.shippingFee) === 1500 && Number(o.shippingCost) === 1500 && Number(o.totalAmount) === Number(o.subtotal) + 1500, o);
    report('D3 order_items: frete repartido 750 + 750 (soma = valor da expedição) e as duas linhas apontam para a MESMA tarifa da faixa 1–5 kg', items.length === 2 && sum(items.map((i: any) => Number(i.shippingAmount))) === 1500 && items.every((i: any) => Number(i.shippingAmount) === 750 && i.shippingRateId === b1.std2 && i.shippingServiceCode === 'STANDARD' && i.shippingRouteId === b1.route.id), items.map((i: any) => [i.shippingAmount, i.shippingRateId]));
    report('D4 snapshots por linha preservados: peso de cada linha é o seu (0,6 kg) e a soma dos pesos = peso da expedição', items.every((i: any) => Math.abs(Number(i.totalWeightKg) - 0.6) < 1e-6) && Math.abs(sum(items.map((i: any) => Number(i.totalWeightKg))) - 1.2) < 1e-6, items.map((i: any) => i.totalWeightKg));
  }

  // ---------- 2. pesos diferentes: repartição por peso, soma exata
  const s2 = await shop('pesos', [0.2, 0.9]);
  await bands(s2.sector.id);
  const l2 = s2.products.map((p) => ({ productId: p.id }));
  const pv2 = await prev(l2, 'STANDARD');
  const r2 = await place(l2, 'STANDARD', pv2.shippingChargedToBuyer);
  if (!r2.ok) report('D5 pedido com pesos diferentes', false, codeOf(r2.error)); else {
    const items = (await itemsOf(r2.value.orders[0].id)).sort((a: any, b: any) => Number(a.totalWeightKg) - Number(b.totalWeightKg));
    const amounts = items.map((i: any) => Number(i.shippingAmount));
    report('D5 0,2 kg + 0,9 kg = 1,1 kg → 1500 repartido por peso (272,73 + 1227,27), soma exata, linha mais pesada paga mais', pv2.shippingChargedToBuyer === 1500 && sum(amounts) === 1500 && amounts[0] === 272.73 && amounts[1] === 1227.27, amounts);
  }

  // ---------- 3. quantidade: uma linha com quantidade 3 + outra linha
  const s3 = await shop('qtd', [0.4, 0.3]);
  await bands(s3.sector.id);
  const l3 = [{ productId: s3.products[0].id, quantity: 3 }, { productId: s3.products[1].id, quantity: 1 }]; // 1,2 + 0,3 = 1,5 kg
  const pv3 = await prev(l3, 'STANDARD');
  report('D6 quantidade entra no peso: 3×0,4 + 1×0,3 = 1,5 kg → faixa 1–5 kg = 1500', pv3.available === true && pv3.shippingChargedToBuyer === 1500, pv3);

  // ---------- 4. um só produto: comportamento anterior idêntico
  const s4 = await shop('um', [0.5]);
  await bands(s4.sector.id);
  const pv4 = await prev([{ productId: s4.products[0].id }], 'STANDARD');
  report('D7 uma única linha: sem consolidação, mesma tarifa da faixa do seu peso (0,5 kg → 1000)', pv4.available === true && pv4.shippingChargedToBuyer === 1000, pv4);

  // ---------- 5. peso total sem faixa: indisponível, sem partir o frete por linha
  const s5 = await shop('pesado', [2.5, 2.5, 2.5]); // 3 × 2,5 = 7,5 kg > 5 kg (cada linha sozinha caberia)
  await bands(s5.sector.id);
  const l5 = s5.products.map((p) => ({ productId: p.id }));
  const pv5 = await prev(l5, 'STANDARD');
  report('D8 peso total 7,5 kg acima da maior faixa: serviço INDISPONÍVEL no preview com motivo de tarifa (nunca soma de tarifas por linha)', pv5.available === false && pv5.code === 'SHIPPING_RATE_NOT_AVAILABLE' && /7\.5 kg|7,5 kg/.test(String(pv5.message)), pv5);
  const before5 = await counts();
  const r5 = await place(l5, 'STANDARD', 3 * 1500);
  report('D9 mesmo no pedido: 409 SHIPPING_SERVICE_UNAVAILABLE e NADA criado (sem pedido parcial/reserva)', !r5.ok && (r5 as any).error.code === 'SHIPPING_SERVICE_UNAVAILABLE' && (r5 as any).error.httpStatus === 409 && (await counts()) === before5, r5.ok ? 'criou' : codeOf((r5 as any).error));
  const pv5one = await prev([l5[0]], 'STANDARD');
  report('D10 cada produto sozinho continua com frete (2,5 kg → 1500): só a expedição consolidada fica fora da faixa', pv5one.available === true && pv5one.shippingChargedToBuyer === 1500, pv5one);

  // ---------- 6. nunca consolidar entre vendedores, lojas ou locais diferentes
  const sa = await shop('vendA', [0.6]); await bands(sa.sector.id);
  const sb = await shop('vendB', [0.6]); await bands(sb.sector.id);
  const pvAB = await prev([{ productId: sa.products[0].id }, { productId: sb.products[0].id }], 'STANDARD');
  report('D11 vendedores diferentes: cada um com a sua expedição (1000 + 1000), nunca somando pesos entre eles', pvAB.available === true && pvAB.shippingChargedToBuyer === 2000 && pvAB.sellers.length === 2, pvAB);

  const sSame = sectors[nextSector++]; await bands(sSame.id);
  const sellerC = await kit.makeSeller('duasLojas');
  const storeC1 = await kit.makeStore(sellerC, 'lojaC1', sSame.id), storeC2 = await kit.makeStore(sellerC, 'lojaC2', sSame.id);
  const pc1 = await kit.makeProduct(sellerC, storeC1.storeId, 'PC1', 0.6, 100), pc2 = await kit.makeProduct(sellerC, storeC2.storeId, 'PC2', 0.6, 100);
  await kit.insertInventory({ sellerId: sellerC.sellerId, productId: pc1.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: storeC1.floc.id, quantityOnHand: 50 });
  await kit.insertInventory({ sellerId: sellerC.sellerId, productId: pc2.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: storeC2.floc.id, quantityOnHand: 50 });
  const pvC = await prev([{ productId: pc1.id }, { productId: pc2.id }], 'STANDARD');
  report('D12 mesmo vendedor, DUAS lojas comerciais (mesmo setor): grupos de pedido diferentes → não consolidam (1000 + 1000)', pvC.available === true && pvC.shippingChargedToBuyer === 2000 && pvC.sellers.length === 2, pvC);

  const sD = sectors[nextSector++]; const sDhub = sectors[nextSector++];
  await bands(sD.id); await bands(sDhub.id);
  const sellerD = await kit.makeSeller('doisLocais');
  const storeD = await kit.makeStore(sellerD, 'lojaD', sD.id);
  const hub = await kit.makeWarehouse('hubD', sDhub.id);
  const pd1 = await kit.makeProduct(sellerD, storeD.storeId, 'PD1', 0.6, 100), pd2 = await kit.makeProduct(sellerD, storeD.storeId, 'PD2', 0.6, 100);
  await kit.insertInventory({ sellerId: sellerD.sellerId, productId: pd1.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: storeD.floc.id, quantityOnHand: 50 });
  await kit.insertInventory({ sellerId: sellerD.sellerId, productId: pd2.id, locationType: 'NUSALI_HUB', fulfillmentLocationId: hub.floc.id, warehouseId: hub.warehouseId, quantityOnHand: 50 });
  const lD = [{ productId: pd1.id }, { productId: pd2.id }];
  const pvD = await prev(lD, 'STANDARD');
  report('D13 mesmo grupo mas locais de expedição diferentes (loja e HUB): duas expedições, não consolidam (1000 + 1000)', pvD.available === true && pvD.shippingChargedToBuyer === 2000, pvD);
  const rD = await place(lD, 'STANDARD', 2000);
  if (!rD.ok) report('D14 pedido com dois locais', false, codeOf(rD.error)); else {
    const items = await itemsOf(rD.value.orders[0].id);
    report('D14 pedido com dois locais: frete 2000 e cada linha com a SUA tarifa de 1000 (faixa 0–1 kg)', sum(items.map((i: any) => Number(i.shippingAmount))) === 2000 && items.every((i: any) => Number(i.shippingAmount) === 1000), items.map((i: any) => i.shippingAmount));
  }

  // ---------- 7. preview == pedido em cada serviço (faixas próprias por serviço)
  const s7 = await shop('servicos', [0.6, 0.6]); await bands(s7.sector.id);
  const l7 = s7.products.map((p) => ({ productId: p.id }));
  for (const [code, amount] of [['STANDARD', 1500], ['EXPRESS', 3000]] as const) {
    const pv = await prev(l7, code);
    const r = await place(l7, code, pv.shippingChargedToBuyer);
    const o = r.ok ? await orderOf(r.value.orders[0].id) : null;
    report(`D15 ${code}: preview = pedido = ${amount} (consolidado na faixa do peso total) e todas as linhas com o serviço ${code}`, r.ok && pv.shippingChargedToBuyer === amount && Number(o!.shippingFee) === amount && (await itemsOf(o!.id)).every((i: any) => i.shippingServiceCode === code), r.ok ? o : codeOf((r as any).error));
  }
  const pvEco = await prev(l7, 'ECONOMY');
  report('D16 Economy sem tarifa na rota continua indisponível (consolidação não inventa serviço)', pvEco.available === false, pvEco);

  // ---------- 8. política de frete grátis + subsídio com expedição consolidada
  const s8 = await shop('politica', [0.6, 0.6], 20000); await bands(s8.sector.id);
  await db.insert(storeShippingPolicies).values({ id: kit.uid('pol'), storeId: s8.store.storeId, sellerId: s8.seller.sellerId, mode: 'SELLER_FREE_SHIPPING', isActive: true } as any);
  const l8 = s8.products.map((p) => ({ productId: p.id }));
  const pv8 = await prev(l8, 'STANDARD');
  const r8 = await place(l8, 'STANDARD', pv8.shippingChargedToBuyer);
  const o8 = r8.ok ? await orderOf(r8.value.orders[0].id) : null;
  report('D17 frete grátis do vendedor com expedição consolidada: cobrado 0, custo real 1500 e subsídio 1500 registrados; total = subtotal', r8.ok && pv8.shippingChargedToBuyer === 0 && pv8.shippingCost === 1500 && Number(o8!.shippingFee) === 0 && Number(o8!.shippingCost) === 1500 && Number(o8!.shippingSellerSubsidy) === 1500 && Number(o8!.totalAmount) === Number(o8!.subtotal), r8.ok ? o8 : codeOf((r8 as any).error));

  // ---------- 9. confirmação/travamento da Etapa C com a expedição consolidada
  const s9 = await shop('confirma', [0.6, 0.6]); const b9 = await bands(s9.sector.id);
  const l9 = s9.products.map((p) => ({ productId: p.id }));
  const before9 = await counts();
  const stale = await place(l9, 'STANDARD', 2000); // o cliente viu o valor por linha antigo
  report('D18 valor confirmado diferente do consolidado (2000 × 1500): 409 SHIPPING_QUOTE_CHANGED com o valor atual 1500, nada criado', !stale.ok && (stale as any).error.code === 'SHIPPING_QUOTE_CHANGED' && (stale as any).error.details?.currentShippingChargedToBuyer === 1500 && (await counts()) === before9, stale.ok ? 'criou' : (stale as any).error?.details);
  await db.update(shippingRouteRates).set({ minWeightKg: '0', maxWeightKg: '1.1', updatedAt: new Date() } as any).where(eq(shippingRouteRates.id, b9.std2)); // a faixa deixa de cobrir 1,2 kg
  const nobands = await place(l9, 'STANDARD', 1500);
  report('D19 faixa da tarifa consolidada alterada (não cobre 1,2 kg): 409 indisponível, nada criado', !nobands.ok && (nobands as any).error.code === 'SHIPPING_SERVICE_UNAVAILABLE' && (await counts()) === before9, nobands.ok ? 'criou' : codeOf((nobands as any).error));

  // ---------- 10. repartição: soma exata, determinística
  const cases: Array<[number, number[]]> = [[100, [1, 1, 1]], [1500, [0.2, 0.9]], [1000, [0.333, 0.333, 0.334]], [0.05, [1, 1, 1]], [999.99, [0.1, 0.25, 0.65]], [1500, [0, 0]], [1500, [5]]];
  const exact = cases.every(([t, w]) => Math.abs(sum(allocateByWeight(t, w)) - t) < 1e-9 && allocateByWeight(t, w).every((x) => x >= 0));
  report('D20 allocateByWeight: soma exata (centésimos, maior resto), sem negativos, também com pesos zero e uma só linha', exact, cases.map(([t, w]) => allocateByWeight(t, w)));
  report('D21 allocateByWeight determinístico: 100 em 3 partes iguais = 33,34 + 33,33 + 33,33 (resto para a primeira, sempre)', JSON.stringify(allocateByWeight(100, [1, 1, 1])) === JSON.stringify([33.34, 33.33, 33.33]) && JSON.stringify(allocateByWeight(100, [1, 1, 1])) === JSON.stringify(allocateByWeight(100, [1, 1, 1])));

  // ---------- 11. travas de código
  const svc = fs.readFileSync('src/server/modules/orders/orderService.ts', 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
  const pvs = fs.readFileSync('src/server/modules/shipping/shippingPreviewService.ts', 'utf8');
  const iPlan = svc.indexOf('await planShipments(tx,'), iGuard = svc.indexOf('await lockAndVerifyRates('), iGroup = svc.indexOf('await tx.insert(purchaseGroups)');
  report('D22 preview e pedido usam o MESMO planejador; no pedido o plano vem antes do travamento/conferência e de qualquer escrita; a conferência usa o peso da EXPEDIÇÃO', pvs.includes('await planShipments(db,') && iPlan > 0 && iGuard > iPlan && iGroup > iGuard && svc.includes('shipmentPlan.shipments.map((sh) => ({ rateId: sh.rateId, amount: sh.amount, weightKg: sh.totalWeightKg'), { iPlan, iGuard, iGroup });

  console.log(`\n${passed}/${total} passaram`);
  await pool.end();
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
