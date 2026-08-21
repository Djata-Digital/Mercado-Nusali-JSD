import { apiClient, ApiResponse } from '../apiClient';
import { DisputeFilters, PaginatedResponse } from '../types';

export class DisputesApi {
  static async list(params?: DisputeFilters): Promise<ApiResponse<PaginatedResponse<any>>> {
    return apiClient.get('/disputes', { params });
  }

  static async getById(id: string): Promise<ApiResponse<any>> {
    return apiClient.get(`/disputes/${id}`);
  }

  static async create(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/disputes', data);
  }

  static async update(id: string, data: any): Promise<ApiResponse<any>> {
    return apiClient.patch(`/disputes/${id}`, data);
  }

  static async delete(id: string): Promise<ApiResponse<any>> {
    return apiClient.delete(`/disputes/${id}`);
  }

  static async search(query: string): Promise<ApiResponse<any>> {
    return apiClient.get('/disputes', { params: { q: query } });
  }

  static async filters(): Promise<ApiResponse<any>> {
    return apiClient.get('/disputes/reasons');
  }

  static async pagination(page: number = 1, limit: number = 10): Promise<ApiResponse<any>> {
    return apiClient.get('/disputes', { params: { page, limit } });
  }

  static async addMessage(id: string, text: string): Promise<ApiResponse<any>> {
    return apiClient.post(`/disputes/${id}/messages`, { text });
  }
}
