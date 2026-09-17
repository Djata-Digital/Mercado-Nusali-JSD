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
  Loader2,
} from 'lucide-react';
import { PaymentMethodType, PaymentDetails, CountryCode, CurrencyCode } from '../types';
import { countriesConfig, formatCurrency } from '../utils/currencyUtils';
import { useCountries } from '../hooks/useCountries';
import { useAuth } from '../context/AuthContext';
import { PixPaymentModal } from './PixPaymentModal';
import { PixService } from '../services/pixService';
import { convertToBRL, PixTransaction } from '../utils/pixEngine';
import { ShippingService, CartShippingPreviewData } from '../services/shippingService';
import {
  resolveCheckoutAddress,
  SavedAddressLike,
  NewAddressFormState,
  CheckoutAddressMode,
  CheckoutRecipientMode,
} from '../utils/checkoutAddressResolver';

import { OrdersApi } from '../api/clients/OrdersApi';
import { BuyerService } from '../services/buyerService';
import { CreateOrderFromCartResult } from '../api/types';
import { resolveCheckoutPaymentTarget, resolveCheckoutConfirmationUrl, initiateCheckoutPixPayment } from '../services/checkoutPaymentRouting';

export const CheckoutView: React.FC = () => {
  const navigate = useNavigate();
  // Correção pré-piloto (quantidade no checkout): cart.length é o número de
  // LINHAS distintas do carrinho (SKUs), não a quantidade de unidades — por
  // isso "Produtos (2)" no carrinho (soma de quantity) virava "Resumo do
  // Pedido (1 itens)" no checkout (contava só a linha). totalCount já soma
  // quantity corretamente (useCart.ts) — usar a mesma fonte nos dois lugares.
  const { items: cart, total: cartTotal, totalCount: cartTotalUnits, clearCart, isLoading: isCartLoading } = useCart();
  const { selectedCountry, selectedCurrency, formatPrice } = usePreferences();

  const [country, setCountry] = useState<CountryCode>(selectedCountry);
  const { data: operationalCountries, isLoading: countriesLoading, isError: countriesError } = useCountries();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Melhoria pré-piloto (elegibilidade por país): país de entrega não pode
  // mais ser "qualquer país operacional" — precisa respeitar a venda
  // nacional/internacional de CADA item do carrinho. UX apenas: o backend
  // (OrderService.createOrderFromCart) revalida e é quem realmente barra o
  // pedido, isto aqui só evita que o comprador escolha algo já sabido inválido.
  const cartAllowedCountries = React.useMemo(() => {
    if (cart.length === 0 || !operationalCountries) return null; // ainda não dá para calcular
    const operationalCodes = new Set(operationalCountries.map((c) => c.code));
    let allowedSet: Set<string> | null = null;
    for (const item of cart) {
      const p: any = item.product;
      const scope = p?.publishingScope === 'international' ? 'international' : 'national';
      const itemAllowed: string[] = scope === 'international'
        ? (Array.isArray(p?.targetCountriesJson) ? p.targetCountriesJson : []).filter((c: string) => operationalCodes.has(c))
        : (p?.originCountry || p?.countryCode ? [String(p.originCountry || p.countryCode).toUpperCase()] : []);
      const itemSet = new Set(itemAllowed);
      allowedSet = allowedSet === null ? itemSet : new Set([...allowedSet].filter((c) => itemSet.has(c)));
    }
    return allowedSet ? Array.from(allowedSet) : [];
  }, [cart, operationalCountries]);
  const isAllNationalCart = cart.length > 0 && cart.every((i: any) => (i.product?.publishingScope || 'national') !== 'international');
  const isCountryLocked = cartAllowedCountries !== null && cartAllowedCountries.length <= 1;

  // FASE D16-H1 — Endereço de Entrega Selecionável + Destinatário do
  // Pedido. Duas escolhas independentes (nunca acopladas): ONDE entregar
  // (endereço cadastrado real, escolhido de uma lista — ou outro endereço,
  // específico deste pedido, nunca salvo no perfil) e QUEM recebe (o
  // próprio comprador ou outra pessoa). A resolução final (o objeto
  // {shippingAddress} que realmente vai para OrdersApi.create — MESMO
  // contrato que orderService.ts/F6.2 já aceita hoje, nenhuma mudança de
  // backend) é feita por resolveCheckoutAddress (função pura, testável),
  // nunca recalculada ad-hoc aqui.
  const { user } = useAuth();

  const [buyerAddresses, setBuyerAddresses] = useState<SavedAddressLike[]>([]);
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(true);
  const [addressMode, setAddressMode] = useState<CheckoutAddressMode>('saved');
  const [selectedSavedAddressId, setSelectedSavedAddressId] = useState<string | null>(null);

  const [newAddress, setNewAddress] = useState<NewAddressFormState>({
    regionId: null, sectorId: null, city: '', street: '', number: '', complement: '', neighborhood: '', zipCode: '',
  });
  // Região→Setor do "outro endereço" — SEMPRE carregados da autoridade real
  // do backend (GET /buyer/shipping/regions|sectors, D16-F2 — já existente,
  // nunca hardcoded aqui).
  const [newAddressRegions, setNewAddressRegions] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [newAddressSectors, setNewAddressSectors] = useState<Array<{ id: string; name: string; code: string; regionId: string }>>([]);
  const [isLoadingSectors, setIsLoadingSectors] = useState(false);

  const [recipientMode, setRecipientMode] = useState<CheckoutRecipientMode>('self');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [documentValue, setDocumentValue] = useState('');

  // Carrega os endereços reais do comprador (lista completa, não só o
  // padrão) — mesma fonte já usada por CartView/ProductDetailView.
  React.useEffect(() => {
    setIsLoadingAddresses(true);
    BuyerService.getAddresses().then((res) => {
      if (res.success && Array.isArray(res.data)) {
        setBuyerAddresses(res.data);
        const defaultAddr = res.data.find((a: any) => a.isDefault) || res.data[0];
        if (defaultAddr) setSelectedSavedAddressId(defaultAddr.id);
      }
    }).catch(() => {}).finally(() => setIsLoadingAddresses(false));
  }, []);

  // Região→Setor do "outro endereço": região carrega quando o país muda;
  // setor carrega quando a região muda (cascata real, nunca lista fixa).
  React.useEffect(() => {
    if (addressMode !== 'new') return;
    BuyerService.getShippingRegions(country).then((res) => {
      if (res.success && Array.isArray(res.data)) setNewAddressRegions(res.data);
    }).catch(() => {});
  }, [addressMode, country]);

  React.useEffect(() => {
    if (addressMode !== 'new' || !newAddress.regionId) {
      setNewAddressSectors([]);
      return;
    }
    setIsLoadingSectors(true);
    BuyerService.getShippingSectors(country, newAddress.regionId).then((res) => {
      if (res.success && Array.isArray(res.data)) setNewAddressSectors(res.data);
    }).catch(() => {}).finally(() => setIsLoadingSectors(false));
  }, [addressMode, country, newAddress.regionId]);

  const selectedSavedAddress = buyerAddresses.find((a) => a.id === selectedSavedAddressId) || null;

  const resolvedAddress = React.useMemo(() => resolveCheckoutAddress({
    addressMode,
    selectedSavedAddress,
    newAddress,
    country,
    recipientMode,
    recipientName,
    recipientPhone,
    documentValue,
    buyerName: user?.name || '',
    buyerPhone: user?.phone || '',
  }), [addressMode, selectedSavedAddress, newAddress, country, recipientMode, recipientName, recipientPhone, documentValue, user?.name, user?.phone]);

  const resolvedShippingSectorId = resolvedAddress.ok ? resolvedAddress.displaySectorId : null;

  // Se o destino atual não está mais entre os permitidos (ex.: carrinho
  // mudou, ou o país padrão de navegação não é o único destino elegível),
  // corrige para o único/primeiro país realmente permitido.
  React.useEffect(() => {
    if (!cartAllowedCountries || cartAllowedCountries.length === 0) return;
    if (!cartAllowedCountries.includes(country)) {
      const next = cartAllowedCountries[0] as CountryCode;
      setCountry(next);
      setNewAddress((prev) => ({ ...prev, regionId: null, sectorId: null }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartAllowedCountries]);

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
  const [pixInitiateData, setPixInitiateData] = useState<any>(null);
  // Correção crítica (checkout "carrinho vazio" depois de gerar PIX):
  // createOrderFromCart APAGA cartItems na mesma transação que cria o
  // pedido — assim que o pedido existe, o carrinho real já está vazio no
  // backend. Uma vez que confirmedOrder existe, o checkout passa de CART
  // MODE para ORDER MODE: nunca mais decide "carrinho vazio" olhando para
  // `cart` (que pode legitimamente já estar vazio), e um clique
  // repetido/retry reaproveita o MESMO pedido em vez de criar outro.
  //
  // Fase M1-D2 — tipado explicitamente com CreateOrderFromCartResult (nunca
  // mais `any`). O discriminante `mode` é a ÚNICA autoridade usada abaixo
  // para decidir identidade de pagamento/navegação — nunca inferido por
  // `orders?.length`/`purchaseGroup?.id`/presença acidental de campos.
  const [confirmedOrder, setConfirmedOrder] = useState<CreateOrderFromCartResult | null>(null);

  // Fase M1-D2 — alvo de polling do PixPaymentModal, SEMPRE derivado de
  // `confirmedOrder.mode` (nunca um id guardado separadamente que poderia
  // ficar dessincronizado). Quando confirmedOrder ainda não existe (modal
  // fechado, ver PixPaymentModal isOpen=false abaixo), o valor 'legacy'
  // vazio é inofensivo — o modal nunca chega a usá-lo enquanto isOpen=false.
  const pixPollTarget: { mode: 'legacy'; orderId: string } | { mode: 'purchase_group'; purchaseGroupId: string } =
    confirmedOrder?.mode === 'purchase_group'
      ? { mode: 'purchase_group', purchaseGroupId: confirmedOrder.purchaseGroup.id }
      : { mode: 'legacy', orderId: confirmedOrder?.id || '' };

  const [freightQuote, setFreightQuote] = useState<{
    shippingCost: number;
    shippingChargedToBuyer: number;
    shippingSellerSubsidy: number;
    available: boolean;
    loading: boolean;
    error?: string;
  }>({
    shippingCost: 0,
    shippingChargedToBuyer: 0,
    shippingSellerSubsidy: 0,
    available: true,
    loading: false,
  });

  const originCountry = (cart[0]?.product?.originCountry || cart[0]?.product?.countryCode || 'BR').toUpperCase();
  // FASE D16-H1 — `destCountry` é SOMENTE o `country` do topo do checkout
  // (destino comercial do pedido, já resolvido por D16-F2/D16-G1) — nunca
  // mais lido de um objeto `address` solto, que agora é derivado
  // (resolvedAddress) a partir do endereço/destinatário escolhidos.
  const destCountry = (country || 'BR').toUpperCase();
  const isCrossBorder = originCountry !== destCountry;
  const CARD_PAYMENTS_ENABLED = false;

  // FASE D16-G3 — preview de frete via F4/F3 (mesma arquitetura do Cart/
  // Product Detail) em vez do motor legado (calculateMultiSellerFreight/
  // shipping_rates). FASE D16-H1 — setor de entrega: EXCLUSIVAMENTE
  // resolvedShippingSectorId, derivado do endereço/modo realmente
  // selecionado (cadastrado OU outro endereço) — nunca inferido de
  // country/texto, e recalcula sempre que o setor efetivo muda (trocar de
  // endereço, trocar de setor no formulário de outro endereço, etc.).
  React.useEffect(() => {
    let isMounted = true;
    const fetchFreight = async () => {
      if (cart.length === 0) return;
      setFreightQuote((prev) => ({ ...prev, loading: true, error: undefined }));

      if (!resolvedShippingSectorId) {
        if (isMounted) {
          setFreightQuote({
            shippingCost: 0,
            shippingChargedToBuyer: 0,
            shippingSellerSubsidy: 0,
            available: false,
            loading: false,
            error: 'Selecione/atualize seu endereço de entrega para calcular o frete.',
          });
        }
        return;
      }

      // Fix (diagnóstico "R$45 -> R$60") — o carrinho pode ter mais de um
      // vendedor; cada vendedor é uma entrega/child order independente no
      // backend (orderService.createOrderFromCart), com seu PRÓPRIO frete.
      // getCartPreview agrupa por sellerId (F4/F3) e soma 1 cotação por
      // grupo — NUNCA 1 cotação para o carrinho inteiro. Fail-closed: se
      // qualquer grupo falhar, o resultado inteiro vem available:false
      // (nunca um total parcial/subestimado).
      const res = await ShippingService.getCartPreview({
        destinationShippingSectorId: resolvedShippingSectorId,
        items: cart.map((item) => ({
          productId: item.product.id,
          variantId: item.selectedVariantSku || null,
          quantity: item.quantity,
        })),
      });

      if (!isMounted) return;

      if (res.success && res.data) {
        const data: CartShippingPreviewData = res.data;
        if (data.available === true) {
          setFreightQuote({
            shippingCost: data.shippingCost,
            shippingChargedToBuyer: data.shippingChargedToBuyer,
            shippingSellerSubsidy: data.shippingSellerSubsidy,
            available: true,
            loading: false,
          });
        } else {
          const unavailableMessage: string = data.message;
          setFreightQuote({
            shippingCost: 0,
            shippingChargedToBuyer: 0,
            shippingSellerSubsidy: 0,
            available: false,
            loading: false,
            error: unavailableMessage,
          });
        }
      } else {
        setFreightQuote({
          shippingCost: 0,
          shippingChargedToBuyer: 0,
          shippingSellerSubsidy: 0,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedShippingSectorId, cart.length, cartTotal]);

  const customsDuty = 0; // Removed 8% fake tax - national is 0, international is pending
  const shippingFee = freightQuote.shippingChargedToBuyer;
  const grandTotal = cartTotal + shippingFee;
  const grandTotalBrl = convertToBRL(grandTotal, orderCurrency);

  // Aceita tanto o submit do formulário (CART MODE) quanto o clique do botão
  // "Tentar gerar o PIX novamente" (ORDER MODE, sem <form> em volta).
  const handleSubmitOrder = async (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault?.();
    if (isProcessing) return; // Prevent double clicks

    // Melhoria pré-piloto (elegibilidade por país): checagem só de UX — evita
    // uma ida ao servidor quando já sabemos que o destino é incompatível. O
    // backend (OrderService.createOrderFromCart) sempre revalida de qualquer
    // forma e é quem realmente decide.
    if (cartAllowedCountries !== null && (cartAllowedCountries.length === 0 || !cartAllowedCountries.includes(country))) {
      setErrorMessage('O país de entrega selecionado não está disponível para um ou mais itens deste carrinho.');
      return;
    }

    // FASE D16-H1 — mesma checagem de UX que já existia para país: o
    // backend (OrderService.createOrderFromCart) sempre revalida endereço/
    // setor de qualquer forma; isto só evita uma ida ao servidor quando já
    // sabemos que o formulário está incompleto (endereço sem setor,
    // destinatário sem nome/telefone, etc.).
    if (resolvedAddress.ok === false) {
      setErrorMessage(resolvedAddress.message);
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      // Correção crítica (evitar pedido duplicado em retry): se um pedido já
      // foi criado nesta tentativa (ex.: geração de PIX falhou depois da
      // criação do pedido, e o comprador clicou de novo), reaproveita o
      // MESMO pedido em vez de chamar OrdersApi.create outra vez — o
      // carrinho real já foi consumido/apagado pela criação anterior, então
      // uma segunda chamada de criação falharia com "carrinho vazio" (uma
      // mensagem enganosa para o que na verdade é "esse pedido já existe").
      let createdOrder = confirmedOrder;

      if (!createdOrder) {
        // 1. Create Order in PostgreSQL
        // FASE D16-H1.1 — payload vem de resolvedAddress.payload
        // (resolveCheckoutAddress, função pura), que separa EXPLICITAMENTE
        // a autoridade geográfica do destinatário:
        //   modo "endereço cadastrado" -> envia SOMENTE addressId (nunca
        //     reconstrói rua/cidade/setor no frontend — o backend busca do
        //     banco e valida addresses.userId === buyer autenticado);
        //   modo "outro endereço" -> envia shippingAddress inline (é um
        //     endereço específico deste pedido, nunca salvo no perfil);
        //   recipientOverride -> SEMPRE separado, nunca embutido nos
        //     campos geográficos (mesmo "eu mesmo" reafirma nome/telefone
        //     do buyer explicitamente).
        // orderService.ts (F6.2) já aceitava addressId+shippingAddress;
        // recipientOverride foi adicionado nesta fase (D16-H1.1) como o
        // MENOR campo aditivo necessário para não enfraquecer a validação
        // de propriedade do addressId.
        const res = await OrdersApi.create({
          addressId: resolvedAddress.payload.addressId || undefined,
          shippingAddress: resolvedAddress.payload.shippingAddress ? { ...resolvedAddress.payload.shippingAddress, countryCode: country } : undefined,
          recipientOverride: { name: resolvedAddress.payload.recipient.name, phone: resolvedAddress.payload.recipient.phone, document: resolvedAddress.payload.recipient.document || undefined },
          paymentMethod: paymentMethod,
          currency: orderCurrency,
          countryCode: country,
        });

        if (!res.success || !res.data) {
          // Nunca deixar o comprador ver um erro técnico com "undefined" —
          // esses ficam nos logs/API; a UI mostra uma mensagem amigável.
          const code = res.error?.code || '';
          const friendlyMessages: Record<string, string> = {
            DESTINATION_COUNTRY_REQUIRED: 'Informe o país do endereço de entrega.',
            DESTINATION_COUNTRY_NOT_FOUND: 'O país informado no endereço de entrega não é reconhecido pelo Mercado Nusali.',
            DESTINATION_COUNTRY_INACTIVE: 'O Mercado Nusali ainda não está disponível para entregas neste país.',
            CART_CURRENCY_MISMATCH: 'Os produtos deste carrinho usam moedas diferentes e não podem ser pagos juntos.',
            // FASE D16-F2 — só deveria acontecer se o país foi trocado sem
            // recarregar a página (o onChange já limpa shippingSectorId);
            // mensagem amigável como rede de segurança, nunca "undefined".
            SHIPPING_SECTOR_INVALID: 'O setor de entrega salvo não é válido para o país selecionado. Atualize seu endereço em "Meus Endereços" e tente novamente.',
          };
          const rawMsg = res.error?.message || res.message || 'Erro ao processar checkout.';
          const msg = friendlyMessages[code] || (rawMsg.includes('undefined') ? 'Não foi possível confirmar o país de entrega. Verifique o endereço e tente novamente.' : rawMsg);
          setErrorMessage(msg);
          setIsProcessing(false);
          return;
        }

        createdOrder = res.data;
        // A partir daqui o checkout entra em ORDER MODE: o pedido (não o
        // carrinho, que o backend já apagou) é a fonte de verdade para o
        // restante desta tentativa.
        setConfirmedOrder(createdOrder);
      }

      // Fase M1-D2 — resolveCheckoutPaymentTarget é a ÚNICA função que lê
      // `createdOrder.mode` para decidir identidade de pagamento/navegação
      // (nunca orders?.length/purchaseGroup?.id/presença acidental de
      // campos). Em modo purchase_group, o alvo é SEMPRE purchaseGroup.id —
      // nenhum child order id é usado como payment id, navigation id ou
      // retry id, nem aqui nem em src/services/checkoutPaymentRouting.ts.
      const paymentTarget = resolveCheckoutPaymentTarget(createdOrder);

      // 2. Non-PIX payment: navigate directly to confirmation
      if (paymentMethod !== 'pix') {
        clearCart();
        setIsProcessing(false);
        navigate(resolveCheckoutConfirmationUrl(paymentTarget), {
          // Discrimina em `createdOrder.mode` (não em `paymentTarget.mode`)
          // para o TypeScript estreitar a união CreateOrderFromCartResult e
          // liberar o acesso a `createdOrder.purchaseGroup` — os dois campos
          // `mode` são sempre idênticos por construção (paymentTarget deriva
          // de createdOrder.mode em resolveCheckoutPaymentTarget).
          state: createdOrder.mode === 'purchase_group' ? { purchaseGroup: createdOrder.purchaseGroup } : { order: createdOrder },
        });
        return;
      }

      // 3. PIX payment: initiateCheckoutPixPayment roteia SEMPRE pelo mode
      // (legacy -> POST /payments/initiate; purchase_group -> SEMPRE POST
      // /payments/purchase-groups/:purchaseGroupId/initiate) — inclusive em
      // retry, já que paymentTarget é recalculado a partir do MESMO
      // createdOrder.mode a cada tentativa. Ambos os caminhos já são
      // idempotentes NO BACKEND (paymentService.ts) — nenhuma idempotência
      // financeira nova foi implementada aqui.
      const payRes = await initiateCheckoutPixPayment(paymentTarget, { method: 'pix', provider: 'asaas' });

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
        } else if (errCode === 'ASAAS_CURRENCY_NOT_SUPPORTED' || errCode === 'PAYMENT_METHOD_NOT_AVAILABLE_FOR_CURRENCY') {
          msg = 'Pagamento via PIX é suportado apenas para pedidos em Reais (BRL).';
        } else if (errCode === 'ASAAS_RATE_LIMITED') {
          msg = 'Serviço PIX temporariamente ocupado. Aguarde alguns instantes e tente novamente.';
        } else if (errCode === 'PAYMENT_CURRENCY_MISMATCH') {
          // Nunca deveria acontecer no fluxo normal (o frontend não envia mais
          // currency para /payments/initiate), mas nunca expor o erro técnico
          // cru ao comprador se, por algum motivo, chegar aqui.
          msg = 'Não foi possível iniciar o pagamento porque a moeda do pagamento não corresponde à moeda do pedido.';
        } else if (errCode === 'ASAAS_BRAZILIAN_TAX_ID_REQUIRED') {
          // Correção crítica (CPF não chega ao Asaas): a mensagem crua do
          // backend soa como se o cadastro estivesse quebrado; a orientação
          // amigável diz exatamente o que o comprador precisa fazer. O
          // pedido já criado é preservado — este erro só bloqueia o PIX,
          // nunca desfaz confirmedOrder (ver PAYMENT_FAILURE_PRESERVES_ORDER).
          msg = 'Informe um CPF ou CNPJ válido para realizar o pagamento.';
        } else if (errCode === 'ASAAS_CUSTOMER_NAME_REQUIRED') {
          msg = 'Seu cadastro está sem nome completo. Atualize seu perfil antes de pagar.';
        }

        setErrorMessage(msg);
        setIsProcessing(false);
        return;
      }

      // 4. Open Real Asaas Pix Modal — o modal deriva o alvo de polling
      // (pollTarget) direto de confirmedOrder no render abaixo, nunca de um
      // id guardado separadamente aqui.
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

  // Fase M1-D2 — a navegação NUNCA decide o modo pelo shape de `freshData`
  // (o objeto recém-lido pelo polling do modal): a autoridade é sempre
  // `confirmedOrder.mode`, guardado desde a criação do pedido/group e nunca
  // alterado entre tentativas. Em purchase_group, a URL usa SEMPRE
  // purchaseGroup.id — nenhum child order id é aceito aqui, nem como
  // fallback.
  const handlePixPaymentSuccess = (freshData: any) => {
    setIsPixModalOpen(false);
    clearCart();
    if (confirmedOrder?.mode === 'purchase_group') {
      navigate(`/purchase-groups/${confirmedOrder.purchaseGroup.id}/confirmation`, { state: { purchaseGroup: freshData } });
    } else if (confirmedOrder) {
      navigate(`/orders/${confirmedOrder.id}/confirmation`, { state: { order: freshData } });
    }
  };

  // Correção pré-piloto (race condition): nunca tratar "carrinho ainda
  // carregando" como "carrinho vazio" — sem isso, um Comprar agora que
  // navegava direto para o checkout via a mesma janela de corrida (ou mesmo
  // um refresh normal da página) mostrava esta mensagem antes do GET /cart
  // real terminar, mesmo com o item já persistido no backend.
  //
  // Correção crítica (checkout "carrinho vazio" depois de gerar PIX): as
  // duas checagens abaixo NUNCA disparam quando confirmedOrder já existe —
  // createOrderFromCart apaga os cartItems reais assim que o pedido é
  // criado, então `cart` fica vazio LEGITIMAMENTE nesse momento; isso não
  // significa que o comprador não tinha itens.
  if (!confirmedOrder && isCartLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
        <p className="text-gray-600 font-medium">Carregando seu carrinho...</p>
      </div>
    );
  }

  if (!confirmedOrder && cart.length === 0) {
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

  // ORDER MODE: o pedido já foi criado nesta tentativa (o carrinho real já
  // foi consumido pelo backend) — o resumo usa os dados REAIS do pedido
  // criado, nunca o carrinho (que legitimamente já está vazio). Cobre tanto
  // "aguardando o PIX abrir" quanto "PIX falhou, oferecer retry" — em ambos
  // os casos nunca mostra "carrinho vazio".
  if (confirmedOrder) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 space-y-6">
        <PixPaymentModal
          isOpen={isPixModalOpen}
          onClose={() => setIsPixModalOpen(false)}
          pollTarget={pixPollTarget}
          paymentData={pixInitiateData}
          onPaymentSuccess={handlePixPaymentSuccess}
        />

        {!isPixModalOpen && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 text-center space-y-4">
            <ShieldCheck className="w-10 h-10 text-emerald-600 mx-auto" />
            {/* Fase M1-D2 — em modo purchase_group, os campos de raiz
                (id/orderNumber/totalAmount/currency) são compatibilidade
                retroativa do PRIMEIRO child (ver orderService.ts) — nunca
                representam a compra inteira. A exibição usa
                purchaseGroup.id/totalAmount/currency, as únicas fontes
                corretas do valor total e da identidade real da compra. */}
            <div>
              <h2 className="text-lg font-black text-gray-900">
                {confirmedOrder.mode === 'purchase_group' ? 'Compra criada com sucesso' : 'Pedido criado com sucesso'}
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                {confirmedOrder.mode === 'purchase_group'
                  ? `Compra Nº ${confirmedOrder.purchaseGroup.id}`
                  : `Pedido Nº ${confirmedOrder.orderNumber || confirmedOrder.id}`}
              </p>
            </div>
            <div className="text-2xl font-black text-gray-900">
              {confirmedOrder.mode === 'purchase_group'
                ? formatPrice(Number(confirmedOrder.purchaseGroup.totalAmount), confirmedOrder.purchaseGroup.currency as CurrencyCode).formatted
                : formatPrice(Number(confirmedOrder.totalAmount), confirmedOrder.currency as CurrencyCode).formatted}
            </div>

            {errorMessage ? (
              <>
                <p className="text-red-700 bg-red-50 border border-red-200 rounded-xl p-3 text-sm font-medium">{errorMessage}</p>
                <button
                  onClick={handleSubmitOrder}
                  disabled={isProcessing}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-extrabold py-3 rounded-xl transition"
                >
                  {isProcessing ? 'Tentando novamente...' : 'Tentar gerar o PIX novamente'}
                </button>
              </>
            ) : (
              <p className="text-gray-500 text-sm flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Preparando o pagamento PIX...
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Pix Modal */}
      <PixPaymentModal
        isOpen={isPixModalOpen}
        onClose={() => setIsPixModalOpen(false)}
        pollTarget={pixPollTarget}
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

            <div className="grid grid-cols-1 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">País do Destinatário</label>
                {isCountryLocked ? (
                  // Melhoria pré-piloto (elegibilidade por país): venda nacional (ou
                  // carrinho cuja interseção de destinos permitidos já é um único
                  // país) — não faz sentido oferecer um dropdown que o backend vai
                  // rejeitar. Estado informativo/bloqueado, não editável.
                  <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 font-bold text-gray-800 flex items-center gap-2">
                    <span>{operationalCountries?.find((c) => c.code === country)?.flag}</span>
                    <span>{operationalCountries?.find((c) => c.code === country)?.name || country}</span>
                  </div>
                ) : (
                  <select
                    value={country}
                    disabled={countriesLoading}
                    onChange={(e) => {
                      const newCountry = e.target.value as CountryCode;
                      setCountry(newCountry);
                      // FASE D16-H1 — trocar o país invalida a Região/Setor já
                      // escolhidos do "outro endereço" (pertenciam ao país
                      // anterior); nunca deixa um sectorId órfão seguir para o
                      // pedido. O endereço CADASTRADO não precisa disso — cada
                      // endereço salvo já carrega seu próprio país/setor reais.
                      setNewAddress((prev) => ({ ...prev, regionId: null, sectorId: null }));
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
                    {/* Melhoria pré-piloto (elegibilidade por país): só os destinos
                        que o vendedor autorizou explicitamente para os itens do
                        carrinho aparecem aqui — nunca todos os países operacionais. */}
                    {(cartAllowedCountries
                      ? operationalCountries?.filter((c) => cartAllowedCountries.includes(c.code))
                      : operationalCountries
                    )?.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.name} ({c.currency})
                      </option>
                    ))}
                  </select>
                )}
                {countriesLoading && <p className="text-[11px] text-gray-500 mt-1">Carregando países...</p>}
                {!countriesLoading && countriesError && (
                  <p className="text-[11px] text-red-600 mt-1">Não foi possível carregar a lista de países.</p>
                )}
                {isCountryLocked && (
                  <p className="text-[11px] text-gray-600 mt-1">
                    {isAllNationalCart
                      ? `Venda nacional — entrega disponível somente em ${operationalCountries?.find((c) => c.code === country)?.name || country}.`
                      : `Entrega disponível somente em ${operationalCountries?.find((c) => c.code === country)?.name || country} para os itens deste carrinho.`}
                  </p>
                )}
                {cartAllowedCountries !== null && cartAllowedCountries.length === 0 && (
                  <p className="text-[11px] text-red-600 mt-1 font-semibold">
                    Os itens deste carrinho não têm nenhum destino de entrega em comum. Remova algum item para continuar.
                  </p>
                )}
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

            {/* FASE D16-H1 — Onde deseja receber este pedido? */}
            <div className="pt-3 border-t border-gray-100 space-y-3">
              <p className="text-xs font-bold text-gray-800">Onde deseja receber este pedido?</p>
              <div className="flex flex-col sm:flex-row gap-2 text-xs">
                <label className={`flex-1 flex items-center gap-2 border rounded-xl px-3 py-2 cursor-pointer ${addressMode === 'saved' ? 'border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-500/20' : 'border-gray-200'}`}>
                  <input type="radio" name="addressMode" checked={addressMode === 'saved'} onChange={() => setAddressMode('saved')} />
                  <span className="font-semibold">Usar meu endereço cadastrado</span>
                </label>
                <label className={`flex-1 flex items-center gap-2 border rounded-xl px-3 py-2 cursor-pointer ${addressMode === 'new' ? 'border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-500/20' : 'border-gray-200'}`}>
                  <input type="radio" name="addressMode" checked={addressMode === 'new'} onChange={() => setAddressMode('new')} />
                  <span className="font-semibold">Usar outro endereço</span>
                </label>
              </div>

              {addressMode === 'saved' ? (
                isLoadingAddresses ? (
                  <p className="text-xs text-gray-500 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando seus endereços...</p>
                ) : buyerAddresses.length === 0 ? (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                    Você ainda não tem nenhum endereço cadastrado. Escolha "Usar outro endereço" para informar um endereço para este pedido.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {buyerAddresses.map((a) => (
                      <label key={a.id} className={`block border rounded-xl px-3 py-2 text-xs cursor-pointer ${selectedSavedAddressId === a.id ? 'border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-500/20' : 'border-gray-200'}`}>
                        <div className="flex items-start gap-2">
                          <input type="radio" name="savedAddress" className="mt-0.5" checked={selectedSavedAddressId === a.id} onChange={() => setSelectedSavedAddressId(a.id)} />
                          <div>
                            <div className="font-bold text-gray-900">{a.recipientName}{a.isDefault ? ' • Padrão' : ''}</div>
                            <div className="text-gray-600">
                              {a.shippingRegionName ? `${a.shippingRegionName} • ` : ''}{a.shippingSectorName || 'Sem setor de entrega definido'}
                            </div>
                            <div className="text-gray-600">{a.city}{a.state ? ` - ${a.state}` : ''}</div>
                            <div className="text-gray-600">{a.street}, {a.number}{a.complement ? ` - ${a.complement}` : ''}{a.neighborhood ? ` - ${a.neighborhood}` : ''}</div>
                            {!a.shippingSectorId && (
                              <div className="text-amber-700 font-semibold mt-1">Sem setor de entrega — edite este endereço em "Meus Endereços" para poder usá-lo.</div>
                            )}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-semibold text-gray-700 mb-1">Região</label>
                    <select
                      value={newAddress.regionId || ''}
                      onChange={(e) => setNewAddress({ ...newAddress, regionId: e.target.value || null, sectorId: null })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                      required
                    >
                      <option value="">Selecione a região...</option>
                      {newAddressRegions.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-gray-700 mb-1">Setor</label>
                    <select
                      value={newAddress.sectorId || ''}
                      onChange={(e) => setNewAddress({ ...newAddress, sectorId: e.target.value || null })}
                      disabled={!newAddress.regionId || isLoadingSectors}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
                      required
                    >
                      <option value="">{isLoadingSectors ? 'Carregando setores...' : 'Selecione o setor...'}</option>
                      {newAddressSectors.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-gray-700 mb-1">Cidade / Localidade</label>
                    <input type="text" value={newAddress.city} onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500" required />
                  </div>
                  <div>
                    <label className="block font-semibold text-gray-700 mb-1">Bairro (opcional)</label>
                    <input type="text" value={newAddress.neighborhood} onChange={(e) => setNewAddress({ ...newAddress, neighborhood: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div className="sm:col-span-2 grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block font-semibold text-gray-700 mb-1">Rua / Avenida</label>
                      <input type="text" value={newAddress.street} onChange={(e) => setNewAddress({ ...newAddress, street: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500" required />
                    </div>
                    <div>
                      <label className="block font-semibold text-gray-700 mb-1">Número / Lote (opcional)</label>
                      <input type="text" value={newAddress.number} onChange={(e) => setNewAddress({ ...newAddress, number: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500" />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-gray-700 mb-1">Referência / Complemento (opcional)</label>
                    <input type="text" value={newAddress.complement} onChange={(e) => setNewAddress({ ...newAddress, complement: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500" />
                  </div>
                </div>
              )}
            </div>

            {/* FASE D16-H1 — Quem vai receber? Escolha INDEPENDENTE do
                endereço acima (qualquer combinação é válida). */}
            <div className="pt-3 border-t border-gray-100 space-y-3">
              <p className="text-xs font-bold text-gray-800">Quem vai receber?</p>
              <div className="flex flex-col sm:flex-row gap-2 text-xs">
                <label className={`flex-1 flex items-center gap-2 border rounded-xl px-3 py-2 cursor-pointer ${recipientMode === 'self' ? 'border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-500/20' : 'border-gray-200'}`}>
                  <input type="radio" name="recipientMode" checked={recipientMode === 'self'} onChange={() => setRecipientMode('self')} />
                  <span className="font-semibold">Eu mesmo{user?.name ? ` (${user.name})` : ''}</span>
                </label>
                <label className={`flex-1 flex items-center gap-2 border rounded-xl px-3 py-2 cursor-pointer ${recipientMode === 'other' ? 'border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-500/20' : 'border-gray-200'}`}>
                  <input type="radio" name="recipientMode" checked={recipientMode === 'other'} onChange={() => setRecipientMode('other')} />
                  <span className="font-semibold">Outra pessoa</span>
                </label>
              </div>

              {recipientMode === 'other' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-semibold text-gray-700 mb-1">Nome completo do destinatário</label>
                    <input type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500" required />
                  </div>
                  <div>
                    <label className="block font-semibold text-gray-700 mb-1">Telefone / WhatsApp do destinatário</label>
                    <input type="text" value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500" required />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Documento de Identificação (NIF / BI / CPF)</label>
                  <input type="text" value={documentValue} onChange={(e) => setDocumentValue(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>

              {resolvedAddress.ok === false && (
                <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 font-semibold">
                  {resolvedAddress.message}
                </p>
              )}
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
              Resumo do Pedido ({cartTotalUnits} itens)
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
              disabled={isProcessing || freightQuote.loading || !freightQuote.available || !resolvedAddress.ok}
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

