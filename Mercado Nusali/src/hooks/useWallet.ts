import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { WalletService } from '../services/walletService';

export const useWallet = () => {
  return useQuery({
    queryKey: ['wallet'],
    queryFn: async () => {
      const res = await WalletService.getWallet();
      return res.data;
    },
  });
};

export const useAddFunds = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ amount, method }: { amount: number; method: string }) => WalletService.addFunds(amount, method),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
    },
  });
};
