/**
 * FASE D16-H3 — modal compacto de "Alterar endereço" para a intenção
 * TEMPORÁRIA de destino de entrega (ProductDetail/Cart). NUNCA o
 * LocationModal.tsx legado (mock, endereço livre sem Região/Setor real).
 *
 * Pede SOMENTE o necessário para consultar frete:
 *   - "Meu endereço cadastrado": um dos endereços reais do comprador (só os
 *     que já têm shippingSectorId — nunca um sem setor, que não serviria
 *     pra nada aqui).
 *   - "Outro destino": Região + Setor (D16-F2, mesmos endpoints já usados
 *     pelo Checkout). NUNCA rua/número/bairro/referência/destinatário/
 *     documento — isso continua exclusivamente no Checkout (D16-H1/H1.2).
 *
 * Resultado vai para DeliveryDestinationContext — nunca cria endereço, nunca
 * altera o padrão do perfil, nunca é autoridade de frete (F3/F4 continuam
 * validando o shippingSectorId no servidor).
 */
import React, { useState, useEffect } from 'react';
import { X, MapPin } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { useDeliveryDestination } from '../context/DeliveryDestinationContext';
import { BuyerService } from '../services/buyerService';

interface DeliveryDestinationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DeliveryDestinationModal: React.FC<DeliveryDestinationModalProps> = ({ isOpen, onClose }) => {
  const { isAuthenticated } = useAuth();
  const { selectedCountry } = usePreferences();
  const { destination, setSavedAddressIntent, setSectorIntent } = useDeliveryDestination();

  const [mode, setMode] = useState<'saved' | 'sector'>(
    isAuthenticated && destination?.mode !== 'sector' ? 'saved' : 'sector'
  );

  const [addresses, setAddresses] = useState<any[]>([]);
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    destination?.mode === 'saved' ? destination.addressId : null
  );

  const [regions, setRegions] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [sectors, setSectors] = useState<Array<{ id: string; name: string; code: string; regionId: string }>>([]);
  const [isLoadingSectors, setIsLoadingSectors] = useState(false);
  const [regionId, setRegionId] = useState<string | null>(destination?.mode === 'sector' ? destination.shippingRegionId : null);
  const [sectorId, setSectorId] = useState<string | null>(destination?.mode === 'sector' ? destination.shippingSectorId : null);

  useEffect(() => {
    if (!isOpen || !isAuthenticated) return;
    setIsLoadingAddresses(true);
    BuyerService.getAddresses()
      .then((res) => {
        if (res.success && Array.isArray(res.data)) setAddresses(res.data);
      })
      .catch(() => {})
      .finally(() => setIsLoadingAddresses(false));
  }, [isOpen, isAuthenticated]);

  useEffect(() => {
    if (!isOpen || mode !== 'sector') return;
    BuyerService.getShippingRegions(selectedCountry)
      .then((res) => {
        if (res.success && Array.isArray(res.data)) setRegions(res.data);
      })
      .catch(() => {});
  }, [isOpen, mode, selectedCountry]);

  useEffect(() => {
    if (!isOpen || mode !== 'sector' || !regionId) {
      setSectors([]);
      return;
    }
    setIsLoadingSectors(true);
    BuyerService.getShippingSectors(selectedCountry, regionId)
      .then((res) => {
        if (res.success && Array.isArray(res.data)) setSectors(res.data);
      })
      .catch(() => {})
      .finally(() => setIsLoadingSectors(false));
  }, [isOpen, mode, selectedCountry, regionId]);

  if (!isOpen) return null;

  // Só endereços com setor de entrega definido servem para consultar frete
  // aqui — um endereço sem shippingSectorId não teria como alimentar F3/F4.
  const eligibleAddresses = addresses.filter((a: any) => !!a.shippingSectorId);

  const handleConfirmSaved = () => {
    const addr = addresses.find((a: any) => a.id === selectedAddressId);
    if (!addr || !addr.shippingSectorId) return;
    setSavedAddressIntent({
      addressId: addr.id,
      shippingSectorId: addr.shippingSectorId,
      shippingSectorName: addr.shippingSectorName || null,
      shippingRegionId: addr.shippingRegionId || null,
      shippingRegionName: addr.shippingRegionName || null,
      countryCode: addr.countryCode || selectedCountry,
    });
    onClose();
  };

  const handleConfirmSector = () => {
    const region = regions.find((r) => r.id === regionId);
    const sector = sectors.find((s) => s.id === sectorId);
    if (!region || !sector) return;
    setSectorIntent({
      shippingSectorId: sector.id,
      shippingSectorName: sector.name,
      shippingRegionId: region.id,
      shippingRegionName: region.name,
      countryCode: selectedCountry,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-emerald-600" /> Onde deseja receber?
          </h3>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-gray-400 hover:text-gray-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="flex gap-2">
            {isAuthenticated && (
              <button
                type="button"
                onClick={() => setMode('saved')}
                className={`flex-1 text-xs font-semibold py-2 rounded-lg border transition ${
                  mode === 'saved' ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-gray-200 text-gray-600'
                }`}
              >
                Meu endereço cadastrado
              </button>
            )}
            <button
              type="button"
              onClick={() => setMode('sector')}
              className={`flex-1 text-xs font-semibold py-2 rounded-lg border transition ${
                mode === 'sector' ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-gray-200 text-gray-600'
              }`}
            >
              Outro destino
            </button>
          </div>

          {mode === 'saved' && isAuthenticated && (
            <div className="space-y-2">
              {isLoadingAddresses && <p className="text-xs text-gray-500">Carregando endereços...</p>}
              {!isLoadingAddresses && eligibleAddresses.length === 0 && (
                <p className="text-xs text-gray-500">
                  Nenhum endereço cadastrado com setor de entrega definido. Use "Outro destino" ou complete um endereço em "Meus Endereços".
                </p>
              )}
              {eligibleAddresses.map((a: any) => (
                <label
                  key={a.id}
                  className={`block border rounded-lg px-3 py-2 text-xs cursor-pointer ${
                    selectedAddressId === a.id ? 'border-emerald-600 bg-emerald-50/70 ring-1 ring-emerald-500/30' : 'border-gray-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="deliveryDestinationAddress"
                    className="mr-2"
                    checked={selectedAddressId === a.id}
                    onChange={() => setSelectedAddressId(a.id)}
                  />
                  <strong className="text-gray-900">{a.recipientName || 'Endereço'}</strong>
                  <span className="block text-gray-500 mt-0.5">
                    {a.city}
                    {a.shippingSectorName ? ` · ${a.shippingSectorName}` : ''}
                    {a.shippingRegionName ? ` (${a.shippingRegionName})` : ''}
                  </span>
                </label>
              ))}
              <button
                type="button"
                disabled={!selectedAddressId}
                onClick={handleConfirmSaved}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold py-2 rounded-lg mt-2"
              >
                Confirmar
              </button>
            </div>
          )}

          {mode === 'sector' && (
            <div className="space-y-2">
              <div>
                <label className="block font-semibold text-gray-700 mb-1 text-xs">Região</label>
                <select
                  value={regionId || ''}
                  onChange={(e) => {
                    setRegionId(e.target.value || null);
                    setSectorId(null);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
                >
                  <option value="">Selecione a região</option>
                  {regions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-gray-700 mb-1 text-xs">Setor</label>
                <select
                  value={sectorId || ''}
                  disabled={!regionId || isLoadingSectors}
                  onChange={(e) => setSectorId(e.target.value || null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs disabled:opacity-50"
                >
                  <option value="">{isLoadingSectors ? 'Carregando...' : 'Selecione o setor'}</option>
                  {sectors.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                disabled={!regionId || !sectorId}
                onClick={handleConfirmSector}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold py-2 rounded-lg mt-2"
              >
                Confirmar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
