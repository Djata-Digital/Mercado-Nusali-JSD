import React, { useState } from 'react';
import { MapPin, X, Check } from 'lucide-react';
import { useMarketplace } from '../context/MarketplaceContext';

interface LocationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LocationModal: React.FC<LocationModalProps> = ({ isOpen, onClose }) => {
  const { userLocation, updateLocation } = useMarketplace();
  const [zipCode, setZipCode] = useState(userLocation.zipCode);
  const [street, setStreet] = useState(userLocation.street);
  const [city, setCity] = useState(userLocation.city);
  const [state, setState] = useState(userLocation.state);
  const [saved, setSaved] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateLocation(zipCode, city, state, street);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-hidden border border-gray-100">
        {/* Header */}
        <div className="bg-[#fff159] p-4 flex items-center justify-between border-b border-yellow-300">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-gray-800" />
            <h3 className="font-semibold text-gray-900 text-lg">Onde você quer receber suas compras?</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-700 hover:text-black p-1 rounded-full hover:bg-yellow-400 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSave} className="p-6 space-y-4">
          <p className="text-sm text-gray-600">
            Confira as opções de frete e prazos de entrega para o seu endereço em todo o Brasil.
          </p>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              CEP
            </label>
            <input
              type="text"
              value={zipCode}
              onChange={(e) => setZipCode(e.target.value)}
              placeholder="00000-000"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Endereço / RUA
            </label>
            <input
              type="text"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              placeholder="Ex: Av. Paulista, 1000"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-sm"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Cidade
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="São Paulo"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Estado (UF)
              </label>
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="SP"
                maxLength={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-sm uppercase"
                required
              />
            </div>
          </div>

          {saved && (
            <div className="flex items-center gap-2 text-green-700 bg-green-50 p-2.5 rounded-md text-sm font-medium">
              <Check className="w-4 h-4 text-green-600" /> Endereço atualizado com sucesso!
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-xs transition"
            >
              Usar este endereço
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
