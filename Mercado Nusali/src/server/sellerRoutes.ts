import { Router, Request, Response } from 'express';
import { ProductCreationService } from './modules/catalog/productCreationService.js';
import { InventoryService } from './modules/inventory/inventoryService.js';
import { getDb, checkDbConnection } from '../db/index.js';
import {
  products,
  categories,
  brands,
  productVariants,
  productImages,
  productAttributes,
  reviews,
  reviewImages,
  productQuestions,
  productAnswers,
  favorites,
  orders,
  orderItems,
  orderStatusHistory,
  warehouses,
  inventory,
  inventoryMovements,
  stockReservations,
  inventoryTransfers,
  shipments,
  shippingLabels,
  trackingEvents,
  carts,
  cartItems,
  coupons,
  couponUsages,
  campaigns,
  users,
  userProfiles,
  sellers,
  sellerProfiles,
  sellerKyc,
  sellerDocuments,
  sellerBankAccounts,
  addresses,
  stores as storesTable,
  storeMembers,
  payments,
  paymentAttempts,
  refunds,
  wallets,
  walletTransactions,
  escrowAccounts,
  escrowTransactions,
  sellerPayouts,
  returns,
  disputes,
  disputeMessages,
  conversations,
  messages,
  supportTickets,
  supportTicketMessages,
} from '../db/schema.js';
import { getCache, setCache, delCache } from '../db/redis.js';
import { eq, desc, and, or, isNull } from 'drizzle-orm';
import { requireAuth, AuthRequest } from './modules/auth/authMiddleware.js';
import { syncOrderFulfillmentStatus } from './modules/orders/orderService.js';
import { ShipmentService } from './modules/logistics/shipmentService.js';
import { storageService } from './infra/storage.js';

export const sellerRouter = Router();
sellerRouter.use(requireAuth);

// ==========================================
// UNIFIED REAL STATE ENGINE FOR SELLER PANEL
// ==========================================

export interface SellerProfileData {
  id: string;
  fullName: string;
  commercialName: string;
  sellerType: 'pessoa_fisica' | 'empresa_individual' | 'sociedade' | 'marca_oficial' | 'vendedor_internacional';
  taxId: string;
  country: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  kycStatus: 'verified' | 'under_review' | 'pending' | 'rejected';
  kycLevel: string;
  verificationDate: string;
  reputationLevel: 'platinum' | 'gold' | 'lider';
  reputationScore: number;
  authorizedCountries: string[];
  preferredCurrency: string;
  payoutMethods: {
    id: string;
    type: 'orange_money' | 'mtn' | 'pix' | 'bank_transfer';
    name: string;
    details: string;
    isDefault: boolean;
  }[];
  vacationMode: boolean;
}

export interface SellerStoreData {
  id: string;
  name: string;
  slug: string;
  logo: string;
  banner: string;
  description: string;
  category: string;
  country: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  openingHours: string;
  exchangePolicy: string;
  warrantyPolicy: string;
  returnPolicy: string;
  status: 'active' | 'suspended' | 'pending_approval';
  isOfficial: boolean;
  rating: number;
  followersCount: number;
  salesCount: number;
  acceptedCurrencies: string[];
  acceptedPayments: string[];
  shippingMethods: string[];
}

export interface SellerTeamMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'owner' | 'manager' | 'attendant' | 'order_operator' | 'inventory_manager' | 'financial' | 'marketing';
  assignedStoreId: string;
  status: 'active' | 'pending' | 'suspended';
  lastAccess: string;
}

export interface SellerOrderData {
  id: string;
  orderNumber: string;
  storeId: string;
  storeName: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  buyerCountry: string;
  deliveryCity: string;
  productTitle: string;
  productSku: string;
  productImage: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  commissionFee: number;
  netPayout: number;
  currency: string;
  paymentMethod: string;
  status: 'pending' | 'paid' | 'preparing' | 'shipped' | 'delivered' | 'cancelled';
  escrowStatus: 'held' | 'released' | 'refunded' | 'disputed';
  escrowReleaseDate: string;
  shippingCarrier: string;
  trackingCode: string;
  createdAt: string;
  timeline: { title: string; date: string; done: boolean }[];
}

export interface SellerQuestion {
  id: string;
  productTitle: string;
  productImage: string;
  buyerName: string;
  buyerCountry: string;
  questionText: string;
  questionDate: string;
  answerText?: string;
  answerDate?: string;
  status: 'pending' | 'answered';
}

export interface SellerReviewItem {
  id: string;
  orderId: string;
  productTitle: string;
  buyerName: string;
  rating: number;
  comment: string;
  createdAt: string;
  reply?: string;
  repliedAt?: string;
}

export interface SellerCouponItem {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minPurchase: number;
  usageLimit: number;
  usageCount: number;
  expiresAt: string;
  status: 'active' | 'expired' | 'disabled';
}

export interface SellerCampaignItem {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  discountRequirement: string;
  status: 'active' | 'upcoming' | 'ended';
  isJoined: boolean;
  joinedProductsCount: number;
}

export interface SellerAdItem {
  id: string;
  productTitle: string;
  productImage: string;
  dailyBudget: number;
  clicks: number;
  impressions: number;
  spend: number;
  revenue: number;
  roas: number;
  status: 'active' | 'paused';
}

export interface SellerWalletData {
  available: number;
  retained: number;
  future: number;
  blocked: number;
  cashbackEarned: number;
  refundsProcessed: number;
  currency: string;
  transactions: {
    id: string;
    type: 'credit' | 'payout' | 'escrow' | 'refund';
    title: string;
    date: string;
    amount: number;
    currency: string;
    status: string;
  }[];
}

// In-Memory Database Store for Seller
let currentSellerProfile: SellerProfileData = {
  id: '',
  fullName: '',
  commercialName: '',
  sellerType: 'empresa_individual',
  taxId: '',
  country: 'GW',
  city: '',
  address: '',
  phone: '',
  email: '',
  kycStatus: 'pending',
  kycLevel: 'Nível 1 - Conta Inicial',
  verificationDate: '',
  reputationLevel: 'lider',
  reputationScore: 0,
  authorizedCountries: ['GW'],
  preferredCurrency: 'XOF',
  payoutMethods: [],
  vacationMode: false,
};

let currentStores: SellerStoreData[] = [];
let currentTeamMembers: SellerTeamMember[] = [];
let currentSellerProducts: any[] = [];
let currentSellerOrders: SellerOrderData[] = [];

let currentWallet: SellerWalletData = {
  available: 0,
  retained: 0,
  future: 0,
  blocked: 0,
  cashbackEarned: 0,
  refundsProcessed: 0,
  currency: 'XOF',
  transactions: [],
};

let currentQuestions: SellerQuestion[] = [];
let currentReviews: SellerReviewItem[] = [];
let currentCoupons: SellerCouponItem[] = [];
let currentCampaigns: SellerCampaignItem[] = [];
let currentAds: SellerAdItem[] = [];

let currentSettings = {
  notificationEmail: true,
  notificationWhatsapp: true,
  autoAcceptOrders: true,
  defaultCarrier: 'Nusali Logística Express',
  returnWindowDays: 7,
  warrantyTerms: '12 meses contra defeitos de fabricação',
  crossBorderShippingEnabled: true,
};

// ==========================================
// 1. OVERVIEW & ANALYTICS ENDPOINTS
// ==========================================

sellerRouter.get('/overview', async (req: Request, res: Response) => {
  const grossRevenue = currentSellerOrders.reduce((acc, o) => acc + o.totalAmount, 0);
  const netRevenue = currentSellerOrders.reduce((acc, o) => acc + o.netPayout, 0);
  const totalOrders = currentSellerOrders.length;
  const pendingOrders = currentSellerOrders.filter(o => o.status === 'preparing' || o.status === 'pending').length;
  const pendingQuestions = currentQuestions.filter(q => q.status === 'pending').length;

  return res.json({
    success: true,
    data: {
      profile: currentSellerProfile,
      store: currentStores[0],
      balances: {
        available: currentWallet.available,
        retained: currentWallet.retained,
        future: currentWallet.future,
        blocked: currentWallet.blocked,
        currency: currentWallet.currency,
      },
      metrics: {
        grossRevenue,
        netRevenue,
        totalOrders,
        pendingOrders,
        pendingQuestions,
        totalProducts: currentSellerProducts.length,
        averageRating: currentSellerProfile.reputationScore,
      },
      recentOrders: currentSellerOrders.slice(0, 5),
      topProducts: currentSellerProducts.slice(0, 4),
      salesHistory: [],
      countryDistribution: [],
    },
  });
});

sellerRouter.get('/analytics', async (req: Request, res: Response) => {
  const { period = '30days' } = req.query;
  const grossRevenue = currentSellerOrders.reduce((acc, o) => acc + o.totalAmount, 0);
  const netRevenue = currentSellerOrders.reduce((acc, o) => acc + o.netPayout, 0);
  const totalOrders = currentSellerOrders.length;
  const averageTicket = totalOrders > 0 ? Math.round(grossRevenue / totalOrders) : 0;

  return res.json({
    success: true,
    data: {
      period,
      grossRevenue,
      netRevenue,
      totalOrders,
      averageTicket,
      conversionRate: '0.0%',
      viewsCount: 0,
      salesByDay: [],
    },
  });
});

function canSellerOperate(seller: any): boolean {
  if (!seller) return false;
  if (seller.isEmailVerified === false) return false;
  if (seller.status === 'blocked' || seller.status === 'suspended') return false;
  const kyc = seller.kycStatus;
  return kyc === 'verified' || kyc === 'approved';
}

// ==========================================
// HELPER FOR RESOLVING SELLER RECORD
// ==========================================
async function resolveSeller(req: AuthRequest) {
  const db = getDb();
  if (!db) return null;
  const userId = req.user?.id;
  if (!userId) return null;

  const s = await db.select().from(sellers).where(eq(sellers.userId, userId)).limit(1);
  if (s.length === 0) return null;

  const targetSeller = s[0];
  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const userProfileRows = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  const kycRows = await db.select().from(sellerKyc).where(eq(sellerKyc.sellerId, targetSeller.id)).limit(1);

  const user = userRows[0];
  const userProf = userProfileRows[0];
  const kycRow = kycRows[0];

  const rawKycStatus = kycRow?.status || user?.kycStatus || 'pending';
  const isApproved = rawKycStatus === 'verified' || rawKycStatus === 'approved';
  const canonicalKycStatus = isApproved ? 'verified' : (rawKycStatus === 'under_review' ? 'under_review' : rawKycStatus === 'rejected' ? 'rejected' : 'pending');

  // Fix Requirement 9: NEVER return phone number as taxId!
  const cleanTaxId = (targetSeller.taxId && targetSeller.taxId !== targetSeller.phone) ? targetSeller.taxId : (userProf?.taxId || '');

  return {
    ...targetSeller,
    taxId: cleanTaxId,
    dateOfBirth: userProf?.dateOfBirth || '',
    kycStatus: canonicalKycStatus,
    isEmailVerified: user?.isEmailVerified === true,
  };
}

// ==========================================
// 2. PROFILE, STORES & TEAM (REAL POSTGRESQL)
// ==========================================

sellerRouter.post('/onboard', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, message: 'Banco indisponível.' });
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Não autorizado.' } });
    }

    // 1. Check if seller already exists for this user
    const existingSeller = await db.select().from(sellers).where(eq(sellers.userId, userId)).limit(1);
    if (existingSeller.length > 0) {
      return res.json({
        success: true,
        message: 'Perfil de vendedor já cadastrado.',
        data: existingSeller[0],
      });
    }

    // 2. Fetch user real details
    const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = userRows[0];
    if (!user) {
      return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Usuário não encontrado.' } });
    }

    // 3. Extract inputs (or fallback to real user details)
    const { companyName, tradingName, taxId, phone, countryCode } = req.body;
    const finalCompanyName = (companyName || user.fullName || 'Vendedor').trim();
    const finalTradingName = (tradingName || companyName || user.fullName || 'Vendedor').trim();
    const finalTaxId = (taxId && taxId.trim() !== phone) ? taxId.trim() : '';
    const finalPhone = (phone || user.phone || '').trim();
    const finalCountryCode = (countryCode || user.countryCode || 'GW').trim().toUpperCase();

    const sellerId = `sel_${userId}`;

    // 4. Create sellers record with status = 'pending'
    const newSeller = {
      id: sellerId,
      userId,
      companyName: finalCompanyName,
      tradingName: finalTradingName,
      taxId: finalTaxId,
      phone: finalPhone,
      countryCode: finalCountryCode,
      status: 'pending',
      commissionRate: '8.00',
      rating: '5.00',
      totalSales: '0.00',
      totalOrders: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(sellers).values(newSeller);

    // 5. Create sellerProfiles record
    const existingProfile = await db.select().from(sellerProfiles).where(eq(sellerProfiles.sellerId, sellerId)).limit(1);
    if (existingProfile.length === 0) {
      await db.insert(sellerProfiles).values({
        id: `sp_${userId}`,
        sellerId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // 6. Ensure user role is SELLER
    if (user.role !== 'SELLER' && user.role !== 'ADMIN' && user.role !== 'GLOBAL_ADMIN') {
      await db.update(users).set({ role: 'SELLER', updatedAt: new Date() }).where(eq(users.id, userId));
    }

    return res.status(201).json({
      success: true,
      message: 'Cadastro de vendedor realizado com sucesso!',
      data: newSeller,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || 'Erro ao realizar onboarding de vendedor.' });
  }
});

sellerRouter.get('/profile', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, message: 'Banco indisponível.' });
    const seller = await resolveSeller(req);
    if (!seller) {
      return res.json({ success: true, data: null });
    }
    const profileRows = await db.select().from(sellerProfiles).where(eq(sellerProfiles.sellerId, seller.id)).limit(1);
    const profile: any = profileRows[0] || {};
    const userRows = await db.select().from(users).where(eq(users.id, seller.userId)).limit(1);
    const user = userRows[0];

    return res.json({
      success: true,
      data: {
        id: seller.id,
        userId: seller.userId,
        fullName: user?.fullName || seller.companyName,
        commercialName: seller.tradingName || seller.companyName,
        companyName: seller.companyName,
        taxId: seller.taxId,
        phone: seller.phone,
        email: user?.email || '',
        country: seller.countryCode,
        status: seller.status,
        description: profile.description || '',
        returnPolicy: profile.returnPolicy || '',
        shippingPolicy: profile.shippingPolicy || '',
        bannerUrl: profile.bannerUrl || '',
        verifiedAt: profile.verifiedAt ? profile.verifiedAt.toLocaleDateString('pt-BR') : null,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || 'Erro ao carregar perfil.' });
  }
});

sellerRouter.patch('/profile', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, message: 'Banco indisponível.' });
    const seller = await resolveSeller(req);
    if (!seller) return res.status(404).json({ success: false, message: 'Vendedor não encontrado.' });

    const { companyName, tradingName, phone, description, returnPolicy, shippingPolicy } = req.body;

    if (companyName || tradingName || phone) {
      await db.update(sellers)
        .set({
          companyName: companyName || seller.companyName,
          tradingName: tradingName || seller.tradingName,
          phone: phone || seller.phone,
          updatedAt: new Date(),
        })
        .where(eq(sellers.id, seller.id));
    }

    const profileRows = await db.select().from(sellerProfiles).where(eq(sellerProfiles.sellerId, seller.id)).limit(1);
    if (profileRows.length > 0) {
      await db.update(sellerProfiles)
        .set({
          description: description !== undefined ? description : profileRows[0].description,
          returnPolicy: returnPolicy !== undefined ? returnPolicy : profileRows[0].returnPolicy,
          shippingPolicy: shippingPolicy !== undefined ? shippingPolicy : profileRows[0].shippingPolicy,
          updatedAt: new Date(),
        })
        .where(eq(sellerProfiles.sellerId, seller.id));
    } else {
      await db.insert(sellerProfiles).values({
        id: `prof_${Date.now()}`,
        sellerId: seller.id,
        description,
        returnPolicy,
        shippingPolicy,
      });
    }

    await delCache('seller_profile');
    return res.json({
      success: true,
      message: 'Perfil do vendedor atualizado com sucesso!',
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || 'Erro ao atualizar perfil.' });
  }
});

sellerRouter.get('/stores', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, message: 'Banco indisponível.' });
    const seller = await resolveSeller(req);
    if (!seller) return res.json({ success: true, data: [] });

    const storeRows = await db.select().from(storesTable).where(eq(storesTable.sellerId, seller.id));
    const categoriesRows = await db.select().from(categories).catch(() => []);
    const categoriesMap = new Map<string, string>(categoriesRows.map((c: any) => [c.id, c.name] as [string, string]));

    const formattedStores = storeRows.map((s) => ({
      ...s,
      logo: s.logoUrl || '',
      banner: s.bannerUrl || '',
      category: s.categoryId ? (categoriesMap.get(s.categoryId) || '') : '',
      country: s.countryCode || 'GW',
      city: s.addressJson && typeof s.addressJson === 'object' ? (s.addressJson as any).city || '' : '',
      address: s.addressJson && typeof s.addressJson === 'object' ? (s.addressJson as any).address || '' : '',
    }));

    return res.json({ success: true, data: formattedStores });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || 'Erro ao carregar lojas.' });
  }
});

sellerRouter.post('/stores', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, message: 'Banco indisponível.' });
    const seller = await resolveSeller(req);
    if (!seller) return res.status(404).json({ success: false, message: 'Vendedor não cadastrado.' });
    if (!canSellerOperate(seller)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'SELLER_KYC_REQUIRED',
          message: '🔒 Recurso Bloqueado: Sua conta de vendedor precisa ter a verificação KYC aprovada pelo administrador para criar lojas.',
        },
      });
    }

    const { name, slug, description, countryCode, logoUrl, bannerUrl, categoryId, addressJson, businessHoursJson } = req.body;

    // Rule 9: Remove name fallback - name is REQUIRED
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'STORE_NAME_REQUIRED', message: 'O nome da loja é obrigatório.' },
      });
    }

    // Rule 10: Backend Category Validation
    if (!categoryId || typeof categoryId !== 'string' || !categoryId.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_STORE_CATEGORY', message: 'Selecione uma categoria válida para a loja.' },
      });
    }

    const catRows = await db.select().from(categories).where(eq(categories.id, categoryId.trim())).limit(1);
    if (catRows.length === 0 || catRows[0].isActive === false) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_STORE_CATEGORY', message: 'Categoria inválida ou inativa.' },
      });
    }

    const storeId = `store_${Date.now()}`;
    const storeSlug = slug || name.trim().toLowerCase().replace(/[^a-z0-9]/g, '-');

    const newStore = {
      id: storeId,
      sellerId: seller.id,
      name: name.trim(),
      slug: storeSlug,
      countryCode: countryCode || seller.countryCode || 'GW',
      description: description || '',
      logoUrl: logoUrl || null,
      bannerUrl: bannerUrl || null,
      categoryId: categoryId.trim(),
      addressJson: addressJson || null,
      businessHoursJson: businessHoursJson || null,
      status: 'active',
    };

    await db.insert(storesTable).values(newStore);
    return res.json({
      success: true,
      message: `Loja "${newStore.name}" criada com sucesso!`,
      data: newStore,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || 'Erro ao criar loja.' });
  }
});

sellerRouter.patch('/stores/:id', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, message: 'Banco indisponível.' });
    const seller = await resolveSeller(req);
    if (!seller || !canSellerOperate(seller)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'SELLER_KYC_REQUIRED',
          message: '🔒 Recurso Bloqueado: Verificação KYC necessária para atualizar dados da loja.',
        },
      });
    }

    // Rule 5: Ownership Validation
    const storeRows = await db.select().from(storesTable).where(and(eq(storesTable.id, req.params.id), eq(storesTable.sellerId, seller.id))).limit(1);
    if (storeRows.length === 0) {
      return res.status(403).json({
        success: false,
        error: { code: 'STORE_NOT_OWNED', message: 'Você não tem permissão para alterar esta loja ou ela não foi encontrada.' },
      });
    }

    const { name, description, status, logoUrl, bannerUrl, categoryId, addressJson, businessHoursJson } = req.body;

    // Rule 10: Category validation if provided
    if (categoryId) {
      const catRows = await db.select().from(categories).where(eq(categories.id, String(categoryId).trim())).limit(1);
      if (catRows.length === 0 || catRows[0].isActive === false) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_STORE_CATEGORY', message: 'Categoria inválida ou inativa.' },
        });
      }
    }

    // Rule 8: Allowed operational statuses only (never administrative)
    const allowedStatuses = ['active', 'paused', 'closed'];
    const updatedStatus = status && allowedStatuses.includes(status) ? status : storeRows[0].status;

    await db.update(storesTable)
      .set({
        name: name ? String(name).trim() : storeRows[0].name,
        description: description !== undefined ? description : storeRows[0].description,
        status: updatedStatus,
        logoUrl: logoUrl !== undefined ? logoUrl : storeRows[0].logoUrl,
        bannerUrl: bannerUrl !== undefined ? bannerUrl : storeRows[0].bannerUrl,
        categoryId: categoryId ? String(categoryId).trim() : storeRows[0].categoryId,
        addressJson: addressJson !== undefined ? addressJson : storeRows[0].addressJson,
        businessHoursJson: businessHoursJson !== undefined ? businessHoursJson : storeRows[0].businessHoursJson,
        updatedAt: new Date(),
      })
      .where(and(eq(storesTable.id, req.params.id), eq(storesTable.sellerId, seller.id)));

    return res.json({
      success: true,
      message: 'Loja atualizada com sucesso!',
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || 'Erro ao atualizar loja.' });
  }
});

sellerRouter.get('/team', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, message: 'Banco indisponível.' });
    const seller = await resolveSeller(req);
    if (!seller) return res.json({ success: true, data: [] });

    const storeRows = await db.select().from(storesTable).where(eq(storesTable.sellerId, seller.id));
    const storeIds = storeRows.map((s: any) => s.id);
    if (storeIds.length === 0) return res.json({ success: true, data: [] });

    const members = await db.select().from(storeMembers);
    const filteredMembers = members.filter((m: any) => storeIds.includes(m.storeId));
    const userIds = filteredMembers.map((m: any) => m.userId);
    const userRows = userIds.length ? await db.select().from(users) : [];

    const data = filteredMembers.map((m: any) => {
      const u = userRows.find((usr: any) => usr.id === m.userId);
      const st = storeRows.find((s: any) => s.id === m.storeId);
      return {
        id: m.id,
        storeId: m.storeId,
        storeName: st?.name || '',
        userId: m.userId,
        name: u?.fullName || 'Membro da Equipe',
        email: u?.email || '',
        role: m.role || 'manager',
        status: u?.isActive ? 'active' : 'suspended',
        createdAt: m.createdAt,
      };
    });

    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || 'Erro ao carregar equipe.' });
  }
});

sellerRouter.post('/team', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, message: 'Banco indisponível.' });
    const seller = await resolveSeller(req);
    if (!seller || !canSellerOperate(seller)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'SELLER_KYC_REQUIRED',
          message: '🔒 Recurso Bloqueado: Sua conta de vendedor precisa ter a verificação KYC aprovada pelo administrador para convidar membros para a equipe.',
        },
      });
    }

    const { email, role, storeId } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'E-mail do membro é obrigatório.' });

    // Rule 6: Validate Store Ownership for Team Invites
    if (!storeId) {
      return res.status(400).json({ success: false, message: 'ID da loja é obrigatório.' });
    }
    const targetStore = await db.select().from(storesTable).where(and(eq(storesTable.id, storeId), eq(storesTable.sellerId, seller.id))).limit(1);
    if (targetStore.length === 0) {
      return res.status(403).json({
        success: false,
        error: { code: 'STORE_NOT_OWNED', message: 'Você não tem permissão para gerenciar a equipe desta loja ou ela não existe.' },
      });
    }

    const userRows = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
    if (userRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado na plataforma com este e-mail.' });
    }

    const targetUser = userRows[0];
    const memberId = `stmember_${Date.now()}`;
    await db.insert(storeMembers).values({
      id: memberId,
      storeId: storeId,
      userId: targetUser.id,
      role: role || 'manager',
    });

    return res.json({
      success: true,
      message: `Membro ${targetUser.fullName} adicionado à equipe da loja!`,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || 'Erro ao adicionar membro à equipe.' });
  }
});

sellerRouter.delete('/team/:id', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, message: 'Banco indisponível.' });
    const seller = await resolveSeller(req);
    if (!seller || !canSellerOperate(seller)) {
      return res.status(403).json({
        success: false,
        error: { code: 'SELLER_KYC_REQUIRED', message: '🔒 Recurso Bloqueado: Verificação KYC necessária.' },
      });
    }

    // Rule 7: Delete Team Member Ownership Validation
    const memberRows = await db.select().from(storeMembers).where(eq(storeMembers.id, req.params.id)).limit(1);
    if (memberRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Membro da equipe não encontrado.' });
    }

    const member = memberRows[0];
    const storeRows = await db.select().from(storesTable).where(and(eq(storesTable.id, member.storeId), eq(storesTable.sellerId, seller.id))).limit(1);
    if (storeRows.length === 0) {
      return res.status(403).json({
        success: false,
        error: { code: 'TEAM_MEMBER_NOT_OWNED', message: 'Você não tem permissão para remover este membro da equipe.' },
      });
    }

    await db.delete(storeMembers).where(eq(storeMembers.id, req.params.id));
    return res.json({ success: true, message: 'Membro removido da equipe com sucesso.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || 'Erro ao remover membro.' });
  }
});

// ==========================================
// 3. PRODUCTS & INVENTORY
// ==========================================

sellerRouter.get('/products', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const seller = await resolveSeller(req);
    const { status, q } = req.query;

    if (db && seller) {
      const conditions = [eq(products.sellerId, seller.id)];
      if (status && typeof status === 'string' && status !== 'todos') {
        conditions.push(eq(products.status, status));
      }
      const dbProducts = await db.select().from(products).where(and(...conditions)).orderBy(desc(products.createdAt));
      let list = dbProducts.map(p => ({
        ...p,
        price: Number(p.price),
        originalPrice: p.originalPrice ? Number(p.originalPrice) : undefined,
        rating: Number(p.rating || 5.0),
        stock: Number(p.stock),
      }));
      if (q && typeof q === 'string') {
        const term = q.toLowerCase();
        list = list.filter(p => p.title?.toLowerCase().includes(term) || p.brand?.toLowerCase().includes(term));
      }
      return res.json({ success: true, data: list });
    }

    return res.json({ success: true, data: [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message || 'Erro ao carregar produtos.' });
  }
});

sellerRouter.get('/products/:id', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    if (db) {
      const rows = await db.select().from(products).where(eq(products.id, id)).limit(1);
      if (rows.length > 0) {
        const p = rows[0];
        const variants = await db.select().from(productVariants).where(eq(productVariants.productId, id));
        const images = await db.select().from(productImages).where(eq(productImages.productId, id));
        const attrs = await db.select().from(productAttributes).where(eq(productAttributes.productId, id));
        return res.json({
          success: true,
          data: {
            ...p,
            price: Number(p.price),
            originalPrice: p.originalPrice ? Number(p.originalPrice) : undefined,
            rating: Number(p.rating || 5.0),
            stock: Number(p.stock),
            variants,
            images,
            attributes: attrs,
          },
        });
      }
    }
    return res.status(404).json({ success: false, message: 'Produto não encontrado.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

sellerRouter.post('/products', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não autenticado.',
        error: { code: 'UNAUTHORIZED', message: 'Usuário não autenticado.' },
      });
    }

    const seller = await resolveSeller(req);
    if (!seller || !canSellerOperate(seller)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'SELLER_KYC_REQUIRED',
          message: '🔒 Recurso Bloqueado: Sua conta de vendedor precisa ter a verificação KYC aprovada pelo administrador para cadastrar produtos.',
        },
      });
    }

    const createdProduct = await ProductCreationService.createProduct(req.user.id, req.body);
    return res.status(201).json({
      success: true,
      message: `Produto "${createdProduct.title}" publicado com sucesso no catálogo oficial!`,
      data: createdProduct,
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      message: err.message || 'Erro ao publicar produto.',
      error: { code: 'CREATE_PRODUCT_FAILED', message: err.message },
    });
  }
});

async function checkSellerProductOwnership(db: any, userId: string, productId: string) {
  const resolvedSeller = await resolveSeller({ user: { id: userId } } as any);
  if (!resolvedSeller || !canSellerOperate(resolvedSeller)) {
    return { authorized: false, error: '🔒 Recurso Bloqueado: Sua conta de vendedor precisa ter a verificação KYC aprovada pelo administrador para alterar produtos.', code: 'SELLER_KYC_REQUIRED', status: 403 };
  }
  const [prod] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!prod) {
    return { authorized: false, error: 'Produto não encontrado.', code: 'PRODUCT_NOT_FOUND', status: 404 };
  }
  if (prod.sellerId !== resolvedSeller.id) {
    return { authorized: false, error: 'Você não tem permissão para alterar este produto.', code: 'PRODUCT_NOT_OWNED', status: 403 };
  }
  return { authorized: true, seller: resolvedSeller, product: prod };
}

sellerRouter.patch('/products/:id', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db || !req.user?.id) return res.status(401).json({ success: false, message: 'Não autorizado.' });

    const check = await checkSellerProductOwnership(db, req.user.id, req.params.id);
    if (!check.authorized) {
      return res.status(check.status).json({ success: false, error: { code: check.code, message: check.error } });
    }

    const { id } = req.params;
    const updates = req.body;
    const fieldsToUpdate: any = { updatedAt: new Date() };
    if (updates.title !== undefined) fieldsToUpdate.title = updates.title;
    if (updates.price !== undefined) fieldsToUpdate.price = String(updates.price);
    if (updates.status !== undefined) fieldsToUpdate.status = updates.status;
    if (updates.description !== undefined) fieldsToUpdate.description = updates.description;
    if (updates.image !== undefined) fieldsToUpdate.image = updates.image;
    if (updates.brand !== undefined) fieldsToUpdate.brand = updates.brand;
    if (updates.freeShipping !== undefined) fieldsToUpdate.freeShipping = updates.freeShipping;
    if (updates.full !== undefined) fieldsToUpdate.full = updates.full;

    if (Object.keys(fieldsToUpdate).length > 1) {
      await db.update(products).set(fieldsToUpdate).where(eq(products.id, id));
    }

    if (updates.stock !== undefined) {
      await InventoryService.updateSellerStock(id, Number(updates.stock), check.seller.id, null, req.user.id);
    }

    await delCache('products_list_all');
    return res.json({ success: true, message: 'Produto atualizado com sucesso!' });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

sellerRouter.delete('/products/:id', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db || !req.user?.id) return res.status(401).json({ success: false, message: 'Não autorizado.' });

    const check = await checkSellerProductOwnership(db, req.user.id, req.params.id);
    if (!check.authorized) {
      return res.status(check.status).json({ success: false, error: { code: check.code, message: check.error } });
    }

    await db.delete(products).where(eq(products.id, req.params.id));
    await delCache('products_list_all');
    return res.json({ success: true, message: 'Produto excluído do catálogo.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

sellerRouter.patch('/products/:id/stock', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db || !req.user?.id) return res.status(401).json({ success: false, message: 'Não autorizado.' });

    const check = await checkSellerProductOwnership(db, req.user.id, req.params.id);
    if (!check.authorized) {
      return res.status(check.status).json({ success: false, error: { code: check.code, message: check.error } });
    }

    const { stock } = req.body;
    await InventoryService.updateSellerStock(req.params.id, Number(stock), check.seller.id, null, req.user.id);
    return res.json({ success: true, message: `Estoque do vendedor atualizado para ${stock} unidades.` });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err?.message });
  }
});

sellerRouter.patch('/products/:id/status', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db || !req.user?.id) return res.status(401).json({ success: false, message: 'Não autorizado.' });

    const check = await checkSellerProductOwnership(db, req.user.id, req.params.id);
    if (!check.authorized) {
      return res.status(check.status).json({ success: false, error: { code: check.code, message: check.error } });
    }

    const { status } = req.body;
    await db.update(products).set({ status, updatedAt: new Date() }).where(eq(products.id, req.params.id));
    return res.json({ success: true, message: `Status do anúncio alterado para: ${status}` });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

// GET /api/v1/seller/inventory
sellerRouter.get('/inventory', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db || !req.user?.id) return res.status(401).json({ success: false, message: 'Não autorizado.' });

    const [seller] = await db.select().from(sellers).where(eq(sellers.userId, req.user.id)).limit(1);
    if (!seller) return res.status(403).json({ success: false, message: 'Vendedor não encontrado.' });

    const rows = await db.select().from(inventory).where(eq(inventory.sellerId, seller.id));
    return res.json({ success: true, data: rows });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

// GET /api/v1/seller/inventory/transfers
sellerRouter.get('/inventory/transfers', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db || !req.user?.id) return res.status(401).json({ success: false, message: 'Não autorizado.' });

    const [seller] = await db.select().from(sellers).where(eq(sellers.userId, req.user.id)).limit(1);
    if (!seller) return res.status(403).json({ success: false, message: 'Vendedor não encontrado.' });

    const rows = await db
      .select()
      .from(inventoryTransfers)
      .where(eq(inventoryTransfers.sellerId, seller.id))
      .orderBy(desc(inventoryTransfers.createdAt));

    return res.json({ success: true, data: rows });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

// POST /api/v1/seller/inventory/transfers
sellerRouter.post('/inventory/transfers', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db || !req.user?.id) return res.status(401).json({ success: false, message: 'Não autorizado.' });

    const [seller] = await db.select().from(sellers).where(eq(sellers.userId, req.user.id)).limit(1);
    if (!seller) return res.status(403).json({ success: false, message: 'Vendedor não encontrado.' });

    const { productId, variantId, toWarehouseId, quantity, deliveryMode } = req.body;
    if (!productId || !toWarehouseId || !quantity) {
      return res.status(400).json({ success: false, message: 'productId, toWarehouseId e quantity são obrigatórios.' });
    }

    const [sellerUser] = await db.select().from(users).where(eq(users.id, req.user.id)).limit(1);
    const [store] = await db.select().from(storesTable).where(eq(storesTable.sellerId, seller.id)).limit(1);
    const [sellerAddress] = await db.select().from(addresses).where(eq(addresses.userId, req.user.id)).limit(1);

    let pickupSnapshotJson: any = req.body.pickupSnapshotJson || null;
    if (!pickupSnapshotJson) {
      const addrFormatted = sellerAddress
        ? `${sellerAddress.street}, ${sellerAddress.number}${sellerAddress.complement ? ' - ' + sellerAddress.complement : ''}${sellerAddress.neighborhood ? ', ' + sellerAddress.neighborhood : ''}`.trim()
        : null;

      pickupSnapshotJson = {
        storeName: store?.name || seller.tradingName || seller.companyName || null,
        contactName: sellerUser?.fullName || seller.companyName || seller.tradingName || null,
        phone: sellerAddress?.phone || seller.phone || null,
        address: addrFormatted || null,
        city: sellerAddress?.city || null,
        region: sellerAddress?.state || null,
        countryCode: sellerAddress?.countryCode || store?.countryCode || seller.countryCode || null,
      };
    }

    const mode = deliveryMode === 'SELLER_DROPOFF' ? 'SELLER_DROPOFF' : 'NUSALI_PICKUP';

    const transferResult = await InventoryService.requestTransferToHub(
      seller.id,
      productId,
      toWarehouseId,
      Number(quantity),
      variantId,
      mode,
      pickupSnapshotJson
    );

    return res.status(201).json({
      success: true,
      message: `Solicitação de transferência de ${quantity} unidades criada com sucesso!`,
      data: transferResult,
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err?.message });
  }
});

// POST /api/v1/seller/inventory/transfers/:id/cancel
sellerRouter.post('/inventory/transfers/:id/cancel', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db || !req.user?.id) return res.status(401).json({ success: false, message: 'Não autorizado.' });

    const [seller] = await db.select().from(sellers).where(eq(sellers.userId, req.user.id)).limit(1);
    if (!seller) return res.status(403).json({ success: false, message: 'Vendedor não encontrado.' });

    const result = await InventoryService.cancelTransferToHub(req.params.id, seller.id, true);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err?.message });
  }
});

sellerRouter.get('/warehouses', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (db) {
      const whList = await db.select().from(warehouses).where(eq(warehouses.status, 'active'));
      return res.json({ success: true, data: whList });
    }
    return res.json({ success: true, data: [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message || 'Erro ao carregar armazéns.' });
  }
});

// ==========================================
// 4. ORDERS & FULFILLMENT
// ==========================================

sellerRouter.get('/orders', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const seller = await resolveSeller(req);
    if (!seller) return res.status(403).json({ success: false, message: 'Vendedor não encontrado.' });
    if (!db) return res.json({ success: true, data: [] });

    const { status } = req.query;

    const items = await db
      .select({
        orderItemId: orderItems.id,
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        buyerId: orders.buyerId,
        productId: orderItems.productId,
        productTitle: orderItems.productTitle,
        productSku: orderItems.productSku,
        variantTitle: orderItems.variantTitle,
        productImage: orderItems.productImage,
        quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice,
        subtotal: orderItems.subtotal,
        fulfillmentMode: orderItems.fulfillmentMode,
        itemStatus: orderItems.status,
        orderStatus: orders.status,
        paymentMethod: orders.paymentMethod,
        paymentStatus: orders.paymentStatus,
        shippingAddressJson: orders.shippingAddressJson,
        createdAt: orders.createdAt,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(
        and(
          eq(orderItems.sellerId, seller.id),
          eq(orderItems.fulfillmentMode, 'SELLER_FULFILLMENT')
        )
      )
      .orderBy(desc(orders.createdAt));

    const mapped = items.map((item) => {
      const addr = (item.shippingAddressJson as any) || {};
      const statusMap: Record<string, string> = {
        pending_payment: 'pending_payment',
        paid: 'preparing',
        pending_preparation: 'preparing',
        preparing: 'preparing',
        ready_to_ship: 'preparing',
        shipped: 'shipped',
        delivered: 'delivered',
        cancelled: 'cancelled',
      };

      const currentStatus = item.itemStatus || item.orderStatus;
      const isPendingPayment = item.orderStatus === 'pending_payment' || item.paymentStatus === 'pending';
      const mappedStatus = isPendingPayment ? 'pending_payment' : (statusMap[currentStatus] || currentStatus);

      return {
        id: item.orderItemId,
        orderItemId: item.orderItemId,
        orderId: item.orderId,
        orderNumber: item.orderNumber,
        buyerName: addr.recipientName || 'Não informado',
        buyerPhone: addr.phone || 'Não informado',
        buyerCountry: addr.countryCode || addr.country || 'Não informado',
        deliveryCity: addr.city || 'Não informado',
        deliveryAddress: `${addr.street || ''}, ${addr.number || ''} ${addr.neighborhood || ''}`.trim() || 'Não informado',
        productTitle: item.productTitle,
        productSku: item.productSku || item.productId,
        productImage: item.productImage,
        variantTitle: item.variantTitle,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        totalAmount: Number(item.subtotal),
        fulfillmentMode: item.fulfillmentMode,
        status: mappedStatus,
        rawStatus: currentStatus,
        createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : new Date().toISOString(),
      };
    });

    const filtered = status && status !== 'todos'
      ? mapped.filter(o => o.status === status || o.rawStatus === status)
      : mapped;

    return res.json({ success: true, data: filtered });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

sellerRouter.patch('/orders/:id/status', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível.');

    const seller = await resolveSeller(req);
    if (!seller) return res.status(403).json({ success: false, message: 'Vendedor não encontrado.' });

    const { id } = req.params;
    const { status } = req.body;

    if (status === 'delivered' || status === 'entregue') {
      return res.status(403).json({
        success: false,
        message: 'VENDEDOR_NAO_AUTORIZADO: O vendedor não tem permissão para marcar um pedido como entregue.',
      });
    }

    const targetItems = await db
      .select()
      .from(orderItems)
      .where(and(eq(orderItems.id, id), eq(orderItems.sellerId, seller.id)));

    let targetItem = targetItems[0];
    if (!targetItem) {
      const itemsByOrder = await db
        .select()
        .from(orderItems)
        .where(and(eq(orderItems.orderId, id), eq(orderItems.sellerId, seller.id)));
      if (itemsByOrder.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'FORBIDDEN: Você não possui permissão para alterar este item/pedido.',
        });
      }
      targetItem = itemsByOrder[0];
    }

    if (targetItem.sellerId !== seller.id) {
      return res.status(403).json({
        success: false,
        message: 'FORBIDDEN: Este item pertence a outro vendedor.',
      });
    }

    if (targetItem.fulfillmentMode !== 'SELLER_FULFILLMENT') {
      return res.status(403).json({
        success: false,
        message: 'FORBIDDEN: O vendedor só pode alterar alocações de estoque SELLER_FULFILLMENT.',
      });
    }

    // Requirement 2: BLOQUEAR SELLER SEM PAGAMENTO CONFIRMADO
    const parentOrders = await db
      .select({ id: orders.id, status: orders.status, paymentStatus: orders.paymentStatus })
      .from(orders)
      .where(eq(orders.id, targetItem.orderId))
      .limit(1);

    const parentOrder = parentOrders[0];
    const isPaymentConfirmed = parentOrder && parentOrder.paymentStatus === 'paid';

    const allowUnpaidInDev = process.env.ALLOW_UNPAID_FULFILLMENT_IN_DEV === 'true';

    if (!isPaymentConfirmed && !allowUnpaidInDev) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'PAYMENT_NOT_CONFIRMED',
          message: 'O pedido ainda não possui pagamento confirmado.',
        },
      });
    }

    const previousStatus = targetItem.status;
    const newStatus = status === 'shipped' || status === 'enviado' ? 'shipped' : status || 'preparing';

    if (newStatus === 'shipped') {
      await db.transaction(async (tx) => {
        await ShipmentService.executePhysicalDispatch(tx, targetItem.id, req.user!.id);
      });
    } else {
      await db.transaction(async (tx) => {
        await tx
          .update(orderItems)
          .set({ status: newStatus })
          .where(eq(orderItems.id, targetItem.id));

        if (newStatus === 'ready_to_ship') {
          await ShipmentService.createOrGetShipmentForOrderItem(tx, targetItem.id, req.user!.id);
        }

        await syncOrderFulfillmentStatus(targetItem.orderId, tx);
      });
    }

    return res.json({
      success: true,
      message: 'Status do item/pedido atualizado com sucesso!',
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

// ==========================================
// 5. FINANCIALS, WALLET & PAYOUTS
// ==========================================

sellerRouter.get('/wallet', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const seller = await resolveSeller(req);

    if (!db || !seller) {
      return res.json({
        success: true,
        data: { available: 0, retained: 0, totalEarned: 0, currency: 'XOF', transactions: [] },
      });
    }

    // Get or auto-create wallet for seller
    let walletRows = await db.select().from(wallets).where(eq(wallets.userId, seller.userId)).limit(1);
    let w = walletRows[0];
    if (!w) {
      const wId = `wlt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await db.insert(wallets).values({
        id: wId,
        userId: seller.userId,
        balance: '0.00',
        cashbackBalance: '0.00',
        pendingBalance: '0.00',
        currency: 'XOF',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const createdW = await db.select().from(wallets).where(eq(wallets.id, wId)).limit(1);
      w = createdW[0];
    }

    // Dynamic retained calculation: sum of held escrow accounts for this seller
    const heldEscrow = await db
      .select({ amount: escrowAccounts.amount })
      .from(escrowAccounts)
      .where(and(eq(escrowAccounts.sellerId, seller.id), eq(escrowAccounts.status, 'held')));
    const retainedSum = heldEscrow.reduce((sum, row) => sum + Number(row.amount || 0), 0);

    // Dynamic totalEarned calculation: sum of all completed sales credits (escrow_release / deposit)
    const txs = await db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.walletId, w.id))
      .orderBy(desc(walletTransactions.createdAt));

    const totalEarnedSum = txs
      .filter(t => (t.type === 'escrow_release' || t.type === 'deposit') && t.status === 'completed')
      .reduce((sum, t) => sum + Math.abs(Number(t.amount || 0)), 0);

    return res.json({
      success: true,
      data: {
        available: Number(w.balance || 0),
        retained: retainedSum,
        totalEarned: totalEarnedSum,
        currency: w.currency || 'XOF',
        transactions: txs.map(t => ({
          id: t.id,
          type: t.type,
          title: t.title,
          date: t.createdAt,
          amount: Number(t.amount),
          currency: t.currency,
          status: t.status,
          balanceAfter: Number(t.balanceAfter),
          referenceId: t.referenceId,
          referenceType: t.referenceType,
        })),
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

sellerRouter.get('/payouts', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const seller = await resolveSeller(req);

    if (!db || !seller) {
      return res.json({ success: true, data: [] });
    }

    const payoutsList = await db
      .select()
      .from(sellerPayouts)
      .where(eq(sellerPayouts.sellerId, seller.id))
      .orderBy(desc(sellerPayouts.createdAt));

    return res.json({
      success: true,
      data: payoutsList.map(p => ({
        ...p,
        amount: Number(p.amount),
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

sellerRouter.post('/payouts/request', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const seller = await resolveSeller(req);
    const { amount, method, currency, bankAccountId } = req.body;
    const payoutAmount = Number(amount);

    if (!seller) {
      return res.status(404).json({
        success: false,
        error: { code: 'SELLER_NOT_FOUND', message: 'Perfil de vendedor não encontrado.' },
      });
    }

    if (!payoutAmount || payoutAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Informe um valor válido para saque.' });
    }

    if (!db) {
      return res.status(503).json({ success: false, message: 'Banco de dados indisponível.' });
    }

    // Requirement 2: Canonical Method Code Validation
    const canonicalMethod = (method || '').toLowerCase().trim();
    const CANONICAL_METHODS = ['orange_money', 'mtn', 'pix', 'bank_transfer', 'wallet'];
    if (!CANONICAL_METHODS.includes(canonicalMethod)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PAYOUT_METHOD',
          message: `Método de saque "${method}" é inválido. Métodos suportados: ${CANONICAL_METHODS.join(', ')}.`,
        },
      });
    }

    // Requirement 1: External methods REQUIRE bankAccountId
    if (canonicalMethod !== 'wallet' && !bankAccountId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'BANK_ACCOUNT_REQUIRED',
          message: 'Uma conta bancária/de recebimento cadastrada é obrigatória para este método de saque.',
        },
      });
    }

    // Execute balance check and reservation in transaction
    const result = await db.transaction(async (tx) => {
      let walletRows = await tx.select().from(wallets).where(eq(wallets.userId, seller.userId)).limit(1);
      let sellerWallet = walletRows[0];
      if (!sellerWallet) {
        const wId = `wlt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        await tx.insert(wallets).values({
          id: wId,
          userId: seller.userId,
          balance: '0.00',
          cashbackBalance: '0.00',
          pendingBalance: '0.00',
          currency: currency || 'XOF',
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        const createdW = await tx.select().from(wallets).where(eq(wallets.id, wId)).limit(1);
        sellerWallet = createdW[0];
      }

      if (sellerWallet.status !== 'active') {
        throw new Error('WALLET_LOCKED: Sua carteira está inativa ou bloqueada para transações.');
      }

      // Requirement 5: Currency Validation (wallet.currency is source of truth)
      const walletCurrency = sellerWallet.currency || 'XOF';
      if (currency && currency.toUpperCase() !== walletCurrency.toUpperCase()) {
        const err: any = new Error(`CURRENCY_MISMATCH: Moeda solicitada (${currency}) incompatível com a moeda da carteira (${walletCurrency}).`);
        err.code = 'CURRENCY_MISMATCH';
        throw err;
      }
      const finalCurrency = walletCurrency;

      // Requirement 4 & 5 & 7: Validate Destination Account Ownership, Method Compatibility & Currency
      let validatedBankAccountId: string | null = null;
      if (bankAccountId) {
        const bAccs = await tx
          .select()
          .from(sellerBankAccounts)
          .where(and(eq(sellerBankAccounts.id, bankAccountId), eq(sellerBankAccounts.sellerId, seller.id)))
          .limit(1);

        if (bAccs.length === 0) {
          const err: any = new Error('INVALID_BANK_ACCOUNT: A conta bancária informada não foi encontrada ou não pertence ao vendedor autenticado.');
          err.code = 'INVALID_BANK_ACCOUNT';
          throw err;
        }

        const bAcc = bAccs[0];

        // Currency Match with Bank Account
        if (bAcc.currency && bAcc.currency.toUpperCase() !== walletCurrency.toUpperCase()) {
          const err: any = new Error(`CURRENCY_MISMATCH: A moeda da conta cadastrada (${bAcc.currency}) difere da moeda da carteira (${walletCurrency}).`);
          err.code = 'CURRENCY_MISMATCH';
          throw err;
        }

        // Requirement 4: Method vs Account Field Compatibility
        if (canonicalMethod === 'bank_transfer') {
          const hasAcc = Boolean(bAcc.accountNumber && bAcc.accountNumber.trim() && bAcc.accountNumber !== 'N/A');
          const hasIban = Boolean(bAcc.ibanOrRouting && bAcc.ibanOrRouting.trim());
          if (!hasAcc && !hasIban) {
            const err: any = new Error('PAYOUT_DESTINATION_INCOMPATIBLE: A conta selecionada não possui número de conta nem IBAN/Routing para transferência bancária.');
            err.code = 'PAYOUT_DESTINATION_INCOMPATIBLE';
            throw err;
          }
        } else if (canonicalMethod === 'pix') {
          const hasPix = Boolean(bAcc.pixKey && bAcc.pixKey.trim());
          if (!hasPix) {
            const err: any = new Error('PAYOUT_DESTINATION_INCOMPATIBLE: A conta selecionada não possui Chave PIX cadastrada.');
            err.code = 'PAYOUT_DESTINATION_INCOMPATIBLE';
            throw err;
          }
        } else if (canonicalMethod === 'orange_money' || canonicalMethod === 'mtn') {
          const hasMobile = Boolean(
            (bAcc.mobileMoneyNumber && bAcc.mobileMoneyNumber.trim()) ||
            (bAcc.accountNumber && bAcc.accountNumber.trim() && bAcc.accountNumber !== 'N/A')
          );
          if (!hasMobile) {
            const err: any = new Error(`PAYOUT_DESTINATION_INCOMPATIBLE: A conta selecionada não possui número de celular/mobile money para ${canonicalMethod.toUpperCase()}.`);
            err.code = 'PAYOUT_DESTINATION_INCOMPATIBLE';
            throw err;
          }
        }

        validatedBankAccountId = bAcc.id;
      }

      const availableBalance = Number(sellerWallet.balance || 0);
      if (payoutAmount > availableBalance) {
        const err: any = new Error('INSUFFICIENT_AVAILABLE_BALANCE: Saldo disponível insuficiente para solicitar o saque.');
        err.code = 'INSUFFICIENT_AVAILABLE_BALANCE';
        throw err;
      }

      // Reserve balance upon payout creation
      const newBalance = availableBalance - payoutAmount;
      await tx
        .update(wallets)
        .set({
          balance: String(newBalance.toFixed(2)),
          updatedAt: new Date(),
        })
        .where(eq(wallets.id, sellerWallet.id));

      const payoutId = `payout_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await tx.insert(sellerPayouts).values({
        id: payoutId,
        sellerId: seller.id,
        amount: String(payoutAmount.toFixed(2)),
        currency: finalCurrency,
        method: canonicalMethod,
        bankAccountId: validatedBankAccountId,
        status: 'pending',
        createdAt: new Date(),
      });

      await tx.insert(walletTransactions).values({
        id: `wtx_payout_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        walletId: sellerWallet.id,
        type: 'payout',
        amount: String((-payoutAmount).toFixed(2)),
        currency: finalCurrency,
        title: `Solicitação de Saque (${canonicalMethod.toUpperCase()})`,
        referenceId: payoutId,
        referenceType: 'withdrawal',
        status: 'pending',
        balanceAfter: String(newBalance.toFixed(2)),
        idempotencyKey: `payout_request:${payoutId}`,
        createdAt: new Date(),
      });

      return {
        id: payoutId,
        amount: payoutAmount,
        currency: finalCurrency,
        method: canonicalMethod,
        bankAccountId: validatedBankAccountId,
        status: 'pending',
        newAvailableBalance: newBalance,
      };
    });

    return res.json({
      success: true,
      message: `Solicitação de saque de ${result.amount.toLocaleString()} ${result.currency} enviada com sucesso!`,
      data: result,
    });
  } catch (err: any) {
    if (err?.code === 'INVALID_PAYOUT_METHOD' || err?.message?.includes('INVALID_PAYOUT_METHOD')) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PAYOUT_METHOD', message: err.message },
      });
    }
    if (err?.code === 'BANK_ACCOUNT_REQUIRED' || err?.message?.includes('BANK_ACCOUNT_REQUIRED')) {
      return res.status(400).json({
        success: false,
        error: { code: 'BANK_ACCOUNT_REQUIRED', message: err.message },
      });
    }
    if (err?.code === 'PAYOUT_DESTINATION_INCOMPATIBLE' || err?.message?.includes('PAYOUT_DESTINATION_INCOMPATIBLE')) {
      return res.status(400).json({
        success: false,
        error: { code: 'PAYOUT_DESTINATION_INCOMPATIBLE', message: err.message },
      });
    }
    if (err?.code === 'CURRENCY_MISMATCH' || err?.message?.includes('CURRENCY_MISMATCH')) {
      return res.status(409).json({
        success: false,
        error: { code: 'CURRENCY_MISMATCH', message: err.message },
      });
    }
    if (err?.code === 'INVALID_BANK_ACCOUNT' || err?.message?.includes('INVALID_BANK_ACCOUNT')) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_BANK_ACCOUNT', message: err.message },
      });
    }
    if (err?.code === 'INSUFFICIENT_AVAILABLE_BALANCE' || err?.message?.includes('INSUFFICIENT_AVAILABLE_BALANCE')) {
      return res.status(409).json({
        success: false,
        error: { code: 'INSUFFICIENT_AVAILABLE_BALANCE', message: 'Saldo disponível insuficiente para solicitar o saque.' },
      });
    }
    return res.status(500).json({ success: false, message: err?.message });
  }
});

sellerRouter.get('/bank-accounts', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, message: 'Banco indisponível.' });
    const seller = await resolveSeller(req);
    if (!seller) return res.json({ success: true, data: [] });

    const accounts = await db.select().from(sellerBankAccounts).where(eq(sellerBankAccounts.sellerId, seller.id));
    return res.json({ success: true, data: accounts });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || 'Erro ao obter contas bancárias.' });
  }
});

sellerRouter.post('/bank-accounts', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, message: 'Banco indisponível.' });
    const seller = await resolveSeller(req);
    if (!seller) return res.status(404).json({ success: false, message: 'Vendedor não encontrado.' });

    const { accountType, bankName, accountHolder, accountNumber, ibanOrRouting, swift, pixKey, mobileMoneyNumber, currency, isDefault } = req.body;

    if (!accountHolder || !accountHolder.trim()) {
      return res.status(400).json({ success: false, message: 'O nome do titular (accountHolder) é obrigatório.' });
    }

    const type = (accountType || 'bank_transfer').toLowerCase().trim();
    const ALLOWED_ACCOUNT_TYPES = ['bank_transfer', 'pix', 'orange_money', 'mtn'];
    if (!ALLOWED_ACCOUNT_TYPES.includes(type)) {
      return res.status(400).json({ success: false, message: `Tipo de conta inválido (${accountType}). Tipos permitidos: ${ALLOWED_ACCOUNT_TYPES.join(', ')}.` });
    }

    // Validation per accountType according to Requirement 5
    if (type === 'pix') {
      if (!pixKey || !pixKey.trim()) {
        return res.status(400).json({ success: false, message: 'A Chave PIX (pixKey) é obrigatória para contas do tipo PIX.' });
      }
    } else if (type === 'orange_money' || type === 'mtn') {
      if (!mobileMoneyNumber || !mobileMoneyNumber.trim()) {
        return res.status(400).json({ success: false, message: `O número de telefone (mobileMoneyNumber) é obrigatório para contas ${type.toUpperCase()}.` });
      }
    } else if (type === 'bank_transfer') {
      const hasAcc = Boolean(accountNumber && accountNumber.trim());
      const hasIban = Boolean(ibanOrRouting && ibanOrRouting.trim());
      if (!hasAcc && !hasIban) {
        return res.status(400).json({ success: false, message: 'O número da conta ou IBAN/Routing é obrigatório para transferência bancária.' });
      }
    }

    const finalCurrency = (currency || 'XOF').toUpperCase();
    const allowedCurrencies = ['XOF', 'BRL', 'EUR', 'AOA', 'USD'];
    if (!allowedCurrencies.includes(finalCurrency)) {
      return res.status(400).json({ success: false, message: `Moeda inválida (${currency}).` });
    }

    const accId = `bank_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    await db.insert(sellerBankAccounts).values({
      id: accId,
      sellerId: seller.id,
      accountType: type,
      bankName: bankName && bankName.trim() ? bankName.trim() : null,
      accountHolder: accountHolder.trim(),
      accountNumber: accountNumber && accountNumber.trim() ? accountNumber.trim() : null,
      ibanOrRouting: ibanOrRouting && ibanOrRouting.trim() ? ibanOrRouting.trim() : null,
      swift: swift && swift.trim() ? swift.trim() : null,
      pixKey: pixKey && pixKey.trim() ? pixKey.trim() : null,
      mobileMoneyNumber: mobileMoneyNumber && mobileMoneyNumber.trim() ? mobileMoneyNumber.trim() : null,
      currency: finalCurrency,
      isDefault: isDefault !== undefined ? Boolean(isDefault) : true,
      createdAt: new Date(),
    });

    return res.json({
      success: true,
      message: 'Conta de recebimento cadastrada com sucesso!',
      data: { id: accId, accountType: type },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || 'Erro ao cadastrar conta.' });
  }
});

sellerRouter.delete('/bank-accounts/:id', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, message: 'Banco indisponível.' });
    const seller = await resolveSeller(req);
    if (!seller) return res.status(404).json({ success: false, message: 'Vendedor não encontrado.' });

    // Requirement 6: Delete ONLY if bankAccountId belongs to the authenticated seller
    const deleted = await db
      .delete(sellerBankAccounts)
      .where(and(eq(sellerBankAccounts.id, req.params.id), eq(sellerBankAccounts.sellerId, seller.id)))
      .returning();

    if (deleted.length === 0) {
      return res.status(403).json({
        success: false,
        error: { code: 'INVALID_BANK_ACCOUNT', message: 'Conta bancária não encontrada ou não pertence a este vendedor.' },
      });
    }

    return res.json({ success: true, message: 'Conta bancária removida com sucesso!' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || 'Erro ao remover conta bancária.' });
  }
});

// ==========================================
// 6. KYC VERIFICATION & BANK ACCOUNTS (REAL POSTGRESQL)
// ==========================================

sellerRouter.get('/kyc', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, message: 'Banco indisponível.' });
    const seller = await resolveSeller(req);
    if (!seller) {
      return res.status(404).json({
        success: false,
        error: { code: 'SELLER_PROFILE_NOT_FOUND', message: 'Perfil de vendedor não encontrado.' },
      });
    }

    const kycRows = await db.select().from(sellerKyc).where(eq(sellerKyc.sellerId, seller.id)).limit(1);
    const kyc = kycRows[0];
    const docs = await db.select().from(sellerDocuments).where(eq(sellerDocuments.sellerId, seller.id));

    const resolveSignedUrl = async (objectKey?: string | null, fileUrl?: string | null) => {
      if (objectKey) {
        try {
          return await storageService.getSignedUrl(objectKey, 900);
        } catch (e) {}
      }
      if (fileUrl && fileUrl.includes('.r2.cloudflarestorage.com/')) {
        const parts = fileUrl.split('.r2.cloudflarestorage.com/');
        if (parts[1]) {
          try {
            return await storageService.getSignedUrl(parts[1], 900);
          } catch (e) {}
        }
      }
      return fileUrl || '';
    };

    const docFrontSignedUrl = await resolveSignedUrl(
      docs.find((d: any) => d.documentType === 'identity_document' || d.documentType === 'identity_card')?.objectKey,
      kyc?.documentFrontUrl || docs.find((d: any) => d.documentType === 'identity_document' || d.documentType === 'identity_card')?.fileUrl
    );
    const selfieSignedUrl = await resolveSignedUrl(
      docs.find((d: any) => d.documentType === 'selfie')?.objectKey,
      kyc?.selfieUrl || docs.find((d: any) => d.documentType === 'selfie')?.fileUrl
    );
    const proofAddressSignedUrl = await resolveSignedUrl(
      docs.find((d: any) => d.documentType === 'proof_of_address')?.objectKey,
      kyc?.proofOfAddressUrl || docs.find((d: any) => d.documentType === 'proof_of_address')?.fileUrl
    );
    const businessLicenseSignedUrl = await resolveSignedUrl(
      docs.find((d: any) => d.documentType === 'business_license')?.objectKey,
      docs.find((d: any) => d.documentType === 'business_license')?.fileUrl
    );

    const documentsWithSignedUrls = await Promise.all(
      docs.map(async (d: any) => ({
        id: d.id,
        documentType: d.documentType,
        type: d.documentType,
        fileUrl: d.fileUrl,
        objectKey: d.objectKey,
        mimeType: d.mimeType,
        fileSize: d.fileSize,
        status: d.status,
        createdAt: d.createdAt,
        signedUrl: await resolveSignedUrl(d.objectKey, d.fileUrl),
      }))
    );

    return res.json({
      success: true,
      data: kyc
        ? {
            id: kyc.id,
            sellerId: kyc.sellerId,
            legalName: kyc.legalName,
            documentType: kyc.documentType,
            documentNumber: kyc.documentNumber,
            documentFrontUrl: docFrontSignedUrl || kyc.documentFrontUrl,
            documentBackUrl: kyc.documentBackUrl,
            selfieUrl: selfieSignedUrl || kyc.selfieUrl,
            proofOfAddressUrl: proofAddressSignedUrl || kyc.proofOfAddressUrl,
            businessLicenseUrl: businessLicenseSignedUrl,
            status: kyc.status,
            riskLevel: kyc.riskLevel,
            rejectionReason: kyc.rejectionReason,
            submittedAt: kyc.submittedAt,
            reviewedAt: kyc.reviewedAt,
            documents: documentsWithSignedUrls,
          }
        : null,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || 'Erro ao carregar KYC.' });
  }
});

sellerRouter.post('/kyc/submit', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, message: 'Banco indisponível.' });
    const seller = await resolveSeller(req);
    if (!seller) {
      return res.status(404).json({
        success: false,
        error: { code: 'SELLER_PROFILE_NOT_FOUND', message: 'Perfil de vendedor não encontrado para este usuário.' },
      });
    }

    const {
      accountType,
      legalName,
      documentType,
      documentNumber,
      documentFrontUrl,
      documentBackUrl,
      selfieUrl,
      proofOfAddressUrl,
      businessLicenseUrl,
      identityMetadata,
      addressMetadata,
      companyMetadata,
      selfieMetadata,
    } = req.body;

    const missing: string[] = [];
    if (!documentFrontUrl && !identityMetadata?.url) missing.push('Identidade (BI/Passaporte)');
    if (!proofOfAddressUrl && !addressMetadata?.url) missing.push('Comprovante de Residência');
    if (!selfieUrl && !selfieMetadata?.url) missing.push('Selfie de Validação');
    if (accountType === 'empresa' && !businessLicenseUrl && !companyMetadata?.url) {
      missing.push('Registro Empresarial / NIF');
    }

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_MANDATORY_DOCUMENTS',
          message: `Documentos obrigatórios ausentes: ${missing.join(', ')}`,
        },
      });
    }

    await db.transaction(async (tx: any) => {
      const existingKyc = await tx.select().from(sellerKyc).where(eq(sellerKyc.sellerId, seller.id)).limit(1);
      const kycId = existingKyc[0]?.id || `kyc_${Date.now()}`;

      const frontUrl = documentFrontUrl || identityMetadata?.url;
      const backUrl = documentBackUrl || null;
      const selfUrl = selfieUrl || selfieMetadata?.url;
      const addressUrl = proofOfAddressUrl || addressMetadata?.url;

      if (existingKyc.length > 0) {
        await tx.update(sellerKyc)
          .set({
            legalName: legalName || existingKyc[0].legalName,
            documentType: documentType || existingKyc[0].documentType,
            documentNumber: documentNumber || existingKyc[0].documentNumber,
            documentFrontUrl: frontUrl || existingKyc[0].documentFrontUrl,
            documentBackUrl: backUrl || existingKyc[0].documentBackUrl,
            selfieUrl: selfUrl || existingKyc[0].selfieUrl,
            proofOfAddressUrl: addressUrl || existingKyc[0].proofOfAddressUrl,
            status: 'pending',
            submittedAt: new Date(),
          })
          .where(eq(sellerKyc.id, kycId));
      } else {
        await tx.insert(sellerKyc).values({
          id: kycId,
          sellerId: seller.id,
          legalName: legalName || seller.companyName,
          documentType: documentType || 'id_card',
          documentNumber: documentNumber || seller.taxId,
          documentFrontUrl: frontUrl || null,
          documentBackUrl: backUrl || null,
          selfieUrl: selfUrl || null,
          proofOfAddressUrl: addressUrl || null,
          status: 'pending',
        });
      }

      // Save/update sellerDocuments entries per type inside transaction
      const docEntries = [
        { type: 'identity_document', url: frontUrl, meta: identityMetadata },
        { type: 'proof_of_address', url: addressUrl, meta: addressMetadata },
        { type: 'selfie', url: selfUrl, meta: selfieMetadata },
        { type: 'business_license', url: businessLicenseUrl || companyMetadata?.url, meta: companyMetadata },
      ].filter((d) => Boolean(d.url));

      for (const d of docEntries) {
        const existingDoc = await tx.select()
          .from(sellerDocuments)
          .where(and(eq(sellerDocuments.sellerId, seller.id), eq(sellerDocuments.documentType, d.type)))
          .limit(1);

        if (existingDoc.length > 0) {
          await tx.update(sellerDocuments)
            .set({
              fileUrl: d.url!,
              objectKey: d.meta?.objectKey || existingDoc[0].objectKey || null,
              mimeType: d.meta?.mimeType || existingDoc[0].mimeType || null,
              fileSize: d.meta?.size ? Number(d.meta.size) : existingDoc[0].fileSize,
              status: 'pending',
              createdAt: new Date(),
            })
            .where(eq(sellerDocuments.id, existingDoc[0].id));
        } else {
          await tx.insert(sellerDocuments).values({
            id: `doc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            sellerId: seller.id,
            documentType: d.type,
            fileUrl: d.url!,
            objectKey: d.meta?.objectKey || null,
            mimeType: d.meta?.mimeType || null,
            fileSize: d.meta?.size ? Number(d.meta.size) : null,
            status: 'pending',
            createdAt: new Date(),
          });
        }
      }

      // Update user kycStatus to pending
      await tx.update(users).set({ kycStatus: 'pending', updatedAt: new Date() }).where(eq(users.id, seller.userId));
    });

    return res.json({
      success: true,
      message: 'Documentos submetidos com sucesso para verificação KYC!',
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || 'Erro ao submeter KYC.' });
  }
});

// ==========================================
// 7. QUESTIONS & REVIEWS
// ==========================================

sellerRouter.get('/questions', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const seller = await resolveSeller(req);
    if (db && seller) {
      const qList = await db
        .select({
          id: productQuestions.id,
          productId: productQuestions.productId,
          productTitle: products.title,
          productImage: products.image,
          question: productQuestions.question,
          status: productQuestions.status,
          createdAt: productQuestions.createdAt,
          answer: productAnswers.answer,
          answeredAt: productAnswers.createdAt,
        })
        .from(productQuestions)
        .leftJoin(products, eq(productQuestions.productId, products.id))
        .leftJoin(productAnswers, eq(productQuestions.id, productAnswers.questionId))
        .where(eq(products.sellerId, seller.id))
        .orderBy(desc(productQuestions.createdAt));
      return res.json({ success: true, data: qList });
    }
    return res.json({ success: true, data: [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

sellerRouter.post('/questions/:id/answer', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { answerText } = req.body;
    if (!answerText) return res.status(400).json({ success: false, message: 'Texto da resposta é obrigatório.' });

    if (db) {
      await db.insert(productAnswers).values({
        id: `ans_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        questionId: id,
        userId: req.user?.id || 'system',
        answer: answerText,
        isSeller: true,
        createdAt: new Date(),
      });
      await db.update(productQuestions).set({ status: 'answered' }).where(eq(productQuestions.id, id));
    }
    return res.json({ success: true, message: 'Resposta enviada com sucesso ao cliente!' });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

sellerRouter.get('/reviews', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const seller = await resolveSeller(req);
    if (db && seller) {
      const rList = await db
        .select({
          id: reviews.id,
          productId: reviews.productId,
          productTitle: products.title,
          buyerName: reviews.authorName,
          rating: reviews.rating,
          comment: reviews.comment,
          status: reviews.status,
          createdAt: reviews.createdAt,
        })
        .from(reviews)
        .leftJoin(products, eq(reviews.productId, products.id))
        .where(eq(products.sellerId, seller.id))
        .orderBy(desc(reviews.createdAt));
      return res.json({ success: true, data: rList });
    }
    return res.json({ success: true, data: [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

sellerRouter.post('/reviews/:id/reply', async (req: AuthRequest, res: Response) => {
  try {
    const { reply } = req.body;
    if (!reply) return res.status(400).json({ success: false, message: 'Resposta obrigatória.' });
    return res.json({ success: true, message: 'Resposta publicada na avaliação com sucesso!' });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

// ==========================================
// 8. MARKETING, COUPONS, CAMPAIGNS & ADS
// ==========================================

sellerRouter.get('/coupons', async (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: currentCoupons,
  });
});

sellerRouter.post('/coupons', async (req: Request, res: Response) => {
  const { code, discountType, discountValue, minPurchase, usageLimit, expiresAt } = req.body;
  const newCoupon: SellerCouponItem = {
    id: `coup_${Date.now()}`,
    code: (code || 'DESCONTO').toUpperCase(),
    discountType: discountType || 'percentage',
    discountValue: Number(discountValue) || 10,
    minPurchase: Number(minPurchase) || 0,
    usageLimit: Number(usageLimit) || 100,
    usageCount: 0,
    expiresAt: expiresAt || '31/12/2026',
    status: 'active',
  };

  currentCoupons.unshift(newCoupon);
  return res.json({
    success: true,
    message: `Cupom de desconto "${newCoupon.code}" criado com sucesso!`,
    data: newCoupon,
  });
});

sellerRouter.delete('/coupons/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  currentCoupons = currentCoupons.filter(c => c.id !== id);
  return res.json({
    success: true,
    message: 'Cupom removido.',
  });
});

sellerRouter.get('/campaigns', async (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: currentCampaigns,
  });
});

sellerRouter.post('/campaigns/:id/join', async (req: Request, res: Response) => {
  const { id } = req.params;
  const camp = currentCampaigns.find(c => c.id === id);
  if (!camp) {
    return res.status(404).json({ success: false, message: 'Campanha não encontrada.' });
  }

  camp.isJoined = true;
  camp.joinedProductsCount = currentSellerProducts.length;

  return res.json({
    success: true,
    message: `Sua loja aderiu com sucesso à campanha "${camp.title}"!`,
    data: camp,
  });
});

sellerRouter.get('/ads', async (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: currentAds,
  });
});

sellerRouter.post('/ads', async (req: Request, res: Response) => {
  const { productTitle, dailyBudget } = req.body;
  const newAd: SellerAdItem = {
    id: `ad_${Date.now()}`,
    productTitle: productTitle || currentSellerProducts[0]?.title || 'Anúncio Patrocinado',
    productImage: currentSellerProducts[0]?.image || 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&q=80&w=200',
    dailyBudget: Number(dailyBudget) || 5000,
    clicks: 0,
    impressions: 0,
    spend: 0,
    revenue: 0,
    roas: 0,
    status: 'active',
  };

  currentAds.unshift(newAd);
  return res.json({
    success: true,
    message: 'Campanha de anúncio patrocinado ativada!',
    data: newAd,
  });
});

// ==========================================
// 9. SETTINGS
// ==========================================

sellerRouter.get('/settings', async (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: currentSettings,
  });
});

sellerRouter.patch('/settings', async (req: Request, res: Response) => {
  currentSettings = { ...currentSettings, ...req.body };
  return res.json({
    success: true,
    message: 'Configurações operacionais salvas com sucesso!',
    data: currentSettings,
  });
});
