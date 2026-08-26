import { useQuery } from '@tanstack/react-query';
import { StoreService, PublicStore } from '../services/storeService';

export const useStores = () => {
  return useQuery({
    queryKey: ['stores'],
    queryFn: async (): Promise<PublicStore[]> => {
      const res = await StoreService.getStores();
      if (!res.success) {
        throw new Error(res.error?.message || 'Não foi possível carregar as lojas.');
      }
      return res.data || [];
    },
  });
};

export const useStore = (idOrSlug: string | undefined) => {
  return useQuery({
    queryKey: ['store', idOrSlug],
    queryFn: async (): Promise<PublicStore | null> => {
      const res = await StoreService.getStoreById(idOrSlug as string);
      if (!res.success) {
        throw new Error(res.error?.message || 'Loja não encontrada.');
      }
      return res.data || null;
    },
    enabled: !!idOrSlug,
    retry: false,
  });
};
