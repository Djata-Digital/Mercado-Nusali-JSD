/**
 * E7 — RETENÇÕES DE SALDO (wallet holds).
 *
 * Uma retenção SEPARA parte do saldo de uma carteira para que não possa ser sacada. Saldo total (wallets.balance) − retido (Σ retenções ACTIVE) = disponível para saque.
 * Este serviço NÃO move dinheiro: não debita a carteira, não consome a retenção, não transfere nada à Nusali nem a terceiros e não toca Escrow, pagamentos, reembolsos nem
 * o ledger sombra (que só é referenciado, opcionalmente, para rastreabilidade — nunca é fonte do saldo). Nada aqui cria retenções automaticamente: cada retenção é criada e
 * liberada por uma pessoa identificada, com motivo, e fica em audit_logs; a linha nunca é editada nem apagada (só ACTIVE → RELEASED; triggers no banco).
 *
 * Segurança em concorrência: criação e liberação travam a linha da carteira (SELECT … FOR UPDATE) — a MESMA trava que requestSellerPayout usa — então retenção × saque
 * e retenção × retenção do mesmo vendedor são serializados; o banco ainda recusa (trigger) uma retenção que faria retido > saldo.
 *
 * AUTORIZAÇÃO (provisória, a mais restrita possível): hoje só GLOBAL_ADMIN cria ou libera. Quem mais pode criar/liberar, em quais situações e por quanto tempo é decisão
 * financeira PENDENTE do dono; quando definida, basta ampliar WALLET_HOLD_*_ROLES (e, se exigido, quatro olhos na liberação). Ainda não existe rota HTTP para estas funções.
 */
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '../../../db/index.js';
import { wallets, walletHolds, users, auditLogs, ledgerTransactions } from '../../../db/schema.js';
import { toMicros, formatMicros } from '../ledger/decimal.js';

export const WALLET_HOLD_CREATE_ROLES: ReadonlySet<string> = new Set(['GLOBAL_ADMIN']);
export const WALLET_HOLD_RELEASE_ROLES: ReadonlySet<string> = new Set(['GLOBAL_ADMIN']);

export class WalletHoldError extends Error {
  code: string; status: number;
  constructor(code: string, message: string, status = 400) { super(message); this.name = 'WalletHoldError'; this.code = code; this.status = status; }
}

export interface WalletBalances {
  /** saldo da carteira (wallets.balance); pode ser negativo por dívida de reembolso (política existente) */
  total: string;
  /** Σ retenções ACTIVE */
  held: string;
  /** total − retido; é o que o saque pode usar (negativo = bloqueado) */
  available: string;
}

const newId = () => `whold_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
const rowsOf = (res: any): any[] => (Array.isArray(res) ? res : res?.rows ?? []);

/** Σ das retenções ACTIVE da carteira, em micros. Para uso DENTRO de uma transação que já travou a carteira quando o resultado decide algo. */
export async function sumActiveHoldsMicros(tx: any, walletId: string): Promise<bigint> {
  const r = await tx.select({ s: sql<string>`COALESCE(SUM(${walletHolds.amount}), 0)::text` }).from(walletHolds).where(and(eq(walletHolds.walletId, walletId), eq(walletHolds.status, 'ACTIVE')));
  return toMicros(String(r[0]?.s ?? '0'));
}

export function computeBalances(balance: string | number, heldMicros: bigint): WalletBalances {
  const total = toMicros(String(balance ?? '0'));
  return { total: formatMicros(total, 2), held: formatMicros(heldMicros, 2), available: formatMicros(total - heldMicros, 2) };
}

/** Leitura (sem trava) dos três saldos de uma carteira. */
export async function getWalletBalances(walletId: string, executor?: any): Promise<WalletBalances> {
  const db: any = executor ?? getDb(); if (!db) throw new Error('Banco de dados indisponível.');
  const [w] = await db.select({ balance: wallets.balance }).from(wallets).where(eq(wallets.id, walletId)).limit(1);
  if (!w) throw new WalletHoldError('WALLET_NOT_FOUND', `Carteira ${walletId} não encontrada.`, 404);
  return computeBalances(w.balance, await sumActiveHoldsMicros(db, walletId));
}

async function requireActor(tx: any, actorUserId: string, roles: ReadonlySet<string>, what: string) {
  const [actor] = await tx.select({ id: users.id, role: users.role, isActive: users.isActive }).from(users).where(eq(users.id, String(actorUserId ?? ''))).limit(1);
  if (!actor || actor.isActive === false || !roles.has(String(actor.role).toUpperCase())) {
    throw new WalletHoldError('FORBIDDEN', `Seu perfil não pode ${what} retenções de saldo.`, 403);
  }
  return actor;
}

export interface PlaceWalletHoldInput {
  walletId: string;
  /** valor retido (> 0, até 2 casas, na moeda da carteira) */
  amount: string | number;
  reason: string;
  /** o que justifica a retenção, ex.: CHARGEBACK_ALLOCATION / DISPUTE / ORDER + o id; UMA retenção ativa por (carteira, referência) */
  referenceType: string;
  referenceId: string;
  /** rastreabilidade opcional com o ledger sombra (apenas referência; nunca fonte de saldo) */
  ledgerTransactionId?: string | null;
  actorUserId: string;
  /** o mesmo pedido repetido nunca duplica */
  idempotencyKey: string;
}
export interface WalletHoldResult { holdId: string; walletId: string; amount: string; currency: string; status: string; alreadyPlaced: boolean; balances: WalletBalances }

const REF_TYPE_RE = /^[A-Z][A-Z0-9_]{2,59}$/;

export async function placeWalletHold(input: PlaceWalletHoldInput, executor?: any): Promise<WalletHoldResult> {
  const reason = String(input.reason ?? '').trim();
  const referenceType = String(input.referenceType ?? '').trim();
  const referenceId = String(input.referenceId ?? '').trim();
  const idempotencyKey = String(input.idempotencyKey ?? '').trim();
  const ledgerTransactionId = input.ledgerTransactionId ? String(input.ledgerTransactionId).trim() : null;
  if (reason.length < 10) throw new WalletHoldError('REASON_REQUIRED', 'Informe o motivo da retenção (mínimo 10 caracteres).');
  if (!REF_TYPE_RE.test(referenceType)) throw new WalletHoldError('REFERENCE_TYPE_INVALID', 'Informe o tipo da referência em MAIÚSCULAS (ex.: CHARGEBACK_ALLOCATION, DISPUTE, ORDER).');
  if (!referenceId || referenceId.length > 255) throw new WalletHoldError('REFERENCE_REQUIRED', 'Informe a referência (id) que justifica a retenção.');
  if (!idempotencyKey || idempotencyKey.length > 255) throw new WalletHoldError('IDEMPOTENCY_KEY_REQUIRED', 'Informe idempotencyKey — o mesmo pedido repetido nunca duplica a retenção.');
  let amountMicros: bigint;
  try { amountMicros = toMicros(String(input.amount)); } catch { throw new WalletHoldError('INVALID_AMOUNT', 'Valor inválido.'); }
  if (amountMicros <= 0n || amountMicros % 10000n !== 0n) throw new WalletHoldError('INVALID_AMOUNT', 'O valor da retenção deve ser positivo e ter no máximo 2 casas decimais.');
  const amount = formatMicros(amountMicros, 2);

  const run = async (tx: any): Promise<WalletHoldResult> => {
    const actor = await requireActor(tx, input.actorUserId, WALLET_HOLD_CREATE_ROLES, 'criar');

    // trava da carteira = a mesma do saque: serializa retenção × saque e retenção × retenção do mesmo vendedor
    const [wallet] = await tx.select().from(wallets).where(eq(wallets.id, String(input.walletId ?? ''))).for('update');
    if (!wallet) throw new WalletHoldError('WALLET_NOT_FOUND', `Carteira ${input.walletId} não encontrada.`, 404);
    if (wallet.userId === actor.id) throw new WalletHoldError('FORBIDDEN', 'Ninguém cria retenção na própria carteira.', 403);

    const heldBefore = await sumActiveHoldsMicros(tx, wallet.id);

    // idempotência: a mesma chave devolve a retenção existente; com outros dados, conflito
    const [existing] = await tx.select().from(walletHolds).where(eq(walletHolds.idempotencyKey, idempotencyKey)).limit(1);
    if (existing) {
      if (existing.walletId !== wallet.id || toMicros(existing.amount) !== amountMicros || existing.referenceType !== referenceType || existing.referenceId !== referenceId) {
        throw new WalletHoldError('IDEMPOTENCY_CONFLICT', 'A idempotencyKey já foi usada para outra retenção (carteira, valor ou referência diferentes).', 409);
      }
      return { holdId: existing.id, walletId: wallet.id, amount: existing.amount, currency: existing.currency, status: existing.status, alreadyPlaced: true, balances: computeBalances(wallet.balance, heldBefore) };
    }

    const [dup] = await tx.select({ id: walletHolds.id }).from(walletHolds)
      .where(and(eq(walletHolds.walletId, wallet.id), eq(walletHolds.referenceType, referenceType), eq(walletHolds.referenceId, referenceId), eq(walletHolds.status, 'ACTIVE'))).limit(1);
    if (dup) throw new WalletHoldError('DUPLICATE_ACTIVE_HOLD', `Já existe uma retenção ativa (${dup.id}) para ${referenceType} ${referenceId} nesta carteira.`, 409);

    if (ledgerTransactionId) {
      const [lt] = await tx.select({ id: ledgerTransactions.id }).from(ledgerTransactions).where(eq(ledgerTransactions.id, ledgerTransactionId)).limit(1);
      if (!lt) throw new WalletHoldError('LEDGER_REFERENCE_NOT_FOUND', `Lançamento ${ledgerTransactionId} não existe no ledger sombra.`, 404);
    }

    // só se retém o que existe e ainda está livre: nunca mais que o saldo, nunca disponível negativo (sem retenção parcial automática)
    const total = toMicros(String(wallet.balance ?? '0'));
    if (heldBefore + amountMicros > total) {
      throw new WalletHoldError('INSUFFICIENT_UNHELD_BALANCE', `Saldo livre insuficiente para reter ${amount} ${wallet.currency}: saldo ${formatMicros(total, 2)}, já retido ${formatMicros(heldBefore, 2)}, livre ${formatMicros(total - heldBefore, 2)}.`, 409);
    }

    const holdId = newId(); const now = new Date();
    await tx.insert(walletHolds).values({
      id: holdId, walletId: wallet.id, currency: wallet.currency, amount, status: 'ACTIVE', reason, referenceType, referenceId, ledgerTransactionId,
      createdBy: actor.id, idempotencyKey, createdAt: now,
    });
    await tx.insert(auditLogs).values({
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, actorUserId: actor.id, action: 'wallet.hold.place', resource: 'wallet_hold', resourceId: holdId,
      detailsJson: { walletId: wallet.id, walletOwnerUserId: wallet.userId, amount, currency: wallet.currency, reason, referenceType, referenceId, ledgerTransactionId, totalBefore: formatMicros(total, 2), heldBefore: formatMicros(heldBefore, 2) }, createdAt: now,
    });
    return { holdId, walletId: wallet.id, amount, currency: wallet.currency, status: 'ACTIVE', alreadyPlaced: false, balances: computeBalances(wallet.balance, heldBefore + amountMicros) };
  };

  if (executor) return run(executor);
  const db: any = getDb(); if (!db) throw new Error('Banco de dados indisponível.');
  try {
    return await db.transaction(run);
  } catch (err: any) {
    // corrida entre duas carteiras/conexões com a MESMA chave: a perdedora vira replay idempotente
    const code = err?.code ?? err?.cause?.code; const constraint = String(err?.constraint ?? err?.cause?.constraint ?? '');
    if (code === '23505' && constraint.includes('wallet_holds_idempotency_uq')) return db.transaction(run);
    if (code === '23505' && constraint.includes('wallet_holds_active_ref_uq')) throw new WalletHoldError('DUPLICATE_ACTIVE_HOLD', `Já existe uma retenção ativa para ${referenceType} ${referenceId} nesta carteira.`, 409);
    throw err;
  }
}

export interface ReleaseWalletHoldInput { holdId: string; actorUserId: string; reason: string }
export interface ReleaseWalletHoldResult { holdId: string; walletId: string; amount: string; status: string; alreadyReleased: boolean; balances: WalletBalances }

/** Libera (RELEASED) uma retenção: o valor volta a ser disponível. Nunca consome nem transfere. Repetir a liberação é um replay sem efeito. */
export async function releaseWalletHold(input: ReleaseWalletHoldInput, executor?: any): Promise<ReleaseWalletHoldResult> {
  const reason = String(input.reason ?? '').trim();
  if (reason.length < 10) throw new WalletHoldError('REASON_REQUIRED', 'Informe o motivo da liberação (mínimo 10 caracteres).');
  const run = async (tx: any): Promise<ReleaseWalletHoldResult> => {
    const actor = await requireActor(tx, input.actorUserId, WALLET_HOLD_RELEASE_ROLES, 'liberar');
    const [peek] = await tx.select({ walletId: walletHolds.walletId }).from(walletHolds).where(eq(walletHolds.id, String(input.holdId ?? ''))).limit(1);
    if (!peek) throw new WalletHoldError('HOLD_NOT_FOUND', `Retenção ${input.holdId} não encontrada.`, 404);
    // ordem de trava: carteira → retenção (a mesma de placeWalletHold e do saque)
    const [wallet] = await tx.select().from(wallets).where(eq(wallets.id, peek.walletId)).for('update');
    const [hold] = await tx.select().from(walletHolds).where(eq(walletHolds.id, input.holdId)).for('update');
    const heldNow = await sumActiveHoldsMicros(tx, wallet.id);
    if (hold.status === 'RELEASED') {
      return { holdId: hold.id, walletId: wallet.id, amount: hold.amount, status: 'RELEASED', alreadyReleased: true, balances: computeBalances(wallet.balance, heldNow) };
    }
    const now = new Date();
    await tx.update(walletHolds).set({ status: 'RELEASED', releasedBy: actor.id, releasedAt: now, releaseReason: reason }).where(eq(walletHolds.id, hold.id));
    await tx.insert(auditLogs).values({
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, actorUserId: actor.id, action: 'wallet.hold.release', resource: 'wallet_hold', resourceId: hold.id,
      detailsJson: { walletId: wallet.id, walletOwnerUserId: wallet.userId, amount: hold.amount, currency: hold.currency, reason, referenceType: hold.referenceType, referenceId: hold.referenceId, createdBy: hold.createdBy }, createdAt: now,
    });
    return { holdId: hold.id, walletId: wallet.id, amount: hold.amount, status: 'RELEASED', alreadyReleased: false, balances: computeBalances(wallet.balance, heldNow - toMicros(hold.amount)) };
  };
  if (executor) return run(executor);
  const db: any = getDb(); if (!db) throw new Error('Banco de dados indisponível.');
  return db.transaction(run);
}

/** Lista (leitura) as retenções de uma carteira, mais recentes primeiro. */
export async function listWalletHolds(input: { walletId: string; status?: 'ACTIVE' | 'RELEASED'; limit?: number }, executor?: any) {
  const db: any = executor ?? getDb(); if (!db) throw new Error('Banco de dados indisponível.');
  const limit = Math.min(200, Math.max(1, Math.floor(Number(input.limit) || 50)));
  const cond = input.status ? and(eq(walletHolds.walletId, input.walletId), eq(walletHolds.status, input.status)) : eq(walletHolds.walletId, input.walletId);
  return rowsOf(await db.select().from(walletHolds).where(cond).orderBy(sql`${walletHolds.createdAt} DESC`).limit(limit));
}
