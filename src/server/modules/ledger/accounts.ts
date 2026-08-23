/**
 * Catálogo de contas do ledger (Fase 4B, seção C) — só o necessário para as
 * transações implementadas na Fase 5A (PAYMENT_RECEIVED, ORDER_DELIVERY_CONFIRMED).
 * PAYMENT_PROCESSOR_FEES, REFUND_PAYABLE, CHARGEBACK_RECEIVABLE, SELLER_AVAILABLE
 * e SELLER_PAYOUT_CLEARING já estão catalogadas para as fases seguintes, mas nada
 * nesta fase lança nelas.
 */

export type LedgerAccountCode =
  | 'PAYMENT_CLEARING'
  | 'BUYER_ESCROW'
  | 'SELLER_PAYABLE'
  | 'SELLER_AVAILABLE'
  | 'SELLER_PAYOUT_CLEARING'
  | 'NUSALI_COMMISSION_REVENUE'
  | 'SHIPPING_PAYABLE'
  | 'SHIPPING_SUBSIDY_NUSALI'
  | 'TAX_PAYABLE'
  | 'REFUND_PAYABLE'
  | 'CHARGEBACK_RECEIVABLE'
  | 'PAYMENT_PROCESSOR_FEES'
  | 'NUSALI_PROMOTION_EXPENSE';

export type LedgerOwnerType = 'PLATFORM' | 'SELLER' | 'BUYER';

export const ACCOUNT_DEFINITIONS: Record<LedgerAccountCode, { normalBalance: 'DEBIT' | 'CREDIT'; isClearing: boolean }> = {
  PAYMENT_CLEARING: { normalBalance: 'DEBIT', isClearing: true },
  BUYER_ESCROW: { normalBalance: 'CREDIT', isClearing: false },
  SELLER_PAYABLE: { normalBalance: 'CREDIT', isClearing: false },
  SELLER_AVAILABLE: { normalBalance: 'CREDIT', isClearing: false },
  SELLER_PAYOUT_CLEARING: { normalBalance: 'CREDIT', isClearing: true },
  NUSALI_COMMISSION_REVENUE: { normalBalance: 'CREDIT', isClearing: false },
  SHIPPING_PAYABLE: { normalBalance: 'CREDIT', isClearing: false },
  SHIPPING_SUBSIDY_NUSALI: { normalBalance: 'DEBIT', isClearing: false },
  TAX_PAYABLE: { normalBalance: 'CREDIT', isClearing: false },
  REFUND_PAYABLE: { normalBalance: 'CREDIT', isClearing: false },
  CHARGEBACK_RECEIVABLE: { normalBalance: 'DEBIT', isClearing: false },
  PAYMENT_PROCESSOR_FEES: { normalBalance: 'DEBIT', isClearing: false },
  NUSALI_PROMOTION_EXPENSE: { normalBalance: 'DEBIT', isClearing: false },
};

/**
 * Contas de plataforma (PAYMENT_CLEARING, BUYER_ESCROW, comissão, frete, taxas,
 * despesas) não têm "dono" no sentido de propriedade econômica final — quem vai
 * ficar com o dinheiro é decidido por outra conta (ex.: SELLER_PAYABLE). Por isso
 * são um pool único por moeda (ownerId nulo), não uma conta por pedido/comprador —
 * a atribuição a um pedido específico já vive nas colunas orderId/buyerId/sellerId
 * da própria ledger_entries, não precisa duplicar isso na conta.
 */
export const PLATFORM_POOLED_ACCOUNTS = new Set<LedgerAccountCode>([
  'PAYMENT_CLEARING',
  'BUYER_ESCROW',
  'NUSALI_COMMISSION_REVENUE',
  'SHIPPING_PAYABLE',
  'SHIPPING_SUBSIDY_NUSALI',
  'TAX_PAYABLE',
  'REFUND_PAYABLE',
  'PAYMENT_PROCESSOR_FEES',
  'NUSALI_PROMOTION_EXPENSE',
  'CHARGEBACK_RECEIVABLE',
]);

export function ledgerAccountId(code: LedgerAccountCode, ownerType: LedgerOwnerType, ownerId: string | null, currency: string): string {
  const curr = currency.toUpperCase();
  if (ownerType === 'PLATFORM' || !ownerId) {
    return `${code}:PLATFORM:${curr}`;
  }
  return `${code}:${ownerType}:${ownerId}:${curr}`;
}
