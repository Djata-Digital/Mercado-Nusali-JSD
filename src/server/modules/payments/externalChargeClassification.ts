/**
 * FASE D18-C7.3B — classificação PURA (sem I/O, sem importar nenhum provider)
 * dos pagamentos de um purchase_group no momento de decidir uma expiração.
 * Fica separada do despachante (externalChargeCancellationService.ts) para o
 * OrderService poder decidir sem nunca depender de Asaas.
 *
 * Regra fail-closed: um pagamento ainda "potencialmente pagável" só permite
 * a expiração se (a) é puramente local (nenhuma cobrança externa existe) ou
 * (b) a cobrança externa foi tornada não pagável e CONFIRMADA. Um pagamento
 * cuja cobrança externa PODE existir sem sabermos o id (criação em voo ou
 * timeout ambíguo) é "unresolved" e bloqueia a expiração.
 */

/** Providers cuja cobrança externa sabemos cancelar (PaymentProvider.cancelPendingCharge). */
export const EXTERNALLY_CANCELLABLE_PROVIDERS: ReadonlySet<string> = new Set(['asaas']);

/** Status LOCAIS em que a cobrança externa correspondente ainda pode vir a ser paga. */
export const POTENTIALLY_PAYABLE_LOCAL_STATUSES: ReadonlySet<string> = new Set(['pending', 'authorized', 'expired']);

export interface GroupPaymentRow {
  id: string;
  provider: string;
  status: string;
  transactionRef: string | null;
}

export interface ExternalChargeRef {
  paymentId: string;
  provider: string;
  providerPaymentId: string;
}

export function classifyGroupPaymentsForExpiration(rows: GroupPaymentRow[]): {
  /** ids de pagamentos cuja cobrança externa não pode ser verificada/cancelada — bloqueiam a expiração. */
  unresolved: string[];
  /** cobranças externas conhecidas que PRECISAM ser canceladas (e confirmadas) antes de expirar. */
  externalToCancel: ExternalChargeRef[];
} {
  const unresolved: string[] = [];
  const externalToCancel: ExternalChargeRef[] = [];
  for (const p of rows) {
    if (!POTENTIALLY_PAYABLE_LOCAL_STATUSES.has(p.status)) continue;
    const ref = p.transactionRef && String(p.transactionRef).trim() ? String(p.transactionRef) : null;
    if (EXTERNALLY_CANCELLABLE_PROVIDERS.has(p.provider)) {
      if (!ref) unresolved.push(p.id); // criação em voo ou timeout ambíguo: pode existir cobrança sem id conhecido
      else externalToCancel.push({ paymentId: p.id, provider: p.provider, providerPaymentId: ref });
    } else if (ref) {
      unresolved.push(p.id); // provider sem capacidade de cancelamento, mas com referência externa
    }
    // provider não cancelável SEM referência externa: pagamento puramente local — nada a cancelar.
  }
  return { unresolved, externalToCancel };
}
