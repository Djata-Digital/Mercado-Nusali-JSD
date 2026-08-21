import { ApiResponse } from '../api/apiClient';
import { AdminApi } from '../api/clients/AdminApi';

export const KycService = {
  async getPendingKyc(): Promise<ApiResponse<any[]>> {
    return AdminApi.getKycList({ status: 'pending' });
  },

  async approveKyc(id: string): Promise<ApiResponse<any>> {
    return AdminApi.approveKyc(id);
  },

  async rejectKyc(id: string, reason: string): Promise<ApiResponse<any>> {
    return AdminApi.rejectKyc(id, reason);
  }
};
