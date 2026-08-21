import React, { useState, useEffect } from 'react';
import {
  Truck,
  Warehouse,
  Boxes,
  Zap,
  Printer,
  PlusCircle,
  CheckCircle2,
  MapPin,
  Clock,
  Globe,
  ArrowRight,
  Loader2,
  PackageCheck,
  X,
} from 'lucide-react';
import { CountryCode } from '../../types';
import { countriesConfig } from '../../utils/currencyUtils';
import { ShippingLabelModal, ShippingLabelData } from '../common/ShippingLabelModal';
import { SellerService } from '../../services/sellerService';

interface SellerLogisticsFulfillmentProps {
  showToast: (msg: string) => void;
}

export const SellerLogisticsFulfillment: React.FC<SellerLogisticsFulfillmentProps> = ({ showToast }) => {
  const [activeLabelData, setActiveLabelData] = useState<ShippingLabelData | null>(null);
  const [hubs, setHubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form states for creating a new shipping plan
  const [planHub, setPlanHub] = useState('HUB Central Bissau');
  const [planCountry, setPlanCountry] = useState<CountryCode>('GW');
  const [planProduct, setPlanProduct] = useState('');
  const [planQty, setPlanQty] = useState('50');

  const fetchWarehouses = async () => {
    try {
      setLoading(true);
      const res = await SellerService.getWarehouses();
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        setHubs(res.data);
      } else {
        setHubs([]);
      }
    } catch (err) {
      console.error('Error fetching warehouses:', err);
      setHubs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWarehouses();
  }, []);

  const handleGenerateHubLabel = (h: any) => {
    const code = h.code || `HUB-${h.countryCode || 'GW'}-01`;
    const name = h.name || 'HUB Central Bissau';
    const country = h.countryCode || 'GW';
    const units = h.units || 0;

    setActiveLabelData({
      shipmentId: `lot_${h.id || Date.now()}`,
      trackingNumber: `LOT-${code}-${Date.now().toString().slice(-6)}`,
      orderNumber: `LOTE-${code}-ESTOQUE`,
      fulfillmentMode: 'NUSALI_FULFILLMENT',
      productTitle: `Lote de Reposição de Estoque (${units} unidades consolidadas)`,
      quantity: units,
      carrier: 'Envio para HUB Logistics',
      senderName: 'Vendedor Mercado Nusali',
      senderAddress: {
        street: 'Centro de Coleta Regional',
        city: 'Bissau',
        countryCode: country,
      },
      recipientName: `Recepção ${name}`,
      recipientAddress: {
        street: `Centro de Distribuição Nusali Fulfillment (${code})`,
        city: country === 'GW' ? 'Bissau' : country === 'PT' ? 'Lisboa' : 'Guarulhos',
        countryCode: country,
      },
    });
  };

  const handleCreatePlanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!planProduct.trim()) {
      showToast('Por favor, informe a descrição do produto ou lote.');
      return;
    }
    const newHub = {
      id: `wh_${Date.now()}`,
      name: planHub,
      code: `LOT-${planCountry}-${Date.now().toString().slice(-4)}`,
      countryCode: planCountry,
      units: Number(planQty) || 1,
      speed: planCountry === 'GW' ? 'Entrega Hoje / 24h' : planCountry === 'PT' ? 'Entrega 48h Europa' : 'Entrega 3-5 dias',
    };
    setHubs((prev) => [newHub, ...prev]);
    setShowCreateModal(false);
    showToast(`Plano de envio para ${planHub} criado com sucesso!`);
    handleGenerateHubLabel(newHub);
  };

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
            Armazene seus produtos nos nossos HUBs logísticos para garantir frete grátis e entrega no mesmo dia.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition flex items-center gap-2 shadow-xs shrink-0 cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" /> Criar Plano de Envio de Estoque
        </button>
      </div>

      {/* HUBs Grid or Clean Empty State */}
      {loading ? (
        <div className="p-12 text-center text-gray-500 bg-white rounded-2xl border border-gray-200 shadow-2xs">
          <Loader2 className="w-8 h-8 mx-auto mb-2 text-emerald-600 animate-spin" />
          <p className="text-xs font-bold">Carregando dados de fulfillment...</p>
        </div>
      ) : hubs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-2xs space-y-4">
          <div className="p-4 bg-emerald-50 text-emerald-700 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
            <Warehouse className="w-8 h-8" />
          </div>
          <div className="max-w-md mx-auto">
            <h3 className="font-black text-base text-gray-900">Nenhum plano de envio ou lote estocado no Fulfillment</h3>
            <p className="text-xs text-gray-500 mt-1">
              Você ainda não possui estoque enviado para os centros de distribuição do Mercado Nusali. Clique em "Criar Plano de Envio de Estoque" para agendar o envio dos seus produtos.
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition inline-flex items-center gap-2 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" /> Criar Primeiro Plano de Envio
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {hubs.map((h) => {
            const countryCode = (h.countryCode || 'GW') as CountryCode;
            const countryConf = countriesConfig[countryCode] || countriesConfig.GW;

            return (
              <div key={h.id || h.code} className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-mono text-gray-400 block">{h.code || 'HUB-LOG'}</span>
                    <h3 className="font-bold text-sm text-gray-900">{h.name || 'HUB Logístico'}</h3>
                  </div>
                  <span className="text-xl">{countryConf.flag}</span>
                </div>

                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs font-medium space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Produtos Estocados:</span>
                    <strong className="text-gray-900">{h.units || 0} unidades</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Prazo de Envio:</span>
                    <strong className="text-emerald-700">{h.speed || 'Entrega Rápida'}</strong>
                  </div>
                </div>

                <button
                  onClick={() => handleGenerateHubLabel(h)}
                  className="w-full p-2 bg-gray-100 hover:bg-emerald-50 hover:text-emerald-700 text-gray-800 font-bold rounded-xl text-xs transition flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-emerald-600" /> Gerar Etiquetas de Lote
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Criar Plano de Envio */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-black text-sm text-gray-900 flex items-center gap-2">
                <PackageCheck className="w-5 h-5 text-emerald-600" /> Criar Plano de Envio de Estoque
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePlanSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-gray-700 font-bold mb-1">HUB de Destino</label>
                <select
                  value={planHub}
                  onChange={(e) => {
                    setPlanHub(e.target.value);
                    if (e.target.value.includes('Bissau')) setPlanCountry('GW');
                    else if (e.target.value.includes('Lisboa')) setPlanCountry('PT');
                    else if (e.target.value.includes('Guarulhos')) setPlanCountry('BR');
                  }}
                  className="w-full p-2.5 border border-gray-300 rounded-xl bg-white font-bold"
                >
                  <option value="HUB Central Bissau">HUB Central Bissau (GW)</option>
                  <option value="HUB Lisboa Transit">HUB Lisboa Transit (PT)</option>
                  <option value="HUB São Paulo Guarulhos">HUB São Paulo Guarulhos (BR)</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-700 font-bold mb-1">Descrição do Lote de Produtos</label>
                <input
                  type="text"
                  placeholder="ex: 50x Caju Torrado 1kg / Eletrônicos"
                  value={planProduct}
                  onChange={(e) => setPlanProduct(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-bold mb-1">Quantidade Total (Unidades)</label>
                <input
                  type="number"
                  min="1"
                  value={planQty}
                  onChange={(e) => setPlanQty(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-xl text-gray-700 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs"
                >
                  Confirmar e Gerar Etiqueta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Shipping Label Modal */}
      <ShippingLabelModal
        labelData={activeLabelData}
        onClose={() => setActiveLabelData(null)}
      />
    </div>
  );
};
