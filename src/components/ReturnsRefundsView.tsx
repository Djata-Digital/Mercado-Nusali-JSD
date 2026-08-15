import React, { useState, useEffect } from 'react';
import {
  RotateCcw,
  CheckCircle2,
  Clock,
  AlertCircle,
  Package,
  FileText,
  Upload,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Printer,
} from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext';
import { useOrders } from '../hooks/useOrders';
import { BuyerNavHeader } from './BuyerNavHeader';
import { formatCurrency } from '../utils/currencyUtils';
import { BuyerService, BuyerReturn } from '../services/buyerService';
import { ShippingLabelModal, ShippingLabelData } from './ShippingLabelModal';

export const ReturnsRefundsView: React.FC = () => {
  const { showToast, selectedCurrency } = usePreferences();
  const { data: orders = [] } = useOrders();
  const [activeTab, setActiveTab] = useState<'requests' | 'new_request'>('requests');

  const [returnReason, setReturnReason] = useState('defective');
  const [returnDescription, setReturnDescription] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState(orders[0]?.id || 'NSL-8941203');
  const [activeReturns, setActiveReturns] = useState<BuyerReturn[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeLabelData, setActiveLabelData] = useState<ShippingLabelData | null>(null);

  const getReturnLabelData = (ret: BuyerReturn): ShippingLabelData => ({
    trackingNumber: ret.trackingLabelCode,
    orderNumber: `RET-${ret.id} / PEDIDO #${ret.orderId}`,
    serviceType: 'LOGÍSTICA REVERSA GRATUITA CPLP',
    routeCode: 'DEV-CLI > HUB-BANDIM-GW > 001',
    destinationHub: 'HUB-GW-01-CENTRAL-DEVOLUCOES',
    sender: {
      name: 'Cliente Comprador Nusali',
      address: 'Endereço Residencial do Comprador',
      city: 'Bissau',
      country: 'GW',
      phone: '+245 955000000',
    },
    recipient: {
      name: 'Centro de Triagem & Devoluções Nusali',
      address: 'Av. dos Combatentes da Liberdade, HUB Bandim - Bloco C',
      city: 'Bissau',
      country: 'GW',
      postalCode: 'CP-1000',
      phone: '+245 955000111',
    },
    packageInfo: {
      itemsDescription: `Devolução: ${ret.productTitle}`,
      sku: `DEV-${ret.id}`,
      quantity: 1,
      weightKg: '0.45',
      dimensions: '18 × 12 × 6 cm',
      declaredValue: formatCurrency(ret.amount, ret.currency || selectedCurrency),
    },
    issuedAt: ret.date,
  });

  const loadReturns = async () => {
    setIsLoading(true);
    try {
      const res = await BuyerService.getReturns();
      if (res.success && Array.isArray(res.data)) {
        setActiveReturns(res.data);
      }
    } catch (err) {
      console.error('Failed to load returns:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReturns();
  }, []);

  const handleCreateReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnDescription.trim()) {
      showToast('Por favor, descreva o motivo da devolução.');
      return;
    }

    setIsSubmitting(true);
    try {
      const targetOrder = orders.find(o => o.id === selectedOrderId);
      const productTitle = targetOrder?.items[0]?.product?.title || 'Produto do Pedido #' + selectedOrderId;

      const res = await BuyerService.createReturn({
        orderId: selectedOrderId,
        productTitle,
        reason: returnReason === 'defective' ? 'Defeito de Fabricação' : returnReason === 'wrong_item' ? 'Item Incorreto' : 'Desistência em 7 dias',
        description: returnDescription.trim(),
      });

      if (res.success && res.data) {
        setActiveReturns(prev => [res.data, ...prev]);
        setActiveTab('requests');
        setReturnDescription('');
        showToast('Solicitação de devolução enviada com sucesso! Etiqueta gerada.');
      } else {
        showToast(res.message || 'Erro ao solicitar devolução.');
      }
    } catch {
      showToast('Falha ao comunicar com o servidor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-fadeIn">
      <BuyerNavHeader />

      {/* Main Header Banner */}
      <div className="bg-gradient-to-r from-amber-950 via-slate-900 to-emerald-950 text-white rounded-2xl p-6 sm:p-8 shadow-xl mb-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 bg-yellow-400 text-amber-950 px-3 py-1 rounded-full text-xs font-black uppercase mb-3">
              <ShieldCheck className="w-3.5 h-3.5" /> Devolução Grátis & Garantia CPLP
            </div>
            <h1 className="text-2xl sm:text-3xl font-black">Devoluções e Reembolsos</h1>
            <p className="text-xs text-gray-200 mt-1 max-w-xl">
              Você tem até 7 dias após o recebimento para solicitar a troca ou devolução gratuita com reembolso imediato na sua carteira.
            </p>
          </div>

          {/* Tab Switcher */}
          <div className="flex bg-white/10 p-1.5 rounded-xl border border-white/20">
            <button
              onClick={() => setActiveTab('requests')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'requests' ? 'bg-yellow-400 text-amber-950' : 'text-white hover:bg-white/10'
              }`}
            >
              Minhas Solicitações
            </button>
            <button
              onClick={() => setActiveTab('new_request')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'new_request' ? 'bg-yellow-400 text-amber-950' : 'text-white hover:bg-white/10'
              }`}
            >
              Nova Devolução
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'requests' ? (
        /* List of Active Returns */
        <div className="space-y-6">
          {activeReturns.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-500">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-gray-800">Nenhuma devolução em andamento</h3>
              <p className="text-xs text-gray-400 mt-1">Todos os seus pedidos estão em conformidade.</p>
            </div>
          ) : (
            activeReturns.map((ret) => (
              <div key={ret.id} className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-yellow-50 rounded-xl text-yellow-700">
                      <RotateCcw className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-gray-400 font-mono">PROTOCOLO #{ret.id}</span>
                      <h3 className="text-sm font-black text-gray-900">{ret.productTitle}</h3>
                    </div>
                  </div>

                  <span className="inline-flex items-center gap-1 bg-yellow-50 text-yellow-800 border border-yellow-200 px-3 py-1 rounded-full text-xs font-bold self-start sm:self-auto">
                    <Clock className="w-3.5 h-3.5" />
                    {ret.status === 'under_review' ? 'Em Análise pela Equipe Nusali' : 'Aprovado para Postagem'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="bg-gray-50 p-4 rounded-xl">
                    <span className="text-gray-400 block mb-1">Motivo Informado:</span>
                    <span className="font-bold text-gray-800">{ret.reason}</span>
                  </div>

                  <div className="bg-gray-50 p-4 rounded-xl">
                    <span className="text-gray-400 block mb-1">Etiqueta de Logística Reversa:</span>
                    <span className="font-mono font-black text-emerald-700">{ret.trackingLabelCode}</span>
                  </div>

                  <div className="bg-gray-50 p-4 rounded-xl">
                    <span className="text-gray-400 block mb-1">Valor a ser Reembolsado:</span>
                    <span className="font-black text-emerald-700">
                      {formatCurrency(ret.amount, ret.currency || selectedCurrency)}
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-gray-500">
                  <p>Apresente o código de postagem no HUB Nusali Bandim ou ponto de coleta mais próximo.</p>
                  <button
                    type="button"
                    onClick={() => setActiveLabelData(getReturnLabelData(ret))}
                    className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs shrink-0"
                  >
                    <Printer className="w-3.5 h-3.5" /> Visualizar & Imprimir Etiqueta
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* Form Request New Return */
        <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-2xs max-w-2xl mx-auto">
          <h2 className="text-lg font-black text-gray-900 mb-2">Solicitar Devolução ou Troca Gratuita</h2>
          <p className="text-xs text-gray-500 mb-6">
            Preencha os dados abaixo para gerar sua etiqueta de frete reverso sem custos.
          </p>

          <form onSubmit={handleCreateReturn} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Selecione o Pedido</label>
              <select
                value={selectedOrderId}
                onChange={e => setSelectedOrderId(e.target.value)}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              >
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    Pedido #{o.id} - Realizado em {o.date} (Total: {formatCurrency(o.total, selectedCurrency)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Motivo da Solicitação</label>
              <select
                value={returnReason}
                onChange={e => setReturnReason(e.target.value)}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              >
                <option value="defective">Produto com defeito ou avaria de fábrica</option>
                <option value="wrong_item">Recebi um item diferente do anunciado</option>
                <option value="regret">Desistência da compra (Direito de arrependimento em 7 dias)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Detalhes do Motivo</label>
              <textarea
                value={returnDescription}
                onChange={e => setReturnDescription(e.target.value)}
                rows={4}
                placeholder="Descreva detalhadamente o ocorrido com o produto..."
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                required
              />
            </div>

            <div className="pt-4 border-t border-gray-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setActiveTab('requests')}
                className="px-5 py-2.5 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black transition cursor-pointer flex items-center gap-2"
              >
                {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Gerar Etiqueta de Devolução'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Printable Shipping Label Modal */}
      {activeLabelData && (
        <ShippingLabelModal
          labelData={activeLabelData}
          isOpen={!!activeLabelData}
          onClose={() => setActiveLabelData(null)}
          showToast={showToast}
        />
      )}
    </div>
  );
};
