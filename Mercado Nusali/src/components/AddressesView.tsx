import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  Globe,
  Building,
  Phone,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext';
import { BuyerNavHeader } from './BuyerNavHeader';
import { countriesConfig } from '../utils/currencyUtils';
import { CountryCode } from '../types';
import { BuyerService } from '../services/buyerService';

export const AddressesView: React.FC = () => {
  const { selectedCountry, showToast } = usePreferences();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [formRecipient, setFormRecipient] = useState('');
  const [formStreet, setFormStreet] = useState('');
  const [formNumber, setFormNumber] = useState('');
  const [formComplement, setFormComplement] = useState('');
  const [formCity, setFormCity] = useState('');
  const [formZip, setFormZip] = useState('');
  const [formCountry, setFormCountry] = useState<CountryCode>('GW');
  const [formPhone, setFormPhone] = useState('');

  const loadAddresses = async () => {
    setIsLoading(true);
    try {
      const res = await BuyerService.getAddresses();
      if (res.success && Array.isArray(res.data)) {
        setSavedAddresses(res.data);
      }
    } catch (err) {
      console.error('Failed to load addresses:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAddresses();
  }, []);

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formStreet || !formCity || !formRecipient) {
      showToast('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    setIsSaving(true);
    try {
      const newAddr = {
        recipientName: formRecipient,
        street: formStreet,
        number: formNumber || 'S/N',
        complement: formComplement,
        neighborhood: 'Centro',
        city: formCity,
        state: formCity,
        country: formCountry,
        zipCode: formZip || '1000',
        phone: formPhone,
        isDefault: savedAddresses.length === 0,
      };

      const res = await BuyerService.addAddress(newAddr);
      if (res.success && res.data) {
        setSavedAddresses(prev => [res.data, ...prev]);
        setIsModalOpen(false);
        setFormRecipient('');
        setFormStreet('');
        setFormNumber('');
        setFormComplement('');
        setFormCity('');
        setFormZip('');
        setFormPhone('');
        showToast('Endereço cadastrado com sucesso no banco de dados!');
      } else {
        showToast(res.message || 'Erro ao cadastrar endereço.');
      }
    } catch {
      showToast('Falha na comunicação com o servidor.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAddress = async (id: string) => {
    try {
      const res = await BuyerService.deleteAddress(id);
      if (res.success) {
        setSavedAddresses(prev => prev.filter(a => a.id !== id));
        showToast('Endereço removido.');
      }
    } catch {
      showToast('Erro ao remover endereço.');
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const res = await BuyerService.setDefaultAddress(id);
      if (res.success) {
        setSavedAddresses(prev => prev.map(a => ({ ...a, isDefault: a.id === id })));
        showToast('Endereço padrão de entrega atualizado!');
      }
    } catch {
      showToast('Erro ao definir endereço padrão.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-fadeIn">
      <BuyerNavHeader />

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 bg-white p-6 rounded-2xl border border-gray-200 shadow-2xs">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <MapPin className="w-6 h-6 text-emerald-600" /> Meus Endereços de Entrega
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Cadastre múltiplos endereços para entregas na Guiné-Bissau ou em qualquer país da comunidade CPLP.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Novo Endereço
        </button>
      </div>

      {/* Address Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {savedAddresses.map((addr) => {
          const countryInfo = countriesConfig[addr.country] || countriesConfig.GW;

          return (
            <div
              key={addr.id}
              className={`p-6 rounded-2xl border transition relative ${
                addr.isDefault
                  ? 'border-emerald-500 bg-emerald-50/20 shadow-sm ring-1 ring-emerald-500'
                  : 'border-gray-200 bg-white hover:border-gray-300 shadow-2xs'
              }`}
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{countryInfo.flag}</span>
                  <div>
                    <h3 className="text-sm font-black text-gray-900">{addr.recipientName}</h3>
                    <span className="text-[10px] text-gray-400 font-mono">{countryInfo.name}</span>
                  </div>
                </div>

                {addr.isDefault && (
                  <span className="bg-emerald-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> PADRÃO
                  </span>
                )}
              </div>

              <div className="text-xs text-gray-600 space-y-1 my-4 font-medium">
                <p>{addr.street}, {addr.number} {addr.complement && `(${addr.complement})`}</p>
                <p>{addr.neighborhood}, {addr.city} - {addr.state}</p>
                <p className="text-gray-400 text-[11px]">Código Postal: {addr.zipCode}</p>
                <p className="text-gray-500 text-[11px] flex items-center gap-1 mt-2">
                  <Phone className="w-3.5 h-3.5 text-gray-400" /> {addr.phone}
                </p>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-gray-100 mt-4">
                {!addr.isDefault ? (
                  <button
                    onClick={() => handleSetDefault(addr.id)}
                    className="text-xs font-bold text-emerald-600 hover:text-emerald-800 transition cursor-pointer"
                  >
                    Definir como Padrão
                  </button>
                ) : (
                  <span className="text-[11px] text-emerald-700 font-bold">Endereço de envio principal</span>
                )}

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDeleteAddress(addr.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                    title="Excluir endereço"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Add Address */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-scaleUp">
            <h3 className="text-lg font-black text-gray-900 mb-2 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-emerald-600" /> Cadastrar Novo Endereço
            </h3>
            <p className="text-xs text-gray-500 mb-6">
              Informe os dados de entrega para agilizar suas compras no Mercado Nusali.
            </p>

            <form onSubmit={handleSaveAddress} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Nome do Destinatário</label>
                <input
                  type="text"
                  value={formRecipient}
                  onChange={e => setFormRecipient(e.target.value)}
                  placeholder="ex: Alex Silva"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-gray-700 mb-1">Rua / Avenida</label>
                  <input
                    type="text"
                    value={formStreet}
                    onChange={e => setFormStreet(e.target.value)}
                    placeholder="ex: Av. Amílcar Cabral"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Número</label>
                  <input
                    type="text"
                    value={formNumber}
                    onChange={e => setFormNumber(e.target.value)}
                    placeholder="12"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Complemento / Apto</label>
                  <input
                    type="text"
                    value={formComplement}
                    onChange={e => setFormComplement(e.target.value)}
                    placeholder="ex: Bloco B, Apt 3"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Cidade</label>
                  <input
                    type="text"
                    value={formCity}
                    onChange={e => setFormCity(e.target.value)}
                    placeholder="ex: Bissau"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">País</label>
                  <select
                    value={formCountry}
                    onChange={e => setFormCountry(e.target.value as CountryCode)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  >
                    {Object.entries(countriesConfig).map(([code, info]) => (
                      <option key={code} value={code}>
                        {info.flag} {info.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Telefone de Contato</label>
                  <input
                    type="text"
                    value={formPhone}
                    onChange={e => setFormPhone(e.target.value)}
                    placeholder="+245 955..."
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition cursor-pointer flex items-center justify-center gap-2"
                >
                  {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Salvar Endereço'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
