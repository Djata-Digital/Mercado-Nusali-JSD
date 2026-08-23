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
  marketplaceCommission: string | null;
  sellerNetAmount: string | null;
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

  const discountMicros = order.discountAmount ? toMicros(order.discountAmount) : 0n;
  if (discountMicros !== 0n) {
    return { status: 'SKIPPED', reason: 'DISCOUNT_NOT_SUPPORTED_YET', detail: `discountAmount=${order.discountAmount}` };
  }

  const shippingChargedToBuyerMicros = order.shippingChargedToBuyer ? toMicros(order.shippingChargedToBuyer) : 0n;
  const shippingSellerSubsidyMicros = order.shippingSellerSubsidy ? toMicros(order.shippingSellerSubsidy) : 0n;
  const shippingMarketplaceSubsidyMicros = order.shippingMarketplaceSubsidy ? toMicros(order.shippingMarketplaceSubsidy) : 0n;
  const customsDutyMicros = order.customsDuty ? toMicros(order.customsDuty) : 0n;

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
      accountCode: 'NUSALI_COMMISSION_REVENUE',
      ownerType: 'PLATFORM',
      ownerId: null,
      direction: 'CREDIT',
      amount: marketplaceCommission,
      currency,
      dimensions: { component: 'COMMISSION' },
      ...common,
    },
    {
      accountCode: 'SELLER_PAYABLE',
      ownerType: 'SELLER',
      ownerId: sellerId,
      direction: 'CREDIT',
      amount: sellerNetAmount,
      currency,
      dimensions: { component: 'PRODUCT' },
      ...common,
    },
  ];

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
