import { getDb } from '../../../db/index.js';
import { storeShippingPolicies, sellers, stores, platformSettings } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';

// FASE D16-I5 — VOLUMETRIC_DIVISOR_SETTING_KEY/getVolumetricDivisor/
// computeBillableWeightKg (peso volumétrico) removidos: existiam
// exclusivamente para o motor legado calculateFreight/getRawShippingRate
// (também removidos nesta fase, comprovadamente sem consumidor runtime —
// auditoria D16-I1/D16-I4/D16-I5). Nenhum outro módulo os chamava (F4/
// fulfillmentCandidateResolverService.ts resolve peso por si só).
const DEFAULT_SHIPPING_POLICY_SETTING_KEY = 'defaultShippingPolicyMode';

async function getDefaultShippingPolicyMode(executor?: any): Promise<string | null> {
  const db = executor ?? getDb();
  if (!db) return null;
  try {
    const rows = await db.select().from(platformSettings).where(eq(platformSettings.key, DEFAULT_SHIPPING_POLICY_SETTING_KEY)).limit(1);
    if (rows.length === 0) return null;
    const mode = String(rows[0].valueJson || '').trim();
    return mode || null;
  } catch {
    return null;
  }
}

// FASE D16-I5 — CalculateFreightInput/FreightCalculationResult removidas:
// eram exclusivamente a assinatura de calculateFreight/getRawShippingRate
// (motor legado, removido nesta fase).

export interface ShippingPayerPolicyResult {
  shippingChargedToBuyer: number;
  shippingSellerSubsidy: number;
  shippingMarketplaceSubsidy: number;
  shippingPayer: 'buyer' | 'seller' | 'marketplace' | 'shared';
  policyMode: string;
}

/**
 * FASE D16-F6.2 — extraído de calculateFreight (comportamento IDÊNTICO,
 * nenhuma regra de negócio alterada) para separar explicitamente RATE SOURCE
 * (de onde vem `shippingCost` — motor legado país/zona aqui, soma de
 * cotações F3 por origem real no fluxo de smart fulfillment) de PAYER POLICY
 * (quem paga: storeShippingPolicies por loja/seller, senão
 * platformSettings.defaultShippingPolicyMode, senão CUSTOMER_PAYS como rede
 * de segurança final) — a mesma política, para os dois fluxos, nunca uma
 * segunda regra de negócio divergente.
 */
export async function resolveShippingPayerPolicy(
  shippingCost: number,
  input: { storeId?: string | null; sellerId?: string | null },
  executor?: any
): Promise<ShippingPayerPolicyResult> {
  let policyMode: string | null = null;
  let sellerSubsidyMaxAmount = 0;
  let sellerSubsidyPercent = 0;
  let marketplaceSubsidyMaxAmount = 0;
  let marketplaceSubsidyPercent = 0;

  // Fetch store policy if storeId or sellerId supplied
  const db = executor ?? getDb();
  if (db && (input.storeId || input.sellerId)) {
    try {
      let policyRows = [];
      if (input.storeId) {
        policyRows = await db.select().from(storeShippingPolicies).where(eq(storeShippingPolicies.storeId, input.storeId)).limit(1);
      }
      if (policyRows.length === 0 && input.sellerId) {
        policyRows = await db.select().from(storeShippingPolicies).where(eq(storeShippingPolicies.sellerId, input.sellerId)).limit(1);
      }
      if (policyRows.length > 0 && policyRows[0].isActive) {
        const pol = policyRows[0];
        policyMode = pol.mode || null;
        sellerSubsidyMaxAmount = pol.sellerSubsidyMaxAmount ? Number(pol.sellerSubsidyMaxAmount) : 0;
        sellerSubsidyPercent = pol.sellerSubsidyPercent ? Number(pol.sellerSubsidyPercent) : 0;
        marketplaceSubsidyMaxAmount = (pol as any).marketplaceSubsidyMaxAmount ? Number((pol as any).marketplaceSubsidyMaxAmount) : 0;
        marketplaceSubsidyPercent = (pol as any).marketplaceSubsidyPercent ? Number((pol as any).marketplaceSubsidyPercent) : 0;
      }
    } catch (err) {
      console.error('Error reading store shipping policy:', err);
    }
  }

  // Sem política específica da loja: cai para a política GLOBAL configurável
  // (platformSettings.defaultShippingPolicyMode, admin via POST
  // /admin/settings) — nunca um modo de negócio hardcoded no código. Só se
  // NADA estiver configurado em lugar nenhum é que o comportamento mais
  // conservador (CUSTOMER_PAYS — cobra o custo real do comprador) entra
  // como rede de segurança final.
  if (!policyMode) {
    policyMode = await getDefaultShippingPolicyMode(executor);
  }
  if (!policyMode) {
    policyMode = 'CUSTOMER_PAYS';
  }

  let shippingChargedToBuyer = shippingCost;
  let shippingSellerSubsidy = 0;
  let shippingMarketplaceSubsidy = 0;
  let shippingPayer: 'buyer' | 'seller' | 'marketplace' | 'shared' = 'buyer';

  if (policyMode === 'SELLER_FREE_SHIPPING') {
    shippingChargedToBuyer = 0;
    shippingSellerSubsidy = shippingCost;
    shippingPayer = 'seller';
  } else if (policyMode === 'SELLER_SUBSIDIZED') {
    let subsidy = 0;
    // Requirement 7: Max amount OR percent (not both simultaneously)
    if (sellerSubsidyMaxAmount > 0) {
      subsidy = Math.min(shippingCost, sellerSubsidyMaxAmount);
    } else if (sellerSubsidyPercent > 0) {
      subsidy = Math.round((shippingCost * (sellerSubsidyPercent / 100)) * 100) / 100;
    }
    shippingSellerSubsidy = subsidy;
    shippingChargedToBuyer = Math.max(0, Math.round((shippingCost - subsidy) * 100) / 100);
    shippingPayer = shippingChargedToBuyer > 0 ? 'shared' : 'seller';
  } else if (policyMode === 'MARKETPLACE_FREE_SHIPPING') {
    // Correção pós-relatório: MARKETPLACE_FREE_SHIPPING é uma política de
    // "frete grátis para o comprador" — shippingChargedToBuyer é GARANTIDO
    // zero enquanto essa política estiver ativa (nunca surpreende o buyer
    // no checkout). O teto de subsídio da Nusali protege a NUSALI, não o
    // buyer: o que exceder o teto configurado é transferido para o SELLER
    // (ele já vende sabendo que a loja está no programa de frete grátis
    // custeado em conjunto com o marketplace), nunca para o comprador.
    // Sem teto configurado, a Nusali absorve o custo real integralmente
    // (comportamento anterior, inalterado).
    shippingChargedToBuyer = 0;
    let marketplaceCap = Infinity;
    if (marketplaceSubsidyMaxAmount > 0) {
      marketplaceCap = marketplaceSubsidyMaxAmount;
    } else if (marketplaceSubsidyPercent > 0) {
      marketplaceCap = Math.round((shippingCost * (marketplaceSubsidyPercent / 100)) * 100) / 100;
    }
    const marketplaceAbsorbed = Math.min(shippingCost, marketplaceCap);
    shippingMarketplaceSubsidy = marketplaceAbsorbed;
    shippingSellerSubsidy = Math.max(0, Math.round((shippingCost - marketplaceAbsorbed) * 100) / 100);
    shippingPayer = shippingSellerSubsidy > 0 ? 'shared' : 'marketplace';
  } else {
    // CUSTOMER_PAYS
    shippingChargedToBuyer = shippingCost;
    shippingSellerSubsidy = 0;
    shippingMarketplaceSubsidy = 0;
    shippingPayer = 'buyer';
  }

  return { shippingChargedToBuyer, shippingSellerSubsidy, shippingMarketplaceSubsidy, shippingPayer, policyMode };
}

export class ShippingCalculatorService {
  // FASE D16-I5 — getRawShippingRate/calculateFreight removidos: motor
  // legado de frete (shipping_rates/shipping_zones), comprovadamente sem
  // consumidor runtime (auditoria D16-I1, runtime público eliminado em
  // D16-I4, este último caminho interno — a chamada de orderService.ts —
  // eliminado nesta fase). resolveShippingPayerPolicy() e
  // calculateOrderFinancials() abaixo permanecem: usados pelo pipeline
  // smart de fulfillment (F3/F4/F5).

  /**
   * Complete Financial Breakdown Calculator for Orders
   */
  static calculateOrderFinancials(params: {
    productSubtotal: number;
    shippingCost: number;
    shippingChargedToBuyer: number;
    shippingSellerSubsidy: number;
    shippingMarketplaceSubsidy: number;
    commissionRatePercent: number;
    // Fase "Comissão percentual + logística real": quando a comissão é
    // calculada por item (categoria pode divergir do seller.commissionRate
    // item a item), o valor exato já vem somado — evita reconstituir por uma
    // taxa média e arredondar de novo, o que poderia divergir em centavos.
    // Se ausente, cai no cálculo por taxa única (comportamento anterior).
    precomputedCommissionAmount?: number;
    customsDuty?: number;
    buyerDiscounts?: number;
  }) {
    const productSubtotal = params.productSubtotal;
    const commissionBase = productSubtotal;
    const marketplaceCommission = params.precomputedCommissionAmount !== undefined
      ? Math.round(params.precomputedCommissionAmount * 100) / 100
      : Math.round((commissionBase * (params.commissionRatePercent / 100)) * 100) / 100;
    // commissionRateSnapshot é sempre a taxa EFETIVA real (derivada do valor
    // realmente cobrado), nunca inventada — igual à taxa única quando não há
    // comissão pré-computada por item.
    const commissionRateSnapshot = commissionBase > 0
      ? Math.round((marketplaceCommission / commissionBase) * 10000) / 100
      : params.commissionRatePercent;

    const sellerNetAmount = Math.round((productSubtotal - marketplaceCommission - params.shippingSellerSubsidy) * 100) / 100;
    const customsDuty = params.customsDuty || 0;
    const buyerDiscounts = params.buyerDiscounts || 0;
    const buyerPaidTotal = Math.round((productSubtotal + params.shippingChargedToBuyer + customsDuty - buyerDiscounts) * 100) / 100;

    return {
      productSubtotal,
      shippingCost: params.shippingCost,
      shippingChargedToBuyer: params.shippingChargedToBuyer,
      shippingSellerSubsidy: params.shippingSellerSubsidy,
      shippingMarketplaceSubsidy: params.shippingMarketplaceSubsidy,
      commissionRateSnapshot,
      commissionBase,
      marketplaceCommission,
      sellerNetAmount,
      customsDuty,
      buyerPaidTotal,
    };
  }
}
