import { ApiResponse } from '../api/apiClient';
import { ShippingApi } from '../api/clients/ShippingApi';

export interface ShippingPreviewAvailable {
  available: true;
  // FASE D18-C2.10 — shippingAmount é o custo logístico REAL, nunca zerado
  // por uma política de frete grátis do seller. shippingChargedToBuyer é o
  // valor pós-política, o que a UI deve exibir como "Frete" ao comprador.
  shippingAmount: number;
  currency: string;
  serviceCode: string;
  serviceName: string;
  fulfillmentType?: 'SELLER_LOCATION' | 'NUSALI_HUB';
  shippingChargedToBuyer: number;
  shippingSellerSubsidy: number;
  shippingMarketplaceSubsidy: number;
  shippingPayer: 'buyer' | 'seller' | 'marketplace' | 'shared';
  policyMode: string;
}
export interface ShippingPreviewUnavailable {
  available: false;
  code: string;
  message: string;
}
export type ShippingPreviewData = ShippingPreviewAvailable | ShippingPreviewUnavailable;

// FASE D16-G3 — preview AGREGADO de carrinho/checkout (F3/F4, sem F5).
export interface CartShippingPreviewSellerBreakdown {
  sellerId: string;
  storeId: string | null;
  shippingAmount: number;
  currency: string;
}
export interface CartShippingPreviewAvailable {
  available: true;
  shippingChargedToBuyer: number;
  shippingCost: number;
  shippingSellerSubsidy: number;
  currency: string;
  sellers: CartShippingPreviewSellerBreakdown[];
}
export interface CartShippingPreviewUnavailable {
  available: false;
  code: string;
  message: string;
}
export type CartShippingPreviewData = CartShippingPreviewAvailable | CartShippingPreviewUnavailable;

export const ShippingService = {
  async getShipments(): Promise<ApiResponse<any[]>> {
    return ShippingApi.list();
  },

  /**
   * FASE D16-G2 — preview de entrega READ-ONLY via F4/F3 (smart
   * fulfillment). Nunca reserva estoque.
   */
  async getPreview(params: {
    productId: string;
    variantId?: string | null;
    quantity: number;
    destinationShippingSectorId?: string | null;
  }): Promise<ApiResponse<ShippingPreviewData>> {
    try {
      const res = await ShippingApi.preview(params);
      if (!res.success || !res.data) {
        return {
          success: false,
          error: {
            code: res.error?.code || 'SHIPPING_PREVIEW_FAILED',
            message: res.error?.message || res.message || 'Não foi possível calcular a entrega.',
          },
        };
      }
      return { success: true, data: res.data };
    } catch (err: any) {
      return {
        success: false,
        error: {
          code: 'SHIPPING_PREVIEW_FAILED',
          message: err?.response?.data?.error?.message || err?.message || 'Erro ao calcular o preview de entrega.',
        },
      };
    }
  },

  /**
   * FASE D16-G3 — preview AGREGADO de frete para CartView/CheckoutView,
   * via F4/F3 (mesma arquitetura do getPreview acima). Nunca reserva
   * estoque, nunca chama F5.
   */
  async getCartPreview(payload: {
    destinationShippingSectorId?: string | null;
    items: Array<{ productId: string; variantId?: string | null; quantity: number }>;
  }): Promise<ApiResponse<CartShippingPreviewData>> {
    try {
      const res = await ShippingApi.previewCart(payload);
      if (!res.success || !res.data) {
        return {
          success: false,
          error: {
            code: res.error?.code || 'SHIPPING_PREVIEW_FAILED',
            message: res.error?.message || res.message || 'Não foi possível calcular o frete do carrinho.',
          },
        };
      }
      return { success: true, data: res.data };
    } catch (err: any) {
      return {
        success: false,
        error: {
          code: 'SHIPPING_PREVIEW_FAILED',
          message: err?.response?.data?.error?.message || err?.message || 'Erro ao calcular o preview de entrega do carrinho.',
        },
      };
    }
  },

  // FASE D16-I4 — calculateFreight() (motor legado) removido: zero
  // consumidor runtime real (auditoria D16-I1) — só era chamado por
  // src/utils/multiSellerFreight.ts, um módulo sem nenhum importador,
  // removido junto nesta mesma fase.
};
