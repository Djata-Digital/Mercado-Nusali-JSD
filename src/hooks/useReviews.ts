import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { ReviewService } from '../services/reviewService';

// FASE D17-C6 — reviews do próprio comprador, usadas para saber quais
// combinações productId+orderId já foram avaliadas (mesmo padrão de
// useDisputes.ts/useOrders.ts: useQuery + BuyerService por trás do
// ReviewService).
export const useBuyerReviews = () => {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ['buyer-reviews'],
    queryFn: async () => {
      const res = await ReviewService.getReviews();
      return res.data || [];
    },
    enabled: Boolean(isAuthenticated),
  });
};

export const useCreateReview = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { productId: string; orderId: string; rating: number; comment: string; title?: string }) =>
      ReviewService.addReview(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buyer-reviews'] });
    },
  });
};
