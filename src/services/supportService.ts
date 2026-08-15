import { ApiResponse } from '../api/apiClient';
import { BuyerService } from './buyerService';

export const SupportService = {
  async getTickets(): Promise<ApiResponse<any[]>> {
    return BuyerService.getTickets();
  },

  async createTicket(data: { subject: string; category: string; message: string; priority?: string }): Promise<ApiResponse<any>> {
    return BuyerService.createTicket(data);
  }
};
