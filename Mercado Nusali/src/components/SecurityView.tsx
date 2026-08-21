import React, { useState, useEffect } from 'react';
import {
  Lock,
  ShieldCheck,
  Smartphone,
  KeyRound,
  History,
  LogOut,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext';
import { BuyerNavHeader } from './BuyerNavHeader';
import { AuthService } from '../services/authService';
import { AuthSession } from '../types';

export const SecurityView: React.FC = () => {
  const { showToast } = usePreferences();

  const [is2FAEnabled, setIs2FAEnabled] = useState(true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);

  const [activeSessions, setActiveSessions] = useState<AuthSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);

  // Fetch active sessions
  const loadSessions = async () => {
    setIsLoadingSessions(true);
    try {
      const res = await AuthService.getSessions();
      if (res.data) {
        setActiveSessions(res.data);
      }
    } catch (err) {
      console.error('Failed to load active sessions:', err);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      showToast('A nova senha deve possuir pelo menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('A confirmação de senha não confere.');
      return;
    }

    setIsSubmittingPassword(true);
    try {
      const res = await AuthService.changePassword({ currentPassword, newPassword });
      if (res.success) {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        showToast('Senha alterada com sucesso!');
      } else {
        showToast(res.error?.message || 'Erro ao alterar senha.');
      }
    } catch (err: any) {
      showToast(err.message || 'Falha ao alterar senha.');
    } finally {
      setIsSubmittingPassword(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await AuthService.revokeSession(sessionId);
      setActiveSessions(prev => prev.filter(s => s.id !== sessionId));
      showToast('Sessão encerrada remotamente.');
    } catch (err: any) {
      showToast('Erro ao encerrar sessão.');
    }
  };

  const handleRevokeAllOthers = async () => {
    try {
      await AuthService.revokeAllOtherSessions();
      setActiveSessions(prev => prev.filter(s => s.isCurrent));
      showToast('Todas as outras sessões foram encerradas com sucesso.');
    } catch (err: any) {
      showToast('Erro ao encerrar sessões remotas.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-fadeIn">
      <BuyerNavHeader />

      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 bg-blue-100 text-blue-900 rounded-xl">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900">Segurança & Privacidade da Conta</h1>
            <p className="text-xs text-gray-500">Mantenha sua conta protegida contra acessos não autorizados nas compras internacionais.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Form Change Password */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs">
          <h2 className="text-lg font-bold text-gray-900 mb-4 pb-3 border-b border-gray-100 flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-emerald-700" /> Alterar Senha de Acesso
          </h2>

          <form onSubmit={handleChangePassword} className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-gray-700 mb-1">Senha Atual *</label>
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full p-2.5 border border-gray-300 rounded-xl focus:border-emerald-600 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">Nova Senha *</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Mínimo de 8 caracteres"
                required
                className="w-full p-2.5 border border-gray-300 rounded-xl focus:border-emerald-600 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">Confirmar Nova Senha *</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
                required
                className="w-full p-2.5 border border-gray-300 rounded-xl focus:border-emerald-600 focus:outline-hidden"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmittingPassword}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs transition shadow-xs mt-2 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSubmittingPassword ? (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              ) : (
                'Atualizar Senha'
              )}
            </button>
          </form>
        </div>

        {/* 2FA & Active Sessions */}
        <div className="space-y-6">
          {/* 2FA Card */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-blue-700" />
                <h3 className="font-bold text-sm text-gray-900">Autenticação de 2 Fatores (2FA)</h3>
              </div>
              <button
                onClick={() => {
                  setIs2FAEnabled(!is2FAEnabled);
                  showToast(is2FAEnabled ? '2FA desativado' : '2FA ativado com sucesso por SMS/App!');
                }}
                className={`w-12 h-6 flex items-center rounded-full p-1 transition duration-300 cursor-pointer ${
                  is2FAEnabled ? 'bg-emerald-600 justify-end' : 'bg-gray-300 justify-start'
                }`}
              >
                <div className="bg-white w-4 h-4 rounded-full shadow-md" />
              </button>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              Exige um código de verificação enviado via SMS (Orange Money / MTN) ou Google Authenticator ao realizar compras e saques na Carteira.
            </p>
          </div>

          {/* Active Sessions */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                <History className="w-4 h-4 text-purple-700" /> Dispositivos e Sessões Ativas
              </h3>
              {activeSessions.filter(s => !s.isCurrent).length > 0 && (
                <button
                  onClick={handleRevokeAllOthers}
                  className="text-[11px] font-bold text-red-600 hover:text-red-800 underline cursor-pointer"
                >
                  Encerrar Outras Sessões
                </button>
              )}
            </div>

            {isLoadingSessions ? (
              <div className="py-6 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-900" />
                Carregando sessões...
              </div>
            ) : (
              <div className="space-y-3">
                {activeSessions.map((s) => (
                  <div key={s.id} className="p-3 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900">{s.device} ({s.location})</span>
                        {s.isCurrent && (
                          <span className="bg-emerald-100 text-emerald-800 text-[9px] font-black px-1.5 py-0.2 rounded">
                            SESSÃO ATUAL
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-500 font-mono block mt-0.5">
                        IP: {s.ipAddress} • {s.lastActiveAt}
                      </span>
                    </div>

                    {!s.isCurrent && (
                      <button
                        onClick={() => handleRevokeSession(s.id)}
                        className="text-red-600 hover:text-red-800 text-[11px] font-bold p-1.5 rounded hover:bg-red-50 transition cursor-pointer"
                      >
                        Desconectar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
