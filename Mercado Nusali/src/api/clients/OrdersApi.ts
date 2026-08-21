import { apiClient, ApiResponse } from '../apiClient';
import { OrderFilters, PaginatedResponse } from '../types';

export class OrdersApi {
  static async list(params?: OrderFilters): Promise<ApiResponse<PaginatedResponse<any>>> {
    return apiClient.get('/orders', { params });
  }

  static async getById(id: string): Promise<ApiResponse<any>> {
    return apiClient.get(`/orders/${id}`);
  }

  static async create(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/orders', data);
  }

  static async update(id: string, data: any): Promise<ApiResponse<any>> {
    return apiClient.patch(`/orders/${id}`, data);
  }

  static async delete(id: string): Promise<ApiResponse<any>> {
    return apiClient.delete(`/orders/${id}`);
  }

  static async search(query: string, filters?: OrderFilters): Promise<ApiResponse<PaginatedResponse<any>>> {
    return apiClient.get('/orders/search', { params: { q: query, ...filters } });
  }

  static async filters(): Promise<ApiResponse<any>> {
    return apiClient.get('/orders/filters');
  }

  static async pagination(page: number = 1, limit: number = 10, filters?: OrderFilters): Promise<ApiResponse<PaginatedResponse<any>>> {
    return apiClient.get('/orders', { params: { page, limit, ...filters } });
  }
}
