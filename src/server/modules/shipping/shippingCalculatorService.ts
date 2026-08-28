import { getDb } from '../../../db/index.js';
import { shippingRates, shippingZones, storeShippingPolicies, sellers, stores, platformSettings } from '../../../db/schema.js';
import { eq, and, lte, gte } from 'drizzle-orm';

/**
 * Fase "Comissão percentual + logística real" — peso volumétrico.
 *
 * Não existia nenhum modelo de peso volumétrico antes desta fase (confirmado
 * por auditoria: nenhuma referência a "volumetric"/"cubagem" no código).
 * Fórmula padrão do setor (mesma usada por Correios/transportadoras):
 *
 *   volumetricWeightKg = (lengthCm × widthCm × heightCm) / divisor
 *   billableWeightKg   = max(actualWeightKg, volumetricWeightKg)
 *
 * O divisor é configurável via platformSettings (chave abaixo), nunca
 * hardcoded. Se não estiver configurado, o peso volumétrico simplesmente não
 * é calculado — billableWeight cai para o peso real, sem inventar divisor.
 */
const VOLUMETRIC_DIVISOR_SETTING_KEY = 'shippingVolumetricDivisor';
const DEFAULT_SHIPPING_POLICY_SETTING_KEY = 'defaultShippingPolicyMode';

export async function getVolumetricDivisor(executor?: any): Promise<number | null> {
  const db = executor ?? getDb();
  if (!db) return null;
  try {
    const rows = await db.select().from(platformSettings).where(eq(platformSettings.key, VOLUMETRIC_DIVISOR_SETTING_KEY)).limit(1);
    if (rows.length === 0) return null;
    const parsed = Number(rows[0].valueJson);
    return !isNaN(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function computeBillableWeightKg(
  actualWeightKg: number,
  dimensionsCm: { length: number; width: number; height: number } | undefined,
  volumetricDivisor: number | null
): { billableWeightKg: number; volumetricWeightKg: number | null } {
  if (!dimensionsCm || !volumetricDivisor) {
    return { billableWeightKg: actualWeightKg, volumetricWeightKg: null };
  }
  const { length, width, height } = dimensionsCm;
  if (!length || !width || !height || length <= 0 || width <= 0 || height <= 0) {
    return { billableWeightKg: actualWeightKg, volumetricWeightKg: null };
  }
  const volumetricWeightKg = Math.round(((length * width * height) / volumetricDivisor) * 1000) / 1000;
  return { billableWeightKg: Math.max(actualWeightKg, volumetricWeightKg), volumetricWeightKg };
}

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

export interface CalculateFreightInput {
  storeId?: string;
  sellerId?: string;
  originCountry: string;
  destinationCountry: string;
  originRegion?: string;
  destinationRegion?: string;
  destinationCity?: string;
  weightKg: number;
  dimensionsCm?: { length: number; width: number; height: number };
  currency?: string;
  productSubtotal: number;
}

export interface FreightCalculationResult {
  shippingCost: number;
  shippingChargedToBuyer: number;
  shippingSellerSubsidy: number;
  shippingMarketplaceSubsidy: number;
  shippingPayer: 'buyer' | 'seller' | 'marketplace' | 'shared';
  policyMode: string;
  estimatedMinDays: number;
  estimatedMaxDays: number;
  rateSource: string;
  rateId?: string;
  currency: string;
  available: boolean;
  billableWeightKg?: number;
  volumetricWeightKg?: number | null;
  errorMessage?: string;
}

export class ShippingCalculatorService {
  /**
   * Calculates raw shipping rate strictly from PostgreSQL shipping_rates table.
   * Returns null if no active rate exists for origin, destination, and weight range.
   */
  /**
   * Calculates raw shipping rate strictly from PostgreSQL shipping_rates table.
   * Prioritizes City Specific > Region Specific > Generic Country Match.
   * Returns null if no active rate exists for origin, destination, weight range, and currency.
   */
  static async getRawShippingRate(input: {
    originCountry: string;
    destinationCountry: string;
    originRegion?: string;
    destinationRegion?: string;
    destinationCity?: string;
    weightKg: number;
    currency: string;
  }, executor?: any): Promise<{ price: number; estimatedMinDays: number; estimatedMaxDays: number; rateId: string; source: string; currency: string } | null> {
    const db = executor ?? getDb();
    if (!db) return null;

    if (!input.originCountry || !input.originCountry.trim()) return null;
    if (!input.destinationCountry || !input.destinationCountry.trim()) return null;
    if (!input.currency || !input.currency.trim()) return null;
    if (!input.weightKg || Number(input.weightKg) <= 0) return null;

    const origin = input.originCountry.trim().toUpperCase();
    const destination = input.destinationCountry.trim().toUpperCase();
    const weight = Number(input.weightKg);
    const targetCurrency = input.currency.trim().toUpperCase();
    const destCity = (input.destinationCity || '').trim().toLowerCase();
    const destRegion = (input.destinationRegion || '').trim().toUpperCase();
    const origRegion = (input.originRegion || '').trim().toUpperCase();

    try {
      const conditions = [
        eq(shippingRates.originCountry, origin),
        eq(shippingRates.destinationCountry, destination),
        eq(shippingRates.currency, targetCurrency),
        eq(shippingRates.isActive, true),
        lte(shippingRates.minWeightKg, String(weight)),
        gte(shippingRates.maxWeightKg, String(weight)),
      ];

      const rates = await db
        .select()
        .from(shippingRates)
        .where(and(...conditions));

      if (rates.length === 0) return null;

      // Requirement 5 & 6: City Specific > Region Specific > Generic Country Match
      const zoneIds = rates.map((r) => r.zoneId).filter((id): id is string => Boolean(id));
      let zonesMap = new Map<string, any>();

      if (zoneIds.length > 0) {
        const zoneRows = await db
          .select()
          .from(shippingZones)
          .where(and(eq(shippingZones.isActive, true)));
        zonesMap = new Map(zoneRows.map((z) => [z.id, z]));
      }

      const scoredRates = rates.map((r) => {
        let score = 10; // Generic country-to-country base score
        const z = r.zoneId ? zonesMap.get(r.zoneId) : null;

        if (z) {
          if (destCity && z.city && z.city.trim().toLowerCase() === destCity) {
            score = 100; // Exact city match via zone
          } else if (destRegion && z.regionCode && z.regionCode.trim().toUpperCase() === destRegion) {
            score = 50; // Exact region match via zone
          }
        } else {
          if (destCity && r.destinationRegion && r.destinationRegion.trim().toLowerCase() === destCity) {
            score = 90; // Direct city match
          } else if (destRegion && r.destinationRegion && r.destinationRegion.trim().toUpperCase() === destRegion) {
            score = 40; // Direct region match
          }
        }

        if (origRegion && r.originRegion && r.originRegion.trim().toUpperCase() === origRegion) {
          score += 5;
        }

        return { rate: r, score };
      });

      scoredRates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        // Secondary sort: narrower minWeight (more specific tier)
        const wDiff = (Number(b.rate.minWeightKg) || 0) - (Number(a.rate.minWeightKg) || 0);
        if (wDiff !== 0) return wDiff;
        // Tertiary sort: lowest price
        return (Number(a.rate.price) || 0) - (Number(b.rate.price) || 0);
      });

      const best = scoredRates[0].rate;
      return {
        price: Number(best.price),
        estimatedMinDays: best.estimatedMinDays,
        estimatedMaxDays: best.estimatedMaxDays,
        rateId: best.id,
        source: scoredRates[0].score >= 40 ? 'ZONE_SPECIFIC' : 'INTERNAL_ZONE',
        currency: best.currency,
      };
    } catch (err) {
      console.error('Error fetching shipping rate from DB:', err);
    }

    return null;
  }

  /**
   * Main Freight Calculator API - computes raw cost from DB, applies store policy, and resolves subsidies.
   */
  static async calculateFreight(input: CalculateFreightInput, executor?: any): Promise<FreightCalculationResult> {
    // Requirement 1: Weight is strictly required (> 0)
    if (!input.weightKg || Number(input.weightKg) <= 0) {
      return {
        shippingCost: 0,
        shippingChargedToBuyer: 0,
        shippingSellerSubsidy: 0,
        shippingMarketplaceSubsidy: 0,
        shippingPayer: 'buyer',
        policyMode: 'CUSTOMER_PAYS',
        estimatedMinDays: 0,
        estimatedMaxDays: 0,
        rateSource: 'INTERNAL_ZONE',
        currency: input.currency || '',
        available: false,
        errorMessage: 'PRODUCT_WEIGHT_REQUIRED: O peso do produto é obrigatório e deve ser maior que zero.',
      };
    }

    // Requirement 4: Currency is strictly required
    if (!input.currency || !input.currency.trim()) {
      return {
        shippingCost: 0,
        shippingChargedToBuyer: 0,
        shippingSellerSubsidy: 0,
        shippingMarketplaceSubsidy: 0,
        shippingPayer: 'buyer',
        policyMode: 'CUSTOMER_PAYS',
        estimatedMinDays: 0,
        estimatedMaxDays: 0,
        rateSource: 'INTERNAL_ZONE',
        currency: '',
        available: false,
        errorMessage: 'SHIPPING_CURRENCY_REQUIRED: Moeda é obrigatória para cálculo de frete.',
      };
    }

    // Requirement 2: Origin Country is strictly required
    if (!input.originCountry || !input.originCountry.trim()) {
      return {
        shippingCost: 0,
        shippingChargedToBuyer: 0,
        shippingSellerSubsidy: 0,
        shippingMarketplaceSubsidy: 0,
        shippingPayer: 'buyer',
        policyMode: 'CUSTOMER_PAYS',
        estimatedMinDays: 0,
        estimatedMaxDays: 0,
        rateSource: 'INTERNAL_ZONE',
        currency: input.currency,
        available: false,
        errorMessage: 'SHIPPING_ORIGIN_REQUIRED: País de origem é obrigatório para cálculo de frete.',
      };
    }

    // Requirement 3: Destination Country is strictly required
    if (!input.destinationCountry || !input.destinationCountry.trim()) {
      return {
        shippingCost: 0,
        shippingChargedToBuyer: 0,
        shippingSellerSubsidy: 0,
        shippingMarketplaceSubsidy: 0,
        shippingPayer: 'buyer',
        policyMode: 'CUSTOMER_PAYS',
        estimatedMinDays: 0,
        estimatedMaxDays: 0,
        rateSource: 'INTERNAL_ZONE',
        currency: input.currency,
        available: false,
        errorMessage: 'SHIPPING_DESTINATION_REQUIRED: País de destino é obrigatório para cálculo de frete.',
      };
    }

    const originCountry = input.originCountry.trim().toUpperCase();
    const destinationCountry = input.destinationCountry.trim().toUpperCase();

    // Peso volumétrico: só entra em jogo se houver dimensões E divisor
    // configurado — nunca inventa nenhum dos dois.
    const volumetricDivisor = await getVolumetricDivisor(executor);
    const { billableWeightKg, volumetricWeightKg } = computeBillableWeightKg(
      Number(input.weightKg),
      input.dimensionsCm,
      volumetricDivisor
    );

    const rawRate = await this.getRawShippingRate({
      originCountry,
      destinationCountry,
      originRegion: input.originRegion,
      destinationRegion: input.destinationRegion,
      destinationCity: input.destinationCity,
      weightKg: billableWeightKg,
      currency: input.currency.trim().toUpperCase(),
    }, executor);

    if (!rawRate) {
      return {
        shippingCost: 0,
        shippingChargedToBuyer: 0,
        shippingSellerSubsidy: 0,
        shippingMarketplaceSubsidy: 0,
        shippingPayer: 'buyer',
        policyMode: 'CUSTOMER_PAYS',
        estimatedMinDays: 0,
        estimatedMaxDays: 0,
        rateSource: 'INTERNAL_ZONE',
        currency: input.currency,
        available: false,
        errorMessage: 'SHIPPING_RATE_NOT_AVAILABLE: Não há tarifa de frete cadastrada para esta rota, localização e faixa de peso.',
      };
    }

    const currency = rawRate.currency;
    const shippingCost = rawRate.price;
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

    // Sem política específica da loja: cai para a política GLOBAL
    // configurável (platformSettings.defaultShippingPolicyMode, admin via
    // POST /admin/settings) — nunca um modo de negócio hardcoded no código.
    // Só se NADA estiver configurado em lugar nenhum é que o comportamento
    // mais conservador (CUSTOMER_PAYS — cobra o custo real do comprador)
    // entra como rede de segurança final.
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

    return {
      shippingCost,
      shippingChargedToBuyer,
      shippingSellerSubsidy,
      shippingMarketplaceSubsidy,
      shippingPayer,
      policyMode,
      estimatedMinDays: rawRate.estimatedMinDays,
      estimatedMaxDays: rawRate.estimatedMaxDays,
      rateSource: rawRate.source,
      rateId: rawRate.rateId,
      currency,
      available: true,
      billableWeightKg,
      volumetricWeightKg,
    };
  }

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
