/**
 * FASE D16-G2 — preview de entrega READ-ONLY para a página de produto,
 * usando o MESMO motor de decisão logística real do checkout (F4 + F3) em
 * vez do motor legado país/zona (ShippingCalculatorService/shipping_rates),
 * que não conhece a geografia por setor onde as tarifas reais de
 * staging/produção estão cadastradas (achado da auditoria D16-G0).
 *
 * FASE D16-G3 — adiciona o preview AGREGADO de carrinho/checkout
 * (resolveCartShippingPreview), reaproveitando o MESMO núcleo por linha
 * (resolveShippingPreviewLine) que resolveShippingPreview (produto único,
 * D16-G2) já usava — nenhuma lógica de fulfillment duplicada. A agregação
 * por vendedor e a política de pagador seguem EXATAMENTE a semântica já
 * existente em orderService.ts (F6.2): 1 chamada F4 por linha, soma aditiva
 * de shippingAmount por sellerId (sem consolidação de pacote), depois
 * resolveShippingPayerPolicy por grupo — a MESMA função extraída de
 * shippingCalculatorService.ts que F6.2 usa, nunca uma segunda política.
 *
 * NUNCA reimplementa F4/F3 — só adapta a entrada (productId/variantId
 * autoritativos do banco, nunca confiados ao frontend) e a saída (formato
 * público mínimo, nunca expõe estoque/inventoryId/warehouseId/
 * rejectedCandidates/diagnostics). NUNCA chama F5 — nenhuma reserva,
 * nenhuma escrita, nenhum efeito colateral. Zero split: usa exclusivamente
 * o `bestCandidate` que F4 já escolhe por custo real de frete.
 */
import { getDb } from '../../../db/index.js';
import { products, productVariants, shippingSectors, shippingServices, sellers, categories, platformSettings } from '../../../db/schema.js';
import { and, eq, inArray } from 'drizzle-orm';
import { resolveFulfillmentCandidates, type FulfillmentCandidate, type RejectedFulfillmentCandidate } from './fulfillmentCandidateResolverService.js';
import { planShipments, rawCostByGroup } from './shipmentPlannerService.js';
import { loadLeadTimes, aggregateLeadTime, type LeadTime } from './shippingLeadTimeService.js';
import { compareShippingServices } from '../../../utils/shippingServiceLabels.js';
import { validateInventoryVariantConsistency } from '../logistics/fulfillmentLocationService.js';
import { classifyRejectedCandidates, mostActionableFailureCode, shippingFailureMessage, type ShippingFailureCode } from './checkoutShippingErrors.js';
import {
  resolveShippingPayerPolicy,
  checkSellerNetForShippingShare,
  sellerSubsidyExceedsNetError,
  ShippingPolicyNotApplicableError,
} from './shippingCalculatorService.js';

export interface ShippingPreviewInput {
  productId: string;
  variantId?: string | null;
  quantity: number;
  destinationShippingSectorId?: string | null;
}

// FASE D16-G2 — forma bruta (só F3/F4, ANTES de qualquer política de
// pagador): shippingAmount é o custo logístico real. Núcleo compartilhado
// por resolveShippingPreviewLine — usado tanto pelo preview de produto
// único (que agora aplica a política em cima disto, D18-C2.10) quanto pelo
// preview de carrinho (que agrega várias linhas RAW por grupo antes de
// aplicar a política uma vez por grupo, D16-G3) — nunca duplicado.
interface ShippingPreviewRawShape {
  ok: true;
  available: true;
  shippingAmount: number;
  currency: string;
  serviceCode: string;
  serviceName: string;
  fulfillmentType: 'SELLER_LOCATION' | 'NUSALI_HUB';
}

export interface ShippingPreviewAvailable extends ShippingPreviewRawShape {
  // FASE D18-C2.10 — shippingAmount (herdado acima) continua sendo o custo
  // logístico REAL, nunca vira 0 por causa de uma política de frete grátis
  // do seller. Os campos abaixo são os valores PÓS-política (mesma função e
  // mesmos nomes que resolveCartShippingPreview/orderService já usam) —
  // aditivos, para nunca quebrar um consumidor antigo que só lia
  // shippingAmount. Valor efetivamente cobrado do comprador —
  // shippingChargedToBuyer é o que a tela de produto deve exibir como
  // "Frete" a partir de agora, nunca shippingAmount bruto.
  shippingChargedToBuyer: number;
  shippingSellerSubsidy: number;
  shippingMarketplaceSubsidy: number;
  shippingPayer: 'buyer' | 'seller' | 'marketplace' | 'shared';
  policyMode: string;
}

export interface ShippingPreviewUnavailable {
  ok: true;
  available: false;
  // FASE D18-C2.10 — inclui os mesmos códigos de "política de frete não
  // aplicável" que resolveCartShippingPreview/checkout já usam
  // (ShippingPolicyNotApplicableCode) — mesma semântica de "checkout
  // bloqueado" nos dois lugares, nunca um código novo inventado aqui.
  code: ShippingFailureCode
    | 'SELLER_SHIPPING_POLICY_INVALID' | 'SELLER_SUBSIDY_EXCEEDS_NET' | 'SHIPPING_FUNDING_INVARIANT_VIOLATION';
  message: string;
}

/** Entrada estruturalmente inválida (nunca deveria acontecer com um frontend bem-comportado) — fail closed, HTTP 400/404. */
export interface ShippingPreviewInvalid {
  ok: false;
  httpStatus: 400 | 404;
  code: string;
  message: string;
}

export type ShippingPreviewResult = ShippingPreviewAvailable | ShippingPreviewUnavailable | ShippingPreviewInvalid;

// Mesmas formas acima, mas com sellerId/storeId incluídos — uso INTERNO
// (nunca exposto por resolveShippingPreview, o contrato público de produto
// único permanece idêntico ao de D16-G2) para permitir agrupar por
// vendedor no preview de carrinho (D16-G3) sem duplicar a resolução F4/F3.
interface ShippingPreviewLineAvailable extends ShippingPreviewRawShape {
  /** origem escolhida pelo F4 para esta linha (e para o serviço pedido) — usada pelo planejamento das expedições */
  candidate: FulfillmentCandidate;
  sellerId: string;
  // FASE D18-B2.2 - storeId aqui e a FULFILLMENT store (bc.storeId, null em
  // fulfillment por HUB). commercialStoreId e a loja a qual o produto
  // pertence (products.storeId) - autoridade para a politica de frete,
  // nunca storeId.
  storeId: string | null;
  commercialStoreId: string | null;
}
type ShippingPreviewLineResult = ShippingPreviewLineAvailable | ShippingPreviewUnavailable | ShippingPreviewInvalid;

/**
 * Motivo agregado de "nenhuma candidate disponível" — classificador ÚNICO (checkoutShippingErrors.ts), o MESMO usado na criação do
 * pedido: estoque, setor de origem, peso, rota, serviço e tarifa são distinguidos; estoque só é o motivo quando todas as origens
 * falharam por estoque.
 */
function classifyUnavailableReason(rejected: RejectedFulfillmentCandidate[]): ShippingFailureCode {
  return classifyRejectedCandidates(rejected);
}

/**
 * Núcleo compartilhado: resolve F4/F3 read-only para UMA linha
 * (productId+variantId+quantity+destino). Usado tanto por
 * resolveShippingPreview (produto único, D16-G2, comportamento
 * INALTERADO) quanto por resolveCartShippingPreview (agregado de
 * carrinho/checkout, D16-G3) — uma única implementação da resolução de
 * fulfillment, nunca duplicada.
 */
async function resolveShippingPreviewLine(input: ShippingPreviewInput, db: any, serviceCode?: string | null): Promise<ShippingPreviewLineResult> {
  if (!input.productId) {
    return { ok: false, httpStatus: 400, code: 'PRODUCT_ID_REQUIRED', message: 'productId é obrigatório.' };
  }

  const quantity = Math.floor(Number(input.quantity));
  if (!input.quantity || isNaN(quantity) || quantity <= 0 || quantity !== Number(input.quantity)) {
    return { ok: false, httpStatus: 400, code: 'QUANTITY_INVALID', message: 'quantity deve ser um número inteiro maior que zero.' };
  }

  const [product] = await db.select().from(products).where(eq(products.id, input.productId)).limit(1);
  if (!product) {
    return { ok: false, httpStatus: 404, code: 'PRODUCT_NOT_FOUND', message: `Produto "${input.productId}" não encontrado.` };
  }
  if (product.isActive === false) {
    return { ok: false, httpStatus: 404, code: 'PRODUCT_NOT_FOUND', message: 'Este produto não está mais disponível.' };
  }
  if (!product.sellerId) {
    // Dado estrutural inconsistente (produto sem vendedor) — nunca deveria
    // acontecer para produtos criados via ProductCreationService; fail
    // closed sem tentar adivinhar um seller.
    return { ok: true, available: false, code: 'PRODUCT_NOT_AVAILABLE_FOR_QUANTITY', message: 'Este produto não possui vendedor associado.' };
  }

  if (input.variantId) {
    const consistency = await validateInventoryVariantConsistency({ sellerId: product.sellerId, productId: input.productId, variantId: input.variantId }, db);
    if (consistency.ok === false) {
      return { ok: false, httpStatus: 400, code: 'VARIANT_PRODUCT_MISMATCH', message: consistency.error };
    }
  }

  // Setor de destino: EXCLUSIVAMENTE o que o chamador já resolveu (endereço
  // real do comprador) — nunca inferido por cidade/texto. Ausente = estado
  // explícito DELIVERY_SECTOR_REQUIRED, nunca confundido com "sem tarifa".
  if (!input.destinationShippingSectorId) {
    return { ok: true, available: false, code: 'DELIVERY_SECTOR_REQUIRED', message: 'Selecione um endereço de entrega com setor definido para calcular o frete.' };
  }

  // countryCode do destino é SEMPRE derivado do próprio setor (nunca
  // confiado a um parâmetro separado do chamador) — evita qualquer
  // divergência entre "setor enviado" e "país enviado".
  const [sectorRow] = await db.select({ countryCode: shippingSectors.countryCode, isActive: shippingSectors.isActive })
    .from(shippingSectors)
    .where(eq(shippingSectors.id, input.destinationShippingSectorId))
    .limit(1);
  if (!sectorRow || sectorRow.isActive === false) {
    return { ok: true, available: false, code: 'DELIVERY_SECTOR_REQUIRED', message: 'O setor de entrega selecionado não é válido. Selecione um endereço de entrega novamente.' };
  }

  const f4Result = await resolveFulfillmentCandidates({
    sellerId: product.sellerId,
    productId: input.productId,
    variantId: input.variantId || null,
    quantity,
    destinationShippingSectorId: input.destinationShippingSectorId,
    countryCode: sectorRow.countryCode,
    serviceCode: serviceCode || undefined,
  }, db);

  if (f4Result.ok === false) {
    const f4Code: string = f4Result.code;
    const f4Message: string = f4Result.message;
    if (f4Code === 'DESTINATION_SECTOR_MISSING' || f4Code === 'DESTINATION_SECTOR_INVALID' || f4Code === 'COUNTRY_MISMATCH') {
      return { ok: true, available: false, code: 'DELIVERY_SECTOR_REQUIRED', message: 'O setor de entrega selecionado não é válido. Selecione um endereço de entrega novamente.' };
    }
    if (f4Code === 'QUANTITY_INVALID') {
      return { ok: false, httpStatus: 400, code: 'QUANTITY_INVALID', message: f4Message };
    }
    // SELLER_REQUIRED/PRODUCT_REQUIRED/COUNTRY_REQUIRED: nunca deveriam
    // ocorrer (sempre preenchidos aqui) — fail closed genérico.
    return { ok: true, available: false, code: 'PRODUCT_NOT_AVAILABLE_FOR_QUANTITY', message: f4Message };
  }

  if (!f4Result.bestCandidate) {
    const code = classifyUnavailableReason(f4Result.rejectedCandidates);
    return { ok: true, available: false, code, message: shippingFailureMessage(code) };
  }

  const bc = f4Result.bestCandidate;
  return {
    ok: true,
    available: true,
    shippingAmount: bc.shippingAmount,
    currency: bc.currency,
    serviceCode: bc.serviceCode,
    serviceName: bc.serviceName,
    fulfillmentType: bc.locationType,
    candidate: bc,
    sellerId: product.sellerId,
    storeId: bc.storeId || null,
    commercialStoreId: product.storeId || null,
  };
}

export async function resolveShippingPreview(input: ShippingPreviewInput, executor?: any): Promise<ShippingPreviewResult> {
  const db = executor ?? getDb();
  if (!db) return { ok: false, httpStatus: 400, code: 'SHIPPING_PREVIEW_DB_UNAVAILABLE', message: 'Banco de dados indisponível.' };

  const line = await resolveShippingPreviewLine(input, db);
  if (line.ok === false) return line;
  if (line.available === false) return line;

  // FASE D18-C2.10 — corrige o bug confirmado em D18-C2.9: este preview de
  // produto único mostrava sempre o custo logístico BRUTO (F3/F4) como se
  // fosse o valor devido pelo comprador, nunca aplicando a política de
  // pagador da loja (SELLER_FREE_SHIPPING/SELLER_SUBSIDIZED/etc.) — um
  // produto com frete grátis do vendedor continuava exibindo frete cobrado
  // na página do produto. Reaproveita EXATAMENTE resolveShippingPayerPolicy
  // (nunca uma segunda implementação da regra financeira), pela loja
  // COMERCIAL do produto (line.commercialStoreId = products.storeId, nunca
  // a fulfillment store — D18-B2.2: mesma autoridade que carrinho/checkout
  // já usam, HUB ou não).
  let policy;
  try {
    policy = await resolveShippingPayerPolicy(line.shippingAmount, { storeId: line.commercialStoreId, sellerId: line.sellerId }, db);
  } catch (err) {
    if (err instanceof ShippingPolicyNotApplicableError) {
      return { ok: true, available: false, code: err.code, message: err.message.replace(/^[A-Z_]+: /, '') };
    }
    throw err;
  }

  // Contrato público de produto único (D16-G2) preserva shippingAmount
  // (custo real, nunca zerado) e segue NUNCA expondo sellerId/storeId/
  // commercialStoreId (só usados internamente aqui e pelo preview de
  // carrinho, D16-G3, para agrupar por vendedor) — só adiciona os campos
  // pós-política (D18-C2.10).
  const { sellerId, storeId, commercialStoreId, candidate, ...rawPublicShape } = line;
  return {
    ...rawPublicShape,
    shippingChargedToBuyer: policy.shippingChargedToBuyer,
    shippingSellerSubsidy: policy.shippingSellerSubsidy,
    shippingMarketplaceSubsidy: policy.shippingMarketplaceSubsidy,
    shippingPayer: policy.shippingPayer,
    policyMode: policy.policyMode,
  };
}

// ---------------------------------------------------------------------------
// FASE D16-G3 — preview AGREGADO de carrinho/checkout (F3/F4, sem F5).
// ---------------------------------------------------------------------------

export interface CartShippingPreviewLineInput {
  productId: string;
  variantId?: string | null;
  quantity: number;
}

export interface CartShippingPreviewInput {
  destinationShippingSectorId?: string | null;
  items: CartShippingPreviewLineInput[];
  /** serviço escolhido (Economy/Standard/Express...); ausente = campos de topo do serviço mais barato ("a partir de") */
  serviceCode?: string | null;
}

export interface CartShippingPreviewSellerBreakdown {
  sellerId: string;
  storeId: string | null;
  shippingAmount: number;
  currency: string;
}

/** Um serviço de entrega do carrinho: preço real calculado pelo servidor (XOF) ou o motivo de não estar disponível. */
export interface CartShippingServiceOption {
  code: string;
  name: string;
  available: boolean;
  shippingChargedToBuyer?: number;
  shippingCost?: number;
  shippingSellerSubsidy?: number;
  currency?: string;
  sellers?: CartShippingPreviewSellerBreakdown[];
  /** prazo ESTIMADO (dias) deste serviço para o carrinho; null = "Prazo a confirmar" (não configurado). Estimativa, não garantia; sem efeito financeiro. */
  leadTime?: LeadTime | null;
  unavailableCode?: ShippingPreviewUnavailable['code'];
  unavailableMessage?: string;
}

export interface CartShippingPreviewAvailable {
  ok: true;
  available: true;
  /** serviço a que os campos abaixo se referem (o pedido, ou o mais barato quando nenhum foi pedido) */
  serviceCode: string;
  shippingChargedToBuyer: number;
  shippingCost: number;
  shippingSellerSubsidy: number;
  currency: string;
  sellers: CartShippingPreviewSellerBreakdown[];
  leadTime: LeadTime | null;
  services: CartShippingServiceOption[];
}

export interface CartShippingPreviewUnavailable {
  ok: true;
  available: false;
  code: ShippingPreviewUnavailable['code'];
  message: string;
  services?: CartShippingServiceOption[];
}

export interface CartShippingPreviewInvalid {
  ok: false;
  httpStatus: 400 | 404;
  code: string;
  message: string;
}

export type CartShippingPreviewResult = CartShippingPreviewAvailable | CartShippingPreviewUnavailable | CartShippingPreviewInvalid;

/**
 * FASE D18-B1 — subtotal e comissão do grupo de UM vendedor, calculados
 * EXATAMENTE como orderService.ts (createOrderFromCart) faz no checkout:
 * preço = products.price, sobrescrito por productVariants.price quando a
 * variante existe e tem preço; subtotal = preço * quantidade (sem
 * arredondar); taxa por item = categoria -> seller -> padrão global
 * (platformSettings.defaultSellerCommissionPercent); comissão do item =
 * round2(subtotal * taxa / 100), somada e arredondada. Só é chamada quando
 * o vendedor tem parcela de frete > 0 (é o único caso em que a regra do
 * seller net se aplica). Devolve null se a comissão não puder ser resolvida
 * (o checkout bloqueia esse caso por COMMISSION_NOT_CONFIGURED, com ou sem
 * esta regra — nada novo a divergir).
 */
async function resolveSellerGroupNetInputs(
  db: any,
  sellerId: string,
  entries: CartShippingPreviewLineInput[]
): Promise<{ productSubtotal: number; marketplaceCommission: number } | null> {
  const productIds = Array.from(new Set(entries.map((e) => e.productId)));
  const variantIds = Array.from(new Set(entries.map((e) => e.variantId).filter((v): v is string => Boolean(v))));

  const productRows = await db.select().from(products).where(inArray(products.id, productIds));
  const productById = new Map<string, any>(productRows.map((r: any) => [r.id, r]));
  const variantRows = variantIds.length > 0 ? await db.select().from(productVariants).where(inArray(productVariants.id, variantIds)) : [];
  const variantById = new Map<string, any>(variantRows.map((r: any) => [r.id, r]));

  let globalDefaultRate: number | null = null;
  const defRows = await db.select().from(platformSettings).where(eq(platformSettings.key, 'defaultSellerCommissionPercent')).limit(1);
  if (defRows.length > 0) {
    const parsed = Number(defRows[0].valueJson);
    if (!isNaN(parsed) && parsed >= 0) globalDefaultRate = parsed;
  }
  let sellerRate: number | null = null;
  const sellerRows = await db.select().from(sellers).where(eq(sellers.id, sellerId)).limit(1);
  if (sellerRows.length > 0 && sellerRows[0].commissionRate !== null && sellerRows[0].commissionRate !== undefined) {
    sellerRate = Number(sellerRows[0].commissionRate);
  }
  const categoryIds = Array.from(new Set(Array.from(productById.values()).map((p) => p.categoryId).filter(Boolean))) as string[];
  const categoryRate = new Map<string, number>();
  if (categoryIds.length > 0) {
    const catRows = await db.select().from(categories).where(inArray(categories.id, categoryIds));
    for (const c of catRows) {
      if (c.commissionRate !== null && c.commissionRate !== undefined) categoryRate.set(c.id, Number(c.commissionRate));
    }
  }
  const fallbackRate = sellerRate ?? globalDefaultRate;

  let subtotal = 0;
  let commission = 0;
  for (const e of entries) {
    const prod = productById.get(e.productId);
    if (!prod) return null;
    let unitPrice = Number(prod.price);
    if (e.variantId) {
      const v = variantById.get(e.variantId);
      if (v && v.price) unitPrice = Number(v.price);
    }
    const itemSubtotal = unitPrice * e.quantity;
    const rate = prod.categoryId && categoryRate.has(prod.categoryId) ? categoryRate.get(prod.categoryId) : fallbackRate;
    if (rate === null || rate === undefined) return null;
    subtotal += itemSubtotal;
    commission += Math.round((itemSubtotal * (rate / 100)) * 100) / 100;
  }
  return { productSubtotal: subtotal, marketplaceCommission: Math.round(commission * 100) / 100 };
}

/**
 * Preview agregado de frete para carrinho/checkout, POR SERVIÇO DE ENTREGA (Economy/Standard/Express...). Para cada serviço ATIVO do
 * país de destino, resolve F4/F3 uma vez por linha do carrinho (sempre pelo MESMO serviço: a escolha do cliente vale para todas as
 * expedições do carrinho), planeja as expedições (shipmentPlannerService — o mesmo planejamento que a criação do pedido usa) e aplica
 * a política de pagador por grupo (vendedor + loja comercial) — a MESMA resolveShippingPayerPolicy do pedido. Resultado: o valor mostrado
 * para cada serviço é exatamente o que seria cobrado.
 *
 * Um serviço só fica "disponível" se TODAS as linhas têm origem com estoque e tarifa válida (rota, faixa de peso, vigência, ativa) para
 * ele; senão aparece como indisponível com o motivo — nunca com preço inventado e nunca trocado por outro serviço.
 *
 * NUNCA chama F5. NUNCA reserva estoque. NUNCA cria order/inventory_movement/stock_reservation. Sellers são resolvidos INTEIRAMENTE
 * a partir do banco (product.sellerId).
 */
export async function resolveCartShippingPreview(input: CartShippingPreviewInput, executor?: any): Promise<CartShippingPreviewResult> {
  const db = executor ?? getDb();
  if (!db) return { ok: false, httpStatus: 400, code: 'SHIPPING_PREVIEW_DB_UNAVAILABLE', message: 'Banco de dados indisponível.' };

  if (!Array.isArray(input.items) || input.items.length === 0) {
    return { ok: false, httpStatus: 400, code: 'CART_ITEMS_REQUIRED', message: 'O carrinho está vazio.' };
  }

  if (!input.destinationShippingSectorId) {
    return { ok: true, available: false, code: 'DELIVERY_SECTOR_REQUIRED', message: shippingFailureMessage('DELIVERY_SECTOR_REQUIRED'), services: [] };
  }

  const [sectorRow] = await db.select({ countryCode: shippingSectors.countryCode, isActive: shippingSectors.isActive })
    .from(shippingSectors)
    .where(eq(shippingSectors.id, input.destinationShippingSectorId))
    .limit(1);
  if (!sectorRow || sectorRow.isActive === false) {
    return { ok: true, available: false, code: 'DELIVERY_SECTOR_REQUIRED', message: 'O setor de entrega selecionado não é válido. Selecione um endereço de entrega novamente.', services: [] };
  }

  const activeServices: Array<{ id: string; code: string; name: string }> = (await db
    .select({ id: shippingServices.id, code: shippingServices.code, name: shippingServices.name })
    .from(shippingServices)
    .where(and(eq(shippingServices.countryCode, sectorRow.countryCode), eq(shippingServices.isActive, true))))
    .sort(compareShippingServices);
  if (activeServices.length === 0) {
    return { ok: true, available: false, code: 'SHIPPING_SERVICE_NOT_AVAILABLE', message: 'Nenhum serviço de entrega ativo para este destino.', services: [] };
  }

  const options: CartShippingServiceOption[] = [];
  for (const svc of activeServices) {
    const lineResults = await Promise.all(
      input.items.map((item) => resolveShippingPreviewLine({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        destinationShippingSectorId: input.destinationShippingSectorId,
      }, db, svc.code))
    );

    const invalid = lineResults.find((r): r is ShippingPreviewInvalid => r.ok === false);
    if (invalid) return invalid;

    const unavailableLines = lineResults.filter((r): r is ShippingPreviewUnavailable => r.ok === true && r.available === false);
    if (unavailableLines.length > 0) {
      const code = mostActionableFailureCode(unavailableLines.map((u) => u.code));
      const message = unavailableLines.find((u) => u.code === code)!.message;
      options.push({ code: svc.code, name: svc.name, available: false, unavailableCode: code as any, unavailableMessage: message });
      continue;
    }

    const priced = await priceServiceOption(db, svc, lineResults as ShippingPreviewLineAvailable[], input.items, sectorRow.countryCode, input.destinationShippingSectorId);
    options.push(priced);
  }

  const availableOptions = options.filter((o) => o.available);
  const failureSummary = () => {
    const code = mostActionableFailureCode(options.map((o) => o.unavailableCode as string).filter(Boolean));
    const message = options.find((o) => o.unavailableCode === code)?.unavailableMessage || shippingFailureMessage('SHIPPING_RATE_NOT_AVAILABLE');
    return { code: code as any, message };
  };

  // serviço pedido explicitamente: vale SÓ ele — se não estiver disponível, nunca há substituição por outro
  if (input.serviceCode) {
    const wanted = options.find((o) => o.code === String(input.serviceCode).toUpperCase());
    if (!wanted) {
      return { ok: true, available: false, code: 'SHIPPING_SERVICE_NOT_AVAILABLE', message: shippingFailureMessage('SHIPPING_SERVICE_NOT_AVAILABLE'), services: options };
    }
    if (!wanted.available) {
      return { ok: true, available: false, code: wanted.unavailableCode as any, message: wanted.unavailableMessage || shippingFailureMessage('SHIPPING_SERVICE_NOT_AVAILABLE'), services: options };
    }
    return summarize(wanted, options);
  }

  if (availableOptions.length === 0) {
    const f = failureSummary();
    return { ok: true, available: false, code: f.code, message: f.message, services: options };
  }
  // sem serviço pedido (carrinho/produto): campos de topo = o serviço MAIS BARATO disponível ("a partir de"), nunca uma escolha do cliente
  const cheapest = [...availableOptions].sort((a, b) => (a.shippingChargedToBuyer! - b.shippingChargedToBuyer!) || (a.shippingCost! - b.shippingCost!) || compareShippingServices(a, b))[0];
  return summarize(cheapest, options);
}

/** O prazo é só informação: se não puder ser lido, o serviço continua com o preço correto e o prazo fica "a confirmar" (nunca derruba a cotação). */
async function safeLeadTime(db: any, shipments: Array<{ routeId: string; serviceId: string }>): Promise<LeadTime | null> {
  try {
    return aggregateLeadTime(shipments, await loadLeadTimes(db, shipments));
  } catch {
    return null;
  }
}

function summarize(o: CartShippingServiceOption, options: CartShippingServiceOption[]): CartShippingPreviewAvailable {
  return {
    ok: true,
    available: true,
    serviceCode: o.code,
    shippingChargedToBuyer: o.shippingChargedToBuyer!,
    shippingCost: o.shippingCost!,
    shippingSellerSubsidy: o.shippingSellerSubsidy!,
    currency: o.currency!,
    sellers: o.sellers!,
    leadTime: o.leadTime ?? null,
    services: options,
  };
}

/** Preço de UM serviço para o carrinho inteiro: expedições (planner) + política de pagador por grupo + checagem do líquido do vendedor. */
async function priceServiceOption(
  db: any,
  svc: { id: string; code: string; name: string },
  lines: ShippingPreviewLineAvailable[],
  items: CartShippingPreviewLineInput[],
  countryCode: string,
  destinationSectorId: string,
): Promise<CartShippingServiceOption> {
  const LEGACY_NO_STORE_GROUP_KEY = '__LEGACY_NO_STORE__';
  const groupOf = (l: ShippingPreviewLineAvailable) => l.sellerId + '::' + (l.commercialStoreId ?? LEGACY_NO_STORE_GROUP_KEY);

  const planned = await planShipments(db, {
    countryCode,
    destinationSectorId,
    serviceCode: svc.code,
    items: lines.map((l, idx) => ({ key: String(idx), groupKey: groupOf(l), candidate: l.candidate })),
  });
  if (planned.ok === false) {
    return { code: svc.code, name: svc.name, available: false, unavailableCode: (planned.code as any), unavailableMessage: planned.message };
  }

  const bySeller = new Map<string, { sellerId: string; commercialStoreId: string | null; lines: ShippingPreviewLineAvailable[]; items: CartShippingPreviewLineInput[] }>();
  lines.forEach((l, idx) => {
    const key = groupOf(l);
    const g = bySeller.get(key);
    if (g) { g.lines.push(l); g.items.push(items[idx]); }
    else bySeller.set(key, { sellerId: l.sellerId, commercialStoreId: l.commercialStoreId, lines: [l], items: [items[idx]] });
  });
  const rawByGroup = rawCostByGroup(planned.plan);

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const sellers: CartShippingPreviewSellerBreakdown[] = [];
  let shippingChargedToBuyer = 0;
  let shippingCost = 0;
  let shippingSellerSubsidy = 0;

  for (const [groupKey, { sellerId, commercialStoreId, lines: gLines, items: gItems }] of bySeller.entries()) {
    const groupRawShippingCost = rawByGroup.get(groupKey) ?? 0;
    let policy;
    try {
      policy = await resolveShippingPayerPolicy(groupRawShippingCost, { storeId: commercialStoreId, sellerId }, db);
      if (policy.shippingSellerSubsidy > 0) {
        const netInputs = await resolveSellerGroupNetInputs(db, sellerId, gItems);
        if (netInputs) {
          const netCheck = checkSellerNetForShippingShare({ ...netInputs, shippingSellerSubsidy: policy.shippingSellerSubsidy });
          if (!netCheck.ok) throw sellerSubsidyExceedsNetError(netCheck.sellerNetAmount, policy.shippingSellerSubsidy);
        }
      }
    } catch (err) {
      if (err instanceof ShippingPolicyNotApplicableError) {
        return { code: svc.code, name: svc.name, available: false, unavailableCode: err.code as any, unavailableMessage: err.message.replace(/^[A-Z_]+: /, '') };
      }
      throw err;
    }
    shippingChargedToBuyer = round2(shippingChargedToBuyer + policy.shippingChargedToBuyer);
    shippingCost = round2(shippingCost + groupRawShippingCost);
    shippingSellerSubsidy = round2(shippingSellerSubsidy + policy.shippingSellerSubsidy + policy.shippingMarketplaceSubsidy);
    sellers.push({ sellerId, storeId: commercialStoreId, shippingAmount: policy.shippingChargedToBuyer, currency: gLines[0].currency });
  }

  return {
    code: svc.code,
    name: svc.name,
    available: true,
    shippingChargedToBuyer,
    shippingCost,
    shippingSellerSubsidy,
    currency: lines[0]?.currency || 'XOF',
    sellers,
    // só informação para o cliente: lido APÓS todo o cálculo financeiro e nunca o altera
    leadTime: await safeLeadTime(db, planned.plan.shipments),
  };
}
