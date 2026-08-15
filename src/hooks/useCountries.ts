import { useQuery } from '@tanstack/react-query';
import { CountryService } from '../services/countryService';

export const useCountries = () => {
  return useQuery({
    queryKey: ['countries'],
    queryFn: async () => {
      const res = await CountryService.getCountries();
      return res.data;
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
