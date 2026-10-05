import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Mail,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AuthService } from '../services/authService';
import { storageService } from '../services/storage/storageService';
import { AuthLogo } from '../components/AuthLogo';
import { PHONE_VERIFICATION_ENABLED } from '../config/constants';

export const VerifyEmailPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();

  // E-mail da verificação em andamento: vem SOMENTE do cadastro ou do login de conta pendente (sessionStorage da aba,
  // ver storageService). Nunca há e-mail "padrão": sem contexto a página não tenta verificar conta nenhuma.
  const [pending] = useState(() => storageService.getPendingEmailVerification());
  const targetEmail = pending?.email ?? null;

  // Mask email for privacy
  const maskEmail = (emailStr: string) => {
    const parts = emailStr.split('@');
    if (parts.length !== 2) return emailStr;
    const name = parts[0];
    const maskedName =
      name.length <= 3
        ? name[0] + '***'
        : name[0] + '***' + name[name.length - 1];
    return `${maskedName}@${parts[1]}`;
  };

  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Intervalo de reenvio de 60 s contado a partir do último envio conhecido (sobrevive ao reload). Sem envio conhecido
  // (chegou pelo login) o reenvio já fica liberado: o código antigo pode ter expirado.
  const remainingResendSeconds = (sentAt: number | null) => (sentAt ? Math.max(0, Math.ceil((60_000 - (Date.now() - sentAt)) / 1000)) : 0);
  const [timer, setTimer] = useState<number>(() => remainingResendSeconds(pending?.codeSentAt ?? null));
  const [canResend, setCanResend] = useState<boolean>(() => remainingResendSeconds(pending?.codeSentAt ?? null) === 0);

  const [loading, setLoading] = useState<boolean>(false);
  const [resending, setResending] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState<boolean>(false);
  // Usuário já logado e verificado que abre a página: mostra a tela de confirmado (user chega do /auth/me depois do 1º render).
  const showConfirmed = isVerified || user?.isEmailVerified === true;

  // Countdown timer effect
  useEffect(() => {
    if (timer > 0) {
      const interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setCanResend(true);
    }
  }, [timer]);

  // Handle PIN Digit Input
  const handleChangeDigit = (index: number, value: string) => {
    setErrorMessage(null);

    // Handle single character
    if (value.length <= 1) {
      const newDigits = [...digits];
      newDigits[index] = value;
      setDigits(newDigits);

      // Auto focus next
      if (value && index < 5) {
        inputRefs.current[index + 1]?.focus();
      }

      // Auto submit on last digit
      if (value && index === 5 && newDigits.every((d) => d !== '')) {
        handleVerifyCode(newDigits.join(''));
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').trim().replace(/\D/g, '');
    if (pasteData.length === 6) {
      const newDigits = pasteData.split('');
      setDigits(newDigits);
      inputRefs.current[5]?.focus();
      handleVerifyCode(pasteData);
    }
  };

  // Depois da verificação o servidor abriu a sessão (token + refresh em storage): navegação COMPLETA para o app
  // reinicializar o contexto de autenticação a partir do storage (uma navegação do router deixaria o cabeçalho
  // "deslogado" até o próximo reload).
  const goToApp = (path: string) => window.location.assign(path);

  const handleVerifyCode = async (codeToVerify?: string) => {
    const code = codeToVerify || digits.join('');
    if (code.length < 6) {
      setErrorMessage('Por favor, informe os 6 dígitos completos do código.');
      return;
    }

    if (!targetEmail) return;

    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await AuthService.verifyEmail({ code, email: targetEmail });
      if (!res.success) {
        throw new Error(res.error?.message || 'Código de e-mail inválido.');
      }

      // Conta que já estava verificada: o servidor não abre sessão (só um código válido faz isso).
      if ((res.data as any)?.alreadyVerified) {
        storageService.clearPendingEmailVerification();
        setSuccessMessage('Este e-mail já está verificado. Faça login para continuar.');
        setTimeout(() => navigate('/login'), 1500);
        return;
      }

      storageService.clearPendingEmailVerification();
      setIsVerified(true);
      const verifiedUser = res.data?.user || user;
      if (verifiedUser) {
        updateUser({ ...verifiedUser, isEmailVerified: true });
      }
      setSuccessMessage('E-mail verificado com sucesso! Redirecionando...');

      setTimeout(() => {
        if (PHONE_VERIFICATION_ENABLED) {
          goToApp('/verify-phone');
          return;
        }

        const userRole = (verifiedUser?.role || user?.role || 'BUYER').toUpperCase();
        if (userRole === 'SELLER') {
          goToApp('/seller/dashboard');
        } else if (userRole === 'ADMIN' || userRole === 'GLOBAL_ADMIN') {
          goToApp('/admin/dashboard');
        } else {
          goToApp('/');
        }
      }, 1200);
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.error?.message || err.message || 'Código inválido ou expirado.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!canResend || !targetEmail) return;
    setResending(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await AuthService.resendVerification('email', targetEmail);
      setSuccessMessage(res.data?.message || 'Novo código enviado com sucesso!');
      storageService.setPendingEmailVerification(targetEmail, Date.now());
      setTimer(60);
      setCanResend(false);
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.error?.message || err.message || 'Erro ao reenviar código.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-950 via-slate-900 to-gray-900 flex flex-col justify-center py-10 sm:py-14 px-4 sm:px-6 lg:px-8 animate-fadeIn">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link to="/" className="inline-block hover:opacity-90 transition">
          <AuthLogo />
        </Link>
        <h2 className="mt-6 text-2xl font-black text-white tracking-tight">
          Verificação de E-mail
        </h2>
        {targetEmail && !showConfirmed && (
          <p className="mt-1 text-xs text-blue-200">
            Enviamos um código de 6 dígitos para o e-mail cadastrado
          </p>
        )}
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 sm:px-10 shadow-2xl rounded-2xl border border-gray-100">
          {/* Target Email Banner */}
          {targetEmail && !showConfirmed && (
          <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl mb-6 text-center">
            <Mail className="w-6 h-6 text-blue-900 mx-auto mb-1" />
            <div className="text-xs text-gray-600 font-medium">Código enviado para:</div>
            <div className="font-mono font-bold text-sm text-blue-950 mt-0.5">
              {maskEmail(targetEmail ?? '')}
            </div>
          </div>
          )}

          {/* Messages */}
          {successMessage && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-3 text-emerald-900 text-xs font-medium animate-fadeIn">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>{successMessage}</div>
            </div>
          )}

          {errorMessage && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-center gap-3 text-red-900 text-xs font-medium animate-fadeIn">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
              <div>{errorMessage}</div>
            </div>
          )}

          {/* Estado: confirmado, sem verificação em andamento, ou digitação do código */}
          {showConfirmed ? (
            <div className="text-center space-y-4">
              <div className="p-4 bg-emerald-100 text-emerald-900 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-black text-gray-900">E-mail Confirmado!</h3>
              <p className="text-xs text-gray-600">
                Seu e-mail foi autenticado com sucesso na sua conta Mercado Nusali.
              </p>
              <button
                type="button"
                onClick={() => {
                  if (PHONE_VERIFICATION_ENABLED) {
                    goToApp('/verify-phone');
                  } else {
                    const userRole = (user?.role || 'BUYER').toUpperCase();
                    if (userRole === 'SELLER') {
                      goToApp('/seller/dashboard');
                    } else if (userRole === 'ADMIN' || userRole === 'GLOBAL_ADMIN') {
                      goToApp('/admin/dashboard');
                    } else {
                      goToApp('/');
                    }
                  }
                }}
                className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-3 rounded-xl text-xs transition cursor-pointer"
              >
                {PHONE_VERIFICATION_ENABLED ? 'Avançar para Verificação de Telefone' : 'Continuar para o Mercado Nusali'}
              </button>
            </div>
          ) : !targetEmail ? (
            <div className="text-center space-y-4" role="alert">
              <div className="p-4 bg-amber-100 text-amber-900 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-black text-gray-900">Nenhuma verificação em andamento</h3>
              <p className="text-xs text-gray-600">
                Não encontramos um cadastro aguardando confirmação neste navegador. Entre com seu e-mail e senha para
                continuar a verificação, ou crie uma conta.
              </p>
              <Link
                to="/login"
                className="block w-full bg-blue-900 hover:bg-blue-950 text-white font-extrabold py-3 px-4 rounded-xl shadow-md transition text-xs"
              >
                Ir para o login
              </Link>
              <Link to="/register" className="block text-xs font-bold text-blue-900 hover:text-blue-950 underline">
                Criar conta
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <label className="block text-center text-xs font-bold text-gray-700 mb-3">
                  Digite o código de 6 dígitos
                </label>
                <div className="flex justify-between gap-1.5 sm:gap-2">
                  {digits.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => { inputRefs.current[idx] = el; }}
                      type="text"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleChangeDigit(idx, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(idx, e)}
                      onPaste={handlePaste}
                      className="min-w-0 flex-1 max-w-11 h-12 text-center text-lg font-black font-mono border-2 border-gray-200 rounded-xl focus:border-blue-900 focus:ring-1 focus:ring-blue-900 focus:outline-hidden transition shadow-2xs"
                    />
                  ))}
                </div>
              </div>

              {/* Confirm Button */}
              <button
                type="button"
                onClick={() => handleVerifyCode()}
                disabled={loading || digits.some((d) => d === '')}
                className="w-full bg-blue-900 hover:bg-blue-950 text-white font-extrabold py-3 px-4 rounded-xl shadow-md transition flex items-center justify-center gap-2 text-xs disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    <span>Verificar Código</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              {/* Resend Timer */}
              <div className="text-center pt-2">
                {canResend ? (
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={resending}
                    className="text-xs font-extrabold text-blue-900 hover:text-blue-950 flex items-center justify-center gap-1.5 mx-auto underline cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${resending ? 'animate-spin' : ''}`} />
                    Reenviar código de verificação
                  </button>
                ) : (
                  <div className="text-xs text-gray-500 font-medium">
                    Reenviar novo código em <strong className="text-blue-900 font-mono">{timer}s</strong>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Support helper info */}
          {targetEmail && !showConfirmed && (
            <div className="mt-8 pt-4 border-t border-gray-100 text-center text-xs text-gray-500">
              Não recebeu o código? Verifique a caixa de spam ou lixo eletrônico.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
