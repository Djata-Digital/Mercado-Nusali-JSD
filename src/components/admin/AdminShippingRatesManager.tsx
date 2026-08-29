import React, { useEffect, useMemo, useState } from 'react';
import {
  Truck, Plus, Edit2, Trash2, X, Check, Power, AlertTriangle, Search, Loader2, Calculator,
} from 'lucide-react';
import { AdminApi } from '../../api/clients/AdminApi';
import { useCountries } from '../../hooks/useCountries';

interface AdminShippingRatesManagerProps {
  showToast: (msg: string) => void;
}

interface ShippingRate {
  id: string;
  originCountry: string;
  destinationCountry: string;
  originRegion: string | null;
  destinationRegion: string | null;
  minWeightKg: string | number;
  maxWeightKg: string | number;
  price: string | number;
  currency: string;
  estimatedMinDays: number;
  estimatedMaxDays: number;
  serviceType: string;
  isActive: boolean;
  updatedAt: string;
}

const emptyForm = {
  originCountry: '',
  destinationCountry: '',
  originRegion: '',
  destinationRegion: '',
  minWeightKg: '0',
  maxWeightKg: '',
  price: '',
  currency: '',
  estimatedMinDays: '1',
  estimatedMaxDays: '5',
  serviceType: 'standard',
};

export const AdminShippingRatesManager: React.FC<AdminShippingRatesManagerProps> = ({ showToast }) => {
  // Países reais operacionais — GET /api/v1/countries, NUNCA lista hardcoded.
  const { data: operationalCountries } = useCountries();

  const [rates, setRates] = useState<ShippingRate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<ShippingRate | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);

  const [coverageOrigin, setCoverageOrigin] = useState('');
  const [coverageDestination, setCoverageDestination] = useState('');
  const [coverageCurrency, setCoverageCurrency] = useState('');
  const [coverageResult, setCoverageResult] = useState<any>(null);
  const [coverageLoading, setCoverageLoading] = useState(false);

  const [simOrigin, setSimOrigin] = useState('');
  const [simDestination, setSimDestination] = useState('');
  const [simWeight, setSimWeight] = useState('');
  const [simCurrency, setSimCurrency] = useState('');
  const [simResult, setSimResult] = useState<any>(null);
  const [simLoading, setSimLoading] = useState(false);

  const loadRates = async () => {
    setIsLoading(true);
    try {
      const res = await AdminApi.getShippingRates();
      if (res.success && Array.isArray(res.data)) {
        setRates(res.data);
      } else {
        showToast(res.error?.message || res.message || 'Erro ao carregar tarifas de frete.');
      }
    } catch (err: any) {
      showToast(err?.message || 'Erro ao carregar tarifas de frete.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const countryName = (code: string) => operationalCountries?.find((c) => c.code === code)?.name || code;
  const countryFlag = (code: string) => operationalCountries?.find((c) => c.code === code)?.flag || '';

  // Moedas reais sugeridas = moedas oficiais dos países operacionais ativos
  // (nunca uma lista de siglas hardcoded).
  const realCurrencies = useMemo(
    () => Array.from(new Set((operationalCountries || []).map((c) => c.currency))),
    [operationalCountries]
  );

  const handleOpenCreate = () => {
    setEditingRate(null);
    setForm(emptyForm);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (r: ShippingRate) => {
    setEditingRate(r);
    setForm({
      originCountry: r.originCountry,
      destinationCountry: r.destinationCountry,
      originRegion: r.originRegion || '',
      destinationRegion: r.destinationRegion || '',
      minWeightKg: String(r.minWeightKg),
      maxWeightKg: String(r.maxWeightKg),
      price: String(r.price),
      currency: r.currency,
      estimatedMinDays: String(r.estimatedMinDays),
      estimatedMaxDays: String(r.estimatedMaxDays),
      serviceType: r.serviceType || 'standard',
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const payload = {
      originCountry: form.originCountry,
      destinationCountry: form.destinationCountry,
      originRegion: form.originRegion || null,
      destinationRegion: form.destinationRegion || null,
      minWeightKg: form.minWeightKg,
      maxWeightKg: form.maxWeightKg,
      price: form.price,
      currency: form.currency,
      estimatedMinDays: form.estimatedMinDays,
      estimatedMaxDays: form.estimatedMaxDays,
      serviceType: form.serviceType,
    };

    try {
      const res = editingRate
        ? await AdminApi.updateShippingRate(editingRate.id, payload)
        : await AdminApi.createShippingRate(payload);

      if (!res.success) {
        // Mensagem exata pedida para sobreposição de faixa de peso.
        if (res.error?.code === 'SHIPPING_RATE_WEIGHT_RANGE_OVERLAP') {
          setFormError('Já existe uma tarifa ativa que cobre parte desta faixa de peso.');
        } else {
          setFormError(res.error?.message || res.message || 'Erro ao salvar tarifa.');
        }
        return;
      }

      showToast(editingRate ? 'Tarifa atualizada com sucesso!' : 'Tarifa cadastrada com sucesso!');
      setIsModalOpen(false);
      loadRates();
    } catch (err: any) {
      setFormError(err?.message || 'Erro ao salvar tarifa.');
    }
  };

  const handleToggle = async (r: ShippingRate) => {
    setSavingId(r.id);
    try {
      const res = await AdminApi.toggleShippingRate(r.id, !r.isActive);
      if (!res.success) {
        if (res.error?.code === 'SHIPPING_RATE_WEIGHT_RANGE_OVERLAP') {
          showToast('Não é possível ativar: já existe uma tarifa ativa que cobre parte desta faixa de peso.');
        } else {
          showToast(res.error?.message || res.message || 'Erro ao alterar status da tarifa.');
        }
        return;
      }
      showToast(!r.isActive ? 'Tarifa ativada.' : 'Tarifa desativada.');
      loadRates();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao alterar status da tarifa.');
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (r: ShippingRate) => {
    if (!confirm(`Excluir a tarifa ${r.originCountry} → ${r.destinationCountry} (${Number(r.minWeightKg)}–${Number(r.maxWeightKg)} kg)?`)) return;
    setSavingId(r.id);
    try {
      const res = await AdminApi.deleteShippingRate(r.id);
      if (!res.success) {
        if (res.error?.code === 'SHIPPING_RATE_DELETE_UNSAFE') {
          showToast('Esta tarifa já foi usada em pedidos reais — desative-a em vez de excluir, para não perder o histórico financeiro.');
        } else {
          showToast(res.error?.message || res.message || 'Erro ao excluir tarifa.');
        }
        return;
      }
      showToast('Tarifa removida.');
      loadRates();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao excluir tarifa.');
    } finally {
      setSavingId(null);
    }
  };

  const handleCheckCoverage = async () => {
    if (!coverageOrigin || !coverageDestination || !coverageCurrency) {
      showToast('Selecione origem, destino e moeda para verificar a cobertura.');
      return;
    }
    setCoverageLoading(true);
    setCoverageResult(null);
    try {
      const res = await AdminApi.getShippingRateCoverage({ originCountry: coverageOrigin, destinationCountry: coverageDestination, currency: coverageCurrency });
      if (res.success) setCoverageResult(res.data);
      else showToast(res.error?.message || res.message || 'Erro ao verificar cobertura.');
    } catch (err: any) {
      showToast(err?.message || 'Erro ao verificar cobertura.');
    } finally {
      setCoverageLoading(false);
    }
  };

  const handleSimulate = async () => {
    const weightNum = parseFloat(simWeight);
    if (!simOrigin || !simDestination || !simCurrency || !simWeight || isNaN(weightNum) || weightNum <= 0) {
      showToast('Preencha origem, destino, moeda e um peso válido para simular.');
      return;
    }
    setSimLoading(true);
    setSimResult(null);
    try {
      // Chama a MESMA função real usada pelo checkout (ShippingCalculatorService.calculateFreight)
      // via POST /admin/shipping-rates/simulate — nunca um cálculo duplicado aqui.
      const res = await AdminApi.simulateShippingRate({
        originCountry: simOrigin,
        destinationCountry: simDestination,
        weightKg: weightNum,
        currency: simCurrency,
      });
      if (res.success) setSimResult(res.data);
      else showToast(res.error?.message || res.message || 'Erro ao simular tarifa.');
    } catch (err: any) {
      showToast(err?.message || 'Erro ao simular tarifa.');
    } finally {
      setSimLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Truck className="w-6 h-6 text-purple-600" />
            Tarifas de Frete
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Tarifas reais usadas pelo cálculo de frete do checkout — mesma tabela e mesmo motor de cálculo do produto/carrinho/checkout.
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-md cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Nova Tarifa
        </button>
      </div>

      {/* Listagem */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-400">
            <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
            <p className="text-sm font-medium">Carregando tarifas...</p>
          </div>
        ) : rates.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Truck className="w-12 h-12 mx-auto mb-3 text-gray-300 stroke-1" />
            <p className="font-bold text-sm text-gray-600">Nenhuma tarifa de frete cadastrada.</p>
            <p className="text-xs text-gray-400 mt-1">Clique em "Nova Tarifa" para cadastrar a primeira — nenhum valor é inventado automaticamente.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3 font-bold">Origem</th>
                  <th className="text-left px-4 py-3 font-bold">Destino</th>
                  <th className="text-left px-4 py-3 font-bold">Faixa de Peso</th>
                  <th className="text-left px-4 py-3 font-bold">Tarifa</th>
                  <th className="text-left px-4 py-3 font-bold">Serviço</th>
                  <th className="text-left px-4 py-3 font-bold">Status</th>
                  <th className="text-left px-4 py-3 font-bold">Atualizado</th>
                  <th className="text-right px-4 py-3 font-bold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rates.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-bold text-gray-900">
                      {countryFlag(r.originCountry)} {countryName(r.originCountry)}
                      {r.originRegion && <span className="block text-[10px] text-gray-400 font-medium">{r.originRegion}</span>}
                    </td>
                    <td className="px-4 py-3 font-bold text-gray-900">
                      {countryFlag(r.destinationCountry)} {countryName(r.destinationCountry)}
                      {r.destinationRegion && <span className="block text-[10px] text-gray-400 font-medium">{r.destinationRegion}</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-700 font-mono">{Number(r.minWeightKg)}–{Number(r.maxWeightKg)} kg</td>
                    <td className="px-4 py-3 font-black text-gray-900">{Number(r.price).toFixed(2)} {r.currency}</td>
                    <td className="px-4 py-3 text-gray-600">{r.serviceType}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${r.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500'}`}>
                        {r.isActive ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-[11px]">{r.updatedAt ? new Date(r.updatedAt).toLocaleString('pt-BR') : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          disabled={savingId === r.id}
                          onClick={() => handleOpenEdit(r)}
                          className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg cursor-pointer disabled:opacity-40"
                          title="Editar"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          disabled={savingId === r.id}
                          onClick={() => handleToggle(r)}
                          className={`p-1.5 rounded-lg cursor-pointer disabled:opacity-40 ${r.isActive ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'}`}
                          title={r.isActive ? 'Desativar' : 'Ativar'}
                        >
                          <Power className="w-4 h-4" />
                        </button>
                        <button
                          disabled={savingId === r.id}
                          onClick={() => handleDelete(r)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer disabled:opacity-40"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Diagnóstico de cobertura por rota */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5 space-y-4">
        <h2 className="font-black text-sm text-gray-900 flex items-center gap-2">
          <Search className="w-4 h-4 text-purple-600" /> Verificar Cobertura de Peso por Rota
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <select value={coverageOrigin} onChange={(e) => setCoverageOrigin(e.target.value)} className="p-2.5 border border-gray-300 rounded-xl text-xs font-bold">
            <option value="">País de origem</option>
            {operationalCountries?.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
          </select>
          <select value={coverageDestination} onChange={(e) => setCoverageDestination(e.target.value)} className="p-2.5 border border-gray-300 rounded-xl text-xs font-bold">
            <option value="">País de destino</option>
            {operationalCountries?.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
          </select>
          <input
            list="rate-currencies"
            value={coverageCurrency}
            onChange={(e) => setCoverageCurrency(e.target.value.toUpperCase())}
            placeholder="Moeda (ex: BRL)"
            className="p-2.5 border border-gray-300 rounded-xl text-xs font-bold"
          />
          <button onClick={handleCheckCoverage} disabled={coverageLoading} className="bg-gray-900 hover:bg-black text-white font-bold text-xs rounded-xl px-4 py-2.5 disabled:opacity-50">
            {coverageLoading ? 'Verificando...' : 'Verificar'}
          </button>
        </div>

        {coverageResult && (
          <div className="space-y-1.5 pt-2 border-t border-gray-100">
            {!coverageResult.hasAnyRate && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                Nenhuma tarifa ativa cadastrada para esta rota nesta moeda.
              </p>
            )}
            {coverageResult.segments.map((seg: any, idx: number) => (
              <div key={idx} className={`text-xs font-bold px-3 py-2 rounded-lg flex items-center justify-between ${seg.covered ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                <span>{seg.from}–{seg.to} kg</span>
                <span>
                  {seg.covered ? `Configurado (${seg.price?.toFixed(2)} ${coverageResult.currency})` : (
                    <span className="flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Faixa sem cobertura</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Simulador de frete — mesmo motor real do checkout */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5 space-y-4">
        <h2 className="font-black text-sm text-gray-900 flex items-center gap-2">
          <Calculator className="w-4 h-4 text-purple-600" /> Testar Tarifa (mesmo cálculo real do checkout)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <select value={simOrigin} onChange={(e) => setSimOrigin(e.target.value)} className="p-2.5 border border-gray-300 rounded-xl text-xs font-bold">
            <option value="">Origem</option>
            {operationalCountries?.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
          </select>
          <select value={simDestination} onChange={(e) => setSimDestination(e.target.value)} className="p-2.5 border border-gray-300 rounded-xl text-xs font-bold">
            <option value="">Destino</option>
            {operationalCountries?.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
          </select>
          <input type="number" min="0" step="0.001" value={simWeight} onChange={(e) => setSimWeight(e.target.value)} placeholder="Peso (kg)" className="p-2.5 border border-gray-300 rounded-xl text-xs font-bold" />
          <input list="rate-currencies" value={simCurrency} onChange={(e) => setSimCurrency(e.target.value.toUpperCase())} placeholder="Moeda" className="p-2.5 border border-gray-300 rounded-xl text-xs font-bold" />
          <button onClick={handleSimulate} disabled={simLoading} className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl px-4 py-2.5 disabled:opacity-50">
            {simLoading ? 'Calculando...' : 'Calcular'}
          </button>
        </div>

        {simResult && (
          <div className="pt-2 border-t border-gray-100 text-xs space-y-1">
            {!simResult.available ? (
              <p className="text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 font-semibold">
                {simResult.errorMessage || 'Nenhuma tarifa configurada para esse peso.'}
              </p>
            ) : (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-1 font-semibold text-emerald-900">
                <div>Peso considerado: <strong>{simResult.billableWeightKg ?? simWeight} kg</strong></div>
                <div>Custo real da tarifa (shippingCostActual): <strong>{Number(simResult.shippingCost).toFixed(2)} {simResult.currency}</strong></div>
                <div>Valor cobrado do comprador: <strong>{Number(simResult.shippingChargedToBuyer).toFixed(2)} {simResult.currency}</strong></div>
                <div>Política aplicada: <strong>{simResult.policyMode}</strong></div>
                <div>Prazo estimado: <strong>{simResult.estimatedMinDays}–{simResult.estimatedMaxDays} dias úteis</strong></div>
              </div>
            )}
          </div>
        )}
      </div>

      <datalist id="rate-currencies">
        {realCurrencies.map((cur) => <option key={cur} value={cur} />)}
      </datalist>

      {/* Modal Cadastrar / Editar */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 space-y-4 animate-fadeIn my-8">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
                <Truck className="w-5 h-5 text-purple-600" />
                {editingRate ? 'Editar Tarifa' : 'Nova Tarifa de Frete'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3 text-xs">
              {formError && (
                <p className="text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 font-semibold">{formError}</p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">País de origem *</label>
                  <select required value={form.originCountry} onChange={(e) => setForm({ ...form, originCountry: e.target.value })} className="w-full p-2.5 border border-gray-300 rounded-xl font-bold">
                    <option value="">Selecione</option>
                    {operationalCountries?.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">País de destino *</label>
                  <select required value={form.destinationCountry} onChange={(e) => setForm({ ...form, destinationCountry: e.target.value })} className="w-full p-2.5 border border-gray-300 rounded-xl font-bold">
                    <option value="">Selecione</option>
                    {operationalCountries?.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Região/cidade origem</label>
                  <input type="text" value={form.originRegion} onChange={(e) => setForm({ ...form, originRegion: e.target.value })} placeholder="Opcional" className="w-full p-2.5 border border-gray-300 rounded-xl font-bold" />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Região/cidade destino</label>
                  <input type="text" value={form.destinationRegion} onChange={(e) => setForm({ ...form, destinationRegion: e.target.value })} placeholder="Opcional" className="w-full p-2.5 border border-gray-300 rounded-xl font-bold" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Peso mínimo (kg) *</label>
                  <input required type="number" min="0" step="0.001" value={form.minWeightKg} onChange={(e) => setForm({ ...form, minWeightKg: e.target.value })} className="w-full p-2.5 border border-gray-300 rounded-xl font-bold" />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Peso máximo (kg) *</label>
                  <input required type="number" min="0" step="0.001" value={form.maxWeightKg} onChange={(e) => setForm({ ...form, maxWeightKg: e.target.value })} className="w-full p-2.5 border border-gray-300 rounded-xl font-bold" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Preço da tarifa *</label>
                  <input required type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="w-full p-2.5 border border-gray-300 rounded-xl font-bold" />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Moeda *</label>
                  <input required list="rate-currencies" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} placeholder="Ex: BRL" className="w-full p-2.5 border border-gray-300 rounded-xl font-bold" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Prazo mínimo (dias)</label>
                  <input type="number" min="0" value={form.estimatedMinDays} onChange={(e) => setForm({ ...form, estimatedMinDays: e.target.value })} className="w-full p-2.5 border border-gray-300 rounded-xl font-bold" />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Prazo máximo (dias)</label>
                  <input type="number" min="0" value={form.estimatedMaxDays} onChange={(e) => setForm({ ...form, estimatedMaxDays: e.target.value })} className="w-full p-2.5 border border-gray-300 rounded-xl font-bold" />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Método/Serviço</label>
                <input type="text" value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.target.value })} placeholder="standard" className="w-full p-2.5 border border-gray-300 rounded-xl font-bold" />
              </div>

              <div className="pt-3 border-t border-gray-100 flex justify-end gap-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border border-gray-300 font-bold text-gray-700 rounded-xl hover:bg-gray-50">
                  Cancelar
                </button>
                <button type="submit" className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-xl shadow-md flex items-center gap-1.5">
                  <Check className="w-4 h-4" /> {editingRate ? 'Salvar Alterações' : 'Cadastrar Tarifa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
