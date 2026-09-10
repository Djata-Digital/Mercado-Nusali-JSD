import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrders } from '../hooks/useOrders';
import { useCart } from '../hooks/useCart';
import { usePreferences } from '../context/PreferencesContext';
import { formatCurrency } from '../utils/currencyUtils';
import { Package, Truck, CheckCircle2, ChevronRight, RefreshCw, ShieldCheck, Layers } from 'lucide-react';
import { buildPurchaseGroupIndex } from '../utils/purchaseGroupUx';

/**
 * Fase M1-D3 — histórico do comprador. Uma compra multi-seller
 * (purchaseGroupId preenchido) NÃO aparece mais como N compras
 * independentes soltas: os child orders que compartilham o mesmo
 * purchaseGroupId são AGRUPADOS visualmente sob um cabeçalho "Compra
 * #PGRP...". O agrupamento é 100% frontend — nenhum order é tocado no
 * banco. Pedidos legado (purchaseGroupId null) continuam exatamente como
 * antes.
 *
 * Ações operacionais (ver detalhes, rastrear, disputa, "comprar novamente")
 * continuam SEMPRE no child order.id — nunca no purchaseGroupId.
 */

interface OrderRow {
  id?: string;
  orderNumber?: string;
  purchaseGroupId?: string | null;
  currency?: string;
  totalAmount?: number;
  total?: number;
  createdAt?: string;
  date?: string;
  status?: string;
  logisticsStatus?: string;
  trackingCode?: string | null;
  shipment?: { status?: string; trackingNumber?: string | null } | null;
  items?: any[];
  [k: string]: any;
}

function deliveryStatusText(order: OrderRow): string {
  const raw = (order.shipment?.status || order.logisticsStatus || order.status || '').toUpperCase();
  if (raw === 'DELIVERED') return 'Entregue no destino';
  if (raw === 'OUT_FOR_DELIVERY') return 'Saiu para entrega';
  if (raw === 'IN_TRANSIT') return 'Em trânsito no centro logístico';
  if (raw === 'SHIPPED') return 'Despachado para transporte';
  if (raw === 'READY_TO_SHIP') return 'Aguardando expedição';
  return 'Em preparação pela Nusali Logística';
}

const OrderCard: React.FC<{
  order: OrderRow;
  fallbackCurrency: string;
  compact?: boolean;
  buyAgainPendingKey: string | null;
  setBuyAgainPendingKey: (k: string | null) => void;
}> = ({ order, fallbackCurrency, compact, buyAgainPendingKey, setBuyAgainPendingKey }) => {
  const navigate = useNavigate();
  const { addItem } = useCart();
  const { showToast } = usePreferences();
  const items = Array.isArray(order.items) ? order.items : [];
  const orderCurrency = order.currency || fallbackCurrency || 'XOF';
  const orderTotal = Number(order.totalAmount ?? order.total ?? 0);
  const orderKey = order.id || order.orderNumber || '';
  const tracking = order.trackingCode || order.shipment?.trackingNumber || null;

  return (
    <div className={`bg-white overflow-hidden ${compact ? 'border-t border-gray-100' : 'rounded-2xl border border-gray-200 shadow-xs hover:shadow-md transition'} space-y-4`}>
      <div className="bg-gray-50 p-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2">
        <div className="space-x-3">
          <span className="font-bold text-gray-900">Pedido #{order.orderNumber || order.id}</span>
          {!compact && (
            <span className="text-gray-500">
              Realizado em {order.createdAt ? new Date(order.createdAt).toLocaleDateString('pt-BR') : order.date || 'Recente'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-extrabold text-gray-900 text-sm">Total: {formatCurrency(orderTotal, orderCurrency)}</span>
          <button
            onClick={() => navigate(`/orders/${order.id || order.orderNumber}`)}
            className="text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-0.5 hover:underline cursor-pointer"
          >
            Ver Detalhes <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="px-6 space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">
          <Truck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Status de Entrega: {deliveryStatusText(order)}</span>
        </div>

        <div className="divide-y divide-gray-100">
          {items.map((item: any, idx: number) => {
            const prod = item.product || item;
            const title = item.productTitle || item.title || prod.title || 'Item do Pedido';
            const image = item.productImage || item.image || prod.image || null;
            const qty = item.quantity || 1;
            const pendingKey = `${orderKey}_${idx}`;
            const isPending = buyAgainPendingKey === pendingKey;

            return (
              <div key={idx} className="py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {image ? (
                    <img src={image} alt="" className="w-14 h-14 object-contain rounded-xl border border-gray-100 p-1 bg-gray-50 shrink-0" />
                  ) : (
                    <div className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center border border-gray-200 shrink-0">
                      <Package className="w-6 h-6 text-gray-400" />
                    </div>
                  )}
                  <div>
                    <h4 className="text-xs font-bold text-gray-900 line-clamp-1">{title}</h4>
                    {item.variantTitle && (
                      <span className="inline-block mt-1 text-[10px] bg-gray-100 text-gray-800 font-semibold px-1.5 py-0.5 rounded">
                        {item.variantTitle}
                      </span>
                    )}
                    <p className="text-[11px] text-gray-500 mt-0.5">Quantidade: {qty}</p>
                  </div>
                </div>

                {prod.id && (
                  <button
                    disabled={buyAgainPendingKey !== null}
                    onClick={async () => {
                      if (buyAgainPendingKey !== null) return;
                      setBuyAgainPendingKey(pendingKey);
                      try {
                        await addItem(prod, qty);
                        navigate('/cart');
                      } catch (err: any) {
                        showToast(err?.message || 'Não foi possível adicionar ao carrinho. Tente novamente.');
                      } finally {
                        setBuyAgainPendingKey(null);
                      }
                    }}
                    className="bg-emerald-50 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed text-emerald-800 font-bold px-3 py-1.5 rounded-xl text-xs transition flex items-center gap-1 shrink-0 border border-emerald-200 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isPending ? 'animate-spin' : ''}`} />
                    <span>{isPending ? 'Adicionando...' : 'Comprar novamente'}</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-4 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600">
        <span className="flex items-center gap-1 font-semibold text-emerald-700">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Devolução grátis em até 30 dias com Escrow
        </span>
        <span className="font-mono text-gray-500">
          Rastreio: {tracking ? <strong className="text-gray-900">{tracking}</strong> : 'Aguardando envio'}
        </span>
      </div>
    </div>
  );
};

export const MyOrdersView: React.FC = () => {
  const navigate = useNavigate();
  const { data: orders = [] } = useOrders();
  const { selectedCurrency } = usePreferences();
  const [buyAgainPendingKey, setBuyAgainPendingKey] = useState<string | null>(null);

  const orderList = (orders as OrderRow[]) || [];

  if (orderList.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <Package className="w-16 h-16 text-gray-400 mx-auto" />
        <h2 className="text-xl font-bold text-gray-900">Você ainda não realizou compras</h2>
        <p className="text-xs text-gray-500">
          Aproveite os melhores preços com proteção Escrow e entrega rápida pela Nusali Logística.
        </p>
        <button
          onClick={() => navigate('/products')}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-6 py-2.5 rounded-xl text-xs transition"
        >
          Explorar Ofertas
        </button>
      </div>
    );
  }

  // Agrupamento SÓ frontend (buildPurchaseGroupIndex, pura e testada):
  // child orders com o mesmo purchaseGroupId ficam juntos; pedidos legado
  // (sem purchaseGroupId) nunca entram num group. A ordem original da lista
  // é preservada — o group aparece na posição do seu primeiro child.
  const { childrenByGroup, buyCount } = buildPurchaseGroupIndex(orderList);
  const seenGroups = new Set<string>();

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
          <Package className="w-7 h-7 text-emerald-600" /> Minhas Compras ({buyCount})
        </h1>
        <span className="text-xs text-emerald-700 font-bold bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5" /> Proteção Escrow Ativa
        </span>
      </div>

      <div className="space-y-4">
        {orderList.map((order) => {
          // Pedido legado: card individual, exatamente como antes.
          if (!order.purchaseGroupId) {
            return (
              <OrderCard
                key={order.id || order.orderNumber}
                order={order}
                fallbackCurrency={selectedCurrency}
                buyAgainPendingKey={buyAgainPendingKey}
                setBuyAgainPendingKey={setBuyAgainPendingKey}
              />
            );
          }

          // Compra multi-seller: renderiza o bloco do group INTEIRO na
          // posição do primeiro child; ignora os demais children (já vêm
          // dentro do bloco).
          if (seenGroups.has(order.purchaseGroupId)) return null;
          seenGroups.add(order.purchaseGroupId);

          const children = childrenByGroup.get(order.purchaseGroupId) || [order];
          const groupCurrency = children[0]?.currency || selectedCurrency || 'XOF';
          // Soma dos children — SÓ apresentação (o endpoint de lista não
          // devolve o total autoritativo do purchase_group; a tela de
          // confirmação, sim, via GET /buyer/purchase-groups/:id).
          const groupTotal = children.reduce((s, c) => s + Number(c.totalAmount ?? c.total ?? 0), 0);
          const sellerCount = children.length;
          const groupDate = children[0]?.createdAt;

          return (
            <div key={order.purchaseGroupId} className="rounded-2xl border-2 border-emerald-100 bg-emerald-50/30 p-3 sm:p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2 min-w-0">
                  <Layers className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-black text-gray-900">Compra multi-loja</p>
                    <p className="text-[10px] text-gray-500 font-mono truncate">Compra Nº {order.purchaseGroupId}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs shrink-0">
                  <span className="text-gray-600 font-semibold">
                    {sellerCount} {sellerCount === 1 ? 'pedido' : 'pedidos'}
                    {groupDate ? ` · ${new Date(groupDate).toLocaleDateString('pt-BR')}` : ''}
                  </span>
                  <span className="font-black text-gray-900">{formatCurrency(groupTotal, groupCurrency)}</span>
                  <button
                    onClick={() => navigate(`/purchase-groups/${order.purchaseGroupId}/confirmation`)}
                    className="text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-0.5 hover:underline cursor-pointer whitespace-nowrap"
                  >
                    Ver compra <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="rounded-xl overflow-hidden border border-emerald-100 bg-white">
                {children.map((child) => (
                  <OrderCard
                    key={child.id || child.orderNumber}
                    order={child}
                    fallbackCurrency={groupCurrency}
                    compact
                    buyAgainPendingKey={buyAgainPendingKey}
                    setBuyAgainPendingKey={setBuyAgainPendingKey}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
