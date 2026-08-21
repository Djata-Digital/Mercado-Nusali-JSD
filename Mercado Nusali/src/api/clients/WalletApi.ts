import { apiClient, ApiResponse } from '../apiClient';

export class WalletApi {
  static async list(): Promise<ApiResponse<any>> {
    return apiClient.get('/wallet/transactions');
  }

  static async getById(id: string): Promise<ApiResponse<any>> {
    return apiClient.get(`/wallet/transactions/${id}`);
  }

  static async create(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/wallet/deposit', data);
  }

  static async update(id: string, data: any): Promise<ApiResponse<any>> {
    return apiClient.patch(`/wallet/${id}`, data);
  }

  static async delete(id: string): Promise<ApiResponse<any>> {
    return apiClient.delete(`/wallet/${id}`);
  }

  static async search(query: string): Promise<ApiResponse<any>> {
    return apiClient.get('/wallet/transactions', { params: { q: query } });
  }

  static async filters(): Promise<ApiResponse<any>> {
    return apiClient.get('/wallet/summary');
  }

  static async pagination(page: number = 1, limit: number = 10): Promise<ApiResponse<any>> {
    return apiClient.get('/wallet/transactions', { params: { page, limit } });
  }

  static async withdraw(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/wallet/withdraw', data);
  }
}
