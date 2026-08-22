import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DisputeService } from '../services/disputeService';
import { useAuth } from '../context/AuthContext';

export const useDisputes = () => {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ['disputes'],
    queryFn: async () => {
      const res = await DisputeService.getDisputes();
      return res.data || [];
    },
    enabled: Boolean(isAuthenticated),
  });
};

export const useOpenDispute = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, reason, description }: { orderId: string; reason: string; description: string }) =>
      DisputeService.openDispute(orderId, reason, description),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disputes'] });
    },
  });
};
