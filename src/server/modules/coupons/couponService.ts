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
