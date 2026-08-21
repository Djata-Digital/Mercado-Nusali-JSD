import { ApiResponse } from '../api/apiClient';
import { WarehouseApi } from '../api/clients/WarehouseApi';
import { API_CONFIG } from '../config/api';
import { mockWarehousesList } from '../data/mockAdminWarehouses';

export const WarehouseService = {
  async getWarehouses(): Promise<ApiResponse<any[]>> {
    if (API_CONFIG.USE_FAKE_API) {
      return { success: true, data: mockWarehousesList };
    }
    return WarehouseApi.list();
  }
};

