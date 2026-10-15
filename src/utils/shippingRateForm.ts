/**
 * Regras puras do formulário de tarifa (criar/editar) do painel Rotas & Tarifas por Setor. A AUTORIDADE de validação é o backend
 * (validateShippingRouteRateInput): aqui só presença/formato, conversão de datas e mensagens legíveis.
 */

export interface RateFormValues {
  min: string;
  max: string;
  amount: string;
  /** valor de <input type="datetime-local"> (hora local) ou '' = sem limite */
  validFrom: string;
  validUntil: string;
}

export interface RateLike {
  minWeightKg: number | string;
  maxWeightKg: number | string;
  amount: number | string;
  validFrom?: string | null;
  validUntil?: string | null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO do servidor → valor de datetime-local na hora local do navegador ('' se vazio/inválido). */
export function toDatetimeLocal(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local (hora local) → ISO UTC para a API; '' → null (sem limite); inválido → undefined. */
export function fromDatetimeLocal(value: string): string | null | undefined {
  if (!value || !value.trim()) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function emptyRateForm(): RateFormValues {
  return { min: '', max: '', amount: '', validFrom: '', validUntil: '' };
}

export function rateToForm(rate: RateLike): RateFormValues {
  return {
    min: String(Number(rate.minWeightKg)),
    max: String(Number(rate.maxWeightKg)),
    amount: String(Number(rate.amount)),
    validFrom: toDatetimeLocal(rate.validFrom),
    validUntil: toDatetimeLocal(rate.validUntil),
  };
}

/** Checagens mínimas antes de chamar a API (o backend revalida tudo). null = ok. */
export function validateRateForm(v: RateFormValues): string | null {
  if (v.min.trim() === '' || v.max.trim() === '' || v.amount.trim() === '') return 'Preencha peso mínimo, peso máximo e valor.';
  const min = Number(v.min), max = Number(v.max), amount = Number(v.amount);
  if (![min, max, amount].every(Number.isFinite)) return 'Use apenas números nos campos de peso e valor.';
  if (min < 0) return 'O peso mínimo não pode ser negativo.';
  if (max <= min) return 'O peso máximo deve ser maior que o peso mínimo.';
  if (amount < 0) return 'O valor não pode ser negativo.';
  const from = fromDatetimeLocal(v.validFrom), until = fromDatetimeLocal(v.validUntil);
  if (from === undefined || until === undefined) return 'Data de validade inválida.';
  if (from && until && new Date(until).getTime() <= new Date(from).getTime()) return 'O fim da validade deve ser depois do início.';
  return null;
}

/** Corpo enviado à API (só os campos editáveis; rota, serviço e moeda nunca mudam numa edição). */
export function buildRatePayload(v: RateFormValues): { minWeightKg: number; maxWeightKg: number; amount: number; validFrom: string | null; validUntil: string | null } {
  return {
    minWeightKg: Number(v.min),
    maxWeightKg: Number(v.max),
    amount: Number(v.amount),
    validFrom: fromDatetimeLocal(v.validFrom) ?? null,
    validUntil: fromDatetimeLocal(v.validUntil) ?? null,
  };
}

/** Mensagem do backend ("CODIGO: texto") → texto claro para o administrador. */
export function rateErrorMessage(raw: string | null | undefined): string {
  const text = String(raw || '').trim();
  if (!text) return 'Não foi possível salvar a tarifa. Tente novamente.';
  const code = /^([A-Z][A-Z0-9_]{3,}):/.exec(text)?.[1];
  const rest = text.replace(/^[A-Z][A-Z0-9_]{3,}:\s*/, '');
  switch (code) {
    case 'RATE_OVERLAP': {
      const band = /\(([^)]*kg)\)/.exec(rest)?.[1];
      return `Já existe uma tarifa ativa para este serviço nesta rota com faixa de peso sobreposta${band ? ` (${band})` : ''} no mesmo período de validade. Ajuste a faixa de peso ou o período.`;
    }
    case 'MIN_WEIGHT_INVALID': return 'O peso mínimo deve ser um número maior ou igual a 0.';
    case 'MAX_WEIGHT_INVALID': return 'O peso máximo deve ser maior que o peso mínimo (e no máximo 99999 kg).';
    case 'AMOUNT_INVALID': return 'O valor deve ser um número maior ou igual a 0.';
    case 'VALIDITY_INVALID': return 'Período de validade inválido: o fim deve ser depois do início.';
    case 'RATE_IDENTITY_IMMUTABLE': return 'A rota, o serviço e a moeda de uma tarifa não podem ser alterados. Crie uma nova tarifa.';
    case 'CURRENCY_MISMATCH': return 'A moeda da tarifa não corresponde à moeda do país.';
    default: return rest || text;
  }
}

/** Texto curto da vigência para a lista de tarifas. */
export function describeValidity(rate: Pick<RateLike, 'validFrom' | 'validUntil'>, locale = 'pt-PT'): string | null {
  const fmt = (iso: string) => new Date(iso).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
  if (rate.validFrom && rate.validUntil) return `Válida de ${fmt(rate.validFrom)} até ${fmt(rate.validUntil)}`;
  if (rate.validFrom) return `Válida a partir de ${fmt(rate.validFrom)}`;
  if (rate.validUntil) return `Válida até ${fmt(rate.validUntil)}`;
  return null;
}

/** Mensagem de sucesso da edição: diz o que mudou e o que isso NÃO afeta. */
export function describeRateEdit(before: RateLike, after: RateLike, currency: string): string {
  const b = Number(before.amount), a = Number(after.amount);
  const price = b !== a ? `Valor ${b.toFixed(2)} → ${a.toFixed(2)} ${currency}. ` : '';
  return `Tarifa atualizada. ${price}As próximas cotações já usam os novos dados; pedidos já feitos não mudam.`;
}
