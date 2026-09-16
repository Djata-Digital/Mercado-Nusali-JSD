/**
 * FASE D16-G2 — preview de entrega READ-ONLY para a página de produto (e,
 * futuramente, checkout) usando o MESMO motor de decisão logística real do
 * checkout (F4 + F3) em vez do motor legado país/zona
 * (ShippingCalculatorService/shipping_rates), que não conhece a geografia
 * por setor onde as tarifas reais de staging/produção estão cadastradas
 * (achado da auditoria D16-G0).
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

export async function resolveShippingPreview(input: ShippingPreviewInput, executor?: any): Promise<ShippingPreviewResult> {
  const db = executor ?? getDb();
  if (!db) return { ok: false, httpStatus: 400, code: 'SHIPPING_PREVIEW_DB_UNAVAILABLE', message: 'Banco de dados indisponível.' };

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
  };
}
