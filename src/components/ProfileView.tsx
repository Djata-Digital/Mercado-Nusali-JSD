import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  ShieldCheck,
  MapPin,
  Lock,
  Wallet,
  Tag,
  Package,
  Star,
  RotateCcw,
  HelpCircle,
  ChevronRight,
  Globe,
  Bell,
  MessageSquare,
  BadgeCheck,
  AlertCircle,
  RefreshCw,
  Camera,
  Upload,
  Image as ImageIcon,
  Check,
  Sparkles,
} from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext';
import { useAuth } from '../context/AuthContext';
import { BuyerNavHeader } from './BuyerNavHeader';
import { formatCurrency, countriesConfig } from '../utils/currencyUtils';
import { BuyerService, BuyerProfile, BuyerOverviewData } from '../services/buyerService';
import { uploadService } from '../services/uploadService';

const PRESET_AVATARS = [
  { label: 'Profissional', url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250' },
  { label: 'Executivo', url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=250' },
  { label: 'Empreendedora', url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=250' },
  { label: 'Comerciante', url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=250' },
  { label: 'Moderno', url: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&q=80&w=250' },
];

export const ProfileView: React.FC = () => {
  const navigate = useNavigate();
  const { selectedCountry, selectedCurrency, showToast } = usePreferences();
  const { user, updateUser } = useAuth();

  const [profile, setProfile] = useState<BuyerProfile | null>(null);
  const [overview, setOverview] = useState<BuyerOverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [customAvatarUrl, setCustomAvatarUrl] = useState('');
  const [showCustomUrlInput, setShowCustomUrlInput] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [profRes, overRes] = await Promise.all([
        BuyerService.getProfile(),
        BuyerService.getOverview(),
      ]);

      if (profRes.success && profRes.data) {
        setProfile(profRes.data);
        setEditName(profRes.data.fullName);
        setEditPhone(profRes.data.phone);
        setEditCity(profRes.data.city);
        setEditAvatar(profRes.data.avatar || user?.avatar || '');
      }
      if (overRes.success && overRes.data) {
        setOverview(overRes.data);
      }
    } catch (err) {
      console.error('Error loading buyer profile:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAvatarFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsSaving(true);
      const uploaded = await uploadService.uploadProfile(file);

      // A URL retornada contém uma versão (?v=...) para evitar que o
      // navegador reutilize a foto anterior que estava em cache.
      setEditAvatar(uploaded.url);

      // Atualiza imediatamente a prévia principal e o contexto de autenticação.
      // A persistência definitiva em users.avatar_url continua ocorrendo ao
      // clicar em "Salvar Alterações".
      setProfile((current) =>
        current
          ? {
              ...current,
              avatar: uploaded.url,
            }
          : current,
      );

      updateUser({
        avatar: uploaded.url,
      });

      showToast('Nova foto carregada. Clique em "Salvar Alterações" para confirmar no perfil.');
    } catch (error) {
      console.error('Profile avatar upload failed:', error);
      showToast('Não foi possível enviar a foto.');
    } finally {
      setIsSaving(false);
      e.target.value = '';
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await BuyerService.updateProfile({
        fullName: editName,
        phone: editPhone,
        city: editCity,
        avatar: editAvatar,
      });

      if (res.success && res.data) {
        setProfile(res.data);
        updateUser({
          name: editName,
          phone: editPhone,
          avatar: editAvatar,
        });
        setIsEditing(false);
        showToast('Perfil e foto atualizados com sucesso!');
      } else {
        showToast(res.message || 'Erro ao salvar perfil.');
      }
    } catch {
      showToast('Falha na comunicação com o servidor.');
    } finally {
      setIsSaving(false);
    }
  };

  const currentCountry = countriesConfig[selectedCountry] || countriesConfig.GW;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-fadeIn">
      <BuyerNavHeader />

      {/* User Header Profile Card */}
      <div className="bg-gradient-to-r from-blue-950 via-emerald-900 to-teal-900 text-white rounded-2xl p-6 sm:p-8 shadow-xl mb-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            {/* Avatar with Camera Overlay */}
            <div className="relative group shrink-0">
              <div className="w-20 h-20 rounded-2xl bg-yellow-400 text-blue-950 font-black text-2xl flex items-center justify-center border-4 border-white/20 shadow-lg overflow-hidden">
                {editAvatar || profile?.avatar || user?.avatar ? (
                  <img
                    src={editAvatar || profile?.avatar || user?.avatar}
                    alt="Foto de perfil"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  (profile?.fullName || user?.name || 'US').substring(0, 2).toUpperCase()
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsEditing(true);
                  avatarFileRef.current?.click();
                }}
                className="absolute -bottom-1.5 -right-1.5 p-2 bg-yellow-400 hover:bg-yellow-300 text-blue-950 rounded-full shadow-lg transition cursor-pointer"
                title="Alterar foto de perfil"
              >
                <Camera className="w-4 h-4 font-black" />
              </button>
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-black">{profile?.fullName || user?.name || 'Usuário'}</h1>
                <span className="bg-emerald-500 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-emerald-400">
                  <BadgeCheck className="w-3.5 h-3.5" /> COMPRADOR VERIFICADO
                </span>
                {profile?.membership === 'nusali_plus' && (
                  <span className="bg-yellow-400 text-blue-950 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                    NUSALI+
                  </span>
                )}
              </div>

              <p className="text-xs text-gray-200 mt-1 font-mono">{profile?.email || user?.email || 'E-mail não informado'}{profile?.taxId ? ` • NIF ${profile.taxId}` : ''}</p>

              <div className="flex items-center gap-3 mt-3 text-xs text-yellow-300 font-semibold">
                <span className="flex items-center gap-1">
                  <Globe className="w-4 h-4" /> Operando de: {currentCountry.flag} {currentCountry.name} ({selectedCurrency})
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="bg-white/10 hover:bg-white/20 text-white border border-white/30 font-bold px-4 py-2 rounded-xl text-xs transition backdrop-blur-xs flex items-center gap-2 cursor-pointer"
            >
              <User className="w-4 h-4 text-yellow-300" /> {isEditing ? 'Cancelar Edição' : 'Editar Perfil & Foto'}
            </button>
            <button
              onClick={() => navigate('/security')}
              className="bg-white/10 hover:bg-white/20 text-white border border-white/30 font-bold px-4 py-2 rounded-xl text-xs transition backdrop-blur-xs flex items-center gap-2 cursor-pointer"
            >
              <Lock className="w-4 h-4 text-yellow-300" /> Segurança
            </button>
          </div>
        </div>

        {/* Edit Profile Form */}
        {isEditing && (
          <form onSubmit={handleSaveProfile} className="mt-6 pt-6 border-t border-white/20 space-y-4">
            {/* Avatar Picker Section */}
            <div className="bg-white/10 p-4 rounded-xl border border-white/20 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-yellow-300 flex items-center gap-2">
                  <Camera className="w-4 h-4" /> Alterar Foto de Perfil
                </label>
                <span className="text-[11px] text-gray-300">Formatos aceitos: JPG, PNG, WEBP</span>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="w-14 h-14 rounded-xl overflow-hidden border-2 border-yellow-400 bg-black/30 shrink-0 flex items-center justify-center">
                  {editAvatar ? (
                    <img src={editAvatar} alt="Prévia" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-6 h-6 text-white/50" />
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => avatarFileRef.current?.click()}
                    className="bg-white/20 hover:bg-white/30 text-white font-bold px-3 py-2 rounded-lg text-xs transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-yellow-300" /> Carregar do Dispositivo
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCustomUrlInput(!showCustomUrlInput)}
                    className="bg-white/20 hover:bg-white/30 text-white font-bold px-3 py-2 rounded-lg text-xs transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-yellow-300" /> {showCustomUrlInput ? 'Fechar Link' : 'Colar Link URL'}
                  </button>
                  <input
                    ref={avatarFileRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarFileUpload}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Presets */}
              <div>
                <span className="text-[11px] text-gray-300 font-semibold block mb-1.5">Modelos de Avatar:</span>
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {PRESET_AVATARS.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setEditAvatar(item.url)}
                      className={`w-9 h-9 rounded-xl overflow-hidden shrink-0 border-2 transition cursor-pointer ${
                        editAvatar === item.url ? 'border-yellow-400 ring-2 ring-yellow-400 scale-105' : 'border-white/30 opacity-70 hover:opacity-100'
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
                    placeholder="https://exemplo.com/minha-foto.jpg"
                    className="flex-1 bg-white/10 border border-white/30 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-400 focus:outline-hidden focus:ring-2 focus:ring-yellow-400"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (customAvatarUrl.trim()) {
                        setEditAvatar(customAvatarUrl.trim());
                        setCustomAvatarUrl('');
                        setShowCustomUrlInput(false);
                      }
                    }}
                    className="bg-yellow-400 hover:bg-yellow-500 text-blue-950 font-black px-4 py-2 rounded-lg text-xs transition cursor-pointer"
                  >
                    Aplicar
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-200 mb-1">Nome Completo</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full bg-white/10 border border-white/30 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-400 focus:outline-hidden focus:ring-2 focus:ring-yellow-400"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-200 mb-1">Telefone</label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={e => setEditPhone(e.target.value)}
                  className="w-full bg-white/10 border border-white/30 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-400 focus:outline-hidden focus:ring-2 focus:ring-yellow-400"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-200 mb-1">Cidade Principal</label>
                <input
                  type="text"
                  value={editCity}
                  onChange={e => setEditCity(e.target.value)}
                  className="w-full bg-white/10 border border-white/30 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-400 focus:outline-hidden focus:ring-2 focus:ring-yellow-400"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="bg-white/10 hover:bg-white/20 text-white font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="bg-yellow-400 hover:bg-yellow-500 text-blue-950 font-black px-6 py-2 rounded-xl text-xs transition cursor-pointer flex items-center gap-2 shadow-lg"
              >
                {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Salvar Alterações no Banco de Dados'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div
          onClick={() => navigate('/orders')}
          className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs hover:border-emerald-500 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-500">Compras Ativas</span>
            <Package className="w-5 h-5 text-emerald-600 group-hover:scale-110 transition" />
          </div>
          <span className="text-2xl font-black text-gray-900">
            {overview ? overview.metrics.activeOrdersCount : 2}
          </span>
        </div>

        <div
          onClick={() => navigate('/wallet')}
          className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs hover:border-emerald-500 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-500">Saldo Nusali Pay</span>
            <Wallet className="w-5 h-5 text-blue-600 group-hover:scale-110 transition" />
          </div>
          <span className="text-2xl font-black text-emerald-700">
            {formatCurrency(overview ? overview.metrics.walletBalance : 45000, selectedCurrency)}
          </span>
        </div>

        <div
          onClick={() => navigate('/coupons')}
          className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs hover:border-emerald-500 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-500">Cupons Disponíveis</span>
            <Tag className="w-5 h-5 text-yellow-600 group-hover:scale-110 transition" />
          </div>
          <span className="text-2xl font-black text-gray-900">
            {overview ? overview.metrics.totalCouponsCount : 4}
          </span>
        </div>

        <div
          onClick={() => navigate('/favorites')}
          className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs hover:border-emerald-500 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-500">Favoritos</span>
            <Star className="w-5 h-5 text-purple-600 group-hover:scale-110 transition" />
          </div>
          <span className="text-2xl font-black text-gray-900">
            {overview ? overview.metrics.favoritesCount : 2}
          </span>
        </div>
      </div>

      {/* Navigation Sections Menu */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Card 1: Compras & Logística */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs space-y-4">
          <h2 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2 border-b border-gray-100 pb-3">
            <Package className="w-4 h-4 text-emerald-600" /> Pedidos & Rastreamento
          </h2>
          <div className="space-y-2">
            <button
              onClick={() => navigate('/orders')}
              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition text-left cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition">
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-gray-800">Minhas Compras</h3>
                  <p className="text-[10px] text-gray-400">Ver pedidos em andamento e histórico</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-emerald-600 transition" />
            </button>

            <button
              onClick={() => navigate('/returns-refunds')}
              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition text-left cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-50 rounded-lg text-yellow-600 group-hover:bg-yellow-600 group-hover:text-white transition">
                  <RotateCcw className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-gray-800">Devoluções & Reembolso</h3>
                  <p className="text-[10px] text-gray-400">Solicitações de frete reverso gratuito</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-yellow-600 transition" />
            </button>

            <button
              onClick={() => navigate('/disputes')}
              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition text-left cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-gray-800">Garantia Escrow & Mediações</h3>
                  <p className="text-[10px] text-gray-400">Pagamentos retidos e resolução de disputas</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-indigo-600 transition" />
            </button>
          </div>
        </div>

        {/* Card 2: Carteira & Pagamentos */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs space-y-4">
          <h2 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2 border-b border-gray-100 pb-3">
            <Wallet className="w-4 h-4 text-blue-600" /> Pagamentos & Carteira
          </h2>
          <div className="space-y-2">
            <button
              onClick={() => navigate('/wallet')}
              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition text-left cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition">
                  <Wallet className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-gray-800">Nusali Pay</h3>
                  <p className="text-[10px] text-gray-400">Saldo, recargas Orange Money/PIX e extrato</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition" />
            </button>

            <button
              onClick={() => navigate('/coupons')}
              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition text-left cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-50 rounded-lg text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition">
                  <Tag className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-gray-800">Cupons & Promoções</h3>
                  <p className="text-[10px] text-gray-400">Descontos de frete e códigos de oferta</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-purple-600 transition" />
            </button>

            <button
              onClick={() => navigate('/addresses')}
              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition text-left cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-rose-50 rounded-lg text-rose-600 group-hover:bg-rose-600 group-hover:text-white transition">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-gray-800">Endereços de Entrega</h3>
                  <p className="text-[10px] text-gray-400">Gerenciar locais de entrega e endereço padrão</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-rose-600 transition" />
            </button>
          </div>
        </div>

        {/* Card 3: Comunicação & Atendimento */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs space-y-4">
          <h2 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2 border-b border-gray-100 pb-3">
            <MessageSquare className="w-4 h-4 text-teal-600" /> Mensagens & Atendimento
          </h2>
          <div className="space-y-2">
            <button
              onClick={() => navigate('/messages')}
              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition text-left cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-teal-50 rounded-lg text-teal-600 group-hover:bg-teal-600 group-hover:text-white transition">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-gray-800">Mensagens & Vendedores</h3>
                  <p className="text-[10px] text-gray-400">Conversas diretas e assistente virtual</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-teal-600 transition" />
            </button>

            <button
              onClick={() => navigate('/notifications')}
              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition text-left cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-50 rounded-lg text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-gray-800">Central de Notificações</h3>
                  <p className="text-[10px] text-gray-400">Alertas de despacho, status e promos</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-amber-600 transition" />
            </button>

            <button
              onClick={() => navigate('/help')}
              className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition text-left cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-sky-50 rounded-lg text-sky-600 group-hover:bg-sky-600 group-hover:text-white transition">
                  <HelpCircle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-gray-800">Central de Ajuda (FAQ)</h3>
                  <p className="text-[10px] text-gray-400">Dúvidas frequentes e suporte ao comprador</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-sky-600 transition" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
