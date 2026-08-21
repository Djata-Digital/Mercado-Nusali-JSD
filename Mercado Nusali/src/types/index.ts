export * from '../types';

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

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'order' | 'payment' | 'dispute' | 'security' | 'promo' | 'system';
  read: boolean;
  timestamp: string;
  link?: string;
}
