import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  KeyRound,
  Mail,
  Phone,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Send,
} from 'lucide-react';
import { AuthService } from '../services/authService';
import { NusaliLogo } from '../components/NusaliLogo';

export const ForgotPasswordPage: React.FC = () => {
  const navigate = useNavigate();

  const [method, setMethod] = useState<'email' | 'sms'>('email');
  const [identifier, setIdentifier] = useState<string>('');
  const [phoneCode, setPhoneCode] = useState<string>('+245');

  const [loading, setLoading] = useState<boolean>(false);
  const [step, setStep] = useState<number>(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanId = identifier.trim();
    if (!cleanId) {
      setErrorMessage('Por favor, informe seu e-mail ou número de telefone.');
      return;
    }

    const fullTarget = method === 'sms' && !cleanId.startsWith('+') ? `${phoneCode} ${cleanId}` : cleanId;

    setLoading(true);

    try {
      await AuthService.forgotPassword({ identifier: fullTarget, method });
      setStep(2);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao processar solicitação.');
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
          Enviaremos instruções seguras para você redefinir sua senha
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

              {/* Method selector */}
              <div>
                <label className="block font-bold text-gray-700 mb-2">Escolha o método de envio</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMethod('email')}
                    className={`p-3 rounded-xl border text-center transition font-bold flex items-center justify-center gap-2 cursor-pointer ${
                      method === 'email'
                        ? 'border-blue-900 bg-blue-50 text-blue-950 shadow-2xs'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}
                  >
                    <Mail className="w-4 h-4" /> E-mail
                  </button>
                  <button
                    type="button"
                    onClick={() => setMethod('sms')}
                    className={`p-3 rounded-xl border text-center transition font-bold flex items-center justify-center gap-2 cursor-pointer ${
                      method === 'sms'
                        ? 'border-emerald-800 bg-emerald-50 text-emerald-950 shadow-2xs'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}
                  >
                    <Phone className="w-4 h-4" /> SMS / Celular
                  </button>
                </div>
              </div>

              {/* Identifier input */}
              <div>
                <label className="block font-bold text-gray-700 mb-1.5">
                  {method === 'email' ? 'Informe seu e-mail de cadastro *' : 'Informe seu número de telefone *'}
                </label>

                {method === 'email' ? (
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
                ) : (
                  <div className="flex gap-2">
                    <select
                      value={phoneCode}
                      onChange={(e) => setPhoneCode(e.target.value)}
                      className="bg-gray-50 border border-gray-300 text-gray-800 text-xs font-bold rounded-xl px-2.5 py-2.5 focus:border-blue-800 focus:outline-hidden"
                    >
                      <option value="+245">🇬🇼 +245</option>
                      <option value="+55">🇧🇷 +55</option>
                      <option value="+351">🇵🇹 +351</option>
                      <option value="+244">🇦🇴 +244</option>
                    </select>
                    <input
                      type="tel"
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="955 123 456"
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:border-blue-800 focus:outline-hidden text-xs text-gray-900 font-mono"
                    />
                  </div>
                )}
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
            /* Step 2 Confirmation Message (Does not leak if user exists) */
            <div className="text-center space-y-5 animate-fadeIn">
              <div className="p-4 bg-emerald-100 text-emerald-900 rounded-full w-16 h-16 mx-auto flex items-center justify-center shadow-xs">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-lg font-black text-gray-900">Instruções Enviadas!</h3>
                <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                  Se os dados informados estiverem cadastrados em nossa base, enviaremos as instruções de recuperação com o código de validação para <strong>{identifier}</strong>.
                </p>
              </div>

              <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-left space-y-2 text-xs">
                <div className="font-bold text-blue-950 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-blue-800" /> Próximo passo:
                </div>
                <p className="text-blue-900 leading-snug">
                  Verifique a caixa de entrada ou mensagens SMS e clique no link de redefinição ou insira seu código na tela seguinte.
                </p>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={() => navigate('/reset-password?code=123456')}
                  className="w-full bg-blue-900 hover:bg-blue-950 text-white font-extrabold py-3 rounded-xl text-xs transition shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Ir para Redefinição de Senha</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="w-full py-2.5 text-xs font-bold text-gray-600 hover:text-gray-900 cursor-pointer"
                >
                  Tentar outro e-mail ou telefone
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
