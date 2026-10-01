/**
 * FASE D18-C4.3 — runner de linha de comando para o reconciliador de
 * auto-release de escrow. Este é o mecanismo REAL que torna
 * `runEscrowAutoReleaseOnce` operacional: antes desta fase, a função já
 * existia e era extensamente testada, mas nada a executava periodicamente
 * (auditoria D18-C4 confirmou: sem node-cron, sem setInterval, sem BullMQ
 * repeatable job, sem Render Cron/render.yaml — só o endpoint interno HTTP
 * e os testes chamavam a função).
 *
 * DESENHO (auditoria desta fase):
 *   - BullMQ já existe como dependência (src/server/infra/queues.ts), mas
 *     fica DESLIGADO por padrão (ENABLE_BULLMQ!=true) e hoje não roda
 *     nenhum worker persistente em produção — ativá-lo só para isto exigiria
 *     um processo worker novo rodando 24/7, infraestrutura bem maior do que
 *     este MVP precisa. Não foi usado, conforme orientação do ticket.
 *   - O endpoint interno HTTP (`POST /internal/jobs/escrow-auto-release`,
 *     já protegido por INTERNAL_JOBS_SECRET) continua existindo e disponível
 *     como gatilho manual/alternativo — não foi removido nem alterado.
 *   - Este script é a solução mais simples e mais segura compatível com a
 *     infraestrutura já existente: um Render Cron Job (tipo de serviço
 *     nativo do Render, sem custo de worker 24/7) executa este comando
 *     periodicamente. NENHUMA lógica financeira nova — só chama
 *     `runEscrowAutoReleaseOnce()`, a MESMA função já usada pelo endpoint
 *     HTTP e testada exaustivamente (feature flag, escrowHoldingHours,
 *     advisory lock, disputa ativa, devolução ativa, chargeback, idempotência
 *     — tudo preservado, nada duplicado aqui).
 *   - Não depende de sessão de usuário nem de HTTP: roda como um processo
 *     Node curto, autenticado apenas pelas credenciais reais do banco
 *     (DATABASE_URL do ambiente do Cron Job), nunca por token de usuário.
 *
 * Uso: `npm run jobs:escrow-auto-release` (local/manual) ou como o comando
 * de um Render Cron Job (ver relatório da fase para o passo operacional
 * exato a configurar no Render — nada foi alterado no Render nesta fase).
 */
import 'dotenv/config';
import { runEscrowAutoReleaseOnce } from '../src/server/modules/payments/escrowAutoReleaseService.js';
import { getDbPool } from '../src/db/index.js';

async function main() {
  if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.trim()) {
    throw new Error('DATABASE_URL não configurada — o runner recusa executar sem um banco real explícito.');
  }

  const startedAt = Date.now();
  const result = await runEscrowAutoReleaseOnce({});
  const durationMs = Date.now() - startedAt;

  const summary = {
    status: result.status,
    reason: (result as any).reason,
    hours: result.hours,
    batchSize: result.batchSize,
    candidateCount: result.candidateCount,
    released: result.results.filter((r) => r.status === 'released').length,
    skipped: result.results.filter((r) => r.status === 'skipped').length,
    blocked: result.results.filter((r) => r.status === 'blocked').length,
    failed: result.results.filter((r) => r.status === 'failed').length,
    durationMs,
  };

  // Log estruturado no stdout do Cron Job — nenhum valor monetário, nenhum
  // dado de comprador/vendedor, nenhum segredo: só contagens e status, mesmo
  // critério já aplicado à resposta do endpoint HTTP interno.
  console.log(JSON.stringify(summary));

  if (result.status === 'disabled') {
    console.log(`Auto-release desabilitado: ${(result as any).reason}`);
  }
}

main()
  .catch((err) => {
    console.error('ESCROW_AUTO_RELEASE_RUNNER_FAILED:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    const pool = getDbPool();
    if (pool) await pool.end().catch(() => {});
    process.exit(process.exitCode || 0);
  });
