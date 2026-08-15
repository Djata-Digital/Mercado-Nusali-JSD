import React from 'react';
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
  const { selectedCurrency } = usePreferences();

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
          const orderTotal = Number(order.total || 0);

          return (
            <div
              key={order.id || order.orderNumber}
              className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs hover:shadow-md transition space-y-4"
            >
              {/* Header row */}
              <div className="bg-gray-50 p-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2">
                <div className="space-x-3">
                  <span className="font-bold text-gray-900">Pedido #{order.id || order.orderNumber}</span>
                  <span className="text-gray-500">Realizado em {order.date}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-extrabold text-gray-900 text-sm">
                    Total: {formatCurrency(orderTotal, orderCurrency)}
                  </span>
                  <button
                    onClick={() => navigate(`/orders/${order.id || order.orderNumber}`)}
                    className="text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-0.5 hover:underline"
                  >
                    Ver Detalhes <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Tracking Status */}
              <div className="px-6 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">
                  <Truck className="w-4 h-4 text-emerald-600" />
                  <span>Status de Entrega: {order.estimatedDelivery || 'Em preparação pela Nusali Logística'}</span>
                </div>

                {/* Items List */}
                <div className="divide-y divide-gray-100">
                  {items.map((item: any, idx: number) => {
                    const prod = item.product || item;
                    const title = prod.title || 'Produto Mercado Nusali';
                    const image = prod.image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=300';
                    const qty = item.quantity || 1;
                    const sellerName = prod.seller?.name || order.seller?.name || 'Vendedor Oficial Nusali';

                    return (
                      <div key={idx} className="py-3 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={image}
                            alt=""
                            className="w-14 h-14 object-contain rounded-xl border border-gray-100 p-1 bg-gray-50 shrink-0"
                          />
                          <div>
                            <h4 className="text-xs font-bold text-gray-900 line-clamp-1">{title}</h4>
                            {(item.selectedColor || item.selectedSize || item.selectedVariantSku) && (
                              <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px]">
                                {item.selectedColor && (
                                  <span className="bg-gray-100 text-gray-800 font-semibold px-1.5 py-0.5 rounded">
                                    Cor: <strong>{item.selectedColor}</strong>
                                  </span>
                                )}
                                {item.selectedSize && (
                                  <span className="bg-blue-50 text-blue-900 font-bold px-1.5 py-0.5 rounded">
                                    Tamanho: {item.selectedSize}
                                  </span>
                                )}
                                {item.selectedVariantSku && (
                                  <span className="bg-gray-800 text-white font-mono px-1.5 py-0.5 rounded">
                                    SKU: {item.selectedVariantSku}
                                  </span>
                                )}
                              </div>
                            )}
                            <p className="text-[11px] text-gray-500 mt-0.5">
                              Quantidade: {qty} | Vendido por {sellerName}
                            </p>
                          </div>
                        </div>

                        {prod.id && (
                          <button
                            onClick={() => {
                              addItem(prod, qty);
                              navigate('/cart');
                            }}
                            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold px-3 py-1.5 rounded-xl text-xs transition flex items-center gap-1 shrink-0 border border-emerald-200"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Comprar novamente</span>
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
                <span className="font-mono text-gray-500">Rastreio: {order.trackingCode || 'NSL-GW-89412-EXP'}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};


