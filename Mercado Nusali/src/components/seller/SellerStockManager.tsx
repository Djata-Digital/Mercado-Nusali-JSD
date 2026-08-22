import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Boxes,
  Warehouse,
  X,
  Clock,
  XCircle,
  RefreshCw,
  Truck,
  Building2,
  PackageCheck,
  AlertCircle,
  MapPin,
  CheckCircle2,
  Store,
  Package,
} from 'lucide-react';
import { SellerService } from '../../services/sellerService';
import { countriesConfig } from '../../utils/currencyUtils';

interface SellerStockManagerProps {
  warehouses?: any[];
  showToast: (msg: string) => void;
}

export const SellerStockManager: React.FC<SellerStockManagerProps> = ({ showToast }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [inventoryList, setInventoryList] = useState<any[]>([]);
  const [transfersList, setTransfersList] = useState<any[]>([]);
  const [warehousesList, setWarehousesList] = useState<any[]>([]);
  const [productsList, setProductsList] = useState<any[]>([]);
  const [sellerProfile, setSellerProfile] = useState<any>(null);
  const [sellerStore, setSellerStore] = useState<any>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [deliveryMode, setDeliveryMode] = useState<'NUSALI_PICKUP' | 'SELLER_DROPOFF'>('NUSALI_PICKUP');
  const [quantityInput, setQuantityInput] = useState<string>('1');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Fetch all stock, transfers, warehouses & products data from API
  const fetchData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const [invRes, trfRes, whRes, prodRes, profileRes, storesRes] = await Promise.all([
        SellerService.getInventory(),
        SellerService.getTransfers(),
        SellerService.getWarehouses(),
        SellerService.getProducts(),
        SellerService.getProfile(),
        SellerService.getStores(),
      ]);

      if (invRes.success && Array.isArray(invRes.data)) {
        setInventoryList(invRes.data);
      }
      if (trfRes.success && Array.isArray(trfRes.data)) {
        setTransfersList(trfRes.data);
      }
      if (whRes.success && Array.isArray(whRes.data)) {
        setWarehousesList(whRes.data);
      }
      if (prodRes.success && Array.isArray(prodRes.data)) {
        setProductsList(prodRes.data);
      }
      if (profileRes.success) {
        setSellerProfile(profileRes.data);
      }
      if (storesRes.success && Array.isArray(storesRes.data) && storesRes.data.length > 0) {
        setSellerStore(storesRes.data[0]);
      }
    } catch (err: any) {
      console.error('Erro ao carregar dados de estoque:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Seller pickup address resolved
  const sellerPickupAddressStr = useMemo(() => {
    if (sellerStore?.address) return sellerStore.address;
    if (sellerProfile?.address) return sellerProfile.address;
    if (sellerProfile?.street) {
      return `${sellerProfile.street}, ${sellerProfile.number || ''} ${sellerProfile.neighborhood || ''} ${sellerProfile.city || ''}`.trim();
    }
    return '';
  }, [sellerStore, sellerProfile]);

  // 1. Filter SELLER_LOCATION inventory items
  const sellerLocationsList = useMemo(() => {
    return inventoryList.filter(
      (inv) => inv.locationType === 'SELLER_LOCATION' || !inv.warehouseId
    );
  }, [inventoryList]);

  // 2. Filter NUSALI_HUB inventory items
  const hubLocationsList = useMemo(() => {
    return inventoryList.filter(
      (inv) => inv.locationType === 'NUSALI_HUB' && Boolean(inv.warehouseId)
    );
  }, [inventoryList]);

  // 3. Compute Product Summary Across All Locations
  const productSummaries = useMemo(() => {
    const map = new Map<string, any>();

    // Seed from productsList first
    productsList.forEach((prod) => {
      map.set(String(prod.id), {
        product: prod,
        productId: String(prod.id),
        title: prod.title,
        sku: prod.sku || prod.id,
        image: prod.image || (prod.images && prod.images[0]) || null,
        sellerOnHand: 0,
        sellerReserved: 0,
        hubOnHand: 0,
        hubReserved: 0,
      });
    });

    // Process all inventory records
    inventoryList.forEach((inv) => {
      const pId = String(inv.productId);
      let entry = map.get(pId);
      if (!entry) {
        entry = {
          product: null,
          productId: pId,
          title: `Produto ${pId}`,
          sku: pId,
          image: null,
          sellerOnHand: 0,
          sellerReserved: 0,
          hubOnHand: 0,
          hubReserved: 0,
        };
        map.set(pId, entry);
      }

      const onHand = Number(inv.quantityOnHand) || 0;
      const reserved = Number(inv.quantityReserved) || 0;

      if (inv.locationType === 'NUSALI_HUB' && inv.warehouseId) {
        entry.hubOnHand += onHand;
        entry.hubReserved += reserved;
      } else {
        entry.sellerOnHand += onHand;
        entry.sellerReserved += reserved;
      }
    });

    return Array.from(map.values()).map((e) => {
      const totalOnHand = e.sellerOnHand + e.hubOnHand;
      const totalReserved = e.sellerReserved + e.hubReserved;
      const totalAvailable = Math.max(0, totalOnHand - totalReserved);
      return {
        ...e,
        totalOnHand,
        totalReserved,
        totalAvailable,
        sellerAvailable: Math.max(0, e.sellerOnHand - e.sellerReserved),
        hubAvailable: Math.max(0, e.hubOnHand - e.hubReserved),
      };
    });
  }, [productsList, inventoryList]);

  // Selected Product details for Modal
  const selectedProduct = useMemo(() => {
    return productsList.find((p) => String(p.id) === String(selectedProductId)) || null;
  }, [productsList, selectedProductId]);

  // Selected Warehouse details
  const selectedWarehouse = useMemo(() => {
    return warehousesList.find((w) => String(w.id) === String(selectedWarehouseId)) || null;
  }, [warehousesList, selectedWarehouseId]);

  // Parsed Variants for Selected Product
  const productVariants = useMemo(() => {
    if (!selectedProduct?.attributesJson) return [];
    try {
      const parsed =
        typeof selectedProduct.attributesJson === 'string'
          ? JSON.parse(selectedProduct.attributesJson)
          : selectedProduct.attributesJson;

      if (Array.isArray(parsed?.variants)) return parsed.variants;
      if (Array.isArray(parsed)) return parsed;
      return [];
    } catch {
      return [];
    }
  }, [selectedProduct]);

  // Available Stock for Transfer Calculation (SELLER_LOCATION inventory row)
  const transferStockInfo = useMemo(() => {
    if (!selectedProduct) return { onHand: 0, reserved: 0, pendingTransfers: 0, availableForTransfer: 0 };

    const sellerInv = inventoryList.find((inv) => {
      const isSellerLoc = inv.locationType === 'SELLER_LOCATION' || !inv.warehouseId;
      const isSameProd = String(inv.productId) === String(selectedProduct.id);
      const isSameVar = selectedVariantId ? String(inv.variantId) === String(selectedVariantId) : true;
      return isSellerLoc && isSameProd && isSameVar;
    });

    const onHand = Number(sellerInv?.quantityOnHand) || 0;
    const reserved = Number(sellerInv?.quantityReserved) || 0;

    const pendingTransfers = transfersList.reduce((sum, trf) => {
      const isSameProd = String(trf.productId) === String(selectedProduct.id);
      const isSameVar = selectedVariantId ? String(trf.variantId) === String(selectedVariantId) : true;
      const isActivePending = trf.status === 'PENDING' || trf.status === 'IN_TRANSIT';

      if (isSameProd && isSameVar && isActivePending) {
        return sum + (Number(trf.quantity) || 0);
      }
      return sum;
    }, 0);

    const availableForTransfer = Math.max(0, onHand - reserved - pendingTransfers);

    return {
      onHand,
      reserved,
      pendingTransfers,
      availableForTransfer,
    };
  }, [selectedProduct, selectedVariantId, inventoryList, transfersList]);

  // Reset variant & auto-select defaults on product change
  useEffect(() => {
    if (selectedProduct) {
      if (productVariants.length > 0) {
        setSelectedVariantId(String(productVariants[0].id || productVariants[0].sku || ''));
      } else {
        setSelectedVariantId('');
      }
    }
  }, [selectedProduct, productVariants]);

  // Default warehouse selection when modal opens
  useEffect(() => {
    if (isModalOpen && warehousesList.length > 0 && !selectedWarehouseId) {
      setSelectedWarehouseId(String(warehousesList[0].id));
    }
  }, [isModalOpen, warehousesList, selectedWarehouseId]);

  // Open modal handler
  const handleOpenModal = () => {
    setModalError(null);
    setQuantityInput('1');
    setDeliveryMode('NUSALI_PICKUP');
    if (productsList.length > 0) {
      setSelectedProductId(String(productsList[0].id));
    }
    if (warehousesList.length > 0) {
      setSelectedWarehouseId(String(warehousesList[0].id));
    }
    setIsModalOpen(true);
  };

  // Submit Stock Transfer Request
  const handleSubmitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    const qty = Math.floor(Number(quantityInput));
    if (isNaN(qty) || qty <= 0) {
      setModalError('Informe uma quantidade inteira maior que 0.');
      return;
    }

    if (!selectedProductId) {
      setModalError('Selecione um produto.');
      return;
    }

    if (!selectedWarehouseId) {
      setModalError('Selecione o Nusali HUB de destino.');
      return;
    }

    if (deliveryMode === 'NUSALI_PICKUP') {
      const city = sellerStore?.city || sellerProfile?.city;
      const country = sellerStore?.countryCode || sellerProfile?.countryCode;
      const phone = sellerProfile?.phone || sellerStore?.phone;

      if (!sellerPickupAddressStr || !city || !country || !phone) {
        setModalError('PICKUP_LOCATION_INCOMPLETE: Por favor, cadastre o endereço completo (rua, cidade, país) e o telefone de contato da sua loja antes de solicitar a coleta pela Nusali.');
        return;
      }
    }

    if (qty > transferStockInfo.availableForTransfer) {
      setModalError(
        `Você possui apenas ${transferStockInfo.availableForTransfer} unidades disponíveis no seu estabelecimento.`
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await SellerService.requestTransfer({
        productId: selectedProductId,
        variantId: selectedVariantId || undefined,
        toWarehouseId: selectedWarehouseId,
        quantity: qty,
        deliveryMode,
        pickupSnapshotJson: deliveryMode === 'NUSALI_PICKUP' ? {
          storeName: sellerStore?.name || sellerProfile?.companyName || sellerProfile?.tradingName || null,
          contactName: sellerProfile?.fullName || null,
          phone: sellerProfile?.phone || sellerStore?.phone || null,
          address: sellerPickupAddressStr || null,
          city: sellerStore?.city || sellerProfile?.city || null,
          region: sellerStore?.region || sellerProfile?.state || null,
          countryCode: sellerStore?.countryCode || sellerProfile?.countryCode || null,
        } : null,
      });

      if (res.success) {
        showToast('Solicitação de transferência enviada com sucesso.');
        setIsModalOpen(false);
        fetchData(true);
      } else {
        setModalError(res.message || 'Erro ao criar solicitação de transferência.');
      }
    } catch (err: any) {
      setModalError(err?.message || 'Falha de conexão ao enviar transferência.');
    } finally {
      setSubmitting(false);
    }
  };

  // Cancel Pending Transfer Handler
  const handleCancelTransfer = async (transferId: string) => {
    if (!window.confirm('Deseja realmente cancelar esta solicitação de transferência?')) return;
    setCancellingId(transferId);
    try {
      const res = await SellerService.cancelTransfer(transferId);
      if (res.success) {
        showToast('Solicitação de transferência cancelada com sucesso.');
        fetchData(true);
      } else {
        showToast(res.message || 'Erro ao cancelar transferência.');
      }
    } catch (err: any) {
      showToast(err?.message || 'Erro ao cancelar transferência.');
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn pb-12">
      {/* HEADER SECTION */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-100 shadow-xl shadow-gray-100/50 flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-50 rounded-full blur-3xl -z-10 -mr-20 -mt-20"></div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-full text-xs font-bold">
            <Warehouse className="w-3.5 h-3.5" /> Gestão Logística Multilocal
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
            Estoque & Envio para HUB Nusali
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 max-w-2xl font-medium">
            Gerencie o estoque disponível no seu estabelecimento físico e envie unidades para os Nusali HUBs com Fulfillment Marketplace.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="p-3 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-2xl transition border border-gray-200 cursor-pointer"
            title="Atualizar dados"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleOpenModal}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-5 py-3.5 rounded-2xl transition flex items-center gap-2 shadow-lg shadow-emerald-600/20 cursor-pointer"
          >
            <Truck className="w-4 h-4" /> Enviar Inventário para o HUB
          </button>
        </div>
      </div>

      {/* BLOCO 1: RESUMO GERAL DE ESTOQUE POR PRODUTO */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-xl shadow-gray-100/50 p-6 space-y-4">
        <div className="flex justify-between items-center border-b border-gray-100 pb-4">
          <div>
            <h2 className="text-base font-black text-gray-900 flex items-center gap-2">
              <Boxes className="w-5 h-5 text-emerald-600" /> Resumo Geral de Estoque por Produto
            </h2>
            <p className="text-xs text-gray-500 font-medium">
              Visão consolidação multilocais (Estabelecimento Físico + HUBs Nusali).
            </p>
          </div>
          <span className="text-xs font-mono font-bold bg-emerald-100 text-emerald-900 px-3 py-1 rounded-full">
            {productSummaries.length} produto(s)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase tracking-wider">
                <th className="p-3">Produto</th>
                <th className="p-3 text-center">Estabelecimento (Físico)</th>
                <th className="p-3 text-center">Nusali HUBs</th>
                <th className="p-3 text-center">Total Físico</th>
                <th className="p-3 text-center">Reservado Vendas</th>
                <th className="p-3 text-center">Total Disponível</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-400 font-bold">
                    Carregando resumo de estoque...
                  </td>
                </tr>
              ) : productSummaries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-400 font-bold">
                    Nenhum produto cadastrado no catálogo.
                  </td>
                </tr>
              ) : (
                productSummaries.map((summary) => (
                  <tr key={summary.productId} className="hover:bg-gray-50/50">
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        {summary.image ? (
                          <img
                            src={summary.image}
                            alt={summary.title}
                            className="w-10 h-10 rounded-xl object-cover border border-gray-200 shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">
                            <Package className="w-5 h-5" />
                          </div>
                        )}
                        <div>
                          <span className="font-bold text-gray-900 block">{summary.title}</span>
                          <span className="text-[10px] font-mono text-gray-400">SKU: {summary.sku}</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <span className="font-bold text-gray-900 block">{summary.sellerOnHand} un.</span>
                      <span className="text-[10px] text-emerald-700 font-semibold">
                        Livre: {summary.sellerAvailable} un.
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <span className="font-bold text-purple-900 block">{summary.hubOnHand} un.</span>
                      <span className="text-[10px] text-purple-700 font-semibold">
                        Livre: {summary.hubAvailable} un.
                      </span>
                    </td>
                    <td className="p-3 text-center font-black text-gray-900">{summary.totalOnHand} un.</td>
                    <td className="p-3 text-center font-bold text-amber-700">{summary.totalReserved} un.</td>
                    <td className="p-3 text-center">
                      <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-900 rounded-full font-black text-xs">
                        {summary.totalAvailable} un.
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* BLOCO 2: MEU ESTOQUE (NO SEU ESTABELECIMENTO) */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-xl shadow-gray-100/50 p-6 space-y-4">
        <div className="flex justify-between items-center border-b border-gray-100 pb-4">
          <div>
            <h2 className="text-base font-black text-gray-900 flex items-center gap-2">
              <Store className="w-5 h-5 text-emerald-600" /> Meu Estoque (No Seu Estabelecimento)
            </h2>
            <p className="text-xs text-gray-500 font-medium">
              Produtos armazenados fisicamente na sua loja/depósito próprio.
            </p>
          </div>

          <span className="text-xs font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1 rounded-full">
            {sellerLocationsList.length} registro(s)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase tracking-wider">
                <th className="p-3">Produto / Variante</th>
                <th className="p-3 text-center">On Hand (Físico)</th>
                <th className="p-3 text-center">Reservado (Vendas)</th>
                <th className="p-3 text-center">Disponível (Livre)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-gray-400 font-bold">
                    Carregando estoque do estabelecimento...
                  </td>
                </tr>
              ) : sellerLocationsList.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-gray-400 font-bold">
                    Você não possui estoque no seu estabelecimento.
                  </td>
                </tr>
              ) : (
                sellerLocationsList.map((inv) => {
                  const prod = productsList.find((p) => String(p.id) === String(inv.productId));
                  const onHand = Number(inv.quantityOnHand) || 0;
                  const reserved = Number(inv.quantityReserved) || 0;
                  const available = Math.max(0, onHand - reserved);

                  return (
                    <tr key={inv.id} className="hover:bg-gray-50/50">
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          {prod?.image ? (
                            <img
                              src={prod.image}
                              alt={prod.title}
                              className="w-10 h-10 rounded-xl object-cover border border-gray-200 shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">
                              <Package className="w-5 h-5" />
                            </div>
                          )}
                          <div>
                            <span className="font-bold text-gray-900 block">{prod?.title || inv.productId}</span>
                            <span className="text-[10px] font-mono text-gray-400">
                              SKU: {prod?.sku || inv.productId} {inv.variantId ? `• Var: ${inv.variantId}` : ''}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-center font-bold text-gray-900">
                        {onHand === 0 ? (
                          <span className="text-gray-400 font-semibold">0 un. (Esgotado nesta localização)</span>
                        ) : (
                          `${onHand} un.`
                        )}
                      </td>
                      <td className="p-3 text-center font-bold text-amber-700">{reserved} un.</td>
                      <td className="p-3 text-center">
                        <span className={`inline-block px-3 py-1 rounded-full font-black text-xs ${
                          available > 0 ? 'bg-emerald-100 text-emerald-900' : 'bg-red-50 text-red-700'
                        }`}>
                          {available} un.
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* BLOCO 3: ESTOQUE NOS NUSALI HUBS */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-xl shadow-gray-100/50 p-6 space-y-4">
        <div className="flex justify-between items-center border-b border-gray-100 pb-4">
          <div>
            <h2 className="text-base font-black text-gray-900 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-purple-600" /> Estoque nos Nusali HUBs
            </h2>
            <p className="text-xs text-gray-500 font-medium">
              Produtos armazenados nos centros de distribuição Nusali (Fulfillment).
            </p>
          </div>

          <span className="text-xs font-mono font-bold bg-purple-50 text-purple-900 border border-purple-200 px-3 py-1 rounded-full">
            {hubLocationsList.length} registro(s)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase tracking-wider">
                <th className="p-3">Produto / Variante</th>
                <th className="p-3">HUB Logístico</th>
                <th className="p-3 text-center">On Hand no HUB</th>
                <th className="p-3 text-center">Reservado</th>
                <th className="p-3 text-center">Disponível para Envio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-400 font-bold">
                    Carregando estoque dos Nusali HUBs...
                  </td>
                </tr>
              ) : hubLocationsList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-400 font-bold">
                    Você ainda não possui produtos armazenados em Nusali HUBs.
                  </td>
                </tr>
              ) : (
                hubLocationsList.map((inv) => {
                  const prod = productsList.find((p) => String(p.id) === String(inv.productId));
                  const wh = warehousesList.find((w) => String(w.id) === String(inv.warehouseId));
                  const onHand = Number(inv.quantityOnHand) || 0;
                  const reserved = Number(inv.quantityReserved) || 0;
                  const available = Math.max(0, onHand - reserved);

                  return (
                    <tr key={inv.id} className="hover:bg-gray-50/50">
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          {prod?.image ? (
                            <img
                              src={prod.image}
                              alt={prod.title}
                              className="w-10 h-10 rounded-xl object-cover border border-gray-200 shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">
                              <Package className="w-5 h-5" />
                            </div>
                          )}
                          <div>
                            <span className="font-bold text-gray-900 block">{prod?.title || inv.productId}</span>
                            <span className="text-[10px] font-mono text-gray-400">
                              SKU: {prod?.sku || inv.productId} {inv.variantId ? `• Var: ${inv.variantId}` : ''}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 font-bold text-purple-900 text-xs">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                          <span>{wh?.name || inv.warehouseId}</span>
                        </div>
                      </td>
                      <td className="p-3 text-center font-bold text-gray-900">
                        {onHand === 0 ? (
                          <span className="text-gray-400 font-semibold">0 un. (Esgotado nesta localização)</span>
                        ) : (
                          `${onHand} un.`
                        )}
                      </td>
                      <td className="p-3 text-center font-bold text-amber-700">{reserved} un.</td>
                      <td className="p-3 text-center">
                        <span className={`inline-block px-3 py-1 rounded-full font-black text-xs ${
                          available > 0 ? 'bg-purple-100 text-purple-900' : 'bg-red-50 text-red-700'
                        }`}>
                          {available} un.
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* BLOCO 4: SUAS TRANSFERÊNCIAS DE ESTOQUE PARA HUB */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-xl shadow-gray-100/50 p-6 space-y-4">
        <div className="flex justify-between items-center border-b border-gray-100 pb-4">
          <div>
            <h2 className="text-base font-black text-gray-900 flex items-center gap-2">
              <Truck className="w-5 h-5 text-emerald-600" /> Suas Transferências de Estoque
            </h2>
            <p className="text-xs text-gray-500 font-medium">
              Acompanhe o status dos envios solicitados ao Nusali HUB.
            </p>
          </div>

          <span className="text-xs font-mono font-bold bg-gray-100 text-gray-700 px-3 py-1 rounded-full">
            {transfersList.length} envio(s)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase tracking-wider">
                <th className="p-3">Data</th>
                <th className="p-3">Código / Produto</th>
                <th className="p-3 text-center">Quantidade</th>
                <th className="p-3">Origem</th>
                <th className="p-3">HUB Destino</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-400 font-bold">
                    Carregando histórico de transferências...
                  </td>
                </tr>
              ) : transfersList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-400 font-bold">
                    Nenhuma solicitação de transferência registrada.
                  </td>
                </tr>
              ) : (
                transfersList.map((trf) => {
                  const prod = productsList.find((p) => String(p.id) === String(trf.productId));
                  const wh = warehousesList.find((w) => String(w.id) === String(trf.toWarehouseId));
                  const dateStr = trf.createdAt
                    ? new Date(trf.createdAt).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '-';

                  let statusBadge = (
                    <span className="bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center justify-center gap-1">
                      <Clock className="w-3 h-3" /> Aguardando envio
                    </span>
                  );

                  if (trf.status === 'IN_TRANSIT') {
                    statusBadge = (
                      <span className="bg-blue-100 text-blue-900 border border-blue-200 text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center justify-center gap-1">
                        <Truck className="w-3 h-3" /> Em trânsito
                      </span>
                    );
                  } else if (trf.status === 'RECEIVED') {
                    statusBadge = (
                      <span className="bg-emerald-100 text-emerald-900 border border-emerald-200 text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center justify-center gap-1">
                        <PackageCheck className="w-3 h-3" /> Recebido no HUB
                      </span>
                    );
                  } else if (trf.status === 'CANCELLED') {
                    statusBadge = (
                      <span className="bg-gray-100 text-gray-600 border border-gray-200 text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center justify-center gap-1">
                        <XCircle className="w-3 h-3" /> Cancelado
                      </span>
                    );
                  }

                  return (
                    <tr key={trf.id} className="hover:bg-gray-50/50">
                      <td className="p-3 font-mono text-gray-500 text-[11px] whitespace-nowrap">{dateStr}</td>
                      <td className="p-3">
                        <div>
                          <span className="font-bold text-gray-900 block">{prod?.title || trf.productId}</span>
                          <span className="text-[10px] font-mono text-emerald-800 font-semibold">
                            {trf.trackingCode || trf.id}
                          </span>
                        </div>
                      </td>
                      <td className="p-3 text-center font-black text-gray-900">{trf.quantity} un.</td>
                      <td className="p-3 text-gray-600 text-[11px]">Seu estabelecimento</td>
                      <td className="p-3 text-gray-900 font-bold text-[11px]">
                        {wh?.name || trf.toWarehouseId}
                      </td>
                      <td className="p-3 text-center">{statusBadge}</td>
                      <td className="p-3 text-right">
                        {trf.status === 'PENDING' ? (
                          <button
                            onClick={() => handleCancelTransfer(trf.id)}
                            disabled={cancellingId === trf.id}
                            className="text-xs font-bold text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg transition cursor-pointer disabled:opacity-50"
                          >
                            {cancellingId === trf.id ? 'Cancelando...' : 'Cancelar'}
                          </button>
                        ) : (
                          <span className="text-[11px] text-gray-400 font-semibold">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: ENVIAR PRODUTOS PARA NUSALI HUB */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 space-y-6 relative max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-2xl">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base text-gray-900">Enviar Produtos para Nusali HUB</h3>
                  <p className="text-xs text-gray-500">
                    Solicite a transferência de estoque do seu estabelecimento para um HUB.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error Banner */}
            {modalError && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-xs font-semibold flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitTransfer} className="space-y-4">
              {/* 1. SELEÇÃO DE PRODUTO DO VENDEDOR */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">Produto do seu catálogo</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full text-xs font-medium bg-gray-50 border border-gray-200 rounded-xl p-3 focus:bg-white focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 outline-none transition"
                >
                  {productsList.length === 0 ? (
                    <option value="">Nenhum produto cadastrado no seu catálogo</option>
                  ) : (
                    productsList.map((prod) => (
                      <option key={prod.id} value={prod.id}>
                        {prod.title} (SKU: {prod.sku || prod.id})
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* 2. SELEÇÃO DE VARIANTE (QUANDO EXISTIR) */}
              {productVariants.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">Variante do Produto</label>
                  <select
                    value={selectedVariantId}
                    onChange={(e) => setSelectedVariantId(e.target.value)}
                    className="w-full text-xs font-medium bg-gray-50 border border-gray-200 rounded-xl p-3 focus:bg-white focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 outline-none transition"
                  >
                    {productVariants.map((v: any, idx: number) => {
                      const vId = String(v.id || v.sku || idx);
                      const title = v.title || v.name || `Variante ${idx + 1}`;
                      return (
                        <option key={vId} value={vId}>
                          {title}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {/* 3. ESTOQUE DISPONÍVEL NO ESTABELECIMENTO */}
              <div className="p-3.5 bg-emerald-50/70 border border-emerald-100 rounded-2xl space-y-1.5 text-xs">
                <div className="flex justify-between items-center text-emerald-900 font-bold">
                  <span>Disponível no seu estabelecimento:</span>
                  <span className="text-sm font-black">{transferStockInfo.availableForTransfer} un.</span>
                </div>
                <div className="text-[10px] text-emerald-700 flex flex-wrap gap-x-3 gap-y-1 font-medium border-t border-emerald-100 pt-1.5">
                  <span>Em estoque físico: {transferStockInfo.onHand} un.</span>
                  <span>Reservado pedidos: {transferStockInfo.reserved} un.</span>
                  <span>Transfers pendentes: {transferStockInfo.pendingTransfers} un.</span>
                </div>
              </div>

              {/* 4. MODALIDADE DE ENTREGA AO HUB */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">Como as mercadorias chegarão ao HUB?</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDeliveryMode('NUSALI_PICKUP')}
                    className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition cursor-pointer ${
                      deliveryMode === 'NUSALI_PICKUP'
                        ? 'bg-purple-50 border-purple-600 text-purple-900 shadow-xs'
                        : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <Truck className={`w-4 h-4 ${deliveryMode === 'NUSALI_PICKUP' ? 'text-purple-600' : 'text-gray-500'}`} />
                      {deliveryMode === 'NUSALI_PICKUP' && <CheckCircle2 className="w-4 h-4 text-purple-600" />}
                    </div>
                    <span className="font-bold text-xs block">Solicitar coleta pela Nusali</span>
                    <span className="text-[10px] text-gray-500 mt-0.5">A equipe logística coleta na sua loja.</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeliveryMode('SELLER_DROPOFF')}
                    className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition cursor-pointer ${
                      deliveryMode === 'SELLER_DROPOFF'
                        ? 'bg-purple-50 border-purple-600 text-purple-900 shadow-xs'
                        : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <Store className={`w-4 h-4 ${deliveryMode === 'SELLER_DROPOFF' ? 'text-purple-600' : 'text-gray-500'}`} />
                      {deliveryMode === 'SELLER_DROPOFF' && <CheckCircle2 className="w-4 h-4 text-purple-600" />}
                    </div>
                    <span className="font-bold text-xs block">Eu mesmo entregarei no HUB</span>
                    <span className="text-[10px] text-gray-500 mt-0.5">Você leva os produtos diretamente ao HUB.</span>
                  </button>
                </div>
              </div>

              {/* NUSALI PICKUP PREVIEW & ADDRESS CHECK */}
              {deliveryMode === 'NUSALI_PICKUP' && (
                <div className="p-3.5 bg-purple-50 border border-purple-200 rounded-2xl space-y-2 text-xs">
                  <h4 className="font-bold text-purple-900 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-purple-600" /> Confirmar Dados de Coleta
                  </h4>
                  {sellerPickupAddressStr ? (
                    <div className="space-y-1 text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Loja:</span>
                        <strong className="text-gray-900">{sellerStore?.name || sellerProfile?.companyName || 'Sua Loja'}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Endereço de Coleta:</span>
                        <strong className="text-gray-900 text-right">{sellerPickupAddressStr}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Contato:</span>
                        <strong className="text-emerald-700">{sellerProfile?.phone || sellerStore?.phone || 'Não informado'}</strong>
                      </div>
                    </div>
                  ) : (
                    <div className="p-2.5 bg-amber-100 border border-amber-200 rounded-xl text-amber-900 text-[11px] font-bold flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-amber-700" />
                      <span>Cadastre o endereço de coleta da sua loja antes de solicitar coleta.</span>
                    </div>
                  )}
                </div>
              )}

              {/* 5. NUSALI HUB DE DESTINO */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">Nusali HUB de destino</label>
                {warehousesList.length === 0 ? (
                  <p className="text-xs text-amber-700 font-bold bg-amber-50 p-3 rounded-xl border border-amber-200">
                    Nenhum Nusali HUB disponível no momento.
                  </p>
                ) : (
                  <select
                    value={selectedWarehouseId}
                    onChange={(e) => setSelectedWarehouseId(e.target.value)}
                    className="w-full text-xs font-medium bg-gray-50 border border-gray-200 rounded-xl p-3 focus:bg-white focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 outline-none transition"
                  >
                    {warehousesList.map((wh) => {
                      const code = wh.countryCode || wh.country;
                      const countryConf = code ? countriesConfig[code] : null;
                      const flag = countryConf?.flag ? `${countryConf.flag} ` : '';
                      const countryName = countryConf?.name ? `, ${countryConf.name}` : '';
                      const cityStr = wh.city || wh.location || 'HUB';
                      return (
                        <option key={wh.id} value={wh.id}>
                          {flag}{wh.name} ({cityStr}{countryName})
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>

              {/* SELLER DROPOFF PREVIEW */}
              {deliveryMode === 'SELLER_DROPOFF' && selectedWarehouse && (
                <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-2xl space-y-1 text-xs">
                  <h4 className="font-bold text-gray-900 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-purple-600" /> Dados do HUB para Entrega
                  </h4>
                  <p className="font-bold text-gray-900 text-xs">{selectedWarehouse.name}</p>
                  <p className="text-gray-600 text-[11px]">
                    {selectedWarehouse.address || 'Endereço não informado'}{selectedWarehouse.city ? ` • ${selectedWarehouse.city}` : ''}
                  </p>
                </div>
              )}

              {/* 6. QUANTIDADE A ENVIAR */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">Quantidade a enviar</label>
                <input
                  type="number"
                  min="1"
                  max={transferStockInfo.availableForTransfer || 1}
                  value={quantityInput}
                  onChange={(e) => setQuantityInput(e.target.value)}
                  className="w-full text-xs font-bold bg-gray-50 border border-gray-200 rounded-xl p-3 focus:bg-white focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 outline-none transition"
                  placeholder="Ex: 5"
                />
                {Number(quantityInput) > transferStockInfo.availableForTransfer && (
                  <p className="text-[11px] text-red-600 font-bold mt-1">
                    Você possui apenas {transferStockInfo.availableForTransfer} unidades disponíveis para transferência.
                  </p>
                )}
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={
                    submitting ||
                    warehousesList.length === 0 ||
                    transferStockInfo.availableForTransfer <= 0 ||
                    Number(quantityInput) > transferStockInfo.availableForTransfer ||
                    (deliveryMode === 'NUSALI_PICKUP' && !sellerPickupAddressStr)
                  }
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center gap-2 cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> Processando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" /> Solicitar Transferência
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
