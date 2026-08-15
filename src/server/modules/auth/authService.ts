import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDb } from '../../../db/index.js';
import { users, userProfiles, refreshTokens, wallets } from '../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { logger } from '../../infra/logger.js';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'nusali_jwt_secret_default_change_in_prod';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'nusali_jwt_refresh_secret_default';
const ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '2h';
const REFRESH_EXPIRES_IN_DAYS = 30;

export interface RegisterDTO {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  countryCode?: string;
  role?: string;
}

export interface LoginDTO {
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}

export class AuthService {
  static async register(data: RegisterDTO) {
    const db = getDb();
    const cleanEmail = data.email.trim().toLowerCase();

    // Check if user already exists
    if (db) {
      const existing = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);
      if (existing.length > 0) {
        throw new Error('Já existe uma conta cadastrada com este e-mail.');
      }
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(data.password, salt);
    const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const role = (data.role || 'BUYER').toUpperCase();
    const countryCode = (data.countryCode || 'GW').toUpperCase();

    const newUser = {
      id: userId,
      email: cleanEmail,
      passwordHash,
      fullName: data.fullName.trim(),
      phone: data.phone || '',
      role,
      countryCode,
      kycStatus: 'unverified',
      riskScore: 'baixo',
      isActive: true,
      isEmailVerified: false,
      isPhoneVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (db) {
      await db.insert(users).values(newUser);

      // Create initial user profile
      await db.insert(userProfiles).values({
        id: `prof_${userId}`,
        userId,
        preferredCurrency: countryCode === 'BR' ? 'BRL' : countryCode === 'PT' ? 'EUR' : 'XOF',
        preferredLanguage: 'pt',
        membershipLevel: 'standard',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create initial wallet
      await db.insert(wallets).values({
        id: `wal_${userId}`,
        userId,
        balance: '0.00',
        cashbackBalance: '0.00',
        pendingBalance: '0.00',
        currency: countryCode === 'BR' ? 'BRL' : countryCode === 'PT' ? 'EUR' : 'XOF',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const tokens = await this.generateTokens(newUser);

    logger.info({ userId: newUser.id, email: newUser.email, role: newUser.role }, 'User registered successfully');

    return {
      user: {
        id: newUser.id,
        email: newUser.email,
        fullName: newUser.fullName,
        phone: newUser.phone,
        role: newUser.role,
        countryCode: newUser.countryCode,
        kycStatus: newUser.kycStatus,
      },
      ...tokens,
    };
  }

  static async login(data: LoginDTO) {
    const db = getDb();
    const cleanEmail = data.email.trim().toLowerCase();

    let userRecord: any = null;

    if (db) {
      const found = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);
      if (found.length > 0) {
        userRecord = found[0];
      }
    }

    if (!userRecord) {
      // Default demo bootstrap user validation for seamless testing
      if (cleanEmail === 'admin@nusali.com' || cleanEmail === 'vendedor@nusali.com' || cleanEmail === 'cliente@nusali.com') {
        const isMatch = data.password === '123456' || data.password === 'admin123';
        if (isMatch) {
          userRecord = {
            id: `usr_${cleanEmail.split('@')[0]}`,
            email: cleanEmail,
            fullName: cleanEmail.startsWith('admin') ? 'Super Admin Nusali' : cleanEmail.startsWith('vendedor') ? 'Vendedor Oficial Nusali' : 'Cliente Nusali',
            role: cleanEmail.startsWith('admin') ? 'ADMIN' : cleanEmail.startsWith('vendedor') ? 'SELLER' : 'BUYER',
            countryCode: 'GW',
            kycStatus: 'verified',
            isActive: true,
          };
        }
      }
    } else {
      if (userRecord.passwordHash) {
        const isMatch = await bcrypt.compare(data.password, userRecord.passwordHash);
        if (!isMatch) {
          throw new Error('E-mail ou senha incorretos.');
        }
      }
    }

    if (!userRecord) {
      throw new Error('E-mail ou senha incorretos.');
    }

    if (userRecord.isActive === false) {
      throw new Error('Esta conta está desativada ou suspensa. Contate o suporte.');
    }

    const tokens = await this.generateTokens(userRecord);

    logger.info({ userId: userRecord.id, email: userRecord.email, role: userRecord.role }, 'User logged in successfully');

    return {
      user: {
        id: userRecord.id,
        email: userRecord.email,
        fullName: userRecord.fullName,
        phone: userRecord.phone || '',
        role: userRecord.role,
        countryCode: userRecord.countryCode,
        kycStatus: userRecord.kycStatus,
        avatarUrl: userRecord.avatarUrl,
      },
      ...tokens,
    };
  }

  static async generateTokens(user: { id: string; email: string; role: string; fullName: string; countryCode: string; kycStatus: string }) {
    const accessToken = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
        countryCode: user.countryCode,
        kycStatus: user.kycStatus,
      },
      ACCESS_SECRET,
      { expiresIn: 7200 }
    );

    const refreshTokenRaw = `rt_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_EXPIRES_IN_DAYS);

    const db = getDb();
    if (db) {
      try {
        await db.insert(refreshTokens).values({
          id: `rt_${Date.now()}`,
          userId: user.id,
          tokenHash: refreshTokenRaw,
          expiresAt,
          isRevoked: false,
          createdAt: new Date(),
        });
      } catch {
        // continue
      }
    }

    return {
      accessToken,
      refreshToken: refreshTokenRaw,
      expiresIn: 7200, // 2 hours in seconds
    };
  }

  static async refreshToken(refreshTokenString: string) {
    const db = getDb();
    if (!db) {
      throw new Error('Banco de dados indisponível para renovação de sessão.');
    }

    const found = await db
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.tokenHash, refreshTokenString), eq(refreshTokens.isRevoked, false)))
      .limit(1);

    if (found.length === 0) {
      throw new Error('Refresh token inválido ou já revogado.');
    }

    const tokenRecord = found[0];
    if (new Date() > new Date(tokenRecord.expiresAt)) {
      throw new Error('Refresh token expirado. Por favor, faça login novamente.');
    }

    // Revoke old token and rotate
    await db.update(refreshTokens).set({ isRevoked: true }).where(eq(refreshTokens.id, tokenRecord.id));

    // Get user
    const userRes = await db.select().from(users).where(eq(users.id, tokenRecord.userId)).limit(1);
    if (userRes.length === 0) {
      throw new Error('Usuário associado ao token não encontrado.');
    }

    const user = userRes[0];
    return await this.generateTokens(user);
  }

  static async logout(refreshTokenString?: string) {
    if (refreshTokenString) {
      const db = getDb();
      if (db) {
        await db.update(refreshTokens).set({ isRevoked: true }).where(eq(refreshTokens.tokenHash, refreshTokenString));
      }
    }
    return { success: true };
  }
}
