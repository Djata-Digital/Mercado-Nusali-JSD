import React from 'react';
import { Loader2, Truck, AlertCircle } from 'lucide-react';
import { shippingServiceLabel, compareShippingServices } from '../utils/shippingServiceLabels';
import { describeServiceOptionPrice } from '../utils/shippingDisplay';
import { leadTimeLine, LEAD_TIME_DISCLAIMER } from '../utils/shippingLeadTime';
import { deliveryHeadline, type ProductDeliveryState } from '../utils/productDeliveryState';

interface Props {
  state: ProductDeliveryState;
  /** formata o valor na moeda do pedido */
  formatAmount: (amount: number) => string;
}

/**
 * Prévia das opções de entrega na página do produto: cada serviço (Economy, Standard, Express) com o preço REAL calculado pelo servidor e o prazo
 * ESTIMADO cadastrado ("Prazo a confirmar" quando não há). Não há seleção aqui: o serviço é escolhido no checkout e o preço é revalidado pelo
 * servidor ao criar o pedido. "GRÁTIS" só aparece quando o servidor confirma custo real > 0 coberto por política (dizendo quem custeia).
 */
export const ProductDeliveryOptions: React.FC<Props> = ({ state, formatAmount }) => {
  if (state.status === 'idle') return null;

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
    return <p className="text-[11px] text-gray-600 bg-gray-100 border border-gray-200 rounded-lg p-2" data-testid="product-delivery-to-calculate"><strong>Frete a calcular.</strong> {state.message || 'Selecione um endereço de entrega para calcular o frete.'}</p>;
  }

  if (state.status === 'to_calculate') {
    return <p className="text-[11px] text-gray-600 bg-gray-100 border border-gray-200 rounded-lg p-2" data-testid="product-delivery-to-calculate"><strong>Frete a calcular.</strong> {state.message}</p>;
  }

  if (state.status === 'unavailable') {
    return (
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
      <ul className="space-y-1.5">
        {options.map((o) => {
          const label = shippingServiceLabel(o.code, o.name);
          const price = describeServiceOptionPrice(o, formatAmount);
          return (
            <li key={o.code} data-testid={`product-delivery-option-${o.code}`} data-available={o.available ? 'true' : 'false'} className={`rounded-lg border p-2 text-xs ${o.available ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50 opacity-70'}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-extrabold text-gray-900">{label.title}</span>
                <span className={`font-black ${price.kind === 'free_by_policy' ? 'text-emerald-700' : 'text-gray-900'}`} data-testid={`product-delivery-price-${o.code}`}>{price.text}</span>
              </div>
              {price.note && <p className="text-[10px] text-emerald-800 font-semibold" data-testid={`product-delivery-payer-${o.code}`}>{price.note}</p>}
              {o.available
                ? <p className="text-[11px] text-gray-600 font-semibold" data-testid={`product-delivery-leadtime-${o.code}`}>{leadTimeLine(o.leadTime)}</p>
                : <p className="text-[10px] text-gray-500" data-testid={`product-delivery-reason-${o.code}`}>{o.unavailableMessage || 'Indisponível para este destino.'}</p>}
            </li>
          );
        })}
      </ul>
      <p className="text-[10px] text-gray-500" data-testid="product-delivery-footer">Você escolhe o serviço de entrega no checkout. {LEAD_TIME_DISCLAIMER}</p>
    </div>
  );
};
