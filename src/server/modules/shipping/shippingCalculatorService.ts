import { getDb } from '../../../db/index.js';
import { shippingRates, shippingZones, storeShippingPolicies, sellers, stores } from '../../../db/schema.js';
import { eq, and, lte, gte } from 'drizzle-orm';

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
  }): Promise<{ price: number; estimatedMinDays: number; estimatedMaxDays: number; rateId: string; source: string; currency: string } | null> {
    const db = getDb();
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
  static async calculateFreight(input: CalculateFreightInput): Promise<FreightCalculationResult> {
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

    const rawRate = await this.getRawShippingRate({
      originCountry,
      destinationCountry,
      originRegion: input.originRegion,
      destinationRegion: input.destinationRegion,
      destinationCity: input.destinationCity,
      weightKg: input.weightKg,
      currency: input.currency.trim().toUpperCase(),
    });

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
    let policyMode = 'CUSTOMER_PAYS';
    let sellerSubsidyMaxAmount = 0;
    let sellerSubsidyPercent = 0;

    // Fetch store policy if storeId or sellerId supplied
    const db = getDb();
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
          policyMode = pol.mode || 'CUSTOMER_PAYS';
          sellerSubsidyMaxAmount = pol.sellerSubsidyMaxAmount ? Number(pol.sellerSubsidyMaxAmount) : 0;
          sellerSubsidyPercent = pol.sellerSubsidyPercent ? Number(pol.sellerSubsidyPercent) : 0;
        }
      } catch (err) {
        console.error('Error reading store shipping policy:', err);
      }
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
      shippingChargedToBuyer = 0;
      shippingMarketplaceSubsidy = shippingCost;
      shippingPayer = 'marketplace';
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
    customsDuty?: number;
    buyerDiscounts?: number;
  }) {
    const productSubtotal = params.productSubtotal;
    const commissionRateSnapshot = params.commissionRatePercent;
    const commissionBase = productSubtotal;
    const marketplaceCommission = Math.round((commissionBase * (commissionRateSnapshot / 100)) * 100) / 100;

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
