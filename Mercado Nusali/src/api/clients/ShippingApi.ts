import { apiClient, ApiResponse } from '../apiClient';

export class ShippingApi {
  static async list(): Promise<ApiResponse<any[]>> {
    return apiClient.get('/shipping/rates');
  }

  static async getById(trackingCode: string): Promise<ApiResponse<any>> {
    return apiClient.get(`/shipping/track/${trackingCode}`);
  }

  static async create(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/shipping/calculate', data);
  }

  static async update(id: string, data: any): Promise<ApiResponse<any>> {
    return apiClient.patch(`/shipping/${id}`, data);
  }

  static async delete(id: string): Promise<ApiResponse<any>> {
    return apiClient.delete(`/shipping/${id}`);
  }

  static async search(query: string): Promise<ApiResponse<any>> {
    return apiClient.get('/shipping/track', { params: { code: query } });
  }

  static async filters(): Promise<ApiResponse<any>> {
    return apiClient.get('/shipping/methods');
  }

  static async pagination(page: number = 1, limit: number = 10): Promise<ApiResponse<any>> {
    return apiClient.get('/shipping/history', { params: { page, limit } });
  }
}
