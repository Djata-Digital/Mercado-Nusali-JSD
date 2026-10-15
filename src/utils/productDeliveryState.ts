/**
 * Estado da PRÉVIA de entrega da página do produto (PURO). Usa a MESMA cotação por serviço do carrinho e do checkout (POST /shipping/preview-cart,
 * motor de frete por setor) — nunca uma segunda regra de preço. É só uma prévia: a escolha do serviço continua no checkout e o servidor revalida o
 * preço ao criar o pedido. Nada é inventado: sem cotação válida a página diz "Frete a calcular" ou "Entrega indisponível", nunca "GRÁTIS".
 */
import type { CartShippingServiceOption, CartShippingPreviewData } from '../services/shippingService';

export type ProductDeliveryStatus = 'idle' | 'loading' | 'needs_variant' | 'needs_address' | 'ready' | 'unavailable' | 'to_calculate';

export interface ProductDeliveryState {
  status: ProductDeliveryStatus;
  options: CartShippingServiceOption[];
  code?: string;
  message?: string;
}

export const PRODUCT_DELIVERY_IDLE: ProductDeliveryState = { status: 'idle', options: [] };

/** Resposta da cotação (ShippingService.getCartPreview) → estado da prévia. */
export function deliveryStateFromQuote(res: { success: boolean; data?: CartShippingPreviewData; error?: { code?: string; message?: string } } | null | undefined): ProductDeliveryState {
  if (!res || !res.success || !res.data) {
    // falha de rede/servidor: não sabemos o frete — "a calcular", nunca grátis nem indisponível definitivo
    return { status: 'to_calculate', options: [], code: res?.error?.code, message: res?.error?.message || 'Não foi possível calcular o frete agora. Tente novamente em instantes.' };
  }
  const data = res.data as any;
  const options: CartShippingServiceOption[] = Array.isArray(data.services) ? data.services : [];
  if (data.available === true && options.some((o) => o.available)) return { status: 'ready', options };
  if (data.code === 'DELIVERY_SECTOR_REQUIRED') return { status: 'needs_address', options: [], code: data.code, message: data.message };
  return { status: 'unavailable', options, code: data.code, message: data.message };
}

/** Título curto do estado. */
export function deliveryHeadline(state: ProductDeliveryState): string {
  switch (state.status) {
    case 'loading': return 'Calculando entrega...';
    case 'ready': return 'Opções de entrega';
    case 'unavailable': return 'Entrega indisponível';
    default: return 'Frete a calcular';
  }
}

/** A compra imediata só é bloqueada quando a entrega está DEFINITIVAMENTE indisponível (sem rota, tarifa ou estoque) — nunca por falta de endereço/variação. */
export function deliveryBlocksPurchase(state: ProductDeliveryState): boolean {
  return state.status === 'unavailable';
}
