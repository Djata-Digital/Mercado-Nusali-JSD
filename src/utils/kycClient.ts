/**
 * Onboarding/KYC no frontend (PURO): erros do servidor viram problemas por campo, e a navegação das etapas segue as regras
 * compartilhadas (utils/sellerKycRules). Nada aqui toca rede ou DOM.
 */
import {
  kycCountryRules, kycRequirements, kycStepsFor, summarizeKycIssues, validateKycSubmission,
  type KycAccountType, type KycFieldKey, type KycIssue, type KycStepKey, type KycSubmissionInput,
} from './sellerKycRules';

/** Valores do formulário que entram na validação (o que a pessoa digitou/anexou). */
export interface KycFormSnapshot {
  accountType: KycAccountType | null;
  fullName: string;
  birthDate: string;
  taxId: string;
  phone: string;
  docType: string;
  docNumber: string;
  hasIdentityDocument: boolean;
  hasProofOfAddress: boolean;
  hasSelfie: boolean;
  hasBusinessLicense: boolean;
}

export function validateKycForm(s: KycFormSnapshot, country: string | null | undefined, now?: Date): KycIssue[] {
  const input: KycSubmissionInput = {
    accountType: s.accountType, legalName: s.fullName, birthDate: s.birthDate, taxId: s.taxId, phone: s.phone,
    documentType: s.docType, documentNumber: s.docNumber,
    hasIdentityDocument: s.hasIdentityDocument, hasProofOfAddress: s.hasProofOfAddress, hasSelfie: s.hasSelfie, hasBusinessLicense: s.hasBusinessLicense,
  };
  return validateKycSubmission(input, country, now);
}

/** Mensagem por campo (a primeira, se houver várias). */
export function issuesByField(issues: KycIssue[]): Partial<Record<KycFieldKey, string>> {
  const out: Partial<Record<KycFieldKey, string>> = {};
  for (const i of issues) if (!(i.field in out)) out[i.field] = i.message;
  return out;
}

export function issuesForStep(issues: KycIssue[], step: KycStepKey): KycIssue[] {
  return issues.filter((i) => i.step === step);
}

/** Primeira etapa (na ordem do tipo de conta) que tem problema, ou null. */
export function firstStepWithIssue(issues: KycIssue[], accountType: KycAccountType | null): KycStepKey | null {
  for (const s of kycStepsFor(accountType)) if (issues.some((i) => i.step === s.key)) return s.key;
  return null;
}

/**
 * A pessoa quer ir para `target`: só pode se todas as etapas ANTERIORES estiverem válidas; senão vai para a primeira com problema
 * (e a tela mostra os erros ali). Voltar nunca é bloqueado.
 */
export function resolveStepTarget(current: KycStepKey, target: KycStepKey, issues: KycIssue[], accountType: KycAccountType | null): { step: KycStepKey; blocked: boolean } {
  const order = kycStepsFor(accountType).map((s) => s.key);
  const ti = order.indexOf(target);
  const ci = order.indexOf(current);
  if (ti < 0) return { step: current, blocked: false };
  if (ti <= ci) return { step: target, blocked: false };
  for (const key of order.slice(0, ti)) if (issues.some((i) => i.step === key)) return { step: key, blocked: true };
  return { step: target, blocked: false };
}

/**
 * Erro de uma chamada da API (AxiosError ou Error) -> problemas por campo + mensagem legível. Aceita o formato estruturado
 * (error.details[]) e cai na mensagem do servidor; nunca devolve só "Request failed with status code 400".
 */
export function kycIssuesFromError(err: any): { issues: KycIssue[]; message: string; structured: boolean } {
  const data = err?.response?.data ?? err?.data ?? null;
  const details = data?.error?.details;
  const issues: KycIssue[] = Array.isArray(details)
    ? details
        .filter((d: any) => d && typeof d.field === 'string' && typeof d.message === 'string')
        .map((d: any) => ({ field: d.field as KycFieldKey, label: String(d.label ?? d.field), message: String(d.message), step: (d.step as KycStepKey) ?? 'person' }))
    : [];
  const serverMessage: string | undefined = data?.message || data?.error?.message;
  if (issues.length > 0) return { issues, message: serverMessage || summarizeKycIssues(issues), structured: true };
  const status = err?.response?.status;
  const message = serverMessage
    || (status === 413 ? 'O arquivo é grande demais. Envie um arquivo menor (até 10 MB).'
      : status === 401 || status === 403 ? 'Sua sessão expirou ou você não tem permissão. Entre novamente e tente de novo.'
      : status && status >= 500 ? 'O servidor não conseguiu concluir o envio agora. Seus dados foram mantidos; tente novamente em instantes.'
      : err?.message && !/status code \d+/i.test(String(err.message)) ? String(err.message)
      : 'Não foi possível enviar. Confira os campos obrigatórios e tente novamente.');
  return { issues: [], message, structured: false };
}

export { kycCountryRules, kycRequirements, kycStepsFor };

/**
 * Estado de uma consulta GET /seller/kyc: o cadastro de vendedor NÃO existe (pede onboarding), existe mas nenhum documento foi enviado
 * (data nula — NÃO é "não inicializado"), ou há envio (pendente de análise, aprovado ou rejeitado).
 */
export type KycLoadState = 'no_seller' | 'not_submitted' | 'submitted';

export function classifyKycLoad(res: any): KycLoadState {
  if (res?.error?.code === 'SELLER_PROFILE_NOT_FOUND') return 'no_seller';
  if (res?.success && (res.data === null || res.data === undefined) && res.kycSubmitted !== true) return 'not_submitted';
  return 'submitted';
}

/** Mesma classificação para o erro lançado (404 do axios traz o corpo em response.data). */
export function classifyKycLoadError(err: any): KycLoadState | null {
  return err?.response?.data?.error?.code === 'SELLER_PROFILE_NOT_FOUND' ? 'no_seller' : null;
}
