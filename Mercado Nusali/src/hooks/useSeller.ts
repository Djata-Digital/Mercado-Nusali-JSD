import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SellerService } from '../services/sellerService';

export const useSellerProfile = () => {
  return useQuery({
    queryKey: ['seller', 'profile'],
    queryFn: async () => {
      const res = await SellerService.getProfile();
      return res.data;
    },
  });
};

export const useSellerProducts = () => {
  return useQuery({
    queryKey: ['seller', 'products'],
    queryFn: async () => {
      const res = await SellerService.getProducts();
      return res.data;
    },
  });
};

export const useSellerOrders = () => {
  return useQuery({
    queryKey: ['seller', 'orders'],
    queryFn: async () => {
      const res = await SellerService.getOrders();
      return res.data;
    },
  });
};

export const useSellerFinancials = () => {
  return useQuery({
    queryKey: ['seller', 'financials'],
    queryFn: async () => {
      const res = await SellerService.getFinancials();
      return res.data;
    },
  });
};

export const useUpdateStore = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => SellerService.updateStore(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller'] });
    },
  });
};
