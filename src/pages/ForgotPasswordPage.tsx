import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  KeyRound,
  Mail,
  Phone,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  ShieldCheck,
  Send,
} from 'lucide-react';
import { AuthService } from '../services/authService';
import { NusaliLogo } from '../components/NusaliLogo';

export const ForgotPasswordPage: React.FC = () => {
  const [identifier, setIdentifier] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(false);
  const [step, setStep] = useState<number>(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanId = identifier.trim();
    if (!cleanId) {
      setErrorMessage('Por favor, informe o e-mail de cadastro.');
      return;
    }

    setLoading(true);

    try {
      // Recuperação por e-mail. A resposta do servidor é sempre a mesma, exista a conta ou não.
      await AuthService.forgotPassword({ identifier: cleanId, method: 'email' });
      setStep(2);
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.error?.message || 'Não foi possível processar a solicitação agora. Tente novamente em instantes.'
      );
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
          Recuperação de Senha
        </h2>
        <p className="mt-1 text-xs text-blue-200">
          Enviaremos um link seguro para você redefinir sua senha
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 sm:px-10 shadow-2xl rounded-2xl border border-gray-100">
          {step === 1 ? (
            <form onSubmit={handleSubmit} className="space-y-5 text-xs">
              {/* Error Message */}
              {errorMessage && (
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-900 text-xs font-medium">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div>{errorMessage}</div>
                </div>
              )}

              {/* Método de envio: só e-mail por enquanto */}
              <div>
                <label className="block font-bold text-gray-700 mb-2">Método de envio</label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 rounded-xl border text-center font-bold flex items-center justify-center gap-2 border-blue-900 bg-blue-50 text-blue-950 shadow-2xs">
                    <Mail className="w-4 h-4" /> E-mail
                  </div>
                  <button
                    type="button"
                    disabled
                    aria-disabled="true"
                    title="Recuperação por SMS em breve"
                    className="p-3 rounded-xl border text-center font-bold flex items-center justify-center gap-2 border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed"
                  >
                    <Phone className="w-4 h-4" /> SMS <span className="text-[10px] font-black bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">Em breve</span>
                  </button>
                </div>
              </div>

              {/* E-mail */}
              <div>
                <label className="block font-bold text-gray-700 mb-1.5">Informe seu e-mail de cadastro *</label>
                <div className="relative rounded-xl shadow-2xs">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="ex: seu.email@exemplo.com"
                    className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-xl focus:border-blue-800 focus:outline-hidden text-xs text-gray-900"
                  />
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
                    <span>Enviar Instruções</span>
                    <Send className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="text-center pt-2">
                <Link
                  to="/login"
                  className="text-xs font-bold text-gray-600 hover:text-gray-900 inline-flex items-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Voltar para o Login
                </Link>
              </div>
            </form>
          ) : (
            /* Passo 2: confirmação genérica (não revela se a conta existe) */
            <div className="text-center space-y-5 animate-fadeIn">
              <div className="p-4 bg-emerald-100 text-emerald-900 rounded-full w-16 h-16 mx-auto flex items-center justify-center shadow-xs">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-lg font-black text-gray-900">Verifique seu e-mail</h3>
                <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                  Se existir uma conta com o e-mail <strong>{identifier.trim()}</strong>, enviamos um link para redefinir a senha. O link vale por 30 minutos e só pode ser usado uma vez.
                </p>
              </div>

              <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-left space-y-2 text-xs">
                <div className="font-bold text-blue-950 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-blue-800" /> Próximo passo:
                </div>
                <p className="text-blue-900 leading-snug">
                  Abra o e-mail e clique em "Criar nova senha". Confira também a caixa de spam. Se não chegar em 5 minutos, volte e solicite novamente.
                </p>
              </div>

              <div className="space-y-2 pt-2">
                <Link
                  to="/login"
                  className="w-full bg-blue-900 hover:bg-blue-950 text-white font-extrabold py-3 rounded-xl text-xs transition shadow-md flex items-center justify-center gap-2"
                >
                  <span>Voltar para o Login</span>
                </Link>

                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="w-full py-2.5 text-xs font-bold text-gray-600 hover:text-gray-900 cursor-pointer"
                >
                  Tentar outro e-mail
                </button>
              </div>
            </div>
          )}

          {/* Security Assurance */}
          <div className="mt-8 pt-4 border-t border-gray-100 text-center text-xs text-gray-500 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Mercado Nusali • Proteção de Privacidade do Usuário</span>
          </div>
        </div>
      </div>
    </div>
  );
};
