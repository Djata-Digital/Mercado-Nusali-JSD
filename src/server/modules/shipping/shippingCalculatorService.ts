import { getDb } from '../../../db/index.js';
import { storeShippingPolicies, sellers, stores, platformSettings } from '../../../db/schema.js';
import { eq, asc } from 'drizzle-orm';

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

// FASE D18-B1 — precisão monetária do projeto: 2 casas (centavos). Todas as
// comparações de invariante são feitas em centavos inteiros, nunca com
// igualdade de ponto flutuante.
const round2 = (n: number): number => Math.round(n * 100) / 100;
const cents = (n: number): number => Math.round(n * 100);

/**
 * FASE D18-B1 — resultado EXPLÍCITO de "política de frete não aplicável".
 * Nunca é convertido silenciosamente em outra política (ex.: frete grátis
 * virando frete parcial) e nunca transfere excedente para a Nusali: quem
 * chama (checkout) bloqueia o pedido; o preview do carrinho devolve
 * available:false com este mesmo `code`. A mensagem já vem no formato
 * "CODE: texto" usado pelos demais erros de orderService.ts.
 */
export type ShippingPolicyNotApplicableCode =
  | 'SELLER_SHIPPING_POLICY_INVALID'
  | 'SELLER_SUBSIDY_EXCEEDS_NET'
  | 'SHIPPING_FUNDING_INVARIANT_VIOLATION';

export class ShippingPolicyNotApplicableError extends Error {
  readonly code: ShippingPolicyNotApplicableCode;
  constructor(code: ShippingPolicyNotApplicableCode, message: string) {
    super(`${code}: ${message}`);
    this.name = 'ShippingPolicyNotApplicableError';
    this.code = code;
  }
}

export type NumberValidation = { ok: true; value: number } | { ok: false };

// Validação estrita (nunca `Number(x) || 0`, que converte lixo em 0 sem
// avisar). Aceita number ou string numérica; rejeita NaN, ±Infinity, string
// vazia/não numérica, boolean, null, objeto.
function parseFiniteNumber(value: unknown): NumberValidation {
  if (typeof value === 'number') return Number.isFinite(value) ? { ok: true, value } : { ok: false };
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? { ok: true, value: n } : { ok: false };
  }
  return { ok: false };
}

/** Percentual de subsídio: número finito entre 0 e 100 inclusive. */
export function validateSubsidyPercent(value: unknown): NumberValidation {
  const parsed = parseFiniteNumber(value);
  if (!parsed.ok || parsed.value < 0 || parsed.value > 100) return { ok: false };
  return parsed;
}

/** Valor máximo de subsídio: número finito maior ou igual a zero. */
export function validateSubsidyAmount(value: unknown): NumberValidation {
  const parsed = parseFiniteNumber(value);
  if (!parsed.ok || parsed.value < 0) return { ok: false };
  return parsed;
}

/**
 * Invariante financeiro fundamental (defesa final do resolver): nenhuma
 * parcela negativa, nenhuma parcela acima do custo real, e
 * buyer + seller + Nusali === custo real, em centavos.
 */
export function assertShippingSharesInvariant(
  shippingCost: number,
  shares: { buyer: number; seller: number; marketplace: number }
): void {
  const all = [shippingCost, shares.buyer, shares.seller, shares.marketplace];
  const ok =
    all.every((n) => Number.isFinite(n)) &&
    cents(shares.buyer) >= 0 &&
    cents(shares.seller) >= 0 &&
    cents(shares.marketplace) >= 0 &&
    cents(shares.buyer) <= cents(shippingCost) &&
    cents(shares.seller) <= cents(shippingCost) &&
    cents(shares.marketplace) <= cents(shippingCost) &&
    cents(shares.buyer) + cents(shares.seller) + cents(shares.marketplace) === cents(shippingCost);
  if (!ok) {
    throw new ShippingPolicyNotApplicableError(
      'SHIPPING_FUNDING_INVARIANT_VIOLATION',
      `A divisão do frete não fecha (custo=${shippingCost}, comprador=${shares.buyer}, vendedor=${shares.seller}, marketplace=${shares.marketplace}).`
    );
  }
}

/**
 * Regra do seller net: uma parcela de frete assumida pelo seller nunca pode
 * deixar sellerNetAmount <= 0 (o escrow não conseguiria liberar — ver
 * calculateSellerReleaseAmount). Só se aplica quando o seller de fato tem
 * parcela de frete (> 0): pedidos em que o seller não financia frete
 * mantêm exatamente o comportamento anterior.
 * Função PURA, compartilhada por calculateOrderFinancials (checkout) e pelo
 * preview do carrinho — o mesmo veredito nos dois lugares.
 */
export function checkSellerNetForShippingShare(input: {
  productSubtotal: number;
  marketplaceCommission: number;
  shippingSellerSubsidy: number;
}): { ok: true; sellerNetAmount: number } | { ok: false; sellerNetAmount: number } {
  const sellerNetAmount = round2(input.productSubtotal - input.marketplaceCommission - input.shippingSellerSubsidy);
  if (cents(input.shippingSellerSubsidy) > 0 && cents(sellerNetAmount) <= 0) {
    return { ok: false, sellerNetAmount };
  }
  return { ok: true, sellerNetAmount };
}

export function sellerSubsidyExceedsNetError(sellerNetAmount: number, shippingSellerSubsidy: number): ShippingPolicyNotApplicableError {
  return new ShippingPolicyNotApplicableError(
    'SELLER_SUBSIDY_EXCEEDS_NET',
    `A parcela de frete assumida pelo vendedor (${shippingSellerSubsidy}) deixaria o valor líquido da venda em ${sellerNetAmount} (deve ser maior que zero). A política de frete da loja não é aplicável a este pedido.`
  );
}

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
  // FASE D18-B1 — custo inválido nunca vira uma divisão "plausível".
  if (typeof shippingCost !== 'number' || !Number.isFinite(shippingCost) || shippingCost < 0) {
    throw new Error(`SHIPPING_COST_INVALID: custo de frete inválido (${String(shippingCost)}).`);
  }
  shippingCost = round2(shippingCost);

  let policyMode: string | null = null;
  // Valores crus da política do seller: validados ESTRITAMENTE mais abaixo,
  // só no modo SELLER_SUBSIDIZED (fora do try/catch de leitura, para que uma
  // linha histórica inválida nunca seja engolida e tratada como "sem política").
  let sellerSubsidyMaxRaw: unknown = null;
  let sellerSubsidyPercentRaw: unknown = null;
  let marketplaceSubsidyMaxAmount = 0;
  let marketplaceSubsidyPercent = 0;

  // Fetch store policy if storeId or sellerId supplied
  const db = executor ?? getDb();
  if (db && (input.storeId || input.sellerId)) {
    try {
      let policyRows = [];
      if (input.storeId) {
        // FASE D18-B2 — UNIQUE(store_id) garante no máximo 1 linha aqui;
        // já é determinístico por construção do banco, sem precisar de ORDER BY.
        policyRows = await db.select().from(storeShippingPolicies).where(eq(storeShippingPolicies.storeId, input.storeId)).limit(1);
      }
      if (policyRows.length === 0 && input.sellerId) {
        // FASE D18-B2.2 — fallback LEGADO apenas (chamador nunca usa isto
        // quando a loja comercial do item é conhecida — ver orderService.ts/
        // shippingPreviewService.ts, grupo LEGACY_NO_STORE). Sem UNIQUE em
        // seller_id (um seller pode ter várias lojas — D18-B2), então esta
        // consulta pode ter mais de uma linha; ORDER BY explícito evita que
        // um limit(1) sem ordenação escolha uma linha diferente a cada
        // execução. Não representa preferência comercial nenhuma, só
        // elimina o não-determinismo: a mais antiga (created_at), com o id
        // como desempate final.
        policyRows = await db.select().from(storeShippingPolicies).where(eq(storeShippingPolicies.sellerId, input.sellerId)).orderBy(asc(storeShippingPolicies.createdAt), asc(storeShippingPolicies.id)).limit(1);
      }
      if (policyRows.length > 0 && policyRows[0].isActive) {
        const pol = policyRows[0];
        policyMode = pol.mode || null;
        sellerSubsidyMaxRaw = pol.sellerSubsidyMaxAmount ?? null;
        sellerSubsidyPercentRaw = pol.sellerSubsidyPercent ?? null;
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
    // FASE D18-B1 — defesa em profundidade: mesmo que a rota do seller já
    // valide, uma linha histórica inválida no banco (percentual < 0 ou > 100,
    // valor negativo/não numérico) NUNCA pode gerar subsídio maior que o
    // custo nem parcela negativa. Fail-closed explícito: não cai para
    // "comprador paga tudo" (isso mudaria a promessa do seller em silêncio)
    // e não joga o excedente na Nusali.
    const maxValidation = sellerSubsidyMaxRaw === null || sellerSubsidyMaxRaw === '' ? ({ ok: true, value: 0 } as const) : validateSubsidyAmount(sellerSubsidyMaxRaw);
    const pctValidation = sellerSubsidyPercentRaw === null || sellerSubsidyPercentRaw === '' ? ({ ok: true, value: 0 } as const) : validateSubsidyPercent(sellerSubsidyPercentRaw);
    if (!maxValidation.ok || !pctValidation.ok) {
      throw new ShippingPolicyNotApplicableError(
        'SELLER_SHIPPING_POLICY_INVALID',
        'A política de frete da loja contém valores inválidos (percentual deve estar entre 0 e 100 e valor máximo não pode ser negativo). Corrija a configuração de frete da loja.'
      );
    }
    const sellerSubsidyMaxAmount = maxValidation.value;
    const sellerSubsidyPercent = pctValidation.value;
    let subsidy = 0;
    // Requirement 7: Max amount OR percent (not both simultaneously)
    if (sellerSubsidyMaxAmount > 0) {
      subsidy = Math.min(shippingCost, round2(sellerSubsidyMaxAmount));
    } else if (sellerSubsidyPercent > 0) {
      subsidy = Math.min(shippingCost, round2(shippingCost * (sellerSubsidyPercent / 100)));
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
    const marketplaceAbsorbed = round2(Math.min(shippingCost, marketplaceCap));
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

  // FASE D18-B1 — invariante final, independente do ramo acima:
  // comprador + seller + marketplace === custo real (em centavos), nenhuma
  // parcela negativa nem acima do custo.
  assertShippingSharesInvariant(shippingCost, {
    buyer: shippingChargedToBuyer,
    seller: shippingSellerSubsidy,
    marketplace: shippingMarketplaceSubsidy,
  });

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
    // FASE D18-B1 — seller nunca cria uma venda com net <= 0 por causa da
    // própria parcela de frete (o escrow não liberaria). Bloqueio explícito;
    // nunca transfere o excedente para a Nusali nem muda a política.
    const netCheck = checkSellerNetForShippingShare({
      productSubtotal,
      marketplaceCommission,
      shippingSellerSubsidy: params.shippingSellerSubsidy,
    });
    if (!netCheck.ok) {
      throw sellerSubsidyExceedsNetError(netCheck.sellerNetAmount, params.shippingSellerSubsidy);
    }
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
