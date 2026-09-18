import { ApiResponse } from '../api/apiClient';
import { BuyerService } from './buyerService';

export const DisputeService = {
  async getDisputes(): Promise<ApiResponse<any[]>> {
    return BuyerService.getDisputes();
  },

  // Fase M1-D1 — getDisputeById REMOVIDO junto com
  // BuyerService.getDisputeById (achado M1-A/M1-C): zero consumidores reais
  // em todo o frontend, só encaminhava para um método igualmente morto.

  async openDispute(orderId: string, reason: string, description: string): Promise<ApiResponse<any>> {
    return BuyerService.createDispute({ orderId, reason, description });
  },

  async addMessage(disputeId: string, message: string): Promise<ApiResponse<any>> {
    return BuyerService.sendDisputeMessage(disputeId, message);
  }
};
