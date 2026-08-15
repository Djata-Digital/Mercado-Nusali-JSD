import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../hooks/useCart';
import { useCreateOrder } from '../hooks/useOrders';
import { usePreferences } from '../context/PreferencesContext';
import {
  ShieldCheck,
  CreditCard,
  QrCode,
  FileText,
  MapPin,
  CheckCircle,
  Truck,
  Copy,
  Lock,
  ArrowRight,
  Smartphone,
  Globe,
  Zap,
} from 'lucide-react';
import { PaymentMethodType, DeliveryAddress, PaymentDetails, CountryCode } from '../types';
import { countriesConfig, formatCurrency } from '../utils/currencyUtils';
import { PixPaymentModal } from './PixPaymentModal';
import { PixService } from '../services/pixService';
import { convertToBRL, PixTransaction } from '../utils/pixEngine';

export const CheckoutView: React.FC = () => {
  const navigate = useNavigate();
  const { items: cart, total: cartTotal, clearCart } = useCart();
  const { mutateAsync: createOrder } = useCreateOrder();
  const { selectedCountry, selectedCurrency } = usePreferences();

  const userLocation = { city: 'Bissau', state: 'Guiné-Bissau', zipCode: '1000', street: 'Avenida Amílcar Cabral', country: selectedCountry };

  const [country, setCountry] = useState<CountryCode>(userLocation.country || selectedCountry);

  // Address State
  const [address, setAddress] = useState<DeliveryAddress>({
    recipientName: 'Alex Silva',
    cpfOrTaxId: 'NIF 8941203',
    zipCode: userLocation.zipCode,
    street: userLocation.street,
    number: '12',
    complement: 'Apto 42',
    neighborhood: 'Praça dos Heróis',
    city: userLocation.city,
    state: userLocation.state,
    country: userLocation.country || selectedCountry,
    phone: '+245 955123456',
  });

  // Payment State
  const countryPayments = countriesConfig[country]?.paymentMethods || ['orange_money', 'credit_card'];
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>(
    country === 'BR' ? 'pix' : (countryPayments[0] as PaymentMethodType)
  );

  const [phoneNumber, setPhoneNumber] = useState('+245 955123456');
  const [cardNumber, setCardNumber] = useState('4532 •••• •••• 8892');
  const [cardHolder, setCardHolder] = useState('ALEX SILVA');
  const [cardExpiry, setCardExpiry] = useState('12/28');
  const [cardCvc, setCardCvc] = useState('321');
  const [isProcessing, setIsProcessing] = useState(false);

  // Pix Modal state
  const [isPixModalOpen, setIsPixModalOpen] = useState(false);
  const [pixTransaction, setPixTransaction] = useState<PixTransaction | null>(null);

  const isInternational = cart.some(
    (i) => i.product.shipping?.isInternational || i.product.shipping?.originCountry !== country
  );

  const customsDuty = isInternational ? cartTotal * 0.08 : 0;
  const shippingFee = cart.every((i) => i.product.shipping?.freeShipping) ? 0 : 2500;
  const grandTotal = cartTotal + shippingFee + customsDuty;
  const grandTotalBrl = convertToBRL(grandTotal, countriesConfig[country].currency);

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);

    if (paymentMethod === 'pix') {
      try {
        const orderTempId = `NSL-${Math.floor(1000000 + Math.random() * 9000000)}`;
        const pixRes = await PixService.createPixCharge({
          orderId: orderTempId,
          amount: grandTotal,
          currency: countriesConfig[country].currency,
          buyerName: address.recipientName,
          buyerCpf: address.cpfOrTaxId,
          description: `Mercado Nusali - Pedido ${orderTempId}`,
        });

        if (pixRes.success && pixRes.data) {
          setPixTransaction(pixRes.data);
          setIsPixModalOpen(true);
          setIsProcessing(false);
          return;
        }
      } catch (pixErr) {
        console.error('Error creating Pix payment:', pixErr);
      }
    }

    try {
      const newOrder = await createOrder({
        items: cart,
        total: grandTotal,
        paymentDetails: { method: paymentMethod as any, currency: selectedCurrency as any },
        status: 'confirmed',
      } as any);
      clearCart();
      setIsProcessing(false);
      const orderId = newOrder?.data?.id || 'ord_1001';
      navigate(`/orders/${orderId}/confirmation`);
    } catch (err) {
      console.error(err);
      clearCart();
      setIsProcessing(false);
      navigate('/orders/confirmation');
    }
  };

  const handlePixPaymentSuccess = async (tx: PixTransaction) => {
    setIsProcessing(true);
    setIsPixModalOpen(false);
    try {
      const newOrder = await createOrder({
        id: tx.orderId,
        items: cart,
        total: grandTotal,
        totalAmount: grandTotal,
        currency: countriesConfig[country].currency,
        deliveryAddress: address,
        status: 'paid',
        paymentMethod: 'PIX Brasil (Banco Central)',
        paymentDetails: {
          method: 'pix',
          currency: 'BRL',
          total: tx.amountBrl,
          pixCode: tx.brCode,
          transactionRef: tx.endToEndId || tx.txid,
        },
      } as any);

      clearCart();
      setIsProcessing(false);
      const orderId = tx.orderId || newOrder?.data?.id || 'ord_1001';
      navigate(`/orders/${orderId}/confirmation`);
    } catch (err) {
      console.error('Error completing order after Pix:', err);
      clearCart();
      setIsProcessing(false);
      navigate(`/orders/${tx.orderId || 'ord_1001'}/confirmation`);
    }
  };

  if (cart.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <p className="text-gray-600 font-medium">Não há itens no carrinho para finalizar a compra.</p>
        <button
          onClick={() => navigate('/products')}
          className="mt-4 bg-emerald-600 text-white font-bold px-6 py-2.5 rounded-xl text-xs hover:bg-emerald-700 transition cursor-pointer"
        >
          Voltar às Compras
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Pix Modal */}
      <PixPaymentModal
        isOpen={isPixModalOpen}
        onClose={() => setIsPixModalOpen(false)}
        transaction={pixTransaction}
        onPaymentSuccess={handlePixPaymentSuccess}
      />

      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
          <Lock className="w-6 h-6 text-emerald-600" /> Checkout Seguro Internacional - Proteção Escrow
        </h1>
        <span className="text-xs text-gray-500 font-semibold flex items-center gap-1">
          <ShieldCheck className="w-4 h-4 text-emerald-600" /> Encriptação SSL 256-bit
        </span>
      </div>

      <form onSubmit={handleSubmitOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-8 space-y-6">
          {/* Step 1: Address Card */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2 uppercase tracking-wider">
              <MapPin className="w-5 h-5 text-emerald-600" /> 1. Endereço de Destino e Destinatário
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">País do Destinatário</label>
                <select
                  value={country}
                  onChange={(e) => {
                    const newCountry = e.target.value as CountryCode;
                    setCountry(newCountry);
                    setAddress({ ...address, country: newCountry });
                    const newPayMethods = countriesConfig[newCountry].paymentMethods;
                    if (!newPayMethods.includes(paymentMethod) && paymentMethod !== 'pix') {
                      setPaymentMethod(newPayMethods[0] as PaymentMethodType);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 font-bold bg-gray-50"
                >
                  {(Object.keys(countriesConfig) as CountryCode[]).map((c) => (
                    <option key={c} value={c}>
                      {countriesConfig[c].flag} {countriesConfig[c].name} ({countriesConfig[c].currency})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Nome Completo</label>
                <input
                  type="text"
                  value={address.recipientName}
                  onChange={(e) => setAddress({ ...address, recipientName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Documento de Identificação (NIF / BI / CPF)</label>
                <input
                  type="text"
                  value={address.cpfOrTaxId}
                  onChange={(e) => setAddress({ ...address, cpfOrTaxId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Telefone de Contacto (Com WhatsApp)</label>
                <input
                  type="text"
                  value={address.phone}
                  onChange={(e) => setAddress({ ...address, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div className="sm:col-span-2 grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block font-semibold text-gray-700 mb-1">Rua / Avenida / Bairro</label>
                  <input
                    type="text"
                    value={address.street}
                    onChange={(e) => setAddress({ ...address, street: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Número / Lote</label>
                  <input
                    type="text"
                    value={address.number}
                    onChange={(e) => setAddress({ ...address, number: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Step 2: Payment Methods */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2 uppercase tracking-wider">
              <CreditCard className="w-5 h-5 text-emerald-600" /> 2. Método de Pagamento ({countriesConfig[country].name})
            </h2>

            {/* Payment Method Selector Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* PIX is always available for instant cross-border or Brazil */}
              <button
                type="button"
                onClick={() => setPaymentMethod('pix')}
                className={`p-3 rounded-xl border flex flex-col items-center justify-center text-center gap-1 transition cursor-pointer ${
                  paymentMethod === 'pix'
                    ? 'border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-500/20'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="relative">
                  <QrCode className="w-6 h-6 text-emerald-600" />
                  <span className="absolute -top-1.5 -right-2 bg-emerald-600 text-white font-black text-[9px] px-1 rounded-full">
                    ⚡
                  </span>
                </div>
                <span className="text-xs font-bold text-gray-900">PIX Brasil</span>
                <span className="text-[10px] text-emerald-700 font-semibold">Aprovação imediata</span>
              </button>

              {countryPayments.includes('orange_money') && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod('orange_money')}
                  className={`p-3 rounded-xl border flex flex-col items-center justify-center text-center gap-1 transition cursor-pointer ${
                    paymentMethod === 'orange_money'
                      ? 'border-orange-500 bg-orange-50/70 ring-2 ring-orange-500/20'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <Smartphone className="w-6 h-6 text-orange-600" />
                  <span className="text-xs font-bold text-gray-900">Orange Money</span>
                  <span className="text-[10px] text-orange-700 font-semibold">Guiné-Bissau (XOF)</span>
                </button>
              )}

              {countryPayments.includes('mtn_money') && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod('mtn_money')}
                  className={`p-3 rounded-xl border flex flex-col items-center justify-center text-center gap-1 transition cursor-pointer ${
                    paymentMethod === 'mtn_money'
                      ? 'border-yellow-500 bg-yellow-50/70 ring-2 ring-yellow-400/20'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <Smartphone className="w-6 h-6 text-yellow-600" />
                  <span className="text-xs font-bold text-gray-900">MTN Mobile</span>
                  <span className="text-[10px] text-yellow-700 font-semibold">Moeda Mobile (XOF)</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setPaymentMethod('credit_card')}
                className={`p-3 rounded-xl border flex flex-col items-center justify-center text-center gap-1 transition cursor-pointer ${
                  paymentMethod === 'credit_card'
                    ? 'border-blue-600 bg-blue-50/70 ring-2 ring-blue-500/20'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <CreditCard className="w-6 h-6 text-blue-600" />
                <span className="text-xs font-bold text-gray-900">Cartão de Crédito</span>
                <span className="text-[10px] text-gray-500">Visa / Master / Elo</span>
              </button>
            </div>

            {/* Payment Sub-fields */}
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 text-xs space-y-3">
              {paymentMethod === 'pix' && (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-950">
                    <div className="p-2 bg-emerald-600 text-white rounded-lg shrink-0 mt-0.5">
                      <QrCode className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm text-emerald-900">
                          Pagamento Instantâneo via PIX
                        </span>
                        <span className="bg-emerald-200 text-emerald-900 text-[10px] font-black px-2 py-0.5 rounded-full">
                          Sem taxas
                        </span>
                      </div>
                      <p className="text-[11px] text-emerald-800 font-medium leading-relaxed">
                        Ao clicar no botão abaixo, geramos o <strong>QR Code oficial</strong> e o código <strong>Pix Copia e Cola</strong> (padrão BACEN). Você poderá pagar pelo app do Nubank, Itaú, Bradesco, Inter, Santander, Mercado Pago, Caixa ou qualquer outro banco.
                      </p>
                      <div className="pt-1.5 flex flex-wrap items-center gap-2 text-xs font-bold text-emerald-900">
                        <span>Valor em Reais: R$ {grandTotalBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        <span>•</span>
                        <span className="text-[11px] text-emerald-700 bg-white/80 px-2 py-0.5 rounded-md border border-emerald-300">
                          🌐 Câmbio do Dia: 1 {countriesConfig[country].currency} = R$ {(grandTotalBrl / grandTotal).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {(paymentMethod === 'orange_money' || paymentMethod === 'mtn_money') && (
                <div className="space-y-2">
                  <label className="block font-semibold text-gray-800">
                    Número de Telefone {paymentMethod === 'orange_money' ? 'Orange Money' : 'MTN Mobile Money'}
                  </label>
                  <input
                    type="text"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+245 955123456"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 font-bold bg-white"
                    required
                  />
                  <p className="text-[11px] text-gray-500">
                    Você receberá um prompt USSD no seu telemóvel em Guiné-Bissau para confirmar o PIN de segurança do pagamento.
                  </p>
                </div>
              )}

              {paymentMethod === 'credit_card' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-gray-700 mb-1">Número do Cartão</label>
                    <input
                      type="text"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-gray-700 mb-1">Titular</label>
                    <input
                      type="text"
                      value={cardHolder}
                      onChange={(e) => setCardHolder(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white uppercase"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-semibold text-gray-700 mb-1">Validade</label>
                      <input
                        type="text"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-gray-700 mb-1">CVV</label>
                      <input
                        type="text"
                        value={cardCvc}
                        onChange={(e) => setCardCvc(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                        required
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Summary */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-gray-900 border-b border-gray-200 pb-3">
              Resumo do Pedido ({cart.length} itens)
            </h2>

            <div className="space-y-2 text-xs text-gray-700">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span className="font-semibold text-gray-900">
                  {formatCurrency(cartTotal, countriesConfig[country].currency)}
                </span>
              </div>

              <div className="flex justify-between">
                <span>Logística Cross-Border:</span>
                <span className="font-bold text-emerald-700">
                  {shippingFee === 0 ? 'GRÁTIS' : formatCurrency(shippingFee, countriesConfig[country].currency)}
                </span>
              </div>

              {isInternational && (
                <div className="flex justify-between text-amber-800 font-medium">
                  <span>Estimativa Tributo Aduaneiro:</span>
                  <span>{formatCurrency(customsDuty, countriesConfig[country].currency)}</span>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-gray-200 space-y-1">
              <div className="flex justify-between items-baseline">
                <span className="text-sm font-bold text-gray-900">Total com Escrow:</span>
                <span className="text-2xl font-black text-emerald-800">
                  {formatCurrency(grandTotal, countriesConfig[country].currency)}
                </span>
              </div>
              {paymentMethod === 'pix' && countriesConfig[country].currency !== 'BRL' && (
                <div className="flex justify-between text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-lg">
                  <span>Valor a pagar no Pix:</span>
                  <span>R$ {grandTotalBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isProcessing}
              className={`w-full text-white font-extrabold py-3.5 px-4 rounded-xl shadow-md transition flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer ${
                paymentMethod === 'pix'
                  ? 'bg-emerald-600 hover:bg-emerald-700 ring-2 ring-emerald-400/30'
                  : 'bg-emerald-700 hover:bg-emerald-800'
              }`}
            >
              {isProcessing ? (
                <span>Gerando Cobrança e Proteção Escrow...</span>
              ) : paymentMethod === 'pix' ? (
                <>
                  <QrCode className="w-4 h-4" />
                  <span>GERAR PIX & PAGAR AGORA</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  <span>CONFIRMAR PEDIDO E PAGAR</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="text-[11px] text-gray-500 text-center space-y-1">
              <p className="flex items-center justify-center gap-1 font-semibold text-emerald-700">
                <Lock className="w-3.5 h-3.5" /> Dinheiro protegido até à confirmação de entrega
              </p>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};

