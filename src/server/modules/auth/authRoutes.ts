import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AuthService, AuthFlowError, PUBLIC_REGISTRATION_ROLES, PASSWORD_RESET_GENERIC_MESSAGE, PASSWORD_MIN_LENGTH } from './authService.js';
import { requireAuth, AuthRequest } from './authMiddleware.js';
import { createRateLimiter, consumeRateLimit, rateLimitAccountKey } from '../../infra/rateLimiter.js';
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

// ---------------------------------------------------------------------------
// Limites das rotas sensíveis de autenticação (P1-1 da auditoria de lançamento).
// Por IP (req.ip já é o cliente real: `configureTrustProxy` em server.ts) e, onde faz sentido, POR CONTA
// (hash do e-mail — independe do IP). Os valores de IP são folgados de propósito: operadoras móveis
// costumam compartilhar um IP entre muitos clientes, então o freio forte é o POR CONTA.
// ---------------------------------------------------------------------------
const registerIpLimiter = createRateLimiter({
  windowMs: 60 * 60_000,
  maxRequests: 20,
  message: 'Muitos cadastros a partir desta rede. Tente novamente mais tarde.',
  keyPrefix: 'rl:auth:register:ip:',
});
const registerEmailLimiter = createRateLimiter({
  windowMs: 60 * 60_000,
  maxRequests: 5,
  message: 'Muitas tentativas de cadastro com este e-mail. Tente novamente mais tarde.',
  keyPrefix: 'rl:auth:register:em:',
  keyGenerator: (req) => rateLimitAccountKey(req.body?.email),
});
const verifyEmailIpLimiter = createRateLimiter({
  windowMs: 10 * 60_000,
  maxRequests: 30,
  message: 'Muitas tentativas de verificação. Aguarde alguns minutos e tente novamente.',
  keyPrefix: 'rl:auth:verify:ip:',
});
const resendVerificationIpLimiter = createRateLimiter({
  windowMs: 60 * 60_000,
  maxRequests: 15,
  message: 'Muitos pedidos de código a partir desta rede. Tente novamente mais tarde.',
  keyPrefix: 'rl:auth:resend:ip:',
});
const forgotPasswordIpLimiter = createRateLimiter({
  windowMs: 60 * 60_000,
  maxRequests: 15,
  message: 'Muitos pedidos de recuperação a partir desta rede. Tente novamente mais tarde.',
  keyPrefix: 'rl:auth:forgot:ip:',
});
const resetPasswordIpLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  maxRequests: 20,
  message: 'Muitas tentativas de redefinição. Aguarde alguns minutos e tente novamente.',
  keyPrefix: 'rl:auth:reset:ip:',
});
// Folgado: o front renova a sessão sozinho (single-flight) e vários usuários podem dividir o mesmo IP.
const refreshIpLimiter = createRateLimiter({
  windowMs: 10 * 60_000,
  maxRequests: 120,
  message: 'Muitas renovações de sessão. Aguarde alguns minutos.',
  keyPrefix: 'rl:auth:refresh:ip:',
});
const FORGOT_PASSWORD_MAX_PER_ACCOUNT_PER_HOUR = 3;

const registerSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(PASSWORD_MIN_LENGTH, `A senha deve ter no mínimo ${PASSWORD_MIN_LENGTH} caracteres`),
  fullName: z.string().min(2, 'Nome completo obrigatório'),
  phone: z.string().optional(),
  countryCode: z.string().min(2, 'País é obrigatório'),
  // AUDITORIA DE LANÇAMENTO (P0) — só BUYER/SELLER (antes aceitava ADMIN,
  // COUNTRY_REPRESENTATIVE e REGIONAL_SUPERVISOR do corpo público: autoatribuição
  // de papel interno). AuthService.register repete a regra (defesa em profundidade).
  role: z
    .enum(PUBLIC_REGISTRATION_ROLES, { error: 'Tipo de conta inválido. O cadastro permite apenas comprador ou vendedor.' })
    .optional()
    .default('BUYER'),
  // LEGAL-2 — aceite OBRIGATÓRIO no servidor (o checkbox do navegador não é a única proteção). Só `true` exato passa.
  termsAccepted: z.literal(true, { error: 'Para criar a conta, aceite os Termos de Uso.' }),
  privacyAccepted: z.literal(true, { error: 'Para criar a conta, aceite a Política de Privacidade.' }),
  // Opcional e FALSE por padrão; não condiciona o cadastro. Versões enviadas pelo cliente são descartadas (z.object ignora chaves extras).
  marketingOptIn: z.boolean({ error: 'Preferência de comunicações inválida.' }).optional().default(false),
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
authRouter.post('/register', registerIpLimiter, registerEmailLimiter, async (req: Request, res: Response) => {
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

    if (err instanceof AuthFlowError && err.code === 'LOGIN_LOCKED') {
      return res.status(429).json({ success: false, error: { code: 'LOGIN_LOCKED', message: err.message } });
    }
    if (err instanceof AuthFlowError && err.code === 'SESSION_PERSIST_FAILED') {
      return res.status(503).json({ success: false, error: { code: 'SESSION_UNAVAILABLE', message: err.message } });
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

// ---------------------------------------------------------------------------
// Recuperação de senha por e-mail.
// Freios: limite por IP (folgado, acima) + POR CONTA (intervalo mínimo entre e-mails em
// AuthService.requestPasswordReset e teto por hora, silencioso, abaixo) + token de 256 bits de uso único.
// ---------------------------------------------------------------------------
const forgotPasswordSchema = z.object({
  identifier: z.string().trim().email('E-mail inválido'),
  method: z.enum(['email', 'sms', 'whatsapp']).optional().default('email'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(20, 'Link de recuperação inválido ou expirado. Solicite um novo.').max(200, 'Link de recuperação inválido ou expirado. Solicite um novo.'),
  newPassword: z.string().min(8, 'A nova senha deve ter pelo menos 8 caracteres.').max(128, 'A nova senha é longa demais.'),
});

// POST /api/v1/auth/forgot-password
authRouter.post('/forgot-password', forgotPasswordIpLimiter, async (req: Request, res: Response) => {
  try {
    const validated = forgotPasswordSchema.parse(req.body);
    if (validated.method !== 'email') {
      return res.status(400).json({
        success: false,
        error: { code: 'PASSWORD_RESET_METHOD_UNAVAILABLE', message: 'A recuperação por SMS ainda não está disponível. Use o e-mail de cadastro.' },
      });
    }
    // Teto por conta/hora: acima dele responde IGUAL (200 genérico), sem processar — não revela nada.
    const accountKey = rateLimitAccountKey(validated.identifier);
    const accountBudget = accountKey
      ? await consumeRateLimit(`rl:auth:forgot:em:${accountKey}`, 60 * 60_000, FORGOT_PASSWORD_MAX_PER_ACCOUNT_PER_HOUR)
      : { allowed: true };
    if (accountBudget.allowed) {
      await AuthService.requestPasswordReset(validated.identifier);
    }
    // Resposta SEMPRE igual: nunca revela se o e-mail existe, se foi enviado ou se houve throttle.
    return res.json({ success: true, data: { message: PASSWORD_RESET_GENERIC_MESSAGE, methodSent: 'email' } });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      const issue = (err as any).issues?.[0] || (err as any).errors?.[0];
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: issue?.message || 'Dados inválidos.' } });
    }
    return res.status(500).json({ success: false, error: { code: 'PASSWORD_RESET_UNAVAILABLE', message: 'Não foi possível processar a solicitação agora. Tente novamente em instantes.' } });
  }
});

// POST /api/v1/auth/reset-password
authRouter.post('/reset-password', resetPasswordIpLimiter, async (req: Request, res: Response) => {
  try {
    const validated = resetPasswordSchema.parse(req.body);
    const result = await AuthService.resetPasswordWithToken(validated.token, validated.newPassword);
    return res.json({ success: true, data: result });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      const issue = (err as any).issues?.[0] || (err as any).errors?.[0];
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: issue?.message || 'Dados inválidos.' } });
    }
    if (err?.code === 'PASSWORD_RESET_TOKEN_INVALID' || err?.code === 'PASSWORD_RESET_WEAK_PASSWORD') {
      return res.status(400).json({ success: false, error: { code: err.code, message: err.message } });
    }
    return res.status(500).json({ success: false, error: { code: 'PASSWORD_RESET_UNAVAILABLE', message: 'Não foi possível redefinir a senha agora. Tente novamente em instantes.' } });
  }
});

// POST /api/v1/auth/verify-email
authRouter.post('/verify-email', verifyEmailIpLimiter, async (req: Request, res: Response) => {
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
authRouter.post('/resend-verification', resendVerificationIpLimiter, async (req: Request, res: Response) => {
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
authRouter.post('/refresh', refreshIpLimiter, async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body ?? {};
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
    // Recusa esperada (token inválido/revogado/expirado, conta inativa) = 401: o cliente encerra a sessão local.
    if (err instanceof AuthFlowError && err.httpStatus === 401) {
      return res.status(401).json({
        success: false,
        error: { code: 'REFRESH_FAILED', message: err.message || 'Erro ao renovar token de acesso.' },
      });
    }
    // Qualquer outra falha (banco indisponível, erro interno) é transitória: 503, NUNCA 401 — assim o cliente não apaga a sessão.
    return res.status(503).json({
      success: false,
      error: { code: 'REFRESH_UNAVAILABLE', message: 'Não foi possível renovar a sessão agora. Tente novamente em instantes.' },
    });
  }
});

// POST /api/v1/auth/logout
authRouter.post('/logout', requireAuth, async (req: AuthRequest, res: Response) => {
  const { refreshToken } = req.body ?? {};
  const authHeader = req.headers.authorization;
  const accessToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;

  await AuthService.logout(refreshToken, accessToken, req.user?.sessionId);
  return res.json({
    success: true,
    data: { message: 'Desconectado com sucesso.' },
  });
});

// POST /api/v1/auth/change-password
// A senha ATUAL é obrigatória (um access token sozinho não basta para trocar a senha) e a troca encerra as outras sessões.
authRouter.post('/change-password', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body ?? {};
    const authHeader = req.headers.authorization;
    const accessToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;
    const result = await AuthService.changePassword(
      req.user!.id,
      { currentPassword, newPassword },
      { sessionId: req.user?.sessionId, accessToken }
    );
    return res.json({
      success: true,
      message: result.message,
    });
  } catch (err: any) {
    const known = err instanceof AuthFlowError;
    return res.status(known ? err.httpStatus : 400).json({
      success: false,
      error: {
        code: known ? err.code : 'PASSWORD_CHANGE_FAILED',
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

// DELETE /api/v1/auth/sessions/revoke-others
// (declarada ANTES de /sessions/:id: senão o Express a captura como id="revoke-others" e nada é revogado)
authRouter.delete('/sessions/revoke-others', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const currentToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;

    await AuthService.revokeOtherSessions(req.user!.id, { sessionId: req.user?.sessionId, accessToken: currentToken });
    return res.json({ success: true, message: 'Outras sessões encerradas com sucesso.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'REVOKE_OTHERS_FAILED', message: 'Não foi possível encerrar as outras sessões agora.' } });
  }
});

// DELETE /api/v1/auth/sessions/:id
authRouter.delete('/sessions/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await AuthService.revokeSession(req.user!.id, req.params.id);
    return res.json({ success: true, message: 'Sessão encerrada com sucesso.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'SESSION_REVOKE_FAILED', message: 'Não foi possível encerrar a sessão agora.' } });
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
