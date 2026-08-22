import { ApiResponse } from '../api/apiClient';
import { CountriesApi } from '../api/clients/CountriesApi';
import { API_CONFIG } from '../config/api';
import { mockCountriesList } from '../data/mockCountries';
import { mockRegionsList } from '../data/mockRegions';

export const CountryService = {
  async getCountries(): Promise<ApiResponse<any[]>> {
    if (API_CONFIG.USE_FAKE_API) {
      return { success: true, data: mockCountriesList };
    }
    return CountriesApi.list();
  },

  async getRegions(countryCode?: string): Promise<ApiResponse<any[]>> {
    if (API_CONFIG.USE_FAKE_API) {
      let res = mockRegionsList;
      if (countryCode) {
        res = res.filter(r => r.countryCode === countryCode);
      }
      return { success: true, data: res };
    }
    return CountriesApi.search(countryCode || '');
  }
};

