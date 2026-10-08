/**
 * ATRIBUTOS FASE 4 — formatação pura (sem banco, sem rede) usada pelo servidor (ficha técnica) e pelo frontend (rótulos de segurança).
 * Nenhuma função aqui devolve um código interno ("memoria_ram") como se fosse um nome amigável.
 */

export type DisplayValue = string | number | boolean | string[] | null | undefined;

/** Número em pt-BR, até 6 casas, sem zeros à direita; agrupa milhares só a partir de 10.000 (1024 GB, 2024 não viram "1.024"/"2.024"). */
export function formatNumberPtBr(value: number | string): string {
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6, useGrouping: Math.abs(n) >= 10000 }).format(n);
}

/** "128" + "GB" => "128 GB"; "%" e "°" colam no número ("50%"). */
export function withUnit(text: string, unit?: string | null): string {
  const u = (unit ?? '').trim();
  if (!u) return text;
  return /^[%°]/.test(u) ? `${text}${u}` : `${text} ${u}`;
}

/**
 * Texto de exibição de um valor tipado, pelo tipo da definição.
 *  text => o texto; number => pt-BR + unidade; boolean => Sim/Não (false é "Não", nunca vazio); select => a opção;
 *  multiselect => opções separadas por vírgula.
 */
export function formatAttributeDisplay(type: string, value: DisplayValue, unit?: string | null): string {
  if (value === null || value === undefined) return '';
  switch (type) {
    case 'boolean':
      return value === true || value === 'true' || value === 'Sim' ? 'Sim' : 'Não';
    case 'number':
      return withUnit(formatNumberPtBr(value as number | string), unit);
    case 'multiselect':
      return Array.isArray(value) ? value.map(String).join(', ') : String(value);
    case 'select':
    case 'text':
    default:
      return Array.isArray(value) ? value.map(String).join(', ') : String(value);
  }
}

/**
 * Último recurso para uma chave legada SEM definição: "memoria_ram" => "Memoria ram". Chaves que já parecem rótulo (maiúsculas,
 * espaços, acentos) ficam como estão. Nunca devolve o código cru com "_".
 */
export function humanizeAttributeKey(key: unknown): string {
  const raw = String(key ?? '').trim();
  if (!raw) return '';
  if (!/^[a-z0-9]+([_-][a-z0-9]+)*$/.test(raw)) return raw; // já é rótulo
  const spaced = raw.replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Rótulos legados dos campos gerais do produto, na chave normalizada (sem acento/caixa). */
export const GENERAL_LEGACY_KEYS = ['marca', 'modelo', 'condicao', 'peso', 'dimensoes', 'garantia', 'armazem'] as const;

export function conditionLabel(raw: unknown): string {
  const k = String(raw ?? '').trim().toLowerCase();
  if (!k) return '';
  if (k === 'new' || k === 'novo') return 'Novo';
  if (k === 'used' || k === 'usado') return 'Usado';
  if (k === 'refurbished' || k === 'recondicionado') return 'Recondicionado';
  return String(raw).trim();
}
