import React, { useState } from 'react';
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
} from 'lucide-react';
import { SellerProfileData } from '../../data/mockSellerData';

interface SellerKycProps {
  profile: SellerProfileData;
  showToast: (msg: string) => void;
  onNavigateSection: (sec: any) => void;
}

export const SellerKyc: React.FC<SellerKycProps> = ({ profile, showToast, onNavigateSection }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [docType, setDocType] = useState('passport');
  const [docNumber, setDocNumber] = useState('GW-98214-02');
  const [addressProofFile, setAddressProofFile] = useState('comprovante_fatura_agua_bissau.pdf');
  const [companyDocFile, setCompanyDocFile] = useState('certidao_nif_comercial_gw.pdf');
  const [selfieUploaded, setSelfieUploaded] = useState(true);
  const [submittedStatus, setSubmittedStatus] = useState<'verified' | 'review'>(
    profile.kycStatus === 'verified' ? 'verified' : 'verified'
  );

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

  const handleCompleteKyc = () => {
    setSubmittedStatus('verified');
    showToast('Submissão KYC enviada e APROVADA no nível 3!');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn">
      {/* Top Banner Status */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-100 text-emerald-800 rounded-2xl shrink-0">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-gray-900">Verificação de Identidade & KYC</h1>
              <span className="bg-emerald-500 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full">
                NÍVEL 3 - VENDEDOR GLOBAL
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Sua conta está 100% verificada para vender e sacar em Franco CFA (XOF), Euro (EUR), Real (BRL) e Dólar (USD).
            </p>
          </div>
        </div>

        <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 flex items-center gap-1">
          <CheckCircle2 className="w-4 h-4" /> KYC Aprovado
        </span>
      </div>

      {/* Stepper Header */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs">
        <h2 className="text-sm font-bold text-gray-900 mb-4">Etapas do Processo de Verificação</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {steps.map((s) => {
            const Icon = s.icon;
            const isCompleted = s.num <= currentStep;
            const isCurrent = s.num === currentStep;
            return (
              <button
                key={s.num}
                onClick={() => setCurrentStep(s.num)}
                className={`p-2.5 rounded-xl text-center border transition flex flex-col items-center gap-1 ${
                  isCurrent
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : isCompleted
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200 font-bold'
                    : 'bg-gray-50 text-gray-400 border-gray-200'
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
        {currentStep === 1 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-900">Etapa 1: Selecione o Tipo de Conta</h3>
            <p className="text-xs text-gray-500">Defina se sua conta operará como pessoa física ou empresa com NIF/CNPJ.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl border-2 border-emerald-600 bg-emerald-50/50 flex items-start gap-3">
                <Building className="w-6 h-6 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-xs text-gray-900">Empresa / Sociedade Comercial</h4>
                  <p className="text-[11px] text-gray-600 mt-1">
                    Ideal para lojas com NIF comercial, exportadoras de casanha/café e distribuidoras formais.
                  </p>
                  <span className="inline-block text-[10px] bg-emerald-700 text-white font-black px-2 py-0.5 rounded-md mt-2">
                    SELECIONADO
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-2xl border border-gray-200 hover:border-gray-300 flex items-start gap-3 cursor-pointer">
                <User className="w-6 h-6 text-gray-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-xs text-gray-900">Pessoa Física / Autônomo</h4>
                  <p className="text-[11px] text-gray-600 mt-1">
                    Para artesãos, pequenos produtores e vendedores individuais com BI/Passaporte.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-900">Etapa 2: Dados do Responsável Legal</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-gray-700 font-bold mb-1">Nome Completo</label>
                <input
                  type="text"
                  value={profile.fullName}
                  readOnly
                  className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-xl font-bold"
                />
              </div>
              <div>
                <label className="block text-gray-700 font-bold mb-1">Data de Nascimento</label>
                <input
                  type="text"
                  value="12/08/1988"
                  readOnly
                  className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-xl"
                />
              </div>
            </div>
          </div>
        )}

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

                  <option value="bi">Bilhete de Identidade (BI) Guiné-Bissau / Portugal</option>
                  <option value="cni">CNI / CNH Brasil</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-700 font-bold mb-1">Número do Documento</label>
                <input
                  type="text"
                  value={docNumber}
                  onChange={(e) => setDocNumber(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-mono font-bold"
                />
              </div>
            </div>

            <div className="p-4 border-2 border-dashed border-emerald-300 bg-emerald-50/30 rounded-2xl text-center space-y-2">
              <Upload className="w-8 h-8 text-emerald-700 mx-auto" />
              <p className="text-xs font-bold text-gray-800">Frente e Verso do Documento Carregados</p>
              <span className="text-[11px] text-emerald-700 font-bold flex items-center justify-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Arquivo validado: passaporte_alex_silva_gw.pdf (2.4 MB)
              </span>
            </div>
          </div>
        )}

        {currentStep >= 4 && (
          <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs text-emerald-900 space-y-2">
            <div className="flex items-center gap-2 font-bold text-emerald-800">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" /> Etapa {currentStep} Verificada e Validada!
            </div>
            <p className="text-gray-600">
              Todos os documentos fornecidos para residência, NIF, contas e selfie de validação facial foram analisados e aprovados automaticamente pela inteligência antifraude do Mercado Nusali.
            </p>
          </div>
        )}

        {/* Stepper Navigation Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
          <button
            disabled={currentStep === 1}
            onClick={() => setCurrentStep(currentStep - 1)}
            className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-700 disabled:opacity-40 flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" /> Anterior
          </button>

          {currentStep < 8 ? (
            <button
              onClick={() => setCurrentStep(currentStep + 1)}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1 shadow-xs transition"
            >
              Próxima Etapa <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleCompleteKyc}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs flex items-center gap-1 shadow-md transition"
            >
              <ShieldCheck className="w-4 h-4" /> Concluir & Confirmar KYC
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
