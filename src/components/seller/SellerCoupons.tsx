import React, { useEffect, useMemo, useState } from 'react';
import { Gift, Plus, Copy, Loader2, Pencil, Trash2, Power } from 'lucide-react';
import { SellerApi } from '../../api/clients/SellerApi';
import { useCountries } from '../../hooks/useCountries';

interface SellerCouponsProps {
  showToast: (msg: string) => void;
}

interface CouponRow {
  id: string;
  code: string;
  title: string;
  storeId: string | null;
  storeName: string | null;
  discountType: string;
  discountValue: number;
  currency: string | null;
  minimumSpend: number;
  maxDiscount: number | null;
  usageLimit: number | null;
  usageLimitPerUser: number | null;
  usageCount: number;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
}

interface StoreOption {
  id: string;
  name: string;
}

const emptyForm = {
  code: '',
  title: '',
  storeId: '',
  discountType: 'PERCENTAGE' as 'PERCENTAGE' | 'FIXED',
  discountValue: '',
  currency: '',
  minimumSpend: '0',
  maxDiscount: '',
  usageLimit: '',
  usageLimitPerUser: '',
  startDate: '',
  endDate: '',
};

function toDateInputValue(iso: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

export const SellerCoupons: React.FC<SellerCouponsProps> = ({ showToast }) => {
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Moedas SEMPRE derivadas dos países operacionais reais (GET /api/v1/countries,
  // já usado em todo o restante do app via useCountries/CountriesApi) — nunca uma
  // lista fixa no frontend. Deduplicadas (dois países com a mesma moeda aparecem
  // uma única vez). Sem fallback silencioso: se os países ainda não carregaram ou
  // a busca falhou, currencyOptions fica vazio e a criação de cupom é bloqueada.
  const { data: operationalCountries, isLoading: isLoadingCountries, isError: isCountriesError } = useCountries();
  const currencyOptions = useMemo(() => {
    if (!operationalCountries) return [];
    return Array.from(new Set(operationalCountries.map((c) => c.currency).filter(Boolean)));
  }, [operationalCountries]);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadCoupons = async () => {
    try {
      const res = await SellerApi.getCoupons();
      if (res.success) setCoupons(res.data || []);
      else showToast(res.error?.message || res.message || 'Erro ao carregar cupons.');
    } catch (err: any) {
      showToast(err?.message || 'Erro ao carregar cupons.');
    }
  };

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const [couponsRes, storesRes] = await Promise.all([SellerApi.getCoupons(), SellerApi.getStores()]);
        if (couponsRes.success) setCoupons(couponsRes.data || []);
        else showToast(couponsRes.error?.message || couponsRes.message || 'Erro ao carregar cupons.');
        if (storesRes.success) setStores((storesRes.data || []).map((s: any) => ({ id: s.id, name: s.name })));
      } catch (err: any) {
        showToast(err?.message || 'Erro ao carregar dados.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const openCreateModal = () => {
    if (currencyOptions.length === 0) {
      showToast('Não foi possível carregar as moedas operacionais. Tente novamente em instantes.');
      return;
    }
    setEditingId(null);
    setForm({ ...emptyForm, storeId: stores[0]?.id || '', currency: currencyOptions[0] });
    setFormError(null);
    setShowModal(true);
  };

  const openEditModal = (c: CouponRow) => {
    setEditingId(c.id);
    setForm({
      code: c.code,
      title: c.title,
      storeId: c.storeId || '',
      discountType: c.discountType === 'FIXED' ? 'FIXED' : 'PERCENTAGE',
      discountValue: String(c.discountValue),
      currency: c.currency || currencyOptions[0] || '',
      minimumSpend: String(c.minimumSpend ?? 0),
      maxDiscount: c.maxDiscount !== null ? String(c.maxDiscount) : '',
      usageLimit: c.usageLimit !== null ? String(c.usageLimit) : '',
      usageLimitPerUser: c.usageLimitPerUser !== null ? String(c.usageLimitPerUser) : '',
      startDate: toDateInputValue(c.startDate),
      endDate: toDateInputValue(c.endDate),
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.storeId) {
      setFormError('Selecione uma loja.');
      return;
    }
    setIsSaving(true);
    setFormError(null);
    try {
      const payload: any = {
        code: form.code.trim(),
        title: form.title.trim(),
        storeId: form.storeId,
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        currency: form.currency,
        minimumSpend: form.minimumSpend === '' ? 0 : Number(form.minimumSpend),
        maxDiscount: form.discountType === 'FIXED' || form.maxDiscount === '' ? null : Number(form.maxDiscount),
        usageLimit: form.usageLimit === '' ? null : Number(form.usageLimit),
        usageLimitPerUser: form.usageLimitPerUser === '' ? null : Number(form.usageLimitPerUser),
        startDate: form.startDate || null,
        endDate: form.endDate || null,
      };

      const res = editingId
        ? await SellerApi.updateCoupon(editingId, payload)
        : await SellerApi.createCoupon(payload);

      if (!res.success) {
        setFormError(res.error?.message || res.message || 'Erro ao salvar cupom.');
        return;
      }

      showToast(res.message || `Cupom "${payload.code.toUpperCase()}" salvo com sucesso!`);
      setShowModal(false);
      await loadCoupons();
    } catch (err: any) {
      setFormError(err?.message || 'Erro ao salvar cupom.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (c: CouponRow) => {
    try {
      const res = await SellerApi.setCouponStatus(c.id, !c.isActive);
      if (!res.success) {
        showToast(res.error?.message || res.message || 'Erro ao atualizar status do cupom.');
        return;
      }
      showToast(res.message || 'Status do cupom atualizado.');
      await loadCoupons();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao atualizar status do cupom.');
    }
  };

  const handleDelete = async (c: CouponRow) => {
    try {
      const res = await SellerApi.deleteCoupon(c.id);
      if (!res.success) {
        showToast(res.error?.message || res.message || 'Não foi possível excluir este cupom.');
        return;
      }
      showToast('Cupom removido.');
      await loadCoupons();
    } catch (err: any) {
      showToast(err?.message || 'Não foi possível excluir este cupom.');
    }
  };

  const formatDiscount = (c: CouponRow) => {
    if (c.discountType === 'FIXED') return `${c.currency || ''} ${c.discountValue.toFixed(2)} OFF`;
    const cap = c.maxDiscount !== null ? ` (até ${c.currency || ''} ${c.maxDiscount.toFixed(2)})` : '';
    return `${c.discountValue}% OFF${cap}`;
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Gift className="w-6 h-6 text-emerald-600" />
            Cupons do Vendedor
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Crie códigos promocionais financiados por você para uma de suas lojas. O desconto reduz o que o comprador paga e o seu próprio valor líquido — nunca o frete ou a comissão da Nusali.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          disabled={stores.length === 0 || currencyOptions.length === 0}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-md transition flex items-center gap-1.5"
          title={
            stores.length === 0
              ? 'Crie uma loja antes de criar cupons.'
              : currencyOptions.length === 0
              ? 'Carregando moedas operacionais...'
              : undefined
          }
        >
          <Plus className="w-4 h-4" /> Criar Novo Cupom
        </button>
      </div>

      {isCountriesError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold p-3 rounded-xl">
          Não foi possível carregar os países/moedas operacionais. A criação de cupons ficará indisponível até isso ser resolvido.
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] font-bold border-b border-gray-200">
              <tr>
                <th className="p-3">Código</th>
                <th className="p-3">Loja</th>
                <th className="p-3">Desconto</th>
                <th className="p-3">Compra Mínima</th>
                <th className="p-3">Usos / Limite</th>
                <th className="p-3">Por Usuário</th>
                <th className="p-3">Vigência</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 font-medium">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-gray-400">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : coupons.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-gray-400">
                    Nenhum cupom de desconto criado para sua loja no momento.
                  </td>
                </tr>
              ) : (
                coupons.map((c) => (
                  <tr key={c.id}>
                    <td className="p-3 font-mono font-black text-emerald-800 text-sm">
                      <div className="flex items-center gap-1.5">
                        {c.code}
                        <button
                          onClick={() => {
                            navigator.clipboard?.writeText(c.code);
                            showToast(`Código ${c.code} copiado para a área de transferência!`);
                          }}
                          className="p-1 hover:bg-gray-100 rounded-lg text-gray-400"
                          title="Copiar Código"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="font-sans font-normal text-gray-500 text-[11px] normal-case">{c.title}</div>
                    </td>
                    <td className="p-3 text-gray-700">{c.storeName || '—'}</td>
                    <td className="p-3 font-bold text-gray-900">{formatDiscount(c)}</td>
                    <td className="p-3 text-gray-600">{c.currency || ''} {Number(c.minimumSpend || 0).toFixed(2)}</td>
                    <td className="p-3 text-gray-700">{c.usageCount} / {c.usageLimit ?? '∞'}</td>
                    <td className="p-3 text-gray-700">{c.usageLimitPerUser ?? '∞'}</td>
                    <td className="p-3 text-gray-500 text-[11px]">
                      {c.startDate ? toDateInputValue(c.startDate) : '—'} → {c.endDate ? toDateInputValue(c.endDate) : '—'}
                    </td>
                    <td className="p-3">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                        c.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {c.isActive ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEditModal(c)}
                          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleStatus(c)}
                          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"
                          title={c.isActive ? 'Desativar' : 'Ativar'}
                        >
                          <Power className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(c)}
                          className="p-1.5 hover:bg-red-50 rounded-lg text-red-500"
                          title="Excluir (apenas se nunca usado — caso contrário, desative)"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 border border-gray-200 shadow-2xl my-8">
            <h3 className="text-base font-black text-gray-900">{editingId ? 'Editar Cupom' : 'Novo Cupom de Desconto'}</h3>

            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-semibold p-3 rounded-xl">{formError}</div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700">Código:</label>
                <input
                  type="text"
                  required
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="Ex: NUSALI15"
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-mono uppercase text-xs font-bold focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700">Loja:</label>
                <select
                  required
                  value={form.storeId}
                  onChange={(e) => setForm({ ...form, storeId: e.target.value })}
                  className="w-full p-2.5 border border-gray-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="" disabled>Selecione...</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-700">Título:</label>
              <input
                type="text"
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Ex: Desconto de boas-vindas"
                className="w-full p-2.5 border border-gray-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700">Tipo:</label>
                <select
                  value={form.discountType}
                  onChange={(e) => setForm({ ...form, discountType: e.target.value as 'PERCENTAGE' | 'FIXED', maxDiscount: e.target.value === 'FIXED' ? '' : form.maxDiscount })}
                  className="w-full p-2.5 border border-gray-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="PERCENTAGE">Percentual</option>
                  <option value="FIXED">Valor Fixo</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700">{form.discountType === 'FIXED' ? 'Valor:' : 'Percentual (%):'}</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={form.discountValue}
                  onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                  className="w-full p-2.5 border border-gray-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700">Moeda:</label>
                <select
                  value={form.currency}
                  disabled={isLoadingCountries}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  className="w-full p-2.5 border border-gray-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100"
                >
                  {currencyOptions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700">Compra Mínima:</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.minimumSpend}
                  onChange={(e) => setForm({ ...form, minimumSpend: e.target.value })}
                  className="w-full p-2.5 border border-gray-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700">Desconto Máximo:</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={form.discountType === 'FIXED'}
                  value={form.maxDiscount}
                  onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })}
                  placeholder={form.discountType === 'FIXED' ? 'Não aplicável' : 'Sem teto'}
                  className="w-full p-2.5 border border-gray-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-100 disabled:text-gray-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700">Limite de Usos Total:</label>
                <input
                  type="number"
                  min="1"
                  value={form.usageLimit}
                  onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
                  placeholder="Sem limite"
                  className="w-full p-2.5 border border-gray-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700">Limite por Usuário:</label>
                <input
                  type="number"
                  min="1"
                  value={form.usageLimitPerUser}
                  onChange={(e) => setForm({ ...form, usageLimitPerUser: e.target.value })}
                  placeholder="Sem limite"
                  className="w-full p-2.5 border border-gray-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700">Início da Vigência:</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  className="w-full p-2.5 border border-gray-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700">Fim da Vigência:</label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  className="w-full p-2.5 border border-gray-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="w-1/2 bg-gray-100 py-2.5 rounded-xl text-xs font-bold">
                Cancelar
              </button>
              <button type="submit" disabled={isSaving} className="w-1/2 bg-emerald-600 disabled:opacity-60 text-white py-2.5 rounded-xl text-xs font-extrabold shadow-md flex items-center justify-center gap-1.5">
                {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {editingId ? 'Salvar Alterações' : 'Criar Cupom'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
