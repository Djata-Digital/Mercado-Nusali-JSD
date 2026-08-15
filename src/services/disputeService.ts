import { ApiResponse } from '../api/apiClient';
import { BuyerService } from './buyerService';

export const DisputeService = {
  async getDisputes(): Promise<ApiResponse<any[]>> {
    return BuyerService.getDisputes();
  },

  async getDisputeById(id: string): Promise<ApiResponse<any>> {
    return BuyerService.getDisputeById(id);
  },

  async openDispute(orderId: string, reason: string, description: string): Promise<ApiResponse<any>> {
    return BuyerService.createDispute({ orderId, reason, description });
  },

  async addMessage(disputeId: string, message: string): Promise<ApiResponse<any>> {
    return BuyerService.sendDisputeMessage(disputeId, message);
  }
};
