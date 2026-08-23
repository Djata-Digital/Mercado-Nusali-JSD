import { Router, Response } from 'express';
import { WalletService } from './walletService.js';
import { requireAuth, requireRole, AuthRequest } from '../auth/authMiddleware.js';

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

// POST /api/v1/wallet/deposit
//
// SECURITY (Fase 4A hardening): this endpoint used to credit `wallets.balance` with
// whatever `amount` the authenticated client sent in the request body, with no link to
// any real, gateway-confirmed payment — any logged-in user could mint arbitrary balance.
// It is disabled in ALL environments (no dev-only bypass) until a real top-up flow is
// built on top of PaymentService + a confirmed provider (Asaas/Orange/MTN). This is
// intentionally NOT implemented in this phase — see Fase 3B audit, item H.2.
walletRouter.post('/wallet/deposit', requireAuth, async (_req: AuthRequest, res: Response) => {
  return res.status(403).json({
    success: false,
    error: {
      code: 'DIRECT_DEPOSIT_DISABLED',
      message: 'Depósito direto de saldo não é permitido. O crédito de carteira só pode ocorrer através de um pagamento real, confirmado por um provedor (Asaas/Orange Money/MTN).',
    },
  });
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
