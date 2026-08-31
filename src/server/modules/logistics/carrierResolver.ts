/**
 * Fase "Transportadoras Persistentes" — fechamento: resolução ÚNICA e
 * central do nome de exibição da transportadora, reutilizada por
 * shipmentService.ts, orderService.ts e adminRoutes.ts. Nenhum desses
 * módulos deve reimplementar esta lógica separadamente.
 *
 * Regra obrigatória (mesma em todo lugar, nunca duplicada de forma
 * divergente):
 *   1) shipments.carrierId -> carriers.name  (fonte autoritativa)
 *   2) shipments.carrier (texto legado)       (fallback histórico)
 *   3) null
 *
 * NUNCA filtra por carriers.status: uma transportadora INACTIVE continua
 * tendo seu nome exibido normalmente em envios que já a referenciam —
 * "inativa" significa "indisponível para novas atribuições", nunca
 * "histórico apagado".
 *
 * Arquivo isolado (sem depender de shipmentService.ts nem orderService.ts)
 * de propósito, para não criar import circular entre os dois.
 */
import { carriers } from '../../../db/schema.js';
import { inArray } from 'drizzle-orm';

/**
 * Busca em lote os nomes reais de um conjunto de carrierIds. Retorna um
 * Map<carrierId, name> — nunca lança se algum id não existir (fica
 * simplesmente ausente do Map, e o chamador aplica o fallback legado).
 */
export async function resolveCarrierNames(db: any, carrierIds: (string | null | undefined)[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(carrierIds.filter((id): id is string => Boolean(id))));
  if (ids.length === 0 || !db) return new Map();

  const rows = await db.select({ id: carriers.id, name: carriers.name }).from(carriers).where(inArray(carriers.id, ids));
  return new Map(rows.map((r: any) => [r.id, r.name]));
}

/**
 * Aplica a regra de prioridade para UM shipment já com o Map resolvido.
 * Sempre usar junto de resolveCarrierNames (nunca fazer o fallback "na mão"
 * em outro lugar, para a regra nunca divergir).
 */
export function pickCarrierName(carrierId: string | null | undefined, legacyCarrierText: string | null | undefined, carrierMap: Map<string, string>): string | null {
  if (carrierId) {
    const resolved = carrierMap.get(carrierId);
    if (resolved) return resolved;
  }
  return legacyCarrierText || null;
}
