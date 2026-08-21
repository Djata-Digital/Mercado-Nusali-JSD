import { apiClient, ApiResponse } from '../apiClient';

export class SupportApi {
  static async list(): Promise<ApiResponse<any[]>> {
    return apiClient.get('/support/tickets');
  }

  static async getById(id: string): Promise<ApiResponse<any>> {
    return apiClient.get(`/support/tickets/${id}`);
  }

  static async create(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/support/tickets', data);
  }

  static async update(id: string, data: any): Promise<ApiResponse<any>> {
    return apiClient.patch(`/support/tickets/${id}`, data);
  }

  static async delete(id: string): Promise<ApiResponse<any>> {
    return apiClient.delete(`/support/tickets/${id}`);
  }

  static async search(query: string): Promise<ApiResponse<any>> {
    return apiClient.get('/support/faq', { params: { q: query } });
  }

  static async filters(): Promise<ApiResponse<any>> {
    return apiClient.get('/support/categories');
  }

  static async pagination(page: number = 1, limit: number = 10): Promise<ApiResponse<any>> {
    return apiClient.get('/support/tickets', { params: { page, limit } });
  }
}
