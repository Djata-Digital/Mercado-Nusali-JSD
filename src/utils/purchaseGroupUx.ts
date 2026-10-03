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

/**
 * FASE D18-C7.3H.1 — estado COMERCIAL de uma compra para apresentação.
 *
 * `purchase_groups.status` é a AUTORIDADE: `payment.status === 'paid'`
 * isoladamente NUNCA significa compra confirmada. Um group 'cancelled' que
 * depois recebeu dinheiro (captura tardia, paid + surplus) continua
 * cancelado — o pagamento fica registrado para tratamento, nada é reaberto.
 * Para os demais status o critério anterior é preservado byte a byte
 * (status 'paid' OU pagamento 'paid', cobrindo p.ex. 'partially_refunded').
 */
export type PurchaseGroupCommercialState = 'paid' | 'pending' | 'cancelled' | 'cancelled_late_payment';

export interface PurchaseGroupPresentation {
  state: PurchaseGroupCommercialState;
  /** Título (h1) da tela. */
  title: string;
  /** Rótulo da célula "Pagamento". */
  paymentLabel: string;
  paymentTone: 'ok' | 'warn' | 'cancelled';
  /** O resumo de entrega só faz sentido para compra não cancelada. */
  showFulfillment: boolean;
  /** Aviso para compra cancelada; null nos demais estados. */
  notice: { title: string; body: string } | null;
}

export function derivePurchaseGroupPresentation(group: {
  status: string;
  payment?: { status: string; processing?: boolean } | null;
  lateSurplusPayment?: boolean;
}): PurchaseGroupPresentation {
  if (group.status === 'cancelled') {
    if (group.lateSurplusPayment === true) {
      return {
        state: 'cancelled_late_payment',
        title: 'Compra cancelada',
        paymentLabel: 'Recebido após o cancelamento',
        paymentTone: 'warn',
        showFulfillment: false,
        notice: {
          title: 'Pagamento recebido após o cancelamento',
          body:
            'Identificamos um pagamento referente a esta compra depois do cancelamento. ' +
            'Ele está registrado para tratamento e a compra permanece cancelada: os pedidos não foram reabertos e não serão enviados. ' +
            'Entre em contato com o suporte para acompanhar a situação.',
        },
      };
    }
    return {
      state: 'cancelled',
      title: 'Compra cancelada',
      paymentLabel: 'Não concluído',
      paymentTone: 'cancelled',
      showFulfillment: false,
      notice: {
        title: 'Esta compra foi cancelada',
        body: 'O pagamento não foi confirmado dentro do prazo e a compra foi cancelada. Nenhum pagamento foi confirmado para ela. Se ainda quiser os produtos, faça uma nova compra.',
      },
    };
  }

  const isPaid = group.status === 'paid' || group.payment?.status === 'paid';
  if (isPaid) {
    return { state: 'paid', title: 'Compra confirmada', paymentLabel: 'Confirmado', paymentTone: 'ok', showFulfillment: true, notice: null };
  }
  return {
    state: 'pending',
    title: 'Compra confirmada',
    paymentLabel: group.payment?.processing ? 'Processando' : 'Aguardando',
    paymentTone: 'warn',
    showFulfillment: true,
    notice: null,
  };
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
