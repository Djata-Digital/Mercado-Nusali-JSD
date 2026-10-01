import { PaymentProvider, PaymentGatewayRequest, PaymentGatewayResponse, RefundGatewayRequest, RefundGatewayOutcome } from '../paymentProvider.js';

/**
 * FASE D18-C5.1 — preparação da camada de pagamento para o lançamento na
 * Guiné-Bissau (XOF). A Orange Guiné-Bissau fará, futuramente, a integração
 * real com a API do Orange Money — este arquivo é exatamente o ponto onde
 * essa chamada HTTP real será implementada (URL, credenciais, formato de
 * requisição/resposta e assinatura de webhook ainda não existem hoje e NÃO
 * foram inventados aqui). Implementa o mesmo `PaymentProvider` já usado por
 * `AsaasPaymentProvider` (paymentProvider.ts) — nenhuma segunda arquitetura
 * de provider foi criada.
 *
 * `initiatePayment` NUNCA faz uma chamada de rede hoje: apenas confirma que
 * o pedido de pagamento foi recebido e devolve um status PENDING honesto,
 * marcado com `integrationStatus: 'AWAITING_PARTNER_INTEGRATION'` em
 * `rawResponse` — é isso que permite `PaymentService.initiatePayment`
 * registrar com segurança a tentativa de pagamento (payments.status=
 * 'pending') sem jamais fingir uma confirmação real. `checkPaymentStatus` e
 * `refundPayment` falham fechado e explícito (mesmo padrão já usado por
 * `AsaasPaymentProvider` antes de cada uma delas ser implementada de
 * verdade) — nenhuma das duas é chamada por nenhum código hoje.
 *
 * Quando a Orange Guiné-Bissau entregar a documentação real da API, a
 * implementação real entra INTEIRAMENTE dentro desta classe — nenhuma
 * mudança é necessária em checkout, orders, escrow ou nas rotas de
 * pagamento, que já dependem apenas da interface `PaymentProvider`.
 */
export class OrangeMoneyPaymentProvider implements PaymentProvider {
  readonly name = 'orange_money';

  async initiatePayment(req: PaymentGatewayRequest): Promise<PaymentGatewayResponse> {
    const transactionRef = `local_pending_orange_money_${req.orderId}_${Date.now().toString(36)}`;
    return {
      success: true,
      transactionRef,
      status: 'PENDING',
      rawResponse: {
        integrationStatus: 'AWAITING_PARTNER_INTEGRATION',
        note: 'Integração real com a API da Orange Money (Guiné-Bissau) ainda não foi conectada. Nenhuma chamada externa foi feita.',
      },
    };
  }

  async checkPaymentStatus(_transactionRef: string): Promise<PaymentGatewayResponse> {
    const err: any = new Error(
      'ORANGE_MONEY_NOT_CONFIGURED: consulta de status via API da Orange Money ainda não está disponível — a integração real ainda não foi conectada.'
    );
    err.code = 'ORANGE_MONEY_NOT_CONFIGURED';
    err.status = 501;
    throw err;
  }

  async refundPayment(_req: RefundGatewayRequest): Promise<RefundGatewayOutcome> {
    const err: any = new Error(
      'ORANGE_MONEY_NOT_CONFIGURED: reembolso via API da Orange Money ainda não está disponível — a integração real ainda não foi conectada.'
    );
    err.code = 'ORANGE_MONEY_NOT_CONFIGURED';
    err.status = 501;
    throw err;
  }
}
