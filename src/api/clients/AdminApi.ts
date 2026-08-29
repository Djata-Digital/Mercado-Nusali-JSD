import { apiClient, ApiResponse } from '../apiClient';

export class AdminApi {
  // Overview & Stats
  static async getOverview(): Promise<ApiResponse<any>> {
    return apiClient.get('/admin/overview');
  }

  static async getStats(): Promise<ApiResponse<any>> {
    return apiClient.get('/admin/stats');
  }

  // Users & Staff
  static async getUsers(params?: { role?: string; status?: string; q?: string }): Promise<ApiResponse<any[]>> {
    return apiClient.get('/admin/users', { params });
  }

  static async getSellers(): Promise<ApiResponse<any[]>> {
    return apiClient.get('/admin/sellers');
  }

  static async getStores(): Promise<ApiResponse<any[]>> {
    return apiClient.get('/admin/stores');
  }

  static async getUserById(id: string): Promise<ApiResponse<any>> {
    return apiClient.get(`/admin/users/${id}`);
  }

  static async createUser(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/admin/users', data);
  }

  static async toggleUserStatus(id: string, status?: string): Promise<ApiResponse<any>> {
    return apiClient.patch(`/admin/users/${id}/status`, { status });
  }

  static async resetUserPassword(id: string, newPassword?: string): Promise<ApiResponse<any>> {
    return apiClient.post(`/admin/users/${id}/reset-password`, { newPassword });
  }

  // KYC
  static async getKycList(params?: { status?: string }): Promise<ApiResponse<any[]>> {
    return apiClient.get('/admin/kyc', { params });
  }

  static async approveKyc(id: string, notes?: string): Promise<ApiResponse<any>> {
    return apiClient.post(`/admin/kyc/${id}/approve`, { notes });
  }

  static async rejectKyc(id: string, reason?: string): Promise<ApiResponse<any>> {
    return apiClient.post(`/admin/kyc/${id}/reject`, { reason });
  }

  // Escrow & Payouts
  static async getEscrowList(): Promise<ApiResponse<any[]>> {
    return apiClient.get('/admin/escrow');
  }

  static async releaseEscrow(id: string, notes?: string): Promise<ApiResponse<any>> {
    return apiClient.post(`/admin/escrow/${id}/release`, { notes });
  }

  static async freezeEscrow(id: string, reason?: string): Promise<ApiResponse<any>> {
    return apiClient.post(`/admin/escrow/${id}/freeze`, { reason });
  }

  static async getFinanceOverview(): Promise<ApiResponse<any>> {
    return apiClient.get('/admin/finance/overview');
  }

  static async getPayoutsList(): Promise<ApiResponse<any[]>> {
    return apiClient.get('/admin/payouts');
  }

  static async updatePayoutStatus(id: string, status: string, transactionRef?: string): Promise<ApiResponse<any>> {
    return apiClient.post(`/admin/payouts/${id}/status`, { status, transactionRef });
  }

  // Disputes
  static async getDisputesList(): Promise<ApiResponse<any[]>> {
    return apiClient.get('/admin/disputes');
  }

  static async resolveDispute(id: string, resolution: string, decisionNotes?: string): Promise<ApiResponse<any>> {
    return apiClient.post(`/admin/disputes/${id}/resolve`, { resolution, decisionNotes });
  }

  // Warehouses
  static async getWarehousesList(): Promise<ApiResponse<any[]>> {
    return apiClient.get('/admin/warehouses');
  }

  static async getWarehouses(): Promise<ApiResponse<any[]>> {
    return apiClient.get('/admin/warehouses');
  }

  static async createWarehouse(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/admin/warehouses', data);
  }

  // Inventory Transfers & Fulfillment
  static async getInventoryTransfers(): Promise<ApiResponse<any>> {
    return apiClient.get('/admin/inventory/transfers');
  }

  static async markInventoryTransferInTransit(id: string): Promise<ApiResponse<any>> {
    return apiClient.post(`/admin/inventory/transfers/${id}/in-transit`);
  }

  static async receiveInventoryTransfer(id: string): Promise<ApiResponse<any>> {
    return apiClient.post(`/admin/inventory/transfers/${id}/receive`);
  }

  static async cancelInventoryTransfer(id: string): Promise<ApiResponse<any>> {
    return apiClient.post(`/admin/inventory/transfers/${id}/cancel`);
  }

  static async getHubFulfillmentOrders(params?: { warehouseId?: string; status?: string }): Promise<ApiResponse<any>> {
    return apiClient.get('/admin/logistics/fulfillment/orders', { params });
  }

  static async updateHubOrderStatus(orderItemId: string, status: string): Promise<ApiResponse<any>> {
    return apiClient.post(`/admin/logistics/fulfillment/orders/${orderItemId}/status`, { status });
  }

  static async updateHubFulfillmentOrderStatus(orderItemId: string, data: { status: string; trackingCode?: string }): Promise<ApiResponse<any>> {
    return apiClient.post(`/admin/logistics/fulfillment/orders/${orderItemId}/status`, data);
  }

  static async confirmDevPayment(orderId: string): Promise<ApiResponse<any>> {
    return apiClient.post(`/admin/dev/payments/${orderId}/confirm`);
  }

  static async getShipments(params?: { status?: string; fulfillmentMode?: string; countryCode?: string; search?: string }): Promise<ApiResponse<any>> {
    return apiClient.get('/admin/logistics/shipments', { params });
  }

  static async updateShipmentStatus(shipmentId: string, data: { status: string; location?: string; description?: string; failureReason?: string; receivedBy?: string }): Promise<ApiResponse<any>> {
    return apiClient.patch(`/admin/logistics/shipments/${shipmentId}/status`, data);
  }

  static async getShipmentDetails(shipmentId: string): Promise<ApiResponse<any>> {
    return apiClient.get(`/admin/logistics/shipments/${shipmentId}/details`);
  }

  // Country Reps & Supervisors
  static async getCountryReps(): Promise<ApiResponse<any[]>> {
    return apiClient.get('/admin/country-reps');
  }

  static async createCountryRep(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/admin/country-reps', data);
  }

  static async getSupervisors(): Promise<ApiResponse<any[]>> {
    return apiClient.get('/admin/supervisors');
  }

  static async createSupervisor(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/admin/supervisors', data);
  }

  // Countries & Regions
  static async getCountries(): Promise<ApiResponse<any[]>> {
    return apiClient.get('/admin/countries');
  }

  static async createCountry(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/admin/countries', data);
  }

  static async toggleCountryStatus(code: string, isActive?: boolean): Promise<ApiResponse<any>> {
    return apiClient.patch(`/admin/countries/${code}/status`, { isActive });
  }

  static async getRegions(): Promise<ApiResponse<any[]>> {
    return apiClient.get('/admin/regions');
  }

  static async createRegion(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/admin/regions', data);
  }

  // Audit Logs & Settings
  static async getAuditLogs(): Promise<ApiResponse<any[]>> {
    return apiClient.get('/admin/audit');
  }

  static async getSettings(): Promise<ApiResponse<any>> {
    return apiClient.get('/admin/settings');
  }

  static async updateSettings(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/admin/settings', data);
  }

  // Categories
  static async getCategories(): Promise<ApiResponse<any[]>> {
    return apiClient.get('/admin/categories');
  }

  static async createCategory(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/admin/categories', data);
  }

  static async updateCategory(id: string, data: any): Promise<ApiResponse<any>> {
    return apiClient.patch(`/admin/categories/${id}`, data);
  }

  static async deleteCategory(id: string): Promise<ApiResponse<any>> {
    return apiClient.delete(`/admin/categories/${id}`);
  }

  // Category Attributes
  static async getCategoryAttributes(categoryId: string): Promise<ApiResponse<any[]>> {
    return apiClient.get(`/admin/categories/${categoryId}/attributes`);
  }

  static async createCategoryAttribute(categoryId: string, data: any): Promise<ApiResponse<any>> {
    return apiClient.post(`/admin/categories/${categoryId}/attributes`, data);
  }

  static async updateCategoryAttribute(attributeId: string, data: any): Promise<ApiResponse<any>> {
    return apiClient.patch(`/admin/category-attributes/${attributeId}`, data);
  }

  static async deleteCategoryAttribute(attributeId: string): Promise<ApiResponse<any>> {
    return apiClient.delete(`/admin/category-attributes/${attributeId}`);
  }

  // Shipping Rates (Requirement 8)
  static async getShippingRates(): Promise<ApiResponse<any[]>> {
    return apiClient.get('/admin/shipping-rates');
  }

  static async createShippingRate(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/admin/shipping-rates', data);
  }

  static async deleteShippingRate(id: string): Promise<ApiResponse<any>> {
    return apiClient.delete(`/admin/shipping-rates/${id}`);
  }

  static async updateShippingRate(id: string, data: any): Promise<ApiResponse<any>> {
    return apiClient.patch(`/admin/shipping-rates/${id}`, data);
  }

  static async toggleShippingRate(id: string, isActive?: boolean): Promise<ApiResponse<any>> {
    return apiClient.patch(`/admin/shipping-rates/${id}/toggle`, isActive !== undefined ? { isActive } : {});
  }

  static async getShippingRateCoverage(params: { originCountry: string; destinationCountry: string; currency: string }): Promise<ApiResponse<any>> {
    return apiClient.get('/admin/shipping-rates/coverage', { params });
  }

  static async simulateShippingRate(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/admin/shipping-rates/simulate', data);
  }
}
