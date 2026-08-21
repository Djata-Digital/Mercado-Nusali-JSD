import { apiClient, ApiResponse } from '../apiClient';

export class ReturnsApi {
  static async list(): Promise<ApiResponse<any[]>> {
    return apiClient.get('/returns');
  }

  static async getById(id: string): Promise<ApiResponse<any>> {
    return apiClient.get(`/returns/${id}`);
  }

  static async create(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/returns', data);
  }

  static async update(id: string, data: any): Promise<ApiResponse<any>> {
    return apiClient.patch(`/returns/${id}`, data);
  }

  static async delete(id: string): Promise<ApiResponse<any>> {
    return apiClient.delete(`/returns/${id}`);
  }

  static async search(query: string): Promise<ApiResponse<any>> {
    return apiClient.get('/returns', { params: { q: query } });
  }

  static async filters(): Promise<ApiResponse<any>> {
    return apiClient.get('/returns/reasons');
  }

  static async pagination(page: number = 1, limit: number = 10): Promise<ApiResponse<any>> {
    return apiClient.get('/returns', { params: { page, limit } });
  }
}
