import { apiClient, ApiResponse } from '../apiClient';

export class EscrowApi {
  static async list(): Promise<ApiResponse<any[]>> {
    return apiClient.get('/escrow');
  }

  static async getById(id: string): Promise<ApiResponse<any>> {
    return apiClient.get(`/escrow/${id}`);
  }

  static async create(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/escrow/hold', data);
  }

  static async update(id: string, data: any): Promise<ApiResponse<any>> {
    return apiClient.patch(`/escrow/${id}`, data);
  }

  static async delete(id: string): Promise<ApiResponse<any>> {
    return apiClient.delete(`/escrow/${id}`);
  }

  static async release(id: string): Promise<ApiResponse<any>> {
    return apiClient.post(`/escrow/${id}/release`);
  }

  static async dispute(id: string, reason: string): Promise<ApiResponse<any>> {
    return apiClient.post(`/escrow/${id}/dispute`, { reason });
  }

  static async search(query: string): Promise<ApiResponse<any>> {
    return apiClient.get('/escrow/search', { params: { q: query } });
  }

  static async filters(): Promise<ApiResponse<any>> {
    return apiClient.get('/escrow/summary');
  }

  static async pagination(page: number = 1, limit: number = 10): Promise<ApiResponse<any>> {
    return apiClient.get('/escrow', { params: { page, limit } });
  }
}
