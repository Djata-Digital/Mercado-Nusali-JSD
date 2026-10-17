/**
 * LEDGER SOMBRA — E2: funções PURAS do outbox (sem I/O): chaves de idempotência determinísticas, snapshot financeiro + hash, política de retry/backoff e
 * classificação de erros. Nada aqui lê ou escreve saldo real; nada recalcula valores (o snapshot é cópia dos campos já gravados no pedido).
 */
import crypto from 'crypto';
import { findPgError } from '../pgErrors.js';
import type { LedgerResult } from '../types.js';

export type OutboxEventType = 'PAYMENT_RECEIVED' | 'ORDER_DELIVERY_CONFIRMED' | 'REFUND_PROCESSED';
export const OUTBOX_EVENT_TYPES: readonly OutboxEventType[] = ['PAYMENT_RECEIVED', 'ORDER_DELIVERY_CONFIRMED', 'REFUND_PROCESSED'];

export type OutboxStatus = 'PENDING' | 'PROCESSING' | 'RETRYING' | 'DONE' | 'SKIPPED' | 'NEEDS_INTERVENTION' | 'DISMISSED';

/** Chaves = as MESMAS do ledger (ledger_transactions.idempotency_key): um evento e um lançamento por pedido e tipo. Determinísticas: nunca derivam de um id recém-criado. */
export const paymentReceivedKey = (orderId: string) => `payment_received:${orderId}`;
export const deliveryConfirmedKey = (orderId: string) => `order_release:${orderId}`;
/** E3 — um evento (e um lançamento) por REEMBOLSO, nunca por pedido: pedido pode ter mais de um reembolso parcial. */
export const refundProcessedKey = (refundId: string) => `refund_processed:${refundId}`;
export const keyFor = (type: OutboxEventType, orderId: string) => (type === 'PAYMENT_RECEIVED' ? paymentReceivedKey(orderId) : deliveryConfirmedKey(orderId));

export const DEFAULT_POLICY = {
  maxAttempts: 8,
  leaseSeconds: 300,
  baseBackoffSeconds: 30,
  backoffFactor: 4,
  maxBackoffSeconds: 6 * 3600,
  batchSize: 50,
  staleMinutes: 15,
} as const;

export interface OutboxPolicy { maxAttempts: number; leaseSeconds: number; baseBackoffSeconds: number; backoffFactor: number; maxBackoffSeconds: number; batchSize: number; staleMinutes: number }

const intEnv = (v: string | undefined, d: number, min: number, max: number) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? Math.floor(n) : d; };

/** Política vigente: padrões seguros, com overrides OPCIONAIS por ambiente (valores inválidos/fora de faixa são ignorados, nunca aceitos). */
export function resolvePolicy(env: Record<string, string | undefined> = process.env): OutboxPolicy {
  return {
    maxAttempts: intEnv(env.LEDGER_OUTBOX_MAX_ATTEMPTS, DEFAULT_POLICY.maxAttempts, 1, 50),
    leaseSeconds: intEnv(env.LEDGER_OUTBOX_LEASE_SECONDS, DEFAULT_POLICY.leaseSeconds, 10, 3600),
    baseBackoffSeconds: intEnv(env.LEDGER_OUTBOX_BASE_BACKOFF_SECONDS, DEFAULT_POLICY.baseBackoffSeconds, 1, 3600),
    backoffFactor: DEFAULT_POLICY.backoffFactor,
    maxBackoffSeconds: intEnv(env.LEDGER_OUTBOX_MAX_BACKOFF_SECONDS, DEFAULT_POLICY.maxBackoffSeconds, 1, 86400),
    batchSize: intEnv(env.LEDGER_OUTBOX_BATCH_SIZE, DEFAULT_POLICY.batchSize, 1, 500),
    staleMinutes: intEnv(env.LEDGER_OUTBOX_STALE_MINUTES, DEFAULT_POLICY.staleMinutes, 1, 1440),
  };
}

/** Outbox ligado? (flag explícita; desligado = comportamento idêntico ao da E1.) */
export const isOutboxEnabled = (env: Record<string, string | undefined> = process.env) => env.LEDGER_OUTBOX_ENABLED === 'true';
/** Modo estrito: falhar ao gravar o outbox ABORTA a confirmação financeira. Padrão (falso): o ledger sombra nunca derruba o dinheiro real. */
export const isOutboxStrict = (env: Record<string, string | undefined> = process.env) => env.LEDGER_OUTBOX_STRICT === 'true';

/**
 * Espera antes da PRÓXIMA tentativa, dado o número de tentativas JÁ feitas (>=1): base × fator^(n−1), limitada, com jitter de ±10%.
 * `rand` injetável para teste determinístico.
 */
export function computeBackoffSeconds(attemptsMade: number, policy: Pick<OutboxPolicy, 'baseBackoffSeconds' | 'backoffFactor' | 'maxBackoffSeconds'> = DEFAULT_POLICY, rand: () => number = Math.random): number {
  const n = Math.max(1, Math.floor(attemptsMade));
  const raw = Math.min(policy.maxBackoffSeconds, policy.baseBackoffSeconds * Math.pow(policy.backoffFactor, n - 1));
  const jitter = 1 + (rand() * 0.2 - 0.1);
  return Math.max(1, Math.round(raw * jitter));
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// Snapshot financeiro
// ---------------------------------------------------------------------------------------------------------------------------------------------------------
export interface OrderRowForSnapshot {
  id: string; buyerId: string; sellerId: string | null; storeId: string | null; countryCode: string | null; currency: string; createdAt: Date | string;
  totalAmount: string | number; subtotal: string | number | null; commissionBase: string | number | null; marketplaceCommission: string | number | null; sellerNetAmount: string | number | null;
  commissionRateSnapshot: string | number | null; discountAmount: string | number | null; shippingChargedToBuyer: string | number | null;
  shippingSellerSubsidy: string | number | null; shippingMarketplaceSubsidy: string | number | null; customsDuty: string | number | null;
}

const asStr = (v: unknown) => (v === null || v === undefined ? null : String(v));
const asIso = (v: Date | string) => (v instanceof Date ? v.toISOString() : new Date(v).toISOString());

/** Campos do pedido que o ledger lê para cada tipo de evento — cópia literal dos snapshots já gravados (nunca recalculados). */
export function buildOrderSnapshot(order: OrderRowForSnapshot, type: OutboxEventType): Record<string, string | null> {
  const base: Record<string, string | null> = {
    orderId: order.id, buyerId: order.buyerId, sellerId: asStr(order.sellerId), countryCode: asStr(order.countryCode), currency: order.currency,
    createdAt: asIso(order.createdAt), totalAmount: asStr(order.totalAmount),
  };
  if (type === 'PAYMENT_RECEIVED') return base;
  return {
    ...base, storeId: asStr(order.storeId), subtotal: asStr(order.subtotal), commissionBase: asStr(order.commissionBase), marketplaceCommission: asStr(order.marketplaceCommission),
    sellerNetAmount: asStr(order.sellerNetAmount), commissionRateSnapshot: asStr(order.commissionRateSnapshot), discountAmount: asStr(order.discountAmount),
    shippingChargedToBuyer: asStr(order.shippingChargedToBuyer), shippingSellerSubsidy: asStr(order.shippingSellerSubsidy),
    shippingMarketplaceSubsidy: asStr(order.shippingMarketplaceSubsidy), customsDuty: asStr(order.customsDuty),
  };
}

export interface RefundRowForSnapshot { id: string; orderId: string | null; paymentId: string; amount: string | number; currency: string; sellerDebitAmount: string | number | null; status: string }
export type RefundReleaseStage = 'BEFORE_RELEASE' | 'AFTER_RELEASE';

/**
 * Snapshot de um evento REFUND_PROCESSED: os campos financeiros do pedido (os mesmos da entrega) + o reembolso concluído + o estágio (antes/depois da liberação),
 * que é um FATO do momento do reembolso e por isso vem do próprio evento (o Escrow muda depois). Cópia literal dos valores gravados; nada recalculado.
 */
export function buildRefundSnapshot(order: OrderRowForSnapshot, refund: RefundRowForSnapshot, stage: RefundReleaseStage): Record<string, string | null> {
  return {
    ...buildOrderSnapshot(order, 'ORDER_DELIVERY_CONFIRMED'),
    refundId: refund.id, refundPaymentId: refund.paymentId, refundAmount: asStr(refund.amount), refundCurrency: refund.currency,
    refundSellerDebitAmount: asStr(refund.sellerDebitAmount), releaseStage: stage,
  };
}

/** JSON canônico (chaves ordenadas) → sha256 hex (64). */
export function hashSnapshot(snapshot: Record<string, unknown>): string {
  const canonical = JSON.stringify(Object.keys(snapshot).sort().map((k) => [k, snapshot[k]]));
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/** Campos que diferem entre dois snapshots (para o diagnóstico de divergência; nunca inclui dados pessoais). */
export function diffSnapshots(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  return Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).filter((k) => a[k] !== b[k]).sort();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// Classificação de falhas
// ---------------------------------------------------------------------------------------------------------------------------------------------------------
export type ErrorClass = { kind: 'TRANSIENT' | 'PERMANENT'; code: string };

const TRANSIENT_NODE_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN', 'ENETUNREACH', 'ECONNABORTED']);
const TRANSIENT_PG_CLASSES = ['08', '53', '57', '58']; // conexão, recursos insuficientes, intervenção do operador/desligamento, erro de sistema
const TRANSIENT_PG_CODES = new Set(['40001', '40P01', '55P03', '55006', '25006']);
const PERMANENT_MESSAGE = /LEDGER_UNBALANCED|LEDGER_INVALID_TRANSACTION|LEDGER_CURRENCY_MISMATCH|LEDGER_MULTI_CURRENCY|InvalidDecimalError/;

/**
 * Transitório = vale tentar de novo (rede, desligamento, deadlock, timeout). Permanente = repetir não adianta (dados inválidos, violação de regra do ledger,
 * esquema ausente). Desconhecido => transitório MAS limitado por maxAttempts: nunca descartado em silêncio, termina em NEEDS_INTERVENTION.
 */
export function classifyProcessingError(err: unknown): ErrorClass {
  const pg = findPgError(err);
  if (pg) {
    if (TRANSIENT_PG_CODES.has(pg.code) || TRANSIENT_PG_CLASSES.includes(pg.code.slice(0, 2))) return { kind: 'TRANSIENT', code: `PG_${pg.code}` };
    return { kind: 'PERMANENT', code: `PG_${pg.code}` };
  }
  const anyErr = err as any;
  const nodeCode = anyErr?.code ?? anyErr?.cause?.code;
  if (typeof nodeCode === 'string' && TRANSIENT_NODE_CODES.has(nodeCode)) return { kind: 'TRANSIENT', code: nodeCode };
  const msg = String(anyErr?.message ?? err ?? '');
  if (PERMANENT_MESSAGE.test(msg)) return { kind: 'PERMANENT', code: (msg.match(PERMANENT_MESSAGE)?.[0] || 'LEDGER_RULE').slice(0, 60) };
  if (/timeout|timed out|Connection terminated|terminating connection|connection (is )?closed|too many clients/i.test(msg)) return { kind: 'TRANSIENT', code: 'CONNECTION_OR_TIMEOUT' };
  return { kind: 'TRANSIENT', code: 'UNKNOWN_ERROR' };
}

export type LedgerOutcome =
  | { action: 'DONE'; transactionId: string; replay: boolean }
  | { action: 'SKIPPED'; code: string; detail?: string }
  | { action: 'DEFER'; code: string }
  | { action: 'PERMANENT'; code: string; detail?: string }
  | { action: 'RETRY'; code: string; detail?: string };

/** Traduz o resultado (sem exceção) do FinancialLedgerService para a ação do outbox. */
export function mapLedgerResult(r: LedgerResult): LedgerOutcome {
  if (r.posted && r.transactionId) return { action: 'DONE', transactionId: r.transactionId, replay: !!r.idempotentReplay };
  if (r.skipped) {
    switch (r.reason) {
      case 'LEGACY_ORDER': return { action: 'SKIPPED', code: 'LEGACY_ORDER', detail: r.detail };
      case 'SHADOW_LEDGER_DISABLED': return { action: 'DEFER', code: 'SHADOW_LEDGER_DISABLED' };
      case 'DATABASE_UNAVAILABLE': return { action: 'RETRY', code: 'DATABASE_UNAVAILABLE' };
      case 'ORDER_NOT_FOUND': case 'INVALID_SNAPSHOT': case 'MISSING_SNAPSHOT': return { action: 'PERMANENT', code: r.reason, detail: r.detail };
      default: return { action: 'PERMANENT', code: String(r.reason ?? 'SKIPPED_UNKNOWN'), detail: r.detail };
    }
  }
  return { action: 'PERMANENT', code: 'LEDGER_TX_NOT_POSTED', detail: r.transactionId ? `transação ${r.transactionId} existe mas não está POSTED` : undefined };
}
