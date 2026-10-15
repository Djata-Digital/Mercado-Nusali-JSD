/**
 * Apresentação dos serviços de entrega (frontend e backend): ordem fixa e rótulo curto. Não inventa prazos: só a natureza do serviço
 * (económica / padrão / expressa); qualquer outro serviço cadastrado aparece com o próprio nome e sem descrição.
 */
export const SHIPPING_SERVICE_ORDER = ['ECONOMY', 'STANDARD', 'EXPRESS'] as const;

export interface ShippingServiceLabel { title: string; subtitle: string | null }

const KNOWN: Record<string, ShippingServiceLabel> = {
  ECONOMY: { title: 'Economy', subtitle: 'Entrega económica' },
  STANDARD: { title: 'Standard', subtitle: 'Entrega padrão' },
  EXPRESS: { title: 'Express', subtitle: 'Entrega expressa' },
};

export function shippingServiceLabel(code: string, fallbackName?: string | null): ShippingServiceLabel {
  const key = String(code || '').trim().toUpperCase();
  return KNOWN[key] ?? { title: (fallbackName || key || 'Serviço').trim(), subtitle: null };
}

/** Economy, Standard, Express; depois os demais por código. */
export function compareShippingServices(a: { code: string }, b: { code: string }): number {
  const ia = (SHIPPING_SERVICE_ORDER as readonly string[]).indexOf(String(a.code).toUpperCase());
  const ib = (SHIPPING_SERVICE_ORDER as readonly string[]).indexOf(String(b.code).toUpperCase());
  if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  return String(a.code) < String(b.code) ? -1 : String(a.code) > String(b.code) ? 1 : 0;
}
