/**
 * Erros de frete do checkout: classificação PRECISA do motivo (estoque, setor de origem, peso, rota, serviço, tarifa) e mapeamento
 * dos erros de criação de pedido para códigos HTTP estáveis — nunca mais "falta de estoque" quando o problema é a falta de tarifa, nem
 * o texto interno "CODIGO: mensagem" mostrado ao comprador.
 *
 * Só LÊ os motivos já produzidos pelo F4/F3 (RejectedFulfillmentCandidate); não cria nenhuma regra de frete nova.
 */
import type { RejectedFulfillmentCandidate } from './fulfillmentCandidateResolverService.js';

export type ShippingFailureCode =
  | 'PRODUCT_NOT_AVAILABLE_FOR_QUANTITY'
  | 'SHIPPING_ORIGIN_SECTOR_MISSING'
  | 'SHIPPING_ORIGIN_NOT_OPERATIONAL'
  | 'SHIPPING_WEIGHT_UNAVAILABLE'
  | 'SHIPPING_ROUTE_NOT_AVAILABLE'
  | 'SHIPPING_SERVICE_NOT_AVAILABLE'
  | 'SHIPPING_RATE_NOT_AVAILABLE'
  | 'SHIPPING_CURRENCY_MISMATCH'
  | 'DELIVERY_SECTOR_REQUIRED';

export const SHIPPING_FAILURE_MESSAGES: Record<ShippingFailureCode, string> = {
  PRODUCT_NOT_AVAILABLE_FOR_QUANTITY: 'Nenhuma origem consegue atender a quantidade solicitada para este destino.',
  SHIPPING_ORIGIN_SECTOR_MISSING: 'A origem deste produto ainda não tem um setor de expedição configurado. Contacte o vendedor.',
  SHIPPING_ORIGIN_NOT_OPERATIONAL: 'A origem deste produto não está operacional no momento. Contacte o vendedor.',
  SHIPPING_WEIGHT_UNAVAILABLE: 'O peso deste produto não está cadastrado, por isso o frete não pode ser calculado.',
  SHIPPING_ROUTE_NOT_AVAILABLE: 'Não há rota de entrega cadastrada entre a origem deste produto e o destino selecionado.',
  SHIPPING_SERVICE_NOT_AVAILABLE: 'O serviço de entrega escolhido não está disponível para esta rota.',
  SHIPPING_RATE_NOT_AVAILABLE: 'Não há tarifa de frete cadastrada para esta rota e faixa de peso.',
  SHIPPING_CURRENCY_MISMATCH: 'A tarifa de frete desta rota está numa moeda diferente da do mercado de entrega.',
  DELIVERY_SECTOR_REQUIRED: 'Selecione um endereço de entrega com setor definido para calcular o frete.',
};

/** motivo bruto do F4/F3 -> categoria */
function categoryOf(reason: string): ShippingFailureCode {
  switch (reason) {
    case 'INSUFFICIENT_AVAILABLE_STOCK': return 'PRODUCT_NOT_AVAILABLE_FOR_QUANTITY';
    case 'ROUTE_NOT_AVAILABLE': return 'SHIPPING_ROUTE_NOT_AVAILABLE';
    case 'SERVICE_NOT_AVAILABLE': return 'SHIPPING_SERVICE_NOT_AVAILABLE';
    case 'SHIPPING_RATE_NOT_AVAILABLE':
    case 'WEIGHT_BAND_NOT_AVAILABLE':
    case 'WEIGHT_BAND_CONFLICT': return 'SHIPPING_RATE_NOT_AVAILABLE';
    case 'CURRENCY_MISMATCH': return 'SHIPPING_CURRENCY_MISMATCH';
    case 'ORIGIN_SECTOR_MISSING':
    case 'ORIGIN_SECTOR_INVALID': return 'SHIPPING_ORIGIN_SECTOR_MISSING';
    case 'WEIGHT_UNAVAILABLE':
    case 'WEIGHT_INVALID': return 'SHIPPING_WEIGHT_UNAVAILABLE';
    case 'DESTINATION_SECTOR_INVALID':
    case 'DESTINATION_SECTOR_MISSING':
    case 'COUNTRY_MISMATCH': return 'DELIVERY_SECTOR_REQUIRED';
    default: return 'SHIPPING_ORIGIN_NOT_OPERATIONAL'; // FULFILLMENT_LOCATION_*, STORE_INACTIVE, WAREHOUSE_INACTIVE, LOCATION_OWNERSHIP_MISMATCH...
  }
}

/**
 * Do mais ao menos acionável: se existe QUALQUER origem com estoque que falhou por rota/tarifa/serviço/setor/peso, esse é o problema do
 * comprador (e do administrador) — nunca "estoque". Estoque só é o motivo quando TODAS as origens falharam por estoque (ou não há origem).
 */
const PRIORITY: ShippingFailureCode[] = [
  'SHIPPING_ROUTE_NOT_AVAILABLE',
  'SHIPPING_RATE_NOT_AVAILABLE',
  'SHIPPING_SERVICE_NOT_AVAILABLE',
  'SHIPPING_CURRENCY_MISMATCH',
  'SHIPPING_ORIGIN_SECTOR_MISSING',
  'SHIPPING_WEIGHT_UNAVAILABLE',
  'SHIPPING_ORIGIN_NOT_OPERATIONAL',
  'DELIVERY_SECTOR_REQUIRED',
  'PRODUCT_NOT_AVAILABLE_FOR_QUANTITY',
];

export function classifyRejectedCandidates(rejected: Array<Pick<RejectedFulfillmentCandidate, 'reason'>>): ShippingFailureCode {
  if (!rejected || rejected.length === 0) return 'PRODUCT_NOT_AVAILABLE_FOR_QUANTITY';
  const present = new Set(rejected.map((r) => categoryOf(r.reason)));
  return PRIORITY.find((c) => present.has(c)) ?? 'PRODUCT_NOT_AVAILABLE_FOR_QUANTITY';
}

export function shippingFailureMessage(code: ShippingFailureCode): string {
  return SHIPPING_FAILURE_MESSAGES[code];
}

/** Erro de frete do checkout com código estável (a mensagem inclui "CODIGO: texto" só para compatibilidade com quem lê a mensagem). */
export class CheckoutShippingError extends Error {
  code: string;
  httpStatus: number;
  details?: Record<string, unknown>;
  /** texto limpo para o comprador (sem o prefixo do código) */
  userMessage: string;
  constructor(code: string, userMessage: string, httpStatus = 409, details?: Record<string, unknown>) {
    super(`${code}: ${userMessage}`);
    this.name = 'CheckoutShippingError';
    this.code = code;
    this.userMessage = userMessage;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

// ---------------------------------------------------------------------------------------------------------------- HTTP

/** Códigos que o checkout já lança como "CODIGO: texto" e que têm status próprio (o resto fica 400, como sempre). */
const STATUS_BY_CODE: Record<string, number> = {
  FULFILLMENT_RESERVATION_CONFLICT: 409,
  SHIPPING_QUOTE_CHANGED: 409,
  SHIPPING_SERVICE_UNAVAILABLE: 409,
  SHIPPING_SERVICE_REQUIRED: 400,
  SHIPPING_CONFIRMATION_REQUIRED: 400,
  PRODUCT_NOT_AVAILABLE_FOR_QUANTITY: 409,
  SHIPPING_ORIGIN_SECTOR_MISSING: 409,
  SHIPPING_ORIGIN_NOT_OPERATIONAL: 409,
  SHIPPING_WEIGHT_UNAVAILABLE: 409,
  SHIPPING_ROUTE_NOT_AVAILABLE: 409,
  SHIPPING_SERVICE_NOT_AVAILABLE: 409,
  SHIPPING_RATE_NOT_AVAILABLE: 409,
  SHIPPING_CURRENCY_MISMATCH: 409,
  DELIVERY_SECTOR_REQUIRED: 409,
};

export interface MappedOrderError { status: number; code: string; message: string; details?: Record<string, unknown> }

/**
 * Erro de criação de pedido -> resposta HTTP. Mantém os códigos antigos (INSUFFICIENT_STOCK, ORDER_CREATION_FAILED) quando não há um
 * código melhor; quando a mensagem vem como "CODIGO_EM_MAIUSCULAS: texto", o código vira o da própria regra e o texto perde o prefixo.
 */
export function mapOrderCreationError(err: any): MappedOrderError {
  if (err instanceof CheckoutShippingError) {
    return { status: err.httpStatus, code: err.code, message: err.userMessage, details: err.details };
  }
  const msg: string = String(err?.message || 'Erro ao criar pedido.');
  const m = /^([A-Z][A-Z0-9_]{3,}): ([\s\S]+)$/.exec(msg);
  if (m) {
    const [, code, rest] = m;
    if (code === 'FULFILLMENT_RESERVATION_CONFLICT') return { status: 409, code, message: msg };
    const status = STATUS_BY_CODE[code] ?? 400;
    return { status, code, message: rest };
  }
  if (msg.includes('FULFILLMENT_RESERVATION_CONFLICT')) return { status: 409, code: 'FULFILLMENT_RESERVATION_CONFLICT', message: msg };
  if (msg.includes('INSUFFICIENT_STOCK') || msg.includes('Estoque insuficiente')) return { status: 400, code: 'INSUFFICIENT_STOCK', message: msg };
  return { status: 400, code: 'ORDER_CREATION_FAILED', message: msg };
}
