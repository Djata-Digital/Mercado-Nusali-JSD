/**
 * LEDGER SOMBRA — E5: o "assunto" de cada evento de chargeback do outbox (alocação, decisão aprovada por alocação, recuperação/baixa). A MESMA função carrega os campos
 * tanto ao enfileirar (dentro da transação do fato) quanto ao processar (hash do snapshot): o que foi enfileirado é, campo a campo, o que existe agora — senão o evento vai
 * a NEEDS_INTERVENTION, nunca é recalculado. Só campos IMUTÁVEIS entram (o estado do chargeback no provedor, que pode mudar, fica de fora).
 */
import { and, eq } from 'drizzle-orm';
import { chargebackAllocations, chargebackDecisions, chargebackDecisionLines, chargebackRecoveries } from '../../../../db/schema.js';
import { buildOrderSnapshot, type OrderRowForSnapshot } from './outboxEvents.js';

export type ChargebackEventType = 'CHARGEBACK_CONFIRMED' | 'CHARGEBACK_ALLOCATED' | 'CHARGEBACK_RECOVERY' | 'CHARGEBACK_WRITE_OFF';
export const CHARGEBACK_EVENT_TYPES: readonly ChargebackEventType[] = ['CHARGEBACK_CONFIRMED', 'CHARGEBACK_ALLOCATED', 'CHARGEBACK_RECOVERY', 'CHARGEBACK_WRITE_OFF'];
export const isChargebackEvent = (t: string): t is ChargebackEventType => (CHARGEBACK_EVENT_TYPES as readonly string[]).includes(t);

/** subjectId: CONFIRMED = allocationId · ALLOCATED = `${decisionId}:${allocationId}` · RECOVERY/WRITE_OFF = recoveryId. Chaves = as do ledger (UNIQUE no outbox E no ledger). */
export const chargebackEventKey = (type: ChargebackEventType, subjectId: string) =>
  type === 'CHARGEBACK_CONFIRMED' ? `chargeback_confirmed:${subjectId}`
    : type === 'CHARGEBACK_ALLOCATED' ? `chargeback_allocated:${subjectId}`
      : type === 'CHARGEBACK_RECOVERY' ? `chargeback_recovery:${subjectId}`
        : `chargeback_write_off:${subjectId}`;

export interface ChargebackSubject { orderId: string; fields: Record<string, string | null> }

const s = (v: unknown) => (v === null || v === undefined ? null : String(v));

export async function loadChargebackSubject(exec: any, type: ChargebackEventType, subjectId: string): Promise<ChargebackSubject | null> {
  if (type === 'CHARGEBACK_CONFIRMED') {
    const [a] = await exec.select().from(chargebackAllocations).where(eq(chargebackAllocations.id, subjectId)).limit(1);
    if (!a) return null;
    return { orderId: a.orderId, fields: { cbKind: 'ALLOCATION', cbAllocationId: a.id, cbChargebackId: a.chargebackId, cbPaymentId: a.paymentId, cbValue: s(a.allocatedValue), cbCurrency: a.currency, cbOrderTotal: s(a.orderTotal), cbReleaseStage: a.releaseStage, cbOverlapRefund: String(a.overlapRefund) } };
  }
  if (type === 'CHARGEBACK_ALLOCATED') {
    const [decisionId, allocationId] = subjectId.split(':');
    if (!decisionId || !allocationId) return null;
    const [d] = await exec.select().from(chargebackDecisions).where(eq(chargebackDecisions.id, decisionId)).limit(1);
    const [a] = await exec.select().from(chargebackAllocations).where(eq(chargebackAllocations.id, allocationId)).limit(1);
    if (!d || !a) return null;
    const lines = await exec.select().from(chargebackDecisionLines).where(and(eq(chargebackDecisionLines.decisionId, decisionId), eq(chargebackDecisionLines.allocationId, allocationId)));
    const canon = lines.map((l: any) => [l.partyType, l.partyRef ?? '', String(l.amount)].join('|')).sort().join(';');
    return { orderId: a.orderId, fields: { cbKind: 'DECISION', cbDecisionId: d.id, cbVersion: String(d.version), cbCause: d.causeCode, cbSupersedes: s(d.supersedesDecisionId), cbEvidenceHash: d.evidenceHash, cbAllocationId: a.id, cbValue: s(a.allocatedValue), cbLines: canon } };
  }
  const [r] = await exec.select().from(chargebackRecoveries).where(eq(chargebackRecoveries.id, subjectId)).limit(1);
  if (!r) return null;
  const [a] = await exec.select().from(chargebackAllocations).where(eq(chargebackAllocations.id, r.allocationId)).limit(1);
  if (!a) return null;
  return { orderId: a.orderId, fields: { cbKind: r.kind, cbRecoveryId: r.id, cbAllocationId: r.allocationId, cbDecisionId: r.decisionId, cbPartyRef: r.partyRef, cbAmount: s(r.amount), cbCurrency: r.currency } };
}

export function buildChargebackEventSnapshot(order: OrderRowForSnapshot, subject: ChargebackSubject): Record<string, string | null> {
  return { ...buildOrderSnapshot(order, 'ORDER_DELIVERY_CONFIRMED'), ...subject.fields };
}
