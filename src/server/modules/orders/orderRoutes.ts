import { Router, Response } from 'express';
import { OrderService } from './orderService.js';
import { requireAuth, AuthRequest } from '../auth/authMiddleware.js';
import { z } from 'zod';

export const orderRouter = Router();

const createOrderSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string(),
      variantId: z.string().optional(),
      quantity: z.number().int().positive(),
      unitPrice: z.number().positive(),
      title: z.string(),
      image: z.string().optional(),
      sellerId: z.string().optional(),
    })
  ).min(1, 'O pedido deve conter ao menos 1 item'),
  subtotal: z.number().nonnegative(),
  shippingFee: z.number().nonnegative().default(0),
  discountAmount: z.number().nonnegative().optional().default(0),
  totalAmount: z.number().positive('Total deve ser positivo'),
  currency: z.string().default('XOF'),
  paymentMethod: z.string(),
  shippingAddress: z.any(),
  billingAddress: z.any().optional(),
  countryCode: z.string().default('GW'),
  notes: z.string().optional(),
});

// POST /api/v1/orders
orderRouter.post('/orders', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const validated = createOrderSchema.parse(req.body);
    const order = await OrderService.createOrder({
      ...validated,
      buyerId: req.user!.id,
    });

    return res.status(201).json({
      success: true,
      data: order,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      const issue = (err as any).issues?.[0] || (err as any).errors?.[0];
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: issue?.message || 'Dados do pedido inválidos',
          details: (err as any).issues || (err as any).errors,
        },
      });
    }
    return res.status(400).json({
      success: false,
      error: { code: 'ORDER_CREATION_FAILED', message: err.message },
    });
  }
});

// GET /api/v1/orders
orderRouter.get('/orders', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const ordersList = await OrderService.getOrdersByBuyer(req.user!.id);
    return res.json({
      success: true,
      data: ordersList,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: err.message },
    });
  }
});

// GET /api/v1/orders/:id
orderRouter.get('/orders/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const order = await OrderService.getOrderById(req.params.id);
    if (!order) {
      return res.status(404).json({
        success: false,
        error: { code: 'ORDER_NOT_FOUND', message: 'Pedido não encontrado.' },
      });
    }

    // Ensure user is the owner or admin
    if (order.buyerId !== req.user!.id && req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Você não tem permissão para visualizar este pedido.' },
      });
    }

    return res.json({
      success: true,
      data: order,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: err.message },
    });
  }
});
