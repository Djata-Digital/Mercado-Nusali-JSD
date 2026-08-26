import { useQuery } from '@tanstack/react-query';
import { CountryService } from '../services/countryService';

/**
 * País operacional real — exatamente o shape retornado por GET /api/v1/countries
 * (countriesRoutes.ts), fonte única de verdade sobre disponibilidade. Nunca usar
 * countriesConfig/ALL_COUNTRY_CODES para preencher isto.
 */
export interface OperationalCountry {
  code: string;
  name: string;
  flag: string;
  currency: string;
  currencySymbol: string;
  phonePrefix: string;
}

export const useCountries = () => {
  return useQuery({
    queryKey: ['countries'],
    queryFn: async () => {
      const res = await CountryService.getCountries();
      if (!res.success) {
        throw new Error((res as any).error?.message || 'Não foi possível carregar os países operacionais.');
      }
      return (res.data || []) as OperationalCountry[];
    },
  });
};

export const useRegions = (countryCode?: string) => {
  return useQuery({
    queryKey: ['regions', countryCode],
    queryFn: async () => {
      const res = await CountryService.getRegions(countryCode);
      return res.data;
    },
  });
};
