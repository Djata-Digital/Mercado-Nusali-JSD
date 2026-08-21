import { Router, Request, Response } from 'express';
import { AsaasWebhookService } from './asaasWebhookService.js';
import { createRateLimiter } from '../../infra/rateLimiter.js';

export const asaasWebhookRouter = Router();

const webhookLimiter = createRateLimiter({
  windowMs: 60000,
  maxRequests: 120, // Suporta picos de webhooks do gateway
  keyPrefix: 'rl:wh:asaas:',
});

// POST /api/v1/webhooks/asaas
asaasWebhookRouter.post('/asaas', webhookLimiter, async (req: Request, res: Response) => {
  try {
    const tokenHeader = req.headers['asaas-access-token'] as string | undefined;
    const result = await AsaasWebhookService.processWebhook(tokenHeader, req.body);
    return res.status(200).json(result);
  } catch (err: any) {
    const statusCode = err.status || 500;
    return res.status(statusCode).json({
      success: false,
      error: {
        code: err.code || 'ASAAS_WEBHOOK_ERROR',
        message: err.message || 'Erro interno ao processar webhook Asaas.',
      },
    });
  }
});
