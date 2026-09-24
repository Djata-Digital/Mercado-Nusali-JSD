import { apiClient, ApiResponse } from '../apiClient';
import { PaymentFilters, PaginatedResponse, OrderPaymentInitiationResult, PurchaseGroupPaymentInitiationResult } from '../types';

export class PaymentsApi {
  static async list(params?: PaymentFilters): Promise<ApiResponse<PaginatedResponse<any>>> {
    return apiClient.get('/payments', { params });
  }

  static async getById(id: string): Promise<ApiResponse<any>> {
    return apiClient.get(`/payments/${id}`);
  }

  static async create(data: any): Promise<ApiResponse<any>> {
    return apiClient.post('/payments/process', data);
  }

  // Legado — preservado sem alteração de comportamento, só tipagem de
  // retorno (Fase M1-D1). 1 order = 1 payment.
  static async initiate(data: { orderId: string; amount?: number; currency?: string; method: string; provider?: string; idempotencyKey?: string }): Promise<ApiResponse<OrderPaymentInitiationResult>> {
    return apiClient.post('/payments/initiate', data);
  }

  // Fase M1-D1 — client tipado para o endpoint de checkout multi-seller já
  // existente no backend (POST /payments/purchase-groups/:purchaseGroupId
  // /initiate, ver paymentRoutes.ts). Recebe EXCLUSIVAMENTE purchaseGroupId
  // (nunca orderId como substituto — um group nunca tem um único orderId
  // que o represente). CheckoutView.tsx NÃO foi alterado para usar este
  // método ainda (M1-D2) — só o contrato foi preparado.
  static async initiatePurchaseGroupPayment(
    purchaseGroupId: string,
    data: { method: string; provider?: string }
  ): Promise<ApiResponse<PurchaseGroupPaymentInitiationResult>> {
    return apiClient.post(`/payments/purchase-groups/${purchaseGroupId}/initiate`, data);
  }

  static async update(id: string, data: any): Promise<ApiResponse<any>> {
    return apiClient.patch(`/payments/${id}`, data);
  }

  static async delete(id: string): Promise<ApiResponse<any>> {
    return apiClient.delete(`/payments/${id}`);
  }

  static async search(query: string): Promise<ApiResponse<any>> {
    return apiClient.get('/payments/search', { params: { q: query } });
  }

  static async filters(): Promise<ApiResponse<any>> {
    return apiClient.get('/payments/methods');
  }

  static async pagination(page: number = 1, limit: number = 10): Promise<ApiResponse<any>> {
    return apiClient.get('/payments', { params: { page, limit } });
  }
}
