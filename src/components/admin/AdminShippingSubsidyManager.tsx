import React, { useEffect, useMemo, useState } from 'react';
import { Percent, Loader2, AlertTriangle, CheckCircle2, History, Calculator, ShieldCheck, X } from 'lucide-react';
import { AdminApi } from '../../api/clients/AdminApi';
import { simulateShippingSplit, splitIsExact } from '../../utils/shippingSubsidyMath';
import {
  parsePercentInput, describeConfigStatus, describeChange, isLegacyFreeModeActive, subsidyErrorMessage,
} from '../../utils/shippingSubsidyForm';

/**
 * Gestão de Subsídios de Frete (Super Admin). A Nusali assume uma percentagem (0 a 100, padrão 0%) do valor que restaria ao CLIENTE depois da
 * política do vendedor. O vendedor nunca paga mais por causa disto, e pedidos já criados não são recalculados. A simulação usa a MESMA conta do
 * servidor (shippingSubsidyMath); guardar exige confirmar o impacto financeiro e fica no histórico (quem, quando, antes e depois).
 */
interface Props { showToast: (msg: string) => void }

interface Config { enabled: boolean; percent: number; legacyDefaultMode: string | null; updatedAt: string | null; effective?: { kind: string; description: string } }
interface HistoryItem { id: string; createdAt: string; user: { name: string | null; email: string | null }; before: any; after: any; legacyModeChanged: boolean; note: string | null }

const PRESETS = [0, 20, 50, 75, 100];
const fmtMoney = (n: number) => `${n.toLocaleString('pt-PT', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} XOF`;

export const AdminShippingSubsidyManager: React.FC<Props> = ({ showToast }) => {
  const [config, setConfig] = useState<Config | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [percentText, setPercentText] = useState('0');
  const [disableLegacy, setDisableLegacy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [simCost, setSimCost] = useState('1000');
  const [simSeller, setSimSeller] = useState('50');

  const [confirming, setConfirming] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [c, h] = await Promise.all([AdminApi.getShippingSubsidy(), AdminApi.getShippingSubsidyHistory(50)]);
      if (!c.success || !c.data) { setLoadError(subsidyErrorMessage((c as any).error?.code, (c as any).error?.message || c.message)); return; }
      setConfig(c.data);
      setEnabled(!!c.data.enabled);
      setPercentText(String(c.data.percent ?? 0));
      setDisableLegacy(false);
      setHistory(h.success && Array.isArray(h.data) ? (h.data as any) : []);
    } catch (e: any) {
      setLoadError(subsidyErrorMessage(e?.response?.data?.error?.code, e?.response?.data?.error?.message || e?.message));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const parsed = parsePercentInput(percentText);
  const draftPercent = parsed.ok ? parsed.value : 0;
  const effectiveDraftPercent = enabled ? draftPercent : 0;
  const legacyActive = !!config && isLegacyFreeModeActive(config);
  const dirty = !!config && (enabled !== config.enabled || (parsed.ok && draftPercent !== config.percent) || disableLegacy);

  const sim = useMemo(() => {
    const cost = Number(String(simCost).replace(',', '.'));
    const seller = Number(String(simSeller).replace(',', '.'));
    if (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(seller) || seller < 0 || seller > 100) return null;
    return simulateShippingSplit(cost, seller, effectiveDraftPercent);
  }, [simCost, simSeller, effectiveDraftPercent]);

  const openConfirm = () => {
    setFormError(null);
    if (!parsed.ok) { setFormError(parsed.error); return; }
    setUnderstood(false);
    setConfirming(true);
  };

  const save = async () => {
    if (!config || !parsed.ok) return;
    setSaving(true);
    try {
      const res = await AdminApi.updateShippingSubsidy({
        enabled, percent: parsed.value, confirmImpact: true, disableLegacyFreeMode: disableLegacy,
        expected: { enabled: config.enabled, percent: config.percent },
      });
      if (!res.success) {
        const err: any = (res as any).error;
        setFormError(subsidyErrorMessage(err?.code, err?.message || res.message));
        setConfirming(false);
        if (err?.code === 'CONFIG_CHANGED') await load();
        return;
      }
      showToast('Subsídio de frete atualizado. Pedidos já criados não foram recalculados.');
      setConfirming(false);
      await load();
    } catch (e: any) {
      const err = e?.response?.data?.error;
      setFormError(subsidyErrorMessage(err?.code, err?.message || e?.message));
      setConfirming(false);
      if (err?.code === 'CONFIG_CHANGED') await load();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-gray-400"><Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" aria-hidden="true" />Carregando...</div>;
  }
  if (loadError || !config) {
    return (
      <div role="alert" className="p-6 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700 font-semibold flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" /> {loadError || 'Não foi possível carregar a configuração.'}
      </div>
    );
  }

  const before = { enabled: config.enabled, percent: config.percent };
  const afterCfg = { enabled, percent: draftPercent };

  return (
    <div className="space-y-6" data-testid="shipping-subsidy-manager">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0"><Percent className="w-5 h-5" aria-hidden="true" /></div>
        <div>
          <h2 className="text-xl font-black text-gray-900">Gestão de Subsídios de Frete</h2>
          <p className="text-xs text-gray-500 mt-0.5 max-w-2xl">
            A Nusali assume uma percentagem do valor que restaria ao <strong>cliente</strong> depois da política do vendedor. O vendedor nunca paga mais por causa deste subsídio.
          </p>
        </div>
      </div>

      {/* Configuração atual */}
      <section className="border border-gray-200 rounded-2xl p-4 sm:p-5 space-y-3" aria-labelledby="sub-current">
        <h3 id="sub-current" className="font-extrabold text-sm text-gray-900">Configuração atual</h3>
        <div className="flex flex-wrap items-center gap-3">
          <span data-testid="subsidy-status" className={`px-3 py-1 rounded-full text-xs font-black ${config.enabled && config.percent > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'}`}>
            {describeConfigStatus(config)}
          </span>
          <span className="text-[11px] text-gray-500">{config.updatedAt ? `Última alteração: ${new Date(config.updatedAt).toLocaleString('pt-PT')}` : 'Nunca configurado (padrão 0%).'}</span>
        </div>
        <p className="text-xs text-gray-700" data-testid="subsidy-effective">{config.effective?.description}</p>
        {legacyActive && (
          <p role="alert" data-testid="subsidy-legacy-warning" className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3 font-semibold flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Está ativo o modo legado <strong>MARKETPLACE_FREE_SHIPPING</strong>: a Nusali assume 100% do frete de todas as lojas sem política própria, e a percentagem abaixo é ignorada
              para essas lojas. Para usar o subsídio percentual (padrão 0%), marque "Desativar o modo legado" ao guardar.
            </span>
          </p>
        )}
      </section>

      {/* Alterar */}
      <section className="border border-gray-200 rounded-2xl p-4 sm:p-5 space-y-4" aria-labelledby="sub-edit">
        <h3 id="sub-edit" className="font-extrabold text-sm text-gray-900">Alterar subsídio da Nusali</h3>

        <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="w-5 h-5 accent-purple-600" data-testid="subsidy-enabled" />
          <span className="text-sm font-bold text-gray-800">Ativar o subsídio de frete da Nusali</span>
        </label>

        <div>
          <label htmlFor="subsidy-percent" className="block text-xs font-bold text-gray-700 mb-1">Percentagem que a Nusali assume (0 a 100%)</label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="subsidy-percent" type="text" inputMode="decimal" value={percentText} onChange={(e) => setPercentText(e.target.value)} data-testid="subsidy-percent"
              className={`w-32 min-h-[44px] p-2 border rounded-lg font-black text-base ${parsed.ok ? 'border-gray-300' : 'border-red-400'}`} aria-invalid={!parsed.ok}
            />
            <span className="text-sm font-bold text-gray-500">%</span>
            {PRESETS.map((p) => (
              <button key={p} type="button" onClick={() => setPercentText(String(p))} className="min-h-[44px] px-3 border border-gray-300 rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 cursor-pointer">{p}%</button>
            ))}
          </div>
          {!parsed.ok && <p className="text-[11px] text-red-700 font-semibold mt-1" role="alert">{parsed.error}</p>}
          <p className="text-[11px] text-gray-500 mt-1">Aceita decimais (até 2 casas). 0% significa que a Nusali não subsidia nada.</p>
        </div>

        {legacyActive && (
          <label className="flex items-start gap-3 cursor-pointer" data-testid="subsidy-disable-legacy-row">
            <input type="checkbox" checked={disableLegacy} onChange={(e) => setDisableLegacy(e.target.checked)} className="w-5 h-5 accent-purple-600 mt-0.5" data-testid="subsidy-disable-legacy" />
            <span className="text-xs text-gray-800 font-semibold">Desativar o modo legado (a Nusali deixa de assumir 100% do frete; o cliente passa a pagar o saldo menos a percentagem acima).</span>
          </label>
        )}

        {formError && <p role="alert" data-testid="subsidy-form-error" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5 font-semibold flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" /> {formError}</p>}

        <button type="button" onClick={openConfirm} disabled={!dirty || !parsed.ok} data-testid="subsidy-save"
          className="min-h-[44px] px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold rounded-xl text-sm cursor-pointer">
          Guardar alterações
        </button>
      </section>

      {/* Simulação */}
      <section className="border border-gray-200 rounded-2xl p-4 sm:p-5 space-y-3" aria-labelledby="sub-sim">
        <h3 id="sub-sim" className="font-extrabold text-sm text-gray-900 flex items-center gap-1.5"><Calculator className="w-4 h-4 text-purple-600" aria-hidden="true" /> Simulação da divisão do frete</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="sim-cost" className="block text-xs font-bold text-gray-700 mb-1">Custo real do frete (XOF)</label>
            <input id="sim-cost" type="text" inputMode="decimal" value={simCost} onChange={(e) => setSimCost(e.target.value)} className="w-full min-h-[44px] p-2 border border-gray-300 rounded-lg font-bold text-base" data-testid="sim-cost" />
          </div>
          <div>
            <label htmlFor="sim-seller" className="block text-xs font-bold text-gray-700 mb-1">Parte que o vendedor assume (%)</label>
            <input id="sim-seller" type="text" inputMode="decimal" value={simSeller} onChange={(e) => setSimSeller(e.target.value)} className="w-full min-h-[44px] p-2 border border-gray-300 rounded-lg font-bold text-base" data-testid="sim-seller" />
          </div>
        </div>
        {sim ? (
          <div data-testid="sim-result">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3"><p className="text-[10px] font-bold text-amber-800 uppercase">Vendedor</p><p className="font-black text-gray-900 text-sm sm:text-base" data-testid="sim-seller-amount">{fmtMoney(sim.seller)}</p></div>
              <div className="rounded-xl bg-purple-50 border border-purple-200 p-3"><p className="text-[10px] font-bold text-purple-800 uppercase">Nusali</p><p className="font-black text-gray-900 text-sm sm:text-base" data-testid="sim-nusali-amount">{fmtMoney(sim.nusali)}</p></div>
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3"><p className="text-[10px] font-bold text-emerald-800 uppercase">Cliente</p><p className="font-black text-gray-900 text-sm sm:text-base" data-testid="sim-buyer-amount">{fmtMoney(sim.buyer)}</p></div>
            </div>
            <p className="text-[11px] text-gray-500 mt-2 flex items-center gap-1" data-testid="sim-check">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
              {splitIsExact(sim) ? `Soma exata: ${fmtMoney(sim.seller + sim.nusali + sim.buyer)} = custo real ${fmtMoney(sim.cost)}.` : 'A soma não fecha — não guarde.'}
              {' '}A Nusali assume {effectiveDraftPercent}% do saldo do cliente (o que sobra depois do vendedor).
            </p>
          </div>
        ) : <p className="text-xs text-red-700 font-semibold">Informe um custo válido e uma percentagem do vendedor entre 0 e 100.</p>}
      </section>

      {/* Histórico */}
      <section className="border border-gray-200 rounded-2xl p-4 sm:p-5 space-y-3" aria-labelledby="sub-hist">
        <h3 id="sub-hist" className="font-extrabold text-sm text-gray-900 flex items-center gap-1.5"><History className="w-4 h-4 text-purple-600" aria-hidden="true" /> Histórico de alterações</h3>
        {history.length === 0 ? (
          <p className="text-xs text-gray-500" data-testid="subsidy-history-empty">Ainda não há alterações registadas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[520px]" data-testid="subsidy-history">
              <thead><tr className="text-left text-gray-500 border-b border-gray-200"><th className="py-2 pr-3">Data</th><th className="py-2 pr-3">Utilizador</th><th className="py-2">Valor anterior → novo valor</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="py-2 pr-3 whitespace-nowrap text-gray-700">{new Date(h.createdAt).toLocaleString('pt-PT')}</td>
                    <td className="py-2 pr-3 text-gray-800 font-semibold">{h.user.name || h.user.email || (h.note ? 'Script administrativo' : '—')}</td>
                    <td className="py-2 font-semibold text-gray-900">{describeChange(h.before, h.after, h.legacyModeChanged)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Confirmação do impacto financeiro */}
      {confirming && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="sub-confirm-title" data-testid="subsidy-confirm">
          <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <h3 id="sub-confirm-title" className="font-black text-base text-gray-900 flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-purple-600" aria-hidden="true" /> Confirmar impacto financeiro</h3>
              <button type="button" onClick={() => setConfirming(false)} className="p-2 text-gray-400 hover:text-gray-600 cursor-pointer" aria-label="Fechar"><X className="w-5 h-5" /></button>
            </div>
            <div className="text-xs text-gray-800 space-y-2">
              <p><strong>Antes:</strong> {describeConfigStatus(before)}</p>
              <p><strong>Depois:</strong> {describeConfigStatus(afterCfg)}{disableLegacy ? ' · modo legado (Nusali assume 100%) será desativado' : ''}</p>
              {sim && <p className="bg-gray-50 border border-gray-200 rounded-lg p-2">Exemplo: frete de {fmtMoney(sim.cost)}, vendedor assume {simSeller}% → vendedor {fmtMoney(sim.seller)}, Nusali {fmtMoney(sim.nusali)}, cliente {fmtMoney(sim.buyer)}.</p>}
              <ul className="list-disc pl-5 space-y-1 text-gray-700">
                <li>Vale para as <strong>novas cotações e pedidos</strong>. Pedidos já criados não são recalculados.</li>
                <li>O custo do subsídio passa a ser da Nusali; o vendedor nunca paga mais por causa dele.</li>
                {disableLegacy && <li>Lojas sem política própria deixam de ter frete grátis pago pela Nusali: o cliente paga o saldo.</li>}
              </ul>
            </div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="w-5 h-5 accent-purple-600 mt-0.5" data-testid="subsidy-understood" />
              <span className="text-xs font-bold text-gray-800">Entendo o impacto financeiro desta alteração.</span>
            </label>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button type="button" onClick={() => setConfirming(false)} disabled={saving} className="min-h-[44px] px-4 py-2 border border-gray-300 rounded-xl font-bold text-gray-700 cursor-pointer disabled:opacity-50">Cancelar</button>
              <button type="button" onClick={save} disabled={!understood || saving} data-testid="subsidy-confirm-save"
                className="min-h-[44px] px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white font-extrabold rounded-xl flex items-center justify-center gap-2 cursor-pointer">
                {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />} Confirmar e guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
