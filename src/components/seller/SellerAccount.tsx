import React, { useEffect, useRef, useState } from 'react';
import {
  UserCheck,
  Building2,
  FileText,
  CreditCard,
  MapPin,
  Globe,
  Phone,
  Mail,
  Lock,
  BadgeCheck,
  ShieldCheck,
  CheckCircle2,
  PlusCircle,
  Save,
} from 'lucide-react';
import { SellerProfileData } from '../../data/mockSellerData';
import { CountryCode, CurrencyCode } from '../../types';
import { countriesConfig } from '../../utils/currencyUtils';
import { useCountries } from '../../hooks/useCountries';
import { useAuth } from '../../context/AuthContext';
import { uploadService } from '../../services/uploadService';
import { BuyerService } from '../../services/buyerService';
import { SellerService } from '../../services/sellerService';
import {
  pickAccountPatch, pickFiscalPatch, saveSellerAccountDetails, validateAccountPatch, validateFiscalPatch,
  type AccountField, type ReverificationPrompt,
} from '../../utils/sellerAccountRules';
import { UserAvatar } from '../UserAvatar';
import { AvatarUploadField } from '../AvatarUploadField';
import { resolveAvatarUrl } from '../../utils/avatar';

interface SellerAccountProps {
  profile: SellerProfileData & { avatar?: string };
  onUpdateProfile: (p: any) => void;
  showToast: (msg: string) => void;
  onNavigateSection: (sec: any) => void;
}

export const SellerAccount: React.FC<SellerAccountProps> = ({
  profile,
  onUpdateProfile,
  showToast,
  onNavigateSection,
}) => {
  const [fullName, setFullName] = useState(profile.fullName);
  const [commercialName, setCommercialName] = useState(profile.commercialName);
  const [sellerType, setSellerType] = useState(profile.sellerType);
  const [taxId, setTaxId] = useState(profile.taxId);
  const [country, setCountry] = useState<CountryCode>(profile.country);
  const { data: operationalCountries, isLoading: countriesLoading, isError: countriesError } = useCountries();
  const [city, setCity] = useState(profile.city);
  const [address, setAddress] = useState(profile.address);
  const [phone, setPhone] = useState(profile.phone);
  const [email, setEmail] = useState(profile.email);
  const [preferredCurrency, setPreferredCurrency] = useState<CurrencyCode>(profile.preferredCurrency);
  // Foto: a mesma da conta (users.avatar_url), só arquivo do dispositivo; sem foto, iniciais do nome.
  const { user, updateUser } = useAuth();
  const initialAvatar = resolveAvatarUrl((profile as any).avatar || user?.avatar) || '';
  const [avatar, setAvatar] = useState(initialAvatar);
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  // O perfil pode chegar do servidor DEPOIS de a tela abrir (F5 direto nesta aba, recarga ao entrar): os campos seguem o que o banco
  // devolveu, a não ser que a pessoa já tenha começado a digitar neles (o que ela digitou nunca é apagado por uma recarga).
  const dirty = useRef<Record<string, boolean>>({});
  useEffect(() => {
    const d = dirty.current;
    if (!d.fullName) setFullName(profile.fullName ?? '');
    if (!d.commercialName) setCommercialName(profile.commercialName ?? '');
    if (!d.sellerType) setSellerType(profile.sellerType);
    if (!d.taxId) setTaxId(profile.taxId ?? '');
    if (!d.country) setCountry(profile.country);
    if (!d.city) setCity(profile.city ?? '');
    if (!d.address) setAddress(profile.address ?? '');
    if (!d.phone) setPhone(profile.phone ?? '');
    if (!d.email) setEmail(profile.email ?? '');
    if (!d.preferredCurrency) setPreferredCurrency(profile.preferredCurrency);
  }, [profile.fullName, profile.commercialName, profile.sellerType, profile.taxId, profile.country, profile.city, profile.address, profile.phone, profile.email, profile.preferredCurrency]);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<AccountField, string>>>({});
  const [reverifyPrompt, setReverifyPrompt] = useState<ReverificationPrompt | null>(null);
  const rv = (profile as any).kycReverification as { required?: boolean; changes?: Array<{ label?: string }> } | null | undefined;
  const reverificationPending = rv?.required === true;
  const reverificationLabels = (rv?.changes ?? []).map((c) => c.label).filter(Boolean).join(', ');

  /** edita um campo: marca como digitado (a recarga não o sobrescreve) e limpa o erro dele */
  const edit = (key: string, setter: (v: any) => void, value: string) => {
    dirty.current[key] = true;
    setter(value);
    setReverifyPrompt(null);
    setFieldErrors((prev) => (prev[key as AccountField] ? { ...prev, [key]: undefined } : prev));
  };
  const inputCls = (f: AccountField) => `w-full p-2.5 border rounded-xl focus:border-emerald-600 focus:outline-hidden ${fieldErrors[f] ? 'border-red-400' : 'border-gray-300'}`;
  const fieldError = (f: AccountField) => fieldErrors[f]
    ? <p id={`seller-account-${f}-error`} role="alert" data-testid={`seller-account-${f}-error`} className="mt-1 text-[11px] font-bold text-red-600">{fieldErrors[f]}</p>
    : null;

  // moedas oferecidas: as dos países ativos (as mesmas aceitas para saque); a moeda já escolhida nunca some da lista
  const CURRENCY_LABELS: Record<string, string> = {
    XOF: 'XOF - Franco CFA (África Ocidental)', EUR: 'EUR - Euro (Europa / Portugal)', BRL: 'BRL - Real (Brasil)', USD: 'USD - Dólar Norte-Americano',
  };
  const currencyOptions = Array.from(new Set<string>([
    ...(operationalCountries && operationalCountries.length > 0 ? operationalCountries.map((c) => String(c.currency).toUpperCase()) : ['XOF', 'EUR', 'BRL', 'USD']),
    ...(preferredCurrency ? [String(preferredCurrency)] : []),
  ]));

  // O arquivo já chega validado (tipo e tamanho) pelo AvatarUploadField; o servidor valida de novo.
  const handleAvatarFile = async (file: File) => {
    setAvatarError(null);
    setAvatarBusy(true);
    try {
      const uploaded = await uploadService.uploadProfile(file);
      setAvatar(uploaded.url);
      setAvatarChanged(true);
      updateUser({ avatar: uploaded.url });
      showToast('Foto carregada! Clique em "Salvar Alterações" para confirmar.');
    } catch (err: any) {
      const message = err?.response?.data?.error?.message || 'Não foi possível enviar a foto. Tente outra imagem (JPG, PNG ou WEBP, até 5 MB).';
      setAvatarError(message);
      showToast(message);
    } finally {
      setAvatarBusy(false);
    }
  };

  const submitAccount = async (confirmReverification: boolean) => {
    if (saving) return;
    setFieldErrors({});

    // mesma validação do servidor; o que já estava guardado e não mudou não é revalidado
    const typed = { fullName, sellerType, country, email, preferredCurrency, taxId, city, address };
    const problems: Array<{ field: AccountField; message: string }> = [
      ...validateAccountPatch(pickAccountPatch(typed), typed, {
        current: { fullName: profile.fullName, sellerType: profile.sellerType, country: profile.country, email: profile.email, preferredCurrency: profile.preferredCurrency },
        activeCountries: operationalCountries && operationalCountries.length > 0 ? operationalCountries.map((c) => c.code.toUpperCase()) : undefined,
        supportedCurrencies: operationalCountries && operationalCountries.length > 0 ? Array.from(new Set(operationalCountries.map((c) => String(c.currency).toUpperCase()))) : undefined,
      }),
      ...validateFiscalPatch(pickFiscalPatch(typed), typed, {
        country,
        current: { taxId: profile.taxId, city: profile.city, address: profile.address },
      }),
    ];
    if (problems.length > 0) {
      const errs: Partial<Record<AccountField, string>> = {};
      for (const pr of problems) if (!errs[pr.field]) errs[pr.field] = pr.message;
      setFieldErrors(errs);
      showToast(problems[0].message);
      return;
    }

    setSaving(true);
    // só dá como salvo quando o servidor confirma; o que ele devolve é o que ficou gravado. O titular (fullName) NÃO é o nome
    // comercial (tradingName) nem a razão social: cada um segue o seu caminho.
    const result = await saveSellerAccountDetails(
      {
        fullName, tradingName: commercialName, phone, sellerType, country, email, preferredCurrency, taxId, city, address,
        ...(confirmReverification ? { confirmReverification: true } : {}),
      },
      (payload) => SellerService.updateProfile(payload),
    );
    setSaving(false);
    if (!result.ok) {
      if (result.reverification) {
        // o servidor não gravou nada: pede confirmação explícita antes de mandar o KYC para reverificação
        setReverifyPrompt(result.reverification);
        showToast(result.message);
        return;
      }
      setReverifyPrompt(null);
      setFieldErrors(result.fields);
      showToast(result.message);
      return;
    }
    setReverifyPrompt(null);
    const saved = result.saved;
    const next = {
      fullName: saved.fullName ?? fullName,
      commercialName: saved.commercialName ?? commercialName,
      sellerType: (saved.sellerType ?? sellerType) as any,
      taxId: saved.taxId ?? taxId,
      country: (saved.country ?? country) as CountryCode,
      city: saved.city ?? city,
      address: saved.address ?? address,
      phone: saved.phone ?? phone,
      email: saved.email ?? email,
      preferredCurrency: (saved.preferredCurrency ?? preferredCurrency) as CurrencyCode,
    };
    dirty.current = {}; // o que está na tela agora é o que o servidor gravou
    setFullName(next.fullName);
    setCommercialName(next.commercialName);
    setSellerType(next.sellerType);
    setTaxId(next.taxId);
    setCountry(next.country);
    setCity(next.city);
    setAddress(next.address);
    setPhone(next.phone);
    setEmail(next.email);
    setPreferredCurrency(next.preferredCurrency);
    if (saved.fullName) updateUser({ name: saved.fullName }); // cabeçalho e iniciais seguem o nome do titular

    let avatarFailed = false;
    if (avatarChanged && avatar) {
      try {
        await BuyerService.updateProfile({ avatar });
        setAvatarChanged(false);
      } catch {
        avatarFailed = true;
        setAvatarError('A foto foi enviada, mas não foi possível gravá-la na conta agora. Tente salvar de novo.');
      }
    }
    onUpdateProfile({
      ...profile,
      ...next,
      avatar,
      kycStatus: result.kycReverification ? 'pending' : profile.kycStatus,
      kycReverification: result.kycReverification ?? null,
    });
    showToast(result.kycReverification
      ? 'Dados salvos. A verificação (KYC) voltou para análise: reenvie os documentos na seção KYC.'
      : avatarFailed
        ? 'Dados da conta salvos. A foto não foi gravada: tente salvar de novo.'
        : 'Dados da conta de vendedor salvos com sucesso!');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    return submitAccount(false);
  };

  const countryConf = countriesConfig[country] || countriesConfig.GW;

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fadeIn">
      {/* Top Banner Status Card */}
      <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-emerald-950 text-white rounded-2xl p-6 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          {/* foto real ou, sem foto, iniciais do nome (acompanham o nome enquanto ele é editado) */}
          <UserAvatar name={fullName} src={avatar} className="w-16 h-16 text-2xl border-2 border-white/20 shadow-md" />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-black">{commercialName}</h1>
              {profile.kycStatus === 'verified' ? (
                <span data-testid="seller-account-kyc-badge" className="bg-emerald-500 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <BadgeCheck className="w-3.5 h-3.5" /> VERIFICADO
                </span>
              ) : (
                <span data-testid="seller-account-kyc-badge" className="bg-amber-500 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> {reverificationPending ? 'REVERIFICAÇÃO PENDENTE' : 'VERIFICAÇÃO PENDENTE'}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-300 mt-1 font-mono">
              Titular: {fullName} • {taxId}
            </p>
            <span className="text-[11px] text-yellow-300 font-bold block mt-1">
              {profile.kycLevel}{profile.kycStatus === 'verified' && profile.verificationDate ? ` (Aprovado em ${profile.verificationDate})` : ''}
            </span>
          </div>
        </div>

        <button
          onClick={() => onNavigateSection('kyc')}
          className="bg-white/10 hover:bg-white/20 text-white border border-white/30 font-bold px-4 py-2 rounded-xl text-xs transition backdrop-blur-xs flex items-center gap-2 shrink-0 cursor-pointer"
        >
          <ShieldCheck className="w-4 h-4 text-yellow-300" /> Ver Documentos KYC
        </button>
      </div>

      {reverificationPending && (
        <div role="status" data-testid="seller-account-reverification-notice" className="bg-amber-50 border border-amber-300 text-amber-900 rounded-2xl p-4 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p><strong>Reverificação de identidade necessária.</strong> Você alterou {reverificationLabels || 'dados de identidade'} depois da verificação. Reenvie os documentos na seção KYC para uma nova análise; os novos dados não são aprovados automaticamente.</p>
          <button type="button" onClick={() => onNavigateSection('kyc')} className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2 rounded-xl shrink-0 cursor-pointer">Ir para o KYC</button>
        </div>
      )}

      {reverifyPrompt && (
        <div role="alertdialog" aria-label="Confirmar reverificação" data-testid="seller-account-reverify-confirm" className="bg-red-50 border border-red-300 text-red-900 rounded-2xl p-4 text-xs space-y-3">
          <p><strong>Esta alteração exige nova verificação (KYC).</strong> {reverifyPrompt.changes.length > 0 ? `Dados que mudam: ${reverifyPrompt.changes.map((c) => c.label).join(', ')}. ` : ''}Ao confirmar, o status de verificação volta para análise e você precisará reenviar os documentos. O histórico da verificação anterior é preservado.</p>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" disabled={saving} data-testid="seller-account-reverify-confirm-button" onClick={() => submitAccount(true)} className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-bold px-4 py-2 rounded-xl cursor-pointer">Confirmar e enviar para reverificação</button>
            <button type="button" disabled={saving} onClick={() => setReverifyPrompt(null)} className="bg-white border border-gray-300 text-gray-800 font-bold px-4 py-2 rounded-xl cursor-pointer">Cancelar alteração</button>
          </div>
        </div>
      )}

      {/* Account Profile Form */}
      <form onSubmit={handleSave} className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs space-y-6">
        <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-emerald-700" /> Dados Cadastrais & Fiscais do Vendedor
          </h2>
          <span className="text-xs text-gray-400">Atualizado para operações transfronteiriças</span>
        </div>

        {/* Foto de perfil: só "Carregar Foto" (arquivo do dispositivo); sem foto, iniciais do nome */}
        <AvatarUploadField id="seller-avatar" name={fullName} src={avatar} busy={avatarBusy} error={avatarError} onFile={handleAvatarFile} onInvalid={setAvatarError} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-medium">
          <div>
            <label className="block text-gray-700 font-bold mb-1">Nome Completo do Titular *</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => edit('fullName', setFullName, e.target.value)}
              required
              aria-invalid={!!fieldErrors.fullName}
              className={inputCls('fullName')}
            />
            {fieldError('fullName')}
          </div>

          <div>
            <label className="block text-gray-700 font-bold mb-1">Nome Comercial da Loja *</label>
            <input
              type="text"
              value={commercialName}
              onChange={(e) => edit('commercialName', setCommercialName, e.target.value)}
              required
              className="w-full p-2.5 border border-gray-300 rounded-xl focus:border-emerald-600 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-gray-700 font-bold mb-1">Tipo de Vendedor *</label>
            <select
              value={sellerType}
              onChange={(e) => edit('sellerType', setSellerType as any, e.target.value)}
              aria-invalid={!!fieldErrors.sellerType}
              className={`${inputCls('sellerType')} bg-white`}
            >
              <option value="pessoa_fisica">Pessoa Física / Autônomo</option>
              <option value="empresa_individual">Empresa Individual / MEI</option>
              <option value="sociedade">Sociedade Limitada / Lda</option>
              <option value="marca_oficial">Marca Oficial / Distribuidor</option>
              <option value="vendedor_internacional">Vendedor Internacional Exportador</option>
            </select>
            {fieldError('sellerType')}
          </div>

          <div>
            <label className="block text-gray-700 font-bold mb-1">Documento Fiscal (NIF / CNPJ) *</label>
            <input
              type="text"
              value={taxId}
              onChange={(e) => edit('taxId', setTaxId, e.target.value)}
              required
              aria-invalid={!!fieldErrors.taxId}
              aria-describedby={fieldErrors.taxId ? 'seller-account-taxId-error' : undefined}
              className={`w-full p-2.5 border rounded-xl focus:border-emerald-600 focus:outline-hidden font-mono ${fieldErrors.taxId ? 'border-red-400' : 'border-gray-300'}`}
            />
            {fieldErrors.taxId && <p id="seller-account-taxId-error" role="alert" data-testid="seller-account-taxId-error" className="mt-1 text-[11px] font-bold text-red-600">{fieldErrors.taxId}</p>}
          </div>

          <div>
            <label className="block text-gray-700 font-bold mb-1">País Sede *</label>
            <select
              value={country}
              onChange={(e) => edit('country', setCountry as any, e.target.value)}
              disabled={countriesLoading}
              aria-invalid={!!fieldErrors.country}
              className={`${inputCls('country')} bg-white disabled:opacity-60`}
            >
              {/* País atual do vendedor sempre presente na lista, mesmo antes do
                  carregamento terminar ou se não estiver mais entre os ativos —
                  nunca perde a seleção já cadastrada. */}
              {(!operationalCountries || !operationalCountries.some((c) => c.code === country)) && country && (
                <option value={country}>{country}</option>
              )}
              {operationalCountries?.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.name}
                </option>
              ))}
            </select>
            {fieldError('country')}
            <p className="text-[11px] text-gray-500 mt-1">Mudar o país exige o documento fiscal desse país; com a verificação aprovada, exige nova verificação (KYC).</p>
            {countriesLoading && (
              <p className="text-[11px] text-gray-500 mt-1">Carregando países operacionais...</p>
            )}
            {!countriesLoading && countriesError && (
              <p className="text-[11px] text-red-600 mt-1">Não foi possível carregar a lista de países. Tente novamente em instantes.</p>
            )}
          </div>

          <div>
            <label className="block text-gray-700 font-bold mb-1">Cidade *</label>
            <input
              type="text"
              value={city}
              onChange={(e) => edit('city', setCity, e.target.value)}
              required
              aria-invalid={!!fieldErrors.city}
              aria-describedby={fieldErrors.city ? 'seller-account-city-error' : undefined}
              className={`w-full p-2.5 border rounded-xl focus:border-emerald-600 focus:outline-hidden ${fieldErrors.city ? 'border-red-400' : 'border-gray-300'}`}
            />
            {fieldErrors.city && <p id="seller-account-city-error" role="alert" data-testid="seller-account-city-error" className="mt-1 text-[11px] font-bold text-red-600">{fieldErrors.city}</p>}
          </div>

          <div className="sm:col-span-2">
            <label className="block text-gray-700 font-bold mb-1">Endereço Fiscal / Sede Comercial *</label>
            <input
              type="text"
              value={address}
              onChange={(e) => edit('address', setAddress, e.target.value)}
              required
              aria-invalid={!!fieldErrors.address}
              aria-describedby={fieldErrors.address ? 'seller-account-address-error' : undefined}
              className={`w-full p-2.5 border rounded-xl focus:border-emerald-600 focus:outline-hidden ${fieldErrors.address ? 'border-red-400' : 'border-gray-300'}`}
            />
            {fieldErrors.address && <p id="seller-account-address-error" role="alert" data-testid="seller-account-address-error" className="mt-1 text-[11px] font-bold text-red-600">{fieldErrors.address}</p>}
          </div>

          <div>
            <label className="block text-gray-700 font-bold mb-1">Telefone / WhatsApp Comercial *</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => edit('phone', setPhone, e.target.value)}
              required
              className="w-full p-2.5 border border-gray-300 rounded-xl focus:border-emerald-600 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-gray-700 font-bold mb-1">E-mail Comercial de Notificações *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => edit('email', setEmail, e.target.value)}
              required
              aria-invalid={!!fieldErrors.email}
              className={inputCls('email')}
            />
            {fieldError('email')}
            <p className="text-[11px] text-gray-500 mt-1">É o e-mail comercial da loja. O e-mail de login da conta não muda por aqui.</p>
          </div>
        </div>

        {/* Payout & Currency Preferences */}
        <div className="pt-4 border-t border-gray-100">
          <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-emerald-700" /> Meios de Recebimento & Moeda Base
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-gray-700 font-bold mb-1">Moeda Principal para Recebimentos</label>
              <select
                value={preferredCurrency}
                onChange={(e) => edit('preferredCurrency', setPreferredCurrency as any, e.target.value)}
                aria-invalid={!!fieldErrors.preferredCurrency}
                className={`${inputCls('preferredCurrency')} bg-white font-bold`}
              >
                {currencyOptions.map((c) => (
                  <option key={c} value={c}>{CURRENCY_LABELS[c] || c}</option>
                ))}
              </select>
              {fieldError('preferredCurrency')}
              <p className="text-[11px] text-gray-500 mt-1">Preferência de exibição. Carteiras e saques continuam por moeda, como antes.</p>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={() => onNavigateSection('payouts')}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-2.5 px-4 rounded-xl transition flex items-center justify-center gap-2"
              >
                <CreditCard className="w-4 h-4 text-emerald-700" /> Gerenciar Contas de Saque (Orange / Bank)
              </button>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-100 flex items-center justify-end">
          <button
            type="submit"
            disabled={saving}
            data-testid="seller-account-save"
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold px-6 py-3 rounded-xl text-xs transition shadow-xs flex items-center gap-2"
          >
            <Save className="w-4 h-4" /> {saving ? 'Salvando...' : 'Salvar Alterações Cadastrais'}
          </button>
        </div>
      </form>
    </div>
  );
};
