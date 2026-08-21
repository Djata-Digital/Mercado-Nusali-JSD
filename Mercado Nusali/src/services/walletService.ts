import { ApiResponse } from '../api/apiClient';
import { BuyerService } from './buyerService';
import { Wallet } from '../types';

export const WalletService = {
  async getWallet(): Promise<ApiResponse<Wallet>> {
    const res = await BuyerService.getWallet();
    return {
      success: res.success,
      data: res.data as any,
      message: res.message,
    };
  },

  async addFunds(amount: number, method: string, currency?: string): Promise<ApiResponse<Wallet>> {
    const res = await BuyerService.depositWallet(amount, method, currency);
    return {
      success: res.success,
      data: res.data as any,
      message: res.message,
    };
  },

  async transferFunds(recipientEmailOrPhone: string, amount: number): Promise<ApiResponse<any>> {
    return BuyerService.transferWallet(recipientEmailOrPhone, amount);
  }
};
