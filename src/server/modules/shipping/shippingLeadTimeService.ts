/**
 * Prazo ESTIMADO de entrega por rota + serviço (shipping_route_service_lead_times), em dias inteiros (mínimo e máximo), independente das
 * faixas de peso. Estimativa, nunca garantia: não gera datas (não há regra definida de dias úteis, feriados ou horário de expedição) e não
 * entra em nenhum cálculo financeiro (preço, pagamento, Escrow, reembolso). Sem configuração = "Prazo a confirmar" (null).
 */
import { inArray } from 'drizzle-orm';
import { shippingRouteServiceLeadTimes } from '../../../db/schema.js';

export interface LeadTime { minDays: number; maxDays: number }
export const LEAD_TIME_MAX_DAYS = 365;

export const leadTimeKey = (routeId: string, serviceId: string) => `${routeId}|${serviceId}`;

/** Dias inteiros positivos, mínimo <= máximo, máximo <= 365. Devolve null se válido, senão "CODIGO: mensagem". */
export function validateLeadTimeInput(minDays: unknown, maxDays: unknown): string | null {
  const isIntLike = (v: unknown) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isInteger(Number(v));
  if (!isIntLike(minDays) || !isIntLike(maxDays)) return 'LEAD_TIME_INVALID: os prazos mínimo e máximo devem ser números inteiros de dias.';
  const min = Number(minDays), max = Number(maxDays);
  if (min < 1 || max < 1) return 'LEAD_TIME_INVALID: os prazos devem ser de pelo menos 1 dia.';
  if (min > max) return 'LEAD_TIME_INVALID: o prazo mínimo não pode ser maior que o prazo máximo.';
  if (max > LEAD_TIME_MAX_DAYS) return `LEAD_TIME_INVALID: o prazo máximo não pode passar de ${LEAD_TIME_MAX_DAYS} dias.`;
  return null;
}

/** Prazos configurados para os pares rota+serviço pedidos (um SELECT). Pares sem linha não aparecem no mapa. */
export async function loadLeadTimes(db: any, pairs: Array<{ routeId: string; serviceId: string }>): Promise<Map<string, LeadTime>> {
  const out = new Map<string, LeadTime>();
  const routeIds = Array.from(new Set(pairs.map((p) => p.routeId).filter(Boolean)));
  if (routeIds.length === 0) return out;
  const wanted = new Set(pairs.map((p) => leadTimeKey(p.routeId, p.serviceId)));
  const rows: any[] = await db.select().from(shippingRouteServiceLeadTimes).where(inArray(shippingRouteServiceLeadTimes.routeId, routeIds));
  for (const r of rows) {
    const k = leadTimeKey(r.routeId, r.serviceId);
    if (wanted.has(k)) out.set(k, { minDays: Number(r.minDays), maxDays: Number(r.maxDays) });
  }
  return out;
}

/**
 * Prazo do serviço para o carrinho inteiro: do primeiro volume ao último — mínimo = o menor dos mínimos, máximo = o maior dos máximos.
 * Se QUALQUER expedição não tem prazo configurado, o carrinho inteiro fica "a confirmar" (null): nunca se anuncia um prazo parcial.
 */
export function aggregateLeadTime(shipments: Array<{ routeId: string; serviceId: string }>, times: Map<string, LeadTime>): LeadTime | null {
  if (shipments.length === 0) return null;
  let min = Infinity, max = 0;
  for (const s of shipments) {
    const t = times.get(leadTimeKey(s.routeId, s.serviceId));
    if (!t) return null;
    min = Math.min(min, t.minDays);
    max = Math.max(max, t.maxDays);
  }
  return { minDays: min, maxDays: max };
}
