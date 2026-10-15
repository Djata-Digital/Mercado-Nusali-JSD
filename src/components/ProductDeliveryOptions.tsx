import React from 'react';
import { Loader2, Truck, AlertCircle, Check } from 'lucide-react';
import { shippingServiceLabel, compareShippingServices } from '../utils/shippingServiceLabels';
import { describeServiceOptionPrice } from '../utils/shippingDisplay';
import { leadTimeLine, LEAD_TIME_DISCLAIMER } from '../utils/shippingLeadTime';
import { deliveryHeadline, type ProductDeliveryState } from '../utils/productDeliveryState';

interface Props {
  state: ProductDeliveryState;
  /** formata o valor na moeda do pedido */
  formatAmount: (amount: number) => string;
  /** serviço escolhido (código). Só existe quando a página permite escolher; nunca é um preço. */
  selectedCode?: string | null;
  /** quando informado, as opções viram uma escolha (radio); sem ele a lista é só informativa */
  onSelect?: (code: string) => void;
  /** aviso de que a escolha anterior deixou de valer (destino/variação/quantidade mudaram) */
  notice?: string | null;
  /** produto + frete do serviço escolhido, já formatado; null = não há estimativa (nada é inventado) */
  estimatedTotalText?: string | null;
}

/**
 * Opções de entrega na página do produto: cada serviço (Economy, Standard, Express) com o preço REAL calculado pelo servidor e o prazo ESTIMADO
 * cadastrado ("Prazo a confirmar" quando não há). Com `onSelect` a pessoa ESCOLHE o serviço aqui (a escolha — só o código — segue para o carrinho e o
 * checkout, onde pode ser trocada); o preço é sempre revalidado pelo servidor ao criar o pedido. Sem `onSelect` a lista é apenas informativa.
 * "GRÁTIS" só aparece quando o servidor confirma custo real > 0 coberto por política (dizendo quem custeia).
 */
export const ProductDeliveryOptions: React.FC<Props> = ({ state, formatAmount, selectedCode = null, onSelect, notice = null, estimatedTotalText = null }) => {
  const selectable = typeof onSelect === 'function';
  const noticeEl = selectable && notice
    ? <p role="status" data-testid="product-delivery-notice" className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 font-semibold">{notice}</p>
    : null;
  // a escolha removida (endereço/destino mudou, entrega indisponível) precisa ser dita também quando não há opções para mostrar
  const withNotice = (node: React.ReactElement) => (noticeEl ? <div className="space-y-2">{noticeEl}{node}</div> : node);

  if (state.status === 'idle') return noticeEl;

  if (state.status === 'loading') {
    return (
      <p className="text-xs text-gray-500 flex items-center gap-1.5" data-testid="product-delivery-loading">
        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> Calculando entrega...
      </p>
    );
  }

  if (state.status === 'needs_variant') {
    return <p className="text-[11px] text-gray-600" data-testid="product-delivery-to-calculate"><strong>Frete a calcular.</strong> Selecione as opções do produto para ver as opções de entrega.</p>;
  }

  if (state.status === 'needs_address') {
    return withNotice(<p className="text-[11px] text-gray-600 bg-gray-100 border border-gray-200 rounded-lg p-2" data-testid="product-delivery-to-calculate"><strong>Frete a calcular.</strong> {state.message || 'Selecione um endereço de entrega para calcular o frete.'}</p>);
  }

  if (state.status === 'to_calculate') {
    return withNotice(<p className="text-[11px] text-gray-600 bg-gray-100 border border-gray-200 rounded-lg p-2" data-testid="product-delivery-to-calculate"><strong>Frete a calcular.</strong> {state.message}</p>);
  }

  if (state.status === 'unavailable') {
    return withNotice(
      <p role="alert" className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 flex items-start gap-1.5" data-testid="product-delivery-unavailable">
        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
        <span><strong>{deliveryHeadline(state)}.</strong> {state.message || 'Não há entrega disponível para este destino no momento.'}</span>
      </p>
    );
  }

  const options = [...state.options].sort(compareShippingServices);
  return (
    <div className="space-y-2" data-testid="product-delivery-options">
      <p className="text-xs font-bold text-gray-900 flex items-center gap-1.5"><Truck className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" /> {deliveryHeadline(state)}</p>
      {noticeEl}
      <ul className="space-y-1.5" role={selectable ? 'radiogroup' : undefined} aria-label={selectable ? 'Serviço de entrega' : undefined}>
        {options.map((o) => {
          const label = shippingServiceLabel(o.code, o.name);
          const price = describeServiceOptionPrice(o, formatAmount);
          const checked = selectable && o.available && selectedCode === o.code;
          const id = `product-delivery-radio-${o.code}`;
          const frame = !o.available ? 'border-gray-200 bg-gray-50 opacity-70'
            : checked ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-500'
            : selectable ? 'border-gray-300 bg-white hover:border-emerald-400' : 'border-gray-200 bg-white';
          const body = (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-extrabold text-gray-900 flex items-center gap-1.5">
                  {selectable && o.available && (
                    <span aria-hidden="true" data-testid={`product-delivery-mark-${o.code}`} className={`inline-flex items-center justify-center w-4 h-4 rounded-full border-2 shrink-0 ${checked ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-gray-400 bg-white'}`}>{checked && <Check className="w-2.5 h-2.5" />}</span>
                  )}
                  {label.title}
                  {checked && <span className="text-[10px] font-black text-emerald-800 bg-emerald-100 rounded-full px-1.5 py-0.5" data-testid={`product-delivery-selected-${o.code}`}>Selecionado</span>}
                </span>
                <span className={`font-black ${price.kind === 'free_by_policy' ? 'text-emerald-700' : 'text-gray-900'}`} data-testid={`product-delivery-price-${o.code}`}>{price.text}</span>
              </div>
              {price.note && <p className="text-[10px] text-emerald-800 font-semibold" data-testid={`product-delivery-payer-${o.code}`}>{price.note}</p>}
              {o.available
                ? <p className="text-[11px] text-gray-600 font-semibold" data-testid={`product-delivery-leadtime-${o.code}`}>{leadTimeLine(o.leadTime)}</p>
                : <p className="text-[10px] text-gray-500" data-testid={`product-delivery-reason-${o.code}`}>{o.unavailableMessage || 'Indisponível para este destino.'}</p>}
            </>
          );
          return (
            <li key={o.code} data-testid={`product-delivery-option-${o.code}`} data-available={o.available ? 'true' : 'false'} data-selected={checked ? 'true' : 'false'} className={`rounded-lg border text-xs transition ${frame}`}>
              {selectable && o.available ? (
                <label htmlFor={id} className="block p-2 cursor-pointer min-h-[44px] rounded-lg focus-within:ring-2 focus-within:ring-emerald-500">
                  <input id={id} type="radio" name="product-delivery-service" value={o.code} checked={checked} onChange={() => onSelect!(o.code)} className="sr-only" />
                  {body}
                </label>
              ) : (
                <div className="p-2">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      {selectable && !selectedCode && (
        <p className="text-[11px] text-gray-600 font-semibold" data-testid="product-delivery-choose-hint">Escolha o serviço de entrega para ver o total estimado. Você pode alterá-lo no carrinho e no checkout.</p>
      )}
      {selectable && selectedCode && estimatedTotalText && (
        <p className="text-xs text-gray-900 font-extrabold bg-emerald-50 border border-emerald-200 rounded-lg p-2" data-testid="product-delivery-estimated-total">
          Total estimado (produto + entrega): {estimatedTotalText}
        </p>
      )}
      <p className="text-[10px] text-gray-500" data-testid="product-delivery-footer">
        {selectable ? 'O preço, o prazo e os subsídios são confirmados pelo servidor antes do pedido.' : 'Você escolhe o serviço de entrega no checkout.'} {LEAD_TIME_DISCLAIMER}
      </p>
    </div>
  );
};
