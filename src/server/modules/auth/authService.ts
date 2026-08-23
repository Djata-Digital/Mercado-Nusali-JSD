import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDb } from '../../../db/index.js';
import { users, userProfiles, refreshTokens, wallets, emailVerificationTokens, sessions, sellers, sellerProfiles, countries } from '../../../db/schema.js';
import { eq, and, gt } from 'drizzle-orm';
import { logger } from '../../infra/logger.js';
import { generateEmailVerificationCode, hashEmailVerificationCode, sendVerificationEmail } from './emailService.js';
import { getJwtAccessSecret, getJwtRefreshSecret } from './jwtConfig.js';

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

    // Country is mandatory and must be a real, operational (isActive) country from the
    // `countries` table — no silent default to GW. This is the single source of truth
    // for which countries the Mercado Nusali currently accepts customers/sellers from.
    const countryCode = String(data.countryCode || '').trim().toUpperCase();
    if (!countryCode) {
      throw new Error('COUNTRY_REQUIRED: País é obrigatório para o cadastro.');
    }
    if (!db) {
      throw new Error('DATABASE_UNAVAILABLE: Não foi possível validar o país no momento. Tente novamente.');
    }
    const [countryRow] = await db.select().from(countries).where(eq(countries.code, countryCode)).limit(1);
    if (!countryRow) {
      throw new Error(`COUNTRY_NOT_FOUND: País "${countryCode}" não é reconhecido pelo Mercado Nusali.`);
    }
    if (countryRow.isActive !== true) {
      throw new Error(`COUNTRY_INACTIVE: O Mercado Nusali ainda não está disponível em ${countryRow.name}.`);
    }
    const countryCurrency = countryRow.currency;

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(data.password, salt);
    const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const role = (data.role || 'BUYER').toUpperCase();

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
        preferredCurrency: countryCurrency,
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
        currency: countryCurrency,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // If user is registering as a SELLER, create seller & sellerProfiles records
      if (role === 'SELLER') {
        const sellerId = `sel_${userId}`;
        await db.insert(sellers).values({
          id: sellerId,
          userId,
          companyName: data.fullName.trim(),
          tradingName: data.fullName.trim(),
          taxId: '', // Never use phone as fallback for taxId!
          phone: data.phone || '',
          countryCode,
          status: 'pending',
          commissionRate: '8.00',
          rating: '5.00',
          totalSales: '0.00',
          totalOrders: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        await db.insert(sellerProfiles).values({
          id: `sp_${userId}`,
          sellerId,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    // O cadastro só é concluído para o cliente depois que o código foi realmente enviado.
    // Se o provedor de e-mail falhar, o usuário permanece criado e poderá usar "Reenviar código".
    let emailVerificationSent = true;
    try {
      await this.issueEmailVerificationCode({ id: newUser.id, email: newUser.email, fullName: newUser.fullName });
    } catch (error: any) {
      emailVerificationSent = false;
      logger.error({ userId: newUser.id, error: error?.message }, 'User created but verification email could not be sent');
    }

    logger.info({ userId: newUser.id, email: newUser.email, role: newUser.role }, 'User registered successfully. Email verification code issued.');

    // DO NOT issue an active authenticated session token until email is verified!
    return {
      user: this.toPublicUser(newUser),
      emailVerificationSent,
      requiresEmailVerification: true,
      email: newUser.email,
    };
  }

  static async issueEmailVerificationCode(user: { id: string; email: string; fullName: string }) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível para verificação de e-mail.');

    const code = generateEmailVerificationCode();
    const tokenHash = hashEmailVerificationCode(code);
    const expiresMinutes = Math.max(1, Number(process.env.EMAIL_VERIFICATION_EXPIRES_MINUTES || 10));
    const expiresAt = new Date(Date.now() + expiresMinutes * 60_000);

    // Apenas um código ativo por usuário.
    await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, user.id));
    await db.insert(emailVerificationTokens).values({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId: user.id,
      token: tokenHash,
      expiresAt,
      createdAt: new Date(),
    });

    try {
      await sendVerificationEmail({ to: user.email, name: user.fullName, code });
    } catch (error) {
      // Não deixe um código que nunca foi entregue como ativo.
      await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, user.id));
      throw error;
    }

    return { expiresAt };
  }

  static async verifyEmail(email: string, code: string) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível para verificação de e-mail.');

    const cleanEmail = email.trim().toLowerCase();
    const found = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);
    if (!found.length) throw new Error('Código inválido ou expirado.');

    const user = found[0];
    if (user.isEmailVerified) {
      const sessionTokens = await this.generateTokens(user);
      return {
        user: this.toPublicUser(user),
        token: sessionTokens.token,
        refreshToken: sessionTokens.refreshToken,
        message: 'E-mail já estava verificado.',
      };
    }

    const tokenHash = hashEmailVerificationCode(code);
    const tokens = await db.select().from(emailVerificationTokens).where(and(
      eq(emailVerificationTokens.userId, user.id),
      eq(emailVerificationTokens.token, tokenHash),
      gt(emailVerificationTokens.expiresAt, new Date()),
    )).limit(1);

    if (!tokens.length) throw new Error('Código inválido ou expirado. Solicite um novo código.');

    const updated = await db.update(users).set({ isEmailVerified: true, updatedAt: new Date() }).where(eq(users.id, user.id)).returning();
    await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, user.id));

    const verifiedUser = updated[0] || { ...user, isEmailVerified: true };
    const sessionTokens = await this.generateTokens(verifiedUser);

    logger.info({ userId: user.id }, 'Email verified successfully');
    return {
      user: this.toPublicUser(verifiedUser),
      token: sessionTokens.token,
      refreshToken: sessionTokens.refreshToken,
      message: 'E-mail verificado com sucesso!',
    };
  }

  static async resendEmailVerification(email: string) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível para verificação de e-mail.');
    const cleanEmail = email.trim().toLowerCase();
    const found = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);
    if (!found.length) throw new Error('Usuário não encontrado.');
    const user = found[0];
    if (user.isEmailVerified) return { message: 'Este e-mail já está verificado.' };
    await this.issueEmailVerificationCode({ id: user.id, email: user.email, fullName: user.fullName });
    return { message: 'Novo código enviado para seu e-mail.' };
  }

  static toPublicUser(user: any) {
    return {
      id: user.id,
      name: user.fullName,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone || '',
      role: user.role,
      country: user.countryCode,
      countryCode: user.countryCode,
      kycStatus: user.kycStatus,
      avatar: user.avatarUrl || '',
      avatarUrl: user.avatarUrl || '',
      isEmailVerified: user.isEmailVerified === true,
      isPhoneVerified: user.isPhoneVerified === true,
      status: user.isActive === false ? 'suspended' : 'active',
      createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : (user.createdAt || new Date().toISOString()),
    };
  }

  static async login(data: LoginDTO) {
    const db = getDb();
    if (!db) {
      throw new Error('Banco de dados indisponível para autenticação.');
    }

    const cleanEmail = data.email.trim().toLowerCase();
    const found = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);

    if (found.length === 0) {
      throw new Error('E-mail ou senha incorretos.');
    }

    const userRecord = found[0];

    if (!userRecord.passwordHash) {
      throw new Error('E-mail ou senha incorretos.');
    }

    const isMatch = await bcrypt.compare(data.password, userRecord.passwordHash);
    if (!isMatch) {
      throw new Error('E-mail ou senha incorretos.');
    }

    if (userRecord.isActive === false) {
      throw new Error('Esta conta está desativada ou suspensa. Contate o suporte.');
    }

    if (userRecord.isEmailVerified === false) {
      throw new Error('EMAIL_VERIFICATION_REQUIRED');
    }

    const tokens = await this.generateTokens(userRecord, {
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
    });

    logger.info({ userId: userRecord.id, email: userRecord.email, role: userRecord.role }, 'User logged in successfully');

    return {
      user: this.toPublicUser(userRecord),
      ...tokens,
    };
  }

  static async generateTokens(
    user: { id: string; email: string; role: string; fullName: string; countryCode: string; kycStatus: string; isEmailVerified?: boolean },
    meta?: { ipAddress?: string; userAgent?: string }
  ) {
    const accessToken = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
        countryCode: user.countryCode,
        kycStatus: user.kycStatus,
        isEmailVerified: user.isEmailVerified === true,
      },
      getJwtAccessSecret(),
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

        // Create real active session row in PostgreSQL sessions table
        const sessionExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        await db.insert(sessions).values({
          id: `sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          userId: user.id,
          token: accessToken,
          ipAddress: meta?.ipAddress || null,
          userAgent: meta?.userAgent || null,
          expiresAt: sessionExpires,
          createdAt: new Date(),
        });
      } catch (err: any) {
        logger.error({ userId: user.id, error: err?.message }, 'Failed to persist refresh token or session');
      }
    }

    return {
      token: accessToken,
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

  static async changePassword(userId: string, data: { currentPassword?: string; newPassword: string }) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível para alteração de senha.');

    if (!data.newPassword || data.newPassword.length < 6) {
      throw new Error('A nova senha deve ter no mínimo 6 caracteres.');
    }

    const found = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!found.length) {
      throw new Error('Usuário não encontrado.');
    }

    const user = found[0];

    if (data.currentPassword && user.passwordHash) {
      const isMatch = await bcrypt.compare(data.currentPassword, user.passwordHash);
      if (!isMatch) {
        throw new Error('A senha atual informada está incorreta.');
      }
    }

    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(data.newPassword, salt);

    await db.update(users).set({
      passwordHash: newPasswordHash,
      updatedAt: new Date(),
    }).where(eq(users.id, userId));

    logger.info({ userId }, 'User password updated successfully in PostgreSQL');
    return { message: 'Senha de acesso alterada com sucesso!' };
  }

  static async logout(refreshTokenString?: string, accessToken?: string) {
    const db = getDb();
    if (db) {
      if (refreshTokenString) {
        await db.update(refreshTokens).set({ isRevoked: true }).where(eq(refreshTokens.tokenHash, refreshTokenString));
      }
      if (accessToken) {
        await db.delete(sessions).where(eq(sessions.token, accessToken));
      }
    }
    return { success: true };
  }
}
