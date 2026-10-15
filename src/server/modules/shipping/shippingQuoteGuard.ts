/**
 * Proteção financeira do frete no momento de CRIAR o pedido (dentro da transação): a tarifa que vai ser cobrada é travada e conferida, e
 * o total de frete que o cliente viu é comparado com o que o servidor acabou de calcular. O cliente nunca define preço: só confirma o que viu.
 */
import { inArray } from 'drizzle-orm';
import { shippingRouteRates } from '../../../db/schema.js';
import { CheckoutShippingError } from './checkoutShippingErrors.js';

export interface RateCheck {
  rateId: string;
  /** valor da tarifa lido na cotação (por expedição), antes do travamento */
  amount: number;
  /** peso (kg) usado na cotação — a faixa da tarifa tem de continuar cobrindo-o */
  weightKg: number;
  currency: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Trava (FOR SHARE) as linhas das tarifas usadas e confere que continuam válidas e com o MESMO valor da cotação. Enquanto esta transação
 * não terminar, nenhuma edição administrativa dessas tarifas consegue gravar — o valor cobrado é exatamente o valor travado.
 * Tarifa desativada/removida/vencida/fora da faixa → serviço indisponível; valor diferente → cotação mudou. Nada é trocado em silêncio.
 */
export async function lockAndVerifyRates(tx: any, checks: RateCheck[], serviceCode: string | null, at: Date = new Date()): Promise<void> {
  const ids = Array.from(new Set(checks.map((c) => c.rateId).filter(Boolean)));
  if (ids.length === 0) return;
  const rows: any[] = await tx.select().from(shippingRouteRates).where(inArray(shippingRouteRates.id, ids)).for('share');
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const c of checks) {
    const row = byId.get(c.rateId);
    const valid = row
      && row.isActive !== false
      && (!row.validFrom || new Date(row.validFrom).getTime() <= at.getTime())
      && (!row.validUntil || new Date(row.validUntil).getTime() > at.getTime())
      && c.weightKg >= Number(row.minWeightKg) && c.weightKg < Number(row.maxWeightKg)
      && String(row.currency).toUpperCase() === c.currency.toUpperCase();
    if (!valid) {
      throw new CheckoutShippingError(
        'SHIPPING_SERVICE_UNAVAILABLE',
        'A tarifa do serviço de entrega escolhido deixou de estar disponível. Atualize as opções de entrega e escolha o serviço novamente.',
        409,
        { serviceCode, reason: 'RATE_NO_LONGER_VALID' },
      );
    }
    if (round2(Number(row.amount)) !== round2(c.amount)) {
      throw new CheckoutShippingError(
        'SHIPPING_QUOTE_CHANGED',
        'O valor do frete mudou enquanto você finalizava a compra. Confira o novo valor e confirme novamente.',
        409,
        { serviceCode, previousShippingChargedToBuyer: null, reason: 'RATE_AMOUNT_CHANGED' },
      );
    }
  }
}

/** O total de frete que o cliente viu tem de ser exatamente o que o servidor calculou agora; senão, nova confirmação. */
export function assertShippingQuoteMatches(
  expectedShippingChargedToBuyer: number | null | undefined,
  currentShippingChargedToBuyer: number,
  ctx: { serviceCode: string | null; currency: string },
): void {
  if (expectedShippingChargedToBuyer === null || expectedShippingChargedToBuyer === undefined) return;
  if (round2(expectedShippingChargedToBuyer) === round2(currentShippingChargedToBuyer)) return;
  throw new CheckoutShippingError(
    'SHIPPING_QUOTE_CHANGED',
    `O valor do frete mudou de ${round2(expectedShippingChargedToBuyer)} para ${round2(currentShippingChargedToBuyer)} ${ctx.currency}. Confira o novo total e confirme novamente a compra.`,
    409,
    {
      serviceCode: ctx.serviceCode,
      previousShippingChargedToBuyer: round2(expectedShippingChargedToBuyer),
      currentShippingChargedToBuyer: round2(currentShippingChargedToBuyer),
      currency: ctx.currency,
    },
  );
}
