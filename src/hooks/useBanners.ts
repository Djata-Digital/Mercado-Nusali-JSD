import { useQuery } from '@tanstack/react-query';
import { BannersApi, type PublicBanner } from '../api/clients/BannersApi';

/** Busca os banners ativos; lança em qualquer resposta que não seja uma lista de sucesso (o chamador cai no fallback). */
export async function fetchActiveBanners(country?: string): Promise<PublicBanner[]> {
  const res = await BannersApi.active(country);
  if (!res || res.success !== true || !Array.isArray(res.data)) {
    throw new Error('Resposta inválida de /banners/active');
  }
  return res.data;
}

/**
 * Banners ativos da home para o país de destino. Sem retry e com timeout curto no cliente: a home já mostra os
 * slides embutidos (fallback) e só troca quando a API responde com uma lista válida; qualquer erro mantém o fallback.
 */
export const useActiveBanners = (country?: string) =>
  useQuery({
    queryKey: ['banners', 'active', country || 'default'],
    queryFn: () => fetchActiveBanners(country),
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
