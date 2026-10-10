/**
 * Dados fiscais da "Minha Conta de Vendedor" (documento fiscal, cidade, endereço fiscal) — regras PURAS, usadas pela tela e pelo servidor.
 * O documento fiscal segue as mesmas regras por país do KYC (utils/sellerKycRules), para um fluxo nunca aceitar o que o outro recusa.
 */
import { kycCountryRules, type KycAccountType } from './sellerKycRules';

export type FiscalField = 'taxId' | 'city' | 'address';
const ACCOUNT_FIELD_NAMES = ['taxId', 'city', 'address', 'fullName', 'sellerType', 'country', 'email', 'preferredCurrency'];

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

/** Aviso do servidor: a alteração pede reverificação do KYC (precisa de confirmação explícita para seguir). */
export interface ReverificationPrompt {
  changes: Array<{ field: string; label: string; from?: string; to?: string }>;
  message: string;
}

export interface SaveErrorInfo {
  fields: Partial<Record<AccountField, string>>;
  message: string;
  /** código do erro do servidor (ex.: KYC_REVERIFICATION_REQUIRED, COUNTRY_CHANGE_BLOCKED) */
  code: string | null;
  reverification: ReverificationPrompt | null;
}

/** Erro de uma chamada de salvar -> problemas por campo + mensagem legível (nunca só "status code 400"). */
export function fiscalIssuesFromError(err: any): SaveErrorInfo {
  const data = err?.response?.data ?? err?.data ?? null;
  const details = data?.error?.details;
  const fields: Partial<Record<AccountField, string>> = {};
  if (Array.isArray(details)) {
    for (const d of details) {
      if (d && ACCOUNT_FIELD_NAMES.includes(d.field) && typeof d.message === 'string' && !(d.field in fields)) fields[d.field as AccountField] = d.message;
    }
  }
  const status = err?.response?.status;
  const code: string | null = typeof data?.error?.code === 'string' ? data.error.code : null;
  const serverMessage: string | undefined = data?.message || data?.error?.message;
  const message = serverMessage
    || (status === 401 || status === 403 ? 'Sua sessão expirou ou você não tem permissão. Entre novamente e tente de novo.'
      : status && status >= 500 ? 'O servidor não conseguiu salvar agora. Seus dados continuam na tela; tente novamente em instantes.'
      : err?.message && !/status code \d+/i.test(String(err.message)) ? String(err.message)
      : 'Não foi possível salvar. Confira os campos e tente novamente.');
  const reverification: ReverificationPrompt | null = code === 'KYC_REVERIFICATION_REQUIRED'
    ? { changes: Array.isArray(data?.error?.changes) ? data.error.changes : [], message }
    : null;
  return { fields, message, code, reverification };
}

export interface SavedAccountValues {
  taxId?: string;
  city?: string;
  address?: string;
  fullName?: string;
  sellerType?: string;
  country?: string;
  email?: string;
  preferredCurrency?: string;
  commercialName?: string;
  phone?: string;
}

export interface SaveAccountResult {
  ok: boolean;
  /** o que o servidor gravou (só quando ok) */
  saved: SavedAccountValues;
  /** o KYC voltou para análise por causa desta alteração (só quando ok) */
  kycReverification: { required: boolean; changes: Array<{ field: string; label: string }> } | null;
  /** erros por campo e mensagem (só quando !ok) */
  fields: Partial<Record<AccountField, string>>;
  message: string;
  code: string | null;
  /** o servidor pede confirmação explícita antes de mandar o KYC para reverificação */
  reverification: ReverificationPrompt | null;
}

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

/**
 * Salva a conta e só diz "ok" quando o servidor CONFIRMA (success === true). Resposta sem sucesso, erro 4xx/5xx, sem rede ou sem
 * sessão → { ok: false } com mensagem clara (e erros por campo quando o servidor os envia). Devolve o que o servidor gravou.
 */
export async function saveSellerAccountDetails(payload: Record<string, unknown>, update: (p: Record<string, unknown>) => Promise<any>): Promise<SaveAccountResult> {
  const failure = (o: Partial<SaveAccountResult>): SaveAccountResult => ({ ok: false, saved: {}, kycReverification: null, fields: {}, message: '', code: null, reverification: null, ...o });
  try {
    const res = await update(payload);
    if (!res || res.success !== true) {
      return failure({ message: res?.message || res?.error?.message || 'Não foi possível salvar os dados da conta. Tente novamente.' });
    }
    const d = res.data && typeof res.data === 'object' ? res.data : {};
    const rv = d.kycReverification && typeof d.kycReverification === 'object' && d.kycReverification.required === true ? d.kycReverification : null;
    return {
      ok: true,
      fields: {},
      message: '',
      code: null,
      reverification: null,
      kycReverification: rv ? { required: true, changes: Array.isArray(rv.changes) ? rv.changes : [] } : null,
      saved: {
        taxId: str(d.taxId), city: str(d.city), address: str(d.address),
        fullName: str(d.fullName), sellerType: str(d.sellerType), country: str(d.country), email: str(d.email),
        preferredCurrency: str(d.preferredCurrency), commercialName: str(d.commercialName), phone: str(d.phone),
      },
    };
  } catch (err: any) {
    const info = fiscalIssuesFromError(err);
    return failure({ fields: info.fields, message: info.message, code: info.code, reverification: info.reverification });
  }
}

// ======================================================================================================================
// Demais campos da conta: titular, tipo de vendedor, país sede, e-mail comercial, moeda preferida; e reverificação de identidade.
// ======================================================================================================================

export type AccountField = FiscalField | 'fullName' | 'sellerType' | 'country' | 'email' | 'preferredCurrency';

export const SELLER_TYPES = ['pessoa_fisica', 'empresa_individual', 'sociedade', 'marca_oficial', 'vendedor_internacional'] as const;
export type SellerType = (typeof SELLER_TYPES)[number];

/** Classe de KYC do tipo de vendedor: só pessoa física é 'pf'; todos os outros exigem os documentos de empresa. */
export function sellerTypeToAccountType(t: unknown): KycAccountType | null {
  if (!SELLER_TYPES.includes(t as SellerType)) return null;
  return t === 'pessoa_fisica' ? 'pf' : 'empresa';
}

/** Tipo de vendedor padrão de uma classe de KYC (quando o KYC define o tipo e o tipo de vendedor ainda não foi escolhido). */
export function defaultSellerTypeFor(accountType: KycAccountType | null): SellerType | null {
  return accountType === 'pf' ? 'pessoa_fisica' : accountType === 'empresa' ? 'empresa_individual' : null;
}

export interface AccountPatch {
  fullName?: string;
  sellerType?: string;
  country?: string;
  email?: string;
  preferredCurrency?: string;
}

export const ACCOUNT_LIMITS = { nameMin: 2, nameMax: 120, emailMax: 254 } as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Só entram os campos ENVIADOS como texto (atualização parcial). País e moeda em maiúsculas; e-mail em minúsculas. */
export function pickAccountPatch(input: Record<string, unknown> | null | undefined): AccountPatch {
  const out: AccountPatch = {};
  if (!input) return out;
  if (typeof input.fullName === 'string') out.fullName = clean(input.fullName);
  if (typeof input.sellerType === 'string') out.sellerType = input.sellerType.trim();
  if (typeof input.country === 'string') out.country = input.country.trim().toUpperCase();
  if (typeof input.email === 'string') out.email = input.email.trim().toLowerCase();
  if (typeof input.preferredCurrency === 'string') out.preferredCurrency = input.preferredCurrency.trim().toUpperCase();
  return out;
}

export interface AccountContext {
  /** valores JÁ guardados (o que não mudou não é revalidado: dado antigo nunca impede salvar outro campo) */
  current: { fullName?: string; sellerType?: string | null; country?: string; email?: string; preferredCurrency?: string };
  /** países ativos (códigos); se ausente, o país só é conferido pelo formato */
  activeCountries?: string[];
  /** moedas dos países ativos — as mesmas aceitas para saque; se ausente, só o formato */
  supportedCurrencies?: string[];
}

export interface AccountProblem { field: AccountField; message: string }

export function validateAccountPatch(patch: AccountPatch, input: Record<string, unknown>, ctx: AccountContext): AccountProblem[] {
  const problems: AccountProblem[] = [];
  const cur = ctx.current;
  for (const k of ['fullName', 'sellerType', 'country', 'email', 'preferredCurrency'] as const) {
    const raw = (input ?? {})[k];
    if (raw !== undefined && raw !== null && typeof raw !== 'string') problems.push({ field: k, message: 'Valor inválido: envie texto.' });
  }
  if (patch.fullName !== undefined && patch.fullName !== clean(cur.fullName)) {
    if (patch.fullName.length < ACCOUNT_LIMITS.nameMin || !/\p{L}/u.test(patch.fullName)) problems.push({ field: 'fullName', message: 'Informe o nome completo do titular da conta.' });
    else if (patch.fullName.length > ACCOUNT_LIMITS.nameMax) problems.push({ field: 'fullName', message: `O nome tem no máximo ${ACCOUNT_LIMITS.nameMax} caracteres.` });
  }
  if (patch.sellerType !== undefined && patch.sellerType !== (cur.sellerType ?? '')) {
    if (!SELLER_TYPES.includes(patch.sellerType as SellerType)) problems.push({ field: 'sellerType', message: 'Escolha um tipo de vendedor válido.' });
  }
  if (patch.country !== undefined && patch.country !== String(cur.country ?? '').toUpperCase()) {
    if (!/^[A-Z]{2}$/.test(patch.country)) problems.push({ field: 'country', message: 'Escolha o país sede.' });
    else if (ctx.activeCountries && !ctx.activeCountries.includes(patch.country)) problems.push({ field: 'country', message: 'Este país não está disponível para vendedores no momento.' });
  }
  if (patch.email !== undefined && patch.email !== String(cur.email ?? '').toLowerCase()) {
    if (!patch.email || patch.email.length > ACCOUNT_LIMITS.emailMax || !EMAIL_RE.test(patch.email)) problems.push({ field: 'email', message: 'Informe um e-mail comercial válido (ex.: contato@loja.com).' });
  }
  if (patch.preferredCurrency !== undefined && patch.preferredCurrency !== String(cur.preferredCurrency ?? '').toUpperCase()) {
    if (!/^[A-Z]{3}$/.test(patch.preferredCurrency)) problems.push({ field: 'preferredCurrency', message: 'Escolha a moeda principal para recebimentos.' });
    else if (ctx.supportedCurrencies && !ctx.supportedCurrencies.includes(patch.preferredCurrency)) problems.push({ field: 'preferredCurrency', message: `A moeda ${patch.preferredCurrency} não é suportada. Moedas disponíveis: ${ctx.supportedCurrencies.join(', ')}.` });
  }
  return problems;
}

// ---------------------------------------------------------------- reverificação de identidade

export type IdentityField = 'taxId' | 'fullName' | 'country' | 'accountType';

export interface IdentitySnapshot {
  taxId?: string | null;
  fullName?: string | null;
  country?: string | null;
  accountType?: KycAccountType | null;
}

export interface IdentityChange { field: IdentityField; label: string; from: string; to: string }

export const IDENTITY_FIELD_LABEL: Record<IdentityField, string> = {
  taxId: 'Documento fiscal',
  fullName: 'Nome do titular',
  country: 'País sede',
  accountType: 'Tipo de vendedor (pessoa física / empresa)',
};

const normTax = (v: unknown) => String(v ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
const normName = (v: unknown) => clean(v).toLocaleLowerCase('pt-PT');

/**
 * O que mudou nos dados de identidade (os que o KYC verificou): documento fiscal, nome do titular, país sede e classe do tipo de
 * vendedor. Comparação sem espaços/pontuação (documento) e sem diferença de maiúsculas (nome): só correção de formato NÃO conta.
 */
export function detectIdentityChanges(before: IdentitySnapshot, after: IdentitySnapshot): IdentityChange[] {
  const out: IdentityChange[] = [];
  const push = (field: IdentityField, from: unknown, to: unknown) => out.push({ field, label: IDENTITY_FIELD_LABEL[field], from: String(from ?? ''), to: String(to ?? '') });
  if (after.taxId !== undefined && normTax(after.taxId) !== normTax(before.taxId)) push('taxId', before.taxId, after.taxId);
  if (after.fullName !== undefined && normName(after.fullName) !== normName(before.fullName)) push('fullName', before.fullName, after.fullName);
  if (after.country !== undefined && String(after.country ?? '').toUpperCase() !== String(before.country ?? '').toUpperCase()) push('country', before.country, after.country);
  if (after.accountType !== undefined && after.accountType !== null && after.accountType !== (before.accountType ?? null)) push('accountType', before.accountType ?? '', after.accountType);
  return out;
}

/** Documentos que precisam ser ENVIADOS DE NOVO (os guardados não valem) conforme o que mudou. Sempre o documento de identidade. */
export function documentsNeededAfter(changes: IdentityChange[]): Array<'identityDocument' | 'proofOfAddress'> {
  const needs: Array<'identityDocument' | 'proofOfAddress'> = ['identityDocument'];
  if (changes.some((c) => c.field === 'country')) needs.push('proofOfAddress');
  return needs;
}
