import React from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useOrder } from '../hooks/useOrders';
import { OrderService } from '../services/orderService';
import { BuyerService } from '../services/buyerService';
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
  Lock,
  Undo2,
  MessageSquareWarning,
} from 'lucide-react';

/**
 * Fase "Experiência real do comprador pós-entrega" — mapeamento amigável dos
 * códigos de erro REAIS já lançados pelo backend (releaseEscrowForOrder /
 * finalizeDelivery / confirmDeliveryByBuyer). Nunca mostra "sucesso" quando o
 * backend falhou — cada código aqui corresponde exatamente a um erro real já
 * auditado, nenhum foi inventado.
 */
export type PostDeliveryState = 'NOT_DELIVERED' | 'RELEASED' | 'REFUNDED' | 'DISPUTED' | 'HELD_PROTECTED';

/**
 * Estados A-E da auditoria — extraída como função pura (sem JSX/hooks) para
 * poder ser testada diretamente, sem precisar renderizar o componente.
 * Prioridade: released/refunded são estados TERMINAIS e vencem qualquer
 * disputa histórica; disputa ativa só é considerada quando o escrow ainda
 * está held/eligible.
 */
export function computePostDeliveryState(input: {
  isDeliveredDone: boolean;
  escrowStatus: string | null | undefined;
  hasActiveDispute: boolean;
}): PostDeliveryState {
  if (!input.isDeliveredDone) return 'NOT_DELIVERED';
  if (input.escrowStatus === 'released') return 'RELEASED';
  if (input.escrowStatus === 'refunded') return 'REFUNDED';
  if (input.hasActiveDispute) return 'DISPUTED';
  return 'HELD_PROTECTED';
}

export function getConfirmDeliveryErrorMessage(code: string | undefined, fallback: string): string {
  switch (code) {
    case 'ORDER_NOT_FULLY_DELIVERED':
    case 'SHIPMENT_NOT_DELIVERED':
      return 'Ainda há pacotes deste pedido que não chegaram ao destino — a confirmação só é possível depois que todos forem entregues.';
    case 'ESCROW_BLOCKED_BY_ACTIVE_DISPUTE':
      return 'Este pedido está com uma disputa em andamento — o pagamento permanece protegido até ela ser resolvida.';
    case 'PAYMENT_NOT_ELIGIBLE_FOR_RELEASE':
      return 'Não foi possível confirmar porque o pagamento deste pedido não está mais em um estado válido para liberação. Fale com o suporte se isso não fizer sentido.';
    case 'ESCROW_ALREADY_REVERSED':
      return 'O valor deste pedido já foi reembolsado — não é mais possível confirmar o recebimento.';
    case 'ESCROW_STATE_CHANGED_CONCURRENTLY':
      return 'O estado deste pedido mudou durante o processamento. Atualize a página e confira a situação atual antes de tentar novamente.';
    case 'BUYER_NAME_REQUIRED_FOR_DELIVERY_CONFIRMATION':
      return 'Complete seu nome completo no perfil antes de confirmar o recebimento.';
    case 'UNAUTHORIZED':
      return 'Você não tem permissão para confirmar este pedido.';
    default:
      return fallback || 'Não foi possível confirmar o recebimento agora. Tente novamente em instantes.';
  }
}

export const OrderConfirmationView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = usePreferences();
  const [isConfirming, setIsConfirming] = React.useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = React.useState(false);
  // Guarda de reentrância SÍNCRONA (useRef, não useState): setState no React
  // 18 é em lote e não atualiza a variável isConfirming dentro do mesmo
  // handler/tick, então dois cliques disparados antes do primeiro re-render
  // (o `disabled` do botão só é pintado depois) poderiam ambos passar por um
  // `if (isConfirming) return`. Um ref muda de valor IMEDIATAMENTE, fechando
  // essa janela por completo.
  const isConfirmingRef = React.useRef(false);

  // "Tenho um problema" — fluxo REAL de disputa (POST /buyer/disputes),
  // nunca uma disputa fake/local.
  const [isDisputeModalOpen, setIsDisputeModalOpen] = React.useState(false);
  const [disputeReason, setDisputeReason] = React.useState('Produto divergente ou com defeito de fábrica');
  const [disputeDescription, setDisputeDescription] = React.useState('');
  const [isSubmittingDispute, setIsSubmittingDispute] = React.useState(false);
  const isSubmittingDisputeRef = React.useRef(false);

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

  // Confirmação de recebimento — SEMPRE via API real (POST /buyer/orders/:id/
  // confirm-delivery). Nunca altera wallet/escrow localmente, nunca simula
  // sucesso: só reflete o que o backend realmente retornou, e SEMPRE refaz o
  // fetch do pedido para exibir o estado real após a chamada.
  const handleConfirmDelivery = async () => {
    // Proteção real contra clique duplo: checagem+trava SÍNCRONA via ref,
    // fecha a janela que um `if (isConfirming) return` sozinho deixaria
    // aberta (ver comentário na declaração do ref acima).
    if (!activeOrder?.id || isConfirmingRef.current) return;
    isConfirmingRef.current = true;
    setIsConfirming(true);
    try {
      const res = await OrderService.confirmOrderReceipt(activeOrder.id);
      if (res.success) {
        setIsConfirmModalOpen(false);
        showToast('Recebimento confirmado e garantia Escrow liberada com sucesso!');
        await queryClient.invalidateQueries({ queryKey: ['order', activeOrder.id] });
        await queryClient.invalidateQueries({ queryKey: ['orders'] });
      } else {
        // O backend retornou success:false explicitamente (200) — nunca
        // tratado como sucesso.
        showToast(getConfirmDeliveryErrorMessage(res.error?.code, res.message || ''));
      }
    } catch (err: any) {
      // A maioria dos erros de negócio (disputa ativa, payment inelegível,
      // escrow já revertido/mudou concorrentemente, etc.) chega como resposta
      // HTTP não-2xx — axios rejeita a promise, então o código/mensagem real
      // do backend está em err.response.data.error, nunca em err.message
      // (que seria só "Request failed with status code 409").
      const code = err?.response?.data?.error?.code;
      const backendMessage = err?.response?.data?.error?.message;
      showToast(getConfirmDeliveryErrorMessage(code, backendMessage));
    } finally {
      isConfirmingRef.current = false;
      setIsConfirming(false);
    }
  };

  // "Tenho um problema" — fluxo REAL de disputa (POST /buyer/disputes via
  // BuyerService.createDispute), nunca uma disputa fake/local. Depois do
  // sucesso, refaz o fetch do pedido para a UI mudar para o estado de disputa
  // (banner de proteção por disputa, botão de confirmação desaparece).
  const handleCreateDispute = async () => {
    if (!activeOrder?.id || isSubmittingDisputeRef.current) return;
    if (!disputeDescription.trim()) {
      showToast('Descreva o problema antes de enviar.');
      return;
    }
    isSubmittingDisputeRef.current = true;
    setIsSubmittingDispute(true);
    try {
      const res = await BuyerService.createDispute({
        orderId: activeOrder.id,
        reason: disputeReason,
        description: disputeDescription.trim(),
      });
      if (res.success) {
        setIsDisputeModalOpen(false);
        setDisputeDescription('');
        showToast(
          (res.data as any)?.alreadyOpen
            ? 'Já existe uma disputa em aberto para este pedido.'
            : 'Disputa aberta com sucesso! O pagamento permanece protegido em custódia Escrow.'
        );
        await queryClient.invalidateQueries({ queryKey: ['order', activeOrder.id] });
        await queryClient.invalidateQueries({ queryKey: ['orders'] });
      } else {
        showToast(res.error?.message || res.message || 'Não foi possível abrir a disputa agora.');
      }
    } catch (err: any) {
      const backendMessage = err?.response?.data?.error?.message;
      showToast(backendMessage || err?.message || 'Erro ao comunicar com o servidor.');
    } finally {
      isSubmittingDisputeRef.current = false;
      setIsSubmittingDispute(false);
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

  // Fase "Experiência real do comprador pós-entrega" — estado da proteção
  // Escrow após a entrega. TUDO aqui vem do backend (buildEnrichedOrder):
  // escrowStatus, releaseEligibleAt e activeDispute nunca são calculados no
  // frontend. releaseEligibleAt é do escrow/pedido (nunca por shipment).
  const escrowStatus: string | null = activeOrder.escrowStatus || null;
  const releaseEligibleAt: string | null = activeOrder.releaseEligibleAt || null;
  const activeDispute: { id: string; status: string; reason?: string; createdAt?: string } | null =
    activeOrder.activeDispute || null;
  const hasActiveDispute = !!activeDispute && (activeDispute.status === 'open' || activeDispute.status === 'in_mediation');

  // Estados A-E (auditoria da fase) — lógica pura extraída e testável em
  // computePostDeliveryState (ver topo do arquivo).
  const postDeliveryState = computePostDeliveryState({ isDeliveredDone, escrowStatus, hasActiveDispute });

  // Formatação de data/hora LOCAL do usuário — nunca um cálculo de prazo
  // (48h/qualquer valor) feito no frontend. Só formata o valor já persistido.
  let releaseEligibleAtLabel: string | null = null;
  let releaseEligibleAtRemaining: string | null = null;
  if (releaseEligibleAt) {
    const releaseDate = new Date(releaseEligibleAt);
    if (!isNaN(releaseDate.getTime())) {
      const dateStr = releaseDate.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
      const timeStr = releaseDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      releaseEligibleAtLabel = `${dateStr} às ${timeStr}`;

      // Tempo restante — SOMENTE informação visual, calculado uma vez no
      // render (nenhum setInterval/setTimeout). Chegar a zero aqui NUNCA
      // libera dinheiro; é só texto.
      const diffMs = releaseDate.getTime() - Date.now();
      if (diffMs > 0) {
        const diffHours = Math.floor(diffMs / (3600 * 1000));
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays >= 1) {
          releaseEligibleAtRemaining = `faltam ${diffDays} dia${diffDays > 1 ? 's' : ''}`;
        } else if (diffHours >= 1) {
          releaseEligibleAtRemaining = `faltam ${diffHours}h`;
        } else {
          releaseEligibleAtRemaining = 'faltam menos de 1h';
        }
      }
    }
  }

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

      {/* Modal obrigatório de confirmação de recebimento (antes de liberar) */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl animate-scaleUp">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-emerald-50 rounded-xl text-emerald-600 shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-gray-900">Confirmar recebimento</h3>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed mb-6">
              Confirme apenas se você recebeu o pedido corretamente.
              Ao confirmar, o pagamento poderá ser liberado ao vendedor.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                disabled={isConfirming}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 transition cursor-pointer disabled:opacity-50"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelivery}
                disabled={isConfirming}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
              >
                {isConfirming ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Sim, recebi o pedido'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal "Tenho um problema" — abre disputa REAL (POST /buyer/disputes) */}
      {isDisputeModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-600" /> Informar um problema
              </h3>
              <button
                type="button"
                onClick={() => setIsDisputeModalOpen(false)}
                disabled={isSubmittingDispute}
                className="text-gray-400 hover:text-gray-600 text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Motivo do problema</label>
                <select
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  disabled={isSubmittingDispute}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-800 focus:ring-2 focus:ring-red-500 focus:outline-hidden"
                >
                  <option value="Produto divergente ou com defeito de fábrica">Produto divergente ou com defeito de fábrica</option>
                  <option value="Pedido não entregue corretamente">Pedido não entregue corretamente</option>
                  <option value="Embalagem violada ou item faltante">Embalagem violada ou item faltante</option>
                  <option value="Outros problemas com o vendedor">Outros problemas com o vendedor</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Descrição do problema</label>
                <textarea
                  value={disputeDescription}
                  onChange={(e) => setDisputeDescription(e.target.value)}
                  rows={4}
                  disabled={isSubmittingDispute}
                  placeholder="Explique detalhadamente o ocorrido com o produto ou entrega..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-800 focus:ring-2 focus:ring-red-500 focus:outline-hidden resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDisputeModalOpen(false)}
                  disabled={isSubmittingDispute}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 transition cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCreateDispute}
                  disabled={isSubmittingDispute}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
                >
                  {isSubmittingDispute ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Enviar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

          {/* Proteção pós-entrega (Estados A-E) — TUDO vem do backend real. */}
          {postDeliveryState === 'HELD_PROTECTED' && (
            <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 mt-4">
              <div className="space-y-1 text-center sm:text-left">
                <p className="font-extrabold text-emerald-950 text-sm flex items-center gap-1.5 justify-center sm:justify-start">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" /> Pedido entregue
                </p>
                <p className="text-xs text-emerald-800">
                  {releaseEligibleAtLabel
                    ? <>Seu pagamento continua protegido até <strong>{releaseEligibleAtLabel}</strong>{releaseEligibleAtRemaining ? ` (${releaseEligibleAtRemaining})` : ''}.</>
                    : 'Seu pagamento continua protegido.'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setIsDisputeModalOpen(true)}
                  className="bg-white hover:bg-red-50 text-red-700 border border-red-200 font-bold px-4 py-2.5 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <MessageSquareWarning className="w-4 h-4" /> Tenho um problema
                </button>
                <button
                  onClick={() => setIsConfirmModalOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-5 py-2.5 rounded-xl text-xs shadow-md transition flex items-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" /> Confirmar recebimento
                </button>
              </div>
            </div>
          )}

          {postDeliveryState === 'DISPUTED' && (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 mt-4">
              <div className="space-y-1 text-center sm:text-left">
                <p className="font-extrabold text-amber-950 text-sm flex items-center gap-1.5 justify-center sm:justify-start">
                  <Lock className="w-4 h-4 text-amber-600" /> Pagamento protegido devido a uma disputa
                </p>
                <p className="text-xs text-amber-800">
                  {activeDispute?.reason ? <>Motivo: {activeDispute.reason}. </> : null}
                  Enquanto a disputa estiver em análise, o pagamento não pode ser liberado.
                </p>
              </div>
              <button
                onClick={() => navigate('/disputes')}
                className="bg-white hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold px-4 py-2.5 rounded-xl text-xs transition flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <AlertCircle className="w-4 h-4" /> Acompanhar disputa
              </button>
            </div>
          )}

          {postDeliveryState === 'RELEASED' && (
            <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex items-center gap-3 mt-4">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <p className="text-xs font-bold text-emerald-900">Recebimento confirmado — pagamento liberado ao vendedor.</p>
            </div>
          )}

          {postDeliveryState === 'REFUNDED' && (
            <div className="bg-gray-100 border border-gray-200 p-4 rounded-2xl flex items-center gap-3 mt-4">
              <Undo2 className="w-5 h-5 text-gray-600 shrink-0" />
              <p className="text-xs font-bold text-gray-800">Pagamento reembolsado.</p>
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


