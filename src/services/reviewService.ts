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

  // FASE D17-C6 — antes, esta função nunca enviava orderId (o backend real
  // de POST /buyer/reviews exige productId+orderId+rating+comment; sem
  // orderId a chamada sempre falharia com 400 REVIEW_ORDER_REQUIRED). Só
  // envia exatamente os campos aceitos pelo contrato real — nunca userId/
  // authorName/authorCountry/isVerifiedPurchase/status, que são server-side.
  async addReview(input: {
    productId: string;
    orderId: string;
    rating: number;
    comment: string;
    title?: string;
    // FASE D17-C7 — URLs já enviadas ao storage (POST /upload/reviews)
    // ANTES desta chamada; nunca um arquivo bruto/base64 aqui.
    images?: string[];
  }): Promise<ApiResponse<any>> {
    const payload: Record<string, any> = {
      productId: input.productId,
      orderId: input.orderId,
      rating: input.rating,
      comment: input.comment,
    };
    if (input.title && input.title.trim()) {
      payload.title = input.title.trim();
    }
    if (Array.isArray(input.images) && input.images.length > 0) {
      payload.images = input.images;
    }
    return BuyerService.createReview(payload);
  }
};
