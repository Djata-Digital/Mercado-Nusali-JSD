/**
 * Fase C5.3-C1 — tipos e helpers PUROS do objeto `chargeback` Asaas,
 * derivados EXCLUSIVAMENTE dos fatos confirmados na auditoria oficial da
 * Fase C5.3-A.1 (schema OpenAPI real por trás de docs.asaas.com — não a
 * prosa narrativa simplificada). Nada aqui aplica efeito financeiro — este
 * arquivo só descreve o CONTRATO externo e a lógica pura de
 * sanitização/classificação que `chargebackService.ts` usa.
 *
 * Fatos-fonte (não inferidos, ver relatório C5.3-A.1):
 *  - `payment.chargeback` é um sub-objeto do `payment` (nunca uma entidade
 *    solta sem contexto) — schema `PaymentChargebackResponseDTO`;
 *  - TEM id próprio (`chargeback.id`, UUID real e documentado) — diferente
 *    do refund individual, que confirmadamente NÃO tem;
 *  - `status` é fechado em 5 valores conhecidos: REQUESTED | IN_DISPUTE |
 *    DISPUTE_LOST | REVERSED | DONE — mas a própria doc admite que a lista
 *    pode crescer sem aviso, logo nunca tratamos isso como enum fechado no
 *    nosso lado;
 *  - `disputeStatus` é um campo SEPARADO (REQUESTED | ACCEPTED | REJECTED) —
 *    é o status da NOSSA submissão de evidência, não o desfecho do
 *    chargeback em si — nunca confundir os dois;
 *  - `value` existe e é distinto de `payment.value` — nunca assumir igual;
 *  - `currency` NÃO existe neste objeto — qualquer moeda associada a um
 *    chargeback local é sempre um snapshot copiado do payment financiador,
 *    nunca um campo "do provider".
 */

/** Mesma tolerância monetária usada em todo o financeiro do projeto (ver
 * asaasRefund.ts) — reaproveitada aqui, nunca duplicada como uma nova
 * constante que poderia divergir com o tempo. */
export { ASAAS_AMOUNT_TOLERANCE } from './asaasRefund.js';

/**
 * Objeto `chargeback` bruto do Asaas — os 12 campos documentados
 * (`PaymentChargebackResponseDTO`, C5.3-A.1 seção 3), MENOS `creditCard`.
 *
 * `creditCard` é deliberadamente OMITIDO desta interface (C5.3-C1, seção 7):
 * não é necessário para a state machine local nem para o futuro
 * release-blocking, e evitar persistir até os últimos-4-dígitos de um
 * cartão sem necessidade concreta é a opção mais conservadora. Se uma fase
 * futura precisar dele (ex.: exibição em um painel de disputa), deve ser
 * adicionado explicitamente ali, nunca "porque já vinha no payload".
 */
export interface AsaasChargeback {
  id: string;
  payment: string;
  installment: string | null;
  customerAccount: string | null;
  /** RAW — nunca tratado como enum fechado no nosso lado (ver header do arquivo). */
  status: string;
  reason: string | null;
  disputeStartDate: string | null;
  value: number;
  paymentDate: string | null;
  /** RAW — status da NOSSA disputa/evidência, não do chargeback em si. */
  disputeStatus: string | null;
  deadlineToSendDisputeDocuments: string | null;
}

/**
 * Copia em whitelist — nunca um spread cego do objeto bruto do webhook.
 * Mesma disciplina de `sanitizeAsaasRefund` (asaasRefund.ts): protege contra
 * qualquer campo inesperado/futuro, documenta campo a campo o que é aceito,
 * e nunca pode conter headers/tokens/segredos (a entrada é sempre
 * `payload.payment.chargeback` do webhook já autenticado, nunca a
 * requisição HTTP em si). `creditCard`, se presente na entrada, é
 * silenciosamente descartado (nunca propagado) — decisão C5.3-C1 seção 7.
 *
 * Retorna `null` quando a entrada não é sequer um objeto (ex.: `undefined`,
 * `null`, string) — não inventa um chargeback vazio.
 */
export function sanitizeAsaasChargeback(raw: any): AsaasChargeback | null {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: typeof raw.id === 'string' ? raw.id : '',
    payment: typeof raw.payment === 'string' ? raw.payment : '',
    installment: typeof raw.installment === 'string' ? raw.installment : null,
    customerAccount: typeof raw.customerAccount === 'string' ? raw.customerAccount : null,
    status: typeof raw.status === 'string' ? raw.status : '',
    reason: typeof raw.reason === 'string' ? raw.reason : null,
    disputeStartDate: typeof raw.disputeStartDate === 'string' ? raw.disputeStartDate : null,
    value: typeof raw.value === 'number' ? raw.value : Number(raw.value ?? NaN),
    paymentDate: typeof raw.paymentDate === 'string' ? raw.paymentDate : null,
    disputeStatus: typeof raw.disputeStatus === 'string' ? raw.disputeStatus : null,
    deadlineToSendDisputeDocuments: typeof raw.deadlineToSendDisputeDocuments === 'string' ? raw.deadlineToSendDisputeDocuments : null,
  };
}

/** Estados locais NOSSOS (nunca os do provider) — C5.3-A.1 item 21 / C5.3-C1 seção 13. */
export type LocalChargebackStatus = 'active' | 'lost' | 'reversed' | 'manual_review';

export const LOCAL_CHARGEBACK_STATUSES: readonly LocalChargebackStatus[] = ['active', 'lost', 'reversed', 'manual_review'];

/**
 * Classificação "isolada" (sem histórico) de um `chargeback.status` bruto —
 * a mesma regra vale tanto para a PRIMEIRA observação de um chargeback.id
 * quanto como "candidato" a ser combinado com o estado anterior por
 * `resolveNextLocalStatus` (C5.3-C1 seção 13/15).
 *
 *   REQUESTED, IN_DISPUTE           -> active
 *   DISPUTE_LOST                    -> lost
 *   REVERSED                        -> reversed
 *   DONE ou qualquer valor          -> manual_review (nunca decide terminal
 *   desconhecido/futuro                sozinho sem uma DISPUTE_LOST/REVERSED
 *                                       observada antes — seção 15 do pedido)
 */
export function classifyChargebackStatus(providerStatus: string): LocalChargebackStatus {
  switch (providerStatus) {
    case 'REQUESTED':
    case 'IN_DISPUTE':
      return 'active';
    case 'DISPUTE_LOST':
      return 'lost';
    case 'REVERSED':
      return 'reversed';
    default:
      return 'manual_review';
  }
}

/**
 * Transição monotônica (C5.3-C1 seção 14/30) — nunca chamada para a
 * PRIMEIRA observação (nesse caso o candidate já É o localStatus inicial,
 * ver `chargebackService.ts`). `candidate` já deve ter passado por
 * `classifyChargebackStatus` (ou ter sido forçado para 'manual_review' por
 * uma condição estrutural — settlementRole=candidate, value inválido/além
 * do payment — ANTES de chegar aqui, nunca depois).
 *
 * Regras (nunca permitir):
 *   lost/reversed -> active                  (nunca regride um terminal)
 *   manual_review -> qualquer coisa automático (sticky — só intervenção
 *                                                humana resolve, fora desta
 *                                                fase)
 *   lost <-> reversed                        (conflito terminal explícito
 *                                              -> manual_review, nunca um
 *                                              terminal "vence" o outro
 *                                              silenciosamente)
 *
 * Um evento não-terminal (active) ou de confiança reduzida (manual_review,
 * por status desconhecido ou value inválido) chegando DEPOIS de um terminal
 * já resolvido NUNCA regride o terminal — é tratado como entrega
 * atrasada/fora de ordem, preservando o que já foi decidido.
 */
export function resolveNextLocalStatus(existing: LocalChargebackStatus, candidate: LocalChargebackStatus): LocalChargebackStatus {
  if (existing === 'manual_review') return 'manual_review';
  if (existing === 'lost' || existing === 'reversed') {
    if (candidate === existing) return existing;
    if (candidate === 'active' || candidate === 'manual_review') return existing;
    return 'manual_review'; // única possibilidade restante: o OUTRO terminal
  }
  // existing === 'active'
  return candidate;
}
