import { ApiResponse } from '../api/apiClient';
import { StoresApi } from '../api/clients/StoresApi';

export interface PublicStore {
  id: string;
  slug: string;
  name: string;
  description: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  countryCode: string;
  categoryId: string | null;
  categoryName: string | null;
  sellerId: string;
  isVerified: boolean;
  createdAt: string;
}

export const StoreService = {
  async getStores(): Promise<ApiResponse<PublicStore[]>> {
    const res = await StoresApi.list();
    return { success: res.success, data: (res.data as any) || [], message: (res as any).message, error: (res as any).error };
  },

  async getStoreById(idOrSlug: string): Promise<ApiResponse<PublicStore | null>> {
    return StoresApi.getById(idOrSlug);
  },
};
