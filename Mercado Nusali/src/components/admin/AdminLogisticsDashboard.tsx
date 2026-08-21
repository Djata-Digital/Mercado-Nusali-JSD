import React, { useState, useEffect } from 'react';
import { Truck, MapPin, Box, ShieldCheck, CheckCircle2, Clock, Search, AlertTriangle, Printer, RefreshCw, ChevronRight, Eye, X, Filter } from 'lucide-react';
import { AdminApi } from '../../api/clients/AdminApi';
import { ShippingLabelModal, ShippingLabelData } from '../common/ShippingLabelModal';

interface AdminLogisticsDashboardProps {
  showToast: (msg: string) => void;
}

export const AdminLogisticsDashboard: React.FC<AdminLogisticsDashboardProps> = ({ showToast }) => {
  const [shipments, setShipments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filters & Tabs
  const [activeTabStatus, setActiveTabStatus] = useState<string>('todos');
  const [fulfillmentFilter, setFulfillmentFilter] = useState<string>('todos');
  const [countryFilter, setCountryFilter] = useState<string>('todos');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modals
  const [activeLabelData, setActiveLabelData] = useState<ShippingLabelData | null>(null);
  const [statusUpdateTarget, setStatusUpdateTarget] = useState<any | null>(null);
  const [newStatusValue, setNewStatusValue] = useState<string>('IN_TRANSIT');
  const [statusReason, setStatusReason] = useState<string>('');
  const [failureReasonCode, setFailureReasonCode] = useState<string>('RECIPIENT_ABSENT');
  const [receivedByName, setReceivedByName] = useState<string>('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);

  // Details Modal
  const [historyTarget, setHistoryTarget] = useState<any | null>(null);
  const [shipmentEvents, setShipmentEvents] = useState<any[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState<boolean>(false);

  const fetchShipments = async () => {
    setIsLoading(true);
    try {
      const res = await AdminApi.getShipments({
        status: activeTabStatus,
        fulfillmentMode: fulfillmentFilter,
        countryCode: countryFilter,
        search: searchTerm,
      });
      if (res.success && Array.isArray(res.data)) {
        setShipments(res.data);
      } else {
        showToast(res.message || 'Erro ao carregar expedições.');
      }
    } catch (err: any) {
      showToast(err?.message || 'Erro ao consultar central de expedição.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchShipments();
  }, [activeTabStatus, fulfillmentFilter, countryFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchShipments();
  };

  const VALID_TRANSITIONS: Record<string, string[]> = {
    READY_TO_SHIP: ['SHIPPED', 'CANCELLED'],
    SHIPPED: ['IN_TRANSIT', 'DELIVERY_FAILED', 'CANCELLED'],
    IN_TRANSIT: ['OUT_FOR_DELIVERY', 'DELIVERY_FAILED', 'RETURNING'],
    OUT_FOR_DELIVERY: ['DELIVERED', 'DELIVERY_FAILED', 'RETURNING'],
    DELIVERY_FAILED: ['OUT_FOR_DELIVERY', 'RETURNING', 'CANCELLED'],
    RETURNING: ['RETURNED'],
    DELIVERED: [],
    RETURNED: [],
    CANCELLED: [],
  };

  const handleOpenStatusModal = (shp: any, preselectStatus?: string) => {
    setStatusUpdateTarget(shp);
    const currentUpper = (shp.status || '').toUpperCase();
    const allowed = VALID_TRANSITIONS[currentUpper] || [];

    const defaultStatus = preselectStatus && allowed.includes(preselectStatus)
      ? preselectStatus
      : (allowed[0] || 'IN_TRANSIT');

    setNewStatusValue(defaultStatus);
    setStatusReason('');
    setReceivedByName('');
    setFailureReasonCode('RECIPIENT_ABSENT');
  };

  const handleExecuteStatusUpdate = async () => {
    if (!statusUpdateTarget) return;
    setIsUpdatingStatus(true);
    try {
      const res = await AdminApi.updateShipmentStatus(statusUpdateTarget.id, {
        status: newStatusValue,
        description: statusReason.trim() || undefined,
        failureReason: newStatusValue === 'DELIVERY_FAILED' ? failureReasonCode : undefined,
        receivedBy: newStatusValue === 'DELIVERED' ? (receivedByName.trim() || undefined) : undefined,
      });

      if (res.success) {
        showToast(`Envio atualizado para ${newStatusValue} com sucesso!`);
        setStatusUpdateTarget(null);
        await fetchShipments();
      } else {
        const errorMsg = res.error?.message || res.message || 'Falha ao atualizar envio.';
        showToast(errorMsg);
      }
    } catch (err: any) {
      const backendMsg = err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || 'Erro ao comunicar com o servidor.';
      showToast(backendMsg);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleOpenHistoryModal = async (shp: any) => {
    setHistoryTarget(shp);
    setIsLoadingEvents(true);
    try {
      const res = await AdminApi.getShipmentDetails(shp.id);
      if (res.success && res.data?.trackingEvents) {
        setShipmentEvents(res.data.trackingEvents);
      } else {
        setShipmentEvents([]);
      }
    } catch (err: any) {
      showToast('Erro ao carregar histórico de rastreamento.');
      setShipmentEvents([]);
    } finally {
      setIsLoadingEvents(false);
    }
  };

  const statusBadge = (st: string) => {
    const s = (st || '').toUpperCase();
    switch (s) {
      case 'READY_TO_SHIP':
        return <span className="bg-sky-100 text-sky-800 text-[10px] font-black px-2.5 py-1 rounded-full">AGUARDANDO EXPEDIÇÃO</span>;
      case 'DELIVERED':
        return <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2.5 py-1 rounded-full">ENTREGUE</span>;
      case 'OUT_FOR_DELIVERY':
        return <span className="bg-purple-100 text-purple-800 text-[10px] font-black px-2.5 py-1 rounded-full">SAIU PARA ENTREGA</span>;
      case 'IN_TRANSIT':
        return <span className="bg-blue-100 text-blue-800 text-[10px] font-black px-2.5 py-1 rounded-full">EM TRANSPORTE</span>;
      case 'SHIPPED':
        return <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2.5 py-1 rounded-full">DESPACHADO</span>;
      case 'DELIVERY_FAILED':
        return <span className="bg-rose-100 text-rose-800 text-[10px] font-black px-2.5 py-1 rounded-full">ENTREGA FALHOU</span>;
      case 'RETURNING':
        return <span className="bg-orange-100 text-orange-800 text-[10px] font-black px-2.5 py-1 rounded-full">EM DEVOLUÇÃO</span>;
      case 'RETURNED':
        return <span className="bg-gray-200 text-gray-800 text-[10px] font-black px-2.5 py-1 rounded-full">DEVOLVIDO</span>;
      default:
        return <span className="bg-gray-100 text-gray-700 text-[10px] font-black px-2.5 py-1 rounded-full">{s}</span>;
    }
  };

  const tabsList = [
    { id: 'todos', label: 'Todos os Envios' },
    { id: 'READY_TO_SHIP', label: 'Aguardando Expedição' },
    { id: 'SHIPPED', label: 'Despachados' },
    { id: 'IN_TRANSIT', label: 'Em Transporte' },
    { id: 'OUT_FOR_DELIVERY', label: 'Saiu p/ Entrega' },
    { id: 'DELIVERED', label: 'Entregues' },
    { id: 'DELIVERY_FAILED', label: 'Problemas de Entrega' },
  ];

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2.5">
            <Truck className="w-7 h-7 text-emerald-700" />
            Expedição & Entregas — Operações Logísticas
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Central operacional unificada para controle de despachos, transporte, rastreamento e entrega do Mercado Nusali (HUB e Vendedores).
          </p>
        </div>

        <button
          onClick={fetchShipments}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-extrabold rounded-xl transition flex items-center gap-2 cursor-pointer self-start md:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      {/* Tabs & Filters Bar */}
      <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-xs space-y-4">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-b border-gray-100">
          {tabsList.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTabStatus(t.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition shrink-0 cursor-pointer ${
                activeTabStatus === t.id
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
          {/* Fulfillment Filter */}
          <div>
            <label className="text-[10px] font-bold uppercase text-gray-400 block mb-1">Responsável pelo Fulfillment</label>
            <select
              value={fulfillmentFilter}
              onChange={e => setFulfillmentFilter(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-800 focus:outline-none focus:border-emerald-600"
            >
              <option value="todos">Todos (HUB + Seller)</option>
              <option value="NUSALI_FULFILLMENT">HUB Nusali Fulfillment</option>
              <option value="SELLER_FULFILLMENT">Seller Fulfillment</option>
            </select>
          </div>

          {/* Country Filter */}
          <div>
            <label className="text-[10px] font-bold uppercase text-gray-400 block mb-1">País da Operação</label>
            <select
              value={countryFilter}
              onChange={e => setCountryFilter(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-800 focus:outline-none focus:border-emerald-600"
            >
              <option value="todos">Todos os Países</option>
              <option value="GW">🇬🇼 Guiné-Bissau</option>
              <option value="AO">🇦🇴 Angola</option>
              <option value="MZ">🇲🇿 Moçambique</option>
              <option value="CV">🇨🇻 Cabo Verde</option>
              <option value="ST">🇸🇹 São Tomé e Príncipe</option>
              <option value="PT">🇵🇹 Portugal</option>
              <option value="BR">🇧🇷 Brasil</option>
            </select>
          </div>

          {/* Search Form */}
          <form onSubmit={handleSearchSubmit} className="sm:col-span-2">
            <label className="text-[10px] font-bold uppercase text-gray-400 block mb-1">Buscar Pacote / Pedido</label>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Rastreio (NSL-...), N° Pedido (#PED-...), Produto, Cliente..."
                className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-20 py-2 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-600"
              />
              <button
                type="submit"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1 bg-emerald-700 text-white font-bold rounded-lg text-xs hover:bg-emerald-800 transition cursor-pointer"
              >
                Buscar
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-500 space-y-2">
            <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
            <p className="text-xs font-semibold">Carregando expedições reais do banco de dados...</p>
          </div>
        ) : shipments.length === 0 ? (
          <div className="p-12 text-center text-gray-400 space-y-3">
            <Box className="w-10 h-10 text-gray-300 mx-auto" />
            <p className="text-sm font-bold text-gray-600">Nenhum registro de envio encontrado para estes filtros.</p>
            <p className="text-xs text-gray-400">Os registros de envio são gerados automaticamente durante a etapa de despacho dos pedidos.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-[10px] font-black text-gray-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Pedido / Envio</th>
                  <th className="py-3 px-4">Produto & Qtd</th>
                  <th className="py-3 px-4">Origem ➔ Destino</th>
                  <th className="py-3 px-4">Fulfillment / Transporte</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Data Despacho</th>
                  <th className="py-3 px-4 text-right">Ações Operacionais</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {shipments.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50/80 transition">
                    {/* Order & Tracking */}
                    <td className="py-3.5 px-4">
                      <span className="font-extrabold text-gray-900 block">#{s.orderNumber}</span>
                      <span className="font-mono text-[11px] font-black text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 inline-block mt-0.5">
                        {s.trackingNumber}
                      </span>
                    </td>

                    {/* Product */}
                    <td className="py-3.5 px-4 max-w-xs">
                      <p className="font-bold text-gray-900 line-clamp-1">{s.productTitle}</p>
                      <span className="text-[11px] text-gray-500 font-medium">Quantidade: {s.quantity} un.</span>
                      {s.weight && (
                        <span className="text-[10px] text-gray-400 block font-mono">Peso: {s.weight}</span>
                      )}
                    </td>

                    {/* Origin & Destination */}
                    <td className="py-3.5 px-4">
                      <div className="space-y-0.5">
                        <span className="text-[11px] font-extrabold text-gray-800 block">
                          {s.originName}
                        </span>
                        <span className="text-[11px] text-gray-600 block flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-gray-400" /> {s.recipientName || 'Não informado'} ({s.destinationCity || 'Não informado'}, {s.destinationCountry || 'Não informado'})
                        </span>
                      </div>
                    </td>

                    {/* Fulfillment & Carrier */}
                    <td className="py-3.5 px-4">
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full inline-block ${
                        s.fulfillmentMode === 'NUSALI_FULFILLMENT'
                          ? 'bg-purple-100 text-purple-900'
                          : 'bg-emerald-100 text-emerald-900'
                      }`}>
                        {s.fulfillmentMode === 'NUSALI_FULFILLMENT' ? 'HUB Nusali' : 'Vendedor'}
                      </span>
                      <span className="text-[11px] text-gray-500 block font-medium mt-0.5">
                        Transp: {s.carrier || 'Transportadora não definida'}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      {statusBadge(s.status)}
                    </td>

                    {/* Date */}
                    <td className="py-3.5 px-4 text-[11px] text-gray-500 font-mono">
                      {s.shippedAt ? new Date(s.shippedAt).toLocaleDateString('pt-BR') : '-'}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setActiveLabelData({
                            shipmentId: s.id,
                            trackingNumber: s.trackingNumber,
                            orderNumber: s.orderNumber,
                            carrier: s.carrier,
                            fulfillmentMode: s.fulfillmentMode,
                            productTitle: s.productTitle,
                            quantity: s.quantity,
                            weight: s.weight,
                            recipientName: s.recipientName,
                            recipientAddress: s.recipientAddress || {},
                            senderName: s.senderName,
                            senderAddress: s.senderAddress || {},
                          })}
                          className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                          title="Imprimir Etiqueta A6"
                        >
                          <Printer className="w-3.5 h-3.5" /> Etiqueta
                        </button>

                        {s.status === 'READY_TO_SHIP' && (
                          <button
                            onClick={() => {
                              if (s.orderItemId) {
                                AdminApi.updateHubOrderStatus(s.orderItemId, 'shipped')
                                  .then(res => {
                                    if (res.success) {
                                      showToast('Despacho físico confirmado e estoque baixado!');
                                      fetchShipments();
                                    } else {
                                      showToast(res.error?.message || res.message || 'Erro ao despachar envio.');
                                    }
                                  })
                                  .catch(err => {
                                    const msg = err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || 'Erro ao despachar.';
                                    showToast(msg);
                                  });
                              }
                            }}
                            className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center gap-1"
                            title="Confirmar despacho físico e iniciar transporte"
                          >
                            <Truck className="w-3.5 h-3.5" /> Despachar
                          </button>
                        )}

                        {s.status === 'SHIPPED' && (
                          <button
                            onClick={() => handleOpenStatusModal(s, 'IN_TRANSIT')}
                            className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center gap-1"
                            title="Iniciar transporte do pacote no centro logístico"
                          >
                            <Truck className="w-3.5 h-3.5" /> Iniciar Transporte
                          </button>
                        )}

                        {s.status === 'IN_TRANSIT' && (
                          <button
                            onClick={() => handleOpenStatusModal(s, 'OUT_FOR_DELIVERY')}
                            className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center gap-1"
                            title="Marcar como Saiu para Entrega"
                          >
                            <Truck className="w-3.5 h-3.5" /> Saiu p/ Entrega
                          </button>
                        )}

                        {s.status === 'OUT_FOR_DELIVERY' && (
                          <button
                            onClick={() => handleOpenStatusModal(s, 'DELIVERED')}
                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center gap-1"
                            title="Confirmar entrega do pedido"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Confirmar Entrega
                          </button>
                        )}

                        {['DELIVERY_FAILED', 'RETURNING'].includes(s.status) && (
                          <button
                            onClick={() => handleOpenStatusModal(s)}
                            className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center gap-1"
                            title="Gerenciar exceção ou atualizar transporte"
                          >
                            <Truck className="w-3.5 h-3.5" /> Atualizar Status
                          </button>
                        )}

                        <button
                          onClick={() => handleOpenHistoryModal(s)}
                          className="p-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-xs font-bold transition cursor-pointer"
                          title="Ver histórico de rastreamento"
                        >
                          <Eye className="w-3.5 h-3.5" /> Histórico
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: IMPRIMIR ETIQUETA A6 */}
      <ShippingLabelModal
        labelData={activeLabelData}
        onClose={() => setActiveLabelData(null)}
      />

      {/* MODAL: ATUALIZAR STATUS DE TRANSPORTE */}
      {statusUpdateTarget && (() => {
        const allowedOptions = VALID_TRANSITIONS[(statusUpdateTarget.status || '').toUpperCase()] || [];
        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <Truck className="w-5 h-5 text-emerald-700" />
                  <h3 className="font-extrabold text-gray-900 text-base">Atualizar Etapa do Envio</h3>
                </div>
                <button
                  onClick={() => setStatusUpdateTarget(null)}
                  className="text-gray-400 hover:text-gray-600 p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-1 bg-gray-50 p-3 rounded-xl border border-gray-100 text-xs">
                <p className="font-bold text-gray-900">Pedido: #{statusUpdateTarget.orderNumber}</p>
                <p className="text-gray-600 font-mono">Rastreio: {statusUpdateTarget.trackingNumber}</p>
                <p className="text-gray-600">Produto: {statusUpdateTarget.quantity}x {statusUpdateTarget.productTitle}</p>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-gray-700 block mb-1">Novo Status do Transporte</label>
                  <select
                    value={newStatusValue}
                    onChange={e => setNewStatusValue(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 font-bold text-gray-900 focus:outline-none focus:border-emerald-600"
                  >
                    {allowedOptions.includes('IN_TRANSIT') && (
                      <option value="IN_TRANSIT">IN_TRANSIT — Em transporte no centro logístico</option>
                    )}
                    {allowedOptions.includes('OUT_FOR_DELIVERY') && (
                      <option value="OUT_FOR_DELIVERY">OUT_FOR_DELIVERY — Saiu para entrega ao destinatário</option>
                    )}
                    {allowedOptions.includes('DELIVERED') && (
                      <option value="DELIVERED">DELIVERED — Entregue no destino</option>
                    )}
                    {allowedOptions.includes('DELIVERY_FAILED') && (
                      <option value="DELIVERY_FAILED">DELIVERY_FAILED — Tentativa de entrega falhou</option>
                    )}
                    {allowedOptions.includes('RETURNING') && (
                      <option value="RETURNING">RETURNING — Em rota de devolução à origem</option>
                    )}
                    {allowedOptions.includes('RETURNED') && (
                      <option value="RETURNED">RETURNED — Devolvido à origem</option>
                    )}
                    {allowedOptions.includes('CANCELLED') && (
                      <option value="CANCELLED">CANCELLED — Cancelar envio</option>
                    )}
                  </select>
                </div>

              {newStatusValue === 'DELIVERY_FAILED' && (
                <div>
                  <label className="font-bold text-gray-700 block mb-1">Motivo do Problema de Entrega *</label>
                  <select
                    value={failureReasonCode}
                    onChange={e => setFailureReasonCode(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 font-bold text-gray-900 focus:outline-none focus:border-emerald-600 mb-3"
                  >
                    <option value="RECIPIENT_ABSENT">RECIPIENT_ABSENT — Destinatário ausente no local</option>
                    <option value="ADDRESS_NOT_FOUND">ADDRESS_NOT_FOUND — Endereço não localizado</option>
                    <option value="RECIPIENT_REFUSED">RECIPIENT_REFUSED — Destinatário recusou a entrega</option>
                    <option value="OTHER">OTHER — Outro motivo (especificar abaixo)</option>
                  </select>
                </div>
              )}

              {newStatusValue === 'DELIVERED' && (
                <div>
                  <label className="font-bold text-gray-700 block mb-1">Nome de Quem Recebeu (Operador)</label>
                  <input
                    type="text"
                    value={receivedByName}
                    onChange={e => setReceivedByName(e.target.value)}
                    placeholder="Ex: João da Silva (Próprio destinatário / Porteiro)"
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 font-bold text-gray-900 focus:outline-none focus:border-emerald-600 mb-3"
                  />
                </div>
              )}

              <div>
                <label className="font-bold text-gray-700 block mb-1">
                  {newStatusValue === 'DELIVERY_FAILED' && failureReasonCode === 'OTHER'
                    ? 'Descrição Obrigatória do Motivo *'
                    : 'Observação / Descrição Logística'}
                </label>
                <textarea
                  rows={3}
                  value={statusReason}
                  onChange={e => setStatusReason(e.target.value)}
                  placeholder={
                    newStatusValue === 'DELIVERY_FAILED'
                      ? 'Descreva a ocorrência no local de entrega...'
                      : 'Ex: Envio triado na central e despachado para entrega.'
                  }
                  className="w-full bg-white border border-gray-300 rounded-xl p-3 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-600"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                onClick={() => setStatusUpdateTarget(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleExecuteStatusUpdate}
                disabled={isUpdatingStatus}
                className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold rounded-xl text-xs transition cursor-pointer disabled:opacity-50"
              >
                {isUpdatingStatus ? 'Salvando...' : 'Confirmar Atualização'}
              </button>
            </div>
          </div>
        </div>
      );
    })()}

      {/* MODAL: HISTÓRICO DE RASTREAMENTO */}
      {historyTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="font-extrabold text-gray-900 text-base">Histórico de Rastreamento</h3>
                <p className="text-xs text-gray-500 font-mono">Rastreio: {historyTarget.trackingNumber}</p>
              </div>
              <button
                onClick={() => setHistoryTarget(null)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isLoadingEvents ? (
              <div className="p-8 text-center text-gray-400 space-y-2">
                <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin mx-auto" />
                <p className="text-xs font-semibold">Buscando eventos de rastreamento...</p>
              </div>
            ) : shipmentEvents.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-xs">
                Nenhum evento registrado até o momento.
              </div>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
                {shipmentEvents.map((evt, idx) => (
                  <div key={evt.id || idx} className="flex items-start gap-3 relative">
                    {idx !== shipmentEvents.length - 1 && (
                      <div className="absolute left-2.5 top-6 bottom-0 w-0.5 bg-gray-200" />
                    )}
                    <div className="w-5 h-5 rounded-full bg-emerald-100 border border-emerald-500 flex items-center justify-center text-emerald-700 shrink-0 mt-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </div>
                    <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 flex-1 space-y-0.5 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="font-extrabold text-gray-900">{evt.status}</span>
                        <span className="text-[10px] text-gray-400 font-mono">{new Date(evt.eventTime).toLocaleString('pt-BR')}</span>
                      </div>
                      <p className="text-gray-700 font-medium">{evt.description}</p>
                      <p className="text-[10px] text-gray-500">Local: {evt.location}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-gray-100">
              <button
                onClick={() => setHistoryTarget(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
