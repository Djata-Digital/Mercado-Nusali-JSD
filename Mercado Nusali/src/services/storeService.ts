import { ApiResponse } from '../api/apiClient';
import { StoresApi } from '../api/clients/StoresApi';
import { API_CONFIG } from '../config/api';
import { Store } from '../types';

export const StoreService = {
  async getStores(): Promise<ApiResponse<Store[]>> {
    if (API_CONFIG.USE_FAKE_API) {
      return {
        success: true,
        data: [
          {
            id: 'str_001',
            sellerId: 'seller_001',
            name: 'Moda Afro CPLP Bissau',
            slug: 'moda-afro-cplp-bissau',
            logo: 'https://images.unsplash.com/photo-1544441893-675973e31985?w=200',
            banner: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200',
            description: 'Loja Oficial de Vestuário Tradicional Pano de Pente e Acessórios Bissau',
            address: 'Praça dos Heróis Nacionais, Bissau',
            city: 'Bissau',
            country: 'GW',
            openingHours: '08:00 - 18:00',
            policies: 'Garantia de Autenticidade Nusali Proteção',
            rating: 4.9,
            followersCount: 1420,
            status: 'active',
            team: [],
            createdAt: '2025-01-01T00:00:00Z',
          },
        ],
      };
    }
    const res = await StoresApi.list();
    return {
      success: res.success,
      data: res.data?.items || (res.data as any) || [],
      message: res.message,
    };
  },

  async getStoreBySlug(slug: string): Promise<ApiResponse<Store | null>> {
    if (API_CONFIG.USE_FAKE_API) {
      const res = await this.getStores();
      const found = res.data.find(s => s.slug === slug) || null;
      return { success: true, data: found };
    }
    return StoresApi.getById(slug);
  }
};

