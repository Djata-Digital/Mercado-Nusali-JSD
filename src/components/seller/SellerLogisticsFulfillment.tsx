import React, { useState, useEffect } from 'react';
import { Truck, Warehouse, Zap, Loader2, Info } from 'lucide-react';
import { CountryCode } from '../../types';
import { countriesConfig } from '../../utils/currencyUtils';
import { SellerService } from '../../services/sellerService';

interface SellerLogisticsFulfillmentProps {
  showToast: (msg: string) => void;
}

// FASE D18-C4.5 — auditoria confirmou que "Criar Plano de Envio de Estoque"
// e "Gerar Etiquetas de Lote" eram 100% fictícios: handleCreatePlanSubmit
// só fazia setHubs(prev => [newHub, ...]) local (nenhuma chamada de API) e
// handleGenerateHubLabel fabricava um ShippingLabelData inteiro (tracking
// number, remetente/destinatário) mesmo para warehouses REAIS vindos de
// GET /seller/warehouses — nenhum shipment/transferência real por trás.
// A infraestrutura real para "enviar estoque a um HUB" JÁ EXISTE e já está
// conectada de verdade — só que em outra tela: inventory_transfers
// (schema.ts) + GET/POST /seller/inventory/transfers, consumida por
// SellerStockManager.tsx ("Estoque & Armazéns" na barra lateral, auditado
// como real: getTransfers/requestTransfer/cancelTransfer). Construir aqui
// um segundo formulário de criação (ainda mais com um campo de texto livre
// para produto, quando o modelo real exige um productId de verdade) seria
// exatamente o "segundo modelo concorrente" que esta fase deve evitar.
// Por isso as duas ações fictícias foram removidas — não substituídas por
// um novo endpoint — e a tela passa a apontar honestamente para o fluxo
// real já existente. A listagem de warehouses (nome/código/cidade/país)
// continua real, vinda do mesmo GET /seller/warehouses.
interface WarehouseRow {
  id: string;
  code: string;
  name: string;
  countryCode: string;
  city: string;
  status: string;
}

export const SellerLogisticsFulfillment: React.FC<SellerLogisticsFulfillmentProps> = ({ showToast }) => {
  const [warehousesList, setWarehousesList] = useState<WarehouseRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWarehouses = async () => {
    try {
      setLoading(true);
      const res = await SellerService.getWarehouses();
      if (res.success && Array.isArray(res.data)) {
        setWarehousesList(res.data);
      } else {
        setWarehousesList([]);
      }
    } catch (err) {
      console.error('Error fetching warehouses:', err);
      showToast('Não foi possível carregar os HUBs logísticos agora.');
      setWarehousesList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWarehouses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Top Banner Header */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-gray-900">Nusali Fulfillment & Logística</h1>
            <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-yellow-600 fill-yellow-500" /> ENTREGAS RÁPIDAS
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            HUBs logísticos reais do Mercado Nusali disponíveis para armazenagem de estoque.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 text-blue-900">
        <Info className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <p className="font-bold">Envio de estoque para HUB ainda não está disponível por aqui.</p>
          <p>
            Para solicitar o envio real de produtos para um HUB (com produto, quantidade e rastreio de verdade),
            use <strong>Estoque &amp; Armazéns</strong> no menu lateral.
          </p>
        </div>
      </div>

      {/* HUBs Grid or Clean Empty State */}
      {loading ? (
        <div className="p-12 text-center text-gray-500 bg-white rounded-2xl border border-gray-200 shadow-2xs">
          <Loader2 className="w-8 h-8 mx-auto mb-2 text-emerald-600 animate-spin" />
          <p className="text-xs font-bold">Carregando dados de fulfillment...</p>
        </div>
      ) : warehousesList.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-2xs space-y-4">
          <div className="p-4 bg-emerald-50 text-emerald-700 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
            <Warehouse className="w-8 h-8" />
          </div>
          <div className="max-w-md mx-auto">
            <h3 className="font-black text-base text-gray-900">Nenhum HUB logístico ativo encontrado</h3>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {warehousesList.map((h) => {
            const countryCode = (h.countryCode || 'GW') as CountryCode;
            const countryConf = countriesConfig[countryCode] || countriesConfig.GW;

            return (
              <div key={h.id} className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-mono text-gray-400 block">{h.code}</span>
                    <h3 className="font-bold text-sm text-gray-900">{h.name}</h3>
                  </div>
                  <span className="text-xl">{countryConf.flag}</span>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs font-medium flex items-center gap-1.5 text-gray-700">
                  <Truck className="w-3.5 h-3.5 text-gray-400" /> {h.city}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
