/**
 * P2 (pos-matriz v2) — VOLTAGEM / CAPACIDADE como eixos de variacao, ponta a ponta no backend real (Postgres 17 DESCARTAVEL):
 * criacao (110 V e 220 V como variacoes), eixo obrigatorio exigido, ficha/seletor do comprador sobre o payload REAL do detalhe,
 * carrinho (variacao correta, preco proprio, retrato dos eixos), checkout (item do pedido, titulo, snapshot, reserva de estoque SO da variacao
 * escolhida) e combinacao indisponivel. Nunca producao.
 */
process.env.REDIS_URL = '';
import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';
const testDbUrl = assertLedgerTestDatabaseGuard();
process.env.DATABASE_URL = testDbUrl;
process.env.NODE_ENV = 'test';
process.env.SKIP_RUNTIME_ALIGN = 'true';
import 'dotenv/config';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import { users, sellers, stores, categories, countries, addresses, platformSettings, shippingSectors, shippingRoutes, shippingServices, shippingRouteRates, productVariants } from '../src/db/schema.js';
import { seedGuineaBissauShippingGeography } from '../src/server/modules/shipping/shippingGeographyService.js';
import { ProductCreationService } from '../src/server/modules/catalog/productCreationService.js';
import { createAttribute } from '../src/server/modules/catalog/attributeDefinitionService.js';
import { OrderService } from '../src/server/modules/orders/orderService.js';
import { CatalogService } from '../src/server/modules/catalog/catalogService.js';
import { addItemsBatchForUser } from '../src/server/buyerRoutes.js';
import { describeBuyerAxes, buildAxisSpecRows, cartSelectionFor } from '../src/utils/buyerVariantAxes.js';
import { computeBuyerPriceDisplay, getSelectionGuardMessage, getSizesForColor, isVariantAvailable, resolveSelectedVariant } from '../src/utils/productVariantBuyer.js';

if (!['localhost', '127.0.0.1'].includes(new URL(testDbUrl).hostname)) throw new Error('Somente banco local descartavel.');
const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false }, max: 6 });
const db = drizzle(pool, { schema });
let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 700)}`); };
const q = async (s: string, p?: any[]) => (await pool.query(s, p)).rows;
let seq = 0;
const uid = (p: string) => `${p}_p2_${Date.now()}_${++seq}_${Math.random().toString(36).slice(2, 6)}`;
async function makeUser(role: string, id = uid('usr')) {
  await db.insert(users).values({ id, email: `${id}@t.test`, passwordHash: 'x', fullName: `T ${id}`, phone: '11999990000', role, countryCode: 'GW', kycStatus: 'verified', riskScore: 'baixo', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date() } as any);
  return id;
}
const tryCreate = async (userId: string, input: any) => { try { return { p: (await ProductCreationService.createProduct(userId, input, db)) as any, e: null as any }; } catch (e: any) { return { p: null as any, e }; } };

async function main() {
  await db.insert(countries).values([{ id: 'GW', code: 'GW', name: 'Guiné-Bissau', flag: 'x', currency: 'XOF', currencySymbol: 'CFA', phonePrefix: '+245', isActive: true, createdAt: new Date() }] as any).onConflictDoNothing();
  await seedGuineaBissauShippingGeography(db);
  const [bissau] = await db.select().from(shippingSectors).where(and(eq(shippingSectors.countryCode, 'GW'), eq(shippingSectors.name, 'Bissau')));
  const [svc] = await db.select().from(shippingServices).where(and(eq(shippingServices.countryCode, 'GW'), eq(shippingServices.code, 'STANDARD')));
  const [route] = await db.select().from(shippingRoutes).where(and(eq(shippingRoutes.countryCode, 'GW'), eq(shippingRoutes.originSectorId, bissau.id), eq(shippingRoutes.destinationSectorId, bissau.id)));
  await db.insert(shippingRouteRates).values({ id: uid('rate'), routeId: route.id, serviceId: svc.id, minWeightKg: '0', maxWeightKg: '5', amount: '200', currency: 'XOF', isActive: true, createdAt: new Date(), updatedAt: new Date() } as any);
  await db.insert(platformSettings).values({ key: 'multiSellerCheckoutEnabled', valueJson: true, updatedAt: new Date() } as any).onConflictDoUpdate({ target: platformSettings.key, set: { valueJson: true, updatedAt: new Date() } });

  await db.insert(categories).values([
    { id: 'cat_volt', name: 'Eletrodomésticos', slug: 'eletro', isActive: true, commissionRate: '10.00' as any, createdAt: new Date() }, // so Voltagem (opcional)
    { id: 'cat_corvolt', name: 'Ventiladores', slug: 'vent', isActive: true, commissionRate: '10.00' as any, createdAt: new Date() },     // Cor obrigatoria + Voltagem
    { id: 'cat_cap', name: 'Pen drives', slug: 'pen', isActive: true, commissionRate: '10.00' as any, createdAt: new Date() },             // Capacidade obrigatoria
  ] as any);
  await createAttribute(db, 'cat_volt', { name: 'Voltagem', code: 'voltagem', type: 'select', role: 'variant_axis', optionsJson: ['110V', '220V', 'Bivolt'] });
  await createAttribute(db, 'cat_corvolt', { name: 'Cor', code: 'cor', type: 'select', role: 'variant_axis', isRequired: true, optionsJson: ['Preto', 'Branco'] });
  await createAttribute(db, 'cat_corvolt', { name: 'Voltagem', code: 'voltagem', type: 'select', role: 'variant_axis', optionsJson: ['110V', '220V'] });
  await createAttribute(db, 'cat_cap', { name: 'Capacidade', code: 'capacidade', type: 'select', role: 'variant_axis', isRequired: true, optionsJson: ['32 GB', '64 GB'] });

  const sellerUser = await makeUser('SELLER'); const sellerId = uid('seller');
  await db.insert(sellers).values({ id: sellerId, userId: sellerUser, companyName: 'S', tradingName: 'S', taxId: '0', phone: '1', countryCode: 'GW', status: 'active', kycStatus: 'verified', isEmailVerified: true, createdAt: new Date(), updatedAt: new Date() } as any);
  const sAddr = uid('addr');
  await db.insert(addresses).values({ id: sAddr, userId: sellerUser, recipientName: 'L', street: 'R', number: '1', city: 'Bissau', state: 'Bissau', countryCode: 'GW', phone: '955000000', isDefault: false, addressType: 'business', shippingSectorId: bissau.id, createdAt: new Date(), updatedAt: new Date() } as any);
  const storeId = uid('store');
  await db.insert(stores).values({ id: storeId, sellerId, name: 'Loja P2', slug: `loja-p2-${storeId}`, countryCode: 'GW', status: 'active', operationalAddressId: sAddr, createdAt: new Date(), updatedAt: new Date() } as any);
  const common = { price: 1000, image: 'x.jpg', storeId, weightKg: 0.3, dimensionsCm: { length: 5, width: 5, height: 5 }, specs: {} } as any;

  // ---- A. produto com Voltagem como eixo de variacao: 110 V e 220 V, preco/estoque proprios
  const a = await tryCreate(sellerUser, { ...common, title: 'Liquidificador', categoryId: 'cat_volt', stock: 0, variants: [
    { sku: 'LQ-110', price: 1000, stock: 6, attributesJson: { voltagem: '110v' } },
    { sku: 'LQ-220', price: 1100, stock: 3, attributesJson: { voltagem: '220V' } },
  ] });
  const av = a.p ? await q('SELECT id, sku, title, price::float p, attributes_json aj, variant_key k FROM product_variants WHERE product_id=$1 ORDER BY sku', [a.p.id]) : [];
  report('A1 110 V e 220 V viram DUAS variacoes (mesmo sistema product_variants + attributes_json): valor canonizado ("110v" -> "110V"), variant_key por voltagem, preco proprio', !!a.p && av.length === 2 && av[0].aj.voltagem === '110V' && av[1].aj.voltagem === '220V' && av[0].k === 'voltagem=110v' && av[1].k === 'voltagem=220v' && av[0].p === 1000 && av[1].p === 1100, { e: a.e?.message, av });
  report('A2 titulo padrao de cada variacao inclui a voltagem (e o que o pedido guarda e o vendedor le): "110V" e "220V"', av[0]?.title === '110V' && av[1]?.title === '220V', av.map((v: any) => v.title));
  const ainv = a.p ? await q('SELECT v.sku, i.quantity_on_hand q, i.variant_id FROM inventory i LEFT JOIN product_variants v ON v.id=i.variant_id WHERE i.product_id=$1 ORDER BY v.sku NULLS FIRST', [a.p.id]) : [];
  report('A3 estoque por variacao no inventory (6 e 3), nenhuma linha de estoque do produto sem variacao', ainv.length === 2 && ainv.every((r: any) => !!r.variant_id) && JSON.stringify(ainv.map((r: any) => r.q)) === '[6,3]', ainv);
  const dup = await tryCreate(sellerUser, { ...common, title: 'Dup', categoryId: 'cat_volt', stock: 0, variants: [{ sku: 'DUP-1', price: 1, stock: 1, attributesJson: { voltagem: '110V' } }, { sku: 'DUP-2', price: 1, stock: 1, attributesJson: { voltagem: '110v' } }] });
  report('A4 a mesma voltagem duas vezes (110V / 110v) = combinacao duplicada, recusada; nada criado', !dup.p && dup.e?.code === 'VARIANT_AXES_INVALID' && dup.e?.details?.[0]?.code === 'DUPLICATE_COMBINATION', dup.e?.message);
  const bad = await tryCreate(sellerUser, { ...common, title: 'Fora', categoryId: 'cat_volt', stock: 0, variants: [{ sku: 'BAD-1', price: 1, stock: 1, attributesJson: { voltagem: '380V' } }] });
  report('A5 voltagem fora das opcoes da categoria (380V) recusada', !bad.p && bad.e?.code === 'VARIANT_AXES_INVALID' && bad.e?.details?.[0]?.code === 'AXIS_INVALID', bad.e?.message);

  // ---- B. eixo obrigatorio continua obrigatorio; produto de UMA unica opcao = uma variacao
  const noVar = await tryCreate(sellerUser, { ...common, title: 'Pen sem variacao', categoryId: 'cat_cap', stock: 5 });
  report('B1 categoria com Capacidade obrigatoria: produto SEM variacao e recusado (400 AXIS_REQUIRED) e orienta "uma so opcao"; nada criado', !noVar.p && noVar.e?.code === 'VARIANT_AXES_INVALID' && noVar.e?.details?.[0]?.code === 'AXIS_REQUIRED' && /ao menos uma variação/.test(noVar.e?.message) && (await q("SELECT count(*)::int n FROM products WHERE title='Pen sem variacao'"))[0].n === 0, noVar.e?.message);
  const noVal = await tryCreate(sellerUser, { ...common, title: 'Pen sem valor', categoryId: 'cat_cap', stock: 0, variants: [{ sku: 'PEN-X', price: 50, stock: 2 }] });
  report('B2 a unica variacao sem o valor do eixo obrigatorio tambem e recusada (AXIS_REQUIRED por variacao)', !noVal.p && noVal.e?.details?.[0]?.code === 'AXIS_REQUIRED', noVal.e?.message);
  const one = await tryCreate(sellerUser, { ...common, title: 'Pen drive 64', categoryId: 'cat_cap', stock: 0, variants: [{ sku: 'PEN-64', price: 50, stock: 9, capacity: '64 gb' }] });
  report('B3 produto de UMA unica opcao (Capacidade 64 GB) = 1 variacao: criado, valor canonizado, estoque 9 na variacao', !!one.p && (await q('SELECT capacity, variant_key k FROM product_variants WHERE product_id=$1', [one.p.id]))[0]?.capacity === '64 GB' && (await q('SELECT quantity_on_hand q FROM inventory WHERE product_id=$1', [one.p.id]))[0]?.q === 9, one.e?.message);
  const legacy = await tryCreate(sellerUser, { ...common, title: 'Sem eixos', categoryId: 'cat_volt', stock: 4 });
  report('B4 categoria SEM eixo obrigatorio (so Voltagem opcional): produto simples continua permitido (compatibilidade)', !!legacy.p && (await q('SELECT count(*)::int n FROM product_variants WHERE product_id=$1', [legacy.p.id]))[0].n === 0, legacy.e?.message);

  // ---- C. o que o comprador ve: payload REAL do detalhe + helpers do comprador
  const det: any = await CatalogService.getProductById(a.p.id);
  const ax = describeBuyerAxes(det.variants, [{ code: 'voltagem', name: 'Voltagem', role: 'variant_axis', isActive: true, optionsJson: ['110V', '220V', 'Bivolt'] }]);
  report('C1 eixos do comprador: 2a dimensao = "Voltagem" (nunca "Tamanho"), sem cor, sem tamanho', ax.hasSecond && ax.secondLabel === 'Voltagem' && !ax.hasColor && !ax.secondIsSize && ax.secondJsonKey === 'voltagem', ax);
  report('C2 opcoes reais oferecidas: 110V e 220V (Bivolt nao cadastrada pelo vendedor NAO aparece)', JSON.stringify(getSizesForColor(det.variants, null, ax.preferredJson)) === '["110V","220V"]');
  const v220 = resolveSelectedVariant(det.variants, { size: '220V', preferredJson: ax.preferredJson });
  report('C3 escolher 220V resolve a variacao CERTA (SKU LQ-220), com o preco dela (1100) e a disponibilidade viva (3)', v220?.sku === 'LQ-220' && computeBuyerPriceDisplay(det.variants, v220).price === 1100 && v220?.availableStock === 3 && isVariantAvailable(v220));
  report('C4 sem escolher a voltagem NAO resolve variacao (nunca adivinha a primeira) e a mensagem nomeia o eixo', resolveSelectedVariant(det.variants, { preferredJson: ax.preferredJson }) === null && getSelectionGuardMessage(det.variants, { preferredJson: ax.preferredJson }, ax.secondLabel) === 'Selecione a opção de Voltagem.');
  report('C5 ficha: com varias voltagens e sem escolha mostra as opcoes ("110V / 220V"); escolhida mostra a escolhida', JSON.stringify(buildAxisSpecRows(det.variants, ax, {})) === '[["Voltagem","110V / 220V"]]' && JSON.stringify(buildAxisSpecRows(det.variants, ax, { size: '220V' })) === '[["Voltagem","220V"]]');
  const detOne: any = await CatalogService.getProductById(one.p.id);
  const axOne = describeBuyerAxes(detOne.variants);
  report('C6 produto de UMA opcao: o eixo aparece na ficha como informacao ("Capacidade: 64 GB") e a variacao e resolvida sozinha', JSON.stringify(buildAxisSpecRows(detOne.variants, axOne, {})) === '[["Capacidade","64 GB"]]' && resolveSelectedVariant(detOne.variants, {})?.sku === 'PEN-64' && axOne.secondLabel === 'Capacidade');

  // ---- D. carrinho e checkout
  const [vA110, vA220] = [av.find((v: any) => v.sku === 'LQ-110')!, av.find((v: any) => v.sku === 'LQ-220')!];
  const buyer = await makeUser('BUYER');
  const addressId = uid('addr');
  await db.insert(addresses).values({ id: addressId, userId: buyer, recipientName: 'C', street: 'R', number: '1', city: 'Bissau', state: 'Bissau', countryCode: 'GW', zipCode: '', phone: '955000000', isDefault: true, addressType: 'home', shippingSectorId: bissau.id, createdAt: new Date(), updatedAt: new Date() } as any);
  const sel110 = cartSelectionFor(det.variants.find((v: any) => v.sku === 'LQ-110'), ax), sel220 = cartSelectionFor(v220, ax);
  report('D0 retrato do carrinho: eixo com nome real [{key:"voltagem",label:"Voltagem",value:"220V"}]; size compativel = "220V"', JSON.stringify(sel220.axes) === '[{"key":"voltagem","label":"Voltagem","value":"220V"}]' && sel220.size === '220V' && sel220.color === undefined);
  const added: any = await addItemsBatchForUser(db, buyer, [
    { productId: a.p.id, variantId: vA110.id, quantity: 1, selectedAttributesJson: { color: sel110.color, size: sel110.size, axes: sel110.axes } },
    { productId: a.p.id, variantId: vA220.id, quantity: 2, selectedAttributesJson: { color: sel220.color, size: sel220.size, axes: sel220.axes } },
  ]);
  const lines = added.cart?.items ?? [];
  const l110 = lines.find((i: any) => i.variantId === vA110.id), l220 = lines.find((i: any) => i.variantId === vA220.id);
  report('D1 carrinho: DUAS linhas distintas (110V e 220V), cada uma com a SUA variacao, preco real da variacao (1000 / 1100) e quantidade', lines.length === 2 && l110?.unitPrice === 1000 && l220?.unitPrice === 1100 && l110?.quantity === 1 && l220?.quantity === 2, lines.map((i: any) => [i.variantId, i.unitPrice, i.quantity]));
  report('D2 o retrato dos eixos (Voltagem: 220V) volta no carrinho do servidor para exibir o nome real', l220?.selectedAttributes?.axes?.[0]?.label === 'Voltagem' && l220?.selectedAttributes?.axes?.[0]?.value === '220V' && l110?.selectedAttributes?.axes?.[0]?.value === '110V', l220?.selectedAttributes);
  report('D3 disponibilidade viva por linha no carrinho: 110V = 6, 220V = 3 (nunca o total do produto)', l110?.product?.availableStock === 6 && l220?.product?.availableStock === 3, [l110?.product?.availableStock, l220?.product?.availableStock]);

  let order: any = null, err = '';
  try { order = await OrderService.createOrderFromCart({ userId: buyer, addressId, paymentMethod: 'pix' } as any, db); } catch (e: any) { err = e.message; }
  const o = (await q('SELECT * FROM orders WHERE buyer_id=$1', [buyer]))[0];
  const oi = o ? await q('SELECT * FROM order_items WHERE order_id=$1 ORDER BY variant_title', [o.id]) : [];
  report('E1 checkout cria o pedido com os DOIS itens, cada um com a variacao escolhida (variant_id), titulo com a voltagem, preco e quantidade da variacao', !!o && oi.length === 2 && oi[0].variant_id === vA110.id && oi[1].variant_id === vA220.id && oi[0].variant_title === '110V' && oi[1].variant_title === '220V' && Number(oi[0].unit_price) === 1000 && Number(oi[1].unit_price) === 1100 && oi[1].quantity === 2, { err, oi: oi.map((r: any) => [r.variant_id, r.variant_title, r.unit_price, r.quantity]) });
  report('E2 o item do pedido guarda o retrato dos eixos (Voltagem: 220V)', oi[1]?.attributes_json?.axes?.[0]?.label === 'Voltagem' && oi[1]?.attributes_json?.axes?.[0]?.value === '220V', oi[1]?.attributes_json);
  const inv = async (id: string) => (await q('SELECT quantity_on_hand q, quantity_reserved r FROM inventory WHERE variant_id=$1', [id]))[0];
  report('E3 a reserva de estoque e SO das variacoes escolhidas: 110V reservou 1 (de 6) e 220V reservou 2 (de 3)', (await inv(vA110.id))?.r === 1 && (await inv(vA220.id))?.r === 2 && (await inv(vA110.id))?.q === 6 && (await inv(vA220.id))?.q === 3, [await inv(vA110.id), await inv(vA220.id)]);
  const total220 = Number(oi[1]?.subtotal);
  report('E4 subtotal do item 220V = 2 x 1100 = 2200 (preco da variacao, nunca o preco-base do produto)', total220 === 2200, oi[1]?.subtotal);

  // ---- F. combinacao indisponivel: pedir mais do que a variacao tem nao passa e nao reserva nada
  const buyer2 = await makeUser('BUYER'); const addr2 = uid('addr');
  await db.insert(addresses).values({ id: addr2, userId: buyer2, recipientName: 'C', street: 'R', number: '1', city: 'Bissau', state: 'Bissau', countryCode: 'GW', zipCode: '', phone: '955000000', isDefault: true, addressType: 'home', shippingSectorId: bissau.id, createdAt: new Date(), updatedAt: new Date() } as any);
  const reservedBefore = JSON.stringify(await inv(vA220.id));
  const tooMany: any = await addItemsBatchForUser(db, buyer2, [{ productId: a.p.id, variantId: vA220.id, quantity: 2, selectedAttributesJson: { size: '220V', axes: sel220.axes } }]); // so resta 1 de 220V (3 - 2 reservados)
  console.log('   (F1 resposta do carrinho)', JSON.stringify(tooMany.error ?? 'sem erro').slice(0, 200));
  report('F1 220V com so 1 disponivel e 2 pedidos: o carrinho RECUSA (estoque da variacao, nao do produto), nao cria linha nem pedido e a reserva fica intacta', !!tooMany.error && /STOCK|ESTOQUE|stock|estoque/i.test(JSON.stringify(tooMany.error)) && JSON.stringify(await inv(vA220.id)) === reservedBefore && (await q('SELECT count(*)::int n FROM cart_items ci JOIN carts c ON c.id=ci.cart_id WHERE c.user_id=$1', [buyer2]))[0].n === 0 && (await q('SELECT count(*)::int n FROM orders WHERE buyer_id=$1', [buyer2]))[0].n === 0, tooMany.error);
  const det2: any = await CatalogService.getProductById(a.p.id);
  const ax2 = describeBuyerAxes(det2.variants);
  const v220b = resolveSelectedVariant(det2.variants, { size: '220V', preferredJson: ax2.preferredJson });
  report('F2 depois do pedido a disponibilidade viva cai (110V: 5, 220V: 1) e o seletor do comprador reflete isso', det2.variants.find((v: any) => v.sku === 'LQ-110').availableStock === 5 && v220b?.availableStock === 1, det2.variants.map((v: any) => [v.sku, v.availableStock]));
  void order; void productVariants;

  await pool.end();
  console.log(`\n=== RESULTADO: ${passed}/${total} ===`);
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
