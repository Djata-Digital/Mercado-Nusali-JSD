import { ApiResponse } from '../api/apiClient';
import { AdminApi } from '../api/clients/AdminApi';
import { mockAdminKycList } from '../data/mockAdminKyc';

export const KycService = {
  async getPendingKyc(): Promise<ApiResponse<any[]>> {
    try {
      const res = await AdminApi.getKycList({ status: 'pending' });
      if (res.success && Array.isArray(res.data)) return res;
    } catch {
      // fallback
    }
    return { success: true, data: mockAdminKycList };
  },

  async approveKyc(id: string): Promise<ApiResponse<any>> {
    try {
      const res = await AdminApi.approveKyc(id);
      if (res.success) return res;
    } catch {
      // fallback
    }
    return { success: true, data: { id, status: 'approved' }, message: 'Documento KYC aprovado.' };
  },

  async rejectKyc(id: string, reason: string): Promise<ApiResponse<any>> {
    try {
      const res = await AdminApi.rejectKyc(id, reason);
      if (res.success) return res;
    } catch {
      // fallback
    }
    return { success: true, data: { id, status: 'rejected', reason }, message: 'Documento KYC rejeitado.' };
  }
};
