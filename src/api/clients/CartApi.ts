import { apiClient, ApiResponse } from '../apiClient';

export class CartApi {
  static async list(): Promise<ApiResponse<any>> {
    return apiClient.get('/cart');
  }

  static async getById(id: string): Promise<ApiResponse<any>> {
    return apiClient.get(`/cart/${id}`);
  }

  static async create(item: any): Promise<ApiResponse<any>> {
    return apiClient.post('/cart/items', item);
  }

  // FASE D16-D2 — compra multi-variante estilo Alibaba: UM request para
  // várias linhas (productId+variantId+quantity) de uma vez, tudo ou nada.
  static async createBatch(items: any[]): Promise<ApiResponse<any>> {
    return apiClient.post('/cart/items/batch', { items });
  }

  static async update(itemId: string, data: any): Promise<ApiResponse<any>> {
    return apiClient.patch(`/cart/items/${itemId}`, data);
  }

  static async delete(itemId: string): Promise<ApiResponse<any>> {
    return apiClient.delete(`/cart/items/${itemId}`);
  }

  static async search(): Promise<ApiResponse<any>> {
    return apiClient.get('/cart');
  }

  static async filters(): Promise<ApiResponse<any>> {
    return apiClient.get('/cart');
  }

  static async pagination(): Promise<ApiResponse<any>> {
    return apiClient.get('/cart');
  }

  static async clear(): Promise<ApiResponse<any>> {
    return apiClient.delete('/cart');
  }
}
