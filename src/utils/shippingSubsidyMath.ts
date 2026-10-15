/**
 * Aritmética do SUBSÍDIO DE FRETE DA NUSALI — pura, em centavos inteiros, sem dependências de servidor. É a ÚNICA fonte da conta: o motor de
 * cotação/pedido (shippingCalculatorService) e a simulação do painel do Super Admin importam as mesmas funções, então o que o administrador
 * simula é exatamente o que o servidor cobra.
 *
 * Modelo aprovado (em camadas, sempre nesta ordem):
 *   1. a política do VENDEDOR decide a parcela dele (nunca alterada pela Nusali);
 *   2. a percentagem da Nusali incide SÓ sobre o que restaria ao cliente (o saldo depois do vendedor);
 *   3. cliente + vendedor + Nusali = custo real do frete, ao centavo.
 * Logo o vendedor nunca paga mais por causa do subsídio da Nusali, e 0% é zero (nunca "sem teto" nem 100%).
 */

export const MIN_NUSALI_PERCENT = 0;
export const MAX_NUSALI_PERCENT = 100;

export const toCents = (amount: number): number => Math.round(amount * 100);
export const fromCents = (cents: number): number => cents / 100;

export type PercentValidation = { ok: true; value: number } | { ok: false; error: string };

/** Percentagem 0..100 (inclusive), número finito, no máximo 2 casas decimais. Texto, NaN, Infinity, negativos e >100 são recusados. */
export function validateNusaliPercent(raw: unknown): PercentValidation {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return { ok: false, error: 'A percentagem da Nusali deve ser um número entre 0 e 100.' };
  }
  if (raw < MIN_NUSALI_PERCENT || raw > MAX_NUSALI_PERCENT) {
    return { ok: false, error: 'A percentagem da Nusali deve estar entre 0 e 100.' };
  }
  if (Math.round(raw * 100) / 100 !== raw) {
    return { ok: false, error: 'A percentagem da Nusali aceita no máximo 2 casas decimais.' };
  }
  return { ok: true, value: raw };
}

export interface NusaliLayerResult {
  /** o que o cliente ainda paga depois do subsídio da Nusali */
  buyerPays: number;
  /** a parcela do saldo do cliente que a Nusali assume */
  nusaliShare: number;
}

/**
 * Aplica a percentagem da Nusali ao SALDO do cliente (o valor que sobraria depois da política do vendedor). Arredonda a parcela da Nusali ao
 * centavo e o cliente paga o resto: a soma é exata. 0% (ou valor inválido) = nenhum subsídio; nunca excede o saldo; nunca negativo.
 */
export function applyNusaliSubsidy(buyerResidual: number, percent: number): NusaliLayerResult {
  const residualCents = Math.max(0, toCents(Number.isFinite(buyerResidual) ? buyerResidual : 0));
  const pct = validateNusaliPercent(percent);
  if (!pct.ok || pct.value === 0 || residualCents === 0) return { buyerPays: fromCents(residualCents), nusaliShare: 0 };
  const shareCents = Math.min(residualCents, Math.max(0, Math.round((residualCents * pct.value) / 100)));
  return { buyerPays: fromCents(residualCents - shareCents), nusaliShare: fromCents(shareCents) };
}

export interface ShippingSplit {
  cost: number;
  seller: number;
  nusali: number;
  buyer: number;
}

/**
 * Divisão completa do frete para SIMULAÇÃO (painel) e testes: o vendedor assume `sellerPercent`% do custo (0..100; é a forma percentual da política
 * do vendedor), a Nusali assume `nusaliPercent`% do saldo restante, o cliente paga o resto. A conta do servidor para o vendedor usa a política real
 * dele; aqui a mesma ordem de camadas e a mesma aritmética em centavos.
 */
export function simulateShippingSplit(cost: number, sellerPercent: number, nusaliPercent: number): ShippingSplit {
  const costCents = Math.max(0, toCents(Number.isFinite(cost) ? cost : 0));
  const sp = Number.isFinite(sellerPercent) ? Math.min(100, Math.max(0, sellerPercent)) : 0;
  const sellerCents = Math.min(costCents, Math.round((costCents * sp) / 100));
  const residual = fromCents(costCents - sellerCents);
  const layer = applyNusaliSubsidy(residual, nusaliPercent);
  return { cost: fromCents(costCents), seller: fromCents(sellerCents), nusali: layer.nusaliShare, buyer: layer.buyerPays };
}

/** Invariante: cliente + vendedor + Nusali = custo real, em centavos exatos. */
export function splitIsExact(s: ShippingSplit): boolean {
  return toCents(s.buyer) + toCents(s.seller) + toCents(s.nusali) === toCents(s.cost) && s.buyer >= 0 && s.seller >= 0 && s.nusali >= 0;
}
