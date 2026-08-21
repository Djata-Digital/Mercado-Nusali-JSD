import { ApiResponse } from '../api/apiClient';
import { EscrowApi } from '../api/clients/EscrowApi';
import { API_CONFIG } from '../config/api';
import { mockAdminEscrowList } from '../data/mockAdminEscrow';

export const EscrowService = {
  async getEscrows(): Promise<ApiResponse<any[]>> {
    if (API_CONFIG.USE_FAKE_API) {
      return { success: true, data: mockAdminEscrowList };
    }
    return EscrowApi.list();
  },

  async releaseFunds(orderId: string): Promise<ApiResponse<any>> {
    if (API_CONFIG.USE_FAKE_API) {
      return {
        success: true,
        data: { orderId, status: 'released' },
        message: `Fundos do pedido ${orderId} liberados com sucesso ao vendedor.`,
      };
    }
    return EscrowApi.release(orderId);
  },

  async refundBuyer(orderId: string): Promise<ApiResponse<any>> {
    if (API_CONFIG.USE_FAKE_API) {
      return {
        success: true,
        data: { orderId, status: 'refunded' },
        message: `Reembolso do pedido ${orderId} processado ao comprador.`,
      };
    }
    return EscrowApi.dispute(orderId, 'refund_requested');
  }
};

