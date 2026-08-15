import { apiClient, ApiResponse } from '../api/apiClient';

export interface BuyerProfile {
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

export interface BuyerOverviewData {
  profile: BuyerProfile;
  metrics: {
    activeOrdersCount: number;
    totalOrdersCount: number;
    walletBalance: number;
    cashbackBalance: number;
    pendingEscrowBalance: number;
    favoritesCount: number;
    claimedCouponsCount: number;
    totalCouponsCount: number;
    openDisputesCount: number;
    activeReturnsCount: number;
    unreadNotificationsCount: number;
  };
  recentOrders: any[];
  recentTransactions: any[];
}

export interface BuyerCoupon {
  id: string;
  code: string;
  discount: string;
  description: string;
  validUntil: string;
  isClaimed: boolean;
}

export interface BuyerDisputeMessage {
  id: string;
  sender: 'buyer' | 'seller' | 'mediator';
  senderName: string;
  text: string;
  timestamp: string;
}

export interface BuyerDispute {
  id: string;
  orderId: string;
  orderNumber?: string;
  productTitle: string;
  sellerName: string;
  reason: string;
  description: string;
  amount: number;
  currency?: string;
  status: 'open' | 'in_mediation' | 'resolved' | 'closed';
  date: string;
  messages: BuyerDisputeMessage[];
}

export interface BuyerChatConversation {
  id: string;
  name: string;
  avatar: string;
  isOfficial?: boolean;
  isAi?: boolean;
  lastMessage: string;
  lastTime: string;
  unreadCount?: number;
  messages?: Array<{
    id: string;
    sender: 'buyer' | 'seller' | 'ai';
    text: string;
    time: string;
  }>;
}

export interface BuyerReview {
  id: string;
  productId: string;
  productTitle: string;
  productImage?: string;
  rating: number;
  comment: string;
  date: string;
  sellerReply?: string;
}

export interface BuyerNotification {
  id: string;
  type: 'orders' | 'escrow' | 'promos' | 'system';
  title: string;
  message: string;
  time: string;
  isRead: boolean;
  targetView?: 'tracking' | 'order_detail' | 'coupons' | 'profile' | 'wallet' | 'disputes';
}

export interface BuyerReturn {
  id: string;
  orderId: string;
  productTitle: string;
  reason: string;
  amount: number;
  currency?: string;
  status: 'under_review' | 'approved' | 'completed' | 'rejected';
  date: string;
  trackingLabelCode: string;
}

export interface BuyerWalletTransaction {
  id: string;
  type: 'deposit' | 'purchase' | 'cashback' | 'transfer';
  title: string;
  amount: number;
  currency: string;
  date: string;
  status: string;
  method: string;
}

export const BuyerService = {
  // 1. Profile & Overview
  async getProfile(): Promise<ApiResponse<BuyerProfile>> {
    return apiClient.get<BuyerProfile>('/buyer/profile');
  },

  async updateProfile(data: Partial<BuyerProfile>): Promise<ApiResponse<BuyerProfile>> {
    return apiClient.put<BuyerProfile>('/buyer/profile', data);
  },

  async getOverview(): Promise<ApiResponse<BuyerOverviewData>> {
    return apiClient.get<BuyerOverviewData>('/buyer/overview');
  },

  // 2. Security & Sessions
  async getSecurity(): Promise<ApiResponse<any>> {
    return apiClient.get('/buyer/security');
  },

  async changePassword(data: { currentPassword?: string; newPassword: string }): Promise<ApiResponse<any>> {
    return apiClient.post('/buyer/security/password', data);
  },

  async toggle2FA(enabled: boolean): Promise<ApiResponse<any>> {
    return apiClient.post('/buyer/security/2fa', { enabled });
  },

  async getSessions(): Promise<ApiResponse<any[]>> {
    return apiClient.get<any[]>('/buyer/security/sessions');
  },

  async revokeSession(id: string): Promise<ApiResponse<any>> {
    return apiClient.delete(`/buyer/security/sessions/${id}`);
  },

  // 3. Addresses
  async getAddresses(): Promise<ApiResponse<any[]>> {
    return apiClient.get<any[]>('/buyer/addresses');
  },

  async addAddress(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/buyer/addresses', data);
  },

  async updateAddress(id: string, data: any): Promise<ApiResponse<any>> {
    return apiClient.put(`/buyer/addresses/${id}`, data);
  },

  async deleteAddress(id: string): Promise<ApiResponse<any>> {
    return apiClient.delete(`/buyer/addresses/${id}`);
  },

  async setDefaultAddress(id: string): Promise<ApiResponse<any>> {
    return apiClient.patch(`/buyer/addresses/${id}/default`);
  },

  // 4. Orders & Tracking
  async getOrders(): Promise<ApiResponse<any[]>> {
    return apiClient.get<any[]>('/buyer/orders');
  },

  async getOrderById(id: string): Promise<ApiResponse<any>> {
    return apiClient.get<any>(`/buyer/orders/${id}`);
  },

  async createOrder(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/buyer/orders', data);
  },

  async confirmOrderDelivery(id: string): Promise<ApiResponse<any>> {
    return apiClient.post(`/buyer/orders/${id}/confirm-delivery`);
  },

  async cancelOrder(id: string): Promise<ApiResponse<any>> {
    return apiClient.post(`/buyer/orders/${id}/cancel`);
  },

  async trackOrder(id: string): Promise<ApiResponse<any>> {
    return apiClient.get(`/buyer/orders/${id}/track`);
  },

  // 5. Wallet & Nusali Pay
  async getWallet(): Promise<ApiResponse<any>> {
    return apiClient.get('/buyer/wallet');
  },

  async depositWallet(amount: number, method: string, currency?: string): Promise<ApiResponse<any>> {
    return apiClient.post('/buyer/wallet/deposit', { amount, method, currency });
  },

  async transferWallet(recipientEmailOrPhone: string, amount: number): Promise<ApiResponse<any>> {
    return apiClient.post('/buyer/wallet/transfer', { recipientEmailOrPhone, amount });
  },

  // 6. Coupons
  async getCoupons(): Promise<ApiResponse<BuyerCoupon[]>> {
    return apiClient.get<BuyerCoupon[]>('/buyer/coupons');
  },

  async claimCoupon(couponId?: string, code?: string): Promise<ApiResponse<any>> {
    return apiClient.post('/buyer/coupons/claim', { couponId, code });
  },

  async validateCoupon(code: string): Promise<ApiResponse<any>> {
    return apiClient.post('/buyer/coupons/validate', { code });
  },

  // 7. Favorites
  async getFavorites(): Promise<ApiResponse<any[]>> {
    return apiClient.get<any[]>('/buyer/favorites');
  },

  async addFavorite(product: any): Promise<ApiResponse<any>> {
    return apiClient.post('/buyer/favorites', product);
  },

  async removeFavorite(productId: string): Promise<ApiResponse<any>> {
    return apiClient.delete(`/buyer/favorites/${productId}`);
  },

  // 8. Returns & Refunds
  async getReturns(): Promise<ApiResponse<BuyerReturn[]>> {
    return apiClient.get<BuyerReturn[]>('/buyer/returns');
  },

  async createReturn(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/buyer/returns', data);
  },

  // 9. Disputes & Escrow
  async getDisputes(): Promise<ApiResponse<BuyerDispute[]>> {
    return apiClient.get<BuyerDispute[]>('/buyer/disputes');
  },

  async getDisputeById(id: string): Promise<ApiResponse<any>> {
    return apiClient.get(`/buyer/disputes/${id}`);
  },

  async createDispute(data: { orderId: string; reason: string; description: string }): Promise<ApiResponse<any>> {
    return apiClient.post('/buyer/disputes', data);
  },

  async sendDisputeMessage(disputeId: string, text: string): Promise<ApiResponse<any>> {
    return apiClient.post(`/buyer/disputes/${disputeId}/messages`, { text });
  },

  // 10. Notifications
  async getNotifications(): Promise<ApiResponse<BuyerNotification[]>> {
    return apiClient.get<BuyerNotification[]>('/buyer/notifications');
  },

  async markNotificationRead(id: string): Promise<ApiResponse<any>> {
    return apiClient.patch(`/buyer/notifications/${id}/read`);
  },

  async markAllNotificationsRead(): Promise<ApiResponse<any>> {
    return apiClient.post('/buyer/notifications/read-all');
  },

  async clearNotifications(): Promise<ApiResponse<any>> {
    return apiClient.delete('/buyer/notifications');
  },

  // 11. Messages
  async getMessages(): Promise<ApiResponse<BuyerChatConversation[]>> {
    return apiClient.get<BuyerChatConversation[]>('/buyer/messages');
  },

  async getChat(chatId: string): Promise<ApiResponse<any>> {
    return apiClient.get(`/buyer/messages/${chatId}`);
  },

  async sendMessage(chatId: string, text: string): Promise<ApiResponse<any>> {
    return apiClient.post(`/buyer/messages/${chatId}`, { text });
  },

  // 12. Reviews
  async getReviews(): Promise<ApiResponse<BuyerReview[]>> {
    return apiClient.get<BuyerReview[]>('/buyer/reviews');
  },

  async createReview(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/buyer/reviews', data);
  },

  async publishReview(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/buyer/reviews', data);
  },

  // 13. Support
  async getTickets(): Promise<ApiResponse<any[]>> {
    return apiClient.get<any[]>('/buyer/tickets');
  },

  async createTicket(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/buyer/tickets', data);
  },
};
