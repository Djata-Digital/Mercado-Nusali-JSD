/**
 * Fase M1-D3 — lógica PURA de apresentação de compras multi-seller no
 * frontend. Sem React, sem I/O — testável direto em Node. Nada aqui toca
 * dinheiro: são só derivações visuais a partir de dados já lidos da API
 * READ-ONLY.
 */

export type GroupFulfillmentTone = 'done' | 'partial' | 'moving' | 'preparing';

export interface GroupFulfillment {
  label: string;
  tone: GroupFulfillmentTone;
}

/**
 * Resumo de fulfillment consolidado de uma compra, SÓ para apresentação.
 * Derivado dos status logísticos dos child orders — nunca persistido, nunca
 * sobrescreve purchase_groups.status, nunca usado para decisão financeira.
 * NUNCA afirma "tudo entregue" quando só parte chegou (D3.2).
 */
export function deriveGroupFulfillment(logisticsStatuses: string[]): GroupFulfillment {
  const total = logisticsStatuses.length;
  if (total === 0) return { label: 'Sem pedidos', tone: 'preparing' };

  const ls = logisticsStatuses.map((s) => (s || '').toUpperCase());
  const delivered = ls.filter((s) => s === 'DELIVERED').length;

  if (delivered === total) return { label: 'Todos os pedidos entregues', tone: 'done' };
  if (delivered > 0) {
    return { label: `Entrega parcial — ${delivered} de ${total} pedidos entregues`, tone: 'partial' };
  }
  if (ls.some((s) => s === 'SHIPPED' || s === 'IN_TRANSIT' || s === 'OUT_FOR_DELIVERY')) {
    return { label: 'Pedidos a caminho', tone: 'moving' };
  }
  return { label: 'Pedidos em preparação', tone: 'preparing' };
}

export interface PurchaseGroupIndex<T> {
  /** child orders por purchaseGroupId, na ordem em que apareceram na lista. */
  childrenByGroup: Map<string, T[]>;
  /** quantidade de compras distintas = groups + pedidos legado avulsos. */
  buyCount: number;
}

/**
 * Indexa uma lista de pedidos do comprador por purchaseGroupId. Pedidos sem
 * purchaseGroupId (legado single-seller) NUNCA entram num group — ficam de
 * fora do índice e são renderizados individualmente. Agrupamento 100%
 * frontend; nenhum pedido é alterado.
 */
export function buildPurchaseGroupIndex<T extends { purchaseGroupId?: string | null }>(
  orders: T[]
): PurchaseGroupIndex<T> {
  const childrenByGroup = new Map<string, T[]>();
  let standalone = 0;
  for (const o of orders) {
    if (o.purchaseGroupId) {
      const arr = childrenByGroup.get(o.purchaseGroupId) || [];
      arr.push(o);
      childrenByGroup.set(o.purchaseGroupId, arr);
    } else {
      standalone += 1;
    }
  }
  return { childrenByGroup, buyCount: childrenByGroup.size + standalone };
}
