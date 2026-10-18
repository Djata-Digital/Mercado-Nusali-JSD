/**
 * LEDGER SOMBRA — E6: API ADMINISTRATIVA (montada em /api/v1/admin/ledger, DEPOIS de requireAuth + requireInternalStaff do adminRouter).
 *
 * SOMENTE LEITURA sobre os lançamentos: não existe nenhuma rota que crie, edite ou apague ledger_transactions/ledger_entries (o banco também recusa). As ações são
 * exclusivamente chamadas aos SERVIÇOS JÁ EXISTENTES (E2 reparo/recolocação/descarte/reconhecimento, E4 reversão de frete, E5 evidência/proposta/aprovação/recuperação) — nenhuma
 * lógica financeira nova, nenhuma movimentação de dinheiro real, nenhuma cobrança de carteira. As regras de negócio (quatro olhos, teto N do vendedor, evidências, idempotência,
 * auditoria) continuam NOS SERVIÇOS; aqui só há autorização por perfil, validação de entrada e tradução de erros. Cada serviço revalida o papel no banco (defesa em profundidade).
 *
 * Perfis:  leitura / evidência / proposta / SOLICITAR retenção de saldo (E7) → GLOBAL_ADMIN, FINANCE, RISK_ANALYST
 *          aprovar, rejeitar, reparar, recolocar, descartar, reconhecer, recuperação/baixa, reversão de frete, LIBERAR retenção (E7, e nunca o criador) → SOMENTE GLOBAL_ADMIN
 * O papel vem do JWT verificado (requireAuth); nunca de corpo/query.
 */
import { Router, Response, NextFunction } from 'express';
import { sql } from 'drizzle-orm';
import { getDb } from '../../../../db/index.js';
import { AuthRequest } from '../../auth/authMiddleware.js';
import { logger } from '../../../infra/logger.js';
import { createRateLimiter } from '../../../infra/rateLimiter.js';
import { getOutboxMetrics, requeueOutboxEvent, dismissOutboxEvent, OutboxAdminError } from '../outbox/outboxService.js';
import { getReconciliationMetrics, acknowledgeFinding, repairMissingEvents } from '../outbox/reconciliationService.js';
import {
  addChargebackEvidence, proposeChargebackDecision, approveChargebackDecision, rejectChargebackDecision, recordChargebackRecovery, ChargebackLedgerError,
} from '../chargebackLedgerService.js';
import { recordShippingCostReversal, ShippingReversalError } from '../shippingReversalService.js';
import { placeChargebackWalletHold, releaseWalletHold, listWalletHoldsForAdmin, assessWalletHold, getWalletBalances, WalletHoldError } from '../../wallet/walletHoldService.js';

export const LEDGER_READ_ROLES = new Set(['GLOBAL_ADMIN', 'FINANCE', 'RISK_ANALYST']);
export const LEDGER_ADMIN_ROLES = new Set(['GLOBAL_ADMIN']);

const deny = (res: Response, status: number, code: string, message: string) => res.status(status).json({ success: false, error: { code, message } });
const roleOf = (req: AuthRequest) => (req.user?.role || '').toUpperCase();

export function requireLedgerReader(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) return deny(res, 401, 'UNAUTHORIZED', 'Acesso não autorizado.');
  if (!LEDGER_READ_ROLES.has(roleOf(req))) return deny(res, 403, 'LEDGER_ACCESS_DENIED', 'A gestão do ledger é restrita à Administração Global, ao Financeiro e à Análise de Risco.');
  return next();
}
export function requireLedgerAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) return deny(res, 401, 'UNAUTHORIZED', 'Acesso não autorizado.');
  if (!LEDGER_ADMIN_ROLES.has(roleOf(req))) return deny(res, 403, 'LEDGER_ADMIN_REQUIRED', 'Esta operação do ledger é restrita à Administração Global.');
  return next();
}

// limite por usuário nas operações que gravam (proteção contra repetição/abuso); a idempotência real está nos serviços
const writeLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 60, keyPrefix: 'rl:ledger:admin:write:', keyGenerator: (req: any) => `u:${req.user?.id ?? req.ip}` });

const rowsOf = (res: any): any[] => (Array.isArray(res) ? res : res?.rows ?? []);
const intParam = (v: unknown, def: number, min: number, max: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : def; };
const strParam = (v: unknown, max = 200): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const dateParam = (v: unknown): string | null => { const s = strParam(v, 40); if (!s) return null; const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };
const bodyStr = (v: unknown) => (typeof v === 'string' ? v : '');

/** Traduz os erros dos serviços existentes para HTTP, sem expor detalhes internos. */
function statusFor(code: string): number {
  if (['FORBIDDEN', 'LEDGER_ADMIN_REQUIRED', 'CONFLICT_OF_INTEREST', 'FOUR_EYES'].includes(code)) return 403;
  if (/NOT_FOUND$/.test(code) && code !== 'SELLER_NOT_RESOLVED') return 404;
  if (['INVALID_STATE', 'IDEMPOTENCY_CONFLICT', 'PROPOSAL_ALREADY_OPEN', 'EXCEEDS_RECEIVABLE', 'EXCEEDS_SHIPPING_COST', 'SELLER_CAP_EXCEEDED', 'REVISION_AFTER_SETTLEMENT_NOT_SUPPORTED',
    'CHARGEBACK_REFUND_OVERLAP', 'CHARGEBACK_NOT_LOST', 'ORDER_NOT_REFUNDED', 'REFUNDED_BEFORE_RELEASE', 'REFUND_NOT_UNIQUE', 'PARTIAL_REFUND_NOT_SUPPORTED', 'NO_APPROVED_DECISION',
    'NO_THIRD_PARTY_RECEIVABLE', 'NOTHING_TO_DECIDE', 'NO_ALLOCATIONS'].includes(code)) return 409;
  return 400;
}
function handleError(res: Response, err: any, context: string) {
  if (err instanceof WalletHoldError) return deny(res, err.status, err.code, err.message);
  if (err instanceof OutboxAdminError || err instanceof ChargebackLedgerError || err instanceof ShippingReversalError) {
    return deny(res, statusFor(err.code), err.code, err.message);
  }
  logger.error({ context, error: err?.message }, '[LedgerAdmin] erro inesperado');
  return deny(res, 500, 'LEDGER_ADMIN_INTERNAL_ERROR', 'Não foi possível concluir a operação. Tente novamente.');
}

export const ledgerAdminRouter = Router();

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// LEITURA
// ---------------------------------------------------------------------------------------------------------------------------------------------------------
ledgerAdminRouter.get('/summary', requireLedgerReader, async (_req: AuthRequest, res: Response) => {
  try {
    const db: any = getDb(); if (!db) return deny(res, 503, 'DATABASE_UNAVAILABLE', 'Banco indisponível.');
    const byType = rowsOf(await db.execute(sql`SELECT type, status, count(*)::int AS n FROM ledger_transactions GROUP BY 1, 2 ORDER BY 1, 2`));
    const totals = rowsOf(await db.execute(sql`SELECT (SELECT count(*)::int FROM ledger_transactions) AS transactions, (SELECT count(*)::int FROM ledger_entries) AS entries, (SELECT count(*)::int FROM ledger_accounts) AS accounts`))[0];
    const imbalance = rowsOf(await db.execute(sql`SELECT coalesce(sum(CASE WHEN direction = 'DEBIT' THEN amount ELSE -amount END), 0)::text AS net FROM ledger_entries`))[0]?.net ?? '0';
    const outbox = await getOutboxMetrics();
    const reconciliation = await getReconciliationMetrics();
    const chargebacks = rowsOf(await db.execute(sql`SELECT
      (SELECT count(*)::int FROM chargeback_allocations WHERE overlap_refund = false AND release_stage = 'AFTER_RELEASE') AS allocations_after_release,
      (SELECT count(*)::int FROM chargeback_allocations a WHERE a.overlap_refund = false AND a.release_stage = 'AFTER_RELEASE' AND NOT EXISTS (SELECT 1 FROM chargeback_decision_lines l JOIN chargeback_decisions d ON d.id = l.decision_id WHERE l.allocation_id = a.id AND d.status = 'APPROVED')) AS pending_decision,
      (SELECT count(*)::int FROM chargeback_allocations WHERE overlap_refund = true) AS overlap_refund,
      (SELECT count(*)::int FROM chargeback_decisions WHERE status = 'PROPOSED') AS proposals_open`))[0];
    const reversals = rowsOf(await db.execute(sql`SELECT count(*)::int AS n FROM shipping_cost_reversals`))[0]?.n ?? 0;
    return res.json({ success: true, data: { totals, imbalanceNet: imbalance, transactionsByTypeAndStatus: byType, outbox, reconciliation, chargebacks, shippingCostReversals: reversals } });
  } catch (err) { return handleError(res, err, 'summary'); }
});

ledgerAdminRouter.get('/transactions', requireLedgerReader, async (req: AuthRequest, res: Response) => {
  try {
    const db: any = getDb(); if (!db) return deny(res, 503, 'DATABASE_UNAVAILABLE', 'Banco indisponível.');
    const limit = intParam(req.query.limit, 25, 1, 100); const offset = intParam(req.query.offset, 0, 0, 1_000_000);
    const orderId = strParam(req.query.orderId); const type = strParam(req.query.type, 50); const status = strParam(req.query.status, 20); const id = strParam(req.query.id);
    const from = dateParam(req.query.from); const to = dateParam(req.query.to);
    const where = sql`WHERE true
      ${orderId ? sql`AND t.order_id = ${orderId}` : sql``} ${type ? sql`AND t.type = ${type}` : sql``} ${status ? sql`AND t.status = ${status}` : sql``}
      ${id ? sql`AND (t.id = ${id} OR t.idempotency_key = ${id} OR t.refund_id = ${id})` : sql``}
      ${from ? sql`AND t.occurred_at >= ${from}::timestamp` : sql``} ${to ? sql`AND t.occurred_at <= ${to}::timestamp` : sql``}`;
    const total = rowsOf(await db.execute(sql`SELECT count(*)::int AS n FROM ledger_transactions t ${where}`))[0]?.n ?? 0;
    const items = rowsOf(await db.execute(sql`
      SELECT t.id, t.type, t.status, t.currency, t.order_id, t.payment_id, t.refund_id, t.seller_id, t.idempotency_key, t.reason, t.source, t.correlation_id, t.occurred_at, t.created_at,
             (SELECT count(*)::int FROM ledger_entries e WHERE e.transaction_id = t.id) AS entry_count
        FROM ledger_transactions t ${where} ORDER BY t.occurred_at DESC, t.id DESC LIMIT ${limit} OFFSET ${offset}`));
    return res.json({ success: true, data: { items, total, limit, offset } });
  } catch (err) { return handleError(res, err, 'transactions'); }
});

ledgerAdminRouter.get('/transactions/:id', requireLedgerReader, async (req: AuthRequest, res: Response) => {
  try {
    const db: any = getDb(); if (!db) return deny(res, 503, 'DATABASE_UNAVAILABLE', 'Banco indisponível.');
    const tx = rowsOf(await db.execute(sql`SELECT id, type, status, currency, order_id, payment_id, escrow_id, payout_id, refund_id, dispute_id, seller_id, store_id, buyer_id, country_code, idempotency_key, performed_by, source, reason, correlation_id, metadata_json, occurred_at, created_at FROM ledger_transactions WHERE id = ${req.params.id}`))[0];
    if (!tx) return deny(res, 404, 'LEDGER_TRANSACTION_NOT_FOUND', 'Lançamento não encontrado.');
    const entries = rowsOf(await db.execute(sql`
      SELECT e.id, e.line_number, a.code AS account_code, a.owner_type, a.owner_id, e.direction, e.amount::text AS amount, e.currency, e.dimensions, e.order_id, e.seller_id, e.reference_type, e.reference_id
        FROM ledger_entries e JOIN ledger_accounts a ON a.id = e.account_id WHERE e.transaction_id = ${tx.id} ORDER BY e.line_number`));
    const sums = entries.reduce((acc: { d: bigint; c: bigint }, e: any) => { const v = BigInt(Math.round(Number(e.amount) * 1_000_000)); return e.direction === 'DEBIT' ? { ...acc, d: acc.d + v } : { ...acc, c: acc.c + v }; }, { d: 0n, c: 0n });
    return res.json({ success: true, data: { transaction: tx, entries, totals: { debit: (Number(sums.d) / 1e6).toFixed(2), credit: (Number(sums.c) / 1e6).toFixed(2), balanced: sums.d === sums.c } } });
  } catch (err) { return handleError(res, err, 'transaction'); }
});

ledgerAdminRouter.get('/outbox', requireLedgerReader, async (req: AuthRequest, res: Response) => {
  try {
    const db: any = getDb(); if (!db) return deny(res, 503, 'DATABASE_UNAVAILABLE', 'Banco indisponível.');
    const limit = intParam(req.query.limit, 25, 1, 100); const offset = intParam(req.query.offset, 0, 0, 1_000_000);
    const status = strParam(req.query.status, 30); const type = strParam(req.query.type, 40); const orderId = strParam(req.query.orderId); const id = strParam(req.query.id);
    const where = sql`WHERE true ${status ? sql`AND status = ${status}` : sql``} ${type ? sql`AND event_type = ${type}` : sql``} ${orderId ? sql`AND order_id = ${orderId}` : sql``} ${id ? sql`AND (id = ${id} OR idempotency_key = ${id})` : sql``}`;
    const total = rowsOf(await db.execute(sql`SELECT count(*)::int AS n FROM ledger_outbox_events ${where}`))[0]?.n ?? 0;
    const items = rowsOf(await db.execute(sql`
      SELECT id, event_type, idempotency_key, order_id, status, attempts, max_attempts, next_attempt_at, last_attempt_at, last_error_code, left(coalesce(last_error, ''), 300) AS last_error, ledger_transaction_id, source, occurred_at, created_at, processed_at
        FROM ledger_outbox_events ${where} ORDER BY created_at DESC, id DESC LIMIT ${limit} OFFSET ${offset}`));
    return res.json({ success: true, data: { items, total, limit, offset } });
  } catch (err) { return handleError(res, err, 'outbox'); }
});

ledgerAdminRouter.get('/outbox/:id', requireLedgerReader, async (req: AuthRequest, res: Response) => {
  try {
    const db: any = getDb(); if (!db) return deny(res, 503, 'DATABASE_UNAVAILABLE', 'Banco indisponível.');
    const ev = rowsOf(await db.execute(sql`SELECT id, event_type, idempotency_key, order_id, payment_id, purchase_group_id, status, attempts, max_attempts, next_attempt_at, last_attempt_at, last_error_code, last_error, ledger_transaction_id, source, snapshot_json, snapshot_hash, cutoff_at, occurred_at, created_at, processed_at, resolved_by, resolution_note FROM ledger_outbox_events WHERE id = ${req.params.id}`))[0];
    if (!ev) return deny(res, 404, 'OUTBOX_EVENT_NOT_FOUND', 'Evento não encontrado.');
    const audit = rowsOf(await db.execute(sql`SELECT action, actor_user_id, details_json, created_at FROM audit_logs WHERE resource = 'ledger_outbox_event' AND resource_id = ${ev.id} ORDER BY created_at DESC LIMIT 20`));
    return res.json({ success: true, data: { event: ev, audit } });
  } catch (err) { return handleError(res, err, 'outbox-detail'); }
});

ledgerAdminRouter.get('/findings', requireLedgerReader, async (req: AuthRequest, res: Response) => {
  try {
    const db: any = getDb(); if (!db) return deny(res, 503, 'DATABASE_UNAVAILABLE', 'Banco indisponível.');
    const limit = intParam(req.query.limit, 25, 1, 100); const offset = intParam(req.query.offset, 0, 0, 1_000_000);
    const status = strParam(req.query.status, 20); const severity = strParam(req.query.severity, 20); const type = strParam(req.query.type, 80); const orderId = strParam(req.query.orderId);
    const where = sql`WHERE true ${status ? sql`AND status = ${status}` : sql``} ${severity ? sql`AND severity = ${severity}` : sql``} ${type ? sql`AND finding_type = ${type}` : sql``} ${orderId ? sql`AND order_id = ${orderId}` : sql``}`;
    const total = rowsOf(await db.execute(sql`SELECT count(*)::int AS n FROM ledger_reconciliation_findings ${where}`))[0]?.n ?? 0;
    const items = rowsOf(await db.execute(sql`
      SELECT id, finding_type, severity, status, order_id, event_id, ledger_transaction_id, left(detail, 300) AS detail, seen_count, first_seen_at, last_seen_at, resolved_at
        FROM ledger_reconciliation_findings ${where}
       ORDER BY CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'WARNING' THEN 1 ELSE 2 END, last_seen_at DESC, id DESC LIMIT ${limit} OFFSET ${offset}`));
    return res.json({ success: true, data: { items, total, limit, offset } });
  } catch (err) { return handleError(res, err, 'findings'); }
});

ledgerAdminRouter.get('/findings/:id', requireLedgerReader, async (req: AuthRequest, res: Response) => {
  try {
    const db: any = getDb(); if (!db) return deny(res, 503, 'DATABASE_UNAVAILABLE', 'Banco indisponível.');
    const f = rowsOf(await db.execute(sql`SELECT * FROM ledger_reconciliation_findings WHERE id = ${req.params.id}`))[0];
    if (!f) return deny(res, 404, 'FINDING_NOT_FOUND', 'Divergência não encontrada.');
    const event = f.event_id ? rowsOf(await db.execute(sql`SELECT id, event_type, status, attempts, max_attempts, last_error_code, left(coalesce(last_error, ''), 500) AS last_error, ledger_transaction_id, next_attempt_at FROM ledger_outbox_events WHERE id = ${f.event_id}`))[0] ?? null : null;
    const order = f.order_id ? rowsOf(await db.execute(sql`SELECT id, status, payment_status, escrow_status, total_amount::text AS total_amount, currency, created_at FROM orders WHERE id = ${f.order_id}`))[0] ?? null : null;
    const transactions = f.order_id ? rowsOf(await db.execute(sql`SELECT id, type, status, idempotency_key, occurred_at FROM ledger_transactions WHERE order_id = ${f.order_id} ORDER BY occurred_at, id`)) : [];
    const events = f.order_id ? rowsOf(await db.execute(sql`SELECT id, event_type, status, attempts, last_error_code FROM ledger_outbox_events WHERE order_id = ${f.order_id} ORDER BY created_at, id`)) : [];
    const audit = rowsOf(await db.execute(sql`SELECT action, actor_user_id, details_json, created_at FROM audit_logs WHERE resource = 'ledger_reconciliation_finding' AND resource_id = ${f.id} ORDER BY created_at DESC LIMIT 20`));
    return res.json({ success: true, data: { finding: f, event, order, transactions, events, audit } });
  } catch (err) { return handleError(res, err, 'finding-detail'); }
});

ledgerAdminRouter.get('/chargebacks', requireLedgerReader, async (req: AuthRequest, res: Response) => {
  try {
    const db: any = getDb(); if (!db) return deny(res, 503, 'DATABASE_UNAVAILABLE', 'Banco indisponível.');
    const limit = intParam(req.query.limit, 25, 1, 100); const offset = intParam(req.query.offset, 0, 0, 1_000_000);
    const status = strParam(req.query.localStatus, 20); const orderId = strParam(req.query.orderId); const id = strParam(req.query.id);
    const where = sql`WHERE true ${status ? sql`AND c.local_status = ${status}` : sql``} ${id ? sql`AND (c.id = ${id} OR c.provider_chargeback_id = ${id})` : sql``}
      ${orderId ? sql`AND EXISTS (SELECT 1 FROM chargeback_allocations a WHERE a.chargeback_id = c.id AND a.order_id = ${orderId})` : sql``}`;
    const total = rowsOf(await db.execute(sql`SELECT count(*)::int AS n FROM payment_chargebacks c ${where}`))[0]?.n ?? 0;
    const items = rowsOf(await db.execute(sql`
      SELECT c.id, c.payment_id, c.provider_chargeback_id, c.provider_status, c.provider_reason, c.value::text AS value, c.currency, c.local_status, c.deadline_to_send_dispute_documents, c.created_at, c.updated_at,
             (SELECT count(*)::int FROM chargeback_allocations a WHERE a.chargeback_id = c.id) AS allocations,
             (SELECT count(*)::int FROM chargeback_evidence e WHERE e.chargeback_id = c.id) AS evidence,
             (SELECT d.status FROM chargeback_decisions d WHERE d.chargeback_id = c.id ORDER BY d.version DESC LIMIT 1) AS latest_decision_status
        FROM payment_chargebacks c ${where} ORDER BY c.updated_at DESC, c.id DESC LIMIT ${limit} OFFSET ${offset}`));
    return res.json({ success: true, data: { items, total, limit, offset } });
  } catch (err) { return handleError(res, err, 'chargebacks'); }
});

ledgerAdminRouter.get('/chargebacks/:id', requireLedgerReader, async (req: AuthRequest, res: Response) => {
  try {
    const db: any = getDb(); if (!db) return deny(res, 503, 'DATABASE_UNAVAILABLE', 'Banco indisponível.');
    // provider_raw_response e ids de eventos de webhook NÃO são expostos
    const cb = rowsOf(await db.execute(sql`SELECT id, payment_id, purchase_group_id, provider, provider_chargeback_id, provider_status, provider_dispute_status, provider_reason, value::text AS value, currency, dispute_start_date, deadline_to_send_dispute_documents, local_status, created_at, updated_at FROM payment_chargebacks WHERE id = ${req.params.id}`))[0];
    if (!cb) return deny(res, 404, 'CHARGEBACK_NOT_FOUND', 'Chargeback não encontrado.');
    const allocations = rowsOf(await db.execute(sql`
      SELECT a.id, a.order_id, a.allocated_value::text AS allocated_value, a.currency, a.order_total::text AS order_total, a.release_stage, a.overlap_refund, a.created_at, o.seller_id, o.seller_net_amount::text AS seller_net_amount,
             (SELECT t.id FROM ledger_transactions t WHERE t.idempotency_key = 'chargeback_confirmed:' || a.id) AS confirmed_transaction_id
        FROM chargeback_allocations a JOIN orders o ON o.id = a.order_id WHERE a.chargeback_id = ${cb.id} ORDER BY a.order_id`));
    const evidence = rowsOf(await db.execute(sql`SELECT id, kind, description, file_ref, sha256, added_by, added_by_role, created_at FROM chargeback_evidence WHERE chargeback_id = ${cb.id} ORDER BY created_at, id`));
    const decisions = rowsOf(await db.execute(sql`SELECT id, version, status, cause_code, cause_detail, rationale, parties_heard, contract_basis, evidence_ids_json, evidence_hash, supersedes_decision_id, revision_reason, proposed_by, approved_by, approved_at, created_at FROM chargeback_decisions WHERE chargeback_id = ${cb.id} ORDER BY version`));
    const lines = decisions.length ? rowsOf(await db.execute(sql`SELECT id, decision_id, allocation_id, party_type, party_ref, contract_reference, amount::text AS amount FROM chargeback_decision_lines WHERE decision_id IN (${sql.join(decisions.map((d: any) => sql`${d.id}`), sql`, `)}) ORDER BY decision_id, allocation_id, id`)) : [];
    const recoveries = allocations.length ? rowsOf(await db.execute(sql`SELECT id, allocation_id, decision_id, kind, party_ref, amount::text AS amount, currency, evidence_ref, reason, performed_by, created_at FROM chargeback_recoveries WHERE allocation_id IN (${sql.join(allocations.map((a: any) => sql`${a.id}`), sql`, `)}) ORDER BY created_at, id`)) : [];
    return res.json({ success: true, data: { chargeback: cb, allocations, evidence, decisions: decisions.map((d: any) => ({ ...d, lines: lines.filter((l: any) => l.decision_id === d.id) })), recoveries } });
  } catch (err) { return handleError(res, err, 'chargeback-detail'); }
});

/** E7 — retenções de saldo: lista com idade (para achar as antigas, sem alertas automáticos) e avaliação de cobertura pela obrigação vigente. */
ledgerAdminRouter.get('/wallet-holds', requireLedgerReader, async (req: AuthRequest, res: Response) => {
  try {
    const status = strParam(req.query.status, 20);
    const older = req.query.olderThanDays === undefined || req.query.olderThanDays === '' ? undefined : Number(req.query.olderThanDays);
    const data = await listWalletHoldsForAdmin({
      status: status === 'ACTIVE' || status === 'RELEASED' ? status : undefined, olderThanDays: Number.isFinite(older) ? older : undefined,
      orderId: strParam(req.query.orderId) ?? undefined, walletId: strParam(req.query.walletId) ?? undefined, allocationId: strParam(req.query.allocationId) ?? undefined,
      limit: intParam(req.query.limit, 25, 1, 100), offset: intParam(req.query.offset, 0, 0, 1_000_000),
    });
    return res.json({ success: true, data });
  } catch (err) { return handleError(res, err, 'wallet-holds'); }
});
ledgerAdminRouter.get('/wallet-holds/:id', requireLedgerReader, async (req: AuthRequest, res: Response) => {
  try {
    const db: any = getDb(); if (!db) return deny(res, 503, 'DATABASE_UNAVAILABLE', 'Banco indisponível.');
    const hold = rowsOf(await db.execute(sql`SELECT id, wallet_id, currency, amount::text AS amount, status, reason, evidence_ref, reference_type, reference_id, ledger_transaction_id, created_by, created_at, released_by, released_at, release_reason, release_evidence_ref, floor(extract(epoch FROM (now() - created_at)) / 86400)::int AS age_days FROM wallet_holds WHERE id = ${req.params.id}`))[0];
    if (!hold) return deny(res, 404, 'HOLD_NOT_FOUND', 'Retenção não encontrada.');
    const audit = rowsOf(await db.execute(sql`SELECT action, actor_user_id, details_json, created_at FROM audit_logs WHERE resource = 'wallet_hold' AND resource_id = ${hold.id} ORDER BY created_at`));
    return res.json({ success: true, data: { hold, assessment: await assessWalletHold(db, hold), balances: await getWalletBalances(hold.wallet_id, db), audit } });
  } catch (err) { return handleError(res, err, 'wallet-hold-detail'); }
});

ledgerAdminRouter.get('/shipping-reversals', requireLedgerReader, async (req: AuthRequest, res: Response) => {
  try {
    const db: any = getDb(); if (!db) return deny(res, 503, 'DATABASE_UNAVAILABLE', 'Banco indisponível.');
    const limit = intParam(req.query.limit, 25, 1, 100); const offset = intParam(req.query.offset, 0, 0, 1_000_000); const orderId = strParam(req.query.orderId);
    const where = sql`WHERE true ${orderId ? sql`AND order_id = ${orderId}` : sql``}`;
    const total = rowsOf(await db.execute(sql`SELECT count(*)::int AS n FROM shipping_cost_reversals ${where}`))[0]?.n ?? 0;
    const items = rowsOf(await db.execute(sql`SELECT id, order_id, refund_id, amount::text AS amount, currency, subsidy_part::text AS subsidy_part, absorbed_part::text AS absorbed_part, evidence_ref, reason, performed_by, created_at FROM shipping_cost_reversals ${where} ORDER BY created_at DESC, id DESC LIMIT ${limit} OFFSET ${offset}`));
    return res.json({ success: true, data: { items, total, limit, offset } });
  } catch (err) { return handleError(res, err, 'shipping-reversals'); }
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// AÇÕES — todas chamam os serviços existentes (nenhuma lógica nova); o ator é SEMPRE o usuário autenticado
// ---------------------------------------------------------------------------------------------------------------------------------------------------------
const actor = (req: AuthRequest) => req.user!.id;

ledgerAdminRouter.post('/outbox/:id/requeue', writeLimiter, requireLedgerAdmin, async (req: AuthRequest, res: Response) => {
  try { return res.json({ success: true, data: await requeueOutboxEvent({ eventId: req.params.id, actorUserId: actor(req), reason: bodyStr(req.body?.reason) }) }); }
  catch (err) { return handleError(res, err, 'requeue'); }
});
ledgerAdminRouter.post('/outbox/:id/dismiss', writeLimiter, requireLedgerAdmin, async (req: AuthRequest, res: Response) => {
  try { return res.json({ success: true, data: await dismissOutboxEvent({ eventId: req.params.id, actorUserId: actor(req), reason: bodyStr(req.body?.reason) }) }); }
  catch (err) { return handleError(res, err, 'dismiss'); }
});
ledgerAdminRouter.post('/findings/:id/acknowledge', writeLimiter, requireLedgerAdmin, async (req: AuthRequest, res: Response) => {
  try { await acknowledgeFinding({ findingId: req.params.id, actorUserId: actor(req), note: bodyStr(req.body?.note) }); return res.json({ success: true, data: { findingId: req.params.id, status: 'ACKNOWLEDGED' } }); }
  catch (err) { return handleError(res, err, 'acknowledge'); }
});
/** Reparo manual de eventos ausentes (serviço existente repairMissingEvents). Sem `apply: true` é SEMPRE simulação (dry-run); aplicar exige confirm: true explícito. */
ledgerAdminRouter.post('/repair-missing', writeLimiter, requireLedgerAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const apply = req.body?.apply === true;
    if (apply && req.body?.confirm !== true) return deny(res, 400, 'CONFIRMATION_REQUIRED', 'Aplicar o reparo exige confirm: true explícito (simule primeiro).');
    const limit = req.body?.limit === undefined ? undefined : intParam(req.body.limit, 200, 1, 1000);
    return res.json({ success: true, data: await repairMissingEvents({ actorUserId: actor(req), dryRun: !apply, limit }) });
  } catch (err) { return handleError(res, err, 'repair-missing'); }
});

ledgerAdminRouter.post('/chargebacks/:id/evidence', writeLimiter, requireLedgerReader, async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    return res.status(201).json({ success: true, data: await addChargebackEvidence({ chargebackId: req.params.id, actorUserId: actor(req), kind: bodyStr(b.kind), description: bodyStr(b.description), fileRef: typeof b.fileRef === 'string' ? b.fileRef : null, sha256: typeof b.sha256 === 'string' ? b.sha256 : null }) });
  } catch (err) { return handleError(res, err, 'chargeback-evidence'); }
});
ledgerAdminRouter.post('/chargebacks/:id/decisions', writeLimiter, requireLedgerReader, async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    const lines = Array.isArray(b.lines) ? b.lines.map((l: any) => ({ orderId: bodyStr(l?.orderId), partyType: l?.partyType, partyRef: typeof l?.partyRef === 'string' ? l.partyRef : null, amount: typeof l?.amount === 'number' || typeof l?.amount === 'string' ? l.amount : '', contractReference: typeof l?.contractReference === 'string' ? l.contractReference : null })) : [];
    const r = await proposeChargebackDecision({
      chargebackId: req.params.id, actorUserId: actor(req), causeCode: bodyStr(b.causeCode), causeDetail: typeof b.causeDetail === 'string' ? b.causeDetail : null, rationale: bodyStr(b.rationale), partiesHeard: bodyStr(b.partiesHeard),
      contractBasis: typeof b.contractBasis === 'string' ? b.contractBasis : null, evidenceIds: Array.isArray(b.evidenceIds) ? b.evidenceIds.filter((x: unknown) => typeof x === 'string') : [], lines, revisionReason: typeof b.revisionReason === 'string' ? b.revisionReason : null,
    });
    return res.status(201).json({ success: true, data: r });
  } catch (err) { return handleError(res, err, 'chargeback-propose'); }
});
ledgerAdminRouter.post('/chargeback-decisions/:id/approve', writeLimiter, requireLedgerAdmin, async (req: AuthRequest, res: Response) => {
  try { return res.json({ success: true, data: await approveChargebackDecision({ decisionId: req.params.id, actorUserId: actor(req) }) }); }
  catch (err) { return handleError(res, err, 'chargeback-approve'); }
});
ledgerAdminRouter.post('/chargeback-decisions/:id/reject', writeLimiter, requireLedgerAdmin, async (req: AuthRequest, res: Response) => {
  try { await rejectChargebackDecision({ decisionId: req.params.id, actorUserId: actor(req), reason: bodyStr(req.body?.reason) }); return res.json({ success: true, data: { decisionId: req.params.id, status: 'REJECTED' } }); }
  catch (err) { return handleError(res, err, 'chargeback-reject'); }
});
ledgerAdminRouter.post('/chargeback-allocations/:id/settlements', writeLimiter, requireLedgerAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (b.kind !== 'RECOVERY' && b.kind !== 'WRITE_OFF') return deny(res, 400, 'INVALID_KIND', 'kind deve ser RECOVERY ou WRITE_OFF.');
    const r = await recordChargebackRecovery({ allocationId: req.params.id, kind: b.kind, partyRef: bodyStr(b.partyRef), amount: typeof b.amount === 'number' || typeof b.amount === 'string' ? b.amount : '', evidenceRef: bodyStr(b.evidenceRef), reason: bodyStr(b.reason), actorUserId: actor(req), idempotencyKey: bodyStr(b.idempotencyKey) });
    return res.status(r.alreadyRecorded ? 200 : 201).json({ success: true, data: r });
  } catch (err) { return handleError(res, err, 'chargeback-settlement'); }
});

/**
 * E7 — SOLICITAR retenção do saldo do vendedor por chargeback perdido com decisão de responsabilidade aprovada (D1/D5). Papéis FINANCE/RISK_ANALYST/GLOBAL_ADMIN; o serviço revalida
 * papel, conflito de interesse, obrigação aprovada, tetos e saldo livre. Não debita nem move dinheiro; nenhuma retenção é criada automaticamente.
 */
ledgerAdminRouter.post('/chargeback-allocations/:id/wallet-holds', writeLimiter, requireLedgerReader, async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    const r = await placeChargebackWalletHold({ allocationId: req.params.id, amount: typeof b.amount === 'number' || typeof b.amount === 'string' ? b.amount : '', reason: bodyStr(b.reason), evidenceRef: bodyStr(b.evidenceRef), actorUserId: actor(req), idempotencyKey: bodyStr(b.idempotencyKey) });
    return res.status(r.alreadyPlaced ? 200 : 201).json({ success: true, data: r });
  } catch (err) { return handleError(res, err, 'wallet-hold-place'); }
});
/** E7 — LIBERAR retenção (D2): somente GLOBAL_ADMIN e nunca o criador; motivo e evidência obrigatórios. Só devolve o valor ao disponível; não move dinheiro. */
ledgerAdminRouter.post('/wallet-holds/:id/release', writeLimiter, requireLedgerAdmin, async (req: AuthRequest, res: Response) => {
  try { return res.json({ success: true, data: await releaseWalletHold({ holdId: req.params.id, actorUserId: actor(req), reason: bodyStr(req.body?.reason), evidenceRef: bodyStr(req.body?.evidenceRef) }) }); }
  catch (err) { return handleError(res, err, 'wallet-hold-release'); }
});

ledgerAdminRouter.post('/shipping-reversals', writeLimiter, requireLedgerAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    const r = await recordShippingCostReversal({ orderId: bodyStr(b.orderId), amount: typeof b.amount === 'number' || typeof b.amount === 'string' ? b.amount : '', evidenceRef: bodyStr(b.evidenceRef), reason: bodyStr(b.reason), actorUserId: actor(req), idempotencyKey: bodyStr(b.idempotencyKey) });
    return res.status(r.alreadyRecorded ? 200 : 201).json({ success: true, data: r });
  } catch (err) { return handleError(res, err, 'shipping-reversal'); }
});
