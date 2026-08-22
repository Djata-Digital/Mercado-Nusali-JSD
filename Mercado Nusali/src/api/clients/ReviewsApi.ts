import { apiClient, ApiResponse } from '../apiClient';

export class ReviewsApi {
  static async list(productId?: string): Promise<ApiResponse<any[]>> {
    return apiClient.get('/reviews', { params: { productId } });
  }

  static async getById(id: string): Promise<ApiResponse<any>> {
    return apiClient.get(`/reviews/${id}`);
  }

  static async create(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/reviews', data);
  }

  static async update(id: string, data: any): Promise<ApiResponse<any>> {
    return apiClient.patch(`/reviews/${id}`, data);
  }

  static async delete(id: string): Promise<ApiResponse<any>> {
    return apiClient.delete(`/reviews/${id}`);
  }

  static async search(query: string): Promise<ApiResponse<any>> {
    return apiClient.get('/reviews', { params: { q: query } });
  }

  static async filters(): Promise<ApiResponse<any>> {
    return apiClient.get('/reviews/summary');
  }

  static async pagination(page: number = 1, limit: number = 10): Promise<ApiResponse<any>> {
    return apiClient.get('/reviews', { params: { page, limit } });
  }
}
