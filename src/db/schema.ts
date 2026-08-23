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
  addressType: varchar('address_type', { length: 50 }).notNull().default('shipping'), // shipping, billing
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
  commissionRate: numeric('commission_rate', { precision: 5, scale: 2 }).default('8.00'),
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
  condition: varchar('condition', { length: 50 }).default('new'), // new, refurbished, used
  warranty: varchar('warranty', { length: 100 }),
  status: varchar('status', { length: 50 }).notNull().default('active'), // active, draft, paused, archived
  isActive: boolean('is_active').notNull().default(true),
  attributesJson: jsonb('attributes_json'),
  shippingJson: jsonb('shipping_json'),
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
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

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
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  inventory_product_idx: index('inventory_product_idx').on(table.productId),
  inventory_warehouse_idx: index('inventory_warehouse_idx').on(table.warehouseId),
  inventory_seller_idx: index('inventory_seller_idx').on(table.sellerId),
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
  allowedCountriesJson: jsonb('allowed_countries_json'),
  allowedRegionsJson: jsonb('allowed_regions_json'),
  allowedCitiesJson: jsonb('allowed_cities_json'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  store_shipping_policies_store_idx: index('store_shipping_policies_store_idx').on(table.storeId),
  store_shipping_policies_seller_idx: index('store_shipping_policies_seller_idx').on(table.sellerId),
}));

export const shippingZones = pgTable('shipping_zones', {
  id: varchar('id', { length: 255 }).primaryKey(),
  countryCode: varchar('country_code', { length: 10 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  regionCode: varchar('region_code', { length: 50 }),
  city: varchar('city', { length: 255 }),
  postalCodePattern: varchar('postal_code_pattern', { length: 100 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  shipping_zones_country_idx: index('shipping_zones_country_idx').on(table.countryCode),
}));

export const shippingRates = pgTable('shipping_rates', {
  id: varchar('id', { length: 255 }).primaryKey(),
  zoneId: varchar('zone_id', { length: 255 }).references(() => shippingZones.id, { onDelete: 'cascade' }),
  originCountry: varchar('origin_country', { length: 10 }).notNull(),
  originRegion: varchar('origin_region', { length: 50 }),
  destinationCountry: varchar('destination_country', { length: 10 }).notNull(),
  destinationRegion: varchar('destination_region', { length: 50 }),
  minWeightKg: numeric('min_weight_kg', { precision: 8, scale: 3 }).notNull().default('0.000'),
  maxWeightKg: numeric('max_weight_kg', { precision: 8, scale: 3 }).notNull().default('999.000'),
  price: numeric('price', { precision: 12, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 10 }).notNull(),
  estimatedMinDays: integer('estimated_min_days').notNull().default(1),
  estimatedMaxDays: integer('estimated_max_days').notNull().default(5),
  carrierId: varchar('carrier_id', { length: 255 }),
  serviceType: varchar('service_type', { length: 100 }).notNull().default('standard'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  shipping_rates_route_idx: index('shipping_rates_route_idx').on(table.originCountry, table.destinationCountry),
  shipping_rates_zone_idx: index('shipping_rates_zone_idx').on(table.zoneId),
}));

// ============================================================================
// 6. PEDIDOS (SNAPSHOT COMPLETO, HISTÓRICO DE STATUS)
// ============================================================================

export const orders = pgTable('orders', {
  id: varchar('id', { length: 255 }).primaryKey(),
  orderNumber: varchar('order_number', { length: 100 }).notNull().unique(),
  buyerId: varchar('buyer_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'restrict' }),
  storeId: varchar('store_id', { length: 255 }).references(() => stores.id, { onDelete: 'set null' }),
  sellerId: varchar('seller_id', { length: 255 }).references(() => sellers.id, { onDelete: 'set null' }),
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
  inventoryId: varchar('inventory_id', { length: 255 }).references(() => inventory.id, { onDelete: 'set null' }),
  warehouseId: varchar('warehouse_id', { length: 255 }).references(() => warehouses.id, { onDelete: 'set null' }),
  shipmentId: varchar('shipment_id', { length: 255 }).references(() => shipments.id, { onDelete: 'set null' }),
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

export const payments = pgTable('payments', {
  id: varchar('id', { length: 255 }).primaryKey(),
  orderId: varchar('order_id', { length: 255 }).notNull().references(() => orders.id, { onDelete: 'restrict' }),
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
  payments_buyer_created_idx: index('payments_buyer_created_idx').on(table.buyerId, table.createdAt),
  payments_status_created_idx: index('payments_status_created_idx').on(table.status, table.createdAt),
  payments_transaction_ref_uq: uniqueIndex('payments_transaction_ref_uq').on(table.transactionRef),
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

export const refunds = pgTable('refunds', {
  id: varchar('id', { length: 255 }).primaryKey(),
  paymentId: varchar('payment_id', { length: 255 }).notNull().references(() => payments.id, { onDelete: 'restrict' }),
  orderId: varchar('order_id', { length: 255 }).notNull().references(() => orders.id, { onDelete: 'restrict' }),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 10 }).notNull().default('XOF'),
  reason: text('reason'),
  status: varchar('status', { length: 50 }).notNull().default('pending'), // pending, processed, failed
  approvedBy: varchar('approved_by', { length: 255 }).references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  refunds_payment_idx: index('refunds_payment_idx').on(table.paymentId),
  refunds_order_idx: index('refunds_order_idx').on(table.orderId),
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
// 8. CARTEIRA E ESCROW LEDGER
// ============================================================================

export const wallets = pgTable('wallets', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull().unique().references(() => users.id, { onDelete: 'restrict' }),
  balance: numeric('balance', { precision: 15, scale: 2 }).notNull().default('0.00'),
  cashbackBalance: numeric('cashback_balance', { precision: 15, scale: 2 }).notNull().default('0.00'),
  pendingBalance: numeric('pending_balance', { precision: 15, scale: 2 }).notNull().default('0.00'),
  currency: varchar('currency', { length: 10 }).notNull().default('XOF'),
  status: varchar('status', { length: 50 }).notNull().default('active'), // active, locked, frozen
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

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
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  seller_payouts_seller_status_idx: index('seller_payouts_seller_status_idx').on(table.sellerId, table.status),
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
  carrier: varchar('carrier', { length: 100 }),
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