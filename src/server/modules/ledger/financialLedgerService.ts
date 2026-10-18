/**
 * FinancialLedgerService — Fase 5A (fundação / shadow).
 *
 * ADR resumido (ver artefato da Fase 4B para o projeto completo):
 *   - Ledger de dupla entrada é a fonte financeira; escrow/wallet continuam como
 *     estado operacional/projeção — nenhum dos dois é tocado por este serviço nesta
 *     fase (ver seção 15/16 do pedido da Fase 5A).
 *   - Todo evento financeiro passa por AQUI, nunca por um UPDATE de saldo solto em
 *     outro arquivo — é o que torna idempotência, lock e dupla entrada verificáveis
 *     num único lugar.
 *   - SHADOW MODE: os dois métodos públicos abaixo NUNCA lançam para o chamador em
 *     condição de negócio esperada (dado ausente, pedido antigo, moeda divergente)
 *     — devolvem um resultado com `skipped`/`reason` para o chamador registrar e
 *     seguir o fluxo legado normalmente. Só erros de programação (bug real) devem
 *     escapar como exceção, e mesmo assim o integrador em paymentService.ts captura
 *     tudo por segurança (ver seção G do relatório).
 */
import { getDb } from '../../../db/index.js';
import {
  ledgerAccounts,
  ledgerTransactions,
  ledgerEntries,
  orders,
  refunds,
  escrowAccounts,
  shippingCostReversals,
  paymentChargebacks,
  chargebackAllocations,
  chargebackDecisions,
  chargebackDecisionLines,
  chargebackRecoveries,
} from '../../../db/schema.js';
import { and, eq } from 'drizzle-orm';
import { logger } from '../../infra/logger.js';
import { netBalanceByCurrency, isZeroMicros } from './decimal.js';
import { ACCOUNT_DEFINITIONS, PLATFORM_POOLED_ACCOUNTS, ledgerAccountId, type LedgerAccountCode, type LedgerOwnerType } from './accounts.js';
import { buildDeliveryConfirmedEntries } from './deliveryConfirmedEntries.js';
import { buildRefundProcessedEntries, type ReleaseStage } from './refundProcessedEntries.js';
import { buildShippingCostReversalEntries } from './shippingReversalEntries.js';
import { buildChargebackConfirmedEntries, buildChargebackAllocatedEntries, buildChargebackRecoveryEntries } from './chargebackEntries.js';
import { isUniqueViolationOf } from './pgErrors.js';
import type { LedgerSkipReason, LedgerResult } from './types.js';

export type { LedgerSkipReason, LedgerResult } from './types.js';

/**
 * Cutoff da Fase 5A (pedido, seção 18/"DADOS ANTIGOS"): pedidos criados antes desta
 * data nunca entram no ledger, mesmo que algum fluxo legado re-dispare confirmação
 * de pagamento/entrega sobre eles (ex.: reprocessamento manual de um pedido antigo).
 * Os 46 pedidos reais auditados na Fase 3B são todos anteriores a este valor.
 *
 * FAIL-SAFE (Fase 5A.2, corrige achado da Fase 5A.1): esta constante NÃO tem mais
 * fallback hardcoded por data. Uma data fixa "vence" sozinha — a partir do dia que
 * ela representa, o shadow ledger passa a gravar automaticamente, sem nenhuma
 * decisão explícita de ninguém. `null` (env ausente OU env presente mas não é um
 * timestamp ISO válido) significa "shadow ledger OFF": os dois métodos públicos
 * abaixo retornam SHADOW_LEDGER_DISABLED sem tocar no banco. Só liga quando
 * LEDGER_SHADOW_CUTOFF_AT é configurada explicitamente com um timestamp ISO válido
 * — nunca em development nem em production por default.
 *
 * Comportamento escolhido para env presente mas inválida (não parseável como data):
 * tratar como ausente (OFF), nunca como "usar algum outro valor" ou lançar exceção
 * no boot — um typo na env var de um serviço em shadow mode não pode derrubar o
 * processo nem, pior, silenciosamente cair para uma data adivinhada. OFF é sempre
 * o lado seguro aqui, porque o shadow ledger é estritamente aditivo/best-effort:
 * ficar OFF nunca quebra o fluxo real (paymentService.ts já trata cada chamada
 * dentro de try/catch), só atrasa quando os dados passam a ser espelhados.
 */
// Função pura (sem I/O) — separada da leitura de process.env especificamente para
// ser testável sem precisar reiniciar o processo/reimportar o módulo a cada
// variação de env (ver scratch/test-fase5a2-shadow-gate.ts, testes A/B/C/D).
export function parseShadowCutoff(raw: string | undefined): { cutoff: Date | null; invalidRaw?: string } {
  if (!raw) return { cutoff: null };
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return { cutoff: null, invalidRaw: raw };
  return { cutoff: parsed };
}

const shadowCutoffConfig = parseShadowCutoff(process.env.LEDGER_SHADOW_CUTOFF_AT);
const LEDGER_SHADOW_CUTOFF_AT: Date | null = shadowCutoffConfig.cutoff;

if (shadowCutoffConfig.invalidRaw !== undefined) {
  // Nunca logamos o valor cru como "segredo" (não é um) — mas também não há razão
  // para logar mais do que o necessário para diagnosticar o typo.
  logger.error(
    { rawLength: shadowCutoffConfig.invalidRaw.length },
    'Shadow Ledger: DISABLED — LEDGER_SHADOW_CUTOFF_AT está definida mas não é um timestamp ISO válido; tratando como ausente (lado seguro).'
  );
} else if (LEDGER_SHADOW_CUTOFF_AT) {
  logger.info(`Shadow Ledger: ENABLED from ${LEDGER_SHADOW_CUTOFF_AT.toISOString()}`);
} else {
  logger.warn('Shadow Ledger: DISABLED (LEDGER_SHADOW_CUTOFF_AT não configurada)');
}

interface DraftEntry {
  accountCode: LedgerAccountCode;
  ownerType: LedgerOwnerType;
  ownerId: string | null;
  direction: 'DEBIT' | 'CREDIT';
  amount: string; // decimal string, sempre > 0
  currency: string;
  dimensions?: Record<string, unknown> | null;
  orderId?: string | null;
  sellerId?: string | null;
  storeId?: string | null;
  buyerId?: string | null;
  countryCode?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
}

interface PostTransactionInput {
  type: string;
  idempotencyKey: string;
  currency: string;
  occurredAt: Date;
  orderId?: string | null;
  paymentId?: string | null;
  escrowId?: string | null;
  payoutId?: string | null;
  refundId?: string | null;
  disputeId?: string | null;
  sellerId?: string | null;
  storeId?: string | null;
  buyerId?: string | null;
  countryCode?: string | null;
  performedBy?: string | null;
  source?: string | null;
  reason?: string | null;
  correlationId?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown> | null;
  entries: DraftEntry[];
}

/**
 * Estado do ledger sombra (somente leitura): ligado/desligado e o cutoff em vigor. O outbox (E2) usa isto para respeitar EXATAMENTE a mesma regra de
 * elegibilidade do ledger — nunca duplica a leitura da variável de ambiente. Aceita `override` só para testes unitários.
 */
export interface ShadowLedgerStatus { enabled: boolean; cutoff: Date | null }

export class FinancialLedgerService {
  static getShadowStatus(): ShadowLedgerStatus {
    return { enabled: LEDGER_SHADOW_CUTOFF_AT !== null, cutoff: LEDGER_SHADOW_CUTOFF_AT };
  }

  /**
   * Núcleo comum de postagem — usado pelos dois eventos desta fase. Não é exportado
   * fora do módulo porque toda transação precisa nascer de um evento de negócio
   * nomeado (recordPaymentReceived, recordDeliveryConfirmed, ...), nunca de entries
   * soltas montadas por um chamador externo.
   */
  private static async postTransaction(input: PostTransactionInput): Promise<LedgerResult> {
    const db = getDb();
    if (!db) {
      return { posted: false, skipped: true, reason: 'DATABASE_UNAVAILABLE' };
    }

    if (input.entries.length < 2) {
      throw new Error(`LEDGER_INVALID_TRANSACTION: transação "${input.type}" precisa de pelo menos 2 entries, recebeu ${input.entries.length}.`);
    }

    // Validação de balanceamento ANTES de tocar o banco — defesa em profundidade.
    // O trigger DEFERRABLE no Postgres é quem garante isso de verdade (não pode ser
    // contornado por um bug futuro nesta função), mas falhar cedo aqui, em memória,
    // com BigInt em vez de Number, evita até abrir a transação por engano.
    const netByCurrency = netBalanceByCurrency(input.entries);
    for (const [currency, net] of netByCurrency) {
      if (!isZeroMicros(net)) {
        throw new Error(`LEDGER_UNBALANCED: transação "${input.type}" (idempotencyKey=${input.idempotencyKey}) não balanceia em ${currency}.`);
      }
      if (currency !== input.currency && netByCurrency.size === 1) {
        // moeda declarada da transaction diverge da única moeda presente nas entries
        throw new Error(`LEDGER_CURRENCY_MISMATCH: transação declarada em ${input.currency} mas entries estão em ${currency}.`);
      }
    }
    if (netByCurrency.size > 1) {
      throw new Error(`LEDGER_MULTI_CURRENCY_NOT_SUPPORTED: transação "${input.type}" tem entries em mais de uma moeda (${Array.from(netByCurrency.keys()).join(', ')}) — não suportado nesta fase.`);
    }

    return await db.transaction(async (tx) => {
      // 1. Idempotência — antes de qualquer INSERT.
      const existing = await tx.select().from(ledgerTransactions).where(eq(ledgerTransactions.idempotencyKey, input.idempotencyKey)).limit(1);
      if (existing.length > 0) {
        logger.info({ idempotencyKey: input.idempotencyKey, transactionId: existing[0].id }, '[FinancialLedgerService] idempotent replay, nada gravado novamente');
        return { posted: existing[0].status === 'POSTED', transactionId: existing[0].id, idempotentReplay: true };
      }

      // 2. Contas: get-or-create livre de corrida (ON CONFLICT DO NOTHING + re-select,
      // mesmo padrão validado na Fase 4A para wallets).
      const accountIds = new Map<string, string>();
      for (const entry of input.entries) {
        const key = `${entry.accountCode}:${entry.ownerType}:${entry.ownerId ?? ''}:${entry.currency}`;
        if (accountIds.has(key)) continue;
        const isPooled = PLATFORM_POOLED_ACCOUNTS.has(entry.accountCode);
        const effectiveOwnerType: LedgerOwnerType = isPooled ? 'PLATFORM' : entry.ownerType;
        const effectiveOwnerId = isPooled ? null : entry.ownerId;
        const id = ledgerAccountId(entry.accountCode, effectiveOwnerType, effectiveOwnerId, entry.currency);
        const def = ACCOUNT_DEFINITIONS[entry.accountCode];

        const found = await tx.select().from(ledgerAccounts).where(eq(ledgerAccounts.id, id)).limit(1);
        if (found.length === 0) {
          await tx
            .insert(ledgerAccounts)
            .values({
              id,
              code: entry.accountCode,
              ownerType: effectiveOwnerType,
              ownerId: effectiveOwnerId,
              currency: entry.currency,
              normalBalance: def.normalBalance,
              isClearing: def.isClearing,
              createdAt: new Date(),
            })
            .onConflictDoNothing({ target: ledgerAccounts.id });
        }
        accountIds.set(key, id);
      }

      // 3. Transaction como DRAFT.
      const transactionId = `ltx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      await tx.insert(ledgerTransactions).values({
        id: transactionId,
        type: input.type,
        status: 'DRAFT',
        currency: input.currency,
        orderId: input.orderId ?? null,
        paymentId: input.paymentId ?? null,
        escrowId: input.escrowId ?? null,
        payoutId: input.payoutId ?? null,
        refundId: input.refundId ?? null,
        disputeId: input.disputeId ?? null,
        sellerId: input.sellerId ?? null,
        storeId: input.storeId ?? null,
        buyerId: input.buyerId ?? null,
        countryCode: input.countryCode ?? null,
        idempotencyKey: input.idempotencyKey,
        performedBy: input.performedBy ?? null,
        source: input.source ?? null,
        reason: input.reason ?? null,
        correlationId: input.correlationId ?? null,
        requestId: input.requestId ?? null,
        metadataJson: input.metadata ?? null,
        occurredAt: input.occurredAt,
        createdAt: new Date(),
      });

      // 4. Entries.
      let seq = 0;
      for (const entry of input.entries) {
        const key = `${entry.accountCode}:${entry.ownerType}:${entry.ownerId ?? ''}:${entry.currency}`;
        const accountId = accountIds.get(key)!;
        seq += 1;
        await tx.insert(ledgerEntries).values({
          id: `lent_${Date.now()}_${seq}_${Math.random().toString(36).substring(2, 6)}`,
          transactionId,
          accountId,
          lineNumber: seq,
          direction: entry.direction,
          amount: entry.amount,
          currency: entry.currency,
          dimensions: entry.dimensions ?? null,
          orderId: entry.orderId ?? null,
          sellerId: entry.sellerId ?? null,
          storeId: entry.storeId ?? null,
          buyerId: entry.buyerId ?? null,
          countryCode: entry.countryCode ?? null,
          referenceType: entry.referenceType ?? null,
          referenceId: entry.referenceId ?? null,
          createdAt: new Date(),
        });
      }

      // 5. POSTED — dispara o constraint trigger diferido de balanceamento no commit.
      await tx.update(ledgerTransactions).set({ status: 'POSTED' }).where(eq(ledgerTransactions.id, transactionId));

      return { posted: true, transactionId };
    }).catch(async (err: any) => {
      // Corrida genuína: duas chamadas concorrentes com a MESMA idempotencyKey nova.
      // Uma delas ganha o INSERT; a outra esbarra no índice único e cai aqui — em vez
      // de propagar o erro cru, devolve o resultado já commitado pela vencedora.
      // O erro do Postgres chega embrulhado (DrizzleQueryError: SQLSTATE e constraint em err.cause). Só a violação do índice ÚNICO de idempotência
      // desta transação é "replay"; qualquer outro erro (outra constraint, deadlock, conexão, tabela inexistente…) é propagado intacto.
      if (isUniqueViolationOf(err, 'ledger_transactions_idempotency_uq')) {
        const winner = await db.select().from(ledgerTransactions).where(eq(ledgerTransactions.idempotencyKey, input.idempotencyKey)).limit(1);
        if (winner.length > 0) {
          logger.info({ idempotencyKey: input.idempotencyKey, transactionId: winner[0].id }, '[FinancialLedgerService] corrida concorrente resolvida como idempotent replay');
          return { posted: winner[0].status === 'POSTED', transactionId: winner[0].id, idempotentReplay: true } as LedgerResult;
        }
      }
      throw err;
    });
  }

  // ==========================================================================
  // PAYMENT_RECEIVED
  // ==========================================================================
  static async recordPaymentReceived(input: {
    orderId: string;
    performedBy?: string | null;
    source?: string | null;
    correlationId?: string | null;
    requestId?: string | null;
    occurredAt?: Date;
  }): Promise<LedgerResult> {
    const db = getDb();
    if (!db) return { posted: false, skipped: true, reason: 'DATABASE_UNAVAILABLE' };

    if (LEDGER_SHADOW_CUTOFF_AT === null) {
      return { posted: false, skipped: true, reason: 'SHADOW_LEDGER_DISABLED', detail: 'LEDGER_SHADOW_CUTOFF_AT não configurada — shadow ledger está OFF.' };
    }

    const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
    if (!order) return { posted: false, skipped: true, reason: 'ORDER_NOT_FOUND' };

    if (order.createdAt < LEDGER_SHADOW_CUTOFF_AT) {
      return { posted: false, skipped: true, reason: 'LEGACY_ORDER', detail: `order.createdAt (${order.createdAt.toISOString()}) < cutoff (${LEDGER_SHADOW_CUTOFF_AT.toISOString()})` };
    }

    // Fonte de verdade é SEMPRE o pedido já validado no Postgres — nunca um valor
    // de chamada, e muito menos o frontend (Fase 4A já fechou essa vulnerabilidade
    // em PaymentService; aqui repetimos a mesma disciplina no ledger).
    const amount = order.totalAmount;
    const currency = order.currency;

    if (!amount || Number(amount) <= 0 || !currency) {
      return { posted: false, skipped: true, reason: 'INVALID_SNAPSHOT', detail: 'orders.totalAmount/currency ausente ou inválido' };
    }

    const idempotencyKey = `payment_received:${order.id}`;

    return this.postTransaction({
      type: 'PAYMENT_RECEIVED',
      idempotencyKey,
      currency,
      occurredAt: input.occurredAt ?? new Date(),
      orderId: order.id,
      buyerId: order.buyerId,
      sellerId: order.sellerId ?? null,
      storeId: order.storeId ?? null,
      countryCode: order.countryCode ?? null,
      performedBy: input.performedBy ?? null,
      source: input.source ?? 'payment_service',
      reason: 'Pagamento confirmado — valor retido em custódia (escrow).',
      correlationId: input.correlationId ?? null,
      requestId: input.requestId ?? null,
      metadata: { shadowPhase: '5A' },
      entries: [
        {
          accountCode: 'PAYMENT_CLEARING',
          ownerType: 'PLATFORM',
          ownerId: null,
          direction: 'DEBIT',
          amount,
          currency,
          dimensions: { component: 'PAYMENT' },
          orderId: order.id,
          buyerId: order.buyerId,
          countryCode: order.countryCode ?? null,
          referenceType: 'order',
          referenceId: order.id,
        },
        {
          accountCode: 'BUYER_ESCROW',
          ownerType: 'PLATFORM',
          ownerId: null,
          direction: 'CREDIT',
          amount,
          currency,
          dimensions: { component: 'PAYMENT' },
          orderId: order.id,
          buyerId: order.buyerId,
          countryCode: order.countryCode ?? null,
          referenceType: 'order',
          referenceId: order.id,
        },
      ],
    });
  }

  // ==========================================================================
  // ORDER_DELIVERY_CONFIRMED
  // ==========================================================================
  static async recordDeliveryConfirmed(input: {
    orderId: string;
    performedBy?: string | null;
    source?: string | null;
    correlationId?: string | null;
    requestId?: string | null;
    occurredAt?: Date;
  }): Promise<LedgerResult> {
    const db = getDb();
    if (!db) return { posted: false, skipped: true, reason: 'DATABASE_UNAVAILABLE' };

    if (LEDGER_SHADOW_CUTOFF_AT === null) {
      return { posted: false, skipped: true, reason: 'SHADOW_LEDGER_DISABLED', detail: 'LEDGER_SHADOW_CUTOFF_AT não configurada — shadow ledger está OFF.' };
    }

    const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
    if (!order) return { posted: false, skipped: true, reason: 'ORDER_NOT_FOUND' };

    if (order.createdAt < LEDGER_SHADOW_CUTOFF_AT) {
      return { posted: false, skipped: true, reason: 'LEGACY_ORDER', detail: `order.createdAt (${order.createdAt.toISOString()}) < cutoff` };
    }

    // Nada aqui é recalculado — só o que já está gravado no pedido (Fase 5A, seção
    // 10: "NÃO recalcular com regra atual"). buildDeliveryConfirmedEntries é pura
    // (sem I/O) e testável isoladamente — ver deliveryConfirmedEntries.ts.
    const built = buildDeliveryConfirmedEntries(order);
    if (built.status === 'SKIPPED') {
      return { posted: false, skipped: true, reason: built.reason, detail: built.detail };
    }

    return this.postTransaction({
      type: 'ORDER_DELIVERY_CONFIRMED',
      idempotencyKey: `order_release:${order.id}`,
      currency: order.currency,
      occurredAt: input.occurredAt ?? new Date(),
      orderId: order.id,
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      storeId: order.storeId ?? null,
      countryCode: order.countryCode ?? null,
      performedBy: input.performedBy ?? null,
      source: input.source ?? 'payment_service',
      reason: 'Entrega confirmada — escrow decomposto em comissão, frete e valor líquido do vendedor.',
      correlationId: input.correlationId ?? null,
      requestId: input.requestId ?? null,
      metadata: { shadowPhase: '5A', commissionRateSnapshot: order.commissionRateSnapshot, commissionBase: order.commissionBase, sellerCouponDiscount: order.discountAmount ?? null },
      entries: built.entries as unknown as DraftEntry[],
    });
  }

  // ==========================================================================
  // REFUND_PROCESSED (E3) — reembolso EFETIVAMENTE concluído (refunds.status = 'processed')
  // ==========================================================================
  /**
   * Estágio do reembolso em relação à liberação do Escrow, derivado do fato gravado (escrow_accounts.released_at). Um reembolso nunca ocorre depois de um
   * release E antes dele ao mesmo tempo: o release é bloqueado por escrow 'refunded' e o reembolso pós-release mantém released_at.
   */
  static async deriveReleaseStage(orderId: string): Promise<ReleaseStage | null> {
    const db = getDb();
    if (!db) return null;
    const [es] = await db.select({ releasedAt: escrowAccounts.releasedAt }).from(escrowAccounts).where(eq(escrowAccounts.orderId, orderId)).limit(1);
    if (!es) return null;
    return es.releasedAt ? 'AFTER_RELEASE' : 'BEFORE_RELEASE';
  }

  /**
   * Lança o reembolso de um pedido no ledger sombra. Só reembolso 'processed' (nunca pendente/reservado/falhado). Garante antes o PAYMENT_RECEIVED e, no
   * estágio pós-liberação, o ORDER_DELIVERY_CONFIRMED (idempotentes). Chave: refund_processed:{refundId}. Respeita o cutoff pelo pedido. Surplus (sem pedido) não entra.
   */
  static async recordRefundProcessed(input: {
    refundId: string;
    releaseStage?: ReleaseStage;
    performedBy?: string | null;
    source?: string | null;
    correlationId?: string | null;
    requestId?: string | null;
    occurredAt?: Date;
  }): Promise<LedgerResult> {
    const db = getDb();
    if (!db) return { posted: false, skipped: true, reason: 'DATABASE_UNAVAILABLE' };

    if (LEDGER_SHADOW_CUTOFF_AT === null) {
      return { posted: false, skipped: true, reason: 'SHADOW_LEDGER_DISABLED', detail: 'LEDGER_SHADOW_CUTOFF_AT não configurada — shadow ledger está OFF.' };
    }

    const [refund] = await db.select().from(refunds).where(eq(refunds.id, input.refundId)).limit(1);
    if (!refund) return { posted: false, skipped: true, reason: 'REFUND_NOT_FOUND', detail: `reembolso ${input.refundId} não existe` };
    if (refund.status !== 'processed') return { posted: false, skipped: true, reason: 'REFUND_NOT_PROCESSED', detail: `reembolso ${refund.id} está "${refund.status}" — só reembolso concluído é lançado` };
    if (!refund.orderId) return { posted: false, skipped: true, reason: 'REFUND_NOT_ORDER_LEVEL', detail: 'reembolso de pagamento excedente (sem pedido) não tem lançamento a estornar' };

    const [order] = await db.select().from(orders).where(eq(orders.id, refund.orderId)).limit(1);
    if (!order) return { posted: false, skipped: true, reason: 'ORDER_NOT_FOUND' };
    if (order.createdAt < LEDGER_SHADOW_CUTOFF_AT) {
      return { posted: false, skipped: true, reason: 'LEGACY_ORDER', detail: `order.createdAt (${order.createdAt.toISOString()}) < cutoff` };
    }

    // E5 — perda dobrada: o pedido tem chargeback PERDIDO alocado (o mesmo dinheiro já saiu) => não lança o reembolso por cima; exige revisão humana
    const cbAlloc = await db.select({ id: chargebackAllocations.id }).from(chargebackAllocations).where(and(eq(chargebackAllocations.orderId, order.id), eq(chargebackAllocations.overlapRefund, false))).limit(1);
    if (cbAlloc.length > 0) return { posted: false, skipped: true, reason: 'CHARGEBACK_REFUND_OVERLAP', detail: 'o pedido tem chargeback perdido alocado: lançar o reembolso também contabilizaria a mesma saída de caixa duas vezes' };

    const stage = input.releaseStage ?? (await this.deriveReleaseStage(order.id));
    if (!stage) return { posted: false, skipped: true, reason: 'MISSING_SNAPSHOT', detail: 'Escrow do pedido não encontrado: estágio do reembolso indeterminado.' };

    const built = buildRefundProcessedEntries(order as any, refund as any, stage);
    if (built.status === 'SKIPPED') return { posted: false, skipped: true, reason: built.reason, detail: built.detail };

    const occurredAt = input.occurredAt ?? refund.createdAt ?? new Date();
    const base = { orderId: order.id, occurredAt, source: input.source ?? 'refund_service', correlationId: input.correlationId ?? null, requestId: input.requestId ?? null };
    // pré-requisitos idempotentes: o dinheiro entrou (PAYMENT_RECEIVED) e, se já tinha sido liberado, a liberação também foi contabilizada
    const pre = await this.recordPaymentReceived(base);
    if (!pre.posted) return pre;
    if (stage === 'AFTER_RELEASE') {
      const rel = await this.recordDeliveryConfirmed(base);
      if (!rel.posted) return rel;
    }

    return this.postTransaction({
      type: 'REFUND_PROCESSED',
      idempotencyKey: `refund_processed:${refund.id}`,
      currency: order.currency,
      occurredAt,
      orderId: order.id,
      paymentId: refund.paymentId,
      refundId: refund.id,
      buyerId: order.buyerId,
      sellerId: order.sellerId ?? null,
      storeId: order.storeId ?? null,
      countryCode: order.countryCode ?? null,
      performedBy: input.performedBy ?? refund.approvedBy ?? null,
      source: input.source ?? 'refund_service',
      reason: stage === 'BEFORE_RELEASE'
        ? 'Reembolso concluído antes da liberação — custódia (escrow) devolvida ao comprador.'
        : 'Reembolso concluído após a liberação — vendedor devolve a parte dele, comissão estornada, restante absorvido pela Nusali.',
      correlationId: input.correlationId ?? null,
      requestId: input.requestId ?? null,
      metadata: { shadowPhase: 'E3', releaseStage: stage, refundAmount: refund.amount, sellerDebitAmount: refund.sellerDebitAmount ?? null, parts: built.parts, refundIdempotencyKey: refund.idempotencyKey ?? null },
      entries: built.entries,
    });
  }

  // ==========================================================================
  // SHIPPING_COST_REVERSED (E4) — parcela do custo de frete EFETIVAMENTE devolvida à Nusali, de um pedido reembolsado DEPOIS da liberação
  // ==========================================================================
  /**
   * Lança a reversão registrada em shipping_cost_reversals. Só para pedido reembolsado após a liberação (a entrega já reconheceu o subsídio); garante antes
   * PAYMENT_RECEIVED → ORDER_DELIVERY_CONFIRMED → REFUND_PROCESSED. Chave: shipping_cost_reversed:{reversalId}. Os valores (total e divisão subsídio/absorvido) são os
   * gravados no registro imutável; nada é recalculado.
   */
  static async recordShippingCostReversed(input: {
    reversalId: string;
    performedBy?: string | null;
    source?: string | null;
    correlationId?: string | null;
    requestId?: string | null;
    occurredAt?: Date;
  }): Promise<LedgerResult> {
    const db = getDb();
    if (!db) return { posted: false, skipped: true, reason: 'DATABASE_UNAVAILABLE' };

    if (LEDGER_SHADOW_CUTOFF_AT === null) {
      return { posted: false, skipped: true, reason: 'SHADOW_LEDGER_DISABLED', detail: 'LEDGER_SHADOW_CUTOFF_AT não configurada — shadow ledger está OFF.' };
    }

    const [rev] = await db.select().from(shippingCostReversals).where(eq(shippingCostReversals.id, input.reversalId)).limit(1);
    if (!rev) return { posted: false, skipped: true, reason: 'SHIPPING_REVERSAL_NOT_FOUND', detail: `reversão ${input.reversalId} não existe` };
    const [order] = await db.select().from(orders).where(eq(orders.id, rev.orderId)).limit(1);
    if (!order) return { posted: false, skipped: true, reason: 'ORDER_NOT_FOUND' };
    if (order.createdAt < LEDGER_SHADOW_CUTOFF_AT) {
      return { posted: false, skipped: true, reason: 'LEGACY_ORDER', detail: `order.createdAt (${order.createdAt.toISOString()}) < cutoff` };
    }
    const stage = await this.deriveReleaseStage(order.id);
    if (stage !== 'AFTER_RELEASE') {
      return { posted: false, skipped: true, reason: 'SHIPPING_REVERSAL_NOT_ELIGIBLE', detail: 'a reversão de frete só vale para pedido reembolsado depois da liberação (antes dela o subsídio nunca foi reconhecido)' };
    }

    const built = buildShippingCostReversalEntries(order as any, rev as any);
    if (built.status === 'SKIPPED') return { posted: false, skipped: true, reason: built.reason, detail: built.detail };

    const occurredAt = input.occurredAt ?? rev.createdAt ?? new Date();
    // pré-requisitos idempotentes: o reembolso pós-liberação (que por sua vez garante PR e DC) tem de estar lançado antes
    const pre = await this.recordRefundProcessed({ refundId: rev.refundId, releaseStage: 'AFTER_RELEASE', occurredAt, source: input.source ?? 'shipping_reversal_service', correlationId: input.correlationId ?? null });
    if (!pre.posted) return pre;

    return this.postTransaction({
      type: 'SHIPPING_COST_REVERSED',
      idempotencyKey: `shipping_cost_reversed:${rev.id}`,
      currency: order.currency,
      occurredAt,
      orderId: order.id,
      refundId: rev.refundId,
      buyerId: order.buyerId,
      sellerId: order.sellerId ?? null,
      storeId: order.storeId ?? null,
      countryCode: order.countryCode ?? null,
      performedBy: input.performedBy ?? rev.performedBy ?? null,
      source: input.source ?? 'shipping_reversal_service',
      reason: 'Custo de frete efetivamente devolvido à Nusali — reverte a parcela do subsídio e do frete absorvido (com evidência registrada).',
      correlationId: input.correlationId ?? null,
      requestId: input.requestId ?? null,
      metadata: { shadowPhase: 'E4', evidenceRef: rev.evidenceRef, reversalReason: rev.reason, amount: rev.amount, subsidyPart: rev.subsidyPart, absorbedPart: rev.absorbedPart },
      entries: built.entries,
    });
  }

  // ==========================================================================
  // CHARGEBACKS (E5)
  // ==========================================================================
  /** Estágio da perda em relação à liberação do Escrow é um FATO gravado na alocação (nunca recalculado). */
  private static async chargebackContext(allocationId: string) {
    const db = getDb()!;
    const [alloc] = await db.select().from(chargebackAllocations).where(eq(chargebackAllocations.id, allocationId)).limit(1);
    if (!alloc) return null;
    const [order] = await db.select().from(orders).where(eq(orders.id, alloc.orderId)).limit(1);
    return order ? { alloc, order } : null;
  }

  /** Valor EFETIVAMENTE debitado pelo provedor (chargeback perdido) para UM pedido. Contestação aberta nunca chega aqui. Garante PR (e DC se já liberado). */
  static async recordChargebackConfirmed(input: { allocationId: string; source?: string | null; correlationId?: string | null; occurredAt?: Date }): Promise<LedgerResult> {
    const db = getDb();
    if (!db) return { posted: false, skipped: true, reason: 'DATABASE_UNAVAILABLE' };
    if (LEDGER_SHADOW_CUTOFF_AT === null) return { posted: false, skipped: true, reason: 'SHADOW_LEDGER_DISABLED', detail: 'LEDGER_SHADOW_CUTOFF_AT não configurada — shadow ledger está OFF.' };
    const ctx = await this.chargebackContext(input.allocationId);
    if (!ctx) return { posted: false, skipped: true, reason: 'CHARGEBACK_NOT_FOUND', detail: `alocação ${input.allocationId} não existe` };
    const { alloc, order } = ctx;
    if (order.createdAt < LEDGER_SHADOW_CUTOFF_AT) return { posted: false, skipped: true, reason: 'LEGACY_ORDER', detail: `order.createdAt (${order.createdAt.toISOString()}) < cutoff` };
    const [cb] = await db.select().from(paymentChargebacks).where(eq(paymentChargebacks.id, alloc.chargebackId)).limit(1);
    if (!cb || cb.localStatus !== 'lost') return { posted: false, skipped: true, reason: 'CHARGEBACK_NOT_ELIGIBLE', detail: `chargeback ${alloc.chargebackId} não está perdido ("${cb?.localStatus ?? 'ausente'}") — só o valor efetivamente debitado é lançado` };
    // perda dobrada: o MESMO dinheiro já voltou ao comprador por reembolso concluído => nada é lançado, exige revisão humana
    const refunded = await db.select({ id: refunds.id }).from(refunds).where(and(eq(refunds.orderId, order.id), eq(refunds.status, 'processed'))).limit(1);
    if (alloc.overlapRefund || refunded.length > 0) return { posted: false, skipped: true, reason: 'CHARGEBACK_REFUND_OVERLAP', detail: 'o pedido já tem reembolso concluído: lançar o chargeback também contabilizaria a mesma saída de caixa duas vezes' };
    const built = buildChargebackConfirmedEntries(order as any, alloc as any);
    if (built.status === 'SKIPPED') return { posted: false, skipped: true, reason: built.reason, detail: built.detail };
    const occurredAt = input.occurredAt ?? alloc.createdAt ?? new Date();
    const base = { orderId: order.id, occurredAt, source: input.source ?? 'chargeback_service', correlationId: input.correlationId ?? null };
    const pr = await this.recordPaymentReceived(base); if (!pr.posted) return pr;
    if (alloc.releaseStage === 'AFTER_RELEASE') { const dc = await this.recordDeliveryConfirmed(base); if (!dc.posted) return dc; }
    return this.postTransaction({
      type: 'CHARGEBACK_CONFIRMED', idempotencyKey: `chargeback_confirmed:${alloc.id}`, currency: order.currency, occurredAt, orderId: order.id, paymentId: alloc.paymentId,
      buyerId: order.buyerId, sellerId: order.sellerId ?? null, storeId: order.storeId ?? null, countryCode: order.countryCode ?? null, source: input.source ?? 'chargeback_service',
      reason: alloc.releaseStage === 'BEFORE_RELEASE' ? 'Chargeback perdido antes da liberação — custódia (escrow) devolvida ao emissor.' : 'Chargeback perdido depois da liberação — perda PENDENTE de decisão de responsabilidade (não definitiva).',
      correlationId: input.correlationId ?? null,
      metadata: { shadowPhase: 'E5', chargebackId: alloc.chargebackId, providerChargebackId: cb.providerChargebackId, releaseStage: alloc.releaseStage, allocatedValue: alloc.allocatedValue },
      entries: built.entries,
    });
  }

  /** Decisão de responsabilidade APROVADA (caso a caso, com evidências) para UMA alocação com perda pendente. Revisão = delta contra a versão anterior. */
  static async recordChargebackAllocated(input: { decisionId: string; allocationId: string; source?: string | null; correlationId?: string | null; occurredAt?: Date }): Promise<LedgerResult> {
    const db = getDb();
    if (!db) return { posted: false, skipped: true, reason: 'DATABASE_UNAVAILABLE' };
    if (LEDGER_SHADOW_CUTOFF_AT === null) return { posted: false, skipped: true, reason: 'SHADOW_LEDGER_DISABLED', detail: 'LEDGER_SHADOW_CUTOFF_AT não configurada — shadow ledger está OFF.' };
    const ctx = await this.chargebackContext(input.allocationId);
    if (!ctx) return { posted: false, skipped: true, reason: 'CHARGEBACK_NOT_FOUND', detail: `alocação ${input.allocationId} não existe` };
    const { alloc, order } = ctx;
    if (order.createdAt < LEDGER_SHADOW_CUTOFF_AT) return { posted: false, skipped: true, reason: 'LEGACY_ORDER' };
    const [dec] = await db.select().from(chargebackDecisions).where(eq(chargebackDecisions.id, input.decisionId)).limit(1);
    if (!dec || dec.chargebackId !== alloc.chargebackId) return { posted: false, skipped: true, reason: 'CHARGEBACK_NOT_FOUND', detail: `decisão ${input.decisionId} não existe para este chargeback` };
    if (dec.status !== 'APPROVED' && dec.status !== 'SUPERSEDED') return { posted: false, skipped: true, reason: 'CHARGEBACK_NOT_ELIGIBLE', detail: `decisão ${dec.id} está "${dec.status}" — só decisão APROVADA é lançada` };
    const occurredAt = input.occurredAt ?? dec.approvedAt ?? new Date();
    const base = { source: input.source ?? 'chargeback_service', correlationId: input.correlationId ?? null, occurredAt };
    const conf = await this.recordChargebackConfirmed({ allocationId: alloc.id, ...base }); if (!conf.posted) return conf;
    const loadLines = async (decisionId: string) => (await db.select().from(chargebackDecisionLines).where(and(eq(chargebackDecisionLines.decisionId, decisionId), eq(chargebackDecisionLines.allocationId, alloc.id)))).map((l: any) => ({ partyType: l.partyType, partyRef: l.partyRef ?? null, amount: l.amount }));
    const lines = await loadLines(dec.id);
    let prevLines: any[] | null = null;
    if (dec.supersedesDecisionId) {
      const prevPost = await this.recordChargebackAllocated({ decisionId: dec.supersedesDecisionId, allocationId: alloc.id, ...base }); if (!prevPost.posted) return prevPost;
      prevLines = await loadLines(dec.supersedesDecisionId);
    }
    const built = buildChargebackAllocatedEntries(order as any, alloc as any, lines, prevLines);
    if (built.status === 'SKIPPED') return { posted: false, skipped: true, reason: built.reason, detail: built.detail };
    return this.postTransaction({
      type: 'CHARGEBACK_ALLOCATED', idempotencyKey: `chargeback_allocated:${dec.id}:${alloc.id}`, currency: order.currency, occurredAt, orderId: order.id, paymentId: alloc.paymentId,
      buyerId: order.buyerId, sellerId: order.sellerId ?? null, storeId: order.storeId ?? null, countryCode: order.countryCode ?? null, performedBy: dec.approvedBy ?? null, source: input.source ?? 'chargeback_service',
      reason: `Decisão de responsabilidade v${dec.version} (${dec.causeCode}) aprovada — perda pendente repartida; evidências e fundamentação na decisão.`, correlationId: input.correlationId ?? null,
      metadata: { shadowPhase: 'E5', chargebackId: alloc.chargebackId, decisionId: dec.id, version: dec.version, causeCode: dec.causeCode, evidenceHash: dec.evidenceHash, supersedes: dec.supersedesDecisionId ?? null },
      entries: built.entries,
    });
  }

  /** Recuperação externa efetivamente recebida, ou baixa de reclamação rejeitada/prescrita (ambas com evidência), sobre o recebível de terceiro. */
  static async recordChargebackRecovery(input: { recoveryId: string; source?: string | null; correlationId?: string | null; occurredAt?: Date }): Promise<LedgerResult> {
    const db = getDb();
    if (!db) return { posted: false, skipped: true, reason: 'DATABASE_UNAVAILABLE' };
    if (LEDGER_SHADOW_CUTOFF_AT === null) return { posted: false, skipped: true, reason: 'SHADOW_LEDGER_DISABLED', detail: 'LEDGER_SHADOW_CUTOFF_AT não configurada — shadow ledger está OFF.' };
    const [rec] = await db.select().from(chargebackRecoveries).where(eq(chargebackRecoveries.id, input.recoveryId)).limit(1);
    if (!rec) return { posted: false, skipped: true, reason: 'CHARGEBACK_NOT_FOUND', detail: `recuperação ${input.recoveryId} não existe` };
    const ctx = await this.chargebackContext(rec.allocationId);
    if (!ctx) return { posted: false, skipped: true, reason: 'CHARGEBACK_NOT_FOUND', detail: 'alocação da recuperação não existe' };
    const { alloc, order } = ctx;
    if (order.createdAt < LEDGER_SHADOW_CUTOFF_AT) return { posted: false, skipped: true, reason: 'LEGACY_ORDER' };
    const occurredAt = input.occurredAt ?? rec.createdAt ?? new Date();
    const pre = await this.recordChargebackAllocated({ decisionId: rec.decisionId, allocationId: alloc.id, source: input.source ?? 'chargeback_service', correlationId: input.correlationId ?? null, occurredAt }); if (!pre.posted) return pre;
    const built = buildChargebackRecoveryEntries(order as any, rec as any);
    if (built.status === 'SKIPPED') return { posted: false, skipped: true, reason: built.reason, detail: built.detail };
    const isRecovery = rec.kind === 'RECOVERY';
    return this.postTransaction({
      type: isRecovery ? 'CHARGEBACK_RECOVERY' : 'CHARGEBACK_WRITE_OFF', idempotencyKey: `${isRecovery ? 'chargeback_recovery' : 'chargeback_write_off'}:${rec.id}`, currency: order.currency, occurredAt, orderId: order.id, paymentId: alloc.paymentId,
      buyerId: order.buyerId, sellerId: order.sellerId ?? null, storeId: order.storeId ?? null, countryCode: order.countryCode ?? null, performedBy: rec.performedBy ?? null, source: input.source ?? 'chargeback_service',
      reason: isRecovery ? 'Recuperação externa recebida (com evidência) sobre o recebível de terceiro.' : 'Baixa de reclamação rejeitada/prescrita (com evidência): perda da Nusali.', correlationId: input.correlationId ?? null,
      metadata: { shadowPhase: 'E5', recoveryId: rec.id, decisionId: rec.decisionId, allocationId: alloc.id, evidenceRef: rec.evidenceRef, reason: rec.reason },
      entries: built.entries,
    });
  }
}
