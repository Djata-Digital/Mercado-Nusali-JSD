import React from 'react';
import { CheckCircle2, Circle, XCircle } from 'lucide-react';
import { KYC_ACCOUNT_LABEL, kycRequirements, type KycAccountType, type KycFieldKey, type KycIssue } from '../../utils/sellerKycRules';

interface Props {
  accountType: KycAccountType | null;
  country: string | null | undefined;
  /** campos/documentos que já estão preenchidos e válidos */
  done: Partial<Record<KycFieldKey, boolean>>;
  /** problemas mostrados (depois de uma tentativa de avançar/enviar) */
  issues: KycIssue[];
}

/** Lista visível do que é OBRIGATÓRIO para o tipo de conta e o país: ✓ pronto, ○ pendente, ✗ com problema. */
export const KycRequirementsChecklist: React.FC<Props> = ({ accountType, country, done, issues }) => {
  const reqs = kycRequirements(accountType, country);
  const bad = new Set(issues.map((i) => i.field));
  return (
    <section aria-label="Requisitos obrigatórios" data-testid="kyc-requirements" className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-bold text-gray-900">
          O que é obrigatório {accountType ? <>para <span className="text-emerald-700">{KYC_ACCOUNT_LABEL[accountType]}</span></> : 'para enviar'}
        </h2>
        <span className="text-[11px] font-bold text-gray-500">
          {reqs.filter((r) => done[r.key]).length} de {reqs.length} prontos
        </span>
      </div>
      {!accountType && <p className="text-xs text-gray-600">Escolha o tipo de conta na etapa 1 para ver exatamente o que precisa enviar.</p>}
      {accountType === 'pf' && (
        <p data-testid="kyc-pf-note" className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 font-medium">
          Pessoa Física / Autônomo: <strong>não</strong> são exigidos documentos de empresa (registro empresarial, certidão comercial).
        </p>
      )}
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
        {reqs.map((r) => {
          const state = bad.has(r.key) ? 'bad' : done[r.key] ? 'ok' : 'todo';
          return (
            <li key={r.key} data-testid={`kyc-req-${r.key}`} data-state={state} className={`flex items-start gap-1.5 ${state === 'bad' ? 'text-red-700 font-bold' : state === 'ok' ? 'text-emerald-800' : 'text-gray-700'}`}>
              {state === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" /> : state === 'bad' ? <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" /> : <Circle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />}
              <span>
                {r.label} <span className="text-red-600 font-black" aria-hidden="true">*</span>
                <span className="sr-only"> (obrigatório{state === 'ok' ? ', pronto' : state === 'bad' ? ', com problema' : ', pendente'})</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

/** Mensagem de erro junto do campo (leitores de tela anunciam; o campo aponta para ela por aria-describedby). */
export const KycFieldError: React.FC<{ id: string; message?: string }> = ({ id, message }) =>
  message ? <p id={id} role="alert" data-testid={id} className="mt-1 text-[11px] font-bold text-red-600">{message}</p> : null;

export const RequiredMark: React.FC = () => (
  <>
    <span className="text-red-600 font-black ml-0.5" aria-hidden="true">*</span>
    <span className="sr-only"> (obrigatório)</span>
  </>
);
