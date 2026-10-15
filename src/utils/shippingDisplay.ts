/**
 * Como a linha "Frete" é apresentada (PURO — carrinho e checkout usam a mesma regra):
 *  - calculando: ainda não há resultado (ou está recalculando) → nunca mostra valor antigo, nem "grátis";
 *  - indisponível: sem rota/tarifa/estoque/setor → NUNCA é frete grátis;
 *  - pago: valor cobrado > 0;
 *  - grátis por política: o custo logístico real é > 0 e foi coberto pelo vendedor/plataforma (subsídio);
 *  - sem custo: o custo logístico cadastrado é 0 (tarifa zero explícita), sem subsídio — não é "grátis" por oferta.
 */
export interface ShippingLineInput {
  loading: boolean;
  /** já houve pelo menos um cálculo concluído */
  ready: boolean;
  available: boolean;
  /** o que o comprador paga (pós-política) */
  shippingChargedToBuyer: number;
  /** custo logístico real (pré-política) */
  shippingCost: number;
  /** há serviços disponíveis, mas ainda nenhum foi escolhido (o frete só existe depois da escolha) */
  needsSelection?: boolean;
}

export type ShippingLineKind = 'calculating' | 'choose' | 'unavailable' | 'unconfirmed' | 'paid' | 'free_by_policy' | 'no_cost';

const isMoney = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

export function describeShippingLine(s: ShippingLineInput): ShippingLineKind {
  if (s.loading || !s.ready) return 'calculating';
  if (s.needsSelection) return 'choose';
  if (!s.available) return 'unavailable';
  // Sem os DOIS valores numéricos do servidor não há como confirmar que o frete é zero: nunca "GRÁTIS" por valor ausente/inválido (undefined, NaN, null).
  if (!isMoney(s.shippingChargedToBuyer) || !isMoney(s.shippingCost)) return 'unconfirmed';
  if (s.shippingChargedToBuyer > 0) return 'paid';
  return s.shippingCost > 0 ? 'free_by_policy' : 'no_cost';
}

export const SHIPPING_LINE_LABEL: Record<Exclude<ShippingLineKind, 'paid'>, string> = {
  calculating: 'Calculando...',
  choose: 'Escolha o serviço',
  unavailable: 'Indisponível',
  unconfirmed: 'Frete a calcular',
  free_by_policy: 'GRÁTIS',
  no_cost: 'Sem custo de frete',
};

export type ShippingCoveredBy = 'seller' | 'marketplace' | 'shared' | null | undefined;

/** Quem paga o frete que o comprador não paga — dito de forma explícita (nunca se presume que seja o vendedor). */
export function describeFreeShippingPayer(coveredBy: ShippingCoveredBy): string | null {
  if (coveredBy === 'marketplace') return 'Frete custeado pela Nusali';
  if (coveredBy === 'seller') return 'Frete custeado pelo vendedor';
  if (coveredBy === 'shared') return 'Frete custeado pela Nusali e pelo vendedor';
  return null;
}

export interface ServiceOptionPriceInput {
  available: boolean;
  shippingChargedToBuyer?: number;
  shippingCost?: number;
  shippingCoveredBy?: ShippingCoveredBy;
}

/**
 * Preço de UM serviço de entrega (seletor do checkout e prévia da página do produto — mesma regra): valor pago pelo comprador, "GRÁTIS" só com
 * custo real > 0 coberto por política (e dizendo quem custeia), "Sem custo de frete" para tarifa zero, "Indisponível" sem cotação válida e
 * "Frete a calcular" quando o servidor não devolveu os valores.
 */
export function describeServiceOptionPrice(o: ServiceOptionPriceInput, formatAmount: (n: number) => string): { kind: ShippingLineKind; text: string; note: string | null } {
  const kind = describeShippingLine({
    loading: false, ready: true, available: o.available,
    shippingChargedToBuyer: o.shippingChargedToBuyer as number, shippingCost: o.shippingCost as number,
  });
  if (kind === 'paid') return { kind, text: formatAmount(o.shippingChargedToBuyer as number), note: null };
  if (kind === 'free_by_policy') return { kind, text: SHIPPING_LINE_LABEL.free_by_policy, note: describeFreeShippingPayer(o.shippingCoveredBy) };
  return { kind, text: SHIPPING_LINE_LABEL[kind as Exclude<ShippingLineKind, 'paid'>], note: null };
}
