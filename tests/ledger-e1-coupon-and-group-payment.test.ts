/**
 * LEDGER — ETAPA E1: (1) pedidos com cupom do vendedor passam a ser contabilizados na ENTREGA; (2) cada pedido filho de um purchase_group passa a ter o seu
 * PAYMENT_RECEIVED. Preserva comissão, desconto, frete, subsídios, Escrow e carteiras (nada disso é recalculado: o ledger só lê o snapshot do pedido).
 * Parte A: pura (sem banco) — construtor de lançamentos + propriedade aleatória sobre o MOTOR REAL de cálculo do pedido.
 * Parte B: Postgres DESCARTAVEL com os serviços reais (pedido → pagamento do grupo → liberação do Escrow → ledger), idempotência, concorrência,
 * isolamento por vendedor, falha + retry e snapshots. Nunca produção.
 */
import { ledgerTestDbUrl } from './support/ledgerE1Env.js';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, eq } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import { orders, purchaseGroups, payments, paymentAttempts, escrowAccounts, wallets, sellers, coupons, categories, platformSettings, refunds } from '../src/db/schema.js';
import { OrderService } from '../src/server/modules/orders/orderService.js';
import { PaymentService } from '../src/server/modules/payments/paymentService.js';
import { processRefund } from '../src/server/modules/payments/refundService.js';
import { FinancialLedgerService } from '../src/server/modules/ledger/financialLedgerService.js';
import { buildDeliveryConfirmedEntries, type OrderSnapshotForDelivery } from '../src/server/modules/ledger/deliveryConfirmedEntries.js';
import { compareOrder } from '../src/server/modules/ledger/shadowComparator.js';
import { ShippingCalculatorService } from '../src/server/modules/shipping/shippingCalculatorService.js';
import { resolveCartShippingPreview } from '../src/server/modules/shipping/shippingPreviewService.js';
import { toMicros } from '../src/server/modules/ledger/decimal.js';
import { setupCheckoutKit } from './support/checkoutTestKit.js';

let passed = 0, total = 0;
const report = (l: string, ok: boolean, d?: any) => { total++; if (ok) passed++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${l}${ok ? '' : ' -> ' + JSON.stringify(d ?? null).slice(0, 800)}`); };
const c = (n: any) => Math.round(Number(n) * 100);

function snap(o: Partial<OrderSnapshotForDelivery> & { totalAmount: string }): OrderSnapshotForDelivery {
  return { id: 'ord_x', buyerId: 'b', sellerId: 's', storeId: null, countryCode: 'GW', currency: 'XOF', marketplaceCommission: '0.00', sellerNetAmount: '1.00', discountAmount: '0.00', shippingChargedToBuyer: '0.00', shippingSellerSubsidy: '0.00', shippingMarketplaceSubsidy: '0.00', customsDuty: '0.00', ...o } as OrderSnapshotForDelivery;
}
const sumDir = (entries: any[], dir: 'DEBIT' | 'CREDIT') => entries.filter((e) => e.direction === dir).reduce((s, e) => s + toMicros(e.amount), 0n);

async function main() {
  // ============================================================================================================================================
  // PARTE A — construtor puro
  // ============================================================================================================================================
  // pedido da auditoria: produtos 5000, cupom 500, comissão 10% sobre 4500 = 450, líquido 4050, frete 1000 (cliente 500 + Nusali 500), total 5000
  const coupon = buildDeliveryConfirmedEntries(snap({ totalAmount: '5000.00', subtotal: '5000.00', commissionBase: '4500.00', discountAmount: '500.00', marketplaceCommission: '450.00', sellerNetAmount: '4050.00', shippingChargedToBuyer: '500.00', shippingMarketplaceSubsidy: '500.00' }));
  report('A1 pedido com cupom é CONTABILIZADO (antes: SKIPPED): Dr escrow 5000 + subsídio 500 = Cr comissão 450 + vendedor 4050 + frete 500 + frete-subsídio 500', coupon.status === 'OK' && sumDir(coupon.entries, 'DEBIT') === sumDir(coupon.entries, 'CREDIT') && sumDir(coupon.entries, 'DEBIT') === toMicros('5500.00'), coupon);
  if (coupon.status === 'OK') {
    const by = (code: string, dir: string) => coupon.entries.filter((e) => e.accountCode === code && e.direction === dir).map((e) => e.amount);
    report('A2 valores por conta: BUYER_ESCROW D 5000; COMISSÃO C 450 (base descontada); SELLER_PAYABLE C 4050; SHIPPING_SUBSIDY_NUSALI D 500; SHIPPING_PAYABLE C 500+500', by('BUYER_ESCROW', 'DEBIT').join() === '5000.00' && by('NUSALI_COMMISSION_REVENUE', 'CREDIT').join() === '450.00' && by('SELLER_PAYABLE', 'CREDIT').join() === '4050.00' && by('SHIPPING_SUBSIDY_NUSALI', 'DEBIT').join() === '500.00' && by('SHIPPING_PAYABLE', 'CREDIT').join() === '500.00,500.00', coupon.entries.map((e) => [e.accountCode, e.direction, e.amount]));
    report('A3 o desconto fica REGISTADO (financiado pelo vendedor, base de comissão) e não cria conta nem linha de caixa', coupon.entries.every((e) => !/DISCOUNT|PROMOTION/.test(e.accountCode)) && (coupon.entries.find((e) => e.accountCode === 'NUSALI_COMMISSION_REVENUE')!.dimensions as any).discountFundedBy === 'SELLER' && (coupon.entries.find((e) => e.accountCode === 'SELLER_PAYABLE')!.dimensions as any).sellerCouponDiscount === '500.00', coupon.entries.map((e) => e.dimensions));
  }
  const noCoupon = buildDeliveryConfirmedEntries(snap({ totalAmount: '5500.00', subtotal: '5000.00', commissionBase: '5000.00', discountAmount: '0.00', marketplaceCommission: '500.00', sellerNetAmount: '4500.00', shippingChargedToBuyer: '500.00', shippingMarketplaceSubsidy: '500.00' }));
  report('A4 pedido SEM cupom: lançamentos idênticos ao comportamento anterior (dimensions sem chaves de cupom)', noCoupon.status === 'OK' && noCoupon.entries.every((e) => !('sellerCouponDiscount' in ((e.dimensions as any) || {}))) && sumDir(noCoupon.entries, 'DEBIT') === sumDir(noCoupon.entries, 'CREDIT'), noCoupon);
  const bad = (label: string, o: Partial<OrderSnapshotForDelivery>) => { const r = buildDeliveryConfirmedEntries(snap({ totalAmount: '5000.00', subtotal: '5000.00', commissionBase: '4500.00', discountAmount: '500.00', marketplaceCommission: '450.00', sellerNetAmount: '4050.00', shippingChargedToBuyer: '500.00', shippingMarketplaceSubsidy: '500.00', ...o })); report(`A5 snapshot inválido recusado (${label}): SKIPPED/INVALID_SNAPSHOT, nenhuma linha`, r.status === 'SKIPPED' && r.reason === 'INVALID_SNAPSHOT', r); };
  bad('desconto negativo', { discountAmount: '-1.00' });
  bad('desconto maior que o subtotal', { discountAmount: '6000.00', commissionBase: '0.00' });
  bad('base de comissão ≠ subtotal − desconto', { commissionBase: '5000.00' });
  bad('comissão + líquido não fecham com a base', { sellerNetAmount: '4000.00' });
  bad('total pago ≠ (subtotal − desconto) + frete do cliente', { totalAmount: '5100.00' });

  // propriedade: 6.000 pedidos gerados pelo MOTOR REAL (cupom, comissão, frete, subsídios) — o ledger sempre fecha e reproduz comissão/líquido do pedido
  let seed = 987654321; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  let ok = 0, skippedByEngine = 0, badCount = 0; let firstBad: any = null;
  for (let i = 0; i < 6000; i++) {
    const subtotal = ri(100, 2000000) / 100, cost = ri(0, 300000) / 100, sellerSub = Math.floor(cost * ri(0, 100)) / 100 * 1, nusaliSub = Math.floor((cost - sellerSub) * ri(0, 100)) / 100;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const sub = r2(sellerSub), nus = r2(nusaliSub), buyerShip = r2(cost - sub - nus);
    const disc = rnd() < 0.5 ? 0 : r2(subtotal * ri(1, 90) / 100);
    const rate = ri(0, 3000) / 100;
    let f: any;
    try { f = ShippingCalculatorService.calculateOrderFinancials({ productSubtotal: subtotal, shippingCost: r2(cost), shippingChargedToBuyer: buyerShip, shippingSellerSubsidy: sub, shippingMarketplaceSubsidy: nus, commissionRatePercent: rate, sellerCouponDiscount: disc }); } catch { skippedByEngine++; continue; }
    if (f.sellerNetAmount <= 0) { skippedByEngine++; continue; }
    const b = buildDeliveryConfirmedEntries(snap({ totalAmount: String(f.buyerPaidTotal), subtotal: String(f.productSubtotal), commissionBase: String(f.commissionBase), discountAmount: String(f.sellerCouponDiscount), marketplaceCommission: String(f.marketplaceCommission), sellerNetAmount: String(f.sellerNetAmount), shippingChargedToBuyer: String(f.shippingChargedToBuyer), shippingSellerSubsidy: String(f.shippingSellerSubsidy), shippingMarketplaceSubsidy: String(f.shippingMarketplaceSubsidy) }));
    const good = b.status === 'OK' && sumDir(b.entries, 'DEBIT') === sumDir(b.entries, 'CREDIT') && b.entries.filter((e) => e.accountCode === 'NUSALI_COMMISSION_REVENUE').reduce((s, e) => s + toMicros(e.amount), 0n) === toMicros(String(f.marketplaceCommission)) && b.entries.filter((e) => e.accountCode === 'SELLER_PAYABLE').reduce((s, e) => s + toMicros(e.amount), 0n) === toMicros(String(f.sellerNetAmount)) && b.entries.filter((e) => e.accountCode === 'BUYER_ESCROW').reduce((s, e) => s + toMicros(e.amount), 0n) === toMicros(String(f.buyerPaidTotal));
    if (good) ok++; else { badCount++; firstBad ??= { f, b }; }
  }
  report(`A6 propriedade (${ok} pedidos do motor real, ${skippedByEngine} recusados pelo próprio motor): sempre OK, débitos = créditos, comissão e líquido do ledger = snapshot do pedido, escrow = total pago`, badCount === 0 && ok > 3000, { badCount, ok, firstBad });

  // ============================================================================================================================================
  // PARTE B — serviços reais, Postgres descartável
  // ============================================================================================================================================
  const pool = new pg.Pool({ connectionString: ledgerTestDbUrl, ssl: { rejectUnauthorized: false }, max: 12 });
  const db = drizzle(pool, { schema });
  const kit = await setupCheckoutKit(db, 'e1');
  await kit.setFlag('multiSellerCheckoutEnabled', true);
  const bissau = await kit.sector('Bissau');
  const sectors: any[] = (await db.select().from(schema.shippingSectors)).filter((x: any) => x.countryCode === 'GW' && x.id !== bissau.id).sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
  let ns = 0;
  const std = await kit.service('STANDARD');
  const setRules = (rules: any) => kit.setFlag('shippingNusaliSubsidy', { enabled: false, percent: 0, rules });
  await kit.setFlag('defaultShippingPolicyMode', 'CUSTOMER_PAYS');
  await setRules({ 'GW:STANDARD': { enabled: true, percent: 50 } });

  const shop = async (label: string, price = 5000) => {
    const sector = sectors[ns++ % sectors.length];
    const seller = await kit.makeSeller(label); const store = await kit.makeStore(seller, label, sector.id);
    const product = await kit.makeProduct(seller, store.storeId, `P ${label}`, 0.3, price);
    await kit.insertInventory({ sellerId: seller.sellerId, productId: product.id, locationType: 'SELLER_LOCATION', fulfillmentLocationId: store.floc.id, quantityOnHand: 1000 });
    await kit.insertRate((await kit.route(sector.id, bissau.id)).id, std.id, 1000, { min: 0, max: 10 });
    return { seller, store, product, price };
  };
  const addCoupon = async (s: any, code: string, pct: number) => {
    const id = kit.uid('coup');
    await db.insert(coupons).values({ id, code, title: 'Teste', sellerId: s.seller.sellerId, storeId: s.store.storeId, discountType: 'PERCENTAGE', discountValue: String(pct), currency: 'XOF', minimumSpend: '0.00', maxDiscount: null, usageLimit: null, usageLimitPerUser: null, usageCount: 0, isActive: true, createdAt: new Date(), updatedAt: new Date() } as any);
    return id;
  };
  const place = async (shops: any[], extra: Record<string, any> = {}) => {
    const buyer = await kit.makeBuyer(bissau.id);
    for (const s of shops) await kit.addToCart(buyer.cartId, s.product.id, 1, s.price);
    const q: any = await resolveCartShippingPreview({ destinationShippingSectorId: bissau.id, serviceCode: 'STANDARD', items: shops.map((s) => ({ productId: s.product.id, variantId: null, quantity: 1 })) }, db);
    const opt = q.services?.find((o: any) => o.code === 'STANDARD') ?? q;
    const value: any = await OrderService.createOrderFromCart({ userId: buyer.buyerId, addressId: buyer.addressId, paymentMethod: 'pix', shippingSelection: { serviceCode: 'STANDARD', expectedShippingChargedToBuyer: opt.shippingChargedToBuyer }, ...extra } as any, db);
    return { buyer, value };
  };
  const newGroupPayment = async (placed: any) => {
    const groupId = placed.value.purchaseGroup.id; const [g] = await db.select().from(purchaseGroups).where(eq(purchaseGroups.id, groupId));
    const payId = kit.uid('pay_group'), ext = kit.uid('EXT');
    await db.insert(payments).values({ id: payId, orderId: null, purchaseGroupId: groupId, settlementRole: 'candidate', buyerId: placed.buyer.buyerId, amount: String(g.totalAmount), currency: 'XOF', provider: 'asaas', method: 'pix', status: 'pending', idempotencyKey: `asaas_pix_group:${groupId}:${payId}`, transactionRef: ext, createdAt: new Date(), updatedAt: new Date() } as any);
    await db.insert(paymentAttempts).values({ id: kit.uid('att'), paymentId: payId, provider: 'asaas', status: 'reserved', createdAt: new Date() } as any);
    return { groupId, payId, ext, total: Number(g.totalAmount) };
  };
  const confirm = (p: { groupId: string; payId: string; ext: string; total: number }) => PaymentService.confirmPurchaseGroupPayment(p.groupId, p.payId, { provider: 'asaas', transactionRef: p.ext, receivedValue: p.total });
  const pay = async (placed: any) => { const p = await newGroupPayment(placed); await confirm(p); return p; };
  const orderRow = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0];
  const release = async (orderId: string, buyerId: string) => { await db.update(schema.shipments).set({ status: 'DELIVERED' } as any).where(eq(schema.shipments.orderId, orderId)); return PaymentService.releaseEscrowForOrder(orderId, { performedBy: buyerId }); };
  const ledger = async (orderId: string) => {
    const t = await pool.query('select id, type, status, seller_id, idempotency_key, metadata_json from ledger_transactions where order_id=$1 order by created_at, type', [orderId]);
    const e = await pool.query(`select t.type, a.code, e.direction, e.amount::numeric as amount, e.dimensions, e.seller_id from ledger_entries e join ledger_transactions t on t.id=e.transaction_id join ledger_accounts a on a.id=e.account_id where t.order_id=$1`, [orderId]);
    const bal: Record<string, number> = {};
    for (const r of e.rows) bal[r.code] = (bal[r.code] || 0) + (r.direction === 'CREDIT' ? 1 : -1) * c(r.amount);
    return { txs: t.rows, types: t.rows.map((r: any) => r.type), bal, rows: e.rows };
  };
  const walletBal = async (o: any) => { const [sel] = await db.select().from(sellers).where(eq(sellers.id, o.sellerId)); const w = (await db.select().from(wallets).where(and(eq(wallets.userId, sel.userId), eq(wallets.currency, o.currency))))[0]; return w ? c(w.balance) : 0; };
  const balancedTxs = async (orderIds: string[]) => (await pool.query(`select t.id, sum(case when e.direction='DEBIT' then e.amount else -e.amount end) d from ledger_transactions t join ledger_entries e on e.transaction_id=t.id where t.order_id = any($1) group by t.id`, [orderIds])).rows.every((r: any) => Number(r.d) === 0);

  // ---- B1 pedido COM cupom + subsídio: ciclo completo
  const sCp = await shop('cupom'); await addCoupon(sCp, 'DEZ', 10);
  const pCp = await place([sCp], { storeCoupons: [{ storeId: sCp.store.storeId, code: 'DEZ' }] });
  const oid1 = pCp.value.orders[0].id; const o1 = await orderRow(oid1);
  report('B0 regras do pedido preservadas (E1 não as altera): subtotal 5000, cupom 500, comissão 450 (sobre 4500), líquido 4050, frete cliente 500, subsídio Nusali 500, total 5000', c(o1.subtotal) === 500000 && c(o1.discountAmount) === 50000 && c(o1.commissionBase) === 450000 && c(o1.marketplaceCommission) === 45000 && c(o1.sellerNetAmount) === 405000 && c(o1.shippingFee) === 50000 && c(o1.shippingMarketplaceSubsidy) === 50000 && c(o1.totalAmount) === 500000, o1);
  const pay1 = await pay(pCp);
  const l1a = await ledger(oid1); const esc1 = (await db.select().from(escrowAccounts).where(eq(escrowAccounts.orderId, oid1)))[0];
  report('B1 pagamento do GRUPO grava PAYMENT_RECEIVED do pedido filho (antes: nenhum): Dr PAYMENT_CLEARING = Cr BUYER_ESCROW = total 5000 = Escrow retido', l1a.types.join() === 'PAYMENT_RECEIVED' && l1a.bal['BUYER_ESCROW'] === 500000 && l1a.bal['PAYMENT_CLEARING'] === -500000 && c(esc1.amount) === 500000 && l1a.txs[0].seller_id === o1.sellerId, l1a);
  const relRes: any = await release(oid1, pCp.buyer.buyerId);
  const l1b = await ledger(oid1); const wb1 = await walletBal(o1);
  report('B2 liberação grava a ENTREGA do pedido com cupom (antes: SKIPPED): comissão 450, vendedor 4050, frete 1000, despesa de subsídio 500; BUYER_ESCROW fecha em 0', [...l1b.types].sort().join() === 'ORDER_DELIVERY_CONFIRMED,PAYMENT_RECEIVED' && l1b.bal['NUSALI_COMMISSION_REVENUE'] === 45000 && l1b.bal['SELLER_PAYABLE'] === 405000 && l1b.bal['SHIPPING_PAYABLE'] === 100000 && l1b.bal['SHIPPING_SUBSIDY_NUSALI'] === -50000 && l1b.bal['BUYER_ESCROW'] === 0 && await balancedTxs([oid1]), l1b);
  report('B3 o dinheiro real NÃO mudou: carteira do vendedor = líquido 4050 (= SELLER_PAYABLE do ledger), Escrow liberado, 1 RELEASE_SELLER; desconto registado em dimensions e metadata', wb1 === 405000 && wb1 === l1b.bal['SELLER_PAYABLE'] && relRes.success === true && (await db.select().from(escrowAccounts).where(eq(escrowAccounts.orderId, oid1)))[0].status === 'released' && l1b.rows.some((r: any) => r.dimensions?.sellerCouponDiscount === '500.00') && l1b.txs.find((t: any) => t.type === 'ORDER_DELIVERY_CONFIRMED').metadata_json.sellerCouponDiscount === '500.00', { wb1 });
  const cmp = await compareOrder(oid1);
  report('B4 o comparador sombra reconhece o pagamento do grupo e reconcilia pagamento, Escrow e entrega (MATCH/MATCH/MATCH)', cmp.paymentReceived.status === 'MATCH' && cmp.escrowHold.status === 'MATCH' && cmp.deliveryConfirmed.status === 'MATCH', cmp);

  // ---- B5 controle SEM cupom (ledger igual ao comportamento anterior, mais o pagamento)
  const sNo = await shop('semcupom');
  const pNo = await place([sNo]); const oidN = pNo.value.orders[0].id; await pay(pNo); await release(oidN, pNo.buyer.buyerId);
  const lN = await ledger(oidN); const oN = await orderRow(oidN);
  report('B5 controle SEM cupom: comissão 500, vendedor 4500, escrow fecha em 0; dimensions sem chaves de cupom; carteira = SELLER_PAYABLE', lN.bal['NUSALI_COMMISSION_REVENUE'] === 50000 && lN.bal['SELLER_PAYABLE'] === 450000 && lN.bal['BUYER_ESCROW'] === 0 && lN.rows.every((r: any) => !('sellerCouponDiscount' in (r.dimensions || {}))) && await walletBal(oN) === 450000, lN);

  // ---- B6 multi-vendedor: 3 pedidos filhos, cupom só numa loja
  const mA = await shop('mA'), mB = await shop('mB'), mC = await shop('mC'); await addCoupon(mB, 'DEZ', 10);
  const pM = await place([mA, mB, mC], { storeCoupons: [{ storeId: mB.store.storeId, code: 'DEZ' }] });
  const ids: string[] = pM.value.orders.map((o: any) => o.id); const rows = await Promise.all(ids.map(orderRow));
  const payM = await pay(pM);
  const lg = await Promise.all(ids.map(ledger));
  report('B7 grupo com 3 vendedores: 1 PAYMENT_RECEIVED POR pedido filho, cada um com o total do SEU pedido e o seu vendedor; soma = pagamento do grupo', lg.every((x, i) => x.types.join() === 'PAYMENT_RECEIVED' && x.bal['BUYER_ESCROW'] === c(rows[i].totalAmount) && x.txs[0].seller_id === rows[i].sellerId) && lg.reduce((s, x) => s + x.bal['BUYER_ESCROW'], 0) === Math.round(payM.total * 100) && new Set(lg.map((x) => x.txs[0].id)).size === 3, lg.map((x) => x.bal));
  const byStore = (st: any) => rows.find((r: any) => r.storeId === st.store.storeId)!;
  await release(byStore(mB).id, pM.buyer.buyerId);
  const lB = await ledger(byStore(mB).id), lA = await ledger(byStore(mA).id), lC = await ledger(byStore(mC).id);
  report('B8 isolamento: liberar só a loja B (com cupom) lança só a entrega de B (comissão 450/líquido 4050); A e C continuam só com o pagamento e escrow retido', [...lB.types].sort().join() === 'ORDER_DELIVERY_CONFIRMED,PAYMENT_RECEIVED' && lB.bal['SELLER_PAYABLE'] === 405000 && lA.types.join() === 'PAYMENT_RECEIVED' && lC.types.join() === 'PAYMENT_RECEIVED' && lA.bal['SELLER_PAYABLE'] === undefined && await balancedTxs(ids), { B: lB.types, A: lA.types, C: lC.types });

  // ---- B9 idempotência / concorrência
  const reps = await Promise.allSettled([1, 2, 3, 4].map(() => confirm(payM)));
  const lgAfter = await Promise.all(ids.map(ledger));
  report('B9 reentrega do mesmo pagamento (4 em paralelo): nenhum erro, continua 1 PAYMENT_RECEIVED por pedido e nenhum lançamento duplicado', !reps.some((r) => r.status === 'rejected') && lgAfter.every((x) => x.types.filter((t: string) => t === 'PAYMENT_RECEIVED').length === 1), { rej: reps.filter((r) => r.status === 'rejected').map((r: any) => r.reason?.message?.slice(0, 120)) });
  const concPR = await Promise.allSettled([1, 2, 3, 4, 5].map(() => FinancialLedgerService.recordPaymentReceived({ orderId: ids[0] })));
  const concDC = await Promise.allSettled([1, 2, 3, 4, 5].map(() => FinancialLedgerService.recordDeliveryConfirmed({ orderId: byStore(mB).id })));
  const lAfter2 = await ledger(byStore(mB).id);
  report('B10 chamadas concorrentes (5×PAYMENT_RECEIVED, 5×ENTREGA com cupom): sem erro e exatamente 1 transação de cada tipo', !concPR.some((r) => r.status === 'rejected') && !concDC.some((r) => r.status === 'rejected') && lAfter2.types.filter((t: string) => t === 'ORDER_DELIVERY_CONFIRMED').length === 1 && (await ledger(ids[0])).types.filter((t: string) => t === 'PAYMENT_RECEIVED').length === 1, { concPR: concPR.map((r) => r.status), concDC: concDC.map((r) => r.status) });

  // ---- B11 pagamento surplus não gera PAYMENT_RECEIVED
  const sSur = await shop('surplus'); const pSur = await place([sSur]); const oidS = pSur.value.orders[0].id; const first = await pay(pSur);
  const second = await newGroupPayment(pSur); const resSur: any = await confirm(second);
  const [secRow] = await db.select().from(payments).where(eq(payments.id, second.payId));
  report('B11 pagamento excedente (surplus) NÃO financia pedido algum: papel surplus e continua 1 só PAYMENT_RECEIVED', resSur.settlementRole === 'surplus' && secRow.settlementRole === 'surplus' && (await ledger(oidS)).types.filter((t: string) => t === 'PAYMENT_RECEIVED').length === 1 && first.total === second.total, resSur);

  // ---- B12 falha do ledger numa das lojas: fluxo real intacto, as outras seguem, a repetição completa
  const fA = await shop('fA'), fB = await shop('fB'), fC = await shop('fC');
  const pF = await place([fA, fB, fC]); const idsF: string[] = pF.value.orders.map((o: any) => o.id).sort(); const failId = idsF[1];
  const origPR = FinancialLedgerService.recordPaymentReceived;
  (FinancialLedgerService as any).recordPaymentReceived = async (i: any) => { if (i.orderId === failId) throw new Error('ledger indisponível (simulado)'); return origPR.call(FinancialLedgerService, i); };
  const payF = await newGroupPayment(pF); let confirmErr: any = null; try { await confirm(payF); } catch (e) { confirmErr = e; }
  (FinancialLedgerService as any).recordPaymentReceived = origPR;
  const lf = await Promise.all(idsF.map(ledger)); const escF = await Promise.all(idsF.map(async (i) => (await db.select().from(escrowAccounts).where(eq(escrowAccounts.orderId, i)))[0]));
  report('B12 ledger indisponível para 1 pedido: o pagamento do grupo CONCLUI (escrow dos 3 retido, sem erro); os outros 2 vendedores têm o seu PAYMENT_RECEIVED; o do pedido afetado fica pendente', confirmErr === null && escF.every((e) => e?.status === 'held') && lf[0].types.length === 1 && lf[1].types.length === 0 && lf[2].types.length === 1, { confirmErr: confirmErr?.message, lf: lf.map((x) => x.types) });
  await confirm(payF);
  const lf2 = await Promise.all(idsF.map(ledger));
  report('B13 a repetição idempotente completa o que faltou: o pedido afetado ganha o seu PAYMENT_RECEIVED e os outros dois NÃO são duplicados', lf2.every((x) => x.types.join() === 'PAYMENT_RECEIVED') && new Set(lf2.map((x) => x.txs[0].id)).size === 3, lf2.map((x) => x.types));

  // ---- B14 a liberação garante o pagamento no ledger antes da entrega (BUYER_ESCROW nunca fica negativo)
  const gA = await shop('gA'); const pG = await place([gA]); const oidG = pG.value.orders[0].id;
  (FinancialLedgerService as any).recordPaymentReceived = async () => { throw new Error('ledger indisponível (simulado)'); };
  await pay(pG);
  (FinancialLedgerService as any).recordPaymentReceived = origPR;
  const lg0 = await ledger(oidG);
  await release(oidG, pG.buyer.buyerId); const lg1 = await ledger(oidG);
  report('B14 pagamento sem lançamento + liberação: a liberação completa o PAYMENT_RECEIVED antes da entrega; BUYER_ESCROW fecha em 0 (nunca negativo)', lg0.types.length === 0 && [...lg1.types].sort().join() === 'ORDER_DELIVERY_CONFIRMED,PAYMENT_RECEIVED' && lg1.bal['BUYER_ESCROW'] === 0, { lg0: lg0.types, lg1 });

  // ---- B15 snapshots: mudar cupom, comissão, subsídio e política DEPOIS da compra não altera o que o ledger contabiliza
  const hs = await shop('snap'); const hsCoupon = await addCoupon(hs, 'DEZ', 10);
  const pH = await place([hs], { storeCoupons: [{ storeId: hs.store.storeId, code: 'DEZ' }] }); const oidH = pH.value.orders[0].id;
  await db.update(coupons).set({ discountValue: '90' } as any).where(eq(coupons.id, hsCoupon));
  await db.update(categories).set({ commissionRate: '30.00' } as any);
  await db.update(sellers).set({ commissionRate: '40.00' } as any).where(eq(sellers.id, hs.seller.sellerId));
  await setRules({ 'GW:STANDARD': { enabled: true, percent: 0 } }); await kit.setFlag('defaultShippingPolicyMode', 'SELLER_FREE_SHIPPING');
  await pay(pH); await release(oidH, pH.buyer.buyerId); const lH = await ledger(oidH);
  report('B15 regras alteradas depois da compra (cupom 10→90%, comissão 10→30/40%, subsídio 50→0%, política): o ledger usa o snapshot original — comissão 450, vendedor 4050, subsídio 500', lH.bal['NUSALI_COMMISSION_REVENUE'] === 45000 && lH.bal['SELLER_PAYABLE'] === 405000 && lH.bal['SHIPPING_SUBSIDY_NUSALI'] === -50000 && await walletBal(await orderRow(oidH)) === 405000, lH.bal);
  await db.update(categories).set({ commissionRate: '10.00' } as any); await kit.setFlag('defaultShippingPolicyMode', 'CUSTOMER_PAYS'); await setRules({ 'GW:STANDARD': { enabled: true, percent: 50 } });

  // ---- B16 escopo da E1: reembolso continua funcionando como antes e NÃO grava ledger de reembolso (isso é a E3)
  const rf = await shop('rf'); const pR = await place([rf]); const oidR = pR.value.orders[0].id; await pay(pR);
  const tot = Number((await orderRow(oidR)).totalAmount);
  const ref: any = await processRefund({ orderId: oidR, amount: tot, reason: 'teste E1', idempotencyKey: `e1_${oidR}` });
  const lR = await ledger(oidR);
  report('B16 escopo: o reembolso continua igual (Escrow "refunded", 1 registo) e NÃO grava ledger de reembolso nesta etapa (fica para a E3)', ref.status === 'processed' && (await db.select().from(refunds).where(eq(refunds.orderId, oidR))).length === 1 && lR.types.join() === 'PAYMENT_RECEIVED', { ref, lR: lR.types });

  // ---- B17 caminho legado (pedido sem grupo) continua com UM só PAYMENT_RECEIVED
  const lg1s = await shop('legado'); const pL = await place([lg1s]); const oidL = pL.value.orders[0].id;
  await db.update(orders).set({ purchaseGroupId: null } as any).where(eq(orders.id, oidL));
  await PaymentService.confirmOrderPayment(oidL, { provider: 'asaas', transactionRef: kit.uid('LEG') });
  await PaymentService.confirmOrderPayment(oidL, { provider: 'asaas', transactionRef: kit.uid('LEG') });
  report('B17 caminho legado (sem purchase_group) inalterado: 1 PAYMENT_RECEIVED mesmo com confirmação repetida', (await ledger(oidL)).types.join() === 'PAYMENT_RECEIVED', await ledger(oidL));

  await pool.end();
  console.log(`\n${passed}/${total} testes passaram.`);
  process.exit(passed === total ? 0 : 1);
}
main().catch((e) => { console.error('ERRO FATAL', e); process.exit(2); });
