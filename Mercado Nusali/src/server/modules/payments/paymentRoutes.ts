import { Router, Request, Response } from 'express';
import { PaymentService } from './paymentService.js';
import { requireAuth, AuthRequest } from '../auth/authMiddleware.js';
import { z } from 'zod';
import { createRateLimiter } from '../../infra/rateLimiter.js';

export const paymentRouter = Router();

const payLimiter = createRateLimiter({
  windowMs: 60000,
  maxRequests: 20,
  keyPrefix: 'rl:payments:',
});

const initiatePaymentSchema = z.object({
  orderId: z.string(),
  amount: z.number().positive().optional(),
  currency: z.string().optional().default('XOF'),
  method: z.string(),
  provider: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

// POST /api/v1/payments/initiate
paymentRouter.post('/initiate', requireAuth, payLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const validated = initiatePaymentSchema.parse(req.body);
    const payment = await PaymentService.initiatePayment({
      ...validated,
      buyerId: req.user!.id,
    });

    return res.status(201).json({
      success: true,
      data: payment,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      const issue = (err as any).issues?.[0] || (err as any).errors?.[0];
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: issue?.message || 'Dados de pagamento inválidos' },
      });
    }
    const statusCode = err.status || (err.code === 'FORBIDDEN_ORDER_ACCESS' ? 403 : err.code === 'ORDER_NOT_FOUND' ? 404 : 400);
    return res.status(statusCode).json({
      success: false,
      error: { code: err.code || 'PAYMENT_INITIATION_FAILED', message: err.message },
    });
  }
});
