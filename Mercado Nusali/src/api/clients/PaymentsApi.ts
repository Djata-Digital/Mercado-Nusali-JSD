import { apiClient, ApiResponse } from '../apiClient';
import { PaymentFilters, PaginatedResponse } from '../types';

export class PaymentsApi {
  static async list(params?: PaymentFilters): Promise<ApiResponse<PaginatedResponse<any>>> {
    return apiClient.get('/payments', { params });
  }

  static async getById(id: string): Promise<ApiResponse<any>> {
    return apiClient.get(`/payments/${id}`);
  }

  static async create(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/payments/process', data);
  }

  static async initiate(data: { orderId: string; amount: number; currency?: string; method: string; provider?: string; idempotencyKey?: string }): Promise<ApiResponse<any>> {
    return apiClient.post('/payments/initiate', data);
  }

  static async update(id: string, data: any): Promise<ApiResponse<any>> {
    return apiClient.patch(`/payments/${id}`, data);
  }

  static async delete(id: string): Promise<ApiResponse<any>> {
    return apiClient.delete(`/payments/${id}`);
  }

  static async search(query: string): Promise<ApiResponse<any>> {
    return apiClient.get('/payments/search', { params: { q: query } });
  }

  static async filters(): Promise<ApiResponse<any>> {
    return apiClient.get('/payments/methods');
  }

  static async pagination(page: number = 1, limit: number = 10): Promise<ApiResponse<any>> {
    return apiClient.get('/payments', { params: { page, limit } });
  }
}
