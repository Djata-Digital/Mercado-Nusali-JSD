/**
 * LEDGER SOMBRA — E2: runner de linha de comando do worker do outbox (+ reconciliação opcional). Pensado para um Render Cron Job (ex.: a cada 5 minutos):
 *   npm run jobs:ledger-outbox                 → processa o outbox (eventos pendentes/em retry/com lease vencido)
 *   npm run jobs:ledger-outbox -- --reconcile  → processa e reconcilia ledger × pedidos × outbox (somente leitura sobre o ledger)
 * Seguro por desenho: idempotente, várias instâncias podem rodar ao mesmo tempo (SKIP LOCKED + lease), não movimenta dinheiro real, e sem
 * LEDGER_OUTBOX_ENABLED=true (e LEDGER_SHADOW_CUTOFF_AT) não faz nada (status DISABLED, sem tocar no banco). Exit 0 mesmo com eventos em intervenção (isso é um alerta, não uma falha do job); exit 1 em falha do próprio job.
 * Nada foi configurado no Render por esta fase — o passo operacional está no relatório.
 */
import 'dotenv/config';
import { runLedgerShadowJobOnce } from '../src/server/modules/ledger/outbox/ledgerOutboxJob.js';
import { isOutboxEnabled } from '../src/server/modules/ledger/outbox/outboxEvents.js';
import { getDbPool } from '../src/db/index.js';

async function main() {
  // Portão da flag ANTES de qualquer acesso ao banco: desligada = sai com sucesso sem fazer nada (o Cron pode existir sem risco).
  if (!isOutboxEnabled()) {
    console.log(JSON.stringify({ status: 'DISABLED', reason: 'LEDGER_OUTBOX_DISABLED', claimed: 0, swept: 0 }, null, 2));
    return;
  }
  if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.trim()) throw new Error('DATABASE_URL não configurada — o runner recusa executar sem um banco real explícito.');
  const reconcile = process.argv.includes('--reconcile');
  const r = await runLedgerShadowJobOnce({ reconcile, triggeredBy: 'cron' });
  console.log(JSON.stringify({
    status: r.outbox.status, claimed: r.outbox.claimed, swept: r.outbox.swept, outcomes: r.outbox.outcomes, durationMs: r.outbox.durationMs,
    metrics: r.metrics, reconciliation: r.reconciliation, attentionRequired: r.attentionRequired,
  }, null, 2));
}

main()
  .then(async () => { await getDbPool()?.end().catch(() => {}); process.exit(0); })
  .catch(async (err) => { console.error('LEDGER_OUTBOX_RUNNER_FAILED:', err?.message ?? err); await getDbPool()?.end().catch(() => {}); process.exit(1); });
