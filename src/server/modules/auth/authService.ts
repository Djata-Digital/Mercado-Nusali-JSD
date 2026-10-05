import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDb } from '../../../db/index.js';
import { users, userProfiles, refreshTokens, wallets, emailVerificationTokens, sessions, sellers, sellerProfiles, countries, passwordResetTokens, auditLogs } from '../../../db/schema.js';
import { eq, and, gt, gte, lte, ne, desc } from 'drizzle-orm';
import { logger } from '../../infra/logger.js';
import { generateEmailVerificationCode, hashEmailVerificationCode, sendVerificationEmail, sendPasswordResetEmail } from './emailService.js';
import crypto from 'node:crypto';
import { getJwtAccessSecret, getJwtRefreshSecret } from './jwtConfig.js';
import { consumeRateLimit, resetRateLimitCounter, rateLimitAccountKey, getRateLimitCount } from '../../infra/rateLimiter.js';

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
export const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_BYTES = 72; // limite real do bcrypt: além disso a senha seria truncada em silêncio

/**
 * Verificação de e-mail: freios POR CONTA (independem do IP, que pode ser compartilhado por muitos usuários).
 * Contadores no Redis (ou na memória do processo quando o Redis está indisponível); sem coluna nova.
 */
export const EMAIL_VERIFICATION_MAX_FAILURES = 5;
export const EMAIL_RESEND_COOLDOWN_MS = 60_000;
export const EMAIL_RESEND_MAX_PER_HOUR = 5;
export const EMAIL_RESEND_GENERIC_MESSAGE = 'Se existir uma conta pendente de verificação para este e-mail, enviamos um novo código.';
const emailVerificationFailureKey = (userId: string) => `rl:auth:verify:fail:${userId}`;
// Um pouco maior que a vida do código: o contador nunca expira antes do código.
const emailVerificationFailureWindowMs = () => (Math.max(1, Number(process.env.EMAIL_VERIFICATION_EXPIRES_MINUTES || 10)) + 5) * 60_000;

/** 32 bytes aleatórios (CSPRNG) em base64url → `rt_` + 43 caracteres. */
export function generateRefreshTokenValue(): string {
  return `rt_${crypto.randomBytes(32).toString('base64url')}`;
}

export function hashPasswordResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Erro de fluxo de autenticação com `code` estável e status HTTP sugerido: as rotas mapeiam por `code`
 * (um erro SEM `code` é falha inesperada e nunca deve ser tratado como "sessão inválida" pelo cliente).
 */
export class AuthFlowError extends Error {
  code: string;
  httpStatus: number;
  constructor(code: string, message: string, httpStatus = 401) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

/**
 * Sessão <-> refresh token SEM coluna nova: os dois IDs saem do MESMO UUID (`sess_<uuid>` / `rt_<uuid>`) e o access
 * token carrega o `sid`. Assim "encerrar sessão" sabe qual refresh token revogar. IDs antigos (`rt_<ms>`,
 * `sess_<ms>_<rand>`) não têm esse vínculo: ver `legacyRefreshIdForSession`.
 */
const UUID_PATTERN = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
const SESSION_ID_PATTERN = new RegExp('^sess_' + UUID_PATTERN + '$');
const REFRESH_ID_PATTERN = new RegExp('^rt_' + UUID_PATTERN + '$');
export function newSessionIdentity() {
  const uuid = crypto.randomUUID();
  return { refreshId: `rt_${uuid}`, sessionId: `sess_${uuid}` };
}
export function refreshIdForSessionId(sessionId: string | null | undefined): string | null {
  const m = SESSION_ID_PATTERN.exec(String(sessionId || ''));
  return m ? `rt_${m[1]}` : null;
}
export function sessionIdForRefreshId(refreshId: string | null | undefined): string | null {
  const m = REFRESH_ID_PATTERN.exec(String(refreshId || ''));
  return m ? `sess_${m[1]}` : null;
}
// Sessões/tokens emitidos antes do vínculo por UUID: o refresh token foi criado no mesmo instante da linha de sessão.
const LEGACY_SESSION_MATCH_MS = 5_000;
// Reuso de um refresh token recém-girado dentro desta janela = corrida benigna (duas abas): só recusa. Depois dela
// é tratado como reuso suspeito e a cadeia de sucessores é revogada. (Lido a cada chamada: os testes alteram.)
const refreshReuseGraceMs = () => {
  const v = Number(process.env.REFRESH_REUSE_GRACE_MS);
  return process.env.REFRESH_REUSE_GRACE_MS !== undefined && Number.isFinite(v) && v >= 0 ? v : 10_000;
};

/** Login: freio POR CONTA (independe do IP). Conta só falhas; um acerto ou a redefinição de senha zeram. */
export const LOGIN_MAX_FAILURES_PER_ACCOUNT = 10;
const LOGIN_FAILURE_WINDOW_MS = 15 * 60_000;
const loginFailureKey = (accountKey: string) => `rl:auth:login:fail:${accountKey}`;
/** Troca de senha: tentativas ERRADAS da senha atual (quem tem só um token não pode adivinhar a senha). */
export const CHANGE_PASSWORD_MAX_FAILURES = 5;
const CHANGE_PASSWORD_FAILURE_WINDOW_MS = 15 * 60_000;

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

    // Apenas um código ativo por usuário (e a contagem de erros recomeça para o código novo).
    await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, user.id));
    await resetRateLimitCounter(emailVerificationFailureKey(user.id));
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

  /**
   * Verificação do e-mail. Uma sessão só nasce de um código correto e vigente da própria conta:
   *  - conta já verificada → resposta idempotente SEM sessão (`alreadyVerified`), qualquer que seja o código;
   *  - código errado/expirado/ausente ou conta inexistente → falha, sem sessão;
   *  - EMAIL_VERIFICATION_MAX_FAILURES erros seguidos invalidam o código ativo (exige reenvio): limita os
   *    palpites sobre um código de 6 dígitos mesmo com IPs diferentes.
   */
  static async verifyEmail(email: string, code: string) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível para verificação de e-mail.');

    const cleanEmail = email.trim().toLowerCase();
    const found = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);
    if (!found.length) throw new Error('Código inválido ou expirado.');

    const user = found[0];
    if (user.isEmailVerified) {
      return {
        alreadyVerified: true,
        message: 'Este e-mail já está verificado. Faça login para continuar.',
      };
    }

    const tokenHash = hashEmailVerificationCode(code);
    const tokens = await db.select().from(emailVerificationTokens).where(and(
      eq(emailVerificationTokens.userId, user.id),
      eq(emailVerificationTokens.token, tokenHash),
      gt(emailVerificationTokens.expiresAt, new Date()),
    )).limit(1);

    if (!tokens.length) {
      const failKey = emailVerificationFailureKey(user.id);
      const { count } = await consumeRateLimit(failKey, emailVerificationFailureWindowMs(), EMAIL_VERIFICATION_MAX_FAILURES);
      if (count >= EMAIL_VERIFICATION_MAX_FAILURES) {
        await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, user.id));
        await resetRateLimitCounter(failKey);
        logger.warn({ userId: user.id }, 'EMAIL_VERIFICATION_CODE_INVALIDATED_TOO_MANY_FAILURES');
        throw new Error('Muitas tentativas incorretas. Solicite um novo código.');
      }
      throw new Error('Código inválido ou expirado. Solicite um novo código.');
    }

    const updated = await db.update(users).set({ isEmailVerified: true, updatedAt: new Date() }).where(eq(users.id, user.id)).returning();
    await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, user.id));
    await resetRateLimitCounter(emailVerificationFailureKey(user.id));

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

  /**
   * Reenvio do código. A resposta é SEMPRE a mesma (nunca revela se o e-mail existe nem se já foi
   * verificado) e o envio tem limite POR CONTA: 1 a cada 60 s e 5 por hora; acima disso responde igual,
   * sem enviar (nem emite código novo, o que também impede quem conhece o e-mail de "queimar" o código
   * vigente em loop).
   */
  static async resendEmailVerification(email: string) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível para verificação de e-mail.');
    const cleanEmail = email.trim().toLowerCase();
    const accountKey = rateLimitAccountKey(cleanEmail);

    if (accountKey) {
      const cooldown = await consumeRateLimit(`rl:auth:resend:cd:${accountKey}`, EMAIL_RESEND_COOLDOWN_MS, 1);
      if (!cooldown.allowed) return { message: EMAIL_RESEND_GENERIC_MESSAGE };
      const hourly = await consumeRateLimit(`rl:auth:resend:hr:${accountKey}`, 60 * 60_000, EMAIL_RESEND_MAX_PER_HOUR);
      if (!hourly.allowed) return { message: EMAIL_RESEND_GENERIC_MESSAGE };
    }

    const found = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);
    const user = found[0];
    if (!user || user.isEmailVerified) return { message: EMAIL_RESEND_GENERIC_MESSAGE };

    try {
      await this.issueEmailVerificationCode({ id: user.id, email: user.email, fullName: user.fullName });
    } catch (error: any) {
      logger.error({ userId: user.id, error: error?.message }, 'Verification e-mail resend failed');
      // Mensagem fixa: o erro do provedor de e-mail nunca chega ao cliente.
      throw new Error('Não foi possível reenviar o código agora. Tente novamente em instantes.');
    }
    return { message: EMAIL_RESEND_GENERIC_MESSAGE };
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

    // Freio por conta: 10 falhas em 15 min bloqueiam novas tentativas dessa conta (mesmo com a senha certa) até a
    // janela passar ou a senha ser redefinida. Vale igual para e-mail existente ou não: não revela nada.
    const accountKey = rateLimitAccountKey(cleanEmail);
    const failKey = accountKey ? loginFailureKey(accountKey) : null;
    if (failKey && (await getRateLimitCount(failKey)) >= LOGIN_MAX_FAILURES_PER_ACCOUNT) {
      throw new AuthFlowError('LOGIN_LOCKED', 'Muitas tentativas de login para esta conta. Aguarde alguns minutos ou use "Esqueci minha senha".', 429);
    }
    const rejectCredentials = async (): Promise<never> => {
      if (failKey) await consumeRateLimit(failKey, LOGIN_FAILURE_WINDOW_MS, LOGIN_MAX_FAILURES_PER_ACCOUNT);
      throw new Error('E-mail ou senha incorretos.');
    };

    const found = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);

    if (found.length === 0) {
      return rejectCredentials();
    }

    const userRecord = found[0];

    if (!userRecord.passwordHash) {
      return rejectCredentials();
    }

    const isMatch = await bcrypt.compare(data.password, userRecord.passwordHash);
    if (!isMatch) {
      return rejectCredentials();
    }
    if (failKey) await resetRateLimitCounter(failKey);

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
    const issued = await this.issueSessionTokens(user, meta);
    return issued.tokens;
  }

  /**
   * Emite access + refresh token e grava refresh token + sessão (juntos, numa transação — ou dentro de `tx`, quando
   * o chamador já tem uma). Falha ao gravar FALHA a operação: nunca devolve um token que não existe no banco.
   */
  static async issueSessionTokens(
    user: { id: string; email: string; role: string; fullName: string; countryCode: string; kycStatus: string; isEmailVerified?: boolean },
    meta?: { ipAddress?: string; userAgent?: string },
    tx?: any,
    identity: { refreshId: string; sessionId: string } = newSessionIdentity()
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
        sid: identity.sessionId,
      },
      getJwtAccessSecret(),
      { expiresIn: 7200 }
    );

    // Refresh token opaco com 256 bits de entropia (CSPRNG). Contrato inalterado: string opaca com prefixo `rt_`,
    // guardada/consultada por igualdade em refresh_tokens. Tokens já emitidos continuam válidos.
    const refreshTokenRaw = generateRefreshTokenValue();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_EXPIRES_IN_DAYS);

    const db = getDb();
    if (db) {
      const persist = async (executor: any) => {
        await executor.insert(refreshTokens).values({
          id: identity.refreshId,
          userId: user.id,
          tokenHash: refreshTokenRaw,
          expiresAt,
          isRevoked: false,
          createdAt: new Date(),
        });
        // Linha de sessão (7 dias) ligada ao refresh token pelo mesmo UUID.
        await executor.insert(sessions).values({
          id: identity.sessionId,
          userId: user.id,
          token: accessToken,
          ipAddress: meta?.ipAddress || null,
          userAgent: meta?.userAgent || null,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          createdAt: new Date(),
        });
      };
      try {
        if (tx) await persist(tx);
        else await db.transaction(async (t) => persist(t));
      } catch (err: any) {
        logger.error({ userId: user.id, error: err?.message }, 'Failed to persist refresh token or session');
        throw new AuthFlowError('SESSION_PERSIST_FAILED', 'Não foi possível iniciar a sessão agora. Tente novamente em instantes.', 503);
      }
    }

    return {
      tokens: {
        token: accessToken,
        accessToken,
        refreshToken: refreshTokenRaw,
        expiresIn: 7200, // 2 hours in seconds
      },
      refreshTokenId: identity.refreshId,
      sessionId: identity.sessionId,
    };
  }

  /**
   * Renovação com rotação ATÔMICA: o token só é consumido por `UPDATE ... WHERE is_revoked=false RETURNING`, então de
   * duas renovações paralelas com o mesmo token só uma emite um token novo (a outra é recusada). Conta inativa nunca
   * renova (e perde seus tokens). Reuso de token já girado: ver `handleRevokedRefreshReuse`.
   * Erros esperados são `AuthFlowError` (a rota responde 401); qualquer outro erro é falha transitória (a rota responde 503
   * e o cliente NÃO apaga a sessão).
   */
  static async refreshToken(refreshTokenString: string) {
    const db = getDb();
    if (!db) {
      throw new Error('Banco de dados indisponível para renovação de sessão.');
    }

    const invalid = () => new AuthFlowError('REFRESH_INVALID', 'Refresh token inválido ou já revogado.');
    const raw = typeof refreshTokenString === 'string' ? refreshTokenString : '';
    if (!raw || raw.length > 200) throw invalid();

    const [tokenRecord] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, raw)).limit(1);
    if (!tokenRecord) throw invalid();

    if (tokenRecord.isRevoked) {
      await this.handleRevokedRefreshReuse(db, tokenRecord);
      throw invalid();
    }
    if (new Date() > new Date(tokenRecord.expiresAt)) {
      throw new AuthFlowError('REFRESH_EXPIRED', 'Refresh token expirado. Por favor, faça login novamente.');
    }

    const [user] = await db.select().from(users).where(eq(users.id, tokenRecord.userId)).limit(1);
    if (!user) {
      throw new AuthFlowError('REFRESH_INVALID', 'Usuário associado ao token não encontrado.');
    }
    if (user.isActive === false) {
      // Conta suspensa/desativada: nenhuma sessão dela pode continuar.
      await db.transaction(async (tx) => {
        await tx.update(refreshTokens).set({ isRevoked: true }).where(eq(refreshTokens.userId, user.id));
        await tx.delete(sessions).where(eq(sessions.userId, user.id));
      });
      throw new AuthFlowError('ACCOUNT_INACTIVE', 'Esta conta está desativada ou suspensa. Contate o suporte.');
    }

    const identity = newSessionIdentity();
    const issued = await db.transaction(async (tx) => {
      // Consome o token de forma atômica; `replaced_by_token` aponta para o ID (nunca o segredo) do sucessor.
      const claimed = await tx
        .update(refreshTokens)
        .set({ isRevoked: true, replacedByToken: identity.refreshId })
        .where(and(eq(refreshTokens.id, tokenRecord.id), eq(refreshTokens.isRevoked, false)))
        .returning({ id: refreshTokens.id });
      if (claimed.length === 0) return null;

      // A linha de sessão do token antigo dá lugar à nova (uma linha por dispositivo); IP/dispositivo são herdados.
      const oldSessionId = sessionIdForRefreshId(tokenRecord.id);
      let meta: { ipAddress?: string; userAgent?: string } | undefined;
      if (oldSessionId) {
        const [oldSession] = await tx.select().from(sessions).where(and(eq(sessions.id, oldSessionId), eq(sessions.userId, user.id))).limit(1);
        if (oldSession) meta = { ipAddress: oldSession.ipAddress || undefined, userAgent: oldSession.userAgent || undefined };
        await tx.delete(sessions).where(and(eq(sessions.id, oldSessionId), eq(sessions.userId, user.id)));
      }
      return this.issueSessionTokens(user, meta, tx, identity);
    });

    if (!issued) {
      // Outra renovação consumiu o token primeiro (corrida): recusa, sem emitir um segundo token.
      const [latest] = await db.select().from(refreshTokens).where(eq(refreshTokens.id, tokenRecord.id)).limit(1);
      if (latest) await this.handleRevokedRefreshReuse(db, latest);
      throw invalid();
    }
    return issued.tokens;
  }

  /**
   * Token já revogado foi apresentado. Se ele foi GIRADO (tem sucessor): dentro da janela de graça é só uma corrida entre
   * abas (nada além da recusa); depois dela é reuso suspeito, e a cadeia de sucessores (as sessões derivadas dele) é
   * revogada. Revogado por logout/redefinição/troca de senha/suspensão (sem sucessor): apenas recusa.
   */
  private static async handleRevokedRefreshReuse(db: any, record: { id: string; userId: string; replacedByToken: string | null }) {
    const successorId = record.replacedByToken;
    if (!successorId) return;
    const [successor] = await db.select().from(refreshTokens).where(eq(refreshTokens.id, successorId)).limit(1);
    if (successor && Date.now() - new Date(successor.createdAt).getTime() <= refreshReuseGraceMs()) return;

    let currentId: string | null = successorId;
    for (let depth = 0; currentId && depth < 50; depth++) {
      const rows: Array<{ replacedByToken: string | null }> = await db
        .update(refreshTokens)
        .set({ isRevoked: true })
        .where(and(eq(refreshTokens.id, currentId), eq(refreshTokens.userId, record.userId)))
        .returning({ replacedByToken: refreshTokens.replacedByToken });
      const linkedSession = sessionIdForRefreshId(currentId);
      if (linkedSession) await db.delete(sessions).where(and(eq(sessions.id, linkedSession), eq(sessions.userId, record.userId)));
      currentId = rows[0]?.replacedByToken ?? null;
    }
    logger.warn({ userId: record.userId }, 'REFRESH_TOKEN_REUSE_DETECTED_CHAIN_REVOKED');
  }

  /** Sessão legada (sem UUID): o refresh token dela é o criado no mesmo instante que a linha de sessão. */
  private static async legacyRefreshIdForSession(db: any, userId: string, sessionCreatedAt: Date | string): Promise<string | null> {
    const at = new Date(sessionCreatedAt).getTime();
    const candidates = await db
      .select({ id: refreshTokens.id, createdAt: refreshTokens.createdAt })
      .from(refreshTokens)
      .where(and(
        eq(refreshTokens.userId, userId),
        gte(refreshTokens.createdAt, new Date(at - LEGACY_SESSION_MATCH_MS)),
        lte(refreshTokens.createdAt, new Date(at + LEGACY_SESSION_MATCH_MS)),
      ));
    let best: { id: string; diff: number } | null = null;
    for (const c of candidates as Array<{ id: string; createdAt: Date }>) {
      const diff = Math.abs(new Date(c.createdAt).getTime() - at);
      if (!best || diff < best.diff) best = { id: c.id, diff };
    }
    return best ? best.id : null;
  }

  /** Descobre a sessão e o refresh token do request atual: claim `sid`; senão a linha com o access token exato. */
  private static async resolveCurrentSession(db: any, userId: string, current?: { sessionId?: string; accessToken?: string }) {
    const bySid = refreshIdForSessionId(current?.sessionId);
    if (current?.sessionId && bySid) return { sessionId: current.sessionId as string | null, refreshId: bySid as string | null };
    if (current?.accessToken) {
      const [row] = await db.select().from(sessions).where(and(eq(sessions.userId, userId), eq(sessions.token, current.accessToken))).limit(1);
      if (row) {
        const linked = refreshIdForSessionId(row.id) ?? (await this.legacyRefreshIdForSession(db, userId, row.createdAt));
        return { sessionId: row.id as string | null, refreshId: linked as string | null };
      }
    }
    return { sessionId: null as string | null, refreshId: null as string | null };
  }

  /** Revoga o refresh token e apaga a linha de sessão de UMA sessão do usuário. */
  static async revokeSession(userId: string, sessionId: string) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível para encerrar sessão.');
    const [row] = await db.select().from(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId))).limit(1);
    if (!row) return { revoked: false };
    const refreshId = refreshIdForSessionId(row.id) ?? (await this.legacyRefreshIdForSession(db, userId, row.createdAt));
    await db.transaction(async (tx) => {
      await tx.delete(sessions).where(and(eq(sessions.id, row.id), eq(sessions.userId, userId)));
      if (refreshId) await tx.update(refreshTokens).set({ isRevoked: true }).where(and(eq(refreshTokens.id, refreshId), eq(refreshTokens.userId, userId)));
    });
    return { revoked: true };
  }

  /** "Encerrar as outras sessões": mantém a sessão atual e revoga os refresh tokens e as linhas de todas as demais. */
  static async revokeOtherSessions(userId: string, current?: { sessionId?: string; accessToken?: string }) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível para encerrar sessões.');
    const keep = await this.resolveCurrentSession(db, userId, current);
    await db.transaction(async (tx) => {
      await this.revokeAllExcept(tx, userId, keep);
    });
    return { keptSessionId: keep.sessionId };
  }

  private static async revokeAllExcept(executor: any, userId: string, keep: { sessionId: string | null; refreshId: string | null }) {
    await executor
      .update(refreshTokens)
      .set({ isRevoked: true })
      .where(keep.refreshId
        ? and(eq(refreshTokens.userId, userId), eq(refreshTokens.isRevoked, false), ne(refreshTokens.id, keep.refreshId))
        : and(eq(refreshTokens.userId, userId), eq(refreshTokens.isRevoked, false)));
    await executor
      .delete(sessions)
      .where(keep.sessionId
        ? and(eq(sessions.userId, userId), ne(sessions.id, keep.sessionId))
        : eq(sessions.userId, userId));
  }

  /**
   * Troca de senha: exige a senha ATUAL (sempre), a nova com no mínimo PASSWORD_MIN_LENGTH caracteres, e encerra as OUTRAS
   * sessões da conta (a atual continua). Tentativas erradas da senha atual têm freio por conta.
   */
  static async changePassword(
    userId: string,
    data: { currentPassword?: string; newPassword: string },
    current?: { sessionId?: string; accessToken?: string }
  ) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível para alteração de senha.');

    const newPassword = typeof data.newPassword === 'string' ? data.newPassword : '';
    if (newPassword.length < PASSWORD_MIN_LENGTH || Buffer.byteLength(newPassword, 'utf8') > PASSWORD_MAX_BYTES) {
      throw new AuthFlowError('PASSWORD_WEAK', `A nova senha deve ter entre ${PASSWORD_MIN_LENGTH} e ${PASSWORD_MAX_BYTES} caracteres.`, 400);
    }

    const found = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!found.length) {
      throw new Error('Usuário não encontrado.');
    }

    const user = found[0];

    if (typeof user.passwordHash !== 'string' || !user.passwordHash) {
      throw new AuthFlowError('PASSWORD_NOT_SET', 'Esta conta ainda não tem uma senha definida. Use "Esqueci minha senha".', 400);
    }
    const currentPassword = typeof data.currentPassword === 'string' ? data.currentPassword : '';
    if (!currentPassword) {
      throw new AuthFlowError('CURRENT_PASSWORD_REQUIRED', 'Informe a senha atual para alterar a senha.', 400);
    }

    const failKey = `rl:auth:chpw:fail:${userId}`;
    if ((await getRateLimitCount(failKey)) >= CHANGE_PASSWORD_MAX_FAILURES) {
      throw new AuthFlowError('TOO_MANY_ATTEMPTS', 'Muitas tentativas incorretas. Aguarde alguns minutos e tente novamente.', 429);
    }
    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      await consumeRateLimit(failKey, CHANGE_PASSWORD_FAILURE_WINDOW_MS, CHANGE_PASSWORD_MAX_FAILURES);
      throw new AuthFlowError('CURRENT_PASSWORD_INVALID', 'A senha atual informada está incorreta.', 400);
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12);
    const keep = await this.resolveCurrentSession(db, userId, current);

    await db.transaction(async (tx) => {
      await tx.update(users).set({
        passwordHash: newPasswordHash,
        updatedAt: new Date(),
      }).where(eq(users.id, userId));
      await this.revokeAllExcept(tx, userId, keep);
    });
    await resetRateLimitCounter(failKey);

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

    let resetEmail: string | null = null;
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
      resetEmail = user.email;

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

    // Quem provou ser o dono do e-mail volta a poder entrar: zera o bloqueio de login por tentativas erradas.
    const resetAccountKey = rateLimitAccountKey(resetEmail);
    if (resetAccountKey) await resetRateLimitCounter(loginFailureKey(resetAccountKey));

    return { message: 'Senha redefinida com sucesso. Faça login com a nova senha.' };
  }

  static async logout(refreshTokenString?: string, accessToken?: string, sessionId?: string) {
    const db = getDb();
    if (db) {
      if (refreshTokenString) {
        await db.update(refreshTokens).set({ isRevoked: true }).where(eq(refreshTokens.tokenHash, refreshTokenString));
      }
      if (accessToken) {
        await db.delete(sessions).where(eq(sessions.token, accessToken));
      }
      // Sessão identificada pelo `sid`: encerra também o refresh token ligado a ela (mesmo sem o corpo da requisição).
      const linkedRefreshId = refreshIdForSessionId(sessionId);
      if (sessionId && linkedRefreshId) {
        await db.update(refreshTokens).set({ isRevoked: true }).where(eq(refreshTokens.id, linkedRefreshId));
        await db.delete(sessions).where(eq(sessions.id, sessionId));
      }
    }
    return { success: true };
  }
}
