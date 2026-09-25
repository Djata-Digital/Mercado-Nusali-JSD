import { apiClient, ApiResponse } from '../apiClient';

export class SellerApi {
  // Overview & Analytics
  // Correção crítica (Visão Geral zerada / mistura de moedas): currency
  // agora explícito — nunca deixamos o backend escolher uma moeda arbitrária
  // (mesmo padrão já aplicado a getWallet()).
  static async getOverview(currency?: string): Promise<ApiResponse<any>> {
    return apiClient.get('/seller/overview', currency ? { params: { currency } } : undefined);
  }

  static async getAnalytics(period: string = '30days', currency?: string): Promise<ApiResponse<any>> {
    return apiClient.get('/seller/analytics', { params: currency ? { period, currency } : { period } });
  }

  // Profile & Verification
  static async onboard(data?: any): Promise<ApiResponse<any>> {
    return apiClient.post('/seller/onboard', data || {});
  }

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

  // FASE D15-C2 — origem operacional (endereço estruturado + geografia de
  // frete por setor, fundação D15-A/C). Reutiliza updateStore acima para
  // gravar operationalAddressId — nenhum método novo necessário para isso.
  static async getAddresses(): Promise<ApiResponse<any[]>> {
    return apiClient.get('/seller/addresses');
  }

  static async createAddress(data: {
    recipientName: string; street: string; number?: string; complement?: string; neighborhood?: string;
    city: string; state?: string; countryCode: string; zipCode?: string; phone?: string;
    shippingSectorId?: string | null; isDefault?: boolean;
  }): Promise<ApiResponse<any>> {
    return apiClient.post('/seller/addresses', data);
  }

  static async updateAddress(id: string, data: any): Promise<ApiResponse<any>> {
    return apiClient.patch(`/seller/addresses/${id}`, data);
  }

  static async getShippingRegions(country: string): Promise<ApiResponse<any[]>> {
    return apiClient.get('/seller/shipping/regions', { params: { country } });
  }

  static async getShippingSectors(country: string, regionId?: string): Promise<ApiResponse<any[]>> {
    return apiClient.get('/seller/shipping/sectors', { params: regionId ? { country, region: regionId } : { country } });
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
  static async getWarehouses(): Promise<ApiResponse<any>> {
    return apiClient.get('/seller/warehouses');
  }

  static async getInventory(): Promise<ApiResponse<any>> {
    return apiClient.get('/seller/inventory');
  }

  // FASE D16-E5 — read-model dedicado: uma opção por inventory row
  // SELLER_LOCATION real e transferível (produto/variante/loja já
  // resolvidos pelo backend) — nunca derivado de products.attributesJson.
  static async getTransferableInventory(): Promise<ApiResponse<any>> {
    return apiClient.get('/seller/inventory/transferable');
  }

  static async getTransfers(): Promise<ApiResponse<any>> {
    return apiClient.get('/seller/inventory/transfers');
  }

  // FASE D16-E5 — origem sempre uma inventory row EXATA (sourceInventoryId);
  // productId/variantId/pickupSnapshotJson não são mais aceitos aqui — o
  // backend deriva tudo a partir da própria inventory (ver auditoria D16-E5).
  static async requestTransfer(data: {
    sourceInventoryId: string;
    toWarehouseId: string;
    quantity: number;
    deliveryMode?: string;
  }): Promise<ApiResponse<any>> {
    return apiClient.post('/seller/inventory/transfers', data);
  }

  static async cancelTransfer(id: string): Promise<ApiResponse<any>> {
    return apiClient.post(`/seller/inventory/transfers/${id}/cancel`);
  }

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

  // Etiqueta de envio (Fase 1 Operacional) — fonte única compartilhada entre
  // vendedor e logística: NUNCA cria uma etiqueta nova, apenas consulta a
  // já existente (1:1 com o shipment) via GET /shipments/:shipmentId/label.
  static async getShipmentLabel(shipmentId: string): Promise<ApiResponse<any>> {
    return apiClient.get(`/shipments/${shipmentId}/label`);
  }

  // Meus Clientes (Fase 1 Operacional) — CRM mínimo real, agregado a partir
  // dos pedidos pagos do próprio vendedor (ver computeSellerCustomers no backend).
  static async getCustomers(): Promise<ApiResponse<any[]>> {
    return apiClient.get('/seller/customers');
  }

  // Correção (auditoria "painel do vendedor" — disputas nunca apareciam):
  // GET /seller/disputes é real e escopado ao vendedor autenticado (nunca
  // aceita sellerId do cliente).
  static async getDisputes(): Promise<ApiResponse<any[]>> {
    return apiClient.get('/seller/disputes');
  }

  // Fase M1-C — primeira resposta REAL do vendedor numa disputa (antes só
  // era possível ler). Ownership provada no backend (disputeMessageService),
  // nunca aqui — este cliente só encaminha a mensagem.
  static async sendDisputeMessage(disputeId: string, message: string): Promise<ApiResponse<any>> {
    return apiClient.post(`/seller/disputes/${disputeId}/messages`, { message });
  }

  static async updateOrderStatus(
    id: string,
    data: { status?: string; trackingCode?: string; shippingCarrier?: string }
  ): Promise<ApiResponse<any>> {
    return apiClient.patch(`/seller/orders/${id}/status`, data);
  }

  // Bank Accounts
  static async getBankAccounts(): Promise<ApiResponse<any[]>> {
    return apiClient.get('/seller/bank-accounts');
  }

  static async addBankAccount(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/seller/bank-accounts', data);
  }

  static async removeBankAccount(id: string): Promise<ApiResponse<any>> {
    return apiClient.delete(`/seller/bank-accounts/${id}`);
  }
  // Correção crítica (wallet multi-moeda): `currency` agora é explícito —
  // nunca deixamos o backend escolher uma wallet arbitrária quando o
  // vendedor tem mais de uma moeda (ver sellerRoutes.ts, GET /seller/wallet).
  static async getWallet(currency?: string): Promise<ApiResponse<any>> {
    return apiClient.get('/seller/wallet', currency ? { params: { currency } } : undefined);
  }

  static async getPayouts(): Promise<ApiResponse<any[]>> {
    return apiClient.get('/seller/payouts');
  }

  static async requestPayout(data: {
    amount: number;
    method: string;
    accountDetail?: string;
    bankAccountId?: string;
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

  static async getCoupon(id: string): Promise<ApiResponse<any>> {
    return apiClient.get(`/seller/coupons/${id}`);
  }

  static async createCoupon(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/seller/coupons', data);
  }

  static async updateCoupon(id: string, data: any): Promise<ApiResponse<any>> {
    return apiClient.patch(`/seller/coupons/${id}`, data);
  }

  static async setCouponStatus(id: string, isActive: boolean): Promise<ApiResponse<any>> {
    return apiClient.patch(`/seller/coupons/${id}/status`, { isActive });
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

  // Settings & Shipping Policy
  static async getSettings(): Promise<ApiResponse<any>> {
    return apiClient.get('/seller/settings');
  }

  static async updateSettings(data: any): Promise<ApiResponse<any>> {
    return apiClient.patch('/seller/settings', data);
  }

  static async getShippingPolicy(storeId: string): Promise<ApiResponse<any>> {
    return apiClient.get('/seller/shipping-policy', { params: { storeId } });
  }

  static async updateShippingPolicy(data: { storeId: string; [key: string]: any }): Promise<ApiResponse<any>> {
    return apiClient.post('/seller/shipping-policy', data);
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
