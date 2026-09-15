/**
 * Fase M1-D2 — lógica PURA de roteamento de pagamento do checkout,
 * extraída de CheckoutView.tsx para ser testável sem precisar renderizar um
 * componente React (este projeto não tem infraestrutura de teste de
 * frontend tradicional — nenhum vitest/jest/@testing-library — ver relatório
 * da fase). Estas funções são a ÚNICA fonte de verdade sobre:
 *
 *   - qual endpoint de pagamento chamar (order vs purchase_group);
 *   - qual identidade financeira usar (createdOrder.id vs
 *     purchaseGroup.id);
 *   - qual URL de confirmação navegar.
 *
 * O discriminante `result.mode` (contrato da Fase M1-D1) é a ÚNICA
 * autoridade usada aqui — nunca `orders?.length`/`purchaseGroup?.id`/
 * presença acidental de campos. Em modo 'purchase_group', NENHUMA destas
 * funções aceita ou produz um child order id como identidade de pagamento,
 * navegação ou retry — apenas `purchaseGroup.id`.
 */
import { PaymentsApi } from '../api/clients/PaymentsApi';
import { ApiResponse } from '../api/apiClient';
import { CreateOrderFromCartResult, OrderPaymentInitiationResult, PurchaseGroupPaymentInitiationResult } from '../api/types';

export type CheckoutPaymentTarget =
  | { mode: 'legacy'; orderId: string }
  | { mode: 'purchase_group'; purchaseGroupId: string };

/**
 * Deriva o alvo de pagamento/navegação a partir do resultado de
 * createOrderFromCart. Único ponto do frontend que lê `purchaseGroup.id`
 * como identidade financeira do group — todo o resto do checkout usa este
 * valor derivado, nunca acessa `result.orders[0].id`/`result.id` como
 * substituto em modo group.
 */
export function resolveCheckoutPaymentTarget(result: CreateOrderFromCartResult): CheckoutPaymentTarget {
  if (result.mode === 'purchase_group') {
    return { mode: 'purchase_group', purchaseGroupId: result.purchaseGroup.id };
  }
  return { mode: 'legacy', orderId: result.id };
}

/** URL de confirmação pós-checkout — legacy preserva a rota de sempre; group usa a rota semântica nova (Fase M1-D2). */
export function resolveCheckoutConfirmationUrl(target: CheckoutPaymentTarget): string {
  return target.mode === 'purchase_group'
    ? `/purchase-groups/${target.purchaseGroupId}/confirmation`
    : `/orders/${target.orderId}/confirmation`;
}

/**
 * Roteamento correto de iniciação/retry de PIX (D2.6 — idempotência é
 * responsabilidade EXCLUSIVA do backend; esta função só garante que o
 * endpoint certo é chamado, sempre, inclusive em retries — nunca cai para
 * PaymentsApi.initiate(orderId) quando o alvo é um purchase_group).
 */
export async function initiateCheckoutPixPayment(
  target: CheckoutPaymentTarget,
  data: { method: string; provider?: string }
): Promise<ApiResponse<OrderPaymentInitiationResult | PurchaseGroupPaymentInitiationResult>> {
  if (target.mode === 'purchase_group') {
    return PaymentsApi.initiatePurchaseGroupPayment(target.purchaseGroupId, data);
  }
  return PaymentsApi.initiate({ orderId: target.orderId, ...data });
}
