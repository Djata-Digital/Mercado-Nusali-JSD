import { apiClient, ApiResponse } from '../apiClient';
import { NotificationFilters, PaginatedResponse } from '../types';

export class NotificationsApi {
  static async list(params?: NotificationFilters): Promise<ApiResponse<PaginatedResponse<any>>> {
    return apiClient.get('/notifications', { params });
  }

  static async getById(id: string): Promise<ApiResponse<any>> {
    return apiClient.get(`/notifications/${id}`);
  }

  static async create(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/notifications', data);
  }

  static async update(id: string, data: any): Promise<ApiResponse<any>> {
    return apiClient.patch(`/notifications/${id}`, data);
  }

  static async delete(id: string): Promise<ApiResponse<any>> {
    return apiClient.delete(`/notifications/${id}`);
  }

  static async markAllAsRead(): Promise<ApiResponse<any>> {
    return apiClient.post('/notifications/read-all');
  }

  static async search(query: string): Promise<ApiResponse<any>> {
    return apiClient.get('/notifications', { params: { q: query } });
  }

  static async filters(): Promise<ApiResponse<any>> {
    return apiClient.get('/notifications/filters');
  }

  static async pagination(page: number = 1, limit: number = 10): Promise<ApiResponse<any>> {
    return apiClient.get('/notifications', { params: { page, limit } });
  }
}
