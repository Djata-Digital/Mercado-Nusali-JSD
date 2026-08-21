import { ApiResponse } from '../api/apiClient';
import { BuyerService } from './buyerService';

export const CouponService = {
  async getCoupons(): Promise<ApiResponse<any[]>> {
    return BuyerService.getCoupons();
  },

  async claimCoupon(couponId?: string, code?: string): Promise<ApiResponse<any>> {
    return BuyerService.claimCoupon(couponId, code);
  },

  async validateCoupon(code: string): Promise<ApiResponse<{ discountPercentage: number; code: string; discount?: string }>> {
    const res = await BuyerService.validateCoupon(code);
    if (res.success && res.data) {
      return {
        success: true,
        data: {
          discountPercentage: res.data.discountPercentage || 10,
          code: res.data.code,
          discount: res.data.discount,
        },
        message: res.message || 'Cupom aplicado com sucesso!',
      };
    }
    return {
      success: false,
      data: null as any,
      message: res.message || 'Cupom inválido ou expirado.',
    };
  }
};
