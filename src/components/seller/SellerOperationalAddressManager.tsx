import React, { useEffect, useState } from 'react';
import {
  MapPin, X, Plus, Check, Loader2, Power, Edit2, AlertTriangle, Truck, CheckCircle2,
} from 'lucide-react';
import { SellerApi } from '../../api/clients/SellerApi';

/**
 * FASE D15-C2 — drawer real de origem operacional por loja, sobre a
 * fundação D15-A/C (shipping_sectors/addresses.shippingSectorId/
 * stores.operationalAddressId).
 *
 * Reutiliza integralmente os endpoints já existentes:
 *   GET/POST/PATCH /seller/addresses (D15-C)
 *   PATCH /seller/stores/:id (D15-C, aceita operationalAddressId)
 *   GET /seller/shipping/regions|sectors (D15-C2, NOVOS — somente leitura,
 *     necessários porque os endpoints admin de geografia exigem
 *     requireLogisticsStaff, que SELLER nunca tem; nunca expõem tarifa/rota).
 *
 * NÃO conectado a shipmentService/checkout/cálculo de frete — só permite ao
 * seller configurar a origem. stores.addressJson (legado) nunca é lido,
 * removido ou sobrescrito por este componente.
 *
 * Toda validação financeira/geográfica crítica (país, setor, ownership)
 * continua sendo autoridade EXCLUSIVA do backend — este componente só
 * exibe o erro exato devolvido pela API, nunca reimplementa a regra.
 */

interface OperationalAddress {
  id: string;
  recipientName: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  countryCode: string;
  zipCode: string;
  phone: string;
  addressType: string;
  isDefault: boolean;
  shippingSectorId: string | null;
  shippingSectorName: string | null;
  shippingRegionId: string | null;
  shippingRegionName: string | null;
}

interface GeoOption { id: string; name: string; code: string; regionId?: string }

interface SellerOperationalAddressManagerProps {
  storeId: string;
  storeCountryCode: string;
  currentOperationalAddressId: string | null;
  showToast: (msg: string) => void;
  onClose: () => void;
  onOperationalAddressChanged: (addressId: string | null) => void;
}

const emptyForm = {
  recipientName: '', street: '', number: '', complement: '', neighborhood: '',
  city: '', state: '', zipCode: '', phone: '', shippingSectorId: '',
};

export const SellerOperationalAddressManager: React.FC<SellerOperationalAddressManagerProps> = ({
  storeId, storeCountryCode, currentOperationalAddressId, showToast, onClose, onOperationalAddressChanged,
}) => {
  const [addresses, setAddresses] = useState<OperationalAddress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [regions, setRegions] = useState<GeoOption[]>([]);
  const [sectors, setSectors] = useState<GeoOption[]>([]);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<OperationalAddress | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedRegionId, setSelectedRegionId] = useState(''); // UI only — NUNCA enviado ao backend
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [settingOriginId, setSettingOriginId] = useState<string | null>(null);
  const [activeAddressId, setActiveAddressId] = useState<string | null>(currentOperationalAddressId);

  const loadAddresses = async () => {
    setIsLoading(true);
    try {
      const res = await SellerApi.getAddresses();
      if (res.success) setAddresses(res.data || []);
      else showToast(res.error?.message || res.message || 'Erro ao carregar endereços.');
    } catch (err: any) {
      showToast(err?.message || 'Erro ao carregar endereços.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadGeography = async () => {
    try {
      const [regionsRes, sectorsRes] = await Promise.all([
        SellerApi.getShippingRegions(storeCountryCode),
        SellerApi.getShippingSectors(storeCountryCode),
      ]);
      // Geografia por setor é OPT-IN — países sem ela (ex.: BR) simplesmente
      // devolvem listas vazias, e o formulário não exige/mostra Região/Setor.
      setRegions(regionsRes.success ? regionsRes.data || [] : []);
      setSectors(sectorsRes.success ? sectorsRes.data || [] : []);
    } catch {
      setRegions([]);
      setSectors([]);
    }
  };

  useEffect(() => {
    loadAddresses();
    loadGeography();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, storeCountryCode]);

  const hasSectorGeography = regions.length > 0;
  const sectorOptions = selectedRegionId ? sectors.filter((s) => s.regionId === selectedRegionId) : sectors;

  const handleOpenCreate = () => {
    setEditingAddress(null);
    setForm({ ...emptyForm });
    setSelectedRegionId('');
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (addr: OperationalAddress) => {
    setEditingAddress(addr);
    setForm({
      recipientName: addr.recipientName, street: addr.street, number: addr.number,
      complement: addr.complement || '', neighborhood: addr.neighborhood || '',
      city: addr.city, state: addr.state || '', zipCode: addr.zipCode || '', phone: addr.phone || '',
      shippingSectorId: addr.shippingSectorId || '',
    });
    // Pré-seleciona a região a partir do shippingRegionId JÁ DERIVADO pela
    // API — nunca recalculado aqui, nunca persistido de volta.
    setSelectedRegionId(addr.shippingRegionId || '');
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!form.recipientName.trim() || !form.street.trim() || !form.city.trim()) {
      setFormError('Nome do responsável, rua e cidade são obrigatórios.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        recipientName: form.recipientName.trim(),
        street: form.street.trim(),
        number: form.number.trim() || undefined,
        complement: form.complement.trim() || undefined,
        neighborhood: form.neighborhood.trim() || undefined,
        city: form.city.trim(),
        state: form.state.trim() || undefined,
        countryCode: storeCountryCode, // sempre o país da loja — nunca editável aqui
        zipCode: form.zipCode.trim() || undefined,
        phone: form.phone.trim() || undefined,
        // shippingRegionId NUNCA enviado — só shippingSectorId. Região é
        // sempre derivada pelo backend a partir do setor.
        shippingSectorId: form.shippingSectorId || null,
      };

      const res = editingAddress
        ? await SellerApi.updateAddress(editingAddress.id, payload)
        : await SellerApi.createAddress(payload);

      if (!res.success) {
        setFormError(res.error?.message || res.message || 'Erro ao salvar endereço.');
        return;
      }

      showToast(editingAddress ? 'Endereço operacional atualizado.' : 'Endereço operacional cadastrado.');
      setIsFormOpen(false);
      await loadAddresses();
    } catch (err: any) {
      setFormError(err?.message || 'Erro ao salvar endereço.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetOrigin = async (addressId: string) => {
    setSettingOriginId(addressId);
    try {
      const res = await SellerApi.updateStore(storeId, { operationalAddressId: addressId });
      if (!res.success) {
        showToast(res.error?.message || res.message || 'Erro ao definir origem operacional.');
        return;
      }
      showToast('Origem operacional definida para esta loja.');
      setActiveAddressId(addressId);
      onOperationalAddressChanged(addressId);
    } catch (err: any) {
      showToast(err?.message || 'Erro ao definir origem operacional.');
    } finally {
      setSettingOriginId(null);
    }
  };

  const handleRemoveOrigin = async () => {
    setSettingOriginId('__remove__');
    try {
      const res = await SellerApi.updateStore(storeId, { operationalAddressId: null });
      if (!res.success) {
        showToast(res.error?.message || res.message || 'Erro ao remover origem operacional.');
        return;
      }
      showToast('Origem operacional removida (o endereço continua salvo).');
      setActiveAddressId(null);
      onOperationalAddressChanged(null);
    } catch (err: any) {
      showToast(err?.message || 'Erro ao remover origem operacional.');
    } finally {
      setSettingOriginId(null);
    }
  };

  const activeAddress = addresses.find((a) => a.id === activeAddressId) || null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-end">
      <div className="bg-white h-full w-full max-w-xl shadow-2xl overflow-y-auto p-6 space-y-5 animate-fadeIn">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
            <Truck className="w-5 h-5 text-emerald-700" /> Origem Operacional / Local de Coleta
          </h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <p className="text-[11px] text-gray-500">
          Este endereço será usado como origem para cálculo e coleta logística das entregas desta loja.
        </p>

        {/* Origem ativa */}
        <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200">
          <span className="text-[10px] font-bold text-gray-400 uppercase block mb-2">Origem Atual</span>
          {activeAddress ? (
            <div className="space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-black text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Ativa</span>
                <button
                  onClick={handleRemoveOrigin}
                  disabled={settingOriginId === '__remove__'}
                  className="text-[11px] font-bold text-red-600 hover:text-red-800 disabled:opacity-50 cursor-pointer"
                >
                  Remover associação
                </button>
              </div>
              <p className="font-bold text-gray-900">{activeAddress.recipientName}</p>
              <p className="text-gray-700">{activeAddress.street}, {activeAddress.number}{activeAddress.complement ? ` — ${activeAddress.complement}` : ''}</p>
              <p className="text-gray-700">{activeAddress.neighborhood ? `${activeAddress.neighborhood}, ` : ''}{activeAddress.city} - {activeAddress.state}</p>
              <p className="text-gray-500">{activeAddress.countryCode}{activeAddress.zipCode ? ` • CEP ${activeAddress.zipCode}` : ''}</p>
              {activeAddress.phone && <p className="text-gray-500">Tel: {activeAddress.phone}</p>}
              {activeAddress.shippingSectorId ? (
                <p className="text-emerald-800 font-bold">
                  Região: {activeAddress.shippingRegionName} • Setor: {activeAddress.shippingSectorName}
                </p>
              ) : (
                <p className="text-gray-400 italic">Sem setor de frete configurado (opcional).</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Nenhuma origem operacional configurada para esta loja ainda.
            </p>
          )}
        </div>

        {/* Lista de endereços próprios */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-gray-400 uppercase">Meus Endereços Operacionais</span>
          <button
            onClick={handleOpenCreate}
            className="text-emerald-700 hover:text-emerald-900 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Cadastrar endereço operacional
          </button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-gray-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : addresses.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-xs bg-gray-50 rounded-xl border border-dashed border-gray-200">
            Nenhum endereço operacional cadastrado ainda.
          </div>
        ) : (
          <div className="space-y-2">
            {addresses.map((addr) => {
              const isActive = addr.id === activeAddressId;
              return (
                <div key={addr.id} className={`border rounded-xl p-3 text-xs space-y-1 ${isActive ? 'border-emerald-400 bg-emerald-50/40' : 'border-gray-200'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-900">{addr.recipientName}</span>
                    {isActive && <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">ATIVA NESTA LOJA</span>}
                  </div>
                  <p className="text-gray-600">{addr.street}, {addr.number} — {addr.city}/{addr.state} — {addr.countryCode}</p>
                  {addr.shippingSectorId && (
                    <p className="text-gray-500">Setor: {addr.shippingSectorName} ({addr.shippingRegionName})</p>
                  )}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button onClick={() => handleOpenEdit(addr)} className="p-1 text-gray-500 hover:text-gray-800 cursor-pointer" title="Editar">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {!isActive && (
                      <button
                        onClick={() => handleSetOrigin(addr.id)}
                        disabled={settingOriginId === addr.id}
                        className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold rounded-lg cursor-pointer disabled:opacity-50 flex items-center gap-1"
                      >
                        <Power className="w-3.5 h-3.5" /> Definir como origem desta loja
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Formulário criar/editar */}
        {isFormOpen && (
          <form onSubmit={handleSubmit} className="border border-gray-200 rounded-2xl p-4 space-y-3 text-xs bg-purple-50/30">
            <div className="flex items-center justify-between">
              <h4 className="font-black text-gray-900">{editingAddress ? 'Editar endereço' : 'Novo endereço operacional'}</h4>
              <button type="button" onClick={() => setIsFormOpen(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>

            {formError && (
              <p className="text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 font-semibold flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {formError}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <label className="block font-bold text-gray-700 mb-1">Nome do responsável *</label>
                <input type="text" value={form.recipientName} onChange={(e) => setForm({ ...form, recipientName: e.target.value })} className="w-full p-2 border border-gray-300 rounded-lg font-bold" />
              </div>
              <div className="col-span-2">
                <label className="block font-bold text-gray-700 mb-1">Rua *</label>
                <input type="text" value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} className="w-full p-2 border border-gray-300 rounded-lg font-bold" />
              </div>
              <div>
                <label className="block font-bold text-gray-700 mb-1">Número</label>
                <input type="text" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} className="w-full p-2 border border-gray-300 rounded-lg font-bold" />
              </div>
              <div>
                <label className="block font-bold text-gray-700 mb-1">Complemento</label>
                <input type="text" value={form.complement} onChange={(e) => setForm({ ...form, complement: e.target.value })} className="w-full p-2 border border-gray-300 rounded-lg font-bold" />
              </div>
              <div className="col-span-2">
                <label className="block font-bold text-gray-700 mb-1">Bairro / Localidade</label>
                <input type="text" value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} className="w-full p-2 border border-gray-300 rounded-lg font-bold" />
              </div>
              <div>
                <label className="block font-bold text-gray-700 mb-1">Cidade *</label>
                <input type="text" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="w-full p-2 border border-gray-300 rounded-lg font-bold" />
              </div>
              <div>
                <label className="block font-bold text-gray-700 mb-1">Estado/Província</label>
                <input type="text" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className="w-full p-2 border border-gray-300 rounded-lg font-bold" />
              </div>
              <div>
                <label className="block font-bold text-gray-700 mb-1">CEP / Código Postal</label>
                <input type="text" value={form.zipCode} onChange={(e) => setForm({ ...form, zipCode: e.target.value })} className="w-full p-2 border border-gray-300 rounded-lg font-bold" />
              </div>
              <div>
                <label className="block font-bold text-gray-700 mb-1">Telefone</label>
                <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full p-2 border border-gray-300 rounded-lg font-bold" />
              </div>
              <div className="col-span-2">
                <label className="block font-bold text-gray-700 mb-1">País</label>
                <input type="text" value={storeCountryCode} disabled className="w-full p-2 border border-gray-200 rounded-lg font-bold bg-gray-100 text-gray-500" />
                <p className="text-[10px] text-gray-400 mt-0.5">Sempre o país desta loja — não editável aqui.</p>
              </div>

              {/* Região > Setor, dependente, SÓ quando o país tem geografia de frete por setor (ex.: GW). Região é só filtro de UI — nunca enviada ao backend. */}
              {hasSectorGeography && (
                <>
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Região (filtro)</label>
                    <select
                      value={selectedRegionId}
                      onChange={(e) => { setSelectedRegionId(e.target.value); setForm({ ...form, shippingSectorId: '' }); }}
                      className="w-full p-2 border border-gray-300 rounded-lg font-bold bg-white"
                    >
                      <option value="">Selecione a região</option>
                      {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Setor de Frete</label>
                    <select
                      value={form.shippingSectorId}
                      onChange={(e) => setForm({ ...form, shippingSectorId: e.target.value })}
                      disabled={!selectedRegionId}
                      className="w-full p-2 border border-gray-300 rounded-lg font-bold bg-white disabled:opacity-50"
                    >
                      <option value="">Sem setor (opcional)</option>
                      {sectorOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button type="button" onClick={() => setIsFormOpen(false)} className="px-3 py-1.5 border border-gray-300 rounded-lg font-bold text-gray-700 cursor-pointer">Cancelar</button>
              <button type="submit" disabled={isSaving} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-lg flex items-center gap-1 cursor-pointer disabled:opacity-50">
                <Check className="w-3.5 h-3.5" /> Salvar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
