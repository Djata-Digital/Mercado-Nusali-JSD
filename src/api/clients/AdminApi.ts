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

  // Escrow
  static async getEscrowList(): Promise<ApiResponse<any[]>> {
    return apiClient.get('/admin/escrow');
  }

  static async releaseEscrow(id: string, notes?: string): Promise<ApiResponse<any>> {
    return apiClient.post(`/admin/escrow/${id}/release`, { notes });
  }

  static async freezeEscrow(id: string, reason?: string): Promise<ApiResponse<any>> {
    return apiClient.post(`/admin/escrow/${id}/freeze`, { reason });
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

  static async createWarehouse(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/admin/warehouses', data);
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
}
