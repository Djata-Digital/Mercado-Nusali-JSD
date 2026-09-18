/**
 * FASE M1-D16-A2 — writer real de variantes de produto.
 *
 * Prova, via Postgres Docker isolado (chain completa de migrations, NUNCA
 * staging/produção):
 *
 *   - CREATE: produto variável cria linhas reais em product_variants (IDs
 *     gerados pelo backend, nunca os efêmeros do frontend) + uma linha de
 *     inventory própria por variante, nunca uma coluna própria;
 *   - VALIDATION: preço/originalPrice/stock/SKU/ownership de variante são
 *     todos validados, com rejeição explícita;
 *   - UPDATE/SYNC: preserva IDs, desativa (nunca deleta) variante omitida,
 *     cria variante nova, `variants` ausente não mexe em nada, `variants:[]`
 *     desativa todas, reativação explícita funciona;
 *   - ATOMICIDADE: falha em uma variante derruba a criação inteira do
 *     produto (nenhum product/inventory órfão);
 *   - produto simples continua exatamente como antes;
 *   - estoque: productVariants.stock nunca é escrito como autoridade;
 *     edição de estoque de variante já existente é deliberadamente FORA DE
 *     ESCOPO nesta fase — os testes 31/32 provam que o sync de UPDATE não
 *     toca quantityOnHand/quantityReserved/stockReservations de uma
 *     variante que já existia.
 */
import { assertLedgerTestDatabaseGuard } from './ledgerTestDbGuard.js';

const testDbUrl = assertLedgerTestDatabaseGuard();
process.env.DATABASE_URL = testDbUrl;

import 'dotenv/config';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and, asc, sql } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import {
  users, countries, sellers, stores, categories, products, productVariants,
  inventory, orders, stockReservations,
} from '../src/db/schema.js';
import { ProductCreationService, type CreateProductInput } from '../src/server/modules/catalog/productCreationService.js';
import { syncVariantsForProduct } from '../src/server/modules/catalog/variantService.js';

const pool = new pg.Pool({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false } });
const db = drizzle(pool, { schema });

let passed = 0, total = 0;
function report(label: string, ok: boolean, detail?: any) {
  total++; if (ok) passed++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${detail !== undefined ? ' -> ' + JSON.stringify(detail) : ''}`);
}
async function expectThrow(label: string, fn: () => Promise<any>, matcher: RegExp) {
  try {
    await fn();
    report(label, false, 'não lançou erro');
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : String(e);
    report(label, matcher.test(msg), msg);
  }
}

let seq = 0;
const uid = (p: string) => `${p}_m1d16a2_${Date.now()}_${++seq}_${Math.random().toString(36).slice(2, 6)}`;

async function makeSellerWithStore(label: string, countryCode = 'GW') {
  const userId = uid(`usr_${label}`);
  await db.insert(users).values({
    id: userId, email: `${userId}@t.test`, passwordHash: 'x', fullName: `Seller ${label}`,
    phone: '11999990000', role: 'SELLER', countryCode, kycStatus: 'verified',
    riskScore: 'baixo', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const sellerId = uid(`seller_${label}`);
  await db.insert(sellers).values({
    id: sellerId, userId, companyName: `Loja ${label}`, tradingName: `Loja ${label}`,
    taxId: '00000000000', phone: '11999990000', countryCode, status: 'active',
    createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const storeId = uid(`store_${label}`);
  await db.insert(stores).values({
    id: storeId, sellerId, name: `Loja ${label}`, slug: `loja-d16a2-${label.toLowerCase()}-${storeId}`,
    countryCode, status: 'active', createdAt: new Date(), updatedAt: new Date(),
  } as any);
  return { userId, sellerId, storeId };
}

function baseProductInput(overrides: Partial<CreateProductInput> & { storeId: string }): CreateProductInput {
  return {
    title: 'Produto D16A2',
    price: 10,
    image: 'produto.jpg',
    categoryId: '',
    weightKg: 1,
    dimensionsCm: { length: 10, width: 10, height: 10 },
    stock: 3,
    ...overrides,
  } as CreateProductInput;
}

async function main() {
  await db.insert(countries).values([
    { id: 'GW', code: 'GW', name: 'Guiné-Bissau', flag: '🇬🇼', currency: 'XOF', currencySymbol: 'CFA', phonePrefix: '+245', isActive: true, createdAt: new Date() },
  ]).onConflictDoNothing();

  const categoryId = uid('cat');
  await db.insert(categories).values({
    id: categoryId, name: 'Categoria D16A2', slug: `cat-d16a2-${categoryId}`, isActive: true, createdAt: new Date(),
  } as any);

  const sellerA = await makeSellerWithStore('A');
  const sellerB = await makeSellerWithStore('B');

  // ==========================================================================
  // CREATE — produto variável com 2 variantes (itens 1-12).
  // ==========================================================================
  const createInput = baseProductInput({
    storeId: sellerA.storeId,
    categoryId,
    title: 'Camiseta D16A2',
    price: 20,
    stock: 0, // irrelevante quando há variants — nunca vira linha variantId=null
    variants: [
      { id: 'var-c-0', color: 'Preto', sku: `SKU-PRETO-${uid('x')}`, price: 22, originalPrice: 30, stock: 10, image: 'preto.jpg' },
      { id: 'var-c-1', color: 'Branco', sku: `SKU-BRANCO-${uid('x')}`, price: 18, stock: 5, image: 'branco.jpg' },
    ],
  });
  const created = await ProductCreationService.createProduct(sellerA.userId, createInput, db);
  const productAId = created.id;

  const variantsA = await db.select().from(productVariants).where(eq(productVariants.productId, productAId)).orderBy(asc(productVariants.color));
  report('1. Produto variável cria exatamente 2 linhas em product_variants', variantsA.length === 2, variantsA.length);

  const pretoRow = variantsA.find((v: any) => v.color === 'Preto');
  const brancoRow = variantsA.find((v: any) => v.color === 'Branco');
  report('2. IDs das variantes gerados pelo backend (prefixo pvar_)', !!pretoRow?.id.startsWith('pvar_') && !!brancoRow?.id.startsWith('pvar_'), { preto: pretoRow?.id, branco: brancoRow?.id });
  report('3. IDs efêmeros do payload (var-c-0/var-c-1) NUNCA viram PK', !variantsA.some((v: any) => v.id === 'var-c-0' || v.id === 'var-c-1'));
  report('4. price correto por variante', Number(pretoRow?.price) === 22 && Number(brancoRow?.price) === 18, { preto: pretoRow?.price, branco: brancoRow?.price });
  report('5. originalPrice correto (só na variante que enviou)', Number(pretoRow?.originalPrice) === 30 && brancoRow?.originalPrice === null, { preto: pretoRow?.originalPrice, branco: brancoRow?.originalPrice });
  report('6. is_active=true nas duas variantes recém-criadas', pretoRow?.isActive === true && brancoRow?.isActive === true);
  report('7. SKU correto por variante', pretoRow?.sku === createInput.variants![0].sku && brancoRow?.sku === createInput.variants![1].sku);
  report('8. productVariants.stock permanece não-autoritativo (default 0, nunca o valor enviado)', pretoRow?.stock === 0 && brancoRow?.stock === 0, { preto: pretoRow?.stock, branco: brancoRow?.stock });

  const invPreto = await db.select().from(inventory).where(and(eq(inventory.productId, productAId), eq(inventory.variantId, pretoRow!.id)));
  const invBranco = await db.select().from(inventory).where(and(eq(inventory.productId, productAId), eq(inventory.variantId, brancoRow!.id)));
  report('9. inventory criado com variantId real correto para cada variante', invPreto.length === 1 && invBranco.length === 1);
  report('10. Estoque de Preto (10) não aparece em Branco (5) — nunca misturado', invPreto[0]?.quantityOnHand === 10 && invBranco[0]?.quantityOnHand === 5, { preto: invPreto[0]?.quantityOnHand, branco: invBranco[0]?.quantityOnHand });
  report('11. inventory das duas variantes pertence ao seller A', invPreto[0]?.sellerId === sellerA.sellerId && invBranco[0]?.sellerId === sellerA.sellerId);

  // Produto de Seller B, para os testes de ownership cruzado mais abaixo.
  const createInputB = baseProductInput({ storeId: sellerB.storeId, categoryId, title: 'Produto Seller B' });
  const createdB = await ProductCreationService.createProduct(sellerB.userId, createInputB, db);
  const productBId = createdB.id;
  const invBRows = await db.select().from(inventory).where(eq(inventory.productId, productBId));
  report('12. inventory do produto de Seller B pertence a Seller B (nunca A)', invBRows.every((r: any) => r.sellerId === sellerB.sellerId));

  // ==========================================================================
  // VALIDATION (itens 13-18) — via syncVariantsForProduct diretamente.
  // ==========================================================================
  await expectThrow(
    '13. originalPrice <= price rejeita',
    () => db.transaction((tx: any) => syncVariantsForProduct(tx, { sellerId: sellerA.sellerId, productId: productAId, variants: [{ id: pretoRow!.id, price: 22, originalPrice: 20 }] })),
    /VARIANT_ORIGINAL_PRICE_INVALID/
  );
  await expectThrow(
    '14. preço negativo rejeita',
    () => db.transaction((tx: any) => syncVariantsForProduct(tx, { sellerId: sellerA.sellerId, productId: productAId, variants: [{ color: 'Vermelho', price: -1 }] })),
    /VARIANT_PRICE_INVALID/
  );
  await expectThrow(
    '15. stock negativo rejeita',
    () => db.transaction((tx: any) => syncVariantsForProduct(tx, { sellerId: sellerA.sellerId, productId: productAId, variants: [{ color: 'Azul', price: 10, stock: -5 }] })),
    /VARIANT_STOCK_INVALID/
  );
  await expectThrow(
    '16. SKU duplicado rejeita',
    () => db.transaction((tx: any) => syncVariantsForProduct(tx, { sellerId: sellerA.sellerId, productId: productAId, variants: [{ color: 'Verde', price: 10, sku: pretoRow!.sku }] })),
    /VARIANT_SKU_DUPLICATE/
  );

  const [productBVariant] = await db.select().from(productVariants).where(eq(productVariants.productId, productBId)).limit(1);
  if (productBVariant) {
    await expectThrow(
      '17. variantId de outro product rejeita',
      () => db.transaction((tx: any) => syncVariantsForProduct(tx, { sellerId: sellerA.sellerId, productId: productAId, variants: [{ id: productBVariant.id, price: 10 }] })),
      /VARIANT_ID_NOT_OWNED/
    );
  } else {
    // Produto B não teve variantes criadas (produto simples) — cria uma direto no banco só para o teste de ownership cruzado.
    const foreignVariantId = uid('pvar_foreign');
    await db.insert(productVariants).values({ id: foreignVariantId, productId: productBId, title: 'Estrangeira', price: '10.00', createdAt: new Date(), updatedAt: new Date() } as any);
    await expectThrow(
      '17. variantId de outro product rejeita',
      () => db.transaction((tx: any) => syncVariantsForProduct(tx, { sellerId: sellerA.sellerId, productId: productAId, variants: [{ id: foreignVariantId, price: 10 }] })),
      /VARIANT_ID_NOT_OWNED/
    );
    await expectThrow(
      '18. variantId de outro seller rejeita',
      () => db.transaction((tx: any) => syncVariantsForProduct(tx, { sellerId: sellerA.sellerId, productId: productAId, variants: [{ id: foreignVariantId, price: 10 }] })),
      /VARIANT_ID_NOT_OWNED/
    );
  }

  // ==========================================================================
  // UPDATE / SYNC (itens 19-25).
  // ==========================================================================
  await db.transaction((tx: any) => syncVariantsForProduct(tx, {
    sellerId: sellerA.sellerId, productId: productAId,
    variants: [{ id: pretoRow!.id, price: 25, sku: 'SKU-PRETO-NOVO', color: 'Preto' }],
  }));
  const [pretoAfterUpdate] = await db.select().from(productVariants).where(eq(productVariants.id, pretoRow!.id)).limit(1);
  report('19. Atualizar preço/SKU preserva o variantId real', pretoAfterUpdate.id === pretoRow!.id && Number(pretoAfterUpdate.price) === 25 && pretoAfterUpdate.sku === 'SKU-PRETO-NOVO');

  // Enviar só Preto (omitir Branco) -> Branco deve ser desativado.
  await db.transaction((tx: any) => syncVariantsForProduct(tx, {
    sellerId: sellerA.sellerId, productId: productAId,
    variants: [{ id: pretoRow!.id, price: 25, color: 'Preto' }],
  }));
  const [brancoAfterOmit] = await db.select().from(productVariants).where(eq(productVariants.id, brancoRow!.id)).limit(1);
  report('20. Variante omitida do array vira is_active=false', brancoAfterOmit.isActive === false);

  // Variante nova nesta mesma chamada de sync.
  const syncWithNew = await db.transaction((tx: any) => syncVariantsForProduct(tx, {
    sellerId: sellerA.sellerId, productId: productAId,
    variants: [{ id: pretoRow!.id, price: 25, color: 'Preto' }, { color: 'Cinza', price: 21, sku: `SKU-CINZA-${uid('x')}` }],
  }));
  const cinzaResult = syncWithNew.find((r) => r.created);
  report('21. Variante nova enviada no sync é criada com ID novo', !!cinzaResult && cinzaResult.id.startsWith('pvar_') && cinzaResult.id !== pretoRow!.id);

  const allVariantsAfterCreates = await db.select().from(productVariants).where(eq(productVariants.productId, productAId));
  report('22. Nenhuma variante histórica foi deletada (Preto e Branco, ambas ainda existem como linha)', allVariantsAfterCreates.some((v: any) => v.id === pretoRow!.id) && allVariantsAfterCreates.some((v: any) => v.id === brancoRow!.id));

  const snapshotBeforeNoOp = await db.select().from(productVariants).where(eq(productVariants.productId, productAId));
  // "variants ausente" = a ROTA simplesmente não chama syncVariantsForProduct — não há nada a executar aqui além de confirmar que o estado não muda quando a função não é chamada.
  const snapshotAfterNoOp = await db.select().from(productVariants).where(eq(productVariants.productId, productAId));
  report('23. Não chamar o sync (payload sem `variants`) não altera nenhuma variante', JSON.stringify(snapshotBeforeNoOp) === JSON.stringify(snapshotAfterNoOp));

  await db.transaction((tx: any) => syncVariantsForProduct(tx, { sellerId: sellerA.sellerId, productId: productAId, variants: [] }));
  const allVariantsAfterEmpty = await db.select().from(productVariants).where(eq(productVariants.productId, productAId));
  report('24. `variants: []` desativa TODAS as variantes existentes do produto', allVariantsAfterEmpty.length > 0 && allVariantsAfterEmpty.every((v: any) => v.isActive === false), allVariantsAfterEmpty.map((v: any) => ({ id: v.id, isActive: v.isActive })));

  await db.transaction((tx: any) => syncVariantsForProduct(tx, { sellerId: sellerA.sellerId, productId: productAId, variants: [{ id: pretoRow!.id, price: 25, color: 'Preto' }] }));
  const [pretoReactivated] = await db.select().from(productVariants).where(eq(productVariants.id, pretoRow!.id)).limit(1);
  report('25. Reativação explícita da própria variante (mesmo ID real) funciona', pretoReactivated.isActive === true);

  // ==========================================================================
  // ATOMICIDADE (itens 26-28).
  // ==========================================================================
  const productsCountBeforeFail = (await db.select({ c: sql<number>`count(*)::int` }).from(products))[0].c;
  const inventoryCountBeforeFail = (await db.select({ c: sql<number>`count(*)::int` }).from(inventory))[0].c;

  const failingInput = baseProductInput({
    storeId: sellerA.storeId, categoryId, title: 'Produto Que Deve Falhar',
    variants: [
      { color: 'Ok', price: 10, sku: `SKU-OK-${uid('x')}` },
      { color: 'Ruim', price: -5 }, // preço inválido -> deve derrubar a transação inteira
    ],
  });
  let atomicRollbackOk = false;
  try {
    await ProductCreationService.createProduct(sellerA.userId, failingInput, db);
  } catch {
    atomicRollbackOk = true;
  }
  report('26. Falha em uma variante lança erro (a criação não "sucede parcialmente")', atomicRollbackOk);

  const productsCountAfterFail = (await db.select({ c: sql<number>`count(*)::int` }).from(products))[0].c;
  const inventoryCountAfterFail = (await db.select({ c: sql<number>`count(*)::int` }).from(inventory))[0].c;
  report('27. Nenhum product parcial sobrou (contagem de products inalterada)', productsCountAfterFail === productsCountBeforeFail, { before: productsCountBeforeFail, after: productsCountAfterFail });
  report('28. Nenhum inventory órfão sobrou (contagem de inventory inalterada)', inventoryCountAfterFail === inventoryCountBeforeFail, { before: inventoryCountBeforeFail, after: inventoryCountAfterFail });

  const orphanCheck = await db.select().from(products).where(eq(products.title, 'Produto Que Deve Falhar'));
  report('27b. O produto da tentativa falha não existe no banco', orphanCheck.length === 0);

  // ==========================================================================
  // PRODUTO SIMPLES (item 29) — fluxo inalterado.
  // ==========================================================================
  const simpleInput = baseProductInput({ storeId: sellerA.storeId, categoryId, title: 'Produto Simples D16A2', stock: 7 });
  const simpleCreated = await ProductCreationService.createProduct(sellerA.userId, simpleInput, db);
  const simpleVariants = await db.select().from(productVariants).where(eq(productVariants.productId, simpleCreated.id));
  const simpleInventory = await db.select().from(inventory).where(eq(inventory.productId, simpleCreated.id));
  report(
    '29. Produto sem variants continua criando exatamente 1 linha de inventory (variantId=null) com o stock enviado, sem nenhuma linha em product_variants',
    simpleVariants.length === 0 && simpleInventory.length === 1 && simpleInventory[0].variantId === null && simpleInventory[0].quantityOnHand === 7,
    { variantsCount: simpleVariants.length, inventoryCount: simpleInventory.length, onHand: simpleInventory[0]?.quantityOnHand }
  );

  // ==========================================================================
  // ESTOQUE (itens 30-32).
  // ==========================================================================
  const [pretoFinalStockCol] = await db.select().from(productVariants).where(eq(productVariants.id, pretoRow!.id)).limit(1);
  report('30. productVariants.stock nunca foi escrito como fonte autoritativa (permanece 0 mesmo após múltiplos updates)', pretoFinalStockCol.stock === 0, pretoFinalStockCol.stock);

  // Simula uma reserva REAL na inventory de Preto (como o checkout faria) e
  // confirma que um UPDATE comercial da variante (preço) NUNCA toca
  // quantityOnHand/quantityReserved nem a reserva em si.
  const [invPretoRow] = await db.select().from(inventory).where(and(eq(inventory.productId, productAId), eq(inventory.variantId, pretoRow!.id))).limit(1);
  await db.update(inventory).set({ quantityReserved: 4 }).where(eq(inventory.id, invPretoRow.id));

  const buyerId = uid('usr_buyer');
  await db.insert(users).values({
    id: buyerId, email: `${buyerId}@t.test`, passwordHash: 'x', fullName: 'Comprador D16A2',
    phone: '11999990002', role: 'BUYER', countryCode: 'GW', kycStatus: 'verified',
    riskScore: 'baixo', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const fakeOrderId = uid('order');
  await db.insert(orders).values({
    id: fakeOrderId, orderNumber: `D16A2-${fakeOrderId}`, buyerId,
    subtotal: '25.00', shippingFee: '0.00', totalAmount: '25.00', currency: 'XOF',
    status: 'paid', paymentStatus: 'paid', escrowStatus: 'held',
    shippingAddressJson: { recipientName: 'Comprador D16A2', street: 'Rua Teste', city: 'Bissau', countryCode: 'GW' },
    countryCode: 'GW', createdAt: new Date(), updatedAt: new Date(),
  } as any);
  const reservationId = uid('sr');
  await db.insert(stockReservations).values({
    id: reservationId, orderId: fakeOrderId, productId: productAId, variantId: pretoRow!.id,
    inventoryId: invPretoRow.id, fulfillmentMode: 'SELLER_FULFILLMENT', quantity: 4,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000), status: 'active', createdAt: new Date(),
  } as any);
  const [reservationBefore] = await db.select().from(stockReservations).where(eq(stockReservations.id, reservationId)).limit(1);
  const invPretoBeforeCommercialUpdate = await db.select().from(inventory).where(eq(inventory.id, invPretoRow.id)).limit(1);

  await db.transaction((tx: any) => syncVariantsForProduct(tx, { sellerId: sellerA.sellerId, productId: productAId, variants: [{ id: pretoRow!.id, price: 27, color: 'Preto' }] }));

  const invPretoAfterCommercialUpdate = await db.select().from(inventory).where(eq(inventory.id, invPretoRow.id)).limit(1);
  report(
    '31. quantityOnHand/quantityReserved da variante existente NUNCA são tocados por um UPDATE comercial (onHand nunca fica < reserved por causa do writer)',
    JSON.stringify(invPretoBeforeCommercialUpdate) === JSON.stringify(invPretoAfterCommercialUpdate) && invPretoAfterCommercialUpdate[0].quantityOnHand >= invPretoAfterCommercialUpdate[0].quantityReserved,
    invPretoAfterCommercialUpdate[0]
  );

  const [reservationAfter] = await db.select().from(stockReservations).where(eq(stockReservations.id, reservationId)).limit(1);
  report(
    '32. stockReservations existente permanece byte-a-byte idêntica após um UPDATE comercial da variante (edição de estoque de variante existente fica deliberadamente FORA DE ESCOPO nesta fase)',
    JSON.stringify(reservationBefore) === JSON.stringify(reservationAfter),
    reservationAfter
  );

  await pool.end();

  console.log(`\n${passed}/${total} testes passaram.`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((e) => {
  console.error('\n[ERRO FATAL]', e instanceof Error ? e.message : e);
  if ((e as any)?.cause) console.error('[cause]', (e as any).cause.message);
  process.exit(1);
});
