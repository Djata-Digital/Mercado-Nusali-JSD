/**
 * Construção pura dos lançamentos de ORDER_DELIVERY_CONFIRMED a partir de um
 * snapshot de pedido já gravado — sem tocar banco, sem I/O. Separado de
 * financialLedgerService.ts especificamente para ser testável sem depender das
 * tabelas do ledger existirem (Fase 5A, seção 19: testes que não movimentam
 * dinheiro real).
 */
import { netBalanceByCurrency, toMicros } from './decimal.js';
import type { LedgerOwnerType, LedgerAccountCode } from './accounts.js';
import type { LedgerSkipReason } from './types.js';

export interface DraftEntry {
  accountCode: LedgerAccountCode;
  ownerType: LedgerOwnerType;
  ownerId: string | null;
  direction: 'DEBIT' | 'CREDIT';
  amount: string;
  currency: string;
  dimensions?: Record<string, unknown> | null;
  orderId?: string | null;
  sellerId?: string | null;
  storeId?: string | null;
  buyerId?: string | null;
  countryCode?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
}

export interface OrderSnapshotForDelivery {
  id: string;
  buyerId: string;
  sellerId: string | null;
  storeId: string | null;
  countryCode: string | null;
  currency: string;
  totalAmount: string;
  /** subtotal BRUTO dos produtos (antes do cupom). Opcional: quando presente, reforça a prova de integridade do snapshot. */
  subtotal?: string | null;
  /** base sobre a qual a comissão foi cobrada (subtotal − cupom do vendedor). Opcional, só para a prova de integridade e para o registo. */
  commissionBase?: string | null;
  marketplaceCommission: string | null;
  sellerNetAmount: string | null;
  /** desconto de CUPOM DO VENDEDOR já aplicado no pedido (financiado pelo vendedor). 0/null = sem cupom. */
  discountAmount: string | null;
  shippingChargedToBuyer: string | null;
  shippingSellerSubsidy: string | null;
  shippingMarketplaceSubsidy: string | null;
  customsDuty: string | null;
}

// Discriminante em string ('OK'/'SKIPPED'), não boolean: narrowing de union por
// negação/else de um discriminante boolean (`ok: true|false`) não se comportou de
// forma confiável neste toolchain (confirmado em isolamento fora deste arquivo) —
// string literal narrowing é o padrão testado e funcionando.
export type BuildResult = { status: 'OK'; entries: DraftEntry[] } | { status: 'SKIPPED'; reason: LedgerSkipReason; detail?: string };

export function buildDeliveryConfirmedEntries(order: OrderSnapshotForDelivery): BuildResult {
  const { currency, marketplaceCommission, sellerNetAmount, sellerId, totalAmount } = order;

  if (!currency || marketplaceCommission == null || sellerNetAmount == null || !sellerId || !totalAmount) {
    return {
      status: 'SKIPPED',
      reason: 'MISSING_SNAPSHOT',
      detail: 'marketplaceCommission/sellerNetAmount/sellerId/totalAmount ausente.',
    };
  }

  const commissionMicros = toMicros(marketplaceCommission);
  const sellerNetMicros = toMicros(sellerNetAmount);
  if (commissionMicros < 0n || sellerNetMicros <= 0n) {
    return { status: 'SKIPPED', reason: 'INVALID_SNAPSHOT', detail: `marketplaceCommission=${marketplaceCommission} sellerNetAmount=${sellerNetAmount}` };
  }

  // CUPOM DO VENDEDOR (E1). O desconto já está refletido nos valores gravados no pedido: totalAmount = (subtotal − desconto) + frete do cliente;
  // a comissão foi cobrada sobre a base já descontada e sellerNetAmount = base − comissão − parcela de frete do vendedor. O dinheiro que entrou
  // (totalAmount) NUNCA inclui o desconto, portanto não existe conta nem linha de caixa para ele — o desconto é só registado em `dimensions`.
  // Cupom financiado pela Nusali NÃO existe no sistema (tabela coupons sem financiador) e continua fora de escopo.
  const discountMicros = order.discountAmount ? toMicros(order.discountAmount) : 0n;
  if (discountMicros < 0n) {
    return { status: 'SKIPPED', reason: 'INVALID_SNAPSHOT', detail: `discountAmount negativo (${order.discountAmount})` };
  }
  const hasCoupon = discountMicros > 0n;

  const shippingChargedToBuyerMicros = order.shippingChargedToBuyer ? toMicros(order.shippingChargedToBuyer) : 0n;
  const shippingSellerSubsidyMicros = order.shippingSellerSubsidy ? toMicros(order.shippingSellerSubsidy) : 0n;
  const shippingMarketplaceSubsidyMicros = order.shippingMarketplaceSubsidy ? toMicros(order.shippingMarketplaceSubsidy) : 0n;
  const customsDutyMicros = order.customsDuty ? toMicros(order.customsDuty) : 0n;

  // Prova de integridade do snapshot (só quando os campos existem): a comissão e o líquido têm de fechar com a base descontada, e o total pago com
  // (subtotal − desconto) + frete do cliente + taxas. Qualquer divergência é um snapshot inválido — nunca se recalcula com a regra vigente.
  if (order.subtotal != null && order.subtotal !== '') {
    const subtotalMicros = toMicros(order.subtotal);
    if (discountMicros > subtotalMicros) {
      return { status: 'SKIPPED', reason: 'INVALID_SNAPSHOT', detail: `discountAmount (${order.discountAmount}) maior que subtotal (${order.subtotal})` };
    }
    const baseMicros = subtotalMicros - discountMicros;
    if (order.commissionBase != null && order.commissionBase !== '' && toMicros(order.commissionBase) !== baseMicros) {
      return { status: 'SKIPPED', reason: 'INVALID_SNAPSHOT', detail: `commissionBase (${order.commissionBase}) != subtotal − desconto` };
    }
    if (commissionMicros + sellerNetMicros + shippingSellerSubsidyMicros !== baseMicros) {
      return { status: 'SKIPPED', reason: 'INVALID_SNAPSHOT', detail: 'comissão + líquido + frete do vendedor não fecham com a base descontada.' };
    }
    if (toMicros(totalAmount) !== baseMicros + shippingChargedToBuyerMicros + customsDutyMicros) {
      return { status: 'SKIPPED', reason: 'INVALID_SNAPSHOT', detail: 'totalAmount != (subtotal − desconto) + frete do cliente + taxas.' };
    }
  }

  const common = {
    orderId: order.id,
    sellerId,
    storeId: order.storeId ?? null,
    countryCode: order.countryCode ?? null,
    referenceType: 'order' as const,
    referenceId: order.id,
  };

  const entries: DraftEntry[] = [
    {
      accountCode: 'BUYER_ESCROW',
      ownerType: 'PLATFORM',
      ownerId: null,
      direction: 'DEBIT',
      amount: totalAmount,
      currency,
      dimensions: { component: 'RELEASE' },
      buyerId: order.buyerId,
      ...common,
    },
    {
      accountCode: 'SELLER_PAYABLE',
      ownerType: 'SELLER',
      ownerId: sellerId,
      direction: 'CREDIT',
      amount: sellerNetAmount,
      currency,
      dimensions: hasCoupon
        ? { component: 'PRODUCT', sellerCouponDiscount: order.discountAmount, discountFundedBy: 'SELLER' }
        : { component: 'PRODUCT' },
      ...common,
    },
  ];

  // Comissão 0% (categoria/vendedor sem comissão) é legítima: não existe linha de valor zero no ledger (o amount tem de ser > 0). A transação continua a
  // fechar sozinha (escrow = líquido + frete + ...). Antes da E1 este caso lançava erro e o pedido nunca entrava no ledger.
  if (commissionMicros > 0n) {
    entries.push(
    {
      accountCode: 'NUSALI_COMMISSION_REVENUE',
      ownerType: 'PLATFORM',
      ownerId: null,
      direction: 'CREDIT',
      amount: marketplaceCommission,
      currency,
      dimensions: hasCoupon
        ? { component: 'COMMISSION', commissionBase: order.commissionBase ?? null, sellerCouponDiscount: order.discountAmount, discountFundedBy: 'SELLER' }
        : { component: 'COMMISSION' },
      ...common,
    }
    );
  }
  if (shippingChargedToBuyerMicros > 0n) {
    entries.push({
      accountCode: 'SHIPPING_PAYABLE',
      ownerType: 'PLATFORM',
      ownerId: null,
      direction: 'CREDIT',
      amount: order.shippingChargedToBuyer!,
      currency,
      dimensions: { component: 'SHIPPING', subsidySource: 'NONE' },
      ...common,
    });
  }
  if (shippingSellerSubsidyMicros > 0n) {
    entries.push({
      accountCode: 'SHIPPING_PAYABLE',
      ownerType: 'PLATFORM',
      ownerId: null,
      direction: 'CREDIT',
      amount: order.shippingSellerSubsidy!,
      currency,
      dimensions: { component: 'SHIPPING', subsidySource: 'SELLER' },
      ...common,
    });
  }
  if (shippingMarketplaceSubsidyMicros > 0n) {
    entries.push(
      {
        accountCode: 'SHIPPING_SUBSIDY_NUSALI',
        ownerType: 'PLATFORM',
        ownerId: null,
        direction: 'DEBIT',
        amount: order.shippingMarketplaceSubsidy!,
        currency,
        dimensions: { component: 'SHIPPING', subsidySource: 'NUSALI' },
        ...common,
      },
      {
        accountCode: 'SHIPPING_PAYABLE',
        ownerType: 'PLATFORM',
        ownerId: null,
        direction: 'CREDIT',
        amount: order.shippingMarketplaceSubsidy!,
        currency,
        dimensions: { component: 'SHIPPING', subsidySource: 'NUSALI' },
        ...common,
      }
    );
  }
  if (customsDutyMicros > 0n) {
    entries.push({
      accountCode: 'TAX_PAYABLE',
      ownerType: 'PLATFORM',
      ownerId: null,
      direction: 'CREDIT',
      amount: order.customsDuty!,
      currency,
      dimensions: { component: 'TAX' },
      ...common,
    });
  }

  const net = netBalanceByCurrency(entries);
  if (net.size !== 1 || net.get(currency) !== 0n) {
    return { status: 'SKIPPED', reason: 'INVALID_SNAPSHOT', detail: 'Decomposição não fecha com orders.totalAmount.' };
  }

  return { status: 'OK', entries };
}
