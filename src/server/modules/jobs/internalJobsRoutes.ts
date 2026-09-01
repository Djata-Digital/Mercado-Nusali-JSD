/**
 * Fase 1 do AUTO-RELEASE de escrow — endpoint interno para disparar UMA
 * execução do reconciliador. NÃO existe scheduler nesta fase (sem
 * node-cron/setInterval/BullMQ repeatable job/Render Cron) — este endpoint só
 * permite que um mecanismo externo (a ser decidido em fase futura) dispare
 * uma execução manual/controlada.
 *
 * Autenticação: MESMO padrão já usado por AsaasWebhookService.isTokenValid
 * (header comparado via crypto.timingSafeEqual contra um segredo de
 * ambiente) — nenhum mecanismo novo inventado. O segredo:
 *   - vive SOMENTE em INTERNAL_JOBS_SECRET (variável de ambiente);
 *   - nunca é lido de platformSettings/banco;
 *   - nunca é exposto a nenhuma rota pública/frontend;
 *   - se ausente no ambiente, o endpoint SEMPRE rejeita (nunca "aberto por
 *     omissão").
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { createRateLimiter } from '../../infra/rateLimiter.js';
import { runEscrowAutoReleaseOnce } from '../payments/escrowAutoReleaseService.js';
import { logger } from '../../infra/logger.js';

export const internalJobsRouter = Router();

const internalJobsLimiter = createRateLimiter({
  windowMs: 60000,
  maxRequests: 10,
  keyPrefix: 'rl:internal:jobs:',
});

/** Comparação segura (mesmo helper de AsaasWebhookService.isTokenValid, sem duplicar uma segunda implementação divergente). */
function isInternalJobsSecretValid(headerValue: string | undefined): boolean {
  const configuredSecret = process.env.INTERNAL_JOBS_SECRET;
  if (!configuredSecret || !configuredSecret.trim()) {
    return false;
  }
  if (!headerValue || !headerValue.trim()) {
    return false;
  }

  const headerClean = headerValue.trim();
  const configClean = configuredSecret.trim();

  if (headerClean.length !== configClean.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(Buffer.from(headerClean), Buffer.from(configClean));
  } catch {
    return false;
  }
}

// POST /api/v1/internal/jobs/escrow-auto-release
internalJobsRouter.post('/escrow-auto-release', internalJobsLimiter, async (req: Request, res: Response) => {
  const secretHeader = req.headers['x-internal-jobs-secret'] as string | undefined;

  if (!process.env.INTERNAL_JOBS_SECRET || !process.env.INTERNAL_JOBS_SECRET.trim()) {
    logger.error({}, 'INTERNAL_JOBS_SECRET_NOT_CONFIGURED');
    return res.status(503).json({
      success: false,
      error: { code: 'INTERNAL_JOBS_NOT_CONFIGURED', message: 'Endpoint interno não configurado no servidor.' },
    });
  }

  if (!isInternalJobsSecretValid(secretHeader)) {
    logger.warn({}, 'INTERNAL_JOBS_SECRET_INVALID');
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_INTERNAL_JOBS_SECRET', message: 'Credencial interna inválida ou ausente.' },
    });
  }

  try {
    const rawBatchSize = req.body?.batchSize;
    const batchSize = typeof rawBatchSize === 'number' && Number.isFinite(rawBatchSize) ? rawBatchSize : undefined;

    const result = await runEscrowAutoReleaseOnce({ batchSize });

    // Nunca retorna dados sensíveis — só orderId (identificador de negócio,
    // não PII) e classificação. Nenhum valor monetário/wallet/dado de
    // comprador é incluído na resposta deste endpoint.
    return res.status(200).json({
      success: true,
      data: {
        status: result.status,
        reason: result.reason,
        hours: result.hours,
        batchSize: result.batchSize,
        candidateCount: result.candidateCount,
        results: result.results,
      },
    });
  } catch (err: any) {
    logger.error({ error: err?.message }, 'ESCROW_AUTO_RELEASE_JOB_ERROR');
    return res.status(500).json({
      success: false,
      error: { code: 'ESCROW_AUTO_RELEASE_JOB_ERROR', message: 'Falha ao executar o reconciliador.' },
    });
  }
});
