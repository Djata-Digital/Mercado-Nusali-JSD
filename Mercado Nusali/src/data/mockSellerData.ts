import { CountryCode, CurrencyCode, OrderStatus, EscrowStatus } from '../types';
import { mockProducts } from './mockData';

export interface SellerProfileData {
  id: string;
  fullName: string;
  commercialName: string;
  sellerType: 'pessoa_fisica' | 'empresa_individual' | 'sociedade' | 'marca_oficial' | 'vendedor_internacional';
  taxId: string; // NIF / CNPJ / NIF PT
  country: CountryCode;
  city: string;
  address: string;
  phone: string;
  email: string;
  kycStatus: 'verified' | 'under_review' | 'pending' | 'rejected';
  kycLevel: string;
  verificationDate: string;
  reputationLevel: 'platinum' | 'gold' | 'lider' | 'novo';
  reputationScore: number;
  authorizedCountries: CountryCode[];
  preferredCurrency: CurrencyCode;
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
  country: CountryCode;
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
  acceptedCurrencies: CurrencyCode[];
  acceptedPayments: string[];
  shippingMethods: string[];
  categoryId?: string;
  businessHoursJson?: any;
  addressJson?: any;
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

export interface SellerWarehouseStock {
  id: string;
  warehouseName: string;
  warehouseCode: string;
  country: CountryCode;
  type: 'hub_fulfillment' | 'local_store' | 'cross_border_gateway';
  totalUnits: number;
  availableUnits: number;
  reservedUnits: number;
  inTransitUnits: number;
  capacityPercentage: number;
  monthlyStorageFee: number;
}

export interface SellerOrderData {
  id: string;
  orderNumber: string;
  storeId: string;
  storeName: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  buyerCountry: CountryCode;
  deliveryCity: string;
  deliveryAddress?: string;
  productTitle: string;
  productSku: string;
  productImage: string;
  selectedColor?: string;
  selectedSize?: string;
  selectedVariantSku?: string;
  selectedVariantImage?: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  commissionFee: number;
  netPayout: number;
  currency: CurrencyCode;
  paymentMethod: string;
  status: OrderStatus;
  escrowStatus: EscrowStatus;
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
  buyerCountry: CountryCode;
  questionText: string;
  questionDate: string;
  answerText?: string;
  answerDate?: string;
  status: 'pending' | 'answered';
}

export interface SellerCustomer {
  id: string;
  name: string;
  email: string;
  country: CountryCode;
  city: string;
  totalOrders: number;
  totalSpentUSD: number;
  lastPurchaseDate: string;
  loyaltyTag: 'VIP Global' | 'Recorrente' | 'Novo Comprador';
  internalNotes: string;
}

export const initialSellerProfile: SellerProfileData = {
  id: '',
  fullName: 'Novo Vendedor',
  commercialName: 'Minha Loja',
  sellerType: 'empresa_individual',
  taxId: '',
  country: 'GW',
  city: '',
  address: '',
  phone: '',
  email: '',
  kycStatus: 'pending',
  kycLevel: 'Nível 1 - Pendente de Verificação',
  verificationDate: '',
  reputationLevel: 'novo',
  reputationScore: 0,
  authorizedCountries: ['GW'],
  preferredCurrency: 'XOF',
  payoutMethods: [],
  vacationMode: false,
};

export const initialSellerStores: SellerStoreData[] = [];

export const initialSellerTeam: SellerTeamMember[] = [];

export const initialWarehouses: SellerWarehouseStock[] = [];

export const initialSellerOrders: SellerOrderData[] = [];

export const initialSellerQuestions: SellerQuestion[] = [];

export const initialSellerCustomers: SellerCustomer[] = [];

export const mockSellerProfile = initialSellerProfile;
export const mockSellerProducts: any[] = [];
export const mockSellerOrders = initialSellerOrders;
export const mockSellerFinancialStats = {
  totalRevenueUSD: 0,
  pendingEscrowUSD: 0,
  availableBalanceUSD: 0,
  grossRevenueByCurrency: { XOF: 0, EUR: 0, BRL: 0 },
  payoutHistory: [],
};


