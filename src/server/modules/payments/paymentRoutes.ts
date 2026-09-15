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

// Correção crítica (PAYMENT_CURRENCY_MISMATCH): currency NUNCA pode ter um
// default aqui. `.default('XOF')` fazia TODO pedido cuja requisição não
// enviasse currency (o caso normal — o frontend não envia esse campo)
// receber XOF fabricado, mesmo para um pedido real em BRL/GMD/qualquer
// outra moeda — PaymentService.initiatePayment já trata currency ausente
// corretamente (usa order.currency, a fonte real, como autoridade; só
// valida um mismatch quando o cliente de fato envia algo). Sem default,
// currency fica undefined quando omitido, exatamente o comportamento que
// PaymentService já espera.
const initiatePaymentSchema = z.object({
  orderId: z.string(),
  amount: z.number().positive().optional(),
  currency: z.string().optional(),
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

// Fase C3/C3.1 — endpoint SEPARADO do legacy `/initiate` (nunca reutilizado
// silenciosamente): financia um purchase_group inteiro com UMA única
// cobrança. `.strict()` REJEITA (não apenas ignora) qualquer payload que
// tente enviar amount/currency/orderId/childOrderIds/sellerIds/allocations
// — a única autoridade sobre valor/moeda é `purchase_groups.totalAmount`/
// `.currency`, lidos no backend (PaymentService.initiatePurchaseGroupPayment).
// purchaseGroupId vem exclusivamente da rota, nunca do corpo da requisição.
//
// Fase C3.1 — idempotencyKey REMOVIDA do contrato de propósito (não apenas
// opcional): a chave financeira usada para criar a cobrança no Asaas é
// gerada inteiramente pelo backend (asaas_pix_group:{purchaseGroupId}:
// {localPaymentId}, ver PaymentService.initiatePurchaseGroupPayment) — o
// cliente nunca tem como influenciá-la. Nenhum campo de deduplicação HTTP
// (requestId/clientRequestId) foi adicionado porque não é necessário hoje:
// a idempotência real (duplo clique, retry) já é garantida no backend pela
// reserva atômica da fase local 1, independente de qualquer coisa que o
// cliente envie.
const initiatePurchaseGroupPaymentSchema = z.object({
  method: z.string(),
  provider: z.string().optional(),
}).strict();

// POST /api/v1/payments/purchase-groups/:purchaseGroupId/initiate
paymentRouter.post('/purchase-groups/:purchaseGroupId/initiate', requireAuth, payLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const validated = initiatePurchaseGroupPaymentSchema.parse(req.body);
    const payment = await PaymentService.initiatePurchaseGroupPayment({
      ...validated,
      purchaseGroupId: req.params.purchaseGroupId,
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
    const statusCode = err.status || (err.code === 'FORBIDDEN_PURCHASE_GROUP_ACCESS' ? 403 : err.code === 'PURCHASE_GROUP_NOT_FOUND' ? 404 : 400);
    return res.status(statusCode).json({
      success: false,
      error: { code: err.code || 'PURCHASE_GROUP_PAYMENT_INITIATION_FAILED', message: err.message },
    });
  }
});
