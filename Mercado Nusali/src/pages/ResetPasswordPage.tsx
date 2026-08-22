import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Lock,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Check,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import { AuthService } from '../services/authService';
import { NusaliLogo } from '../components/NusaliLogo';

export const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const tokenFromUrl = searchParams.get('token') || searchParams.get('code') || '';

  const [code, setCode] = useState<string>(tokenFromUrl || '123456');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  // Password Rules
  const hasMinLength = newPassword.length >= 8;
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasLower = /[a-z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword);
  const isPasswordValid = hasMinLength && hasUpper && hasLower && hasNumber && hasSymbol;
  const passMatch = newPassword === confirmPassword && confirmPassword.length > 0;

  // Strength score
  const strengthScore = [hasMinLength, hasUpper, hasLower, hasNumber, hasSymbol].filter(Boolean).length;
  const strengthPercentage = (strengthScore / 5) * 100;
  const strengthColor =
    strengthScore <= 2 ? 'bg-red-500' : strengthScore <= 4 ? 'bg-amber-500' : 'bg-emerald-600';
  const strengthLabel =
    strengthScore <= 2 ? 'Fraca' : strengthScore <= 4 ? 'Média' : 'Forte (Segura)';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!code.trim()) {
      setErrorMessage('Informe o código de verificação recebido.');
      return;
    }

    if (!isPasswordValid) {
      setErrorMessage('A nova senha deve atender a todos os critérios de segurança.');
      return;
    }

    if (!passMatch) {
      setErrorMessage('A confirmação de senha não coincide com a nova senha.');
      return;
    }

    setLoading(true);

    try {
      const res = await AuthService.resetPassword({ newPassword, code });
      if (!res.success) {
        throw new Error(res.error?.message || 'Falha ao redefinir senha.');
      }

      setIsSuccess(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Código inválido ou expirado.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-950 via-slate-900 to-gray-900 flex flex-col justify-center py-10 sm:py-14 px-4 sm:px-6 lg:px-8 animate-fadeIn">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link to="/" className="inline-block hover:opacity-90 transition">
          <NusaliLogo variant="full" size="lg" />
        </Link>
        <h2 className="mt-6 text-2xl font-black text-white tracking-tight">
          Redefinir Senha
        </h2>
        <p className="mt-1 text-xs text-blue-200">
          Crie uma nova senha forte para proteger seu acesso
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 sm:px-10 shadow-2xl rounded-2xl border border-gray-100">
          {!isSuccess ? (
            <form onSubmit={handleSubmit} className="space-y-5 text-xs">
              {/* Error Message */}
              {errorMessage && (
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-900 text-xs font-medium">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div>{errorMessage}</div>
                </div>
              )}

              {/* Code field */}
              <div>
                <label className="block font-bold text-gray-700 mb-1">Código de Recuperação *</label>
                <input
                  type="text"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="ex: 123456 ou token de e-mail"
                  className="w-full p-2.5 border border-gray-300 rounded-xl focus:border-blue-800 focus:outline-hidden font-mono text-center tracking-widest text-sm font-bold text-blue-950"
                />
                <span className="text-[10px] text-gray-500 mt-1 block text-center">
                  Código de 6 dígitos enviado por e-mail ou SMS.
                </span>
              </div>

              {/* New Password */}
              <div>
                <label className="block font-bold text-gray-700 mb-1">Nova Senha *</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full p-2.5 pr-10 border border-gray-300 rounded-xl focus:border-blue-800 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {newPassword.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between text-[10px] font-bold">
                      <span>Força da nova senha:</span>
                      <span className="text-gray-800">{strengthLabel}</span>
                    </div>
                    <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${strengthColor}`}
                        style={{ width: `${strengthPercentage}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block font-bold text-gray-700 mb-1">Confirmar Nova Senha *</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a nova senha"
                  className="w-full p-2.5 border border-gray-300 rounded-xl focus:border-blue-800 focus:outline-hidden"
                />
                {confirmPassword.length > 0 && !passMatch && (
                  <span className="text-[10px] text-red-600 mt-1 block">As senhas não coincidem.</span>
                )}
              </div>

              {/* Rules Checklist */}
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-1 text-[11px]">
                <div className={`flex items-center gap-1.5 ${hasMinLength ? 'text-emerald-700 font-bold' : 'text-gray-500'}`}>
                  <Check className="w-3.5 h-3.5" /> Pelo menos 8 caracteres
                </div>
                <div className={`flex items-center gap-1.5 ${hasUpper && hasLower ? 'text-emerald-700 font-bold' : 'text-gray-500'}`}>
                  <Check className="w-3.5 h-3.5" /> Maiúsculas e minúsculas
                </div>
                <div className={`flex items-center gap-1.5 ${hasNumber ? 'text-emerald-700 font-bold' : 'text-gray-500'}`}>
                  <Check className="w-3.5 h-3.5" /> Pelo menos um número
                </div>
                <div className={`flex items-center gap-1.5 ${hasSymbol ? 'text-emerald-700 font-bold' : 'text-gray-500'}`}>
                  <Check className="w-3.5 h-3.5" /> Pelo menos um símbolo
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-900 hover:bg-blue-950 text-white font-extrabold py-3 px-4 rounded-xl shadow-md transition flex items-center justify-center gap-2 text-xs disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    <span>Atualizar Senha</span>
                    <KeyRound className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* Success State */
            <div className="text-center space-y-5 animate-fadeIn">
              <div className="p-4 bg-emerald-100 text-emerald-900 rounded-full w-16 h-16 mx-auto flex items-center justify-center shadow-xs">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-lg font-black text-gray-900">Senha Alterada com Sucesso!</h3>
                <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                  Sua senha do Mercado Nusali foi redefinida com segurança. Por medida de proteção, todas as sessões anteriores em outros navegadores foram encerradas.
                </p>
              </div>

              <button
                type="button"
                onClick={() => navigate('/login')}
                className="w-full bg-gradient-to-r from-blue-900 via-indigo-900 to-emerald-900 text-white font-extrabold py-3 rounded-xl text-xs transition shadow-lg flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Fazer Login Novamente</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Security Assurance */}
          <div className="mt-8 pt-4 border-t border-gray-100 text-center text-xs text-gray-500 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Infraestrutura de Segurança Mercado Nusali</span>
          </div>
        </div>
      </div>
    </div>
  );
};
