import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { OrderService } from '../services/orderService';
import { Order } from '../types';

export const useOrders = () => {
  return useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const res = await OrderService.getOrders();
      return res.data;
    },
  });
};

export const useOrder = (id: string) => {
  return useQuery({
    queryKey: ['order', id],
    queryFn: async () => {
      const res = await OrderService.getOrderById(id);
      return res.data;
    },
    enabled: !!id,
  });
};

export const useCreateOrder = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Order>) => OrderService.createOrder(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
};
