import { apiClient, ApiResponse } from '../apiClient';
import { SellerFilters, PaginatedResponse } from '../types';

export class StoresApi {
  static async list(params?: SellerFilters): Promise<ApiResponse<PaginatedResponse<any>>> {
    return apiClient.get('/stores', { params });
  }

  static async getById(id: string): Promise<ApiResponse<any>> {
    return apiClient.get(`/stores/${id}`);
  }

  static async create(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/stores', data);
  }

  static async update(id: string, data: any): Promise<ApiResponse<any>> {
    return apiClient.patch(`/stores/${id}`, data);
  }

  static async delete(id: string): Promise<ApiResponse<any>> {
    return apiClient.delete(`/stores/${id}`);
  }

  static async search(query: string): Promise<ApiResponse<PaginatedResponse<any>>> {
    return apiClient.get('/stores/search', { params: { q: query } });
  }

  static async filters(): Promise<ApiResponse<any>> {
    return apiClient.get('/stores/filters');
  }

  static async pagination(page: number = 1, limit: number = 10): Promise<ApiResponse<PaginatedResponse<any>>> {
    return apiClient.get('/stores', { params: { page, limit } });
  }
}
