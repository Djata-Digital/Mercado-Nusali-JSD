import { apiClient, ApiResponse } from '../api/apiClient';
import { API_CONFIG } from '../config/api';

export const ReportService = {
  async reportViolation(itemId: string, reason: string): Promise<ApiResponse<any>> {
    if (API_CONFIG.USE_FAKE_API) {
      return {
        success: true,
        data: { id: 'DNC-' + Date.now(), itemId, reason, status: 'Pendente' },
        message: 'Denúncia recebida e encaminhada à equipe de moderação.',
      };
    }
    return apiClient.post('/reports/violation', { itemId, reason });
  }
};

