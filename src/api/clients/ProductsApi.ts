import { apiClient, ApiResponse } from '../apiClient';
import { ProductFilters, PaginatedResponse } from '../types';

export class ProductsApi {
  static async list(params?: ProductFilters): Promise<ApiResponse<PaginatedResponse<any>>> {
    return apiClient.get('/products', { params });
  }

  static async getById(id: string): Promise<ApiResponse<any>> {
    return apiClient.get(`/products/${id}`);
  }

  static async create(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/products', data);
  }

  static async update(id: string, data: any): Promise<ApiResponse<any>> {
    return apiClient.patch(`/products/${id}`, data);
  }

  static async delete(id: string): Promise<ApiResponse<any>> {
    return apiClient.delete(`/products/${id}`);
  }

  static async search(query: string, filters?: ProductFilters): Promise<ApiResponse<PaginatedResponse<any>>> {
    return apiClient.get('/products/search', { params: { q: query, ...filters } });
  }

  static async filters(): Promise<ApiResponse<any>> {
    return apiClient.get('/products/filters');
  }

  static async pagination(page: number = 1, limit: number = 20, filters?: ProductFilters): Promise<ApiResponse<PaginatedResponse<any>>> {
    return apiClient.get('/products', { params: { page, limit, ...filters } });
  }
}
