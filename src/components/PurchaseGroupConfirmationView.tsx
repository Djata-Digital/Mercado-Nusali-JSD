import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  ArrowRight,
  Package,
  Store,
  Truck,
  ShieldCheck,
  Clock,
  MessageSquareWarning,
} from 'lucide-react';
import { BuyerService } from '../services/buyerService';
import { PurchaseGroupDetail } from '../api/types';
import { formatCurrency } from '../utils/currencyUtils';
import { CurrencyCode } from '../types';
import { deriveGroupFulfillment } from '../utils/purchaseGroupUx';

/**
 * Fase M1-D3 — tela COMPLETA de confirmação de uma compra multi-seller
 * (purchase_group). Uma COMPRA = 1 purchase_group = N pedidos filhos, um
 * por vendedor, cada um com entrega / status / disputa INDEPENDENTES.
 *
 * SEPARAÇÃO EXPLÍCITA (D3.5):
 *   - identidade de PAGAMENTO da compra .... purchaseGroup.id (esta rota)
 *   - FULFILLMENT / disputa / entrega / detalhe ... child order.id
 *     (todos os links "Ver detalhes / rastrear" abaixo vão para
 *      /orders/:childId, que já tem as ações operacionais por pedido).
 *
 * DEEP-LINK / RELOAD (D3.7): 100% reconstruído por
 * BuyerService.getPurchaseGroupById — NÃO lê location.state, confirmedOrder,
 * carrinho, localStorage nem first child. Abrir a URL direto depois de um
 * refresh funciona igual.
 *
 * O status de fulfillment consolidado ("Entrega parcial" etc.) é derivado
 * SOMENTE para apresentação a partir dos child orders — nunca persistido,
 * nunca usado para dinheiro, nunca sobrescreve purchase_groups.status.
 */

const LOGISTICS_LABEL: Record<string, string> = {
  DELIVERED: 'Entregue',
  OUT_FOR_DELIVERY: 'Saiu para entrega',
  IN_TRANSIT: 'Em trânsito',
  SHIPPED: 'Despachado',
  READY_TO_SHIP: 'Aguardando expedição',
  PREPARING: 'Em preparação',
  PENDING_PAYMENT: 'Aguardando pagamento',
};

const ESCROW_LABEL: Record<string, string> = {
  held: 'Protegido em custódia',
  eligible: 'Liberação em breve',
  released: 'Liberado ao vendedor',
  refunded: 'Estornado',
  disputed: 'Em disputa',
  pending: 'Aguardando',
};

function logisticsLabel(raw: string): string {
  return LOGISTICS_LABEL[(raw || '').toUpperCase()] || 'Em preparação';
}

export const PurchaseGroupConfirmationView: React.FC = () => {
  const { purchaseGroupId } = useParams<{ purchaseGroupId: string }>();
  const navigate = useNavigate();
  const [group, setGroup] = React.useState<PurchaseGroupDetail | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    let isMounted = true;
    // D3.8 — troca de route param: zera o group anterior ANTES de buscar,
    // para nunca mostrar dados de outra compra durante o carregamento.
    setGroup(null);
    setErrorMessage(null);
    setIsLoading(true);

    if (!purchaseGroupId) {
      setErrorMessage('Compra não encontrada.');
      setIsLoading(false);
      return;
    }
    BuyerService.getPurchaseGroupById(purchaseGroupId)
      .then((res) => {
        if (!isMounted) return;
        if (res.success && res.data) {
          setGroup(res.data);
        } else {
          // 404 não-revelador (D1/D3.8): "não encontrada" cobre tanto
          // "não existe" quanto "é de outro comprador".
          setErrorMessage(res.error?.message || res.message || 'Compra não encontrada.');
        }
      })
      .catch(() => {
        if (isMounted) setErrorMessage('Falha na comunicação com o servidor. Tente novamente.');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [purchaseGroupId]);

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
        <p className="text-gray-600 font-medium">Carregando sua compra...</p>
      </div>
    );
  }

  if (errorMessage || !group) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
        <p className="text-gray-700 font-semibold">{errorMessage || 'Compra não encontrada.'}</p>
        <button
          onClick={() => navigate('/orders')}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-2.5 rounded-xl text-xs transition cursor-pointer"
        >
          Ver Minhas Compras
        </button>
      </div>
    );
  }

  const currency = group.currency as CurrencyCode;
  const sellerCount = new Set(group.orders.map((o) => o.sellerId || o.id)).size;
  const isPaid = group.status === 'paid' || group.payment?.status === 'paid';
  const fulfillment = deriveGroupFulfillment(group.orders.map((o) => o.logisticsStatus));
  const fulfillmentTone =
    fulfillment.tone === 'done'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
      : fulfillment.tone === 'partial'
      ? 'bg-amber-50 border-amber-200 text-amber-900'
      : fulfillment.tone === 'moving'
      ? 'bg-blue-50 border-blue-200 text-blue-900'
      : 'bg-gray-50 border-gray-200 text-gray-700';

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      {/* ===== Resumo geral da COMPRA ===== */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-9 h-9 text-emerald-600 shrink-0" />
          <div>
            <h1 className="text-lg font-black text-gray-900">Compra confirmada</h1>
            <p className="text-[11px] text-gray-500 font-mono">Compra Nº {group.id}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-gray-50 rounded-xl p-3">
            <span className="block text-[10px] font-bold text-gray-400 uppercase">Total da compra</span>
            <span className="block text-sm font-black text-gray-900 mt-0.5">{formatCurrency(group.totalAmount, currency)}</span>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <span className="block text-[10px] font-bold text-gray-400 uppercase">Vendedores</span>
            <span className="block text-sm font-black text-gray-900 mt-0.5">
              {sellerCount} {sellerCount === 1 ? 'loja' : 'lojas'} · {group.orders.length} {group.orders.length === 1 ? 'pedido' : 'pedidos'}
            </span>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <span className="block text-[10px] font-bold text-gray-400 uppercase">Pagamento</span>
            <span className={`block text-sm font-black mt-0.5 ${isPaid ? 'text-emerald-700' : 'text-amber-700'}`}>
              {isPaid ? 'Confirmado' : group.payment?.processing ? 'Processando' : 'Aguardando'}
            </span>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <span className="block text-[10px] font-bold text-gray-400 uppercase">Data</span>
            <span className="block text-sm font-black text-gray-900 mt-0.5">
              {group.createdAt ? new Date(group.createdAt).toLocaleDateString('pt-BR') : '—'}
            </span>
          </div>
        </div>

        {/* Fulfillment consolidado — SÓ apresentação, derivado dos children */}
        <div className={`flex items-start gap-2 text-xs font-bold p-3 rounded-xl border ${fulfillmentTone}`}>
          <Truck className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <span>{fulfillment.label}</span>
            <p className="text-[11px] font-medium opacity-80 mt-0.5">
              Cada pedido desta compra é entregue e acompanhado separadamente pelo seu vendedor.
            </p>
          </div>
        </div>
      </div>

      {/* ===== Um card por PEDIDO / VENDEDOR ===== */}
      <div className="space-y-4">
        <h2 className="text-xs font-black text-gray-900 uppercase tracking-wider flex items-center gap-1.5 px-1">
          <Package className="w-4 h-4 text-emerald-600" /> Pedidos desta compra
        </h2>

        {group.orders.map((order, idx) => (
          <div key={order.id} className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
            {/* Header do child */}
            <div className="bg-gray-50 border-b border-gray-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Store className="w-4 h-4 text-gray-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-black text-gray-900 truncate">{order.sellerName || `Vendedor ${idx + 1}`}</p>
                  <p className="text-[10px] text-gray-400 font-mono">Pedido {order.orderNumber}</p>
                </div>
              </div>
              <span className="text-xs font-black text-gray-900 shrink-0">
                {formatCurrency(order.totalAmount, order.currency as CurrencyCode)}
              </span>
            </div>

            {/* Itens deste child */}
            <div className="p-4 divide-y divide-gray-100">
              {order.items.length === 0 ? (
                <p className="text-[11px] text-gray-400 py-2">Sem itens registrados neste pedido.</p>
              ) : (
                order.items.map((item) => (
                  <div key={item.id} className="py-2.5 flex items-center gap-3">
                    {item.productImage ? (
                      <img src={item.productImage} alt="" className="w-12 h-12 rounded-lg border border-gray-100 object-contain p-1 bg-gray-50 shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg border border-gray-200 bg-gray-100 flex items-center justify-center shrink-0">
                        <Package className="w-5 h-5 text-gray-400" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-gray-900 line-clamp-1">{item.productTitle}</p>
                      <p className="text-[11px] text-gray-500">
                        {item.quantity} × {formatCurrency(item.unitPrice, order.currency as CurrencyCode)}
                      </p>
                    </div>
                    <span className="text-xs font-bold text-gray-800 shrink-0">
                      {formatCurrency(item.subtotal, order.currency as CurrencyCode)}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Status INDEPENDENTES deste child */}
            <div className="px-4 pb-3 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-blue-50 text-blue-800 border border-blue-200">
                <Truck className="w-3 h-3" /> {logisticsLabel(order.logisticsStatus)}
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                <ShieldCheck className="w-3 h-3" /> {ESCROW_LABEL[order.escrowStatus] || order.escrowStatus}
              </span>
              {order.hasActiveDispute && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-red-50 text-red-800 border border-red-200">
                  <MessageSquareWarning className="w-3 h-3" /> Disputa em andamento
                </span>
              )}
              {order.trackingCode && (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-gray-500">
                  <Clock className="w-3 h-3" /> {order.trackingCode}
                </span>
              )}
            </div>

            {/* Ação: SEMPRE no child order.id (nunca purchaseGroup.id) */}
            <button
              onClick={() => navigate(`/orders/${order.id}`)}
              className="w-full border-t border-gray-100 p-3 text-xs font-bold text-emerald-700 hover:bg-emerald-50/50 transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              Ver detalhes, rastrear ou abrir disputa deste pedido <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={() => navigate('/orders')}
        className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-3 rounded-xl text-xs transition cursor-pointer"
      >
        Ir para Minhas Compras
      </button>
    </div>
  );
};
