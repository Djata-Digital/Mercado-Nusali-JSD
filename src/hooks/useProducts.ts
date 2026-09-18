import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ProductService } from '../services/productService';
import { FilterState, Product } from '../types';

export const useProducts = (filters?: Partial<FilterState>) => {
  return useQuery({
    queryKey: ['products', filters],
    queryFn: async () => {
      const res = await ProductService.getProducts(filters);
      return res.data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes cache
  });
};

export const useProduct = (id: string, destinationCountry?: string) => {
  return useQuery({
    queryKey: ['product', id, destinationCountry],
    queryFn: async () => {
      const res = await ProductService.getProductById(id, destinationCountry);
      return res.data;
    },
    enabled: !!id,
  });
};

// FASE D17-B2 — produtos relacionados/mesma loja/você também pode gostar.
// queryKey inclui id/destinationCountry/originCountryFilter: ao trocar de
// produto (ou de destino/origem), o React Query automaticamente descarta
// qualquer resposta em voo da chave antiga (nunca sobrescreve com dado do
// produto anterior) — mesmo mecanismo já usado por useProduct acima, sem
// necessidade de AbortController manual nem cache/infra nova.
export const useProductRecommendations = (id: string, destinationCountry?: string, originCountryFilter?: string) => {
  return useQuery({
    queryKey: ['product-recommendations', id, destinationCountry, originCountryFilter],
    queryFn: async () => {
      const res = await ProductService.getProductRecommendations(id, destinationCountry, originCountryFilter);
      return res.data;
    },
    enabled: !!id,
    // Falha aqui é sempre degradação silenciosa (PASSO 9) — nunca vale a
    // pena insistir automaticamente numa seção secundária da página.
    retry: false,
  });
};

export const useCategories = () => {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await ProductService.getCategories();
      return res.data;
    },
  });
};

export const useBrands = () => {
  return useQuery({
    queryKey: ['brands'],
    queryFn: async () => {
      const res = await ProductService.getBrands();
      return res.data;
    },
  });
};

export const useCreateProduct = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Product>) => ProductService.createProduct(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
};
