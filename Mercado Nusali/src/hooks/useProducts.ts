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

export const useProduct = (id: string) => {
  return useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      const res = await ProductService.getProductById(id);
      return res.data;
    },
    enabled: !!id,
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
