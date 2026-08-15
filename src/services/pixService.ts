import { apiClient, ApiResponse } from '../api/apiClient';
import { PixTransaction } from '../utils/pixEngine';
import { CurrencyCode } from '../types';

export interface CreatePixRequest {
  orderId?: string;
  amount: number;
  currency?: CurrencyCode;
  buyerName?: string;
  buyerCpf?: string;
  description?: string;
}

export const PixService = {
  /**
   * Creates a new real Pix charge (generates BR Code, QR code & txid)
   */
  async createPixCharge(params: CreatePixRequest): Promise<ApiResponse<PixTransaction>> {
    try {
      const response = await apiClient.post<ApiResponse<PixTransaction>>('/pix/create', params);
      return response.data;
    } catch (err: any) {
      console.error('Error in PixService.createPixCharge:', err);
      // Fallback local response if network fails
      return {
        success: false,
        message: err?.response?.data?.message || err?.message || 'Falha ao conectar com o serviço Pix',
      };
    }
  },

  /**
   * Polls or checks current status of a Pix transaction
   */
  async checkPixStatus(txid: string): Promise<ApiResponse<PixTransaction>> {
    try {
      const response = await apiClient.get<ApiResponse<PixTransaction>>(`/pix/status/${txid}`);
      return response.data;
    } catch (err: any) {
      return {
        success: false,
        message: err?.response?.data?.message || 'Erro ao consultar status do Pix',
      };
    }
  },

  /**
   * Simulates immediate bank payment (for tests / manual confirmation)
   */
  async simulatePixPayment(txid: string): Promise<ApiResponse<PixTransaction>> {
    try {
      const response = await apiClient.post<ApiResponse<PixTransaction>>(`/pix/confirm/${txid}`);
      return response.data;
    } catch (err: any) {
      return {
        success: false,
        message: err?.response?.data?.message || 'Erro ao simular pagamento Pix',
      };
    }
  },

  /**
   * Fetches all Pix transactions
   */
  async getAllTransactions(): Promise<ApiResponse<PixTransaction[]>> {
    try {
      const response = await apiClient.get<ApiResponse<PixTransaction[]>>('/pix/transactions');
      return response.data;
    } catch (err: any) {
      return {
        success: false,
        data: [],
        message: 'Erro ao carregar transações Pix',
      };
    }
  },
};
