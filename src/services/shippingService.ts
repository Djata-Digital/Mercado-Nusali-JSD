import { ApiResponse } from '../api/apiClient';
import { ShippingApi } from '../api/clients/ShippingApi';
import { API_CONFIG } from '../config/api';
import { mockAdminLogisticsList } from '../data/mockAdminLogistics';

export const ShippingService = {
  async getShipments(): Promise<ApiResponse<any[]>> {
    if (API_CONFIG.USE_FAKE_API) {
      return { success: true, data: mockAdminLogisticsList };
    }
    return ShippingApi.list();
  },

  async calculateFreight(originCountry: string, destCountry: string, weightKg: number): Promise<ApiResponse<{ price: number; estimatedDays: number }>> {
    if (API_CONFIG.USE_FAKE_API) {
      const isCrossBorder = originCountry !== destCountry;
      return {
        success: true,
        data: {
          price: isCrossBorder ? 12500 : 1500,
          estimatedDays: isCrossBorder ? 5 : 1,
        },
      };
    }
    return ShippingApi.create({ originCountry, destCountry, weightKg });
  }
};

