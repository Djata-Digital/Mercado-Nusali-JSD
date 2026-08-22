import { apiClient, ApiResponse } from '../apiClient';

export class WarehouseApi {
  static async list(): Promise<ApiResponse<any[]>> {
    return apiClient.get('/warehouses');
  }

  static async getById(id: string): Promise<ApiResponse<any>> {
    return apiClient.get(`/warehouses/${id}`);
  }

  static async create(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/warehouses', data);
  }

  static async update(id: string, data: any): Promise<ApiResponse<any>> {
    return apiClient.patch(`/warehouses/${id}`, data);
  }

  static async delete(id: string): Promise<ApiResponse<any>> {
    return apiClient.delete(`/warehouses/${id}`);
  }

  static async search(query: string): Promise<ApiResponse<any>> {
    return apiClient.get('/warehouses', { params: { q: query } });
  }

  static async filters(): Promise<ApiResponse<any>> {
    return apiClient.get('/warehouses/locations');
  }

  static async pagination(page: number = 1, limit: number = 10): Promise<ApiResponse<any>> {
    return apiClient.get('/warehouses', { params: { page, limit } });
  }
}
