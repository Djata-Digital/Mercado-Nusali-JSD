import { apiClient, ApiResponse } from '../apiClient';
import { OrderFilters, PaginatedResponse, CreateOrderFromCartResult } from '../types';

export class OrdersApi {
  static async list(params?: OrderFilters): Promise<ApiResponse<PaginatedResponse<any>>> {
    return apiClient.get('/orders', { params });
  }

  static async getById(id: string): Promise<ApiResponse<any>> {
    return apiClient.get(`/orders/${id}`);
  }

  // Fase M1-D1 — retorno tipado explicitamente (CreateOrderFromCartResult,
  // discriminado por `mode`), espelhando OrderService.createOrderFromCart.
  // `data` permanece `any` de propósito (fora do escopo desta fase — o
  // payload de entrada não muda) e CheckoutView.tsx não foi alterado (M1-D2).
  static async create(data: any): Promise<ApiResponse<CreateOrderFromCartResult>> {
    return apiClient.post('/orders', data);
  }

  static async update(id: string, data: any): Promise<ApiResponse<any>> {
    return apiClient.patch(`/orders/${id}`, data);
  }

  static async delete(id: string): Promise<ApiResponse<any>> {
    return apiClient.delete(`/orders/${id}`);
  }

  static async search(query: string, filters?: OrderFilters): Promise<ApiResponse<PaginatedResponse<any>>> {
    return apiClient.get('/orders/search', { params: { q: query, ...filters } });
  }

  static async filters(): Promise<ApiResponse<any>> {
    return apiClient.get('/orders/filters');
  }

  static async pagination(page: number = 1, limit: number = 10, filters?: OrderFilters): Promise<ApiResponse<PaginatedResponse<any>>> {
    return apiClient.get('/orders', { params: { page, limit, ...filters } });
  }
}
