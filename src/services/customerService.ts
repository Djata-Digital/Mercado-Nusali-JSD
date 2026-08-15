import { ApiResponse } from '../api/apiClient';
import { BuyerService } from './buyerService';

export const CustomerService = {
  async getProfile(): Promise<ApiResponse<any>> {
    return BuyerService.getProfile();
  },

  async updateProfile(data: any): Promise<ApiResponse<any>> {
    return BuyerService.updateProfile(data);
  },

  async getOverview(): Promise<ApiResponse<any>> {
    return BuyerService.getOverview();
  }
};
