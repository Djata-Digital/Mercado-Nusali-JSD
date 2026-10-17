/**
 * LEDGER SOMBRA — E2: execução periódica (gatilho: Render Cron Job → scripts/run-ledger-outbox.ts, ou POST /internal/jobs/ledger-outbox). Mesmo padrão dos
 * outros jobs do projeto (sem node-cron/setInterval em processo). Não movimenta dinheiro: só processa o outbox (→ ledger_*) e, opcionalmente, reconcilia.
 * Desligado por padrão: sem LEDGER_SHADOW_CUTOFF_AT o worker devolve DISABLED sem tocar no banco.
 */
import { logger } from '../../../infra/logger.js';
import { isOutboxEnabled } from './outboxEvents.js';
import { runLedgerOutboxOnce, getOutboxMetrics, emptyOutcomes, type OutboxRunSummary, type OutboxMetrics } from './outboxService.js';
import { runLedgerReconciliation, getReconciliationMetrics, type ReconcileSummary } from './reconciliationService.js';

export interface LedgerShadowJobResult {
  outbox: OutboxRunSummary;
  metrics: OutboxMetrics | null;
  reconciliation: ReconcileSummary | null;
  reconciliationMetrics: Awaited<ReturnType<typeof getReconciliationMetrics>> | null;
  /** true se há algo que um humano precisa olhar (eventos em NEEDS_INTERVENTION ou divergências CRITICAL abertas) */
  attentionRequired: boolean;
}

/** Resultado inerte (flag desligada): nenhuma consulta ao banco, nenhuma reconciliação. */
function disabledJobResult(): LedgerShadowJobResult {
  const outbox: OutboxRunSummary = { status: 'DISABLED', disabledReason: 'OUTBOX_FLAG_OFF', workerId: 'n/a', swept: 0, claimed: 0, outcomes: emptyOutcomes(), durationMs: 0 };
  return { outbox, metrics: null, reconciliation: null, reconciliationMetrics: null, attentionRequired: false };
}

export async function runLedgerShadowJobOnce(opts: { batchSize?: number; reconcile?: boolean; triggeredBy?: string; env?: Record<string, string | undefined> } = {}): Promise<LedgerShadowJobResult> {
  // Portão da flag ANTES de tudo: a reconciliação (que lê/grava tabelas da 0039) também só roda com o outbox ligado.
  if (!isOutboxEnabled(opts.env ?? process.env)) return disabledJobResult();
  const outbox = await runLedgerOutboxOnce({ batchSize: opts.batchSize, env: opts.env });
  if (outbox.status === 'DISABLED') return { outbox, metrics: null, reconciliation: null, reconciliationMetrics: null, attentionRequired: false };
  const metrics = await getOutboxMetrics();
  const reconciliation = opts.reconcile ? await runLedgerReconciliation({ triggeredBy: opts.triggeredBy ?? 'job' }) : null;
  const reconciliationMetrics = await getReconciliationMetrics();
  const attentionRequired = metrics.needsIntervention > 0 || metrics.staleProcessing > 0 || reconciliationMetrics.open.critical > 0;
  (logger as any)[attentionRequired ? 'error' : 'info'](
    { outboxMetrics: metrics, reconciliationMetrics, attentionRequired },
    attentionRequired ? '[LedgerShadow] ATENÇÃO: há eventos em intervenção/lease vencido ou divergências críticas abertas' : '[LedgerShadow] métricas do ledger sombra'
  );
  return { outbox, metrics, reconciliation, reconciliationMetrics, attentionRequired };
}
