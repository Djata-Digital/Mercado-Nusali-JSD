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
  AlertTriangle,
} from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext';
import { BuyerNavHeader } from './BuyerNavHeader';
import { countriesConfig } from '../utils/currencyUtils';
import { CountryCode } from '../types';
import { BuyerService } from '../services/buyerService';
import { useCountries } from '../hooks/useCountries';

interface GeoOption { id: string; name: string; code: string; regionId?: string }

export const AddressesView: React.FC = () => {
  const { selectedCountry, showToast } = usePreferences();
  const { data: operationalCountries, isLoading: countriesLoading, isError: countriesError } = useCountries();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // FASE D16-F2 — fundação geográfica do endereço de entrega: null = criando
  // um endereço novo; string = editando o endereço com este id (mesmo
  // padrão de formulário único create/edit já usado por
  // SellerOperationalAddressManager.tsx, D15-C2).
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);

  // Form state
  const [formRecipient, setFormRecipient] = useState('');
  const [formStreet, setFormStreet] = useState('');
  const [formNumber, setFormNumber] = useState('');
  const [formComplement, setFormComplement] = useState('');
  const [formCity, setFormCity] = useState('');
  const [formZip, setFormZip] = useState('');
  const [formCountry, setFormCountry] = useState<CountryCode>(selectedCountry);
  const [formPhone, setFormPhone] = useState('');
  const [formShippingSectorId, setFormShippingSectorId] = useState('');

  // Região é só filtro de UI — NUNCA enviada ao backend (região é sempre
  // derivada do setor, mesmo princípio já usado na origem operacional do
  // seller — nunca uma segunda fonte de verdade geográfica).
  const [selectedRegionId, setSelectedRegionId] = useState('');
  const [regions, setRegions] = useState<GeoOption[]>([]);
  const [sectors, setSectors] = useState<GeoOption[]>([]);

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

  // FASE D16-F2.1 — CORREÇÃO: bug real observado no staging (Região/Setor
  // nunca apareciam ao abrir "Novo Endereço" com país já GW). A versão
  // anterior carregava Região/Setor a partir de um useEffect reativo a
  // [isModalOpen, formCountry] — mesmo padrão que a origem operacional do
  // SELLER (SellerOperationalAddressManager.tsx) NÃO usa: lá o carregamento
  // depende só de [storeId, storeCountryCode] (props estáveis), nunca do
  // modal abrir/fechar. Elimina TODA a categoria de risco "o efeito
  // reativo não disparou a tempo/na ordem esperada" trocando por chamada
  // IMPERATIVA disparada diretamente nos 3 pontos reais que precisam dela
  // (abrir criar, abrir editar, trocar país no select) — o carregamento
  // agora acontece no MESMO evento que muda o país/abre o modal, nunca
  // dependente de um efeito reagir depois.
  const loadGeographyForCountry = async (countryCode: string) => {
    if (!countryCode) {
      setRegions([]);
      setSectors([]);
      return;
    }
    try {
      const [regionsRes, sectorsRes] = await Promise.all([
        BuyerService.getShippingRegions(countryCode),
        BuyerService.getShippingSectors(countryCode),
      ]);
      // Geografia por setor é OPT-IN — países sem ela (ex.: BR) simplesmente
      // devolvem listas vazias, e o formulário não exige/mostra Região/Setor
      // (opt-in por dados, nunca um `if (country === 'GW')` hardcoded).
      setRegions(regionsRes.success ? regionsRes.data || [] : []);
      setSectors(sectorsRes.success ? sectorsRes.data || [] : []);
    } catch {
      setRegions([]);
      setSectors([]);
    }
  };

  const hasSectorGeography = regions.length > 0;
  const sectorOptions = selectedRegionId ? sectors.filter((s) => s.regionId === selectedRegionId) : sectors;

  const resetForm = () => {
    setFormRecipient('');
    setFormStreet('');
    setFormNumber('');
    setFormComplement('');
    setFormCity('');
    setFormZip('');
    setFormCountry(selectedCountry);
    setFormPhone('');
    setFormShippingSectorId('');
    setSelectedRegionId('');
    setFormError(null);
  };

  const handleOpenCreate = () => {
    setEditingAddressId(null);
    resetForm();
    setIsModalOpen(true);
    // FASE D16-F2.1 — dispara a busca de geografia AGORA, no mesmo evento
    // que abre o modal, com o país que realmente vai ser usado
    // (selectedCountry) — nunca depende de um efeito reativo disparar
    // depois. Corrige o bug real do staging: modal abria com país já GW
    // (valor inicial) e Região/Setor nunca apareciam.
    loadGeographyForCountry(selectedCountry);
  };

  const handleOpenEdit = (addr: any) => {
    const addrCountry = (addr.country || addr.countryCode || selectedCountry) as CountryCode;
    setEditingAddressId(addr.id);
    setFormRecipient(addr.recipientName || '');
    setFormStreet(addr.street || '');
    setFormNumber(addr.number || '');
    setFormComplement(addr.complement || '');
    setFormCity(addr.city || '');
    setFormZip(addr.zipCode || '');
    setFormCountry(addrCountry);
    setFormPhone(addr.phone || '');
    setFormShippingSectorId(addr.shippingSectorId || '');
    // Pré-seleciona a região a partir do shippingRegionId JÁ DERIVADO pela
    // API — nunca recalculado aqui, nunca persistido de volta.
    setSelectedRegionId(addr.shippingRegionId || '');
    setFormError(null);
    setIsModalOpen(true);
    loadGeographyForCountry(addrCountry);
  };

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!formStreet || !formCity || !formRecipient) {
      showToast('Por favor, preencha todos os campos obrigatórios.');
      return;
    }
    // UX: guia o comprador antes de bater no backend (que é quem de fato
    // impõe a regra — SHIPPING_SECTOR_REQUIRED) quando o país tem geografia
    // por setor configurada e nenhum setor foi escolhido ainda.
    if (hasSectorGeography && !formShippingSectorId) {
      setFormError('Selecione o setor de entrega para este país.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
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
        isDefault: editingAddressId ? undefined : savedAddresses.length === 0,
        // shippingRegionId NUNCA enviado — só shippingSectorId. Região é
        // sempre derivada pelo backend a partir do setor.
        shippingSectorId: formShippingSectorId || null,
      };

      const res = editingAddressId
        ? await BuyerService.updateAddress(editingAddressId, payload)
        : await BuyerService.addAddress(payload);

      if (res.success && res.data) {
        if (editingAddressId) {
          setSavedAddresses(prev => prev.map(a => (a.id === editingAddressId ? res.data : a)));
        } else {
          setSavedAddresses(prev => [res.data, ...prev]);
        }
        setIsModalOpen(false);
        resetForm();
        showToast(editingAddressId ? 'Endereço atualizado com sucesso!' : 'Endereço cadastrado com sucesso no banco de dados!');
      } else {
        setFormError(res.error?.message || res.message || 'Erro ao salvar endereço.');
      }
    } catch (err: any) {
      setFormError(err?.message || 'Falha na comunicação com o servidor.');
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
          onClick={handleOpenCreate}
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
                {/* FASE D16-F2 — referência logística autoritativa (setor de
                    frete), quando este endereço já tiver uma configurada. */}
                {addr.shippingSectorId && (
                  <p className="text-emerald-800 text-[11px] font-bold flex items-center gap-1 mt-1">
                    <Globe className="w-3.5 h-3.5" /> {addr.shippingRegionName ? `${addr.shippingRegionName} • ` : ''}Setor: {addr.shippingSectorName}
                  </p>
                )}
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
                    onClick={() => handleOpenEdit(addr)}
                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition cursor-pointer"
                    title="Editar endereço"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
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
              <MapPin className="w-5 h-5 text-emerald-600" /> {editingAddressId ? 'Editar Endereço' : 'Cadastrar Novo Endereço'}
            </h3>
            <p className="text-xs text-gray-500 mb-6">
              Informe os dados de entrega para agilizar suas compras no Mercado Nusali.
            </p>

            {formError && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-2.5 mb-4 font-semibold flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {formError}
              </p>
            )}

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
                    disabled={countriesLoading}
                    onChange={e => {
                      // FASE D16-F2 — trocar o país invalida região/setor
                      // escolhidos (pertenciam ao país anterior) — nunca
                      // permite um setor de outro país permanecer selecionado.
                      const newCountry = e.target.value as CountryCode;
                      setFormCountry(newCountry);
                      setSelectedRegionId('');
                      setFormShippingSectorId('');
                      // FASE D16-F2.1 — recarrega a geografia do país novo
                      // imperativamente (mesmo motivo do handleOpenCreate).
                      loadGeographyForCountry(newCountry);
                    }}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
                  >
                    {(!operationalCountries || !operationalCountries.some((c) => c.code === formCountry)) && formCountry && (
                      <option value={formCountry}>{formCountry}</option>
                    )}
                    {operationalCountries?.map((info) => (
                      <option key={info.code} value={info.code}>
                        {info.flag} {info.name}
                      </option>
                    ))}
                  </select>
                  {countriesLoading && <p className="text-[10px] text-gray-500 mt-1">Carregando países...</p>}
                  {!countriesLoading && countriesError && (
                    <p className="text-[10px] text-red-600 mt-1">Não foi possível carregar a lista de países.</p>
                  )}
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

              {/* FASE D16-F2 — Região > Setor, dependente, SÓ quando o país
                  tem geografia de frete por setor cadastrada (ex.: GW).
                  Região é só filtro de UI — nunca enviada ao backend. Aqui,
                  diferente da origem operacional do seller (opt-in sempre),
                  o setor é OBRIGATÓRIO quando a geografia existe — é a
                  unidade logística autoritativa do endereço de entrega. */}
              {hasSectorGeography && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Região</label>
                    <select
                      value={selectedRegionId}
                      onChange={e => { setSelectedRegionId(e.target.value); setFormShippingSectorId(''); }}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">Selecione a região</option>
                      {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Setor de Entrega *</label>
                    <select
                      value={formShippingSectorId}
                      onChange={e => setFormShippingSectorId(e.target.value)}
                      disabled={!selectedRegionId}
                      required
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
                    >
                      <option value="">Selecione o setor</option>
                      {sectorOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <p className="col-span-2 text-[10px] text-gray-500 -mt-1">
                    O setor é a referência logística usada pela Nusali para entrega — não substitui o endereço acima.
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => { setIsModalOpen(false); resetForm(); setEditingAddressId(null); }}
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
