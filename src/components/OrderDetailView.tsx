import React from 'react';
import {
  PackageCheck,
  ShieldCheck,
  Truck,
  FileText,
  AlertCircle,
  Star,
  CheckCircle2,
  Clock,
  ArrowLeft,
  DollarSign,
  MapPin,
  ExternalLink,
  CreditCard,
  Building2,
  RotateCcw,
} from 'lucide-react';
import { useMarketplace } from '../context/MarketplaceContext';
import { formatCurrency, countriesConfig } from '../utils/currencyUtils';

export const OrderDetailView: React.FC = () => {
  const {
    activeOrder,
    setActiveView,
    confirmOrderReceipt,
    openDispute,
    trackOrder,
    openProductDetail,
    openStorePublic,
    showToast,
  } = useMarketplace();

  if (!activeOrder) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <PackageCheck className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Nenhum pedido selecionado</h2>
        <p className="text-xs text-gray-500 mb-6">Selecione um pedido na tela "Minhas Compras" para ver os detalhes.</p>
        <button
          onClick={() => setActiveView('my_orders')}
          className="bg-emerald-600 text-white font-bold px-6 py-2.5 rounded-xl text-xs hover:bg-emerald-700 transition"
        >
          Ir para Minhas Compras
        </button>
      </div>
    );
  }

  const orderCountry = countriesConfig[activeOrder.deliveryAddress.country] || countriesConfig.GW;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fadeIn">
      {/* Back button */}
      <button
        onClick={() => setActiveView('my_orders')}
        className="flex items-center gap-2 text-xs font-bold text-gray-600 hover:text-emerald-700 mb-6 transition"
      >
        <ArrowLeft className="w-4 h-4" /> Voltar para Minhas Compras
      </button>

      {/* Header info */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-gray-900">Pedido #{activeOrder.id}</h1>
            <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full uppercase border border-emerald-300">
              {activeOrder.status === 'delivered' ? 'Entregue' : activeOrder.status === 'shipped' ? 'Em Trânsito' : 'Confirmado'}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">Realizado em {activeOrder.date} • Pagamento com Garantia Nusali Escrow</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => trackOrder(activeOrder)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition shadow-xs flex items-center gap-2"
          >
            <Truck className="w-4 h-4" /> Rastrear Pedido
          </button>
          <button
            onClick={() => showToast('Iniciando download do comprovante fiscal em PDF...')}
            className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold px-4 py-2 rounded-xl text-xs transition flex items-center gap-2"
          >
            <FileText className="w-4 h-4" /> Nota Fiscal PDF
          </button>
        </div>
      </div>

      {/* Escrow Status Banner */}
      <div className="bg-gradient-to-r from-blue-950 to-emerald-900 text-white rounded-2xl p-6 mb-8 shadow-md">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-white/10 rounded-xl text-yellow-300 border border-white/20 shrink-0">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold">Nusali Proteção Escrow</h3>
                <span className="bg-yellow-400 text-blue-950 font-black text-[10px] px-2 py-0.5 rounded">
                  {activeOrder.escrow.status === 'retained' ? 'VALOR RETIDO' : 'PAGAMENTO LIBERADO'}
                </span>
              </div>
              <p className="text-xs text-gray-200 mt-1 max-w-xl">
                {activeOrder.escrow.notes}
              </p>
              <div className="text-[11px] text-yellow-200 mt-2 font-mono">
                Valor em Custódia: {formatCurrency(activeOrder.escrow.amountRetained, activeOrder.currency)} • Liberação programada até {activeOrder.escrow.releaseEligibleAt || '7 dias'}
              </div>
            </div>
          </div>

          {activeOrder.escrow.status === 'retained' && (
            <button
              onClick={() => confirmOrderReceipt(activeOrder.id)}
              className="bg-yellow-400 hover:bg-yellow-300 text-blue-950 font-black px-5 py-3 rounded-xl text-xs shadow-md transition whitespace-nowrap shrink-0"
            >
              Confirmar Recebimento do Pedido
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Items List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs">
            <h2 className="text-lg font-bold text-gray-900 mb-4 pb-3 border-b border-gray-100 flex items-center justify-between">
              <span>Itens Comprados ({activeOrder.items.length})</span>
              <span className="text-xs text-gray-500 font-normal">Origem: {orderCountry.flag} {orderCountry.name}</span>
            </h2>

            <div className="space-y-6">
              {activeOrder.items.map((item, idx) => (
                <div key={idx} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-gray-100 last:border-0 last:pb-0">
                  <div className="flex items-center gap-4">
                    <img
                      src={item.product.image}
                      alt={item.product.title}
                      className="w-20 h-20 object-cover rounded-xl border border-gray-200 shrink-0 cursor-pointer"
                      onClick={() => openProductDetail(item.product.id)}
                      referrerPolicy="no-referrer"
                    />
                    <div>
                      <h3
                        onClick={() => openProductDetail(item.product.id)}
                        className="font-bold text-sm text-gray-900 hover:text-emerald-700 cursor-pointer line-clamp-2"
                      >
                        {item.product.title}
                      </h3>
                      <p className="text-xs text-gray-500 mt-1">
                        Qtd: <span className="font-bold text-gray-800">{item.quantity}</span>
                        {item.selectedColor && ` • Cor: ${item.selectedColor}`}
                        {item.selectedStorage && ` • Cap: ${item.selectedStorage}`}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => openStorePublic(item.product.seller?.id || 'store-gw-1')}
                          className="text-[11px] font-semibold text-emerald-800 hover:underline flex items-center gap-1"
                        >
                          <Building2 className="w-3 h-3" /> Vendedor: {item.product.seller?.name || 'Vendedor Oficial'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="text-right sm:shrink-0 w-full sm:w-auto flex sm:flex-col items-center sm:items-end justify-between">
                    <span className="font-extrabold text-base text-gray-900">
                      {formatCurrency(item.product.price * item.quantity, activeOrder.currency)}
                    </span>
                    <button
                      onClick={() => setActiveView('my_reviews')}
                      className="text-xs font-bold text-blue-900 hover:underline flex items-center gap-1 mt-1"
                    >
                      <Star className="w-3.5 h-3.5 text-amber-500" /> Avaliar Produto
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons Box */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-wrap gap-4 items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-gray-900">Teve algum problema com este pedido?</h3>
              <p className="text-xs text-gray-500">Abra uma disputa com intermediação oficial Nusali.</p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setActiveView('returns_refunds')}
                className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold px-4 py-2 rounded-xl text-xs transition flex items-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4 text-gray-700" /> Devolução Grátis
              </button>
              <button
                onClick={() => openDispute(activeOrder.id, 'Produto com defeito ou não entregue', 'Solicito intermediação da equipe de segurança Nusali para este pedido.')}
                className="bg-red-50 hover:bg-red-100 text-red-800 border border-red-200 font-bold px-4 py-2 rounded-xl text-xs transition flex items-center gap-1.5"
              >
                <AlertCircle className="w-4 h-4 text-red-600" /> Abrir Disputa
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Address & Payment Summary */}
        <div className="space-y-6">
          {/* Address Card */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs">
            <h3 className="font-bold text-sm text-gray-900 mb-3 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-700" /> Endereço de Entrega
            </h3>
            <div className="text-xs text-gray-700 space-y-1 leading-relaxed">
              <p className="font-extrabold text-gray-900">{activeOrder.deliveryAddress.recipientName}</p>
              <p>{activeOrder.deliveryAddress.street}, {activeOrder.deliveryAddress.number} {activeOrder.deliveryAddress.complement}</p>
              <p>{activeOrder.deliveryAddress.neighborhood} - {activeOrder.deliveryAddress.city}, {activeOrder.deliveryAddress.state}</p>
              <p>{orderCountry.flag} {orderCountry.name} • Código Postal: {activeOrder.deliveryAddress.zipCode}</p>
              <p className="text-gray-500 font-mono pt-1">Tel: {activeOrder.deliveryAddress.phone}</p>
              <p className="text-gray-500 font-mono">Documento: {activeOrder.deliveryAddress.cpfOrTaxId}</p>
            </div>
          </div>

          {/* Payment Summary */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs">
            <h3 className="font-bold text-sm text-gray-900 mb-3 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-blue-700" /> Resumo do Pagamento
            </h3>

            <div className="space-y-2 text-xs border-b border-gray-100 pb-4 mb-4">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal dos produtos</span>
                <span className="font-semibold">{formatCurrency(activeOrder.subtotal, activeOrder.currency)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Frete ({activeOrder.carrierName})</span>
                <span className="font-semibold">{activeOrder.shippingFee === 0 ? 'Grátis' : formatCurrency(activeOrder.shippingFee, activeOrder.currency)}</span>
              </div>
              {activeOrder.customsDuty > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Impostos de Importação</span>
                  <span className="font-semibold">{formatCurrency(activeOrder.customsDuty, activeOrder.currency)}</span>
                </div>
              )}
            </div>

            <div className="flex justify-between text-base font-black text-gray-900 mb-4">
              <span>Total Pago</span>
              <span className="text-emerald-700">{formatCurrency(activeOrder.total, activeOrder.currency)}</span>
            </div>

            <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 text-xs text-gray-600 flex items-center justify-between">
              <div>
                <span className="block text-[10px] text-gray-400 font-bold uppercase">Forma de Pagamento</span>
                <span className="font-bold text-gray-900 uppercase">{activeOrder.paymentDetails.method.replace('_', ' ')}</span>
              </div>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded">
                Aprovado
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
