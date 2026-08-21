import { ApiResponse } from '../api/apiClient';
import { AdminApi } from '../api/clients/AdminApi';

export const AdminService = {
  // Overview & Stats
  async getOverview(): Promise<ApiResponse<any>> {
    return AdminApi.getOverview();
  },

  async getStats(): Promise<ApiResponse<any>> {
    return AdminApi.getStats();
  },

  // Users & Staff
  async getUsers(params?: { role?: string; status?: string; q?: string }): Promise<ApiResponse<any[]>> {
    return AdminApi.getUsers(params);
  },

  async getSellers(): Promise<ApiResponse<any[]>> {
    return AdminApi.getSellers();
  },

  async getStores(): Promise<ApiResponse<any[]>> {
    return AdminApi.getStores();
  },

  async createUser(data: any): Promise<ApiResponse<any>> {
    return AdminApi.createUser(data);
  },

  async toggleUserStatus(id: string, status?: string): Promise<ApiResponse<any>> {
    return AdminApi.toggleUserStatus(id, status);
  },

  async resetUserPassword(id: string, newPassword?: string): Promise<ApiResponse<any>> {
    return AdminApi.resetUserPassword(id, newPassword);
  },

  // KYC
  async getKycList(params?: { status?: string }): Promise<ApiResponse<any[]>> {
    return AdminApi.getKycList(params);
  },

  async approveKyc(id: string, notes?: string): Promise<ApiResponse<any>> {
    return AdminApi.approveKyc(id, notes);
  },

  async rejectKyc(id: string, reason?: string): Promise<ApiResponse<any>> {
    return AdminApi.rejectKyc(id, reason);
  },

  // Escrow & Finance
  async getEscrowList(): Promise<ApiResponse<any[]>> {
    return AdminApi.getEscrowList();
  },

  async releaseEscrow(id: string, notes?: string): Promise<ApiResponse<any>> {
    return AdminApi.releaseEscrow(id, notes);
  },

  async freezeEscrow(id: string, reason?: string): Promise<ApiResponse<any>> {
    return AdminApi.freezeEscrow(id, reason);
  },

  async getFinanceOverview(): Promise<ApiResponse<any>> {
    return AdminApi.getFinanceOverview();
  },

  async getPayoutsList(): Promise<ApiResponse<any[]>> {
    return AdminApi.getPayoutsList();
  },

  async updatePayoutStatus(id: string, status: string, transactionRef?: string): Promise<ApiResponse<any>> {
    return AdminApi.updatePayoutStatus(id, status, transactionRef);
  },

  // Disputes
  async getDisputesList(): Promise<ApiResponse<any[]>> {
    return AdminApi.getDisputesList();
  },

  async resolveDispute(id: string, resolution: string, decisionNotes?: string): Promise<ApiResponse<any>> {
    return AdminApi.resolveDispute(id, resolution, decisionNotes);
  },

  // Warehouses & Inventory Transfers
  async getWarehouses(): Promise<ApiResponse<any[]>> {
    return AdminApi.getWarehouses();
  },

  async getWarehousesList(): Promise<ApiResponse<any[]>> {
    return AdminApi.getWarehouses();
  },

  async createWarehouse(data: any): Promise<ApiResponse<any>> {
    return AdminApi.createWarehouse(data);
  },

  async getInventoryTransfers(): Promise<ApiResponse<any>> {
    return AdminApi.getInventoryTransfers();
  },

  async markInventoryTransferInTransit(id: string): Promise<ApiResponse<any>> {
    return AdminApi.markInventoryTransferInTransit(id);
  },

  async receiveInventoryTransfer(id: string): Promise<ApiResponse<any>> {
    return AdminApi.receiveInventoryTransfer(id);
  },

  async cancelInventoryTransfer(id: string): Promise<ApiResponse<any>> {
    return AdminApi.cancelInventoryTransfer(id);
  },

  // Country Reps & Supervisors
  async getCountryReps(): Promise<ApiResponse<any[]>> {
    return AdminApi.getCountryReps();
  },

  async createCountryRep(data: any): Promise<ApiResponse<any>> {
    return AdminApi.createCountryRep(data);
  },

  async getSupervisors(): Promise<ApiResponse<any[]>> {
    return AdminApi.getSupervisors();
  },

  async createSupervisor(data: any): Promise<ApiResponse<any>> {
    return AdminApi.createSupervisor(data);
  },

  // Countries & Regions
  async getCountries(): Promise<ApiResponse<any[]>> {
    return AdminApi.getCountries();
  },

  async createCountry(data: any): Promise<ApiResponse<any>> {
    return AdminApi.createCountry(data);
  },

  async toggleCountryStatus(code: string, isActive?: boolean): Promise<ApiResponse<any>> {
    return AdminApi.toggleCountryStatus(code, isActive);
  },

  async getRegions(): Promise<ApiResponse<any[]>> {
    return AdminApi.getRegions();
  },

  async createRegion(data: any): Promise<ApiResponse<any>> {
    return AdminApi.createRegion(data);
  },

  // Audit Logs & Settings
  async getAuditLogs(): Promise<ApiResponse<any[]>> {
    return AdminApi.getAuditLogs();
  },

  async getSettings(): Promise<ApiResponse<any>> {
    return AdminApi.getSettings();
  },

  async updateSettings(data: any): Promise<ApiResponse<any>> {
    return AdminApi.updateSettings(data);
  },
};
