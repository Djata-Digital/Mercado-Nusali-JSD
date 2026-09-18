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
  escrowAccounts,
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
  shippingRegions,
  shippingSectors,
  stores,
} from '../db/schema.js';
import { getCache, setCache, delCache } from '../db/redis.js';
import { eq, desc, asc, and, or, isNull, inArray } from 'drizzle-orm';
import { createBuyerDispute, RefundValidationError } from './modules/payments/refundService.js';
import { postBuyerDisputeMessage, DisputeMessageValidationError } from './modules/disputes/disputeMessageService.js';
// Fase M1-D1 — MESMA whitelist já usada por /admin/overview (única fonte de
// verdade de "disputa ativa" — nunca uma segunda lista duplicada e
// potencialmente divergente).
import { ACTIVE_DISPUTE_STATUSES } from './adminRoutes.js';
import { updateBuyerTaxId, BuyerProfileValidationError } from './modules/buyer/buyerProfileService.js';
import { isProductAvailableForCountry, eligibilityReason } from './modules/catalog/productEligibilityService.js';
// FASE D16-F2 — fundação geográfica do endereço de ENTREGA do comprador.
// Reaproveita INTEGRALMENTE os mesmos helpers já usados pela origem
// operacional do seller (D15-C2/D16-E3/E4) — nunca uma segunda regra de
// validação de setor/região divergente.
import {
  validateAddressSectorAssignment,
  deriveShippingRegionFromSector,
  countryHasActiveShippingSectors,
} from './modules/shipping/shippingGeographyService.js';
// FASE D16-D2 — mesma fonte de estoque AO VIVO por variante já usada pelo
// catálogo (D16-C2): nunca product_variants.stock, nunca uma segunda fórmula.
// FASE D16-H2 — computeLiveStockAndSales reaproveitada para o mesmo cálculo
// (onHand-reserved) do lado de produto SIMPLES (sem variante), mesma fonte
// única de verdade do catálogo — nunca uma segunda fórmula divergente.
import { computeLiveVariantStock, computeLiveStockAndSales } from './modules/catalog/catalogService.js';

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

// FASE D17-C2 — interface BuyerReview (mock) removida: reviews agora são
// persistidas de verdade na tabela `reviews` (schema.ts); GET /buyer/reviews
// monta o mesmo formato de saída inline, sem precisar de um tipo próprio
// aqui (o tipo do frontend, em src/services/buyerService.ts, é independente
// e não foi alterado).

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
  // Fase M1-D1 — achado M1-C: buyerDataStore.disputes nunca era preenchido
  // (mock in-memory), então openDisputesCount ficava sempre 0 independente
  // de quantas disputas reais o buyer tivesse. Substituído por contagem REAL
  // no Postgres, escopada ao próprio buyer, com a MESMA definição
  // fail-closed de "ativa" já usada em /admin/overview.
  let openDisputesCount = 0;
  if (db) {
    const unread = await db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    unreadNotificationsCount = unread.length;

    const activeDisputeRows = await db
      .select()
      .from(disputes)
      .where(and(eq(disputes.buyerId, userId), inArray(disputes.status, ACTIVE_DISPUTE_STATUSES)));
    openDisputesCount = activeDisputeRows.length;
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
        openDisputesCount,
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

// FASE D16-F2 — mesmo formato de saída já usado pela origem operacional do
// seller (formatOperationalAddress em sellerRoutes.ts): shippingRegionId/
// shippingRegionName são sempre DERIVADOS em tempo de leitura a partir do
// setor (nunca uma coluna própria em addresses — evitaria a divergência
// region=X + sector=setor-de-Y).
function formatBuyerAddress(row: any, sectorInfo: { sector: any; region: any } | null) {
  return {
    id: row.id,
    recipientName: row.recipientName,
    street: row.street,
    number: row.number,
    complement: row.complement || '',
    neighborhood: row.neighborhood || '',
    city: row.city,
    state: row.state,
    country: row.countryCode,
    zipCode: row.zipCode || '',
    phone: row.phone,
    isDefault: row.isDefault,
    addressType: row.addressType,
    shippingSectorId: row.shippingSectorId || null,
    shippingSectorName: sectorInfo?.sector?.name || null,
    shippingRegionId: sectorInfo?.region?.id || null,
    shippingRegionName: sectorInfo?.region?.name || null,
  };
}

buyerRouter.get('/addresses', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Banco de dados indisponível.' } });

    const userId = req.user!.id;
    const userAddresses = await db.select().from(addresses).where(eq(addresses.userId, userId)).orderBy(desc(addresses.isDefault), desc(addresses.createdAt));

    const formatted = await Promise.all(userAddresses.map(async (a) => {
      const sectorInfo = await deriveShippingRegionFromSector(db, a.shippingSectorId);
      return formatBuyerAddress(a, sectorInfo);
    }));

    return res.json({
      success: true,
      data: formatted,
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
    const { recipientName, street, number, complement, neighborhood, city, state, country, countryCode, zipCode, phone, isDefault, shippingSectorId } = req.body;

    if (!recipientName || !street || !city) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'Nome do destinatário, rua e cidade são obrigatórios.' } });
    }

    const resolvedCountryCode = (countryCode || country || 'GW').toUpperCase();

    // FASE D16-F2 — fundação geográfica do endereço de ENTREGA. Nunca confia
    // só na validação do frontend: mesma regra já usada pela origem
    // operacional do seller (validateAddressSectorAssignment), aplicada aqui
    // ao endereço de entrega do comprador. Baseado em DADOS (nunca
    // `if (country === 'GW')`): só exige setor se o país realmente tiver
    // geografia operacional por setor cadastrada — países sem ela (ex.: BR)
    // continuam funcionando exatamente como antes.
    const hasSectorGeography = await countryHasActiveShippingSectors(db, resolvedCountryCode);
    if (hasSectorGeography && !shippingSectorId) {
      return res.status(400).json({
        success: false,
        error: { code: 'SHIPPING_SECTOR_REQUIRED', message: 'Selecione o setor de entrega para o país informado.' },
      });
    }
    if (shippingSectorId) {
      const sectorValidation = await validateAddressSectorAssignment(db, { countryCode: resolvedCountryCode, shippingSectorId: String(shippingSectorId) });
      if (!('ok' in sectorValidation)) {
        return res.status(400).json({ success: false, error: { code: 'SHIPPING_SECTOR_INVALID', message: sectorValidation.error } });
      }
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
        countryCode: resolvedCountryCode,
        zipCode: zipCode ? String(zipCode).trim() : null,
        phone: String(phone || '').trim(),
        isDefault: shouldBeDefault,
        addressType: 'shipping',
        shippingSectorId: shippingSectorId ? String(shippingSectorId) : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    const [inserted] = await db.select().from(addresses).where(eq(addresses.id, newAddressId)).limit(1);
    const sectorInfo = await deriveShippingRegionFromSector(db, inserted.shippingSectorId);

    return res.json({
      success: true,
      message: 'Endereço cadastrado com sucesso!',
      data: formatBuyerAddress(inserted, sectorInfo),
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

    const { recipientName, street, number, complement, neighborhood, city, state, country, countryCode, zipCode, phone, isDefault, shippingSectorId } = req.body;

    // FASE D16-F2 — mesmo padrão já usado por PATCH /seller/addresses/:id:
    // funde país/setor EXISTENTES com o que veio no corpo, e valida a
    // combinação FINAL — nunca aceita silenciosamente um setor que passou a
    // pertencer a um país diferente do país final do endereço (ex.: trocar
    // country sem também atualizar/limpar shippingSectorId). Só aciona essa
    // validação quando o payload realmente toca country/countryCode/
    // shippingSectorId — uma edição de campo não-geográfico (ex.: telefone)
    // nunca é bloqueada por uma geografia que ela nem tentou mudar.
    const touchesGeography = country !== undefined || countryCode !== undefined || shippingSectorId !== undefined;
    if (touchesGeography) {
      const finalCountryCode = (countryCode !== undefined || country !== undefined)
        ? String(countryCode || country).toUpperCase()
        : existing[0].countryCode;
      const finalShippingSectorId = shippingSectorId !== undefined
        ? (shippingSectorId ? String(shippingSectorId) : null)
        : existing[0].shippingSectorId;

      if (finalShippingSectorId) {
        const sectorValidation = await validateAddressSectorAssignment(db, { countryCode: finalCountryCode, shippingSectorId: finalShippingSectorId });
        if (!('ok' in sectorValidation)) {
          return res.status(400).json({ success: false, error: { code: 'SHIPPING_SECTOR_INVALID', message: sectorValidation.error } });
        }
      } else {
        const hasSectorGeography = await countryHasActiveShippingSectors(db, finalCountryCode);
        if (hasSectorGeography) {
          return res.status(400).json({
            success: false,
            error: { code: 'SHIPPING_SECTOR_REQUIRED', message: 'Selecione o setor de entrega para o país informado.' },
          });
        }
      }
    }

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
        ...(shippingSectorId !== undefined && { shippingSectorId: shippingSectorId ? String(shippingSectorId) : null }),
        updatedAt: new Date(),
      }).where(and(eq(addresses.id, id), eq(addresses.userId, userId)));
    });

    const [updated] = await db.select().from(addresses).where(eq(addresses.id, id)).limit(1);
    const sectorInfo = await deriveShippingRegionFromSector(db, updated.shippingSectorId);

    return res.json({
      success: true,
      message: 'Endereço atualizado com sucesso!',
      data: formatBuyerAddress(updated, sectorInfo),
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
    const formattedRemaining = await Promise.all(remainingAddresses.map(async (a) => {
      const sectorInfo = await deriveShippingRegionFromSector(db, a.shippingSectorId);
      return formatBuyerAddress(a, sectorInfo);
    }));

    return res.json({
      success: true,
      message: 'Endereço removido com sucesso.',
      data: formattedRemaining,
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
    const formattedUserAddresses = await Promise.all(userAddresses.map(async (a) => {
      const sectorInfo = await deriveShippingRegionFromSector(db, a.shippingSectorId);
      return formatBuyerAddress(a, sectorInfo);
    }));

    return res.json({
      success: true,
      message: 'Endereço padrão de entrega definido com sucesso!',
      data: formattedUserAddresses,
    });
  } catch (error: any) {
return res.status(500).json({ success: false, error: { code: 'SET_DEFAULT_ADDRESS_FAILED', message: error?.message || 'Erro ao definir endereço padrão.' } });
  }
});

// ==========================================
// 3.1 LEITURA DE GEOGRAFIA DE FRETE PARA O COMPRADOR (FASE D16-F2)
// ==========================================
// Mesmo padrão/mesma restrição já usados por GET /seller/shipping/regions e
// /sectors (D15-C2): endpoints admin exigem requireLogisticsStaff, que o
// comprador nunca tem — sem uma rota própria, o formulário de endereço de
// entrega não teria como popular Região/Setor. Somente leitura, filtram
// isActive=true, devolvem só id/name/code/regionId — nunca tarifa/rota.
buyerRouter.get('/shipping/regions', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, message: 'Banco indisponível.' });
    const country = String(req.query.country || '').trim().toUpperCase();
    if (!country) return res.status(400).json({ success: false, error: { code: 'COUNTRY_REQUIRED', message: 'country é obrigatório.' } });

    const rows = await db.select({
      id: shippingRegions.id, name: shippingRegions.name, code: shippingRegions.code,
    }).from(shippingRegions).where(and(eq(shippingRegions.countryCode, country), eq(shippingRegions.isActive, true)))
      .orderBy(asc(shippingRegions.name));

    return res.json({ success: true, data: rows });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || 'Erro ao carregar regiões.' });
  }
});

buyerRouter.get('/shipping/sectors', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, message: 'Banco indisponível.' });
    const country = String(req.query.country || '').trim().toUpperCase();
    if (!country) return res.status(400).json({ success: false, error: { code: 'COUNTRY_REQUIRED', message: 'country é obrigatório.' } });

    const conditions = [eq(shippingSectors.countryCode, country), eq(shippingSectors.isActive, true)];
    if (req.query.region) conditions.push(eq(shippingSectors.regionId, String(req.query.region)));

    const rows = await db.select({
      id: shippingSectors.id, name: shippingSectors.name, code: shippingSectors.code, regionId: shippingSectors.regionId,
    }).from(shippingSectors).where(and(...conditions)).orderBy(asc(shippingSectors.name));

    return res.json({ success: true, data: rows });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || 'Erro ao carregar setores.' });
  }
});

// ==========================================
// 3.5 SHOPPING CART (REAL DB - carts & cart_items)
// ==========================================

export async function getFormattedUserCart(db: any, userId: string, destinationCountry?: string) {
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

  // FASE D16-H2 — disponibilidade AO VIVO por linha, calculada em lote (2
  // queries no total, não 1 por item): variante quando a linha tem
  // variantId (nunca o estoque agregado do produto), produto simples
  // quando não tem. Mesma fonte única de verdade (inventory) do catálogo.
  const variantIdsInCart: string[] = Array.from(new Set<string>(dbCartItems.filter((ci: any) => ci.variantId).map((ci: any) => ci.variantId as string)));
  const productIdsInCart: string[] = Array.from(new Set<string>(dbCartItems.map((ci: any) => ci.productId as string)));
  const [variantStockMap, productStockMap] = await Promise.all([
    computeLiveVariantStock(variantIdsInCart, db),
    computeLiveStockAndSales(productIdsInCart, db),
  ]);

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

    // FASE D16-G3.1 — nome REAL da loja para "Vendido por X" no carrinho.
    // Autoridade: products.storeId (o mesmo vínculo direto produto->loja já
    // usado por F4/F6.2 para fulfillment), NUNCA um lookup por sellerId (que
    // poderia pegar a loja errada se o vendedor tiver mais de uma). Produto
    // histórico sem storeId -> storeName null, tratado no frontend com o
    // mesmo fallback genérico que já existia (normalizeProduct), nunca um
    // crash.
    let storeObj: { name: string } | null = null;
    if (prod.storeId) {
      const storeRows = await db.select({ name: stores.name }).from(stores).where(eq(stores.id, prod.storeId)).limit(1);
      storeObj = storeRows[0] || null;
    }

    const realUnitPrice = varObj?.price ? Number(varObj.price) : Number(prod.price);
    const qty = Number(ci.quantity) || 1;
    const itemSubtotal = realUnitPrice * qty;

    totalAmount += itemSubtotal;
    totalQuantityCount += qty;

    // Melhoria pré-piloto (elegibilidade por país): se o destino do
    // comprador mudou desde que o item foi adicionado (ou o produto nunca
    // foi elegível), o item NÃO é removido silenciosamente — fica marcado
    // para a tela avisar e bloquear o checkout até o comprador resolver.
    const isAvailableForDestination = destinationCountry ? isProductAvailableForCountry(prod, destinationCountry) : undefined;

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
      isAvailableForDestination,
      unavailabilityReason: isAvailableForDestination === false ? eligibilityReason(prod, destinationCountry) : undefined,
      product: {
        id: prod.id,
        title: prod.title,
        price: realUnitPrice,
        originalPrice: prod.originalPrice ? Number(prod.originalPrice) : undefined,
        currency: prodCurrency,
        countryCode: prodCountry,
        originCountry: prodCountry,
        // FASE D16-D2 (item N) — linha de carrinho de uma variante mostra a
        // imagem DAQUELA variante (product_variants.image_url) quando
        // existir, nunca só a imagem genérica do produto — mesma fonte já
        // usada pelo detalhe do produto (D16-C2), nunca um campo fantasma.
        image: varObj?.imageUrl || prod.image || '',
        brand: prod.brand || '',
        stock: Number(prod.stock || 0),
        // FASE D16-H2 — disponibilidade AO VIVO desta linha específica
        // (nunca o estoque agregado do produto quando ci.variantId existe):
        // usado pelo carrinho para limitar a quantidade digitável/+/− à
        // disponibilidade REAL (inventory), com mensagem clara em vez de
        // falhar silenciosamente. O backend (handleUpdateCartItem) continua
        // sendo a autoridade final na confirmação, independente disto.
        availableStock: ci.variantId
          ? (variantStockMap.get(ci.variantId) ?? 0)
          : (productStockMap.get(ci.productId)?.availableStock ?? Number(prod.stock || 0)),
        sellerId: prod.sellerId,
        // Correção pós-deploy: faltavam storeId e shippingJson aqui — sem eles,
        // o carrinho não conseguia calcular peso/frete real do produto (o
        // normalizeProduct do frontend depende de shippingJson quando o campo
        // achatado weightKg/dimensionsCm não vem pronto) e a política de loja
        // não era resolvida (calculateFreight precisa de storeId). O
        // ProductDetail nunca teve esse problema porque usa GET /products/:id,
        // que já retorna shippingJson completo — este é o endpoint do carrinho.
        storeId: prod.storeId,
        // FASE D16-G3.1 — nome real da loja (stores.name via products.storeId,
        // ver storeObj acima). null quando o produto não tem storeId
        // (histórico) — normalizeProduct/CartView já tratam null com o
        // mesmo fallback genérico de sempre, nunca quebram.
        storeName: storeObj?.name || null,
        shippingJson: prod.shippingJson,
        // Melhoria pré-piloto (elegibilidade por país): o checkout precisa
        // saber o escopo/destinos permitidos de cada item para travar (ou
        // filtrar) o seletor de país de entrega — nunca decidido só no
        // frontend.
        publishingScope: prod.publishingScope,
        targetCountriesJson: prod.targetCountriesJson,
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
    hasIneligibleItems: itemsFormatted.some((i: any) => i.isAvailableForDestination === false),
  };
}

async function resolveCartDestinationCountry(db: any, userId: string, req: AuthRequest): Promise<string | undefined> {
  const [defaultAddress] = await db.select().from(addresses).where(and(eq(addresses.userId, userId), eq(addresses.isDefault, true))).limit(1);
  if (defaultAddress?.countryCode) return defaultAddress.countryCode;
  const header = req.headers['x-country-code'];
  const headerVal = Array.isArray(header) ? header[0] : header;
  return headerVal || undefined;
}

buyerRouter.get('/cart', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Banco de dados indisponível.' } });

    const userId = req.user!.id;
    const destinationCountry = await resolveCartDestinationCountry(db, userId, req);
    const cartData = await getFormattedUserCart(db, userId, destinationCountry);

    return res.json({
      success: true,
      data: cartData,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { code: 'CART_FETCH_FAILED', message: error?.message || 'Erro ao carregar carrinho.' } });
  }
});

// FASE D16-D2 — erro interno com status/code, mesmo padrão já usado em
// paymentService.ts/orderService.ts para operações dentro de db.transaction
// (lançar e deixar a transação fazer ROLLBACK sozinha, traduzido para
// { error } só na borda pública). Nunca exposto fora deste arquivo.
class CartOperationError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Extraído de addItemToCartForUser (D16-D2) para ser reutilizado também pelo
// batch (POST /cart/items/batch) — MESMA regra de moeda/país única no
// carrinho, nunca uma segunda versão divergente. `executor` é `db` (chamada
// avulsa) OU `tx` (dentro de uma transação do batch) — idêntico em ambos os
// casos, já que os dois implementam a mesma interface drizzle.
async function resolveOrCreateCartForItem(executor: any, userId: string, prod: any): Promise<any> {
  const prodCurrency = prod.currency;
  const prodCountry = prod.countryCode;

  let userCart = (await executor.select().from(carts).where(eq(carts.userId, userId)).limit(1))[0];
  if (!userCart) {
    const newCartId = `cart_${userId}`;
    await executor.insert(carts).values({
      id: newCartId,
      userId: userId,
      currency: prodCurrency,
      countryCode: prodCountry,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    userCart = (await executor.select().from(carts).where(eq(carts.id, newCartId)).limit(1))[0];
  } else {
    // Check existing items in cart for mixed currency rule. Dentro do
    // batch, isso também enxerga os itens já inseridos por itens ANTERIORES
    // do mesmo batch (mesma transação) — nunca permite misturar moeda nem
    // dentro de um único request de batch.
    const existingCartItems = await executor.select().from(cartItems).where(eq(cartItems.cartId, userCart.id));
    if (existingCartItems.length > 0) {
      const firstItem = existingCartItems[0];
      const firstProdRows = await executor.select().from(products).where(eq(products.id, firstItem.productId)).limit(1);
      if (firstProdRows.length > 0) {
        const firstProd = firstProdRows[0];
        if (firstProd.currency && firstProd.currency !== prodCurrency) {
          throw new CartOperationError(
            400,
            'CART_MIXED_CURRENCY_NOT_ALLOWED',
            `Não é possível misturar produtos com moedas diferentes (${firstProd.currency} e ${prodCurrency}) no mesmo carrinho. Finalize ou limpe o carrinho atual primeiro.`
          );
        }
      }
    }

    if (userCart.currency !== prodCurrency || userCart.countryCode !== prodCountry) {
      await executor.update(carts).set({
        currency: prodCurrency,
        countryCode: prodCountry,
        updatedAt: new Date(),
      }).where(eq(carts.id, userCart.id));
    }
  }
  return userCart;
}

// Extraído de addItemToCartForUser (D16-D2) — núcleo de "adicionar/mesclar
// UMA linha real no carrinho", reutilizado tanto pelo add avulso (modo
// `strictStock: false`, comportamento 100% preservado: estoque insuficiente
// SATURA a quantidade em vez de rejeitar) quanto pelo batch (modo
// `strictStock: true`, exigido pelo D16-D1: estoque insuficiente REJEITA o
// item inteiro, que por sua vez faz a transação inteira dar ROLLBACK — nunca
// duplica a regra comercial em dois lugares divergentes).
//
// Estoque: quando a linha tem variantId real, a fonte é SEMPRE o estoque AO
// VIVO por variante (inventory, via computeLiveVariantStock — igual ao já
// usado pelo catálogo em D16-C2). NUNCA product_variants.stock (legado/não-
// autoritativo) nem products.stock (nível errado para produto variável —
// lacuna encontrada na auditoria D16-D1). Produto simples (sem variantId)
// continua exatamente como antes: products.stock.
async function addSingleCartLine(
  executor: any,
  userCart: { id: string },
  prod: any,
  line: { variantId?: string | null; quantity?: number; attrData?: any },
  opts: { strictStock: boolean }
): Promise<void> {
  let realUnitPrice = Number(prod.price);
  const targetVariantId = line.variantId || null;

  if (targetVariantId) {
    const varRows = await executor.select().from(productVariants).where(eq(productVariants.id, targetVariantId)).limit(1);
    const variantRow = varRows[0] || null;
    // Nunca confia num variantId que não existe, ou que existe mas pertence
    // a OUTRO produto (ex.: cliente adulterando o payload) — mesmo espírito
    // de nunca revelar/aceitar dado incoerente já usado pelo resto do arquivo.
    if (!variantRow || variantRow.productId !== prod.id) {
      throw new CartOperationError(404, 'VARIANT_NOT_FOUND', 'Variante não encontrada para este produto.');
    }
    if (variantRow.isActive === false) {
      throw new CartOperationError(400, 'VARIANT_INACTIVE', 'Esta variação não está mais disponível.');
    }
    if (variantRow.price) {
      realUnitPrice = Number(variantRow.price);
    }
  }

  const addQty = Math.max(1, Number(line.quantity) || 1);

  const existingItems = await executor.select().from(cartItems).where(
    and(
      eq(cartItems.cartId, userCart.id),
      eq(cartItems.productId, prod.id),
      targetVariantId ? eq(cartItems.variantId, targetVariantId) : isNull(cartItems.variantId)
    )
  ).limit(1);

  // Correção pré-piloto (item 10.J) + FASE D16-D2 (lacuna do D16-D1):
  // quantidade no carrinho nunca pode ultrapassar o estoque REAL —
  // products.stock para produto simples, inventory/variante para produto
  // variável. Protege cliques repetidos e qualquer chamador que tente somar
  // além do disponível.
  let stockCap: number;
  if (targetVariantId) {
    const liveMap = await computeLiveVariantStock([targetVariantId], executor);
    stockCap = liveMap.get(targetVariantId) ?? 0;
  } else {
    const availableStock = Number(prod.stock);
    stockCap = !isNaN(availableStock) && availableStock >= 0 ? availableStock : Infinity;
  }

  if (stockCap <= 0) {
    throw new CartOperationError(
      400,
      'OUT_OF_STOCK',
      targetVariantId ? 'Esta variação está sem estoque disponível no momento.' : 'Este produto está sem estoque disponível no momento.'
    );
  }

  if (existingItems.length > 0) {
    const existing = existingItems[0];
    const desiredQty = Number(existing.quantity) + addQty;
    if (opts.strictStock && desiredQty > stockCap) {
      throw new CartOperationError(
        400,
        'INSUFFICIENT_STOCK',
        `Estoque insuficiente: já há ${existing.quantity} unidade(s) no carrinho e apenas ${stockCap} disponível(is) no total.`
      );
    }
    const newQty = opts.strictStock ? desiredQty : Math.min(desiredQty, stockCap);
    await executor.update(cartItems).set({
      quantity: newQty,
      unitPrice: String(realUnitPrice),
      selectedAttributesJson: line.attrData || existing.selectedAttributesJson,
      updatedAt: new Date(),
    }).where(eq(cartItems.id, existing.id));
  } else {
    if (opts.strictStock && addQty > stockCap) {
      throw new CartOperationError(
        400,
        'INSUFFICIENT_STOCK',
        `Estoque insuficiente: apenas ${stockCap} unidade(s) disponível(is).`
      );
    }
    const newItemId = `ci_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await executor.insert(cartItems).values({
      id: newItemId,
      cartId: userCart.id,
      productId: prod.id,
      variantId: targetVariantId,
      quantity: opts.strictStock ? addQty : Math.min(addQty, stockCap),
      unitPrice: String(realUnitPrice),
      selectedAttributesJson: line.attrData || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}

// Extraída do handler HTTP para ser testável diretamente (Docker Postgres)
// sem precisar simular req/res. Retorna { error } OU { cart } — o handler
// abaixo só traduz isso para a resposta HTTP.
export async function addItemToCartForUser(
  db: any,
  userId: string,
  payload: { productId?: string; variantId?: string; quantity?: number; selectedAttributes?: any; options?: any; color?: string; size?: string; storage?: string; destinationCountry?: string }
): Promise<{ error: { status: number; code: string; message: string } } | { cart: Awaited<ReturnType<typeof getFormattedUserCart>> }> {
  const { productId, variantId, quantity, selectedAttributes, options, color, size, storage } = payload;

  if (!productId) {
    return { error: { status: 400, code: 'MISSING_PRODUCT_ID', message: 'ID do produto é obrigatório.' } };
  }

  try {
    const prodRows = await db.select().from(products).where(eq(products.id, productId)).limit(1);
    if (prodRows.length === 0) {
      throw new CartOperationError(404, 'PRODUCT_NOT_FOUND', 'Produto não encontrado no catálogo.');
    }

    const prod = prodRows[0];
    if (!prod.currency || !prod.countryCode) {
      throw new CartOperationError(400, 'PRODUCT_INCONSISTENT', 'Produto possui dados de moeda ou país inconsistentes no catálogo.');
    }

    // Melhoria pré-piloto (elegibilidade por país): backend revalida mesmo que
    // o produto tenha "escapado" do catálogo filtrado (ex.: link direto, cache
    // desatualizado). Prioridade do destino a validar: (1) endereço de entrega
    // padrão do comprador — sinal mais real que existe; (2) destinationCountry
    // explícito enviado pelo frontend; (3) país já em uso no carrinho atual
    // (carrinho não pode misturar destinos, mesma lógica já aplicada à moeda).
    // Sem nenhum desses (comprador novíssimo, sem endereço, carrinho vazio),
    // não há como determinar o destino ainda — o checkout continua sendo o
    // portão definitivo que nunca pode ser contornado.
    const [defaultAddress] = await db.select().from(addresses).where(and(eq(addresses.userId, userId), eq(addresses.isDefault, true))).limit(1);
    const existingCartForDestination = (await db.select().from(carts).where(eq(carts.userId, userId)).limit(1))[0];
    const destinationCountry: string | undefined =
      defaultAddress?.countryCode ||
      payload.destinationCountry ||
      (existingCartForDestination && (await db.select().from(cartItems).where(eq(cartItems.cartId, existingCartForDestination.id)).limit(1)).length > 0
        ? existingCartForDestination.countryCode
        : undefined);

    if (destinationCountry && !isProductAvailableForCountry(prod, destinationCountry)) {
      throw new CartOperationError(400, 'PRODUCT_NOT_AVAILABLE_FOR_DESTINATION', eligibilityReason(prod, destinationCountry));
    }

    const userCart = await resolveOrCreateCartForItem(db, userId, prod);

    const targetVariantId = variantId || options?.selectedVariantSku || options?.variantId || null;
    const attrData = selectedAttributes || options || (color || size || storage ? { color, size, storage } : null);

    await addSingleCartLine(db, userCart, prod, { variantId: targetVariantId, quantity, attrData }, { strictStock: false });

    const updatedCart = await getFormattedUserCart(db, userId, destinationCountry);
    return { cart: updatedCart };
  } catch (e: any) {
    if (e instanceof CartOperationError) {
      return { error: { status: e.status, code: e.code, message: e.message } };
    }
    throw e;
  }
}

// ==========================================
// FASE D16-D2 — BATCH: multi-variante estilo Alibaba. Um único request
// transacional para N linhas (produto+variante+quantidade) do MESMO
// comprador — tudo ou nada (auditoria D16-D1, seção D). Reutiliza
// EXATAMENTE as mesmas regras comerciais de addItemToCartForUser via
// resolveOrCreateCartForItem/addSingleCartLine — nunca uma segunda versão
// divergente de "o que é um item de carrinho válido".
// ==========================================
export interface CartBatchItemInput {
  productId?: string;
  variantId?: string;
  quantity?: number;
  selectedAttributesJson?: any;
}

const CART_BATCH_MAX_ITEMS = 50;

export async function addItemsBatchForUser(
  db: any,
  userId: string,
  items: CartBatchItemInput[],
  destinationCountry?: string
): Promise<{ error: { status: number; code: string; message: string } } | { cart: Awaited<ReturnType<typeof getFormattedUserCart>> }> {
  if (!Array.isArray(items) || items.length === 0) {
    return { error: { status: 400, code: 'EMPTY_BATCH', message: 'Nenhum item foi informado para adicionar ao carrinho.' } };
  }
  if (items.length > CART_BATCH_MAX_ITEMS) {
    return { error: { status: 400, code: 'BATCH_TOO_LARGE', message: `No máximo ${CART_BATCH_MAX_ITEMS} itens por requisição.` } };
  }
  for (const it of items) {
    if (!it || !it.productId) {
      return { error: { status: 400, code: 'MISSING_PRODUCT_ID', message: 'ID do produto é obrigatório em todos os itens.' } };
    }
    const q = Number(it.quantity);
    if (!Number.isInteger(q) || q <= 0) {
      return { error: { status: 400, code: 'INVALID_QUANTITY', message: 'Quantidade deve ser um número inteiro maior que zero para todos os itens.' } };
    }
  }

  try {
    // Uma ÚNICA transação para o batch inteiro (auditoria D16-D1, seção D):
    // qualquer erro em qualquer item -> ROLLBACK total, nenhuma das linhas
    // anteriores do MESMO batch permanece.
    await db.transaction(async (tx: any) => {
      for (const it of items) {
        const prodRows = await tx.select().from(products).where(eq(products.id, it.productId)).limit(1);
        if (prodRows.length === 0) {
          throw new CartOperationError(404, 'PRODUCT_NOT_FOUND', `Produto "${it.productId}" não encontrado no catálogo.`);
        }
        const prod = prodRows[0];
        if (!prod.currency || !prod.countryCode) {
          throw new CartOperationError(400, 'PRODUCT_INCONSISTENT', 'Produto possui dados de moeda ou país inconsistentes no catálogo.');
        }

        if (destinationCountry && !isProductAvailableForCountry(prod, destinationCountry)) {
          throw new CartOperationError(400, 'PRODUCT_NOT_AVAILABLE_FOR_DESTINATION', eligibilityReason(prod, destinationCountry));
        }

        // Produto variável exige variantId real — nunca deixa o backend
        // escolher sozinho (mesma regra já aplicada no frontend em D16-C2.1,
        // agora também garantida no servidor, já que o batch é uma porta de
        // entrada nova que o D16-C2.1 não previa).
        if (!it.variantId) {
          const activeVariantRows = await tx
            .select({ id: productVariants.id })
            .from(productVariants)
            .where(and(eq(productVariants.productId, prod.id), eq(productVariants.isActive, true)))
            .limit(1);
          if (activeVariantRows.length > 0) {
            throw new CartOperationError(400, 'VARIANT_REQUIRED', `Selecione uma variação de "${prod.title}" antes de adicionar ao carrinho.`);
          }
        }

        const userCart = await resolveOrCreateCartForItem(tx, userId, prod);
        await addSingleCartLine(
          tx,
          userCart,
          prod,
          { variantId: it.variantId || null, quantity: it.quantity, attrData: it.selectedAttributesJson || null },
          { strictStock: true }
        );
      }
    });
  } catch (e: any) {
    if (e instanceof CartOperationError) {
      return { error: { status: e.status, code: e.code, message: e.message } };
    }
    // FASE D16-D2 (auditoria D16-D1, seção F — concorrência): duas
    // requisições concorrentes podem colidir na unique index real
    // (cartId, productId, variantId) entre o SELECT e o INSERT desta mesma
    // função — trata como conflito amigável (o comprador tenta de novo) em
    // vez de vazar um 500 genérico. Não é uma reescrita de arquitetura: só
    // reconhece o código de erro do Postgres para unique_violation.
    // FASE D16-H2 — correção: a versão do drizzle-orm em uso envolve o erro
    // real do driver `pg` em DrizzleQueryError, colocando o `.code` real em
    // `e.cause.code` (nunca em `e.code` diretamente) — a checagem original
    // nunca disparava de verdade, deixando o unique_violation escapar como
    // exceção não tratada. Achado ao investigar por que este teste de
    // concorrência (D16-D2, item 7) passou a falhar depois que
    // getFormattedUserCart ganhou 2 queries a mais (D16-H2): a corrida
    // sempre existiu, só ficou mais fácil de reproduzir com o timing novo.
    if (e?.code === '23505' || e?.cause?.code === '23505') {
      return { error: { status: 409, code: 'CART_CONCURRENT_UPDATE', message: 'O carrinho foi alterado ao mesmo tempo por outra requisição. Tente novamente.' } };
    }
    throw e;
  }

  const updatedCart = await getFormattedUserCart(db, userId, destinationCountry);
  return { cart: updatedCart };
}

buyerRouter.post('/cart/items', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Banco de dados indisponível.' } });

    const userId = req.user!.id;
    // Mesmo mecanismo do catálogo: X-Country-Code carrega o país realmente
    // selecionado pelo comprador em toda requisição (ver PreferencesContext.tsx),
    // usado aqui como sinal de destino quando o corpo não informa um explícito.
    const headerCountry = req.headers['x-country-code'];
    const destinationFromHeader = Array.isArray(headerCountry) ? headerCountry[0] : headerCountry;
    const result = await addItemToCartForUser(db, userId, { ...(req.body ?? {}), destinationCountry: req.body?.destinationCountry || destinationFromHeader });
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

// FASE D16-D2 — compra multi-variante estilo Alibaba: UM request, várias
// linhas (produto+variante+quantidade) do mesmo comprador, tudo ou nada.
// Nunca substitui POST /cart/items (que continua existindo intocado para os
// fluxos single: ProductCard, MyOrdersView "Comprar novamente").
buyerRouter.post('/cart/items/batch', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Banco de dados indisponível.' } });

    const userId = req.user!.id;
    const destinationCountry = await resolveCartDestinationCountry(db, userId, req);
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const result = await addItemsBatchForUser(db, userId, items, destinationCountry);
    if ('error' in result) {
      return res.status(result.error.status).json({ success: false, error: { code: result.error.code, message: result.error.message } });
    }

    return res.json({
      success: true,
      message: `${items.length} variação(ões) adicionada(s) ao carrinho com sucesso!`,
      data: result.cart,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { code: 'CART_BATCH_ADD_FAILED', message: error?.message || 'Erro ao adicionar itens ao carrinho.' } });
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
      // FASE D16-H2 — correção: esta proteção usava products.stock mesmo
      // para linhas de VARIANTE (estoque agregado do produto, nunca a
      // disponibilidade real daquela variante — ex.: Preta/M=40 e
      // Preta/L=30 os dois eram limitados a 70). Agora usa a MESMA fonte
      // variant-aware já usada em addSingleLineToCart (item 10.J):
      // computeLiveVariantStock quando a linha tem variantId, senão
      // computeLiveStockAndSales (onHand-reserved, nunca products.stock cru).
      const targetItem = itemRows[0] || (await db.select().from(cartItems).where(eq(cartItems.id, targetId)).limit(1))[0];
      let stockCap: number;
      if (targetItem.variantId) {
        const liveMap = await computeLiveVariantStock([targetItem.variantId], db);
        stockCap = liveMap.get(targetItem.variantId) ?? 0;
      } else {
        const prodRows = await db.select().from(products).where(eq(products.id, targetItem.productId)).limit(1);
        const liveMap = await computeLiveStockAndSales([targetItem.productId], db);
        const live = liveMap.get(targetItem.productId);
        const fallbackStock = Number(prodRows[0]?.stock);
        stockCap = live?.availableStock ?? (!isNaN(fallbackStock) && fallbackStock >= 0 ? fallbackStock : Infinity);
      }
      const newQty = Math.min(requestedQty, stockCap);
      await db.update(cartItems).set({
        quantity: newQty,
        updatedAt: new Date(),
      }).where(eq(cartItems.id, targetId));
    }

    const updatedCart = await getFormattedUserCart(db, userId, await resolveCartDestinationCountry(db, userId, req));

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

    const updatedCart = await getFormattedUserCart(db, userId, await resolveCartDestinationCountry(db, userId, req));

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

// Fase M1-D1 — leitura READ-ONLY buyer-scoped de um purchase_group, para
// reload/recarregar a tela de confirmação multi-seller
// (/purchase-groups/:id/confirmation, ainda não implementada no frontend —
// M1-D2). Mesmo padrão de não-revelação já usado em disputeMessageService
// (Fase M1-C): group inexistente OU de outro buyer -> EXATAMENTE a mesma
// resposta (404 PURCHASE_GROUP_NOT_FOUND), nunca revela a um usuário não
// autorizado que o group existe mas é de outra pessoa.
buyerRouter.get('/purchase-groups/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) return res.status(401).json({ success: false, message: 'Usuário não autenticado.' });

    const group = await OrderService.getPurchaseGroupById(req.params.id);
    if (!group || group.buyerId !== req.user.id) {
      return res.status(404).json({ success: false, error: { code: 'PURCHASE_GROUP_NOT_FOUND', message: 'Compra não encontrada.' } });
    }

    return res.json({ success: true, data: group });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'PURCHASE_GROUP_FETCH_FAILED', message: err?.message || 'Erro ao carregar a compra.' } });
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
    if (
      msg.includes('ESCROW_BLOCKED_BY_ACTIVE_DISPUTE') ||
      msg.includes('PAYMENT_NOT_ELIGIBLE_FOR_RELEASE') ||
      msg.includes('ESCROW_ALREADY_REVERSED') ||
      msg.includes('ESCROW_STATE_CHANGED_CONCURRENTLY')
    ) {
      const code = msg.includes('ESCROW_BLOCKED_BY_ACTIVE_DISPUTE')
        ? 'ESCROW_BLOCKED_BY_ACTIVE_DISPUTE'
        : msg.includes('PAYMENT_NOT_ELIGIBLE_FOR_RELEASE')
        ? 'PAYMENT_NOT_ELIGIBLE_FOR_RELEASE'
        : msg.includes('ESCROW_ALREADY_REVERSED')
        ? 'ESCROW_ALREADY_REVERSED'
        : 'ESCROW_STATE_CHANGED_CONCURRENTLY';
      const cleanMessage = msg.includes(': ') ? msg.split(': ')[1] : msg;
      return res.status(409).json({
        success: false,
        error: { code, message: cleanMessage },
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

// Fase M1-A (B1) — mesma whitelist defensiva já usada em
// refundService.ts/paymentService.ts (status IN ('held','eligible')) para
// "dinheiro ainda sob custódia" — 'eligible' nunca é escrito hoje, mas é um
// valor documentado no schema e outros pontos do código já o tratam como
// equivalente a 'held' por segurança; reaproveitar a MESMA whitelist evita
// duas definições divergentes de "em custódia" no mesmo sistema. Exportada
// (não só local à rota) para o mesmo padrão de testabilidade já usado por
// BLOCKING_CHARGEBACK_LOCAL_STATUSES em chargebackService.ts.
export const DISPUTE_IN_CUSTODY_ESCROW_STATUSES = ['held', 'eligible'];

/**
 * Fase M1-A (B1) — enriquece cada disputa com o dinheiro REALMENTE em
 * custódia agora (escrow_accounts.amount), nunca claimAmount (valor
 * alegado pelo comprador ao abrir a disputa — pode divergir do valor real
 * do pedido). Uma disputa pode legitimamente existir com o escrow já
 * 'released' (ver createBuyerDispute/resolveDispute — resolver debita a
 * wallet do vendedor proporcionalmente nesse caso) — aqui reportamos
 * honestamente `escrowAmount: null` quando não há mais dinheiro protegido,
 * em vez de repetir o valor antigo do escrow como se ainda estivesse
 * retido. Batch único (nunca N+1) via orderId. Extraída como função
 * exportada só para ser testável diretamente (mesmo padrão de
 * `resolveFundingPaymentForOrder`/`assertNoBlockingChargebackForPayment`) —
 * nenhuma mudança de comportamento em relação à rota original.
 */
export async function enrichDisputesWithEscrowAmount(db: any, disputeRows: any[]) {
  const orderIds = Array.from(new Set(disputeRows.map((d: any) => d.orderId)));
  const escrowRows = orderIds.length > 0
    ? await db.select({
        orderId: escrowAccounts.orderId,
        amount: escrowAccounts.amount,
        currency: escrowAccounts.currency,
        status: escrowAccounts.status,
      }).from(escrowAccounts).where(inArray(escrowAccounts.orderId, orderIds))
    : [];
  const escrowByOrderId = new Map<string, any>(escrowRows.map((e: any) => [e.orderId, e]));

  return disputeRows.map((d: any) => {
    const esc = escrowByOrderId.get(d.orderId);
    const inCustody = !!esc && DISPUTE_IN_CUSTODY_ESCROW_STATUSES.includes(esc.status);
    return {
      ...d,
      claimAmount: Number(d.claimAmount),
      // escrowAmount: null é uma resposta HONESTA (nunca fabricada) para
      // "sem escrow correspondente" OU "escrow já não representa custódia"
      // (released/refunded) — nunca reaproveita claimAmount nem o valor
      // antigo do escrow como se ainda estivesse retido.
      escrowAmount: inCustody ? Number(esc.amount) : null,
      escrowCurrency: esc ? esc.currency : null,
      escrowStatus: esc ? esc.status : null,
    };
  });
}

buyerRouter.get('/disputes', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!req.user?.id) return res.status(401).json({ success: false, message: 'Usuário não autenticado.' });
    const userId = req.user.id;
    if (db) {
      const disputeRows = await db.select().from(disputes).where(eq(disputes.buyerId, userId)).orderBy(desc(disputes.createdAt));
      const enriched = await enrichDisputesWithEscrowAmount(db, disputeRows);

      // Fase M1-C — leitura simétrica com GET /seller/disputes: o buyer
      // precisa ver as MESMAS mensagens reais (buyer + seller) que o
      // vendedor já vê, na mesma ordem determinística. Antes desta fase,
      // este endpoint nunca retornava `messages` — o frontend só enxergava
      // o mock local (buyerDataStore), nunca uma mensagem do vendedor.
      const disputeIds = enriched.map((d: any) => d.id);
      const messageRows = disputeIds.length > 0
        ? await db
            .select()
            .from(disputeMessages)
            .where(inArray(disputeMessages.disputeId, disputeIds))
            .orderBy(asc(disputeMessages.createdAt), asc(disputeMessages.id))
        : [];
      const messagesByDispute = new Map<string, any[]>();
      for (const msg of messageRows as any[]) {
        const list = messagesByDispute.get(msg.disputeId) || [];
        list.push({ id: msg.id, senderRole: msg.senderRole, message: msg.message, createdAt: msg.createdAt });
        messagesByDispute.set(msg.disputeId, list);
      }
      const withMessages = enriched.map((d: any) => ({ ...d, messages: messagesByDispute.get(d.id) || [] }));

      return res.json({ success: true, data: withMessages });
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

// Fase M1-C — substitui o mock in-memory (buyerDataStore.disputes, nunca
// persistia nada de verdade e nunca provava posse) por persistência REAL em
// dispute_messages. Identidade (senderId/senderRole) SEMPRE derivada da
// sessão autenticada — o body nunca é usado para isso, mesmo que tente
// enviar esses campos (postBuyerDisputeMessage nem os aceita como
// parâmetro). Ownership provada via disputeMessageService (dispute.buyerId
// E order.buyerId == req.user.id) antes de qualquer INSERT.
buyerRouter.post('/disputes/:id/messages', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) return res.status(401).json({ success: false, message: 'Usuário não autenticado.' });
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, message: 'Banco de dados indisponível.' });

    const inserted = await postBuyerDisputeMessage(db, {
      disputeId: req.params.id,
      buyerId: req.user.id,
      rawMessage: req.body?.message,
    });

    return res.json({
      success: true,
      message: 'Mensagem enviada na sala de mediação!',
      data: { id: inserted.id, senderRole: inserted.senderRole, message: inserted.message, createdAt: inserted.createdAt },
    });
  } catch (err: any) {
    if (err instanceof DisputeMessageValidationError) {
      return res.status(err.status).json({ success: false, error: { code: err.code, message: err.message } });
    }
    return res.status(500).json({ success: false, message: err?.message || 'Erro ao enviar mensagem.' });
  }
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

// FASE D17-C2 — aposenta buyerDataStore.reviews (mock em memória). Lista
// reais do usuário autenticado (nunca de outro usuário — req.user.id vem
// exclusivamente do JWT verificado por requireAuth, router-wide, linha 75).
// Formato de saída preservado (BuyerReview: productTitle/productImage via
// join, date formatada, verifiedPurchase/likes mapeados de isVerifiedPurchase/
// helpfulCount) para não exigir mudança em MyReviewsView.tsx nesta fase.
buyerRouter.get('/reviews', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db || !req.user?.id) return res.status(401).json({ success: false, message: 'Não autorizado.' });

    const rows = await db
      .select({
        id: reviews.id,
        productId: reviews.productId,
        productTitle: products.title,
        productImage: products.image,
        rating: reviews.rating,
        title: reviews.title,
        comment: reviews.comment,
        createdAt: reviews.createdAt,
        isVerifiedPurchase: reviews.isVerifiedPurchase,
        helpfulCount: reviews.helpfulCount,
      })
      .from(reviews)
      .leftJoin(products, eq(reviews.productId, products.id))
      .where(eq(reviews.userId, req.user.id))
      .orderBy(desc(reviews.createdAt));

    const data = rows.map((r) => ({
      id: r.id,
      productId: r.productId,
      productTitle: r.productTitle || 'Produto Nusali',
      productImage: r.productImage || '',
      rating: r.rating,
      title: r.title || '',
      comment: r.comment,
      date: r.createdAt.toLocaleDateString('pt-BR'),
      verifiedPurchase: r.isVerifiedPurchase === true,
      likes: r.helpfulCount || 0,
    }));

    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

// FASE D17-C2 — aposenta o mock de criação de review (buyerDataStore.reviews
// + BuyerReview fabricada sem nenhuma prova de compra). Persiste de verdade
// em `reviews`, só depois de provar server-side a cadeia completa:
// JWT user -> orders.buyerId -> orders.status='delivered' ->
// order_items.productId — nunca aceita userId/authorName/authorCountry/
// isVerifiedPurchase/status/helpfulCount do cliente, todos determinados
// aqui. D17-C3 tratará products.rating/reviewsCount separadamente — esta
// fase deliberadamente NÃO os recalcula (ver auditoria D17-C1/ticket D17-C2).
buyerRouter.post('/reviews', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db || !req.user?.id) return res.status(401).json({ success: false, message: 'Não autorizado.' });

    const { productId, orderId, rating, title, comment } = req.body;

    if (!productId || typeof productId !== 'string') {
      return res.status(400).json({ success: false, error: { code: 'REVIEW_PRODUCT_REQUIRED', message: 'Produto é obrigatório.' } });
    }
    if (!orderId || typeof orderId !== 'string') {
      return res.status(400).json({ success: false, error: { code: 'REVIEW_ORDER_REQUIRED', message: 'Pedido é obrigatório.' } });
    }
    const ratingNum = Number(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ success: false, error: { code: 'REVIEW_RATING_INVALID', message: 'A nota deve ser um número inteiro entre 1 e 5.' } });
    }
    const trimmedComment = typeof comment === 'string' ? comment.trim() : '';
    if (!trimmedComment) {
      return res.status(400).json({ success: false, error: { code: 'REVIEW_COMMENT_REQUIRED', message: 'O comentário é obrigatório.' } });
    }
    const trimmedTitle = typeof title === 'string' && title.trim() ? title.trim().slice(0, 255) : null;

    // PASSO 6 — prova real de compra entregue: JWT user -> orders.buyerId ->
    // orders.status='delivered' -> order_items.productId. Qualquer falha
    // nesta cadeia rejeita a criação, sem exceção.
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) {
      return res.status(404).json({ success: false, error: { code: 'REVIEW_ORDER_NOT_FOUND', message: 'Pedido não encontrado.' } });
    }
    if (order.buyerId !== req.user.id) {
      return res.status(403).json({ success: false, error: { code: 'REVIEW_ORDER_NOT_OWNED', message: 'Este pedido não pertence a você.' } });
    }
    if (order.status !== 'delivered') {
      return res.status(403).json({ success: false, error: { code: 'REVIEW_ORDER_NOT_DELIVERED', message: 'Só é possível avaliar produtos de pedidos já entregues.' } });
    }
    const [orderItemRow] = await db
      .select({ id: orderItems.id })
      .from(orderItems)
      .where(and(eq(orderItems.orderId, orderId), eq(orderItems.productId, productId)))
      .limit(1);
    if (!orderItemRow) {
      return res.status(403).json({ success: false, error: { code: 'REVIEW_PRODUCT_NOT_IN_ORDER', message: 'Este produto não faz parte do pedido informado.' } });
    }

    // PASSO 10 — precheck amigável (a UNIQUE(userId,productId,orderId) do
    // Postgres continua sendo a garantia final contra concorrência real,
    // capturada abaixo).
    const [existingReview] = await db
      .select({ id: reviews.id })
      .from(reviews)
      .where(and(eq(reviews.userId, req.user.id), eq(reviews.productId, productId), eq(reviews.orderId, orderId)))
      .limit(1);
    if (existingReview) {
      return res.status(409).json({ success: false, error: { code: 'REVIEW_ALREADY_EXISTS', message: 'Você já avaliou este produto para este pedido.' } });
    }

    const newReview = {
      id: `rev_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      productId,
      orderId,
      userId: req.user.id,
      rating: ratingNum,
      title: trimmedTitle,
      comment: trimmedComment,
      // Snapshot server-side, nunca aceito do cliente — mesmo formato já
      // usado para req.user (claims verificadas do JWT, ver authMiddleware.ts).
      authorName: req.user.fullName || 'Comprador Nusali',
      authorCountry: req.user.countryCode || 'GW',
      // PASSO 8 — só chega aqui se a cadeia acima já provou a compra
      // entregue; nesta fase não existe review não-verificada.
      isVerifiedPurchase: true,
      helpfulCount: 0,
      status: 'approved',
      createdAt: new Date(),
    };

    try {
      await db.insert(reviews).values(newReview);
    } catch (err: any) {
      // Mesma correção já aplicada em outros pontos do projeto (D16-H2):
      // DrizzleQueryError pode envolver o erro real do pg em err.cause.
      if (err?.code === '23505' || err?.cause?.code === '23505') {
        return res.status(409).json({ success: false, error: { code: 'REVIEW_ALREADY_EXISTS', message: 'Você já avaliou este produto para este pedido.' } });
      }
      throw err;
    }

    // Mesmo padrão já usado em sellerRoutes.ts/catalogService.ts após
    // mutações de produto: sem isso, a review real só apareceria no Product
    // Detail depois do cache de 120s expirar (getProductById).
    await delCache(`product:${productId}`);

    return res.status(201).json({
      success: true,
      message: 'Avaliação publicada com sucesso! Obrigado pelo feedback.',
      data: newReview,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
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
