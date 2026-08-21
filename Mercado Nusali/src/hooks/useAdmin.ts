import { useQuery } from '@tanstack/react-query';
import { AdminService } from '../services/adminService';

export const useAdminUsers = () => {
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const res = await AdminService.getUsers();
      return res.data;
    },
  });
};

export const useAdminSellers = () => {
  return useQuery({
    queryKey: ['admin', 'sellers'],
    queryFn: async () => {
      const res = await AdminService.getSellers();
      return res.data;
    },
  });
};

export const useAdminKyc = () => {
  return useQuery({
    queryKey: ['admin', 'kyc'],
    queryFn: async () => {
      const res = await AdminService.getKycList();
      return res.data;
    },
  });
};

export const useAdminEscrow = () => {
  return useQuery({
    queryKey: ['admin', 'escrow'],
    queryFn: async () => {
      const res = await AdminService.getEscrowList();
      return res.data;
    },
  });
};

export const useAdminDisputes = () => {
  return useQuery({
    queryKey: ['admin', 'disputes'],
    queryFn: async () => {
      const res = await AdminService.getDisputesList();
      return res.data;
    },
  });
};

export const useAdminWarehouses = () => {
  return useQuery({
    queryKey: ['admin', 'warehouses'],
    queryFn: async () => {
      const res = await AdminService.getWarehousesList();
      return res.data;
    },
  });
};
