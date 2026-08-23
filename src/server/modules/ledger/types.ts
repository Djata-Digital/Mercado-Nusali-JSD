/**
 * Tipos compartilhados do ledger — em arquivo próprio para evitar import circular
 * entre financialLedgerService.ts e deliveryConfirmedEntries.ts.
 */
export type LedgerSkipReason =
  | 'LEGACY_ORDER'
  | 'MISSING_SNAPSHOT'
  | 'DISCOUNT_NOT_SUPPORTED_YET'
  | 'INVALID_SNAPSHOT'
  | 'ORDER_NOT_FOUND'
  | 'DATABASE_UNAVAILABLE'
  | 'SHADOW_LEDGER_DISABLED';

export interface LedgerResult {
  posted: boolean;
  skipped?: boolean;
  reason?: LedgerSkipReason;
  detail?: string;
  transactionId?: string;
  idempotentReplay?: boolean;
}
