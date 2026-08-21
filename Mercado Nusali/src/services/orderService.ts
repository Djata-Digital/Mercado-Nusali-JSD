import { ApiResponse } from '../api/apiClient';
import { BuyerService } from './buyerService';
import { Order } from '../types';

export const OrderService = {
  async getOrders(): Promise<ApiResponse<Order[]>> {
    const res = await BuyerService.getOrders();
    return {
      success: res.success,
      data: (res.data as any) || [],
      message: res.message,
    };
  },

  async getOrderById(id: string): Promise<ApiResponse<Order | null>> {
    const res = await BuyerService.getOrderById(id);
    return {
      success: res.success,
      data: res.data || null,
      message: res.message,
    };
  },

  async createOrder(data: Partial<Order>): Promise<ApiResponse<Order>> {
    const res = await BuyerService.createOrder(data);
    return {
      success: res.success,
      data: res.data,
      message: res.message,
    };
  },

  async confirmOrderReceipt(id: string): Promise<ApiResponse<Order>> {
    const res = await BuyerService.confirmOrderDelivery(id);
    return {
      success: res.success,
      data: res.data,
      message: res.message,
    };
  },

  async cancelOrder(id: string): Promise<ApiResponse<Order>> {
    const res = await BuyerService.cancelOrder(id);
    return {
      success: res.success,
      data: res.data,
      message: res.message,
    };
  },

  async trackOrder(id: string): Promise<ApiResponse<any>> {
    return BuyerService.trackOrder(id);
  },

  async updateOrderStatus(id: string, status: Order['status']): Promise<ApiResponse<Order>> {
    if (status === 'delivered') {
      return this.confirmOrderReceipt(id);
    }
    if (status === 'cancelled') {
      return this.cancelOrder(id);
    }
    const orderRes = await this.getOrderById(id);
    if (orderRes.data) {
      orderRes.data.status = status;
      return { success: true, data: orderRes.data, message: `Status do pedido atualizado para ${status}` };
    }
    return { success: false, data: null as any, message: 'Pedido não encontrado' };
  }
};
