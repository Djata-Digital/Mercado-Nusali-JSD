import { ApiResponse } from '../api/apiClient';
import { ShippingApi } from '../api/clients/ShippingApi';

export interface ShippingPreviewAvailable {
  available: true;
  shippingAmount: number;
  currency: string;
  serviceCode: string;
  serviceName: string;
  fulfillmentType?: 'SELLER_LOCATION' | 'NUSALI_HUB';
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
   * fulfillment) — NUNCA o motor legado (calculateFreight abaixo, mantido
   * para CartView/CheckoutView, que ainda não migraram — D16-G0/D16-G2
   * seção 10). Nunca reserva estoque.
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
   * via F4/F3 (mesma arquitetura do getPreview acima). Substitui, para
   * esses dois consumidores, o motor legado (calculateFreight abaixo via
   * multiSellerFreight.ts) — que permanece intocado para não quebrar outros
   * chamadores ainda não migrados. Nunca reserva estoque, nunca chama F5.
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

  async calculateFreight(params: {
    originCountry: string;
    destinationCountry: string;
    weightKg: number;
    currency?: string;
    storeId?: string;
    sellerId?: string;
    productSubtotal?: number;
    originRegion?: string;
    destinationRegion?: string;
    destinationCity?: string;
    dimensionsCm?: { length: number; width: number; height: number };
  }): Promise<ApiResponse<{
    shippingCost: number;
    shippingChargedToBuyer: number;
    shippingSellerSubsidy: number;
    shippingMarketplaceSubsidy: number;
    shippingPayer: string;
    estimatedMinDays: number;
    estimatedMaxDays: number;
    rateSource: string;
    currency: string;
    available: boolean;
  }>> {
    try {
      const res = await ShippingApi.create(params);
      if (!res.success || !res.data) {
        return {
          success: false,
          error: {
            code: res.error?.code || 'SHIPPING_RATE_NOT_AVAILABLE',
            message: res.error?.message || res.message || 'Frete indisponível para este endereço.',
          },
        };
      }

      if (res.data.available !== true) {
        return {
          success: false,
          error: {
            code: 'SHIPPING_RATE_NOT_AVAILABLE',
            message: res.data.errorMessage || 'Frete indisponível para este endereço.',
          },
        };
      }

      return {
        success: true,
        data: res.data,
      };
    } catch (err: any) {
      return {
        success: false,
        error: {
          code: 'SHIPPING_CALCULATION_FAILED',
          message: err?.response?.data?.error?.message || err?.message || 'Erro ao calcular frete via API.',
        },
      };
    }
  }
};
