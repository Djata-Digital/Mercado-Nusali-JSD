import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Warehouse,
  Plus,
  X,
  Check,
  Loader2,
  Truck,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  PackageCheck,
  AlertCircle,
  RefreshCw,
  Building2,
  Filter,
  Eye,
  Phone,
  MapPin,
  Store,
  User,
  Package,
  ShoppingBag,
  ShieldCheck,
  Lock,
  CreditCard,
  AlertTriangle,
} from 'lucide-react';
import { AdminService } from '../../services/adminService';
import { AdminApi } from '../../api/clients/AdminApi';
import { countriesConfig } from '../../utils/currencyUtils';

export interface WarehouseRecord {
  id: string;
  code: string;
  name: string;
  countryCode?: string;
  country?: string;
  city: string;
  address: string;
  managerName?: string | null;
  staffCount?: number | null;
  status?: string;
  createdAt?: string;
}

interface AdminWarehousesManagerProps {
  showToast: (msg: string) => void;
}

export const AdminWarehousesManager: React.FC<AdminWarehousesManagerProps> = ({ showToast }) => {
  const [activeTab, setActiveTab] = useState<'warehouses' | 'transfers' | 'hub_orders'>('transfers');

  // Warehouses state
  const [warehouses, setWarehouses] = useState<WarehouseRecord[]>([]);
  const [isLoadingWarehouses, setIsLoadingWarehouses] = useState(true);
  const [isSubmittingHub, setIsSubmittingHub] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Transfers state
  const [transfers, setTransfers] = useState<any[]>([]);
  const [isLoadingTransfers, setIsLoadingTransfers] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // HUB Orders state
  const [hubOrders, setHubOrders] = useState<any[]>([]);
  const [isLoadingHubOrders, setIsLoadingHubOrders] = useState(false);
  const [updatingHubItemId, setUpdatingHubItemId] = useState<string | null>(null);

  // Filters state
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals State
  const [detailModalTransfer, setDetailModalTransfer] = useState<any | null>(null);
  const [receiveModalTransfer, setReceiveModalTransfer] = useState<any | null>(null);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  // New HUB Form state
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [countryCode, setCountryCode] = useState('GW');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [managerName, setManagerName] = useState('');
  const [staffCount, setStaffCount] = useState('');

  // Fetch Warehouses
  const fetchWarehouses = useCallback(async () => {
    setIsLoadingWarehouses(true);
    try {
      const res = await AdminService.getWarehousesList();
      if (res.success && Array.isArray(res.data)) {
        setWarehouses(res.data);
      } else if (res.message) {
        showToast(res.message);
      }
    } catch (err: any) {
      if (err?.response?.status === 401) {
        showToast('Sua sessão expirou. Entre novamente.');
      } else if (err?.response?.status === 403) {
        showToast('Você não possui permissão para acessar esta área.');
      } else {
        showToast(err?.response?.data?.message || err?.message || 'Erro ao carregar lista de HUBs logísticos.');
      }
    } finally {
      setIsLoadingWarehouses(false);
    }
  }, [showToast]);

  // Fetch Transfers
  const fetchTransfers = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoadingTransfers(true);
    else setIsRefreshing(true);
    try {
      const res = await AdminService.getInventoryTransfers();
      if (res.success && Array.isArray(res.data)) {
        setTransfers(res.data);
      } else if (res.message) {
        showToast(res.message);
      }
    } catch (err: any) {
      if (err?.response?.status === 401) {
        showToast('Sua sessão expirou. Entre novamente.');
      } else if (err?.response?.status === 403) {
        showToast('Você não possui permissão para acessar esta área.');
      } else {
        showToast(err?.response?.data?.message || err?.message || 'Erro ao carregar lista de transferências de estoque.');
      }
    } finally {
      setIsLoadingTransfers(false);
      setIsRefreshing(false);
    }
  }, [showToast]);

  const fetchHubOrders = useCallback(async () => {
    setIsLoadingHubOrders(true);
    try {
      const res = await AdminApi.getHubFulfillmentOrders();
      if (res.success && Array.isArray(res.data)) {
        setHubOrders(res.data);
      }
    } catch (err: any) {
      showToast('Erro ao carregar pedidos do HUB Nusali.');
    } finally {
      setIsLoadingHubOrders(false);
    }
  }, [showToast]);

  const handleUpdateHubOrderStatus = async (orderItemId: string, newStatus: string) => {
    setUpdatingHubItemId(orderItemId);
    try {
      const res = await AdminApi.updateHubFulfillmentOrderStatus(orderItemId, { status: newStatus });
      if (res.success) {
        showToast('Status do item de fulfillment do HUB atualizado com sucesso!');
        fetchHubOrders();
      } else {
        showToast(res.message || 'Erro ao atualizar status do pedido do HUB.');
      }
    } catch (err: any) {
      showToast(err?.message || 'Falha de conexão ao atualizar status.');
    } finally {
      setUpdatingHubItemId(null);
    }
  };

  const handleConfirmDevPayment = async (orderId: string) => {
    try {
      setUpdatingHubItemId(orderId);
      const res = await AdminApi.confirmDevPayment(orderId);
      if (res.success) {
        showToast('Pagamento simulado e aprovado com sucesso em desenvolvimento!');
        fetchHubOrders();
      } else {
        showToast(res.error?.message || res.message || 'Falha ao simular pagamento.');
      }
    } catch (err: any) {
      showToast(err?.message || 'Erro ao simular pagamento.');
    } finally {
      setUpdatingHubItemId(null);
    }
  };

  useEffect(() => {
    fetchWarehouses();
    fetchTransfers();
    fetchHubOrders();
  }, [fetchWarehouses, fetchTransfers, fetchHubOrders]);

  // Counters for Transfers Header
  const transferCounters = useMemo(() => {
    let pending = 0;
    let inTransit = 0;
    let receivedToday = 0;

    const todayStr = new Date().toISOString().split('T')[0];

    transfers.forEach((t) => {
      if (t.status === 'PENDING') pending++;
      else if (t.status === 'IN_TRANSIT') inTransit++;

      if (t.status === 'RECEIVED' && t.receivedAt) {
        const receivedDateStr = new Date(t.receivedAt).toISOString().split('T')[0];
        if (receivedDateStr === todayStr) {
          receivedToday++;
        }
      }
    });

    return { pending, inTransit, receivedToday };
  }, [transfers]);

  // Filtered Transfers
  const filteredTransfers = useMemo(() => {
    return transfers.filter((t) => {
      // Status filter
      if (statusFilter !== 'ALL' && t.status !== statusFilter) {
        return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCode = String(t.trackingCode || t.id).toLowerCase().includes(q);
        const matchProd = String(t.productTitle || t.product?.title || t.productId).toLowerCase().includes(q);
        const matchSeller = String(t.sellerName || t.seller?.name || t.sellerId).toLowerCase().includes(q);
        const matchStore = String(t.storeName || t.seller?.storeName || '').toLowerCase().includes(q);
        const matchHub = String(t.warehouseName || t.destinationWarehouse?.name || t.toWarehouseId).toLowerCase().includes(q);
        return matchCode || matchProd || matchSeller || matchStore || matchHub;
      }

      return true;
    });
  }, [transfers, statusFilter, searchQuery]);

  // Handle Mark In Transit
  const handleMarkInTransit = async (transferId: string) => {
    setIsProcessingAction(true);
    try {
      const res = await AdminService.markInventoryTransferInTransit(transferId);
      if (res.success) {
        showToast(res.message || 'Transferência marcada como em trânsito com sucesso.');
        fetchTransfers(true);
      } else {
        showToast(res.message || 'Erro ao atualizar status da transferência.');
      }
    } catch (err: any) {
      showToast(err?.message || 'Erro ao marcar transferência em trânsito.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Handle Confirm Receipt (Execute Physical Stock Transfer)
  const handleConfirmReceipt = async () => {
    if (!receiveModalTransfer) return;
    setIsProcessingAction(true);
    try {
      const res = await AdminService.receiveInventoryTransfer(receiveModalTransfer.id);
      if (res.success) {
        showToast(res.message || 'Transferência confirmada e recebida no HUB com sucesso!');
        setReceiveModalTransfer(null);
        fetchTransfers(true);
      } else {
        showToast(res.message || 'Erro ao confirmar recebimento de transferência.');
      }
    } catch (err: any) {
      showToast(err?.message || 'Erro ao confirmar recebimento de transferência.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Handle Admin Cancel Transfer
  const handleCancelTransfer = async (transferId: string) => {
    if (!window.confirm('Deseja realmente cancelar esta solicitação de transferência administrativamente?')) return;
    setIsProcessingAction(true);
    try {
      const res = await AdminService.cancelInventoryTransfer(transferId);
      if (res.success) {
        showToast(res.message || 'Solicitação de transferência cancelada com sucesso.');
        fetchTransfers(true);
      } else {
        showToast(res.message || 'Erro ao cancelar transferência.');
      }
    } catch (err: any) {
      showToast(err?.message || 'Erro ao cancelar transferência.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Handle Create New HUB
  const handleAddHub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim() || !countryCode.trim() || !city.trim() || !address.trim()) {
      showToast('Por favor, preencha todos os campos obrigatórios (Código, Nome, País, Cidade e Endereço).');
      return;
    }

    setIsSubmittingHub(true);
    try {
      const res = await AdminService.createWarehouse({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        countryCode: countryCode.trim().toUpperCase(),
        city: city.trim(),
        address: address.trim(),
        managerName: managerName.trim() || undefined,
        staffCount: staffCount ? parseInt(staffCount) : undefined,
      });

      if (res.success && res.data) {
        setWarehouses((prev) => [res.data, ...prev]);
        showToast(res.message || `Novo HUB Logístico "${name}" cadastrado com sucesso!`);
        setIsAddModalOpen(false);
        setCode('');
        setName('');
        setCountryCode('GW');
        setCity('');
        setAddress('');
        setManagerName('');
        setStaffCount('');
      } else {
        showToast(res.message || 'Erro ao cadastrar HUB Logístico.');
      }
    } catch (err: any) {
      showToast(`Erro ao cadastrar HUB: ${err?.message || 'Falha de comunicação com o servidor'}`);
    } finally {
      setIsSubmittingHub(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Warehouse className="w-6 h-6 text-purple-600" />
            Centros de Distribuição & Recebimento nos HUBs
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Gestão operacional de armazéns e conferência de recebimento físico de mercadorias nos HUBs Nusali.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              fetchWarehouses();
              fetchTransfers(true);
            }}
            disabled={isRefreshing}
            className="p-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            title="Atualizar dados"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-md cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" /> Cadastrar Novo HUB
          </button>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex border-b border-gray-200 gap-2 bg-white px-4 pt-3 rounded-2xl shadow-xs border">
        <button
          onClick={() => setActiveTab('transfers')}
          className={`pb-3 px-4 font-extrabold text-xs flex items-center gap-2 border-b-2 transition cursor-pointer ${
            activeTab === 'transfers'
              ? 'border-purple-600 text-purple-700'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <Truck className="w-4 h-4" />
          Transferências para HUB
          {transferCounters.pending + transferCounters.inTransit > 0 && (
            <span className="bg-purple-100 text-purple-800 text-[10px] px-2 py-0.5 rounded-full font-black">
              {transferCounters.pending + transferCounters.inTransit}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('warehouses')}
          className={`pb-3 px-4 font-extrabold text-xs flex items-center gap-2 border-b-2 transition cursor-pointer ${
            activeTab === 'warehouses'
              ? 'border-purple-600 text-purple-700'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Centros de Distribuição ({warehouses.length})
        </button>

        <button
          onClick={() => setActiveTab('hub_orders')}
          className={`pb-3 px-4 font-extrabold text-xs flex items-center gap-2 border-b-2 transition cursor-pointer ${
            activeTab === 'hub_orders'
              ? 'border-purple-600 text-purple-700'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          Pedidos do HUB (Fulfillment)
          {hubOrders.length > 0 && (
            <span className="bg-purple-100 text-purple-800 text-[10px] px-2 py-0.5 rounded-full font-black">
              {hubOrders.length}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: TRANSFERÊNCIAS (ADMIN / LOGÍSTICA) */}
      {activeTab === 'transfers' && (
        <div className="space-y-6">
          {/* Counters Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-amber-800 uppercase block">Aguardando Envio</span>
                <span className="text-2xl font-black text-amber-900">{transferCounters.pending}</span>
              </div>
              <div className="p-3 bg-amber-100 text-amber-800 rounded-2xl">
                <Clock className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-blue-800 uppercase block">Em Trânsito para HUB</span>
                <span className="text-2xl font-black text-blue-900">{transferCounters.inTransit}</span>
              </div>
              <div className="p-3 bg-blue-100 text-blue-800 rounded-2xl">
                <Truck className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-emerald-800 uppercase block">Recebidas Hoje</span>
                <span className="text-2xl font-black text-emerald-900">{transferCounters.receivedToday}</span>
              </div>
              <div className="p-3 bg-emerald-100 text-emerald-800 rounded-2xl">
                <PackageCheck className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Filters & Search Bar */}
          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Status Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto text-xs font-bold">
              <span className="text-gray-400 text-[10px] uppercase font-black mr-1 flex items-center gap-1">
                <Filter className="w-3 h-3" /> Status:
              </span>
              {[
                { id: 'ALL', label: 'Todas' },
                { id: 'PENDING', label: 'Aguardando' },
                { id: 'IN_TRANSIT', label: 'Em Trânsito' },
                { id: 'RECEIVED', label: 'Recebidas' },
                { id: 'CANCELLED', label: 'Canceladas' },
              ].map((pill) => (
                <button
                  key={pill.id}
                  onClick={() => setStatusFilter(pill.id)}
                  className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${
                    statusFilter === pill.id
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar por código, loja, produto, vendedor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs font-medium bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3 py-2 focus:bg-white focus:border-purple-600 outline-none transition"
              />
            </div>
          </div>

          {/* Transfers Table */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Truck className="w-4 h-4 text-purple-600" /> Solicitações de Envio Registradas
              </h2>
              <span className="text-xs font-mono font-bold text-gray-500">
                {filteredTransfers.length} registro(s)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase tracking-wider">
                    <th className="p-3">Data / Código</th>
                    <th className="p-3">Vendedor / Loja</th>
                    <th className="p-3">Contato / Coleta</th>
                    <th className="p-3">Produto</th>
                    <th className="p-3 text-center">Qtd</th>
                    <th className="p-3">HUB Destino</th>
                    <th className="p-3 text-center">Modalidade</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium">
                  {isLoadingTransfers ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-gray-400 font-bold">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-purple-600 mb-2" />
                        Carregando transferências de estoque...
                      </td>
                    </tr>
                  ) : filteredTransfers.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-gray-400 font-bold">
                        Nenhuma solicitação de transferência encontrada.
                      </td>
                    </tr>
                  ) : (
                    filteredTransfers.map((t) => {
                      const dateStr = t.createdAt
                        ? new Date(t.createdAt).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })
                        : '-';

                      const sellerNameStr = t.sellerName || t.seller?.name || 'Não informado';
                      const storeNameStr = t.storeName || t.seller?.storeName || 'Não informado';
                      const phoneStr = t.sellerPhone || t.pickupLocation?.phone || 'Não informado';

                      const pickupAddrStr = t.pickupAddress || t.pickupLocation?.address || 'Não informado';
                      const pickupCityStr = t.pickupCity || t.pickupLocation?.city || 'Não informado';

                      const productTitleStr = t.productTitle || t.product?.title || t.productId;
                      const productImageStr = t.productImage || t.product?.image;

                      const hubNameStr = t.warehouseName || t.destinationWarehouse?.name || t.toWarehouseId;

                      let deliveryModeBadge = (
                        <span className="bg-gray-100 text-gray-600 border border-gray-200 text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                          Modalidade não informada
                        </span>
                      );

                      if (t.deliveryMode === 'NUSALI_PICKUP') {
                        deliveryModeBadge = (
                          <span className="bg-purple-100 text-purple-900 border border-purple-200 text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                            <Truck className="w-3 h-3 text-purple-700" /> Coleta Nusali
                          </span>
                        );
                      } else if (t.deliveryMode === 'SELLER_DROPOFF') {
                        deliveryModeBadge = (
                          <span className="bg-gray-100 text-gray-800 border border-gray-200 text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                            <Store className="w-3 h-3 text-gray-600" /> Entrega Vendedor
                          </span>
                        );
                      }

                      let statusBadge = (
                        <span className="bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-bold px-2.5 py-1 rounded-full inline-flex items-center gap-1 whitespace-nowrap">
                          <Clock className="w-3 h-3" /> Solicitação criada
                        </span>
                      );

                      if (t.status === 'IN_TRANSIT') {
                        statusBadge = (
                          <span className="bg-blue-100 text-blue-900 border border-blue-200 text-[10px] font-bold px-2.5 py-1 rounded-full inline-flex items-center gap-1 whitespace-nowrap">
                            <Truck className="w-3 h-3" /> Em trânsito
                          </span>
                        );
                      } else if (t.status === 'RECEIVED') {
                        statusBadge = (
                          <span className="bg-emerald-100 text-emerald-900 border border-emerald-200 text-[10px] font-bold px-2.5 py-1 rounded-full inline-flex items-center gap-1 whitespace-nowrap">
                            <PackageCheck className="w-3 h-3" /> Recebido no HUB
                          </span>
                        );
                      } else if (t.status === 'CANCELLED') {
                        statusBadge = (
                          <span className="bg-gray-100 text-gray-600 border border-gray-200 text-[10px] font-bold px-2.5 py-1 rounded-full inline-flex items-center gap-1 whitespace-nowrap">
                            <XCircle className="w-3 h-3" /> Cancelado
                          </span>
                        );
                      }

                      return (
                        <tr key={t.id} className="hover:bg-gray-50/50">
                          <td className="p-3">
                            <span className="font-mono text-gray-500 text-[11px] block">{dateStr}</span>
                            <span className="text-[10px] font-mono text-purple-700 font-bold block">
                              {t.trackingCode || t.id}
                            </span>
                          </td>

                          <td className="p-3">
                            <div className="flex items-center gap-1.5">
                              <Store className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                              <div>
                                <span className="font-bold text-gray-900 block">{storeNameStr}</span>
                                <span className="text-[10px] text-gray-500 block">{sellerNameStr}</span>
                              </div>
                            </div>
                          </td>

                          <td className="p-3 text-[11px]">
                            <div className="space-y-0.5">
                              <span className="text-gray-900 font-bold flex items-center gap-1">
                                <Phone className="w-3 h-3 text-emerald-600 shrink-0" /> {phoneStr}
                              </span>
                              <span className="text-gray-500 text-[10px] block truncate max-w-[150px]" title={pickupAddrStr}>
                                {pickupCityStr} • {pickupAddrStr}
                              </span>
                            </div>
                          </td>

                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              {productImageStr ? (
                                <img
                                  src={productImageStr}
                                  alt={productTitleStr}
                                  className="w-8 h-8 rounded-lg object-cover border border-gray-200 shrink-0"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">
                                  <Package className="w-4 h-4" />
                                </div>
                              )}
                              <span className="font-bold text-gray-900 block max-w-[160px] truncate" title={productTitleStr}>
                                {productTitleStr}
                              </span>
                            </div>
                          </td>

                          <td className="p-3 text-center font-black text-gray-900 text-sm">{t.quantity} un.</td>

                          <td className="p-3 text-gray-900 font-bold text-[11px]">{hubNameStr}</td>

                          <td className="p-3 text-center">{deliveryModeBadge}</td>

                          <td className="p-3 text-center">{statusBadge}</td>

                          <td className="p-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => setDetailModalTransfer(t)}
                                className="text-[11px] font-bold text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 px-2 py-1 rounded-lg transition cursor-pointer flex items-center gap-1"
                                title="Ver detalhes completos"
                              >
                                <Eye className="w-3.5 h-3.5" /> Detalhes
                              </button>

                              {t.status === 'PENDING' && (
                                <button
                                  onClick={() => handleMarkInTransit(t.id)}
                                  disabled={isProcessingAction}
                                  className="text-[11px] font-bold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition cursor-pointer disabled:opacity-50"
                                  title="Marcar em trânsito após coleta/envio"
                                >
                                  Em Trânsito
                                </button>
                              )}

                              {(t.status === 'PENDING' || t.status === 'IN_TRANSIT') && (
                                <>
                                  <button
                                    onClick={() => setReceiveModalTransfer(t)}
                                    disabled={isProcessingAction}
                                    className="text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1 rounded-lg transition shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1"
                                    title="Confirmar recebimento físico no HUB"
                                  >
                                    <CheckCircle2 className="w-3 h-3" /> Receber HUB
                                  </button>

                                  <button
                                    onClick={() => handleCancelTransfer(t.id)}
                                    disabled={isProcessingAction}
                                    className="text-[11px] font-bold text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-lg transition cursor-pointer disabled:opacity-50"
                                    title="Cancelar transferência"
                                  >
                                    Cancelar
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CENTROS DE DISTRIBUIÇÃO / HUBS */}
      {activeTab === 'warehouses' && (
        <div className="space-y-6">
          {isLoadingWarehouses ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-600 mb-2" />
              <p className="text-xs font-bold">Carregando HUBs do banco de dados...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {warehouses.length === 0 ? (
                <div className="md:col-span-2 bg-white rounded-2xl border border-gray-200 p-12 text-center space-y-3">
                  <Warehouse className="w-12 h-12 text-purple-300 mx-auto" />
                  <h3 className="font-extrabold text-base text-gray-700">Nenhum HUB cadastrado.</h3>
                  <p className="text-xs text-gray-400 max-w-sm mx-auto">
                    Ainda não existem Centros de Distribuição ou HUBs Logísticos cadastrados. Clique acima em "Cadastrar Novo HUB" para criar o primeiro armazém.
                  </p>
                </div>
              ) : (
                warehouses.map((w: WarehouseRecord) => {
                  const displayCountryCode = w.countryCode || w.country || 'GW';
                  const countryConf = countriesConfig[displayCountryCode] || countriesConfig.GW;
                  const displayManagerName = w.managerName || 'Não informado';
                  const displayStaffCount =
                    w.staffCount !== null && w.staffCount !== undefined ? `${w.staffCount} colaboradores` : 'Não informado';
                  const statusLabel = (w.status || 'active').toUpperCase() === 'ACTIVE' ? 'OPERACIONAL' : 'INATIVO';

                  return (
                    <div
                      key={w.id}
                      className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4 hover:border-purple-300 transition"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-base">{countryConf.flag}</span>
                            <span className="text-[10px] font-bold text-gray-400 font-mono">
                              {w.code} ({displayCountryCode})
                            </span>
                          </div>
                          <h3 className="font-extrabold text-base text-gray-900">{w.name}</h3>
                          <p className="text-xs text-purple-700 font-bold">
                            {w.city} • {w.address}
                          </p>
                        </div>

                        <span
                          className={`text-[10px] font-black px-2.5 py-1 rounded-full ${
                            statusLabel === 'OPERACIONAL'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {statusLabel}
                        </span>
                      </div>

                      <div className="space-y-2 text-xs border-t border-gray-100 pt-3">
                        <div className="flex justify-between text-gray-600">
                          <span>Responsável / Gerente:</span>
                          <strong className="text-gray-900 font-bold">{displayManagerName}</strong>
                        </div>
                        <div className="flex justify-between text-gray-600">
                          <span>Equipe Operacional:</span>
                          <strong className="text-gray-900 font-bold">{displayStaffCount}</strong>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PEDIDOS DO HUB (NUSALI FULFILLMENT) */}
      {activeTab === 'hub_orders' && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-xl p-6 space-y-4">
          <div className="flex justify-between items-center border-b border-gray-100 pb-4">
            <div>
              <h2 className="text-base font-black text-gray-900 flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-purple-600" /> Nusali Fulfillment - Pedidos Alocados aos HUBs
              </h2>
              <p className="text-xs text-gray-500 font-medium">
                Itens de pedidos de venda reservados nos Nusali HUBs para separação e despacho físico pela equipe logística.
              </p>
            </div>
            <span className="text-xs font-mono font-bold bg-purple-100 text-purple-900 px-3 py-1 rounded-full">
              {hubOrders.length} pedido(s) alocado(s)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase tracking-wider">
                  <th className="p-3">Data / Pedido</th>
                  <th className="p-3">Produto</th>
                  <th className="p-3 text-center">Qtd Reservada HUB</th>
                  <th className="p-3">HUB Logístico</th>
                  <th className="p-3">Comprador & Entrega</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right">Ação Operacional</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium">
                {isLoadingHubOrders ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-400 font-bold">
                      Carregando pedidos do HUB Nusali...
                    </td>
                  </tr>
                ) : hubOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-400 font-bold">
                      Nenhum item de pedido alocado aos HUBs Nusali no momento.
                    </td>
                  </tr>
                ) : (
                  hubOrders.map((ho) => {
                    const dateStr = ho.createdAt
                      ? new Date(ho.createdAt).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })
                      : '-';

                    const isPaid = ho.paymentStatus === 'paid';

                    let paymentBadge = (
                      <span className="bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                        <Clock className="w-3 h-3 text-amber-700" /> Pagamento: Pendente
                      </span>
                    );
                    if (isPaid) {
                      paymentBadge = (
                        <span className="bg-emerald-100 text-emerald-900 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3 text-emerald-700" /> Pagamento: Pago
                        </span>
                      );
                    }

                    const escrowBadge = (
                      <span className="bg-blue-100 text-blue-900 border border-blue-200 text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                        <Lock className="w-3 h-3 text-blue-700" /> Escrow: {ho.escrowStatus === 'held' ? 'Held' : ho.escrowStatus || 'Pendente'}
                      </span>
                    );

                    const fulfillmentBadge = (
                      <span className="bg-purple-100 text-purple-900 border border-purple-200 text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                        <Warehouse className="w-3 h-3 text-purple-700" /> Nusali HUB
                      </span>
                    );

                    let statusBadge = (
                      <span className="bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center justify-center gap-1">
                        <Clock className="w-3 h-3" /> Aguardando separação
                      </span>
                    );

                    if (ho.status === 'preparing' || ho.status === 'separating') {
                      statusBadge = (
                        <span className="bg-purple-100 text-purple-900 border border-purple-200 text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center justify-center gap-1">
                          <Package className="w-3 h-3 text-purple-700" /> Em separação
                        </span>
                      );
                    } else if (ho.status === 'ready_to_ship') {
                      statusBadge = (
                        <span className="bg-blue-100 text-blue-900 border border-blue-200 text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center justify-center gap-1">
                          <PackageCheck className="w-3 h-3 text-blue-700" /> Pronto para expedição
                        </span>
                      );
                    } else if (ho.status === 'shipped') {
                      statusBadge = (
                        <span className="bg-emerald-100 text-emerald-900 border border-emerald-200 text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center justify-center gap-1">
                          <Truck className="w-3 h-3 text-emerald-700" /> Despachado do HUB
                        </span>
                      );
                    }

                    return (
                      <tr key={ho.id} className="hover:bg-gray-50/50">
                        <td className="p-3">
                          <span className="font-mono text-gray-500 text-[11px] block">{dateStr}</span>
                          <span className="text-[11px] font-bold text-gray-900 block">{ho.orderNumber || ho.orderId}</span>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {fulfillmentBadge}
                          </div>
                        </td>

                        <td className="p-3">
                          <div className="flex items-center gap-2.5">
                            {ho.productImage ? (
                              <img
                                src={ho.productImage}
                                alt={ho.productTitle}
                                className="w-9 h-9 rounded-xl object-cover border border-gray-200 shrink-0"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">
                                <Package className="w-4 h-4" />
                              </div>
                            )}
                            <div>
                              <span className="font-bold text-gray-900 block text-xs">{ho.productTitle}</span>
                              <span className="text-[10px] font-mono text-gray-400">SKU: {ho.productSku}</span>
                            </div>
                          </div>
                        </td>

                        <td className="p-3 text-center font-black text-purple-900 text-sm">
                          {ho.quantityReservedAtHub} un.
                        </td>

                        <td className="p-3 text-gray-900 font-bold text-xs">
                          <div className="flex items-center gap-1">
                            <Building2 className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                            <span>{ho.warehouseName}</span>
                          </div>
                        </td>

                        <td className="p-3">
                          <span className="font-bold text-gray-900 block text-xs">{ho.buyerName}</span>
                          <span className="text-[10px] text-gray-500 block">{ho.buyerAddress}</span>
                          <span className="text-[10px] text-emerald-700 font-semibold">{ho.buyerPhone}</span>
                        </td>

                        <td className="p-3 text-center space-y-1">
                          {statusBadge}
                          <div className="flex flex-col items-center gap-1 mt-1">
                            {paymentBadge}
                            {escrowBadge}
                          </div>
                        </td>

                        <td className="p-3 text-right">
                          <div className="flex flex-col items-end gap-1.5">
                            {!isPaid && (
                              <div className="flex flex-col items-end gap-1">
                                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3 text-amber-600" /> Aguardando confirmação do pagamento
                                </span>
                                {process.env.NODE_ENV !== 'production' && (
                                  <button
                                    onClick={() => handleConfirmDevPayment(ho.orderId)}
                                    disabled={updatingHubItemId === ho.id}
                                    className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold rounded-lg transition cursor-pointer shadow-xs inline-flex items-center gap-1 disabled:opacity-50"
                                    title="Simular pagamento aprovado em ambiente de desenvolvimento"
                                  >
                                    <CreditCard className="w-3 h-3" /> Simular Pagamento Aprovado
                                  </button>
                                )}
                              </div>
                            )}

                            {isPaid && ho.status !== 'shipped' && (
                              <div className="flex items-center justify-end gap-1.5">
                                {ho.status !== 'preparing' && ho.status !== 'ready_to_ship' && (
                                  <button
                                    onClick={() => handleUpdateHubOrderStatus(ho.id, 'preparing')}
                                    disabled={updatingHubItemId === ho.id}
                                    className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-800 text-xs font-bold rounded-lg transition cursor-pointer disabled:opacity-50"
                                  >
                                    Separar
                                  </button>
                                )}
                                {ho.status !== 'ready_to_ship' && (
                                  <button
                                    onClick={() => handleUpdateHubOrderStatus(ho.id, 'ready_to_ship')}
                                    disabled={updatingHubItemId === ho.id}
                                    className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-bold rounded-lg transition cursor-pointer disabled:opacity-50"
                                  >
                                    Pronto Expedição
                                  </button>
                                )}
                                <button
                                  onClick={() => handleUpdateHubOrderStatus(ho.id, 'shipped')}
                                  disabled={updatingHubItemId === ho.id}
                                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition cursor-pointer shadow-xs disabled:opacity-50"
                                >
                                  Despachar HUB
                                </button>
                              </div>
                            )}

                            {ho.status === 'shipped' && (
                              <span className="text-xs font-bold text-emerald-700">Concluído</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: DETALHES COMPLETOS DA TRANSFERÊNCIA */}
      {detailModalTransfer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 space-y-5 animate-fadeIn relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-purple-100 text-purple-800 rounded-2xl">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base text-gray-900">Detalhes da Transferência</h3>
                  <p className="text-xs text-purple-700 font-mono font-bold">
                    {detailModalTransfer.trackingCode || detailModalTransfer.id}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setDetailModalTransfer(null)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modalidade e Status Badge */}
            <div className="flex items-center justify-between gap-2 bg-gray-50 p-3 rounded-2xl border border-gray-200">
              <span className="text-xs font-bold text-gray-500">Modalidade:</span>
              <span className="text-xs font-extrabold text-purple-800 bg-purple-50 border border-purple-200 px-3 py-1 rounded-full">
                {detailModalTransfer.deliveryMode === 'NUSALI_PICKUP'
                  ? 'Coleta pela Nusali (NUSALI_PICKUP)'
                  : detailModalTransfer.deliveryMode === 'SELLER_DROPOFF'
                  ? 'Entrega Direta pelo Vendedor no HUB (SELLER_DROPOFF)'
                  : 'Modalidade não informada'}
              </span>
            </div>

            {/* Vendedor & Contato */}
            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 space-y-2 text-xs font-medium">
              <h4 className="font-bold text-gray-900 border-b border-gray-200 pb-1 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                <Store className="w-4 h-4 text-purple-600" /> Vendedor & Loja
              </h4>
              <div className="flex justify-between">
                <span className="text-gray-500">Loja:</span>
                <strong className="text-gray-900">{detailModalTransfer.storeName || detailModalTransfer.seller?.storeName || 'Não informado'}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Responsável:</span>
                <strong className="text-gray-900">{detailModalTransfer.sellerName || detailModalTransfer.seller?.name || 'Não informado'}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Telefone:</span>
                <strong className="text-emerald-700 font-bold">{detailModalTransfer.sellerPhone || detailModalTransfer.pickupLocation?.phone || 'Não informado'}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">E-mail:</span>
                <strong className="text-gray-900 font-mono text-[11px]">{detailModalTransfer.seller?.email || 'Não informado'}</strong>
              </div>
            </div>

            {/* Endereço de Coleta / Origem */}
            <div className="bg-purple-50/50 p-4 rounded-2xl border border-purple-100 space-y-2 text-xs font-medium">
              <h4 className="font-bold text-purple-900 border-b border-purple-200/60 pb-1 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-purple-600" /> Local de Coleta / Origem
              </h4>
              <p className="text-gray-900 font-bold text-xs leading-relaxed">
                {detailModalTransfer.pickupAddress || detailModalTransfer.pickupLocation?.address || 'Não informado'}
              </p>
              <p className="text-purple-700 text-[11px] font-semibold">
                {detailModalTransfer.pickupCity || detailModalTransfer.pickupLocation?.city || 'Não informado'}{detailModalTransfer.pickupRegion || detailModalTransfer.pickupLocation?.region ? `, ${detailModalTransfer.pickupRegion || detailModalTransfer.pickupLocation?.region}` : ''} ({detailModalTransfer.pickupCountryCode || detailModalTransfer.pickupLocation?.countryCode || 'Não informado'})
              </p>
            </div>

            {/* Produto & Quantidade */}
            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 space-y-3 text-xs font-medium">
              <h4 className="font-bold text-gray-900 border-b border-gray-200 pb-1 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                <Package className="w-4 h-4 text-purple-600" /> Produto & Quantidade
              </h4>
              <div className="flex items-center gap-3">
                {detailModalTransfer.productImage || detailModalTransfer.product?.image ? (
                  <img
                    src={detailModalTransfer.productImage || detailModalTransfer.product?.image}
                    alt={detailModalTransfer.productTitle || detailModalTransfer.product?.title}
                    className="w-12 h-12 rounded-xl object-cover border border-gray-200 shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">
                    <Package className="w-6 h-6" />
                  </div>
                )}
                <div>
                  <h5 className="font-bold text-gray-900 text-sm">
                    {detailModalTransfer.productTitle || detailModalTransfer.product?.title}
                  </h5>
                  <p className="text-[10px] font-mono text-gray-500">
                    SKU / Ref: {detailModalTransfer.productSku || detailModalTransfer.product?.sku || detailModalTransfer.productId}
                  </p>
                </div>
              </div>

              <div className="flex justify-between border-t border-gray-200 pt-2 text-xs">
                <span className="text-gray-500">Quantidade Solicitada:</span>
                <strong className="text-base font-black text-gray-900">{detailModalTransfer.quantity} unidades</strong>
              </div>
            </div>

            {/* HUB Destino */}
            <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100 space-y-2 text-xs font-medium">
              <h4 className="font-bold text-emerald-900 border-b border-emerald-200/60 pb-1 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                <Warehouse className="w-4 h-4 text-emerald-600" /> Nusali HUB Destino
              </h4>
              <p className="text-gray-900 font-bold text-sm">
                {detailModalTransfer.warehouseName || detailModalTransfer.destinationWarehouse?.name}
              </p>
              <p className="text-emerald-800 text-[11px]">
                {detailModalTransfer.warehouseAddress || detailModalTransfer.destinationWarehouse?.address || 'Não informado'} • {detailModalTransfer.warehouseCity || detailModalTransfer.destinationWarehouse?.city || 'Não informado'} ({detailModalTransfer.warehouseCountry || detailModalTransfer.destinationWarehouse?.countryCode || 'Não informado'})
              </p>
            </div>

            <div className="pt-2 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                onClick={() => setDetailModalTransfer(null)}
                className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CONFIRMAR RECEBIMENTO FÍSICO NO HUB */}
      {receiveModalTransfer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-5 animate-fadeIn relative">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-2xl">
                  <PackageCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base text-gray-900">Confirmar Recebimento Físico</h3>
                  <p className="text-xs text-gray-500">Conferência e entrada de estoque no Nusali HUB.</p>
                </div>
              </div>

              <button
                onClick={() => setReceiveModalTransfer(null)}
                disabled={isProcessingAction}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Transfer Card Details */}
            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 text-xs space-y-2 font-medium">
              <div className="flex justify-between">
                <span className="text-gray-500">Código de Rastreamento:</span>
                <span className="font-mono font-bold text-purple-700">
                  {receiveModalTransfer.trackingCode || receiveModalTransfer.id}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Produto:</span>
                <span className="font-bold text-gray-900">
                  {receiveModalTransfer.productTitle || receiveModalTransfer.product?.title || receiveModalTransfer.productId}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Vendedor / Loja:</span>
                <span className="font-bold text-gray-900">
                  {receiveModalTransfer.storeName || receiveModalTransfer.sellerName || receiveModalTransfer.sellerId}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">HUB Destino:</span>
                <span className="font-bold text-emerald-800">
                  {receiveModalTransfer.warehouseName || receiveModalTransfer.destinationWarehouse?.name || receiveModalTransfer.toWarehouseId}
                </span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-2">
                <span className="text-gray-500">Quantidade a Receber:</span>
                <span className="font-black text-gray-900 text-sm">{receiveModalTransfer.quantity} unidades</span>
              </div>
            </div>

            {/* Physical Stock Movement Explanation Notice */}
            <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-2xl text-xs text-blue-900 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-blue-600 shrink-0" />
                Confirmação de Entrada Física:
              </p>
              <p className="text-[11px] text-blue-800 font-medium">
                Confirma que estas <strong>{receiveModalTransfer.quantity} unidades</strong> foram fisicamente recebidas
                e conferidas no HUB?
              </p>
              <p className="text-[10px] text-blue-700">
                • O saldo no estabelecimento do vendedor diminuirá em {receiveModalTransfer.quantity} un.
                <br />• O saldo no HUB aumentará em {receiveModalTransfer.quantity} un.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 border-t border-gray-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setReceiveModalTransfer(null)}
                disabled={isProcessingAction}
                className="px-4 py-2.5 border border-gray-300 font-bold text-xs text-gray-700 rounded-xl hover:bg-gray-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmReceipt}
                disabled={isProcessingAction}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isProcessingAction ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Processando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Confirmar Recebimento
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ADD HUB */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
                <Warehouse className="w-5 h-5 text-purple-600" /> Cadastrar Novo HUB Logístico
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                disabled={isSubmittingHub}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddHub} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Código do HUB *:</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: HUB-BIS-01"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold uppercase"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">País (countryCode) *:</label>
                  <select
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                  >
                    <option value="GW">🇬🇼 Guiné-Bissau (GW)</option>
                    <option value="PT">🇵🇹 Portugal (PT)</option>
                    <option value="BR">🇧🇷 Brasil (BR)</option>
                    <option value="AO">🇦🇴 Angola (AO)</option>
                    <option value="MZ">🇲🇿 Moçambique (MZ)</option>
                    <option value="CV">🇨🇻 Cabo Verde (CV)</option>
                    <option value="ST">🇸🇹 São Tomé e Príncipe (ST)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Nome do HUB *:</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: HUB Nusali Bissau Central"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Cidade *:</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Bissau"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Endereço Físico *:</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Zona Industrial de Bandim"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Gerente (Opcional):</label>
                  <input
                    type="text"
                    placeholder="Nome do responsável"
                    value={managerName}
                    onChange={(e) => setManagerName(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Nº Colaboradores (Opcional):</label>
                  <input
                    type="number"
                    placeholder="Ex: 5"
                    value={staffCount}
                    onChange={(e) => setStaffCount(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  disabled={isSubmittingHub}
                  className="px-4 py-2 border border-gray-300 font-bold text-gray-700 rounded-xl hover:bg-gray-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingHub}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-xl shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingHub ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Cadastrando...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" /> Cadastrar HUB
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
