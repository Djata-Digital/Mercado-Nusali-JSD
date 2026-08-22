import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getDb } from '../../../db/index.js';
import { users } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getJwtAccessSecret } from './jwtConfig.js';
import { logger } from '../../infra/logger.js';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    fullName: string;
    countryCode: string;
    kycStatus: string;
    isEmailVerified?: boolean;
  };
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const routePath = req.originalUrl || req.url || '';

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    if (process.env.NODE_ENV !== 'production') {
      logger.warn({ route: routePath, bearerPresent: false, jwtVerified: false, reqUserPresent: false }, '[AUTH] Missing Bearer header');
    }
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Token de autenticação não fornecido ou inválido.',
      },
    });
  }

  const token = authHeader.split(' ')[1];
  const secret = getJwtAccessSecret();

  try {
    const decoded = jwt.verify(token, secret) as {
      userId: string;
      email: string;
      role: string;
      fullName: string;
      countryCode: string;
      kycStatus: string;
      isEmailVerified?: boolean;
    };

    req.user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      fullName: decoded.fullName,
      countryCode: decoded.countryCode,
      kycStatus: decoded.kycStatus,
      isEmailVerified: decoded.isEmailVerified !== false,
    };

    if (process.env.NODE_ENV !== 'production') {
      logger.info(
        {
          route: routePath,
          bearerPresent: true,
          jwtVerified: true,
          userId: req.user.id,
          role: req.user.role,
          reqUserPresent: true,
        },
        '[AUTH] Request authenticated'
      );
    }

    const isUnverifiedAllowed =
      routePath.includes('/auth/verify-email') ||
      routePath.includes('/auth/resend-verification') ||
      routePath.includes('/auth/logout') ||
      routePath.includes('/auth/me');

    if (req.user.isEmailVerified === false && !isUnverifiedAllowed) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'EMAIL_VERIFICATION_REQUIRED',
          message: 'Verificação de e-mail pendente. Confirme seu e-mail para acessar esta funcionalidade.',
        },
      });
    }

    return next();
  } catch (err: any) {
    if (process.env.NODE_ENV !== 'production') {
      logger.warn(
        {
          route: routePath,
          bearerPresent: true,
          jwtVerified: false,
          errorType: err?.name || 'UnknownAuthError',
          reqUserPresent: false,
        },
        '[AUTH] JWT Verification Failed'
      );
    }
    return res.status(401).json({
      success: false,
      error: {
        code: 'TOKEN_EXPIRED_OR_INVALID',
        message: 'Sessão expirada ou token inválido. Por favor, faça login novamente.',
      },
    });
  }
}

export function requireRole(...allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Acesso não autorizado.' },
      });
    }

    const userRole = (req.user.role || '').toUpperCase();
    const hasRole = allowedRoles.some((r) => r.toUpperCase() === userRole) || userRole === 'ADMIN' || userRole === 'GLOBAL_ADMIN';

    if (!hasRole) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Você não tem permissão para acessar este recurso.',
        },
      });
    }

    return next();
  };
}

export const LOGISTICS_AUTHORIZED_ROLES = [
  'GLOBAL_ADMIN',
  'ADMIN',
  'REGIONAL_SUPERVISOR',
  'LOGISTICS',
  'LOGISTICS_OPERATOR',
  'WAREHOUSE_MANAGER',
  'WAREHOUSE_OPERATOR',
  'HUB_MANAGER',
];

export function requireLogisticsStaff(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Acesso não autorizado.' },
    });
  }

  const userRole = (req.user.role || '').toUpperCase();
  const isAuthorized = LOGISTICS_AUTHORIZED_ROLES.some((r) => r.toUpperCase() === userRole);

  if (!isAuthorized) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN_LOGISTICS_ONLY',
        message: 'Apenas administradores e operadores de logística autorizados podem executar alterações físicas e de status nas transferências.',
      },
    });
  }

  return next();
}
