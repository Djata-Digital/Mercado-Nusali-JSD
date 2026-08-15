import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useOrder, useOrders } from '../hooks/useOrders';
import { usePreferences } from '../context/PreferencesContext';
import { formatCurrency } from '../utils/currencyUtils';
import {
  CheckCircle2,
  Truck,
  Package,
  MapPin,
  ArrowRight,
  ShieldCheck,
  Globe,
  Lock,
  ShoppingBag,
} from 'lucide-react';

export const OrderConfirmationView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { selectedCurrency } = usePreferences();
  const { data: fetchedOrder } = useOrder(id || '');
  const { data: orders = [] } = useOrders();

  const activeOrder: any = fetchedOrder || orders.find((o: any) => o.id === id || o.orderNumber === id) || orders[0];

  if (!activeOrder) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <Package className="w-16 h-16 text-gray-400 mx-auto" />
        <h2 className="text-xl font-bold text-gray-900">Nenhum pedido recente encontrado</h2>
        <p className="text-sm text-gray-500">
          Você pode navegar pelo catálogo e realizar seu primeiro pedido com garantia Escrow.
        </p>
        <button
          onClick={() => navigate('/')}
          className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-6 py-2.5 rounded-xl text-xs shadow-sm transition"
        >
          Ir para a página inicial
        </button>
      </div>
    );
  }

  // Safe tracking steps normalizer
  const trackingSteps = (Array.isArray(activeOrder.trackingSteps) && activeOrder.trackingSteps.length > 0)
    ? activeOrder.trackingSteps
    : (Array.isArray(activeOrder.trackingEvents) && activeOrder.trackingEvents.length > 0)
      ? activeOrder.trackingEvents.map((evt: any) => ({
          status: evt.status || 'confirmed',
          title: evt.status || 'Em Processamento',
          description: evt.location || evt.date || 'HUB Nusali Logística',
          timestamp: evt.date || 'Hoje',
          completed: Boolean(evt.done ?? evt.completed ?? true),
        }))
      : [
          {
            status: 'confirmed',
            title: 'Pedido Confirmado',
            description: 'Pagamento retido com segurança no Escrow Nusali',
            timestamp: activeOrder.date || 'Hoje',
            completed: true,
          },
          {
            status: 'preparing',
            title: 'Em Separação no HUB Nusali',
            description: 'Vendedor preparando embalagem com selo de garantia',
            timestamp: 'Em andamento',
            completed: activeOrder.status !== 'confirmed' && activeOrder.status !== 'pending',
          },
          {
            status: 'shipped',
            title: 'Em Trânsito com Nusali Express',
            description: 'Despachado para o endereço de destino',
            timestamp: 'A caminho',
            completed: ['shipped', 'in_customs', 'out_for_delivery', 'delivered'].includes(activeOrder.status),
          },
          {
            status: 'out_for_delivery',
            title: 'Saiu para Entrega ao Destinatário',
            description: 'Entregador da Nusali Logística em rota',
            timestamp: 'Em breve',
            completed: ['out_for_delivery', 'delivered'].includes(activeOrder.status),
          },
          {
            status: 'delivered',
            title: 'Entrega Concluída & Liberação Escrow',
            description: 'Pedido entregue com sucesso e saldo liberado',
            timestamp: 'Final',
            completed: activeOrder.status === 'delivered',
          },
        ];

  // Address normalizer
  const address = activeOrder.deliveryAddress || {};
  const recipientName = address.recipientName || 'Alex Silva';
  const streetLine = [address.street, address.number].filter(Boolean).join(', ') + (address.complement ? ` - ${address.complement}` : '');
  const cityLine = [address.neighborhood, address.city, address.state].filter(Boolean).join(' - ');
  const countryZipLine = [address.zipCode ? `CEP: ${address.zipCode}` : '', address.country ? `País: ${address.country}` : '', address.phone ? `Tel: ${address.phone}` : ''].filter(Boolean).join(' | ');

  // Payment normalizer
  const paymentMethod = typeof activeOrder.paymentDetails === 'object' && activeOrder.paymentDetails?.method
    ? activeOrder.paymentDetails.method
    : (activeOrder.paymentMethod || 'Orange Money Bissau');

  const orderCurrency = activeOrder.currency || activeOrder.paymentDetails?.currency || selectedCurrency || 'XOF';
  const orderTotal = Number(activeOrder.total || activeOrder.totalAmount || 0);

  // Items normalizer
  const orderItems = Array.isArray(activeOrder.items) ? activeOrder.items : [];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Success Banner */}
      <div className="bg-emerald-600 text-white rounded-2xl p-6 sm:p-8 shadow-md text-center space-y-3 animate-fadeIn">
        <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto ring-8 ring-white/10">
          <CheckCircle2 className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-black">Pagamento Aprovado com Sucesso!</h1>
        <p className="text-sm font-medium text-emerald-100 max-w-xl mx-auto">
          Obrigado pela sua compra! Código do pedido: <strong className="text-yellow-300 font-extrabold">{activeOrder.id || activeOrder.orderNumber}</strong>
        </p>
        <div className="inline-flex items-center gap-2 bg-emerald-700/80 px-4 py-1.5 rounded-full text-xs font-semibold text-emerald-100">
          <Lock className="w-3.5 h-3.5 text-yellow-300" />
          <span>Valor protegido no Sistema Escrow Nusali até a confirmação de entrega</span>
        </div>
      </div>

      {/* Shipment Live Tracker Timeline */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
          <div>
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Truck className="w-5 h-5 text-emerald-600" /> Acompanhamento de Envio Nusali Logística
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Código de Rastreio:{' '}
              <span className="font-mono font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                {activeOrder.trackingCode || 'NSL-GW-89412-EXP'}
              </span>
            </p>
          </div>

          <span className="text-xs font-extrabold text-emerald-800 bg-emerald-50 px-3.5 py-1.5 rounded-full border border-emerald-200 shrink-0">
            Previsão: {activeOrder.estimatedDelivery || '1 a 2 dias úteis'}
          </span>
        </div>

        {/* Tracking Steps Bar */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            {trackingSteps.map((step: any, idx: number) => (
              <div
                key={idx}
                className={`p-3 rounded-xl border text-xs space-y-1 relative transition ${
                  step.completed
                    ? 'border-emerald-500 bg-emerald-50/70 text-emerald-950 font-bold shadow-xs'
                    : 'border-gray-200 bg-gray-50 text-gray-400'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider">{step.timestamp}</span>
                  {step.completed && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                </div>
                <p className="text-xs font-bold leading-tight">{step.title}</p>
                <p className="text-[11px] font-normal text-gray-600 line-clamp-2">{step.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Purchased Items Preview */}
        {orderItems.length > 0 && (
          <div className="space-y-3 pt-4 border-t border-gray-100">
            <h3 className="text-xs font-bold text-gray-900 flex items-center gap-1.5 uppercase tracking-wider">
              <ShoppingBag className="w-4 h-4 text-emerald-600" /> Itens Comprados ({orderItems.length})
            </h3>
            <div className="divide-y divide-gray-100 bg-gray-50/70 rounded-xl p-3 border border-gray-200/70">
              {orderItems.map((item: any, idx: number) => {
                const prod = item.product || item;
                const title = prod.title || 'Produto Mercado Nusali';
                const image = prod.image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=300';
                const price = Number(item.unitPrice || item.unitPriceOverride || prod.price || 0);
                const qty = item.quantity || 1;
                const kitTitle = item.kit?.title || item.selectedKit?.title;
                const color = item.color || item.selectedColor;
                const size = item.size || item.selectedSize;

                return (
                  <div key={idx} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-3">
                      <img
                        src={image}
                        alt={title}
                        className="w-12 h-12 object-contain rounded-lg border border-gray-200 bg-white p-1 shrink-0"
                      />
                      <div>
                        <p className="font-bold text-gray-900 line-clamp-1">{title}</p>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500 mt-0.5">
                          <span>Qtd: <strong>{qty}</strong></span>
                          {color && <span className="bg-gray-200/80 px-1.5 py-0.5 rounded text-gray-700">Cor: {color}</span>}
                          {size && <span className="bg-gray-200/80 px-1.5 py-0.5 rounded text-gray-700">Tam: {size}</span>}
                          {kitTitle && <span className="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">{kitTitle}</span>}
                        </div>
                      </div>
                    </div>
                    <span className="font-extrabold text-gray-900 shrink-0">
                      {formatCurrency(price * qty, orderCurrency)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Order Details & Destination Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-gray-100 text-xs">
          {/* Destination */}
          <div className="space-y-2 bg-gray-50 p-4 rounded-xl border border-gray-200/70">
            <h3 className="font-bold text-gray-900 flex items-center gap-1.5 uppercase tracking-wider">
              <MapPin className="w-4 h-4 text-emerald-600" /> Endereço de Entrega
            </h3>
            <p className="font-semibold text-gray-900">{recipientName}</p>
            {streetLine && <p className="text-gray-600">{streetLine}</p>}
            {cityLine && <p className="text-gray-600">{cityLine}</p>}
            {countryZipLine && <p className="text-gray-500 text-[11px] font-medium">{countryZipLine}</p>}
          </div>

          {/* Payment & Totals */}
          <div className="space-y-2 bg-gray-50 p-4 rounded-xl border border-gray-200/70">
            <h3 className="font-bold text-gray-900 flex items-center gap-1.5 uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4 text-emerald-600" /> Detalhes do Pagamento & Escrow
            </h3>
            <p className="text-gray-600">
              Método: <strong className="text-gray-900 uppercase font-bold">{String(paymentMethod).replace('_', ' ')}</strong>
            </p>
            <p className="text-gray-600">
              Status Escrow: <span className="font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">Protegido & Retido</span>
            </p>

            {(String(paymentMethod).toLowerCase().includes('pix') || activeOrder.paymentDetails?.method === 'pix') && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] space-y-1 text-emerald-950">
                <div className="flex items-center justify-between font-bold">
                  <span>⚡ Comprovante Pix Banco Central</span>
                  <span className="text-[10px] bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded">Liquidado</span>
                </div>
                <div className="font-mono text-[10px] text-gray-600">
                  <span>Chave Pix: </span>
                  <strong className="text-gray-900">48.291.042/0001-89</strong>
                </div>
                {activeOrder.paymentDetails?.transactionRef && (
                  <div className="font-mono text-[10px] text-gray-600 truncate">
                    <span>Autenticação: </span>
                    <strong className="text-emerald-800">{activeOrder.paymentDetails.transactionRef}</strong>
                  </div>
                )}
              </div>
            )}

            <p className="text-gray-600 pt-1 border-t border-gray-200 flex items-center justify-between">
              <span>Total Pago:</span>
              <strong className="text-gray-900 text-base font-black">
                {formatCurrency(orderTotal, orderCurrency)}
              </strong>
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="pt-4 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            onClick={() => navigate('/orders')}
            className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-6 py-2.5 rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-xs"
          >
            <span>Ver Minhas Compras</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            onClick={() => navigate('/')}
            className="w-full sm:w-auto bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold px-6 py-2.5 rounded-xl text-xs transition"
          >
            Continuar Comprando
          </button>
        </div>
      </div>
    </div>
  );
};

