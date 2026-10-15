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

export type ShippingLineKind = 'calculating' | 'choose' | 'unavailable' | 'paid' | 'free_by_policy' | 'no_cost';

export function describeShippingLine(s: ShippingLineInput): ShippingLineKind {
  if (s.loading || !s.ready) return 'calculating';
  if (s.needsSelection) return 'choose';
  if (!s.available) return 'unavailable';
  if (s.shippingChargedToBuyer > 0) return 'paid';
  return s.shippingCost > 0 ? 'free_by_policy' : 'no_cost';
}

export const SHIPPING_LINE_LABEL: Record<Exclude<ShippingLineKind, 'paid'>, string> = {
  calculating: 'Calculando...',
  choose: 'Escolha o serviço',
  unavailable: 'Indisponível',
  free_by_policy: 'GRÁTIS',
  no_cost: 'Sem custo de frete',
};
