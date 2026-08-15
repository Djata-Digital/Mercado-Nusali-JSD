import { apiClient, ApiResponse } from '../apiClient';

export class CategoriesApi {
  static async list(): Promise<ApiResponse<any[]>> {
    return apiClient.get('/categories');
  }

  static async getById(idOrSlug: string): Promise<ApiResponse<any>> {
    return apiClient.get(`/categories/${idOrSlug}`);
  }

  static async create(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/categories', data);
  }

  static async update(id: string, data: any): Promise<ApiResponse<any>> {
    return apiClient.patch(`/categories/${id}`, data);
  }

  static async delete(id: string): Promise<ApiResponse<any>> {
    return apiClient.delete(`/categories/${id}`);
  }

  static async search(query: string): Promise<ApiResponse<any[]>> {
    return apiClient.get('/categories/search', { params: { q: query } });
  }

  static async filters(): Promise<ApiResponse<any>> {
    return apiClient.get('/categories/filters');
  }

  static async pagination(page: number = 1, limit: number = 20): Promise<ApiResponse<any>> {
    return apiClient.get('/categories', { params: { page, limit } });
  }
}
