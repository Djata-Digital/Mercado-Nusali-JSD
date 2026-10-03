import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDb } from '../../../db/index.js';
import { users, userProfiles, refreshTokens, wallets, emailVerificationTokens, sessions, sellers, sellerProfiles, countries, passwordResetTokens, auditLogs } from '../../../db/schema.js';
import { eq, and, gt, desc } from 'drizzle-orm';
import { logger } from '../../infra/logger.js';
import { generateEmailVerificationCode, hashEmailVerificationCode, sendVerificationEmail, sendPasswordResetEmail } from './emailService.js';
import crypto from 'node:crypto';
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

/**
 * Recuperação de senha por e-mail. O token (32 bytes aleatórios, base64url) só existe
 * no link enviado; o banco guarda apenas o SHA-256 dele (`password_reset_tokens.token`).
 * Uso único, validade curta, um token ativo por conta. Respostas ao cliente são sempre
 * genéricas (nunca revelam se o e-mail existe).
 */
export const PASSWORD_RESET_GENERIC_MESSAGE = 'Se existir uma conta com este e-mail, enviamos as instruções para redefinir a senha.';
const PASSWORD_RESET_EXPIRES_MINUTES = 30;
// Limite POR CONTA (não por IP: sem `trust proxy`, atrás do proxy todos os clientes compartilham o mesmo IP).
const PASSWORD_RESET_MIN_INTERVAL_MS = 5 * 60_000;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_BYTES = 72; // limite real do bcrypt: além disso a senha seria truncada em silêncio

export function hashPasswordResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export interface LoginDTO {
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * AUDITORIA DE LANÇAMENTO (P0) — o cadastro PÚBLICO só pode criar BUYER ou
 * SELLER. Nenhum valor vindo do cliente pode resultar em ADMIN, GLOBAL_ADMIN,
 * COUNTRY_REPRESENTATIVE, REGIONAL_SUPERVISOR ou qualquer outro papel interno
 * (antes, `role` era gravado exatamente como recebido). Contas internas só
 * nascem pelo fluxo administrativo (`POST /admin/users`, GLOBAL_ADMIN).
 * Esta lista é usada pelo schema HTTP E por `register` (defesa em profundidade:
 * uma chamada interna ou rota futura não consegue contornar a regra).
 */
export const PUBLIC_REGISTRATION_ROLES = ['BUYER', 'SELLER'] as const;
export type PublicRegistrationRole = (typeof PUBLIC_REGISTRATION_ROLES)[number];

export function resolvePublicRegistrationRole(role: unknown): PublicRegistrationRole {
  if (role === undefined || role === null || role === '') return 'BUYER';
  const normalized = typeof role === 'string' ? role.trim().toUpperCase() : '';
  if ((PUBLIC_REGISTRATION_ROLES as readonly string[]).includes(normalized)) {
    return normalized as PublicRegistrationRole;
  }
  const err: any = new Error('REGISTRATION_ROLE_NOT_ALLOWED: O cadastro público só permite contas de comprador ou vendedor.');
  err.code = 'REGISTRATION_ROLE_NOT_ALLOWED';
  throw err;
}

export class AuthService {
  static async register(data: RegisterDTO) {
    // Papel validado ANTES de qualquer leitura/escrita: um papel não permitido
    // nunca chega a criar usuário, perfil, carteira nem enviar e-mail.
    const role = resolvePublicRegistrationRole(data.role);

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
          // NULL = nenhuma comissão específica negociada ainda; a comissão real
          // vem de category.commissionRate ou platformSettings.defaultSellerCommissionPercent
          // (ver orderService.ts). NUNCA gravar aqui um percentual técnico "de fábrica".
          commissionRate: null,
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

  /**
   * Pede a redefinição de senha. NUNCA lança por motivos ligados ao estado da conta (conta
   * inexistente, desativada, sem senha, throttle, falha de e-mail): o chamador responde sempre
   * com a mesma mensagem genérica. Só falhas de infraestrutura (banco indisponível) propagam.
   */
  static async requestPasswordReset(emailInput: string): Promise<void> {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível para recuperação de senha.');

    const cleanEmail = String(emailInput || '').trim().toLowerCase();
    const [user] = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);

    // Só contas ATIVAS e que já têm uma senha bcrypt real podem recuperar acesso por e-mail
    // (uma linha sem senha — ex.: criada por um fluxo legado — nunca ganha senha por aqui).
    const eligible = !!user && user.isActive !== false && typeof user.passwordHash === 'string' && user.passwordHash.startsWith('$2');
    if (!eligible || !user) {
      logger.info({ eligible: false }, 'PASSWORD_RESET_REQUEST_IGNORED');
      return;
    }

    const appUrl = String(process.env.APP_URL || '').trim().replace(/\/+$/, '');
    if (!appUrl || (process.env.NODE_ENV === 'production' && !appUrl.startsWith('https://'))) {
      // Fail-closed: sem uma URL pública confiável o link seria inútil/perigoso. Nunca derivar do Host da requisição.
      logger.error({ userId: user.id }, 'PASSWORD_RESET_APP_URL_NOT_CONFIGURED — e-mail não enviado');
      return;
    }

    const [latest] = await db
      .select({ createdAt: passwordResetTokens.createdAt })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, user.id))
      .orderBy(desc(passwordResetTokens.createdAt))
      .limit(1);
    if (latest && Date.now() - new Date(latest.createdAt).getTime() < PASSWORD_RESET_MIN_INTERVAL_MS) {
      logger.info({ userId: user.id }, 'PASSWORD_RESET_REQUEST_THROTTLED');
      return;
    }

    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenId = `prt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    await db.transaction(async (tx) => {
      await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id)); // um token ativo por conta
      await tx.insert(passwordResetTokens).values({
        id: tokenId,
        userId: user.id,
        token: hashPasswordResetToken(rawToken),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_EXPIRES_MINUTES * 60_000),
        createdAt: new Date(),
      });
    });

    try {
      await sendPasswordResetEmail({
        to: user.email,
        name: user.fullName,
        link: `${appUrl}/reset-password?token=${rawToken}`,
        expiresMinutes: PASSWORD_RESET_EXPIRES_MINUTES,
      });
    } catch (error: any) {
      // Um token que nunca foi entregue não pode ficar ativo.
      await db.delete(passwordResetTokens).where(eq(passwordResetTokens.id, tokenId));
      logger.error({ userId: user.id, error: error?.message }, 'PASSWORD_RESET_EMAIL_FAILED');
    }
  }

  /**
   * Conclui a redefinição: token de uso único (consumido por DELETE ... RETURNING, seguro sob
   * concorrência), troca o hash (bcrypt custo 12), revoga TODOS os refresh tokens da conta e apaga
   * suas sessões, tudo numa transação. NÃO marca o e-mail como verificado. Erros do token são sempre
   * o mesmo (inválido/expirado/já usado/conta inapta), sem distinguir o motivo.
   */
  static async resetPasswordWithToken(token: string, newPassword: string) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível para recuperação de senha.');

    const pw = String(newPassword || '');
    if (pw.length < PASSWORD_MIN_LENGTH || Buffer.byteLength(pw, 'utf8') > PASSWORD_MAX_BYTES) {
      const err: any = new Error(`A nova senha deve ter entre ${PASSWORD_MIN_LENGTH} e ${PASSWORD_MAX_BYTES} caracteres.`);
      err.code = 'PASSWORD_RESET_WEAK_PASSWORD'; // validado ANTES de consumir o token
      throw err;
    }

    const invalid = () => {
      const err: any = new Error('Link de recuperação inválido ou expirado. Solicite um novo.');
      err.code = 'PASSWORD_RESET_TOKEN_INVALID';
      return err;
    };
    const rawToken = String(token || '');
    if (rawToken.length < 20 || rawToken.length > 200) throw invalid();

    const newHash = await bcrypt.hash(pw, 12);
    const tokenHash = hashPasswordResetToken(rawToken);

    await db.transaction(async (tx) => {
      const consumed = await tx
        .delete(passwordResetTokens)
        .where(and(eq(passwordResetTokens.token, tokenHash), gt(passwordResetTokens.expiresAt, new Date())))
        .returning({ userId: passwordResetTokens.userId });
      if (consumed.length === 0) throw invalid();

      const userId = consumed[0].userId;
      const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
      const eligible = !!user && user.isActive !== false && typeof user.passwordHash === 'string' && user.passwordHash.startsWith('$2');
      if (!eligible) throw invalid(); // a transação inteira é desfeita

      await tx.update(users).set({ passwordHash: newHash, updatedAt: new Date() }).where(eq(users.id, userId));
      await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
      await tx.update(refreshTokens).set({ isRevoked: true }).where(eq(refreshTokens.userId, userId));
      await tx.delete(sessions).where(eq(sessions.userId, userId));
      await tx.insert(auditLogs).values({
        id: `aud_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        actorUserId: userId,
        action: 'auth.password_reset_completed',
        resource: 'users',
        resourceId: userId,
        detailsJson: { via: 'email_token' },
        createdAt: new Date(),
      });
    });

    return { message: 'Senha redefinida com sucesso. Faça login com a nova senha.' };
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
