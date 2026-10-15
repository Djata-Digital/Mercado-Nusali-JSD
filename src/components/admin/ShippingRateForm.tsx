import React, { useState } from 'react';
import { Check, Loader2, AlertTriangle, Info } from 'lucide-react';
import { RateFormValues, validateRateForm } from '../../utils/shippingRateForm';

/**
 * Formulário de tarifa (peso mínimo/máximo, valor e período de validade) usado para CRIAR e para EDITAR uma tarifa no drawer
 * "Gerenciar Rota". A validação financeira (sobreposição de faixas, moeda, país) é do backend: o erro devolvido aparece aqui.
 * Layout em coluna única no telemóvel; campos com 16px (sem zoom no iOS) e alvos de toque de 44px.
 */
interface ShippingRateFormProps {
  mode: 'create' | 'edit';
  currency: string;
  initial: RateFormValues;
  isSaving: boolean;
  /** devolve a mensagem de erro (para mostrar no formulário) ou null quando salvou */
  onSubmit: (values: RateFormValues) => Promise<string | null>;
  onCancel: () => void;
}

const inputCls = 'w-full min-h-[44px] p-2 border border-gray-300 rounded-lg font-bold text-base sm:text-sm';

export const ShippingRateForm: React.FC<ShippingRateFormProps> = ({ mode, currency, initial, isSaving, onSubmit, onCancel }) => {
  const [values, setValues] = useState<RateFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof RateFormValues) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const local = validateRateForm(values);
    if (local) { setError(local); return; }
    const remote = await onSubmit(values);
    if (remote) setError(remote);
  };

  return (
    <form
      onSubmit={submit}
      data-testid={mode === 'edit' ? 'shipping-rate-edit-form' : 'shipping-rate-create-form'}
      className="p-4 bg-purple-50/50 space-y-3 text-xs border-t border-gray-200"
      noValidate
    >
      <p className="font-black text-gray-800 text-xs">{mode === 'edit' ? 'Editar tarifa' : 'Nova faixa de tarifa'}</p>
      {mode === 'edit' && (
        <p className="flex items-start gap-1.5 text-blue-800 bg-blue-50 border border-blue-200 rounded-lg p-2 font-semibold" data-testid="shipping-rate-edit-note">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>As próximas cotações do checkout usam estes dados. Pedidos já feitos não mudam, e compras em andamento pedirão nova confirmação ao cliente.</span>
        </p>
      )}
      {error && (
        <p role="alert" data-testid="shipping-rate-form-error" className="text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 font-semibold flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> <span>{error}</span>
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label htmlFor="rate-min" className="block font-bold text-gray-700 mb-1">Peso mín. (kg)</label>
          <input id="rate-min" type="number" inputMode="decimal" min="0" step="0.001" value={values.min} onChange={set('min')} className={inputCls} />
        </div>
        <div>
          <label htmlFor="rate-max" className="block font-bold text-gray-700 mb-1">Peso máx. (kg, exclusivo)</label>
          <input id="rate-max" type="number" inputMode="decimal" min="0" step="0.001" value={values.max} onChange={set('max')} className={inputCls} />
        </div>
        <div>
          <label htmlFor="rate-amount" className="block font-bold text-gray-700 mb-1">Valor ({currency || 'moeda do país'})</label>
          <input id="rate-amount" type="number" inputMode="decimal" min="0" step="0.01" value={values.amount} onChange={set('amount')} className={inputCls} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label htmlFor="rate-from" className="block font-bold text-gray-700 mb-1">Válida a partir de <span className="font-medium text-gray-500">(opcional)</span></label>
          <input id="rate-from" type="datetime-local" value={values.validFrom} onChange={set('validFrom')} className={inputCls} />
        </div>
        <div>
          <label htmlFor="rate-until" className="block font-bold text-gray-700 mb-1">Válida até <span className="font-medium text-gray-500">(opcional, exclusivo)</span></label>
          <input id="rate-until" type="datetime-local" value={values.validUntil} onChange={set('validUntil')} className={inputCls} />
        </div>
      </div>
      <p className="text-gray-500">Deixe a validade em branco para uma tarifa sem prazo. A faixa de peso inclui o mínimo e exclui o máximo.</p>
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} disabled={isSaving} className="min-h-[44px] px-4 py-2 border border-gray-300 rounded-lg font-bold text-gray-700 cursor-pointer disabled:opacity-50">Cancelar</button>
        <button type="submit" disabled={isSaving} data-testid="shipping-rate-form-submit" className="min-h-[44px] px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50">
          {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} {mode === 'edit' ? 'Salvar alterações' : 'Salvar'}
        </button>
      </div>
    </form>
  );
};
