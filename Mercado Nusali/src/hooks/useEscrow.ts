import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { EscrowService } from '../services/escrowService';

export const useEscrows = () => {
  return useQuery({
    queryKey: ['escrows'],
    queryFn: async () => {
      const res = await EscrowService.getEscrows();
      return res.data;
    },
  });
};

export const useReleaseEscrow = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => EscrowService.releaseFunds(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escrows'] });
    },
  });
};

export const useRefundBuyer = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => EscrowService.refundBuyer(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escrows'] });
    },
  });
};
