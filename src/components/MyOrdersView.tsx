import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrders } from '../hooks/useOrders';
import { useCart } from '../hooks/useCart';
import { usePreferences } from '../context/PreferencesContext';
import { formatCurrency } from '../utils/currencyUtils';
import { Package, Truck, CheckCircle2, ChevronRight, Clock, RefreshCw, ShoppingBag, ShieldCheck } from 'lucide-react';

export const MyOrdersView: React.FC = () => {
  const navigate = useNavigate();
  const { data: orders = [] } = useOrders();
  const { addItem } = useCart();
  const { selectedCurrency, showToast } = usePreferences();
  // Correção pré-piloto (mesma race condition do ProductDetail): navegar
  // antes do addItem() (assíncrono) confirmar deixava o carrinho aparecer
  // vazio no primeiro clique.
  const [buyAgainPendingKey, setBuyAgainPendingKey] = useState<string | null>(null);

  if (orders.length === 0) {
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

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
          <Package className="w-7 h-7 text-emerald-600" /> Minhas Compras ({orders.length})
        </h1>
        <span className="text-xs text-emerald-700 font-bold bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5" /> Proteção Escrow Ativa
        </span>
      </div>

      <div className="space-y-4">
        {orders.map((order: any) => {
          const items = Array.isArray(order.items) ? order.items : [];
          const orderCurrency = order.currency || selectedCurrency || 'XOF';
          const orderTotal = Number(order.totalAmount ?? order.total ?? 0);

          return (
            <div
              key={order.id || order.orderNumber}
              className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs hover:shadow-md transition space-y-4"
            >
              {/* Header row */}
              <div className="bg-gray-50 p-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2">
                <div className="space-x-3">
                  <span className="font-bold text-gray-900">Pedido #{order.id || order.orderNumber}</span>
                  <span className="text-gray-500">Realizado em {order.createdAt ? new Date(order.createdAt).toLocaleDateString('pt-BR') : order.date || 'Recente'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-extrabold text-gray-900 text-sm">
                    Total: {formatCurrency(orderTotal, orderCurrency)}
                  </span>
                  <button
                    onClick={() => navigate(`/orders/${order.id || order.orderNumber}`)}
                    className="text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-0.5 hover:underline cursor-pointer"
                  >
                    Ver Detalhes <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Tracking Status */}
              <div className="px-6 space-y-3">
                {(() => {
                  const rawStatus = (order.shipment?.status || order.logisticsStatus || order.status || '').toUpperCase();
                  let statusText = 'Em preparação pela Nusali Logística';
                  if (rawStatus === 'DELIVERED') statusText = 'Entregue no destino';
                  else if (rawStatus === 'OUT_FOR_DELIVERY') statusText = 'Saiu para entrega';
                  else if (rawStatus === 'IN_TRANSIT') statusText = 'Em trânsito no centro logístico';
                  else if (rawStatus === 'SHIPPED') statusText = 'Despachado para transporte';
                  else if (rawStatus === 'READY_TO_SHIP') statusText = 'Aguardando expedição';

                  return (
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">
                      <Truck className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Status de Entrega: {statusText}</span>
                    </div>
                  );
                })()}

                {/* Items List */}
                <div className="divide-y divide-gray-100">
                  {items.map((item: any, idx: number) => {
                    const prod = item.product || item;
                    const title = item.productTitle || item.title || prod.title || 'Item do Pedido';
                    const image = item.productImage || item.image || prod.image || null;
                    const qty = item.quantity || 1;

                    return (
                      <div key={idx} className="py-3 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          {image ? (
                            <img
                              src={image}
                              alt=""
                              className="w-14 h-14 object-contain rounded-xl border border-gray-100 p-1 bg-gray-50 shrink-0"
                            />
                          ) : (
                            <div className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center border border-gray-200 shrink-0">
                              <Package className="w-6 h-6 text-gray-400" />
                            </div>
                          )}
                          <div>
                            <h4 className="text-xs font-bold text-gray-900 line-clamp-1">{title}</h4>
                            {(item.variantTitle || item.selectedColor || item.selectedSize || item.selectedVariantSku) && (
                              <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px]">
                                {item.variantTitle && (
                                  <span className="bg-gray-100 text-gray-800 font-semibold px-1.5 py-0.5 rounded">
                                    {item.variantTitle}
                                  </span>
                                )}
                              </div>
                            )}
                            <p className="text-[11px] text-gray-500 mt-0.5">
                              Quantidade: {qty}
                            </p>
                          </div>
                        </div>

                        {prod.id && (() => {
                          const pendingKey = `${order.id || order.orderNumber}_${idx}`;
                          const isPending = buyAgainPendingKey === pendingKey;
                          return (
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
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="p-4 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600">
                <span className="flex items-center gap-1 font-semibold text-emerald-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Devolução grátis em até 30 dias com Escrow
                </span>
                {(() => {
                  const tracking = order.trackingCode || order.shipment?.trackingNumber || null;
                  return (
                    <span className="font-mono text-gray-500">
                      Rastreio: {tracking ? <strong className="text-gray-900">{tracking}</strong> : 'Aguardando envio'}
                    </span>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};


