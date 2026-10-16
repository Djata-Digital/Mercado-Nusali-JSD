/**
 * Kit de fixtures para os testes de frete do checkout (Postgres DESCARTAVEL): geografia da Guine-Bissau (seed real do modulo), lojas
 * com endereco operacional + local de expedicao, armazens, produtos (ProductCreationService), estoque, comprador com endereco e
 * carrinho, tarifas por servico/faixa/vigencia. Nunca producao. Cada teste importa e chama setupCheckoutKit(db).
 */
import { eq, and } from 'drizzle-orm';
import * as schema from '../../src/db/schema.js';
import {
  users, sellers, stores, categories, countries, inventory, warehouses, carts, cartItems, addresses, platformSettings,
  shippingSectors, shippingRoutes, shippingServices, shippingRouteRates, productVariants,
} from '../../src/db/schema.js';
import { seedGuineaBissauShippingGeography } from '../../src/server/modules/shipping/shippingGeographyService.js';
import { ensureStoreFulfillmentLocation, ensureWarehouseFulfillmentLocation } from '../../src/server/modules/logistics/fulfillmentLocationService.js';
import { ProductCreationService } from '../../src/server/modules/catalog/productCreationService.js';

export async function setupCheckoutKit(db: any, tag = 'ck') {
  let seq = 0;
  const runTag = `${tag}_${Date.now().toString(36)}`;
  const uid = (p: string) => `${p}_${runTag}_${++seq}_${Math.random().toString(36).slice(2, 6)}`;

  await db.insert(countries).values([
    { id: 'GW', code: 'GW', name: 'Guiné-Bissau', flag: '🇬🇼', currency: 'XOF', currencySymbol: 'CFA', phonePrefix: '+245', isActive: true, createdAt: new Date() },
  ] as any).onConflictDoNothing();
  await seedGuineaBissauShippingGeography(db);

  const sector = async (name: string) => (await db.select().from(shippingSectors).where(and(eq(shippingSectors.countryCode, 'GW'), eq(shippingSectors.name, name))))[0];
  const service = async (code: string) => (await db.select().from(shippingServices).where(and(eq(shippingServices.countryCode, 'GW'), eq(shippingServices.code, code))))[0];
  const route = async (originSectorId: string, destinationSectorId: string) =>
    (await db.select().from(shippingRoutes).where(and(eq(shippingRoutes.countryCode, 'GW'), eq(shippingRoutes.originSectorId, originSectorId), eq(shippingRoutes.destinationSectorId, destinationSectorId))))[0];

  const setFlag = async (key: string, value: unknown) => {
    await db.insert(platformSettings).values({ key, valueJson: value, updatedAt: new Date() } as any)
      .onConflictDoUpdate({ target: platformSettings.key, set: { valueJson: value, updatedAt: new Date() } });
  };

  const makeUser = async (role: string) => {
    const id = uid('usr');
    await db.insert(users).values({
      id, email: `${id}@t.test`, passwordHash: 'x', fullName: `Teste ${id}`, phone: '11999990000', role, countryCode: 'GW',
      kycStatus: 'verified', riskScore: 'baixo', isActive: true, isEmailVerified: true, isPhoneVerified: false, createdAt: new Date(), updatedAt: new Date(),
    } as any);
    return id;
  };

  const makeSeller = async (label: string) => {
    const userId = await makeUser('SELLER');
    const sellerId = uid(`seller_${label}`);
    await db.insert(sellers).values({
      id: sellerId, userId, companyName: `Loja ${label}`, tradingName: `Loja ${label}`, taxId: '510012345', phone: '955000001',
      countryCode: 'GW', status: 'active', createdAt: new Date(), updatedAt: new Date(),
    } as any);
    return { userId, sellerId };
  };

  /** loja com endereço operacional no setor dado (null = SEM setor de origem) */
  const makeStore = async (seller: { sellerId: string; userId: string }, label: string, sectorId: string | null) => {
    const addressId = uid(`addr_${label}`);
    await db.insert(addresses).values({
      id: addressId, userId: seller.userId, recipientName: `Loja ${label}`, street: `Rua ${label}`, number: '1', city: label, state: label,
      countryCode: 'GW', phone: '955000000', isDefault: false, addressType: 'business', shippingSectorId: sectorId, createdAt: new Date(), updatedAt: new Date(),
    } as any);
    const storeId = uid(`store_${label}`);
    await db.insert(stores).values({
      id: storeId, sellerId: seller.sellerId, name: `Loja ${label} ${runTag}`, slug: `loja-${label.toLowerCase()}-${storeId}`.slice(0, 120),
      countryCode: 'GW', status: 'active', operationalAddressId: addressId, createdAt: new Date(), updatedAt: new Date(),
    } as any);
    const floc = await ensureStoreFulfillmentLocation(storeId, db);
    return { storeId, floc };
  };

  const makeWarehouse = async (label: string, sectorId: string) => {
    const warehouseId = uid(`wh_${label}`);
    await db.insert(warehouses).values({
      id: warehouseId, code: `WH-${warehouseId}`.slice(0, 60), name: `HUB ${label} ${runTag}`, countryCode: 'GW', city: label,
      address: 'End. HUB', status: 'active', shippingSectorId: sectorId, createdAt: new Date(),
    } as any);
    const floc = await ensureWarehouseFulfillmentLocation(warehouseId, db);
    return { warehouseId, floc };
  };

  let categoryId: string | null = null;
  const getCategory = async () => {
    if (categoryId) return categoryId;
    categoryId = uid('cat');
    await db.insert(categories).values({ id: categoryId, name: `Categoria ${runTag}`, slug: `cat-${runTag}`, isActive: true, commissionRate: '10.00' as any, createdAt: new Date() } as any);
    return categoryId;
  };

  const makeProduct = async (seller: { userId: string }, storeId: string, title: string, weightKg = 0.3, price = 100) => {
    const product: any = await ProductCreationService.createProduct(seller.userId, {
      title: `${title} ${runTag}`, price, image: 'x.jpg', categoryId: await getCategory(), storeId, weightKg,
      dimensionsCm: { length: 5, width: 5, height: 5 }, stock: 0,
    } as any, db);
    await db.delete(inventory).where(eq(inventory.productId, product.id));
    return product;
  };

  const insertInventory = async (o: {
    sellerId: string; productId: string; variantId?: string | null; locationType: 'SELLER_LOCATION' | 'NUSALI_HUB';
    fulfillmentLocationId: string | null; warehouseId?: string | null; quantityOnHand: number; quantityReserved?: number;
  }) => {
    const id = uid('inv');
    await db.insert(inventory).values({
      id, locationType: o.locationType, sellerId: o.sellerId, warehouseId: o.warehouseId || null, productId: o.productId, variantId: o.variantId || null,
      quantityOnHand: o.quantityOnHand, quantityReserved: o.quantityReserved || 0, minimumStockLevel: 0, fulfillmentLocationId: o.fulfillmentLocationId,
      createdAt: new Date(), updatedAt: new Date(),
    } as any);
    return id;
  };

  const makeBuyer = async (sectorId: string | null) => {
    const buyerId = await makeUser('BUYER');
    const addressId = uid('addr');
    await db.insert(addresses).values({
      id: addressId, userId: buyerId, recipientName: 'Comprador Teste', street: 'Rua Teste', number: '1', city: 'Bissau', state: 'Bissau', countryCode: 'GW',
      zipCode: '', phone: '955000000', isDefault: true, addressType: 'shipping', shippingSectorId: sectorId, createdAt: new Date(), updatedAt: new Date(),
    } as any);
    const cartId = uid('cart');
    await db.insert(carts).values({ id: cartId, userId: buyerId, currency: 'XOF', countryCode: 'GW', createdAt: new Date(), updatedAt: new Date() } as any);
    return { buyerId, addressId, cartId };
  };

  const addToCart = async (cartId: string, productId: string, quantity: number, unitPrice = 100, variantId: string | null = null) => {
    await db.insert(cartItems).values({
      id: uid('ci'), cartId, productId, variantId, quantity, unitPrice: String(unitPrice), createdAt: new Date(), updatedAt: new Date(),
    } as any);
  };

  /** tarifa por faixa [min, max) e vigência; devolve o id */
  const insertRate = async (routeId: string, serviceId: string, amount: number, o: { min?: number; max?: number; isActive?: boolean; validFrom?: Date | null; validUntil?: Date | null; currency?: string } = {}) => {
    const id = uid('rate');
    await db.insert(shippingRouteRates).values({
      id, routeId, serviceId, minWeightKg: String(o.min ?? 0), maxWeightKg: String(o.max ?? 5), amount: String(amount), currency: o.currency ?? 'XOF',
      isActive: o.isActive ?? true, validFrom: o.validFrom ?? null, validUntil: o.validUntil ?? null, createdAt: new Date(), updatedAt: new Date(),
    } as any);
    return id;
  };

  return { runTag, uid, sector, service, route, setFlag, makeUser, makeSeller, makeStore, makeWarehouse, makeProduct, insertInventory, makeBuyer, addToCart, insertRate, productVariants, db };
}
export type CheckoutKit = Awaited<ReturnType<typeof setupCheckoutKit>>;
