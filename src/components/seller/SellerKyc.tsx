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

interface SellerKycProps {
  profile: SellerProfileData;
  showToast: (msg: string) => void;
  onNavigateSection: (sec: any) => void;
}

export const SellerKyc: React.FC<SellerKycProps> = ({ profile, showToast, onNavigateSection }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [accountType, setAccountType] = useState<'empresa' | 'pf'>('empresa');

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
  const [isOnboardingLoading, setIsOnboardingLoading] = useState(false);

  const loadKycStatus = async () => {
    try {
      const res = await SellerService.getKyc();
      if (res.error?.code === 'SELLER_PROFILE_NOT_FOUND' || (res.success && res.data === null)) {
        setNeedsOnboarding(true);
        return;
      }
      setNeedsOnboarding(false);

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
      if (err?.response?.data?.error?.code === 'SELLER_PROFILE_NOT_FOUND') {
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

  const steps = [
    { num: 1, title: 'Tipo de Conta', icon: User },
    { num: 2, title: 'Responsável Legal', icon: Building },
    { num: 3, title: 'Identidade (BI/Passaporte)', icon: FileText },
    { num: 4, title: 'Comprovante de Residência', icon: FileText },
    { num: 5, title: 'Registro Empresarial / NIF', icon: FileText },
    { num: 6, title: 'Conta de Saque', icon: CreditCard },
    { num: 7, title: 'Países Atendidos', icon: Globe },
    { num: 8, title: 'Selfie de Validação', icon: Camera },
  ];

  const toggleCountry = (code: string) => {
    setSelectedCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleCompleteKyc = async () => {
    setIsSubmitting(true);
    try {
      showToast('Fazendo upload seguro dos documentos para o Cloudflare R2...');

      const identityUpload = docFile ? await uploadService.uploadKyc(docFile) : null;
      const addressUpload = addressFile ? await uploadService.uploadKyc(addressFile) : null;
      const companyUpload = companyFile ? await uploadService.uploadKyc(companyFile) : null;
      const selfieUpload = selfieFile ? await uploadService.uploadKyc(selfieFile) : null;

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
        businessLicenseUrl: companyUpload?.url || companyUrl,
        identityMetadata: identityUpload,
        addressMetadata: addressUpload,
        companyMetadata: companyUpload,
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
        showToast(res.message || 'Erro ao submeter documentos KYC. Tente novamente.');
      }
    } catch (err: any) {
      console.error('Error submitting KYC:', err);
      showToast(err?.message || 'Erro de conexão ao enviar documentos para o Cloudflare R2.');
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
                  : 'PENDENTE DE VERIFICAÇÃO'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {submittedStatus === 'verified'
                ? 'Sua conta está 100% verificada para vender e sacar em todas as moedas suportadas.'
                : submittedStatus === 'review'
                ? 'Seus documentos foram enviados para a fila de compliance e estão aguardando aprovação no Painel Admin.'
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

      {/* Stepper Header */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs">
        <h2 className="text-sm font-bold text-gray-900 mb-4">Etapas do Processo de Verificação</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {steps.map((s) => {
            const Icon = s.icon;
            const isCompleted = s.num < currentStep || (s.num === currentStep && submittedStatus === 'review');
            const isCurrent = s.num === currentStep;
            return (
              <button
                key={s.num}
                onClick={() => setCurrentStep(s.num)}
                className={`p-2.5 rounded-xl text-center border transition flex flex-col items-center gap-1 cursor-pointer ${
                  isCurrent
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : isCompleted
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200 font-bold'
                    : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100 hover:text-gray-600'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-[10px] font-black leading-tight line-clamp-1">{s.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Current Step Interactive Body */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs space-y-6">
        {/* STEP 1: Tipo de Conta */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-900">Etapa 1: Selecione o Tipo de Conta</h3>
            <p className="text-xs text-gray-500">Defina se sua conta operará como empresa (com NIF/CNPJ) ou pessoa física / autônomo.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Option Empresa */}
              <div
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
                    Para artesãos, pequenos produtores e vendedores individuais com BI/Passaporte.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Responsável Legal */}
        {currentStep === 2 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-900">Etapa 2: Dados do Responsável / Vendedor</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-gray-700 font-bold mb-1">Nome Completo</label>
                <input
                  type="text"
                  placeholder="Seu nome completo conforme documento"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold bg-white"
                />
              </div>
              <div>
                <label className="block text-gray-700 font-bold mb-1">Data de Nascimento</label>
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl bg-white font-bold"
                />
              </div>
              <div>
                <label className="block text-gray-700 font-bold mb-1">
                  {profile?.country === 'BR'
                    ? (accountType === 'empresa' ? 'CNPJ Comercial' : 'CPF Pessoal')
                    : profile?.country === 'GW'
                    ? (accountType === 'empresa' ? 'NIF Comercial' : 'NIF / BI Pessoal')
                    : profile?.country === 'PT'
                    ? (accountType === 'empresa' ? 'NIPC / NIF Comercial' : 'NIF Pessoal')
                    : (accountType === 'empresa' ? 'NIF Comercial / Tax ID' : 'NIF Pessoal / Tax ID')}
                </label>
                <input
                  type="text"
                  placeholder="ex: NIF 123456789"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-mono font-bold bg-white"
                />
              </div>
              <div>
                <label className="block text-gray-700 font-bold mb-1">Telefone de Contato</label>
                <input
                  type="text"
                  placeholder="+245 955000000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold bg-white"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Identidade */}
        {currentStep === 3 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-900">Etapa 3: Upload do Documento de Identidade</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-gray-700 font-bold mb-1">Tipo de Documento</label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl bg-white font-bold"
                >
                  <option value="passport">Passaporte Internacional</option>
                  <option value="bi">Bilhete de Identidade (BI)</option>
                  <option value="cni">CNI / CNH Nacional</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-700 font-bold mb-1">Número do Documento</label>
                <input
                  type="text"
                  placeholder="ex: P1234567"
                  value={docNumber}
                  onChange={(e) => setDocNumber(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-mono font-bold bg-white"
                />
              </div>
            </div>

            <div className="p-6 border-2 border-dashed border-gray-300 hover:border-emerald-500 bg-gray-50 hover:bg-emerald-50/20 rounded-2xl text-center space-y-2 transition relative">
              <Upload className="w-8 h-8 text-gray-400 mx-auto" />
              <p className="text-xs font-bold text-gray-800">
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
        {currentStep === 4 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-900">Etapa 4: Comprovante de Residência</h3>
            <p className="text-xs text-gray-500">
              Envie uma conta recente (água, luz, telefone ou extrato bancário dos últimos 90 dias).
            </p>
            <div className="p-6 border-2 border-dashed border-gray-300 hover:border-emerald-500 bg-gray-50 hover:bg-emerald-50/20 rounded-2xl text-center space-y-2 transition relative">
              <Upload className="w-8 h-8 text-gray-400 mx-auto" />
              <p className="text-xs font-bold text-gray-800">
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
        {currentStep === 5 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-900">Etapa 5: Registro Empresarial / NIF</h3>
            <p className="text-xs text-gray-500">
              {accountType === 'empresa'
                ? 'Envie a Certidão Permanente / Registro Comercial da Empresa ou documento do NIF comercial.'
                : 'Para Pessoa Física, envie o comprovante do seu NIF pessoal ou cadastro de atividade.'}
            </p>
            <div className="p-6 border-2 border-dashed border-gray-300 hover:border-emerald-500 bg-gray-50 hover:bg-emerald-50/20 rounded-2xl text-center space-y-2 transition relative">
              <Upload className="w-8 h-8 text-gray-400 mx-auto" />
              <p className="text-xs font-bold text-gray-800">
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
        {currentStep === 6 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-900">Etapa 6: Conta para Recebimento de Saque</h3>
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
        {currentStep === 7 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-900">Etapa 7: Seleção de Países de Entrega</h3>
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
        {currentStep === 8 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-900">Etapa 8: Selfie com Documento em Mãos</h3>
            <p className="text-xs text-gray-500">
              Tire uma foto segurando o seu documento de identidade visível ao lado do seu rosto para confirmação de titularidade.
            </p>
            <div className="p-6 border-2 border-dashed border-gray-300 hover:border-emerald-500 bg-gray-50 hover:bg-emerald-50/20 rounded-2xl text-center space-y-2 transition relative">
              <Camera className="w-8 h-8 text-gray-400 mx-auto" />
              <p className="text-xs font-bold text-gray-800">
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
            disabled={currentStep === 1 || isSubmitting}
            onClick={() => setCurrentStep(currentStep - 1)}
            className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-700 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" /> Anterior
          </button>

          {currentStep < 8 ? (
            <button
              disabled={isSubmitting}
              onClick={() => setCurrentStep(currentStep + 1)}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1 shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              Próxima Etapa <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
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
