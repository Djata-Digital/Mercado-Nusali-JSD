import { apiClient, ApiResponse } from '../apiClient';

export class SellerApi {
  // Overview & Analytics
  static async getOverview(): Promise<ApiResponse<any>> {
    return apiClient.get('/seller/overview');
  }

  static async getAnalytics(period: string = '30days'): Promise<ApiResponse<any>> {
    return apiClient.get('/seller/analytics', { params: { period } });
  }

  // Profile & Verification
  static async getProfile(): Promise<ApiResponse<any>> {
    return apiClient.get('/seller/profile');
  }

  static async updateProfile(data: any): Promise<ApiResponse<any>> {
    return apiClient.patch('/seller/profile', data);
  }

  // Stores
  static async getStores(): Promise<ApiResponse<any>> {
    return apiClient.get('/seller/stores');
  }

  static async createStore(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/seller/stores', data);
  }

  static async updateStore(id: string, data: any): Promise<ApiResponse<any>> {
    return apiClient.patch(`/seller/stores/${id}`, data);
  }

  // Team
  static async getTeam(): Promise<ApiResponse<any>> {
    return apiClient.get('/seller/team');
  }

  static async addTeamMember(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/seller/team', data);
  }

  static async removeTeamMember(id: string): Promise<ApiResponse<any>> {
    return apiClient.delete(`/seller/team/${id}`);
  }

  // Products & Inventory
  static async getProducts(params?: { status?: string; q?: string }): Promise<ApiResponse<any>> {
    return apiClient.get('/seller/products', { params });
  }

  static async createProduct(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/seller/products', data);
  }

  static async updateProduct(id: string, data: any): Promise<ApiResponse<any>> {
    return apiClient.patch(`/seller/products/${id}`, data);
  }

  static async deleteProduct(id: string): Promise<ApiResponse<any>> {
    return apiClient.delete(`/seller/products/${id}`);
  }

  static async updateStock(id: string, stock: number): Promise<ApiResponse<any>> {
    return apiClient.patch(`/seller/products/${id}/stock`, { stock });
  }

  static async updateProductStatus(id: string, status: string): Promise<ApiResponse<any>> {
    return apiClient.patch(`/seller/products/${id}/status`, { status });
  }

  // Orders
  static async getOrders(params?: { status?: string }): Promise<ApiResponse<any>> {
    return apiClient.get('/seller/orders', { params });
  }

  static async updateOrderStatus(
    id: string,
    data: { status?: string; trackingCode?: string; shippingCarrier?: string }
  ): Promise<ApiResponse<any>> {
    return apiClient.patch(`/seller/orders/${id}/status`, data);
  }

  // Wallet & Payouts
  static async getWallet(): Promise<ApiResponse<any>> {
    return apiClient.get('/seller/wallet');
  }

  static async requestPayout(data: {
    amount: number;
    method: string;
    accountDetail: string;
    currency?: string;
  }): Promise<ApiResponse<any>> {
    return apiClient.post('/seller/payouts/request', data);
  }

  // KYC
  static async getKyc(): Promise<ApiResponse<any>> {
    return apiClient.get('/seller/kyc');
  }

  static async submitKyc(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/seller/kyc/submit', data);
  }

  // Questions & Reviews
  static async getQuestions(): Promise<ApiResponse<any>> {
    return apiClient.get('/seller/questions');
  }

  static async answerQuestion(id: string, answerText: string): Promise<ApiResponse<any>> {
    return apiClient.post(`/seller/questions/${id}/answer`, { answerText });
  }

  static async getReviews(): Promise<ApiResponse<any>> {
    return apiClient.get('/seller/reviews');
  }

  static async replyReview(id: string, reply: string): Promise<ApiResponse<any>> {
    return apiClient.post(`/seller/reviews/${id}/reply`, { reply });
  }

  // Marketing, Coupons & Ads
  static async getCoupons(): Promise<ApiResponse<any>> {
    return apiClient.get('/seller/coupons');
  }

  static async createCoupon(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/seller/coupons', data);
  }

  static async deleteCoupon(id: string): Promise<ApiResponse<any>> {
    return apiClient.delete(`/seller/coupons/${id}`);
  }

  static async getCampaigns(): Promise<ApiResponse<any>> {
    return apiClient.get('/seller/campaigns');
  }

  static async joinCampaign(id: string): Promise<ApiResponse<any>> {
    return apiClient.post(`/seller/campaigns/${id}/join`);
  }

  static async getAds(): Promise<ApiResponse<any>> {
    return apiClient.get('/seller/ads');
  }

  static async createAd(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/seller/ads', data);
  }

  // Settings
  static async getSettings(): Promise<ApiResponse<any>> {
    return apiClient.get('/seller/settings');
  }

  static async updateSettings(data: any): Promise<ApiResponse<any>> {
    return apiClient.patch('/seller/settings', data);
  }

  // Legacy compat aliases
  static async list(): Promise<ApiResponse<any>> {
    return this.getOverview();
  }

  static async getById(sellerId: string): Promise<ApiResponse<any>> {
    return apiClient.get(`/seller/${sellerId}`);
  }

  static async create(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/seller/register', data);
  }

  static async update(sellerId: string, data: any): Promise<ApiResponse<any>> {
    return this.updateProfile(data);
  }

  static async delete(sellerId: string): Promise<ApiResponse<any>> {
    return apiClient.delete(`/seller/${sellerId}`);
  }

  static async search(query: string): Promise<ApiResponse<any>> {
    return this.getProducts({ q: query });
  }

  static async filters(): Promise<ApiResponse<any>> {
    return this.getAnalytics();
  }

  static async pagination(page: number = 1, limit: number = 10): Promise<ApiResponse<any>> {
    return this.getOrders();
  }
}
