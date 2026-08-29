import { Router, Request, Response } from 'express';
import { requireAuth, AuthRequest } from './modules/auth/authMiddleware.js';
import { AuthService } from './modules/auth/authService.js';
import { OrderService } from './modules/orders/orderService.js';
import { getDb, checkDbConnection } from '../db/index.js';
import {
  products,
  orders,
  orderItems,
  orderStatusHistory,
  warehouses,
  inventory,
  inventoryMovements,
  stockReservations,
  shipments,
  shippingLabels,
  trackingEvents,
  carts,
  cartItems,
  coupons,
  couponUsages,
  campaigns,
  wallets,
  walletTransactions,
  returns,
  disputes,
  disputeMessages,
  conversations,
  messages,
  supportTickets,
  supportTicketMessages,
  users,
  userProfiles,
  addresses,
  notifications,
  sessions,
  favorites,
  productQuestions,
  productAnswers,
  productVariants,
  reviews,
  reviewImages,
} from '../db/schema.js';
import { getCache, setCache, delCache } from '../db/redis.js';
import { eq, desc, and, or, isNull } from 'drizzle-orm';
import { createBuyerDispute, RefundValidationError } from './modules/payments/refundService.js';
import { updateBuyerTaxId, BuyerProfileValidationError } from './modules/buyer/buyerProfileService.js';

export const buyerRouter = Router();
buyerRouter.use(requireAuth);

// ==========================================
// UNIFIED REAL STATE ENGINE FOR BUYER PANEL
// ==========================================

export interface BuyerProfileData {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  taxId: string;
  country: string;
  city: string;
  address: string;
  avatar: string;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  is2FAEnabled: boolean;
  kycStatus: 'verified' | 'under_review' | 'pending' | 'unverified';
  preferredCurrency: string;
  membership: 'standard' | 'nusali_plus';
  createdAt: string;
}

export interface BuyerAddress {
  id: string;
  recipientName: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood?: string;
  city: string;
  state: string;
  country: string;
  zipCode: string;
  phone: string;
  isDefault: boolean;
}

export interface BuyerWalletTransaction {
  id: string;
  type: 'deposit' | 'purchase' | 'cashback' | 'refund' | 'transfer';
  title: string;
  amount: number;
  currency: string;
  date: string;
  status: 'Concluído' | 'Escrow Retido' | 'Acreditado' | 'Pendente';
  method: string;
}

export interface BuyerCoupon {
  id: string;
  code: string;
  discount: string;
  discountPercentage: number;
  description: string;
  validUntil: string;
  isClaimed: boolean;
  minPurchase?: number;
  category?: string;
}

export interface BuyerReturn {
  id: string;
  orderId: string;
  productTitle: string;
  productImage?: string;
  reason: string;
  description: string;
  amount: number;
  currency: string;
  status: 'under_review' | 'approved' | 'in_transit' | 'refunded' | 'rejected';
  date: string;
  trackingLabelCode: string;
}

export interface BuyerDispute {
  id: string;
  orderId: string;
  orderNumber: string;
  productTitle: string;
  sellerName: string;
  reason: string;
  description: string;
  amount: number;
  currency: string;
  status: 'opened' | 'in_mediation' | 'refunded' | 'resolved' | 'closed';
  date: string;
  messages: {
    id: string;
    sender: 'buyer' | 'seller' | 'admin' | 'mediator';
    senderName: string;
    text: string;
    timestamp: string;
  }[];
}

export interface BuyerNotification {
  id: string;
  type: 'orders' | 'escrow' | 'promos' | 'system';
  title: string;
  message: string;
  time: string;
  isRead: boolean;
  targetView: 'tracking' | 'order_detail' | 'coupons' | 'profile' | 'wallet' | 'disputes';
  orderId?: string;
}

export interface BuyerChatMessage {
  id: string;
  sender: 'buyer' | 'seller' | 'ai' | 'support';
  text: string;
  time: string;
}

export interface BuyerChatThread {
  id: string;
  name: string;
  avatar: string;
  isOfficial?: boolean;
  isAi?: boolean;
  lastMessage: string;
  lastTime: string;
  unreadCount: number;
  messages: BuyerChatMessage[];
}

export interface BuyerReview {
  id: string;
  productId: string;
  productTitle: string;
  productImage: string;
  rating: number;
  title: string;
  comment: string;
  date: string;
  verifiedPurchase: boolean;
  likes: number;
}

export interface BuyerSupportTicket {
  id: string;
  subject: string;
  category: string;
  status: 'open' | 'in_progress' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  createdAt: string;
  lastUpdate: string;
  messages: { sender: string; text: string; time: string }[];
}

// In-memory persistent state engine with real initial data
export const buyerDataStore = {

  wallet: {
    balance: 0,
    cashbackBalance: 0,
    pendingEscrowBalance: 0,
    currency: 'XOF',
    savedCards: [],
    transactions: [],
  },

  coupons: [] as BuyerCoupon[],

  favorites: [],

  returns: [] as BuyerReturn[],

  disputes: [] as BuyerDispute[],

  orders: [],

  tickets: [] as BuyerSupportTicket[],

  notifications: [] as any[],

  chats: [] as any[],

  reviews: [] as any[],
};

// ==========================================
// 1. BUYER PROFILE & OVERVIEW STATS
// ==========================================

async function loadRealBuyerProfile(userId: string): Promise<BuyerProfileData | null> {
  const db = getDb();
  if (!db) return null;

  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const u = userRows[0];
  if (!u) return null;

  const profileRows = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  const p = profileRows[0];

  let addressRows = await db.select().from(addresses)
    .where(and(eq(addresses.userId, userId), eq(addresses.isDefault, true)))
    .limit(1);
  if (addressRows.length === 0) {
    addressRows = await db.select().from(addresses).where(eq(addresses.userId, userId)).limit(1);
  }
  const a = addressRows[0];
  const address = a
    ? [a.street, a.number, a.complement, a.neighborhood, a.city, a.state].filter(Boolean).join(', ')
    : '';

  return {
    id: u.id,
    fullName: u.fullName || '',
    email: u.email || '',
    phone: u.phone || '',
    taxId: p?.taxId || '',
    country: u.countryCode || '',
    city: a?.city || '',
    address,
    avatar: u.avatarUrl || '',
    isEmailVerified: Boolean(u.isEmailVerified),
    isPhoneVerified: Boolean(u.isPhoneVerified),
    is2FAEnabled: Boolean(u.isTwoFactorEnabled),
    kycStatus: (u.kycStatus || 'unverified') as BuyerProfileData['kycStatus'],
    preferredCurrency: p?.preferredCurrency || 'XOF',
    membership: (p?.membershipLevel || 'standard') as BuyerProfileData['membership'],
    createdAt: u.createdAt?.toISOString?.() || String(u.createdAt || ''),
  };
}

buyerRouter.get('/profile', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const profile = await loadRealBuyerProfile(req.user!.id);
    if (!profile) {
      return res.status(404).json({ success: false, error: { code: 'PROFILE_NOT_FOUND', message: 'Usuário não encontrado.' } });
    }
    return res.json({ success: true, data: profile });
  } catch (error) {
    return res.status(500).json({ success: false, error: { code: 'PROFILE_LOAD_FAILED', message: 'Não foi possível carregar o perfil.' } });
  }
});

buyerRouter.put('/profile', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      return res.status(503).json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Banco de dados indisponível.' } });
    }

    const userId = req.user!.id;
    const { fullName, phone, country, avatar, city, taxId } = req.body ?? {};
    const userUpdates: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof fullName === 'string') userUpdates.fullName = fullName.trim();
    if (typeof phone === 'string') userUpdates.phone = phone.trim() || null;
    if (typeof country === 'string' && country.trim()) userUpdates.countryCode = country.trim().toUpperCase();
    if (typeof avatar === 'string') userUpdates.avatarUrl = avatar.trim() || null;

    await db.update(users).set(userUpdates).where(eq(users.id, userId));

    // BLOCKER_LAUNCH (fase "Desbloqueio do lançamento") corrigido em
    // updateBuyerTaxId(): userId vem exclusivamente de req.user.id (nunca do
    // corpo da requisição) — um comprador nunca altera o perfil de outro.
    if (typeof taxId === 'string') {
      const effectiveCountryCode = (typeof country === 'string' && country.trim() ? country.trim() : (req.user!.countryCode || ''));
      try {
        await updateBuyerTaxId({ userId, taxId, effectiveCountryCode });
      } catch (err: any) {
        if (err instanceof BuyerProfileValidationError) {
          return res.status(err.status).json({ success: false, error: { code: err.code, message: err.message } });
        }
        throw err;
      }
    }

    // City belongs to addresses. Update it only when the user already has an address;
    // never create a fabricated address just to persist a city.
    if (typeof city === 'string' && city.trim()) {
      let addressRows = await db.select().from(addresses)
        .where(and(eq(addresses.userId, userId), eq(addresses.isDefault, true)))
        .limit(1);
      if (addressRows.length === 0) {
        addressRows = await db.select().from(addresses).where(eq(addresses.userId, userId)).limit(1);
      }
      if (addressRows[0]) {
        await db.update(addresses)
          .set({ city: city.trim(), updatedAt: new Date() })
          .where(eq(addresses.id, addressRows[0].id));
      }
    }

    const profile = await loadRealBuyerProfile(userId);
    return res.json({ success: true, message: 'Perfil atualizado com sucesso.', data: profile });
  } catch (error) {
    return res.status(500).json({ success: false, error: { code: 'PROFILE_UPDATE_FAILED', message: 'Não foi possível atualizar o perfil.' } });
  }
});

buyerRouter.get('/overview', requireAuth, async (req: AuthRequest, res: Response) => {
  const db = getDb();
  const userId = req.user!.id;
  const userOrders = await OrderService.getOrdersByBuyer(userId);
  const activeOrdersCount = userOrders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled').length;
  const totalOrdersCount = userOrders.length;
  const claimedCouponsCount = 0;

  let unreadNotificationsCount = 0;
  if (db) {
    const unread = await db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    unreadNotificationsCount = unread.length;
  }

  const realProfile = await loadRealBuyerProfile(userId);
  if (!realProfile) {
    return res.status(404).json({ success: false, error: { code: 'PROFILE_NOT_FOUND', message: 'Usuário não encontrado.' } });
  }

  return res.json({
    success: true,
    data: {
      profile: realProfile,
      metrics: {
        activeOrdersCount,
        totalOrdersCount,
        walletBalance: buyerDataStore.wallet.balance,
        cashbackBalance: buyerDataStore.wallet.cashbackBalance,
        pendingEscrowBalance: buyerDataStore.wallet.pendingEscrowBalance,
        favoritesCount: buyerDataStore.favorites.length,
        claimedCouponsCount,
        totalCouponsCount: buyerDataStore.coupons.length,
        openDisputesCount: buyerDataStore.disputes.filter(d => d.status === 'opened' || d.status === 'in_mediation').length,
        activeReturnsCount: buyerDataStore.returns.filter(r => r.status === 'under_review' || r.status === 'in_transit').length,
        unreadNotificationsCount,
      },
      recentOrders: userOrders.slice(0, 3),
      recentTransactions: buyerDataStore.wallet.transactions.slice(0, 3),
    },
  });
});

// ==========================================
// 2. SECURITY & SESSIONS (REAL DB)
// ==========================================

buyerRouter.get('/security', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Banco de dados indisponível.' } });

    const userId = req.user!.id;
    const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (userRows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Usuário não encontrado.' } });
    }
    const u = userRows[0];

    const activeSessions = await db.select().from(sessions).where(eq(sessions.userId, userId)).orderBy(desc(sessions.createdAt));
    const authHeader = req.headers.authorization;
    const currentToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;

    return res.json({
      success: true,
      data: {
        is2FAEnabled: Boolean(u.isTwoFactorEnabled),
        isEmailVerified: Boolean(u.isEmailVerified),
        isPhoneVerified: Boolean(u.isPhoneVerified),
        email: u.email,
        phone: u.phone || '',
        sessions: activeSessions.map(s => ({
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
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { code: 'SECURITY_FETCH_FAILED', message: error?.message || 'Erro ao carregar dados de segurança.' } });
  }
});

buyerRouter.post('/security/password', requireAuth, async (req: AuthRequest, res: Response) => {
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

buyerRouter.post('/security/2fa', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Banco de dados indisponível.' } });

    const userId = req.user!.id;
    const { enabled } = req.body;

    if (enabled) {
      return res.status(400).json({
        success: false,
        error: {
          code: '2FA_NOT_CONFIGURED',
          message: 'A autenticação em duas etapas (TOTP/Authenticator) requer a configuração prévia de um aplicativo autenticador.',
        },
      });
    }

    await db.update(users).set({ isTwoFactorEnabled: false, updatedAt: new Date() }).where(eq(users.id, userId));

    return res.json({
      success: true,
      message: '2FA desativada.',
      data: { is2FAEnabled: false },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { code: '2FA_UPDATE_FAILED', message: error?.message || 'Erro ao atualizar 2FA.' } });
  }
});

buyerRouter.get('/security/sessions', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Banco de dados indisponível.' } });

    const userId = req.user!.id;
    const authHeader = req.headers.authorization;
    const currentToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;

    const activeSessions = await db.select().from(sessions).where(eq(sessions.userId, userId)).orderBy(desc(sessions.createdAt));

    return res.json({
      success: true,
      data: activeSessions.map(s => ({
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
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { code: 'SESSIONS_FETCH_FAILED', message: error?.message || 'Erro ao carregar sessões.' } });
  }
});

buyerRouter.delete('/security/sessions/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Banco de dados indisponível.' } });

    const userId = req.user!.id;
    const { id } = req.params;
    const authHeader = req.headers.authorization;
    const currentToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;

    await db.delete(sessions).where(and(eq(sessions.id, id), eq(sessions.userId, userId)));

    const activeSessions = await db.select().from(sessions).where(eq(sessions.userId, userId)).orderBy(desc(sessions.createdAt));

    return res.json({
      success: true,
      message: 'Sessão encerrada com sucesso.',
      data: activeSessions.map(s => ({
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
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { code: 'SESSION_REVOKE_FAILED', message: error?.message || 'Erro ao encerrar sessão.' } });
  }
});

// ==========================================
// 3. ADDRESSES (REAL DB CRUD)
// ==========================================

buyerRouter.get('/addresses', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Banco de dados indisponível.' } });

    const userId = req.user!.id;
    const userAddresses = await db.select().from(addresses).where(eq(addresses.userId, userId)).orderBy(desc(addresses.isDefault), desc(addresses.createdAt));

    return res.json({
      success: true,
      data: userAddresses.map(a => ({
        id: a.id,
        recipientName: a.recipientName,
        street: a.street,
        number: a.number,
        complement: a.complement || '',
        neighborhood: a.neighborhood || '',
        city: a.city,
        state: a.state,
        country: a.countryCode,
        zipCode: a.zipCode || '',
        phone: a.phone,
        isDefault: a.isDefault,
        addressType: a.addressType,
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { code: 'ADDRESSES_FETCH_FAILED', message: error?.message || 'Erro ao buscar endereços.' } });
  }
});

buyerRouter.post('/addresses', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Banco de dados indisponível.' } });

    const userId = req.user!.id;
    const { recipientName, street, number, complement, neighborhood, city, state, country, countryCode, zipCode, phone, isDefault } = req.body;

    if (!recipientName || !street || !city) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'Nome do destinatário, rua e cidade são obrigatórios.' } });
    }

    const existingAddresses = await db.select().from(addresses).where(eq(addresses.userId, userId));
    const shouldBeDefault = Boolean(isDefault) || existingAddresses.length === 0;

    const newAddressId = `addr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    await db.transaction(async (tx) => {
      if (shouldBeDefault) {
        await tx.update(addresses).set({ isDefault: false, updatedAt: new Date() }).where(eq(addresses.userId, userId));
      }

      await tx.insert(addresses).values({
        id: newAddressId,
        userId: userId,
        recipientName: recipientName.trim(),
        street: street.trim(),
        number: String(number || 'S/N').trim(),
        complement: complement ? String(complement).trim() : null,
        neighborhood: neighborhood ? String(neighborhood).trim() : null,
        city: city.trim(),
        state: state ? String(state).trim() : city.trim(),
        countryCode: (countryCode || country || 'GW').toUpperCase(),
        zipCode: zipCode ? String(zipCode).trim() : null,
        phone: String(phone || '').trim(),
        isDefault: shouldBeDefault,
        addressType: 'shipping',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    const [inserted] = await db.select().from(addresses).where(eq(addresses.id, newAddressId)).limit(1);

    return res.json({
      success: true,
      message: 'Endereço cadastrado com sucesso!',
      data: {
        id: inserted.id,
        recipientName: inserted.recipientName,
        street: inserted.street,
        number: inserted.number,
        complement: inserted.complement || '',
        neighborhood: inserted.neighborhood || '',
        city: inserted.city,
        state: inserted.state,
        country: inserted.countryCode,
        zipCode: inserted.zipCode || '',
        phone: inserted.phone,
        isDefault: inserted.isDefault,
        addressType: inserted.addressType,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { code: 'ADDRESS_CREATE_FAILED', message: error?.message || 'Erro ao cadastrar endereço.' } });
  }
});

buyerRouter.put('/addresses/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Banco de dados indisponível.' } });

    const userId = req.user!.id;
    const { id } = req.params;

    const existing = await db.select().from(addresses).where(and(eq(addresses.id, id), eq(addresses.userId, userId))).limit(1);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'ADDRESS_NOT_FOUND', message: 'Endereço não encontrado ou não pertence a você.' } });
    }

    const { recipientName, street, number, complement, neighborhood, city, state, country, countryCode, zipCode, phone, isDefault } = req.body;

    await db.transaction(async (tx) => {
      if (isDefault) {
        await tx.update(addresses).set({ isDefault: false, updatedAt: new Date() }).where(eq(addresses.userId, userId));
      }

      await tx.update(addresses).set({
        ...(recipientName !== undefined && { recipientName: recipientName.trim() }),
        ...(street !== undefined && { street: street.trim() }),
        ...(number !== undefined && { number: String(number).trim() }),
        ...(complement !== undefined && { complement: complement ? String(complement).trim() : null }),
        ...(neighborhood !== undefined && { neighborhood: neighborhood ? String(neighborhood).trim() : null }),
        ...(city !== undefined && { city: city.trim() }),
        ...(state !== undefined && { state: state.trim() }),
        ...(countryCode !== undefined || country !== undefined ? { countryCode: (countryCode || country).toUpperCase() } : {}),
        ...(zipCode !== undefined && { zipCode: zipCode ? String(zipCode).trim() : null }),
        ...(phone !== undefined && { phone: String(phone).trim() }),
        ...(isDefault !== undefined && { isDefault: Boolean(isDefault) }),
        updatedAt: new Date(),
      }).where(and(eq(addresses.id, id), eq(addresses.userId, userId)));
    });

    const [updated] = await db.select().from(addresses).where(eq(addresses.id, id)).limit(1);

    return res.json({
      success: true,
      message: 'Endereço atualizado com sucesso!',
      data: {
        id: updated.id,
        recipientName: updated.recipientName,
        street: updated.street,
        number: updated.number,
        complement: updated.complement || '',
        neighborhood: updated.neighborhood || '',
        city: updated.city,
        state: updated.state,
        country: updated.countryCode,
        zipCode: updated.zipCode || '',
        phone: updated.phone,
        isDefault: updated.isDefault,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { code: 'ADDRESS_UPDATE_FAILED', message: error?.message || 'Erro ao atualizar endereço.' } });
  }
});

buyerRouter.delete('/addresses/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Banco de dados indisponível.' } });

    const userId = req.user!.id;
    const { id } = req.params;

    const existing = await db.select().from(addresses).where(and(eq(addresses.id, id), eq(addresses.userId, userId))).limit(1);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'ADDRESS_NOT_FOUND', message: 'Endereço não encontrado.' } });
    }

    const wasDefault = existing[0].isDefault;

    await db.delete(addresses).where(and(eq(addresses.id, id), eq(addresses.userId, userId)));

    if (wasDefault) {
      const remaining = await db.select().from(addresses).where(eq(addresses.userId, userId)).orderBy(desc(addresses.createdAt)).limit(1);
      if (remaining.length > 0) {
        await db.update(addresses).set({ isDefault: true, updatedAt: new Date() }).where(eq(addresses.id, remaining[0].id));
      }
    }

    const remainingAddresses = await db.select().from(addresses).where(eq(addresses.userId, userId)).orderBy(desc(addresses.isDefault));

    return res.json({
      success: true,
      message: 'Endereço removido com sucesso.',
      data: remainingAddresses.map(a => ({
        id: a.id,
        recipientName: a.recipientName,
        street: a.street,
        number: a.number,
        complement: a.complement || '',
        neighborhood: a.neighborhood || '',
        city: a.city,
        state: a.state,
        country: a.countryCode,
        zipCode: a.zipCode || '',
        phone: a.phone,
        isDefault: a.isDefault,
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { code: 'ADDRESS_DELETE_FAILED', message: error?.message || 'Erro ao remover endereço.' } });
  }
});

buyerRouter.patch('/addresses/:id/default', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Banco de dados indisponível.' } });

    const userId = req.user!.id;
    const { id } = req.params;

    const existing = await db.select().from(addresses).where(and(eq(addresses.id, id), eq(addresses.userId, userId))).limit(1);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'ADDRESS_NOT_FOUND', message: 'Endereço não encontrado.' } });
    }

    await db.transaction(async (tx) => {
      await tx.update(addresses).set({ isDefault: false, updatedAt: new Date() }).where(eq(addresses.userId, userId));
      await tx.update(addresses).set({ isDefault: true, updatedAt: new Date() }).where(and(eq(addresses.id, id), eq(addresses.userId, userId)));
    });

    const userAddresses = await db.select().from(addresses).where(eq(addresses.userId, userId)).orderBy(desc(addresses.isDefault));

    return res.json({
      success: true,
      message: 'Endereço padrão de entrega definido com sucesso!',
      data: userAddresses.map(a => ({
        id: a.id,
        recipientName: a.recipientName,
        street: a.street,
        number: a.number,
        complement: a.complement || '',
        neighborhood: a.neighborhood || '',
        city: a.city,
        state: a.state,
        country: a.countryCode,
        zipCode: a.zipCode || '',
        phone: a.phone,
        isDefault: a.isDefault,
      })),
    });
  } catch (error: any) {
return res.status(500).json({ success: false, error: { code: 'SET_DEFAULT_ADDRESS_FAILED', message: error?.message || 'Erro ao definir endereço padrão.' } });
  }
});

// ==========================================
// 3.5 SHOPPING CART (REAL DB - carts & cart_items)
// ==========================================

export async function getFormattedUserCart(db: any, userId: string) {
  const userCarts = await db.select().from(carts).where(eq(carts.userId, userId)).limit(1);
  if (userCarts.length === 0) {
    return {
      id: '',
      userId,
      currency: 'BRL',
      countryCode: 'BR',
      items: [],
      total: 0,
      totalCount: 0,
    };
  }

  const userCart = userCarts[0];
  const dbCartItems = await db.select().from(cartItems).where(eq(cartItems.cartId, userCart.id)).orderBy(desc(cartItems.createdAt));

  const itemsFormatted = [];
  let totalAmount = 0;
  let totalQuantityCount = 0;
  let effectiveCartCurrency = userCart.currency;
  let effectiveCartCountry = userCart.countryCode;

  for (const ci of dbCartItems) {
    const prodRows = await db.select().from(products).where(eq(products.id, ci.productId)).limit(1);
    const prod = prodRows[0];
    if (!prod) continue; // skip if product deleted

    const prodCurrency = prod.currency;
    const prodCountry = prod.countryCode;

    if (itemsFormatted.length === 0) {
      effectiveCartCurrency = prodCurrency;
      effectiveCartCountry = prodCountry;
    }

    let varObj = null;
    if (ci.variantId) {
      const varRows = await db.select().from(productVariants).where(eq(productVariants.id, ci.variantId)).limit(1);
      varObj = varRows[0] || null;
    }

    const realUnitPrice = varObj?.price ? Number(varObj.price) : Number(prod.price);
    const qty = Number(ci.quantity) || 1;
    const itemSubtotal = realUnitPrice * qty;

    totalAmount += itemSubtotal;
    totalQuantityCount += qty;

    itemsFormatted.push({
      id: ci.id,
      cartId: ci.cartId,
      productId: ci.productId,
      variantId: ci.variantId || null,
      quantity: qty,
      unitPrice: realUnitPrice,
      subtotal: itemSubtotal,
      currency: prodCurrency,
      countryCode: prodCountry,
      selectedAttributes: ci.selectedAttributesJson || null,
      product: {
        id: prod.id,
        title: prod.title,
        price: realUnitPrice,
        originalPrice: prod.originalPrice ? Number(prod.originalPrice) : undefined,
        currency: prodCurrency,
        countryCode: prodCountry,
        originCountry: prodCountry,
        image: prod.image || '',
        brand: prod.brand || '',
        stock: Number(prod.stock || 0),
        sellerId: prod.sellerId,
        // Correção pós-deploy: faltavam storeId e shippingJson aqui — sem eles,
        // o carrinho não conseguia calcular peso/frete real do produto (o
        // normalizeProduct do frontend depende de shippingJson quando o campo
        // achatado weightKg/dimensionsCm não vem pronto) e a política de loja
        // não era resolvida (calculateFreight precisa de storeId). O
        // ProductDetail nunca teve esse problema porque usa GET /products/:id,
        // que já retorna shippingJson completo — este é o endpoint do carrinho.
        storeId: prod.storeId,
        shippingJson: prod.shippingJson,
      },
    });
  }

  // Auto-sync cart currency/countryCode if out of date
  if (itemsFormatted.length > 0 && (userCart.currency !== effectiveCartCurrency || userCart.countryCode !== effectiveCartCountry)) {
    await db.update(carts).set({
      currency: effectiveCartCurrency,
      countryCode: effectiveCartCountry,
      updatedAt: new Date(),
    }).where(eq(carts.id, userCart.id));
  }

  return {
    id: userCart.id,
    userId: userCart.userId,
    currency: itemsFormatted.length > 0 ? effectiveCartCurrency : userCart.currency,
    countryCode: itemsFormatted.length > 0 ? effectiveCartCountry : userCart.countryCode,
    items: itemsFormatted,
    total: totalAmount,
    totalCount: totalQuantityCount,
  };
}

buyerRouter.get('/cart', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Banco de dados indisponível.' } });

    const userId = req.user!.id;
    const cartData = await getFormattedUserCart(db, userId);

    return res.json({
      success: true,
      data: cartData,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { code: 'CART_FETCH_FAILED', message: error?.message || 'Erro ao carregar carrinho.' } });
  }
});

// Extraída do handler HTTP para ser testável diretamente (Docker Postgres)
// sem precisar simular req/res. Retorna { error } OU { cart } — o handler
// abaixo só traduz isso para a resposta HTTP.
export async function addItemToCartForUser(
  db: any,
  userId: string,
  payload: { productId?: string; variantId?: string; quantity?: number; selectedAttributes?: any; options?: any; color?: string; size?: string; storage?: string }
): Promise<{ error: { status: number; code: string; message: string } } | { cart: Awaited<ReturnType<typeof getFormattedUserCart>> }> {
  const { productId, variantId, quantity, selectedAttributes, options, color, size, storage } = payload;

  if (!productId) {
    return { error: { status: 400, code: 'MISSING_PRODUCT_ID', message: 'ID do produto é obrigatório.' } };
  }

  const prodRows = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (prodRows.length === 0) {
    return { error: { status: 404, code: 'PRODUCT_NOT_FOUND', message: 'Produto não encontrado no catálogo.' } };
  }

  const prod = prodRows[0];
  if (!prod.currency || !prod.countryCode) {
    return { error: { status: 400, code: 'PRODUCT_INCONSISTENT', message: 'Produto possui dados de moeda ou país inconsistentes no catálogo.' } };
  }

  const prodCurrency = prod.currency;
  const prodCountry = prod.countryCode;

  let realUnitPrice = Number(prod.price);

  const targetVariantId = variantId || options?.selectedVariantSku || options?.variantId || null;
  if (targetVariantId) {
    const varRows = await db.select().from(productVariants).where(eq(productVariants.id, targetVariantId)).limit(1);
    if (varRows.length > 0 && varRows[0].price) {
      realUnitPrice = Number(varRows[0].price);
    }
  }

  const addQty = Math.max(1, Number(quantity) || 1);

  let userCart = (await db.select().from(carts).where(eq(carts.userId, userId)).limit(1))[0];
  if (!userCart) {
    const newCartId = `cart_${userId}`;
    await db.insert(carts).values({
      id: newCartId,
      userId: userId,
      currency: prodCurrency,
      countryCode: prodCountry,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    userCart = (await db.select().from(carts).where(eq(carts.id, newCartId)).limit(1))[0];
  } else {
    // Check existing items in cart for mixed currency rule
    const existingCartItems = await db.select().from(cartItems).where(eq(cartItems.cartId, userCart.id));
    if (existingCartItems.length > 0) {
      const firstItem = existingCartItems[0];
      const firstProdRows = await db.select().from(products).where(eq(products.id, firstItem.productId)).limit(1);
      if (firstProdRows.length > 0) {
        const firstProd = firstProdRows[0];
        if (firstProd.currency && firstProd.currency !== prodCurrency) {
          return {
            error: {
              status: 400,
              code: 'CART_MIXED_CURRENCY_NOT_ALLOWED',
              message: `Não é possível misturar produtos com moedas diferentes (${firstProd.currency} e ${prodCurrency}) no mesmo carrinho. Finalize ou limpe o carrinho atual primeiro.`,
            },
          };
        }
      }
    }

    if (userCart.currency !== prodCurrency || userCart.countryCode !== prodCountry) {
      await db.update(carts).set({
        currency: prodCurrency,
        countryCode: prodCountry,
        updatedAt: new Date(),
      }).where(eq(carts.id, userCart.id));
    }
  }

  const existingItems = await db.select().from(cartItems).where(
    and(
      eq(cartItems.cartId, userCart.id),
      eq(cartItems.productId, productId),
      targetVariantId ? eq(cartItems.variantId, targetVariantId) : isNull(cartItems.variantId)
    )
  ).limit(1);

  const attrData = selectedAttributes || options || (color || size || storage ? { color, size, storage } : null);

  // Correção pré-piloto (item 10.J): quantidade no carrinho nunca pode
  // ultrapassar o estoque real do produto — protege tanto contra cliques
  // repetidos (mesmo com a race condition do frontend corrigida) quanto
  // contra qualquer outro caminho que tente somar além do disponível.
  const availableStock = Number(prod.stock);
  const stockCap = !isNaN(availableStock) && availableStock >= 0 ? availableStock : Infinity;
  if (stockCap <= 0) {
    return { error: { status: 400, code: 'OUT_OF_STOCK', message: 'Este produto está sem estoque disponível no momento.' } };
  }

  if (existingItems.length > 0) {
    const existing = existingItems[0];
    const newQty = Math.min(Number(existing.quantity) + addQty, stockCap);
    await db.update(cartItems).set({
      quantity: newQty,
      unitPrice: String(realUnitPrice),
      selectedAttributesJson: attrData || existing.selectedAttributesJson,
      updatedAt: new Date(),
    }).where(eq(cartItems.id, existing.id));
  } else {
    const newItemId = `ci_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await db.insert(cartItems).values({
      id: newItemId,
      cartId: userCart.id,
      productId,
      variantId: targetVariantId,
      quantity: Math.min(addQty, stockCap),
      unitPrice: String(realUnitPrice),
      selectedAttributesJson: attrData,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  const updatedCart = await getFormattedUserCart(db, userId);
  return { cart: updatedCart };
}

buyerRouter.post('/cart/items', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Banco de dados indisponível.' } });

    const userId = req.user!.id;
    const result = await addItemToCartForUser(db, userId, req.body ?? {});
    if ('error' in result) {
      return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
    }

    return res.json({
      success: true,
      message: 'Produto adicionado ao carrinho com sucesso!',
      data: result.cart,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { code: 'CART_ADD_FAILED', message: error?.message || 'Erro ao adicionar item ao carrinho.' } });
  }
});

const handleUpdateCartItem = async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Banco de dados indisponível.' } });

    const userId = req.user!.id;
    const { id } = req.params;
    const { quantity } = req.body ?? {};

    const userCart = (await db.select().from(carts).where(eq(carts.userId, userId)).limit(1))[0];
    if (!userCart) {
      return res.status(404).json({ success: false, error: { code: 'CART_NOT_FOUND', message: 'Carrinho não encontrado.' } });
    }

    const itemRows = await db.select().from(cartItems).where(and(eq(cartItems.id, id), eq(cartItems.cartId, userCart.id))).limit(1);
    let targetId = id;

    if (itemRows.length === 0) {
      // Check if id passed was productId
      const itemsByProd = await db.select().from(cartItems).where(and(eq(cartItems.productId, id), eq(cartItems.cartId, userCart.id))).limit(1);
      if (itemsByProd.length > 0) {
        targetId = itemsByProd[0].id;
      } else {
        return res.status(404).json({ success: false, error: { code: 'ITEM_NOT_FOUND', message: 'Item não encontrado no seu carrinho.' } });
      }
    }

    const requestedQty = Number(quantity);
    if (isNaN(requestedQty) || requestedQty <= 0) {
      await db.delete(cartItems).where(eq(cartItems.id, targetId));
    } else {
      // Mesma proteção de estoque do POST /cart/items (item 10.J).
      const targetItem = itemRows[0] || (await db.select().from(cartItems).where(eq(cartItems.id, targetId)).limit(1))[0];
      const prodRows = await db.select().from(products).where(eq(products.id, targetItem.productId)).limit(1);
      const availableStock = Number(prodRows[0]?.stock);
      const stockCap = !isNaN(availableStock) && availableStock >= 0 ? availableStock : Infinity;
      const newQty = Math.min(requestedQty, stockCap);
      await db.update(cartItems).set({
        quantity: newQty,
        updatedAt: new Date(),
      }).where(eq(cartItems.id, targetId));
    }

    const updatedCart = await getFormattedUserCart(db, userId);

    return res.json({
      success: true,
      message: 'Carrinho atualizado com sucesso.',
      data: updatedCart,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { code: 'CART_UPDATE_FAILED', message: error?.message || 'Erro ao atualizar item do carrinho.' } });
  }
};

buyerRouter.patch('/cart/items/:id', requireAuth, handleUpdateCartItem);
buyerRouter.put('/cart/items/:id', requireAuth, handleUpdateCartItem);

buyerRouter.delete('/cart/items/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Banco de dados indisponível.' } });

    const userId = req.user!.id;
    const { id } = req.params;

    const userCart = (await db.select().from(carts).where(eq(carts.userId, userId)).limit(1))[0];
    if (!userCart) {
      return res.status(404).json({ success: false, error: { code: 'CART_NOT_FOUND', message: 'Carrinho não encontrado.' } });
    }

    const deleted = await db.delete(cartItems).where(and(eq(cartItems.id, id), eq(cartItems.cartId, userCart.id)));

    // Fallback if id was passed as productId
    await db.delete(cartItems).where(and(eq(cartItems.productId, id), eq(cartItems.cartId, userCart.id)));

    const updatedCart = await getFormattedUserCart(db, userId);

    return res.json({
      success: true,
      message: 'Item removido do carrinho.',
      data: updatedCart,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { code: 'CART_ITEM_DELETE_FAILED', message: error?.message || 'Erro ao remover item do carrinho.' } });
  }
});

buyerRouter.delete('/cart', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Banco de dados indisponível.' } });

    const userId = req.user!.id;
    const userCart = (await db.select().from(carts).where(eq(carts.userId, userId)).limit(1))[0];
    if (userCart) {
      await db.delete(cartItems).where(eq(cartItems.cartId, userCart.id));
    }

    const updatedCart = await getFormattedUserCart(db, userId);

    return res.json({
      success: true,
      message: 'Carrinho limpo com sucesso.',
      data: updatedCart,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { code: 'CART_CLEAR_FAILED', message: error?.message || 'Erro ao limpar carrinho.' } });
  }
});

// ==========================================
// 4. ORDERS & TRACKING
// ==========================================

buyerRouter.get('/orders', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const ordersList = await OrderService.getOrdersByBuyer(req.user!.id);
    return res.json({
      success: true,
      data: ordersList,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'ORDERS_FETCH_FAILED', message: err?.message } });
  }
});

buyerRouter.get('/orders/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const order = await OrderService.getOrderById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, error: { code: 'ORDER_NOT_FOUND', message: 'Pedido não encontrado.' } });
    }

    if (order.buyerId !== req.user!.id && req.user!.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Você não tem permissão para visualizar este pedido.' } });
    }

    return res.json({
      success: true,
      data: order,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'ORDER_FETCH_FAILED', message: err?.message } });
  }
});

buyerRouter.post('/orders', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { shippingAddress, addressId, paymentMethod, notes, currency, countryCode } = req.body ?? {};
    const order = await OrderService.createOrderFromCart({
      userId: req.user!.id,
      shippingAddress,
      addressId,
      paymentMethod: paymentMethod || null,
      notes,
      currency,
      countryCode,
    });

    return res.status(201).json({
      success: true,
      message: 'Pedido gerado com sucesso!',
      data: order,
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: { code: 'ORDER_CREATION_FAILED', message: err?.message || 'Erro ao criar pedido.' },
    });
  }
});

buyerRouter.post('/orders/:id/confirm-delivery', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { shipmentId } = req.body ?? {};
    const order = await OrderService.confirmDelivery(req.params.id, req.user!.id, shipmentId);
    return res.json({
      success: true,
      message: 'Recebimento confirmado com sucesso! Fundos de custódia liberados.',
      data: order,
    });
  } catch (err: any) {
    const msg = err?.message || '';
    if (msg.includes('SHIPMENT_NOT_DELIVERED') || msg.includes('ORDER_NOT_FULLY_DELIVERED')) {
      const code = msg.includes('SHIPMENT_NOT_DELIVERED') ? 'SHIPMENT_NOT_DELIVERED' : 'ORDER_NOT_FULLY_DELIVERED';
      const cleanMessage = msg.includes(': ') ? msg.split(': ')[1] : msg;
      return res.status(409).json({
        success: false,
        error: { code, message: cleanMessage },
      });
    }
    if (msg.includes('BUYER_NAME_REQUIRED_FOR_DELIVERY_CONFIRMATION')) {
      const cleanMessage = msg.includes(': ') ? msg.split(': ')[1] : msg;
      return res.status(400).json({
        success: false,
        error: { code: 'BUYER_NAME_REQUIRED_FOR_DELIVERY_CONFIRMATION', message: cleanMessage },
      });
    }
    if (msg.includes('UNAUTHORIZED')) {
      return res.status(403).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Você não tem permissão para confirmar este pedido.' },
      });
    }
    return res.status(400).json({
      success: false,
      error: { code: 'ORDER_CONFIRMATION_FAILED', message: msg || 'Erro ao confirmar entrega.' },
    });
  }
});

buyerRouter.post('/orders/:id/cancel', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { reason } = req.body ?? {};
    const order = await OrderService.cancelOrder(req.params.id, req.user!.id, reason);
    return res.json({
      success: true,
      message: 'Pedido cancelado com sucesso e reserva de estoque liberada.',
      data: order,
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: { code: 'ORDER_CANCELLATION_FAILED', message: err?.message || 'Erro ao cancelar pedido.' },
    });
  }
});

buyerRouter.get('/orders/:id/track', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const tracking = await OrderService.trackOrder(req.params.id, req.user!.id);
    return res.json({
      success: true,
      data: tracking,
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: { code: 'ORDER_TRACK_FAILED', message: err?.message || 'Erro ao rastrear pedido.' },
    });
  }
});

// ==========================================
// 5. WALLET & NUSALI PAY
// ==========================================

buyerRouter.get('/wallet', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!req.user?.id) return res.status(401).json({ success: false, message: 'Usuário não autenticado.' });
    const userId = req.user.id;
    if (db) {
      const walletRows = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
      const w = walletRows[0];
      const txs = w ? await db.select().from(walletTransactions).where(eq(walletTransactions.walletId, w.id)).orderBy(desc(walletTransactions.createdAt)) : [];

      return res.json({
        success: true,
        data: {
          userId,
          balance: w ? Number(w.balance) : 0,
          cashbackBalance: w ? Number(w.cashbackBalance) : 0,
          pendingEscrowBalance: w ? Number(w.pendingBalance) : 0,
          currency: w?.currency || 'XOF',
          transactions: txs.map(t => ({
            id: t.id,
            type: t.type,
            title: t.title,
            amount: Number(t.amount),
            currency: t.currency,
            date: t.createdAt,
            status: t.status,
          })),
        },
      });
    }
    return res.json({
      success: true,
      data: { userId, balance: 0, cashbackBalance: 0, pendingEscrowBalance: 0, currency: 'XOF', transactions: [] },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

buyerRouter.post('/wallet/deposit', (req: Request, res: Response) => {
  const { amount, method, currency } = req.body;
  const val = Number(amount);
  if (!val || val <= 0) {
    return res.status(400).json({ success: false, message: 'Valor de depósito inválido.' });
  }

  buyerDataStore.wallet.balance += val;

  const newTx: BuyerWalletTransaction = {
    id: `tx-${Date.now()}`,
    type: 'deposit',
    title: `Recarga de Saldo Nusali Pay (${(method || 'Depósito Local').toUpperCase()})`,
    amount: val,
    currency: currency || buyerDataStore.wallet.currency,
    date: 'Agora mesmo',
    status: 'Concluído',
    method: (method || 'orange_money').toUpperCase(),
  };

  buyerDataStore.wallet.transactions.unshift(newTx);

  buyerDataStore.notifications.unshift({
    id: `notif-${Date.now()}`,
    type: 'escrow',
    title: 'Recarga Nusali Pay Confirmada!',
    message: `Seu saldo foi recarregado em +${val.toLocaleString()} ${currency || 'XOF'}.`,
    time: 'Agora mesmo',
    isRead: false,
    targetView: 'wallet',
  });

  return res.json({
    success: true,
    message: `Depósito de ${val.toLocaleString()} ${currency || 'XOF'} creditado com sucesso na sua carteira!`,
    data: {
      balance: buyerDataStore.wallet.balance,
      cashbackBalance: buyerDataStore.wallet.cashbackBalance,
      transaction: newTx,
    },
  });
});

buyerRouter.post('/wallet/transfer', (req: Request, res: Response) => {
  const { recipientEmailOrPhone, amount } = req.body;
  const val = Number(amount);
  if (!val || val <= 0 || val > buyerDataStore.wallet.balance) {
    return res.status(400).json({ success: false, message: 'Saldo insuficiente para realizar a transferência.' });
  }

  buyerDataStore.wallet.balance -= val;

  const newTx: BuyerWalletTransaction = {
    id: `tx-${Date.now()}`,
    type: 'transfer',
    title: `Transferência enviada para ${recipientEmailOrPhone}`,
    amount: -val,
    currency: buyerDataStore.wallet.currency,
    date: 'Agora mesmo',
    status: 'Concluído',
    method: 'Nusali Pay Transfer',
  };

  buyerDataStore.wallet.transactions.unshift(newTx);

  return res.json({
    success: true,
    message: `Transferência de ${val.toLocaleString()} ${buyerDataStore.wallet.currency} enviada com sucesso!`,
    data: {
      balance: buyerDataStore.wallet.balance,
      transaction: newTx,
    },
  });
});

// ==========================================
// 6. COUPONS & PROMOTIONS
// ==========================================

buyerRouter.get('/coupons', (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: buyerDataStore.coupons,
  });
});

buyerRouter.post('/coupons/claim', (req: Request, res: Response) => {
  const { couponId, code } = req.body;
  const coupon = buyerDataStore.coupons.find(c => c.id === couponId || c.code.toUpperCase() === (code || '').toUpperCase());
  if (!coupon) {
    return res.status(404).json({ success: false, message: 'Cupom não encontrado.' });
  }

  coupon.isClaimed = true;

  return res.json({
    success: true,
    message: `Cupom ${coupon.code} resgatado com sucesso!`,
    data: coupon,
  });
});

buyerRouter.post('/coupons/validate', (req: Request, res: Response) => {
  const { code } = req.body;
  const coupon = buyerDataStore.coupons.find(c => c.code.toUpperCase() === (code || '').trim().toUpperCase());
  if (!coupon) {
    return res.status(400).json({ success: false, message: 'Cupom inválido ou expirado.' });
  }

  return res.json({
    success: true,
    message: `Cupom "${coupon.code}" aplicado com sucesso! (${coupon.discount})`,
    data: coupon,
  });
});

// ==========================================
// 7. FAVORITES / WISHLIST
// ==========================================

buyerRouter.get('/favorites', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!req.user?.id) return res.status(401).json({ success: false, message: 'Usuário não autenticado.' });
    const userId = req.user.id;
    if (db) {
      const favRows = await db
        .select({
          id: products.id,
          title: products.title,
          price: products.price,
          currency: products.currency,
          image: products.image,
          brand: products.brand,
          freeShipping: products.freeShipping,
          rating: products.rating,
          createdAt: favorites.createdAt,
        })
        .from(favorites)
        .innerJoin(products, eq(favorites.productId, products.id))
        .where(eq(favorites.userId, userId))
        .orderBy(desc(favorites.createdAt));

      return res.json({
        success: true,
        data: favRows.map(f => ({
          ...f,
          price: Number(f.price),
          rating: Number(f.rating || 5.0),
        })),
      });
    }
    return res.json({ success: true, data: [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

buyerRouter.post('/favorites', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!req.user?.id) return res.status(401).json({ success: false, message: 'Usuário não autenticado.' });
    const userId = req.user.id;
    const { productId, id } = req.body;
    const targetProductId = productId || id;
    if (!targetProductId) {
      return res.status(400).json({ success: false, message: 'ID do produto é obrigatório.' });
    }

    if (db) {
      const existing = await db.select().from(favorites).where(and(eq(favorites.userId, userId), eq(favorites.productId, targetProductId))).limit(1);
      if (existing.length === 0) {
        await db.insert(favorites).values({
          id: `fav_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          userId,
          productId: targetProductId,
          createdAt: new Date(),
        });
      }
    }

    return res.json({
      success: true,
      message: 'Produto adicionado aos seus favoritos!',
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

buyerRouter.delete('/favorites/:productId', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!req.user?.id) return res.status(401).json({ success: false, message: 'Usuário não autenticado.' });
    const userId = req.user.id;
    const { productId } = req.params;

    if (db) {
      await db.delete(favorites).where(and(eq(favorites.userId, userId), eq(favorites.productId, productId)));
    }

    return res.json({
      success: true,
      message: 'Produto removido dos favoritos.',
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

// ==========================================
// 8. RETURNS & REFUNDS
// ==========================================

buyerRouter.get('/returns', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!req.user?.id) return res.status(401).json({ success: false, message: 'Usuário não autenticado.' });
    const userId = req.user.id;
    if (db) {
      const returnRows = await db.select().from(returns).where(eq(returns.buyerId, userId)).orderBy(desc(returns.createdAt));
      return res.json({
        success: true,
        data: returnRows.map(r => ({
          ...r,
          amount: Number(r.amount),
        })),
      });
    }
    return res.json({ success: true, data: [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

buyerRouter.post('/returns', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!req.user?.id) return res.status(401).json({ success: false, message: 'Usuário não autenticado.' });
    const userId = req.user.id;
    const { orderId, reason, description, amount } = req.body;

    if (!orderId || !reason) {
      return res.status(400).json({ success: false, message: 'ID do pedido e motivo são obrigatórios.' });
    }

    const retId = `ret_${Date.now()}`;
    const newReturn = {
      id: retId,
      orderId,
      buyerId: userId,
      reason: `${reason}: ${description || ''}`,
      amount: String(amount || 0),
      currency: 'XOF',
      status: 'pending_approval',
      trackingCode: `DEV-GW-${Math.floor(10000 + Math.random() * 90000)}-NSL`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (db) {
      await db.insert(returns).values(newReturn);
    }

    return res.json({
      success: true,
      message: 'Solicitação de devolução registrada com sucesso!',
      data: {
        ...newReturn,
        amount: Number(newReturn.amount),
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

// ==========================================
// 9. DISPUTES & ESCROW MEDIATION
// ==========================================

buyerRouter.get('/disputes', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!req.user?.id) return res.status(401).json({ success: false, message: 'Usuário não autenticado.' });
    const userId = req.user.id;
    if (db) {
      const disputeRows = await db.select().from(disputes).where(eq(disputes.buyerId, userId)).orderBy(desc(disputes.createdAt));
      return res.json({
        success: true,
        data: disputeRows.map(d => ({
          ...d,
          claimAmount: Number(d.claimAmount),
        })),
      });
    }
    return res.json({ success: true, data: [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

buyerRouter.post('/disputes', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) return res.status(401).json({ success: false, message: 'Usuário não autenticado.' });
    const { orderId, reason, description, claimAmount } = req.body;

    if (!orderId || !description) {
      return res.status(400).json({ success: false, message: 'ID do pedido e descrição são obrigatórios.' });
    }

    // BLOCKER_LAUNCH (fase "Desbloqueio do lançamento") corrigido em
    // createBuyerDispute(): sellerId/currency vêm exclusivamente do pedido
    // real (nunca fixos, nunca do que o cliente envia no corpo).
    const result = await createBuyerDispute({
      orderId,
      buyerId: req.user.id,
      reason,
      description,
      claimAmount,
    });

    return res.json({
      success: true,
      message: (result as any).alreadyOpen
        ? 'Já existe uma disputa em aberto para este pedido — nenhuma nova disputa foi criada.'
        : 'Disputa aberta com sucesso! O pagamento permanece protegido sob custódia Escrow.',
      data: result,
    });
  } catch (err: any) {
    if (err instanceof RefundValidationError) {
      return res.status(err.status).json({ success: false, error: { code: err.code, message: err.message } });
    }
    return res.status(500).json({ success: false, message: err?.message });
  }
});

buyerRouter.post('/disputes/:id/messages', (req: Request, res: Response) => {
  const { id } = req.params;
  const { text } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ success: false, message: 'Texto da mensagem é obrigatório.' });
  }

  const dispute = buyerDataStore.disputes.find(d => d.id === id);
  if (!dispute) {
    return res.status(404).json({ success: false, message: 'Disputa não encontrada.' });
  }

  const newMsg = {
    id: `dm-${Date.now()}`,
    sender: 'buyer' as const,
    senderName: (req as any).user?.fullName || 'Comprador',
    text: text.trim(),
    timestamp: 'Agora mesmo',
  };

  dispute.messages.push(newMsg);

  return res.json({
    success: true,
    message: 'Mensagem enviada na sala de mediação!',
    data: newMsg,
  });
});

// ==========================================
// 10. NOTIFICATIONS (REAL DB)
// ==========================================

buyerRouter.get('/notifications', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Banco de dados indisponível.' } });

    const userId = req.user!.id;
    const rows = await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));

    return res.json({
      success: true,
      data: rows.map(n => ({
        id: n.id,
        title: n.title,
        message: n.message,
        type: n.type,
        link: n.link || '',
        isRead: n.isRead,
        createdAt: n.createdAt,
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { code: 'NOTIFICATIONS_FETCH_FAILED', message: error?.message || 'Erro ao carregar notificações.' } });
  }
});

buyerRouter.patch('/notifications/:id/read', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Banco de dados indisponível.' } });

    const userId = req.user!.id;
    const { id } = req.params;

    await db.update(notifications).set({ isRead: true }).where(and(eq(notifications.id, id), eq(notifications.userId, userId)));

    const rows = await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));

    return res.json({
      success: true,
      message: 'Notificação marcada como lida.',
      data: rows.map(n => ({
        id: n.id,
        title: n.title,
        message: n.message,
        type: n.type,
        link: n.link || '',
        isRead: n.isRead,
        createdAt: n.createdAt,
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { code: 'NOTIFICATION_READ_FAILED', message: error?.message || 'Erro ao atualizar notificação.' } });
  }
});

buyerRouter.post('/notifications/read-all', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Banco de dados indisponível.' } });

    const userId = req.user!.id;
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, userId));

    const rows = await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));

    return res.json({
      success: true,
      message: 'Todas as notificações foram marcadas como lidas!',
      data: rows.map(n => ({
        id: n.id,
        title: n.title,
        message: n.message,
        type: n.type,
        link: n.link || '',
        isRead: n.isRead,
        createdAt: n.createdAt,
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { code: 'NOTIFICATION_READ_ALL_FAILED', message: error?.message || 'Erro ao marcar notificações como lidas.' } });
  }
});

buyerRouter.delete('/notifications', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Banco de dados indisponível.' } });

    const userId = req.user!.id;
    await db.delete(notifications).where(eq(notifications.userId, userId));

    return res.json({
      success: true,
      message: 'Histórico de notificações limpo.',
      data: [],
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { code: 'NOTIFICATION_DELETE_FAILED', message: error?.message || 'Erro ao limpar notificações.' } });
  }
});

// ==========================================
// 11. MESSAGES & LIVE CHAT
// ==========================================

buyerRouter.get('/messages', (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: buyerDataStore.chats,
  });
});

buyerRouter.get('/messages/:chatId', (req: Request, res: Response) => {
  const { chatId } = req.params;
  const chat = buyerDataStore.chats.find(c => c.id === chatId);
  if (!chat) {
    return res.status(404).json({ success: false, message: 'Conversa não encontrada.' });
  }

  return res.json({
    success: true,
    data: chat,
  });
});

buyerRouter.post('/messages/:chatId', async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const { text } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ success: false, message: 'Texto da mensagem é obrigatório.' });
  }

  const chat = buyerDataStore.chats.find(c => c.id === chatId);
  if (!chat) {
    return res.status(404).json({ success: false, message: 'Conversa não encontrada.' });
  }

  const userMsg: BuyerChatMessage = {
    id: `m-${Date.now()}`,
    sender: 'buyer',
    text: text.trim(),
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };

  chat.messages.push(userMsg);
  chat.lastMessage = userMsg.text;
  chat.lastTime = userMsg.time;

  // If chat is with AI, generate automatic assistant answer
  if (chat.isAi) {
    const aiReply: BuyerChatMessage = {
      id: `m-${Date.now() + 1}`,
      sender: 'ai',
      text: `Nusali Assistente: Compreendido! Sobre "${text.trim().substring(0, 30)}...", posso te confirmar que nossas entregas são garantidas por proteção Escrow e você pode acompanhar o status pelo painel em Minhas Compras.`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    chat.messages.push(aiReply);
    chat.lastMessage = aiReply.text;
    chat.lastTime = aiReply.time;
  }

  return res.json({
    success: true,
    message: 'Mensagem enviada!',
    data: chat,
  });
});

// ==========================================
// 12. REVIEWS & RATINGS
// ==========================================

buyerRouter.get('/reviews', (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: buyerDataStore.reviews,
  });
});

buyerRouter.post('/reviews', (req: Request, res: Response) => {
  const { productId, productTitle, rating, title, comment } = req.body;

  if (!productId || !rating) {
    return res.status(400).json({ success: false, message: 'Produto e nota (rating) são obrigatórios.' });
  }

  const newReview: BuyerReview = {
    id: `rev-${Date.now()}`,
    productId,
    productTitle: productTitle || 'Produto Nusali',
    productImage: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&q=80&w=800',
    rating: Number(rating) || 5,
    title: title || 'Excelente produto',
    comment: comment || '',
    date: 'Hoje',
    verifiedPurchase: true,
    likes: 0,
  };

  buyerDataStore.reviews.unshift(newReview);

  return res.json({
    success: true,
    message: 'Avaliação publicada com sucesso! Obrigado pelo feedback.',
    data: newReview,
  });
});

// ==========================================
// 13. SUPPORT TICKETS & HELP
// ==========================================

buyerRouter.get('/tickets', (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: buyerDataStore.tickets,
  });
});

buyerRouter.post('/tickets', (req: Request, res: Response) => {
  const { subject, category, message, priority } = req.body;

  if (!subject || !message) {
    return res.status(400).json({ success: false, message: 'Assunto e mensagem são obrigatórios.' });
  }

  const newTicket: BuyerSupportTicket = {
    id: `tkt-${Math.floor(100 + Math.random() * 900)}`,
    subject,
    category: category || 'Geral',
    status: 'open',
    priority: priority || 'normal',
    createdAt: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    lastUpdate: 'Agora mesmo',
    messages: [
      {
        sender: (req as any).user?.fullName || 'Comprador',
        text: message,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ],
  };

  buyerDataStore.tickets.unshift(newTicket);

  return res.json({
    success: true,
    message: 'Chamado de suporte aberto com sucesso! Nosso time responderá em até 2 horas úteis.',
    data: newTicket,
  });
});
