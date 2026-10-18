/**
 * LEDGER SOMBRA — E5: chargebacks. Quatro coisas separadas (nunca confundidas):
 *  1) contestação ABERTA (payment_chargebacks.active/manual_review): nenhum lançamento — o provedor ainda não debitou nada;
 *  2) valor EFETIVAMENTE debitado pelo provedor (local_status = lost): alocação por pedido (chargeback_allocations) + evento CHARGEBACK_CONFIRMED no outbox, gravados na MESMA
 *     transação que registra o "lost" (savepoint; nunca derruba a observação). Depois da liberação é uma perda PENDENTE de responsável, não definitiva;
 *  3) DECISÃO de responsabilidade, caso a caso: proposta (staff) → aprovada por GLOBAL_ADMIN ≠ proponente, com evidências, fundamentação e partes ouvidas; versionada e imutável;
 *     NUNCA automática (nem para o vendedor, nem para a Nusali);
 *  4) RECUPERAÇÃO externa / BAIXA de reclamação de terceiro, com evidência.
 * Nada aqui move dinheiro real: carteiras, Escrow, pagamentos, reembolsos, comissões, frete e subsídios são intocados. O valor alocado ao vendedor fica como RECEBÍVEL no ledger
 * sombra; a cobrança pela carteira real não existe nesta etapa. Política aprovada: a responsabilidade do vendedor é LIMITADA ao valor líquido (N) do pedido (cumulativo, ver
 * assertSellerCap) — o teto não é responsabilidade automática, e o excedente nunca vai para a Nusali sem decisão explícita. Qualquer outra política indefinida NÃO é aplicada.
 */
import crypto from 'crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../../../db/index.js';
import {
  orders, payments, paymentAllocations, refunds, escrowAccounts, sellers, storeMembers, users, auditLogs, paymentChargebacks,
  chargebackAllocations, chargebackEvidence, chargebackDecisions, chargebackDecisionLines, chargebackRecoveries,
} from '../../../db/schema.js';
import { logger } from '../../infra/logger.js';
import { FinancialLedgerService } from './financialLedgerService.js';
import { toMicros, fromMicros, formatMicros } from './decimal.js';
import { allocateByWeights } from './chargebackEntries.js';
import { stageLedgerEventsInTx, flushLedgerStage, type LedgerStage } from './outbox/ledgerShadowHooks.js';
import type { EnqueueInput } from './outbox/outboxService.js';

export class ChargebackLedgerError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.name = 'ChargebackLedgerError'; this.code = code; }
}

const newId = (p: string) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
const CAUSES = ['SELLER_FAULT', 'NUSALI_FAULT', 'LOGISTICS_FAULT', 'EXTERNAL_FRAUD', 'SHARED', 'INDETERMINATE'] as const;
const PROPOSER_ROLES = ['GLOBAL_ADMIN', 'FINANCE', 'RISK_ANALYST'];

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// (2) chargeback perdido → alocação por pedido + evento CHARGEBACK_CONFIRMED (chamado DENTRO da transação de observeChargeback)
// ---------------------------------------------------------------------------------------------------------------------------------------------------------
export async function stageChargebackLoss(tx: any, cb: { id: string; value: string | number; currency: string }, payment: typeof payments.$inferSelect): Promise<LedgerStage | undefined> {
  // Ledger sombra desligado (sem LEDGER_SHADOW_CUTOFF_AT): nada é gravado — a observação do chargeback segue exatamente como antes da E5.
  if (!FinancialLedgerService.getShadowStatus().enabled) return undefined;
  let shares: Array<{ orderId: string; weight: string }> = [];
  if (payment.orderId) {
    const [o] = await tx.select({ id: orders.id, total: orders.totalAmount }).from(orders).where(eq(orders.id, payment.orderId)).limit(1);
    if (o) shares = [{ orderId: o.id, weight: String(o.total) }];
  } else {
    const rows = await tx.select({ orderId: paymentAllocations.orderId, amount: paymentAllocations.amount }).from(paymentAllocations).where(eq(paymentAllocations.paymentId, payment.id));
    shares = rows.map((r: any) => ({ orderId: r.orderId, weight: String(r.amount) })).sort((a: any, b: any) => a.orderId.localeCompare(b.orderId));
  }
  if (shares.length === 0) {
    logger.error({ chargebackId: cb.id, paymentId: payment.id }, '[Chargeback] perdido sem pedido/alocação identificável — nada alocado; a reconciliação acusa');
    return undefined;
  }
  const valueCents = toMicros(String(cb.value)) / 10000n;
  const split = allocateByWeights(valueCents, shares.map((s) => toMicros(s.weight)));
  const items: EnqueueInput[] = [];
  for (let i = 0; i < shares.length; i++) {
    if (split[i] <= 0n) continue;
    const [order] = await tx.select().from(orders).where(eq(orders.id, shares[i].orderId)).limit(1);
    const [escrow] = await tx.select({ releasedAt: escrowAccounts.releasedAt }).from(escrowAccounts).where(eq(escrowAccounts.orderId, shares[i].orderId)).limit(1);
    if (!order || !escrow) { logger.error({ chargebackId: cb.id, orderId: shares[i].orderId }, '[Chargeback] pedido/Escrow ausente — sem alocação para este pedido'); continue; }
    const refunded = await tx.select({ id: refunds.id }).from(refunds).where(and(eq(refunds.orderId, order.id), eq(refunds.status, 'processed'))).limit(1);
    const allocatedValue = formatMicros(split[i] * 10000n, 2);
    await tx.insert(chargebackAllocations).values({
      id: newId('cba'), chargebackId: cb.id, orderId: order.id, paymentId: payment.id, allocatedValue, currency: cb.currency, orderTotal: String(order.totalAmount),
      releaseStage: escrow.releasedAt ? 'AFTER_RELEASE' : 'BEFORE_RELEASE', overlapRefund: refunded.length > 0, createdAt: new Date(),
    }).onConflictDoNothing();
    const [alloc] = await tx.select().from(chargebackAllocations).where(and(eq(chargebackAllocations.chargebackId, cb.id), eq(chargebackAllocations.orderId, order.id))).limit(1);
    if (alloc && !alloc.overlapRefund) items.push({ eventType: 'CHARGEBACK_CONFIRMED', order, paymentId: payment.id, purchaseGroupId: order.purchaseGroupId ?? null, chargebackSubjectId: alloc.id, occurredAt: alloc.createdAt, source: 'chargeback_service' });
  }
  if (items.length === 0) return undefined;
  return stageLedgerEventsInTx(tx, items);
}

/** Pós-commit: tentativa imediata (outbox) ou, com o outbox desligado, o lançamento direto best-effort. Nunca lança. */
export async function flushChargebackStage(stage: LedgerStage | undefined, direct: () => Promise<void>): Promise<void> {
  if (!stage) return;
  try { await flushLedgerStage(stage, async () => { try { await direct(); } catch (err: any) { logger.error({ error: err?.message }, '[ShadowLedger] lançamento direto de chargeback falhou — fluxo real não afetado; repetível (idempotente)'); } }, true); }
  catch (err: any) { logger.error({ error: err?.message }, '[ShadowLedger] flush de chargeback falhou — o worker recuperará'); }
}

export async function postChargebackConfirmationsDirect(chargebackId: string): Promise<void> {
  const db: any = getDb(); if (!db) return;
  const allocs = await db.select().from(chargebackAllocations).where(and(eq(chargebackAllocations.chargebackId, chargebackId), eq(chargebackAllocations.overlapRefund, false)));
  for (const a of allocs) {
    const r = await FinancialLedgerService.recordChargebackConfirmed({ allocationId: a.id, source: 'chargeback_service' });
    if (!r.posted) logger.warn({ allocationId: a.id, reason: r.reason, detail: r.detail }, '[ShadowLedger] recordChargebackConfirmed ignorado — fluxo real não afetado');
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// apoio: papéis, conflito de interesse
// ---------------------------------------------------------------------------------------------------------------------------------------------------------
async function roleOf(tx: any, userId: string): Promise<string | null> {
  const [u] = await tx.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  return u ? String(u.role).toUpperCase() : null;
}
async function requireRole(tx: any, userId: string, allowed: string[], what: string): Promise<string> {
  const role = await roleOf(tx, userId);
  if (!role || !allowed.includes(role)) throw new ChargebackLedgerError('FORBIDDEN', `${what}: papel insuficiente (${role ?? 'usuário inexistente'}).`);
  return role;
}
/** Quem decide não pode ser comprador, vendedor (nem membro da loja) de nenhum pedido do caso. */
export async function assertNoConflictOfInterest(tx: any, actorUserId: string, orderIds: string[]): Promise<void> {
  if (orderIds.length === 0) return;
  const os = await tx.select({ buyerId: orders.buyerId, sellerId: orders.sellerId, storeId: orders.storeId }).from(orders).where(inArray(orders.id, orderIds));
  if (os.some((o: any) => o.buyerId === actorUserId)) throw new ChargebackLedgerError('CONFLICT_OF_INTEREST', 'O usuário é o comprador de um pedido do caso — não pode decidir.');
  const sellerIds = os.map((o: any) => o.sellerId).filter(Boolean);
  if (sellerIds.length) {
    const sel = await tx.select({ userId: sellers.userId }).from(sellers).where(inArray(sellers.id, sellerIds));
    if (sel.some((x: any) => x.userId === actorUserId)) throw new ChargebackLedgerError('CONFLICT_OF_INTEREST', 'O usuário é o vendedor de um pedido do caso — não pode decidir.');
  }
  const storeIds = os.map((o: any) => o.storeId).filter(Boolean);
  if (storeIds.length) {
    const mem = await tx.select({ userId: storeMembers.userId }).from(storeMembers).where(inArray(storeMembers.storeId, storeIds));
    if (mem.some((x: any) => x.userId === actorUserId)) throw new ChargebackLedgerError('CONFLICT_OF_INTEREST', 'O usuário é membro da loja de um pedido do caso — não pode decidir.');
  }
}
const lockChargeback = (tx: any, chargebackId: string) => tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'cb:' + chargebackId}))`);
const lockOrderForCap = (tx: any, orderId: string) => tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'cbord:' + orderId}))`);
const rowsOfRes = (res: any): any[] => (Array.isArray(res) ? res : res?.rows ?? []);

/**
 * POLÍTICA APROVADA — teto da responsabilidade do VENDEDOR por chargeback = valor LÍQUIDO (N = orders.sellerNetAmount, snapshot do pedido), CUMULATIVO por pedido:
 * soma das linhas SELLER da decisão que está sendo proposta/aprovada + o que já está atribuído ao vendedor desse pedido por decisões APROVADAS vigentes de OUTROS
 * chargebacks do mesmo pedido. Numa revisão, as linhas da versão anterior do MESMO chargeback são substituídas (não se somam). O teto NÃO é responsabilidade automática
 * (cada caso exige evidências, proposta e aprovação) e o excedente NUNCA vai para a Nusali sozinho: continua exigindo linha explícita (NUSALI ou terceiro) na decisão.
 */
async function assertSellerCap(tx: any, chargebackId: string, sellerByAllocation: Map<string, bigint>): Promise<void> {
  for (const [allocationId, sellerSum] of sellerByAllocation) {
    if (sellerSum <= 0n) continue;
    const [alloc] = await tx.select().from(chargebackAllocations).where(eq(chargebackAllocations.id, allocationId)).limit(1);
    const [order] = await tx.select({ id: orders.id, net: orders.sellerNetAmount }).from(orders).where(eq(orders.id, alloc.orderId)).limit(1);
    if (!order || order.net === null || order.net === undefined) throw new ChargebackLedgerError('SELLER_NET_AMOUNT_MISSING', `Pedido ${alloc.orderId} sem valor líquido do vendedor no snapshot: não há teto para atribuir responsabilidade ao vendedor.`);
    const net = toMicros(String(order.net));
    const other = rowsOfRes(await tx.execute(sql`
      SELECT coalesce(sum(l.amount), 0)::text AS s FROM chargeback_decision_lines l
        JOIN chargeback_decisions d ON d.id = l.decision_id JOIN chargeback_allocations a ON a.id = l.allocation_id
       WHERE l.party_type = 'SELLER' AND d.status = 'APPROVED' AND d.chargeback_id <> ${chargebackId} AND a.order_id = ${order.id}`))[0]?.s ?? '0';
    const already = toMicros(String(other));
    if (already + sellerSum > net) {
      throw new ChargebackLedgerError('SELLER_CAP_EXCEEDED', `Pedido ${order.id}: a responsabilidade do vendedor (${fromMicros(sellerSum)}, mais ${fromMicros(already)} já atribuídos por outras decisões) excede o valor líquido do pedido (${fromMicros(net)}). O excedente só pode ser atribuído por decisão EXPLÍCITA (Nusali ou terceiro), nunca automaticamente.`);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// evidência (append-only)
// ---------------------------------------------------------------------------------------------------------------------------------------------------------
export async function addChargebackEvidence(input: { chargebackId: string; actorUserId: string; kind: string; description: string; fileRef?: string | null; sha256?: string | null }): Promise<{ evidenceId: string }> {
  const db: any = getDb(); if (!db) throw new Error('Banco de dados indisponível.');
  const description = String(input.description ?? '').trim();
  if (description.length < 10) throw new ChargebackLedgerError('DESCRIPTION_REQUIRED', 'Descreva a evidência (mínimo 10 caracteres).');
  if (!String(input.kind ?? '').trim()) throw new ChargebackLedgerError('KIND_REQUIRED', 'Informe o tipo da evidência.');
  if (input.sha256 && !/^[0-9a-f]{64}$/i.test(input.sha256)) throw new ChargebackLedgerError('INVALID_SHA256', 'sha256 inválido.');
  return db.transaction(async (tx: any) => {
    const role = await requireRole(tx, input.actorUserId, PROPOSER_ROLES, 'Registrar evidência');
    const [cb] = await tx.select({ id: paymentChargebacks.id }).from(paymentChargebacks).where(eq(paymentChargebacks.id, input.chargebackId)).limit(1);
    if (!cb) throw new ChargebackLedgerError('CHARGEBACK_NOT_FOUND', 'Chargeback não encontrado.');
    const id = newId('cbe');
    await tx.insert(chargebackEvidence).values({ id, chargebackId: cb.id, kind: String(input.kind).trim(), description, fileRef: input.fileRef ?? null, sha256: input.sha256 ? input.sha256.toLowerCase() : null, addedBy: input.actorUserId, addedByRole: role, createdAt: new Date() });
    await tx.insert(auditLogs).values({ id: newId('aud'), actorUserId: input.actorUserId, action: 'ledger.chargeback.evidence_added', resource: 'chargeback_evidence', resourceId: id, detailsJson: { chargebackId: cb.id, kind: input.kind, sha256: input.sha256 ?? null }, createdAt: new Date() });
    return { evidenceId: id };
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// (3) decisão de responsabilidade: propor → aprovar (≠ proponente)
// ---------------------------------------------------------------------------------------------------------------------------------------------------------
export interface DecisionLineInput { orderId: string; partyType: 'SELLER' | 'NUSALI' | 'THIRD_PARTY'; partyRef?: string | null; amount: string | number; contractReference?: string | null }
export interface ProposeDecisionInput {
  chargebackId: string; actorUserId: string; causeCode: string; causeDetail?: string | null; rationale: string; partiesHeard: string; contractBasis?: string | null;
  evidenceIds: string[]; lines: DecisionLineInput[]; revisionReason?: string | null;
}

export async function proposeChargebackDecision(input: ProposeDecisionInput): Promise<{ decisionId: string; version: number; supersedes: string | null }> {
  const db: any = getDb(); if (!db) throw new Error('Banco de dados indisponível.');
  const rationale = String(input.rationale ?? '').trim(); const partiesHeard = String(input.partiesHeard ?? '').trim();
  if (!(CAUSES as readonly string[]).includes(input.causeCode)) throw new ChargebackLedgerError('INVALID_CAUSE', `Causa inválida. Use uma de: ${CAUSES.join(', ')}.`);
  if (rationale.length < 30) throw new ChargebackLedgerError('RATIONALE_REQUIRED', 'A fundamentação é obrigatória (mínimo 30 caracteres).');
  if (partiesHeard.length < 10) throw new ChargebackLedgerError('PARTIES_HEARD_REQUIRED', 'Informe as partes ouvidas e quando (mínimo 10 caracteres).');
  if (!Array.isArray(input.evidenceIds) || input.evidenceIds.length === 0) throw new ChargebackLedgerError('EVIDENCE_REQUIRED', 'Uma decisão exige ao menos uma evidência registrada.');
  if (!Array.isArray(input.lines) || input.lines.length === 0) throw new ChargebackLedgerError('LINES_REQUIRED', 'Informe a divisão da perda por parte.');

  return db.transaction(async (tx: any) => {
    await requireRole(tx, input.actorUserId, PROPOSER_ROLES, 'Propor decisão');
    await lockChargeback(tx, input.chargebackId);
    const [cb] = await tx.select().from(paymentChargebacks).where(eq(paymentChargebacks.id, input.chargebackId)).limit(1);
    if (!cb) throw new ChargebackLedgerError('CHARGEBACK_NOT_FOUND', 'Chargeback não encontrado.');
    if (cb.localStatus !== 'lost') throw new ChargebackLedgerError('CHARGEBACK_NOT_LOST', `Chargeback "${cb.localStatus}": só se decide responsabilidade sobre valor EFETIVAMENTE debitado (lost) — contestação aberta não gera perda.`);
    const allocs = await tx.select().from(chargebackAllocations).where(eq(chargebackAllocations.chargebackId, cb.id));
    if (allocs.length === 0) throw new ChargebackLedgerError('NO_ALLOCATIONS', 'O chargeback perdido não tem pedidos alocados.');
    if (allocs.some((a: any) => a.overlapRefund)) throw new ChargebackLedgerError('CHARGEBACK_REFUND_OVERLAP', 'Há pedido com reembolso concluído E chargeback perdido (perda dobrada): resolva a sobreposição antes de decidir.');
    const decidable = allocs.filter((a: any) => a.releaseStage === 'AFTER_RELEASE');
    if (decidable.length === 0) throw new ChargebackLedgerError('NOTHING_TO_DECIDE', 'Chargeback confirmado antes da liberação: o Escrow absorveu o valor; não há perda a repartir.');
    await assertNoConflictOfInterest(tx, input.actorUserId, allocs.map((a: any) => a.orderId));

    // evidências existem, são deste chargeback; o hash do conjunto liga a fundamentação ao que existia no momento
    const ev = await tx.select().from(chargebackEvidence).where(and(eq(chargebackEvidence.chargebackId, cb.id), inArray(chargebackEvidence.id, input.evidenceIds)));
    if (ev.length !== new Set(input.evidenceIds).size) throw new ChargebackLedgerError('EVIDENCE_NOT_FOUND', 'Alguma evidência informada não existe para este chargeback.');
    const evidenceHash = crypto.createHash('sha256').update(JSON.stringify(ev.map((e: any) => [e.id, e.sha256 ?? '', e.kind, e.description]).sort())).digest('hex');

    // linhas: cada alocação com perda pendente soma EXATAMENTE o valor alocado; nada para alocação antes da liberação
    const byOrder = new Map<string, any>(allocs.map((a: any) => [a.orderId, a]));
    const sumByAlloc = new Map<string, bigint>();
    const orderRows = await tx.select({ id: orders.id, sellerId: orders.sellerId }).from(orders).where(inArray(orders.id, allocs.map((a: any) => a.orderId)));
    const sellerOf = new Map<string, string | null>(orderRows.map((o: any) => [o.id, o.sellerId ?? null]));
    const prepared: Array<{ allocationId: string; partyType: string; partyRef: string | null; contractReference: string | null; amount: string }> = [];
    for (const l of input.lines) {
      const a = byOrder.get(l.orderId);
      if (!a) throw new ChargebackLedgerError('LINE_ORDER_NOT_IN_CASE', `Pedido ${l.orderId} não pertence a este chargeback.`);
      if (a.releaseStage !== 'AFTER_RELEASE') throw new ChargebackLedgerError('LINE_BEFORE_RELEASE', `Pedido ${l.orderId}: chargeback confirmado antes da liberação — não há perda a repartir.`);
      let amt: bigint; try { amt = toMicros(String(l.amount)); } catch { throw new ChargebackLedgerError('INVALID_AMOUNT', 'Valor de linha inválido.'); }
      if (amt <= 0n || amt % 10000n !== 0n) throw new ChargebackLedgerError('INVALID_AMOUNT', 'Cada linha deve ter valor positivo com no máximo 2 casas decimais.');
      let partyRef: string | null = l.partyRef ? String(l.partyRef).trim() : null;
      if (l.partyType === 'SELLER') {
        const s = sellerOf.get(l.orderId);
        if (!s) throw new ChargebackLedgerError('SELLER_NOT_RESOLVED', `Pedido ${l.orderId} não tem vendedor.`);
        if (partyRef && partyRef !== s) throw new ChargebackLedgerError('SELLER_MISMATCH', 'partyRef difere do vendedor do pedido.');
        partyRef = s;
      } else if (l.partyType === 'THIRD_PARTY') {
        if (!partyRef) throw new ChargebackLedgerError('THIRD_PARTY_REF_REQUIRED', 'Linha de terceiro exige a identificação do terceiro (transportadora etc.).');
        if (!l.contractReference || String(l.contractReference).trim().length < 5) throw new ChargebackLedgerError('CONTRACT_REFERENCE_REQUIRED', 'Linha de terceiro exige a referência contratual (a responsabilidade de terceiro não é presumida).');
      } else if (l.partyType === 'NUSALI') { partyRef = null; }
      else throw new ChargebackLedgerError('INVALID_PARTY', 'partyType inválido.');
      sumByAlloc.set(a.id, (sumByAlloc.get(a.id) ?? 0n) + amt);
      prepared.push({ allocationId: a.id, partyType: l.partyType, partyRef, contractReference: l.partyType === 'THIRD_PARTY' ? String(l.contractReference).trim() : null, amount: formatMicros(amt, 2) });
    }
    for (const a of decidable) {
      if ((sumByAlloc.get(a.id) ?? 0n) !== toMicros(a.allocatedValue)) throw new ChargebackLedgerError('LINES_SUM_MISMATCH', `Pedido ${a.orderId}: as linhas somam ${fromMicros(sumByAlloc.get(a.id) ?? 0n)} e o valor alocado é ${a.allocatedValue}.`);
    }
    // teto do vendedor (N), cumulativo por pedido — checado já na proposta (e de novo, sob lock, na aprovação)
    const sellerByAlloc = new Map<string, bigint>();
    for (const pl of prepared) if (pl.partyType === 'SELLER') sellerByAlloc.set(pl.allocationId, (sellerByAlloc.get(pl.allocationId) ?? 0n) + toMicros(pl.amount));
    await assertSellerCap(tx, cb.id, sellerByAlloc);

    // versão / revisão
    const [approved] = await tx.select().from(chargebackDecisions).where(and(eq(chargebackDecisions.chargebackId, cb.id), eq(chargebackDecisions.status, 'APPROVED'))).limit(1);
    let supersedes: string | null = null;
    if (approved) {
      if (!input.revisionReason || String(input.revisionReason).trim().length < 10) throw new ChargebackLedgerError('REVISION_REASON_REQUIRED', 'Já existe decisão aprovada: informe o motivo da revisão (mínimo 10 caracteres).');
      const settled = await tx.select({ id: chargebackRecoveries.id }).from(chargebackRecoveries).where(inArray(chargebackRecoveries.allocationId, allocs.map((a: any) => a.id))).limit(1);
      if (settled.length > 0) throw new ChargebackLedgerError('REVISION_AFTER_SETTLEMENT_NOT_SUPPORTED', 'Já há recuperação/baixa registrada: a revisão da divisão não é suportada nesta etapa.');
      supersedes = approved.id;
    }
    const open = await tx.select({ id: chargebackDecisions.id }).from(chargebackDecisions).where(and(eq(chargebackDecisions.chargebackId, cb.id), eq(chargebackDecisions.status, 'PROPOSED'))).limit(1);
    if (open.length > 0) throw new ChargebackLedgerError('PROPOSAL_ALREADY_OPEN', 'Já existe uma proposta aberta para este chargeback: aprove ou rejeite antes de propor outra.');
    const [maxV] = await tx.select({ v: sql<number>`coalesce(max(${chargebackDecisions.version}), 0)` }).from(chargebackDecisions).where(eq(chargebackDecisions.chargebackId, cb.id));
    const version = Number(maxV?.v ?? 0) + 1;
    const id = newId('cbd');
    await tx.insert(chargebackDecisions).values({
      id, chargebackId: cb.id, version, status: 'PROPOSED', causeCode: input.causeCode, causeDetail: input.causeDetail ?? null, rationale, partiesHeard, contractBasis: input.contractBasis ?? null,
      evidenceIdsJson: [...new Set(input.evidenceIds)].sort(), evidenceHash, supersedesDecisionId: supersedes, revisionReason: supersedes ? String(input.revisionReason).trim() : null, proposedBy: input.actorUserId, createdAt: new Date(),
    });
    for (const p of prepared) await tx.insert(chargebackDecisionLines).values({ id: newId('cbl'), decisionId: id, allocationId: p.allocationId, partyType: p.partyType, partyRef: p.partyRef, contractReference: p.contractReference, amount: p.amount });
    await tx.insert(auditLogs).values({ id: newId('aud'), actorUserId: input.actorUserId, action: 'ledger.chargeback.decision_proposed', resource: 'chargeback_decision', resourceId: id, detailsJson: { chargebackId: cb.id, version, causeCode: input.causeCode, supersedes, evidenceHash, lines: prepared.map((p) => [p.allocationId, p.partyType, p.partyRef, p.amount]) }, createdAt: new Date() });
    return { decisionId: id, version, supersedes };
  });
}

export async function rejectChargebackDecision(input: { decisionId: string; actorUserId: string; reason: string }): Promise<void> {
  const db: any = getDb(); if (!db) throw new Error('Banco de dados indisponível.');
  if (String(input.reason ?? '').trim().length < 10) throw new ChargebackLedgerError('REASON_REQUIRED', 'Informe o motivo da rejeição (mínimo 10 caracteres).');
  await db.transaction(async (tx: any) => {
    await requireRole(tx, input.actorUserId, ['GLOBAL_ADMIN'], 'Rejeitar decisão');
    const [d] = await tx.select().from(chargebackDecisions).where(eq(chargebackDecisions.id, input.decisionId)).for('update').limit(1);
    if (!d) throw new ChargebackLedgerError('DECISION_NOT_FOUND', 'Decisão não encontrada.');
    if (d.status !== 'PROPOSED') throw new ChargebackLedgerError('INVALID_STATE', `Decisão em ${d.status}.`);
    await tx.update(chargebackDecisions).set({ status: 'REJECTED' }).where(eq(chargebackDecisions.id, d.id));
    await tx.insert(auditLogs).values({ id: newId('aud'), actorUserId: input.actorUserId, action: 'ledger.chargeback.decision_rejected', resource: 'chargeback_decision', resourceId: d.id, detailsJson: { reason: input.reason.trim(), chargebackId: d.chargebackId, version: d.version }, createdAt: new Date() });
  });
}

export async function approveChargebackDecision(input: { decisionId: string; actorUserId: string }): Promise<{ decisionId: string; version: number; events: number }> {
  const db: any = getDb(); if (!db) throw new Error('Banco de dados indisponível.');
  let stage: LedgerStage | undefined; let chargebackId = ''; let decisionId = ''; let allocationIds: string[] = [];
  const result = await db.transaction(async (tx: any) => {
    await requireRole(tx, input.actorUserId, ['GLOBAL_ADMIN'], 'Aprovar decisão');
    const [peek] = await tx.select().from(chargebackDecisions).where(eq(chargebackDecisions.id, input.decisionId)).limit(1);
    if (!peek) throw new ChargebackLedgerError('DECISION_NOT_FOUND', 'Decisão não encontrada.');
    await lockChargeback(tx, peek.chargebackId);
    const [d] = await tx.select().from(chargebackDecisions).where(eq(chargebackDecisions.id, input.decisionId)).for('update').limit(1);
    if (d.status !== 'PROPOSED') throw new ChargebackLedgerError('INVALID_STATE', `Decisão em ${d.status}: só uma proposta pode ser aprovada.`);
    if (d.proposedBy === input.actorUserId) throw new ChargebackLedgerError('FOUR_EYES', 'Quem propõe não pode aprovar a própria decisão.');
    const [cb] = await tx.select().from(paymentChargebacks).where(eq(paymentChargebacks.id, d.chargebackId)).limit(1);
    if (!cb || cb.localStatus !== 'lost') throw new ChargebackLedgerError('CHARGEBACK_NOT_LOST', 'O chargeback deixou de estar perdido: a proposta perdeu o fundamento.');
    const allocs = await tx.select().from(chargebackAllocations).where(eq(chargebackAllocations.chargebackId, d.chargebackId));
    await assertNoConflictOfInterest(tx, input.actorUserId, allocs.map((a: any) => a.orderId));
    const lines = await tx.select().from(chargebackDecisionLines).where(eq(chargebackDecisionLines.decisionId, d.id));
    // teto cumulativo do vendedor: serializa por pedido (ordem estável) e reconfere contra o que OUTRAS decisões aprovadas já atribuíram desde a proposta
    for (const oid of [...new Set<string>(allocs.map((a: any) => a.orderId))].sort()) await lockOrderForCap(tx, oid);
    const sellerByAllocApprove = new Map<string, bigint>();
    for (const l of lines) if (l.partyType === 'SELLER') sellerByAllocApprove.set(l.allocationId, (sellerByAllocApprove.get(l.allocationId) ?? 0n) + toMicros(l.amount));
    await assertSellerCap(tx, d.chargebackId, sellerByAllocApprove);
    if (d.supersedesDecisionId) {
      const settled = await tx.select({ id: chargebackRecoveries.id }).from(chargebackRecoveries).where(inArray(chargebackRecoveries.allocationId, allocs.map((a: any) => a.id))).limit(1);
      if (settled.length > 0) throw new ChargebackLedgerError('REVISION_AFTER_SETTLEMENT_NOT_SUPPORTED', 'Já há recuperação/baixa registrada: a revisão não é suportada.');
      await tx.update(chargebackDecisions).set({ status: 'SUPERSEDED' }).where(and(eq(chargebackDecisions.id, d.supersedesDecisionId), eq(chargebackDecisions.status, 'APPROVED')));
    }
    await tx.update(chargebackDecisions).set({ status: 'APPROVED', approvedBy: input.actorUserId, approvedAt: new Date() }).where(eq(chargebackDecisions.id, d.id));
    await tx.insert(auditLogs).values({ id: newId('aud'), actorUserId: input.actorUserId, action: 'ledger.chargeback.decision_approved', resource: 'chargeback_decision', resourceId: d.id, detailsJson: { chargebackId: d.chargebackId, version: d.version, causeCode: d.causeCode, proposedBy: d.proposedBy, evidenceHash: d.evidenceHash, supersedes: d.supersedesDecisionId ?? null }, createdAt: new Date() });

    allocationIds = [...new Set<string>(lines.map((l: any) => l.allocationId))].sort();
    const items: EnqueueInput[] = [];
    for (const aid of allocationIds) {
      const a = allocs.find((x: any) => x.id === aid);
      const [order] = await tx.select().from(orders).where(eq(orders.id, a.orderId)).limit(1);
      items.push({ eventType: 'CHARGEBACK_ALLOCATED', order, paymentId: a.paymentId, purchaseGroupId: order.purchaseGroupId ?? null, chargebackSubjectId: `${d.id}:${aid}`, occurredAt: new Date(), source: 'chargeback_service' });
    }
    stage = await stageLedgerEventsInTx(tx, items);
    chargebackId = d.chargebackId; decisionId = d.id;
    return { decisionId: d.id, version: d.version, events: items.length };
  });
  await flushChargebackStage(stage, async () => {
    for (const aid of allocationIds) {
      const r = await FinancialLedgerService.recordChargebackAllocated({ decisionId, allocationId: aid, source: 'chargeback_service' });
      if (!r.posted) logger.warn({ decisionId, allocationId: aid, reason: r.reason, detail: r.detail }, '[ShadowLedger] recordChargebackAllocated ignorado — fluxo real não afetado');
    }
  });
  void chargebackId;
  return result;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// (4) recuperação externa / baixa de reclamação de terceiro
// ---------------------------------------------------------------------------------------------------------------------------------------------------------
export async function recordChargebackRecovery(input: {
  allocationId: string; kind: 'RECOVERY' | 'WRITE_OFF'; partyRef: string; amount: string | number; evidenceRef: string; reason: string; actorUserId: string; idempotencyKey: string;
}): Promise<{ recoveryId: string; alreadyRecorded: boolean }> {
  const db: any = getDb(); if (!db) throw new Error('Banco de dados indisponível.');
  const evidenceRef = String(input.evidenceRef ?? '').trim(); const reason = String(input.reason ?? '').trim(); const key = String(input.idempotencyKey ?? '').trim(); const partyRef = String(input.partyRef ?? '').trim();
  if (input.kind !== 'RECOVERY' && input.kind !== 'WRITE_OFF') throw new ChargebackLedgerError('INVALID_KIND', 'kind deve ser RECOVERY ou WRITE_OFF.');
  if (evidenceRef.length < 5) throw new ChargebackLedgerError('EVIDENCE_REQUIRED', 'Informe a referência da evidência (mínimo 5 caracteres).');
  if (reason.length < 10) throw new ChargebackLedgerError('REASON_REQUIRED', 'Informe a justificativa (mínimo 10 caracteres).');
  if (!key) throw new ChargebackLedgerError('IDEMPOTENCY_KEY_REQUIRED', 'Informe idempotencyKey.');
  if (!partyRef) throw new ChargebackLedgerError('PARTY_REQUIRED', 'Informe o terceiro.');
  let amt: bigint; try { amt = toMicros(String(input.amount)); } catch { throw new ChargebackLedgerError('INVALID_AMOUNT', 'Valor inválido.'); }
  if (amt <= 0n || amt % 10000n !== 0n) throw new ChargebackLedgerError('INVALID_AMOUNT', 'O valor deve ser positivo com no máximo 2 casas decimais.');

  let stage: LedgerStage | undefined; let recoveryId = '';
  const out = await db.transaction(async (tx: any) => {
    await requireRole(tx, input.actorUserId, ['GLOBAL_ADMIN'], 'Registrar recuperação/baixa');
    const [alloc] = await tx.select().from(chargebackAllocations).where(eq(chargebackAllocations.id, input.allocationId)).limit(1);
    if (!alloc) throw new ChargebackLedgerError('ALLOCATION_NOT_FOUND', 'Alocação não encontrada.');
    await lockChargeback(tx, alloc.chargebackId);
    const [order] = await tx.select().from(orders).where(eq(orders.id, alloc.orderId)).limit(1);
    const eventType = input.kind === 'RECOVERY' ? 'CHARGEBACK_RECOVERY' : 'CHARGEBACK_WRITE_OFF';
    const [existing] = await tx.select().from(chargebackRecoveries).where(eq(chargebackRecoveries.idempotencyKey, key)).limit(1);
    if (existing) {
      if (existing.allocationId !== alloc.id || existing.kind !== input.kind || toMicros(existing.amount) !== amt || existing.partyRef !== partyRef) throw new ChargebackLedgerError('IDEMPOTENCY_CONFLICT', 'A idempotencyKey já foi usada para outro registro.');
      recoveryId = existing.id;
      stage = await stageLedgerEventsInTx(tx, [{ eventType: existing.kind === 'RECOVERY' ? 'CHARGEBACK_RECOVERY' : 'CHARGEBACK_WRITE_OFF', order, paymentId: alloc.paymentId, purchaseGroupId: order.purchaseGroupId ?? null, chargebackSubjectId: existing.id, occurredAt: existing.createdAt, source: 'chargeback_service' }]);
      return { recoveryId: existing.id, alreadyRecorded: true };
    }
    const [dec] = await tx.select().from(chargebackDecisions).where(and(eq(chargebackDecisions.chargebackId, alloc.chargebackId), eq(chargebackDecisions.status, 'APPROVED'))).limit(1);
    if (!dec) throw new ChargebackLedgerError('NO_APPROVED_DECISION', 'Não há decisão aprovada: nada a recuperar nem a baixar.');
    const lines = await tx.select().from(chargebackDecisionLines).where(and(eq(chargebackDecisionLines.decisionId, dec.id), eq(chargebackDecisionLines.allocationId, alloc.id), eq(chargebackDecisionLines.partyType, 'THIRD_PARTY'), eq(chargebackDecisionLines.partyRef, partyRef)));
    if (lines.length === 0) throw new ChargebackLedgerError('NO_THIRD_PARTY_RECEIVABLE', 'A decisão aprovada não tem recebível de terceiro com este identificador (a cobrança do vendedor pela carteira real não existe nesta etapa).');
    const receivable = lines.reduce((s: bigint, l: any) => s + toMicros(l.amount), 0n);
    const prior = await tx.select({ amount: chargebackRecoveries.amount }).from(chargebackRecoveries).where(and(eq(chargebackRecoveries.allocationId, alloc.id), eq(chargebackRecoveries.partyRef, partyRef)));
    const settled = prior.reduce((s: bigint, r: any) => s + toMicros(r.amount), 0n);
    if (settled + amt > receivable) throw new ChargebackLedgerError('EXCEEDS_RECEIVABLE', `Recuperação/baixa acumulada (${fromMicros(settled + amt)}) excede o recebível do terceiro (${fromMicros(receivable)}).`);
    const id = newId('cbr');
    await tx.insert(chargebackRecoveries).values({ id, allocationId: alloc.id, decisionId: dec.id, kind: input.kind, partyRef, amount: formatMicros(amt, 2), currency: alloc.currency, evidenceRef, reason, performedBy: input.actorUserId, idempotencyKey: key, createdAt: new Date() });
    await tx.insert(auditLogs).values({ id: newId('aud'), actorUserId: input.actorUserId, action: `ledger.chargeback.${input.kind === 'RECOVERY' ? 'recovery' : 'write_off'}`, resource: 'chargeback_recovery', resourceId: id, detailsJson: { allocationId: alloc.id, decisionId: dec.id, partyRef, amount: formatMicros(amt, 2), evidenceRef, reason }, createdAt: new Date() });
    stage = await stageLedgerEventsInTx(tx, [{ eventType, order, paymentId: alloc.paymentId, purchaseGroupId: order.purchaseGroupId ?? null, chargebackSubjectId: id, occurredAt: new Date(), source: 'chargeback_service' }]);
    recoveryId = id;
    return { recoveryId: id, alreadyRecorded: false };
  });
  await flushChargebackStage(stage, async () => {
    const r = await FinancialLedgerService.recordChargebackRecovery({ recoveryId, source: 'chargeback_service' });
    if (!r.posted) logger.warn({ recoveryId, reason: r.reason, detail: r.detail }, '[ShadowLedger] recordChargebackRecovery ignorado — fluxo real não afetado');
  });
  return out;
}
