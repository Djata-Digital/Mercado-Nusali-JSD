import { Router, Response } from 'express';
import { WalletService } from './walletService.js';
import { requireAuth, requireRole, AuthRequest } from '../auth/authMiddleware.js';
import { z } from 'zod';

export const walletRouter = Router();

// GET /api/v1/wallet
walletRouter.get('/wallet', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const wallet = await WalletService.getWallet(req.user!.id);
    return res.json({
      success: true,
      data: wallet,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: err.message },
    });
  }
});

const depositSchema = z.object({
  amount: z.number().positive('O valor deve ser positivo'),
  currency: z.string().default('XOF'),
  method: z.string().default('orange_money'),
  idempotencyKey: z.string().optional(),
});

// POST /api/v1/wallet/deposit
walletRouter.post('/wallet/deposit', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const validated = depositSchema.parse(req.body);
    const result = await WalletService.deposit(
      req.user!.id,
      validated.amount,
      validated.currency,
      validated.method,
      validated.idempotencyKey
    );

    return res.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      const issue = (err as any).issues?.[0] || (err as any).errors?.[0];
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: issue?.message || 'Dados inválidos' },
      });
    }
    return res.status(400).json({
      success: false,
      error: { code: 'DEPOSIT_FAILED', message: err.message },
    });
  }
});

// POST /api/v1/escrow/:id/release (Admin / System)
walletRouter.post('/escrow/:id/release', requireAuth, requireRole('ADMIN', 'FINANCE'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await WalletService.releaseEscrow(req.params.id, req.user!.id);
    return res.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: { code: 'ESCROW_RELEASE_FAILED', message: err.message },
    });
  }
});
