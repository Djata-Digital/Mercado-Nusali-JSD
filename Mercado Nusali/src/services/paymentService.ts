import { ApiResponse } from '../api/apiClient';
import { PaymentsApi } from '../api/clients/PaymentsApi';
import { API_CONFIG } from '../config/api';
import { PaymentDetails, PaymentMethodType } from '../types';

export const PaymentService = {
  async processPayment(details: PaymentDetails, amount: number): Promise<ApiResponse<{ transactionId: string; status: 'approved' | 'pending' | 'failed' }>> {
    if (API_CONFIG.USE_FAKE_API) {
      await new Promise(r => setTimeout(r, 200));
      return {
        success: true,
        data: {
          transactionId: 'TX-NUSALI-' + Date.now(),
          status: 'approved',
        },
        message: 'Pagamento processado com sucesso via Nusali Pay / Gateway CPLP!',
      };
    }
    return PaymentsApi.create({ details, amount });
  },

  async getAvailablePaymentMethods(countryCode: string): Promise<ApiResponse<PaymentMethodType[]>> {
    if (API_CONFIG.USE_FAKE_API) {
      return {
        success: true,
        data: ['orange_money', 'mtn_money', 'pix', 'credit_card', 'nusali_wallet', 'stripe_paypal'],
      };
    }
    return PaymentsApi.filters();
  }
};

