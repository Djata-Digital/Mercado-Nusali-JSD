import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  FileText,
  Upload,
  User,
  Building,
  CreditCard,
  Globe,
  Camera,
  ChevronRight,
  ChevronLeft,
  Clock,
  Lock,
  Check,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { isSellerKycApproved } from '../../utils/kycUtils';
import { SellerProfileData } from '../../data/mockSellerData';
import { SellerService } from '../../services/sellerService';
import { uploadService } from '../../services/uploadService';
import { useCountries } from '../../hooks/useCountries';
import { KycRequirementsChecklist, KycFieldError, RequiredMark } from './KycRequirementsChecklist';
import {
  IDENTITY_DOC_LABELS, kycCountryRules, kycStepsFor, normalizeKycAccountType, summarizeKycIssues,
  type KycAccountType, type KycFieldKey, type KycIssue, type KycStepKey,
} from '../../utils/sellerKycRules';
import { classifyKycLoad, classifyKycLoadError, firstStepWithIssue, issuesByField, kycIssuesFromError, resolveStepTarget, validateKycForm } from '../../utils/kycClient';
import type { UploadResult } from '../../services/uploadService';

interface SellerKycProps {
  profile: SellerProfileData;
  showToast: (msg: string) => void;
  onNavigateSection: (sec: any) => void;
}

export const SellerKyc: React.FC<SellerKycProps> = ({ profile, showToast, onNavigateSection }) => {
  const [stepKey, setStepKey] = useState<KycStepKey>('account_type');
  // Sem tipo escolhido por padrão: ninguém é tratado como empresa (nem como pessoa física) sem ter escolhido — o que é exigido
  // depende dessa escolha. Se já houve um envio, o tipo guardado volta preenchido.
  const [accountType, setAccountType] = useState<KycAccountType | null>(null);
  const country = profile?.country || 'GW';
  const countryRules = kycCountryRules(country);
  // etapas em que a pessoa já tentou avançar/enviar: nelas os erros ficam visíveis (e se corrigem ao digitar)
  const [attempted, setAttempted] = useState<KycStepKey[]>([]);
  // problemas devolvidos pelo servidor que a validação local não conhece (mostrados até o próximo envio)
  const [serverIssues, setServerIssues] = useState<KycIssue[]>([]);
  const [formMessage, setFormMessage] = useState('');
  // resultado dos uploads já feitos: um novo envio depois de um erro NÃO repete uploads nem perde os arquivos
  const [uploaded, setUploaded] = useState<{ identity?: UploadResult; address?: UploadResult; company?: UploadResult; selfie?: UploadResult }>({});

  // Real Form State
  const [fullName, setFullName] = useState(profile?.fullName || '');
  const [birthDate, setBirthDate] = useState('');
  const [taxId, setTaxId] = useState(profile?.taxId || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [docType, setDocType] = useState('passport');
  const [docNumber, setDocNumber] = useState('');

  // Uploaded Files State & Saved URLs
  const [docFile, setDocFile] = useState<File | null>(null);
  const [addressFile, setAddressFile] = useState<File | null>(null);
  const [companyFile, setCompanyFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);

  const [docUrl, setDocUrl] = useState<string>('');
  const [addressUrl, setAddressUrl] = useState<string>('');
  const [companyUrl, setCompanyUrl] = useState<string>('');
  const [selfieUrl, setSelfieUrl] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  // Bank & Payout State
  const [payoutMethod, setPayoutMethod] = useState('orange_money');
  const [payoutAccount, setPayoutAccount] = useState('');
  const [payoutHolder, setPayoutHolder] = useState(profile?.fullName || '');

  // Authorized Countries State — nenhuma pré-seleção fictícia; o seller marca
  // os países realmente atendidos entre os operacionais reais (useCountries).
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const { data: operationalCountries, isLoading: countriesLoading, isError: countriesError } = useCountries();

  // Overall Submission Status
  const [submittedStatus, setSubmittedStatus] = useState<'verified' | 'review' | 'pending'>(
    profile?.kycStatus === 'verified' ? 'verified' : profile?.kycStatus === 'under_review' ? 'review' : 'pending'
  );

  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  // Cadastro de vendedor existe mas nenhum documento foi enviado ainda (diferente de "cadastro inexistente" e de "KYC pendente de análise")
  const [notSubmitted, setNotSubmitted] = useState(false);
  const [isOnboardingLoading, setIsOnboardingLoading] = useState(false);

  const loadKycStatus = async () => {
    try {
      const res = await SellerService.getKyc();
      // Só a AUSÊNCIA do cadastro de vendedor (404) pede o onboarding. Vendedor existente sem KYC enviado (data nula) NÃO é "não inicializado".
      const loadState = classifyKycLoad(res);
      if (loadState === 'no_seller') {
        setNeedsOnboarding(true);
        return;
      }
      setNeedsOnboarding(false);
      setNotSubmitted(loadState === 'not_submitted');

      if (res.success && res.data) {
        const st = res.data.status;
        if (isSellerKycApproved(st)) {
          setSubmittedStatus('verified');
        } else if (st === 'pending' || st === 'under_review' || st === 'review') {
          setSubmittedStatus('review');
        } else if (st === 'rejected') {
          setSubmittedStatus('pending');
          if (res.data.rejectionReason) setRejectionReason(res.data.rejectionReason);
        } else {
          setSubmittedStatus('pending');
        }

        const storedType = normalizeKycAccountType(res.data.accountType);
        if (storedType) setAccountType(storedType);
        if (res.data.phone) setPhone(res.data.phone);
        if (res.data.birthDate) setBirthDate(res.data.birthDate);
        else if ((profile as any)?.dateOfBirth) setBirthDate((profile as any).dateOfBirth);

        if (res.data.taxId && res.data.taxId !== res.data.phone && res.data.taxId !== profile?.phone) {
          setTaxId(res.data.taxId);
        } else if (profile?.taxId && profile.taxId !== profile.phone) {
          setTaxId(profile.taxId);
        } else {
          setTaxId('');
        }

        if (res.data.legalName) setFullName(res.data.legalName);
        if (res.data.documentNumber) setDocNumber(res.data.documentNumber);
        if (res.data.documentType) setDocType(res.data.documentType);
        if (res.data.documentFrontUrl) setDocUrl(res.data.documentFrontUrl);
        if (res.data.proofOfAddressUrl) setAddressUrl(res.data.proofOfAddressUrl);
        if (res.data.selfieUrl) setSelfieUrl(res.data.selfieUrl);

        if (res.data.documents && Array.isArray(res.data.documents)) {
          const identityDoc = res.data.documents.find(
            (d: any) => d.documentType === 'identity_document' || d.type === 'identity_document' || d.type === 'identity_card'
          );
          const addressDoc = res.data.documents.find(
            (d: any) => d.documentType === 'proof_of_address' || d.type === 'proof_of_address'
          );
          const selfieDoc = res.data.documents.find(
            (d: any) => d.documentType === 'selfie' || d.type === 'selfie'
          );
          const companyDoc = res.data.documents.find(
            (d: any) => d.documentType === 'business_license' || d.type === 'business_license' || d.type === 'nif'
          );

          if (identityDoc?.signedUrl || identityDoc?.fileUrl) setDocUrl(identityDoc.signedUrl || identityDoc.fileUrl);
          if (addressDoc?.signedUrl || addressDoc?.fileUrl) setAddressUrl(addressDoc.signedUrl || addressDoc.fileUrl);
          if (selfieDoc?.signedUrl || selfieDoc?.fileUrl) setSelfieUrl(selfieDoc.signedUrl || selfieDoc.fileUrl);
          if (companyDoc?.signedUrl || companyDoc?.fileUrl) setCompanyUrl(companyDoc.signedUrl || companyDoc.fileUrl);
        }
      }
    } catch (err: any) {
      if (classifyKycLoadError(err) === 'no_seller') {
        setNeedsOnboarding(true);
      }
      console.error('Error fetching seller KYC status:', err);
    }
  };

  useEffect(() => {
    loadKycStatus();
  }, []);

  const handleStartOnboarding = async () => {
    setIsOnboardingLoading(true);
    try {
      const res = await SellerService.onboard({
        companyName: fullName || profile?.fullName,
        phone,
      });
      if (res.success) {
        showToast('Perfil de vendedor ativado com sucesso! Você já pode enviar seus documentos de verificação.');
        await loadKycStatus();
      } else {
        showToast(res.message || 'Erro ao realizar onboarding.');
      }
    } catch (err: any) {
      showToast(err?.message || 'Erro de conexão ao ativar cadastro de vendedor.');
    } finally {
      setIsOnboardingLoading(false);
    }
  };

  const stepIcons: Record<KycStepKey, React.ElementType> = {
    account_type: User, person: Building, identity: FileText, address: FileText, business: FileText, payout: CreditCard, countries: Globe, selfie: Camera,
  };
  // pessoa física NÃO vê a etapa de registro empresarial; a numeração acompanha as etapas realmente exibidas
  const steps = kycStepsFor(accountType).map((s, i) => ({ ...s, num: i + 1, icon: stepIcons[s.key] }));
  const stepIdx = Math.max(0, steps.findIndex((s) => s.key === stepKey));

  // Validação local = mesmas regras do servidor (por tipo de conta e país). `liveIssues` é sempre o estado atual do formulário.
  const liveIssues = validateKycForm(
    {
      accountType, fullName, birthDate, taxId, phone, docType, docNumber,
      hasIdentityDocument: !!(docFile || docUrl), hasProofOfAddress: !!(addressFile || addressUrl), hasSelfie: !!(selfieFile || selfieUrl), hasBusinessLicense: !!(companyFile || companyUrl),
    },
    country,
  );
  const shownIssues: KycIssue[] = [
    ...liveIssues.filter((i) => attempted.includes(i.step)),
    ...serverIssues.filter((i) => !liveIssues.some((l) => l.field === i.field)),
  ];
  const errors = issuesByField(shownIssues);
  const liveFields = new Set(liveIssues.map((i) => i.field));
  const done: Partial<Record<KycFieldKey, boolean>> = {};
  for (const key of ['accountType', 'legalName', 'birthDate', 'taxId', 'phone', 'documentType', 'documentNumber', 'identityDocument', 'proofOfAddress', 'businessLicense', 'selfie'] as KycFieldKey[]) {
    done[key] = key === 'accountType' ? !!accountType : !!accountType && !liveFields.has(key);
  }
  const markAttempted = (keys: KycStepKey[]) => setAttempted((prev) => Array.from(new Set([...prev, ...keys])));

  const goToStep = (target: KycStepKey) => {
    const r = resolveStepTarget(stepKey, target, liveIssues, accountType);
    if (r.blocked) {
      markAttempted([r.step]);
      setFormMessage('Complete os campos obrigatórios desta etapa antes de continuar.');
      showToast('Complete os campos obrigatórios desta etapa antes de continuar.');
    } else {
      setFormMessage('');
    }
    setStepKey(r.step);
  };
  const goNext = () => { const nxt = steps[stepIdx + 1]; if (nxt) goToStep(nxt.key); };
  const goPrev = () => { const prv = steps[stepIdx - 1]; if (prv) { setFormMessage(''); setStepKey(prv.key); } };

  const toggleCountry = (code: string) => {
    setSelectedCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleCompleteKyc = async () => {
    setServerIssues([]);
    setFormMessage('');
    if (liveIssues.length > 0) {
      // nada é enviado com campo/documento obrigatório faltando: mostra tudo e leva à primeira etapa com problema
      markAttempted(steps.map((s) => s.key));
      const first = firstStepWithIssue(liveIssues, accountType);
      if (first) setStepKey(first);
      const msg = `Não foi possível enviar. ${summarizeKycIssues(liveIssues)}`;
      setFormMessage(msg);
      showToast(msg);
      return;
    }
    setIsSubmitting(true);
    try {
      showToast('Fazendo upload seguro dos documentos para o Cloudflare R2...');

      // cada arquivo novo é enviado UMA vez e o resultado fica guardado: se o servidor recusar, nada se perde nem se repete
      const upOnce = async (file: File | null, key: 'identity' | 'address' | 'company' | 'selfie', clear: () => void, setUrl: (u: string) => void): Promise<UploadResult | null> => {
        if (!file) return uploaded[key] ?? null;
        const r = await uploadService.uploadKyc(file);
        setUploaded((prev) => ({ ...prev, [key]: r }));
        setUrl(r.url);
        clear();
        return r;
      };
      const identityUpload = await upOnce(docFile, 'identity', () => setDocFile(null), setDocUrl);
      const addressUpload = await upOnce(addressFile, 'address', () => setAddressFile(null), setAddressUrl);
      // registro empresarial só existe para empresa: pessoa física nunca envia documento de empresa
      const companyUpload = accountType === 'empresa' ? await upOnce(companyFile, 'company', () => setCompanyFile(null), setCompanyUrl) : null;
      const selfieUpload = await upOnce(selfieFile, 'selfie', () => setSelfieFile(null), setSelfieUrl);

      const res = await SellerService.submitKyc({
        accountType,
        legalName: fullName || profile?.fullName,
        documentType: docType,
        documentNumber: docNumber,
        birthDate,
        taxId,
        phone,
        documentFrontUrl: identityUpload?.url || docUrl,
        proofOfAddressUrl: addressUpload?.url || addressUrl,
        selfieUrl: selfieUpload?.url || selfieUrl,
        businessLicenseUrl: accountType === 'empresa' ? companyUpload?.url || companyUrl : undefined,
        identityMetadata: identityUpload,
        addressMetadata: addressUpload,
        companyMetadata: accountType === 'empresa' ? companyUpload : undefined,
        selfieMetadata: selfieUpload,
        payoutMethod,
        payoutAccount,
        payoutHolder,
        selectedCountries,
      });

      if (res.success) {
        setSubmittedStatus('review');
        showToast('Documentos salvos e enviados para a equipe de compliance do Mercado Nusali! Seu perfil aparecerá no painel de administração para verificação.');
      } else {
        const failure = kycIssuesFromError({ response: { data: res } });
        setServerIssues(failure.issues);
        setFormMessage(failure.message);
        showToast(failure.message);
      }
    } catch (err: any) {
      console.error('Error submitting KYC:', err);
      // o servidor recusou (400 estruturado) ou houve falha de rede: os dados e os arquivos continuam na tela
      const failure = kycIssuesFromError(err);
      if (failure.issues.length > 0) {
        setServerIssues(failure.issues);
        markAttempted(failure.issues.map((i) => i.step));
        const first = firstStepWithIssue(failure.issues, accountType);
        if (first) setStepKey(first);
      }
      setFormMessage(failure.message);
      showToast(failure.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn">
      {needsOnboarding && (
        <div className="bg-amber-50 rounded-2xl border border-amber-200 p-6 space-y-3">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />
            <div>
              <h3 className="font-extrabold text-sm text-gray-900">Cadastro de Vendedor Não Inicializado</h3>
              <p className="text-xs text-gray-600">
                Sua conta está ativa, mas você ainda não concluiu o seu cadastro como Vendedor no banco de dados.
              </p>
            </div>
          </div>
          <button
            onClick={handleStartOnboarding}
            disabled={isOnboardingLoading}
            className="w-full sm:w-auto px-5 py-2.5 bg-purple-700 hover:bg-purple-800 text-white font-black text-xs rounded-xl transition flex items-center justify-center gap-2"
          >
            {isOnboardingLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Criando perfil de vendedor...
              </>
            ) : (
              'Concluir Onboarding de Vendedor'
            )}
          </button>
        </div>
      )}

      {/* Top Banner Status */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={`p-3 rounded-2xl shrink-0 ${
              submittedStatus === 'verified'
                ? 'bg-emerald-100 text-emerald-800'
                : submittedStatus === 'review'
                ? 'bg-amber-100 text-amber-800'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-gray-900">Verificação de Identidade & KYC</h1>
              <span
                className={`text-white text-[10px] font-black px-2.5 py-0.5 rounded-full ${
                  submittedStatus === 'verified'
                    ? 'bg-emerald-500'
                    : submittedStatus === 'review'
                    ? 'bg-amber-500'
                    : 'bg-gray-500'
                }`}
              >
                {submittedStatus === 'verified'
                  ? 'NÍVEL 3 - VENDEDOR GLOBAL'
                  : submittedStatus === 'review'
                  ? 'AGUARDANDO APROVAÇÃO DO ADMIN'
                  : notSubmitted
                  ? 'NENHUM DOCUMENTO ENVIADO'
                  : 'PENDENTE DE VERIFICAÇÃO'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {submittedStatus === 'verified'
                ? 'Sua conta está 100% verificada para vender e sacar em todas as moedas suportadas.'
                : submittedStatus === 'review'
                ? 'Seus documentos foram enviados para a fila de compliance e estão aguardando aprovação no Painel Admin.'
                : notSubmitted
                ? 'Seu cadastro de vendedor já existe. Falta enviar os documentos: preencha as etapas abaixo para solicitar a verificação.'
                : 'Preencha as etapas e envie seus documentos reais para análise e aprovação.'}
            </p>
          </div>
        </div>

        <span
          className={`text-xs font-bold px-3 py-1.5 rounded-xl border flex items-center gap-1 ${
            submittedStatus === 'verified'
              ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
              : submittedStatus === 'review'
              ? 'text-amber-700 bg-amber-50 border-amber-200'
              : 'text-gray-700 bg-gray-50 border-gray-200'
          }`}
        >
          {submittedStatus === 'verified' ? (
            <>
              <CheckCircle2 className="w-4 h-4" /> KYC Aprovado
            </>
          ) : submittedStatus === 'review' ? (
            <>
              <Clock className="w-4 h-4" /> Em Análise no Admin
            </>
          ) : (
            <>
              <AlertCircle className="w-4 h-4" /> Pendente
            </>
          )}
        </span>
      </div>

      {/* Rejection Banner */}
      {rejectionReason && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3 text-xs text-red-800 animate-fadeIn">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-extrabold text-red-900">Verificação anterior rejeitada pelo Administrador</h4>
            <p className="mt-0.5 font-bold">Motivo: {rejectionReason}</p>
            <p className="mt-1 text-red-700">Por favor, revise os campos, faça o upload dos novos documentos solicitados e reenvie para análise.</p>
          </div>
        </div>
      )}

      {/* Requisitos obrigatórios do tipo de conta e do país */}
      <KycRequirementsChecklist accountType={accountType} country={country} done={done} issues={shownIssues} />

      {/* Stepper Header */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs">
        <h2 className="text-sm font-bold text-gray-900 mb-4">Etapas do Processo de Verificação</h2>
        <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 ${steps.length > 7 ? 'lg:grid-cols-8' : 'lg:grid-cols-7'}`}>
          {steps.map((st, idx) => {
            const Icon = st.icon;
            const hasProblem = shownIssues.some((i) => i.step === st.key);
            const isCompleted = !hasProblem && idx < stepIdx;
            const isCurrent = st.key === stepKey;
            return (
              <button
                key={st.key}
                type="button"
                data-testid={`kyc-step-${st.key}`}
                data-problem={hasProblem ? 'true' : undefined}
                onClick={() => goToStep(st.key)}
                className={`p-2.5 rounded-xl text-center border transition flex flex-col items-center gap-1 cursor-pointer relative ${
                  hasProblem
                    ? 'bg-red-50 text-red-700 border-red-300 font-bold'
                    : isCurrent
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : isCompleted
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200 font-bold'
                    : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100 hover:text-gray-600'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-[10px] font-black leading-tight line-clamp-1">{st.title}</span>
                {st.optional && <span className="text-[9px] font-bold opacity-80">opcional</span>}
                {hasProblem && <span className="sr-only"> (com problema)</span>}
              </button>
            );
          })}
        </div>
      </div>

      {(shownIssues.length > 0 || formMessage) && (
        <div role="alert" data-testid="kyc-error-summary" className="bg-red-50 border border-red-200 rounded-2xl p-4 text-xs text-red-800 space-y-1.5">
          <p className="font-extrabold text-red-900">{formMessage || 'Corrija os itens abaixo para continuar.'}</p>
          {shownIssues.length > 0 && (
            <ul className="list-disc pl-5 space-y-0.5">
              {shownIssues.map((i) => (
                <li key={i.field}>
                  <button type="button" onClick={() => setStepKey(i.step)} className="font-bold underline underline-offset-2 cursor-pointer">{i.label}</button>: {i.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Current Step Interactive Body */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs space-y-6">
        {/* STEP 1: Tipo de Conta */}
        {stepKey === 'account_type' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-900">Etapa 1: Selecione o Tipo de Conta</h3>
            <p className="text-xs text-gray-500">Defina se sua conta operará como empresa (com NIF/CNPJ) ou pessoa física / autônomo. <strong>Os documentos exigidos dependem desta escolha.</strong><RequiredMark /></p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Option Empresa */}
              <div
                role="radio"
                aria-checked={accountType === 'empresa'}
                tabIndex={0}
                data-testid="kyc-type-empresa"
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAccountType('empresa'); } }}
                onClick={() => setAccountType('empresa')}
                className={`p-4 rounded-2xl border-2 transition cursor-pointer flex items-start gap-3 ${
                  accountType === 'empresa'
                    ? 'border-emerald-600 bg-emerald-50/60 shadow-xs'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <Building className={`w-6 h-6 shrink-0 mt-0.5 ${accountType === 'empresa' ? 'text-emerald-700' : 'text-gray-400'}`} />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-xs text-gray-900">Empresa / Sociedade Comercial</h4>
                    {accountType === 'empresa' && (
                      <span className="text-[10px] bg-emerald-700 text-white font-black px-2 py-0.5 rounded-md">
                        SELECIONADO
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-600 mt-1">
                    Ideal para lojas com NIF comercial, exportadoras de casanha/café e distribuidoras formais.
                  </p>
                </div>
              </div>

              {/* Option Pessoa Física */}
              <div
                role="radio"
                aria-checked={accountType === 'pf'}
                tabIndex={0}
                data-testid="kyc-type-pf"
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAccountType('pf'); } }}
                onClick={() => setAccountType('pf')}
                className={`p-4 rounded-2xl border-2 transition cursor-pointer flex items-start gap-3 ${
                  accountType === 'pf'
                    ? 'border-emerald-600 bg-emerald-50/60 shadow-xs'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <User className={`w-6 h-6 shrink-0 mt-0.5 ${accountType === 'pf' ? 'text-emerald-700' : 'text-gray-400'}`} />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-xs text-gray-900">Pessoa Física / Autônomo</h4>
                    {accountType === 'pf' && (
                      <span className="text-[10px] bg-emerald-700 text-white font-black px-2 py-0.5 rounded-md">
                        SELECIONADO
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-600 mt-1">
                    Para artesãos, pequenos produtores e vendedores individuais com BI/Passaporte. Não exige documentos de empresa.
                  </p>
                </div>
              </div>
            </div>
            <KycFieldError id="kyc-error-accountType" message={errors.accountType} />
          </div>
        )}

        {/* STEP 2: Responsável Legal */}
        {stepKey === 'person' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-900">Etapa {stepIdx + 1}: Dados do Responsável / Vendedor</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label htmlFor="kyc-legalName" className="block text-gray-700 font-bold mb-1">Nome Completo<RequiredMark /></label>
                <input
                  id="kyc-legalName"
                  type="text"
                  placeholder="Seu nome completo conforme documento"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  aria-invalid={!!errors.legalName || undefined}
                  aria-describedby={errors.legalName ? 'kyc-error-legalName' : undefined}
                  className={`w-full p-2.5 border rounded-xl font-bold bg-white ${errors.legalName ? 'border-red-400' : 'border-gray-300'}`}
                />
                <KycFieldError id="kyc-error-legalName" message={errors.legalName} />
              </div>
              <div>
                <label htmlFor="kyc-birthDate" className="block text-gray-700 font-bold mb-1">Data de Nascimento<RequiredMark /></label>
                <input
                  id="kyc-birthDate"
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  aria-invalid={!!errors.birthDate || undefined}
                  aria-describedby={errors.birthDate ? 'kyc-error-birthDate' : undefined}
                  className={`w-full p-2.5 border rounded-xl bg-white font-bold ${errors.birthDate ? 'border-red-400' : 'border-gray-300'}`}
                />
                <KycFieldError id="kyc-error-birthDate" message={errors.birthDate} />
              </div>
              <div>
                <label htmlFor="kyc-taxId" className="block text-gray-700 font-bold mb-1">
                  {accountType ? countryRules.taxIdLabel[accountType] : 'NIF / CPF / CNPJ'}<RequiredMark />
                </label>
                <input
                  id="kyc-taxId"
                  type="text"
                  placeholder={accountType ? countryRules.taxIdPlaceholder[accountType] : 'ex: NIF 123456789'}
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  aria-invalid={!!errors.taxId || undefined}
                  aria-describedby={errors.taxId ? 'kyc-error-taxId' : undefined}
                  className={`w-full p-2.5 border rounded-xl font-mono font-bold bg-white ${errors.taxId ? 'border-red-400' : 'border-gray-300'}`}
                />
                <KycFieldError id="kyc-error-taxId" message={errors.taxId} />
              </div>
              <div>
                <label htmlFor="kyc-phone" className="block text-gray-700 font-bold mb-1">Telefone de Contato<RequiredMark /></label>
                <input
                  id="kyc-phone"
                  type="text"
                  placeholder="+245 955000000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  aria-invalid={!!errors.phone || undefined}
                  aria-describedby={errors.phone ? 'kyc-error-phone' : undefined}
                  className={`w-full p-2.5 border rounded-xl font-bold bg-white ${errors.phone ? 'border-red-400' : 'border-gray-300'}`}
                />
                <KycFieldError id="kyc-error-phone" message={errors.phone} />
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Identidade */}
        {stepKey === 'identity' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-900">Etapa {stepIdx + 1}: Upload do Documento de Identidade</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label htmlFor="kyc-documentType" className="block text-gray-700 font-bold mb-1">Tipo de Documento<RequiredMark /></label>
                <select
                  id="kyc-documentType"
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  aria-invalid={!!errors.documentType || undefined}
                  aria-describedby={errors.documentType ? 'kyc-error-documentType' : undefined}
                  className={`w-full p-2.5 border rounded-xl bg-white font-bold ${errors.documentType ? 'border-red-400' : 'border-gray-300'}`}
                >
                  {/* tipos aceitos para o país do cadastro */}
                  {!countryRules.identityDocTypes.includes(docType) && <option value={docType}>Selecione...</option>}
                  {countryRules.identityDocTypes.map((t) => <option key={t} value={t}>{IDENTITY_DOC_LABELS[t] ?? t}</option>)}
                </select>
                <KycFieldError id="kyc-error-documentType" message={errors.documentType} />
              </div>

              <div>
                <label htmlFor="kyc-documentNumber" className="block text-gray-700 font-bold mb-1">Número do Documento<RequiredMark /></label>
                <input
                  id="kyc-documentNumber"
                  type="text"
                  placeholder="ex: P1234567"
                  value={docNumber}
                  onChange={(e) => setDocNumber(e.target.value)}
                  aria-invalid={!!errors.documentNumber || undefined}
                  aria-describedby={errors.documentNumber ? 'kyc-error-documentNumber' : undefined}
                  className={`w-full p-2.5 border rounded-xl font-mono font-bold bg-white ${errors.documentNumber ? 'border-red-400' : 'border-gray-300'}`}
                />
                <KycFieldError id="kyc-error-documentNumber" message={errors.documentNumber} />
              </div>
            </div>

            <div className={`p-6 border-2 border-dashed ${errors.identityDocument ? 'border-red-400 bg-red-50/40' : 'border-gray-300 bg-gray-50'} hover:border-emerald-500 hover:bg-emerald-50/20 rounded-2xl text-center space-y-2 transition relative`}>
              <Upload className="w-8 h-8 text-gray-400 mx-auto" />
              <p className="text-xs font-bold text-gray-800">
                <span className="sr-only">Documento de identidade (obrigatório). </span>
                {docFile
                  ? `Arquivo selecionado: ${docFile.name}`
                  : docUrl
                  ? '✓ Documento de Identidade já anexado no R2 (Clique para substituir)'
                  : 'Selecione a frente e verso do seu documento'}
              </p>
              <p className="text-[11px] text-gray-500">Formatos aceitos: PDF, JPG, PNG (máximo 10 MB)</p>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => e.target.files?.[0] && setDocFile(e.target.files[0])}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
            <KycFieldError id="kyc-error-identityDocument" message={errors.identityDocument} />
            {docUrl && !docFile && (
              <div className="flex justify-center">
                <a
                  href={docUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-extrabold bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-xl border border-emerald-200 transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Ver documento enviado no Cloudflare R2
                </a>
              </div>
            )}
          </div>
        )}

        {/* STEP 4: Comprovante de Residência */}
        {stepKey === 'address' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-900">Etapa {stepIdx + 1}: Comprovante de Residência</h3>
            <p className="text-xs text-gray-500">
              Envie uma conta recente (água, luz, telefone ou extrato bancário dos últimos 90 dias).
            </p>
            <div className={`p-6 border-2 border-dashed ${errors.proofOfAddress ? 'border-red-400 bg-red-50/40' : 'border-gray-300 bg-gray-50'} hover:border-emerald-500 hover:bg-emerald-50/20 rounded-2xl text-center space-y-2 transition relative`}>
              <Upload className="w-8 h-8 text-gray-400 mx-auto" />
              <p className="text-xs font-bold text-gray-800">
                <span className="sr-only">Comprovante de residência (obrigatório). </span>
                {addressFile
                  ? `Comprovante selecionado: ${addressFile.name}`
                  : addressUrl
                  ? '✓ Comprovante de Residência já anexado no R2 (Clique para substituir)'
                  : 'Clique para carregar o comprovante de residência'}
              </p>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => e.target.files?.[0] && setAddressFile(e.target.files[0])}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
            <KycFieldError id="kyc-error-proofOfAddress" message={errors.proofOfAddress} />
            {addressUrl && !addressFile && (
              <div className="flex justify-center">
                <a
                  href={addressUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-extrabold bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-xl border border-emerald-200 transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Ver comprovante enviado no Cloudflare R2
                </a>
              </div>
            )}
          </div>
        )}

        {/* STEP 5: Registro Empresarial / NIF */}
        {stepKey === 'business' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-900">Etapa {stepIdx + 1}: Registro Empresarial / NIF<RequiredMark /></h3>
            <p className="text-xs text-gray-500">
              Envie a Certidão Permanente / Registro Comercial da Empresa ou documento do NIF comercial. (Etapa exclusiva de Empresa / Sociedade Comercial.)
            </p>
            <div className={`p-6 border-2 border-dashed ${errors.businessLicense ? 'border-red-400 bg-red-50/40' : 'border-gray-300 bg-gray-50'} hover:border-emerald-500 hover:bg-emerald-50/20 rounded-2xl text-center space-y-2 transition relative`}>
              <Upload className="w-8 h-8 text-gray-400 mx-auto" />
              <p className="text-xs font-bold text-gray-800">
                <span className="sr-only">Registro empresarial (obrigatório). </span>
                {companyFile
                  ? `Documento NIF selecionado: ${companyFile.name}`
                  : companyUrl
                  ? '✓ Documento de NIF / Registro Comercial já anexado no R2 (Clique para substituir)'
                  : 'Clique para carregar o documento do NIF / Registro'}
              </p>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => e.target.files?.[0] && setCompanyFile(e.target.files[0])}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
            <KycFieldError id="kyc-error-businessLicense" message={errors.businessLicense} />
            {companyUrl && !companyFile && (
              <div className="flex justify-center">
                <a
                  href={companyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-extrabold bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-xl border border-emerald-200 transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Ver documento NIF enviado no Cloudflare R2
                </a>
              </div>
            )}
          </div>
        )}

        {/* STEP 6: Conta de Saque */}
        {stepKey === 'payout' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-900">Etapa {stepIdx + 1}: Conta para Recebimento de Saque <span className="text-gray-400 font-medium">(opcional)</span></h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-gray-700 font-bold mb-1">Método Preferencial</label>
                <select
                  value={payoutMethod}
                  onChange={(e) => setPayoutMethod(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl bg-white font-bold"
                >
                  <option value="orange_money">Orange Money Guiné-Bissau</option>
                  <option value="mtn">MTN Mobile Money</option>
                  <option value="pix">PIX Brasil (Chave CPF/E-mail)</option>
                  <option value="bank_transfer">Transferência Bancária (BAO / IBAN)</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-700 font-bold mb-1">Chave / Telefone / IBAN</label>
                <input
                  type="text"
                  placeholder="ex: +245 955000000 ou IBAN GW66..."
                  value={payoutAccount}
                  onChange={(e) => setPayoutAccount(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-mono font-bold bg-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-gray-700 font-bold mb-1">Nome do Titular da Conta</label>
                <input
                  type="text"
                  value={payoutHolder}
                  onChange={(e) => setPayoutHolder(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold bg-white"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 7: Países Atendidos */}
        {stepKey === 'countries' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-900">Etapa {stepIdx + 1}: Seleção de Países de Entrega <span className="text-gray-400 font-medium">(opcional)</span></h3>
            <p className="text-xs text-gray-500">Marque quais países você tem capacidade logística para enviar produtos.</p>

            {countriesLoading && (
              <div className="p-4 text-center text-xs text-gray-500 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando países operacionais...
              </div>
            )}

            {!countriesLoading && countriesError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Não foi possível carregar a lista de países operacionais. Tente novamente em instantes.
              </div>
            )}

            {!countriesLoading && !countriesError && (!operationalCountries || operationalCountries.length === 0) && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                Nenhum país operacional disponível no momento.
              </div>
            )}

            {!countriesLoading && !countriesError && operationalCountries && operationalCountries.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                {operationalCountries.map((c) => {
                  const isSelected = selectedCountries.includes(c.code);
                  return (
                    <button
                      type="button"
                      key={c.code}
                      onClick={() => toggleCountry(c.code)}
                      className={`p-3 rounded-xl border flex items-center justify-between font-bold transition cursor-pointer ${
                        isSelected ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-gray-200 bg-white text-gray-700'
                      }`}
                    >
                      <span>{c.flag} {c.name}</span>
                      {isSelected && <Check className="w-4 h-4 text-emerald-600" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* STEP 8: Selfie */}
        {stepKey === 'selfie' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-900">Etapa {stepIdx + 1}: Selfie com Documento em Mãos</h3>
            <p className="text-xs text-gray-500">
              Tire uma foto segurando o seu documento de identidade visível ao lado do seu rosto para confirmação de titularidade.
            </p>
            <div className={`p-6 border-2 border-dashed ${errors.selfie ? 'border-red-400 bg-red-50/40' : 'border-gray-300 bg-gray-50'} hover:border-emerald-500 hover:bg-emerald-50/20 rounded-2xl text-center space-y-2 transition relative`}>
              <Camera className="w-8 h-8 text-gray-400 mx-auto" />
              <p className="text-xs font-bold text-gray-800">
                <span className="sr-only">Selfie com o documento (obrigatório). </span>
                {selfieFile
                  ? `Selfie selecionada: ${selfieFile.name}`
                  : selfieUrl
                  ? '✓ Selfie com Documento já anexada no R2 (Clique para substituir)'
                  : 'Clique para carregar a selfie com o documento'}
              </p>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && setSelfieFile(e.target.files[0])}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
            <KycFieldError id="kyc-error-selfie" message={errors.selfie} />
            {selfieUrl && !selfieFile && (
              <div className="flex justify-center">
                <a
                  href={selfieUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-extrabold bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-xl border border-emerald-200 transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Ver selfie enviada no Cloudflare R2
                </a>
              </div>
            )}
          </div>
        )}

        {/* Stepper Navigation Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
          <button
            type="button"
            disabled={stepIdx === 0 || isSubmitting}
            onClick={goPrev}
            className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-700 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" /> Anterior
          </button>

          {stepIdx < steps.length - 1 ? (
            <button
              type="button"
              data-testid="kyc-next"
              disabled={isSubmitting}
              onClick={goNext}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1 shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              Próxima Etapa <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              data-testid="kyc-submit"
              disabled={isSubmitting}
              onClick={handleCompleteKyc}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs flex items-center gap-2 shadow-md transition cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Enviando para R2...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" /> Enviar Documentos para Análise
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
