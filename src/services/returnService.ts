import { ApiResponse } from '../api/apiClient';
import { BuyerService } from './buyerService';

export const ReturnService = {
  async getReturns(): Promise<ApiResponse<any[]>> {
    return BuyerService.getReturns();
  },

  async requestReturn(orderId: string, reason: string, description?: string, productTitle?: string): Promise<ApiResponse<any>> {
    return BuyerService.createReturn({ orderId, reason, description: description || 'Solicitação de devolução/troca', productTitle });
  }
};
