/**
 * Fase C5.2-D.3 — tipos e helpers PUROS do refund Asaas, derivados
 * EXCLUSIVAMENTE dos fatos confirmados na auditoria oficial da Fase C5.2-D.1
 * (docs.asaas.com). Nada aqui é conectado ao fluxo financeiro local
 * (refundService.ts inalterado) — este arquivo só descreve o CONTRATO
 * externo e oferece a lógica de correlação/sanitização que o client usa.
 *
 * Fatos-fonte (não inferidos, ver relatório C5.2-D.1):
 *  - o objeto refund individual do Asaas tem EXATAMENTE 7 campos, sem `id`
 *    próprio (confirmado tripla fonte: payment.refunds[] da POST, GET
 *    /refunds, guia "Estornos");
 *  - status só tem 3 valores possíveis: PENDING | CANCELLED | DONE;
 *  - `description` é o único campo que ecoa de volta o que enviamos na POST
 *    — nossa única chave de correlação viável (nunca um id do provedor).
 */

/** Tolerância monetária — MESMO padrão já usado em todo o projeto (ver
 * refundService.ts, paymentService.ts, schema CHECKs: 0.005), não uma nova
 * biblioteca/convenção. */
export const ASAAS_AMOUNT_TOLERANCE = 0.005;

export type AsaasRefundStatus = 'PENDING' | 'CANCELLED' | 'DONE';

/**
 * Objeto refund individual do Asaas — EXATAMENTE os 7 campos oficiais
 * (auditoria C5.2-D.1, seção 5). Nunca adicionar `id`/`providerRefundId` —
 * confirmado que não existe para Pix.
 */
export interface AsaasRefund {
  dateCreated: string;
  status: AsaasRefundStatus;
  value: number;
  description: string | null;
  endToEndIdentifier: string | null;
  transactionReceiptUrl: string | null;
  refundedSplits: unknown[];
}

/** Body da POST /v3/payments/{id}/refund — NUNCA inclui splitRefunds (este
 * marketplace não usa Asaas Split). `value` é SEMPRE enviado explicitamente,
 * mesmo em refund total — nosso backend é a autoridade do amount, nunca o
 * Asaas "inferir" um refund integral por omissão (auditoria D.1, seção 2). */
export interface AsaasRefundRequest {
  value: number;
  description: string;
}

/** Wrapper de lista da GET /v3/payments/{id}/refunds (auditoria D.1, seção 4). */
export interface AsaasRefundListResponse {
  object: 'list';
  hasMore: boolean;
  totalCount: number;
  limit: number;
  offset: number;
  data: AsaasRefund[];
}

/**
 * Resultado da correlação por `description` — nunca esconde ambiguidade
 * (seção 10 do pedido). Usado tanto pela leitura da resposta da POST quanto,
 * futuramente (D.5), pela reconciliação via GET.
 */
export type RefundCorrelationResult =
  | { status: 'FOUND'; refund: AsaasRefund }
  | { status: 'NOT_FOUND' }
  | { status: 'AMBIGUOUS'; matches: AsaasRefund[] }
  | { status: 'AMOUNT_MISMATCH'; refund: AsaasRefund };

/**
 * Copia em whitelist — nunca um spread cego do objeto bruto retornado pela
 * API. Protege contra qualquer campo inesperado/futuro que o Asaas venha a
 * incluir (nunca vira "raw evidence" sem passar por aqui) e documenta,
 * campo a campo, que nada além dos 7 conhecidos é aceito. Nunca recebe nem
 * pode conter headers/config/API key — a entrada é sempre um item de
 * `payment.refunds[]`/`GET .../refunds`, nunca a requisição.
 */
export function sanitizeAsaasRefund(raw: any): AsaasRefund {
  return {
    dateCreated: typeof raw?.dateCreated === 'string' ? raw.dateCreated : '',
    status: (raw?.status === 'PENDING' || raw?.status === 'CANCELLED' || raw?.status === 'DONE') ? raw.status : 'PENDING',
    value: typeof raw?.value === 'number' ? raw.value : Number(raw?.value ?? NaN),
    description: typeof raw?.description === 'string' ? raw.description : null,
    endToEndIdentifier: typeof raw?.endToEndIdentifier === 'string' ? raw.endToEndIdentifier : null,
    transactionReceiptUrl: typeof raw?.transactionReceiptUrl === 'string' ? raw.transactionReceiptUrl : null,
    refundedSplits: Array.isArray(raw?.refundedSplits) ? raw.refundedSplits : [],
  };
}

/**
 * Helper PURO reutilizável (seção 10 do pedido) — localiza o refund
 * individual que corresponde à nossa correlationKey dentro de uma lista de
 * refunds já sanitizados. NUNCA seleciona por posição (nunca
 * `refunds[refunds.length - 1]`) — sempre por `description === correlationKey`,
 * amount é só uma validação SECUNDÁRIA sobre o item já identificado por
 * description, nunca o critério de busca primário (duas descriptions
 * diferentes podem legitimamente ter o mesmo value — seção 9 do pedido).
 *
 * Contrato de fail-closed (seção 6/10 do pedido):
 *   0 matches por description  -> NOT_FOUND
 *   >1 matches por description -> AMBIGUOUS (nunca escolhe um "primeiro")
 *   1 match, mas |value - expectedAmount| > tolerância -> AMOUNT_MISMATCH
 *   1 match e valor bate -> FOUND
 */
export function findRefundByCorrelation(
  refunds: AsaasRefund[] | null | undefined,
  correlationKey: string,
  expectedAmount: number,
  tolerance: number = ASAAS_AMOUNT_TOLERANCE
): RefundCorrelationResult {
  const list = Array.isArray(refunds) ? refunds : [];
  const matches = list.filter((r) => r.description === correlationKey);

  if (matches.length === 0) return { status: 'NOT_FOUND' };
  if (matches.length > 1) return { status: 'AMBIGUOUS', matches };

  const only = matches[0];
  if (Math.abs(Number(only.value) - Number(expectedAmount)) > tolerance) {
    return { status: 'AMOUNT_MISMATCH', refund: only };
  }
  return { status: 'FOUND', refund: only };
}
