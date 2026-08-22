import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Phone,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Edit2,
  ArrowRight,
  ShieldCheck,
  Send,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AuthService } from '../services/authService';
import { NusaliLogo } from '../components/NusaliLogo';

export const VerifyPhonePage: React.FC = () => {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();

  const targetPhone = user?.phone || '+245 955 888 777';

  // Mask phone
  const maskPhone = (phoneStr: string) => {
    if (phoneStr.length <= 6) return phoneStr;
    const start = phoneStr.slice(0, 6);
    const end = phoneStr.slice(-2);
    return `${start} **** ${end}`;
  };

  const [channel, setChannel] = useState<'sms' | 'whatsapp'>('sms');
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [timer, setTimer] = useState<number>(60);
  const [canResend, setCanResend] = useState<boolean>(false);
  const [isEditingPhone, setIsEditingPhone] = useState<boolean>(false);
  const [newPhone, setNewPhone] = useState<string>(targetPhone);

  const [loading, setLoading] = useState<boolean>(false);
  const [resending, setResending] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState<boolean>(user?.isPhoneVerified || false);

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

  const handleChangeDigit = (index: number, value: string) => {
    setErrorMessage(null);
    if (value.length <= 1) {
      const newDigits = [...digits];
      newDigits[index] = value;
      setDigits(newDigits);

      if (value && index < 5) {
        inputRefs.current[index + 1]?.focus();
      }

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

  const handleVerifyCode = async (codeToVerify?: string) => {
    const code = codeToVerify || digits.join('');
    if (code.length < 6) {
      setErrorMessage('Por favor, informe os 6 dígitos do código recebido.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await AuthService.verifyPhone({ code, phone: targetPhone });
      if (!res.success) {
        throw new Error(res.error?.message || 'Código de telefone inválido.');
      }

      setIsVerified(true);
      if (user) {
        updateUser({ isPhoneVerified: true });
      }
      setSuccessMessage('Telefone verificado com sucesso!');
      setTimeout(() => navigate('/'), 1500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Código inválido.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!canResend) return;
    setResending(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await AuthService.resendVerification('phone');
      setSuccessMessage(res.data?.message || 'Novo código SMS enviado com sucesso!');
      setTimer(60);
      setCanResend(false);
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao reenviar SMS.');
    } finally {
      setResending(false);
    }
  };

  const handleSaveNewPhone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhone.trim()) {
      setErrorMessage('Informe um número de telefone válido.');
      return;
    }
    if (user) {
      updateUser({ phone: newPhone });
    }
    setIsEditingPhone(false);
    setSuccessMessage('Número atualizado. Um novo SMS foi enviado.');
    setTimer(60);
    setCanResend(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-950 via-slate-900 to-gray-900 flex flex-col justify-center py-10 sm:py-14 px-4 sm:px-6 lg:px-8 animate-fadeIn">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link to="/" className="inline-block hover:opacity-90 transition">
          <NusaliLogo variant="full" size="lg" />
        </Link>
        <h2 className="mt-6 text-2xl font-black text-white tracking-tight">
          Verificação de Telefone
        </h2>
        <p className="mt-1 text-xs text-blue-200">
          Enviamos um código SMS para confirmação de segurança de saques e entregas
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 sm:px-10 shadow-2xl rounded-2xl border border-gray-100">
          {/* Target Phone Banner */}
          <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl mb-6 text-center">
            <Phone className="w-6 h-6 text-emerald-800 mx-auto mb-1" />
            <div className="text-xs text-gray-600 font-medium">Código enviado para:</div>
            <div className="font-mono font-bold text-sm text-emerald-950 mt-0.5">
              {maskPhone(targetPhone)}
            </div>

            {!isEditingPhone ? (
              <button
                type="button"
                onClick={() => setIsEditingPhone(true)}
                className="mt-2 text-[11px] font-bold text-emerald-800 hover:text-emerald-950 flex items-center justify-center gap-1 mx-auto underline cursor-pointer"
              >
                <Edit2 className="w-3 h-3" /> Alterar telefone
              </button>
            ) : (
              <form onSubmit={handleSaveNewPhone} className="mt-3 space-y-2">
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full text-xs p-2 border border-gray-300 rounded-lg text-center font-mono"
                />
                <div className="flex gap-2 justify-center">
                  <button
                    type="submit"
                    className="px-3 py-1 bg-emerald-800 text-white font-bold text-[11px] rounded-md cursor-pointer"
                  >
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingPhone(false)}
                    className="px-3 py-1 bg-gray-200 text-gray-800 font-bold text-[11px] rounded-md cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Channel Selector */}
          <div className="flex bg-gray-100 p-1 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => setChannel('sms')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
                channel === 'sms' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" /> SMS
            </button>
            <button
              type="button"
              onClick={() => setChannel('whatsapp')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
                channel === 'whatsapp' ? 'bg-white text-emerald-800 shadow-xs' : 'text-gray-500'
              }`}
            >
              <Send className="w-3.5 h-3.5" /> WhatsApp <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1 rounded">Breve</span>
            </button>
          </div>

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

          {/* Verification Code Digits */}
          {!isVerified ? (
            <div className="space-y-6">
              <div>
                <label className="block text-center text-xs font-bold text-gray-700 mb-3">
                  Digite o código de 6 dígitos recebido por SMS
                </label>
                <div className="flex justify-between gap-2">
                  {digits.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => (inputRefs.current[idx] = el)}
                      type="text"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleChangeDigit(idx, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(idx, e)}
                      onPaste={handlePaste}
                      className="w-11 h-12 text-center text-lg font-black font-mono border-2 border-gray-200 rounded-xl focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700 focus:outline-hidden transition shadow-2xs"
                    />
                  ))}
                </div>
              </div>

              {/* Confirm Button */}
              <button
                type="button"
                onClick={() => handleVerifyCode()}
                disabled={loading || digits.some((d) => d === '')}
                className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold py-3 px-4 rounded-xl shadow-md transition flex items-center justify-center gap-2 text-xs disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    <span>Confirmar Telefone</span>
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
                    className="text-xs font-extrabold text-emerald-800 hover:text-emerald-950 flex items-center justify-center gap-1.5 mx-auto underline cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${resending ? 'animate-spin' : ''}`} />
                    Reenviar código SMS
                  </button>
                ) : (
                  <div className="text-xs text-gray-500 font-medium">
                    Reenviar novo código em <strong className="text-emerald-800 font-mono">{timer}s</strong>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center space-y-4">
              <div className="p-4 bg-emerald-100 text-emerald-900 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-black text-gray-900">Telefone Verificado!</h3>
              <p className="text-xs text-gray-600">
                Sua conta está totalmente ativa e pronta para compras e vendas com segurança.
              </p>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="w-full bg-blue-900 hover:bg-blue-950 text-white font-bold py-3 rounded-xl text-xs transition cursor-pointer"
              >
                Ir para a Página Inicial
              </button>
            </div>
          )}

          {/* Security assurance */}
          <div className="mt-8 pt-4 border-t border-gray-100 text-center text-xs text-gray-500 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Validação protegida pela infraestrutura Mercado Nusali</span>
          </div>
        </div>
      </div>
    </div>
  );
};
