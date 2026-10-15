import React, { useState } from 'react';
import { Clock, Pencil, Trash2, Check, Loader2, AlertTriangle } from 'lucide-react';
import { describeLeadTime, validateLeadTimeForm, LEAD_TIME_UNCONFIRMED } from '../../utils/shippingLeadTime';

/**
 * Prazo ESTIMADO de entrega (dias, mínimo e máximo) de UM serviço nesta rota — configurado à parte das faixas de peso. Estimativa, não
 * garantia: sem configuração o checkout mostra "Prazo a confirmar". Não afeta preço, pagamento, Escrow nem reembolso, e pedidos já feitos
 * guardam o prazo que foi mostrado. Coluna única no telemóvel; campos de 16px e alvos de toque de 44px.
 */
interface Props {
  serviceName: string;
  current: { minDays: number; maxDays: number } | null;
  isBusy: boolean;
  /** devolve a mensagem de erro (mostrada no formulário) ou null quando salvou */
  onSave: (minDays: number, maxDays: number) => Promise<string | null>;
  onRemove: () => Promise<string | null>;
}

const inputCls = 'w-full min-h-[44px] p-2 border border-gray-300 rounded-lg font-bold text-base sm:text-sm';

export const ShippingLeadTimeEditor: React.FC<Props> = ({ serviceName, current, isBusy, onSave, onRemove }) => {
  const idPart = serviceName.replace(/[^A-Za-z0-9]+/g, '-');
  const [editing, setEditing] = useState(false);
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [error, setError] = useState<string | null>(null);

  const open = () => {
    setMin(current ? String(current.minDays) : '');
    setMax(current ? String(current.maxDays) : '');
    setError(null);
    setEditing(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const local = validateLeadTimeForm(min, max);
    if (local) { setError(local); return; }
    const remote = await onSave(Number(min), Number(max));
    if (remote) setError(remote); else setEditing(false);
  };

  const remove = async () => {
    setError(null);
    const remote = await onRemove();
    if (remote) setError(remote); else setEditing(false);
  };

  return (
    <div className="px-4 py-3 border-b border-gray-100 bg-white text-xs" data-testid="shipping-lead-time-editor">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="min-w-0">
          <span className="flex items-center gap-1.5 font-bold text-gray-700"><Clock className="w-3.5 h-3.5 text-purple-600" aria-hidden="true" /> Prazo estimado de entrega</span>
          <span className={`block mt-0.5 font-black ${current ? 'text-gray-900' : 'text-gray-500'}`} data-testid="shipping-lead-time-current">
            {current ? describeLeadTime(current) : LEAD_TIME_UNCONFIRMED}
          </span>
        </div>
        {!editing && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={open}
              disabled={isBusy}
              data-testid="shipping-lead-time-edit"
              aria-label={`${current ? 'Editar' : 'Configurar'} prazo estimado do serviço ${serviceName}`}
              className="min-h-[44px] sm:min-h-0 px-3 py-2 sm:py-1 flex items-center justify-center gap-1 text-purple-600 hover:text-purple-800 font-bold cursor-pointer disabled:opacity-50"
            >
              <Pencil className="w-3.5 h-3.5" aria-hidden="true" /> {current ? 'Editar prazo' : 'Configurar prazo'}
            </button>
            {current && (
              <button
                type="button"
                onClick={remove}
                disabled={isBusy}
                data-testid="shipping-lead-time-remove"
                aria-label={`Remover prazo estimado do serviço ${serviceName}`}
                className="min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 p-2 sm:p-1 flex items-center justify-center text-gray-500 hover:text-red-700 cursor-pointer disabled:opacity-50"
                title="Remover prazo (voltará a 'Prazo a confirmar')"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>

      {error && !editing && (
        <p role="alert" className="mt-2 text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 font-semibold flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" /> <span>{error}</span>
        </p>
      )}

      {editing && (
        <form onSubmit={submit} noValidate data-testid="shipping-lead-time-form" className="mt-3 space-y-2.5 bg-purple-50/50 border border-gray-200 rounded-xl p-3">
          {error && (
            <p role="alert" data-testid="shipping-lead-time-error" className="text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 font-semibold flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" /> <span>{error}</span>
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label htmlFor={`lt-min-${idPart}`} className="block font-bold text-gray-700 mb-1">Prazo mínimo (dias)</label>
              <input id={`lt-min-${idPart}`} type="number" inputMode="numeric" min="1" max="365" step="1" value={min} onChange={(e) => setMin(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor={`lt-max-${idPart}`} className="block font-bold text-gray-700 mb-1">Prazo máximo (dias)</label>
              <input id={`lt-max-${idPart}`} type="number" inputMode="numeric" min="1" max="365" step="1" value={max} onChange={(e) => setMax(e.target.value)} className={inputCls} />
            </div>
          </div>
          <p className="text-gray-500">Estimativa mostrada ao cliente no checkout, não uma garantia. Não altera preços nem pedidos já feitos.</p>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} disabled={isBusy} className="min-h-[44px] px-4 py-2 border border-gray-300 rounded-lg font-bold text-gray-700 cursor-pointer disabled:opacity-50">Cancelar</button>
            <button type="submit" disabled={isBusy} data-testid="shipping-lead-time-submit" className="min-h-[44px] px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50">
              {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Check className="w-3.5 h-3.5" aria-hidden="true" />} Salvar prazo
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
