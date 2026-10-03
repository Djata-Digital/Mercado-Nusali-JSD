/**
 * FASE D18-C5.2 — runner de linha de comando para o job de expiração de
 * pedidos pending_payment com reserva de estoque vencida. MESMO desenho
 * operacional já real de scripts/run-escrow-auto-release.ts (D18-C4.3):
 * pensado para ser o comando de um Render Cron Job (mesmo tipo de serviço
 * nativo já usado para o auto-release de escrow, sem custo de worker 24/7).
 * Nenhum node-cron/setInterval/BullMQ novo — só chama
 * runPendingPaymentExpirationOnce(), a MESMA função já usada pelo endpoint
 * interno HTTP e pelos testes.
 *
 * Uso: `npm run jobs:expire-pending-payments` (local/manual) ou como o
 * comando de um Render Cron Job (mesmo passo operacional já documentado para
 * jobs:escrow-auto-release — configurar no Render não faz parte desta fase).
 */
import 'dotenv/config';
import { runPendingPaymentExpirationOnce } from '../src/server/modules/orders/pendingPaymentExpirationService.js';
import { getDbPool } from '../src/db/index.js';

async function main() {
  if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.trim()) {
    throw new Error('DATABASE_URL não configurada — o runner recusa executar sem um banco real explícito.');
  }

  const startedAt = Date.now();
  const result = await runPendingPaymentExpirationOnce({});
  const durationMs = Date.now() - startedAt;

  const summary = {
    status: result.status,
    batchSize: result.batchSize,
    candidateCount: result.candidateCount,
    cancelled: result.results.filter((r) => r.status === 'cancelled').length,
    skipped: result.results.filter((r) => r.status === 'skipped').length,
    failed: result.results.filter((r) => r.status === 'failed').length,
    groupCandidateCount: result.groupCandidateCount,
    groupsCancelled: result.groupResults.filter((r) => r.status === 'cancelled').length,
    groupsSkipped: result.groupResults.filter((r) => r.status === 'skipped').length,
    groupsFailed: result.groupResults.filter((r) => r.status === 'failed').length,
    durationMs,
  };

  // Log estruturado no stdout do Cron Job — nenhum valor monetário, nenhum
  // dado de comprador/vendedor, nenhum segredo: só contagens e status, mesmo
  // critério já aplicado ao runner de escrow auto-release.
  console.log(JSON.stringify(summary));
}

main()
  .catch((err) => {
    console.error('PENDING_PAYMENT_EXPIRATION_RUNNER_FAILED:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    const pool = getDbPool();
    if (pool) await pool.end().catch(() => {});
    process.exit(process.exitCode || 0);
  });
