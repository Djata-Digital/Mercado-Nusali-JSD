/**
 * Regras do onboarding/KYC do vendedor — PURAS (sem rede, sem banco), usadas pela tela do vendedor, pelo servidor (envio) e pela
 * aprovação do administrador, para o que a tela pede ser exatamente o que o servidor exige.
 *
 * Tipos de conta:
 *   - 'pf'      Pessoa Física / Autônomo: identidade, comprovante de residência, selfie, NIF/CPF pessoal. NUNCA documentos de empresa.
 *   - 'empresa' Empresa / Sociedade Comercial: tudo o que a pessoa física envia + registro empresarial e NIF/CNPJ comercial.
 * Identificação por país: rótulo e formato do número fiscal (CPF/CNPJ no Brasil, NIF de 9 dígitos com dígito de controle em Portugal,
 * NIF/BI nos demais) e tipos de documento de identidade aceitos.
 */

export type KycAccountType = 'pf' | 'empresa';
export type KycStepKey = 'account_type' | 'person' | 'identity' | 'address' | 'business' | 'payout' | 'countries' | 'selfie';
export type KycFieldKey =
  | 'accountType' | 'legalName' | 'birthDate' | 'taxId' | 'phone' | 'documentType' | 'documentNumber'
  | 'identityDocument' | 'proofOfAddress' | 'selfie' | 'businessLicense';

export const KYC_ACCOUNT_LABEL: Record<KycAccountType, string> = {
  pf: 'Pessoa Física / Autônomo',
  empresa: 'Empresa / Sociedade Comercial',
};

/** Aceita os valores da tela ('pf' | 'empresa') e os nomes longos; qualquer outro => null (nunca assume um tipo). */
export function normalizeKycAccountType(v: unknown): KycAccountType | null {
  const t = String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s/-]+/g, '_');
  if (['pf', 'pessoa_fisica', 'pessoa_fisica_autonomo', 'autonomo', 'individual'].includes(t)) return 'pf';
  if (['empresa', 'pj', 'pessoa_juridica', 'empresa_sociedade_comercial', 'sociedade_comercial', 'sociedade'].includes(t)) return 'empresa';
  return null;
}

// ---------------------------------------------------------------- etapas

export interface KycStepDef { key: KycStepKey; title: string; /** só aparece para empresa */ companyOnly?: boolean; /** não é exigida para enviar */ optional?: boolean }

export const KYC_STEPS: KycStepDef[] = [
  { key: 'account_type', title: 'Tipo de Conta' },
  { key: 'person', title: 'Responsável Legal' },
  { key: 'identity', title: 'Identidade (BI/Passaporte)' },
  { key: 'address', title: 'Comprovante de Residência' },
  { key: 'business', title: 'Registro Empresarial / NIF', companyOnly: true },
  { key: 'payout', title: 'Conta de Saque', optional: true },
  { key: 'countries', title: 'Países Atendidos', optional: true },
  { key: 'selfie', title: 'Selfie de Validação' },
];

/** Etapas do tipo de conta: pessoa física NUNCA vê a etapa de registro empresarial. Sem tipo escolhido: só as que não dependem dele. */
export function kycStepsFor(accountType: KycAccountType | null): KycStepDef[] {
  return KYC_STEPS.filter((s) => !s.companyOnly || accountType === 'empresa');
}

// ---------------------------------------------------------------- regras por país

export interface KycCountryRules {
  country: string;
  taxIdLabel: Record<KycAccountType, string>;
  taxIdPlaceholder: Record<KycAccountType, string>;
  /** tipos de documento de identidade aceitos (valores do seletor) */
  identityDocTypes: string[];
  validateTaxId: (value: string, accountType: KycAccountType) => string | null;
}

export const IDENTITY_DOC_LABELS: Record<string, string> = {
  passport: 'Passaporte Internacional',
  bi: 'Bilhete de Identidade (BI)',
  cni: 'CNI / CNH Nacional',
};

const digitsOf = (s: string) => s.replace(/\D/g, '');

function validCpf(raw: string): boolean {
  const d = digitsOf(raw);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => { let sum = 0; for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i); const r = (sum * 10) % 11; return r === 10 ? 0 : r; };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

function validCnpj(raw: string): boolean {
  const d = digitsOf(raw);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + w * Number(d[i]), 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

function validPtNif(raw: string): boolean {
  const d = digitsOf(raw);
  if (d.length !== 9) return false;
  const sum = d.slice(0, 8).split('').reduce((acc, ch, i) => acc + Number(ch) * (9 - i), 0);
  const check = 11 - (sum % 11);
  return Number(d[8]) === (check >= 10 ? 0 : check);
}

/** NIF/BI de países sem algoritmo público conhecido: 5 a 20 caracteres alfanuméricos, com pelo menos um dígito. */
function genericTaxIdProblem(value: string, label: string): string | null {
  const compact = value.replace(/[\s.\-/]/g, '');
  if (!/^[A-Za-z0-9]{5,20}$/.test(compact) || !/\d/.test(compact)) return `Informe um ${label} válido (5 a 20 letras/números, sem símbolos).`;
  return null;
}

const GENERIC: KycCountryRules = {
  country: '*',
  taxIdLabel: { pf: 'NIF Pessoal / Tax ID', empresa: 'NIF Comercial / Tax ID' },
  taxIdPlaceholder: { pf: 'ex: 123456789', empresa: 'ex: 123456789' },
  identityDocTypes: ['passport', 'bi', 'cni'],
  validateTaxId: (v, t) => genericTaxIdProblem(v, GENERIC.taxIdLabel[t]),
};

const RULES: Record<string, KycCountryRules> = {
  GW: {
    country: 'GW',
    taxIdLabel: { pf: 'NIF / BI Pessoal', empresa: 'NIF Comercial' },
    taxIdPlaceholder: { pf: 'ex: NIF ou nº do BI', empresa: 'ex: NIF 123456789' },
    identityDocTypes: ['passport', 'bi', 'cni'],
    validateTaxId: (v, t) => genericTaxIdProblem(v, RULES.GW.taxIdLabel[t]),
  },
  BR: {
    country: 'BR',
    taxIdLabel: { pf: 'CPF Pessoal', empresa: 'CNPJ Comercial' },
    taxIdPlaceholder: { pf: 'ex: 000.000.000-00', empresa: 'ex: 00.000.000/0000-00' },
    // no Brasil não há "BI": identidade é RG/CNH (CNI) ou passaporte
    identityDocTypes: ['passport', 'cni'],
    validateTaxId: (v, t) => (t === 'empresa' ? (validCnpj(v) ? null : 'CNPJ inválido: informe os 14 dígitos corretos.') : validCpf(v) ? null : 'CPF inválido: informe os 11 dígitos corretos.'),
  },
  PT: {
    country: 'PT',
    taxIdLabel: { pf: 'NIF Pessoal', empresa: 'NIPC / NIF Comercial' },
    taxIdPlaceholder: { pf: 'ex: 123456789', empresa: 'ex: 500000000' },
    identityDocTypes: ['passport', 'bi', 'cni'],
    validateTaxId: (v, t) => (validPtNif(v) ? null : `${RULES.PT.taxIdLabel[t]} inválido: informe os 9 dígitos corretos.`),
  },
};

export function kycCountryRules(country: string | null | undefined): KycCountryRules {
  return RULES[String(country ?? '').trim().toUpperCase()] ?? GENERIC;
}

// ---------------------------------------------------------------- requisitos e validação

export interface KycRequirement {
  key: KycFieldKey;
  label: string;
  kind: 'field' | 'document';
  step: KycStepKey;
  required: true;
}

/** Lista (para a tela) do que é OBRIGATÓRIO para o tipo de conta e o país. Sem tipo escolhido: só o tipo de conta. */
export function kycRequirements(accountType: KycAccountType | null, country: string | null | undefined): KycRequirement[] {
  const rules = kycCountryRules(country);
  const out: KycRequirement[] = [{ key: 'accountType', label: 'Tipo de conta', kind: 'field', step: 'account_type', required: true }];
  if (!accountType) return out;
  out.push(
    { key: 'legalName', label: accountType === 'empresa' ? 'Nome completo do responsável legal' : 'Nome completo', kind: 'field', step: 'person', required: true },
    { key: 'birthDate', label: 'Data de nascimento (maior de 18 anos)', kind: 'field', step: 'person', required: true },
    { key: 'taxId', label: rules.taxIdLabel[accountType], kind: 'field', step: 'person', required: true },
    { key: 'phone', label: 'Telefone de contato', kind: 'field', step: 'person', required: true },
    { key: 'documentType', label: 'Tipo do documento de identidade', kind: 'field', step: 'identity', required: true },
    { key: 'documentNumber', label: 'Número do documento de identidade', kind: 'field', step: 'identity', required: true },
    { key: 'identityDocument', label: 'Documento de identidade (arquivo)', kind: 'document', step: 'identity', required: true },
    { key: 'proofOfAddress', label: 'Comprovante de residência (arquivo)', kind: 'document', step: 'address', required: true },
  );
  if (accountType === 'empresa') out.push({ key: 'businessLicense', label: 'Registro empresarial / NIF comercial (arquivo)', kind: 'document', step: 'business', required: true });
  out.push({ key: 'selfie', label: 'Selfie com o documento (arquivo)', kind: 'document', step: 'selfie', required: true });
  return out;
}

export interface KycIssue { field: KycFieldKey; label: string; message: string; step: KycStepKey }

export interface KycSubmissionInput {
  accountType?: unknown;
  legalName?: unknown;
  birthDate?: unknown;
  taxId?: unknown;
  phone?: unknown;
  documentType?: unknown;
  documentNumber?: unknown;
  hasIdentityDocument?: boolean;
  hasProofOfAddress?: boolean;
  hasSelfie?: boolean;
  hasBusinessLicense?: boolean;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

function birthDateProblem(raw: string, now: Date): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return 'Informe a data de nascimento (dia/mês/ano).';
  const d = new Date(`${raw}T00:00:00Z`);
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) return 'Data de nascimento inválida.';
  if (d.getTime() > now.getTime()) return 'A data de nascimento não pode estar no futuro.';
  const eighteen = new Date(Date.UTC(d.getUTCFullYear() + 18, d.getUTCMonth(), d.getUTCDate()));
  if (eighteen.getTime() > now.getTime()) return 'É preciso ter 18 anos ou mais para vender.';
  if (d.getUTCFullYear() < now.getUTCFullYear() - 120) return 'Data de nascimento inválida.';
  return null;
}

/**
 * Validação do ENVIO. Cada problema traz o campo, o rótulo, a mensagem específica e a etapa onde corrigir — a mesma resposta serve à tela
 * (mensagem junto do campo) e ao servidor (HTTP 400 estruturado). `now` é injetável para testes.
 */
export function validateKycSubmission(input: KycSubmissionInput, country: string | null | undefined, now: Date = new Date()): KycIssue[] {
  const issues: KycIssue[] = [];
  const type = normalizeKycAccountType(input.accountType);
  if (!type) {
    return [{ field: 'accountType', label: 'Tipo de conta', message: 'Selecione o tipo de conta: Pessoa Física / Autônomo ou Empresa / Sociedade Comercial.', step: 'account_type' }];
  }
  const rules = kycCountryRules(country);
  const reqLabel = (key: KycFieldKey) => kycRequirements(type, country).find((r) => r.key === key)?.label ?? key;
  const add = (field: KycFieldKey, message: string) => issues.push({ field, label: reqLabel(field), message, step: kycRequirements(type, country).find((r) => r.key === field)?.step ?? 'person' });

  const legalName = str(input.legalName);
  if (!legalName) add('legalName', 'Informe o nome completo.');
  else if (legalName.length < 3 || !/\p{L}/u.test(legalName)) add('legalName', 'Nome muito curto ou inválido.');
  else if (legalName.length > 255) add('legalName', 'Nome muito longo (máximo 255 caracteres).');

  const birth = str(input.birthDate);
  const birthProblem = birthDateProblem(birth, now);
  if (!birth) add('birthDate', 'Informe a data de nascimento.');
  else if (birthProblem) add('birthDate', birthProblem);

  const taxId = str(input.taxId);
  if (!taxId) add('taxId', `Informe o ${rules.taxIdLabel[type]}.`);
  else { const p = rules.validateTaxId(taxId, type); if (p) add('taxId', p); }

  const phone = str(input.phone);
  const phoneDigits = phone.replace(/\D/g, '');
  if (!phone) add('phone', 'Informe o telefone de contato.');
  else if (!/^[+\d\s().-]+$/.test(phone) || phoneDigits.length < 7 || phoneDigits.length > 15) add('phone', 'Telefone inválido: use 7 a 15 dígitos (ex.: +245 955000000).');

  const docType = str(input.documentType);
  if (!docType) add('documentType', 'Selecione o tipo do documento de identidade.');
  else if (!rules.identityDocTypes.includes(docType)) add('documentType', `Este tipo de documento não é aceito para o país da conta. Aceitos: ${rules.identityDocTypes.map((d) => IDENTITY_DOC_LABELS[d] ?? d).join(', ')}.`);

  const docNumber = str(input.documentNumber);
  if (!docNumber) add('documentNumber', 'Informe o número do documento de identidade.');
  else if (docNumber.length < 4 || docNumber.length > 50 || !/^[A-Za-z0-9][A-Za-z0-9 ./-]*$/.test(docNumber)) add('documentNumber', 'Número do documento inválido (4 a 50 caracteres, só letras, números, espaço, ponto, hífen ou barra).');

  if (!input.hasIdentityDocument) add('identityDocument', 'Envie o arquivo do documento de identidade (BI, passaporte ou CNI).');
  if (!input.hasProofOfAddress) add('proofOfAddress', 'Envie um comprovante de residência recente (últimos 90 dias).');
  if (type === 'empresa' && !input.hasBusinessLicense) add('businessLicense', 'Envie o registro empresarial / certidão comercial ou o documento do NIF comercial.');
  if (!input.hasSelfie) add('selfie', 'Envie a selfie segurando o documento de identidade.');

  const order = kycRequirements(type, country).map((r) => r.key);
  return issues.sort((a, b) => order.indexOf(a.field) - order.indexOf(b.field));
}

/**
 * Verificação mínima para APROVAR (administrador): o que precisa estar guardado — nome e número do documento, os três documentos e,
 * para empresa, o registro empresarial e o NIF/CNPJ comercial válido. Tipo desconhecido (cadastro antigo): exige o conjunto comum e,
 * se há registro empresarial anexado, trata como empresa.
 */
export function validateKycForApproval(
  input: { accountType?: unknown; legalName?: unknown; documentNumber?: unknown; taxId?: unknown; phone?: unknown; hasIdentityDocument: boolean; hasProofOfAddress: boolean; hasSelfie: boolean; hasBusinessLicense: boolean },
  country: string | null | undefined,
): KycIssue[] {
  const type = normalizeKycAccountType(input.accountType) ?? (input.hasBusinessLicense ? 'empresa' : 'pf');
  const rules = kycCountryRules(country);
  const label = (k: KycFieldKey) => kycRequirements(type, country).find((r) => r.key === k)?.label ?? k;
  const stepOf = (k: KycFieldKey) => kycRequirements(type, country).find((r) => r.key === k)?.step ?? 'person';
  const issues: KycIssue[] = [];
  const add = (field: KycFieldKey, message: string) => issues.push({ field, label: label(field), message, step: stepOf(field) });
  if (!str(input.legalName)) add('legalName', 'Nome completo não informado.');
  if (!str(input.documentNumber)) add('documentNumber', 'Número do documento de identidade não informado.');
  if (!input.hasIdentityDocument) add('identityDocument', 'Documento de identidade não anexado.');
  if (!input.hasProofOfAddress) add('proofOfAddress', 'Comprovante de residência não anexado.');
  if (!input.hasSelfie) add('selfie', 'Selfie com o documento não anexada.');
  if (type === 'empresa') {
    if (!input.hasBusinessLicense) add('businessLicense', 'Registro empresarial / NIF comercial não anexado.');
    const taxId = str(input.taxId);
    const phoneDigits = digitsOf(str(input.phone));
    if (!taxId || (phoneDigits && digitsOf(taxId) === phoneDigits)) add('taxId', `${rules.taxIdLabel.empresa} não informado.`);
    else { const p = rules.validateTaxId(taxId, 'empresa'); if (p) add('taxId', p); }
  }
  return issues;
}

/** Texto único (para toast / mensagem HTTP) a partir dos problemas. */
export function summarizeKycIssues(issues: KycIssue[]): string {
  if (issues.length === 0) return '';
  const labels = Array.from(new Set(issues.map((i) => i.label)));
  return `Faltam ou estão inválidos: ${labels.join('; ')}.`;
}
