import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { getDb, checkDbConnection } from '../db/index.js';
import { validateCountryAgainstReference } from './modules/countries/isoCountryReference.js';
import {
  users,
  userProfiles,
  warehouses,
  regions,
  products,
  orders,
  orderItems,
  shipments,
  roles,
  permissions,
  userRoles,
  rolePermissions,
  auditLogs,
  countries,
  countryRepresentatives,
  platformSettings,
  disputes,
  sellers,
  storeShippingPolicies,
  sellerProfiles,
  sellerKyc,
  sellerDocuments,
  sellerBankAccounts,
  stores,
  storeMembers,
  categories,
  categoryAttributes,
  productAttributes,
  escrowAccounts,
  escrowTransactions,
  sellerPayouts,
  wallets,
  walletTransactions,
  inventoryTransfers,
  addresses,
  inventory,
  inventoryMovements,
  stockReservations,
  shippingRates,
  shippingZones,
} from '../db/schema.js';
import { getCache, setCache, delCache } from '../db/redis.js';
import { eq, desc, asc, sql, count, and, isNull, or, gte, lte, ne, inArray } from 'drizzle-orm';
import { AuthRequest, requireAuth } from './modules/auth/authMiddleware.js';
import {
  resolveAdministrativeScope,
  assertCountryAccess,
  scopeCountryFilter,
  requireFinanceApproval,
  requireDisputeResolvePermission,
  isShipmentWithinScope,
  assertShipmentScopeAccess,
  isShippingRateWithinScope,
  assertShippingRateScopeAccess,
  ScopeError,
} from './modules/auth/scopeService.js';
import { storageService } from './infra/storage.js';
import { wouldCreateCycle } from '../utils/categoryUtils.js';
import { InventoryService } from './modules/inventory/inventoryService.js';
import { syncOrderFulfillmentStatus } from './modules/orders/orderService.js';
import { PaymentService } from './modules/payments/paymentService.js';
import { ShipmentService } from './modules/logistics/shipmentService.js';
import { processPayoutStatusChange } from './modules/wallet/payoutService.js';
import { resolveDispute, RefundValidationError } from './modules/payments/refundService.js';
import { ShippingCalculatorService } from './modules/shipping/shippingCalculatorService.js';

export const adminRouter = Router();


const INTERNAL_STAFF_ROLES = new Set([
  'GLOBAL_ADMIN',
  'ADMIN',
  'COUNTRY_REPRESENTATIVE',
  'REGIONAL_SUPERVISOR',
  'KYC_ANALYST',
  'RISK_ANALYST',
  'SUPPORT',
  'SUPPORT_AGENT',
  'FINANCE',
  'LOGISTICS',
  'LOGISTICS_OPERATOR',
  'WAREHOUSE_MANAGER',
  'WAREHOUSE_OPERATOR',
  'HUB_MANAGER',
]);

const LOGISTICS_STAFF_ROLES = new Set([
  'GLOBAL_ADMIN',
  'ADMIN',
  'REGIONAL_SUPERVISOR',
  'LOGISTICS',
  'LOGISTICS_OPERATOR',
  'WAREHOUSE_MANAGER',
  'WAREHOUSE_OPERATOR',
  'HUB_MANAGER',
]);

function requireInternalStaff(req: AuthRequest, res: Response, next: NextFunction) {
  const role = (req.user?.role || '').toUpperCase();
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Acesso não autorizado.' },
    });
  }

  if (!INTERNAL_STAFF_ROLES.has(role)) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Área disponível apenas para usuários internos do Mercado Nusali.' },
    });
  }

  return next();
}

function requireLogisticsStaff(req: AuthRequest, res: Response, next: NextFunction) {
  const role = (req.user?.role || '').toUpperCase();
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Acesso não autorizado.' },
    });
  }

  if (!LOGISTICS_STAFF_ROLES.has(role)) {
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

// Painel Admin — Tarifas de Frete: escrita (criar/editar/ativar/desativar/
// excluir) é uma decisão COMERCIAL/financeira (define o custo real de
// entrega usado no checkout), não uma tarefa operacional de armazém — por
// isso um subconjunto mais estrito de LOGISTICS_STAFF_ROLES, sem
// WAREHOUSE_MANAGER/WAREHOUSE_OPERATOR/HUB_MANAGER/LOGISTICS/LOGISTICS_OPERATOR.
// Leitura (GET) continua usando requireLogisticsStaff (mais amplo), como já
// era antes desta fase — nenhum acesso de leitura existente é reduzido.
const SHIPPING_RATE_MANAGER_ROLES = new Set([
  'GLOBAL_ADMIN',
  'ADMIN',
  'COUNTRY_REPRESENTATIVE',
  'REGIONAL_SUPERVISOR',
]);

function requireShippingRateManager(req: AuthRequest, res: Response, next: NextFunction) {
  const role = (req.user?.role || '').toUpperCase();
  if (!req.user) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Acesso não autorizado.' } });
  }
  if (!SHIPPING_RATE_MANAGER_ROLES.has(role)) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN_SHIPPING_RATE_MANAGER_ONLY',
        message: 'Apenas Administração Global, Administração, Representante Nacional ou Supervisor Regional podem configurar tarifas de frete.',
      },
    });
  }
  return next();
}

const DEV_SIMULATOR_ROLES = new Set([
  'GLOBAL_ADMIN',
  'ADMIN',
]);

function requireAdminDevSimulator(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Acesso não autorizado.' },
    });
  }

  const role = (req.user.role || '').toUpperCase();
  if (!DEV_SIMULATOR_ROLES.has(role)) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN_DEV_SIMULATOR',
        message: 'Apenas Administradores do sistema podem simular pagamentos em ambiente de desenvolvimento.',
      },
    });
  }

  return next();
}

function requireGlobalAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if ((req.user?.role || '').toUpperCase() !== 'GLOBAL_ADMIN') {
    return res.status(403).json({
      success: false,
      error: {
        code: 'GLOBAL_ADMIN_REQUIRED',
        message: 'Somente o Administrador Geral pode criar, bloquear ou redefinir credenciais de usuários internos.',
      },
    });
  }
  return next();
}

// Todas as rotas administrativas exigem sessão autenticada e um perfil interno.
adminRouter.use(requireAuth, requireInternalStaff);

type CanonicalRole =
  | 'BUYER'
  | 'SELLER'
  | 'ADMIN'
  | 'COUNTRY_REPRESENTATIVE'
  | 'REGIONAL_SUPERVISOR';

const UI_ROLE_TO_DB: Record<string, CanonicalRole> = {
  buyer: 'BUYER',
  seller: 'SELLER',
  admin: 'ADMIN',
  country_rep: 'COUNTRY_REPRESENTATIVE',
  supervisor: 'REGIONAL_SUPERVISOR',
  BUYER: 'BUYER',
  SELLER: 'SELLER',
  ADMIN: 'ADMIN',
  COUNTRY_REPRESENTATIVE: 'COUNTRY_REPRESENTATIVE',
  REGIONAL_SUPERVISOR: 'REGIONAL_SUPERVISOR',
};

const DB_ROLE_TO_UI: Record<string, AdminUserData['role']> = {
  BUYER: 'buyer',
  SELLER: 'seller',
  ADMIN: 'admin',
  GLOBAL_ADMIN: 'admin',
  COUNTRY_REPRESENTATIVE: 'country_rep',
  REGIONAL_SUPERVISOR: 'supervisor',
};

const ROLE_LABELS: Record<string, string> = {
  BUYER: 'Comprador',
  SELLER: 'Vendedor',
  ADMIN: 'Administrador',
  GLOBAL_ADMIN: 'Administrador Geral',
  COUNTRY_REPRESENTATIVE: 'Representante Nacional',
  REGIONAL_SUPERVISOR: 'Supervisor Regional',
};

const PERMISSION_DEFINITIONS = {
  manage_products: { name: 'Gerenciar Produtos', module: 'catalog' },
  manage_orders: { name: 'Gerenciar Pedidos', module: 'orders' },
  manage_users: { name: 'Gerenciar Usuários', module: 'users' },
  manage_sellers: { name: 'Gerenciar Vendedores', module: 'sellers' },
  view_financials: { name: 'Visualizar Financeiro', module: 'finance' },
  manage_kyc: { name: 'Gerenciar KYC', module: 'kyc' },
  manage_disputes: { name: 'Gerenciar Disputas', module: 'disputes' },
} as const;

const ROLE_PERMISSION_CODES: Record<CanonicalRole, Array<keyof typeof PERMISSION_DEFINITIONS>> = {
  BUYER: [],
  SELLER: ['manage_products', 'manage_orders'],
  ADMIN: [
    'manage_products',
    'manage_orders',
    'manage_users',
    'manage_sellers',
    'view_financials',
    'manage_kyc',
    'manage_disputes',
  ],
  COUNTRY_REPRESENTATIVE: [
    'manage_orders',
    'manage_sellers',
    'view_financials',
    'manage_kyc',
    'manage_disputes',
  ],
  REGIONAL_SUPERVISOR: ['manage_orders', 'manage_sellers', 'manage_disputes'],
};

const ROLE_DESCRIPTIONS: Record<CanonicalRole, string> = {
  BUYER: 'Comprador da plataforma',
  SELLER: 'Vendedor da plataforma',
  ADMIN: 'Administrador operacional da plataforma',
  COUNTRY_REPRESENTATIVE: 'Representante nacional do Mercado Nusali',
  REGIONAL_SUPERVISOR: 'Supervisor regional de operações',
};

class AdminRequestError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
  }
}

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function normalizeCountry(value: unknown) {
  const code = String(value || 'GW').trim().toUpperCase();
  return code || 'GW';
}

function generateTemporaryPassword() {
  return `${randomBytes(8).toString('base64url')}A1!`;
}

function toUiRole(role: string): AdminUserData['role'] {
  return DB_ROLE_TO_UI[(role || '').toUpperCase()] || 'buyer';
}

function getDisplayStatus(user: any): AdminUserData['status'] {
  if (user.isActive === false) return 'blocked';
  if (['pending', 'under_review'].includes(String(user.kycStatus || '').toLowerCase())) return 'pending_kyc';
  return 'active';
}

function mapDbUserToAdmin(user: any): AdminUserData {
  const canonicalRole = String(user.role || 'BUYER').toUpperCase();
  return {
    id: user.id,
    name: user.fullName || '',
    email: user.email || '',
    phone: user.phone || '',
    country: user.countryCode || 'GW',
    role: toUiRole(canonicalRole),
    roleLabel: ROLE_LABELS[canonicalRole] || canonicalRole,
    status: getDisplayStatus(user),
    createdAt: user.createdAt instanceof Date
      ? user.createdAt.toLocaleDateString('pt-BR')
      : String(user.createdAt || ''),
    lastLogin: 'Não registrado',
    ordersCount: 0,
    purchasesCount: 0,
    riskScore: (user.riskScore || 'baixo') as AdminUserData['riskScore'],
    avatar: user.avatarUrl || undefined,
  };
}

async function ensureRoleAndPermissions(tx: any, roleName: CanonicalRole) {
  await tx.insert(roles).values({
    id: `role_${roleName.toLowerCase()}`,
    name: roleName,
    description: ROLE_DESCRIPTIONS[roleName],
  }).onConflictDoNothing();

  const roleRows = await tx.select().from(roles).where(eq(roles.name, roleName)).limit(1);
  const roleRow = roleRows[0];
  if (!roleRow) throw new Error(`Não foi possível localizar/criar o perfil ${roleName}.`);

  for (const code of ROLE_PERMISSION_CODES[roleName]) {
    const def = PERMISSION_DEFINITIONS[code];
    await tx.insert(permissions).values({
      id: `perm_${code}`,
      code,
      name: def.name,
      module: def.module,
      description: `Permissão predefinida do Mercado Nusali: ${def.name}`,
    }).onConflictDoNothing();

    const permissionRows = await tx.select().from(permissions).where(eq(permissions.code, code)).limit(1);
    const permission = permissionRows[0];
    if (permission) {
      await tx.insert(rolePermissions).values({
        roleId: roleRow.id,
        permissionId: permission.id,
      }).onConflictDoNothing();
    }
  }

  return roleRow;
}

async function createRealAccount(input: {
  name: string;
  email: string;
  phone?: string;
  country?: string;
  role: CanonicalRole;
  password?: string;
}) {
  const db = getDb();
  if (!db) throw new AdminRequestError(503, 'Banco de dados indisponível.');

  const email = normalizeEmail(input.email);
  const name = String(input.name || '').trim();
  const countryCode = normalizeCountry(input.country);
  const phone = String(input.phone || '').trim() || null;
  const password = String(input.password || '').trim() || generateTemporaryPassword();

  if (!name || !email) throw new AdminRequestError(400, 'Nome e e-mail são obrigatórios.');
  if (password.length < 8) throw new AdminRequestError(400, 'A senha inicial deve ter pelo menos 8 caracteres.');

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) throw new AdminRequestError(409, 'Já existe um usuário cadastrado com este e-mail.');

  const passwordHash = await bcrypt.hash(password, 12);
  const userId = `usr_${input.role.toLowerCase()}_${Date.now()}_${randomBytes(3).toString('hex')}`;

  const createdUser = await db.transaction(async (tx: any) => {
    const roleRow = await ensureRoleAndPermissions(tx, input.role);
    const rows = await tx.insert(users).values({
      id: userId,
      email,
      passwordHash,
      fullName: name,
      phone,
      role: input.role,
      countryCode,
      kycStatus: ['BUYER', 'SELLER'].includes(input.role) ? 'unverified' : 'verified',
      riskScore: 'baixo',
      isActive: true,
      isEmailVerified: !['BUYER', 'SELLER'].includes(input.role),
      isPhoneVerified: false,
      isTwoFactorEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    await tx.insert(userRoles).values({
      userId,
      roleId: roleRow.id,
      assignedAt: new Date(),
    }).onConflictDoNothing();

    return rows[0];
  });

  return { user: createdUser, temporaryPassword: password };
}

async function writeRealAudit(req: AuthRequest, action: string, resource: string, resourceId?: string, details?: any) {
  const db = getDb();
  if (!db) return;
  try {
    await db.insert(auditLogs).values({
      id: `audit_${Date.now()}_${randomBytes(3).toString('hex')}`,
      actorUserId: req.user?.id || null,
      action,
      resource,
      resourceId: resourceId || null,
      detailsJson: details || null,
      ipAddress: req.ip || req.socket.remoteAddress || null,
      userAgent: req.headers['user-agent'] || null,
      countryCode: req.user?.countryCode || null,
      createdAt: new Date(),
    });
  } catch {
    // Auditoria não deve transformar uma operação concluída em falha de API.
  }
}

function sendAdminError(res: Response, error: unknown) {
  if (error instanceof ScopeError) {
    return res.status(error.status).json({
      success: false,
      error: { code: error.code, message: error.message },
      message: error.message,
    });
  }
  if (error instanceof AdminRequestError) {
    return res.status(error.statusCode).json({
      success: false,
      error: { code: 'ADMIN_REQUEST_ERROR', message: error.message },
      message: error.message,
    });
  }
  const message = error instanceof Error ? error.message : 'Erro interno inesperado.';

  if (message.startsWith('TRANSICAO_INVALIDA:')) {
    const matchCurrent = message.match(/de "([^"]+)" para "([^"]+)"/);
    const matchAllowed = message.match(/Transições permitidas: ([^.]+)/);
    const currentStatus = matchCurrent ? matchCurrent[1] : undefined;
    const allowedTransitions = matchAllowed
      ? matchAllowed[1].split(',').map((s) => s.trim())
      : [];

    return res.status(409).json({
      success: false,
      error: {
        code: 'INVALID_SHIPMENT_TRANSITION',
        message,
        currentStatus,
        allowedTransitions,
      },
      message,
    });
  }

  if (
    message.startsWith('DELIVERY_FAILED_REASON_REQUIRED:') ||
    message.startsWith('RECEIVER_NAME_REQUIRED:') ||
    message.startsWith('RECIPIENT_NAME_REQUIRED:') ||
    message.startsWith('RECIPIENT_ADDRESS_INCOMPLETE:') ||
    message.startsWith('WAREHOUSE_ADDRESS_INCOMPLETE:') ||
    message.startsWith('SELLER_ORIGIN_ADDRESS_INCOMPLETE:') ||
    message.startsWith('INSUFFICIENT_STOCK:') ||
    message.startsWith('INVENTORY_NOT_INITIALIZED:')
  ) {
    const code = message.split(':')[0].trim();
    return res.status(400).json({
      success: false,
      error: { code, message },
      message,
    });
  }

  if (process.env.NODE_ENV !== 'production') {
    console.error('[ADMIN_INTERNAL_ERROR]', error);
  }

  const isDbError = typeof message === 'string' && (
    message.includes('Failed query') ||
    message.includes('select ') ||
    message.includes('SELECT ') ||
    message.includes('column ') ||
    message.includes('relation ') ||
    message.includes('PostgreSQL')
  );

  const userSafeMessage = isDbError ? 'Não foi possível concluir a operação. Tente novamente.' : message;

  return res.status(500).json({
    success: false,
    error: { code: 'ADMIN_INTERNAL_ERROR', message: userSafeMessage },
    message: userSafeMessage,
  });
}

// ==========================================
// UNIFIED REAL STATE ENGINE FOR ADMIN PANEL
// ==========================================

export interface AdminUserData {
  id: string;
  name: string;
  email: string;
  phone: string;
  country: string;
  role: 'admin' | 'supervisor' | 'country_rep' | 'seller' | 'buyer';
  roleLabel: string;
  status: 'active' | 'suspended' | 'blocked' | 'pending_kyc';
  createdAt: string;
  lastLogin: string;
  ordersCount: number;
  purchasesCount: number;
  riskScore: 'baixo' | 'medio' | 'alto' | 'critico';
  avatar?: string;
}

export interface AdminKycData {
  id: string;
  sellerName: string;
  companyName: string;
  country: string;
  accountType: 'Pessoa Física' | 'Pessoa Jurídica' | 'Empresa Exportadora';
  documentType: 'Bilhete de Identidade' | 'Passaporte CPLP' | 'Certidão Comercial' | 'NIF / CNPJ';
  documentNumber: string;
  submittedAt: string;
  status: 'nova' | 'under_review' | 'info_requested' | 'verified' | 'rejected' | 'fraud_suspect';
  docFrontUrl: string;
  docBackUrl?: string;
  selfieUrl: string;
  proofAddressUrl: string;
  businessLicenseUrl?: string;
  riskScore: 'baixo' | 'medio' | 'alto' | 'critico';
  notes?: string;
}

export interface AdminEscrowItem {
  id: string;
  orderId: string;
  buyerName: string;
  sellerName: string;
  amount: number;
  amountFormatted: string;
  currency: string;
  createdAt: string;
  releaseCondition: string;
  deliveryStatus: string;
  hasDispute: boolean;
  expectedReleaseDate: string;
  status: 'aguardando_pagamento' | 'retido' | 'aguardando_envio' | 'em_transporte' | 'aguardando_confirmacao' | 'disponivel_liberacao' | 'liberado' | 'em_disputa' | 'reembolsado' | 'bloqueado';
  notes?: string;
}

export interface AdminDisputeItem {
  id: string;
  orderId: string;
  buyerName: string;
  sellerName: string;
  productTitle: string;
  country: string;
  reason: string;
  amountFormatted: string;
  escrowStatus: string;
  messagesCount: number;
  evidencesCount: number;
  mediatorName?: string;
  status: 'nova' | 'awaiting_buyer' | 'awaiting_seller' | 'in_mediation' | 'evidences_submitted' | 'pending_decision' | 'resolved' | 'appealed';
  deadline: string;
  timeline: { title: string; date: string; done: boolean }[];
}

export interface AdminWarehouseItem {
  id: string;
  code: string;
  name: string;
  country: string;
  city: string;
  address: string;
  managerName: string;
  capacityUsedPercentage: number;
  totalCapacityPackages: number;
  activeShipments: number;
  dailyInboundPackages: number;
  dailyOutboundPackages: number;
  status: 'active' | 'maintenance' | 'expanding';
  staffCount: number;
  monthlyOperatingCostFormatted: string;
}

export interface AdminCountryRepItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  countryCode: string;
  countryName: string;
  status: 'active' | 'suspended' | 'vacant';
  assignedSellersCount: number;
  assignedStoresCount: number;
  supervisorsCount: number;
  monthlyRevenueFormatted: string;
  monthlyOrders: number;
  performanceScore: number;
  targetGMVFormatted: string;
  commissionRate: string;
  lastLogin: string;
  avatar?: string;
}

export interface AdminSupervisorItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  regionId: string;
  regionName: string;
  countryCode: string;
  status: 'active' | 'leave' | 'suspended';
  assignedHubsCount: number;
  deliveriesToday: number;
  performanceRating: number;
  activeCouriersCount: number;
  monthlyDeliveries: number;
  lastActive: string;
}

export interface AdminAuditItem {
  id: string;
  userName: string;
  userRole: string;
  action: string;
  entity: string;
  previousValue: string;
  newValue: string;
  ipAddress: string;
  country: string;
  timestamp: string;
  result: 'sucesso' | 'falha' | 'alerta';
}

// Initial Live System Data State
const adminState = {
  users: [
    {
      id: 'USR-001',
      name: 'Mamadu Djassi',
      email: 'admin@nusali.com',
      phone: '+245 955 000 001',
      country: 'GW',
      role: 'admin' as const,
      roleLabel: 'Administrador Geral CPLP',
      status: 'active' as const,
      createdAt: '01/01/2025',
      lastLogin: 'Agora mesmo',
      ordersCount: 0,
      purchasesCount: 0,
      riskScore: 'baixo' as const,
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80',
    },
    {
      id: 'USR-002',
      name: 'Djata Digital',
      email: 'djatadigital7@gmail.com',
      phone: '+245 955 123 456',
      country: 'GW',
      role: 'buyer' as const,
      roleLabel: 'Comprador Oficial',
      status: 'active' as const,
      createdAt: '15/01/2025',
      lastLogin: 'Há 5 minutos',
      ordersCount: 18,
      purchasesCount: 18,
      riskScore: 'baixo' as const,
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
    },
    {
      id: 'USR-003',
      name: 'Bissau Tech & Export Store',
      email: 'vendedor@nusali.com',
      phone: '+245 955 888 777',
      country: 'GW',
      role: 'seller' as const,
      roleLabel: 'Vendedor Platinum',
      status: 'active' as const,
      createdAt: '02/02/2025',
      lastLogin: 'Há 12 minutos',
      ordersCount: 540,
      purchasesCount: 3,
      riskScore: 'baixo' as const,
      avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=150&q=80',
    },
    {
      id: 'USR-004',
      name: 'Malam Bacai Sanhá Jr.',
      email: 'malam.bacai@nusali.gw',
      phone: '+245 955 000 003',
      country: 'GW',
      role: 'country_rep' as const,
      roleLabel: 'Representante Nacional Guiné-Bissau',
      status: 'active' as const,
      createdAt: '10/01/2025',
      lastLogin: 'Há 30 minutos',
      ordersCount: 0,
      purchasesCount: 0,
      riskScore: 'baixo' as const,
      avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=150&q=80',
    },
    {
      id: 'USR-005',
      name: 'Juliana Mendes',
      email: 'juliana.mendes@nusali.com.br',
      phone: '+55 11 98888-7766',
      country: 'BR',
      role: 'country_rep' as const,
      roleLabel: 'Representante Nacional Brasil',
      status: 'active' as const,
      createdAt: '12/01/2025',
      lastLogin: 'Há 1 hora',
      ordersCount: 0,
      purchasesCount: 0,
      riskScore: 'baixo' as const,
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=150&q=80',
    },
    {
      id: 'USR-006',
      name: 'Mussá Mané',
      email: 'mussa.mane@nusali.gw',
      phone: '+245 966 222 333',
      country: 'GW',
      role: 'supervisor' as const,
      roleLabel: 'Supervisor Regional Bissau & Biombo',
      status: 'active' as const,
      createdAt: '20/01/2025',
      lastLogin: 'Há 2 horas',
      ordersCount: 0,
      purchasesCount: 0,
      riskScore: 'baixo' as const,
      avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=150&q=80',
    },
  ] as AdminUserData[],

  kycQueue: [
    {
      id: 'KYC-901',
      sellerName: 'Carlos Biai',
      companyName: 'Bissau Tech & Export Store',
      country: 'GW',
      accountType: 'Pessoa Jurídica',
      documentType: 'Bilhete de Identidade',
      documentNumber: 'BI-GW-982109',
      submittedAt: '30/07/2026 às 14:10',
      status: 'verified',
      docFrontUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=400&q=80',
      selfieUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80',
      proofAddressUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=400&q=80',
      businessLicenseUrl: 'https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=400&q=80',
      riskScore: 'baixo',
      notes: 'Documentos do Ministério da Justiça de Bissau válidos e autenticados.',
    },
    {
      id: 'KYC-902',
      sellerName: 'Bacai Sanhá',
      companyName: 'Energia Solar Bissau',
      country: 'GW',
      accountType: 'Pessoa Jurídica',
      documentType: 'Certidão Comercial',
      documentNumber: 'NIF-55210981',
      submittedAt: '31/07/2026 às 09:30',
      status: 'under_review',
      docFrontUrl: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=400&q=80',
      selfieUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
      proofAddressUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=400&q=80',
      riskScore: 'baixo',
    },
    {
      id: 'KYC-903',
      sellerName: 'EletroBissau Ltda',
      companyName: 'EletroBissau Comercial',
      country: 'GW',
      accountType: 'Pessoa Jurídica',
      documentType: 'NIF / CNPJ',
      documentNumber: 'NIF-11002233',
      submittedAt: '01/08/2026 às 11:20',
      status: 'nova',
      docFrontUrl: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=400&q=80',
      selfieUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80',
      proofAddressUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=400&q=80',
      riskScore: 'baixo',
    },
  ] as AdminKycData[],

  escrowList: [
    {
      id: 'ESC-9102',
      orderId: 'ORD-9102',
      buyerName: 'Djata Digital',
      sellerName: 'Bissau Tech & Export Store',
      amount: 450000,
      amountFormatted: '450.000 XOF',
      currency: 'XOF',
      createdAt: '31/07/2026',
      releaseCondition: 'Confirmação de Recepção pelo Comprador ou 48h pós-entrega',
      deliveryStatus: 'Em Trânsito - HUB Central Bissau',
      hasDispute: false,
      expectedReleaseDate: '02/08/2026',
      status: 'retido',
      notes: 'Valor em custódia segura Nusali Proteção.',
    },
    {
      id: 'ESC-8750',
      orderId: 'ORD-8750',
      buyerName: 'Maria Silva',
      sellerName: 'Soluções Agrícolas Lda',
      amount: 1250.0,
      amountFormatted: 'R$ 1.250,00',
      currency: 'BRL',
      createdAt: '28/07/2026',
      releaseCondition: 'Entrega confirmada pelo rastreamento internacional',
      deliveryStatus: 'Entregue em São Paulo/BR',
      hasDispute: false,
      expectedReleaseDate: '30/07/2026',
      status: 'liberado',
      notes: 'Liberado para o saldo da loja com sucesso.',
    },
    {
      id: 'ESC-8810',
      orderId: 'ORD-8810',
      buyerName: 'Bacai Sanhá',
      sellerName: 'Ana Paula Rocha',
      amount: 180000,
      amountFormatted: '180.000 XOF',
      currency: 'XOF',
      createdAt: '29/07/2026',
      releaseCondition: 'Bloqueado devido a Disputa aberta pelo Comprador',
      deliveryStatus: 'Entrega com Avaria Reportada',
      hasDispute: true,
      expectedReleaseDate: 'Pendente de Mediação',
      status: 'bloqueado',
      notes: 'Bloqueado preventivamente pelo time de segurança.',
    },
  ] as AdminEscrowItem[],

  disputes: [
    {
      id: 'DSP-9821',
      orderId: 'ORD-8810',
      buyerName: 'Bacai Sanhá',
      sellerName: 'Ana Paula Rocha (Moda Afro CPLP)',
      productTitle: 'Inversor Solar Híbrido 5kW 48V High Efficiency',
      country: 'GW',
      reason: 'Produto com caixa amassada e avaria no gabinete exterior durante envio cross-border.',
      amountFormatted: '180.000 XOF',
      escrowStatus: 'Bloqueado (180.000 XOF)',
      messagesCount: 8,
      evidencesCount: 3,
      mediatorName: 'Mussá Mane (Mediador Senior)',
      status: 'in_mediation',
      deadline: '24 horas restantes',
      timeline: [
        { title: 'Disputa Aberta pelo Comprador', date: '29/07 10:15', done: true },
        { title: 'Vendedor Enviou Réplica com NF e fotos de despacho', date: '29/07 16:30', done: true },
        { title: 'Análise de Evidências Logísticas e Fotos', date: '30/07 09:00', done: true },
        { title: 'Proposta de Acordo com Reembolso Parcial de 30.000 XOF', date: '31/07 11:00', done: false },
        { title: 'Decisão Final e Liberação Escrow', date: 'Pendente', done: false },
      ],
    },
    {
      id: 'DSP-9822',
      orderId: 'ORD-7712',
      buyerName: 'Maria Silva',
      sellerName: 'Bissau Tech Store',
      productTitle: 'Galaxy S23 Ultra 512GB Phantom Black',
      country: 'BR',
      reason: 'Comprador alega que não recebeu um dos acessórios listados no anúncio.',
      amountFormatted: 'R$ 4.200,00',
      escrowStatus: 'Retido em Mediação',
      messagesCount: 4,
      evidencesCount: 2,
      mediatorName: 'Juliana Mendes',
      status: 'pending_decision',
      deadline: '12 horas restantes',
      timeline: [
        { title: 'Disputa Aberta', date: '27/07 14:00', done: true },
        { title: 'Solicitação de Evidências ao Vendedor', date: '28/07 09:00', done: true },
        { title: 'Vendedor comprovou envio em pacote lacrado', date: '29/07 11:00', done: true },
      ],
    },
  ] as AdminDisputeItem[],

  warehouses: [
    {
      id: 'WH-001',
      code: 'HUB-GW-01',
      name: 'HUB Central Nusali Bandim - Bissau',
      country: 'GW',
      city: 'Bissau',
      address: 'Av. Amílcar Cabral, nº 45, Bairro Bandim',
      managerName: 'Domingos Té',
      capacityUsedPercentage: 74,
      totalCapacityPackages: 15000,
      activeShipments: 1240,
      dailyInboundPackages: 380,
      dailyOutboundPackages: 360,
      status: 'active',
      staffCount: 28,
      monthlyOperatingCostFormatted: '4.500.000 XOF',
    },
    {
      id: 'WH-002',
      code: 'HUB-PT-01',
      name: 'HUB Lisboa Transit Cross-Border',
      country: 'PT',
      city: 'Lisboa',
      address: 'Zona Industrial de Prior Velho, Lote 12',
      managerName: 'Gonçalo Neves',
      capacityUsedPercentage: 62,
      totalCapacityPackages: 30000,
      activeShipments: 2850,
      dailyInboundPackages: 820,
      dailyOutboundPackages: 790,
      status: 'active',
      staffCount: 42,
      monthlyOperatingCostFormatted: '€ 18.500',
    },
    {
      id: 'WH-003',
      code: 'HUB-BR-01',
      name: 'HUB São Paulo Guarulhos Logistics',
      country: 'BR',
      city: 'Guarulhos',
      address: 'Rodovia Hélio Smidt, s/n, Acesso CPLP Cargo',
      managerName: 'Renato Barbosa',
      capacityUsedPercentage: 81,
      totalCapacityPackages: 45000,
      activeShipments: 4120,
      dailyInboundPackages: 1200,
      dailyOutboundPackages: 1150,
      status: 'active',
      staffCount: 56,
      monthlyOperatingCostFormatted: 'R$ 84.000',
    },
    {
      id: 'WH-004',
      code: 'HUB-AO-01',
      name: 'HUB Luanda Viana Hub Logístico',
      country: 'AO',
      city: 'Luanda',
      address: 'Pólo Industrial de Viana, Km 25',
      managerName: 'Mariana Costa',
      capacityUsedPercentage: 55,
      totalCapacityPackages: 25000,
      activeShipments: 1890,
      dailyInboundPackages: 490,
      dailyOutboundPackages: 470,
      status: 'active',
      staffCount: 35,
      monthlyOperatingCostFormatted: '12.000.000 AOA',
    },
  ] as AdminWarehouseItem[],

  countryReps: [
    {
      id: 'REP-GW-01',
      name: 'Malam Bacai Sanhá Jr.',
      email: 'malam.bacai@nusali.gw',
      phone: '+245 955 000 003',
      countryCode: 'GW',
      countryName: 'Guiné-Bissau (GW)',
      status: 'active',
      assignedSellersCount: 142,
      assignedStoresCount: 48,
      supervisorsCount: 4,
      monthlyRevenueFormatted: '185.400.000 XOF',
      monthlyOrders: 3420,
      performanceScore: 98,
      targetGMVFormatted: '200.000.000 XOF',
      commissionRate: '1.5%',
      lastLogin: 'Hoje às 08:30',
      avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=200&q=80',
    },
    {
      id: 'REP-BR-01',
      name: 'Juliana Mendes',
      email: 'juliana.mendes@nusali.com.br',
      phone: '+55 11 98888-7766',
      countryCode: 'BR',
      countryName: 'Brasil (BR)',
      status: 'active',
      assignedSellersCount: 310,
      assignedStoresCount: 120,
      supervisorsCount: 8,
      monthlyRevenueFormatted: 'R$ 840.000',
      monthlyOrders: 5600,
      performanceScore: 99,
      targetGMVFormatted: 'R$ 1.000.000',
      commissionRate: '1.2%',
      lastLogin: 'Hoje às 09:15',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=200&q=80',
    },
    {
      id: 'REP-PT-01',
      name: 'Dr. Afonso Henriques Moreira',
      email: 'afonso.moreira@nusali.pt',
      phone: '+351 912 345 678',
      countryCode: 'PT',
      countryName: 'Portugal (PT)',
      status: 'active',
      assignedSellersCount: 220,
      assignedStoresCount: 85,
      supervisorsCount: 5,
      monthlyRevenueFormatted: '€ 320.000',
      monthlyOrders: 4100,
      performanceScore: 96,
      targetGMVFormatted: '€ 400.000',
      commissionRate: '1.0%',
      lastLogin: 'Hoje às 07:45',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
    },
  ] as AdminCountryRepItem[],

  supervisors: [
    {
      id: 'SUP-GW-01',
      name: 'Mussá Mané',
      email: 'mussa.mane@nusali.gw',
      phone: '+245 966 222 333',
      regionId: 'REG-GW-001',
      regionName: 'Setor Autónomo de Bissau & Biombo',
      countryCode: 'GW',
      status: 'active',
      assignedHubsCount: 2,
      deliveriesToday: 142,
      performanceRating: 4.9,
      activeCouriersCount: 24,
      monthlyDeliveries: 3850,
      lastActive: 'Online Agora',
    },
    {
      id: 'SUP-GW-02',
      name: 'Fatoumata Binta Djassi',
      email: 'fatoumata.djassi@nusali.gw',
      phone: '+245 955 444 555',
      regionId: 'REG-GW-002',
      regionName: 'Região de Bafatá & Gabú',
      countryCode: 'GW',
      status: 'active',
      assignedHubsCount: 1,
      deliveriesToday: 68,
      performanceRating: 4.8,
      activeCouriersCount: 12,
      monthlyDeliveries: 1640,
      lastActive: 'Há 15 min',
    },
  ] as AdminSupervisorItem[],

  auditLogs: [
    {
      id: 'AUD-501',
      userName: 'Mamadu Djassi',
      userRole: 'Administrador Geral CPLP',
      action: 'Aprovação de KYC Vendedor',
      entity: 'Vendedor Bissau Tech & Export Store (SEL-001)',
      previousValue: 'Pendente',
      newValue: 'Verificado Ouro',
      ipAddress: '197.214.12.89',
      country: 'GW',
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      result: 'sucesso',
    },
    {
      id: 'AUD-502',
      userName: 'Juliana Mendes',
      userRole: 'Representante Nacional BR',
      action: 'Liberação de Custódia Escrow',
      entity: 'Pedido #ORD-8750',
      previousValue: 'Retido',
      newValue: 'Liberado ao Vendedor',
      ipAddress: '187.32.110.45',
      country: 'BR',
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      result: 'sucesso',
    },
  ] as AdminAuditItem[],

  platformSettings: {
    platformName: 'Mercado Nusali CPLP',
    escrowHoldingHours: 48,
    defaultBuyerProtectionFeePercent: 1.5,
    defaultSellerCommissionPercent: 5.0,
    maintenanceMode: false,
    require2faForStaff: true,
    supportedCurrencies: ['XOF', 'BRL', 'EUR', 'AOA', 'MZN', 'CVE', 'STN', 'USD'],
    activeHubsCount: 8,
  },
};

// Helper: Record an immutable Audit Log entry
function logAdminAction(userName: string, userRole: string, action: string, entity: string, previousValue: string, newValue: string, result: 'sucesso' | 'falha' | 'alerta' = 'sucesso', country: string = 'GW') {
  const newLog: AdminAuditItem = {
    id: `AUD-${Date.now().toString().slice(-4)}`,
    userName: userName || 'Mamadu Djassi (Admin Geral)',
    userRole: userRole || 'Administrador Geral',
    action,
    entity,
    previousValue: previousValue || 'N/A',
    newValue: newValue || 'N/A',
    ipAddress: '197.214.12.89',
    country,
    timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
    result,
  };
  adminState.auditLogs.unshift(newLog);
}

// ==========================================
// 1. OVERVIEW & KPIS (REAL POSTGRESQL METRICS)
// ==========================================
adminRouter.get('/overview', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) throw new AdminRequestError(503, 'Banco de dados indisponível.');

    const [
      allUsers,
      allSellers,
      pendingKycUsers,
      allDisputes,
      allWarehouses,
      allOrders,
      recentAuditLogs,
    ] = await Promise.all([
      db.select().from(users),
      db.select().from(sellers),
      db.select().from(users).where(eq(users.kycStatus, 'pending')),
      db.select().from(disputes),
      db.select().from(warehouses),
      db.select().from(orders),
      db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(10),
    ]);

    const activeUsersCount = allUsers.length;
    const verifiedSellersCount = allSellers.length;
    const pendingKycCount = pendingKycUsers.length;
    const activeDisputesCount = allDisputes.filter((d: any) => d.status !== 'resolved').length;
    const activeHubsCount = allWarehouses.length;
    const totalOrdersCount = allOrders.length;

    const totalGmvAmount = allOrders.reduce((sum: number, o: any) => sum + (Number(o.totalAmount) || 0), 0);
    const totalGmvFormatted = totalGmvAmount > 0 ? `${totalGmvAmount.toLocaleString('pt-PT')} XOF` : '0 XOF';

    return res.json({
      success: true,
      data: {
        metrics: {
          totalGmvFormatted,
          totalOrdersCount,
          activeUsersCount,
          verifiedSellersCount,
          pendingKycCount,
          activeDisputesCount,
          escrowInCustodyFormatted: '0 XOF',
          activeHubsCount,
          securityAlertsCount: 0,
        },
        recentActivity: recentAuditLogs.map((log: any) => ({
          id: log.id,
          userName: log.actorUserId || 'Sistema',
          userRole: 'Audit Log',
          action: log.action,
          entity: `${log.resource}${log.resourceId ? ` #${log.resourceId}` : ''}`,
          previousValue: 'N/A',
          newValue: 'Executado',
          ipAddress: log.ipAddress || '127.0.0.1',
          country: log.countryCode || 'GW',
          timestamp: log.createdAt instanceof Date ? log.createdAt.toLocaleString('pt-PT') : String(log.createdAt),
          result: 'sucesso',
        })),
        escrowOverview: [],
        kycQueue: [],
        disputesQueue: [],
      },
    });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

adminRouter.get('/stats', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) throw new AdminRequestError(503, 'Banco de dados indisponível.');
    const countryRows = await db.select().from(countries);
    const codes = countryRows.map((c: any) => c.code);
    return res.json({
      success: true,
      data: {
        countries: codes.length > 0 ? codes : ['GW'],
        currencies: ['XOF', 'BRL', 'EUR', 'AOA', 'MZN', 'CVE', 'STN', 'USD'],
        totalVolumeByCountry: {},
      },
    });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

// ==========================================
// 2. USERS & INTERNAL STAFF MANAGEMENT - REAL POSTGRESQL
// ==========================================
adminRouter.get('/users', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) throw new AdminRequestError(503, 'Banco de dados indisponível.');

    // Escopo territorial (fechamento RBAC): país autorizado vem só de
    // req.user (JWT) — nunca de req.query, mesmo que ?countryCode=XX seja
    // enviado (essa rota nem lê esse parâmetro).
    const scope = resolveAdministrativeScope(req.user);
    const userFilter = scopeCountryFilter(scope, users.countryCode);

    const { role, status, q } = req.query;
    const rows = userFilter
      ? await db.select().from(users).where(userFilter).orderBy(desc(users.createdAt))
      : await db.select().from(users).orderBy(desc(users.createdAt));
    let mapped = rows.map(mapDbUserToAdmin);

    if (role && typeof role === 'string' && role !== 'all') {
      const desired = role.toLowerCase();
      mapped = mapped.filter((u) => u.role.toLowerCase() === desired);
    }
    if (status && typeof status === 'string' && status !== 'all') {
      mapped = mapped.filter((u) => u.status === status);
    }
    if (q && typeof q === 'string' && q.trim()) {
      const term = q.trim().toLowerCase();
      mapped = mapped.filter((u) =>
        u.name.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term) ||
        u.phone.toLowerCase().includes(term)
      );
    }

    return res.json({ success: true, data: mapped, total: mapped.length });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

adminRouter.post('/users', requireGlobalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, phone, country = 'GW', role = 'buyer', password } = req.body ?? {};
    const requestedRole = String(role || '').trim();

    // GLOBAL_ADMIN é deliberadamente excluído: o primeiro Administrador Geral
    // já foi criado pelo script seguro e não pode ser replicado por esta tela.
    if (requestedRole.toUpperCase() === 'GLOBAL_ADMIN' || requestedRole.toLowerCase() === 'global_admin') {
      throw new AdminRequestError(403, 'Não é permitido criar outro Administrador Geral por esta rota.');
    }

    const canonicalRole = UI_ROLE_TO_DB[requestedRole] || UI_ROLE_TO_DB[requestedRole.toLowerCase()];
    if (!canonicalRole) throw new AdminRequestError(400, 'Perfil de usuário inválido.');

    const created = await createRealAccount({
      name,
      email,
      phone,
      country,
      role: canonicalRole,
      password,
    });

    await writeRealAudit(req, 'admin.user.created', 'users', created.user.id, {
      email: created.user.email,
      role: created.user.role,
      countryCode: created.user.countryCode,
    });

    const data = {
      ...mapDbUserToAdmin(created.user),
      temporaryPassword: created.temporaryPassword,
    };

    return res.status(201).json({
      success: true,
      message: `Usuário ${created.user.fullName} criado com sucesso. Senha temporária: ${created.temporaryPassword}`,
      data,
    });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

adminRouter.get('/users/:id', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) throw new AdminRequestError(503, 'Banco de dados indisponível.');
    const rows = await db.select().from(users).where(eq(users.id, req.params.id)).limit(1);
    if (!rows.length) throw new AdminRequestError(404, 'Usuário não encontrado.');

    const scope = resolveAdministrativeScope(req.user);
    assertCountryAccess(scope, rows[0].countryCode);

    return res.json({ success: true, data: mapDbUserToAdmin(rows[0]) });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

adminRouter.patch('/users/:id/status', requireGlobalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) throw new AdminRequestError(503, 'Banco de dados indisponível.');

    const rows = await db.select().from(users).where(eq(users.id, req.params.id)).limit(1);
    const target = rows[0];
    if (!target) throw new AdminRequestError(404, 'Usuário não encontrado.');
    if (String(target.role).toUpperCase() === 'GLOBAL_ADMIN') {
      throw new AdminRequestError(403, 'O Administrador Geral não pode ser bloqueado por esta tela.');
    }

    const requestedStatus = String(req.body?.status || '').toLowerCase();
    const isActive = requestedStatus
      ? requestedStatus === 'active'
      : target.isActive === false;

    const updated = await db.update(users)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(users.id, target.id))
      .returning();

    const mapped = mapDbUserToAdmin(updated[0] || { ...target, isActive });
    await writeRealAudit(req, 'admin.user.status_changed', 'users', target.id, {
      previousActive: target.isActive,
      isActive,
    });

    return res.json({
      success: true,
      message: `Status do usuário ${mapped.name} alterado para ${mapped.status.toUpperCase()}.`,
      data: mapped,
    });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

adminRouter.post('/users/:id/reset-password', requireGlobalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) throw new AdminRequestError(503, 'Banco de dados indisponível.');

    const rows = await db.select().from(users).where(eq(users.id, req.params.id)).limit(1);
    const target = rows[0];
    if (!target) throw new AdminRequestError(404, 'Usuário não encontrado.');
    if (String(target.role).toUpperCase() === 'GLOBAL_ADMIN') {
      throw new AdminRequestError(403, 'Use a área de segurança da própria conta para alterar a senha do Administrador Geral.');
    }

    const newPassword = String(req.body?.newPassword || '').trim() || generateTemporaryPassword();
    if (newPassword.length < 8) throw new AdminRequestError(400, 'A nova senha deve ter pelo menos 8 caracteres.');

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, target.id));

    await writeRealAudit(req, 'admin.user.password_reset', 'users', target.id, { email: target.email });

    return res.json({
      success: true,
      message: `Senha de ${target.fullName} redefinida com sucesso. Nova senha temporária: ${newPassword}`,
      data: { id: target.id, temporaryPassword: newPassword },
    });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

// ==========================================
// 3. KYC & DOCUMENT VERIFICATION - REAL POSTGRESQL
// ==========================================
adminRouter.get('/kyc', requireGlobalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) throw new AdminRequestError(503, 'Banco de dados indisponível.');

    const kycList = await db.select().from(sellerKyc).orderBy(desc(sellerKyc.submittedAt));
    const allSellers = await db.select().from(sellers);
    const docRows = await db.select().from(sellerDocuments);

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

    const data = await Promise.all(
      kycList.map(async (k: any) => {
        const seller = allSellers.find((s: any) => s.id === k.sellerId);
        const docs = docRows.filter((d: any) => d.sellerId === k.sellerId);

        const docFrontEntry = docs.find((d: any) => d.documentType === 'identity_document' || d.documentType === 'identity_card');
        const selfieEntry = docs.find((d: any) => d.documentType === 'selfie');
        const addressEntry = docs.find((d: any) => d.documentType === 'proof_of_address');
        const businessEntry = docs.find((d: any) => d.documentType === 'business_license');

        const docFrontUrl = await resolveSignedUrl(docFrontEntry?.objectKey, k.documentFrontUrl || docFrontEntry?.fileUrl);
        const selfieUrl = await resolveSignedUrl(selfieEntry?.objectKey, k.selfieUrl || selfieEntry?.fileUrl);
        const proofAddressUrl = await resolveSignedUrl(addressEntry?.objectKey, k.proofOfAddressUrl || addressEntry?.fileUrl);
        const businessLicenseUrl = await resolveSignedUrl(businessEntry?.objectKey, businessEntry?.fileUrl);

        return {
          id: k.id,
          sellerId: k.sellerId,
          sellerName: seller?.companyName || k.legalName || 'Vendedor',
          companyName: seller?.tradingName || seller?.companyName || k.legalName || 'Empresa',
          country: seller?.countryCode || 'GW',
          accountType: k.accountType || 'Empresa / Sociedade Comercial',
          documentType: k.documentType || 'Bilhete de Identidade / Passaporte',
          documentNumber: k.documentNumber || '',
          submittedAt: k.submittedAt instanceof Date ? k.submittedAt.toLocaleString('pt-PT') : String(k.submittedAt || ''),
          status: k.status || 'pending',
          docFrontUrl: docFrontUrl || undefined,
          docBackUrl: k.documentBackUrl || undefined,
          selfieUrl: selfieUrl || undefined,
          proofAddressUrl: proofAddressUrl || undefined,
          businessLicenseUrl: businessLicenseUrl || undefined,
          riskScore: k.riskLevel || 'baixo',
          notes: k.rejectionReason || undefined,
        };
      })
    );

    return res.json({ success: true, data });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

adminRouter.post('/kyc/:id/approve', requireGlobalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) throw new AdminRequestError(503, 'Banco de dados indisponível.');

    let rows = await db.select().from(sellerKyc).where(eq(sellerKyc.id, req.params.id)).limit(1);
    let kyc = rows[0];
    let sellerId = kyc?.sellerId;

    if (!kyc && req.params.id.startsWith('kyc_')) {
      const parsedSellerId = req.params.id.replace('kyc_', '');
      const sellerRows = await db.select().from(sellers).where(eq(sellers.id, parsedSellerId)).limit(1);
      if (sellerRows.length > 0) {
        sellerId = parsedSellerId;
        const existingKyc = await db.select().from(sellerKyc).where(eq(sellerKyc.sellerId, sellerId)).limit(1);
        if (existingKyc.length > 0) {
          kyc = existingKyc[0];
        } else {
          const newKycId = `kyc_${Date.now()}`;
          await db.insert(sellerKyc).values({
            id: newKycId,
            sellerId,
            legalName: sellerRows[0].companyName,
            documentType: 'id_card',
            documentNumber: sellerRows[0].taxId,
            status: 'verified',
            reviewedAt: new Date(),
            reviewerId: req.user?.id || null,
          });
          kyc = { id: newKycId, sellerId } as any;
        }
      }
    }

    if (!kyc && !sellerId) throw new AdminRequestError(404, 'Documento KYC não encontrado.');

    const notes = String(req.body?.notes || 'Documentação verificada e aprovada pelo Administrador Geral.');

    await db.transaction(async (tx: any) => {
      if (kyc?.id) {
        await tx.update(sellerKyc)
          .set({
            status: 'verified',
            reviewedAt: new Date(),
            reviewerId: req.user?.id || null,
          })
          .where(eq(sellerKyc.id, kyc.id));
      }

      await tx.update(sellers)
        .set({ status: 'active', updatedAt: new Date() })
        .where(eq(sellers.id, sellerId!));

      const sellerObj = (await tx.select().from(sellers).where(eq(sellers.id, sellerId!)).limit(1))[0];
      if (sellerObj) {
        await tx.update(users)
          .set({ kycStatus: 'verified', updatedAt: new Date() })
          .where(eq(users.id, sellerObj.userId));

        await tx.update(sellerProfiles)
          .set({ verifiedAt: new Date(), updatedAt: new Date() })
          .where(eq(sellerProfiles.sellerId, sellerObj.id));
      }
    });

    await writeRealAudit(req, 'admin.kyc.approved', 'seller_kyc', kyc?.id || req.params.id, { sellerId, notes });

    return res.json({
      success: true,
      message: `Documento KYC aprovado com sucesso! Vendedor verificado.`,
      data: { id: kyc?.id || req.params.id, status: 'verified', notes },
    });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

adminRouter.post('/kyc/:id/reject', requireGlobalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) throw new AdminRequestError(503, 'Banco de dados indisponível.');

    let rows = await db.select().from(sellerKyc).where(eq(sellerKyc.id, req.params.id)).limit(1);
    let kyc = rows[0];
    let sellerId = kyc?.sellerId;

    if (!kyc && req.params.id.startsWith('kyc_')) {
      const parsedSellerId = req.params.id.replace('kyc_', '');
      const sellerRows = await db.select().from(sellers).where(eq(sellers.id, parsedSellerId)).limit(1);
      if (sellerRows.length > 0) {
        sellerId = parsedSellerId;
        const existingKyc = await db.select().from(sellerKyc).where(eq(sellerKyc.sellerId, sellerId)).limit(1);
        if (existingKyc.length > 0) kyc = existingKyc[0];
      }
    }

    if (!kyc && !sellerId) throw new AdminRequestError(404, 'Documento KYC não encontrado.');

    const reason = String(req.body?.reason || 'Documento ilegível ou divergência de titularidade.');

    await db.transaction(async (tx: any) => {
      if (kyc?.id) {
        await tx.update(sellerKyc)
          .set({
            status: 'rejected',
            rejectionReason: reason,
            reviewedAt: new Date(),
            reviewerId: req.user?.id || null,
          })
          .where(eq(sellerKyc.id, kyc.id));
      }

      const targetId = sellerId || kyc?.sellerId;
      if (targetId) {
        const sellerObj = (await tx.select().from(sellers).where(eq(sellers.id, targetId)).limit(1))[0];
        if (sellerObj) {
          await tx.update(users)
            .set({ kycStatus: 'rejected', updatedAt: new Date() })
            .where(eq(users.id, sellerObj.userId));
        }
      }
    });

    await writeRealAudit(req, 'admin.kyc.rejected', 'seller_kyc', kyc?.id || req.params.id, { sellerId, reason });

    return res.json({
      success: true,
      message: `Documento KYC #${kyc?.id || req.params.id} rejeitado. Vendedor notificado.`,
      data: { id: kyc?.id || req.params.id, status: 'rejected', reason },
    });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

adminRouter.get('/sellers', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) throw new AdminRequestError(503, 'Banco de dados indisponível.');

    // Escopo territorial: nunca aceita país vindo de query/body — deriva
    // sempre da identidade autenticada (req.user).
    const scope = resolveAdministrativeScope(req.user);
    const sellerFilter = scopeCountryFilter(scope, sellers.countryCode);

    const sellerRows = sellerFilter
      ? await db.select().from(sellers).where(sellerFilter).orderBy(desc(sellers.createdAt))
      : await db.select().from(sellers).orderBy(desc(sellers.createdAt));
    const allUsers = await db.select().from(users);
    const sellerUsers = allUsers.filter((u: any) =>
      String(u.role).toUpperCase() === 'SELLER' &&
      (scope.kind === 'GLOBAL' || String(u.countryCode || '').toUpperCase() === scope.countryCode)
    );

    const data = sellerRows.map((s: any) => {
      const user = allUsers.find((u: any) => u.id === s.userId);
      return {
        id: s.id,
        userId: s.userId,
        sellerName: s.companyName || user?.fullName || 'Vendedor Cadastrado',
        tradingName: s.tradingName || s.companyName || null,
        email: user?.email || '',
        phone: s.phone || user?.phone || null,
        countryCode: s.countryCode || user?.countryCode || null,
        status: s.status || 'pending',
        taxId: s.taxId || null,
        commissionRate: s.commissionRate || null,
        rating: s.rating ? String(s.rating) : null,
        totalSales: s.totalSales || '0.00',
        totalOrders: s.totalOrders || 0,
        createdAt: s.createdAt instanceof Date ? s.createdAt.toLocaleDateString('pt-BR') : String(s.createdAt || ''),
      };
    });

    // Also include SELLER role users who don't have a record in sellers table yet
    sellerUsers.forEach((u: any) => {
      const alreadyIncluded = data.some((d: any) => d.userId === u.id);
      if (!alreadyIncluded) {
        data.push({
          id: `slr_${u.id}`,
          userId: u.id,
          sellerName: u.fullName || 'Novo Vendedor',
          tradingName: null,
          email: u.email || '',
          phone: u.phone || null,
          countryCode: u.countryCode || null,
          status: 'pending',
          taxId: null,
          commissionRate: null,
          rating: null,
          totalSales: '0.00',
          totalOrders: 0,
          createdAt: u.createdAt instanceof Date ? u.createdAt.toLocaleDateString('pt-BR') : String(u.createdAt || ''),
        });
      }
    });

    return res.json({ success: true, data });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

adminRouter.get('/stores', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) throw new AdminRequestError(503, 'Banco de dados indisponível.');

    const scope = resolveAdministrativeScope(req.user);
    const storeFilter = scopeCountryFilter(scope, stores.countryCode);

    const storeRows = storeFilter
      ? await db.select().from(stores).where(storeFilter).orderBy(desc(stores.createdAt))
      : await db.select().from(stores).orderBy(desc(stores.createdAt));
    return res.json({ success: true, data: storeRows });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

// ==========================================
// 4. ESCROW CUSTODY & NUSALI PROTEÇÃO
// ==========================================
// ==========================================
// 4. ESCROW CUSTODY & NUSALI PROTEÇÃO
// ==========================================
adminRouter.get('/escrow', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (db) {
      const scope = resolveAdministrativeScope(req.user);
      const rows = await db
        .select({ escrow: escrowAccounts, sellerCountry: sellers.countryCode })
        .from(escrowAccounts)
        .innerJoin(sellers, eq(escrowAccounts.sellerId, sellers.id))
        .where(scope.kind === 'GLOBAL' ? undefined : eq(sellers.countryCode, scope.countryCode))
        .orderBy(desc(escrowAccounts.createdAt));
      return res.json({
        success: true,
        data: rows.map(({ escrow: r }) => ({
          ...r,
          amount: Number(r.amount),
        })),
      });
    }
    return res.json({ success: true, data: [] });
  } catch (err: any) {
    if (err instanceof ScopeError) {
      return res.status(err.status).json({ success: false, error: { code: err.code, message: err.message } });
    }
    return res.status(500).json({ success: false, message: err?.message });
  }
});

adminRouter.post('/escrow/:id/release', requireFinanceApproval, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    if (!db) return res.status(503).json({ success: false, message: 'Banco de dados indisponível.' });

    const escRows = await db
      .select({ escrow: escrowAccounts, sellerCountry: sellers.countryCode })
      .from(escrowAccounts)
      .innerJoin(sellers, eq(escrowAccounts.sellerId, sellers.id))
      .where(eq(escrowAccounts.id, id))
      .limit(1);
    if (escRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Custódia Escrow não encontrada.' });
    }

    const esc = escRows[0].escrow;
    const scope = resolveAdministrativeScope(req.user);
    assertCountryAccess(scope, escRows[0].sellerCountry);

    const performedBy = req.user?.id || 'admin';
    const releaseResult = await PaymentService.releaseEscrowForOrder(esc.orderId, {
      performedBy,
      reason: 'Liberação manual de custódia efetuada pelo administrador.',
    });

    return res.json({
      success: true,
      message: `Custódia #${id} liberada com sucesso para o vendedor!`,
      data: releaseResult,
    });
  } catch (err: any) {
    if (err instanceof ScopeError) {
      return res.status(err.status).json({ success: false, error: { code: err.code, message: err.message } });
    }
    return res.status(400).json({ success: false, message: err?.message || 'Falha ao liberar custódia.' });
  }
});

adminRouter.post('/escrow/:id/freeze', requireFinanceApproval, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    if (!db) return res.status(503).json({ success: false, message: 'Banco de dados indisponível.' });

    const escRows = await db
      .select({ sellerCountry: sellers.countryCode })
      .from(escrowAccounts)
      .innerJoin(sellers, eq(escrowAccounts.sellerId, sellers.id))
      .where(eq(escrowAccounts.id, id))
      .limit(1);
    if (escRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Custódia Escrow não encontrada.' });
    }

    const scope = resolveAdministrativeScope(req.user);
    assertCountryAccess(scope, escRows[0].sellerCountry);

    await db.update(escrowAccounts).set({ status: 'disputed', disputedAt: new Date(), updatedAt: new Date() }).where(eq(escrowAccounts.id, id));
    return res.json({
      success: true,
      message: `Custódia #${id} bloqueada para auditoria.`,
    });
  } catch (err: any) {
    if (err instanceof ScopeError) {
      return res.status(err.status).json({ success: false, error: { code: err.code, message: err.message } });
    }
    return res.status(500).json({ success: false, message: err?.message });
  }
});

// ==========================================
// 4B. SELLER PAYOUTS MANAGEMENT
// ==========================================
adminRouter.get('/payouts', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.json({ success: true, data: [] });

    const scope = resolveAdministrativeScope(req.user);
    const payoutsList = await db
      .select({
        payout: sellerPayouts,
        seller: sellers,
        user: users,
        profile: sellerProfiles,
      })
      .from(sellerPayouts)
      .innerJoin(sellers, eq(sellerPayouts.sellerId, sellers.id))
      .leftJoin(users, eq(sellers.userId, users.id))
      .leftJoin(sellerProfiles, eq(sellers.id, sellerProfiles.sellerId))
      .where(scope.kind === 'GLOBAL' ? undefined : eq(sellers.countryCode, scope.countryCode))
      .orderBy(desc(sellerPayouts.createdAt));

    const result = payoutsList.map(({ payout, seller, user }) => ({
      id: payout.id,
      sellerId: payout.sellerId,
      sellerName: seller.tradingName || seller.companyName || user?.fullName || `Vendedor #${seller.id}`,
      amount: Number(payout.amount),
      currency: payout.currency,
      method: payout.method,
      bankAccountId: payout.bankAccountId,
      status: payout.status,
      processedAt: payout.processedAt,
      transactionRef: payout.transactionRef,
      createdAt: payout.createdAt,
    }));

    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

adminRouter.post('/payouts/:id/status', requireFinanceApproval, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, message: 'Banco de dados indisponível.' });

    const { id } = req.params;
    const { status, transactionRef } = req.body;

    if (!['pending', 'processing', 'completed', 'failed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status inválido para saque.' });
    }

    const payoutRows = await db
      .select({ sellerCountry: sellers.countryCode })
      .from(sellerPayouts)
      .innerJoin(sellers, eq(sellerPayouts.sellerId, sellers.id))
      .where(eq(sellerPayouts.id, id))
      .limit(1);
    if (payoutRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Saque não encontrado.' });
    }

    const scope = resolveAdministrativeScope(req.user);
    assertCountryAccess(scope, payoutRows[0].sellerCountry);

    const result = await processPayoutStatusChange(id, status, {
      transactionRef,
      isProduction: process.env.NODE_ENV === 'production',
    });

    return res.json(result);
  } catch (err: any) {
    if (err instanceof ScopeError) {
      return res.status(err.status).json({ success: false, error: { code: err.code, message: err.message } });
    }
    if (err?.code === 'PAYOUT_INVALID_TRANSITION' || err?.message?.includes('PAYOUT_INVALID_TRANSITION')) {
      return res.status(409).json({
        success: false,
        error: { code: 'PAYOUT_INVALID_TRANSITION', message: err.message },
      });
    }
    if (err?.code === 'TRANSACTION_REF_REQUIRED' || err?.message?.includes('TRANSACTION_REF_REQUIRED')) {
      return res.status(400).json({
        success: false,
        error: { code: 'TRANSACTION_REF_REQUIRED', message: err.message },
      });
    }
    return res.status(400).json({ success: false, message: err?.message });
  }
});

adminRouter.get('/finance/overview', requireFinanceApproval, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      return res.json({
        success: true,
        data: {
          gmvPaid: 0,
          escrowHeld: 0,
          escrowReleased: 0,
          sellersBalanceAggregate: 0,
          payoutsPending: 0,
          payoutsCompleted: 0,
          byCurrency: {},
        },
      });
    }

    // Escopo territorial: GLOBAL_ADMIN/ADMIN/FINANCE veem todos os países,
    // agrupados por moeda (nunca somando BRL+XOF); COUNTRY_REPRESENTATIVE só
    // vê o próprio país. Nunca aceita país vindo de query/body do cliente.
    const scope = resolveAdministrativeScope(req.user);
    const isGlobal = scope.kind === 'GLOBAL';

    // Requirement 8: Multi-currency breakdown & Requirement 7: Aggregate ONLY sellers' wallets
    const gmvRows = await db
      .select({
        currency: orders.currency,
        total: sql<string>`COALESCE(SUM(${orders.totalAmount}), '0')`,
      })
      .from(orders)
      .where(isGlobal ? eq(orders.paymentStatus, 'paid') : and(eq(orders.paymentStatus, 'paid'), eq(orders.countryCode, scope.countryCode)))
      .groupBy(orders.currency);

    const escrowHeldRows = await db
      .select({
        currency: escrowAccounts.currency,
        total: sql<string>`COALESCE(SUM(${escrowAccounts.amount}), '0')`,
      })
      .from(escrowAccounts)
      .innerJoin(sellers, eq(escrowAccounts.sellerId, sellers.id))
      .where(isGlobal ? eq(escrowAccounts.status, 'held') : and(eq(escrowAccounts.status, 'held'), eq(sellers.countryCode, scope.countryCode)))
      .groupBy(escrowAccounts.currency);

    const escrowReleasedRows = await db
      .select({
        currency: escrowAccounts.currency,
        total: sql<string>`COALESCE(SUM(${escrowAccounts.amount}), '0')`,
      })
      .from(escrowAccounts)
      .innerJoin(sellers, eq(escrowAccounts.sellerId, sellers.id))
      .where(isGlobal ? eq(escrowAccounts.status, 'released') : and(eq(escrowAccounts.status, 'released'), eq(sellers.countryCode, scope.countryCode)))
      .groupBy(escrowAccounts.currency);

    // Requirement 7: Filter wallets to ONLY users registered in sellers table
    const sellersBalRows = await db
      .select({
        currency: wallets.currency,
        total: sql<string>`COALESCE(SUM(${wallets.balance}), '0')`,
      })
      .from(wallets)
      .innerJoin(sellers, eq(wallets.userId, sellers.userId))
      .where(isGlobal ? undefined : eq(sellers.countryCode, scope.countryCode))
      .groupBy(wallets.currency);

    const payoutsPendingRows = await db
      .select({
        currency: sellerPayouts.currency,
        total: sql<string>`COALESCE(SUM(${sellerPayouts.amount}), '0')`,
      })
      .from(sellerPayouts)
      .innerJoin(sellers, eq(sellerPayouts.sellerId, sellers.id))
      .where(isGlobal ? eq(sellerPayouts.status, 'pending') : and(eq(sellerPayouts.status, 'pending'), eq(sellers.countryCode, scope.countryCode)))
      .groupBy(sellerPayouts.currency);

    const payoutsCompletedRows = await db
      .select({
        currency: sellerPayouts.currency,
        total: sql<string>`COALESCE(SUM(${sellerPayouts.amount}), '0')`,
      })
      .from(sellerPayouts)
      .innerJoin(sellers, eq(sellerPayouts.sellerId, sellers.id))
      .where(isGlobal ? eq(sellerPayouts.status, 'completed') : and(eq(sellerPayouts.status, 'completed'), eq(sellers.countryCode, scope.countryCode)))
      .groupBy(sellerPayouts.currency);

    const currencies = Array.from(new Set([
      ...gmvRows.map(r => r.currency),
      ...escrowHeldRows.map(r => r.currency),
      ...escrowReleasedRows.map(r => r.currency),
      ...sellersBalRows.map(r => r.currency),
      ...payoutsPendingRows.map(r => r.currency),
      ...payoutsCompletedRows.map(r => r.currency),
    ])).filter(Boolean);

    const byCurrency: Record<string, any> = {};
    for (const curr of currencies) {
      byCurrency[curr] = {
        gmvPaid: Number(gmvRows.find(r => r.currency === curr)?.total || 0),
        escrowHeld: Number(escrowHeldRows.find(r => r.currency === curr)?.total || 0),
        escrowReleased: Number(escrowReleasedRows.find(r => r.currency === curr)?.total || 0),
        sellersBalanceAggregate: Number(sellersBalRows.find(r => r.currency === curr)?.total || 0),
        payoutsPending: Number(payoutsPendingRows.find(r => r.currency === curr)?.total || 0),
        payoutsCompleted: Number(payoutsCompletedRows.find(r => r.currency === curr)?.total || 0),
      };
    }

    const primaryKey = byCurrency['XOF'] ? 'XOF' : (currencies[0] || 'XOF');
    const primary = byCurrency[primaryKey] || {
      gmvPaid: 0,
      escrowHeld: 0,
      escrowReleased: 0,
      sellersBalanceAggregate: 0,
      payoutsPending: 0,
      payoutsCompleted: 0,
    };

    return res.json({
      success: true,
      data: {
        ...primary,
        byCurrency,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

// ==========================================
// 5. DISPUTES MEDIATION
// ==========================================
adminRouter.get('/disputes', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (db) {
      const scope = resolveAdministrativeScope(req.user);
      const rows = await db
        .select({ dispute: disputes, sellerCountry: sellers.countryCode })
        .from(disputes)
        .innerJoin(sellers, eq(disputes.sellerId, sellers.id))
        .where(scope.kind === 'GLOBAL' ? undefined : eq(sellers.countryCode, scope.countryCode))
        .orderBy(desc(disputes.createdAt));
      return res.json({
        success: true,
        data: rows.map(({ dispute: r }) => ({
          ...r,
          claimAmount: Number(r.claimAmount),
        })),
      });
    }
    return res.json({ success: true, data: [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

adminRouter.post('/disputes/:id/resolve', requireDisputeResolvePermission, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, message: 'Banco de dados indisponível.' });

    const { id } = req.params;
    const { resolution, performedBy } = req.body;

    const disputeRows = await db
      .select({ sellerCountry: sellers.countryCode })
      .from(disputes)
      .innerJoin(sellers, eq(disputes.sellerId, sellers.id))
      .where(eq(disputes.id, id))
      .limit(1);
    if (disputeRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Disputa não encontrada.' });
    }

    const scope = resolveAdministrativeScope(req.user);
    assertCountryAccess(scope, disputeRows[0].sellerCountry);

    // Fase "Refund/disputa/chargeback": antes desta fase, resolver uma disputa
    // só mudava disputes.status — BUYER_WIN nunca acionava refund de verdade.
    const result = await resolveDispute(
      id,
      resolution === 'refund_buyer' ? 'refund_buyer' : 'seller_win',
      { performedBy, resolutionNote: resolution }
    );

    return res.json(result);
  } catch (err: any) {
    if (err instanceof ScopeError) {
      return res.status(err.status).json({ success: false, error: { code: err.code, message: err.message } });
    }
    if (err instanceof RefundValidationError) {
      return res.status(err.status).json({ success: false, error: { code: err.code, message: err.message } });
    }
    return res.status(500).json({ success: false, message: err?.message });
  }
});

// ==========================================
// 6. WAREHOUSES & LOGISTICS HUBS
// ==========================================
adminRouter.get('/warehouses', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (db) {
      const rows = await db.select().from(warehouses).orderBy(desc(warehouses.createdAt));
      return res.json({
        success: true,
        data: rows,
      });
    }
    return res.json({ success: true, data: [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

adminRouter.post('/warehouses', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { name, code, countryCode, country, city, address, managerName, staffCount } = req.body;

    const resolvedCountryCode = (countryCode || country || '').toString().trim().toUpperCase();

    if (!name || !code || !resolvedCountryCode || !city || !address) {
      return res.status(400).json({
        success: false,
        message: 'Código, Nome, País (countryCode), Cidade e Endereço são obrigatórios.',
      });
    }

    const whId = `wh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newWh = {
      id: whId,
      code: String(code).trim().toUpperCase(),
      name: String(name).trim(),
      countryCode: resolvedCountryCode,
      city: String(city).trim(),
      address: String(address).trim(),
      managerName: managerName ? String(managerName).trim() : null,
      staffCount: staffCount ? Number(staffCount) : null,
      status: 'active',
      createdAt: new Date(),
    };

    if (db) {
      await db.insert(warehouses).values(newWh);
    }

    return res.json({
      success: true,
      message: `HUB Logístico "${name}" cadastrado com sucesso!`,
      data: newWh,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

// GET /api/v1/admin/inventory/transfers
adminRouter.get('/inventory/transfers', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.json({ success: true, data: [] });

    const transfers = await db.select().from(inventoryTransfers).orderBy(desc(inventoryTransfers.createdAt));

    const [allSellers, allUsers, allStores, allAddresses, allProducts, allWarehouses] = await Promise.all([
      db.select().from(sellers),
      db.select().from(users),
      db.select({ id: stores.id, sellerId: stores.sellerId, name: stores.name, slug: stores.slug, countryCode: stores.countryCode, logoUrl: stores.logoUrl }).from(stores),
      db.select().from(addresses),
      db.select().from(products),
      db.select().from(warehouses),
    ]);

    const sellerMap = new Map(allSellers.map((s) => [s.id, s]));
    const userMap = new Map(allUsers.map((u) => [u.id, u]));
    const storeMap = new Map(allStores.map((st) => [st.sellerId, st]));
    const addressMap = new Map(allAddresses.map((a) => [a.userId, a]));
    const productMap = new Map(allProducts.map((p) => [p.id, p]));
    const warehouseMap = new Map(allWarehouses.map((w) => [w.id, w]));

    const enriched = transfers.map((t) => {
      const seller = sellerMap.get(t.sellerId);
      const sellerUser = seller?.userId ? userMap.get(seller.userId) : null;
      const store = storeMap.get(t.sellerId);
      const addr = sellerUser ? addressMap.get(sellerUser.id) : null;
      const product = productMap.get(t.productId);
      const wh = warehouseMap.get(t.toWarehouseId);

      const snap = (t.pickupSnapshotJson as any) || {};

      const sellerPhone = snap.phone || addr?.phone || seller?.phone || null;
      const storeNameStr = snap.storeName || store?.name || seller?.tradingName || seller?.companyName || null;
      const sellerNameStr = snap.contactName || sellerUser?.fullName || seller?.companyName || seller?.tradingName || null;

      const pickupAddrStr = snap.address || (addr ? `${addr.street}, ${addr.number}${addr.complement ? ' - ' + addr.complement : ''}${addr.neighborhood ? ', ' + addr.neighborhood : ''}`.trim() : null);
      const pickupCityStr = snap.city || addr?.city || null;
      const pickupRegionStr = snap.region || addr?.state || null;
      const pickupCountryCodeStr = snap.countryCode || addr?.countryCode || store?.countryCode || seller?.countryCode || null;

      const sellerObj = {
        id: seller?.id || t.sellerId,
        name: sellerNameStr,
        phone: sellerPhone,
        email: sellerUser?.email || null,
        storeName: storeNameStr,
      };

      const pickupLocationObj = {
        address: pickupAddrStr,
        city: pickupCityStr,
        region: pickupRegionStr,
        countryCode: pickupCountryCodeStr,
        phone: sellerPhone,
      };

      const productObj = {
        id: product?.id || t.productId,
        title: product?.title || t.productId,
        sku: product?.id || t.productId,
        image: product?.image || null,
      };

      const destinationWarehouseObj = {
        id: wh?.id || t.toWarehouseId,
        name: wh?.name || t.toWarehouseId,
        city: wh?.city || null,
        countryCode: wh?.countryCode || null,
        address: wh?.address || null,
      };

      return {
        ...t,
        sellerName: sellerNameStr,
        sellerCode: sellerUser?.email || seller?.id || t.sellerId,
        sellerPhone,
        storeName: storeNameStr,
        productTitle: productObj.title,
        productImage: productObj.image,
        productSku: productObj.sku,
        warehouseName: destinationWarehouseObj.name,
        warehouseCity: destinationWarehouseObj.city,
        warehouseCountry: destinationWarehouseObj.countryCode,
        warehouseAddress: destinationWarehouseObj.address,
        pickupAddress: pickupAddrStr,
        pickupCity: pickupCityStr,
        pickupRegion: pickupRegionStr,
        pickupCountryCode: pickupCountryCodeStr,
        pickupPhone: sellerPhone,
        deliveryMode: t.deliveryMode || null,

        // Structured nested objects
        seller: sellerObj,
        pickupLocation: pickupLocationObj,
        product: productObj,
        destinationWarehouse: destinationWarehouseObj,
      };
    });

    return res.json({ success: true, data: enriched });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

// POST /api/v1/admin/inventory/transfers/:id/in-transit
adminRouter.post('/inventory/transfers/:id/in-transit', requireLogisticsStaff, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: 'Autenticação necessária.' });
    }
    const { id } = req.params;
    const result = await InventoryService.markTransferInTransit(id, req.user.id);

    const db = getDb();
    if (db) {
      await db.insert(auditLogs).values({
        id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        actorUserId: req.user.id,
        action: 'TRANSFER_MARKED_IN_TRANSIT',
        resource: 'inventory_transfers',
        resourceId: id,
        detailsJson: { transferId: id, markedBy: req.user.id },
        createdAt: new Date(),
      }).catch(() => {});
    }

    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err?.message });
  }
});

// POST /api/v1/admin/inventory/transfers/:id/receive
adminRouter.post('/inventory/transfers/:id/receive', requireLogisticsStaff, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: 'Autenticação necessária.' });
    }
    const { id } = req.params;
    await InventoryService.confirmHubTransfer(id, req.user.id);

    const db = getDb();
    if (db) {
      await db.insert(auditLogs).values({
        id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        actorUserId: req.user.id,
        action: 'TRANSFER_RECEIVED',
        resource: 'inventory_transfers',
        resourceId: id,
        detailsJson: { transferId: id, receivedBy: req.user.id },
        createdAt: new Date(),
      }).catch(() => {});
    }

    return res.json({
      success: true,
      message: `Transferência ${id} confirmada e recebida no HUB com sucesso!`,
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err?.message });
  }
});

// POST /api/v1/admin/inventory/transfers/:id/cancel
adminRouter.post('/inventory/transfers/:id/cancel', requireLogisticsStaff, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: 'Autenticação necessária.' });
    }
    const { id } = req.params;
    const result = await InventoryService.cancelTransferToHub(id, req.user.id, false);

    const db = getDb();
    if (db) {
      await db.insert(auditLogs).values({
        id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        actorUserId: req.user.id,
        action: 'TRANSFER_CANCELLED',
        resource: 'inventory_transfers',
        resourceId: id,
        detailsJson: { transferId: id, cancelledBy: req.user.id },
        createdAt: new Date(),
      }).catch(() => {});
    }

    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err?.message });
  }
});

// ==========================================
// 7. COUNTRY REPS & SUPERVISORS - REAL ACCOUNTS
// ==========================================
adminRouter.get('/country-reps', requireGlobalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) throw new AdminRequestError(503, 'Banco de dados indisponível.');
    const rows = await db.select().from(users)
      .where(eq(users.role, 'COUNTRY_REPRESENTATIVE'))
      .orderBy(desc(users.createdAt));

    const data: AdminCountryRepItem[] = rows.map((u) => ({
      id: u.id,
      name: u.fullName,
      email: u.email,
      phone: u.phone || '',
      countryCode: u.countryCode,
      countryName: u.countryCode,
      status: u.isActive ? 'active' : 'suspended',
      assignedSellersCount: 0,
      assignedStoresCount: 0,
      supervisorsCount: 0,
      monthlyRevenueFormatted: '0',
      monthlyOrders: 0,
      performanceScore: 0,
      targetGMVFormatted: 'Não configurado',
      commissionRate: 'Não configurado',
      lastLogin: 'Não registrado',
      avatar: u.avatarUrl || undefined,
    }));

    return res.json({ success: true, data });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

adminRouter.post('/country-reps', requireGlobalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, phone, countryName, countryCode = 'GW', password } = req.body ?? {};
    const created = await createRealAccount({
      name,
      email,
      phone,
      country: countryCode,
      role: 'COUNTRY_REPRESENTATIVE',
      password,
    });

    await writeRealAudit(req, 'admin.country_representative.created', 'users', created.user.id, {
      email: created.user.email,
      countryCode: created.user.countryCode,
    });

    const data: AdminCountryRepItem & { temporaryPassword: string } = {
      id: created.user.id,
      name: created.user.fullName,
      email: created.user.email,
      phone: created.user.phone || '',
      countryCode: created.user.countryCode,
      countryName: countryName || created.user.countryCode,
      status: 'active',
      assignedSellersCount: 0,
      assignedStoresCount: 0,
      supervisorsCount: 0,
      monthlyRevenueFormatted: '0',
      monthlyOrders: 0,
      performanceScore: 0,
      targetGMVFormatted: req.body?.targetGMV || 'Não configurado',
      commissionRate: req.body?.commissionRate || 'Não configurado',
      lastLogin: 'Nunca',
      avatar: created.user.avatarUrl || undefined,
      temporaryPassword: created.temporaryPassword,
    };

    return res.status(201).json({
      success: true,
      message: `Representante Nacional ${created.user.fullName} criado com acesso real. Senha temporária: ${created.temporaryPassword}`,
      data,
    });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

adminRouter.get('/supervisors', requireGlobalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) throw new AdminRequestError(503, 'Banco de dados indisponível.');

    const [supervisorUsers, regionRows] = await Promise.all([
      db.select().from(users)
        .where(eq(users.role, 'REGIONAL_SUPERVISOR'))
        .orderBy(desc(users.createdAt)),
      db.select().from(regions),
    ]);

    const data: AdminSupervisorItem[] = supervisorUsers.map((u) => {
      const region = regionRows.find((r) =>
        String(r.supervisorEmail || '').toLowerCase() === String(u.email || '').toLowerCase()
      );
      return {
        id: u.id,
        name: u.fullName,
        email: u.email,
        phone: u.phone || '',
        regionId: region?.id || '',
        regionName: region?.name || 'Região não atribuída',
        countryCode: u.countryCode,
        status: u.isActive ? 'active' : 'suspended',
        assignedHubsCount: 0,
        deliveriesToday: 0,
        performanceRating: 0,
        activeCouriersCount: 0,
        monthlyDeliveries: 0,
        lastActive: 'Não registrado',
      };
    });

    return res.json({ success: true, data });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

adminRouter.post('/supervisors', requireGlobalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, phone, regionName, countryCode = 'GW', password } = req.body ?? {};
    const created = await createRealAccount({
      name,
      email,
      phone,
      country: countryCode,
      role: 'REGIONAL_SUPERVISOR',
      password,
    });

    const db = getDb();
    let linkedRegion: any = null;
    if (db && regionName) {
      const countryRegions = await db.select().from(regions).where(eq(regions.countryCode, normalizeCountry(countryCode)));
      const wanted = String(regionName).trim().toLowerCase();
      linkedRegion = countryRegions.find((r) => String(r.name || '').trim().toLowerCase() === wanted) || null;
      if (linkedRegion) {
        await db.update(regions).set({
          supervisorName: created.user.fullName,
          supervisorEmail: created.user.email,
        }).where(eq(regions.id, linkedRegion.id));
      }
    }

    await writeRealAudit(req, 'admin.regional_supervisor.created', 'users', created.user.id, {
      email: created.user.email,
      countryCode: created.user.countryCode,
      regionId: linkedRegion?.id || null,
    });

    const data: AdminSupervisorItem & { temporaryPassword: string } = {
      id: created.user.id,
      name: created.user.fullName,
      email: created.user.email,
      phone: created.user.phone || '',
      regionId: linkedRegion?.id || '',
      regionName: linkedRegion?.name || regionName || 'Região não atribuída',
      countryCode: created.user.countryCode,
      status: 'active',
      assignedHubsCount: 0,
      deliveriesToday: 0,
      performanceRating: 0,
      activeCouriersCount: 0,
      monthlyDeliveries: 0,
      lastActive: 'Nunca',
      temporaryPassword: created.temporaryPassword,
    };

    const regionNote = linkedRegion
      ? ` Região ${linkedRegion.name} vinculada.`
      : ' A conta foi criada; a região poderá ser vinculada quando houver uma região com esse nome no cadastro.';

    return res.status(201).json({
      success: true,
      message: `Supervisor Regional ${created.user.fullName} criado com acesso real. Senha temporária: ${created.temporaryPassword}.${regionNote}`,
      data,
    });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

// ==========================================
// 8. COUNTRIES & REGIONS - REAL POSTGRESQL
// ==========================================
adminRouter.get('/countries', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) throw new AdminRequestError(503, 'Banco de dados indisponível.');
    const rows = await db.select().from(countries).orderBy(countries.name);
    return res.json({ success: true, data: rows });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

adminRouter.post('/countries', requireGlobalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) throw new AdminRequestError(503, 'Banco de dados indisponível.');
    const { name, code, flag, currency, currencySymbol, phonePrefix } = req.body ?? {};
    if (!name || !code) throw new AdminRequestError(400, 'Nome e código do país são obrigatórios.');
    if (!currency || !phonePrefix) {
      throw new AdminRequestError(400, 'Moeda (currency) e DDI (phonePrefix) são obrigatórios — não é permitido cadastrar país com valores padrão genéricos.');
    }

    const countryCode = String(code).trim().toUpperCase();
    const countryName = String(name).trim();
    const countryCurrency = String(currency).trim().toUpperCase();
    const countryPhonePrefix = String(phonePrefix).trim();

    // Cross-check code/name/currency/phonePrefix against the known ISO reference catalog.
    // This is a validation aid only — it does not decide which countries are operational,
    // it only blocks internally-inconsistent combinations (e.g. "Gâmbia" + code BJ + currency XOF).
    const validation = validateCountryAgainstReference({
      code: countryCode,
      name: countryName,
      currency: countryCurrency,
      phonePrefix: countryPhonePrefix,
    });
    if (!validation.ok) {
      throw new AdminRequestError(400, validation.message || 'Combinação de dados do país inválida.');
    }

    const existing = await db.select().from(countries).where(eq(countries.code, countryCode)).limit(1);
    if (existing.length > 0) {
      throw new AdminRequestError(409, `Já existe um país cadastrado com o código "${countryCode}" (${existing[0].name}).`);
    }

    const inserted = await db.insert(countries).values({
      id: countryCode,
      code: countryCode,
      name: countryName,
      flag: String(flag || '🌍').trim(),
      currency: countryCurrency,
      currencySymbol: String(currencySymbol || countryCurrency).trim(),
      phonePrefix: countryPhonePrefix,
      isActive: true,
      createdAt: new Date(),
    }).returning();

    await writeRealAudit(req, 'admin.country.created', 'countries', countryCode, { name, code: countryCode });

    return res.status(201).json({
      success: true,
      message: `País ${name} cadastrado com sucesso!`,
      data: inserted[0],
    });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

adminRouter.patch('/countries/:code/status', requireGlobalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) throw new AdminRequestError(503, 'Banco de dados indisponível.');
    const targetCode = String(req.params.code).toUpperCase();
    const rows = await db.select().from(countries).where(eq(countries.code, targetCode)).limit(1);
    if (!rows.length) throw new AdminRequestError(404, 'País não encontrado.');

    const current = rows[0];
    const newStatus = typeof req.body?.isActive === 'boolean' ? req.body.isActive : !current.isActive;

    const updated = await db.update(countries)
      .set({ isActive: newStatus })
      .where(eq(countries.code, targetCode))
      .returning();

    await writeRealAudit(req, 'admin.country.status_updated', 'countries', targetCode, { isActive: newStatus });

    return res.json({
      success: true,
      message: `Status do país ${current.name} alterado com sucesso.`,
      data: updated[0],
    });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

adminRouter.get('/regions', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) throw new AdminRequestError(503, 'Banco de dados indisponível.');
    const rows = await db.select().from(regions).orderBy(regions.name);
    return res.json({ success: true, data: rows });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

adminRouter.post('/regions', requireGlobalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) throw new AdminRequestError(503, 'Banco de dados indisponível.');
    const { name, countryCode = 'GW', supervisorName, supervisorEmail, deliveryCoverageDays, freightBaseRate } = req.body ?? {};
    if (!name) throw new AdminRequestError(400, 'Nome da região é obrigatório.');

    const id = `reg_${Date.now()}_${randomBytes(2).toString('hex')}`;
    const inserted = await db.insert(regions).values({
      id,
      name: String(name).trim(),
      countryCode: normalizeCountry(countryCode),
      supervisorName: supervisorName ? String(supervisorName).trim() : null,
      supervisorEmail: supervisorEmail ? String(supervisorEmail).trim() : null,
      deliveryCoverageDays: deliveryCoverageDays ? String(deliveryCoverageDays).trim() : null,
      freightBaseRate: freightBaseRate ? String(freightBaseRate).trim() : null,
      status: 'active',
      createdAt: new Date(),
    }).returning();

    await writeRealAudit(req, 'admin.region.created', 'regions', id, { name, countryCode });

    return res.status(201).json({
      success: true,
      message: `Região ${name} cadastrada com sucesso!`,
      data: inserted[0],
    });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

// ==========================================
// 9. AUDIT LOGS & PLATFORM SETTINGS - REAL POSTGRESQL
// ==========================================
adminRouter.get('/audit', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) throw new AdminRequestError(503, 'Banco de dados indisponível.');

    const logs = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100);

    const formatted = logs.map((l: any) => ({
      id: l.id,
      userName: l.actorUserId || 'Sistema',
      userRole: 'Audit Log',
      action: l.action,
      entity: `${l.resource}${l.resourceId ? ` (#${l.resourceId})` : ''}`,
      previousValue: 'N/A',
      newValue: 'Executado',
      ipAddress: l.ipAddress || '127.0.0.1',
      country: l.countryCode || 'GW',
      timestamp: l.createdAt instanceof Date ? l.createdAt.toLocaleString('pt-PT') : String(l.createdAt),
      result: 'sucesso',
    }));

    return res.json({ success: true, data: formatted });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

adminRouter.get('/settings', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) throw new AdminRequestError(503, 'Banco de dados indisponível.');

    const rows = await db.select().from(platformSettings);
    const settingsMap: Record<string, any> = {};
    for (const row of rows) {
      settingsMap[row.key] = row.valueJson;
    }

    const data = {
      platformName: settingsMap.platformName || 'Mercado Nusali CPLP',
      escrowHoldingHours: settingsMap.escrowHoldingHours || 48,
      defaultBuyerProtectionFeePercent: settingsMap.defaultBuyerProtectionFeePercent || 1.5,
      // Correção crítica (comissão default do Admin): "|| 5.0" fingia que
      // 5% já estava configurado mesmo quando NENHUMA linha existe em
      // platformSettings — orderService.ts (cadeia real de comissão) não
      // usa esse fallback, então um admin via "5.0" aqui enquanto o
      // checkout real bloqueava com COMMISSION_NOT_CONFIGURED. Agora
      // reflete o estado real: null = genuinamente não configurado ainda.
      defaultSellerCommissionPercent: settingsMap.defaultSellerCommissionPercent ?? null,
      maintenanceMode: !!settingsMap.maintenanceMode,
      supportedCurrencies: settingsMap.supportedCurrencies || ['XOF', 'BRL', 'EUR', 'AOA', 'MZN', 'CVE', 'STN', 'USD'],
    };

    return res.json({ success: true, data });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

adminRouter.post('/settings', requireGlobalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) throw new AdminRequestError(503, 'Banco de dados indisponível.');

    const payload = req.body ?? {};
    for (const [key, value] of Object.entries(payload)) {
      await db.insert(platformSettings).values({
        key,
        valueJson: value,
        description: `Configuração global: ${key}`,
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: platformSettings.key,
        set: { valueJson: value, updatedAt: new Date() },
      });
    }

    await writeRealAudit(req, 'admin.settings.updated', 'platform_settings', 'global', payload);

    return res.json({
      success: true,
      message: 'Configurações globais salvas no banco de dados com sucesso!',
      data: payload,
    });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

// ============================================================================
// CATEGORIES MANAGEMENT
// ============================================================================

adminRouter.get('/categories', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) throw new AdminRequestError(503, 'Banco de dados indisponível.');

    const categoryList = await db
      .select()
      .from(categories)
      .orderBy(asc(categories.displayOrder), asc(categories.name));

    const productCounts = await db
      .select({
        categoryId: products.categoryId,
        total: count(products.id),
      })
      .from(products)
      .groupBy(products.categoryId);

    const countsMap = new Map(productCounts.map((p) => [p.categoryId, p.total]));

    const formatted = categoryList.map((cat) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      icon: cat.icon || 'Tag',
      parentId: cat.parentId,
      displayOrder: cat.displayOrder ?? 0,
      isActive: cat.isActive,
      prods: countsMap.get(cat.id) || countsMap.get(cat.slug) || 0,
      status: cat.isActive ? 'Ativa' : 'Inativa',
      createdAt: cat.createdAt,
    }));

    return res.json({ success: true, data: formatted });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

adminRouter.post('/categories', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) throw new AdminRequestError(503, 'Banco de dados indisponível.');

    const { name, slug, icon, parentId, displayOrder, isActive } = req.body ?? {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new AdminRequestError(400, 'O nome da categoria é obrigatório.');
    }

    const cleanName = name.trim();
    const generatedSlug = (slug || cleanName)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');

    const catId = req.body.id || `cat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const realParentId = parentId || null;

    if (realParentId) {
      const allCats = await db.select().from(categories);
      const parentExists = allCats.some((c) => c.id === realParentId);
      if (!parentExists) {
        throw new AdminRequestError(400, 'A categoria pai selecionada não existe.');
      }
      if (wouldCreateCycle(catId, realParentId, allCats as any)) {
        throw new AdminRequestError(
          400,
          'Operação bloqueada: Uma categoria não pode ser pai dela mesma nem filha de um dos seus descendentes.'
        );
      }
    }

    const newCategory = {
      id: catId,
      name: cleanName,
      slug: generatedSlug,
      icon: icon || 'Tag',
      parentId: realParentId,
      displayOrder: Number(displayOrder) || 0,
      isActive: isActive !== false,
      createdAt: new Date(),
    };

    await db.insert(categories).values(newCategory).onConflictDoUpdate({
      target: categories.id,
      set: {
        name: newCategory.name,
        slug: newCategory.slug,
        icon: newCategory.icon,
        parentId: newCategory.parentId,
        displayOrder: newCategory.displayOrder,
        isActive: newCategory.isActive,
      },
    });

    await delCache('catalog:categories');

    await writeRealAudit(req, 'admin.category.created', 'categories', newCategory.id, newCategory);

    return res.json({
      success: true,
      message: `Categoria "${cleanName}" criada com sucesso no PostgreSQL/Supabase!`,
      data: newCategory,
    });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

adminRouter.patch('/categories/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) throw new AdminRequestError(503, 'Banco de dados indisponível.');

    const { id } = req.params;
    const { name, slug, icon, parentId, displayOrder, isActive, commissionRate } = req.body ?? {};

    const [existing] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
    if (!existing) {
      throw new AdminRequestError(404, 'Categoria não encontrada.');
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = String(name).trim();
    if (slug !== undefined) {
      updateData.slug = String(slug)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
    }
    if (icon !== undefined) updateData.icon = icon;
    if (parentId !== undefined) {
      const newParentId = parentId || null;
      if (newParentId) {
        const allCats = await db.select().from(categories);
        const parentExists = allCats.some((c) => c.id === newParentId);
        if (!parentExists) {
          throw new AdminRequestError(400, 'A categoria pai selecionada não existe.');
        }
        if (wouldCreateCycle(id, newParentId, allCats as any)) {
          throw new AdminRequestError(
            400,
            'Operação bloqueada: Uma categoria não pode ser pai dela mesma nem filha de um dos seus descendentes.'
          );
        }
      }
      updateData.parentId = newParentId;
    }
    if (displayOrder !== undefined) updateData.displayOrder = Number(displayOrder);
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);
    // Fase "Comissão percentual + logística real": comissão por categoria —
    // SEMPRE percentual (nunca valor fixo em dinheiro), null explícito
    // remove a taxa da categoria (volta a cair para sellers.commissionRate).
    if (commissionRate !== undefined) {
      if (commissionRate === null || commissionRate === '') {
        updateData.commissionRate = null;
      } else {
        const rate = Number(commissionRate);
        if (isNaN(rate) || rate < 0 || rate > 100) {
          throw new AdminRequestError(400, 'A comissão da categoria deve ser um percentual entre 0 e 100.');
        }
        updateData.commissionRate = String(rate);
      }
    }

    await db.update(categories).set(updateData).where(eq(categories.id, id));
    await delCache('catalog:categories');

    await writeRealAudit(req, 'admin.category.updated', 'categories', id, updateData);

    const [updated] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
    return res.json({
      success: true,
      message: `Categoria "${updated?.name}" atualizada com sucesso!`,
      data: updated,
    });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

adminRouter.delete('/categories/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) throw new AdminRequestError(503, 'Banco de dados indisponível.');

    const { id } = req.params;
    const [existing] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
    if (!existing) {
      throw new AdminRequestError(404, 'Categoria não encontrada.');
    }

    const subCategories = await db.select().from(categories).where(eq(categories.parentId, id));
    if (subCategories.length > 0) {
      throw new AdminRequestError(
        400,
        `Esta categoria possui ${subCategories.length} subcategoria(s) associada(s) e não pode ser excluída. Desative-a ou exclua/realoque as subcategorias primeiro.`
      );
    }

    const prodRefs = await db.select().from(products).where(eq(products.categoryId, id));
    if (prodRefs.length > 0) {
      throw new AdminRequestError(
        400,
        `Esta categoria possui ${prodRefs.length} produto(s) associado(s) e não pode ser excluída. Desative-a para preservar o histórico do catálogo.`
      );
    }

    await db.delete(categories).where(eq(categories.id, id));
    await delCache('catalog:categories');
    await writeRealAudit(req, 'admin.category.deleted', 'categories', id, { name: existing.name });

    return res.json({
      success: true,
      message: `Categoria "${existing.name}" removida com sucesso!`,
    });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

// ============================================================================
// CATEGORY ATTRIBUTES MANAGEMENT
// ============================================================================

// GET /admin/categories/:id/attributes
adminRouter.get('/categories/:id/attributes', requireAuth, async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) throw new AdminRequestError(503, 'Banco de dados indisponível.');

    const { id } = req.params;

    const list = await db
      .select()
      .from(categoryAttributes)
      .where(eq(categoryAttributes.categoryId, id))
      .orderBy(asc(categoryAttributes.sortOrder), asc(categoryAttributes.name));

    return res.json({
      success: true,
      data: list,
    });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

// POST /admin/categories/:id/attributes
adminRouter.post('/categories/:id/attributes', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) throw new AdminRequestError(503, 'Banco de dados indisponível.');

    const { id: categoryId } = req.params;
    const {
      name,
      code,
      type,
      isRequired,
      optionsJson,
      placeholder,
      helpText,
      unit,
      sortOrder,
      isActive,
    } = req.body ?? {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new AdminRequestError(400, 'O nome do atributo é obrigatório.');
    }

    const cleanName = name.trim();
    const cleanCode = (code || cleanName)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/(^_|_$)+/g, '');

    const attrId = req.body.id || `attr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    let parsedOptions = optionsJson;
    if (typeof optionsJson === 'string') {
      try {
        parsedOptions = JSON.parse(optionsJson);
      } catch {
        parsedOptions = optionsJson.split('\n').map((s: string) => s.trim()).filter(Boolean);
      }
    }

    const newAttr = {
      id: attrId,
      categoryId,
      name: cleanName,
      code: cleanCode,
      type: type || 'text',
      isRequired: Boolean(isRequired),
      optionsJson: parsedOptions || null,
      placeholder: placeholder || null,
      helpText: helpText || null,
      unit: unit || null,
      sortOrder: Number(sortOrder) || 0,
      isActive: isActive !== false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(categoryAttributes).values(newAttr).onConflictDoUpdate({
      target: categoryAttributes.id,
      set: {
        name: newAttr.name,
        code: newAttr.code,
        type: newAttr.type,
        isRequired: newAttr.isRequired,
        optionsJson: newAttr.optionsJson,
        placeholder: newAttr.placeholder,
        helpText: newAttr.helpText,
        unit: newAttr.unit,
        sortOrder: newAttr.sortOrder,
        isActive: newAttr.isActive,
        updatedAt: new Date(),
      },
    });

    await delCache(`catalog:categories:${categoryId}:attributes`);

    return res.json({
      success: true,
      message: `Atributo "${cleanName}" salvo com sucesso!`,
      data: newAttr,
    });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

// PATCH /admin/category-attributes/:id
adminRouter.patch('/category-attributes/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) throw new AdminRequestError(503, 'Banco de dados indisponível.');

    const { id } = req.params;
    const {
      name,
      code,
      type,
      isRequired,
      optionsJson,
      placeholder,
      helpText,
      unit,
      sortOrder,
      isActive,
    } = req.body ?? {};

    const [existing] = await db.select().from(categoryAttributes).where(eq(categoryAttributes.id, id)).limit(1);
    if (!existing) {
      throw new AdminRequestError(404, 'Atributo não encontrado.');
    }

    const updateData: any = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = String(name).trim();
    if (code !== undefined) {
      updateData.code = String(code)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/(^_|_$)+/g, '');
    }
    if (type !== undefined) updateData.type = type;
    if (isRequired !== undefined) updateData.isRequired = Boolean(isRequired);
    if (optionsJson !== undefined) {
      let parsedOptions = optionsJson;
      if (typeof optionsJson === 'string') {
        try {
          parsedOptions = JSON.parse(optionsJson);
        } catch {
          parsedOptions = optionsJson.split('\n').map((s: string) => s.trim()).filter(Boolean);
        }
      }
      updateData.optionsJson = parsedOptions;
    }
    if (placeholder !== undefined) updateData.placeholder = placeholder || null;
    if (helpText !== undefined) updateData.helpText = helpText || null;
    if (unit !== undefined) updateData.unit = unit || null;
    if (sortOrder !== undefined) updateData.sortOrder = Number(sortOrder);
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    await db.update(categoryAttributes).set(updateData).where(eq(categoryAttributes.id, id));
    await delCache(`catalog:categories:${existing.categoryId}:attributes`);

    const [updated] = await db.select().from(categoryAttributes).where(eq(categoryAttributes.id, id)).limit(1);
    return res.json({
      success: true,
      message: `Atributo "${updated?.name}" atualizado com sucesso!`,
      data: updated,
    });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

// DELETE /admin/category-attributes/:id
adminRouter.delete('/category-attributes/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) throw new AdminRequestError(503, 'Banco de dados indisponível.');

    const { id } = req.params;
    const [existing] = await db.select().from(categoryAttributes).where(eq(categoryAttributes.id, id)).limit(1);
    if (!existing) {
      throw new AdminRequestError(404, 'Atributo não encontrado.');
    }

    await db.delete(categoryAttributes).where(eq(categoryAttributes.id, id));
    await delCache(`catalog:categories:${existing.categoryId}:attributes`);

    return res.json({
      success: true,
      message: `Atributo "${existing.name}" removido com sucesso!`,
    });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

// ==========================================
// NUSALI HUB FULFILLMENT LOGISTICS
// ==========================================

// GET /admin/logistics/fulfillment/orders
adminRouter.get('/logistics/fulfillment/orders', requireLogisticsStaff, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.json({ success: true, data: [] });

    const { warehouseId, status } = req.query;

    const conditions = [eq(orderItems.fulfillmentMode, 'NUSALI_FULFILLMENT')];
    if (warehouseId && String(warehouseId) !== 'ALL') {
      conditions.push(eq(orderItems.warehouseId, String(warehouseId)));
    }

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
        inventoryId: orderItems.inventoryId,
        warehouseId: orderItems.warehouseId,
        fulfillmentMode: orderItems.fulfillmentMode,
        itemStatus: orderItems.status,
        orderStatus: orders.status,
        paymentStatus: orders.paymentStatus,
        escrowStatus: orders.escrowStatus,
        paymentMethod: orders.paymentMethod,
        shippingAddressJson: orders.shippingAddressJson,
        createdAt: orders.createdAt,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(and(...conditions))
      .orderBy(desc(orders.createdAt));

    const whRows = await db.select().from(warehouses);
    const whMap = new Map(whRows.map(w => [w.id, w]));

    const mapped = items.map((item) => {
      const addr = (item.shippingAddressJson as any) || {};
      const wh = item.warehouseId ? whMap.get(item.warehouseId) : null;

      return {
        id: item.orderItemId,
        orderItemId: item.orderItemId,
        orderId: item.orderId,
        orderNumber: item.orderNumber,
        buyerName: addr.recipientName || 'Não informado',
        buyerPhone: addr.phone || 'Não informado',
        buyerAddress: `${addr.street || ''}, ${addr.number || ''} ${addr.neighborhood || ''} - ${addr.city || ''} (${addr.countryCode || addr.country || 'Não informado'})`.trim(),
        productId: item.productId,
        productTitle: item.productTitle,
        productSku: item.productSku || item.productId,
        productImage: item.productImage,
        variantTitle: item.variantTitle,
        quantityReservedAtHub: item.quantity,
        warehouseId: item.warehouseId,
        warehouseName: wh?.name || item.warehouseId || 'Não informado',
        warehouseCity: wh?.city || null,
        fulfillmentMode: item.fulfillmentMode,
        paymentStatus: item.paymentStatus,
        escrowStatus: item.escrowStatus,
        paymentMethod: item.paymentMethod || null,
        status: item.itemStatus || item.orderStatus,
        createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : new Date().toISOString(),
      };
    });

    const filtered = status && status !== 'todos'
      ? mapped.filter(i => i.status === status)
      : mapped;

    return res.json({ success: true, data: filtered });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

// POST /admin/dev/payments/:orderId/confirm (Dev Simulator Only for Admin/Logistics Staff)
adminRouter.post('/dev/payments/:orderId/confirm', requireAdminDevSimulator, async (req: AuthRequest, res: Response) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'SIMULATOR_DISABLED_IN_PRODUCTION',
          message: 'O simulador de pagamento está desabilitado em ambiente de produção.',
        },
      });
    }

    const { orderId } = req.params;
    const result = await PaymentService.confirmOrderPayment(orderId, {
      provider: 'DEV_SIMULATOR',
      performedBy: req.user?.id,
    });

    return res.json({
      success: true,
      message: 'Pagamento simulado e confirmado com sucesso em ambiente de desenvolvimento.',
      data: result.data,
    });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

// POST /admin/logistics/fulfillment/orders/:orderItemId/status
adminRouter.post('/logistics/fulfillment/orders/:orderItemId/status', requireLogisticsStaff, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) throw new AdminRequestError(503, 'Banco de dados indisponível.');

    const { orderItemId } = req.params;
    const { status } = req.body;

    const items = await db.select().from(orderItems).where(eq(orderItems.id, orderItemId)).limit(1);
    if (items.length === 0) {
      throw new AdminRequestError(404, 'Item de pedido não encontrado.');
    }

    const item = items[0];
    if (item.fulfillmentMode !== 'NUSALI_FULFILLMENT') {
      throw new AdminRequestError(400, 'Este item não é de fulfillment NUSALI_HUB.');
    }

    // Requirement 3: BLOQUEAR HUB SEM PAGAMENTO CONFIRMADO
    const parentOrders = await db
      .select({ id: orders.id, status: orders.status, paymentStatus: orders.paymentStatus })
      .from(orders)
      .where(eq(orders.id, item.orderId))
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

    const previousStatus = item.status;
    const newStatus = status === 'shipped' || status === 'enviado' ? 'shipped' : status || 'preparing';

    if (newStatus === 'shipped') {
      await db.transaction(async (tx) => {
        await ShipmentService.executePhysicalDispatch(tx, item.id, req.user!.id);
      });
    } else {
      await db.transaction(async (tx) => {
        await tx
          .update(orderItems)
          .set({ status: newStatus })
          .where(eq(orderItems.id, item.id));

        if (newStatus === 'ready_to_ship') {
          await ShipmentService.createOrGetShipmentForOrderItem(tx, item.id, req.user!.id);
        }

        await syncOrderFulfillmentStatus(item.orderId, tx);
      });
    }

    return res.json({
      success: true,
      message: 'Status do item de fulfillment do HUB atualizado com sucesso!',
    });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

// GET /admin/logistics/shipments (Expedição & Entregas real dashboard list)
adminRouter.get('/logistics/shipments', requireLogisticsStaff, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) throw new AdminRequestError(503, 'Banco de dados indisponível.');

    const { status, fulfillmentMode, countryCode, search } = req.query as Record<string, string>;

    const normalizeFilter = (val?: string) =>
      !val || val.trim() === '' || val.trim().toLowerCase() === 'todos' || val.trim().toLowerCase() === 'all'
        ? undefined
        : val.trim();

    const normStatus = normalizeFilter(status);
    const normMode = normalizeFilter(fulfillmentMode);
    const normCountry = normalizeFilter(countryCode);
    const normSearch = normalizeFilter(search);

    const allShipments = await db.select().from(shipments).orderBy(desc(shipments.createdAt));

    const [allOrders, allOrderItems, allProducts, allSellers, allWarehouses, allUsers] = await Promise.all([
      db.select().from(orders),
      db.select().from(orderItems),
      db.select().from(products),
      db.select().from(sellers),
      db.select().from(warehouses),
      db.select().from(users),
    ]);

    const orderMap = new Map(allOrders.map(o => [o.id, o]));
    const itemMap = new Map(allOrderItems.map(i => [i.id, i]));
    const productMap = new Map(allProducts.map(p => [p.id, p]));
    const sellerMap = new Map(allSellers.map(s => [s.id, s]));
    const whMap = new Map(allWarehouses.map(w => [w.id, w]));
    const userMap = new Map(allUsers.map(u => [u.id, u]));

    const mapped = allShipments.map(shp => {
      const parentOrder = orderMap.get(shp.orderId);
      const item = shp.orderItemId ? itemMap.get(shp.orderItemId) : null;
      const product = item ? productMap.get(item.productId) : null;
      const seller = shp.sellerId ? sellerMap.get(shp.sellerId) : (item?.sellerId ? sellerMap.get(item.sellerId) : null);
      const warehouse = shp.originWarehouseId ? whMap.get(shp.originWarehouseId) : (item?.warehouseId ? whMap.get(item.warehouseId) : null);
      const buyer = shp.buyerId ? userMap.get(shp.buyerId) : (parentOrder?.buyerId ? userMap.get(parentOrder.buyerId) : null);

      const recipientAddr = (shp.recipientAddressJson as any) || (parentOrder?.shippingAddressJson as any) || {};

      let originName = shp.senderName || 'Origem não informada';
      if (shp.fulfillmentMode === 'NUSALI_FULFILLMENT') {
        if (warehouse?.name) {
          originName = `HUB ${warehouse.name}`;
        }
      } else if (seller) {
        originName = seller.tradingName || seller.companyName || 'Loja do Vendedor';
      }

      const destCity = recipientAddr.city || shp.recipientAddressJson?.city || null;
      const destCountry = recipientAddr.countryCode || recipientAddr.country || shp.destinationCountry || null;

      return {
        id: shp.id,
        orderId: shp.orderId,
        orderNumber: parentOrder?.orderNumber || `PED-${shp.orderId.slice(-6)}`,
        orderItemId: shp.orderItemId,
        trackingNumber: shp.trackingNumber,
        carrier: shp.carrier || null,
        status: shp.status,
        fulfillmentMode: shp.fulfillmentMode,
        productTitle: item?.productTitle || product?.title || 'Produto não informado',
        quantity: item?.quantity || 1,
        productImage: item?.productImage || (product as any)?.imagesJson?.[0] || null,
        weight: (product as any)?.weight ? `${(product as any).weight} kg` : null,
        dimensions: (product as any)?.dimensions ? (product as any).dimensions : null,
        originName,
        originCountry: shp.originCountry || null,
        destinationCity: destCity,
        destinationCountry: destCountry,
        recipientName: shp.recipientName || recipientAddr.recipientName || buyer?.fullName || 'Destinatário não informado',
        recipientAddress: recipientAddr,
        senderName: shp.senderName || originName,
        senderAddress: shp.senderAddressJson || {},
        shippedAt: shp.shippedAt,
        deliveredAt: shp.deliveredAt,
        failureReason: shp.failureReason,
        createdAt: shp.createdAt,
      };
    });

    // Escopo territorial (fechamento RBAC): nunca aceita o país vindo de
    // query/body — o escopo autorizado vem exclusivamente de req.user (JWT).
    // Aplicado ANTES do filtro opcional ?countryCode=, que só pode restringir
    // ainda mais dentro do escopo, nunca ampliá-lo.
    const shipmentScope = resolveAdministrativeScope(req.user);
    let filtered = mapped.filter(s => isShipmentWithinScope(shipmentScope, s.originCountry, s.destinationCountry));

    if (normStatus) {
      const stUpper = normStatus.toUpperCase();
      filtered = filtered.filter(s => s.status.toUpperCase() === stUpper);
    }

    if (normMode) {
      filtered = filtered.filter(s => s.fulfillmentMode === normMode);
    }

    if (normCountry) {
      filtered = filtered.filter(s => s.originCountry === normCountry || s.destinationCountry === normCountry);
    }

    if (normSearch) {
      const q = normSearch.toLowerCase();
      filtered = filtered.filter(s =>
        s.orderNumber.toLowerCase().includes(q) ||
        s.trackingNumber.toLowerCase().includes(q) ||
        s.productTitle.toLowerCase().includes(q) ||
        s.recipientName.toLowerCase().includes(q) ||
        s.originName.toLowerCase().includes(q)
      );
    }

    return res.json({ success: true, data: filtered });
  } catch (error) {
    return sendAdminError(res, error);
  }
});

// PATCH /admin/logistics/shipments/:shipmentId/status
adminRouter.patch('/logistics/shipments/:shipmentId/status', requireLogisticsStaff, async (req: AuthRequest, res: Response) => {
  try {
    const { shipmentId } = req.params;
    const { status, location, description, failureReason, receivedBy } = req.body;

    const result = await ShipmentService.updateShipmentStatus(shipmentId, status, {
      performedBy: req.user!.id,
      location,
      description,
      failureReason,
      receivedBy,
    });

    return res.json(result);
  } catch (error: any) {
    return sendAdminError(res, error);
  }
});

// GET /admin/logistics/shipments/:shipmentId/details
adminRouter.get('/logistics/shipments/:shipmentId/details', requireLogisticsStaff, async (req: AuthRequest, res: Response) => {
  try {
    const { shipmentId } = req.params;
    const details = await ShipmentService.getShipmentWithEvents(shipmentId);
    const scope = resolveAdministrativeScope(req.user);
    assertShipmentScopeAccess(scope, (details as any)?.originCountry, (details as any)?.destinationCountry);
    return res.json({ success: true, data: details });
  } catch (error: any) {
    return sendAdminError(res, error);
  }
});

// ==========================================
// TARIFAS DE FRETE (shipping_rates) — Painel Admin
// ==========================================
// Reaproveita 100% a tabela shipping_rates já usada pelo
// ShippingCalculatorService (checkout/carrinho/produto) — nenhuma tabela
// nova. Boundaries são INCLUSIVE-INCLUSIVE dos dois lados, exatamente como
// getRawShippingRate já consulta (lte(minWeightKg, peso) AND
// gte(maxWeightKg, peso)) — não alterado aqui, só respeitado.

export async function validateShippingRateInput(db: any, body: any, isPartial: boolean) {
  const errors: string[] = [];
  const out: any = {};

  if (body.originCountry !== undefined || !isPartial) {
    const origin = String(body.originCountry || '').trim().toUpperCase();
    if (!origin) errors.push('País de origem é obrigatório.');
    else out.originCountry = origin;
  }
  if (body.destinationCountry !== undefined || !isPartial) {
    const destination = String(body.destinationCountry || '').trim().toUpperCase();
    if (!destination) errors.push('País de destino é obrigatório.');
    else out.destinationCountry = destination;
  }
  if (body.currency !== undefined || !isPartial) {
    const currency = String(body.currency || '').trim().toUpperCase();
    if (!currency) errors.push('Moeda é obrigatória.');
    else out.currency = currency;
  }
  if (body.price !== undefined || !isPartial) {
    const numPrice = Number(body.price);
    if (isNaN(numPrice) || numPrice < 0) errors.push('O preço da tarifa deve ser um número maior ou igual a zero.');
    else out.price = String(numPrice.toFixed(2));
  }
  if (body.minWeightKg !== undefined || !isPartial) {
    const numMinWeight = Number(body.minWeightKg ?? 0);
    if (isNaN(numMinWeight) || numMinWeight < 0) errors.push('O peso mínimo deve ser um número maior ou igual a zero.');
    else out.minWeightKg = String(numMinWeight.toFixed(3));
  }
  if (body.maxWeightKg !== undefined || !isPartial) {
    const numMaxWeight = Number(body.maxWeightKg);
    if (isNaN(numMaxWeight)) errors.push('O peso máximo é obrigatório e deve ser um número.');
    else out.maxWeightKg = String(numMaxWeight.toFixed(3));
  }
  if (out.minWeightKg !== undefined && out.maxWeightKg !== undefined) {
    if (Number(out.maxWeightKg) <= Number(out.minWeightKg)) {
      errors.push('O peso máximo deve ser estritamente maior que o peso mínimo.');
    }
  }
  if (body.estimatedMinDays !== undefined) {
    const n = Number(body.estimatedMinDays);
    if (isNaN(n) || n < 0) errors.push('Prazo mínimo estimado inválido.');
    else out.estimatedMinDays = n;
  }
  if (body.estimatedMaxDays !== undefined) {
    const n = Number(body.estimatedMaxDays);
    if (isNaN(n) || n < 0) errors.push('Prazo máximo estimado inválido.');
    else out.estimatedMaxDays = n;
  }
  if (out.estimatedMinDays !== undefined && out.estimatedMaxDays !== undefined && out.estimatedMaxDays < out.estimatedMinDays) {
    errors.push('Prazo máximo estimado não pode ser menor que o mínimo.');
  }
  if (body.originRegion !== undefined) out.originRegion = body.originRegion ? String(body.originRegion).trim().toUpperCase() : null;
  if (body.destinationRegion !== undefined) out.destinationRegion = body.destinationRegion ? String(body.destinationRegion).trim().toUpperCase() : null;
  if (body.serviceType !== undefined) out.serviceType = body.serviceType ? String(body.serviceType).trim() : 'standard';
  if (body.carrierId !== undefined) out.carrierId = body.carrierId || null;
  if (body.isActive !== undefined) out.isActive = Boolean(body.isActive);

  if (errors.length > 0) return { errors, out: null };

  // País deve ser real e ativo — nunca aceitar um código inventado (mesma
  // fonte única de verdade: tabela countries, GET /api/v1/countries).
  const countriesToCheck = [out.originCountry, out.destinationCountry].filter(Boolean);
  if (countriesToCheck.length > 0) {
    const realCountries = await db.select().from(countries).where(inArray(countries.code, countriesToCheck));
    const realActive = new Map<string, any>(realCountries.map((c: any) => [c.code, c]));
    for (const code of countriesToCheck) {
      const c = realActive.get(code);
      if (!c) errors.push(`País "${code}" não está cadastrado como país operacional do Mercado Nusali.`);
      else if (!c.isActive) errors.push(`País "${code}" existe mas não está ativo no momento.`);
    }
    // Moeda deve ser a moeda oficial de algum país operacional real (nunca
    // uma sigla inventada) — mesma fonte, sem lista hardcoded de moedas.
    if (out.currency) {
      const allActiveCountries = await db.select().from(countries).where(eq(countries.isActive, true));
      const validCurrencies = new Set(allActiveCountries.map((c: any) => c.currency));
      if (!validCurrencies.has(out.currency)) {
        errors.push(`Moeda "${out.currency}" não corresponde à moeda oficial de nenhum país operacional ativo.`);
      }
    }
  }

  if (errors.length > 0) return { errors, out: null };
  return { errors: null, out };
}

// Duas faixas de peso [minA,maxA] e [minB,maxB] (ambas INCLUSIVE-INCLUSIVE,
// mesma semântica de getRawShippingRate) se sobrepõem sse minA<=maxB E
// minB<=maxA. Só compara tarifas do MESMO escopo exato (rota+moeda+região+
// serviço) — duas tarifas de especificidade DIFERENTE (ex.: uma genérica de
// país e outra específica de região) podem legitimamente coexistir, porque
// getRawShippingRate já as desempata por especificidade; ambiguidade real só
// existe quando tudo mais é idêntico e só o peso se sobrepõe.
export async function findOverlappingShippingRate(db: any, candidate: any, excludeId?: string) {
  const conditions = [
    eq(shippingRates.originCountry, candidate.originCountry),
    eq(shippingRates.destinationCountry, candidate.destinationCountry),
    eq(shippingRates.currency, candidate.currency),
    eq(shippingRates.isActive, true),
    lte(shippingRates.minWeightKg, candidate.maxWeightKg),
    gte(shippingRates.maxWeightKg, candidate.minWeightKg),
  ];
  if (candidate.originRegion) conditions.push(eq(shippingRates.originRegion, candidate.originRegion));
  else conditions.push(isNull(shippingRates.originRegion));
  if (candidate.destinationRegion) conditions.push(eq(shippingRates.destinationRegion, candidate.destinationRegion));
  else conditions.push(isNull(shippingRates.destinationRegion));
  if (candidate.serviceType) conditions.push(eq(shippingRates.serviceType, candidate.serviceType));
  if (excludeId) conditions.push(ne(shippingRates.id, excludeId));

  const [overlap] = await db.select().from(shippingRates).where(and(...conditions)).limit(1);
  return overlap || null;
}

// GET /admin/shipping-rates
adminRouter.get('/shipping-rates', requireLogisticsStaff, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, message: 'Banco indisponível.' });

    const scope = resolveAdministrativeScope(req.user);
    const allRates = await db.select().from(shippingRates).orderBy(desc(shippingRates.updatedAt));
    // Admin de país escopado (COUNTRY_REPRESENTATIVE/REGIONAL_SUPERVISOR) só
    // vê tarifas que envolvem o próprio país, na origem OU no destino —
    // GLOBAL_ADMIN/ADMIN continuam vendo tudo, comportamento inalterado.
    const rates = scope.kind === 'GLOBAL'
      ? allRates
      : allRates.filter((r: any) => isShippingRateWithinScope(scope, r.originCountry, r.destinationCountry));

    return res.json({ success: true, data: rates });
  } catch (error: any) {
    return sendAdminError(res, error);
  }
});

// GET /admin/shipping-rates/coverage — diagnóstico de lacunas de peso para
// uma rota real (mesmo escopo país+país+moeda que getRawShippingRate usa).
adminRouter.get('/shipping-rates/coverage', requireLogisticsStaff, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, message: 'Banco indisponível.' });

    const originCountry = String(req.query.originCountry || '').trim().toUpperCase();
    const destinationCountry = String(req.query.destinationCountry || '').trim().toUpperCase();
    const currency = String(req.query.currency || '').trim().toUpperCase();
    if (!originCountry || !destinationCountry || !currency) {
      return res.status(400).json({ success: false, error: { code: 'COVERAGE_PARAMS_REQUIRED', message: 'originCountry, destinationCountry e currency são obrigatórios.' } });
    }

    const scope = resolveAdministrativeScope(req.user);
    try {
      assertShippingRateScopeAccess(scope, originCountry, destinationCountry);
    } catch (e) {
      if (e instanceof ScopeError) return res.status(e.status).json({ success: false, error: { code: e.code, message: e.message } });
      throw e;
    }

    const rates = await db.select().from(shippingRates).where(and(
      eq(shippingRates.originCountry, originCountry),
      eq(shippingRates.destinationCountry, destinationCountry),
      eq(shippingRates.currency, currency),
      eq(shippingRates.isActive, true),
    )).orderBy(asc(shippingRates.minWeightKg));

    const segments: Array<{ from: number; to: number; covered: boolean; rateId?: string; price?: number }> = [];
    let cursor = 0;
    for (const r of rates) {
      const min = Number(r.minWeightKg);
      const max = Number(r.maxWeightKg);
      if (min > cursor) {
        segments.push({ from: cursor, to: min, covered: false });
      }
      segments.push({ from: min, to: max, covered: true, rateId: r.id, price: Number(r.price) });
      cursor = Math.max(cursor, max);
    }

    return res.json({ success: true, data: { originCountry, destinationCountry, currency, segments, hasAnyRate: rates.length > 0 } });
  } catch (error: any) {
    return sendAdminError(res, error);
  }
});

// POST /admin/shipping-rates/simulate — chama a MESMA função real usada por
// checkout/carrinho/produto (ShippingCalculatorService.calculateFreight).
// Nunca duplica o cálculo aqui.
adminRouter.post('/shipping-rates/simulate', requireLogisticsStaff, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, message: 'Banco indisponível.' });
    const { originCountry, destinationCountry, originRegion, destinationRegion, weightKg, currency, dimensionsCm, storeId, sellerId } = req.body ?? {};
    const result = await ShippingCalculatorService.calculateFreight({
      originCountry: String(originCountry || ''),
      destinationCountry: String(destinationCountry || ''),
      originRegion: originRegion || undefined,
      destinationRegion: destinationRegion || undefined,
      weightKg: Number(weightKg),
      currency: String(currency || ''),
      dimensionsCm: dimensionsCm || undefined,
      storeId: storeId || undefined,
      sellerId: sellerId || undefined,
      productSubtotal: 0,
    }, db);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    return sendAdminError(res, error);
  }
});

// POST /admin/shipping-rates
adminRouter.post('/shipping-rates', requireShippingRateManager, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, message: 'Banco indisponível.' });
    if (!req.user?.id) return res.status(401).json({ success: false, message: 'Autenticação necessária.' });

    const { errors, out } = await validateShippingRateInput(db, req.body ?? {}, false);
    if (errors) {
      return res.status(400).json({ success: false, error: { code: 'SHIPPING_RATE_INVALID', message: errors.join(' ') } });
    }

    const scope = resolveAdministrativeScope(req.user);
    try {
      assertShippingRateScopeAccess(scope, out.originCountry, out.destinationCountry);
    } catch (e) {
      if (e instanceof ScopeError) return res.status(e.status).json({ success: false, error: { code: e.code, message: e.message } });
      throw e;
    }

    const overlap = await findOverlappingShippingRate(db, out);
    if (overlap) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'SHIPPING_RATE_WEIGHT_RANGE_OVERLAP',
          message: `Já existe uma tarifa ativa (${Number(overlap.minWeightKg)}–${Number(overlap.maxWeightKg)} kg) que cobre parte desta faixa de peso para esta rota.`,
        },
      });
    }

    const newRate = {
      id: `rate_${Date.now()}_${randomBytes(4).toString('hex')}`,
      originCountry: out.originCountry,
      destinationCountry: out.destinationCountry,
      originRegion: out.originRegion ?? null,
      destinationRegion: out.destinationRegion ?? null,
      minWeightKg: out.minWeightKg,
      maxWeightKg: out.maxWeightKg,
      price: out.price,
      currency: out.currency,
      estimatedMinDays: out.estimatedMinDays ?? 1,
      estimatedMaxDays: out.estimatedMaxDays ?? 5,
      carrierId: out.carrierId ?? null,
      serviceType: out.serviceType || 'standard',
      isActive: out.isActive !== undefined ? out.isActive : true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(shippingRates).values(newRate);
    await writeRealAudit(req, 'SHIPPING_RATE_CREATED', 'shipping_rate', newRate.id, { after: newRate });
    return res.json({ success: true, message: 'Tarifa de frete cadastrada com sucesso!', data: newRate });
  } catch (error: any) {
    return sendAdminError(res, error);
  }
});

// PATCH /admin/shipping-rates/:id
adminRouter.patch('/shipping-rates/:id', requireShippingRateManager, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, message: 'Banco indisponível.' });
    if (!req.user?.id) return res.status(401).json({ success: false, message: 'Autenticação necessária.' });

    const { id } = req.params;
    const [existing] = await db.select().from(shippingRates).where(eq(shippingRates.id, id)).limit(1);
    if (!existing) return res.status(404).json({ success: false, error: { code: 'SHIPPING_RATE_NOT_FOUND', message: 'Tarifa não encontrada.' } });

    const scope = resolveAdministrativeScope(req.user);
    try {
      assertShippingRateScopeAccess(scope, existing.originCountry, existing.destinationCountry);
    } catch (e) {
      if (e instanceof ScopeError) return res.status(e.status).json({ success: false, error: { code: e.code, message: e.message } });
      throw e;
    }

    // isActive é tratado pelo endpoint dedicado de toggle (audit action
    // própria) — PATCH genérico continua aceitando o campo por
    // conveniência, mas o toggle é o caminho recomendado no frontend.
    const { errors, out } = await validateShippingRateInput(db, req.body ?? {}, true);
    if (errors) {
      return res.status(400).json({ success: false, error: { code: 'SHIPPING_RATE_INVALID', message: errors.join(' ') } });
    }
    if (Object.keys(out).length === 0) {
      return res.status(400).json({ success: false, error: { code: 'SHIPPING_RATE_NO_CHANGES', message: 'Nenhum campo para atualizar.' } });
    }

    // Se a rota/país mudou, reconfirma o escopo para o país NOVO também.
    const effectiveOrigin = out.originCountry ?? existing.originCountry;
    const effectiveDestination = out.destinationCountry ?? existing.destinationCountry;
    try {
      assertShippingRateScopeAccess(scope, effectiveOrigin, effectiveDestination);
    } catch (e) {
      if (e instanceof ScopeError) return res.status(e.status).json({ success: false, error: { code: e.code, message: e.message } });
      throw e;
    }

    const merged = {
      originCountry: effectiveOrigin,
      destinationCountry: effectiveDestination,
      originRegion: out.originRegion !== undefined ? out.originRegion : existing.originRegion,
      destinationRegion: out.destinationRegion !== undefined ? out.destinationRegion : existing.destinationRegion,
      minWeightKg: out.minWeightKg ?? existing.minWeightKg,
      maxWeightKg: out.maxWeightKg ?? existing.maxWeightKg,
      currency: out.currency ?? existing.currency,
      serviceType: out.serviceType ?? existing.serviceType,
    };
    if (Number(merged.maxWeightKg) <= Number(merged.minWeightKg)) {
      return res.status(400).json({ success: false, error: { code: 'SHIPPING_RATE_INVALID', message: 'O peso máximo deve ser estritamente maior que o peso mínimo.' } });
    }

    const overlap = await findOverlappingShippingRate(db, merged, id);
    if (overlap) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'SHIPPING_RATE_WEIGHT_RANGE_OVERLAP',
          message: `Já existe outra tarifa ativa (${Number(overlap.minWeightKg)}–${Number(overlap.maxWeightKg)} kg) que cobre parte desta faixa de peso para esta rota.`,
        },
      });
    }

    const fieldsToUpdate: any = { ...out, updatedAt: new Date() };
    await db.update(shippingRates).set(fieldsToUpdate).where(eq(shippingRates.id, id));
    const [updated] = await db.select().from(shippingRates).where(eq(shippingRates.id, id)).limit(1);

    await writeRealAudit(req, 'SHIPPING_RATE_UPDATED', 'shipping_rate', id, { before: existing, after: updated });
    return res.json({ success: true, message: 'Tarifa de frete atualizada com sucesso!', data: updated });
  } catch (error: any) {
    return sendAdminError(res, error);
  }
});

// PATCH /admin/shipping-rates/:id/toggle — ativar/desativar com audit action dedicada.
adminRouter.patch('/shipping-rates/:id/toggle', requireShippingRateManager, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, message: 'Banco indisponível.' });
    if (!req.user?.id) return res.status(401).json({ success: false, message: 'Autenticação necessária.' });

    const { id } = req.params;
    const [existing] = await db.select().from(shippingRates).where(eq(shippingRates.id, id)).limit(1);
    if (!existing) return res.status(404).json({ success: false, error: { code: 'SHIPPING_RATE_NOT_FOUND', message: 'Tarifa não encontrada.' } });

    const scope = resolveAdministrativeScope(req.user);
    try {
      assertShippingRateScopeAccess(scope, existing.originCountry, existing.destinationCountry);
    } catch (e) {
      if (e instanceof ScopeError) return res.status(e.status).json({ success: false, error: { code: e.code, message: e.message } });
      throw e;
    }

    const nextActive = req.body?.isActive !== undefined ? Boolean(req.body.isActive) : !existing.isActive;

    if (nextActive) {
      const overlap = await findOverlappingShippingRate(db, existing, id);
      if (overlap) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'SHIPPING_RATE_WEIGHT_RANGE_OVERLAP',
            message: `Não é possível ativar: já existe outra tarifa ativa (${Number(overlap.minWeightKg)}–${Number(overlap.maxWeightKg)} kg) que cobre parte desta faixa de peso.`,
          },
        });
      }
    }

    await db.update(shippingRates).set({ isActive: nextActive, updatedAt: new Date() }).where(eq(shippingRates.id, id));
    const [updated] = await db.select().from(shippingRates).where(eq(shippingRates.id, id)).limit(1);

    await writeRealAudit(req, nextActive ? 'SHIPPING_RATE_ENABLED' : 'SHIPPING_RATE_DISABLED', 'shipping_rate', id, { before: { isActive: existing.isActive }, after: { isActive: nextActive } });
    return res.json({ success: true, message: nextActive ? 'Tarifa ativada.' : 'Tarifa desativada.', data: updated });
  } catch (error: any) {
    return sendAdminError(res, error);
  }
});

// DELETE /admin/shipping-rates/:id — só remove fisicamente se a tarifa NUNCA
// foi usada em nenhum pedido real (orders.shippingRateId). Caso já tenha
// histórico financeiro associado, o histórico não pode ficar órfão —
// recomenda desativar em vez de excluir.
adminRouter.delete('/shipping-rates/:id', requireShippingRateManager, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, message: 'Banco indisponível.' });
    if (!req.user?.id) return res.status(401).json({ success: false, message: 'Autenticação necessária.' });

    const { id } = req.params;
    const [existing] = await db.select().from(shippingRates).where(eq(shippingRates.id, id)).limit(1);
    if (!existing) return res.status(404).json({ success: false, error: { code: 'SHIPPING_RATE_NOT_FOUND', message: 'Tarifa não encontrada.' } });

    const scope = resolveAdministrativeScope(req.user);
    try {
      assertShippingRateScopeAccess(scope, existing.originCountry, existing.destinationCountry);
    } catch (e) {
      if (e instanceof ScopeError) return res.status(e.status).json({ success: false, error: { code: e.code, message: e.message } });
      throw e;
    }

    const [usedInOrder] = await db.select({ id: orders.id }).from(orders).where(eq(orders.shippingRateId, id)).limit(1);
    if (usedInOrder) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'SHIPPING_RATE_DELETE_UNSAFE',
          message: 'Esta tarifa já foi usada em pedidos reais e não pode ser excluída (quebraria o histórico financeiro). Desative-a em vez de excluir.',
        },
      });
    }

    await db.delete(shippingRates).where(eq(shippingRates.id, id));
    await writeRealAudit(req, 'SHIPPING_RATE_DELETED', 'shipping_rate', id, { before: existing });
    return res.json({ success: true, message: 'Tarifa de frete removida.' });
  } catch (error: any) {
    return sendAdminError(res, error);
  }
});

// ==========================================
// POLÍTICA DE FRETE — SUBSÍDIO NUSALI (Fase "Comissão percentual + logística real")
// ==========================================
// MARKETPLACE_FREE_SHIPPING e o teto de subsídio da Nusali são autoridade
// exclusiva do GLOBAL_ADMIN — sellerRoutes.ts já bloqueia sellers de
// escolherem esse modo ("Requirement 12"). Reaproveita a mesma tabela
// store_shipping_policies já usada pelo vendedor, sem criar estrutura nova.
adminRouter.get('/stores/:id/shipping-policy', requireGlobalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, message: 'Banco indisponível.' });
    const { id } = req.params;
    const [store] = await db.select().from(stores).where(eq(stores.id, id)).limit(1);
    if (!store) return res.status(404).json({ success: false, message: 'Loja não encontrada.' });

    const [policy] = await db.select().from(storeShippingPolicies).where(eq(storeShippingPolicies.storeId, id)).limit(1);
    return res.json({
      success: true,
      data: policy || { storeId: id, mode: null, marketplaceSubsidyMaxAmount: null, marketplaceSubsidyPercent: null, isActive: false },
    });
  } catch (error: any) {
    return sendAdminError(res, error);
  }
});

adminRouter.post('/stores/:id/shipping-policy', requireGlobalAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, message: 'Banco indisponível.' });
    const { id: storeId } = req.params;
    const { mode, marketplaceSubsidyMaxAmount, marketplaceSubsidyPercent, isActive } = req.body ?? {};

    const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
    if (!store) return res.status(404).json({ success: false, message: 'Loja não encontrada.' });

    const ALLOWED_MODES = ['CUSTOMER_PAYS', 'SELLER_FREE_SHIPPING', 'SELLER_SUBSIDIZED', 'MARKETPLACE_FREE_SHIPPING', 'PICKUP'];
    if (mode !== undefined && !ALLOWED_MODES.includes(mode)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_SHIPPING_POLICY_MODE', message: `Modo inválido. Use um de: ${ALLOWED_MODES.join(', ')}.` } });
    }
    if (marketplaceSubsidyMaxAmount !== undefined && marketplaceSubsidyMaxAmount !== null) {
      const n = Number(marketplaceSubsidyMaxAmount);
      if (isNaN(n) || n < 0) return res.status(400).json({ success: false, message: 'Teto de subsídio (valor) deve ser um número maior ou igual a zero.' });
    }
    if (marketplaceSubsidyPercent !== undefined && marketplaceSubsidyPercent !== null) {
      const n = Number(marketplaceSubsidyPercent);
      if (isNaN(n) || n < 0 || n > 100) return res.status(400).json({ success: false, message: 'Teto de subsídio (percentual) deve estar entre 0 e 100.' });
    }

    const existing = await db.select().from(storeShippingPolicies).where(eq(storeShippingPolicies.storeId, storeId)).limit(1);
    const updateFields: any = { updatedAt: new Date() };
    if (mode !== undefined) updateFields.mode = mode;
    if (marketplaceSubsidyMaxAmount !== undefined) updateFields.marketplaceSubsidyMaxAmount = marketplaceSubsidyMaxAmount === null ? null : String(Number(marketplaceSubsidyMaxAmount));
    if (marketplaceSubsidyPercent !== undefined) updateFields.marketplaceSubsidyPercent = marketplaceSubsidyPercent === null ? null : String(Number(marketplaceSubsidyPercent));
    if (isActive !== undefined) updateFields.isActive = Boolean(isActive);

    if (existing.length > 0) {
      await db.update(storeShippingPolicies).set(updateFields).where(eq(storeShippingPolicies.id, existing[0].id));
    } else {
      await db.insert(storeShippingPolicies).values({
        id: `pol_admin_${Date.now()}`,
        storeId,
        sellerId: store.sellerId,
        mode: mode || 'CUSTOMER_PAYS',
        marketplaceSubsidyMaxAmount: marketplaceSubsidyMaxAmount !== undefined && marketplaceSubsidyMaxAmount !== null ? String(Number(marketplaceSubsidyMaxAmount)) : null,
        marketplaceSubsidyPercent: marketplaceSubsidyPercent !== undefined && marketplaceSubsidyPercent !== null ? String(Number(marketplaceSubsidyPercent)) : null,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      });
    }

    await writeRealAudit(req, 'admin.shipping_policy.updated', 'store_shipping_policies', storeId, req.body);

    const [updated] = await db.select().from(storeShippingPolicies).where(eq(storeShippingPolicies.storeId, storeId)).limit(1);
    return res.json({ success: true, message: 'Política de frete da loja atualizada com sucesso!', data: updated });
  } catch (error: any) {
    return sendAdminError(res, error);
  }
});
