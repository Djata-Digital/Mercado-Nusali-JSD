/**
 * Escolha do SERVIÇO DE ENTREGA (Economy/Standard/Express) compartilhada entre página do produto, carrinho e checkout (PURO + sessionStorage).
 *
 * Guardamos SÓ o código do serviço — nunca um preço, prazo ou subsídio. Quem calcula tudo isso é o servidor (POST /shipping/preview-cart, o mesmo
 * motor do carrinho e do checkout); a página do produto apenas soma o valor que o servidor devolveu ao valor do produto para mostrar uma ESTIMATIVA.
 * A escolha é revalidada a cada nova cotação e, de novo, pelo servidor ao criar o pedido (409 SHIPPING_QUOTE_CHANGED se algo mudou).
 */
import type { CartShippingServiceOption } from '../services/shippingService';
import type { ProductDeliveryState } from './productDeliveryState';
import { shippingServiceLabel } from './shippingServiceLabels';

/** Mesma chave que o checkout sempre usou: a escolha feita na página do produto é a que o checkout encontra. */
export const SERVICE_STORAGE_KEY = 'nusali_checkout_shipping_service';

export function readStoredServiceCode(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.sessionStorage.getItem(SERVICE_STORAGE_KEY);
    return raw && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}

export function writeStoredServiceCode(code: string | null): void {
  try {
    if (typeof window === 'undefined') return;
    if (code) window.sessionStorage.setItem(SERVICE_STORAGE_KEY, code);
    else window.sessionStorage.removeItem(SERVICE_STORAGE_KEY);
  } catch {
    /* sem armazenamento: a escolha só vale nesta tela */
  }
}

export interface SelectionOutcome {
  /** código que continua escolhido (null = nenhum) */
  code: string | null;
  /** aviso para a pessoa quando a escolha anterior foi removida */
  notice: string | null;
}

/**
 * Reconcilia a escolha atual com a cotação mais recente da página do produto:
 *  - pronta: a escolha só continua se o serviço AINDA está disponível — nunca é trocada por outro em silêncio;
 *  - destino sem endereço, produto fora do país ou entrega indisponível: a escolha deixa de valer (limpa, com aviso);
 *  - calculando, variação por escolher ou falha de rede: nada se sabe ainda — a escolha é mantida (não vira "grátis" nem some por um soluço).
 */
export function reconcileServiceSelection(current: string | null, state: Pick<ProductDeliveryState, 'status' | 'options'>): SelectionOutcome {
  if (!current) return { code: null, notice: null };
  switch (state.status) {
    case 'ready': {
      const option = state.options.find((o) => o.code === current);
      if (option && option.available) return { code: current, notice: null };
      const label = shippingServiceLabel(current, option?.name).title;
      return { code: null, notice: `O serviço ${label} deixou de estar disponível para esta compra e destino. Escolha outro serviço.` };
    }
    case 'unavailable':
    case 'needs_address':
    case 'idle':
      return { code: null, notice: 'O destino ou as opções da compra mudaram e a escolha do serviço de entrega foi removida. Escolha novamente quando houver opções.' };
    default:
      return { code: current, notice: null };
  }
}

/** A opção escolhida, somente se ainda estiver disponível na cotação. */
export function findSelectedOption(options: CartShippingServiceOption[], code: string | null): CartShippingServiceOption | null {
  if (!code) return null;
  return options.find((o) => o.code === code && o.available) ?? null;
}

/**
 * Total ESTIMADO = valor do produto + frete que o servidor devolveu para o serviço escolhido. Devolve null (nada é mostrado) quando não há serviço
 * escolhido, quando o frete não é um número válido (nunca vira zero/"grátis" por falta de dado) ou quando a moeda do frete difere da do produto.
 */
export function estimateTotalWithShipping(productTotal: number, option: CartShippingServiceOption | null, productCurrency: string): number | null {
  if (!option || !option.available) return null;
  const shipping = option.shippingChargedToBuyer;
  if (typeof shipping !== 'number' || !Number.isFinite(shipping) || shipping < 0) return null;
  if (typeof productTotal !== 'number' || !Number.isFinite(productTotal) || productTotal < 0) return null;
  if (option.currency && productCurrency && option.currency.toUpperCase() !== productCurrency.toUpperCase()) return null;
  return Math.round((productTotal + shipping) * 100) / 100;
}
