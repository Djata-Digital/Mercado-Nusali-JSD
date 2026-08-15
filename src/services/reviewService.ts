import { ApiResponse } from '../api/apiClient';
import { BuyerService } from './buyerService';

export const ReviewService = {
  async getReviews(): Promise<ApiResponse<any[]>> {
    return BuyerService.getReviews();
  },

  async getReviewsForProduct(productId: string): Promise<ApiResponse<any[]>> {
    const res = await BuyerService.getReviews();
    if (res.success && Array.isArray(res.data)) {
      const filtered = res.data.filter((r: any) => r.productId === productId);
      return { success: true, data: filtered };
    }
    return res;
  },

  async addReview(productId: string, rating: number, title: string, comment: string, productTitle?: string): Promise<ApiResponse<any>> {
    return BuyerService.createReview({ productId, rating, title, comment, productTitle });
  }
};
