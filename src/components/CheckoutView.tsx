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
import { PaymentMethodType, DeliveryAddress, PaymentDetails, CountryCode, CurrencyCode } from '../types';
import { countriesConfig, formatCurrency } from '../utils/currencyUtils';
import { useCountries } from '../hooks/useCountries';
import { PixPaymentModal } from './PixPaymentModal';
import { PixService } from '../services/pixService';
import { convertToBRL, PixTransaction } from '../utils/pixEngine';
import { ShippingService } from '../services/shippingService';

import { OrdersApi } from '../api/clients/OrdersApi';
import { PaymentsApi } from '../api/clients/PaymentsApi';
import { BuyerService } from '../services/buyerService';

export const CheckoutView: React.FC = () => {
  const navigate = useNavigate();
  const { items: cart, total: cartTotal, clearCart } = useCart();
  const { selectedCountry, selectedCurrency, formatPrice } = usePreferences();

  const [country, setCountry] = useState<CountryCode>(selectedCountry);
  const { data: operationalCountries, isLoading: countriesLoading, isError: countriesError } = useCountries();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Address State initialized with empty/default fields, filled from DB on mount
  const [address, setAddress] = useState<DeliveryAddress>({
    recipientName: '',
    cpfOrTaxId: '',
    zipCode: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: 'Bissau',
    state: 'Bissau',
    country: selectedCountry,
    phone: '',
  });

  // Load real user address from PostgreSQL on mount
  React.useEffect(() => {
    BuyerService.getAddresses().then((res) => {
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        const defaultAddr = res.data.find((a: any) => a.isDefault) || res.data[0];
        setAddress({
          recipientName: defaultAddr.recipientName || '',
          cpfOrTaxId: '',
          zipCode: defaultAddr.zipCode || '',
          street: defaultAddr.street || '',
          number: defaultAddr.number || '',
          complement: defaultAddr.complement || '',
          neighborhood: defaultAddr.neighborhood || '',
          city: defaultAddr.city || 'Bissau',
          state: defaultAddr.state || 'Bissau',
          country: (defaultAddr.country || defaultAddr.countryCode || selectedCountry) as CountryCode,
          phone: defaultAddr.phone || '',
        });
      }
    }).catch(() => {});
  }, [selectedCountry]);

  const orderCurrency: CurrencyCode = cart[0]?.product?.currency || (cart[0] as any)?.currency || countriesConfig[country]?.currency || 'XOF';
  const isBrlCurrency = orderCurrency === 'BRL';

  // Payment State
  const countryPayments = countriesConfig[country]?.paymentMethods || ['orange_money', 'credit_card'];
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>(
    isBrlCurrency ? 'pix' : (countryPayments[0] as PaymentMethodType)
  );

  // Ensure payment method falls back if PIX is selected for non-BRL currency
  React.useEffect(() => {
    if (!isBrlCurrency && paymentMethod === 'pix') {
      const fallback = countryPayments.find((m) => m !== 'pix') || 'orange_money';
      setPaymentMethod(fallback as PaymentMethodType);
    }
  }, [isBrlCurrency, paymentMethod, countryPayments]);

  const [phoneNumber, setPhoneNumber] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Real Pix Modal state
  const [isPixModalOpen, setIsPixModalOpen] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState<string>('');
  const [pixInitiateData, setPixInitiateData] = useState<any>(null);

  const [freightQuote, setFreightQuote] = useState<{
    shippingCost: number;
    shippingChargedToBuyer: number;
    shippingSellerSubsidy: number;
    estimatedMinDays: number;
    estimatedMaxDays: number;
    available: boolean;
    loading: boolean;
    error?: string;
  }>({
    shippingCost: 0,
    shippingChargedToBuyer: 0,
    shippingSellerSubsidy: 0,
    estimatedMinDays: 1,
    estimatedMaxDays: 3,
    available: true,
    loading: false,
  });

  const originCountry = (cart[0]?.product?.originCountry || cart[0]?.product?.countryCode || 'BR').toUpperCase();
  const destCountry = (address.countryCode || address.country || country || 'BR').toUpperCase();
  const isCrossBorder = originCountry !== destCountry;
  const CARD_PAYMENTS_ENABLED = false;

  React.useEffect(() => {
    let isMounted = true;
    const fetchFreight = async () => {
      setFreightQuote((prev) => ({ ...prev, loading: true, error: undefined }));
      // Sem fallback fictício de 0.5kg: se algum item não tem peso real
      // cadastrado, o frete não pode ser calculado — o backend já rejeita
      // isso (PRODUCT_WEIGHT_REQUIRED), então detectamos aqui para dar um
      // erro claro em vez de subestimar o peso silenciosamente.
      const itemsMissingWeight = cart.filter((item) => !item.product.weightKg || item.product.weightKg <= 0);
      if (itemsMissingWeight.length > 0) {
        if (isMounted) {
          setFreightQuote((prev) => ({
            ...prev,
            loading: false,
            available: false,
            error: 'Não é possível calcular o frete: um ou mais produtos do carrinho não têm peso cadastrado.',
          }));
        }
        return;
      }
      const totalWeight = cart.reduce((sum, item) => sum + item.product.weightKg! * item.quantity, 0);
      const res = await ShippingService.calculateFreight({
        originCountry,
        destinationCountry: destCountry,
        weightKg: totalWeight,
        currency: orderCurrency,
        storeId: cart[0]?.product?.storeId || cart[0]?.product?.seller?.storeId,
        sellerId: cart[0]?.product?.sellerId || cart[0]?.product?.seller?.id,
        productSubtotal: cartTotal,
      });

      if (!isMounted) return;

      if (res.success && res.data) {
        setFreightQuote({
          shippingCost: res.data.shippingCost,
          shippingChargedToBuyer: res.data.shippingChargedToBuyer,
          shippingSellerSubsidy: res.data.shippingSellerSubsidy,
          estimatedMinDays: res.data.estimatedMinDays,
          estimatedMaxDays: res.data.estimatedMaxDays,
          available: true,
          loading: false,
        });
      } else {
        setFreightQuote({
          shippingCost: 0,
          shippingChargedToBuyer: 0,
          shippingSellerSubsidy: 0,
          estimatedMinDays: 0,
          estimatedMaxDays: 0,
          available: false,
          loading: false,
          error: res.error?.message || 'Frete não disponível para o endereço informado.',
        });
      }
    };

    fetchFreight();
    return () => {
      isMounted = false;
    };
  }, [originCountry, destCountry, cartTotal, orderCurrency]);

  const customsDuty = 0; // Removed 8% fake tax - national is 0, international is pending
  const shippingFee = freightQuote.shippingChargedToBuyer;
  const grandTotal = cartTotal + shippingFee;
  const grandTotalBrl = convertToBRL(grandTotal, orderCurrency);

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isProcessing) return; // Prevent double clicks
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      // 1. Create Order in PostgreSQL
      const res = await OrdersApi.create({
        shippingAddress: address,
        paymentMethod: paymentMethod,
        currency: orderCurrency,
        countryCode: country,
      });

      if (!res.success || !res.data) {
        const msg = res.error?.message || res.message || 'Erro ao processar checkout.';
        setErrorMessage(msg);
        setIsProcessing(false);
        return;
      }

      const createdOrder = res.data;

      // 2. Non-PIX payment: navigate directly to confirmation
      if (paymentMethod !== 'pix') {
        clearCart();
        setIsProcessing(false);
        navigate(`/orders/${createdOrder.id}/confirmation`, { state: { order: createdOrder } });
        return;
      }

      // 3. PIX payment: Initiate Asaas Payment via POST /api/v1/payments/initiate
      const payRes = await PaymentsApi.initiate({
        orderId: createdOrder.id,
        method: 'pix',
        provider: 'asaas',
      });

      if (!payRes.success || !payRes.data) {
        const errCode = payRes.error?.code || '';
        let msg = payRes.error?.message || payRes.message || 'Falha ao iniciar pagamento PIX Asaas.';

        if (errCode === 'ASAAS_NOT_CONFIGURED') {
          msg = 'Serviço de pagamento PIX temporariamente indisponível. Entre em contato com o suporte.';
        } else if (errCode === 'ASAAS_AUTHENTICATION_ERROR') {
          msg = 'Erro de autenticação no gateway. Tente novamente mais tarde.';
        } else if (errCode === 'ASAAS_VALIDATION_ERROR') {
          msg = 'Dados inválidos para geração do Pix. Verifique seu cadastro.';
        } else if (errCode === 'ASAAS_PROVIDER_UNAVAILABLE' || errCode === 'ASAAS_NETWORK_ERROR') {
          msg = 'O serviço PIX do Asaas está indisponível no momento. Tente novamente em alguns instantes.';
        } else if (errCode === 'ASAAS_CURRENCY_NOT_SUPPORTED') {
          msg = 'Pagamento via PIX Asaas é suportado apenas para pedidos em Reais (BRL).';
        } else if (errCode === 'ASAAS_RATE_LIMITED') {
          msg = 'Serviço PIX temporariamente ocupado. Aguarde alguns instantes e tente novamente.';
        }

        setErrorMessage(msg);
        setIsProcessing(false);
        return;
      }

      // 4. Open Real Asaas Pix Modal
      setActiveOrderId(createdOrder.id);
      setPixInitiateData(payRes.data);
      setIsPixModalOpen(true);
      setIsProcessing(false);
    } catch (err: any) {
      console.error('Checkout failed:', err);
      const msg = err?.response?.data?.error?.message || err?.message || 'Erro ao finalizar pedido.';
      setErrorMessage(msg);
      setIsProcessing(false);
    }
  };

  const handlePixPaymentSuccess = (updatedOrder: any) => {
    setIsPixModalOpen(false);
    clearCart();
    navigate(`/orders/${updatedOrder.id || activeOrderId}/confirmation`, { state: { order: updatedOrder } });
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
        orderId={activeOrderId}
        paymentData={pixInitiateData}
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

      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-medium">
          {errorMessage}
        </div>
      )}

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
                  disabled={countriesLoading}
                  onChange={(e) => {
                    const newCountry = e.target.value as CountryCode;
                    setCountry(newCountry);
                    setAddress({ ...address, country: newCountry });
                    // countriesConfig cobre só os 8 países legados — para um
                    // país real fora dele (ex.: GM, SN) simplesmente não
                    // reatribui o método de pagamento, em vez de quebrar.
                    const newPayMethods = countriesConfig[newCountry]?.paymentMethods;
                    if (newPayMethods && !newPayMethods.includes(paymentMethod) && paymentMethod !== 'pix') {
                      setPaymentMethod(newPayMethods[0] as PaymentMethodType);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 font-bold bg-gray-50 disabled:opacity-60"
                >
                  {(!operationalCountries || !operationalCountries.some((c) => c.code === country)) && country && (
                    <option value={country}>{country}</option>
                  )}
                  {operationalCountries?.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.name} ({c.currency})
                    </option>
                  ))}
                </select>
                {countriesLoading && <p className="text-[11px] text-gray-500 mt-1">Carregando países...</p>}
                {!countriesLoading && countriesError && (
                  <p className="text-[11px] text-red-600 mt-1">Não foi possível carregar a lista de países.</p>
                )}
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Cidade</label>
                <input
                  type="text"
                  value={address.city}
                  onChange={(e) => setAddress({ ...address, city: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>
            </div>

            {/* Route Scope Badge (Requirement 4) */}
            <div className="pt-2 border-t border-gray-100">
              {isCrossBorder ? (
                <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 text-indigo-900 font-bold px-3 py-1.5 rounded-xl text-xs">
                  <Globe className="w-4 h-4 text-indigo-600" />
                  <span>
                    Venda Internacional ({countriesConfig[originCountry as CountryCode]?.flag || ''} {countriesConfig[originCountry as CountryCode]?.name || originCountry} &rarr; {countriesConfig[destCountry as CountryCode]?.flag || ''} {countriesConfig[destCountry as CountryCode]?.name || destCountry})
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold px-3 py-1.5 rounded-xl text-xs">
                  <span>{countriesConfig[originCountry as CountryCode]?.flag || '🇧🇷'}</span>
                  <span>Venda Nacional ({countriesConfig[originCountry as CountryCode]?.name || originCountry})</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
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
              {/* PIX is displayed ONLY when orderCurrency === 'BRL' */}
              {isBrlCurrency && (
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
                  <span className="text-xs font-bold text-gray-900">PIX</span>
                  <span className="text-[10px] text-emerald-700 font-semibold">Pagamento Instantâneo</span>
                </button>
              )}

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

              {CARD_PAYMENTS_ENABLED && (
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
              )}
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
                          Pagamento instantâneo
                        </span>
                      </div>
                      <p className="text-[11px] text-emerald-800 font-medium leading-relaxed">
                        Ao clicar no botão abaixo, geramos o <strong>QR Code oficial</strong> e o código <strong>Pix Copia e Cola</strong> (padrão BACEN). Você poderá pagar pelo app do Nubank, Itaú, Bradesco, Inter, Santander, Mercado Pago, Caixa ou qualquer outro banco.
                      </p>
                      <div className="pt-1.5 flex flex-wrap items-center gap-2 text-xs font-bold text-emerald-900">
                        <span>Total a pagar: R$ {grandTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
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

            {(() => {
              const cartTotalInfo = formatPrice(cartTotal, orderCurrency);
              const shippingFeeInfo = formatPrice(shippingFee, orderCurrency);
              const customsDutyInfo = formatPrice(customsDuty, orderCurrency);
              const grandTotalInfo = formatPrice(grandTotal, orderCurrency);

              return (
                <>
                  <div className="space-y-2 text-xs text-gray-700">
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span className="font-semibold text-gray-900">
                        {cartTotalInfo.formatted}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span>Frete Logística:</span>
                      <span className="font-semibold text-gray-900">
                        {freightQuote.loading
                          ? 'Calculando...'
                          : freightQuote.shippingChargedToBuyer === 0
                          ? 'GRÁTIS'
                          : shippingFeeInfo.formatted}
                      </span>
                    </div>

                    {isCrossBorder && (
                      <div className="flex justify-between text-amber-800 font-medium">
                        <span>Tributos de Importação:</span>
                        <span>A calcular</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-gray-200 space-y-1">
                    <div className="flex justify-between items-baseline">
                      <span className="text-sm font-bold text-gray-900">Total com Escrow:</span>
                      <span className="text-2xl font-black text-emerald-800">
                        {grandTotalInfo.formatted}
                      </span>
                    </div>
                    {grandTotalInfo.isConverted && (
                      <div className="text-[10px] text-gray-500 font-medium text-right">
                        Moeda do pedido: {grandTotalInfo.originalFormatted}
                      </div>
                    )}
                  </div>
                </>
              );
            })()}

            {freightQuote.error && (
              <p className="text-xs text-red-600 font-semibold bg-red-50 p-2.5 rounded-lg border border-red-200">
                {freightQuote.error}
              </p>
            )}

            <button
              type="submit"
              disabled={isProcessing || freightQuote.loading || !freightQuote.available}
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

