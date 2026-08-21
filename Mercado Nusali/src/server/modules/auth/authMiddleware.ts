import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getDb } from '../../../db/index.js';
import { users } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    fullName: string;
    countryCode: string;
    kycStatus: string;
  };
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Token de autenticação não fornecido ou inválido.',
      },
    });
  }

  const token = authHeader.split(' ')[1];
  const secret = process.env.JWT_ACCESS_SECRET || 'nusali_jwt_secret_default_change_in_prod';

  try {
    const decoded = jwt.verify(token, secret) as {
      userId: string;
      email: string;
      role: string;
      fullName: string;
      countryCode: string;
      kycStatus: string;
    };

    req.user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      fullName: decoded.fullName,
      countryCode: decoded.countryCode,
      kycStatus: decoded.kycStatus,
    };

    return next();
  } catch (err: any) {
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
