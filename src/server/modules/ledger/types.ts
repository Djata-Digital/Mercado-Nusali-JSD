/**
 * Tipos compartilhados do ledger — em arquivo próprio para evitar import circular
 * entre financialLedgerService.ts e deliveryConfirmedEntries.ts.
 */
export type LedgerSkipReason =
  | 'LEGACY_ORDER'
  | 'MISSING_SNAPSHOT'
  | 'INVALID_SNAPSHOT'
  | 'ORDER_NOT_FOUND'
  | 'DATABASE_UNAVAILABLE'
  | 'SHADOW_LEDGER_DISABLED'
  | 'REFUND_NOT_FOUND'
  | 'REFUND_NOT_PROCESSED'
  | 'REFUND_NOT_ORDER_LEVEL'
  | 'SHIPPING_REVERSAL_NOT_FOUND'
  | 'SHIPPING_REVERSAL_NOT_ELIGIBLE'
  | 'CHARGEBACK_NOT_FOUND'
  | 'CHARGEBACK_REFUND_OVERLAP'
  | 'CHARGEBACK_NOT_ELIGIBLE';

export interface LedgerResult {
  posted: boolean;
  skipped?: boolean;
  reason?: LedgerSkipReason;
  detail?: string;
  transactionId?: string;
  idempotentReplay?: boolean;
}
