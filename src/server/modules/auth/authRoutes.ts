import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from './authService.js';
import { requireAuth, AuthRequest } from './authMiddleware.js';
import { createRateLimiter } from '../../infra/rateLimiter.js';
import { getDb } from '../../../db/index.js';
import { users, userProfiles, addresses, wallets, sessions } from '../../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';

export const authRouter = Router();

const loginLimiter = createRateLimiter({
  windowMs: 60000,
  maxRequests: 10,
  message: 'Muitas tentativas de login. Por favor, aguarde 1 minuto.',
  keyPrefix: 'rl:auth:login:',
});

const registerSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
  fullName: z.string().min(2, 'Nome completo obrigatório'),
  phone: z.string().optional(),
  countryCode: z.string().min(2, 'País é obrigatório'),
  role: z.enum(['BUYER', 'SELLER', 'ADMIN', 'COUNTRY_REPRESENTATIVE', 'REGIONAL_SUPERVISOR']).optional().default('BUYER'),
});

const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Senha obrigatória'),
});
const verifyEmailSchema = z.object({
  email: z.string().email('E-mail inválido'),
  code: z.string().regex(/^\d{6}$/, 'O código deve conter 6 dígitos'),
});

const resendEmailSchema = z.object({
  type: z.literal('email'),
  email: z.string().email('E-mail inválido'),
});


// POST /api/v1/auth/register
authRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const validated = registerSchema.parse(req.body);
    const result = await AuthService.register(validated);

    return res.status(201).json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      const issue = (err as any).issues?.[0] || (err as any).errors?.[0];
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: issue?.message || 'Dados de cadastro inválidos.',
          details: (err as any).issues || (err as any).errors,
        },
      });
    }

    return res.status(400).json({
      success: false,
      error: {
        code: 'REGISTRATION_FAILED',
        message: err.message || 'Erro ao realizar cadastro.',
      },
    });
  }
});

// POST /api/v1/auth/login
authRouter.post('/login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const validated = loginSchema.parse(req.body);
    const result = await AuthService.login({
      ...validated,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      const issue = (err as any).issues?.[0] || (err as any).errors?.[0];
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: issue?.message || 'Credenciais inválidas.',
        },
      });
    }

    if (err.message === 'EMAIL_VERIFICATION_REQUIRED') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'EMAIL_VERIFICATION_REQUIRED',
          message: 'E-mail não verificado. Digite o código enviado para seu e-mail para confirmar a conta.',
        },
        requiresEmailVerification: true,
        email: req.body.email,
      });
    }

    return res.status(401).json({
      success: false,
      error: {
        code: 'AUTH_FAILED',
        message: err.message || 'Falha na autenticação.',
      },
    });
  }
});

// POST /api/v1/auth/verify-email
authRouter.post('/verify-email', async (req: Request, res: Response) => {
  try {
    const validated = verifyEmailSchema.parse(req.body);
    const result = await AuthService.verifyEmail(validated.email, validated.code);
    return res.json({ success: true, data: result });
  } catch (err: any) {
    const message = err instanceof z.ZodError
      ? ((err as any).issues?.[0]?.message || 'Dados de verificação inválidos.')
      : (err.message || 'Código inválido ou expirado.');
    return res.status(400).json({ success: false, error: { code: 'EMAIL_VERIFICATION_FAILED', message } });
  }
});

// POST /api/v1/auth/resend-verification
authRouter.post('/resend-verification', async (req: Request, res: Response) => {
  try {
    const validated = resendEmailSchema.parse(req.body);
    const result = await AuthService.resendEmailVerification(validated.email);
    return res.json({ success: true, data: result });
  } catch (err: any) {
    const message = err instanceof z.ZodError
      ? ((err as any).issues?.[0]?.message || 'Dados inválidos.')
      : (err.message || 'Não foi possível reenviar o código.');
    return res.status(400).json({ success: false, error: { code: 'RESEND_VERIFICATION_FAILED', message } });
  }
});

// POST /api/v1/auth/refresh
authRouter.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TOKEN', message: 'Refresh token obrigatório.' },
      });
    }

    const result = await AuthService.refreshToken(refreshToken);
    return res.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'REFRESH_FAILED',
        message: err.message || 'Erro ao renovar token de acesso.',
      },
    });
  }
});

// POST /api/v1/auth/logout
authRouter.post('/logout', requireAuth, async (req: AuthRequest, res: Response) => {
  const { refreshToken } = req.body;
  const authHeader = req.headers.authorization;
  const accessToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;

  await AuthService.logout(refreshToken, accessToken);
  return res.json({
    success: true,
    data: { message: 'Desconectado com sucesso.' },
  });
});

// POST /api/v1/auth/change-password
authRouter.post('/change-password', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await AuthService.changePassword(req.user!.id, { currentPassword, newPassword });
    return res.json({
      success: true,
      message: result.message,
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'PASSWORD_CHANGE_FAILED',
        message: err.message || 'Erro ao alterar senha.',
      },
    });
  }
});

// GET /api/v1/auth/sessions
authRouter.get('/sessions', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Banco indisponível.' } });

    const userId = req.user!.id;
    const authHeader = req.headers.authorization;
    const currentToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;

    const userSessions = await db.select().from(sessions).where(eq(sessions.userId, userId)).orderBy(desc(sessions.createdAt));

    return res.json({
      success: true,
      data: userSessions.map(s => ({
        id: s.id,
        device: s.userAgent || 'Dispositivo não informado',
        ipAddress: s.ipAddress || null,
        ip: s.ipAddress || null,
        location: 'Conexão Segura',
        lastActiveAt: s.createdAt ? new Date(s.createdAt).toLocaleString('pt-PT') : 'Não informado',
        lastActive: s.createdAt ? new Date(s.createdAt).toLocaleString('pt-PT') : 'Não informado',
        isCurrent: currentToken ? s.token === currentToken : false,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'SESSIONS_FETCH_FAILED', message: err.message } });
  }
});

// DELETE /api/v1/auth/sessions/:id
authRouter.delete('/sessions/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Banco indisponível.' } });

    const userId = req.user!.id;
    const { id } = req.params;

    await db.delete(sessions).where(and(eq(sessions.id, id), eq(sessions.userId, userId)));
    return res.json({ success: true, message: 'Sessão encerrada com sucesso.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'SESSION_REVOKE_FAILED', message: err.message } });
  }
});

// DELETE /api/v1/auth/sessions/revoke-others
authRouter.delete('/sessions/revoke-others', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Banco indisponível.' } });

    const userId = req.user!.id;
    const authHeader = req.headers.authorization;
    const currentToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;

    if (currentToken) {
      await db.delete(sessions).where(and(eq(sessions.userId, userId), eq(sessions.token, currentToken)));
    } else {
      await db.delete(sessions).where(eq(sessions.userId, userId));
    }

    return res.json({ success: true, message: 'Outras sessões encerradas com sucesso.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'REVOKE_OTHERS_FAILED', message: err.message } });
  }
});

// GET /api/v1/auth/me
authRouter.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const db = getDb();

    if (!db) {
      return res.json({
        success: true,
        data: {
          user: req.user,
          profile: null,
          addresses: [],
          wallet: null,
        },
      });
    }

    const [userRecord, profileRecord, userAddresses, userWallet] = await Promise.all([
      db.select().from(users).where(eq(users.id, userId)).limit(1),
      db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1),
      db.select().from(addresses).where(eq(addresses.userId, userId)),
      db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1),
    ]);

    const user: any = userRecord[0] || req.user;

    return res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          phone: user.phone || '',
          role: user.role,
          countryCode: user.countryCode,
          kycStatus: user.kycStatus,
          riskScore: user.riskScore || 'baixo',
          avatarUrl: user.avatarUrl || '',
          isActive: user.isActive ?? true,
          isEmailVerified: user.isEmailVerified ?? false,
          isPhoneVerified: user.isPhoneVerified ?? false,
          isTwoFactorEnabled: user.isTwoFactorEnabled ?? false,
        },
        profile: profileRecord[0] || null,
        addresses: userAddresses || [],
        wallet: userWallet[0] || null,
      },
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: err.message },
    });
  }
});
