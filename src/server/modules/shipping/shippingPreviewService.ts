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
import { products, productVariants, shippingSectors } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { resolveFulfillmentCandidates, type RejectedFulfillmentCandidate } from './fulfillmentCandidateResolverService.js';
import { validateInventoryVariantConsistency } from '../logistics/fulfillmentLocationService.js';
import { resolveShippingPayerPolicy } from './shippingCalculatorService.js';

export interface ShippingPreviewInput {
  productId: string;
  variantId?: string | null;
  quantity: number;
  destinationShippingSectorId?: string | null;
}

export interface ShippingPreviewAvailable {
  ok: true;
  available: true;
  shippingAmount: number;
  currency: string;
  serviceCode: string;
  serviceName: string;
  fulfillmentType: 'SELLER_LOCATION' | 'NUSALI_HUB';
}

export interface ShippingPreviewUnavailable {
  ok: true;
  available: false;
  code: 'PRODUCT_NOT_AVAILABLE_FOR_QUANTITY' | 'DELIVERY_SECTOR_REQUIRED' | 'SHIPPING_ROUTE_NOT_AVAILABLE' | 'SHIPPING_RATE_NOT_AVAILABLE';
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
interface ShippingPreviewLineAvailable extends ShippingPreviewAvailable {
  sellerId: string;
  storeId: string | null;
}
type ShippingPreviewLineResult = ShippingPreviewLineAvailable | ShippingPreviewUnavailable | ShippingPreviewInvalid;

/**
 * Classifica o MOTIVO agregado de "nenhuma candidate disponível" a partir
 * dos rejectedCandidates do F4 — nunca expõe a lista completa ao público
 * (seção 7 do enunciado), só um dos 4 códigos distinguíveis da seção 8.
 * Prioridade: estoque (mais fundamental/comum) > rota ausente > tarifa
 * ausente > qualquer outro motivo de origem (fallback conservador).
 */
function classifyUnavailableReason(rejected: RejectedFulfillmentCandidate[]): ShippingPreviewUnavailable['code'] {
  const reasons = new Set(rejected.map((r) => r.reason));
  if (reasons.has('INSUFFICIENT_AVAILABLE_STOCK')) return 'PRODUCT_NOT_AVAILABLE_FOR_QUANTITY';
  if (reasons.has('ROUTE_NOT_AVAILABLE')) return 'SHIPPING_ROUTE_NOT_AVAILABLE';
  if (reasons.has('SHIPPING_RATE_NOT_AVAILABLE') || reasons.has('WEIGHT_BAND_NOT_AVAILABLE') || reasons.has('SERVICE_NOT_AVAILABLE')) return 'SHIPPING_RATE_NOT_AVAILABLE';
  return 'PRODUCT_NOT_AVAILABLE_FOR_QUANTITY';
}

/**
 * Núcleo compartilhado: resolve F4/F3 read-only para UMA linha
 * (productId+variantId+quantity+destino). Usado tanto por
 * resolveShippingPreview (produto único, D16-G2, comportamento
 * INALTERADO) quanto por resolveCartShippingPreview (agregado de
 * carrinho/checkout, D16-G3) — uma única implementação da resolução de
 * fulfillment, nunca duplicada.
 */
async function resolveShippingPreviewLine(input: ShippingPreviewInput, db: any): Promise<ShippingPreviewLineResult> {
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
    const message = code === 'PRODUCT_NOT_AVAILABLE_FOR_QUANTITY'
      ? 'Nenhuma origem consegue atender a quantidade solicitada para este destino.'
      : code === 'SHIPPING_ROUTE_NOT_AVAILABLE'
      ? 'Não há rota de entrega cadastrada entre a origem deste produto e o destino selecionado.'
      : 'Não há tarifa de frete cadastrada para esta rota e faixa de peso.';
    return { ok: true, available: false, code, message };
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
    sellerId: product.sellerId,
    storeId: bc.storeId || null,
  };
}

export async function resolveShippingPreview(input: ShippingPreviewInput, executor?: any): Promise<ShippingPreviewResult> {
  const db = executor ?? getDb();
  if (!db) return { ok: false, httpStatus: 400, code: 'SHIPPING_PREVIEW_DB_UNAVAILABLE', message: 'Banco de dados indisponível.' };

  const line = await resolveShippingPreviewLine(input, db);
  if (line.ok === false) return line;
  if (line.available === false) return line;

  // Contrato público de produto único (D16-G2) permanece IDÊNTICO —
  // sellerId/storeId nunca são expostos aqui (só usados internamente pelo
  // preview de carrinho, D16-G3, para agrupar por vendedor).
  const { sellerId, storeId, ...publicShape } = line;
  return publicShape;
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
}

export interface CartShippingPreviewSellerBreakdown {
  sellerId: string;
  storeId: string | null;
  shippingAmount: number;
  currency: string;
}

export interface CartShippingPreviewAvailable {
  ok: true;
  available: true;
  // Valor efetivamente cobrado do comprador (soma por vendedor, já com
  // resolveShippingPayerPolicy aplicada por grupo — MESMA função e MESMA
  // semântica que orderService.ts/F6.2 usa).
  shippingChargedToBuyer: number;
  // Soma bruta das cotações F3/F4 (antes da política de pagador) — útil
  // para depuração/exibição de subsídio, nunca o valor cobrado em si.
  shippingCost: number;
  shippingSellerSubsidy: number;
  currency: string;
  sellers: CartShippingPreviewSellerBreakdown[];
}

export interface CartShippingPreviewUnavailable {
  ok: true;
  available: false;
  code: 'PRODUCT_NOT_AVAILABLE_FOR_QUANTITY' | 'DELIVERY_SECTOR_REQUIRED' | 'SHIPPING_ROUTE_NOT_AVAILABLE' | 'SHIPPING_RATE_NOT_AVAILABLE';
  message: string;
}

export interface CartShippingPreviewInvalid {
  ok: false;
  httpStatus: 400 | 404;
  code: string;
  message: string;
}

export type CartShippingPreviewResult = CartShippingPreviewAvailable | CartShippingPreviewUnavailable | CartShippingPreviewInvalid;

/**
 * Preview agregado de frete para carrinho/checkout — reaproveita
 * resolveShippingPreviewLine (mesmo núcleo F4/F3 do preview de produto
 * único) uma vez POR LINHA do carrinho, exatamente como orderService.ts
 * (F6.2, multiSellerCheckoutEnabled=true) faz: 1 chamada F4 por linha
 * (productId+variantId+quantity), NUNCA consolidação/split entre linhas.
 * Agrupa por sellerId (mesma chave de child order do F6.2), soma
 * shippingAmount aditivamente por grupo (sem otimização de pacote nesta
 * fase) e aplica resolveShippingPayerPolicy por grupo — a MESMA função que
 * F6.2 usa, garantindo que o valor mostrado aqui seja idêntico ao que
 * seria realmente cobrado na confirmação.
 *
 * Fail-closed: qualquer linha indisponível (produto/variante/estoque/rota/
 * tarifa) torna o resultado inteiro indisponível — nunca uma soma parcial
 * que subestime o frete real (mesmo espírito de
 * calculateMultiSellerFreight, o motor legado que este preview substitui).
 *
 * NUNCA chama F5. NUNCA reserva estoque. NUNCA cria
 * order/inventory_movement/stock_reservation. Sellers são resolvidos
 * INTEIRAMENTE a partir do banco (product.sellerId) — nunca confiados a um
 * campo do payload do cliente.
 */
export async function resolveCartShippingPreview(input: CartShippingPreviewInput, executor?: any): Promise<CartShippingPreviewResult> {
  const db = executor ?? getDb();
  if (!db) return { ok: false, httpStatus: 400, code: 'SHIPPING_PREVIEW_DB_UNAVAILABLE', message: 'Banco de dados indisponível.' };

  if (!Array.isArray(input.items) || input.items.length === 0) {
    return { ok: false, httpStatus: 400, code: 'CART_ITEMS_REQUIRED', message: 'O carrinho está vazio.' };
  }

  // Setor de destino é checado ANTES de resolver qualquer linha — nunca uma
  // tarifa parcial/adivinhada quando o setor nem está definido (seção
  // "DESTINO" do enunciado — nunca cai silenciosamente no motor legado).
  if (!input.destinationShippingSectorId) {
    return { ok: true, available: false, code: 'DELIVERY_SECTOR_REQUIRED', message: 'Selecione um endereço de entrega com setor definido para calcular o frete.' };
  }

  const lineResults = await Promise.all(
    input.items.map((item) => resolveShippingPreviewLine({
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
      destinationShippingSectorId: input.destinationShippingSectorId,
    }, db))
  );

  // Qualquer linha estruturalmente inválida (produto/variante/quantidade
  // malformados) é um erro imediato — nunca escondida numa soma parcial.
  const invalid = lineResults.find((r): r is ShippingPreviewInvalid => r.ok === false);
  if (invalid) return invalid;

  // Fail-closed: qualquer linha indisponível -> resultado inteiro
  // indisponível (mesma semântica de calculateMultiSellerFreight — nunca
  // uma soma que ignore silenciosamente o grupo que falhou).
  const unavailable = lineResults.find((r): r is ShippingPreviewUnavailable => r.ok === true && r.available === false);
  if (unavailable) {
    return { ok: true, available: false, code: unavailable.code, message: unavailable.message };
  }

  const resolvedLines = lineResults as ShippingPreviewLineAvailable[];

  // Agrupa por sellerId — MESMA chave que orderService.ts usa para separar
  // child orders (bySeller, F6.2) — nunca por um valor vindo do frontend.
  const bySeller = new Map<string, ShippingPreviewLineAvailable[]>();
  for (const line of resolvedLines) {
    const existing = bySeller.get(line.sellerId);
    if (existing) existing.push(line);
    else bySeller.set(line.sellerId, [line]);
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const currency = resolvedLines[0]?.currency || 'XOF';
  const sellers: CartShippingPreviewSellerBreakdown[] = [];
  let shippingChargedToBuyer = 0;
  let shippingCost = 0;
  let shippingSellerSubsidy = 0;

  for (const [sellerId, lines] of bySeller) {
    // Soma ADITIVA por linha dentro do grupo — mesma regra de
    // computeSmartFulfillmentFreightRes (F6.2): nunca consolidação de
    // pacote nesta fase, mesmo que no futuro isso possa ser otimizado.
    const groupRawShippingCost = round2(lines.reduce((s, l) => s + l.shippingAmount, 0));
    const storeId = lines.find((l) => l.storeId)?.storeId || null;
    const policy = await resolveShippingPayerPolicy(groupRawShippingCost, { storeId, sellerId }, db);

    shippingChargedToBuyer = round2(shippingChargedToBuyer + policy.shippingChargedToBuyer);
    shippingCost = round2(shippingCost + groupRawShippingCost);
    shippingSellerSubsidy = round2(shippingSellerSubsidy + policy.shippingSellerSubsidy + policy.shippingMarketplaceSubsidy);

    sellers.push({
      sellerId,
      storeId,
      shippingAmount: policy.shippingChargedToBuyer,
      currency: lines[0].currency,
    });
  }

  return {
    ok: true,
    available: true,
    shippingChargedToBuyer,
    shippingCost,
    shippingSellerSubsidy,
    currency,
    sellers,
  };
}
