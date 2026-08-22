import React from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useOrder } from '../hooks/useOrders';
import { OrderService } from '../services/orderService';
import { usePreferences } from '../context/PreferencesContext';
import { formatCurrency } from '../utils/currencyUtils';
import { PixPaymentModal } from './PixPaymentModal';
import { PaymentsApi } from '../api/clients/PaymentsApi';
import {
  CheckCircle2,
  Clock,
  Truck,
  Package,
  MapPin,
  ArrowRight,
  ShieldCheck,
  ShoppingBag,
  RefreshCw,
  AlertCircle,
  QrCode,
} from 'lucide-react';

export const OrderConfirmationView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = usePreferences();
  const [isConfirming, setIsConfirming] = React.useState(false);

  // PIX Modal state for pending orders
  const [isPixModalOpen, setIsPixModalOpen] = React.useState(false);
  const [pixData, setPixData] = React.useState<any>(null);
  const [isInitiatingPix, setIsInitiatingPix] = React.useState(false);

  // Fetch real order from API
  const { data: fetchedOrder, isLoading, error } = useOrder(id || '');

  // Navigation state fallback only if matching the requested ID
  const navStateOrder = (location.state as any)?.order;
  const activeOrder: any =
    fetchedOrder ||
    (navStateOrder && (navStateOrder.id === id || navStateOrder.orderNumber === id)
      ? navStateOrder
      : null);

  const handleOpenPixModal = async () => {
    if (!activeOrder?.id) return;
    setIsInitiatingPix(true);
    try {
      const res = await PaymentsApi.initiate({
        orderId: activeOrder.id,
        method: 'pix',
        provider: 'asaas',
      });
      if (res.success && res.data) {
        setPixData(res.data);
        setIsPixModalOpen(true);
      } else {
        showToast(res.error?.message || res.message || 'Falha ao buscar QR Code PIX.');
      }
    } catch (err: any) {
      showToast(err?.message || 'Erro ao carregar PIX.');
    } finally {
      setIsInitiatingPix(false);
    }
  };

  const handlePixSuccess = () => {
    setIsPixModalOpen(false);
    showToast('Pagamento confirmado com sucesso!');
    queryClient.invalidateQueries({ queryKey: ['order', activeOrder?.id] });
    queryClient.invalidateQueries({ queryKey: ['orders'] });
  };

  const handleConfirmDelivery = async () => {
    if (!activeOrder?.id) return;
    setIsConfirming(true);
    try {
      const res = await OrderService.confirmOrderReceipt(activeOrder.id);
      if (res.success) {
        showToast('Recebimento confirmado e garantia Escrow liberada com sucesso!');
        queryClient.invalidateQueries({ queryKey: ['order', activeOrder.id] });
        queryClient.invalidateQueries({ queryKey: ['orders'] });
      } else {
        showToast(res.message || 'Falha ao confirmar recebimento.');
      }
    } catch (err: any) {
      showToast(err?.message || 'Erro ao comunicar com o servidor.');
    } finally {
      setIsConfirming(false);
    }
  };

  if (isLoading && !activeOrder) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <RefreshCw className="w-10 h-10 text-emerald-600 animate-spin mx-auto" />
        <p className="text-sm font-semibold text-gray-600">Carregando detalhes do pedido...</p>
      </div>
    );
  }

  if (!activeOrder) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <Package className="w-16 h-16 text-gray-400 mx-auto" />
        <h2 className="text-xl font-bold text-gray-900">Pedido não encontrado</h2>
        <p className="text-sm text-gray-500">
          {error
            ? (error as any)?.message || 'Ocorreu um erro ao buscar as informações deste pedido.'
            : 'O pedido solicitado não existe ou não pertence a esta conta.'}
        </p>
        <button
          onClick={() => navigate('/orders')}
          className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-6 py-2.5 rounded-xl text-xs shadow-xs transition"
        >
          Ver Minhas Compras
        </button>
      </div>
    );
  }

  // Single Source of Truth for Currency & Amounts
  const orderCurrency = activeOrder.currency || 'XOF';
  const subtotal = Number(activeOrder.subtotal || 0);
  const shippingFee = Number(activeOrder.shippingFee || 0);
  const discountAmount = Number(activeOrder.discountAmount || 0);
  const totalAmount = Number(activeOrder.totalAmount || activeOrder.total || 0);

  // Status flags
  const isPaid = activeOrder.paymentStatus === 'paid';
  const isCancelled = activeOrder.status === 'cancelled' || activeOrder.paymentStatus === 'failed';

  // Address Snapshot
  const address = activeOrder.shippingAddressJson || activeOrder.shippingAddress || activeOrder.deliveryAddress || {};
  const recipientName = address.recipientName || '';
  const streetLine = [address.street, address.number].filter(Boolean).join(', ') + (address.complement ? ` - ${address.complement}` : '');
  const neighborhoodCityLine = [address.neighborhood, address.city, address.state].filter(Boolean).join(' - ');
  const countryZipLine = [
    address.zipCode ? `CEP: ${address.zipCode}` : '',
    address.countryCode || address.country ? `País: ${address.countryCode || address.country}` : '',
    address.phone ? `Tel: ${address.phone}` : '',
  ].filter(Boolean).join(' | ');

  // Payment Method
  const rawPaymentMethod = activeOrder.paymentMethod ? String(activeOrder.paymentMethod).toLowerCase() : null;
  const formattedPaymentMethod = rawPaymentMethod ? rawPaymentMethod.replace('_', ' ').toUpperCase() : 'Não selecionado';

  // Shipment & Tracking (Strictly real backend data)
  const shipment = activeOrder.shipment || (activeOrder.shipments && activeOrder.shipments[0]) || null;
  const trackingCode = activeOrder.trackingCode || shipment?.trackingNumber || null;
  const carrierName = activeOrder.carrier || shipment?.carrier || null;

  const rawLogisticsStatus = shipment?.status || activeOrder.logisticsStatus || activeOrder.status || 'PREPARING';
  const logisticsStatusUpper = String(rawLogisticsStatus).toUpperCase();

  const getLogisticsBadgeText = (st: string) => {
    switch (st) {
      case 'DELIVERED':
        return 'Entregue no destino';
      case 'OUT_FOR_DELIVERY':
        return 'Saiu para entrega ao destinatário';
      case 'IN_TRANSIT':
        return 'Em trânsito no centro logístico';
      case 'SHIPPED':
        return 'Despachado para transporte';
      case 'READY_TO_SHIP':
        return 'Aguardando expedição';
      default:
        return 'Em preparação no vendedor';
    }
  };

  // Items
  const orderItems = Array.isArray(activeOrder.items) ? activeOrder.items : [];

  // Timeline Step Calculations
  const isSeparationDone = isPaid && [
    'READY_TO_SHIP', 'SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED',
    'PROCESSING', 'PAID', 'DELIVERY_FAILED'
  ].includes(logisticsStatusUpper);

  const isDispatchDone = ['SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(logisticsStatusUpper);

  const isDeliveredDone = logisticsStatusUpper === 'DELIVERED' || activeOrder.status === 'delivered';

  let transitStepTitle = 'Em Trânsito';
  let transitStepDesc = carrierName || 'Operação logística';
  if (logisticsStatusUpper === 'SHIPPED') {
    transitStepTitle = 'Despachado';
    transitStepDesc = 'Pacote enviado para transporte';
  } else if (logisticsStatusUpper === 'IN_TRANSIT') {
    transitStepTitle = 'Em Trânsito';
    transitStepDesc = 'Em transporte no centro logístico';
  } else if (logisticsStatusUpper === 'OUT_FOR_DELIVERY') {
    transitStepTitle = 'Saiu p/ Entrega';
    transitStepDesc = 'Saiu para entrega ao destinatário';
  } else if (logisticsStatusUpper === 'DELIVERED') {
    transitStepTitle = 'Transporte Concluído';
    transitStepDesc = 'Entregue no destino';
  }

  const timelineSteps = [
    {
      title: 'Pedido Criado',
      description: `Registrado em ${new Date(activeOrder.createdAt || Date.now()).toLocaleDateString('pt-BR')}`,
      completed: true,
    },
    {
      title: isPaid ? 'Pagamento Confirmado' : 'Aguardando Pagamento',
      description: isPaid ? 'Transação confirmada' : 'Aguardando processamento do pagamento',
      completed: isPaid,
    },
    {
      title: 'Em Separação',
      description: 'Vendedor preparando a embalagem',
      completed: isSeparationDone,
    },
    {
      title: transitStepTitle,
      description: transitStepDesc,
      completed: isDispatchDone,
    },
    {
      title: 'Entregue',
      description: isDeliveredDone
        ? (shipment?.receivedBy ? `Recebido por: ${shipment.receivedBy}` : 'Entregue com sucesso')
        : 'Confirmação de recebimento',
      completed: isDeliveredDone,
    },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Pix Modal for Pending Payment */}
      <PixPaymentModal
        isOpen={isPixModalOpen}
        onClose={() => setIsPixModalOpen(false)}
        orderId={activeOrder?.id || ''}
        paymentData={pixData}
        onPaymentSuccess={handlePixSuccess}
      />

      {/* Banner Component (State Dependent) */}
      {isCancelled ? (
        <div className="bg-red-600 text-white rounded-2xl p-6 sm:p-8 shadow-md text-center space-y-3">
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto ring-8 ring-white/10">
            <AlertCircle className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black">Pedido Cancelado</h1>
          <p className="text-sm font-medium text-red-100 max-w-xl mx-auto">
            Código do pedido: <strong className="text-white font-extrabold">{activeOrder.orderNumber || activeOrder.id}</strong>
          </p>
        </div>
      ) : isPaid ? (
        <div className="bg-emerald-600 text-white rounded-2xl p-6 sm:p-8 shadow-md text-center space-y-3 animate-fadeIn">
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto ring-8 ring-white/10">
            <CheckCircle2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black">Pagamento Aprovado com Sucesso!</h1>
          <p className="text-sm font-medium text-emerald-100 max-w-xl mx-auto">
            Obrigado pela sua compra! Código do pedido: <strong className="text-yellow-300 font-extrabold">{activeOrder.orderNumber || activeOrder.id}</strong>
          </p>
          <div className="inline-flex items-center gap-2 bg-emerald-700/80 px-4 py-1.5 rounded-full text-xs font-semibold text-emerald-100">
            <ShieldCheck className="w-3.5 h-3.5 text-yellow-300" />
            <span>Pagamento sob Garantia Escrow Nusali</span>
          </div>
        </div>
      ) : (
        <div className="bg-slate-800 text-white rounded-2xl p-6 sm:p-8 shadow-md text-center space-y-4 animate-fadeIn">
          <div className="w-14 h-14 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto ring-8 ring-amber-500/10">
            <Clock className="w-8 h-8 text-amber-400" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black">Pedido Criado com Sucesso!</h1>
          <p className="text-sm font-medium text-slate-300 max-w-xl mx-auto">
            Seu pedido <strong className="text-amber-400 font-extrabold">#{activeOrder.orderNumber || activeOrder.id}</strong> foi registrado e aguarda o pagamento.
          </p>
          <div className="inline-flex items-center gap-2 bg-amber-500/20 px-4 py-1.5 rounded-full text-xs font-semibold text-amber-300 border border-amber-500/30">
            <Clock className="w-3.5 h-3.5" />
            <span>Status: Pagamento Pendente ({formattedPaymentMethod})</span>
          </div>

          {/* Pending PIX button if order uses PIX */}
          {rawPaymentMethod === 'pix' && (
            <div className="pt-2">
              <button
                type="button"
                onClick={handleOpenPixModal}
                disabled={isInitiatingPix}
                className="bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold px-6 py-3 rounded-xl text-sm shadow-md transition inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <QrCode className="w-5 h-5" />
                <span>{isInitiatingPix ? 'Carregando PIX...' : 'PAGAR COM PIX / VER QR CODE'}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Container */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-6">
        {/* Logistics & Tracking Section (Strictly Real) */}
        <div className="border-b border-gray-100 pb-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Truck className="w-5 h-5 text-emerald-600" /> Acompanhamento de Envio
              </h2>
              {trackingCode ? (
                <p className="text-xs text-gray-500 mt-0.5">
                  {carrierName ? <>Transportadora: <strong>{carrierName}</strong> | </> : null}
                  Código de Rastreio:{' '}
                  <span className="font-mono font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                    {trackingCode}
                  </span>
                </p>
              ) : (
                <p className="text-xs text-gray-500 mt-0.5">
                  Status da Logística:{' '}
                  <span className="font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    {getLogisticsBadgeText(logisticsStatusUpper)}
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* Timeline Steps */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-2">
            {timelineSteps.map((step, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-xl border text-xs space-y-1 transition ${
                  step.completed
                    ? 'border-emerald-500 bg-emerald-50/70 text-emerald-950 font-bold'
                    : 'border-gray-200 bg-gray-50 text-gray-400'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider">Etapa 0{idx + 1}</span>
                  {step.completed && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                </div>
                <p className="text-xs font-bold leading-tight">{step.title}</p>
                <p className="text-[11px] font-normal text-gray-500 line-clamp-2">{step.description}</p>
              </div>
            ))}
          </div>

          {/* Real Tracking Events History */}
          {shipment?.trackingEvents && shipment.trackingEvents.length > 0 && (
            <div className="bg-gray-50/70 p-4 rounded-xl border border-gray-200/70 space-y-3 mt-4">
              <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5 uppercase tracking-wider">
                <Clock className="w-4 h-4 text-emerald-600" /> Histórico de Rastreamento Real
              </h4>
              <div className="space-y-2 text-xs">
                {shipment.trackingEvents.map((evt: any, idx: number) => (
                  <div key={idx} className="flex items-start gap-3 bg-white p-2.5 rounded-lg border border-gray-100 shadow-2xs">
                    <div className="w-2 h-2 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                    <div className="flex-1 space-y-0.5">
                      <div className="flex items-center justify-between font-bold text-gray-900">
                        <span>{evt.status} — {evt.description}</span>
                        <span className="text-[10px] text-gray-500 font-normal">
                          {new Date(evt.eventTime || evt.createdAt).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      {evt.location && <p className="text-[11px] text-gray-600">Localização: {evt.location}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Buyer Confirm Receipt Banner (Requirement 5) */}
          {isDeliveredDone && activeOrder.escrowStatus !== 'released' && (
            <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 mt-4">
              <div className="space-y-1 text-center sm:text-left">
                <p className="font-extrabold text-emerald-950 text-sm">Seu pedido já foi entregue!</p>
                <p className="text-xs text-emerald-800">
                  Confirme o recebimento para que o valor retido em garantia Escrow seja liberado ao vendedor.
                </p>
              </div>
              <button
                onClick={handleConfirmDelivery}
                disabled={isConfirming}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-6 py-2.5 rounded-xl text-xs shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
              >
                <CheckCircle2 className="w-4 h-4" />
                {isConfirming ? 'Confirmando...' : 'Confirmar Recebimento'}
              </button>
            </div>
          )}
        </div>

        {/* Purchased Items List */}
        {orderItems.length > 0 && (
          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-bold text-gray-900 flex items-center gap-1.5 uppercase tracking-wider">
              <ShoppingBag className="w-4 h-4 text-emerald-600" /> Itens do Pedido ({orderItems.length})
            </h3>
            <div className="divide-y divide-gray-100 bg-gray-50/70 rounded-xl p-3 border border-gray-200/70 space-y-2">
              {orderItems.map((item: any, idx: number) => {
                const title = item.productTitle || item.title || item.product?.title || 'Item do Pedido';
                const image = item.productImage || item.image || item.product?.image || null;
                const price = Number(item.unitPrice || item.price || 0);
                const qty = Number(item.quantity || 1);
                const variantTitle = item.variantTitle || null;

                return (
                  <div key={idx} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-3">
                      {image ? (
                        <img
                          src={image}
                          alt={title}
                          className="w-12 h-12 object-contain rounded-lg border border-gray-200 bg-white p-1 shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center border border-gray-200 shrink-0">
                          <Package className="w-6 h-6 text-gray-400" />
                        </div>
                      )}
                      <div>
                        <p className="font-bold text-gray-900 line-clamp-1">{title}</p>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500 mt-0.5">
                          <span>Qtd: <strong>{qty}</strong></span>
                          <span>Preço Un: <strong>{formatCurrency(price, orderCurrency)}</strong></span>
                          {variantTitle && (
                            <span className="bg-gray-200/80 px-1.5 py-0.5 rounded text-gray-700 font-medium">
                              {variantTitle}
                            </span>
                          )}
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

        {/* Destination & Payment Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-gray-100 text-xs">
          {/* Destination Address (Strictly Real) */}
          <div className="space-y-2 bg-gray-50 p-4 rounded-xl border border-gray-200/70">
            <h3 className="font-bold text-gray-900 flex items-center gap-1.5 uppercase tracking-wider">
              <MapPin className="w-4 h-4 text-emerald-600" /> Endereço de Entrega
            </h3>
            {recipientName && <p className="font-bold text-gray-900">{recipientName}</p>}
            {streetLine ? (
              <>
                <p className="text-gray-700">{streetLine}</p>
                {neighborhoodCityLine && <p className="text-gray-600">{neighborhoodCityLine}</p>}
                {countryZipLine && <p className="text-gray-500 text-[11px] font-medium">{countryZipLine}</p>}
              </>
            ) : (
              <p className="text-gray-500 italic">Endereço de entrega registrado no pedido.</p>
            )}
          </div>

          {/* Payment & Financial Totals (Strictly Real) */}
          <div className="space-y-2 bg-gray-50 p-4 rounded-xl border border-gray-200/70">
            <h3 className="font-bold text-gray-900 flex items-center gap-1.5 uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4 text-emerald-600" /> Resumo Financeiro
            </h3>
            <div className="space-y-1 text-gray-600">
              <p className="flex justify-between">
                <span>Método de Pagamento:</span>
                <strong className="text-gray-900 font-bold">{formattedPaymentMethod}</strong>
              </p>
              <p className="flex justify-between">
                <span>Status do Pagamento:</span>
                <strong className={`font-bold ${isPaid ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {isPaid ? 'Pago' : 'Pendente'}
                </strong>
              </p>
              <p className="flex justify-between pt-1 border-t border-gray-200">
                <span>Subtotal:</span>
                <span>{formatCurrency(subtotal, orderCurrency)}</span>
              </p>
              <p className="flex justify-between">
                <span>Frete:</span>
                <span>{shippingFee > 0 ? formatCurrency(shippingFee, orderCurrency) : 'Grátis'}</span>
              </p>
              {discountAmount > 0 && (
                <p className="flex justify-between text-emerald-700">
                  <span>Desconto:</span>
                  <span>- {formatCurrency(discountAmount, orderCurrency)}</span>
                </p>
              )}
              <p className="flex justify-between text-sm font-extrabold text-gray-900 pt-2 border-t border-gray-200">
                <span>Total do Pedido:</span>
                <span className="text-emerald-700">{formatCurrency(totalAmount, orderCurrency)}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
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


