import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  numeric,
  varchar,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
  check,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ============================================================================
// 1. IDENTIDADE E SEGURANÇA (RBAC, USERS, SESSIONS)
// ============================================================================

export const users = pgTable('users', {
  id: varchar('id', { length: 255 }).primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash'),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  role: varchar('role', { length: 50 }).notNull().default('BUYER'), // BUYER, SELLER, ADMIN, COUNTRY_REPRESENTATIVE, REGIONAL_SUPERVISOR, LOGISTICS_OPERATOR, SUPPORT_AGENT, FINANCE
  countryCode: varchar('country_code', { length: 10 }).notNull().default('GW'),
  kycStatus: varchar('kyc_status', { length: 50 }).notNull().default('unverified'), // unverified, pending, under_review, verified, rejected
  riskScore: varchar('risk_score', { length: 20 }).notNull().default('baixo'),
  avatarUrl: text('avatar_url'),
  isActive: boolean('is_active').notNull().default(true),
  isEmailVerified: boolean('is_email_verified').notNull().default(false),
  isPhoneVerified: boolean('is_phone_verified').notNull().default(false),
  isTwoFactorEnabled: boolean('is_two_factor_enabled').notNull().default(false),
  twoFactorSecret: text('two_factor_secret'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const userProfiles = pgTable('user_profiles', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  bio: text('bio'),
  taxId: varchar('tax_id', { length: 100 }), // CPF, NIF, BI, CNPJ
  dateOfBirth: varchar('date_of_birth', { length: 50 }),
  gender: varchar('gender', { length: 20 }),
  preferredCurrency: varchar('preferred_currency', { length: 10 }).notNull().default('XOF'),
  preferredLanguage: varchar('preferred_language', { length: 10 }).notNull().default('pt'),
  membershipLevel: varchar('membership_level', { length: 50 }).notNull().default('standard'), // standard, nusali_plus
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  user_profiles_user_idx: index('user_profiles_user_idx').on(table.userId),
}));

export const addresses = pgTable('addresses', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  recipientName: varchar('recipient_name', { length: 255 }).notNull(),
  street: varchar('street', { length: 255 }).notNull(),
  number: varchar('number', { length: 50 }).notNull(),
  complement: varchar('complement', { length: 255 }),
  neighborhood: varchar('neighborhood', { length: 255 }),
  city: varchar('city', { length: 255 }).notNull(),
  state: varchar('state', { length: 255 }).notNull(),
  countryCode: varchar('country_code', { length: 10 }).notNull().default('GW'),
  zipCode: varchar('zip_code', { length: 50 }),
  phone: varchar('phone', { length: 50 }).notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  addressType: varchar('address_type', { length: 50 }).notNull().default('shipping'), // shipping, billing, business (FASE D15-C)
  // FASE D15-C — origem operacional do seller (fundação D15-A). NULLABLE de
  // propósito: opt-in, nunca exigido globalmente — endereços de países sem
  // geografia de frete por setor (ex.: BR) continuam com isto sempre NULL.
  // Deliberadamente SEM um shippingRegionId paralelo: a região é SEMPRE
  // derivada de shipping_sectors.region_id (nunca persistida aqui de novo),
  // para nunca permitir a divergência region=X + sector=setor-de-Y. ON
  // DELETE RESTRICT: um setor referenciado por algum endereço nunca pode
  // ser removido fisicamente — só desativado (shipping_sectors.isActive).
  shippingSectorId: varchar('shipping_sector_id', { length: 255 }).references(() => shippingSectors.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  addresses_user_idx: index('addresses_user_idx').on(table.userId),
}));

export const sessions = pgTable('sessions', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  ipAddress: varchar('ip_address', { length: 100 }),
  userAgent: text('user_agent'),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  sessions_user_idx: index('sessions_user_idx').on(table.userId),
  sessions_expires_idx: index('sessions_expires_idx').on(table.expiresAt),
}));

export const refreshTokens = pgTable('refresh_tokens', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  isRevoked: boolean('is_revoked').notNull().default(false),
  replacedByToken: text('replaced_by_token'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  refresh_tokens_user_idx: index('refresh_tokens_user_idx').on(table.userId),
  refresh_tokens_expires_idx: index('refresh_tokens_expires_idx').on(table.expiresAt),
}));

export const roles = pgTable('roles', {
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const permissions = pgTable('permissions', {
  id: varchar('id', { length: 255 }).primaryKey(),
  code: varchar('code', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 150 }).notNull(),
  module: varchar('module', { length: 100 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const userRoles = pgTable('user_roles', {
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  roleId: varchar('role_id', { length: 255 }).notNull().references(() => roles.id, { onDelete: 'cascade' }),
  assignedAt: timestamp('assigned_at').defaultNow().notNull(),
}, (table) => ({
  user_roles_pk: primaryKey({ columns: [table.userId, table.roleId], name: 'user_roles_pk' }),
}));

export const rolePermissions = pgTable('role_permissions', {
  roleId: varchar('role_id', { length: 255 }).notNull().references(() => roles.id, { onDelete: 'cascade' }),
  permissionId: varchar('permission_id', { length: 255 }).notNull().references(() => permissions.id, { onDelete: 'cascade' }),
}, (table) => ({
  role_permissions_pk: primaryKey({ columns: [table.roleId, table.permissionId], name: 'role_permissions_pk' }),
}));

export const emailVerificationTokens = pgTable('email_verification_tokens', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============================================================================
// 2. VENDEDORES, LOJAS E KYC
// ============================================================================

export const sellers = pgTable('sellers', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  companyName: varchar('company_name', { length: 255 }).notNull(),
  tradingName: varchar('trading_name', { length: 255 }).notNull(),
  taxId: varchar('tax_id', { length: 100 }).notNull(), // NIF, CNPJ, etc.
  phone: varchar('phone', { length: 50 }).notNull(),
  countryCode: varchar('country_code', { length: 10 }).notNull().default('GW'),
  status: varchar('status', { length: 50 }).notNull().default('active'), // active, pending, suspended, blocked
  // SEM DEFAULT: null = "nenhuma comissão específica negociada para este seller".
  // Um DEFAULT técnico aqui faria todo seller novo parecer "comercialmente configurado"
  // sem que ninguém tivesse de fato negociado nada — ver orderService.ts (cadeia de comissão).
  commissionRate: numeric('commission_rate', { precision: 5, scale: 2 }),
  rating: numeric('rating', { precision: 3, scale: 2 }).default('5.00'),
  totalSales: numeric('total_sales', { precision: 15, scale: 2 }).default('0.00'),
  totalOrders: integer('total_orders').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  sellers_country_status_idx: index('sellers_country_status_idx').on(table.countryCode, table.status),
}));

export const sellerProfiles = pgTable('seller_profiles', {
  id: varchar('id', { length: 255 }).primaryKey(),
  sellerId: varchar('seller_id', { length: 255 }).notNull().unique().references(() => sellers.id, { onDelete: 'cascade' }),
  description: text('description'),
  returnPolicy: text('return_policy'),
  shippingPolicy: text('shipping_policy'),
  bannerUrl: text('banner_url'),
  verifiedAt: timestamp('verified_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const sellerKyc = pgTable('seller_kyc', {
  id: varchar('id', { length: 255 }).primaryKey(),
  sellerId: varchar('seller_id', { length: 255 }).notNull().unique().references(() => sellers.id, { onDelete: 'cascade' }),
  legalName: varchar('legal_name', { length: 255 }).notNull(),
  documentType: varchar('document_type', { length: 50 }).notNull(), // passport, id_card, driving_license, company_reg
  documentNumber: varchar('document_number', { length: 100 }).notNull(),
  documentFrontUrl: text('document_front_url'),
  documentBackUrl: text('document_back_url'),
  selfieUrl: text('selfie_url'),
  proofOfAddressUrl: text('proof_of_address_url'),
  status: varchar('status', { length: 50 }).notNull().default('pending'), // pending, under_review, verified, rejected
  riskLevel: varchar('risk_level', { length: 50 }).notNull().default('baixo'),
  rejectionReason: text('rejection_reason'),
  submittedAt: timestamp('submitted_at').defaultNow().notNull(),
  reviewedAt: timestamp('reviewed_at'),
  reviewerId: varchar('reviewer_id', { length: 255 }).references(() => users.id, { onDelete: 'set null' }),
});

export const sellerDocuments = pgTable('seller_documents', {
  id: varchar('id', { length: 255 }).primaryKey(),
  sellerId: varchar('seller_id', { length: 255 }).notNull().references(() => sellers.id, { onDelete: 'cascade' }),
  documentType: varchar('document_type', { length: 100 }).notNull(),
  fileUrl: text('file_url').notNull(),
  objectKey: varchar('object_key', { length: 500 }),
  mimeType: varchar('mime_type', { length: 100 }),
  fileSize: integer('file_size'),
  status: varchar('status', { length: 50 }).notNull().default('pending'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  seller_documents_seller_idx: index('seller_documents_seller_idx').on(table.sellerId),
}));

export const sellerBankAccounts = pgTable('seller_bank_accounts', {
  id: varchar('id', { length: 255 }).primaryKey(),
  sellerId: varchar('seller_id', { length: 255 }).notNull().references(() => sellers.id, { onDelete: 'cascade' }),
  accountType: varchar('account_type', { length: 50 }).notNull().default('bank_transfer'),
  bankName: varchar('bank_name', { length: 255 }),
  accountHolder: varchar('account_holder', { length: 255 }).notNull(),
  accountNumber: varchar('account_number', { length: 100 }),
  ibanOrRouting: varchar('iban_or_routing', { length: 100 }),
  swift: varchar('swift', { length: 50 }),
  pixKey: varchar('pix_key', { length: 150 }),
  mobileMoneyNumber: varchar('mobile_money_number', { length: 50 }),
  currency: varchar('currency', { length: 10 }).notNull().default('XOF'),
  isDefault: boolean('is_default').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  seller_bank_accounts_seller_idx: index('seller_bank_accounts_seller_idx').on(table.sellerId),
}));

export const stores = pgTable('stores', {
  id: varchar('id', { length: 255 }).primaryKey(),
  sellerId: varchar('seller_id', { length: 255 }).notNull().references(() => sellers.id, { onDelete: 'restrict' }),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  countryCode: varchar('country_code', { length: 10 }).notNull().default('GW'),
  description: text('description'),
  logoUrl: text('logo_url'),
  bannerUrl: text('banner_url'),
  rating: numeric('rating', { precision: 3, scale: 2 }).default('5.00'),
  followersCount: integer('followers_count').default(0),
  status: varchar('status', { length: 50 }).notNull().default('active'), // active, paused, closed
  categoryId: varchar('category_id', { length: 255 }),
  addressJson: jsonb('address_json'),
  businessHoursJson: jsonb('business_hours_json'),
  // FASE D15-C — ponteiro EXPLÍCITO para qual endereço (addresses.id) é a
  // origem operacional desta loja. Nunca inferido por isDefault/primeiro
  // endereço/addressType — sempre uma escolha explícita do seller (ou
  // ausência = NULL, "ainda não configurado"). addressJson acima continua
  // existindo e funcionando exatamente como hoje — nada aqui o substitui ou
  // migra automaticamente. ON DELETE SET NULL: apagar o endereço nunca deixa
  // a loja com uma referência inválida — só volta a "não configurado".
  operationalAddressId: varchar('operational_address_id', { length: 255 }).references(() => addresses.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  stores_seller_idx: index('stores_seller_idx').on(table.sellerId),
  stores_country_status_idx: index('stores_country_status_idx').on(table.countryCode, table.status),
}));

export const storeMembers = pgTable('store_members', {
  id: varchar('id', { length: 255 }).primaryKey(),
  storeId: varchar('store_id', { length: 255 }).notNull().references(() => stores.id, { onDelete: 'cascade' }),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 50 }).notNull().default('manager'), // owner, manager, operator
  permissionsJson: jsonb('permissions_json'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  store_members_store_user_uq: uniqueIndex('store_members_store_user_uq').on(table.storeId, table.userId),
}));

// ============================================================================
// 3. CATÁLOGO, PRODUTOS, VARIANTES E ATRIBUTOS
// ============================================================================

export const categories = pgTable('categories', {
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  icon: varchar('icon', { length: 100 }),

  parentId: varchar('parent_id', { length: 255 })
    .references((): AnyPgColumn => categories.id, { onDelete: 'set null' }),

  displayOrder: integer('display_order').default(0),
  isActive: boolean('is_active').notNull().default(true),
  // Fase "Comissão percentual + logística real": comissão configurável por
  // categoria (GLOBAL_ADMIN, via POST /admin/categories/:id). Nullable —
  // quando ausente, orderService.ts cai para sellers.commissionRate, depois
  // platformSettings.defaultSellerCommissionPercent, nunca um valor inventado
  // sem fonte real.
  commissionRate: numeric('commission_rate', { precision: 5, scale: 2 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  categoriesParentIdx: index('categories_parent_idx').on(table.parentId),
}));

export const brands = pgTable('brands', {
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  logoUrl: text('logo_url'),
  countryCode: varchar('country_code', { length: 10 }).default('GW'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const products = pgTable('products', {
  id: varchar('id', { length: 255 }).primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }),
  description: text('description'),
  shortDescription: text('short_description'),
  price: numeric('price', { precision: 12, scale: 2 }).notNull(),
  originalPrice: numeric('original_price', { precision: 12, scale: 2 }),
  currency: varchar('currency', { length: 10 }).notNull().default('XOF'),
  categoryId: varchar('category_id', { length: 255 }).references(() => categories.id, { onDelete: 'set null' }),
  brandId: varchar('brand_id', { length: 255 }).references(() => brands.id, { onDelete: 'set null' }),
  brand: varchar('brand', { length: 255 }),
  sellerId: varchar('seller_id', { length: 255 }).references(() => sellers.id, { onDelete: 'set null' }),
  storeId: varchar('store_id', { length: 255 }).references(() => stores.id, { onDelete: 'set null' }),
  stock: integer('stock').notNull().default(10),
  image: text('image').notNull(),
  rating: numeric('rating', { precision: 3, scale: 2 }).default('5.00'),
  reviewsCount: integer('reviews_count').default(0),
  freeShipping: boolean('free_shipping').default(false),
  full: boolean('full').default(false),
  countryCode: varchar('country_code', { length: 10 }).notNull().default('GW'),
  // Correção pré-piloto (condição opcional): SEM DEFAULT — 'new' era um
  // default técnico que fazia todo produto legado parecer "configurado como
  // novo" mesmo quando o vendedor nunca escolheu nada (ex.: Manga, Banana,
  // onde condição não se aplica). null = "não se aplica/não informado".
  condition: varchar('condition', { length: 50 }), // new, used, refurbished, ou null (não se aplica)
  warranty: varchar('warranty', { length: 100 }),
  status: varchar('status', { length: 50 }).notNull().default('active'), // active, draft, paused, archived
  isActive: boolean('is_active').notNull().default(true),
  attributesJson: jsonb('attributes_json'),
  shippingJson: jsonb('shipping_json'),
  // Melhoria pré-piloto (elegibilidade por país): antes, o wizard do vendedor
  // já coletava "venda nacional vs. internacional" e os países de destino,
  // mas NADA disso era persistido — productCreationService descartava os
  // campos silenciosamente. NATIONAL (default, seguro para dados legados) =
  // visível somente no próprio countryCode (mesmo comportamento de sempre).
  // INTERNATIONAL = visível apenas nos países explicitamente listados em
  // targetCountriesJson (nunca "todos os países" implícito).
  publishingScope: varchar('publishing_scope', { length: 20 }).notNull().default('national'),
  targetCountriesJson: jsonb('target_countries_json'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  products_category_status_idx: index('products_category_status_idx').on(table.categoryId, table.status),
  products_seller_status_idx: index('products_seller_status_idx').on(table.sellerId, table.status),
  products_store_status_idx: index('products_store_status_idx').on(table.storeId, table.status),
  products_country_status_idx: index('products_country_status_idx').on(table.countryCode, table.status),
  products_slug_uq: uniqueIndex('products_slug_uq').on(table.slug),
}));

export const productVariants = pgTable('product_variants', {
  id: varchar('id', { length: 255 }).primaryKey(),
  productId: varchar('product_id', { length: 255 }).notNull().references(() => products.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  sku: varchar('sku', { length: 100 }),
  price: numeric('price', { precision: 12, scale: 2 }).notNull(),
  originalPrice: numeric('original_price', { precision: 12, scale: 2 }),
  stock: integer('stock').notNull().default(0),
  size: varchar('size', { length: 50 }),
  color: varchar('color', { length: 50 }),
  capacity: varchar('capacity', { length: 50 }),
  weight: numeric('weight', { precision: 8, scale: 2 }),
  imageUrl: text('image_url'),
  attributesJson: jsonb('attributes_json'),
  // FASE D16-A1 (fundação de schema) — nullable seria ambíguo aqui (não há
  // "não se aplica" para status de uma variante); NOT NULL DEFAULT true
  // preserva 100% do comportamento atual para toda linha existente (nenhuma
  // tem hoje como estar "inativa" — o conceito não existia). Nenhum writer
  // grava esta coluna ainda; permanece true até uma fase futura introduzir a
  // ação de pausar/despausar variante.
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  product_variants_product_idx: index('product_variants_product_idx').on(table.productId),
  product_variants_sku_uq: uniqueIndex('product_variants_sku_uq').on(table.sku),
}));

export const productImages = pgTable('product_images', {
  id: varchar('id', { length: 255 }).primaryKey(),
  productId: varchar('product_id', { length: 255 }).notNull().references(() => products.id, { onDelete: 'cascade' }),
  imageUrl: text('image_url').notNull(),
  objectKey: varchar('object_key', { length: 500 }),
  displayOrder: integer('display_order').default(0),
  isCover: boolean('is_cover').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  product_images_product_idx: index('product_images_product_idx').on(table.productId),
}));

export const productAttributes = pgTable('product_attributes', {
  id: varchar('id', { length: 255 }).primaryKey(),
  productId: varchar('product_id', { length: 255 }).notNull().references(() => products.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  value: text('value').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  product_attributes_product_idx: index('product_attributes_product_idx').on(table.productId),
}));

export const categoryAttributes = pgTable('category_attributes', {
  id: varchar('id', { length: 255 }).primaryKey(),
  categoryId: varchar('category_id', { length: 255 })
    .notNull()
    .references(() => categories.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  code: varchar('code', { length: 100 }).notNull(),
  type: varchar('type', { length: 50 }).notNull().default('text'), // text, number, select, multiselect, boolean
  isRequired: boolean('is_required').notNull().default(false),
  optionsJson: jsonb('options_json'),
  placeholder: varchar('placeholder', { length: 255 }),
  helpText: text('help_text'),
  unit: varchar('unit', { length: 50 }),
  sortOrder: integer('sort_order').default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  category_attributes_cat_idx: index('category_attributes_cat_idx').on(table.categoryId),
}));

// ============================================================================
// 4. ARMAZÉNS E ESTOQUE SEGURO (INVENTORY, MOVEMENTS, RESERVATIONS)
// ============================================================================

export const warehouses = pgTable('warehouses', {
  id: varchar('id', { length: 255 }).primaryKey(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  countryCode: varchar('country_code', { length: 10 }).notNull().default('GW'),
  city: varchar('city', { length: 255 }).notNull(),
  address: text('address').notNull(),
  managerName: varchar('manager_name', { length: 255 }),
  staffCount: integer('staff_count').default(1),
  status: varchar('status', { length: 50 }).notNull().default('active'),
  // FASE D16-E3 — origem geográfica estruturada do HUB, mesmo princípio já
  // usado por addresses.shippingSectorId: nullable/opt-in (países sem
  // geografia por setor continuam funcionando com isto sempre NULL, nenhum
  // warehouse histórico exige backfill), ON DELETE RESTRICT (um setor usado
  // por algum warehouse nunca pode ser removido fisicamente — só
  // desativado). Deliberadamente SEM um shippingRegionId paralelo: a região
  // é SEMPRE derivada de shipping_sectors.region_id na leitura (mesma regra
  // de addresses/fulfillment_locations) — nunca duas fontes divergentes.
  shippingSectorId: varchar('shipping_sector_id', { length: 255 }).references(() => shippingSectors.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  warehouses_shipping_sector_idx: index('warehouses_shipping_sector_idx').on(table.shippingSectorId),
}));

export const inventory = pgTable('inventory', {
  id: varchar('id', { length: 255 }).primaryKey(),
  locationType: varchar('location_type', { length: 50 }).notNull().default('SELLER_LOCATION'), // SELLER_LOCATION, NUSALI_HUB
  sellerId: varchar('seller_id', { length: 255 }).references(() => sellers.id, { onDelete: 'cascade' }),
  warehouseId: varchar('warehouse_id', { length: 255 }).references(() => warehouses.id, { onDelete: 'restrict' }),
  productId: varchar('product_id', { length: 255 }).notNull().references(() => products.id, { onDelete: 'restrict' }),
  variantId: varchar('variant_id', { length: 255 }).references(() => productVariants.id, { onDelete: 'set null' }),
  quantityOnHand: integer('quantity_on_hand').notNull().default(0),
  quantityReserved: integer('quantity_reserved').notNull().default(0),
  minimumStockLevel: integer('minimum_stock_level').default(5),
  // FASE D15-C3 (ajuste arquitetural) — nullable de propósito. `inventory`
  // continua sendo a ÚNICA fonte de verdade de estoque (quantityOnHand/
  // quantityReserved); esta coluna apenas aponta OPCIONALMENTE para ONDE
  // (fulfillment_locations) aquela linha existe fisicamente, sem duplicar
  // quantidade em nenhuma tabela paralela. NULL em todas as linhas
  // existentes hoje — nenhum backfill nesta fase (ver comentário acima de
  // fulfillmentLocations). locationType/warehouseId/sellerId legados
  // permanecem intactos e continuam sendo a única coisa lida/escrita por
  // checkout, reserva, despacho e catálogo até uma fase futura migrar esses
  // consumidores explicitamente.
  fulfillmentLocationId: varchar('fulfillment_location_id', { length: 255 }).references(() => fulfillmentLocations.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  inventory_product_idx: index('inventory_product_idx').on(table.productId),
  inventory_warehouse_idx: index('inventory_warehouse_idx').on(table.warehouseId),
  inventory_seller_idx: index('inventory_seller_idx').on(table.sellerId),
  inventory_fulfillment_location_idx: index('inventory_fulfillment_location_idx').on(table.fulfillmentLocationId),
}));

export const inventoryMovements = pgTable('inventory_movements', {
  id: varchar('id', { length: 255 }).primaryKey(),
  inventoryId: varchar('inventory_id', { length: 255 }).references(() => inventory.id, { onDelete: 'set null' }),
  warehouseId: varchar('warehouse_id', { length: 255 }).references(() => warehouses.id, { onDelete: 'set null' }),
  productId: varchar('product_id', { length: 255 }).notNull().references(() => products.id, { onDelete: 'restrict' }),
  variantId: varchar('variant_id', { length: 255 }).references(() => productVariants.id, { onDelete: 'set null' }),
  type: varchar('type', { length: 50 }).notNull(), // IN, OUT, ADJUSTMENT, RESERVATION, RELEASE, TRANSFER_IN, TRANSFER_OUT
  quantity: integer('quantity').notNull(),
  reason: varchar('reason', { length: 255 }),
  referenceId: varchar('reference_id', { length: 255 }),
  performedBy: varchar('performed_by', { length: 255 }).references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  inventory_movements_product_created_idx: index('inventory_movements_product_created_idx').on(table.productId, table.createdAt),
}));

export const stockReservations = pgTable('stock_reservations', {
  id: varchar('id', { length: 255 }).primaryKey(),
  orderId: varchar('order_id', { length: 255 }).notNull().references(() => orders.id, { onDelete: 'cascade' }),
  productId: varchar('product_id', { length: 255 }).notNull().references(() => products.id, { onDelete: 'restrict' }),
  variantId: varchar('variant_id', { length: 255 }).references(() => productVariants.id, { onDelete: 'set null' }),
  inventoryId: varchar('inventory_id', { length: 255 }).references(() => inventory.id, { onDelete: 'cascade' }),
  warehouseId: varchar('warehouse_id', { length: 255 }).references(() => warehouses.id, { onDelete: 'set null' }),
  fulfillmentMode: varchar('fulfillment_mode', { length: 50 }).notNull().default('SELLER_FULFILLMENT'), // NUSALI_FULFILLMENT, SELLER_FULFILLMENT
  quantity: integer('quantity').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  status: varchar('status', { length: 50 }).notNull().default('active'), // active, confirmed, released, expired
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  stock_reservations_order_idx: index('stock_reservations_order_idx').on(table.orderId),
  stock_reservations_expiry_status_idx: index('stock_reservations_expiry_status_idx').on(table.expiresAt, table.status),
}));

export const inventoryTransfers = pgTable('inventory_transfers', {
  id: varchar('id', { length: 255 }).primaryKey(),
  sellerId: varchar('seller_id', { length: 255 }).notNull().references(() => sellers.id, { onDelete: 'cascade' }),
  productId: varchar('product_id', { length: 255 }).notNull().references(() => products.id, { onDelete: 'cascade' }),
  variantId: varchar('variant_id', { length: 255 }).references(() => productVariants.id, { onDelete: 'set null' }),
  fromLocationType: varchar('from_location_type', { length: 50 }).notNull().default('SELLER_LOCATION'),
  fromInventoryId: varchar('from_inventory_id', { length: 255 }).references(() => inventory.id, { onDelete: 'set null' }),
  toWarehouseId: varchar('to_warehouse_id', { length: 255 }).notNull().references(() => warehouses.id, { onDelete: 'cascade' }),
  quantity: integer('quantity').notNull(),
  status: varchar('status', { length: 50 }).notNull().default('PENDING'), // PENDING, IN_TRANSIT, RECEIVED, CANCELLED
  deliveryMode: varchar('delivery_mode', { length: 50 }).notNull().default('NUSALI_PICKUP'), // NUSALI_PICKUP, SELLER_DROPOFF
  pickupSnapshotJson: jsonb('pickup_snapshot_json'),
  trackingCode: varchar('tracking_code', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  receivedAt: timestamp('received_at'),
}, (table) => ({
  inventory_transfers_seller_idx: index('inventory_transfers_seller_idx').on(table.sellerId),
  inventory_transfers_product_idx: index('inventory_transfers_product_idx').on(table.productId),
}));

// ============================================================================
// FASE D15-C3 — FULFILLMENT LOCATIONS (fundação de múltiplas origens
// físicas de estoque).
//
// AJUSTE ARQUITETURAL (mesma fase, antes do commit): a primeira versão desta
// fundação incluía uma tabela `inventory_locations` paralela (sellerId +
// productId + variantId + fulfillmentLocationId + quantityOnHand/
// quantityReserved próprios). Auditoria identificou risco real de DUAS
// FONTES DE VERDADE de estoque (`inventory` vs `inventory_locations`
// divergindo para o mesmo seller/produto/local) — `inventory_locations` foi
// REMOVIDA antes de qualquer aplicação em staging/produção. `inventory`
// continua sendo a ÚNICA fonte de verdade de quantidade (quantityOnHand/
// quantityReserved); ela apenas ganhou uma coluna opcional
// `fulfillmentLocationId` (ver definição de `inventory` acima) que aponta
// PARA ONDE aquela linha existe fisicamente, sem duplicar quantidade em
// nenhuma tabela nova.
//
// fulfillment_locations = ONDE um estoque físico pode existir (uma loja do
// seller OU um HUB/armazém Nusali) — nunca A QUEM o estoque pertence (isso
// continua em `inventory.sellerId`, como sempre foi).
// Um HUB pode guardar estoque de vários sellers ao mesmo tempo (sellerId
// fica NULL para NUSALI_WAREHOUSE, de propósito). Geografia nunca duplicada:
// para STORE, addressId/shippingSectorId são sempre um espelho (refrescado
// por ensureStoreFulfillmentLocation) do que já está em
// stores.operationalAddressId -> addresses.shippingSectorId — nunca uma
// segunda fonte de verdade independente. Para NUSALI_WAREHOUSE, ambos ficam
// NULL de propósito: warehouses ainda não tem addressId/shippingSectorId
// estruturado hoje (confirmado por auditoria — só city/address/countryCode
// texto livre) — nada é inventado para preencher essa lacuna.
//
// Nenhuma linha existente de `inventory` é backfillada nesta fase (nem HUB,
// determinístico via warehouseId, nem SELLER_LOCATION, que hoje não tem
// informação suficiente para saber a qual store pertence — ver auditoria).
// shipmentService.ts/orderService.ts/checkout/frete/seleção inteligente
// continuam usando exclusivamente locationType/warehouseId/sellerId nesta
// fase — `fulfillmentLocationId` ainda não é lido por nenhum consumidor.
// ============================================================================

export const fulfillmentLocations = pgTable('fulfillment_locations', {
  id: varchar('id', { length: 255 }).primaryKey(),
  // NULL = HUB Nusali compartilhado (não pertence a nenhum seller
  // específico). Preenchido apenas para locationType='STORE'.
  sellerId: varchar('seller_id', { length: 255 }).references(() => sellers.id, { onDelete: 'restrict' }),
  locationType: varchar('location_type', { length: 50 }).notNull(), // STORE | NUSALI_WAREHOUSE
  storeId: varchar('store_id', { length: 255 }).references(() => stores.id, { onDelete: 'restrict' }),
  warehouseId: varchar('warehouse_id', { length: 255 }).references(() => warehouses.id, { onDelete: 'restrict' }),
  // Espelho de stores.operationalAddressId no momento da última chamada de
  // ensureStoreFulfillmentLocation — nunca uma fonte de verdade paralela.
  addressId: varchar('address_id', { length: 255 }).references(() => addresses.id, { onDelete: 'set null' }),
  countryCode: varchar('country_code', { length: 10 }).notNull(),
  // Espelho de addresses.shippingSectorId (STORE) — sempre NULL para
  // NUSALI_WAREHOUSE nesta fase (ver comentário acima).
  shippingSectorId: varchar('shipping_sector_id', { length: 255 }).references(() => shippingSectors.id, { onDelete: 'restrict' }),
  name: varchar('name', { length: 255 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  // Uma location por store / uma location por warehouse — idempotência
  // garantida no schema, não só na aplicação. UNIQUE comum trataria NULL
  // como distinto (permitiria N locations com storeId nulo); índices
  // parciais resolvem isso (mesmo padrão de ledger_accounts acima).
  fulfillment_locations_store_uq: uniqueIndex('fulfillment_locations_store_uq')
    .on(table.storeId)
    .where(sql`${table.storeId} IS NOT NULL`),
  fulfillment_locations_warehouse_uq: uniqueIndex('fulfillment_locations_warehouse_uq')
    .on(table.warehouseId)
    .where(sql`${table.warehouseId} IS NOT NULL`),
  fulfillment_locations_country_idx: index('fulfillment_locations_country_idx').on(table.countryCode),
  fulfillment_locations_type_check: check('fulfillment_locations_type_check', sql`${table.locationType} IN ('STORE','NUSALI_WAREHOUSE')`),
  // XOR estrutural: STORE sempre tem storeId (nunca warehouseId) e
  // NUSALI_WAREHOUSE sempre tem warehouseId (nunca storeId) — nunca os dois
  // nem nenhum dos dois.
  fulfillment_locations_store_xor_warehouse_check: check(
    'fulfillment_locations_store_xor_warehouse_check',
    sql`(${table.locationType} = 'STORE' AND ${table.storeId} IS NOT NULL AND ${table.warehouseId} IS NULL) OR (${table.locationType} = 'NUSALI_WAREHOUSE' AND ${table.warehouseId} IS NOT NULL AND ${table.storeId} IS NULL)`
  ),
}));

// ============================================================================
// 5. CARRINHO E CHECKOUT
// ============================================================================

export const carts = pgTable('carts', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).references(() => users.id, { onDelete: 'cascade' }),
  sessionId: varchar('session_id', { length: 255 }),
  currency: varchar('currency', { length: 10 }).notNull().default('XOF'),
  countryCode: varchar('country_code', { length: 10 }).notNull().default('GW'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  carts_user_idx: index('carts_user_idx').on(table.userId),
  carts_session_idx: index('carts_session_idx').on(table.sessionId),
}));

export const cartItems = pgTable('cart_items', {
  id: varchar('id', { length: 255 }).primaryKey(),
  cartId: varchar('cart_id', { length: 255 }).notNull().references(() => carts.id, { onDelete: 'cascade' }),
  productId: varchar('product_id', { length: 255 }).notNull().references(() => products.id, { onDelete: 'cascade' }),
  variantId: varchar('variant_id', { length: 255 }).references(() => productVariants.id, { onDelete: 'set null' }),
  quantity: integer('quantity').notNull().default(1),
  unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
  selectedAttributesJson: jsonb('selected_attributes_json'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  cart_items_cart_idx: index('cart_items_cart_idx').on(table.cartId),
  cart_items_cart_product_variant_uq: uniqueIndex('cart_items_cart_product_variant_uq').on(table.cartId, table.productId, table.variantId),
}));

export const storeShippingPolicies = pgTable('store_shipping_policies', {
  id: varchar('id', { length: 255 }).primaryKey(),
  storeId: varchar('store_id', { length: 255 }).notNull().references(() => stores.id, { onDelete: 'cascade' }),
  sellerId: varchar('seller_id', { length: 255 }).notNull().references(() => sellers.id, { onDelete: 'cascade' }),
  mode: varchar('mode', { length: 50 }).notNull().default('CUSTOMER_PAYS'), // CUSTOMER_PAYS, SELLER_FREE_SHIPPING, SELLER_SUBSIDIZED, PICKUP
  isActive: boolean('is_active').notNull().default(true),
  freeShippingMinOrder: numeric('free_shipping_min_order', { precision: 12, scale: 2 }),
  sellerSubsidyMaxAmount: numeric('seller_subsidy_max_amount', { precision: 12, scale: 2 }),
  sellerSubsidyPercent: numeric('seller_subsidy_percent', { precision: 5, scale: 2 }),
  // Fase "Comissão percentual + logística real": teto do subsídio que a
  // Nusali (marketplace) absorve no modo MARKETPLACE_FREE_SHIPPING — sem
  // isso, o marketplace bancaria qualquer custo de frete sem limite. Mesmo
  // padrão de max-amount OU percent já usado para o subsídio do seller.
  marketplaceSubsidyMaxAmount: numeric('marketplace_subsidy_max_amount', { precision: 12, scale: 2 }),
  marketplaceSubsidyPercent: numeric('marketplace_subsidy_percent', { precision: 5, scale: 2 }),
  allowedCountriesJson: jsonb('allowed_countries_json'),
  allowedRegionsJson: jsonb('allowed_regions_json'),
  allowedCitiesJson: jsonb('allowed_cities_json'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  store_shipping_policies_store_idx: index('store_shipping_policies_store_idx').on(table.storeId),
  store_shipping_policies_seller_idx: index('store_shipping_policies_seller_idx').on(table.sellerId),
}));

// Fase "Transportadoras Persistentes": entidade real de transportadora,
// substitui a tela mock/in-memory (AdminCarriersManager.tsx) e o texto
// livre de shipments.carrier para NOVOS shipments. shipments.carrier
// continua existindo, sem alteração, por compatibilidade com registros
// históricos (nunca convertido/backfillado automaticamente).
export const carriers = pgTable('carriers', {
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  countryCode: varchar('country_code', { length: 10 }).notNull().default('GW'),
  status: varchar('status', { length: 50 }).notNull().default('ACTIVE'), // ACTIVE, INACTIVE
  integrationMode: varchar('integration_mode', { length: 50 }).notNull().default('MANUAL'), // MANUAL, API_INTEGRATED
  // Referência para um futuro adaptador de integração (ex.: 'dhl',
  // 'correios') — NUNCA um segredo/API key. Credenciais reais ficam em
  // env/secret/config, jamais em coluna de banco.
  providerKey: varchar('provider_key', { length: 100 }),
  contactName: varchar('contact_name', { length: 255 }),
  contactPhone: varchar('contact_phone', { length: 50 }),
  contactEmail: varchar('contact_email', { length: 255 }),
  website: text('website'),
  serviceAreasJson: jsonb('service_areas_json'),
  metadataJson: jsonb('metadata_json'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  carriers_status_idx: index('carriers_status_idx').on(table.status),
  carriers_country_idx: index('carriers_country_idx').on(table.countryCode),
}));

// FASE D16-I7-A — shippingZones/shippingRates (motor legado país/zona)
// removidas destas definições: comprovadamente sem consumidor runtime
// (auditorias D16-I1/I4/I5/I6/I6.1/I6.2), staging confirmado com só 2
// linhas/0 pedidos+5 pedidos legados, todos com evidência financeira já
// congelada em orders (orders.shippingRateId/shippingRateSource
// PRESERVADOS como identificador histórico opaco — Estratégia A, D16-I6.2
// — nenhum backfill, nenhuma coluna nova). A remoção física das tabelas em
// si acontece pela migration gerada nesta mesma fase, nunca por edição
// retroativa das migrations 0009/0010/0022 que as criaram/alteraram.

// ============================================================================
// 6. PEDIDOS (SNAPSHOT COMPLETO, HISTÓRICO DE STATUS)
// ============================================================================

// FASE A — arquitetura multi-vendedor (schema apenas; NENHUM código de
// checkout/payment/escrow foi alterado nesta fase — ver orderService.ts,
// paymentService.ts, refundService.ts, shipmentService.ts,
// escrowAutoReleaseService.ts, todos intocados). purchase_groups é o
// "recibo visual" de uma compra que pode conter itens de vários vendedores —
// nunca uma fonte de verdade financeira. Cada vendedor continua tendo seu
// próprio `orders` (1 order = 1 seller), e é essa linha de `orders` que
// mantém toda a autoridade financeira já validada (escrow, commission,
// sellerNetAmount, disputes, refunds) — nada disso muda de lugar.
// totalAmount aqui é só a soma dos orders filhos para exibição agregada ao
// comprador (nunca usado por nenhuma regra de escrow/release/wallet).
export const purchaseGroups = pgTable('purchase_groups', {
  id: varchar('id', { length: 255 }).primaryKey(),
  buyerId: varchar('buyer_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'restrict' }),
  currency: varchar('currency', { length: 10 }).notNull().default('XOF'),
  totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
  // Espelha/deriva do conjunto de orders filhos (nunca escrito diretamente
  // por lógica de escrow/pagamento) — só para a UI agregada do comprador
  // saber se mostra "processando"/"parcialmente entregue"/etc. sem precisar
  // agregar os orders toda vez.
  status: varchar('status', { length: 50 }).notNull().default('pending_payment'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  purchase_groups_buyer_created_idx: index('purchase_groups_buyer_created_idx').on(table.buyerId, table.createdAt),
}));

export const orders = pgTable('orders', {
  id: varchar('id', { length: 255 }).primaryKey(),
  orderNumber: varchar('order_number', { length: 100 }).notNull().unique(),
  buyerId: varchar('buyer_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'restrict' }),
  storeId: varchar('store_id', { length: 255 }).references(() => stores.id, { onDelete: 'set null' }),
  sellerId: varchar('seller_id', { length: 255 }).references(() => sellers.id, { onDelete: 'set null' }),
  // FASE A — NULLABLE de propósito: NULL = pedido legado/single-seller
  // anterior a esta arquitetura (todo pedido existente hoje se encaixa
  // aqui — auditoria confirmou 0 pedidos multi-seller em produção). Só
  // pedidos novos criados pelo checkout multi-vendedor (fase futura, ainda
  // não implementada) preenchem este campo. Nenhum código atual lê ou
  // escreve esta coluna ainda.
  purchaseGroupId: varchar('purchase_group_id', { length: 255 }).references(() => purchaseGroups.id, { onDelete: 'set null' }),
  subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull(),
  shippingFee: numeric('shipping_fee', { precision: 12, scale: 2 }).notNull().default('0.00'),
  customsDuty: numeric('customs_duty', { precision: 12, scale: 2 }).default('0.00'),
  discountAmount: numeric('discount_amount', { precision: 12, scale: 2 }).default('0.00'),
  totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 10 }).notNull().default('XOF'),
  status: varchar('status', { length: 50 }).notNull().default('pending_payment'), // pending_payment, paid, processing, ready_to_ship, shipped, in_transit, delivered, cancelled, refund_requested, refunded, disputed
  paymentMethod: varchar('payment_method', { length: 100 }), // pix, orange_money, mtn_money, card, nusali_wallet
  paymentStatus: varchar('payment_status', { length: 50 }).notNull().default('pending'), // pending, paid, failed, refunded
  escrowStatus: varchar('escrow_status', { length: 50 }).notNull().default('pending'), // pending, held, releasing, released, disputed, refunded
  shippingAddressJson: jsonb('shipping_address_json').notNull(),
  billingAddressJson: jsonb('billing_address_json'),
  paymentDetailsJson: jsonb('payment_details_json'),
  trackingCode: varchar('tracking_code', { length: 100 }),
  countryCode: varchar('country_code', { length: 10 }).notNull().default('GW'),
  notes: text('notes'),
  shippingCost: numeric('shipping_cost', { precision: 12, scale: 2 }),
  shippingChargedToBuyer: numeric('shipping_charged_to_buyer', { precision: 12, scale: 2 }),
  shippingSellerSubsidy: numeric('shipping_seller_subsidy', { precision: 12, scale: 2 }),
  shippingMarketplaceSubsidy: numeric('shipping_marketplace_subsidy', { precision: 12, scale: 2 }),
  shippingPayer: varchar('shipping_payer', { length: 50 }),
  shippingRateSource: varchar('shipping_rate_source', { length: 100 }),
  shippingRateId: varchar('shipping_rate_id', { length: 255 }),
  commissionRateSnapshot: numeric('commission_rate_snapshot', { precision: 5, scale: 2 }),
  commissionBase: numeric('commission_base', { precision: 12, scale: 2 }),
  marketplaceCommission: numeric('marketplace_commission', { precision: 12, scale: 2 }),
  sellerNetAmount: numeric('seller_net_amount', { precision: 12, scale: 2 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orders_buyer_created_idx: index('orders_buyer_created_idx').on(table.buyerId, table.createdAt),
  orders_seller_status_idx: index('orders_seller_status_idx').on(table.sellerId, table.status),
  orders_store_status_idx: index('orders_store_status_idx').on(table.storeId, table.status),
  orders_status_created_idx: index('orders_status_created_idx').on(table.status, table.createdAt),
  orders_purchase_group_idx: index('orders_purchase_group_idx').on(table.purchaseGroupId),
}));

export const orderItems = pgTable('order_items', {
  id: varchar('id', { length: 255 }).primaryKey(),
  orderId: varchar('order_id', { length: 255 }).notNull().references(() => orders.id, { onDelete: 'cascade' }),
  productId: varchar('product_id', { length: 255 }).notNull().references(() => products.id, { onDelete: 'restrict' }),
  variantId: varchar('variant_id', { length: 255 }).references(() => productVariants.id, { onDelete: 'set null' }),
  productTitle: varchar('product_title', { length: 255 }).notNull(),
  productSku: varchar('product_sku', { length: 100 }),
  variantTitle: varchar('variant_title', { length: 255 }),
  quantity: integer('quantity').notNull().default(1),
  unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
  subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull(),
  discount: numeric('discount', { precision: 12, scale: 2 }).default('0.00'),
  tax: numeric('tax', { precision: 12, scale: 2 }).default('0.00'),
  sellerId: varchar('seller_id', { length: 255 }).references(() => sellers.id, { onDelete: 'set null' }),
  storeId: varchar('store_id', { length: 255 }).references(() => stores.id, { onDelete: 'set null' }),
  productImage: text('product_image'),
  attributesJson: jsonb('attributes_json'),
  // FASE D16-A1 (fundação de schema) — nullable de propósito: snapshot do
  // preço riscado/comparação NO MOMENTO da compra, para o pedido nunca
  // depender do compareAtPrice atual do produto/variante (que pode mudar ou
  // desaparecer depois). NULL para todo pedido existente (histórico) e para
  // todo pedido novo até um writer futuro passar a preenchê-lo — nenhum
  // backfill, nenhum valor inventado.
  compareAtPriceSnapshot: numeric('compare_at_price_snapshot', { precision: 12, scale: 2 }),
  inventoryId: varchar('inventory_id', { length: 255 }).references(() => inventory.id, { onDelete: 'set null' }),
  warehouseId: varchar('warehouse_id', { length: 255 }).references(() => warehouses.id, { onDelete: 'set null' }),
  shipmentId: varchar('shipment_id', { length: 255 }).references(() => shipments.id, { onDelete: 'set null' }),
  // FASE D16-F6.1 (fundação de schema) — snapshots logísticos imutáveis da
  // decisão de fulfillment (F2->F3->F4->F5) tomada no checkout, para
  // reconstruir depois exatamente o que aconteceu sem depender de reler
  // tarifa/setor/rota/serviço no estado ATUAL (que pode mudar ou ser
  // desativado depois). NULLABLE de propósito — nenhum pedido existente é
  // retroativamente preenchido (zero backfill) e nenhum writer novo é criado
  // nesta fase (F6 ainda não integra o checkout). ON DELETE RESTRICT nas 5
  // FKs abaixo: mesma convenção já usada em toda a cadeia de frete por setor
  // (fulfillment_locations/shipping_sectors/shipping_routes/
  // shipping_services/shipping_route_rates só são desativadas — isActive=
  // false — nunca fisicamente deletadas, ver comentário da FASE D15-A mais
  // abaixo) — deliberadamente diferente do SET NULL usado acima em
  // inventoryId/warehouseId/shipmentId (esses são estado operacional
  // corrente, que pode legitimamente ficar obsoleto; os campos abaixo são a
  // decisão logística CONGELADA do checkout, que nunca deve perder seu
  // ponteiro de rastreabilidade por causa de uma deleção física alheia).
  // destinationShippingSectorId deliberadamente NÃO existe aqui: já
  // congelado dentro de orders.shippingAddressJson (D16-F2). currency
  // também não é repetida aqui: orders.currency continua a única
  // autoridade monetária do child order.
  fulfillmentLocationId: varchar('fulfillment_location_id', { length: 255 }).references(() => fulfillmentLocations.id, { onDelete: 'restrict' }),
  originShippingSectorId: varchar('origin_shipping_sector_id', { length: 255 }).references(() => shippingSectors.id, { onDelete: 'restrict' }),
  shippingRouteId: varchar('shipping_route_id', { length: 255 }).references(() => shippingRoutes.id, { onDelete: 'restrict' }),
  shippingServiceId: varchar('shipping_service_id', { length: 255 }).references(() => shippingServices.id, { onDelete: 'restrict' }),
  // Snapshot textual deliberado (nunca só a FK acima): o histórico não deve
  // depender de reler shipping_services.code atual para saber qual serviço
  // foi realmente usado no checkout.
  shippingServiceCode: varchar('shipping_service_code', { length: 100 }),
  shippingRateId: varchar('shipping_rate_id', { length: 255 }).references(() => shippingRouteRates.id, { onDelete: 'restrict' }),
  // Snapshots escalares deliberados (nunca só a FK/estado atual do produto):
  // peso e valor cobrado no momento real do checkout, imunes a uma edição
  // posterior do peso do produto/variante ou da tarifa. Mesma precisão/
  // escala já usada no projeto para peso (shipping_route_rates.min/max_
  // weight_kg) e valores monetários (orders.shipping_fee, shipping_route_
  // rates.amount).
  unitWeightKg: numeric('unit_weight_kg', { precision: 8, scale: 3 }),
  totalWeightKg: numeric('total_weight_kg', { precision: 8, scale: 3 }),
  shippingAmount: numeric('shipping_amount', { precision: 12, scale: 2 }),
  fulfillmentMode: varchar('fulfillment_mode', { length: 50 }).notNull().default('SELLER_FULFILLMENT'), // NUSALI_FULFILLMENT, SELLER_FULFILLMENT
  status: varchar('status', { length: 50 }).notNull().default('pending_preparation'), // pending_preparation, preparing, ready_to_ship, shipped, cancelled
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  order_items_order_idx: index('order_items_order_idx').on(table.orderId),
  order_items_product_idx: index('order_items_product_idx').on(table.productId),
}));

export const orderStatusHistory = pgTable('order_status_history', {
  id: varchar('id', { length: 255 }).primaryKey(),
  orderId: varchar('order_id', { length: 255 }).notNull().references(() => orders.id, { onDelete: 'cascade' }),
  previousStatus: varchar('previous_status', { length: 50 }),
  newStatus: varchar('new_status', { length: 50 }).notNull(),
  reason: text('reason'),
  changedBy: varchar('changed_by', { length: 255 }).references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  order_status_history_order_created_idx: index('order_status_history_order_created_idx').on(table.orderId, table.createdAt),
}));

// ============================================================================
// 7. PAGAMENTOS, ATTEMPTS, REFUNDS E WEBHOOKS
// ============================================================================

// FASE C2 — arquitetura multi-vendedor (schema apenas; PaymentService,
// webhook, refundService e releaseEscrowForOrder permanecem INTOCADOS nesta
// fase — nenhum código ainda lê/escreve purchaseGroupId/settlementRole).
//
// orderId agora é NULLABLE: LEGADO/single-seller continua preenchendo
// orderId (purchaseGroupId NULL); um pagamento futuro de purchase_group
// (fase futura, não implementada) preencherá purchaseGroupId e deixará
// orderId NULL. payments_owner_exclusive_check garante no banco que as duas
// coisas nunca coexistem nem ficam ambas vazias. Nenhum payment histórico
// precisa de backfill para satisfazer esse CHECK: toda linha existente já
// tem orderId preenchido, e purchaseGroupId é uma coluna nova (nasce NULL
// para todas elas automaticamente).
//
// settlementRole é ortogonal ao `status` (que permanece só o ciclo de vida
// no PSP: pending/authorized/paid/failed/refunded/cancelled/expired).
// settlementRole responde "este pagamento financia algo?": candidate (ainda
// não se sabe — nenhum pagamento pendente pode ser tratado como vencedor
// antes de qualquer confirmação real), primary (é o pagamento que de fato
// financiou o(s) order(s)/allocations/escrow deste order ou purchase_group),
// surplus (pagamento realmente recebido do PSP, mas excedente — ex.: retry
// que também foi pago depois que outra tentativa já havia vencido —
// dinheiro real que precisa de reconciliação/refund próprio, sem tocar
// order/allocation/escrow). NUNCA tem DEFAULT no banco (ver nota abaixo) —
// todo INSERT novo é obrigado a declarar o valor explicitamente; setting
// implícito por omissão nunca deve promover algo a 'primary' em silêncio.
//
// Todo payment histórico (sempre single-seller, sempre a única cobrança que
// financiou seu order) é classificado como 'primary' na própria migration
// 0023, via o mecanismo "fast default" do Postgres (ADD COLUMN ... DEFAULT
// 'primary' NOT NULL seguido de ALTER COLUMN DROP DEFAULT no mesmo
// statement-breakpoint) — não um UPDATE manual. Ver comentário na migration
// 0023 para a justificativa completa dessa escolha.
export const payments = pgTable('payments', {
  id: varchar('id', { length: 255 }).primaryKey(),
  orderId: varchar('order_id', { length: 255 }).references(() => orders.id, { onDelete: 'restrict' }),
  purchaseGroupId: varchar('purchase_group_id', { length: 255 }).references(() => purchaseGroups.id, { onDelete: 'restrict' }),
  // Nunca declarar `.default(...)` nem `.$defaultFn(...)` aqui — DEFAULT
  // (SQL ou client-side) reabriria exatamente o risco que motivou este
  // desenho (INSERT que esquece o campo nasceria 'primary'/qualquer valor
  // em silêncio). NOT NULL sem nenhum default força o TypeScript a exigir
  // o valor em TODO `.values()` novo — a auditoria da Fase C3 confirmou que
  // os 3 INSERTs legítimos de runtime (paymentService.ts x2,
  // asaasPaymentProvider.ts x1) já declaram 'primary' explicitamente, então
  // não há mais nenhum call site legítimo que dependa de um default para
  // compilar. (Fase C2 usou temporariamente um `$defaultFn` que lançava, só
  // para destravar a checagem de tipos antes desta auditoria — removido
  // aqui, como planejado desde então.)
  settlementRole: varchar('settlement_role', { length: 20 }).notNull(), // candidate, primary, surplus
  buyerId: varchar('buyer_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'restrict' }),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 10 }).notNull().default('XOF'),
  provider: varchar('provider', { length: 50 }).notNull(), // pix_engine, orange_money, mtn, stripe, nusali_pay
  method: varchar('method', { length: 50 }).notNull(),
  status: varchar('status', { length: 50 }).notNull().default('pending'), // pending, authorized, paid, failed, refunded, cancelled
  transactionRef: varchar('transaction_ref', { length: 255 }),
  idempotencyKey: varchar('idempotency_key', { length: 255 }).unique(),
  qrCode: text('qr_code'),
  qrCodeBase64: text('qr_code_base64'),
  paymentUrl: text('payment_url'),
  rawResponseJson: jsonb('raw_response_json'),
  expiresAt: timestamp('expires_at'),
  paidAt: timestamp('paid_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  payments_order_idx: index('payments_order_idx').on(table.orderId),
  payments_purchase_group_idx: index('payments_purchase_group_idx').on(table.purchaseGroupId),
  payments_buyer_created_idx: index('payments_buyer_created_idx').on(table.buyerId, table.createdAt),
  payments_status_created_idx: index('payments_status_created_idx').on(table.status, table.createdAt),
  payments_transaction_ref_uq: uniqueIndex('payments_transaction_ref_uq').on(table.transactionRef),
  // Barreira final (independente do lock de aplicação) contra dois primary
  // no mesmo purchase_group — mesmo padrão de índice único parcial já usado
  // por payment_allocations_order_active_uq/refunds_idempotency_uq.
  // purchase_group_id NULL (todo pagamento legado) nunca colide entre si,
  // porque SQL nunca trata NULL = NULL como igual num índice único.
  payments_purchase_group_primary_uq: uniqueIndex('payments_purchase_group_primary_uq')
    .on(table.purchaseGroupId)
    .where(sql`${table.settlementRole} = 'primary'`),
  payments_settlement_role_check: check(
    'payments_settlement_role_check',
    sql`${table.settlementRole} IN ('candidate', 'primary', 'surplus')`
  ),
  payments_owner_exclusive_check: check(
    'payments_owner_exclusive_check',
    sql`(${table.orderId} IS NOT NULL AND ${table.purchaseGroupId} IS NULL) OR (${table.orderId} IS NULL AND ${table.purchaseGroupId} IS NOT NULL)`
  ),
}));

// FASE A — arquitetura multi-vendedor (schema apenas). Representa quanto de
// UM payment real do comprador pertence a UM order filho (1 seller). Nunca
// substitui `payments.orderId` (mantido intacto para todo pedido legado
// single-seller) — só passa a existir quando o checkout multi-vendedor
// (fase futura, NÃO implementada ainda) precisar dividir um único pagamento
// entre vários orders. Tabela vazia nesta fase; nenhum código lê/escreve
// nela ainda.
//
// UNIQUE(paymentId, orderId) é a garantia de idempotência de INSERÇÃO — nunca
// duas linhas para o mesmo par payment/order — sem precisar de uma coluna de
// idempotencyKey separada.
//
// Revisão Fase A (auditoria de retry de pagamento, antes da Fase B):
// payments.orderId NÃO é 1:1 hoje — initiatePayment reutiliza a linha
// 'pending' existente só quando ORDEM+PROVIDER coincidem (paymentService.ts,
// bloco "Reuse an already-pending payment"); uma nova tentativa com OUTRO
// provider/método cria uma segunda linha genuína em `payments` para o MESMO
// order, coexistindo com a primeira (nada no código marca a antiga como
// failed/expired). Ou seja: payment 1:N por order é uma possibilidade real
// do sistema atual, não uma hipótese. O que NUNCA pode coexistir são DUAS
// allocations financeiramente ATIVAS para o mesmo order (isso seria
// duplicação de crédito) — por isso o índice único parcial abaixo, no
// mesmo padrão já usado por refunds_idempotency_uq (índice único
// condicionado a uma coluna, não em toda a tabela): garante no Postgres que
// só existe 1 allocation com status='active' por order, mas permite
// legitimamente uma segunda linha (histórica, já 'refunded') coexistir se um
// reprocessamento genuíno precisar existir no futuro — sem inventar um
// segundo mecanismo de idempotência.
//
// amount > 0 segue EXATAMENTE o padrão já existente em
// ledger_entries_amount_check (ver ledgerEntries acima) — reaproveitado, não
// inventado. refundedAmount >= 0 é a mesma família de guarda (nunca um valor
// negativo). refundedAmount <= amount (revisão Fase A, 2ª rodada) é o
// primeiro CHECK entre duas colunas deste schema — decisão explícita, não
// automática: o Postgres suporta nativamente (CHECK enxerga toda a linha),
// sem incompatibilidade técnica encontrada.
//
// refundedAmount + status seguem o mesmo padrão já usado por outras tabelas
// financeiras deste schema (refunds.sellerDebitAmount, escrow_accounts.status)
// para permitir refund parcial por order e auditoria sem recalcular a
// qualquer momento: soma(payment_allocations.amount) deve sempre poder ser
// comparada a payments.amount para reconciliação.
export const paymentAllocations = pgTable('payment_allocations', {
  id: varchar('id', { length: 255 }).primaryKey(),
  paymentId: varchar('payment_id', { length: 255 }).notNull().references(() => payments.id, { onDelete: 'restrict' }),
  orderId: varchar('order_id', { length: 255 }).notNull().references(() => orders.id, { onDelete: 'restrict' }),
  purchaseGroupId: varchar('purchase_group_id', { length: 255 }).references(() => purchaseGroups.id, { onDelete: 'set null' }),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 10 }).notNull().default('XOF'),
  status: varchar('status', { length: 50 }).notNull().default('active'), // active, partially_refunded, refunded
  refundedAmount: numeric('refunded_amount', { precision: 12, scale: 2 }).notNull().default('0.00'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  payment_allocations_payment_order_uq: uniqueIndex('payment_allocations_payment_order_uq').on(table.paymentId, table.orderId),
  // Invariante financeira: nunca mais de 1 allocation ATIVA por order.
  payment_allocations_order_active_uq: uniqueIndex('payment_allocations_order_active_uq')
    .on(table.orderId)
    .where(sql`${table.status} = 'active'`),
  payment_allocations_order_idx: index('payment_allocations_order_idx').on(table.orderId),
  payment_allocations_payment_idx: index('payment_allocations_payment_idx').on(table.paymentId),
  payment_allocations_purchase_group_idx: index('payment_allocations_purchase_group_idx').on(table.purchaseGroupId),
  payment_allocations_amount_check: check('payment_allocations_amount_check', sql`${table.amount} > 0`),
  payment_allocations_refunded_amount_check: check('payment_allocations_refunded_amount_check', sql`${table.refundedAmount} >= 0`),
  // Revisão Fase A (2ª rodada): CHECK entre duas colunas da MESMA linha —
  // suportado nativamente pelo Postgres, sem incompatibilidade técnica.
  // Garante no banco que uma allocation nunca registra mais reembolsado do
  // que o valor que ela própria representa.
  payment_allocations_refunded_not_exceed_amount_check: check(
    'payment_allocations_refunded_not_exceed_amount_check',
    sql`${table.refundedAmount} <= ${table.amount}`
  ),
}));

export const paymentAttempts = pgTable('payment_attempts', {
  id: varchar('id', { length: 255 }).primaryKey(),
  paymentId: varchar('payment_id', { length: 255 }).notNull().references(() => payments.id, { onDelete: 'cascade' }),
  attemptNumber: integer('attempt_number').notNull().default(1),
  provider: varchar('provider', { length: 50 }).notNull(),
  status: varchar('status', { length: 50 }).notNull(),
  errorMessage: text('error_message'),
  rawPayloadJson: jsonb('raw_payload_json'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  payment_attempts_payment_idx: index('payment_attempts_payment_idx').on(table.paymentId),
}));

export const paymentCustomers = pgTable('payment_customers', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 50 }).notNull(), // asaas
  providerCustomerId: varchar('provider_customer_id', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  payment_customers_user_provider_uq: uniqueIndex('payment_customers_user_provider_uq').on(table.userId, table.provider),
  payment_customers_user_idx: index('payment_customers_user_idx').on(table.userId),
}));

// FASE C5.2-B — arquitetura multi-vendedor (schema apenas; refundService.ts,
// paymentService.ts, asaasPaymentProvider.ts e asaasWebhookService.ts
// permanecem INTOCADOS nesta fase — nenhum código ainda lê/escreve
// purchaseGroupId aqui, nem decide runtime de refund parcial/surplus).
//
// order_id agora é NULLABLE — mesma classificação já usada para
// payments.order_id na Fase C2: alteração de constraint não destrutiva e
// compatível com os dados existentes (nenhuma linha atual seria invalidada
// por deixar de exigir order_id — todas já o têm preenchido), NÃO uma
// alteração "aditiva" no sentido de nunca ter existido antes.
//
// Dois regimes, nunca misturados (owner exclusivo, mesmo padrão de
// payments_owner_exclusive_check da Fase C2):
//
//   A) REFUND DE ORDER (order_id preenchido, purchase_group_id NULL):
//      cobre tanto o refund legacy quanto o refund de um CHILD ORDER de
//      purchase_group — nos dois casos o vínculo financeiro é sempre
//      order->payment (payment PRIMARY, no caso do child), nunca
//      order->purchase_group diretamente. A relação do child com seu group
//      já é resolvida via orders.purchaseGroupId + payment_allocations —
//      não duplicada aqui.
//
//   B) REFUND DE PAYMENT/GROUP-LEVEL (purchase_group_id preenchido,
//      order_id NULL): reservado para refund de um payment SURPLUS —
//      dinheiro real recebido que nunca financiou nenhum order/allocation/
//      escrow, então não há order nenhum para associar. paymentId aponta
//      direto para o payment surplus.
//
// Nenhum campo refundKind/refundScope foi adicionado: o owner shape
// (order_id XOR purchase_group_id) já distingue os dois casos de forma
// completa e inequívoca — uma coluna extra só duplicaria essa informação
// sem necessidade estrutural comprovada (nenhuma encontrada na auditoria
// C5.2-A).
export const refunds = pgTable('refunds', {
  id: varchar('id', { length: 255 }).primaryKey(),
  paymentId: varchar('payment_id', { length: 255 }).notNull().references(() => payments.id, { onDelete: 'restrict' }),
  orderId: varchar('order_id', { length: 255 }).references(() => orders.id, { onDelete: 'restrict' }),
  // ON DELETE RESTRICT — mesmo padrão já usado por payments.purchaseGroupId
  // (Fase C2): um refund é registro financeiro/auditoria, nunca deve perder
  // seu owner silenciosamente (diferente de orders.purchaseGroupId/
  // payment_allocations.purchaseGroupId, que usam SET NULL porque são
  // referências de conveniência, não a própria prova de que o dinheiro
  // existiu).
  purchaseGroupId: varchar('purchase_group_id', { length: 255 }).references(() => purchaseGroups.id, { onDelete: 'restrict' }),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 10 }).notNull().default('XOF'),
  reason: text('reason'),
  status: varchar('status', { length: 50 }).notNull().default('pending'), // pending, processed, failed
  approvedBy: varchar('approved_by', { length: 255 }).references(() => users.id, { onDelete: 'set null' }),
  // Fase "Refund/disputa/chargeback": quanto foi de fato debitado da wallet do
  // vendedor (proporcional a orders.sellerNetAmount) — null quando o refund
  // aconteceu ANTES do escrow release (vendedor nunca recebeu, nada a debitar)
  // OU quando é um refund de payment/group-level (surplus nunca toca wallet).
  // Auditável: mostra exatamente o que aconteceu com o dinheiro do vendedor em
  // cada refund, sem precisar recalcular.
  sellerDebitAmount: numeric('seller_debit_amount', { precision: 12, scale: 2 }),
  // Chave de idempotência do CHAMADOR (refund:{refundId} para refund manual,
  // dispute_resolution:{disputeId} para disputa, chargeback:{providerEventId}
  // para chargeback, payment_refunded_webhook:{eventId} para o webhook Asaas) —
  // nunca gerada aqui a partir do próprio ID recém-criado (isso seria sempre
  // único e não protegeria nada, o mesmo bug já corrigido em seller_payouts).
  idempotencyKey: varchar('idempotency_key', { length: 255 }),
  // ==========================================================================
  // Fase C5.2-D.2 — EVIDÊNCIA/CORRELAÇÃO DE REFUND EXTERNO (schema apenas;
  // nenhum código de runtime lê/escreve estas colunas ainda — ver
  // refundService.ts, inalterado nesta fase). Preparam o terreno para o
  // fluxo futuro reserve -> external submit -> provider evidence ->
  // reconciliation -> DONE -> local finalization (D.4/D.5/D.6), auditado
  // oficialmente na Fase C5.2-D.1 contra docs.asaas.com.
  //
  // Todas nullable, SEM DEFAULT: todo refund legado (histórico e qualquer
  // linha inserida pelo runtime atual, que não muda nesta fase) nasce/
  // permanece com as 7 colunas abaixo = NULL — nenhum backfill, nenhuma
  // inferência de provider histórico (seção 3 do pedido). O owner CHECK
  // abaixo é preservado exatamente como estava.
  //
  // provider: NÃO hardcodar 'asaas' aqui (nem DEFAULT nem valor implícito) —
  // a auditoria da seção 2 confirmou que `payments.provider` já é a fonte
  // real da verdade (pix_engine, orange_money, mtn, stripe, nusali_pay,
  // asaas, ...). O runtime futuro (D.4) deve copiar
  // `refund.provider = paymentFinanciador.provider`, nunca inventar um
  // valor fixo — este projeto já suporta múltiplos providers de payment.
  provider: varchar('provider', { length: 50 }),
  // providerCorrelationKey: nossa identidade de correlação do lado externo —
  // NUNCA um id emitido pelo Asaas (a auditoria D.1 confirmou, com tripla
  // fonte oficial, que o objeto de refund individual do Asaas NÃO possui
  // campo `id` próprio, inclusive para Pix). O valor aqui é o mesmo que o
  // runtime futuro envia como `description` na POST /v3/payments/{id}/refund
  // (formato conceitual futuro: NUSALI_REFUND:<refundLocalId>) — é o único
  // campo, confirmado pela doc oficial, que ecoa de volta em
  // payment.refunds[]/GET /refunds/webhook. Chamado de "CorrelationKey" (não
  // "Description") porque descreve o PAPEL da coluna no nosso desenho, não o
  // nome do campo Asaas.
  providerCorrelationKey: varchar('provider_correlation_key', { length: 255 }),
  // providerStatus: valores REAIS do provedor externo (para Asaas, hoje:
  // PENDING | CANCELLED | DONE — auditoria D.1, seção 6) — dimensão
  // deliberadamente SEPARADA de `status` (LOCAL REFUND STATUS) acima, nunca
  // misturada (seção 21 da D.1). Varchar livre, SEM CHECK nesta fase: é
  // campo de integração externa, e um CHECK fixo hoje viraria migration
  // obrigatória no dia em que o PSP acrescentar um novo status — validação
  // de valores conhecidos é responsabilidade do runtime futuro, não do schema.
  providerStatus: varchar('provider_status', { length: 50 }),
  // providerRequestedAt: momento em que a tentativa externa foi de fato
  // iniciada (chamada da POST) — nunca confundir com `createdAt` (criação da
  // RESERVA local, que pode preceder o envio real). Sem DEFAULT NOW(): só o
  // runtime futuro, no momento exato do envio, sabe gravar isto.
  providerRequestedAt: timestamp('provider_requested_at'),
  // providerConfirmedAt: momento em que observamos providerStatus=DONE (não
  // o momento do 200 da POST, que a auditoria D.1 confirmou não ser
  // necessariamente terminal).
  providerConfirmedAt: timestamp('provider_confirmed_at'),
  // providerRawResponse: snapshot do item de payment.refunds[] correlacionado
  // (dateCreated/status/value/description/endToEndIdentifier/
  // transactionReceiptUrl/refundedSplits) — nunca access_token, headers ou
  // qualquer segredo de autenticação (seção 7 do pedido: nenhum segredo pode
  // aparecer nesta coluna).
  providerRawResponse: jsonb('provider_raw_response'),
  // lastError: código/mensagem SANITIZADA do último erro definitivo ou
  // problema de reconciliação (ex.: 400 de saldo insuficiente documentado na
  // D.1, timeout, ambiguidade). Nunca access_token/headers/stack com
  // segredos (seção 9 do pedido).
  lastError: text('last_error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  refunds_payment_idx: index('refunds_payment_idx').on(table.paymentId),
  refunds_order_idx: index('refunds_order_idx').on(table.orderId),
  refunds_purchase_group_idx: index('refunds_purchase_group_idx').on(table.purchaseGroupId),
  refunds_idempotency_uq: uniqueIndex('refunds_idempotency_uq')
    .on(table.idempotencyKey)
    .where(sql`${table.idempotencyKey} IS NOT NULL`),
  // Owner exclusivo — mesmo padrão de payments_owner_exclusive_check (Fase
  // C2): todo refund histórico já tem order_id preenchido, logo satisfaz
  // este CHECK trivialmente (purchase_group_id nasce NULL para todos eles,
  // coluna nova) — sem nenhum backfill.
  refunds_owner_exclusive_check: check(
    'refunds_owner_exclusive_check',
    sql`(${table.orderId} IS NOT NULL AND ${table.purchaseGroupId} IS NULL) OR (${table.orderId} IS NULL AND ${table.purchaseGroupId} IS NOT NULL)`
  ),
  // Fase C5.2-D.2, seção 4 — identidade externa nunca duplicada: duas rows
  // locais nunca podem representar o MESMO estorno do MESMO provider. Escopo
  // (provider, providerCorrelationKey) — não só a key isolada — porque a
  // mesma string poderia teoricamente colidir entre providers diferentes sem
  // representar o mesmo evento externo (seção 19, teste D: "provider
  // diferente + mesma correlation -> PASS estruturalmente"). Partial: nasce
  // vazio para 100% do legado (provider/providerCorrelationKey sempre NULL
  // até o runtime D.4 existir), nunca bloqueado por dado histórico.
  refunds_provider_correlation_uq: uniqueIndex('refunds_provider_correlation_uq')
    .on(table.provider, table.providerCorrelationKey)
    .where(sql`${table.provider} IS NOT NULL AND ${table.providerCorrelationKey} IS NOT NULL`),
  // Fase C5.2-D.2, seções 10-16 — ACTIVE RESERVATION (defesa em profundidade,
  // não a única proteção — locks+SELECT do fluxo de reservation continuam
  // sendo a barreira primária). Impede duas reservas simultaneamente ativas
  // do NOVO fluxo (provider-managed) para o MESMO alvo econômico.
  //
  // Por que `provider_correlation_key IS NOT NULL` distingue corretamente
  // "novo fluxo" de "legacy", sem join com orders/payments (que um índice
  // parcial do Postgres não pode fazer): todo refund legado, e toda linha
  // que o runtime ATUAL (inalterado nesta fase) insere, nasce com
  // provider_correlation_key SEMPRE NULL (seção 3) — logo nunca entra nesta
  // condição WHERE, e múltiplos refunds legados/parciais para o mesmo order
  // continuam 100% permitidos, exatamente como hoje. Só uma linha inserida
  // pelo runtime FUTURO (D.4), que explicitamente grava
  // providerCorrelationKey antes do external submit, pode colidir aqui.
  //
  // 'processed' e 'failed' são TERMINAIS (auditoria seção 12/13 do pedido:
  // 'processed' = sucesso definitivo — o próprio runtime atual só insere
  // com este status ao final de uma transação atômica que já finalizou tudo;
  // 'failed' = falha definitiva, libera nova tentativa) — por isso NÃO
  // entram nesta lista. Só os 3 estados verdadeiramente ativos/bloqueantes
  // entram: 'pending' (reserva criada, ainda não enviada), 'provider_pending'
  // (enviada, aguardando DONE) e 'ambiguous_timeout' (não reconciliado
  // ainda — seção 14: precisa continuar bloqueando até reconciliação
  // decidir). Nomes de status ainda não escritos por nenhum código (D.4/D.5
  // os introduzem) — a coluna já aceita qualquer varchar hoje.
  refunds_child_active_reservation_uq: uniqueIndex('refunds_child_active_reservation_uq')
    .on(table.orderId)
    .where(sql`${table.orderId} IS NOT NULL AND ${table.providerCorrelationKey} IS NOT NULL AND ${table.status} IN ('pending', 'provider_pending', 'ambiguous_timeout')`),
  refunds_surplus_active_reservation_uq: uniqueIndex('refunds_surplus_active_reservation_uq')
    .on(table.paymentId)
    .where(sql`${table.orderId} IS NULL AND ${table.purchaseGroupId} IS NOT NULL AND ${table.providerCorrelationKey} IS NOT NULL AND ${table.status} IN ('pending', 'provider_pending', 'ambiguous_timeout')`),
}));

export const paymentWebhookEvents = pgTable('payment_webhook_events', {
  id: varchar('id', { length: 255 }).primaryKey(),
  provider: varchar('provider', { length: 50 }).notNull(),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  eventId: varchar('event_id', { length: 255 }),
  payloadJson: jsonb('payload_json').notNull(),
  signature: varchar('signature', { length: 500 }),
  processed: boolean('processed').notNull().default(false),
  processedAt: timestamp('processed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  payment_webhook_provider_event_uq: uniqueIndex('payment_webhook_provider_event_uq').on(table.provider, table.eventId),
  payment_webhook_processed_idx: index('payment_webhook_processed_idx').on(table.processed, table.createdAt),
}));

// ============================================================================
// Fase C5.3-B — payment_chargebacks (SCHEMA APENAS; nenhum código de runtime
// lê/escreve esta tabela ainda — nenhum débito, nenhum bloqueio de release,
// nenhum webhook. Ver auditoria C5.3-A/C5.3-A.1).
//
// 1 row = 1 chargeback Asaas, identificado por (provider,
// providerChargebackId) — NUNCA por paymentId sozinho. A auditoria oficial
// C5.3-A.1 (contra o schema OpenAPI real por trás de docs.asaas.com, não só
// a prosa narrativa) confirmou que PaymentChargebackResponseDTO.id é um UUID
// real, estável e documentado (ex.: "8e784c3e-afe8-4844-bb93-6b445763"),
// recuperável via GET /v3/payments/{id}/chargeback e via GET
// /v3/chargebacks/ (coleção paginada e filtrável) — logo um mesmo payment
// PODE, estruturalmente, vir a ter mais de um chargeback ao longo do tempo;
// nada aqui assume o contrário.
//
// Chargeback NÃO é refund (C5.3-A, seção 4): esta tabela é deliberadamente
// separada de `refunds` — nunca reaproveita idempotencyKey nem o vocabulário
// de status ('processed'/'failed') do refund, porque a origem da decisão
// (emissor do cartão do comprador, nunca uma intenção local nossa) e a
// identidade (chargeback tem id próprio; refund individual do Asaas
// confirmadamente NÃO tem — C5.3-A.1, seção 1) são estruturalmente
// diferentes.
export const paymentChargebacks = pgTable('payment_chargebacks', {
  id: varchar('id', { length: 255 }).primaryKey(),
  // ON DELETE RESTRICT — mesmo padrão de refunds.paymentId: registro
  // financeiro/auditoria nunca perde seu owner silenciosamente.
  paymentId: varchar('payment_id', { length: 255 }).notNull().references(() => payments.id, { onDelete: 'restrict' }),
  // Nullable: NULL para chargeback de payment legacy (orderId preenchido
  // direto); preenchido só quando paymentId referencia um payment GROUP
  // (settlementRole candidate/primary/surplus). Snapshot/referência de
  // conveniência — paymentId continua sendo a ÚNICA autoridade financeira,
  // nunca substituída por purchaseGroupId (mesmo cuidado de
  // payment_allocations.purchaseGroupId). ON DELETE RESTRICT pelo mesmo
  // motivo de refunds.purchaseGroupId (registro de auditoria, não
  // conveniência) — diferente de orders.purchaseGroupId/
  // payment_allocations.purchaseGroupId, que usam SET NULL.
  purchaseGroupId: varchar('purchase_group_id', { length: 255 }).references(() => purchaseGroups.id, { onDelete: 'restrict' }),
  // provider: NUNCA default — copiado de payments.provider pelo runtime
  // futuro (ainda não implementado nesta fase). Mesmo cuidado de
  // refunds.provider (Fase C5.2-D.2): um default esconderia silenciosamente
  // qual provider realmente processou o chargeback.
  provider: varchar('provider', { length: 50 }).notNull(),
  // providerChargebackId: PaymentChargebackResponseDTO.id — diferente de
  // refunds.providerCorrelationKey (que é uma correlation key NOSSA, porque
  // o refund individual do Asaas não tem id), este É um id emitido pelo
  // provider, confirmado documentado.
  providerChargebackId: varchar('provider_chargeback_id', { length: 255 }).notNull(),
  // providerStatus / providerDisputeStatus / providerReason: RAW, exatamente
  // como recebido — SEM CHECK fechado (mesmo raciocínio de
  // refunds.providerStatus). A própria doc oficial instrui explicitamente: "não traduza
  // nem altere os valores dos enums... trate valores ainda não mapeados,
  // preserve o valor original" (C5.3-A.1, seção 3.3) — um CHECK fechado aqui
  // viraria migration obrigatória no dia em que a Asaas adicionar um valor
  // novo. Hoje os valores conhecidos são:
  //   providerStatus:        REQUESTED, IN_DISPUTE, DISPUTE_LOST, REVERSED, DONE
  //   providerDisputeStatus: REQUESTED, ACCEPTED, REJECTED
  // Validação/decisão financeira sobre esses valores é responsabilidade do
  // runtime futuro, nunca do schema.
  providerStatus: varchar('provider_status', { length: 50 }).notNull(),
  providerDisputeStatus: varchar('provider_dispute_status', { length: 50 }),
  providerReason: varchar('provider_reason', { length: 100 }),
  // value: snapshot do chargeback.value do provider (campo confirmado
  // existir via schema OpenAPI oficial — C5.3-A.1, seções 2 e 3). NUNCA
  // assumido igual a payments.amount — nenhum CHECK cross-table é criado
  // aqui (exigiria trigger, não CHECK simples; e a documentação nunca
  // confirma nem proíbe chargeback parcial). Runtime futuro decide.
  value: numeric('value', { precision: 12, scale: 2 }).notNull(),
  // currency: a Asaas NÃO documenta campo de moeda em
  // PaymentChargebackResponseDTO (auditado em C5.3-A.1) — este valor é
  // SEMPRE um snapshot LOCAL, copiado do payment financiador no momento da
  // persistência pelo runtime futuro, nunca um campo que "veio" do
  // provider. Sem default: nenhuma linha pode nascer com moeda inventada.
  currency: varchar('currency', { length: 10 }).notNull(),
  // disputeStartDate / deadlineToSendDisputeDocuments: datas do PROVIDER
  // (PaymentChargebackResponseDTO.disputeStartDate /
  // .deadlineToSendDisputeDocuments). Tipo timestamp por consistência com o
  // resto deste arquivo (nenhuma outra tabela usa um tipo `date` puro,
  // nem está importado) — nunca confundir com createdAt/updatedAt locais
  // abaixo, que são o ciclo de vida da NOSSA linha, não do chargeback no
  // provider.
  disputeStartDate: timestamp('dispute_start_date'),
  deadlineToSendDisputeDocuments: timestamp('deadline_to_send_dispute_documents'),
  // localStatus: enum NOSSO (não do provider) — CHECK fechado é seguro aqui
  // porque somos nós que o escrevemos, mesmo padrão de
  // payments_settlement_role_check.
  //
  // Fase C5.3-B.1 — CORREÇÃO: o DEFAULT 'active' original (C5.3-B) partia da
  // premissa errada de que "toda linha nova nasce por termos acabado de
  // observar um chargeback não-terminal". Falso: a PRIMEIRA observação de um
  // chargeback.id pode perfeitamente já chegar terminal (ex.: redelivery de
  // webhook atrasado, ou o runtime só processa o evento depois do desfecho já
  // ter ocorrido no provider) — nesse caso a linha NUNCA deveria nascer
  // 'active'. Um DEFAULT aqui esconderia exatamente esse erro de
  // classificação. Runtime (C5.3-C1) SEMPRE calcula e fornece localStatus
  // explicitamente a partir de chargeback.status observado (ver
  // mapProviderChargebackStatusToLocalStatus em refundService.ts) — nenhum
  // INSERT depende mais de um valor implícito.
  //   active         — REQUESTED/IN_DISPUTE observados, sem desfecho terminal
  //   lost           — DISPUTE_LOST observado (débito, quando implementado,
  //                    aplicado exatamente uma vez)
  //   reversed       — REVERSED observado, sem débito prévio
  //   manual_review  — fatos insuficientes/conflitantes (C5.3-A.1, item 21;
  //                    C5.3-C1: primeira observação DONE/desconhecida, ou
  //                    conflito terminal lost<->reversed)
  // Nenhum destes states aplica qualquer efeito financeiro nesta fase.
  localStatus: varchar('local_status', { length: 20 }).notNull(),
  // providerRawResponse: snapshot SANITIZADO do objeto chargeback (nunca o
  // webhook inteiro, nunca segredos/headers) — mesmo padrão de
  // refunds.providerRawResponse. Não preenchido nesta fase.
  providerRawResponse: jsonb('provider_raw_response'),
  // firstSeenEventId / lastSeenEventId: rastreabilidade, NUNCA autoridade
  // financeira — apontam conceitualmente para payment_webhook_events.
  // event_id (varchar(255), nullable, único só em par com provider — nunca
  // sozinho). SEM FK: event_id não tem constraint unique/PK isolada naquela
  // tabela (só via UNIQUE composto provider+event_id) e é nullable — uma FK
  // exigiria uma coluna alvo unique própria, que não existe; além disso um
  // campo puramente de auditoria não deveria travar numa eventual política
  // futura de retenção/purga de payment_webhook_events. Não preenchido
  // nesta fase.
  firstSeenEventId: varchar('first_seen_event_id', { length: 255 }),
  lastSeenEventId: varchar('last_seen_event_id', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  // Identidade externa: nunca duas rows para o MESMO chargeback do MESMO
  // provider. Composto (provider, providerChargebackId) — não a key isolada
  // — para manter namespace correto se outro PSP for adicionado no futuro
  // (mesmo raciocínio de refunds_provider_correlation_uq).
  payment_chargebacks_provider_external_uq: uniqueIndex('payment_chargebacks_provider_external_uq')
    .on(table.provider, table.providerChargebackId),
  payment_chargebacks_payment_idx: index('payment_chargebacks_payment_idx').on(table.paymentId),
  payment_chargebacks_purchase_group_idx: index('payment_chargebacks_purchase_group_idx')
    .on(table.purchaseGroupId)
    .where(sql`${table.purchaseGroupId} IS NOT NULL`),
  payment_chargebacks_local_status_idx: index('payment_chargebacks_local_status_idx').on(table.localStatus),
  // Suporta diretamente a futura consulta de release-blocking
  // (releaseEscrowForOrder: "existe chargeback ativo para este payment?"),
  // ainda NÃO implementada nesta fase.
  payment_chargebacks_payment_active_idx: index('payment_chargebacks_payment_active_idx')
    .on(table.paymentId, table.localStatus),
  payment_chargebacks_value_check: check('payment_chargebacks_value_check', sql`${table.value} > 0`),
  payment_chargebacks_local_status_check: check(
    'payment_chargebacks_local_status_check',
    sql`${table.localStatus} IN ('active', 'lost', 'reversed', 'manual_review')`
  ),
}));

// ============================================================================
// 8. CARTEIRA E ESCROW LEDGER
// ============================================================================

export const wallets = pgTable('wallets', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'restrict' }),
  balance: numeric('balance', { precision: 15, scale: 2 }).notNull().default('0.00'),
  cashbackBalance: numeric('cashback_balance', { precision: 15, scale: 2 }).notNull().default('0.00'),
  pendingBalance: numeric('pending_balance', { precision: 15, scale: 2 }).notNull().default('0.00'),
  currency: varchar('currency', { length: 10 }).notNull().default('XOF'),
  status: varchar('status', { length: 50 }).notNull().default('active'), // active, locked, frozen
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  // Fase 6 (correção do achado CRÍTICO C — escrow release): uma wallet por
  // usuário POR MOEDA, não mais uma única wallet global por usuário. Um
  // vendedor que recebe em BRL e XOF precisa de duas linhas — nunca um saldo
  // único somando moedas diferentes. Substitui o antigo UNIQUE(user_id) puro.
  // Ver drizzle/0016_wallets_unique_user_currency.sql.
  wallets_user_currency_uq: uniqueIndex('wallets_user_currency_uq').on(table.userId, table.currency),
}));

export const walletTransactions = pgTable('wallet_transactions', {
  id: varchar('id', { length: 255 }).primaryKey(),
  walletId: varchar('wallet_id', { length: 255 }).notNull().references(() => wallets.id, { onDelete: 'restrict' }),
  type: varchar('type', { length: 50 }).notNull(), // deposit, purchase, cashback, refund, payout, transfer
  amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 10 }).notNull().default('XOF'),
  title: varchar('title', { length: 255 }).notNull(),
  referenceId: varchar('reference_id', { length: 255 }),
  referenceType: varchar('reference_type', { length: 100 }), // order, refund, withdrawal
  status: varchar('status', { length: 50 }).notNull().default('completed'), // completed, pending, cancelled
  balanceAfter: numeric('balance_after', { precision: 15, scale: 2 }).notNull(),
  idempotencyKey: varchar('idempotency_key', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  wallet_transactions_wallet_created_idx: index('wallet_transactions_wallet_created_idx').on(table.walletId, table.createdAt),
  wallet_transactions_idempotency_uq: uniqueIndex('wallet_transactions_idempotency_uq').on(table.idempotencyKey),
}));

export const escrowAccounts = pgTable('escrow_accounts', {
  id: varchar('id', { length: 255 }).primaryKey(),
  orderId: varchar('order_id', { length: 255 }).notNull().unique().references(() => orders.id, { onDelete: 'restrict' }),
  buyerId: varchar('buyer_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'restrict' }),
  sellerId: varchar('seller_id', { length: 255 }).notNull().references(() => sellers.id, { onDelete: 'restrict' }),
  amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 10 }).notNull().default('XOF'),
  status: varchar('status', { length: 50 }).notNull().default('held'), // held, eligible, released, disputed, refunded
  releaseEligibleAt: timestamp('release_eligible_at'),
  releasedAt: timestamp('released_at'),
  disputedAt: timestamp('disputed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const escrowTransactions = pgTable('escrow_transactions', {
  id: varchar('id', { length: 255 }).primaryKey(),
  escrowAccountId: varchar('escrow_account_id', { length: 255 }).notNull().references(() => escrowAccounts.id, { onDelete: 'restrict' }),
  type: varchar('type', { length: 50 }).notNull(), // HOLD, RELEASE_SELLER, REFUND_BUYER, DISPUTE_LOCK
  amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 10 }).notNull().default('XOF'),
  reason: text('reason'),
  performedBy: varchar('performed_by', { length: 255 }).references(() => users.id, { onDelete: 'set null' }),
  reference: varchar('reference', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  escrow_transactions_account_created_idx: index('escrow_transactions_account_created_idx').on(table.escrowAccountId, table.createdAt),
}));

export const sellerPayouts = pgTable('seller_payouts', {
  id: varchar('id', { length: 255 }).primaryKey(),
  sellerId: varchar('seller_id', { length: 255 }).notNull().references(() => sellers.id, { onDelete: 'restrict' }),
  amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 10 }).notNull().default('XOF'),
  method: varchar('method', { length: 50 }).notNull(), // bank_transfer, pix, orange_money, mtn
  bankAccountId: varchar('bank_account_id', { length: 255 }).references(() => sellerBankAccounts.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 50 }).notNull().default('pending'), // pending, processing, completed, failed
  processedAt: timestamp('processed_at'),
  transactionRef: varchar('transaction_ref', { length: 255 }),
  // Fase "Payout multi-moeda": chave de idempotência fornecida pelo cliente na
  // solicitação — protege contra um retry de rede reenviando a mesma ação do
  // usuário e reservando saldo duas vezes. Nullable porque payouts antigos nunca
  // tiveram essa chave; índice único parcial (só quando não-nulo) permite isso
  // sem quebrar o histórico.
  idempotencyKey: varchar('idempotency_key', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  seller_payouts_seller_status_idx: index('seller_payouts_seller_status_idx').on(table.sellerId, table.status),
  seller_payouts_idempotency_uq: uniqueIndex('seller_payouts_idempotency_uq')
    .on(table.idempotencyKey)
    .where(sql`${table.idempotencyKey} IS NOT NULL`),
}));

// ============================================================================
// 9. LOGÍSTICA, ENVIOS E RASTREAMENTO
// ============================================================================

export const shipments = pgTable('shipments', {
  id: varchar('id', { length: 255 }).primaryKey(),
  orderId: varchar('order_id', { length: 255 }).notNull().references(() => orders.id, { onDelete: 'restrict' }),
  orderItemId: varchar('order_item_id', { length: 255 }).references(() => orderItems.id, { onDelete: 'set null' }),
  sellerId: varchar('seller_id', { length: 255 }).references(() => sellers.id, { onDelete: 'set null' }),
  buyerId: varchar('buyer_id', { length: 255 }).references(() => users.id, { onDelete: 'set null' }),
  fulfillmentMode: varchar('fulfillment_mode', { length: 50 }).notNull().default('SELLER_FULFILLMENT'),
  // carrier (texto livre) é preservado por compatibilidade com os 26
  // shipments históricos já existentes (nenhuma conversão/backfill
  // automático) — novos shipments devem preferir carrierId (FK real).
  carrier: varchar('carrier', { length: 100 }),
  carrierId: varchar('carrier_id', { length: 255 }).references(() => carriers.id, { onDelete: 'set null' }),
  trackingNumber: varchar('tracking_number', { length: 100 }).notNull().unique(),
  serviceType: varchar('service_type', { length: 50 }).default('standard'), // standard, express, full
  status: varchar('status', { length: 50 }).notNull().default('READY_TO_SHIP'), // READY_TO_SHIP, SHIPPED, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED, DELIVERY_FAILED, RETURNING, RETURNED, CANCELLED
  originWarehouseId: varchar('origin_warehouse_id', { length: 255 }).references(() => warehouses.id, { onDelete: 'set null' }),
  originCountry: varchar('origin_country', { length: 10 }).notNull(),
  destinationCountry: varchar('destination_country', { length: 10 }).notNull(),
  recipientName: varchar('recipient_name', { length: 255 }),
  recipientAddressJson: jsonb('recipient_address_json'),
  senderName: varchar('sender_name', { length: 255 }),
  senderAddressJson: jsonb('sender_address_json'),
  shippingLabelUrl: text('shipping_label_url'),
  estimatedDeliveryDate: varchar('estimated_delivery_date', { length: 100 }),
  shippedAt: timestamp('shipped_at'),
  deliveredAt: timestamp('delivered_at'),
  receivedBy: varchar('received_by', { length: 255 }),
  failureReason: text('failure_reason'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  shipments_order_idx: index('shipments_order_idx').on(table.orderId),
  shipments_status_idx: index('shipments_status_idx').on(table.status),
  shipments_seller_idx: index('shipments_seller_idx').on(table.sellerId),
  shipments_buyer_idx: index('shipments_buyer_idx').on(table.buyerId),
}));

export const shippingLabels = pgTable('shipping_labels', {
  id: varchar('id', { length: 255 }).primaryKey(),
  shipmentId: varchar('shipment_id', { length: 255 }).notNull().references(() => shipments.id, { onDelete: 'cascade' }),
  trackingCode: varchar('tracking_code', { length: 100 }).notNull(),
  labelDataUrl: text('label_data_url'),
  qrCodeData: text('qr_code_data'),
  format: varchar('format', { length: 20 }).default('a6'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  shipping_labels_shipment_idx: index('shipping_labels_shipment_idx').on(table.shipmentId),
}));

export const trackingEvents = pgTable('tracking_events', {
  id: varchar('id', { length: 255 }).primaryKey(),
  shipmentId: varchar('shipment_id', { length: 255 }).notNull().references(() => shipments.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 100 }).notNull(),
  description: text('description').notNull(),
  location: varchar('location', { length: 255 }),
  performedBy: varchar('performed_by', { length: 255 }).references(() => users.id, { onDelete: 'set null' }),
  eventTime: timestamp('event_time').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  tracking_events_shipment_time_idx: index('tracking_events_shipment_time_idx').on(table.shipmentId, table.eventTime),
}));

export const proofOfDelivery = pgTable('proof_of_delivery', {
  id: varchar('id', { length: 255 }).primaryKey(),
  shipmentId: varchar('shipment_id', { length: 255 }).notNull().references(() => shipments.id, { onDelete: 'cascade' }),
  receivedBy: varchar('received_by', { length: 255 }).notNull(),
  deliveredAt: timestamp('delivered_at').defaultNow().notNull(),
  proofType: varchar('proof_type', { length: 50 }).notNull().default('BUYER_CONFIRMATION'), // BUYER_CONFIRMATION, SIGNATURE, OTP, PHOTO
  proofUrl: text('proof_url'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  proof_of_delivery_shipment_idx: index('proof_of_delivery_shipment_idx').on(table.shipmentId),
}));

// ============================================================================
// 10. PROMOÇÕES, CUPONS E CAMPANHAS
// ============================================================================

export const coupons = pgTable('coupons', {
  id: varchar('id', { length: 255 }).primaryKey(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  title: varchar('title', { length: 255 }).notNull(),
  discountType: varchar('discount_type', { length: 20 }).notNull(), // percentage, fixed
  discountValue: numeric('discount_value', { precision: 10, scale: 2 }).notNull(),
  minimumSpend: numeric('minimum_spend', { precision: 10, scale: 2 }).default('0.00'),
  maxDiscount: numeric('max_discount', { precision: 10, scale: 2 }),
  usageLimit: integer('usage_limit').default(1000),
  usageCount: integer('usage_count').default(0),
  startDate: timestamp('start_date'),
  endDate: timestamp('end_date'),
  countryCode: varchar('country_code', { length: 10 }).default('GW'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const couponUsages = pgTable('coupon_usages', {
  id: varchar('id', { length: 255 }).primaryKey(),
  couponId: varchar('coupon_id', { length: 255 }).notNull().references(() => coupons.id, { onDelete: 'restrict' }),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'restrict' }),
  orderId: varchar('order_id', { length: 255 }).notNull().references(() => orders.id, { onDelete: 'restrict' }),
  discountApplied: numeric('discount_applied', { precision: 10, scale: 2 }).notNull(),
  usedAt: timestamp('used_at').defaultNow().notNull(),
}, (table) => ({
  coupon_usages_coupon_idx: index('coupon_usages_coupon_idx').on(table.couponId),
  coupon_usages_user_idx: index('coupon_usages_user_idx').on(table.userId),
  coupon_usages_coupon_user_order_uq: uniqueIndex('coupon_usages_coupon_user_order_uq').on(table.couponId, table.userId, table.orderId),
}));

export const campaigns = pgTable('campaigns', {
  id: varchar('id', { length: 255 }).primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  bannerUrl: text('banner_url'),
  discountPercentage: integer('discount_percentage').default(10),
  startDate: timestamp('start_date'),
  endDate: timestamp('end_date'),
  countryCode: varchar('country_code', { length: 10 }).default('GW'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============================================================================
// 11. AVALIAÇÕES, PERGUNTAS E FAVORITOS
// ============================================================================

export const reviews = pgTable('reviews', {
  id: varchar('id', { length: 255 }).primaryKey(),
  productId: varchar('product_id', { length: 255 }).notNull().references(() => products.id, { onDelete: 'restrict' }),
  orderId: varchar('order_id', { length: 255 }).references(() => orders.id, { onDelete: 'set null' }),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'restrict' }),
  rating: integer('rating').notNull(),
  title: varchar('title', { length: 255 }),
  comment: text('comment').notNull(),
  authorName: varchar('author_name', { length: 255 }).notNull(),
  authorCountry: varchar('author_country', { length: 10 }).default('GW'),
  isVerifiedPurchase: boolean('is_verified_purchase').default(true),
  helpfulCount: integer('helpful_count').default(0),
  status: varchar('status', { length: 50 }).notNull().default('approved'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  reviews_product_status_idx: index('reviews_product_status_idx').on(table.productId, table.status),
  reviews_user_product_order_uq: uniqueIndex('reviews_user_product_order_uq').on(table.userId, table.productId, table.orderId),
}));

export const reviewImages = pgTable('review_images', {
  id: varchar('id', { length: 255 }).primaryKey(),
  reviewId: varchar('review_id', { length: 255 }).notNull().references(() => reviews.id, { onDelete: 'cascade' }),
  imageUrl: text('image_url').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  review_images_review_idx: index('review_images_review_idx').on(table.reviewId),
}));

export const productQuestions = pgTable('product_questions', {
  id: varchar('id', { length: 255 }).primaryKey(),
  productId: varchar('product_id', { length: 255 }).notNull().references(() => products.id, { onDelete: 'cascade' }),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  question: text('question').notNull(),
  status: varchar('status', { length: 50 }).notNull().default('published'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  product_questions_product_idx: index('product_questions_product_idx').on(table.productId),
}));

export const productAnswers = pgTable('product_answers', {
  id: varchar('id', { length: 255 }).primaryKey(),
  questionId: varchar('question_id', { length: 255 }).notNull().references(() => productQuestions.id, { onDelete: 'cascade' }),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  answer: text('answer').notNull(),
  isSeller: boolean('is_seller').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  product_answers_question_idx: index('product_answers_question_idx').on(table.questionId),
}));

export const favorites = pgTable('favorites', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  productId: varchar('product_id', { length: 255 }).notNull().references(() => products.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  favorites_user_product_uq: uniqueIndex('favorites_user_product_uq').on(table.userId, table.productId),
  favorites_user_idx: index('favorites_user_idx').on(table.userId),
}));

// ============================================================================
// 12. DEVOLUÇÕES E DISPUTAS
// ============================================================================

export const returns = pgTable('returns', {
  id: varchar('id', { length: 255 }).primaryKey(),
  orderId: varchar('order_id', { length: 255 }).notNull().references(() => orders.id, { onDelete: 'restrict' }),
  buyerId: varchar('buyer_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'restrict' }),
  sellerId: varchar('seller_id', { length: 255 }).references(() => sellers.id, { onDelete: 'set null' }),
  reason: text('reason').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 10 }).notNull().default('XOF'),
  status: varchar('status', { length: 50 }).notNull().default('pending_approval'), // pending_approval, label_generated, item_shipped, received_inspected, refunded, rejected
  trackingCode: varchar('tracking_code', { length: 100 }),
  resolution: text('resolution'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  returns_order_idx: index('returns_order_idx').on(table.orderId),
  returns_buyer_status_idx: index('returns_buyer_status_idx').on(table.buyerId, table.status),
}));

export const disputes = pgTable('disputes', {
  id: varchar('id', { length: 255 }).primaryKey(),
  orderId: varchar('order_id', { length: 255 }).notNull().references(() => orders.id, { onDelete: 'restrict' }),
  buyerId: varchar('buyer_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'restrict' }),
  sellerId: varchar('seller_id', { length: 255 }).notNull().references(() => sellers.id, { onDelete: 'restrict' }),
  reason: text('reason').notNull(),
  description: text('description').notNull(),
  status: varchar('status', { length: 50 }).notNull().default('open'), // open, in_mediation, resolved_buyer, resolved_seller, cancelled
  claimAmount: numeric('claim_amount', { precision: 12, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 10 }).notNull().default('XOF'),
  resolution: text('resolution'),
  refundAmount: numeric('refund_amount', { precision: 12, scale: 2 }),
  arbitratorId: varchar('arbitrator_id', { length: 255 }).references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  disputes_order_idx: index('disputes_order_idx').on(table.orderId),
  disputes_status_idx: index('disputes_status_idx').on(table.status),
}));

export const disputeMessages = pgTable('dispute_messages', {
  id: varchar('id', { length: 255 }).primaryKey(),
  disputeId: varchar('dispute_id', { length: 255 }).notNull().references(() => disputes.id, { onDelete: 'cascade' }),
  senderId: varchar('sender_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'restrict' }),
  senderRole: varchar('sender_role', { length: 50 }).notNull(), // buyer, seller, admin, mediator
  message: text('message').notNull(),
  attachmentsJson: jsonb('attachments_json'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  dispute_messages_dispute_created_idx: index('dispute_messages_dispute_created_idx').on(table.disputeId, table.createdAt),
}));

// ============================================================================
// 13. NOTIFICAÇÕES, MENSAGENS E ATENDIMENTO
// ============================================================================

export const notifications = pgTable('notifications', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  message: text('message').notNull(),
  type: varchar('type', { length: 50 }).notNull().default('system'), // order, payment, escrow, promotion, security, system
  link: varchar('link', { length: 500 }),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  notifications_user_read_created_idx: index('notifications_user_read_created_idx').on(table.userId, table.isRead, table.createdAt),
}));

export const conversations = pgTable('conversations', {
  id: varchar('id', { length: 255 }).primaryKey(),
  orderId: varchar('order_id', { length: 255 }).references(() => orders.id, { onDelete: 'set null' }),
  buyerId: varchar('buyer_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'restrict' }),
  sellerId: varchar('seller_id', { length: 255 }).notNull().references(() => sellers.id, { onDelete: 'restrict' }),
  subject: varchar('subject', { length: 255 }),
  status: varchar('status', { length: 50 }).notNull().default('open'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  conversations_buyer_idx: index('conversations_buyer_idx').on(table.buyerId),
  conversations_seller_idx: index('conversations_seller_idx').on(table.sellerId),
}));

export const messages = pgTable('messages', {
  id: varchar('id', { length: 255 }).primaryKey(),
  conversationId: varchar('conversation_id', { length: 255 }).notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  senderId: varchar('sender_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'restrict' }),
  senderRole: varchar('sender_role', { length: 50 }).notNull(),
  message: text('message').notNull(),
  attachmentsJson: jsonb('attachments_json'),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  messages_conversation_created_idx: index('messages_conversation_created_idx').on(table.conversationId, table.createdAt),
}));

export const supportTickets = pgTable('support_tickets', {
  id: varchar('id', { length: 255 }).primaryKey(),
  ticketNumber: varchar('ticket_number', { length: 50 }).notNull().unique(),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'restrict' }),
  subject: varchar('subject', { length: 255 }).notNull(),
  category: varchar('category', { length: 100 }).notNull(),
  priority: varchar('priority', { length: 50 }).notNull().default('medium'), // low, medium, high, urgent
  status: varchar('status', { length: 50 }).notNull().default('open'), // open, pending_user, in_progress, resolved, closed
  assignedTo: varchar('assigned_to', { length: 255 }).references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  support_tickets_user_status_idx: index('support_tickets_user_status_idx').on(table.userId, table.status),
  support_tickets_assigned_status_idx: index('support_tickets_assigned_status_idx').on(table.assignedTo, table.status),
}));

export const supportTicketMessages = pgTable('support_ticket_messages', {
  id: varchar('id', { length: 255 }).primaryKey(),
  ticketId: varchar('ticket_id', { length: 255 }).notNull().references(() => supportTickets.id, { onDelete: 'cascade' }),
  senderId: varchar('sender_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'restrict' }),
  senderRole: varchar('sender_role', { length: 50 }).notNull(),
  message: text('message').notNull(),
  attachmentsJson: jsonb('attachments_json'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  support_ticket_messages_ticket_created_idx: index('support_ticket_messages_ticket_created_idx').on(table.ticketId, table.createdAt),
}));

// ============================================================================
// 14. ESTRUTURA INTERNACIONAL, ADMINISTRAÇÃO E AUDITORIA
// ============================================================================

export const countries = pgTable('countries', {
  id: varchar('id', { length: 10 }).primaryKey(), // GW, BR, PT, AO, US, MZ, CV, ST
  code: varchar('code', { length: 10 }).notNull().unique(),
  name: varchar('name', { length: 150 }).notNull(),
  flag: varchar('flag', { length: 20 }).notNull(),
  currency: varchar('currency', { length: 10 }).notNull(),
  currencySymbol: varchar('currency_symbol', { length: 20 }).notNull(),
  phonePrefix: varchar('phone_prefix', { length: 20 }).notNull(),
  exchangeRateToUSD: numeric('exchange_rate_to_usd', { precision: 12, scale: 4 }).notNull().default('1.0000'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const regions = pgTable('regions', {
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  countryCode: varchar('country_code', { length: 10 }).notNull().default('GW').references(() => countries.code, { onDelete: 'restrict' }),
  supervisorName: varchar('supervisor_name', { length: 255 }),
  supervisorEmail: varchar('supervisor_email', { length: 255 }),
  deliveryCoverageDays: varchar('delivery_coverage_days', { length: 100 }),
  freightBaseRate: varchar('freight_base_rate', { length: 100 }),
  status: varchar('status', { length: 50 }).notNull().default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  regions_country_idx: index('regions_country_idx').on(table.countryCode),
}));

export const countryRepresentatives = pgTable('country_representatives', {
  id: varchar('id', { length: 255 }).primaryKey(),
  countryCode: varchar('country_code', { length: 10 }).notNull().references(() => countries.code, { onDelete: 'restrict' }),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }).notNull(),
  status: varchar('status', { length: 50 }).notNull().default('active'),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  country_representatives_country_idx: index('country_representatives_country_idx').on(table.countryCode),
}));

// ============================================================================
// FASE D15-A — FUNDAÇÃO DE ROTAS DE FRETE POR SETOR (país > região > setor >
// rota origem-setor→destino-setor > serviço > tarifa por faixa de peso).
//
// Sistema PARALELO ao modelo país/zona já existente acima (shippingZones/
// shippingRates/storeShippingPolicies) — NENHUMA dessas tabelas foi alterada
// e o checkout (ShippingCalculatorService/orderService.ts) NÃO usa este
// modelo novo ainda; a integração é uma fase futura (D15-B). Nenhum pedido
// histórico é afetado.
//
// "regions" (tabela RBAC logo acima) é um domínio DIFERENTE — supervisão
// territorial de pessoas (supervisorEmail texto livre, freightBaseRate nunca
// lido por nenhum cálculo real, só 4 linhas de demonstração). Não é
// reaproveitada aqui de propósito, para nunca confundir os dois conceitos:
// "Região Cacheu" (RBAC, se existisse) nunca é a mesma entidade que
// "Região Cacheu" -> "Setor Cacheu" deste módulo de frete.
//
// Todas as FKs desta cadeia são ON DELETE RESTRICT (nunca CASCADE): a
// operação administrativa normal é isActive=false (+ deletedAt em
// shipping_routes) — nunca DELETE físico. Isso preserva rotas/tarifas
// históricas mesmo que uma região/setor pare de ser usada.
// ============================================================================

export const shippingRegions = pgTable('shipping_regions', {
  id: varchar('id', { length: 255 }).primaryKey(),
  countryCode: varchar('country_code', { length: 10 }).notNull().references(() => countries.code, { onDelete: 'restrict' }),
  name: varchar('name', { length: 255 }).notNull(),
  code: varchar('code', { length: 100 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  shipping_regions_country_code_uq: uniqueIndex('shipping_regions_country_code_uq').on(table.countryCode, table.code),
  shipping_regions_country_idx: index('shipping_regions_country_idx').on(table.countryCode),
}));

export const shippingSectors = pgTable('shipping_sectors', {
  id: varchar('id', { length: 255 }).primaryKey(),
  countryCode: varchar('country_code', { length: 10 }).notNull().references(() => countries.code, { onDelete: 'restrict' }),
  // RESTRICT (ajuste 1): uma região com setores vinculados nunca pode ser
  // removida fisicamente — só desativada (shipping_regions.isActive=false).
  regionId: varchar('region_id', { length: 255 }).notNull().references(() => shippingRegions.id, { onDelete: 'restrict' }),
  name: varchar('name', { length: 255 }).notNull(),
  code: varchar('code', { length: 100 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  shipping_sectors_country_code_uq: uniqueIndex('shipping_sectors_country_code_uq').on(table.countryCode, table.code),
  shipping_sectors_region_idx: index('shipping_sectors_region_idx').on(table.regionId),
  shipping_sectors_country_idx: index('shipping_sectors_country_idx').on(table.countryCode),
}));

export const shippingRoutes = pgTable('shipping_routes', {
  id: varchar('id', { length: 255 }).primaryKey(),
  countryCode: varchar('country_code', { length: 10 }).notNull().references(() => countries.code, { onDelete: 'restrict' }),
  // RESTRICT (ajuste 1): um setor referenciado por qualquer rota nunca pode
  // ser removido fisicamente — só desativado.
  originSectorId: varchar('origin_sector_id', { length: 255 }).notNull().references(() => shippingSectors.id, { onDelete: 'restrict' }),
  destinationSectorId: varchar('destination_sector_id', { length: 255 }).notNull().references(() => shippingSectors.id, { onDelete: 'restrict' }),
  isActive: boolean('is_active').notNull().default(true),
  // Remoção lógica (regra 5 do pedido): rotas nunca desaparecem fisicamente
  // se puderem ter sido usadas por pedidos no futuro — isActive=false para
  // "parar de oferecer", deletedAt como remoção lógica adicional se um dia
  // for necessário distinguir "nunca existiu" de "existiu e foi desativada".
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  shipping_routes_country_origin_dest_uq: uniqueIndex('shipping_routes_country_origin_dest_uq').on(table.countryCode, table.originSectorId, table.destinationSectorId),
  shipping_routes_origin_idx: index('shipping_routes_origin_idx').on(table.originSectorId),
  shipping_routes_destination_idx: index('shipping_routes_destination_idx').on(table.destinationSectorId),
  shipping_routes_country_idx: index('shipping_routes_country_idx').on(table.countryCode),
}));

export const shippingServices = pgTable('shipping_services', {
  id: varchar('id', { length: 255 }).primaryKey(),
  countryCode: varchar('country_code', { length: 10 }).notNull().references(() => countries.code, { onDelete: 'restrict' }),
  name: varchar('name', { length: 255 }).notNull(),
  code: varchar('code', { length: 100 }).notNull(), // ex.: STANDARD, ECONOMY, EXPRESS
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  shipping_services_country_code_uq: uniqueIndex('shipping_services_country_code_uq').on(table.countryCode, table.code),
}));

// Nome deliberadamente DIFERENTE de "shipping_rates" (tabela já existente,
// modelo país↔país, ativamente usada pelo checkout hoje) — evita colisão de
// nome e evita qualquer confusão entre os dois sistemas paralelos.
export const shippingRouteRates = pgTable('shipping_route_rates', {
  id: varchar('id', { length: 255 }).primaryKey(),
  // RESTRICT (ajuste 1): uma rota/serviço com tarifas cadastradas nunca pode
  // ser removida fisicamente — só desativada. Preserva histórico de tarifas.
  routeId: varchar('route_id', { length: 255 }).notNull().references(() => shippingRoutes.id, { onDelete: 'restrict' }),
  serviceId: varchar('service_id', { length: 255 }).notNull().references(() => shippingServices.id, { onDelete: 'restrict' }),
  // Semântica documentada e validada em código: [minWeightKg, maxWeightKg) —
  // mínimo inclusivo, máximo exclusivo. 1kg pertence à faixa que o CONTÉM
  // como mínimo, nunca à faixa anterior que o teria como máximo.
  minWeightKg: numeric('min_weight_kg', { precision: 8, scale: 3 }).notNull(),
  maxWeightKg: numeric('max_weight_kg', { precision: 8, scale: 3 }).notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  // Moeda por tarifa/mercado — nunca hardcoded (Guiné-Bissau usa XOF, não BRL).
  currency: varchar('currency', { length: 10 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  validFrom: timestamp('valid_from'),
  validUntil: timestamp('valid_until'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  shipping_route_rates_route_idx: index('shipping_route_rates_route_idx').on(table.routeId),
  shipping_route_rates_service_idx: index('shipping_route_rates_service_idx').on(table.serviceId),
  shipping_route_rates_min_weight_check: check('shipping_route_rates_min_weight_check', sql`${table.minWeightKg} >= 0`),
  shipping_route_rates_max_gt_min_check: check('shipping_route_rates_max_gt_min_check', sql`${table.maxWeightKg} > ${table.minWeightKg}`),
  shipping_route_rates_amount_check: check('shipping_route_rates_amount_check', sql`${table.amount} >= 0`),
}));

export const platformSettings = pgTable('platform_settings', {
  key: varchar('key', { length: 255 }).primaryKey(),
  valueJson: jsonb('value_json').notNull(),
  description: text('description'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: varchar('id', { length: 255 }).primaryKey(),
  actorUserId: varchar('actor_user_id', { length: 255 }).references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 150 }).notNull(),
  resource: varchar('resource', { length: 150 }).notNull(),
  resourceId: varchar('resource_id', { length: 255 }),
  detailsJson: jsonb('details_json'),
  ipAddress: varchar('ip_address', { length: 100 }),
  userAgent: text('user_agent'),
  countryCode: varchar('country_code', { length: 10 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  audit_logs_actor_created_idx: index('audit_logs_actor_created_idx').on(table.actorUserId, table.createdAt),
  audit_logs_resource_idx: index('audit_logs_resource_idx').on(table.resource, table.resourceId),
  audit_logs_created_idx: index('audit_logs_created_idx').on(table.createdAt),
}));

export const riskEvents = pgTable('risk_events', {
  id: varchar('id', { length: 255 }).primaryKey(),
  entityType: varchar('entity_type', { length: 100 }).notNull(), // user, order, payment, seller
  entityId: varchar('entity_id', { length: 255 }).notNull(),
  riskScore: varchar('risk_score', { length: 50 }).notNull(),
  triggerReason: text('trigger_reason').notNull(),
  actionTaken: varchar('action_taken', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  risk_events_entity_idx: index('risk_events_entity_idx').on(table.entityType, table.entityId),
  risk_events_created_idx: index('risk_events_created_idx').on(table.createdAt),
}));

// ============================================================================
// 15. LEDGER FINANCEIRO — FASE 5A (FUNDAÇÃO / SHADOW)
//
// Fonte de verdade contábil de dupla entrada, projetada na Fase 4B e implementada
// aqui em modo shadow: grava em paralelo ao fluxo legado (orders/payments/escrow_
// accounts/wallets), sem substituir nenhum deles ainda. Ver ADR em
// src/server/modules/ledger/financialLedgerService.ts para o racional completo.
//
// Regras que o schema por si só NÃO consegue expressar (exigem trigger em SQL —
// ver drizzle/0011_ledger_financial_foundation.sql, revisão pós-auditoria):
//   - ledger_entries.currency deve bater com a moeda de ledger_accounts.currency
//     E com a moeda de ledger_transactions.currency (uma transaction não pode
//     misturar duas moedas);
//   - ledger_entries só pode ser INSERIDA/alterada/apagada enquanto a transaction-
//     pai está DRAFT — inclusive INSERT, não só UPDATE/DELETE;
//   - ledger_transactions: DRAFT->POSTED livre; POSTED só pode virar REVERSED e
//     nenhum outro campo pode mudar nessa transição; REVERSED é terminal;
//     POSTED/REVERSED nunca podem ser fisicamente apagadas;
//   - ledger_accounts.owner_id (polimórfico, sem FK possível) é validado contra
//     sellers.id/users.id conforme owner_type; sellers/users ganham um trigger
//     que impede DELETE enquanto ainda houver uma ledger_accounts vinculada;
//   - uma ledger_transaction POSTED tem que somar zero (débito=crédito) por moeda —
//     verificado por um CONSTRAINT TRIGGER DEFERRABLE INITIALLY DEFERRED, porque a
//     regra depende da soma de várias linhas de outra tabela, o que um CHECK comum
//     (avalia só a própria linha) não consegue expressar. Combinado com as regras
//     de imutabilidade acima, esse resultado fica congelado para sempre depois de
//     POSTED — não existe mais nenhum caminho (INSERT de entry, UPDATE de status)
//     capaz de desbalancear uma transaction já aprovada.
// ============================================================================

export const ledgerAccounts = pgTable('ledger_accounts', {
  id: varchar('id', { length: 255 }).primaryKey(), // determinístico: `${code}:${ownerType}:${ownerId}:${currency}` (ou sem ownerId para PLATFORM)
  code: varchar('code', { length: 50 }).notNull(), // PAYMENT_CLEARING, BUYER_ESCROW, SELLER_PAYABLE, ...
  ownerType: varchar('owner_type', { length: 20 }).notNull(), // PLATFORM | SELLER | BUYER
  ownerId: varchar('owner_id', { length: 255 }), // nulo para contas PLATFORM (pool único por moeda)
  currency: varchar('currency', { length: 10 }).notNull(),
  normalBalance: varchar('normal_balance', { length: 10 }).notNull(), // DEBIT | CREDIT
  isClearing: boolean('is_clearing').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  // Unicidade correta com owner_id nulo: um UNIQUE comum trata cada NULL como distinto
  // (permitiria N contas PLATFORM "iguais"). Dois índices únicos parciais resolvem isso.
  ledger_accounts_owned_uq: uniqueIndex('ledger_accounts_owned_uq')
    .on(table.code, table.ownerType, table.ownerId, table.currency)
    .where(sql`${table.ownerId} IS NOT NULL`),
  ledger_accounts_platform_uq: uniqueIndex('ledger_accounts_platform_uq')
    .on(table.code, table.ownerType, table.currency)
    .where(sql`${table.ownerId} IS NULL`),
  ledger_accounts_normal_balance_check: check('ledger_accounts_normal_balance_check', sql`${table.normalBalance} IN ('DEBIT','CREDIT')`),
  ledger_accounts_owner_type_check: check('ledger_accounts_owner_type_check', sql`${table.ownerType} IN ('PLATFORM','SELLER','BUYER')`),
  ledger_accounts_owner_id_platform_check: check(
    'ledger_accounts_owner_id_platform_check',
    sql`(${table.ownerType} = 'PLATFORM' AND ${table.ownerId} IS NULL) OR (${table.ownerType} <> 'PLATFORM' AND ${table.ownerId} IS NOT NULL)`
  ),
  // Catálogo fechado — os 13 códigos de accounts.ts (ACCOUNT_DEFINITIONS). Um typo
  // num code novo passa a ser rejeitado pelo banco, não aceito como conta nova.
  ledger_accounts_code_check: check(
    'ledger_accounts_code_check',
    sql`${table.code} IN ('PAYMENT_CLEARING','BUYER_ESCROW','SELLER_PAYABLE','SELLER_AVAILABLE','SELLER_PAYOUT_CLEARING','NUSALI_COMMISSION_REVENUE','SHIPPING_PAYABLE','SHIPPING_SUBSIDY_NUSALI','TAX_PAYABLE','REFUND_PAYABLE','CHARGEBACK_RECEIVABLE','PAYMENT_PROCESSOR_FEES','NUSALI_PROMOTION_EXPENSE')`
  ),
}));

export const ledgerTransactions = pgTable('ledger_transactions', {
  id: varchar('id', { length: 255 }).primaryKey(),
  type: varchar('type', { length: 50 }).notNull(), // PAYMENT_RECEIVED, ORDER_DELIVERY_CONFIRMED, ...
  status: varchar('status', { length: 20 }).notNull().default('DRAFT'), // DRAFT | POSTED | REVERSED
  currency: varchar('currency', { length: 10 }).notNull(),
  orderId: varchar('order_id', { length: 255 }).references(() => orders.id, { onDelete: 'restrict' }),
  paymentId: varchar('payment_id', { length: 255 }).references(() => payments.id, { onDelete: 'restrict' }),
  escrowId: varchar('escrow_id', { length: 255 }).references(() => escrowAccounts.id, { onDelete: 'restrict' }),
  payoutId: varchar('payout_id', { length: 255 }).references(() => sellerPayouts.id, { onDelete: 'restrict' }),
  refundId: varchar('refund_id', { length: 255 }).references(() => refunds.id, { onDelete: 'restrict' }),
  disputeId: varchar('dispute_id', { length: 255 }).references(() => disputes.id, { onDelete: 'restrict' }),
  sellerId: varchar('seller_id', { length: 255 }).references(() => sellers.id, { onDelete: 'restrict' }),
  storeId: varchar('store_id', { length: 255 }).references(() => stores.id, { onDelete: 'restrict' }),
  buyerId: varchar('buyer_id', { length: 255 }).references(() => users.id, { onDelete: 'restrict' }),
  countryCode: varchar('country_code', { length: 10 }),
  idempotencyKey: varchar('idempotency_key', { length: 255 }).notNull(),
  reversalOfTransactionId: varchar('reversal_of_transaction_id', { length: 255 }).references((): AnyPgColumn => ledgerTransactions.id, { onDelete: 'restrict' }),
  performedBy: varchar('performed_by', { length: 255 }).references(() => users.id, { onDelete: 'set null' }),
  source: varchar('source', { length: 100 }), // asaas_webhook | dev_simulator | admin_panel | system
  reason: text('reason'),
  correlationId: varchar('correlation_id', { length: 255 }),
  requestId: varchar('request_id', { length: 255 }),
  metadataJson: jsonb('metadata_json'),
  occurredAt: timestamp('occurred_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  ledger_transactions_idempotency_uq: uniqueIndex('ledger_transactions_idempotency_uq').on(table.idempotencyKey),
  ledger_transactions_status_check: check('ledger_transactions_status_check', sql`${table.status} IN ('DRAFT','POSTED','REVERSED')`),
  // Auto-referência proibida: uma transaction nunca pode ser o estorno dela mesma.
  ledger_transactions_reversal_not_self_check: check(
    'ledger_transactions_reversal_not_self_check',
    sql`${table.reversalOfTransactionId} IS NULL OR ${table.reversalOfTransactionId} <> ${table.id}`
  ),
  // Catálogo fechado — só os eventos implementados NESTA fase (financialLedgerService.ts).
  // Eventos futuros (PAYOUT_*, REFUND_*, CHARGEBACK_*, DISPUTE_*, ADJUSTMENT, REVERSAL, ...)
  // entram numa migration aditiva quando o código que os usa for implementado.
  ledger_transactions_type_check: check('ledger_transactions_type_check', sql`${table.type} IN ('PAYMENT_RECEIVED','ORDER_DELIVERY_CONFIRMED')`),
  ledger_transactions_order_idx: index('ledger_transactions_order_idx').on(table.orderId),
  ledger_transactions_type_status_idx: index('ledger_transactions_type_status_idx').on(table.type, table.status),
}));

export const ledgerEntries = pgTable('ledger_entries', {
  id: varchar('id', { length: 255 }).primaryKey(),
  transactionId: varchar('transaction_id', { length: 255 }).notNull().references(() => ledgerTransactions.id, { onDelete: 'restrict' }),
  accountId: varchar('account_id', { length: 255 }).notNull().references(() => ledgerAccounts.id, { onDelete: 'restrict' }),
  // Linha determinística (1, 2, 3, ...) dentro da transaction, atribuída pelo
  // FinancialLedgerService. Não impede lançamentos legítimos repetindo a mesma
  // conta/direção com dimensões diferentes — só impede um retry/bug duplicar o
  // CONJUNTO inteiro de entries de uma transaction (colidiria em UNIQUE abaixo).
  lineNumber: integer('line_number').notNull(),
  direction: varchar('direction', { length: 10 }).notNull(), // DEBIT | CREDIT
  amount: numeric('amount', { precision: 18, scale: 6 }).notNull(), // 6 casas: não assume 2 casas para toda moeda (minor units)
  currency: varchar('currency', { length: 10 }).notNull(),
  dimensions: jsonb('dimensions'), // { component?: 'PRODUCT'|'SHIPPING'|'COMMISSION'|'TAX', subsidySource?: 'NONE'|'BUYER'|'SELLER'|'NUSALI' }
  orderId: varchar('order_id', { length: 255 }).references(() => orders.id, { onDelete: 'restrict' }),
  sellerId: varchar('seller_id', { length: 255 }).references(() => sellers.id, { onDelete: 'restrict' }),
  storeId: varchar('store_id', { length: 255 }).references(() => stores.id, { onDelete: 'restrict' }),
  buyerId: varchar('buyer_id', { length: 255 }).references(() => users.id, { onDelete: 'restrict' }),
  countryCode: varchar('country_code', { length: 10 }),
  referenceType: varchar('reference_type', { length: 100 }),
  referenceId: varchar('reference_id', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  ledger_entries_amount_check: check('ledger_entries_amount_check', sql`${table.amount} > 0`),
  ledger_entries_direction_check: check('ledger_entries_direction_check', sql`${table.direction} IN ('DEBIT','CREDIT')`),
  ledger_entries_line_number_check: check('ledger_entries_line_number_check', sql`${table.lineNumber} > 0`),
  ledger_entries_transaction_line_uq: uniqueIndex('ledger_entries_transaction_line_uq').on(table.transactionId, table.lineNumber),
  ledger_entries_transaction_idx: index('ledger_entries_transaction_idx').on(table.transactionId),
  ledger_entries_account_idx: index('ledger_entries_account_idx').on(table.accountId, table.createdAt),
  ledger_entries_order_idx: index('ledger_entries_order_idx').on(table.orderId),
  ledger_entries_seller_idx: index('ledger_entries_seller_idx').on(table.sellerId, table.currency),
}));