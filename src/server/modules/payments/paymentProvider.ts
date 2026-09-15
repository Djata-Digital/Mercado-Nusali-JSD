export interface PaymentGatewayRequest {
  orderId: string;
  amount: number;
  currency: string;
  customerName: string;
  customerEmail: string;
  paymentMethod: string;
  metadata?: Record<string, any>;
}

export interface PaymentGatewayResponse {
  success: boolean;
  transactionRef: string;
  status: 'PENDING' | 'APPROVED' | 'FAILED' | 'REFUNDED';
  qrCodeUrl?: string;
  pixCopiaECola?: string;
  rawResponse?: any;
}

/**
 * Fase C5.2-D.3 — substitui `refundPayment(transactionRef, amount?)`. Essa
 * assinatura antiga foi criada antes de existir qualquer arquitetura real de
 * refund (nenhum provider a implementava de verdade — `AsaasPaymentProvider
 * .refundPayment` só lançava NOT_IMPLEMENTED) e não tinha onde carregar a
 * correlationKey que a auditoria C5.2-D.1 confirmou ser indispensável (Asaas
 * não emite id de refund para Pix — a única identidade do lado externo é o
 * valor que NÓS geramos e enviamos como `description`). Auditoria confirmou
 * zero call sites reais e um único implementer (`AsaasPaymentProvider`) —
 * seguro evoluir agora, sem quebrar nenhum caller.
 */
export interface RefundGatewayRequest {
  /** Id da cobrança no provider (payments.transactionRef) — nunca um id de refund, que não existe. */
  transactionRef: string;
  /** Valor a estornar — autoridade é sempre o nosso backend, nunca inferido pelo provider. */
  amount: number;
  /** Chave de correlação gerada pelo backend (ex.: NUSALI_REFUND:<refundLocalId>) — é o que vira `description` na Asaas. */
  correlationKey: string;
}

/**
 * Resultado discriminado — nunca um `success: boolean` genérico (perderia
 * exatamente a informação que D.4/D.5 precisam: PENDING/DONE/CANCELLED não
 * são a mesma coisa que "sucesso", e um erro de rede não é a mesma coisa que
 * uma recusa definitiva do provider). Campos mantidos deliberadamente
 * genéricos (`providerStatus: string`, `rawEvidence/evidence: unknown`) para
 * a interface continuar reutilizável por outro provider hipotético — o
 * consumidor que precisa da forma exata do Asaas (`AsaasRefund`) usa os
 * tipos específicos exportados por `types/asaasRefund.ts`, nunca este.
 */
export type RefundGatewayOutcome =
  | {
      outcome: 'SUBMITTED';
      /** Status bruto do provider no momento da resposta — NUNCA reescrito/otimista (PENDING permanece PENDING, nunca "quase DONE"). */
      providerStatus: string;
      correlationKey: string;
      transactionRef: string;
      /** Evidência sanitizada do item individual correlacionado — nunca headers/request config/API key. */
      rawEvidence: unknown;
    }
  | {
      /** Provider respondeu de forma síncrona recusando (400/401/403/404/429/5xx) — sabemos que o refund NÃO foi criado. */
      outcome: 'DEFINITIVE_FAILURE';
      httpStatus: number;
      code: string;
      message: string;
      correlationKey: string;
      transactionRef: string;
    }
  | {
      /** Timeout/erro de rede — NÃO sabemos se o provider processou a requisição antes da conexão cair. Nunca reenviar a POST cegamente a partir daqui. */
      outcome: 'AMBIGUOUS_EXTERNAL_RESULT';
      code: string;
      message: string;
      correlationKey: string;
      transactionRef: string;
    }
  | {
      /** POST retornou 200, mas não foi possível identificar COM SEGURANÇA qual item de refunds[] é o nosso. */
      outcome: 'RESPONSE_CORRELATION_FAILURE';
      reason: 'ZERO_MATCHES' | 'MULTIPLE_MATCHES' | 'AMOUNT_MISMATCH';
      correlationKey: string;
      transactionRef: string;
      /** null (ZERO_MATCHES), array sanitizado (MULTIPLE_MATCHES) ou item único sanitizado (AMOUNT_MISMATCH) — nunca omitido, para auditoria manual. */
      evidence: unknown;
    };

export interface PayoutGatewayRequest {
  payoutId: string;
  sellerId: string;
  amount: number;
  currency: string;
  method: string;
  destinationAccount: {
    bankName?: string;
    accountHolder?: string;
    accountNumber?: string;
    pixKey?: string;
    mobileMoneyNumber?: string;
  };
}

export interface PayoutGatewayResponse {
  success: boolean;
  transactionRef: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  rawResponse?: any;
}

export interface PaymentProvider {
  readonly name: string;
  initiatePayment(req: PaymentGatewayRequest): Promise<PaymentGatewayResponse>;
  checkPaymentStatus(transactionRef: string): Promise<PaymentGatewayResponse>;
  refundPayment(req: RefundGatewayRequest): Promise<RefundGatewayOutcome>;
}

export interface PayoutProvider {
  readonly name: string;
  processPayout(req: PayoutGatewayRequest): Promise<PayoutGatewayResponse>;
  getPayoutStatus(transactionRef: string): Promise<PayoutGatewayResponse>;
}
