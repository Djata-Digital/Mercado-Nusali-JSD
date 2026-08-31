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

// POST /api/v1/orders and POST /api/v1/orders/orders
orderRouter.post(['/', '/orders'], requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { shippingAddress, addressId, paymentMethod, notes, currency, countryCode } = req.body ?? {};
    const order = await OrderService.createOrderFromCart({
      userId: req.user!.id,
      shippingAddress,
      addressId,
      paymentMethod: paymentMethod || null,
      notes,
      currency,
      countryCode,
    });

    return res.status(201).json({
      success: true,
      message: 'Pedido criado com sucesso!',
      data: order,
    });
  } catch (err: any) {
    const msg = err?.message || 'Erro ao criar pedido.';
    const isStockError = msg.includes('INSUFFICIENT_STOCK') || msg.includes('Estoque insuficiente');
    return res.status(400).json({
      success: false,
      error: {
        code: isStockError ? 'INSUFFICIENT_STOCK' : 'ORDER_CREATION_FAILED',
        message: msg,
      },
    });
  }
});

// GET /api/v1/orders and GET /api/v1/orders/orders
orderRouter.get(['/', '/orders'], requireAuth, async (req: AuthRequest, res: Response) => {
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

// POST /api/v1/orders/:id/confirm-delivery
orderRouter.post(['/:id/confirm-delivery', '/orders/:id/confirm-delivery'], requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { shipmentId } = req.body ?? {};
    const order = await OrderService.confirmDelivery(req.params.id, req.user!.id, shipmentId);
    return res.json({
      success: true,
      message: 'Recebimento confirmado com sucesso! Fundos de custódia liberados.',
      data: order,
    });
  } catch (err: any) {
    const msg = err?.message || '';
    if (msg.includes('SHIPMENT_NOT_DELIVERED') || msg.includes('ORDER_NOT_FULLY_DELIVERED')) {
      const code = msg.includes('SHIPMENT_NOT_DELIVERED') ? 'SHIPMENT_NOT_DELIVERED' : 'ORDER_NOT_FULLY_DELIVERED';
      const cleanMessage = msg.includes(': ') ? msg.split(': ')[1] : msg;
      return res.status(409).json({
        success: false,
        error: { code, message: cleanMessage },
      });
    }
    if (msg.includes('BUYER_NAME_REQUIRED_FOR_DELIVERY_CONFIRMATION')) {
      const cleanMessage = msg.includes(': ') ? msg.split(': ')[1] : msg;
      return res.status(400).json({
        success: false,
        error: { code: 'BUYER_NAME_REQUIRED_FOR_DELIVERY_CONFIRMATION', message: cleanMessage },
      });
    }
    if (msg.includes('ESCROW_BLOCKED_BY_ACTIVE_DISPUTE') || msg.includes('PAYMENT_NOT_ELIGIBLE_FOR_RELEASE')) {
      const code = msg.includes('ESCROW_BLOCKED_BY_ACTIVE_DISPUTE') ? 'ESCROW_BLOCKED_BY_ACTIVE_DISPUTE' : 'PAYMENT_NOT_ELIGIBLE_FOR_RELEASE';
      const cleanMessage = msg.includes(': ') ? msg.split(': ')[1] : msg;
      return res.status(409).json({
        success: false,
        error: { code, message: cleanMessage },
      });
    }
    if (msg.includes('UNAUTHORIZED')) {
      return res.status(403).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Você não tem permissão para confirmar este pedido.' },
      });
    }
    return res.status(400).json({
      success: false,
      error: { code: 'ORDER_CONFIRMATION_FAILED', message: msg || 'Erro ao confirmar entrega.' },
    });
  }
});

// POST /api/v1/orders/:id/cancel
orderRouter.post(['/:id/cancel', '/orders/:id/cancel'], requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { reason } = req.body ?? {};
    const order = await OrderService.cancelOrder(req.params.id, req.user!.id, reason);
    return res.json({
      success: true,
      message: 'Pedido cancelado com sucesso e reserva de estoque liberada.',
      data: order,
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: { code: 'ORDER_CANCELLATION_FAILED', message: err?.message || 'Erro ao cancelar pedido.' },
    });
  }
});

// GET /api/v1/orders/:id/track
orderRouter.get(['/:id/track', '/orders/:id/track'], requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const tracking = await OrderService.trackOrder(req.params.id, req.user!.id);
    return res.json({
      success: true,
      data: tracking,
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: { code: 'ORDER_TRACKING_FAILED', message: err?.message || 'Erro ao rastrear pedido.' },
    });
  }
});

// GET /api/v1/orders/:id
orderRouter.get(['/:id', '/orders/:id'], requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const order = await OrderService.getOrderById(req.params.id);
    if (!order) {
      return res.status(404).json({
        success: false,
        error: { code: 'ORDER_NOT_FOUND', message: 'Pedido não encontrado.' },
      });
    }

    // Ensure user is owner or admin
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
