export type ProductCondition = 'novo' | 'usado' | 'recondicionado';

export type ReputationLevel = 'platinum' | 'gold' | 'lider' | 'bom';

export type CountryCode = 'GW' | 'BR' | 'PT' | 'AO' | 'US' | 'MZ' | 'CV' | 'ST';
export type CurrencyCode = 'XOF' | 'BRL' | 'EUR' | 'AOA' | 'USD' | 'MZN' | 'CVE' | 'STN';

export interface CountryConfig {
  code: CountryCode;
  name: string;
  flag: string;
  currency: CurrencyCode;
  currencySymbol: string;
  exchangeRateToUSD: number; // 1 USD = X currency units
  phonePrefix: string;
  paymentMethods: PaymentMethodType[];
}

export type KycStatus = 'pending' | 'under_review' | 'verified' | 'rejected';

export type KycDocumentType =
  | 'identity'
  | 'selfie'
  | 'address_proof'
  | 'company_registration'
  | 'tax_document'
  | 'owner_document';

export interface KycDocument {
  id: string;
  sellerId: string;
  sellerName: string;
  documentType: KycDocumentType;
  documentNumber: string;
  country: CountryCode;
  fileUrl: string;
  submittedAt: string;
  status: KycStatus;
  rejectionReason?: string;
  reviewedAt?: string;
}

export type StoreRole = 'owner' | 'manager' | 'employee';

export interface StoreMember {
  id: string;
  name: string;
  email: string;
  role: StoreRole;
  joinedAt: string;
}

export interface Store {
  id: string;
  sellerId: string;
  name: string;
  slug: string;
  logo: string;
  banner: string;
  description: string;
  address: string;
  city: string;
  country: CountryCode;
  openingHours: string;
  policies: string;
  rating: number;
  followersCount: number;
  status: 'active' | 'suspended' | 'pending_approval';
  team: StoreMember[];
  createdAt: string;
}

export interface Seller {
  id: string;
  name: string;
  reputationLevel: ReputationLevel;
  reputationScore: number; // 1 to 5
  salesCount: number;
  isOfficialStore?: boolean;
  officialBrand?: string;
  kycStatus?: KycStatus;
  country?: CountryCode;
  location: {
    city: string;
    state: string;
  };
  goodService: boolean;
  onTimeDelivery: boolean;
  storesCount?: number;
}

export interface ProductQuestion {
  id: string;
  user: string;
  date: string;
  question: string;
  answer?: string;
  answerDate?: string;
}

export interface ProductReview {
  id: string;
  user: string;
  rating: number;
  date: string;
  title: string;
  comment: string;
  likes: number;
  verifiedPurchase: boolean;
}

export interface ProductVideo {
  id?: string;
  url: string;
  title?: string;
  thumbnail?: string;
  duration?: string; // e.g. "0:15", "0:30"
  type?: 'mp4' | 'webm' | 'youtube' | 'uploaded';
}

export type PublishingScope = 'national' | 'international';

export interface ProductColor {
  name: string; // e.g. "Preto", "Branco", "Azul Marinho", "Dourado", "Vermelho"
  hex?: string; // e.g. "#111827"
  image?: string; // Thumbnail preview image of this color variant
  galleryImages?: string[]; // Media photos specific to this color variant
  videos?: ProductVideo[] | string[]; // Specific videos for this color
  description?: string; // Description specific to this color variant
  specs?: Record<string, string>; // Specs specific to this color variant
  price?: number;
  originalPrice?: number;
}

export interface ProductVariant {
  id: string;
  sku?: string;
  color?: string;
  size?: string;
  stock: number;
  price?: number;
  originalPrice?: number;
  image?: string;
  galleryImages?: string[];
  videos?: ProductVideo[] | string[];
  description?: string;
  specs?: Record<string, string>;
}

export interface ProductKit {
  id: string;
  quantity: number; // e.g. 2, 5, 10
  title: string; // e.g. "Kit com 2 Unidades"
  discountPercentage?: number; // e.g. 10
  unitPrice?: number;
  totalPrice?: number;
  badge?: string; // e.g. "Mais Vendido", "Preço de Atacado", "Economize 15%"
}

export interface Product {
  id: string;
  sku?: string;
  title: string;
  price: number; // In local store currency or base USD
  currency?: CurrencyCode;
  originalPrice?: number;
  discountPercentage?: number;
  installmentsMax: number;
  installmentsInterestFree: boolean;
  image: string;
  galleryImages: string[];
  videos?: ProductVideo[] | string[];
  videoUrl?: string;
  shortVideo?: ProductVideo;
  category: string;
  categorySlug: string;
  condition: ProductCondition;
  brand: string;
  model: string;
  rating: number;
  reviewsCount: number;
  seller: Seller;
  storeId?: string;
  storeName?: string;
  isDigitalProduct?: boolean;
  weightKg?: number;
  dimensionsCm?: { length: number; width: number; height: number };
  publishingScope?: PublishingScope;
  targetCountries?: CountryCode[];
  originCountry?: CountryCode;
  productKits?: ProductKit[];
  availableColors?: (ProductColor | string)[];
  availableSizes?: string[];
  variants?: ProductVariant[];
  shipping: {
    freeShipping: boolean;
    arrivesTomorrow: boolean;
    shippingPrice: number;
    fullFulfilled: boolean; // "FULL" Nusali Express fulfillment
    isInternational?: boolean;
    originCountry?: CountryCode;
    originCity?: string;
    targetCountries?: CountryCode[];
    warehouseName?: string;
    estimatedDays?: number;
    customsDutyEstimate?: number;
  };
  stock: number;
  salesCount: number;
  description: string;
  specs: Record<string, string>;
  questions: ProductQuestion[];
  reviews: ProductReview[];
  featured?: boolean;
  offerOfDay?: boolean;
  createdAt?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  selectedColor?: string;
  selectedSize?: string;
  selectedStorage?: string;
  selectedKit?: ProductKit;
  unitPriceOverride?: number;
  selectedVariantSku?: string;
  selectedVariantImage?: string;
}

export interface DeliveryAddress {
  recipientName: string;
  cpfOrTaxId: string;
  zipCode: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  country: CountryCode;
  phone: string;
}

export type PaymentMethodType =
  | 'pix'
  | 'credit_card'
  | 'boleto'
  | 'orange_money'
  | 'mtn_money'
  | 'nusali_wallet'
  | 'stripe_paypal';

export interface PaymentDetails {
  method: PaymentMethodType;
  currency: CurrencyCode;
  installments?: number;
  cardNumberMasked?: string;
  cardHolder?: string;
  phoneNumber?: string; // For Orange Money & MTN Money
  pixCode?: string;
  pixQrCodeUrl?: string;
  transactionRef?: string;
}

export type OrderStatus =
  | 'confirmed'
  | 'preparing'
  | 'shipped'
  | 'in_customs'
  | 'out_for_delivery'
  | 'delivered'
  | 'disputed'
  | 'cancelled';

export type EscrowStatus = 'retained' | 'releasing_soon' | 'released' | 'disputed' | 'refunded';

export interface EscrowDetails {
  status: EscrowStatus;
  amountRetained: number;
  currency: CurrencyCode;
  retainedAt: string;
  releaseEligibleAt: string;
  releasedAt?: string;
  notes?: string;
}

export interface TrackingStep {
  status: OrderStatus;
  title: string;
  description: string;
  timestamp: string;
  completed: boolean;
}

export interface Order {
  id: string;
  date: string;
  items: CartItem[];
  subtotal: number;
  shippingFee: number;
  customsDuty: number;
  discount: number;
  total: number;
  currency: CurrencyCode;
  deliveryAddress: DeliveryAddress;
  paymentDetails: PaymentDetails;
  status: OrderStatus;
  escrow: EscrowDetails;
  estimatedDelivery: string;
  trackingCode: string;
  carrierName: string;
  trackingSteps: TrackingStep[];
  originCountry: CountryCode;
  destinationCountry: CountryCode;
  disputeId?: string;
}

export type DisputeReason =
  | 'product_different'
  | 'damaged'
  | 'not_received'
  | 'fake_product'
  | 'other';

export type DisputeStatus =
  | 'opened'
  | 'seller_responded'
  | 'under_admin_review'
  | 'resolved_refunded'
  | 'resolved_released'
  | 'closed';

export interface DisputeMessage {
  id: string;
  sender: 'buyer' | 'seller' | 'admin';
  senderName: string;
  text: string;
  timestamp: string;
}

export interface Dispute {
  id: string;
  orderId: string;
  buyerName: string;
  sellerName: string;
  productTitle: string;
  productImage: string;
  amount: number;
  currency: CurrencyCode;
  reason: DisputeReason;
  description: string;
  evidenceUrls: string[];
  createdAt: string;
  status: DisputeStatus;
  messages: DisputeMessage[];
  adminDecision?: string;
}

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  country: CountryCode;
  city: string;
  address: string;
  type: 'fulfillment' | 'local_hub' | 'cross_border_gateway';
  capacityUsedPercentage: number;
  activeShipments: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  iconName: string;
  image: string;
  itemCount: number;
  description?: string;
}

export interface FilterState {
  query: string;
  category: string;
  country?: CountryCode | 'all';
  priceMin?: number;
  priceMax?: number;
  condition?: ProductCondition | 'all';
  freeShippingOnly: boolean;
  arrivesTomorrowOnly: boolean;
  fullOnly: boolean;
  sellerPlatinumOnly: boolean;
  internationalOnly: boolean;
  sortBy: 'relevance' | 'price_asc' | 'price_desc' | 'sales' | 'rating';
}

export type AppView =
  | 'home'
  | 'search'
  | 'product_detail'
  | 'categories'
  | 'store_public'
  | 'cart'
  | 'checkout'
  | 'order_confirmation'
  | 'my_orders'
  | 'order_detail'
  | 'tracking'
  | 'favorites'
  | 'my_reviews'
  | 'notifications'
  | 'messages'
  | 'profile'
  | 'addresses'
  | 'security'
  | 'wallet'
  | 'coupons'
  | 'help_center'
  | 'returns_refunds'
  | 'seller_hub'
  | 'seller_kyc'
  | 'seller_stores'
  | 'disputes'
  | 'admin_dashboard'
  | 'nusali_plus';

export type UserRole =
  | 'BUYER'
  | 'SELLER'
  | 'ADMIN'
  | 'GLOBAL_ADMIN'
  | 'COUNTRY_REPRESENTATIVE'
  | 'REGIONAL_SUPERVISOR'
  | 'SUPPORT'
  | 'FINANCE'
  | 'LOGISTICS'
  | 'KYC_ANALYST'
  | 'RISK_ANALYST';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  country?: string;
  phone?: string;
  createdAt: string;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  status: 'active' | 'suspended' | 'blocked';
  sellerId?: string;
}

export interface Coupon {
  id: string;
  code: string;
  discountPercentage: number;
  fixedDiscountAmount?: number;
  minPurchaseAmount?: number;
  expiresAt: string;
  maxUses?: number;
  usesCount: number;
  isActive: boolean;
}

export interface Campaign {
  id: string;
  title: string;
  bannerUrl: string;
  targetCountry?: string;
  discountText: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export interface WalletTransaction {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  type: 'credit' | 'debit';
  description: string;
  date: string;
  referenceId?: string;
}

export interface Wallet {
  userId: string;
  balance: number;
  currency: string;
  pendingEscrowBalance: number;
  transactions: WalletTransaction[];
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userName: string;
  userRole: string;
  action: string;
  entity: string;
  previousValue: string;
  newValue: string;
  ipAddress: string;
  country: string;
}

export interface LoginRequest {
  identifier: string; // Email or phone number
  password: string;
  role?: UserRole;
  rememberMe?: boolean;
}

export interface LoginResponse {
  token: string;
  refreshToken?: string;
  user: User;
}

export interface RegisterRequest {
  country: string;
  role: UserRole; // BUYER or SELLER
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  phoneCode: string;
  dateOfBirth?: string;
  avatar?: string;
  password: string;
  termsAccepted: boolean;
  privacyAccepted: boolean;
  marketingConsent?: boolean;
}

export interface RegisterResponse {
  token: string;
  refreshToken?: string;
  user: User;
}

export interface ForgotPasswordRequest {
  identifier: string; // Email or phone
  method: 'email' | 'sms' | 'whatsapp';
}

export interface ResetPasswordRequest {
  token?: string;
  code?: string;
  newPassword: string;
}

export interface VerifyEmailRequest {
  code: string;
  token?: string;
  email?: string;
}

export interface VerifyPhoneRequest {
  code: string;
  phone?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface AuthSession {
  id: string;
  device: string;
  ip: string;
  location: string;
  lastActive: string;
  isCurrent: boolean;
}

export type Permission =
  | 'manage_products'
  | 'manage_orders'
  | 'manage_users'
  | 'manage_sellers'
  | 'view_financials'
  | 'manage_kyc'
  | 'manage_disputes';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'order' | 'payment' | 'dispute' | 'security' | 'promo' | 'system';
  read: boolean;
  timestamp: string;
  link?: string;
}

