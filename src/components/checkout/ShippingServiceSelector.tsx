import React from 'react';
import { Truck, Loader2, AlertCircle } from 'lucide-react';
import { shippingServiceLabel } from '../../utils/shippingServiceLabels';
import type { CartShippingServiceOption } from '../../services/shippingService';

interface Props {
  options: CartShippingServiceOption[];
  selectedCode: string | null;
  onSelect: (code: string) => void;
  loading: boolean;
  /** mensagem quando NENHUM serviço está disponível (motivo real, nunca preço) */
  unavailableMessage?: string | null;
  /** aviso de que a escolha anterior deixou de valer (ex.: serviço indisponível após trocar o endereço) */
  notice?: string | null;
  /** formata o valor na moeda do pedido (XOF) */
  formatAmount: (amount: number) => string;
}

/**
 * Escolha do serviço de entrega (Economy / Standard / Express): cada opção mostra o preço REAL calculado pelo servidor ou o motivo de não
 * estar disponível. Sem prazos (não existem no cadastro de tarifas) e sem serviço pré-selecionado: a pessoa escolhe antes de confirmar.
 */
export const ShippingServiceSelector: React.FC<Props> = ({ options, selectedCode, onSelect, loading, unavailableMessage, notice, formatAmount }) => {
  const anyAvailable = options.some((o) => o.available);
  return (
    <fieldset data-testid="shipping-service-selector" className="space-y-3" aria-busy={loading}>
      <legend className="sr-only">Serviço de entrega</legend>
      {notice && (
        <p role="status" data-testid="shipping-service-notice" className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 font-semibold">
          {notice}
        </p>
      )}
      {loading && (
        <p className="text-xs text-gray-500 flex items-center gap-2" data-testid="shipping-service-loading">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Calculando as opções de entrega...
        </p>
      )}
      {!loading && options.length === 0 && (
        <p role="alert" data-testid="shipping-service-empty" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5 font-semibold flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" /> {unavailableMessage || 'Nenhum serviço de entrega disponível para este destino.'}
        </p>
      )}
      {!loading && options.length > 0 && (
        <div role="radiogroup" aria-label="Serviço de entrega" className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {options.map((o) => {
            const label = shippingServiceLabel(o.code, o.name);
            const checked = o.available && selectedCode === o.code;
            const id = `shipping-service-${o.code}`;
            const free = o.available && (o.shippingChargedToBuyer ?? 0) === 0;
            const priceText = !o.available
              ? 'Indisponível'
              : free
              ? ((o.shippingCost ?? 0) > 0 ? 'GRÁTIS' : 'Sem custo de frete')
              : formatAmount(o.shippingChargedToBuyer ?? 0);
            return (
              <label
                key={o.code}
                htmlFor={id}
                data-testid={`shipping-service-option-${o.code}`}
                data-available={o.available ? 'true' : 'false'}
                className={`relative flex flex-col gap-1 rounded-xl border p-3 text-left min-h-[76px] transition ${
                  !o.available ? 'border-gray-200 bg-gray-50 opacity-70 cursor-not-allowed'
                  : checked ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-500 cursor-pointer'
                  : 'border-gray-300 bg-white hover:border-emerald-400 cursor-pointer'
                }`}
              >
                <input
                  id={id}
                  type="radio"
                  name="shipping-service"
                  value={o.code}
                  checked={checked}
                  disabled={!o.available}
                  onChange={() => o.available && onSelect(o.code)}
                  className="sr-only"
                  aria-describedby={`${id}-desc`}
                />
                <span className="flex items-center gap-1.5 text-sm font-extrabold text-gray-900">
                  <Truck className="w-4 h-4 text-emerald-700" aria-hidden="true" /> {label.title}
                </span>
                {label.subtitle && <span className="text-[11px] text-gray-600 font-medium">{label.subtitle}</span>}
                <span id={`${id}-desc`} className={`text-sm font-black ${!o.available ? 'text-gray-500' : free ? 'text-emerald-700' : 'text-gray-900'}`} data-testid={`shipping-service-price-${o.code}`}>
                  {priceText}
                </span>
                {!o.available && o.unavailableMessage && (
                  <span className="text-[10px] text-gray-500 font-medium leading-snug" data-testid={`shipping-service-reason-${o.code}`}>{o.unavailableMessage}</span>
                )}
              </label>
            );
          })}
        </div>
      )}
      {!loading && options.length > 0 && !anyAvailable && (
        <p role="alert" data-testid="shipping-service-none-available" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5 font-semibold">
          {unavailableMessage || 'Nenhum serviço de entrega está disponível para este carrinho e destino.'}
        </p>
      )}
      {!loading && anyAvailable && !selectedCode && (
        <p className="text-[11px] text-gray-600 font-semibold" data-testid="shipping-service-choose-hint">Escolha o serviço de entrega para continuar.</p>
      )}
    </fieldset>
  );
};

export default ShippingServiceSelector;
