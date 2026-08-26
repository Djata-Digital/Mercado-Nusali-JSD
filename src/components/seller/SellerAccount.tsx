import React, { useState, useRef } from 'react';
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
  Camera,
  Upload,
  Image as ImageIcon,
  User,
} from 'lucide-react';
import { SellerProfileData } from '../../data/mockSellerData';
import { CountryCode, CurrencyCode } from '../../types';
import { countriesConfig } from '../../utils/currencyUtils';
import { useCountries } from '../../hooks/useCountries';

const PRESET_AVATARS = [
  { label: 'Profissional', url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250' },
  { label: 'Executivo', url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=250' },
  { label: 'Empreendedora', url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=250' },
  { label: 'Comerciante', url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=250' },
  { label: 'Moderno', url: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&q=80&w=250' },
];

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
  const [avatar, setAvatar] = useState((profile as any).avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250');
  const [customAvatarUrl, setCustomAvatarUrl] = useState('');
  const [showCustomUrlInput, setShowCustomUrlInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleAvatarFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result) {
        setAvatar(reader.result as string);
        showToast('Foto carregada! Clique em "Salvar Alterações" para confirmar.');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await import('../../services/sellerService').then(m => m.SellerService.updateProfile({
        companyName: fullName,
        tradingName: commercialName,
        phone,
      }));
    } catch {
      // handled
    }
    onUpdateProfile({
      ...profile,
      fullName,
      commercialName,
      sellerType,
      taxId,
      country,
      city,
      address,
      phone,
      email,
      preferredCurrency,
      avatar,
    });
    showToast('Dados e foto da conta de vendedor salvos com sucesso!');
  };

  const countryConf = countriesConfig[country] || countriesConfig.GW;

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fadeIn">
      {/* Top Banner Status Card */}
      <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-emerald-950 text-white rounded-2xl p-6 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="relative group shrink-0">
            <div className="w-16 h-16 rounded-2xl bg-yellow-400 text-blue-950 font-black text-2xl flex items-center justify-center border-2 border-white/20 shadow-md overflow-hidden">
              {avatar ? (
                <img src={avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                fullName.substring(0, 2).toUpperCase()
              )}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-1.5 -right-1.5 p-1.5 bg-yellow-400 text-blue-950 rounded-full shadow-md hover:bg-yellow-300 transition cursor-pointer"
              title="Trocar foto do perfil"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-black">{commercialName}</h1>
              <span className="bg-emerald-500 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <BadgeCheck className="w-3.5 h-3.5" /> VERIFICADO
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1 font-mono">
              Titular: {fullName} • {taxId}
            </p>
            <span className="text-[11px] text-yellow-300 font-bold block mt-1">
              {profile.kycLevel} (Aprovado em {profile.verificationDate})
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

      {/* Account Profile Form */}
      <form onSubmit={handleSave} className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs space-y-6">
        <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-emerald-700" /> Dados Cadastrais & Fiscais do Vendedor
          </h2>
          <span className="text-xs text-gray-400">Atualizado para operações transfronteiriças</span>
        </div>

        {/* Photo Avatar Section */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
              <Camera className="w-4 h-4 text-emerald-700" /> Foto de Perfil do Vendedor / Logotipo Pessoal
            </label>
            <span className="text-[10px] text-gray-500">Exibido na sua loja e respostas aos compradores</span>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="w-14 h-14 rounded-xl overflow-hidden border-2 border-emerald-600 bg-white shadow-2xs shrink-0 flex items-center justify-center">
              {avatar ? (
                <img src={avatar} alt="Prévia" className="w-full h-full object-cover" />
              ) : (
                <User className="w-6 h-6 text-gray-400" />
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-2 bg-white hover:bg-gray-100 text-gray-800 font-bold rounded-lg text-xs border border-gray-300 transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Upload className="w-3.5 h-3.5 text-emerald-700" /> Carregar Imagem
              </button>
              <button
                type="button"
                onClick={() => setShowCustomUrlInput(!showCustomUrlInput)}
                className="px-3 py-2 bg-white hover:bg-gray-100 text-gray-800 font-bold rounded-lg text-xs border border-gray-300 transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <ImageIcon className="w-3.5 h-3.5 text-emerald-700" /> {showCustomUrlInput ? 'Fechar Link' : 'Colar Link URL'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarFileUpload}
                className="hidden"
              />
            </div>
          </div>

          {/* Presets */}
          <div>
            <span className="text-[10px] text-gray-500 font-bold block mb-1.5">Ou selecione um avatar profissional:</span>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {PRESET_AVATARS.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setAvatar(item.url)}
                  className={`w-9 h-9 rounded-xl overflow-hidden shrink-0 border-2 transition cursor-pointer ${
                    avatar === item.url ? 'border-emerald-600 ring-2 ring-emerald-400 scale-105' : 'border-gray-200 opacity-70 hover:opacity-100'
                  }`}
                  title={item.label}
                >
                  <img src={item.url} alt={item.label} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>

          {showCustomUrlInput && (
            <div className="flex gap-2 pt-1 animate-fadeIn">
              <input
                type="url"
                value={customAvatarUrl}
                onChange={(e) => setCustomAvatarUrl(e.target.value)}
                placeholder="https://exemplo.com/foto-vendedor.jpg"
                className="flex-1 p-2 bg-white border border-gray-300 rounded-lg text-xs focus:border-emerald-600 focus:outline-hidden"
              />
              <button
                type="button"
                onClick={() => {
                  if (customAvatarUrl.trim()) {
                    setAvatar(customAvatarUrl.trim());
                    setCustomAvatarUrl('');
                    setShowCustomUrlInput(false);
                  }
                }}
                className="px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg text-xs transition cursor-pointer"
              >
                Aplicar
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-medium">
          <div>
            <label className="block text-gray-700 font-bold mb-1">Nome Completo do Titular *</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="w-full p-2.5 border border-gray-300 rounded-xl focus:border-emerald-600 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-gray-700 font-bold mb-1">Nome Comercial / Razão Social *</label>
            <input
              type="text"
              value={commercialName}
              onChange={(e) => setCommercialName(e.target.value)}
              required
              className="w-full p-2.5 border border-gray-300 rounded-xl focus:border-emerald-600 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-gray-700 font-bold mb-1">Tipo de Vendedor *</label>
            <select
              value={sellerType}
              onChange={(e) => setSellerType(e.target.value as any)}
              className="w-full p-2.5 border border-gray-300 rounded-xl focus:border-emerald-600 focus:outline-hidden bg-white"
            >
              <option value="pessoa_fisica">Pessoa Física / Autônomo</option>
              <option value="empresa_individual">Empresa Individual / MEI</option>
              <option value="sociedade">Sociedade Limitada / Lda</option>
              <option value="marca_oficial">Marca Oficial / Distribuidor</option>
              <option value="vendedor_internacional">Vendedor Internacional Exportador</option>
            </select>
          </div>

          <div>
            <label className="block text-gray-700 font-bold mb-1">Documento Fiscal (NIF / CNPJ) *</label>
            <input
              type="text"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              required
              className="w-full p-2.5 border border-gray-300 rounded-xl focus:border-emerald-600 focus:outline-hidden font-mono"
            />
          </div>

          <div>
            <label className="block text-gray-700 font-bold mb-1">País Sede *</label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value as CountryCode)}
              disabled={countriesLoading}
              className="w-full p-2.5 border border-gray-300 rounded-xl focus:border-emerald-600 focus:outline-hidden bg-white disabled:opacity-60"
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
              onChange={(e) => setCity(e.target.value)}
              required
              className="w-full p-2.5 border border-gray-300 rounded-xl focus:border-emerald-600 focus:outline-hidden"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-gray-700 font-bold mb-1">Endereço Fiscal / Sede Comercial *</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
              className="w-full p-2.5 border border-gray-300 rounded-xl focus:border-emerald-600 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-gray-700 font-bold mb-1">Telefone / WhatsApp Comercial *</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className="w-full p-2.5 border border-gray-300 rounded-xl focus:border-emerald-600 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-gray-700 font-bold mb-1">E-mail Comercial de Notificações *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full p-2.5 border border-gray-300 rounded-xl focus:border-emerald-600 focus:outline-hidden"
            />
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
                onChange={(e) => setPreferredCurrency(e.target.value as CurrencyCode)}
                className="w-full p-2.5 border border-gray-300 rounded-xl focus:border-emerald-600 focus:outline-hidden bg-white font-bold"
              >
                <option value="XOF">XOF - Franco CFA (África Ocidental)</option>
                <option value="EUR">EUR - Euro (Europa / Portugal)</option>
                <option value="BRL">BRL - Real (Brasil)</option>
                <option value="USD">USD - Dólar Norte-Americano</option>
              </select>
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
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-3 rounded-xl text-xs transition shadow-xs flex items-center gap-2"
          >
            <Save className="w-4 h-4" /> Salvar Alterações Cadastrais
          </button>
        </div>
      </form>
    </div>
  );
};
