/**
 * FASE D18-C7.3B — despachante de cancelamento de cobrança externa. É a única
 * ponte entre o job de expiração e os providers: o OrderService nunca fala
 * com Asaas. NUNCA deve ser chamado dentro de uma transação/advisory lock do
 * Postgres (faz I/O de rede) — o chamador (pendingPaymentExpirationService)
 * garante isso.
 */
import { AsaasPaymentProvider } from './providers/asaasPaymentProvider.js';
import type { ExternalChargeCancelOutcome } from './paymentProvider.js';
import type { ExternalChargeRef } from './externalChargeClassification.js';
import { logger } from '../../infra/logger.js';

export async function cancelExternalCharge(ref: ExternalChargeRef): Promise<ExternalChargeCancelOutcome> {
  try {
    if (ref.provider === 'asaas') {
      return await new AsaasPaymentProvider().cancelPendingCharge(ref.providerPaymentId);
    }
    return { outcome: 'UNCONFIRMED', reason: 'UNSUPPORTED_PROVIDER', code: ref.provider };
  } catch (err: any) {
    // Nunca loga a mensagem crua (pode conter detalhes internos do provider).
    logger.warn({ paymentId: ref.paymentId, provider: ref.provider, code: err?.code || 'UNEXPECTED_ERROR' }, 'EXTERNAL_CHARGE_CANCELLATION_UNEXPECTED_ERROR');
    return { outcome: 'UNCONFIRMED', reason: 'UNEXPECTED_ERROR', code: err?.code || 'UNEXPECTED_ERROR' };
  }
}
