import { apiClient, ApiResponse } from '../api/apiClient';
import { API_CONFIG } from '../config/api';

export const CampaignService = {
  async getActiveCampaigns(): Promise<ApiResponse<any[]>> {
    if (API_CONFIG.USE_FAKE_API) {
      return {
        success: true,
        data: [
          { id: 'CMP-101', title: 'Campanha Caju de Ouro Bissau', discount: '15% OFF', banner: 'Banners Home Nusali', status: 'Ativa' },
          { id: 'CMP-102', title: 'Nusali Plus Frete Grátis CPLP', discount: 'Frete 0 XOF', banner: 'Pop-up Checkout', status: 'Agendada' }
        ],
      };
    }
    return apiClient.get('/campaigns/active');
  }
};

