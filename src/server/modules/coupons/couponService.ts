// FASE D18-C3.1B — cupons do vendedor: modelo de dados + CRUD real.
//
// Este módulo é INTENCIONALMENTE puro: nenhuma função aqui toca o banco.
// Ownership (seller/store), unicidade de código e persistência ficam a
// cargo de quem chamar (couponRoutes, dentro de sellerRoutes.ts).
//
// Escopo desta fase (não confundir com o que falta): o cupom pertence ao
// SELLER e financia o próprio desconto — nunca a Nusali, nunca o frete
// (shippingSellerSubsidy/shippingMarketplaceSubsidy são conceitos
// separados, ver shippingCampaignService.ts). Consumo (coupon_usages),
// integração com CartView/CheckoutView/calculateOrderFinancials e regras de
// moeda cruzada entre pedidos NÃO fazem parte deste módulo ainda.

export type CouponDiscountType = 'PERCENTAGE' | 'FIXED';

export type CouponValidationResult = { ok: true } | { ok: false; errors: string[] };

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/**
 * Normaliza um código de cupom para a forma canônica usada tanto na
 * gravação quanto na comparação: trim + uppercase. A unicidade
 * case-insensitive por seller é reforçada em DOIS níveis (defesa em
 * profundidade, pedido explicitamente pelo ticket):
 *   1. aqui (aplicação sempre grava já em uppercase);
 *   2. no banco, via índice único funcional coupons_seller_code_uq
 *      (seller_id, upper(code)) — ver schema.ts — que continua protegendo
 *      mesmo que algum caminho de escrita futuro esqueça de normalizar.
 */
export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}

// ============================================================================
// FASE D18-C3.2 — preview/validação do cupom no carrinho (SOMENTE LEITURA).
//
// As funções abaixo continuam puras: nunca tocam coupon_usages, nunca
// incrementam usageCount, nunca decidem por si só qual coupon buscar (isso é
// responsabilidade de quem chama — o handler HTTP resolve store->seller->
// coupon e calcula eligibleSubtotal a partir do carrinho real ANTES de
// chamar evaluateCouponForCartPreview). Estas funções só decidem: dado um
// cupom já resolvido e os números já apurados pelo caller, ele é aplicável
// agora, e por quanto?
// ============================================================================

/**
 * Janela de vigência semi-aberta [startDate, endDate) — mesma semântica já
 * estabelecida em shippingCampaignService.ts:isShippingCampaignActiveAt,
 * só com os nomes de campo reais de `coupons` (startDate/endDate em vez de
 * startsAt/endsAt). isActive=false sempre vence sobre qualquer janela.
 */
export function isCouponActiveAt(coupon: { isActive: boolean; startDate: Date | null; endDate: Date | null }, instant: Date): boolean {
  if (!coupon.isActive) return false;
  if (coupon.startDate && instant.getTime() < coupon.startDate.getTime()) return false;
  if (coupon.endDate && instant.getTime() >= coupon.endDate.getTime()) return false;
  return true;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * PERCENTAGE: eligibleSubtotal * discountValue/100, com teto em maxDiscount
 * quando informado. FIXED: o próprio discountValue. Em ambos os casos, nunca
 * ultrapassa eligibleSubtotal (um cupom nunca pode gerar desconto negativo
 * para o subtotal do comprador). Mesma convenção de arredondamento
 * (Math.round(n*100)/100) já usada em shippingPreviewService.ts/orderService.ts.
 */
export function computeCouponDiscountAmount(input: {
  discountType: CouponDiscountType | string;
  discountValue: number;
  maxDiscount: number | null;
  eligibleSubtotal: number;
}): number {
  let raw = input.discountType === 'FIXED' ? input.discountValue : input.eligibleSubtotal * (input.discountValue / 100);
  if (input.maxDiscount !== null) raw = Math.min(raw, input.maxDiscount);
  raw = Math.min(raw, input.eligibleSubtotal);
  return round2(Math.max(0, raw));
}

export interface CouponRedemptionCheckInput {
  coupon: {
    discountType: CouponDiscountType | string;
    discountValue: number;
    maxDiscount: number | null;
    minimumSpend: number;
    currency: string | null;
    isActive: boolean;
    startDate: Date | null;
    endDate: Date | null;
    usageLimit: number | null;
    usageLimitPerUser: number | null;
  };
  /** Subtotal real do carrinho, calculado pelo caller, restrito SOMENTE aos
   * itens da store/seller do cupom — nunca o carrinho inteiro. */
  eligibleSubtotal: number;
  /** Moeda efetiva dos itens elegíveis (nunca a moeda de um OUTRO grupo do
   * carrinho multi-seller). */
  cartCurrency: string;
  /** Contagem real de coupon_usages para este couponId (nunca o campo
   * denormalizado coupons.usageCount, que esta fase não mantém). */
  totalUsageCount: number;
  /** Contagem real de coupon_usages para este couponId + este userId. */
  userUsageCount: number;
  instant: Date;
}

// Discriminante em string ('VALID'/'INVALID'), não boolean — mesmo motivo
// documentado em ledgerTestDbGuard.ts: narrowing de union por negação
// (`!result.valid`) de um discriminante boolean não se comporta de forma
// confiável neste toolchain (tsconfig sem strict/strictNullChecks).
export type CouponRedemptionCheckResult =
  | { status: 'VALID'; discountAmount: number }
  | { status: 'INVALID'; code: string; message: string };

/**
 * Decide se um cupom JÁ RESOLVIDO (seller/store corretos) pode ser aplicado
 * AGORA a um subtotal elegível JÁ CALCULADO pelo caller a partir do carrinho
 * real. Nunca consulta o banco, nunca decide ownership/resolução de código —
 * isso é do handler HTTP. Ordem de checagem escolhida para dar ao comprador
 * o motivo mais específico/útil primeiro (janela de vigência antes de
 * minimumSpend, por exemplo, porque um cupom expirado é inválido
 * independente do valor do carrinho).
 */
export function evaluateCouponForCartPreview(input: CouponRedemptionCheckInput): CouponRedemptionCheckResult {
  const { coupon } = input;

  if (!coupon.isActive) {
    return { status: 'INVALID', code: 'COUPON_INACTIVE', message: 'Este cupom está desativado.' };
  }
  if (coupon.startDate && input.instant.getTime() < coupon.startDate.getTime()) {
    return { status: 'INVALID', code: 'COUPON_NOT_STARTED', message: 'Este cupom ainda não está disponível.' };
  }
  if (coupon.endDate && input.instant.getTime() >= coupon.endDate.getTime()) {
    return { status: 'INVALID', code: 'COUPON_EXPIRED', message: 'Este cupom expirou.' };
  }
  if (coupon.currency && input.cartCurrency && coupon.currency !== input.cartCurrency) {
    return { status: 'INVALID', code: 'CURRENCY_MISMATCH', message: `Este cupom é válido apenas em ${coupon.currency}.` };
  }
  if (input.eligibleSubtotal <= 0) {
    return { status: 'INVALID', code: 'EMPTY_ELIGIBLE_CART', message: 'Seu carrinho não contém itens desta loja.' };
  }
  if (input.eligibleSubtotal < coupon.minimumSpend) {
    return { status: 'INVALID', code: 'MINIMUM_SPEND_NOT_MET', message: `Este cupom exige compra mínima de ${coupon.minimumSpend} ${coupon.currency || ''}.`.trim() };
  }
  if (coupon.usageLimit !== null && input.totalUsageCount >= coupon.usageLimit) {
    return { status: 'INVALID', code: 'USAGE_LIMIT_REACHED', message: 'Este cupom atingiu o limite total de usos.' };
  }
  if (coupon.usageLimitPerUser !== null && input.userUsageCount >= coupon.usageLimitPerUser) {
    return { status: 'INVALID', code: 'USER_USAGE_LIMIT_REACHED', message: 'Você já utilizou este cupom o número máximo de vezes permitido.' };
  }

  const discountAmount = computeCouponDiscountAmount({
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    maxDiscount: coupon.maxDiscount,
    eligibleSubtotal: input.eligibleSubtotal,
  });
  return { status: 'VALID', discountAmount };
}

/**
 * Valida a DEFINIÇÃO de um cupom (os mesmos invariantes de negócio, prontos
 * para reforçar no futuro com CHECK constraints quando os dados legados de
 * `coupons` forem auditados — ver migration 0033: propositalmente NENHUM
 * CHECK novo foi adicionado para discountType/discountValue/minimumSpend/
 * maxDiscount/startDate/endDate porque essas colunas já existiam antes desta
 * fase e podem conter linhas legadas nunca validadas por esta regra; a
 * migration só adiciona CHECKs para colunas novas, que nascem sempre NULL
 * nas linhas antigas). Nunca consulta o banco — ownership de seller/store e
 * unicidade de código são responsabilidade do chamador.
 *
 * Regra de maxDiscount (decisão explícita, não silenciosa — pedida pelo
 * ticket): só faz sentido para PERCENTAGE, onde funciona como teto do valor
 * percentual calculado sobre o subtotal elegível. Para FIXED o próprio
 * discountValue JÁ É o valor absoluto do desconto — um "teto" adicional
 * seria redundante e ambíguo (tetar em quê, se o valor já é fixo?) — por
 * isso maxDiscount deve ser null quando discountType = FIXED.
 */
export function validateCouponDefinition(input: {
  code: string;
  title: string;
  discountType: CouponDiscountType;
  discountValue: number;
  minimumSpend?: number | null;
  maxDiscount?: number | null;
  currency: string;
  usageLimit?: number | null;
  usageLimitPerUser?: number | null;
  startDate?: Date | null;
  endDate?: Date | null;
}): CouponValidationResult {
  const errors: string[] = [];

  if (!input.code || !normalizeCouponCode(input.code)) {
    errors.push('code é obrigatório.');
  }

  if (!input.title || !input.title.trim()) {
    errors.push('title é obrigatório.');
  }

  const maxDiscount = input.maxDiscount ?? null;
  if (!['PERCENTAGE', 'FIXED'].includes(input.discountType)) {
    errors.push(`discountType inválido: ${String(input.discountType)}. Use PERCENTAGE ou FIXED.`);
  } else if (input.discountType === 'PERCENTAGE') {
    if (!isFiniteNumber(input.discountValue) || input.discountValue <= 0 || input.discountValue > 100) {
      errors.push('discountValue de PERCENTAGE deve ser > 0 e <= 100.');
    }
    if (maxDiscount !== null && (!isFiniteNumber(maxDiscount) || maxDiscount <= 0)) {
      errors.push('maxDiscount, quando informado em PERCENTAGE, deve ser um número finito > 0.');
    }
  } else if (input.discountType === 'FIXED') {
    if (!isFiniteNumber(input.discountValue) || input.discountValue <= 0) {
      errors.push('discountValue de FIXED deve ser > 0.');
    }
    if (maxDiscount !== null) {
      errors.push('maxDiscount não é aplicável a FIXED (deve ser null) — o próprio discountValue já é o valor absoluto do desconto.');
    }
  }

  const minimumSpend = input.minimumSpend ?? 0;
  if (!isFiniteNumber(minimumSpend) || minimumSpend < 0) {
    errors.push('minimumSpend deve ser um número finito >= 0.');
  }

  if (!input.currency || !/^[A-Za-z]{3}$/.test(input.currency)) {
    errors.push('currency é obrigatório e deve ter 3 letras (ISO 4217, ex.: XOF, BRL).');
  }

  const usageLimit = input.usageLimit ?? null;
  if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit <= 0)) {
    errors.push('usageLimit, quando informado, deve ser um inteiro > 0.');
  }

  const usageLimitPerUser = input.usageLimitPerUser ?? null;
  if (usageLimitPerUser !== null && (!Number.isInteger(usageLimitPerUser) || usageLimitPerUser <= 0)) {
    errors.push('usageLimitPerUser, quando informado, deve ser um inteiro > 0 (null = sem limite por usuário).');
  }
  if (usageLimit !== null && usageLimitPerUser !== null && usageLimitPerUser > usageLimit) {
    errors.push('usageLimitPerUser não pode exceder usageLimit.');
  }

  const startDate = input.startDate ?? null;
  const endDate = input.endDate ?? null;
  if (startDate && endDate && !(startDate.getTime() < endDate.getTime())) {
    errors.push('endDate deve ser posterior a startDate.');
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}
