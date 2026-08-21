import { apiClient, ApiResponse } from '../apiClient';

export class UsersApi {
  static async list(): Promise<ApiResponse<any[]>> {
    return apiClient.get('/users');
  }

  static async getById(id: string): Promise<ApiResponse<any>> {
    return apiClient.get(`/users/${id}`);
  }

  static async create(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/users', data);
  }

  static async update(id: string, data: any): Promise<ApiResponse<any>> {
    return apiClient.patch(`/users/${id}`, data);
  }

  static async delete(id: string): Promise<ApiResponse<any>> {
    return apiClient.delete(`/users/${id}`);
  }

  static async search(query: string): Promise<ApiResponse<any>> {
    return apiClient.get('/users/search', { params: { q: query } });
  }

  static async filters(): Promise<ApiResponse<any>> {
    return apiClient.get('/users/filters');
  }

  static async pagination(page: number = 1, limit: number = 10): Promise<ApiResponse<any>> {
    return apiClient.get('/users', { params: { page, limit } });
  }
}
