import React, { useState } from 'react';
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
} from 'lucide-react';
import { CountryCode } from '../../types';
import { countriesConfig } from '../../utils/currencyUtils';
import { ShippingLabelModal, ShippingLabelData } from '../ShippingLabelModal';

interface SellerLogisticsFulfillmentProps {
  showToast: (msg: string) => void;
}

export const SellerLogisticsFulfillment: React.FC<SellerLogisticsFulfillmentProps> = ({ showToast }) => {
  const [activeLabelData, setActiveLabelData] = useState<ShippingLabelData | null>(null);

  const hubs = [
    { name: 'HUB Central Bissau', code: 'HUB-GW-01', country: 'GW', units: 380, cap: '68%', speed: 'Entrega Hoje / 24h' },
    { name: 'HUB Lisboa Transit', code: 'HUB-PT-02', country: 'PT', units: 190, cap: '42%', speed: 'Entrega 48h Europa' },
    { name: 'HUB São Paulo Guarulhos', code: 'HUB-BR-03', country: 'BR', units: 160, cap: '35%', speed: 'Entrega 3-5 dias Brasil' },
  ];

  const handleGenerateHubLabel = (h: typeof hubs[0]) => {
    setActiveLabelData({
      trackingNumber: `LOT-${h.code}-${Date.now().toString().slice(-6)}`,
      orderNumber: `LOTE-${h.code}-ESTOQUE`,
      serviceType: 'TRANSFERÊNCIA LOGÍSTICA FULFILLMENT',
      routeCode: `GW-BIS > ${h.code} > LOTE-PALLET`,
      destinationHub: h.name,
      sender: {
        name: 'Vendedor Mercado Nusali',
        storeName: 'Estoque Oficial da Loja',
        address: 'Centro de Coleta Regional',
        city: 'Bissau',
        country: 'GW',
        phone: '+245 955000111',
      },
      recipient: {
        name: `Recepção ${h.name}`,
        address: `Centro de Distribuição Nusali Fulfillment (${h.code})`,
        city: h.country === 'GW' ? 'Bissau' : h.country === 'PT' ? 'Lisboa' : 'Guarulhos',
        country: h.country,
        phone: '+245 955000111',
      },
      packageInfo: {
        itemsDescription: `Lote de Reposição de Estoque (${h.units} unidades consolidadas)`,
        sku: `LOT-${h.code}`,
        quantity: h.units,
        weightKg: '15.50',
        dimensions: '60 × 40 × 40 cm (Pallet)',
        declaredValue: 'Transferência Inter-HUB',
      },
      issuedAt: new Date().toLocaleDateString('pt-BR'),
    });
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
          onClick={() => handleGenerateHubLabel(hubs[0])}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition flex items-center gap-2 shadow-xs shrink-0 cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" /> Criar Plano de Envio de Estoque
        </button>
      </div>

      {/* HUBs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {hubs.map((h) => {
          const countryConf = countriesConfig[h.country as CountryCode] || countriesConfig.GW;

          return (
            <div key={h.code} className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-mono text-gray-400 block">{h.code}</span>
                  <h3 className="font-bold text-sm text-gray-900">{h.name}</h3>
                </div>
                <span className="text-xl">{countryConf.flag}</span>
              </div>

              <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs font-medium space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Produtos Estocados:</span>
                  <strong className="text-gray-900">{h.units} unidades</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Prazo de Envio:</span>
                  <strong className="text-emerald-700">{h.speed}</strong>
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
