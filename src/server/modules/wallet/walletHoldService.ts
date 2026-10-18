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
 * POLÍTICA APROVADA (D1–D7): (D1) FINANCE, RISK_ANALYST e GLOBAL_ADMIN solicitam, sem conflito de interesse; (D2) só GLOBAL_ADMIN DIFERENTE do criador libera, com motivo e evidência;
 * (D3) sem expiração automática (a idade da retenção é consultável); (D4) valor acima do saldo livre é recusado — nunca retenção parcial automática; (D5) só para chargeback
 * EFETIVAMENTE perdido, com decisão de responsabilidade do vendedor já APROVADA (E5): o acumulado ativo ≤ responsabilidade aprovada vigente E ≤ teto líquido N do pedido; nada é
 * criado automaticamente — só por solicitação administrativa explícita (placeChargebackWalletHold); (D6) saques já solicitados nunca são alterados; (D7) nenhum lançamento no
 * ledger sombra ao reter/liberar (só a referência opcional ao lançamento do chargeback, para rastreabilidade).
 * Mudanças posteriores na obrigação (revisão da decisão, chargeback revertido…) NÃO liberam nem alteram retenções sozinhas: assessWalletHold SINALIZA a divergência e novas retenções
 * são calculadas contra o valor vigente.
 */
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '../../../db/index.js';
import { wallets, walletHolds, users, auditLogs, ledgerTransactions, chargebackAllocations, paymentChargebacks, orders, sellers } from '../../../db/schema.js';
import { assertNoConflictOfInterest } from '../ledger/chargebackLedgerService.js';
import { toMicros, formatMicros } from '../ledger/decimal.js';

export const WALLET_HOLD_CREATE_ROLES: ReadonlySet<string> = new Set(['GLOBAL_ADMIN', 'FINANCE', 'RISK_ANALYST']);
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
  /** evidência da solicitação (protocolo, documento, decisão…) — obrigatória (mínimo 5 caracteres) */
  evidenceRef: string;
  /** o que justifica a retenção, ex.: CHARGEBACK_ALLOCATION + o id; UMA retenção ativa por (carteira, referência) */
  referenceType: string;
  referenceId: string;
  /** rastreabilidade opcional com o ledger sombra (apenas referência; nunca fonte de saldo) */
  ledgerTransactionId?: string | null;
  actorUserId: string;
  /** o mesmo pedido repetido nunca duplica */
  idempotencyKey: string;
}
export interface WalletHoldResult { holdId: string; walletId: string; amount: string; currency: string; status: string; alreadyPlaced: boolean; balances: WalletBalances }

export const CHARGEBACK_HOLD_REF = 'CHARGEBACK_ALLOCATION';
const REF_TYPE_RE = /^[A-Z][A-Z0-9_]{2,59}$/;

/** Regras de obrigação executadas DENTRO da transação, depois da trava da carteira (ver placeChargebackWalletHold). */
export type HoldObligationCheck = (tx: any, wallet: any, ctx: { heldBefore: bigint; amountMicros: bigint }) => Promise<void>;

/**
 * MOTOR de criação (interno): valida valor/evidência/idempotência/saldo livre e grava. NÃO conhece a política de obrigação — por isso nenhuma rota o chama diretamente;
 * a operação administrativa é placeChargebackWalletHold (que exige chargeback perdido + decisão aprovada). Exportado para os testes do motor.
 */
export async function placeWalletHoldCore(input: PlaceWalletHoldInput, executor?: any, obligationCheck?: HoldObligationCheck): Promise<WalletHoldResult> {
  const reason = String(input.reason ?? '').trim();
  const evidenceRef = String(input.evidenceRef ?? '').trim();
  const referenceType = String(input.referenceType ?? '').trim();
  const referenceId = String(input.referenceId ?? '').trim();
  const idempotencyKey = String(input.idempotencyKey ?? '').trim();
  const ledgerTransactionId = input.ledgerTransactionId ? String(input.ledgerTransactionId).trim() : null;
  if (reason.length < 10) throw new WalletHoldError('REASON_REQUIRED', 'Informe o motivo da retenção (mínimo 10 caracteres).');
  if (evidenceRef.length < 5) throw new WalletHoldError('EVIDENCE_REQUIRED', 'Informe a evidência da solicitação (mínimo 5 caracteres).');
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

    if (obligationCheck) await obligationCheck(tx, wallet, { heldBefore, amountMicros });

    // só se retém o que existe e ainda está livre: nunca mais que o saldo, nunca disponível negativo (sem retenção parcial automática)
    const total = toMicros(String(wallet.balance ?? '0'));
    if (heldBefore + amountMicros > total) {
      throw new WalletHoldError('INSUFFICIENT_UNHELD_BALANCE', `Saldo livre insuficiente para reter ${amount} ${wallet.currency}: saldo ${formatMicros(total, 2)}, já retido ${formatMicros(heldBefore, 2)}, livre ${formatMicros(total - heldBefore, 2)}.`, 409);
    }

    const holdId = newId(); const now = new Date();
    await tx.insert(walletHolds).values({
      id: holdId, walletId: wallet.id, currency: wallet.currency, amount, status: 'ACTIVE', reason, evidenceRef, referenceType, referenceId, ledgerTransactionId,
      createdBy: actor.id, idempotencyKey, createdAt: now,
    });
    await tx.insert(auditLogs).values({
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, actorUserId: actor.id, action: 'wallet.hold.place', resource: 'wallet_hold', resourceId: holdId,
      detailsJson: { walletId: wallet.id, walletOwnerUserId: wallet.userId, amount, currency: wallet.currency, reason, evidenceRef, referenceType, referenceId, ledgerTransactionId, totalBefore: formatMicros(total, 2), heldBefore: formatMicros(heldBefore, 2) }, createdAt: now,
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

export interface ReleaseWalletHoldInput { holdId: string; actorUserId: string; reason: string; /** evidência da liberação (obrigatória, mínimo 5 caracteres) */ evidenceRef: string }
export interface ReleaseWalletHoldResult { holdId: string; walletId: string; amount: string; status: string; alreadyReleased: boolean; balances: WalletBalances }

/** Libera (RELEASED) uma retenção: o valor volta a ser disponível. Nunca consome nem transfere. Repetir a liberação é um replay sem efeito. */
export async function releaseWalletHold(input: ReleaseWalletHoldInput, executor?: any): Promise<ReleaseWalletHoldResult> {
  const reason = String(input.reason ?? '').trim();
  const evidenceRef = String(input.evidenceRef ?? '').trim();
  if (reason.length < 10) throw new WalletHoldError('REASON_REQUIRED', 'Informe o motivo da liberação (mínimo 10 caracteres).');
  if (evidenceRef.length < 5) throw new WalletHoldError('EVIDENCE_REQUIRED', 'Informe a evidência da liberação (mínimo 5 caracteres).');
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
    // quatro olhos: quem criou nunca libera; quem é parte do caso (comprador/vendedor/loja) também não
    if (hold.createdBy === actor.id) throw new WalletHoldError('FOUR_EYES', 'Quem criou a retenção não pode liberá-la: peça a outro Administrador Geral.', 403);
    if (hold.referenceType === CHARGEBACK_HOLD_REF) {
      const [al] = await tx.select({ orderId: chargebackAllocations.orderId }).from(chargebackAllocations).where(eq(chargebackAllocations.id, hold.referenceId)).limit(1);
      if (al) await assertNoConflictOfInterest(tx, actor.id, [al.orderId]);
    }
    const now = new Date();
    await tx.update(walletHolds).set({ status: 'RELEASED', releasedBy: actor.id, releasedAt: now, releaseReason: reason, releaseEvidenceRef: evidenceRef }).where(eq(walletHolds.id, hold.id));
    await tx.insert(auditLogs).values({
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, actorUserId: actor.id, action: 'wallet.hold.release', resource: 'wallet_hold', resourceId: hold.id,
      detailsJson: { walletId: wallet.id, walletOwnerUserId: wallet.userId, amount: hold.amount, currency: hold.currency, reason, evidenceRef, referenceType: hold.referenceType, referenceId: hold.referenceId, createdBy: hold.createdBy }, createdAt: now,
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

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// D5 — retenção por CHARGEBACK perdido com responsabilidade do vendedor APROVADA (E5). Solicitação administrativa explícita; nunca automática.
// ---------------------------------------------------------------------------------------------------------------------------------------------------------
const lockChargebackForHold = (tx: any, chargebackId: string) => tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'cb:' + chargebackId}))`);
const lockOrderForHold = (tx: any, orderId: string) => tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'cbord:' + orderId}))`);

/** responsabilidade do VENDEDOR vigente (decisão APROVADA do chargeback) para uma alocação, em micros */
async function approvedSellerObligationMicros(tx: any, allocationId: string, chargebackId: string): Promise<bigint> {
  const r = rowsOf(await tx.execute(sql`
    SELECT coalesce(sum(l.amount), 0)::text AS s FROM chargeback_decision_lines l JOIN chargeback_decisions d ON d.id = l.decision_id
     WHERE l.allocation_id = ${allocationId} AND l.party_type = 'SELLER' AND d.status = 'APPROVED' AND d.chargeback_id = ${chargebackId}`));
  return toMicros(String(r[0]?.s ?? '0'));
}
/** Σ retenções ACTIVE de chargeback ligadas a alocações DO MESMO PEDIDO (teto N é por pedido) */
async function activeHoldsForOrderMicros(tx: any, orderId: string): Promise<bigint> {
  const r = rowsOf(await tx.execute(sql`
    SELECT coalesce(sum(h.amount), 0)::text AS s FROM wallet_holds h JOIN chargeback_allocations a ON a.id = h.reference_id
     WHERE h.reference_type = ${CHARGEBACK_HOLD_REF} AND h.status = 'ACTIVE' AND a.order_id = ${orderId}`));
  return toMicros(String(r[0]?.s ?? '0'));
}

export interface PlaceChargebackHoldInput { allocationId: string; amount: string | number; reason: string; evidenceRef: string; actorUserId: string; idempotencyKey: string }

/**
 * Cria a retenção do saldo do VENDEDOR para uma alocação de chargeback. Exige: chargeback efetivamente perdido (local_status 'lost'), alocação depois da liberação e sem
 * sobreposição com reembolso, decisão de responsabilidade APROVADA com linha SELLER para a alocação, ator FINANCE/RISK_ANALYST/GLOBAL_ADMIN sem conflito de interesse. Limites
 * (sob as travas do chargeback, do pedido e da carteira): acumulado ativo ≤ responsabilidade aprovada vigente e ≤ teto líquido N do pedido (somando as outras alocações do pedido).
 */
export async function placeChargebackWalletHold(input: PlaceChargebackHoldInput, executor?: any): Promise<WalletHoldResult> {
  const run = async (tx: any): Promise<WalletHoldResult> => {
    const [alloc] = await tx.select().from(chargebackAllocations).where(eq(chargebackAllocations.id, String(input.allocationId ?? ''))).limit(1);
    if (!alloc) throw new WalletHoldError('ALLOCATION_NOT_FOUND', `Alocação de chargeback ${input.allocationId} não encontrada.`, 404);
    // mesma ordem de travas da E5 (chargeback → pedido) e SÓ DEPOIS a carteira (dentro do motor): aprovar/revisar decisão × reter ficam serializados, sem inversão
    await lockChargebackForHold(tx, alloc.chargebackId);
    await lockOrderForHold(tx, alloc.orderId);
    const [cb] = await tx.select({ id: paymentChargebacks.id, localStatus: paymentChargebacks.localStatus }).from(paymentChargebacks).where(eq(paymentChargebacks.id, alloc.chargebackId)).limit(1);
    if (!cb || cb.localStatus !== 'lost') throw new WalletHoldError('CHARGEBACK_NOT_LOST', 'Só se retém saldo por chargeback efetivamente PERDIDO (valor já debitado pelo provedor).', 409);
    if (alloc.releaseStage !== 'AFTER_RELEASE' || alloc.overlapRefund) throw new WalletHoldError('HOLD_NOT_ALLOWED', 'A alocação não é de perda depois da liberação sem sobreposição com reembolso: não há obrigação do vendedor a reter.', 409);
    const approved = await approvedSellerObligationMicros(tx, alloc.id, alloc.chargebackId);
    if (approved <= 0n) throw new WalletHoldError('NO_APPROVED_OBLIGATION', 'Não há decisão de responsabilidade APROVADA com valor do vendedor para esta alocação.', 409);

    const [order] = await tx.select({ id: orders.id, sellerId: orders.sellerId, net: orders.sellerNetAmount }).from(orders).where(eq(orders.id, alloc.orderId)).limit(1);
    if (!order || order.net === null || order.net === undefined) throw new WalletHoldError('SELLER_NET_AMOUNT_MISSING', 'Pedido sem valor líquido do vendedor no snapshot: não há teto para reter.', 409);
    const [seller] = order.sellerId ? await tx.select({ userId: sellers.userId }).from(sellers).where(eq(sellers.id, order.sellerId)).limit(1) : [];
    if (!seller) throw new WalletHoldError('SELLER_NOT_RESOLVED', 'Não foi possível identificar o vendedor do pedido.', 409);
    const [w] = await tx.select({ id: wallets.id }).from(wallets).where(and(eq(wallets.userId, seller.userId), eq(wallets.currency, alloc.currency))).limit(1);
    if (!w) throw new WalletHoldError('WALLET_NOT_FOUND', `O vendedor não possui carteira em ${alloc.currency}: nada a reter.`, 404);

    await requireActor(tx, input.actorUserId, WALLET_HOLD_CREATE_ROLES, 'criar');
    await assertNoConflictOfInterest(tx, input.actorUserId, [alloc.orderId]);

    // rastreabilidade (D7): só a REFERÊNCIA ao lançamento do chargeback, se já existir — nenhum lançamento é criado
    const [lt] = await tx.select({ id: ledgerTransactions.id }).from(ledgerTransactions).where(eq(ledgerTransactions.idempotencyKey, `chargeback_confirmed:${alloc.id}`)).limit(1);

    const net = toMicros(String(order.net));
    return placeWalletHoldCore({
      walletId: w.id, amount: input.amount, reason: input.reason, evidenceRef: input.evidenceRef, referenceType: CHARGEBACK_HOLD_REF, referenceId: alloc.id,
      ledgerTransactionId: lt?.id ?? null, actorUserId: input.actorUserId, idempotencyKey: input.idempotencyKey,
    }, tx, async (tx2, wallet, ctx) => {
      if (wallet.currency !== alloc.currency) throw new WalletHoldError('CURRENCY_MISMATCH', 'A moeda da carteira difere da moeda do chargeback.', 409);
      const onAlloc = rowsOf(await tx2.execute(sql`SELECT coalesce(sum(amount), 0)::text AS s FROM wallet_holds WHERE reference_type = ${CHARGEBACK_HOLD_REF} AND reference_id = ${alloc.id} AND status = 'ACTIVE'`))[0]?.s ?? '0';
      const heldAlloc = toMicros(String(onAlloc));
      if (heldAlloc + ctx.amountMicros > approved) {
        throw new WalletHoldError('EXCEEDS_APPROVED_OBLIGATION', `A retenção acumulada (${formatMicros(heldAlloc + ctx.amountMicros, 2)}) excederia a responsabilidade aprovada do vendedor (${formatMicros(approved, 2)}).`, 409);
      }
      const heldOrder = await activeHoldsForOrderMicros(tx2, alloc.orderId);
      if (heldOrder + ctx.amountMicros > net) {
        throw new WalletHoldError('EXCEEDS_ORDER_NET_CAP', `O acumulado retido no pedido (${formatMicros(heldOrder + ctx.amountMicros, 2)}) excederia o valor líquido do vendedor (${formatMicros(net, 2)}).`, 409);
      }
    });
  };
  if (executor) return run(executor);
  const db: any = getDb(); if (!db) throw new Error('Banco de dados indisponível.');
  try { return await db.transaction(run); }
  catch (err: any) {
    const code = err?.code ?? err?.cause?.code; const constraint = String(err?.constraint ?? err?.cause?.constraint ?? '');
    if (code === '23505' && constraint.includes('wallet_holds_idempotency_uq')) return db.transaction(run);
    if (code === '23505' && constraint.includes('wallet_holds_active_ref_uq')) throw new WalletHoldError('DUPLICATE_ACTIVE_HOLD', 'Já existe uma retenção ativa para esta alocação nesta carteira.', 409);
    throw err;
  }
}

export type HoldCoverageState = 'OK' | 'RELEASED' | 'CHARGEBACK_NOT_LOST' | 'NO_APPROVED_OBLIGATION' | 'EXCEEDS_APPROVED_OBLIGATION' | 'EXCEEDS_ORDER_NET_CAP' | 'UNSUPPORTED_REFERENCE';
export interface HoldAssessment { state: HoldCoverageState; approvedObligation: string | null; orderNet: string | null; heldOnAllocation: string | null; heldOnOrder: string | null; ageDays: number }

/**
 * SINALIZA (nunca age) se uma retenção ATIVA continua coberta pela obrigação vigente: decisão revisada/rejeitada, chargeback revertido ou teto N ultrapassado viram um estado
 * de alerta para o administrador decidir — nenhuma retenção é liberada, reduzida ou consumida automaticamente e nenhum dinheiro é movido.
 */
export async function assessWalletHold(tx: any, hold: any, now = new Date()): Promise<HoldAssessment> {
  // a idade vem do SQL (now() - created_at, no fuso do banco) quando disponível; created_at é timestamp SEM fuso, então o fallback em JS só vale para linhas lidas pelo drizzle
  const ageDays = Number.isFinite(Number(hold.age_days)) ? Number(hold.age_days) : Math.max(0, Math.floor((now.getTime() - new Date(hold.createdAt ?? hold.created_at).getTime()) / 86_400_000));
  const status = hold.status; const refType = hold.referenceType ?? hold.reference_type; const refId = hold.referenceId ?? hold.reference_id;
  const base = { approvedObligation: null as string | null, orderNet: null as string | null, heldOnAllocation: null as string | null, heldOnOrder: null as string | null, ageDays };
  if (status === 'RELEASED') return { state: 'RELEASED', ...base };
  if (refType !== CHARGEBACK_HOLD_REF) return { state: 'UNSUPPORTED_REFERENCE', ...base };
  const [alloc] = await tx.select().from(chargebackAllocations).where(eq(chargebackAllocations.id, refId)).limit(1);
  if (!alloc) return { state: 'UNSUPPORTED_REFERENCE', ...base };
  const [cb] = await tx.select({ localStatus: paymentChargebacks.localStatus }).from(paymentChargebacks).where(eq(paymentChargebacks.id, alloc.chargebackId)).limit(1);
  const [order] = await tx.select({ net: orders.sellerNetAmount }).from(orders).where(eq(orders.id, alloc.orderId)).limit(1);
  const approved = await approvedSellerObligationMicros(tx, alloc.id, alloc.chargebackId);
  const heldAlloc = toMicros(String(rowsOf(await tx.execute(sql`SELECT coalesce(sum(amount), 0)::text AS s FROM wallet_holds WHERE reference_type = ${CHARGEBACK_HOLD_REF} AND reference_id = ${alloc.id} AND status = 'ACTIVE'`))[0]?.s ?? '0'));
  const heldOrder = await activeHoldsForOrderMicros(tx, alloc.orderId);
  const net = order?.net === null || order?.net === undefined ? null : toMicros(String(order.net));
  const out = { approvedObligation: formatMicros(approved, 2), orderNet: net === null ? null : formatMicros(net, 2), heldOnAllocation: formatMicros(heldAlloc, 2), heldOnOrder: formatMicros(heldOrder, 2), ageDays };
  if (!cb || cb.localStatus !== 'lost') return { state: 'CHARGEBACK_NOT_LOST', ...out };
  if (approved <= 0n) return { state: 'NO_APPROVED_OBLIGATION', ...out };
  if (heldAlloc > approved) return { state: 'EXCEEDS_APPROVED_OBLIGATION', ...out };
  if (net !== null && heldOrder > net) return { state: 'EXCEEDS_ORDER_NET_CAP', ...out };
  return { state: 'OK', ...out };
}

/** Página de retenções (mais recentes primeiro) com idade em dias e avaliação de cobertura. Filtros: estado, mais antigas que N dias, pedido, carteira. */
export async function listWalletHoldsForAdmin(input: { status?: 'ACTIVE' | 'RELEASED'; olderThanDays?: number; orderId?: string; walletId?: string; allocationId?: string; limit?: number; offset?: number }, executor?: any) {
  const db: any = executor ?? getDb(); if (!db) throw new Error('Banco de dados indisponível.');
  const limit = Math.min(100, Math.max(1, Math.floor(Number(input.limit) || 25))); const offset = Math.max(0, Math.floor(Number(input.offset) || 0));
  const conds: any[] = [sql`true`];
  if (input.status) conds.push(sql`h.status = ${input.status}`);
  if (Number.isFinite(input.olderThanDays) && (input.olderThanDays as number) >= 0) conds.push(sql`h.created_at <= now() - (${Math.floor(input.olderThanDays as number)} * interval '1 day')`);
  if (input.orderId) conds.push(sql`a.order_id = ${input.orderId}`);
  if (input.walletId) conds.push(sql`h.wallet_id = ${input.walletId}`);
  if (input.allocationId) conds.push(sql`h.reference_id = ${input.allocationId} AND h.reference_type = ${CHARGEBACK_HOLD_REF}`);
  const where = sql.join(conds, sql` AND `);
  const total = rowsOf(await db.execute(sql`SELECT count(*)::int AS n FROM wallet_holds h LEFT JOIN chargeback_allocations a ON a.id = h.reference_id AND h.reference_type = ${CHARGEBACK_HOLD_REF} WHERE ${where}`))[0]?.n ?? 0;
  const rows = rowsOf(await db.execute(sql`
    SELECT h.id, h.wallet_id, h.currency, h.amount::text AS amount, h.status, h.reason, h.evidence_ref, h.reference_type, h.reference_id, h.ledger_transaction_id, h.created_by, h.created_at,
           h.released_by, h.released_at, h.release_reason, h.release_evidence_ref, floor(extract(epoch FROM (now() - h.created_at)) / 86400)::int AS age_days, a.order_id, a.chargeback_id, w.user_id AS wallet_owner_user_id
      FROM wallet_holds h JOIN wallets w ON w.id = h.wallet_id LEFT JOIN chargeback_allocations a ON a.id = h.reference_id AND h.reference_type = ${CHARGEBACK_HOLD_REF}
     WHERE ${where} ORDER BY h.created_at DESC, h.id LIMIT ${limit} OFFSET ${offset}`));
  const items = [];
  for (const r of rows) items.push({ ...r, assessment: await assessWalletHold(db, r) });
  return { items, total, limit, offset };
}
