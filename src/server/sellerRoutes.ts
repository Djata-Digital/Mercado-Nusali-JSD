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
  storeShippingPolicies,
  countries,
  shippingRates,
  shippingZones,
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
import { eq, desc, and, or, isNull, inArray } from 'drizzle-orm';
import { requireAuth, AuthRequest } from './modules/auth/authMiddleware.js';
import { syncOrderFulfillmentStatus } from './modules/orders/orderService.js';
import { ShipmentService } from './modules/logistics/shipmentService.js';
import { storageService } from './infra/storage.js';
import { requestSellerPayout, PayoutValidationError } from './modules/wallet/payoutService.js';
import { computeLiveStockAndSales } from './modules/catalog/catalogService.js';
import {
  getSellerOrderRows,
  mapOperationalStatus,
  deriveOperationalLabel,
  sellerAvailableAction,
  computeSellerOverviewMetrics,
  computeSellerWalletSnapshot,
  computeSellerCustomers,
} from './modules/seller/sellerFinancialsService.js';

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

// Correção crítica (Visão Geral zerada): currentSellerOrders/currentWallet
// (variáveis em memória, nunca reatribuídas em nenhum lugar do arquivo)
// foram REMOVIDAS como fonte de /seller/overview e /seller/analytics — os
// dois agora consultam o banco real via sellerFinancialsService.ts, a MESMA
// fonte já usada por /seller/orders e /seller/wallet.

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

// Correção crítica (Visão Geral do vendedor zerada): consulta o banco real
// via sellerFinancialsService.ts — MESMA query/cálculo já usado por
// /seller/orders e /seller/wallet, nunca uma terceira implementação. SEMPRE
// escopado a UMA moeda explícita (?currency=BRL) — nunca mistura BRL/XOF/
// GMD na mesma soma. Sem ?currency, usa 'XOF' (mesmo default do schema de
// wallets) só para não quebrar chamadas antigas; o frontend agora sempre
// envia a moeda que está visualizando.
sellerRouter.get('/overview', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const seller = await resolveSeller(req);
    const currency = (typeof req.query.currency === 'string' && req.query.currency.trim()) ? req.query.currency.trim().toUpperCase() : 'XOF';

    if (!db || !seller) {
      return res.json({
        success: true,
        data: {
          profile: currentSellerProfile,
          store: currentStores[0],
          balances: { available: 0, retained: 0, future: 0, currency },
          metrics: {
            grossRevenue: 0, netRevenue: 0, totalOrders: 0, pendingOrders: 0, paidOrders: 0,
            preparingOrders: 0, shippedOrders: 0, deliveredOrders: 0, returnOrders: 0, disputes: 0,
            pendingQuestions: 0, totalProducts: 0, averageRating: 0,
          },
          recentOrders: [],
          topProducts: [],
          salesHistory: [],
          countryDistribution: [],
        },
      });
    }

    const result = await computeSellerOverviewMetrics(seller, currency, db);
    const pendingQuestions = currentQuestions.filter(q => q.status === 'pending').length;

    return res.json({
      success: true,
      data: {
        profile: currentSellerProfile,
        store: currentStores[0],
        balances: result.balances,
        metrics: {
          ...result.metrics,
          pendingQuestions,
          totalProducts: currentSellerProducts.length,
          averageRating: currentSellerProfile.reputationScore,
        },
        recentOrders: result.recentOrders,
        // Correção crítica (Fase 1 operacional): derivados dos mesmos
        // pedidos reais acima (ver sellerFinancialsService.ts) — nunca mais
        // vazio hardcoded.
        topProducts: result.topProducts,
        salesHistory: result.salesHistory,
        salesByCountry: result.salesByCountry,
        countryDistribution: result.salesByCountry,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message || 'Erro ao carregar visão geral.' });
  }
});

sellerRouter.get('/analytics', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const seller = await resolveSeller(req);
    const { period = '30days' } = req.query;
    const currency = (typeof req.query.currency === 'string' && req.query.currency.trim()) ? req.query.currency.trim().toUpperCase() : 'XOF';

    if (!db || !seller) {
      return res.json({
        success: true,
        data: {
          period, currency, grossRevenue: 0, netRevenue: 0, totalOrders: 0, paidOrders: 0, unitsSold: 0, averageTicket: 0,
          financialDataComplete: true, missingSellerNetAmountCount: 0,
          salesHistory: [], salesByCountry: [], topProducts: [],
          conversionRate: '0.0%', viewsCount: 0, salesByDay: [],
        },
      });
    }

    const sinceDate = new Date();
    if (period === 'today') sinceDate.setHours(0, 0, 0, 0);
    else if (period === '7days') sinceDate.setDate(sinceDate.getDate() - 7);
    else if (period === '90days') sinceDate.setDate(sinceDate.getDate() - 90);
    else sinceDate.setDate(sinceDate.getDate() - 30); // '30days' (default)

    const result = await computeSellerOverviewMetrics(seller, currency, db, sinceDate);
    // Correção crítica (Fase 1 Operacional — "Pedidos Pagos" mostrando 11 em
    // vez de 5): totalOrders SEMPRE incluiu pending_payment (é a contagem de
    // TODOS os pedidos distintos no período, pagos ou não — métrica
    // legítima, mas nunca deveria ter sido usada para rotular um card
    // "Pedidos Pagos"). paidOrders é o campo correto para isso — já
    // calculado por computeSellerOverviewMetrics, só nunca tinha sido
    // exposto por este endpoint.
    const { grossRevenue, netRevenue, totalOrders, paidOrders, unitsSold, averageTicket, financialDataComplete, missingSellerNetAmountCount } = result.metrics;

    return res.json({
      success: true,
      data: {
        period,
        currency,
        grossRevenue,
        netRevenue,
        totalOrders,
        paidOrders,
        unitsSold,
        averageTicket,
        // Mesma correção do Overview: netRevenue nunca esconde
        // sellerNetAmount ausente dentro de um "R$0" silencioso.
        financialDataComplete,
        missingSellerNetAmountCount,
        // Correção crítica (Fase 1 operacional — Desempenho de Vendas
        // zerado): derivados dos mesmos pedidos reais do período/moeda
        // pedidos — nunca inventados, nunca uma segunda fonte.
        salesHistory: result.salesHistory,
        salesByCountry: result.salesByCountry,
        topProducts: result.topProducts,
        // conversionRate/viewsCount/salesByDay: não é dado financeiro — é
        // rastreamento de visualizações, que este projeto nunca implementou.
        // Honestamente vazio/zero (mesmo espírito de "nunca mock
        // financeiro": nunca fingir que existe uma infraestrutura de
        // analytics de visitas que não existe).
        conversionRate: '0.0%',
        viewsCount: 0,
        salesByDay: result.salesHistory,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message || 'Erro ao carregar analytics.' });
  }
});

// Correção crítica (Fase 1 operacional — "Meus Clientes" vazio): deriva
// clientes exclusivamente de pedidos reais do vendedor (ver
// computeSellerCustomers em sellerFinancialsService.ts). Nunca retorna
// e-mail/telefone/CPF/endereço — só o necessário para o CRM geral.
sellerRouter.get('/customers', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const seller = await resolveSeller(req);
    if (!db || !seller) return res.json({ success: true, data: [] });

    const customers = await computeSellerCustomers(seller.id, db);
    return res.json({ success: true, data: customers });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message || 'Erro ao carregar clientes.' });
  }
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
      // NULL = nenhuma comissão específica negociada ainda; a comissão real
      // vem de category.commissionRate ou platformSettings.defaultSellerCommissionPercent
      // (ver orderService.ts). NUNCA gravar aqui um percentual técnico "de fábrica".
      commissionRate: null,
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

    const kycRows = await db.select().from(sellerKyc).where(eq(sellerKyc.sellerId, seller.id)).limit(1);
    const kyc = kycRows[0];
    const kycStatus = kyc?.status || (seller.status === 'active' ? 'approved' : seller.status) || user?.kycStatus || 'pending';

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[SELLER KYC] status recebido: ${kycStatus} source: GET /seller/profile`);
    }

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
        kycStatus,
        kycLevel: kycStatus === 'verified' || kycStatus === 'approved' ? 'Nível 3 - Vendedor Global' : 'Nível 1 - Pendente de Verificação',
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

sellerRouter.get('/shipping-policy', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, message: 'Banco indisponível.' });
    const seller = await resolveSeller(req);
    if (!seller) return res.status(404).json({ success: false, message: 'Vendedor não encontrado.' });

    // Requirement 4: Explicitly require storeId query parameter (NO storeRows[0] fallback)
    const targetStoreId = req.query.storeId as string;
    if (!targetStoreId || !targetStoreId.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'STORE_ID_REQUIRED', message: 'O parâmetro storeId é obrigatório para obter a política de frete.' },
      });
    }

    // Verify store ownership
    const validStore = await db
      .select()
      .from(storesTable)
      .where(and(eq(storesTable.id, targetStoreId), eq(storesTable.sellerId, seller.id)))
      .limit(1);

    if (validStore.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'STORE_REQUIRED_FOR_SHIPPING_POLICY', message: 'A loja informada não pertence ao vendedor autenticado.' },
      });
    }

    const policyRows = await db
      .select()
      .from(storeShippingPolicies)
      .where(and(eq(storeShippingPolicies.storeId, targetStoreId), eq(storeShippingPolicies.sellerId, seller.id)))
      .limit(1);

    if (policyRows.length === 0) {
      return res.json({
        success: true,
        data: {
          storeId: targetStoreId,
          mode: 'CUSTOMER_PAYS',
          sellerSubsidyMaxAmount: 0,
          sellerSubsidyPercent: 0,
          subsidyType: 'MAX_AMOUNT',
        },
      });
    }

    const pol = policyRows[0];
    const maxAmt = pol.sellerSubsidyMaxAmount ? Number(pol.sellerSubsidyMaxAmount) : 0;
    const pct = pol.sellerSubsidyPercent ? Number(pol.sellerSubsidyPercent) : 0;

    return res.json({
      success: true,
      data: {
        storeId: pol.storeId,
        mode: pol.mode || 'CUSTOMER_PAYS',
        sellerSubsidyMaxAmount: maxAmt,
        sellerSubsidyPercent: pct,
        subsidyType: maxAmt > 0 ? 'MAX_AMOUNT' : (pct > 0 ? 'PERCENT' : 'MAX_AMOUNT'),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || 'Erro ao obter política de frete.' });
  }
});

sellerRouter.post('/shipping-policy', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, message: 'Banco indisponível.' });
    const seller = await resolveSeller(req);
    if (!seller) return res.status(404).json({ success: false, message: 'Vendedor não encontrado.' });

    // Requirement 5: Explicitly require storeId in body (NO storeRows[0] fallback)
    const { storeId: bodyStoreId, mode, sellerSubsidyMaxAmount, sellerSubsidyPercent, subsidyType } = req.body;
    const targetStoreId = bodyStoreId;

    if (!targetStoreId || !String(targetStoreId).trim()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'STORE_ID_REQUIRED',
          message: 'O campo storeId é obrigatório para atualizar a política de frete.',
        },
      });
    }

    // Verify store ownership
    const validStore = await db
      .select()
      .from(storesTable)
      .where(and(eq(storesTable.id, targetStoreId), eq(storesTable.sellerId, seller.id)))
      .limit(1);

    if (validStore.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'STORE_REQUIRED_FOR_SHIPPING_POLICY',
          message: 'A loja selecionada não pertence ao vendedor autenticado.',
        },
      });
    }

    const finalMode = mode || 'CUSTOMER_PAYS';

    // Requirement 12: Protect MARKETPLACE_FREE_SHIPPING from being selected by sellers
    const ALLOWED_SELLER_MODES = ['CUSTOMER_PAYS', 'SELLER_FREE_SHIPPING', 'SELLER_SUBSIDIZED', 'PICKUP'];
    if (!ALLOWED_SELLER_MODES.includes(finalMode)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_SELLER_SHIPPING_MODE',
          message: 'Modo de frete não permitido para vendedor. Frete Grátis Marketplace é reservado para campanhas administrativas.',
        },
      });
    }

    let finalMaxAmt: number | null = null;
    let finalPct: number | null = null;

    if (finalMode === 'SELLER_SUBSIDIZED') {
      if (subsidyType === 'PERCENT') {
        finalPct = Number(sellerSubsidyPercent) || 0;
        finalMaxAmt = null;
      } else {
        finalMaxAmt = Number(sellerSubsidyMaxAmount) || 0;
        finalPct = null;
      }
    }

    const storeId = targetStoreId;

    const existingPolicy = await db.select().from(storeShippingPolicies).where(and(eq(storeShippingPolicies.storeId, storeId), eq(storeShippingPolicies.sellerId, seller.id))).limit(1);

    if (existingPolicy.length > 0) {
      await db.update(storeShippingPolicies)
        .set({
          mode: finalMode,
          sellerSubsidyMaxAmount: finalMaxAmt !== null ? String(finalMaxAmt) : null,
          sellerSubsidyPercent: finalPct !== null ? String(finalPct) : null,
          updatedAt: new Date(),
        })
        .where(eq(storeShippingPolicies.id, existingPolicy[0].id));
    } else {
      await db.insert(storeShippingPolicies).values({
        id: `pol_${Date.now()}`,
        storeId,
        sellerId: seller.id,
        mode: finalMode,
        sellerSubsidyMaxAmount: finalMaxAmt !== null ? String(finalMaxAmt) : null,
        sellerSubsidyPercent: finalPct !== null ? String(finalPct) : null,
        isActive: true,
      });
    }

    return res.json({
      success: true,
      message: 'Política de frete da loja salva com sucesso!',
      data: {
        mode: finalMode,
        sellerSubsidyMaxAmount: finalMaxAmt || 0,
        sellerSubsidyPercent: finalPct || 0,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || 'Erro ao salvar política de frete.' });
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

    const formattedStores = storeRows.map((s) => {
      const addr = s.addressJson && typeof s.addressJson === 'object' ? (s.addressJson as any) : {};
      return {
        ...s,
        logo: s.logoUrl || '',
        logoUrl: s.logoUrl || '',
        banner: s.bannerUrl || '',
        bannerUrl: s.bannerUrl || '',
        category: s.categoryId ? (categoriesMap.get(s.categoryId) || '') : '',
        country: s.countryCode || 'GW',
        countryCode: s.countryCode || 'GW',
        phone: addr.phone || '',
        city: addr.city || '',
        address: addr.address || '',
        email: addr.email || '',
        addressJson: addr,
        businessHours: s.businessHoursJson || null,
        businessHoursJson: s.businessHoursJson || null,
      };
    });

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

    const {
      name,
      slug,
      description,
      countryCode: rawCountryCode,
      country: rawCountry,
      logoUrl: rawLogoUrl,
      logo: rawLogo,
      bannerUrl: rawBannerUrl,
      banner: rawBanner,
      categoryId,
      addressJson: rawAddressJson,
      phone: rawPhone,
      city: rawCity,
      address: rawAddress,
      email: rawEmail,
      businessHoursJson: rawBusinessHoursJson,
      businessHours: rawBusinessHours,
    } = req.body;

    const logoUrl = rawLogoUrl || rawLogo || null;
    const bannerUrl = rawBannerUrl || rawBanner || null;
    const countryCode = rawCountryCode || rawCountry || seller.countryCode || 'GW';

    let addressJson = rawAddressJson;
    if (!addressJson && (rawPhone || rawCity || rawAddress || rawEmail)) {
      addressJson = {
        phone: rawPhone || '',
        city: rawCity || '',
        address: rawAddress || '',
        email: rawEmail || '',
      };
    }

    const businessHoursJson = rawBusinessHoursJson || rawBusinessHours || null;

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
      countryCode,
      description: description || '',
      logoUrl,
      bannerUrl,
      categoryId: categoryId.trim(),
      addressJson,
      businessHoursJson,
      status: 'active',
    };

    await db.insert(storesTable).values(newStore);

    const addr = addressJson && typeof addressJson === 'object' ? (addressJson as any) : {};
    const formattedStoreData = {
      ...newStore,
      logo: logoUrl || '',
      logoUrl: logoUrl || '',
      banner: bannerUrl || '',
      bannerUrl: bannerUrl || '',
      country: countryCode,
      countryCode: countryCode,
      phone: addr.phone || '',
      city: addr.city || '',
      address: addr.address || '',
      email: addr.email || '',
      addressJson,
      businessHours: businessHoursJson,
      businessHoursJson,
    };

    return res.json({
      success: true,
      message: `Loja "${newStore.name}" criada com sucesso!`,
      data: formattedStoreData,
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

    const {
      name,
      description,
      status,
      logoUrl: rawLogoUrl,
      logo: rawLogo,
      bannerUrl: rawBannerUrl,
      banner: rawBanner,
      countryCode: rawCountryCode,
      country: rawCountry,
      categoryId,
      addressJson: rawAddressJson,
      phone: rawPhone,
      city: rawCity,
      address: rawAddress,
      email: rawEmail,
      businessHoursJson: rawBusinessHoursJson,
      businessHours: rawBusinessHours,
    } = req.body;

    const logoUrl = rawLogoUrl !== undefined ? rawLogoUrl : (rawLogo !== undefined ? rawLogo : storeRows[0].logoUrl);
    const bannerUrl = rawBannerUrl !== undefined ? rawBannerUrl : (rawBanner !== undefined ? rawBanner : storeRows[0].bannerUrl);
    const countryCode = rawCountryCode || rawCountry || storeRows[0].countryCode;

    let addressJson = rawAddressJson !== undefined ? rawAddressJson : storeRows[0].addressJson;
    if (rawPhone !== undefined || rawCity !== undefined || rawAddress !== undefined || rawEmail !== undefined) {
      const prevAddr = (typeof storeRows[0].addressJson === 'object' && storeRows[0].addressJson) ? storeRows[0].addressJson : {};
      addressJson = {
        ...prevAddr,
        phone: rawPhone !== undefined ? rawPhone : (prevAddr as any).phone,
        city: rawCity !== undefined ? rawCity : (prevAddr as any).city,
        address: rawAddress !== undefined ? rawAddress : (prevAddr as any).address,
        email: rawEmail !== undefined ? rawEmail : (prevAddr as any).email,
      };
    }

    const businessHoursJson = rawBusinessHoursJson !== undefined ? rawBusinessHoursJson : (rawBusinessHours !== undefined ? rawBusinessHours : storeRows[0].businessHoursJson);

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
        countryCode,
        status: updatedStatus,
        logoUrl,
        bannerUrl,
        categoryId: categoryId ? String(categoryId).trim() : storeRows[0].categoryId,
        addressJson,
        businessHoursJson,
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

      // Correção crítica ("Meus Produtos" mostrando estoque físico em vez de
      // disponível): reaproveita a MESMA função já usada pelo catálogo
      // público (computeLiveStockAndSales) — nunca uma segunda fórmula de
      // estoque disponível. products.stock continua existindo como resumo
      // físico (onHand), mas a coluna principal "Estoque" passa a mostrar o
      // disponível real (onHand - reserved), igual ao que o catálogo já
      // mostra. Nunca altera quantityOnHand — cálculo em tempo de leitura.
      const liveStockMap = await computeLiveStockAndSales(dbProducts.map((p) => p.id), db);

      let list = dbProducts.map(p => {
        const live = liveStockMap.get(p.id);
        return {
          ...p,
          price: Number(p.price),
          originalPrice: p.originalPrice ? Number(p.originalPrice) : undefined,
          rating: p.rating !== null && p.rating !== undefined ? Number(p.rating) : 0,
          // "stock" continua presente por compatibilidade, mas agora É o
          // disponível (não mais o físico bruto) — mesma decisão já tomada
          // no catálogo público.
          stock: live?.availableStock ?? Number(p.stock),
          quantityOnHand: live?.onHand ?? Number(p.stock),
          quantityReserved: live?.reserved ?? 0,
          availableStock: live?.availableStock ?? Number(p.stock),
          weightKg: (p.shippingJson && typeof p.shippingJson === 'object') ? (p.shippingJson as any).weightKg : undefined,
          dimensionsCm: (p.shippingJson && typeof p.shippingJson === 'object' && (p.shippingJson as any).lengthCm)
            ? { length: (p.shippingJson as any).lengthCm, width: (p.shippingJson as any).widthCm, height: (p.shippingJson as any).heightCm }
            : undefined,
        };
      });
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
        const imageUrls = images.map(img => img.imageUrl).filter(Boolean);
        const coverImg = images.find(img => img.isCover)?.imageUrl || (imageUrls.length > 0 ? imageUrls[0] : p.image);

        return res.json({
          success: true,
          data: {
            ...p,
            image: coverImg,
            price: Number(p.price),
            originalPrice: p.originalPrice ? Number(p.originalPrice) : undefined,
            rating: p.rating !== null && p.rating !== undefined ? Number(p.rating) : 0,
            stock: Number(p.stock),
            weightKg: (p.shippingJson && typeof p.shippingJson === 'object') ? (p.shippingJson as any).weightKg : undefined,
            dimensionsCm: (p.shippingJson && typeof p.shippingJson === 'object' && (p.shippingJson as any).lengthCm)
              ? { length: (p.shippingJson as any).lengthCm, width: (p.shippingJson as any).widthCm, height: (p.shippingJson as any).heightCm }
              : undefined,
            variants,
            images: imageUrls.length > 0 ? imageUrls : (p.image ? [p.image] : []),
            galleryImages: imageUrls.length > 0 ? imageUrls : (p.image ? [p.image] : []),
            productImages: images,
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

    // Correção pré-piloto (preço promocional): mesma validação real da
    // criação — preço anterior só é aceito se maior que o preço EFETIVO
    // (o novo, se estiver sendo alterado nesta mesma chamada; senão o atual).
    if (updates.originalPrice !== undefined) {
      if (updates.originalPrice === null || String(updates.originalPrice).trim() === '') {
        fieldsToUpdate.originalPrice = null;
      } else {
        const effectivePrice = updates.price !== undefined ? Number(updates.price) : Number(check.product.price);
        const origPriceNum = Number(updates.originalPrice);
        if (isNaN(origPriceNum)) {
          return res.status(400).json({ success: false, error: { code: 'PRODUCT_ORIGINAL_PRICE_INVALID', message: 'Preço anterior inválido.' } });
        }
        if (origPriceNum <= effectivePrice) {
          return res.status(400).json({ success: false, error: { code: 'PRODUCT_ORIGINAL_PRICE_INVALID', message: 'O preço anterior deve ser maior que o preço atual — do contrário não é uma promoção real.' } });
        }
        fieldsToUpdate.originalPrice = String(origPriceNum);
      }
    }

    // Correção pré-piloto (condição opcional): NUNCA fallback para
    // 'used'/'usado' — null explícito é uma escolha válida ("não se aplica").
    // Aceita tanto os valores reais em inglês (products.condition) quanto os
    // sinônimos em português já usados pelo estado local do wizard/edição.
    if (updates.condition !== undefined) {
      if (updates.condition === null || String(updates.condition).trim() === '') {
        fieldsToUpdate.condition = null;
      } else {
        const conditionMap: Record<string, string> = { new: 'new', novo: 'new', used: 'used', usado: 'used', refurbished: 'refurbished', recondicionado: 'refurbished' };
        const mapped = conditionMap[String(updates.condition).toLowerCase()];
        if (!mapped) {
          return res.status(400).json({ success: false, error: { code: 'PRODUCT_CONDITION_INVALID', message: `Condição "${updates.condition}" inválida. Use new, used, refurbished ou deixe em branco.` } });
        }
        fieldsToUpdate.condition = mapped;
      }
    }

    // BLOCKER_LAUNCH: peso e dimensões são obrigatórios para o checkout
    // calcular frete (orderService/shippingCalculatorService leem
    // products.shippingJson). Editar não pode apagar um valor já válido nem
    // persistir peso/dimensão <= 0. Os dois blocos escrevem no MESMO objeto
    // acumulado — nunca um sobrescrevendo o outro.
    const existingShippingJson: Record<string, any> = (check.product.shippingJson && typeof check.product.shippingJson === 'object') ? { ...check.product.shippingJson } : {};
    let shippingJsonChanged = false;

    if (updates.weightKg !== undefined) {
      const weightNum = typeof updates.weightKg === 'number' ? updates.weightKg : parseFloat(String(updates.weightKg));
      if (isNaN(weightNum) || weightNum <= 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'PRODUCT_WEIGHT_REQUIRED', message: 'O peso do produto (em kg) deve ser maior que zero.' },
        });
      }
      existingShippingJson.weightKg = weightNum;
      shippingJsonChanged = true;
    }

    if (updates.dimensionsCm !== undefined) {
      const toDim = (v: unknown) => (typeof v === 'number' ? v : parseFloat(String(v ?? '')));
      const lengthNum = toDim(updates.dimensionsCm?.length);
      const widthNum = toDim(updates.dimensionsCm?.width);
      const heightNum = toDim(updates.dimensionsCm?.height);
      if ([lengthNum, widthNum, heightNum].some((n) => isNaN(n) || n <= 0)) {
        return res.status(400).json({
          success: false,
          error: { code: 'PRODUCT_DIMENSIONS_REQUIRED', message: 'As dimensões do produto (comprimento, largura e altura, em cm) devem ser maiores que zero.' },
        });
      }
      existingShippingJson.lengthCm = lengthNum;
      existingShippingJson.widthCm = widthNum;
      existingShippingJson.heightCm = heightNum;
      shippingJsonChanged = true;
    }

    if (shippingJsonChanged) {
      fieldsToUpdate.shippingJson = existingShippingJson;
    }

    // The store is the sole authority over the product's country/currency — same rule as
    // creation (ProductCreationService). This applies whether or not storeId is being changed:
    // resolve the effective target store (new one if provided, otherwise the product's current
    // one) and use it to validate/derive countryCode and currency. Never trust a client-supplied
    // countryCode/currency that diverges from the store.
    const rawStoreId = updates.storeId !== undefined ? String(updates.storeId).trim() : '';
    const storeChanged = rawStoreId !== '' && rawStoreId !== check.product.storeId;
    const effectiveStoreId = storeChanged ? rawStoreId : check.product.storeId;

    let resolvedStoreCountryCode: string | null = null;
    let resolvedStoreCurrency: string | null = null;

    if (effectiveStoreId) {
      const [store] = await db.select().from(storesTable).where(eq(storesTable.id, effectiveStoreId)).limit(1);
      if (!store) {
        return res.status(400).json({ success: false, error: { code: 'PRODUCT_STORE_NOT_FOUND', message: 'Loja informada não encontrada.' } });
      }
      if (store.sellerId !== check.seller.id) {
        return res.status(403).json({ success: false, error: { code: 'PRODUCT_STORE_FORBIDDEN', message: 'Esta loja não pertence ao vendedor autenticado.' } });
      }
      if (store.status !== 'active') {
        return res.status(400).json({ success: false, error: { code: 'PRODUCT_STORE_INACTIVE', message: 'A loja precisa estar ativa.' } });
      }
      if (!store.countryCode || !String(store.countryCode).trim()) {
        return res.status(400).json({ success: false, error: { code: 'PRODUCT_STORE_COUNTRY_MISSING', message: 'A loja não possui país operacional definido.' } });
      }
      const storeCountryCode = String(store.countryCode).trim().toUpperCase();
      const [countryRow] = await db.select().from(countries).where(eq(countries.code, storeCountryCode)).limit(1);
      if (!countryRow) {
        return res.status(400).json({ success: false, error: { code: 'PRODUCT_STORE_COUNTRY_INVALID', message: `O país da loja ("${storeCountryCode}") não está cadastrado como país operacional do Mercado Nusali.` } });
      }
      resolvedStoreCountryCode = storeCountryCode;
      resolvedStoreCurrency = countryRow.currency;

      if (storeChanged) {
        fieldsToUpdate.storeId = store.id;
      }
    }

    // Reject any explicit countryCode/currency in the payload that diverges from the resolved
    // store — never silently override, and never let the client set an inconsistent value.
    if (updates.countryCode !== undefined && resolvedStoreCountryCode && String(updates.countryCode).trim().toUpperCase() !== resolvedStoreCountryCode) {
      return res.status(400).json({
        success: false,
        error: { code: 'PRODUCT_COUNTRY_MISMATCH', message: `O país informado ("${updates.countryCode}") diverge do país da loja ("${resolvedStoreCountryCode}"). A loja é a autoridade sobre o país de origem do produto.` },
      });
    }
    if (updates.currency !== undefined && resolvedStoreCurrency && String(updates.currency).trim().toUpperCase() !== resolvedStoreCurrency) {
      return res.status(400).json({
        success: false,
        error: { code: 'PRODUCT_CURRENCY_MISMATCH', message: `A moeda informada ("${updates.currency}") diverge da moeda oficial do país da loja ("${resolvedStoreCurrency}").` },
      });
    }

    // If the store changed, the product's country/currency are always re-derived from it —
    // never taken from client input.
    if (storeChanged && resolvedStoreCountryCode && resolvedStoreCurrency) {
      fieldsToUpdate.countryCode = resolvedStoreCountryCode;
      fieldsToUpdate.currency = resolvedStoreCurrency;
    }

    // Melhoria pré-piloto (elegibilidade por país): permite ao vendedor
    // alterar depois se um produto é nacional ou internacional, e para quais
    // países. Mesma validação real usada na criação — nenhum país inventado.
    if (updates.publishingScope !== undefined) {
      const scope = updates.publishingScope === 'international' ? 'international' : 'national';
      fieldsToUpdate.publishingScope = scope;
      if (scope === 'national') {
        fieldsToUpdate.targetCountriesJson = null;
      } else if (updates.targetCountries !== undefined) {
        const requested = Array.isArray(updates.targetCountries)
          ? Array.from(new Set(updates.targetCountries.map((c: any) => String(c).trim().toUpperCase()).filter(Boolean)))
          : [];
        if (requested.length === 0) {
          return res.status(400).json({ success: false, error: { code: 'PRODUCT_TARGET_COUNTRIES_REQUIRED', message: 'Venda internacional exige ao menos um país de destino explicitamente selecionado.' } });
        }
        const realCountries = await db.select().from(countries).where(inArray(countries.code, requested as string[]));
        const realActiveCodes = new Set(realCountries.filter((c: any) => c.isActive).map((c: any) => c.code));
        const invalid = requested.filter((code) => !realActiveCodes.has(code));
        if (invalid.length > 0) {
          return res.status(400).json({ success: false, error: { code: 'PRODUCT_TARGET_COUNTRY_INVALID', message: `País(es) de destino inválido(s) ou não operacional(is): ${invalid.join(', ')}.` } });
        }
        fieldsToUpdate.targetCountriesJson = requested;
      }
    } else if (updates.targetCountries !== undefined) {
      // Scope não mudou nesta chamada, mas a lista de destinos sim — só faz
      // sentido se o produto já for internacional.
      const currentScope = check.product.publishingScope === 'international' ? 'international' : 'national';
      if (currentScope === 'international') {
        const requested = Array.isArray(updates.targetCountries)
          ? Array.from(new Set(updates.targetCountries.map((c: any) => String(c).trim().toUpperCase()).filter(Boolean)))
          : [];
        if (requested.length === 0) {
          return res.status(400).json({ success: false, error: { code: 'PRODUCT_TARGET_COUNTRIES_REQUIRED', message: 'Venda internacional exige ao menos um país de destino explicitamente selecionado.' } });
        }
        const realCountries = await db.select().from(countries).where(inArray(countries.code, requested as string[]));
        const realActiveCodes = new Set(realCountries.filter((c: any) => c.isActive).map((c: any) => c.code));
        const invalid = requested.filter((code) => !realActiveCodes.has(code));
        if (invalid.length > 0) {
          return res.status(400).json({ success: false, error: { code: 'PRODUCT_TARGET_COUNTRY_INVALID', message: `País(es) de destino inválido(s) ou não operacional(is): ${invalid.join(', ')}.` } });
        }
        fieldsToUpdate.targetCountriesJson = requested;
      }
    }

    if (Object.keys(fieldsToUpdate).length > 1) {
      await db.update(products).set(fieldsToUpdate).where(eq(products.id, id));
    }

    if (updates.stock !== undefined) {
      await InventoryService.updateSellerStock(id, Number(updates.stock), check.seller.id, null, req.user.id);
    }

    await delCache('products_list_all');
    // Sem isso, GET /products/:id (CatalogService.getProductById) continuava
    // servindo o cache antigo por até 120s depois do vendedor mudar o
    // escopo/países de destino — a mudança "não respeitava imediatamente".
    await delCache(`product:${id}`);
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

// Correção crítica (Pedidos de Venda quebrando a página): contrato
// reescrito para nunca fabricar campos que o backend não tem
// (storeName/trackingCode/shippingCarrier/variant/timeline removidos — a UI
// já trata a ausência deles com segurança) e para incluir os campos
// financeiros REAIS do pedido (sellerNetAmount, marketplaceCommission,
// commissionRateSnapshot, shippingSellerSubsidy, escrowStatus, currency),
// única nomenclatura canônica (sellerNetAmount — nunca "netPayout"). Query e
// mapeamento de status agora vêm de sellerFinancialsService.ts, a MESMA
// fonte usada por /seller/overview — nunca uma segunda implementação.
sellerRouter.get('/orders', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const seller = await resolveSeller(req);
    if (!seller) return res.status(403).json({ success: false, message: 'Vendedor não encontrado.' });
    if (!db) return res.json({ success: true, data: [] });

    const { status } = req.query;

    // Correção crítica (Fase 1 Operacional — "Pedidos de Venda" mostrando
    // pending_payment): paymentStatus !== 'paid' NUNCA é uma venda do
    // vendedor (pode ser abandono de checkout, PIX nunca pago, etc.) —
    // continua existindo no banco para auditoria/checkout, mas é invisível
    // aqui. paymentStatus nunca é reatribuído para 'refunded'/'failed' neste
    // código depois de 'paid' (confirmado por auditoria: só orders.status
    // muda para cancelled/refunded/refund_requested) — logo este filtro
    // continua mostrando normalmente pedidos pagos que depois foram
    // cancelados/reembolsados, exatamente como já acontecia antes.
    const rows = (await getSellerOrderRows(seller.id, db)).filter((r) => r.paymentStatus === 'paid');

    const mapped = rows.map((item) => {
      const addr = (item.shippingAddressJson as any) || {};
      const { status: mappedStatus, rawStatus: currentStatus } = mapOperationalStatus(item.orderStatus, item.paymentStatus, item.itemStatus);

      return {
        id: item.orderItemId,
        orderItemId: item.orderItemId,
        orderId: item.orderId,
        orderNumber: item.orderNumber,
        sellerId: seller.id,
        productId: item.productId,
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
        unitPrice: item.unitPrice,
        totalAmount: item.totalAmount,
        currency: item.currency,
        fulfillmentMode: item.fulfillmentMode,
        status: mappedStatus,
        rawStatus: currentStatus,
        // Status financeiro/operacional distintos e explícitos (nunca
        // confundir um com o outro — ver documentação em
        // sellerFinancialsService.ts).
        paymentStatus: item.paymentStatus,
        escrowStatus: item.escrowStatus,
        sellerNetAmount: item.sellerNetAmount,
        marketplaceCommission: item.marketplaceCommission,
        commissionRateSnapshot: item.commissionRateSnapshot,
        // Composição de frete real do pedido (nunca inventada — já
        // persistida em orders desde a criação do pedido).
        shippingCost: item.shippingCost,
        shippingChargedToBuyer: item.shippingChargedToBuyer,
        shippingSellerSubsidy: item.shippingSellerSubsidy,
        shippingMarketplaceSubsidy: item.shippingMarketplaceSubsidy,
        // Correção crítica (Fase 1 operacional): shipment/etiqueta já criados
        // no pós-processamento do pagamento (ensureFulfillmentCreated) —
        // nunca mais null só porque o vendedor ainda não clicou em nada.
        shipmentId: item.shipmentId,
        shipmentStatus: item.shipmentStatus,
        trackingNumber: item.trackingNumber,
        labelAvailable: Boolean(item.shipmentId),
        // Rótulo ciente de SELLER_FULFILLMENT vs NUSALI_FULFILLMENT — nunca
        // inventa evento, só traduz order_items.status + shipments.status reais.
        operationalLabel: deriveOperationalLabel(item.fulfillmentMode, item.paymentStatus, currentStatus, item.shipmentStatus),
        // Única ação física que o vendedor pode executar — null para
        // NUSALI_FULFILLMENT (o seller nunca interfere no que está no HUB).
        availableAction: sellerAvailableAction(item.fulfillmentMode, item.paymentStatus, currentStatus),
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

    // Correção complementar (Fase 1 Operacional): a regra de que o vendedor
    // não pode declarar unilateralmente que a transportadora coletou/entregou
    // precisa existir NO BACKEND, não só esconder o botão no frontend — um
    // request HTTP manual precisa ser rejeitado do mesmo jeito. Para itens
    // SELLER_FULFILLMENT, a única transição que a rota do vendedor aceita é
    // até "ready_to_ship" (produto pronto para coleta) — reaproveita o
    // estado já existente em order_items.status, nenhuma state machine nova.
    // "shipped"/"enviado"/"picked_up"/"in_transit"/"delivered"/"entregue" (ou
    // qualquer outro valor) pertencem à autoridade operacional da
    // logística/transportadora/admin, que continuam avançando o pedido pelas
    // próprias rotas (adminRoutes.ts), nunca por aqui.
    const SELLER_ALLOWED_ORDER_ITEM_STATUSES = ['preparing', 'ready_to_ship'];
    if (!SELLER_ALLOWED_ORDER_ITEM_STATUSES.includes(status)) {
      return res.status(403).json({
        success: false,
        error: { code: 'SELLER_STATUS_TRANSITION_FORBIDDEN' },
        message: `VENDEDOR_NAO_AUTORIZADO: O vendedor só pode avançar o item até "ready_to_ship" (produto pronto para coleta). O status "${status}" pertence à logística/transportadora/admin.`,
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
    // newStatus só pode ser 'preparing' ou 'ready_to_ship' neste ponto — já
    // validado pelo allowlist acima. O caminho que despachava fisicamente
    // (executePhysicalDispatch em "shipped") foi removido desta rota: essa
    // ação pertence à logística/transportadora/admin (adminRoutes.ts).
    const newStatus = status;

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

// Correção crítica (wallet multi-moeda): a arquitetura já documentada no
// projeto é "uma wallet por (user_id, currency)" (ver
// wallets_user_currency_uq em src/db/schema.ts) — mas GET /seller/wallet
// buscava `WHERE user_id = ? LIMIT 1` SEM filtrar por moeda, e a soma de
// escrow "retained" somava TODOS os status='held' do vendedor juntos,
// misturando BRL + XOF + GMD como se fossem a mesma unidade. Nunca dava
// erro visível com um vendedor de moeda única (por isso não foi isso que
// causou o bug original relatado), mas quebraria silenciosamente assim que
// um vendedor tivesse vendas em mais de uma moeda — bem provável num
// marketplace CPLP/Brasil.
//
// computeSellerWalletSnapshot agora vive em sellerFinancialsService.ts
// (importado no topo do arquivo) — reaproveitada também por
// /seller/overview, nunca uma segunda implementação divergente.
sellerRouter.get('/wallet', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const seller = await resolveSeller(req);
    const requestedCurrency = typeof req.query.currency === 'string' && req.query.currency.trim() ? req.query.currency.trim().toUpperCase() : null;

    if (!db || !seller) {
      return res.json({
        success: true,
        data: requestedCurrency
          ? { currency: requestedCurrency, available: 0, retained: 0, totalEarned: 0, transactions: [] }
          : { wallets: [] },
      });
    }

    // Chamador pediu uma moeda explícita (fluxo normal do frontend: sempre
    // passa a moeda que o vendedor está visualizando) -> retorna só essa,
    // nunca uma escolhida arbitrariamente.
    if (requestedCurrency) {
      const snapshot = await computeSellerWalletSnapshot(db, seller, requestedCurrency);
      return res.json({ success: true, data: snapshot });
    }

    // Sem moeda explícita: retorna TODAS as moedas em que o vendedor tem
    // saldo/escrow, cada uma calculada SEPARADAMENTE — nunca uma soma única
    // misturando moedas diferentes. Inclui moedas com escrow held mas ainda
    // sem wallet própria (ex.: primeira venda numa moeda nova).
    const existingWalletCurrencies = await db.selectDistinct({ currency: wallets.currency }).from(wallets).where(eq(wallets.userId, seller.userId));
    const escrowCurrencies = await db.selectDistinct({ currency: escrowAccounts.currency }).from(escrowAccounts).where(and(eq(escrowAccounts.sellerId, seller.id), eq(escrowAccounts.status, 'held')));
    const currencySet = new Set<string>([
      ...existingWalletCurrencies.map((r: any) => r.currency),
      ...escrowCurrencies.map((r: any) => r.currency),
    ]);

    const walletsByCurrency = [];
    for (const cur of currencySet) {
      // Modo "todas as moedas": nunca cria wallet nova aqui, só reporta o
      // que já existe (evita criar linhas para toda moeda que já teve
      // qualquer escrow histórico só por causa desta consulta).
      const existing = await db.select().from(wallets).where(and(eq(wallets.userId, seller.userId), eq(wallets.currency, cur))).limit(1);
      if (existing.length > 0) {
        walletsByCurrency.push(await computeSellerWalletSnapshot(db, seller, cur));
      } else {
        const heldEscrow = await db.select({ amount: escrowAccounts.amount }).from(escrowAccounts).where(and(eq(escrowAccounts.sellerId, seller.id), eq(escrowAccounts.status, 'held'), eq(escrowAccounts.currency, cur)));
        const retainedSum = heldEscrow.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
        walletsByCurrency.push({ currency: cur, available: 0, retained: retainedSum, totalEarned: 0, transactions: [] });
      }
    }

    return res.json({ success: true, data: { wallets: walletsByCurrency } });
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
    const seller = await resolveSeller(req);
    if (!seller) {
      return res.status(404).json({
        success: false,
        error: { code: 'SELLER_NOT_FOUND', message: 'Perfil de vendedor não encontrado.' },
      });
    }

    const { amount, method, currency, bankAccountId, idempotencyKey } = req.body;
    const result = await requestSellerPayout({
      sellerId: seller.id,
      sellerUserId: seller.userId,
      amount: Number(amount),
      currency,
      method,
      bankAccountId,
      idempotencyKey,
    });

    return res.json({
      success: true,
      message: (result as any).alreadyRequested
        ? `Esta solicitação de saque já havia sido enviada (${result.amount.toLocaleString()} ${result.currency}) — nenhum novo saldo foi reservado.`
        : `Solicitação de saque de ${result.amount.toLocaleString()} ${result.currency} enviada com sucesso!`,
      data: result,
    });
  } catch (err: any) {
    if (err instanceof PayoutValidationError) {
      return res.status(err.status).json({ success: false, error: { code: err.code, message: err.message } });
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
