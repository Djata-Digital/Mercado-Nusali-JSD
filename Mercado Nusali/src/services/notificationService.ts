import { ApiResponse } from '../api/apiClient';
import { BuyerService } from './buyerService';
import { AppNotification } from '../types';

export const NotificationService = {
  async getNotifications(): Promise<ApiResponse<AppNotification[]>> {
    const res = await BuyerService.getNotifications();
    return {
      success: res.success,
      data: (res.data as any) || [],
      message: res.message,
    };
  },

  async markAsRead(id: string): Promise<ApiResponse<any>> {
    return BuyerService.markNotificationRead(id);
  },

  async markAllAsRead(): Promise<ApiResponse<any>> {
    return BuyerService.markAllNotificationsRead();
  },

  async clearAll(): Promise<ApiResponse<any>> {
    return BuyerService.clearNotifications();
  }
};
