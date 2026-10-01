import { PaymentProvider, PaymentGatewayRequest, PaymentGatewayResponse, RefundGatewayRequest, RefundGatewayOutcome } from '../paymentProvider.js';

/**
 * FASE D18-C5.1 — preparação da camada de pagamento para o lançamento na
 * Guiné-Bissau (XOF). A Telecel fará, futuramente, a integração real com a
 * API do TeleTaku — este arquivo é exatamente o ponto onde essa chamada HTTP
 * real será implementada (URL, credenciais, formato de requisição/resposta e
 * assinatura de webhook ainda não existem hoje e NÃO foram inventados aqui).
 * Implementa o mesmo `PaymentProvider` já usado por `AsaasPaymentProvider`
 * (paymentProvider.ts) — nenhuma segunda arquitetura de provider foi criada.
 *
 * Ver `orangeMoneyPaymentProvider.ts` para a justificativa completa do
 * desenho (idêntico para os dois meios de pagamento prioritários do
 * lançamento): `initiatePayment` nunca faz uma chamada de rede hoje, apenas
 * devolve um status PENDING honesto (`integrationStatus:
 * 'AWAITING_PARTNER_INTEGRATION'`); `checkPaymentStatus`/`refundPayment`
 * falham fechado e explícito, e não são chamadas por nenhum código hoje.
 */
export class TeleTakuPaymentProvider implements PaymentProvider {
  readonly name = 'teletaku';

  async initiatePayment(req: PaymentGatewayRequest): Promise<PaymentGatewayResponse> {
    const transactionRef = `local_pending_teletaku_${req.orderId}_${Date.now().toString(36)}`;
    return {
      success: true,
      transactionRef,
      status: 'PENDING',
      rawResponse: {
        integrationStatus: 'AWAITING_PARTNER_INTEGRATION',
        note: 'Integração real com a API do TeleTaku (Telecel) ainda não foi conectada. Nenhuma chamada externa foi feita.',
      },
    };
  }

  async checkPaymentStatus(_transactionRef: string): Promise<PaymentGatewayResponse> {
    const err: any = new Error(
      'TELETAKU_NOT_CONFIGURED: consulta de status via API do TeleTaku ainda não está disponível — a integração real ainda não foi conectada.'
    );
    err.code = 'TELETAKU_NOT_CONFIGURED';
    err.status = 501;
    throw err;
  }

  async refundPayment(_req: RefundGatewayRequest): Promise<RefundGatewayOutcome> {
    const err: any = new Error(
      'TELETAKU_NOT_CONFIGURED: reembolso via API do TeleTaku ainda não está disponível — a integração real ainda não foi conectada.'
    );
    err.code = 'TELETAKU_NOT_CONFIGURED';
    err.status = 501;
    throw err;
  }
}
