import { apiClient, ApiResponse } from '../apiClient';

export class CountriesApi {
  static async list(): Promise<ApiResponse<any[]>> {
    return apiClient.get('/countries');
  }

  static async getById(code: string): Promise<ApiResponse<any>> {
    return apiClient.get(`/countries/${code}`);
  }

  static async create(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/countries', data);
  }

  static async update(code: string, data: any): Promise<ApiResponse<any>> {
    return apiClient.patch(`/countries/${code}`, data);
  }

  static async delete(code: string): Promise<ApiResponse<any>> {
    return apiClient.delete(`/countries/${code}`);
  }

  static async search(query: string): Promise<ApiResponse<any[]>> {
    return apiClient.get('/countries', { params: { q: query } });
  }

  static async filters(): Promise<ApiResponse<any>> {
    return apiClient.get('/countries/rates');
  }

  static async pagination(page: number = 1, limit: number = 20): Promise<ApiResponse<any>> {
    return apiClient.get('/countries', { params: { page, limit } });
  }
}
