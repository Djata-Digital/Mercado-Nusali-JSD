/**
 * Cálculo do detalhamento financeiro exibido ao seller em SellerOrdersManager.tsx.
 *
 * Extraído para função pura (testável sem React) como parte da correção que remove
 * o fallback fictício `commissionRate = 10` usado quando `commissionRateSnapshot`
 * está ausente (pedido legado, anterior à existência desse campo).
 *
 * Regra: NUNCA inventar taxa/percentual. Se o pedido não tem `commissionRateSnapshot`,
 * a taxa é "desconhecida" — não é assumida como 10%, nem recalculada com a comissão
 * ATUAL da categoria/seller/plataforma (o pedido pode ter sido feito sob uma
 * configuração diferente da vigente hoje). O valor histórico real do pedido
 * (`marketplaceCommission`, `sellerNetAmount`), quando existir, continua sendo exibido.
 */
export interface SellerOrderFinancialInput {
  amount: number | string;
  commissionRateSnapshot?: number | string | null;
  marketplaceCommission?: number | string | null;
  shippingSellerSubsidy?: number | string | null;
  sellerNetAmount?: number | string | null;
  // Composição do frete (Fase 1 Operacional — seção 8): dados reais
  // persistidos em orders.shipping_cost/shipping_charged_to_buyer/
  // shipping_marketplace_subsidy. Nunca recalculados, sempre exibidos como
  // vieram do pedido histórico.
  shippingCost?: number | string | null;
  shippingChargedToBuyer?: number | string | null;
  shippingMarketplaceSubsidy?: number | string | null;
}

export interface SellerOrderFinancialBreakdown {
  subtotal: number;
  commissionRate: number | null;
  commissionRateLabel: string; // "10%" ou "Taxa não registrada"
  commission: number | null; // null = desconhecido, exibir "—"
  sellerSubsidy: number;
  sellerNet: number | null; // null = desconhecido, exibir "—"
  // Composição do frete — nenhum desses três participa do cálculo de
  // sellerNet além do que shippingSellerSubsidy já fazia (a subvenção da
  // Nusali NUNCA é deduzida do vendedor).
  shippingCost: number | null;
  shippingChargedToBuyer: number | null;
  shippingMarketplaceSubsidy: number;
  // true quando a Nusali absorveu parte/todo o frete operacional sem
  // repassar o custo ao vendedor (subsídio Nusali > 0 e subsídio do
  // vendedor = 0) — usado só para destacar a frase na UI, nunca para mudar valores.
  nusaliAbsorbedShipping: boolean;
}

function toNumberOrNull(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

export function computeSellerOrderFinancialBreakdown(order: SellerOrderFinancialInput): SellerOrderFinancialBreakdown {
  const subtotal = Number(order.amount) || 0;
  const commissionRate = toNumberOrNull(order.commissionRateSnapshot);
  const commissionRateLabel = commissionRate !== null ? `${commissionRate}%` : 'Taxa não registrada';

  const explicitCommission = toNumberOrNull(order.marketplaceCommission);
  let commission: number | null;
  if (explicitCommission !== null) {
    commission = explicitCommission;
  } else if (commissionRate !== null) {
    // Deriva da taxa HISTÓRICA do próprio pedido (não da configuração atual).
    commission = Math.round(subtotal * (commissionRate / 100) * 100) / 100;
  } else {
    commission = null; // nenhuma taxa nem valor registrados -> desconhecido, não inventar
  }

  const sellerSubsidy = toNumberOrNull(order.shippingSellerSubsidy) ?? 0;

  const explicitSellerNet = toNumberOrNull(order.sellerNetAmount);
  let sellerNet: number | null;
  if (explicitSellerNet !== null) {
    sellerNet = explicitSellerNet;
  } else if (commission !== null) {
    sellerNet = Math.round((subtotal - commission - sellerSubsidy) * 100) / 100;
  } else {
    sellerNet = null;
  }

  const shippingCost = toNumberOrNull(order.shippingCost);
  const shippingChargedToBuyer = toNumberOrNull(order.shippingChargedToBuyer);
  const shippingMarketplaceSubsidy = toNumberOrNull(order.shippingMarketplaceSubsidy) ?? 0;
  const nusaliAbsorbedShipping = shippingMarketplaceSubsidy > 0 && sellerSubsidy === 0;

  return {
    subtotal,
    commissionRate,
    commissionRateLabel,
    commission,
    sellerSubsidy,
    sellerNet,
    shippingCost,
    shippingChargedToBuyer,
    shippingMarketplaceSubsidy,
    nusaliAbsorbedShipping,
  };
}
