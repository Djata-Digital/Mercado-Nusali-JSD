import { ApiResponse } from '../api/apiClient';
import { SellerApi } from '../api/clients/SellerApi';

export const SellerService = {
  // Overview & Analytics
  async getOverview(currency?: string): Promise<ApiResponse<any>> {
    return SellerApi.getOverview(currency);
  },

  async getAnalytics(period: string = '30days', currency?: string): Promise<ApiResponse<any>> {
    return SellerApi.getAnalytics(period, currency);
  },

  // Profile & KYC
  async onboard(data?: any): Promise<ApiResponse<any>> {
    return SellerApi.onboard(data);
  },

  async getProfile(): Promise<ApiResponse<any>> {
    return SellerApi.getProfile();
  },

  async updateProfile(data: any): Promise<ApiResponse<any>> {
    return SellerApi.updateProfile(data);
  },

  async getKyc(): Promise<ApiResponse<any>> {
    return SellerApi.getKyc();
  },

  async submitKyc(data: any): Promise<ApiResponse<any>> {
    return SellerApi.submitKyc(data);
  },

  // Stores & Team
  async getStores(): Promise<ApiResponse<any>> {
    return SellerApi.getStores();
  },

  async createStore(data: any): Promise<ApiResponse<any>> {
    return SellerApi.createStore(data);
  },

  async updateStore(idOrData: any, maybeData?: any): Promise<ApiResponse<any>> {
    const id = typeof idOrData === 'string' ? idOrData : (idOrData?.id || 'me');
    const data = maybeData !== undefined ? maybeData : idOrData;
    return SellerApi.updateStore(id, data);
  },

  async getTeam(): Promise<ApiResponse<any>> {
    return SellerApi.getTeam();
  },

  async addTeamMember(data: any): Promise<ApiResponse<any>> {
    return SellerApi.addTeamMember(data);
  },

  async removeTeamMember(id: string): Promise<ApiResponse<any>> {
    return SellerApi.removeTeamMember(id);
  },

  // Products & Inventory
  async getWarehouses(): Promise<ApiResponse<any>> {
    return SellerApi.getWarehouses();
  },

  async getInventory(): Promise<ApiResponse<any>> {
    return SellerApi.getInventory();
  },

  async getTransfers(): Promise<ApiResponse<any>> {
    return SellerApi.getTransfers();
  },

  async requestTransfer(data: {
    productId: string;
    variantId?: string;
    toWarehouseId: string;
    quantity: number;
    deliveryMode?: string;
    pickupSnapshotJson?: any;
  }): Promise<ApiResponse<any>> {
    return SellerApi.requestTransfer(data);
  },

  async cancelTransfer(id: string): Promise<ApiResponse<any>> {
    return SellerApi.cancelTransfer(id);
  },

  async getProducts(params?: { status?: string; q?: string }): Promise<ApiResponse<any>> {
    return SellerApi.getProducts(params);
  },

  async createProduct(data: any): Promise<ApiResponse<any>> {
    return SellerApi.createProduct(data);
  },

  async updateProduct(id: string, data: any): Promise<ApiResponse<any>> {
    return SellerApi.updateProduct(id, data);
  },

  async deleteProduct(id: string): Promise<ApiResponse<any>> {
    return SellerApi.deleteProduct(id);
  },

  async updateStock(id: string, stock: number): Promise<ApiResponse<any>> {
    return SellerApi.updateStock(id, stock);
  },

  async updateProductStatus(id: string, status: string): Promise<ApiResponse<any>> {
    return SellerApi.updateProductStatus(id, status);
  },

  // Orders
  async getOrders(params?: { status?: string }): Promise<ApiResponse<any>> {
    return SellerApi.getOrders(params);
  },

  async updateOrderStatus(
    id: string,
    data: { status?: string; trackingCode?: string; shippingCarrier?: string }
  ): Promise<ApiResponse<any>> {
    return SellerApi.updateOrderStatus(id, data);
  },

  // Etiqueta de envio (Fase 1 Operacional) — fonte única compartilhada com a logística.
  async getShipmentLabel(shipmentId: string): Promise<ApiResponse<any>> {
    return SellerApi.getShipmentLabel(shipmentId);
  },

  // Meus Clientes (Fase 1 Operacional) — CRM mínimo real.
  async getCustomers(): Promise<ApiResponse<any[]>> {
    return SellerApi.getCustomers();
  },

  // Financials & Wallet
  async getWallet(currency?: string): Promise<ApiResponse<any>> {
    return SellerApi.getWallet(currency);
  },

  async getFinancials(currency?: string): Promise<ApiResponse<any>> {
    return SellerApi.getWallet(currency);
  },

  async getPayouts(): Promise<ApiResponse<any[]>> {
    return SellerApi.getPayouts();
  },

  async requestPayout(data: {
    amount: number;
    method: string;
    accountDetail?: string;
    bankAccountId?: string;
    currency?: string;
  }): Promise<ApiResponse<any>> {
    return SellerApi.requestPayout(data);
  },

  async getBankAccounts(): Promise<ApiResponse<any[]>> {
    return SellerApi.getBankAccounts();
  },

  async addBankAccount(data: any): Promise<ApiResponse<any>> {
    return SellerApi.addBankAccount(data);
  },

  async removeBankAccount(id: string): Promise<ApiResponse<any>> {
    return SellerApi.removeBankAccount(id);
  },

  // Questions & Reviews
  async getQuestions(): Promise<ApiResponse<any>> {
    return SellerApi.getQuestions();
  },

  async answerQuestion(id: string, answerText: string): Promise<ApiResponse<any>> {
    return SellerApi.answerQuestion(id, answerText);
  },

  async getReviews(): Promise<ApiResponse<any>> {
    return SellerApi.getReviews();
  },

  async replyReview(id: string, reply: string): Promise<ApiResponse<any>> {
    return SellerApi.replyReview(id, reply);
  },

  // Marketing, Coupons & Ads
  async getCoupons(): Promise<ApiResponse<any>> {
    return SellerApi.getCoupons();
  },

  async createCoupon(data: any): Promise<ApiResponse<any>> {
    return SellerApi.createCoupon(data);
  },

  async deleteCoupon(id: string): Promise<ApiResponse<any>> {
    return SellerApi.deleteCoupon(id);
  },

  async getCampaigns(): Promise<ApiResponse<any>> {
    return SellerApi.getCampaigns();
  },

  async joinCampaign(id: string): Promise<ApiResponse<any>> {
    return SellerApi.joinCampaign(id);
  },

  async getAds(): Promise<ApiResponse<any>> {
    return SellerApi.getAds();
  },

  async createAd(data: any): Promise<ApiResponse<any>> {
    return SellerApi.createAd(data);
  },

  // Settings & Shipping Policy
  async getSettings(): Promise<ApiResponse<any>> {
    return SellerApi.getSettings();
  },

  async updateSettings(data: any): Promise<ApiResponse<any>> {
    return SellerApi.updateSettings(data);
  },

  async getShippingPolicy(storeId: string): Promise<ApiResponse<any>> {
    return SellerApi.getShippingPolicy(storeId);
  },

  async updateShippingPolicy(data: { storeId: string; [key: string]: any }): Promise<ApiResponse<any>> {
    return SellerApi.updateShippingPolicy(data);
  },
};
