import { apiClient, ApiResponse } from '../apiClient';

export class ShippingApi {
  static async list(): Promise<ApiResponse<any[]>> {
    return apiClient.get('/shipping/rates');
  }

  static async getById(trackingCode: string): Promise<ApiResponse<any>> {
    return apiClient.get(`/shipping/track/${trackingCode}`);
  }

  // FASE D16-I4 — create()/POST /shipping/calculate (motor legado) removido:
  // zero consumidor runtime real (auditoria D16-I1) — só era chamado por
  // ShippingService.calculateFreight(), que só era chamado por
  // src/utils/multiSellerFreight.ts, um módulo sem nenhum importador.

  // FASE D16-G2 — preview READ-ONLY via F4/F3 (smart fulfillment) — nunca
  // reserva estoque, nunca substitui F6.2.
  static async preview(params: {
    productId: string;
    variantId?: string | null;
    quantity: number;
    destinationShippingSectorId?: string | null;
  }): Promise<ApiResponse<any>> {
    return apiClient.get('/shipping/preview', { params });
  }

  // FASE D16-G3 — preview AGREGADO de frete para carrinho/checkout via
  // F4/F3 (paralelo ao preview de produto único acima, D16-G2). NUNCA
  // reserva estoque, nunca chama F5. Cada item leva só productId/variantId/
  // quantity — seller/peso/tarifa são sempre resolvidos no backend.
  static async previewCart(payload: {
    destinationShippingSectorId?: string | null;
    items: Array<{ productId: string; variantId?: string | null; quantity: number }>;
  }): Promise<ApiResponse<any>> {
    return apiClient.post('/shipping/preview-cart', payload);
  }

  static async update(id: string, data: any): Promise<ApiResponse<any>> {
    return apiClient.patch(`/shipping/${id}`, data);
  }

  static async delete(id: string): Promise<ApiResponse<any>> {
    return apiClient.delete(`/shipping/${id}`);
  }

  static async search(query: string): Promise<ApiResponse<any>> {
    return apiClient.get('/shipping/track', { params: { code: query } });
  }

  static async filters(): Promise<ApiResponse<any>> {
    return apiClient.get('/shipping/methods');
  }

  static async pagination(page: number = 1, limit: number = 10): Promise<ApiResponse<any>> {
    return apiClient.get('/shipping/history', { params: { page, limit } });
  }
}
