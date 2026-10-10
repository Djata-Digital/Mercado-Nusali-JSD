/**
 * Dados fiscais da "Minha Conta de Vendedor" (documento fiscal, cidade, endereço fiscal) — regras PURAS, usadas pela tela e pelo servidor.
 * O documento fiscal segue as mesmas regras por país do KYC (utils/sellerKycRules), para um fluxo nunca aceitar o que o outro recusa.
 */
import { kycCountryRules, type KycAccountType } from './sellerKycRules';

export type FiscalField = 'taxId' | 'city' | 'address';

export interface FiscalInput {
  taxId?: unknown;
  city?: unknown;
  address?: unknown;
}

export interface FiscalPatch {
  taxId?: string;
  city?: string;
  address?: string;
}

export interface FiscalProblem {
  field: FiscalField;
  message: string;
}

export const FISCAL_LIMITS = { cityMin: 2, cityMax: 120, addressMin: 5, addressMax: 300 } as const;

/** Tira espaços das pontas e junta espaços repetidos (o documento fiscal fica sem espaços nas pontas, sem alterar o miolo). */
const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

/**
 * Só entram no resultado os campos ENVIADOS como texto (atualização parcial: o que não veio não é tocado).
 * Valores que não são texto são ignorados aqui e recusados por validateFiscalPatch.
 */
export function pickFiscalPatch(input: FiscalInput | null | undefined): FiscalPatch {
  const out: FiscalPatch = {};
  if (!input) return out;
  if (typeof input.taxId === 'string') out.taxId = clean(input.taxId);
  if (typeof input.city === 'string') out.city = clean(input.city);
  if (typeof input.address === 'string') out.address = clean(input.address);
  return out;
}

export interface FiscalContext {
  country: string | null | undefined;
  /** tipo de conta do KYC, se já escolhido (PF x empresa muda a regra de CPF/CNPJ no Brasil) */
  accountType?: KycAccountType | null;
  /** valores JÁ guardados: o que não mudou não é revalidado (dados antigos nunca impedem salvar outro campo) */
  current?: FiscalPatch;
}

/** Problemas por campo (vazio = pode gravar). Só avalia os campos presentes em `patch` e que MUDARAM em relação ao guardado. */
export function validateFiscalPatch(patch: FiscalPatch, input: FiscalInput, ctx: FiscalContext): FiscalProblem[] {
  const problems: FiscalProblem[] = [];
  const cur = ctx.current ?? {};
  const wrongType = (k: FiscalField) => k in (input ?? {}) && (input as any)[k] !== undefined && (input as any)[k] !== null && typeof (input as any)[k] !== 'string';
  for (const k of ['taxId', 'city', 'address'] as FiscalField[]) {
    if (wrongType(k)) problems.push({ field: k, message: 'Valor inválido: envie texto.' });
  }

  if (patch.taxId !== undefined && patch.taxId !== clean(cur.taxId)) {
    const rules = kycCountryRules(ctx.country);
    if (!patch.taxId) {
      problems.push({ field: 'taxId', message: 'Informe o documento fiscal (NIF / CNPJ).' });
    } else {
      const types: KycAccountType[] = ctx.accountType ? [ctx.accountType] : ['pf', 'empresa'];
      const results = types.map((t) => rules.validateTaxId(patch.taxId!, t));
      if (results.every((r) => r !== null)) problems.push({ field: 'taxId', message: results[0] as string });
    }
  }
  if (patch.city !== undefined && patch.city !== clean(cur.city)) {
    if (patch.city.length < FISCAL_LIMITS.cityMin) problems.push({ field: 'city', message: 'Informe a cidade.' });
    else if (patch.city.length > FISCAL_LIMITS.cityMax) problems.push({ field: 'city', message: `A cidade tem no máximo ${FISCAL_LIMITS.cityMax} caracteres.` });
  }
  if (patch.address !== undefined && patch.address !== clean(cur.address)) {
    if (patch.address.length < FISCAL_LIMITS.addressMin) problems.push({ field: 'address', message: 'Informe o endereço fiscal / sede comercial (rua, número, bairro).' });
    else if (patch.address.length > FISCAL_LIMITS.addressMax) problems.push({ field: 'address', message: `O endereço tem no máximo ${FISCAL_LIMITS.addressMax} caracteres.` });
  }
  return problems;
}

/** Erro de uma chamada de salvar -> problemas por campo + mensagem legível (nunca só "status code 400"). */
export function fiscalIssuesFromError(err: any): { fields: Partial<Record<FiscalField, string>>; message: string } {
  const data = err?.response?.data ?? err?.data ?? null;
  const details = data?.error?.details;
  const fields: Partial<Record<FiscalField, string>> = {};
  if (Array.isArray(details)) {
    for (const d of details) {
      if (d && (d.field === 'taxId' || d.field === 'city' || d.field === 'address') && typeof d.message === 'string' && !(d.field in fields)) fields[d.field as FiscalField] = d.message;
    }
  }
  const status = err?.response?.status;
  const serverMessage: string | undefined = data?.message || data?.error?.message;
  const message = serverMessage
    || (status === 401 || status === 403 ? 'Sua sessão expirou ou você não tem permissão. Entre novamente e tente de novo.'
      : status && status >= 500 ? 'O servidor não conseguiu salvar agora. Seus dados continuam na tela; tente novamente em instantes.'
      : err?.message && !/status code \d+/i.test(String(err.message)) ? String(err.message)
      : 'Não foi possível salvar. Confira os campos e tente novamente.');
  return { fields, message };
}

export interface SaveAccountResult {
  ok: boolean;
  /** o que o servidor gravou (só quando ok) */
  saved: { taxId?: string; city?: string; address?: string };
  /** erros por campo e mensagem (só quando !ok) */
  fields: Partial<Record<FiscalField, string>>;
  message: string;
}

/**
 * Salva a conta e só diz "ok" quando o servidor CONFIRMA (success === true). Resposta sem sucesso, erro 4xx/5xx, sem rede ou sem
 * sessão → { ok: false } com mensagem clara (e erros por campo quando o servidor os envia). Devolve o que o servidor gravou.
 */
export async function saveSellerAccountDetails(payload: Record<string, unknown>, update: (p: Record<string, unknown>) => Promise<any>): Promise<SaveAccountResult> {
  try {
    const res = await update(payload);
    if (!res || res.success !== true) {
      return { ok: false, saved: {}, fields: {}, message: res?.message || res?.error?.message || 'Não foi possível salvar os dados da conta. Tente novamente.' };
    }
    const d = res.data && typeof res.data === 'object' ? res.data : {};
    return {
      ok: true,
      fields: {},
      message: '',
      saved: {
        taxId: typeof d.taxId === 'string' ? d.taxId : undefined,
        city: typeof d.city === 'string' ? d.city : undefined,
        address: typeof d.address === 'string' ? d.address : undefined,
      },
    };
  } catch (err: any) {
    const { fields, message } = fiscalIssuesFromError(err);
    return { ok: false, saved: {}, fields, message };
  }
}
