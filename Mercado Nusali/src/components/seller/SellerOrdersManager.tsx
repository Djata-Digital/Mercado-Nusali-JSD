import React, { useState } from 'react';
import {
  ShoppingBag,
  Search,
  Filter,
  Printer,
  Truck,
  CheckCircle2,
  Clock,
  Lock,
  DollarSign,
  AlertCircle,
  ChevronRight,
  MapPin,
  Phone,
  Mail,
  User,
  X,
  ShieldCheck,
  FileText,
  CreditCard,
  AlertTriangle,
} from 'lucide-react';
import { SellerOrderData } from '../../data/mockSellerData';
import { CurrencyCode } from '../../types';
import { formatCurrency, countriesConfig } from '../../utils/currencyUtils';
import { SellerService } from '../../services/sellerService';
import { ShippingLabelModal, ShippingLabelData } from '../common/ShippingLabelModal';

interface SellerOrdersManagerProps {
  orders: SellerOrderData[];
  selectedCurrency: CurrencyCode;
  showToast: (msg: string) => void;
  onRefreshOrders?: () => void;
}

export const SellerOrdersManager: React.FC<SellerOrdersManagerProps> = ({
  orders,
  selectedCurrency,
  showToast,
  onRefreshOrders,
}) => {
  const [activeTab, setActiveTab] = useState<'todos' | 'preparacao' | 'enviados' | 'entregues'>('todos');
  const [selectedOrder, setSelectedOrder] = useState<SellerOrderData | null>(null);
  const [activeLabelData, setActiveLabelData] = useState<ShippingLabelData | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);

  const handleUpdateStatus = async (orderId: string, newStatus: string) => {
    setIsUpdatingStatus(orderId);
    try {
      const res = await SellerService.updateOrderStatus(orderId, { status: newStatus });
      if (res.success) {
        showToast('Status do pedido e saída física de estoque atualizados!');
        if (onRefreshOrders) onRefreshOrders();
      } else {
        showToast(res.message || 'Erro ao atualizar status do pedido.');
      }
    } catch (err: any) {
      showToast(err?.message || 'Erro ao atualizar status do pedido.');
    } finally {
      setIsUpdatingStatus(null);
    }
  };

  const getOrderLabelData = (ord: SellerOrderData): ShippingLabelData | null => {
    if (!ord.trackingCode) return null;
    const recipientAddr = typeof (ord as any).shippingAddressJson === 'object'
      ? (ord as any).shippingAddressJson
      : null;

    return {
      shipmentId: (ord as any).shipmentId || `shp_${ord.id}`,
      trackingNumber: ord.trackingCode,
      orderNumber: ord.orderNumber,
      carrier: ord.shippingCarrier || null,
      fulfillmentMode: (ord as any).fulfillmentMode || 'SELLER_FULFILLMENT',
      productTitle: `${ord.productTitle}${
        ord.selectedColor || ord.selectedSize
          ? ` (${[ord.selectedColor && `Cor: ${ord.selectedColor}`, ord.selectedSize && `Tam/Cap: ${ord.selectedSize}`].filter(Boolean).join(', ')})`
          : ''
      }`,
      quantity: ord.quantity,
      weight: (ord as any).weightKg ? `${(ord as any).weightKg} kg` : null,
      recipientName: recipientAddr?.recipientName || recipientAddr?.fullName || ord.buyerName || 'Não informado',
      recipientAddress: {
        street: recipientAddr?.street || ord.deliveryAddress || null,
        number: recipientAddr?.number || null,
        complement: recipientAddr?.complement || null,
        neighborhood: recipientAddr?.neighborhood || null,
        city: recipientAddr?.city || ord.deliveryCity || null,
        state: recipientAddr?.state || null,
        countryCode: recipientAddr?.countryCode || ord.buyerCountry || null,
        phone: recipientAddr?.phone || ord.buyerPhone || null,
      },
      senderName: ord.storeName || 'Loja Vendedor',
      senderAddress: {
        street: (ord as any).senderAddress?.street || null,
        city: (ord as any).senderAddress?.city || null,
        countryCode: (ord as any).senderAddress?.countryCode || null,
        phone: (ord as any).senderAddress?.phone || null,
      },
    };
  };

  const filteredOrders = orders.filter((o) => {
    if (activeTab === 'preparacao') return o.status === 'preparing';
    if (activeTab === 'enviados') return o.status === 'shipped';
    if (activeTab === 'entregues') return o.status === 'delivered';
    return true;
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-emerald-700" /> Pedidos de Venda ({orders.length})
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Processe pedidos, imprima etiquetas de envio e acompanhe o status de liberação do saldo Escrow.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-gray-200 p-2 shadow-2xs overflow-x-auto">
        <div className="flex items-center gap-2 text-xs font-bold">
          {[
            { id: 'todos', label: 'Todos os Pedidos', count: orders.length },
            { id: 'preparacao', label: 'Em Separação / Embalagem', count: orders.filter((o) => o.status === 'preparing').length },
            { id: 'enviados', label: 'Em Trânsito / Enviados', count: orders.filter((o) => o.status === 'shipped').length },
            { id: 'entregues', label: 'Concluídos & Entregues' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`px-4 py-2 rounded-xl transition whitespace-nowrap flex items-center gap-2 ${
                activeTab === t.id
                  ? 'bg-emerald-600 text-white shadow-xs font-black'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span>{t.label}</span>
              {t.count !== undefined && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                    activeTab === t.id ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Orders List Cards */}
      <div className="space-y-4">
        {filteredOrders.length === 0 ? (
          <div className="p-12 text-center text-gray-500 font-bold bg-white rounded-2xl border border-gray-200">
            Nenhum pedido encontrado
          </div>
        ) : (
          filteredOrders.map((ord) => {
          const countryConf = countriesConfig[ord.buyerCountry] || countriesConfig.GW;

          return (
            <div
              key={ord.id}
              className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs hover:border-emerald-500 transition space-y-4"
            >
              {/* Order Header Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-black text-gray-900 font-mono text-sm">{ord.orderNumber}</span>
                  <span className="text-gray-400">• {ord.createdAt}</span>
                  <span className="bg-gray-100 text-gray-800 font-bold px-2 py-0.5 rounded-md text-[10px]">
                    {ord.storeName}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`border text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                    ord.paymentStatus === 'paid'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200'
                  }`}>
                    {ord.paymentStatus === 'paid' ? <ShieldCheck className="w-3 h-3 text-emerald-600" /> : <Clock className="w-3 h-3 text-amber-600" />}
                    Pagamento: {ord.paymentStatus === 'paid' ? 'Pago' : 'Aguardando Pagamento'}
                  </span>
                  <span className="bg-blue-50 text-blue-800 border border-blue-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <Lock className="w-3 h-3 text-blue-600" /> Escrow: {ord.escrowStatus === 'retained' || ord.escrowStatus === 'held' ? 'Saldo Retido' : 'Liberando'}
                  </span>
                </div>
              </div>

              {/* Product & Buyer Body */}
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs">
                <div className="flex items-start gap-4">
                  <img
                    src={ord.selectedVariantImage || ord.productImage}
                    alt=""
                    className="w-18 h-18 rounded-xl object-contain border border-gray-200 p-1 bg-white shrink-0 shadow-2xs"
                  />
                  <div className="space-y-1.5">
                    <h3 className="font-bold text-sm text-gray-900">{ord.productTitle}</h3>
                    
                    {/* Explicit Variant Details Box for Seller Picking */}
                    {(ord.selectedColor || ord.selectedSize || ord.selectedVariantSku) && (
                      <div className="p-2 bg-amber-50/80 border border-amber-200 rounded-xl space-y-1">
                        <div className="flex items-center gap-1.5 text-amber-900 font-extrabold text-[11px]">
                          <span>📦 Opção Comprada pelo Cliente:</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          {ord.selectedColor && (
                            <span className="bg-white border border-amber-300 text-gray-900 px-2 py-0.5 rounded-md font-bold flex items-center gap-1">
                              🎨 Cor: <strong>{ord.selectedColor}</strong>
                            </span>
                          )}
                          {ord.selectedSize && (
                            <span className="bg-blue-50 border border-blue-200 text-blue-950 px-2 py-0.5 rounded-md font-black">
                              📏 Tamanho/Capacidade: {ord.selectedSize}
                            </span>
                          )}
                          <span className="bg-gray-800 text-white px-2 py-0.5 rounded-md font-mono text-[10px] font-bold">
                            🏷️ SKU de Envio: {ord.selectedVariantSku || ord.productSku}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-3 text-gray-500 font-mono text-[11px]">
                      <span>SKU Base: {ord.productSku}</span>
                      <span>•</span>
                      <span className="font-bold text-gray-900">Quantidade: {ord.quantity}x</span>
                    </div>

                    <span className="text-gray-600 font-semibold text-[11px] block">
                      Comprador: <strong>{ord.buyerName}</strong> ({countryConf.flag} {countryConf.name}, {ord.deliveryCity})
                    </span>
                  </div>
                </div>

                {/* Amounts & Action */}
                <div className="text-right shrink-0 space-y-1">
                  <span className="text-xs text-gray-400 block">Total do Pedido</span>
                  <span className="text-lg font-black text-emerald-700 block">
                    {formatCurrency(ord.totalAmount, selectedCurrency)}
                  </span>
                  <span className="text-[10px] text-gray-500 font-semibold block">
                    Repasse Líquido: {formatCurrency(ord.netPayout, selectedCurrency)}
                  </span>

                  <div className="pt-2 flex flex-wrap items-center justify-end gap-2">
                    {ord.status !== 'shipped' && ord.status !== 'delivered' && (
                      <button
                        onClick={() => handleUpdateStatus(ord.id, 'shipped')}
                        disabled={ord.paymentStatus !== 'paid' || isUpdatingStatus === ord.id}
                        className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        title={ord.paymentStatus !== 'paid' ? 'Aguardando confirmação do pagamento' : 'Marcar item como enviado'}
                      >
                        <Truck className="w-3.5 h-3.5" /> Marcar Enviado
                      </button>
                    )}

                    {ord.trackingCode ? (
                      <button
                        onClick={() => {
                          const data = getOrderLabelData(ord);
                          if (data) setActiveLabelData(data);
                          else showToast('Etiqueta disponível após criação do envio.');
                        }}
                        className="p-2 bg-gray-100 hover:bg-emerald-50 hover:text-emerald-700 text-gray-800 font-bold rounded-xl text-xs transition flex items-center gap-1 cursor-pointer"
                        title="Visualizar e Imprimir Etiqueta"
                      >
                        <Printer className="w-3.5 h-3.5 text-emerald-600" /> Etiqueta
                      </button>
                    ) : (
                      <button
                        disabled
                        className="p-2 bg-gray-100 text-gray-400 font-bold rounded-xl text-xs flex items-center gap-1 cursor-not-allowed opacity-60"
                        title="Etiqueta disponível após criação do envio."
                      >
                        <Printer className="w-3.5 h-3.5 text-gray-400" /> Etiqueta
                      </button>
                    )}

                    <button
                      onClick={() => setSelectedOrder(ord)}
                      className="p-2 bg-gray-900 hover:bg-black text-white font-bold rounded-xl text-xs transition flex items-center gap-1 shadow-xs cursor-pointer"
                    >
                      Ver Detalhes <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        }))}
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar text-xs">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-black text-base text-gray-900 font-mono">
                  Detalhes do Pedido {selectedOrder.orderNumber}
                </h3>
                <span className="text-gray-400 text-[11px]">Realizado em {selectedOrder.createdAt}</span>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Variant Picking & Packaging Guide for Warehouse */}
            <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-extrabold text-emerald-950 flex items-center gap-2 text-xs">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" /> Separação do Item Correto (Picking & Packing)
                </h4>
                <span className="bg-emerald-200 text-emerald-900 font-bold px-2 py-0.5 rounded text-[10px]">
                  Qtd: {selectedOrder.quantity}x
                </span>
              </div>

              <div className="flex items-start gap-3 bg-white p-3 rounded-xl border border-emerald-100">
                <img
                  src={selectedOrder.selectedVariantImage || selectedOrder.productImage}
                  alt=""
                  className="w-16 h-16 rounded-lg object-contain border border-gray-200 p-1 shrink-0"
                />
                <div className="space-y-1">
                  <p className="font-bold text-gray-900 text-xs">{selectedOrder.productTitle}</p>
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    {selectedOrder.selectedColor && (
                      <span className="bg-gray-100 text-gray-800 font-bold px-2 py-0.5 rounded">
                        Cor: <strong className="text-gray-950">{selectedOrder.selectedColor}</strong>
                      </span>
                    )}
                    {selectedOrder.selectedSize && (
                      <span className="bg-blue-50 text-blue-900 font-black px-2 py-0.5 rounded">
                        Tamanho/Capacidade: {selectedOrder.selectedSize}
                      </span>
                    )}
                    <span className="bg-gray-800 text-white font-mono font-bold px-2 py-0.5 rounded text-[10px]">
                      SKU: {selectedOrder.selectedVariantSku || selectedOrder.productSku}
                    </span>
                  </div>
                  <p className="text-[10px] text-emerald-800 font-semibold pt-1">
                    ✓ Verifique o código SKU e a cor na etiqueta da embalagem antes de despachar.
                  </p>
                </div>
              </div>
            </div>

            {/* Operational Timeline */}
            <div className="space-y-3 bg-gray-50 p-4 rounded-2xl border border-gray-200">
              <h4 className="font-bold text-gray-900 flex items-center gap-2">
                <Truck className="w-4 h-4 text-emerald-700" /> Linha do Tempo da Operação
              </h4>
              <div className="space-y-2">
                {selectedOrder.timeline.map((tl, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div
                      className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        tl.done ? 'bg-emerald-600 text-white' : 'bg-gray-300 text-gray-600'
                      }`}
                    >
                      ✓
                    </div>
                    <div>
                      <span className="font-bold text-gray-900 block">{tl.title}</span>
                      <span className="text-[10px] text-gray-400 font-mono">{tl.date}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Buyer & Escrow Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-200">
              <div>
                <span className="font-bold text-gray-900 block mb-1">Dados de Entrega do Cliente</span>
                <p className="text-gray-700"><strong>Nome:</strong> {selectedOrder.buyerName}</p>
                <p className="text-gray-700"><strong>Endereço:</strong> {selectedOrder.deliveryCity}, {selectedOrder.buyerCountry}</p>
                <p className="text-gray-700 font-mono"><strong>Contato:</strong> {selectedOrder.buyerPhone}</p>
              </div>

              <div>
                <span className="font-bold text-gray-900 block mb-1">Garantia Escrow Nusali Proteção</span>
                <p className="text-gray-700"><strong>Status:</strong> {selectedOrder.escrowStatus}</p>
                <p className="text-gray-700"><strong>Liberação Estimada:</strong> {selectedOrder.escrowReleaseDate}</p>
                <p className="text-gray-700"><strong>Transportadora:</strong> {selectedOrder.shippingCarrier}</p>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
              {selectedOrder.trackingCode ? (
                <button
                  type="button"
                  onClick={() => {
                    const data = getOrderLabelData(selectedOrder);
                    if (data) setActiveLabelData(data);
                    else showToast('Etiqueta disponível após criação do envio.');
                  }}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Printer className="w-4 h-4" /> Visualizar & Imprimir Etiqueta
                </button>
              ) : (
                <span className="text-xs font-bold text-gray-400 italic">
                  Etiqueta disponível após criação do envio.
                </span>
              )}

              <button
                onClick={() => setSelectedOrder(null)}
                className="px-5 py-2.5 bg-gray-900 hover:bg-black text-white font-bold rounded-xl text-xs cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Shipping Label Modal */}
      <ShippingLabelModal
        labelData={activeLabelData}
        onClose={() => setActiveLabelData(null)}
      />
    </div>
  );
};
