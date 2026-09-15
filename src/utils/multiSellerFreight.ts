/**
 * Fix (diagnóstico "R$45 -> R$60") — helper compartilhado de frete
 * multi-seller para o FRONTEND (CartView e CheckoutView).
 *
 * CAUSA CORRIGIDA: o preview de frete tratava o carrinho inteiro como se
 * fosse de 1 único vendedor — 1 chamada a ShippingService.calculateFreight
 * usando o peso/subtotal agregado de TODOS os itens e `cart[0]` como
 * referência de seller/store. O backend (orderService.createOrderFromCart,
 * caminho multi-seller) NUNCA fez isso: ele agrupa os itens por
 * `sellerId` e chama o cálculo de frete UMA VEZ POR VENDEDOR (cada child
 * order é uma entrega independente), somando os totais em
 * `purchase_groups.totalAmount` — o valor que de fato é cobrado no Asaas.
 *
 * Este helper replica no frontend EXATAMENTE a mesma regra de agrupamento
 * (por `sellerId`, com fallback para `storeId`) e a mesma soma —
 * eliminando a divergência entre o total mostrado ao comprador e o total
 * cobrado, sem alterar nenhuma linha de `orderService.ts`/
 * `paymentService.ts`/`asaasPaymentProvider.ts` (a regra financeira
 * autoritativa não muda; só o preview passa a espelhá-la).
 *
 * Para um carrinho onde todos os itens têm o mesmo `sellerId` (ou nenhum
 * item tem `sellerId`/`storeId`) isto produz EXATAMENTE 1 grupo — ou seja,
 * o comportamento de single-seller/carrinho legado fica idêntico ao de
 * antes desta correção (1 única chamada de frete).
 */
import { ShippingService } from '../services/shippingService';

export interface MultiSellerFreightCartItem {
  quantity: number;
  unitPriceOverride?: number;
  product: {
    sellerId?: string | null;
    storeId?: string;
    weightKg?: number;
    price: number;
    // Mesmo fallback que o código original (CartView/CheckoutView) já usava
    // ao montar o payload de frete — preservado aqui para não perder
    // nenhum caso já coberto antes desta correção.
    seller?: { id?: string } | null;
  };
}

function resolveSellerKey(item: MultiSellerFreightCartItem): string | undefined {
  return item.product.sellerId || item.product.seller?.id || undefined;
}

export interface AggregatedFreightQuote {
  available: boolean;
  shippingChargedToBuyer: number;
  shippingCost: number;
  shippingSellerSubsidy: number;
  estimatedMinDays: number;
  estimatedMaxDays: number;
  errorMessage?: string;
}

/**
 * Agrupa os itens do carrinho pela MESMA chave que `orderService.ts` usa
 * para separar child orders (`item.sellerId`), com fallback para
 * `storeId` e depois um único grupo implícito — nunca inventa uma
 * separação que o backend não faria.
 */
export function groupCartItemsBySeller<T extends MultiSellerFreightCartItem>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = resolveSellerKey(item) || item.product.storeId || '__no_seller__';
    const existing = groups.get(key);
    if (existing) existing.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

/**
 * Calcula o frete TOTAL do carrinho somando 1 cotação por grupo de
 * vendedor (nunca 1 cotação para o carrinho inteiro).
 *
 * Fail-closed: se QUALQUER grupo não conseguir cotação de frete, o
 * resultado inteiro vem `available:false` — nunca uma soma parcial que
 * ignore silenciosamente o grupo que falhou (isso subestimaria o total).
 */
export async function calculateMultiSellerFreight(
  items: MultiSellerFreightCartItem[],
  ctx: { originCountry: string; destinationCountry: string; currency: string }
): Promise<AggregatedFreightQuote> {
  if (items.length === 0) {
    return {
      available: true,
      shippingChargedToBuyer: 0,
      shippingCost: 0,
      shippingSellerSubsidy: 0,
      estimatedMinDays: 0,
      estimatedMaxDays: 0,
    };
  }

  const groups = Array.from(groupCartItemsBySeller(items).values());

  const results = await Promise.all(
    groups.map((groupItems) => {
      const groupWeightKg = groupItems.reduce((sum, i) => sum + (i.product.weightKg || 0) * i.quantity, 0);
      const groupSubtotal = groupItems.reduce((sum, i) => sum + (i.unitPriceOverride || i.product.price) * i.quantity, 0);
      const reference = groupItems[0];
      return ShippingService.calculateFreight({
        originCountry: ctx.originCountry,
        destinationCountry: ctx.destinationCountry,
        weightKg: groupWeightKg,
        currency: ctx.currency,
        storeId: reference.product.storeId || undefined,
        sellerId: resolveSellerKey(reference),
        productSubtotal: groupSubtotal,
      });
    })
  );

  const failed = results.find((r) => !r.success || !r.data);
  if (failed) {
    return {
      available: false,
      shippingChargedToBuyer: 0,
      shippingCost: 0,
      shippingSellerSubsidy: 0,
      estimatedMinDays: 0,
      estimatedMaxDays: 0,
      errorMessage: failed.error?.message || 'Frete indisponível para um ou mais vendedores deste carrinho.',
    };
  }

  const datas = results.map((r) => r.data!);
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    available: true,
    shippingChargedToBuyer: round2(datas.reduce((s, d) => s + d.shippingChargedToBuyer, 0)),
    shippingCost: round2(datas.reduce((s, d) => s + d.shippingCost, 0)),
    shippingSellerSubsidy: round2(datas.reduce((s, d) => s + d.shippingSellerSubsidy, 0)),
    // Entrega "completa" só quando a última das entregas independentes
    // chegar — pior caso (máximo) entre os vendedores, nunca o menor.
    estimatedMinDays: Math.max(...datas.map((d) => d.estimatedMinDays)),
    estimatedMaxDays: Math.max(...datas.map((d) => d.estimatedMaxDays)),
  };
}
