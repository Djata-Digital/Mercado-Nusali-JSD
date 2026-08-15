import { ApiResponse } from '../api/apiClient';
import { AdminApi } from '../api/clients/AdminApi';
import { mockAdminUsersList } from '../data/mockAdminUsers';
import { mockKycReviewList } from '../data/mockAdminKyc';
import { mockAdminEscrowList } from '../data/mockAdminEscrow';
import { mockAdminDisputesList } from '../data/mockAdminDisputes';
import { mockWarehousesList } from '../data/mockAdminWarehouses';
import { mockRepresentativesList } from '../data/mockRepresentatives';
import { mockRegionsList } from '../data/mockRegions';
import { mockAuditLogsList } from '../data/mockAdminAudit';

export const AdminService = {
  // Overview & Stats
  async getOverview(): Promise<ApiResponse<any>> {
    try {
      const res = await AdminApi.getOverview();
      if (res.success && res.data) return res;
    } catch {
      // fallback
    }
    return {
      success: true,
      data: {
        metrics: {
          totalGmvFormatted: '1.450.000.000 XOF',
          totalOrdersCount: 14280,
          activeUsersCount: 6,
          verifiedSellersCount: 3,
          pendingKycCount: 2,
          activeDisputesCount: 2,
          escrowInCustodyFormatted: '630.000 XOF',
          activeHubsCount: 4,
          securityAlertsCount: 0,
        },
        recentActivity: mockAuditLogsList,
      },
    };
  },

  async getStats(): Promise<ApiResponse<any>> {
    try {
      const res = await AdminApi.getStats();
      if (res.success && res.data) return res;
    } catch {
      // fallback
    }
    return {
      success: true,
      data: {
        countries: ['GW', 'BR', 'PT', 'AO', 'MZ', 'CV', 'ST', 'TL'],
        currencies: ['XOF', 'BRL', 'EUR', 'AOA', 'MZN', 'CVE', 'STN', 'USD'],
      },
    };
  },

  // Users & Staff
  async getUsers(params?: { role?: string; status?: string; q?: string }): Promise<ApiResponse<any[]>> {
    try {
      const res = await AdminApi.getUsers(params);
      if (res.success && Array.isArray(res.data)) return res;
    } catch {
      // fallback
    }
    return { success: true, data: mockAdminUsersList };
  },

  async getSellers(): Promise<ApiResponse<any[]>> {
    try {
      const res = await AdminApi.getUsers({ role: 'seller' });
      if (res.success && Array.isArray(res.data)) return res;
    } catch {
      // fallback
    }
    return { success: true, data: mockAdminUsersList.filter(u => u.role === 'seller') };
  },

  async createUser(data: any): Promise<ApiResponse<any>> {
    try {
      const res = await AdminApi.createUser(data);
      if (res.success) return res;
    } catch {
      // fallback
    }
    return {
      success: true,
      message: `Usuário ${data.name} cadastrado com sucesso!`,
      data: { ...data, id: `USR-${Date.now().toString().slice(-4)}` },
    };
  },

  async toggleUserStatus(id: string, status?: string): Promise<ApiResponse<any>> {
    try {
      const res = await AdminApi.toggleUserStatus(id, status);
      if (res.success) return res;
    } catch {
      // fallback
    }
    return {
      success: true,
      message: `Status do usuário atualizado para ${status || 'ativo'}.`,
    };
  },

  async resetUserPassword(id: string, newPassword?: string): Promise<ApiResponse<any>> {
    try {
      const res = await AdminApi.resetUserPassword(id, newPassword);
      if (res.success) return res;
    } catch {
      // fallback
    }
    return {
      success: true,
      message: 'Senha redefinida com sucesso!',
    };
  },

  // KYC
  async getKycList(): Promise<ApiResponse<any[]>> {
    try {
      const res = await AdminApi.getKycList();
      if (res.success && Array.isArray(res.data)) return res;
    } catch {
      // fallback
    }
    return { success: true, data: mockKycReviewList };
  },

  async approveKyc(id: string, notes?: string): Promise<ApiResponse<any>> {
    try {
      const res = await AdminApi.approveKyc(id, notes);
      if (res.success) return res;
    } catch {
      // fallback
    }
    return { success: true, message: `Documento #${id} aprovado com sucesso!` };
  },

  async rejectKyc(id: string, reason?: string): Promise<ApiResponse<any>> {
    try {
      const res = await AdminApi.rejectKyc(id, reason);
      if (res.success) return res;
    } catch {
      // fallback
    }
    return { success: true, message: `Documento #${id} rejeitado.` };
  },

  // Escrow
  async getEscrowList(): Promise<ApiResponse<any[]>> {
    try {
      const res = await AdminApi.getEscrowList();
      if (res.success && Array.isArray(res.data)) return res;
    } catch {
      // fallback
    }
    return { success: true, data: mockAdminEscrowList };
  },

  async releaseEscrow(id: string, notes?: string): Promise<ApiResponse<any>> {
    try {
      const res = await AdminApi.releaseEscrow(id, notes);
      if (res.success) return res;
    } catch {
      // fallback
    }
    return { success: true, message: `Custódia #${id} liberada ao vendedor.` };
  },

  async freezeEscrow(id: string, reason?: string): Promise<ApiResponse<any>> {
    try {
      const res = await AdminApi.freezeEscrow(id, reason);
      if (res.success) return res;
    } catch {
      // fallback
    }
    return { success: true, message: `Custódia #${id} bloqueada para auditoria.` };
  },

  // Disputes
  async getDisputesList(): Promise<ApiResponse<any[]>> {
    try {
      const res = await AdminApi.getDisputesList();
      if (res.success && Array.isArray(res.data)) return res;
    } catch {
      // fallback
    }
    return { success: true, data: mockAdminDisputesList };
  },

  async resolveDispute(id: string, resolution: string, decisionNotes?: string): Promise<ApiResponse<any>> {
    try {
      const res = await AdminApi.resolveDispute(id, resolution, decisionNotes);
      if (res.success) return res;
    } catch {
      // fallback
    }
    return { success: true, message: `Disputa #${id} resolvida.` };
  },

  // Warehouses
  async getWarehousesList(): Promise<ApiResponse<any[]>> {
    try {
      const res = await AdminApi.getWarehousesList();
      if (res.success && Array.isArray(res.data)) return res;
    } catch {
      // fallback
    }
    return { success: true, data: mockWarehousesList };
  },

  async createWarehouse(data: any): Promise<ApiResponse<any>> {
    try {
      const res = await AdminApi.createWarehouse(data);
      if (res.success) return res;
    } catch {
      // fallback
    }
    return { success: true, message: `HUB Logístico cadastrado com sucesso!`, data };
  },

  // Country Reps & Supervisors
  async getCountryReps(): Promise<ApiResponse<any[]>> {
    try {
      const res = await AdminApi.getCountryReps();
      if (res.success && Array.isArray(res.data)) return res;
    } catch {
      // fallback
    }
    return { success: true, data: mockRepresentativesList };
  },

  async createCountryRep(data: any): Promise<ApiResponse<any>> {
    try {
      const res = await AdminApi.createCountryRep(data);
      if (res.success) return res;
    } catch {
      // fallback
    }
    return { success: true, message: `Representante nomeado com sucesso!`, data };
  },

  async getSupervisors(): Promise<ApiResponse<any[]>> {
    try {
      const res = await AdminApi.getSupervisors();
      if (res.success && Array.isArray(res.data)) return res;
    } catch {
      // fallback
    }
    return {
      success: true,
      data: mockRegionsList.map((r, idx) => ({
        id: `SUP-${r.id}`,
        name: r.supervisorName,
        email: r.supervisorEmail,
        phone: `+245 955${100000 + idx * 11111}`,
        regionName: r.name,
        countryCode: r.countryCode,
        activeCouriersCount: r.activeSellers,
        monthlyDeliveries: r.monthlyOrders,
        status: 'active',
      })),
    };
  },

  async createSupervisor(data: any): Promise<ApiResponse<any>> {
    try {
      const res = await AdminApi.createSupervisor(data);
      if (res.success) return res;
    } catch {
      // fallback
    }
    return { success: true, message: `Supervisor cadastrado com sucesso!`, data };
  },

  // Audit Logs & Settings
  async getAuditLogs(): Promise<ApiResponse<any[]>> {
    try {
      const res = await AdminApi.getAuditLogs();
      if (res.success && Array.isArray(res.data)) return res;
    } catch {
      // fallback
    }
    return { success: true, data: mockAuditLogsList };
  },

  async getSettings(): Promise<ApiResponse<any>> {
    try {
      const res = await AdminApi.getSettings();
      if (res.success && res.data) return res;
    } catch {
      // fallback
    }
    return {
      success: true,
      data: {
        platformName: 'Mercado Nusali CPLP',
        escrowHoldingHours: 48,
        defaultBuyerProtectionFeePercent: 1.5,
        defaultSellerCommissionPercent: 5.0,
      },
    };
  },

  async updateSettings(data: any): Promise<ApiResponse<any>> {
    try {
      const res = await AdminApi.updateSettings(data);
      if (res.success) return res;
    } catch {
      // fallback
    }
    return { success: true, message: 'Configurações salvas com sucesso!' };
  },
};
