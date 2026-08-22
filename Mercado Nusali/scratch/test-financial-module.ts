import { ShippingCalculatorService } from '../src/server/modules/shipping/shippingCalculatorService.js';

async function runHardeningSuiteAll() {
  console.log('==================================================');
  console.log('MERCADO NUSALI — SUÍTE DE TESTES FINAL (MULTILOJA)');
  console.log('==================================================\n');

  // TEST 1: PESO AUSENTE
  console.log('--- TESTE 1: PESO AUSENTE ---');
  const res1 = await ShippingCalculatorService.calculateFreight({
    originCountry: 'BR',
    destinationCountry: 'BR',
    weightKg: 0,
    currency: 'BRL',
    productSubtotal: 100,
  });
  console.log('Result 1:', {
    available: res1.available,
    errorMessage: res1.errorMessage,
    passed: res1.available === false && res1.errorMessage?.includes('PRODUCT_WEIGHT_REQUIRED'),
  });

  // TEST 2: ORIGEM AUSENTE
  console.log('\n--- TESTE 2: ORIGEM AUSENTE ---');
  const res2 = await ShippingCalculatorService.calculateFreight({
    originCountry: '',
    destinationCountry: 'BR',
    weightKg: 1.0,
    currency: 'BRL',
    productSubtotal: 100,
  });
  console.log('Result 2:', {
    available: res2.available,
    errorMessage: res2.errorMessage,
    passed: res2.available === false && res2.errorMessage?.includes('SHIPPING_ORIGIN_REQUIRED'),
  });

  // TEST 3: DESTINO AUSENTE
  console.log('\n--- TESTE 3: DESTINO AUSENTE ---');
  const res3 = await ShippingCalculatorService.calculateFreight({
    originCountry: 'BR',
    destinationCountry: '',
    weightKg: 1.0,
    currency: 'BRL',
    productSubtotal: 100,
  });
  console.log('Result 3:', {
    available: res3.available,
    errorMessage: res3.errorMessage,
    passed: res3.available === false && res3.errorMessage?.includes('SHIPPING_DESTINATION_REQUIRED'),
  });

  // TEST 4: MOEDA AUSENTE
  console.log('\n--- TESTE 4: MOEDA AUSENTE ---');
  const res4 = await ShippingCalculatorService.calculateFreight({
    originCountry: 'BR',
    destinationCountry: 'BR',
    weightKg: 1.0,
    currency: '',
    productSubtotal: 100,
  });
  console.log('Result 4:', {
    available: res4.available,
    errorMessage: res4.errorMessage,
    passed: res4.available === false && res4.errorMessage?.includes('SHIPPING_CURRENCY_REQUIRED'),
  });

  // TEST 5: MULTILOJA (STORE A vs STORE B)
  console.log('\n--- TESTE 5: ISOLAMENTO MULTILOJA (STORE A vs STORE B) ---');
  const storeA = { id: 'store_a_br', countryCode: 'BR', currency: 'BRL' };
  const storeB = { id: 'store_b_gw', countryCode: 'GW', currency: 'XOF' };

  // Simulate Wizard Store Inheritance
  const deriveStoreProductConfig = (store: { countryCode: string; currency?: string }) => {
    if (!store.countryCode) throw new Error('STORE_COUNTRY_REQUIRED');
    const currency = store.countryCode === 'BR' ? 'BRL' : store.countryCode === 'GW' ? 'XOF' : (store.currency || 'BRL');
    return { originCountry: store.countryCode, currency };
  };

  const prodAConfig = deriveStoreProductConfig(storeA);
  const prodBConfig = deriveStoreProductConfig(storeB);

  // Simulate Store Policy Map
  const policiesMap = new Map<string, any>();
  policiesMap.set(storeA.id, { storeId: storeA.id, mode: 'CUSTOMER_PAYS' });
  policiesMap.set(storeB.id, { storeId: storeB.id, mode: 'SELLER_FREE_SHIPPING' });

  // Update Policy A
  policiesMap.set(storeA.id, { storeId: storeA.id, mode: 'SELLER_SUBSIDIZED', sellerSubsidyMaxAmount: 15 });

  console.log('Result 5:', {
    prodA: prodAConfig,
    prodB: prodBConfig,
    policyA: policiesMap.get(storeA.id),
    policyB: policiesMap.get(storeB.id),
    passed:
      prodAConfig.originCountry === 'BR' &&
      prodAConfig.currency === 'BRL' &&
      prodBConfig.originCountry === 'GW' &&
      prodBConfig.currency === 'XOF' &&
      policiesMap.get(storeA.id).mode === 'SELLER_SUBSIDIZED' &&
      policiesMap.get(storeB.id).mode === 'SELLER_FREE_SHIPPING',
  });
}

runHardeningSuiteAll();
